import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "for", "in", "of", "on", "or", "the", "to"])

function campaignFromSlug(slug: string | undefined) {
  if (!slug) return null

  const directMatch = /^campaigns\/([^/]+)(?:\/|$)/i.exec(slug)
  if (!directMatch) return null

  const first = directMatch[1]?.toLowerCase()
  let key: string | undefined

  if (first === "archived") {
    key = /^campaigns\/archived\/([^/]+)(?:\/|$)/i.exec(slug)?.[1]
  } else {
    key = directMatch[1]
  }

  const normalizedKey = key?.toLowerCase()
  if (
    !normalizedKey ||
    normalizedKey === "campaigns" ||
    normalizedKey === "archived" ||
    normalizedKey === "index"
  ) {
    return null
  }

  const words = decodeURIComponent(key!)
    .split("-")
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLowerCase()
      if (index > 0 && SMALL_WORDS.has(lower)) return lower
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })

  return { key: normalizedKey, name: words.join(" ") }
}

export const CampaignSpoilerGate: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const campaign = campaignFromSlug(fileData.slug)
  if (!campaign) return null

  return (
    <>
      <div
        class="campaign-spoiler-gate"
        data-campaign-key={campaign.key}
        data-campaign-name={campaign.name}
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-spoiler-title"
      >
        <div class="campaign-spoiler-gate-card">
          <p class="campaign-spoiler-eyebrow">Campaign Spoiler Warning</p>
          <h1 id="campaign-spoiler-title">Warning: Spoilers for {campaign.name}</h1>
          <p>
            This section contains spoilers for the {campaign.name} campaign. Continue only if you
            are a player in this campaign and want access to its archive.
          </p>
          <div class="campaign-spoiler-actions">
            <button type="button" data-spoiler-action="back">Go Back</button>
            <button class="is-primary" type="button" data-spoiler-action="opt-in">
              Player in the {campaign.name} Campaign
            </button>
          </div>
        </div>
      </div>
      <button
        class="campaign-spoiler-reset"
        type="button"
        data-campaign-key={campaign.key}
        data-campaign-name={campaign.name}
        data-spoiler-action="reset"
        hidden
      >
        Hide {campaign.name} spoilers again
      </button>
    </>
  )
}

CampaignSpoilerGate.css = `
html.campaign-spoiler-locked {
  overflow: hidden;
}

.campaign-spoiler-gate {
  position: fixed;
  inset: 0;
  z-index: 100000;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  padding: 1.5rem;
  background: var(--light);
  color: var(--dark);
  visibility: visible;
  pointer-events: auto;
}

.campaign-spoiler-gate[hidden] {
  display: none !important;
}

.campaign-spoiler-gate-card {
  width: min(100%, 42rem);
  box-sizing: border-box;
  padding: clamp(1.5rem, 5vw, 3rem);
  border: 1px solid var(--tertiary);
  border-radius: 0.35rem;
  background: var(--light);
  color: var(--dark);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.22);
  text-align: center;
}

.campaign-spoiler-eyebrow {
  margin: 0 0 0.65rem;
  color: var(--tertiary);
  font-family: var(--bodyFont);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.campaign-spoiler-gate-card h1 {
  margin: 0 0 1rem;
  font-size: clamp(1.55rem, 5vw, 2.45rem);
}

.campaign-spoiler-gate-card p:not(.campaign-spoiler-eyebrow) {
  max-width: 34rem;
  margin: 0 auto;
  line-height: 1.65;
}

.campaign-spoiler-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1.6rem;
}

.campaign-spoiler-actions button,
.campaign-spoiler-reset {
  appearance: none;
  border: 1px solid var(--gray);
  border-radius: 0.25rem;
  padding: 0.72rem 1rem;
  background: var(--lightgray);
  color: var(--dark);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.campaign-spoiler-actions button.is-primary {
  border-color: var(--tertiary);
  background: var(--tertiary);
  color: var(--light);
}

.campaign-spoiler-actions button:hover,
.campaign-spoiler-actions button:focus-visible,
.campaign-spoiler-reset:hover,
.campaign-spoiler-reset:focus-visible {
  filter: brightness(0.96);
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.campaign-spoiler-reset {
  display: block;
  width: fit-content;
  margin: -0.8rem 0 1.25rem auto;
  padding: 0.42rem 0.65rem;
  border-color: var(--lightgray);
  background: transparent;
  color: var(--darkgray);
  font-size: 0.72rem;
  font-weight: 600;
}

.campaign-spoiler-reset[hidden] {
  display: none !important;
}

@media (max-width: 600px) {
  .campaign-spoiler-actions {
    flex-direction: column;
  }

  .campaign-spoiler-actions button {
    width: 100%;
  }
}
`

CampaignSpoilerGate.afterDOMLoaded = `
const campaignSpoilerStorageKey = (key) => "isr-campaign-spoilers:" + key

const installCampaignSpoilerGate = () => {
  const gate = document.querySelector(".campaign-spoiler-gate[data-campaign-key]")
  const reset = document.querySelector(".campaign-spoiler-reset[data-campaign-key]")
  const body = document.querySelector("#quartz-body")

  if (!gate) {
    document.documentElement.classList.remove("campaign-spoiler-locked")
    return
  }

  const key = gate.dataset.campaignKey
  const name = gate.dataset.campaignName || key
  if (!key) return

  let optedIn = false
  try {
    optedIn = localStorage.getItem(campaignSpoilerStorageKey(key)) === "true"
  } catch (_) {}

  const applyState = (nextValue) => {
    optedIn = nextValue
    gate.hidden = optedIn
    if (reset) reset.hidden = !optedIn
    body?.classList.toggle("campaign-spoiler-pending", !optedIn)
    document.documentElement.classList.toggle("campaign-spoiler-locked", !optedIn)
    document.documentElement.classList.toggle("campaign-spoilers-visible", optedIn)
  }

  applyState(optedIn)

  gate.querySelector('[data-spoiler-action="back"]')?.addEventListener("click", () => {
    if (history.length > 1) {
      history.back()
      return
    }

    const base = (document.body?.dataset?.basepath || "").replace(/\/$/, "")
    location.href = base + "/campaigns"
  })

  gate.querySelector('[data-spoiler-action="opt-in"]')?.addEventListener("click", () => {
    try {
      localStorage.setItem(campaignSpoilerStorageKey(key), "true")
    } catch (_) {}

    applyState(true)
    document.dispatchEvent(
      new CustomEvent("isr:campaign-spoilers-changed", {
        detail: { campaign: key, name, enabled: true },
      }),
    )
  })

  reset?.addEventListener("click", () => {
    try {
      localStorage.removeItem(campaignSpoilerStorageKey(key))
    } catch (_) {}

    applyState(false)
    document.dispatchEvent(
      new CustomEvent("isr:campaign-spoilers-changed", {
        detail: { campaign: key, name, enabled: false },
      }),
    )
  })
}

document.addEventListener("nav", installCampaignSpoilerGate)
installCampaignSpoilerGate()
`

export default (() => CampaignSpoilerGate) satisfies QuartzComponentConstructor
