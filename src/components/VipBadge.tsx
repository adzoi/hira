/** Pill badge for active VIP placement — same design on every marketplace card. */
export default function VipBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`shrink-0 rounded-full bg-[#E8F4FF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0088FF] ${className}`.trim()}
    >
      VIP
    </span>
  )
}
