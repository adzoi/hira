type EmptyStateProps = {
  message: string
  actionLabel?: string
  onAction?: () => void
}

export default function EmptyState({ message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
      <p className="text-lg font-semibold text-[#1B2B4B]">{message}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 h-11 rounded-lg bg-[#1B2B4B] px-4 text-sm font-semibold text-white hover:bg-[#D4A843] hover:text-[#1B2B4B]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
