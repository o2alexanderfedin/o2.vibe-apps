# Phase 22: Theme Editor & Custom Themes — Research

**Researched:** 2026-06-30
**Domain:** CSS custom-property theme editor, IDB custom-key storage, FOUC prevention, THEME_PUSH broadcasting
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Storage is additive, no DB version bump: custom themes persist under the `"custom:<name>"` key namespace in the existing IDB `settings` store via `writeRaw`/`readRaw`. No migration, no new object store.
- Name collision guard: `"custom:<name>"` IDB key namespace prevents collision with the four built-in names. A user-supplied name equal to a built-in (e.g. `"aurora"`) is rejected or auto-namespaced to `"custom:aurora"`; built-in Aurora stays accessible and unmodified.
- `sanitizeDisplayName` MUST be applied to user-supplied theme names before any DOM render OR any IDB write.
- Live preview mutates `:root` vars without saving — editing color pickers re-skins the desktop in real time; persistence only on explicit Save.
- Invalid color values are rejected before any IDB write via a `CSS.supports(...)` gate; the current theme is unchanged on rejection.
- THEME_PUSH to frames: activating a custom theme must call the same `broadcastTheme(vars)` path introduced in Phase 20 so the host AND all open opaque-origin frames re-skin live.
- FOUC invariant: mirror the active custom theme's vars to `localStorage["vibe.customTheme.<name>"]` at save time; extend the first-paint FOUC script to apply the active custom theme when the stored selection starts with `"custom:"`. **Any change to the inline FOUC script REQUIRES recomputing the `csp.test.ts` SHA-256 hash in the SAME commit** — non-negotiable.
- 12-variable contract is the surface for the editor. Do not introduce new theme vars.
- All v1.0/v1.1/v2.0/v3.0 cross-cutting constraints remain acceptance criteria: HYGIENE-01..07, single Anthropic egress, sourcemaps-off, CSP allowlist, IoC/DI via ServicesProvider, additive-IDB-only.

### Claude's Discretion
- Alpha-color inputs for `--glass` / `--glass2` vars: recommendation is a validated text field gated by `CSS.supports`, to keep one consistent validation path.
- Editor layout/placement, contrast-warning presentation, and component decomposition are at Claude's discretion, consistent with existing menu-bar / theme-switcher and window-chrome conventions.

### Deferred Ideas (OUT OF SCOPE)
- None — discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| THEME-06 | Theme editor opens from menu bar, edits the 12-var contract with native color inputs and live preview (mutating `:root` in real time); invalid color rejected before save (`CSS.supports` gate) | §Theme Foundation, §Color Input Reality, §Architecture Patterns |
| THEME-07 | Custom themes can be named, saved, duplicated-from-a-built-in, and deleted; persisted in IDB `settings` store under `custom:<name>`; names sanitized and namespaced; built-ins read-only; deleting active theme auto-switches to Aurora | §settingsStore Seam, §Enumeration Strategy, §sanitizeDisplayName |
| THEME-08 | Saved custom theme appears in menu-bar switcher alongside built-ins; selecting it re-skins host AND all open frames live (THEME_PUSH) | §Menu-Bar Theme Switcher, §broadcastTheme |
| THEME-09 | Custom theme survives reload FOUC-free: vars mirrored to `localStorage` at save; FOUC script applies active custom theme on first paint; `csp.test.ts` SHA-256 updated in same commit | §FOUC Script (Highest-Risk Item) |
| THEME-10 | Editor shows inline, non-blocking WCAG-AA contrast warning on low-contrast text/background pairing | §Contrast Warning |
</phase_requirements>

---

## Summary

Phase 22 builds a theme editor over the 12-variable CSS contract established in Phase 14. All relevant infrastructure already exists: `VibeThemeProvider` owns the contract and the live-apply path, `broadcastTheme` pushes vars to opaque-origin frames (Phase 20), `writeRaw`/`readRaw` provides the IDB seam (Phase 21), and `sanitizeDisplayName` guards user-supplied names (Phase 18).

The research reveals three places where existing code must change beyond adding new files: (1) `VibeThemeContextValue` must be extended to expose `currentVars` and `customThemes` so `DesktopShell.tsx:842` does not break when the active theme name is `"custom:xxx"`, (2) the inline FOUC script in `index.html` must be extended to handle `"custom:*"` names in `localStorage`, triggering an SHA-256 recompute in the same commit, and (3) `ThemeSelector.tsx` must render custom-theme pills alongside the four built-in pills and provide an entry point into the editor.

`CSS` is not defined in JSDOM 29 (confirmed by code execution). Every test that exercises `CSS.supports`-based validation must define `window.CSS = { supports: vi.fn().mockReturnValue(true) }` in its `beforeEach`.

**Primary recommendation:** extend `VibeThemeContextValue` with `currentVars` and `customThemes`; use an index key `"customThemeIndex"` for enumeration (no interface change to `SettingsStore`); apply `CSS.supports("background", value)` universally across all 12 vars for one consistent validation path.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Live preview (`:root` mutation) | Browser / Client | — | `document.documentElement.style.setProperty` is a synchronous browser DOM call; no React state involved until Save |
| Custom theme persistence | IDB / Storage | — | `writeRaw("custom:<name>", JSON.stringify(vars))` in the `settings` store; localStorage is only the FOUC mirror |
| Custom theme enumeration | IDB / Storage | React state | Index key `"customThemeIndex"` loaded on mount; carried in React state for the switcher |
| FOUC prevention | Browser / Client | — | Inline script in `index.html` runs synchronously before React mounts; localhost mirror feeds it |
| THEME_PUSH to frames | Host (postMessage) | — | `broadcastTheme(vars)` posts to all registered `frameRefs`; unchanged function, new caller |
| Color validation gate | Browser API | — | `CSS.supports("background", value)` — browser engine validates, not hand-rolled parser |
| Contrast advisory | Frontend logic | — | Pure function over parsed RGB/hex values; no browser API needed |
| Theme switcher (custom pills) | Frontend / React | — | `ThemeSelector` extension renders custom pills from context-provided list |
| Theme editor modal | Frontend / React | — | New `ThemeEditor` component mounted from `DesktopShell` or `MenuBar` |
| Name sanitization | Frontend logic | — | `sanitizeDisplayName` already in `src/ui/sanitizeDisplayName.ts`; called before any DOM render or IDB write |

---

## 1. Theme Foundation (Phase 14)

### The 12-Variable Contract

**File:** `src/ui/VibeThemeProvider.tsx` [VERIFIED: read in full]

