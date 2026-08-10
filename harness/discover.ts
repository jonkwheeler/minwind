import fs from "node:fs";
import path from "node:path";
import { compareCodeUnits } from "../src/util.js";

// Harness page discovery (R7, KTD8): every prerendered *.html file under the
// build output maps to a crawlable route. index.html files map to their
// directory route (/writing/slug/index.html -> /writing/slug/); any other
// HTML file maps to its own path (/404.html).

export interface DiscoveredPage {
  route: string;
  filePath: string;
}

function routeFor(buildDir: string, filePath: string): string {
  const relative = path.relative(buildDir, filePath).split(path.sep).join("/");
  if (path.posix.basename(relative) === "index.html") {
    const dir = path.posix.dirname(relative);
    return dir === "." ? "/" : `/${dir}/`;
  }
  return `/${relative}`;
}

export function discoverPages(buildDir: string): Array<DiscoveredPage> {
  const pages: Array<DiscoveredPage> = [];

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.sort(function (a, b) {
      return compareCodeUnits(a.name, b.name);
    });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".html")) {
        pages.push({ route: routeFor(buildDir, full), filePath: full });
      }
    }
  }

  walk(buildDir);
  pages.sort(function (a, b) {
    return compareCodeUnits(a.route, b.route);
  });
  return pages;
}
