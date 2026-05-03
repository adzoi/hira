import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import Navbar from "../components/Navbar"
import { PROFILE_LANGUAGE_OPTIONS } from "../lib/profileLanguages.ts"
import { parseGitHubField, parseLinkedInField, parseOptionalWebUrl } from "../lib/socialUrls.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"

const industryOptions = ["ტექნოლოგია", "მარკეტინგი", "განათლება", "ფინანსები", "ჯანდაცვა", "უძრავი ქონება", "სხვა"]

type ServiceForm = {
  title: string
  description: string
  price_type: "fixed" | "hourly" | "negotiable"
  price: string
  delivery_days: string
}

export default function OnboardingPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const [userId, setUserId] = useState("")
  const [userType, setUserType] = useState<"freelancer" | "hirer" | "">("")

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [skills, setSkills] = useState<Array<{ id: string; name: string; category_id: string | null }>>([])
  const [categoriesMap, setCategoriesMap] = useState<Record<string, string>>({})
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  const [professionalTitle, setProfessionalTitle] = useState("")
  const [bio, setBio] = useState("")
  const [availability, setAvailability] = useState<"full_time" | "part_time" | "weekends" | "">("")
  const [languages, setLanguages] = useState<string[]>([])
  const [linkedinUrl, setLinkedinUrl] = useState("")
  const [githubUrl, setGithubUrl] = useState("")
  const [portfolioUrl, setPortfolioUrl] = useState("")
  const [noLinkedinProfile, setNoLinkedinProfile] = useState(false)
  const [noGithubProfile, setNoGithubProfile] = useState(false)
  const [noPortfolioWebsite, setNoPortfolioWebsite] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string>("")
  const [avatarPreview, setAvatarPreview] = useState<string>("")
  const [avatarUploading, setAvatarUploading] = useState<boolean>(false)
  const [freelancerProfileId, setFreelancerProfileId] = useState<string | null>(null)
  const [freelancerSlug, setFreelancerSlug] = useState<string | null>(null)
  const [services, setServices] = useState<ServiceForm[]>([
    { title: "", description: "", price_type: "fixed", price: "", delivery_days: "" },
  ])

  const [companyName, setCompanyName] = useState("")
  const [companyDescription, setCompanyDescription] = useState("")
  const [industry, setIndustry] = useState("")
  const [companyWebsite, setCompanyWebsite] = useState("")

  useEffect(() => {
    const init = async () => {
      if (!isSupabaseConfigured || !supabase) {
        setError("Supabase არ არის კონფიგურირებული.")
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

        const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single()
        if (!profile) throw new Error("პროფილი ვერ მოიძებნა.")
        setUserId(user.id)
        setUserType(profile.user_type as "freelancer" | "hirer")
        setAvatarUrl(profile.avatar_url ?? "")
        setAvatarPreview(profile.avatar_url ?? "")

        if (profile.user_type === "freelancer") {
          const [{ data: fp }, { data: skillsData }, { data: categoriesData }] = await Promise.all([
            supabase.from("freelancer_profiles").select("*").eq("user_id", user.id).maybeSingle(),
            supabase.from("skills").select("id,name,category_id"),
            supabase.from("categories").select("id,name_ka"),
          ])

          if (fp?.is_profile_complete) {
            navigate("/dashboard", { replace: true })
            return
          }

          if (fp) {
            setFreelancerProfileId(fp.id)
            setFreelancerSlug(fp.slug)
            setProfessionalTitle(fp.professional_title ?? "")
            setBio(fp.bio ?? "")
            setAvailability((fp.availability as "full_time" | "part_time" | "weekends" | "") ?? "")
            setLanguages(fp.languages ?? [])
            const lidLi = (fp.linkedin_url ?? "").trim()
            const lidGh = (fp.github_url ?? "").trim()
            const lidPf = (fp.portfolio_url ?? "").trim()
            setLinkedinUrl(fp.linkedin_url ?? "")
            setGithubUrl(fp.github_url ?? "")
            setPortfolioUrl(fp.portfolio_url ?? "")
            setNoLinkedinProfile(!lidLi)
            setNoGithubProfile(!lidGh)
            setNoPortfolioWebsite(!lidPf)

            const [{ data: selectedSkills }, { data: existingServices }] = await Promise.all([
              supabase.from("freelancer_skills").select("skill_id").eq("freelancer_profile_id", fp.id),
              supabase.from("services").select("*").eq("freelancer_profile_id", fp.id).order("created_at"),
            ])
            setSelectedSkillIds((selectedSkills ?? []).map((x) => x.skill_id))
            if (existingServices && existingServices.length > 0) {
              setServices(
                existingServices.slice(0, 5).map((s) => ({
                  title: s.title,
                  description: s.description ?? "",
                  price_type: "fixed",
                  price: String(s.price),
                  delivery_days: String(s.delivery_days),
                })),
              )
            }
          }

          setSkills(skillsData ?? [])
          const map: Record<string, string> = {}
          for (const c of categoriesData ?? []) map[c.id] = c.name_ka
          setCategoriesMap(map)
        } else {
          const { data: hp } = await supabase.from("hirer_profiles").select("*").eq("user_id", user.id).maybeSingle()
          if (hp?.company_name && hp?.description && hp?.industry) {
            navigate("/dashboard", { replace: true })
            return
          }
          if (hp) {
            setCompanyName(hp.company_name ?? "")
            setCompanyDescription(hp.description ?? "")
            setIndustry(hp.industry ?? "")
            setCompanyWebsite(hp.website_url ?? "")
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "ონბორდინგის ჩატვირთვა ვერ მოხერხდა.")
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [navigate])

  const groupedSkills = skills.reduce<Record<string, Array<{ id: string; name: string }>>>((acc, skill) => {
    const key = skill.category_id ? categoriesMap[skill.category_id] ?? "სხვა" : "სხვა"
    if (!acc[key]) acc[key] = []
    acc[key].push({ id: skill.id, name: skill.name })
    return acc
  }, {})

  const handleAvatarUpload = async (file: File) => {
    if (!file) return
    if (!supabase) return

    const user = (await supabase.auth.getUser()).data.user
    if (!user) return

    if (file.size > 5 * 1024 * 1024) {
      setError("სურათის ზომა არ უნდა აღემატებოდეს 5MB-ს.")
      return
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("მხოლოდ JPEG, PNG ან WebP ფორმატები დაიშვება.")
      return
    }

    setAvatarUploading(true)
    setError("")
    try {
      const fileExt = file.name.split(".").pop()
      const filePath = `${user.id}/avatar.${fileExt}`
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true })
      if (uploadError) throw uploadError
      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath)
      setAvatarUrl(publicUrl)
      setAvatarPreview(URL.createObjectURL(file))
    } catch (err: any) {
      setError(`ავატარის ატვირთვა ვერ მოხერხდა: ${err.message}`)
    } finally {
      setAvatarUploading(false)
    }
  }

  const toggleSkill = (id: string) =>
    setSelectedSkillIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  const toggleLanguage = (lng: string) =>
    setLanguages((prev) => (prev.includes(lng) ? prev.filter((x) => x !== lng) : [...prev, lng]))

  const updateService = (idx: number, key: keyof ServiceForm, value: string) => {
    setServices((prev) => prev.map((s, i) => (i === idx ? { ...s, [key]: value } : s)))
  }

  const nextFromStep1 = () => {
    if (!professionalTitle.trim()) return setError("პროფესიული სათაური სავალდებულოა.")
    if (bio.trim().length < 50) return setError("ბიო უნდა იყოს მინიმუმ 50 სიმბოლო.")
    if (!availability) return setError("აირჩიე ხელმისაწვდომობა.")
    if (languages.length === 0) return setError("აირჩიე მინიმუმ ერთი ენა.")
    setError("")
    setStep(2)
  }

  const nextFromStep2 = () => {
    if (selectedSkillIds.length < 3) return setError("აირჩიე მინიმუმ 3 უნარი.")
    if (services.length < 1) return setError("მინიმუმ ერთი სერვისია საჭირო.")
    for (let i = 0; i < services.length; i += 1) {
      const s = services[i]
      if (!s.title.trim()) return setError(`სერვისი #${i + 1}: სათაური სავალდებულოა.`)
      if (s.description.length > 300) return setError(`სერვისი #${i + 1}: აღწერა მაქსიმუმ 300 სიმბოლო.`)
      if (!s.delivery_days || Number(s.delivery_days) <= 0) return setError(`სერვისი #${i + 1}: მიუთითე ვადა.`)
      if (s.price_type !== "negotiable" && (!s.price || Number(s.price) < 0)) {
        return setError(`სერვისი #${i + 1}: მიუთითე ფასი.`)
      }
    }
    setError("")
    setStep(3)
  }

  const submitFreelancer = async () => {
    if (!supabase) return
    setSubmitting(true)
    setError("")
    try {
      const parsedLi = parseLinkedInField(noLinkedinProfile ? "" : linkedinUrl)
      if (!parsedLi.ok) throw new Error(parsedLi.message)
      const parsedGh = parseGitHubField(noGithubProfile ? "" : githubUrl)
      if (!parsedGh.ok) throw new Error(parsedGh.message)
      const parsedPf = parseOptionalWebUrl(noPortfolioWebsite ? "" : portfolioUrl)
      if (!parsedPf.ok) throw new Error(parsedPf.message)

      const slug =
        freelancerSlug ??
        `freelancer-${userId.slice(0, 8)}-${Date.now().toString().slice(-4)}`

      const { error: profileError } = await supabase.from("profiles").update({ avatar_url: avatarUrl || null }).eq("id", userId)
      if (profileError) throw profileError

      const { data: fp, error: fpError } = await supabase
        .from("freelancer_profiles")
        .upsert(
          {
            id: freelancerProfileId ?? undefined,
            user_id: userId,
            slug,
            professional_title: professionalTitle.trim(),
            bio: bio.trim(),
            availability,
            languages,
            linkedin_url: parsedLi.value,
            github_url: parsedGh.value,
            portfolio_url: parsedPf.value,
            is_profile_complete: true,
            is_public: true,
          },
          { onConflict: "user_id" },
        )
        .select("id")
        .single()
      if (fpError || !fp) throw fpError ?? new Error("ფრილანსერის პროფილი ვერ შეინახა.")

      await supabase.from("freelancer_skills").delete().eq("freelancer_profile_id", fp.id)
      const { error: skillsError } = await supabase.from("freelancer_skills").insert(
        selectedSkillIds.map((skill_id) => ({ freelancer_profile_id: fp.id, skill_id })),
      )
      if (skillsError) throw skillsError

      await supabase.from("services").delete().eq("freelancer_profile_id", fp.id)
      const { error: servicesError } = await supabase.from("services").insert(
        services.map((s) => ({
          freelancer_profile_id: fp.id,
          title: s.title.trim(),
          description:
            s.price_type === "fixed"
              ? s.description.trim()
              : `[ფასი: ${s.price_type === "hourly" ? "საათობრივი" : "შეთანხმებით"}] ${s.description.trim()}`,
          price: s.price_type === "negotiable" ? 0 : Number(s.price),
          delivery_days: Number(s.delivery_days),
          is_active: true,
        })),
      )
      if (servicesError) throw servicesError

      navigate("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "შენახვა ვერ მოხერხდა.")
    } finally {
      setSubmitting(false)
    }
  }

  const submitHirer = async () => {
    if (!supabase) return
    if (!companyName.trim()) return setError("კომპანიის სახელი სავალდებულოა.")
    if (companyDescription.trim().length < 30) return setError("კომპანიის აღწერა უნდა იყოს მინიმუმ 30 სიმბოლო.")
    if (!industry) return setError("აირჩიე ინდუსტრია.")

    setSubmitting(true)
    setError("")
    try {
      const { error: hpError } = await supabase.from("hirer_profiles").upsert(
        {
          user_id: userId,
          company_name: companyName.trim(),
          description: companyDescription.trim(),
          industry,
          website_url: companyWebsite.trim() || null,
        },
        { onConflict: "user_id" },
      )
      if (hpError) throw hpError
      navigate("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "შენახვა ვერ მოხერხდა.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="mx-auto flex max-w-3xl items-center justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-[#D4A843]" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mx-auto max-w-[640px] rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-[#1B2B4B]">ონბორდინგი</h1>

          {userType === "hirer" ? (
            <div className="mt-6 space-y-4">
              <input className="h-11 w-full rounded-lg border border-slate-300 px-3" placeholder="კომპანიის სახელი" value={companyName} onChange={(e)=>setCompanyName(e.target.value)} />
              <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2" rows={4} placeholder="კომპანიის აღწერა" value={companyDescription} onChange={(e)=>setCompanyDescription(e.target.value)} />
              <select className="h-11 w-full rounded-lg border border-slate-300 px-3" value={industry} onChange={(e)=>setIndustry(e.target.value)}>
                <option value="">აირჩიე ინდუსტრია</option>
                {industryOptions.map((opt)=><option key={opt} value={opt}>{opt}</option>)}
              </select>
              <input className="h-11 w-full rounded-lg border border-slate-300 px-3" placeholder="ვებსაიტი (არასავალდებულო)" value={companyWebsite} onChange={(e)=>setCompanyWebsite(e.target.value)} />
              {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
              <button disabled={submitting} onClick={submitHirer} className="h-11 w-full rounded-lg bg-[#1B2B4B] text-white hover:bg-[#D4A843] hover:text-[#1B2B4B]">{submitting ? "იტვირთება..." : "პროფილის შენახვა"}</button>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="h-2 rounded-full bg-slate-200">
                <div className="h-2 rounded-full bg-[#D4A843]" style={{ width: `${(step / 3) * 100}%` }} />
              </div>
              <p className="text-xs text-slate-500">ნაბიჯი {step}/3</p>

              {step === 1 && (
                <div className="space-y-3">
                  <input className="h-11 w-full rounded-lg border border-slate-300 px-3" placeholder="პროფესიული სათაური" value={professionalTitle} onChange={(e)=>setProfessionalTitle(e.target.value)} />
                  <div>
                    <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2" rows={5} placeholder="ბიო" value={bio} onChange={(e)=>setBio(e.target.value)} />
                    <p className="mt-1 text-right text-xs text-slate-500">{bio.length}/2000</p>
                  </div>
                  <div className="space-y-2 text-sm">
                    {[
                      ["full_time", "სრული განაკვეთი"],
                      ["part_time", "ნახევარი განაკვეთი"],
                      ["weekends", "შაბათ-კვირა"],
                    ].map(([value, label]) => (
                      <label key={value} className="flex items-center gap-2">
                        <input type="radio" checked={availability === value} onChange={() => setAvailability(value as "full_time" | "part_time" | "weekends")} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-slate-600">ენები (მინ. 1)</p>
                    <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 p-2">
                      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                        {PROFILE_LANGUAGE_OPTIONS.map((lng) => (
                          <label key={lng} className="flex cursor-pointer items-center gap-2">
                            <input type="checkbox" checked={languages.includes(lng)} onChange={() => toggleLanguage(lng)} />
                            <span className="truncate">{lng}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
                  <button onClick={nextFromStep1} className="h-11 w-full rounded-lg bg-[#1B2B4B] text-white hover:bg-[#D4A843] hover:text-[#1B2B4B]">შემდეგი</button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    {Object.entries(groupedSkills).map(([cat, list]) => (
                      <div key={cat}>
                        <p className="mb-2 text-xs font-semibold text-slate-500">{cat}</p>
                        <div className="flex flex-wrap gap-2">
                          {list.map((s) => (
                            <button key={s.id} type="button" onClick={() => toggleSkill(s.id)} className={`rounded-full px-3 py-1 text-xs ${selectedSkillIds.includes(s.id) ? "bg-[#D4A843] text-[#1B2B4B]" : "border border-slate-300"}`}>
                              {s.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {services.map((service, idx) => (
                      <div key={`service-${idx}`} className="rounded-lg border border-slate-200 p-3">
                        <input className="mb-2 h-10 w-full rounded border border-slate-300 px-2" placeholder="სერვისის სათაური" value={service.title} onChange={(e)=>updateService(idx,"title",e.target.value)} />
                        <textarea className="mb-2 w-full rounded border border-slate-300 px-2 py-1" rows={3} maxLength={300} placeholder="აღწერა (მაქს 300)" value={service.description} onChange={(e)=>updateService(idx,"description",e.target.value)} />
                        <div className="mb-2 flex gap-3 text-sm">
                          {["fixed", "hourly", "negotiable"].map((pt) => (
                            <label key={pt} className="flex items-center gap-1">
                              <input type="radio" checked={service.price_type === pt} onChange={() => updateService(idx, "price_type", pt)} />
                              {pt}
                            </label>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {service.price_type !== "negotiable" ? <input className="h-10 rounded border border-slate-300 px-2" type="number" placeholder="ფასი (₾)" value={service.price} onChange={(e)=>updateService(idx,"price",e.target.value)} /> : <div className="h-10 rounded border border-slate-200 bg-slate-50 px-2 text-sm leading-10">ფასი შეთანხმებით</div>}
                          <input className="h-10 rounded border border-slate-300 px-2" type="number" placeholder="მიწოდების ვადა" value={service.delivery_days} onChange={(e)=>updateService(idx,"delivery_days",e.target.value)} />
                        </div>
                        {services.length > 1 && <button type="button" onClick={()=>setServices((prev)=>prev.filter((_,i)=>i!==idx))} className="mt-2 text-xs text-red-600">წაშლა</button>}
                      </div>
                    ))}
                    <button type="button" disabled={services.length >= 5} onClick={() => setServices((prev)=>[...prev,{ title: "", description: "", price_type: "fixed", price: "", delivery_days: "" }])} className="text-sm font-semibold text-[#D4A843]">＋ სერვისის დამატება</button>
                  </div>
                  {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setStep(1)} className="h-11 rounded-lg border border-slate-300">უკან</button>
                    <button onClick={nextFromStep2} className="h-11 rounded-lg bg-[#1B2B4B] text-white hover:bg-[#D4A843] hover:text-[#1B2B4B]">შემდეგი</button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div>
                    {avatarPreview && (
                      <img src={avatarPreview} alt="Avatar preview" style={{ width: 100, height: 100, borderRadius: "50%", objectFit: "cover", marginBottom: 12 }} />
                    )}
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleAvatarUpload(file) }} disabled={avatarUploading} />
                    {avatarUploading && <p>იტვირთება...</p>}
                  </div>
                  <div>
                    <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={noLinkedinProfile}
                        onChange={(e) => {
                          const on = e.target.checked
                          setNoLinkedinProfile(on)
                          if (on) setLinkedinUrl("")
                        }}
                      />
                      არ მაქვს LinkedIn პროფილი
                    </label>
                    <input
                      type="url"
                      disabled={noLinkedinProfile}
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 disabled:cursor-not-allowed disabled:bg-slate-100"
                      placeholder="https://www.linkedin.com/in/..."
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      {noLinkedinProfile ? "ლინკი არ შეინახება." : "დატოვე ცარიელი ან მიუთითე linkedin.com ბმული."}
                    </p>
                  </div>
                  <div>
                    <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={noGithubProfile}
                        onChange={(e) => {
                          const on = e.target.checked
                          setNoGithubProfile(on)
                          if (on) setGithubUrl("")
                        }}
                      />
                      არ მაქვს GitHub პროფილი
                    </label>
                    <input
                      type="url"
                      disabled={noGithubProfile}
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 disabled:cursor-not-allowed disabled:bg-slate-100"
                      placeholder="https://github.com/..."
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      {noGithubProfile ? "ლინკი არ შეინახება." : "დატოვე ცარიელი ან მიუთითე github.com ბმული."}
                    </p>
                  </div>
                  <div>
                    <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={noPortfolioWebsite}
                        onChange={(e) => {
                          const on = e.target.checked
                          setNoPortfolioWebsite(on)
                          if (on) setPortfolioUrl("")
                        }}
                      />
                      არ მაქვს პორტფოლიოს ვებსაიტი
                    </label>
                    <input
                      type="url"
                      disabled={noPortfolioWebsite}
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 disabled:cursor-not-allowed disabled:bg-slate-100"
                      placeholder="https://..."
                      value={portfolioUrl}
                      onChange={(e) => setPortfolioUrl(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      {noPortfolioWebsite ? "ლინკი არ შეინახება." : "დატოვე ცარიელი ან მიუთითე საიტის ბმული."}
                    </p>
                  </div>
                  {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setStep(2)} className="h-11 rounded-lg border border-slate-300">უკან</button>
                    <button disabled={submitting} onClick={submitFreelancer} className="h-11 rounded-lg bg-[#1B2B4B] text-white hover:bg-[#D4A843] hover:text-[#1B2B4B]">{submitting ? "იტვირთება..." : "პროფილის გამოქვეყნება"}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
