import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import "./index.css"
import App from "./App.tsx"
import { ToastProvider } from "./components/ui/ToastProvider.tsx"
import { LocaleProvider } from "./i18n/LocaleContext.tsx"
import { ThemeProvider } from "./theme/ThemeContext.tsx"
import { queryClient } from "./lib/queryClient.ts"
import { isSupabaseConfigured, supabase } from "./lib/supabase.ts"
import { initSupabaseAuth } from "./lib/supabaseAuth.ts"
import { initRealtimeAuth } from "./lib/realtimeAuth.ts"

async function bootstrap() {
  if (isSupabaseConfigured && supabase) {
    await initSupabaseAuth(supabase)
    initRealtimeAuth(supabase)
  }

  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LocaleProvider>
          <ToastProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ToastProvider>
        </LocaleProvider>
      </ThemeProvider>
      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>,
  )
}

void bootstrap()
