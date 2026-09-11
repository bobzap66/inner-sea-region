import { promises as fs } from "node:fs"
import path from "node:path"
import { slugifyFilePath } from "@quartz-community/utils"

const outputRoot = path.resolve(process.argv[2] ?? "public")
const baseRoot = `/${(process.argv[3] ?? "lantern-and-ledger").replace(/^\/+|\/+$/g, "")}`
const siteOrigin = new URL(process.argv[4] ?? "https://bobzap66.github.io").origin
const htmlFiles = []
const outputPaths = new Set()

async function collectOutput(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) await collectOutput(fullPath)
    else if (entry.isFile()) {
      const relative = path.relative(outputRoot, fullPath).split(path.sep).join("/")
      outputPaths.add(`${baseRoot}/${relative}`.replace(/\/{2,}/g, "/"))
      if (entry.name.endsWith(".html")) htmlFiles.push(fullPath)
    }
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

await collectOutput(outputRoot)

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

function canonicalImageSrc(file, originalSrc) {
  if (!originalSrc || /^(?:data:|blob:|\/\/)/i.test(originalSrc)) return originalSrc

  let target
  try {
    target = new URL(originalSrc, `${siteOrigin}${routeFor(file)}`)
  } catch {
    return originalSrc
  }

  if (target.origin !== siteOrigin) return originalSrc

  let pathname
  try {
    pathname = decodeURIComponent(target.pathname)
  } catch {
    pathname = target.pathname
  }

  const insideBase = pathname === baseRoot || pathname.startsWith(`${baseRoot}/`)
  if (!insideBase) {
    pathname = `${baseRoot}${pathname}`.replace(/\/{2,}/g, "/")
  }

  if (outputPaths.has(pathname)) return `${pathname}${target.search}${target.hash}`

  const relativeAssetPath = pathname.slice(baseRoot.length).replace(/^\/+/, "")
  if (!relativeAssetPath) return originalSrc

  const sluggedAssetPath = String(slugifyFilePath(relativeAssetPath)).replace(/^\/+/, "")
  const candidate = `${baseRoot}/${sluggedAssetPath}`.replace(/\/{2,}/g, "/")
  if (!outputPaths.has(candidate)) return originalSrc

  return `${candidate}${target.search}${target.hash}`
}

let filesChanged = 0
let linksChanged = 0
let imagesChanged = 0

for (const file of htmlFiles) {
  const original = await fs.readFile(file, "utf8")
  let rewritten = original.replace(/<a\b[^>]*>/gi, (tag) => {
    const href = attributeValue(tag, "href")
    const dataSlug = attributeValue(tag, "data-slug")
    if (href === null) return tag

    const canonical = canonicalHref(file, href, dataSlug)
    if (canonical === href) return tag

    linksChanged++
    return tag.replace(/\bhref=(?:"[^"]*"|'[^']*')/i, `href="${canonical}"`)
  })

  rewritten = rewritten.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = attributeValue(tag, "src")
    if (src === null) return tag

    const canonical = canonicalImageSrc(file, src)
    if (canonical === src) return tag

    imagesChanged++
    return tag.replace(/\bsrc=(?:"[^"]*"|'[^']*')/i, `src="${canonical}"`)
  })

  if (rewritten !== original) {
    await fs.writeFile(file, rewritten, "utf8")
    filesChanged++
  }
}

console.log(
  `Canonicalized ${linksChanged} rendered internal link(s) and ${imagesChanged} image source(s) across ${filesChanged} HTML file(s).`,
)
