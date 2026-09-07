import fs from "node:fs"
import path from "node:path"
import YAML from "yaml"
import { QuartzTransformerPlugin } from "../types"
import { resolveRelative, simplifySlug, slugifyFilePath } from "../../util/path"

const DOSSIER_CSS = `
.isr-character-dossier {
  display: grid;
  grid-template-columns: minmax(8rem, 11rem) 1fr;
  gap: 1.25rem;
  align-items: center;
  margin: 1rem 0 2rem;
  padding: 1rem;
  border: 1px solid var(--isr-rule, var(--lightgray));
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--light) 88%, var(--lightgray) 12%);
}

.isr-character-dossier img {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  margin: 0;
  border-radius: 0.4rem;
  object-fit: cover;
  object-position: top center;
}

.isr-character-dossier-copy {
  min-width: 0;
}

.isr-character-dossier-subtitle {
  margin: 0 0 0.35rem;
  color: var(--darkgray);
  font-family: var(--headerFont);
  font-size: 1.08rem;
  font-style: italic;
}

.isr-character-dossier-status {
  display: inline-block;
  margin-top: 0.3rem;
  padding: 0.16rem 0.55rem;
  border: 1px solid var(--tertiary);
  border-radius: 999px;
  color: var(--darkgray);
  font-family: var(--bodyFont);
  font-size: 0.78rem;
  letter-spacing: 0.035em;
  text-transform: uppercase;
}

.isr-vignette-collection {
  margin: 2.5rem 0 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--isr-rule, var(--lightgray));
}

.isr-vignette-collection h2 {
  margin-bottom: 0.8rem;
}

.isr-vignette-list {
  display: grid;
  gap: 0.65rem;
  padding: 0;
  list-style: none;
}

.isr-vignette-list li {
  margin: 0;
  padding: 0.7rem 0.85rem;
  border-left: 3px solid var(--tertiary);
  background: color-mix(in srgb, var(--light) 92%, var(--lightgray) 8%);
}

.isr-vignette-list a {
  font-family: var(--headerFont);
  font-weight: 700;
}

.isr-vignette-date {
  display: block;
  margin-top: 0.15rem;
  color: var(--gray);
  font-size: 0.85rem;
}

.isr-vignette-campaign-date {
  margin-left: 0.5rem;
}

.isr-vignette-nav {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 0.75rem;
  align-items: stretch;
  margin: 2.5rem 0 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--isr-rule, var(--lightgray));
}

.isr-vignette-nav a,
.isr-vignette-nav span {
  display: flex;
  align-items: center;
  min-height: 3rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--lightgray);
  border-radius: 0.4rem;
  text-decoration: none;
}

.isr-vignette-nav .isr-next { justify-content: flex-end; text-align: right; }
.isr-vignette-nav .isr-character-link { text-align: center; }
.isr-vignette-nav .isr-nav-empty { border-color: transparent; }

@media (max-width: 600px) {
  .isr-character-dossier {
    grid-template-columns: 6.5rem 1fr;
    gap: 0.85rem;
  }

  .isr-vignette-nav {
    grid-template-columns: 1fr 1fr;
  }

  .isr-vignette-nav .isr-character-link {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-content: center;
  }
}
`

type IndexedNote = {
  absolutePath: string
  relativePath: string
  slug: any
  frontmatter: Record<string, any>
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
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

function readFrontmatter(filePath: string): Record<string, any> {
  let source = ""
  try {
    source = fs.readFileSync(filePath, "utf8")
  } catch {
    return {}
  }

  if (!source.startsWith("---")) return {}
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return {}

  try {
    return YAML.parse(match[1]) ?? {}
  } catch {
    return {}
  }
}

function walkMarkdownFiles(directory: string): string[] {
  const result: string[] = []
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) visit(fullPath)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) result.push(fullPath)
    }
  }
  visit(directory)
  return result
}

function normalizeVaultPath(value: string) {
  return value.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\.md$/i, "")
}

function wikilinkTarget(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const match = value.match(/^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/)
  return normalizeVaultPath(match ? match[1] : value)
}

