# Phase 25: Real-Browser Smoke Suite — Research

**Researched:** 2026-06-30
**Domain:** Playwright e2e harness extension; layout persistence (IDB); custom-theme FOUC; opaque-origin frame theme broadcast
**Confidence:** HIGH — all findings verified directly from source files; no training-data assumptions.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Extend the EXISTING Playwright harness** — `playwright.config.ts` + `e2e/` (Phase 20 added `e2e/frame-isolation.spec.ts`; `npm run e2e` = `playwright test`). Add the smoke tests there; do not invent a new harness or runner.
- **Playwright is devDependency-only** (`@playwright/test`, already present). ZERO new runtime deps.
- **Three smoke tests, one per requirement** (SMOKE-01, SMOKE-02, SMOKE-03). Run in headless Chromium (CI). No `human_needed` annotations remain for these three behaviors.
- **No production-code change is expected** — this phase is test-only. If a test reveals a real defect, fix it (and note the deviation); otherwise touch only `e2e/` (+ config if strictly needed).

### Claude's Discretion
- How each test seeds state (drive the real UI via Playwright actions vs. pre-seed IDB/localStorage via `page.evaluate`/`addInitScript`) — simplest reliable approach.
- For SMOKE-02's "first paint / no flash", prefer asserting the FOUC script's effect before hydration using established Playwright patterns from `frame-isolation.spec.ts`.
- Whether SMOKE tests need an API key / live generation — prefer the in-tree/seeded path (deterministic + keyless).

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SMOKE-01 | After hard reload, all open windows reappear at saved position, geometry, z-order, and minimized state (Phase 21 round-trip in a real browser) | Layout persisted in IDB `settings["windowLayout"]` via `serializeLayout`; restored by the mount-only effect in `DesktopShellInner`; window position exposed via `style.transform = translate(Xpx, Ypx)`, z-order via `style.zIndex`, minimized via `.window-chrome--minimized` class |
| SMOKE-02 | With an active custom theme, hard reload applies that theme on first paint — no Aurora flash before React hydrates | FOUC script in `index.html` reads `localStorage["marketplace.osTheme"]` and `localStorage["vibe.customTheme.${name}"]` synchronously before any JS module loads; pre-hydration state is capturable via `waitUntil: "domcontentloaded"` |
| SMOKE-03 | Theme switch while an app is open re-skins the frame live without reloading it; in-frame state survives | `SandboxFrame` intentionally excludes `themeVars` from the `srcdoc` memo deps so the iframe element stays stable on theme change; theme reaches the frame via `THEME_PUSH` postMessage from `broadcastTheme()`; frame identity proven by setting `window.__smokeId` before the switch and reading it after |
</phase_requirements>

---

## Summary

Three Playwright specs extend the existing headless-Chromium harness (`e2e/`, `playwright.config.ts`) to close the Phase 21 and Phase 22 `human_needed` gaps and prove RESKIN-01. All three use in-tree seeded apps (Notes, Weather) — both are in `APP_REGISTRY` (the launcher catalog) and have seeded source in `SEEDED_SOURCES`/`SEEDED_DELEGATED`, so zero API calls are needed. The suite is fully deterministic and keyless.

State seeding is the distinguishing challenge across tests: SMOKE-01 drives real UI + waits for the IDB debounce; SMOKE-02 pre-seeds both localStorage and IDB, then reloads to a `domcontentloaded` checkpoint; SMOKE-03 uses a `window`-property marker in the frame to prove non-reload.

**One latent defect in the existing spec is surfaced by this research:** `frame-isolation.spec.ts:57-59` uses `.getByRole("button").nth(3)` to click "Noir", based on 4 pills having sequential indices 0-3. Phase 22 added Duplicate buttons adjacent to each pill — so `nth(3)` now lands on "Aero Duplicate" (which opens the ThemeEditor, not switching to Noir). The Phase 25 planner should flag this in the deviation log and decide whether to patch `frame-isolation.spec.ts` as a zero-scope fix or leave it to Phase 26. The new SMOKE-03 spec MUST use `getByRole("button", { name: "Noir" })` to be resilient.

**Primary recommendation:** write `e2e/smoke.spec.ts` as a single file with three `test.describe` blocks, mirroring the structure of `e2e/frame-isolation.spec.ts`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Layout persistence (SMOKE-01) | Browser/Client (IDB + DesktopShell) | — | `serializeLayout`/`deserializeLayout` in `src/host/layoutPersistence.ts`; written by `realSettingsStore.writeRaw`; read by the mount-only `restoreDesktop()` effect in `DesktopShellInner` |
| Custom-theme first paint (SMOKE-02) | Browser/Client (FOUC inline script) | Browser/Client (VibeThemeProvider post-hydration) | FOUC: inline `<script>` in `index.html` runs synchronously during HTML parse, reads localStorage. Post-hydration: `VibeThemeProvider.refreshCustomThemes()` reads IDB, updates state, re-applies vars |
| Frame theme broadcast (SMOKE-03) | Browser/Client (frameMount + SandboxFrame) | — | `broadcastTheme()` in `src/execution/frameMount.ts` posts `{ type: "THEME_PUSH", payload: { vars } }` to every registered frame. The in-frame bootstrap handles the message and calls `style.setProperty` on `document.documentElement` |

---

## Harness Shape

### `playwright.config.ts` — Verbatim (17 lines)

```typescript
// [VERIFIED: playwright.config.ts:1-18]
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
```

**Critical details:**

| Property | Value | Implication |
|----------|-------|-------------|
| `webServer.command` | `npm run build && npm run preview -- --port 4173 --strictPort` | **Production preview build**, NOT dev server. Build + start timeout: 180s. |
| `baseURL` | `http://localhost:4173` | All `page.goto("/")` calls resolve here |
| `projects` | `[{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]` | Headless Chromium (default), viewport 1280×720 |
| `fullyParallel` | `false` | Tests run serially; new specs must not assume parallel execution |
| `reuseExistingServer` | `!process.env.CI` | CI always rebuilds; local dev reuses a running `vite preview` |
| `trace` | `"off"` | No trace files; tests must assert via explicit Playwright assertions |
| `@playwright/test` | `^1.61.1` [VERIFIED: package.json:25] | Installed: 1.61.1 |

