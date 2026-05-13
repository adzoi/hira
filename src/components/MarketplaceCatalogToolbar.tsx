import type { ReactNode, RefObject } from "react"

export type MarketplaceCategory = { id: string; name_ka: string }

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

export default function MarketplaceCatalogToolbar({
  eyebrow,
  title,
  searchLabel = "ძიება",
  searchValue,
  onSearchChange,
  searchPlaceholder,
  categories = [],
  categoryId = "",
  onCategoryChange = () => {},
  categorySlot,
  categoryLabel = "კატეგორია",
  sortValue,
  onSortChange,
  sortOptions,
  sortLabel = "სორტირება",
  advancedDropdownOpen,
  advancedFilterCount,
  onToggleAdvanced,
  advancedDropdownRef,
  onDismissAdvanced,
  onSaveAdvanced,
  onClearDraftAdvanced,
  childrenAdvancedBody,
  locationDisplay,
  showPageHeader = true,
}: MarketplaceCatalogToolbarProps) {
  return (
    <div className="w-full">
      {showPageHeader ? (
        <>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#D4A843]">{eyebrow}</p>
          <h1 className="mt-1 text-2xl font-bold text-[#0088FF] md:text-2xl">{title}</h1>
        </>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-nowrap sm:items-center sm:gap-2 sm:overflow-x-auto sm:overscroll-x-contain sm:pb-1">
        <div className="flex min-w-[220px] max-w-full flex-1 items-center sm:min-w-[240px]">
          <div className="relative w-full">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔎</span>
            <input
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              className="h-10 w-full rounded-full border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:ring-2 focus:ring-[#0088FF]"
              placeholder={searchPlaceholder}
            />
          </div>
        </div>

        {categorySlot ? (
          <div className="shrink-0">{categorySlot}</div>
        ) : (
          <label className="relative inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600">
            <span className="truncate">{categoryLabel}</span>
            <select
              value={categoryId}
              onChange={(event) => onCategoryChange(event.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label={categoryLabel}
            >
              <option value="">{categoryLabel === "ინდუსტრია" ? "ყველა ინდუსტრია" : "ყველა კატეგორია"}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name_ka}
                </option>
              ))}
            </select>
          </label>
        )}

        {locationDisplay !== undefined ? (
          <button
            type="button"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600"
          >
            <span className="truncate">{locationDisplay.trim() || "ლოკაცია"}</span>
          </button>
        ) : null}

        <div className="relative shrink-0" ref={advancedDropdownRef}>
          <button
            type="button"
            aria-expanded={advancedDropdownOpen}
            aria-haspopup="dialog"
            onClick={() => (advancedDropdownOpen ? onDismissAdvanced() : onToggleAdvanced())}
            className={`relative inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600 transition hover:border-slate-400 md:w-auto ${
              advancedDropdownOpen ? "border-slate-400 ring-2 ring-[#0088FF]/30" : ""
            }`}
          >
            გაფართოებული ძიება
            <span className="ml-1 opacity-70" aria-hidden>
              ▾
            </span>
            {!advancedDropdownOpen && advancedFilterCount > 0 ? (
              <span className="ml-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#0088FF] px-1 text-xs font-bold text-white">
                {advancedFilterCount}
              </span>
            ) : null}
          </button>

          {advancedDropdownOpen ? (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/20 md:hidden"
                aria-hidden
                onClick={onDismissAdvanced}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="დეტალური ფილტრები"
                className="absolute left-0 right-0 z-50 mt-2 flex max-h-[min(72vh,560px)] w-full min-w-[min(100%,18rem)] max-w-none flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl md:right-0 md:left-auto md:w-[min(100vw-4rem,24rem)]"
              >
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4">
                  <h2 className="border-l-4 border-[#D4A843] pl-3 text-base font-bold text-[#1B2B4B]">
                    დეტალური ფილტრები
                  </h2>
                  <div className="mt-4 space-y-4">{childrenAdvancedBody}</div>
                </div>

                <div className="shrink-0 space-y-2 border-t border-slate-100 bg-white p-3">
                  <button
                    type="button"
                    onClick={onClearDraftAdvanced}
                    className="h-11 w-full rounded-lg border border-[#D4A843] text-sm font-semibold text-[#1B2B4B] hover:bg-amber-50"
                  >
                    ფილტრების გასუფთავება
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onDismissAdvanced}
                      className="h-11 flex-1 rounded-lg border border-slate-300 text-sm font-semibold text-[#1B2B4B] hover:bg-slate-50"
                    >
                      გაუქმება
                    </button>
                    <button
                      type="button"
                      onClick={onSaveAdvanced}
                      className="h-11 flex-1 rounded-lg bg-[#1B2B4B] text-sm font-semibold text-white hover:bg-[#D4A843] hover:text-[#1B2B4B]"
                    >
                      შენახვა
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <label className="relative inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600">
          <span className="whitespace-nowrap">{sortLabel}</span>
          <select
            value={sortValue}
            onChange={(event) => onSortChange(event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={sortLabel}
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[#0088FF] px-5 text-base font-bold text-white transition hover:bg-[#006ACC] sm:ml-auto"
          onClick={() => onSearchChange(searchValue)}
          aria-label={searchLabel}
        >
          {searchLabel}
        </button>
      </div>
    </div>
  )
}
