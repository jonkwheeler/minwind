import fs from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import minwind from "minwind/astro";

// AE1: visibility ranking deals the vocabulary in order, so <html> wears
// hopethisfindsyouwell and justbumpingthis, and <body> the next words.
const vocabulary = JSON.parse(
  fs.readFileSync(new URL("./words.json", import.meta.url), "utf8"),
);

// MINWIND_FIXTURE_NO_INTEGRATION=1 builds without minwind: the baseline a
// MINWIND=off build must match byte for byte (AE4).
const baseline = process.env.MINWIND_FIXTURE_NO_INTEGRATION === "1";

export default defineConfig({
  build: {
    // With minwind, "always" is overridden: the integration forces "never",
    // so no page inlines a stylesheet. Without it nothing forces the value,
    // so the baseline pins "never" itself and only class names can differ.
    inlineStylesheets: baseline ? "never" : "always",
  },
  // R10: fake-motion's mentions of block and absolute stop keeping those
  // classes original; src/scripts/motion.ts's "relative" still counts.
  integrations: baseline
    ? []
    : [
        minwind({
          naming: { strategy: "words", vocabulary },
          trustVendorModules: true,
        }),
      ],
  vite: {
    plugins: [tailwindcss()],
  },
});