**Chromium headless shell:** Already cached at `~/Library/Caches/ms-playwright/chromium_headless_shell-1228`. `playwright install` is NOT needed locally. In CI, include the install step once.

### `npm run e2e` script

```json
"e2e": "playwright test"    // [VERIFIED: package.json:13]
```

`playwright test` triggers the `webServer` block (build + preview) automatically.

---

## Reference Spec Patterns (`frame-isolation.spec.ts`)

All from [VERIFIED: e2e/frame-isolation.spec.ts:1-176].

### Navigation

```typescript
await page.goto("/");   // line 19
```

No state pre-seeding; no query params. The new specs use the same entry point.

### Opening Seed Apps (No API Key)

```typescript
// line 22-23
await page.getByRole("button", { name: "Open launcher" }).click();
await page.getByRole("button", { name: "Notes", exact: true }).click();
```

- Dock magnifier: `aria-label="Open launcher"` [VERIFIED: Dock.tsx:33]
- App button names match `APP_REGISTRY[*].displayName`

**Which catalog apps are seeded (no API key):** `APP_REGISTRY` contains `weather, calculator, notes, timer, currency, recipes, calendar, budget` [VERIFIED: appRegistry.ts:11-60]. Of these, the ones in `SEEDED_SOURCES` or `SEEDED_DELEGATED` are:
- `notes` — monolithic, in `SEEDED_SOURCES` [VERIFIED: seeds.ts:51-...]
- `weather` — delegated, in `SEEDED_DELEGATED` [VERIFIED: seeds.ts:15]
- `currency` — delegated, in `SEEDED_DELEGATED` [VERIFIED: seeds.ts:15]

`counter` (monolithic seed) is NOT in `APP_REGISTRY` [VERIFIED: appRegistry.ts — no counter entry]. It cannot be opened via the launcher. **For all new specs, use Notes and/or Weather.**

**Frame render timeout:** 30 seconds [VERIFIED: frame-isolation.spec.ts:33,35,161]. Babel compile (first open) drives this window; subsequent session opens are fast.

### Accessing Frame Content

```typescript
// Pattern A — Playwright locator API (for assertions, .locator())
// [VERIFIED: frame-isolation.spec.ts:26-36]
const frame = page.frameLocator("iframe").first();
await expect(frame.locator('input[placeholder="Add a note…"]')).toBeVisible({ timeout: 30_000 });

// Pattern B — Playwright Frame object (for .evaluate())
// [VERIFIED: frame-isolation.spec.ts:42-43, 46]
const appFrame = () => page.frames()[1]!;  // frames()[0] = main page; [1] = first iframe
const childCount = await appFrame().evaluate(
  () => document.getElementById("root")?.childElementCount ?? 0
);
```

`page.frames()[1]!` is stable for a single open app. With multiple iframes, use higher indices or match by content first.

### Theme Switching (REVISED — `nth(3)` is broken after Phase 22)

The existing spec uses:
```typescript
// [VERIFIED: frame-isolation.spec.ts:57-60] — NOW BROKEN after Phase 22
await page
  .getByRole("group", { name: "Color theme" })
  .getByRole("button")
  .nth(3)
  .click();
```

**This is broken after Phase 22:** Phase 22 added a Duplicate button next to each pill [VERIFIED: ThemeSelector.tsx:59-66]. The group now has: Aurora pill, Aurora Duplicate, Aero pill, Aero Duplicate, Aqua pill, Aqua Duplicate, Noir pill, Noir Duplicate, New Theme (9 total). `nth(3)` = "Aero Duplicate", not Noir. Clicking it opens the ThemeEditor instead of switching the theme.

**The new SMOKE-03 spec MUST use the named selector:**

```typescript
// Correct and resilient to button count changes
await page
  .getByRole("group", { name: "Color theme" })
  .getByRole("button", { name: "Noir" })
  .click();
```

This is unambiguous because the Noir pill text is `"Noir"` [VERIFIED: ThemeSelector.tsx:10: `THEME_LABELS = { ..., noir: "Noir" }`] and the Duplicate button has `aria-label="Duplicate Noir"` [VERIFIED: ThemeSelector.tsx:62-63] — Playwright's `{ name: "Noir" }` (without `exact: false`) matches only the button with accessible name exactly equal to "Noir".

---

## Architecture Patterns (New Specs)

### File Location

```
e2e/
├── frame-isolation.spec.ts    # Phase 20 — EXISTING reference
└── smoke.spec.ts              # Phase 25 — NEW (SMOKE-01, SMOKE-02, SMOKE-03)
```

No config changes needed.

### Pattern: Window Position Inspection (SMOKE-01)

Window elements are `.window-chrome` divs [VERIFIED: WindowFrame.tsx:211-219]. Position is encoded in `style.transform = "translate(Xpx, Ypx)"`, z-order in `style.zIndex`, minimized state in the class `window-chrome--minimized`. [VERIFIED: WindowFrame.tsx:231-234]

```typescript
// Locate a window by its title text
const windowLocator = (title: string) =>
  page.locator('.window-chrome', {
    has: page.locator('.window-chrome__title', { hasText: title })
  });

// Read inline style.transform (NOT getComputedStyle — position is inline)
const transform = await windowLocator('Notes').evaluate(
  (el: HTMLElement) => el.style.transform
);
// Returns "translate(200px, 120px)" — parse X/Y from this string

const zIndex = await windowLocator('Notes').evaluate(
  (el: HTMLElement) => el.style.zIndex
);

const isMinimized = await windowLocator('Notes').evaluate(
  (el: HTMLElement) => el.classList.contains('window-chrome--minimized')
);
```

### Pattern: Window Drag (SMOKE-01)

