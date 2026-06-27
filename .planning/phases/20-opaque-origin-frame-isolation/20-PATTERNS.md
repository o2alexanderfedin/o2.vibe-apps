# Phase 20: Opaque-Origin Frame Isolation — Pattern Map

**Mapped:** 2026-06-27
**Files analyzed:** 10 (3 new, 7 modified)
**Analogs found:** 10 / 10

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/execution/frameBridge.ts` | RPC broker / utility | event-driven (postMessage) | `src/data/dataBroker.ts` + `src/execution/stateSchema.ts` | role-match (allowlist dispatch + zod schema) |
| `src/execution/frameMount.ts` | mount manager / registry | event-driven (theme broadcast) | `src/execution/mount.ts` | exact (Map<instanceId, ref> + register/unregister) |
| `src/ui/SandboxFrame.tsx` | component | request-response + event-driven | `src/ui/WindowFrame.tsx` + `src/ui/ErrorBoundary.tsx` | role-match (React component with lifecycle + error overlay) |
| `src/execution/loader.ts` (modify) | utility seam | CRUD | `src/execution/loader.ts` (self) | exact (add accessor to existing module) |
| `src/services/services.ts` (modify) | IoC interface | — | `src/services/services.ts` (self) | exact (add field to interface + createServices) |
| `src/services/testServices.ts` (modify) | IoC test double | — | `src/services/testServices.ts` (self) | exact (add default override field) |
| `src/services/ServicesProvider.tsx` (modify) | React context provider | — | `src/services/ServicesProvider.tsx` (self) | exact (no shape change — consumers call `useServices()`) |
| `src/ui/WindowFrame.tsx` (modify) | component | request-response | `src/ui/WindowFrame.tsx` (self) | exact (swap WindowBody for SandboxFrame behind frameMode flag) |
| `src/ui/VibeThemeProvider.tsx` (modify) | React context provider | event-driven | `src/ui/VibeThemeProvider.tsx` (self) | exact (extend setTheme callback) |
| `src/hygiene.test.ts` (modify) | test / static analysis | — | `src/hygiene.test.ts` (self) | exact (extend scanned-files assertion) |

---

## Pattern Assignments

### `src/execution/frameBridge.ts` (RPC broker, event-driven)

**Primary analog:** `src/data/dataBroker.ts`
**Secondary analog:** `src/execution/stateSchema.ts` (zod/mini schema pattern)

**Imports pattern** (`src/execution/stateSchema.ts` lines 1-14):
```typescript
import { z } from "zod/mini";
```

**Allowlist dispatch pattern** (`src/data/dataBroker.ts` lines 77-95 — adapt for postMessage):
The broker owns an explicit lookup by key and rejects unknowns with a neutral return (never dynamic property access on user-controlled strings):
```typescript
// dataBroker.ts — manifest lookup (adapt: replace with hardcoded RPC method map)
const entry = SOURCE_MANIFEST.get(sourceId);
if (!entry) {
  return { error: UNKNOWN_SOURCE_ERROR };
}
```

**RPC method allowlist shape to copy** (from dataBroker pattern — adapt):
```typescript
// Hardcoded map — never table[msg.method]() over user strings
const RPC_DISPATCH: Record<RpcMethod, (payload: unknown, ctx: FrameContext) => void> = {
  FRAME_READY:   handleFrameReady,
  FRAME_RESIZE:  handleFrameResize,
  FRAME_ERROR:   handleFrameError,
  RUN_HANDLER:   handleRunHandler,
  FETCH_DATA:    handleFetchData,
  MODIFY_REQUEST: handleModifyRequest,
};
// Unknown method: drop silently (never throw — a forged method must not crash the host)
const handler = RPC_DISPATCH[msg.type as RpcMethod];
if (!handler) return;
handler(msg, ctx);
```

**Prototype-pollution defense pattern** (adapt from zod/mini shape — `stateSchema.ts` lines 36-49):
```typescript
// Parse inbound payload via Object.create(null) before touching any field
function parseSafe(raw: unknown): Record<string, unknown> | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  // Copy to null-prototype object — breaks __proto__ chain
  const safe = Object.create(null) as Record<string, unknown>;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    safe[k] = v;
  }
  return safe;
}
```

**zod schema for RpcEnvelope** (mirror of `stateSchema.ts` z.looseObject pattern, lines 40-48):
```typescript
import { z } from "zod/mini";

