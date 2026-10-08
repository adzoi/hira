import { Link } from "react-router-dom"

type EmptyStateProps = {
  message: string
  /** Supporting line under the message. */
  hint?: string
  actionLabel?: string
  onAction?: () => void
  /** Primary call to action, rendered as a link (e.g. "Post a job"). */
  ctaLabel?: string
  ctaTo?: string
}

export default function EmptyState({ message, hint, actionLabel, onAction, ctaLabel, ctaTo }: EmptyStateProps) {
  const hasCta = Boolean(ctaLabel && ctaTo)
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
      <p className="text-lg font-semibold text-[#1B2B4B]">{message}</p>
      {hint ? <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{hint}</p> : null}
      {hasCta || (actionLabel && onAction) ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          {hasCta ? (
            <Link
              to={ctaTo!}
              className="inline-flex h-11 items-center rounded-lg bg-[#0088FF] px-5 text-sm font-semibold text-white hover:bg-[#006ACC]"
            >
              {ctaLabel}
            </Link>
          ) : null}
          {actionLabel && onAction ? (
            <button
              type="button"
              onClick={onAction}
              className={
                hasCta
                  ? "h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-[#1B2B4B] hover:border-slate-400"
                  : "h-11 rounded-lg bg-[#1B2B4B] px-4 text-sm font-semibold text-white hover:bg-[#D4A843] hover:text-[#1B2B4B]"
              }
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
