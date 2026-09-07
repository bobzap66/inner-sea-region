import fs from "node:fs"
import path from "node:path"
import YAML from "yaml"
import { QuartzTransformerPlugin } from "../types"

const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"])

const CSS = `
.isr-metadata-gallery { margin: 1.5rem 0 2rem; }
.isr-metadata-gallery-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(12rem,1fr)); gap:1rem; }
.isr-metadata-gallery figure { margin:0; padding:.6rem; border:1px solid var(--isr-rule,var(--lightgray)); border-radius:.45rem; background:color-mix(in srgb,var(--light) 90%,var(--lightgray) 10%); }
.isr-metadata-gallery img { display:block; width:100%; aspect-ratio:1 / 1; object-fit:cover; object-position:top center; border-radius:.3rem; margin:0; }
.isr-metadata-gallery figcaption { margin-top:.55rem; color:var(--darkgray); font-size:.9rem; line-height:1.35; }
.isr-metadata-gallery-empty { padding:.75rem 1rem; border-left:3px solid var(--tertiary); background:var(--highlight); }
`

type ImageRecord = {
  filePath: string
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

function readFrontmatter(filePath: string): Record<string, any> {
  try {
    const source = fs.readFileSync(filePath, "utf8")
    const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
    return match ? (YAML.parse(match[1]) ?? {}) : {}
  } catch { return {} }
}

function walkMarkdownFiles(directory: string): string[] {
  const result: string[] = []
  if (!fs.existsSync(directory)) return result
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) visit(full)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) result.push(full)
    }
  }
  visit(directory)
  return result
}

function list(value: unknown): string[] {
  if (value == null) return []
  return (Array.isArray(value) ? value : [value]).map((item) => String(item)).filter(Boolean)
}

function semanticName(value: string) {
  const wiki = value.match(/^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]$/)
  if (wiki) return (wiki[2] ?? path.basename(wiki[1])).trim().toLowerCase()
  return value.trim().toLowerCase()
}

function matches(recordValues: string[], wanted?: unknown) {
  if (wanted == null || wanted === "") return true
  const targets = list(wanted).map(semanticName)
  const values = recordValues.map(semanticName)
  return targets.some((target) => values.includes(target))
}

function matchesDate(values: string[], wanted?: unknown) {
  if (wanted == null || wanted === "") return true
  const available = values.map(String)
  return list(wanted).some((target) => available.some((value) => value === target || value.startsWith(target + "-")))
}

export const ImageMetadataGallery: QuartzTransformerPlugin = () => {
  let indexedRoot = ""
  let records: ImageRecord[] = []

  const ensureIndex = (vaultRoot: string) => {
    if (indexedRoot === vaultRoot) return
    indexedRoot = vaultRoot
    const metadataRoot = path.join(vaultRoot, "Image Metadata")
    records = walkMarkdownFiles(metadataRoot).flatMap((filePath) => {
      const fm = readFrontmatter(filePath)
      if (fm.type !== "image" || typeof fm.asset !== "string") return []
      return [{
        filePath,
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
    name: "ImageMetadataGallery",
    markdownPlugins(ctx) {
      return [() => (tree: any, file: any) => {
        const sourcePath = file.path || file.data?.filePath
        if (!sourcePath) return
        const vaultRoot = path.resolve(ctx.argv.directory)
        ensureIndex(vaultRoot)
        const sourceDirectory = path.dirname(path.resolve(sourcePath))

        const transform = (parent: any) => {
          if (!Array.isArray(parent?.children)) return
          parent.children = parent.children.map((node: any) => {
            if (node?.type !== "code" || String(node.lang ?? "").toLowerCase() !== "image-gallery") {
              transform(node)
              return node
            }

            let query: Record<string, any> = {}
            try { query = YAML.parse(String(node.value ?? "")) ?? {} } catch {
              return { type: "html", value: '<p class="isr-metadata-gallery-empty">Invalid image-gallery query.</p>' }
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

            if (found.length === 0) return { type: "html", value: '<p class="isr-metadata-gallery-empty">No matching images are currently catalogued.</p>' }

            const figures = found.map((record) => {
              const absoluteAsset = path.resolve(vaultRoot, record.asset)
              if ((!absoluteAsset.startsWith(vaultRoot + path.sep) && absoluteAsset !== vaultRoot) || !IMAGE_EXTENSIONS.has(path.extname(absoluteAsset).toLowerCase())) return ""
              const src = encodeRelativeUrl(path.relative(sourceDirectory, absoluteAsset))
              const caption = record.caption || record.title
              return `<figure><img src="${src}" alt="${escapeHtml(caption)}" loading="lazy" decoding="async"><figcaption>${escapeHtml(caption)}</figcaption></figure>`
            }).filter(Boolean).join("\n")

            return { type: "html", value: `<section class="isr-metadata-gallery" aria-label="Image gallery"><div class="isr-metadata-gallery-grid">${figures}</div></section>` }
          })
        }
        transform(tree)
      }]
    },
    externalResources() { return { css: [{ content: CSS, inline: true }] } },
  }
}
