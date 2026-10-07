import InfoPageLayout, { type InfoSection } from "../components/InfoPageLayout.tsx"

const sections: readonly InfoSection[] = [
  {
    heading: "dataDeletion.section1Heading",
    paragraphs: ["dataDeletion.section1P1", "dataDeletion.section1P2"],
  },
  {
    heading: "dataDeletion.section2Heading",
    paragraphs: ["dataDeletion.section2P1", "dataDeletion.section2P2", "dataDeletion.section2P3"],
  },
  {
    heading: "dataDeletion.section3Heading",
    paragraphs: ["dataDeletion.section3P1", "dataDeletion.section3P2"],
  },
  {
    heading: "dataDeletion.section4Heading",
    paragraphs: ["dataDeletion.section4P1", "dataDeletion.section4P2"],
  },
  {
    heading: "dataDeletion.section5Heading",
    paragraphs: ["dataDeletion.section5P1", "dataDeletion.section5P2"],
  },
  {
    heading: "dataDeletion.section6Heading",
    paragraphs: ["dataDeletion.section6P1"],
  },
]

export default function DataDeletionPage() {
  return (
    <InfoPageLayout
      pageTitle="dataDeletion.pageTitle"
      metaDescription="dataDeletion.metaDescription"
      heroHeading="dataDeletion.heroHeading"
      heroSubtitle="dataDeletion.heroSubtitle"
      lastUpdated="dataDeletion.lastUpdated"
      sections={sections}
    />
  )
}
