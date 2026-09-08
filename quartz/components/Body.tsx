import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { CampaignSpoilerGate } from "./CampaignSpoilerGate"

function isCampaignPage(slug: string | undefined) {
  if (!slug) return false
  return /^campaigns\/(?:archived\/)?[^/]+(?:\/|$)/i.test(slug)
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
