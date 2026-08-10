import { ssr, ssrHydrationKey, escape, createComponent } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/solid-js@1.9.14/node_modules/solid-js/web/dist/server.js';
import { createSignal } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/solid-js@1.9.14/node_modules/solid-js/dist/server.js';
import { N as Ne } from '../nitro/nitro.mjs';
import 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/destr@2.0.5/node_modules/destr/dist/index.mjs';
import 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/h3@1.15.11/node_modules/h3/dist/index.mjs';
import 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/hookable@5.5.3/node_modules/hookable/dist/index.mjs';
import 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/ofetch@1.5.1/node_modules/ofetch/dist/node.mjs';
import 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/node-mock-http@1.0.5/node_modules/node-mock-http/dist/index.mjs';
import 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/ufo@1.6.4/node_modules/ufo/dist/index.mjs';
import 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/unstorage@1.17.5_db0@0.3.4_ioredis@5.11.1/node_modules/unstorage/dist/index.mjs';
import 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/unstorage@1.17.5_db0@0.3.4_ioredis@5.11.1/node_modules/unstorage/drivers/fs.mjs';
import 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/unstorage@1.17.5_db0@0.3.4_ioredis@5.11.1/node_modules/unstorage/drivers/fs-lite.mjs';
import 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/ohash@2.0.11/node_modules/ohash/dist/index.mjs';
import 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/klona@2.0.6/node_modules/klona/dist/index.mjs';
import 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/defu@6.1.7/node_modules/defu/dist/defu.mjs';
import 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/scule@1.3.0/node_modules/scule/dist/index.mjs';
import 'node:async_hooks';
import 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/unctx@2.5.0/node_modules/unctx/dist/index.mjs';
import 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/radix3@1.1.2/node_modules/radix3/dist/index.mjs';
import 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/vinxi@0.5.11_@parcel+watcher@2.6.0_@types+node@22.20.1_db0@0.3.4_ioredis@5.11.1_jiti@2.7.0_li_si6oooeinf43khxkjeu4hz52wu/node_modules/vinxi/lib/app-fetch.js';
import 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/vinxi@0.5.11_@parcel+watcher@2.6.0_@types+node@22.20.1_db0@0.3.4_ioredis@5.11.1_jiti@2.7.0_li_si6oooeinf43khxkjeu4hz52wu/node_modules/vinxi/lib/app-manifest.js';
import 'node:fs';
import 'node:url';
import 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/pathe@2.0.3/node_modules/pathe/dist/index.mjs';
import 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/solid-js@1.9.14/node_modules/solid-js/web/storage/dist/storage.js';

var i = ["<section", '><h1 class="small bytes travel far">About the demo</h1><p class="marsh and sail ride">Two routes, twelve cards, one theme toggle \u2014 small enough to read, real enough to exercise SSR, hydration, and prerendering.</p><p class="', '">This paragraph is styled through a classList object. The static keys rename; the conditional key is a dynamic group, so its tokens are renamed but never consolidated.</p><button class="quick brown fox jumps over the lazy dog">toggle emphasis</button><div class="otter willow glen mist fcge ridge"><span class="ckqw">rendered twice in source, consolidated once</span></div><p class="sail and ride">Back to <!--$-->', "<!--/-->.</p></section>"];
function h() {
  const [e, l] = createSignal(false);
  return ssr(i, ssrHydrationKey(), `byte  marsh  and  sail ${e() ? "glade" : ""}`, escape(createComponent(Ne, { href: "/", class: "sb7x flag", children: "the cards" })));
}

export { h as default };
//# sourceMappingURL=about2.mjs.map
