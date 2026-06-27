---
phase: 20-opaque-origin-frame-isolation
plan: 05
type: tdd
wave: 4
depends_on: [20-01, 20-02, 20-03, 20-04]
files_modified:
  - package.json
  - playwright.config.ts
  - e2e/frame-isolation.spec.ts
  - src/ui/SandboxFrame.security.test.tsx
  - src/hygiene.test.ts
autonomous: true
requirements: [SANDBOX-05, HYGIENE-07]
must_haves:
  truths:
    - "A Playwright test proves the real frame renders, theme vars apply inside the frame, localStorage read inside the frame throws SecurityError, and a forged postMessage from an unknown source is dropped"
    - "A CI (vitest) test asserts the mounted sandbox attribute never contains allow-same-origin"
    - "A CI test asserts the srcdoc string does not match /sk-ant/"
    - "A CI test asserts a forged {__proto__:{polluted:true}} inbound payload leaves ({}).polluted === undefined"
    - "The hygiene lexicon gate scans the new Phase 20 files and distinguishes user-visible copy from internal identifiers for iframe/sandbox/isolation"
  artifacts:
    - path: "e2e/frame-isolation.spec.ts"
      provides: "The browser round-trip proof (SANDBOX-05): render, theme-in-frame, localStorage SecurityError, forged-message drop"
      contains: "SecurityError"
    - path: "src/hygiene.test.ts"
      provides: "Extended scanned-files list (frameBridge, frameMount, reactEmbed.generated, SandboxFrame) + the context-aware iframe/sandbox/isolation user-copy gate"
      contains: "frameBridge.ts"
  key_links:
    - from: "playwright.config.ts"
      to: "the dev server / built preview"
      via: "webServer config launching vite preview for the e2e run"
      pattern: "webServer"
    - from: "src/hygiene.test.ts"
      to: "the new Phase 20 source surfaces"
      via: "the scanned-files assertion array + the user-visible-copy regex"
      pattern: "frameMount.ts|SandboxFrame.tsx"
---

<objective>
Prove the real frame round-trip in a browser (SANDBOX-05) and lock the security + hygiene guarantees as CI assertions. Add Playwright as a devDependency (the one allowed exception to zero-new-deps — runtime bundle untouched). Write the browser integration test (render, theme-in-frame, localStorage SecurityError, forged-message drop) plus the JSDOM-runnable security assertions (sandbox attr never allow-same-origin, srcdoc no /sk-ant/, __proto__ no pollution). Extend the HYGIENE-07 lexicon gate to scan the new Phase 20 surfaces with the context-aware iframe/sandbox/isolation user-copy carve-out.

Purpose: SANDBOX-05 (the in-tree fallback already keeps 761 tests green from Plan 04; this plan adds the Playwright proof of the real round-trip that JSDOM cannot run) and HYGIENE-07 (the largest new devtools-visible surface — frameBridge/frameMount/SandboxFrame/srcdoc — must not leak the mechanic lexicon NOR the words iframe/sandbox/isolation into any user-visible copy).

Output: `playwright.config.ts` + `e2e/frame-isolation.spec.ts` + the `@playwright/test` devDependency + npm script; `src/ui/SandboxFrame.security.test.tsx` (CI sandbox-attr + no-/sk-ant/ + __proto__ assertions); extended `src/hygiene.test.ts`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/20-opaque-origin-frame-isolation/20-CONTEXT.md
@.planning/phases/20-opaque-origin-frame-isolation/20-PATTERNS.md

<interfaces>
<!-- Extracted from the codebase + Plans 01-04. Use directly. -->

From src/hygiene.test.ts (the gate to extend — the scanned-files assertion + the BANNED set + the D-40 context-aware carve-out precedent):
```typescript
const BANNED = [ /synthesi[sz]/i, /\bfake\b/i, /\bmock\b/i, /\bAI\b/, /\bllm\b/i, /\bgenerat(e|ed|ing)\b/i ];
// the existing scanned-files assertion (lines 158-183) lists each new surface by repo-relative path:
for (const file of [ "src/ui/DesktopShell.tsx", /* ... */ "src/ui/sanitizeDisplayName.ts" ]) {
  expect(scanned).toContain(file);
}
// SELF_PATH excludes the gate file from its own scan. DEPENDENCY_ALLOWLIST strips known 3rd-party tokens per line.
```

