import { promises as fs } from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

const CONTENT_ROOT = path.resolve("content")
const INDEX_FILE = path.join(CONTENT_ROOT, "index.md")
const COUNT = 3

const START = "<!-- HOMEPAGE_RECENTS_START -->"
const END = "<!-- HOMEPAGE_RECENTS_END -->"

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

function linkFor(rel) {
  return "./" + rel.split("/").map(encodeURIComponent).join("/")
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(date)
}

const notes = []
for (const file of await walk(CONTENT_ROOT)) {
  const rel = path.relative(CONTENT_ROOT, file).replace(/\\/g, "/")
  if (rel.toLowerCase() === "index.md") continue

  const text = await fs.readFile(file, "utf8")
  const fm = parseFrontmatter(text)
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

const brandNew = [...notes]
  .sort((a, b) => b.created - a.created || a.title.localeCompare(b.title))
  .slice(0, COUNT)

const brandNewPaths = new Set(brandNew.map((note) => note.rel))
const recentlyUpdated = [...notes]
  .filter((note) => !brandNewPaths.has(note.rel))
  .sort((a, b) => b.modified - a.modified || a.title.localeCompare(b.title))
  .slice(0, COUNT)

function renderSection(title, items, dateField) {
  const lines = [`### ${title}`, ""]
  for (const item of items) {
    lines.push(`- [${item.title}](${linkFor(item.rel)}) — ${formatDate(item[dateField])}`)
  }
  return lines.join("\n")
}

const block = [
  START,
  "## What's New",
  "",
  renderSection("Brand New", brandNew, "created"),
  "",
  renderSection("Recently Updated", recentlyUpdated, "modified"),
  END,
].join("\n")

let index = await fs.readFile(INDEX_FILE, "utf8")
const existing = new RegExp(`${START}[\\s\\S]*?${END}\\n*`, "m")
index = index.replace(existing, "")

const marker = "## Table of Contents"
if (index.includes(marker)) {
  index = index.replace(marker, `${block}\n\n${marker}`)
} else {
  index = `${index.trimEnd()}\n\n${block}\n`
}

await fs.writeFile(INDEX_FILE, index, "utf8")
console.log("Homepage recents generated")
console.log("Brand New:", brandNew.map((note) => note.title).join(", "))
console.log("Recently Updated:", recentlyUpdated.map((note) => note.title).join(", "))
