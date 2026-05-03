import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { loadHomeFeed, type HomeFeedItem, type HomeFreelancerServiceItem, type HomeJobListingItem } from "../lib/homeFeed.ts"

function getInitials(fullName: string) {
  const parts = fullName.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "ფ"
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
}

function formatRelativeTime(dateString: string) {
  const diffMs = Date.now() - new Date(dateString).getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / minute))} წუთის წინ`
  if (diffMs < day) return `${Math.max(1, Math.floor(diffMs / hour))} საათის წინ`
  if (diffMs < 30 * day) return `${Math.max(1, Math.floor(diffMs / day))} დღის წინ`
  return new Date(dateString).toLocaleDateString("ka-GE")
}

function jobBudgetLabel(job: HomeJobListingItem) {
  const format = (value: number | null) => (value ?? 0).toLocaleString("en-US")
  if (job.budgetType === "hourly") return `₾${job.budgetMin ?? 0}/საათი`
  if (job.budgetType === "monthly") return `₾${format(job.budgetMin)}/თვე`
  return `₾${format(job.budgetMin)} - ₾${format(job.budgetMax)}`
}

function locationGlyph(type: string) {
  return type === "remote" ? "🌐" : "📍"
}

const LOCATION_LABELS: Record<string, string> = {
  remote: "დისტანციური",
  tbilisi: "თბილისი",
  hybrid: "შერეული",
  anywhere: "ნებისმიერი",
}

const DURATION_LABELS: Record<string, string> = {
  one_time: "ერთჯერადი",
  ongoing: "მიმდინარე",
}

function deadlineShort(dateString: string) {
  return new Date(dateString).toLocaleDateString("ka-GE", { day: "2-digit", month: "short" })
}

function isDeadlineSoon(dateString: string) {
  const diff = new Date(dateString).getTime() - Date.now()
  return diff > 0 && diff <= 3 * 24 * 60 * 60 * 1000
}

/** Long tokens (no spaces / URLs) must stay inside marketplace cards — grid/flex defaults allow overflow otherwise. */
const wrapText = "min-w-0 break-words [overflow-wrap:anywhere]"

const PAGE_SIZE = 20

function FreelancerFeedCard({ item }: { item: HomeFreelancerServiceItem }) {
  const negotiable = item.priceNegotiable
  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#D4A843]/70">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900">
          ფრილანსერი · სერვისი
        </span>
        <span className="text-xs font-semibold text-[#D4A843]" title="საშუალო შეფასება">
          ★ {item.averageRating.toFixed(1)}
        </span>
      </div>
      <Link to={`/freelancer/${encodeURIComponent(item.freelancerSlug)}`} className="group mt-3 flex shrink-0 items-center gap-3">
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-bold text-[#1B2B4B]">
          {item.avatarUrl ? (
            <img src={item.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            getInitials(item.fullName)
          )}
        </span>
        <div className="min-w-0 text-left">
          <p className="truncate text-sm font-bold text-[#1B2B4B] group-hover:text-[#D4A843]">{item.fullName}</p>
          <p className="truncate text-xs text-slate-600">{item.professionalTitle || "ფრილანსერი"}</p>
        </div>
      </Link>
      <h2 className={`mt-3 line-clamp-2 text-base font-extrabold text-[#1B2B4B] ${wrapText}`}>{item.title}</h2>
      <p className={`mt-2 flex-1 text-sm leading-relaxed text-slate-700 ${wrapText}`}>{item.descriptionPreview}</p>
      {item.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className={`max-w-full rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ${wrapText}`}
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-2 border-t border-slate-100 pt-3">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">{negotiable ? "ფასი" : "ფასი / ვადა"}</p>
          <p className="text-lg font-extrabold text-[#1B2B4B]">
            {negotiable ? "შეთანხმებით" : `${item.price.toLocaleString("ka-GE")} ₾`}
          </p>
          {!negotiable ? <p className="text-xs text-slate-600">{item.deliveryDays} სამუშაო დღე</p> : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Link
            to={`/listings?open=${encodeURIComponent(item.id)}`}
            className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-[#1B2B4B] transition hover:border-[#D4A843]"
          >
            ლისტინგი
          </Link>
          <Link
            to={`/freelancer/${encodeURIComponent(item.freelancerSlug)}`}
            className="inline-flex h-10 items-center rounded-lg bg-[#1B2B4B] px-4 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B]"
          >
            პროფილი
          </Link>
        </div>
      </div>
    </li>
  )
}

function JobListingFeedCard({ item }: { item: HomeJobListingItem }) {
  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#D4A843]/70">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <span className="min-w-0 rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] font-bold uppercase leading-tight tracking-wide text-violet-900">
          დამქირავებლის განცხადება
        </span>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {item.isUrgent ? (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">გადაუდებელი</span>
          ) : null}
          <span className="text-xs font-semibold text-[#D4A843]" title="დამქირავებლის საშუალო შეფასება">
            ★ {item.hirerAverageRating.toFixed(1)}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-bold text-[#1B2B4B]">
          {item.companyAvatar ? (
            <img src={item.companyAvatar} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            getInitials(item.companyName)
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-[#1B2B4B]">{item.companyName}</p>
          <p className={`text-xs text-slate-500 ${wrapText}`}>
            {item.city ?? "ლოკაცია უცნობია"} · {formatRelativeTime(item.createdAt)}
          </p>
        </div>
      </div>

      <Link
        to={`/job/${encodeURIComponent(item.id)}`}
        className={`mt-3 block line-clamp-2 text-base font-extrabold text-[#1B2B4B] hover:text-[#D4A843] ${wrapText}`}
      >
        {item.title}
      </Link>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <span
          className={`max-w-full rounded-full border border-[#D4A843]/70 px-2 py-0.5 text-[11px] font-semibold text-[#1B2B4B] ${wrapText}`}
        >
          {item.categoryName}
        </span>
        {item.subcategoryName ? (
          <span className={`max-w-full rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 ${wrapText}`}>
            {item.subcategoryName}
          </span>
        ) : null}
      </div>

      <p className={`mt-2 flex-1 text-sm leading-relaxed text-slate-700 ${wrapText}`}>{item.descriptionPreview}</p>

      {item.skillNames.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.skillNames.slice(0, 4).map((name) => (
            <span key={name} className={`max-w-full rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 ${wrapText}`}>
              {name}
            </span>
          ))}
          {item.skillNames.length > 4 ? (
            <span className="text-[11px] font-medium text-slate-500">+{item.skillNames.length - 4}</span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex min-w-0 flex-wrap gap-1.5 border-t border-slate-100 pt-3 text-[11px]">
        <span className={`max-w-full rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-[#1B2B4B] ${wrapText}`}>
          {jobBudgetLabel(item)}
        </span>
        <span className={`max-w-full rounded-full bg-slate-100 px-2 py-0.5 ${wrapText}`}>{DURATION_LABELS[item.durationType] ?? item.durationType}</span>
        <span className={`max-w-full rounded-full bg-slate-100 px-2 py-0.5 ${wrapText}`}>
          {locationGlyph(item.locationType)} {LOCATION_LABELS[item.locationType] ?? item.locationType}
        </span>
        <span className={`max-w-full rounded-full bg-slate-100 px-2 py-0.5 ${wrapText}`}>{item.applicantsCount} განმცხადებელი</span>
        {item.applicationDeadline ? (
          <span
            className={`rounded-full px-2 py-0.5 ${isDeadlineSoon(item.applicationDeadline) ? "bg-red-100 font-semibold text-red-700" : "bg-slate-100 text-slate-700"}`}
          >
            ვადა: {deadlineShort(item.applicationDeadline)}
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to={`/job/${encodeURIComponent(item.id)}`}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-[#1B2B4B] px-4 text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B] sm:flex-none"
        >
          განცხადება
        </Link>
      </div>
    </li>
  )
}

export default function HomeFeedSection() {
  const navigate = useNavigate()
  const [items, setItems] = useState<HomeFeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const data = await loadHomeFeed()
        if (!cancelled) {
          setItems(data)
          setVisibleCount(PAGE_SIZE)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const visible = items.slice(0, visibleCount)
  const hasMore = visible.length < items.length

  return (
    <section className="border-y border-slate-200 bg-[#F8F9FC]">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-6 md:py-14">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-[#D4A843]">მარკეტპლეისი</p>
            <h2 className="mt-2 text-2xl font-extrabold text-[#1B2B4B] md:text-[28px]">სერვისები და სამუშაოები</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              ფრილანსერების შემოთავაზებული სერვისები და დამქირავებლების განცხადებები — სრულად იხილეთ შესაბამის კატალოგებში.
            </p>
          </div>
          <div className="w-full shrink-0 lg:w-auto lg:max-w-none">
            <div className="-mx-1 flex flex-nowrap items-center gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:justify-end [&::-webkit-scrollbar]:hidden">
              <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-lg bg-[#1B2B4B] px-3 py-2 text-xs font-semibold text-white shadow-sm sm:px-4 sm:text-sm">
                ყველა
              </span>
              <button
                type="button"
                onClick={() => navigate("/listings")}
                className="shrink-0 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#1B2B4B] transition hover:border-[#D4A843] sm:px-4 sm:text-sm"
              >
                სერვისების კატალოგი
              </button>
              <button
                type="button"
                onClick={() => navigate("/jobs")}
                className="shrink-0 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#1B2B4B] transition hover:border-[#D4A843] sm:px-4 sm:text-sm"
              >
                სამუშაოები
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-slate-200/60" />
            ))}
          </ul>
        ) : visible.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            ჯერ არ არის შეთავაზება. იხილეთ{" "}
            <Link className="font-semibold text-[#D4A843] underline" to="/listings">
              სერვისების კატალოგი
            </Link>{" "}
            ან{" "}
            <Link className="font-semibold text-[#D4A843] underline" to="/jobs">
              სამუშაოები
            </Link>
            .
          </p>
        ) : (
          <>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((item) =>
                item.kind === "freelancer_service" ? (
                  <FreelancerFeedCard key={`f-${item.id}`} item={item} />
                ) : (
                  <JobListingFeedCard key={`j-${item.id}`} item={item} />
                ),
              )}
            </ul>
            {hasMore ? (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="rounded-lg border border-[#D4A843] px-6 py-3 text-sm font-semibold text-[#1B2B4B] transition hover:bg-amber-50"
                >
                  მეტის ჩატვირთვა
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
