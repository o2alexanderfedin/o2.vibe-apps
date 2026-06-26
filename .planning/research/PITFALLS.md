# Pitfalls Research

**Domain:** Multi-window desktop manager + runtime CSS-variable theming + generated-code mounting on an existing client-only React SPA
**Researched:** 2026-06-26
**Confidence:** HIGH (pointer/drag, CSS-variable inheritance, backdrop-filter compositing, stacking-context traps, and root-leak patterns verified against MDN, React 19 docs, Chrome compositing docs, and direct design-file analysis; hygiene vectors enumerated from existing project surface)

> This file covers **v2.0 Vibe OS additive pitfalls only**. The v1.x baseline pitfalls (sandbox escape, API-key leakage, Babel footguns, IndexedDB traps, hygiene lexicon, generation unreliability, root lifecycle) remain valid and are documented in `PITFALLS-v1.1.md`. Cross-references are noted where a v2.0 concern extends a v1.x pitfall. Phase names follow the Vibe OS milestone roadmap.

---

## Critical Pitfalls

### Pitfall 1: Pointer Capture Lost — Drag Breaks When Pointer Leaves Window Chrome

**What goes wrong:**
The drag handler attaches `pointermove`/`pointerup` to `window` (exactly as the design file does), but if the browser triggers a native drag for any selected text or image inside the window body, or if a generated app's `iframe` captures the pointer, `pointerup` never fires on `window`. The user releases the mouse and the window keeps chasing the cursor. Another variant: `e.preventDefault()` is called on `pointerdown` on the title bar, but the *generated app's body* has selectable text — the user clicks-and-holds on the title bar near a rendered component's text; the browser still starts text selection in the body because `preventDefault` on the drag handle does not propagate into a separately-rooted React tree. Also: a generated app that calls `e.stopPropagation()` on any pointer event kills focus/z-order logic on the title bar if the event bubbles up.

**Why it happens:**
The design file calls `e.preventDefault()` in `startDrag` to prevent selection, then adds global `pointermove`/`pointerup` listeners. This is correct for the reference's monolithic class but incomplete in a React host where: (a) each window's body is a separate `createRoot` with its own event delegation root — React 17+ no longer attaches to `document`, it attaches to the individual container, creating pointer-event competition; (b) the browser's implicit pointer capture on drag-start can conflict with explicit capture.

**How to avoid:**
- Call `e.target.setPointerCapture(e.pointerId)` in `onPointerDown` on the drag handle. Pointer capture routes all subsequent pointer events to that element regardless of where the pointer travels — into generated-app subtrees, browser chrome, or off-screen. Release with `e.target.releasePointerCapture(e.pointerId)` in `onPointerUp`.
- Add `user-select: none` to the entire desktop surface (not just the title bar) while any drag is active — toggle a CSS class on the root container when `drag` is non-null; remove it on `onPointerUp`.
- Do **not** use `mousedown`/`mousemove`/`mouseup` — they don't support pointer capture and break on touch. Use the Pointer Events API exclusively.
- Listen on `onPointerMove` and `onPointerUp` at the *drag handle element* (via capture events), not on `window`, so React's synthetic event system handles cleanup. The design file's `window.addEventListener` approach is fine for a standalone class but creates a global listener leak risk if the component unmounts before `pointerup` fires (e.g., the window is programmatically closed mid-drag).

**Warning signs:**
- Windows "stick" to the cursor and only release after clicking again somewhere on the desktop.
- Drag breaks reliably when the cursor moves into a generated app's content area.
- Text selection appears in a window body while dragging the title bar.

**Phase to address:**
Windowing Phase (whichever phase builds the draggable window manager). Verify: drag a window, move cursor into the generated app area and back, release — window stops tracking. Drag while holding over a text node in the generated app — no text selection.

---

### Pitfall 2: setState Thrash During Drag — RequestAnimationFrame Not Used

**What goes wrong:**
The design file calls `this.setState(st => ({ windows: st.windows.map(...) }))` on every `pointermove` event. In React 18/19, `setState` is batched and asynchronous, but the reconciler still schedules a re-render for each discrete pointer event. At 60 Hz pointer rates that is 60 full reconciliations per second of the entire `windows` array — re-rendering every open window on every mouse move. With 3-4 windows open, each with a generated React tree and backdrop-filter compositing, this produces measurable jank.

**Why it happens:**
The pattern is natural: update position on move, React re-renders. The cost is invisible with 0-1 windows and hardware-accelerated GPU compositing masking the CPU cost, then suddenly visible at 3+ windows.

**How to avoid:**
- Write drag position directly to a `ref` and update the DOM element's `style.transform` (or `style.left`/`style.top`) imperatively inside `requestAnimationFrame`. Only commit the final position to React state on `pointerup`. Pattern:
  ```ts
  const rafId = useRef<number>(0);
  const onMove = (e: PointerEvent) => {
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      windowEl.current!.style.transform = `translate(${x}px, ${y}px)`;
    });
  };
  const onUp = () => {
    // commit final x/y to React state for persistence
    setWindows(prev => prev.map(w => w.id === dragId ? { ...w, x, y } : w));
  };
  ```
- Alternatively, use CSS `will-change: transform` on the window element so the GPU compositor owns the position, and avoid any property that triggers layout (left/top) during drag — use `transform` instead.
- Do not call `setState` at all during `pointermove`. React state is for persistence/share, not for 60 Hz visual updates.

