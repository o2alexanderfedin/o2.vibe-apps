---
phase: 16-desktop-shell
reviewed: 2026-06-26T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - src/ui/DesktopShell.tsx
  - src/ui/Dock.tsx
  - src/ui/MenuBar.tsx
  - src/ui/MinimalLauncher.tsx
  - src/ui/iconForApp.tsx
  - src/ui/AppShell.tsx
  - src/ui/WindowFrame.tsx
  - src/ui/AppBar.tsx
  - src/ui/useWindowManager.tsx
  - src/App.tsx
  - src/ui/desktopShellTestKit.tsx
  - src/index.css
findings:
  critical: 0
  warning: 5
  info: 3
  total: 8
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-06-26T00:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 16 replaces the flat storefront (AppBar + Marketplace grid) with a `DesktopShell` root: a themed wallpaper, four animated blob layers, a window stack, and dock / menu-bar / minimal-launcher chrome. The open flow (handleOpen / handleClose / storeComponent / handleModify) is ported from the former Marketplace component.

**Devtools-hygiene: PASS.** No banned `synthesi*` token appears anywhere. The grep hits ("mockable", "model call", "on-demand") all live in *source comments*, and the host bundle ships with `build.sourcemap: false` + `minify: true` (vite.config.ts), which strips comments and mangles symbol names out of the served artifact. All runtime-visible surfaces (user copy, aria-labels, class names) are neutral. No Critical findings.

**IoC/DI: PASS.** Dock, MenuBar, and MinimalLauncher are pure props-injection leaves — none consume `useWindowManager()` directly; the shell injects windows + callbacks. This matches the stated leaf-purity invariant.

**Cleanup invariants: mostly correct.** Timer cleanup (MenuBar `clearInterval`, DesktopShell `clearTimeout`, reduced-motion `removeEventListener`/`removeListener`) is in place. The window close path evicts the live component, routes through `windowManager.close`, and drops the body/position maps — zero-leak for the normal open. The mid-flight close guard (`isOpenByInstance`) is correctly keyed on the synchronously-mirrored instanceId.

The defects below are real-but-bounded: a per-tweak live-component leak that defeats the zero-leak invariant for tweaked windows, dead state driving a pointless timer, an accessibility regression in the launcher dialog, an unevenly-applied icon abstraction, and one orphaned dead-code file.

## Warnings

### WR-01: Tweak path leaks a live component on every tweak — close never evicts it

**File:** `src/ui/DesktopShell.tsx:312-318` (with `src/execution/loader.ts:374`, `381-383`)
**Issue:** The tweak branch resolves a new component under a *synthetic* instance id:
```ts
const Component = await resolveComponent(
  instanceId + "-tweak-" + tweakKey.slice(0, 8),  // synthetic id
  ...
);
```
`resolveComponent` stores the result in the loader's module-level `liveComponents` Map keyed by that synthetic id (`loader.ts:374`). But `handleClose` only evicts the **original** `instanceId`:
```ts
evictLiveComponent(instanceId);  // DesktopShell.tsx:158 — never the "-tweak-…" id
```
So every tweak permanently leaks one component reference in the global `liveComponents` Map for the page lifetime. Tweaking an app N times leaks N references that survive even after the window is closed. This directly defeats the phase's "zero-leak window close" invariant for any window that was ever tweaked. (Bounded by user tweak actions, not unbounded automatic growth — hence WARNING, not BLOCKER.)
**Fix:** Track the synthetic ids minted per window and evict them all on close, or stop minting a separate id for the tweak resolve. Simplest robust fix — record the live-cache key on the window and evict it in `handleClose`:
```ts
// store the synthetic id used for the tweak so close can reclaim it
const tweakInstanceId = instanceId + "-tweak-" + tweakKey.slice(0, 8);
const Component = await resolveComponent(tweakInstanceId, ...);
// remember it (e.g. a Set/Map keyed by instanceId) and in handleClose:
evictLiveComponent(instanceId);
for (const synthetic of tweakIdsFor(instanceId)) evictLiveComponent(synthetic);
```
Alternatively, resolve the tweak under the *same* `instanceId` after first calling `evictLiveComponent(instanceId)` (so the tier-1 live cache misses and re-instantiates), keeping a single key per window.

### WR-02: `openingId` is dead state that still drives a 300ms timer and setState churn

**File:** `src/ui/DesktopShell.tsx:118` (and `189`, `255-260`)
**Issue:** `openingId` is declared and assigned (`setOpeningId(appType)` on open, `setOpeningId(null)` in the `finally` timer) but is **never read** anywhere in the component (confirmed: the only occurrence of the identifier is the `useState` declaration). The `finally` block still schedules a 300ms `setTimeout` solely to reset a value nothing consumes, and the open path still clears/replaces that timer on every open. This is leftover from the storefront, where `openingId` drove the per-card "Opening…" affordance (`.app-card__opening` CSS, also now dead). The result is wasted re-renders and a maintenance trap (a reader assumes the state matters).
**Fix:** Remove `openingId`/`setOpeningId`, the `setTimeout`/`timeoutRef` reset machinery, and the associated unmount-cleanup effect (DesktopShell.tsx:339-344) — unless a loading affordance is intended, in which case wire `openingId` into the render. Also drop the now-dead `.app-card__opening` rule from `src/index.css:232-236` if no storefront consumer remains.

