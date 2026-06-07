import type { ReactNode, RefObject } from "react"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { pickCategoryName } from "../lib/categoryLocale.ts"

export type MarketplaceCategory = { id: string; name_ka: string; name_en?: string | null }

type SortOption = { value: string; label: string }

type MarketplaceCatalogToolbarProps = {
  eyebrow: string
  title: string
  searchLabel?: string
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  /** Ignored when `categorySlot` is set. */
  categories?: MarketplaceCategory[]
  categoryId?: string
  onCategoryChange?: (value: string) => void
  /** Replaces the default category `<select>` (e.g. cascading filters). */
  categorySlot?: ReactNode
  categoryLabel?: string
  sortValue: string
  onSortChange: (value: string) => void
  sortOptions: SortOption[]
  sortLabel?: string
  /** Optional read-only display value for the location pill (e.g. "remote", "hybrid", city name). */
  locationDisplay?: string
  /** Replaces the default read-only location pill (e.g. interactive city select). */
  locationSlot?: ReactNode
  /** Override advanced-search pill label (default: common.advancedSearch). */
  advancedSearchLabel?: string
  advancedDropdownOpen: boolean
  advancedFilterCount: number
  onToggleAdvanced: () => void
  advancedDropdownRef: RefObject<HTMLDivElement | null>
  onDismissAdvanced: () => void
  onSaveAdvanced: () => void
  onClearDraftAdvanced: () => void
  childrenAdvancedBody: ReactNode
  /** When false, hide eyebrow + page title (Browse-style filter-only strip). Default true. */
  showPageHeader?: boolean
}

export const marketplaceFilterPillClass =
  "relative inline-flex h-10 min-w-0 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-500"

