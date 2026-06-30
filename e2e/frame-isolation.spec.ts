import { test, expect } from "@playwright/test";

// SANDBOX-05 — end-to-end proof that the app body runs inside a real
// opaque-origin frame in the production build, with the following standing facts:
//   (1) the Notes seed renders NON-BLANK inside the frame (regression: Notes app
//       was previously crashing because localStorage.getItem threw SecurityError;
//       the in-memory storage shim fixes this),
//   (2) a host theme switch repaints the frame's :root variables,
//   (3) the frame sandbox attribute is exactly "allow-scripts" (never allow-same-origin),
//   (4) the frame's in-memory localStorage is EMPTY and SEPARATE from the parent's
//       real localStorage — the parent's API key is NOT readable from inside the frame,
//   (5) the frame reports window.location.origin === "null" (opaque origin),
//   (6) the srcdoc contains no API key pattern,
//   (7) a forged parent-context postMessage (wrong source) is dropped.
test.describe("opaque-origin app body", () => {
  test("renders, themes in-frame, storage isolated, drops forged messages", async ({
    page,
  }) => {
    await page.goto("/");

    // Open the launcher (dock magnifier), then open the Notes seed app.
    await page.getByRole("button", { name: "Open launcher" }).click();
    await page.getByRole("button", { name: "Notes", exact: true }).click();

    // The app body is an opaque-origin frame; locate it.
    const frame = page.frameLocator("iframe").first();

    // (1) RENDER (regression proof) — the Notes app previously crashed because
    //     localStorage.getItem threw SecurityError in an opaque-origin frame.
    //     The in-memory storage shim prevents the throw; assert the Notes UI is
    //     fully visible and NON-BLANK. This is the primary regression guard.
    await expect(
      frame.locator('input[placeholder="Add a note…"]'),
    ).toBeVisible({ timeout: 30_000 });
    await expect(frame.getByText("No notes yet.")).toBeVisible({
      timeout: 30_000,
    });

    // Confirm the frame's #root has rendered content (non-blank body).
    const rootChildCount = await page
      .frames()[1]!
      .evaluate(() => document.getElementById("root")?.childElementCount ?? 0);
    expect(rootChildCount).toBeGreaterThan(0);

    // The first child frame is the app body (index 0 is the main page frame).
    const appFrame = () => page.frames()[1]!;

    // (2) THEME-IN-FRAME — switch theme, assert the frame's :root --text changes.
    const before = await appFrame().evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--text")
        .trim(),
    );
    // Click the Noir pill by exact name — robust to Duplicate buttons added in
    // Phase 22 which shifted positional indices (nth(3) now lands on "Aero
    // Duplicate"). Use exact:true because "Duplicate Noir" is a substring match.
    await page
      .getByRole("group", { name: "Color theme" })
      .getByRole("button", { name: "Noir", exact: true })
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

    // (3) SANDBOX ATTRIBUTE — the iframe sandbox must be exactly "allow-scripts".
    //     "allow-same-origin" must never be present (that would grant storage access
    //     and break opaque-origin isolation).
    const sandboxAttr = await page
      .locator("iframe")
      .first()
      .getAttribute("sandbox");
    expect(sandboxAttr).toBe("allow-scripts");

    // (4) STORAGE ISOLATION — the frame's in-memory localStorage shim is empty
    //     and completely separate from the parent's real localStorage. Writing the
    //     parent's API key to parent localStorage and reading it from inside the
    //     frame returns null (the shim has a fresh, empty store).
    //     Additionally, the shim must NOT throw (the crash regression is fixed).
    await page.evaluate(() => {
      localStorage.setItem("marketplace.apiKey", "sk-ant-test-sentinel");
    });
    const frameApiKeyRead = await appFrame().evaluate(() => {
      try {
        return localStorage.getItem("marketplace.apiKey") ?? "null-returned";
      } catch (e) {
        return "threw:" + (e as Error).name;
      }
    });
    // Must NOT throw (regression fix) and must NOT expose the parent's API key.
    expect(frameApiKeyRead).toBe("null-returned");
    // Clean up the test sentinel from parent localStorage.
    await page.evaluate(() => localStorage.removeItem("marketplace.apiKey"));

    // (5) OPAQUE-ORIGIN — the frame's own window.location.origin reports "null"
    //     (the serialization of an opaque origin). A sandboxed srcdoc frame without
    //     allow-same-origin gets an opaque/null origin by spec, which is what
    //     prevents the frame from accessing the parent's real storage or cookies.
    const frameOrigin = await page.frames()[1]!.evaluate(() =>
      window.location.origin,
    );
    expect(frameOrigin).toBe("null");

    // (6) SRCDOC KEY PATTERN — the srcdoc string must contain no sk-ant API key
    //     pattern. Verify by inspecting the iframe's srcdoc attribute.
    const srcdoc = await page
      .locator("iframe")
      .first()
      .getAttribute("srcdoc");
    expect(srcdoc ?? "").not.toMatch(/sk-ant/);

    // (7) FORGED DROP — a parent-context postMessage (wrong source, not the
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
