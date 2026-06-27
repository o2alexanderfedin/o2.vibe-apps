---
phase: 20-opaque-origin-frame-isolation
plan: 01
type: tdd
wave: 1
depends_on: []
files_modified:
  - src/execution/frameBridge.ts
  - src/execution/frameBridge.test.ts
autonomous: true
requirements: [SANDBOX-03]
must_haves:
  truths:
    - "A frame->parent message is accepted only when origin === 'null' AND source === the live frame's contentWindow"
    - "An unknown RPC method is dropped silently (no throw, no dispatch)"
    - "A forged {__proto__:{polluted:true}} payload leaves ({}).polluted === undefined"
    - "Each parent->frame correlation id round-trips its result back to the correct pending callback"
  artifacts:
    - path: "src/execution/frameBridge.ts"
      provides: "Typed RPC envelope, zod/mini schema, Object.create(null) parsing, hardcoded dispatch allowlist, correlation-id map, send/validate helpers"
      contains: "z.looseObject"
    - path: "src/execution/frameBridge.test.ts"
      provides: "RED->GREEN coverage of envelope parse, schema reject, source/origin guard, prototype-pollution defense, dispatch allowlist, correlation round-trip"
  key_links:
    - from: "src/execution/frameBridge.ts"
      to: "zod/mini"
      via: "import { z } from \"zod/mini\""
      pattern: "from \"zod/mini\""
    - from: "src/execution/frameBridge.ts"
      to: "RPC_METHODS allowlist"
      via: "Record<RpcMethod, handler> lookup, never table[msg.type]() over user strings"
      pattern: "Record<RpcMethod"
---

<objective>
Build the typed `postMessage` RPC core (`frameBridge.ts`) that brokers every app<->host call across the opaque-origin frame boundary. This is the security spine of Phase 20 (SANDBOX-03): envelope validation, the dual origin+source guard, prototype-pollution defense, and a hardcoded dispatch allowlist. Pure unit-testable logic in JSDOM — no real frame required.

Purpose: Every message crossing the boundary in later plans (handshake, theme push, handler/data calls, resize, error) flows through this module's validate/parse/dispatch primitives. Getting the validation + prototype-pollution + allowlist contract right HERE means the component and wiring plans consume safe primitives instead of re-deriving them.

Output: `src/execution/frameBridge.ts` (typed `RpcEnvelope`, `RpcMethod` union, `RPC_METHODS` allowlist, `parseSafe`, `validateInbound`, correlation-id `pending` map, `sendToFrame`, `callFrame` with correlation, `registerInboundHandler`/dispatch) + its test file.
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
<!-- Extracted from the codebase. The executor should use these directly — no exploration needed. -->

From src/execution/stateSchema.ts (the zod/mini pattern to MIRROR — do not invent a new import path):
```typescript
import { z } from "zod/mini";
// z.looseObject passes unknown keys through without rejecting them.
// z.optional(...), z.string(), z.unknown() are the building blocks used.
const schema = z.looseObject({ /* shape */ });
const result = schema.safeParse(value); // { success: boolean, data?, error? }
```

From src/data/dataBroker.ts (the allowlist-lookup + neutral-error patterns to MIRROR):
```typescript
const entry = SOURCE_MANIFEST.get(sourceId);
if (!entry) { return { error: UNKNOWN_SOURCE_ERROR }; }   // unknown key -> neutral, never dynamic property access
// Outer catch: never rethrow from the broker — log to gated logger, return neutral.
```

From src/lib/logger.ts (the gated logger — use for ALL diagnostics; never console.* directly):
```typescript
import { logger } from "../lib/logger";
logger.error("frameBridge: ...");  // logger.info / logger.error
```
</interfaces>

<rpc_method_set>
<!-- The COMPLETE RPC method set for Phase 20 (from 20-CONTEXT.md "Method set"). The allowlist must contain EXACTLY these and nothing else. -->
Frame -> parent (inbound to host, validated + dispatched here):
  FRAME_READY      — frame signals it loaded and is ready for VIBE_BOOTSTRAP
  RUN_HANDLER      — app asked to run a backend-style handler (has correlationId; result returns)
  FETCH_DATA       — app asked the host to fetch allowlisted data (has correlationId; result returns; dataBroker allowlist enforced PARENT-SIDE)
  MODIFY_REQUEST   — app asked for a contextual modify (no result envelope; host routes to handleModify)
  FRAME_RESIZE     — ResizeObserver reported new #root height
  FRAME_ERROR      — window.onerror inside the frame reported a fault
  FRAME_PONG       — frame answered a liveness ping (SANDBOX-06; consumed by SandboxFrame, allowlisted here)