**Warning signs:**
- Drag feels laggy or "stuttery" with 2+ windows open.
- Chrome DevTools Performance tab shows a re-render on every `pointermove` notification.
- GPU/CPU usage spikes significantly when a window is dragged.

**Phase to address:**
Windowing Phase. Verify in DevTools: CPU usage during drag stays below a visible threshold; no re-render cascade per pointer event (check React DevTools "Highlight updates" — no flashing during move).

---

### Pitfall 3: Z-Index Escalation — Integer Overflow and Stacking Context Traps

**What goes wrong:**
The design file uses `this.ztop = (this.ztop || 200) + 1` on every focus/open. With many window opens over a session `ztop` is unbounded — browsers handle up to 2,147,483,647 but the real issue is that z-index values only work within the *same stacking context*. If any ancestor of the window container has a CSS property that creates a new stacking context (`transform`, `opacity < 1`, `filter`, `will-change`, `isolation: isolate`, `position + z-index`, `backdrop-filter`), the window's z-index is scoped to that ancestor's context and cannot overlap elements in sibling contexts regardless of the raw number.

Specifically: the design's animated blob divs use `mixBlendMode: 'screen'` and `filter: blur(60px)` — both create stacking contexts. If a window container is a sibling of the blob layer and the shared wrapper does not itself define `position: relative` + an explicit stacking context, a blob can render above a focused window despite the window having `z: 9999`.

**Why it happens:**
Stacking contexts are invisible: you add `backdrop-filter` to the window for glass effect and unknowingly create a context that severs its z-index relationship with anything outside it. The blobs' `filter: blur` creates contexts too, but since they are positioned before windows in the DOM tree and share a common root, it *usually* works — until something in the layout chain changes.

**How to avoid:**
- Put all windows in a single dedicated container that is the highest-priority stacking context: `position: fixed; inset: 0; z-index: 100; isolation: isolate`. No transform/filter on this container — only its children have those properties.
- Keep blob divs, backdrop overlays, and the desktop wallpaper in a separate container that is a lower sibling in the DOM and in z-index.
- For window ordering within the container, use relative z-index values (1, 2, 3… reset on each focus) rather than ever-growing counters. When a window is focused, collect all other windows and assign them z-index 1…N-1 in their current order; give the focused window N. This keeps values bounded and avoids the escalation problem.
- Test with `backdrop-filter` on the window itself — verify it does not trap z-index of its children (it does not, but its *sibling's* z-index relationship with the window can be disrupted if the window is inside a context with `backdrop-filter`).

**Warning signs:**
- A minimized window reappears above a focused window after several open/close cycles.
- A blob gradient renders above a window regardless of z-value.
- Clicking on a window's top portion focuses a different window (the focus/z-update hit-test disagrees with what's visually on top).

**Phase to address:**
Windowing Phase. Verify: open 5 windows, click through them in random order — each focused window is visually topmost. Run the z-escalation test: open/close 50 windows; final z-values remain reasonable integers.

---

### Pitfall 4: Backdrop-Filter Compositing Cost — GPU Layer Explosion with Many Windows + Blob Animations

**What goes wrong:**
Every window uses `backdrop-filter: blur(32px) saturate(195%)`. The browser must create a separate GPU compositor layer for each backdrop-filter element AND the surface it reads from (the "backing surface"). With 4 windows open: 4 layers for windows + their backing surfaces. The animated gradient blobs use `filter: blur(60px)` on 4 divs, each triggering another compositor layer. At peak that is ~12 active GPU layers reading and compositing each other. On mobile or integrated graphics this causes dropped frames, battery drain, and can trigger iOS/Chrome's "compositor limit" fallback to software rendering — at which point the blur becomes a CPU-intensive paint on every frame of the blob animation.

The blob animation uses `transform: translate + scale` on a `requestAnimationFrame`-equivalent CSS `animation` (`vibeFloat`). CSS-animated transforms are compositor-friendly IF no repaints are required on the composited layer. The blob's `radial-gradient` background combined with `filter: blur` plus `mixBlendMode: screen` means the GPU must composite three effects per blob per frame, reading from a live backing layer each time.

**Why it happens:**
Glass-morphism + animated ambient blobs is a deliberate design choice (VibeOS aesthetic) but the GPU cost is non-obvious. It looks fine in a demo with 1 window on a MacBook Pro with discrete GPU; it breaks on Intel integrated graphics or any mobile browser.

**How to avoid:**
- **Limit concurrent backdrop-filter elements.** If a window is minimized, set `display: none` (which the design already does via `min: false` visibility check) — minimized windows must not maintain compositor layers.
- **Merge the blob layer.** Instead of 4 separate blurred divs, render all blobs onto a single `<canvas>` or a single composite element using `box-shadow` tricks. One blur element instead of four.
- **Detect performance regression.** Use `requestAnimationFrame` delta timing at startup: if frame time exceeds 20ms for 5 consecutive frames while any animation is running, degrade the blobs (remove the `filter: blur` and use a solid color gradient instead) and reduce `backdrop-filter` blur radius to 12px. Expose a `prefersReducedBlur` state.
- **Respect `prefers-reduced-motion`:** the blob animations should pause when the user has set this OS preference. Use a CSS media query or `window.matchMedia('(prefers-reduced-motion: reduce)')`.
- **will-change scoping.** Apply `will-change: transform` to blob divs during animation but remove it when the animation is not visible (e.g., when all windows are closed and no animation is running). `will-change` costs its own compositor layer even when idle.

