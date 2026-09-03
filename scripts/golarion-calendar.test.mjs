import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import vm from "node:vm"

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
    ],
  }

  const context = {
    console,
    Date: FixedDate,
    location: { pathname: "/inner-sea-region/on-this-date-in-history" },
    fetch: async () => ({ ok: true, json: async () => data }),
    document: {
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
  assert.doesNotMatch(root.innerHTML, /A Future Event/)
  assert.equal((root.innerHTML.match(/<strong>A Historic Event<\/strong>/g) ?? []).length, 1)
})
