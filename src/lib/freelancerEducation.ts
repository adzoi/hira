export const FREELANCER_EDUCATION_DEGREE_OPTIONS = [
  { value: "bachelor", label: "ბაკალავრი" },
  { value: "master", label: "მაგისტრატურა" },
  { value: "doctorate", label: "დოქტორანტურა" },
  { value: "diploma", label: "დიპლომი" },
  { value: "vocational", label: "პროფესიული" },
  { value: "other", label: "სხვა" },
] as const

export type FreelancerEducationDegreeLevel = (typeof FREELANCER_EDUCATION_DEGREE_OPTIONS)[number]["value"]

export function formatFreelancerEducationDegreeLevel(value: string): string {
  const row = FREELANCER_EDUCATION_DEGREE_OPTIONS.find((o) => o.value === value)
  return row?.label ?? value
}
