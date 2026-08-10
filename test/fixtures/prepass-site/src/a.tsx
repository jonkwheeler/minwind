import { cn } from './cn'

export function Card() {
  return (
    <div class="flex items-center p-4">
      <p class={cn('fade-in', 'site-card')}>alpha</p>
      <span classList={{ 'mb-4': true }}>beta</span>
    </div>
  )
}
