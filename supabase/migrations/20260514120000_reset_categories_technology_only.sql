-- Replace entire marketplace category catalog with Technology & Development tree only.
-- Clears previous categories/subcategories; nulls FK references first.

ALTER TABLE public.jobs
  ALTER COLUMN category_id DROP NOT NULL;

UPDATE public.skills SET category_id = NULL WHERE category_id IS NOT NULL;

UPDATE public.jobs SET subcategory_id = NULL WHERE subcategory_id IS NOT NULL;
UPDATE public.jobs SET category_id = NULL WHERE category_id IS NOT NULL;

DELETE FROM public.subcategories;

DELETE FROM public.categories
WHERE parent_id IS NOT NULL;

DELETE FROM public.categories
WHERE parent_id IS NULL;

-- Root (requires parent_id column — see 20260514100000_categories_parent_id_column.sql)
INSERT INTO public.categories (name_en, name_ka, slug, sort_order, is_active, parent_id)
VALUES (
  'Technology & Development',
  'ტექნოლოგია და დეველოპმენტი',
  'technology-development',
  1,
  true,
  NULL
);

-- Mid-level (subcategories in UI terms)
INSERT INTO public.categories (name_en, name_ka, slug, sort_order, is_active, parent_id)
SELECT v.name_en, v.name_ka, v.slug, v.ord + 1, true, r.id
FROM public.categories r
CROSS JOIN (
  VALUES
    (1, 'Web Development', 'ვებ დეველოპმენტი', 'technology-development-web-development'),
    (2, 'Mobile Development', 'მობილური აპლიკაციები', 'technology-development-mobile-development'),
    (3, 'Software Development', 'პროგრამული უზრუნველყოფა', 'technology-development-software-development'),
    (4, 'Game Development', 'თამაშების შექმნა', 'technology-development-game-development'),
    (5, 'Blockchain & Crypto', 'ბლოკჩეინი', 'technology-development-blockchain-crypto')
) AS v(ord, name_en, name_ka, slug)
WHERE r.slug = 'technology-development';

-- Specializations (subcategories table)
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
JOIN public.categories c ON c.slug = v.parent_slug;
