import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { jobImageThumbnailUrl } from "../lib/storageImageUrl.ts"
import { categoryChildrenOf, categoryRoots, isOtherRootCategory, type CategoryBranchRow } from "../lib/marketplaceCategoryTree.ts"
import { formatJobBudget, PRICE_TYPE_LABELS } from "../lib/listingPrice.ts"
import {
  encodeJobContactPreference,
  JOB_CONTACT_LABELS,
} from "../lib/jobContactPreference.ts"
import {
  assertField,
  validateJobDescription,
  validateJobTitle,
  validatePositiveInt,
} from "../lib/validation.ts"
import { fetchPostJob } from "../lib/queries/fetchPostJob.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { queryClient } from "../lib/queryClient.ts"
import { pickCategoryName } from "../lib/categoryLocale.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { usePageMeta } from "../lib/usePageMeta.tsx"
import { OptimizedImage } from "../components/OptimizedImage.tsx"
import { compressImageForUpload } from "../lib/compressImageForUpload.ts"
import { assertContentRateLimit, formatContentRateLimitError } from "../lib/contentRateLimit.ts"

const MAX_JOB_IMAGES = 3
const MAX_INPUT_IMAGE_BYTES = 10 * 1024 * 1024

const DURATION_TYPE_KEYS = ["one_time", "ongoing"] as const
const LOCATION_TYPE_KEYS = ["remote", "tbilisi", "hybrid", "anywhere"] as const

type CategoryRow = {
  id: string
  name_ka: string
  name_en?: string | null
  is_active: boolean | null
  sort_order: number | null
  parent_id: string | null
}
type SkillRow = { id: string; name: string; category_id: string | null; is_approved: boolean | null }
type SubcategoryRow = {
  id: string
  name_ka: string
  name_en?: string | null
  category_id: string
  is_active: boolean | null
}

type FieldErrors = {
  title?: string
  categoryId?: string
  description?: string
  budgetType?: string
  budgetMin?: string
  budgetMax?: string
  applicationDeadline?: string
  vacancies?: string
  contactMethods?: string
}

const PUBLISH_ERROR_SCROLL_ORDER = [
  "title",
  "categoryId",
  "description",
  "budgetType",
  "budgetMin",
  "budgetMax",
  "vacancies",
  "applicationDeadline",
  "contactMethods",
] as const satisfies readonly (keyof FieldErrors)[]

function scrollToFirstPublishError(errors: FieldErrors) {
  for (const key of PUBLISH_ERROR_SCROLL_ORDER) {
    if (!errors[key]) continue
    const node = document.getElementById(`post-job-field-${key}`)
    if (!node) continue
    node.scrollIntoView({ behavior: "smooth", block: "center" })
    const focusable =
      node.matches("input,select,textarea") ? node : node.querySelector("input,select,textarea")
    ;(focusable as HTMLElement | undefined)?.focus?.({ preventScroll: true })
    break
  }
}

