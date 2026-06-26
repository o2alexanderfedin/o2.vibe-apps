---
phase: "12-network-data-path"
plan: "04"
subsystem: data
tags: [seeded-delegated, weather, currency, fetchData, wmo-codes, delegated-shell, handler-short-circuit]

requires:
  - phase: "12-01"
    provides: "DataFetchBroker interface, SOURCE_MANIFEST with weather-geocode/weather-forecast/fx-latest sourceIds, TtlCache"
  - phase: "12-03"
    provides: "fetchData closure injected into handler constrained scope (DATA-01)"

provides:
  - "SEEDED_SOURCES: Weather and Currency delegated modules (initialState + view + actionSpec) — apps render with zero model calls"
  - "WEATHER_HANDLER_SOURCES: ReadonlyMap keyed by exact buildActionIntent string for weather 'search'; calls fetchData geocode+forecast"
  - "CURRENCY_HANDLER_SOURCES: ReadonlyMap keyed by exact buildActionIntent string for currency 'load'; calls fetchData fx-latest"
  - "SEEDED_HANDLER_SOURCES in handler.ts: aggregates both maps; resolveHandlerJS short-circuit fires before registry and model call"

affects:
  - "12-05 (TTL cache tests rely on these seeded handlers calling fetchData)"
  - "Playwright smoke tests (weather/currency now render from seeds without any Anthropic key)"

tech-stack:
  added: []
  patterns:
    - "Seeded delegated module pattern: DelegatedShell runtime drives initialState+view+actionSpec; no monolithic App component"
    - "Seeded handler short-circuit: SEEDED_HANDLER_SOURCES.get(intent) fires before registryKey/cache/produce in resolveHandlerJS"
    - "WMO weather code mapping: integer code → neutral condition string, inline if/else, no external lib"
    - "routingBroker test double: routes fetchData calls by sourceId — enables sequential-fetchData handler tests"

key-files:
  created:
    - src/apps/seeds.ts (modified — weather + currency entries added)
    - src/apps/weatherHandlers.ts
    - src/apps/currencyHandlers.ts
    - src/apps/seeds.test.ts
    - src/apps/seededHandlers.test.ts
  modified:
    - src/execution/handler.ts
    - src/ui/Marketplace.test.tsx
    - src/ui/MarketplaceFixtures.test.tsx
    - src/ui/MarketplaceGuardrails.test.tsx
    - src/ui/MarketplaceModify.test.tsx
    - src/ui/MarketplaceResilience.test.tsx
    - src/ui/MarketplaceWidgets.test.tsx

key-decisions:
  - "actionSpec strings kept single-line (no embedded newlines) — whitespace differences produce different buildActionIntent keys and would silently miss the short-circuit"
  - "Handler source strings use bare function declarations and Object.assign (not spread) — avoids any transpile ambiguity in the constrained new Function scope"
  - "Seeded handler short-circuit re-transpiles on every call rather than caching the transpiled JS — handler source is small and transpile is fast; avoids a second Map for transpiled strings"
  - "routingBroker test double routes by sourceId (not canned single response) — enables testing the sequential geocode→forecast fetchData calls independently"
  - "Marketplace tests that assumed Weather/Currency were unseeded updated to use Calculator — avoids test breakage from adding these to SEEDED_SOURCES"

patterns-established:
  - "Add seeded handlers: create a ReadonlyMap<string,string> file, spread into SEEDED_HANDLER_SOURCES in handler.ts"
  - "Intent key construction: copy buildActionIntent() format exactly — `${appType} action '${action}': ${actionSpec} The handler input is...`"
  - "Delegated module view(state): pure markup with data-action attributes, status branches (idle/loading/ready/error), aria-busy on loading container"

requirements-completed:
  - DATA-03
  - DATA-04

duration: 26min
completed: "2026-06-26"
---

# Phase 12 Plan 04: Seeded Weather + Currency Delegated Modules and Handler Short-Circuit

