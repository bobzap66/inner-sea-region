import fs from "node:fs"
import path from "node:path"

const CONTENT_ROOT = path.resolve("content")
const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"])

function walk(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) results.push(...walk(full))
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) results.push(full)
  }
  return results
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
}

function encodeRelativeUrl(value) {
  return value
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => (segment === "." || segment === ".." ? segment : encodeURIComponent(segment)))
    .join("/")
}

function insideContent(candidate) {
  return candidate === CONTENT_ROOT || candidate.startsWith(CONTENT_ROOT + path.sep)
}

function resolveRequestedFolder(notePath, requestedPath) {
  const noteDir = path.dirname(notePath)
  const cleaned = requestedPath.trim().replace(/^['"]|['"]$/g, "")
  const absolute = cleaned.startsWith("./") || cleaned.startsWith("../")
    ? path.resolve(noteDir, cleaned)
    : path.resolve(CONTENT_ROOT, cleaned.replace(/^[/\\]+/, ""))
  return insideContent(absolute) ? absolute : null
}

function resolveLegacyFolder(notePath, markdownImageUrl) {
  const noteDir = path.dirname(notePath)
  let decoded = markdownImageUrl.trim()
  try { decoded = decodeURIComponent(decoded) } catch {}
  decoded = decoded.split("#")[0].split("?")[0]
  const absoluteImage = path.resolve(noteDir, decoded)
  const folder = path.dirname(absoluteImage)
  return insideContent(folder) ? folder : null
}

function galleryHtml(notePath, galleryDir, sourceLabel) {
  let filenames
  try {
    filenames = fs.readdirSync(galleryDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => entry.name)
      .sort(naturalSort)
  } catch {
    return `<p class="isr-gallery-error">Gallery folder not found: ${escapeHtml(sourceLabel)}</p>`
  }

  if (filenames.length === 0) {
    return `<p class="isr-gallery-error">No images found in gallery folder: ${escapeHtml(sourceLabel)}</p>`
  }

  const noteDir = path.dirname(notePath)
  const slides = filenames.map((filename, index) => {
    const imagePath = path.join(galleryDir, filename)
    const src = encodeRelativeUrl(path.relative(noteDir, imagePath))
    const label = escapeHtml(filename)
    return [
      `<figure data-isr-slide${index === 0 ? "" : " hidden"} style="margin:0;text-align:center;">`,
      `  <img src="${src}" alt="${label}" title="${label}" loading="${index === 0 ? "eager" : "lazy"}" decoding="async" style="display:block;width:100%;height:clamp(18rem,58vw,42rem);object-fit:contain;margin:0 auto;">`,
      `  <figcaption style="margin-top:.55rem;color:var(--darkgray);font-size:.9rem;line-height:1.35;overflow-wrap:anywhere;">${label}</figcaption>`,
      `</figure>`,
    ].join("\n")
  }).join("\n")

  const prev = "const g=this.closest('[data-isr-folder-gallery]'),s=[...g.querySelectorAll('[data-isr-slide]')];let i=(Number(g.dataset.index)-1+s.length)%s.length;g.dataset.index=i;s.forEach((x,n)=>x.hidden=n!==i);g.querySelector('[data-isr-status]').textContent=(i+1)+' / '+s.length;"
  const next = "const g=this.closest('[data-isr-folder-gallery]'),s=[...g.querySelectorAll('[data-isr-slide]')];let i=(Number(g.dataset.index)+1)%s.length;g.dataset.index=i;s.forEach((x,n)=>x.hidden=n!==i);g.querySelector('[data-isr-status]').textContent=(i+1)+' / '+s.length;"

  return [
    `<div class="isr-folder-gallery" data-isr-folder-gallery data-index="0" data-gallery-folder="${escapeHtml(sourceLabel)}" style="position:relative;margin:1.25rem 0 2.5rem;padding:.8rem 3.25rem 2.2rem;border:1px solid var(--isr-rule);border-radius:.45rem;background:color-mix(in srgb,var(--light) 82%,var(--lightgray) 18%);">`,
    `  <div class="isr-folder-gallery-track">`,
    slides,
    `  </div>`,
    filenames.length > 1 ? `  <button type="button" aria-label="Previous image" onclick="${escapeHtml(prev)}" style="position:absolute;left:.45rem;top:50%;transform:translateY(-50%);z-index:2;width:2.4rem;height:2.4rem;border:1px solid var(--isr-rule);border-radius:999px;background:var(--light);color:var(--dark);font-size:1.8rem;line-height:1;cursor:pointer;">‹</button>` : "",
    filenames.length > 1 ? `  <button type="button" aria-label="Next image" onclick="${escapeHtml(next)}" style="position:absolute;right:.45rem;top:50%;transform:translateY(-50%);z-index:2;width:2.4rem;height:2.4rem;border:1px solid var(--isr-rule);border-radius:999px;background:var(--light);color:var(--dark);font-size:1.8rem;line-height:1;cursor:pointer;">›</button>` : "",
    `  <div data-isr-status aria-live="polite" style="position:absolute;right:.9rem;bottom:.45rem;color:var(--gray);font-size:.82rem;">1 / ${filenames.length}</div>`,
    `</div>`,
  ].filter(Boolean).join("\n")
}

function expandDirectiveGalleries(notePath, source) {
  return source.replace(/```gallery[^\n]*\n([^\n]+)\n```/gi, (_match, requestedPath) => {
    const galleryDir = resolveRequestedFolder(notePath, requestedPath)
    if (!galleryDir) {
      return `<p class="isr-gallery-error">Gallery folder is outside the content root: ${escapeHtml(requestedPath)}</p>`
    }
    return galleryHtml(notePath, galleryDir, requestedPath.trim())
  })
}

function expandLegacySessionGallery(notePath, source) {
  const pattern = /(## Session Gallery\s*\n+)([^\n]*!\[[^\]]*\]\(([^)]+)\)[^\n]*)/g
  return source.replace(pattern, (match, heading, _imageLine, firstUrl) => {
    const galleryDir = resolveLegacyFolder(notePath, firstUrl)
    if (!galleryDir) return match
    const label = path.relative(CONTENT_ROOT, galleryDir).replaceAll("\\", "/")
    return `${heading}${galleryHtml(notePath, galleryDir, label)}`
  })
}

let changed = 0
for (const notePath of walk(CONTENT_ROOT)) {
  const original = fs.readFileSync(notePath, "utf8")
  let updated = expandDirectiveGalleries(notePath, original)
  updated = expandLegacySessionGallery(notePath, updated)
  if (updated !== original) {
    fs.writeFileSync(notePath, updated)
    changed++
  }
}

console.log(`Expanded folder galleries in ${changed} Markdown file(s).`)
