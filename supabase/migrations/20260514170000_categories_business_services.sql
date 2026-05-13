-- Business Services: root → mid categories → specializations (subcategories table).
-- Idempotent: safe to re-run; does not remove other category trees.

-- Root
INSERT INTO public.categories (name_en, name_ka, slug, sort_order, is_active, parent_id)
SELECT
  'Business Services',
  'ბიზნეს სერვისები',
  'business-services',
  (SELECT COALESCE(MAX(c2.sort_order), 0) + 1 FROM public.categories c2),
  true,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = 'business-services');

-- Mid-level (groupings under Business Services)
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
    (1, 'Business Consulting', 'ბიზნეს კონსულტაცია', 'business-services-business-consulting'),
    (2, 'Accounting & Finance', 'ბუღალტერია', 'business-services-accounting-finance'),
    (3, 'Legal Services', 'იურიდიული სერვისები', 'business-services-legal-services'),
    (4, 'Administrative', 'ადმინისტრაციული', 'business-services-administrative')
) AS v(ord, name_en, name_ka, slug)
WHERE r.slug = 'business-services'
  AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = v.slug);

-- Specializations
INSERT INTO public.subcategories (category_id, name_en, name_ka, slug, is_active)
SELECT c.id, v.name_en, v.name_ka, v.slug, true
FROM (
  VALUES
    -- Business Consulting
    ('business-services-business-consulting', 'Business Planning', 'Business Planning', 'business-services-business-consulting-business-planning'),
    ('business-services-business-consulting', 'Market Research', 'Market Research', 'business-services-business-consulting-market-research'),
    ('business-services-business-consulting', 'Financial Planning', 'Financial Planning', 'business-services-business-consulting-financial-planning'),
    ('business-services-business-consulting', 'Startup Consulting', 'Startup Consulting', 'business-services-business-consulting-startup-consulting'),
    ('business-services-business-consulting', 'Strategy Consulting', 'Strategy Consulting', 'business-services-business-consulting-strategy-consulting'),
    -- Accounting & Finance
    ('business-services-accounting-finance', 'Bookkeeping', 'Bookkeeping', 'business-services-accounting-finance-bookkeeping'),
    ('business-services-accounting-finance', 'Tax Preparation', 'Tax Preparation', 'business-services-accounting-finance-tax-preparation'),
    ('business-services-accounting-finance', 'Financial Analysis', 'Financial Analysis', 'business-services-accounting-finance-financial-analysis'),
    ('business-services-accounting-finance', 'Payroll Management', 'Payroll Management', 'business-services-accounting-finance-payroll-management'),
    ('business-services-accounting-finance', 'Invoice Management', 'Invoice Management', 'business-services-accounting-finance-invoice-management'),
    -- Legal Services
    ('business-services-legal-services', 'Contract Review', 'Contract Review', 'business-services-legal-services-contract-review'),
    ('business-services-legal-services', 'Legal Consulting', 'Legal Consulting', 'business-services-legal-services-legal-consulting'),
    ('business-services-legal-services', 'Document Preparation', 'Document Preparation', 'business-services-legal-services-document-preparation'),
    ('business-services-legal-services', 'Company Registration', 'Company Registration', 'business-services-legal-services-company-registration'),
    -- Administrative
    ('business-services-administrative', 'Virtual Assistant', 'Virtual Assistant', 'business-services-administrative-virtual-assistant'),
    ('business-services-administrative', 'Data Entry', 'Data Entry', 'business-services-administrative-data-entry'),
    ('business-services-administrative', 'Email Management', 'Email Management', 'business-services-administrative-email-management'),
    ('business-services-administrative', 'Calendar Management', 'Calendar Management', 'business-services-administrative-calendar-management'),
    ('business-services-administrative', 'Customer Support', 'Customer Support', 'business-services-administrative-customer-support'),
    ('business-services-administrative', 'Live Chat Support', 'Live Chat Support', 'business-services-administrative-live-chat-support')
) AS v(parent_slug, name_en, name_ka, slug)
JOIN public.categories c ON c.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM public.subcategories s WHERE s.slug = v.slug);
