import { promises as fs } from "node:fs"
import path from "node:path"

const contentRoot = path.resolve(process.argv[2] ?? "content")
const assetPattern = /(?:\.\.\/)+assets\//g
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

await collectMarkdown(contentRoot)

for (const fullPath of markdownFiles) {
  const relativeDir = path.relative(contentRoot, path.dirname(fullPath))
  const depth = relativeDir.split(path.sep).filter(Boolean).length
  if (depth === 0) continue

  const original = await fs.readFile(fullPath, "utf8")
  const correctPrefix = `${"../".repeat(depth)}assets/`
  const normalized = original.replace(assetPattern, correctPrefix)

  if (normalized !== original) {
    await fs.writeFile(fullPath, normalized, "utf8")
    console.log(`Normalized asset paths: ${path.relative(contentRoot, fullPath)}`)
  }
}
