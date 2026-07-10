import fs from "node:fs"
import path from "node:path"

// Mapping provider: metadata comments.
//
// A generated file declares its Figma origin with a single comment line:
//
//   // figma-sync: file=dSRhp9PHg4w9Gnco2R19dg node=2267:1644 name=StatusCard
//
// Other providers (manifest-only, Code Connect, exported metadata objects)
// would implement the same contract: discover() → [{ filePath, fileKey, nodeId,
// componentName }].

const ANNOTATION = /figma-sync:\s*file=(\S+)\s+node=(\d+:\d+)(?:\s+name=(\S+))?/

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte"])

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) yield full
  }
}

export function discoverMappings(root, srcDir) {
  const base = path.join(root, srcDir)
  if (!fs.existsSync(base)) return []
  const mappings = []
  for (const file of walk(base)) {
    const match = fs.readFileSync(file, "utf8").match(ANNOTATION)
    if (!match) continue
    const filePath = path.relative(root, file).split(path.sep).join("/")
    mappings.push({
      filePath,
      fileKey: match[1],
      nodeId: match[2],
      componentName: match[3] ?? path.basename(file, path.extname(file)),
    })
  }
  return mappings.sort((a, b) => a.filePath.localeCompare(b.filePath))
}
