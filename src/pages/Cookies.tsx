import InfoPageLayout, { type InfoSection } from "../components/InfoPageLayout.tsx"

const sections: readonly InfoSection[] = [
  {
    headingKey: "cookies.section1Heading",
    paragraphKeys: ["cookies.section1P1", "cookies.section1P2"],
  },
  {
    headingKey: "cookies.section2Heading",
    paragraphKeys: ["cookies.section2P1", "cookies.section2P2"],
  },
  {
    headingKey: "cookies.section3Heading",
    paragraphKeys: ["cookies.section3P1", "cookies.section3P2", "cookies.section3P3"],
  },
  {
    headingKey: "cookies.section4Heading",
    paragraphKeys: ["cookies.section4P1", "cookies.section4P2", "cookies.section4P3"],
  },
  {
    headingKey: "cookies.section5Heading",
    paragraphKeys: ["cookies.section5P1", "cookies.section5P2"],
  },
  {
    headingKey: "cookies.section6Heading",
    paragraphKeys: ["cookies.section6P1"],
  },
]

export default function CookiesPage() {
  return (
    <InfoPageLayout
      pageTitleKey="cookies.pageTitle"
      heroHeadingKey="cookies.heroHeading"
      heroSubtitleKey="cookies.heroSubtitle"
      lastUpdatedKey="cookies.lastUpdated"
      sections={sections}
    />
  )
}
