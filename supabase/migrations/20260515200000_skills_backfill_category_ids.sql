-- Restore skills.category_id (FK to public.categories mid-level rows) after the tech-only reset
-- nulled all assignments. Idempotent: only updates rows where category_id IS NULL.
-- Marketing first so skills like "Email marketing" are not caught by writing heuristics.

-- Marketing & advertising
UPDATE public.skills s
SET category_id = c.id
FROM public.categories c
WHERE c.slug = 'marketing-advertising-digital-marketing'
  AND s.category_id IS NULL
  AND (
    lower(trim(s.name)) LIKE '%facebook%'
    OR lower(trim(s.name)) LIKE '%instagram%'
    OR lower(trim(s.name)) LIKE '%google ads%'
    OR lower(trim(s.name)) LIKE '%ppc%'
    OR lower(trim(s.name)) LIKE '%tiktok%'
    OR lower(trim(s.name)) LIKE '%social media%'
    OR lower(trim(s.name)) LIKE '%email marketing%'
    OR lower(trim(s.name)) LIKE '%influencer%'
    OR lower(trim(s.name)) LIKE '%digital marketing%'
    OR lower(trim(s.name)) LIKE '%paid media%'
    OR lower(trim(s.name)) LIKE '%performance marketing%'
  );

UPDATE public.skills s
SET category_id = c.id
FROM public.categories c
WHERE c.slug = 'marketing-advertising-seo'
  AND s.category_id IS NULL
  AND (
    lower(trim(s.name)) LIKE '%seo%'
    OR lower(trim(s.name)) LIKE '%search engine%'
    OR lower(trim(s.name)) LIKE '%sem %'
    OR lower(trim(s.name)) = 'sem'
    OR lower(trim(s.name)) LIKE '%backlink%'
    OR lower(trim(s.name)) LIKE '%keyword research%'
  );

UPDATE public.skills s
SET category_id = c.id
FROM public.categories c
WHERE c.slug = 'marketing-advertising-content-marketing'
  AND s.category_id IS NULL
  AND lower(trim(s.name)) LIKE '%content marketing%';

UPDATE public.skills s
SET category_id = c.id
FROM public.categories c
WHERE c.slug = 'marketing-advertising-branding'
  AND s.category_id IS NULL
  AND (
    lower(trim(s.name)) LIKE '%brand%'
    OR lower(trim(s.name)) LIKE '%branding%'
    OR lower(trim(s.name)) LIKE '%brand identity%'
  );

-- Writing & translation
UPDATE public.skills s
SET category_id = c.id
FROM public.categories c
WHERE c.slug = 'writing-translation-writing'
  AND s.category_id IS NULL
  AND (
    lower(trim(s.name)) LIKE '%blog writing%'
    OR lower(trim(s.name)) LIKE '%content writing%'
    OR lower(trim(s.name)) LIKE '%article writing%'
    OR lower(trim(s.name)) LIKE '%copywriting%'
    OR lower(trim(s.name)) LIKE '%ghostwriting%'
    OR lower(trim(s.name)) LIKE '%technical writing%'
    OR lower(trim(s.name)) LIKE '%creative writing%'
    OR lower(trim(s.name)) LIKE '%email copywriting%'
    OR lower(trim(s.name)) LIKE '%press release%'
    OR lower(trim(s.name)) LIKE '%product description%'
    OR lower(trim(s.name)) LIKE '%resume writing%'
    OR lower(trim(s.name)) LIKE '%cover letter%'
    OR lower(trim(s.name)) LIKE '%script writing%'
    OR lower(trim(s.name)) LIKE '%speech writing%'
  );

UPDATE public.skills s
SET category_id = c.id
FROM public.categories c
WHERE c.slug = 'writing-translation-translation'
  AND s.category_id IS NULL
  AND (
    lower(trim(s.name)) LIKE '%translation%'
    OR lower(trim(s.name)) LIKE '%localization%'
    OR lower(trim(s.name)) LIKE '%localisation%'
  );

UPDATE public.skills s
SET category_id = c.id
FROM public.categories c
WHERE c.slug = 'writing-translation-editing-proofreading'
  AND s.category_id IS NULL
  AND (
    lower(trim(s.name)) LIKE '%proofread%'
    OR lower(trim(s.name)) LIKE '%proof-read%'
    OR lower(trim(s.name)) LIKE '%editing%'
    OR lower(trim(s.name)) LIKE '%editor%'
  );

