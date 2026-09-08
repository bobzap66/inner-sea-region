import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import vm from "node:vm"
import { simplifySlug, slugifyFilePath } from "@quartz-community/utils"

test("Quartz source slugs preserve separate filename separators", () => {
  const slug = simplifySlug(
    slugifyFilePath("Campaigns/Kingmaker/Session Reports 21-40/Session 29- Aftermath.md"),
  )
  assert.equal(slug, "campaigns/kingmaker/session-reports-21-40/session-29--aftermath")
})

test("On This Date in History renders holidays and deduplicated anniversaries", async () => {
  const root = { dataset: {}, innerHTML: "" }
  const source = await readFile(
    new URL("../quartz/static/golarion-calendar.js", import.meta.url),
    "utf8",
  )

  class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : ["2026-09-03T12:00:00Z"]))
    }
  }

  const data = {
    realWorldYearOffset: 2700,
    months: [
      "Abadius",
      "Calistril",
      "Pharast",
      "Gozran",
      "Desnus",
      "Sarenith",
      "Erastus",
      "Arodus",
      "Rova",
      "Lamashan",
      "Neth",
      "Kuthona",
    ],
    holidays: [
      { name: "Test Feast", description: "A fixed observance.", month: 8, day: 3, kind: "holiday" },
    ],
    events: [
      {
        name: "A Historic Event",
        year: 4721,
        month: 8,
        day: 3,
        source: "first-source",
        campaign: "First Campaign",
      },
      {
        name: "A Historic Event",
        year: 4721,
        month: 8,
        day: 3,
        source: "second-source",
        campaign: "First Campaign",
      },
      {
        name: "A Future Event",
        year: 4727,
        month: 8,
        day: 3,
        source: "future-source",
        campaign: "First Campaign",
      },
      {
        name: "A More Recent Historic Event",
        year: 4724,
        month: 8,
        day: 3,
        source: "recent-source",
        campaign: "First Campaign",
      },
      {
        name: "A Month-Level Historic Event",
        year: 4700,
        month: 8,
        datePrecision: "month",
        kind: "historical",
        description: "The source identifies Rova, but not a specific day.",
        source: "https://example.com/month-source",
      },
      {
        name: "A More Recent Month-Level Event",
        year: 4710,
        month: 8,
        datePrecision: "month",
        kind: "historical",
      },
      {
        name: "A Future Month-Level Event",
        year: 4727,
        month: 8,
        datePrecision: "month",
        kind: "historical",
      },
    ],
  }

  const context = {
    console,
    Date: FixedDate,
    location: { pathname: "/inner-sea-region/on-this-date-in-history" },
    fetch: async () => ({ ok: true, json: async () => data }),
    document: {
      body: { dataset: { basepath: "/inner-sea-region" } },
      scripts: [],
      readyState: "complete",
      addEventListener() {},
      querySelector(selector) {
        return selector === "#golarion-today" ? root : null
      },
    },
  }

  vm.runInNewContext(source, context)
  await new Promise((resolve) => setImmediate(resolve))

  assert.match(root.innerHTML, /Rova 3, 4726 AR/)
  assert.match(root.innerHTML, /On This Date in History/)
  assert.match(root.innerHTML, /Test Feast/)
  assert.match(root.innerHTML, /A Historic Event/)
  assert.match(root.innerHTML, /5 years ago/)
  assert.match(root.innerHTML, /first-source/)
  assert.match(root.innerHTML, /second-source/)
  assert.match(root.innerHTML, /href="\/inner-sea-region\/first-source"/)
  assert.ok(
    root.innerHTML.indexOf("A More Recent Historic Event") <
      root.innerHTML.indexOf("A Historic Event"),
  )
  assert.match(root.innerHTML, /This Month in History/)
  assert.match(root.innerHTML, /A Month-Level Historic Event/)
  assert.match(root.innerHTML, /A More Recent Month-Level Event/)
  assert.match(root.innerHTML, /26 years ago · Rova 4700 AR/)
  assert.doesNotMatch(root.innerHTML, /month-source/)
  assert.match(root.innerHTML, /pathfinderwiki\.com\/wiki\/Special:Search/)
  assert.ok(
    root.innerHTML.indexOf("A More Recent Month-Level Event") <
      root.innerHTML.indexOf("A Month-Level Historic Event"),
  )
  assert.doesNotMatch(root.innerHTML, /A Future Event/)
  assert.doesNotMatch(root.innerHTML, /A Future Month-Level Event/)
  assert.equal((root.innerHTML.match(/<strong>A Historic Event<\/strong>/g) ?? []).length, 1)
})

test("Calendar details render matching month-only and year-only history", async () => {
  const details = { innerHTML: "" }
  const root = {
    dataset: {},
    innerHTML: "",
    querySelector(selector) {
      if (selector === ".golarion-calendar-details") return details
      return null
    },
    querySelectorAll() {
      return []
    },
  }
  const source = await readFile(
    new URL("../quartz/static/golarion-calendar.js", import.meta.url),
    "utf8",
  )
  const data = {
    realWorldYearOffset: 2700,
    months: [
      "Abadius",
      "Calistril",
      "Pharast",
      "Gozran",
      "Desnus",
      "Sarenith",
      "Erastus",
      "Arodus",
      "Rova",
      "Lamashan",
      "Neth",
      "Kuthona",
    ],
    weekdays: ["Moonday", "Toilday", "Wealday", "Oathday", "Fireday", "Starday", "Sunday"],
    campaigns: [],
    holidays: [],
    events: [
      {
        name: "Rova Event",
        year: 4726,
        month: 8,
        datePrecision: "month",
        kind: "historical",
      },
      { name: "Year Event", year: 4726, datePrecision: "year", kind: "historical" },
      {
        name: "Wrong Month",
        year: 4726,
        month: 7,
        datePrecision: "month",
        kind: "historical",
      },
      { name: "Wrong Year", year: 4725, datePrecision: "year", kind: "historical" },
    ],
  }
  class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : ["2026-09-06T12:00:00Z"]))
    }
  }
  const context = {
    console,
    Date: FixedDate,
    location: { pathname: "/inner-sea-region/calendar" },
    localStorage: { getItem: () => null, setItem() {} },
    fetch: async () => ({ ok: true, json: async () => data }),
    document: {
      body: { dataset: { basepath: "/inner-sea-region" } },
      scripts: [],
      readyState: "complete",
      addEventListener() {},
      querySelector(selector) {
        return selector === "#golarion-calendar" ? root : null
      },
    },
  }

  vm.runInNewContext(source, context)
  await new Promise((resolve) => setImmediate(resolve))

  assert.match(details.innerHTML, /This Month/)
  assert.match(details.innerHTML, /Rova Event/)
  assert.match(details.innerHTML, /Rova 4726 AR/)
  assert.match(details.innerHTML, /This Year/)
  assert.match(details.innerHTML, /Year Event/)
  assert.doesNotMatch(details.innerHTML, /Wrong Month/)
  assert.doesNotMatch(details.innerHTML, /Wrong Year/)
})
