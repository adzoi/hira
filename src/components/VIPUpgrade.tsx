import { PayPalButtons } from "@paypal/react-paypal-js"
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type PointerEvent } from "react"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { VIP_JOB_TIERS, vipTierPayPalUsd, type VipJobTier } from "../lib/vipJobTiers.ts"

const PAYPAL_E2E_DIAG = import.meta.env.VITE_PAYPAL_E2E_DIAG === "1"

type VIPUpgradeProps = {
  open: boolean
  jobId: string
  jobTitle: string
  listingType?: "job" | "freelancer"
  onClose: () => void
  onSuccess: () => void
  /** When set (e.g. `/checkout`), only these tiers render — one Smart Buttons instance for stable E2E. */
  tiers?: VipJobTier[]
  /**
   * E2E only: after capture, skip `activate-vip` when `VITE_PAYPAL_E2E_DIAG=1` so sandbox runs without Supabase.
   * Never rely on this in production user flows.
   */
  e2eSkipServerActivation?: boolean
}

/** Mount/render diagnostics for Playwright; no-ops unless `VITE_PAYPAL_E2E_DIAG=1`. */
function E2EPayPalButtons(props: ComponentProps<typeof PayPalButtons>) {
  useEffect(() => {
    if (!PAYPAL_E2E_DIAG) return undefined
    console.log("[E2E] PayPalButtons mounted")
    return () => {
      console.log("[E2E] PayPalButtons unmounted")
    }
  }, [])

  if (PAYPAL_E2E_DIAG) {
    console.log("[E2E] PayPalButtons render")
  }

  return <PayPalButtons {...props} />
}

const TIER_ORDER: VipJobTier[] = ["bronze", "silver", "gold"]

const TIER_LABELS: Record<VipJobTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
}

/**
 * Log the full failure for engineers; return a short Georgian message for UI.
 * Never rethrow from here — callers own promise control flow.
 */
function logAndNormalizeUserMessage(phase: string, err: unknown): string {
  const detail =
    err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : { raw: typeof err === "object" && err !== null ? JSON.stringify(err) : String(err) }
  console.error(`[VIPUpgrade] ${phase}`, detail, err)

  if (err instanceof Error) {
    const m = err.message.trim()
    if (m.length > 0 && m.length < 200 && !m.includes("token") && !m.includes("smart/api")) {
      return m
    }
  }
  return "გადახდა ვერ დასრულდა. სცადე თავიდან ან განაახლე გვერდი."
}

type VipTierPayPalPanelProps = {
  tier: VipJobTier
  jobId: string
  jobTitle: string
  listingType?: "job" | "freelancer"
  onPaid: () => void
  onError: (message: string) => void
  e2eSkipServerActivation?: boolean
  /** true while PayPal order/create → capture session is active — blocks modal close (state lives in parent). */
  onCheckoutSessionChange: (locked: boolean) => void
}

/**
 * Builds the PayPal order payload outside the SDK callback so `createOrder` stays deterministic
 * and easy to reason about (same inputs → same order shape).
 */
function buildVipOrderPayload(jobId: string, tier: VipJobTier, jobTitle: string, priceUsd: number) {
  return {
    intent: "CAPTURE" as const,
    purchase_units: [
      {
        reference_id: jobId,
        description: `VIP ${tier} — ${jobTitle.slice(0, 120)}`,
        amount: {
          currency_code: "USD" as const,
          value: priceUsd.toFixed(2),
        },
      },
    ],
  }
}

/**
 * Single PayPal Smart Buttons instance per checkout — avoids three parallel zoid stacks fighting one buyer session.
 * Memoized; parent must not swap tier key mid-flight (tier selection is separate from this panel).
 */