const RpcEnvelopeSchema = z.looseObject({
  type:          z.string(),
  correlationId: z.optional(z.string()),
  payload:       z.optional(z.unknown()),
});
```

**Error handling pattern** (neutral — never throw from postMessage handler; mirror `dataBroker.ts` catch pattern lines 128-134):
```typescript
// Always return a neutral result; never rethrow out of a postMessage handler
try {
  const result = await handler(safe, ctx);
  sendToFrame(frameEl, { type: "RUN_HANDLER_RESULT", correlationId, payload: result });
} catch {
  // gated logger only — never expose error detail to the frame
  logger.error("frameBridge: RPC handler threw");
  sendToFrame(frameEl, { type: "RUN_HANDLER_RESULT", correlationId, payload: { error: "Could not complete this action." } });
}
```

**Correlation-ID map pattern** (session-scoped Map, keyed by [frameId, correlationId]):
```typescript
// Keyed compound string to namespace by frame — prevents cross-frame collision
type PendingKey = `${string}:${string}`; // `${frameId}:${correlationId}`
const pending = new Map<PendingKey, (result: unknown) => void>();
```

---

### `src/execution/frameMount.ts` (mount manager, event-driven)

**Primary analog:** `src/execution/mount.ts`

**Imports pattern** (`src/execution/mount.ts` lines 1-18):
```typescript
import { createRoot, type Root } from "react-dom/client";
import { createElement, type ComponentType } from "react";
import { ErrorBoundary } from "../ui/ErrorBoundary";
```

**Map<instanceId, ref> + register/unregister pattern** (`src/execution/mount.ts` lines 19-82):
```typescript
// mount.ts — Map keyed by instanceId (copy this shape exactly for HTMLIFrameElement)
const roots = new Map<string, Root>();

export function mountApp(instanceId: string, container: HTMLElement, Component: ComponentType): void {
  let root = roots.get(instanceId);
  if (!root) {
    root = createRoot(container);
    roots.set(instanceId, root);
  }
  root.render(createElement(ErrorBoundary, null, createElement(Component)));
}

export function unmountApp(instanceId: string): void {
  const root = roots.get(instanceId);
  if (root) {
    root.unmount();
    roots.delete(instanceId);
  }
}
```

**Adapted shape for frameMount.ts** (copy Map pattern, swap Root → HTMLIFrameElement):
```typescript
const frameRefs = new Map<string, HTMLIFrameElement>();

export function registerFrame(instanceId: string, el: HTMLIFrameElement): void {
  frameRefs.set(instanceId, el);
}

export function unregisterFrame(instanceId: string): void {
  frameRefs.delete(instanceId);
}

export function broadcastTheme(vars: Record<string, string>): void {
  for (const [, el] of frameRefs) {
    el.contentWindow?.postMessage({ type: "THEME_PUSH", vars }, "*");
  }
}
```

**Module-level constant pattern** (build srcdoc once, reuse per instance — analogous to `mount.ts` module-level `roots` Map):
```typescript
// Built once at module load (heavy ~553KB string; must not be rebuilt per frame)
export const SRCDOC_TEMPLATE: string = buildSrcdocTemplate();
```

---

### `src/ui/SandboxFrame.tsx` (React component, request-response + event-driven)

**Primary analog:** `src/ui/WindowFrame.tsx`
**Secondary analog:** `src/ui/ErrorBoundary.tsx`

**Imports pattern** (`src/ui/WindowFrame.tsx` lines 15-22):
```typescript
import { useState, type ComponentType, memo, useRef } from "react";
import { MoreVertical } from "lucide-react";
import { AppShell } from "./AppShell";
import { ContextualPrompt } from "./ContextualPrompt";
import { ErrorBoundary } from "./ErrorBoundary";
import { useDrag } from "./useDrag";
import { iconForAppType } from "./iconForApp";
import { SNAP_THRESHOLD } from "./snapConstants";
```

**Component props interface pattern** (`src/ui/WindowFrame.tsx` lines 67-107 — adapt for SandboxFrame):
```typescript
// WindowFrame — copy this props-interface style for SandboxFrame
export interface WindowFrameProps {
  id: string;
  instanceId: string;
  title: string;
  // ...
  Component: ComponentType | null;
  onClose: () => void;
  // ...
}
```

**Adapted SandboxFrame props** (derive from WindowFrame pattern):
```typescript
export interface SandboxFrameProps {
  instanceId: string;
  title: string;
  transpiledJS: string;
  themeVars: Record<string, string>;
  onClose: () => void;
  onModify?: (instruction: string) => void;
}
```

**useRef + useState lifecycle pattern** (`src/ui/WindowFrame.tsx` lines 131-138):
```typescript
const frameRef = useRef<HTMLDivElement>(null);
const [promptOpen, setPromptOpen] = useState(false);
const draggingRef = useRef(false);
const lastEdgeRef = useRef<"left" | "right" | null>(null);
```

**Adapted for SandboxFrame** (copy ref + state pattern):
```typescript
const iframeRef = useRef<HTMLIFrameElement>(null);
const [height, setHeight] = useState(300);
const [ready, setReady] = useState(false);
const [errored, setErrored] = useState(false);
const missedPongsRef = useRef(0);
```

**Error overlay pattern** (`src/ui/ErrorBoundary.tsx` lines 30-54):
```typescript
// ErrorBoundary fallback — copy neutral copy and button pattern for the unresponsive overlay
return (
  <div className="error-boundary-fallback" role="alert">
    <h2 className="error-boundary-fallback__heading">Something went wrong</h2>
    <p className="error-boundary-fallback__body">This section couldn't load. Try refreshing.</p>
    <button type="button" className="error-boundary-fallback__retry" onClick={this.handleRetry}>
      Try again
    </button>
  </div>
);
```

**Adapted for SandboxFrame unresponsive overlay** (copy the neutral-copy + button shape; do not use "iframe"/"sandbox"/"isolation" in any visible string):
```typescript
// Neutral copy only — no mechanism-revealing language
<div className="app-frame__overlay" role="alert">
  <p className="app-frame__overlay-body">This app stopped responding.</p>
  <button type="button" className="app-frame__overlay-close" onClick={handleForceClose}>
    Close
  </button>
