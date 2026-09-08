import { promises as fs } from "node:fs"
import path from "node:path"

const outputRoot = path.resolve(process.argv[2] ?? "public")
const basePath = `/${(process.argv[3] ?? "inner-sea-region").replace(/^\/+|\/+$/g, "")}/`
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

function targetRoute(href, sourceRoute) {
  if (!href || href.startsWith("#") || /^(?:[a-z]+:|\/\/)/i.test(href)) return null
  try {
    const target = new URL(href, `https://local.invalid${sourceRoute}`)
    if (!target.pathname.startsWith(basePath)) return null
    return decodeURIComponent(target.pathname).replace(/\/$/, "") || "/"
  } catch {
    return null
  }
}

await collectOutput(outputRoot)
const routes = new Set(htmlFiles.map(routeFor).map((route) => route.replace(/\/$/, "") || "/"))
const brokenByTarget = new Map()

for (const file of htmlFiles) {
  const sourceRoute = routeFor(file)
  const html = await fs.readFile(file, "utf8")
  for (const match of html.matchAll(/<a\b[^>]*\bhref=(?:"([^"]*)"|'([^']*)')[^>]*>/gi)) {
    const target = targetRoute(match[1] ?? match[2], sourceRoute)
    if (!target || routes.has(target) || outputPaths.has(`${target}`)) continue
    if (!brokenByTarget.has(target)) brokenByTarget.set(target, new Set())
    brokenByTarget.get(target).add(sourceRoute)
  }
}

const broken = [...brokenByTarget]
  .map(([target, sources]) => ({ target, sources: [...sources].slice(0, 5) }))
  .sort((a, b) => a.target.localeCompare(b.target))

console.log(JSON.stringify({ pages: htmlFiles.length, brokenCount: broken.length, broken }, null, 2))
if (broken.length) process.exitCode = 1
