import { useEffect } from "react";
import { dbReady } from "./registry/registry";
import { logger } from "./lib/logger";

// Walking Skeleton shell (Phase 1).
// Kicks registry initialization on mount and renders a minimal storefront placeholder.
// This component will be replaced by the full ThemeProvider+AppBar+Marketplace tree in Plan 02.
export default function App() {
  useEffect(() => {
    void dbReady.then(() => {
      logger.info("Registry initialized");
    });
  }, []);

  return (
    <main>
      <h1>Apps</h1>
      <p>Marketplace is loading.</p>
    </main>
  );
}
