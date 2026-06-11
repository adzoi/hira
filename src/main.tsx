import { QueryClientProvider } from "@tanstack/react-query"
import { lazy, Suspense } from "react"
import { createRoot } from "react-dom/client"
import { HelmetProvider } from "react-helmet-async"
import { BrowserRouter } from "react-router-dom"
import "./index.css"
import App from "./App.tsx"
import { ToastProvider } from "./components/ui/ToastProvider.tsx"
import { LocaleProvider } from "./i18n/LocaleContext.tsx"
import { queryClient } from "./lib/queryClient.ts"
import { isSupabaseConfigured, supabase } from "./lib/supabase.ts"
import { initAuthHashCleanup, initSupabaseAuth, initAuthStateCleanup } from "./lib/supabaseAuth.ts"
// GA4: initialized here (production + cookie consent). Custom events: src/lib/analytics.ts
import { initGoogleAnalytics } from "./lib/analytics.ts"
import { initRealtimeAuth } from "./lib/realtimeAuth.ts"

const ReactQueryDevtools = lazy(() =>
  import("@tanstack/react-query-devtools").then((mod) => ({
    default: mod.ReactQueryDevtools,
  })),
)

function LazyReactQueryDevtools() {
  return (
    <Suspense fallback={null}>
      <ReactQueryDevtools initialIsOpen={false} />
    </Suspense>
  )
}

async function bootstrap() {
  if (isSupabaseConfigured && supabase) {
    await initSupabaseAuth(supabase)
    initAuthHashCleanup(supabase)
    initAuthStateCleanup(supabase, queryClient)
    initRealtimeAuth(supabase)
  }

  initGoogleAnalytics()

  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <ToastProvider>
          <HelmetProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </HelmetProvider>
        </ToastProvider>
      </LocaleProvider>
      {import.meta.env.DEV ? (
        <LazyReactQueryDevtools />
      ) : null}
    </QueryClientProvider>,
  )
}

void bootstrap()
