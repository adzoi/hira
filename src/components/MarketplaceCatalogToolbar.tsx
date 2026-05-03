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
  categories: MarketplaceCategory[]
  categoryId: string
  onCategoryChange: (value: string) => void
  categoryLabel?: string
  sortValue: string
  onSortChange: (value: string) => void
  sortOptions: SortOption[]
  sortLabel?: string
  advancedDropdownOpen: boolean
  advancedFilterCount: number
  onToggleAdvanced: () => void
  advancedDropdownRef: RefObject<HTMLDivElement | null>
  onDismissAdvanced: () => void
  onSaveAdvanced: () => void
  onClearDraftAdvanced: () => void
  childrenAdvancedBody: ReactNode
}

export default function MarketplaceCatalogToolbar({
  eyebrow,
  title,
  searchLabel = "ძიება",
  searchValue,
  onSearchChange,
  searchPlaceholder,
  categories,
  categoryId,
  onCategoryChange,
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
}: MarketplaceCatalogToolbarProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-[#D4A843]">{eyebrow}</p>
      <h1 className="mt-1 text-xl font-extrabold text-[#1B2B4B] md:text-2xl">{title}</h1>

      <label className="mt-5 block">
        <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{searchLabel}</span>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔎</span>
          <input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-12 w-full rounded-lg border border-slate-300 pl-10 pr-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
            placeholder={searchPlaceholder}
          />
        </div>
      </label>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="block min-w-0 sm:min-w-[200px] sm:flex-1 sm:max-w-[320px]">
          <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{categoryLabel}</span>
          <select
            value={categoryId}
            onChange={(event) => onCategoryChange(event.target.value)}
            className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium outline-none ring-[#1B2B4B] focus:ring-2"
          >
            <option value="">{categoryLabel === "ინდუსტრია" ? "ყველა ინდუსტრია" : "ყველა კატეგორია"}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name_ka}
              </option>
            ))}
          </select>
        </label>

        <div className="relative shrink-0 sm:pb-px" ref={advancedDropdownRef}>
          <button
            type="button"
            aria-expanded={advancedDropdownOpen}
            aria-haspopup="dialog"
            onClick={() => (advancedDropdownOpen ? onDismissAdvanced() : onToggleAdvanced())}
            className={`relative inline-flex h-12 w-full items-center justify-center rounded-lg border px-4 text-sm font-semibold transition md:w-auto ${
              advancedDropdownOpen
                ? "border-[#1B2B4B] bg-[#1B2B4B] text-white"
                : "border-slate-300 bg-white text-[#1B2B4B] hover:border-[#D4A843]"
            }`}
          >
            გაფართოებული ძიება
            <span className="ml-1 opacity-70" aria-hidden>
              ▾
            </span>
            {!advancedDropdownOpen && advancedFilterCount > 0 ? (
              <span className="ml-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#D4A843] px-1 text-xs font-bold text-[#1B2B4B]">
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

        <label className="flex min-w-0 shrink-0 items-center gap-2 text-sm font-semibold text-[#1B2B4B] sm:ml-auto">
          <span className="whitespace-nowrap">{sortLabel}</span>
          <select
            value={sortValue}
            onChange={(event) => onSortChange(event.target.value)}
            className="h-12 min-w-[10.5rem] rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}