From src/csp.test.ts (the FOUC/CSP hash invariant — relevant ONLY if index.html changes; it should NOT in this phase):
```typescript
// sha256Source(inlineScriptBody(html)) must appear in the script-src directive.
// The srcdoc lives in frameMount.ts and is delivered as a React attribute, NOT in index.html,
// so the parent index.html FOUC script + csp hash are UNCHANGED by Phase 20.
```

From src/execution/frameMount.ts (Plan 02 — buildSrcdoc for the JSDOM security assertions):
```typescript
export function buildSrcdoc(transpiledJS: string, themeVars: Record<string, string>, parentOrigin: string): string;
```

From src/ui/SandboxFrame.tsx (Plan 03 — the rendered iframe for the sandbox-attr assertion):
```tsx
<iframe sandbox="allow-scripts" srcdoc={...} />
```

From package.json (current scripts: dev/build/preview/test/test:ui/typecheck; "test": "vitest run"):
```json
"scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview", "test": "vitest run", "typecheck": "tsc --noEmit" }
```
</interfaces>

<hygiene_07_nuance>
<!-- THE precise HYGIENE-07 requirement (from 20-CONTEXT.md + planning context + 20-PATTERNS.md lines 494-524). -->
- The words "iframe", "sandbox", "isolation" are LEGITIMATE internal code identifiers: the JSX `<iframe sandbox="allow-scripts">`, the component name `SandboxFrame`, the file names `frameBridge`/`frameMount`. A bare repo-wide regex banning these three words WOULD FALSE-POSITIVE on the new files' own JSX/identifiers.
- The gate must therefore distinguish USER-VISIBLE string literals / DOM text / console copy / aria-labels from INTERNAL identifiers — mirror the existing D-40 context-aware carve-out (the same precedent that lets `generate*` live in internal identifiers but bans it in CSS/HTML/string-literals/comments).
- Concretely: do NOT add `/iframe|sandbox|isolation/` to the repo-wide BANNED set. Instead add a SEPARATE, narrower check that flags these three words only when they appear inside a quoted user-facing string literal that is rendered to the DOM / aria-label / console — and assert (as a positive test) that the new Phase 20 files contain ZERO such occurrences in user-visible copy while their identifiers/JSX attributes remain unflagged.
- ALSO add the new files to the existing scanned-files assertion so the standard mechanic-lexicon (synthesi/fake/mock/AI/llm/generate) gate covers them.
</hygiene_07_nuance>

