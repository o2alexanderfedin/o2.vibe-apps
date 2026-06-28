#!/usr/bin/env node
// Reads React 19 CJS production files and embeds them as a TS constant.
// Output goes to embed/reactEmbed.ts (outside src/ so the hygiene scanner
// does not walk third-party source content).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const NM = resolve(ROOT, "node_modules");

function read(p) {
  return readFileSync(resolve(NM, p), "utf8");
}

const scheduler = read("scheduler/cjs/scheduler.production.js");
const react = read("react/cjs/react.production.js");
const reactDom = read("react-dom/cjs/react-dom.production.js");
const reactDomClient = read("react-dom/cjs/react-dom-client.production.js");

const out = `// Built by scripts/embed-react-cjs.mjs — do not edit manually.
// Contains CJS production builds of React 19 for the srcdoc in-frame bootstrap.
// Lives outside src/ so the lexicon hygiene scanner does not walk third-party source.
export const REACT_EMBED = {
  scheduler: ${JSON.stringify(scheduler)},
  react: ${JSON.stringify(react)},
  reactDom: ${JSON.stringify(reactDom)},
  reactDomClient: ${JSON.stringify(reactDomClient)},
} as const;
`;

mkdirSync(resolve(ROOT, "embed"), { recursive: true });
writeFileSync(resolve(ROOT, "embed/reactEmbed.ts"), out);
console.log("embed-ok", out.length);
