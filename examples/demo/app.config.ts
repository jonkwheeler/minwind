import { defineConfig } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";
import { minwind } from "minwind";
import { DEMO_VOCABULARY } from "./naming";

export default defineConfig({
  vite: {
    plugins: [
      tailwindcss(),
      ...minwind({
        naming: {
          strategy: "words",
          vocabulary: DEMO_VOCABULARY,
        },
        // @solidjs/router injects 'active'/'inactive' on <A> at runtime;
        // excluding them keeps their bytes and reserves the words from
        // themed naming, so a generated name can never collide with them.
        exclusions: { names: ["active", "inactive"], prefixes: [] },
      }),
    ],
  },
  server: {
    prerender: {
      crawlLinks: true,
      routes: ["/404"],
    },
  },
});
