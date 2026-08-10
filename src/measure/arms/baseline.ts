import type { ArmResult, SimulationInput } from '../span-edit.js'
import { buildArmResult } from '../span-edit.js'

// Baseline is the identity transform over the original bytes of every
// discovered HTML and CSS file (KTD2's byte-equality anchor, R3).
export function simulateBaseline(input: SimulationInput): ArmResult {
  const files = new Map<string, string>([
    ...input.htmlSources,
    ...input.cssSources,
  ])
  return buildArmResult('baseline', input, files, {})
}
