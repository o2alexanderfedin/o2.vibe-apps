# Phase 14: Theme Foundation - Pattern Map

**Mapped:** 2026-06-26
**Files analyzed:** 10
**Analogs found:** 9 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/storage.ts` | config | — | `src/lib/storage.ts` (self — additive) | exact |
| `src/ui/VibeThemeProvider.tsx` | provider | request-response | `src/ui/ThemeProvider.tsx` | exact |
| `src/registry/db.ts` | config | CRUD | `src/registry/db.ts` (self — additive bump) | exact |
| `src/ui/ThemeSelector.tsx` | component | request-response | `src/ui/AppBar.tsx` (controls area pattern) | role-match |
| `src/ui/AppBar.tsx` | component | request-response | `src/ui/AppBar.tsx` (self — additive) | exact |
| `index.html` | config | — | `index.html` (self — additive) | exact |
| `src/csp.test.ts` | test | — | `src/csp.test.ts` (self — hash update) | exact |
| `src/ui/VibeThemeProvider.test.tsx` | test | request-response | `src/ui/theme.test.tsx` | exact |
| `src/registry/db.test.ts` | test | CRUD | `src/registry/registry.test.ts` | role-match |
| `src/hygiene.test.ts` | test | — | `src/hygiene.test.ts` (self — no change needed) | exact |

---

## Pattern Assignments

### `src/lib/storage.ts` (config, additive constant)

**Analog:** `src/lib/storage.ts` (lines 1–4)

**Existing file content** (full file, lines 1–4):
```typescript
// Neutral localStorage key constants — single source of truth (D-11, D-15).
// No other logic here; these constants are imported by all modules that read/write localStorage.
export const STORAGE_KEY_API = "marketplace.apiKey";
export const STORAGE_KEY_THEME = "marketplace.theme";
```

**Add one line below the existing constants:**
```typescript
export const STORAGE_KEY_OS_THEME = "marketplace.osTheme";
```

**Rules:**
- Key format: `marketplace.<camelCaseNeutralWord>` — mirrors existing keys exactly.
- No logic in this file — constants only.
- Neutral name: `osTheme` contains no banned token.

---

### `src/ui/VibeThemeProvider.tsx` (provider, request-response)

**Analog:** `src/ui/ThemeProvider.tsx` (full file, lines 1–113)

**Imports pattern** (lines 1–9):
```typescript
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { STORAGE_KEY_OS_THEME } from "../lib/storage";
```

**Context + type shape** (modeled on lines 11–20):
```typescript
export type VibeThemeName = "aurora" | "aero" | "aqua" | "noir";

export interface VibeThemeContextValue {
  theme: VibeThemeName;
  setTheme: (name: VibeThemeName) => void;
}

export const VibeThemeContext = createContext<VibeThemeContextValue | null>(null);
```

**VIBE_THEMES constant** (new — no analog, but follows CLAUDE.md variable contract):
```typescript
// The 4 named themes — variable values verbatim from design/VibeOS.dc.html THEMES map.
export const VIBE_THEMES: Record<VibeThemeName, Record<string, string>> = {
  aurora: { "--text": "...", "--wall": "...", /* etc. */ },
  aero:   { /* ... */ },
  aqua:   { /* ... */ },
  noir:   { /* ... */ },
};
```

**readStored helper** (copy pattern from lines 24–34 of ThemeProvider):
```typescript
const VALID_THEMES: ReadonlyArray<VibeThemeName> = ["aurora", "aero", "aqua", "noir"];

