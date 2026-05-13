-- Marketing & Advertising: root → mid categories → specializations (subcategories table).
-- Idempotent: safe to re-run; does not remove other category trees.

-- Root
INSERT INTO public.categories (name_en, name_ka, slug, sort_order, is_active, parent_id)
SELECT
  'Marketing & Advertising',
  'მარკეტინგი და რეკლამა',
  'marketing-advertising',
  (SELECT COALESCE(MAX(c2.sort_order), 0) + 1 FROM public.categories c2),
  true,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = 'marketing-advertising');

-- Mid-level (groupings under Marketing & Advertising)
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
    (1, 'Digital Marketing', 'ციფრული მარკეტინგი', 'marketing-advertising-digital-marketing'),
    (2, 'SEO', 'SEO ოპტიმიზაცია', 'marketing-advertising-seo'),
    (3, 'Content Marketing', 'კონტენტ მარკეტინგი', 'marketing-advertising-content-marketing'),
    (4, 'Branding', 'ბრენდინგი', 'marketing-advertising-branding')
) AS v(ord, name_en, name_ka, slug)
WHERE r.slug = 'marketing-advertising'
  AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = v.slug);

-- Specializations
INSERT INTO public.subcategories (category_id, name_en, name_ka, slug, is_active)
SELECT c.id, v.name_en, v.name_ka, v.slug, true
FROM (
  VALUES
    -- Digital Marketing
    ('marketing-advertising-digital-marketing', 'Social Media Marketing', 'Social Media Marketing', 'marketing-advertising-digital-marketing-social-media-marketing'),
    ('marketing-advertising-digital-marketing', 'Facebook/Instagram Ads', 'Facebook/Instagram Ads', 'marketing-advertising-digital-marketing-facebook-instagram-ads'),
    ('marketing-advertising-digital-marketing', 'Google Ads (PPC)', 'Google Ads (PPC)', 'marketing-advertising-digital-marketing-google-ads-ppc'),
    ('marketing-advertising-digital-marketing', 'TikTok Marketing', 'TikTok Marketing', 'marketing-advertising-digital-marketing-tiktok-marketing'),
    ('marketing-advertising-digital-marketing', 'Email Marketing', 'Email Marketing', 'marketing-advertising-digital-marketing-email-marketing'),
    ('marketing-advertising-digital-marketing', 'Influencer Marketing', 'Influencer Marketing', 'marketing-advertising-digital-marketing-influencer-marketing'),
    ('marketing-advertising-digital-marketing', 'Affiliate Marketing', 'Affiliate Marketing', 'marketing-advertising-digital-marketing-affiliate-marketing'),
    -- SEO
    ('marketing-advertising-seo', 'On-page SEO', 'On-page SEO', 'marketing-advertising-seo-on-page-seo'),
    ('marketing-advertising-seo', 'Off-page SEO', 'Off-page SEO', 'marketing-advertising-seo-off-page-seo'),
    ('marketing-advertising-seo', 'Technical SEO', 'Technical SEO', 'marketing-advertising-seo-technical-seo'),
    ('marketing-advertising-seo', 'Local SEO', 'Local SEO', 'marketing-advertising-seo-local-seo'),
    ('marketing-advertising-seo', 'SEO Audits', 'SEO Audits', 'marketing-advertising-seo-seo-audits'),
    ('marketing-advertising-seo', 'Keyword Research', 'Keyword Research', 'marketing-advertising-seo-keyword-research'),
    -- Content Marketing
    ('marketing-advertising-content-marketing', 'Content Strategy', 'Content Strategy', 'marketing-advertising-content-marketing-content-strategy'),
    ('marketing-advertising-content-marketing', 'Social Media Content', 'Social Media Content', 'marketing-advertising-content-marketing-social-media-content'),
    ('marketing-advertising-content-marketing', 'Blog Management', 'Blog Management', 'marketing-advertising-content-marketing-blog-management'),
    ('marketing-advertising-content-marketing', 'Newsletter Management', 'Newsletter Management', 'marketing-advertising-content-marketing-newsletter-management'),
    -- Branding
    ('marketing-advertising-branding', 'Brand Strategy', 'Brand Strategy', 'marketing-advertising-branding-brand-strategy'),
    ('marketing-advertising-branding', 'Brand Guidelines', 'Brand Guidelines', 'marketing-advertising-branding-brand-guidelines'),
    ('marketing-advertising-branding', 'Market Research', 'Market Research', 'marketing-advertising-branding-market-research'),
    ('marketing-advertising-branding', 'Competitor Analysis', 'Competitor Analysis', 'marketing-advertising-branding-competitor-analysis')
) AS v(parent_slug, name_en, name_ka, slug)
JOIN public.categories c ON c.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM public.subcategories s WHERE s.slug = v.slug);
