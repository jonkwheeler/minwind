import { A } from './a'
import { B } from './b'
import { cardClass } from './c'

// Build-only fixture: esbuild's classic JSX output references these at module
// scope so the renamed class literals survive tree-shaking. Nothing executes.
export const rendered: Array<unknown> = [A, B, cardClass]
export function App(_props: Record<string, unknown>) {
  return <div class="flex items-center p-4">{String(rendered)}</div>
}
