---
phase: 20-opaque-origin-frame-isolation
plan: 03
type: tdd
wave: 2
depends_on: [20-01, 20-02]
files_modified:
  - src/ui/SandboxFrame.tsx
  - src/ui/SandboxFrame.test.tsx
  - src/ui/SandboxFrame.css
autonomous: true
requirements: [SANDBOX-01, SANDBOX-03, SANDBOX-06]
must_haves:
  truths:
    - "The mounted iframe carries sandbox=\"allow-scripts\" and the attribute never contains allow-same-origin"
    - "On FRAME_READY the component sends VIBE_BOOTSTRAP { transpiledJS, themeVars } to the frame"
    - "A FRAME_RESIZE message updates the iframe height; a FRAME_ERROR shows the neutral error overlay"
    - "A forged message (wrong source or wrong origin) is ignored — no bootstrap, no height change"
    - "After N missed pongs the unresponsive overlay appears with a Close (force-close) button using neutral copy"
  artifacts:
    - path: "src/ui/SandboxFrame.tsx"
      provides: "The <iframe sandbox=allow-scripts srcdoc> React component: handshake state machine, RPC handler wiring, auto-height, error + unresponsive overlays, ping/force-close, register/unregister on mount/unmount"
      contains: "sandbox=\"allow-scripts\""
  key_links:
    - from: "src/ui/SandboxFrame.tsx"
      to: "src/execution/frameBridge.ts"
      via: "isFromFrame guard + dispatchInbound allowlist + resolvePending for RUN_HANDLER_RESULT/FETCH_DATA_RESULT"
      pattern: "isFromFrame|dispatchInbound"
    - from: "src/ui/SandboxFrame.tsx"
      to: "src/execution/frameMount.ts"
      via: "buildSrcdoc for the srcdoc attr + registerFrame/unregisterFrame in a mount effect"
      pattern: "registerFrame|buildSrcdoc"
---

<objective>
Build `SandboxFrame.tsx` — the React component that renders `<iframe sandbox="allow-scripts" srcdoc=...>` at an opaque origin and drives the full message round-trip: handshake (FRAME_READY -> VIBE_BOOTSTRAP), auto-height (FRAME_RESIZE -> iframe height), neutral error overlay (FRAME_ERROR), and the SANDBOX-06 liveness loop (periodic FRAME_PING; after N missed FRAME_PONGs, an unresponsive overlay with a force-close button). All message handling goes through the Plan-01 frameBridge guard + allowlist; the frame is registered/unregistered with the Plan-02 frameMount registry so theme pushes reach it.

Purpose: SANDBOX-01 (the actual opaque-origin frame element + handshake), SANDBOX-03 (the parent-side message handler that validates source+origin and dispatches via the allowlist), SANDBOX-06 (unresponsive overlay + force-close). Wave 3 swaps this in for `WindowBody` behind the `frameMode` flag.

Output: `src/ui/SandboxFrame.tsx`, `src/ui/SandboxFrame.css`, and a JSDOM/RTL test file that drives the handshake/height/error/unresponsive state machine with a mocked `contentWindow` (JSDOM cannot execute a real srcdoc — the real round-trip is proven by Playwright in Plan 05).
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
<!-- Extracted from Plans 01/02 + the codebase. Use directly. -->

From src/execution/frameBridge.ts (Plan 01 — consume these; do not re-derive validation):
```typescript
export type RpcMethod = "FRAME_READY" | "RUN_HANDLER" | "FETCH_DATA" | "MODIFY_REQUEST" | "FRAME_RESIZE" | "FRAME_ERROR" | "FRAME_PONG";
export interface RpcEnvelope { type: string; correlationId?: string; payload?: unknown }
export function isFromFrame(event: MessageEvent, frameWindow: Window | null): boolean;
export function parseSafe(raw: unknown): Record<string, unknown> | null;
export function dispatchInbound(env: RpcEnvelope, ctx: FrameContext, table: Record<RpcMethod, InboundHandler>): void;
export function sendToFrame(frameWindow: Window | null, env: RpcEnvelope, targetOrigin: string): void;
export function registerPending(frameId, correlationId, cb): void;
export function resolvePending(frameId, correlationId, result): void;
export function clearPendingForFrame(frameId: string): void;
export function newCorrelationId(): string;
```

