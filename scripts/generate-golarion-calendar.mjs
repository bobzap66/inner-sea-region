import { promises as fs } from "node:fs"
import path from "node:path"

const CONTENT_ROOT = path.resolve("content")
const OUTPUT_FILE = path.resolve("quartz/static/golarion-events.json")
const CALENDAR_NAME = "Calendar of Golarion"
const MONTHS = [
  "Abadius",
  "Calistril",
  "Pharast",
  "Gozran",
  "Desnus",
  "Sarenith",
  "Erastus",
  "Arodus",
  "Rova",
  "Lamashan",
  "Neth",
  "Kuthona",
]
const WEEKDAYS = ["Moonday", "Toilday", "Wealday", "Oathday", "Fireday", "Starday", "Sunday"]

function slugifySegment(segment) {
  return segment
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
}

function sourceSlug(file) {
  const rel = path.relative(CONTENT_ROOT, file).replace(/\\/g, "/").replace(/\.md$/i, "")
  return rel.split("/").map(slugifySegment).filter(Boolean).join("/")
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === ".obsidian") continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(full)))
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(full)
  }
  return files
}

function attributesFromTag(tag) {
  const attrs = {}
  const attrRe = /data-([a-z-]+)\s*=\s*(["'])(.*?)\2/gi
  let match
  while ((match = attrRe.exec(tag)) !== null) attrs[match[1]] = match[3]
  return attrs
}

function parseDate(value) {
  const match = /^(\-?\d+)-([A-Za-z]+)-(\d{1,2})$/.exec(value ?? "")
  if (!match) return null
  const year = Number(match[1])
  const monthName = match[2]
  const month = MONTHS.indexOf(monthName)
  const day = Number(match[3])
  if (month < 0 || !Number.isInteger(year) || !Number.isInteger(day)) return null
  return { year, month, monthName, day }
}

const files = await walk(CONTENT_ROOT)
const events = []

for (const file of files) {
  const text = await fs.readFile(file, "utf8")
  const spanRe = /<span\b[^>]*data-calendar\s*=\s*(["'])Calendar of Golarion\1[^>]*><\/span>/gi
  let match
  while ((match = spanRe.exec(text)) !== null) {
    const attrs = attributesFromTag(match[0])
    if (attrs.calendar !== CALENDAR_NAME) continue
    const date = parseDate(attrs.date)
    if (!date) continue
    events.push({
      ...date,
      name: attrs.name || "Untitled event",
      category: attrs.category || "Miscellaneous Events",
      source: sourceSlug(file),
    })
  }
}

events.sort((a, b) =>
  a.year - b.year || a.month - b.month || a.day - b.day || a.name.localeCompare(b.name),
)

const payload = {
  calendar: CALENDAR_NAME,
  months: MONTHS,
  weekdays: WEEKDAYS,
  leapRule: { interval: 8, month: 1 },
  defaultDate: { year: 4716, month: 0, day: 20 },
  events,
}

await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true })
await fs.writeFile(OUTPUT_FILE, JSON.stringify(payload, null, 2) + "\n", "utf8")
console.log(`Generated ${events.length} Golarion events at ${OUTPUT_FILE}`)
