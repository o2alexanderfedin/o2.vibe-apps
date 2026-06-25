# External Consult — Why LLM-Generated React Fails under `new Function`, and How to Test It

**Source:** Google AI Mode (browser-automation consult), 2026-06-25
**Question (open/unbiased):** Why do some real LLM-generated React components throw at instantiate/render under `new Function('module','exports','require','React', code)` (simple ones work, then disappear silently), and what's the most robust way to unit-test the transpile→instantiate→render pipeline + DI seams in jsdom with React Testing Library (not Playwright)?

> Second opinion — weigh against our verified facts; some points (e.g. `React.createFragment`) may be imprecise.

## Likely failure modes (apply to our bug)
1. **ESM↔CJS interop on named imports (strong candidate).** LLMs favor `import React, { useState } from "react"` + `export default`. `transform-modules-commonjs` turns this into `var _react = _interopRequireDefault(require("react"))`. `_interopRequireDefault` wraps a non-`__esModule` value as `{ default: X }`, so `_react.default` works but **`_react.useState` is `undefined`** → throws. Our `require` shim returns bare `React`, which does NOT fix this. **Fix:** the `require("react")` shim must return a namespace that supports BOTH default and named access — e.g. `Object.assign(Object.create(null), React, { default: React, __esModule: true })` — so `_react.default` AND `_react.useState` both resolve. (Or instruct the model to only use `React.useState` and strip imports — but be robust to imports anyway.)
2. **JSX fragments `<>…</>`** require `React.Fragment` at runtime (classic runtime emits `React.createElement(React.Fragment, …)`). Injected React has `.Fragment`, so this should work — verify a fixture using fragments.
3. **Render-time errors escape `new Function`.** `new Function` only catches syntax/instantiation errors. An invalid hook sequence / undefined-property access throws during React's render phase and **React unmounts the subtree silently** unless an Error Boundary wraps it. Our Marketplace wraps the app in `ErrorBoundary` only AFTER `resolveComponent` succeeds — good for render errors — but a throw INSIDE `resolveComponent` (instantiate) drops the app with no UI. Add a neutral fallback for the produce/instantiate failure path too.
4. Unescaped template literals / backticks in code only matter if code is string-interpolated into the `new Function` body (we pass it as the body directly — low risk, but the repair-prompt concatenation path is worth checking).
5. JSDOM shares one `window` across tests → isolate tests that run `new Function` strings (Vitest isolation) to avoid global leakage between cases.

## Robust testing pattern (jsdom + RTL, NOT Playwright)
- A small `evaluateComponent(transpiledCode)` harness: build `{module, exports}`, a `require` shim backed by a **DI registry** (`{ react: React, ... }`), run `new Function('module','exports','require','React', code)`, resolve `module.exports.default || module.exports`, throw EXPLICITLY on non-function (never swallow) so tests see failures.
- Transpile step tested directly with `@babel/standalone` over realistic inputs (export default, named imports, fragments, TS types/generics, hooks).
- Render step: `render(<Generated/>)` inside a **test Error Boundary** exposing `data-testid="error-fallback"`, so render-time throws are asserted, not silent.
- DI seams: inject stub transport + in-memory registry; assert the injected deps are used and no real `fetch`/`localStorage`/`indexedDB` is touched.

## Implications for our fix + test suite
- Make the `require` shim interop-correct for **named** React imports (item 1) — this is the most probable real cause of the live failure.
- Add comprehensive transpile tests over real captured fixtures + the edge shapes above; they FAIL before the interop fix and PASS after.
- Add a neutral fallback on the produce/instantiate-failure path so a bad generation shows "couldn't load" instead of vanishing (also helps debugging).
- Keep tests in jsdom + RTL; consider Vitest isolation for the `new Function` cases.
