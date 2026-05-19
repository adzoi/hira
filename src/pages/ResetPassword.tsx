import type { FormEvent } from "react"
import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import Navbar from "../components/Navbar.tsx"
import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { validatePassword } from "../lib/validation.ts"

function recoveryHintFromBrowser(): boolean {
  if (typeof window === "undefined") return false
  const hash = window.location.hash
  const searchParams = new URLSearchParams(window.location.search)
  if (/\btype=recovery\b/.test(hash)) return true
  if (searchParams.get("type") === "recovery") return true
  return false
}

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const recoveryHintRef = useRef(recoveryHintFromBrowser())
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(true)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    document.title = "ახალი პაროლი — გიგორი"
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setChecking(false)
      setReady(false)
      return
    }

    let cancelled = false

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return
      if (event === "PASSWORD_RECOVERY") {
        setReady(true)
        setChecking(false)
      }
    })

    void (async () => {
      const code = new URLSearchParams(window.location.search).get("code")
      if (code) {
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(window.location.href)
          if (!cancelled && !error) {
            setReady(true)
            setChecking(false)
            return
          }
        } catch {
          /* fall through — try hash / PASSWORD_RECOVERY */
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!cancelled && session && recoveryHintRef.current) {
        setReady(true)
      }
      if (!cancelled) setChecking(false)
    })()

    const t = window.setTimeout(() => {
      if (cancelled) return
      setChecking(false)
    }, 2500)

    return () => {
      cancelled = true
      window.clearTimeout(t)
      data.subscription.unsubscribe()
    }
  }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    if (!supabase || !ready) return

    const passwordResult = validatePassword(password)
    if (!passwordResult.ok) {
      setError(passwordResult.message)
      return
    }
    if (passwordResult.value !== confirm) {
      setError("პაროლები არ ემთხვევა ერთმანეთს.")
      return
    }

    setBusy(true)
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password: passwordResult.value })
      if (upErr) throw upErr
      await supabase.auth.signOut({ scope: "local" }).catch(() => {})
      navigate("/login", { replace: true, state: { reason: "password-reset" as const } })
    } catch (e) {
      setError(e instanceof Error ? e.message : "პაროლი ვერ შეინახვა.")
    } finally {
      setBusy(false)
    }
  }

  if (!isSupabaseConfigured || !supabase) {
    return (
      <div className="min-h-screen bg-[#F8F9FC] page-enter">
        <Navbar />
        <div className="mx-auto w-full max-w-xl px-4 py-16 text-center text-sm text-slate-700">
          Supabase არ არის კონფიგურირებული.
          <Link to="/login" className="mt-4 block font-semibold text-[#D4A843] hover:underline">
            შესვლა
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] page-enter">
      <Navbar />
      <div className="mx-auto w-full max-w-xl px-4 py-10 md:px-6 md:py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-8">
          <h1 className="text-[26px] font-bold text-[#1B2B4B] md:text-4xl">ახალი პაროლი</h1>

          {checking ? (
            <p className="mt-6 text-sm text-slate-600">მიმდინარეობს ბმულის შემოწმება…</p>
          ) : !ready ? (
            <div className="mt-6 space-y-3 text-sm text-slate-700">
              <p>აღდგენის ბმული არ იძებნება, ვადა გაუვიდა ან იგი უკვე გამოყენებული იყო.</p>
              <Link to="/forgot-password" className="font-semibold text-[#D4A843] hover:underline">
                ხელახლა მოთხოვნა
              </Link>
              {" · "}
              <Link to="/login" className="font-semibold text-[#1B2B4B] hover:underline">
                შესვლა
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">ახალი პაროლი</span>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    autoComplete="new-password"
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 pr-24 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
                    placeholder="მინ. 6 სიმბოლო"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-slate-500"
                  >
                    {showPassword ? "დამალვა" : "ჩვენება"}
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">გამეორება</span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                  autoComplete="new-password"
                  onChange={(e) => setConfirm(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#1B2B4B] focus:ring-2"
                  placeholder="გამეორე პაროლი"
                />
              </label>
              {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              ) : null}
              <button
                type="submit"
                disabled={busy}
                className="h-11 w-full rounded-lg bg-[#1B2B4B] text-sm font-semibold text-white transition hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {busy ? "მიმდინარეობს..." : "პაროლის შენახვა"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
