import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildSrcdoc,
  registerFrame,
  unregisterFrame,
  broadcastTheme,
} from "./frameMount";
import { REACT_EMBED } from "../../embed/reactEmbed";

// ---------------------------------------------------------------------------
// Theme vars fixture (all 12 required variables)
// ---------------------------------------------------------------------------
const THEME_VARS = {
  "--text": "#fff",
  "--wall": "#000",
  "--b1": "#111",
  "--b2": "#222",
  "--b3": "#333",
  "--b4": "#444",
  "--glass": "rgba(0,0,0,0.3)",
  "--glass2": "rgba(0,0,0,0.5)",
  "--bord": "#555",
  "--hi": "#666",
  "--accentA": "#777",
  "--accentB": "#888",
};

// ---------------------------------------------------------------------------
// buildSrcdoc — structure
// ---------------------------------------------------------------------------

describe("buildSrcdoc", () => {
  it("has exactly 3 parameters", () => {
    expect(buildSrcdoc.length).toBe(3);
  });

  it("contains the in-frame CSP meta tag with connect-src 'none'", () => {
    const doc = buildSrcdoc("const App=()=>null;", THEME_VARS, "https://host.test");
    expect(doc).toContain("connect-src 'none'");
    expect(doc).toContain('<meta http-equiv="Content-Security-Policy"');
  });

  it("contains the :root CSS style block with theme variables", () => {
    const doc = buildSrcdoc("const App=()=>null;", THEME_VARS, "https://host.test");
    expect(doc).toContain("--text");
    expect(doc).toContain("--glass2");
    // Verify the values are present
    expect(doc).toContain("#fff");
    expect(doc).toContain("rgba(0,0,0,0.5)");
  });

  it("does NOT contain any API key pattern", () => {
    const doc = buildSrcdoc("const App=()=>null;", THEME_VARS, "https://host.test");
    expect(doc).not.toMatch(/sk-ant/);
  });

  it("does NOT bake the parentOrigin into the script (byte-stable bootstrap for CSP hashing)", () => {
    // A srcdoc frame inherits the host CSP, which authorizes the inline bootstrap
    // by a single pinned sha256 hash. That requires the bootstrap script body to
    // be identical across renders, so per-render data (including parentOrigin)
    // MUST NOT be interpolated into the <script>. The frame has an opaque origin
    // and only ever messages its sole embedder, so it posts to "*" instead.
    const a = buildSrcdoc("const App=()=>null;", THEME_VARS, "https://host.a");
    const b = buildSrcdoc("const App=()=>null;", THEME_VARS, "https://host.b");
    expect(a).not.toContain("https://host.a");
    expect(b).not.toContain("https://host.b");
    // The full documents are byte-identical when only parentOrigin differs.
    expect(a).toBe(b);
  });

  it("contains the REACT_EMBED.react substring (React CJS code is embedded)", () => {
    const doc = buildSrcdoc("const App=()=>null;", THEME_VARS, "https://host.test");
    // The react embed contains "react.production" in its license header
    const reactSnippet = REACT_EMBED.react.slice(0, 60);
    // The snippet is JSON-encoded in the doc
    expect(doc).toContain(JSON.stringify(reactSnippet).slice(1, -1));
  });

  it("contains a <style> block", () => {
    const doc = buildSrcdoc("const App=()=>null;", THEME_VARS, "https://host.test");
    expect(doc).toContain("<style>");
  });

  // SHIM-01 — the bootstrap script installs an in-memory localStorage/sessionStorage
  // shim BEFORE any app code runs, so app code calling localStorage.getItem/setItem
  // never throws inside an opaque-origin frame.
  it("installs an in-memory localStorage shim (Object.defineProperty + getItem/setItem)", () => {
    const doc = buildSrcdoc("const App=()=>null;", THEME_VARS, "https://host.test");
    // The shim must install via Object.defineProperty so it overrides the native
    // (which would throw SecurityError in an opaque-origin frame).
    expect(doc).toContain('Object.defineProperty(window, "localStorage"');
    expect(doc).toContain('Object.defineProperty(window, "sessionStorage"');
    // The shim must expose the standard Storage interface methods.
    expect(doc).toContain("getItem");
    expect(doc).toContain("setItem");
    expect(doc).toContain("removeItem");
    expect(doc).toContain('"clear"');
  });

  it("shim script appears BEFORE the VIBE_BOOTSTRAP message handler (runs before app code)", () => {
    const doc = buildSrcdoc("const App=()=>null;", THEME_VARS, "https://host.test");
    const shimIdx = doc.indexOf('Object.defineProperty(window, "localStorage"');
    const bootstrapIdx = doc.indexOf("VIBE_BOOTSTRAP");
    expect(shimIdx).toBeGreaterThan(-1);
    expect(bootstrapIdx).toBeGreaterThan(-1);
    // Shim must be installed before the message handler that runs app code.
    expect(shimIdx).toBeLessThan(bootstrapIdx);
  });

  it("shim does not contain postMessage or broker to parent (stays frame-local)", () => {
    const doc = buildSrcdoc("const App=()=>null;", THEME_VARS, "https://host.test");
    // Extract just the shim block (between localStorage defineProperty calls and
    // the requireShim function). Check that the shim implementation itself has no
    // postToParent / parent.postMessage calls.
    const shimStart = doc.indexOf('Object.defineProperty(window, "localStorage"');
    const shimEnd = doc.indexOf("function makeCjsModule");
    const shimBlock = doc.slice(shimStart, shimEnd);
    expect(shimBlock).not.toContain("postToParent");
    expect(shimBlock).not.toContain("parent.postMessage");
  });
});

