# Supabase RLS audit

Generated: 2026-06-01. Source: live project policies (`pg_policies`), table RLS flags, and `src/` table/RPC usage cross-check. Anon-key probe confirmed profile email exposure.

## Summary

| Severity | Count | Action |
|----------|-------|--------|
| ❌ Clear issues | 6 tables | Fixed in `20260601120000_harden_rls_policies.sql` |
| ⚠️ Review | see per-table notes | Manual review; not auto-fixed |

All 27 public tables have RLS enabled.

---

## categories

- RLS enabled: yes
- Policies:
  - SELECT: categories_select (public); USING (true) ✅
  - INSERT: none ✅
  - UPDATE: none ✅
  - DELETE: none ✅
- Issues found: none
- Recommended fix: none

## completed_jobs

- RLS enabled: yes
- Policies:
  - SELECT: Hirers select completed_jobs for own jobs (authenticated); scoped expression | cj_select (public); scoped expression | cj_select_participants (authenticated); scoped expression | cj_select_public_completed_for_is_public_fps (anon,authenticated); scoped expression ✅
  - INSERT: Hirers insert completed_jobs for own jobs (authenticated); WITH CHECK (scoped) | cj_insert_hirer (authenticated); WITH CHECK (scoped) ✅
  - UPDATE: cj_update (public); scoped expression ✅
  - DELETE: none ✅
- Issues found: none
- Recommended fix: none

## conversation_reads

- RLS enabled: yes
- Policies:
  - SELECT: Participants select conversation reads (authenticated); scoped expression ✅
  - INSERT: Users insert own conversation reads (authenticated); WITH CHECK (scoped) ✅
  - UPDATE: Users update own conversation reads (authenticated); scoped expression; WITH CHECK (scoped) ✅
  - DELETE: none ✅
- Issues found: none
- Recommended fix: none

## conversations

- RLS enabled: yes
- Policies:
  - SELECT: Participants select conversations (authenticated); scoped expression ✅
  - INSERT: none (default deny or RPC-only) ✅
  - UPDATE: none ✅
  - DELETE: none (default deny) ✅
- Issues found: none
- Recommended fix: none

## experience

- RLS enabled: yes
- Policies:
  - SELECT: exp_select (public); USING (true) ❌
  - INSERT: exp_insert (public); WITH CHECK (scoped) ✅
  - UPDATE: exp_update (public); scoped expression ✅
  - DELETE: exp_delete (public); scoped expression ✅
- Issues found: Policy `exp_select` uses USING (true), exposing experience rows for private freelancer profiles.
- Recommended fix: Replace exp_select with is_public-or-owner scoped SELECT.

## follows

- RLS enabled: yes
- Policies:
  - SELECT: users can see all follows (public); USING (true) ⚠️
  - INSERT: users can follow others (public); WITH CHECK (scoped) ✅
  - UPDATE: none ✅
  - DELETE: users can unfollow (public); scoped expression ✅
- Issues found: see ⚠️ policies above — worth manual review
- Recommended fix: none

## freelancer_education

- RLS enabled: yes
- Policies:
  - SELECT: fe_select_public_or_own (public); scoped expression | freelancer_education_select_public_or_owner (public); scoped expression ✅
  - INSERT: fe_insert_own (authenticated); WITH CHECK (scoped) | freelancer_education_insert_own (public); WITH CHECK (scoped) ✅
  - UPDATE: fe_update_own (authenticated); scoped expression; WITH CHECK (scoped) | freelancer_education_update_own (public); scoped expression ✅
  - DELETE: fe_delete_own (authenticated); scoped expression | freelancer_education_delete_own (public); scoped expression ✅
- Issues found: none
- Recommended fix: none

## freelancer_profiles

- RLS enabled: yes
- Policies:
  - SELECT: fp_select_public (public); scoped expression ✅
  - INSERT: fp_insert_own (public); WITH CHECK (scoped) ✅
  - UPDATE: fp_update_own (public); scoped expression ✅
  - DELETE: fp_delete_own (public); scoped expression ✅
