import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import Navbar from "../components/Navbar"
import LocationFilterSelect from "../components/LocationFilterSelect.tsx"
import { PROFILE_LANGUAGE_OPTIONS } from "../lib/profileLanguages.ts"
import {
  FREELANCER_EDUCATION_DEGREE_OPTIONS,
  type FreelancerEducationDegreeLevel,
} from "../lib/freelancerEducation.ts"
import { stripLegacyPricePrefix } from "../lib/listingDescription.ts"
import { parseGitHubField, parseLinkedInField, parseOptionalWebUrl } from "../lib/socialUrls.ts"
import { avatarImageUrl, avatarPublicUrl } from "../lib/storageImageUrl.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase"

function formatSaveError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "object" && err !== null) {
    const o = err as { message?: string; details?: string; hint?: string }
    const parts = [o.message, o.details, o.hint].filter((x) => typeof x === "string" && x.trim())
    if (parts.length) return parts.join(" — ")
  }
  return "შენახვა ვერ მოხერხდა."
}

type ServiceListingForm = {
  id?: string
  title: string
  description: string
  price: string
  deliveryDays: string
  isActive: boolean
}

type ExperienceForm = {
  id?: string
  title: string
  organization: string
  startDate: string
  endDate: string
  isPresent: boolean
  description: string
}

type EducationForm = {
  id?: string
  institution: string
  degreeLevel: FreelancerEducationDegreeLevel | ""
  fieldOfStudy: string
  endDate: string
}

