import fs from "node:fs"
import path from "node:path"
import { designHash, codeHash } from "./hash.js"

export const STATES = {
  SYNC: "SYNC",
  DESIGN_CHANGED: "DESIGN_CHANGED",
  CODE_CHANGED: "CODE_CHANGED",
  BOTH_CHANGED: "BOTH_CHANGED",
  NODE_DELETED: "NODE_DELETED",
  FILE_DELETED: "FILE_DELETED",
  UNMAPPED: "UNMAPPED",
  UNKNOWN: "UNKNOWN",
}

// Compute the drift state of every component known through the manifest or
// discovered via mapping annotations.
export async function computeStatus({ root, config, manifest, mappings, backend }) {
  const results = []
  const manifestFiles = new Set(Object.keys(manifest))

  for (const mapping of mappings) {
    if (!manifestFiles.has(mapping.filePath)) {
      results.push({
        filePath: mapping.filePath,
        componentName: mapping.componentName,
        state: STATES.UNMAPPED,
        detail: "annotated but not in manifest — run `figma-sync update-manifest`",
      })
    }
  }

  for (const [filePath, entry] of Object.entries(manifest)) {
    const result = {
      filePath,
      componentName: entry.componentName,
      fileKey: entry.fileKey,
      nodeId: entry.nodeId,
    }
    results.push(result)

    const absolute = path.join(root, filePath)
    if (!fs.existsSync(absolute)) {
      result.state = STATES.FILE_DELETED
      result.detail = "source file no longer exists"
      continue
    }

    let node
    try {
      node = await backend.getNode(entry.fileKey, entry.nodeId)
    } catch (error) {
      result.state = STATES.UNKNOWN
      result.detail = `backend '${backend.name}' failed: ${error.message}`
      continue
    }
    if (!node) {
      result.state = STATES.NODE_DELETED
      result.detail = `node ${entry.nodeId} not found via backend '${backend.name}'`
      continue
    }

    const designChanged = designHash(node, config.designFields) !== entry.designHash
    const currentCodeHash = codeHash(fs.readFileSync(absolute, "utf8"))
    const codeChanged = currentCodeHash !== entry.codeHash

    if (designChanged && codeChanged) {
      result.state = STATES.BOTH_CHANGED
      result.detail = "design and code both drifted since last sync"
    } else if (designChanged) {
      result.state = STATES.DESIGN_CHANGED
      result.detail = "design changed — component may need regeneration"
    } else if (codeChanged) {
      result.state = STATES.CODE_CHANGED
      result.detail = "manual edits detected outside ignore regions"
    } else {
      result.state = STATES.SYNC
    }
  }

  return results.sort((a, b) => a.filePath.localeCompare(b.filePath))
}
