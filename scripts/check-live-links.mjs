const siteRoot = new URL(process.argv[2] || "https://bobzap66.github.io/inner-sea-region/")
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
    if (!url.pathname.startsWith(siteRoot.pathname)) return null
    url.hash = ""
    return url
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
const fetchFailures = []

await pooled(pageUrls, async (pageUrl) => {
  try {
    const response = await fetch(pageUrl)
    if (!response.ok) {
      fetchFailures.push({ status: response.status, url: pageUrl })
      return
    }
    const html = await response.text()
    const hrefs = [
      ...[...html.matchAll(/href="([^"]*)"/gi)].map((match) => match[1]),
      ...[...html.matchAll(/href='([^']*)'/gi)].map((match) => match[1]),
    ]
    for (const href of hrefs) {
      const target = internalUrl(href, pageUrl)
      if (!target) continue
      const key = target.href
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
    broken.push({ status: "ERR", url, error: error.message, sources: [...sourcesByTarget.get(url)] })
  }
})

broken.sort((a, b) => a.url.localeCompare(b.url))
console.log(
  JSON.stringify(
    {
      site: siteRoot.href,
      pages: pageUrls.length,
      uniqueInternalLinks: sourcesByTarget.size,
      nonSitemapTargetsChecked: candidates.length,
      brokenCount: broken.length,
      pageFetchFailures: fetchFailures,
      broken,
    },
    null,
    2,
  ),
)

if (fetchFailures.length || broken.length) process.exitCode = 1
