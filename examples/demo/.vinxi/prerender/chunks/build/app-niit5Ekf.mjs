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

const T = (t) => (r) => {
  const { base: a } = r, n = children(() => r.children), e = createMemo(() => qe(n(), r.base || ""));
  let i;
  const c = He(t, e, () => i, { base: a, singleFlight: r.singleFlight, transformUrl: r.transformUrl });
  return t.create && t.create(c), createComponent(Oe.Provider, { value: c, get children() {
    return createComponent(nt, { routerState: c, get root() {
      return r.root;
    }, get preload() {
      return r.rootPreload || r.rootLoad;
    }, get children() {
      return [(i = getOwner()) && null, createComponent(at, { routerState: c, get branches() {
        return e();
      } })];
    } });
  } });
};
function nt(t) {
  const r = t.routerState.location, a = t.routerState.params, n = createMemo(() => t.preload && untrack(() => {
    t.preload({ params: a, location: r, intent: ze() || "initial" });
  }));
  return createComponent(Show, { get when() {
    return t.root;
  }, keyed: true, get fallback() {
    return t.children;
  }, children: (e) => createComponent(e, { params: a, location: r, get data() {
    return n();
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
    e && ((e.router || (e.router = {})).matches || (e.router.matches = t.routerState.matches().map(({ route: i, path: c, params: f }) => ({ path: i.originalPath, pattern: i.pattern, match: c, params: f, info: i.info }))));
  }
  const r = [];
  let a;
  const n = createMemo(on(t.routerState.matches, (e, i, c) => {
    let f = i && e.length === i.length;
    const m = [];
    for (let l = 0, w = e.length; l < w; l++) {
      const b = i && i[l], g = e[l];
      c && b && g.route.key === b.route.key ? m[l] = c[l] : (f = false, r[l] && r[l](), createRoot((y) => {
        r[l] = y, m[l] = Ke(t.routerState, m[l - 1] || t.routerState.base, O(() => n()[l + 1]), () => {
          var _a;
          const p = t.routerState.matches();
          return (_a = p[l]) != null ? _a : p[0];
        });
      }));
    }
    return r.splice(e.length).forEach((l) => l()), c && f ? c : (a = m[0], m);
  }));
  return O(() => n() && a)();
}
const O = (t) => () => createComponent(Show, { get when() {
  return t();
}, keyed: true, children: (r) => createComponent(ee.Provider, { value: r, get children() {
  return r.outlet();
} }) });
function ot(t, r, a) {
  const n = new URL(t.request.url), e = q(a, new URL(t.router.previousUrl || t.request.url).pathname), i = q(a, n.pathname);
  for (let c = 0; c < i.length; c++) {
    (!e[c] || i[c].route !== e[c].route) && (t.router.dataOnly = true);
    const { route: f, params: m } = i[c];
    f.preload && f.preload({ params: m, location: r.location, intent: "preload" });
  }
}
function st([t, r], a, n) {
  return [t, n ? (e) => r(n(e)) : r];
}
function it(t) {
  let r = false;
  const a = (e) => typeof e == "string" ? { value: e } : e, n = st(createSignal(a(t.get()), { equals: (e, i) => e.value === i.value && e.state === i.state }), void 0, (e) => (!r && t.set(e), sharedConfig.registry && !sharedConfig.done && (sharedConfig.done = true), e));
  return t.init && onCleanup(t.init((e = t.get()) => {
    r = true, n[1](a(e)), r = false;
  })), T({ signal: n, create: t.create, utils: t.utils });
}
function ct(t, r, a) {
  return t.addEventListener(r, a), () => t.removeEventListener(r, a);
}
function ut(t, r) {
  const a = t && document.getElementById(t);
  a ? a.scrollIntoView() : r && window.scrollTo(0, 0);
}
function lt(t) {
  const r = new URL(t);
  return r.pathname + r.search;
}
function dt(t) {
  let r;
  const a = { value: t.url || (r = getRequestEvent()) && lt(r.request.url) || "" };
  return T({ signal: [() => a, (n) => Object.assign(a, n)] })(t);
}
const ht = /* @__PURE__ */ new Map();
function mt(t = true, r = false, a = "/_server", n) {
  return (e) => {
    const i = e.base.path(), c = e.navigatorFactory(e.base);
    let f, m;
    function l(o) {
      return o.namespaceURI === "http://www.w3.org/2000/svg";
    }
    function w(o) {
      if (o.defaultPrevented || o.button !== 0 || o.metaKey || o.altKey || o.ctrlKey || o.shiftKey) return;
      const s = o.composedPath().find((k) => k instanceof Node && k.nodeName.toUpperCase() === "A");
      if (!s || r && !s.hasAttribute("link")) return;
      const d = l(s), u = d ? s.href.baseVal : s.href;
      if ((d ? s.target.baseVal : s.target) || !u && !s.hasAttribute("state")) return;
      const v = (s.getAttribute("rel") || "").split(/\s+/);
      if (s.hasAttribute("download") || v && v.includes("external")) return;
      const R = d ? new URL(u, document.baseURI) : new URL(u);
      if (!(R.origin !== window.location.origin || i && R.pathname && !R.pathname.toLowerCase().startsWith(i.toLowerCase()))) return [s, R];
    }
    function b(o) {
      const s = w(o);
      if (!s) return;
      const [d, u] = s, E = e.parsePath(u.pathname + u.search + u.hash), v = d.getAttribute("state");
      o.preventDefault(), c(E, { resolve: false, replace: d.hasAttribute("replace"), scroll: !d.hasAttribute("noscroll"), state: v ? JSON.parse(v) : void 0 });
    }
    function g(o) {
      const s = w(o);
      if (!s) return;
      const [d, u] = s;
      n && (u.pathname = n(u.pathname)), e.preloadRoute(u, d.getAttribute("preload") !== "false");
    }
    function y(o) {
      clearTimeout(f);
      const s = w(o);
      if (!s) return m = null;
      const [d, u] = s;
      m !== d && (n && (u.pathname = n(u.pathname)), f = setTimeout(() => {
        e.preloadRoute(u, d.getAttribute("preload") !== "false"), m = d;
      }, 20));
    }
    function p(o) {
      if (o.defaultPrevented) return;
      let s = o.submitter && o.submitter.hasAttribute("formaction") ? o.submitter.getAttribute("formaction") : o.target.getAttribute("action");
      if (!s) return;
      if (!s.startsWith("https://action/")) {
        const u = new URL(s, Ce);
        if (s = e.parsePath(u.pathname + u.search), !s.startsWith(a)) return;
      }
      if (o.target.method.toUpperCase() !== "POST") throw new Error("Only POST forms are supported for Actions");
      const d = ht.get(s);
      if (d) {
        o.preventDefault();
        const u = new FormData(o.target, o.submitter);
        d.call({ r: e, f: o.target }, o.target.enctype === "multipart/form-data" ? u : new URLSearchParams(u));
      }
    }
    delegateEvents(["click", "submit"]), document.addEventListener("click", b), t && (document.addEventListener("mousemove", y, { passive: true }), document.addEventListener("focusin", g, { passive: true }), document.addEventListener("touchstart", g, { passive: true })), document.addEventListener("submit", p), onCleanup(() => {
      document.removeEventListener("click", b), t && (document.removeEventListener("mousemove", y), document.removeEventListener("focusin", g), document.removeEventListener("touchstart", g)), document.removeEventListener("submit", p);
    });
  };
}
function ft(t) {
  if (isServer) return dt(t);
  const r = () => {
    const n = window.location.pathname.replace(/^\/+/, "/") + window.location.search, e = window.history.state && window.history.state._depth && Object.keys(window.history.state).length === 1 ? void 0 : window.history.state;
    return { value: n + window.location.hash, state: e };
  }, a = Pe();
  return it({ get: r, set({ value: n, replace: e, scroll: i, state: c }) {
    e ? window.history.replaceState(De(c), "", n) : window.history.pushState(c, "", n), ut(decodeURIComponent(window.location.hash.slice(1)), i), Q();
  }, init: (n) => ct(window, "popstate", ke(n, (e) => {
    if (e) return !a.confirm(e);
    {
      const i = r();
      return !a.confirm(i.value, { state: i.state });
    }
  })), create: mt(t.preload, t.explicitLinks, t.actionBase, t.transformUrl), utils: { go: (n) => window.history.go(n), beforeLeave: a } })(t);
}
var gt = ["<div", ' class="fern small cedar mist byte lark"><header class="small bytes travel far"><!--$-->', '<!--/--><nav class="small bytes ember dog">', '</nav></header><main class="wind in">', '</main><footer class="small bytes travel breeze far dog harbor"><span>classname compression, dogfooded</span><button>toggle theme</button></footer></div>'];
function wt(t) {
  return ssr(gt, ssrHydrationKey(), escape(createComponent(Ne, { href: "/", class: "tide a through fox", children: "minwind demo" })), escape(createComponent(Ne, { href: "/about", class: "flag drift", children: "about" })), escape(t.children));
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
//# sourceMappingURL=app-niit5Ekf.mjs.map
