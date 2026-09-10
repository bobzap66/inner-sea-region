import { promises as fs } from "node:fs"
import path from "node:path"
import { simplifySlug, slugifyFilePath } from "@quartz-community/utils"
import YAML from "yaml"

const CONTENT_ROOT = path.resolve(process.argv[2] ?? "content")
const STATIC_OUTPUT = path.resolve("quartz/static/golarion-events.json")
const PUBLIC_OUTPUT = path.resolve("public/static/golarion-events.json")
const CALENDARIUM_DATA = path.join(CONTENT_ROOT, ".obsidian/plugins/calendarium/data.json")
const HISTORICAL_DATA = path.join(
  CONTENT_ROOT,
  "Meta/Chronicler Voices/golarion-timegraphics-history-reshaped.json",
)
const VERIFIED_ANNIVERSARIES = path.join(
  CONTENT_ROOT,
  "Meta/Chronicler Voices/golarion-verified-anniversaries.json",
)
const VERIFIED_YEAR_HISTORY = path.join(
  CONTENT_ROOT,
  "Meta/Chronicler Voices/golarion-verified-year-history.json",
)
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
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
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

function isLeapYear(year) {
  return year % 8 === 0
}

function monthLength(year, month) {
  return month === 1 && isLeapYear(year) ? 29 : MONTH_LENGTHS[month]
}

function parseDate(value) {
  const match = /^(\-?\d+)-([A-Za-z]+)-(\d{1,2})$/.exec(value ?? "")
  if (!match) return null
  const year = Number(match[1])
  const monthName = match[2]
  const month = MONTHS.indexOf(monthName)
  const day = Number(match[3])
  if (
    month < 0 ||
    !Number.isInteger(year) ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > monthLength(year, month)
  )
    return null
  return { year, month, monthName, day }
}

function serialDay(date) {
  let total = (date.year - 1) * 365 + Math.floor((date.year - 1) / 8)
  for (let month = 0; month < date.month; month += 1) total += monthLength(date.year, month)
  return total + date.day - 1
}

function nextDate(date) {
  let { year, month, day } = date
  day += 1
  if (day > monthLength(year, month)) {
    day = 1
    month += 1
    if (month >= MONTHS.length) {
      month = 0
      year += 1
    }
  }
  return { year, month, monthName: MONTHS[month], day }
}

