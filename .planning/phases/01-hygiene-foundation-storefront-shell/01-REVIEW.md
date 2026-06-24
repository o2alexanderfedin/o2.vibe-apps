---
phase: 01-hygiene-foundation-storefront-shell
reviewed: 2026-06-24T23:08:59Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - index.html
  - vite.config.ts
  - tsconfig.json
  - tsconfig.node.json
  - src/main.tsx
  - src/App.tsx
  - src/index.css
  - src/vite-env.d.ts
  - src/lib/logger.ts
  - src/lib/logger.test.ts
  - src/lib/storage.ts
  - src/registry/db.ts
  - src/registry/registry.ts
  - src/registry/registry.test.ts
  - src/registry/cacheKey.ts
  - src/registry/cacheKey.test.ts
  - src/host/modelClient.ts
  - src/host/modelClient.test.ts
  - src/ui/Marketplace.tsx
  - src/ui/AppBar.tsx
  - src/ui/KeyDialog.tsx
  - src/ui/ThemeProvider.tsx
  - src/ui/SkeletonCard.tsx
  - src/ui/ErrorBoundary.tsx
  - src/ui/theme.test.tsx
  - src/data/appRegistry.ts
  - src/test/setup.ts
  - src/hygiene.test.ts
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: resolved
fixed: 2026-06-24T23:20:00Z
fixes_applied:
  - "CR-01: CSP sha256 hash authorizes inline FOUC script + guard test (src/csp.test.ts) — commit 21a16f6"
  - "WR-01: distinct save-error message for localStorage write failure — commit 270d106"
  - "WR-02: Marketplace clears pending timeout on unmount — commit 7dd4c44"
  - "WR-03: registry get/put parameterized on store name for per-store typing — commit 8834662"
  - "WR-04: KeyDialog focus trap filters to genuinely focusable elements — commit 1b934e8"
  - "WR-05: ThemeProvider split effects to avoid matchMedia resubscribe thrash — commit 21de03d"
fixes_deferred:
  - "IN-01..IN-04 (info-only): left for a future pass per --fix --auto scope (Critical+Warning only)"
---

# Phase 1: Code Review Report

**Reviewed:** 2026-06-24T23:08:59Z
**Depth:** standard
**Files Reviewed:** 27 (1 file — `src/hygiene.test.ts` — was read but is the gate itself; counted in scope)
**Status:** issues_found

## Summary

Phase 1 establishes the hygiene foundation and storefront shell. Build passes (`vite build` clean), `tsc --noEmit` passes with zero errors, and all 36 tests pass across 6 files. The devtools-hygiene invariants are well-respected: no banned tokens, `console.*` is confined to the gated logger, the API key is received only as a call-time parameter in `modelClient.buildHeaders` (never stored, never logged, never interpolated into an error), `KeyDialog` never echoes the entered value into the format-error string, and `sourcemap: false` is held. The `modelClient` stub correctly makes no network call.

However, the most security-sensitive artifact in the phase — the Content-Security-Policy — has a concrete defect that silently disables the production first-paint theme script (CR-01). That is the one blocker. The remaining findings are robustness and correctness-of-error-reporting issues that should be fixed before the storefront ships, plus quality/maintainability items.

The passing test suite does NOT cover the CSP/inline-script interaction (tests run in jsdom with no CSP enforcement and never load `index.html`), nor the `localStorage`-write-failure error path in `KeyDialog`, nor unmount cleanup in `Marketplace`. These gaps are why the defects below survived a green test run.

## Critical Issues

### CR-01: CSP blocks the inline FOUC theme script in production — first paint is broken and the no-flash guarantee is void

**File:** `index.html:10-21` (the `<meta http-equiv="Content-Security-Policy">` at lines 10-13 vs the inline `<script>` at lines 14-21)
**Issue:**
The meta CSP sets `script-src 'self' 'unsafe-eval'`. Under CSP, an inline `<script>` element is permitted ONLY when `script-src` contains `'unsafe-inline'`, a matching `nonce-...`, or a matching `sha256-...` hash. `'unsafe-eval'` does NOT relax inline scripts — it only relaxes `eval()` / `new Function()` / `setTimeout(string)`. Because the `<meta>` CSP appears in `<head>` before the inline script, it is active when the parser reaches the inline block, so the browser **blocks the FOUC theme script** (Refused-to-execute CSP violation).

Consequences:
1. `document.documentElement.setAttribute('data-theme', theme)` never runs at first paint, so the no-flash-of-wrong-theme guarantee (the stated purpose of the inline script, D-16) is broken in the shipped bundle. A user with a dark OS preference, or a stored dark theme, sees a light-theme flash until React mounts `ThemeProvider`.
2. This is verifiable: `vite build` emits the inline script verbatim into `dist/index.html` with no nonce, and the CSP carries no hash — so the production artifact is the broken one, not just dev.

