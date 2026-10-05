import type { FreelancerEducationDegreeLevel } from "../freelancerEducation.ts"
import { socialFormFromDbRow } from "../freelancerSocialFields.ts"
import { isSupabaseConfigured, supabase } from "../supabase.ts"

type SkillCategoryRow = { id: string; name_ka: string; name_en?: string | null; parent_id: string | null }

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

export type OnboardingQueryData = {
  redirect?: string
  userType: "freelancer" | "hirer"
  avatarUrl: string
  freelancerProfileId: string | null
  freelancerSlug: string | null
  professionalTitle: string
  bio: string
  availability: "full_time" | "part_time" | "weekends" | ""
  languages: string[]
  linkedinUrl: string
  githubUrl: string
  portfolioUrl: string
  facebookUrl: string
  instagramUrl: string
  tiktokUrl: string
  youtubeUrl: string
  xUrl: string
  noLinkedinProfile: boolean
  noGithubProfile: boolean
  noPortfolioWebsite: boolean
  noFacebookProfile: boolean
  noInstagramProfile: boolean
  noTiktokProfile: boolean
  noYoutubeProfile: boolean
  noXProfile: boolean
  skills: Array<{ id: string; name: string; category_id: string | null }>
  skillCategories: SkillCategoryRow[]
  selectedSkillIds: string[]
  experiences: ExperienceForm[]
  educations: EducationForm[]
  companyName: string
  companyDescription: string
  industry: string
  companyWebsite: string
}

export async function fetchOnboarding(userId: string): Promise<OnboardingQueryData> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase არ არის კონფიგურირებული.")
  }
  if (!userId) {
    throw new Error("AUTH_REQUIRED")
  }

  const { data: profile } = await supabase.rpc("get_my_profile").single()
  if (!profile) throw new Error("პროფილი ვერ მოიძებნა.")

  const base: OnboardingQueryData = {
    userType: profile.user_type as "freelancer" | "hirer",
    avatarUrl: profile.avatar_url ?? "",
    freelancerProfileId: null,
    freelancerSlug: null,
    professionalTitle: "",
    bio: "",
    availability: "",
    languages: [],
    linkedinUrl: "",
    githubUrl: "",
    portfolioUrl: "",
    facebookUrl: "",
    instagramUrl: "",
    tiktokUrl: "",
    youtubeUrl: "",
    xUrl: "",
    noLinkedinProfile: false,
    noGithubProfile: false,
    noPortfolioWebsite: false,
    noFacebookProfile: false,
    noInstagramProfile: false,
    noTiktokProfile: false,
    noYoutubeProfile: false,
    noXProfile: false,
    skills: [],
    skillCategories: [],
    selectedSkillIds: [],
    experiences: [],
    educations: [],
    companyName: "",
    companyDescription: "",
    industry: "",
    companyWebsite: "",
  }

  if (profile.user_type === "freelancer") {
    const [{ data: fp }, { data: skillsData }, { data: categoriesData }] = await Promise.all([
      supabase.from("freelancer_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("skills").select("id,name,category_id").eq("is_approved", true).order("name"),
      supabase
        .from("categories")
        .select("id,name_ka,name_en,parent_id")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ])

    if (fp?.is_profile_complete) {
      const readySlug = typeof fp.slug === "string" && fp.slug.trim() ? fp.slug.trim() : ""
      return { ...base, redirect: readySlug ? `/freelancer/${encodeURIComponent(readySlug)}` : "/profile" }
    }

    base.skills = skillsData ?? []
    base.skillCategories = (categoriesData ?? []) as SkillCategoryRow[]

    if (fp) {
      base.freelancerProfileId = fp.id
      base.freelancerSlug = fp.slug
      base.professionalTitle = fp.professional_title ?? ""
      base.bio = fp.bio ?? ""
      base.availability = (fp.availability as "full_time" | "part_time" | "weekends" | "") ?? ""
      base.languages = fp.languages ?? []
      const social = socialFormFromDbRow(fp)
      base.linkedinUrl = social.linkedinUrl
      base.githubUrl = social.githubUrl
      base.portfolioUrl = social.portfolioUrl
      base.facebookUrl = social.facebookUrl
      base.instagramUrl = social.instagramUrl
      base.tiktokUrl = social.tiktokUrl
      base.youtubeUrl = social.youtubeUrl
      base.xUrl = social.xUrl
      base.noLinkedinProfile = social.noLinkedinProfile
      base.noGithubProfile = social.noGithubProfile
      base.noPortfolioWebsite = social.noPortfolioWebsite
      base.noFacebookProfile = social.noFacebookProfile
      base.noInstagramProfile = social.noInstagramProfile
      base.noTiktokProfile = social.noTiktokProfile
      base.noYoutubeProfile = social.noYoutubeProfile
      base.noXProfile = social.noXProfile

      const [{ data: selectedSkills }] = await Promise.all([
        supabase.from("freelancer_skills").select("skill_id").eq("freelancer_profile_id", fp.id),
      ])
      base.selectedSkillIds = (selectedSkills ?? []).map((x) => x.skill_id)
      const { data: existingExperience } = await supabase
        .from("experience")
        .select("title,organization,start_date,end_date,description")
        .eq("freelancer_profile_id", fp.id)
        .order("start_date", { ascending: false })
      if (existingExperience && existingExperience.length > 0) {
        base.experiences = existingExperience.slice(0, 10).map((item) => ({
          title: item.title ?? "",
          organization: item.organization ?? "",
          start_date: item.start_date ?? "",
          end_date: item.end_date ?? "",
          is_present: !item.end_date,
          description: item.description ?? "",
        }))
      }
      const { data: existingEducation } = await supabase
        .from("freelancer_education")
        .select("institution,degree_level,field_of_study,end_date")
        .eq("freelancer_profile_id", fp.id)
        .order("end_date", { ascending: false })
      if (existingEducation && existingEducation.length > 0) {
        base.educations = existingEducation.slice(0, 10).map((item) => ({
          institution: item.institution ?? "",
          degree_level: (item.degree_level as FreelancerEducationDegreeLevel) ?? "",
          field_of_study: item.field_of_study ?? "",
          end_date: item.end_date ?? "",
        }))
      }
    }
  } else {
    const { data: hp } = await supabase.from("hirer_profiles").select("*").eq("user_id", userId).maybeSingle()
    if (hp?.company_name && hp?.description && hp?.industry) {
      return { ...base, redirect: "/dashboard" }
    }
    if (hp) {
      base.companyName = hp.company_name ?? ""
      base.companyDescription = hp.description ?? ""
      base.industry = hp.industry ?? ""
      base.companyWebsite = hp.website_url ?? ""
    }
  }

  return base
}
