;(() => {
  const STORAGE_PREFIX = "isr-campaign-spoilers:"

  const normalizeCampaignKey = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")

  const storageKey = (campaign) => STORAGE_PREFIX + normalizeCampaignKey(campaign)

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
    const gate = document.querySelector(".campaign-spoiler-gate[data-campaign-key]")
    const reset = document.querySelector(".campaign-spoiler-reset[data-campaign-key]")

    if (!gate) {
      document.documentElement.classList.remove("campaign-spoiler-locked")
      return
    }

    const key = gate.dataset.campaignKey
    const enabled = isEnabled(key)
    gate.hidden = enabled
    if (reset) reset.hidden = !enabled
    document.documentElement.classList.toggle("campaign-spoiler-locked", !enabled)
  }

  const goBack = () => {
    if (history.length > 1) {
      history.back()
      return
    }
    const base =
      location.pathname === "/inner-sea-region" || location.pathname.startsWith("/inner-sea-region/")
        ? "/inner-sea-region"
        : ""
    location.href = base + "/campaigns"
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-spoiler-action]") : null
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
      applyGateState()
      document.dispatchEvent(
        new CustomEvent("isr:campaign-spoilers-changed", {
          detail: { campaign: key, enabled: false },
        }),
      )
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
  document.addEventListener("nav", applyGateState)

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyGateState, { once: true })
  } else {
    applyGateState()
  }
})()