function stripListingMeta(raw: string | null) {
  if (!raw) return ""
  const prefix = "<!--gigori-meta:"
  const suffix = "-->"
  if (!raw.startsWith(prefix)) return stripLegacyPricePrefix(raw)
  const endIndex = raw.indexOf(suffix)
  if (endIndex < 0) return stripLegacyPricePrefix(raw)
  return stripLegacyPricePrefix(raw.slice(endIndex + suffix.length))
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [userId, setUserId] = useState("")
  const [userType, setUserType] = useState<"freelancer" | "hirer" | "">("")

  const [avatarUrl, setAvatarUrl] = useState("")
  const [avatarUploading, setAvatarUploading] = useState(false)

  const [fullName, setFullName] = useState("")
  const [city, setCity] = useState("")
  const [phone, setPhone] = useState("")

  const [professionalTitle, setProfessionalTitle] = useState("")
  const [bio, setBio] = useState("")
  const [availability, setAvailability] = useState("")
  const [languages, setLanguages] = useState<string[]>([])
  const [langDropdownOpen, setLangDropdownOpen] = useState(false)
  const langBoxRef = useRef<HTMLDivElement>(null)
  const [linkedinUrl, setLinkedinUrl] = useState("")
  const [githubUrl, setGithubUrl] = useState("")
  const [portfolioUrl, setPortfolioUrl] = useState("")
  /** ცარიელი URL-ის შემთხვევაში განიხილება როგორც „ლინკი არ გვაქვს“. */
  const [noLinkedinProfile, setNoLinkedinProfile] = useState(true)
  const [noGithubProfile, setNoGithubProfile] = useState(true)
  const [noPortfolioWebsite, setNoPortfolioWebsite] = useState(true)

  const [companyName, setCompanyName] = useState("")
  const [companyDescription, setCompanyDescription] = useState("")
  const [industry, setIndustry] = useState("")
  const [companyWebsite, setCompanyWebsite] = useState("")
  const [freelancerProfileId, setFreelancerProfileId] = useState<string | null>(null)
  const [serviceListings, setServiceListings] = useState<ServiceListingForm[]>([])
  const [initialServiceIds, setInitialServiceIds] = useState<string[]>([])
  const [skillsCatalog, setSkillsCatalog] = useState<Array<{ id: string; name: string; category_id: string | null }>>([])
  const [categoriesMap, setCategoriesMap] = useState<Record<string, string>>({})
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  /** Georgian category label key in groupedSkills (matches onboarding). */
  const [skillFocusCategory, setSkillFocusCategory] = useState("")
  const [experiences, setExperiences] = useState<ExperienceForm[]>([])
  const [educations, setEducations] = useState<EducationForm[]>([])

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteStep, setDeleteStep] = useState<1 | 2 | 3>(1)
  const [deletePassword, setDeletePassword] = useState("")
  const [deleteError, setDeleteError] = useState("")
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [accountEmail, setAccountEmail] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [emailBusy, setEmailBusy] = useState(false)
  const [currentPasswordPw, setCurrentPasswordPw] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmNewPassword, setConfirmNewPassword] = useState("")
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [accountMessage, setAccountMessage] = useState("")
  const [accountErr, setAccountErr] = useState("")
  const [emailAccordionOpen, setEmailAccordionOpen] = useState(false)
  const [passwordAccordionOpen, setPasswordAccordionOpen] = useState(false)

  const groupedSkills = useMemo(
    () =>
      skillsCatalog.reduce<Record<string, Array<{ id: string; name: string }>>>((acc, skill) => {
        const key = skill.category_id ? categoriesMap[skill.category_id] ?? "სხვა" : "სხვა"
        if (!acc[key]) acc[key] = []
        acc[key].push({ id: skill.id, name: skill.name })
        return acc
      }, {}),
    [skillsCatalog, categoriesMap],
  )

  const skillNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of skillsCatalog) m.set(s.id, s.name)
    return m
  }, [skillsCatalog])

  useEffect(() => {
    document.title = "პროფილი — გიგორი"
  }, [])


  useEffect(() => {
    if (!langDropdownOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (langBoxRef.current && !langBoxRef.current.contains(event.target as Node)) {
        setLangDropdownOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [langDropdownOpen])

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
        } = await supabase.auth.getUser()
        if (!user) throw new Error("მომხმარებელი ვერ მოიძებნა.")
        setUserId(user.id)
        setAccountEmail(user.email ?? "")

        const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single()
        if (!profile) throw new Error("პროფილი ვერ ჩაიტვირთა.")
        setUserType(profile.user_type as "freelancer" | "hirer")
        setFullName(profile.full_name ?? "")
        setCity(profile.city ?? "")
        setPhone(profile.phone ?? "")
        setAvatarUrl(profile.avatar_url ?? "")

        if (profile.user_type === "freelancer") {
          const { data: fp } = await supabase.from("freelancer_profiles").select("*").eq("user_id", user.id).maybeSingle()
          if (fp) {
            setFreelancerProfileId(fp.id)
            setProfessionalTitle(fp.professional_title ?? "")
            const loadedBio = fp.bio ?? ""
            setBio(
              loadedBio.trim() === "ბიო უნდა შეიცავდეს მინიმუმ 50 სიმბოლოს"
                ? ""
                : loadedBio,
            )
            setAvailability(fp.availability ?? "")
            setLanguages(Array.isArray(fp.languages) ? fp.languages : [])
            const loadedLi = (fp.linkedin_url ?? "").trim()
            const loadedGh = (fp.github_url ?? "").trim()
            const loadedPf = (fp.portfolio_url ?? "").trim()
            setLinkedinUrl(fp.linkedin_url ?? "")
            setGithubUrl(fp.github_url ?? "")
            setPortfolioUrl(fp.portfolio_url ?? "")
            setNoLinkedinProfile(!loadedLi)
            setNoGithubProfile(!loadedGh)
            setNoPortfolioWebsite(!loadedPf)

            const { data: serviceRows, error: servicesError } = await supabase
              .from("services")
              .select("id,title,description,price,delivery_days,is_active")
              .eq("freelancer_profile_id", fp.id)
              .order("created_at", { ascending: false })
            if (servicesError) throw servicesError

            const mappedServices = (serviceRows ?? []).map((item) => ({
              id: item.id,
              title: item.title ?? "",
              description: stripListingMeta(item.description ?? ""),
              price: item.price !== null && item.price !== undefined ? String(item.price) : "",
              deliveryDays: item.delivery_days ? String(item.delivery_days) : "3",
              isActive: item.is_active ?? true,
            }))

            setServiceListings(mappedServices.slice(0, 3))
            setInitialServiceIds(mappedServices.map((item) => item.id).filter(Boolean))

            const { data: expRows, error: expError } = await supabase
              .from("experience")
              .select("id,title,organization,start_date,end_date,description")
              .eq("freelancer_profile_id", fp.id)
              .order("start_date", { ascending: false })
            if (expError) throw expError
            setExperiences(
              (expRows ?? []).slice(0, 10).map((item) => ({
                id: item.id,
                title: item.title ?? "",
                organization: item.organization ?? "",
                startDate: item.start_date ?? "",
                endDate: item.end_date ?? "",
                isPresent: !item.end_date,
                description: item.description ?? "",
              })),
            )

            const { data: eduRows, error: eduRowsError } = await supabase
              .from("freelancer_education")
              .select("id,institution,degree_level,field_of_study,end_date")
              .eq("freelancer_profile_id", fp.id)
              .order("end_date", { ascending: false })
            if (eduRowsError) throw eduRowsError
            setEducations(
              (eduRows ?? []).slice(0, 10).map((item) => ({
                id: item.id,
                institution: item.institution ?? "",
                degreeLevel: (item.degree_level as FreelancerEducationDegreeLevel) ?? "",
                fieldOfStudy: item.field_of_study ?? "",
                endDate: item.end_date ?? "",
              })),
            )

            const [{ data: skillRows, error: skillRowsError }, { data: allSkillsRows, error: allSkillsError }, { data: categoriesData }] =
              await Promise.all([
                supabase.from("freelancer_skills").select("skill_id").eq("freelancer_profile_id", fp.id),
                supabase.from("skills").select("id,name,category_id").eq("is_approved", true).order("name"),
                supabase.from("categories").select("id,name_ka"),
              ])
            if (skillRowsError) throw skillRowsError
            if (allSkillsError) throw allSkillsError

            setSelectedSkillIds((skillRows ?? []).map((row) => row.skill_id).filter(Boolean))
            setSkillsCatalog((allSkillsRows ?? []) as Array<{ id: string; name: string; category_id: string | null }>)
            const map: Record<string, string> = {}
            for (const c of categoriesData ?? []) map[c.id] = c.name_ka
            setCategoriesMap(map)
          } else {
            setServiceListings([])
            setInitialServiceIds([])
            setSelectedSkillIds([])
            setSkillsCatalog([])
            setCategoriesMap({})
            setExperiences([])
            setEducations([])
          }
        } else {
          const { data: hp } = await supabase.from("hirer_profiles").select("*").eq("user_id", user.id).maybeSingle()
          if (hp) {
            setCompanyName(hp.company_name ?? "")
            setCompanyDescription(hp.description ?? "")
            setIndustry(hp.industry ?? "")
            setCompanyWebsite(hp.website_url ?? "")
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "პროფილი ვერ ჩაიტვირთა.")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleAvatarUpload = async (file: File) => {
    if (!file || !supabase) return
    const user = (await supabase.auth.getUser()).data.user
    if (!user) return
    if (file.size > 5 * 1024 * 1024) return setError("სურათის ზომა არ უნდა აღემატებოდეს 5MB-ს.")
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return setError("მხოლოდ JPEG, PNG ან WebP ფორმატები დაიშვება.")
    }
    setAvatarUploading(true)
    setError("")
    try {
      const ext = file.name.split(".").pop()
      const path = `${user.id}/avatar.${ext}`
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      setAvatarUrl(avatarPublicUrl(supabase, path))
    } catch (err: any) {
      setError(`ავატარის ატვირთვა ვერ მოხერხდა: ${err.message}`)
    } finally {
      setAvatarUploading(false)
    }
  }

  const handleDeleteAvatar = async () => {
    if (!supabase) return
    const user = (await supabase.auth.getUser()).data.user
    if (!user) return
    setError("")
    try {
      await supabase.storage.from("avatars").remove([
        `${user.id}/avatar`,
        `${user.id}/avatar.jpg`,
        `${user.id}/avatar.jpeg`,
        `${user.id}/avatar.png`,
        `${user.id}/avatar.webp`,
      ])
      await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id)
      setAvatarUrl("")
    } catch (err: any) {
      setError(`სურათის წაშლა ვერ მოხერხდა: ${err.message}`)
    }
  }

  const onSave = async () => {
    if (!supabase) return
    setSaving(true)
    setError("")
    setSuccess("")
    try {
      await supabase.from("profiles").update({
        full_name: fullName.trim(),
        city: city.trim() || null,
        phone: phone.trim() || null,
        avatar_url: avatarUrl || null,
      }).eq("id", userId)

      if (userType === "freelancer") {
        const parsedLi = parseLinkedInField(noLinkedinProfile ? "" : linkedinUrl)
        if (parsedLi.ok === false) {
          throw new Error(parsedLi.message)
        }
        const parsedGh = parseGitHubField(noGithubProfile ? "" : githubUrl)
        if (parsedGh.ok === false) {
          throw new Error(parsedGh.message)
        }
        const parsedPf = parseOptionalWebUrl(noPortfolioWebsite ? "" : portfolioUrl)
        if (parsedPf.ok === false) {
          throw new Error(parsedPf.message)
        }

        const { data: existingFp, error: existingFpErr } = await supabase
          .from("freelancer_profiles")
          .select("id,slug,is_public,is_profile_complete")
          .eq("user_id", userId)
          .maybeSingle()
        if (existingFpErr) throw existingFpErr

        const slug =
          existingFp?.slug?.trim() ||
          `freelancer-${userId.replace(/-/g, "").slice(0, 12)}-${Date.now().toString(36).slice(-5)}`

        const { data: savedFreelancer, error: freelancerError } = await supabase
          .from("freelancer_profiles")
          .upsert(
            {
              ...(existingFp?.id ? { id: existingFp.id } : {}),
              user_id: userId,
              slug,
              professional_title: professionalTitle.trim() || null,
              bio: bio.trim() || null,
              availability: availability || null,
              languages,
              linkedin_url: parsedLi.value,
              github_url: parsedGh.value,
              portfolio_url: parsedPf.value,
              is_public: existingFp?.is_public ?? true,
              is_profile_complete: existingFp?.is_profile_complete ?? true,
            },
            { onConflict: "user_id" },
          )
          .select("id")
          .single()

        if (freelancerError) throw freelancerError

        const targetFreelancerId = savedFreelancer?.id ?? freelancerProfileId
        if (!targetFreelancerId) {
          throw new Error("ფრილანსერის პროფილი ვერ მოიძებნა.")
        }
        setFreelancerProfileId(targetFreelancerId)

        const uniqueSkillIds = Array.from(new Set(selectedSkillIds.filter(Boolean)))

        await supabase.from("freelancer_skills").delete().eq("freelancer_profile_id", targetFreelancerId)

        if (uniqueSkillIds.length > 0) {
          const { error: insertFreelancerSkillsError } = await supabase.from("freelancer_skills").insert(
            uniqueSkillIds.map((skill_id) => ({
              freelancer_profile_id: targetFreelancerId,
              skill_id,
            })),
          )
          if (insertFreelancerSkillsError) throw insertFreelancerSkillsError
        }

        const nonEmptyListings = serviceListings
          .map((item) => ({
            id: item.id,
            title: item.title.trim(),
            description: item.description.trim(),
            priceRaw: item.price.trim(),
            deliveryDaysRaw: item.deliveryDays.trim(),
            isActive: item.isActive,
          }))
          .filter((item) => item.title || item.description || item.priceRaw || item.deliveryDaysRaw)

        if (nonEmptyListings.length > 3) {
          throw new Error("მაქსიმუმ 3 ლისტინგის დამატება შეგიძლია.")
        }

        const normalizedListings = nonEmptyListings.map((item, index) => {
          if (!item.title) {
            throw new Error(`ლისტინგი #${index + 1}: სათაური სავალდებულოა.`)
          }

          const parsedPrice = item.priceRaw ? Number(item.priceRaw) : 0
          if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
            throw new Error(`ლისტინგი #${index + 1}: ფასი არასწორია.`)
          }

          const parsedDeliveryDays = Number(item.deliveryDaysRaw || "0")
          if (!Number.isInteger(parsedDeliveryDays) || parsedDeliveryDays <= 0) {
            throw new Error(`ლისტინგი #${index + 1}: ვადა უნდა იყოს დადებითი მთელი რიცხვი.`)
          }

          return {
            id: item.id,
            title: item.title,
            description: item.description || null,
            price: parsedPrice,
            delivery_days: parsedDeliveryDays,
            is_active: item.isActive,
          }
        })

        const currentListingIds = normalizedListings.map((item) => item.id).filter(Boolean) as string[]
        const idsToDelete = initialServiceIds.filter((id) => !currentListingIds.includes(id))

        if (idsToDelete.length > 0) {
          const { error: deleteServicesError } = await supabase
            .from("services")
            .delete()
            .eq("freelancer_profile_id", targetFreelancerId)
            .in("id", idsToDelete)
          if (deleteServicesError) throw deleteServicesError
        }

        const savedListingIds: string[] = []
        for (const listing of normalizedListings) {
          if (listing.id) {
            const { error: updateServiceError } = await supabase
              .from("services")
              .update({
                title: listing.title,
                description: listing.description,
                price: listing.price,
                delivery_days: listing.delivery_days,
                is_active: listing.is_active,
              })
              .eq("id", listing.id)
              .eq("freelancer_profile_id", targetFreelancerId)
            if (updateServiceError) throw updateServiceError
            savedListingIds.push(listing.id)
          } else {
            const { data: insertedService, error: insertServiceError } = await supabase
              .from("services")
              .insert({
                freelancer_profile_id: targetFreelancerId,
                title: listing.title,
                description: listing.description,
                price: listing.price,
                delivery_days: listing.delivery_days,
                is_active: listing.is_active,
              })
              .select("id")
              .single()
            if (insertServiceError) throw insertServiceError
            savedListingIds.push(insertedService.id)
          }
        }

        const { data: refreshedServices, error: refreshServicesError } = await supabase
          .from("services")
          .select("id,title,description,price,delivery_days,is_active")
          .eq("freelancer_profile_id", targetFreelancerId)
          .order("created_at", { ascending: false })
        if (refreshServicesError) throw refreshServicesError

        const mappedRefreshed = (refreshedServices ?? []).map((item) => ({
          id: item.id,
          title: item.title ?? "",
          description: item.description ?? "",
          price: item.price !== null && item.price !== undefined ? String(item.price) : "",
          deliveryDays: item.delivery_days ? String(item.delivery_days) : "3",
          isActive: item.is_active ?? true,
        }))
        setServiceListings(mappedRefreshed.slice(0, 3))
        setInitialServiceIds(savedListingIds)

        const normalizedExperience = experiences
          .map((item) => ({
            title: item.title.trim(),
            organization: item.organization.trim(),
            startDate: item.startDate.trim(),
            endDate: item.isPresent ? "" : item.endDate.trim(),
            isPresent: item.isPresent,
            description: item.description.trim(),
          }))
          .filter((item) => item.title || item.organization || item.startDate || item.endDate || item.description)

        if (normalizedExperience.length > 10) {
          throw new Error("გამოცდილების მაქსიმუმ 10 ჩანაწერი შეგიძლია დაამატო.")
        }

        for (let i = 0; i < normalizedExperience.length; i += 1) {
          const item = normalizedExperience[i]
          if (!item.title) throw new Error(`გამოცდილება #${i + 1}: პოზიცია/სახელი სავალდებულოა.`)
          if (!item.organization) throw new Error(`გამოცდილება #${i + 1}: სამუშაო ადგილი სავალდებულოა.`)
          if (!item.startDate) throw new Error(`გამოცდილება #${i + 1}: დაწყების თარიღი სავალდებულოა.`)
          if (!item.isPresent && !item.endDate) {
            throw new Error(`გამოცდილება #${i + 1}: დასრულების თარიღი ან „მიმდინარე“ სავალდებულოა.`)
          }
          if (!item.isPresent && item.endDate && new Date(item.endDate).getTime() < new Date(item.startDate).getTime()) {
            throw new Error(`გამოცდილება #${i + 1}: დასრულების თარიღი დაწყებაზე ადრე ვერ იქნება.`)
          }
        }

        await supabase.from("experience").delete().eq("freelancer_profile_id", targetFreelancerId)
        if (normalizedExperience.length > 0) {
          const { error: expErr } = await supabase.from("experience").insert(
            normalizedExperience.slice(0, 10).map((item) => ({
              freelancer_profile_id: targetFreelancerId,
              title: item.title,
              organization: item.organization,
              start_date: item.startDate,
              end_date: item.isPresent ? null : item.endDate || null,
              description: item.description || null,
              type: "work",
            })),
          )
          if (expErr) throw expErr
        }

        const normalizedEducation = educations
          .map((item) => ({
            institution: item.institution.trim(),
            degreeLevel: item.degreeLevel.trim(),
            fieldOfStudy: item.fieldOfStudy.trim(),
            endDate: item.endDate.trim(),
          }))
          .filter((item) => item.institution || item.degreeLevel || item.fieldOfStudy || item.endDate)

        if (normalizedEducation.length > 10) {
          throw new Error("განათლების მაქსიმუმ 10 ჩანაწერი შეგიძლია დაამატო.")
        }
        for (let i = 0; i < normalizedEducation.length; i += 1) {
          const item = normalizedEducation[i]
          if (!item.institution) throw new Error(`განათლება #${i + 1}: სასწავლებელი სავალდებულოა.`)
          if (!item.degreeLevel) throw new Error(`განათლება #${i + 1}: საფეხური სავალდებულოა.`)
          if (!item.fieldOfStudy) throw new Error(`განათლება #${i + 1}: სპეციალობა/მიმართულება სავალდებულოა.`)
          if (!item.endDate) throw new Error(`განათლება #${i + 1}: დასრულების თარიღი სავალდებულოა.`)
        }

        await supabase.from("freelancer_education").delete().eq("freelancer_profile_id", targetFreelancerId)
        if (normalizedEducation.length > 0) {
          const { error: eduErr } = await supabase.from("freelancer_education").insert(
            normalizedEducation.slice(0, 10).map((item) => ({
              freelancer_profile_id: targetFreelancerId,
              institution: item.institution,
              degree_level: item.degreeLevel,
              field_of_study: item.fieldOfStudy,
              end_date: item.endDate,
            })),
          )
          if (eduErr) throw eduErr
        }
      } else {
        await supabase.from("hirer_profiles").upsert({
          user_id: userId,
          company_name: companyName.trim() || null,
          description: companyDescription.trim() || null,
          industry: industry || null,
          website_url: companyWebsite.trim() || null,
        }, { onConflict: "user_id" })
      }
      setSuccess("ცვლილებები შენახულია.")
    } catch (err) {
      setError(formatSaveError(err))
    } finally {
      setSaving(false)
    }
  }

  const removeListing = (index: number) => {
    setServiceListings((prev) => prev.filter((_, i) => i !== index))
  }

  const updateListing = (index: number, patch: Partial<ServiceListingForm>) => {
    setServiceListings((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const toggleSkill = (id: string) =>
    setSelectedSkillIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))

  const updateExperience = (index: number, patch: Partial<ExperienceForm>) => {
    setExperiences((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const next = { ...item, ...patch }
        if (patch.isPresent === true) next.endDate = ""
        return next
      }),
    )
  }

  const removeExperience = (index: number) => {
    setExperiences((prev) => prev.filter((_, i) => i !== index))
  }

  const updateEducation = (index: number, patch: Partial<EducationForm>) => {
    setEducations((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const removeEducation = (index: number) => {
    setEducations((prev) => prev.filter((_, i) => i !== index))
  }

  const handleDeleteAccount = async () => {
    if (!supabase || !deletePassword.trim()) return
    const client = supabase
    setDeleteLoading(true)
    setDeleteError("")
    try {
      const {
        data: { user },
      } = await client.auth.getUser()
      if (!user) return

      const { error: signInError } = await client.auth.signInWithPassword({
        email: user.email!,
        password: deletePassword,
      })
      if (signInError) {
        setDeleteError("პაროლი არასწორია. სცადე თავიდან.")
        return
      }

      const { data: fp } = await client
        .from("freelancer_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle()
      const freelancerId = fp?.id ?? freelancerProfileId

      if (freelancerId) {
        await client.from("experience").delete().eq("freelancer_profile_id", freelancerId)
        await client.from("freelancer_education").delete().eq("freelancer_profile_id", freelancerId)
        await client.from("freelancer_skills").delete().eq("freelancer_profile_id", freelancerId)
        await client.from("services").delete().eq("freelancer_profile_id", freelancerId)
      }
      await client.from("freelancer_profiles").delete().eq("user_id", user.id)
      await client.from("hirer_profiles").delete().eq("user_id", user.id)
      await client.from("notifications").delete().eq("user_id", user.id)

      await client.storage.from("avatars").remove([
        `${user.id}/avatar`,
        `${user.id}/avatar.jpg`,
        `${user.id}/avatar.jpeg`,
        `${user.id}/avatar.png`,
        `${user.id}/avatar.webp`,
      ])
      await client.storage.from("cvs").remove([`${user.id}/cv.pdf`])

      await client.from("profiles").delete().eq("id", user.id)

      const { error: deleteErrorRpc } = await client.rpc("delete_user")
      if (deleteErrorRpc) throw deleteErrorRpc

      setDeleteStep(3)
      window.setTimeout(async () => {
        await client.auth.signOut()
        navigate("/")
      }, 2000)
    } catch (err: any) {
      setDeleteError(`შეცდომა: ${err.message}`)
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleUpdateEmail = async () => {
    if (!supabase) return
    setAccountErr("")
    setAccountMessage("")
    const t = newEmail.trim()
    if (!t || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) {
      setAccountErr("გთხოვთ მიუთითოთ სწორი ელფოსტა.")
      return
    }
    if (t.toLowerCase() === accountEmail.trim().toLowerCase()) {
      setAccountErr("ახალი ელფოსტა უნდა განსხვავდებოდეს ახლანდელი მისამართისგან.")
      return
    }
    setEmailBusy(true)
    try {
      const { error: upErr } = await supabase.auth.updateUser({ email: t })
      if (upErr) throw upErr
      setAccountMessage("დასტური გაიგზავნა ახალ ელფოსტაზე. გახსენით ბმული და დაადასტურეთ ცვლილება.")
      setNewEmail("")
    } catch (err) {
      setAccountErr(formatSaveError(err))
    } finally {
      setEmailBusy(false)
    }
  }

  const handleUpdatePassword = async () => {
    if (!supabase) return
    setAccountErr("")
    setAccountMessage("")
    if (!currentPasswordPw || !newPassword) {
      setAccountErr("შეიყვანეთ ახლანდელი და ახალი პაროლი.")
      return
    }
    if (newPassword.length < 6) {
      setAccountErr("ახალი პაროლი უნდა იყოს მინიმუმ 6 სიმბოლო.")
      return
    }
    if (newPassword !== confirmNewPassword) {
      setAccountErr("ახალი პაროლის გამეორება არ ემთხვევა.")
      return
    }
    setPasswordBusy(true)
    try {
      const authEmail = accountEmail.trim()
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: currentPasswordPw,
      })
      if (signErr) {
        setAccountErr("ახლანდელი პაროლი არასწორია.")
        return
      }
      const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword })
      if (pwErr) throw pwErr
      setAccountMessage("პაროლი განახლდა.")
      setCurrentPasswordPw("")
      setNewPassword("")
      setConfirmNewPassword("")
    } catch (err) {
      setAccountErr(formatSaveError(err))
    } finally {
      setPasswordBusy(false)
    }
  }

  if (loading) return <div className="p-6">იტვირთება...</div>

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-start justify-between gap-4">
            <h1 className="text-3xl font-bold text-[#2563EB]">ჩემი პროფილი</h1>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(true)
                  setDeleteStep(1)
                  setDeletePassword("")
                  setDeleteError("")
                }}
                className="rounded-lg border border-[#EF4444] px-3 py-2 text-sm font-semibold text-[#EF4444]"
              >
                🗑 ანგარიშის წაშლა
              </button>
            </div>
          </div>

          <div className="mb-8 flex items-center gap-5">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarImageUrl(supabase, avatarUrl) ?? avatarUrl}
                  alt="პროფილის სურათი"
                  className="h-[100px] w-[100px] rounded-full object-cover"
                />
              ) : (
                <div className="flex h-[100px] w-[100px] items-center justify-center rounded-full bg-[#1B2B4B] text-[32px] font-semibold text-white">
                  {(fullName?.charAt(0) || "U").toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <input
                type="file"
                id="avatar-input"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleAvatarUpload(file)
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const element = document.getElementById("avatar-input") as HTMLInputElement | null
                  element?.click()
                }}
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#1D4ED8]"
              >
                {avatarUrl ? "📷 სურათის შეცვლა" : "📷 პროფილის სურათის ატვირთვა"}
              </button>
              {avatarUrl ? (
                <button
                  type="button"
                  onClick={handleDeleteAvatar}
                  className="rounded-lg border border-[#EF4444] px-4 py-2 text-sm text-[#EF4444]"
                >
                  🗑 სურათის წაშლა
                </button>
              ) : null}
              {avatarUploading ? <p className="text-[13px] text-[#6B7280]">იტვირთება...</p> : null}
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="mb-1 block text-base font-semibold text-gray-900">
                სახელი და გვარი <span className="text-[#EF4444]">*</span>
              </label>
              <input className="h-11 w-full rounded-lg border border-slate-300 px-3" value={fullName} onChange={(e)=>setFullName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-base font-semibold text-gray-900">ქალაქი / ლოკაცია</label>
              <LocationFilterSelect
                value={city}
                onChange={setCity}
                variant="form"
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
              />
              <p className="mt-1 text-xs text-slate-500">დისტანციური ან შერეული ფორმატიც შეგიძლიათ აირჩიოთ.</p>
            </div>
            <div>
              <label className="mb-1 block text-base font-semibold text-gray-900">ტელეფონის ნომერი</label>
              <input className="h-11 w-full rounded-lg border border-slate-300 px-3" value={phone} onChange={(e)=>setPhone(e.target.value)} />
            </div>
          </div>

          <section className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-6">
            <h2 className="text-lg font-semibold text-[#2563EB]">ელფოსტა და პაროლი</h2>
            <p className="mt-1 text-sm text-slate-600">
              ანგარიშის შესვლის ელფოსტასა და პაროლს ცვლი აქ. პროფილის დასამახსოვრებლად ქვემოთ ისევ დააჭირე „შენახვა“, თუ სხვა ველებიც შეცვლილი გაქვს.
            </p>
            <p className="mt-1 text-sm text-[#1B2B4B]">
              <span className="font-medium">მიმდინარე ელფოსტა:</span> {accountEmail || "—"}
            </p>

            {accountErr ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{accountErr}</p>
            ) : null}
            {accountMessage ? (
              <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                {accountMessage}
              </p>
            ) : null}

            <button
              type="button"
              aria-expanded={emailAccordionOpen}
              onClick={() => setEmailAccordionOpen((v) => !v)}
              className="mt-4 flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition hover:bg-slate-50"
            >
              <span className="text-base font-semibold text-gray-900">ელფოსტის შეცვლა</span>
              <span className="text-slate-500" aria-hidden>
                {emailAccordionOpen ? "▴" : "▾"}
              </span>
            </button>
            {emailAccordionOpen ? (
              <div className="mt-3 space-y-3 rounded-lg border border-slate-100 bg-white p-4">
                <label className="block">
                  <span className="mb-1 block text-base font-semibold text-gray-900">ახალი ელფოსტა</span>
                  <input
                    type="email"
                    autoComplete="email"
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none ring-[#2563EB]/30 focus:border-[#2563EB] focus:ring-2"
                    placeholder="ახალი მისამართი"
                    value={newEmail}
                    onChange={(e) => {
                      setNewEmail(e.target.value)
                      setAccountErr("")
                      setAccountMessage("")
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={emailBusy}
                  onClick={() => void handleUpdateEmail()}
                  className="h-11 w-full rounded-lg bg-[#2563EB] text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:px-6"
                >
                  {emailBusy ? "მიმდინარეობს..." : "ელფოსტის შეცვლა"}
                </button>
              </div>
            ) : null}

            <button
              type="button"
              aria-expanded={passwordAccordionOpen}
              onClick={() => setPasswordAccordionOpen((v) => !v)}
              className="mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition hover:bg-slate-50"
            >
              <span className="text-base font-semibold text-gray-900">პაროლის შეცვლა</span>
              <span className="text-slate-500" aria-hidden>
                {passwordAccordionOpen ? "▴" : "▾"}
              </span>
            </button>
            {passwordAccordionOpen ? (
              <div className="mt-3 space-y-3 rounded-lg border border-slate-100 bg-white p-4">
                <label className="block">
                  <span className="mb-1 block text-base font-semibold text-gray-900">ახლანდელი პაროლი</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 outline-none ring-[#2563EB]/30 focus:border-[#2563EB] focus:ring-2"
                    value={currentPasswordPw}
                    onChange={(e) => {
                      setCurrentPasswordPw(e.target.value)
                      setAccountErr("")
                      setAccountMessage("")
                    }}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-base font-semibold text-gray-900">ახალი პაროლი</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 outline-none ring-[#2563EB]/30 focus:border-[#2563EB] focus:ring-2"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value)
                      setAccountErr("")
                      setAccountMessage("")
                    }}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-base font-semibold text-gray-900">ახალი პაროლის გამეორება</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 outline-none ring-[#2563EB]/30 focus:border-[#2563EB] focus:ring-2"
                    value={confirmNewPassword}
                    onChange={(e) => {
                      setConfirmNewPassword(e.target.value)
                      setAccountErr("")
                      setAccountMessage("")
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={passwordBusy}
                  onClick={() => void handleUpdatePassword()}
                  className="h-11 w-full rounded-lg bg-[#2563EB] text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:px-6"
                >
                  {passwordBusy ? "მიმდინარეობს..." : "პაროლის განახლება"}
                </button>
              </div>
            ) : null}
          </section>

          {userType === "freelancer" ? (
            <div className="mt-5 space-y-5">
              <div>
                <label className="mb-1 block text-base font-semibold text-gray-900">პროფესიული სათაური</label>
                <input className="h-11 w-full rounded-lg border border-slate-300 px-3" placeholder="React Developer, Graphic Designer" value={professionalTitle} onChange={(e)=>setProfessionalTitle(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-base font-semibold text-gray-900">ბიოგრაფია</label>
                <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2" rows={4} value={bio} onChange={(e)=>setBio(e.target.value)} />
                <p className="mt-1 text-right text-xs text-slate-500">{bio.length}/2000</p>
              </div>
              <div>
                <label className="mb-1 block text-base font-semibold text-gray-900">დასაქმების ტიპი</label>
                <select className="h-11 w-full rounded-lg border border-slate-300 px-3" value={availability} onChange={(e)=>setAvailability(e.target.value)}>
                  <option value="">აირჩიე...</option>
                  <option value="full_time">სრული განაკვეთი</option>
                  <option value="part_time">ნახევარი განაკვეთი</option>
                  <option value="weekends">შაბათ-კვირა</option>
                </select>
              </div>
              <div ref={langBoxRef} className="relative">
                <label className="mb-1 block text-base font-semibold text-gray-900">ენები</label>
                <div className="min-h-[2.75rem] rounded-lg border border-slate-300 bg-white px-2 py-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {languages.map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setLanguages((prev) => prev.filter((x) => x !== lang))}
                        className="inline-flex items-center gap-1 rounded-full bg-[#1B2B4B] px-2.5 py-0.5 text-xs font-medium text-white"
                      >
                        {lang}
                        <span aria-hidden className="text-white/80">
                          ×
                        </span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setLangDropdownOpen((o) => !o)}
                      className="ml-auto shrink-0 rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs font-semibold text-[#1B2B4B] hover:border-[#D4A843]"
                    >
                      + ენა
                    </button>
                  </div>
                  {langDropdownOpen ? (
                    <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                      {PROFILE_LANGUAGE_OPTIONS.filter((opt) => !languages.includes(opt)).length === 0 ? (
                        <li className="px-3 py-2 text-xs text-slate-500">ყველა ენა არჩეულია ან სია ცარიელია.</li>
                      ) : null}
                      {PROFILE_LANGUAGE_OPTIONS.filter((opt) => !languages.includes(opt)).map((opt) => (
                        <li key={opt}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                            onClick={() => {
                              setLanguages((prev) => [...prev, opt])
                              setLangDropdownOpen(false)
                            }}
                          >
                            {opt}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">დააჭირე „+ ენა“ და აირჩიე სიიდან — სია იშლება ქვემოთ.</p>
              </div>
              <div>
                <label className="mb-1 block text-base font-semibold text-gray-900">LinkedIn პროფილი</label>
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
                  inputMode="url"
                  disabled={noLinkedinProfile}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 disabled:cursor-not-allowed disabled:bg-slate-100"
                  placeholder="https://www.linkedin.com/in/..."
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500">
                  {noLinkedinProfile ? "ბმული არ შეინახება." : "მხოლოდ linkedin.com ბმული (in/company/school)."}{" "}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-base font-semibold text-gray-900">GitHub პროფილი</label>
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
                  inputMode="url"
                  disabled={noGithubProfile}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 disabled:cursor-not-allowed disabled:bg-slate-100"
                  placeholder="https://github.com/მომხმარებელი"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500">
                  {noGithubProfile ? "ბმული არ შეინახება." : "მხოლოდ github.com."}{" "}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-base font-semibold text-gray-900">პორტფოლიო ვებსაიტი</label>
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
                  inputMode="url"
                  disabled={noPortfolioWebsite}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 disabled:cursor-not-allowed disabled:bg-slate-100"
                  placeholder="https://"
                  value={portfolioUrl}
                  onChange={(e) => setPortfolioUrl(e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500">
                  {noPortfolioWebsite ? "ბმული არ შეინახება." : "ნებისმიერი სწორი https ბმული."}
                </p>
              </div>
              <div className="space-y-3">
                <label className="mb-1 block text-base font-semibold text-gray-900">უნარები (მინ. 3)</label>
                <p className="text-xs text-slate-500">
                  არჩეულია <span className="font-semibold tabular-nums text-slate-700">{selectedSkillIds.length}</span> უნარი · საჭიროა მინიმუმ{" "}
                  <span className="font-semibold">3</span>
                </p>

                <div>
                  <label htmlFor="profile-skill-category" className="mb-1 block text-base font-semibold text-gray-900">
                    კატეგორია
                  </label>
                  <select
                    id="profile-skill-category"
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/25"
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
                    <p className="mb-2 text-sm font-semibold text-[#2563EB]">{skillFocusCategory}</p>
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
                          <label className="sr-only" htmlFor="profile-skill-add-active">
                            უნარის დამატება — {skillFocusCategory}
                          </label>
                          <select
                            id="profile-skill-add-active"
                            key={`profile-skill-dd-${skillFocusCategory}-${selectedInCategory.map((s) => s.id).join("-")}`}
                            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/25"
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
              <div>
                <label className="mb-1 block text-base font-semibold text-gray-900">სერვისები</label>
                <div className="space-y-3">
                  {serviceListings.length === 0 ? (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      ლისტინგები ჯერ არ გაქვს დამატებული.
                    </p>
                  ) : null}

                  {serviceListings.map((listing, index) => (
                    <div key={listing.id ?? `new-${index}`} className="rounded-xl border border-slate-200 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[#1B2B4B]">ლისტინგი #{index + 1}</p>
                        <button
                          type="button"
                          onClick={() => removeListing(index)}
                          className="text-xs font-semibold text-[#EF4444]"
                        >
                          წაშლა
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-base font-semibold text-gray-900">სათაური *</label>
                          <input
                            className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                            value={listing.title}
                            onChange={(e) => updateListing(index, { title: e.target.value })}
                            placeholder="მაგ: ვებგვერდის დამზადება React-ით"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-base font-semibold text-gray-900">აღწერა</label>
                          <textarea
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            rows={3}
                            value={listing.description}
                            onChange={(e) => updateListing(index, { description: e.target.value })}
                            placeholder="მოკლე აღწერა სერვისზე"
                          />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-base font-semibold text-gray-900">ფასი (₾)</label>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                              value={listing.price}
                              onChange={(e) => updateListing(index, { price: e.target.value })}
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-base font-semibold text-gray-900">ვადა (დღე) *</label>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                              value={listing.deliveryDays}
                              onChange={(e) => updateListing(index, { deliveryDays: e.target.value })}
                              placeholder="3"
                            />
                          </div>
                        </div>

                        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={listing.isActive}
                            onChange={(e) => updateListing(index, { isActive: e.target.checked })}
                          />
                          აქტიური ლისტინგი
                        </label>
                      </div>
                    </div>
                  ))}

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <span>{serviceListings.length}/3 ლისტინგი</span>
                    {serviceListings.length < 3 ? (
                      <Link
                        to="/listing/new"
                        className="rounded-md border border-[#1B2B4B] bg-white px-2 py-1 font-semibold text-[#1B2B4B] hover:bg-amber-50"
                      >
                        + ახალი ლისტინგი (სრული ფორმა)
                      </Link>
                    ) : (
                      <span className="text-slate-500">ლიმიტი: 3 ლისტინგი</span>
                    )}
                  </div>

                </div>
              </div>

              <div>
                <label className="mb-1 block text-base font-semibold text-gray-900">გამოცდილება (მაქს. 10)</label>
                <div className="space-y-3">
                  {experiences.length === 0 ? (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      გამოცდილება ჯერ არ გაქვს დამატებული.
                    </p>
                  ) : null}

                  {experiences.map((exp, index) => (
                    <div key={exp.id ?? `exp-${index}`} className="rounded-xl border border-slate-200 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[#1B2B4B]">გამოცდილება #{index + 1}</p>
                        <button type="button" onClick={() => removeExperience(index)} className="text-xs font-semibold text-[#EF4444]">
                          წაშლა
                        </button>
                      </div>

                      <div className="space-y-3">
                        <input
                          className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                          placeholder="პოზიცია / სახელი"
                          value={exp.title}
                          onChange={(e) => updateExperience(index, { title: e.target.value })}
                        />
                        <input
                          className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                          placeholder="სამუშაო ადგილი (კომპანია)"
                          value={exp.organization}
                          onChange={(e) => updateExperience(index, { organization: e.target.value })}
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <input
                            type="date"
                            className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                            value={exp.startDate}
                            onChange={(e) => updateExperience(index, { startDate: e.target.value })}
                          />
                          <input
                            type="date"
                            disabled={exp.isPresent}
                            className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm disabled:bg-slate-100"
                            value={exp.endDate}
                            onChange={(e) => updateExperience(index, { endDate: e.target.value })}
                          />
                        </div>
                        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={exp.isPresent}
                            onChange={(e) => updateExperience(index, { isPresent: e.target.checked })}
                          />
                          მიმდინარე
                        </label>
                        <textarea
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          rows={3}
                          placeholder="აღწერა"
                          value={exp.description}
                          onChange={(e) => updateExperience(index, { description: e.target.value })}
                        />
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <span>{experiences.length}/10 ჩანაწერი</span>
                    <button
                      type="button"
                      disabled={experiences.length >= 10}
                      onClick={() =>
                        setExperiences((prev) => [
                          ...prev,
                          { title: "", organization: "", startDate: "", endDate: "", isPresent: false, description: "" },
                        ])
                      }
                      className="font-semibold text-[#1B2B4B] disabled:opacity-40"
                    >
                      + დამატება
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-base font-semibold text-gray-900">განათლება (არასავალდებულო, მაქს. 10)</label>
                <div className="space-y-3">
                  {educations.length === 0 ? (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      განათლება ჯერ არ გაქვს დამატებული.
                    </p>
                  ) : null}

                  {educations.map((edu, index) => (
                    <div key={edu.id ?? `edu-${index}`} className="rounded-xl border border-slate-200 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[#1B2B4B]">განათლება #{index + 1}</p>
                        <button type="button" onClick={() => removeEducation(index)} className="text-xs font-semibold text-[#EF4444]">
                          წაშლა
                        </button>
                      </div>
                      <div className="space-y-3">
                        <input
                          className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                          placeholder="სად სწავლობ / სასწავლებელი"
                          value={edu.institution}
                          onChange={(e) => updateEducation(index, { institution: e.target.value })}
                        />
                        <select
                          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                          value={edu.degreeLevel}
                          onChange={(e) => updateEducation(index, { degreeLevel: e.target.value as FreelancerEducationDegreeLevel | "" })}
                        >
                          <option value="">აირჩიე საფეხური</option>
                          {FREELANCER_EDUCATION_DEGREE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <input
                          className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                          placeholder="რას სწავლობ (სპეციალობა / მიმართულება)"
                          value={edu.fieldOfStudy}
                          onChange={(e) => updateEducation(index, { fieldOfStudy: e.target.value })}
                        />
                        <label className="mb-1 block text-base font-semibold text-gray-900">დასრულების თარიღი</label>
                        <input
                          type="date"
                          className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                          value={edu.endDate}
                          onChange={(e) => updateEducation(index, { endDate: e.target.value })}
                        />
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <span>{educations.length}/10 ჩანაწერი</span>
                    <button
                      type="button"
                      disabled={educations.length >= 10}
                      onClick={() =>
                        setEducations((prev) => [...prev, { institution: "", degreeLevel: "", fieldOfStudy: "", endDate: "" }])
                      }
                      className="font-semibold text-[#1B2B4B] disabled:opacity-40"
                    >
                      + დამატება
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              <div>
                <label className="mb-1 block text-base font-semibold text-gray-900">კომპანიის სახელი</label>
                <input className="h-11 w-full rounded-lg border border-slate-300 px-3" value={companyName} onChange={(e)=>setCompanyName(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-base font-semibold text-gray-900">კომპანიის აღწერა</label>
                <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2" rows={4} value={companyDescription} onChange={(e)=>setCompanyDescription(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-base font-semibold text-gray-900">ინდუსტრია</label>
                <input className="h-11 w-full rounded-lg border border-slate-300 px-3" value={industry} onChange={(e)=>setIndustry(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-base font-semibold text-gray-900">კომპანიის ვებსაიტი</label>
                <input className="h-11 w-full rounded-lg border border-slate-300 px-3" value={companyWebsite} onChange={(e)=>setCompanyWebsite(e.target.value)} />
              </div>
            </div>
          )}

          {error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {success ? <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p> : null}

          <button
            disabled={saving}
            onClick={onSave}
            className="mt-6 h-11 w-full rounded-lg bg-[#2563EB] text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? "ინახება..." : "ცვლილებების შენახვა"}
          </button>
        </div>
      </main>

      {deleteModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-[400px] rounded-xl bg-white p-8">
            {deleteStep === 1 ? (
              <div>
                <p className="text-center text-3xl">⚠️</p>
                <h2 className="mt-3 text-center text-xl font-bold text-[#1B2B4B]">დარწმუნებული ხარ?</h2>
                <p className="mt-3 text-sm text-slate-600">
                  ეს მოქმედება შეუქცევადია. შენი პროფილი, სერვისები, განცხადებები და ყველა მონაცემი სამუდამოდ წაიშლება.
                </p>
                <div className="mt-5 space-y-2">
                  <button
                    type="button"
                    onClick={() => setDeleteModalOpen(false)}
                    className="h-11 w-full rounded-lg border border-slate-300 text-sm font-semibold text-slate-700"
                  >
                    გაუქმება
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteStep(2)}
                    className="h-11 w-full rounded-lg bg-[#EF4444] text-sm font-semibold text-white"
                  >
                    კი, წავშალო
                  </button>
                </div>
              </div>
            ) : null}

            {deleteStep === 2 ? (
              <div>
                <h2 className="text-center text-xl font-bold text-[#1B2B4B]">შეიყვანე პაროლი დასადასტურებლად</h2>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="mt-4 h-11 w-full rounded-lg border border-slate-300 px-3"
                />
                {deleteError ? <p className="mt-2 text-sm text-red-600">{deleteError}</p> : null}
                <div className="mt-5 space-y-2">
                  <button
                    type="button"
                    disabled={deleteLoading}
                    onClick={handleDeleteAccount}
                    className="h-11 w-full rounded-lg bg-[#EF4444] text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {deleteLoading ? "მიმდინარეობს..." : "ანგარიშის წაშლა"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteModalOpen(false)}
                    className="h-11 w-full rounded-lg border border-slate-300 text-sm font-semibold text-slate-700"
                  >
                    გაუქმება
                  </button>
                </div>
              </div>
            ) : null}

            {deleteStep === 3 ? (
              <div className="text-center">
                <h2 className="text-xl font-bold text-[#1B2B4B]">ანგარიში წაიშალა</h2>
                <p className="mt-2 text-sm text-slate-600">შენი ანგარიში წარმატებით წაიშალა.</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
