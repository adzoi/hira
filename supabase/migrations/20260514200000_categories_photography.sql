-- Photography: root → mid categories → specializations (subcategories table).
-- Idempotent: safe to re-run; does not remove other category trees.

-- Root
INSERT INTO public.categories (name_en, name_ka, slug, sort_order, is_active, parent_id)
SELECT
  'Photography',
  'ფოტოგრაფია',
  'photography',
  (SELECT COALESCE(MAX(c2.sort_order), 0) + 1 FROM public.categories c2),
  true,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = 'photography');

-- Mid-level (groupings under Photography)
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
    (1, 'Event Photography', 'ღონისძიებების ფოტოგრაფია', 'photography-event-photography'),
    (2, 'Commercial Photography', 'კომერციული ფოტოგრაფია', 'photography-commercial-photography'),
    (3, 'Photo Editing', 'ფოტოს რედაქტირება', 'photography-photo-editing')
) AS v(ord, name_en, name_ka, slug)
WHERE r.slug = 'photography'
  AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = v.slug);

-- Specializations
INSERT INTO public.subcategories (category_id, name_en, name_ka, slug, is_active)
SELECT c.id, v.name_en, v.name_ka, v.slug, true
FROM (
  VALUES
    -- Event Photography
    ('photography-event-photography', 'Wedding Photography', 'Wedding Photography', 'photography-event-photography-wedding-photography'),
    ('photography-event-photography', 'Corporate Events', 'Corporate Events', 'photography-event-photography-corporate-events'),
    ('photography-event-photography', 'Birthday Photography', 'Birthday Photography', 'photography-event-photography-birthday-photography'),
    ('photography-event-photography', 'Conference Photography', 'Conference Photography', 'photography-event-photography-conference-photography'),
    -- Commercial Photography
    ('photography-commercial-photography', 'Product Photography', 'Product Photography', 'photography-commercial-photography-product-photography'),
    ('photography-commercial-photography', 'Food Photography', 'Food Photography', 'photography-commercial-photography-food-photography'),
    ('photography-commercial-photography', 'Real Estate Photography', 'Real Estate Photography', 'photography-commercial-photography-real-estate-photography'),
    ('photography-commercial-photography', 'Fashion Photography', 'Fashion Photography', 'photography-commercial-photography-fashion-photography'),
    ('photography-commercial-photography', 'Portrait Photography', 'Portrait Photography', 'photography-commercial-photography-portrait-photography'),
    -- Photo Editing
    ('photography-photo-editing', 'Photo Retouching', 'Photo Retouching', 'photography-photo-editing-photo-retouching'),
    ('photography-photo-editing', 'Background Removal', 'Background Removal', 'photography-photo-editing-background-removal'),
    ('photography-photo-editing', 'Color Correction', 'Color Correction', 'photography-photo-editing-color-correction'),
    ('photography-photo-editing', 'Photo Restoration', 'Photo Restoration', 'photography-photo-editing-photo-restoration')
) AS v(parent_slug, name_en, name_ka, slug)
JOIN public.categories c ON c.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM public.subcategories s WHERE s.slug = v.slug);
