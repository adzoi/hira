-- Design & Creative: root → mid categories → specializations (subcategories table).
-- Idempotent: safe to re-run; does not remove Technology & Development.

-- Root
INSERT INTO public.categories (name_en, name_ka, slug, sort_order, is_active, parent_id)
SELECT
  'Design & Creative',
  'დიზაინი და კრეატივი',
  'design-creative',
  (SELECT COALESCE(MAX(c2.sort_order), 0) + 1 FROM public.categories c2),
  true,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = 'design-creative');

-- Mid-level (groupings under Design & Creative)
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
    (1, 'Graphic Design', 'გრაფიკული დიზაინი', 'design-creative-graphic-design'),
    (2, 'UI/UX Design', 'UI/UX დიზაინი', 'design-creative-ui-ux-design'),
    (3, 'Illustration & Art', 'ილუსტრაცია', 'design-creative-illustration-art'),
    (4, '3D Design', '3D დიზაინი', 'design-creative-3d-design'),
    (5, 'Interior Design', 'ინტერიერის დიზაინი', 'design-creative-interior-design')
) AS v(ord, name_en, name_ka, slug)
WHERE r.slug = 'design-creative'
  AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = v.slug);

-- Specializations
INSERT INTO public.subcategories (category_id, name_en, name_ka, slug, is_active)
SELECT c.id, v.name_en, v.name_ka, v.slug, true
FROM (
  VALUES
    -- Graphic Design
    ('design-creative-graphic-design', 'Logo Design', 'Logo Design', 'design-creative-graphic-design-logo-design'),
    ('design-creative-graphic-design', 'Brand Identity', 'Brand Identity', 'design-creative-graphic-design-brand-identity'),
    ('design-creative-graphic-design', 'Poster & Flyer Design', 'Poster & Flyer Design', 'design-creative-graphic-design-poster-flyer-design'),
    ('design-creative-graphic-design', 'Social Media Graphics', 'Social Media Graphics', 'design-creative-graphic-design-social-media-graphics'),
    ('design-creative-graphic-design', 'Packaging Design', 'Packaging Design', 'design-creative-graphic-design-packaging-design'),
    ('design-creative-graphic-design', 'Print Design', 'Print Design', 'design-creative-graphic-design-print-design'),
    ('design-creative-graphic-design', 'Menu Design', 'Menu Design', 'design-creative-graphic-design-menu-design'),
    ('design-creative-graphic-design', 'Business Card Design', 'Business Card Design', 'design-creative-graphic-design-business-card-design'),
    -- UI/UX Design
    ('design-creative-ui-ux-design', 'Website UI/UX', 'Website UI/UX', 'design-creative-ui-ux-design-website-ui-ux'),
    ('design-creative-ui-ux-design', 'Mobile App UI/UX', 'Mobile App UI/UX', 'design-creative-ui-ux-design-mobile-app-ui-ux'),
    ('design-creative-ui-ux-design', 'User Research', 'User Research', 'design-creative-ui-ux-design-user-research'),
    ('design-creative-ui-ux-design', 'Wireframing & Prototyping', 'Wireframing & Prototyping', 'design-creative-ui-ux-design-wireframing-prototyping'),
    ('design-creative-ui-ux-design', 'Usability Testing', 'Usability Testing', 'design-creative-ui-ux-design-usability-testing'),
    ('design-creative-ui-ux-design', 'Design Systems', 'Design Systems', 'design-creative-ui-ux-design-design-systems'),
    -- Illustration & Art
    ('design-creative-illustration-art', 'Digital Illustration', 'Digital Illustration', 'design-creative-illustration-art-digital-illustration'),
    ('design-creative-illustration-art', 'Character Design', 'Character Design', 'design-creative-illustration-art-character-design'),
    ('design-creative-illustration-art', 'Children''s Book Illustration', 'Children''s Book Illustration', 'design-creative-illustration-art-childrens-book-illustration'),
    ('design-creative-illustration-art', 'Technical Illustration', 'Technical Illustration', 'design-creative-illustration-art-technical-illustration'),
    ('design-creative-illustration-art', 'Infographics', 'Infographics', 'design-creative-illustration-art-infographics'),
    ('design-creative-illustration-art', 'Comic Art', 'Comic Art', 'design-creative-illustration-art-comic-art'),
    -- 3D Design
    ('design-creative-3d-design', '3D Modeling', '3D Modeling', 'design-creative-3d-design-modeling'),
    ('design-creative-3d-design', 'Product Visualization', 'Product Visualization', 'design-creative-3d-design-product-visualization'),
    ('design-creative-3d-design', 'Architectural Visualization', 'Architectural Visualization', 'design-creative-3d-design-architectural-visualization'),
    ('design-creative-3d-design', '3D Animation', '3D Animation', 'design-creative-3d-design-animation'),
    ('design-creative-3d-design', '3D Printing Design', '3D Printing Design', 'design-creative-3d-design-printing-design'),
    -- Interior Design
    ('design-creative-interior-design', 'Residential Interior Design', 'Residential Interior Design', 'design-creative-interior-design-residential-interior-design'),
    ('design-creative-interior-design', 'Commercial Interior Design', 'Commercial Interior Design', 'design-creative-interior-design-commercial-interior-design'),
    ('design-creative-interior-design', '3D Room Design', '3D Room Design', 'design-creative-interior-design-3d-room-design'),
    ('design-creative-interior-design', 'Furniture Design', 'Furniture Design', 'design-creative-interior-design-furniture-design')
) AS v(parent_slug, name_en, name_ka, slug)
JOIN public.categories c ON c.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM public.subcategories s WHERE s.slug = v.slug);
