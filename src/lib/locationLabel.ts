/** Human-readable label for a job `location_type` value. */
export function locationLabel(
  type: string,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const labels: Record<string, string> = {
    remote: t("common.remote"),
    tbilisi: "თბილისი",
    hybrid: t("common.hybrid"),
    anywhere: t("common.anywhere"),
    on_site: t("common.onSite"),
  }
  return labels[type] ?? type
}
