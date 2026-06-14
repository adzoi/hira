export const OTHER_CATEGORY_SLUG = "other"

/** Rows from `categories` including optional self-FK `parent_id`. */
export type CategoryBranchRow = {
  id: string
  name_ka: string
  name_en?: string | null
  parent_id: string | null
  slug?: string | null
}

/** Root "Other" category: no mid-level subcategory or specialization pickers. */
export function isOtherRootCategory(rows: CategoryBranchRow[], rootCategoryId: string): boolean {
  const id = rootCategoryId.trim()
  if (!id) return false
  const row = rows.find((r) => r.id === id)
  return String(row?.slug ?? "").trim() === OTHER_CATEGORY_SLUG
}

function sortByNameKa(a: CategoryBranchRow, b: CategoryBranchRow) {
  return a.name_ka.localeCompare(b.name_ka, "ka")
}

/**
 * Top-level categories for pickers: rows with no parent, plus a fallback when the
 * query omits the real root (e.g. root inactive but mids still active) — then every
 * returned row has a non-null `parent_id` pointing outside the rowset, and we treat
 * those as effective roots so the UI is not empty.
 */
export function categoryRoots(rows: CategoryBranchRow[]): CategoryBranchRow[] {
  const strictRoots = rows.filter((r) => r.parent_id == null).sort(sortByNameKa)
  if (strictRoots.length > 0) return strictRoots
  if (rows.length === 0) return []

  const inside = new Set(rows.map((r) => r.id))
  return rows
    .filter((r) => {
      const pid = r.parent_id
      return pid == null || !inside.has(pid)
    })
    .sort(sortByNameKa)
}

/** Direct children of a parent category id. */
export function categoryChildrenOf(rows: CategoryBranchRow[], parentId: string): CategoryBranchRow[] {
  return rows.filter((r) => r.parent_id === parentId).sort(sortByNameKa)
}

/**
 * Walk from any category up to the top-level row and return that root id,
 * or "" if the id is missing from the tree.
 */
export function rootIdContainingCategory(rows: CategoryBranchRow[], categoryId: string): string {
  const byId = new Map(rows.map((r) => [r.id, r]))
  let cur = byId.get(categoryId)
  while (cur?.parent_id) {
    cur = byId.get(cur.parent_id)
  }
  return cur?.id ?? ""
}

/**
 * Toolbar / filter options: hide "group-only" roots that only exist to hold children
 * (e.g. "Technology & Development"), but keep roots that have no child rows.
 */
export function catalogToolbarCategories(rows: CategoryBranchRow[]): CategoryBranchRow[] {
  const idsThatAppearAsParent = new Set(
    rows.map((r) => r.parent_id).filter((id): id is string => Boolean(id)),
  )
  return rows.filter((r) => r.parent_id != null || !idsThatAppearAsParent.has(r.id)).sort(sortByNameKa)
}

/** Category ids that have at least one child row under `parent_id`. */
export function categoryIdsWithChildren(rows: CategoryBranchRow[]): Set<string> {
  return new Set(rows.map((r) => r.parent_id).filter((id): id is string => Boolean(id)))
}

/**
 * When the user picks a row from the marketplace category dropdown, treat a match as:
 * the entity’s `categoryId` is that row or a descendant in the `categories` tree, or
 * the entity’s listing/job `subcategoryId` (from `subcategories`) belongs to a parent
 * category that satisfies the same rule.
 */
export function catalogSelectionMatchesEntity(
  rows: CategoryBranchRow[],
  selectedId: string,
  entity: { categoryId: string | null; subcategoryId: string | null },
  subcategoryParentCategoryId: Map<string, string>,
): boolean {
  const sel = selectedId.trim()
  if (!sel) return true
  if (!entity.categoryId && !entity.subcategoryId) return false

  if (entity.subcategoryId && entity.subcategoryId === sel) return true

  const byId = new Map(rows.map((r) => [r.id, r]))

  const nodeIsSelfOrUnderSelected = (nodeId: string | null): boolean => {
    if (!nodeId) return false
    let cur: CategoryBranchRow | undefined = byId.get(nodeId)
    while (cur) {
      if (cur.id === sel) return true
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
    }
    return false
  }

  if (entity.categoryId && nodeIsSelfOrUnderSelected(entity.categoryId)) return true

  const subParent =
    entity.subcategoryId != null && entity.subcategoryId !== ""
      ? (subcategoryParentCategoryId.get(entity.subcategoryId) ?? null)
      : null
  if (subParent && nodeIsSelfOrUnderSelected(subParent)) return true

  return false
}

/** Deepest chosen level wins: specialization (subcategory id) → mid category → root. */
export function effectiveCatalogFilterId(
  rootCategoryId: string,
  midCategoryId: string,
  specializationSubcategoryId: string,
): string {
  const spec = specializationSubcategoryId.trim()
  if (spec) return spec
  const mid = midCategoryId.trim()
  if (mid) return mid
  return rootCategoryId.trim()
}
