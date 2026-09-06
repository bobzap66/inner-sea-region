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

        {/* INNER SEA REGION SESSION GALLERY CAROUSEL */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(() => {
  const GALLERY_SELECTOR = [
    "article h2#session-gallery + p",
    "article h3#session-gallery + p",
    "article h2#gallery + p",
    "article h3#gallery + p",
  ].join(",")

  const wireGalleries = () => {
    document.querySelectorAll(GALLERY_SELECTOR).forEach((track) => {
      if (track.dataset.isrCarousel === "1") return

      const images = Array.from(track.children).filter((node) => node.tagName === "IMG")
      if (images.length < 2) return

      track.dataset.isrCarousel = "1"
      track.classList.add("isr-gallery-track")
      track.setAttribute("tabindex", "0")
      track.setAttribute("role", "group")
      track.setAttribute("aria-roledescription", "carousel")
      track.setAttribute("aria-label", "Image gallery")

      images.forEach((img, index) => {
        img.classList.add("isr-gallery-slide")
        img.setAttribute("loading", index === 0 ? "eager" : "lazy")
        img.setAttribute("decoding", "async")
      })

      const shell = document.createElement("div")
      shell.className = "isr-gallery-shell"
      track.parentNode.insertBefore(shell, track)
      shell.appendChild(track)

      const previous = document.createElement("button")
      previous.type = "button"
      previous.className = "isr-gallery-button isr-gallery-previous"
      previous.setAttribute("aria-label", "Previous image")
      previous.textContent = "‹"

      const next = document.createElement("button")
      next.type = "button"
      next.className = "isr-gallery-button isr-gallery-next"
      next.setAttribute("aria-label", "Next image")
      next.textContent = "›"

      const status = document.createElement("div")
      status.className = "isr-gallery-status"
      status.setAttribute("aria-live", "polite")

      shell.append(previous, next, status)

      let current = 0
      let scrollTimer

      const updateControls = () => {
        previous.disabled = current <= 0
        next.disabled = current >= images.length - 1
        status.textContent = (current + 1) + " / " + images.length
      }

      const goTo = (index) => {
        current = Math.max(0, Math.min(images.length - 1, index))
        images[current].scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "nearest",
          inline: "start",
        })
        updateControls()
      }

      previous.addEventListener("click", () => goTo(current - 1))
      next.addEventListener("click", () => goTo(current + 1))

      track.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault()
          goTo(current - 1)
        } else if (event.key === "ArrowRight") {
          event.preventDefault()
          goTo(current + 1)
        } else if (event.key === "Home") {
          event.preventDefault()
          goTo(0)
        } else if (event.key === "End") {
          event.preventDefault()
          goTo(images.length - 1)
        }
      })

      track.addEventListener("scroll", () => {
        window.clearTimeout(scrollTimer)
        scrollTimer = window.setTimeout(() => {
          const trackRect = track.getBoundingClientRect()
          let nearest = 0
          let nearestDistance = Infinity

          images.forEach((img, index) => {
            const distance = Math.abs(img.getBoundingClientRect().left - trackRect.left)
            if (distance < nearestDistance) {
              nearestDistance = distance
              nearest = index
            }
          })

          if (nearest !== current) {
            current = nearest
            updateControls()
          }
        }, 80)
      }, { passive: true })

      updateControls()
    })
  }

  document.addEventListener("nav", wireGalleries)

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireGalleries, { once: true })
  } else {
    wireGalleries()
  }
})()
`,
          }}
        />
        {/* END INNER SEA REGION SESSION GALLERY CAROUSEL */}

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

        {/* INNER SEA REGION SESSION GALLERY CAROUSEL STYLES */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
article .isr-gallery-shell {
  position: relative;
  margin: 1.25rem 0 2.5rem;
  padding: 0.8rem;
  border: 1px solid var(--isr-rule);
  border-radius: 0.45rem;
  background: color-mix(in srgb, var(--light) 82%, var(--lightgray) 18%);
  box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--light) 75%, transparent);
}

article .isr-gallery-shell > .isr-gallery-track {
  display: flex;
  grid-template-columns: none;
  gap: 0;
  width: 100%;
  margin: 0;
  padding: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-behavior: smooth;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
  background: transparent;
  border: 0;
  border-radius: 0.3rem;
  box-shadow: none;
}

article .isr-gallery-track::-webkit-scrollbar {
  display: none;
}

article .isr-gallery-track > img.isr-gallery-slide {
  flex: 0 0 100%;
  width: 100%;
  min-width: 100%;
  height: clamp(18rem, 58vw, 42rem);
  margin: 0;
  object-fit: contain;
  scroll-snap-align: start;
  scroll-snap-stop: always;
  background: color-mix(in srgb, var(--light) 88%, black 12%);
  border-radius: 0.28rem;
  transform: none;
}

article .isr-gallery-track > img.isr-gallery-slide:hover {
  transform: none;
}

article .isr-gallery-button {
  position: absolute;
  top: 50%;
  z-index: 3;
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--light) 55%, var(--dark) 45%);
  border-radius: 999px;
  background: color-mix(in srgb, var(--light) 82%, transparent);
  color: var(--dark);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
  font: 400 2rem/1 system-ui, sans-serif;
  cursor: pointer;
  transform: translateY(-50%);
  backdrop-filter: blur(4px);
}

article .isr-gallery-previous {
  left: 1.25rem;
}

article .isr-gallery-next {
  right: 1.25rem;
}

article .isr-gallery-button:hover:not(:disabled),
article .isr-gallery-button:focus-visible {
  background: var(--light);
  border-color: var(--tertiary);
  outline: none;
}

article .isr-gallery-button:disabled {
  opacity: 0.28;
  cursor: default;
}

article .isr-gallery-status {
  position: absolute;
  right: 1.25rem;
  bottom: 1.2rem;
  z-index: 3;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: rgba(20, 18, 15, 0.72);
  color: #fff;
  font-family: var(--bodyFont);
  font-size: 0.78rem;
  line-height: 1.4;
  pointer-events: none;
}

article .isr-gallery-track:focus-visible {
  outline: 2px solid var(--tertiary);
  outline-offset: 3px;
}

@media (max-width: 800px) {
  article .isr-gallery-shell {
    padding: 0.55rem;
  }

  article .isr-gallery-track > img.isr-gallery-slide {
    height: clamp(16rem, 72vw, 32rem);
  }

  article .isr-gallery-button {
    width: 2.35rem;
    height: 2.35rem;
    font-size: 1.65rem;
  }

  article .isr-gallery-previous {
    left: 0.85rem;
  }

  article .isr-gallery-next {
    right: 0.85rem;
  }

  article .isr-gallery-status {
    right: 0.85rem;
    bottom: 0.85rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  article .isr-gallery-shell > .isr-gallery-track {
    scroll-behavior: auto;
  }
}
`,
          }}
        />
        {/* END INNER SEA REGION SESSION GALLERY CAROUSEL STYLES */}

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