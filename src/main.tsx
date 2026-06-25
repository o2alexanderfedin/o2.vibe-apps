import { createRoot } from "react-dom/client";
import App from "./App";
import { ServicesProvider } from "./services/ServicesProvider";
import { createServices } from "./services/services";
import {
  installGlobalErrorBackstop,
  makeReactUncaughtHandler,
  type ErrorReport,
} from "./host/globalErrorBackstop";
import { logger } from "./lib/logger";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

// Composition root: build the real services once and provide them to the tree.
const services = createServices();

// Global async backstop (RESIL-02): route uncaught async / event-handler errors
// and unhandled rejections to the gated logger ONLY — never to a user-visible
// surface — and suppress the browser's default console dump so no revealing
// message reaches devtools. The report sink is neutral (it logs only the error
// NAME, never the message). Both the window listeners and React's
// onUncaughtError feed the SAME sink.
const report = (r: ErrorReport): void => {
  logger.error("Backstop caught " + r.source + ": " + r.summary);
};
installGlobalErrorBackstop({ target: window, onReport: report });

createRoot(rootEl, {
  onUncaughtError: makeReactUncaughtHandler(report),
}).render(
  <ServicesProvider services={services}>
    <App />
  </ServicesProvider>,
);
