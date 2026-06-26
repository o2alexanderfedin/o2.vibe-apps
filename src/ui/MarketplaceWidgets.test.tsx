// UI render-layer coverage for widget composition (Phase 4 — the important layer).
//
// Renders the REAL Marketplace through ServicesProvider with a canned transport
// (no network, no real IndexedDB) and drives the full open flow through the DOM.
// The transport returns:
//   - an app whose source declares `@widget` deps and renders them via useWidget,
//   - REAL captured widget fixtures (line-chart / data-table / stat-card) for the
//     declared widget types.
//
// The three cases (mirroring WIDGET-02..05 acceptance):
//   (a) ALL declared widgets appear ALREADY rendered on first paint (no pop-in),
//       each inside its own WidgetShell with an independent `⋮`.
//   (b) ONE widget whose canned output THROWS at render → that widget shows a
//       neutral placeholder while the parent app + sibling widgets keep working.
//   (c) A widget that FAILS to produce (garbage that cannot transpile) → neutral
//       placeholder, parent app survives.
//
// Test doubles are named "canned"/"stub"/"testTransport" (never banned tokens).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Marketplace } from "./Marketplace";
import { ServicesProvider } from "../services/ServicesProvider";
import {
  createTestServices,
  type TestServicesOverrides,
} from "../services/testServices";
import { _clearCachesForTesting } from "../execution/loader";
import type { TransportFn, MessagesResponse } from "../host/modelClient";
import { rawWidgetFixture } from "../test/fixtures/load";

// An app source that declares three widgets and renders each via useWidget.
// Shipped fenced + with `export default` (the real model output shape). The
// `@widget` comments sit inside the fence so extractCode preserves them.
function appComposingWidgets(types: string[]): string {
  const decls = types.map((t) => `// @widget ${t}`).join("\n");
  const renders = types
    .map(
      (t, i) =>
        `  const W${i} = useWidget("${t}");`,
    )
    .join("\n");
  const elements = types
    .map((_t, i) => `W${i} ? React.createElement(W${i}, { key: ${i} }) : null`)
    .join(", ");
  return (
    "```tsx\n" +
    `${decls}\n` +
    `export default function App() {\n` +
    `${renders}\n` +
    `  return React.createElement("div", { "data-testid": "host-app" }, "Host App", ${elements});\n` +
    `}\n` +
    "```\n"
  );
}

/**
 * A canned transport that infers the requested type from the prompt body and
 * returns the matching app/widget source. Apps route by `for a "<type>" app`;
 * widgets route by `of type "<type>"`. Unknown types fall back to a trivial app.
 */
function compositionTransport(
  appSourcesByType: Record<string, string>,
  widgetSourcesByType: Record<string, string>,
): TransportFn {
  return (_url, init) => {
    const body = JSON.parse(init.body as string) as {
      messages: Array<{ content: string }>;
    };
    const content = body.messages[0]?.content ?? "";
    const widgetMatch = content.match(/of type "([^"]+)"/);
    if (widgetMatch?.[1]) {
      const text = widgetSourcesByType[widgetMatch[1]] ?? "";
      return Promise.resolve<MessagesResponse>({
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
      });
    }
    const appMatch = content.match(/for a "([^"]+)" app/);
    const text = (appMatch?.[1] && appSourcesByType[appMatch[1]]) || "```tsx\nexport default function App(){return React.createElement('div',null,'plain');}\n```";
    return Promise.resolve<MessagesResponse>({
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
    });
  };
}

function renderMarketplace(overrides: TestServicesOverrides = {}) {
  const services = createTestServices(overrides);
  const user = userEvent.setup();
  render(
    <ServicesProvider services={services}>
      <Marketplace />
    </ServicesProvider>,
  );
  return { services, user };
}

async function openApp(
  user: ReturnType<typeof userEvent.setup>,
  displayName: string,
): Promise<void> {
  const card = screen.getByRole("button", {
    name: new RegExp("^" + displayName + " —"),
  });
  await user.click(card);
}

beforeEach(() => {
  _clearCachesForTesting();
});

afterEach(() => {
  cleanup();
  _clearCachesForTesting();
});

// ---------------------------------------------------------------------------
// (a) All declared widgets appear already-rendered on first paint, each shelled.
// ---------------------------------------------------------------------------