function readStoredTheme(): VibeThemeName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_OS_THEME);
    if (stored && (VALID_THEMES as readonly string[]).includes(stored)) {
      return stored as VibeThemeName;
    }
  } catch {
    // localStorage unavailable — fall through.
  }
  return "aurora"; // default per CONTEXT Decision 7
}
```

**applyTheme helper** — key difference from ThemeProvider: use `style.setProperty` on documentElement for each CSS variable (not `setAttribute`):
```typescript
function applyTheme(name: VibeThemeName): void {
  const vars = VIBE_THEMES[name];
  for (const [prop, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(prop, value);
  }
}
```
This is mandated by CONTEXT Decision 2 and PITFALLS Pitfall 5 — `setAttribute("data-theme")` does NOT cascade into separately-`createRoot`'d generated-app subtrees but `style.setProperty` on `:root` does.

**Provider body** (copy structure from lines 64–103 of ThemeProvider):
```typescript
export function VibeThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<VibeThemeName>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((name: VibeThemeName) => {
    setThemeState(() => {
      try {
        localStorage.setItem(STORAGE_KEY_OS_THEME, name);
      } catch {
        // Persisting is best-effort; the in-memory state still updates.
      }
      return name;
    });
  }, []);

  return (
    <VibeThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </VibeThemeContext.Provider>
  );
}
```

**Consumer hook** (copy pattern from lines 106–112 of ThemeProvider):
```typescript
export function useVibeTheme(): VibeThemeContextValue {
  const ctx = useContext(VibeThemeContext);
  if (!ctx) {
    throw new Error("useVibeTheme must be used within a VibeThemeProvider");
  }
  return ctx;
}
```

**IDB mirror note:** The provider should also mirror the choice to the `settings` IDB store after the localStorage write. Wire this as a fire-and-forget `useEffect` that calls the registry seam — do NOT block `setTheme` on the async IDB write (localStorage is the source of truth for FOUC).

---

### `src/registry/db.ts` (config, additive DB upgrade)

**Analog:** `src/registry/db.ts` (full file, lines 1–93)

**Version bump** (line 19):
```typescript
// Before:
export const REGISTRY_DB_VERSION = 2;
// After:
export const REGISTRY_DB_VERSION = 3;
```

**Add `SettingRecord` interface** (copy AppRecord shape at lines 37–55, simplified):
```typescript
export interface SettingRecord {
  key: string;
  value: unknown;
  [key: string]: unknown;
}
```

**Extend RegistrySchema** (lines 76–80):
```typescript
export interface RegistrySchema extends DBSchema {
  apps: { key: string; value: AppRecord };
  widgets: { key: string; value: WidgetRecord };
  handlers: { key: string; value: HandlerRecord };
  settings: { key: string; value: SettingRecord }; // NEW — Phase 14
}
```

**Additive upgrade function** (lines 87–92 — copy the if-not-contains guard exactly):
```typescript
upgrade(db) {
  if (!db.objectStoreNames.contains("apps"))     db.createObjectStore("apps");
  if (!db.objectStoreNames.contains("widgets"))  db.createObjectStore("widgets");
  if (!db.objectStoreNames.contains("handlers")) db.createObjectStore("handlers");
  if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings"); // NEW
},
```

**Critical invariant:** The guard `if (!db.objectStoreNames.contains(...))` ensures that upgrading from v2 to v3 does NOT touch the existing `apps`, `widgets`, `handlers` stores or their data. This is the exact pattern already in the file.

---

### `src/ui/ThemeSelector.tsx` (component, request-response)

**Analog:** `src/ui/AppBar.tsx` (full file, lines 1–50) — the controls pattern with a `useTheme`-style hook

**Imports pattern** (copy from AppBar lines 1–2):
```typescript
import { useVibeTheme, type VibeThemeName } from "./VibeThemeProvider";
```

**Static metadata map** (copy the `THEME_META` pattern from AppBar lines 6–13):
```typescript
const THEME_LABELS: Record<VibeThemeName, string> = {
  aurora: "Aurora",
  aero:   "Aero",
  aqua:   "Aqua",
  noir:   "Noir",
};

const THEME_NAMES: ReadonlyArray<VibeThemeName> = ["aurora", "aero", "aqua", "noir"];
```

**Component body** (pill button per theme, copy button structure from AppBar lines 29–47):
```typescript
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

**CSS class naming rule:** Use `theme-selector` prefix — neutral, no banned tokens. Do NOT use class names like `ai-theme-selector` or `color-generator`.

---

### `src/ui/AppBar.tsx` (component, additive)

**Analog:** `src/ui/AppBar.tsx` (full file, lines 1–50)

**Import addition** (add alongside existing imports at line 1):
```typescript
import { ThemeSelector } from "./ThemeSelector";
```

