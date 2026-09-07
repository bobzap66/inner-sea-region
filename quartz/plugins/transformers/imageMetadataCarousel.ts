import fs from "node:fs"
import path from "node:path"
import YAML from "yaml"
import { QuartzTransformerPlugin } from "../types"

const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"])

const CSS = `
.isr-metadata-carousel { position:relative; margin:1.5rem 0 2.5rem; padding:.8rem 3.25rem 2.8rem; border:1px solid var(--isr-rule,var(--lightgray)); border-radius:.45rem; background:color-mix(in srgb,var(--light) 84%,var(--lightgray) 16%); box-shadow:inset 0 0 0 3px color-mix(in srgb,var(--light) 75%,transparent); }
.isr-metadata-carousel .isr-gallery-track { display:flex; gap:1rem; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none; overscroll-behavior-x:contain; }
.isr-metadata-carousel .isr-gallery-track::-webkit-scrollbar { display:none; }
.isr-metadata-carousel .isr-gallery-slide { flex:0 0 100%; min-width:0; margin:0; scroll-snap-align:start; scroll-snap-stop:always; text-align:center; }
.isr-metadata-carousel .isr-gallery-slide img { display:block; width:100%; max-height:min(68vh,46rem); margin:0 auto; object-fit:contain; }
.isr-metadata-carousel figcaption { margin-top:.7rem; color:var(--darkgray); font-size:.9rem; line-height:1.35; text-align:center; overflow-wrap:anywhere; }
.isr-metadata-carousel .isr-gallery-button { position:absolute; top:50%; z-index:2; width:2.4rem; height:2.4rem; border:1px solid var(--isr-rule,var(--lightgray)); border-radius:999px; background:color-mix(in srgb,var(--light) 88%,transparent); color:var(--dark); font:400 1.8rem/1 system-ui,sans-serif; cursor:pointer; transform:translateY(-70%); }
.isr-metadata-carousel .isr-gallery-previous { left:.45rem; }
.isr-metadata-carousel .isr-gallery-next { right:.45rem; }
.isr-metadata-carousel .isr-gallery-status { position:absolute; right:.9rem; bottom:.45rem; color:var(--gray); font-size:.82rem; }
.isr-metadata-carousel-empty { padding:.75rem 1rem; border-left:3px solid var(--tertiary); background:var(--highlight); }
@media (max-width:600px) { .isr-metadata-carousel { padding-inline:.5rem; padding-bottom:3.4rem; } .isr-metadata-carousel .isr-gallery-button { top:auto; bottom:.45rem; transform:none; } .isr-metadata-carousel .isr-gallery-previous { left:.5rem; } .isr-metadata-carousel .isr-gallery-next { left:3.3rem; right:auto; } }
`

