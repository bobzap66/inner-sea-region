import { promises as fs } from "node:fs"
import path from "node:path"

const contentRoot = path.resolve("content")
const assetPattern = /(?:\.\.\/)+assets\//g
const markdownLinkPattern = /(?<!!)\[([^\]]+)\]\(([^)]+\.md(?:#[^)]*)?)\)/g

const markdownFiles = []

async function collectMarkdown(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name === ".git") continue

    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectMarkdown(fullPath)
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      markdownFiles.push(fullPath)
    }
  }
}

function splitAnchor(rawTarget) {
  const hash = rawTarget.indexOf("#")
  if (hash === -1) return [rawTarget, ""]
  return [rawTarget.slice(0, hash), rawTarget.slice(hash)]
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function toPosix(value) {
  return value.split(path.sep).join("/")
}

function findTarget(sourceFile, rawTarget) {
  const [rawPath, anchor] = splitAnchor(rawTarget)
  const decodedPath = safeDecode(rawPath)

  if (/^[a-z]+:/i.test(decodedPath) || decodedPath.startsWith("//")) return null

  const direct = path.resolve(path.dirname(sourceFile), decodedPath)
  if (markdownFiles.includes(direct)) return { file: direct, anchor }

  const normalizedSuffix = toPosix(decodedPath)
    .replace(/^\.\//, "")
    .replace(/^(?:\.\.\/)+/, "")

  const suffixMatches = markdownFiles.filter((candidate) =>
    toPosix(path.relative(contentRoot, candidate)).endsWith(normalizedSuffix),
  )
  if (suffixMatches.length === 1) return { file: suffixMatches[0], anchor }

  const basename = path.basename(decodedPath)
  const basenameMatches = markdownFiles.filter((candidate) => path.basename(candidate) === basename)
  if (basenameMatches.length === 1) return { file: basenameMatches[0], anchor }

  return null
}

function normalizeMarkdownLinks(sourceFile, text) {
  return text.replace(markdownLinkPattern, (match, label, rawTarget) => {
    const target = findTarget(sourceFile, rawTarget)
    if (!target) return match

    let relativePath = toPosix(path.relative(path.dirname(sourceFile), target.file))
    if (!relativePath.startsWith(".")) relativePath = `./${relativePath}`

    // Angle-bracket destinations allow spaces and punctuation without pre-encoding,
    // while preserving normal relative-link resolution in Quartz.
    return `[${label}](<${relativePath}${target.anchor}>)`
  })
}

await collectMarkdown(contentRoot)

for (const fullPath of markdownFiles) {
  const relativeDir = path.relative(contentRoot, path.dirname(fullPath))
  const depth = relativeDir.split(path.sep).filter(Boolean).length

  const original = await fs.readFile(fullPath, "utf8")
  let normalized = original

  if (depth > 0) {
    const correctPrefix = `${"../".repeat(depth)}assets/`
    normalized = normalized.replace(assetPattern, correctPrefix)
  }

  normalized = normalizeMarkdownLinks(fullPath, normalized)

  if (normalized !== original) {
    await fs.writeFile(fullPath, normalized, "utf8")
    console.log(`Normalized moved-content links: ${path.relative(contentRoot, fullPath)}`)
  }
}
