-- Music & Audio: root → mid categories → specializations (subcategories table).
-- Idempotent: safe to re-run; does not remove other category trees.

-- Root
INSERT INTO public.categories (name_en, name_ka, slug, sort_order, is_active, parent_id)
SELECT
  'Music & Audio',
  'მუსიკა და აუდიო',
  'music-audio',
  (SELECT COALESCE(MAX(c2.sort_order), 0) + 1 FROM public.categories c2),
  true,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = 'music-audio');

-- Mid-level (groupings under Music & Audio)
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
    (1, 'Music Production', 'მუსიკალური პროდუქცია', 'music-audio-music-production'),
    (2, 'Voice Services', 'ხმოვანი სერვისები', 'music-audio-voice-services'),
    (3, 'Sound Design', 'ხმის დიზაინი', 'music-audio-sound-design')
) AS v(ord, name_en, name_ka, slug)
WHERE r.slug = 'music-audio'
  AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = v.slug);

-- Specializations
INSERT INTO public.subcategories (category_id, name_en, name_ka, slug, is_active)
SELECT c.id, v.name_en, v.name_ka, v.slug, true
FROM (
  VALUES
    -- Music Production
    ('music-audio-music-production', 'Music Composition', 'Music Composition', 'music-audio-music-production-music-composition'),
    ('music-audio-music-production', 'Beat Making', 'Beat Making', 'music-audio-music-production-beat-making'),
    ('music-audio-music-production', 'Mixing & Mastering', 'Mixing & Mastering', 'music-audio-music-production-mixing-mastering'),
    ('music-audio-music-production', 'Audio Editing', 'Audio Editing', 'music-audio-music-production-audio-editing'),
    ('music-audio-music-production', 'Podcast Editing', 'Podcast Editing', 'music-audio-music-production-podcast-editing'),
    -- Voice Services
    ('music-audio-voice-services', 'Voice Over (Georgian)', 'Voice Over (Georgian)', 'music-audio-voice-services-voice-over-georgian'),
    ('music-audio-voice-services', 'Voice Over (English)', 'Voice Over (English)', 'music-audio-voice-services-voice-over-english'),
    ('music-audio-voice-services', 'Narration', 'Narration', 'music-audio-voice-services-narration'),
    ('music-audio-voice-services', 'Dubbing', 'Dubbing', 'music-audio-voice-services-dubbing'),
    ('music-audio-voice-services', 'Audio Book Recording', 'Audio Book Recording', 'music-audio-voice-services-audio-book-recording'),
    -- Sound Design
    ('music-audio-sound-design', 'Sound Effects', 'Sound Effects', 'music-audio-sound-design-sound-effects'),
    ('music-audio-sound-design', 'Foley', 'Foley', 'music-audio-sound-design-foley'),
    ('music-audio-sound-design', 'Game Audio', 'Game Audio', 'music-audio-sound-design-game-audio'),
    ('music-audio-sound-design', 'Film Scoring', 'Film Scoring', 'music-audio-sound-design-film-scoring')
) AS v(parent_slug, name_en, name_ka, slug)
JOIN public.categories c ON c.slug = v.parent_slug
WHERE NOT EXISTS (SELECT 1 FROM public.subcategories s WHERE s.slug = v.slug);
