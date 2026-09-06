import fs from "node:fs"
import path from "node:path"
import { QuartzTransformerPlugin } from "../types"

const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"])

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
                    '<figure class="isr-gallery-slide">',
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
})