**Warning signs:**
- Chrome DevTools Layers panel shows >10 active GPU layers when 3+ windows open.
- Frame rate drops below 30 fps on first open of a window (background blobs + backdrop-filter competing).
- `chrome://flags` GPU process UI shows "compositing fallback to software" triggered.
- iOS Safari shows visible "gray flash" when first backdrop-filter is added to the page (a known Safari bug when compositor limit is hit).

**Phase to address:**
Windowing Phase (initial), Performance Hardening Phase (blob reduction and degradation logic). The degradation detector and `prefers-reduced-motion` support can ship in a subsequent phase; the `display: none` for minimized windows is day-one.

---

### Pitfall 5: CSS Custom Properties Do NOT Inherit Into a Separately-Created React Root

**What goes wrong:**
This is the **central theming failure mode** for this architecture. CSS custom properties (`--accentA`, `--glass`, `--text`, etc.) cascade through the DOM tree via normal CSS inheritance. When you call `createRoot(container).render(<App />)`, the React tree renders into `container`, which *is* a DOM element. If `container` is a child of the host document body, and the theme variables are set on `:root` or `body`, then the generated app's DOM subtree naturally inherits them — **as long as the container is in the light DOM tree**.

The trap: if generated apps are mounted into containers that are `display: contents`, inside a Shadow DOM, or the custom properties are set only on a React context value (not on actual DOM elements), inheritance breaks. In the current architecture, `mountApp(instanceId, container, Component)` mounts into a DOM element that the windowing system inserts into the desktop surface. As long as theme variables are set on `document.documentElement` (`:root`) or on the window's wrapping div — and the container is a child of that div — inheritance works. But if you apply theme variables exclusively via a React context and generated apps are in separate roots that don't share that context, they get no theme at all.

The second trap: generated apps that hardcode colors (`background: #1b1636`, `color: #f3f1ff`) instead of using the variable contract ignore the theme entirely. There is no mechanism to detect this after the fact.

**Why it happens:**
- Developers apply theme variables to a React context provider in the host tree, not to actual DOM elements with CSS custom properties. Separate roots outside the provider receive nothing.
- The LLM generates apps using concrete color values from the reference design's screenshot (the design file's body `background: #0c0a18` bleeds into generated code expectations).
- The generate prompt does not include the theme variable contract, so the model has no knowledge of `--accentA`, `--glass`, etc.

**How to avoid:**
- **Apply theme CSS variables directly to `document.documentElement`** (not to a React context). When theme changes, update `document.documentElement.style.setProperty('--accentA', value)` for each variable. Every DOM subtree on the page — host chrome, generated app containers, widget containers — inherits them automatically, regardless of which React root they belong to.
- **IndexedDB-persist the active theme name**, read it before first paint, and apply the variable set *synchronously* (or as early as possible) before React renders anything, to avoid FOUC (see Pitfall 6).
- **Mandate the variable contract in the generate prompt.** The system prompt must explicitly list the CSS variable names and state "use these CSS custom properties for all colors — do not hardcode hex values." Verify compliance in the self-heal loop: if generated JSX contains hex color literals in inline styles, feed that back as a compiler-style error ("uses hardcoded colors; rewrite using CSS custom properties from the theme contract").
- **Test inheritance**: mount a generated app, switch theme, assert the app's background color changes without re-mounting.

**Warning signs:**
- Switching theme updates the host chrome but leaves generated app windows with the old colors (or always showing the aurora/dark palette).
- A generated app that opens in `noir` theme shows purple accent colors from `aurora` instead of `noir`'s `#c451ff` / `#18ffe0`.
- The DOM inspector shows `--accentA` on `:root` but the generated app container's computed styles show no matching custom property (indicating `setProperty` was called on a React element, not the DOM root).

**Phase to address:**
Theming Phase. Verify: apply theme via `document.documentElement.style.setProperty`; mount a generated app; switch theme; assert computed style of an element inside the generated app container reflects the new variable value within 50ms.

---

### Pitfall 6: Theme FOUC on Boot — Flash of Un-Themed Content Before IndexedDB Read

