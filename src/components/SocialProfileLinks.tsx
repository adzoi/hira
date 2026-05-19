import type { ReactNode } from "react"
import {
  FacebookBrandIcon,
  GitHubBrandIcon,
  InstagramBrandIcon,
  LinkedInBrandIcon,
  TikTokBrandIcon,
  XBrandIcon,
  YouTubeBrandIcon,
} from "./SocialBrandIcons.tsx"

export type FreelancerSocialUrls = {
  linkedin_url?: string | null
  github_url?: string | null
  portfolio_url?: string | null
  facebook_url?: string | null
  instagram_url?: string | null
  tiktok_url?: string | null
  youtube_url?: string | null
  x_url?: string | null
}

type SocialLinkDef = {
  href: string
  label: string
  icon: ReactNode
  className?: string
}

const linkClass =
  "inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] px-3 py-1 text-sm text-[#0088FF] transition hover:bg-[#F9FAFB]"

const portfolioLinkClass =
  "inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1 text-sm text-red-500 transition hover:bg-red-50"

function ExternalLinkArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
    </svg>
  )
}

function buildLinks(urls: FreelancerSocialUrls): SocialLinkDef[] {
  const out: SocialLinkDef[] = []
  const push = (href: string | null | undefined, label: string, icon: ReactNode, className?: string) => {
    const trimmed = (href ?? "").trim()
    if (!trimmed) return
    out.push({ href: trimmed, label, icon, className })
  }

  push(urls.linkedin_url, "LinkedIn", <LinkedInBrandIcon className="h-4 w-4" />)
  push(urls.github_url, "GitHub", <GitHubBrandIcon className="h-4 w-4" />)
  push(urls.facebook_url, "Facebook", <FacebookBrandIcon className="h-4 w-4" />)
  push(urls.instagram_url, "Instagram", <InstagramBrandIcon className="h-4 w-4" />)
  push(urls.tiktok_url, "TikTok", <TikTokBrandIcon className="h-4 w-4" />)
  push(urls.youtube_url, "YouTube", <YouTubeBrandIcon className="h-4 w-4" />)
  push(urls.x_url, "X", <XBrandIcon className="h-4 w-4" />)
  push(
    urls.portfolio_url,
    "Portfolio",
    <ExternalLinkArrowIcon className="h-3.5 w-3.5" />,
    portfolioLinkClass,
  )

  return out
}

export default function SocialProfileLinks({ urls, className }: { urls: FreelancerSocialUrls; className?: string }) {
  const links = buildLinks(urls)
  if (links.length === 0) return null

  return (
    <div className={className ?? "flex flex-wrap items-center gap-2"}>
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className={link.className ?? linkClass}
        >
          {link.icon}
          {link.label}
        </a>
      ))}
    </div>
  )
}
