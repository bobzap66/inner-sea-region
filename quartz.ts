import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import { Explorer } from "@quartz-community/explorer"

const dossierOrder = [
  "Morlibint's Dossier",
  "Morlibint's Dossier: On Sources and Reliability",
  "Morlibint's Dossier: Otari Folklore",
  "Morlibint's Dossier: Corrective Annotation",
  "Morlibint's Dossier: The Roseguard",
  "Morlibint's Dossier: The Haruvex Lineage",
  "Morlibint's Dossier: Gauntlight and the Abomination Vaults",
  "Morlibint's Dossier: On the So-Called Cult of the Canker",
  "Morlibint's Dossier: On the Training Grounds",
  "Morlibint's Dossier: On the Fleshwarping Laboratories",
  "Morlibint's Dossier: On the Prison Level and Infernal Presence",
  "Morlibint's Dossier: Servants and Survivors",
  "Morlibint's Dossier: Wisps, Fog, and Dreams",
  "Morlibint's Dossier: The Farm",
  "Morlibint's Dossier: The Children of Belcorra",
  "Morlibint's Dossier: The Whispering Caverns",
  "Morlibint's Dossier: The Cult of Urthagul",
  "Morlibint's Dossier: The Drow in the Farm",
  "Morlibint's Dossier: The Farm Redux",
  "Morlibint's Dossier: Final Assessment",
  "Morlibint's Dossier: On Wrin Sivinxi and the Question of Lenses",
  "Morlibint's Dossier: Nhimbaloth, the Empty Death",
  "Morlibint's Dossier: The Whispering Reeds",
  "Morlibint's Dossier: Closing Remarks",
]

const normalizeTitle = (value: string | undefined) =>
  (value ?? "").replace(/[‘’]/g, "'").trim()

const dossierRank = new Map(dossierOrder.map((title, index) => [title, index]))

Explorer({
  sortFn: (a, b) => {
    const aTitle = normalizeTitle(a.displayName)
    const bTitle = normalizeTitle(b.displayName)
    const aRank = dossierRank.get(aTitle)
    const bRank = dossierRank.get(bTitle)

    if (aRank !== undefined || bRank !== undefined) {
      if (aRank !== undefined && bRank !== undefined) return aRank - bRank
      return aRank !== undefined ? -1 : 1
    }

    if ((!a.isFolder && !b.isFolder) || (a.isFolder && b.isFolder)) {
      return aTitle.localeCompare(bTitle, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    }

    return a.isFolder ? -1 : 1
  },
})

const config = await loadQuartzConfig()
export default config
export const layout = await loadQuartzLayout()
