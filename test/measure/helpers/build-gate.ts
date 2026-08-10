import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const HELPERS_DIR = path.dirname(fileURLToPath(import.meta.url))

// The real-build tests run against the demo site's UNRENAMED prerender
// output: `MINWIND=off pnpm build` in examples/demo. Measuring the renamed
// output would project ~0 savings — the classes are already short.
export const BUILD_DIR = path.resolve(
  HELPERS_DIR,
  '../../../examples/demo/.output/public',
)
export const SKIP_BUILD_ENV = 'MINWIND_SKIP_BUILD'

const MISSING_BUILD_MESSAGE =
  `demo build not found at ${BUILD_DIR}: build-dependent tests would pass ` +
  `without verifying anything. Build the demo with "MINWIND=off pnpm build" ` +
  `in examples/demo, or set ${SKIP_BUILD_ENV}=1 to skip these tests ` +
  `deliberately.`

const SKIP_REASON =
  `demo build missing; skipped deliberately via ${SKIP_BUILD_ENV}=1 ` +
  '(this run did not verify the real build)'

export function buildMissing(): boolean {
  return !fs.existsSync(BUILD_DIR)
}

// Pair with assertDemoBuild() as the first statement of the gated test: when
// the demo build is absent without MINWIND_SKIP_BUILD=1 the test must still
// run so the assert can fail it loudly instead of silently skipping.
export function buildGate(): { skip: boolean | string } {
  if (!buildMissing()) return { skip: false }
  if (process.env[SKIP_BUILD_ENV] === '1') return { skip: SKIP_REASON }
  return { skip: false }
}

export function assertDemoBuild(): void {
  if (buildMissing() && process.env[SKIP_BUILD_ENV] !== '1') {
    assert.fail(MISSING_BUILD_MESSAGE)
  }
}