Lines 41–101 define `VIBE_THEMES: Record<VibeThemeName, Record<string, string>>` — the four built-in themes each mapping to the same 12 CSS custom properties:

| Variable | Aurora value | Category |
|----------|-------------|----------|
| `--text` | `#f3f1ff` | Color (hex) |
| `--wall` | `radial-gradient(130% 110% at 18% 8%, #1b1636 0%, #0c0a18 62%)` | Gradient |
| `--b1` | `#7c5cff` | Color (hex) |
| `--b2` | `#22d3ee` | Color (hex) |
| `--b3` | `#ff6ec4` | Color (hex) |
| `--b4` | `#34d399` | Color (hex) |
| `--glass` | `rgba(255,255,255,0.10)` | Color (rgba with alpha) |
| `--glass2` | `rgba(255,255,255,0.035)` | Color (rgba with alpha) |
| `--bord` | `rgba(255,255,255,0.22)` | Color (rgba with alpha) |
| `--hi` | `rgba(255,255,255,0.5)` | Color (rgba with alpha) |
| `--accentA` | `#9b7cff` | Color (hex) |
| `--accentB` | `#36d6f0` | Color (hex) |

Seven vars are hex colors (usable with `<input type="color">`). Four carry alpha (`--glass`, `--glass2`, `--bord`, `--hi`). One is a gradient string (`--wall`). All can be validated by `CSS.supports("background", value)`.

### How Built-in Themes Are Applied

`applyVibeTheme(name: VibeThemeName)` at line 128–133 iterates the map and calls `document.documentElement.style.setProperty(prop, value)` for each var. This function is called inside a `useEffect` on mount and on every theme change.

### How `setTheme` Works

`setTheme` at lines 146–166 in the `useCallback` block:
1. `setThemeState(name)` — updates React state
2. `localStorage.setItem(STORAGE_KEY_OS_THEME, name)` — persists for next-reload read
3. `void settingsStore.write(name)` — fire-and-forget IDB mirror
4. `broadcastTheme(VIBE_THEMES[name])` — pushes vars to all live frames

For custom themes, step 3 becomes `settingsStore.writeRaw("custom:<name>", JSON.stringify(vars))` (or `settingsStore.write` is unchanged for the selection name), and step 4 becomes `broadcastTheme(customThemeVars)`.

### Critical Coupling: VibeThemeContext → DesktopShell

`src/ui/DesktopShell.tsx:841–842` [VERIFIED]:
```typescript
const themeCtx = useContext(VibeThemeContext);
const currentThemeVars = VIBE_THEMES[themeCtx?.theme ?? "aurora"];
```

This lookup returns `undefined` when `themeCtx.theme` is `"custom:xxx"` (not a key in `VIBE_THEMES`). `currentThemeVars` is passed to `SandboxFrame` at line 943 as `themeVars={currentThemeVars}`, so this will break unless Phase 22 also updates this line.

**Fix required:** Add `currentVars: Record<string, string>` to `VibeThemeContextValue`. `DesktopShell` then uses `themeCtx?.currentVars ?? VIBE_THEMES["aurora"]` instead of the `VIBE_THEMES[...]` lookup.

### VibeThemeName Type Extension

Current type at line 25:
```typescript
export type VibeThemeName = "aurora" | "aero" | "aqua" | "noir";
```

Phase 22 needs to accept `"custom:<name>"` strings. Recommended extension (TypeScript 4.1+ template literal types):
```typescript
export type CustomThemeName = `custom:${string}`;
export type AnyThemeName = VibeThemeName | CustomThemeName;
```

The context setter becomes `setTheme: (name: AnyThemeName) => void` and `theme: AnyThemeName`. All existing `VibeThemeName` literals in VIBE_THEMES lookups still compile because they remain valid `VibeThemeName` values.

---

## 2. The Inline FOUC Script (Highest-Risk Item)

### Location and Current Behavior

**File:** `index.html:21–94` — the `<script>` block (no `src` attribute, runs synchronously before React mounts). [VERIFIED: read in full]

The FOUC script currently (lines 87–93):
```javascript
var vibeStored = localStorage.getItem('marketplace.osTheme');
var vibeTheme = VIBE_THEMES[vibeStored] ? vibeStored : 'aurora';
var vars = VIBE_THEMES[vibeTheme];
for (var k in vars) {
  document.documentElement.style.setProperty(k, vars[k]);
}
```

It looks up `vibeStored` in the hard-coded `VIBE_THEMES` object (lines 29–86). Custom theme names (`"custom:xxx"`) are not in that object, so the current script would fall back to Aurora on reload — causing the forbidden FOUC.

### Required Extension (Phase 22)

Phase 22 must add a branch after the built-in lookup. When `vibeStored` starts with `"custom:"`, read the mirrored vars from `localStorage["vibe.customTheme.<name>"]` (the mirror written at Save time), parse JSON, and apply. If the mirror is absent (edge case: user cleared localStorage but IDB still has the theme), fall back to Aurora.

Pseudocode for the new branch:
```javascript
if (vibeStored && vibeStored.indexOf('custom:') === 0) {
  var customName = vibeStored.slice(7);
  try {
    var raw = localStorage.getItem('vibe.customTheme.' + customName);
    var customVars = raw ? JSON.parse(raw) : null;
    if (customVars && typeof customVars === 'object') {
      for (var k in customVars) {
        document.documentElement.style.setProperty(k, customVars[k]);
      }
    } else {
      vars = VIBE_THEMES['aurora'];
      for (var k in vars) { document.documentElement.style.setProperty(k, vars[k]); }
    }
  } catch (_) {
    vars = VIBE_THEMES['aurora'];
    for (var k in vars) { document.documentElement.style.setProperty(k, vars[k]); }
  }
} else {
  // existing: vibeTheme already applied above
}
```

### SHA-256 Hash Invariant (Non-Negotiable)

**The CSP hash mechanism:**

`csp.test.ts` (`src/csp.test.ts:73–87`) [VERIFIED: read in full] recomputes the SHA-256 of the EXACT bytes between `<script>` and `</script>` in `index.html`, then asserts that the `script-src` directive in the CSP meta tag contains `'sha256-<hash>'`. If the hash is stale, the test fails CI. In production, the browser would refuse to run the script.

**Current FOUC script hash** (confirmed by running `node -e "...createHash..."` against the live file): `sha256-lbdl+fs2oGJ9PUrXbgMIg0tWiqh+N0sPwD/8u/894VQ=` [VERIFIED]

**Recompute procedure after editing the FOUC script:**

