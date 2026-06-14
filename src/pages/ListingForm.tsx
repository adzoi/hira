import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import VIPUpgrade from "../components/VIPUpgrade"
import {
  PRICE_TYPE_LABELS,
  type ListingPriceType,
} from "../lib/listingPrice.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { serviceImageThumbnailUrl } from "../lib/storageImageUrl.ts"
import { categoryChildrenOf, categoryRoots, isOtherRootCategory, type CategoryBranchRow } from "../lib/marketplaceCategoryTree.ts"
import {
  validateListingDescription,
  validateListingTitle,
  validateMoneyAmount,
  validateTags,
} from "../lib/validation.ts"
import { META_PREFIX, META_SUFFIX } from "../lib/listingDescription.ts"
import { fetchListingForm } from "../lib/queries/fetchListingForm.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { pickCategoryName } from "../lib/categoryLocale.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { usePageMeta } from "../lib/usePageMeta.tsx"
import { OptimizedImage } from "../components/OptimizedImage.tsx"
import { compressImageForUpload } from "../lib/compressImageForUpload.ts"

type ListingMeta = {
  categoryId: string | null
  subcategoryId: string | null
  tags: string[]
}

type SubcategoryRow = {
  id: string
  name_ka: string
  name_en?: string | null
  category_id: string
  is_active: boolean | null
}

type TagOption = {
  name: string
  categoryId: string | null
}

const MAX_LISTING_IMAGES = 3
const MAX_INPUT_IMAGE_BYTES = 10 * 1024 * 1024

function buildListingDescription(description: string, meta: ListingMeta) {
  const cleanedMeta: ListingMeta = {
    categoryId: meta.categoryId ?? null,
    subcategoryId: meta.subcategoryId ?? null,
    tags: meta.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
  }
  return `${META_PREFIX}${JSON.stringify(cleanedMeta)}${META_SUFFIX}\n${description.trim()}`
}

