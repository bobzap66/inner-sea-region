import { promises as fs } from "node:fs"
import path from "node:path"

const contentRoot = path.resolve(process.argv[2] ?? "content")
const campaignsRoot = path.join(contentRoot, "Campaigns")
const START = "<!-- CAMPAIGN_TIMELINE_START -->"
const END = "<!-- CAMPAIGN_TIMELINE_END -->"

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

const MONTH_INDEX = new Map(MONTHS.map((month, i) => [month.toLowerCase(), i + 1]))

async function walk(dir) {
  const out = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === ".obsidian") continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) out.push(full)
  }
  return out
}

function parseKeyValueLines(text) {
  const data = {}
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9 _-]+):\s*(.*?)\s*$/.exec(line)
    if (!m) continue
    let value = m[2].trim()
    if (!value) continue
    value = value.replace(/^['"]|['"]$/g, "")
    data[m[1].trim().toLowerCase().replaceAll(" ", "_")] = value
  }
  return data
}

function parseFrontmatter(text) {
  const match = /^---\s*\n([\s\S]*?)\n---/.exec(text)
  return match ? parseKeyValueLines(match[1]) : {}
}

function parseManualEvents(text) {
  const events = []
  const pattern = /<!--\s*timeline-event\s*\n([\s\S]*?)\n\s*-->/gi
  for (const match of text.matchAll(pattern)) {
    const event = parseKeyValueLines(match[1])
    if (event.title && (event.date || event.start || event.event_start || event.campaign_date_start || event.campaign_date)) {
      events.push(event)
    }
  }
  return events
}

function parseGolarionDate(value) {
  if (!value) return null
  const match = /^(\d{4})-([A-Za-z]+)(?:-(\d{1,2}))?$/.exec(String(value).trim())
  if (!match) return null
  const year = Number(match[1])
  const monthName = match[2]
  const month = MONTH_INDEX.get(monthName.toLowerCase())
  if (!month) return null
  const day = match[3] ? Number(match[3]) : null
  return { raw: value, year, month, monthName: MONTHS[month - 1], day }
}

function sortKey(date) {
  return date.year * 10000 + date.month * 100 + (date.day ?? 0)
}

function formatPoint(date) {
  return date.day ? `${date.day} ${date.monthName}` : date.monthName
}

function formatRange(start, end) {
  if (!end || start.raw === end.raw) return `**${start.year} AR · ${formatPoint(start)}**`
  if (start.year === end.year && start.month === end.month) {
    if (start.day && end.day) return `**${start.year} AR · ${start.day}–${end.day} ${start.monthName}**`
    return `**${start.year} AR · ${formatPoint(start)}–${formatPoint(end)}**`
  }
  if (start.year === end.year) return `**${start.year} AR · ${formatPoint(start)}–${formatPoint(end)}**`
  return `**${start.year} AR · ${formatPoint(start)}–${end.year} AR · ${formatPoint(end)}**`
}

function seasonFor(date) {
  if ([6, 7, 8].includes(date.month)) return "Summer"
  if ([9, 10, 11].includes(date.month)) return "Fall"
  if ([12, 1, 2].includes(date.month)) return "Winter"
  return "Spring"
}

function seasonYearLabel(date) {
  if (date.month === 12) return `${date.year}–${date.year + 1} AR`
  if (date.month === 1 || date.month === 2) return `${date.year - 1}–${date.year} AR`
  return `${date.year} AR`
}

function cleanTitle(title, sessionNumber) {
  if (!title) return "Untitled event"
  if (sessionNumber) {
    return title.replace(new RegExp(`^Session\\s+${sessionNumber}\\s*[:—-]\\s*`, "i"), "")
  }
  return title
}

function relativeWikiLink(timelineFile, sourceFile, label) {
  const baseDir = path.dirname(timelineFile)
  const rel = path.relative(baseDir, sourceFile).replace(/\\/g, "/").replace(/\.md$/i, "")
  const prefixed = rel.startsWith(".") ? rel : `./${rel}`
  return `[[${prefixed}|${label}]]`
}