**What goes wrong:**
The active theme is persisted in IndexedDB. IndexedDB reads are asynchronous — the `idb` `db.get('theme', 'active')` call takes 5-50ms. During that window, the page renders with its default CSS (the stylesheet's `:root` variable defaults, which are the aurora/dark palette hardcoded in the stylesheet). If the user had switched to `aqua` or `noir`, they see a flash of purple/dark before the persisted theme loads and the variables update. This is particularly visible on the dock, menu bar, and any gradient text elements which have a 0-to-accent-color transition.

A secondary FOUC: the CSS `transition` properties added to animated theme switches (smooth color transitions between themes) also fire during boot, causing the entire page to visually "transition from default theme to loaded theme" on every page load.

**Why it happens:**
Asynchronous storage + synchronous rendering. The page paints before the storage read resolves, by design.

**How to avoid:**
- **Read theme from `localStorage` first, IndexedDB second.** Write the active theme name to both `localStorage` and IndexedDB when switching. On boot, read `localStorage.getItem('vibe.activeTheme')` *synchronously* before the React app mounts (in a `<script>` tag in `index.html` that runs before any module), apply the variables to `document.documentElement`, then confirm against IndexedDB asynchronously. This eliminates FOUC entirely for returning users.
- **Inline critical CSS variables in `index.html`.** The default theme's variable values are inlined into the `<head>` as a `<style>` block — this is what renders before any JavaScript. All other themes are applied via JS. The flash only occurs if the user's persisted theme differs from the default AND the variables have not been applied yet.
- **Suppress CSS transitions on boot.** Add `document.documentElement.classList.add('no-transition')` before applying the initial theme and remove it after the next `requestAnimationFrame`. The `no-transition` class has a CSS rule that sets `transition: none !important` on all elements, suppressing the boot-time transition.

**Warning signs:**
- On hard reload with a non-default theme selected, the page briefly shows the default (aurora) purple palette before switching to the selected theme.
- The dock/menu bar "animates in" from the wrong accent color on every page load.
- Users report "flickering" on page load.

**Phase to address:**
Theming Phase. Verify: with `noir` theme persisted, hard-reload the page; no flash of aurora colors should be visible at any point during load (measure with Lighthouse Performance trace or a manual screen recording).

---

### Pitfall 7: Theme CSS Transitions Cause Layout Jank When Switching Themes

**What goes wrong:**
Adding `transition: background-color 300ms ease, color 300ms ease, border-color 300ms ease` to the `:root` or all elements for smooth theme switching triggers a **full-page repaint and restyle on every frame** for 300ms. The browser must cascade all CSS custom properties, recompute all `color`, `background-color`, and `border-color` values, and re-paint every element that uses them. With many backdrop-filter windows open, this cascade runs simultaneously with the compositor refreshing the backing layers — dropping frames. On mobile, a 300ms smooth transition is likely to produce visible judder.

**Why it happens:**
CSS custom property transitions are not natively transitioned — `transition: --accentA 300ms` does not work (custom properties are not animatable directly). Browsers animate the *computed values* that reference those properties (`color`, `background-color`), which means a variable change triggers a re-cascade across the entire property tree.

**How to avoid:**
- **Use `@property` to register CSS custom properties as typed, animatable values** (supported in Chrome 85+, Firefox 128+, Safari 16.4+). `@property --accentA { syntax: '<color>'; inherits: true; initial-value: #9b7cff; }` enables direct CSS transitions on the variable itself: `transition: --accentA 200ms ease`. This is more efficient than transitioning all derived properties.
- **Alternatively, skip transitions for theme switches and use opacity crossfade.** Render a full-screen overlay div at the theme's new accent color, fade it in, swap variables, fade it out — one transition on one element, not a full cascade on thousands.
- **For the backdrop-filter windows specifically:** `transition: backdrop-filter 200ms` is not well-supported and triggers expensive repaint. Do not transition `backdrop-filter` values during theme switch. Accept an instant change for the blur value; only transition `background-color` and `border-color`.

**Warning signs:**
- Theme switch drops to <30 fps with 2+ windows open (check with DevTools Performance tab).
- The browser's "Recalculate Style" task exceeds 16ms during a theme switch.
- On lower-end devices, the theme switch produces a visible "blink" or gray frame.

**Phase to address:**
Theming Phase. Verify: switch theme with 3 windows open; DevTools shows no dropped frames (frame time < 16ms for the full 300ms transition); `@property` declarations present in the stylesheet.

---

### Pitfall 8: createRoot Leaks on Window Close — The Mount.ts Root Map Is Not Called

**What goes wrong:**
`src/execution/mount.ts` correctly maintains a `Map<instanceId, Root>` and provides `unmountApp(instanceId)`. The bug happens when window close logic is implemented in the windowing state manager (e.g., `closeWin(id)` filters the window from the `windows` array) but does NOT call `unmountApp(instanceId)`. The generated app's React tree keeps running — all `useEffect` hooks, `setInterval` timers, event listeners, and the React root itself remain live even though no DOM node shows the window anymore.

This is distinct from the v1.x Pitfall 7 because in v1.x there was one app shown at a time; the new windowing layer introduces concurrent roots and an explicit close affordance that the windowing state owns, not `mount.ts`. The risk is that the windowing state manager and the mount lifecycle become desynchronized.

**Why it happens:**
Two separate systems own the window lifecycle: the windowing state (which tracks `windows: []`) and `mount.ts` (which tracks `roots: Map`). Removing an item from `windows` state causes React to stop rendering the window's DOM node — but the `createRoot` root that was created when the window was opened still exists in the `roots` Map and is not unmounted. The React tree is simply disconnected from the DOM without `root.unmount()`.

**How to avoid:**
- `closeWin(id)` must always call `unmountApp(instanceId)` before or after filtering the state array. Make it structurally impossible to close a window without unmounting its root: wire `closeWin` through a shared `WindowManager` service that owns both state AND the mount lifecycle, or call `unmountApp` as a side effect inside the close handler.
- Add a test that opens 3 windows, closes all 3, and asserts `mountedCount() === 0`. This is directly testable with the existing `mountedCount()` export from `mount.ts`.
- Handle the case where a window's container DOM element is removed from the tree while its root is still mounted: React 18+ logs a warning ("An update to X inside a test was not wrapped in act(...)") in this case but does not automatically unmount — you must still call `unmount()`.
- Ensure the `unmount` call happens before the container is removed from the DOM. Reversing the order (remove container, then unmount) causes React 18+ to warn about updating an unmounted component.

**Warning signs:**
- Memory grows with each window open/close cycle (heap snapshot shows React fiber trees accumulating).
- A closed window's `setInterval` timer (e.g., a generated clock app) keeps firing after close — observable via a console side effect or by profiling timers.
- `mountedCount()` does not reach zero after all windows are closed.
- React DevTools shows fiber trees for closed windows still present in the component tree.

**Phase to address:**
Windowing Phase. Verify: open 5 windows with timer-based generated apps; close all 5; assert `mountedCount() === 0`; take a heap snapshot before and after — no growth.

---

### Pitfall 9: Unmount During Render — Closing a Window While Its Generated App Is Still Mounting

**What goes wrong:**
A generated app has a `useEffect` that fires asynchronously (e.g., it fetches from a handler, or runs a timer). If the user closes the window before that effect's cleanup runs — or if the produce/compile pipeline resolves and calls `mountApp` on a container that has already been removed from the DOM — React logs:

> "Warning: Can't perform a React state update on an unmounted component."

In React 18+, this specific warning was removed for hooks (it's no longer an error for state updates after unmount), but the underlying issue remains: if `mountApp(id, container, Component)` is called after `unmountApp(id)` has already been called (race between produce-pipeline completing and user closing the window), a new root is created for an orphaned container, the root is never tracked (because the instance was already deleted from the Map), and the result is a permanently leaked root.

**Why it happens:**
The produce pipeline (LLM call → compile → mount) is async and can take 2-5 seconds. The user can close the window UI during that time. The close handler fires synchronously; the pipeline's `mountApp` call fires later when the promise resolves. There is no cancellation in the current pipeline.

**How to avoid:**
- Each window open operation must track a cancellation token: an `AbortController` or a simple `let cancelled = false` flag scoped to the window's lifetime. Before calling `mountApp` at the end of the produce pipeline, check `if (cancelled) return`.
- The `closeWin` handler sets `cancelled = true` on the in-flight token for that window's produce operation before removing the window state.
- Pass `AbortController.signal` to the `fetch` call inside `producer.ts` so the actual Haiku HTTP request is also cancelled when the window is closed mid-flight.
- Guard `mountApp` with `if (!document.contains(container)) return` as a last-resort check.

**Warning signs:**
- Network tab shows a Haiku request completing after the window was closed (wasted API call).
- `mountedCount()` increments above the number of visible windows after rapid open/close operations.
- React logs "You called ReactDOM.createRoot() on a container that has already been passed to createRoot()" in a rapid open/close/open sequence (second open creates root, first async pipeline also tries to create root for the same container).

**Phase to address:**
Windowing Phase. Verify: open a window (cache miss, ~2s to mount); close it within 500ms; assert no network request completes and `mountedCount()` is 0; no root warning in console.

---

### Pitfall 10: Generated App Hardcodes Colors — Ignores the Theme Variable Contract

**What goes wrong:**
A generated app renders beautifully in the `aurora` theme because the LLM saw the dark purple palette in its context and used `#1b1636`, `#9b7cff`, `rgba(155,124,255,0.5)` as inline style values. Switching to `aqua` or `noir` leaves the app with its original aurora colors while the surrounding OS chrome re-themes correctly. Visually, the app looks like a broken alien artifact inside a properly themed OS.

This is the highest-probability generated-code failure for theming. The LLM is trained on concrete CSS values; CSS variable names require explicit instruction and the model will revert to literals on any generation that lacks a strong prompt constraint.

**Why it happens:**
The current system prompt does not mention CSS variables (the v1.x system prompt was designed before theming existed). The LLM has no knowledge of `--accentA`, `--glass`, `--text`, etc. unless explicitly told. The design file's apps (pomodoro, calc, weather, etc.) all use `var(--accentA)` etc. because they were written by a human; the LLM will not replicate this without instruction.

**How to avoid:**
- **Add the theme variable contract to the system prompt, unconditionally.** List all CSS variable names, their semantic meaning, and example usage. State: "All colors, backgrounds, and borders must use only these CSS custom properties. Never use hex, rgb, or rgba color literals in inline styles or style objects."
- **Add a post-compile static check for color literals in the generated JSX.** A simple regex for `/#[0-9a-f]{3,8}/i` and `/rgba?\s*\(/i` in the generated source should trigger a self-heal attempt with an explicit message: "Generated code contains hardcoded color values. Replace all color literals with CSS custom properties from the theme contract."
- **Test with a theme switch.** The "looks done" version: generated app opens and looks good. The real test: open the app, switch theme 3 times, assert the app's background color changes on each switch.

**Warning signs:**
- Generated app looks correct in `aurora` but wrong in all other themes.
- Switching theme updates the dock and menu bar but leaves open windows unchanged.
- The generate prompt system message does not contain the string `--accentA` (direct check).

**Phase to address:**
Theme-Aware Generation Phase (whichever phase updates the produce system prompt to include the theme contract). Verify: open a cache-miss app with `noir` theme active; assert no hex color literals in the generated JSX source string; switch to `aurora`; assert app background changes.

---

### Pitfall 11: New UI Surfaces Leaking the Mechanic Lexicon

**What goes wrong:**
v2.0 introduces several new UI surfaces that did not exist in v1.x and are not covered by the existing CI lexicon gate patterns: the create panel (the central "Vibe Store" input), window title bar app names, dock tooltips (`title="{{ d.label }}"`), the menu bar "active app" display, loading step text ("Reading your vibe…", "Sketching the layout…", "Wiring up the logic…"), and result card metadata ("vibed just now"). Any of these containing a banned token breaks the hygiene contract.

The specific risk surfaces and their banned-token exposure:

| New v2.0 Surface | Specific Risk |
|---|---|
| Create panel loading step text | "Wiring up the logic" is safe; "Generating code" would not be |
| Result card tag line ("vibed just now") | Safe. But "AI-generated just now" or "synthesized" would not be |
| Window title bar (app name from model output) | The model can return `name: "AI Weather App"` or `name: "Generated Pomodoro"` — the name is displayed verbatim in the title bar |
| Dock tooltip `title` attribute | Same as window title — if app name contains a banned token, the tooltip reveals it |
| Console logs in new windowing/theming code | New code written during v2.0 may inadvertently log "generating…" or "synthesizing theme…" |
| CSS class names on new components | `.window-generated`, `.ai-chrome`, `.synthetic-dock` etc. are all violations |
| IndexedDB records for theme / window layout | The new `theme` and `windowLayout` stores must use neutral key names |

The biggest new risk is **model-generated app names appearing verbatim in the UI**. In v1.x, app names were from a fixed catalog. In v2.0, the create-panel flow generates a `name` field from user input (the `matchApp` function in the design file does this) or from the LLM. If the LLM returns a name like "AI Pomodoro" or "LLM Calculator", it renders in the window title, dock tooltip, and menu bar.

**How to avoid:**
- **Extend the CI lexicon gate** (`hygiene.test.ts`) to cover all new source files: windowing components, theming components, create-panel component, new `generation/prompt.ts` additions.
- **Sanitize model-generated app names before display.** Run the window title / dock label through a filter that strips or replaces any banned token before rendering. The filter should be a shared utility, tested independently.
- **Audit every new string literal in v2.0 code** with a fresh eyes pass at the end of the Windowing and Theming phases. The create panel's step text ("Reading your vibe…", "Sketching the layout…", "Wiring up the logic…", "Pouring the glass…", "Adding the shimmer…") is exemplary — this is the target register for all copy.
- **Never name a CSS class, IndexedDB store, `data-*` attribute, or localStorage key with a banned token.** New stores: `theme-prefs`, `window-layout` (neutral). New CSS: `.window-chrome`, `.dock-item`, `.create-panel` (neutral).

**Warning signs:**
- CI lexicon gate fails on a new component file.
- A generated app with "AI" in its suggested name renders that name in the title bar.
- The dock tooltip for a generated app shows "AI Weather" on hover (visible in F12 DOM inspector).
- New `console.log` in theming code that says "applying theme: aurora" is borderline — never "synthesizing theme".

**Phase to address:**
Cross-cutting Hygiene (all phases). But specifically: Create Panel Phase should gate on name sanitization; Windowing Phase should gate on new CSS class / DOM attribute naming; both should extend the CI gate before merging.

---

### Pitfall 12: Focus Stealing — Window Focus vs. Browser Focus vs. Generated App Input Focus

**What goes wrong:**
When a window is "focused" (brought to front, z-index elevated), the windowing system updates z-order but does not control browser focus (the DOM `focus()` state). This creates three-way confusion:

1. The user clicks a generated app's `<input>` element to start typing. The click raises the window (focus intent fires). The windowing state updates, a re-render occurs, and the `<input>` element loses browser focus because the re-render replaces the container content (if the component key changes) or because a `focusin` handler on the desktop surface steals focus back to the desktop.
2. An opened window should logically receive keyboard focus, but the create panel (`<input>` for the Vibe Store query) may retain focus from the previous action. The user starts typing expecting it to go into the app, but it goes to the create panel.
3. The `onMouseDown`/`onFocus` handler on the title bar (from the design file) fires before the `onClick` in the window body — the focus event chain races with generated app event handlers.

**Why it happens:**
Browser focus is a single stack. Windowing z-order is a CSS property. They are independent and do not automatically coordinate. React's synthetic event system uses event delegation, which means a click anywhere inside the window container will bubble up through the React root to the window manager's handlers before the specific target gets focus.

**How to avoid:**
- Separate "window raise" (z-index update) from "input focus" (browser focus). The `onPointerDown` on the title bar should raise the window; it should NOT call `focus()` on any element. Let the browser's natural focus follow the actual click target.
- Do not call `e.preventDefault()` on `pointerdown` on the window container — only on the drag handle (title bar strip). Preventing default on the full container prevents native focus from reaching `<input>` elements in the generated app.
- If the create panel is always visible, ensure it does not have `autoFocus` or an active `focus()` call that runs after window open. The create panel input should only be focused on deliberate user interaction.
- For the keyboard focus case (opened window should logically receive focus): use `container.focus()` on the window content div (make it `tabIndex={-1}`) after mount, only if no child element already has focus. Do not unconditionally call `focus()`.

**Warning signs:**
- User opens a notes app, clicks inside the text area, starts typing — text appears in the Vibe Store search box instead.
- Opening a window steals focus from another window's input field, resetting its text cursor position.
- The create panel input gains focus spontaneously after any window interaction.

**Phase to address:**
Windowing Phase. Verify: open a generated notes app; click the textarea; type "hello"; assert the text appears in the notes app textarea, not the create panel. Open 2 windows; interact with inputs in both; switching focus between windows via title bar click does not lose the typed text in either.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `setState` on every `pointermove` for drag position | Simple, works at low count | Jank at 3+ windows; forces full window-list reconcile per mouse move | **Never** in shipped code — use `rAF` + imperative style writes (Pitfall 2) |
| Ever-growing `ztop` counter | No reset logic needed | Unbounded integers; can exceed stacking context limits in edge cases | Acceptable for v2.0; add reset/normalization in a later polish phase |
| Theme variables in React context only (not on DOM root) | Idiomatic React | Generated-app separate roots get no theme — catastrophic for theming premise | **Never** — always `document.documentElement.style.setProperty` |
| No cancellation token on produce pipeline | Simpler async code | Leaked roots and wasted API calls when windows closed mid-produce | Acceptable for alpha; add before beta |
| Hardcoded theme colors in generate prompt example | Easier first draft of prompt | All generated apps ignore theme switch | **Never** — theme contract must be in the prompt from day one |
| `transition: background-color 300ms` on `:root` for theme switch | One line, looks good | Cascades on all elements; expensive with backdrop-filter windows | **Never** — use `@property` or opacity crossfade |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `mount.ts` + Window close | `closeWin()` removes state but does not call `unmountApp()` | Wire close handler through a `WindowManager` that owns both state AND `unmountApp` |
| Theme + separate React roots | Setting CSS vars on a React context provider element, not on `document.documentElement` | Always `document.documentElement.style.setProperty('--var', value)` |
| Pointer events + generated apps | Using `mousemove`/`mouseup` instead of Pointer Events API | Use `setPointerCapture` + `pointermove`/`pointerup` exclusively |
| IndexedDB + theme persistence + FOUC | Reading theme from IndexedDB before first paint — async gap causes FOUC | Write theme name to `localStorage` synchronously on change; read `localStorage` in a `<script>` tag before React mounts |
| Backdrop-filter + z-index + stacking contexts | Adding `will-change: transform` to a window ancestor | `will-change` creates a stacking context — scopes child z-indices; only apply to the window element itself |
| Model-generated app names + title bar display | Rendering model output verbatim in title bar | Sanitize name through banned-token filter before display |
| CSS transitions + theme switch + backdrop-filter | Transitioning custom properties without `@property` | Register properties with `@property` or use opacity-crossfade strategy |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `setState` per `pointermove` | Frame drops during drag | `requestAnimationFrame` + imperative style writes; commit to state on `pointerup` only | >2 windows open |
| Backdrop-filter × N windows | GPU layer explosion, dropped frames, software rendering fallback | Limit `display: none` on minimized windows; merge blob layer; degrade on perf detection | 4+ windows on integrated graphics |
| Full-page restyle on theme switch | 16ms+ "Recalculate Style" task | `@property` declarations; avoid transitioning all custom-property-derived values | Anytime with 3+ backdrop-filter windows |
| Blob `filter: blur` + CSS animation | 4 compositor layers × animation = constant repaint pressure | Merge to single canvas/element; `prefers-reduced-motion` fallback | Always on integrated graphics |
| Re-creating root on window re-open | createRoot warning, double mount | Root Map + `root.render(newTree)` for re-open; `unmount()` on close | Every re-open cycle |
| Async produce completes after window close | Wasted API call + leaked root | `AbortController` per window open; check cancellation before `mountApp` | Cache-miss opens that user closes quickly |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Generated app name rendered verbatim in title/dock | Hygiene leak (banned token in UI) + possible XSS if name contains `<script>` | Sanitize name: strip banned tokens + HTML-escape before display |
| Window layout persisted with app instance data including prompt | `prompt` visible in IndexedDB "window-layout" store | Store only layout geometry (x, y, z, min, kind, instanceId) — no prompt, no source |
| CSS transitions on theme switch revealing the transition start color | Indirect source-code inference (start color = previous theme) | Not a security issue; but note it reveals theme history — acceptable |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Window drag breaks when crossing into generated app | User frustration; perceived jankiness | `setPointerCapture` on drag handle (Pitfall 1) |
| Theme switch mid-session shows FOUC or transition jank | Professional-quality product expectation broken | `localStorage` sync read + `@property` transitions (Pitfalls 6, 7) |
| Generated app ignores theme | App looks wrong; breaks OS coherence | Mandate theme contract in prompt + static check + self-heal (Pitfall 10) |
| Focus stolen from app input by window system | Typed text goes to wrong input | Separate raise-window from focus-management (Pitfall 12) |
| Window closed but timers still running | Battery drain; ghost effects | `unmountApp` on every close, always (Pitfall 8) |
| Blobs + backdrop-filter causes dropped frames | Glass aesthetic that works against UX | Performance degradation mode + `prefers-reduced-motion` (Pitfall 4) |

## "Looks Done But Isn't" Checklist

- [ ] **Drag:** Verify drag works when pointer travels into a generated app's content area — not just within the title bar. Test on touch (pointer events, not mouse events).
- [ ] **Text selection during drag:** Hold title bar over a text-heavy generated app for 1 second — no text selection should appear.
- [ ] **Z-order:** Open 5 windows; click the bottom-most one; it must be visually topmost. Verify blob divs cannot overlap any window (check DevTools Layers).
- [ ] **Backdrop-filter count:** Open 4 windows; check DevTools Layers panel; verify no software-compositing fallback on target hardware.
- [ ] **Theme inheritance in separate roots:** Mount a generated app; open DevTools; inspect computed `--accentA` on an element inside the generated app container — it must reflect the current theme value.
- [ ] **Theme FOUC:** Hard-reload with `noir` theme persisted; record screen; verify no aurora flash at any point.
- [ ] **Theme transition jank:** Switch theme with 3 windows open + blob animation; verify <16ms frame time in Performance tab.
- [ ] **Root leak on close:** Open 5 windows; close all; `mountedCount()` must equal 0; heap snapshot shows no React fibers for closed windows.
- [ ] **Cancel on mid-flight close:** Open a cache-miss window; close it within 1s; verify Haiku request is aborted and `mountedCount()` is 0.
- [ ] **Theme-aware generated code:** Open a cache-miss app; source must contain `var(--accentA)` (or equivalent variable) and no hex color literals.
- [ ] **Hygiene — new surfaces:** Run CI lexicon gate on all new files; inspect dock tooltips, window titles, and result card text in DOM inspector; verify no banned tokens.
- [ ] **Focus management:** Open a notes app; click textarea; type — text must appear in the notes app, not the create panel.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Drag breaks mid-flight (no pointer capture) | LOW | Add `setPointerCapture` + `user-select: none` during drag; test across window boundary |
| setState thrash discovered in production | MEDIUM | Refactor drag to `rAF`+imperative style; commit to state on `pointerup`; re-profile |
| Z-index stacking context trap (blob over window) | LOW | Introduce dedicated window container with `isolation: isolate`; separate blob and window layers |
| Backdrop-filter performance crisis on low-end device | MEDIUM | Add blob-layer fallback (remove blur, use solid gradient); reduce window blur radius |
| Theme not inheriting into generated app roots | LOW | Move all `setProperty` calls to `document.documentElement`; remove React-context-only approach |
| FOUC on theme load | LOW | Add `localStorage` sync read in `index.html` `<script>`; suppress transitions on boot |
| Root leak discovered (memory growth) | MEDIUM | Audit every `closeWin` call path; ensure `unmountApp` is called; add `mountedCount() === 0` assertion to test |
| Generated apps ignoring theme (hardcoded colors) | MEDIUM | Update system prompt with theme contract; add post-compile static check; bust cache for affected app types |
| Hygiene leak in new v2.0 surface | LOW–HIGH (depends on surface) | Fix at source; re-run CI gate; rotate any compromised app names in user-facing stores |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Drag — pointer capture lost | Windowing Phase | Drag across generated app area; no stick; no text selection |
| 2. Drag — setState thrash | Windowing Phase | No re-render on `pointermove`; DevTools shows clean frames during drag |
| 3. Z-order — stacking context traps | Windowing Phase | 5-window click-through test; blobs never above windows |
| 4. Backdrop-filter compositing cost | Windowing Phase + Performance Phase | DevTools Layers; no software-composite fallback |
| 5. CSS var inheritance into separate roots | Theming Phase | `getComputedStyle` on element in generated app reflects active theme |
| 6. Theme FOUC on boot | Theming Phase | Hard reload with non-default theme; no flash |
| 7. Theme transition jank | Theming Phase | Frame time <16ms during switch with 3+ windows |
| 8. Root leak on window close | Windowing Phase | `mountedCount() === 0` after all windows closed |
| 9. Unmount during render (mid-flight close) | Windowing Phase | Close during cache-miss; no leaked root; Haiku request aborted |
| 10. Generated app hardcodes colors | Theme-Aware Generation Phase | Post-compile check for hex literals; switch test asserts color change |
| 11. New UI surfaces leaking mechanic lexicon | Cross-cutting Hygiene (all phases) | CI gate extended to new files; name sanitizer tested; DOM audit |
| 12. Focus stealing — window vs. input focus | Windowing Phase | Notes app textarea focus survives window raise; no create-panel focus steal |

## Sources

- MDN — *Pointer Events: Element.setPointerCapture()* (pointer capture for drag; `pointerdown`/`pointermove`/`pointerup`; touch + mouse unification): https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture — HIGH
- MDN — *CSS Stacking Contexts* (when `backdrop-filter`, `filter`, `will-change`, `transform`, `opacity < 1`, `isolation` create stacking contexts): https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index/Stacking_context — HIGH
- MDN — *CSS Custom Properties: @property* (registered properties, animatability, `syntax: '<color>'`, browser support Chrome 85+/Firefox 128+/Safari 16.4+): https://developer.mozilla.org/en-US/docs/Web/CSS/@property — HIGH
- Chrome Developer Blog — *Backdrop-filter compositing and GPU layer costs* (each backdrop-filter creates a compositor layer + backing surface; software fallback): https://developer.chrome.com/blog/hardware-accelerated-animations — MEDIUM (training, corroborated by DevTools layer panel behavior)
- React docs — *createRoot: options* (`onCaughtError`, `onUncaughtError` in React 18.3+/19; warning for double-createRoot on same container): https://react.dev/reference/react-dom/client/createRoot — HIGH
- React docs — *Error Boundaries* (async/event-handler errors not caught by boundaries; `window.onerror` + `unhandledrejection` fallback pattern): https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary — HIGH
- Webkit blog — *backdrop-filter: What Browsers Do* (per-element GPU layer requirement; compositing cost): https://webkit.org/blog/3632/introducing-backdrop-filters/ — MEDIUM
- VibeOS design reference: `design/VibeOS.dc.html` (direct analysis of `startDrag`/`onMove`/`onUp` pattern, `ztop` escalation, `backdrop-filter` usage, theme variable contract, THEMES object, blob animation, window style object) — HIGH (first-party)
- `src/execution/mount.ts` (root Map, `mountApp`/`unmountApp`/`mountedCount` lifecycle, absence of close-side-effect wiring) — HIGH (first-party, direct gap identification)
- `.planning/PROJECT.md` (v2.0 Vibe OS goals, constraints, devtools-hygiene requirements) — HIGH (authoritative project context)
- Existing `.planning/research/PITFALLS.md` v1.x edition (cross-reference for root management Pitfall 7, hygiene Pitfall 5, IndexedDB Pitfall 4) — HIGH

---
*Pitfalls research for: multi-window desktop manager + CSS-variable theming + generated-code mounting on client-only React SPA*
*Researched: 2026-06-26*