export default function ListingFormPage() {
  const { t, locale } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const [listingFormUserId, setListingFormUserId] = useState("")
  const {
    data: listingFormData,
    isLoading: loading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.listingForm(listingFormUserId || "pending", id),
    queryFn: () => fetchListingForm(id),
    enabled: Boolean(listingFormUserId) && isSupabaseConfigured,
  })
  const loadError = isError ? queryErrorMessage(queryError, t("listingForm.loadFailed")) : ""
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const displayError = error || loadError

  const [freelancerProfileId, setFreelancerProfileId] = useState("")
  const [categories, setCategories] = useState<CategoryBranchRow[]>([])
  const [availableTags, setAvailableTags] = useState<TagOption[]>([])

  const [title, setTitle] = useState("")
  const [titleEn, setTitleEn] = useState("")
  const [description, setDescription] = useState("")
  const [descriptionEn, setDescriptionEn] = useState("")
  const [price, setPrice] = useState("")
  const [priceType, setPriceType] = useState<ListingPriceType>("fixed")
  const [isActive, setIsActive] = useState(true)
  /** Mid-level category (e.g. Web Development); stored in listing meta as `categoryId`. */
  const [categoryId, setCategoryId] = useState("")
  const [rootCategoryId, setRootCategoryId] = useState("")
  const [subcategoryId, setSubcategoryId] = useState("")
  const [subcategories, setSubcategories] = useState<SubcategoryRow[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([])
  const [newImageFiles, setNewImageFiles] = useState<File[]>([])
  const [vipOpen, setVipOpen] = useState(false)
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        navigate("/login?reason=listing", { replace: true })
        return
      }
      setListingFormUserId(user.id)
    })
  }, [navigate])

  useEffect(() => {
    if (!listingFormData) return
    if (listingFormData.redirectTo) {
      navigate(listingFormData.redirectTo, { replace: true })
      return
    }
    setFreelancerProfileId(listingFormData.freelancerProfileId)
    setCategories(listingFormData.categories)
    setAvailableTags(listingFormData.availableTags)
    if (listingFormData.edit) {
      const edit = listingFormData.edit
      setTitle(edit.title)
      setTitleEn(edit.titleEn)
      setDescription(edit.description)
      setDescriptionEn(edit.descriptionEn)
      setPrice(edit.price)
      setPriceType(edit.priceType)
      setIsActive(edit.isActive)
      setRootCategoryId(edit.rootCategoryId)
      setCategoryId(edit.categoryId)
      setSubcategoryId(edit.subcategoryId)
      setTags(edit.tags)
      setExistingImageUrls(edit.existingImageUrls)
    }
  }, [listingFormData, navigate])

  const categoryRootsList = useMemo(() => categoryRoots(categories), [categories])
  const categoryMidsList = useMemo(
    () => (rootCategoryId ? categoryChildrenOf(categories, rootCategoryId) : []),
    [categories, rootCategoryId],
  )
  const isOtherCategorySelected = useMemo(
    () => isOtherRootCategory(categories, rootCategoryId),
    [categories, rootCategoryId],
  )

  /** DB `subcategories.category_id`: mid row if mids exist, else standalone root. */
  const specializationParentCategoryId = useMemo(() => {
    if (isOtherCategorySelected) return ""
    if (categoryId.trim()) return categoryId.trim()
    if (rootCategoryId && categoryMidsList.length === 0) return rootCategoryId
    return ""
  }, [categoryId, rootCategoryId, categoryMidsList.length, isOtherCategorySelected])

  const persistedListingCategoryId = useMemo(() => {
    if (isOtherCategorySelected) return rootCategoryId.trim()
    return categoryId.trim() || (rootCategoryId && categoryMidsList.length === 0 ? rootCategoryId.trim() : "")
  }, [categoryId, rootCategoryId, categoryMidsList.length, isOtherCategorySelected])

  const categoryFilteredTags = useMemo(
    () => availableTags.filter((tag) => tag.categoryId === specializationParentCategoryId),
    [availableTags, specializationParentCategoryId],
  )

  useEffect(() => {
    const loadSubs = async () => {
      if (!isSupabaseConfigured || !supabase || !specializationParentCategoryId) {
        setSubcategories([])
        return
      }
      const { data, error: subErr } = await supabase
        .from("subcategories")
        .select("id,name_ka,name_en,category_id,is_active")
        .eq("category_id", specializationParentCategoryId)
        .eq("is_active", true)
        .order("name_ka")
      if (subErr) return
      setSubcategories((data ?? []) as SubcategoryRow[])
    }
    void loadSubs()
  }, [specializationParentCategoryId])

  useEffect(() => {
    if (!specializationParentCategoryId) {
      setTags([])
      return
    }
    const allowed = new Set(categoryFilteredTags.map((tag) => tag.name))
    setTags((prev) => prev.filter((tag) => allowed.has(tag)))
  }, [specializationParentCategoryId, categoryFilteredTags])

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]))
  }

  const removeExistingImage = (url: string) => {
    setExistingImageUrls((prev) => prev.filter((item) => item !== url))
  }

  const removeNewImage = (index: number) => {
    setNewImageFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleImagePick = (files: FileList | null) => {
    if (!files) return
    const incoming = Array.from(files)
    if (incoming.length === 0) return
    const remaining = MAX_LISTING_IMAGES - existingImageUrls.length - newImageFiles.length
    if (remaining <= 0) {
      setError(t("listingForm.maxPhotos", { max: MAX_LISTING_IMAGES }))
      return
    }

    const valid: File[] = []
    for (const file of incoming) {
      if (!file.type.startsWith("image/")) continue
      if (file.size > MAX_INPUT_IMAGE_BYTES) {
        setError(t("listingForm.imageTooBig"))
        continue
      }
      valid.push(file)
    }
    if (valid.length === 0) return
    setError("")
    setNewImageFiles((prev) => [...prev, ...valid].slice(0, Math.max(0, remaining + prev.length)))
  }

  const newImagePreviews = useMemo(
    () => newImageFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [newImageFiles],
  )

  useEffect(() => {
    return () => {
      for (const preview of newImagePreviews) URL.revokeObjectURL(preview.url)
    }
  }, [newImagePreviews])

  const canSubmit = useMemo(() => title.trim().length > 0 && !saving, [title, saving])

  const handleSave = async () => {
    if (!supabase || !freelancerProfileId) return
    setError("")

    const titleResult = validateListingTitle(title)
    if (titleResult.ok === false) {
      setError(titleResult.message)
      return
    }
    const titleEnResult = titleEn.trim()
      ? validateListingTitle(titleEn)
      : ({ ok: true, value: "" } as const)
    if (titleEnResult.ok === false) {
      setError(titleEnResult.message)
      return
    }
    const descriptionResult = validateListingDescription(description)
    if (descriptionResult.ok === false) {
      setError(descriptionResult.message)
      return
    }
    const descriptionEnResult = descriptionEn.trim()
      ? validateListingDescription(descriptionEn)
      : ({ ok: true, value: "" } as const)
    if (descriptionEnResult.ok === false) {
      setError(descriptionEnResult.message)
      return
    }
    const tagsResult = validateTags(tags)
    if (tagsResult.ok === false) {
      setError(tagsResult.message)
      return
    }
    const priceResult = validateMoneyAmount(price || "0", { min: 0, label: t("common.price") })
    if (priceResult.ok === false) {
      setError(priceResult.message)
      return
    }
    if (priceResult.value == null) {
      setError(t("listingForm.priceRequired"))
      return
    }
    const parsedPrice = priceResult.value
    if (subcategoryId.trim() && !subcategories.some((s) => s.id === subcategoryId.trim())) {
      setError(t("listingForm.selectSpecializationOrClear"))
      return
    }

    setSaving(true)
    try {
      const payload: {
        freelancer_profile_id: string
        title: string
        title_en: string | null
        description: string
        description_en: string | null
        price: number
        price_type: ListingPriceType
        is_active: boolean
      } = {
        freelancer_profile_id: freelancerProfileId,
        title: titleResult.value,
        title_en: titleEnResult.value.trim() || null,
        description: buildListingDescription(descriptionResult.value, {
          categoryId: persistedListingCategoryId || null,
          subcategoryId: subcategoryId.trim() || null,
          tags: tagsResult.value,
        }),
        description_en: descriptionEnResult.ok && descriptionEnResult.value.trim()
          ? descriptionEnResult.value.trim()
          : null,
        price: parsedPrice,
        price_type: priceType,
        is_active: isActive,
      }

      let listingId = id ?? null
      if (isEdit && id) {
        const { error: updateError } = await supabase
          .from("services")
          .update(payload)
          .eq("id", id)
          .eq("freelancer_profile_id", freelancerProfileId)
        if (updateError) throw updateError
      } else {
        const { count } = await supabase
          .from("services")
          .select("id", { count: "exact", head: true })
          .eq("freelancer_profile_id", freelancerProfileId)
        if ((count ?? 0) >= 3) throw new Error(t("listingForm.maxListings"))

        const { data: inserted, error: insertError } = await supabase.from("services").insert(payload).select("id").single()
        if (insertError || !inserted) throw insertError ?? new Error(t("listingForm.createFailed"))
        listingId = inserted.id
      }

      if (!listingId) throw new Error(t("listingForm.listingIdNotFound"))

      let uploadedImagePaths: string[] = []
      if (newImageFiles.length > 0) {
        const bucket = "service-images"
        const compressedFiles = await Promise.all(newImageFiles.map((file) => compressImageForUpload(file, "portfolio")))
        uploadedImagePaths = []
        for (let i = 0; i < compressedFiles.length; i += 1) {
          const blob = compressedFiles[i]
          const safeName = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.webp`
          const path = `${freelancerProfileId}/${listingId}/${safeName}`
          const { error: uploadError } = await supabase.storage.from(bucket).upload(path, blob, {
            contentType: "image/webp",
            upsert: false,
          })
          if (uploadError) {
            throw new Error(t("listingForm.imageUploadFailed", { message: uploadError.message }))
          }
          uploadedImagePaths.push(path)
        }
      }

      const finalImageUrls = [...existingImageUrls, ...uploadedImagePaths].slice(0, MAX_LISTING_IMAGES)
      if (finalImageUrls.length !== existingImageUrls.length || uploadedImagePaths.length > 0) {
        const { error: imageSaveError } = await supabase
          .from("services")
          .update({ image_urls: finalImageUrls } as { image_urls: string[] })
          .eq("id", listingId)
          .eq("freelancer_profile_id", freelancerProfileId)
        if (imageSaveError) throw imageSaveError
      }

      navigate("/dashboard", {
        replace: true,
        state: { successMessage: isEdit ? t("listingForm.updatedSuccess") : t("listingForm.addedSuccess") },
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("listingForm.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  const pageMeta = usePageMeta(
    isEdit ? t("listingForm.editTitle") : t("listingForm.newTitle"),
    t("listingForm.metaDescription"),
  )

  if (loading) {
    return (
      <>
        {pageMeta}
        <div className="min-h-screen bg-slate-50">
          <main className="mx-auto max-w-4xl px-6 py-10">{t("common.loading")}</main>
        </div>
      </>
    )
  }

  return (
    <>
      {pageMeta}
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-5 flex items-center justify-between">
            <h1 className={`text-2xl font-bold ${isEdit ? "text-[#1B2B4B]" : "text-[#0088FF]"}`}>
              {isEdit ? t("listingForm.editListing") : t("listingForm.addNew")}
            </h1>
            <Link to="/dashboard" className="text-sm font-semibold text-[#D4A843] hover:underline">
              {t("listingForm.backToDashboard")}
            </Link>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("listingForm.titleRequired")}</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                placeholder={t("listingForm.titlePlaceholder")}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("listingForm.titleEnOptional")}</span>
              <input
                value={titleEn}
                onChange={(event) => setTitleEn(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                placeholder={t("listingForm.titleEnPlaceholder")}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("common.category")}</span>
              <select
                value={rootCategoryId}
                onChange={(event) => {
                  const nextRoot = event.target.value
                  setRootCategoryId(nextRoot)
                  setSubcategoryId("")
                  const mids = nextRoot ? categoryChildrenOf(categories, nextRoot) : []
                  if (!nextRoot) {
                    setCategoryId("")
                  } else if (isOtherRootCategory(categories, nextRoot)) {
                    setCategoryId("")
                  } else if (mids.length === 0) {
                    setCategoryId(nextRoot)
                  } else {
                    setCategoryId("")
                  }
                }}
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
              >
                <option value="">{t("listingForm.selectCategory")}</option>
                {categoryRootsList.map((category) => (
                  <option key={category.id} value={category.id}>
                    {pickCategoryName(category, locale)}
                  </option>
                ))}
              </select>
            </label>

            {!isOtherCategorySelected ? (
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("listingForm.subcategory")}</span>
                <select
                  value={categoryId}
                  disabled={!rootCategoryId || categoryMidsList.length === 0}
                  onChange={(event) => {
                    setCategoryId(event.target.value)
                    setSubcategoryId("")
                  }}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  <option value="">
                    {!rootCategoryId
                      ? t("listingForm.selectSubcategoryFirst")
                      : categoryMidsList.length === 0
                        ? t("listingForm.noSubcategoryForCategory")
                        : t("listingForm.selectSubcategory")}
                  </option>
                  {categoryMidsList.map((category) => (
                    <option key={category.id} value={category.id}>
                      {pickCategoryName(category, locale)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {!isOtherCategorySelected ? (
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("listingForm.subcategorySpecialization")}</span>
                <select
                  value={subcategoryId}
                  disabled={!specializationParentCategoryId}
                  onChange={(event) => setSubcategoryId(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  <option value="">
                    {specializationParentCategoryId
                      ? t("listingForm.selectSpecializationOptional")
                      : t("listingForm.selectSubcategoryOrCategoryFirst")}
                  </option>
                  {subcategories.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {pickCategoryName(sub, locale)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {!isOtherCategorySelected ? (
            <div>
              <p className="mb-1 text-sm font-semibold text-[#1B2B4B]">{t("listingForm.tagsOptional")}</p>
              {!specializationParentCategoryId ? (
                <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  {t("listingForm.tagsHint")}
                </p>
              ) : (
                <>
                  <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-auto rounded-lg border border-slate-200 p-2">
                    {categoryFilteredTags.map((tag) => (
                      <button
                        key={`${tag.name}-${tag.categoryId ?? "none"}`}
                        type="button"
                        onClick={() => toggleTag(tag.name)}
                        className={`rounded-full border px-2 py-1 text-xs ${
                          tags.includes(tag.name)
                            ? "border-[#D4A843] bg-[#D4A843] text-[#1B2B4B]"
                            : "border-slate-300 bg-white text-slate-700"
                        }`}
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {t("listingForm.tagsAfterCategory", { count: tags.length })}
                  </p>
                </>
              )}
            </div>
            ) : null}

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("listingForm.descriptionKa")}</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder={t("listingForm.descriptionPlaceholder")}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("listingForm.descriptionEnOptional")}</span>
              <textarea
                value={descriptionEn}
                onChange={(event) => setDescriptionEn(event.target.value)}
                rows={5}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder={t("listingForm.descriptionEnPlaceholder")}
              />
            </label>

            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-semibold text-[#1B2B4B]">{t("listingForm.priceType")}</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(Object.keys(PRICE_TYPE_LABELS) as ListingPriceType[]).map((key) => (
                    <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                      <input
                        type="radio"
                        name="price_type"
                        checked={priceType === key}
                        onChange={() => setPriceType(key)}
                      />
                      {PRICE_TYPE_LABELS[key]}
                    </label>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("listingForm.priceAmount")}</span>
                <input
                  type="number"
                  min="0"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                />
              </label>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold text-[#1B2B4B]">{t("listingForm.imagesMax")}</p>
              <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    handleImagePick(event.target.files)
                    event.currentTarget.value = ""
                  }}
                  disabled={existingImageUrls.length + newImageFiles.length >= MAX_LISTING_IMAGES}
                  className="block w-full text-xs text-slate-700 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-[#0088FF] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white file:transition-colors file:duration-150 file:hover:bg-[#006ACC]"
                />
                <p className="mt-2 text-xs text-slate-500">
                  {t("listingForm.imagesHint")}
                </p>

                {existingImageUrls.length + newImageFiles.length > 0 ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {existingImageUrls.map((url) => (
                      <div key={url} className="overflow-hidden rounded-md border border-slate-200 bg-white">
                        <OptimizedImage
                          src={supabase ? serviceImageThumbnailUrl(supabase, url) : ""}
                          alt=""
                          width={160}
                          height={80}
                          className="h-20 w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeExistingImage(url)}
                          className="w-full border-t border-slate-200 py-1 text-[11px] font-semibold text-red-600"
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    ))}
                    {newImagePreviews.map((preview, index) => (
                      <div key={`${preview.file.name}-${index}`} className="overflow-hidden rounded-md border border-slate-200 bg-white">
                        <OptimizedImage
                          src={preview.url}
                          alt=""
                          width={160}
                          height={80}
                          className="h-20 w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeNewImage(index)}
                          className="w-full border-t border-slate-200 py-1 text-[11px] font-semibold text-red-600"
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
              {t("listingForm.activeListing")}
            </label>
          </div>

          {displayError ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{displayError}</p> : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSubmit}
              className="h-11 w-full rounded-lg bg-[#0088FF] px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#006ACC] disabled:pointer-events-none disabled:opacity-60 sm:w-auto"
            >
              {saving ? t("common.inProgress") : t("common.save")}
            </button>
            <Link
              to="/dashboard"
              className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-slate-300 px-5 text-sm font-semibold text-slate-700 sm:w-auto"
            >
              {t("common.cancel")}
            </Link>
            {freelancerProfileId ? (
              <button
                type="button"
                onClick={() => setVipOpen(true)}
                className="h-11 w-full rounded-lg border border-[#D4A843] bg-amber-50 px-5 text-sm font-semibold text-[#1B2B4B] sm:w-auto"
                disabled={!id}
                title={!id ? t("listingForm.saveFirstForVip") : undefined}
              >
                {t("listingForm.upgradeVip")}
              </button>
            ) : null}
          </div>
        </div>
      </main>
      {freelancerProfileId && id ? (
        <VIPUpgrade
          open={vipOpen}
          jobId={id}
          jobTitle={title.trim() || t("listingForm.defaultServiceTitle")}
          listingType="freelancer"
          onClose={() => setVipOpen(false)}
          onSuccess={() => {
            setError("")
          }}
        />
      ) : null}
    </div>
  </>
  )
}
