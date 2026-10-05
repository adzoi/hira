-- Anti-fraud: require chat activity before reviews, trust_flags table + weekly scan,
-- and immutable reviews (no content updates after insert).

-- ── 1. Conversation message gate for reviews ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.conversation_exchange_stats_before(
  p_conversation_id uuid,
  p_before timestamptz
)
RETURNS TABLE (message_count integer, distinct_senders integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::integer AS message_count,
    COUNT(DISTINCT m.sender_id)::integer AS distinct_senders
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.created_at <= p_before;
$$;

REVOKE ALL ON FUNCTION public.conversation_exchange_stats_before(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conversation_exchange_stats_before(uuid, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_requires_conversation_messages(
  p_completed_job_id uuid,
  p_service_inquiry_id uuid,
  p_min_messages integer DEFAULT 3
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id uuid;
  v_completion_at timestamptz;
  v_message_count integer;
  v_distinct_senders integer;
BEGIN
  IF p_completed_job_id IS NOT NULL AND p_service_inquiry_id IS NULL THEN
    SELECT
      conv.id,
      COALESCE(cj.completed_at, cj.created_at)
    INTO v_conversation_id, v_completion_at
    FROM public.completed_jobs cj
    INNER JOIN public.job_applications ja
      ON ja.job_id = cj.job_id
      AND ja.freelancer_profile_id = cj.freelancer_profile_id
    LEFT JOIN public.conversations conv ON conv.job_application_id = ja.id
    WHERE cj.id = p_completed_job_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Completed job not found for review validation';
    END IF;
  ELSIF p_service_inquiry_id IS NOT NULL AND p_completed_job_id IS NULL THEN
    SELECT
      conv.id,
      COALESCE(si.completed_at, si.updated_at, si.created_at)
    INTO v_conversation_id, v_completion_at
    FROM public.service_inquiries si
    LEFT JOIN public.conversations conv ON conv.service_inquiry_id = si.id
    WHERE si.id = p_service_inquiry_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Service inquiry not found for review validation';
    END IF;
  ELSE
    RETURN FALSE;
  END IF;

  IF v_conversation_id IS NULL THEN
    RAISE EXCEPTION
      'Review blocked: no conversation linked to this job application or listing inquiry';
  END IF;

  SELECT s.message_count, s.distinct_senders
  INTO v_message_count, v_distinct_senders
  FROM public.conversation_exchange_stats_before(v_conversation_id, v_completion_at) s;

  IF v_message_count < p_min_messages THEN
    RAISE EXCEPTION
      'Review blocked: at least % messages must be exchanged in chat before completion (found %)',
      p_min_messages, v_message_count;
  END IF;

  IF v_distinct_senders < 2 THEN
    RAISE EXCEPTION
      'Review blocked: chat must include messages from both parties before completion';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.review_requires_conversation_messages(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_requires_conversation_messages(uuid, uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_review_conversation_messages()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.review_requires_conversation_messages(
    NEW.completed_job_id,
    NEW.service_inquiry_id,
    3
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reviews_require_conversation_messages ON public.reviews;
CREATE TRIGGER reviews_require_conversation_messages
  BEFORE INSERT ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_review_conversation_messages();

COMMENT ON FUNCTION public.review_requires_conversation_messages(uuid, uuid, integer) IS
  'Ensures linked conversation has at least p_min_messages before completion and both parties participated.';

-- ── 2. trust_flags table + weekly detection ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trust_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  flag_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed boolean NOT NULL DEFAULT false,
  CONSTRAINT trust_flags_flag_type_check CHECK (
    flag_type IN (
      'burst_completions_24h',
      'high_mutual_pair_completions'
    )
  )
);

CREATE INDEX IF NOT EXISTS trust_flags_account_created_idx
  ON public.trust_flags (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS trust_flags_unreviewed_type_idx
  ON public.trust_flags (flag_type, reviewed)
  WHERE reviewed IS FALSE;

COMMENT ON TABLE public.trust_flags IS
  'Automated fraud/abuse signals for manual review. Populated weekly by run_trust_flag_detection().';

ALTER TABLE public.trust_flags ENABLE ROW LEVEL SECURITY;

-- No authenticated/anon policies: service role + SECURITY DEFINER jobs only for now.

CREATE OR REPLACE FUNCTION public.run_trust_flag_detection()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  -- Burst threshold: >5 completed_jobs in any rolling 24h window during the past 7 days.
  v_burst_threshold constant integer := 5;
  -- Pair anomaly: minimum mutual completions before statistical comparison.
  v_pair_min_count constant integer := 3;
  v_pair_z_threshold constant numeric := 2.0;
BEGIN
  -- ── Burst completions (per account, hirer or freelancer role) ───────────────
  WITH completions AS (
    SELECT hp.user_id AS account_id, cj.completed_at
    FROM public.completed_jobs cj
    INNER JOIN public.hirer_profiles hp ON hp.id = cj.hirer_profile_id
    WHERE cj.completed_at IS NOT NULL
      AND cj.completed_at >= now() - interval '7 days'
    UNION ALL
    SELECT fp.user_id, cj.completed_at
    FROM public.completed_jobs cj
    INNER JOIN public.freelancer_profiles fp ON fp.id = cj.freelancer_profile_id
    WHERE cj.completed_at IS NOT NULL
      AND cj.completed_at >= now() - interval '7 days'
  ),
  window_counts AS (
    SELECT
      c1.account_id,
      c1.completed_at AS window_end,
      COUNT(*)::integer AS completions_in_24h
    FROM completions c1
    INNER JOIN completions c2
      ON c2.account_id = c1.account_id
      AND c2.completed_at BETWEEN c1.completed_at - interval '24 hours' AND c1.completed_at
    GROUP BY c1.account_id, c1.completed_at
  ),
  burst_accounts AS (
    SELECT
      account_id,
      MAX(completions_in_24h)::integer AS max_completions_24h,
      MAX(window_end) AS sample_window_end
    FROM window_counts
    GROUP BY account_id
    HAVING MAX(completions_in_24h) > v_burst_threshold
  ),
  burst_inserts AS (
    INSERT INTO public.trust_flags (account_id, flag_type, details)
    SELECT
      b.account_id,
      'burst_completions_24h',
      jsonb_build_object(
        'max_completions_24h', b.max_completions_24h,
        'threshold', v_burst_threshold,
        'sample_window_end', b.sample_window_end,
        'scan_window_days', 7
      )
    FROM burst_accounts b
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.trust_flags tf
      WHERE tf.account_id = b.account_id
        AND tf.flag_type = 'burst_completions_24h'
        AND tf.reviewed IS FALSE
        AND tf.created_at >= now() - interval '7 days'
    )
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_inserted FROM burst_inserts;

  -- ── High mutual hirer/freelancer pair completions (z-score) ───────────────
  WITH pair_counts AS (
    SELECT
      hp.user_id AS hirer_user_id,
      fp.user_id AS freelancer_user_id,
      COUNT(*)::integer AS mutual_completed_jobs
    FROM public.completed_jobs cj
    INNER JOIN public.hirer_profiles hp ON hp.id = cj.hirer_profile_id
    INNER JOIN public.freelancer_profiles fp ON fp.id = cj.freelancer_profile_id
    GROUP BY hp.user_id, fp.user_id
  ),
  stats AS (
    SELECT
      AVG(mutual_completed_jobs)::numeric AS mean_count,
      STDDEV_POP(mutual_completed_jobs)::numeric AS stddev_count,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY mutual_completed_jobs) AS p95_count
    FROM pair_counts
    WHERE mutual_completed_jobs >= 2
  ),
  anomalous_pairs AS (
    SELECT
      pc.hirer_user_id,
      pc.freelancer_user_id,
      pc.mutual_completed_jobs,
      s.mean_count,
      s.stddev_count,
      s.p95_count,
      CASE
        WHEN s.stddev_count IS NULL OR s.stddev_count = 0 THEN
          CASE
            WHEN pc.mutual_completed_jobs >= GREATEST(v_pair_min_count, CEIL(s.p95_count)::integer)
              THEN pc.mutual_completed_jobs::numeric
            ELSE NULL
          END
        ELSE (pc.mutual_completed_jobs - s.mean_count) / s.stddev_count
      END AS z_score
    FROM pair_counts pc
    CROSS JOIN stats s
    WHERE pc.mutual_completed_jobs >= v_pair_min_count
  ),
  flagged_pairs AS (
    SELECT *
    FROM anomalous_pairs
    WHERE z_score IS NOT NULL
      AND (
        (stddev_count IS NOT NULL AND stddev_count > 0 AND z_score >= v_pair_z_threshold)
        OR (stddev_count IS NULL OR stddev_count = 0)
      )
  ),
  pair_inserts AS (
    INSERT INTO public.trust_flags (account_id, flag_type, details)
    SELECT
      x.account_id,
      'high_mutual_pair_completions',
      x.details
    FROM (
      SELECT
        fp.hirer_user_id AS account_id,
        jsonb_build_object(
          'role', 'hirer',
          'counterparty_id', fp.freelancer_user_id,
          'mutual_completed_jobs', fp.mutual_completed_jobs,
          'platform_mean', fp.mean_count,
          'platform_stddev', fp.stddev_count,
          'platform_p95', fp.p95_count,
          'z_score', fp.z_score,
          'min_pair_count', v_pair_min_count,
          'z_threshold', v_pair_z_threshold
        ) AS details
      FROM flagged_pairs fp
      UNION ALL
      SELECT
        fp.freelancer_user_id,
        jsonb_build_object(
          'role', 'freelancer',
          'counterparty_id', fp.hirer_user_id,
          'mutual_completed_jobs', fp.mutual_completed_jobs,
          'platform_mean', fp.mean_count,
          'platform_stddev', fp.stddev_count,
          'platform_p95', fp.p95_count,
          'z_score', fp.z_score,
          'min_pair_count', v_pair_min_count,
          'z_threshold', v_pair_z_threshold
        )
      FROM flagged_pairs fp
    ) x
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.trust_flags tf
      WHERE tf.account_id = x.account_id
        AND tf.flag_type = 'high_mutual_pair_completions'
        AND tf.reviewed IS FALSE
        AND (tf.details->>'counterparty_id')::uuid = (x.details->>'counterparty_id')::uuid
        AND tf.created_at >= now() - interval '7 days'
    )
    RETURNING 1
  )
  SELECT v_inserted + COUNT(*)::integer INTO v_inserted FROM pair_inserts;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.run_trust_flag_detection() FROM PUBLIC;

COMMENT ON FUNCTION public.run_trust_flag_detection() IS
  'Weekly fraud scan: flags burst completions (>5 in 24h) and anomalous hirer/freelancer pairs (z >= 2).';

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO v_job_id
    FROM cron.job
    WHERE jobname = 'trust-flag-detection-weekly';

    IF v_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_id);
    END IF;

    PERFORM cron.schedule(
      'trust-flag-detection-weekly',
      '0 4 * * 0',
      'SELECT public.run_trust_flag_detection();'
    );
  END IF;
EXCEPTION
  WHEN undefined_table OR undefined_function OR invalid_schema_name THEN
    RAISE NOTICE 'pg_cron unavailable; schedule run_trust_flag_detection() manually or enable pg_cron';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule trust-flag-detection-weekly: %', SQLERRM;
END $$;

-- ── 3. Immutable reviews ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS reviews_update ON public.reviews;

REVOKE UPDATE ON public.reviews FROM anon, authenticated;

COMMENT ON TABLE public.reviews IS
  'Immutable after insert: rating and text cannot be updated by clients (UPDATE revoked).';