The titlebar has class `window-chrome__titlebar` and is the drag target for `useDrag` [VERIFIED: WindowFrame.tsx:239].

```typescript
const titlebar = windowLocator('Notes').locator('.window-chrome__titlebar');
const bbox = await titlebar.boundingBox();

await page.mouse.move(bbox!.x + bbox!.width / 2, bbox!.y + bbox!.height / 2);
await page.mouse.down();
await page.mouse.move(200, 120, { steps: 10 }); // steps spreads the move for pointermove events
await page.mouse.up();
```

`steps: 10` is required — `useDrag` accumulates deltas from `pointermove` events. A single-step teleport produces a zero delta.

### Pattern: Minimize a Window (SMOKE-01)

```typescript
// aria-label="Minimize" [VERIFIED: WindowFrame.tsx:289]
await windowLocator('Notes').getByRole('button', { name: 'Minimize' }).click();
```

**Important:** `.window-chrome--minimized` maps to `display: none` in the stylesheet [VERIFIED: DesktopShellReskin.test.tsx:107-113 which reads index.css]. Use `toBeAttached()` (not `toBeVisible()`) for minimized windows, or use `evaluate(classList.contains(...))`.

### Pattern: Layout Debounce Wait (SMOKE-01)

The save effect has a 300ms trailing debounce [VERIFIED: DesktopShell.tsx:64]. After the last geometry change, wait ≥500ms before reloading (300ms debounce + IDB write time).

```typescript
await page.waitForTimeout(500);
await page.reload();
```

### Pattern: Custom Theme Seeding (SMOKE-02)

Two stores must be seeded for FOUC-free reload: **localStorage** (for the FOUC script) and **IDB** (for `VibeThemeProvider.refreshCustomThemes()` post-hydration).

**Why both are needed:** The FOUC script reads `localStorage["marketplace.osTheme"]` and `localStorage["vibe.customTheme.${name}"]` [VERIFIED: index.html:87-110]. `VibeThemeProvider` mounts with `theme = readStoredOsTheme()` (from localStorage), then `refreshCustomThemes()` reads IDB async. If IDB is empty, `customThemesState` stays empty, the apply-effect has no `stateVars`, `pendingCustomVarsRef` is null (not set on cold reload), and it falls back to Aurora. [VERIFIED: VibeThemeProvider.tsx:266-295]

**Two-step seeding flow:**

```typescript
// Step 1: addInitScript seeds localStorage before every navigation
await page.addInitScript((vars: Record<string, string>) => {
  localStorage.setItem("marketplace.osTheme", "custom:smoketest");
  localStorage.setItem("vibe.customTheme.smoketest", JSON.stringify(vars));
}, SMOKE_CUSTOM_VARS);

// Step 2: first goto opens the app, which creates MarketplaceRegistry at v3
await page.goto("/");

// Step 3: seed IDB with the custom theme index and vars
await page.evaluate(async (vars: Record<string, string>) => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open("MarketplaceRegistry", 3);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("settings", "readwrite");
      const store = tx.objectStore("settings");
      store.put(
        { key: "customThemeIndex", value: JSON.stringify(["smoketest"]) },
        "customThemeIndex"
      );
      store.put(
        { key: "custom:smoketest", value: JSON.stringify(vars) },
        "custom:smoketest"
      );
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("settings"))
        db.createObjectStore("settings");
    };
  });
}, SMOKE_CUSTOM_VARS);
```

IDB name: `"MarketplaceRegistry"`, version 3, store `"settings"`, record shape `{ key: string; value: string }`, out-of-line key = `record.key`. [VERIFIED: registry/db.ts:24,82-98,101]

### Pattern: Pre-Hydration Assertion (SMOKE-02)

The FOUC script runs synchronously during HTML parsing — before `<script type="module">` (Vite production output). `waitUntil: "domcontentloaded"` captures the page after inline scripts but before ES modules execute. [VERIFIED: index.html:21 — the FOUC script is inline; main.tsx is `type="module"`]

```typescript
// Reload: FOUC has run, React has not yet hydrated
await page.reload({ waitUntil: "domcontentloaded" });

const textAtFouc = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--text").trim()
);
expect(textAtFouc).not.toBe("#f3f1ff"); // not Aurora [VERIFIED: VibeThemeProvider.tsx:82]
expect(textAtFouc).toBe(SMOKE_CUSTOM_VARS["--text"]);

// Let React hydrate and IDB read complete
await page.waitForLoadState("load");
await page.waitForTimeout(500); // refreshCustomThemes() IDB read

const textAfterHydration = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--text").trim()
);
expect(textAfterHydration).toBe(SMOKE_CUSTOM_VARS["--text"]);
```

### Pattern: Frame Non-Reload Proof (SMOKE-03)

`SandboxFrame` excludes `themeVars` from its `srcdoc` useMemo deps [VERIFIED: SandboxFrame.tsx:108-114, comment: "themeVars is intentionally excluded so the iframe element remains stable across theme changes"]. The iframe element is NOT recreated on theme switch — only `THEME_PUSH` is posted. A `window` property survives `THEME_PUSH` but is wiped by a reload.

```typescript
const appFrame = () => page.frames()[1]!;

// Wait for frame to render first
const frame = page.frameLocator("iframe").first();
await expect(frame.locator('input[placeholder="Add a note…"]')).toBeVisible({ timeout: 30_000 });

// Capture pre-switch in-frame --text
const textBefore = await appFrame().evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--text").trim()
);

// Set identity marker on frame window
await appFrame().evaluate(() => { (window as any).__smokeThemeId = 42; });

// Switch to Noir using named selector (resilient to Duplicate button additions)
// [VERIFIED: ThemeSelector.tsx:10 — THEME_LABELS.noir = "Noir"; pill button text = "Noir"]
await page
  .getByRole("group", { name: "Color theme" })
  .getByRole("button", { name: "Noir" })
  .click();

// Wait for THEME_PUSH to apply in-frame (~1 frame; 2s timeout for CI)
await expect
  .poll(
    () => appFrame().evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--text").trim()
    ),
    { timeout: 2_000 }
  )
  .not.toBe(textBefore);

// Marker must survive (frame was NOT reloaded)
const markerAfter = await appFrame().evaluate(() => (window as any).__smokeThemeId);
expect(markerAfter).toBe(42);

// In-frame --text must match Noir [VERIFIED: VibeThemeProvider.tsx:128]
const textAfter = await appFrame().evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--text").trim()
);
expect(textAfter).toBe("#f5eeff"); // Noir --text
```

