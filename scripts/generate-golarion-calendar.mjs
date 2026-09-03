import { promises as fs } from "node:fs"
import path from "node:path"
import { simplifySlug, slugifyFilePath } from "@quartz-community/utils"
import YAML from "yaml"

const CONTENT_ROOT = path.resolve("content")
const STATIC_OUTPUT = path.resolve("quartz/static/golarion-events.json")
const PUBLIC_OUTPUT = path.resolve("public/static/golarion-events.json")
const CALENDARIUM_DATA = path.resolve("content/.obsidian/plugins/calendarium/data.json")
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

function sourceSlug(file) {
  const rel = path.relative(CONTENT_ROOT, file).replace(/\\/g, "/").replace(/\.md$/i, "")
  return simplifySlug(slugifyFilePath(`${rel}.md`))
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

function parseFrontmatter(text) {
  const match = /^---\s*\n([\s\S]*?)\n---/.exec(text)
  if (!match) return {}
  try {
    return YAML.parse(match[1]) ?? {}
  } catch {
    return {}
  }
}

function campaignFromFile(file) {
  const rel = path.relative(CONTENT_ROOT, file).replace(/\\/g, "/")
  const match = /^Campaigns\/([^/]+)\//.exec(rel)
  return match?.[1] ?? null
}

async function readCampaigns(files) {
  const campaigns = []
  for (const file of files) {
    const rel = path.relative(CONTENT_ROOT, file).replace(/\\/g, "/")
    const match = /^Campaigns\/([^/]+)\/([^/]+)\.md$/i.exec(rel)
    if (!match || match[1] !== match[2]) continue
    const text = await fs.readFile(file, "utf8")
    const fm = parseFrontmatter(text)
    if (fm.type !== "campaign" || fm.calendar !== CALENDAR_NAME) continue
    const currentDate = parseDate(fm.current_date)
    campaigns.push({
      id: match[1],
      name: fm.title || match[1],
      currentDate,
      source: sourceSlug(file),
    })
  }
  return campaigns.sort((a, b) => a.name.localeCompare(b.name))
}

async function readHolidays() {
  try {
    const raw = JSON.parse(await fs.readFile(CALENDARIUM_DATA, "utf8"))
    const calendar = raw.calendars?.find((item) => item.name === CALENDAR_NAME)
    if (!calendar) return []
    return (calendar.events ?? [])
      .filter(
        (event) =>
          event.type === "Recurring" &&
          Number.isInteger(event.date?.month) &&
          Number.isInteger(event.date?.day),
      )
      .map((event) => ({
        name: event.name,
        description: event.description || "",
        month: event.date.month,
        monthName: MONTHS[event.date.month],
        day: event.date.day,
        category: event.category || "Golarion Holiday",
        kind: "holiday",
        recurring: true,
      }))
      .sort((a, b) => a.month - b.month || a.day - b.day || a.name.localeCompare(b.name))
  } catch (error) {
    console.warn(`Could not load Calendarium holidays: ${error.message}`)
    return []
  }
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
      campaign: campaignFromFile(file),
      kind: "campaign-event",
      source: sourceSlug(file),
    })
  }
}

events.sort(
  (a, b) => a.year - b.year || a.month - b.month || a.day - b.day || a.name.localeCompare(b.name),
)

const payload = {
  calendar: CALENDAR_NAME,
  months: MONTHS,
  weekdays: WEEKDAYS,
  leapRule: { interval: 8, month: 1 },
  realWorldYearOffset: 2700,
  campaigns: await readCampaigns(files),
  holidays: await readHolidays(),
  events,
}

const output = JSON.stringify(payload, null, 2) + "\n"
for (const target of [STATIC_OUTPUT, PUBLIC_OUTPUT]) {
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, output, "utf8")
}
console.log(
  `Generated ${events.length} campaign events, ${payload.holidays.length} holidays, and ${payload.campaigns.length} campaigns`,
)
