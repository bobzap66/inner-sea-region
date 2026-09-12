import { promises as fs } from "node:fs"
import path from "node:path"

const root = path.resolve(process.argv[2] ?? "content")
const campaignsDir = path.join(root, "Campaigns")
const indexFile = path.join(campaignsDir, "index.md")
const start = "<!-- CAMPAIGN_DIRECTORY_START -->"
const end = "<!-- CAMPAIGN_DIRECTORY_END -->"

function frontmatter(text) {
  const match = /^---\s*\n([\s\S]*?)\n---/.exec(text)
  const data = {}
  if (!match) return data
  for (const line of match[1].split(/\r?\n/)) {
    const found = /^([A-Za-z0-9_-]+):\s*(.*?)\s*$/.exec(line)
    if (!found) continue
    data[found[1].toLowerCase()] = found[2].replace(/^['"]|['"]$/g, "")
  }
  return data
}

function esc(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

function renderCard(c, compact = false) {
  const image = `../${esc(c.image)}`
  return `<a class="campaign-directory__card${compact ? " campaign-directory__card--archived" : ""}" href="./${encodeURIComponent(c.folder)}/" style="--campaign-directory-accent:${esc(c.accent)}"><span class="campaign-directory__image" role="img" aria-label="${esc(c.alt)}" style="background-image:url('${image}')"></span><div class="campaign-directory__copy">${compact ? '<div class="campaign-directory__status">Archived</div>' : ""}<div class="campaign-directory__eyebrow">${esc(c.eyebrow)}</div><h2 class="campaign-directory__title">${esc(c.title)}</h2><div class="campaign-directory__subtitle">${esc(c.summary)}</div></div></a>`
}

function renderSection(title, items, compact = false) {
  if (!items.length) return ""
  return `<section class="campaign-directory__section"><h2 class="campaign-directory__section-title">${title}</h2><div class="campaign-directory__grid${compact ? " campaign-directory__grid--archived" : ""}">${items.map((c) => renderCard(c, compact)).join("\n")}</div></section>`
}

const campaigns = []
for (const entry of await fs.readdir(campaignsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  try {
    const text = await fs.readFile(path.join(campaignsDir, entry.name, "index.md"), "utf8")
    const fm = frontmatter(text)
    if ((fm.type || "").toLowerCase() !== "campaign") continue
    campaigns.push({
      folder: entry.name,
      title: fm.title || entry.name,
      status: (fm.status || "active").toLowerCase(),
      image: fm.directory_image || "",
      eyebrow: fm.directory_eyebrow || "Campaign Archive",
      summary: fm.directory_summary || "Campaign archive.",
      alt: fm.directory_alt || `${fm.title || entry.name} campaign banner`,
      accent: fm.directory_accent || "var(--tertiary)",
      sort: Number(fm.directory_sort || 999),
    })
  } catch {}
}

campaigns.sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title))
const active = campaigns.filter((c) => c.status === "active" || !["archived", "hiatus"].includes(c.status))
const hiatus = campaigns.filter((c) => c.status === "hiatus")
const archived = campaigns.filter((c) => c.status === "archived")

const block = [start, '<div class="campaign-directory">', `<p class="campaign-directory__intro">${active.length} active campaign archives, with completed and paused campaigns preserved below. Choose a campaign to enter its archive.</p>`, renderSection("Active Campaigns", active), renderSection("On Hiatus", hiatus, true), renderSection("Archived Campaigns", archived, true), "</div>", end].filter(Boolean).join("\n\n")

let index = await fs.readFile(indexFile, "utf8")
const pattern = new RegExp(`${start}[\\s\\S]*?${end}`, "m")
index = pattern.test(index) ? index.replace(pattern, block) : `${index.trimEnd()}\n\n${block}\n`
await fs.writeFile(indexFile, index, "utf8")
console.log(`Campaign directory generated: ${active.length} active, ${hiatus.length} hiatus, ${archived.length} archived`)
