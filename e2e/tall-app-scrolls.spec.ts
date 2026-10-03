import { test, expect, type Page } from "@playwright/test";

// An app taller than the desktop gets a window cut to fit between the menu bar
// and the dock (SandboxFrame). The rest of the app must still be reachable: the
// user scrolls inside the window to get to it. An app that fits its window
// must not get a scroll bar. Real frame, production build, stub model: no real
// key, no network.

function stubModel(appSource: string[]): string {
  return ["```tsx", ...appSource, "```"].join("\n");
}

const TALL_APP = stubModel([
  "export default function App() {",
  "  return (",
  "    <div>",
  "      <div style={{ height: 2000 }}>Top of the app</div>",
  "      <button>Bottom button</button>",
  "    </div>",
  "  );",
  "}",
]);

const SHORT_APP = stubModel([
  "export default function App() {",
  "  return <button>Only button</button>;",
  "}",
]);

/** Open the Timer app, with the stub model answering with `appText`. */
async function openAppAnswering(page: Page, appText: string): Promise<void> {
  await page.route("https://api.anthropic.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        content: [{ type: "text", text: appText }],
        stop_reason: "end_turn",
      }),
    }),
  );
  await page.addInitScript(() => {
    localStorage.setItem("marketplace.apiKey", "sk-ant-e2e-stub-not-a-real-key");
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open launcher" }).click();
  await page.getByRole("button", { name: "Timer", exact: true }).click();
}

/** Put the mouse over the middle of the app's frame. */
async function pointAtApp(page: Page): Promise<void> {
  const box = (await page.locator("iframe").first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

test("the user can scroll an app taller than the desktop to its bottom", async ({ page }) => {
  await openAppAnswering(page, TALL_APP);

  const app = page.frameLocator("iframe").first();
  await expect(app.getByText("Top of the app")).toBeVisible({ timeout: 10_000 });

  // The window is cut to fit the desktop, so the app is taller than it.
  const iframe = page.locator("iframe").first();
  await expect
    .poll(async () => (await iframe.boundingBox())?.height ?? 0)
    .toBeLessThan(2000);

  // Scrolling the mouse wheel over the app moves it, as it would on any page.
  await pointAtApp(page);
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, 600);
      return app.locator("body").evaluate(() => window.scrollY);
    })
    .toBeGreaterThan(0);
});

test("an app that fits its window cannot be scrolled", async ({ page }) => {
  await openAppAnswering(page, SHORT_APP);

  const app = page.frameLocator("iframe").first();
  await expect(app.getByRole("button", { name: "Only button" })).toBeVisible({
    timeout: 10_000,
  });

  // The window takes the app's own height, so there is nothing to scroll
  // and no scroll bar taking width from the app.
  await pointAtApp(page);
  await page.mouse.wheel(0, 600);
  expect(
    await app.locator("body").evaluate(() => ({
      scrollY: window.scrollY,
      overflows:
        document.documentElement.scrollHeight >
        document.documentElement.clientHeight,
      scrollBarWidth: window.innerWidth - document.documentElement.clientWidth,
    })),
  ).toEqual({ scrollY: 0, overflows: false, scrollBarWidth: 0 });
});
