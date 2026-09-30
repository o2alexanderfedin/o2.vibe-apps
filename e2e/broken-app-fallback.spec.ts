import { test, expect } from "@playwright/test";

// A broken app gets the host page's own fallback, whose "Try again" opens the
// app again, not the frame's overlay. Real frame, production build, stub model
// (no real key, no network): the stub app throws while it renders.

const BROKEN_APP = [
  "```tsx",
  "export default function App() {",
  '  throw new Error("stub app is broken");',
  "}",
  "```",
].join("\n");

test("a broken app shows the host's fallback with Try again", async ({ page }) => {
  await page.route("https://api.anthropic.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        content: [{ type: "text", text: BROKEN_APP }],
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

  await expect(page.getByText("This app couldn’t load. Try again.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(1);
  await expect(page.locator("iframe")).toHaveCount(0);
});
