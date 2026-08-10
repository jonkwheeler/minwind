#!/usr/bin/env node
import process from 'node:process'
import { runMeasureCli } from './measure/cli.js'
import { runReportCli } from './report-cli.js'

// The minwind bin. The package's center of gravity is the Vite plugin; the
// CLI carries the two read-only companions: `measure` projects the savings
// on an existing build (run it before installing the plugin), and `report`
// summarizes the report.json the plugin writes into the build output.

const USAGE = `Usage: minwind <command> [options]

Commands:
  measure <build-output-directory>  Project Tailwind classname-compression
                                    savings (gzip/Brotli) on an existing
                                    production build. Read-only.
  report [path-to-report.json]      Summarize the latest minwind build report
                                    (default .output/minwind/report.json)
`

async function main(): Promise<number> {
  const command = process.argv[2]
  const rest = process.argv.slice(3)
  if (command === 'measure') return runMeasureCli(rest)
  if (command === 'report') return runReportCli(rest)
  if (command === undefined || command === '--help' || command === '-h') {
    process.stdout.write(USAGE)
    return command === undefined ? 1 : 0
  }
  process.stderr.write(`Error: unknown command "${command}"\n\n${USAGE}`)
  return 1
}

process.exitCode = await main()
