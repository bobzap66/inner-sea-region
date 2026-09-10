;(() => {
  const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

  const calendarScriptBase = (() => {
    const script = [...document.scripts].find((item) =>
      /\/static\/golarion-history-browser\.js(?:\?|$)/.test(item.src),
    )
    if (!script?.src) return ""
    try {
      return new URL(script.src, location.href).pathname
        .replace(/\/static\/golarion-history-browser\.js$/, "")
        .replace(/\/$/, "")
    } catch (_) {
      return ""
    }
  })()

  const siteBase = () =>
    (document.body?.dataset?.basepath || calendarScriptBase || "").replace(/\/$/, "")

  const isLeapYear = (year) => year % 8 === 0
  const monthLength = (year, month) => (month === 1 && isLeapYear(year) ? 29 : MONTH_LENGTHS[month])

  const escapeHtml = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;")

  const sourceHref = (source) => {
    if (/^https?:\/\//i.test(source)) return source
    const slug = String(source).replace(/^\/+|\/+$/g, "")
    return `${siteBase()}/${slug}`.replace(/\/+/g, "/")
  }

  const pathfinderWikiHref = (name) =>
    `https://pathfinderwiki.com/wiki/Special:Search?search=${encodeURIComponent(name)}`

  const sameDate = (eventDate, target) =>
    eventDate && eventDate.month === target.month && eventDate.day === target.day

  const formatEventRange = (event, months) => {
    const start = event.rangeStart
    const end = event.rangeEnd
    if (!event.isMultiDay || !start || !end) return ""
    if (start.year === end.year && start.month === end.month)
      return `${months[start.month]} ${start.day}–${end.day}, ${start.year} AR`
    if (start.year === end.year)
      return `${months[start.month]} ${start.day}–${months[end.month]} ${end.day}, ${start.year} AR`
    return `${months[start.month]} ${start.day}, ${start.year} AR–${months[end.month]} ${end.day}, ${end.year} AR`
  }

  const install = async () => {
    const root = document.querySelector("#golarion-today")
    if (!root || root.dataset.historyBrowserInitialized === "true") return
    root.dataset.historyBrowserInitialized = "true"

    try {
      const response = await fetch(`${siteBase()}/static/golarion-events.json`, { cache: "no-cache" })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      const realToday = new Date()
      const year = realToday.getFullYear() + (data.realWorldYearOffset ?? 2700)
      const actualToday = {
        year,
        month: realToday.getMonth(),
        day: Math.min(realToday.getDate(), monthLength(year, realToday.getMonth())),
      }
      let selected = { ...actualToday }

      const render = () => {
        selected.day = Math.min(selected.day, monthLength(selected.year, selected.month))

        const holidays = (data.holidays ?? [])
          .filter((event) => event.month === selected.month && event.day === selected.day)
          .sort((a, b) => a.name.localeCompare(b.name))

        const grouped = new Map()
        for (const event of data.events ?? []) {
          if (event.year > selected.year || event.month !== selected.month || event.day !== selected.day)
            continue
          if (event.isMultiDay && event.rangeStart && event.rangeEnd) {
            const atStart = sameDate(event.rangeStart, selected)
            const atEnd = sameDate(event.rangeEnd, selected)
            if (!atStart && !atEnd) continue
          }
          const originalYear = event.rangeStart?.year ?? event.year
          const key = `${originalYear}|${event.name.trim().toLocaleLowerCase()}`
          const existing = grouped.get(key)
          if (existing) {
            if (event.source && !existing.sources.some((source) => source.slug === event.source))
              existing.sources.push({ slug: event.source, campaign: event.campaign, kind: event.kind })
            continue
          }
          grouped.set(key, {
            ...event,
            yearsAgo: selected.year - originalYear,
            sources: event.source
              ? [{ slug: event.source, campaign: event.campaign, kind: event.kind }]
              : [],
          })
        }
        const anniversaries = [...grouped.values()].sort(
          (a, b) =>
            (b.rangeStart?.year ?? b.year) - (a.rangeStart?.year ?? a.year) ||
            a.name.localeCompare(b.name),
        )

        const monthlyHistory = (data.events ?? [])
          .filter(
            (event) =>
              event.kind === "historical" &&
              event.datePrecision === "month" &&
              event.year <= selected.year &&
              event.month === selected.month,
          )
          .map((event) => ({ ...event, yearsAgo: selected.year - event.year }))
          .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name))

        const yearlyHistory = (data.events ?? [])
          .filter((event) => {
            if (event.kind !== "historical" || event.datePrecision !== "year") return false
            const yearsAgo = selected.year - event.year
            return yearsAgo >= 100 && yearsAgo % 100 === 0
          })
          .map((event) => ({ ...event, yearsAgo: selected.year - event.year }))
          .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name))

        const sourceLinks = (event) =>
          event.sources
            .map((source, index) => {
              const label = source.campaign || (source.kind === "historical" ? "Time.Graphics" : index === 0 ? "Source" : `Source ${index + 1}`)
              const external = /^https?:\/\//i.test(source.slug)
              return `<a href="${sourceHref(source.slug)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(label)}</a>`
            })
            .join(" · ")

        const monthOptions = data.months
          .map((month, index) => `<option value="${index}"${selected.month === index ? " selected" : ""}>${escapeHtml(month)}</option>`)
          .join("")
        const dayOptions = Array.from({ length: monthLength(selected.year, selected.month) }, (_, index) => index + 1)
          .map((day) => `<option value="${day}"${selected.day === day ? " selected" : ""}>${day}</option>`)
          .join("")

        const holidayMarkup = holidays.length
          ? `<ul class="golarion-today-list">${holidays.map((event) => `<li class="is-holiday"><strong>${escapeHtml(event.name)}</strong><span>Golarion holiday</span>${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}</li>`).join("")}</ul>`
          : '<p class="golarion-today-empty">No fixed-date holidays are recorded on this date.</p>'

        const anniversaryMarkup = anniversaries.length
          ? `<ul class="golarion-today-list">${anniversaries.map((event) => {
              const dateLabel = formatEventRange(event, data.months) || `${data.months[event.month]} ${event.day}, ${event.year} AR`
              return `<li class="is-anniversary"><strong>${escapeHtml(event.name)}</strong><span>${event.yearsAgo === 0 ? "This year" : `${event.yearsAgo} ${event.yearsAgo === 1 ? "year" : "years"} ago`} · ${escapeHtml(dateLabel)}</span>${event.sources.length ? `<p class="golarion-today-sources">${sourceLinks(event)}</p>` : ""}</li>`
            }).join("")}</ul>`
          : '<p class="golarion-today-empty">No anniversaries are recorded on this date.</p>'

        const monthlyMarkup = monthlyHistory.length
          ? `<ul class="golarion-today-list">${monthlyHistory.map((event) => `<li class="is-anniversary"><strong>${escapeHtml(event.name)}</strong><span>${event.yearsAgo === 0 ? "This year" : `${event.yearsAgo} ${event.yearsAgo === 1 ? "year" : "years"} ago`} · ${escapeHtml(data.months[event.month])} ${event.year} AR</span>${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}<p class="golarion-today-sources"><a href="${pathfinderWikiHref(event.name)}" target="_blank" rel="noopener noreferrer">PathfinderWiki</a></p></li>`).join("")}</ul>`
          : `<p class="golarion-today-empty">No month-level historical events are recorded for ${escapeHtml(data.months[selected.month])}.</p>`

        const yearlyMarkup = yearlyHistory.length
          ? `<ul class="golarion-today-list">${yearlyHistory.map((event) => `<li class="is-anniversary"><strong>${escapeHtml(event.name)}</strong><span>${event.yearsAgo} years ago · ${event.year} AR</span>${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}<p class="golarion-today-sources"><a href="${pathfinderWikiHref(event.name)}" target="_blank" rel="noopener noreferrer">PathfinderWiki</a></p></li>`).join("")}</ul>`
          : '<p class="golarion-today-empty">No 100-year anniversary events are recorded for this year.</p>'

        root.innerHTML = `
          <section class="golarion-today-shell" aria-label="On This Date in History">
            <header class="golarion-today-heading">
              <span>On This Date in History</span>
              <h2>${escapeHtml(data.months[selected.month])} ${selected.day}, ${selected.year} AR</h2>
              <div class="golarion-history-browser-controls">
                <label>Month <select data-history-month>${monthOptions}</select></label>
                <label>Day <select data-history-day>${dayOptions}</select></label>
                <button type="button" data-history-today>Today</button>
              </div>
            </header>
            <div class="golarion-today-section"><h3>Observances</h3>${holidayMarkup}</div>
            <div class="golarion-today-section"><h3>On This Day</h3>${anniversaryMarkup}</div>
            <div class="golarion-today-section"><h3>This Month in History</h3>${monthlyMarkup}</div>
            <div class="golarion-today-section"><h3>This Year in History</h3>${yearlyMarkup}</div>
          </section>`

        root.querySelector("[data-history-month]")?.addEventListener("change", (event) => {
          selected.month = Number(event.target.value)
          selected.day = Math.min(selected.day, monthLength(selected.year, selected.month))
          render()
        })
        root.querySelector("[data-history-day]")?.addEventListener("change", (event) => {
          selected.day = Number(event.target.value)
          render()
        })
        root.querySelector("[data-history-today]")?.addEventListener("click", () => {
          selected = { ...actualToday }
          render()
        })
      }

      render()
    } catch (error) {
      console.error("Failed to load browseable Golarion history", error)
      root.innerHTML = '<p class="golarion-calendar-error">Golarion history could not be loaded.</p>'
    }
  }

  document.addEventListener("nav", install)
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true })
  else install()
})()
