import { promises as fs } from "node:fs"
import path from "node:path"

const contentRoot = path.resolve("content")
const assetPattern = /(?:\.\.\/)+assets\//g

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name === ".git") continue

    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(fullPath)
      continue
    }

    if (!entry.isFile() || !entry.name.endsWith(".md")) continue

    const relativeDir = path.relative(contentRoot, path.dirname(fullPath))
    const depth = relativeDir
      .split(path.sep)
      .filter(Boolean).length

    if (depth === 0) continue

    const correctPrefix = `${"../".repeat(depth)}assets/`
    const original = await fs.readFile(fullPath, "utf8")
    const normalized = original.replace(assetPattern, correctPrefix)

    if (normalized !== original) {
      await fs.writeFile(fullPath, normalized, "utf8")
      console.log(`Normalized asset paths: ${path.relative(contentRoot, fullPath)}`)
    }
  }
}

await walk(contentRoot)
