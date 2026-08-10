import fs from "node:fs";
import path from "node:path";
import { enumerateBuildFiles } from "../src/measure/discover.js";
import { compressSizes, type FileSizes } from "../src/measure/measure.js";

// Byte measurement (R7): the realized whole-site delta reuses minwind's
// whole-site scope (HTML + CSS) and its KTD3 compression profile (gzip 9,
// Brotli 11, one-shot per file), so the realized number is directly
// comparable to minwind's projected upper bound.

export interface SiteSizes extends FileSizes {
  files: number;
}

export function measureSiteSizes(buildDir: string): SiteSizes {
  const files = enumerateBuildFiles(buildDir).filter(function (file) {
    const ext = path.extname(file).toLowerCase();
    return ext === ".html" || ext === ".css";
  });
  const total: SiteSizes = {
    files: files.length,
    rawBytes: 0,
    gzipBytes: 0,
    brotliBytes: 0,
  };
  for (const file of files) {
    const sizes = compressSizes(fs.readFileSync(file, "utf8"));
    total.rawBytes += sizes.rawBytes;
    total.gzipBytes += sizes.gzipBytes;
    total.brotliBytes += sizes.brotliBytes;
  }
  return total;
}
