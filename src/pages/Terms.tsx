import InfoPageLayout, { type InfoSection } from "../components/InfoPageLayout.tsx"

const sections: readonly InfoSection[] = [
  {
    headingKey: "terms.section1Heading",
    paragraphKeys: ["terms.section1P1", "terms.section1P2", "terms.section1P3"],
  },
  {
    headingKey: "terms.section2Heading",
    paragraphKeys: ["terms.section2P1", "terms.section2P2"],
  },
  {
    headingKey: "terms.section3Heading",
    paragraphKeys: ["terms.section3P1", "terms.section3P2", "terms.section3P3", "terms.section3P4"],
  },
  {
    headingKey: "terms.section4Heading",
    paragraphKeys: ["terms.section4P1", "terms.section4P2"],
  },
  {
    headingKey: "terms.section5Heading",
    paragraphKeys: ["terms.section5P1", "terms.section5P2"],
  },
  {
    headingKey: "terms.section6Heading",
    paragraphKeys: ["terms.section6P1", "terms.section6P2"],
  },
  {
    headingKey: "terms.section7Heading",
    paragraphKeys: ["terms.section7P1", "terms.section7P2"],
  },
  {
    headingKey: "terms.section8Heading",
    paragraphKeys: ["terms.section8P1"],
  },
  {
    headingKey: "terms.section9Heading",
    paragraphKeys: ["terms.section9P1"],
  },
  {
    headingKey: "terms.section10Heading",
    paragraphKeys: ["terms.section10P1"],
  },
  {
    headingKey: "terms.section11Heading",
    paragraphKeys: ["terms.section11P1", "terms.section11P2"],
  },
  {
    headingKey: "terms.section12Heading",
    paragraphKeys: ["terms.section12P1"],
  },
]

export default function TermsPage() {
  return (
    <InfoPageLayout
      pageTitleKey="terms.pageTitle"
      heroHeadingKey="terms.heroHeading"
      heroSubtitleKey="terms.heroSubtitle"
      lastUpdatedKey="terms.lastUpdated"
      sections={sections}
    />
  )
}
