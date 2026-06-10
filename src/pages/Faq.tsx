import InfoPageLayout, { type InfoSection } from "../components/InfoPageLayout.tsx"

const sections: readonly InfoSection[] = [
  {
    heading: "faq.q1",
    paragraphs: ["faq.a1"],
  },
  {
    heading: "faq.q2",
    paragraphs: ["faq.a2"],
  },
  {
    heading: "faq.q3",
    paragraphs: ["faq.a3"],
  },
  {
    heading: "faq.q4",
    paragraphs: ["faq.a4"],
  },
  {
    heading: "faq.q5",
    paragraphs: ["faq.a5"],
  },
  {
    heading: "faq.q6",
    paragraphs: ["faq.a6"],
  },
  {
    heading: "faq.q7",
    paragraphs: ["faq.a7"],
  },
  {
    heading: "faq.q8",
    paragraphs: ["faq.a8"],
  },
]

export default function FaqPage() {
  return (
    <InfoPageLayout
      pageTitle="faq.pageTitle"
      metaDescription="faq.metaDescription"
      heroHeading="faq.heroHeading"
      heroSubtitle="faq.heroSubtitle"
      sections={sections}
    />
  )
}