Step 1 — Compute the new hash from the edited file:
```bash
node -e "const {createHash}=require('crypto'),{readFileSync}=require('fs'); \
const h=readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1]; \
console.log('sha256-'+createHash('sha256').update(h,'utf8').digest('base64'))"
```

Step 2 — Replace the old hash in `index.html`'s CSP meta tag `script-src` directive (line 19) with the new hash. The replacement is in-place in index.html itself — one occurrence of `sha256-lbdl+...` in the `content` attribute.

Step 3 — Verify both hash guards pass:
```bash
npx vitest run src/csp.test.ts src/frameCsp.test.ts
```

`csp.test.ts` checks the FOUC script hash. `frameCsp.test.ts` checks the frame bootstrap script hash — the frame srcdoc is unaffected by FOUC script edits, so `frameCsp.test.ts` should pass without change.

**Important:** `csp.test.ts` is self-validating — it recomputes the hash from the live file on every run. You cannot "pin" the hash in the test; you update it in the CSP meta tag in `index.html`.

### What NOT to Put Inside the FOUC Script

The hygiene gate (`src/hygiene.test.ts`) scans `index.html` for banned tokens. The FOUC script body must not contain `"synthesize"`, `"fake"`, `"mock"`, `"AI"`, `"llm"`, or `"generate"` (case-insensitive where applicable). The word `"custom"` is fine.

---

## 3. `broadcastTheme(vars)` / THEME_PUSH

### Exact Signature and Call Site

**File:** `src/execution/frameMount.ts:45–57` [VERIFIED: read in full]

```typescript
export function broadcastTheme(vars: Record<string, string>): void {
  for (const [, el] of frameRefs) {
    if (!el.isConnected) continue;
    try {
      el.contentWindow?.postMessage({ type: "THEME_PUSH", payload: { vars } }, "*");
    } catch (err) {
      logger.error("Frame mount: broadcastTheme failed for a frame: " + String(err));
    }
  }
}
```

It iterates `frameRefs: Map<string, HTMLIFrameElement>` (registered by `registerFrame`/`unregisterFrame`) and posts `THEME_PUSH` to each connected frame's `contentWindow`.

**Current call site:** `src/ui/VibeThemeProvider.tsx:164`:
```typescript
broadcastTheme(VIBE_THEMES[name]);
```

For custom themes, the call becomes:
```typescript
broadcastTheme(customThemeVars); // where customThemeVars is the resolved Record<string, string>
```

The frame-side handler at `frameMount.ts` lines 407–415 (inside the srcdoc bootstrap) already handles `THEME_PUSH` by iterating the vars and calling `document.documentElement.style.setProperty`. No frame-side change is needed.

### Test Pattern for THEME_PUSH

From `src/ui/VibeThemeProvider.test.tsx:109–123` [VERIFIED]:
```typescript
const broadcast = vi
  .spyOn(frameMountModule, "broadcastTheme")
  .mockImplementation(() => {});
// ... click a pill ...
expect(broadcast).toHaveBeenCalledTimes(1);
expect(broadcast).toHaveBeenCalledWith(VIBE_THEMES.noir);
```

Phase 22 tests for custom-theme activation use the same spy pattern with a custom vars object.

---

## 4. settingsStore Seam (Phase 21)

### Interface

**File:** `src/host/settingsStore.ts:14–31` [VERIFIED: read in full]

```typescript
export interface SettingsStore {
  write(value: string): Promise<void>;
  read(): Promise<string | null>;
  writeRaw(key: string, value: string): Promise<void>;
  readRaw(key: string): Promise<string | null>;
}
```

`writeRaw` and `readRaw` were added in Phase 21 (plan 21-01). The production implementation (`realSettingsStore` at lines 48–106) opens the `settings` IDB store, performs a `db.put("settings", record, key)` / `db.get("settings", key)`, and always swallows errors (best-effort pattern). `RecordingSettingsStore` in `src/services/testServices.ts:85–130` is the in-memory test double.

### Custom Theme Storage Pattern

| Operation | Key | Value |
|-----------|-----|-------|
| Write theme data | `"custom:<name>"` | `JSON.stringify(Record<string, string>)` — the 12-var map |
| Write enumeration index | `"customThemeIndex"` | `JSON.stringify(string[])` — ordered array of custom names |
| Write active selection | via existing `write(name)` | `"custom:<name>"` or built-in name (stored under `SETTINGS_KEY = "osTheme"`) |

### Enumeration Strategy (Recommended: Index Key)

The `SettingsStore` interface has no `listKeys` method. The simplest approach that requires zero interface changes:

Maintain an **index key** `"customThemeIndex"` that stores a JSON array of theme names:

```typescript
// On save/create:
const newNames = [...existingNames, sanitizedName];
await settingsStore.writeRaw("customThemeIndex", JSON.stringify(newNames));
await settingsStore.writeRaw(`custom:${sanitizedName}`, JSON.stringify(vars));

// On delete:
const remaining = existingNames.filter(n => n !== name);
await settingsStore.writeRaw("customThemeIndex", JSON.stringify(remaining));
// (The theme data key "custom:<name>" can be left in IDB as a tombstone or deleted
//  if SettingsStore is extended with a deleteRaw method — see below.)

// On load (VibeThemeProvider mount effect):
const raw = await settingsStore.readRaw("customThemeIndex");
const names: string[] = raw ? JSON.parse(raw) : [];
for (const name of names) {
  const varsJson = await settingsStore.readRaw(`custom:${name}`);
  if (varsJson) customMap.set(name, JSON.parse(varsJson));
}
```

**Atomicity caveat:** Two sequential `writeRaw` calls (theme data + index) are not atomic. If the process crashes between them, the index may be out of sync. Recovery: on load, for each name in the index, if the theme data key is absent, skip and remove from in-memory state. The discrepancy self-heals on the next save.

**Alternative (cleaner, requires interface change):** Add `listRawKeys(prefix: string): Promise<string[]>` to `SettingsStore`. Production: `db.getAllKeys("settings").then(keys => keys.filter(k => k.startsWith(prefix)))`. Test double: iterate `rawCurrentMap.keys()`. This eliminates the atomicity issue. The index key approach is recommended for Phase 22 simplicity; the planner may choose either.

**Delete support:** If deleting theme data (not just removing from the index) is desired, add `deleteRaw(key: string): Promise<void>` to the interface. The production impl uses `db.delete("settings", key)`. Leaving orphaned theme-data keys in IDB is also acceptable (they are unreachable via the index).

---

## 5. Menu-Bar Theme Switcher (Phase 19)

### Current Structure

**File:** `src/ui/MenuBar.tsx:46–48` [VERIFIED: read in full]:
```tsx
<div className="menu-bar__right">
  <ThemeSelector />
  ...
</div>
```