### WR-03: MinimalLauncher dialog omits Escape, focus trap, and aria-modal that the KeyDialog pattern establishes

**File:** `src/ui/MinimalLauncher.tsx:19-27`
**Issue:** The launcher renders `role="dialog"` but, unlike the codebase's reference dialog (`KeyDialog.tsx`, which implements Escape-to-close, a Tab focus trap, `aria-modal="true"`, and initial focus), it provides none of these. Keyboard users cannot dismiss the overlay with Escape, focus is not trapped inside the modal (Tab escapes to the desktop behind it), and assistive tech is not told the dialog is modal. The component comment claims it matches KeyDialog ("clicking inside the panel does not (stopPropagation), matching KeyDialog"), but it only matches the click-outside behavior, not the keyboard/focus contract — a regression from the established pattern.
**Fix:** Mirror KeyDialog: add `aria-modal="true"`, an `onKeyDown` that closes on `Escape`, focus the first app button (or the close button) on mount, and trap Tab within the panel. Extracting the KeyDialog focus-trap logic into a shared hook would keep the two dialogs consistent.

### WR-04: Window titlebar renders the raw `appType` string instead of a glyph — iconForApp abstraction applied unevenly

**File:** `src/ui/WindowFrame.tsx:148-150` (with `src/ui/DesktopShell.tsx:196-199`)
**Issue:** `handleOpen` mints the window with `icon: appType` (a neutral key like `"weather"`), and the WindowFrame titlebar renders that value directly as text:
```tsx
<span className="window-chrome__icon" aria-hidden="true">
  {icon}   {/* renders the literal string "weather", not a glyph */}
</span>
```
So the titlebar shows the word "weather" where a glyph belongs. This phase introduced `iconForApp.tsx` precisely to map neutral keys → lucide glyphs, and the Dock uses it (`iconForAppType(entry.appType)`), but the titlebar does not — the abstraction is applied in one place and not the other. (Note: passing `icon: appType` predates this phase, so the broken titlebar is a carried-over behavior, not a new regression — but the new `iconForApp` module makes the inconsistency a defect worth fixing now.)
**Fix:** Resolve the glyph in WindowFrame the same way the Dock does, e.g. render `iconForAppType(icon)` as a component:
```tsx
const Icon = iconForAppType(icon);
// ...
<span className="window-chrome__icon" aria-hidden="true">
  <Icon size={14} />
</span>
```
If the `icon` prop is meant to carry the glyph rather than the key, change the `open()` call to pass a resolved glyph/component instead — but pick one contract and apply it in both the Dock and the titlebar.

### WR-05: `AppBar.tsx` is orphaned dead code after the storefront removal

**File:** `src/ui/AppBar.tsx:1-52`
**Issue:** Phase 16 deletes `Marketplace.tsx` and rewires `App` to `DesktopShell`. `AppBar` was only rendered by the storefront; it now has **zero importers** (no source file, no test file — confirmed by grep for `import.*AppBar`). The relocated theme switcher lives in `MenuBar`, and the account button moved there too. The whole file is unreachable code that will rot (its `THEME_META`, `cycleTheme` wiring, etc.).
**Fix:** Delete `src/ui/AppBar.tsx`. Keep the shared `.app-bar__icon-btn` CSS class (still used by AppShell, KeyDialog, MenuBar, MinimalLauncher, WidgetShell), but the component itself should go. If it is being retained intentionally for a future surface, add a comment and a smoke test so it does not silently break.

## Info

### IN-01: Re-rendering the whole MenuBar every second to update an HH:MM clock

**File:** `src/ui/MenuBar.tsx:33-36`
**Issue:** The clock interval fires every 1000ms and calls `setClock`, re-rendering MenuBar every second, even though the displayed value (HH:MM) only changes once per minute. Correctness is fine (and performance is out of v1 review scope), but it is unnecessary churn.
**Fix:** Either tick once per minute (compute the ms to the next minute boundary and `setTimeout`/re-arm), or gate the state update so it only sets when the formatted string actually changes.

### IN-02: `cascadePlace` clamps new windows toward the bottom-right but never resets the cascade

**File:** `src/ui/useWindowManager.tsx:77-92`
**Issue:** Each new window offsets +28px from the last entry, clamped to `maxX/maxY`. Once the cascade reaches the bottom-right clamp, every subsequent window stacks at the exact same clamped coordinate (fully overlapping). Not a crash, but new windows can become visually indistinguishable after several opens. (Behavior carried from Phase 15; noted for completeness.)
**Fix:** Consider wrapping the cascade back toward the top-left (modulo the available range) once it would clamp, so overlapping windows remain offset.

### IN-03: Comment in WindowFrame references behavior already removed ("Earlier this frame mounted… mountApp")

**File:** `src/ui/WindowFrame.tsx:9-13`
**Issue:** The block comment documents a prior `mountApp`/detached-root design that no longer exists in this file. Historical rationale is useful, but as written it reads as current architecture and can mislead. Low priority.
**Fix:** Trim to a one-line note ("apps render in-tree; no separate managed root") or move the rationale to a design doc.

---

_Reviewed: 2026-06-26T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
