// Source for out/: the pre-pass scans this file, and out/ is what a build
// would emit from it. min-h-screen sits on the first class-bearing element
// but appears in one list, so the length-weighted deal gives the shortest
// word to flex (four lists) unless prominence ranks the shell first.
export function Page() {
  return (
    <main class="min-h-screen">
      <h1 class="sr-only">Inbox</h1>
      <ul class="flex flex-col">
        <li class="flex items-center p-4">One</li>
        <li class="flex items-center p-4">Two</li>
        <li class="flex items-center p-4">Three</li>
      </ul>
    </main>
  );
}