### Anti-Patterns to Avoid

| Anti-pattern | Why it fails | Use instead |
|---|---|---|
| `page.getByRole("button").nth(3)` inside Color theme group for Noir | After Phase 22, `nth(3)` = "Aero Duplicate", not Noir — it opens ThemeEditor instead of switching theme | `getByRole("button", { name: "Noir" })` |
| `page.getByRole("button", { name: "Counter" })` | Counter is NOT in `APP_REGISTRY` catalog — the launcher won't list it | Use `"Notes"` or `"Weather"` (both catalog + seeded) |
| `page.reload()` for FOUC assertion | Default `waitUntil: "load"` waits past React hydration, missing the pre-hydration window | `page.reload({ waitUntil: "domcontentloaded" })` |
| IDB-only seeding for SMOKE-02 | FOUC script reads localStorage, not IDB | Seed both localStorage (addInitScript) AND IDB (page.evaluate) |
| localStorage-only seeding for SMOKE-02 | VibeThemeProvider falls back to Aurora after hydration when IDB has no customThemeIndex | Seed both stores |
| `toBeVisible()` on minimized window | `display: none` means Playwright's `toBeVisible()` returns false | `toBeAttached()` or `evaluate(classList.contains('window-chrome--minimized'))` |
| Reading `getComputedStyle(el).transform` for window position | Position is set via inline `element.style.transform`; `getComputedStyle` may include matrix notation or browser normalization | `el.style.transform` (inline style only) |
| `page.reload()` within 300ms of last window action | The 300ms layout debounce timer resets; IDB never receives the write | `await page.waitForTimeout(500)` before reload |

---

## Exact Values for Assertions

All [VERIFIED] from source files.

### Theme CSS Variable Values

| Theme | `--text` | `--b1` | Source |
|-------|----------|--------|--------|
| Aurora (DEFAULT) | `#f3f1ff` | `#7c5cff` | VibeThemeProvider.tsx:82,84 |
| Noir (for SMOKE-03 switch) | `#f5eeff` | `#e040fb` | VibeThemeProvider.tsx:128,130 |

### Recommended `SMOKE_CUSTOM_VARS` (SMOKE-02)

All 12 variables required (FOUC script iterates all keys in the stored JSON):

```typescript
const SMOKE_CUSTOM_VARS: Record<string, string> = {
  "--text":   "#003366",   // assertion discriminator — far from Aurora #f3f1ff
  "--wall":   "radial-gradient(130% 110% at 18% 8%, #001122 0%, #000a15 62%)",
  "--b1":     "#0066ff",
  "--b2":     "#0099ff",
  "--b3":     "#00ccff",
  "--b4":     "#0044ff",
  "--glass":  "rgba(0,0,255,0.10)",
  "--glass2": "rgba(0,0,255,0.035)",
  "--bord":   "rgba(0,0,255,0.22)",
  "--hi":     "rgba(0,0,255,0.5)",
  "--accentA":"#0033ff",
  "--accentB":"#0088ff",
};
```

### Storage Key Reference

| Purpose | Key | Storage | Source |
|---------|-----|---------|--------|
| Active theme | `marketplace.osTheme` | localStorage | storage.ts:5 |
| Custom theme vars (FOUC) | `vibe.customTheme.${name}` | localStorage | index.html:89 |
| Window layout | `windowLayout` | IDB `settings` | layoutPersistence.ts:25 |
| Custom theme index | `customThemeIndex` | IDB `settings` | VibeThemeProvider.tsx:225 |
| Custom theme vars | `custom:${name}` | IDB `settings` | VibeThemeProvider.tsx:244 |
| Layout debounce | 300ms | n/a | DesktopShell.tsx:64 |

### IDB Schema

| DB name | Version | Object store | Key type | Record shape |
|---------|---------|-------------|----------|-------------|
| `MarketplaceRegistry` | 3 | `settings` | `string` (out-of-line) | `{ key: string; value: string; [k]: unknown }` |

[VERIFIED: registry/db.ts:24,82-98,101; settingsStore.ts:84-90]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IDB write in `page.evaluate` | Custom helper class | Raw `indexedDB.open()` callback pattern | DB is at v3 after first goto; raw API is 15 lines, no external deps, matches what `page.evaluate` can execute |
| Theme color comparison | Parsing computed RGB/HSL | Compare exact hex strings from source | `style.setProperty` stores the exact string; `getPropertyValue` returns it unchanged |
| Frame non-reload proof | MutationObserver, frame URL check | `window.__smokeThemeId = N` property | Property survives THEME_PUSH postMessage; wiped by a reload — precise signal |

---

## Common Pitfalls

### Pitfall 1: `nth(3)` in Color Theme Group is Now "Aero Duplicate"

**What goes wrong:** After Phase 22 added Duplicate buttons, `getByRole("button").nth(3)` within the Color theme group now selects "Aero Duplicate" (which opens the ThemeEditor), not Noir. Any theme assertion after this click will fail because the theme didn't change — the ThemeEditor modal opened instead.

**Root cause:** Phase 20 spec was written when the group had 4 buttons (4 pills); Phase 22 added 4 Duplicate buttons + 1 New Theme button = 9 total. `nth(3)` was correct for the 4-button layout, incorrect for 9 buttons.

