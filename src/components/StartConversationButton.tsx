import { useEffect, useState, type MouseEvent } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { useTranslation } from "../i18n/LocaleContext.tsx"
import { startConversationPath } from "../lib/chat.ts"
import { isSupabaseConfigured, supabase } from "../lib/supabase.ts"

type StartConversationButtonProps = {
  otherUserId: string | null | undefined
  serviceInquiryId?: string | null
  jobApplicationId?: string | null
  label?: string
  variant?: "primary" | "outline"
  className?: string
}

const variantClass: Record<NonNullable<StartConversationButtonProps["variant"]>, string> = {
  primary:
    "inline-flex h-11 items-center justify-center rounded-lg bg-[#0088FF] px-4 text-sm font-semibold text-white transition hover:bg-[#006ACC]",
  outline:
    "inline-flex h-11 items-center justify-center rounded-lg border border-[#0088FF] bg-white px-4 text-sm font-semibold text-[#0088FF] transition hover:bg-[#E8F4FF]",
}

export default function StartConversationButton({
  otherUserId,
  serviceInquiryId,
  jobApplicationId,
  label,
  variant = "outline",
  className = "",
}: StartConversationButtonProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [viewerId, setViewerId] = useState<string | null>(null)
  const buttonLabel = label ?? t("common.startConversation")

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return
    void supabase.auth.getUser().then(({ data }) => {
      setViewerId(data.user?.id ?? null)
    })
  }, [])

  const targetId = otherUserId?.trim()
  if (!targetId || viewerId === targetId) return null

  const href = startConversationPath({
    otherUserId: targetId,
    serviceInquiryId,
    jobApplicationId,
  })

  const handleClick = (event: MouseEvent) => {
    if (viewerId) return
    event.preventDefault()
    const redirect = `${location.pathname}${location.search}`
    navigate(`/login?redirect=${encodeURIComponent(redirect)}`)
  }

  return (
    <Link
      to={href}
      onClick={handleClick}
      className={`${variantClass[variant]} ${className}`.trim()}
    >
      {buttonLabel}
    </Link>
  )
}
