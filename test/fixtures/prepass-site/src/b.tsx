export function runtimeClasses(el: HTMLElement): void {
  el.classList.add('dissolve-reduced')
  el.className = 'js-assigned'
}

export function Footer() {
  return (
    <footer>
      <p class="items-center p-4 flex">footer</p>
      <p class="ghost-token">ghost</p>
      <ul class="flex-col space-y-4">first</ul>
    </footer>
  )
}
