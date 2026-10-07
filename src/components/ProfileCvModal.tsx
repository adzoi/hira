import { useEffect, useMemo } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import CVPreview from "./cv/CVPreview.jsx"
import { useToast } from "./ui/ToastProvider.tsx"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { fetchCvGenerator } from "../lib/queries/fetchCvGenerator.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"

type Props = {
  userId: string
  onClose: () => void
}

/** "Download my profile as a CV": the profile rendered as an editable CV with a PDF button. */
export default function ProfileCvModal({ userId, onClose }: Props) {
  const { t } = useTranslation()
  const { pushToast } = useToast()
  const { data: cv, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.cvGenerator(userId),
    queryFn: () => fetchCvGenerator(userId),
    // Profile edits made a moment ago should show up in the CV.
    staleTime: 0,
  })

  const notify = useMemo(
    () => (evt: { type: string; message: string }) => {
      const type = evt.type === "success" || evt.type === "error" || evt.type === "info" ? evt.type : ("info" as const)
      pushToast({ type, message: evt.message })
    },
    [pushToast],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-cv-title"
      className="fixed inset-0 z-[95] flex items-stretch justify-center bg-black/45 sm:p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex w-full max-w-5xl flex-col overflow-hidden bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="profile-cv-title" className="text-lg font-bold text-[#1B2B4B] sm:text-xl">
              {t("profileCv.heading")}
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">{t("profileCv.hint")}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link
              to="/profile"
              className="hidden rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 sm:inline-block"
            >
              {t("profileCv.editProfile")}
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              {t("profileCv.close")}
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-60 items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#D4A843]" />
            </div>
          ) : isError ? (
            <p className="m-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {queryErrorMessage(error, t("cv.loadFailed"))}
            </p>
          ) : (
            <CVPreview cv={cv ?? {}} onNotify={notify} />
          )}
        </div>
      </div>
    </div>
  )
}
