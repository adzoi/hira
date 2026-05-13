type FreelancerAvailabilityIndicatorProps = {
  available: boolean
  /** Shown in tooltip when available */
  labelWhenAvailable: string
  /** Shown in tooltip when unavailable */
  labelWhenUnavailable: string
}

/**
 * Green dot + check (available) or red dot + X (unavailable). Tooltip on hover / keyboard focus.
 */
export default function FreelancerAvailabilityIndicator({
  available,
  labelWhenAvailable,
  labelWhenUnavailable,
}: FreelancerAvailabilityIndicatorProps) {
  const label = available ? labelWhenAvailable : labelWhenUnavailable

  return (
    <span
      className="group/av pointer-events-auto absolute left-2 top-2 z-20 outline-none"
      tabIndex={0}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-white shadow-md ring-1 ring-black/5 ${
          available ? "bg-emerald-500 text-white" : "bg-red-600 text-white"
        }`}
        aria-hidden
      >
        {available ? (
          <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path
              d="M2.5 7L5.5 10 11.5 3.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </span>
      <span className="sr-only">{label}</span>
      <span
        className="pointer-events-none invisible absolute left-0 top-full z-30 mt-1.5 w-max max-w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-xs font-medium leading-snug text-slate-800 shadow-lg opacity-0 transition-[opacity,visibility] duration-150 group-hover/av:visible group-hover/av:opacity-100 group-focus-within/av:visible group-focus-within/av:opacity-100"
        role="tooltip"
      >
        {label}
      </span>
    </span>
  )
}
