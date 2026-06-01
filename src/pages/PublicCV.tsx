import { useEffect } from "react"
import { useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import Navbar from "../components/Navbar"
import CVPreview from "../../components/cv/CVPreview.jsx"
import { fetchPublicCvBySlug } from "../lib/queries/fetchPublicCv.ts"
import { queryErrorMessage } from "../lib/queries/queryErrorMessage.ts"
import { queryKeys } from "../lib/queryKeys.ts"

export default function PublicCVPage() {
  const { slug } = useParams<{ slug: string }>()
  const {
    data: cv = null,
    isLoading: loading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.publicCv(slug ?? ""),
    queryFn: () => fetchPublicCvBySlug(slug!),
    enabled: Boolean(slug),
  })
  const error = isError ? queryErrorMessage(queryError, "შეცდომა") : ""

  useEffect(() => {
    document.title = "საჯარო CV — გიგორი"
  }, [])

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        {loading ? <p className="text-sm text-slate-600">იტვირთება...</p> : null}
        {!loading && error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}
        {!loading && !error && cv ? <CVPreview cv={cv} readOnly /> : null}
      </main>
    </div>
  )
}
