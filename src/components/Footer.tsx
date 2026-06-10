import { Link, useLocation } from "react-router-dom"
import I18nText from "../i18n/I18nText.tsx"
import { useTranslation } from "../i18n/LocaleContext.tsx"

const socialLinks = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/profile.php?id=61590658563835",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path d="M22.675 0H1.325C.593 0 0 .593 0 1.326v21.348C0 23.407.593 24 1.325 24H12.82v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116c.73 0 1.323-.593 1.323-1.326V1.326C24 .593 23.407 0 22.675 0z" />
      </svg>
    ),
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/hira.freelance/",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
  },
  {
    label: "X (Twitter)",
    href: "https://x.com/HiraGeorgia",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/127864106/",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
]

type FooterColumn = {
  heading: string
  links: { labelKey: string; to: string }[]
}

function FooterLinkColumn({ heading, links }: FooterColumn) {
  const { t } = useTranslation()

  return (
    <div>
      <I18nText
        i18nKey={heading}
        as="p"
        className="text-xs font-bold uppercase tracking-wider text-white/90"
      />
      <ul className="mt-4 space-y-2.5">
        {links.map((item) => (
          <li key={item.labelKey}>
            <Link to={item.to} className="text-sm text-white/90 transition hover:text-white">
              <span data-i18n={item.labelKey}>{t(item.labelKey)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Footer() {
  const location = useLocation()
  const hideOnMobileChatThread = /^\/messages\/[^/]+$/.test(location.pathname)
  const year = 2026

  const navColumns: FooterColumn[] = [
    {
      heading: "footer.platform",
      links: [
        { labelKey: "footer.services", to: "/listings" },
        { labelKey: "footer.categories", to: "/listings" },
        { labelKey: "footer.freelancers", to: "/browse" },
      ],
    },
    {
      heading: "footer.resources",
      links: [
        { labelKey: "footer.guide", to: "/guide" },
        { labelKey: "footer.faq", to: "/faq" },
      ],
    },
    {
      heading: "footer.aboutUs",
      links: [
        { labelKey: "footer.whatIsHira", to: "/about" },
        { labelKey: "footer.terms", to: "/terms" },
        { labelKey: "footer.privacy", to: "/privacy" },
        { labelKey: "footer.cookies", to: "/cookies" },
      ],
    },
  ]

  return (
    <footer className={`border-t border-brand/40 bg-brand text-white ${hideOnMobileChatThread ? "hidden md:block" : ""}`}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-12 md:px-6 md:py-16">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2">
            <I18nText i18nKey="brand.name" as="p" className="text-xl font-extrabold text-white" />
            <I18nText
              i18nKey="footer.tagline"
              as="p"
              className="mt-3 max-w-md text-sm leading-relaxed text-white/90"
            />
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {socialLinks.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 text-white/90 transition hover:border-white/60 hover:bg-white/10"
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {navColumns.map((col) => (
            <FooterLinkColumn key={col.heading} heading={col.heading} links={col.links} />
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/20 pt-6 text-xs text-white/85 sm:flex-row sm:items-center sm:justify-between">
          <I18nText i18nKey="footer.copyright" params={{ year }} />
          <I18nText i18nKey="footer.madeIn" />
        </div>
      </div>
    </footer>
  )
}
