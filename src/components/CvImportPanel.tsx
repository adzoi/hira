import { useRef, useState, type ReactNode } from "react"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { importCvFromPdf, type CvImportResult } from "../lib/cvImport.ts"
import { cvStoragePath } from "../lib/cvStorage.ts"
import { supabase } from "../lib/supabase"
import { validateCvUpload } from "../lib/uploadValidation.ts"

export type CvImportField = "title" | "bio" | "skills" | "languages" | "links" | "experience" | "education"

type Props = {
  skillCatalog: Array<{ id: string; name: string }>
  onApply: (result: CvImportResult, fields: Set<CvImportField>) => void
  /** Upload the same PDF as the profile's downloadable CV (private `cvs` bucket). */
  allowAttach?: boolean
}

const LINK_LABELS: Array<[keyof CvImportResult["links"], string]> = [
  ["linkedin", "LinkedIn"],
  ["github", "GitHub"],
  ["portfolio", "Website"],
  ["facebook", "Facebook"],
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["youtube", "YouTube"],
  ["x", "X"],
]

function Row({
  field,
  label,
  picked,
  onToggle,
  children,
}: {
  field: CvImportField
  label: string
  picked: Set<CvImportField>
  onToggle: (field: CvImportField) => void
  children: ReactNode
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 p-3 hover:border-[#0088FF]">
      <input type="checkbox" className="mt-1" checked={picked.has(field)} onChange={() => onToggle(field)} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <span className="mt-0.5 block text-sm text-[#1B2B4B]">{children}</span>
      </span>
    </label>
  )
}

/** "Fill your profile from your CV": read a PDF in the browser, show what was found, apply on confirm. */
export default function CvImportPanel({ skillCatalog, onApply, allowAttach = true }: Props) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<CvImportResult | null>(null)
  const [picked, setPicked] = useState<Set<CvImportField>>(new Set())
  const [attach, setAttach] = useState(true)
  const [applying, setApplying] = useState(false)
  const [appliedNote, setAppliedNote] = useState("")

  const skillName = new Map(skillCatalog.map((s) => [s.id, s.name]))

  const handleFile = async (f: File) => {
    setError("")
    setAppliedNote("")
    const check = validateCvUpload(f)
    if (check.ok === false) {
      setError(check.message)
      return
    }
    setReading(true)
    try {
      const parsed = await importCvFromPdf(f, skillCatalog)
      if (parsed.textLength < 40) {
        setError(t("cvImport.scanned"))
        return
      }
      const available = new Set<CvImportField>()
      if (parsed.title) available.add("title")
      if (parsed.bio) available.add("bio")
      if (parsed.skillIds.length) available.add("skills")
      if (parsed.languages.length) available.add("languages")
      if (Object.values(parsed.links).some(Boolean)) available.add("links")
      if (parsed.experiences.length) available.add("experience")
      if (parsed.educations.length) available.add("education")
      if (available.size === 0) {
        setError(t("cvImport.nothingFound"))
        return
      }
      setFile(f)
      setResult(parsed)
      setPicked(available)
    } catch {
      setError(t("cvImport.readError"))
    } finally {
      setReading(false)
    }
  }

  const toggle = (field: CvImportField) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(field)) next.delete(field)
      else next.add(field)
      return next
    })

  const apply = async () => {
    if (!result) return
    setApplying(true)
    let attached = false
    if (allowAttach && attach && file && supabase) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user) {
          const path = cvStoragePath(user.id)
          const { error: upErr } = await supabase.storage.from("cvs").upload(path, file, { upsert: true, contentType: "application/pdf" })
          if (!upErr) {
            const { error: profErr } = await supabase.from("profiles").update({ cv_url: path }).eq("id", user.id)
            attached = !profErr
          }
        }
      } catch {
        /* the profile fill still happens; attaching the file is a bonus */
      }
    }
    onApply(result, picked)
    setApplying(false)
    setResult(null)
    setFile(null)
    setAppliedNote(attached ? t("cvImport.appliedWithCv") : t("cvImport.applied"))
  }

  return (
    <div className="rounded-xl border border-dashed border-[#0088FF]/50 bg-[#F4F9FF] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 sm:flex-1">
          <p className="font-semibold text-[#1B2B4B]">{t("cvImport.title")}</p>
          <p className="mt-0.5 text-sm text-slate-600">{t("cvImport.hint")}</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
            e.currentTarget.value = ""
          }}
        />
        <button
          type="button"
          disabled={reading}
          onClick={() => inputRef.current?.click()}
          className="h-11 w-full shrink-0 rounded-lg bg-[#0088FF] px-4 sm:w-auto text-sm font-semibold text-white transition hover:bg-[#006ACC] disabled:opacity-60"
        >
          {reading ? t("cvImport.reading") : t("cvImport.button")}
        </button>
      </div>
      {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {appliedNote ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{appliedNote}</p> : null}

      {result ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cv-import-title"
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 p-4"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setResult(null)
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 id="cv-import-title" className="text-lg font-bold text-[#1B2B4B]">{t("cvImport.foundHeading")}</h3>
              <p className="mt-0.5 text-sm text-slate-600">{t("cvImport.foundHint")}</p>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-6 py-4">
              {result.title ? <Row picked={picked} onToggle={toggle} field="title" label={t("cvImport.fields.title")}>{result.title}</Row> : null}
              {result.bio ? (
                <Row picked={picked} onToggle={toggle} field="bio" label={t("cvImport.fields.bio")}>
                  <span className="line-clamp-4">{result.bio}</span>
                </Row>
              ) : null}
              {result.skillIds.length ? (
                <Row picked={picked} onToggle={toggle} field="skills" label={t("cvImport.fields.skills", { count: result.skillIds.length })}>
                  <span className="flex flex-wrap gap-1">
                    {result.skillIds.map((id) => (
                      <span key={id} className="rounded-full bg-[#E8F4FF] px-2 py-0.5 text-xs font-medium text-[#0088FF]">
                        {skillName.get(id) ?? id}
                      </span>
                    ))}
                  </span>
                </Row>
              ) : null}
              {result.languages.length ? (
                <Row picked={picked} onToggle={toggle} field="languages" label={t("cvImport.fields.languages")}>{result.languages.join(", ")}</Row>
              ) : null}
              {Object.values(result.links).some(Boolean) ? (
                <Row picked={picked} onToggle={toggle} field="links" label={t("cvImport.fields.links")}>
                  {LINK_LABELS.filter(([k]) => result.links[k]).map(([k, label]) => (
                    <span key={k} className="block truncate">
                      {label}: {result.links[k].replace(/^https?:\/\//, "")}
                    </span>
                  ))}
                </Row>
              ) : null}
              {result.experiences.length ? (
                <Row picked={picked} onToggle={toggle} field="experience" label={t("cvImport.fields.experience", { count: result.experiences.length })}>
                  {result.experiences.map((e, i) => (
                    <span key={i} className="block truncate">
                      {[e.title, e.organization].filter(Boolean).join(" · ")} ({e.startDate.slice(0, 4)}–
                      {e.isPresent ? t("cvImport.present") : e.endDate.slice(0, 4)})
                    </span>
                  ))}
                </Row>
              ) : null}
              {result.educations.length ? (
                <Row picked={picked} onToggle={toggle} field="education" label={t("cvImport.fields.education", { count: result.educations.length })}>
                  {result.educations.map((e, i) => (
                    <span key={i} className="block truncate">
                      {[e.institution, e.fieldOfStudy].filter(Boolean).join(" · ")}
                      {e.endDate ? ` (${e.endDate.slice(0, 4)})` : ""}
                    </span>
                  ))}
                </Row>
              ) : null}
              {allowAttach ? (
                <label className="flex cursor-pointer items-center gap-3 px-1 pt-2 text-sm text-slate-700">
                  <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
                  {t("cvImport.attach")}
                </label>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-200 px-6 py-4 sm:flex-row">
              <button
                type="button"
                disabled={applying || picked.size === 0}
                onClick={() => void apply()}
                className="flex-1 rounded-lg bg-[#0088FF] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#006ACC] disabled:opacity-50"
              >
                {applying ? t("common.loading") : t("cvImport.apply")}
              </button>
              <button
                type="button"
                onClick={() => setResult(null)}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t("cvImport.cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
