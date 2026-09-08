import { promises as fs } from "node:fs"
import path from "node:path"

const outputRoot = path.resolve(process.argv[2] ?? "public")
const baseRoot = `/${(process.argv[3] ?? "inner-sea-region").replace(/^\/+|\/+$/g, "")}`
const htmlFiles = []

async function collectHtml(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) await collectHtml(fullPath)
    else if (entry.isFile() && entry.name.endsWith(".html")) htmlFiles.push(fullPath)
  }
}

function attributeValue(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, "i"))
  return match ? (match[1] ?? match[2] ?? "") : null
}

function canonicalHref(dataSlug, originalHref) {
  let slug = dataSlug.replace(/^\/+|\/+$/g, "")
  const hashIndex = originalHref.indexOf("#")
  const hash = hashIndex >= 0 ? originalHref.slice(hashIndex) : ""

  if (!slug || slug === "index") return `${baseRoot}/${hash}`

  if (slug.endsWith("/index")) {
    slug = slug.slice(0, -"/index".length)
    return `${baseRoot}/${slug}/${hash}`
  }

  return `${baseRoot}/${slug}${hash}`
}

await collectHtml(outputRoot)

let filesChanged = 0
let linksChanged = 0

for (const file of htmlFiles) {
  const original = await fs.readFile(file, "utf8")
  const rewritten = original.replace(/<a\b[^>]*>/gi, (tag) => {
    const href = attributeValue(tag, "href")
    const dataSlug = attributeValue(tag, "data-slug")
    if (href === null || dataSlug === null) return tag

    const canonical = canonicalHref(dataSlug, href)
    if (canonical === href) return tag

    linksChanged++
    return tag.replace(/\bhref=(?:"[^"]*"|'[^']*')/i, `href="${canonical}"`)
  })

  if (rewritten !== original) {
    await fs.writeFile(file, rewritten, "utf8")
    filesChanged++
  }
}

console.log(`Canonicalized ${linksChanged} rendered note link(s) across ${filesChanged} HTML file(s).`)
