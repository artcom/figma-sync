// Structural diff between two canonicalized design documents.
// Returns a flat list of { path, before, after } changes.

function label(node, index) {
  return node && typeof node === "object" && node.name ? `${index}:${node.name}` : String(index)
}

export function diffNodes(before, after, prefix = "", changes = []) {
  if (before === undefined) {
    changes.push({ path: prefix || "/", before: undefined, after })
    return changes
  }
  if (after === undefined) {
    changes.push({ path: prefix || "/", before, after: undefined })
    return changes
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length)
    for (let i = 0; i < length; i++) {
      diffNodes(before[i], after[i], `${prefix}/${label(before[i] ?? after[i], i)}`, changes)
    }
    return changes
  }
  if (before && after && typeof before === "object" && typeof after === "object") {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      diffNodes(before[key], after[key], `${prefix}/${key}`, changes)
    }
    return changes
  }
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    changes.push({ path: prefix || "/", before, after })
  }
  return changes
}
