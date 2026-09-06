import fs from "node:fs"
import path from "node:path"
import { QuartzTransformerPlugin } from "../types"

const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"])

const GALLERY_CSS = `
.isr-folder-gallery {
  position: relative;
  margin: 1.5rem 0 2.5rem;
  padding: 0.8rem 3.25rem 3.6rem;
  border: 1px solid var(--isr-rule);
  border-radius: 0.45rem;
  background: color-mix(in srgb, var(--light) 84%, var(--lightgray) 16%);
  box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--light) 75%, transparent);
}

.isr-folder-gallery .isr-gallery-track {
  display: flex;
  gap: 1rem;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
}

.isr-folder-gallery .isr-gallery-track::-webkit-scrollbar {
  display: none;
}

.isr-folder-gallery .isr-gallery-slide {
  flex: 0 0 100%;
  min-width: 0;
  margin: 0;
  scroll-snap-align: start;
  scroll-snap-stop: always;
  text-align: center;
}

.isr-folder-gallery .isr-gallery-slide img {
  display: block;
  width: 100%;
  max-height: min(68vh, 46rem);
  margin: 0 auto;
  object-fit: contain;
}

.isr-folder-gallery .isr-gallery-slide figcaption {
  display: none;
}

.isr-folder-gallery .isr-gallery-button {
  position: absolute;
  top: 50%;
  z-index: 2;
  width: 2.4rem;
  height: 2.4rem;
  border: 1px solid var(--isr-rule);
  border-radius: 999px;
  background: color-mix(in srgb, var(--light) 88%, transparent);
  color: var(--dark);
  font: 400 1.8rem/1 system-ui, sans-serif;
  cursor: pointer;
  transform: translateY(-70%);
}

.isr-folder-gallery .isr-gallery-previous { left: 0.45rem; }
.isr-folder-gallery .isr-gallery-next { right: 0.45rem; }

.isr-folder-gallery .isr-gallery-caption {
  position: absolute;
  left: 3.25rem;
  right: 3.25rem;
  bottom: 1.45rem;
  color: var(--darkgray);
  font-size: 0.9rem;
  line-height: 1.35;
  text-align: center;
  overflow-wrap: anywhere;
}

.isr-folder-gallery .isr-gallery-status {
  position: absolute;
  right: 0.9rem;
  bottom: 0.45rem;
  color: var(--gray);
  font-size: 0.82rem;
}

.isr-gallery-error,
.isr-gallery-empty {
  padding: 0.75rem 1rem;
  border-left: 3px solid var(--tertiary);
  background: var(--highlight);
}

@media (max-width: 600px) {
  .isr-folder-gallery {
    padding-inline: 0.5rem;
    padding-bottom: 4.5rem;
  }

  .isr-folder-gallery .isr-gallery-button {
    top: auto;
    bottom: 0.45rem;
    transform: none;
  }

  .isr-folder-gallery .isr-gallery-previous { left: 0.5rem; }
  .isr-folder-gallery .isr-gallery-next { left: 3.3rem; right: auto; }

  .isr-folder-gallery .isr-gallery-caption {
    left: 0.5rem;
    right: 0.5rem;
    bottom: 2.95rem;
  }
}
`

const GALLERY_JS = `
(() => {
  const wireFolderGalleries = () => {
    document.querySelectorAll("[data-isr-gallery]").forEach((gallery) => {
      if (gallery.dataset.isrGalleryWired === "1") return

      const track = gallery.querySelector(".isr-gallery-track")
      const slides = Array.from(gallery.querySelectorAll(":scope .isr-gallery-slide"))
      if (!track || slides.length === 0) return

      gallery.dataset.isrGalleryWired = "1"

      const caption = document.createElement("div")
      caption.className = "isr-gallery-caption"
      caption.setAttribute("aria-live", "polite")
      gallery.append(caption)

      if (slides.length === 1) {
        caption.textContent = slides[0].dataset.filename || slides[0].querySelector("figcaption")?.textContent || ""
        return
      }

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

      gallery.append(previous, next, status)

      let current = 0
      let scrollTimer

      const updateControls = () => {
        status.textContent = (current + 1) + " / " + slides.length
        caption.textContent = slides[current].dataset.filename || slides[current].querySelector("figcaption")?.textContent || ""
      }

      const goTo = (index) => {
        current = ((index % slides.length) + slides.length) % slides.length
        slides[current].scrollIntoView({
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
          goTo(slides.length - 1)
        }
      })

      track.addEventListener("scroll", () => {
        window.clearTimeout(scrollTimer)
        scrollTimer = window.setTimeout(() => {
          const trackRect = track.getBoundingClientRect()
          let nearest = 0
          let nearestDistance = Infinity

          slides.forEach((slide, index) => {
            const distance = Math.abs(slide.getBoundingClientRect().left - trackRect.left)
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

  document.addEventListener("nav", wireFolderGalleries)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireFolderGalleries, { once: true })
  } else {
    wireFolderGalleries()
  }
})()
`

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function encodeRelativeUrl(value: string) {
  return value
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => (segment === "." || segment === ".." ? segment : encodeURIComponent(segment)))
    .join("/")
}

