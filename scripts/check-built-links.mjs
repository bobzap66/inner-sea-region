import { promises as fs } from "node:fs"
import path from "node:path"

const outputRoot = path.resolve(process.argv[2] ?? "public")
const basePath = `/${(process.argv[3] ?? "lantern-and-ledger").replace(/^\/+|\/+$/g, "")}/`
const baseRoot = basePath.replace(/\/$/, "")
const htmlFiles = []
const outputPaths = new Set()

async function collectOutput(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) await collectOutput(fullPath)
    else if (entry.isFile()) {
      const relative = path.relative(outputRoot, fullPath).split(path.sep).join("/")
      outputPaths.add(`${basePath}${relative}`.replace(/\/{2,}/g, "/"))
      if (entry.name.endsWith(".html")) htmlFiles.push(fullPath)
    }
  }
}

function routeFor(file) {
  const relative = path.relative(outputRoot, file).split(path.sep).join("/")
  if (relative === "index.html") return basePath
  return `${basePath}${relative.replace(/\.html$/, "").replace(/\/index$/, "/")}`
}

function isInsideBase(pathname) {
  return pathname === baseRoot || pathname.startsWith(basePath)
}

function inspectHref(href, sourceRoute) {
  if (!href || href.startsWith("#") || /^(?:[a-z]+:|\/\/)/i.test(href)) return null

  try {
    const target = new URL(href, `https://local.invalid${sourceRoute}`)
    const pathname = decodeURIComponent(target.pathname)

    if (href.startsWith("/") && !isInsideBase(pathname)) {
      return { kind: "escaped-base", target: pathname.replace(/\/$/, "") || "/" }
    }

    if (!isInsideBase(pathname)) return null
    return { kind: "internal", target: pathname.replace(/\/$/, "") || "/" }
  } catch {
    return null
  }
}

await collectOutput(outputRoot)
const routes = new Set(htmlFiles.map(routeFor).map((route) => route.replace(/\/$/, "") || "/"))
const brokenByTarget = new Map()
const brokenImagesByTarget = new Map()
const escapedByTarget = new Map()
const nonCanonicalByHref = new Map()
const selfRedirects = []

for (const file of htmlFiles) {
  const sourceRoute = routeFor(file)
  const html = await fs.readFile(file, "utf8")

  const refreshTag = html.match(/<meta\b[^>]*\bhttp-equiv=["']refresh["'][^>]*>/i)?.[0]
  const refreshContent = refreshTag?.match(/\bcontent=["']([^"']*)["']/i)?.[1]
  const refreshTarget = refreshContent?.match(/(?:^|;)\s*url\s*=\s*(.+)\s*$/i)?.[1]
  if (refreshTarget) {
    const resolved = new URL(refreshTarget, `https://local.invalid${sourceRoute}`)
    const sourcePath = sourceRoute.replace(/\/$/, "") || "/"
    const targetPath = resolved.pathname.replace(/\/$/, "") || "/"
    if (sourcePath === targetPath) selfRedirects.push(sourceRoute)
  }

  for (const match of html.matchAll(/<a\b[^>]*\bhref=(?:"([^"]*)"|'([^']*)')[^>]*>/gi)) {
    const href = match[1] ?? match[2]
    const inspected = inspectHref(href, sourceRoute)
    if (!inspected) continue

    if (inspected.kind === "escaped-base") {
      if (!escapedByTarget.has(inspected.target)) escapedByTarget.set(inspected.target, new Set())
      escapedByTarget.get(inspected.target).add(sourceRoute)
      continue
    }

    if (!(href === baseRoot || href.startsWith(basePath))) {
      if (!nonCanonicalByHref.has(href)) nonCanonicalByHref.set(href, new Set())
      nonCanonicalByHref.get(href).add(sourceRoute)
    }

    const target = inspected.target
    if (routes.has(target) || outputPaths.has(`${target}`)) continue
    if (!brokenByTarget.has(target)) brokenByTarget.set(target, new Set())
    brokenByTarget.get(target).add(sourceRoute)
  }

  for (const match of html.matchAll(/<img\b[^>]*\bsrc=(?:"([^"]*)"|'([^']*)')[^>]*>/gi)) {
    const src = match[1] ?? match[2]
    const inspected = inspectHref(src, sourceRoute)
    if (!inspected) continue

    const target = inspected.target
    if (inspected.kind === "internal" && outputPaths.has(target)) continue
    if (!brokenImagesByTarget.has(target)) brokenImagesByTarget.set(target, new Set())
    brokenImagesByTarget.get(target).add(sourceRoute)
  }
}

const broken = [...brokenByTarget]
  .map(([target, sources]) => ({ target, sources: [...sources].slice(0, 5) }))
  .sort((a, b) => a.target.localeCompare(b.target))

const brokenImages = [...brokenImagesByTarget]
  .map(([target, sources]) => ({ target, sources: [...sources].slice(0, 5) }))
  .sort((a, b) => a.target.localeCompare(b.target))

const brokenArticleImages = brokenImages.filter(({ sources }) =>
  sources.some((source) => source.includes("/articles/")),
)

const escapedBase = [...escapedByTarget]
  .map(([target, sources]) => ({ target, sources: [...sources].slice(0, 5) }))
  .sort((a, b) => a.target.localeCompare(b.target))

const nonCanonical = [...nonCanonicalByHref]
  .map(([href, sources]) => ({ href, sources: [...sources].slice(0, 5) }))
  .sort((a, b) => a.href.localeCompare(b.href))

console.log(
  JSON.stringify(
    {
      pages: htmlFiles.length,
      brokenCount: broken.length,
      brokenImageCount: brokenImages.length,
      brokenArticleImageCount: brokenArticleImages.length,
      escapedBaseCount: escapedBase.length,
      nonCanonicalCount: nonCanonical.length,
      selfRedirectCount: selfRedirects.length,
      broken,
      brokenImages,
      brokenArticleImages,
      escapedBase,
      nonCanonical,
      selfRedirects,
    },
    null,
    2,
  ),
)

if (broken.length || brokenArticleImages.length || escapedBase.length || nonCanonical.length || selfRedirects.length) {
  process.exitCode = 1
}
