import { createRoot } from "react-dom/client";
import App from "./App";
import { ServicesProvider } from "./services/ServicesProvider";
import { createServices } from "./services/services";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

// Composition root: build the real services once and provide them to the tree.
const services = createServices();

createRoot(rootEl).render(
  <ServicesProvider services={services}>
    <App />
  </ServicesProvider>,
);