const VipTierPayPalPanel = memo(function VipTierPayPalPanel({
  tier,
  jobId,
  jobTitle,
  listingType = "job",
  onPaid,
  onError,
  e2eSkipServerActivation,
  onCheckoutSessionChange,
}: VipTierPayPalPanelProps) {
  const { t } = useTranslation()
  const cfg = VIP_JOB_TIERS[tier]

  /**
   * Prevents overlapping `onApprove` handlers (double submit / race).
   * Ref updates do NOT cause re-renders, so they are safe DURING the PayPal capture phase.
   */
  const paymentFlowLockRef = useRef(false)

  const payUsd = vipTierPayPalUsd(tier)

  const orderPayload = useMemo(
    () => buildVipOrderPayload(jobId, tier, jobTitle, payUsd),
    [jobId, tier, jobTitle, payUsd],
  )

  /**
   * Calls Supabase AFTER PayPal capture succeeds. Throws on failure so `onApprove` can use try/catch
   * without calling `onPaid()` until both capture + activation succeed.
   */
  const invokeActivate = useCallback(async (orderID: string): Promise<void> => {
    if (PAYPAL_E2E_DIAG) {
      console.log("[VIPUpgrade] invokeActivate request:", {
        orderID,
        job_id: jobId,
        listing_type: listingType,
        tier,
        function: "activate-vip",
      })
    }

    if (PAYPAL_E2E_DIAG && e2eSkipServerActivation) {
      console.log("[E2E] Skipping activate-vip (diagnostic checkout)")
      return
    }

    const trimmed = orderID.trim()
    if (!trimmed) {
      console.error("[VIPUpgrade] invokeActivate: empty orderID")
      throw new Error("ORDER_ID_EMPTY")
    }

    if (!isSupabaseConfigured || !supabase) {
      throw new Error("SUPABASE_NOT_CONFIGURED")
    }

    const { data, error } = await supabase.functions.invoke("activate-vip", {
      body: { order_id: trimmed, job_id: jobId, tier, listing_type: listingType },
    })

    if (error) {
      try {
        const body = await error.context?.json()
        console.error("[VIPUpgrade] invokeActivate response body:", body)
      } catch {
        try {
          const text = await error.context?.text()
          console.error("[VIPUpgrade] invokeActivate response text:", text)
        } catch {
          console.error("[VIPUpgrade] invokeActivate raw error context:", error.context)
        }
      }
      console.error("[VIPUpgrade] invokeActivate response status:", error.context?.status ?? "unknown")
    } else if (PAYPAL_E2E_DIAG) {
      console.log("[VIPUpgrade] invokeActivate response status:", "ok")
      console.log("[VIPUpgrade] invokeActivate response body:", data)
    }

    if (error) {
      console.error("[VIPUpgrade] activate-vip invoke", error)
      throw error
    }

    const payload = data as { ok?: boolean; error?: string }
    if (!payload?.ok) {
      console.error("[VIPUpgrade] activate-vip response", data)
      throw new Error(typeof payload?.error === "string" ? payload.error : "ACTIVATE_FAILED")
    }
  }, [e2eSkipServerActivation, jobId, listingType, tier])

  /**
   * Lock modal teardown as soon as PayPal begins order creation (before approval UI completes).
   * Cleared on SDK cancel/error or when capture chain settles (`.finally`).
   */
  const createOrder = useCallback(
    (_data: unknown, actions: { order: { create: (payload: typeof orderPayload) => Promise<string> } }) => {
      onCheckoutSessionChange(true)
      return actions.order.create(orderPayload).catch((err: unknown) => {
        onCheckoutSessionChange(false)
        throw err
      })
    },
    [onCheckoutSessionChange, orderPayload],
  )

  /**
   * Order capture runs on the server (`paypal-capture` Edge Function) to avoid client-side
   * `actions.order.capture()` / buyer access token issues. After capture succeeds, `invokeActivate` runs
   * as before. Do not call setState on the PayPal buttons subtree before this async flow finishes.
   */
  const onApprove = useCallback(
    (data: { orderID?: string }, _actions: { order?: { capture: () => Promise<unknown> } }) => {
      if (PAYPAL_E2E_DIAG) {
        console.log("[E2E] ONAPPROVE_HIT", { orderID: data.orderID })
      }

      const orderID = data.orderID
      if (typeof orderID !== "string" || !orderID.trim()) {
        console.error("[VIPUpgrade] onApprove: missing orderID", data)
        onError("შეკვეთის იდენტიფიკატორი ვერ მოიძებნა — სცადე თავიდან.")
        onCheckoutSessionChange(false)
        return Promise.reject(new Error("Missing orderID"))
      }

      const trimmedOrderId = orderID.trim()

      if (paymentFlowLockRef.current) {
        console.warn("[VIPUpgrade] Duplicate onApprove ignored (flow already in progress)")
        return Promise.resolve()
      }
      paymentFlowLockRef.current = true

      return (async () => {
        try {
          if (!isSupabaseConfigured || !supabase) {
            throw new Error("SUPABASE_NOT_CONFIGURED")
          }

          const { data: capData, error: capError } = await supabase.functions.invoke("paypal-capture", {
            body: { orderID: trimmedOrderId, job_id: jobId, listing_type: listingType },
          })

          if (capError) {
            try {
              const body = await capError.context?.json()
              console.error("[paypal-capture] error body:", body)
            } catch {
              try {
                const text = await capError.context?.text()
                console.error("[paypal-capture] error text:", text)
              } catch {
                console.error("[paypal-capture] raw error:", capError)
              }
            }
            console.error("[VIPUpgrade] paypal-capture invoke", capError)
            throw capError
          }

          const payload = capData as { status?: string; error?: string }
          if (payload?.status !== "COMPLETED") {
            throw new Error(typeof payload?.error === "string" ? payload.error : "Capture failed")
          }

          if (PAYPAL_E2E_DIAG) {
            console.log("[E2E] PAYPAL_CAPTURE_RESOLVED")
          }

          try {
          if (PAYPAL_E2E_DIAG) {
            console.log("[VIPUpgrade] invokeActivate starting, orderID:", data.orderID)
          }
            const result = await invokeActivate(trimmedOrderId)
          if (PAYPAL_E2E_DIAG) {
            console.log("[VIPUpgrade] invokeActivate result:", JSON.stringify(result))
          }
            onPaid()
          } catch (err) {
            console.error("[VIPUpgrade] invokeActivate failed:", err)
            console.error(
              "[VIPUpgrade] invokeActivate error message:",
              err instanceof Error ? err.message : String(err),
            )
            console.error(
              "[VIPUpgrade] invokeActivate error details:",
              JSON.stringify(
                err instanceof Error
                  ? { name: err.name, message: err.message, stack: err.stack }
                  : err,
              ),
            )
            console.error("[VIPUpgrade] server activation failed", err)
            onError("Server activation failed")
          }
        } catch (err: unknown) {
          if (PAYPAL_E2E_DIAG) {
            console.log("[E2E] PAYPAL_CAPTURE_REJECTED", err instanceof Error ? err.message : String(err))
          }
          console.error("PayPal capture failed", err)
          onError(logAndNormalizeUserMessage("capture", err))
        } finally {
          paymentFlowLockRef.current = false
          onCheckoutSessionChange(false)
        }
      })()
    },
    [invokeActivate, onCheckoutSessionChange, onError, onPaid],
  )

  const onPayPalButtonsError = useCallback(
    (err: unknown) => {
      onCheckoutSessionChange(false)
      console.error("[VIPUpgrade] PayPalButtons onError", err)
      onError("PayPal შეცდომა — სცადე თავიდან ან განაახლე გვერდი.")
    },
    [onCheckoutSessionChange, onError],
  )

  const onCancel = useCallback(() => {
    onCheckoutSessionChange(false)
    console.info("[VIPUpgrade] Buyer cancelled PayPal checkout")
  }, [onCheckoutSessionChange])

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-lg font-bold text-[#1B2B4B]">{TIER_LABELS[tier]} · გადახდა</p>
      <p className="mt-1 text-sm text-slate-600">
        ₾{cfg.priceGel} (~${payUsd} USD PayPal) · {t("vip.daysFeatured", { days: cfg.days })}
      </p>
      <p className="mt-2 text-xs text-slate-500">PayPal · {cfg.currency}</p>
      <div className="mt-4 min-h-[140px]">
        {/*
          No `disabled` prop tied to capture/post-capture state: disabling mid-flow remounts internal
          Smart Button state and can drop the buyer token for capture.
        */}
        <E2EPayPalButtons
          style={{ layout: "vertical", label: "pay" }}
          createOrder={createOrder}
          onApprove={onApprove}
          onError={onPayPalButtonsError}
          onCancel={onCancel}
        />
      </div>
    </div>
  )
})

