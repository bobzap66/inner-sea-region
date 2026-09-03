import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import * as ExternalPlugin from "./.quartz/plugins"

const morlibintDossierOrder = [
  "On Sources and Reliability",
  "Otari Folklore",
  "Corrective Annotation",
  "The Roseguard",
  "The Haruvex Lineage",
  "Gauntlight and the Abomination Vaults",
  "On the So-Called Cult of the Canker",
  "On the Training Grounds",
  "On the Fleshwarping Laboratories",
  "On the Prison Level and Infernal Presence",
  "Servants and Survivors",
  "Wisps, Fog, and Dreams",
  "The Farm",
  "The Children of Belcorra",
  "The Whispering Caverns",
  "The Cult of Urthagul",
  "The Drow in the Farm",
  "The Farm Redux",
  "Final Assessment",
  "On Wrin Sivinxi and the Question of Lenses",
  "Nhimbaloth, the Empty Death",
  "The Whispering Reeds",
  "Closing Remarks",
]

const dossierRank = (displayName: string) => {
  const normalized = displayName.replace(/^Morlib(?:int|eint)[’']s Dossier:\s*/, "")
  const index = morlibintDossierOrder.indexOf(normalized)
  return index === -1 ? undefined : index
}

ExternalPlugin.Explorer({
  sortFn: (a, b) => {
    const aRank = dossierRank(a.displayName)
    const bRank = dossierRank(b.displayName)

    if (aRank !== undefined && bRank !== undefined) {
      return aRank - bRank
    }

    if ((!a.isFolder && !b.isFolder) || (a.isFolder && b.isFolder)) {
      return a.displayName.localeCompare(b.displayName, undefined, {
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
