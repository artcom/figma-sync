import fs from "node:fs"
import path from "node:path"
import { syncPath } from "./config.js"

// Deep link to the node in the Figma editor (node-id uses '-' instead of ':').
export function figmaNodeUrl(fileKey, nodeId) {
  return `https://www.figma.com/design/${fileKey}/?node-id=${nodeId.replace(":", "-")}`
}

export function loadManifest(root) {
  const file = syncPath(root, "manifest.json")
  if (!fs.existsSync(file)) return {}
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

export function saveManifest(root, manifest) {
  const file = syncPath(root, "manifest.json")
  const sorted = Object.fromEntries(
    Object.keys(manifest)
      .sort()
      .map((key) => [key, manifest[key]]),
  )
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`)
}

// Baselines hold the canonicalized design document captured at
// update-manifest time, enabling structural diffs later (`figma-sync diff`).
export function baselinePath(root, mapping) {
  const safeNode = mapping.nodeId.replace(":", "-")
  return syncPath(root, "baselines", mapping.fileKey, `${safeNode}.json`)
}

export function saveBaseline(root, mapping, canonicalNode) {
  const file = baselinePath(root, mapping)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(canonicalNode, null, 2)}\n`)
}

export function loadBaseline(root, mapping) {
  const file = baselinePath(root, mapping)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, "utf8"))
}
