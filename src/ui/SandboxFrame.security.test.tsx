// Standing CI security guards for the opaque-origin frame isolation layer
// (Phase 20, SANDBOX-05). These assert the three properties that the isolation
// posture depends on and that must NEVER silently regress:
//
//   1. SANDBOX ATTR   — the frame carries sandbox="allow-scripts" and NOT
//      allow-same-origin (the opaque-origin guarantee: no parent localStorage,
//      cookies, or DOM access from inside the frame).
//   2. NO KEY IN SRCDOC — the srcdoc the parent injects never contains the
//      user's Anthropic key; the key lives only parent-side and is brokered.
//   3. PROTOTYPE POLLUTION — a forged inbound message carrying a __proto__
//      payload cannot pollute Object.prototype, because parseSafe copies onto a
//      null-prototype object before any property is read.
//
// These mirror the render + DI-utils + message-dispatch setup of
// SandboxFrame.test.tsx (the project injects stubs via the _utils prop and the
// contentWindow defineProperty pattern rather than module-level substitution).

import React from "react";
import { render, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SandboxFrame,
  type SandboxFrameProps,
  type FrameUtilities,
} from "./SandboxFrame";
import { buildSrcdoc } from "../execution/frameMount";

const THEME_VARS = {
  "--text": "#fff",
  "--wall": "#000",
  "--b1": "#111",
};

// Stub utilities so the frame registry / network paths are inert under test —
// the same DI seam SandboxFrame.test.tsx uses.
function makeUtils(): FrameUtilities {
  return {
    registerFrame: vi.fn(),
    unregisterFrame: vi.fn(),
    clearPendingForFrame: vi.fn(),
    sendToFrame: vi.fn(),
    buildSrcdoc,
  };
}

// Bind a deterministic contentWindow to the rendered iframe (real jsdom iframes
// have a null contentWindow), so isFromFrame's source guard can be exercised.
function bindContentWindow(container: HTMLElement) {
  const iframe = container.querySelector("iframe")!;
  const frameWindow = { postMessage: vi.fn() } as unknown as Window;
  Object.defineProperty(iframe, "contentWindow", {
    get: () => frameWindow,
    configurable: true,
  });
  return { iframe, frameWindow };
}

// Dispatch an inbound message AT the component's window listener with the opaque
// "null" origin a sandboxed frame produces, sourced from the given window.
function fireInbound(source: Window | null, data: unknown) {
  const event = new MessageEvent("message", {
    origin: "null",
    source: source as Window,
    data,
  });
  window.dispatchEvent(event);
}

function defaultProps(
  utils: FrameUtilities,
  overrides: Partial<SandboxFrameProps> = {},
): SandboxFrameProps {
  return {
    instanceId: "sec-instance",
    title: "Security App",
    transpiledJS: "var App = function () { return null; };",
    themeVars: THEME_VARS,
    onClose: vi.fn(),
    _utils: utils,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SandboxFrame security guards (SANDBOX-05)", () => {
  it("frame is sandbox='allow-scripts' and never carries allow-same-origin", () => {
    const { container } = render(
      <SandboxFrame {...defaultProps(makeUtils())} />,
    );
    const iframe = container.querySelector("iframe")!;
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    // The opaque-origin guarantee fails the instant allow-same-origin appears.
    expect(iframe.getAttribute("sandbox")).not.toContain("allow-same-origin");
  });

  it("the srcdoc the parent injects never contains the Anthropic key", () => {
    // The builder output is key-free by construction (the key is parent-side and
    // brokered via postMessage), so an Anthropic key token must never appear.
    const built = buildSrcdoc(
      "const App = () => null;",
      { "--text": "#fff" },
      "https://host.test",
    );
    expect(built).not.toMatch(/sk-ant/);

    // And the same holds for the attribute actually rendered onto the iframe.
    const { container } = render(
      <SandboxFrame {...defaultProps(makeUtils())} />,
    );
    const iframe = container.querySelector("iframe")!;
    expect(iframe.getAttribute("srcdoc")).not.toMatch(/sk-ant/);
  });

  it("a forged __proto__ payload cannot pollute Object.prototype", async () => {
    const { container } = render(
      <SandboxFrame {...defaultProps(makeUtils())} />,
    );
    const { frameWindow } = bindContentWindow(container);

    // A maliciously crafted inbound envelope: JSON.parse materializes a real own
    // "__proto__" key (object-literal syntax would set the prototype instead),
    // exercising the exact attack parseSafe defends against.
    const forged = JSON.parse(
      '{"__proto__":{"polluted":true},"type":"FRAME_RESIZE","payload":{"height":1}}',
    );

    await act(async () => {
      fireInbound(frameWindow, forged);
    });

    // If parseSafe had spread/merged the raw object, Object.prototype.polluted
    // would now be defined on every object. It must remain undefined.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect("polluted" in Object.prototype).toBe(false);
  });
});
