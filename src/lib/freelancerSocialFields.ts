import {
  parseFacebookField,
  parseGitHubField,
  parseInstagramField,
  parseLinkedInField,
  parseOptionalWebUrl,
  parseTikTokField,
  parseXField,
  parseYouTubeField,
} from "./socialUrls.ts"

export type FreelancerSocialFormState = {
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
}

export type FreelancerSocialDbRow = {
  linkedin_url?: string | null
  github_url?: string | null
  portfolio_url?: string | null
  facebook_url?: string | null
  instagram_url?: string | null
  tiktok_url?: string | null
  youtube_url?: string | null
  x_url?: string | null
}

export function socialFormFromDbRow(row: FreelancerSocialDbRow): FreelancerSocialFormState {
  const loadedLi = (row.linkedin_url ?? "").trim()
  const loadedGh = (row.github_url ?? "").trim()
  const loadedPf = (row.portfolio_url ?? "").trim()
  const loadedFb = (row.facebook_url ?? "").trim()
  const loadedIg = (row.instagram_url ?? "").trim()
  const loadedTt = (row.tiktok_url ?? "").trim()
  const loadedYt = (row.youtube_url ?? "").trim()
  const loadedX = (row.x_url ?? "").trim()

  return {
    linkedinUrl: row.linkedin_url ?? "",
    githubUrl: row.github_url ?? "",
    portfolioUrl: row.portfolio_url ?? "",
    facebookUrl: row.facebook_url ?? "",
    instagramUrl: row.instagram_url ?? "",
    tiktokUrl: row.tiktok_url ?? "",
    youtubeUrl: row.youtube_url ?? "",
    xUrl: row.x_url ?? "",
    noLinkedinProfile: !loadedLi,
    noGithubProfile: !loadedGh,
    noPortfolioWebsite: !loadedPf,
    noFacebookProfile: !loadedFb,
    noInstagramProfile: !loadedIg,
    noTiktokProfile: !loadedTt,
    noYoutubeProfile: !loadedYt,
    noXProfile: !loadedX,
  }
}

export function parseFreelancerSocialFields(
  form: FreelancerSocialFormState,
): { ok: true; values: FreelancerSocialDbRow } | { ok: false; message: string } {
  const parsedLi = parseLinkedInField(form.noLinkedinProfile ? "" : form.linkedinUrl)
  if (parsedLi.ok === false) return parsedLi
  const parsedGh = parseGitHubField(form.noGithubProfile ? "" : form.githubUrl)
  if (parsedGh.ok === false) return parsedGh
  const parsedPf = parseOptionalWebUrl(form.noPortfolioWebsite ? "" : form.portfolioUrl)
  if (parsedPf.ok === false) return parsedPf
  const parsedFb = parseFacebookField(form.noFacebookProfile ? "" : form.facebookUrl)
  if (parsedFb.ok === false) return parsedFb
  const parsedIg = parseInstagramField(form.noInstagramProfile ? "" : form.instagramUrl)
  if (parsedIg.ok === false) return parsedIg
  const parsedTt = parseTikTokField(form.noTiktokProfile ? "" : form.tiktokUrl)
  if (parsedTt.ok === false) return parsedTt
  const parsedYt = parseYouTubeField(form.noYoutubeProfile ? "" : form.youtubeUrl)
  if (parsedYt.ok === false) return parsedYt
  const parsedX = parseXField(form.noXProfile ? "" : form.xUrl)
  if (parsedX.ok === false) return parsedX

  return {
    ok: true,
    values: {
      linkedin_url: parsedLi.value,
      github_url: parsedGh.value,
      portfolio_url: parsedPf.value,
      facebook_url: parsedFb.value,
      instagram_url: parsedIg.value,
      tiktok_url: parsedTt.value,
      youtube_url: parsedYt.value,
      x_url: parsedX.value,
    },
  }
}