This is the single most security-and-correctness-load-bearing file in the phase, and the policy that is supposed to protect the app is the thing that breaks it.

**Fix:**
Add a CSP source hash for exactly this inline script (preferred — keeps `'unsafe-inline'` out of `script-src`, which matters once `new Function`/Babel arrive in Phase 3). Compute the sha256 of the inline script's text content and add it:

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self' 'unsafe-eval' 'sha256-REPLACE_WITH_SCRIPT_HASH'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.anthropic.com; img-src 'self' data:; font-src 'self';"
/>
```

Generate the hash from the exact bytes between `<script>` and `</script>` (browsers hash the element text content). Then add a build-time check (or a test that parses `dist/index.html`) asserting the inline script's hash is present in the CSP, so a future edit to the script body can't silently re-break it. Alternatively, move the FOUC logic into the module entry and accept a one-frame flash, or serve the CSP as a real HTTP header with a nonce — but the hash approach is the minimal, hygiene-preserving fix.

## Warnings

### WR-01: `KeyDialog` reports "Invalid access key format" when the failure was a localStorage write, not a format problem

**File:** `src/ui/KeyDialog.tsx:90-96`
**Issue:**
`handleConnect` validates the format, then wraps `localStorage.setItem` in a try/catch whose catch sets `setError(FORMAT_ERROR)`. A quota-exceeded or strict-privacy `setItem` failure is reported to the user as "Invalid access key format. Please check and try again." The key was valid; the storage write failed. The user will keep re-editing a correct key forever with no path to success, and the message actively misdirects diagnosis. This conflates two distinct failure classes under one (wrong) message.
**Fix:**
Use a distinct neutral message for the persistence path so the user isn't told their valid key is malformed, e.g.:

```ts
const SAVE_ERROR = "Couldn't save your access key. Please try again.";
// ...
try {
  localStorage.setItem(STORAGE_KEY_API, keyInput.trim());
} catch {
  setError(SAVE_ERROR); // not FORMAT_ERROR
  return;
}
```

Keep it neutral (no mechanic tokens) and still never interpolate the entered value.

### WR-02: `Marketplace` never clears its pending timeout on unmount

**File:** `src/ui/Marketplace.tsx:37-46`
**Issue:**
`handleOpen` schedules `setTimeout(() => setOpeningId(null), 800)` and stores the handle in `timeoutRef`, but there is no `useEffect(() => () => clearTimeout(timeoutRef.current), [])` cleanup. If the component unmounts while a timer is pending (route change, or the parent `ErrorBoundary` swapping in its fallback after a sibling throws), the callback fires `setOpeningId` against an unmounted component. React 19 suppresses the legacy warning, but this is still a stale-closure write and a leaked timer — a latent correctness/hygiene defect that will matter as soon as mounting/unmounting apps becomes the core loop (Phase 2/3).
**Fix:**
Add an unmount cleanup:

```ts
useEffect(() => {
  return () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };
}, []);
```

### WR-03: `registry.put` generic provides no real store/value type safety — any record can be written to any store

**File:** `src/registry/registry.ts:59-74` (and the helper at `src/registry/db.ts:6-8`)
**Issue:**
`put<T extends StoreValue<StoreName>>` evaluates `StoreValue<StoreName>` over the full `StoreName` union, collapsing the constraint to `AppRecord | WidgetRecord | HandlerRecord`. Since all three are aliases of `Record<string, unknown>` in Phase 1, the bound is effectively `Record<string, unknown>` and the `store` argument is not correlated with the `value` type. The internal body then casts through `Parameters<...>[0/1]` to satisfy `idb`, discarding the schema's per-store typing. Result: once Phase 2 gives `AppRecord`/`WidgetRecord`/`HandlerRecord` distinct shapes, `put("widgets", anAppRecord, key)` will still type-check. This is a foundation primitive other phases build on, so the weak contract propagates.
**Fix:**
Make the store and value covary by parameterizing on the store name instead of the value type:

```ts
export async function put<S extends StoreName>(
  store: S,
  value: StoreValue<S>,
  key: string,
): Promise<void> { /* ... */ }

