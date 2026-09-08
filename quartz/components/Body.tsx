import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

function isCampaignPage(slug: string | undefined) {
  if (!slug) return false
  return /^campaigns\/(?:archived\/)?[^/]+(?:\/|$)/i.test(slug)
}

const Body: QuartzComponent = ({ children, fileData }: QuartzComponentProps) => {
  const lockedByDefault = isCampaignPage(fileData.slug)
  return (
    <div id="quartz-body" class={lockedByDefault ? "campaign-spoiler-pending" : undefined}>
      {children}
    </div>
  )
}

Body.css = `
#quartz-body.campaign-spoiler-pending > * {
  visibility: hidden !important;
}

#quartz-body.campaign-spoiler-pending .campaign-spoiler-gate {
  visibility: visible !important;
}
`

export default (() => Body) satisfies QuartzComponentConstructor
