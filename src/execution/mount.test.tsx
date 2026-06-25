// Tests for mount.ts — roots map lifecycle.
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { mountApp, unmountApp, isMounted, mountedCount, unmountAll } from "./mount";

function SimpleComponent() {
  return createElement("span", { "data-testid": "simple" }, "hello");
}

describe("mount — roots map single-root-per-instance", () => {
  afterEach(() => {
    unmountAll();
  });

  it("mountApp creates a root for a new instance id", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountApp("inst-1", container, SimpleComponent);
    expect(isMounted("inst-1")).toBe(true);
    document.body.removeChild(container);
  });

  it("mountApp does not create a second root for the same instance id", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    mountApp("inst-2", container, SimpleComponent);
    const beforeCount = mountedCount();
    // Calling mount again with the same id re-renders, not creates a new root.
    mountApp("inst-2", container, SimpleComponent);
    expect(mountedCount()).toBe(beforeCount); // still one root

    document.body.removeChild(container);
  });

  it("unmountApp removes the root from the map", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountApp("inst-3", container, SimpleComponent);
    expect(isMounted("inst-3")).toBe(true);
    unmountApp("inst-3");
    expect(isMounted("inst-3")).toBe(false);
    document.body.removeChild(container);
  });

  it("unmountApp is safe to call with a non-existent id (no-op)", () => {
    expect(() => unmountApp("does-not-exist")).not.toThrow();
  });

  it("two instances of the same app type have independent roots", () => {
    const c1 = document.createElement("div");
    const c2 = document.createElement("div");
    document.body.appendChild(c1);
    document.body.appendChild(c2);

    mountApp("inst-a", c1, SimpleComponent);
    mountApp("inst-b", c2, SimpleComponent);

    expect(isMounted("inst-a")).toBe(true);
    expect(isMounted("inst-b")).toBe(true);

    unmountApp("inst-a");
    expect(isMounted("inst-a")).toBe(false);
    expect(isMounted("inst-b")).toBe(true); // unaffected

    document.body.removeChild(c1);
    document.body.removeChild(c2);
  });
});
