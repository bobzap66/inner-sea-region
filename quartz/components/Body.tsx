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
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `
(() => {
  if (window.__isrSitewideBasepathLinks) return
  window.__isrSitewideBasepathLinks = true

  const siteBase = () => (document.body?.dataset?.basepath || "").replace(/\\/$/, "")

  const normalizeLink = (link) => {
    const base = siteBase()
    if (!base) return

    const href = link.getAttribute("href")
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return

    let url
    try {
      url = new URL(href, location.origin)
    } catch (_) {
      return
    }

    if (url.origin !== location.origin) return
    if (url.pathname === base || url.pathname.startsWith(base + "/")) return
    if (!url.pathname.startsWith("/")) return

    const normalizedPath = (base + url.pathname).replace(/\\/+/g, "/")
    link.setAttribute("href", normalizedPath + url.search + url.hash)
  }

  const normalizeLinks = (root = document) => {
    if (root instanceof HTMLAnchorElement) normalizeLink(root)
    root.querySelectorAll?.("a[href]").forEach(normalizeLink)
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.target instanceof HTMLAnchorElement) {
        normalizeLink(mutation.target)
        continue
      }

      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) normalizeLinks(node)
      })
    }
  })

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["href"],
  })

  const normalizeEventLink = (event) => {
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null
    if (link instanceof HTMLAnchorElement) normalizeLink(link)
  }

  document.addEventListener("pointerover", normalizeEventLink, true)
  document.addEventListener("focusin", normalizeEventLink, true)
  document.addEventListener("mousedown", normalizeEventLink, true)
  document.addEventListener("click", normalizeEventLink, true)
  document.addEventListener("nav", () => normalizeLinks())

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => normalizeLinks(), { once: true })
  } else {
    normalizeLinks()
  }
})()
`,
        }}
      />
      <div id="quartz-body" class={lockedByDefault ? "campaign-spoiler-pending" : undefined}>
        {lockedByDefault && <CampaignSpoilerGate {...props} />}
        {children}
      </div>
    </>
  )
}

export default (() => Body) satisfies QuartzComponentConstructor
