import { promises as fs } from "node:fs"
import path from "node:path"

const CONTENT_ROOT = path.resolve(process.argv[2] ?? "content")
const IGNORED_DIRS = new Set([".git", ".obsidian", "node_modules", "private", "templates"])
const RESOURCE_EXTENSIONS = /\.(?:png|jpe?g|webp|gif|svg|pdf|json|ya?ml|css|js|mjs|cjs|mp3|mp4|webm|ogg|wav|zip|stl|3mf|obj|xlsx?|docx?|pptx?|csv|txt)$/i

function toPosix(value) {
  return value.split(path.sep).join("/")
}

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

function isExternal(value) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)
}

function isResource(value) {
  const withoutAnchor = value.split("#", 1)[0]
  return RESOURCE_EXTENSIONS.test(withoutAnchor)
}

function decodePath(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function relativeTarget(file, vaultTarget) {
  const [rawPath, anchor = ""] = vaultTarget.split(/(?=#)/, 2)
  const decoded = decodePath(rawPath).replace(/^\/+/, "").replace(/\.md$/i, "")
  const fromDir = path.dirname(path.relative(CONTENT_ROOT, file))
  let rel = toPosix(path.relative(fromDir, decoded))
  if (!rel.startsWith(".")) rel = `./${rel}`
  return `${rel}${anchor}`
}

function normalizeWikilinks(file, text) {
  return text.replace(/(!?)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (whole, bang, rawTarget, label) => {
    const target = String(rawTarget).trim()
    if (
      !target ||
      target.startsWith("#") ||
      target.startsWith("./") ||
      target.startsWith("../") ||
      isExternal(target) ||
      isResource(target)
    ) {
      return whole
    }

    const normalized = relativeTarget(file, target)
    return `${bang}[[${normalized}${label ? `|${label}` : ""}]]`
  })
}

function normalizeMarkdownNoteLinks(file, text) {
  return text.replace(/(?<!!)\[([^\]]+)\]\((<?[^)\n]+>?)\)/g, (whole, label, rawDestination) => {
    const destination = String(rawDestination).replace(/^<|>$/g, "").trim()
    if (!destination || destination.startsWith("#") || isExternal(destination) || isResource(destination)) return whole

    const [pathPart, anchor = ""] = destination.split(/(?=#)/, 2)
    if (!/\.md$/i.test(pathPart)) return whole

    const targetPath = path.resolve(path.dirname(file), decodePath(pathPart))
    let rel = toPosix(path.relative(path.dirname(file), targetPath)).replace(/\.md$/i, "")
    if (!rel.startsWith(".")) rel = `./${rel}`
    return `[[${rel}${anchor}|${label}]]`
  })
}

const files = await walk(CONTENT_ROOT)
let changed = 0

for (const file of files) {
  const original = await fs.readFile(file, "utf8")
  let next = normalizeWikilinks(file, original)
  next = normalizeMarkdownNoteLinks(file, next)

  if (next !== original) {
    await fs.writeFile(file, next, "utf8")
    changed += 1
  }
}

console.log(`Normalized note links in ${changed} Markdown file(s).`)
