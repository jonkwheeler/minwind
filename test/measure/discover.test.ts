import assert from 'node:assert'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(TEST_DIR, 'fixtures')
const CLI_PATH = path.resolve(TEST_DIR, '../../src/measure/cli.ts')

interface RunResult {
  code: number
  stdout: string
  stderr: string
}

async function runCli(args: Array<string>): Promise<RunResult> {
  try {
    const result = await execFileAsync('pnpm', ['tsx', CLI_PATH, ...args], {
      cwd: path.resolve(TEST_DIR, '../..'),
    })
    return { code: 0, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const err = error as {
      code?: number
      stdout?: string
      stderr?: string
    }
    return {
      code: typeof err.code === 'number' ? err.code : -1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    }
  }
}

describe('cli usage', () => {
  it('exits 1 with usage on stderr when no directory argument', async () => {
    const result = await runCli([])
    assert.strictEqual(result.code, 1)
    assert.match(result.stderr, /usage/i)
  })

  it('exits 1 with usage on stderr for a nonexistent path', async () => {
    const result = await runCli(['does-not-exist'])
    assert.strictEqual(result.code, 1)
    assert.match(result.stderr, /usage/i)
  })
})

describe('zero report', () => {
  it('exits 0 and prints the zero-report for a directory with no HTML', async () => {
    const result = await runCli([path.join(FIXTURES_DIR, 'empty')])
    assert.strictEqual(result.code, 0)
    assert.match(result.stdout, /no compressible tailwind classes found/i)
  })
})

describe('enumeration', () => {
  // The site fixture's stylesheet has no @layer utilities, so every run
  // aborts at the U4 qualification gate (exit 1) after printing discovery.
  it('skips dot-directories, .DS_Store, _headers, _redirects, and .vite/', async () => {
    const result = await runCli([path.join(FIXTURES_DIR, 'site')])
    assert.strictEqual(result.code, 1)
    assert.doesNotMatch(result.stdout, /\.hidden/)
    assert.doesNotMatch(result.stdout, /secret\.html/)
    assert.doesNotMatch(result.stdout, /\.DS_Store/)
    assert.doesNotMatch(result.stdout, /_headers/)
    assert.doesNotMatch(result.stdout, /_redirects/)
    assert.doesNotMatch(result.stdout, /\.vite/)
    assert.doesNotMatch(result.stdout, /manifest\.json/)
  })

  it('produces identical file lists across repeated runs', async () => {
    const first = await runCli([path.join(FIXTURES_DIR, 'site')])
    const second = await runCli([path.join(FIXTURES_DIR, 'site')])
    assert.strictEqual(first.code, 1)
    assert.strictEqual(second.code, 1)
    assert.strictEqual(first.stdout, second.stdout)
  })
})

describe('stylesheet association', () => {
  it('never fetches or associates an external stylesheet link', async () => {
    const result = await runCli([path.join(FIXTURES_DIR, 'site')])
    assert.strictEqual(result.code, 1)
    assert.doesNotMatch(result.stdout, /fonts\.googleapis\.com/)
  })

  it('associates duplicate link hrefs resolving to the same file once', async () => {
    const result = await runCli([path.join(FIXTURES_DIR, 'site')])
    assert.strictEqual(result.code, 1)
    const indexBlock = / {2}index\.html:\n((?: {4}.*\n)+)/.exec(result.stdout)
    assert.ok(indexBlock, 'expected an association block for index.html')
    const matches = indexBlock[1].match(/assets\/app\.css/g) ?? []
    assert.strictEqual(matches.length, 1)
  })

  it('warns about a missing linked stylesheet, then aborts at the gate', async () => {
    const result = await runCli([path.join(FIXTURES_DIR, 'missing-css')])
    assert.strictEqual(result.code, 1)
    assert.match(result.stderr, /missing\.css/)
    assert.match(result.stderr, /no stylesheet qualifies/i)
  })

  it('warns about linked paths outside the discovered CSS set and completes', async () => {
    const result = await runCli([path.join(FIXTURES_DIR, 'undiscovered-links')])
    assert.strictEqual(result.code, 0)
    assert.match(result.stderr, /not a discovered CSS file: assets\/dir\.css/)
    assert.match(result.stderr, /not a discovered CSS file: assets\/notes\.txt/)
    assert.match(
      result.stderr,
      /not a discovered CSS file: assets\/linked\.css/,
    )
    assert.doesNotMatch(result.stdout, /dir\.css|notes\.txt|linked\.css/)
  })
})

describe('utf-8 validation', () => {
  it('aborts nonzero when a file is not valid UTF-8', async () => {
    const result = await runCli([path.join(FIXTURES_DIR, 'bad-utf8')])
    assert.notStrictEqual(result.code, 0)
    assert.match(result.stderr, /utf-?8|invalid/i)
  })
})

describe('sitemap', () => {
  it('warns naming a sitemap route with no HTML file', async () => {
    const result = await runCli([path.join(FIXTURES_DIR, 'sitemap')])
    // No stylesheet on disk, so the U4 qualification gate aborts the run.
    assert.strictEqual(result.code, 1)
    assert.match(result.stderr, /ghost-route/)
  })
})
