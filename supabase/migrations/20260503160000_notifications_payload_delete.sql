-- Rich payload on job-application notifications (modal UI) + hirer can delete own notifications.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.notifications.payload IS
  'Optional structured data; job_application type stores freelancer_slug, cover_note, stats, job ids.';

CREATE OR REPLACE FUNCTION public.notify_hirer_new_job_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hirer_uid uuid;
  job_title text;
  freelancer_display text;
  freelancer_slug_val text;
  avg_rating numeric;
  completed_ct integer;
  snapshot jsonb;
BEGIN
  SELECT j.title, hp.user_id
  INTO job_title, hirer_uid
  FROM public.jobs j
  INNER JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
  WHERE j.id = NEW.job_id;

  IF hirer_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.full_name, 'ფრილანსერი'), fp.slug, fp.average_rating, fp.completed_jobs_count
  INTO freelancer_display, freelancer_slug_val, avg_rating, completed_ct
  FROM public.freelancer_profiles fp
  LEFT JOIN public.profiles p ON p.id = fp.user_id
  WHERE fp.id = NEW.freelancer_profile_id;

  IF freelancer_display IS NULL THEN
    freelancer_display := 'ფრილანსერი';
  END IF;

  snapshot := jsonb_build_object(
    'job_application_id', NEW.id,
    'job_id', NEW.job_id,
    'job_title', COALESCE(job_title, 'სამუშაო'),
    'freelancer_slug', COALESCE(freelancer_slug_val, ''),
    'freelancer_name', freelancer_display,
    'cover_note', NEW.cover_note,
    'average_rating', COALESCE(avg_rating, 0),
    'completed_jobs_count', COALESCE(completed_ct, 0)
  );

  INSERT INTO public.notifications (user_id, title, body, link, type, is_read, payload)
  VALUES (
    hirer_uid,
    'ახალი განცხადება ✓',
    format('%s გამოგიგზავნათ განცხადება სამუშაოზე „%s“.', freelancer_display, COALESCE(job_title, 'სამუშაო')),
    '/job/' || NEW.job_id::text,
    'job_application',
    false,
    snapshot
  );

  RETURN NEW;
END;
$$;

GRANT DELETE ON TABLE public.notifications TO authenticated;

DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
CREATE POLICY "Users delete own notifications"
  ON public.notifications
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