**Weather (geocode→forecast) and Currency (fx-latest) render deterministically from seeded DelegatedModules and seeded handler sources, making both flagship network apps fully testable offline without any Anthropic key or model call.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-06-26T06:09:52Z
- **Completed:** 2026-06-26T06:27:00Z
- **Tasks:** 3
- **Files created:** 5 (seeds.ts modified, 4 new files)
- **Files modified:** 7 (handler.ts + 6 Marketplace test files)

## Accomplishments

- Weather and Currency added to `SEEDED_SOURCES` as proper DelegatedModules (initialState/view/actionSpec) — render without model calls; Phase 11 deriveStateSchema accepts all data fields because null-typed fields map to `z.unknown()` which allows any type on merge
- `weatherHandlers.ts` and `currencyHandlers.ts` export ReadonlyMaps with handler sources that call `fetchData` sequentially (weather: geocode then forecast); WMO weather code mapping (12 code groups) to neutral condition strings; error paths return `{status:"error"}`
- Handler short-circuit added to `resolveHandlerJS` as the first check — before `registryKey`, before cache lookup, before `produceGate.tryAcquire`, before any model call; `logger.info("Handler: seeded handler hit")` on match
- 45 new tests across `seeds.test.ts` and `seededHandlers.test.ts` covering all state branches, WMO codes, geocode/forecast/FX error paths, short-circuit without registry entries, base passthrough

## Task Commits

1. **Task 1: Weather + Currency delegated modules in seeds.ts** - `ab58535` (feat)
2. **Task 2: Seeded handler sources** - `aa59187` (feat)
3. **Task 3: Short-circuit in resolveHandlerJS** - `3c09b6b` (feat)

## Files Created/Modified

- `src/apps/seeds.ts` — added "weather" and "currency" delegated module source strings; 4 entries total
- `src/apps/weatherHandlers.ts` — WEATHER_HANDLER_SOURCES ReadonlyMap; handler calls weather-geocode then weather-forecast via fetchData
- `src/apps/currencyHandlers.ts` — CURRENCY_HANDLER_SOURCES ReadonlyMap; handler calls fx-latest via fetchData
- `src/execution/handler.ts` — imports + SEEDED_HANDLER_SOURCES constant + short-circuit in resolveHandlerJS
- `src/apps/seeds.test.ts` — 25 tests: DelegatedModule contract, initialState fields, view branches, data-action presence, no mechanic copy
- `src/apps/seededHandlers.test.ts` — 20 tests: map structure, behavior with canned broker fixtures, short-circuit integration tests (no registry entry needed)
- `src/ui/Marketplace.test.tsx` — updated to use Calculator instead of Weather (Weather is now seeded)
- `src/ui/MarketplaceFixtures.test.tsx` — updated to use Calculator instead of Weather for fixture/error tests
- `src/ui/MarketplaceGuardrails.test.tsx` — updated to use Calculator/Timer instead of Weather for produce-cap tests
- `src/ui/MarketplaceModify.test.tsx` — updated to use Calculator instead of Weather for widget-tweak test
- `src/ui/MarketplaceResilience.test.tsx` — updated to use Calculator instead of Weather for 401/429 resilience tests
- `src/ui/MarketplaceWidgets.test.tsx` — updated to use Calculator instead of Weather for widget composition tests

## Decisions Made

- **Single-line actionSpec**: The actionSpec string in seeds.ts is a single line with no embedded newlines. buildActionIntent concatenates it verbatim, so any whitespace difference produces a different key and the short-circuit silently misses. Kept stable.
- **Object.assign over spread in handler source**: Handler source strings run in the constrained new Function scope with Babel-standalone classic runtime. Object.assign is safer than `{...spread}` which requires Babel to emit a polyfill — avoided transpile ambiguity.
- **Re-transpile on short-circuit hit**: Seeded handler sources are re-transpiled on every call rather than caching the transpiled string. Transpile is fast (~0ms for 100-line source), and adding a parallel Map for transpiled strings adds complexity without measurable benefit.
- **Test double: routingBroker**: Standard `cannedBroker` returns one fixed response for ALL sourceId calls. Weather handler needs two sequential fetchData calls (geocode, then forecast). Created `routingBroker(Record<sourceId, response>)` test double that routes by sourceId — clean, no shared state, easily extensible.
- **Updated 6 existing test files**: Tests that used "Weather" as the unseeded produce-path app needed updating because Weather is now seeded. Updated all to use Calculator (never seeded). This is correct behavior — the tests were documenting the prior unseeded state, which changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Marketplace tests assumed Weather was unseeded**

