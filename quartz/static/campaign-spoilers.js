;(() => {
  const STORAGE_PREFIX = "isr-campaign-spoilers:"

  const normalizeCampaignKey = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")

  const siteBase = () => document.body?.dataset?.basepath || ""

  const normalizeRootLink = (link) => {
    const base = siteBase().replace(/\/$/, "")
    if (!base) return

    const href = link.getAttribute("href")
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:"))
      return

    let url
    try {
      // Resolve relative component links exactly as the browser would from the
      // current page. Using location.origin here incorrectly collapsed links
      // such as ../npcs/foo to /npcs/foo before adding the repository path.
      url = new URL(href, location.href)
    } catch (_) {
      return
    }

    if (url.origin !== location.origin) return
    if (url.pathname === base || url.pathname.startsWith(base + "/")) return
    if (!url.pathname.startsWith("/")) return

    const normalizedPath = `${base}${url.pathname}`.replace(/\/+/g, "/")
    link.setAttribute("href", `${normalizedPath}${url.search}${url.hash}`)
  }

  const normalizeInternalLinks = (root = document) => {
    if (root instanceof HTMLAnchorElement) normalizeRootLink(root)
    root.querySelectorAll?.("a[href]").forEach(normalizeRootLink)
  }

  const normalizeEventLink = (event) => {
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null
    if (link instanceof HTMLAnchorElement) normalizeRootLink(link)
  }

  const installLinkNormalizer = () => {
    normalizeInternalLinks()
    if (window.__isrBasepathLinkObserver) return

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.target instanceof HTMLAnchorElement) {
          normalizeRootLink(mutation.target)
          continue
        }

        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) normalizeInternalLinks(node)
        })
      }
    })

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["href"],
    })

    document.addEventListener("pointerover", normalizeEventLink, true)
    document.addEventListener("focusin", normalizeEventLink, true)
    document.addEventListener("mousedown", normalizeEventLink, true)
    document.addEventListener("click", normalizeEventLink, true)

    window.__isrBasepathLinkObserver = observer
  }

  const isEnabled = (campaign) => {
    const key = normalizeCampaignKey(campaign)
    if (!key) return false
    try {
      return localStorage.getItem(STORAGE_PREFIX + key) === "true"
    } catch (_) {
      return false
    }
  }

  const setEnabled = (campaign, enabled) => {
    const key = normalizeCampaignKey(campaign)
    if (!key) return
    try {
      if (enabled) localStorage.setItem(STORAGE_PREFIX + key, "true")
      else localStorage.removeItem(STORAGE_PREFIX + key)
    } catch (_) {}
  }

  const applyGateState = () => {
    const body = document.querySelector("#quartz-body")
    const gate = document.querySelector(".campaign-spoiler-gate[data-campaign-key]")
    const reset = document.querySelector(".campaign-spoiler-reset[data-campaign-key]")

    if (!gate) {
      body?.classList.remove("campaign-spoiler-pending")
      document.documentElement.classList.remove("campaign-spoiler-locked")
      return
    }

    const key = gate.dataset.campaignKey
    const enabled = isEnabled(key)
    gate.hidden = enabled
    if (reset) reset.hidden = !enabled
    body?.classList.toggle("campaign-spoiler-pending", !enabled)
    document.documentElement.classList.toggle("campaign-spoiler-locked", !enabled)
  }

  const goBack = () => {
    if (history.length > 1) {
      history.back()
      return
    }
    location.href = siteBase() + "/campaigns"
  }

  document.addEventListener("click", (event) => {
    const target =
      event.target instanceof Element ? event.target.closest("[data-spoiler-action]") : null
    if (!target) return

    const action = target.getAttribute("data-spoiler-action")
    if (action === "back") {
      event.preventDefault()
      goBack()
      return
    }

    const gate = target.closest(".campaign-spoiler-gate[data-campaign-key]")
    const reset = target.closest(".campaign-spoiler-reset[data-campaign-key]")
    const source = gate || reset
    const key = source?.dataset?.campaignKey
    if (!key) return

    if (action === "opt-in") {
      event.preventDefault()
      setEnabled(key, true)
      applyGateState()
      document.dispatchEvent(
        new CustomEvent("isr:campaign-spoilers-changed", {
          detail: { campaign: key, enabled: true },
        }),
      )
    } else if (action === "reset") {
      event.preventDefault()
      setEnabled(key, false)
      document.dispatchEvent(
        new CustomEvent("isr:campaign-spoilers-changed", {
          detail: { campaign: key, enabled: false },
        }),
      )
      location.reload()
    }
  })

  const installCalendarFilter = () => {
    if (window.__isrCampaignCalendarFetchFiltered) return
    window.__isrCampaignCalendarFetchFiltered = true

    const nativeFetch = window.fetch.bind(window)
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args)
      const requestTarget = args[0]
      const url =
        typeof requestTarget === "string"
          ? requestTarget
          : typeof Request !== "undefined" && requestTarget instanceof Request
            ? requestTarget.url
            : ""

      if (!url.includes("golarion-events.json") || !response.ok) return response

      try {
        const data = await response.clone().json()
        data.campaigns = (data.campaigns || []).filter((campaign) =>
          isEnabled(campaign.id || campaign.name),
        )
        data.events = (data.events || []).filter(
          (event) => !event.campaign || isEnabled(event.campaign),
        )

        const headers = new Headers(response.headers)
        headers.set("content-type", "application/json; charset=utf-8")
        return new Response(JSON.stringify(data), {
          status: response.status,
          statusText: response.statusText,
          headers,
        })
      } catch (_) {
        return response
      }
    }
  }

  installCalendarFilter()
  installLinkNormalizer()
  document.addEventListener("nav", () => {
    applyGateState()
    normalizeInternalLinks()
  })

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        applyGateState()
        normalizeInternalLinks()
      },
      { once: true },
    )
  } else {
    applyGateState()
    normalizeInternalLinks()
  }
})()
