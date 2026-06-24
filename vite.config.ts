/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()], // automatic JSX runtime for the HOST app (D-47)
  build: {
    sourcemap: false, // MASTER hygiene switch — never flip to true (D-04/D-45)
    minify: true, // mangle internal names out of the shipped bundle
    target: "es2020", // crypto.subtle, IndexedDB, modern JS floor (D-45)
  },
  test: {
    environment: "jsdom", // default; cacheKey.test.ts overrides to node per-file
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
