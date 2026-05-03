import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import Navbar from "../components/Navbar"
import { isSupabaseConfigured, supabase } from "../lib/supabase"

type ListingMeta = {
  categoryId: string | null
  tags: string[]
}

type TagOption = {
  name: string
  categoryId: string | null
}

const META_PREFIX = "<!--gigori-meta:"
const META_SUFFIX = "-->"

function parseListingDescription(raw: string | null): { description: string; meta: ListingMeta } {
  const fallback: ListingMeta = { categoryId: null, tags: [] }
  if (!raw) return { description: "", meta: fallback }

  if (!raw.startsWith(META_PREFIX)) {
    return { description: raw, meta: fallback }
  }

  const endIndex = raw.indexOf(META_SUFFIX)
  if (endIndex < 0) return { description: raw, meta: fallback }

  const metaChunk = raw.slice(META_PREFIX.length, endIndex).trim()
  const body = raw.slice(endIndex + META_SUFFIX.length).trimStart()

  try {
    const parsed = JSON.parse(metaChunk) as Partial<ListingMeta>
    return {
      description: body,
      meta: {
        categoryId: parsed.categoryId ?? null,
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20)
          : [],
      },
    }
  } catch {
    return { description: raw, meta: fallback }
  }
}

function buildListingDescription(description: string, meta: ListingMeta) {
  const cleanedMeta: ListingMeta = {
    categoryId: meta.categoryId ?? null,
    tags: meta.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
  }
  return `${META_PREFIX}${JSON.stringify(cleanedMeta)}${META_SUFFIX}\n${description.trim()}`
}

