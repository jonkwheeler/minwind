import { createComponent, isServer, ssr, ssrHydrationKey, escape, getRequestEvent, delegateEvents } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/solid-js@1.9.14/node_modules/solid-js/web/dist/server.js';
import { Z as Zo } from '../nitro/nitro.mjs';
import { Suspense, createSignal, onCleanup, children, createMemo, getOwner, sharedConfig, untrack, Show, on, createRoot } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/solid-js@1.9.14/node_modules/solid-js/dist/server.js';
import { N as Ne, q as qe, H as He, O as Oe, C as Ce, z as ze, K as Ke, a as q, e as ee, D as De, Q, P as Pe, k as ke } from './components-CWoJdK_F.mjs';
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

const I = (t) => (n) => {
  const { base: o } = n, r = children(() => n.children), e = createMemo(() => qe(r(), n.base || ""));
  let i;
  const c = He(t, e, () => i, { base: o, singleFlight: n.singleFlight, transformUrl: n.transformUrl });
  return t.create && t.create(c), createComponent(Oe.Provider, { value: c, get children() {
    return createComponent(rt, { routerState: c, get root() {
      return n.root;
    }, get preload() {
      return n.rootPreload || n.rootLoad;
    }, get children() {
      return [(i = getOwner()) && null, createComponent(ot, { routerState: c, get branches() {
        return e();
      } })];
    } });
  } });
};
function rt(t) {
  const n = t.routerState.location, o = t.routerState.params, r = createMemo(() => t.preload && untrack(() => {
    t.preload({ params: o, location: n, intent: ze() || "initial" });
  }));
  return createComponent(Show, { get when() {
    return t.root;
  }, keyed: true, get fallback() {
    return t.children;
  }, children: (e) => createComponent(e, { params: o, location: n, get data() {
    return r();
  }, get children() {
    return t.children;
  } }) });
}
function ot(t) {
  if (isServer) {
    const e = getRequestEvent();
    if (e && e.router && e.router.dataOnly) {
      at(e, t.routerState, t.branches);
      return;
    }
    e && ((e.router || (e.router = {})).matches || (e.router.matches = t.routerState.matches().map(({ route: i, path: c, params: f }) => ({ path: i.originalPath, pattern: i.pattern, match: c, params: f, info: i.info }))));
  }
  const n = [];
  let o;
  const r = createMemo(on(t.routerState.matches, (e, i, c) => {
    let f = i && e.length === i.length;
    const m = [];
    for (let l = 0, w = e.length; l < w; l++) {
      const b = i && i[l], g = e[l];
      c && b && g.route.key === b.route.key ? m[l] = c[l] : (f = false, n[l] && n[l](), createRoot((v) => {
        n[l] = v, m[l] = Ke(t.routerState, m[l - 1] || t.routerState.base, P(() => r()[l + 1]), () => {
          var _a;
          const p = t.routerState.matches();
          return (_a = p[l]) != null ? _a : p[0];
        });
      }));
    }
    return n.splice(e.length).forEach((l) => l()), c && f ? c : (o = m[0], m);
  }));
  return P(() => r() && o)();
}
const P = (t) => () => createComponent(Show, { get when() {
  return t();
}, keyed: true, children: (n) => createComponent(ee.Provider, { value: n, get children() {
  return n.outlet();
} }) });
function at(t, n, o) {
  const r = new URL(t.request.url), e = q(o, new URL(t.router.previousUrl || t.request.url).pathname), i = q(o, r.pathname);
  for (let c = 0; c < i.length; c++) {
    (!e[c] || i[c].route !== e[c].route) && (t.router.dataOnly = true);
    const { route: f, params: m } = i[c];
    f.preload && f.preload({ params: m, location: n.location, intent: "preload" });
  }
}
function st([t, n], o, r) {
  return [t, r ? (e) => n(r(e)) : n];
}
function it(t) {
  let n = false;
  const o = (e) => typeof e == "string" ? { value: e } : e, r = st(createSignal(o(t.get()), { equals: (e, i) => e.value === i.value && e.state === i.state }), void 0, (e) => (!n && t.set(e), sharedConfig.registry && !sharedConfig.done && (sharedConfig.done = true), e));
  return t.init && onCleanup(t.init((e = t.get()) => {
    n = true, r[1](o(e)), n = false;
  })), I({ signal: r, create: t.create, utils: t.utils });
}
function ct(t, n, o) {
  return t.addEventListener(n, o), () => t.removeEventListener(n, o);
}
function ut(t, n) {
  const o = t && document.getElementById(t);
  o ? o.scrollIntoView() : n && window.scrollTo(0, 0);
}
function lt(t) {
  const n = new URL(t);
  return n.pathname + n.search;
}
function dt(t) {
  let n;
  const o = { value: t.url || (n = getRequestEvent()) && lt(n.request.url) || "" };
  return I({ signal: [() => o, (r) => Object.assign(o, r)] })(t);
}
const ht = /* @__PURE__ */ new Map();
function mt(t = true, n = false, o = "/_server", r) {
  return (e) => {
    const i = e.base.path(), c = e.navigatorFactory(e.base);
    let f, m;
    function l(a) {
      return a.namespaceURI === "http://www.w3.org/2000/svg";
    }
    function w(a) {
      if (a.defaultPrevented || a.button !== 0 || a.metaKey || a.altKey || a.ctrlKey || a.shiftKey) return;
      const s = a.composedPath().find((A) => A instanceof Node && A.nodeName.toUpperCase() === "A");
      if (!s || n && !s.hasAttribute("link")) return;
      const d = l(s), u = d ? s.href.baseVal : s.href;
      if ((d ? s.target.baseVal : s.target) || !u && !s.hasAttribute("state")) return;
      const y = (s.getAttribute("rel") || "").split(/\s+/);
      if (s.hasAttribute("download") || y && y.includes("external")) return;
      const R = d ? new URL(u, document.baseURI) : new URL(u);
      if (!(R.origin !== window.location.origin || i && R.pathname && !R.pathname.toLowerCase().startsWith(i.toLowerCase()))) return [s, R];
    }
    function b(a) {
      const s = w(a);
      if (!s) return;
      const [d, u] = s, x = e.parsePath(u.pathname + u.search + u.hash), y = d.getAttribute("state");
      a.preventDefault(), c(x, { resolve: false, replace: d.hasAttribute("replace"), scroll: !d.hasAttribute("noscroll"), state: y ? JSON.parse(y) : void 0 });
    }
    function g(a) {
      const s = w(a);
      if (!s) return;
      const [d, u] = s;
      r && (u.pathname = r(u.pathname)), e.preloadRoute(u, d.getAttribute("preload") !== "false");
    }
    function v(a) {
      clearTimeout(f);
      const s = w(a);
      if (!s) return m = null;
      const [d, u] = s;
      m !== d && (r && (u.pathname = r(u.pathname)), f = setTimeout(() => {
        e.preloadRoute(u, d.getAttribute("preload") !== "false"), m = d;
      }, 20));
    }
    function p(a) {
      if (a.defaultPrevented) return;
      let s = a.submitter && a.submitter.hasAttribute("formaction") ? a.submitter.getAttribute("formaction") : a.target.getAttribute("action");
      if (!s) return;
      if (!s.startsWith("https://action/")) {
        const u = new URL(s, Ce);
        if (s = e.parsePath(u.pathname + u.search), !s.startsWith(o)) return;
      }
      if (a.target.method.toUpperCase() !== "POST") throw new Error("Only POST forms are supported for Actions");
      const d = ht.get(s);
      if (d) {
        a.preventDefault();
        const u = new FormData(a.target, a.submitter);
        d.call({ r: e, f: a.target }, a.target.enctype === "multipart/form-data" ? u : new URLSearchParams(u));
      }
    }
    delegateEvents(["click", "submit"]), document.addEventListener("click", b), t && (document.addEventListener("mousemove", v, { passive: true }), document.addEventListener("focusin", g, { passive: true }), document.addEventListener("touchstart", g, { passive: true })), document.addEventListener("submit", p), onCleanup(() => {
      document.removeEventListener("click", b), t && (document.removeEventListener("mousemove", v), document.removeEventListener("focusin", g), document.removeEventListener("touchstart", g)), document.removeEventListener("submit", p);
    });
  };
}
function ft(t) {
  if (isServer) return dt(t);
  const n = () => {
    const r = window.location.pathname.replace(/^\/+/, "/") + window.location.search, e = window.history.state && window.history.state._depth && Object.keys(window.history.state).length === 1 ? void 0 : window.history.state;
    return { value: r + window.location.hash, state: e };
  }, o = Pe();
  return it({ get: n, set({ value: r, replace: e, scroll: i, state: c }) {
    e ? window.history.replaceState(De(c), "", r) : window.history.pushState(c, "", r), ut(decodeURIComponent(window.location.hash.slice(1)), i), Q();
  }, init: (r) => ct(window, "popstate", ke(r, (e) => {
    if (e) return !o.confirm(e);
    {
      const i = n();
      return !o.confirm(i.value, { state: i.state });
    }
  })), create: mt(t.preload, t.explicitLinks, t.actionBase, t.transformUrl), utils: { go: (r) => window.history.go(r), beforeLeave: o } })(t);
}
var gt = ["<div", ' class="mx-auto flex min-h-screen max-w-3xl flex-col px-6"><header class="flex items-center justify-between border-b border-ink/10 py-6"><!--$-->', '<!--/--><nav class="flex items-center gap-5 text-sm font-medium">', '</nav></header><main class="flex-1 py-8">', '</main><footer class="mt-8 flex items-center justify-between border-t border-ink/10 py-6 text-sm opacity-70"><span class="tracking-tight">classname compression, dogfooded</span><button class="rounded-md px-2 py-1 transition duration-150 hover:opacity-80">toggle theme</button></footer></div>'];
function wt(t) {
  return ssr(gt, ssrHydrationKey(), escape(createComponent(Ne, { href: "/", class: "text-lg font-bold tracking-tight underline-offset-4 transition duration-150 hover:border-accent", children: "minwind demo" })), escape(createComponent(Ne, { href: "/about", class: "underline-offset-4 transition duration-150 hover:underline", children: "about" })), escape(t.children));
}
function kt() {
  return createComponent(ft, { root: (t) => createComponent(wt, { get children() {
    return createComponent(Suspense, { get children() {
      return t.children;
    } });
  } }), get children() {
    return createComponent(Zo, {});
  } });
}

export { kt as default };
//# sourceMappingURL=app-BzBRgGva.mjs.map
