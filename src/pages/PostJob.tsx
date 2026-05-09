import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import Navbar from "../components/Navbar.tsx"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { jobImageThumbnailUrl } from "../lib/storageImageUrl.ts"

const MAX_JOB_IMAGES = 3
const MAX_INPUT_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_IMAGE_EDGE = 1600
const TARGET_IMAGE_BYTES = 700 * 1024

async function fileToImageBitmap(file: File): Promise<ImageBitmap> {
  return await createImageBitmap(file)
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality))
  if (!blob) throw new Error("სურათის დამუშავება ვერ მოხერხდა.")
  return blob
}

async function compressImage(file: File): Promise<Blob> {
  const bitmap = await fileToImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("სურათის დამუშავება ვერ მოხერხდა.")
    ctx.drawImage(bitmap, 0, 0, width, height)
    let quality = 0.86
    let best = await canvasToJpegBlob(canvas, quality)
    while (best.size > TARGET_IMAGE_BYTES && quality > 0.45) {
      quality -= 0.08
      best = await canvasToJpegBlob(canvas, quality)
    }
    return best
  } finally {
    bitmap.close()
  }
}

const BUDGET_TYPE_LABELS: Record<string, string> = {
  fixed: "ფიქსირებული",
  hourly: "საათობრივი",
  monthly: "თვიური",
}

const DURATION_TYPE_LABELS: Record<string, string> = {
  one_time: "ერთჯერადი",
  ongoing: "ხანგრძლივი",
}

const LOCATION_TYPE_LABELS: Record<string, string> = {
  remote: "დისტანციური",
  tbilisi: "თბილისი",
  hybrid: "Hybrid",
  anywhere: "ნებისმიერი ადგილი",
}

const CONTACT_LABELS: Record<string, string> = {
  email: "ელფოსტა",
  phone: "ტელეფონი",
}

type CategoryRow = { id: string; name_ka: string; is_active: boolean | null; sort_order: number | null }
type SkillRow = { id: string; name: string; category_id: string | null; is_approved: boolean | null }
type SubcategoryRow = { id: string; name_ka: string; category_id: string; is_active: boolean | null }

type FieldErrors = {
  title?: string
  categoryId?: string
  description?: string
  budgetType?: string
  budgetMin?: string
  budgetMax?: string
  applicationDeadline?: string
  vacancies?: string
}

