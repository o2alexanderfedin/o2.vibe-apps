---
phase: 20-opaque-origin-frame-isolation
reviewed: 2026-06-27T17:10:00Z
depth: standard
iteration: 3
files_reviewed: 7
files_reviewed_list:
  - src/execution/frameMount.ts
  - src/ui/SandboxFrame.tsx
  - src/ui/WindowFrame.tsx
  - src/ui/DesktopShell.tsx
  - src/execution/frameBridge.ts
  - index.html
  - e2e/frame-isolation.spec.ts
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: clean
---

# Phase 20: Code Review Report (Iteration 3 — clean after WR-05 fix)

**Reviewed:** 2026-06-27T17:10:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** clean (all Critical + Warning findings resolved; 2 Info-level observations remain, no action required)

## Iteration 3 Resolution

WR-05 (in-frame delegated state-merge omitted the in-tree validation gate) is FIXED
in commit `ae00b00`: the bootstrap now derives each known field's expected primitive
type from `module.initialState` and skips any update where a known primitive field
arrives with a contradicting `typeof` — byte-for-byte the in-tree `deriveStateSchema`
rule, so the in-frame and in-tree delegated runtimes now degrade identically on a
malformed handler result. The frame-bootstrap CSP hash in `index.html` was re-pinned
(`sha256-WmlfLFRQyiWiGArotj0My8o6leM7tNviJ3WLWgKD+0A=` →
`sha256-9QEJXYaa2kOyh6gwmZHUJcItNSpPHhlSk1kBNc0U85Q=`) with no `'unsafe-inline'` and
unchanged `connect-src`; `frameCsp.test.ts` + `csp.test.ts` pass.

**Final gate (iteration 3):** 824 unit tests / 88 files pass; `tsc --noEmit` clean;
`npm run build` succeeds with NO source maps in `dist`; both Playwright e2e tests pass
(Notes monolith + Weather delegated seed). All 8 security invariants intact. The two
remaining Info items (IN-01 dead rejection branch, IN-02 silent non-object-result drop)
are defensive/parity notes that require no action. **Phase 20 closes clean.**

---

# Phase 20: Code Review Report (Iteration 2 — re-review after fixes)

**Reviewed:** 2026-06-27T17:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status (iteration 2):** issues_found (1 new WARNING — all 6 prior findings genuinely resolved); WR-05 resolved in iteration 3 above

## Summary

This is a re-review of Phase 20 (Opaque-Origin Frame Isolation) after the two fix
commits `934816f` (CR-01, WR-03) and `49cf891` (CR-02/WR-01/WR-02/WR-04 tests).
The prior iteration raised 2 BLOCKERs and 4 WARNINGs.

**All six prior findings are genuinely resolved** — verified by reading the source,
reconstructing the `buildActionIntent` byte string in Node (proven IDENTICAL), running
the targeted suites (`frameCsp`, `frameMount`, `SandboxFrame`, `DesktopShell`,
`WindowFrame`, `frameBridge`, `csp`, `hygiene` — all green), the FULL unit suite
(**824 tests / 88 files, all pass**), and `tsc --noEmit` (clean). The CSP hash in
`index.html` matches the new bootstrap bytes (`frameCsp.test.ts` recomputes-and-pins,
passes). All 8 security invariants are intact and none were weakened by the fixes.

The re-review surfaced **one new WARNING**: the in-frame delegated state-merge omits
the `stateSchema.safeParse` validation gate that the in-tree `DelegatedShell` applies,
so the two runtimes diverge on malformed handler output. This is a robustness/parity
gap, not a security boundary breach (a resulting render crash is contained by the
opaque-origin sandbox + `window.onerror` → FRAME_ERROR overlay), so it is a WARNING,
not a BLOCKER. Because a new WARNING exists, status is `issues_found` per the
re-review contract; if the team accepts the divergence as out-of-scope for this phase,
it can be deferred and the phase closed.

## Verification of Prior Findings

| ID | Severity | Claim | Verdict |
|----|----------|-------|---------|
| CR-01 | BLOCKER | Delegated apps render + dispatch in-frame | **RESOLVED — verified** |
| CR-02 | BLOCKER | Clones take the frame path (no in-tree escape) | **RESOLVED — verified** |
| WR-01 | WARNING | Tweak visible in frame | **RESOLVED — verified** |
| WR-02 | WARNING | Broker forwards handler/data errors | **RESOLVED — verified** |
| WR-03 | WARNING | Frame validates inbound source | **RESOLVED — verified** |
| WR-04 | WARNING | Registry sheds detached frames | **RESOLVED — verified** |

### CR-01 — delegated apps render in-frame — RESOLVED

`frameMount.ts` now ports a delegated-shell-equivalent:
- `makeDelegatedComponent` (lines 185-251) holds `module.initialState` in `useState`,
  renders `module.view(state)` through a single container `onClick` delegate, captures
  `data-field` values, runs `data-action` clicks through the parent-brokered
  `runHandler`, and merges the returned `{ data: { state } }`.
