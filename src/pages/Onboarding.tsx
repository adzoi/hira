import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { filterProfileLanguageOptions } from "../lib/profileLanguages.ts"
import {
  FREELANCER_EDUCATION_DEGREE_OPTIONS,
  type FreelancerEducationDegreeLevel,
} from "../lib/freelancerEducation.ts"
import { OptimizedImage } from "../components/OptimizedImage.tsx"
import OptionalSocialUrlField from "../components/OptionalSocialUrlField.tsx"
import CvImportPanel, { type CvImportField } from "../components/CvImportPanel.tsx"
import type { CvImportResult } from "../lib/cvImport.ts"
import { parseFreelancerSocialFields } from "../lib/freelancerSocialFields.ts"
import { avatarPublicUrl } from "../lib/storageImageUrl.ts"
import { validateAvatarUpload } from "../lib/uploadValidation.ts"
import { compressImageForUpload } from "../lib/compressImageForUpload.ts"
import { fetchOnboarding } from "../lib/queries/fetchOnboarding.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"
import { pickCategoryName } from "../lib/categoryLocale.ts"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { usePageMeta } from "../lib/usePageMeta.tsx"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { LIMITS, validateOptionalUrl, validateTextField } from "../lib/validation.ts"

/** Skills without a valid mid-level category_id (picker bucket). */
const SKILL_PICKER_UNCATEGORIZED = "__uncategorized__"

type SkillCategoryRow = { id: string; name_ka: string; name_en?: string | null; parent_id: string | null }