</div>
```

**postMessage handler + cleanup pattern** (adapt from `src/host/globalErrorBackstop.ts` lines 73-97):
```typescript
// globalErrorBackstop.ts — addEventListener + cleanup function pattern
opts.target.addEventListener("error", onError);
opts.target.addEventListener("unhandledrejection", onRejection);
return () => {
  opts.target.removeEventListener("error", onError);
  opts.target.removeEventListener("unhandledrejection", onRejection);
};
```

**Adapted for SandboxFrame useEffect**:
```typescript
useEffect(() => {
  function onMessage(event: MessageEvent): void {
    if (event.source !== iframeRef.current?.contentWindow) return;
    if (event.origin !== "null") return;
    // ... dispatch to RPC_DISPATCH allowlist
  }
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}, [instanceId]);
```

---

### `src/execution/loader.ts` (modify — add `getTranspiledJS` accessor)

**Analog:** `src/execution/loader.ts` itself (lines 107-112, 381-388)

**Pattern to follow — existing module-level cache exposure** (lines 385-388):
```typescript
// loader.ts — existing test-only export pattern
// Exported for tests only — allows clearing in-memory caches between test runs.
export function _clearCachesForTesting(): void {
  liveComponents.clear();
  transpiledCache.clear();
}
```

**New accessor to add** (follow same read-only export style; locate after line 388):
```typescript
/**
 * Return the transpiled JS string for a cached app, or undefined on miss.
 * Exposed so SandboxFrame can retrieve the compiled string for frame injection
 * without re-resolving. Read-only — never mutates the cache.
 */
export function getTranspiledJS(cacheKey: string): string | undefined {
  return transpiledCache.get(cacheKey)?.transpiledJS;
}
```

---

### `src/services/services.ts` (modify — add `frameMode` field)

**Analog:** `src/services/services.ts` itself (lines 32-60)

**Existing optional field pattern** (lines 51-59):
```typescript
// services.ts — optional field with JSDoc on the interface
/**
 * Data-fetch broker for the sanctioned network-data path (DATA-01).
 * Optional — core flow unaffected when absent.
 */
fetchDataBroker?: DataFetchBroker;
/**
 * Durable mirror for user preferences (Phase 14, THEME-01): ...
 */
settingsStore: SettingsStore;
```

**New field to add** (follow same JSDoc + required-field style; place after `settingsStore`):
```typescript
/**
 * Execution mode for app bodies (Phase 20, SANDBOX-05).
 * "iframe"   — app bodies render in an opaque-origin sandboxed frame (production default).
 * "in-tree"  — app bodies render in the host React tree (JSDOM / RTL test default).
 */
frameMode: "iframe" | "in-tree";
```

**`createServices()` default** (lines 101-116 pattern — add alongside existing fields):
```typescript
// In createServices():
frameMode: "iframe",
```

---

### `src/services/testServices.ts` (modify — default `frameMode` to `"in-tree"`)

**Analog:** `src/services/testServices.ts` itself (lines 105-138)

**Existing override pattern** (`TestServicesOverrides` + `createTestServices` lines 105-138):
```typescript
export interface TestServicesOverrides {
  transport?: TransportFn;
  registry?: Registry;
  apiKey?: string | null;
  produceGate?: ProduceGate;
  storage?: StoragePressureSeam;
  fetchDataBroker?: DataFetchBroker;
  settingsStore?: SettingsStore;
}

