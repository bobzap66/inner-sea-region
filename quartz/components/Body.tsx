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

const Body: QuartzComponent = (props: QuartzComponentProps) => {
  const { children, fileData } = props
  const lockedByDefault = isCampaignPage(fileData.slug)

  return (
    <div id="quartz-body" class={lockedByDefault ? "campaign-spoiler-pending" : undefined}>
      {lockedByDefault && <CampaignSpoilerGate {...props} />}
      {children}
    </div>
  )
}

export default (() => Body) satisfies QuartzComponentConstructor
