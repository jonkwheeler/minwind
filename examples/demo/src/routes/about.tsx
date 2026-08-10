import { A } from "@solidjs/router";
import { createSignal } from "solid-js";

export default function About() {
  const [pinned, setPinned] = createSignal(false);
  return (
    <section>
      <h1 class="mb-2 text-3xl font-bold tracking-tight">About the demo</h1>
      <p class="mb-6 max-w-prose leading-7 opacity-80">
        Two routes, twelve cards, one theme toggle — small enough to read, real
        enough to exercise SSR, hydration, and prerendering.
      </p>
      <p
        classList={{
          "demo-note": true,
          "mb-6": true,
          "max-w-prose": true,
          "leading-7": true,
          "font-semibold": pinned(),
        }}
      >
        This paragraph is styled through a classList object. The static keys
        rename; the conditional key is a dynamic group, so its tokens are
        renamed but never consolidated.
      </p>
      <button
        class="mb-8 rounded-lg border border-ink/10 px-3 py-1 text-sm hover:border-accent"
        onClick={() => setPinned(!pinned())}
      >
        toggle emphasis
      </button>
      {/* Written twice in source (also on every card): the consolidation
          pass folds this list into a single shared rule. */}
      <div class="mt-1 flex items-center gap-2 text-xs opacity-60">
        <span class="select-none pointer-events-none">
          rendered twice in source, consolidated once
        </span>
      </div>
      <p class="max-w-prose leading-7 opacity-80">
        Back to{" "}
        <A href="/" class="underline underline-offset-4">
          the cards
        </A>
        .
      </p>
    </section>
  );
}
