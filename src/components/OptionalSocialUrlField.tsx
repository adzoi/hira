import { useTranslation } from "../i18n/LocaleContext.tsx"

type OptionalSocialUrlFieldProps = {
  label: string
  noLabel?: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  onDisabledChange: (disabled: boolean) => void
  hint?: string
}

export default function OptionalSocialUrlField({
  label,
  noLabel,
  placeholder,
  value,
  onChange,
  disabled,
  onDisabledChange,
  hint,
}: OptionalSocialUrlFieldProps) {
  const { t } = useTranslation()
  const resolvedNoLabel = noLabel ?? t("common.dontHaveOne")

  return (
    <div>
      <label className="mb-1 block text-base font-semibold text-gray-900">{label}</label>
      <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={disabled}
          onChange={(e) => {
            const on = e.target.checked
            onDisabledChange(on)
            if (on) onChange("")
          }}
        />
        {resolvedNoLabel}
      </label>
      <input
        type="url"
        inputMode="url"
        disabled={disabled}
        className="h-11 w-full rounded-lg border border-slate-300 px-3 disabled:cursor-not-allowed disabled:bg-slate-100"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}
