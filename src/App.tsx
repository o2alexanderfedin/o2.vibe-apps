import { useEffect, useState } from "react";
import { dbReady } from "./registry/registry";
import { logger } from "./lib/logger";
import { ThemeProvider } from "./ui/ThemeProvider";
import { VibeThemeProvider } from "./ui/VibeThemeProvider";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { AppBar } from "./ui/AppBar";
import { Marketplace } from "./ui/Marketplace";
import { KeyDialog } from "./ui/KeyDialog";

// Full storefront shell (Phase 1, Plan 02): ThemeProvider wraps an
// ErrorBoundary around the AppBar + Marketplace tree. The KeyDialog is owned
// here so the AppBar Account button can open it. Registry init from Plan 01 is
// preserved.
//
// Phase 14 (THEME-01): VibeThemeProvider is nested INSIDE ThemeProvider so the
// named-theme CSS-variable contract layers on top of the existing light/dark/
// system data-theme mechanism without disturbing it.
export default function App() {
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);

  useEffect(() => {
    void dbReady.then(() => {
      logger.info("Registry initialized");
    });
  }, []);

  return (
    <ThemeProvider>
      <VibeThemeProvider>
        <ErrorBoundary>
          <AppBar onOpenAccount={() => setKeyDialogOpen(true)} />
          <main>
            <Marketplace />
          </main>
          {keyDialogOpen && (
            <KeyDialog onClose={() => setKeyDialogOpen(false)} />
          )}
        </ErrorBoundary>
      </VibeThemeProvider>
    </ThemeProvider>
  );
}
