import { buildCvFromProfileData } from "../cvFromProfile.ts"
import { supabaseEdgeHeaders } from "../supabaseEdgeHeaders.ts"
import { isSupabaseConfigured, supabase } from "../supabase.ts"
import { getAuthenticatedSession } from "../supabaseAuth.ts"

export type CvPayload = Record<string, unknown>

export async function fetchCvGenerator(_userId: string): Promise<CvPayload> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase არ არის კონფიგურირებული.")
  }

  const { user, session } = await getAuthenticatedSession(supabase)
  if (!user || !session?.access_token) {
    throw new Error("AUTH_REQUIRED")
  }

  const [fpRes, profileRes, cvResponse] = await Promise.all([
    supabase.from("freelancer_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cv-get`, {
      method: "GET",
      headers: supabaseEdgeHeaders(session.access_token),
    }),
  ])

  let savedCv: Record<string, unknown> | null = null
  const fpRow = fpRes.data as Record<string, unknown> | null
  if (cvResponse.ok) {
    const payload = await cvResponse.json().catch(() => null)
    const maybeCv = payload?.cv
    const hasRealCvObject = Boolean(
      maybeCv &&
        typeof maybeCv === "object" &&
        typeof (maybeCv as { id?: string }).id === "string" &&
        String((maybeCv as { id: string }).id).trim(),
    )
    if (hasRealCvObject) savedCv = maybeCv as Record<string, unknown>
  }

  const fpId = fpRow && typeof fpRow.id === "string" ? fpRow.id : null

  let experienceRows: Array<Record<string, unknown>> = []
  let educationRows: Array<Record<string, unknown>> = []
  let skillNames: string[] = []

  if (fpId) {
    const [expRes, eduRes, fsRes] = await Promise.all([
      supabase.from("experience").select("*").eq("freelancer_profile_id", fpId).order("start_date", { ascending: false }),
      supabase
        .from("freelancer_education")
        .select("*")
        .eq("freelancer_profile_id", fpId)
        .order("end_date", { ascending: false }),
      supabase.from("freelancer_skills").select("skills(name)").eq("freelancer_profile_id", fpId),
    ])
    experienceRows = (expRes.data ?? []) as Array<Record<string, unknown>>
    educationRows = (eduRes.data ?? []) as Array<Record<string, unknown>>
    const fsRows = fsRes.data ?? []
    skillNames = (fsRows as Array<{ skills?: { name?: string } | null }>)
      .map((row) => row?.skills?.name)
      .filter((n): n is string => Boolean(n && String(n).trim()))
      .map((n) => String(n).trim())
  }

  const built = buildCvFromProfileData({
    freelancerProfile: fpRow,
    profile: profileRes.data as Record<string, unknown> | null,
    experienceRows,
    educationRows,
    skillNames,
    savedCv,
  })

  return built as CvPayload
}
