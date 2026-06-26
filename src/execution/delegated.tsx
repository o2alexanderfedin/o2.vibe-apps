// Delegated-shell runtime (the productized "minimal control + on-demand behavior"
// path). This is the PERMANENT, never-produced machinery the user asked for: a
// single container-level event delegate plus the state single-source-of-truth.
//
// A produced "delegated module" supplies only the app-specific, behavior-free parts:
//   - initialState : the complete state shape + initial values (the SSOT).
//   - view(state)  : a pure render of markup from state; interactive elements carry
//                    a `data-action` attribute and have NO handlers of their own.
//   - actionSpec   : a precise description of the state shape and what each action
//                    does to it (the behavioral contract the on-demand handlers honor).
//
// The runtime owns everything risky and reusable: state, the container delegate,
// per-action intent composition (context injection — actionSpec travels into every
// intent so independently produced handlers agree on the shape), the produce/cache
// of behavior (via runHandler), the merge/keep-prior gatekeeping, and the busy UX.
// Because runHandler caches each action's handler, a re-press is an O(1) cache hit —
// "attach the handler to the element forever", done idiomatically.

import React from "react";
import type { ComponentType, ReactNode } from "react";
import { logger } from "../lib/logger";
import { InstantiateError } from "./instantiate";
import type { RunHandler } from "./instantiate";
import { deriveStateSchema } from "./stateSchema";

/** The shared React instance injected into every produced module scope. */
const sharedReact = React;

// Some produced modules read React off the global (e.g. `const React = window.React`)
// rather than the injected binding — a reasonable reading of "React is a global". Expose
// the SINGLE shared instance on the global object so those modules resolve to the SAME
// React (no dual-React / "Invalid hook call"); it is the identical instance the scope
// param injects, so this is harmless. This makes "React is a global" literally true.
if (typeof globalThis !== "undefined") {
  (globalThis as { React?: typeof React }).React = sharedReact;
}

/** A produced view state: an open record the produced view + handlers agree on. */
export type DelegatedState = Record<string, unknown>;

/** The behavior-free, app-specific parts a produced delegated module supplies. */
export interface DelegatedModule {
  initialState: DelegatedState;
  view: (state: DelegatedState) => ReactNode;
  actionSpec: string;
}

/** require shim: resolve react/react-dom to the single shared instance; else throw. */
function requireShim(specifier: string): unknown {
  if (specifier === "react" || specifier === "react-dom") return sharedReact;
  throw new Error(`Delegated module requested an unavailable module "${specifier}".`);
}

/**
 * Instantiate a produced delegated module, returning its { initialState, view,
 * actionSpec } exports. Mirrors `instantiate` (CJS module/exports shim + a second
 * pass that returns the scope bindings when the module used bare declarations rather
 * than `export`). Throws InstantiateError if the contract is not satisfied.
 */
export function instantiateDelegated(transpiledJS: string): DelegatedModule {
  const mod: { exports: Record<string, unknown> } = { exports: {} };

  // Some produced modules ignore "no imports" and import React; the CJS transform
  // turns that into a `React` binding that clashes with an injected `React` param
  // ("Identifier 'React' has already been declared"). So try WITH the React param
  // first (the no-import case); if the body redeclares React, retry WITHOUT it — the
  // module's own require("react"), resolved by the shim, then provides React.
  let injectReact = true;
  const runOnce = (suffix: string): unknown => {
    const params = injectReact
      ? ["module", "exports", "React", "require"]
      : ["module", "exports", "require"];
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(...params, transpiledJS + suffix);
    return injectReact
      ? fn(mod, mod.exports, sharedReact, requireShim)
      : fn(mod, mod.exports, requireShim);
  };
  const evaluate = (suffix: string): unknown => {
    try {
      return runOnce(suffix);
    } catch (err) {
      if (injectReact && /already been declared/i.test(String(err))) {
        injectReact = false;
        return runOnce(suffix);
      }
      throw err;
    }
  };

  let initialState: unknown;
  let view: unknown;
  let actionSpec: unknown;
  try {
    evaluate("");
    initialState = mod.exports["initialState"];
    view = mod.exports["view"];
    actionSpec = mod.exports["actionSpec"];
    if (typeof view !== "function") {
      // Second pass: the module used bare `const`/`function` — return the bindings.
      const ret = evaluate(
        "\nreturn { initialState: typeof initialState !== 'undefined' ? initialState : undefined," +
          " view: typeof view !== 'undefined' ? view : undefined," +
          " actionSpec: typeof actionSpec !== 'undefined' ? actionSpec : undefined };",
      ) as Partial<DelegatedModule> | undefined;
      if (ret) {
        initialState = ret.initialState ?? initialState;
        view = ret.view ?? view;
        actionSpec = ret.actionSpec ?? actionSpec;
      }
    }
  } catch (err) {
    throw new InstantiateError(err instanceof Error ? err.message : String(err), err);
  }

  if (typeof view !== "function") {
    throw new InstantiateError("Delegated module did not export a view function", null);
  }
  if (typeof initialState !== "object" || initialState === null) {
    throw new InstantiateError("Delegated module did not export an initialState object", null);
  }
  return {
    initialState: initialState as DelegatedState,
    view: view as (state: DelegatedState) => ReactNode,
    actionSpec: typeof actionSpec === "string" ? actionSpec : "",
  };
}