**How to avoid:** Use `getByRole("button", { name: "Noir" })` inside the group. The pill button has text "Noir" [VERIFIED: ThemeSelector.tsx:10]; the Duplicate button has `aria-label="Duplicate Noir"` [VERIFIED: ThemeSelector.tsx:62] — these are different accessible names.

**Impact on existing spec:** `frame-isolation.spec.ts:57-59` is likely broken in the current production build (the Phase 20 spec was not updated after Phase 22 added Duplicate buttons). The Phase 25 planner should decide whether to fix `frame-isolation.spec.ts` as a zero-scope correction alongside the new smoke tests, or flag it as a separate defect.

### Pitfall 2: Reloading Before Layout Debounce Fires

**What goes wrong:** `page.reload()` within 300ms of the last window action — the debounce timer is cancelled and IDB never receives the layout write. After reload, the desktop is blank or shows stale positions.

**Root cause:** `LAYOUT_SAVE_DEBOUNCE_MS = 300` [VERIFIED: DesktopShell.tsx:64]; the save effect fires only after a 300ms quiet period [VERIFIED: DesktopShell.tsx:712-722].

**How to avoid:** `await page.waitForTimeout(500)` after the last window action (open, drag, minimize). 500ms = 300ms debounce + ~200ms IDB write buffer.

**Warning signs:** After reload, `page.locator('.window-chrome')` has count 0, or all windows are at default cascade positions regardless of any dragging done.

### Pitfall 3: Custom Theme Seeding Without IDB

**What goes wrong:** Seeding only localStorage for SMOKE-02 — the FOUC script applies custom vars (first assertion passes), but `VibeThemeProvider` falls back to Aurora after hydration.

**Root cause:** `refreshCustomThemes()` reads `customThemeIndex` from IDB [VERIFIED: VibeThemeProvider.tsx:225]. If absent, `customThemesState = new Map()` (empty). The apply-effect: no `stateVars`, `pendingCustomVarsRef.current` is null on cold reload (not set unless `setTheme(name, vars)` was called) → `applyVarsToRoot(VIBE_THEMES["aurora"])`. [VERIFIED: VibeThemeProvider.tsx:285-292]

**How to avoid:** Seed BOTH localStorage (via `addInitScript`) AND IDB (via `page.evaluate` after `page.goto("/")`), then reload.

### Pitfall 4: Frame Index Drift with Multiple Iframes

**What goes wrong:** SMOKE-03 opens one app (Notes), sets a marker on `page.frames()[1]`, then later (due to a bug or test ordering) a second iframe exists — `page.frames()[1]` is now a different frame.

**Root cause:** `page.frames()` returns frames in page order; index shifts as iframes are added or removed.

**How to avoid:** For SMOKE-03, keep exactly one app open. Verify the frame is the right one by first asserting visible content via `page.frameLocator("iframe").first()`, then use `page.frames()[1]` for evaluate calls.

### Pitfall 5: Minimized Window `toBeVisible` Fails

**What goes wrong:** `await expect(windowLocator('Notes')).toBeVisible()` fails for a minimized window because `display: none` is applied via the `.window-chrome--minimized` stylesheet rule.

**Root cause:** `display: none` means Playwright considers the element "hidden", not "visible". [VERIFIED: DesktopShellReskin.test.tsx:107-113 reads index.css for this rule]

**How to avoid:** For minimized windows, use `toBeAttached()` (element exists in DOM) or `evaluate(el.classList.contains('window-chrome--minimized'))`.

---

## SMOKE-01 Implementation Blueprint

**Goal:** Two windows open → drag to distinct positions, minimize one → wait 500ms → reload → assert positions and minimized state preserved.

```typescript
// [File: e2e/smoke.spec.ts — SMOKE-01 section]

const windowLocator = (page: Page, title: string) =>
  page.locator('.window-chrome', {
    has: page.locator('.window-chrome__title', { hasText: title })
  });

test.describe("SMOKE-01 — window layout persists across hard reload", () => {
  test("two open windows restore at saved positions and minimized state", async ({ page }) => {
    await page.goto("/");

    // Open Notes (seed, monolithic — no API key)
    await page.getByRole("button", { name: "Open launcher" }).click();
    await page.getByRole("button", { name: "Notes", exact: true }).click();
    await expect(windowLocator(page, "Notes")).toBeVisible({ timeout: 10_000 });

    // Open Weather (seed, delegated — idle view needs no API key)
    await page.getByRole("button", { name: "Open launcher" }).click();
    await page.getByRole("button", { name: "Weather", exact: true }).click();
    await expect(windowLocator(page, "Weather")).toBeVisible({ timeout: 10_000 });

    // Drag Notes to a distinct position
    const notesTitlebar = windowLocator(page, "Notes").locator(".window-chrome__titlebar");
    const nBbox = await notesTitlebar.boundingBox();
    await page.mouse.move(nBbox!.x + nBbox!.width / 2, nBbox!.y + nBbox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(200, 120, { steps: 10 });
    await page.mouse.up();

    // Drag Weather to a different position
    const weatherTitlebar = windowLocator(page, "Weather").locator(".window-chrome__titlebar");
    const wBbox = await weatherTitlebar.boundingBox();
    await page.mouse.move(wBbox!.x + wBbox!.width / 2, wBbox!.y + wBbox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(500, 250, { steps: 10 });
    await page.mouse.up();

    // Minimize Weather
    await windowLocator(page, "Weather").getByRole("button", { name: "Minimize" }).click();

    // Capture pre-reload geometry (inline style.transform, not getComputedStyle)
    const notesTransform = await windowLocator(page, "Notes").evaluate(
      (el: HTMLElement) => el.style.transform
    );
    const notesZ = await windowLocator(page, "Notes").evaluate(
      (el: HTMLElement) => el.style.zIndex
    );

    // Wait for 300ms debounce + IDB write
    await page.waitForTimeout(500);
    await page.reload();

    // Assert Notes restored at saved position
    await expect(windowLocator(page, "Notes")).toBeAttached({ timeout: 10_000 });
    const notesTransformAfter = await windowLocator(page, "Notes").evaluate(
      (el: HTMLElement) => el.style.transform
    );
    expect(notesTransformAfter).toBe(notesTransform);

    // Assert Weather is present and minimized
    await expect(windowLocator(page, "Weather")).toBeAttached({ timeout: 10_000 });
    const weatherMinimized = await windowLocator(page, "Weather").evaluate(
      (el: HTMLElement) => el.classList.contains("window-chrome--minimized")
    );
    expect(weatherMinimized).toBe(true);

    // Desktop not blank: both window elements present
    await expect(page.locator(".window-chrome")).toHaveCount(2);
  });
});
```

