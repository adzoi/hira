import type { ReactNode } from "react"

type FreelancerAvailabilityIndicatorProps = {
  available: boolean
  /** Shown in tooltip when available */
  labelWhenAvailable: string
  /** Shown in tooltip when unavailable */
  labelWhenUnavailable: string
  children: ReactNode
  className?: string
}

/**
 * Instagram-style ring around the avatar: green when available, red when unavailable.
 * Tooltip on hover / keyboard focus.
 */
export default function FreelancerAvailabilityIndicator({
  available,
  labelWhenAvailable,
  labelWhenUnavailable,
  children,
  className = "",
}: FreelancerAvailabilityIndicatorProps) {
  const label = available ? labelWhenAvailable : labelWhenUnavailable

  return (
    <span
      className={`group/av relative inline-flex shrink-0 outline-none ${className}`.trim()}
      tabIndex={0}
    >
      <span
        className={`inline-flex rounded-full p-[2.5px] ${available ? "bg-emerald-500" : "bg-red-600"}`}
        aria-hidden
      >
        <span className="inline-flex rounded-full bg-white p-[2px]">{children}</span>
      </span>
      <span className="sr-only">{label}</span>
      <span
        className="pointer-events-none invisible absolute left-1/2 top-full z-30 mt-1.5 w-max max-w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-xs font-medium leading-snug text-slate-800 shadow-lg opacity-0 transition-[opacity,visibility] duration-150 group-hover/av:visible group-hover/av:opacity-100 group-focus-within/av:visible group-focus-within/av:opacity-100"
        role="tooltip"
      >
        {label}
      </span>
    </span>
  )
}