Parent -> frame (outbound, sent via sendToFrame; NOT in the inbound dispatch allowlist):
  VIBE_BOOTSTRAP   — { transpiledJS, themeVars } sent after FRAME_READY
  THEME_PUSH       — { vars } broadcast on every theme switch
  RUN_HANDLER_RESULT / FETCH_DATA_RESULT — correlation-keyed results
  FRAME_PING       — liveness probe (SANDBOX-06)
</rpc_method_set>
</context>

<tasks>

<task type="tdd" tdd="true">
  <name>Task 1: RED+GREEN — envelope schema, parseSafe (prototype-pollution defense), and dual origin+source guard</name>
  <read_first>
    - src/execution/stateSchema.ts (the EXACT `import { z } from "zod/mini"` + `z.looseObject`/`z.optional`/`z.string` pattern — lines 14-49)
    - src/data/dataBroker.ts lines 77-95, 128-134 (allowlist-lookup + neutral-error-never-throw pattern)
    - .planning/phases/20-opaque-origin-frame-isolation/20-PATTERNS.md lines 33-108 (frameBridge analog: imports, parseSafe shape, RpcEnvelope schema, correlation-id map)
    - .planning/phases/20-opaque-origin-frame-isolation/20-CONTEXT.md lines 38-44 (the hardened postMessage RPC decisions: dual guard, prototype-pollution, allowlist)
  </read_first>
  <behavior>
    - Test: a `MessageEvent`-shaped input with `origin === "null"` and `source === knownContentWindow` passes the guard `isFromFrame(event, knownContentWindow)`; returns true.
    - Test: same payload but `origin === "https://evil.test"` (not "null") -> guard returns false (dropped).
    - Test: same payload but `source !== knownContentWindow` -> guard returns false (dropped).
    - Test: `parseSafe({ type: "FRAME_READY", payload: { a: 1 } })` returns a null-prototype object whose `type` is "FRAME_READY"; `Object.getPrototypeOf(result) === null`.
    - Test: `parseSafe(JSON.parse('{"__proto__":{"polluted":true},"type":"FRAME_RESIZE"}'))` does NOT pollute — after the call, `({} as Record<string,unknown>).polluted === undefined` AND the returned object carries no inherited `polluted`.
    - Test: `parseSafe(null)`, `parseSafe(42)`, `parseSafe([1,2])` all return null (non-plain-object inputs rejected).
    - Test: `RpcEnvelopeSchema.safeParse({ type: "FRAME_READY" }).success === true`; `safeParse({ }).success === false` (missing required `type`); `safeParse({ type: 42 }).success === false` (type must be string).
  </behavior>
  <action>
    Create `src/execution/frameBridge.ts`. Define the `RpcMethod` union type as the EXACT inbound set from `<rpc_method_set>` (FRAME_READY, RUN_HANDLER, FETCH_DATA, MODIFY_REQUEST, FRAME_RESIZE, FRAME_ERROR, FRAME_PONG). Define `interface RpcEnvelope { type: string; correlationId?: string; payload?: unknown }`. Define `RpcEnvelopeSchema = z.looseObject({ type: z.string(), correlationId: z.optional(z.string()), payload: z.optional(z.unknown()) })` importing `z` from `"zod/mini"` (mirror stateSchema.ts exactly). Export `parseSafe(raw: unknown): Record<string, unknown> | null` per the 20-PATTERNS.md shape: reject non-plain-objects (null / non-object / Array), copy every own-enumerable key onto an `Object.create(null)` target via `Object.entries`, return the null-prototype object (this is the prototype-pollution defense — never deep-merge, never spread raw). Export `isFromFrame(event: MessageEvent, frameWindow: Window | null): boolean` returning `event.origin === "null" && event.source === frameWindow && frameWindow != null`. Use the gated `logger` for any drop diagnostics; NEVER throw from a validation helper (mirror dataBroker neutral-error discipline). Do NOT put fenced code in production comments; keep mechanic-free neutral comments (no "iframe"/"sandbox"/"isolation" in any string literal — internal identifiers like the file/function names are allowed per HYGIENE-07 nuance, but error/console/DOM strings must stay neutral).
  </action>
  <verify>
    <automated>npx vitest run src/execution/frameBridge.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `src/execution/frameBridge.ts` contains `from "zod/mini"` and `z.looseObject` (source assertion).
    - `src/execution/frameBridge.ts` contains `Object.create(null)` (source assertion — prototype-pollution defense present).
    - `src/execution/frameBridge.ts` contains `event.origin === "null"` AND `event.source ===` (source assertion — dual guard present).
    - `npx vitest run src/execution/frameBridge.test.ts` exits 0 with the prototype-pollution test, the dual-guard tests, and the schema tests passing.
    - The prototype-pollution test asserts `({}).polluted === undefined` after parsing a `__proto__` payload.
  </acceptance_criteria>
  <done>The envelope schema, the null-prototype safe parser, and the dual origin+source guard exist and are proven by tests including the `__proto__` regression.</done>
