import { cn } from '../lib/cn'

export interface CardProps {
  title: string
  blurb: string
  featured?: boolean
}

// The article's static eleven-token list repeats for every card, so the
// consolidation pass folds it into a single utility class. The badge's
// cn() call is a dynamic group: renamed, never consolidated (R3).
export function Card(props: CardProps) {
  return (
    <article class="relative isolate flex flex-col gap-2 overflow-hidden rounded-xl border border-ink/10 bg-white p-5 shadow-sm outline-none transition duration-150 ease-in-out hover:border-accent hover:shadow-md">
      <h2 class="text-base font-semibold tracking-tight text-ink">
        {props.title}
      </h2>
      <p class="flex-1 text-pretty text-sm leading-6 opacity-80">
        {props.blurb}
      </p>
      <div class="mt-1 flex items-center gap-2 text-xs opacity-60">
        <span class="select-none pointer-events-none">
          <span
            class={cn(
              'uppercase tracking-wide',
              props.featured === true && 'font-bold text-accent',
            )}
          >
            {props.featured === true ? 'featured' : 'entry'}
          </span>
        </span>
      </div>
    </article>
  )
}
