type Props = {
  error: unknown
  resetError: () => void
}

export default function SentryErrorFallback({ error, resetError }: Props) {
  const message = error instanceof Error ? error.message : String(error)

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-neutral-900">Something went wrong</h1>
      <p className="text-sm text-neutral-600">An unexpected error occurred. Please try again.</p>
      {import.meta.env.DEV ? (
        <pre className="max-w-full overflow-x-auto rounded-md bg-neutral-100 p-3 text-left text-xs text-neutral-700">
          {message}
        </pre>
      ) : null}
      <button
        type="button"
        onClick={() => resetError()}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Try again
      </button>
    </div>
  )
}