<playwright_decision>
<!-- The pending-todo resolution (STATE.md line 135): Playwright vs alternative. -->
- Decision: use @playwright/test as a devDependency (CONTEXT.md + ROADMAP both pre-approve this single exception). Rationale: it is the standard browser-native harness, runs a real Chromium opaque-origin frame (JSDOM cannot), and is pruned from the runtime bundle (zero runtime-dep impact). 
- Config: `playwright.config.ts` with a `webServer` launching `vite preview` (or `vite dev`) against the built host, `testDir: "e2e"`, Chromium project only (sufficient for the opaque-origin assertions). Add `"e2e": "playwright test"` to package.json scripts. Do NOT add Playwright to the vitest `include` (keep the two runners separate — vitest stays the 761-test JSDOM suite).
</playwright_decision>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Playwright devDependency + config + the real frame round-trip spec (SANDBOX-05)</name>
  <read_first>
    - package.json (scripts + devDependencies — add @playwright/test as devDep + the "e2e" script)
    - vite.config.ts (build/preview config the webServer launches)
    - src/ui/SandboxFrame.tsx (Plan 03 — the rendered frame the e2e drives)
    - src/ui/DesktopShell.tsx (the open flow the e2e exercises in iframe mode)
    - .planning/phases/20-opaque-origin-frame-isolation/20-CONTEXT.md lines 49-52 (Playwright proves: renders, theme-in-frame, localStorage SecurityError, forged-message drop)
    - .planning/research/SUMMARY.md lines 287-294 (the four browser assertions required)
  </read_first>
  <action>
    Add `@playwright/test` to package.json `devDependencies` and a `"e2e": "playwright test"` script; install it (`npm install`). Create `playwright.config.ts`: `testDir: "e2e"`, Chromium project, a `webServer` block running the built host (`npm run build && npm run preview` or `vite preview --port 4173`) with `url` + `reuseExistingServer`. Because production defaults `frameMode: "iframe"` (Plan 04), the previewed build already renders app bodies in real opaque-origin frames — no special test build needed; a pre-seeded app (e.g. the counter seed) opens without a model call (cache/seed path) so the e2e needs no API key. Create `e2e/frame-isolation.spec.ts` with one spec opening a seeded app and asserting the four SANDBOX-05 facts: (1) RENDER — the app's content is visible inside the frame (locate the iframe via `frameLocator`, assert a known seed element renders); (2) THEME-IN-FRAME — switch the menu-bar theme and assert the frame's `:root` (inside the frameLocator) reflects a changed CSS var (read `getComputedStyle(documentElement).getPropertyValue('--text')` inside the frame via `frame.evaluate`); (3) LOCALSTORAGE — `await frame.evaluate(() => { try { localStorage.getItem('x'); return 'no-error'; } catch (e) { return e.name; } })` returns `"SecurityError"`; (4) FORGED DROP — `await page.evaluate(() => window.postMessage({ type:'FRAME_RESIZE', payload:{height:9999} }, '*'))` from the PARENT context (wrong source) does NOT change the iframe height (assert height unchanged after the forged post). Keep all e2e assertion copy neutral (no banned tokens / no iframe/sandbox/isolation in any string the test renders — internal Playwright API calls like `frameLocator` are test code, not shipped surface, and are fine).
  </action>
  <verify>
    <automated>npx playwright install chromium && npm run build && npx playwright test e2e/frame-isolation.spec.ts</automated>
  </verify>
  <acceptance_criteria>
    - `package.json` devDependencies contain `@playwright/test`; scripts contain `"e2e"`.
    - `playwright.config.ts` exists with `testDir: "e2e"` and a `webServer` block (source assertions).
    - `e2e/frame-isolation.spec.ts` contains `SecurityError` and `frameLocator` (source assertions) and asserts all four facts.
    - `npx playwright test e2e/frame-isolation.spec.ts` exits 0 (the real round-trip passes in Chromium).
    - The runtime bundle is unaffected: `npm run build` succeeds and `@playwright/test` is a devDependency only.
  </acceptance_criteria>
  <done>Playwright is a devDependency; the browser spec proves the real frame renders, theme vars apply inside the frame, localStorage throws SecurityError, and a forged parent-context postMessage is dropped.</done>
</task>

