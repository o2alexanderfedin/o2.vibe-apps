// UI integration tests for contextual modification (Phase 5, MOD-01..04).
//
// Renders the REAL Marketplace through ServicesProvider with INJECTED deps — a
// canned transport (no network) and an in-memory registry (no real IndexedDB) —
// and drives the full `⋮` flow through the DOM. Test doubles are named
// "canned"/"stub"/"testTransport" (never the banned hygiene tokens).
//
// Coverage (mirrors the Phase 5 acceptance bar):
//   1. Open `⋮` → the popover NAMES the target ("Modify: <name>").
//   2. "remove"/"close" → the app leaves the DOM with NO transport call.
//   3. "clone"/"duplicate" → TWO instances exist, with NO transport call.
//   4. A free-form tweak → transport called WITH the instruction in the prompt,
//      and the region's content is REPLACED in place (old gone, new shown, still
//      ONE region for that app, no version history).
//   5. A widget `⋮` tweak re-resolves just THAT widget in place.
//   6. A tweak that fails to resolve surfaces the existing neutral fallback.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { _clearCachesForTesting } from "../execution/loader";
import type { TransportFn, MessagesResponse } from "../host/modelClient";
import { renderDesktopShell as renderMarketplace, openApp } from "./desktopShellTestKit";

// A canned app component used as the FRESH tweak result so the replacement is
// assertable (distinct text not present in any seed/original).
const TWEAKED_TSX = `
export default function App() {
  return <div data-testid="tweaked">Tweaked Result</div>;
}
`;

// An app source declaring one widget + rendering it, used for the widget tweak
// case. The widget's tweaked output is a distinct, assertable component.
const APP_WITH_WIDGET = (
  "```tsx\n" +
  "// @widget gauge\n" +
  "export default function App() {\n" +
  '  const W = useWidget("gauge");\n' +
  '  return React.createElement("div", { "data-testid": "host-app" }, "Host", W ? React.createElement(W, null) : null);\n' +
  "}\n" +
  "```\n"
);
const WIDGET_ORIGINAL = "```tsx\nfunction App(){ return React.createElement('div', null, 'Original Gauge'); }\n```";
const WIDGET_TWEAKED = "```tsx\nfunction App(){ return React.createElement('div', null, 'Tweaked Gauge'); }\n```";

/** Open the app's `⋮`, type the instruction, and click Apply. */
async function applyModification(
  user: ReturnType<typeof userEvent.setup>,
  region: HTMLElement,
  instruction: string,
): Promise<void> {
  await user.click(within(region).getByRole("button", { name: "App options" }));
  const dialog = within(region).getByRole("dialog");
  await user.type(within(dialog).getByRole("textbox"), instruction);
  await user.click(within(dialog).getByRole("button", { name: "Apply" }));
}

beforeEach(() => {
  _clearCachesForTesting();
});

afterEach(() => {
  cleanup();
  _clearCachesForTesting();
});

// ---------------------------------------------------------------------------
// MOD-01 — the shared popover names the target.
// ---------------------------------------------------------------------------

