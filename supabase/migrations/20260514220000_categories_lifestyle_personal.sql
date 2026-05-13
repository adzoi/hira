-- Lifestyle & Personal: root → mid categories → specializations (subcategories table).
-- Idempotent: safe to re-run; does not remove other category trees.

-- Root
INSERT INTO public.categories (name_en, name_ka, slug, sort_order, is_active, parent_id)
SELECT
  'Lifestyle & Personal',
  'ლაიფსტაილი',
  'lifestyle-personal',
  (SELECT COALESCE(MAX(c2.sort_order), 0) + 1 FROM public.categories c2),
  true,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = 'lifestyle-personal');

-- Mid-level (groupings under Lifestyle & Personal)
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
    (1, 'Health & Fitness', 'ჯანმრთელობა', 'lifestyle-personal-health-fitness'),
    (2, 'Beauty Services', 'სილამაზე', 'lifestyle-personal-beauty-services'),
    (3, 'Life Coaching', 'ლაიფ კოუჩინგი', 'lifestyle-personal-life-coaching')
) AS v(ord, name_en, name_ka, slug)
WHERE r.slug = 'lifestyle-personal'
  AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = v.slug);

-- Specializations
INSERT INTO public.subcategories (category_id, name_en, name_ka, slug, is_active)
SELECT c.id, v.name_en, v.name_ka, v.slug, true
FROM (
  VALUES
    -- Health & Fitness
    ('lifestyle-personal-health-fitness', 'Personal Training', 'Personal Training', 'lifestyle-personal-health-fitness-personal-training'),
    ('lifestyle-personal-health-fitness', 'Yoga Instruction', 'Yoga Instruction', 'lifestyle-personal-health-fitness-yoga-instruction'),
    ('lifestyle-personal-health-fitness', 'Nutrition Planning', 'Nutrition Planning', 'lifestyle-personal-health-fitness-nutrition-planning'),
    ('lifestyle-personal-health-fitness', 'Meal Planning', 'Meal Planning', 'lifestyle-personal-health-fitness-meal-planning'),
    ('lifestyle-personal-health-fitness', 'Fitness Coaching (Online)', 'Fitness Coaching (Online)', 'lifestyle-personal-health-fitness-fitness-coaching-online'),
    -- Beauty Services
    ('lifestyle-personal-beauty-services', 'Makeup Artist', 'Makeup Artist', 'lifestyle-personal-beauty-services-makeup-artist'),
    ('lifestyle-personal-beauty-services', 'Hair Stylist', 'Hair Stylist', 'lifestyle-personal-beauty-services-hair-stylist'),
    ('lifestyle-personal-beauty-services', 'Nail Technician', 'Nail Technician', 'lifestyle-personal-beauty-services-nail-technician'),
    ('lifestyle-personal-beauty-services', 'Eyebrow/Lash Specialist', 'Eyebrow/Lash Specialist', 'lifestyle-personal-beauty-services-eyebrow-lash-specialist'),
    -- Life Coaching
    ('lifestyle-personal-life-coaching', 'Career Coaching', 'Career Coaching', 'lifestyle-personal-life-coaching-career-coaching'),
    ('lifestyle-personal-life-coaching', 'Life Coaching', 'Life Coaching', 'lifestyle-personal-life-coaching-life-coaching'),
    ('lifestyle-personal-life-coaching', 'Business Coaching', 'Business Coaching', 'lifestyle-personal-life-coaching-business-coaching'),
    ('lifestyle-personal-life-coaching', 'Relationship Coaching', 'Relationship Coaching', 'lifestyle-personal-life-coaching-relationship-coaching')
) AS v(parent_slug, name_en, name_ka, slug)
JOIN public.categories c ON c.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM public.subcategories s WHERE s.slug = v.slug);
