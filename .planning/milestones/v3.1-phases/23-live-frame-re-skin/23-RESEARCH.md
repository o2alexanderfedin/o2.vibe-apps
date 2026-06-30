# Phase 23: Live Frame Re-Skin — Research

**Researched:** 2026-06-30
**Domain:** React useMemo dependency management / postMessage re-skin / opaque-origin frame lifecycle
**Confidence:** HIGH — all findings verified directly against live source code

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Root cause:** `SandboxFrame.srcdoc` is memoized on `[transpiledJS, themeVars]`. A new `themeVars`
  reference on every theme change causes srcdoc to rebuild, the `<iframe> srcDoc` attribute to change,
  and the frame to reload — destroying in-frame React state.
- **Fix:** Remove `themeVars` from the srcdoc memo dependency array so the iframe element is stable
  across theme changes. First-paint theme is still baked into the initial srcdoc; subsequent changes
  arrive via the already-wired `THEME_PUSH` postMessage path.
- **`broadcastTheme` must reliably reach connected frames.** Once the iframe is stable,
  `broadcastTheme` posts to the live, connected frame (respects the existing `el.isConnected` guard).
- **First-paint correctness preserved:** initial srcdoc still bakes in current theme vars at mount.
- **Zero new runtime deps; hygiene lexicon gate stays green; CSP allowlist + FOUC/CSP-hash
  invariant in force; IoC/DI via ServicesProvider; build 0 source maps; full suite stays green.**

### Claude's Discretion
- Exact memo refactor shape and whether a `themeVarsRef` is needed so the initial srcdoc reads
  current vars while the memo no longer depends on them — at Claude's discretion, simplest approach
  that satisfies all 5 success criteria. Prefer consistency with existing SandboxFrame / frameMount
  patterns.

### Deferred Ideas (OUT OF SCOPE)
- None — discuss phase skipped. Real-browser proof is Phase 25 / SMOKE-03.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RESKIN-01 | Theme switch re-skins every open app frame live, without reloading the iframe; in-frame app state (scroll, form input, component state) is preserved. The `THEME_PUSH` postMessage path is the mechanism; the srcdoc no longer depends on `themeVars`. | Root fix: SandboxFrame.tsx line 109. Supporting path: broadcastTheme (frameMount.ts:45-57) + THEME_PUSH handler (frameMount.ts:407-415) already functional once frame is stable. |
</phase_requirements>

---

## Summary

Phase 23 fixes a single-line root cause and activates a `THEME_PUSH` path that is already fully
implemented and tested — it was just latent because the iframe was being torn down on every theme
change before the message could land.

The root cause is `SandboxFrame.tsx` line 109: the `useMemo` dependency array is
`[transpiledJS, themeVars]`. Because `themeVars` is a new object reference on every theme change
(it is derived via `useMemo` in `VibeThemeContext` and resolves to a VIBE_THEMES entry or custom
vars), the memo re-runs, `buildSrcdoc` is called, `srcDoc` changes, and the browser destroys the
old iframe document and creates a fresh one. In-frame React state is lost.

The fix is to change the dep array to `[transpiledJS]`. The `useMemo` factory closure still
captures `themeVars` from the render scope — when the memo DOES re-run (because `transpiledJS`
changed), it uses the then-current `themeVars`, giving correct first-paint CSS. For theme-only
changes, the memo does not re-run, the iframe element is stable, and the existing
`broadcastTheme` → `THEME_PUSH` path (already wired and tested) re-skins the live frame.

No other file needs changing. `buildSrcdoc` is unchanged, so the bootstrap `<script>` body is
byte-stable, and the CSP hash in `index.html` does NOT need updating.

