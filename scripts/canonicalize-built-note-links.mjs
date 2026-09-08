import { promises as fs } from "node:fs"
import path from "node:path"

const outputRoot = path.resolve(process.argv[2] ?? "public")
const baseRoot = `/${(process.argv[3] ?? "inner-sea-region").replace(/^\/+|\/+$/g, "")}`
const siteOrigin = new URL(process.argv[4] ?? "https://bobzap66.github.io").origin
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

function routeFor(file) {
  const relative = path.relative(outputRoot, file).split(path.sep).join("/")
  if (relative === "index.html") return `${baseRoot}/`
  return `${baseRoot}/${relative.replace(/\.html$/, "").replace(/\/index$/, "/")}`
}

function suffixFor(originalHref) {
  const suffixIndex = originalHref.search(/[?#]/)
  return suffixIndex >= 0 ? originalHref.slice(suffixIndex) : ""
}

function canonicalSlugHref(dataSlug, originalHref) {
  let slug = dataSlug.replace(/^\/+|\/+$/g, "")
  const suffix = suffixFor(originalHref)

  if (!slug || slug === "index") return `${baseRoot}/${suffix}`

  if (slug.endsWith("/index")) {
    slug = slug.slice(0, -"/index".length)
    return `${baseRoot}/${slug}/${suffix}`
  }

  return `${baseRoot}/${slug}${suffix}`
}

await collectHtml(outputRoot)

const canonicalRoutes = new Map()
for (const file of htmlFiles) {
  const route = routeFor(file)
  canonicalRoutes.set(route.replace(/\/$/, "") || "/", route)
}

function canonicalHref(file, originalHref, dataSlug) {
  if (!originalHref || originalHref.startsWith("#")) return originalHref
  if (/^(?:mailto:|tel:|javascript:|data:|blob:|\/\/)/i.test(originalHref)) return originalHref
  if (dataSlug !== null) return canonicalSlugHref(dataSlug, originalHref)

  let target
  try {
    target = new URL(originalHref, `${siteOrigin}${routeFor(file)}`)
  } catch {
    return originalHref
  }

  if (target.origin !== siteOrigin) return originalHref

  let pathname = target.pathname
  const insideBase = pathname === baseRoot || pathname.startsWith(`${baseRoot}/`)
  if (!insideBase) {
    pathname = `${baseRoot}${pathname}`.replace(/\/{2,}/g, "/")
  }

  const routeKey = pathname.replace(/\/$/, "") || "/"
  pathname = canonicalRoutes.get(routeKey) ?? pathname
  return `${pathname}${target.search}${target.hash}`
}

let filesChanged = 0
let linksChanged = 0

for (const file of htmlFiles) {
  const original = await fs.readFile(file, "utf8")
  const rewritten = original.replace(/<a\b[^>]*>/gi, (tag) => {
    const href = attributeValue(tag, "href")
    const dataSlug = attributeValue(tag, "data-slug")
    if (href === null) return tag

    const canonical = canonicalHref(file, href, dataSlug)
    if (canonical === href) return tag

    linksChanged++
    return tag.replace(/\bhref=(?:"[^"]*"|'[^']*')/i, `href="${canonical}"`)
  })

  if (rewritten !== original) {
    await fs.writeFile(file, rewritten, "utf8")
    filesChanged++
  }
}

console.log(
  `Canonicalized ${linksChanged} rendered internal link(s) across ${filesChanged} HTML file(s).`,
)
