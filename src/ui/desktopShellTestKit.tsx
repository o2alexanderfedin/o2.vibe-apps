// Shared test kit for the DesktopShell open-flow integration tests (Phase 16,
// plan 16-03). The former storefront grid (a flat page of app cards) is gone:
// DesktopShell is the root, and apps are opened from the minimal launcher
// reached via the dock magnifier. This kit centralizes the render wrapper, the
// launcher-based open helper, and the jsdom pointer-capture stubs so the eight
// migrated open-flow test files share ONE launch surface and stay green with no
// lost coverage.
//
// Test doubles are named "canned"/"stub"/"testTransport" (never the banned
// hygiene tokens), matching the prior storefront tests.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DesktopShell } from "./DesktopShell";
import { ServicesProvider } from "../services/ServicesProvider";
import { VibeThemeProvider } from "./VibeThemeProvider";
import {
  createTestServices,
  type TestServicesOverrides,
} from "../services/testServices";
import type { Services } from "../services/services";

// jsdom does not implement the pointer-capture APIs the drag hook relies on —
// install module-level stubs so handlePointerDown does not throw. Importing this
// module installs them as a side effect (mirrors the Wave 1/2 test files).
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => undefined;
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => undefined;
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

/**
 * Render the REAL DesktopShell with INJECTED dependencies. DesktopShell owns its
 * own WindowManagerProvider; it is wrapped in ServicesProvider (so useServices()
 * resolves) and VibeThemeProvider (so the MenuBar's relocated ThemeSelector,
 * which calls useVibeTheme(), does not throw).
 */
export function renderDesktopShell(overrides: TestServicesOverrides = {}): {
  services: Services;
  user: ReturnType<typeof userEvent.setup>;
} {
  const services = createTestServices(overrides);
  const user = userEvent.setup();
  render(
    <ServicesProvider services={services}>
      <VibeThemeProvider>
        <DesktopShell />
      </VibeThemeProvider>
    </ServicesProvider>,
  );
  return { services, user };
}

/** The currently-open launcher dialog, or throw if it is not open. */
function launcherDialog(): HTMLElement {
  return screen.getByRole("dialog", { name: "Open an app" });
}

/**
 * Open an app through the launcher: click the dock magnifier to open the
 * MinimalLauncher, then click the app's button (aria-label === displayName)
 * inside the launcher dialog. The launcher closes itself after an open.
 */
export async function openApp(
  user: ReturnType<typeof userEvent.setup>,
  displayName: string,
): Promise<void> {
  await user.click(
    screen.getByRole("button", { name: "Open launcher" }),
  );
  const dialog = launcherDialog();
  await user.click(
    within(dialog).getByRole("button", { name: displayName }),
  );
}

/**
 * Assert the desktop is still usable after a failed/throttled open: the launcher
 * still lists the given app as openable (the windowed equivalent of the old
 * "storefront stays browsable" assertion). Opens the launcher, checks the
 * button, then closes the launcher so it does not leak into later assertions.
 */
export async function expectLauncherLists(
  user: ReturnType<typeof userEvent.setup>,
  displayName: string,
): Promise<void> {
  await user.click(
    screen.getByRole("button", { name: "Open launcher" }),
  );
  const dialog = launcherDialog();
  const btn = within(dialog).getByRole("button", { name: displayName });
  if (!btn) throw new Error(`launcher does not list "${displayName}"`);
  // Close the launcher (Close control) so it does not overlay later queries.
  await user.click(within(dialog).getByRole("button", { name: "Close" }));
}

/** All window-chrome frames currently in the document. */
export function frames(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(".window-chrome"),
  );
}

/** The single frame whose titlebar title text matches `title`. */
export function frameByTitle(title: string): HTMLElement {
  const frame = frames().find(
    (f) =>
      f.querySelector(".window-chrome__title")?.textContent?.trim() === title,
  );
  if (!frame) throw new Error(`no window frame titled "${title}"`);
  return frame;
}

/**
 * Count mounted app bodies — each open window renders exactly one AppShell
 * (role="region") inside its body once the app resolves. A leaked window leaves
 * a stray `.app-shell`; this count is the zero-leak invariant the close path
 * must keep.
 */
export function appBodyCount(): number {
  return document.querySelectorAll(".window-chrome__body .app-shell").length;
}