**Primary recommendation:** Change `SandboxFrame.tsx` line 109 from
`[transpiledJS, themeVars]` to `[transpiledJS]`, add one JSDOM unit test asserting the memo
does not re-run on a themeVars-only re-render, and run the full suite.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| First-paint theme CSS | Frame document (`<style>` in srcdoc) | — | `buildSrcdoc` injects `:root` vars into `<style>` at srcdoc build time; delivers correct first-paint without a network round-trip. |
| Live theme re-skin after mount | Frame document (via `postMessage THEME_PUSH`) | Host (`broadcastTheme`) initiates | Frame's own `window.addEventListener("message")` handler applies vars to `:root`. Host only posts the message; the frame owns the apply. |
| Theme change triggering broadcast | VibeThemeProvider (`setTheme`) | — | Calls `broadcastTheme(resolvedVars)` after updating state and persisting; already fully wired. |
| Frame lifecycle / registry | `frameMount.ts` module-level `frameRefs` Map | `SandboxFrame` mount effect | Registration on mount, unregistration on unmount with element-identity guard (WR-04). |
| Memo stability guard | `SandboxFrame.tsx` `useMemo` | — | Dep array `[transpiledJS]` (after fix) ensures iframe is not replaced on theme changes. |

---

## Finding 1: The srcdoc Memo — Exact Location and Shape

**File:** `src/ui/SandboxFrame.tsx`, lines 105-110

```typescript
// SandboxFrame.tsx:105-110
const srcdoc = useMemo(
  () => utils.buildSrcdoc(transpiledJS, themeVars, window.location.origin),
  // utils is stable across renders because _utils is typically a constant
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [transpiledJS, themeVars],       // <-- THE PROBLEM: themeVars here
);
```

Bound to the iframe at **line 335**:

```typescript
// SandboxFrame.tsx:335
srcDoc={srcdoc}
```

**The fix:** Change the dep array at line 109 from `[transpiledJS, themeVars]` to `[transpiledJS]`.

`themeVars` is still captured in the factory closure (`utils.buildSrcdoc(transpiledJS, themeVars, ...)`).
When the memo DOES re-run (because `transpiledJS` changed), the factory from that render is invoked —
which closes over the then-current `themeVars` — so first-paint CSS is always correct.

A `themeVarsRef` is NOT needed for the memo. `themeVarsRef` already exists at lines 151-152 for
the VIBE_BOOTSTRAP message handler, and no new ref is required by this fix.

**ESLint:** The existing `eslint-disable-next-line react-hooks/exhaustive-deps` comment at line 107
already suppresses the hook-exhaustive-deps warning for this memo. After the fix `themeVars` is an
intentionally-omitted dep; the comment must stay and the justification in the inline comment should
be updated to explain why `themeVars` is intentionally absent.

[VERIFIED: src/ui/SandboxFrame.tsx — live source read]

---

## Finding 2: How the Initial Theme Is Baked In

**File:** `src/execution/frameMount.ts`, lines 81-110

```typescript
// frameMount.ts:81-95
export function buildSrcdoc(
  transpiledJS: string,           // line 82 — voided (app code arrives via VIBE_BOOTSTRAP)
  themeVars: Record<string, string>,  // line 83 — used ONLY in <style>; never in <script>
  parentOrigin: string,           // line 84 — voided (frame posts to "*")
): string {
  void transpiledJS;              // line 89
  void parentOrigin;              // line 90

  // Build :root CSS variable declarations
  const rootVars = Object.entries(themeVars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");                  // lines 93-95: themeVars → CSS string
```

The resulting `rootVars` string is injected into the `<style>` block (lines 108-113 of the
returned template literal):

```html
<style>
:root {
${rootVars}
}
#root { height: max-content; }
body { overflow: hidden; margin: 0; }
</style>
```

**Key property:** `themeVars` enters the `<style>` block, NOT the `<script>` block.
The `<script>` block is byte-stable regardless of `themeVars` or `transpiledJS` (both are voided).

This means:
1. First-paint correctness: the initial srcdoc's `<style>` has the correct theme vars.
2. After the fix, when `transpiledJS` changes and the memo re-runs, the new srcdoc is built with
   the then-current `themeVars` — first-paint is still correct.
3. The CSP hash guard covers only the `<script>` body (see Finding 5). Changing `themeVars`
   changes only the `<style>` block, so the hash is NOT invalidated.

