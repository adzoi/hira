import { useTranslation } from "../i18n/LocaleContext.tsx"
import { SITE_BASE_URL } from "../lib/usePageMeta.tsx"
import ShareButtons from "./ShareButtons.tsx"

/** Dashboard card: share the public profile (link previews show the generated profile card). */
export default function ShareProfileCard({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const profileUrl = `${SITE_BASE_URL}/freelancer/${encodeURIComponent(slug)}`

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-[#1B2B4B]">{t("share.profileHeading")}</h3>
      <p className="mt-1 text-sm text-slate-600">{t("share.profileHint")}</p>
      <ShareButtons url={profileUrl} text={t("share.profileText")} className="mt-4" />
    </div>
  )
}
