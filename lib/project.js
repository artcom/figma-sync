import fs from "node:fs"
import path from "node:path"
import { loadConfig } from "./config.js"
import { discoverMappings } from "./mapping.js"
import { loadManifest, saveManifest, saveBaseline, loadBaseline, figmaNodeUrl } from "./manifest.js"
import { createBackend, writeSnapshot } from "./backends.js"
import { computeStatus } from "./status.js"
import { canonicalizeNode, designHash, codeHash, stableStringify, sha256 } from "./hash.js"
import { diffNodes } from "./diff.js"

// Library API — the CLI is a thin wrapper around this.
//
//   const project = await loadProject({ root })
//   const status = await project.status()
//   const diff = await project.diff("StatusCard")

export async function loadProject({ root = process.cwd(), backend: backendOverride } = {}) {
  const config = loadConfig(root)
  const backend = createBackend(root, config, backendOverride)

  const project = {
    root,
    config,
    backend,

    scan() {
      return discoverMappings(root, config.srcDir)
    },

    manifest() {
      return loadManifest(root)
    },

    async status() {
      return computeStatus({
        root,
        config,
        manifest: loadManifest(root),
        mappings: project.scan(),
        backend,
      })
    },

    // Record the current design + code state as the new baseline ("this is
    // what was generated"). Run after (re)generating components.
    async updateManifest() {
      const manifest = loadManifest(root)
      const updated = []
      for (const mapping of project.scan()) {
        const node = await backend.getNode(mapping.fileKey, mapping.nodeId)
        if (!node) {
          updated.push({ ...mapping, skipped: `node not found via backend '${backend.name}'` })
          continue
        }
        const canonical = canonicalizeNode(node, config.designFields)
        const source = fs.readFileSync(path.join(root, mapping.filePath), "utf8")
        manifest[mapping.filePath] = {
          fileKey: mapping.fileKey,
          nodeId: mapping.nodeId,
          componentName: mapping.componentName,
          url: figmaNodeUrl(mapping.fileKey, mapping.nodeId),
          designHash: sha256(stableStringify(canonical)),
          codeHash: codeHash(source),
          generatedAt: new Date().toISOString(),
        }
        saveBaseline(root, mapping, canonical)
        updated.push(mapping)
      }
      saveManifest(root, manifest)
      return updated
    },

    // Fetch all mapped nodes from a live backend and persist them as
    // snapshots, refreshing what the snapshot backend serves.
    async capture(fromBackend) {
      const captured = []
      for (const mapping of project.scan()) {
        const node = await fromBackend.getNode(mapping.fileKey, mapping.nodeId)
        if (!node) {
          captured.push({ ...mapping, skipped: "node not found" })
          continue
        }
        await writeSnapshot(root, mapping, node, fromBackend.name)
        captured.push(mapping)
      }
      return captured
    },

    // Structural design diff for one component: baseline (at generation time)
    // versus the backend's current state.
    async diff(name) {
      const manifest = loadManifest(root)
      const entry = Object.entries(manifest).find(
        ([filePath, value]) => value.componentName === name || filePath.includes(name),
      )
      if (!entry) throw new Error(`No manifest entry matches '${name}'`)
      const [filePath, mapping] = entry
      const baseline = loadBaseline(root, mapping)
      if (!baseline) throw new Error(`No baseline stored for ${filePath} — run update-manifest`)
      const node = await backend.getNode(mapping.fileKey, mapping.nodeId)
      if (!node) return { filePath, nodeDeleted: true, changes: [] }
      const current = canonicalizeNode(node, config.designFields)
      return { filePath, nodeDeleted: false, changes: diffNodes(baseline, current) }
    },
  }

  return project
}

export { designHash, codeHash, canonicalizeNode }