From src/execution/frameMount.ts (Plan 02 — consume these):
```typescript
export function buildSrcdoc(transpiledJS: string, themeVars: Record<string, string>, parentOrigin: string): string;
export function registerFrame(instanceId: string, el: HTMLIFrameElement): void;
export function unregisterFrame(instanceId: string): void;
```

From src/ui/ErrorBoundary.tsx (the NEUTRAL overlay copy + button shape to mirror — NEVER use "iframe"/"sandbox"/"isolation"/"frame" in visible copy):
```tsx
<div className="error-boundary-fallback" role="alert">
  <h2 className="error-boundary-fallback__heading">Something went wrong</h2>
  <p className="error-boundary-fallback__body">This section couldn't load. Try refreshing.</p>
  <button type="button" className="error-boundary-fallback__retry" onClick={...}>Try again</button>
</div>
```

From src/host/globalErrorBackstop.ts (the addEventListener + cleanup-return effect pattern to mirror):
```typescript
opts.target.addEventListener("message", onMessage);
return () => opts.target.removeEventListener("message", onMessage);
```

From src/ui/WindowFrame.tsx (the WindowBody props SandboxFrame replaces — keep prop-shape compatible):
```tsx
// WindowBody received: instanceId, title, Component, onClose.
// SandboxFrame replaces it and instead needs: instanceId, title, transpiledJS, themeVars, onClose, onModify?, onRunHandler?, onFetchData?
```
</interfaces>

<liveness_constants>
<!-- SANDBOX-06 mitigation parameters (the loop cannot terminate() the frame; it surfaces an overlay). -->
- FRAME_PING interval: ~2000ms (a setInterval posting FRAME_PING to the frame).
- Missed-pong threshold: 3 consecutive missed pongs -> show the unresponsive overlay.
- Each FRAME_PONG resets the missed counter to 0.
- Force-close button calls onClose (the same teardown the window close uses); the orphaned loop is documented as a known limitation (NOT solved).
</liveness_constants>
</context>

<tasks>

