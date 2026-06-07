import InfoPageLayout, { type InfoSection } from "../components/InfoPageLayout.tsx"

const sections: readonly InfoSection[] = [
  {
    headingKey: "faq.q1",
    paragraphKeys: ["faq.a1"],
  },
  {
    headingKey: "faq.q2",
    paragraphKeys: ["faq.a2"],
  },
  {
    headingKey: "faq.q3",
    paragraphKeys: ["faq.a3"],
  },
  {
    headingKey: "faq.q4",
    paragraphKeys: ["faq.a4"],
  },
  {
    headingKey: "faq.q5",
    paragraphKeys: ["faq.a5"],
  },
  {
    headingKey: "faq.q6",
    paragraphKeys: ["faq.a6"],
  },
  {
    headingKey: "faq.q7",
    paragraphKeys: ["faq.a7"],
  },
  {
    headingKey: "faq.q8",
    paragraphKeys: ["faq.a8"],
  },
]

export default function FaqPage() {
  return (
    <InfoPageLayout
      pageTitleKey="faq.pageTitle"
      heroHeadingKey="faq.heroHeading"
      heroSubtitleKey="faq.heroSubtitle"
      sections={sections}
    />
  )
}
