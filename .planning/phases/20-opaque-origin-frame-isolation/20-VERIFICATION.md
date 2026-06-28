---
status: passed
phase: 20
verified: 2026-06-27
verifier: autonomous-orchestrator (independent gates + Playwright + live viewed-browser smoke; 3 defects found+fixed across review+smoke)
---

# Phase 20 — Opaque-Origin Frame Isolation (HARD-01) — Verification

**Status: PASSED** — the flagship security phase. Each app body now runs in an `<iframe sandbox="allow-scripts">` (opaque origin); the API key is structurally unreachable from the frame; all 827 existing tests stay green on the in-tree fallback; a Playwright suite proves the real frame round-trip; and a **live viewed-browser smoke** confirmed (and caught a defect in) the real path.

## Requirement coverage (SANDBOX-01..06, HYGIENE-07)

| REQ | Criterion | Evidence (independently verified) |
|-----|-----------|-----------|
| SANDBOX-01 | App body in `<iframe sandbox="allow-scripts">`, opaque origin | Live: mounted iframe `sandbox` attr is exactly `allow-scripts`; CI unit test asserts never `allow-same-origin`; Playwright: `location.origin==="null"` inside frame. |
| SANDBOX-02 | Key never enters the frame | `buildSrcdoc` is 3-param type-enforced; CI + live: srcdoc contains no `/sk-ant/`; Playwright: parent sets `marketplace.apiKey`, frame `getItem` returns null; parent cannot read frame `contentDocument` (live: blocked). |
| SANDBOX-03 | Typed postMessage RPC, origin+source validation, allowlist map, proto-pollution defense | `isFromFrame` dual guard (origin `"null"` AND `source===contentWindow`); hardcoded `dispatchInbound` allowlist (`toString` drop tested); `parseSafe` via `Object.create(null)` + zod, no deep-merge; forged-message drop tested in JSDOM + Playwright. |
| SANDBOX-04 | Theme vars pushed per-frame, live re-skin | `THEME_PUSH` broadcast on `setTheme`; Playwright proves `:root --text` changes inside the frame after a switch; live: Aero theme applied inside the frame. |
| SANDBOX-05 | In-tree fallback keeps suite green; Playwright proves the round-trip | `frameMode` via `ServicesProvider` (tests default in-tree → 827 green, no browser); 2 Playwright tests (monolith + delegated seed) pass in real Chromium. Playwright is a **devDependency only**. |
| SANDBOX-06 | Unresponsive-frame ping/timeout → force-close overlay | 3-missed-pong overlay + Close tested; infinite-loop limitation documented (can't `terminate()` an iframe). |
| HYGIENE-07 | Lexicon gate extended to new surfaces | Line-based gate over `.css`/`.html` + TS string/comment slices banning iframe/sandbox/isolation in UI copy, with a surgical `sandbox="allow-scripts"` strip; scans the srcdoc template constant + postMessage field names. Green. |

## Gate results (independent re-run by orchestrator)

- `npx tsc --noEmit` → **0**
- Full suite → **827/827** (88 files; +66 over the 761 baseline: +63 executor, +3 storage-shim fix)
- `npm run build` → success; **0 source maps**
- Hygiene + CSP + frameCsp gates → green (CSP SHA-256 re-pinned in the same commit as the FOUC/srcdoc change)
- **Playwright** → **2/2** in real Chromium (Notes monolith + Weather delegated seed; storage-isolated; forged-message-dropped)
- Runtime dependencies → unchanged (`@babel/standalone, idb, lucide-react, react, react-dom, zod`); Playwright in devDependencies only.

## Defects found-and-fixed during this phase (the verification layer earning its keep)

1. **CR-01 (BLOCKER, code review):** delegated apps (the core on-demand loop) rendered blank in-frame — the bootstrap only handled the monolith shape. Fixed: ported a byte-identical delegated-shell runtime into the frame; Weather-seed e2e added.
2. **CR-02 (BLOCKER, code review — isolation bypass):** *cloned* apps fell through to the in-tree path with full DOM/key access. Fixed: clone now carries `transpiledJS` so it takes the frame path.
3. **localStorage crash (live viewed-browser smoke):** the isolation works *so well* that the Notes seed — which reads `localStorage` directly — threw `SecurityError` inside the opaque frame and crashed in a passive effect → frame rendered blank (height 0). Fixed: a **frame-local in-memory `localStorage`/`sessionStorage` shim** in the bootstrap (empty, frame-scoped, never brokered to the parent) so generated apps degrade gracefully instead of crashing; the e2e isolation proof was reconciled from "localStorage throws" to the meaningful "the frame cannot read the parent's key," plus a "Notes renders non-blank in-frame" regression test. Re-verified live: 135px, 0 console errors.

## Accepted tradeoff / follow-up

- **In-frame app storage is now ephemeral** (frame-local in-memory). Apps that used `localStorage` for their own persistence (e.g. Notes) no longer persist across reopen/reload — consistent with the Phase 21 "do not persist in-app state" decision. Persistent per-app storage would require a host-brokered storage RPC; that is a deliberate **future enhancement**, out of HARD-01 scope. The security goal (key unreachable) is fully met.

## Verification reality (honest note)

The real iframe round-trip cannot run in JSDOM (it no-ops frames, pointer capture, and cross-origin) — those assertions live in Playwright + the live viewed smoke, which is exactly where the localStorage-crash defect surfaced. The 827 RTL/JSDOM tests cover the logic on the in-tree fallback path.