<task type="tdd" tdd="true">
  <name>Task 2: RED+GREEN — JSDOM CI security assertions (sandbox attr, no /sk-ant/, __proto__ no pollution)</name>
  <read_first>
    - src/ui/SandboxFrame.tsx (Plan 03 — the rendered iframe + sandbox attr)
    - src/execution/frameMount.ts (Plan 02 — buildSrcdoc)
    - src/execution/frameBridge.ts (Plan 01 — parseSafe / dispatchInbound for the __proto__ assertion)
    - .planning/phases/20-opaque-origin-frame-isolation/20-CONTEXT.md lines 80-81 (the three CI assertions)
  </read_first>
  <behavior>
    - Test (SANDBOX ATTR): rendering SandboxFrame, the mounted `<iframe>`'s `getAttribute("sandbox")` does NOT contain `"allow-same-origin"` (and equals `"allow-scripts"`). This is a standing CI guard that fails loudly if anyone ever adds allow-same-origin.
    - Test (NO KEY IN SRCDOC): `buildSrcdoc("const App=()=>null;", { "--text":"#fff" }, "https://host.test")` returns a string that does NOT match `/sk-ant/`; additionally rendering SandboxFrame, `iframeEl.getAttribute("srcdoc")` does NOT match `/sk-ant/`.
    - Test (PROTOTYPE POLLUTION): feeding a forged inbound payload `JSON.parse('{"__proto__":{"polluted":true},"type":"FRAME_RESIZE","payload":{"height":1}}')` through the SandboxFrame message handler (origin "null", source = the mocked contentWindow) leaves `({} as Record<string,unknown>).polluted === undefined` afterward (the parseSafe defense holds end-to-end through the component, not just the bridge unit).
  </behavior>
  <action>
    Create `src/ui/SandboxFrame.security.test.tsx`. Render SandboxFrame (with `frameMode` irrelevant — it renders the iframe directly) and assert the sandbox attribute (`expect(iframe.getAttribute("sandbox")).toBe("allow-scripts")` and `.not.toContain("allow-same-origin")`). Assert `buildSrcdoc(...)` output and the rendered `srcdoc` attribute do not match `/sk-ant/` (construct a srcdoc and `expect(srcdoc).not.toMatch(/sk-ant/)`). For the prototype-pollution end-to-end assertion, dispatch the forged `message` event at the component's window listener (mock `iframeRef.current.contentWindow` so `event.source ===` it and `event.origin === "null"`) and assert `({}).polluted === undefined` after. These are the standing CI security guards (they run in the normal `npm test` JSDOM suite, NOT Playwright).
  </action>
  <verify>
    <automated>npx vitest run src/ui/SandboxFrame.security.test.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `src/ui/SandboxFrame.security.test.tsx` contains `allow-same-origin`, `/sk-ant/`, and `__proto__` / `polluted` (source assertions of the three guards).
    - The sandbox-attr guard asserts the attr equals "allow-scripts" and never contains "allow-same-origin".
    - The srcdoc guard asserts no `/sk-ant/` match in both `buildSrcdoc` output and the rendered attribute.
    - The prototype-pollution guard asserts `({}).polluted === undefined` after a forged inbound payload.
    - `npx vitest run src/ui/SandboxFrame.security.test.tsx` exits 0.
  </acceptance_criteria>
  <done>The three standing JSDOM CI security guards (sandbox never allow-same-origin, srcdoc no /sk-ant/, __proto__ no pollution end-to-end) pass and will fail loudly on any future regression.</done>
</task>

