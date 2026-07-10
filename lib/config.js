import fs from "node:fs"
import path from "node:path"

export const SYNC_DIR = ".figma-sync"

// Design properties included in the design hash. Everything else on a node
// (ids, timestamps, plugin data, …) is ignored. Overridable via config.json.
export const DEFAULT_DESIGN_FIELDS = [
  "name",
  "type",
  "hidden",
  "x",
  "y",
  "width",
  "height",
  "fills",
  "strokes",
  "strokeWeight",
  "cornerRadius",
  "effects",
  "constraints",
  "layoutMode",
  "itemSpacing",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "paddingBottom",
  "style",
  "characters",
]

const DEFAULTS = {
  backend: "rest",
  srcDir: "src",
  designFields: DEFAULT_DESIGN_FIELDS,
}

export function loadConfig(root) {
  const file = path.join(root, SYNC_DIR, "config.json")
  if (!fs.existsSync(file)) return { ...DEFAULTS }
  return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file, "utf8")) }
}

export function syncPath(root, ...segments) {
  return path.join(root, SYNC_DIR, ...segments)
}