- Issues found: none
- Recommended fix: none

## freelancer_skills

- RLS enabled: yes
- Policies:
  - SELECT: fs_select_public (public); USING (true) ❌
  - INSERT: fs_insert_own (public); WITH CHECK (scoped) ✅
  - UPDATE: none ✅
  - DELETE: fs_delete_own (public); scoped expression ✅
- Issues found: Policy `fs_select_public` uses USING (true), exposing skill mappings for private (is_public = false) freelancer profiles.
- Recommended fix: Replace fs_select_public with is_public-or-owner scoped SELECT.

## hirer_profiles

- RLS enabled: yes
- Policies:
  - SELECT: hp_select_public (public); USING (true) ✅
  - INSERT: hp_insert_own (public); WITH CHECK (scoped) ✅
  - UPDATE: hp_update_own (public); scoped expression ✅
  - DELETE: hp_delete_own (public); scoped expression ✅
- Issues found: none
- Recommended fix: none

## job_applications

- RLS enabled: yes
- Policies:
  - SELECT: ja_select (public); scoped expression | ja_select_hirer (authenticated); scoped expression ✅
  - INSERT: ja_insert (public); WITH CHECK (scoped) ✅
  - UPDATE: Hirers manage applications on own jobs (authenticated); scoped expression; WITH CHECK (scoped) | ja_update (public); scoped expression | ja_update_hirer (authenticated); scoped expression; WITH CHECK (scoped) ⚠️
  - DELETE: none ✅
- Issues found: see ⚠️ policies above — worth manual review
- Recommended fix: none

## job_skills

- RLS enabled: yes
- Policies:
  - SELECT: job_skills_select (public); USING (true) ✅
  - INSERT: job_skills_insert (public); WITH CHECK (scoped) ✅
  - UPDATE: none ✅
  - DELETE: none (default deny) ✅
- Issues found: none
- Recommended fix: none

## jobs

- RLS enabled: yes
- Policies:
  - SELECT: jobs_select (public); scoped expression ✅
  - INSERT: jobs_insert_hirer (public); WITH CHECK (scoped) ✅
  - UPDATE: Hirers update own jobs (authenticated); scoped expression; WITH CHECK (scoped) | jobs_update_own (public); scoped expression ✅
  - DELETE: jobs_delete_own (public); scoped expression ✅
- Issues found: none
- Recommended fix: none

## messages

- RLS enabled: yes
- Policies:
  - SELECT: Participants select messages (authenticated); scoped expression ✅
  - INSERT: Participants insert messages (authenticated); WITH CHECK (scoped) ✅
  - UPDATE: none ✅
  - DELETE: none (default deny) ✅
- Issues found: none
- Recommended fix: none

## notifications

- RLS enabled: yes
- Policies:
  - SELECT: Users read own notifications (authenticated); scoped expression | notif_select (public); scoped expression ✅
  - INSERT: notif_insert_own (authenticated); WITH CHECK (scoped) ⚠️
  - UPDATE: Users update own notifications (authenticated); scoped expression; WITH CHECK (scoped) | notif_update (public); scoped expression ✅
  - DELETE: Users delete own notifications (authenticated); scoped expression | notif_delete (public); scoped expression ✅
- Issues found: see ⚠️ policies above — worth manual review
- Recommended fix: none

## portfolio_items

- RLS enabled: yes
- Policies:
  - SELECT: portfolio_select (public); USING (true) ❌
  - INSERT: portfolio_insert (public); WITH CHECK (scoped) ✅
  - UPDATE: portfolio_update (public); scoped expression ✅
  - DELETE: portfolio_delete (public); scoped expression ✅
- Issues found: Policy `portfolio_select` uses USING (true), exposing portfolio rows for private freelancer profiles.
- Recommended fix: Replace portfolio_select with is_public-or-owner scoped SELECT.

