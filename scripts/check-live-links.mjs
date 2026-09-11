const siteRoot = new URL(process.argv[2] || "https://bobzap66.github.io/lantern-and-ledger/")
const concurrency = Math.max(1, Number(process.argv[3] || 16))

const decodeHtml = (value) =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#039;", "'")

const internalUrl = (href, source) => {
  if (!href || href.startsWith("#")) return null
  if (/^(?:mailto:|tel:|javascript:|data:)/i.test(href)) return null
  try {
    const url = new URL(decodeHtml(href), source)
    if (url.origin !== siteRoot.origin) return null
    url.hash = ""
    const insideBase =
      url.pathname === siteRoot.pathname.replace(/\/$/, "") ||
      url.pathname.startsWith(siteRoot.pathname)
    return { url, insideBase }
  } catch {
    return null
  }
}

async function pooled(items, worker) {
  let cursor = 0
  const results = []
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++
        results[index] = await worker(items[index], index)
      }
    }),
  )
  return results
}

const sitemapResponse = await fetch(new URL("sitemap.xml", siteRoot))
if (!sitemapResponse.ok) throw new Error(`Could not load sitemap: HTTP ${sitemapResponse.status}`)
const sitemap = await sitemapResponse.text()
const pageUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1])
const sitemapPaths = new Set(pageUrls.map((url) => new URL(url).pathname.replace(/\/$/, "")))
const sourcesByTarget = new Map()
const escapedBaseByTarget = new Map()
const nonCanonicalByHref = new Map()
const selfRedirects = []
const fetchFailures = []

const basePath = siteRoot.pathname.replace(/\/$/, "")
const hasLiteralBasePath = (href) => {
  const decoded = decodeHtml(href)
  return (
    decoded === basePath ||
    decoded.startsWith(`${basePath}/`) ||
    decoded.startsWith(`${basePath}?`) ||
    decoded.startsWith(`${basePath}#`)
  )
}

await pooled(pageUrls, async (pageUrl) => {
  try {
    const response = await fetch(pageUrl)
    if (!response.ok) {
      fetchFailures.push({ status: response.status, url: pageUrl })
      return
    }
    const html = await response.text()
    const refreshTag = html.match(/<meta\b[^>]*\bhttp-equiv=["']refresh["'][^>]*>/i)?.[0]
    const refreshContent = refreshTag?.match(/\bcontent=["']([^"']*)["']/i)?.[1]
    const refreshTarget = refreshContent?.match(/(?:^|;)\s*url\s*=\s*(.+)\s*$/i)?.[1]
    if (refreshTarget) {
      const resolved = new URL(decodeHtml(refreshTarget), pageUrl)
      const sourcePath = new URL(pageUrl).pathname.replace(/\/$/, "") || "/"
      const targetPath = resolved.pathname.replace(/\/$/, "") || "/"
      if (resolved.origin === siteRoot.origin && sourcePath === targetPath) {
        selfRedirects.push(pageUrl)
      }
    }
    const hrefs = [
      ...[...html.matchAll(/href="([^"]*)"/gi)].map((match) => match[1]),
      ...[...html.matchAll(/href='([^']*)'/gi)].map((match) => match[1]),
    ]
    const anchorHrefs = [...html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1/gi)].map(
      (match) => match[2],
    )
    for (const href of anchorHrefs) {
      const inspected = internalUrl(href, pageUrl)
      if (!inspected || !inspected.insideBase || hasLiteralBasePath(href)) continue
      const key = decodeHtml(href)
      if (!nonCanonicalByHref.has(key)) {
        nonCanonicalByHref.set(key, { target: inspected.url.href, sources: new Set() })
      }
      nonCanonicalByHref.get(key).sources.add(pageUrl)
    }
    for (const href of hrefs) {
      const inspected = internalUrl(href, pageUrl)
      if (!inspected) continue
      const key = inspected.url.href
      if (!inspected.insideBase) {
        if (!escapedBaseByTarget.has(key)) escapedBaseByTarget.set(key, new Set())
        escapedBaseByTarget.get(key).add(pageUrl)
        continue
      }
      if (!sourcesByTarget.has(key)) sourcesByTarget.set(key, new Set())
      sourcesByTarget.get(key).add(pageUrl)
    }
  } catch (error) {
    fetchFailures.push({ status: "ERR", url: pageUrl, error: error.message })
  }
})

const candidates = [...sourcesByTarget.keys()].filter((url) => {
  const path = new URL(url).pathname.replace(/\/$/, "")
  return !sitemapPaths.has(path)
})

const broken = []
await pooled(candidates, async (url) => {
  try {
    const response = await fetch(url, { redirect: "manual" })
    if (response.status >= 400) {
      broken.push({
        status: response.status,
        url,
        sources: [...sourcesByTarget.get(url)].slice(0, 5),
      })
    }
  } catch (error) {
    broken.push({
      status: "ERR",
      url,
      error: error.message,
      sources: [...sourcesByTarget.get(url)],
    })
  }
})

broken.sort((a, b) => a.url.localeCompare(b.url))
const escapedBase = [...escapedBaseByTarget]
  .map(([url, sources]) => ({ url, sources: [...sources].slice(0, 5) }))
  .sort((a, b) => a.url.localeCompare(b.url))
const nonCanonical = [...nonCanonicalByHref]
  .map(([href, details]) => ({
    href,
    target: details.target,
    sources: [...details.sources].slice(0, 5),
  }))
  .sort((a, b) => a.href.localeCompare(b.href))
console.log(
  JSON.stringify(
    {
      site: siteRoot.href,
      pages: pageUrls.length,
      uniqueInternalLinks: sourcesByTarget.size,
      nonSitemapTargetsChecked: candidates.length,
      brokenCount: broken.length,
      escapedBaseCount: escapedBase.length,
      nonCanonicalCount: nonCanonical.length,
      selfRedirectCount: selfRedirects.length,
      pageFetchFailures: fetchFailures,
      broken,
      escapedBase,
      nonCanonical,
      selfRedirects,
    },
    null,
    2,
  ),
)

if (
  fetchFailures.length ||
  broken.length ||
  escapedBase.length ||
  nonCanonical.length ||
  selfRedirects.length
) {
  process.exitCode = 1
}