export default function PostJobPage() {
  const navigate = useNavigate()
  const { jobId } = useParams<{ jobId: string }>()
  const isEdit = Boolean(jobId)

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [pageError, setPageError] = useState("")

  const [hirerProfileId, setHirerProfileId] = useState("")
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [allSkills, setAllSkills] = useState<SkillRow[]>([])
  const [subcategories, setSubcategories] = useState<SubcategoryRow[]>([])

  const [title, setTitle] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [subcategoryId, setSubcategoryId] = useState("")
  const [description, setDescription] = useState("")
  const [isUrgent, setIsUrgent] = useState(false)

  const [budgetType, setBudgetType] = useState("fixed")
  const [budgetMin, setBudgetMin] = useState("")
  const [budgetMax, setBudgetMax] = useState("")

  const [durationType, setDurationType] = useState("one_time")
  const [locationType, setLocationType] = useState("remote")

  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  const [contactPreference, setContactPreference] = useState("email")
  const [applicationDeadline, setApplicationDeadline] = useState("")
  const [vacancies, setVacancies] = useState(1)
  const [acceptedCountSnapshot, setAcceptedCountSnapshot] = useState(0)
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([])
  const [newImageFiles, setNewImageFiles] = useState<File[]>([])

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  useEffect(() => {
    document.title = isEdit ? "განცხადების რედაქტირება — გიგორი" : "სამუშაოები — გიგორი"
  }, [isEdit])

  useEffect(() => {
    const load = async () => {
      if (!isSupabaseConfigured || !supabase) {
        setPageError("Supabase არ არის კონფიგურირებული.")
        setLoading(false)
        return
      }

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          navigate("/login", { replace: true })
          return
        }

        const { data: profile, error: profileErr } = await supabase.from("profiles").select("user_type").eq("id", user.id).single()
        if (profileErr) throw profileErr
        if (profile?.user_type !== "hirer") {
          navigate("/dashboard", { replace: true })
          return
        }

        const [{ data: hirerRow, error: hirerErr }, { data: catRows, error: catErr }, { data: skillRows, error: skillErr }] =
          await Promise.all([
            supabase.from("hirer_profiles").select("id").eq("user_id", user.id).maybeSingle(),
            supabase.from("categories").select("id,name_ka,is_active,sort_order").eq("is_active", true).order("sort_order", { ascending: true }),
            supabase.from("skills").select("id,name,category_id,is_approved").eq("is_approved", true).order("name", { ascending: true }),
          ])

        if (hirerErr) throw hirerErr
        if (catErr) throw catErr
        if (skillErr) throw skillErr

        if (!hirerRow?.id) {
          navigate("/onboarding", { replace: true })
          return
        }

        setHirerProfileId(hirerRow.id)
        setCategories(catRows ?? [])
        setAllSkills(skillRows ?? [])

        if (jobId) {
          const { data: jobRow, error: jobErr } = await supabase
            .from("jobs")
            .select("*")
            .eq("id", jobId)
            .eq("hirer_profile_id", hirerRow.id)
            .maybeSingle()

          if (jobErr || !jobRow) {
            navigate("/dashboard", { replace: true })
            return
          }

          const { data: jsRows, error: jsErr } = await supabase.from("job_skills").select("skill_id").eq("job_id", jobRow.id)
          if (jsErr) throw jsErr

          const { data: subRows, error: subErr } = await supabase
            .from("subcategories")
            .select("id,name_ka,category_id,is_active")
            .eq("category_id", jobRow.category_id)
            .eq("is_active", true)
            .order("name_ka", { ascending: true })

          if (subErr) throw subErr

          setSubcategories(subRows ?? [])
          setTitle(jobRow.title)
          setCategoryId(jobRow.category_id)
          setSubcategoryId(jobRow.subcategory_id ?? "")
          setDescription(jobRow.description)
          setIsUrgent(jobRow.is_urgent)
          setBudgetType(jobRow.budget_type)
          setBudgetMin(jobRow.budget_min == null ? "" : String(jobRow.budget_min))
          setBudgetMax(jobRow.budget_max == null ? "" : String(jobRow.budget_max))
          setDurationType(jobRow.duration_type)
          setLocationType(jobRow.location_type)
          setContactPreference(jobRow.contact_preference)
          setApplicationDeadline(jobRow.application_deadline ? jobRow.application_deadline.slice(0, 10) : "")
          const jr = jobRow as { vacancies?: unknown; accepted_count?: unknown }
          const vacN = Number(jr.vacancies ?? 1)
          const acN = Number(jr.accepted_count ?? 0)
          setVacancies(Number.isFinite(vacN) && vacN >= 1 ? Math.floor(vacN) : 1)
          setAcceptedCountSnapshot(Number.isFinite(acN) && acN >= 0 ? Math.floor(acN) : 0)
          setSelectedSkillIds(jsRows?.map((r) => r.skill_id) ?? [])
          setExistingImageUrls(
            Array.isArray((jobRow as { image_urls?: unknown }).image_urls)
              ? ((jobRow as { image_urls: unknown[] }).image_urls.map((v) => String(v)).filter(Boolean).slice(0, MAX_JOB_IMAGES))
              : [],
          )
        }
      } catch (e) {
        setPageError(e instanceof Error ? e.message : "გვერდის ჩატვირთვა ვერ მოხერხდა.")
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [navigate, jobId])

  useEffect(() => {
    const loadSubs = async () => {
      if (!supabase || !categoryId) {
        setSubcategories([])
        setSubcategoryId("")
        return
      }
      const { data, error } = await supabase
        .from("subcategories")
        .select("id,name_ka,category_id,is_active")
        .eq("category_id", categoryId)
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
  }, [categoryId])

  const todayIso = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }, [])

  const categoryNameKa = useMemo(() => categories.find((c) => c.id === categoryId)?.name_ka ?? "არ არის არჩეული", [categories, categoryId])

  const subcategoryNameKa = useMemo(
    () => subcategories.find((s) => s.id === subcategoryId)?.name_ka ?? "არ არის არჩეული",
    [subcategories, subcategoryId],
  )

  const selectedSkillsForPreview = useMemo(
    () => allSkills.filter((s) => selectedSkillIds.includes(s.id)),
    [allSkills, selectedSkillIds],
  )

  const toggleSkill = (id: string) => {
    setSelectedSkillIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
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
    const remaining = MAX_JOB_IMAGES - existingImageUrls.length - newImageFiles.length
    if (remaining <= 0) {
      setPageError(`მაქსიმუმ ${MAX_JOB_IMAGES} სურათი შეგიძლია დაამატო.`)
      return
    }
    const valid: File[] = []
    for (const file of incoming) {
      if (!file.type.startsWith("image/")) continue
      if (file.size > MAX_INPUT_IMAGE_BYTES) {
        setPageError("ერთი ან მეტი სურათი ძალიან დიდია. მაქსიმუმ 10MB თითო ფაილზე.")
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

  const validateForPublish = (): boolean => {
    const e: FieldErrors = {}

    if (!title.trim()) {
      e.title = "სათაური სავალდებულოა."
    } else if (title.trim().length > 100) {
      e.title = "სათაური არ უნდა აღემატებოდეს 100 სიმბოლოს."
    }

    if (!categoryId) {
      e.categoryId = "კატეგორია სავალდებულოა."
    }

    if (!description.trim()) {
      e.description = "აღწერა სავალდებულოა."
    } else if (description.trim().length < 100) {
      e.description = "აღწერა უნდა იყოს მინიმუმ 100 სიმბოლო."
    }

    if (!budgetType) {
      e.budgetType = "აირჩიე ბიუჯეტის ტიპი."
    }

    const minN = Number(budgetMin)
    const maxN = Number(budgetMax)

    if (!budgetMin || Number.isNaN(minN) || minN < 0) {
      e.budgetMin = "მიუთითე სწორი მინიმალური ბიუჯეტი."
    }
    if (!budgetMax || Number.isNaN(maxN) || maxN < 0) {
      e.budgetMax = "მიუთითე სწორი მაქსიმალური ბიუჯეტი."
    } else if (!Number.isNaN(minN) && maxN < minN) {
      e.budgetMax = "მაქსიმალური ბიუჯეტი უნდა იყოს მინიმალურზე მეტი ან ტოლი."
    }

    if (applicationDeadline && !isEdit && new Date(`${applicationDeadline}T00:00:00`) <= new Date(`${todayIso}T00:00:00`)) {
      e.applicationDeadline = "ვადა უნდა იყოს მომავალში."
    }

    if (!Number.isFinite(vacancies) || vacancies < 1 || !Number.isInteger(vacancies)) {
      e.vacancies = "ვაკანსიების რაოდენობა მინიმუმ 1 უნდა იყოს."
    } else if (isEdit && vacancies < acceptedCountSnapshot) {
      e.vacancies = `ვაკანსიები არ უნდა იყოს ნაკლები უკვე მიღებული ფრილანსერების (${acceptedCountSnapshot}) რაოდენობაზე.`
    }

    setFieldErrors(e)
    return Object.keys(e).length === 0
  }

  const handlePublishFromPreview = async () => {
    if (!supabase || !hirerProfileId) return
    if (!validateForPublish()) {
      setShowPreview(false)
      return
    }

    setSubmitting(true)
    setPageError("")

    try {
      let currentJobId = jobId ?? null
      if (isEdit && jobId) {
        const { error: upErr } = await supabase
          .from("jobs")
          .update({
            category_id: categoryId,
            subcategory_id: subcategoryId || null,
            title: title.trim(),
            description: description.trim(),
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
        const exp = new Date()
        exp.setDate(exp.getDate() + 30)

        const { data: inserted, error: insJobErr } = await supabase
          .from("jobs")
          .insert({
            hirer_profile_id: hirerProfileId,
            category_id: categoryId,
            subcategory_id: subcategoryId || null,
            title: title.trim(),
            description: description.trim(),
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
        if (!inserted?.id) throw new Error("განცხადების გამოქვეყნება ვერ მოხერხდა.")
        currentJobId = inserted.id

        if (selectedSkillIds.length > 0) {
          const { error: skErr } = await supabase
            .from("job_skills")
            .insert(selectedSkillIds.map((skill_id) => ({ job_id: inserted.id, skill_id })))
          if (skErr) throw skErr
        }
      }

      if (!currentJobId) throw new Error("განცხადების ID ვერ მოიძებნა.")

      let uploadedImagePaths: string[] = []
      if (newImageFiles.length > 0) {
        const bucket = "job-images"
        const compressedFiles = await Promise.all(newImageFiles.map((file) => compressImage(file)))
        uploadedImagePaths = []
        for (let i = 0; i < compressedFiles.length; i += 1) {
          const blob = compressedFiles[i]
          const safeName = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.jpg`
          const path = `${hirerProfileId}/${currentJobId}/${safeName}`
          const { error: uploadError } = await supabase.storage.from(bucket).upload(path, blob, {
            contentType: "image/jpeg",
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

      navigate("/dashboard", {
        replace: true,
        state: { successMessage: isEdit ? "განცხადება განახლდა." : "განცხადება წარმატებით გამოქვეყნდა." },
      })
    } catch (e) {
      setPageError(
        e instanceof Error
          ? e.message
          : isEdit
            ? "განახლება ვერ მოხერხდა."
            : "განცხადების გამოქვეყნება ვერ მოხერხდა.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="mx-auto flex max-w-[720px] items-center justify-center px-6 py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-[#D4A843]" />
        </div>
      </div>
    )
  }

  return (
    <div className="page-enter min-h-screen bg-[#F8F9FC]">
      <Navbar />
      <main className="mx-auto max-w-[720px] px-4 py-8 md:px-6 md:py-10">
        <h1 className="text-[28px] font-bold text-[#1B2B4B] md:text-5xl">{isEdit ? "განცხადების რედაქტირება" : "სამუშაოს განთავსება"}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {isEdit ? "განაახლე დეტალები და შეინახე ცვლილებები." : "შექმენი ახალი განცხადება და იპოვე საუკეთესო ფრილანსერი."}
        </p>

        {pageError ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{pageError}</p>
        ) : null}

        {showPreview ? (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="border-l-4 border-[#D4A843] pl-3 text-xl font-bold text-[#1B2B4B]">განცხადების პრევიუ</h2>

            <div className="mt-5 min-w-0 space-y-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="break-words text-2xl font-bold text-[#1B2B4B] [overflow-wrap:anywhere]">{title.trim()}</p>
              <p className="break-words whitespace-pre-wrap text-sm text-slate-600 [overflow-wrap:anywhere]">{description.trim()}</p>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-white px-3 py-1 text-slate-700">კატეგორია: {categoryNameKa}</span>
                {subcategoryId ? (
                  <span className="rounded-full bg-white px-3 py-1 text-slate-700">ქვეკატეგორია: {subcategoryNameKa}</span>
                ) : null}
                <span className="rounded-full bg-white px-3 py-1 text-slate-700">
                  ბიუჯეტი: {budgetMin} - {budgetMax} ₾ ({BUDGET_TYPE_LABELS[budgetType] ?? budgetType})
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-slate-700">ტიპი: {DURATION_TYPE_LABELS[durationType] ?? durationType}</span>
                <span className="rounded-full bg-white px-3 py-1 text-slate-700">ლოკაცია: {LOCATION_TYPE_LABELS[locationType] ?? locationType}</span>
                <span className="rounded-full bg-white px-3 py-1 text-slate-700">კონტაქტი: {CONTACT_LABELS[contactPreference] ?? contactPreference}</span>
                {applicationDeadline ? (
                  <span className="rounded-full bg-white px-3 py-1 text-slate-700">ვადა: {applicationDeadline}</span>
                ) : null}
                {isUrgent ? <span className="rounded-full bg-red-100 px-3 py-1 font-semibold text-red-700">სასწრაფო</span> : null}
                <span className="rounded-full bg-white px-3 py-1 text-slate-700">
                  ვაკანსიები / Vacancies: {vacancies}
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
                  <span className="text-xs text-slate-500">უნარები არ არის არჩეული</span>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="h-11 rounded-lg border border-slate-300 text-sm font-semibold text-[#1B2B4B] hover:bg-slate-50"
              >
                რედაქტირება
              </button>
              <button
                type="button"
                onClick={() => void handlePublishFromPreview()}
                disabled={submitting}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-[#1B2B4B] text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-white" />
                    მიმდინარეობს...
                  </span>
                ) : isEdit ? (
                  "ცვლილებების შენახვა"
                ) : (
                  "განცხადების გამოქვეყნება"
                )}
              </button>
            </div>
          </section>
        ) : (
          <div className="mt-6 space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#D4A843] pl-3 text-xl font-bold text-[#1B2B4B]">1. სამუშაოს დეტალები</h2>
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">
                    სამუშაოს სათაური <span className="text-red-500">*</span>
                  </span>
                  <input
                    type="text"
                    maxLength={100}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#D4A843] focus:ring-2"
                    placeholder="მაგ: React დეველოპერი eCommerce პროექტისთვის"
                  />
                  {fieldErrors.title ? <p className="mt-1 text-sm text-red-600">{fieldErrors.title}</p> : null}
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">
                    კატეგორია <span className="text-red-500">*</span>
                  </span>
                  <select
                    value={categoryId}
                    onChange={(e) => {
                      setCategoryId(e.target.value)
                      setSubcategoryId("")
                    }}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#D4A843] focus:ring-2"
                  >
                    <option value="">აირჩიე კატეგორია</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name_ka}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.categoryId ? <p className="mt-1 text-sm text-red-600">{fieldErrors.categoryId}</p> : null}
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">ქვეკატეგორია</span>
                  <select
                    value={subcategoryId}
                    onChange={(e) => setSubcategoryId(e.target.value)}
                    disabled={!categoryId}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#D4A843] focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    <option value="">აირჩიე ქვეკატეგორია</option>
                    {subcategories.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name_ka}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">
                    აღწერა <span className="text-red-500">*</span>
                  </span>
                  <textarea
                    rows={6}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#D4A843] focus:ring-2"
                    placeholder="აღწერე პროექტის მოთხოვნები, მიზანი და მოლოდინები..."
                  />
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span>მინიმუმ 100 სიმბოლო</span>
                    <span>{description.trim().length} სიმბოლო</span>
                  </div>
                  {fieldErrors.description ? <p className="mt-1 text-sm text-red-600">{fieldErrors.description}</p> : null}
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-[#1B2B4B]">
                  <input type="checkbox" checked={isUrgent} onChange={(e) => setIsUrgent(e.target.checked)} />
                  სასწრაფოა?
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#D4A843] pl-3 text-xl font-bold text-[#1B2B4B]">2. ბიუჯეტი</h2>
              <p className="mt-2 text-sm text-slate-500">მაგ: 500 - 1500 ₾</p>
              <div className="mt-4 space-y-4">
                <div>
                  <p className="mb-2 text-sm font-semibold text-[#1B2B4B]">
                    ბიუჯეტის ტიპი <span className="text-red-500">*</span>
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {Object.keys(BUDGET_TYPE_LABELS).map((key) => (
                      <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                        <input type="radio" name="budget_type" checked={budgetType === key} onChange={() => setBudgetType(key)} />
                        {BUDGET_TYPE_LABELS[key]}
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
                      type="number"
                      min={0}
                      value={budgetMin}
                      onChange={(e) => setBudgetMin(e.target.value)}
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#D4A843] focus:ring-2"
                    />
                    {fieldErrors.budgetMin ? <p className="mt-1 text-sm text-red-600">{fieldErrors.budgetMin}</p> : null}
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">
                      მაქს. ბიუჯეტი (₾) <span className="text-red-500">*</span>
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={budgetMax}
                      onChange={(e) => setBudgetMax(e.target.value)}
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#D4A843] focus:ring-2"
                    />
                    {fieldErrors.budgetMax ? <p className="mt-1 text-sm text-red-600">{fieldErrors.budgetMax}</p> : null}
                  </label>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#D4A843] pl-3 text-xl font-bold text-[#1B2B4B]">3. სამუშაოს ტიპი და ლოკაცია</h2>
              <div className="mt-4 space-y-4">
                <div>
                  <p className="mb-2 text-sm font-semibold text-[#1B2B4B]">ხანგრძლივობა</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Object.keys(DURATION_TYPE_LABELS).map((key) => (
                      <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                        <input type="radio" name="duration_type" checked={durationType === key} onChange={() => setDurationType(key)} />
                        {DURATION_TYPE_LABELS[key]}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-[#1B2B4B]">ლოკაცია</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Object.keys(LOCATION_TYPE_LABELS).map((key) => (
                      <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                        <input type="radio" name="location_type" checked={locationType === key} onChange={() => setLocationType(key)} />
                        {LOCATION_TYPE_LABELS[key]}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#D4A843] pl-3 text-xl font-bold text-[#1B2B4B]">4. საჭირო უნარები</h2>
              <p className="mt-2 text-sm text-slate-500">სურვილისამებრ (რეკომენდებულია)</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {allSkills.map((sk) => (
                  <button
                    key={sk.id}
                    type="button"
                    onClick={() => toggleSkill(sk.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      selectedSkillIds.includes(sk.id)
                        ? "bg-[#D4A843] text-[#1B2B4B]"
                        : "border border-slate-300 bg-white text-slate-700 hover:border-[#D4A843]"
                    }`}
                  >
                    {sk.name}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#D4A843] pl-3 text-xl font-bold text-[#1B2B4B]">5. კონტაქტი და ვადა</h2>
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">
                    ვაკანსიების რაოდენობა / Vacancies <span className="text-red-500">*</span>
                  </span>
                  <input
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
                    className="h-11 w-full max-w-[200px] rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#D4A843] focus:ring-2"
                  />
                  <p className="mt-1 text-xs text-slate-500">რამდენ ფრილანსერს შეუძლია ერთად მუშაობა ამ განცხადებაზე (მინ. 1).</p>
                  {fieldErrors.vacancies ? <p className="mt-1 text-sm text-red-600">{fieldErrors.vacancies}</p> : null}
                </label>
                <div>
                  <p className="mb-2 text-sm font-semibold text-[#1B2B4B]">კონტაქტის მეთოდი</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Object.keys(CONTACT_LABELS).map((key) => (
                      <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                        <input type="radio" name="contact_preference" checked={contactPreference === key} onChange={() => setContactPreference(key)} />
                        {CONTACT_LABELS[key]}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">განაცხადის ბოლო ვადა</span>
                  <input
                    type="date"
                    value={applicationDeadline}
                    min={todayIso}
                    onChange={(e) => setApplicationDeadline(e.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#D4A843] focus:ring-2"
                  />
                  {fieldErrors.applicationDeadline ? (
                    <p className="mt-1 text-sm text-red-600">{fieldErrors.applicationDeadline}</p>
                  ) : null}
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#D4A843] pl-3 text-xl font-bold text-[#1B2B4B]">6. პრევიუ გამოქვეყნებამდე</h2>
              <p className="mt-2 text-sm text-slate-500">გადაამოწმე ინფორმაცია და გააგრძელე განცხადების პრევიუზე.</p>
              <button
                type="button"
                onClick={() => {
                  setPageError("")
                  if (validateForPublish()) setShowPreview(true)
                }}
                className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-[#1B2B4B] px-6 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B]"
              >
                პრევიუს ნახვა
              </button>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="border-l-4 border-[#D4A843] pl-3 text-xl font-bold text-[#1B2B4B]">7. სურათები</h2>
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
                  className="block w-full text-xs text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-[#1B2B4B] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
                />
                {existingImageUrls.length + newImageFiles.length > 0 ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {existingImageUrls.map((url) => (
                      <div key={url} className="overflow-hidden rounded-md border border-slate-200 bg-white">
                        <img
                          src={supabase ? jobImageThumbnailUrl(supabase, url) : ""}
                          alt=""
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
                        <img src={preview.url} alt="" className="h-20 w-full object-cover" />
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
          </div>
        )}
      </main>
    </div>
  )
}
