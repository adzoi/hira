/** Stored filter values; cities use Georgian spelling for matching. */
export const LOCATION_REMOTE = "__remote__"
export const LOCATION_HYBRID = "__hybrid__"

/** UI label for `profiles.city` when it holds a sentinel or a Georgian city name. */
export function formatCityForDisplay(city: string | null | undefined): string | null {
  if (city == null || !String(city).trim()) return null
  const c = String(city).trim()
  if (c === LOCATION_REMOTE) return "დისტანციური"
  if (c === LOCATION_HYBRID) return "შერეული (Hybrid)"
  return c
}

/** Major cities and large towns commonly used for matching. */
export const GEORGIA_CITY_LABELS = [
  "თბილისი",
  "ბათუმი",
  "ქუთაისი",
  "რუსთავი",
  "გორი",
  "ზუგდიდი",
  "ფოთი",
  "ხაშური",
  "სამტრედია",
  "ზესტაფონი",
  "მარნეული",
  "თელავი",
  "ახალციხე",
  "ოზურგეთი",
  "სენაკი",
  "ხონი",
  "ქობულეთი",
  "სიღნაღი",
  "მარტვილი",
  "დუშეთი",
  "ახმეტა",
  "გარდაბანი",
  "ბორჯომი",
  "წყნეთი",
  "ყვარელი",
  "ბოლნისი",
  "საგარეჯო",
  "მცხეთა",
  "წალენჯიხა",
  "ხელვაჩაური",
] as const

export const CITY_LATIN_ALIASES: Record<string, string[]> = {
  თბილისი: ["tbilisi", "tiflis"],
  ბათუმი: ["batumi"],
  ქუთაისი: ["kutaisi"],
  რუსთავი: ["rustavi"],
  გორი: ["gori"],
  ზუგდიდი: ["zugdidi"],
  ფოთი: ["poti"],
  ხაშური: ["khashuri"],
  სამტრედია: ["samtredia"],
  ზესტაფონი: ["zestaponi"],
  მარნეული: ["marneuli"],
  თელავი: ["telavi"],
  ახალციხე: ["akhaltsikhe"],
  ოზურგეთი: ["ozurgeti"],
  სენაკი: ["senaki"],
  ხონი: ["khoni"],
  ქობულეთი: ["kobuleti"],
  სიღნაღი: ["signagi", "sighnaghi"],
  მარტვილი: ["martvili"],
  დუშეთი: ["dusheti"],
  ახმეტა: ["akhemti", "akmeta"],
  გარდაბანი: ["gardabani"],
  ბორჯომი: ["borjomi"],
  წყნეთი: ["tskneti"],
  ყვარელი: ["kvareli"],
  ბოლნისი: ["bolnisi"],
  საგარეჯო: ["sagarejo"],
  მცხეთა: ["mtskheta"],
  წალენჯიხა: ["tsalenjikha"],
  ხელვაჩაური: ["khelvachauri"],
}

export type LocationMatchEntity = {
  city: string | null
  bio: string | null
  professionalTitle: string
}

export function profileLocationBlob(entity: LocationMatchEntity) {
  return `${entity.city ?? ""} ${entity.bio ?? ""} ${entity.professionalTitle}`.toLowerCase()
}

export function matchesLocationFilter(entity: LocationMatchEntity, filter: string): boolean {
  const trimmed = filter.trim()
  if (!trimmed) return true

  if (trimmed === LOCATION_REMOTE) {
    const blob = profileLocationBlob(entity)
    return /დისტანციურ|remote|online only|work from home|wfh|სრულიად\s*დისტანც|ონლაინ\s*სამუშაო|virtual|digitally|ინტერნეტით/.test(
      blob,
    )
  }

  if (trimmed === LOCATION_HYBRID) {
    const blob = profileLocationBlob(entity)
    return /შერეული|ჰიბრიდ|hybrid|ოფისი\s*\+\s*დისტანც|ოფისისა და დისტანც|ოფისი დისტანციურ|flexible office/.test(
      blob,
    )
  }

  const cityLower = (entity.city ?? "").toLowerCase().trim()
  const needle = trimmed.toLowerCase()
  if (cityLower.includes(needle)) return true
  const aliases = CITY_LATIN_ALIASES[trimmed] ?? []
  return aliases.some((lat) => cityLower.includes(lat.toLowerCase()))
}

/** Jobs: combine DB `location_type` with hirer city / text (e.g. anywhere + ბათუმი). */
export function jobMatchesUnifiedLocation(
  job: {
    city: string | null
    locationType: string
    description: string
    title: string
  },
  filter: string,
): boolean {
  const trimmed = filter.trim()
  if (!trimmed) return true

  const entity: LocationMatchEntity = {
    city: job.city,
    bio: job.description,
    professionalTitle: job.title,
  }

  if (trimmed === LOCATION_REMOTE) {
    return job.locationType === "remote" || matchesLocationFilter(entity, LOCATION_REMOTE)
  }
  if (trimmed === LOCATION_HYBRID) {
    return job.locationType === "hybrid" || matchesLocationFilter(entity, LOCATION_HYBRID)
  }
  if (trimmed === "თბილისი") {
    return (
      job.locationType === "tbilisi" ||
      matchesLocationFilter(entity, "თბილისი") ||
      profileLocationBlob(entity).includes("tbilisi")
    )
  }

  if (job.locationType === "remote" && trimmed !== LOCATION_REMOTE) {
    return matchesLocationFilter(entity, trimmed)
  }
  if (job.locationType === "hybrid" && trimmed !== LOCATION_HYBRID) {
    return matchesLocationFilter(entity, trimmed)
  }
  if (job.locationType === "tbilisi") {
    return trimmed === "თბილისი" || matchesLocationFilter(entity, trimmed)
  }
  if (job.locationType === "anywhere") {
    return matchesLocationFilter(entity, trimmed)
  }

  return matchesLocationFilter(entity, trimmed)
}
