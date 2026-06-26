# Phase 2 Context — Static Open-One-App Loop

## Goal
A user opens a seeded app from the storefront and it renders and is fully
interactive — proving the resolve → compile → instantiate → render core loop
with model nondeterminism removed (no model call yet; the app's source is
seeded in the repo).

## Requirements in Scope
LOOP-01, LOOP-04, LOOP-05, LOOP-06, LOOP-07, LOOP-08, SHELL-05.
SEC-01/02/03 are explicitly deferred (user priority: MVP ASAP).

## Dual-Cache Requirement
The `apps` IndexedDB store record holds BOTH:
- `source` — original TSX string
- `transpiledJS` — Babel-transpiled JS string

Compile exactly once. An in-memory session transpiled cache prevents
re-transpiling within a session.

## Babel Configuration
`@babel/standalone` with presets:
- `["typescript", { isTSX: true, allExtensions: true }]`
- `["react", { runtime: "classic" }]`

Output MUST contain `React.createElement` and NO `react/jsx-runtime` import.
TypeScript type annotations MUST be stripped.

## Execution Model
Plain `new Function(...)` injecting a single shared React instance (and a
`useWidget` stub). No sandbox/iframe/denylist in this phase.

## Three-Tier Resolve (LOOP-04)
1. Live-component Map (in-memory, keyed by instance id)
2. Transpiled-string Map (in-memory session cache)
3. IndexedDB `apps` store (persistent)

Cache hit returns immediately with no recompile.

## Roots Map (LOOP-08)
Keyed by instance id. `createRoot` once per instance; `root.render()` to
update; `root.unmount()` to remove. No double `createRoot` call.

## Intent Resolver (LOOP-01)
Static action → type map producing:
`Intent { operation, kind, type, contextBundle, cacheKey }`

## Seeded Apps
Two seeded app types (no model call):
- `counter` — simple counter with `useState`
- `notes` — notes list with `useState` + `useEffect`

## AppShell (SHELL-05)
Each opened app renders inside an AppShell showing the app name + a `⋮` menu
button (stub). Wrapped in the existing `ErrorBoundary`.

## Hygiene
No banned tokens (`synthesize/synthesized/synthesis`, `fake`, `mock`, `AI`,
`llm`, `generate/generated/generating`) in any `.ts/.tsx/.css/.html` source.
No `.map` files in `dist/`.

## Key Files for Phase 3 to Reuse
- `src/execution/transpile.ts` — Babel TSX→classic compile seam
- `src/execution/instantiate.ts` — `new Function` component factory
- `src/execution/mount.ts` — roots map, mount/unmount lifecycle
- `src/intent/resolver.ts` — intent resolution
- `src/registry/db.ts` — dual-cache AppRecord schema
- `src/apps/seeds.ts` — seeded TSX source strings
