---
phase: "12-network-data-path"
plan: "02"
subsystem: "csp"
tags: ["csp", "security", "allowlist", "data-path", "DATA-02"]
dependency_graph:
  requires: []
  provides: ["CSP connect-src allowlist for weather/FX data origins", "DATA-02 test gate"]
  affects: ["index.html", "src/csp.test.ts"]
tech_stack:
  added: []
  patterns: ["CSP meta directive pattern", "connectSrcDirective helper mirroring scriptSrcDirective"]
key_files:
  created: []
  modified:
    - "index.html"
    - "src/csp.test.ts"
decisions:
  - "Widened connect-src to exactly four origins ('self' + Anthropic + Open-Meteo forecast + Open-Meteo geocoding + Frankfurter FX); no wildcard"
  - "connectSrcDirective helper mirrors existing scriptSrcDirective pattern exactly"
  - "5 new it() assertions in DATA-02 describe block: 4 origin-present + 1 wildcard-absent"
metrics:
  duration: "2m"
  completed: "2026-06-26T12:46:05Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 12 Plan 02: CSP Allowlist Widen (DATA-02) Summary

**One-liner:** CSP connect-src widened to the exact four-origin allowlist (Anthropic + Open-Meteo forecast/geocoding + Frankfurter FX) with a five-assertion test gate that enforces each origin is present and the wildcard * is absent.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Widen connect-src in index.html | 6c7b7c4 | index.html |
| 2 | Add connectSrcDirective helper and DATA-02 assertion block | 8caa160 | src/csp.test.ts |

## What Was Built

### Task 1 — index.html connect-src
The CSP `connect-src` directive was extended from `'self' https://api.anthropic.com` to include the three new data-path origins required by DATA-02:
- `https://api.open-meteo.com` (weather forecast)
- `https://geocoding-api.open-meteo.com` (weather geocoding)
- `https://api.frankfurter.dev` (FX rates)

The final directive: `connect-src 'self' https://api.anthropic.com https://api.open-meteo.com https://geocoding-api.open-meteo.com https://api.frankfurter.dev`

All other CSP directives (default-src, script-src with sha256 hash, style-src, img-src, font-src) are byte-for-byte identical.

### Task 2 — src/csp.test.ts
Added `connectSrcDirective(html: string): string` helper function (mirrors existing `scriptSrcDirective` exactly) and a new `describe("CSP connect-src allowlist (DATA-02)")` block with 5 `it()` cases:
1. Contains `https://api.anthropic.com`
2. Contains `https://api.open-meteo.com`
3. Contains `https://geocoding-api.open-meteo.com`
4. Contains `https://api.frankfurter.dev`
5. Does not contain `*`

Reads `index.html` directly via `readFileSync`; no real network calls.

## Verification

- `grep "connect-src" index.html` returns exactly one CSP meta content line with all four origins and no `*`
- `npm test src/csp.test.ts` — 7 tests pass: 2 existing hash-guard + 5 new DATA-02 assertions
- `npm test` (full suite) — 338 tests pass, 0 failures
- `npx tsc --noEmit` — 0 errors

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no data stubs introduced; this plan only modifies CSP and its test.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes were introduced. The CSP change is the mitigation for T-12-02-A (directive creep) and T-12-02-B (overly broad connect-src). The existing inline-script hash guard (T-12-02-C) was verified unchanged by the existing 2 hash-guard tests continuing to pass.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| index.html exists | FOUND |
| src/csp.test.ts exists | FOUND |
| 12-02-SUMMARY.md exists | FOUND |
| Commit 6c7b7c4 (Task 1) | FOUND |
| Commit 8caa160 (Task 2) | FOUND |
