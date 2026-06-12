/** Hardcoded forum category tree — labels resolved via i18n keys. */

export type ForumSubcategoryDef = {
  id: string
}

export type ForumCategoryDef = {
  id: string
  subcategories: ForumSubcategoryDef[]
}

export const FORUM_CATEGORIES: ForumCategoryDef[] = [
  {
    id: "general",
    subcategories: [
      { id: "announcements" },
      { id: "introductions" },
      { id: "off-topic" },
    ],
  },
  {
    id: "work-jobs",
    subcategories: [
      { id: "job-offers" },
      { id: "job-search" },
      { id: "freelance" },
    ],
  },
  {
    id: "qa",
    subcategories: [
      { id: "technical" },
      { id: "career" },
    ],
  },
  {
    id: "community",
    subcategories: [
      { id: "events" },
      { id: "resources" },
      { id: "feedback" },
    ],
  },
]

export function forumCategoryLabelKey(categoryId: string): string {
  return `forum.categories.${categoryId}`
}

export function forumSubcategoryLabelKey(categoryId: string, subcategoryId: string): string {
  return `forum.subcategories.${categoryId}.${subcategoryId}`
}

export function findForumCategory(categoryId: string): ForumCategoryDef | undefined {
  return FORUM_CATEGORIES.find((c) => c.id === categoryId)
}

export function findForumSubcategory(
  categoryId: string,
  subcategoryId: string,
): ForumSubcategoryDef | undefined {
  return findForumCategory(categoryId)?.subcategories.find((s) => s.id === subcategoryId)
}

export function isValidForumCategoryPair(categoryId: string, subcategoryId: string): boolean {
  return Boolean(findForumSubcategory(categoryId, subcategoryId))
}

export function subcategoriesForCategory(categoryId: string): ForumSubcategoryDef[] {
  return findForumCategory(categoryId)?.subcategories ?? []
}
