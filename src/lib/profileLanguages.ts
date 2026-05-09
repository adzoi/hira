/** იგივე სია პროფილში და ონბორდინგში — უმეტესობა რიგით. */
export const PROFILE_LANGUAGE_OPTIONS: readonly string[] = [
  "ქართული",
  "English",
  "Русский",
  "Deutsch",
  "Français",
  "Español",
  "Italiano",
  "Português",
  "Nederlands",
  "Polski",
  "Українська",
  "Türkçe",
  "العربية",
  "हिन्दी",
  "中文 (Mandarin)",
  "日本語",
  "한국어",
  "Svenska",
  "Norsk",
  "Dansk",
  "Suomi",
  "Čeština",
  "Magyar",
  "Română",
  "Български",
  "Ελληνικά",
  "עברית",
  "فارسی",
] as const

/**
 * Extra searchable fragments (lowercase Latin / Cyrillic / digits where helpful).
 * Georgian keywords so typing e.g. „ინგლისური“ still finds English.
 */
export const PROFILE_LANGUAGE_SEARCH_TERMS: Record<string, readonly string[]> = {
  ქართული: ["georgian", "kartuli", "geo", "საქართველო", "kartuli ena"],
  English: [
    "english",
    "eng",
    "ინგლისური",
    "ინგლისური ენა",
    "английский",
    "англійська",
    "inglisuri",
  ],
  Русский: ["russian", "rus", "русский", "რუსული", "რუსი", "რუსული ენა"],
  Deutsch: ["german", "deutsch", "alemán", "გერმანული", "გერმანია", "немецкий"],
  Français: ["french", "français", "francais", "ფრანგული", "ფრანგული ენა"],
  Español: ["spanish", "español", "espanol", "ესპანური", "испанский"],
  Italiano: ["italian", "italiano", "იტალიური"],
  Português: ["portuguese", "português", "portugues", "პორტუგალიური"],
  Nederlands: ["dutch", "nederlands", "holland", "ჰოლანდიური", "ნიდერლანდური"],
  Polski: ["polish", "polski", "polska", "პოლონური"],
  Українська: ["ukrainian", "українська", "украинский", "უკრაინული"],
  Türkçe: ["turkish", "türkçe", "turkce", "თურქული"],
  العربية: ["arabic", "arab", "арабский", "არაბული"],
  हिन्दी: ["hindi", "india", "हिन्दी", "ჰინდი"],
  "中文 (Mandarin)": ["chinese", "mandarin", "china", "中文", "ჩინური", "კიტალური"],
  日本語: ["japanese", "japan", "nihongo", "日本", "იაპონური"],
  한국어: ["korean", "korea", "hangul", "კორეული"],
  Svenska: ["swedish", "sweden", "შვედური"],
  Norsk: ["norwegian", "norway", "ნორვეგიული"],
  Dansk: ["danish", "denmark", "დანიური"],
  Suomi: ["finnish", "finland", "ფინური"],
  Čeština: ["czech", "čeština", "cestina", "ჩეხური"],
  Magyar: ["hungarian", "magyar", "უნგრული"],
  Română: ["romanian", "română", "romana", "რუმინული"],
  Български: ["bulgarian", "български", "ბულგარული"],
  Ελληνικά: ["greek", "greece", "ελληνικά", "ბერძნული"],
  עברית: ["hebrew", "israel", "ივრითი"],
  فارسی: ["persian", "farsi", "iran", "სპარსული"],
}

/** True if `option` should appear when user types `rawQuery` (Latin, Georgian, Cyrillic, etc.). */
export function profileLanguageMatchesQuery(option: string, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return true
  const label = option.toLowerCase()
  if (label.includes(q)) return true
  const extras = PROFILE_LANGUAGE_SEARCH_TERMS[option]
  if (!extras?.length) return false
  return extras.some((t) => {
    const tl = t.toLowerCase()
    return tl.includes(q) || q.includes(tl)
  })
}

export function filterProfileLanguageOptions(rawQuery: string): string[] {
  return PROFILE_LANGUAGE_OPTIONS.filter((opt) => profileLanguageMatchesQuery(opt, rawQuery))
}