const JS = `
(() => {
  const wire = () => document.querySelectorAll("[data-isr-metadata-carousel]").forEach((gallery) => {
    if (gallery.dataset.isrCarouselWired === "1") return
    const track = gallery.querySelector(".isr-gallery-track")
    const slides = Array.from(gallery.querySelectorAll(":scope .isr-gallery-slide"))
    if (!track || !slides.length) return
    gallery.dataset.isrCarouselWired = "1"
    if (slides.length === 1) return

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
    let timer
    const interval = Math.max(0, Number(gallery.dataset.interval || 10)) * 1000
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let paused = reducedMotion

    const update = () => { status.textContent = (current + 1) + " / " + slides.length }
    const stop = () => { if (timer) window.clearInterval(timer); timer = undefined }
    const start = () => { stop(); if (!paused && interval > 0) timer = window.setInterval(() => goTo(current + 1), interval) }
    const goTo = (index, manual = false) => {
      current = ((index % slides.length) + slides.length) % slides.length
      slides[current].scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest", inline: "start" })
      update()
      if (manual) start()
    }

    previous.addEventListener("click", () => goTo(current - 1, true))
    next.addEventListener("click", () => goTo(current + 1, true))
    gallery.addEventListener("mouseenter", () => { paused = true; stop() })
    gallery.addEventListener("mouseleave", () => { paused = reducedMotion; start() })
    gallery.addEventListener("focusin", () => { paused = true; stop() })
    gallery.addEventListener("focusout", (event) => { if (!gallery.contains(event.relatedTarget)) { paused = reducedMotion; start() } })

    track.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") { event.preventDefault(); goTo(current - 1, true) }
      else if (event.key === "ArrowRight") { event.preventDefault(); goTo(current + 1, true) }
      else if (event.key === "Home") { event.preventDefault(); goTo(0, true) }
      else if (event.key === "End") { event.preventDefault(); goTo(slides.length - 1, true) }
    })

    track.addEventListener("scroll", () => {
      window.clearTimeout(scrollTimer)
      scrollTimer = window.setTimeout(() => {
        const left = track.getBoundingClientRect().left
        let nearest = 0
        let distance = Infinity
        slides.forEach((slide, index) => {
          const d = Math.abs(slide.getBoundingClientRect().left - left)
          if (d < distance) { distance = d; nearest = index }
        })
        if (nearest !== current) { current = nearest; update(); start() }
      }, 80)
    }, { passive: true })

    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else start() })
    update()
    start()
  })

  document.addEventListener("nav", wire)
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire, { once: true })
  else wire()
})()
`

type ImageRecord = {
  asset: string
  title: string
  caption?: string
  playerCharacters: string[]
  npcs: string[]
  subjects: string[]
  campaigns: string[]
  groups: string[]
  locations: string[]
  events: string[]
  tags: string[]
  sessions: string[]
  articles: string[]
  campaignDates: string[]
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function encodeRelativeUrl(value: string) {
  return value.replaceAll("\\", "/").split("/").map((segment) => {
    if (segment === "." || segment === "..") return segment
    return encodeURIComponent(segment).replaceAll("%2C", ",")
  }).join("/")
}

function list(value: unknown): string[] {
  if (value == null) return []
  return (Array.isArray(value) ? value : [value]).map(String).filter(Boolean)
}

function semanticName(value: string) {
  const wiki = value.match(/^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]$/)
  return (wiki ? (wiki[2] ?? path.basename(wiki[1])) : value).trim().toLowerCase()
}

function matches(values: string[], wanted: unknown) {
  if (wanted == null || wanted === "") return true
  const available = values.map(semanticName)
  return list(wanted).map(semanticName).some((target) => available.includes(target))
}

function matchesDate(values: string[], wanted: unknown) {
  if (wanted == null || wanted === "") return true
  const available = values.map(String)
  return list(wanted).some((target) => available.some((value) => value === target || value.startsWith(target + "-")))
}

function readFrontmatter(filePath: string): Record<string, any> {
  try {
    const source = fs.readFileSync(filePath, "utf8")
    const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
    return match ? YAML.parse(match[1]) ?? {} : {}
  } catch {
    return {}
  }
}

function walk(directory: string): string[] {
  const files: string[] = []
  if (!fs.existsSync(directory)) return files
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) visit(full)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(full)
    }
  }
  visit(directory)
  return files
}

