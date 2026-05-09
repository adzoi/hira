import type { FormEvent } from "react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import Navbar from "../components/Navbar.tsx"
import { isSupabaseConfigured, supabase } from "../lib/supabase"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    document.title = "პაროლის აღდგენა — გიგორი"
  }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")

    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase პარამეტრები ვერ მოიძებნა. შეამოწმე .env ფაილი.")
      return
    }

    const trimmed = email.trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("გთხოვთ მიუთითოთ სწორი ელფოსტა.")
      return
    }

    setBusy(true)
    try {
      const redirectTo = `${window.location.origin}/auth/reset-password`
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo })
      if (resetErr) throw resetErr
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "მოთხოვნა ვერ გაიგზავნა. სცადეთ მოგვიანებით.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] page-enter">
      <Navbar />
      <div className="mx-auto w-full max-w-xl px-4 py-10 md:px-6 md:py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-8">
          <h1 className="text-[26px] font-bold text-[#1B2B4B] md:text-4xl">პაროლის აღდგენა</h1>
          <p className="mt-2 text-sm text-slate-600">
            მიუთითეთ ელფოსტა, რომლითაც დარეგისტრირებული ხართ. იქ მიიღებთ ბმულს ახალი პაროლის შესაყენებლად. თუ წერილი არ ჩანს, შეამოწმეთ Spam.
          </p>

          {sent ? (
            <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              თუ ეს მისამართი დარეგისტრირებულია გიგორზე, ბმული უკვე გამოიგზავნა. გახსენით და მიუთითეთ ახალი პაროლი.
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-[#1B2B4B]">ელფოსტა</span>
                <input
                  type="email"
                  value={email}
                  autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none ring-[#D4A843] focus:ring-2"
                  placeholder="მაგ: user@gigori.ge"
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
                {busy ? "მიმდინარეობს..." : "ბმულის გაგზავნა"}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-slate-600">
            <Link to="/login" className="font-semibold text-[#D4A843] hover:underline">
              ← შესვლის გვერდზე დაბრუნება
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