</task>

<task type="tdd" tdd="true">
  <name>Task 2: RED+GREEN — hardcoded dispatch allowlist + correlation-id map + send helpers</name>
  <read_first>
    - src/execution/frameBridge.ts (the file from Task 1 — the schema/parse/guard primitives to build on)
    - .planning/phases/20-opaque-origin-frame-isolation/20-PATTERNS.md lines 48-108 (RPC_DISPATCH map shape, correlation-id PendingKey map shape, neutral-error send pattern)
    - .planning/phases/20-opaque-origin-frame-isolation/20-CONTEXT.md line 40 (parent->frame uses targetOrigin "*"; frame->parent uses injected real parentOrigin)
    - src/data/dataBroker.ts lines 77-95 (lookup-then-reject-unknown; the allowlist shape to mirror)
  </read_first>
  <behavior>
    - Test: `dispatchInbound(env, ctx)` with `env.type === "FRAME_RESIZE"` invokes the FRAME_RESIZE handler registered in the allowlist exactly once with the parsed payload.
    - Test: `dispatchInbound(env, ctx)` with `env.type === "toString"` (a prototype method name) invokes NO handler and returns without throwing (the allowlist is a hardcoded `Record`, never `table[type]()`).
    - Test: `dispatchInbound(env, ctx)` with `env.type === "VIBE_BOOTSTRAP"` (a parent->frame method, NOT inbound) invokes NO handler (drops — outbound methods are not in the inbound allowlist).
    - Test: `sendToFrame(frameWindow, { type: "THEME_PUSH", payload: { vars } }, "*")` calls `frameWindow.postMessage` once with the envelope and targetOrigin `"*"`.
    - Test: `callFrame(frameWindow, "RUN_HANDLER_RESULT" path)` — a correlation round-trip: register a pending callback under a `${frameId}:${correlationId}` key via `registerPending`, then `resolvePending(frameId, correlationId, result)` invokes that callback once with the result and deletes the entry; a second `resolvePending` for the same key is a no-op.
    - Test: `resolvePending` for an unknown `[frameId, correlationId]` is a silent no-op (no throw).
  </behavior>
  <action>
    Extend `src/execution/frameBridge.ts`. Define `type InboundHandler = (payload: Record<string, unknown> | undefined, ctx: FrameContext) => void` and `interface FrameContext { frameId: string; frameWindow: Window | null; parentOrigin: string }`. Build the dispatch allowlist as a hardcoded object literal typed `Record<RpcMethod, InboundHandler>` whose keys are EXACTLY the inbound method set; handlers are injected/registered via a `createInboundDispatch(handlers: Record<RpcMethod, InboundHandler>)` factory so SandboxFrame supplies the real handlers later. Export `dispatchInbound(env: RpcEnvelope, ctx, table: Record<RpcMethod, InboundHandler>)`: look up `table[env.type as RpcMethod]`; if absent (unknown OR an outbound/prototype name), return silently (mirror dataBroker's unknown-source neutral drop — NEVER `table[env.type]()` directly on a user string without the `in`/lookup guard). Export the correlation map: `type PendingKey = \`${string}:${string}\``; `const pending = new Map<PendingKey, (result: unknown) => void>()`; `registerPending(frameId, correlationId, cb)`, `resolvePending(frameId, correlationId, result)` (look up, call once, delete; no-op if absent), and a `clearPendingForFrame(frameId)` to drop a closed frame's callbacks. Export `sendToFrame(frameWindow: Window | null, env: RpcEnvelope, targetOrigin: string)` that no-ops if `frameWindow` is null else calls `frameWindow.postMessage(env, targetOrigin)`. Use `crypto.randomUUID()` for correlation-id minting in a `newCorrelationId()` helper. All diagnostics via gated `logger`; no neutral copy reveals mechanism.
  </action>
  <verify>
    <automated>npx vitest run src/execution/frameBridge.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `src/execution/frameBridge.ts` contains `Record<RpcMethod` (source assertion — typed hardcoded allowlist).
    - `src/execution/frameBridge.ts` contains `crypto.randomUUID()` (source assertion — correlation ids per SANDBOX-03).
    - `src/execution/frameBridge.ts` contains `postMessage` and the `"*"` targetOrigin is used by `sendToFrame` callers for parent->frame.
    - The dispatch test proves `env.type === "toString"` and `env.type === "VIBE_BOOTSTRAP"` both invoke zero handlers.
    - The correlation test proves a single resolve fires the callback once and a duplicate resolve is a no-op.
    - `npx vitest run src/execution/frameBridge.test.ts` exits 0.
  </acceptance_criteria>
  <done>The hardcoded dispatch allowlist (unknown/outbound/prototype-name methods dropped), the namespaced correlation-id pending map, and the send/correlation helpers exist and are proven by tests.</done>
</task>

<task type="auto">
  <name>Task 3: Full-suite green + tsc clean</name>
  <read_first>
    - src/execution/frameBridge.ts (the completed module)
    - src/execution/frameBridge.test.ts (the completed tests)
  </read_first>
  <action>
    Run the full test suite and the typechecker to confirm the new module integrates without regressions. `frameBridge.ts` is not yet imported by any production code (it is consumed in Wave 2+), so the existing 761 tests must be byte-identically green and the new test file adds to the count. Fix any tsc error (e.g. zod/mini type-inference mismatch on `z.looseObject`) before finishing — the established fix is to type the schema result with `ReturnType<typeof z.looseObject>` as stateSchema.ts does, or to cast the `safeParse` result, never to loosen the validation.
  </action>
  <verify>
    <automated>npx vitest run && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run` exits 0; total test count is at least 761 plus the new frameBridge tests.
    - `npx tsc --noEmit` exits 0 (zero type errors).
  </acceptance_criteria>
  <done>Full suite green (>=761 prior tests plus new ones), tsc clean, no production code imports frameBridge yet (verified by the unchanged prior test count).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| frame (untrusted generated code) -> parent host | Every inbound `postMessage` is attacker-controllable: the generated component can post arbitrary `{type, payload}` envelopes from inside the frame |
| network/other-window -> parent host | Any page or extension can `postMessage` the host window; only the live frame's contentWindow at origin "null" is trusted |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-01 | Spoofing | inbound message source | mitigate | `isFromFrame`: require BOTH `origin === "null"` AND `source === knownContentWindow`; drop otherwise (tested) |
| T-20-02 | Tampering | inbound payload (prototype pollution) | mitigate | `parseSafe` copies onto `Object.create(null)`; never deep-merge/spread raw; `__proto__` regression test asserts `({}).polluted === undefined` |
| T-20-03 | Elevation of Privilege | RPC method dispatch | mitigate | hardcoded `Record<RpcMethod, fn>` allowlist; unknown/prototype/outbound method names invoke zero handlers (no `table[userString]()`) |
| T-20-04 | Denial of Service | malformed envelope crashing host | mitigate | `RpcEnvelopeSchema.safeParse` + neutral-never-throw discipline; a malformed message is dropped, not surfaced |
| T-20-05 | Information Disclosure | error detail echoed to frame | mitigate | gated `logger` only for diagnostics; result envelopes carry neutral copy, never raw error/key material |
</threat_model>

<verification>
- `src/execution/frameBridge.ts` exists, imports `z` from `"zod/mini"`, contains `z.looseObject`, `Object.create(null)`, `Record<RpcMethod`, `crypto.randomUUID()`, and the dual `event.origin === "null"` + `event.source ===` guard.
- `npx vitest run src/execution/frameBridge.test.ts` exits 0.
- `npx vitest run` exits 0 (full suite, no regressions).
- `npx tsc --noEmit` exits 0.
</verification>

<success_criteria>
- The RPC envelope is schema-validated; malformed messages are dropped.
- Inbound messages are accepted only from origin "null" + the known contentWindow.
- A `__proto__` payload cannot pollute parent prototypes (regression-tested).
- The dispatch allowlist is a hardcoded `Record`; unknown methods are dropped.
- Correlation ids (`crypto.randomUUID()`) round-trip results to the right pending callback.
- Full suite + tsc green; no production code imports the module yet.
</success_criteria>

<output>
After completion, create `.planning/phases/20-opaque-origin-frame-isolation/20-01-SUMMARY.md`.
</output>