export const ImageMetadataCarousel: QuartzTransformerPlugin = () => {
  let indexedRoot = ""
  let records: ImageRecord[] = []

  const ensureIndex = (vaultRoot: string) => {
    if (indexedRoot === vaultRoot) return
    indexedRoot = vaultRoot
    records = walk(path.join(vaultRoot, "Image Metadata")).flatMap((filePath) => {
      const fm = readFrontmatter(filePath)
      if (fm.type !== "image" || typeof fm.asset !== "string") return []
      return [{
        asset: fm.asset.replaceAll("\\", "/").replace(/^\/+/, ""),
        title: String(fm.title ?? path.basename(fm.asset, path.extname(fm.asset))),
        caption: typeof fm.caption === "string" ? fm.caption : undefined,
        playerCharacters: list(fm.player_character ?? fm.player_characters ?? fm.character ?? fm.characters),
        npcs: list(fm.npc ?? fm.npcs),
        subjects: list(fm.subject ?? fm.subjects),
        campaigns: list(fm.campaign ?? fm.campaigns),
        groups: list(fm.group ?? fm.groups),
        locations: list(fm.location ?? fm.locations),
        events: list(fm.event ?? fm.events),
        tags: list(fm.tag ?? fm.tags),
        sessions: list(fm.session ?? fm.sessions),
        articles: list(fm.article ?? fm.articles),
        campaignDates: list(fm.campaign_date ?? fm.campaign_dates),
      }]
    })
  }

  return {
    name: "ImageMetadataCarousel",
    markdownPlugins(ctx) {
      return [
        () => (tree: any, file: any) => {
          const sourcePath = file.path || file.data?.filePath
          if (!sourcePath) return
          const vaultRoot = path.resolve(ctx.argv.directory)
          ensureIndex(vaultRoot)
          const sourceDirectory = path.dirname(path.resolve(sourcePath))

          const transform = (parent: any) => {
            if (!Array.isArray(parent?.children)) return
            parent.children = parent.children.map((node: any) => {
              if (node?.type !== "code" || String(node.lang ?? "").toLowerCase() !== "image-carousel") {
                transform(node)
                return node
              }

              let query: Record<string, any> = {}
              try {
                query = YAML.parse(String(node.value ?? "")) ?? {}
              } catch {
                return { type: "html", value: '<p class="isr-metadata-carousel-empty">Invalid image-carousel query.</p>' }
              }

              const found = records.filter((record) =>
                matches(record.playerCharacters, query.player_character ?? query.player_characters ?? query.character ?? query.characters) &&
                matches(record.npcs, query.npc ?? query.npcs) &&
                matches(record.subjects, query.subject ?? query.subjects) &&
                matches(record.campaigns, query.campaign ?? query.campaigns) &&
                matches(record.groups, query.group ?? query.groups) &&
                matches(record.locations, query.location ?? query.locations) &&
                matches(record.events, query.event ?? query.events) &&
                matches(record.tags, query.tag ?? query.tags) &&
                matches(record.sessions, query.session ?? query.sessions) &&
                matches(record.articles, query.article ?? query.articles) &&
                matchesDate(record.campaignDates, query.campaign_date ?? query.campaign_dates)
              )

              if (found.length === 0) {
                return { type: "html", value: '<p class="isr-metadata-carousel-empty">No matching images are currently catalogued.</p>' }
              }

              const slides = found.map((record, index) => {
                const absoluteAsset = path.resolve(vaultRoot, record.asset)
                if ((!absoluteAsset.startsWith(vaultRoot + path.sep) && absoluteAsset !== vaultRoot) || !IMAGE_EXTENSIONS.has(path.extname(absoluteAsset).toLowerCase())) return ""
                const src = encodeRelativeUrl(path.relative(sourceDirectory, absoluteAsset))
                const caption = record.caption || record.title
                return `<figure class="isr-gallery-slide"><img src="${src}" alt="${escapeHtml(caption)}" loading="${index === 0 ? "eager" : "lazy"}" decoding="async"><figcaption>${escapeHtml(caption)}</figcaption></figure>`
              }).filter(Boolean).join("\n")

              const rawInterval = Number(query.interval ?? 10)
              const interval = Number.isFinite(rawInterval) ? Math.min(120, Math.max(0, rawInterval)) : 10
              return {
                type: "html",
                value: `<div class="isr-metadata-carousel" data-isr-metadata-carousel data-interval="${interval}"><div class="isr-gallery-track" tabindex="0" role="group" aria-roledescription="carousel" aria-label="Image carousel">${slides}</div></div>`,
              }
            })
          }

          transform(tree)
        },
      ]
    },
    externalResources() {
      return {
        css: [{ content: CSS, inline: true }],
        js: [{ script: JS, contentType: "inline", loadTime: "afterDOMReady" }],
      }
    },
  }
}
