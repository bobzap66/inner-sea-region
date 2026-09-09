import fs from "node:fs"
import path from "node:path"
import YAML from "yaml"
import { QuartzTransformerPlugin } from "../types"
import { simplifySlug, slugifyFilePath } from "../../util/path"

const AUTHOR_CSS = `
.isr-author-card {
  display: grid;
  grid-template-columns: 5.5rem minmax(0, 1fr);
  gap: 1rem;
  align-items: center;
  margin: 1.25rem 0 1.75rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--lightgray);
  border-radius: 0.65rem;
  background: color-mix(in srgb, var(--light) 91%, var(--lightgray) 9%);
  box-shadow: 0 0.12rem 0.45rem color-mix(in srgb, var(--dark) 8%, transparent);
}

.isr-author-card-portrait,
.isr-author-card-initials {
  width: 5.5rem;
  height: 5.5rem;
  margin: 0;
  border-radius: 0.5rem;
  object-fit: cover;
  object-position: top center;
  background: var(--lightgray);
}

.isr-author-card-initials {
  display: grid;
  place-items: center;
  color: var(--darkgray);
  font-family: var(--headerFont);
  font-size: 1.55rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.isr-author-card-copy { min-width: 0; }

.isr-author-card-eyebrow {
  margin: 0 0 0.15rem;
  color: var(--gray);
  font-size: 0.73rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.isr-author-card-name {
  margin: 0;
  font-family: var(--headerFont);
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.2;
}

.isr-author-card-role {
  margin: 0.15rem 0 0.4rem;
  color: var(--darkgray);
  font-size: 0.9rem;
  font-style: italic;
}

.isr-author-card-bio {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.45;
}

.isr-author-card-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem 0.85rem;
  align-items: baseline;
  margin-top: 0.55rem;
  font-size: 0.8rem;
}

.isr-author-card-count { color: var(--gray); }

.isr-author-card-link {
  font-weight: 700;
  text-decoration: none;
}

.isr-author-articles {
  margin: 1.5rem 0;
}

.isr-author-articles ul {
  margin-top: 0.6rem;
}

.isr-author-article-date {
  color: var(--gray);
  font-size: 0.88em;
}

@media (max-width: 600px) {
  .isr-author-card {
    grid-template-columns: 4.25rem minmax(0, 1fr);
    gap: 0.75rem;
    padding: 0.75rem;
  }

  .isr-author-card-portrait,
  .isr-author-card-initials {
    width: 4.25rem;
    height: 4.25rem;
  }

  .isr-author-card-initials { font-size: 1.2rem; }
}
`

type Note = {
  absolutePath: string
  relativePath: string
  slug: any
  frontmatter: Record<string, any>
}

const GOLARION_MONTHS = new Map([
  ["abadius", 1],
  ["calistril", 2],
  ["pharast", 3],
  ["gozran", 4],
  ["desnus", 5],
  ["sarenith", 6],
  ["erastus", 7],
  ["arodus", 8],
  ["rova", 9],
  ["lamashan", 10],
  ["neth", 11],
  ["kuthona", 12],
])

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

function authorKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase()
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("")
}

function publicationRank(value: unknown) {
  const text = String(value ?? "").trim()
  const golarion = text.match(/^(\d+)-([A-Za-z]+)-(\d+)$/)
  if (golarion) {
    const year = Number(golarion[1])
    const month = GOLARION_MONTHS.get(golarion[2].toLowerCase()) ?? 0
    const day = Number(golarion[3])
    return year * 10000 + month * 100 + day
  }
  const iso = Date.parse(text)
  return Number.isFinite(iso) ? iso : 0
}

function relativeSlugHref(fromRelativePath: string, toSlug: any) {
  const fromSlug = simplifySlug(slugifyFilePath(fromRelativePath as any))
  const fromDirectory = path.posix.dirname(String(fromSlug).replaceAll("\\", "/"))
  let href = path.posix.relative(fromDirectory, String(toSlug).replaceAll("\\", "/"))
  if (!href.startsWith(".")) href = `./${href}`
  return href
}

