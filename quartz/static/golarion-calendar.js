;(() => {
  const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const ANCHOR = { year: 4710, month: 1, day: 17, weekday: 3 }

  const siteBase = () =>
    location.pathname === "/inner-sea-region" || location.pathname.startsWith("/inner-sea-region/")
      ? "/inner-sea-region"
      : ""

  const isLeapYear = (year) => year % 8 === 0
  const monthLength = (year, month) => (month === 1 && isLeapYear(year) ? 29 : MONTH_LENGTHS[month])

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

  const sourceHref = (slug) => `${siteBase()}/${slug}`.replace(/\/+/g, "/")

  const golarionToday = (data) => {
    const realToday = new Date()
    const year = realToday.getFullYear() + (data.realWorldYearOffset ?? 2700)
    return {
      year,
      month: realToday.getMonth(),
      day: Math.min(realToday.getDate(), monthLength(year, realToday.getMonth())),
    }
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
      let year = Number.isInteger(stored?.year) ? stored.year : allToday.year
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
        year = target.year
        month = target.month
        selectedDay = target.day
      }

      if (filter !== "all" && !campaignForFilter()) filter = "all"
      if (!stored) jumpToFocus()

      const renderDetails = () => {
        const details = root.querySelector(".golarion-calendar-details")
        if (!details) return
        const events = eventsForDate(year, month, selectedDay)
        details.innerHTML = `
          <h3>${escapeHtml(months[month])} ${selectedDay}, ${year} AR</h3>
          ${
            events.length
              ? `<ul>${events
                  .map((event) => {
                    const label =
                      event.kind === "holiday"
                        ? "Golarion Holiday"
                        : event.campaign || event.category
                    const title = event.source
                      ? `<a href="${sourceHref(event.source)}">${escapeHtml(event.name)}</a>`
                      : `<strong>${escapeHtml(event.name)}</strong>`
                    return `<li class="${event.kind === "holiday" ? "is-holiday" : "is-campaign-event"}">${title}<span>${escapeHtml(label)}</span>${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}</li>`
                  })
                  .join("")}</ul>`
              : "<p>No recorded events on this date.</p>"
          }
        `
      }

      const render = () => {
        const focus = focusDate()
        const firstWeekday = weekdayFor(year, month, 1)
        const days = monthLength(year, month)
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

        root.innerHTML = `
          <section class="golarion-calendar-shell" aria-label="Golarion Calendar">
            <div class="golarion-calendar-filterbar">
              <label for="golarion-campaign-filter">Campaign</label>
              <select id="golarion-campaign-filter">
                <option value="all"${filter === "all" ? " selected" : ""}>All</option>
                ${campaignOptions}
              </select>
              <span class="golarion-calendar-filter-note">Holidays are always shown.</span>
            </div>
            <div class="golarion-calendar-toolbar">
              <button type="button" data-action="prev-year" aria-label="Previous year">«</button>
              <button type="button" data-action="prev-month" aria-label="Previous month">‹</button>
              <div class="golarion-calendar-heading"><strong>${escapeHtml(months[month])}</strong><span>${year} AR</span></div>
              <button type="button" data-action="next-month" aria-label="Next month">›</button>
              <button type="button" data-action="next-year" aria-label="Next year">»</button>
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
                year -= 1
              }
              selectedDay = 1
            } else if (action === "next-month") {
              month += 1
              if (month > 11) {
                month = 0
                year += 1
              }
              selectedDay = 1
            } else if (action === "prev-year") {
              year -= 1
              selectedDay = 1
            } else if (action === "next-year") {
              year += 1
              selectedDay = 1
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
        const key = `${event.year}|${event.name.trim().toLocaleLowerCase()}`
        const existing = grouped.get(key)
        if (existing) {
          if (event.source && !existing.sources.some((source) => source.slug === event.source)) {
            existing.sources.push({ slug: event.source, campaign: event.campaign })
          }
          continue
        }
        grouped.set(key, {
          ...event,
          yearsAgo: today.year - event.year,
          sources: event.source ? [{ slug: event.source, campaign: event.campaign }] : [],
        })
      }
      const anniversaries = [...grouped.values()].sort(
        (a, b) => a.year - b.year || a.name.localeCompare(b.name),
      )

      const sourceLinks = (event) =>
        event.sources
          .map((source, index) => {
            const label = source.campaign || (index === 0 ? "Source" : `Source ${index + 1}`)
            return `<a href="${sourceHref(source.slug)}">${escapeHtml(label)}</a>`
          })
          .join(" · ")

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
            .map(
              (event) => `
            <li class="is-anniversary">
              <strong>${escapeHtml(event.name)}</strong>
              <span>${event.yearsAgo === 0 ? "Today" : `${event.yearsAgo} ${event.yearsAgo === 1 ? "year" : "years"} ago`} · ${escapeHtml(data.months[event.month])} ${event.day}, ${event.year} AR</span>
              ${event.sources.length ? `<p class="golarion-today-sources">${sourceLinks(event)}</p>` : ""}
            </li>`,
            )
            .join("")}</ul>`
        : '<p class="golarion-today-empty">No anniversaries are recorded today.</p>'

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
        </section>
      `
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
