(() => {
  const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const DEFAULT_DATE = { year: 4716, month: 0, day: 20 }
  const ANCHOR = { year: 4710, month: 1, day: 17, weekday: 3 }

  const siteBase = () =>
    location.pathname === "/inner-sea-region" || location.pathname.startsWith("/inner-sea-region/")
      ? "/inner-sea-region"
      : ""

  const isLeapYear = (year) => year % 8 === 0

  const monthLength = (year, month) =>
    month === 1 && isLeapYear(year) ? 29 : MONTH_LENGTHS[month]

  const serialDay = (year, month, day) => {
    let total = (year - 1) * 365 + Math.floor((year - 1) / 8)
    for (let m = 0; m < month; m += 1) total += monthLength(year, m)
    return total + day - 1
  }

  const anchorSerial = serialDay(ANCHOR.year, ANCHOR.month, ANCHOR.day)
  const weekdayOffset = ((ANCHOR.weekday - (anchorSerial % 7)) % 7 + 7) % 7
  const weekdayFor = (year, month, day) => ((serialDay(year, month, day) + weekdayOffset) % 7 + 7) % 7

  const escapeHtml = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;")

  const sourceHref = (slug) => `${siteBase()}/${slug}`.replace(/\/+/g, "/")

  const eventKey = (event) => `${event.year}-${event.month}-${event.day}`

  const installCalendar = async () => {
    const root = document.querySelector("#golarion-calendar")
    if (!root || root.dataset.initialized === "true") return
    root.dataset.initialized = "true"

    try {
      const response = await fetch(`${siteBase()}/static/golarion-events.json`, { cache: "no-cache" })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      const months = data.months
      const weekdays = data.weekdays
      const byDate = new Map()
      for (const event of data.events ?? []) {
        const key = eventKey(event)
        if (!byDate.has(key)) byDate.set(key, [])
        byDate.get(key).push(event)
      }

      let stored = null
      try {
        stored = JSON.parse(localStorage.getItem("isr-golarion-calendar-view") || "null")
      } catch (_) {}

      let year = Number.isInteger(stored?.year) ? stored.year : data.defaultDate?.year ?? DEFAULT_DATE.year
      let month = Number.isInteger(stored?.month) ? stored.month : data.defaultDate?.month ?? DEFAULT_DATE.month
      let selectedDay = data.defaultDate?.day ?? DEFAULT_DATE.day

      const saveView = () => {
        try {
          localStorage.setItem("isr-golarion-calendar-view", JSON.stringify({ year, month }))
        } catch (_) {}
      }

      const renderDetails = () => {
        const details = root.querySelector(".golarion-calendar-details")
        if (!details) return
        const events = byDate.get(`${year}-${month}-${selectedDay}`) ?? []
        details.innerHTML = `
          <h3>${escapeHtml(months[month])} ${selectedDay}, ${year} AR</h3>
          ${
            events.length
              ? `<ul>${events
                  .map(
                    (event) => `<li><a href="${sourceHref(event.source)}">${escapeHtml(event.name)}</a><span>${escapeHtml(event.category)}</span></li>`,
                  )
                  .join("")}</ul>`
              : "<p>No recorded events on this date.</p>"
          }
        `
      }

      const render = () => {
        const firstWeekday = weekdayFor(year, month, 1)
        const days = monthLength(year, month)
        const cells = []
        for (let i = 0; i < firstWeekday; i += 1) cells.push('<div class="golarion-calendar-day is-empty" aria-hidden="true"></div>')
        for (let day = 1; day <= days; day += 1) {
          const events = byDate.get(`${year}-${month}-${day}`) ?? []
          const isCurrent = year === DEFAULT_DATE.year && month === DEFAULT_DATE.month && day === DEFAULT_DATE.day
          const isSelected = day === selectedDay
          cells.push(`
            <button class="golarion-calendar-day${events.length ? " has-events" : ""}${isCurrent ? " is-current" : ""}${isSelected ? " is-selected" : ""}" data-day="${day}" type="button">
              <span class="golarion-calendar-day-number">${day}</span>
              ${events.length ? `<span class="golarion-calendar-event-count">${events.length}</span>` : ""}
              <span class="golarion-calendar-day-events">
                ${events.slice(0, 2).map((event) => `<span>${escapeHtml(event.name)}</span>`).join("")}
                ${events.length > 2 ? `<span>+${events.length - 2} more</span>` : ""}
              </span>
            </button>
          `)
        }

        root.innerHTML = `
          <section class="golarion-calendar-shell" aria-label="Calendar of Golarion">
            <div class="golarion-calendar-toolbar">
              <button type="button" data-action="prev-year" aria-label="Previous year">«</button>
              <button type="button" data-action="prev-month" aria-label="Previous month">‹</button>
              <div class="golarion-calendar-heading">
                <strong>${escapeHtml(months[month])}</strong>
                <span>${year} AR</span>
              </div>
              <button type="button" data-action="next-month" aria-label="Next month">›</button>
              <button type="button" data-action="next-year" aria-label="Next year">»</button>
              <button class="golarion-calendar-today" type="button" data-action="today">Current campaign date</button>
            </div>
            <div class="golarion-calendar-weekdays">
              ${weekdays.map((day) => `<span>${escapeHtml(day.slice(0, 3))}</span>`).join("")}
            </div>
            <div class="golarion-calendar-grid">${cells.join("")}</div>
            <div class="golarion-calendar-details" aria-live="polite"></div>
          </section>
        `

        root.querySelectorAll(".golarion-calendar-day[data-day]").forEach((button) => {
          button.addEventListener("click", () => {
            selectedDay = Number(button.dataset.day)
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
              year = data.defaultDate?.year ?? DEFAULT_DATE.year
              month = data.defaultDate?.month ?? DEFAULT_DATE.month
              selectedDay = data.defaultDate?.day ?? DEFAULT_DATE.day
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
      root.innerHTML = '<p class="golarion-calendar-error">The calendar data could not be loaded.</p>'
    }
  }

  document.addEventListener("nav", installCalendar)
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installCalendar, { once: true })
  else installCalendar()
})()