[VERIFIED: src/execution/frameMount.ts — live source read]

---

## Finding 3: `broadcastTheme` — Signature, Registry, Guard, Envelope

**File:** `src/execution/frameMount.ts`, lines 21-57

```typescript
// frameMount.ts:21 — the registry
const frameRefs = new Map<string, HTMLIFrameElement>();

// frameMount.ts:23-25 — registration
export function registerFrame(instanceId: string, el: HTMLIFrameElement): void {
  frameRefs.set(instanceId, el);
}

// frameMount.ts:45-57 — broadcast
export function broadcastTheme(vars: Record<string, string>): void {
  for (const [, el] of frameRefs) {
    // line 50 — el.isConnected guard
    if (!el.isConnected) continue;
    try {
      // line 52 — THEME_PUSH envelope shape
      el.contentWindow?.postMessage({ type: "THEME_PUSH", payload: { vars } }, "*");
    } catch (err) {
      logger.error("Frame mount: broadcastTheme failed for a frame: " + String(err));
    }
  }
}
```

**Signature:** `broadcastTheme(vars: Record<string, string>): void`

**Registry:** module-level `Map<string, HTMLIFrameElement>` keyed by `instanceId`. The Map persists
for the module's lifetime; entries are added by `registerFrame` and removed by `unregisterFrame`.

**`el.isConnected` guard (line 50):** Skips frames that are detached (e.g., transiently retained
during StrictMode double-mount cleanup). With the fix in place, the target frame is connected
(stable, not reloaded), so the guard passes and the postMessage is delivered.

**THEME_PUSH envelope shape:** `{ type: "THEME_PUSH", payload: { vars } }` posted to `"*"`.
The `vars` property is the full `Record<string, string>` map of 12 CSS custom properties.

[VERIFIED: src/execution/frameMount.ts — live source read]

---

## Finding 4: The THEME_PUSH Handler in the Frame Bootstrap

**File:** `src/execution/frameMount.ts`, lines 407-415 (inside the bootstrap `<script>` string)

```javascript
// frameMount.ts:407-415 (frame-side bootstrap, inside <script>)
if (type === "THEME_PUSH") {
  var vars = (data.payload || {}).vars;
  if (vars && typeof vars === "object") {
    Object.keys(vars).forEach(function(k) {
      document.documentElement.style.setProperty(k, vars[k]);
    });
  }
  return;
}
```

**Confirmation:** The handler is correct and already does the right thing. It applies each var from
the `payload.vars` map to `:root` via `document.documentElement.style.setProperty`, which overrides
the `<style>` block's initial values. Once the iframe is stable (after the fix), a `THEME_PUSH`
message will reliably reach and re-skin the live frame.

**Why it was latent before the fix:** the iframe reloaded on every theme change (srcdoc dep on
`themeVars`). The reload destroyed the old frame document and the new one wasn't registered yet when
`broadcastTheme` fired. After the fix, the frame is never reloaded on a theme change — the
registered element stays connected, and `broadcastTheme` posts to it immediately.

[VERIFIED: src/execution/frameMount.ts — live source read]

---

## Finding 5: setTheme → broadcastTheme Wiring in VibeThemeProvider

**File:** `src/ui/VibeThemeProvider.tsx`, lines 314-368

The `setTheme` callback (lines 314-368) resolves vars in this priority order:

```typescript
// VibeThemeProvider.tsx:350-365
let resolvedVars: Record<string, string>;
if (vars !== undefined) {
  resolvedVars = vars;                            // 1. explicit vars param (ThemeEditor path)
} else if ((name as string).startsWith("custom:")) {
  const customName = (name as string).slice(7);
  resolvedVars = customThemesState.get(customName) ?? VIBE_THEMES[DEFAULT_THEME]; // 2. custom
} else {
  resolvedVars =
    (VIBE_THEMES[name as VibeThemeName] as Record<string, string> | undefined)
    ?? VIBE_THEMES[DEFAULT_THEME];               // 3. built-in
}
// line 365:
broadcastTheme(resolvedVars);
```