<task type="tdd" tdd="true">
  <name>Task 1: RED+GREEN — the iframe element, sandbox attr, srcdoc, register/unregister, and the validated message handler (handshake)</name>
  <read_first>
    - src/ui/WindowFrame.tsx lines 15-65, 109-138, 316-324 (WindowBody props + useRef/useState lifecycle + the body div SandboxFrame slots into)
    - src/execution/frameBridge.ts (Plan 01 — isFromFrame, parseSafe, dispatchInbound, sendToFrame, RpcMethod)
    - src/execution/frameMount.ts (Plan 02 — buildSrcdoc, registerFrame, unregisterFrame)
    - src/host/globalErrorBackstop.ts lines 73-97 (addEventListener + cleanup effect pattern)
    - .planning/phases/20-opaque-origin-frame-isolation/20-PATTERNS.md lines 173-280 (SandboxFrame analog: props, refs/state, error overlay, useEffect message handler)
    - .planning/phases/20-opaque-origin-frame-isolation/20-CONTEXT.md lines 28-44 (sandbox=allow-scripts ONLY, handshake FRAME_READY->VIBE_BOOTSTRAP, dual guard)
  </read_first>
  <behavior>
    - Test: rendering `<SandboxFrame instanceId="a" title="Notes" transpiledJS="const App=()=>null;" themeVars={...} onClose={fn} />` produces exactly one `<iframe>` whose `sandbox` attribute === "allow-scripts" (NOT containing "allow-same-origin", NOT containing "allow-modals").
    - Test: the iframe's `srcdoc` attribute is the output of `buildSrcdoc(...)` (assert it contains the in-frame CSP `connect-src 'none'`).
    - Test: on mount, `registerFrame(instanceId, iframeEl)` is called; on unmount, `unregisterFrame(instanceId)` and `clearPendingForFrame(instanceId)` are called.
    - Test (HANDSHAKE): simulate a `message` event with `origin:"null"`, `source: iframeEl.contentWindow`, `data:{ type:"FRAME_READY" }` -> the component calls `sendToFrame(contentWindow, { type:"VIBE_BOOTSTRAP", payload:{ transpiledJS, themeVars } }, "*")` exactly once. (Mock `iframeRef.current.contentWindow` to a stub object the test controls so `event.source ===` it.)
    - Test (FORGED DROP): a `message` event with `origin:"https://evil.test"` OR `source: someOtherWindow` and `data:{ type:"FRAME_READY" }` -> NO VIBE_BOOTSTRAP is sent (the isFromFrame guard rejects it).
  </behavior>
  <action>
    Create `src/ui/SandboxFrame.tsx` exporting `interface SandboxFrameProps { instanceId: string; title: string; transpiledJS: string; themeVars: Record<string,string>; onClose: () => void; onModify?: (instruction: string) => void; onRunHandler?: (intent: string, input: unknown) => Promise<{data?:unknown;error?:string}>; onFetchData?: (sourceId: string, params: unknown) => Promise<{data?:unknown;error?:string}> }` and a `SandboxFrame` function component. Render a single `<iframe className="app-frame__iframe" ref={iframeRef} sandbox="allow-scripts" srcdoc={srcdoc} title={title} />` where `srcdoc = useMemo(() => buildSrcdoc(transpiledJS, themeVars, window.location.origin), [...])`. Set the literal string `sandbox="allow-scripts"` — never compose it from variables, never add `allow-same-origin`/`allow-modals`. Add a `useEffect` (mirror globalErrorBackstop) that adds a `window` `message` listener: guard with `isFromFrame(event, iframeRef.current?.contentWindow ?? null)` (drop if false), `parseSafe(event.data)` (drop if null), `RpcEnvelopeSchema.safeParse` (Plan 01), then `dispatchInbound` against the component's handler table. The handler table (typed `Record<RpcMethod, InboundHandler>`) wires: FRAME_READY -> `sendToFrame(contentWindow, { type:"VIBE_BOOTSTRAP", payload:{ transpiledJS, themeVars } }, "*")`; the others are wired in Task 2/3. Add a mount effect calling `registerFrame(instanceId, iframeRef.current!)` and returning a cleanup that calls `unregisterFrame(instanceId)` + `clearPendingForFrame(instanceId)`. Keep all visible/console strings neutral (no banned tokens, no "iframe"/"sandbox"/"isolation" in any string literal — the JSX attribute `sandbox="allow-scripts"` is an internal HTML attribute, allowed; do not put those words in user copy or aria-labels).
  </action>
  <verify>
    <automated>npx vitest run src/ui/SandboxFrame.test.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `src/ui/SandboxFrame.tsx` contains the literal `sandbox="allow-scripts"` (source assertion).
    - The rendered iframe's `getAttribute("sandbox") === "allow-scripts"` and does NOT include `allow-same-origin` (behavior assertion).
    - FRAME_READY from the live contentWindow triggers exactly one VIBE_BOOTSTRAP send; a forged-source/origin FRAME_READY triggers zero (behavior assertions).
    - `registerFrame`/`unregisterFrame` are called on mount/unmount (behavior assertion, e.g. via vi.spyOn).
    - `npx vitest run src/ui/SandboxFrame.test.tsx` exits 0.
  </acceptance_criteria>
  <done>The opaque-origin iframe element renders with the exact `allow-scripts` sandbox, registers with the frame registry, and only the validated FRAME_READY from the live frame triggers VIBE_BOOTSTRAP.</done>
</task>