function expandDateRange(start, end) {
  if (serialDay(end) < serialDay(start)) return [start]
  const dates = []
  let current = start
  const endSerial = serialDay(end)
  while (serialDay(current) <= endSerial) {
    dates.push(current)
    current = nextDate(current)
  }
  return dates
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

function sameDate(a, b) {
  return a && b && a.year === b.year && a.month === b.month && a.day === b.day
}

function rangeIdentity(start, end) {
  const finalEnd = end ?? start
  return `${start.year}-${start.month}-${start.day}|${finalEnd.year}-${finalEnd.month}-${finalEnd.day}`
}

function normalizedName(value) {
  return String(value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ")
}

function pushCampaignEvent(events, { start, end, name, category, campaign, source }) {
  const validEnd = end && serialDay(end) > serialDay(start) ? end : null
  const occurrenceDates = validEnd ? expandDateRange(start, validEnd) : [start]
  const rangeStart = validEnd ? { ...start } : null
  const rangeEnd = validEnd ? { ...validEnd } : null
  for (const occurrenceDate of occurrenceDates) {
    events.push({
      ...occurrenceDate,
      datePrecision: "day",
      name,
      category,
      campaign,
      kind: "campaign-event",
      source,
      ...(validEnd ? { isMultiDay: true, rangeStart, rangeEnd } : {}),
    })
  }
}

async function readCampaigns(files) {
  const campaigns = []
  for (const file of files) {
    const rel = path.relative(CONTENT_ROOT, file).replace(/\\/g, "/")
    const match = /^Campaigns\/([^/]+)\/([^/]+)\.md$/i.exec(rel)
    if (
      !match ||
      (match[1].toLowerCase() !== match[2].toLowerCase() && match[2].toLowerCase() !== "index")
    )
      continue
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

function normalizeHistoricalEvent(event) {
  if (!Number.isInteger(event.year)) return null
  const precision = event.datePrecision || "day"
  if (!new Set(["year", "month", "day"]).has(precision)) return null
  if (precision !== "year") {
    if (!Number.isInteger(event.month) || event.month < 0 || event.month >= MONTHS.length)
      return null
  }
  if (precision === "day" && !Number.isInteger(event.day)) return null

  const historicalEvent = {
    year: event.year,
    datePrecision: precision,
    name: event.name || "Untitled historical event",
    description: event.description || "",
    category: event.category || "Golarion History",
    kind: "historical",
    source: event.source || null,
    sourceTitle: event.sourceTitle || null,
    verification: event.verification || null,
    timeGraphicsEventId: event.timeGraphicsEventId ?? null,
  }
  if (precision === "month" || precision === "day") {
    historicalEvent.month = event.month
    historicalEvent.monthName = MONTHS[event.month]
  }
  if (precision === "day") historicalEvent.day = event.day
  return historicalEvent
}

async function readHistoricalEvents() {
  try {
    const manifest = JSON.parse(await fs.readFile(HISTORICAL_DATA, "utf8"))
    let sourceEvents = manifest.events ?? []

    if (!sourceEvents.length && Array.isArray(manifest.parts)) {
      sourceEvents = []
      for (const partName of manifest.parts) {
        const partPath = path.resolve(path.dirname(HISTORICAL_DATA), partName)
        const part = JSON.parse(await fs.readFile(partPath, "utf8"))
        sourceEvents.push(...(part.events ?? []))
      }
    }

    return sourceEvents.map(normalizeHistoricalEvent).filter(Boolean)
  } catch (error) {
    console.warn(`Could not load historical events: ${error.message}`)
    return []
  }
}

async function readVerifiedAnniversaries() {
  try {
    const raw = JSON.parse(await fs.readFile(VERIFIED_ANNIVERSARIES, "utf8"))
    return (raw.events ?? []).map(normalizeHistoricalEvent).filter(Boolean)
  } catch (error) {
    console.warn(`Could not load verified anniversaries: ${error.message}`)
    return []
  }
}

async function readVerifiedYearHistory() {
  try {
    const raw = JSON.parse(await fs.readFile(VERIFIED_YEAR_HISTORY, "utf8"))
    return (raw.events ?? [])
      .map(normalizeHistoricalEvent)
      .filter((event) => event && event.datePrecision === "year")
  } catch (error) {
    console.warn(`Could not load verified year-only history: ${error.message}`)
    return []
  }
}

const files = await walk(CONTENT_ROOT)
const events = []
const canonicalCampaignEvents = new Set()

for (const file of files) {
  const text = await fs.readFile(file, "utf8")
  const fm = parseFrontmatter(text)
  const campaign = campaignFromFile(file)
  const source = sourceSlug(file)
  const inlineRanges = []

  const spanRe = /<span\b[^>]*data-calendar\s*=\s*(["'])Calendar of Golarion\1[^>]*><\/span>/gi
  let match
  while ((match = spanRe.exec(text)) !== null) {
    const attrs = attributesFromTag(match[0])
    if (attrs.calendar !== CALENDAR_NAME) continue
    const start = parseDate(attrs.date)
    if (!start) continue
    const parsedEnd = attrs["end-date"] ? parseDate(attrs["end-date"]) : null
    const end = parsedEnd && serialDay(parsedEnd) > serialDay(start) ? parsedEnd : null
    const name = attrs.name || "Untitled event"
    inlineRanges.push({ start, end: end ?? start })
    pushCampaignEvent(events, {
      start,
      end,
      name,
      category: attrs.category || "Miscellaneous Events",
      campaign,
      source,
    })
    canonicalCampaignEvents.add(
      `${campaign}|${rangeIdentity(start, end ?? start)}|${normalizedName(name)}`,
    )
  }

  if (!campaign) continue

  const rangeStart = parseDate(fm.event_start)
  const rangeEnd = parseDate(fm.event_end)
  const singleDate = parseDate(fm.event_date)
  const start = rangeStart || singleDate
  if (!start) continue
  const end = rangeStart && rangeEnd && serialDay(rangeEnd) > serialDay(rangeStart) ? rangeEnd : null

  const duplicateInlineRange = inlineRanges.some(
    (inline) => sameDate(inline.start, start) && sameDate(inline.end, end ?? start),
  )
  if (duplicateInlineRange) continue

  const name = fm.calendar_event_name || fm.title || path.basename(file, path.extname(file))
  const eventKey = `${campaign}|${rangeIdentity(start, end ?? start)}|${normalizedName(name)}`
  if (canonicalCampaignEvents.has(eventKey)) continue

  pushCampaignEvent(events, {
    start,
    end,
    name,
    category: fm.calendar_category || "Campaign Events",
    campaign,
    source,
  })
  canonicalCampaignEvents.add(eventKey)
}

const historicalEvents = await readHistoricalEvents()
const verifiedAnniversaries = await readVerifiedAnniversaries()
const verifiedYearHistory = await readVerifiedYearHistory()
events.push(...historicalEvents, ...verifiedAnniversaries, ...verifiedYearHistory)

events.sort(
  (a, b) =>
    a.year - b.year ||
    (a.month ?? -1) - (b.month ?? -1) ||
    (a.day ?? -1) - (b.day ?? -1) ||
    a.name.localeCompare(b.name),
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
  `Generated ${events.length - historicalEvents.length - verifiedAnniversaries.length - verifiedYearHistory.length} campaign event dates, ${historicalEvents.length} timeline events, ${verifiedAnniversaries.length} verified anniversaries, ${verifiedYearHistory.length} verified year-only events, ${payload.holidays.length} holidays, and ${payload.campaigns.length} campaigns`,
)
