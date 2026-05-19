import { Link } from "react-router-dom"
import type { ProfileJobApplication, ProfileListingOffer } from "../lib/profileOffers.ts"

function formatOfferDate(dateString: string) {
  if (!dateString) return ""
  return new Date(dateString).toLocaleDateString("ka-GE")
}

type ListingOffersProps = {
  variant: "listing"
  offers: ProfileListingOffer[]
  busyId: string | null
  onAccept: (offer: ProfileListingOffer) => void
  onDecline: (offer: ProfileListingOffer) => void
}

type ApplicationOffersProps = {
  variant: "application"
  offers: ProfileJobApplication[]
  busyId: string | null
  onAccept: (offer: ProfileJobApplication) => void
  onReject: (offer: ProfileJobApplication) => void
}

type ProfilePendingOffersProps = ListingOffersProps | ApplicationOffersProps

function OfferTitle({ title, href }: { title: string; href: string | null }) {
  if (href) {
    return (
      <Link to={href} className="font-semibold text-[#1B2B4B] hover:text-[#D4A843] hover:underline">
        {title}
      </Link>
    )
  }
  return <p className="font-semibold text-[#1B2B4B]">{title}</p>
}

function OfferActions({
  busy,
  onAccept,
  onReject,
}: {
  busy: boolean
  onAccept: () => void
  onReject: () => void
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={onAccept}
        className="rounded-lg bg-[#1B2B4B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#D4A843] hover:text-[#1B2B4B] disabled:opacity-50"
      >
        მიღება
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onReject}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        უარყოფა
      </button>
    </div>
  )
}

export default function ProfilePendingOffers(props: ProfilePendingOffersProps) {
  if (props.offers.length === 0) return null

  const title =
    props.variant === "listing"
      ? "ამ დამქირავებლისგან გაქვთ შეთავაზება"
      : "ამ ფრილანსერისგან გაქვთ განცხადება"

  return (
    <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/80 p-5 shadow-sm">
      <h2 className="text-base font-extrabold text-[#1B2B4B]">{title}</h2>
      <p className="mt-1 text-sm text-slate-700">
        {props.variant === "listing"
          ? "შეგიძლიათ მიიღოთ ან უარყოთ პირდაპირ ამ გვერდიდან."
          : "შეგიძლიათ მიიღოთ ან უარყოთ განმცხადებელი პირდაპირ ამ გვერდიდან."}
      </p>
      <ul className="mt-4 space-y-3">
        {props.variant === "listing"
          ? props.offers.map((offer) => (
              <li key={offer.id} className="rounded-xl border border-amber-200/80 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <OfferTitle
                    title={offer.listingTitle}
                    href={offer.serviceId ? `/listing/${encodeURIComponent(offer.serviceId)}` : null}
                  />
                  {offer.createdAt ? (
                    <span className="text-xs text-slate-500">{formatOfferDate(offer.createdAt)}</span>
                  ) : null}
                </div>
                {offer.proposedBudget != null ? (
                  <p className="mt-2 text-sm text-slate-700">
                    შემოთავაზებული: {offer.proposedBudget.toLocaleString("ka-GE")} ₾
                  </p>
                ) : null}
                {offer.message.trim() ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700 [overflow-wrap:anywhere]">
                    {offer.message}
                  </p>
                ) : null}
                <OfferActions
                  busy={props.busyId === offer.id}
                  onAccept={() => props.onAccept(offer)}
                  onReject={() => props.onDecline(offer)}
                />
              </li>
            ))
          : props.offers.map((offer) => (
              <li key={offer.applicationId} className="rounded-xl border border-amber-200/80 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <OfferTitle title={offer.jobTitle} href={`/job/${encodeURIComponent(offer.jobId)}`} />
                  {offer.createdAt ? (
                    <span className="text-xs text-slate-500">{formatOfferDate(offer.createdAt)}</span>
                  ) : null}
                </div>
                <OfferActions
                  busy={props.busyId === offer.applicationId}
                  onAccept={() => props.onAccept(offer)}
                  onReject={() => props.onReject(offer)}
                />
              </li>
            ))}
      </ul>
    </section>
  )
}
