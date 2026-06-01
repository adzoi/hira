import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import "./index.css"
import App from "./App.tsx"
import { ToastProvider } from "./components/ui/ToastProvider.tsx"
import { queryClient } from "./lib/queryClient.ts"
import { isSupabaseConfigured, supabase } from "./lib/supabase.ts"
import { initSupabaseAuth } from "./lib/supabaseAuth.ts"

async function bootstrap() {
  if (isSupabaseConfigured && supabase) {
    await initSupabaseAuth(supabase)
  }

  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>,
  )
}

void bootstrap()
