import { useTranslation } from "../../i18n/LocaleContext.tsx"

export default function PageLoader() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F9FC]">
      <div className="text-center">
        <p className="animate-pulse text-4xl font-extrabold tracking-tight text-[#1B2B4B]">{t("brand.name")}</p>
      </div>
    </div>
  )
}
