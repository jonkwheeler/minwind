import { ssr, ssrHydrationKey, escape, createComponent, mergeProps, ssrAttribute } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/solid-js@1.9.14/node_modules/solid-js/web/dist/server.js';
import { For } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/solid-js@1.9.14/node_modules/solid-js/dist/server.js';

function c(...e) {
  return e.filter(Boolean).join(" ");
}
var u = ["<article", ' class="cbjz fern willow ember mist vale c7t0 quick brown tail bde0 i2n7 tide leaves a trim fox cedar"><h2 class="nefr glade far ie2q">', '</h2><p class="wind qe6q dog isle ride">', '</p><div class="otter willow glen mist fcge ridge"><span class="ckqw"><span', ">", "</span></span></div></article>"];
function b(e) {
  return ssr(u, ssrHydrationKey(), escape(e.title), escape(e.blurb), ssrAttribute("class", escape(c("c11t z9tb", e.featured === true && "small urnx"), true), false), e.featured === true ? "featured" : "entry");
}
var d = ["<section", '><h1 class="small bytes travel far">Your class list is showing.</h1><p class="jumps and sail ride">minwind compresses Tailwind classnames at build time \u2014 in the markup, in the JavaScript, and in the stylesheet, together.</p><div class="every class earns its keep">', "</div></section>"];
const m = [{ title: "Rename", blurb: "Every utility class becomes a short, stable name." }, { title: "Consolidate", blurb: "Repeated class lists fold into one rule." }, { title: "Quotes", blurb: "Class lists can read as fragments of a theme." }, { title: "Proof", blurb: "Pixel-identical rendering or the build fails." }, { title: "Measure", blurb: "Project the savings before you install." }, { title: "Report", blurb: "Every exclusion is accounted for, loudly." }, { title: "Static", blurb: "Only provably static lists are transformed." }, { title: "Runtime", blurb: "Runtime-toggled classes keep their bytes." }, { title: "Variants", blurb: "hover:border-accent and friends rename too." }, { title: "Sources", blurb: "TSX, cn() calls, and classList objects." }, { title: "Stylesheets", blurb: "The emitted CSS is rewritten to match." }, { title: "Gate", blurb: "A comparison harness gates every change." }];
function p() {
  return ssr(d, ssrHydrationKey(), escape(createComponent(For, { each: m, children: (e, a) => createComponent(b, mergeProps(e, { get featured() {
    return a() === 0;
  } })) })));
}

export { p as default };
//# sourceMappingURL=index.mjs.map