describe("Marketplace — `⋮` opens the shared popover naming the target (MOD-01)", () => {
  it("opening the app `⋮` shows a popover that names the app", async () => {
    const { user } = renderMarketplace();
    await openApp(user, "Notes"); // seeded — no transport needed
    const region = await screen.findByRole("region", { name: "Notes" });

    await user.click(within(region).getByRole("button", { name: "App options" }));
    const dialog = within(region).getByRole("dialog");
    expect(within(dialog).getByText("Modify: Notes")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// MOD-02 / MOD-04 — remove with no model call.
// ---------------------------------------------------------------------------

describe("Marketplace — `remove`/`close` drops the app with NO model call (MOD-02/04)", () => {
  it("typing 'remove' leaves the app's region out of the DOM and never calls the transport", async () => {
    let transportCalled = false;
    const trackingTransport: TransportFn = () => {
      transportCalled = true;
      return Promise.resolve<MessagesResponse>({
        content: [{ type: "text", text: "" }],
        stop_reason: "end_turn",
      });
    };
    const { user } = renderMarketplace({ transport: trackingTransport });

    await openApp(user, "Notes");
    const region = await screen.findByRole("region", { name: "Notes" });

    await applyModification(user, region, "remove");

    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Notes" })).not.toBeInTheDocument(),
    );
    expect(transportCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MOD-02 / MOD-04 — clone with no model call.
// ---------------------------------------------------------------------------

describe("Marketplace — `clone`/`duplicate` makes a second instance with NO model call (MOD-02/04)", () => {
  it("typing 'duplicate' yields two Notes regions and never calls the transport", async () => {
    let transportCalled = false;
    const trackingTransport: TransportFn = () => {
      transportCalled = true;
      return Promise.resolve<MessagesResponse>({
        content: [{ type: "text", text: "" }],
        stop_reason: "end_turn",
      });
    };
    const { user } = renderMarketplace({ transport: trackingTransport });

    await openApp(user, "Notes");
    const region = await screen.findByRole("region", { name: "Notes" });

    await applyModification(user, region, "duplicate");

    await waitFor(() =>
      expect(screen.getAllByRole("region", { name: "Notes" })).toHaveLength(2),
    );
    expect(transportCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MOD-03 — tweak replaces in place; transport gets the instruction.
// ---------------------------------------------------------------------------

describe("Marketplace — a free-form tweak replaces the app IN PLACE (MOD-03)", () => {
  it("calls the transport WITH the instruction and swaps the content (still one region, no history)", async () => {
    let seenPrompt = "";
    const tweakTransport: TransportFn = (_url, init) => {
      const body = JSON.parse(init.body as string) as { messages: Array<{ content: string }> };
      seenPrompt = body.messages[0]?.content ?? "";
      return Promise.resolve<MessagesResponse>({
        content: [{ type: "text", text: TWEAKED_TSX }],
        stop_reason: "end_turn",
      });
    };
    const { user } = renderMarketplace({ transport: tweakTransport });

    // Notes is seeded → its original UI shows the seeded note input.
    await openApp(user, "Notes");
    const region = await screen.findByRole("region", { name: "Notes" });
    expect(within(region).getByPlaceholderText("Add a note…")).toBeInTheDocument();

    await applyModification(user, region, "make the notes bold");

    // The tweaked component replaces the original IN PLACE.
    const tweakedRegion = await screen.findByRole("region", { name: "Notes" });
    expect(await within(tweakedRegion).findByTestId("tweaked")).toBeInTheDocument();
    // Old content is GONE — no version history, no second region.
    expect(within(tweakedRegion).queryByPlaceholderText("Add a note…")).not.toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: "Notes" })).toHaveLength(1);
    // The transport got the user's instruction in the prompt.
    expect(seenPrompt).toContain("make the notes bold");
  });

  it("a tweak that fails to resolve surfaces the neutral fallback (app does not vanish)", async () => {
    // The tweak transport returns garbage that cannot transpile across all
    // self-heal attempts → produce fails → neutral fallback shown in place.
    const failingTransport: TransportFn = () =>
      Promise.resolve<MessagesResponse>({
        content: [{ type: "text", text: "function App( { return <div" }],
        stop_reason: "end_turn",
      });
    const { user } = renderMarketplace({ transport: failingTransport });

    await openApp(user, "Notes");
    const region = await screen.findByRole("region", { name: "Notes" });

    await applyModification(user, region, "break the layout");

    // Still ONE region for Notes; it shows the neutral fallback, not a blank.
    const stillThere = await screen.findByRole("region", { name: "Notes" });
    expect(
      await within(stillThere).findByText("This app couldn’t load. Try again."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: "Notes" })).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// MOD-03 (widget path) — a widget `⋮` tweak re-resolves just THAT widget.
// ---------------------------------------------------------------------------

describe("Marketplace — a widget `⋮` tweak re-resolves just that widget in place (MOD-03)", () => {
  it("the tweaked widget swaps in place; the host app + region are untouched", async () => {
    // Route by prompt: the app, the original widget, then the tweaked widget
    // (a widget tweak carries the instruction "swap style" in its prompt).
    const transport: TransportFn = (_url, init) => {
      const body = JSON.parse(init.body as string) as { messages: Array<{ content: string }> };
      const content = body.messages[0]?.content ?? "";
      if (/of type "gauge"/.test(content)) {
        const text = content.includes("swap style") ? WIDGET_TWEAKED : WIDGET_ORIGINAL;
        return Promise.resolve<MessagesResponse>({
          content: [{ type: "text", text }],
          stop_reason: "end_turn",
        });
      }
      return Promise.resolve<MessagesResponse>({
        content: [{ type: "text", text: APP_WITH_WIDGET }],
        stop_reason: "end_turn",
      });
    };
    const { user } = renderMarketplace({ transport });

    await openApp(user, "Calculator"); // unseeded → routes through transport
    const region = await screen.findByRole("region", { name: "Calculator" });
    // The original widget rendered inside its own group.
    const group = await within(region).findByRole("group", { name: "gauge" });
    expect(await within(group).findByText("Original Gauge")).toBeInTheDocument();

    // Open the WIDGET `⋮` (label "gauge options"), tweak it.
    await user.click(within(group).getByRole("button", { name: "gauge options" }));
    const dialog = within(group).getByRole("dialog");
    expect(within(dialog).getByText("Modify: gauge")).toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox"), "swap style");
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));

    // The widget re-resolved IN PLACE — tweaked content replaces the original,
    // while the host app and its region are untouched (still one Weather region).
    expect(await within(region).findByText("Tweaked Gauge")).toBeInTheDocument();
    expect(within(region).queryByText("Original Gauge")).not.toBeInTheDocument();
    expect(within(region).getByTestId("host-app")).toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: "Calculator" })).toHaveLength(1);
  });
});
