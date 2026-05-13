-- Writing & Translation: root → mid categories → specializations (subcategories table).
-- Idempotent: safe to re-run; does not remove other category trees.

-- Root
INSERT INTO public.categories (name_en, name_ka, slug, sort_order, is_active, parent_id)
SELECT
  'Writing & Translation',
  'კოპირაიტინგი და თარგმანი',
  'writing-translation',
  (SELECT COALESCE(MAX(c2.sort_order), 0) + 1 FROM public.categories c2),
  true,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = 'writing-translation');

-- Mid-level (groupings under Writing & Translation)
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
    (1, 'Writing', 'კოპირაიტინგი', 'writing-translation-writing'),
    (2, 'Translation', 'თარგმანი', 'writing-translation-translation'),
    (3, 'Editing & Proofreading', 'რედაქტირება', 'writing-translation-editing-proofreading')
) AS v(ord, name_en, name_ka, slug)
WHERE r.slug = 'writing-translation'
  AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = v.slug);

-- Specializations
INSERT INTO public.subcategories (category_id, name_en, name_ka, slug, is_active)
SELECT c.id, v.name_en, v.name_ka, v.slug, true
FROM (
  VALUES
    -- Writing
    ('writing-translation-writing', 'Blog Writing', 'Blog Writing', 'writing-translation-writing-blog-writing'),
    ('writing-translation-writing', 'Article Writing', 'Article Writing', 'writing-translation-writing-article-writing'),
    ('writing-translation-writing', 'Copywriting', 'Copywriting', 'writing-translation-writing-copywriting'),
    ('writing-translation-writing', 'Content Writing', 'Content Writing', 'writing-translation-writing-content-writing'),
    ('writing-translation-writing', 'Technical Writing', 'Technical Writing', 'writing-translation-writing-technical-writing'),
    ('writing-translation-writing', 'Creative Writing', 'Creative Writing', 'writing-translation-writing-creative-writing'),
    ('writing-translation-writing', 'Product Descriptions', 'Product Descriptions', 'writing-translation-writing-product-descriptions'),
    ('writing-translation-writing', 'Email Copywriting', 'Email Copywriting', 'writing-translation-writing-email-copywriting'),
    ('writing-translation-writing', 'Press Releases', 'Press Releases', 'writing-translation-writing-press-releases'),
    ('writing-translation-writing', 'Resume & Cover Letter Writing', 'Resume & Cover Letter Writing', 'writing-translation-writing-resume-cover-letter-writing'),
    -- Translation
    ('writing-translation-translation', 'Georgian-English Translation', 'Georgian-English Translation', 'writing-translation-translation-georgian-english-translation'),
    ('writing-translation-translation', 'Georgian-Russian Translation', 'Georgian-Russian Translation', 'writing-translation-translation-georgian-russian-translation'),
    ('writing-translation-translation', 'Georgian-Turkish Translation', 'Georgian-Turkish Translation', 'writing-translation-translation-georgian-turkish-translation'),
    ('writing-translation-translation', 'Document Translation', 'Document Translation', 'writing-translation-translation-document-translation'),
    ('writing-translation-translation', 'Website Localization', 'Website Localization', 'writing-translation-translation-website-localization'),
    ('writing-translation-translation', 'Legal Translation', 'Legal Translation', 'writing-translation-translation-legal-translation'),
    ('writing-translation-translation', 'Medical Translation', 'Medical Translation', 'writing-translation-translation-medical-translation'),
    -- Editing & Proofreading
    ('writing-translation-editing-proofreading', 'Proofreading', 'Proofreading', 'writing-translation-editing-proofreading-proofreading'),
    ('writing-translation-editing-proofreading', 'Copy Editing', 'Copy Editing', 'writing-translation-editing-proofreading-copy-editing'),
    ('writing-translation-editing-proofreading', 'Book Editing', 'Book Editing', 'writing-translation-editing-proofreading-book-editing'),
    ('writing-translation-editing-proofreading', 'Academic Editing', 'Academic Editing', 'writing-translation-editing-proofreading-academic-editing')
) AS v(parent_slug, name_en, name_ka, slug)
JOIN public.categories c ON c.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM public.subcategories s WHERE s.slug = v.slug);