function formatPostDate(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) return undefined
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : value
  const match = String(text).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return String(text)
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`)
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date)
}

function campaignDateLabel(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return undefined
  return `Campaign date: ${String(value)}`
}

export const CampaignDossiers: QuartzTransformerPlugin = () => {
  let indexedRoot = ""
  let notes: IndexedNote[] = []
  let byPath = new Map<string, IndexedNote>()

  const ensureIndex = (vaultRoot: string) => {
    if (indexedRoot === vaultRoot && notes.length > 0) return
    indexedRoot = vaultRoot
    notes = walkMarkdownFiles(vaultRoot).map((absolutePath) => {
      const relativePath = path.relative(vaultRoot, absolutePath).replaceAll("\\", "/")
      const slug = simplifySlug(slugifyFilePath(relativePath as any))
      return { absolutePath, relativePath, slug, frontmatter: readFrontmatter(absolutePath) }
    })
    byPath = new Map(
      notes.map((note) => [normalizeVaultPath(note.relativePath), note]),
    )
  }

  const hrefBetween = (from: IndexedNote, to: IndexedNote) =>
    escapeHtml(resolveRelative(from.slug, to.slug))

  return {
    name: "CampaignDossiers",
    markdownPlugins(ctx) {
      return [
        () => {
          return (tree: any, file: any) => {
            const sourcePath = file.path || file.data?.filePath
            if (!sourcePath || !Array.isArray(tree?.children)) return

            const vaultRoot = path.resolve(ctx.argv.directory)
            ensureIndex(vaultRoot)

            const absoluteSource = path.resolve(sourcePath)
            const relativeSource = path.relative(vaultRoot, absoluteSource).replaceAll("\\", "/")
            const current = byPath.get(normalizeVaultPath(relativeSource))
            if (!current) return

            const fm = current.frontmatter

            if (fm.role === "player-character") {
              const portrait = typeof fm.portrait === "string" ? fm.portrait : undefined
              const subtitle = typeof fm.card_subtitle === "string" ? fm.card_subtitle : undefined
              const status = typeof fm.status === "string" ? fm.status : undefined

              if (portrait || subtitle || status) {
                const sourceDirectory = path.dirname(absoluteSource)
                const portraitHtml = portrait
                  ? `<img src="${encodeRelativeUrl(path.relative(sourceDirectory, path.resolve(vaultRoot, portrait)))}" alt="Portrait of ${escapeHtml(fm.title ?? path.basename(relativeSource, ".md"))}">`
                  : ""
                const headerHtml = [
                  '<aside class="isr-character-dossier" aria-label="Character dossier">',
                  portraitHtml,
                  '<div class="isr-character-dossier-copy">',
                  subtitle ? `<p class="isr-character-dossier-subtitle">${escapeHtml(subtitle)}</p>` : "",
                  status ? `<span class="isr-character-dossier-status">${escapeHtml(status)}</span>` : "",
                  "</div>",
                  "</aside>",
                ].join("\n")

                const firstHeading = tree.children.findIndex(
                  (node: any) => node?.type === "heading" && node.depth === 1,
                )
                tree.children.splice(firstHeading >= 0 ? firstHeading + 1 : 0, 0, {
                  type: "html",
                  value: headerHtml,
                })
              }

              const currentPath = normalizeVaultPath(current.relativePath)
              const vignettes = notes
                .filter((note) => note.frontmatter?.type === "vignette")
                .filter((note) => wikilinkTarget(note.frontmatter?.character) === currentPath)
                .sort((a, b) => {
                  const ad = String(a.frontmatter?.date ?? "")
                  const bd = String(b.frontmatter?.date ?? "")
                  return bd.localeCompare(ad) || b.relativePath.localeCompare(a.relativePath, undefined, { numeric: true })
                })

              if (vignettes.length > 0) {
                const items = vignettes
                  .map((note) => {
                    const title = note.frontmatter?.title ?? path.basename(note.relativePath, ".md")
                    const postDate = formatPostDate(note.frontmatter?.date)
                    const inWorldDate = campaignDateLabel(note.frontmatter?.campaign_date)
                    const dateParts = [
                      postDate ? `Posted ${escapeHtml(postDate)}` : "",
                      inWorldDate ? `<span class="isr-vignette-campaign-date">${escapeHtml(inWorldDate)}</span>` : "",
                    ].filter(Boolean).join(" · ")
                    return `<li><a href="${hrefBetween(current, note)}">${escapeHtml(title)}</a>${dateParts ? `<span class="isr-vignette-date">${dateParts}</span>` : ""}</li>`
                  })
                  .join("\n")

                tree.children.push({
                  type: "html",
                  value: [
                    '<section class="isr-vignette-collection" aria-labelledby="isr-vignettes-heading">',
                    '  <h2 id="isr-vignettes-heading">Vignettes</h2>',
                    '  <ul class="isr-vignette-list">',
                    items,
                    "  </ul>",
                    "</section>",
                  ].join("\n"),
                })
              }
            }

            if (fm.type === "vignette") {
              const characterPath = wikilinkTarget(fm.character)
              const character = characterPath ? byPath.get(characterPath) : undefined
              if (!character) return

              const siblings = notes
                .filter((note) => note.frontmatter?.type === "vignette")
                .filter((note) => wikilinkTarget(note.frontmatter?.character) === characterPath)
                .sort((a, b) => {
                  const ad = String(a.frontmatter?.date ?? "")
                  const bd = String(b.frontmatter?.date ?? "")
                  return ad.localeCompare(bd) || a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true })
                })

              const index = siblings.findIndex((note) => note.relativePath === current.relativePath)
              if (index < 0) return
              const previous = index > 0 ? siblings[index - 1] : undefined
              const next = index + 1 < siblings.length ? siblings[index + 1] : undefined
              const characterTitle = character.frontmatter?.title ?? path.basename(character.relativePath, ".md")

              const previousHtml = previous
                ? `<a class="isr-previous" href="${hrefBetween(current, previous)}">← ${escapeHtml(previous.frontmatter?.title ?? "Previous vignette")}</a>`
                : '<span class="isr-nav-empty" aria-hidden="true"></span>'
              const nextHtml = next
                ? `<a class="isr-next" href="${hrefBetween(current, next)}">${escapeHtml(next.frontmatter?.title ?? "Next vignette")} →</a>`
                : '<span class="isr-nav-empty" aria-hidden="true"></span>'

              tree.children.push({
                type: "html",
                value: [
                  '<nav class="isr-vignette-nav" aria-label="Vignette navigation">',
                  previousHtml,
                  `<a class="isr-character-link" href="${hrefBetween(current, character)}">All ${escapeHtml(characterTitle)} vignettes</a>`,
                  nextHtml,
                  "</nav>",
                ].join("\n"),
              })
            }
          }
        },
      ]
    },
    externalResources() {
      return {
        css: [{ content: DOSSIER_CSS, inline: true }],
      }
    },
  }
}