**File:** `src/ui/ThemeSelector.tsx` [VERIFIED: read in full]:
```tsx
const THEME_NAMES: ReadonlyArray<VibeThemeName> = ["aurora", "aero", "aqua", "noir"];

export function ThemeSelector() {
  const { theme, setTheme } = useVibeTheme();
  return (
    <div className="theme-selector" role="group" aria-label="Color theme">
      {THEME_NAMES.map((name) => (
        <button
          key={name}
          type="button"
          className={`theme-selector__pill${theme === name ? " theme-selector__pill--active" : ""}`}
          aria-pressed={theme === name}
          onClick={() => setTheme(name)}
        >
          {THEME_LABELS[name]}
        </button>
      ))}
    </div>
  );
}
```

### Where Phase 22 Hooks In

The `ThemeSelector` (or a new `ThemeSwitcher` that replaces it) must:
1. Read `customThemes: ReadonlyMap<string, Record<string, string>>` from the extended `VibeThemeContext`
2. Render custom-theme pills after the 4 built-in pills, using the same `theme-selector__pill` class and `aria-pressed` pattern
3. Add an "Add theme" or "Themes" button/entry that triggers `onOpenEditor` callback
4. Handle `aria-label` on the group (keep `"Color theme"` if the group contains the editor trigger, or adjust)

The hook point is in `ThemeSelector.tsx` itself (extend it) or replace the `<ThemeSelector />` render in `MenuBar.tsx` with a new component. Either works; extending `ThemeSelector` is the minimal change.

**Test implication:** `src/ui/MenuBar.test.tsx:71–78` asserts exactly four pills labeled Aurora, Aero, Aqua, Noir. This test must be updated or supplemented when custom theme pills are added.

---

## 6. localStorage Theme Mirror (for FOUC)

### Current Keys

| Key | Written by | Read by |
|-----|-----------|---------|
| `"marketplace.osTheme"` (= `STORAGE_KEY_OS_THEME`) | `VibeThemeProvider.setTheme` at `VibeThemeProvider.tsx:155` | FOUC script at `index.html:87`; `readStoredOsTheme()` at `VibeThemeProvider.tsx:114–123` |

### Phase 22 Additions

| Key | Written by | Read by |
|-----|-----------|---------|
| `"vibe.customTheme.<name>"` | Phase 22 save path (after user clicks Save) | FOUC script (extended) at `index.html` |

**At Save time:**
```typescript
localStorage.setItem(`vibe.customTheme.${sanitizedName}`, JSON.stringify(vars));
localStorage.setItem(STORAGE_KEY_OS_THEME, `custom:${sanitizedName}`);
```

**At Delete time (if the deleted theme was active):** Switch to `"aurora"`, remove the active-selection key or set it back to `"aurora"`, remove `vibe.customTheme.<name>`. The FOUC script does not need to handle the "deleted but still active" case because deletion triggers an immediate switch to Aurora before the user reloads.

**At Delete time (if the deleted theme was NOT active):** Remove `vibe.customTheme.<name>` from localStorage and from the IDB index.

**Key space note:** The `"vibe.customTheme.*"` namespace is distinct from `"marketplace.*"` — no collision with existing keys.

---

## 7. Color Input Reality

### Summary of the 12 Vars by Input Pattern

| Input pattern | Variables |
|---------------|-----------|
| Hex (can use `<input type="color">`) | `--text`, `--b1`, `--b2`, `--b3`, `--b4`, `--accentA`, `--accentB` (7 vars) |
| rgba with alpha (text input required) | `--glass`, `--glass2`, `--bord`, `--hi` (4 vars) |
| Gradient string (text input required) | `--wall` (1 var) |

### Validation Gate

The CONTEXT.md settled decision: validated text field gated by `CSS.supports` for ALL vars (one consistent path).

**Universal validator:** `CSS.supports("background", value)` accepts hex colors (`#rrggbb`), rgb/rgba values, gradients (`radial-gradient(...)`, `linear-gradient(...)`), and CSS keywords. This covers all 12 var types with one call.

**Typed property approach (optional precision):** For vars that are strictly colors (not gradients), `CSS.supports("color", value)` is more semantic. But `CSS.supports("background", value)` is simpler and correct for all 12 — recommended.

**JSDOM gap:** `window.CSS` is `undefined` in JSDOM 29 [VERIFIED: confirmed by executing the test]. Test files that exercise the validation gate must define a stub:
```typescript
beforeEach(() => {
  Object.defineProperty(window, "CSS", {
    value: { supports: vi.fn().mockReturnValue(true) },
    writable: true,
    configurable: true,
  });
});
```

To test the rejection branch, use `vi.fn().mockReturnValue(false)`.

**Alpha-bearing vars (`--glass`, `--glass2`, `--bord`, `--hi`):** Use a standard `<input type="text">` with a placeholder like `rgba(255,255,255,0.10)`. The `CSS.supports("background-color", value)` call is the only gate — no additional range sliders needed per the CONTEXT.md recommendation.

