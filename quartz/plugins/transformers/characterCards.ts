import fs from "node:fs"
import path from "node:path"
import YAML from "yaml"
import { QuartzTransformerPlugin } from "../types"
import { simplifySlug, slugifyFilePath } from "../../util/path"

const CARD_CSS = `
.isr-character-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 1rem;
  margin: 1rem 0 2rem;
}

.isr-character-card {
  position: relative;
  display: flex;
  overflow: hidden;
  min-height: 20rem;
  flex-direction: column;
  border: 1px solid var(--lightgray);
  border-radius: 0.65rem;
  background: color-mix(in srgb, var(--light) 90%, var(--lightgray) 10%);
  box-shadow: 0 0.15rem 0.55rem color-mix(in srgb, var(--dark) 10%, transparent);
  transition: transform 120ms ease, box-shadow 120ms ease;
}

.isr-character-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 0.3rem 0.8rem color-mix(in srgb, var(--dark) 16%, transparent);
}

.isr-character-card > a {
  display: flex;
  flex: 1;
  flex-direction: column;
  color: inherit;
  text-decoration: none;
}

.isr-character-card-image {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 5;
  margin: 0;
  object-fit: cover;
  object-position: top center;
  background: var(--lightgray);
  cursor: default;
}

.isr-character-card-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 0.8rem 0.9rem 0.9rem;
}

.isr-character-card-name {
  margin: 0;
  font-family: var(--headerFont);
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.2;
}

.isr-character-card-subtitle {
  margin: 0.3rem 0 0;
  color: var(--darkgray);
  font-size: 0.88rem;
  line-height: 1.35;
}

.isr-character-card-meta {
  display: flex;
  gap: 0.45rem;
  align-items: center;
  margin-top: auto;
  padding-top: 0.75rem;
  color: var(--gray);
  font-size: 0.76rem;
}

.isr-character-card-status {
  padding: 0.1rem 0.42rem;
  border: 1px solid var(--tertiary);
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.035em;
}

@media (max-width: 600px) {
  .isr-character-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.7rem;
  }

  .isr-character-card { min-height: 0; }
  .isr-character-card-copy { padding: 0.65rem; }
  .isr-character-card-name { font-size: 1rem; }
}
`

