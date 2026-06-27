// Frame mount registry and srcdoc builder for the opaque-origin frame
// isolation layer (Phase 20).
//
// Responsibilities:
//   - Track mounted frame elements by instanceId.
//   - Broadcast theme CSS variable updates to all tracked frames.
//   - Build a complete HTML document (srcdoc) that bootstraps React + the
//     in-frame RPC stubs inside a sandboxed frame.
//
// The transpiledJS for the app component is NOT baked into the srcdoc — it
// is delivered via the VIBE_BOOTSTRAP postMessage after FRAME_READY fires,
// so the srcdoc is app-agnostic and can be shared across instances.

import { REACT_EMBED } from "../../embed/reactEmbed";
import { logger } from "../lib/logger";

// ---------------------------------------------------------------------------
// Frame registry
// ---------------------------------------------------------------------------

const frameRefs = new Map<string, HTMLIFrameElement>();

export function registerFrame(instanceId: string, el: HTMLIFrameElement): void {
  frameRefs.set(instanceId, el);
}

export function unregisterFrame(
  instanceId: string,
  el?: HTMLIFrameElement | null,
): void {
  // Delete by element identity when an element is supplied: under StrictMode the
  // mount effect runs mount→unmount→mount, so the first mount's cleanup must NOT
  // evict the entry the SECOND mount just (re)wrote. When no element is given
  // (the legacy single-arg call / a key-only teardown) fall back to deleting by
  // key, preserving the original semantics.
  if (el == null || frameRefs.get(instanceId) === el) {
    frameRefs.delete(instanceId);
  }
}

// ---------------------------------------------------------------------------
// broadcastTheme — push CSS variable map to all tracked frames
// ---------------------------------------------------------------------------

export function broadcastTheme(vars: Record<string, string>): void {
  for (const [, el] of frameRefs) {
    // Skip a detached frame: the registry can transiently retain an element
    // whose effect cleanup has not yet run (StrictMode double-mount), and
    // posting to a disconnected frame's contentWindow is wasted work.
    if (!el.isConnected) continue;
    try {
      el.contentWindow?.postMessage({ type: "THEME_PUSH", payload: { vars } }, "*");
    } catch (err) {
      logger.error("Frame mount: broadcastTheme failed for a frame: " + String(err));
    }
  }
}

// ---------------------------------------------------------------------------
// buildSrcdoc — app-independent bootstrap document
// ---------------------------------------------------------------------------

/**
 * Builds a complete srcdoc HTML document for the opaque-origin frame.
 *
 * @param transpiledJS  Ignored — the app code is delivered via VIBE_BOOTSTRAP
 *                      postMessage after FRAME_READY; kept as a parameter so
 *                      callers have a stable 3-param signature for future use.
 * @param themeVars     CSS variable map applied to :root on load and on THEME_PUSH.
 * @param parentOrigin  Ignored — the frame has an opaque origin and only ever
 *                      messages its single embedder (the parent), so replies
 *                      target "*"; kept as a parameter for signature stability.
 *
 * CSP NOTE: a `srcdoc` frame INHERITS the embedding document's policy, and the
 * host policy authorizes inline scripts by sha256 hash (never 'unsafe-inline').
 * The inline bootstrap below must therefore be byte-stable across renders so its
 * single hash can be pinned in the host CSP — so NOTHING per-render is
 * interpolated INTO the <script> body. Per-render data (theme vars, app code)
 * arrives via the <style> block (not a script) and the VIBE_BOOTSTRAP message.
 */
