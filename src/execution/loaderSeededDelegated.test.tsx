// Regression: seeded DELEGATED apps (Weather, Currency) must mount through the
// DelegatedShell when opened via the REAL loader → resolveComponent → instantiate
// path — not be routed to the monolithic instantiator (which throws
// "Transpiled code did not export an App function" because delegated seeds export
// { initialState, view, actionSpec }, never `App`).
//
// This is the gap the unit tests missed: prior coverage exercised the delegated
// module in isolation, never the loader's mode-routing. The seeded path used to
// hard-code mode:"app" for ALL seeds, so the delegated seeds rendered the
// ErrorBoundary fallback in the live app while every isolated test still passed.
//
// IoC/DI: injected Services (in-memory registry + canned broker), no real network,
// no IndexedDB. The view renders its idle markup (data-action elements) — proof the
// DelegatedShell mounted rather than the monolith path throwing.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import {
  createTestServices,
  createInMemoryRegistry,
  cannedBroker,
} from "../services/testServices";

afterEach(() => cleanup());

describe("loader — seeded delegated apps mount via DelegatedShell (regression)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("opens the seeded Weather app as a DelegatedShell (no InstantiateError, view renders)", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();

    const { registryKey } = await import("../registry/cacheKey");
    const key = await registryKey("app", "weather");
    // A canned broker keeps the data path inert — the open must not depend on a fetch.
    const services = createTestServices({
      fetchDataBroker: cannedBroker({ data: {} }),
    });

    // Full miss → seeded source → must route to the DELEGATED instantiator.
    const Weather = await resolveComponent("weather-1", "weather", key, services);
    expect(typeof Weather).toBe("function");

    // Render: the DelegatedShell mounts the seed's `view`. Idle markup includes the
    // search action element. If the monolith path had been used, instantiate would
    // have thrown before returning a component (test would fail at resolveComponent).
    const { container } = render(createElement(Weather));
    expect(container.querySelector('[data-action="search"]')).toBeTruthy();
    expect(container.textContent).toContain("Enter a location");
  });

  it("opens the seeded Currency app as a DelegatedShell (no InstantiateError, view renders)", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();

    const { registryKey } = await import("../registry/cacheKey");
    const key = await registryKey("app", "currency");
    const services = createTestServices({
      fetchDataBroker: cannedBroker({ data: {} }),
    });

    const Currency = await resolveComponent("currency-1", "currency", key, services);
    expect(typeof Currency).toBe("function");

    const { container } = render(createElement(Currency));
    expect(container.querySelector('[data-action="load"]')).toBeTruthy();
    expect(container.textContent).toContain("Base currency: USD");
  });

  it("persists mode:'delegated' on the seeded Weather record (next open is a correct tier-3 hit)", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();

    const { registryKey } = await import("../registry/cacheKey");
    const key = await registryKey("app", "weather");
    const registry = createInMemoryRegistry();
    const services = createTestServices({
      registry,
      fetchDataBroker: cannedBroker({ data: {} }),
    });

    await resolveComponent("weather-write", "weather", key, services);

    const stored = await registry.get("apps", key);
    expect(stored?.mode).toBe("delegated");
  });

  it("self-heals a STALE mode:'app' Weather record by mounting it via DelegatedShell", async () => {
    // Reproduces the already-poisoned-IndexedDB case: a record written before the fix
    // carries mode:"app" but its payload is a delegated module. The reverse fallback
    // in instantiateApp must recover it instead of throwing into the ErrorBoundary.
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    const { SEEDED_SOURCES } = await import("../apps/seeds");
    const { transpile } = await import("./transpile");
    _clearCachesForTesting();

    const { registryKey } = await import("../registry/cacheKey");
    const key = await registryKey("app", "weather");
    const registry = createInMemoryRegistry();
    const services = createTestServices({
      registry,
      fetchDataBroker: cannedBroker({ data: {} }),
    });

    // Pre-seed a STALE record: delegated payload, but mode:"app" (the bug's footprint).
    const source = SEEDED_SOURCES.get("weather") as string;
    await registry.put(
      "apps",
      {
        cacheKey: key,
        type: "weather",
        source,
        transpiledJS: transpile(source, { filename: "weather.tsx" }),
        mode: "app", // ← stale / wrong
        useCount: 0,
        updatedAt: Date.now(),
        createdAt: Date.now(),
        displayName: "Weather",
      },
      key,
    );

    // Tier-3 hit on the stale record → must self-heal to DelegatedShell, not throw.
    const Weather = await resolveComponent("weather-stale", "weather", key, services);
    expect(typeof Weather).toBe("function");
    const { container } = render(createElement(Weather));
    expect(container.querySelector('[data-action="search"]')).toBeTruthy();
    expect(container.textContent).toContain("Enter a location");
  });
});
