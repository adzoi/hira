-- Tutoring & Education: root → mid categories → specializations (subcategories table).
-- Idempotent: safe to re-run; does not remove other category trees.

-- Root
INSERT INTO public.categories (name_en, name_ka, slug, sort_order, is_active, parent_id)
SELECT
  'Tutoring & Education',
  'რეპეტიტორობა',
  'tutoring-education',
  (SELECT COALESCE(MAX(c2.sort_order), 0) + 1 FROM public.categories c2),
  true,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = 'tutoring-education');

-- Mid-level (groupings under Tutoring & Education)
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
    (1, 'Academic Tutoring', 'აკადემიური', 'tutoring-education-academic-tutoring'),
    (2, 'Test Preparation', 'გამოცდებისთვის მომზადება', 'tutoring-education-test-preparation'),
    (3, 'Professional Training', 'პროფესიული ტრენინგი', 'tutoring-education-professional-training')
) AS v(ord, name_en, name_ka, slug)
WHERE r.slug = 'tutoring-education'
  AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = v.slug);

-- Specializations
INSERT INTO public.subcategories (category_id, name_en, name_ka, slug, is_active)
SELECT c.id, v.name_en, v.name_ka, v.slug, true
FROM (
  VALUES
    -- Academic Tutoring
    ('tutoring-education-academic-tutoring', 'Math Tutoring', 'Math Tutoring', 'tutoring-education-academic-tutoring-math-tutoring'),
    ('tutoring-education-academic-tutoring', 'Physics Tutoring', 'Physics Tutoring', 'tutoring-education-academic-tutoring-physics-tutoring'),
    ('tutoring-education-academic-tutoring', 'Chemistry Tutoring', 'Chemistry Tutoring', 'tutoring-education-academic-tutoring-chemistry-tutoring'),
    ('tutoring-education-academic-tutoring', 'English Language', 'English Language', 'tutoring-education-academic-tutoring-english-language'),
    ('tutoring-education-academic-tutoring', 'Georgian Language', 'Georgian Language', 'tutoring-education-academic-tutoring-georgian-language'),
    ('tutoring-education-academic-tutoring', 'History', 'History', 'tutoring-education-academic-tutoring-history'),
    ('tutoring-education-academic-tutoring', 'Biology', 'Biology', 'tutoring-education-academic-tutoring-biology'),
    -- Test Preparation
    ('tutoring-education-test-preparation', 'SAT/ACT Prep', 'SAT/ACT Prep', 'tutoring-education-test-preparation-sat-act-prep'),
    ('tutoring-education-test-preparation', 'TOEFL/IELTS Prep', 'TOEFL/IELTS Prep', 'tutoring-education-test-preparation-toefl-ielts-prep'),
    ('tutoring-education-test-preparation', 'Unified Exams Prep', 'Unified Exams Prep', 'tutoring-education-test-preparation-unified-exams-prep'),
    ('tutoring-education-test-preparation', 'University Entrance Prep', 'University Entrance Prep', 'tutoring-education-test-preparation-university-entrance-prep'),
    -- Professional Training
    ('tutoring-education-professional-training', 'Programming Lessons', 'Programming Lessons', 'tutoring-education-professional-training-programming-lessons'),
    ('tutoring-education-professional-training', 'Design Lessons', 'Design Lessons', 'tutoring-education-professional-training-design-lessons'),
    ('tutoring-education-professional-training', 'Music Lessons', 'Music Lessons', 'tutoring-education-professional-training-music-lessons'),
    ('tutoring-education-professional-training', 'Language Lessons', 'Language Lessons', 'tutoring-education-professional-training-language-lessons')
) AS v(parent_slug, name_en, name_ka, slug)
JOIN public.categories c ON c.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM public.subcategories s WHERE s.slug = v.slug);
