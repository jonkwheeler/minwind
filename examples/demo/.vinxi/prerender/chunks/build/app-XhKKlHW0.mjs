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

const T = (t) => (n) => {
  const { base: a } = n, r = children(() => n.children), e = createMemo(() => qe(r(), n.base || ""));
  let i;
  const u = He(t, e, () => i, { base: a, singleFlight: n.singleFlight, transformUrl: n.transformUrl });
  return t.create && t.create(u), createComponent(Oe.Provider, { value: u, get children() {
    return createComponent(rt, { routerState: u, get root() {
      return n.root;
    }, get preload() {
      return n.rootPreload || n.rootLoad;
    }, get children() {
      return [(i = getOwner()) && null, createComponent(at, { routerState: u, get branches() {
        return e();
      } })];
    } });
  } });
};
function rt(t) {
  const n = t.routerState.location, a = t.routerState.params, r = createMemo(() => t.preload && untrack(() => {
    t.preload({ params: a, location: n, intent: ze() || "initial" });
  }));
  return createComponent(Show, { get when() {
    return t.root;
  }, keyed: true, get fallback() {
    return t.children;
  }, children: (e) => createComponent(e, { params: a, location: n, get data() {
    return r();
  }, get children() {
    return t.children;
  } }) });
}
function at(t) {
  if (isServer) {
    const e = getRequestEvent();
    if (e && e.router && e.router.dataOnly) {
      ot(e, t.routerState, t.branches);
      return;
    }
    e && ((e.router || (e.router = {})).matches || (e.router.matches = t.routerState.matches().map(({ route: i, path: u, params: f }) => ({ path: i.originalPath, pattern: i.pattern, match: u, params: f, info: i.info }))));
  }
  const n = [];
  let a;
  const r = createMemo(on(t.routerState.matches, (e, i, u) => {
    let f = i && e.length === i.length;
    const m = [];
    for (let l = 0, w = e.length; l < w; l++) {
      const b = i && i[l], g = e[l];
      u && b && g.route.key === b.route.key ? m[l] = u[l] : (f = false, n[l] && n[l](), createRoot((y) => {
        n[l] = y, m[l] = Ke(t.routerState, m[l - 1] || t.routerState.base, O(() => r()[l + 1]), () => {
          var _a;
          const p = t.routerState.matches();
          return (_a = p[l]) != null ? _a : p[0];
        });
      }));
    }
    return n.splice(e.length).forEach((l) => l()), u && f ? u : (a = m[0], m);
  }));
  return O(() => r() && a)();
}
const O = (t) => () => createComponent(Show, { get when() {
  return t();
}, keyed: true, children: (n) => createComponent(ee.Provider, { value: n, get children() {
  return n.outlet();
} }) });
function ot(t, n, a) {
  const r = new URL(t.request.url), e = q(a, new URL(t.router.previousUrl || t.request.url).pathname), i = q(a, r.pathname);
  for (let u = 0; u < i.length; u++) {
    (!e[u] || i[u].route !== e[u].route) && (t.router.dataOnly = true);
    const { route: f, params: m } = i[u];
    f.preload && f.preload({ params: m, location: n.location, intent: "preload" });
  }
}
function st([t, n], a, r) {
  return [t, r ? (e) => n(r(e)) : n];
}
function it(t) {
  let n = false;
  const a = (e) => typeof e == "string" ? { value: e } : e, r = st(createSignal(a(t.get()), { equals: (e, i) => e.value === i.value && e.state === i.state }), void 0, (e) => (!n && t.set(e), sharedConfig.registry && !sharedConfig.done && (sharedConfig.done = true), e));
  return t.init && onCleanup(t.init((e = t.get()) => {
    n = true, r[1](a(e)), n = false;
  })), T({ signal: r, create: t.create, utils: t.utils });
}
function ut(t, n, a) {
  return t.addEventListener(n, a), () => t.removeEventListener(n, a);
}
function ct(t, n) {
  const a = t && document.getElementById(t);
  a ? a.scrollIntoView() : n && window.scrollTo(0, 0);
}
function lt(t) {
  const n = new URL(t);
  return n.pathname + n.search;
}
function dt(t) {
  let n;
  const a = { value: t.url || (n = getRequestEvent()) && lt(n.request.url) || "" };
  return T({ signal: [() => a, (r) => Object.assign(a, r)] })(t);
}
const ht = /* @__PURE__ */ new Map();
function mt(t = true, n = false, a = "/_server", r) {
  return (e) => {
    const i = e.base.path(), u = e.navigatorFactory(e.base);
    let f, m;
    function l(o) {
      return o.namespaceURI === "http://www.w3.org/2000/svg";
    }
    function w(o) {
      if (o.defaultPrevented || o.button !== 0 || o.metaKey || o.altKey || o.ctrlKey || o.shiftKey) return;
      const s = o.composedPath().find((k) => k instanceof Node && k.nodeName.toUpperCase() === "A");
      if (!s || n && !s.hasAttribute("link")) return;
      const d = l(s), c = d ? s.href.baseVal : s.href;
      if ((d ? s.target.baseVal : s.target) || !c && !s.hasAttribute("state")) return;
      const v = (s.getAttribute("rel") || "").split(/\s+/);
      if (s.hasAttribute("download") || v && v.includes("external")) return;
      const R = d ? new URL(c, document.baseURI) : new URL(c);
      if (!(R.origin !== window.location.origin || i && R.pathname && !R.pathname.toLowerCase().startsWith(i.toLowerCase()))) return [s, R];
    }
    function b(o) {
      const s = w(o);
      if (!s) return;
      const [d, c] = s, E = e.parsePath(c.pathname + c.search + c.hash), v = d.getAttribute("state");
      o.preventDefault(), u(E, { resolve: false, replace: d.hasAttribute("replace"), scroll: !d.hasAttribute("noscroll"), state: v ? JSON.parse(v) : void 0 });
    }
    function g(o) {
      const s = w(o);
      if (!s) return;
      const [d, c] = s;
      r && (c.pathname = r(c.pathname)), e.preloadRoute(c, d.getAttribute("preload") !== "false");
    }
    function y(o) {
      clearTimeout(f);
      const s = w(o);
      if (!s) return m = null;
      const [d, c] = s;
      m !== d && (r && (c.pathname = r(c.pathname)), f = setTimeout(() => {
        e.preloadRoute(c, d.getAttribute("preload") !== "false"), m = d;
      }, 20));
    }
    function p(o) {
      if (o.defaultPrevented) return;
      let s = o.submitter && o.submitter.hasAttribute("formaction") ? o.submitter.getAttribute("formaction") : o.target.getAttribute("action");
      if (!s) return;
      if (!s.startsWith("https://action/")) {
        const c = new URL(s, Ce);
        if (s = e.parsePath(c.pathname + c.search), !s.startsWith(a)) return;
      }
      if (o.target.method.toUpperCase() !== "POST") throw new Error("Only POST forms are supported for Actions");
      const d = ht.get(s);
      if (d) {
        o.preventDefault();
        const c = new FormData(o.target, o.submitter);
        d.call({ r: e, f: o.target }, o.target.enctype === "multipart/form-data" ? c : new URLSearchParams(c));
      }
    }
    delegateEvents(["click", "submit"]), document.addEventListener("click", b), t && (document.addEventListener("mousemove", y, { passive: true }), document.addEventListener("focusin", g, { passive: true }), document.addEventListener("touchstart", g, { passive: true })), document.addEventListener("submit", p), onCleanup(() => {
      document.removeEventListener("click", b), t && (document.removeEventListener("mousemove", y), document.removeEventListener("focusin", g), document.removeEventListener("touchstart", g)), document.removeEventListener("submit", p);
    });
  };
}
function ft(t) {
  if (isServer) return dt(t);
  const n = () => {
    const r = window.location.pathname.replace(/^\/+/, "/") + window.location.search, e = window.history.state && window.history.state._depth && Object.keys(window.history.state).length === 1 ? void 0 : window.history.state;
    return { value: r + window.location.hash, state: e };
  }, a = Pe();
  return it({ get: n, set({ value: r, replace: e, scroll: i, state: u }) {
    e ? window.history.replaceState(De(u), "", r) : window.history.pushState(u, "", r), ct(decodeURIComponent(window.location.hash.slice(1)), i), Q();
  }, init: (r) => ut(window, "popstate", ke(r, (e) => {
    if (e) return !a.confirm(e);
    {
      const i = n();
      return !a.confirm(i.value, { state: i.state });
    }
  })), create: mt(t.preload, t.explicitLinks, t.actionBase, t.transformUrl), utils: { go: (r) => window.history.go(r), beforeLeave: a } })(t);
}
var gt = ["<div", ' class="xkzu small au6h glade byte ljaa"><header class="small bytes travel far"><!--$-->', '<!--/--><nav class="small bytes willow dog">', '</nav></header><main class="gone with">', '</main><footer class="small bytes travel breeze far dog d36c"><span>classname compression, dogfooded</span><button>toggle theme</button></footer></div>'];
function wt(t) {
  return ssr(gt, ssrHydrationKey(), escape(createComponent(Ne, { href: "/", class: "dt47 a through fox", children: "minwind demo" })), escape(createComponent(Ne, { href: "/about", class: "flag ember", children: "about" })), escape(t.children));
}
function At() {
  return createComponent(ft, { root: (t) => createComponent(wt, { get children() {
    return createComponent(Suspense, { get children() {
      return t.children;
    } });
  } }), get children() {
    return createComponent(Zo, {});
  } });
}

export { At as default };
//# sourceMappingURL=app-XhKKlHW0.mjs.map