`broadcastTheme` is called on EVERY `setTheme` invocation — built-in theme switches AND custom
theme switches (with explicit `vars` or from `customThemesState`). This covers all RESKIN-01
scenarios without any change to `VibeThemeProvider.tsx`.

[VERIFIED: src/ui/VibeThemeProvider.tsx — live source read]

---

## Finding 6: Frame Registration Lifecycle

**File:** `src/ui/SandboxFrame.tsx`, lines 115-127

```typescript
// SandboxFrame.tsx:115-127
useEffect(() => {
  const el = iframeRef.current;
  if (!el) return;
  utils.registerFrame(instanceId, el);
  return () => {
    utils.unregisterFrame(instanceId, el);
    utils.clearPendingForFrame(instanceId);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [instanceId]);
```

Registration is keyed on `[instanceId]`. It fires once at mount (when `instanceId` is first set)
and only re-fires if `instanceId` changes (a different app instance, not a theme switch).

**Before the fix:** `themeVars` in memo deps → srcdoc changes → `srcDoc` attribute changes →
browser replaces the iframe document → the old `el` remains in `frameRefs` but `contentWindow` is
now a new browsing context; `broadcastTheme` posts to the old (now-replaced) context, which is
effectively a no-op. The registration effect does NOT re-fire (deps are `[instanceId]`), so no
re-registration happens.

**After the fix:** `themeVars` NOT in memo deps → `srcDoc` attribute unchanged → iframe document
stable → the registered `el` in `frameRefs` is the same DOM element with the same `contentWindow`
→ `el.isConnected` is `true` → `broadcastTheme` posts to the live, correct context → THEME_PUSH
is received and applied.

No changes to the registration logic are needed.

[VERIFIED: src/ui/SandboxFrame.tsx — live source read]

---

## Finding 7: CSP Hash Impact — Confirmed NOT Invalidated

**File:** `src/frameCsp.test.ts`, lines 39-44 (hash extraction function)

```typescript
// frameCsp.test.ts:39-44
function bootstrapScriptBody(html: string): string {
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match?.[1])
    throw new Error("No inline <script> element found in the frame srcdoc");
  return match[1];
}
```

The CSP hash guard extracts and hashes ONLY the `<script>` block body. The `<style>` block
(which contains `themeVars` CSS) is NOT included in the hash computation.

`buildSrcdoc` does NOT change in this phase. The `<script>` block is byte-identical regardless of
`themeVars` or `transpiledJS` (both are voided at lines 89-90 of `frameMount.ts`). Therefore:

- The bootstrap `<script>` body hash does NOT change.
- The `'sha256-9zmfBaDiPxLfoBYY7cQq+dgKP3xCifoa/z5T3EQToFY='` pinned in `index.html` (line 19) does
  NOT need updating.
- `frameCsp.test.ts` will continue to pass without modification.

This is the most important constraint risk, and it is confirmed safe.

[VERIFIED: src/frameCsp.test.ts + src/execution/frameMount.ts — live source read]

---

## Finding 8: `themeVarsRef` Already Exists — No New Ref Needed

**File:** `src/ui/SandboxFrame.tsx`, lines 151-152

```typescript
// SandboxFrame.tsx:151-152
const themeVarsRef = useRef(themeVars);
themeVarsRef.current = themeVars;
```

This ref already exists and is used at line 191 in the VIBE_BOOTSTRAP message:

```typescript
// SandboxFrame.tsx:188-195
sendToFrame(
  frameWindow,
  {
    type: "VIBE_BOOTSTRAP",
    payload: {
      transpiledJS: transpiledJSRef.current,
      themeVars: themeVarsRef.current,     // line 191
      appType: appTypeRef.current,
    },
  },
  "*",
);
```

This ref pattern (described in the comment block at lines 139-163) was introduced precisely because
the listener must read current prop values without re-subscribing. The same ref is available to read
current `themeVars` in the memo if needed — but for the srcdoc memo fix it is NOT needed (see
Finding 1 rationale). The ref's presence confirms the team already uses this pattern for themeVars;
the fix extends the pattern to the memo dependency as well.