describe("Marketplace — composed app: all declared widgets render on first paint (WIDGET-02/03/04)", () => {
  const WIDGETS = ["line-chart", "data-table", "stat-card"];

  function servicesForComposedApp(): TestServicesOverrides {
    return {
      transport: compositionTransport(
        { calculator: appComposingWidgets(WIDGETS) },
        {
          "line-chart": rawWidgetFixture("line-chart"),
          "data-table": rawWidgetFixture("data-table"),
          "stat-card": rawWidgetFixture("stat-card"),
        },
      ),
    };
  }

  it("renders the host app AND all three real widgets on first paint (no pop-in)", async () => {
    const { user } = renderMarketplace(servicesForComposedApp());

    await openApp(user, "Calculator");

    const region = await screen.findByRole("region", { name: "Calculator" });
    // Host app rendered.
    expect(within(region).getByTestId("host-app")).toBeInTheDocument();
    // No pop-in: ALL three widget shells are present synchronously on the SAME
    // paint as the host app (useWidget resolved each component during render —
    // no async gap where a widget would appear later).
    for (const type of WIDGETS) {
      expect(within(region).getByRole("group", { name: type })).toBeInTheDocument();
    }
    // All three REAL widgets are present (resolved synchronously via useWidget
    // after transitive pre-warm). The data-table fixture populates its rows in a
    // mount effect, so use findByText to let React flush effects — the widgets
    // are wired on FIRST paint (their shells/markers are already present); this
    // only waits out the fixture's own internal effect, not a widget pop-in.
    expect(await within(region).findByText("Line Chart")).toBeInTheDocument(); // line-chart
    expect(await within(region).findByText("Alice Johnson")).toBeInTheDocument(); // data-table
    expect(await within(region).findByText("Stat Card")).toBeInTheDocument(); // stat-card
  });

  it("each widget is in its OWN WidgetShell with an independent ⋮ menu (WIDGET-04)", async () => {
    const { user } = renderMarketplace(servicesForComposedApp());

    await openApp(user, "Calculator");
    await screen.findByRole("region", { name: "Calculator" });

    // Each widget gets its own group region labeled by type, each with a ⋮ button.
    for (const type of WIDGETS) {
      const group = screen.getByRole("group", { name: type });
      expect(group).toBeInTheDocument();
      expect(
        within(group).getByRole("button", { name: `${type} options` }),
      ).toBeInTheDocument();
    }
    // Three independent widget ⋮ menus exist (one per widget), separate from the
    // parent app's own ⋮ (which lives in the AppShell header).
    const widgetMenus = WIDGETS.map((t) =>
      screen.getByRole("button", { name: `${t} options` }),
    );
    expect(new Set(widgetMenus).size).toBe(3);
  });

  it("widgets are reused from the registry on a second open (pre-warm honors the cache)", async () => {
    // Count how many times each widget TYPE is produced. After the first open
    // populates the widgets store, a second open of the same app (caches cleared
    // to force a registry path) must NOT re-produce any widget — each widget type
    // is produced at most once across both opens.
    const produceCount: Record<string, number> = {};
    const widgetFixtures: Record<string, string> = {
      "line-chart": rawWidgetFixture("line-chart"),
      "data-table": rawWidgetFixture("data-table"),
      "stat-card": rawWidgetFixture("stat-card"),
    };
    const countingTransport: TransportFn = (_url, init) => {
      const body = JSON.parse(init.body as string) as { messages: Array<{ content: string }> };
      const content = body.messages[0]?.content ?? "";
      const w = content.match(/of type "([^"]+)"/);
      if (w?.[1]) {
        produceCount[w[1]] = (produceCount[w[1]] ?? 0) + 1;
        return Promise.resolve<MessagesResponse>({
          content: [{ type: "text", text: widgetFixtures[w[1]] ?? "" }],
          stop_reason: "end_turn",
        });
      }
      return Promise.resolve<MessagesResponse>({
        content: [{ type: "text", text: appComposingWidgets(WIDGETS) }],
        stop_reason: "end_turn",
      });
    };

    const { user } = renderMarketplace({ transport: countingTransport });

    await openApp(user, "Calculator");
    await screen.findByText("Line Chart");

    // Force the registry path on the second open by clearing in-memory caches.
    _clearCachesForTesting();
    await openApp(user, "Calculator");
    expect((await screen.findAllByText("Stat Card")).length).toBeGreaterThanOrEqual(1);

    // Each widget type was produced exactly once — the second open reused the
    // registry-cached widgets instead of re-producing them.
    for (const t of WIDGETS) {
      expect(produceCount[t]).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// (b) One widget throws at render → neutral placeholder, siblings + app survive.
// ---------------------------------------------------------------------------

describe("Marketplace — a widget that throws at render is isolated (WIDGET-05)", () => {
  const THROWING_WIDGET = "```tsx\nexport default function App(){ throw new Error('widget-boom'); }\n```";

  it("the throwing widget shows a neutral placeholder; the app + sibling widgets keep working", async () => {
    const { user } = renderMarketplace({
      transport: compositionTransport(
        { calculator: appComposingWidgets(["stat-card", "data-table"]) },
        {
          "stat-card": THROWING_WIDGET,
          "data-table": rawWidgetFixture("data-table"),
        },
      ),
    });

    await openApp(user, "Calculator");

    const region = await screen.findByRole("region", { name: "Calculator" });
    // The host app still rendered.
    expect(within(region).getByTestId("host-app")).toBeInTheDocument();
    // The sibling (data-table) still rendered its real content (findByText waits
    // for the fixture's own mount effect to populate rows).
    expect(await within(region).findByText("Alice Johnson")).toBeInTheDocument();
    // The throwing widget shows the neutral placeholder (its own boundary caught it).
    expect(within(region).getByText("Unavailable right now.")).toBeInTheDocument();
    // Hygiene: the technical error never reaches the DOM.
    expect(region.textContent).not.toContain("widget-boom");
    // The parent app did NOT fall back to the app-level failure UI.
    expect(
      within(region).queryByText("This app couldn’t load. Try again."),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// (c) A widget that fails to PRODUCE (garbage) → neutral placeholder, app survives.
// ---------------------------------------------------------------------------

describe("Marketplace — a widget that fails to produce is isolated (WIDGET-05)", () => {
  const GARBAGE_WIDGET = "function App( { return <div>broken</div"; // cannot transpile

  it("a widget whose produce fails is simply absent; the host renders around it and survives", async () => {
    // The host declares one good widget + one that fails to produce. useWidget
    // returns null for the failed one, so the host renders without it — and the
    // parent app keeps working (no crash, no blank).
    const { user } = renderMarketplace({
      transport: compositionTransport(
        { calculator: appComposingWidgets(["stat-card", "broken-widget"]) },
        {
          "stat-card": rawWidgetFixture("stat-card"),
          "broken-widget": GARBAGE_WIDGET,
        },
      ),
    });

    await openApp(user, "Calculator");

    const region = await screen.findByRole("region", { name: "Calculator" });
    // Host app rendered, good widget rendered.
    expect(within(region).getByTestId("host-app")).toBeInTheDocument();
    expect(within(region).getByText("Stat Card")).toBeInTheDocument();
    // The failed widget is absent (useWidget → null) but the app survived — no
    // app-level failure fallback.
    expect(
      within(region).queryByText("This app couldn’t load. Try again."),
    ).not.toBeInTheDocument();
    // And no group region exists for the broken widget type.
    expect(screen.queryByRole("group", { name: "broken-widget" })).not.toBeInTheDocument();
  });

  it("a TRUNCATED widget response also isolates — host survives without that widget", async () => {
    const truncated: TransportFn = (_url, init) => {
      const body = JSON.parse(init.body as string) as { messages: Array<{ content: string }> };
      const content = body.messages[0]?.content ?? "";
      if (/of type "stat-card"/.test(content)) {
        // Truncated half-widget — produce treats max_tokens as a retryable fail.
        return Promise.resolve<MessagesResponse>({
          content: [{ type: "text", text: "```tsx\nfunction App(){ const [s,setS]=React.useState('un" }],
          stop_reason: "max_tokens",
        });
      }
      // The host app itself.
      return Promise.resolve<MessagesResponse>({
        content: [{ type: "text", text: appComposingWidgets(["stat-card"]) }],
        stop_reason: "end_turn",
      });
    };

    const { user } = renderMarketplace({ transport: truncated });

    await openApp(user, "Calculator");

    const region = await screen.findByRole("region", { name: "Calculator" });
    // Host survives; the widget that couldn't be produced is simply absent.
    expect(within(region).getByTestId("host-app")).toBeInTheDocument();
    expect(
      within(region).queryByText("This app couldn’t load. Try again."),
    ).not.toBeInTheDocument();
  });
});
