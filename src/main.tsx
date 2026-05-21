import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import "./index.css"
import App from "./App.tsx"
import { ToastProvider } from "./components/ui/ToastProvider.tsx"
import { isSupabaseConfigured, supabase } from "./lib/supabase.ts"
import { initSupabaseAuth } from "./lib/supabaseAuth.ts"

async function bootstrap() {
  if (isSupabaseConfigured && supabase) {
    await initSupabaseAuth(supabase)
  }

  createRoot(document.getElementById("root")!).render(
    <ToastProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ToastProvider>,
  )
}

void bootstrap()
