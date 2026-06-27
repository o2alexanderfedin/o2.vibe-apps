import { test, expect } from "@playwright/test";

// SANDBOX-05 — end-to-end proof that the app body runs inside a real
// opaque-origin frame in the production build, with four standing facts:
//   (1) the seed renders inside the frame,
//   (2) a host theme switch repaints the frame's :root variables,
//   (3) localStorage access inside the opaque-origin frame throws SecurityError,
//   (4) a forged parent-context postMessage (wrong source) is dropped.
test.describe("opaque-origin app body", () => {
  test("renders, themes in-frame, blocks localStorage, drops forged messages", async ({
    page,
  }) => {
    await page.goto("/");

    // Open the launcher (dock magnifier), then open the Notes seed app.
    await page.getByRole("button", { name: "Open launcher" }).click();
    await page.getByRole("button", { name: "Notes", exact: true }).click();

    // The app body is an opaque-origin frame; locate it.
    const frame = page.frameLocator("iframe").first();

    // (1) RENDER — a known seed element appears inside the frame. The notes seed
    //     renders a #root containing the "Add a note…" input and (with no items)
    //     the "No notes yet." copy. Assert the placeholder is present inside the
    //     frame. Generous timeout — the frame bootstraps React from the embed.
    await expect(
      frame.locator('input[placeholder="Add a note…"]'),
    ).toBeVisible({ timeout: 30_000 });
    await expect(frame.getByText("No notes yet.")).toBeVisible({
      timeout: 30_000,
    });

    // The first child frame is the app body (index 0 is the main page frame).
    const appFrame = () => page.frames()[1]!;

    // (2) THEME-IN-FRAME — switch theme, assert the frame's :root --text changes.
    const before = await appFrame().evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--text")
        .trim(),
    );
    // Click a theme pill that differs from the default (aurora = nth 0). The four
    // pills render in order aurora/aero/aqua/noir; nth(3) = "noir" is distinct.
    await page
      .getByRole("group", { name: "Color theme" })
      .getByRole("button")
      .nth(3)
      .click();
    await expect
      .poll(
        async () =>
          appFrame().evaluate(() =>
            getComputedStyle(document.documentElement)
              .getPropertyValue("--text")
              .trim(),
          ),
        { timeout: 10_000 },
      )
      .not.toBe(before);

    // (3) LOCALSTORAGE — reading localStorage inside the opaque-origin frame
    //     throws because the frame has no allow-same-origin grant.
    const lsResult = await appFrame().evaluate(() => {
      try {
        localStorage.getItem("x");
        return "no-error";
      } catch (e) {
        return (e as Error).name;
      }
    });
    expect(lsResult).toBe("SecurityError");

    // (4) FORGED DROP — a parent-context postMessage (wrong source, not the
    //     frame's contentWindow) does not change the iframe height: the dual
    //     origin+source guard rejects it.
    const heightBefore = await page
      .locator("iframe")
      .first()
      .evaluate((el) => (el as HTMLElement).style.height);
    await page.evaluate(() =>
      window.postMessage(
        { type: "FRAME_RESIZE", payload: { height: 9999 } },
        "*",
      ),
    );
    await page.waitForTimeout(500);
    const heightAfter = await page
      .locator("iframe")
      .first()
      .evaluate((el) => (el as HTMLElement).style.height);
    expect(heightAfter).toBe(heightBefore);
  });

  // CR-01 proof — a DELEGATED seed (Weather is in SEEDED_DELEGATED: a module of
  // { initialState, view, actionSpec }, NOT a monolith) must render non-blank
  // inside the frame. The frame body now runs a delegated-shell-equivalent that
  // holds initialState in state and renders module.view(state); the Weather seed's
  // initial "idle" view shows an "Enter a location" prompt + input WITHOUT any
  // network call, so this asserts the initial view alone — no API key required.
  test("renders a delegated seed (Weather) non-blank inside the frame", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Open launcher" }).click();
    await page.getByRole("button", { name: "Weather", exact: true }).click();

    const frame = page.frameLocator("iframe").first();

    // The delegated view's initial (idle) render: the "Enter a location" prompt
    // and the location input. Both come from view(initialState) with status
    // "idle", which needs no successful fetch — so this proves the delegated
    // module mounts and paints inside the frame (CR-01).
    await expect(
      frame.locator('input[placeholder="Enter a location"]'),
    ).toBeVisible({ timeout: 30_000 });
    await expect(frame.getByText("Enter a location").first()).toBeVisible({
      timeout: 30_000,
    });

    // Robustness backstop: the frame's #root has non-empty content (the delegated
    // body rendered SOMETHING, not a silent blank).
    const childCount = await page
      .frames()[1]!
      .evaluate(
        () => document.getElementById("root")?.childElementCount ?? 0,
      );
    expect(childCount).toBeGreaterThan(0);
  });
});
