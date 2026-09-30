import { test, expect } from "@playwright/test";

// An error in one of an app's buttons must not throw the whole app away. The
// app is still on screen and still holds what the user typed: the frame shows
// its own "Something went wrong." notice, and its "Try again" hides the notice
// over the same, still-running app. Only an app that cannot show itself at all
// gets the host page's "couldn't load" fallback (broken-app-fallback.spec.ts).
// Real frame, production build, stub model: no real key, no network.

const APP_WITH_BAD_BUTTON = [
  "```tsx",
  "export default function App() {",
  '  const [text, setText] = React.useState("");',
  "  return (",
  "    <div>",
  '      <input aria-label="Note" value={text} onChange={(e) => setText(e.target.value)} />',
  "      <button onClick={() => { throw new Error(\"stub button is broken\"); }}>Save</button>",
  "    </div>",
  "  );",
  "}",
  "```",
].join("\n");

test("an error in an app's button keeps the app and what the user typed", async ({ page }) => {
  await page.route("https://api.anthropic.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        content: [{ type: "text", text: APP_WITH_BAD_BUTTON }],
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

  const app = page.frameLocator("iframe").first();
  await app.getByRole("textbox", { name: "Note" }).fill("my unsaved note");
  await app.getByRole("button", { name: "Save" }).click();

  // The frame's own notice appears over the app; the host fallback does not.
  const notice = page.getByText("Something went wrong.");
  const hostFallback = page.getByText("This app couldn’t load. Try again.");
  await expect(notice.or(hostFallback)).toBeVisible({ timeout: 10_000 });
  expect({ notice: await notice.count(), hostFallback: await hostFallback.count() }).toEqual({
    notice: 1,
    hostFallback: 0,
  });

  // "Try again" hides the notice; the same app is still there with the text.
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(notice).toHaveCount(0);
  expect({
    frames: await page.locator("iframe").count(),
    typed: await app.getByRole("textbox", { name: "Note" }).inputValue({ timeout: 5_000 }),
  }).toEqual({ frames: 1, typed: "my unsaved note" });
});
