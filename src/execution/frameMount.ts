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
 * @param parentOrigin  The parent window origin, baked into the bootstrap so the
 *                      frame can target postMessage replies.
 */
export function buildSrcdoc(
  transpiledJS: string,
  themeVars: Record<string, string>,
  parentOrigin: string,
): string {
  // Suppress unused-variable warning while keeping the param for signature stability.
  void transpiledJS;

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

  var PARENT_ORIGIN = ${JSON.stringify(parentOrigin)};

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
    window.parent.postMessage(msg, PARENT_ORIGIN === "null" ? "*" : PARENT_ORIGIN);
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
  // Inbound message handler
  // ---------------------------------------------------------------------------
  window.addEventListener("message", function(event) {
    var data = event.data;
    if (!data || typeof data !== "object") return;

    var type = data.type;

    if (type === "VIBE_BOOTSTRAP") {
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
        var App = mod.exports.default || mod.exports.App || mod.exports;
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
  // FRAME_READY on load
  // ---------------------------------------------------------------------------
  window.addEventListener("load", function() {
    postToParent({ type: "FRAME_READY" });
  });

})();
</script>
</body>
</html>`;
}