-- Video & animation
UPDATE public.skills s
SET category_id = c.id
FROM public.categories c
WHERE c.slug = 'video-animation-animation'
  AND s.category_id IS NULL
  AND (
    lower(trim(s.name)) LIKE '%after effects%'
    OR lower(trim(s.name)) LIKE '%motion graphics%'
    OR lower(trim(s.name)) LIKE '%animat%'
    OR lower(trim(s.name)) LIKE '%explainer video%'
    OR lower(trim(s.name)) LIKE '%logo animation%'
    OR lower(trim(s.name)) LIKE '%2d animation%'
    OR lower(trim(s.name)) LIKE '%3d animation%'
  );

UPDATE public.skills s
SET category_id = c.id
FROM public.categories c
WHERE c.slug = 'video-animation-video-production'
  AND s.category_id IS NULL
  AND (
    lower(trim(s.name)) LIKE '%video edit%'
    OR lower(trim(s.name)) LIKE '%premiere%'
    OR lower(trim(s.name)) LIKE '%davinci%'
    OR lower(trim(s.name)) LIKE '%final cut%'
    OR lower(trim(s.name)) LIKE '%videograph%'
    OR lower(trim(s.name)) LIKE '%drone%'
    OR lower(trim(s.name)) LIKE '%wedding video%'
  );

UPDATE public.skills s
SET category_id = c.id
FROM public.categories c
WHERE c.slug = 'video-animation-post-production'
  AND s.category_id IS NULL
  AND (
    lower(trim(s.name)) LIKE '%color grad%'
    OR lower(trim(s.name)) LIKE '%colour grad%'
    OR lower(trim(s.name)) LIKE '%vfx%'
    OR lower(trim(s.name)) LIKE '%visual effect%'
    OR lower(trim(s.name)) LIKE '%sound design%'
    OR lower(trim(s.name)) LIKE '%subtitl%'
    OR lower(trim(s.name)) LIKE '%caption%'
  );

-- Design & creative
UPDATE public.skills s
SET category_id = c.id
FROM public.categories c
WHERE c.slug = 'design-creative-ui-ux-design'
  AND s.category_id IS NULL
  AND (
    lower(trim(s.name)) LIKE '%ui/ux%'
    OR lower(trim(s.name)) LIKE '%ui ux%'
    OR lower(trim(s.name)) LIKE '%figma%'
    OR lower(trim(s.name)) LIKE '%wirefram%'
    OR lower(trim(s.name)) LIKE '%prototype%'
    OR lower(trim(s.name)) LIKE '%usability%'
    OR lower(trim(s.name)) LIKE '%design system%'
  );

UPDATE public.skills s
SET category_id = c.id
FROM public.categories c
WHERE c.slug = 'design-creative-graphic-design'
  AND s.category_id IS NULL
  AND (
    lower(trim(s.name)) LIKE '%photoshop%'
    OR lower(trim(s.name)) LIKE '%illustrator%'
    OR lower(trim(s.name)) LIKE '%indesign%'
    OR lower(trim(s.name)) LIKE '%logo design%'
    OR lower(trim(s.name)) LIKE '%graphic design%'
    OR lower(trim(s.name)) LIKE '%brand design%'
    OR lower(trim(s.name)) LIKE '%poster%'
    OR lower(trim(s.name)) LIKE '%flyer%'
    OR lower(trim(s.name)) LIKE '%packaging design%'
  );

UPDATE public.skills s
SET category_id = c.id
FROM public.categories c
WHERE c.slug = 'design-creative-3d-design'
  AND s.category_id IS NULL
  AND (
    lower(trim(s.name)) LIKE '%blender%'
    OR lower(trim(s.name)) LIKE '%cinema 4d%'
    OR lower(trim(s.name)) LIKE '%c4d%'
    OR lower(trim(s.name)) LIKE '%3d model%'
    OR lower(trim(s.name)) LIKE '%3ds max%'
    OR lower(trim(s.name)) LIKE '%maya%'
  );

