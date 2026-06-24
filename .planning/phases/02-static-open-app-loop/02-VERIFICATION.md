# Phase 2 Verification

status: PASS

## Acceptance Bar Results

### TypeScript
- `npx tsc --noEmit` → 0 errors ✅

### Build
- `npm run build` → success ✅
- No `.map` files in `dist/` ✅ (sourcemap: false enforced by vite.config.ts)
- Chunk size warning is cosmetic (Babel ~3MB raw UMD is expected — noted in STACK.md)

### Tests
- `CI=true npm test` → **67 passed / 0 failed** across **12 test files** ✅
- Phase 1 baseline: 38 tests
- Phase 2 new tests: 29 tests (transpile ×6, instantiate ×5, mount ×5, loader ×6, resolver ×6, registry dual-cache ×1)

### Hygiene Gate
- `lexicon hygiene gate (HYGIENE-03)` → PASS ✅
- No banned tokens in any new source file

## Requirements Satisfied

| Req | Status | Evidence |
|-----|--------|---------|
| LOOP-01 | ✅ | `src/intent/resolver.ts` — static action→Intent map |
| LOOP-04 | ✅ | `src/execution/loader.ts` — three-tier resolve |
| LOOP-05 | ✅ | `src/execution/transpile.ts` — Babel TSX→classic |
| LOOP-06 | ✅ | `src/execution/instantiate.ts` — new Function factory |
| LOOP-07 | ✅ | Shared React injection, single instance |
| LOOP-08 | ✅ | `src/execution/mount.ts` — roots map by instance id |
| SHELL-05 | ✅ | `src/ui/AppShell.tsx` — name + ⋮ stub + ErrorBoundary wrap |
| SEC-01/02/03 | ⛔ DEFERRED | Explicit user instruction: "forget about safety for now" |
| Dual-cache | ✅ | AppRecord.source + AppRecord.transpiledJS; loader writes both |
| Babel classic | ✅ | output contains `React.createElement`; no `react/jsx-runtime` |
| No double createRoot | ✅ | roots map guards; mount test verifies single root |
| Seeded apps | ✅ | counter (useState) + notes (useState+useEffect) in seeds.ts |

## Deviations
None from stated scope. SEC-01/02/03 deferred by explicit user instruction.

## Key Files for Phase 3

| Module | Path | Purpose |
|--------|------|---------|
| Transpile seam | `src/execution/transpile.ts` | Swappable Babel→Sucrase if needed |
| Instantiate factory | `src/execution/instantiate.ts` | new Function; swap for iframe in Phase SEC |
| Mount/roots map | `src/execution/mount.ts` | Per-instance root lifecycle |
| Intent resolver | `src/intent/resolver.ts` | Add model call on full miss in Phase 3 |
| Three-tier loader | `src/execution/loader.ts` | resolveComponent + _clearCachesForTesting |
| Dual-cache schema | `src/registry/db.ts` | AppRecord { source, transpiledJS } |
| Seeded sources | `src/apps/seeds.ts` | Replace/augment with model call in Phase 3 |
