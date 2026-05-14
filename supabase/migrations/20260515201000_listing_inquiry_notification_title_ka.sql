-- Align stored title with in-app copy (listing inquiry → freelancer).
UPDATE public.notifications
SET title = 'ახალი შეტყობინება'
WHERE title = 'ახალი ინქირი';