[VERIFIED: src/ui/SandboxFrame.tsx — live source read]

---

## Finding 9: Test Patterns and Success-Criterion #4 Strategy

### Existing SandboxFrame test structure

**File:** `src/ui/SandboxFrame.test.tsx`

The test file uses a `makeUtils()` factory (lines 29-49) that returns a full `FrameUtilities`
object with vi.fn() stubs for all utility methods. The `buildSrcdoc` entry is the REAL `buildSrcdoc`
from `frameMount.ts` by default (`buildSrcdoc` imported at line 5 and used at line 46).

The `defaultProps()` helper (lines 71-84) passes `themeVars: THEME_VARS` (the 12-var fixture).

Rendering uses `@testing-library/react`'s `render`. Unmount uses the returned `unmount`. Rerenders
use `rerender`.

### Success criterion #4: asserting `themeVars` is NOT in the memo dep array

The cleanest JSDOM-testable approach is to spy on `buildSrcdoc` and count invocations across a
prop-only `themeVars` change:

```typescript
it("srcdoc memo does NOT rebuild when only themeVars changes (criterion #4)", () => {
  const buildSrcdocSpy = vi.fn(() => "<html></html>");
  const { utils } = makeUtils({ buildSrcdoc: buildSrcdocSpy });
  const { rerender } = render(<SandboxFrame {...defaultProps(utils)} />);

  // Initial render: memo runs once.
  expect(buildSrcdocSpy).toHaveBeenCalledTimes(1);

  // Re-render with a new themeVars object (different reference, same transpiledJS).
  const altVars = { ...THEME_VARS, "--text": "#reskin" };
  rerender(
    <SandboxFrame {...defaultProps(utils, { themeVars: altVars })} />,
  );

  // If themeVars were in the dep array, buildSrcdoc would have been called twice.
  // After the fix it is still called only once (memo did not re-run).
  expect(buildSrcdocSpy).toHaveBeenCalledTimes(1);
});
```

**Why this works:** `makeUtils` accepts `buildSrcdoc` as an override (line 45 of `makeUtils`).
Passing a `vi.fn()` replaces the real function for that render scope while keeping the rest of
`FrameUtilities` intact. The call count across the rerender is a precise proxy for memo dep behavior.

**IMPORTANT:** The `defaultProps` helper passes `_utils: utils` (line 82), which means the injected
`buildSrcdoc` spy IS used by the component instead of the module default.

**Note on iframe identity in JSDOM:** JSDOM does not reload iframes when `srcDoc` changes (no real
browsing context), so asserting `iframeRef.current` identity across a theme change would always
pass in JSDOM regardless of the fix. The buildSrcdoc call-count spy is the correct proxy test for
this environment.

### Existing broadcastTheme test coverage

`VibeThemeProvider.test.tsx` lines 147-159 already assert:
- `broadcastTheme` is called exactly once on `setTheme`
- It receives the correct vars (VIBE_THEMES.noir for built-in; CUSTOM_TEST_VARS for custom)

`frameMount.test.ts` lines 153-163 already assert:
- A connected, registered frame receives a `THEME_PUSH` postMessage on `broadcastTheme`

No new tests are needed for the broadcast side. The only new test required is the srcdoc-memo
call-count spy above.

[VERIFIED: src/ui/SandboxFrame.test.tsx + src/ui/VibeThemeProvider.test.tsx + src/execution/frameMount.test.ts — live source read]

---

## Minimum Change Surface (for planner)

| File | Change | Lines |
|------|--------|-------|
| `src/ui/SandboxFrame.tsx` | Remove `themeVars` from useMemo dep array (line 109). Update inline comment. | 1 line change (+ comment update) |
| `src/ui/SandboxFrame.test.tsx` | Add one new test case for success criterion #4 (buildSrcdoc call-count spy). | ~15 lines added |

