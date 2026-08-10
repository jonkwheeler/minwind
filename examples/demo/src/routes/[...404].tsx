import { A } from "@solidjs/router";

export default function NotFound() {
  return (
    <section class="py-16 text-center">
      <h1 class="mb-2 text-4xl font-bold tracking-tight">404</h1>
      <p class="mb-6 opacity-80">This route blew away in the wind.</p>
      <A href="/" class="underline underline-offset-4 hover:border-accent">
        back home
      </A>
    </section>
  );
}
