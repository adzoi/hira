import { useSearchParams } from "react-router-dom"
import VIPUpgrade from "../components/VIPUpgrade.tsx"

/**
 * Isolated PayPal Smart Buttons surface for Playwright diagnostics (`/checkout`).
 * Requires `VITE_PAYPAL_CLIENT_ID` and (for full assertions) `VITE_PAYPAL_E2E_DIAG=1` at build/dev time.
 */
export default function PayPalCheckoutE2EPage() {
  const [params] = useSearchParams()
  const jobId = params.get("jobId")?.trim() || "e2e-vip-job"
  const jobTitle = params.get("jobTitle")?.trim() || "E2E PayPal VIP checkout"

  return (
    <main data-testid="paypal-checkout-e2e-root" className="min-h-screen bg-slate-100 p-4">
      <h1 className="sr-only">PayPal sandbox checkout (E2E)</h1>
      <VIPUpgrade
        open
        jobId={jobId}
        jobTitle={jobTitle}
        onClose={() => {}}
        onSuccess={() => {
          console.log("[E2E] VIP onSuccess — capture completed and flow finished")
        }}
        tiers={["bronze"]}
        e2eSkipServerActivation
      />
    </main>
  )
}
