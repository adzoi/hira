import type { SupabaseClient } from "@supabase/supabase-js"

function embedJoinRow<T extends Record<string, unknown>>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] as T | undefined) ?? null : v
}

export type ProfileListingOffer = {
  id: string
  listingTitle: string
  message: string
  proposedBudget: number | null
  createdAt: string
  serviceId: string | null
}

export type ProfileJobApplication = {
  applicationId: string
  jobId: string
  jobTitle: string
  freelancerUserId: string
  createdAt: string
}

async function notifyUser(
  client: SupabaseClient,
  targetUserId: string | null | undefined,
  title: string,
  body: string,
  link: string,
  type = "status_update",
) {
  if (!targetUserId) return
  try {
    await client.rpc("send_status_notification", {
      p_target_user_id: targetUserId,
      p_title: title,
      p_body: body,
      p_link: link,
      p_type: type,
    })
  } catch {
    /* non-blocking */
  }
}

export async function fetchPendingListingOffersFromHirer(
  client: SupabaseClient,
  hirerProfileId: string,
  freelancerProfileId: string,
): Promise<ProfileListingOffer[]> {
  const clientAny = client as SupabaseClient & { from: (table: string) => ReturnType<SupabaseClient["from"]> }
  const { data, error } = await clientAny
    .from("service_inquiries")
    .select(
      `
      id,
      created_at,
      message,
      proposed_budget,
      status,
      services ( id, title )
    `,
    )
    .eq("hirer_profile_id", hirerProfileId)
    .eq("freelancer_profile_id", freelancerProfileId)
    .eq("status", "pending")
    .eq("deleted_by_hirer", false)
    .eq("deleted_by_freelancer", false)
    .order("created_at", { ascending: false })

  if (error) throw error

  const out: ProfileListingOffer[] = []
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const svc = embedJoinRow(row.services as Record<string, unknown> | Record<string, unknown>[] | null)
    out.push({
      id: String(row.id ?? ""),
      createdAt: String(row.created_at ?? ""),
      message: String(row.message ?? ""),
      proposedBudget: row.proposed_budget != null ? Number(row.proposed_budget) : null,
      listingTitle: typeof svc?.title === "string" && svc.title.trim() ? svc.title : "ლისტინგი",
      serviceId: typeof svc?.id === "string" && svc.id.trim() ? svc.id : null,
    })
  }
  return out.filter((item) => item.id)
}

export async function fetchPendingApplicationsFromFreelancer(
  client: SupabaseClient,
  hirerProfileId: string,
  freelancerProfileId: string,
): Promise<ProfileJobApplication[]> {
  const { data, error } = await client
    .from("job_applications")
    .select(
      `
      id,
      job_id,
      created_at,
      status,
      jobs!inner (
        id,
        title,
        hirer_profile_id
      ),
      freelancer_profiles!inner (
        user_id
      )
    `,
    )
    .eq("freelancer_profile_id", freelancerProfileId)
    .eq("status", "pending")
    .eq("deleted_by_hirer", false)
    .eq("deleted_by_freelancer", false)
    .eq("jobs.hirer_profile_id", hirerProfileId)
    .order("created_at", { ascending: false })

  if (error) throw error

  const out: ProfileJobApplication[] = []
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const job = embedJoinRow(row.jobs as Record<string, unknown> | Record<string, unknown>[] | null)
    const fp = embedJoinRow(row.freelancer_profiles as Record<string, unknown> | Record<string, unknown>[] | null)
    const applicationId = String(row.id ?? "")
    const jobId = String(row.job_id ?? job?.id ?? "")
    if (!applicationId || !jobId) continue
    out.push({
      applicationId,
      jobId,
      jobTitle: typeof job?.title === "string" && job.title.trim() ? job.title : "განცხადება",
      freelancerUserId: typeof fp?.user_id === "string" ? fp.user_id : "",
      createdAt: String(row.created_at ?? ""),
    })
  }
  return out
}

export async function acceptListingOffer(client: SupabaseClient, inquiryId: string): Promise<void> {
  const clientAny = client as SupabaseClient & { from: (table: string) => ReturnType<SupabaseClient["from"]> }
  const { data: current } = await clientAny
    .from("service_inquiries")
    .select("deleted_by_hirer")
    .eq("id", inquiryId)
    .single()
  if (current?.deleted_by_hirer === true) {
    throw new Error("შეთავაზება აღარ არის ხელმისაწვდომი.")
  }

  const nowIso = new Date().toISOString()
  const { error } = await clientAny
    .from("service_inquiries")
    .update({ status: "accepted", updated_at: nowIso })
    .eq("id", inquiryId)
  if (error) throw error
}

export async function declineListingOffer(client: SupabaseClient, inquiryId: string): Promise<void> {
  const clientAny = client as SupabaseClient & { from: (table: string) => ReturnType<SupabaseClient["from"]> }
  const nowIso = new Date().toISOString()
  const { error } = await clientAny
    .from("service_inquiries")
    .update({ status: "declined", updated_at: nowIso })
    .eq("id", inquiryId)
  if (error) throw error
}

export async function acceptJobApplication(
  client: SupabaseClient,
  item: ProfileJobApplication,
  hirerProfileId: string,
): Promise<void> {
  const { error: e1 } = await client.from("job_applications").update({ status: "accepted" }).eq("id", item.applicationId)
  if (e1) throw e1

  let incremented = false
  let vacancyNowFull = false
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: snapshot, error: selErr } = await client
      .from("jobs")
      .select("accepted_count,vacancies")
      .eq("id", item.jobId)
      .eq("hirer_profile_id", hirerProfileId)
      .maybeSingle()
    if (selErr) throw selErr
    if (!snapshot) throw new Error("სამუშაო ვერ მოიძებნა.")

    const prev = Number(snapshot.accepted_count ?? 0)
    const vac = Math.max(1, Number(snapshot.vacancies ?? 1))
    const next = prev + 1
    vacancyNowFull = next >= vac

    const updatePayload: { accepted_count: number; status?: string } = { accepted_count: next }
    if (vacancyNowFull) updatePayload.status = "closed"

    const { data: updatedRows, error: updErr } = await client
      .from("jobs")
      .update(updatePayload)
      .eq("id", item.jobId)
      .eq("hirer_profile_id", hirerProfileId)
      .eq("accepted_count", prev)
      .select("id")
    if (updErr) throw updErr
    if ((updatedRows?.length ?? 0) > 0) {
      incremented = true
      break
    }
  }

  if (!incremented) {
    throw new Error("განახლება ვერ დასრულდა - განაახლე გვერდი და სცადე თავიდან.")
  }

  if (vacancyNowFull) {
    const { error: e2 } = await client
      .from("job_applications")
      .update({ status: "rejected" })
      .eq("job_id", item.jobId)
      .neq("id", item.applicationId)
      .eq("status", "pending")
    if (e2) throw e2
  }

  await notifyUser(
    client,
    item.freelancerUserId,
    "განცხადება მიღებულია",
    `დამქირავებელმა მიიღო შენი განცხადება სამუშაოზე „${item.jobTitle}“.`,
    "/dashboard",
    "job_application_status",
  )
}

export async function rejectJobApplication(client: SupabaseClient, item: ProfileJobApplication): Promise<void> {
  const { error } = await client.from("job_applications").update({ status: "rejected" }).eq("id", item.applicationId)
  if (error) throw error

  await notifyUser(
    client,
    item.freelancerUserId,
    "განცხადება უარყოფილია",
    `დამქირავებელმა უარყო განცხადება სამუშაოზე „${item.jobTitle}“.`,
    "/dashboard",
    "job_application_status",
  )
}
