type SkeletonCardProps = {
  lines?: number
  avatar?: boolean
  className?: string
}

export default function SkeletonCard({ lines = 3, avatar = false, className = "" }: SkeletonCardProps) {
  return (
    <div className={`animate-pulse rounded-2xl border border-slate-200 bg-white p-4 ${className}`}>
      {avatar ? <div className="h-14 w-14 rounded-full bg-slate-200" /> : null}
      <div className={`${avatar ? "mt-3" : ""} h-4 w-2/3 rounded bg-slate-200`} />
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className="mt-2 h-3 rounded bg-slate-200" />
      ))}
      <div className="mt-4 h-10 rounded bg-slate-200" />
    </div>
  )
}
