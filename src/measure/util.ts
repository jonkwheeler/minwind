import path from 'node:path'

export interface SourceSpan {
  start: number
  end: number
}

// Code-unit comparison, never locale-sensitive: determinism (R10) requires
// identical ordering on every runtime and locale.
export function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function relativeToBuild(buildDir: string, file: string): string {
  return path.relative(buildDir, file)
}
