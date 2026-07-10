import crypto from "node:crypto"

// --- canonical JSON ---------------------------------------------------------

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

export function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex")
}

// --- design hash -------------------------------------------------------------

// Reduce a Figma node (snapshot shape or REST shape) to the configured design
// fields, recursively. Ids and unknown metadata are dropped so the result is a
// stable fingerprint of the design itself.
export function canonicalizeNode(raw, designFields) {
  const node = { ...raw }

  // Normalize Figma REST API shape to the flat snapshot shape.
  if (node.absoluteBoundingBox) {
    const box = node.absoluteBoundingBox
    node.x ??= box.x
    node.y ??= box.y
    node.width ??= box.width
    node.height ??= box.height
  }
  if (node.visible === false) node.hidden = true

  // Hidden nodes are not rendered, and Figma reports volatile/stale geometry for
  // them (especially inside auto-layout), which produced spurious DESIGN_CHANGED
  // drift. Keep only a stable identity marker so show/hide toggles and add/remove
  // are still detected, but drop the hidden subtree's geometry and descendants.
  if (node.hidden) {
    const out = {}
    for (const field of ["name", "type"]) {
      if (node[field] !== undefined) out[field] = node[field]
    }
    out.hidden = true
    return out
  }

  const out = {}
  for (const field of designFields) {
    if (node[field] !== undefined) out[field] = node[field]
  }
  if (Array.isArray(node.children) && node.children.length > 0) {
    out.children = node.children.map((child) => canonicalizeNode(child, designFields))
  }
  return out
}

export function designHash(node, designFields) {
  return sha256(stableStringify(canonicalizeNode(node, designFields)))
}

// --- code hash ---------------------------------------------------------------

const IGNORE_REGION =
  /[ \t]*(\/\/|\{\/\*)\s*figma-sync-ignore-start[\s\S]*?figma-sync-ignore-end[^\n]*\n?/g

// Fingerprint of generated source. Line endings are normalized and marked
// custom-code regions are removed entirely (markers included, leftover blank
// lines collapsed), so adding or editing an ignore region never counts as
// drift against a baseline that predates it.
export function normalizeCode(source) {
  return source
    .replace(/\r\n/g, "\n")
    .replace(IGNORE_REGION, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
}

export function codeHash(source) {
  return sha256(normalizeCode(source))
}