## profile_visits

- RLS enabled: yes
- Policies:
  - SELECT: Owners can select visits to their profiles (authenticated); scoped expression | authenticated_profile_visits_select_own_profiles (authenticated); scoped expression ✅
  - INSERT: Valid profile visit insert (anon,authenticated); WITH CHECK (scoped) | profile_visits_insert (public); WITH CHECK (scoped) ❌
  - UPDATE: none ✅
  - DELETE: none ✅
- Issues found: Legacy policy `profile_visits_insert` only checks profile id is set (WITH CHECK true-equivalent), bypassing visitor identity binding enforced by `Valid profile visit insert` because permissive INSERT policies are OR-combined.
- Recommended fix: DROP POLICY profile_visits_insert ON public.profile_visits;

## profiles

- RLS enabled: yes
- Policies:
  - SELECT: profiles_select_public (public); USING (true) ❌
  - INSERT: none ✅
  - UPDATE: profiles_update_own (public); scoped expression ✅
  - DELETE: none ✅
- Issues found: SELECT policy `profiles_select_public` uses USING (true), exposing email, phone, and cv_url to all roles including anon (verified via live anon key probe).
- Recommended fix: -- See migration: column REVOKE for anon + replace directory SELECT policy

## reports

- RLS enabled: yes
- Policies:
  - SELECT: none (default deny) ✅
  - INSERT: reports_insert (public); WITH CHECK (scoped) ✅
  - UPDATE: none ✅
  - DELETE: none (default deny) ✅
- Issues found: none
- Recommended fix: none

## reviews

- RLS enabled: yes
- Policies:
  - SELECT: Public read reviews for profile pages (anon,authenticated); scoped expression | Users read relevant reviews (authenticated); scoped expression ✅
  - INSERT: Users insert own reviews (job or listing participant) (authenticated); WITH CHECK (scoped) | reviews_insert_own_secure (authenticated); WITH CHECK (scoped) ✅
  - UPDATE: reviews_update (public); scoped expression ✅
  - DELETE: none (default deny) ✅
- Issues found: none
- Recommended fix: none

## service_inquiries

- RLS enabled: yes
- Policies:
  - SELECT: si_freelancer_select_own (authenticated); scoped expression | si_hirer_select_own (authenticated); scoped expression | si_select_freelancer (public); scoped expression | si_select_hirer (public); scoped expression ✅
  - INSERT: si_hirer_insert_own (authenticated); WITH CHECK (scoped) ✅
  - UPDATE: si_freelancer_update_own (authenticated); scoped expression; WITH CHECK (scoped) | si_hirer_update_own (authenticated); scoped expression; WITH CHECK (scoped) | si_update_freelancer (public); scoped expression | si_update_hirer (public); scoped expression ✅
  - DELETE: none ✅
- Issues found: none
- Recommended fix: none

## services

- RLS enabled: yes
- Policies:
  - SELECT: services_select (public); scoped expression ✅
  - INSERT: services_insert (public); WITH CHECK (scoped) ✅
  - UPDATE: services_update (public); scoped expression ✅
  - DELETE: services_delete (public); scoped expression ✅
- Issues found: none
- Recommended fix: none

## skills

- RLS enabled: yes
- Policies:
  - SELECT: skills_select (public); scoped expression | skills_select_public (public); USING (true) ❌
  - INSERT: none ✅
  - UPDATE: none ✅
  - DELETE: none ✅
- Issues found: Duplicate policy `skills_select_public` uses USING (true), overriding the is_approved filter from `skills_select` for any caller that matches either policy.
- Recommended fix: DROP POLICY skills_select_public ON public.skills;

## subcategories

- RLS enabled: yes
- Policies:
  - SELECT: subcategories_select (public); USING (true) ✅
  - INSERT: none ✅
  - UPDATE: none ✅
  - DELETE: none ✅
- Issues found: none
- Recommended fix: none

## user_cvs