<task type="tdd" tdd="true">
  <name>Task 2: RED+GREEN — auto-height (FRAME_RESIZE), RPC results (RUN_HANDLER/FETCH_DATA), modify + error overlay (FRAME_ERROR)</name>
  <read_first>
    - src/ui/SandboxFrame.tsx (the component from Task 1)
    - src/execution/frameBridge.ts (resolvePending, registerPending, newCorrelationId)
    - src/data/dataBroker.ts lines 26-41, 77-95 (the FETCH_DATA must be brokered PARENT-side through this allowlist — wired via onFetchData prop in Wave 3)
    - src/ui/ErrorBoundary.tsx lines 33-54 (neutral error overlay copy + button to mirror for FRAME_ERROR)
    - .planning/phases/20-opaque-origin-frame-isolation/20-CONTEXT.md line 44 (method set: RUN_HANDLER+result, FETCH_DATA+result dataBroker-allowlisted, MODIFY_REQUEST, FRAME_ERROR, FRAME_RESIZE)
  </read_first>
  <behavior>
    - Test (HEIGHT): a validated `FRAME_RESIZE` message with `payload:{ height: 420 }` sets the iframe element height style to 420px; a subsequent `{ height: 260 }` updates it to 260px.
    - Test (RUN_HANDLER): a validated `RUN_HANDLER` message with `correlationId:"c1"`, `payload:{ intent, input }` calls the injected `onRunHandler(intent, input)`; when it resolves `{ data }`, the component sends `sendToFrame(contentWindow, { type:"RUN_HANDLER_RESULT", correlationId:"c1", payload:{ data } }, "*")` once.
    - Test (RUN_HANDLER neutral error): if `onRunHandler` rejects/throws, the result envelope payload carries a neutral `{ error }` (mirror dataBroker neutral copy) — NEVER the raw error text.
    - Test (FETCH_DATA): a validated `FETCH_DATA` with `correlationId` + `payload:{ sourceId, params }` calls `onFetchData(sourceId, params)` and returns `FETCH_DATA_RESULT` correlation-keyed (the dataBroker allowlist is enforced in the injected `onFetchData`, parent-side).
    - Test (MODIFY): a validated `MODIFY_REQUEST` with `payload:{ instruction }` calls `onModify(instruction)` once (no result envelope).
    - Test (ERROR OVERLAY): a validated `FRAME_ERROR` message renders a neutral overlay (role="alert") with the copy from ErrorBoundary-style text and NO banned tokens, NO "iframe"/"sandbox"/"isolation".
  </behavior>
  <action>
    Extend the handler table in `SandboxFrame.tsx`. FRAME_RESIZE: read `payload.height` (number-guarded), `setHeight(h)` -> apply to the iframe style. RUN_HANDLER: read `payload.intent`/`payload.input`, `await onRunHandler?.(intent, input)` inside try/catch, then `sendToFrame(..., { type:"RUN_HANDLER_RESULT", correlationId, payload: result ?? { error: NEUTRAL } }, "*")`; on throw send `{ error: NEUTRAL }` (neutral copy constant, mechanism-free). FETCH_DATA: same shape against `onFetchData?.(sourceId, params)` -> `FETCH_DATA_RESULT`. MODIFY_REQUEST: `onModify?.(payload.instruction)` (no result). FRAME_ERROR: `setErrored(true)` -> render the neutral overlay (mirror ErrorBoundary copy: "Something went wrong" / "This section couldn't load." / a "Try again" or "Reload" button that re-sends VIBE_BOOTSTRAP or calls a reload). Apply the height to the iframe via inline `style={{ height }}`. All result envelopes use `"*"` targetOrigin (parent->frame). Keep neutral copy only.
  </action>
  <verify>
    <automated>npx vitest run src/ui/SandboxFrame.test.tsx</automated>
  </verify>
  <acceptance_criteria>
    - FRAME_RESIZE updates the iframe height (behavior assertion at two heights).
    - RUN_HANDLER and FETCH_DATA round-trip through the injected props and return correlation-keyed `*_RESULT` envelopes; a thrown handler yields a neutral `{ error }` payload (behavior assertions).
    - MODIFY_REQUEST invokes `onModify` once (behavior assertion).
    - FRAME_ERROR renders a `role="alert"` overlay with neutral copy and zero banned/forbidden words (behavior assertion).
    - `npx vitest run src/ui/SandboxFrame.test.tsx` exits 0.
  </acceptance_criteria>
  <done>Auto-height, the RUN_HANDLER/FETCH_DATA correlation round-trips (neutral errors), MODIFY_REQUEST, and the neutral FRAME_ERROR overlay all work through the validated allowlist.</done>
