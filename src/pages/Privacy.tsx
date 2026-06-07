import InfoPageLayout, { type InfoSection } from "../components/InfoPageLayout.tsx"

const sections: readonly InfoSection[] = [
  {
    heading: "privacy.section1Heading",
    paragraphs: ["privacy.section1P1", "privacy.section1P2"],
  },
  {
    heading: "privacy.section2Heading",
    paragraphs: ["privacy.section2P1", "privacy.section2P2", "privacy.section2P3", "privacy.section2P4"],
  },
  {
    heading: "privacy.section3Heading",
    paragraphs: ["privacy.section3P1", "privacy.section3P2", "privacy.section3P3"],
  },
  {
    heading: "privacy.section4Heading",
    paragraphs: ["privacy.section4P1"],
  },
  {
    heading: "privacy.section5Heading",
    paragraphs: ["privacy.section5P1", "privacy.section5P2"],
  },
  {
    heading: "privacy.section6Heading",
    paragraphs: ["privacy.section6P1", "privacy.section6P2"],
  },
  {
    heading: "privacy.section7Heading",
    paragraphs: ["privacy.section7P1", "privacy.section7P2"],
  },
  {
    heading: "privacy.section8Heading",
    paragraphs: ["privacy.section8P1", "privacy.section8P2", "privacy.section8P3", "privacy.section8P4"],
  },
  {
    heading: "privacy.section9Heading",
    paragraphs: ["privacy.section9P1", "privacy.section9P2"],
  },
  {
    heading: "privacy.section10Heading",
    paragraphs: ["privacy.section10P1"],
  },
]

export default function PrivacyPage() {
  return (
    <InfoPageLayout
      pageTitle="privacy.pageTitle"
      heroHeading="privacy.heroHeading"
      heroSubtitle="privacy.heroSubtitle"
      lastUpdated="privacy.lastUpdated"
      sections={sections}
    />
  )
}
