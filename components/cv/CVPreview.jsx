"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "../../src/lib/supabase"
import { avatarImageUrl, avatarPublicUrl } from "../../src/lib/storageImageUrl.ts"
import {
  formatGeorgianExperienceRange,
  formatGeorgianMonthYear,
  initialsFromName,
  sanitizeCvProfessionalSummary,
  stripUrlForDisplay,
} from "../../src/lib/cvFromProfile.ts"
import { OptimizedImage } from "../../src/components/OptimizedImage.tsx"
import { compressImageForUpload } from "../../src/lib/compressImageForUpload.ts"
import "./cv-preview.css"
import cvPrintCss from "./cv-print.css?raw"

const A4_WIDTH = 794
const A4_HEIGHT = 1123

function cvPdfFilename(fullName) {
  const base = String(fullName || "cv")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u10A0-\u10FF.-]/g, "")
    .slice(0, 60)
  return `${base || "cv"}.pdf`
}

async function waitForIframeImages(iframe) {
  const doc = iframe.contentDocument
  if (!doc) return
  const win = iframe.contentWindow
  await new Promise((resolve) => {
    if (doc.readyState === "complete") resolve()
    else win?.addEventListener("load", () => resolve(), { once: true })
  })
  await Promise.all(
    [...doc.images].map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) resolve()
          else {
            img.addEventListener("load", () => resolve(), { once: true })
            img.addEventListener("error", () => resolve(), { once: true })
          }
        }),
    ),
  )
}

function truthyStr(v) {
  if (v == null) return false
  if (typeof v === "string") return v.trim().length > 0 && v.trim().toUpperCase() !== "N/A"
  return Boolean(v)
}

function truthyArr(a) {
  return Array.isArray(a) && a.some((x) => truthyStr(typeof x === "string" ? x : String(x)))
}

/** Web URLs shown in sidebar / PDF: non-empty and http(s). */
function truthyHttpUrl(v) {
  if (!truthyStr(v)) return false
  return /^https?:\/\//i.test(String(v).trim())
}

function normalizeCV(input) {
  const raw = input && typeof input === "object" ? input : {}
  const { hourly_rate: _hourlyDropped, ...source } = raw
  void _hourlyDropped
  const ts = Array.isArray(source.technical_skills) ? source.technical_skills.map((x) => String(x)) : []
  const lang = Array.isArray(source.languages) ? source.languages.map((x) => String(x)) : []
  return {
    ...source,
    full_name: String(source.full_name || source?.basic_info?.full_name || ""),
    email: String(source.email || source?.basic_info?.email || ""),
    phone: String(source.phone || source?.basic_info?.phone || ""),
    location: String(source.location || source?.basic_info?.location || ""),
    linkedin_url: String(source.linkedin_url || source?.basic_info?.linkedin_url || ""),
    github_url: String(source.github_url || ""),
    portfolio_url: String(source.portfolio_url || ""),
    avatar_url: String(source.avatar_url || ""),
    professional_summary: sanitizeCvProfessionalSummary(String(source.professional_summary || "")),
    work_experience: Array.isArray(source.work_experience) ? source.work_experience : [],
    education: Array.isArray(source.education) ? source.education : [],
    technical_skills: ts,
    languages: lang,
    soft_skills: Array.isArray(source.soft_skills) ? source.soft_skills.map((x) => String(x)) : [],
    custom_slug: source.custom_slug,
    is_public: source.is_public,
    id: source.id,
  }
}

function PencilButton({ onClick, label, variant = "light" }) {
  const sidebar = variant === "sidebar"
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={
        sidebar
          ? "print:hidden inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-white/35 bg-white/10 text-sm text-white hover:bg-white/15"
          : "print:hidden inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50"
      }
      aria-label={label}
    >
      ✎
    </button>
  )
}

const SIDEBAR_FIELD_CLASS =
  "w-full rounded-[4px] border border-white/30 bg-white/[0.1] px-2 py-1 text-[14px] leading-normal text-white caret-white outline-none placeholder:text-white/40 focus:border-white/[0.45] focus:bg-white/[0.12]"