**JSX insertion** (inside `<div className="app-bar__controls">` at lines 27–48):
```tsx
<div className="app-bar__controls">
  <ThemeSelector />   {/* temporary, Phase 16 moves it to menu bar */}
  <button ...account button... />
  <button ...cycleTheme button... />
</div>
```

**Existing `useTheme` + `cycleTheme` stay intact** — the old light/dark toggle is vestigial but not removed (552 tests depend on it per CONTEXT Decision 8).

---

### `index.html` (config, additive FOUC script extension)

**Analog:** `index.html` lines 17–24 (the existing inline FOUC script)

**Existing script** (lines 17–24):
```javascript
<script>
  (function () {
    var stored = localStorage.getItem('marketplace.theme');
    var theme = stored === 'light' || stored === 'dark' ? stored
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
  })();
</script>
```

**Extended script** — append Vibe theme read AFTER the existing `data-theme` setAttribute:
```javascript
<script>
  (function () {
    var stored = localStorage.getItem('marketplace.theme');
    var theme = stored === 'light' || stored === 'dark' ? stored
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);

    // Named Vibe theme — apply CSS custom properties synchronously to avoid flash.
    var VIBE_THEMES = { aurora: { /* ... */ }, aero: { /* ... */ }, aqua: { /* ... */ }, noir: { /* ... */ } };
    var vibeStored = localStorage.getItem('marketplace.osTheme');
    var vibeTheme = VIBE_THEMES[vibeStored] ? vibeStored : 'aurora';
    var vars = VIBE_THEMES[vibeTheme];
    for (var k in vars) { document.documentElement.style.setProperty(k, vars[k]); }
  })();
</script>
```

**Critical constraint:** After editing this script, the SHA-256 hash in the CSP `script-src` and in `csp.test.ts` MUST be updated in the SAME commit. The hash is computed over the exact bytes between `<script>` and `</script>`. The test at `src/csp.test.ts` line 73–78 re-derives the hash from the live file and asserts it matches the CSP — so the test will catch any desync.

---

### `src/csp.test.ts` (test, hash update)

**Analog:** `src/csp.test.ts` (full file, lines 1–113)

**The test does NOT change in logic** — it recomputes the hash dynamically from the live `index.html` at lines 74–77:
```typescript
it("script-src contains the sha256 source matching the inline first-paint script", () => {
  const html = readIndexHtml();
  const expected = sha256Source(inlineScriptBody(html));
  const directive = scriptSrcDirective(html);
  expect(directive).toContain(`'${expected}'`);
});
```

**What must change:** The SHA-256 value embedded in the `index.html` CSP `content` attribute (line 15 of `index.html`) must be updated to match the new script body. The test recomputes it from the live file, so once `index.html` is correct the test passes automatically.

**Hash computation recipe** (from `csp.test.ts` lines 39–41):
```typescript
function sha256Source(body: string): string {
  return "sha256-" + createHash("sha256").update(body, "utf8").digest("base64");
}
```
Run `node -e "const {createHash,readFileSync}=require('node:crypto');const {readFileSync:rf}=require('node:fs');const html=rf('index.html','utf8');const body=html.match(/<script>([\s\S]*?)<\/script>/)[1];console.log('sha256-'+createHash('sha256').update(body,'utf8').digest('base64'))"` after editing `index.html` to get the new hash to embed in the CSP.

---

### `src/ui/VibeThemeProvider.test.tsx` (test, TDD for VibeThemeProvider)

**Analog:** `src/ui/theme.test.tsx` (full file, lines 1–154)

**Imports pattern** (copy from theme.test.tsx lines 1–6):
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { useContext } from "react";
import { VibeThemeProvider, VibeThemeContext } from "./VibeThemeProvider";
import { STORAGE_KEY_OS_THEME } from "../lib/storage";
```

**Probe component pattern** (copy from theme.test.tsx lines 53–62):
```typescript
function Probe() {
  const ctx = useContext(VibeThemeContext);
  if (!ctx) throw new Error("no vibe theme context");
  return (
    <button data-testid="set-aero" onClick={() => ctx.setTheme("aero")}>
      {ctx.theme}
    </button>
  );
}
```

**beforeEach/afterEach pattern** (copy from theme.test.tsx lines 65–71):
```typescript
beforeEach(() => {
  localStorage.clear();
  // Remove any CSS custom properties set on documentElement by prior test
  document.documentElement.style.cssText = "";
});

