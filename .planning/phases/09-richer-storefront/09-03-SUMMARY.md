---
phase: "09-richer-storefront"
plan: "03"
subsystem: storefront-ui
tags: [popular-row, marketplace, ranking, phase-9, store-01, store-02]
dependency_graph:
  requires:
    - "09-01"  # AppRecord.displayName/prompt/createdAt + rankPopular/titleCase
    - "09-02"  # rankPopular unit tests confirming contract
  provides:
    - popular row in Marketplace storefront (conditionally visible)
    - displayName fallback chain rendering on popular-row cards
  affects:
    - src/ui/Marketplace.tsx
tech_stack:
  added: []
  patterns:
    - IoC/DI registry read via injected services.registry.keys/get
    - presence-only type guard delegating membership to rankPopular
    - conditional render gated on derived-list length (no duplicated filter)
    - three-part displayName fallback chain (record → static registry → titleCase)
key_files:
  created: []
  modified:
    - src/ui/Marketplace.tsx
decisions:
  - "rankPopular is the sole owner of useCount>=1 filter; Marketplace.tsx applies presence guard (!!r) only"
  - "popular row gated on popularApps.length>0; cold-start hidden because rankPopular returns [] when no app has useCount>=1"
  - "displayName fallback: record.displayName ?? entry?.displayName ?? titleCase(record.type) — never blank"
  - "section heading 'Your most-opened' — local-only framing, no cross-platform claim, no mechanic lexicon"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-26"
  tasks_completed: 1
  tasks_total: 2
  files_changed: 1
---

# Phase 09 Plan 03: Popular Row in Marketplace Storefront Summary

**One-liner:** Popular row wired into Marketplace.tsx via a mount-time registry read delegating all ranking to rankPopular, gated on popularApps.length > 0 so it is hidden on cold start.

## What Was Built

### Task 1 — Add popular row to Marketplace.tsx (COMPLETED, committed 6218fe1)

Extended `src/ui/Marketplace.tsx` with three additions:

**New imports (lines 14-16):**
- `import type { AppRecord } from "../registry/db"` — type-only import for the state type
- `import { rankPopular, titleCase } from "./marketplaceUtils"` — the utility functions created in Plan 09-01

**New state (line 142):**
- `const [popularApps, setPopularApps] = useState<AppRecord[]>([])` — initialized empty so the row is hidden on cold start

**New useEffect (lines 277-295):**
- Async IIFE pattern consistent with existing code
- Reads all keys from `services.registry.keys("apps")`, fetches each record via `services.registry.get("apps", k)`
- Applies a **presence-only** type guard `(r): r is AppRecord => !!r` to drop undefined records from missing keys — this is NOT a useCount filter
- Delegates ranking entirely to `rankPopular(records)` which is the sole owner of the `useCount >= 1` membership filter and top-N cap
- Wraps in try/catch: on error logs via `logger.error` and leaves `popularApps` at `[]` (row stays hidden)
- Dependency array: `[services]`

**Popular row render (lines 325-358):**
- Gated only on `popularApps.length > 0` — single visibility gate, no inline useCount filter
- `<section aria-label="Frequently opened">` wrapping
- `<h2 className="storefront-section__heading">Your most-opened</h2>` — local-only, truthful copy
- Reuses `.storefront-grid` and `.app-card` classes
- Per-card displayName fallback chain: `record.displayName ?? entry?.displayName ?? titleCase(record.type)`
- Icon: `(entry ? ICONS[entry.icon] : undefined) ?? Cloud`
- `description` span only rendered when `description` is truthy (consistent with plan)
- `onClick` passes resolved `name` to `handleOpen`
- `key` is `record.cacheKey` (stable, unique)

**Existing APP_REGISTRY card loop: untouched.** The popular row supplements it; it does not replace it.

## Task 2 — Visual Verification (DEFERRED to human UAT)

Task 2 is a `type="checkpoint:human-verify"` gate requiring browser screenshots. This cannot be performed by an automated executor. The steps are preserved here for the human verifier:

### Verification Steps

1. Run `npm run dev` and open http://localhost:5173 in the browser.

