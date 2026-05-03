-- When a freelancer submits a job application, add an in-app notification for the hirer (navbar bell).

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
BEGIN
  SELECT j.title, hp.user_id
  INTO job_title, hirer_uid
  FROM public.jobs j
  INNER JOIN public.hirer_profiles hp ON hp.id = j.hirer_profile_id
  WHERE j.id = NEW.job_id;

  IF hirer_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.full_name, 'ფრილანსერი')
  INTO freelancer_display
  FROM public.freelancer_profiles fp
  LEFT JOIN public.profiles p ON p.id = fp.user_id
  WHERE fp.id = NEW.freelancer_profile_id;

  IF freelancer_display IS NULL THEN
    freelancer_display := 'ფრილანსერი';
  END IF;

  INSERT INTO public.notifications (user_id, title, body, link, type, is_read)
  VALUES (
    hirer_uid,
    'ახალი განცხადება ✓',
    format('%s გამოგიგზავნათ განცხადება სამუშაოზე „%s“.', freelancer_display, COALESCE(job_title, 'სამუშაო')),
    '/job/' || NEW.job_id::text,
    'job_application',
    false
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_hirer_new_job_application() FROM PUBLIC;

DROP TRIGGER IF EXISTS job_application_notify_hirer ON public.job_applications;

CREATE TRIGGER job_application_notify_hirer
  AFTER INSERT ON public.job_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_hirer_new_job_application();

COMMENT ON FUNCTION public.notify_hirer_new_job_application() IS
  'Creates a notifications row for the job hirer when a freelancer applies (SECURITY DEFINER).';
