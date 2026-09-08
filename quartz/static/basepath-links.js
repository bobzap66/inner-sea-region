;(() => {
  const normalizeRootLink = (link) => {
    const base = document.body?.dataset?.basepath || ""
    if (!base) return

    const href = link.getAttribute("href")
    if (!href || !href.startsWith("/") || href.startsWith("//")) return
    if (href === base || href.startsWith(base + "/")) return

    link.setAttribute("href", `${base}${href}`.replace(/\/+/g, "/"))
  }

  const normalizeLinks = (root = document) => {
    if (root instanceof HTMLAnchorElement) normalizeRootLink(root)
    root.querySelectorAll?.('a[href^="/"]').forEach(normalizeRootLink)
  }

  normalizeLinks()
  document.addEventListener("nav", () => normalizeLinks())

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.target instanceof HTMLAnchorElement) {
        normalizeRootLink(mutation.target)
        continue
      }

      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) normalizeLinks(node)
      })
    }
  })

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["href"],
  })
})()
