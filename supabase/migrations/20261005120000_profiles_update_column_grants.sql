-- Restrict which profile columns users can edit on their own row.
-- Previously `GRANT UPDATE ON public.profiles TO anon, authenticated` let any user set
-- is_verified, user_type, email, is_active, member_since, etc. on themselves.
-- Columns below are the only ones the app writes from the browser
-- (Profile, Register, Onboarding, FreelancerProfile CV upload, Navbar unread reset).
-- SECURITY DEFINER triggers/RPCs (unread counters, handle_new_user) are unaffected.

REVOKE UPDATE ON public.profiles FROM anon, authenticated;

GRANT UPDATE (
  full_name,
  city,
  phone,
  avatar_url,
  cv_url,
  unread_notifications_count
) ON public.profiles TO authenticated;
