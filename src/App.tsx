import { useEffect, useState } from "react";
import { dbReady } from "./registry/registry";
import { logger } from "./lib/logger";
import { ThemeProvider } from "./ui/ThemeProvider";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { AppBar } from "./ui/AppBar";
import { Marketplace } from "./ui/Marketplace";
import { KeyDialog } from "./ui/KeyDialog";

// Full storefront shell (Phase 1, Plan 02): ThemeProvider wraps an
// ErrorBoundary around the AppBar + Marketplace tree. The KeyDialog is owned
// here so the AppBar Account button can open it. Registry init from Plan 01 is
// preserved.
export default function App() {
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);

  useEffect(() => {
    void dbReady.then(() => {
      logger.info("Registry initialized");
    });
  }, []);

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AppBar onOpenAccount={() => setKeyDialogOpen(true)} />
        <main>
          <Marketplace />
        </main>
        {keyDialogOpen && (
          <KeyDialog onClose={() => setKeyDialogOpen(false)} />
        )}
      </ErrorBoundary>
    </ThemeProvider>
  );
}
