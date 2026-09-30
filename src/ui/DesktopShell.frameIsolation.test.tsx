// In the production (iframe) mode, an app's code must run ONLY inside its
// opaque-origin frame — never in the host page, where it could read the saved
// API key from localStorage or navigate the page away with it.
//
// Each test opens an app whose TOP-LEVEL code (it runs as soon as the code is
// evaluated, before any render) tries three things in whatever page runs it:
// set a marker on `window`, copy the saved key out of `localStorage`, and move
// the page by changing `location.hash`. jsdom never delivers the frame's
// bootstrap message (its frame messages do not carry the opaque "null" origin),
// so the frame never evaluates the code here: anything observed on the host
// `window` can only come from the host evaluating it.
//
// Timers are stubbed; `settle` advances them in small steps and yields to the real
// event loop so the async resolve path (digest, registry) can finish.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { render } from "@testing-library/react";
import { DesktopShell } from "./DesktopShell";
import { ServicesProvider } from "../services/ServicesProvider";
import { VibeThemeProvider } from "./VibeThemeProvider";
import {
  cannedTransport,
  createInMemoryRegistry,
  createRecordingSettingsStore,
  createTestServices,
  type TestServicesOverrides,
} from "../services/testServices";
import { _clearCachesForTesting } from "../execution/loader";
import { unmountAll } from "../execution/mount";
import { transpile } from "../execution/transpile";
import { LAYOUT_KEY } from "../host/layoutPersistence";
import { registryKey } from "../registry/cacheKey";
import { STORAGE_KEY_API } from "../lib/storage";
import "./desktopShellTestKit";

const STUB_KEY = "sk-ant-stub-sentinel-0000";

type Probe = Window & { __vibeMarker?: unknown; __vibeLeak?: unknown };
const probe = window as Probe;

/** App code whose top level tries to reach the host page. The model's reply is
 *  fenced: an unfenced reply is cut at its first code-looking line, which would
 *  drop the hostile lines and let the test pass without proving anything. */
const HOSTILE_APP = `
window.__vibeMarker = "ran-in-host";
window.__vibeLeak = localStorage.getItem("${STORAGE_KEY_API}");
location.hash = "vibe-away";
export default function App() {
  return <div data-testid="produced">Produced</div>;
}
`;

/** A widget with the same hostile top level, pulled in by WIDGET_HOST_APP. */
const HOSTILE_WIDGET = `
window.__vibeMarker = "widget-ran-in-host";
window.__vibeLeak = localStorage.getItem("${STORAGE_KEY_API}");
location.hash = "vibe-away";
export default function App() { return <span>w</span>; }
`;

const WIDGET_HOST_APP = `
// @widget spy-widget
export default function App() {
  const W = useWidget("spy-widget");
  return <div>{W ? <W /> : null}</div>;
}
`;

function renderShell(overrides: TestServicesOverrides) {
  const services = createTestServices({ frameMode: "iframe", ...overrides });
  render(
    <ServicesProvider services={services}>
      <VibeThemeProvider>
        <DesktopShell />
      </VibeThemeProvider>
    </ServicesProvider>,
  );
  return { services };
}

/** Advance stubbed time in small steps until `done()` holds (bounded). */
async function settle(done: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !done(); i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5);
      await new Promise<void>((r) => setImmediate(r));
    });
  }
}

function appFrames(): HTMLIFrameElement[] {
  return Array.from(
    document.querySelectorAll<HTMLIFrameElement>(".window-chrome__body iframe"),
  );
}

/** One assertion over all three reaches, so a failure shows every one of them. */
function expectHostUntouched(): void {
  expect({
    marker: probe.__vibeMarker,
    savedKeyCopied: probe.__vibeLeak,
    hash: window.location.hash,
  }).toEqual({ marker: undefined, savedKeyCopied: undefined, hash: "" });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  _clearCachesForTesting();
  localStorage.setItem(STORAGE_KEY_API, STUB_KEY);
});

afterEach(() => {
  cleanup();
  unmountAll();
  _clearCachesForTesting();
  vi.useRealTimers();
  localStorage.removeItem(STORAGE_KEY_API);
  delete probe.__vibeMarker;
  delete probe.__vibeLeak;
  window.location.hash = "";
});

describe("iframe mode keeps app code out of the host page", () => {
  it("opening a new app shows it in a frame and never runs its code in the host", async () => {
    renderShell({ transport: cannedTransport("```tsx\n" + HOSTILE_APP + "\n```") });

    fireEvent.click(screen.getByRole("button", { name: "Open launcher" }));
    const dialog = screen.getByRole("dialog", { name: "Open an app" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Calculator" }));
    await settle(() => appFrames().length > 0);

    expect(appFrames()).toHaveLength(1);
    expectHostUntouched();
  });

  it("restoring a saved window shows it in a frame and never runs its code in the host", async () => {
    const settingsStore = createRecordingSettingsStore();
    await settingsStore.writeRaw(
      LAYOUT_KEY,
      JSON.stringify([
        { appType: "restored-app", title: "Restored", icon: "r", x: 10, y: 10, z: 201, minimized: false },
      ]),
    );
    const registry = createInMemoryRegistry();
    const key = await registryKey("app", "restored-app");
    await registry.put(
      "apps",
      {
        cacheKey: key,
        type: "restored-app",
        source: HOSTILE_APP,
        transpiledJS: transpile(HOSTILE_APP, { filename: "restored.tsx" }),
      },
      key,
    );

    renderShell({ settingsStore, registry });
    await settle(() => appFrames().length > 0);

    expect(appFrames()).toHaveLength(1);
    expectHostUntouched();
  });

  it("an app's widgets are never loaded into the host page", async () => {
    const registry = createInMemoryRegistry();
    const widgetKey = await registryKey("widget", "spy-widget");
    await registry.put(
      "widgets",
      {
        cacheKey: widgetKey,
        type: "spy-widget",
        source: HOSTILE_WIDGET,
        transpiledJS: transpile(HOSTILE_WIDGET, { filename: "spy.tsx" }),
        useCount: 0,
        updatedAt: 0,
      },
      widgetKey,
    );
    renderShell({
      registry,
      transport: cannedTransport("```tsx\n" + WIDGET_HOST_APP + "\n```"),
    });

    fireEvent.click(screen.getByRole("button", { name: "Open launcher" }));
    const dialog = screen.getByRole("dialog", { name: "Open an app" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Calculator" }));
    await settle(() => appFrames().length > 0);

    expect(appFrames()).toHaveLength(1);
    expectHostUntouched();
  });
});
