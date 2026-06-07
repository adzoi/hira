import InfoPageLayout, { type InfoSection } from "../components/InfoPageLayout.tsx"

const sections: readonly InfoSection[] = [
  {
    headingKey: "guide.section1Heading",
    paragraphKeys: ["guide.section1P1", "guide.section1P2"],
  },
  {
    headingKey: "guide.section2Heading",
    paragraphKeys: ["guide.section2P1", "guide.section2P2", "guide.section2P3"],
  },
  {
    headingKey: "guide.section3Heading",
    paragraphKeys: ["guide.section3P1", "guide.section3P2", "guide.section3P3"],
  },
  {
    headingKey: "guide.section4Heading",
    paragraphKeys: ["guide.section4P1", "guide.section4P2"],
  },
  {
    headingKey: "guide.section5Heading",
    paragraphKeys: ["guide.section5P1", "guide.section5P2"],
  },
]

export default function GuidePage() {
  return (
    <InfoPageLayout
      pageTitleKey="guide.pageTitle"
      heroHeadingKey="guide.heroHeading"
      heroSubtitleKey="guide.heroSubtitle"
      sections={sections}
    />
  )
}
