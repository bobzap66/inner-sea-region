import { promises as fs } from "node:fs"
import path from "node:path"

const CONTENT_ROOT = path.resolve(process.argv[2] ?? "content")
const IGNORED_DIRS = new Set([".git", ".obsidian", "node_modules", "private", "templates"])
const RESOURCE_EXTENSIONS = /\.(?:png|jpe?g|webp|gif|svg|pdf|json|ya?ml|css|js|mjs|cjs|mp3|mp4|webm|ogg|wav|zip|stl|3mf|obj|xlsx?|docx?|pptx?|csv|txt)$/i
const SAME_SITE = /^(?:https?:\/\/)?bobzap66\.github\.io\/(?:inner-sea-region\/)?/i

const violations = []
let filesScanned = 0
let wikilinksChecked = 0
let markdownLinksChecked = 0

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

function lineNumber(text, offset) {
  return text.slice(0, offset).split("\n").length
}

function record(file, text, offset, kind, message, snippet) {
  violations.push({
    file: toPosix(path.relative(CONTENT_ROOT, file)),
    line: lineNumber(text, offset),
    kind,
    message,
    snippet,
  })
}

function stripAngles(value) {
  const trimmed = String(value ?? "").trim()
  return trimmed.startsWith("<") && trimmed.endsWith(">")
    ? trimmed.slice(1, -1).trim()
    : trimmed
}

function splitAnchor(value) {
  const hash = value.indexOf("#")
  return hash === -1 ? [value, ""] : [value.slice(0, hash), value.slice(hash)]
}

function isExternal(value) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)
}

function isResource(value) {
  const [withoutAnchor] = splitAnchor(value)
  return RESOURCE_EXTENSIONS.test(withoutAnchor)
}

function isCanonicalRelativeNoteTarget(value) {
  const [withoutAnchor] = splitAnchor(value)
  if (!withoutAnchor) return true
  if (!(withoutAnchor.startsWith("./") || withoutAnchor.startsWith("../"))) return false
  if (/\.md$/i.test(withoutAnchor)) return false
  if (/^\/(?:|.*)/.test(withoutAnchor)) return false
  return true
}

function checkWikilinks(file, text) {
  const pattern = /(!?)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

  for (const match of text.matchAll(pattern)) {
    const [whole, bang, rawTarget] = match
    const offset = match.index ?? 0
    const target = String(rawTarget).trim()
    wikilinksChecked += 1

    // Same-page anchors and non-note embeds are allowed.
    if (target.startsWith("#")) continue
    if (bang && isResource(target)) continue

    if (SAME_SITE.test(target)) {
      record(file, text, offset, "wikilink", "Internal links must never use the deployed site URL.", whole)
      continue
    }

    if (isExternal(target)) {
      record(file, text, offset, "wikilink", "External URLs must use normal Markdown links, not wikilinks.", whole)
      continue
    }

    if (target.startsWith("/")) {
      record(file, text, offset, "wikilink", "Internal wikilinks must be relative, never root-qualified.", whole)
      continue
    }

    if (/\.md(?:#|$)/i.test(target)) {
      record(file, text, offset, "wikilink", "Canonical wikilinks omit the .md extension.", whole)
      continue
    }

    if (!isCanonicalRelativeNoteTarget(target)) {
      record(
        file,
        text,
        offset,
        "wikilink",
        "Internal note wikilinks must begin with ./ or ../ and target the current note path directly.",
        whole,
      )
    }
  }
}

function checkMarkdownLinks(file, text) {
  // Images are deliberately excluded. Asset/file downloads may continue using Markdown links.
  const pattern = /(?<!!)\[([^\]]+)\]\((<?[^)\n]+>?)\)/g

  for (const match of text.matchAll(pattern)) {
    const [whole, , rawDestination] = match
    const offset = match.index ?? 0
    const destination = stripAngles(rawDestination)
    markdownLinksChecked += 1

    if (!destination || destination.startsWith("#")) continue

    if (SAME_SITE.test(destination)) {
      record(
        file,
        text,
        offset,
        "markdown",
        "Internal site URLs are forbidden in vault links; use a relative wikilink to the note instead.",
        whole,
      )
      continue
    }

    if (destination.startsWith("/inner-sea-region/") || destination.startsWith("/campaigns/") || destination.startsWith("/locations/") || destination.startsWith("/groups/")) {
      record(
        file,
        text,
        offset,
        "markdown",
        "Root-relative internal URLs are forbidden; use a relative wikilink.",
        whole,
      )
      continue
    }

    if (isExternal(destination) || isResource(destination)) continue

    if (/\.md(?:#|$)/i.test(destination) || destination.startsWith("./") || destination.startsWith("../")) {
      record(
        file,
        text,
        offset,
        "markdown",
        "Internal note links must use relative Obsidian wikilinks, not Markdown link syntax.",
        whole,
      )
    }
  }
}

const files = await walk(CONTENT_ROOT)

for (const file of files) {
  const text = await fs.readFile(file, "utf8")
  filesScanned += 1
  checkWikilinks(file, text)
  checkMarkdownLinks(file, text)
}

if (violations.length > 0) {
  console.error(`Link convention check failed with ${violations.length} violation(s):`)
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} [${violation.kind}] ${violation.message}`)
    console.error(`  ${violation.snippet}`)
  }
  process.exit(1)
}

console.log(`Link convention check passed.`)
console.log(`  Markdown files scanned: ${filesScanned}`)
console.log(`  Wikilinks checked: ${wikilinksChecked}`)
console.log(`  Markdown links inspected: ${markdownLinksChecked}`)
console.log(`  Canonical internal-note form: [[./relative/path|Label]] or [[../relative/path|Label]]`)