export default function ListingFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const [freelancerProfileId, setFreelancerProfileId] = useState("")
  const [categories, setCategories] = useState<Array<{ id: string; name_ka: string }>>([])
  const [availableTags, setAvailableTags] = useState<TagOption[]>([])

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("")
  const [deliveryDays, setDeliveryDays] = useState("3")
  const [isActive, setIsActive] = useState(true)
  const [categoryId, setCategoryId] = useState("")
  const [tags, setTags] = useState<string[]>([])

  useEffect(() => {
    document.title = isEdit ? "ლისტინგის რედაქტირება — გიგორი" : "ახალი ლისტინგი — გიგორი"
  }, [isEdit])

  useEffect(() => {
    const load = async () => {
      if (!isSupabaseConfigured || !supabase) {
        setError("Supabase არ არის კონფიგურირებული.")
        setLoading(false)
        return
      }

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()
        if (userError || !user) {
          navigate("/login?reason=listing", { replace: true })
          return
        }

        const [{ data: fp, error: fpError }, { data: categoryRows, error: categoryError }, { data: skillRows, error: skillError }] = await Promise.all([
          supabase.from("freelancer_profiles").select("id").eq("user_id", user.id).maybeSingle(),
          supabase.from("categories").select("id,name_ka").eq("is_active", true).order("sort_order"),
          supabase.from("skills").select("name,category_id").eq("is_approved", true).order("name"),
        ])

        if (fpError || !fp) throw new Error("ფრილანსერის პროფილი ვერ მოიძებნა.")
        if (categoryError) throw categoryError
        if (skillError) throw skillError

        setFreelancerProfileId(fp.id)
        setCategories((categoryRows ?? []) as Array<{ id: string; name_ka: string }>)
        setAvailableTags(
          Array.from(
            new Map(
              (skillRows ?? [])
                .map((row: any) => ({
                  name: String(row.name ?? "").trim(),
                  categoryId: row.category_id ?? null,
                }))
                .filter((row) => row.name)
                .map((row) => [`${row.name}::${row.categoryId ?? "none"}`, row]),
            ).values(),
          ),
        )

        if (isEdit && id) {
          const { data: listing, error: listingError } = await supabase
            .from("services")
            .select("*")
            .eq("id", id)
            .eq("freelancer_profile_id", fp.id)
            .single()
          if (listingError || !listing) throw new Error("ლისტინგი ვერ მოიძებნა.")

          const parsed = parseListingDescription(listing.description ?? "")
          setTitle(listing.title ?? "")
          setDescription(parsed.description)
          setPrice(String(listing.price ?? 0))
          setDeliveryDays(String(listing.delivery_days ?? 3))
          setIsActive(listing.is_active ?? true)
          setCategoryId(parsed.meta.categoryId ?? "")
          setTags(parsed.meta.tags)
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "ჩატვირთვა ვერ მოხერხდა.")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [id, isEdit, navigate])

  const categoryFilteredTags = useMemo(
    () => availableTags.filter((tag) => tag.categoryId === categoryId),
    [availableTags, categoryId],
  )

  useEffect(() => {
    if (!categoryId) {
      setTags([])
      return
    }
    const allowed = new Set(categoryFilteredTags.map((tag) => tag.name))
    setTags((prev) => prev.filter((tag) => allowed.has(tag)))
  }, [categoryId, categoryFilteredTags])

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]))
  }

  const canSubmit = useMemo(() => title.trim().length > 0 && !saving, [title, saving])

  const handleSave = async () => {
    if (!supabase || !freelancerProfileId) return
    setError("")

    if (!title.trim()) {
      setError("სათაური სავალდებულოა.")
      return
    }
    const parsedPrice = Number(price || "0")
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError("ფასი არასწორია.")
      return
    }
    const parsedDelivery = Number(deliveryDays || "0")
    if (!Number.isInteger(parsedDelivery) || parsedDelivery <= 0) {
      setError("ვადა უნდა იყოს დადებითი მთელი რიცხვი.")
      return
    }

    setSaving(true)
    try {
      const payload = {
        freelancer_profile_id: freelancerProfileId,
        title: title.trim(),
        description: buildListingDescription(description, { categoryId: categoryId || null, tags }),
        price: parsedPrice,
        delivery_days: parsedDelivery,
        is_active: isActive,
      }

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
        if ((count ?? 0) >= 3) throw new Error("მაქსიმუმ 3 ლისტინგი შეგიძლია გქონდეს.")

        const { error: insertError } = await supabase.from("services").insert(payload)
        if (insertError) throw insertError
      }

      navigate("/dashboard", {
        replace: true,
        state: { successMessage: isEdit ? "ლისტინგი განახლდა." : "ლისტინგი დაემატა." },
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "შენახვა ვერ მოხერხდა.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <main className="mx-auto max-w-4xl px-6 py-10">იტვირთება...</main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-5 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-[#1B2B4B]">
              {isEdit ? "ლისტინგის რედაქტირება" : "ახალი ლისტინგის დამატება"}
            </h1>
            <Link to="/dashboard" className="text-sm font-semibold text-[#D4A843] hover:underline">
              უკან დაშბორდზე
            </Link>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">სათაური *</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                placeholder="მაგ: ვებსაიტის დამზადება React-ით"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">კატეგორია</span>
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
              >
                <option value="">აირჩიე კატეგორია</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name_ka}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">აღწერა</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="დეტალური აღწერა, რას აკეთებ ამ ლისტინგში"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">ფასი (₾)</span>
                <input
                  type="number"
                  min="0"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">ვადა (დღე) *</span>
                <input
                  type="number"
                  min="1"
                  value={deliveryDays}
                  onChange={(event) => setDeliveryDays(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                />
              </label>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold text-[#1B2B4B]">ტეგები</p>
              {!categoryId ? (
                <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  ჯერ აირჩიე კატეგორია და შემდეგ გამოჩნდება შესაბამისი ტეგები.
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
                    კატეგორიაზე მორგებული ტეგები. არჩეული: {tags.length}
                  </p>
                </>
              )}
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
              აქტიური ლისტინგი
            </label>
          </div>

          {error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSubmit}
              className="h-11 rounded-lg bg-[#1B2B4B] px-5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "ინახება..." : "შენახვა"}
            </button>
            <Link
              to="/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 px-5 text-sm font-semibold text-slate-700"
            >
              გაუქმება
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
