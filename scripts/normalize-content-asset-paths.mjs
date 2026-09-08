import { promises as fs } from "node:fs"
import path from "node:path"

const contentRoot = path.resolve(process.argv[2] ?? "content")
const assetPattern = /(?:\.\.\/)+assets\//g
const markdownLinkPattern = /(?<!!)\[([^\]]+)\]\(([^)]+\.md(?:#[^)]*)?)\)/g
const rootMarkdownLinkPattern = /(?<!!)\[([^\]]+)\]\((\/[^)]+)\)/g
const wikilinkPattern = /(?<!!)\[\[([^\]|]+)(\|[^\]]+)?\]\]/g

const markdownFiles = []
const namesToFiles = new Map()

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

function normalizedName(value) {
  return safeDecode(value)
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^<|>$/g, "")
    .replace(/^\.\//, "")
    .replace(/\.md$/i, "")
    .replace(/^\/|\/$/g, "")
    .toLowerCase()
}

function addName(name, file) {
  const key = normalizedName(name)
  if (!key) return
  if (!namesToFiles.has(key)) namesToFiles.set(key, new Set())
  namesToFiles.get(key).add(file)
}

async function indexDocumentNames() {
  for (const file of markdownFiles) {
    const text = await fs.readFile(file, "utf8")
    const frontmatter = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/m)?.[1] ?? ""
    const title = frontmatter.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1]
    if (title) addName(title, file)

    const aliasesBlock = frontmatter.match(/^aliases:\s*\r?\n((?:[ \t]+-.*(?:\r?\n|$))*)/m)?.[1] ?? ""
    for (const match of aliasesBlock.matchAll(/^[ \t]+-\s*["']?(.+?)["']?\s*$/gm)) {
      addName(match[1], file)
    }

    const firstHeading = text.match(/^#\s+(.+?)\s*$/m)?.[1]
    if (firstHeading) addName(firstHeading, file)
  }
}

function findTarget(sourceFile, rawTarget) {
  const [rawPath, anchor] = splitAnchor(rawTarget)
  const decodedPath = safeDecode(rawPath).replace(/^<|>$/g, "")

  if (/^[a-z]+:/i.test(decodedPath) || decodedPath.startsWith("//")) return null

  const candidates = [
    path.resolve(path.dirname(sourceFile), decodedPath),
    path.resolve(path.dirname(sourceFile), `${decodedPath}.md`),
    path.resolve(contentRoot, decodedPath),
    path.resolve(contentRoot, `${decodedPath}.md`),
  ]
  for (const direct of candidates) {
    const match = markdownFiles.find((file) => file.toLowerCase() === direct.toLowerCase())
    if (match) return { file: match, anchor }
  }

  const normalizedSuffix = toPosix(decodedPath)
    .replace(/^\.\//, "")
    .replace(/^(?:\.\.\/)+/, "")
    .replace(/\.md$/i, "")
    .toLowerCase()

  const suffixMatches = markdownFiles.filter((candidate) => {
    const relative = toPosix(path.relative(contentRoot, candidate)).replace(/\.md$/i, "").toLowerCase()
    return relative === normalizedSuffix || relative.endsWith(`/${normalizedSuffix}`)
  })
  if (suffixMatches.length === 1) return { file: suffixMatches[0], anchor }

  const basename = path.basename(decodedPath).replace(/\.md$/i, "").toLowerCase()
  const basenameMatches = markdownFiles.filter(
    (candidate) => path.basename(candidate, ".md").toLowerCase() === basename,
  )
  if (basenameMatches.length === 1) return { file: basenameMatches[0], anchor }

  const namedMatches = namesToFiles.get(normalizedName(decodedPath))
  if (namedMatches?.size === 1) return { file: [...namedMatches][0], anchor }

  return null
}

function linkableTargetFile(file) {
  const base = path.basename(file, ".md")
  const parent = path.basename(path.dirname(file))
  return base.toLowerCase() === "index" || base.toLowerCase() === parent.toLowerCase()
    ? { path: path.dirname(file), folder: true }
    : { path: file.replace(/\.md$/i, ""), folder: false }
}

function relativeTarget(sourceFile, targetFile) {
  const target = linkableTargetFile(targetFile)
  let relativePath = toPosix(path.relative(path.dirname(sourceFile), target.path))
  if (!relativePath.startsWith(".")) relativePath = `./${relativePath}`
  if (target.folder && !relativePath.endsWith("/")) relativePath += "/"
  return relativePath
}

function normalizeMarkdownLinks(sourceFile, text) {
  return text.replace(markdownLinkPattern, (match, label, rawTarget) => {
    const target = findTarget(sourceFile, rawTarget)
    if (!target) return match

    const relativePath = relativeTarget(sourceFile, target.file)

    // Angle-bracket destinations allow spaces and punctuation without pre-encoding,
    // while preserving normal relative-link resolution in Quartz.
    return `[${label}](<${relativePath}${target.anchor}>)`
  })
}

function normalizeRootMarkdownLinks(sourceFile, text) {
  return text.replace(rootMarkdownLinkPattern, (match, label, rawTarget) => {
    if (rawTarget.startsWith("//")) return match
    const [targetPath, anchor] = splitAnchor(rawTarget)
    const sourceDir = toPosix(path.relative(contentRoot, path.dirname(sourceFile))).toLowerCase()
    const destination = safeDecode(targetPath).replace(/^\//, "")
    let relativePath = path.posix.relative(sourceDir, destination)
    if (!relativePath.startsWith(".")) relativePath = `./${relativePath}`
    if (targetPath.endsWith("/") && !relativePath.endsWith("/")) relativePath += "/"
    return `[${label}](<${relativePath}${anchor}>)`
  })
}

function normalizeWikilinks(sourceFile, text) {
  return text.replace(wikilinkPattern, (match, rawTarget, alias = "") => {
    const target = findTarget(sourceFile, rawTarget)
    if (!target) return match
    return `[[${relativeTarget(sourceFile, target.file)}${target.anchor}${alias}]]`
  })
}

await collectMarkdown(contentRoot)
await indexDocumentNames()

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
  normalized = normalizeRootMarkdownLinks(fullPath, normalized)
  normalized = normalizeWikilinks(fullPath, normalized)

  if (normalized !== original) {
    await fs.writeFile(fullPath, normalized, "utf8")
    console.log(`Normalized moved-content links: ${path.relative(contentRoot, fullPath)}`)
  }
}