**`--wall` (gradient):** Use a `<input type="text">` with a placeholder showing an Aurora-style gradient. `CSS.supports("background", value)` validates it. This var is excluded from the contrast check (gradients can't be parsed to a single color).

**For hex vars:** An `<input type="color">` controls the hex value visually; the text field alongside it is optional. Using text-only inputs for all 12 vars is the simplest consistent approach and matches the CONTEXT.md recommendation.

---

## 8. Contrast Warning (WCAG AA, THEME-10)

### Existing Color Utilities

No contrast ratio or WCAG utility exists anywhere in the codebase [VERIFIED: grep for `luminance`, `contrast`, `wcag` returned no matches]. `src/execution/colorCheck.ts` only checks for saturated hardcoded colors in generated code — not relevant here.

### Required Helper (Pure, Zero Deps)

A small pure helper in a new file (e.g. `src/ui/contrastRatio.ts`):

```typescript
// linearize a sRGB channel value [0..1] per WCAG 2.1
function linearize(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Relative luminance per WCAG 2.1 §1.4.3
function relativeLuminance(r255: number, g255: number, b255: number): number {
  const r = linearize(r255 / 255);
  const g = linearize(g255 / 255);
  const b = linearize(b255 / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Parse "#rgb" or "#rrggbb" hex to [r, g, b] in 0..255.
// Returns null for non-hex (rgba, gradient — cannot compute contrast).
function parseHex(value: string): [number, number, number] | null {
  const m = value.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  const s = m[1];
  if (s.length === 3) {
    return [
      parseInt(s[0] + s[0], 16),
      parseInt(s[1] + s[1], 16),
      parseInt(s[2] + s[2], 16),
    ];
  }
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

// Returns the WCAG contrast ratio (≥1.0) between two color strings.
// Returns null if either value is not a parseable hex color (e.g. gradient, rgba).
export function contrastRatio(fg: string, bg: string): number | null {
  const fgRgb = parseHex(fg);
  const bgRgb = parseHex(bg);
  if (!fgRgb || !bgRgb) return null;
  const L1 = relativeLuminance(...fgRgb);
  const L2 = relativeLuminance(...bgRgb);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}
```

**Advisory threshold:** WCAG AA requires 4.5:1 for normal text. Show the inline warning when `contrastRatio(vars["--text"], vars["--b1"]) < 4.5` (and the same for other relevant text-on-background pairs). The warning is non-blocking — the user can still save.

**Which pairs to check:** `--text` vs `--b1`, `--text` vs `--b2`, `--accentA` vs `--b1`. Gradient vars (`--wall`, `--glass`, etc.) return `null` from `contrastRatio` and are skipped.

**This helper is fully testable in JSDOM** — it is pure math, no DOM or browser API.

---

## 9. Common Pitfalls

### Pitfall 1: FOUC Hash Not Updated in Same Commit
**What goes wrong:** FOUC script edited but `sha256-...` in the CSP meta tag not updated — `csp.test.ts` fails CI; in production, the browser silently refuses to run the first-paint script.
**Why it happens:** Forgetting the two-step process (edit → recompute → update meta tag).
**How to avoid:** Run the hash recompute command immediately after editing the FOUC script body. Treat the two changes (script body + meta tag hash) as one atomic edit.
**Warning signs:** `csp.test.ts` fails with "missing sha256 source" error.

### Pitfall 2: DesktopShell.tsx:842 Not Updated
**What goes wrong:** `VIBE_THEMES["custom:myTheme"]` returns `undefined`, so `SandboxFrame` receives `themeVars={undefined}`, and `buildSrcdoc` writes no `:root` vars into the frame — frames render un-themed.
**Why it happens:** Forgetting that `DesktopShell` looks up the vars by name in `VIBE_THEMES`, not via context.
**How to avoid:** Add `currentVars: Record<string, string>` to `VibeThemeContextValue`; update `DesktopShell:842` to use `themeCtx?.currentVars ?? VIBE_THEMES["aurora"]`.
**Warning signs:** Custom theme appears to work in the host but iframe-mounted apps show wrong colors.

### Pitfall 3: CSS.supports Not Defined in JSDOM
**What goes wrong:** `CSS.supports(...)` throws `TypeError: Cannot read properties of undefined (reading 'supports')` in tests.
**Why it happens:** JSDOM 29 does not implement the global `CSS` object [VERIFIED].
**How to avoid:** Add a `window.CSS = { supports: vi.fn().mockReturnValue(true) }` stub in the `beforeEach` of any test that exercises validation logic.
**Warning signs:** Tests throw on the `CSS.supports` line rather than failing an assertion.

### Pitfall 4: VibeThemeName Type Mismatch After Extension
**What goes wrong:** TypeScript errors in `setTheme` callers when `VibeThemeName` is widened to include `CustomThemeName`.
**Why it happens:** `ThemeSelector.tsx` passes `VibeThemeName` values (the 4 built-in literals) to `setTheme`; if `setTheme` now accepts `AnyThemeName`, the type is compatible — but test spies may record `VibeThemeName` arguments.
**How to avoid:** Use `AnyThemeName = VibeThemeName | CustomThemeName`; the 4 built-in literals are still valid `AnyThemeName` values. Existing callers compile without change.

### Pitfall 5: Custom Theme Names Leaking Banned Tokens
**What goes wrong:** A user-entered name like "Aurora AI Theme" slips through and reaches the DOM; the hygiene gate catches the string if it appears in source, but the runtime name is not source-scanned.
**Why it happens:** The name comes from user input at runtime — the hygiene gate only scans authored source.
**How to avoid:** `sanitizeDisplayName(name)` MUST be called before the name is used in any JSX string, aria-label, or IDB key. This removes `"AI"`, `"synthesize*"`, and other banned words at runtime.
**Warning signs:** A custom theme name with `"AI"` in it would pass `sanitizeDisplayName` by removing the word — verify the fallback `"App"` case handles empty-after-strip names gracefully.

### Pitfall 6: Isolation/Sandbox Words in ThemeEditor User Copy
**What goes wrong:** Copy in `ThemeEditor.tsx` like `"Customize your theme environment"` or `"Edit colors in isolation"` trips HYGIENE-07.
**Why it happens:** `PHASE20_FILES` in `hygiene.test.ts:245` does not include `ThemeEditor.tsx` yet — but the general hygiene gate (`BANNED` set) scans all of `src/**` and will catch `"isolation"` anywhere in quoted literals.
**How to avoid:** Use neutral product copy: "Color theme", "Save theme", "Reset to built-in", "Delete theme", "New theme", "Color palette". The words "sandbox", "iframe", and "isolation" must not appear in any quoted string literal in ThemeEditor.tsx.

### Pitfall 7: Custom Theme Vars Mirror Missing from localStorage at First Save
**What goes wrong:** A custom theme is saved to IDB but `localStorage["vibe.customTheme.<name>"]` is never written, so the FOUC script cannot apply it on reload — Aurora flash.
**Why it happens:** Forgetting the localStorage mirror step.
**How to avoid:** The save path MUST write both: `writeRaw("custom:<name>", JSON.stringify(vars))` AND `localStorage.setItem("vibe.customTheme.<name>", JSON.stringify(vars))`. These are different targets (IDB and localStorage) with different keys.

---

## 10. Architecture Patterns

### System Architecture Diagram

```
User edits a color field
        │
        ▼
ThemeEditor component
  ├── [live preview] document.documentElement.style.setProperty(k, v)
  │        (per-keystroke, no save)
  │
  └── [Save button]
       │
       ├── sanitizeDisplayName(name)
       ├── CSS.supports("background", value)  ← gate; reject if false
       ├── settingsStore.writeRaw("custom:<name>", JSON.stringify(vars))
       ├── settingsStore.writeRaw("customThemeIndex", JSON.stringify([...names]))
       ├── localStorage.setItem("vibe.customTheme.<name>", JSON.stringify(vars))
       ├── localStorage.setItem(STORAGE_KEY_OS_THEME, "custom:<name>")
       ├── VibeThemeContext.setTheme("custom:<name>")  ← triggers:
       │        ├── setThemeState("custom:<name>")
       │        ├── applyThemeVars(vars)  ← setProperty on :root
       │        ├── settingsStore.write("custom:<name>")  (optional IDB mirror of selection)
       │        └── broadcastTheme(vars)  ← THEME_PUSH to all frames
       └── refreshCustomThemes()  ← re-reads index from provider state

On reload (before React mounts):
index.html FOUC script
  ├── localStorage.getItem("marketplace.osTheme") → "custom:myTheme"
  ├── vibeStored.startsWith("custom:")  → true
  ├── localStorage.getItem("vibe.customTheme.myTheme") → JSON string
  └── JSON.parse → vars → setProperty on :root  (no Aurora flash)

ThemeSelector (menu bar):
  ├── Built-in pills: [Aurora] [Aero] [Aqua] [Noir]
  ├── Custom pills: [myTheme] [darkMode]  (from VibeThemeContext.customThemes)
  └── [+] or [Themes] button → opens ThemeEditor
```

### Recommended Project Structure

```
src/
├── ui/
│   ├── ThemeEditor.tsx          # New — editor modal/panel
│   ├── ThemeEditor.test.tsx     # New — TDD
│   ├── contrastRatio.ts         # New — pure WCAG helper
│   ├── contrastRatio.test.ts    # New — pure function tests
│   ├── ThemeSelector.tsx        # Modify — add custom pills + editor trigger
│   ├── ThemeSelector.test.tsx   # Modify — update pill count assertion
│   ├── VibeThemeProvider.tsx    # Modify — extend context, load custom themes
│   └── VibeThemeProvider.test.tsx  # Modify — extend for custom theme assertions
├── lib/
│   └── storage.ts               # No change (STORAGE_KEY_OS_THEME is the selection key)
└── index.html                   # Modify — extend FOUC script (hash must update in same commit)
```

### Pattern: Extended VibeThemeContextValue

```typescript
// src/ui/VibeThemeProvider.tsx (extended)
export type CustomThemeName = `custom:${string}`;
export type AnyThemeName = VibeThemeName | CustomThemeName;

export interface VibeThemeContextValue {
  theme: AnyThemeName;
  currentVars: Record<string, string>;      // NEW — resolved vars for any theme
  setTheme: (name: AnyThemeName) => void;
  customThemes: ReadonlyMap<string, Record<string, string>>; // NEW — keyed by name (without "custom:" prefix)
  refreshCustomThemes: () => Promise<void>; // NEW — reloads index from IDB
}
```

`VibeThemeProvider` on mount: `readRaw("customThemeIndex")` → load each `readRaw("custom:<n>")` → populate state.

### Pattern: CSS.supports Validation Gate

```typescript
// In ThemeEditor save handler:
function isValidValue(value: string): boolean {
  try {
    // CSS is not defined in JSDOM — guard for test environments
    return typeof CSS !== "undefined" && CSS.supports("background", value);
  } catch {
    return false;
  }
}

if (!isValidValue(newValue)) {
  setError(`"${newValue}" is not a valid CSS value`);
  return; // never reaches IDB write
}
```

### Pattern: Custom Theme Save

```typescript
// ThemeEditor save flow (simplified):
async function saveTheme(name: string, vars: Record<string, string>) {
  const sanitized = sanitizeDisplayName(name);
  const idbKey = `custom:${sanitized}`;
  const lsKey = `vibe.customTheme.${sanitized}`;
  const serialized = JSON.stringify(vars);

  await settingsStore.writeRaw(idbKey, serialized);
  const indexRaw = await settingsStore.readRaw("customThemeIndex");
  const names: string[] = indexRaw ? JSON.parse(indexRaw) : [];
  if (!names.includes(sanitized)) names.push(sanitized);
  await settingsStore.writeRaw("customThemeIndex", JSON.stringify(names));

  try {
    localStorage.setItem(lsKey, serialized);
    localStorage.setItem(STORAGE_KEY_OS_THEME, idbKey);
  } catch { /* best-effort */ }

  setTheme(idbKey as AnyThemeName);   // triggers broadcastTheme
  await refreshCustomThemes();
}
```

### Anti-Patterns to Avoid

- **Storing compiled Function objects in IDB:** Store JSON strings only. Re-instantiate on load. (Existing rule from CLAUDE.md.)
- **Calling setTheme with a raw user string (unsanitized):** Always `sanitizeDisplayName` first. The sanitized name is what appears in the `custom:<name>` key and in the DOM.
- **Applying live preview to IDB:** Live preview ONLY mutates `:root` CSS vars; it does NOT write to IDB or localStorage until Save is explicitly clicked.
- **Holding built-in themes as read-write:** `VIBE_THEMES` must remain the authoritative source for built-in theme data; custom themes are loaded from IDB/state.
- **Deleting without switching away first:** If the active theme is deleted, call `setTheme("aurora")` BEFORE deleting the IDB key and localStorage entry. The CONTEXT.md requirement says "auto-switches to Aurora first."

---

## 11. Testing Patterns

### Test Infrastructure (Unchanged)

Framework: **Vitest + @testing-library/react + jsdom** (all in `vite.config.ts:test`). `fake-indexeddb/auto` is installed globally in `src/test/setup.ts:4`. `createRecordingSettingsStore()` in `src/services/testServices.ts` is the test double for IDB writes.

`nyquist_validation: false` in `.planning/config.json` — no formal test requirement mapping, but the project's standard practice is TDD (write tests before implementation).

### Test Wrapper Pattern

```typescript
// Standard wrapper for theme-related tests (established in ThemeSelector.test.tsx)
function renderWithServices(ui: ReactNode, settingsStore = createRecordingSettingsStore()) {
  return render(
    <ServicesProvider services={createTestServices({ settingsStore })}>
      <VibeThemeProvider>{ui}</VibeThemeProvider>
    </ServicesProvider>,
  );
}
```

Phase 22 tests may need to pre-populate `settingsStore` with custom theme data before rendering.

### Key Tests to Write

| Behavior | Test approach |
|----------|--------------|
| Live preview mutates `:root` | Render ThemeEditor; change input value; assert `document.documentElement.style.getPropertyValue("--text")` updated |
| CSS.supports rejection | Stub `window.CSS.supports` to return `false`; trigger save; assert `writeRaw` NOT called; error message shown |
| Save writes correct IDB keys | Trigger save; assert `store.rawWriteCount("custom:myTheme") === 1` and value is parseable JSON with 12 vars |
| THEME_PUSH on activation | Spy on `broadcastTheme`; activate custom theme; assert called with the custom vars map |
| Custom theme in switcher | After loading provider with pre-populated index; assert custom theme pill appears in ThemeSelector |
| Delete active theme → auto-switch | Delete active custom theme; assert `localStorage.getItem(STORAGE_KEY_OS_THEME)` === `"aurora"` |
| Built-in names rejected/auto-namespaced | Pass `"aurora"` as name; assert `writeRaw` called with `"custom:aurora"` key, NOT `"aurora"` |
| `sanitizeDisplayName` applied | Pass name containing banned token; assert sanitized name used in IDB key |
| Reload FOUC coverage | Covered by `csp.test.ts` (hash guard) — no separate JSDOM test needed for the script logic; the FOUC script is vanilla JS in index.html and can be smoke-tested by direct execution in a JSDOM environment if desired |
| Contrast warning appears | Set `--text` and `--b1` to low-contrast pair; assert warning element is rendered |

### JSDOM Stubs Required for ThemeEditor Tests

```typescript
beforeEach(() => {
  // CSS.supports is not defined in JSDOM 29
  Object.defineProperty(window, "CSS", {
    value: { supports: vi.fn().mockReturnValue(true) },
    writable: true,
    configurable: true,
  });
  localStorage.clear();
  document.documentElement.style.cssText = "";
});
afterEach(() => {
  cleanup();
  document.documentElement.style.cssText = "";
});
```

---

## 12. Hygiene Gate

### Current Scope

**Repo-wide banned tokens** (`src/hygiene.test.ts:46–53`): `synthesize*`, `fake`, `mock`, `AI` (case-sensitive word boundary), `llm`, `generate*/generated*/generating`.

**HYGIENE-07 isolation-word gate** (`hygiene.test.ts:304–350`): `PHASE20_FILES` at line 245 lists only Phase 20 files. Phase 22 must extend this list to include `src/ui/ThemeEditor.tsx` in the explicit coverage check (per the `hygiene.test.ts:158–192` coverage assertion pattern).

### What Must NOT Appear in ThemeEditor

- No quoted string literals containing `"iframe"`, `"sandbox"`, `"isolation"` (HYGIENE-07)
- No text containing `synthesi`, `fake`, `mock`, `AI` (as an acronym), `llm`, `generate`, `generated`, `generating`
- Safe copy: "Color theme", "Themes", "Save", "Reset", "Delete", "New theme", "Color palette", "Label", "Background"

### `sanitizeDisplayName` Location

**File:** `src/ui/sanitizeDisplayName.ts:29–51` [VERIFIED: read in full]

```typescript
export function sanitizeDisplayName(name: string): string
```

Strips 6 banned patterns (synthesize, fake, mock, AI acronym, llm, generate family). Collapses whitespace, trims. Returns `"App"` if result is empty. Phase 22 calls this on the user-supplied theme name before: (1) rendering the name in any DOM element, (2) using the name as part of an IDB key, (3) using the name in `localStorage`.

---

## 13. Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| CSS color validation | A regex parser for all CSS color formats | `CSS.supports("background", value)` — browser engine validates |
| IDB access | Raw IndexedDB callbacks | `writeRaw`/`readRaw` via the existing `settingsStore` seam |
| Frame theme push | Custom postMessage code | `broadcastTheme(vars)` from `src/execution/frameMount.ts` |
| Name sanitization | New regex list for banned tokens | `sanitizeDisplayName` from `src/ui/sanitizeDisplayName.ts` |
| WCAG contrast formula | Third-party library | Inline pure function — 10 lines, zero deps, easily testable |

**Key insight:** Every infrastructure piece for Phase 22 already exists. The work is wiring, extension, and new UI — not new infrastructure.

---

## 14. Code Examples

### Verified: broadcastTheme call pattern

```typescript
// Source: src/ui/VibeThemeProvider.tsx:164 (verified)
broadcastTheme(VIBE_THEMES[name]);

// Phase 22 extension (custom theme activation):
broadcastTheme(customThemeVars); // Record<string, string>
```

### Verified: CSS custom property application

```typescript
// Source: src/ui/VibeThemeProvider.tsx:128-133 (verified)
function applyVibeTheme(name: VibeThemeName): void {
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(VIBE_THEMES[name])) {
    root.style.setProperty(prop, value);
  }
}

// Phase 22 live preview (custom vars):
function applyCustomThemeVars(vars: Record<string, string>): void {
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(vars)) {
    root.style.setProperty(prop, value);
  }
}
```

### Verified: writeRaw usage pattern

```typescript
// Source: src/host/settingsStore.ts:79-89 (verified)
async writeRaw(key: string, value: string): Promise<void> {
  // best-effort, never throws
}
// Usage from settingsStore.raw.test.ts:
await realSettingsStore.writeRaw("windowLayout", JSON.stringify([{ appType: "notes" }]));
const result = await realSettingsStore.readRaw("windowLayout");
```

### Verified: FOUC script SHA-256 recompute command

```bash
# Run from repo root after editing index.html FOUC script body:
node -e "const {createHash}=require('crypto'),{readFileSync}=require('fs'); \
const h=readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1]; \
console.log('sha256-'+createHash('sha256').update(h,'utf8').digest('base64'))"
# Output: sha256-XXXXXXXXXX...=
# Paste that output replacing the old sha256-lbdl+... in the CSP meta tag script-src.
```

---

## State of the Art

| Old Approach | Current Approach | Phase Impact |
|--------------|------------------|--------------|
| Theme stored in `data-theme` attribute | CSS custom properties on `:root` (Phase 14) | Phase 22 extends the same custom-property contract |
| Static 4-theme list in ThemeSelector | Dynamic custom themes list from context | ThemeSelector must read `customThemes` from context |
| No frame theme sync | `broadcastTheme` via THEME_PUSH (Phase 20) | Phase 22 custom theme activation reuses this path unchanged |
| No raw IDB key API | `writeRaw`/`readRaw` added in Phase 21 | Phase 22 uses this for `"custom:<name>"` and index key |

---

## Open Questions

1. **ThemeEditor mounting location**
   - What we know: The menu bar has a `<ThemeSelector />` which could grow an "Edit themes" button; alternatively a separate `ThemeEditor` modal could be mounted at the `DesktopShell` level.
   - What's unclear: Whether the editor is a modal (overlay) or a side panel; who owns its open/close state.
   - Recommendation: Mount a modal at the `DesktopShell` level, triggered by an "Edit" button inside `ThemeSelector`. This follows the KeyDialog pattern (`KeyDialog` is mounted in `DesktopShell`, opened via `onOpenAccount` callback in `MenuBar`).

2. **`deleteRaw` for clean IDB teardown**
   - What we know: `SettingsStore` has no `deleteRaw` method. Deleted custom theme data stays as an unreachable orphan in IDB.
   - What's unclear: Whether the planner should add `deleteRaw` to `SettingsStore` or accept orphan keys.
   - Recommendation: Add `deleteRaw(key: string): Promise<void>` to `SettingsStore` in Phase 22 for completeness; it is a one-line IDB call and keeps the store clean.

3. **Duplicate-from-built-in UX**
   - What we know: THEME-07 says "duplicated-from-a-built-in". This means the editor must be openable with a pre-populated state that is a copy of a built-in theme.
   - What's unclear: Exactly which trigger (a "Duplicate" button on each pill, or an "Open editor with Aurora as base" menu entry).
   - Recommendation: Add a "Duplicate" action to each built-in pill (and to the active custom theme) — opens the editor pre-filled with that theme's vars and a generated name like "My Aurora".

---

## Environment Availability

Step 2.6: SKIPPED (Phase 22 has no external CLI/service dependencies — it is a code-and-config-only change using existing in-browser APIs and the existing Vitest/JSDOM test infrastructure).

---

## Runtime State Inventory

Step 2.5: NOT APPLICABLE (Phase 22 is a greenfield feature addition, not a rename/refactor/migration).

---

## Validation Architecture

`nyquist_validation: false` in `.planning/config.json` — formal Nyquist validation is disabled for this project. The project uses standard TDD with Vitest. The standard test command is `npx vitest run` (full suite, ~727 tests). Run after each plan to verify the baseline remains green.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | YES | `sanitizeDisplayName` for names; `CSS.supports` gate for CSS values |
| V6 Cryptography | No | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed CSS value in custom theme var | Tampering | `CSS.supports("background", value)` gate before IDB write |
| Banned-token name leaking to DOM/devtools | Information Disclosure | `sanitizeDisplayName` mandatory before any DOM render or key write |
| localStorage injection (forged mirror) | Tampering | Not a real threat — localStorage is same-origin; no user-supplied key reaches frames (SANDBOX-02 ensures the API key never enters frames) |
| IDB data tampered between sessions | Tampering | `isValidValue` on the vars object when loading from IDB; unknown props passed to `setProperty` are harmless (browser ignores unknown CSS properties) |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `CSS.supports("background", value)` validates all 12 CSS var value types (hex, rgba, gradient) in a real browser | §Color Input Reality | If a browser rejects valid rgba via `background` property, some fields would falsely error; use `CSS.supports("background-color", value)` for non-gradient vars as a fallback |
| A2 | The `"customThemeIndex"` key chosen for the enum index does not collide with any existing `writeRaw` key | §settingsStore Seam | Phase 21 uses `"windowLayout"`; Phase 14 uses `"osTheme"` via `write()`; no collision found in the codebase but not confirmed by inspecting actual IDB contents |
| A3 | jsdom 29 continues to lack `window.CSS` (was confirmed by runtime test in this session) | §Color Input Reality | If a future vitest/jsdom version adds `CSS.supports`, the stub may override a working implementation — low risk |

All other claims in this document are tagged [VERIFIED: read live file] or [VERIFIED: executed code].

---

## Sources

### Primary (HIGH confidence)
- `src/ui/VibeThemeProvider.tsx` (read in full, 2026-06-30) — 12-var contract, VIBE_THEMES, setTheme, broadcastTheme call site
- `src/execution/frameMount.ts` (read in full, 2026-06-30) — broadcastTheme signature, THEME_PUSH dispatch
- `src/host/settingsStore.ts` (read in full, 2026-06-30) — writeRaw/readRaw signatures
- `index.html` (read in full, 2026-06-30) — FOUC script structure, CSP meta tag
- `src/csp.test.ts` (read in full, 2026-06-30) — hash guard mechanism and recompute procedure
- `src/frameCsp.test.ts` (read in full, 2026-06-30) — frame bootstrap hash guard
- `src/hygiene.test.ts` (read in full, 2026-06-30) — banned token set, HYGIENE-07 scope, PHASE20_FILES
- `src/ui/sanitizeDisplayName.ts` (read in full, 2026-06-30) — signature and banned pattern set
- `src/ui/ThemeSelector.tsx` + `src/ui/MenuBar.tsx` (read in full, 2026-06-30) — switcher structure
- `src/ui/DesktopShell.tsx:841–842` (read excerpt, 2026-06-30) — critical currentThemeVars coupling
- `src/services/testServices.ts` (read in full, 2026-06-30) — RecordingSettingsStore API
- `src/ui/VibeThemeProvider.test.tsx` + `src/ui/ThemeSelector.test.tsx` (read in full, 2026-06-30) — test patterns
- `src/registry/db.ts` (read in full, 2026-06-30) — IDB schema, SettingRecord, REGISTRY_DB_VERSION=3
- `src/host/layoutPersistence.ts` (read in full, 2026-06-30) — Phase 21 writeRaw usage pattern
- Node.js execution: SHA-256 hash computed from live `index.html` = `sha256-lbdl+fs2oGJ9PUrXbgMIg0tWiqh+N0sPwD/8u/894VQ=` [VERIFIED]
- Node.js execution: `window.CSS` is `undefined` in JSDOM 29 [VERIFIED by executing JSDOM 29.1.1]
- `npx vitest run src/csp.test.ts` — all 7 tests pass (confirmed 2026-06-30) [VERIFIED]

### Secondary (MEDIUM confidence)
- `src/host/settingsStore.raw.test.ts` (read in full) — confirms writeRaw/readRaw round-trip behavior and RecordingSettingsStore per-key tracking
- `src/execution/colorCheck.ts` (read in full) — confirms no existing contrast utility; confirms TranspileError usage pattern for reference

---

## Metadata

**Confidence breakdown:**
- Theme foundation (12-var contract, setTheme, broadcastTheme): HIGH — all read from live source
- FOUC script + hash mechanism: HIGH — read from live file, hash verified by execution
- settingsStore seam: HIGH — interface and implementation read in full, tests executed
- Enumeration approach: MEDIUM — index key is standard pattern; no precedent in this codebase but two assumptions (A1, A2) noted
- CSS.supports behavior in production browser: HIGH — standard Web API; JSDOM gap VERIFIED
- Contrast ratio formula: HIGH — WCAG 2.1 §1.4.3 formula is specification-level knowledge, no library needed

**Research date:** 2026-06-30
**Valid until:** 2026-07-30 (stable codebase; FOUC hash depends on exact file state at implementation time)

---

## RESEARCH COMPLETE