- The VIBE_BOOTSTRAP handler resolves the delegated shape when no monolith export
  exists (lines 310-312: `typeof App !== "function" && typeof mod.exports.view === "function"`),
  and posts `FRAME_ERROR` when neither shape resolves (lines 313-316). Verified the
  FRAME_ERROR fires on the no-shape path.
- `buildActionIntent` (frameMount.ts:177-183, concatenation form) is **byte-identical**
  to the in-tree template-literal form (`src/execution/delegated.tsx:145-155`). I
  reconstructed both in Node with identical inputs — output strings compared `=== true`.
  So the parent resolves the SAME seeded/cached handler from either runtime.
- `appType` is threaded SandboxFrame prop → `appTypeRef` → VIBE_BOOTSTRAP payload
  (SandboxFrame.tsx:189-193) → in-frame `buildActionIntent` (frameMount.ts:280, 311).
  It is the neutral public app slug (e.g. `"weather"`) — carries no secret.
- The Weather-delegated-seed e2e (`e2e/frame-isolation.spec.ts:100-129`) asserts the
  idle view renders non-blank inside the frame.

### CR-02 — clones no longer escape isolation — RESOLVED (most security-critical)

The clone branch (`DesktopShell.tsx:477-498`) now carries the source's compiled string
to the clone instance id:
```ts
const tjs = transpiledMapRef.current.get(instanceId);
if (tjs) setTranspiledMap((prev) => new Map(prev).set(cloneInstanceId, tjs));
```
- `transpiledMapRef` is assigned `transpiledMapRef.current = transpiledMap` on EVERY
  render (lines 255-256), so the read inside the memoized `handleModify` callback is
  always current — **no stale-closure bug** (it mirrors the proven `windowManagerRef`
  pattern, and `handleModify`'s deps include `components` so a clone always sees the
  latest source anyway).
- With the clone's `transpiledMap` populated, `WindowFrame` (line 335) takes the
  `frameMode === "iframe" && transpiledJS` branch → `SandboxFrame` (opaque-origin
  frame). The clone can **no longer fall through to the in-tree `WindowBody`**, which
  would have run the component directly in the host tree with full DOM/key access.
  This closes the isolation-escape this phase exists to remove.

### WR-01 — tweak visible in frame — RESOLVED

`DesktopShell.tsx:527-530`: the tweak branch calls `getTranspiledJS(tweakKey)` and
`setTranspiledMap(...)`, so the `srcdoc` useMemo (keyed on `transpiledJS`,
SandboxFrame.tsx:105-110) rebuilds and the frame re-bootstraps with the tweaked body.

### WR-02 — broker forwards handler/data errors — RESOLVED

RUN_HANDLER (SandboxFrame.tsx:239) and FETCH_DATA (line 274) success branches now
forward `payload: { data: result?.data, error: result?.error }` — the whole result
shape, matching the in-tree contract so the frame app can distinguish "no data" from a
neutral failure.

### WR-03 — frame validates inbound origin/source — RESOLVED

The in-frame handler gates on `event.source !== window.parent` (frameMount.ts:268)
before processing any message. Confirmed this does NOT break the legitimate
parent→frame messages: the parent posts via `el.contentWindow.postMessage(...)`, so
inside the frame `event.source` is the host window, which IS `window.parent` for the
embedded srcdoc frame — VIBE_BOOTSTRAP / THEME_PUSH / FRAME_PING / *_RESULT all pass.
A forged message from any OTHER window context is dropped. This is symmetric with the
parent's `isFromFrame` origin+source dual guard, and the e2e forged-drop test
(spec.ts:73-91) exercises the parent side of the same defense.

### WR-04 — registry sheds detached frames — RESOLVED

- `unregisterFrame(id, el)` deletes only when `frameRefs.get(id) === el`
  (frameMount.ts:36-38), so a StrictMode double-mount's first cleanup cannot evict the
  entry the second mount re-registered. SandboxFrame passes the specific element on
  cleanup (SandboxFrame.tsx:122).
- `broadcastTheme` skips `!el.isConnected` frames (frameMount.ts:50).
- Both behaviors are covered by new tests (`frameMount.test.ts:155-178`).

## Security Invariant Audit (post-fix)

All 8 invariants verified intact — the fixes did not weaken any:

1. **sandbox="allow-scripts" only** — `SandboxFrame.tsx:334`, no `allow-same-origin`
   → opaque origin preserved (e2e proves `localStorage` throws `SecurityError`).
2. **parseSafe → Object.create(null)** — `frameBridge.ts:59`, prototype-pollution
   blocked; non-plain inputs rejected.
3. **isFromFrame dual guard** — `event.origin === "null"` AND `event.source ===
   frameWindow` (`frameBridge.ts:81-82`), now mirrored by the frame-side source guard
   (WR-03).
4. **buildSrcdoc 3-param, no key** — `frameMount.ts:81`; zero key/`x-api-key`/`sk-ant`
   references anywhere in `frameMount.ts`. The handler/data brokers are PARENT-side
   closures over `services`; the key never crosses into the frame.