function renderEntry(entry, index, isFirstInGroup) {
  const importance = String(entry.fm.timeline_importance || entry.fm.importance || "").toLowerCase()
  const major = importance === "major" || (!importance && isFirstInGroup)
  const side = index % 2 === 0 ? "left" : "right"
  const kind = major ? "major" : "minor"
  const title = entry.fm.timeline_title || entry.fm.title || cleanTitle(entry.basename, entry.fm.session_number)
  const label = entry.fm.timeline_label || entry.fm.label || (entry.fm.session_number ? `Session ${entry.fm.session_number}` : entry.fm.type || "Campaign record")
  const summary = entry.fm.timeline_summary || entry.fm.summary || ""
  const lines = [
    `> [!timeline-${kind}-${side}] ${title}`,
    `> *${label}*`,
    `>`,
    `> ${formatRange(entry.start, entry.end)}`,
  ]
  if (summary) lines.push(`>`, `> ${summary}`)

  if (entry.manual) {
    const links = entry.fm.timeline_links || entry.fm.links || entry.fm.link || ""
    if (links) lines.push(`>`, `> ${links}`)
  } else {
    const readLabel = entry.fm.timeline_link_label || (entry.fm.session_number ? `Read Session ${entry.fm.session_number}` : "Read source")
    lines.push(`>`, `> ${relativeWikiLink(entry.timelineFile, entry.file, readLabel)}`)
  }
  return lines.join("\n")
}

function renderGroups(entries, grouping) {
  const groups = new Map()
  for (const entry of entries) {
    let key
    let heading
    if (grouping === "season") {
      const season = seasonFor(entry.start)
      key = `${entry.start.year}-${season}`
      heading = `${season}, ${seasonYearLabel(entry.start)}`
    } else {
      key = String(entry.start.year)
      heading = `${entry.start.year} AR`
    }
    if (!groups.has(key)) groups.set(key, { heading, entries: [] })
    groups.get(key).entries.push(entry)
  }

  const rendered = []
  let globalIndex = 0
  for (const { heading, entries: groupEntries } of groups.values()) {
    rendered.push(`## ${heading}`, "")
    groupEntries.forEach((entry, groupIndex) => {
      rendered.push(renderEntry(entry, globalIndex, groupIndex === 0), "")
      globalIndex += 1
    })
  }
  return rendered.join("\n").trimEnd()
}

const timelineFiles = []
for (const file of await walk(campaignsRoot)) {
  const text = await fs.readFile(file, "utf8")
  const fm = parseFrontmatter(text)
  if (String(fm.type || "").toLowerCase() === "timeline" && String(fm.generated_timeline || "").toLowerCase() === "true") {
    timelineFiles.push({ file, text, fm })
  }
}

for (const timeline of timelineFiles) {
  const campaignDir = path.dirname(timeline.file)
  const sourceFiles = (await walk(campaignDir)).filter((file) => file !== timeline.file)
  const entries = []

  for (const file of sourceFiles) {
    const text = await fs.readFile(file, "utf8")
    const fm = parseFrontmatter(text)
    if (String(fm.timeline_exclude || "").toLowerCase() === "true") continue
    if (String(fm.draft || "").toLowerCase() === "true") continue
    if (String(fm.publish || "").toLowerCase() === "false") continue

    const startRaw = fm.campaign_date_start || fm.campaign_date || fm.event_start
    const endRaw = fm.campaign_date_end || fm.campaign_date || fm.event_end || startRaw
    const start = parseGolarionDate(startRaw)
    const end = parseGolarionDate(endRaw)
    if (!start || !end) continue

    entries.push({
      file,
      timelineFile: timeline.file,
      basename: path.basename(file, ".md"),
      fm,
      start,
      end,
      manual: false,
    })
  }

  for (const fm of parseManualEvents(timeline.text)) {
    const startRaw = fm.start || fm.date || fm.event_start || fm.campaign_date_start || fm.campaign_date
    const endRaw = fm.end || fm.event_end || fm.campaign_date_end || startRaw
    const start = parseGolarionDate(startRaw)
    const end = parseGolarionDate(endRaw)
    if (!start || !end) continue
    entries.push({
      file: timeline.file,
      timelineFile: timeline.file,
      basename: fm.title,
      fm,
      start,
      end,
      manual: true,
    })
  }

  entries.sort((a, b) => sortKey(a.start) - sortKey(b.start) || sortKey(a.end) - sortKey(b.end) || String(a.fm.title || a.basename).localeCompare(String(b.fm.title || b.basename)))

  const grouping = String(timeline.fm.timeline_grouping || "year").toLowerCase()
  const rendered = renderGroups(entries, grouping)
  const block = `${START}\n${rendered}\n${END}`
  const pattern = new RegExp(`${START}[\\s\\S]*?${END}`, "m")
  if (!pattern.test(timeline.text)) {
    throw new Error(`Generated timeline is missing markers: ${path.relative(contentRoot, timeline.file)}`)
  }
  const updated = timeline.text.replace(pattern, block)
  await fs.writeFile(timeline.file, updated, "utf8")
  console.log(`Generated timeline: ${path.relative(contentRoot, timeline.file)} (${entries.length} entries)`)
}

if (timelineFiles.length === 0) console.log("No generated campaign timelines configured")
