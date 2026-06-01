import type { FreelancerEducationDegreeLevel } from "../freelancerEducation.ts"
import { socialFormFromDbRow } from "../freelancerSocialFields.ts"
import { stripLegacyPricePrefix } from "../listingDescription.ts"
import { normalizeListingPriceType } from "../listingPrice.ts"
import { isSupabaseConfigured, supabase } from "../supabase.ts"

const SKILL_PICKER_UNCATEGORIZED = "__uncategorized__"

type SkillCategoryRow = { id: string; name_ka: string; parent_id: string | null }

export type ServiceListingForm = {
  id?: string
  title: string
  description: string
  price: string
  priceType: "fixed" | "hourly" | "monthly"
  isActive: boolean
}

export type ExperienceForm = {
  id?: string
  title: string
  organization: string
  startDate: string
  endDate: string
  isPresent: boolean
  description: string
}

export type EducationForm = {
  id?: string
  institution: string
  degreeLevel: FreelancerEducationDegreeLevel | ""
  fieldOfStudy: string
  endDate: string
}

export type ProfileQueryData = {
  userId: string
  accountEmail: string
  userType: "freelancer" | "hirer"
  avatarUrl: string
  fullName: string
  city: string
  phone: string
  professionalTitle: string
  bio: string
  availability: string
  acceptingNewWork: boolean
  languages: string[]
  linkedinUrl: string
  githubUrl: string
  portfolioUrl: string
  noLinkedinProfile: boolean
  noGithubProfile: boolean
  noPortfolioWebsite: boolean
  facebookUrl: string
  instagramUrl: string
  tiktokUrl: string
  youtubeUrl: string
  xUrl: string
  noFacebookProfile: boolean
  noInstagramProfile: boolean
  noTiktokProfile: boolean
  noYoutubeProfile: boolean
  noXProfile: boolean
  companyName: string
  companyDescription: string
  industry: string
  companyWebsite: string
  freelancerProfileId: string | null
  serviceListings: ServiceListingForm[]
  initialServiceIds: string[]
  skillsCatalog: Array<{ id: string; name: string; category_id: string | null }>
  skillCategories: SkillCategoryRow[]
  selectedSkillIds: string[]
  experiences: ExperienceForm[]
  educations: EducationForm[]
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

export async function fetchProfile(): Promise<ProfileQueryData> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase არ არის კონფიგურირებული.")
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("მომხმარებელი ვერ მოიძებნა.")

  const [{ data: profile, error: profileError }, { data: fp }, { data: hp }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("freelancer_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("hirer_profiles").select("*").eq("user_id", user.id).maybeSingle(),
  ])

  if (profileError || !profile) throw new Error("პროფილი ვერ ჩაიტვირთა.")

  const userType = profile.user_type as "freelancer" | "hirer"
  const base: ProfileQueryData = {
    userId: user.id,
    accountEmail: user.email ?? "",
    userType,
    avatarUrl: profile.avatar_url ?? "",
    fullName: profile.full_name ?? "",
    city: profile.city ?? "",
    phone: profile.phone ?? "",
    professionalTitle: "",
    bio: "",
    availability: "",
    acceptingNewWork: true,
    languages: [],
    linkedinUrl: "",
    githubUrl: "",
    portfolioUrl: "",
    noLinkedinProfile: true,
    noGithubProfile: true,
    noPortfolioWebsite: true,
    facebookUrl: "",
    instagramUrl: "",
    tiktokUrl: "",
    youtubeUrl: "",
    xUrl: "",
    noFacebookProfile: true,
    noInstagramProfile: true,
    noTiktokProfile: true,
    noYoutubeProfile: true,
    noXProfile: true,
    companyName: "",
    companyDescription: "",
    industry: "",
    companyWebsite: "",
    freelancerProfileId: null,
    serviceListings: [],
    initialServiceIds: [],
    skillsCatalog: [],
    skillCategories: [],
    selectedSkillIds: [],
    experiences: [],
    educations: [],
  }

  if (userType === "freelancer") {
    if (fp) {
      const loadedBio = fp.bio ?? ""
      const social = socialFormFromDbRow(fp)
      const [
        { data: serviceRows, error: servicesError },
        { data: expRows, error: expError },
        { data: eduRows, error: eduRowsError },
        { data: skillRows, error: skillRowsError },
        { data: allSkillsRows, error: allSkillsError },
        { data: categoriesData },
      ] = await Promise.all([
        supabase
          .from("services")
          .select("id,title,description,price,price_type,is_active")
          .eq("freelancer_profile_id", fp.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("experience")
          .select("id,title,organization,start_date,end_date,description")
          .eq("freelancer_profile_id", fp.id)
          .order("start_date", { ascending: false }),
        supabase
          .from("freelancer_education")
          .select("id,institution,degree_level,field_of_study,end_date")
          .eq("freelancer_profile_id", fp.id)
          .order("end_date", { ascending: false }),
        supabase.from("freelancer_skills").select("skill_id").eq("freelancer_profile_id", fp.id),
        supabase.from("skills").select("id,name,category_id").eq("is_approved", true).order("name"),
        supabase
          .from("categories")
          .select("id,name_ka,parent_id")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
      ])

      if (servicesError) throw servicesError
      if (expError) throw expError
      if (eduRowsError) throw eduRowsError
      if (skillRowsError) throw skillRowsError
      if (allSkillsError) throw allSkillsError

      const mappedServices = (serviceRows ?? []).map((item) => ({
        id: item.id,
        title: item.title ?? "",
        description: stripListingMeta(item.description ?? ""),
        price: item.price !== null && item.price !== undefined ? String(item.price) : "",
        priceType: normalizeListingPriceType(item.price_type),
        isActive: item.is_active ?? true,
      }))

      return {
        ...base,
        freelancerProfileId: fp.id,
        professionalTitle: fp.professional_title ?? "",
        bio: loadedBio.trim() === "ბიო უნდა შეიცავდეს მინიმუმ 50 სიმბოლოს" ? "" : loadedBio,
        availability: fp.availability ?? "",
        acceptingNewWork: fp.is_accepting_new_work !== false,
        languages: Array.isArray(fp.languages) ? fp.languages : [],
        linkedinUrl: social.linkedinUrl,
        githubUrl: social.githubUrl,
        portfolioUrl: social.portfolioUrl,
        facebookUrl: social.facebookUrl,
        instagramUrl: social.instagramUrl,
        tiktokUrl: social.tiktokUrl,
        youtubeUrl: social.youtubeUrl,
        xUrl: social.xUrl,
        noLinkedinProfile: social.noLinkedinProfile,
        noGithubProfile: social.noGithubProfile,
        noPortfolioWebsite: social.noPortfolioWebsite,
        noFacebookProfile: social.noFacebookProfile,
        noInstagramProfile: social.noInstagramProfile,
        noTiktokProfile: social.noTiktokProfile,
        noYoutubeProfile: social.noYoutubeProfile,
        noXProfile: social.noXProfile,
        serviceListings: mappedServices.slice(0, 3),
        initialServiceIds: mappedServices.map((item) => item.id).filter(Boolean),
        experiences: (expRows ?? []).slice(0, 10).map((item) => ({
          id: item.id,
          title: item.title ?? "",
          organization: item.organization ?? "",
          startDate: item.start_date ?? "",
          endDate: item.end_date ?? "",
          isPresent: !item.end_date,
          description: item.description ?? "",
        })),
        educations: (eduRows ?? []).slice(0, 10).map((item) => ({
          id: item.id,
          institution: item.institution ?? "",
          degreeLevel: (item.degree_level as FreelancerEducationDegreeLevel) ?? "",
          fieldOfStudy: item.field_of_study ?? "",
          endDate: item.end_date ?? "",
        })),
        selectedSkillIds: (skillRows ?? []).map((row) => row.skill_id).filter(Boolean),
        skillsCatalog: (allSkillsRows ?? []) as Array<{ id: string; name: string; category_id: string | null }>,
        skillCategories: (categoriesData ?? []) as SkillCategoryRow[],
      }
    }
    return base
  }

  if (hp) {
    return {
      ...base,
      companyName: hp.company_name ?? "",
      companyDescription: hp.description ?? "",
      industry: hp.industry ?? "",
      companyWebsite: hp.website_url ?? "",
    }
  }

  return base
}

export { SKILL_PICKER_UNCATEGORIZED }