export default function PostJobPage() {
  const { t, locale } = useTranslation()
  const navigate = useNavigate()
  const { jobId } = useParams<{ jobId: string }>()
  const isEdit = Boolean(jobId)
  const [postJobUserId, setPostJobUserId] = useState("")
  const {
    data: postJobData,
    isLoading: loading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.postJob(postJobUserId || "pending", jobId),
    queryFn: () => fetchPostJob(jobId),
    enabled: Boolean(postJobUserId) && isSupabaseConfigured,
  })
  const loadPageError = isError ? queryErrorMessage(queryError, t("postJob.loadFailed")) : ""
  const [submitting, setSubmitting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [pageError, setPageError] = useState("")
  const displayPageError = pageError || loadPageError

  const durationLabel = useCallback(
    (key: string) => (key === "one_time" ? t("postJob.oneTime") : key === "ongoing" ? t("postJob.ongoing") : key),
    [t],
  )
  const locationLabel = useCallback(
    (key: string) => {
      if (key === "remote") return t("common.remote")
      if (key === "tbilisi") return t("postJob.tbilisi")
      if (key === "hybrid") return t("common.hybrid")
      if (key === "anywhere") return t("common.anywhere")
      return key
    },
    [t],
  )

  const [hirerProfileId, setHirerProfileId] = useState("")
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [allSkills, setAllSkills] = useState<SkillRow[]>([])
  const [subcategories, setSubcategories] = useState<SubcategoryRow[]>([])

  const [title, setTitle] = useState("")
  const [titleEn, setTitleEn] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [rootCategoryId, setRootCategoryId] = useState("")
  const [subcategoryId, setSubcategoryId] = useState("")
  const [description, setDescription] = useState("")
  const [descriptionEn, setDescriptionEn] = useState("")
  const [isUrgent, setIsUrgent] = useState(false)

  const [budgetType, setBudgetType] = useState("fixed")
  const [budgetMin, setBudgetMin] = useState("")
  const [budgetMax, setBudgetMax] = useState("")

  const [durationType, setDurationType] = useState("one_time")
  const [locationType, setLocationType] = useState("remote")

  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  const [contactEmail, setContactEmail] = useState(true)
  const [contactPhone, setContactPhone] = useState(false)
  const [applicationDeadline, setApplicationDeadline] = useState("")
  const [vacancies, setVacancies] = useState(1)
  const [acceptedCountSnapshot, setAcceptedCountSnapshot] = useState(0)
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([])
  const [newImageFiles, setNewImageFiles] = useState<File[]>([])

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [skillFocusCategoryId, setSkillFocusCategoryId] = useState("")
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        navigate("/login", { replace: true })
        return
      }
      setPostJobUserId(user.id)
    })
  }, [navigate])

  useEffect(() => {
    if (!postJobData) return
    if (postJobData.redirectTo) {
      navigate(postJobData.redirectTo, { replace: true })
      return
    }
    setHirerProfileId(postJobData.hirerProfileId)
    setCategories(postJobData.categories)
    setAllSkills(postJobData.allSkills)
    if (postJobData.edit) {
      const edit = postJobData.edit
      setRootCategoryId(edit.rootCategoryId)
      setCategoryId(edit.categoryId)
      setSubcategories(edit.subcategories)
      setTitle(edit.title)
      setTitleEn(edit.titleEn)
      setSubcategoryId(edit.subcategoryId)
      setDescription(edit.description)
      setDescriptionEn(edit.descriptionEn)
      setIsUrgent(edit.isUrgent)
      setBudgetType(edit.budgetType)
      setBudgetMin(edit.budgetMin)
      setBudgetMax(edit.budgetMax)
      setDurationType(edit.durationType)
      setLocationType(edit.locationType)
      setContactEmail(edit.contactEmail)
      setContactPhone(edit.contactPhone)
      setApplicationDeadline(edit.applicationDeadline)
      setVacancies(edit.vacancies)
      setAcceptedCountSnapshot(edit.acceptedCountSnapshot)
      setSelectedSkillIds(edit.selectedSkillIds)
      setExistingImageUrls(edit.existingImageUrls)
    }
  }, [postJobData, navigate])

  const categoryRootsList = useMemo(() => categoryRoots(categories as CategoryBranchRow[]), [categories])
  const categoryMidsList = useMemo(
    () => (rootCategoryId ? categoryChildrenOf(categories as CategoryBranchRow[], rootCategoryId) : []),
    [categories, rootCategoryId],
  )
  const isOtherCategorySelected = useMemo(
    () => isOtherRootCategory(categories as CategoryBranchRow[], rootCategoryId),
    [categories, rootCategoryId],
  )

  const specializationParentCategoryId = useMemo(() => {
    if (isOtherCategorySelected) return ""
    if (categoryId.trim()) return categoryId.trim()
    if (rootCategoryId && categoryMidsList.length === 0) return rootCategoryId
    return ""
  }, [categoryId, rootCategoryId, categoryMidsList.length, isOtherCategorySelected])

  const persistedJobCategoryId = useMemo(() => {
    if (isOtherCategorySelected) return rootCategoryId.trim()
    return categoryId.trim() || (rootCategoryId && categoryMidsList.length === 0 ? rootCategoryId.trim() : "")
  }, [categoryId, rootCategoryId, categoryMidsList.length, isOtherCategorySelected])

  useEffect(() => {
    const loadSubs = async () => {
      const parentId = specializationParentCategoryId.trim()
      if (!supabase || !parentId) {
        if (!parentId) setSubcategories([])
        return
      }
      const { data, error } = await supabase
        .from("subcategories")
        .select("id,name_ka,name_en,category_id,is_active")
        .eq("category_id", parentId)
        .eq("is_active", true)
        .order("name_ka", { ascending: true })

      if (error) {
        setPageError(error.message)
        setSubcategories([])
        return
      }
      setSubcategories(data ?? [])
    }

    void loadSubs()
  }, [specializationParentCategoryId])

  const todayIso = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }, [])

  const rootCategoryLabel = useMemo(() => {
    const cat = categories.find((c) => c.id === rootCategoryId)
    return cat ? pickCategoryName(cat, locale) : t("postJob.notSelected")
  }, [categories, rootCategoryId, locale, t])
  const midCategoryLabel = useMemo(() => {
    if (categoryMidsList.length === 0) return "—"
    const cat = categories.find((c) => c.id === categoryId)
    return cat ? pickCategoryName(cat, locale) : t("postJob.notSelected")
  }, [categories, categoryId, categoryMidsList.length, locale, t])

  const subcategoryLabel = useMemo(() => {
    const sub = subcategories.find((s) => s.id === subcategoryId)
    return sub ? pickCategoryName(sub, locale) : t("postJob.notSelected")
  }, [subcategories, subcategoryId, locale, t])

  const selectedSkillsForPreview = useMemo(
    () => allSkills.filter((s) => selectedSkillIds.includes(s.id)),
    [allSkills, selectedSkillIds],
  )

  const toggleSkill = (id: string) => {
    setSelectedSkillIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const skillsByCategoryId = useMemo(() => {
    const m = new Map<string, SkillRow[]>()
    for (const s of allSkills) {
      const key = s.category_id ?? ""
      if (!key) continue
      const list = m.get(key) ?? []
      list.push(s)
      m.set(key, list)
    }
    for (const [, list] of m) list.sort((a, b) => a.name.localeCompare(b.name))
    return m
  }, [allSkills])

  const skillNameById = useMemo(() => new Map(allSkills.map((s) => [s.id, s.name])), [allSkills])

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
    const remaining = MAX_JOB_IMAGES - existingImageUrls.length - newImageFiles.length
    if (remaining <= 0) {
      setPageError(t("postJob.maxImages", { max: MAX_JOB_IMAGES }))
      return
    }
    const valid: File[] = []
    for (const file of incoming) {
      if (!file.type.startsWith("image/")) continue
      if (file.size > MAX_INPUT_IMAGE_BYTES) {
        setPageError(t("postJob.imageTooBig"))
        continue
      }
      valid.push(file)
    }
    if (valid.length === 0) return
    setPageError("")
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

  const getPublishErrors = (): FieldErrors => {
    const e: FieldErrors = {}

    const titleResult = validateJobTitle(title)
    if (titleResult.ok === false) e.title = titleResult.message

    if (!rootCategoryId) {
      e.categoryId = t("postJob.categoryRequired")
    } else if (categoryMidsList.length > 0 && !categoryId) {
      e.categoryId = t("postJob.subcategoryRequired")
    }

    const descriptionResult = validateJobDescription(description)
    if (descriptionResult.ok === false) e.description = descriptionResult.message

    if (!budgetType) {
      e.budgetType = t("postJob.selectBudgetType")
    }

    const minN = Number(budgetMin)
    const maxN = Number(budgetMax)

    if (!budgetMin || Number.isNaN(minN) || minN < 0) {
      e.budgetMin = t("postJob.invalidBudgetMin")
    }
    if (!budgetMax || Number.isNaN(maxN) || maxN < 0) {
      e.budgetMax = t("postJob.invalidBudgetMax")
    } else if (!Number.isNaN(minN) && maxN < minN) {
      e.budgetMax = t("postJob.budgetMaxLessThanMin")
    }

    if (applicationDeadline && !isEdit && new Date(`${applicationDeadline}T00:00:00`) <= new Date(`${todayIso}T00:00:00`)) {
      e.applicationDeadline = t("postJob.deadlineMustBeFuture")
    }

    const vacanciesResult = validatePositiveInt(vacancies, {
      min: 1,
      max: 100,
      label: t("postJob.vacancies"),
    })
    if (vacanciesResult.ok === false) {
      e.vacancies = vacanciesResult.message
    } else if (isEdit && vacanciesResult.value < acceptedCountSnapshot) {
      e.vacancies = `ვაკანსიები არ უნდა იყოს ნაკლები უკვე მიღებული ფრილანსერების (${acceptedCountSnapshot}) რაოდენობაზე.`
    }

    if (!contactEmail && !contactPhone) {
      e.contactMethods = t("postJob.selectContactMethod")
    }

    return e
  }

  const contactPreference = encodeJobContactPreference(contactEmail, contactPhone)

  const handlePublishFromPreview = async () => {
    if (!supabase || !hirerProfileId) return
    const pubErrors = getPublishErrors()
    setFieldErrors(pubErrors)
    if (Object.keys(pubErrors).length > 0) {
      setShowPreview(false)
      window.requestAnimationFrame(() => scrollToFirstPublishError(pubErrors))
      return
    }

    setSubmitting(true)
    setPageError("")

    const safeTitle = assertField(validateJobTitle(title))
    const titleEnResult = titleEn.trim()
      ? validateJobTitle(titleEn)
      : ({ ok: true, value: "" } as const)
    if (titleEnResult.ok === false) {
      setFieldErrors({ title: titleEnResult.message })
      setShowPreview(false)
      setSubmitting(false)
      return
    }
    const safeTitleEn = titleEnResult.value.trim() || null
    const safeDescription = assertField(validateJobDescription(description))
    const descriptionEnResult = descriptionEn.trim()
      ? validateJobDescription(descriptionEn)
      : ({ ok: true, value: "" } as const)
    if (descriptionEnResult.ok === false) {
      setFieldErrors({ description: descriptionEnResult.message })
      setShowPreview(false)
      setSubmitting(false)
      return
    }
    const safeDescriptionEn = descriptionEnResult.value.trim() || null

    try {
      let currentJobId = jobId ?? null
      if (isEdit && jobId) {
        const { error: upErr } = await supabase
          .from("jobs")
          .update({
            category_id: persistedJobCategoryId,
            subcategory_id: subcategoryId || null,
            title: safeTitle,
            title_en: safeTitleEn,
            description: safeDescription,
            description_en: safeDescriptionEn,
            budget_type: budgetType,
            budget_min: Number(budgetMin),
            budget_max: Number(budgetMax),
            duration_type: durationType,
            location_type: locationType,
            contact_preference: contactPreference,
            application_deadline: applicationDeadline || null,
            is_urgent: isUrgent,
            vacancies,
          })
          .eq("id", jobId)
          .eq("hirer_profile_id", hirerProfileId)

        if (upErr) throw upErr

        const { error: delErr } = await supabase.from("job_skills").delete().eq("job_id", jobId)
        if (delErr) throw delErr

        if (selectedSkillIds.length > 0) {
          const { error: insErr } = await supabase
            .from("job_skills")
            .insert(selectedSkillIds.map((skill_id) => ({ job_id: jobId, skill_id })))
          if (insErr) throw insErr
        }
        currentJobId = jobId
      } else {
        await assertContentRateLimit("job-post")

        const exp = new Date()
        exp.setDate(exp.getDate() + 30)

        const { data: inserted, error: insJobErr } = await supabase
          .from("jobs")
          .insert({
            hirer_profile_id: hirerProfileId,
            category_id: persistedJobCategoryId,
            subcategory_id: subcategoryId || null,
            title: safeTitle,
            title_en: safeTitleEn,
            description: safeDescription,
            description_en: safeDescriptionEn,
            budget_type: budgetType,
            budget_min: Number(budgetMin),
            budget_max: Number(budgetMax),
            duration_type: durationType,
            location_type: locationType,
            contact_preference: contactPreference,
            application_deadline: applicationDeadline || null,
            is_urgent: isUrgent,
            is_featured: false,
            status: "open",
            views_count: 0,
            vacancies,
            accepted_count: 0,
            expires_at: exp.toISOString(),
          })
          .select("id")
          .single()

        if (insJobErr) throw insJobErr
        if (!inserted?.id) throw new Error(t("postJob.publishFailed"))
        currentJobId = inserted.id

        if (selectedSkillIds.length > 0) {
          const { error: skErr } = await supabase
            .from("job_skills")
            .insert(selectedSkillIds.map((skill_id) => ({ job_id: inserted.id, skill_id })))
          if (skErr) throw skErr
        }
      }

      if (!currentJobId) throw new Error(t("postJob.jobIdNotFound"))

      let uploadedImagePaths: string[] = []
      if (newImageFiles.length > 0) {
        const bucket = "job-images"
        const compressedFiles = await Promise.all(newImageFiles.map((file) => compressImageForUpload(file, "portfolio")))
        uploadedImagePaths = []
        for (let i = 0; i < compressedFiles.length; i += 1) {
          const blob = compressedFiles[i]
          const safeName = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.webp`
          const path = `${hirerProfileId}/${currentJobId}/${safeName}`
          const { error: uploadError } = await supabase.storage.from(bucket).upload(path, blob, {
            contentType: "image/webp",
            upsert: false,
          })
          if (uploadError) {
            throw new Error(`სურათის ატვირთვა ვერ მოხერხდა: ${uploadError.message}`)
          }
          uploadedImagePaths.push(path)
        }
      }

      const finalImageUrls = [...existingImageUrls, ...uploadedImagePaths].slice(0, MAX_JOB_IMAGES)
      if (finalImageUrls.length !== existingImageUrls.length || uploadedImagePaths.length > 0) {
        const { error: imageSaveError } = await supabase
          .from("jobs")
          .update({ image_urls: finalImageUrls } as { image_urls: string[] })
          .eq("id", currentJobId)
          .eq("hirer_profile_id", hirerProfileId)
        if (imageSaveError) throw imageSaveError
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.jobDetail(currentJobId) })
      void queryClient.invalidateQueries({ queryKey: ["jobs-page"] })
      void queryClient.invalidateQueries({ queryKey: ["jobs-catalog"] })
      if (postJobUserId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.postJob(postJobUserId, currentJobId) })
      }

      navigate("/dashboard", {
        replace: true,
        state: { successMessage: isEdit ? t("postJob.updatedSuccess") : t("postJob.publishedSuccess") },
      })
    } catch (e) {
      const rateMsg = formatContentRateLimitError(e, t)
      setPageError(
        rateMsg ??
          (e instanceof Error
            ? e.message
            : isEdit
              ? t("postJob.updateFailed")
              : t("postJob.publishFailedShort")),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const pageMeta = usePageMeta(
    isEdit ? t("postJob.editTitle") : t("postJob.postTitle"),
    t("postJob.metaDescription"),
  )

  if (loading) {
    return (
      <>
        {pageMeta}
        <div className="min-h-screen bg-slate-50">
          <div className="mx-auto flex max-w-[720px] items-center justify-center px-6 py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-[#0088FF]" />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {pageMeta}
    <div className="page-enter min-h-screen bg-[#F8F9FC]">
      <main className="mx-auto max-w-[720px] px-4 py-8 md:px-6 md:py-10">
        <h1 className={`text-[28px] font-bold md:text-5xl ${isEdit ? "text-[#1B2B4B]" : "text-[#0088FF]"}`}>
          {isEdit ? t("postJob.editHeading") : t("postJob.postHeading")}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {isEdit ? t("postJob.editSubtitle") : t("postJob.postSubtitle")}
        </p>

        {displayPageError ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{displayPageError}</p>
        ) : null}

        {showPreview ? (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="border-l-4 border-[#0088FF] pl-3 text-xl font-bold text-[#1B2B4B]">{t("postJob.preview")}</h2>

            <div className="mt-5 min-w-0 space-y-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="break-words text-2xl font-bold text-[#1B2B4B] [overflow-wrap:anywhere]">{title.trim()}</p>
              {titleEn.trim() ? (
                <p className="break-words text-lg font-semibold text-slate-600 [overflow-wrap:anywhere]">{titleEn.trim()}</p>
              ) : null}
              <p className="break-words whitespace-pre-wrap text-sm text-slate-600 [overflow-wrap:anywhere]">{description.trim()}</p>
              {descriptionEn.trim() ? (
                <p className="break-words whitespace-pre-wrap text-sm text-slate-500 [overflow-wrap:anywhere]">{descriptionEn.trim()}</p>
              ) : null}

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-white px-3 py-1 text-slate-700">{t("common.category")}: {rootCategoryLabel}</span>
                {!isOtherCategorySelected ? (
                  <span className="rounded-full bg-white px-3 py-1 text-slate-700">{t("common.subcategory")}: {midCategoryLabel}</span>
                ) : null}
                {!isOtherCategorySelected && subcategoryId ? (
                  <span className="rounded-full bg-white px-3 py-1 text-slate-700">{t("postJob.specialization")}: {subcategoryLabel}</span>
                ) : null}
                <span className="rounded-full bg-white px-3 py-1 text-slate-700">
                  {t("postJob.previewBudget")}{" "}
                  {formatJobBudget(
                    budgetMin ? Number(budgetMin) : null,
                    budgetMax ? Number(budgetMax) : null,
                    budgetType,
                  )}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-slate-700">
                  {t("postJob.previewType")} {durationLabel(durationType)}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-slate-700">
                  {t("postJob.previewLocation")} {locationLabel(locationType)}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-slate-700">
                  {t("postJob.previewContact")} {JOB_CONTACT_LABELS[contactPreference] ?? contactPreference}
                </span>
                {applicationDeadline ? (
                  <span className="rounded-full bg-white px-3 py-1 text-slate-700">{t("postJob.previewDeadline")} {applicationDeadline}</span>
                ) : null}
                {isUrgent ? <span className="rounded-full bg-red-100 px-3 py-1 font-semibold text-red-700">{t("common.urgent")}</span> : null}
                <span className="rounded-full bg-white px-3 py-1 text-slate-700">
                  {t("postJob.previewVacancies", { count: vacancies })}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedSkillsForPreview.length > 0 ? (
                  selectedSkillsForPreview.map((s) => (
                    <span key={s.id} className="rounded-full bg-[#D4A843] px-3 py-1 text-xs font-medium text-[#1B2B4B]">
                      {s.name}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500">{t("postJob.noSkillsSelected")}</span>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="h-11 rounded-lg border border-slate-300 text-sm font-semibold text-[#1B2B4B] hover:bg-slate-50"
              >
                {t("common.edit")}
              </button>
              <button
                type="button"
                onClick={() => void handlePublishFromPreview()}
                disabled={submitting}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-[#0088FF] text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#006ACC] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-white" />
                    მიმდინარეობს...
                  </span>
                ) : isEdit ? (
                  t("postJob.saveChanges")
                ) : (
                  t("postJob.publish")
                )}
              </button>
            </div>
          </section>
        ) : (
          <div className="mt-6 space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#0088FF] pl-3 text-xl font-bold text-[#1B2B4B]">{t("postJob.step1")}</h2>
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("postJob.titleRequired")}</span>
                  <input
                    id="post-job-field-title"
                    type="text"
                    maxLength={100}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-[#0088FF] ring-[#0088FF]/35 focus:ring-2"
                    placeholder={t("postJob.jobTitlePlaceholder")}
                  />
                  {fieldErrors.title ? <p className="mt-1 text-sm text-red-600">{fieldErrors.title}</p> : null}
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("postJob.titleEnOptional")}</span>
                  <input
                    type="text"
                    maxLength={100}
                    value={titleEn}
                    onChange={(e) => setTitleEn(e.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-[#0088FF] ring-[#0088FF]/35 focus:ring-2"
                    placeholder={t("postJob.titleEnPlaceholder")}
                  />
                </label>

                <div id="post-job-field-categoryId" className="space-y-4">
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">
                      {t("common.category")} <span className="text-red-500">*</span>
                    </span>
                    <select
                      value={rootCategoryId}
                      onChange={(e) => {
                        const nextRoot = e.target.value
                        setRootCategoryId(nextRoot)
                        setSubcategoryId("")
                        const mids = nextRoot ? categoryChildrenOf(categories as CategoryBranchRow[], nextRoot) : []
                        if (!nextRoot) {
                          setCategoryId("")
                        } else if (isOtherRootCategory(categories as CategoryBranchRow[], nextRoot)) {
                          setCategoryId("")
                        } else if (mids.length === 0) {
                          setCategoryId(nextRoot)
                        } else {
                          setCategoryId("")
                        }
                      }}
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-[#0088FF] ring-[#0088FF]/35 focus:ring-2"
                    >
                      <option value="">{t("postJob.selectCategory")}</option>
                      {categoryRootsList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {pickCategoryName(c, locale)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {!isOtherCategorySelected ? (
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">
                      {t("common.subcategory")} {categoryMidsList.length > 0 ? <span className="text-red-500">*</span> : null}
                    </span>
                    <select
                      value={categoryId}
                      disabled={!rootCategoryId || categoryMidsList.length === 0}
                      onChange={(e) => {
                        setCategoryId(e.target.value)
                        setSubcategoryId("")
                      }}
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-[#0088FF] ring-[#0088FF]/35 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      <option value="">
                        {!rootCategoryId
                          ? t("postJob.selectCategoryFirst")
                          : categoryMidsList.length === 0
                            ? t("postJob.noSubcategoryForCategory")
                            : t("postJob.selectSubcategory")}
                      </option>
                      {categoryMidsList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {pickCategoryName(c, locale)}
                        </option>
                      ))}
                    </select>
                  </label>
                  ) : null}
                  {fieldErrors.categoryId ? <p className="text-sm text-red-600">{fieldErrors.categoryId}</p> : null}
                </div>

                {!isOtherCategorySelected ? (
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("postJob.specialization")}</span>
                  <select
                    value={subcategoryId}
                    onChange={(e) => setSubcategoryId(e.target.value)}
                    disabled={!specializationParentCategoryId}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-[#0088FF] ring-[#0088FF]/35 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    <option value="">
                      {specializationParentCategoryId ? t("postJob.selectSpecialization") : t("postJob.selectSubcategoryOrCategoryFirst")}
                    </option>
                    {subcategories.map((s) => (
                      <option key={s.id} value={s.id}>
                        {pickCategoryName(s, locale)}
                      </option>
                    ))}
                  </select>
                </label>
                ) : null}

                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("postJob.descriptionKa")}</span>
                  <textarea
                    id="post-job-field-description"
                    rows={6}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0088FF] ring-[#0088FF]/35 focus:ring-2"
                    placeholder={t("postJob.descriptionPlaceholder")}
                  />
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span>{t("postJob.minChars")}</span>
                    <span>{t("postJob.charCount", { count: description.trim().length })}</span>
                  </div>
                  {fieldErrors.description ? <p className="mt-1 text-sm text-red-600">{fieldErrors.description}</p> : null}
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">{t("postJob.descriptionEnOptional")}</span>
                  <textarea
                    rows={6}
                    value={descriptionEn}
                    onChange={(e) => setDescriptionEn(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0088FF] ring-[#0088FF]/35 focus:ring-2"
                    placeholder={t("postJob.descriptionEnPlaceholder")}
                  />
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-[#1B2B4B]">
                  <input type="checkbox" checked={isUrgent} onChange={(e) => setIsUrgent(e.target.checked)} />
                  {t("postJob.isUrgent")}
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#0088FF] pl-3 text-xl font-bold text-[#1B2B4B]">{t("postJob.step2")}</h2>
              <p className="mt-2 text-sm text-slate-500">{t("postJob.budgetExample")}</p>
              <div className="mt-4 space-y-4">
                <div id="post-job-field-budgetType">
                  <p className="mb-2 text-sm font-semibold text-[#1B2B4B]">
                    ბიუჯეტის ტიპი <span className="text-red-500">*</span>
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {Object.keys(PRICE_TYPE_LABELS).map((key) => (
                      <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                        <input type="radio" name="budget_type" checked={budgetType === key} onChange={() => setBudgetType(key)} />
                        {PRICE_TYPE_LABELS[key as keyof typeof PRICE_TYPE_LABELS]}
                      </label>
                    ))}
                  </div>
                  {fieldErrors.budgetType ? <p className="mt-1 text-sm text-red-600">{fieldErrors.budgetType}</p> : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">
                      მინ. ბიუჯეტი (₾) <span className="text-red-500">*</span>
                    </span>
                    <input
                      id="post-job-field-budgetMin"
                      type="number"
                      min={0}
                      value={budgetMin}
                      onChange={(e) => setBudgetMin(e.target.value)}
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-[#0088FF] ring-[#0088FF]/35 focus:ring-2"
                    />
                    {fieldErrors.budgetMin ? <p className="mt-1 text-sm text-red-600">{fieldErrors.budgetMin}</p> : null}
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">
                      მაქს. ბიუჯეტი (₾) <span className="text-red-500">*</span>
                    </span>
                    <input
                      id="post-job-field-budgetMax"
                      type="number"
                      min={0}
                      value={budgetMax}
                      onChange={(e) => setBudgetMax(e.target.value)}
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-[#0088FF] ring-[#0088FF]/35 focus:ring-2"
                    />
                    {fieldErrors.budgetMax ? <p className="mt-1 text-sm text-red-600">{fieldErrors.budgetMax}</p> : null}
                  </label>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#0088FF] pl-3 text-xl font-bold text-[#1B2B4B]">{t("postJob.step3")}</h2>
              <div className="mt-4 space-y-4">
                <div>
                  <p className="mb-2 text-sm font-semibold text-[#1B2B4B]">{t("postJob.duration")}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {DURATION_TYPE_KEYS.map((key) => (
                      <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                        <input type="radio" name="duration_type" checked={durationType === key} onChange={() => setDurationType(key)} />
                        {durationLabel(key)}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-[#1B2B4B]">{t("postJob.location")}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {LOCATION_TYPE_KEYS.map((key) => (
                      <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                        <input type="radio" name="location_type" checked={locationType === key} onChange={() => setLocationType(key)} />
                        {locationLabel(key)}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#0088FF] pl-3 text-xl font-bold text-[#1B2B4B]">{t("postJob.step4")}</h2>
              <p className="mt-2 text-sm text-slate-500">{t("postJob.skillsHint")}</p>
              <p className="mt-1 text-xs text-slate-500">
                არჩეულია <span className="font-semibold tabular-nums text-slate-700">{selectedSkillIds.length}</span> უნარი
              </p>

              <div className="mt-4">
                <label htmlFor="post-job-skill-category" className="mb-1 block text-sm font-semibold text-[#1B2B4B]">
                  კატეგორია (უნარების სიისთვის)
                </label>
                <select
                  id="post-job-skill-category"
                  value={skillFocusCategoryId}
                  onChange={(e) => setSkillFocusCategoryId(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-[#0088FF] ring-[#0088FF]/35 focus:ring-2"
                >
                  <option value="">აირჩიე კატეგორია…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {pickCategoryName(c, locale)}
                    </option>
                  ))}
                </select>
              </div>

              {skillFocusCategoryId && (skillsByCategoryId.get(skillFocusCategoryId) ?? []).length > 0 ? (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/40 p-3">
                  <p className="mb-2 text-sm font-semibold text-[#0088FF]">
                    {(() => {
                      const cat = categories.find((c) => c.id === skillFocusCategoryId)
                      return cat ? pickCategoryName(cat, locale) : t("common.category")
                    })()}
                  </p>
                  {(() => {
                    const list = skillsByCategoryId.get(skillFocusCategoryId) ?? []
                    const selectedHere = list.filter((s) => selectedSkillIds.includes(s.id))
                    return (
                      <>
                        {selectedHere.length > 0 ? (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {selectedHere.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => toggleSkill(s.id)}
                                className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#D1D5DB] bg-white px-2.5 py-0.5 text-xs font-medium text-[#374151] hover:bg-slate-50"
                              >
                                <span className="truncate">{s.name}</span>
                                <span className="shrink-0 text-slate-400" aria-hidden>
                                  ×
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="mb-2 text-xs text-slate-500">ამ კატეგორიიდან ჯერ არაფერი არ არის არჩეული.</p>
                        )}
                        <label className="sr-only" htmlFor="post-job-skill-add">
                          უნარის დამატება
                        </label>
                        <select
                          id="post-job-skill-add"
                          key={`post-job-skill-dd-${skillFocusCategoryId}-${selectedHere.map((s) => s.id).join("-")}`}
                          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#0088FF] focus:ring-2 focus:ring-[#0088FF]/25"
                          defaultValue=""
                          onChange={(e) => {
                            const sid = e.target.value
                            if (sid) {
                              toggleSkill(sid)
                              e.target.value = ""
                            }
                          }}
                        >
                          <option value="">უნარის დამატება…</option>
                          {list.map((s) => (
                            <option key={s.id} value={s.id} disabled={selectedSkillIds.includes(s.id)}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </>
                    )
                  })()}
                </div>
              ) : skillFocusCategoryId ? (
                <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-3 text-xs text-slate-500">
                  ამ კატეგორიაში დამტკიცებული უნარები ჯერ არ არის.
                </p>
              ) : (
                <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-3 text-xs text-slate-500">
                  კატეგორიის ასარჩევად გამოიყენე სია.
                </p>
              )}

              {selectedSkillIds.length > 0 ? (
                <div className="mt-4 rounded-lg border border-slate-100 bg-white p-3">
                  <p className="mb-2 text-xs font-semibold text-slate-600">ყველა არჩეული უნარი</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedSkillIds.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleSkill(id)}
                        className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#D1D5DB] bg-white px-2.5 py-0.5 text-xs font-medium text-[#374151] hover:bg-red-50"
                      >
                        <span className="truncate">{skillNameById.get(id) ?? id}</span>
                        <span className="shrink-0 text-slate-400" aria-hidden>
                          ×
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#0088FF] pl-3 text-xl font-bold text-[#1B2B4B]">{t("postJob.step5")}</h2>
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">
                    ვაკანსიების რაოდენობა / Vacancies <span className="text-red-500">*</span>
                  </span>
                  <input
                    id="post-job-field-vacancies"
                    type="number"
                    min={Math.max(1, isEdit ? acceptedCountSnapshot : 1)}
                    step={1}
                    value={vacancies}
                    onChange={(event) => {
                      const minSlots = Math.max(1, isEdit ? acceptedCountSnapshot : 1)
                      const n = Number(event.target.value)
                      if (!Number.isFinite(n)) setVacancies(minSlots)
                      else setVacancies(Math.max(minSlots, Math.floor(n)))
                    }}
                    className="h-11 w-full max-w-[200px] rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-[#0088FF] ring-[#0088FF]/35 focus:ring-2"
                  />
                  <p className="mt-1 text-xs text-slate-500">რამდენ ფრილანსერს შეუძლია ერთად მუშაობა ამ განცხადებაზე (მინ. 1).</p>
                  {fieldErrors.vacancies ? <p className="mt-1 text-sm text-red-600">{fieldErrors.vacancies}</p> : null}
                </label>
                <div id="post-job-field-contactMethods">
                  <p className="mb-2 text-sm font-semibold text-[#1B2B4B]">კონტაქტის მეთოდი</p>
                  <p className="mb-2 text-xs text-slate-500">ფრილანსერები დაგიკავშირდებიან პროფილში მითითებული ელფოსტით და/ან ტელეფონით.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={contactEmail}
                        onChange={(e) => {
                          if (!e.target.checked && !contactPhone) return
                          setContactEmail(e.target.checked)
                        }}
                      />
                      {JOB_CONTACT_LABELS.email}
                    </label>
                    <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={contactPhone}
                        onChange={(e) => {
                          if (!e.target.checked && !contactEmail) return
                          setContactPhone(e.target.checked)
                        }}
                      />
                      {JOB_CONTACT_LABELS.phone}
                    </label>
                  </div>
                  {fieldErrors.contactMethods ? (
                    <p className="mt-1 text-sm text-red-600">{fieldErrors.contactMethods}</p>
                  ) : null}
                </div>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">განაცხადის ბოლო ვადა</span>
                  <input
                    id="post-job-field-applicationDeadline"
                    type="date"
                    value={applicationDeadline}
                    min={todayIso}
                    onChange={(e) => setApplicationDeadline(e.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-[#0088FF] ring-[#0088FF]/35 focus:ring-2"
                  />
                  {fieldErrors.applicationDeadline ? (
                    <p className="mt-1 text-sm text-red-600">{fieldErrors.applicationDeadline}</p>
                  ) : null}
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#0088FF] pl-3 text-xl font-bold text-[#1B2B4B]">{t("postJob.step6")}</h2>
              <p className="mt-2 text-sm text-slate-500">მაქსიმუმ 3 სურათი. ფაილები ავტომატურად მცირდება ზომაში ატვირთვამდე.</p>
              <div className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-3">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    handleImagePick(event.target.files)
                    event.currentTarget.value = ""
                  }}
                  disabled={existingImageUrls.length + newImageFiles.length >= MAX_JOB_IMAGES}
                  className="block w-full text-xs text-slate-700 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-[#0088FF] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white file:transition-colors file:duration-150 file:hover:bg-[#006ACC]"
                />
                {existingImageUrls.length + newImageFiles.length > 0 ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {existingImageUrls.map((url) => (
                      <div key={url} className="overflow-hidden rounded-md border border-slate-200 bg-white">
                        <OptimizedImage
                          src={supabase ? jobImageThumbnailUrl(supabase, url) : ""}
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
                          წაშლა
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
                          წაშლა
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#0088FF] pl-3 text-xl font-bold text-[#1B2B4B]">{t("postJob.step7")}</h2>
              <p className="mt-2 text-sm text-slate-500">გადაამოწმე ინფორმაცია და გააგრძელე განცხადების პრევიუზე.</p>
              <button
                type="button"
                onClick={() => {
                  setPageError("")
                  const err = getPublishErrors()
                  setFieldErrors(err)
                  if (Object.keys(err).length > 0) {
                    window.requestAnimationFrame(() => scrollToFirstPublishError(err))
                    return
                  }
                  setShowPreview(true)
                }}
                className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-[#0088FF] px-6 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#006ACC]"
              >
                პრევიუს ნახვა
              </button>
            </section>
          </div>
        )}
      </main>
    </div>
  </>
  )
}
