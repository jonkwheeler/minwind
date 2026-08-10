import { Buffer } from "node:buffer";
import { PNG } from "pngjs";

// Comparison primitives (R6, R7; KTD8). Per-element computed-style equality
// is the primary tier: deterministic, and a mismatch names the offending
// property. Screenshot comparison at a small tolerance is the secondary
// tier, decoded with pngjs so the harness needs no test-runner dependency.

export interface ElementSnapshot {
  tag: string;
  // null when the element has no class attribute at all.
  classLength: number | null;
  styles: Record<string, string>;
}

export interface StyleMismatch {
  kind: "element-count" | "tag" | "property";
  // null for the element-count mismatch, which is not tied to one element.
  elementIndex: number | null;
  property: string | null;
  off: string;
  on: string;
}

// Elements pair by DOM index (KTD8): both builds render the same document,
// so index i in the off crawl is the same element as index i in the on
// crawl. A count mismatch is reported first and the shared prefix is still
// diffed, so one inserted element does not hide property regressions.
export function diffElementSnapshots(
  off: Array<ElementSnapshot>,
  on: Array<ElementSnapshot>,
  limit = 50,
): Array<StyleMismatch> {
  const mismatches: Array<StyleMismatch> = [];

  function push(mismatch: StyleMismatch): void {
    if (mismatches.length < limit) mismatches.push(mismatch);
  }

  if (off.length !== on.length) {
    push({
      kind: "element-count",
      elementIndex: null,
      property: null,
      off: String(off.length),
      on: String(on.length),
    });
  }

  const count = Math.min(off.length, on.length);
  for (let i = 0; i < count; i++) {
    const a = off[i];
    const b = on[i];
    if (a.tag !== b.tag) {
      push({
        kind: "tag",
        elementIndex: i,
        property: null,
        off: a.tag,
        on: b.tag,
      });
      continue;
    }
    const properties = new Set([
      ...Object.keys(a.styles),
      ...Object.keys(b.styles),
    ]);
    for (const property of properties) {
      const offValue = a.styles[property] ?? "";
      const onValue = b.styles[property] ?? "";
      if (offValue !== onValue) {
        push({
          kind: "property",
          elementIndex: i,
          property,
          off: offValue,
          on: onValue,
        });
      }
    }
  }
  return mismatches;
}

export interface ScreenshotTolerance {
  // A pixel counts as different when any single channel differs by more.
  channelThreshold: number;
  // The tier passes when differentPixels / totalPixels <= maxRatio.
  maxRatio: number;
}

export const DEFAULT_SCREENSHOT_TOLERANCE: ScreenshotTolerance = {
  channelThreshold: 8,
  maxRatio: 0.001,
};

export interface ScreenshotDiff {
  dimensionsMatch: boolean;
  width: number;
  height: number;
  totalPixels: number;
  differentPixels: number;
  ratio: number;
  passed: boolean;
}

export function diffScreenshots(
  offPng: Buffer,
  onPng: Buffer,
  tolerance: ScreenshotTolerance = DEFAULT_SCREENSHOT_TOLERANCE,
): ScreenshotDiff {
  const off = PNG.sync.read(offPng);
  const on = PNG.sync.read(onPng);
  if (off.width !== on.width || off.height !== on.height) {
    return {
      dimensionsMatch: false,
      width: off.width,
      height: off.height,
      totalPixels: off.width * off.height,
      differentPixels: off.width * off.height,
      ratio: 1,
      passed: false,
    };
  }
  let differentPixels = 0;
  const totalPixels = off.width * off.height;
  for (let i = 0; i < off.data.length; i += 4) {
    if (
      Math.abs(off.data[i] - on.data[i]) > tolerance.channelThreshold ||
      Math.abs(off.data[i + 1] - on.data[i + 1]) > tolerance.channelThreshold ||
      Math.abs(off.data[i + 2] - on.data[i + 2]) > tolerance.channelThreshold ||
      Math.abs(off.data[i + 3] - on.data[i + 3]) > tolerance.channelThreshold
    ) {
      differentPixels += 1;
    }
  }
  const ratio = totalPixels === 0 ? 0 : differentPixels / totalPixels;
  return {
    dimensionsMatch: true,
    width: off.width,
    height: off.height,
    totalPixels,
    differentPixels,
    ratio,
    passed: ratio <= tolerance.maxRatio,
  };
}

export function median(values: Array<number>): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort(function (a, b) {
    return a - b;
  });
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}