/**
 * Compose the STABLE, precise per-action intent the on-demand handler is produced
 * from. It embeds the app's actionSpec (the shape + per-action semantics) so every
 * independently produced handler conforms to the same contract — and carries NO live
 * state values, so the cache key is stable per (appType, action) and the handler is
 * produced once then reused. Exported for unit testing.
 */
export function buildActionIntent(
  appType: string,
  actionSpec: string,
  action: string,
): string {
  return (
    `${appType} action '${action}': ${actionSpec} ` +
    `The handler input is { state, payload } where payload is the action string '${action}'. ` +
    `Return { data: { state } } with the SAME state shape and ALWAYS a valid state.`
  );
}

/** The two-arg, services-bound handler accessor the runtime drives behavior through. */
export interface DelegatedShellProps {
  appType: string;
  module: DelegatedModule;
  runHandler: RunHandler;
  /** Lenient-partial schema derived from module.initialState; gates the merge step. */
  stateSchema: ReturnType<typeof deriveStateSchema>;
}

/**
 * The permanent container that turns a behavior-free produced view into a working
 * app. One delegated onClick handles every interactive descendant: it reads the
 * clicked element's `data-action`, produces-or-reuses that action's handler via
 * runHandler (cached), and merges the returned state. Clicks during an in-flight
 * action are ignored (lazy + busy UX). The mechanic is never revealed — a handler
 * that errors simply leaves the state unchanged.
 */
export function DelegatedShell({ appType, module, runHandler, stateSchema }: DelegatedShellProps): React.ReactElement {
  const [state, setState] = React.useState<DelegatedState>(module.initialState);
  const [busy, setBusy] = React.useState<string | null>(null);
  // A ref mirror so the delegate always reads the latest state without being
  // re-created on every state change (avoids a stale closure across rapid presses).
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const onClick = React.useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as Element | null;
      const el = target?.closest?.("[data-action]");
      if (!el) return;
      const action = el.getAttribute("data-action");
      if (!action) return; // empty or missing → not an actionable target
      if (busy) return; // ignore presses while an action is in flight
      setBusy(action); // action is now guaranteed non-empty
      try {
        const intent = buildActionIntent(appType, module.actionSpec, action);
        const res = await runHandler(intent, { state: stateRef.current, payload: action });
        const next = (res as { data?: { state?: DelegatedState } })?.data?.state;
        if (next && typeof next === "object") {
          const parsed = stateSchema.safeParse(next);
          if (!parsed.success) {
            logger.error("Delegated: state update skipped");
          } else {
            setState((prev) => ({ ...prev, ...next }));
          }
        }
      } catch (err) {
        // Never reveal the mechanic; leave state unchanged on any failure.
        logger.error("Delegated: action failed: " + String(err));
      } finally {
        setBusy(null);
      }
    },
    [appType, module, runHandler, stateSchema, busy],
  );

  return React.createElement(
    "div",
    {
      className: "delegated-shell",
      onClick,
      "aria-busy": busy !== null ? "true" : undefined,
      "data-busy": busy ?? undefined,
    },
    module.view(state),
  );
}

/**
 * Bind a produced delegated module + the app's services-bound runHandler into a
 * ready-to-mount component (the shape the loader returns to the Marketplace). The
 * app never sees services — registry/transport/key stay closed over in runHandler.
 */
export function makeDelegatedComponent(
  appType: string,
  module: DelegatedModule,
  runHandler: RunHandler,
): ComponentType {
  // Derive the schema ONCE at instantiation time (not inside the click handler).
  const stateSchema = deriveStateSchema(module.initialState);
  return function DelegatedApp(): React.ReactElement {
    return React.createElement(DelegatedShell, { appType, module, runHandler, stateSchema });
  };
}
