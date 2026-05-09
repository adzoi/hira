"use client"

import { useEffect, useState } from "react"
import CVPreview from "../../../components/cv/CVPreview"

export default function PublicCVPage({ params }) {
  const [cv, setCv] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const slug = params?.slug

  useEffect(() => {
    let mounted = true

    async function loadPublicCv() {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cv-get?slug=${encodeURIComponent(slug)}`,
          { method: "GET", headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } },
        )
        const result = await response.json()
        if (!response.ok) {
          throw new Error(result?.error || "CV not found")
        }
        if (mounted) setCv(result.cv || null)
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Failed to load CV")
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    if (slug) loadPublicCv()
    else {
      setError("Missing CV slug")
      setIsLoading(false)
    }

    return () => {
      mounted = false
    }
  }, [slug])

  if (isLoading) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <p className="text-sm text-gray-600">Loading public CV...</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <CVPreview cv={cv} readOnly />
    </main>
  )
}

