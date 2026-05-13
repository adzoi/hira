/** View-count eye: almond outline + solid pupil (replaces 👁 in meta pills). */
export function ViewCountEyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M1 7c2.6-4.2 5.4-6 9-6s6.4 1.8 9 6c-2.6 4.2-5.4 6-9 6s-6.4-1.8-9-6z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="7" r="2.25" fill="currentColor" />
    </svg>
  )
}