---

## SMOKE-02 Implementation Blueprint

**Goal:** Seed custom theme in localStorage + IDB → reload to domcontentloaded → assert custom theme on `:root` (FOUC stage) → wait for hydration → assert custom theme still active.

```typescript
// [File: e2e/smoke.spec.ts — SMOKE-02 section]

const SMOKE_CUSTOM_VARS: Record<string, string> = {
  "--text":   "#003366",
  "--wall":   "radial-gradient(130% 110% at 18% 8%, #001122 0%, #000a15 62%)",
  "--b1":     "#0066ff",
  "--b2":     "#0099ff",
  "--b3":     "#00ccff",
  "--b4":     "#0044ff",
  "--glass":  "rgba(0,0,255,0.10)",
  "--glass2": "rgba(0,0,255,0.035)",
  "--bord":   "rgba(0,0,255,0.22)",
  "--hi":     "rgba(0,0,255,0.5)",
  "--accentA":"#0033ff",
  "--accentB":"#0088ff",
};
const AURORA_TEXT = "#f3f1ff"; // [VERIFIED: VibeThemeProvider.tsx:82]

test.describe("SMOKE-02 — custom theme on first paint, no Aurora flash", () => {
  test("hard reload applies custom theme before React hydrates", async ({ page }) => {
    // Seed localStorage before every navigation (addInitScript runs before each page.goto/reload)
    await page.addInitScript((vars: Record<string, string>) => {
      localStorage.setItem("marketplace.osTheme", "custom:smoketest");
      localStorage.setItem("vibe.customTheme.smoketest", JSON.stringify(vars));
    }, SMOKE_CUSTOM_VARS);

    // First goto: React mounts and calls openRegistry() — DB exists at v3
    await page.goto("/");

    // Seed IDB: write customThemeIndex and custom:smoketest vars
    await page.evaluate(async (vars: Record<string, string>) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("MarketplaceRegistry", 3);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("settings", "readwrite");
          const store = tx.objectStore("settings");
          store.put({ key: "customThemeIndex", value: JSON.stringify(["smoketest"]) }, "customThemeIndex");
          store.put({ key: "custom:smoketest", value: JSON.stringify(vars) }, "custom:smoketest");
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        };
        req.onupgradeneeded = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings");
        };
      });
    }, SMOKE_CUSTOM_VARS);

    // Reload to domcontentloaded: FOUC inline script has run, ES modules not yet loaded
    await page.reload({ waitUntil: "domcontentloaded" });

    // Pre-hydration assertion: FOUC applied custom theme to :root
    const textAtFouc = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--text").trim()
    );
    expect(textAtFouc).not.toBe(AURORA_TEXT);  // no Aurora flash at first paint
    expect(textAtFouc).toBe(SMOKE_CUSTOM_VARS["--text"]); // custom value present

    // Let React hydrate and VibeThemeProvider.refreshCustomThemes() read IDB
    await page.waitForLoadState("load");
    await page.waitForTimeout(500);

    // Post-hydration assertion: custom theme survived React mount (IDB seed worked)
    const textAfterHydration = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--text").trim()
    );
    expect(textAfterHydration).toBe(SMOKE_CUSTOM_VARS["--text"]);
  });
});
```

---

## SMOKE-03 Implementation Blueprint

**Goal:** Open Notes → set frame identity marker → switch to Noir → assert frame `--text` changed AND marker survived (frame not reloaded).

```typescript
// [File: e2e/smoke.spec.ts — SMOKE-03 section]

test.describe("SMOKE-03 — live theme switch does not reload open frame", () => {
  test("switching theme re-skins the frame; in-frame state survives", async ({ page }) => {
    await page.goto("/");

    // Open Notes (seed — renders in opaque-origin iframe in production build)
    await page.getByRole("button", { name: "Open launcher" }).click();
    await page.getByRole("button", { name: "Notes", exact: true }).click();

    // Wait for frame content to appear
    const frame = page.frameLocator("iframe").first();
    await expect(
      frame.locator('input[placeholder="Add a note…"]')
    ).toBeVisible({ timeout: 30_000 });

    // page.frames()[1] is the sole app frame (frames()[0] = main page)
    const appFrame = () => page.frames()[1]!;

    // Capture pre-switch in-frame --text
    const textBefore = await appFrame().evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--text").trim()
    );

    // Set identity marker on the frame's window object
    await appFrame().evaluate(() => { (window as any).__smokeThemeId = 42; });

    // Switch to Noir using the named button (resilient to Duplicate button additions)
    // aria-label "Duplicate Noir" is different from text "Noir", so this selects the pill
    await page
      .getByRole("group", { name: "Color theme" })
      .getByRole("button", { name: "Noir" })
      .click();

    // Wait for THEME_PUSH to reach the frame and update :root (~1 frame; 2s CI timeout)
    await expect
      .poll(
        () => appFrame().evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue("--text").trim()
        ),
        { timeout: 2_000 }
      )
      .not.toBe(textBefore);

    // Frame identity marker must survive (no reload occurred)
    const markerAfter = await appFrame().evaluate(() => (window as any).__smokeThemeId);
    expect(markerAfter).toBe(42);

    // In-frame --text must match Noir's contract value
    const textAfter = await appFrame().evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--text").trim()
    );
    expect(textAfter).toBe("#f5eeff"); // Noir --text [VERIFIED: VibeThemeProvider.tsx:128]
  });
});
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `@playwright/test` 1.61.1 [VERIFIED: package.json:25] |
| Config file | `playwright.config.ts` (repo root) |
| Run command | `npm run e2e` |
| Test dir | `e2e/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SMOKE-01 | Windows restore to saved position/z/minimized after reload | e2e (Playwright/Chromium) | `npm run e2e` | ❌ Wave 0: `e2e/smoke.spec.ts` |
| SMOKE-02 | Custom theme on first paint, no Aurora flash, after reload | e2e (Playwright/Chromium) | `npm run e2e` | ❌ Wave 0: `e2e/smoke.spec.ts` |
| SMOKE-03 | Theme switch re-skins frame live, no reload, state survives | e2e (Playwright/Chromium) | `npm run e2e` | ❌ Wave 0: `e2e/smoke.spec.ts` |

