import { joinSegments, pathToRoot } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const Header: QuartzComponent = ({ children, fileData }: QuartzComponentProps) => {
  const baseDir = pathToRoot(fileData.slug!)
  const mastheadPath = joinSegments(
    baseDir,
    "assets/images/lantern and ledger branding/wide_vintage_newspaper_masthead_style_illustration.png",
  )
  const compactPath = joinSegments(
    baseDir,
    "assets/images/lantern and ledger branding/lantern-and-ledger-compact.png",
  )

  return (
    <header class="lantern-ledger-site-header">
      <a class="lantern-ledger-masthead" href={baseDir} aria-label="The Lantern and Ledger home">
        <picture>
          <source media="(max-width: 800px)" srcSet={compactPath} />
          <img
            src={mastheadPath}
            alt="The Lantern and Ledger — Light for the Present. Record for the Future."
          />
        </picture>
      </a>
      <div class="lantern-ledger-archive-rule" aria-hidden="true">
        <span>THE LANTERN AND LEDGER · ARCHIVES</span>
      </div>
      {children.length > 0 && <div class="lantern-ledger-header-children">{children}</div>}
    </header>
  )
}

Header.css = `
:root {
  --isr-gold: #c58b2b !important;
  --isr-gold-soft: rgba(197, 139, 43, 0.14) !important;
  --isr-navy: #405c68 !important;
  --isr-burgundy: #685238 !important;
  --isr-paper: #eee1c3 !important;
  --isr-ink: #17140f !important;
  --isr-rule: rgba(104, 82, 56, 0.28) !important;
  --isr-shadow: 0 12px 32px rgba(72, 52, 28, 0.09) !important;
}

[saved-theme="dark"] {
  --isr-gold: #d6a64c !important;
  --isr-gold-soft: rgba(214, 166, 76, 0.14) !important;
  --isr-navy: #89a4ae !important;
  --isr-burgundy: #b9a27d !important;
  --isr-paper: #1b1915 !important;
  --isr-ink: #eee1c3 !important;
  --isr-rule: rgba(238, 225, 195, 0.2) !important;
  --isr-shadow: 0 12px 32px rgba(0, 0, 0, 0.24) !important;
}

/* The old shared cover is superseded by the Lantern and Ledger masthead. */
.global-page-cover {
  display: none !important;
}

.lantern-ledger-site-header {
  display: block;
  width: 100%;
  margin: 0 0 1.6rem;
}

.lantern-ledger-masthead {
  display: block;
  width: 100%;
  color: inherit;
  text-decoration: none;
}

.lantern-ledger-masthead picture,
.lantern-ledger-masthead img {
  display: block;
  width: 100%;
}

.lantern-ledger-masthead img {
  height: auto;
  max-height: 13rem;
  object-fit: contain;
  border: 1px solid var(--isr-rule);
  border-radius: 0.22rem;
  background: var(--light);
  box-shadow: 0 8px 24px rgba(54, 40, 24, 0.1);
}

.lantern-ledger-archive-rule {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin: 0.7rem 0 0;
  color: var(--darkgray);
  font-family: var(--bodyFont);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  white-space: nowrap;
}

.lantern-ledger-archive-rule::before,
.lantern-ledger-archive-rule::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--isr-rule);
}

.lantern-ledger-header-children {
  margin-top: 1rem;
}

/* Retire the old Gazetteer label wherever the page-title component appears. */
.page-title::after {
  content: "THE LANTERN AND LEDGER · ARCHIVES" !important;
  color: var(--tertiary) !important;
  font-family: var(--bodyFont) !important;
  font-size: 0.62rem !important;
  font-weight: 700 !important;
  letter-spacing: 0.18em !important;
}

@media (max-width: 800px) {
  .lantern-ledger-site-header {
    margin-bottom: 1.1rem;
  }

  .lantern-ledger-masthead img {
    width: min(100%, 22rem);
    max-height: 8rem;
    margin-inline: auto;
    border: 0;
    background: transparent;
    box-shadow: none;
    object-fit: contain;
  }

  .lantern-ledger-archive-rule {
    margin-top: 0.55rem;
    font-size: 0.6rem;
    letter-spacing: 0.12em;
  }
}

@media (max-width: 430px) {
  .lantern-ledger-archive-rule {
    gap: 0.45rem;
    font-size: 0.55rem;
    letter-spacing: 0.08em;
  }
}
`

Header.afterDOMLoaded = `
const setLanternLedgerFavicon = () => {
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1"
  const base = local ? "" : "/inner-sea-region"
  const href = base + "/assets/images/lantern%20and%20ledger%20branding/lantern-and-ledger-favicon.png"
  let icon = document.querySelector('link[rel~="icon"]')

  if (!icon) {
    icon = document.createElement("link")
    icon.setAttribute("rel", "icon")
    document.head.appendChild(icon)
  }

  icon.setAttribute("href", href)
}

document.addEventListener("nav", setLanternLedgerFavicon)
setLanternLedgerFavicon()
`

export default (() => Header) satisfies QuartzComponentConstructor