export function buildSrcdoc(
  transpiledJS: string,
  themeVars: Record<string, string>,
  parentOrigin: string,
): string {
  // Suppress unused-variable warnings while keeping the params for signature
  // stability. parentOrigin is intentionally NOT baked into the script body
  // (see CSP NOTE) — the frame posts to "*" to its sole embedder.
  void transpiledJS;
  void parentOrigin;

  // Build :root CSS variable declarations
  const rootVars = Object.entries(themeVars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");

  // Inline the CJS source bodies as JSON strings so the bootstrap can evaluate
  // each one via new Function without a network request.
  const schedulerSrc = JSON.stringify(REACT_EMBED.scheduler);
  const reactSrc = JSON.stringify(REACT_EMBED.react);
  const reactDomSrc = JSON.stringify(REACT_EMBED.reactDom);
  const reactDomClientSrc = JSON.stringify(REACT_EMBED.reactDomClient);

  return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'self' data:">
<style>
:root {
${rootVars}
}
#root { height: max-content; }
body { overflow: hidden; margin: 0; }
</style>
</head>
<body>
<div id="root"></div>
<script>
(function() {
  "use strict";

  // ---------------------------------------------------------------------------
  // CJS require shim
  // ---------------------------------------------------------------------------
  function makeCjsModule(body) {
    var mod = { exports: {} };
    new Function("module", "exports", "require", body)(mod, mod.exports, requireShim);
    return mod.exports;
  }

  var schedulerExports = makeCjsModule(${schedulerSrc});
  var reactExports = makeCjsModule(${reactSrc});
  var reactDomExports = makeCjsModule(${reactDomSrc});
  var reactDomClientExports = makeCjsModule(${reactDomClientSrc});

  window.React = reactExports;
  window.ReactDOM = reactDomClientExports;

  function requireShim(id) {
    if (id === "react") return reactExports;
    if (id === "react-dom") return reactDomExports;
    if (id === "react-dom/client") return reactDomClientExports;
    if (id === "scheduler") return schedulerExports;
    throw new Error("Unknown module: " + id);
  }

  // ---------------------------------------------------------------------------
  // In-frame RPC stubs
  // ---------------------------------------------------------------------------
  var pendingCalls = {};

  function postToParent(msg) {
    // The frame has an opaque origin and only ever talks to its single embedder;
    // "*" is safe here and keeps the bootstrap script byte-stable (CSP hash).
    window.parent.postMessage(msg, "*");
  }

  function useWidget() {
    return null;
  }

  function runHandler(intent, input) {
    return new Promise(function(resolve) {
      var corrId = Math.random().toString(36).slice(2);
      pendingCalls[corrId] = resolve;
      postToParent({ type: "RUN_HANDLER", correlationId: corrId, payload: { intent: intent, input: input } });
    });
  }

  // ---------------------------------------------------------------------------
  // Delegated-shell runtime (mirrors the in-tree delegated module path). A
  // behavior-free module supplies { initialState, view, actionSpec }; this
  // permanent container owns the state SSOT, the single onClick delegate, the
  // per-action intent (byte-identical to the in-tree buildActionIntent so the
  // parent resolves the SAME cached handler), field capture, and the merge.
  // ---------------------------------------------------------------------------
  function buildActionIntent(appType, actionSpec, action) {
    return (
      appType + " action '" + action + "': " + actionSpec + " " +
      "The handler input is { state, payload } where payload is the action string '" + action + "'. " +
      "Return { data: { state } } with the SAME state shape and ALWAYS a valid state."
    );
  }

  function makeDelegatedComponent(appType, module) {
    var React = window.React;
    var actionSpec = typeof module.actionSpec === "string" ? module.actionSpec : "";
    return function DelegatedApp() {
      var stateHook = React.useState(module.initialState);
      var state = stateHook[0];
      var setState = stateHook[1];
      var busyHook = React.useState(null);
      var busy = busyHook[0];
      var setBusy = busyHook[1];
      var stateRef = React.useRef(state);
      stateRef.current = state;

      var onClick = React.useCallback(
        function(e) {
          var target = e.target;
          var el = target && target.closest ? target.closest("[data-action]") : null;
          if (!el) return;
          var action = el.getAttribute("data-action");
          if (!action) return;
          if (busy) return;

          // Capture user-entered field values BEFORE running the action: the view
          // marks its inputs with data-field="<stateKey>"; fold each one's current
          // value into the state the handler sees.
          var container = e.currentTarget;
          var fields = {};
          var nodes = container.querySelectorAll("[data-field]");
          for (var i = 0; i < nodes.length; i++) {
            var key = nodes[i].getAttribute("data-field");
            if (!key) continue;
            var value = nodes[i].value;
            if (typeof value === "string") fields[key] = value;
          }

          setBusy(action);
          var intent = buildActionIntent(appType, actionSpec, action);
          var mergedState = Object.assign({}, stateRef.current, fields);
          runHandler(intent, { state: mergedState, payload: action }).then(
            function(res) {
              var next = res && res.data ? res.data.state : null;
              if (next && typeof next === "object") {
                setState(function(prev) { return Object.assign({}, prev, next); });
              }
              setBusy(null);
            },
            function() {
              // Never reveal the mechanic; leave state unchanged on any failure.
              setBusy(null);
            }
          );
        },
        [busy]
      );

      return React.createElement(
        "div",
        {
          className: "delegated-shell",
          onClick: onClick,
          "aria-busy": busy !== null ? "true" : undefined,
          "data-busy": busy ? busy : undefined
        },
        module.view(state)
      );
    };
  }

  // Set once VIBE_BOOTSTRAP has been processed, so the FRAME_READY re-announce
  // loop can stop. The parent's bootstrap listener can churn (its effect deps
  // include per-render handler closures), so a single load-time FRAME_READY can
  // race a listener swap and be dropped — we re-announce until acknowledged.
  var bootstrapped = false;

  // ---------------------------------------------------------------------------
  // Inbound message handler
  // ---------------------------------------------------------------------------
  window.addEventListener("message", function(event) {
    // Only honor messages from the single embedder (the parent). The body has an
    // opaque origin and no same-origin grant, so the parent is the only window
    // that holds a handle to it — but gate explicitly so a forged message that
    // wins the bootstrap race is dropped (defense-in-depth, symmetric with the
    // parent's origin+source guard).
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data || typeof data !== "object") return;

    var type = data.type;

    if (type === "VIBE_BOOTSTRAP") {
      if (bootstrapped) return;
      bootstrapped = true;
      var payload = data.payload || {};
      var code = payload.transpiledJS;
      var vars = payload.themeVars;
      var appType = typeof payload.appType === "string" ? payload.appType : "";
      if (vars && typeof vars === "object") {
        Object.keys(vars).forEach(function(k) {
          document.documentElement.style.setProperty(k, vars[k]);
        });
      }
      try {
        var mod = { exports: {} };
        new Function("module", "exports", "React", "useWidget", "runHandler", "require", code)(
          mod, mod.exports, window.React, useWidget, runHandler, requireShim
        );
        // Resolve the component the same way the in-tree path does: prefer an
        // explicit export, then fall back to a bare top-level App function
        // declaration (the seed shape) by re-running with an explicit return.
        // Babel wraps the body so a bare declaration is local to that scope.
        var App = mod.exports.default || mod.exports.App;
        if (typeof App !== "function") {
          var mod2 = { exports: {} };
          App = new Function(
            "module", "exports", "React", "useWidget", "runHandler", "require",
            code + "\\nreturn typeof App !== 'undefined' ? App : undefined;"
          )(mod2, mod2.exports, window.React, useWidget, runHandler, requireShim);
        }
        // Delegated module shape: a behavior-free module exporting
        // { initialState, view, actionSpec }. The view marks interactive elements
        // with data-action and fields with data-field but carries NO handlers; the
        // container delegate reads the clicked action, folds in the current field
        // values, runs the action through runHandler (parent-brokered), and merges
        // the returned state. Mirrors the in-tree delegated runtime so the SAME
        // module renders identically here.
        if (typeof App !== "function" && typeof mod.exports.view === "function") {
          App = makeDelegatedComponent(appType, mod.exports);
        }
        if (typeof App !== "function") {
          postToParent({ type: "FRAME_ERROR", payload: { message: "App did not render" } });
          return;
        }
        window.ReactDOM.createRoot(document.getElementById("root")).render(
          window.React.createElement(App)
        );
      } catch (err) {
        postToParent({ type: "FRAME_ERROR", payload: { message: String(err) } });
      }
      return;
    }

    if (type === "THEME_PUSH") {
      var vars = (data.payload || {}).vars;
      if (vars && typeof vars === "object") {
        Object.keys(vars).forEach(function(k) {
          document.documentElement.style.setProperty(k, vars[k]);
        });
      }
      return;
    }

    if (type === "FRAME_PING") {
      postToParent({ type: "FRAME_PONG" });
      return;
    }

    if (type === "RUN_HANDLER_RESULT") {
      var corrId = data.correlationId;
      if (corrId && pendingCalls[corrId]) {
        var cb = pendingCalls[corrId];
        delete pendingCalls[corrId];
        cb(data.payload);
      }
      return;
    }

    if (type === "FETCH_DATA_RESULT") {
      var corrId = data.correlationId;
      if (corrId && pendingCalls[corrId]) {
        var cb = pendingCalls[corrId];
        delete pendingCalls[corrId];
        cb(data.payload);
      }
      return;
    }
  });

  // ---------------------------------------------------------------------------
  // ResizeObserver — post height to parent
  // ---------------------------------------------------------------------------
  if (typeof ResizeObserver !== "undefined") {
    var ro = new ResizeObserver(function(entries) {
      for (var i = 0; i < entries.length; i++) {
        postToParent({ type: "FRAME_RESIZE", payload: { height: entries[i].contentRect.height } });
      }
    });
    var rootEl = document.getElementById("root");
    if (rootEl) ro.observe(rootEl);
  }

  // ---------------------------------------------------------------------------
  // onerror — forward to parent
  // ---------------------------------------------------------------------------
  window.onerror = function(msg) {
    postToParent({ type: "FRAME_ERROR", payload: { message: String(msg) } });
  };

  // ---------------------------------------------------------------------------
  // FRAME_READY announce — re-post until the parent acknowledges with
  // VIBE_BOOTSTRAP. The parent's message listener can be momentarily detached
  // during a re-render (its effect re-subscribes when per-render handler props
  // change), so a single one-shot announce can be lost. Re-announcing on a short
  // interval makes the handshake self-healing and order-independent; it stops as
  // soon as bootstrapped flips true (and after a bounded number of attempts so a
  // truly dead parent does not spin forever).
  // ---------------------------------------------------------------------------
  function announce() {
    if (bootstrapped) return;
    postToParent({ type: "FRAME_READY" });
  }
  announce();
  var announceAttempts = 0;
  var announceTimer = setInterval(function() {
    announceAttempts += 1;
    if (bootstrapped || announceAttempts > 50) {
      clearInterval(announceTimer);
      return;
    }
    announce();
  }, 100);

})();
</script>
</body>
</html>`;
}