2. **Cold start check (SCREENSHOT 1):** Confirm the storefront shows only the main app grid — no "Your most-opened" section visible yet. Inspect the screenshot to confirm the section is truly absent (not merely empty/collapsed).

3. Open one app (e.g. Counter). Close it. Reload the page.

4. **Populated check (SCREENSHOT 2):** Confirm a "Your most-opened" section now appears above the opened-apps region, containing the Counter card with its real name ("Counter") — not the raw type slug. Inspect the screenshot for card alignment, theme-var colors, and heading style — confirm no layout breakage.

5. Open 3-4 more apps. Reload again. **Ranking check (SCREENSHOT 3):** Confirm the popular row ranks them in open-count order and never shows more than 5 cards.

6. Open DevTools → Application → IndexedDB → MarketplaceRegistry → apps. Inspect a record. Confirm:
   a. The `prompt` field is either undefined or contains only the user's intent string (not a long system-prompt).
   b. No value in any field contains the strings "synthesize", "generate", "AI", "llm".

7. Open DevTools → Console. Confirm no errors related to popularApps or registry loading.

8. Run `npx --no -- grep -rn "synthesize\|synthesis" src/` — must return 0 matches in any non-comment context.

9. Review all three screenshots together for visual consistency (spacing, alignment, contrast) per the project UX-pragmatic standard.

**Resume signal:** Type "approved" if the storefront looks correct across all three screenshots and the hygiene checks pass, or describe any issues found.

**Status:** Awaiting human UAT — phase verifier will mark this `human_needed`.

## Deviations from Plan

None — Task 1 executed exactly as specified. The one pre-existing flaky timeout in `thinShellCalculator.test.tsx` (full-suite parallel run resource contention) passed on isolated re-run and is confirmed pre-existing (passes on the unmodified branch).

## Verification Results

- `npx tsc --noEmit`: clean (exit 0)
- `npm run test` full suite: 385 passed (one intermittent timeout in `thinShellCalculator.test.tsx` on parallel run — confirmed pre-existing, passes in isolation)
- Marketplace-specific suite: `Marketplace.test.tsx`, `MarketplaceDelegated.test.tsx`, `MarketplaceGuardrails.test.tsx`, `MarketplaceResilience.test.tsx` — all 16 tests pass
- Hygiene gate: `src/hygiene.test.ts` — pass (0 banned tokens in src/**)
- Build: `npm run build` exit 0, no source maps in dist/
- Cold-start-owner check: `grep -n "useCount" src/ui/Marketplace.tsx` — only appears in comments; NO `useCount >= 1` filter in effect or render code

## Threat Model Verification

Per the plan's threat register:
- **T-09-06** (heading copy): Mitigated — heading is "Your most-opened", no banned mechanic tokens, local-only framing
- **T-09-07** (displayName in DOM): Accepted as planned — displayName is type slug derived or static label
- **T-09-08** (failed load): Mitigated — catch block swallows to logger.error, leaves popularApps at [], row hidden
- **T-09-09** (registry.keys + Promise.all on mount): Accepted as planned — bounded by LRU cap

## Known Stubs

None — the popular row reads from the live registry and delegates all ranking logic to `rankPopular` which was fully implemented in Plan 09-01.

## Self-Check: PASSED

- [x] src/ui/Marketplace.tsx imports: type AppRecord, rankPopular, titleCase
- [x] popularApps useState declared; useEffect loads from registry.keys/get on mount
- [x] Effect uses presence-only guard (!!r); NO separate useCount filter
- [x] Popular row renders iff popularApps.length > 0; heading "Your most-opened"
- [x] Cards use three-part displayName fallback chain
- [x] Existing APP_REGISTRY card loop untouched (lines 300-323)
- [x] tsc clean; Marketplace tests pass; hygiene gate pass; build clean; no source maps
- [x] Task 1 committed: 6218fe1
- [x] Task 2 documented as DEFERRED to human visual UAT with exact verification steps

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1 | 6218fe1 | feat(09-03): add popular row to Marketplace storefront |
| Metadata | (this commit) | docs(09-03): complete plan summary + Task 2 deferred to human UAT |
