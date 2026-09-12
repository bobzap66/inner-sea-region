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

  // Explicit opt-in for unusual documents that should use publication typography.
  if (documentStyle === "formal-publication") return true

  // Newspaper and periodical articles carry both an article type and a publication name.
  if (type === "article" && publication.length > 0) return true

  // Kingmaker's migrated material predates the newer document-style metadata.
  // Treat only the known publication-style vignette families as formal prose,
  // leaving character vignettes, personal journals, and ordinary scenes alone.
  if (
    type === "vignette" &&
    /^campaigns\/kingmaker\/vignettes\/(?:the-lantern-and-ledger|pitax-gazette|scholarly-journals|intelligence-reports)\//.test(
      normalizedSlug,
    )
  ) {
    return true
  }

  // Kingmaker session reports are presented as newspaper/chronicle reports rather
  // than ordinary campaign notes, so give those report pages publication typography.
  if (
    type === "report" &&
    /^campaigns\/kingmaker\/session-notes\//.test(normalizedSlug)
  ) {
    return true
  }

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

const golarionMonths = [
  "Abadius",
  "Calistril",
  "Pharast",
  "Gozran",
  "Desnus",
  "Sarenith",
  "Erastus",
  "Arodus",
  "Rova",
  "Lamashan",
  "Neth",
  "Kuthona",
]

type CampaignDateParts = { year: number; month: number; day: number }

function validCampaignDate(year: number, month: number, day: number): CampaignDateParts | undefined {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return undefined
  if (month < 1 || month > 12 || day < 1 || day > 30) return undefined
  return { year, month, day }
}

function parseCampaignDate(value: unknown): CampaignDateParts | undefined {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    const year = Number(record.year)
    const month = Number(record.month)
    const day = Number(record.day)
    const parsedObject = validCampaignDate(year, month, day)
    if (parsedObject) return parsedObject
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim())
  if (!match) return undefined

  return validCampaignDate(Number(match[1]), Number(match[2]), Number(match[3]))
}

function formatCampaignDate(value: unknown) {
  const parsed = parseCampaignDate(value)
  if (!parsed) return undefined
  return `${parsed.day} ${golarionMonths[parsed.month - 1]} ${parsed.year} AR`
}

function formatCampaignRange(startValue: unknown, endValue: unknown) {
  const start = parseCampaignDate(startValue)
  const end = parseCampaignDate(endValue)
  if (!start || !end) return undefined

  if (start.year === end.year && start.month === end.month) {
    if (start.day === end.day) {
      return `${start.day} ${golarionMonths[start.month - 1]} ${start.year} AR`
    }
    return `${start.day}–${end.day} ${golarionMonths[start.month - 1]} ${start.year} AR`
  }

  if (start.year === end.year) {
    return `${start.day} ${golarionMonths[start.month - 1]}–${end.day} ${golarionMonths[end.month - 1]} ${start.year} AR`
  }

  return `${formatCampaignDate(startValue)}–${formatCampaignDate(endValue)}`
}

function morlibintCoverage(frontmatter: Record<string, unknown> | undefined) {
  if (!frontmatter) return undefined

  const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase()
  if (normalize(frontmatter.author) !== "morlibint") return undefined
  if (normalize(frontmatter.series) !== "chronicles of the new roseguard") return undefined

  const precision = normalize(frontmatter.campaign_date_precision)
  const explicitDateName = String(frontmatter.campaign_date_name ?? "").trim()
  const explicitRangeName = String(frontmatter.campaign_date_range_name ?? "").trim()
  const explicitStartName = String(frontmatter.campaign_date_start_name ?? "").trim()
  const explicitEndName = String(frontmatter.campaign_date_end_name ?? "").trim()

  if (explicitRangeName) return explicitRangeName
  if (explicitStartName && explicitEndName) return `${explicitStartName.replace(/ AR$/, "")}–${explicitEndName}`
  if (explicitDateName) return explicitDateName

  const range = formatCampaignRange(frontmatter.campaign_date_start, frontmatter.campaign_date_end)
  if (range) return range

  const single = formatCampaignDate(frontmatter.campaign_date)
  if (single) return single

  const start = formatCampaignDate(frontmatter.campaign_date_start)
  if (start) {
    return precision.includes("approx")
      ? `Beginning ${start} (exact span uncertain)`
      : `Beginning ${start}`
  }

  return undefined
}

const Body: QuartzComponent = (props: QuartzComponentProps) => {
  const { children, fileData } = props
  const lockedByDefault = isCampaignPage(fileData.slug)
  const frontmatter = fileData.frontmatter as Record<string, unknown> | undefined
  const formalPublication = isFormalPublication(frontmatter, fileData.slug)
  const coverage = morlibintCoverage(frontmatter)
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

          #quartz-body .morlibint-coverage {
            margin: 0 0 1rem;
            padding: 0.55rem 0.75rem;
            border-left: 3px solid var(--secondary);
            background: color-mix(in srgb, var(--lightgray) 65%, transparent);
            font-size: 0.95rem;
            line-height: 1.4;
          }
        `}</style>
      )}
      {lockedByDefault && <CampaignSpoilerGate {...props} />}
      {coverage && (
        <div class="morlibint-coverage">
          <strong>Period covered:</strong> {coverage}
        </div>
      )}
      {children}
    </div>
  )
}

export default (() => Body) satisfies QuartzComponentConstructor