export function createTestServices(overrides: TestServicesOverrides = {}): Services {
  // ...
  return {
    transport: overrides.transport ?? unusedTransport,
    registry: overrides.registry ?? createInMemoryRegistry(),
    // ...
    settingsStore: overrides.settingsStore ?? createRecordingSettingsStore(),
  };
}
```

**New field to add** (follow exact same optional-override pattern):
```typescript
// In TestServicesOverrides:
frameMode?: "iframe" | "in-tree";

// In createTestServices() return:
frameMode: overrides.frameMode ?? "in-tree",
```

---

### `src/services/ServicesProvider.tsx` (modify — expose `frameMode` via context)

**Analog:** `src/services/ServicesProvider.tsx` itself (full file, lines 1-39)

No structural changes needed — the provider passes the `Services` object as-is through context. Consumers call `useServices().frameMode`. The file shape (createContext → Provider → useServices hook) stays identical.

**Pattern to follow for any new hook** (lines 28-38):
```typescript
export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (services === null) {
    throw new Error("useServices must be used within a ServicesProvider");
  }
  return services;
}
```

---

### `src/ui/WindowFrame.tsx` (modify — swap WindowBody for SandboxFrame when `frameMode==="iframe"`)

**Analog:** `src/ui/WindowFrame.tsx` itself (lines 39-65, 316-324)

**WindowBody + conditional render pattern** (lines 39-65 and 316-324):
```typescript
// WindowFrame.tsx — the memoized body component swapped by frameMode
const WindowBody = memo(
  function WindowBody({ title, Component, onClose }: WindowBodyProps) {
    if (!Component) {
      return <div className="window-chrome__placeholder">Preparing…</div>;
    }
    return (
      <AppShell displayName={title}>
        <ErrorBoundary>
          <Component />
        </ErrorBoundary>
      </AppShell>
    );
  },
  (prev, next) =>
    prev.instanceId === next.instanceId &&
    prev.title === next.title &&
    prev.Component === next.Component,
);

// In JSX:
<div className="window-chrome__body" onPointerDown={onFocus}>
  <WindowBody instanceId={instanceId} title={title} Component={Component} onClose={onClose} />
</div>
```

**Adapted swap** (add `frameMode` read from `useServices()`, add `appCacheKey` prop, swap body):
```typescript
import { useServices } from "../services/ServicesProvider";
// ...
const { frameMode } = useServices();
// In the body div:
<div className="window-chrome__body" onPointerDown={onFocus}>
  {frameMode === "iframe"
    ? <SandboxFrame instanceId={instanceId} title={title} transpiledJS={transpiledJS} themeVars={currentThemeVars} onClose={onClose} onModify={onModify} />
    : <WindowBody instanceId={instanceId} title={title} Component={Component} onClose={onClose} />}
