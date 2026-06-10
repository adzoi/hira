import InfoPageLayout, { type InfoSection } from "../components/InfoPageLayout.tsx"

const sections: readonly InfoSection[] = [
  {
    heading: "terms.section1Heading",
    paragraphs: ["terms.section1P1", "terms.section1P2", "terms.section1P3"],
  },
  {
    heading: "terms.section2Heading",
    paragraphs: ["terms.section2P1", "terms.section2P2"],
  },
  {
    heading: "terms.section3Heading",
    paragraphs: ["terms.section3P1", "terms.section3P2", "terms.section3P3", "terms.section3P4"],
  },
  {
    heading: "terms.section4Heading",
    paragraphs: ["terms.section4P1", "terms.section4P2"],
  },
  {
    heading: "terms.section5Heading",
    paragraphs: ["terms.section5P1", "terms.section5P2"],
  },
  {
    heading: "terms.section6Heading",
    paragraphs: ["terms.section6P1", "terms.section6P2"],
  },
  {
    heading: "terms.section7Heading",
    paragraphs: ["terms.section7P1", "terms.section7P2"],
  },
  {
    heading: "terms.section8Heading",
    paragraphs: ["terms.section8P1"],
  },
  {
    heading: "terms.section9Heading",
    paragraphs: ["terms.section9P1"],
  },
  {
    heading: "terms.section10Heading",
    paragraphs: ["terms.section10P1"],
  },
  {
    heading: "terms.section11Heading",
    paragraphs: ["terms.section11P1", "terms.section11P2"],
  },
  {
    heading: "terms.section12Heading",
    paragraphs: ["terms.section12P1"],
  },
]

export default function TermsPage() {
  return (
    <InfoPageLayout
      pageTitle="terms.pageTitle"
      metaDescription="terms.metaDescription"
      heroHeading="terms.heroHeading"
      heroSubtitle="terms.heroSubtitle"
      lastUpdated="terms.lastUpdated"
      sections={sections}
    />
  )
}