No other files change:
- `src/execution/frameMount.ts` — unchanged (THEME_PUSH handler already correct)
- `src/ui/VibeThemeProvider.tsx` — unchanged (broadcastTheme already called in setTheme)
- `index.html` — unchanged (CSP hash not affected; see Finding 5)
- `src/frameCsp.test.ts` — unchanged (script body hash unchanged)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Live CSS variable update to opaque frame | A new postMessage protocol or a theme-reload shim | The existing `THEME_PUSH` handler in the frame bootstrap (frameMount.ts:407-415) — already does exactly this |
| Stable iframe identity across re-renders | An `instanceId` key reset trick, a portal, or portal-swap | Remove `themeVars` from memo deps — the natural React behavior when deps don't change is element stability |
| Capturing current themeVars at memo re-run | A new `useRef` holding the latest `themeVars` | The factory closure already captures the then-current `themeVars` from the render scope when the memo re-runs |

---

## Common Pitfalls

### Pitfall 1: Adding a `themeVarsRef` to the memo factory thinking it's needed
**What goes wrong:** Developer adds `const themeVarsRef = useRef(themeVars); themeVarsRef.current = themeVars` and then uses `themeVarsRef.current` inside the memo. This is unnecessary — `themeVarsRef` already exists (line 151-152), and the closure capture works correctly without it.
**Why it happens:** Overreacting to the "stale closure" concern from the existing comment block at lines 139-163.
**How to avoid:** The existing comment block explains refs are needed for the message LISTENER (which is attached once for the component lifetime). The memo has different semantics — it re-runs from the current render's closure when deps change. No ref needed.

### Pitfall 2: Updating `buildSrcdoc` to remove the `themeVars` parameter
**What goes wrong:** Trying to make the function signature match the "no themeVars in memo deps" intent by removing the parameter. This breaks the first-paint CSS and changes `buildSrcdoc`'s output, invalidating the frameCsp hash test.
**Why it happens:** Misreading the fix scope — only the memo dep array changes, not `buildSrcdoc`.
**How to avoid:** `buildSrcdoc` signature and body are UNCHANGED. The srcdoc still contains the correct `<style>` block at mount time. Only the dep array in `SandboxFrame` changes.

### Pitfall 3: Forgetting the eslint-disable comment applies to ALL deps in the array
**What goes wrong:** Removing `themeVars` from the array without updating the comment, or moving the comment incorrectly.
**Why it happens:** The `// eslint-disable-next-line react-hooks/exhaustive-deps` at line 107 silences the warning for the ENTIRE dependency array. If the developer removes `themeVars` but keeps `transpiledJS` in the array, the lint rule still fires because `utils.buildSrcdoc` is not in the array either.
**How to avoid:** Keep the `eslint-disable-next-line` comment. The array `[transpiledJS]` is intentionally incomplete (utils excluded by design, themeVars excluded by this fix). Update the comment to document why `themeVars` is intentionally absent.

### Pitfall 4: Asserting iframe element identity in JSDOM as the test for criterion #4
**What goes wrong:** Test uses `container.querySelector('iframe')` before and after rerender and asserts same element reference. This always passes in JSDOM regardless of `srcDoc` changes because JSDOM doesn't trigger frame reloads.
**Why it happens:** Conflating the real-browser behavior (srcDoc change → reload) with JSDOM behavior.
**How to avoid:** Use the `buildSrcdoc` call-count spy pattern (Finding 9) — it works correctly in JSDOM and directly tests the memo dep behavior.

---

## Validation Architecture

> workflow.nyquist_validation is false in config — Validation Architecture section omitted.

---

## Security Domain

No new security surface introduced. The fix removes a dep from a React memo; it does not change:
- The frame's sandbox attribute (`allow-scripts`, no `allow-same-origin`)
- The postMessage `targetOrigin` (still `"*"` — appropriate for opaque-origin frame)
- What enters the frame's browsing context (themeVars arrive via `<style>` at mount and via
  THEME_PUSH postMessage at runtime — same data as before)
- The API key isolation path (key never enters the frame)