</div>
```

---

### `src/ui/VibeThemeProvider.tsx` (modify — call `broadcastTheme(vars)` in `setTheme`)

**Analog:** `src/ui/VibeThemeProvider.tsx` itself (lines 144-163)

**Existing `setTheme` callback pattern** (lines 144-163):
```typescript
const setTheme = useCallback(
  (name: VibeThemeName) => {
    setThemeState(name);
    try {
      localStorage.setItem(STORAGE_KEY_OS_THEME, name);
    } catch {
      // best-effort
    }
    void settingsStore.write(name);
  },
  [settingsStore],
);
```

**Adapted — add `broadcastTheme` call** (fire-and-forget, same pattern as `settingsStore.write`):
```typescript
import { broadcastTheme } from "../execution/frameMount";
// ...
const setTheme = useCallback(
  (name: VibeThemeName) => {
    setThemeState(name);
    try {
      localStorage.setItem(STORAGE_KEY_OS_THEME, name);
    } catch {
      // best-effort
    }
    void settingsStore.write(name);
    // Push theme vars into all open frames (CSS vars do not cross iframe boundary)
    broadcastTheme(VIBE_THEMES[name]);
  },
  [settingsStore],
);
```

---

### `src/hygiene.test.ts` (modify — extend scanned-files assertion + ban list for UI copy)

**Analog:** `src/hygiene.test.ts` itself (lines 158-183)

**Existing scanned-files assertion pattern** (lines 158-183):
```typescript
it("explicitly covers the Phase-16, Phase-17, and Phase-18 source files ...", () => {
  const scanned = new Set(
    walk(SRC_DIR).map((f) => relative(REPO_ROOT, f).split(sep).join("/")),
  );
  for (const file of [
    "src/ui/DesktopShell.tsx",
    // ... etc
    "src/ui/VibeThemeProvider.tsx",
    "src/execution/colorCheck.ts",
    "src/ui/sanitizeDisplayName.ts",
  ]) {
    expect(scanned, `hygiene gate must scan ${file}`).toContain(file);
  }
});
```

**Adapted — add Phase 20 files** (extend the array; do not remove existing entries):
```typescript
// Add to the for...of file list:
"src/execution/frameBridge.ts",   // Phase 20 — RPC message surface
"src/execution/frameMount.ts",    // Phase 20 — srcdoc template constant
"src/ui/SandboxFrame.tsx",        // Phase 20 — frame component + postMessage payloads
```

**Note on "iframe"/"sandbox"/"isolation" ban:** These words are already blocked from UI-visible copy by the HYGIENE-07 requirement. The existing `BANNED` array (lines 46-53) scans all `.ts`/`.tsx` files in `src/`. No new regex entries are needed for these three words — they do NOT appear in the current banned set (they are allowed in code identifiers/comments). The gate's scope is user-visible strings; enforce by code review at the copy-writing sites (`app-frame__overlay-body`, error messages), not by a new regex (adding them as bare regexes would false-positive on the identifier names `SandboxFrame`, `frameBridge`, etc.).

---

## Shared Patterns

### IoC / DI seam (Services interface)
**Source:** `src/services/services.ts` lines 32-60 + `src/services/ServicesProvider.tsx` lines 20-38
**Apply to:** All new/modified files that need `frameMode`
```typescript
// Consumer pattern — never import createServices() directly
const { frameMode } = useServices();
```

### zod/mini schema validation
**Source:** `src/execution/stateSchema.ts` lines 14-49
**Apply to:** `src/execution/frameBridge.ts` (RpcEnvelope schema)
```typescript
import { z } from "zod/mini";
// Use z.looseObject for envelopes so unknown future fields pass through
const schema = z.looseObject({ type: z.string(), correlationId: z.optional(z.string()), payload: z.optional(z.unknown()) });
const result = schema.safeParse(parseSafe(event.data));
if (!result.success) return; // drop malformed
```

### Neutral error handling (never throw from message handlers)
**Source:** `src/data/dataBroker.ts` lines 128-134 + `src/ui/ErrorBoundary.tsx` lines 24-26
**Apply to:** `src/execution/frameBridge.ts`, `src/ui/SandboxFrame.tsx`
```typescript
// Outer catch: never rethrow — always swallow to logger, return neutral error
} catch {
  logger.error("frameBridge: ...");
  return; // or send neutral RPC result
}
```

### Gated logger (never surface mechanic in console)
**Source:** `src/lib/logger.ts` (logger.error / logger.info)
**Apply to:** `src/execution/frameBridge.ts`, `src/execution/frameMount.ts`, `src/ui/SandboxFrame.tsx`
```typescript
import { logger } from "../lib/logger";
logger.error("frameMount: broadcastTheme failed: " + String(err));
```

### Map<instanceId, T> lifecycle (register/unregister)
**Source:** `src/execution/mount.ts` lines 19-82
**Apply to:** `src/execution/frameMount.ts`
Exact shape: module-level `Map`, named `register*` / `unregister*` / `broadcast*` exports, safe-delete (no-op if key absent).

### Neutral UI copy (no mechanism words)
**Source:** `src/ui/ErrorBoundary.tsx` lines 33-50
**Apply to:** `src/ui/SandboxFrame.tsx` (unresponsive overlay, error states)
Pattern: "Something went wrong" / "This section couldn't load" / "Try again" — never "iframe", "sandbox", "isolation", "frame".

---

## No Analog Found

All 10 files have close analogs in the codebase. No files require falling back to RESEARCH.md patterns exclusively — though the srcdoc template constant (inlined React CJS) has no direct analog (no other file inlines large JS strings). The planner should treat the srcdoc build as a one-off string-concatenation constant with the shape specified in CONTEXT.md section "srcdoc + inlined React (SANDBOX-01)".

---

## Metadata

**Analog search scope:** `src/execution/`, `src/services/`, `src/ui/`, `src/data/`, `src/host/`
**Files read:** 13 source files
**Pattern extraction date:** 2026-06-27
