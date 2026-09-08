import { execFileSync } from "node:child_process"

const contentDir = process.argv[2] ?? "content"

function run(args) {
  return execFileSync("git", ["-C", contentDir, ...args], { encoding: "utf8" })
}

const diff = run(["diff", "--unified=0", "--", "*.md"])
const lines = diff.split(/\r?\n/)
let currentFile = null
const entries = []

for (const line of lines) {
  if (line.startsWith("+++ b/")) {
    currentFile = line.slice(6)
    continue
  }
  if (!currentFile) continue
  if (!(line.startsWith("-") || line.startsWith("+"))) continue
  if (line.startsWith("---") || line.startsWith("+++")) continue
  if (!line.includes("[[") && !/\]\(/.test(line)) continue
  entries.push({ file: currentFile, sign: line[0], text: line.slice(1) })
}

const byFile = new Map()
for (const entry of entries) {
  if (!byFile.has(entry.file)) byFile.set(entry.file, [])
  byFile.get(entry.file).push(entry)
}

console.log(`Files with normalized link-line changes: ${byFile.size}`)
console.log(`Changed link lines: ${entries.length}`)

for (const [file, fileEntries] of byFile) {
  console.log(`\n### ${file}`)
  for (const entry of fileEntries) {
    console.log(`${entry.sign} ${entry.text}`)
  }
}
