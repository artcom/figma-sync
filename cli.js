#!/usr/bin/env node
// figma-sync CLI — see README.md
import { loadProject } from "./lib/project.js"
import { createBackend } from "./lib/backends.js"
import { STATES } from "./lib/status.js"
import { figmaNodeUrl } from "./lib/manifest.js"
import { paint, link } from "./lib/colors.js"

// Load .env from the current working directory (the consuming project) so
// FIGMA_TOKEN can live there instead of the shell. Built-in, zero-dependency
// (Node ≥ 20.12); a real shell env var still takes precedence, and a missing
// .env is a no-op.
try {
  process.loadEnvFile()
} catch {
  // no .env file (or older Node) — ignore
}

// States where regenerating the component from Figma is the likely next step.
const REGEN_STATES = new Set([STATES.DESIGN_CHANGED, STATES.BOTH_CHANGED])

// Each state is conveyed by colour rather than an icon.
const STATE_STYLE = {
  [STATES.SYNC]: "green",
  [STATES.DESIGN_CHANGED]: "yellow",
  [STATES.CODE_CHANGED]: "cyan",
  [STATES.BOTH_CHANGED]: "red",
  [STATES.NODE_DELETED]: "red",
  [STATES.FILE_DELETED]: "red",
  [STATES.UNMAPPED]: "gray",
  [STATES.UNKNOWN]: "gray",
}

const CLEAN_STATES = new Set([STATES.SYNC])

const USAGE = `figma-sync — drift detection between Figma nodes and generated code

Usage: figma-sync <command> [options]

Commands:
  scan                 List components with figma-sync annotations
  status               Report drift state for every mapped component
  update-manifest      Record current design + code state as the baseline
  diff <name>          Show design changes since the baseline for one component
  capture              Fetch mapped nodes from the REST API into snapshots
  doctor               Validate manifest, annotations, and snapshots

Options:
  --backend=<name>     Override backend: snapshot | rest
  --json               Machine-readable output
  --help               Show this help
`

function parseArgs(argv) {
  const args = { _: [] }
  for (const arg of argv) {
    if (arg === "--json") args.json = true
    else if (arg === "--help") args.help = true
    else if (arg.startsWith("--backend=")) args.backend = arg.slice("--backend=".length)
    else args._.push(arg)
  }
  return args
}

function printStatus(results, json) {
  if (json) {
    console.log(JSON.stringify(results, null, 2))
  } else {
    if (results.length === 0)
      console.log("No mapped components. Add figma-sync annotations and run update-manifest.")
    for (const result of results) {
      const style = STATE_STYLE[result.state] ?? "gray"
      console.log(
        `${paint(`[${result.state}]`, style, "bold")} ${result.componentName ?? result.filePath}`,
      )
      if (result.detail) console.log(`    ${paint(result.detail, "gray")}`)
      console.log(`    ${paint(result.filePath, "gray")}`)
      if (REGEN_STATES.has(result.state) && result.fileKey && result.nodeId) {
        const url = figmaNodeUrl(result.fileKey, result.nodeId)
        const prompt = `Regenerate the ${result.componentName} component (${result.filePath}) to match its Figma design at ${url}, then run npm run figma:update-manifest`
        console.log(
          `    ${paint("regenerate:", "cyan")} ${paint(`/figma-regen ${result.componentName}`, "bold")}`,
        )
        console.log(`    ${paint("figma:", "gray")}      ${link(url)}`)
        console.log(`    ${paint("prompt:", "gray")}     ${prompt}`)
      }
    }
  }
  return results.every((result) => CLEAN_STATES.has(result.state)) ? 0 : 1
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const [command, ...rest] = args._
  if (!command || args.help) {
    console.log(USAGE)
    return 0
  }

  const project = await loadProject({ backend: args.backend })

  switch (command) {
    case "scan": {
      const mappings = project.scan()
      if (args.json) console.log(JSON.stringify(mappings, null, 2))
      else
        for (const mapping of mappings)
          console.log(
            `${mapping.componentName}  ${mapping.filePath}  →  ${mapping.fileKey} / ${mapping.nodeId}`,
          )
      return 0
    }

    case "status": {
      const results = await project.status()
      return printStatus(results, args.json)
    }

    case "update-manifest": {
      const updated = await project.updateManifest()
      for (const mapping of updated) {
        if (mapping.skipped)
          console.log(paint(`skipped ${mapping.filePath} (${mapping.skipped})`, "red"))
        else console.log(paint(`baselined ${mapping.filePath} → ${mapping.nodeId}`, "green"))
      }
      return 0
    }

    case "diff": {
      const name = rest[0]
      if (!name) throw new Error("Usage: figma-sync diff <componentName>")
      const result = await project.diff(name)
      if (args.json) {
        console.log(JSON.stringify(result, null, 2))
      } else if (result.nodeDeleted) {
        console.log(paint(`${result.filePath}: Figma node deleted`, "red"))
      } else if (result.changes.length === 0) {
        console.log(paint(`${result.filePath}: design unchanged since baseline`, "green"))
      } else {
        console.log(`${paint(`${result.filePath}: ${result.changes.length} design change(s)`, "yellow")}\n`)
        for (const change of result.changes) {
          console.log(`  ${paint(change.path, "bold")}`)
          console.log(`    baseline: ${paint(JSON.stringify(change.before), "gray")}`)
          console.log(`    current:  ${paint(JSON.stringify(change.after), "yellow")}`)
        }
      }
      return result.changes?.length ? 1 : 0
    }

    case "capture": {
      const rest_ = createBackend(project.root, project.config, "rest")
      const captured = await project.capture(rest_)
      for (const mapping of captured) {
        if (mapping.skipped)
          console.log(paint(`skipped ${mapping.filePath} (${mapping.skipped})`, "red"))
        else console.log(paint(`refreshed ${mapping.filePath} → snapshot from REST API`, "green"))
      }
      return 0
    }

    case "doctor": {
      const mappings = project.scan()
      const manifest = project.manifest()
      const problems = []
      for (const mapping of mappings)
        if (!manifest[mapping.filePath])
          problems.push(`annotated but unmanaged: ${mapping.filePath}`)
      for (const [filePath, entry] of Object.entries(manifest)) {
        if (!mappings.some((mapping) => mapping.filePath === filePath))
          problems.push(`in manifest but annotation missing: ${filePath}`)
        if (!(await project.backend.getNode(entry.fileKey, entry.nodeId)))
          problems.push(
            `backend '${project.backend.name}' has no data for ${filePath} (${entry.nodeId})`,
          )
      }
      if (problems.length === 0) {
        console.log(
          paint(
            `${mappings.length} mapping(s), ${Object.keys(manifest).length} manifest entr(ies), backend '${project.backend.name}' healthy`,
            "green",
          ),
        )
        return 0
      }
      for (const problem of problems) console.log(paint(problem, "red"))
      return 1
    }

    default:
      console.error(`Unknown command '${command}'\n\n${USAGE}`)
      return 1
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`figma-sync: ${error.message}`)
    process.exit(2)
  },
)