<task type="tdd" tdd="true">
  <name>Task 3: RED+GREEN — HYGIENE-07 lexicon gate extension (scan new files + context-aware iframe/sandbox/isolation user-copy carve-out)</name>
  <read_first>
    - src/hygiene.test.ts (full file — the BANNED set, DEPENDENCY_ALLOWLIST, the scanned-files assertion lines 158-183, the D-40 carve-out note lines 30-45)
    - src/execution/frameBridge.ts, src/execution/frameMount.ts, src/ui/SandboxFrame.tsx, src/execution/reactEmbed.generated.ts (the new surfaces to scan — confirm they carry zero banned tokens and zero iframe/sandbox/isolation in user-visible copy)
    - .planning/phases/20-opaque-origin-frame-isolation/20-PATTERNS.md lines 494-524 (the exact gate-extension guidance + the no-bare-regex warning)
    - The `<hygiene_07_nuance>` block above (the precise context-aware requirement)
  </read_first>
  <behavior>
    - Test: the scanned-files assertion now includes `src/execution/frameBridge.ts`, `src/execution/frameMount.ts`, `src/ui/SandboxFrame.tsx`, and `src/execution/reactEmbed.generated.ts` — each asserted present in the walked set.
    - Test: the standard mechanic-lexicon scan (the existing `scan()`) returns ZERO violations across the whole tree INCLUDING the new files (the new files must be authored mechanism-free; reactEmbed.generated.ts must not contain banned tokens — verify the embedded React production source has none, or allowlist any unavoidable benign substring exactly as DEPENDENCY_ALLOWLIST does for fake-indexeddb).
    - Test (USER-COPY CARVE-OUT): a new focused check asserts the words "iframe"/"sandbox"/"isolation" appear in ZERO user-visible string contexts in the Phase 20 files — defined as: quoted string literals passed to DOM text, aria-label, title attributes, console/logger calls, or rendered JSX text — while NOT flagging the internal JSX attribute `sandbox="allow-scripts"`, the component identifier `SandboxFrame`, or the module identifiers. The check must PASS on the current files (proving the carve-out distinguishes correctly) and would FAIL if someone added e.g. `<p>This runs in a sandbox</p>` or `aria-label="isolation frame"`.
  </behavior>
  <action>
    Extend `src/hygiene.test.ts`. (1) Add the four new files to the scanned-files `for...of` array (mirror the existing entries with neutral comments). (2) Confirm the standard `scan()` is clean over the new files; if `reactEmbed.generated.ts` contains an unavoidable benign banned substring from React's own source, add a SURGICAL `DEPENDENCY_ALLOWLIST` entry (exact token only, with a comment naming it as React-vendor source) — do NOT weaken a word boundary. (3) Add a NEW describe block "HYGIENE-07: iframe/sandbox/isolation absent from user-visible copy". Implement a narrow scanner that, for the Phase 20 source files only, extracts candidate user-visible strings — match (a) JSX text nodes, (b) values of `aria-label=`/`title=`/`alt=` attributes, (c) string-literal arguments to `logger.*`/`console.*`, and (d) string literals assigned to known copy constants — and asserts none contain `/\b(iframe|sandbox|isolation)\b/i`, while EXPLICITLY excluding the `sandbox="allow-scripts"` HTML attribute, identifier tokens, and import paths. Keep the implementation conservative: it is acceptable to scan for these three words ONLY inside double/single-quoted strings that are NOT immediately preceded by `sandbox=` and NOT part of an import/identifier — mirror the D-40 carve-out spirit (ban in copy, allow in identifiers). Assert the gate PASSES on the current Phase 20 files (positive proof the carve-out is correct). NOTE on csp.test.ts: do NOT touch index.html or the FOUC script — the srcdoc lives in frameMount.ts and is delivered as a React attribute, so the csp.test.ts hash is unaffected; only recompute the hash IF (and the executor must confirm it did not) index.html changed.
  </action>
  <verify>
    <automated>npx vitest run src/hygiene.test.ts src/csp.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `src/hygiene.test.ts` contains `frameBridge.ts`, `frameMount.ts`, `SandboxFrame.tsx`, and `reactEmbed.generated.ts` in the scanned-files assertion (source assertions).
    - The standard mechanic-lexicon `scan()` returns zero violations including the new files.
    - The new "HYGIENE-07" describe block passes: iframe/sandbox/isolation absent from user-visible copy in the Phase 20 files, while the internal `sandbox="allow-scripts"` attribute and `SandboxFrame` identifier are NOT flagged.
    - `src/csp.test.ts` still passes unchanged (index.html FOUC script + hash untouched — confirm no index.html change was needed).
    - `npx vitest run src/hygiene.test.ts src/csp.test.ts` exits 0.
  </acceptance_criteria>
  <done>The lexicon gate scans every new Phase 20 surface for the mechanic lexicon AND enforces the context-aware iframe/sandbox/isolation user-copy ban without false-positiving on internal identifiers; the csp/FOUC hash invariant is untouched.</done>
</task>

