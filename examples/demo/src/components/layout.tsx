import { A } from '@solidjs/router'
import type { ParentProps } from 'solid-js'

function toggleTheme() {
  // Runtime-only class: 'dark' never appears in a static class attribute,
  // so minwind's pre-pass excludes it (runtime-context) and the toggle
  // keeps working against the renamed stylesheet.
  document.documentElement.classList.toggle('dark')
}

export function Layout(props: ParentProps) {
  return (
    <div class="mx-auto flex min-h-screen max-w-3xl flex-col px-6">
      <header class="flex items-center justify-between border-b border-ink/10 py-6">
        <A
          href="/"
          class="text-lg font-bold tracking-tight underline-offset-4 transition duration-150 hover:border-accent"
        >
          minwind demo
        </A>
        <nav class="flex items-center gap-5 text-sm font-medium">
          <A
            href="/about"
            class="underline-offset-4 transition duration-150 hover:underline"
          >
            about
          </A>
        </nav>
      </header>
      <main class="flex-1 py-8">{props.children}</main>
      <footer class="mt-8 flex items-center justify-between border-t border-ink/10 py-6 text-sm opacity-70">
        <span class="tracking-tight">classname compression, dogfooded</span>
        <button
          class="rounded-md px-2 py-1 transition duration-150 hover:opacity-80"
          onClick={toggleTheme}
        >
          toggle theme
        </button>
      </footer>
    </div>
  )
}
