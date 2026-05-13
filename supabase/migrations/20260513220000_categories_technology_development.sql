-- Technology & Development: flat subcategories under the root row (legacy).
-- After this runs, apply 20260513230000_categories_parent_technology_tree.sql for the 3-level tree
-- (root → Web/Mobile/… → Frontend/…).

-- Technology & Development: top-level category + subcategories (2-level schema).
-- name_en: leaf label (English, as provided). name_ka: Georgian section + em dash + same leaf for UI sorting/grouping.

INSERT INTO public.categories (name_en, name_ka, slug, sort_order, is_active)
SELECT
  'Technology & Development',
  'ტექნოლოგია და დეველოპმენტი',
  'technology-development',
  (SELECT COALESCE(MAX(c2.sort_order), 0) + 1 FROM public.categories c2),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = 'technology-development');

INSERT INTO public.subcategories (category_id, name_en, name_ka, slug, is_active)
SELECT c.id, v.name_en, v.name_ka, v.slug, true
FROM public.categories c
CROSS JOIN (
  VALUES
    -- Web Development (ვებ დეველოპმენტი)
    ('Frontend Development', 'ვებ დეველოპმენტი — Frontend Development', 'technology-development-web-frontend-development'),
    ('Backend Development', 'ვებ დეველოპმენტი — Backend Development', 'technology-development-web-backend-development'),
    ('Full-stack Development', 'ვებ დეველოპმენტი — Full-stack Development', 'technology-development-web-full-stack-development'),
    ('WordPress Development', 'ვებ დეველოპმენტი — WordPress Development', 'technology-development-web-wordpress-development'),
    ('Shopify/E-commerce Development', 'ვებ დეველოპმენტი — Shopify/E-commerce Development', 'technology-development-web-shopify-ecommerce-development'),
    ('Web Applications', 'ვებ დეველოპმენტი — Web Applications', 'technology-development-web-web-applications'),
    ('Landing Pages', 'ვებ დეველოპმენტი — Landing Pages', 'technology-development-web-landing-pages'),
    ('Website Maintenance', 'ვებ დეველოპმენტი — Website Maintenance', 'technology-development-web-website-maintenance'),
    -- Mobile Development (მობილური აპლიკაციები)
    ('iOS Development', 'მობილური აპლიკაციები — iOS Development', 'technology-development-mobile-ios-development'),
    ('Android Development', 'მობილური აპლიკაციები — Android Development', 'technology-development-mobile-android-development'),
    ('React Native Development', 'მობილური აპლიკაციები — React Native Development', 'technology-development-mobile-react-native-development'),
    ('Flutter Development', 'მობილური აპლიკაციები — Flutter Development', 'technology-development-mobile-flutter-development'),
    ('Cross-platform Apps', 'მობილური აპლიკაციები — Cross-platform Apps', 'technology-development-mobile-cross-platform-apps'),
    ('App Maintenance & Updates', 'მობილური აპლიკაციები — App Maintenance & Updates', 'technology-development-mobile-app-maintenance-updates'),
    -- Software Development (პროგრამული უზრუნველყოფა)
    ('Desktop Applications', 'პროგრამული უზრუნველყოფა — Desktop Applications', 'technology-development-software-desktop-applications'),
    ('Custom Software Solutions', 'პროგრამული უზრუნველყოფა — Custom Software Solutions', 'technology-development-software-custom-software-solutions'),
    ('API Development & Integration', 'პროგრამული უზრუნველყოფა — API Development & Integration', 'technology-development-software-api-development-integration'),
    ('Database Design', 'პროგრამული უზრუნველყოფა — Database Design', 'technology-development-software-database-design'),
    ('Cloud Solutions (AWS, Azure, GCP)', 'პროგრამული უზრუნველყოფა — Cloud Solutions (AWS, Azure, GCP)', 'technology-development-software-cloud-solutions-aws-azure-gcp'),
    -- Game Development (თამაშების შექმნა)
    ('Unity Development', 'თამაშების შექმნა — Unity Development', 'technology-development-game-unity-development'),
    ('Unreal Engine', 'თამაშების შექმნა — Unreal Engine', 'technology-development-game-unreal-engine'),
    ('Mobile Games', 'თამაშების შექმნა — Mobile Games', 'technology-development-game-mobile-games'),
    ('PC/Console Games', 'თამაშების შექმნა — PC/Console Games', 'technology-development-game-pc-console-games'),
    ('Game Design', 'თამაშების შექმნა — Game Design', 'technology-development-game-game-design'),
    -- Blockchain & Crypto (ბლოკჩეინი)
    ('Smart Contract Development', 'ბლოკჩეინი — Smart Contract Development', 'technology-development-blockchain-smart-contract-development'),
    ('NFT Development', 'ბლოკჩეინი — NFT Development', 'technology-development-blockchain-nft-development'),
    ('Cryptocurrency Development', 'ბლოკჩეინი — Cryptocurrency Development', 'technology-development-blockchain-cryptocurrency-development'),
    ('Web3 Applications', 'ბლოკჩეინი — Web3 Applications', 'technology-development-blockchain-web3-applications')
) AS v(name_en, name_ka, slug)
WHERE c.slug = 'technology-development'
  AND NOT EXISTS (SELECT 1 FROM public.subcategories s WHERE s.slug = v.slug);