- **Found during:** Task 1 (adding weather to SEEDED_SOURCES)
- **Issue:** 6 existing Marketplace test files used "Weather" as the unseeded app that goes through the transport (for produce-path, resilience, widget-composition, fixtures tests). Once Weather was added to SEEDED_SOURCES, these tests broke — opening Weather now renders the seeded delegated view instead of calling the transport.
- **Fix:** Updated all 6 test files to use Calculator (or Timer/Recipes) instead of Weather in contexts where an unseeded app is needed. Weather-specific assertions updated to match the new delegated view.
- **Files modified:** `src/ui/Marketplace.test.tsx`, `src/ui/MarketplaceFixtures.test.tsx`, `src/ui/MarketplaceGuardrails.test.tsx`, `src/ui/MarketplaceModify.test.tsx`, `src/ui/MarketplaceResilience.test.tsx`, `src/ui/MarketplaceWidgets.test.tsx`
- **Verification:** All 533 tests pass after fix
- **Committed in:** `ab58535` (Task 1 commit)

**2. [Rule 1 - Bug] Curly apostrophe in seeds.ts view copy**

- **Found during:** Task 1 test writing (seeds.test.ts)
- **Issue:** The Write tool encoded "Couldn't" with a right single quotation mark (U+2019, curly apostrophe) rather than a straight apostrophe (U+0027). Initial test assertions used straight apostrophes and failed.
- **Fix:** Updated test assertions to use regex `toMatch(/Couldn.t load conditions/)` and `toMatch(/Couldn.t load rates/)` — matches either apostrophe variant, making the test robust to encoding differences.
- **Files modified:** `src/apps/seeds.test.ts`
- **Verification:** Tests pass with curly apostrophe in source
- **Committed in:** `ab58535` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 cascade from Weather being seeded, 1 Rule 1 encoding bug)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Known Stubs

None — Weather and Currency views fully implement all status branches (idle/loading/ready/error) with real data bindings. Handler sources call real fetchData sourceIds with correct parameters. No placeholder values, TODO markers, or hardcoded empty data in paths that flow to the UI.

## Threat Flags

No new threat surface beyond the plan's threat model. The only new network calls are within the handler sources (weatherHandlers.ts, currencyHandlers.ts) which call fetchData — the host-brokered, manifest-constrained, keyless path established in Plans 01-03. No new origins, no new auth paths, no new file access patterns.

## Next Phase Readiness

- Plans 05+ can use `SEEDED_HANDLER_SOURCES` to verify fetchData calls hit the TTL cache (seeded handlers make real fetchData calls → TTL exercised)
- Browser smoke tests can open Weather (enter a city, see temperature) and Currency (see rates) without any Anthropic key
- Counter and Notes remain seeded monolithic App components; Weather and Currency are seeded delegated modules — two patterns coexist cleanly in SEEDED_SOURCES

## Self-Check: PASSED

- src/apps/seeds.ts: EXISTS with weather and currency entries (SEEDED_SOURCES.size === 4)
- src/apps/weatherHandlers.ts: EXISTS (WEATHER_HANDLER_SOURCES with 1 entry, contains "weather-geocode" and "weather-forecast")
- src/apps/currencyHandlers.ts: EXISTS (CURRENCY_HANDLER_SOURCES with 1 entry, contains "fx-latest")
- src/execution/handler.ts: EXISTS with SEEDED_HANDLER_SOURCES and short-circuit before registryKey
- src/apps/seeds.test.ts: EXISTS (25 tests)
- src/apps/seededHandlers.test.ts: EXISTS (20 tests, includes short-circuit integration tests)
- Commits ab58535, aa59187, 3c09b6b: EXIST in git log
- tsc --noEmit: 0 errors
- npm test: 533/533 passing
- Hygiene gate: 0 violations in all new shipped source files

---
*Phase: 12-network-data-path*
*Completed: 2026-06-26*
