import { test, expect, Page } from "@playwright/test";

// ──────────────────────────────────────────────────────────────────────────────
// Shared constants
// ──────────────────────────────────────────────────────────────────────────────

/** Custom theme vars used by SMOKE-02. Discriminator: --text "#003366" (far from
 *  Aurora "#f3f1ff"). All 12 vars required — the FOUC script iterates every key
 *  in the stored JSON to set CSS custom properties on :root.
 */
const SMOKE_CUSTOM_VARS: Record<string, string> = {
  "--text":   "#003366",
  "--wall":   "radial-gradient(130% 110% at 18% 8%, #001122 0%, #000a15 62%)",
  "--b1":     "#0066ff",
  "--b2":     "#0099ff",
  "--b3":     "#00ccff",
  "--b4":     "#0044ff",
  "--glass":  "rgba(0,0,255,0.10)",
  "--glass2": "rgba(0,0,255,0.035)",
  "--bord":   "rgba(0,0,255,0.22)",
  "--hi":     "rgba(0,0,255,0.5)",
  "--accentA": "#0033ff",
  "--accentB": "#0088ff",
};

/** Default Aurora --text value [VERIFIED: VibeThemeProvider.tsx:82].
 *  Used in SMOKE-02 as the "must NOT be present at first paint" sentinel.
 */
const AURORA_TEXT = "#f3f1ff";

/** Noir --text value [VERIFIED: VibeThemeProvider.tsx:128].
 *  Used in SMOKE-03 to assert in-frame :root after theme switch.
 */
const NOIR_TEXT = "#f5eeff";

// ──────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns a locator that scopes to a single .window-chrome by its title text.
 * Position is stored as inline style.transform on the .window-chrome element.
 */