function naturalSort(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
}

export const FolderGallery: QuartzTransformerPlugin = () => ({
  name: "FolderGallery",
  markdownPlugins(ctx) {
    return [
      () => {
        return (tree: any, file: any) => {
          const sourcePath = file.path || file.data?.filePath
          if (!sourcePath) return

          const sourceDirectory = path.dirname(path.resolve(sourcePath))
          const vaultRoot = path.resolve(ctx.argv.directory)

          const transformChildren = (parent: any) => {
            if (!Array.isArray(parent?.children)) return

            parent.children = parent.children.map((node: any) => {
              if (node?.type !== "code" || String(node.lang ?? "").toLowerCase() !== "gallery") {
                transformChildren(node)
                return node
              }

              const requestedPath = String(node.value ?? "").trim()
              if (!requestedPath) {
                return {
                  type: "html",
                  value: '<p class="isr-gallery-error">Gallery folder path is empty.</p>',
                }
              }

              const isNoteRelative = requestedPath.startsWith("./") || requestedPath.startsWith("../")
              const galleryDirectory = isNoteRelative
                ? path.resolve(sourceDirectory, requestedPath)
                : path.resolve(vaultRoot, requestedPath.replace(/^[/\\]+/, ""))

              if (!galleryDirectory.startsWith(vaultRoot + path.sep) && galleryDirectory !== vaultRoot) {
                return {
                  type: "html",
                  value: `<p class="isr-gallery-error">Gallery folder is outside the vault: ${escapeHtml(requestedPath)}</p>`,
                }
              }

              let filenames: string[]
              try {
                filenames = fs
                  .readdirSync(galleryDirectory, { withFileTypes: true })
                  .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
                  .map((entry) => entry.name)
                  .sort(naturalSort)
              } catch {
                return {
                  type: "html",
                  value: `<p class="isr-gallery-error">Gallery folder not found: ${escapeHtml(requestedPath)}</p>`,
                }
              }

              if (filenames.length === 0) {
                return {
                  type: "html",
                  value: `<p class="isr-gallery-empty">No images found in gallery folder: ${escapeHtml(requestedPath)}</p>`,
                }
              }

              const slides = filenames
                .map((filename, index) => {
                  const absoluteImagePath = path.join(galleryDirectory, filename)
                  const relativeImagePath = path.relative(sourceDirectory, absoluteImagePath)
                  const src = encodeRelativeUrl(relativeImagePath)
                  const label = escapeHtml(filename)
                  const loading = index === 0 ? "eager" : "lazy"

                  return [
                    `<figure class="isr-gallery-slide" data-filename="${label}">`,
                    `  <img src="${src}" alt="${label}" title="${label}" loading="${loading}" decoding="async">`,
                    `  <figcaption>${label}</figcaption>`,
                    "</figure>",
                  ].join("\n")
                })
                .join("\n")

              return {
                type: "html",
                value: [
                  `<div class="isr-folder-gallery" data-isr-gallery data-gallery-folder="${escapeHtml(requestedPath)}">`,
                  '  <div class="isr-gallery-track" tabindex="0" role="group" aria-roledescription="carousel" aria-label="Image gallery">',
                  slides,
                  "  </div>",
                  "</div>",
                ].join("\n"),
              }
            })
          }

          transformChildren(tree)
        }
      },
    ]
  },
  externalResources() {
    return {
      css: [{ content: GALLERY_CSS, inline: true, spaPreserve: true }],
      js: [
        {
          script: GALLERY_JS,
          contentType: "inline",
          loadTime: "afterDOMReady",
          spaPreserve: true,
        },
      ],
    }
  },
})
