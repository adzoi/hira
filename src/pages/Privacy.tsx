import InfoPageLayout, { type InfoSection } from "../components/InfoPageLayout.tsx"

const sections: readonly InfoSection[] = [
  {
    headingKey: "privacy.section1Heading",
    paragraphKeys: ["privacy.section1P1", "privacy.section1P2"],
  },
  {
    headingKey: "privacy.section2Heading",
    paragraphKeys: ["privacy.section2P1", "privacy.section2P2", "privacy.section2P3", "privacy.section2P4"],
  },
  {
    headingKey: "privacy.section3Heading",
    paragraphKeys: ["privacy.section3P1", "privacy.section3P2", "privacy.section3P3"],
  },
  {
    headingKey: "privacy.section4Heading",
    paragraphKeys: ["privacy.section4P1"],
  },
  {
    headingKey: "privacy.section5Heading",
    paragraphKeys: ["privacy.section5P1", "privacy.section5P2"],
  },
  {
    headingKey: "privacy.section6Heading",
    paragraphKeys: ["privacy.section6P1", "privacy.section6P2"],
  },
  {
    headingKey: "privacy.section7Heading",
    paragraphKeys: ["privacy.section7P1", "privacy.section7P2"],
  },
  {
    headingKey: "privacy.section8Heading",
    paragraphKeys: ["privacy.section8P1", "privacy.section8P2", "privacy.section8P3", "privacy.section8P4"],
  },
  {
    headingKey: "privacy.section9Heading",
    paragraphKeys: ["privacy.section9P1", "privacy.section9P2"],
  },
  {
    headingKey: "privacy.section10Heading",
    paragraphKeys: ["privacy.section10P1"],
  },
]

export default function PrivacyPage() {
  return (
    <InfoPageLayout
      pageTitleKey="privacy.pageTitle"
      heroHeadingKey="privacy.heroHeading"
      heroSubtitleKey="privacy.heroSubtitle"
      lastUpdatedKey="privacy.lastUpdated"
      sections={sections}
    />
  )
}
