-- Three-level taxonomy for Technology & Development:
-- root category → mid categories (Web, Mobile, …) → subcategories (Frontend, …).

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.categories (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories (parent_id);

COMMENT ON COLUMN public.categories.parent_id IS
  'Optional parent category. Null = top-level. Mid-level rows (e.g. Web Development) point at the umbrella category.';

-- Root
INSERT INTO public.categories (name_en, name_ka, slug, sort_order, is_active, parent_id)
SELECT
  'Technology & Development',
  'ტექნოლოგია და დეველოპმენტი',
  'technology-development',
  (SELECT COALESCE(MAX(c2.sort_order), 0) + 1 FROM public.categories c2),
  true,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = 'technology-development');

UPDATE public.categories
SET parent_id = NULL
WHERE slug = 'technology-development';

-- Mid-level categories (children of root)
INSERT INTO public.categories (name_en, name_ka, slug, sort_order, is_active, parent_id)
SELECT v.name_en, v.name_ka, v.slug, (SELECT COALESCE(MAX(c2.sort_order), 0) + 1 FROM public.categories c2) + v.ord, true, r.id
FROM public.categories r
CROSS JOIN (
  VALUES
    (1, 'Web Development', 'ვებ დეველოპმენტი', 'technology-development-web-development'),
    (2, 'Mobile Development', 'მობილური აპლიკაციები', 'technology-development-mobile-development'),
    (3, 'Software Development', 'პროგრამული უზრუნველყოფა', 'technology-development-software-development'),
    (4, 'Game Development', 'თამაშების შექმნა', 'technology-development-game-development'),
    (5, 'Blockchain & Crypto', 'ბლოკჩეინი', 'technology-development-blockchain-crypto')
) AS v(ord, name_en, name_ka, slug)
WHERE r.slug = 'technology-development'
  AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = v.slug);

-- Point existing flat subcategories (from prior migration) at the correct mid category
UPDATE public.subcategories s
SET category_id = cc.id
FROM public.categories cc
WHERE cc.slug = 'technology-development-web-development'
  AND s.slug LIKE 'technology-development-web-%';

UPDATE public.subcategories s
SET category_id = cc.id
FROM public.categories cc
WHERE cc.slug = 'technology-development-mobile-development'
  AND s.slug LIKE 'technology-development-mobile-%';

UPDATE public.subcategories s
SET category_id = cc.id
FROM public.categories cc
WHERE cc.slug = 'technology-development-software-development'
  AND s.slug LIKE 'technology-development-software-%';

UPDATE public.subcategories s
SET category_id = cc.id
FROM public.categories cc
WHERE cc.slug = 'technology-development-game-development'
  AND s.slug LIKE 'technology-development-game-%';

UPDATE public.subcategories s
SET category_id = cc.id
FROM public.categories cc
WHERE cc.slug = 'technology-development-blockchain-crypto'
  AND s.slug LIKE 'technology-development-blockchain-%';

-- Normalize display labels on leaves (English name in both columns)
UPDATE public.subcategories
SET name_ka = name_en
WHERE slug LIKE 'technology-development-%';

-- Insert leaves if this DB never ran the flat seed (no rows to UPDATE)
INSERT INTO public.subcategories (category_id, name_en, name_ka, slug, is_active)
SELECT c.id, v.name_en, v.name_ka, v.slug, true
FROM (
  VALUES
    ('technology-development-web-development', 'Frontend Development', 'Frontend Development', 'technology-development-web-frontend-development'),
    ('technology-development-web-development', 'Backend Development', 'Backend Development', 'technology-development-web-backend-development'),
    ('technology-development-web-development', 'Full-stack Development', 'Full-stack Development', 'technology-development-web-full-stack-development'),
    ('technology-development-web-development', 'WordPress Development', 'WordPress Development', 'technology-development-web-wordpress-development'),
    ('technology-development-web-development', 'Shopify/E-commerce Development', 'Shopify/E-commerce Development', 'technology-development-web-shopify-ecommerce-development'),
    ('technology-development-web-development', 'Web Applications', 'Web Applications', 'technology-development-web-web-applications'),
    ('technology-development-web-development', 'Landing Pages', 'Landing Pages', 'technology-development-web-landing-pages'),
    ('technology-development-web-development', 'Website Maintenance', 'Website Maintenance', 'technology-development-web-website-maintenance'),
    ('technology-development-mobile-development', 'iOS Development', 'iOS Development', 'technology-development-mobile-ios-development'),
    ('technology-development-mobile-development', 'Android Development', 'Android Development', 'technology-development-mobile-android-development'),
    ('technology-development-mobile-development', 'React Native Development', 'React Native Development', 'technology-development-mobile-react-native-development'),
    ('technology-development-mobile-development', 'Flutter Development', 'Flutter Development', 'technology-development-mobile-flutter-development'),
    ('technology-development-mobile-development', 'Cross-platform Apps', 'Cross-platform Apps', 'technology-development-mobile-cross-platform-apps'),
    ('technology-development-mobile-development', 'App Maintenance & Updates', 'App Maintenance & Updates', 'technology-development-mobile-app-maintenance-updates'),
    ('technology-development-software-development', 'Desktop Applications', 'Desktop Applications', 'technology-development-software-desktop-applications'),
    ('technology-development-software-development', 'Custom Software Solutions', 'Custom Software Solutions', 'technology-development-software-custom-software-solutions'),
    ('technology-development-software-development', 'API Development & Integration', 'API Development & Integration', 'technology-development-software-api-development-integration'),
    ('technology-development-software-development', 'Database Design', 'Database Design', 'technology-development-software-database-design'),
    ('technology-development-software-development', 'Cloud Solutions (AWS, Azure, GCP)', 'Cloud Solutions (AWS, Azure, GCP)', 'technology-development-software-cloud-solutions-aws-azure-gcp'),
    ('technology-development-game-development', 'Unity Development', 'Unity Development', 'technology-development-game-unity-development'),
    ('technology-development-game-development', 'Unreal Engine', 'Unreal Engine', 'technology-development-game-unreal-engine'),
    ('technology-development-game-development', 'Mobile Games', 'Mobile Games', 'technology-development-game-mobile-games'),
    ('technology-development-game-development', 'PC/Console Games', 'PC/Console Games', 'technology-development-game-pc-console-games'),
    ('technology-development-game-development', 'Game Design', 'Game Design', 'technology-development-game-game-design'),
    ('technology-development-blockchain-crypto', 'Smart Contract Development', 'Smart Contract Development', 'technology-development-blockchain-smart-contract-development'),
    ('technology-development-blockchain-crypto', 'NFT Development', 'NFT Development', 'technology-development-blockchain-nft-development'),
    ('technology-development-blockchain-crypto', 'Cryptocurrency Development', 'Cryptocurrency Development', 'technology-development-blockchain-cryptocurrency-development'),
    ('technology-development-blockchain-crypto', 'Web3 Applications', 'Web3 Applications', 'technology-development-blockchain-web3-applications')
) AS v(parent_slug, name_en, name_ka, slug)
JOIN public.categories c ON c.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM public.subcategories s WHERE s.slug = v.slug);

-- Jobs: keep category_id consistent with chosen subcategory (fixes legacy root category_id)
UPDATE public.jobs j
SET category_id = s.category_id
FROM public.subcategories s
WHERE j.subcategory_id IS NOT NULL
  AND s.id = j.subcategory_id
  AND j.category_id IS DISTINCT FROM s.category_id;
