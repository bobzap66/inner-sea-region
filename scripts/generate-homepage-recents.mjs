import { promises as fs } from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

const CONTENT_ROOT = path.resolve(process.argv[2] ?? "content")
const INDEX_FILE = path.join(CONTENT_ROOT, "index.md")
const COUNT = 3

const HOME_START = "<!-- HOMEPAGE_RECENTS_START -->"
const HOME_END = "<!-- HOMEPAGE_RECENTS_END -->"
const CAMPAIGN_START = "<!-- CAMPAIGN_RECENTS_START -->"
const CAMPAIGN_END = "<!-- CAMPAIGN_RECENTS_END -->"

const IGNORED_DIRS = new Set([".git", ".obsidian", "private", "templates"])
const MAINTENANCE_COMMIT = /(autolink|wikilink|link conversion|resolver|homepage navigation|one-shot|migration|maintenance|script|quartz|workflow)/i

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name.toLowerCase())) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(full)))
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(full)
  }
  return files
}

function parseFrontmatter(text) {
  const match = /^---\s*\n([\s\S]*?)\n---/.exec(text)
  if (!match) return {}
  const fm = {}
  for (const line of match[1].split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*?)\s*$/.exec(line)
    if (!m) continue
    let value = m[2].replace(/^['"]|['"]$/g, "")
    if (/^(true|false)$/i.test(value)) value = value.toLowerCase() === "true"
    fm[m[1].toLowerCase()] = value
  }
  return fm
}

function gitHistory(rel) {
  try {
    const output = execFileSync(
      "git",
      ["log", "--follow", "--format=%aI%x09%s", "--", rel],
      { cwd: CONTENT_ROOT, encoding: "utf8" },
    ).trim()
    if (!output) return []
    return output.split(/\r?\n/).map((line) => {
      const tab = line.indexOf("\t")
      return {
        date: new Date(tab >= 0 ? line.slice(0, tab) : line),
        message: tab >= 0 ? line.slice(tab + 1) : "",
      }
    }).filter((entry) => !Number.isNaN(entry.date.valueOf()))
  } catch {
    return []
  }
}

function parseDate(value) {
  if (!value || typeof value !== "string") return null
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? null : date
}

function encodePath(rel) {
  return rel.split("/").map(encodeURIComponent).join("/")
}

function linkFrom(baseDir, targetRel) {
  const relative = path.posix.relative(baseDir || ".", targetRel)
  return encodePath(relative || path.posix.basename(targetRel))
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(date)
}

function chooseRecents(pool, excluded = new Set()) {
  const brandNew = [...pool]
    .filter((note) => !excluded.has(note.rel))
    .sort((a, b) => b.created - a.created || a.title.localeCompare(b.title))
    .slice(0, COUNT)

  const brandNewPaths = new Set([...excluded, ...brandNew.map((note) => note.rel)])
  const recentlyUpdated = [...pool]
    .filter((note) => !brandNewPaths.has(note.rel))
    .sort((a, b) => b.modified - a.modified || a.title.localeCompare(b.title))
    .slice(0, COUNT)

  return { brandNew, recentlyUpdated }
}

function renderSection(title, items, dateField, baseDir) {
  const lines = [`### ${title}`, ""]
  if (items.length === 0) {
    lines.push("- Nothing here yet.")
  } else {
    for (const item of items) {
      lines.push(`- [${item.title}](${linkFrom(baseDir, item.rel)}) — ${formatDate(item[dateField])}`)
    }
  }
  return lines.join("\n")
}

function renderBlock(start, end, recents, baseDir) {
  if (start === HOME_START) {
    return [
      start,
      '<section class="home-recents" aria-labelledby="whats-new">',
      "",
      "## What's New",
      "",
      '<div class="home-recent-column">',
      "",
      renderSection("Brand New", recents.brandNew, "created", baseDir),
      "",
      "</div>",
      '<div class="home-recent-column">',
      "",
      renderSection("Recently Updated", recents.recentlyUpdated, "modified", baseDir),
      "",
      "</div>",
      "</section>",
      end,
    ].join("\n")
  }
  return [
    start,
    "## What's New",
    "",
    renderSection("Brand New", recents.brandNew, "created", baseDir),
    "",
    renderSection("Recently Updated", recents.recentlyUpdated, "modified", baseDir),
    end,
  ].join("\n")
}

async function injectBlock(file, start, end, block, preferredMarker = null) {
  let text = await fs.readFile(file, "utf8")
  const existing = new RegExp(`${start}[\\s\\S]*?${end}\\n*`, "m")
  text = text.replace(existing, "")

  if (preferredMarker && text.includes(preferredMarker)) {
    text = text.replace(preferredMarker, `${block}\n\n${preferredMarker}`)
  } else {
    const firstSection = /^##\s+/m.exec(text)
    if (firstSection) {
      text = `${text.slice(0, firstSection.index).trimEnd()}\n\n${block}\n\n${text.slice(firstSection.index)}`
    } else {
      text = `${text.trimEnd()}\n\n${block}\n`
    }
  }

  await fs.writeFile(file, text, "utf8")
}

const notes = []
const campaigns = []

for (const file of await walk(CONTENT_ROOT)) {
  const rel = path.relative(CONTENT_ROOT, file).replace(/\\/g, "/")
  const text = await fs.readFile(file, "utf8")
  const fm = parseFrontmatter(text)

  if (String(fm.type ?? "").toLowerCase() === "campaign") {
    const match = /^Campaigns\/([^/]+)\/[^/]+\.md$/i.exec(rel)
    if (match) campaigns.push({ file, rel, dir: path.posix.dirname(rel), title: String(fm.title || match[1]) })
  }

  if (rel.toLowerCase() === "index.md") continue
  if (fm.draft === true || String(fm.type ?? "").toLowerCase() === "index") continue

  const history = gitHistory(rel)
  if (history.length === 0) continue

  const explicitCreated = parseDate(fm.created ?? fm.date)
  const explicitModified = parseDate(fm.modified ?? fm.updated)
  const created = explicitCreated ?? history.at(-1).date
  const meaningful = history.find((entry) => !MAINTENANCE_COMMIT.test(entry.message))
  const modified = explicitModified ?? meaningful?.date ?? history[0].date

  const title = String(fm.title || path.basename(rel, path.extname(rel))).trim()
  notes.push({ rel, title, created, modified })
}

const homeRecents = chooseRecents(notes)
await injectBlock(
  INDEX_FILE,
  HOME_START,
  HOME_END,
  renderBlock(HOME_START, HOME_END, homeRecents, "."),
  "<!-- HOMEPAGE_RECENTS -->",
)

console.log("Homepage recents generated")
console.log("Brand New:", homeRecents.brandNew.map((note) => note.title).join(", "))
console.log("Recently Updated:", homeRecents.recentlyUpdated.map((note) => note.title).join(", "))

for (const campaign of campaigns) {
  const prefix = `${campaign.dir}/`
  const pool = notes.filter((note) => note.rel.startsWith(prefix))
  const recents = chooseRecents(pool, new Set([campaign.rel]))
  const block = renderBlock(CAMPAIGN_START, CAMPAIGN_END, recents, campaign.dir)
  await injectBlock(campaign.file, CAMPAIGN_START, CAMPAIGN_END, block)
  console.log(`${campaign.title} recents generated`)
  console.log("  Brand New:", recents.brandNew.map((note) => note.title).join(", "))
  console.log("  Recently Updated:", recents.recentlyUpdated.map((note) => note.title).join(", "))
}
