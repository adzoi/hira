-- Video & Animation: root → mid categories → specializations (subcategories table).
-- Idempotent: safe to re-run; does not remove other category trees.

-- Root
INSERT INTO public.categories (name_en, name_ka, slug, sort_order, is_active, parent_id)
SELECT
  'Video & Animation',
  'ვიდეო და ანიმაცია',
  'video-animation',
  (SELECT COALESCE(MAX(c2.sort_order), 0) + 1 FROM public.categories c2),
  true,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = 'video-animation');

-- Mid-level (groupings under Video & Animation)
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
    (1, 'Video Production', 'ვიდეო პროდუქცია', 'video-animation-video-production'),
    (2, 'Animation', 'ანიმაცია', 'video-animation-animation'),
    (3, 'Post-Production', 'პოსტ-პროდუქცია', 'video-animation-post-production')
) AS v(ord, name_en, name_ka, slug)
WHERE r.slug = 'video-animation'
  AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = v.slug);

-- Specializations
INSERT INTO public.subcategories (category_id, name_en, name_ka, slug, is_active)
SELECT c.id, v.name_en, v.name_ka, v.slug, true
FROM (
  VALUES
    -- Video Production
    ('video-animation-video-production', 'Video Editing', 'Video Editing', 'video-animation-video-production-video-editing'),
    ('video-animation-video-production', 'Promotional Videos', 'Promotional Videos', 'video-animation-video-production-promotional-videos'),
    ('video-animation-video-production', 'Wedding Videography', 'Wedding Videography', 'video-animation-video-production-wedding-videography'),
    ('video-animation-video-production', 'Event Videography', 'Event Videography', 'video-animation-video-production-event-videography'),
    ('video-animation-video-production', 'Product Videos', 'Product Videos', 'video-animation-video-production-product-videos'),
    ('video-animation-video-production', 'Real Estate Videos', 'Real Estate Videos', 'video-animation-video-production-real-estate-videos'),
    ('video-animation-video-production', 'Drone Videography', 'Drone Videography', 'video-animation-video-production-drone-videography'),
    -- Animation
    ('video-animation-animation', '2D Animation', '2D Animation', 'video-animation-animation-2d-animation'),
    ('video-animation-animation', '3D Animation', '3D Animation', 'video-animation-animation-3d-animation'),
    ('video-animation-animation', 'Motion Graphics', 'Motion Graphics', 'video-animation-animation-motion-graphics'),
    ('video-animation-animation', 'Explainer Videos', 'Explainer Videos', 'video-animation-animation-explainer-videos'),
    ('video-animation-animation', 'Logo Animation', 'Logo Animation', 'video-animation-animation-logo-animation'),
    ('video-animation-animation', 'Whiteboard Animation', 'Whiteboard Animation', 'video-animation-animation-whiteboard-animation'),
    -- Post-Production
    ('video-animation-post-production', 'Color Grading', 'Color Grading', 'video-animation-post-production-color-grading'),
    ('video-animation-post-production', 'Sound Design', 'Sound Design', 'video-animation-post-production-sound-design'),
    ('video-animation-post-production', 'Visual Effects (VFX)', 'Visual Effects (VFX)', 'video-animation-post-production-visual-effects-vfx'),
    ('video-animation-post-production', 'Subtitling & Captioning', 'Subtitling & Captioning', 'video-animation-post-production-subtitling-captioning')
) AS v(parent_slug, name_en, name_ka, slug)
JOIN public.categories c ON c.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM public.subcategories s WHERE s.slug = v.slug);
