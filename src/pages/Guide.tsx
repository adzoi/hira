import InfoPageLayout, { type InfoSection } from "../components/InfoPageLayout.tsx"

const sections: readonly InfoSection[] = [
  {
    heading: "guide.section1Heading",
    paragraphs: ["guide.section1P1", "guide.section1P2"],
  },
  {
    heading: "guide.section2Heading",
    paragraphs: ["guide.section2P1", "guide.section2P2", "guide.section2P3"],
  },
  {
    heading: "guide.section3Heading",
    paragraphs: ["guide.section3P1", "guide.section3P2", "guide.section3P3"],
  },
  {
    heading: "guide.section4Heading",
    paragraphs: ["guide.section4P1", "guide.section4P2"],
  },
  {
    heading: "guide.section5Heading",
    paragraphs: ["guide.section5P1", "guide.section5P2"],
  },
]

export default function GuidePage() {
  return (
    <InfoPageLayout
      pageTitle="guide.pageTitle"
      heroHeading="guide.heroHeading"
      heroSubtitle="guide.heroSubtitle"
      sections={sections}
    />
  )
}
