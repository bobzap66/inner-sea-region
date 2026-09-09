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

function isFormalPublication(frontmatter: Record<string, unknown> | undefined) {
  if (!frontmatter) return false

  const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase()
  const type = normalize(frontmatter.type)
  const articleType = normalize(frontmatter.article_type)
  const publication = normalize(frontmatter.publication)
  const documentStyle = normalize(frontmatter.document_style)

  // Explicit opt-in for unusual documents that should use publication typography.
  if (documentStyle === "formal-publication") return true

  // Newspaper and periodical articles carry both an article type and a publication name.
  if (type === "article" && publication.length > 0) return true

  // Formal report / journal families. Keep personal journals and ordinary notes left-aligned.
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
  const formalPublication = isFormalPublication(fileData.frontmatter as Record<string, unknown> | undefined)
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
          #quartz-body.formal-publication article > p {
            text-align: justify;
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
