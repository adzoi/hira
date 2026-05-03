import { GEORGIA_CITY_LABELS, LOCATION_HYBRID, LOCATION_REMOTE } from "../lib/marketplaceFilters.ts"

const PRESET_LOCATION_VALUES = new Set<string>([LOCATION_REMOTE, LOCATION_HYBRID, ...GEORGIA_CITY_LABELS])

type LocationFilterSelectProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  className?: string
  /**
   * `filter` — marketplace filters, leading option „ნებისმიერი”.
   * `form` — რეგისტრაცია / პროფილი: mandatory placeholder, ქალაქები + Remote/Hybrid.
   */
  variant?: "filter" | "form"
}

export default function LocationFilterSelect({
  id,
  value,
  onChange,
  className,
  variant = "filter",
}: LocationFilterSelectProps) {
  const showLegacy =
    variant === "form" && value.trim() !== "" && !PRESET_LOCATION_VALUES.has(value)

  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={
        className ??
        "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
      }
    >
      {variant === "filter" ? (
        <option value="">ნებისმიერი</option>
      ) : (
        <option value="">აირჩიეთ ქალაქი / ლოკაცია</option>
      )}
      {showLegacy ? (
        <option value={value}>{value} (არსებული მნიშვნელობა)</option>
      ) : null}
      <option value={LOCATION_REMOTE}>დისტანციური (Remote)</option>
      <option value={LOCATION_HYBRID}>შერეული (Hybrid)</option>
      <optgroup label="საქართველოს ქალაქები">
        {GEORGIA_CITY_LABELS.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </optgroup>
    </select>
  )
}