<task type="auto">
  <name>Task 4: Full vitest suite green + tsc clean + e2e green (phase gate)</name>
  <read_first>
    - package.json (the test + e2e scripts)
    - src/hygiene.test.ts, src/ui/SandboxFrame.security.test.tsx, e2e/frame-isolation.spec.ts (the new test deliverables)
  </read_first>
  <action>
    Run the full vitest JSDOM suite (`npm test`) + tsc + the Playwright e2e as the Phase 20 exit gate. The vitest suite is the 761 in-tree tests (Plan 04 invariant) plus all new Phase 20 unit/RTL/security/hygiene tests; it MUST be green with no real browser. The Playwright e2e is the separate real-browser proof. Confirm `npm run build` produces a clean, sourcemap-free production bundle (existing vite.config sourcemap:false) and that `@playwright/test` is dev-only (not in the built bundle). Fix any residual tsc/lint issues without weakening any security assertion. This is the flagship-phase gate — every SANDBOX-01..06 + HYGIENE-07 acceptance must be green here.
  </action>
  <verify>
    <automated>npm test && npx tsc --noEmit && npm run build && npx playwright test</automated>
  </verify>
  <acceptance_criteria>
    - `npm test` (vitest JSDOM) exits 0 with the full suite green (>=761 prior + all new Phase 20 tests).
    - `npx tsc --noEmit` exits 0.
    - `npm run build` exits 0 with `build.sourcemap: false` (no source maps in dist).
    - `npx playwright test` exits 0 (the real frame round-trip passes).
    - `@playwright/test` is in devDependencies only; the runtime bundle carries no new dependency.
  </acceptance_criteria>
  <done>The full JSDOM suite, the typechecker, the clean sourcemap-free build, and the Playwright real-browser proof all pass — the Phase 20 security + hygiene gate is green end-to-end.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CI gate -> shipped artifact | The CI assertions are the enforcement that the sandbox attr, the no-key srcdoc, and the prototype-pollution defense cannot silently regress |
| real browser frame -> parent (Playwright) | The e2e is the only place the real opaque-origin guarantees (localStorage SecurityError, forged-drop) are observable |
| authored source -> devtools-visible surface | The hygiene gate enforces no mechanic lexicon and no iframe/sandbox/isolation in user copy |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-19 | Elevation of Privilege | future allow-same-origin regression | mitigate | standing CI test asserts sandbox attr never contains allow-same-origin (Task 2) + Playwright asserts localStorage SecurityError (Task 1) |
| T-20-20 | Information Disclosure | key baked into srcdoc regression | mitigate | standing CI test asserts srcdoc no /sk-ant/ (Task 2) |
| T-20-21 | Tampering | prototype pollution regression | mitigate | standing end-to-end CI test asserts __proto__ payload leaves ({}).polluted undefined (Task 2) |
| T-20-22 | Spoofing | forged postMessage accepted | mitigate | Playwright asserts a forged parent-context post is dropped (Task 1) + the JSDOM forged-drop tests (Plan 03) |
| T-20-23 | Information Disclosure | mechanic/iframe lexicon leaking to devtools | mitigate | extended hygiene gate scans the new surfaces + context-aware user-copy ban (Task 3) |
| T-20-24 | Tampering | Playwright entering the runtime bundle | mitigate | @playwright/test is a devDependency; `npm run build` verified to carry no new runtime dep |
</threat_model>

<verification>
- `e2e/frame-isolation.spec.ts` proves render + theme-in-frame + localStorage SecurityError + forged-drop in real Chromium.
- `src/ui/SandboxFrame.security.test.tsx` asserts sandbox never allow-same-origin, srcdoc no /sk-ant/, __proto__ no pollution (JSDOM CI).
- `src/hygiene.test.ts` scans the new files + enforces the iframe/sandbox/isolation user-copy carve-out; `src/csp.test.ts` unchanged.
- `npm test`, `npx tsc --noEmit`, `npm run build`, `npx playwright test` all exit 0.
</verification>

<success_criteria>
- The real frame round-trip is proven in a browser (SANDBOX-05).
- The three security guarantees are standing CI assertions that fail loudly on regression.
- The hygiene gate covers every new Phase 20 surface with the context-aware iframe/sandbox/isolation user-copy ban (HYGIENE-07).
- The 761 in-tree tests remain green with no real browser; Playwright is dev-only; the build is sourcemap-free.
</success_criteria>

<output>
After completion, create `.planning/phases/20-opaque-origin-frame-isolation/20-05-SUMMARY.md`.
</output>
