import { useState } from "react"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { signInWithProvider, type OAuthProvider } from "../lib/oauth.ts"

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"
      />
    </svg>
  )
}

const PROVIDERS: Array<{ id: OAuthProvider; labelKey: string; Icon: () => React.JSX.Element }> = [
  { id: "google", labelKey: "auth.continueWithGoogle", Icon: GoogleIcon },
  { id: "facebook", labelKey: "auth.continueWithFacebook", Icon: FacebookIcon },
]

type Props = {
  /** Same-site path to open after sign-in (existing accounts only; new ones go to onboarding). */
  next?: string | null
  referralCode?: string | null
}

export default function SocialSignInButtons({ next = null, referralCode = null }: Props) {
  const { t } = useTranslation()
  const [redirecting, setRedirecting] = useState<OAuthProvider | null>(null)
  const [error, setError] = useState("")

  const handleClick = async (provider: OAuthProvider) => {
    setError("")
    setRedirecting(provider)
    const { error: oauthError } = await signInWithProvider(provider, { next, referralCode })
    if (oauthError) {
      setRedirecting(null)
      setError(t("auth.oauthFailed"))
    }
  }

  return (
    <div>
      <div className="space-y-3">
        {PROVIDERS.map(({ id, labelKey, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => void handleClick(id)}
            disabled={redirecting !== null}
            className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-[#1B2B4B] transition-colors duration-150 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Icon />
            {redirecting === id ? t("common.inProgress") : t(labelKey)}
          </button>
        ))}
      </div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        {t("auth.orWithEmail")}
        <span className="h-px flex-1 bg-slate-200" />
      </div>
    </div>
  )
}
