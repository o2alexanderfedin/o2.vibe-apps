import { useEffect } from "react";
import { dbReady } from "./registry/registry";
import { logger } from "./lib/logger";
import { ThemeProvider } from "./ui/ThemeProvider";
import { VibeThemeProvider } from "./ui/VibeThemeProvider";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { DesktopShell } from "./ui/DesktopShell";

// Root shell. ThemeProvider (light/dark/system via data-theme) wraps
// VibeThemeProvider (the named-theme CSS-variable contract) wraps an
// ErrorBoundary around the DesktopShell.
//
// Phase 16 (WIN-08): the flat storefront (AppBar + Marketplace grid) is replaced
// by the DesktopShell root — a themed wallpaper + animated blobs behind the
// windows, with the dock + menu bar + minimal launcher over them. DesktopShell
// owns its OWN WindowManagerProvider and KeyDialog, so App no longer mounts an
// outer WindowManagerProvider or App-level key-dialog state.
//
// ServicesProvider lives in main.tsx (the composition root, wrapping <App/>), so
// DesktopShell's useServices() resolves without App re-providing it. The
// registry init effect from Plan 01 is preserved.
export default function App() {
  useEffect(() => {
    void dbReady.then(() => {
      logger.info("Registry initialized");
    });
  }, []);

  return (
    <ThemeProvider>
      <VibeThemeProvider>
        <ErrorBoundary>
          <DesktopShell />
        </ErrorBoundary>
      </VibeThemeProvider>
    </ThemeProvider>
  );
}