### Sampling Rate

- **Per task commit:** `npm run e2e` (all 5 specs: 2 existing + 3 new)
- **Per wave merge:** `npm run e2e && npm test` (e2e + vitest 936 existing tests)
- **Phase gate:** Both suites green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `e2e/smoke.spec.ts` — new file; covers SMOKE-01, SMOKE-02, SMOKE-03

No new test infrastructure needed — `playwright.config.ts` and Chromium cover all three specs.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@playwright/test` | All 3 smoke specs | Yes | 1.61.1 | — |
| Chromium headless shell | Playwright test run | Yes | 1228 (cached at `~/Library/Caches/ms-playwright/`) | — |
| Vite build + preview | `playwright.config.ts` webServer | Yes | 8.x | — |
| MarketplaceRegistry IDB v3 | SMOKE-02 IDB seeding | Yes (created on first page.goto) | v3 | — |

**Missing dependencies with no fallback:** None.

---

## Security Domain

SMOKE specs are test infrastructure, not production code. No ASVS controls apply. Test code must not log or transmit `marketplace.apiKey`. Each test runs in a fresh Playwright browser context (default isolation — localStorage and IDB are clean per test unless explicitly seeded).

---

## Hygiene Notes

### Lexicon gate does NOT scan `e2e/`

The gate walks `src/**` and `index.html` only [VERIFIED: hygiene.test.ts:75 — `const SRC_DIR = resolve(REPO_ROOT, "src")`]. `e2e/smoke.spec.ts` is entirely exempt. Comments, describe strings, and helper names in the spec file are unrestricted.

### What to still avoid

Spec strings that assert on UI copy must naturally agree with production copy (already gated). Test selector strings like `.window-chrome__titlebar` or `aria-label="Open launcher"` contain no banned tokens.

### Production code impact

Zero. This phase writes only `e2e/smoke.spec.ts`. If a test reveals a production defect (e.g., SMOKE-01 finds the layout restore is broken), that is a separate deviation to address and document.

### Latent defect in existing spec

`e2e/frame-isolation.spec.ts:57-59` uses `.getByRole("button").nth(3)` which selects "Aero Duplicate" after Phase 22's Duplicate buttons were added (not Noir as originally intended). The planner should evaluate whether to include a minimal fix to `frame-isolation.spec.ts` within Phase 25 scope (zero production-code change; 3-line fix to the existing spec) or treat it as a separate tracked defect.

---

## Assumptions Log

All claims in this research were verified from source file reads. No `[ASSUMED]` tags were used.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | — | — | — |

**This table is empty:** All claims are [VERIFIED] or [CITED] with file:line references.

---

## Open Questions

1. **Fix `frame-isolation.spec.ts:57-59` in Phase 25 scope?** The `nth(3)` bug is a latent defect in the existing Phase 20 spec introduced by Phase 22. Options: (a) fix it alongside the new smoke tests (3-line change, no production code affected, keeps the full e2e suite green), or (b) treat as a separate tracking item. The planner decides.

2. **Minimized window `toBeAttached()` vs class check:** Both work for proving the window element exists in DOM while minimized. `toBeAttached()` is simpler; `evaluate(classList.contains(...))` simultaneously proves both attachment and the correct CSS class. The blueprint uses both. The planner can simplify to one pattern.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `human_needed` annotation for layout restore (Phase 21) | Playwright SMOKE-01 | Phase 25 | CI-verifiable; closes Phase 21 gap |
| `human_needed` annotation for FOUC | Playwright SMOKE-02 | Phase 25 | CI-verifiable; closes Phase 22 gap |
| No automated RESKIN-01 proof | Playwright SMOKE-03 | Phase 25 | Closes Phase 23 behavioral gap |
| `nth(3)` for Noir pill (Phase 20 spec) | `getByRole("button", { name: "Noir" })` | Phase 25 | Robust to Duplicate button additions |

---

## Sources

### Primary (HIGH confidence — direct file reads this session)

- `playwright.config.ts:1-18` — webServer command, baseURL, projects, timeout, fullyParallel
- `e2e/frame-isolation.spec.ts:1-176` — full reference spec; launch, seed, frame access, theme selector patterns
- `package.json:13,25` — `e2e` script, `@playwright/test` version
- `src/host/layoutPersistence.ts:25,34-43` — `LAYOUT_KEY = "windowLayout"`, `LayoutEntry` 7-field shape
- `src/ui/DesktopShell.tsx:64,712-843` — `LAYOUT_SAVE_DEBOUNCE_MS = 300`, save effect, `restoreDesktop()` effect
- `src/ui/VibeThemeProvider.tsx:80-141,163-295` — VIBE_THEMES values, `readStoredOsTheme`, apply-effect, `pendingCustomVarsRef` logic, `refreshCustomThemes`
- `src/ui/WindowFrame.tsx:211-237,279-293` — `style.transform` position, `style.zIndex`, `.window-chrome--minimized` class, Minimize button `aria-label`
- `src/ui/SandboxFrame.tsx:105-115` — `srcdoc` memo excludes `themeVars`; frame stays stable on theme change
- `src/execution/frameMount.ts:45-57,407-415` — `broadcastTheme` sends `THEME_PUSH`; in-frame handler applies vars to `:root`
- `src/registry/db.ts:24,82-98,101` — IDB name `"MarketplaceRegistry"`, v3, `settings` store schema
- `src/host/settingsStore.ts:84-90` — `writeRaw` key+value shape
- `src/lib/storage.ts:5` — `STORAGE_KEY_OS_THEME = "marketplace.osTheme"`
- `index.html:21-113` — FOUC inline script; reads `marketplace.osTheme` + `vibe.customTheme.${name}` from localStorage
- `src/hygiene.test.ts:75,108-109` — gate scans `SRC_DIR` (`src/`) only; `e2e/` exempt
- `src/apps/seeds.ts:1-16` — `SEEDED_SOURCES` keys (`counter`, `notes`); `SEEDED_DELEGATED` set (`weather`, `currency`)
- `src/data/appRegistry.ts:11-60` — full catalog; no `counter` entry; `notes` and `weather` confirmed present
- `src/ui/Dock.tsx:33` — `aria-label="Open launcher"` button
- `src/ui/ThemeSelector.tsx:10,17-22,46-68` — `THEME_LABELS`, `THEME_NAMES` order, pill + Duplicate button structure, `aria-label="Duplicate ${name}"`
- `src/ui/DesktopShellReskin.test.tsx:107-113` — confirms `.window-chrome--minimized` = `display:none` in `index.css`
- `~/Library/Caches/ms-playwright/` directory listing — Chromium headless shell 1228 already cached

### Secondary (MEDIUM confidence)

- Playwright documentation behavior (implied): `devices["Desktop Chrome"]` = 1280×720 viewport, headless is the default when no `--headed` flag is passed.

---

## Metadata

**Confidence breakdown:**
- Harness shape: HIGH — all values from config and package.json
- SMOKE-01 selectors and mechanics: HIGH — all from WindowFrame.tsx, DesktopShell.tsx source
- SMOKE-02 seed strategy: HIGH — FOUC script logic from index.html, IDB schema from registry/db.ts, VibeThemeProvider fallback logic verified
- SMOKE-03 frame-identity proof: HIGH — SandboxFrame.tsx memo deps and frameMount.ts THEME_PUSH handler verified
- Theme selector `nth(3)` defect: HIGH — ThemeSelector.tsx button structure verified; Duplicate buttons present after Phase 22

**Research date:** 2026-06-30
**Valid until:** 2026-07-30 (recheck if VibeThemeProvider, SandboxFrame, or ThemeSelector are modified)

---

## RESEARCH COMPLETE

**Phase:** 25 — Real-Browser Smoke Suite
**Confidence:** HIGH

### Key Findings

1. The harness is a production-preview build (`vite build && vite preview --port 4173`), single headless Chromium project, `fullyParallel: false`, 180s build timeout. New specs drop into `e2e/smoke.spec.ts` with zero config changes.

2. The keyless deterministic path uses Notes and Weather — both in `APP_REGISTRY` (launcher catalog) and having seeded sources (Notes: monolithic in `SEEDED_SOURCES`, Weather: delegated in `SEEDED_DELEGATED`). Counter is seeded-only (not in catalog) and cannot be opened via the launcher.

3. **SMOKE-01:** open Notes + Weather via UI, drag to distinct positions, minimize one, `waitForTimeout(500)` for 300ms debounce + IDB write, `page.reload()`, assert `style.transform` and `.window-chrome--minimized` class match pre-reload values.

4. **SMOKE-02:** requires seeding BOTH localStorage (via `addInitScript`) AND IDB (via `page.evaluate` after first goto). `page.reload({ waitUntil: "domcontentloaded" })` captures the pre-hydration window where the FOUC script has applied custom vars but React hasn't run. Assert `--text ≠ #f3f1ff` (not Aurora) and `= #003366` (custom) at FOUC stage, then re-assert after `waitForLoadState("load")`.

5. **SMOKE-03:** `SandboxFrame` excludes `themeVars` from srcdoc memo deps — the iframe element is stable across theme changes. The `window.__smokeThemeId = 42` marker proves no reload. Use `getByRole("button", { name: "Noir" })` (not `nth(3)`) to switch theme robustly.

6. **Latent defect surfaced:** `frame-isolation.spec.ts:57-59` uses `nth(3)` which now selects "Aero Duplicate" after Phase 22 added Duplicate buttons. The planner should decide whether to fix this within Phase 25 scope.

7. The lexicon gate scans `src/**` only — `e2e/` specs are exempt.

8. Chromium headless shell is already cached (`chromium_headless_shell-1228`); no install needed.

### File Created

`.planning/phases/25-real-browser-smoke-suite/25-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Harness shape | HIGH | All values read from `playwright.config.ts` and `package.json` |
| SMOKE-01 selectors | HIGH | WindowFrame.tsx:211-237; DesktopShell.tsx:64; layoutPersistence.ts:25 |
| SMOKE-02 seed strategy | HIGH | index.html FOUC script; registry/db.ts schema; VibeThemeProvider fallback logic |
| SMOKE-03 frame-identity | HIGH | SandboxFrame.tsx:108-114 memo comment; frameMount.ts:407-415 THEME_PUSH handler |
| `nth(3)` defect | HIGH | ThemeSelector.tsx button structure: 4 pills × 2 buttons = 8 + 1 New Theme = 9 total |
| Catalog vs. seed app availability | HIGH | appRegistry.ts full file read: no `counter` entry confirmed |

### Open Questions

1. Fix `frame-isolation.spec.ts:57-59` (`nth(3)` → named Noir selector) within Phase 25 scope? 3-line fix, no production code change.
2. For minimized window assertions in SMOKE-01: use `toBeAttached()` alone or combine with `evaluate(classList.contains(...))` for stronger proof?

### Ready for Planning

Research complete. Planner can now create PLAN.md files for `e2e/smoke.spec.ts` covering all three smoke tests.