const SIDEBAR_TAG_INPUT_CLASS =
  "w-full mt-2 rounded-[4px] border border-white/20 bg-white/[0.1] px-2 py-1 text-sm leading-normal text-white caret-white outline-none placeholder:text-white/40 focus-visible:border-white/[0.28]"

function TagEditor({ tags, onChange, placeholder, inputAriaLabel, disabled, variant = "default" }) {
  const [draft, setDraft] = useState("")
  const sidebar = variant === "sidebar"
  const tagClass = sidebar
    ? "inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 px-2 py-0.5 text-xs text-white"
    : "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-800"
  const rmClass = sidebar ? "text-white/70 hover:text-red-300" : "text-slate-500 hover:text-red-600"
  const inputClass = sidebar ? SIDEBAR_TAG_INPUT_CLASS : "mt-2 w-full rounded border border-slate-200 px-2 py-1 text-sm"

  return (
    <div className="print:hidden">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t, i) => (
          <span key={`${t}-${i}`} className={tagClass}>
            {t}
            {!disabled ? (
              <button type="button" className={rmClass} onClick={() => onChange(tags.filter((_, j) => j !== i))}>
                ×
              </button>
            ) : null}
          </span>
        ))}
      </div>
      {!disabled ? (
        <input
          className={inputClass}
          aria-label={inputAriaLabel ?? (sidebar ? placeholder : undefined)}
          placeholder={sidebar ? "" : placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return
            e.preventDefault()
            const next = draft.trim()
            if (!next) return
            if (tags.includes(next)) {
              setDraft("")
              return
            }
            onChange([...tags, next])
            setDraft("")
          }}
        />
      ) : null}
    </div>
  )
}

function AvatarEditor({ fullName, avatarUrl, onChangeUrl, onRemove, onPickFile, uploading }) {
  const fileInputRef = useRef(null)
  return (
    <div className="rounded border border-white/20 bg-white/[0.06] p-2">
      <div className="mb-2 flex items-center gap-2">
        {truthyHttpUrl(avatarUrl) ? (
          <OptimizedImage
            src={avatarImageUrl(supabase, avatarUrl) ?? avatarUrl}
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 rounded-full object-cover ring-2 ring-white/30"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-sm font-semibold text-white">
            {initialsFromName(fullName || "")}
          </div>
        )}
        <p className="text-xs text-white/70">ფოტო CV-ის მარცხენა პანელზე და PDF-ში გამოჩნდება.</p>
      </div>
      <input
        className={SIDEBAR_FIELD_CLASS}
        value={avatarUrl}
        onChange={(e) => onChangeUrl(e.target.value)}
        placeholder=""
        aria-label="ავატარის URL (https://)"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file) return
          if (typeof onPickFile === "function") onPickFile(file)
          e.currentTarget.value = ""
        }}
      />
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={Boolean(uploading)}
          onClick={() => fileInputRef.current?.click()}
          className="rounded border border-white/30 bg-white/10 px-2 py-1 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-60"
        >
          {uploading ? "იტვირთება..." : "ფოტოს ატვირთვა"}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded border border-white/30 bg-white/10 px-2 py-1 text-xs font-medium text-white hover:bg-white/20"
        >
          ფოტოს წაშლა
        </button>
      </div>
    </div>
  )
}

