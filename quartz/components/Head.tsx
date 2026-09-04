import { i18n } from "../i18n"
import { FullSlug, getFileExtension, joinSegments, pathToRoot } from "../util/path"
import { CSSResourceToStyleElement, JSResourceToScriptElement } from "../util/resources"
import { googleFontHref, googleFontSubsetHref } from "../util/theme"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { unescapeHTML } from "../util/escape"

export default (() => {
  const Head: QuartzComponent = ({
    cfg,
    fileData,
    externalResources,
    ctx,
  }: QuartzComponentProps) => {
    const titleSuffix = cfg.pageTitleSuffix ?? ""
    const title =
      (fileData.frontmatter?.title ?? i18n(cfg.locale).propertyDefaults.title) + titleSuffix
    const description =
      fileData.frontmatter?.socialDescription ??
      fileData.frontmatter?.description ??
      unescapeHTML(fileData.description?.trim() ?? i18n(cfg.locale).propertyDefaults.description)

    const { css, js, additionalHead } = externalResources

    const url = new URL(`https://${cfg.baseUrl ?? "example.com"}`)
    const path = url.pathname as FullSlug
    const baseDir = fileData.slug === "404" ? path : pathToRoot(fileData.slug!)
    const iconPath = joinSegments(baseDir, "static/icon.png")

    // Url of current page
    const socialUrl =
      fileData.slug === "404" ? url.toString() : joinSegments(url.toString(), fileData.slug!)

    const usesCustomOgImage = ctx.cfg.plugins.emitters.some((e) => e.name === "CustomOgImages")
    const ogImageDefaultPath = `https://${cfg.baseUrl}/static/og-image.png`

    const coreStylesheet = css[0]?.content
    const coreScript = js.find(
      (r) => r.loadTime === "beforeDOMReady" && r.contentType === "external",
    )

    return (
      <head>
        <title>{title}</title>
        <meta charSet="utf-8" />
        {coreStylesheet && <link rel="preload" href={coreStylesheet} as="style" />}
        {coreScript && coreScript.contentType === "external" && (
          <link rel="preload" href={coreScript.src} as="script" />
        )}
        {cfg.theme.cdnCaching && cfg.theme.fontOrigin === "googleFonts" && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" />
            <link rel="stylesheet" href={googleFontHref(cfg.theme)} />
            {cfg.theme.typography.title && (
              <link rel="stylesheet" href={googleFontSubsetHref(cfg.theme, cfg.pageTitle)} />
            )}
          </>
        )}
        <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossOrigin="anonymous" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />

        <meta name="og:site_name" content={cfg.pageTitle}></meta>
        <meta property="og:title" content={title} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta property="og:description" content={description} />
        <meta property="og:image:alt" content={description} />

        {!usesCustomOgImage && (
          <>
            <meta property="og:image" content={ogImageDefaultPath} />
            <meta property="og:image:url" content={ogImageDefaultPath} />
            <meta name="twitter:image" content={ogImageDefaultPath} />
            <meta
              property="og:image:type"
              content={`image/${getFileExtension(ogImageDefaultPath) ?? "png"}`}
            />
          </>
        )}

        {cfg.baseUrl && (
          <>
            <meta property="twitter:domain" content={cfg.baseUrl}></meta>
            <meta property="og:url" content={socialUrl}></meta>
            <meta property="twitter:url" content={socialUrl}></meta>
          </>
        )}

        <link rel="icon" href={iconPath} />
        <meta name="description" content={description} />
        <meta name="generator" content="Quartz" />

        {/* INNER SEA REGION IMAGE LIGHTBOX */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(() => {
  const IMAGE_SELECTOR = [
    ".center article img",
    ".right.sidebar .world-anvil-side-content img",
    ".right.sidebar .callout[data-callout='side'] img",
  ].join(",")

  const ensureLightbox = () => {
    let overlay = document.getElementById("isr-image-lightbox")
    if (overlay) return overlay

    overlay = document.createElement("div")
    overlay.id = "isr-image-lightbox"
    overlay.setAttribute("aria-hidden", "true")
    overlay.innerHTML = [
      '<button class="isr-lightbox-close" type="button" aria-label="Close image">×</button>',
      '<div class="isr-lightbox-stage">',
      '  <img class="isr-lightbox-image" alt="">',
      '  <div class="isr-lightbox-caption"></div>',
      '</div>',
    ].join("")

    document.body.appendChild(overlay)

    const close = () => {
      overlay.classList.remove("is-open", "is-natural-size")
      overlay.setAttribute("aria-hidden", "true")
      document.documentElement.classList.remove("isr-lightbox-open")

      const img = overlay.querySelector(".isr-lightbox-image")
      if (img) img.removeAttribute("src")
    }

    overlay.querySelector(".isr-lightbox-close")?.addEventListener("click", close)

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target?.classList?.contains("isr-lightbox-stage")) {
        close()
      }
    })

    overlay.querySelector(".isr-lightbox-image")?.addEventListener("click", (event) => {
      event.stopPropagation()
      overlay.classList.toggle("is-natural-size")
    })

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && overlay.classList.contains("is-open")) {
        close()
      }
    })

    return overlay
  }

  const openImage = (source) => {
    const overlay = ensureLightbox()
    const target = overlay.querySelector(".isr-lightbox-image")
    const caption = overlay.querySelector(".isr-lightbox-caption")
    if (!target) return

    target.src = source.currentSrc || source.src
    target.alt = source.alt || ""

    const captionText = source.alt?.trim() || source.title?.trim() || ""
    if (caption) {
      caption.textContent = captionText
      caption.hidden = captionText.length === 0
    }

    overlay.classList.remove("is-natural-size")
    overlay.classList.add("is-open")
    overlay.setAttribute("aria-hidden", "false")
    document.documentElement.classList.add("isr-lightbox-open")
  }

  const wireImages = () => {
    ensureLightbox()

    document.querySelectorAll(IMAGE_SELECTOR).forEach((img) => {
      if (img.dataset.isrLightbox === "1") return
      if (img.closest("[data-no-lightbox], .no-lightbox")) return

      img.dataset.isrLightbox = "1"
      img.classList.add("isr-zoomable-image")
      img.setAttribute("tabindex", "0")
      img.setAttribute("role", "button")

      const open = (event) => {
        event.preventDefault()
        event.stopPropagation()
        openImage(img)
      }

      img.addEventListener("click", open)
      img.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          open(event)
        }
      })
    })
  }

  document.addEventListener("nav", wireImages)

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireImages, { once: true })
  } else {
    wireImages()
  }
})()
`,
          }}
        />
        {/* END INNER SEA REGION IMAGE LIGHTBOX */}

        {/* INNER SEA REGION TRUE SIDEBAR BRIDGE */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(() => {
  const moveWorldAnvilSideContent = () => {
    const rightSidebar = document.querySelector(".right.sidebar")
    if (!rightSidebar) return

    rightSidebar
      .querySelectorAll(":scope > .world-anvil-side-content")
      .forEach((node) => node.remove())

    const sideBlocks = document.querySelectorAll(
      ".center article .callout[data-callout='side']",
    )

    const sidebarHeadingIds = new Set()

    sideBlocks.forEach((block) => {
      block.querySelectorAll("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]").forEach((heading) => {
        sidebarHeadingIds.add(heading.id)
      })

      block.classList.add("world-anvil-side-content")
      rightSidebar.appendChild(block)
    })

    if (sidebarHeadingIds.size > 0) {
      document.querySelectorAll(".toc a[href^='#']").forEach((link) => {
        const id = decodeURIComponent(link.getAttribute("href").slice(1))
        if (sidebarHeadingIds.has(id)) {
          const item = link.closest("li")
          if (item) item.remove()
          else link.remove()
        }
      })
    }
  }

  document.addEventListener("nav", moveWorldAnvilSideContent)

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", moveWorldAnvilSideContent, { once: true })
  } else {
    moveWorldAnvilSideContent()
  }
})()
`,
          }}
        />
        {/* END INNER SEA REGION TRUE SIDEBAR BRIDGE */}
        {css.map((resource) => CSSResourceToStyleElement(resource, true))}
        {js
          .filter((resource) => resource.loadTime === "beforeDOMReady")
          .map((res) => JSResourceToScriptElement(res, true))}
        {additionalHead.map((resource) => {
          if (typeof resource === "function") {
            return resource(fileData)
          } else {
            return resource
          }
        })}
      </head>
    )
  }

  return Head
}) satisfies QuartzComponentConstructor
