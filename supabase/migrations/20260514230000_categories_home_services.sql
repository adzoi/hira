-- Home Services: root → mid categories → specializations (subcategories table).
-- Idempotent: safe to re-run; does not remove other category trees.

-- Root
INSERT INTO public.categories (name_en, name_ka, slug, sort_order, is_active, parent_id)
SELECT
  'Home Services',
  'სახლის სერვისები',
  'home-services',
  (SELECT COALESCE(MAX(c2.sort_order), 0) + 1 FROM public.categories c2),
  true,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = 'home-services');

-- Mid-level (groupings under Home Services)
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
    (1, 'Childcare', 'ბავშვის მოვლა', 'home-services-childcare'),
    (2, 'Elderly Care', 'ხანდაზმულთა მოვლა', 'home-services-elderly-care'),
    (3, 'Pet Services', 'ცხოველების მოვლა', 'home-services-pet-services'),
    (4, 'Cleaning', 'დასუფთავება', 'home-services-cleaning'),
    (5, 'Home Repair & Maintenance', 'შეკეთება', 'home-services-home-repair-maintenance'),
    (6, 'Moving & Delivery', 'გადატანა', 'home-services-moving-delivery')
) AS v(ord, name_en, name_ka, slug)
WHERE r.slug = 'home-services'
  AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = v.slug);

-- Specializations
INSERT INTO public.subcategories (category_id, name_en, name_ka, slug, is_active)
SELECT c.id, v.name_en, v.name_ka, v.slug, true
FROM (
  VALUES
    -- Childcare
    ('home-services-childcare', 'Nanny Services', 'Nanny Services', 'home-services-childcare-nanny-services'),
    ('home-services-childcare', 'Babysitting', 'Babysitting', 'home-services-childcare-babysitting'),
    ('home-services-childcare', 'After-school Care', 'After-school Care', 'home-services-childcare-after-school-care'),
    ('home-services-childcare', 'Homework Help', 'Homework Help', 'home-services-childcare-homework-help'),
    -- Elderly Care
    ('home-services-elderly-care', 'Elderly Companion', 'Elderly Companion', 'home-services-elderly-care-elderly-companion'),
    ('home-services-elderly-care', 'Home Care Assistant', 'Home Care Assistant', 'home-services-elderly-care-home-care-assistant'),
    ('home-services-elderly-care', 'Nursing Care', 'Nursing Care', 'home-services-elderly-care-nursing-care'),
    ('home-services-elderly-care', 'Dementia Care', 'Dementia Care', 'home-services-elderly-care-dementia-care'),
    -- Pet Services
    ('home-services-pet-services', 'Pet Sitting', 'Pet Sitting', 'home-services-pet-services-pet-sitting'),
    ('home-services-pet-services', 'Dog Walking', 'Dog Walking', 'home-services-pet-services-dog-walking'),
    ('home-services-pet-services', 'Pet Grooming', 'Pet Grooming', 'home-services-pet-services-pet-grooming'),
    ('home-services-pet-services', 'Pet Training', 'Pet Training', 'home-services-pet-services-pet-training'),
    ('home-services-pet-services', 'Veterinary Consultation (Online)', 'Veterinary Consultation (Online)', 'home-services-pet-services-veterinary-consultation-online'),
    -- Cleaning
    ('home-services-cleaning', 'House Cleaning', 'House Cleaning', 'home-services-cleaning-house-cleaning'),
    ('home-services-cleaning', 'Office Cleaning', 'Office Cleaning', 'home-services-cleaning-office-cleaning'),
    ('home-services-cleaning', 'Deep Cleaning', 'Deep Cleaning', 'home-services-cleaning-deep-cleaning'),
    ('home-services-cleaning', 'Move-in/Move-out Cleaning', 'Move-in/Move-out Cleaning', 'home-services-cleaning-move-in-move-out-cleaning'),
    ('home-services-cleaning', 'Window Cleaning', 'Window Cleaning', 'home-services-cleaning-window-cleaning'),
    -- Home Repair & Maintenance
    ('home-services-home-repair-maintenance', 'Plumbing', 'Plumbing', 'home-services-home-repair-maintenance-plumbing'),
    ('home-services-home-repair-maintenance', 'Electrical Work', 'Electrical Work', 'home-services-home-repair-maintenance-electrical-work'),
    ('home-services-home-repair-maintenance', 'Carpentry', 'Carpentry', 'home-services-home-repair-maintenance-carpentry'),
    ('home-services-home-repair-maintenance', 'Painting', 'Painting', 'home-services-home-repair-maintenance-painting'),
    ('home-services-home-repair-maintenance', 'General Handyman', 'General Handyman', 'home-services-home-repair-maintenance-general-handyman'),
    ('home-services-home-repair-maintenance', 'Appliance Repair', 'Appliance Repair', 'home-services-home-repair-maintenance-appliance-repair'),
    ('home-services-home-repair-maintenance', 'HVAC Repair', 'HVAC Repair', 'home-services-home-repair-maintenance-hvac-repair'),
    ('home-services-home-repair-maintenance', 'Locksmith Services', 'Locksmith Services', 'home-services-home-repair-maintenance-locksmith-services'),
    -- Moving & Delivery
    ('home-services-moving-delivery', 'Moving Services', 'Moving Services', 'home-services-moving-delivery-moving-services'),
    ('home-services-moving-delivery', 'Furniture Assembly', 'Furniture Assembly', 'home-services-moving-delivery-furniture-assembly'),
    ('home-services-moving-delivery', 'Delivery Services', 'Delivery Services', 'home-services-moving-delivery-delivery-services'),
    ('home-services-moving-delivery', 'Packing Services', 'Packing Services', 'home-services-moving-delivery-packing-services')
) AS v(parent_slug, name_en, name_ka, slug)
JOIN public.categories c ON c.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM public.subcategories s WHERE s.slug = v.slug);
