import { FORUM_CATEGORIES, forumCategoryLabelKey, forumSubcategoryLabelKey } from "../lib/forumCategories.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"

const filterBtnBase =
  "w-full rounded-lg border px-3 py-2 text-left text-sm transition"

type ForumCategoryFilterProps = {
  selectedCategory: string | null
  selectedSubcategory: string | null
  onSelectCategory: (categoryId: string | null) => void
  onSelectSubcategory: (subcategoryId: string | null) => void
}

export default function ForumCategoryFilter({
  selectedCategory,
  selectedSubcategory,
  onSelectCategory,
  onSelectSubcategory,
}: ForumCategoryFilterProps) {
  const { t } = useTranslation()

  const activeCategory = selectedCategory
    ? FORUM_CATEGORIES.find((c) => c.id === selectedCategory)
    : null

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold uppercase tracking-wide text-[#1B2B4B]">{t("forum.filterTitle")}</h2>

      <div className="mt-3 space-y-1">
        <button
          type="button"
          onClick={() => {
            onSelectCategory(null)
            onSelectSubcategory(null)
          }}
          className={`${filterBtnBase} ${
            !selectedCategory
              ? "border-[#0088FF] bg-[#E8F4FF] font-semibold text-[#0088FF]"
              : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
          }`}
        >
          {t("forum.allCategories")}
        </button>

        {FORUM_CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat.id && !selectedSubcategory
          return (
            <div key={cat.id}>
              <button
                type="button"
                onClick={() => {
                  onSelectCategory(cat.id)
                  onSelectSubcategory(null)
                }}
                className={`${filterBtnBase} ${
                  isActive
                    ? "border-[#0088FF] bg-[#E8F4FF] font-semibold text-[#0088FF]"
                    : selectedCategory === cat.id
                      ? "border-[#0088FF]/40 bg-[#E8F4FF]/50 font-medium text-[#1B2B4B]"
                      : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {t(forumCategoryLabelKey(cat.id))}
              </button>

              {selectedCategory === cat.id ? (
                <div className="ml-3 mt-1 space-y-1 border-l-2 border-[#0088FF]/30 pl-2">
                  {cat.subcategories.map((sub) => {
                    const subActive = selectedSubcategory === sub.id
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => {
                          onSelectCategory(cat.id)
                          onSelectSubcategory(sub.id)
                        }}
                        className={`${filterBtnBase} text-xs ${
                          subActive
                            ? "border-[#0088FF] bg-[#E8F4FF] font-semibold text-[#0088FF]"
                            : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {t(forumSubcategoryLabelKey(cat.id, sub.id))}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      {activeCategory && selectedSubcategory ? (
        <p className="mt-4 text-xs text-slate-500">
          {t("forum.activeFilter")}: {t(forumCategoryLabelKey(activeCategory.id))} /{" "}
          {t(forumSubcategoryLabelKey(activeCategory.id, selectedSubcategory))}
        </p>
      ) : activeCategory ? (
        <p className="mt-4 text-xs text-slate-500">
          {t("forum.activeFilter")}: {t(forumCategoryLabelKey(activeCategory.id))}
        </p>
      ) : null}
    </aside>
  )
}
