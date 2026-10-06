import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { supabase } from "../lib/supabase"
import { usePageMeta } from "../lib/usePageMeta.tsx"

type Status = "idle" | "busy" | "done" | "error"

/** Landing page for the digest email's unsubscribe link (a button, so link scanners can't trigger it). */
export default function UnsubscribePage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const [status, setStatus] = useState<Status>("idle")
  const u = params.get("u") ?? ""
  const token = params.get("t") ?? ""
  const pageMeta = usePageMeta(t("digest.unsubscribeTitle"), undefined, undefined, { noindex: true })

  const confirm = async () => {
    if (!supabase) return
    setStatus("busy")
    const { data, error } = await supabase.functions.invoke("digest-unsubscribe", { body: { u, t: token } })
    setStatus(!error && (data as { ok?: boolean } | null)?.ok ? "done" : "error")
  }

  return (
    <>
      {pageMeta}
      <main className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-[#1B2B4B]">{t("digest.unsubscribeTitle")}</h1>
        {status === "done" ? (
          <>
            <p className="mt-3 text-slate-600">{t("digest.unsubscribeDone")}</p>
            <Link to="/settings" className="mt-6 font-semibold text-[#0088FF] hover:underline">
              {t("digest.manageInSettings")}
            </Link>
          </>
        ) : (
          <>
            <p className="mt-3 text-slate-600">{t("digest.unsubscribeBody")}</p>
            {status === "error" || !u || !token ? (
              <p className="mt-3 text-sm text-red-600">{t("digest.unsubscribeError")}</p>
            ) : null}
            <button
              type="button"
              disabled={status === "busy" || !u || !token}
              onClick={() => void confirm()}
              className="mt-6 inline-flex h-11 items-center rounded-full bg-[#1B2B4B] px-6 text-sm font-semibold text-white hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:opacity-60"
            >
              {status === "busy" ? t("common.inProgress") : t("digest.unsubscribeButton")}
            </button>
          </>
        )}
      </main>
    </>
  )
}
