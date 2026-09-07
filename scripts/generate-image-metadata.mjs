#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import YAML from "yaml"

const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"])
const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const rootArg = args.find((arg) => !arg.startsWith("--")) ?? "content"
const vaultRoot = path.resolve(rootArg)
const metadataRoot = path.join(vaultRoot, "Image Metadata")
const generatedRoot = path.join(metadataRoot, "Generated")

function walk(directory, predicate) {
  const out = []
  if (!fs.existsSync(directory)) return out
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, predicate))
    else if (entry.isFile() && predicate(full)) out.push(full)
  }
  return out
}

function readFrontmatter(filePath) {
  try {
    const source = fs.readFileSync(filePath, "utf8")
    const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
    return match ? (YAML.parse(match[1]) ?? {}) : {}
  } catch { return {} }
}

const normalize = (value) => String(value).replaceAll("\\", "/").replace(/^\/+/, "")
const known = new Set(
  walk(metadataRoot, (file) => file.toLowerCase().endsWith(".md"))
    .map(readFrontmatter)
    .filter((fm) => fm.type === "image" && typeof fm.asset === "string")
    .map((fm) => normalize(fm.asset)),
)

const images = walk(vaultRoot, (file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()))
  .filter((file) => !file.startsWith(metadataRoot + path.sep))

let created = 0
for (const imagePath of images) {
  const asset = normalize(path.relative(vaultRoot, imagePath))
  if (known.has(asset)) continue
  const stem = path.basename(asset, path.extname(asset))
  const recordName = asset.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "--").replace(/^-+|-+$/g, "").toLowerCase() + ".md"
  const output = path.join(generatedRoot, recordName)
  const frontmatter = {
    title: stem,
    type: "image",
    asset,
    characters: [],
    campaign: [],
    subjects: [],
    caption: "",
  }
  const content = `---\n${YAML.stringify(frontmatter).trimEnd()}\n---\n`
  console.log(`${dryRun ? "Would create" : "Creating"}: ${path.relative(vaultRoot, output)}`)
  if (!dryRun) {
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, content, { flag: "wx" })
  }
  created++
}

console.log(`${dryRun ? "Would create" : "Created"} ${created} metadata record${created === 1 ? "" : "s"}.`)
