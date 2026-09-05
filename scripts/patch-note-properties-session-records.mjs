import { promises as fs } from "node:fs"
import path from "node:path"

const pluginsRoot = path.resolve(".quartz/plugins")

async function findFiles(dir, basename, matches = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await findFiles(fullPath, basename, matches)
    } else if (entry.name === basename) {
      matches.push(fullPath)
    }
  }
  return matches
}

const componentMatches = await findFiles(pluginsRoot, "NoteProperties.tsx")
if (componentMatches.length !== 1) {
  throw new Error(`Expected exactly one NoteProperties.tsx, found ${componentMatches.length}`)
}

const componentPath = componentMatches[0]
let component = await fs.readFile(componentPath, "utf8")
const rowOriginal = '<tr key={key} class="note-properties-row metadata-property">'
const rowPatched = '<tr key={key} class="note-properties-row metadata-property" data-property-key={key}>'

if (!component.includes(rowPatched)) {
  if (!component.includes(rowOriginal)) {
    throw new Error("Could not find the Note Properties row markup to patch")
  }
  component = component.replace(rowOriginal, rowPatched)
  await fs.writeFile(componentPath, component)
}

const styleMatches = await findFiles(path.dirname(componentPath), "noteProperties.scss")
if (styleMatches.length !== 1) {
  throw new Error(`Expected exactly one noteProperties.scss near the component, found ${styleMatches.length}`)
}

const stylePath = styleMatches[0]
let styles = await fs.readFile(stylePath, "utf8")
const marker = "/* Inner Sea Region: stack multiple session records */"

if (!styles.includes(marker)) {
  styles += `\n\n${marker}\n.note-properties-row[data-property-key="session records"] .note-properties-list {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-start;\n  gap: 0.2rem;\n}\n\n.note-properties-row[data-property-key="session records"] .note-properties-separator {\n  display: none;\n}\n`
  await fs.writeFile(stylePath, styles)
}

console.log("Patched Note Properties so multiple session records render on separate lines.")
