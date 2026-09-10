;(() => {
  const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const ANCHOR = { year: 4710, month: 1, day: 17, weekday: 3 }
  const MIN_YEAR = -10000
  const MAX_YEAR = 10000

  const calendarScriptBase = (() => {
    const script = [...document.scripts].find((item) =>
      /\/static\/golarion-calendar\.js(?:\?|$)/.test(item.src),
    )
    if (!script?.src) return ""
    try {
      return new URL(script.src, location.href).pathname
        .replace(/\/static\/golarion-calendar\.js$/, "")
        .replace(/\/$/, "")
    } catch (_) {
      return ""
    }
  })()

  const siteBase = () =>
    (document.body?.dataset?.basepath || calendarScriptBase || "").replace(/\/$/, "")

  const isLeapYear = (year) => year % 8 === 0
  const monthLength = (year, month) => (month === 1 && isLeapYear(year) ? 29 : MONTH_LENGTHS[month])
  const clampYear = (value) => Math.min(MAX_YEAR, Math.max(MIN_YEAR, value))

  const serialDay = (year, month, day) => {
    let total = (year - 1) * 365 + Math.floor((year - 1) / 8)
    for (let m = 0; m < month; m += 1) total += monthLength(year, m)
    return total + day - 1
  }

  const anchorSerial = serialDay(ANCHOR.year, ANCHOR.month, ANCHOR.day)
  const weekdayOffset = (((ANCHOR.weekday - (anchorSerial % 7)) % 7) + 7) % 7
  const weekdayFor = (year, month, day) =>
    (((serialDay(year, month, day) + weekdayOffset) % 7) + 7) % 7

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

  const golarionToday = (data) => {
    const realToday = new Date()
    const year = realToday.getFullYear() + (data.realWorldYearOffset ?? 2700)
    return {
      year,
      month: realToday.getMonth(),
      day: Math.min(realToday.getDate(), monthLength(year, realToday.getMonth())),
    }
  }

  const formatEventRange = (event, months) => {
    const start = event.rangeStart
    const end = event.rangeEnd
    if (!event.isMultiDay || !start || !end) return ""

    if (start.year === end.year && start.month === end.month) {
      return `${months[start.month]} ${start.day}–${end.day}, ${start.year} AR`
    }
    if (start.year === end.year) {
      return `${months[start.month]} ${start.day}–${months[end.month]} ${end.day}, ${start.year} AR`
    }
    return `${months[start.month]} ${start.day}, ${start.year} AR–${months[end.month]} ${end.day}, ${end.year} AR`
  }

  const loadCalendarData = async () => {
    const response = await fetch(`${siteBase()}/static/golarion-events.json`, { cache: "no-cache" })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  }

  const installCalendar = async () => {
    const root = document.querySelector("#golarion-calendar")
    if (!root || root.dataset.initialized === "true") return
    root.dataset.initialized = "true"

    try {
      const data = await loadCalendarData()
      const months = data.months
      const weekdays = data.weekdays
      const campaigns = data.campaigns ?? []
      const holidays = data.holidays ?? []
      const campaignEvents = data.events ?? []

      const allToday = golarionToday(data)

      let stored = null
      try {
        stored = JSON.parse(localStorage.getItem("isr-golarion-calendar-view") || "null")
      } catch (_) {}

      let filter = stored?.filter || "all"
      let year = clampYear(Number.isInteger(stored?.year) ? stored.year : allToday.year)
      let month = Number.isInteger(stored?.month) ? stored.month : allToday.month
      let selectedDay = Number.isInteger(stored?.day) ? stored.day : allToday.day

      const campaignForFilter = () => campaigns.find((campaign) => campaign.id === filter)
      const focusDate = () =>
        filter === "all" ? allToday : campaignForFilter()?.currentDate || null

      const saveView = () => {
        try {
          localStorage.setItem(
            "isr-golarion-calendar-view",
            JSON.stringify({ filter, year, month, day: selectedDay }),
          )
        } catch (_) {}
      }

      const eventsForDate = (targetYear, targetMonth, targetDay) => {
        const holidayMatches = holidays
          .filter((event) => event.month === targetMonth && event.day === targetDay)
          .map((event) => ({ ...event, year: targetYear }))
        const campaignMatches = campaignEvents.filter(
          (event) =>
            event.year === targetYear &&
            event.month === targetMonth &&
            event.day === targetDay &&
            (filter === "all" || event.campaign === filter),
        )
        return [...holidayMatches, ...campaignMatches]
      }

      const jumpToFocus = () => {
        const target = focusDate()
        if (!target) return
        year = clampYear(target.year)
        month = target.month
        selectedDay = target.day
      }

      if (filter !== "all" && !campaignForFilter()) filter = "all"
      if (!stored) jumpToFocus()

      const renderDetails = () => {
        const details = root.querySelector(".golarion-calendar-details")
        if (!details) return
        const events = eventsForDate(year, month, selectedDay)
        const monthHistory =
          filter === "all"
            ? campaignEvents.filter(
                (event) =>
                  event.kind === "historical" &&
                  event.datePrecision === "month" &&
                  event.year === year &&
                  event.month === month,
              )
            : []
        const yearHistory =
          filter === "all"
            ? campaignEvents.filter(
                (event) =>
                  event.kind === "historical" &&
                  event.datePrecision === "year" &&
                  event.year === year,
              )
            : []
        const precisionSection = (heading, matchingEvents, dateLabel) =>
          matchingEvents.length
            ? `<section class="golarion-calendar-period-history">
                <h4>${heading}</h4>
                <ul>${matchingEvents
                  .map((event) => {
                    const useWiki = event.kind === "historical" && event.datePrecision === "month"
                    const href = useWiki
                      ? pathfinderWikiHref(event.name)
                      : event.source
                        ? sourceHref(event.source)
                        : null
                    const title = href
                      ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(event.name)}</a>`
                      : `<strong>${escapeHtml(event.name)}</strong>`
                    return `<li>${title}<span>Golarion History · ${dateLabel}</span>${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}</li>`
                  })
                  .join("")}</ul>
              </section>`
            : ""
        details.innerHTML = `
          <h3>${escapeHtml(months[month])} ${selectedDay}, ${year} AR</h3>
          ${
            events.length
              ? `<ul>${events
                  .map((event) => {
                    const label =
                      event.kind === "holiday"
                        ? "Golarion Holiday"
                        : event.kind === "historical"
                          ? "Golarion History"
                          : event.campaign || event.category
                    const rangeLabel = formatEventRange(event, months)
                    const title = event.source
                      ? `<a href="${sourceHref(event.source)}"${/^https?:\/\//i.test(event.source) ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(event.name)}</a>`
                      : `<strong>${escapeHtml(event.name)}</strong>`
                    return `<li class="${event.kind === "holiday" ? "is-holiday" : "is-campaign-event"}">${title}<span>${escapeHtml(label)}${rangeLabel ? ` · ${escapeHtml(rangeLabel)}` : ""}</span>${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}</li>`
                  })
                  .join("")}</ul>`
              : "<p>No recorded events on this date.</p>"
          }
          ${precisionSection("This Month", monthHistory, `${escapeHtml(months[month])} ${year} AR`)}
          ${precisionSection("This Year", yearHistory, `${year} AR`)}
        `
      }

      const render = () => {
        const focus = focusDate()
        const days = monthLength(year, month)
        selectedDay = Math.min(Math.max(1, selectedDay), days)
        const firstWeekday = weekdayFor(year, month, 1)
        const cells = []
        for (let i = 0; i < firstWeekday; i += 1)
          cells.push('<div class="golarion-calendar-day is-empty" aria-hidden="true"></div>')
        for (let day = 1; day <= days; day += 1) {
          const events = eventsForDate(year, month, day)
          const isCurrent =
            focus && year === focus.year && month === focus.month && day === focus.day
          const isSelected = day === selectedDay
          const hasHoliday = events.some((event) => event.kind === "holiday")
          cells.push(`
            <button class="golarion-calendar-day${events.length ? " has-events" : ""}${hasHoliday ? " has-holiday" : ""}${isCurrent ? " is-current" : ""}${isSelected ? " is-selected" : ""}" data-day="${day}" type="button">
              <span class="golarion-calendar-day-number">${day}</span>
              ${events.length ? `<span class="golarion-calendar-event-count">${events.length}</span>` : ""}
              <span class="golarion-calendar-day-events">
                ${events
                  .slice(0, 2)
                  .map(
                    (event) =>
                      `<span class="${event.kind === "holiday" ? "is-holiday" : ""}">${escapeHtml(event.name)}</span>`,
                  )
                  .join("")}
                ${events.length > 2 ? `<span>+${events.length - 2} more</span>` : ""}
              </span>
            </button>
          `)
        }

        const campaignOptions = campaigns
          .map(
            (campaign) =>
              `<option value="${escapeHtml(campaign.id)}"${filter === campaign.id ? " selected" : ""}>${escapeHtml(campaign.name)}</option>`,
          )
          .join("")
        const focusLabel =
          filter === "all"
            ? "Today"
            : campaignForFilter()?.currentDate
              ? "Current campaign date"
              : "No current date set"
        const atMinYear = year <= MIN_YEAR
        const atMaxYear = year >= MAX_YEAR
        const atMinMonth = atMinYear && month === 0
        const atMaxMonth = atMaxYear && month === 11

        root.innerHTML = `
          <section class="golarion-calendar-shell" aria-label="Golarion Calendar">
            <div class="golarion-calendar-filterbar">
              <label for="golarion-campaign-filter">Campaign</label>
              <select id="golarion-campaign-filter">
                <option value="all"${filter === "all" ? " selected" : ""}>All</option>
                ${campaignOptions}
              </select>
              <span class="golarion-calendar-filter-note">Holidays and Golarion history are shown in All.</span>
            </div>
            <div class="golarion-calendar-toolbar">
              <button type="button" data-action="prev-year" aria-label="Previous year"${atMinYear ? " disabled" : ""}>«</button>
              <button type="button" data-action="prev-month" aria-label="Previous month"${atMinMonth ? " disabled" : ""}>‹</button>
              <div class="golarion-calendar-heading">
                <strong>${escapeHtml(months[month])}</strong>
                <button class="golarion-calendar-year" type="button" aria-label="Jump to a specific year" title="Jump to a specific year">${year} AR</button>
              </div>
              <button type="button" data-action="next-month" aria-label="Next month"${atMaxMonth ? " disabled" : ""}>›</button>
              <button type="button" data-action="next-year" aria-label="Next year"${atMaxYear ? " disabled" : ""}>»</button>
              <button class="golarion-calendar-today" type="button" data-action="today"${focus ? "" : " disabled"}>${escapeHtml(focusLabel)}</button>
            </div>
            <div class="golarion-calendar-weekdays">${weekdays.map((day) => `<span>${escapeHtml(day.slice(0, 3))}</span>`).join("")}</div>
            <div class="golarion-calendar-grid">${cells.join("")}</div>
            <div class="golarion-calendar-details" aria-live="polite"></div>
          </section>
        `

        root.querySelector("#golarion-campaign-filter")?.addEventListener("change", (event) => {
          filter = event.target.value
          jumpToFocus()
          saveView()
          render()
        })

        root.querySelector(".golarion-calendar-year")?.addEventListener("click", (event) => {
          const button = event.currentTarget
          const form = document.createElement("form")
          form.className = "golarion-calendar-year-editor"
          form.innerHTML = `
            <input type="number" min="${MIN_YEAR}" max="${MAX_YEAR}" step="1" value="${year}" aria-label="Golarion year" />
            <button type="submit">Go</button>
          `
          button.replaceWith(form)
          const input = form.querySelector("input")
          input?.focus()
          input?.select()

          form.addEventListener("submit", (submitEvent) => {
            submitEvent.preventDefault()
            const nextYear = Number(input?.value)
            if (!Number.isInteger(nextYear) || nextYear < MIN_YEAR || nextYear > MAX_YEAR) {
              input?.setCustomValidity(`Enter a year from ${MIN_YEAR} to ${MAX_YEAR}.`)
              input?.reportValidity()
              return
            }
            input?.setCustomValidity("")
            year = nextYear
            selectedDay = Math.min(selectedDay, monthLength(year, month))
            saveView()
            render()
          })

          input?.addEventListener("keydown", (keyEvent) => {
            if (keyEvent.key === "Escape") {
              keyEvent.preventDefault()
              render()
            }
          })
        })

        root.querySelectorAll(".golarion-calendar-day[data-day]").forEach((button) => {
          button.addEventListener("click", () => {
            selectedDay = Number(button.dataset.day)
            saveView()
            render()
          })
        })

        root.querySelectorAll("[data-action]").forEach((button) => {
          button.addEventListener("click", () => {
            const action = button.dataset.action
            if (action === "prev-month") {
              month -= 1
              if (month < 0) {
                month = 11
                year = clampYear(year - 1)
              }
              selectedDay = 1
            } else if (action === "next-month") {
              month += 1
              if (month > 11) {
                month = 0
                year = clampYear(year + 1)
              }
              selectedDay = 1
            } else if (action === "prev-year") {
              year = clampYear(year - 1)
              selectedDay = Math.min(selectedDay, monthLength(year, month))
            } else if (action === "next-year") {
              year = clampYear(year + 1)
              selectedDay = Math.min(selectedDay, monthLength(year, month))
            } else if (action === "today") {
              jumpToFocus()
            }
            saveView()
            render()
          })
        })
        renderDetails()
      }

      render()
    } catch (error) {
      console.error("Failed to load Calendar of Golarion", error)
      root.innerHTML =
        '<p class="golarion-calendar-error">The calendar data could not be loaded.</p>'
    }
  }

  const installToday = async () => {
    const root = document.querySelector("#golarion-today")
    if (!root || root.dataset.initialized === "true") return
    root.dataset.initialized = "true"

    try {
      const data = await loadCalendarData()
      const today = golarionToday(data)
      const holidays = (data.holidays ?? [])
        .filter((event) => event.month === today.month && event.day === today.day)
        .sort((a, b) => a.name.localeCompare(b.name))

      const grouped = new Map()
      for (const event of data.events ?? []) {
        if (event.year > today.year || event.month !== today.month || event.day !== today.day)
          continue
        const originalYear = event.rangeStart?.year ?? event.year
        const key = `${originalYear}|${event.name.trim().toLocaleLowerCase()}`
        const existing = grouped.get(key)
        if (existing) {
          if (event.source && !existing.sources.some((source) => source.slug === event.source)) {
            existing.sources.push({
              slug: event.source,
              campaign: event.campaign,
              kind: event.kind,
            })
          }
          continue
        }
        grouped.set(key, {
          ...event,
          yearsAgo: today.year - originalYear,
          sources: event.source
            ? [{ slug: event.source, campaign: event.campaign, kind: event.kind }]
            : [],
        })
      }
      const anniversaries = [...grouped.values()].sort(
        (a, b) => (b.rangeStart?.year ?? b.year) - (a.rangeStart?.year ?? a.year) || a.name.localeCompare(b.name),
      )

      const monthlyHistory = (data.events ?? [])
        .filter(
          (event) =>
            event.kind === "historical" &&
            event.datePrecision === "month" &&
            event.year <= today.year &&
            event.month === today.month,
        )
        .map((event) => ({
          ...event,
          yearsAgo: today.year - event.year,
          sources: event.source
            ? [{ slug: event.source, campaign: event.campaign, kind: event.kind }]
            : [],
        }))
        .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name))

      const yearlyHistory = (data.events ?? [])
        .filter((event) => {
          if (event.kind !== "historical" || event.datePrecision !== "year") return false
          const yearsAgo = today.year - event.year
          return yearsAgo >= 100 && yearsAgo % 100 === 0
        })
        .map((event) => ({
          ...event,
          yearsAgo: today.year - event.year,
        }))

      const yearlyHistoryDeck = [...yearlyHistory]
      for (let i = yearlyHistoryDeck.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[yearlyHistoryDeck[i], yearlyHistoryDeck[j]] = [yearlyHistoryDeck[j], yearlyHistoryDeck[i]]
      }
      let yearlyHistoryIndex = 0

      const sourceLinks = (event) =>
        event.sources
          .map((source, index) => {
            const label =
              source.campaign ||
              (source.kind === "historical"
                ? "Time.Graphics"
                : index === 0
                  ? "Source"
                  : `Source ${index + 1}`)
            const external = /^https?:\/\//i.test(source.slug)
            return `<a href="${sourceHref(source.slug)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(label)}</a>`
          })
          .join(" · ")

      const monthlySourceLink = (event) =>
        `<a href="${pathfinderWikiHref(event.name)}" target="_blank" rel="noopener noreferrer">PathfinderWiki</a>`

      const yearlySourceLink = (event) =>
        `<a href="${pathfinderWikiHref(event.name)}" target="_blank" rel="noopener noreferrer">PathfinderWiki</a>`

      const holidayMarkup = holidays.length
        ? `<ul class="golarion-today-list">${holidays
            .map(
              (event) => `
            <li class="is-holiday">
              <strong>${escapeHtml(event.name)}</strong>
              <span>Golarion holiday</span>
              ${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}
            </li>`,
            )
            .join("")}</ul>`
        : '<p class="golarion-today-empty">No fixed-date holidays are recorded today.</p>'

      const anniversaryMarkup = anniversaries.length
        ? `<ul class="golarion-today-list">${anniversaries
            .map((event) => {
              const dateLabel =
                formatEventRange(event, data.months) ||
                `${data.months[event.month]} ${event.day}, ${event.year} AR`
              return `
            <li class="is-anniversary">
              <strong>${escapeHtml(event.name)}</strong>
              <span>${event.yearsAgo === 0 ? "Today" : `${event.yearsAgo} ${event.yearsAgo === 1 ? "year" : "years"} ago`} · ${escapeHtml(dateLabel)}</span>
              ${event.sources.length ? `<p class="golarion-today-sources">${sourceLinks(event)}</p>` : ""}
            </li>`
            })
            .join("")}</ul>`
        : '<p class="golarion-today-empty">No anniversaries are recorded today.</p>'

      const monthlyHistoryMarkup = monthlyHistory.length
        ? `<ul class="golarion-today-list">${monthlyHistory
            .map(
              (event) => `
            <li class="is-anniversary">
              <strong>${escapeHtml(event.name)}</strong>
              <span>${event.yearsAgo === 0 ? "This year" : `${event.yearsAgo} ${event.yearsAgo === 1 ? "year" : "years"} ago`} · ${escapeHtml(data.months[event.month])} ${event.year} AR</span>
              ${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}
              <p class="golarion-today-sources">${monthlySourceLink(event)}</p>
            </li>`,
            )
            .join("")}</ul>`
        : `<p class="golarion-today-empty">No month-level historical events are recorded for ${escapeHtml(data.months[today.month])}.</p>`

      const yearlyHistoryMarkup = () => {
        const event = yearlyHistoryDeck[yearlyHistoryIndex]
        if (!event) return ""
        return `
          <ul class="golarion-today-list">
            <li class="is-anniversary">
              <strong>${escapeHtml(event.name)}</strong>
              <span>${event.yearsAgo} years ago · ${event.year} AR</span>
              ${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}
              <p class="golarion-today-sources">${yearlySourceLink(event)}</p>
            </li>
          </ul>
          ${yearlyHistoryDeck.length > 1 ? `<button class="golarion-today-another" type="button">Show another</button>` : ""}
        `
      }

      const yearlyHistorySection = yearlyHistoryDeck.length
        ? `<div class="golarion-today-section">
            <h3>This Year in History</h3>
            <div class="golarion-today-yearly"></div>
          </div>`
        : ""

      root.innerHTML = `
        <section class="golarion-today-shell" aria-label="On This Date in History">
          <header class="golarion-today-heading">
            <span>On This Date in History</span>
            <h2>${escapeHtml(data.months[today.month])} ${today.day}, ${today.year} AR</h2>
          </header>
          <div class="golarion-today-section">
            <h3>Observances</h3>
            ${holidayMarkup}
          </div>
          <div class="golarion-today-section">
            <h3>On This Day</h3>
            ${anniversaryMarkup}
          </div>
          <div class="golarion-today-section">
            <h3>This Month in History</h3>
            ${monthlyHistoryMarkup}
          </div>
          ${yearlyHistorySection}
        </section>
      `

      const renderYearlyHistory = () => {
        const container = root.querySelector(".golarion-today-yearly")
        if (!container) return
        container.innerHTML = yearlyHistoryMarkup()
        container.querySelector(".golarion-today-another")?.addEventListener("click", () => {
          yearlyHistoryIndex = (yearlyHistoryIndex + 1) % yearlyHistoryDeck.length
          renderYearlyHistory()
        })
      }
      renderYearlyHistory()
    } catch (error) {
      console.error("Failed to load On This Date in History", error)
      root.innerHTML =
        '<p class="golarion-calendar-error">Today\'s Golarion events could not be loaded.</p>'
    }
  }

  const install = () => {
    installCalendar()
    installToday()
  }

  document.addEventListener("nav", install)
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", install, { once: true })
  else install()
})()