# Phase 17: Search / Launcher Panel - Pattern Map

**Mapped:** 2026-06-26
**Files analyzed:** 4 new/modified files
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/ui/SearchLauncherPanel.tsx` | component | request-response | `src/ui/MinimalLauncher.tsx` | exact |
| `src/ui/SearchLauncherPanel.test.tsx` | test | request-response | `src/ui/MinimalLauncher.test.tsx` | exact |
| `src/ui/DesktopShell.tsx` | component | request-response | itself (update import + free-text branch) | update |
| `src/hygiene.test.ts` | test | batch | itself (add SearchLauncherPanel to file coverage assertion) | update |

## Pattern Assignments

---

### `src/ui/SearchLauncherPanel.tsx` (component, request-response)

**Analog:** `src/ui/MinimalLauncher.tsx`

**Imports pattern** (MinimalLauncher.tsx lines 12-15):
```typescript
import { useCallback, useEffect, useRef } from "react";
import { X, Cloud } from "lucide-react";
import { APP_REGISTRY } from "../data/appRegistry";
import { ICONS } from "./iconForApp";
```

The new panel adds `useState` and `useId` (for loading state + ARIA IDs). The `Cloud` fallback icon stays. No additional external imports needed — the describe→produce path is wired through the shell's `handleOpen` prop, not called directly from the panel.

**Props interface pattern** (MinimalLauncher.tsx lines 17-20):
```typescript
export interface MinimalLauncherProps {
  onOpen: (appType: string, displayName: string) => void;
  onClose: () => void;
}
```

`SearchLauncherPanel` extends this with an `onDescribe` callback for free-text submission:
```typescript
export interface SearchLauncherPanelProps {
  onOpen: (appType: string, displayName: string) => void;
  onDescribe: (text: string) => Promise<void>;  // free-text → produce path
  onClose: () => void;
}
```

**Modal accessibility pattern** (MinimalLauncher.tsx lines 22-65 — Escape + Tab-trap + focus-on-mount):
```typescript
const dialogRef = useRef<HTMLDivElement>(null);
const closeButtonRef = useRef<HTMLButtonElement | null>(null);

// Focus the close control on mount so keyboard focus lands inside the modal
useEffect(() => {
  closeButtonRef.current?.focus();
}, []);

