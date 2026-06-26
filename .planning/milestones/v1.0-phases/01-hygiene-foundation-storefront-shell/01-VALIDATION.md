---
phase: 1
slug: hygiene-foundation-storefront-shell
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (jsdom + node environments) |
| **Config file** | `vitest.config.ts` — none yet, Wave 0 installs |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run && npx tsc --noEmit && npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite must be green (tests + `tsc --noEmit` + clean `npm run build`)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Populated by the planner / nyquist-auditor from PLAN.md tasks. Each phase requirement (SHELL-01..04, LOOP-02, LOOP-03, HYGIENE-01..05, SEC-04) must map to at least one automated verify or a Wave 0 test stub.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | — | 0 | — | — | — | — | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — Vitest + jsdom default env, explicit jsdom devDep (Vitest 4 dropped auto-install)
- [ ] `src/test/setup.ts` — shared test setup; `window.matchMedia` stub; `fake-indexeddb/auto` registration
- [ ] `src/registry/cacheKey.test.ts` — `// @vitest-environment node` pragma (jsdom lacks faithful `crypto.subtle.digest`)
- [ ] `vitest` + `@vitest/ui` + `jsdom` + `fake-indexeddb` — devDependency install

*Test infrastructure is greenfield — Wave 0 must stand up the framework before any requirement test runs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Repo-wide F12 / devtools audit (no mechanic-revealing surface) | HYGIENE-01 | Visual inspection of running app's devtools (Elements, Sources, Network, Application tabs) | `npm run build && npm run preview`, open devtools, confirm no banned tokens in symbols/CSS/storage/network/copy. The CI lexicon-grep test (HYGIENE-03) covers the static source surface automatically. |

*All other phase behaviors have automated verification via the 5 required test files.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