VipTierPayPalPanel.displayName = "VipTierPayPalPanel"

export default function VIPUpgrade({
  open,
  jobId,
  jobTitle,
  listingType = "job",
  onClose,
  onSuccess,
  tiers: tiersProp,
  e2eSkipServerActivation,
}: VIPUpgradeProps) {
  const { t } = useTranslation()
  const [message, setMessage] = useState("")
  const [sdkIssue, setSdkIssue] = useState("")
  const [selectedTier, setSelectedTier] = useState<VipJobTier | null>(null)
  /** True from Smart Buttons createOrder through capture/cancel/error — blocks modal teardown only (single PayPal mount). */
  const [checkoutLocked, setCheckoutLocked] = useState(false)

  const tiersToShow = useMemo((): VipJobTier[] => {
    if (!tiersProp?.length) return TIER_ORDER
    const filtered = tiersProp.filter((t): t is VipJobTier => TIER_ORDER.includes(t))
    return filtered.length > 0 ? filtered : TIER_ORDER
  }, [tiersProp])

  useEffect(() => {
    if (!open) return
    setCheckoutLocked(false)
    if (tiersToShow.length === 1) {
      setSelectedTier(tiersToShow[0])
    } else {
      setSelectedTier(null)
    }
  }, [open, tiersToShow])

  const handleCheckoutSessionChange = useCallback((locked: boolean) => {
    setCheckoutLocked(locked)
  }, [])

  const clearSdkIssueSoon = useCallback((msg: string) => {
    setSdkIssue(msg)
    window.setTimeout(() => setSdkIssue(""), 8000)
  }, [])

  const handlePaid = useCallback(() => {
    setMessage(t("vip.success"))
    onSuccess()
    window.setTimeout(() => {
      setMessage("")
      onClose()
    }, 1200)
  }, [onClose, onSuccess, t])

  const handleTierError = useCallback(
    (msg: string) => {
      clearSdkIssueSoon(msg)
    },
    [clearSdkIssueSoon],
  )

  const requestClose = useCallback(() => {
    if (checkoutLocked) return
    onClose()
  }, [checkoutLocked, onClose])

  const handleBackdropPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return
      requestClose()
    },
    [requestClose],
  )

  if (!open) return null

  const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID
  if (typeof paypalClientId !== "string" || !paypalClientId.trim()) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
          <p className="text-sm text-red-600">PayPal client ID არ არის დაყენებული (VITE_PAYPAL_CLIENT_ID).</p>
          <button type="button" onClick={onClose} className="mt-4 text-sm font-semibold text-[#1B2B4B] underline">
            {t("common.close")}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onPointerDown={handleBackdropPointerDown}
    >
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-[#F8F9FC] p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-[#1B2B4B]">{t("vip.heading")}</h2>
            <p className="mt-1 text-sm text-slate-600 line-clamp-2">{jobTitle}</p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t("common.close")}
            disabled={checkoutLocked}
            title={checkoutLocked ? "დახურვა შესაძლებელია გადახდის დასრულების შემდეგ" : undefined}
          >
            ×
          </button>
        </div>

        {checkoutLocked ? (
          <p className="mt-2 text-xs text-amber-800">გადახდა მიმდინარეობს — არ დახურო ფანჯარა.</p>
        ) : null}

        {sdkIssue ? <p className="mt-3 text-sm text-red-600">{sdkIssue}</p> : null}
        {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}

        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-slate-800">
          ტესტირებისთვის გადახდა USD-ში ხდება. რეალურ რეჟიმში GEL იმუშავებს.
        </p>

        <p className="mt-4 text-sm font-semibold text-[#1B2B4B]">{t("vip.choosePlan")}</p>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {tiersToShow.map((tier) => {
            const cfg = VIP_JOB_TIERS[tier]
            const isSelected = selectedTier === tier
            return (
              <button
                key={tier}
                type="button"
                onClick={() => {
                  if (checkoutLocked) return
                  setSelectedTier(tier)
                }}
                className={`flex flex-col rounded-xl border p-4 text-left shadow-sm transition ${
                  isSelected ? "border-[#D4A843] bg-white ring-2 ring-[#D4A843]/40" : "border-slate-200 bg-white hover:border-slate-300"
                } ${checkoutLocked ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <span className="text-lg font-bold text-[#1B2B4B]">{TIER_LABELS[tier]}</span>
                <span className="mt-1 text-xl font-extrabold text-[#D4A843]">
                  ₾{cfg.priceGel} (~${vipTierPayPalUsd(tier)} USD)
                </span>
                <span className="mt-1 text-sm font-semibold text-slate-600">
                  {t("vip.daysFeatured", { days: cfg.days })}
                </span>
              </button>
            )
          })}
        </div>

        {selectedTier ? (
          <div className="mt-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[#1B2B4B]">{t("vip.payPaypal")}</p>
              {tiersToShow.length > 1 ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-[#1B2B4B] underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50"
                  disabled={checkoutLocked}
                  onClick={() => {
                    if (checkoutLocked) return
                    setSelectedTier(null)
                  }}
                >
                  სხვა ტარიფის არჩევა
                </button>
              ) : null}
            </div>
            <VipTierPayPalPanel
              key={selectedTier}
              tier={selectedTier}
              jobId={jobId}
              jobTitle={jobTitle}
              listingType={listingType}
              onPaid={handlePaid}
              onError={handleTierError}
              e2eSkipServerActivation={e2eSkipServerActivation}
              onCheckoutSessionChange={handleCheckoutSessionChange}
            />
          </div>
        ) : (
          <p className="mt-6 text-sm text-slate-600">აირჩიე ტარიფი, შემდეგ გამოჩნდება PayPal გადახდა.</p>
        )}

        <p className="mt-4 text-xs text-slate-500">
          გადახდა ხდება PayPal sandbox-ით USD-ით. პროდაქშენზე გადართვისას შეცვალეთ გასაღებები და API ბაზის URL.
        </p>
      </div>
    </div>
  )
}
