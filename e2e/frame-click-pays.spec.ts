import { test, expect, type Page } from "@playwright/test";

// A click inside an app's frame must count as a user action in the host page,
// so the app can start a new paid data handler; with no recent click it cannot.
// Browsers pass a click's activation up to the parent page, and the host reads
// it (navigator.userActivation) when the frame's request arrives. This drives
// the real production build in Chromium with a stub model: no real key, no
// network.
//
// Why the test avoids page.evaluate and locator checks at the key moments:
// Playwright runs those as a user gesture, which would itself count as a user
// action. So the app reports through console messages, and the frame click is
// a raw mouse event at coordinates measured before the wait.

const STUB_KEY = "sk-ant-e2e-stub-not-a-real-key";
const PAID_INTENT = "count the characters in a stub string";
// Longer than a click's activation (5 s), so the clicks that opened the app no
// longer count when the app asks on its own.
const SELF_ASK_AFTER_MS = 8_000;

// The one app body the stub model returns. It asks for a new handler by itself
// SELF_ASK_AFTER_MS after it mounts, and again when its button is clicked.
const APP = [
  "```tsx",
  "export default function App() {",
  "  const ask = async (why) => {",
  `    const res = await runHandler(${JSON.stringify(PAID_INTENT)}, {});`,
  '    console.log("RESULT:" + why + ":" + (res && res.data !== undefined ? "ok" : "refused"));',
  "  };",
  "  React.useEffect(() => {",
  `    const t = setTimeout(() => ask("self"), ${SELF_ASK_AFTER_MS});`,
  "    return () => clearTimeout(t);",
  "  }, []);",
  '  return <button onClick={() => ask("click")}>Run</button>;',
  "}",
  "```",
].join("\n");

const HANDLER = "```js\nasync function handler(input) { return { data: 42 }; }\n```";

/** Stub the model; count the calls that ask for a data handler. */
async function stubModel(page: Page): Promise<{ handlerCalls: () => number }> {
  let handlerCalls = 0;
  await page.route("https://api.anthropic.com/**", async (route) => {
    const body = route.request().postData() ?? "";
    const isHandler = body.includes("async function `handler(input)`");
    if (isHandler) handlerCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        content: [{ type: "text", text: isHandler ? HANDLER : APP }],
        stop_reason: "end_turn",
      }),
    });
  });
  return { handlerCalls: () => handlerCalls };
}

/** Wait for the app's next "RESULT:<why>:<ok|refused>" console line. */
function nextResult(page: Page, why: string): Promise<string> {
  return page
    .waitForEvent("console", {
      predicate: (m) => m.text().startsWith("RESULT:" + why + ":"),
      timeout: 20_000,
    })
    .then((m) => m.text());
}

test("a click in the app's frame lets it start a paid handler; without one it cannot", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const model = await stubModel(page);
  await page.addInitScript((key) => {
    localStorage.setItem("marketplace.apiKey", key);
  }, STUB_KEY);
  await page.goto("/");
  await page.getByRole("button", { name: "Open launcher" }).click();
  await page.getByRole("button", { name: "Timer", exact: true }).click();
  const selfAsk = nextResult(page, "self");
  const box = await page
    .frameLocator("iframe")
    .first()
    .getByRole("button", { name: "Run" })
    .boundingBox({ timeout: 30_000 });
  expect(box).not.toBeNull();

  // No recent user action: the app's own request is refused, no model call.
  expect(await selfAsk).toBe("RESULT:self:refused");
  expect(model.handlerCalls()).toBe(0);

  // A real click in the frame: the same request goes through, one model call.
  const clickAsk = nextResult(page, "click");
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  expect(await clickAsk).toBe("RESULT:click:ok");
  expect(model.handlerCalls()).toBe(1);
});