export function get<S extends StoreName>(
  store: S,
  key: string,
): Promise<StoreValue<S> | undefined> { /* ... */ }
```

This removes the need for the `Parameters<...>` casts in the IndexedDB branch and gives callers per-store type checking once the record types diverge.

### WR-04: `KeyDialog` focus trap selects no-longer-focusable / off-DOM elements and ignores `disabled`

**File:** `src/ui/KeyDialog.tsx:67-79`
**Issue:**
The Tab-trap query `'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'` does not exclude `:disabled` controls or elements made unfocusable (e.g., `display:none`). It also treats `focusable[0]` / `focusable[last]` as the trap boundaries without verifying they are actually focusable. In the current three views every control is enabled, so it works today — but the moment a disabled primary button is added (a very common pattern for "Connect" while validating), Shift+Tab/Tab can land focus on a disabled element or escape the trap, defeating the modal's accessibility contract. This is a robustness gap in a primitive that other dialogs may copy.
**Fix:**
Filter the node list to genuinely focusable elements:

```ts
const focusable = [...root.querySelectorAll<HTMLElement>(
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
)].filter(
  (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
);
```

### WR-05: `useEffect` cleanup `removeEventListener` may target a different `MediaQueryList` than the one subscribed

**File:** `src/ui/ThemeProvider.tsx:69-76`
**Issue:**
The effect creates `const mq = window.matchMedia(...)` and subscribes/unsubscribes on that same `mq`, which is correct for a stable `matchMedia`. The risk is environmental: `window.matchMedia` is mocked/swapped in several places (test setup returns a fresh object each call; `installMatchMedia` returns one shared `mql`). In production `matchMedia` is stable, so this is not a live crash — but the pattern relies on `matchMedia` returning a consistent object, and the cleanup is only correct because `mq` is captured in closure. It is fine as written; the warning is that the effect resubscribes on every `mode` change (the dependency is `[mode]`), so toggling theme repeatedly churns add/remove listener pairs. Not a leak (cleanup runs), but unnecessary subscribe/unsubscribe thrash that obscures intent.
**Fix:**
Either narrow the effect so the media subscription only re-runs when entering/leaving `"system"` (split into two effects: one that always `applyTheme(mode)`, one keyed on `mode === "system"`), or document that the resubscribe-per-toggle is intentional. Low risk; flagged for maintainability, not crash.

## Info

### IN-01: Duplicate "Registry initialized" log from two sites

**File:** `src/registry/registry.ts:46` and `src/App.tsx:19`
**Issue:**
`dbReady` logs `"Registry initialized"` inside the IIFE at `registry.ts:46`, and `App.tsx` independently logs `"Registry initialized"` again after `dbReady` resolves. With the gate on, the same neutral line appears twice per load, which muddies diagnostics. The strings are both neutral (no hygiene issue), just redundant.
**Fix:** Drop one site — prefer keeping the log inside `dbReady` (single source of truth) and remove the `App.tsx` `useEffect` log, or vice versa.

### IN-02: `index.css` line-clamp uses the prefixed property without the standard fallback ordering risk

**File:** `src/index.css:176-180`
**Issue:**
`.app-card__description` sets `-webkit-line-clamp: 2;` and `line-clamp: 2;` but relies on `display: -webkit-box` and `-webkit-box-orient: vertical`, which the standard `line-clamp` does not pair with. The clamp works in Chromium/WebKit via the `-webkit-*` path; the unprefixed `line-clamp` is effectively inert here. Not a bug (the intended browsers honor the `-webkit-` path), but the bare `line-clamp` is dead and may mislead.
**Fix:** Keep the `-webkit-*` trio; the standalone `line-clamp: 2;` can be removed or kept only as forward-compat with a comment. Purely cosmetic.

### IN-03: `assertAnthropicTarget` is an intentional no-op seam — confirm it is referenced before Phase 3

**File:** `src/host/modelClient.ts:41-43`
**Issue:**
`assertAnthropicTarget` discards its argument (`void url`) and does nothing. The JSDoc and project context confirm this is a deliberate Phase-1 seam, not dead code, and it is exercised by a test. No action needed in Phase 1. Flagged only so the wiring (an actual call site at the fetch edge) is not forgotten when Phase 3 lands — an unenforced origin assertion would be a security gap then, though it is correctly out of scope now.
**Fix:** None for Phase 1. Track that Phase 3 must (a) implement the origin check and (b) call it on the real fetch path.

### IN-04: `db.ts` record types are three identical aliases — intentional placeholder, will need divergence

**File:** `src/registry/db.ts:6-8`
**Issue:**
`AppRecord`, `WidgetRecord`, and `HandlerRecord` are all `Record<string, unknown>`. This is a documented Phase-1 placeholder, but it is the root cause of WR-03's weak typing. No defect in Phase 1.
**Fix:** None now; when Phase 2 gives these real shapes, apply the WR-03 generic fix so per-store typing actually engages.

---

_Reviewed: 2026-06-24T23:08:59Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
