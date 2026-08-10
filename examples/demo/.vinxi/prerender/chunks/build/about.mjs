import { ssr, ssrHydrationKey, escape, createComponent } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/solid-js@1.9.14/node_modules/solid-js/web/dist/server.js';
import { createSignal } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/solid-js@1.9.14/node_modules/solid-js/dist/server.js';
import { N as Ne } from './components-CWoJdK_F.mjs';

var i = ["<section", '><h1 class="small bytes travel far">About the demo</h1><p class="marsh and sail ride">Two routes, twelve cards, one theme toggle \u2014 small enough to read, real enough to exercise SSR, hydration, and prerendering.</p><p class="', '">This paragraph is styled through a classList object. The static keys rename; the conditional key is a dynamic group, so its tokens are renamed but never consolidated.</p><button class="quick brown fox jumps over the lazy dog">toggle emphasis</button><div class="otter willow glen mist fcge ridge"><span class="ckqw">rendered twice in source, consolidated once</span></div><p class="sail and ride">Back to <!--$-->', "<!--/-->.</p></section>"];
function h() {
  const [e, l] = createSignal(false);
  return ssr(i, ssrHydrationKey(), `byte  marsh  and  sail ${e() ? "glade" : ""}`, escape(createComponent(Ne, { href: "/", class: "sb7x flag", children: "the cards" })));
}

export { h as default };
//# sourceMappingURL=about.mjs.map
