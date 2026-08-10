export function Poisoned(props: { extra: string }) {
  return (
    <div>
      <p class={`mb-4 ${props.extra}`}>poisoned</p>
      <button class="mb-2 focus:underline">one</button>
      <button class="focus:underline mb-2">two</button>
      <ul class="space-y-4 flex-col">second</ul>
    </div>
  );
}
