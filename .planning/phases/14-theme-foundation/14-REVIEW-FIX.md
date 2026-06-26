---
phase: 14-theme-foundation
fixed_at: 2026-06-26T15:16:30Z
review_path: .planning/phases/14-theme-foundation/14-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 14: Code Review Fix Report

**Fixed at:** 2026-06-26T15:16:30Z
**Source review:** .planning/phases/14-theme-foundation/14-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (2 warnings + 3 info)
- Fixed: 5
- Skipped: 0

All five findings were applied cleanly. Full verification battery is green:
`npx tsc --noEmit` → 0 errors; `npx vitest run` → 570 passed (was 569 — the new
WR-02 upgrade test adds one); `npx vitest run src/hygiene.test.ts src/csp.test.ts`
→ 9 passed.

## Fixed Issues

### WR-01: Side effects run inside the `setThemeState` updater — violates React's pure-updater contract

**Files modified:** `src/ui/VibeThemeProvider.tsx`
**Commit:** 18626fc
**Applied fix:** Replaced `setThemeState(() => { localStorage.setItem(...); return name; })`
with a pure `setThemeState(name)`. Moved the best-effort `localStorage.setItem`
(try/catch) into the body of the `useCallback`, after the setState call. Preserved
the existing fire-and-forget IDB mirror `void settingsStore.write(name)` exactly
(not awaited, `settingsStore` still from `useServices()`). This keeps the updater
pure so persist counts cannot diverge under StrictMode double-render or
concurrent/interrupted renders. Identifiers remain hygiene-neutral.

### WR-02: `db.test.ts` claims to verify a v2→v3 non-destructive upgrade but never exercises an upgrade

**Files modified:** `src/registry/db.test.ts`
**Commit:** d46432e
**Applied fix:** (1) Added a `deleteRegistryDb()` helper wrapping
`indexedDB.deleteDatabase("MarketplaceRegistry")` in a Promise that resolves on
success/error/blocked, and awaited it in an `async beforeEach` so each test starts
from a clean version state (fake-indexeddb persists across `vi.resetModules()`).
(2) Added a real upgrade test "v2 data survives the upgrade to v3": seeds a v2
database directly via `openDB("MarketplaceRegistry", 2, {...})` whose upgrade body
creates only apps/widgets/handlers (no settings store), asserts `version === 2`
and `settings` absent, writes an AppRecord-shaped record, closes; then calls
`openRegistry()` (v3) and asserts `v3.version === 3`,
`v3.objectStoreNames.contains("settings") === true`, and the v2 record is still
readable. Imported `openDB` from "idb". All existing tests still pass with the new
cleanup. `npx vitest run src/registry/db.test.ts` → 6 passed.

### IN-01: `SettingRecord.value` is typed `unknown` but the store contract is string-only

**Files modified:** `src/registry/db.ts`, `src/host/settingsStore.ts`
**Commit:** e3395d7
**Applied fix:** Tightened `SettingRecord.value` from `unknown` to `string` in
`src/registry/db.ts`; the `[key: string]: unknown` index signature stays for
forward-compat. In `src/host/settingsStore.ts` the `read` path keeps the
`if (record && typeof record.value === "string")` guard: the `record` truthiness
check is load-bearing (handles the absent-key case where `db.get` returns
`undefined`), and the `typeof` is retained as runtime defense because IndexedDB is
an untyped boundary (a comment documents this). `npx tsc --noEmit` stays clean.

### IN-02: CSP comment hard-codes a test path (`src/csp.test.ts`)

**Files modified:** `index.html`
**Commit:** 675d9d3
**Applied fix:** Changed the HTML comment (lines 7–12, OUTSIDE the inline
`<script>` body which begins at line 17) from "src/csp.test.ts guards that this
hash stays in sync" to the generic "A test guards that this hash stays in sync".
Because the edit is outside the script body, the SHA-256 source hash is unchanged.
Confirmed with `npx vitest run src/csp.test.ts` → 7 passed.

### IN-03: `theme-selector__pill` border depends on runtime-only `--bord` with no static fallback

**Files modified:** `src/index.css`
**Commit:** 61cfa1f
**Applied fix:** Changed `border: 1px solid var(--bord)` to
`border: 1px solid var(--bord, var(--color-border-secondary))`. Verified
`--color-border-secondary` is statically defined in both `:root[data-theme="light"]`
and `:root[data-theme="dark"]` blocks in `src/index.css`, so the fallback is sound.
The pill now keeps a border even if the runtime named-theme vars are absent (e.g.
the inline first-paint script is blocked). Added a hygiene-neutral comment;
`npx vitest run src/hygiene.test.ts` → passed.

## Skipped Issues

None — all five in-scope findings were fixed.

---

_Fixed: 2026-06-26T15:16:30Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