export default function CVPreview({ cv, readOnly = false, showActions = true, onNotify }) {
  const [localCV, setLocalCV] = useState(() => normalizeCV(cv))
  const [isPrinting, setIsPrinting] = useState(false)
  const [isAvatarUploading, setIsAvatarUploading] = useState(false)

  const [editingHeader, setEditingHeader] = useState(false)
  const [editingSummary, setEditingSummary] = useState(false)
  const [editingWorkIdx, setEditingWorkIdx] = useState(null)
  const [editingEduIdx, setEditingEduIdx] = useState(null)

  useEffect(() => {
    setLocalCV(normalizeCV(cv))
  }, [cv])

  function notify(type, message) {
    if (typeof onNotify === "function") {
      onNotify({ type, message })
      return
    }
    if (typeof window !== "undefined") window.alert(message)
  }

  async function handleUploadAvatar(file) {
    if (!file) return
    if (!supabase) {
      notify("error", "Supabase is not configured.")
      return
    }
    const isImage = String(file.type || "").startsWith("image/")
    if (!isImage) {
      notify("error", "ატვირთეთ სურათის ფაილი.")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      notify("error", "ფაილი ძალიან დიდია (მაქს 10MB).")
      return
    }
    setIsAvatarUploading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Session expired. Please log in again.")

      const compressed = await compressImageForUpload(file, "avatar")
      const path = `${user.id}/cv-avatar.webp`

      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, compressed, {
        upsert: true,
        contentType: "image/webp",
      })
      if (uploadError) throw uploadError

      const publicUrl = avatarPublicUrl(supabase, path).trim()
      if (!truthyHttpUrl(publicUrl)) throw new Error("ვერ მოვიპოვე ატვირთული ფოტოს URL.")

      setLocalCV((prev) => ({ ...prev, avatar_url: publicUrl }))
      notify("success", "ფოტო ატვირთულია.")
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "ფოტოს ატვირთვა ვერ მოხერხდა.")
    } finally {
      setIsAvatarUploading(false)
    }
  }

  const showSidebarSkills = readOnly ? truthyArr(localCV.technical_skills) : true
  const showSidebarLang = readOnly ? truthyArr(localCV.languages) : true
  const showSummary = readOnly ? truthyStr(localCV.professional_summary) : true
  const showWork = readOnly ? truthyArr(localCV.work_experience) : true
  const showEducation = readOnly ? truthyArr(localCV.education) : true

  const sidebarLinks = useMemo(() => {
    const out = []
    if (truthyHttpUrl(localCV.linkedin_url)) out.push({ key: "li", label: "LinkedIn", href: localCV.linkedin_url.trim() })
    if (truthyHttpUrl(localCV.github_url)) out.push({ key: "gh", label: "GitHub", href: localCV.github_url.trim() })
    if (truthyHttpUrl(localCV.portfolio_url)) out.push({ key: "pf", label: "Portfolio", href: localCV.portfolio_url.trim() })
    return out
  }, [localCV.linkedin_url, localCV.github_url, localCV.portfolio_url])

  function buildPrintableHtml() {
    const longName = String(localCV.full_name || "").trim().length > 15
    const esc = (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
    const skills = (localCV.technical_skills || []).filter((s) => truthyStr(s)).map((s) => `<li>${esc(s)}</li>`).join("")
    const languages = (localCV.languages || []).filter((s) => truthyStr(s)).map((s) => `<li>${esc(s)}</li>`).join("")

    const linkLine = (url) => {
      if (!truthyHttpUrl(url)) return ""
      const u = String(url).trim()
      const display = stripUrlForDisplay(u)
      return `<div class="print-link"><a href="${esc(u)}">🔗 ${esc(display)}</a></div>`
    }

    const contactBlocks = []
    if (truthyStr(localCV.email)) contactBlocks.push(`<p>${esc(localCV.email)}</p>`)
    if (truthyStr(localCV.phone)) contactBlocks.push(`<p>${esc(localCV.phone)}</p>`)
    if (truthyStr(localCV.location)) contactBlocks.push(`<p>${esc(localCV.location)}</p>`)

    const printLinks = [linkLine(localCV.linkedin_url), linkLine(localCV.github_url), linkLine(localCV.portfolio_url)]
      .filter(Boolean)
      .join("")

    const avatarPrintSrc =
      supabase && truthyHttpUrl(localCV.avatar_url)
        ? avatarImageUrl(supabase, localCV.avatar_url) ?? localCV.avatar_url
        : localCV.avatar_url
    const avatarBlock = truthyHttpUrl(avatarPrintSrc)
      ? `<img class="avatar" src="${esc(avatarPrintSrc)}" alt="" width="96" height="96" crossorigin="anonymous" />`
      : truthyStr(localCV.full_name)
        ? `<div class="avatar-fallback">${esc(initialsFromName(localCV.full_name))}</div>`
        : ""

    const education = (localCV.education || [])
      .filter((edu) => truthyStr(edu.school) || truthyStr(edu.degree) || truthyStr(edu.field_of_study) || truthyStr(edu.end_date))
      .map((edu) => {
        const line1 = [edu.degree, edu.field_of_study].filter(truthyStr).join(" — ")
        const school = truthyStr(edu.school) ? edu.school : ""
        const end = edu.end_date ? formatGeorgianMonthYear(String(edu.end_date)) : ""
        return `
          <div class="edu-card">
            ${line1 ? `<div class="edu-degree">${esc(line1)}</div>` : ""}
            ${school ? `<div class="edu-school">${esc(school)}</div>` : ""}
            ${end ? `<div class="edu-year">${esc(end)}</div>` : ""}
          </div>
        `
      })
      .join("")

    const work = (localCV.work_experience || [])
      .filter((job) => truthyStr(job.role) || truthyStr(job.company) || truthyStr(job.description))
      .map((job) => {
        const desc = String(job.description || "").trim()
        const bullets = desc ? `<li>${esc(desc)}</li>` : ""
        const dates = formatGeorgianExperienceRange(job.start_date, job.end_date, Boolean(job.is_current))
        const title = [job.role, job.company].filter(truthyStr).join(" — ")
        return `
          <div class="work-card">
            ${title ? `<div class="work-title">${esc(title)}</div>` : ""}
            ${dates ? `<div class="work-date">${esc(dates)}</div>` : ""}
            ${bullets ? `<ul>${bullets}</ul>` : ""}
          </div>
        `
      })
      .join("")

    const summaryBlock = truthyStr(localCV.professional_summary)
      ? `<section class="sec sec--first">
           <h3 class="sec-title">პროფესიული რეზიუმე</h3>
           <p class="summary">${esc(localCV.professional_summary)}</p>
         </section>`
      : ""

    const skillsSec =
      skills.length > 0
        ? `<section class="sec"><h3 class="sec-title">უნარები</h3><ul>${skills}</ul></section>`
        : ""
    const langSec =
      languages.length > 0
        ? `<section class="sec"><h3 class="sec-title">ენები</h3><ul>${languages}</ul></section>`
        : ""
    const eduSec = education.length > 0 ? `<section class="sec"><h3 class="sec-title">განათლება</h3>${education}</section>` : ""

    return `
      <!doctype html>
      <html lang="ka">
        <head>
          <meta charset="utf-8" />
          <title>CV</title>
          <style>${cvPrintCss}</style>
        </head>
        <body>
          <div class="cv-shell">
            <aside class="sidebar">
              ${avatarBlock}
              <h1 class="name ${longName ? "name--long" : "name--short"}" lang="ka">${esc(localCV.full_name || "")}</h1>
              ${contactBlocks.length ? `<div class="contact">${contactBlocks.join("")}</div>` : ""}
              ${printLinks ? `<div class="sec sec--links">${printLinks}</div>` : ""}
              ${skillsSec}
              ${langSec}
            </aside>
            <main class="main">
              ${summaryBlock}
              ${
                work.length > 0
                  ? `<section class="sec"><h3 class="sec-title">გამოცდილება</h3>${work}</section>`
                  : ""
              }
              ${eduSec}
            </main>
          </div>
        </body>
      </html>
    `
  }

  async function downloadCvPdf() {
    const fullName = String(localCV?.full_name || "").trim()
    if (!fullName) {
      notify("warning", "დაამატე სახელი სანამ PDF-ს ჩამოტვირთავ.")
      return
    }
    setIsPrinting(true)
    const iframe = document.createElement("iframe")
    iframe.setAttribute("aria-hidden", "true")
    iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_WIDTH}px;height:${A4_HEIGHT}px;border:0;`
    document.body.appendChild(iframe)
    try {
      const doc = iframe.contentDocument
      if (!doc) throw new Error("PDF მომზადება ვერ მოხერხდა.")
      doc.open()
      doc.write(buildPrintableHtml())
      doc.close()
      await waitForIframeImages(iframe)
      const shell = doc.querySelector(".cv-shell")
      if (!shell) throw new Error("CV შაბლონი ვერ მოიძებნა.")
      const html2pdf = (await import("html2pdf.js")).default
      await html2pdf()
        .set({
          margin: 0,
          filename: cvPdfFilename(fullName),
          pagebreak: { mode: ["avoid-all", "css", "legacy"] },
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            width: A4_WIDTH,
            windowWidth: A4_WIDTH,
          },
          jsPDF: { unit: "px", format: [A4_WIDTH, A4_HEIGHT], orientation: "portrait" },
        })
        .from(shell)
        .save()
      notify("success", "PDF ჩამოტვირთულია.")
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "PDF ჩამოტვირთვა ვერ მოხერხდა.")
    } finally {
      iframe.remove()
      setIsPrinting(false)
    }
  }

  const workList = Array.isArray(localCV.work_experience) ? localCV.work_experience : []
  const eduList = Array.isArray(localCV.education) ? localCV.education : []

  return (
    <div className="space-y-4 bg-slate-100 p-2 sm:p-4 md:p-6">
      {showActions ? (
        <div className="print:hidden flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void downloadCvPdf()}
            disabled={isPrinting}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPrinting ? "იტვირთება…" : "PDF ჩამოტვირთვა"}
          </button>
        </div>
      ) : null}

      <div className="cv-preview-viewport mx-auto w-full max-w-[1000px]">
        <article
          className="cv-preview-sheet mx-auto grid origin-top overflow-hidden rounded-lg border border-gray-200 shadow-sm md:grid-cols-[260px_1fr]"
        >
          <aside className="sidebar-dark w-full shrink-0 overflow-hidden bg-[#1a1a2e] p-4 text-white md:w-[260px] md:p-6 [&_*]:break-words">
            {truthyHttpUrl(localCV.avatar_url) ? (
              <OptimizedImage
                src={avatarImageUrl(supabase, localCV.avatar_url) ?? localCV.avatar_url}
                alt=""
                width={96}
                height={96}
                className="mx-auto mb-4 h-24 w-24 rounded-full object-cover ring-2 ring-white/30"
              />
            ) : truthyStr(localCV.full_name) ? (
              <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-white/15 text-xl font-bold text-white">
                {initialsFromName(localCV.full_name)}
              </div>
            ) : null}

            <div className="flex items-start gap-2">
              {!readOnly && editingHeader ? (
                <div className="min-w-0 flex-1 space-y-2 text-sm">
                  <input
                    className={SIDEBAR_FIELD_CLASS}
                    value={localCV.full_name}
                    onChange={(e) => setLocalCV((p) => ({ ...p, full_name: e.target.value }))}
                    placeholder="სახელი და გვარი"
                    aria-label="სახელი და გვარი"
                  />
                  <input
                    type="email"
                    className={SIDEBAR_FIELD_CLASS}
                    value={localCV.email}
                    onChange={(e) => setLocalCV((p) => ({ ...p, email: e.target.value }))}
                    placeholder="ელფოსტა"
                    aria-label="ელფოსტა"
                  />
                  <input
                    className={SIDEBAR_FIELD_CLASS}
                    value={localCV.phone}
                    onChange={(e) => setLocalCV((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="ტელეფონი"
                    aria-label="ტელეფონი"
                  />
                  <input
                    className={SIDEBAR_FIELD_CLASS}
                    value={localCV.location}
                    onChange={(e) => setLocalCV((p) => ({ ...p, location: e.target.value }))}
                    placeholder="ლოკაცია"
                    aria-label="ლოკაცია"
                  />
                  <input
                    className={SIDEBAR_FIELD_CLASS}
                    value={localCV.linkedin_url}
                    onChange={(e) => setLocalCV((p) => ({ ...p, linkedin_url: e.target.value }))}
                    placeholder=""
                    aria-label="LinkedIn — https:// დაწყებით"
                  />
                  <input
                    className={SIDEBAR_FIELD_CLASS}
                    value={localCV.github_url}
                    onChange={(e) => setLocalCV((p) => ({ ...p, github_url: e.target.value }))}
                    placeholder=""
                    aria-label="GitHub — https:// დაწყებით"
                  />
                  <input
                    className={SIDEBAR_FIELD_CLASS}
                    value={localCV.portfolio_url}
                    onChange={(e) => setLocalCV((p) => ({ ...p, portfolio_url: e.target.value }))}
                    placeholder=""
                    aria-label="პორტფოლიო — https:// დაწყებით"
                  />
                  <AvatarEditor
                    fullName={localCV.full_name}
                    avatarUrl={localCV.avatar_url}
                    onChangeUrl={(next) => setLocalCV((p) => ({ ...p, avatar_url: next }))}
                    onRemove={() => setLocalCV((p) => ({ ...p, avatar_url: "" }))}
                    onPickFile={(file) => void handleUploadAvatar(file)}
                    uploading={isAvatarUploading}
                  />
                  <button
                    type="button"
                    className="w-full rounded border border-white/30 bg-white/15 px-2 py-1.5 text-xs font-medium text-white hover:bg-white/25"
                    onClick={() => setEditingHeader(false)}
                  >
                    დასრულება
                  </button>
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  {truthyStr(localCV.full_name) ? (
                    <h1
                      lang="ka"
                      className={`font-bold text-white ${localCV.full_name.length > 15 ? "text-[20px]" : "text-3xl"}`}
                    >
                      {localCV.full_name}
                    </h1>
                  ) : null}
                  <div className="mt-3 space-y-1 text-sm text-[#cbd5e1]">
                    {truthyStr(localCV.email) ? <p className="break-all">{localCV.email}</p> : null}
                    {truthyStr(localCV.phone) ? <p>{localCV.phone}</p> : null}
                    {truthyStr(localCV.location) ? <p>{localCV.location}</p> : null}
                  </div>
                  {sidebarLinks.length > 0 ? (
                    <div className="mt-4 space-y-2 border-t border-white/20 pt-3">
                      {sidebarLinks.map((l) => (
                        <a
                          key={l.key}
                          href={l.href}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 text-sm text-[#cbd5e1] hover:text-white"
                        >
                          <span className="opacity-90">🔗</span>
                          <span>{l.label}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
              {!readOnly ? (
                <PencilButton variant="sidebar" onClick={() => setEditingHeader((e) => !e)} label="საკონტაქტოს რედაქტირება" />
              ) : null}
            </div>

            {showSidebarSkills ? (
              <section className="border-t border-white/20 py-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[12px] font-bold uppercase tracking-wider text-[#94a3b8]">უნარები</h3>
                </div>
                {readOnly && truthyArr(localCV.technical_skills) ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm marker:text-[#64748b]">
                    {localCV.technical_skills.map((item, i) => (
                      <li key={i} className="text-white">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : !readOnly ? (
                  <TagEditor
                    variant="sidebar"
                    tags={localCV.technical_skills}
                    onChange={(next) => setLocalCV((p) => ({ ...p, technical_skills: next }))}
                    placeholder="უნარი"
                    inputAriaLabel="დაამატეთ უნარი, Enter დაადასტურებს"
                    disabled={false}
                  />
                ) : null}
              </section>
            ) : null}

            {showSidebarLang ? (
              <section className="border-t border-white/20 py-5">
                <h3 className="text-[12px] font-bold uppercase tracking-wider text-[#94a3b8]">ენები</h3>
                {readOnly && truthyArr(localCV.languages) ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm marker:text-[#64748b]">
                    {localCV.languages.map((item, i) => (
                      <li key={i} className="text-white">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : !readOnly ? (
                  <TagEditor
                    variant="sidebar"
                    tags={localCV.languages}
                    onChange={(next) => setLocalCV((p) => ({ ...p, languages: next }))}
                    placeholder="ენა"
                    inputAriaLabel="დაამატეთ ენა, Enter დაადასტურებს"
                    disabled={false}
                  />
                ) : null}
              </section>
            ) : null}
          </aside>

          <main className="bg-white p-4 md:p-8">
            {showSummary ? (
              <section className="border-b border-gray-200 pb-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">პროფესიული რეზიუმე</h3>
                  {!readOnly ? <PencilButton onClick={() => setEditingSummary((s) => !s)} label="რეზიუმე" /> : null}
                </div>
                {editingSummary && !readOnly ? (
                  <textarea
                    className="mt-3 w-full rounded border border-gray-200 p-2 text-[15px] leading-7"
                    rows={8}
                    value={localCV.professional_summary}
                    onChange={(e) => setLocalCV((p) => ({ ...p, professional_summary: e.target.value }))}
                  />
                ) : truthyStr(localCV.professional_summary) || !readOnly ? (
                  <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-gray-800">{localCV.professional_summary}</p>
                ) : null}
              </section>
            ) : null}

            {showWork ? (
              <section className="pt-5">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">გამოცდილება</h3>
                  {!readOnly ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-blue-600"
                      onClick={() =>
                        setLocalCV((p) => ({
                          ...p,
                          work_experience: [
                            ...workList,
                            { role: "", company: "", start_date: "", end_date: "", is_current: false, description: "" },
                          ],
                        }))
                      }
                    >
                      + დამატება
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 space-y-4">
                  {workList.map((job, index) => {
                    const dates = formatGeorgianExperienceRange(job.start_date, job.end_date, Boolean(job.is_current))
                    const hasContent =
                      truthyStr(job.role) ||
                      truthyStr(job.company) ||
                      truthyStr(job.description) ||
                      truthyStr(job.start_date)
                    if (readOnly && !hasContent) return null
                    const editing = editingWorkIdx === index && !readOnly
                    return (
                      <div key={`work-${index}`} className="rounded border border-gray-100 p-4">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {editing ? null : readOnly ? null : (
                              <>
                                {(truthyStr(job.role) || truthyStr(job.company)) ? (
                                  <p className="font-semibold text-gray-900">
                                    {[job.role, job.company].filter(truthyStr).join(" — ")}
                                  </p>
                                ) : (
                                  <p className="text-sm italic text-gray-400">ახალი ჩანაწერი — დააჭირეთ რედაქტორს</p>
                                )}
                                {dates ? <p className="mb-1 text-xs text-gray-500">{dates}</p> : null}
                                {truthyStr(job.description) ? <p className="text-sm text-gray-800">{job.description}</p> : null}
                              </>
                            )}
                          </div>
                          {!readOnly ? (
                            <div className="flex shrink-0 gap-1">
                              <PencilButton onClick={() => setEditingWorkIdx(editing ? null : index)} label="რედაქტირება" />
                              <button
                                type="button"
                                className="text-xs text-red-600"
                                onClick={() =>
                                  setLocalCV((p) => ({
                                    ...p,
                                    work_experience: workList.filter((_, i) => i !== index),
                                  }))
                                }
                              >
                                წაშლა
                              </button>
                            </div>
                          ) : null}
                        </div>
                        {editing ? (
                          <div className="space-y-2 text-sm">
                            <input
                              className="w-full rounded border px-2 py-1"
                              placeholder="როლი"
                              value={job.role}
                              onChange={(e) => {
                                const next = [...workList]
                                next[index] = { ...next[index], role: e.target.value }
                                setLocalCV((p) => ({ ...p, work_experience: next }))
                              }}
                            />
                            <input
                              className="w-full rounded border px-2 py-1"
                              placeholder="კომპანია"
                              value={job.company}
                              onChange={(e) => {
                                const next = [...workList]
                                next[index] = { ...next[index], company: e.target.value }
                                setLocalCV((p) => ({ ...p, work_experience: next }))
                              }}
                            />
                            <div className="flex gap-2">
                              <input
                                type="date"
                                className="flex-1 rounded border px-2 py-1"
                                value={job.start_date?.slice(0, 10) ?? ""}
                                onChange={(e) => {
                                  const next = [...workList]
                                  next[index] = { ...next[index], start_date: e.target.value }
                                  setLocalCV((p) => ({ ...p, work_experience: next }))
                                }}
                              />
                              <input
                                type="date"
                                disabled={job.is_current}
                                className="flex-1 rounded border px-2 py-1 disabled:bg-slate-100"
                                value={job.end_date?.slice(0, 10) ?? ""}
                                onChange={(e) => {
                                  const next = [...workList]
                                  next[index] = { ...next[index], end_date: e.target.value }
                                  setLocalCV((p) => ({ ...p, work_experience: next }))
                                }}
                              />
                            </div>
                            <label className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={Boolean(job.is_current)}
                                onChange={(e) => {
                                  const next = [...workList]
                                  next[index] = { ...next[index], is_current: e.target.checked, end_date: e.target.checked ? "" : next[index].end_date }
                                  setLocalCV((p) => ({ ...p, work_experience: next }))
                                }}
                              />
                              მიმდინარე
                            </label>
                            <textarea
                              className="w-full rounded border px-2 py-1"
                              rows={3}
                              placeholder="აღწერა"
                              value={job.description}
                              onChange={(e) => {
                                const next = [...workList]
                                next[index] = { ...next[index], description: e.target.value }
                                setLocalCV((p) => ({ ...p, work_experience: next }))
                              }}
                            />
                          </div>
                        ) : readOnly ? (
                          <>
                            {(truthyStr(job.role) || truthyStr(job.company)) ? (
                              <p className="font-semibold text-gray-900">
                                {[job.role, job.company].filter(truthyStr).join(" — ")}
                              </p>
                            ) : null}
                            {dates ? <p className="mb-2 text-xs text-gray-500">{dates}</p> : null}
                            {truthyStr(job.description) ? <p className="text-sm text-gray-800">{job.description}</p> : null}
                          </>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </section>
            ) : null}

            {showEducation ? (
              <section className="border-t border-gray-200 pt-5">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">განათლება</h3>
                  {!readOnly ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-blue-600"
                      onClick={() =>
                        setLocalCV((p) => ({
                          ...p,
                          education: [...eduList, { school: "", degree: "", field_of_study: "", end_date: "" }],
                        }))
                      }
                    >
                      + დამატება
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 space-y-3">
                  {eduList.map((edu, index) => {
                    const hasContent =
                      truthyStr(edu.school) || truthyStr(edu.degree) || truthyStr(edu.field_of_study) || truthyStr(edu.end_date)
                    if (readOnly && !hasContent) return null
                    const editing = editingEduIdx === index && !readOnly
                    return (
                      <div key={`edu-${index}`} className="rounded border border-gray-100 p-4">
                        <div className="mb-2 flex justify-end gap-1">
                          {!readOnly ? (
                            <>
                              <PencilButton onClick={() => setEditingEduIdx(editing ? null : index)} label="რედაქტირება" />
                              <button
                                type="button"
                                className="text-xs text-red-600"
                                onClick={() =>
                                  setLocalCV((p) => ({
                                    ...p,
                                    education: eduList.filter((_, i) => i !== index),
                                  }))
                                }
                              >
                                წაშლა
                              </button>
                            </>
                          ) : null}
                        </div>
                        {editing ? (
                          <div className="space-y-2 text-sm">
                            <input
                              className="w-full rounded border px-2 py-1"
                              placeholder="სასწავლებელი"
                              value={edu.school}
                              onChange={(e) => {
                                const next = [...eduList]
                                next[index] = { ...next[index], school: e.target.value }
                                setLocalCV((p) => ({ ...p, education: next }))
                              }}
                            />
                            <input
                              className="w-full rounded border px-2 py-1"
                              placeholder="ხარისხი (მაგ. ბაკალავრი)"
                              value={edu.degree}
                              onChange={(e) => {
                                const next = [...eduList]
                                next[index] = { ...next[index], degree: e.target.value }
                                setLocalCV((p) => ({ ...p, education: next }))
                              }}
                            />
                            <input
                              className="w-full rounded border px-2 py-1"
                              placeholder="მიმართულება"
                              value={edu.field_of_study}
                              onChange={(e) => {
                                const next = [...eduList]
                                next[index] = { ...next[index], field_of_study: e.target.value }
                                setLocalCV((p) => ({ ...p, education: next }))
                              }}
                            />
                            <input
                              type="date"
                              className="w-full rounded border px-2 py-1"
                              value={edu.end_date?.slice(0, 10) ?? ""}
                              onChange={(e) => {
                                const next = [...eduList]
                                next[index] = { ...next[index], end_date: e.target.value }
                                setLocalCV((p) => ({ ...p, education: next }))
                              }}
                            />
                          </div>
                        ) : (
                          <>
                            {truthyStr(edu.degree) || truthyStr(edu.field_of_study) ? (
                              <p className="font-semibold text-gray-900">{[edu.degree, edu.field_of_study].filter(truthyStr).join(" — ")}</p>
                            ) : null}
                            {truthyStr(edu.school) ? <p className="text-sm text-gray-700">{edu.school}</p> : null}
                            {truthyStr(edu.end_date) ? (
                              <p className="text-xs text-gray-500">{formatGeorgianMonthYear(String(edu.end_date))}</p>
                            ) : null}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            ) : null}
          </main>
        </article>
      </div>
    </div>
  )
}
