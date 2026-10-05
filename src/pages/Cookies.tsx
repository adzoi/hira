import InfoPageLayout, { type InfoSection } from "../components/InfoPageLayout.tsx"

const sections: readonly InfoSection[] = [
  {
    heading: "cookies.section1Heading",
    paragraphs: ["cookies.section1P1", "cookies.section1P2"],
  },
  {
    heading: "cookies.section2Heading",
    paragraphs: ["cookies.section2P1", "cookies.section2P2"],
  },
  {
    heading: "cookies.section3Heading",
    paragraphs: ["cookies.section3P1", "cookies.section3P2", "cookies.section3P3"],
  },
  {
    heading: "cookies.section4Heading",
    paragraphs: ["cookies.section4P1", "cookies.section4P2", "cookies.section4P3"],
  },
  {
    heading: "cookies.section5Heading",
    paragraphs: ["cookies.section5P2"],
  },
  {
    heading: "cookies.section6Heading",
    paragraphs: ["cookies.section6P1"],
  },
]

export default function CookiesPage() {
  return (
    <InfoPageLayout
      pageTitle="cookies.pageTitle"
      metaDescription="cookies.metaDescription"
      heroHeading="cookies.heroHeading"
      heroSubtitle="cookies.heroSubtitle"
      lastUpdated="cookies.lastUpdated"
      sections={sections}
    />
  )
}