-- Technology & development (broad catch-all for common engineering tags)
UPDATE public.skills s
SET category_id = c.id
FROM public.categories c
WHERE c.slug = 'technology-development-web-development'
  AND s.category_id IS NULL
  AND (
    lower(trim(s.name)) LIKE '%web dev%'
    OR lower(trim(s.name)) LIKE '%web development%'
    OR lower(trim(s.name)) LIKE '%frontend%'
    OR lower(trim(s.name)) LIKE '%front-end%'
    OR lower(trim(s.name)) LIKE '%front end%'
    OR lower(trim(s.name)) LIKE '%backend%'
    OR lower(trim(s.name)) LIKE '%back-end%'
    OR lower(trim(s.name)) LIKE '%full stack%'
    OR lower(trim(s.name)) LIKE '%full-stack%'
    OR lower(trim(s.name)) LIKE '%react%'
    OR lower(trim(s.name)) LIKE '%vue%'
    OR lower(trim(s.name)) LIKE '%angular%'
    OR lower(trim(s.name)) LIKE '%next.js%'
    OR lower(trim(s.name)) LIKE '%nextjs%'
    OR lower(trim(s.name)) LIKE '%node%'
    OR lower(trim(s.name)) LIKE '%express%'
    OR lower(trim(s.name)) LIKE '%javascript%'
    OR lower(trim(s.name)) LIKE '%typescript%'
    OR lower(trim(s.name)) LIKE '%html%'
    OR lower(trim(s.name)) LIKE '%css%'
    OR lower(trim(s.name)) LIKE '%sass%'
    OR lower(trim(s.name)) LIKE '%scss%'
    OR lower(trim(s.name)) LIKE '%tailwind%'
    OR lower(trim(s.name)) LIKE '%wordpress%'
    OR lower(trim(s.name)) LIKE '%shopify%'
    OR lower(trim(s.name)) LIKE '%php%'
    OR lower(trim(s.name)) LIKE '%laravel%'
    OR lower(trim(s.name)) LIKE '%django%'
    OR lower(trim(s.name)) LIKE '%ruby on rails%'
    OR lower(trim(s.name)) LIKE '%rails %'
    OR lower(trim(s.name)) LIKE '%.net%'
    OR lower(trim(s.name)) LIKE '%asp.net%'
  );

UPDATE public.skills s
SET category_id = c.id
FROM public.categories c
WHERE c.slug = 'technology-development-mobile-development'
  AND s.category_id IS NULL
  AND (
    lower(trim(s.name)) LIKE '%ios dev%'
    OR lower(trim(s.name)) LIKE '%android dev%'
    OR lower(trim(s.name)) LIKE '%swift%'
    OR lower(trim(s.name)) LIKE '%kotlin%'
    OR lower(trim(s.name)) LIKE '%flutter%'
    OR lower(trim(s.name)) LIKE '%react native%'
  );

UPDATE public.skills s
SET category_id = c.id
FROM public.categories c
WHERE c.slug = 'technology-development-software-development'
  AND s.category_id IS NULL
  AND (
    lower(trim(s.name)) LIKE '%python%'
    OR lower(trim(s.name)) LIKE '%java %'
    OR lower(trim(s.name)) LIKE 'java'
    OR lower(trim(s.name)) LIKE '%c++%'
    OR lower(trim(s.name)) LIKE '%c#%'
    OR lower(trim(s.name)) LIKE '%go lang%'
    OR lower(trim(s.name)) LIKE '%golang%'
    OR lower(trim(s.name)) LIKE '%rust %'
    OR lower(trim(s.name)) LIKE 'rust'
    OR lower(trim(s.name)) LIKE '%api %'
    OR lower(trim(s.name)) LIKE '%sql%'
    OR lower(trim(s.name)) LIKE '%postgresql%'
    OR lower(trim(s.name)) LIKE '%mysql%'
    OR lower(trim(s.name)) LIKE '%mongodb%'
    OR lower(trim(s.name)) LIKE '%aws%'
    OR lower(trim(s.name)) LIKE '%azure%'
    OR lower(trim(s.name)) LIKE '%gcp%'
    OR lower(trim(s.name)) LIKE '%docker%'
    OR lower(trim(s.name)) LIKE '%kubernetes%'
    OR lower(trim(s.name)) LIKE '%microservice%'
  );