5. **Host CSP unchanged-or-stronger** — `index.html:19` script-src has NO
   `'unsafe-inline'` (only `'self'`, `'unsafe-eval'`, and two `sha256-` hashes);
   connect-src is byte-unchanged (same 5 origins). The bootstrap hash
   `sha256-WmlfLFRQyiWiGArotj0My8o6leM7tNviJ3WLWgKD+0A=` matches the new bytes
   (`frameCsp.test.ts` passes).
6. **Frame inner CSP `connect-src 'none'`** — `frameMount.ts:107`; the frame has zero
   network egress even if app code attempts exfiltration. (Its `script-src
   'unsafe-inline'` is the frame's OWN policy needed to run the bootstrap; the frame
   ALSO inherits the host hash-gated policy — this is a defense layer, not a weakening.)
7. **Hygiene token ban** — no `synthesi[sz]` token in any reviewed file or the
   bootstrap; `hygiene.test.ts` passes.
8. **No new injection vector** — the delegated dispatch reads `data-action` /
   `data-field` / `.value` from the view's own DOM (`module.view(state)`), the same
   trust level as in-tree; `appType` carries no secret. No `eval`/`innerHTML`; render
   is via `React.createElement`.

## Warnings

### WR-05: In-frame delegated state-merge omits the in-tree `stateSchema.safeParse` validation gate

**File:** `src/execution/frameMount.ts:224-228`
**Issue:** The in-tree `DelegatedShell` validates handler-returned state before merging
it, rejecting an update where a KNOWN field arrives with a contradicting primitive type
and keeping the prior good state (`src/execution/delegated.tsx:213-220` →
`stateSchema.safeParse(next)`). The in-frame runtime merges ANY returned object
unconditionally:
```js
var next = res && res.data ? res.data.state : null;
if (next && typeof next === "object") {
  setState(function(prev) { return Object.assign({}, prev, next); });
}
```
So the SAME delegated module + SAME (mistyped) handler result behaves differently in
iframe mode: in-tree it silently keeps the last valid state; in-frame it merges the bad
type into state, which can crash the next `module.view(state)` render (e.g. a numeric
field arriving as a string and the view calling `.toFixed`). The crash IS contained —
`window.onerror` (frameMount.ts:378) posts FRAME_ERROR → the parent shows the generic
"Something went wrong" overlay — so this is a robustness/parity divergence, not an
isolation breach. It does, however, mean the frame surfaces a hard error overlay where
the in-tree path would have degraded gracefully and kept working.
**Fix:** Port the lenient validation into the bootstrap so the two runtimes stay in
parity. Either (a) thread the derived schema's accept/reject decision through, or (b)
inline a minimal known-field type check that mirrors `deriveStateSchema`'s
"reject only a known field with a contradicting primitive type" rule, e.g.:
```js
function mergeIsSafe(prev, next) {
  for (var k in next) {
    if (Object.prototype.hasOwnProperty.call(prev, k)) {
      var pt = typeof prev[k], nt = typeof next[k];
      // reject only a primitive type contradiction on a known field
      if ((pt === "string" || pt === "number" || pt === "boolean") && pt !== nt) {
        return false;
      }
    }
  }
  return true;
}
// ...
if (next && typeof next === "object" && mergeIsSafe(stateRef.current, next)) {
  setState(function(prev) { return Object.assign({}, prev, next); });
}
```
(Note: any new logic here changes the bootstrap bytes, so the CSP hash in `index.html`
must be re-pinned — `frameCsp.test.ts` will fail until it is, which is the intended
guardrail.) If the team scopes state-validation parity to a later phase, this can be
deferred — it does not block the isolation guarantee.

## Info

### IN-01: In-frame `runHandler` rejection branch is effectively dead code

**File:** `src/execution/frameMount.ts:231-234`
**Issue:** The in-frame `runHandler` Promise only ever `resolve`s (frameMount.ts:163-167)
— the parent always replies with `RUN_HANDLER_RESULT` (success or `{ error }` from its
catch, SandboxFrame.tsx:230-253), never a rejection. So the `.then(onFulfilled,
onRejected)` second-arg failure handler can't be reached in normal operation. It is a
harmless defensive fallback (and correctly resets `busy`), but a reader may assume an
error path exists where none can fire.
**Fix:** Optional — leave as defensive code, or add a one-line comment noting the
parent never rejects so the branch is belt-and-suspenders.

### IN-02: In-frame delegated merge silently drops a non-object handler result

**File:** `src/execution/frameMount.ts:224-228`
**Issue:** When `res.data.state` is absent or not an object, the merge is skipped and
`setBusy(null)` runs — state stays unchanged with no diagnostic. This matches the
in-tree "keep prior state on bad result" intent and is correct for hygiene (never
reveal the mechanic), but unlike the in-tree path it logs nothing even to the gated
logger (the frame has no `logger`). Acceptable given the sandbox constraints; noted for
completeness.
**Fix:** None required — could post a diagnostic-only FRAME_ERROR on a structurally
invalid result if richer parent-side telemetry is wanted later.

---

_Reviewed: 2026-06-27T17:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard (iteration 2)_
