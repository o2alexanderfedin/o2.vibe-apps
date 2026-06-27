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

export function unregisterFrame(instanceId: string): void {
  frameRefs.delete(instanceId);
}

// ---------------------------------------------------------------------------
// broadcastTheme — push CSS variable map to all tracked frames
// ---------------------------------------------------------------------------

export function broadcastTheme(vars: Record<string, string>): void {
  for (const [, el] of frameRefs) {
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

  // Set once VIBE_BOOTSTRAP has been processed, so the FRAME_READY re-announce
  // loop can stop. The parent's bootstrap listener can churn (its effect deps
  // include per-render handler closures), so a single load-time FRAME_READY can
  // race a listener swap and be dropped — we re-announce until acknowledged.
  var bootstrapped = false;

  // ---------------------------------------------------------------------------
  // Inbound message handler
  // ---------------------------------------------------------------------------
  window.addEventListener("message", function(event) {
    var data = event.data;
    if (!data || typeof data !== "object") return;

    var type = data.type;

    if (type === "VIBE_BOOTSTRAP") {
      if (bootstrapped) return;
      bootstrapped = true;
      var payload = data.payload || {};
      var code = payload.transpiledJS;
      var vars = payload.themeVars;
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
        if (typeof App === "function") {
          window.ReactDOM.createRoot(document.getElementById("root")).render(
            window.React.createElement(App)
          );
        }
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