</task>

<task type="tdd" tdd="true">
  <name>Task 3: RED+GREEN — SANDBOX-06 liveness: ping/pong + unresponsive overlay + force-close, plus styling</name>
  <read_first>
    - src/ui/SandboxFrame.tsx (the component from Tasks 1-2)
    - src/ui/ErrorBoundary.tsx lines 33-54 (the neutral overlay shape)
    - .planning/phases/20-opaque-origin-frame-isolation/20-PATTERNS.md lines 247-256 (the unresponsive overlay neutral-copy shape: "This app stopped responding." + "Close")
    - .planning/phases/20-opaque-origin-frame-isolation/20-CONTEXT.md lines 54-55 (SANDBOX-06: ping/timeout/overlay/force-close; known limitation)
    - The `<liveness_constants>` block above (2000ms interval, 3 missed pongs threshold)
  </read_first>
  <behavior>
    - Test (PING): with fake timers, after the ping interval the component calls `sendToFrame(contentWindow, { type:"FRAME_PING" }, "*")`.
    - Test (PONG RESETS): a validated `FRAME_PONG` resets the missed-pong counter; with pongs arriving each interval, the unresponsive overlay NEVER appears.
    - Test (UNRESPONSIVE): with fake timers and NO pongs, after 3 consecutive missed intervals the unresponsive overlay (role="alert") appears with neutral copy "This app stopped responding." and a "Close" button.
    - Test (FORCE-CLOSE): clicking the overlay's "Close" button calls `onClose` exactly once.
    - Test (CLEANUP): unmount clears the ping interval (no post-unmount sendToFrame; assert via fake timers advancing past unmount).
  </behavior>
  <action>
    Add the liveness loop to `SandboxFrame.tsx`: a `useEffect` starting a `setInterval(pingMs)` that posts `FRAME_PING` and increments a `missedPongsRef`; a `FRAME_PONG` handler resets `missedPongsRef.current = 0`. When `missedPongsRef.current >= 3`, `setUnresponsive(true)`. Render the unresponsive overlay (separate from the FRAME_ERROR overlay) with neutral copy "This app stopped responding." and a `<button>` "Close" calling `onClose`. Clear the interval on unmount. Add a comment documenting the known limitation neutrally (the loop continues in the orphaned context until force-closed) WITHOUT any banned/forbidden word. Create `src/ui/SandboxFrame.css` with `.app-frame__iframe` (border:0; width:100%; display:block) and `.app-frame__overlay` / `.app-frame__overlay-body` / `.app-frame__overlay-close` styled to match the glass aesthetic using the theme CSS vars (`--glass`, `--text`, `--bord`); import it from the component (or rely on the project's CSS convention — match how WindowFrame/ErrorBoundary styles are loaded). Neutral class names only (no mechanism words).
  </action>
  <verify>
    <automated>npx vitest run src/ui/SandboxFrame.test.tsx</automated>
  </verify>
  <acceptance_criteria>
    - With fake timers and no pongs, the unresponsive overlay appears after 3 missed intervals; with pongs it never appears (behavior assertions).
    - The overlay copy is "This app stopped responding." and the button is "Close"; clicking it calls `onClose` once (behavior assertions).
    - The ping interval is cleared on unmount (behavior assertion — no post-unmount ping).
    - `src/ui/SandboxFrame.css` exists with `.app-frame__overlay` and `.app-frame__iframe` classes (source assertion); no banned tokens, no "iframe"/"sandbox"/"isolation" in any class name or copy.
    - `npx vitest run src/ui/SandboxFrame.test.tsx` exits 0.
  </acceptance_criteria>
  <done>The SANDBOX-06 ping/pong liveness loop surfaces a neutral unresponsive overlay with a working force-close after the missed-pong threshold, and cleans up on unmount; styling is in place.</done>
</task>

<task type="auto">
  <name>Task 4: Full-suite green + tsc clean</name>
  <read_first>
    - src/ui/SandboxFrame.tsx (the completed component)
    - src/ui/SandboxFrame.test.tsx (the completed tests)
  </read_first>
  <action>
    Run the full suite + typechecker. SandboxFrame is not yet rendered by WindowFrame (Wave 3 wires it behind frameMode), so the prior 761 tests stay green and the new SandboxFrame tests add to the count. Fix any tsc issues (DOM `Window`/`HTMLIFrameElement` typing, the handler-table `Record<RpcMethod, InboundHandler>` exhaustiveness) without weakening the validation or the `sandbox="allow-scripts"` literal.
  </action>
  <verify>
    <automated>npx vitest run && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run` exits 0; prior 761 tests green plus new SandboxFrame tests.
    - `npx tsc --noEmit` exits 0.
  </acceptance_criteria>
  <done>Full suite green, tsc clean, SandboxFrame not yet wired into the render path (prior test count preserved).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| frame contentWindow -> SandboxFrame message handler | Every inbound message is attacker-controllable from generated code; only the live frame at origin "null" is trusted |
| SandboxFrame -> injected onRunHandler/onFetchData | The frame's data/handler requests must be brokered parent-side with allowlist enforcement (wired in Wave 3) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-10 | Spoofing | inbound message | mitigate | `isFromFrame(event, contentWindow)` dual guard before any dispatch (tested forged-drop) |
| T-20-11 | Elevation of Privilege | sandbox escape via allow-same-origin | mitigate | literal `sandbox="allow-scripts"`, never composed; test asserts attr never includes allow-same-origin |
| T-20-12 | Information Disclosure | raw error/key echoed back to frame | mitigate | RUN_HANDLER/FETCH_DATA results carry neutral `{ error }` only; FRAME_ERROR overlay uses neutral copy |
| T-20-13 | Denial of Service | runaway frame (infinite loop) | accept (contained) | SANDBOX-06 ping/timeout overlay + force-close; the loop itself cannot be terminate()d (documented known limitation) |
| T-20-14 | Tampering | forged FRAME_RESIZE driving layout abuse | mitigate | height is number-guarded + the srcdoc infinite-resize guard (Plan 02); only validated messages apply |
</threat_model>

<verification>
- `src/ui/SandboxFrame.tsx` renders one `<iframe>` with `sandbox="allow-scripts"` (never allow-same-origin), `srcdoc` from `buildSrcdoc`, registers/unregisters with frameMount, and validates every message via frameBridge.
- Handshake, height, RUN_HANDLER/FETCH_DATA correlation, MODIFY_REQUEST, FRAME_ERROR overlay, and the SANDBOX-06 unresponsive overlay + force-close all proven in JSDOM with a mocked contentWindow.
- `npx vitest run` and `npx tsc --noEmit` both exit 0.
</verification>

<success_criteria>
- An opaque-origin `allow-scripts` frame renders with the Plan-02 srcdoc.
- The component drives the handshake and the full validated RPC round-trip.
- Auto-height, neutral error overlay, and the SANDBOX-06 unresponsive overlay + force-close work.
- Only messages from the live frame at origin "null" are honored.
- Full suite + tsc green; render path unchanged until Wave 3.
</success_criteria>

<output>
After completion, create `.planning/phases/20-opaque-origin-frame-isolation/20-03-SUMMARY.md`.
</output>
