import fs from "node:fs"
import path from "node:path"
import { syncPath } from "./config.js"
import { paint } from "./colors.js"

// Figma backends. Contract: getNode(fileKey, nodeId) → node JSON, or null when
// the node no longer exists. Additional backends (Figma MCP, mocks) implement
// the same contract.

// Reads committed node snapshots from .figma-sync/snapshots/<fileKey>/<id>.json.
// Snapshots represent the latest known state of the design and can be captured
// via the REST backend (`figma-sync capture`) or any other source, e.g. an
// agent session with Figma MCP access.
export function snapshotBackend(root) {
  return {
    name: "snapshot",
    async getNode(fileKey, nodeId) {
      const file = syncPath(root, "snapshots", fileKey, `${nodeId.replace(":", "-")}.json`)
      if (!fs.existsSync(file)) return null
      const snapshot = JSON.parse(fs.readFileSync(file, "utf8"))
      return snapshot.node ?? null
    },
  }
}

// Live Figma REST API. Requires FIGMA_TOKEN (a personal access token).
export function restBackend(token) {
  return {
    name: "rest",
    async getNode(fileKey, nodeId) {
      const url = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`
      const response = await fetch(url, { headers: { "X-Figma-Token": token } })
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`Figma API ${response.status} for ${fileKey}/${nodeId}`)
      const body = await response.json()
      return body.nodes?.[nodeId]?.document ?? null
    },
  }
}

export function createBackend(root, config, override) {
  const kind = override ?? config.backend
  if (kind === "rest") {
    const token = process.env.FIGMA_TOKEN
    if (token) return restBackend(token)
    // Explicitly requested rest (e.g. `capture`, `--backend=rest`) must have a token.
    if (override === "rest") {
      throw new Error("Backend 'rest' requires the FIGMA_TOKEN environment variable")
    }
    // rest is the default but no token is set — fall back so offline commands
    // still work, and warn loudly that the result is NOT a live check.
    console.error(
      paint(
        "WARNING: FIGMA_TOKEN not set — using the 'snapshot' backend. Results reflect the last captured snapshot, not live Figma. Set FIGMA_TOKEN for a live check.",
        "yellow",
      ),
    )
    return snapshotBackend(root)
  }
  if (kind === "snapshot") return snapshotBackend(root)
  throw new Error(`Unknown backend '${kind}' (expected 'snapshot' or 'rest')`)
}

// Fetch a node from any backend and persist it as a snapshot, so the snapshot
// backend (and diff baselines) stay current.
export async function writeSnapshot(root, mapping, node, source) {
  const file = syncPath(
    root,
    "snapshots",
    mapping.fileKey,
    `${mapping.nodeId.replace(":", "-")}.json`,
  )
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const snapshot = {
    fileKey: mapping.fileKey,
    nodeId: mapping.nodeId,
    fetchedAt: new Date().toISOString(),
    source,
    node,
  }
  fs.writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`)
}