/** One-tap title suggestions; `category` is the mid-level category (name_en) whose skills are shown next. */
const TITLE_SUGGESTIONS = [
  { ka: "ვებ დეველოპერი", en: "Web developer", category: "Web Development" },
  { ka: "მობილური დეველოპერი", en: "Mobile developer", category: "Mobile Development" },
  { ka: "Backend დეველოპერი", en: "Backend developer", category: "Software Development" },
  { ka: "გრაფიკული დიზაინერი", en: "Graphic designer", category: "Graphic Design" },
  { ka: "UI/UX დიზაინერი", en: "UI/UX designer", category: "UI/UX Design" },
  { ka: "SMM მენეჯერი", en: "SMM manager", category: "Digital Marketing" },
  { ka: "ვიდეო მონტაჟორი", en: "Video editor", category: "Video Production" },
  { ka: "მოუშენ დიზაინერი", en: "Motion designer", category: "Animation" },
  { ka: "კოპირაიტერი", en: "Copywriter", category: "Writing" },
  { ka: "თარჯიმანი", en: "Translator", category: "Translation" },
] as const

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
  const { t, locale } = useTranslation()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [authReady, setAuthReady] = useState(false)

  const [userId, setUserId] = useState("")
  const [userType, setUserType] = useState<"freelancer" | "hirer" | "">("")

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [skills, setSkills] = useState<Array<{ id: string; name: string; category_id: string | null }>>([])
  const [skillCategories, setSkillCategories] = useState<SkillCategoryRow[]>([])
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
  const [facebookUrl, setFacebookUrl] = useState("")
  const [instagramUrl, setInstagramUrl] = useState("")
  const [tiktokUrl, setTiktokUrl] = useState("")
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [xUrl, setXUrl] = useState("")
  const [noFacebookProfile, setNoFacebookProfile] = useState(false)
  const [noInstagramProfile, setNoInstagramProfile] = useState(false)
  const [noTiktokProfile, setNoTiktokProfile] = useState(false)
  const [noYoutubeProfile, setNoYoutubeProfile] = useState(false)
  const [noXProfile, setNoXProfile] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string>("")
  const [avatarPreview, setAvatarPreview] = useState<string>("")
  const [avatarUploading, setAvatarUploading] = useState<boolean>(false)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const [freelancerProfileId, setFreelancerProfileId] = useState<string | null>(null)
  const [freelancerSlug, setFreelancerSlug] = useState<string | null>(null)
  const [experiences, setExperiences] = useState<ExperienceForm[]>([])
  const [educations, setEducations] = useState<EducationForm[]>([])
  /** Mid-level marketplace category id, or SKILL_PICKER_UNCATEGORIZED. */
  const [skillFocusCategoryId, setSkillFocusCategoryId] = useState("")

  const [companyName, setCompanyName] = useState("")
  const [companyDescription, setCompanyDescription] = useState("")
  const [industry, setIndustry] = useState("")
  const [companyWebsite, setCompanyWebsite] = useState("")

  const {
    data: onboardingData,
    isLoading: loading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.onboarding(userId),
    queryFn: () => fetchOnboarding(userId),
    enabled: authReady && Boolean(userId) && isSupabaseConfigured,
  })

  useEffect(() => {
    void (async () => {
      if (!isSupabaseConfigured || !supabase) {
        setError(t("auth.supabaseNotConfigured"))
        setAuthReady(true)
        return
      }
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        navigate("/login", { replace: true })
        return
      }
      setUserId(user.id)
      setAuthReady(true)
    })()
  }, [navigate])

  useEffect(() => {
    if (!onboardingData) return
    if (onboardingData.redirect) {
      navigate(onboardingData.redirect, { replace: true })
      return
    }
    setUserType(onboardingData.userType)
    setAvatarUrl(onboardingData.avatarUrl)
    setAvatarPreview(onboardingData.avatarUrl)
    setFreelancerProfileId(onboardingData.freelancerProfileId)
    setFreelancerSlug(onboardingData.freelancerSlug)
    setProfessionalTitle(onboardingData.professionalTitle)
    setBio(onboardingData.bio)
    setAvailability(onboardingData.availability)
    setLanguages(onboardingData.languages)
    setLinkedinUrl(onboardingData.linkedinUrl)
    setGithubUrl(onboardingData.githubUrl)
    setPortfolioUrl(onboardingData.portfolioUrl)
    setFacebookUrl(onboardingData.facebookUrl)
    setInstagramUrl(onboardingData.instagramUrl)
    setTiktokUrl(onboardingData.tiktokUrl)
    setYoutubeUrl(onboardingData.youtubeUrl)
    setXUrl(onboardingData.xUrl)
    setNoLinkedinProfile(onboardingData.noLinkedinProfile)
    setNoGithubProfile(onboardingData.noGithubProfile)
    setNoPortfolioWebsite(onboardingData.noPortfolioWebsite)
    setNoFacebookProfile(onboardingData.noFacebookProfile)
    setNoInstagramProfile(onboardingData.noInstagramProfile)
    setNoTiktokProfile(onboardingData.noTiktokProfile)
    setNoYoutubeProfile(onboardingData.noYoutubeProfile)
    setNoXProfile(onboardingData.noXProfile)
    setSkills(onboardingData.skills)
    setSkillCategories(onboardingData.skillCategories)
    setSelectedSkillIds(onboardingData.selectedSkillIds)
    setExperiences(onboardingData.experiences)
    setEducations(onboardingData.educations)
    setCompanyName(onboardingData.companyName)
    setCompanyDescription(onboardingData.companyDescription)
    setIndustry(onboardingData.industry)
    setCompanyWebsite(onboardingData.companyWebsite)
  }, [navigate, onboardingData])

  useEffect(() => {
    if (isError) {
      setError(queryErrorMessage(queryError, t("onboarding.loadFailed")))
    }
  }, [isError, queryError])

  const filteredLanguageOptions = useMemo(() => filterProfileLanguageOptions(languageQuery), [languageQuery])

  const skillPickerMidCategories = useMemo(
    () =>
      skillCategories
        .filter((c) => Boolean(c.parent_id))
        .sort((a, b) => a.name_ka.localeCompare(b.name_ka, "ka")),
    [skillCategories],
  )

  const skillsByCategoryId = useMemo(() => {
    const known = new Set(skillCategories.map((c) => c.id))
    const m = new Map<string, Array<{ id: string; name: string }>>()
    for (const sk of skills) {
      const cid = sk.category_id && known.has(sk.category_id) ? sk.category_id : SKILL_PICKER_UNCATEGORIZED
      const list = m.get(cid) ?? []
      list.push({ id: sk.id, name: sk.name })
      m.set(cid, list)
    }
    for (const [, list] of m) list.sort((a, b) => a.name.localeCompare(b.name))
    return m
  }, [skills, skillCategories])

  const uncategorizedSkillCount = skillsByCategoryId.get(SKILL_PICKER_UNCATEGORIZED)?.length ?? 0

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

    const uploadCheck = validateAvatarUpload(file)
    if (uploadCheck.ok === false) {
      setError(uploadCheck.message)
      return
    }

    setAvatarUploading(true)
    setError("")
    try {
      const compressed = await compressImageForUpload(file, "avatar")
      const filePath = `${user.id}/avatar.webp`
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, compressed, {
        upsert: true,
        contentType: "image/webp",
      })
      if (uploadError) throw uploadError
      setAvatarUrl(avatarPublicUrl(supabase, filePath))
      setAvatarPreview(URL.createObjectURL(compressed))
    } catch (err: any) {
      setError(`ავატარის ატვირთვა ვერ მოხერხდა: ${err.message}`)
    } finally {
      setAvatarUploading(false)
    }
  }

  const pickTitleSuggestion = (suggestion: (typeof TITLE_SUGGESTIONS)[number]) => {
    setProfessionalTitle(locale === "en" ? suggestion.en : suggestion.ka)
    const category = skillCategories.find((c) => c.parent_id && c.name_en === suggestion.category)
    if (category) setSkillFocusCategoryId(category.id)
    setError("")
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

  /** Fills the onboarding form from a parsed CV; lists are merged, text fields replaced. */
  const applyCvImport = (cv: CvImportResult, fields: Set<CvImportField>) => {
    if (fields.has("title") && cv.title) setProfessionalTitle(cv.title)
    if (fields.has("bio") && cv.bio) setBio(cv.bio)
    if (fields.has("skills")) setSelectedSkillIds((prev) => Array.from(new Set([...prev, ...cv.skillIds])))
    if (fields.has("languages")) setLanguages((prev) => Array.from(new Set([...prev, ...cv.languages])))
    if (fields.has("links")) {
      const l = cv.links
      if (l.linkedin) { setLinkedinUrl(l.linkedin); setNoLinkedinProfile(false) }
      if (l.github) { setGithubUrl(l.github); setNoGithubProfile(false) }
      if (l.portfolio) { setPortfolioUrl(l.portfolio); setNoPortfolioWebsite(false) }
      if (l.facebook) { setFacebookUrl(l.facebook); setNoFacebookProfile(false) }
      if (l.instagram) { setInstagramUrl(l.instagram); setNoInstagramProfile(false) }
      if (l.tiktok) { setTiktokUrl(l.tiktok); setNoTiktokProfile(false) }
      if (l.youtube) { setYoutubeUrl(l.youtube); setNoYoutubeProfile(false) }
      if (l.x) { setXUrl(l.x); setNoXProfile(false) }
    }
    if (fields.has("experience") && cv.experiences.length) {
      setExperiences((prev) =>
        [
          ...prev.filter((e) => e.title.trim() || e.organization.trim()),
          ...cv.experiences.map((e) => ({
            title: e.title,
            organization: e.organization,
            start_date: e.startDate,
            end_date: e.isPresent ? "" : e.endDate,
            is_present: e.isPresent,
            description: e.description,
          })),
        ].slice(0, 10),
      )
    }
    if (fields.has("education") && cv.educations.length) {
      setEducations((prev) =>
        [
          ...prev.filter((e) => e.institution.trim()),
          ...cv.educations.map((e) => ({
            institution: e.institution,
            degree_level: e.degreeLevel,
            field_of_study: e.fieldOfStudy,
            end_date: e.endDate,
          })),
        ].slice(0, 10),
      )
    }
    setError("")
  }

  /** Only the title is required; skills are suggested on the same screen, everything else is optional later. */
  const validateMinimumProfile = () => {
    if (!professionalTitle.trim()) {
      setError("პროფესიული სათაური სავალდებულოა.")
      return false
    }
    setError("")
    return true
  }

  const nextFromStep1 = () => {
    if (validateMinimumProfile()) setStep(2)
  }

  const finishEarly = () => {
    if (validateMinimumProfile()) void submitFreelancer()
  }

  const nextFromStep2 = () => {
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
      const parsedSocial = parseFreelancerSocialFields({
        linkedinUrl,
        githubUrl,
        portfolioUrl,
        facebookUrl,
        instagramUrl,
        tiktokUrl,
        youtubeUrl,
        xUrl,
        noLinkedinProfile,
        noGithubProfile,
        noPortfolioWebsite,
        noFacebookProfile,
        noInstagramProfile,
        noTiktokProfile,
        noYoutubeProfile,
        noXProfile,
      })
      if (parsedSocial.ok === false) throw new Error(parsedSocial.message)

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
            bio: bio.trim() || null,
            availability: availability || null,
            languages,
            ...parsedSocial.values,
            is_profile_complete: true,
            is_public: true,
          },
          { onConflict: "user_id" },
        )
        .select("id")
        .single()
      if (fpError || !fp) throw fpError ?? new Error("ფრილანსერის პროფილი ვერ შეინახა.")

      await supabase.from("freelancer_skills").delete().eq("freelancer_profile_id", fp.id)
      if (selectedSkillIds.length > 0) {
        const { error: skillsError } = await supabase.from("freelancer_skills").insert(
          selectedSkillIds.map((skill_id) => ({ freelancer_profile_id: fp.id, skill_id })),
        )
        if (skillsError) throw skillsError
      }

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

      navigate("/dashboard?welcome=1")
    } catch (err) {
      setError(err instanceof Error ? err.message : t("onboarding.saveFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  const submitHirer = async () => {
    if (!supabase) return

    const companyNameResult = validateTextField(companyName, {
      min: 1,
      max: 120,
      label: "კომპანიის ან შენი სახელი",
    })
    if (companyNameResult.ok === false) return setError(companyNameResult.message)

    // Description and industry are optional at signup; the dashboard nudges for them later.
    const companyDescriptionResult = companyDescription.trim()
      ? validateTextField(companyDescription, {
          min: 1,
          max: LIMITS.companyDescription,
          label: "აღწერა",
        })
      : ({ ok: true, value: null } as const)
    if (companyDescriptionResult.ok === false) return setError(companyDescriptionResult.message)

    const websiteResult = validateOptionalUrl(companyWebsite)
    if (websiteResult.ok === false) return setError(websiteResult.message)

    setSubmitting(true)
    setError("")
    try {
      const { error: hpError } = await supabase.from("hirer_profiles").upsert(
        {
          user_id: userId,
          company_name: companyNameResult.value,
          description: companyDescriptionResult.value,
          industry: industry || null,
          website_url: websiteResult.value,
        },
        { onConflict: "user_id" },
      )
      if (hpError) throw hpError
      navigate("/dashboard?welcome=1")
    } catch (err) {
      setError(err instanceof Error ? err.message : t("onboarding.saveFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !authReady || onboardingData?.redirect) {
    return (
      <>
        {usePageMeta(t("onboarding.title"), t("onboarding.metaDescription"))}
        <div className="min-h-screen bg-slate-50">
          <div className="mx-auto flex max-w-3xl items-center justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-[#D4A843]" />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {usePageMeta(t("onboarding.title"), t("onboarding.metaDescription"))}
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mx-auto max-w-[640px] rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-[#0088FF] sm:text-3xl">{t("onboarding.heading")}</h1>

          {userType === "hirer" ? (
            <div className="mt-6 space-y-4">
              <input className="h-11 w-full rounded-lg border border-slate-300 px-3" placeholder="კომპანიის ან შენი სახელი" value={companyName} onChange={(e)=>setCompanyName(e.target.value)} />
              <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2" rows={4} placeholder="კომპანიის აღწერა (არასავალდებულო)" value={companyDescription} onChange={(e)=>setCompanyDescription(e.target.value)} />
              <select className="h-11 w-full rounded-lg border border-slate-300 px-3" value={industry} onChange={(e)=>setIndustry(e.target.value)}>
                <option value="">ინდუსტრია (არასავალდებულო)</option>
                {industryOptions.map((opt)=><option key={opt} value={opt}>{opt}</option>)}
              </select>
              <input className="h-11 w-full rounded-lg border border-slate-300 px-3" placeholder="ვებსაიტი (არასავალდებულო)" value={companyWebsite} onChange={(e)=>setCompanyWebsite(e.target.value)} />
              {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
              <button disabled={submitting} onClick={submitHirer} className="h-11 w-full rounded-lg bg-[#1B2B4B] text-white hover:bg-[#D4A843] hover:text-[#1B2B4B]">{submitting ? t("common.loading") : t("onboarding.saveProfile")}</button>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {step > 1 ? (
                <>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div
                      className={`h-2 rounded-full bg-[#D4A843] transition-[width] duration-300 ${step === 2 ? "w-1/2" : "w-full"}`}
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    {t("onboarding.detailsHeading")} · {t("common.stepOf", { step: step - 1, total: 2 })}
                  </p>
                </>
              ) : null}

              {step === 1 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-xl font-semibold text-[#1B2B4B]">{t("onboarding.quickHeading")}</h2>
                    <p className="mt-1 text-sm text-slate-500">{t("onboarding.quickSubheading")}</p>
                  </div>

                  <div>
                    <label htmlFor="onboarding-title" className="mb-1 block text-sm font-medium text-slate-700">
                      {t("onboarding.titleLabel")}
                    </label>
                    <input
                      id="onboarding-title"
                      className="h-11 w-full rounded-lg border border-slate-300 px-3"
                      placeholder={t("onboarding.titlePlaceholder")}
                      value={professionalTitle}
                      onChange={(e) => setProfessionalTitle(e.target.value)}
                    />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {TITLE_SUGGESTIONS.map((suggestion) => {
                        const label = locale === "en" ? suggestion.en : suggestion.ka
                        const active = professionalTitle.trim() === label
                        return (
                          <button
                            key={suggestion.en}
                            type="button"
                            onClick={() => pickTitleSuggestion(suggestion)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                              active
                                ? "border-[#0088FF] bg-[#E8F4FF] text-[#0088FF]"
                                : "border-slate-300 bg-white text-slate-700 hover:border-[#0088FF] hover:text-[#0088FF]"
                            }`}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="onboarding-skill-category" className="block text-sm font-medium text-slate-700">
                      {t("onboarding.skillsLabel")}
                    </label>
                    <select
                      id="onboarding-skill-category"
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#0088FF] focus:ring-2 focus:ring-[#0088FF]/25"
                      value={skillFocusCategoryId}
                      onChange={(e) => setSkillFocusCategoryId(e.target.value)}
                    >
                      <option value="">{t("onboarding.skillsPickCategory")}</option>
                      {skillPickerMidCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {pickCategoryName(c, locale)}
                        </option>
                      ))}
                      {uncategorizedSkillCount > 0 ? <option value={SKILL_PICKER_UNCATEGORIZED}>სხვა</option> : null}
                    </select>
                    {skillFocusCategoryId ? (
                      (skillsByCategoryId.get(skillFocusCategoryId) ?? []).length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {(skillsByCategoryId.get(skillFocusCategoryId) ?? []).map((s) => {
                            const selected = selectedSkillIds.includes(s.id)
                            return (
                              <button
                                key={s.id}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => toggleSkill(s.id)}
                                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                                  selected
                                    ? "border-[#0088FF] bg-[#0088FF] text-white"
                                    : "border-slate-300 bg-white text-slate-700 hover:border-[#0088FF] hover:text-[#0088FF]"
                                }`}
                              >
                                {selected ? "✓ " : "+ "}
                                {s.name}
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">{t("onboarding.skillsNoneInCategory")}</p>
                      )
                    ) : null}
                    {selectedSkillIds.length > 0 ? (
                      <p className="text-xs text-slate-500">
                        {t("onboarding.skillsSelected", { count: selectedSkillIds.length })}:{" "}
                        {selectedSkillIds.map((id) => skillNameById.get(id) ?? id).join(", ")}
                      </p>
                    ) : null}
                  </div>

                  {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={finishEarly}
                    className="h-11 w-full rounded-lg bg-[#0088FF] text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#006ACC] disabled:opacity-60"
                  >
                    {submitting ? t("common.loading") : t("onboarding.finishQuick")}
                  </button>
                  <button
                    type="button"
                    onClick={nextFromStep1}
                    className="w-full text-center text-sm font-medium text-slate-500 hover:text-[#0088FF]"
                  >
                    {t("onboarding.addMoreDetails")}
                  </button>

                  <div className="border-t border-slate-100 pt-4">
                    <CvImportPanel skillCatalog={skills} onApply={applyCvImport} />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    {avatarPreview && (
                      <OptimizedImage
                        src={avatarPreview}
                        alt="Avatar preview"
                        width={100}
                        height={100}
                        className="mb-3 h-[100px] w-[100px] rounded-full object-cover"
                      />
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
                    <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2" rows={5} placeholder="ბიო (არასავალდებულო)" value={bio} onChange={(e)=>setBio(e.target.value)} />
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
                    <p className="mb-1 text-xs font-medium text-slate-600">{t("onboarding.languagesMin")}</p>
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
                      placeholder={t("common.search")}
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#0088FF]/30 focus:border-[#0088FF] focus:ring-2"
                      autoComplete="off"
                    />
                    {languageMenuOpen ? (
                      <ul
                        role="listbox"
                        className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                      >
                        {filteredLanguageOptions.length === 0 ? (
                          <li className="px-3 py-2 text-sm text-slate-500">{t("onboarding.languageNotFound")}</li>
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
                  <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-semibold text-[#1B2B4B]">{t("onboarding.experienceMax")}</p>
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
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={finishEarly}
                    className="w-full text-center text-sm font-medium text-slate-500 hover:text-[#0088FF] disabled:opacity-50"
                  >
                    {submitting ? t("common.loading") : t("onboarding.finishLater")}
                  </button>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <OptionalSocialUrlField
                    label="LinkedIn"
                    noLabel="არ მაქვს LinkedIn პროფილი"
                    placeholder="https://www.linkedin.com/in/..."
                    value={linkedinUrl}
                    onChange={setLinkedinUrl}
                    disabled={noLinkedinProfile}
                    onDisabledChange={setNoLinkedinProfile}
                    hint={noLinkedinProfile ? "ლინკი არ შეინახება." : "დატოვე ცარიელი ან მიუთითე linkedin.com ბმული."}
                  />
                  <OptionalSocialUrlField
                    label="GitHub"
                    noLabel="არ მაქვს GitHub პროფილი"
                    placeholder="https://github.com/..."
                    value={githubUrl}
                    onChange={setGithubUrl}
                    disabled={noGithubProfile}
                    onDisabledChange={setNoGithubProfile}
                    hint={noGithubProfile ? "ლინკი არ შეინახება." : "დატოვე ცარიელი ან მიუთითე github.com ბმული."}
                  />
                  <OptionalSocialUrlField
                    label="Facebook"
                    noLabel="არ მაქვს Facebook პროფილი"
                    placeholder="https://www.facebook.com/..."
                    value={facebookUrl}
                    onChange={setFacebookUrl}
                    disabled={noFacebookProfile}
                    onDisabledChange={setNoFacebookProfile}
                    hint={noFacebookProfile ? "ლინკი არ შეინახება." : "დატოვე ცარიელი ან მიუთითე facebook.com ბმული."}
                  />
                  <OptionalSocialUrlField
                    label="Instagram"
                    noLabel="არ მაქვს Instagram პროფილი"
                    placeholder="https://www.instagram.com/..."
                    value={instagramUrl}
                    onChange={setInstagramUrl}
                    disabled={noInstagramProfile}
                    onDisabledChange={setNoInstagramProfile}
                    hint={noInstagramProfile ? "ლინკი არ შეინახება." : "დატოვე ცარიელი ან მიუთითე instagram.com ბმული."}
                  />
                  <OptionalSocialUrlField
                    label="TikTok"
                    noLabel="არ მაქვს TikTok პროფილი"
                    placeholder="https://www.tiktok.com/@..."
                    value={tiktokUrl}
                    onChange={setTiktokUrl}
                    disabled={noTiktokProfile}
                    onDisabledChange={setNoTiktokProfile}
                    hint={noTiktokProfile ? "ლინკი არ შეინახება." : "დატოვე ცარიელი ან მიუთითე tiktok.com ბმული."}
                  />
                  <OptionalSocialUrlField
                    label="YouTube"
                    noLabel="არ მაქვს YouTube არხი"
                    placeholder="https://www.youtube.com/@..."
                    value={youtubeUrl}
                    onChange={setYoutubeUrl}
                    disabled={noYoutubeProfile}
                    onDisabledChange={setNoYoutubeProfile}
                    hint={noYoutubeProfile ? "ლინკი არ შეინახება." : "დატოვე ცარიელი ან მიუთითე youtube.com ბმული."}
                  />
                  <OptionalSocialUrlField
                    label="X"
                    noLabel="არ მაქვს X პროფილი"
                    placeholder="https://x.com/..."
                    value={xUrl}
                    onChange={setXUrl}
                    disabled={noXProfile}
                    onDisabledChange={setNoXProfile}
                    hint={noXProfile ? "ლინკი არ შეინახება." : "დატოვე ცარიელი ან მიუთითე x.com ბმული."}
                  />
                  <OptionalSocialUrlField
                    label="პორტფოლიო"
                    noLabel="არ მაქვს პორტფოლიოს ვებსაიტი"
                    placeholder="https://..."
                    value={portfolioUrl}
                    onChange={setPortfolioUrl}
                    disabled={noPortfolioWebsite}
                    onDisabledChange={setNoPortfolioWebsite}
                    hint={noPortfolioWebsite ? "ლინკი არ შეინახება." : "დატოვე ცარიელი ან მიუთითე საიტის ბმული."}
                  />
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
    </>
  )
}
