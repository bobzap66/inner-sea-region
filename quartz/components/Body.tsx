import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { CampaignSpoilerGate } from "./CampaignSpoilerGate"

function isCampaignPage(slug: string | undefined) {
  if (!slug) return false

  const directMatch = /^campaigns\/([^/]+)(?:\/|$)/i.exec(slug)
  if (!directMatch) return false

  const first = directMatch[1]?.toLowerCase()
  if (!first || first === "index") return false

  if (first === "archived") {
    const archivedKey = /^campaigns\/archived\/([^/]+)(?:\/|$)/i.exec(slug)?.[1]?.toLowerCase()
    return Boolean(archivedKey && archivedKey !== "index")
  }

  return true
}

function isFormalPublication(
  frontmatter: Record<string, unknown> | undefined,
  slug: string | undefined,
) {
  if (!frontmatter) return false

  const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase()
  const type = normalize(frontmatter.type)
  const articleType = normalize(frontmatter.article_type)
  const publication = normalize(frontmatter.publication)
  const documentStyle = normalize(frontmatter.document_style)
  const normalizedSlug = normalize(slug)

  if (documentStyle === "formal-publication") return true
  if (type === "article" && publication.length > 0) return true

  if (
    type === "vignette" &&
    /^campaigns\/kingmaker\/vignettes\/(?:the-lantern-and-ledger|pitax-gazette|scholarly-journals|intelligence-reports)\//.test(
      normalizedSlug,
    )
  ) {
    return true
  }

  if (
    type === "report" &&
    /^campaigns\/kingmaker\/session-notes\//.test(normalizedSlug)
  ) {
    return true
  }

  const formalTypes = new Set([
    "intelligence-report",
    "intelligence report",
    "intelligence-dossier",
    "intelligence dossier",
    "scholarly-journal",
    "scholarly journal",
    "journal-article",
    "journal article",
    "academic-paper",
    "academic paper",
    "scholarly-article",
    "scholarly article",
  ])

  return formalTypes.has(type) || formalTypes.has(articleType)
}

const Body: QuartzComponent = (props: QuartzComponentProps) => {
  const { children, fileData } = props
  const lockedByDefault = isCampaignPage(fileData.slug)
  const frontmatter = fileData.frontmatter as Record<string, unknown> | undefined
  const formalPublication = isFormalPublication(frontmatter, fileData.slug)
  const bodyClasses = [
    lockedByDefault ? "campaign-spoiler-pending" : "",
    formalPublication ? "formal-publication" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div id="quartz-body" class={bodyClasses || undefined}>
      {formalPublication && (
        <style>{`
          #quartz-body.formal-publication .center article p {
            text-align: justify !important;
            text-justify: inter-word;
            hyphens: auto;
          }
        `}</style>
      )}
      {lockedByDefault && <CampaignSpoilerGate {...props} />}
      {children}
    </div>
  )
}

export default (() => Body) satisfies QuartzComponentConstructor