export default function MarketplaceCatalogToolbar({
  eyebrow,
  title,
  searchLabel,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  categories = [],
  categoryId = "",
  onCategoryChange = () => {},
  categorySlot,
  categoryLabel,
  sortValue,
  onSortChange,
  sortOptions,
  sortLabel,
  advancedDropdownOpen,
  advancedFilterCount,
  onToggleAdvanced,
  advancedDropdownRef,
  onDismissAdvanced,
  onSaveAdvanced,
  onClearDraftAdvanced,
  childrenAdvancedBody,
  locationDisplay,
  locationSlot,
  advancedSearchLabel,
  showPageHeader = true,
}: MarketplaceCatalogToolbarProps) {
  const { t, locale } = useTranslation()
  const resolvedSearchLabel = searchLabel ?? t("common.search")
  const resolvedCategoryLabel = categoryLabel ?? t("common.category")
  const resolvedSortLabel = sortLabel ?? t("common.sort")
  const isIndustryCategory = resolvedCategoryLabel === t("hirers.industry")
  const resolvedAdvancedSearchLabel = advancedSearchLabel ?? t("common.advancedSearch")

  const searchInput = (
    <input
      value={searchValue}
      onChange={(event) => onSearchChange(event.target.value)}
      className="h-10 w-full min-w-0 rounded-full border border-slate-300 bg-white px-3 text-sm text-slate-500 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:ring-2 focus:ring-[#0088FF]"
      placeholder={searchPlaceholder}
    />
  )

  const searchButton = (
    <button
      type="button"
      className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[#0088FF] px-8 text-base font-bold text-white transition hover:bg-[#006ACC]"
      onClick={() => onSearchChange(searchValue)}
      aria-label={resolvedSearchLabel}
    >
      {resolvedSearchLabel}
    </button>
  )

  const defaultCategorySelect = (
    <label className={`${marketplaceFilterPillClass} max-w-[11rem] shrink-0`}>
      <span className="truncate">{resolvedCategoryLabel}</span>
      <span className="shrink-0 text-slate-400">▾</span>
      <select
        value={categoryId}
        onChange={(event) => onCategoryChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={resolvedCategoryLabel}
      >
        <option value="">
          {isIndustryCategory ? t("common.allIndustries") : t("common.allCategories")}
        </option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {pickCategoryName(category, locale)}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="w-full">
      {showPageHeader ? (
        <>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#D4A843]">{eyebrow}</p>
          <h1 className="mt-1 text-2xl font-bold text-[#0088FF] md:text-2xl">{title}</h1>
        </>
      ) : null}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-nowrap sm:items-center sm:gap-2 sm:overflow-x-auto sm:overscroll-x-contain sm:pb-1">
        <div className="hidden min-w-[220px] max-w-full flex-1 sm:block sm:min-w-[240px]">{searchInput}</div>

        <div className="flex w-full flex-nowrap items-center gap-1.5 sm:contents">{categorySlot ?? defaultCategorySelect}</div>

        <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto overscroll-x-contain sm:flex-wrap sm:overflow-visible sm:contents">
          {locationSlot ??
            (locationDisplay !== undefined ? (
              <button type="button" className={`${marketplaceFilterPillClass} hidden shrink-0 sm:inline-flex`}>
                <span className="truncate">{locationDisplay.trim() || t("common.location")}</span>
                <span className="shrink-0 text-slate-400">▾</span>
              </button>
            ) : null)}

          <div className="relative shrink-0" ref={advancedDropdownRef}>
            <button
              type="button"
              aria-expanded={advancedDropdownOpen}
              aria-haspopup="dialog"
              onClick={() => (advancedDropdownOpen ? onDismissAdvanced() : onToggleAdvanced())}
              className={`${marketplaceFilterPillClass} transition hover:border-slate-400 ${
                advancedDropdownOpen ? "border-slate-400 ring-2 ring-[#0088FF]/30" : ""
              }`}
            >
              <span className="truncate">{resolvedAdvancedSearchLabel}</span>
              <span className="shrink-0 text-slate-400" aria-hidden>
                ▾
              </span>
              {!advancedDropdownOpen && advancedFilterCount > 0 ? (
                <span className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-[#0088FF] px-1 text-xs font-bold text-white">
                  {advancedFilterCount}
                </span>
              ) : null}
            </button>

            {advancedDropdownOpen ? (
              <>
                <div className="fixed inset-0 z-40 bg-black/20 md:hidden" aria-hidden onClick={onDismissAdvanced} />
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label={t("common.detailedFilters")}
                  className="absolute left-0 right-0 z-50 mt-2 flex max-h-[min(72vh,560px)] w-full min-w-[min(100%,18rem)] max-w-none flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl md:right-0 md:left-auto md:w-[min(100vw-4rem,24rem)]"
                >
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4">
                    <h2 className="border-l-4 border-[#D4A843] pl-3 text-base font-bold text-[#1B2B4B]">
                      {t("common.detailedFilters")}
                    </h2>
                    <div className="mt-4 space-y-4">{childrenAdvancedBody}</div>
                  </div>

                  <div className="shrink-0 space-y-2 border-t border-slate-100 bg-white p-3">
                    <button
                      type="button"
                      onClick={onClearDraftAdvanced}
                      className="h-11 w-full rounded-lg border border-[#D4A843] text-sm font-semibold text-[#1B2B4B] hover:bg-amber-50"
                    >
                      {t("common.clearFilters")}
                    </button>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={onDismissAdvanced}
                        className="h-11 flex-1 rounded-lg border border-slate-300 text-sm font-semibold text-[#1B2B4B] hover:bg-slate-50"
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={onSaveAdvanced}
                        className="h-11 flex-1 rounded-lg bg-[#1B2B4B] text-sm font-semibold text-white hover:bg-[#D4A843] hover:text-[#1B2B4B]"
                      >
                        {t("common.save")}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <label className={`${marketplaceFilterPillClass} shrink-0`}>
            <span className="truncate">{resolvedSortLabel}</span>
            <span className="shrink-0 text-slate-400">▾</span>
            <select
              value={sortValue}
              onChange={(event) => onSortChange(event.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label={resolvedSortLabel}
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-row items-center gap-2 sm:contents">
          <div className="min-w-0 flex-1 sm:hidden">{searchInput}</div>
          <div className="shrink-0 sm:ml-auto">{searchButton}</div>
        </div>
      </div>
    </div>
  )
}