export const ArticleAuthorCards: QuartzTransformerPlugin = () => {
  let root = ""
  let authors = new Map<string, Note>()
  let articlesByAuthor = new Map<string, Note[]>()

  const ensureIndex = (vaultRoot: string) => {
    if (root === vaultRoot && authors.size > 0) return
    root = vaultRoot
    authors = new Map()
    articlesByAuthor = new Map()

    const all = markdownFiles(vaultRoot).map((absolutePath) => {
      const relativePath = path.relative(vaultRoot, absolutePath).replaceAll("\\", "/")
      return {
        absolutePath,
        relativePath,
        slug: simplifySlug(slugifyFilePath(relativePath as any)),
        frontmatter: readFrontmatter(absolutePath),
      }
    })

    for (const note of all) {
      if (note.frontmatter?.type === "author") {
        const key = authorKey(note.frontmatter?.title ?? path.basename(note.relativePath, ".md"))
        if (key) authors.set(key, note)
      }
      if (note.frontmatter?.type === "article") {
        const key = authorKey(note.frontmatter?.author)
        if (key) {
          const list = articlesByAuthor.get(key) ?? []
          list.push(note)
          articlesByAuthor.set(key, list)
        }
      }
    }

    for (const list of articlesByAuthor.values()) {
      list.sort((a, b) => publicationRank(a.frontmatter?.publication_date) - publicationRank(b.frontmatter?.publication_date)
        || String(a.frontmatter?.title ?? "").localeCompare(String(b.frontmatter?.title ?? "")))
    }
  }

  return {
    name: "ArticleAuthorCards",
    markdownPlugins(ctx) {
      return [() => (tree: any, file: any) => {
        const sourcePath = file.path || file.data?.filePath
        if (!sourcePath || !Array.isArray(tree?.children)) return

        const vaultRoot = path.resolve(ctx.argv.directory)
        ensureIndex(vaultRoot)

        const absoluteSource = path.resolve(sourcePath)
        const relativeSource = path.relative(vaultRoot, absoluteSource).replaceAll("\\", "/")
        const sourceFm = readFrontmatter(absoluteSource)

        if (sourceFm?.type === "author") {
          const key = authorKey(sourceFm?.title ?? path.basename(relativeSource, ".md"))
          const articles = articlesByAuthor.get(key) ?? []
          if (articles.length === 0) return

          const name = String(sourceFm?.title ?? path.basename(relativeSource, ".md"))
          const items = articles.map((article) => {
            const title = String(article.frontmatter?.title ?? path.basename(article.relativePath, ".md"))
            const date = String(article.frontmatter?.publication_date ?? "").trim()
            const href = relativeSlugHref(relativeSource, article.slug)
            return `<li><a href="${escapeHtml(href)}">${escapeHtml(title)}</a>${date ? ` <span class="isr-author-article-date">— ${escapeHtml(date)}</span>` : ""}</li>`
          }).join("\n")

          const section = [
            '<section class="isr-author-articles">',
            `<h2>Articles by ${escapeHtml(name)}</h2>`,
            `<ul>\n${items}\n</ul>`,
            "</section>",
          ].join("\n")

          const breaks = tree.children
            .map((node: any, index: number) => node?.type === "thematicBreak" ? index : -1)
            .filter((index: number) => index >= 0)
          const insertAt = breaks.length > 0 ? breaks[breaks.length - 1] : tree.children.length
          tree.children.splice(insertAt, 0, { type: "html", value: section })
          return
        }

        if (sourceFm?.type !== "article") return

        const key = authorKey(sourceFm?.author)
        const author = authors.get(key)
        if (!author) return

        const fm = author.frontmatter
        const name = String(fm.title ?? path.basename(author.relativePath, ".md"))
        const role = typeof fm.role === "string" ? fm.role : ""
        const shortBio = typeof fm.short_bio === "string" ? fm.short_bio : ""
        const portrait = typeof fm.portrait === "string" ? fm.portrait : ""
        const count = articlesByAuthor.get(key)?.length ?? 0

        const authorHref = relativeSlugHref(relativeSource, author.slug)
        const sourceDirectory = path.dirname(absoluteSource)
        const imageHtml = portrait
          ? `<img class="isr-author-card-portrait" src="${encodeRelativeUrl(path.relative(sourceDirectory, path.resolve(vaultRoot, portrait)))}" alt="Portrait of ${escapeHtml(name)}">`
          : `<div class="isr-author-card-initials" aria-hidden="true">${escapeHtml(initials(name))}</div>`

        const card = [
          '<aside class="isr-author-card" aria-label="About the author">',
          imageHtml,
          '<div class="isr-author-card-copy">',
          '<p class="isr-author-card-eyebrow">About the author</p>',
          `<p class="isr-author-card-name">${escapeHtml(name)}</p>`,
          role ? `<p class="isr-author-card-role">${escapeHtml(role)}</p>` : "",
          shortBio ? `<p class="isr-author-card-bio">${escapeHtml(shortBio)}</p>` : "",
          '<div class="isr-author-card-footer">',
          `<a class="isr-author-card-link" href="${escapeHtml(authorHref)}">About ${escapeHtml(name)} →</a>`,
          `<span class="isr-author-card-count">${count} article${count === 1 ? "" : "s"} in the archive</span>`,
          "</div>",
          "</div>",
          "</aside>",
        ].join("\n")

        const firstBreak = tree.children.findIndex((node: any) => node?.type === "thematicBreak")
        const insertAt = firstBreak >= 0 ? firstBreak + 1 : 0
        tree.children.splice(insertAt, 0, { type: "html", value: card })
      }]
    },
    externalResources() {
      return { css: [{ content: AUTHOR_CSS, inline: true }] }
    },
  }
}
