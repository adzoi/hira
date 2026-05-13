-- Automotive: root → mid categories → specializations (subcategories table).
-- Idempotent: safe to re-run; does not remove other category trees.

-- Root
INSERT INTO public.categories (name_en, name_ka, slug, sort_order, is_active, parent_id)
SELECT
  'Automotive',
  'ავტომობილური',
  'automotive',
  (SELECT COALESCE(MAX(c2.sort_order), 0) + 1 FROM public.categories c2),
  true,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = 'automotive');

-- Mid-level (groupings under Automotive)
INSERT INTO public.categories (name_en, name_ka, slug, sort_order, is_active, parent_id)
SELECT
  v.name_en,
  v.name_ka,
  v.slug,
  (SELECT COALESCE(MAX(c2.sort_order), 0) FROM public.categories c2) + v.ord,
  true,
  r.id
FROM public.categories r
CROSS JOIN (
  VALUES
    (1, 'Auto Services', 'ავტო სერვისები', 'automotive-auto-services'),
    (2, 'Driving Services', 'მართვა', 'automotive-driving-services')
) AS v(ord, name_en, name_ka, slug)
WHERE r.slug = 'automotive'
  AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = v.slug);

-- Specializations
INSERT INTO public.subcategories (category_id, name_en, name_ka, slug, is_active)
SELECT c.id, v.name_en, v.name_ka, v.slug, true
FROM (
  VALUES
    -- Auto Services
    ('automotive-auto-services', 'Auto Repair', 'Auto Repair', 'automotive-auto-services-auto-repair'),
    ('automotive-auto-services', 'Car Detailing', 'Car Detailing', 'automotive-auto-services-car-detailing'),
    ('automotive-auto-services', 'Mobile Mechanic', 'Mobile Mechanic', 'automotive-auto-services-mobile-mechanic'),
    ('automotive-auto-services', 'Car Inspection', 'Car Inspection', 'automotive-auto-services-car-inspection'),
    ('automotive-auto-services', 'Tire Services', 'Tire Services', 'automotive-auto-services-tire-services'),
    ('automotive-auto-services', 'Auto Electrical', 'Auto Electrical', 'automotive-auto-services-auto-electrical'),
    ('automotive-auto-services', 'Bodywork & Paint', 'Bodywork & Paint', 'automotive-auto-services-bodywork-paint'),
    -- Driving Services
    ('automotive-driving-services', 'Driver Services', 'Driver Services', 'automotive-driving-services-driver-services'),
    ('automotive-driving-services', 'Driving Lessons', 'Driving Lessons', 'automotive-driving-services-driving-lessons'),
    ('automotive-driving-services', 'Airport Transfers', 'Airport Transfers', 'automotive-driving-services-airport-transfers')
) AS v(parent_slug, name_en, name_ka, slug)
JOIN public.categories c ON c.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM public.subcategories s WHERE s.slug = v.slug);