- RLS enabled: yes
- Policies:
  - SELECT: Public can view public CVs (public); scoped expression | Users can view own CV (authenticated); scoped expression ✅
  - INSERT: Users can create own CV (authenticated); WITH CHECK (scoped) ✅
  - UPDATE: Users can update own CV (authenticated); scoped expression; WITH CHECK (scoped) ✅
  - DELETE: none ✅
- Issues found: none
- Recommended fix: none

## user_saved_items

- RLS enabled: yes
- Policies:
  - SELECT: user_saved_items_select_own (authenticated); scoped expression ✅
  - INSERT: user_saved_items_insert_own (authenticated); WITH CHECK (scoped) ✅
  - UPDATE: none ✅
  - DELETE: user_saved_items_delete_own (authenticated); scoped expression ✅
- Issues found: none
- Recommended fix: none

## vip_payments

- RLS enabled: yes
- Policies:
  - SELECT: Users can view own payments (public); scoped expression | Users read own vip_payments (authenticated); scoped expression ✅
  - INSERT: none (default deny or RPC-only) ✅
  - UPDATE: none ✅
  - DELETE: none ✅
- Issues found: none
- Recommended fix: none

## Storage (referenced from src/ via supabase.storage)

Buckets: `avatars`, `cvs`, `job-images`, `service-images`.

### storage.objects

- RLS enabled: yes (Supabase default on storage.objects)
- Policies:
  - SELECT: Public read on avatars, job-images, service-images; owner-only read on cvs ✅
  - INSERT: Owner-scoped for cvs/job-images/service-images; **⚠️** legacy `Users can upload their own avatar` only checks bucket_id (no folder owner) — **❌** fixed in migration by dropping it
  - UPDATE: Owner-scoped per bucket ✅
  - DELETE: Owner-scoped per bucket (duplicate legacy + hardened policies coexist) ⚠️
- Issues found: Legacy avatar INSERT policy allows any authenticated user to upload into any avatars path if combined permissively with stricter policies.
- Recommended fix: DROP POLICY "Users can upload their own avatar" ON storage.objects;

---

## RPCs used from src/ (not table RLS)

| RPC | Auth | Notes |
|-----|------|-------|
| get_or_create_conversation | authenticated | SECURITY DEFINER; verifies job/inquiry participation ✅ |
| get_chat_inbox_message_stats | authenticated | Participant-scoped ✅ |
| send_status_notification | authenticated | SECURITY DEFINER; no direct notification INSERT ✅ |
| increment_job_views / increment_service_views | authenticated | SECURITY DEFINER; anon revoked ✅ |
| get_job_hirer_contact_for_applicant | authenticated | SECURITY DEFINER; applicant/owner only ✅ |
| delete_user | authenticated | SECURITY DEFINER; self only ✅ |
| count_distinct_hirer_visitors_to_freelancer | authenticated | SECURITY DEFINER ✅ |
| public_freelancer_completed_service_titles | varies | Public read helper ✅ |

Edge Functions (`get-home-feed`, `get-jobs-page`, `get-listings-page`) use service role server-side — not client RLS.

---

## ⚠️ Items left for manual review

1. **job_applications UPDATE** — `ja_update` lets freelancers update their own applications (intended for withdraw/edit cover note?) alongside hirer accept/reject; confirm status transitions are constrained in app layer.
2. **follows SELECT USING (true)** — all follow edges are public; acceptable for follower counts but reveals social graph.
3. **Duplicate policies** on several tables (legacy + migration-named duplicates); consolidate when convenient — behavior is redundant, not permissive.
4. **notifications notif_insert_own** — INSERT grant already revoked; policy is dead but could be dropped for clarity.
5. **profiles authenticated contact fields** — after hardening, authenticated users can still read email/phone for public freelancer + hirer directory rows (needed by contact UI); consider RPC gating later.
6. **GRANT ALL on tables for anon/authenticated** — Supabase default; RLS is the boundary. Column revokes applied for profile PII to anon only.
