// Phase 13 (WIDGET-06) end-to-end regression: a DELEGATED app can declare and
// render `@widget` sub-widgets through the REAL loader → instantiateApp →
// instantiateDelegatedWithWidgets path. This is the gap the dormant machinery had:
// the delegated module scope injected no `useWidget`, so a delegated `view(state)`
// could never compose widgets even though the prewarm/instantiate/isolate machinery
// (WIDGET-01..05) existed and was tested only for the MONOLITHIC path.
//
// Proven here, with INJECTED Services (in-memory registry, no network, no IndexedDB):
//   1. A delegated app that declares `// @widget <type>` and calls useWidget(type)
//      in its view renders the widget, wrapped in its WidgetShell (isolation).
//   2. A widget that throws at render is isolated by its WidgetErrorBoundary — the
//      neutral placeholder shows and the parent delegated app does NOT crash.
//   3. Backward compat: a delegated app that declares NO widget mounts unchanged;
//      useWidget(...) returns null and the view renders its graceful fallback.
//
// Test doubles are named "stub"/"canned" (never the banned hygiene tokens).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import {
  createTestServices,
  createInMemoryRegistry,
  cannedBroker,
} from "../services/testServices";
import type { Registry } from "../services/registry";
import { registryKey } from "../registry/cacheKey";

afterEach(() => cleanup());

// Seed a monolithic widget into the registry "widgets" store. `body` is the App
// body (plain JS, no JSX — React.createElement) so no transpile step is needed.
async function seedWidget(
  registry: Registry,
  type: string,
  body: string,
): Promise<void> {
  const key = await registryKey("widget", type);
  await registry.put(
    "widgets",
    {
      cacheKey: key,
      type,
      // source is only re-parsed for nested @widget deps — this widget has none.
      source: "function App() {}",
      transpiledJS: "exports.default = function App(){ " + body + " };",
    },
    key,
  );
}

// Seed a DELEGATED app into the registry "apps" store (mode:"delegated"), so the
// loader takes a tier-3 hit and routes to the delegated instantiator. `widgetDecl`
// is the `// @widget <type>` line (or "" for the no-widget case) — it lives in the
// SOURCE (which prewarm parses), separate from the runnable transpiledJS.
async function seedDelegatedApp(
  registry: Registry,
  appType: string,
  widgetDecl: string,
  transpiledJS: string,
): Promise<string> {
  const key = await registryKey("app", appType);
  const source = (widgetDecl ? widgetDecl + "\n" : "") + transpiledJS;
  await registry.put(
    "apps",
    {
      cacheKey: key,
      type: appType,
      source,
      transpiledJS,
      mode: "delegated",
      useCount: 0,
      updatedAt: 1,
      createdAt: 1,
    },
    key,
  );
  return key;
}

// A delegated module whose view composes a widget by id. Renders the host marker
// plus the widget (or a graceful "no-widget" fallback when useWidget returns null).
function delegatedViewJS(widgetType: string): string {
  return (
    "const initialState = { n: 0 };\n" +
    "function view(state) {\n" +
    '  const Badge = useWidget("' + widgetType + '");\n' +
    '  return React.createElement(\n' +
    '    "div", null,\n' +
    '    React.createElement("span", { "data-testid": "host-n" }, String(state.n)),\n' +
    '    Badge ? React.createElement(Badge) : React.createElement("span", { "data-testid": "no-widget" }, "none")\n' +
    "  );\n" +
    "}\n" +
    'const actionSpec = "n:number";\n' +
    "module.exports = { initialState, view, actionSpec };\n"
  );
}

describe("delegated widget composition (WIDGET-06)", () => {
  beforeEach(() => vi.resetModules());

  it("a delegated app renders a declared @widget through the loader, wrapped in its WidgetShell", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();

    const registry = createInMemoryRegistry();
    await seedWidget(
      registry,
      "demo-badge",
      'return React.createElement("div", { "data-testid": "demo-badge" }, "BADGE");',
    );
    const key = await seedDelegatedApp(
      registry,
      "widget-host",
      "// @widget demo-badge",
      delegatedViewJS("demo-badge"),
    );
    const services = createTestServices({
      registry,
      fetchDataBroker: cannedBroker({ data: {} }),
    });

    const App = await resolveComponent("widget-host-1", "widget-host", key, services);
    const { container } = render(createElement(App));

    // The host mounted (delegated view rendered)…
    expect(container.querySelector('[data-testid="host-n"]')?.textContent).toBe("0");
    // …the widget resolved + rendered…
    expect(container.querySelector('[data-testid="demo-badge"]')?.textContent).toBe("BADGE");
    // …isolated inside its WidgetShell (group wrapper, labelled by type).
    const shell = container.querySelector(".widget-shell");
    expect(shell).toBeTruthy();
    expect(shell?.getAttribute("aria-label")).toBe("demo-badge");
  });

  it("a widget that throws at render is isolated — neutral placeholder, parent app survives", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();

    const registry = createInMemoryRegistry();
    await seedWidget(registry, "boom-badge", 'throw new Error("widget boom");');
    const key = await seedDelegatedApp(
      registry,
      "widget-host-boom",
      "// @widget boom-badge",
      delegatedViewJS("boom-badge"),
    );
    const services = createTestServices({
      registry,
      fetchDataBroker: cannedBroker({ data: {} }),
    });

    // Silence the expected React error-boundary console noise for the throwing widget.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const App = await resolveComponent("widget-host-boom-1", "widget-host-boom", key, services);
      const { container } = render(createElement(App));

      // The parent app still rendered its own content (not blanked / crashed)…
      expect(container.querySelector('[data-testid="host-n"]')?.textContent).toBe("0");
      // …and the failing widget shows the neutral, data-framed placeholder.
      expect(container.textContent).toContain("Unavailable right now.");
      // The mechanic is never revealed.
      expect(container.textContent).not.toMatch(/boom|error|throw/i);
    } finally {
      errSpy.mockRestore();
    }
  });

  it("backward compat: a delegated app that declares NO widget mounts unchanged (useWidget → null)", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();

    const registry = createInMemoryRegistry();
    // No widget seeded, no `@widget` declaration → prewarm yields an empty map.
    const key = await seedDelegatedApp(
      registry,
      "widget-host-none",
      "",
      delegatedViewJS("absent-widget"),
    );
    const services = createTestServices({
      registry,
      fetchDataBroker: cannedBroker({ data: {} }),
    });

    const App = await resolveComponent("widget-host-none-1", "widget-host-none", key, services);
    const { container } = render(createElement(App));

    // Host mounts; useWidget("absent-widget") returns null → graceful fallback, no crash.
    expect(container.querySelector('[data-testid="host-n"]')?.textContent).toBe("0");
    expect(container.querySelector('[data-testid="no-widget"]')).toBeTruthy();
    expect(container.querySelector(".widget-shell")).toBeNull();
  });
});
