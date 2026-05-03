import { createContext, useCallback, useContext, useMemo, useState } from "react"

type ToastType = "success" | "error" | "info"
type ToastInput = { type: ToastType; message: string }
type ToastItem = ToastInput & { id: string }

type ToastContextValue = {
  pushToast: (input: ToastInput) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const typeClasses: Record<ToastType, string> = {
  success: "border-[#2ECC71]/30 bg-[#2ECC71]/10 text-[#166534]",
  error: "border-[#EF4444]/30 bg-[#EF4444]/10 text-[#991b1b]",
  info: "border-[#1B2B4B]/30 bg-[#1B2B4B]/10 text-[#1B2B4B]",
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const pushToast = useCallback(
    ({ type, message }: ToastInput) => {
      const id = crypto.randomUUID()
      setToasts((prev) => [...prev, { id, type, message }])
      window.setTimeout(() => removeToast(id), 4000)
    },
    [removeToast],
  )

  const value = useMemo(() => ({ pushToast }), [pushToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto animate-[slideInRight_0.25s_ease] rounded-xl border p-3 shadow-lg ${typeClasses[toast.type]}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{toast.message}</p>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="text-xs font-semibold opacity-80 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider")
  }
  return ctx
}
