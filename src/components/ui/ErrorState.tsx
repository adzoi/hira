type ErrorStateProps = {
  message?: string
  onRetry?: () => void
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
      <p className="text-2xl">❗</p>
      <p className="mt-2 text-lg font-semibold">რაღაც შეფერხება მოხდა</p>
      {message ? <p className="mt-2 text-sm text-red-600/90">{message}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 h-11 rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold text-red-700"
        >
          თავიდან ცდა
        </button>
      ) : null}
    </div>
  )
}
