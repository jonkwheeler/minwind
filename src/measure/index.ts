// Programmatic entry to the measurement half of minwind (the same machinery
// the `minwind measure` CLI drives): discover a build output, model its
// class usage, simulate the rename/consolidate arms, and measure the
// projected gzip/Brotli deltas.

export { simulateBaseline } from './arms/baseline.js'
export { simulateConsolidate } from './arms/consolidate.js'
export { simulateRename } from './arms/rename.js'
export { discoverBuild } from './discover.js'
export type { DiscoveredBuild } from './discover.js'
export { buildClassModel } from './exclusions.js'
export type { ClassInventoryEntry, ClassModel } from './exclusions.js'
export {
  DEFAULT_THRESHOLD_PERCENT,
  deltaPercent,
  measureBuild,
} from './measure.js'
export type { ArmResults, Measurement } from './measure.js'
export { buildSimulationInput } from './span-edit.js'
export type { ArmResult, SimulationInput } from './span-edit.js'