const handleKeyDown = useCallback(
  (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;
    const focusable = [
      ...root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ].filter(
      (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  },
  [onClose],
);
```

Copy this Tab-trap verbatim — it matches `KeyDialog`'s contract (`src/ui/KeyDialog.tsx` lines 63-95).

**Core panel JSX structure** (MinimalLauncher.tsx lines 67-112):
```typescript
return (
  <div
    className="launcher-overlay"
    onClick={onClose}
    onKeyDown={handleKeyDown}
  >
    <div
      ref={dialogRef}
      className="launcher"
      role="dialog"
      aria-modal="true"
      aria-label="Open an app"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={closeButtonRef}
        type="button"
        className="app-bar__icon-btn launcher__close"
        aria-label="Close"
        onClick={onClose}
      >
        <X size={20} aria-hidden="true" />
      </button>
      <div className="launcher__grid">
        {APP_REGISTRY.map((app) => {
          const Icon = ICONS[app.icon] ?? Cloud;
          return (
            <button
              key={app.id}
              type="button"
              className="launcher__app-btn"
              aria-label={app.displayName}
              onClick={() => {
                onOpen(app.id, app.displayName);
                onClose();
              }}
            >
              <Icon size={28} aria-hidden="true" />
              <span>{app.displayName}</span>
            </button>
          );
        })}
      </div>
    </div>
  </div>
);
```

The new panel keeps the pre-installed grid section verbatim. ABOVE the grid it adds: a text input, a submit button, and example-chip buttons.

**Loading state pattern** (from DesktopShell.tsx — `working` state): the panel needs an `idle | working` local state to show a loading indicator while `onDescribe` is in flight. Pattern:
```typescript
type PanelState = "idle" | "working";
const [panelState, setPanelState] = useState<PanelState>("idle");

async function handleSubmit() {
  const trimmed = inputValue.trim();
  if (!trimmed || panelState !== "idle") return;
  setPanelState("working");
  try {
    await onDescribe(trimmed);
    // onDescribe resolves after the window opens; panel closes via onClose
  } catch {
    // errors are handled by the shell (ProduceAuthError → KeyDialog,
    // ProduceThrottledError → fallback); panel resets to idle
    setPanelState("idle");
  }
}
```

The panel re-enables itself (resets to `idle`) on error so the user can retry without closing. On success, `onDescribe` is expected to call `onClose` after opening the window (matches existing pattern from pre-installed flow).

**Input submit pattern** (from ContextualPrompt.tsx lines 48-59):
```typescript
const trimmed = value.trim();
const canApply = trimmed.length > 0;

function handleApply(): void {
  if (!canApply) return;
  onApply(trimmed);
}
```

Apply the same disabled-until-non-empty guard on the panel's submit button.

**ARIA ID pattern for labeled inputs** (KeyDialog.tsx lines 49, 131-136):
```typescript
const titleId = useId();
// ...
aria-labelledby={titleId}
// ...
<h2 id={titleId} className="key-dialog__title">
```

Use `useId()` to label the search input so the dialog heading and input are linked.

**Hygiene constraint** — all copy must be neutral. Approved vocabulary: "Open an app", "Describe an app…" (placeholder), "Open" (button), "Working…" (working state), example chip text. Banned: `synthesi*`, `AI`, `llm`, `generate`, `fake`, `mock`.

---

### `src/ui/SearchLauncherPanel.test.tsx` (test, request-response)

**Analog:** `src/ui/MinimalLauncher.test.tsx`

**Test file structure** (MinimalLauncher.test.tsx lines 1-6):
```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import { MinimalLauncher } from "./MinimalLauncher";
import { APP_REGISTRY } from "../data/appRegistry";

afterEach(cleanup);
```

Add `userEvent` for input typing (mirrors ContextualPrompt.test.tsx line 9).

**Prop-injection test pattern** (MinimalLauncher.test.tsx lines 9-17):
```typescript
it("renders one app button per APP_REGISTRY entry, labeled by displayName", () => {
  const { getByRole } = render(
    <MinimalLauncher onOpen={vi.fn()} onClose={vi.fn()} />,
  );
  const dialog = getByRole("dialog", { name: "Open an app" });
  const grid = dialog.querySelector(".launcher__grid")!;
  const appButtons = within(grid as HTMLElement).getAllByRole("button");
  expect(appButtons).toHaveLength(APP_REGISTRY.length);
  // ...
});
```

**Click-then-close ordering assertion** (MinimalLauncher.test.tsx lines 28-44 — most nuanced pattern to preserve):
```typescript
it("clicking an app button calls onOpen(id, displayName) then onClose", () => {
  const calls: string[] = [];
  const onOpen = vi.fn(() => calls.push("open"));
  const onClose = vi.fn(() => calls.push("close"));
  const target = APP_REGISTRY[0]!;
  // ...
  fireEvent.click(getByRole("button", { name: target.displayName }));
  expect(onOpen).toHaveBeenCalledWith(target.id, target.displayName);
  expect(calls).toEqual(["open", "close"]);
});
```

**Working state test pattern** (from ContextualPrompt.test.tsx disabled-button pattern, adapted):
```typescript
it("submit button is disabled while working", async () => {
  let resolveDescribe: () => void;
  const onDescribe = vi.fn(() => new Promise<void>(r => { resolveDescribe = r; }));
  const user = userEvent.setup();
  render(<SearchLauncherPanel onOpen={vi.fn()} onDescribe={onDescribe} onClose={vi.fn()} />);
  await user.type(screen.getByRole("textbox"), "a pomodoro timer");
  await user.click(screen.getByRole("button", { name: "Open" }));
  expect(screen.getByRole("button", { name: "Open" })).toBeDisabled();
  resolveDescribe!();
});
```

**Hygiene assertion pattern** (ContextualPrompt.test.tsx lines 52-60 — copy this verbatim):
```typescript
it("copy stays neutral (no mechanic-revealing tokens in the rendered panel)", () => {
  const { container } = render(
    <SearchLauncherPanel onOpen={vi.fn()} onDescribe={vi.fn()} onClose={vi.fn()} />,
  );
  const text = container.textContent ?? "";
  expect(text).not.toMatch(/synthesi[sz]/i);
  expect(text).not.toMatch(new RegExp("\\bgenerat(e|ed|ing)\\b", "i"));
  expect(text).not.toMatch(/\bAI\b/);
});
```

**Modal keyboard/focus tests to port** (MinimalLauncher.test.tsx lines 72-97 — all four modal tests apply unchanged):
- `aria-modal="true"` assertion
- Escape → onClose
- focus lands inside dialog on mount
- backdrop click → close; inner click does NOT propagate

---

### `src/ui/DesktopShell.tsx` (component update)

**What changes:** Two localized edits only — no behavioral regression.

**Edit 1 — Replace import + add slugFromText** (DesktopShell.tsx line 36):
```typescript
// Before:
import { MinimalLauncher } from "./MinimalLauncher";
// After:
import { SearchLauncherPanel } from "./SearchLauncherPanel";
import { slugFromText } from "./launcherUtils";  // Plan 01 deliverable
```

**Edit 2 — Replace JSX usage + add onDescribe** (DesktopShell.tsx lines 433-441). The free-text path reuses `handleOpen` verbatim. Slug derivation and `registryKey` call happen here so the panel stays dumb:
```typescript
// Before:
{launcherOpen && (
  <MinimalLauncher
    onOpen={(appType, displayName) => {
      void handleOpen(appType, displayName);
    }}
    onClose={() => setLauncherOpen(false)}
  />
)}

// After:
{launcherOpen && (
  <SearchLauncherPanel
    onOpen={(appType, displayName) => {
      void handleOpen(appType, displayName);
    }}
    onDescribe={async (text) => {
      // Derive a URL-safe slug from the free text (used as appType). This is the
      // ONE new piece of logic in the phase; it lives in launcherUtils.ts as
      // `slugFromText` (Plan 01's deliverable) so it is unit-tested in isolation.
      // slugFromText("a pomodoro timer") === "pomodoro-timer" (strips leading
      // "a "/"an "/"the ", lowercases, kebab-cases, trims, caps length).
      const slug = slugFromText(text);
      // The full text is the userPrompt → folds into cacheKey via registryKey,
      // so each distinct description caches as its own app (DRY with tweak path).
      const cacheKey = await registryKey("app", slug, text);
      // Derive a display name from the text (first 30 chars, stripped).
      const displayName = text.trim().slice(0, 30);
      await handleOpenFreeText(slug, displayName, cacheKey, text);
      setLauncherOpen(false);
    }}
    onClose={() => setLauncherOpen(false)}
  />
)}
```

**Free-text produce path** — `userPrompt` + an already-computed `cacheKey` go to `resolveComponent` (bypassing `resolveOpenApp`, which doesn't accept a prompt). Pattern from DesktopShell.tsx lines 183-253 (handleOpen), with these differences:
- Takes the derived `(slug, displayName, cacheKey, userPrompt)` instead of `(appType, displayName)`
- Calls `resolveComponent(instanceId, slug, cacheKey, services, userPrompt)` directly (skips `resolveOpenApp`)
- All error handling (`ProduceAuthError`, `ProduceThrottledError`, `makeFallback`) copied verbatim

> **AUTHORITATIVE FORM — see Plan 02.** Plan 02 implements this inline inside the
> `handleDescribe` useCallback rather than as a separate `handleOpenFreeText` helper.
> That inlined form is the artifact the executor follows and it SUPERSEDES this
> reference sketch. The decision to inline (accepting contained duplication of
> handleOpen's mint→resolve→fallback sequence) is deliberate — it avoids refactoring
> handleOpen, which the 7 existing DesktopShell integration tests depend on. A future
> cleanup phase may extract the shared helper.

The `registryKey` import is already present in DesktopShell.tsx (line 32).

---

### `src/hygiene.test.ts` (test update)

**What changes:** One localized edit — add `SearchLauncherPanel.tsx` to the Pitfall-11 file coverage assertion.

**Edit — Extend the Phase-16 scanned-files array** (hygiene.test.ts lines 161-169):
```typescript
// Before:
for (const file of [
  "src/ui/DesktopShell.tsx",
  "src/ui/Dock.tsx",
  "src/ui/MenuBar.tsx",
  "src/ui/MinimalLauncher.tsx",
  "src/ui/iconForApp.tsx",
]) {

// After:
for (const file of [
  "src/ui/DesktopShell.tsx",
  "src/ui/Dock.tsx",
  "src/ui/MenuBar.tsx",
  "src/ui/SearchLauncherPanel.tsx",  // Phase 17 — new panel (replaces MinimalLauncher)
  "src/ui/iconForApp.tsx",
]) {
```

Note: `MinimalLauncher.tsx` is REMOVED from the list because Plan 04 deletes the file from disk (it is fully superseded by `SearchLauncherPanel.tsx`). The Pitfall-11 test asserts every listed file is in the scanned set (`expect(scanned).toContain(file)`), so a deleted file MUST NOT remain in the array or the assertion fails. Plan 02 (which updates this array) must run and land before Plan 04 (which deletes the file) — the wave order (02 → … → 04) guarantees this.

---

## Shared Patterns

### Modal dialog contract
**Source:** `src/ui/MinimalLauncher.tsx` (lines 22-65) and `src/ui/KeyDialog.tsx` (lines 63-95)
**Apply to:** `SearchLauncherPanel.tsx`

Both existing dialogs share the SAME Tab-trap implementation (word-for-word identical). Copy it unchanged. The contract is:
- `role="dialog" aria-modal="true"` on the inner panel
- `onClick={onClose}` on the outer overlay; `onClick={(e) => e.stopPropagation()}` on the inner panel
- `useEffect(() => { ref.current?.focus(); }, [])` for initial focus
- Escape → `onClose`; Tab wraps within focusable children (exclude `disabled` + `offsetParent === null`)

### ProduceAuthError / ProduceThrottledError handling
**Source:** `src/ui/DesktopShell.tsx` (lines 227-250)
**Apply to:** `DesktopShell.tsx` handleOpenFreeText (new helper), `SearchLauncherPanel.tsx` error states

The shell maps errors to neutral fallbacks. The panel layer shows a neutral inline message ("Add your key to open new apps" / "Try again in a moment") when `onDescribe` rejects, then resets to `idle`. The shell renders the full `makeFallback` inline; the panel only shows the panel-scoped message before resetting. The shell's fallback still fires if the window was already open.

Pattern from DesktopShell.tsx lines 227-250:
```typescript
catch (err) {
  const needsAuth = err instanceof ProduceAuthError;
  const throttled = err instanceof ProduceThrottledError;
  logger.error("Failed to open " + appType + ": " + String(err));
  if (!windowManagerRef.current.isOpenByInstance(instanceId)) return;
  const Fallback = makeFallback({
    needsAuth,
    throttled,
    onConnect: () => setKeyDialogOpen(true),
    onRetry: () => {
      closeByInstance(instanceId);
      void handleOpenRef.current(appType, displayName);
    },
  });
  storeComponent(instanceId, Fallback);
}
```

### Slug derivation for free-text → appType
**Source:** new pattern (no analog exists); informed by `registryKey` in `src/registry/cacheKey.ts` and `deriveDisplayName` in `src/execution/loader.ts` (lines 47-54)

The `deriveDisplayName` function in loader.ts provides the display-name derivation:
```typescript
export function deriveDisplayName(type: string, userPrompt?: string): string {
  const base = titleCase(type);
  if (userPrompt) {
    const suffix = userPrompt.trim().slice(0, 20).replace(/[^a-zA-Z0-9 ]/g, "").trim();
    return suffix ? `${base} (${suffix})` : base;
  }
  return base;
}
```

The slug derivation for the `appType` parameter is the inverse: convert user text to a URL-safe kebab id. Keep it in `DesktopShell.tsx` (co-located with the `handleOpen` call site) — the panel passes the raw text and the shell derives slug + cacheKey. This preserves the panel as a dumb leaf (no async dependencies).

### Test render wrapper
**Source:** `src/ui/desktopShellTestKit.tsx` (lines 42-56)
**Apply to:** `SearchLauncherPanel.test.tsx`

`SearchLauncherPanel` is a dumb leaf (no context dependencies) — tests render it directly with `render(<SearchLauncherPanel .../>)`, the same approach `MinimalLauncher.test.tsx` uses. No `ServicesProvider` or `VibeThemeProvider` wrapper needed.

### Hygiene copy constraint
**Source:** `src/hygiene.test.ts` (lines 46-53); enforced gate
**Apply to:** all copy in `SearchLauncherPanel.tsx`

Banned in any surface: `synthesi*`, `fake`, `mock`, `AI` (exact word), `llm`, `generate/generated/generating`.
Safe vocabulary for the panel: "Open", "Describe an app…" (placeholder), "Working…" (loading), "Add your account key to open new apps" (auth error), "Try again in a moment" (throttle error), "Open an app" (aria-label).

---

## No Analog Found

All four files have analogs. The slug-derivation logic lives in `src/ui/launcherUtils.ts` as the `slugFromText` helper (Plan 01 deliverable) — a small, unit-tested function with no prior analog in the codebase, simple enough to write from first principles; it does not require its own analog entry. DesktopShell imports it (`import { slugFromText } from "./launcherUtils"`) rather than inlining the transform.

---

## Metadata

**Analog search scope:** `src/ui/`, `src/intent/`, `src/execution/`, `src/registry/`, `src/host/`
**Files scanned:** 10 source files read in full
**Pattern extraction date:** 2026-06-26
