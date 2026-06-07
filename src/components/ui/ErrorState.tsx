import { useTranslation } from "../../i18n/LocaleContext.tsx"

type ErrorStateProps = {
  message?: string
  onRetry?: () => void
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  const { t } = useTranslation()

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
      <p className="text-2xl">❗</p>
      <p className="mt-2 text-lg font-semibold">{t("common.somethingWrong")}</p>
      {message ? <p className="mt-2 text-sm text-red-600/90">{message}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 h-11 rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold text-red-700"
        >
          {t("common.tryAgain")}
        </button>
      ) : null}
    </div>
  )
}
