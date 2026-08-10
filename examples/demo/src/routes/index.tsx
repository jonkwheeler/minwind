import { For } from 'solid-js'
import { Card } from '../components/card'

const CARDS: Array<{ title: string; blurb: string }> = [
  { title: 'Rename', blurb: 'Every utility class becomes a short, stable name.' },
  { title: 'Consolidate', blurb: 'Repeated class lists fold into one rule.' },
  { title: 'Quotes', blurb: 'Class lists can read as fragments of a theme.' },
  { title: 'Proof', blurb: 'Pixel-identical rendering or the build fails.' },
  { title: 'Measure', blurb: 'Project the savings before you install.' },
  { title: 'Report', blurb: 'Every exclusion is accounted for, loudly.' },
  { title: 'Static', blurb: 'Only provably static lists are transformed.' },
  { title: 'Runtime', blurb: 'Runtime-toggled classes keep their bytes.' },
  { title: 'Variants', blurb: 'hover:border-accent and friends rename too.' },
  { title: 'Sources', blurb: 'TSX, cn() calls, and classList objects.' },
  { title: 'Stylesheets', blurb: 'The emitted CSS is rewritten to match.' },
  { title: 'Gate', blurb: 'A comparison harness gates every change.' },
]

export default function Home() {
  return (
    <section>
      <h1 class="mb-2 text-3xl font-bold tracking-tight">
        Your class list is showing.
      </h1>
      <p class="mb-8 max-w-prose leading-7 opacity-80">
        minwind compresses Tailwind classnames at build time — in the markup,
        in the JavaScript, and in the stylesheet, together.
      </p>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <For each={CARDS}>
          {(card, index) => <Card {...card} featured={index() === 0} />}
        </For>
      </div>
    </section>
  )
}
