-- Notify hirer when freelancer accepts/rejects a listing offer.

CREATE OR REPLACE FUNCTION public.notify_hirer_listing_offer_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hirer_uid uuid;
  freelancer_name text;
  service_title text;
  notif_title text;
  notif_body text;
BEGIN
  -- Only react to status transitions we care about.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('accepted', 'declined') THEN
    RETURN NEW;
  END IF;

  SELECT hp.user_id
  INTO hirer_uid
  FROM public.hirer_profiles hp
  WHERE hp.id = NEW.hirer_profile_id;

  IF hirer_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.full_name, 'ფრილანსერი')
  INTO freelancer_name
  FROM public.freelancer_profiles fp
  LEFT JOIN public.profiles p ON p.id = fp.user_id
  WHERE fp.id = NEW.freelancer_profile_id;

  SELECT COALESCE(s.title, 'ლისტინგი')
  INTO service_title
  FROM public.services s
  WHERE s.id = NEW.service_id;

  IF NEW.status = 'accepted' THEN
    notif_title := 'შეთავაზება მიღებულია';
    notif_body := format('%s-მ მიიღო შეთავაზება ლისტინგზე „%s“.', freelancer_name, service_title);
  ELSE
    notif_title := 'შეთავაზება უარყოფილია';
    notif_body := format('%s-მ უარყო შეთავაზება ლისტინგზე „%s“.', freelancer_name, service_title);
  END IF;

  INSERT INTO public.notifications (user_id, title, body, link, type, is_read, payload)
  VALUES (
    hirer_uid,
    notif_title,
    notif_body,
    '/dashboard',
    'listing_inquiry_status',
    false,
    jsonb_build_object(
      'service_inquiry_id', NEW.id,
      'service_id', NEW.service_id,
      'status', NEW.status,
      'service_title', service_title,
      'freelancer_profile_id', NEW.freelancer_profile_id
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_hirer_listing_offer_status() FROM PUBLIC;

DROP TRIGGER IF EXISTS service_inquiry_notify_hirer_status ON public.service_inquiries;
CREATE TRIGGER service_inquiry_notify_hirer_status
  AFTER UPDATE OF status ON public.service_inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_hirer_listing_offer_status();
