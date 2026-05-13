import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import Navbar from "../components/Navbar"
import { filterProfileLanguageOptions } from "../lib/profileLanguages.ts"
import {
  FREELANCER_EDUCATION_DEGREE_OPTIONS,
  type FreelancerEducationDegreeLevel,
} from "../lib/freelancerEducation.ts"
import { parseGitHubField, parseLinkedInField, parseOptionalWebUrl } from "../lib/socialUrls.ts"
import { avatarPublicUrl } from "../lib/storageImageUrl.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"

const industryOptions = ["ტექნოლოგია", "მარკეტინგი", "განათლება", "ფინანსები", "ჯანდაცვა", "უძრავი ქონება", "სხვა"]

type ExperienceForm = {
  title: string
  organization: string
  start_date: string
  end_date: string
  is_present: boolean
  description: string
}

type EducationForm = {
  institution: string
  degree_level: FreelancerEducationDegreeLevel | ""
  field_of_study: string
  end_date: string
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
  const [languageQuery, setLanguageQuery] = useState("")
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false)
  const languagePickerRef = useRef<HTMLDivElement | null>(null)
  const [linkedinUrl, setLinkedinUrl] = useState("")
  const [githubUrl, setGithubUrl] = useState("")
  const [portfolioUrl, setPortfolioUrl] = useState("")
  const [noLinkedinProfile, setNoLinkedinProfile] = useState(false)
  const [noGithubProfile, setNoGithubProfile] = useState(false)
  const [noPortfolioWebsite, setNoPortfolioWebsite] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string>("")
  const [avatarPreview, setAvatarPreview] = useState<string>("")
  const [avatarUploading, setAvatarUploading] = useState<boolean>(false)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const [freelancerProfileId, setFreelancerProfileId] = useState<string | null>(null)
  const [freelancerSlug, setFreelancerSlug] = useState<string | null>(null)
  const [experiences, setExperiences] = useState<ExperienceForm[]>([])
  const [educations, setEducations] = useState<EducationForm[]>([])
  /** Which skill category is active for picking tags (Georgian label key in groupedSkills). */
  const [skillFocusCategory, setSkillFocusCategory] = useState("")

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
            const readySlug = typeof fp.slug === "string" && fp.slug.trim() ? fp.slug.trim() : ""
            navigate(readySlug ? `/freelancer/${encodeURIComponent(readySlug)}` : "/profile", { replace: true })
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

            const [{ data: selectedSkills }] = await Promise.all([
              supabase.from("freelancer_skills").select("skill_id").eq("freelancer_profile_id", fp.id),
            ])
            setSelectedSkillIds((selectedSkills ?? []).map((x) => x.skill_id))
            const { data: existingExperience } = await supabase
              .from("experience")
              .select("title,organization,start_date,end_date,description")
              .eq("freelancer_profile_id", fp.id)
              .order("start_date", { ascending: false })
            if (existingExperience && existingExperience.length > 0) {
              setExperiences(
                existingExperience.slice(0, 10).map((item) => ({
                  title: item.title ?? "",
                  organization: item.organization ?? "",
                  start_date: item.start_date ?? "",
                  end_date: item.end_date ?? "",
                  is_present: !item.end_date,
                  description: item.description ?? "",
                })),
              )
            }
            const { data: existingEducation } = await supabase
              .from("freelancer_education")
              .select("institution,degree_level,field_of_study,end_date")
              .eq("freelancer_profile_id", fp.id)
              .order("end_date", { ascending: false })
            if (existingEducation && existingEducation.length > 0) {
              setEducations(
                existingEducation.slice(0, 10).map((item) => ({
                  institution: item.institution ?? "",
                  degree_level: (item.degree_level as FreelancerEducationDegreeLevel) ?? "",
                  field_of_study: item.field_of_study ?? "",
                  end_date: item.end_date ?? "",
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

  const filteredLanguageOptions = useMemo(() => filterProfileLanguageOptions(languageQuery), [languageQuery])

  const groupedSkills = skills.reduce<Record<string, Array<{ id: string; name: string }>>>((acc, skill) => {
    const key = skill.category_id ? categoriesMap[skill.category_id] ?? "სხვა" : "სხვა"
    if (!acc[key]) acc[key] = []
    acc[key].push({ id: skill.id, name: skill.name })
    return acc
  }, {})

  const skillNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of skills) m.set(s.id, s.name)
    return m
  }, [skills])

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
      setAvatarUrl(avatarPublicUrl(supabase, filePath))
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

  useEffect(() => {
    if (!languageMenuOpen) return
    const close = (e: MouseEvent) => {
      if (languagePickerRef.current && !languagePickerRef.current.contains(e.target as Node)) {
        setLanguageMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [languageMenuOpen])

  const updateExperience = (idx: number, key: keyof ExperienceForm, value: string | boolean) => {
    setExperiences((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item
        if (key === "is_present") {
          return { ...item, is_present: Boolean(value), end_date: Boolean(value) ? "" : item.end_date }
        }
        return { ...item, [key]: value } as ExperienceForm
      }),
    )
  }

  const updateEducation = (idx: number, key: keyof EducationForm, value: string) => {
    setEducations((prev) => prev.map((item, i) => (i === idx ? { ...item, [key]: value } : item)))
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
    const normalizedExperience = experiences
      .map((item) => ({
        title: item.title.trim(),
        organization: item.organization.trim(),
        start_date: item.start_date.trim(),
        end_date: item.end_date.trim(),
        is_present: item.is_present,
        description: item.description.trim(),
      }))
      .filter((item) => item.title || item.organization || item.start_date || item.end_date || item.description)

    if (normalizedExperience.length > 10) return setError("გამოცდილების მაქსიმუმ 10 ჩანაწერი შეგიძლია დაამატო.")
    for (let i = 0; i < normalizedExperience.length; i += 1) {
      const item = normalizedExperience[i]
      if (!item.title) return setError(`გამოცდილება #${i + 1}: პოზიცია/სახელი სავალდებულოა.`)
      if (!item.organization) return setError(`გამოცდილება #${i + 1}: სამუშაო ადგილი სავალდებულოა.`)
      if (!item.start_date) return setError(`გამოცდილება #${i + 1}: დაწყების თარიღი სავალდებულოა.`)
      if (!item.is_present && !item.end_date) return setError(`გამოცდილება #${i + 1}: დასრულების თარიღი ან „მიმდინარე“ სავალდებულოა.`)
      if (!item.is_present && item.end_date && new Date(item.end_date).getTime() < new Date(item.start_date).getTime()) {
        return setError(`გამოცდილება #${i + 1}: დასრულების თარიღი დაწყებაზე ადრე ვერ იქნება.`)
      }
    }

    const normalizedEducation = educations
      .map((item) => ({
        institution: item.institution.trim(),
        degree_level: item.degree_level.trim(),
        field_of_study: item.field_of_study.trim(),
        end_date: item.end_date.trim(),
      }))
      .filter((item) => item.institution || item.degree_level || item.field_of_study || item.end_date)

    if (normalizedEducation.length > 10) return setError("განათლების მაქსიმუმ 10 ჩანაწერი შეგიძლია დაამატო.")
    for (let i = 0; i < normalizedEducation.length; i += 1) {
      const item = normalizedEducation[i]
      if (!item.institution) return setError(`განათლება #${i + 1}: სასწავლებელი სავალდებულოა.`)
      if (!item.degree_level) return setError(`განათლება #${i + 1}: საფეხური (ბაკალავრი/მაგისტრი...) სავალდებულოა.`)
      if (!item.field_of_study) return setError(`განათლება #${i + 1}: სპეციალობა/მიმართულება სავალდებულოა.`)
      if (!item.end_date) return setError(`განათლება #${i + 1}: დასრულების თარიღი სავალდებულოა.`)
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
      if (parsedLi.ok === false) throw new Error(parsedLi.message)
      const parsedGh = parseGitHubField(noGithubProfile ? "" : githubUrl)
      if (parsedGh.ok === false) throw new Error(parsedGh.message)
      const parsedPf = parseOptionalWebUrl(noPortfolioWebsite ? "" : portfolioUrl)
      if (parsedPf.ok === false) throw new Error(parsedPf.message)

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

      await supabase.from("experience").delete().eq("freelancer_profile_id", fp.id)
      const normalizedExperience = experiences
        .map((item) => ({
          title: item.title.trim(),
          organization: item.organization.trim(),
          start_date: item.start_date.trim(),
          end_date: item.is_present ? null : item.end_date.trim() || null,
          description: item.description.trim() || null,
        }))
        .filter((item) => item.title && item.organization && item.start_date)
        .slice(0, 10)
      if (normalizedExperience.length > 0) {
        const { error: expErr } = await supabase.from("experience").insert(
          normalizedExperience.map((item) => ({
            freelancer_profile_id: fp.id,
            title: item.title,
            organization: item.organization,
            start_date: item.start_date,
            end_date: item.end_date,
            description: item.description,
            type: "work",
          })),
        )
        if (expErr) throw expErr
      }

      await supabase.from("freelancer_education").delete().eq("freelancer_profile_id", fp.id)
      const normalizedEducation = educations
        .map((item) => ({
          institution: item.institution.trim(),
          degree_level: item.degree_level.trim(),
          field_of_study: item.field_of_study.trim(),
          end_date: item.end_date.trim(),
        }))
        .filter((item) => item.institution && item.degree_level && item.field_of_study && item.end_date)
        .slice(0, 10)
      if (normalizedEducation.length > 0) {
        const { error: eduErr } = await supabase.from("freelancer_education").insert(
          normalizedEducation.map((item) => ({
            freelancer_profile_id: fp.id,
            institution: item.institution,
            degree_level: item.degree_level,
            field_of_study: item.field_of_study,
            end_date: item.end_date,
          })),
        )
        if (eduErr) throw eduErr
      }

      navigate(`/freelancer/${encodeURIComponent(slug)}`)
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
          <h1 className="text-3xl font-bold text-[#0088FF]">ონბორდინგი</h1>

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
                  <div ref={languagePickerRef} className="relative">
                    <p className="mb-1 text-xs font-medium text-slate-600">ენები (მინ. 1)</p>
                    {languages.length > 0 ? (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {languages.map((lng) => (
                          <span
                            key={lng}
                            className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#D1D5DB] bg-white px-2.5 py-0.5 text-xs font-medium text-[#374151]"
                          >
                            <span className="truncate">{lng}</span>
                            <button
                              type="button"
                              className="shrink-0 rounded-full px-0.5 text-slate-500 hover:bg-slate-100 hover:text-red-600"
                              aria-label={`${lng} ამოშლა`}
                              onClick={() => toggleLanguage(lng)}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <input
                      type="text"
                      value={languageQuery}
                      onChange={(e) => {
                        setLanguageQuery(e.target.value)
                        setLanguageMenuOpen(true)
                      }}
                      onFocus={() => setLanguageMenuOpen(true)}
                      placeholder="ძიება"
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#0088FF]/30 focus:border-[#0088FF] focus:ring-2"
                      autoComplete="off"
                    />
                    {languageMenuOpen ? (
                      <ul
                        role="listbox"
                        className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                      >
                        {filteredLanguageOptions.length === 0 ? (
                          <li className="px-3 py-2 text-sm text-slate-500">ვერ მოიძებნა — სხვა სიტყვით სცადე</li>
                        ) : (
                          filteredLanguageOptions.map((lng) => {
                            const selected = languages.includes(lng)
                            return (
                              <li key={lng} role="option" aria-selected={selected}>
                                <button
                                  type="button"
                                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                                    selected ? "bg-[#E8F4FF]/80 font-medium text-[#0088FF]" : "text-slate-800"
                                  }`}
                                  onClick={() => toggleLanguage(lng)}
                                >
                                  <span className="min-w-0 truncate">{lng}</span>
                                  {selected ? <span className="shrink-0 text-xs">✓</span> : null}
                                </button>
                              </li>
                            )
                          })
                        )}
                      </ul>
                    ) : null}
                  </div>
                  {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
                  <button
                    type="button"
                    onClick={nextFromStep1}
                    className="h-11 w-full rounded-lg bg-[#0088FF] text-sm font-medium text-white transition-colors duration-150 hover:bg-[#006ACC]"
                  >
                    შემდეგი
                  </button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-slate-600">
                      უნარები — ჯერ აირჩიე კატეგორია, შემდეგ დაამატე ტეგები ამ კატეგორიიდან (მინ. 3 სულ).
                    </p>
                    <p className="text-xs text-slate-500">
                      არჩეულია <span className="font-semibold tabular-nums text-slate-700">{selectedSkillIds.length}</span> უნარი · საჭიროა მინიმუმ{" "}
                      <span className="font-semibold">3</span>
                    </p>

                    <div>
                      <label htmlFor="onboarding-skill-category" className="mb-1 block text-xs font-medium text-slate-600">
                        კატეგორია
                      </label>
                      <select
                        id="onboarding-skill-category"
                        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#0088FF] focus:ring-2 focus:ring-[#0088FF]/25"
                        value={skillFocusCategory}
                        onChange={(e) => setSkillFocusCategory(e.target.value)}
                      >
                        <option value="">აირჩიე კატეგორია…</option>
                        {Object.keys(groupedSkills).map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    {skillFocusCategory && groupedSkills[skillFocusCategory] ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3">
                        <p className="mb-2 text-sm font-semibold text-[#0088FF]">{skillFocusCategory}</p>
                        {(() => {
                          const list = groupedSkills[skillFocusCategory]!
                          const selectedInCategory = list.filter((s) => selectedSkillIds.includes(s.id))
                          return (
                            <>
                              {selectedInCategory.length > 0 ? (
                                <div className="mb-2 flex flex-wrap gap-1.5">
                                  {selectedInCategory.map((s) => (
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
                              <label className="sr-only" htmlFor="onboarding-skill-add-active">
                                უნარის დამატება — {skillFocusCategory}
                              </label>
                              <select
                                id="onboarding-skill-add-active"
                                key={`skill-dd-${skillFocusCategory}-${selectedInCategory.map((s) => s.id).join("-")}`}
                                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#0088FF] focus:ring-2 focus:ring-[#0088FF]/25"
                                defaultValue=""
                                onChange={(e) => {
                                  const id = e.target.value
                                  if (id) {
                                    toggleSkill(id)
                                    e.target.value = ""
                                  }
                                }}
                              >
                                <option value="">ტეგის / უნარის დამატება…</option>
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
                    ) : (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-3 text-xs text-slate-500">
                        კატეგორიის ასარჩევად გამოიყენე ზემოთ სია — აქ გამოჩნდება შესაბამისი ტეგები.
                      </p>
                    )}

                    {selectedSkillIds.length > 0 ? (
                      <div className="rounded-lg border border-slate-100 bg-white p-3">
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
                  </div>
                  <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-semibold text-[#1B2B4B]">გამოცდილება (მაქს. 10)</p>
                    {experiences.length === 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setExperiences([
                            { title: "", organization: "", start_date: "", end_date: "", is_present: false, description: "" },
                          ])
                        }
                        className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-dashed border-[#0088FF]/50 bg-[#E8F4FF] px-4 text-sm font-semibold text-[#0088FF] transition hover:bg-[#D4EEFF]"
                      >
                        ＋ სამუშაოს / გამოცდილების დამატება
                      </button>
                    ) : (
                      <>
                        {experiences.map((exp, idx) => (
                          <div key={`exp-${idx}`} className="rounded-lg border border-slate-200 bg-white p-3">
                            <input
                              className="mb-2 h-10 w-full rounded border border-slate-300 px-2"
                              placeholder="პოზიცია / როლი"
                              value={exp.title}
                              onChange={(e) => updateExperience(idx, "title", e.target.value)}
                            />
                            <input
                              className="mb-2 h-10 w-full rounded border border-slate-300 px-2"
                              placeholder="სამუშაო ადგილი (კომპანია)"
                              value={exp.organization}
                              onChange={(e) => updateExperience(idx, "organization", e.target.value)}
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="date"
                                className="h-10 rounded border border-slate-300 px-2"
                                value={exp.start_date}
                                onChange={(e) => updateExperience(idx, "start_date", e.target.value)}
                              />
                              <input
                                type="date"
                                disabled={exp.is_present}
                                className="h-10 rounded border border-slate-300 px-2 disabled:bg-slate-100"
                                value={exp.end_date}
                                onChange={(e) => updateExperience(idx, "end_date", e.target.value)}
                              />
                            </div>
                            <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={exp.is_present}
                                onChange={(e) => updateExperience(idx, "is_present", e.target.checked)}
                              />
                              მიმდინარე
                            </label>
                            <textarea
                              className="mt-2 w-full rounded border border-slate-300 px-2 py-1"
                              rows={3}
                              placeholder="აღწერა"
                              value={exp.description}
                              onChange={(e) => updateExperience(idx, "description", e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setExperiences((prev) => {
                                  const next = prev.filter((_, i) => i !== idx)
                                  return next
                                })
                              }
                              className="mt-2 text-xs font-medium text-red-600 hover:underline"
                            >
                              წაშლა
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          disabled={experiences.length >= 10}
                          onClick={() =>
                            setExperiences((prev) => [
                              ...prev,
                              { title: "", organization: "", start_date: "", end_date: "", is_present: false, description: "" },
                            ])
                          }
                          className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-semibold text-[#0088FF] transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          ＋ კიდევ ერთი სამუშაოს დამატება
                        </button>
                      </>
                    )}
                  </div>

                  <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-semibold text-[#1B2B4B]">განათლება (არასავალდებულო, მაქს. 10)</p>
                    {educations.length === 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setEducations([{ institution: "", degree_level: "", field_of_study: "", end_date: "" }])
                        }
                        className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-dashed border-[#0088FF]/50 bg-[#E8F4FF] px-4 text-sm font-semibold text-[#0088FF] transition hover:bg-[#D4EEFF]"
                      >
                        ＋ განათლების დამატება
                      </button>
                    ) : (
                      <>
                        {educations.map((edu, idx) => (
                          <div key={`edu-${idx}`} className="rounded-lg border border-slate-200 bg-white p-3">
                            <input
                              className="mb-2 h-10 w-full rounded border border-slate-300 px-2"
                              placeholder="სად სწავლობ / სასწავლებელი"
                              value={edu.institution}
                              onChange={(e) => updateEducation(idx, "institution", e.target.value)}
                            />
                            <select
                              className="mb-2 h-10 w-full rounded border border-slate-300 bg-white px-2"
                              value={edu.degree_level}
                              onChange={(e) => updateEducation(idx, "degree_level", e.target.value)}
                            >
                              <option value="">აირჩიე საფეხური</option>
                              {FREELANCER_EDUCATION_DEGREE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <input
                              className="mb-2 h-10 w-full rounded border border-slate-300 px-2"
                              placeholder="რას სწავლობ (სპეციალობა / მიმართულება)"
                              value={edu.field_of_study}
                              onChange={(e) => updateEducation(idx, "field_of_study", e.target.value)}
                            />
                            <label className="mb-1 block text-xs text-slate-600">დასრულების თარიღი</label>
                            <input
                              type="date"
                              className="h-10 w-full rounded border border-slate-300 px-2"
                              value={edu.end_date}
                              onChange={(e) => updateEducation(idx, "end_date", e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => setEducations((prev) => prev.filter((_, i) => i !== idx))}
                              className="mt-2 text-xs font-medium text-red-600 hover:underline"
                            >
                              წაშლა
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          disabled={educations.length >= 10}
                          onClick={() =>
                            setEducations((prev) => [
                              ...prev,
                              { institution: "", degree_level: "", field_of_study: "", end_date: "" },
                            ])
                          }
                          className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-semibold text-[#0088FF] transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          ＋ კიდევ განათლების დამატება
                        </button>
                      </>
                    )}
                  </div>
                  {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setStep(1)} className="h-11 rounded-lg border border-slate-300">უკან</button>
                    <button
                      type="button"
                      onClick={nextFromStep2}
                      className="h-11 rounded-lg bg-[#0088FF] text-sm font-medium text-white transition-colors duration-150 hover:bg-[#006ACC]"
                    >
                      შემდეგი
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div>
                    {avatarPreview && (
                      <img src={avatarPreview} alt="Avatar preview" style={{ width: 100, height: 100, borderRadius: "50%", objectFit: "cover", marginBottom: 12 }} />
                    )}
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleAvatarUpload(file)
                      }}
                      disabled={avatarUploading}
                    />
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={avatarUploading}
                        className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-[#1B2B4B] transition hover:border-[#D4A843] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        პროფილის ფოტოს დამატება
                      </button>
                      <span className="text-sm text-slate-500">
                        {avatarUploading ? "იტვირთება..." : avatarPreview ? "ფოტო არჩეულია" : "ფაილი არჩეული არ არის"}
                      </span>
                    </div>
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
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={submitFreelancer}
                      className="h-11 rounded-lg bg-[#0088FF] text-sm font-medium text-white transition-colors duration-150 hover:bg-[#006ACC] disabled:opacity-60"
                    >
                      {submitting ? "იტვირთება..." : "პროფილის გამოქვეყნება"}
                    </button>
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