afterEach(() => {
  cleanup();
  document.documentElement.style.cssText = "";
});
```

**Test case shapes to cover** (TDD specification):
```typescript
it("defaults to aurora when nothing is persisted", ...)
it("reads persisted theme name from localStorage on mount", ...)
it("setTheme applies CSS custom properties to documentElement", ...)
it("setTheme persists the new name under marketplace.osTheme", ...)
it("switching theme updates computed style on documentElement", ...)
it("invalid stored value falls back to aurora", ...)
it("alias bridge: --color-surface resolves via --glass after theme apply", ...)
```

**CSS variable assertion pattern** (no analog; use getComputedStyle or style.getPropertyValue):
```typescript
// Assert a CSS var was set on documentElement:
expect(document.documentElement.style.getPropertyValue("--text")).toBeTruthy();
```

**Note:** The `setup.ts` already installs `fake-indexeddb/auto` and the `matchMedia` stub globally. No per-file setup needed unless the test needs to override `matchMedia`.

---

### `src/registry/db.test.ts` (test, NEW — additive upgrade v2→v3)

**Analog:** `src/registry/registry.test.ts` (lines 1–88 — happy-path + migration structure)

**File header + imports** (copy from registry.test.ts lines 1–6):
```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
// fake-indexeddb/auto is already installed via src/test/setup.ts
```

**Module-reset pattern** (copy from registry.test.ts lines 18–22):
```typescript
beforeEach(() => {
  vi.resetModules();
  // Each test gets a fresh module with its own openDB call and clean DB instance.
});
```

**Test case shapes** (TDD specification for db.ts additive upgrade):
```typescript
describe("db — additive upgrade v2→v3 (settings store)", () => {
  it("openRegistry resolves at version 3", async () => {
    const { openRegistry, REGISTRY_DB_VERSION } = await import("./db");
    const db = await openRegistry();
    expect(REGISTRY_DB_VERSION).toBe(3);
    expect(db.version).toBe(3);
    db.close();
  });

  it("settings store is present after upgrade", async () => {
    const { openRegistry } = await import("./db");
    const db = await openRegistry();
    expect(db.objectStoreNames.contains("settings")).toBe(true);
    db.close();
  });

  it("apps, widgets, handlers stores are intact after upgrade", async () => {
    const { openRegistry } = await import("./db");
    const db = await openRegistry();
    expect(db.objectStoreNames.contains("apps")).toBe(true);
    expect(db.objectStoreNames.contains("widgets")).toBe(true);
    expect(db.objectStoreNames.contains("handlers")).toBe(true);
    db.close();
  });

  it("existing records in apps store survive the upgrade (non-destructive)", async () => {
    const { openRegistry } = await import("./db");
    const db = await openRegistry();
    await db.put("apps", { cacheKey: "k", type: "t", source: "s", transpiledJS: "j" }, "k");
    db.close();
    // Re-open (simulates a page reload after upgrade)
    const db2 = await openRegistry();
    const result = await db2.get("apps", "k");
    expect(result?.cacheKey).toBe("k");
    db2.close();
  });

  it("settings store round-trips a key-value record", async () => {
    const { openRegistry } = await import("./db");
    const db = await openRegistry();
    await db.put("settings", { key: "osTheme", value: "noir" }, "osTheme");
    const result = await db.get("settings", "osTheme");
    expect(result?.value).toBe("noir");
    db.close();
  });
});
```

---

### `src/hygiene.test.ts` (test, no change needed)

**Analog:** `src/hygiene.test.ts` (full file, lines 1–151)

The gate at lines 80–91 already walks all `.ts`/`.tsx`/`.css`/`.html` files under `src/` recursively. New files `src/ui/VibeThemeProvider.tsx`, `src/ui/ThemeSelector.tsx`, `src/ui/VibeThemeProvider.test.tsx`, and `src/registry/db.test.ts` are automatically included.

**No code change required.** Verify new file names and their content pass the banned token check:
- `VibeThemeName` — neutral (no `AI`, `llm`, `generate`, `mock`, `fake`, `synthesi*`)
- `osTheme`, `VIBE_THEMES`, `setTheme`, `ThemeSelector` — all neutral
- CSS class prefix `theme-selector` — neutral
- Store name `settings` — neutral
- The comment "Named Vibe theme" in `index.html` — neutral

---

## Shared Patterns

### Context Provider + Consumer Hook
**Source:** `src/ui/ThemeProvider.tsx` (entire file)
**Apply to:** `src/ui/VibeThemeProvider.tsx`

The complete idiom:
1. Define a typed context value interface
2. Export a `createContext<T | null>(null)` constant
3. `readStored*` helper reads localStorage with try/catch fallback
4. Provider uses `useState(readStored*)` for lazy init
5. `useEffect` fires the apply function on mount and every state change
6. Action callback uses `useCallback` + functional `setState` to persist and update atomically
7. Consumer hook throws a descriptive error if used outside provider
8. Export the context itself (for test Probe pattern) + the hook (for real consumers)

### localStorage try/catch Shield
**Source:** `src/ui/ThemeProvider.tsx` lines 26–33 and 89–93
**Apply to:** `src/ui/VibeThemeProvider.tsx`
```typescript
try {
  const stored = localStorage.getItem(STORAGE_KEY_OS_THEME);
  // ...
} catch {
  // localStorage unavailable — fall through.
}
```
```typescript
try {
  localStorage.setItem(STORAGE_KEY_OS_THEME, name);
} catch {
  // Persisting is best-effort; the in-memory state still updates.
}
```

### Banned Token Check for New Names
**Source:** `src/hygiene.test.ts` lines 46–53 (BANNED regex list)
**Apply to:** All new files

Banned patterns to avoid in any new identifier, class name, store name, or string literal:
- `synthesi[sz]` (case-insensitive)
- `\bfake\b` (case-insensitive)
- `\bmock\b` (case-insensitive)
- `\bAI\b` (case-SENSITIVE)
- `\bllm\b` (case-insensitive)
- `\bgenerat(e|ed|ing)\b` (case-insensitive)

### Additive IDB Upgrade Guard
**Source:** `src/registry/db.ts` lines 87–92
**Apply to:** `src/registry/db.ts` (version 3 addition)
```typescript
if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings");
```
The guard is mandatory — `createObjectStore` throws if the store already exists, so the guard is not optional safety, it is required correctness.

### RTL Test Pattern (render + Probe + act + cleanup)
**Source:** `src/ui/theme.test.tsx` (entire file)
**Apply to:** `src/ui/VibeThemeProvider.test.tsx`

Key conventions:
- `afterEach(cleanup)` — always
- `beforeEach(() => localStorage.clear())` — always for storage-reading providers
- Probe component exposes context fields via `data-testid` buttons
- Drive state changes with `act(() => { ... })`
- Assert DOM effects (documentElement attributes/style) not internal state

### CSP Hash Update Procedure
**Source:** `src/csp.test.ts` lines 26–41, `index.html` line 15
**Apply to:** `index.html` + `src/csp.test.ts` pair (same commit)

The test dynamically computes the hash from the live file — no manual constant in the test to update. The hash in the CSP `content` attribute of `index.html` IS the thing that must change. After editing the FOUC script, recompute the hash and replace the `sha256-...=` value in the `content` attribute on line 15 of `index.html`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/ui/VibeThemeProvider.tsx` (VIBE_THEMES constant) | config | — | No existing named-theme constant with CSS variable maps; must be authored from `design/VibeOS.dc.html` THEMES object |

The `VIBE_THEMES` variable values (the actual CSS custom property values for each of Aurora/Aero/Aqua/Noir) must be sourced directly from `design/VibeOS.dc.html`'s `THEMES` map. The pattern for applying them is fully covered by the `document.documentElement.style.setProperty` analog above; only the data values have no codebase source.

---

## Metadata

**Analog search scope:** `src/ui/`, `src/lib/`, `src/registry/`, `src/services/`, `src/test/`, `index.html`
**Files scanned:** 12 source files read directly
**Pattern extraction date:** 2026-06-26
