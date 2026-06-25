// ServicesProvider + useServices — the React seam for dependency injection.
//
// The provider supplies a `Services` bundle to the component tree; the open
// flow (Marketplace) reads it via `useServices()` instead of importing the
// concrete loader/registry/transport. Production wraps the app with
// `<ServicesProvider services={createServices()}>`; a test wraps it with a
// bundle carrying a canned transport and an in-memory registry. No business
// logic lives here — this is the wiring boundary only.

import { createContext, useContext, type ReactNode } from "react";
import type { Services } from "./services";

const ServicesContext = createContext<Services | null>(null);

export interface ServicesProviderProps {
  services: Services;
  children: ReactNode;
}

export function ServicesProvider({ services, children }: ServicesProviderProps) {
  return (
    <ServicesContext.Provider value={services}>
      {children}
    </ServicesContext.Provider>
  );
}

/**
 * Read the injected services. Throws if used outside a ServicesProvider so a
 * missing composition root surfaces immediately rather than as a null deref.
 */
export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (services === null) {
    throw new Error("useServices must be used within a ServicesProvider");
  }
  return services;
}
