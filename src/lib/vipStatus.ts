/** VIP is granted manually in Supabase by setting `is_vip` and `vip_expires_at` on a job or service. */
export function jobVipIsActive(isVip: boolean, vipExpiresAt: string | null | undefined): boolean {
  if (!isVip) return false
  if (vipExpiresAt == null || String(vipExpiresAt).trim() === "") return true
  const t = new Date(vipExpiresAt).getTime()
  if (!Number.isFinite(t)) return false
  return t > Date.now()
}
