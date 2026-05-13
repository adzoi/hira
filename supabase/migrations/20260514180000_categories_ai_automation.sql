-- AI & Automation: root → mid categories → specializations (subcategories table).
-- Idempotent: safe to re-run; does not remove other category trees.

-- Root
INSERT INTO public.categories (name_en, name_ka, slug, sort_order, is_active, parent_id)
SELECT
  'AI & Automation',
  'AI და ავტომაცია',
  'ai-automation',
  (SELECT COALESCE(MAX(c2.sort_order), 0) + 1 FROM public.categories c2),
  true,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = 'ai-automation');

-- Mid-level (groupings under AI & Automation)
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
    (1, 'AI Development', 'AI დეველოპმენტი', 'ai-automation-ai-development'),
    (2, 'Workflow Automation', 'ავტომაცია', 'ai-automation-workflow-automation'),
    (3, 'Data Science', 'მონაცემთა მეცნიერება', 'ai-automation-data-science')
) AS v(ord, name_en, name_ka, slug)
WHERE r.slug = 'ai-automation'
  AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = v.slug);

-- Specializations
INSERT INTO public.subcategories (category_id, name_en, name_ka, slug, is_active)
SELECT c.id, v.name_en, v.name_ka, v.slug, true
FROM (
  VALUES
    -- AI Development
    ('ai-automation-ai-development', 'ChatGPT Integration', 'ChatGPT Integration', 'ai-automation-ai-development-chatgpt-integration'),
    ('ai-automation-ai-development', 'AI Chatbots', 'AI Chatbots', 'ai-automation-ai-development-ai-chatbots'),
    ('ai-automation-ai-development', 'Machine Learning Solutions', 'Machine Learning Solutions', 'ai-automation-ai-development-machine-learning-solutions'),
    ('ai-automation-ai-development', 'Computer Vision', 'Computer Vision', 'ai-automation-ai-development-computer-vision'),
    ('ai-automation-ai-development', 'Natural Language Processing', 'Natural Language Processing', 'ai-automation-ai-development-natural-language-processing'),
    -- Workflow Automation
    ('ai-automation-workflow-automation', 'N8N Automation', 'N8N Automation', 'ai-automation-workflow-automation-n8n-automation'),
    ('ai-automation-workflow-automation', 'Make.com Workflows', 'Make.com Workflows', 'ai-automation-workflow-automation-make-com-workflows'),
    ('ai-automation-workflow-automation', 'Zapier Integration', 'Zapier Integration', 'ai-automation-workflow-automation-zapier-integration'),
    ('ai-automation-workflow-automation', 'Process Automation', 'Process Automation', 'ai-automation-workflow-automation-process-automation'),
    ('ai-automation-workflow-automation', 'CRM Automation', 'CRM Automation', 'ai-automation-workflow-automation-crm-automation'),
    -- Data Science
    ('ai-automation-data-science', 'Data Analysis', 'Data Analysis', 'ai-automation-data-science-data-analysis'),
    ('ai-automation-data-science', 'Data Visualization', 'Data Visualization', 'ai-automation-data-science-data-visualization'),
    ('ai-automation-data-science', 'Predictive Analytics', 'Predictive Analytics', 'ai-automation-data-science-predictive-analytics'),
    ('ai-automation-data-science', 'Business Intelligence', 'Business Intelligence', 'ai-automation-data-science-business-intelligence')
) AS v(parent_slug, name_en, name_ka, slug)
JOIN public.categories c ON c.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM public.subcategories s WHERE s.slug = v.slug);