type CharacterNote = {
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
  return value.replaceAll("\\", "/").split("/").map((segment) =>
    segment === "." || segment === ".." ? segment : encodeURIComponent(segment)
  ).join("/")
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

function markdownFiles(directory: string): string[] {
  const result: string[] = []
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

function wikilinkTarget(value: unknown) {
  if (typeof value !== "string") return ""
  const match = value.match(/^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/)
  return (match ? match[1] : value).replaceAll("\\", "/").replace(/\.md$/i, "")
}

function characterKey(value: unknown) {
  const target = wikilinkTarget(value).trim()
  return target ? target.split("/").pop()?.toLowerCase() ?? "" : ""
}

export const CharacterCards: QuartzTransformerPlugin = () => {
  let root = ""
  let characters: CharacterNote[] = []
  let vignetteCounts = new Map<string, number>()

  const ensureIndex = (vaultRoot: string) => {
    if (root === vaultRoot && characters.length > 0) return
    root = vaultRoot
    const all = markdownFiles(vaultRoot).map((absolutePath) => {
      const relativePath = path.relative(vaultRoot, absolutePath).replaceAll("\\", "/")
      return {
        absolutePath,
        relativePath,
        slug: simplifySlug(slugifyFilePath(relativePath as any)),
        frontmatter: readFrontmatter(absolutePath),
      }
    })
    characters = all.filter((note) => note.frontmatter?.role === "player-character")
    vignetteCounts = new Map()
    for (const note of all.filter((note) => note.frontmatter?.type === "vignette")) {
      const key = characterKey(note.frontmatter?.character)
      if (key) vignetteCounts.set(key, (vignetteCounts.get(key) ?? 0) + 1)
    }
  }

  return {
    name: "CharacterCards",
    markdownPlugins(ctx) {
      return [() => (tree: any, file: any) => {
        const sourcePath = file.path || file.data?.filePath
        if (!sourcePath || !Array.isArray(tree?.children)) return
        const vaultRoot = path.resolve(ctx.argv.directory)
        ensureIndex(vaultRoot)

        const absoluteSource = path.resolve(sourcePath)
        const relativeSource = path.relative(vaultRoot, absoluteSource).replaceAll("\\", "/")
        const sourceDirectory = path.dirname(absoluteSource)
        const currentDirectory = path.dirname(relativeSource).replaceAll("\\", "/")

        tree.children = tree.children.map((node: any) => {
          if (node?.type !== "code" || node.lang !== "character-cards") return node

          let query: Record<string, any> = {}
          try { query = YAML.parse(String(node.value ?? "")) ?? {} } catch { query = {} }
          const wantedStatus = typeof query.status === "string" ? query.status.trim().toLowerCase() : ""
          const wantedGroup = typeof query.group === "string" ? query.group.trim().toLowerCase() : ""
          const excludedGroup = typeof query.exclude_group === "string" ? query.exclude_group.trim().toLowerCase() : ""

          const cards = characters
            .filter((character) => path.dirname(character.relativePath).replaceAll("\\", "/") === currentDirectory)
            .filter((character) => !wantedStatus || String(character.frontmatter?.status ?? "").trim().toLowerCase() === wantedStatus)
            .filter((character) => !wantedGroup || String(character.frontmatter?.card_group ?? "").trim().toLowerCase() === wantedGroup)
            .filter((character) => !excludedGroup || String(character.frontmatter?.card_group ?? "").trim().toLowerCase() !== excludedGroup)
            .sort((a, b) => Number(a.frontmatter?.card_order ?? 999) - Number(b.frontmatter?.card_order ?? 999) || String(a.frontmatter?.title ?? "").localeCompare(String(b.frontmatter?.title ?? "")))
            .map((character) => {
              const fm = character.frontmatter
              const title = fm.title ?? path.basename(character.relativePath, ".md")
              const portrait = typeof fm.portrait === "string" ? fm.portrait : undefined
              const subtitle = typeof fm.card_subtitle === "string" ? fm.card_subtitle : ""
              const status = typeof fm.status === "string" ? fm.status : ""
              const count = vignetteCounts.get(String(title).trim().toLowerCase()) ?? 0
              const slugText = String(character.slug).replaceAll("\\", "/")
              const href = `./${escapeHtml(slugText.split("/").pop() ?? slugText)}`
              const image = portrait
                ? `<img class="isr-character-card-image" src="${encodeRelativeUrl(path.relative(sourceDirectory, path.resolve(vaultRoot, portrait)))}" alt="Portrait of ${escapeHtml(title)}">`
                : ""
              return [
                '<article class="isr-character-card">',
                image,
                `<a href="${href}" aria-label="Open ${escapeHtml(title)} dossier">`,
                '<div class="isr-character-card-copy">',
                `<p class="isr-character-card-name">${escapeHtml(title)}</p>`,
                subtitle ? `<p class="isr-character-card-subtitle">${escapeHtml(subtitle)}</p>` : "",
                '<div class="isr-character-card-meta">',
                status ? `<span class="isr-character-card-status">${escapeHtml(status)}</span>` : "",
                `<span>${count} vignette${count === 1 ? "" : "s"}</span>`,
                "</div>",
                "</div>",
                "</a>",
                "</article>",
              ].join("\n")
            }).join("\n")

          return { type: "html", value: `<section class="isr-character-grid" aria-label="Character dossiers">\n${cards}\n</section>` }
        })
      }]
    },
    externalResources() {
      return { css: [{ content: CARD_CSS, inline: true }] }
    },
  }
}