// ---------------------------------------------------------------------------
// registerFrame / unregisterFrame / broadcastTheme
// ---------------------------------------------------------------------------

describe("frame registry and broadcastTheme", () => {
  function makeFrameEl() {
    const el = document.createElement("iframe") as HTMLIFrameElement;
    const postMessage = vi.fn();
    const contentWindow = { postMessage } as unknown as Window;
    Object.defineProperty(el, "contentWindow", {
      get: () => contentWindow,
      configurable: true,
    });
    // Attach to the document so el.isConnected is true: broadcastTheme skips
    // detached frames (WR-04), so a frame under test must be connected to
    // receive a broadcast — mirroring a really-mounted frame in the DOM.
    document.body.appendChild(el);
    return { el, postMessage };
  }

  // Clean up between tests
  beforeEach(() => {
    unregisterFrame("a");
    unregisterFrame("b");
    unregisterFrame("c");
    // Detach any frames a prior test appended so the DOM (and isConnected) is
    // clean for the next one.
    document.body.querySelectorAll("iframe").forEach((n) => n.remove());
  });

  it("broadcastTheme calls postMessage once on a single registered frame", () => {
    const { el, postMessage } = makeFrameEl();
    registerFrame("a", el);
    broadcastTheme(THEME_VARS);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      { type: "THEME_PUSH", payload: { vars: THEME_VARS } },
      "*",
    );
    unregisterFrame("a");
  });

  it("broadcastTheme posts to ALL registered frames", () => {
    const { el: elA, postMessage: pmA } = makeFrameEl();
    const { el: elB, postMessage: pmB } = makeFrameEl();
    registerFrame("a", elA);
    registerFrame("b", elB);
    broadcastTheme(THEME_VARS);
    expect(pmA).toHaveBeenCalledTimes(1);
    expect(pmB).toHaveBeenCalledTimes(1);
    unregisterFrame("a");
    unregisterFrame("b");
  });

  it("after unregisterFrame, broadcastTheme only posts to remaining frames", () => {
    const { el: elA, postMessage: pmA } = makeFrameEl();
    const { el: elB, postMessage: pmB } = makeFrameEl();
    registerFrame("a", elA);
    registerFrame("b", elB);
    unregisterFrame("a");
    broadcastTheme(THEME_VARS);
    expect(pmA).not.toHaveBeenCalled();
    expect(pmB).toHaveBeenCalledTimes(1);
    unregisterFrame("b");
  });

  it("unregisterFrame with a never-registered key is a no-op", () => {
    expect(() => unregisterFrame("never-registered")).not.toThrow();
  });

  it("unregisterFrame(id, el) only deletes when the registered element matches (WR-04)", () => {
    const { el: elA, postMessage: pmA } = makeFrameEl();
    const { el: elStale } = makeFrameEl();
    registerFrame("a", elA);
    // A cleanup carrying a STALE element (e.g. the first StrictMode mount's el,
    // after the second mount re-registered elA) must NOT evict the live entry.
    unregisterFrame("a", elStale);
    broadcastTheme(THEME_VARS);
    expect(pmA).toHaveBeenCalledTimes(1);
    // Cleanup with the MATCHING element does evict.
    unregisterFrame("a", elA);
    pmA.mockClear();
    broadcastTheme(THEME_VARS);
    expect(pmA).not.toHaveBeenCalled();
  });

  it("broadcastTheme skips a detached (disconnected) frame (WR-04)", () => {
    const { el, postMessage } = makeFrameEl();
    registerFrame("a", el);
    el.remove(); // detach — isConnected becomes false
    broadcastTheme(THEME_VARS);
    expect(postMessage).not.toHaveBeenCalled();
    unregisterFrame("a");
  });
});
