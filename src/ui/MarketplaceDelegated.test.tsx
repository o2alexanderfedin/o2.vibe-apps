// Marketplace open flow → delegated app path (the productized live wiring).
//
// Opening an UNSEEDED app now produces a behavior-free delegated module, which the
// loader mounts through the permanent DelegatedShell. This drives the REAL flow end
// to end with REAL captured fixtures and NO network: a canned transport returns the
// delegated calculator MODULE for the app produce and the calculator REDUCER for the
// on-demand handler produce; clicking a key updates the display.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, screen, within, waitFor } from "@testing-library/react";
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { _clearCachesForTesting } from "../execution/loader";
import type { TransportFn, MessagesResponse } from "../host/modelClient";
import { renderDesktopShell, openApp } from "./desktopShellTestKit";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");
const read = (f: string): string => readFileSync(join(FIXTURE_DIR, f), "utf8");
const MODULE = read("delegated-calculator.code.txt");
const REDUCER = read("delegated-calc-reducer.code.txt");

// Route by prompt: a handler produce asks for `handler(input)`; the delegated app
// produce asks for a "behavior-free" module. (The reducer handles every action.)
function delegatedTransport(): TransportFn {
  return (_url, init) => {
    const body = JSON.parse(init.body as string) as { messages: Array<{ content: string }> };
    const content = body.messages[0]?.content ?? "";
    const text = content.includes("handler(input)") ? REDUCER : MODULE;
    return Promise.resolve<MessagesResponse>({
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
    });
  };
}

beforeEach(() => _clearCachesForTesting());
afterEach(() => {
  cleanup();
  _clearCachesForTesting();
});

describe("Marketplace — delegated app open flow (real fixtures, no network)", () => {
  it("opens an unseeded app as a delegated module; a key press drives on-demand behavior", async () => {
    const { user } = renderDesktopShell({ transport: delegatedTransport() });

    // Open Calculator (unseeded → produces a delegated module → DelegatedShell).
    await openApp(user, "Calculator");
    const region = await screen.findByRole("region", { name: "Calculator" });

    // The behavior-free view rendered the keypad (data-action buttons, no handlers).
    const oneKey = region.querySelector('[data-action="1"]') as HTMLElement;
    expect(oneKey).toBeTruthy();
    const display = region.querySelector('div[style*="text-align: right"]') as HTMLElement;
    expect(display.textContent).toBe("0");

    // Press "1": the container delegate produces its handler on demand (canned
    // reducer), merges state, and the display updates — no per-button handler exists.
    await user.click(oneKey);
    await waitFor(() => expect(display.textContent).toBe("1"));
  });
});