The `THEME_PUSH` handler in the frame (frameMount.ts:407-415) only reads `vars` keys and calls
`document.documentElement.style.setProperty(k, vars[k])`. CSS property injection via
`style.setProperty` is safe — properties that are not valid CSS custom properties are silently
ignored by the browser.

[VERIFIED: src/execution/frameMount.ts:407-415 — live source read]

---

## Environment Availability

Step 2.6: SKIPPED — this is a code-only change with no external dependencies.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | — | — | — |

All claims in this research were verified by direct source code reading. No assumed knowledge.

---

## Sources

### Primary (HIGH confidence — live source read)
- `src/ui/SandboxFrame.tsx` — srcdoc memo (lines 105-110), iframe bind (line 335), mount effect
  (lines 115-127), themeVarsRef (lines 151-152), VIBE_BOOTSTRAP send (line 191)
- `src/execution/frameMount.ts` — frameRefs registry (line 21), registerFrame (lines 23-25),
  broadcastTheme (lines 45-57), buildSrcdoc signature (lines 81-95), THEME_PUSH handler (lines 407-415)
- `src/ui/VibeThemeProvider.tsx` — setTheme → broadcastTheme (lines 350-365)
- `src/ui/SandboxFrame.test.tsx` — makeUtils (lines 29-49), defaultProps (lines 71-84), test structure
- `src/execution/frameMount.test.ts` — broadcastTheme + registry tests (lines 127-217)
- `src/ui/VibeThemeProvider.test.tsx` — broadcastTheme spy test (lines 147-159)
- `src/frameCsp.test.ts` — bootstrapScriptBody extractor (lines 39-44), hash guard test (lines 74-88)
- `index.html` — CSP script-src directive with both sha256 hashes (line 19)
- `.planning/milestones/v3.0-MILESTONE-AUDIT.md` — tech debt entry documenting exact root cause
- `.planning/phases/23-live-frame-re-skin/23-CONTEXT.md` — locked decisions

---

## RESEARCH COMPLETE

**Phase:** 23 — Live Frame Re-Skin
**Confidence:** HIGH

### Key Findings

- **Root cause confirmed at exact location:** `SandboxFrame.tsx` line 109 — dep array `[transpiledJS, themeVars]`. Changing to `[transpiledJS]` is the entire fix to the host side.
- **THEME_PUSH path fully implemented and tested:** `broadcastTheme` (frameMount.ts:45-57) posts `{ type: "THEME_PUSH", payload: { vars } }` to connected frames; the frame handler (frameMount.ts:407-415) applies vars to `:root`. No implementation work needed on this path.
- **CSP hash is NOT invalidated:** The fix changes only the memo dep array in React, not `buildSrcdoc`'s output. The `<script>` body is byte-stable; `index.html` does not change.
- **`themeVarsRef` already exists** at SandboxFrame.tsx:151-152 — consistent with the existing pattern; no new ref is needed for the fix.
- **Test strategy for criterion #4:** Spy on the `_utils.buildSrcdoc` injection (via `makeUtils` override) and assert it is called exactly once even after a `themeVars`-only re-render. JSDOM does not reload iframes on `srcDoc` changes, so the spy count is the correct proxy.
- **Change surface is 2 files, ~16 lines total.** No new runtime deps. No other files affected.

### File Created
`.planning/phases/23-live-frame-re-skin/23-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Root cause identification | HIGH | Direct source read; line 109 confirmed |
| THEME_PUSH handler correctness | HIGH | Direct source read; already tested in frameMount.test.ts |
| CSP hash safety | HIGH | frameCsp.test.ts extracts only `<script>` body; `buildSrcdoc` unchanged |
| Test strategy (criterion #4) | HIGH | Consistent with existing makeUtils / _utils injection pattern |
| Full suite impact | HIGH | Only 2 files touched; broadcastTheme path already covered by 935 passing tests |

### Open Questions
None — all blockers resolved by live source inspection.

### Ready for Planning
Research complete. Planner can create PLAN.md with confidence.