function windowLocator(page: Page, title: string) {
  return page.locator(".window-chrome", {
    has: page.locator(".window-chrome__title", { hasText: title }),
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// SMOKE-01 — window layout persists across hard reload
// ──────────────────────────────────────────────────────────────────────────────

// SANDBOX-05 companion: proves Phase 21 layout-persistence requirement in a real
// headless Chromium browser. After opening Notes + Weather, dragging both
// windows to distinct positions, minimizing Weather, and reloading:
//   (1) Notes restores at the same inline style.transform (saved position),
//   (2) Weather carries the .window-chrome--minimized class (saved state),
//   (3) Both .window-chrome elements are present in DOM (desktop not blank).
//
// Uses Notes (SEEDED_SOURCES monolith) and Weather (SEEDED_DELEGATED) —
// both are in APP_REGISTRY catalog; no API key required.
test.describe("SMOKE-01 — window layout persists across hard reload", () => {
  test(
    "two open windows restore at saved positions and minimized state",
    async ({ page }) => {
      await page.goto("/");

      // ── Open Notes ────────────────────────────────────────────────────────
      await page.getByRole("button", { name: "Open launcher" }).click();
      await page.getByRole("button", { name: "Notes", exact: true }).click();
      await expect(windowLocator(page, "Notes")).toBeVisible({ timeout: 10_000 });

      // ── Open Weather ──────────────────────────────────────────────────────
      await page.getByRole("button", { name: "Open launcher" }).click();
      await page.getByRole("button", { name: "Weather", exact: true }).click();
      await expect(windowLocator(page, "Weather")).toBeVisible({ timeout: 10_000 });

      // ── Drag Notes to (200, 120) ──────────────────────────────────────────
      // steps:10 is required — useDrag accumulates deltas from pointermove
      // events; a single-step teleport produces a zero delta.
      const notesTitlebar = windowLocator(page, "Notes").locator(
        ".window-chrome__titlebar"
      );
      const nBbox = await notesTitlebar.boundingBox();
      await page.mouse.move(
        nBbox!.x + nBbox!.width / 2,
        nBbox!.y + nBbox!.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(200, 120, { steps: 10 });
      await page.mouse.up();

      // ── Drag Weather to (500, 250) ────────────────────────────────────────
      const weatherTitlebar = windowLocator(page, "Weather").locator(
        ".window-chrome__titlebar"
      );
      const wBbox = await weatherTitlebar.boundingBox();
      await page.mouse.move(
        wBbox!.x + wBbox!.width / 2,
        wBbox!.y + wBbox!.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(500, 250, { steps: 10 });
      await page.mouse.up();

      // ── Minimize Weather ──────────────────────────────────────────────────
      await windowLocator(page, "Weather")
        .getByRole("button", { name: "Minimize" })
        .click();

      // ── Capture pre-reload inline transform ──────────────────────────────
      // Must use el.style.transform (inline), NOT getComputedStyle — the
      // position is set as an inline style; getComputedStyle may return matrix
      // notation that won't match the saved string.
      const notesTransform = await windowLocator(page, "Notes").evaluate(
        (el: HTMLElement) => el.style.transform
      );

      // ── Wait for 300ms debounce + IDB write ──────────────────────────────
      // LAYOUT_SAVE_DEBOUNCE_MS = 300 (DesktopShell.tsx:64); 500ms buffer
      // covers debounce + async IDB write time. Reloading too soon cancels
      // the trailing debounce and the layout is never persisted.
      await page.waitForTimeout(500);
      await page.reload();

      // ── Assert Notes restored ─────────────────────────────────────────────
      // Use toBeAttached() not toBeVisible() — minimized windows (display:none)
      // are in the DOM but not visible; toBeVisible() would fail on them.
      await expect(windowLocator(page, "Notes")).toBeAttached({ timeout: 10_000 });
      const notesTransformAfter = await windowLocator(page, "Notes").evaluate(
        (el: HTMLElement) => el.style.transform
      );
      expect(notesTransformAfter).toBe(notesTransform);

      // ── Assert Weather present and minimized ─────────────────────────────
      await expect(windowLocator(page, "Weather")).toBeAttached({
        timeout: 10_000,
      });
      const weatherMinimized = await windowLocator(page, "Weather").evaluate(
        (el: HTMLElement) => el.classList.contains("window-chrome--minimized")
      );
      expect(weatherMinimized).toBe(true);

      // ── Assert desktop not blank ──────────────────────────────────────────
      await expect(page.locator(".window-chrome")).toHaveCount(2);
    }
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// SMOKE-02 — custom theme on first paint, no Aurora flash
// ──────────────────────────────────────────────────────────────────────────────

// Proves Phase 22 FOUC-prevention requirement in a real headless Chromium
// browser across two complementary sub-tests:
//
//   Sub-test A — FOUC script alone (JS blocked): seeds localStorage only, then
//   aborts all JS module requests so React never mounts. Asserts the inline
//   FOUC script in index.html applied the custom vars by itself. This test
//   FAILS if the FOUC custom-theme branch is removed from index.html.
//
//   Sub-test B — full hydration, no post-hydration flash: seeds both
//   localStorage and IDB, reloads fully (JS not blocked), waits for IDB read,
//   then asserts the custom theme is stable. Thanks to the readStoredCustomVars
//   fix (R-FLASH-01), the provider no longer overwrites the FOUC-applied vars
//   with Aurora during the IDB-load gap — so the final state is correct even
//   when IDB takes a moment to resolve.
//
// Seeding approach: page.evaluate after the first goto sets both stores. The
// localStorage values persist across page.reload() within the same context, so
// the FOUC inline script reads them on the next load reliably.
test.describe("SMOKE-02 — custom theme on first paint, no Aurora flash", () => {

  // Sub-test A: prove the FOUC inline script applies custom vars before React
  // mounts. Blocks all JS so React never runs — only the inline <script> tag
  // (which is hash-authorised by the CSP) executes. This assertion FAILS if
  // the custom-theme branch is removed from the FOUC script in index.html.
  test(
    "FOUC inline script alone applies custom vars before React mounts (JS blocked)",
    async ({ page }) => {
      // ── First goto: create IDB at v3, set localStorage with custom theme ──
      await page.goto("/");
      await page.evaluate(async (vars: Record<string, string>) => {
        localStorage.setItem("marketplace.osTheme", "custom:smoketest");
        localStorage.setItem(
          "vibe.customTheme.smoketest",
          JSON.stringify(vars)
        );
      }, SMOKE_CUSTOM_VARS);

      // ── Block all JS module requests so React never mounts ────────────────
      // The FOUC script is inline (no src=); it is NOT blocked by this route.
      // The type="module" entry script (/assets/*.js) IS blocked, so no React
      // hydration occurs after this point.
      await page.route("**/*.js", (route) => route.abort());

      // ── Reload with domcontentloaded: FOUC script runs, module JS aborted ─
      // DOMContentLoaded fires after the HTML is parsed and inline scripts run.
      // type="module" scripts are deferred and do not block this event, so the
      // promise resolves even with the module entry aborted.
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {
        // Tolerate any Playwright-level navigation errors triggered by aborted
        // requests — the FOUC script still ran before the abort.
      });

      // ── Unroute before any further navigation ─────────────────────────────
      await page.unrouteAll();

      // ── Assert: FOUC script applied custom vars to :root inline style ─────
      // The FOUC script uses element.style.setProperty, so documentElement.style
      // (not getComputedStyle) is the authoritative signal of what it wrote.
      // React's apply-effect was never called (JS blocked), so any value here
      // came exclusively from the inline FOUC script.
      const textFoucScript = await page.evaluate(() =>
        document.documentElement.style.getPropertyValue("--text").trim()
      );
      // Must be the custom value — proves the FOUC custom-theme branch ran.
      expect(textFoucScript).not.toBe(AURORA_TEXT);
      expect(textFoucScript).toBe(SMOKE_CUSTOM_VARS["--text"]);
    }
  );

  // Sub-test B: full hydration with both localStorage + IDB seeded. Proves the
  // custom theme is stable after React mounts and IDB resolves — the Aurora
  // flash defect (R-FLASH-01) would have made textAfterFullLoad = AURORA_TEXT.
  test(
    "hard reload applies custom theme; custom value stable through full hydration",
    async ({ page }) => {
      // ── First goto: React mounts → openRegistry() creates MarketplaceRegistry
      //    at v3. Default theme is Aurora (no localStorage values set yet).
      await page.goto("/");

      // ── Seed both localStorage and IDB in one evaluate call ───────────────
      // localStorage: FOUC inline script reads these keys synchronously on reload.
      // IDB: VibeThemeProvider.refreshCustomThemes() reads them after hydration.
      await page.evaluate(async (vars: Record<string, string>) => {
        // ── localStorage seed ─────────────────────────────────────────────
        localStorage.setItem("marketplace.osTheme", "custom:smoketest");
        localStorage.setItem(
          "vibe.customTheme.smoketest",
          JSON.stringify(vars)
        );

        // ── IDB seed (for VibeThemeProvider.refreshCustomThemes) ──────────
        await new Promise<void>((resolve, reject) => {
          const req = indexedDB.open("MarketplaceRegistry", 3);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("settings", "readwrite");
            const store = tx.objectStore("settings");
            store.put(
              { key: "customThemeIndex", value: JSON.stringify(["smoketest"]) },
              "customThemeIndex"
            );
            store.put(
              { key: "custom:smoketest", value: JSON.stringify(vars) },
              "custom:smoketest"
            );
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => {
              db.close();
              reject(tx.error);
            };
          };
          req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains("settings")) {
              db.createObjectStore("settings");
            }
          };
        });
      }, SMOKE_CUSTOM_VARS);

      // ── Reload: FOUC applies custom vars; module script + React mounts ────
      // Use default waitUntil:"load" so module script and React hydration are
      // both complete before we assert. In headless Chrome, type="module"
      // scripts execute before DOMContentLoaded fires, so there is no useful
      // pre-hydration window via waitUntil:"domcontentloaded".
      await page.reload();

      // ── Wait for IDB read + React apply-effect ────────────────────────────
      // VibeThemeProvider.refreshCustomThemes() reads IDB asynchronously;
      // 1500ms gives a comfortable buffer for the async IDB read to complete.
      await page.waitForTimeout(1500);

      // ── Final state assertion: custom theme applied and stable ────────────
      // textAfterFullLoad measures the CSS custom prop AFTER React has fully
      // hydrated and VibeThemeProvider's apply-effect has run. The R-FLASH-01
      // defect would have produced AURORA_TEXT here (Aurora clobber during IDB
      // gap); the fix ensures the localStorage mirror is used instead.
      const textAfterFullLoad = await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--text")
          .trim()
      );
      // Must NOT be Aurora (custom theme seeding worked, provider used mirror)
      expect(textAfterFullLoad).not.toBe(AURORA_TEXT);
      // Must be the custom value seeded in both localStorage and IDB
      expect(textAfterFullLoad).toBe(SMOKE_CUSTOM_VARS["--text"]);

      // ── Confirm stability: value unchanged after IDB state settles ────────
      await page.waitForTimeout(500);
      const textStableAfterHydration = await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--text")
          .trim()
      );
      // Custom theme must remain stable — IDB seed populated customThemesState
      // so the apply-effect found stateVars and did not revert to the mirror.
      expect(textStableAfterHydration).toBe(SMOKE_CUSTOM_VARS["--text"]);
    }
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// SMOKE-03 — live theme switch does not reload open frame
// ──────────────────────────────────────────────────────────────────────────────

// Proves Phase 23 RESKIN-01 requirement in a real headless Chromium browser.
// SandboxFrame.tsx intentionally excludes themeVars from the srcdoc useMemo
// deps (comment: "themeVars is intentionally excluded so the iframe element
// remains stable across theme changes") [VERIFIED: SandboxFrame.tsx:108-114].
//
// When the host switches theme, broadcastTheme() posts THEME_PUSH to every
// registered frame; the in-frame bootstrap calls style.setProperty on
// document.documentElement. The iframe element is NOT recreated.
//
// Proof: set window.__smokeThemeId = 42 on the frame's window BEFORE the theme
// switch. After the switch, the marker must still be 42 (a reload would have
// created a new document, wiping the marker). The in-frame :root --text must
// match the Noir contract value.
//
// Uses Notes (SEEDED_SOURCES monolith) — no API key required.
test.describe("SMOKE-03 — live theme switch does not reload open frame", () => {
  test(
    "switching theme re-skins the frame; in-frame state survives",
    async ({ page }) => {
      await page.goto("/");

      // ── Open Notes ────────────────────────────────────────────────────────
      await page.getByRole("button", { name: "Open launcher" }).click();
      await page.getByRole("button", { name: "Notes", exact: true }).click();

      // ── Wait for frame content ────────────────────────────────────────────
      // 30s timeout covers first-open Babel compilation (Babel ~400-500KB
      // gzip; parse + compile can take several seconds on first load).
      const frame = page.frameLocator("iframe").first();
      await expect(
        frame.locator('input[placeholder="Add a note…"]')
      ).toBeVisible({ timeout: 30_000 });

      // ── Frame object for evaluate calls ──────────────────────────────────
      // frames()[0] = main page; frames()[1] = sole app iframe
      const appFrame = () => page.frames()[1]!;

      // ── Capture pre-switch in-frame --text ───────────────────────────────
      const textBefore = await appFrame().evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--text")
          .trim()
      );

      // ── Set identity marker on the frame's window ─────────────────────────
      // This survives THEME_PUSH (which only calls style.setProperty on :root)
      // but is wiped if the frame is reloaded (full document re-creation).
      // Its survival after the theme switch is the proof that no reload occurred.
      await appFrame().evaluate(() => {
        (window as unknown as Record<string, unknown>).__smokeThemeId = 42;
      });

      // ── Switch to Noir ────────────────────────────────────────────────────
      // exact:true is required: "Duplicate Noir" is a substring match for "Noir"
      // and Playwright's default name matching is substring-based, not exact.
      // The Duplicate button has aria-label="Duplicate Noir" and clicking it
      // opens the ThemeEditor instead of switching the theme.
      await page
        .getByRole("group", { name: "Color theme" })
        .getByRole("button", { name: "Noir", exact: true })
        .click();

      // ── Wait for THEME_PUSH to apply in-frame ────────────────────────────
      // broadcastTheme() posts THEME_PUSH; the in-frame bootstrap calls
      // style.setProperty on document.documentElement. Allow up to 2s for CI.
      await expect
        .poll(
          () =>
            appFrame().evaluate(() =>
              getComputedStyle(document.documentElement)
                .getPropertyValue("--text")
                .trim()
            ),
          { timeout: 2_000 }
        )
        .not.toBe(textBefore);

      // ── Assert frame was NOT reloaded (marker survived) ──────────────────
      const markerAfter = await appFrame().evaluate(
        () => (window as unknown as Record<string, unknown>).__smokeThemeId
      );
      expect(markerAfter).toBe(42);

      // ── Assert in-frame :root reflects Noir ──────────────────────────────
      const textAfter = await appFrame().evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--text")
          .trim()
      );
      // Noir --text [VERIFIED: VibeThemeProvider.tsx:128]
      expect(textAfter).toBe(NOIR_TEXT);
    }
  );
});
