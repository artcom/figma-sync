# figma-sync

A synchronization layer that answers "is this generated component still aligned
with its Figma node?" — without being a code generator itself.

Plain ESM JavaScript, zero runtime dependencies, Node ≥ 18. Ships a `figma-sync`
CLI plus a small library API.

## Install

Consume it as a dependency. As a sibling `file:` package:

```json
{ "devDependencies": { "figma-sync": "file:../figma-sync" } }
```

`npm install` then exposes the `figma-sync` binary (in `node_modules/.bin`, so
it's callable from your `package.json` scripts) and the library entry
`import { loadProject } from "figma-sync"`.

The tool reads/writes a `.figma-sync/` directory in the **current working
directory** (the consuming project), so run it from that project's root.

## How it works

1. **Mapping** — components carry a metadata comment:

   ```jsx
   // figma-sync: file=dSRhp9PHg4w9Gnco2R19dg node=2267:1644 name=StatusCard
   ```

2. **Manifest** — `.figma-sync/manifest.json` records, per file, the design
   hash and code hash at generation time (`update-manifest` writes it). The
   canonicalized design document is kept in `.figma-sync/baselines/` so `diff`
   can show _what_ changed, not only _that_ something changed.

3. **Design hash** — the Figma node is reduced to an allowlist of design
   properties (name, type, geometry, fills, typography, …; ids and timestamps
   are dropped, and hidden subtrees are excluded), serialized as canonical JSON
   with sorted keys, and hashed (SHA-256).

4. **Code hash** — SHA-256 over the source with normalized line endings.
   Regions between `// figma-sync-ignore-start` and `// figma-sync-ignore-end`
   are excluded, so handwritten logic there never counts as drift.

5. **Status** — compares current design + code hashes against the manifest:
   `SYNC`, `DESIGN_CHANGED`, `CODE_CHANGED`, `BOTH_CHANGED`, `NODE_DELETED`,
   `FILE_DELETED`, `UNMAPPED`, `UNKNOWN`. Exit code is non-zero on any drift, so
   `figma-sync status` works as a CI gate. Output is colour-coded (no emoji) and
   colours auto-disable when piped or `NO_COLOR` is set.

## Backends

Access to Figma is pluggable (`lib/backends.js`):

- **`rest`** (default) — live Figma REST API; needs a `FIGMA_TOKEN` env var, so
  `status` reflects the _current_ design rather than a stale snapshot.
  `figma-sync capture` refreshes all snapshots from it. When `FIGMA_TOKEN` is
  not set, commands print a warning and fall back to the `snapshot` backend so
  they still run offline (explicit `--backend=rest` and `capture` still
  hard-require the token).
- **`snapshot`** — reads committed node JSON from
  `.figma-sync/snapshots/<fileKey>/<nodeId>.json`. Works offline and in CI.

## Usage

```bash
figma-sync scan                # list annotated components → nodes
figma-sync update-manifest     # record current state as the baseline
figma-sync status              # drift report (non-zero exit on drift)
figma-sync diff StatusCard     # what changed in the design since baseline
figma-sync capture             # refresh snapshots from the REST API
figma-sync doctor              # validate manifest/annotations/snapshots
```

Typically wired into the consuming project's `package.json`:

```json
{ "scripts": { "figma:status": "figma-sync status" } }
```

Library API (what the CLI wraps):

```js
import { loadProject } from "figma-sync"

const project = await loadProject()
const status = await project.status()
const diff = await project.diff("StatusCard")
```

## Configuration

`.figma-sync/config.json` in the consuming project:

```json
{ "backend": "rest", "srcDir": "src" }
```

`designFields` (the allowlist hashed for the design) can also be overridden
there; see `lib/config.js` for the default list.

`FIGMA_TOKEN` (for the `rest` backend) is read from the environment. The CLI
also auto-loads a `.env` file from the working directory (built-in, Node ≥
20.12), so the token can live in the consuming project's gitignored `.env`. A
real shell env var still takes precedence.

See [docs/token-setup.md](docs/token-setup.md) for how to create the token and
exactly which scopes it needs (short answer: only `file_content:read`).

## Limitations / next steps

- JavaScript, not TypeScript; comment scanning uses a regex, not an AST.
- Design freshness is pull-based; nothing watches Figma. A `figmaVersion` field
  plus the Figma versions/webhooks API would make `DESIGN_CHANGED` detection
  live instead of capture-time.
- No tests yet; the module boundaries (mapping / backends / hash / status /
  reporters) are where plugin interfaces would go.
