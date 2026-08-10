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

const I = (e) => (n) => {
  const { base: a } = n, r = children(() => n.children), t = createMemo(() => qe(r(), n.base || ""));
  let i;
  const c = He(e, t, () => i, { base: a, singleFlight: n.singleFlight, transformUrl: n.transformUrl });
  return e.create && e.create(c), createComponent(Oe.Provider, { value: c, get children() {
    return createComponent(re, { routerState: c, get root() {
      return n.root;
    }, get preload() {
      return n.rootPreload || n.rootLoad;
    }, get children() {
      return [(i = getOwner()) && null, createComponent(ae, { routerState: c, get branches() {
        return t();
      } })];
    } });
  } });
};
function re(e) {
  const n = e.routerState.location, a = e.routerState.params, r = createMemo(() => e.preload && untrack(() => {
    e.preload({ params: a, location: n, intent: ze() || "initial" });
  }));
  return createComponent(Show, { get when() {
    return e.root;
  }, keyed: true, get fallback() {
    return e.children;
  }, children: (t) => createComponent(t, { params: a, location: n, get data() {
    return r();
  }, get children() {
    return e.children;
  } }) });
}
function ae(e) {
  if (isServer) {
    const t = getRequestEvent();
    if (t && t.router && t.router.dataOnly) {
      oe(t, e.routerState, e.branches);
      return;
    }
    t && ((t.router || (t.router = {})).matches || (t.router.matches = e.routerState.matches().map(({ route: i, path: c, params: m }) => ({ path: i.originalPath, pattern: i.pattern, match: c, params: m, info: i.info }))));
  }
  const n = [];
  let a;
  const r = createMemo(on(e.routerState.matches, (t, i, c) => {
    let m = i && t.length === i.length;
    const f = [];
    for (let l = 0, w = t.length; l < w; l++) {
      const b = i && i[l], g = t[l];
      c && b && g.route.key === b.route.key ? f[l] = c[l] : (m = false, n[l] && n[l](), createRoot((y) => {
        n[l] = y, f[l] = Ke(e.routerState, f[l - 1] || e.routerState.base, P(() => r()[l + 1]), () => {
          var _a;
          const p = e.routerState.matches();
          return (_a = p[l]) != null ? _a : p[0];
        });
      }));
    }
    return n.splice(t.length).forEach((l) => l()), c && m ? c : (a = f[0], f);
  }));
  return P(() => r() && a)();
}
const P = (e) => () => createComponent(Show, { get when() {
  return e();
}, keyed: true, children: (n) => createComponent(ee.Provider, { value: n, get children() {
  return n.outlet();
} }) });
function oe(e, n, a) {
  const r = new URL(e.request.url), t = q(a, new URL(e.router.previousUrl || e.request.url).pathname), i = q(a, r.pathname);
  for (let c = 0; c < i.length; c++) {
    (!t[c] || i[c].route !== t[c].route) && (e.router.dataOnly = true);
    const { route: m, params: f } = i[c];
    m.preload && m.preload({ params: f, location: n.location, intent: "preload" });
  }
}
function se([e, n], a, r) {
  return [e, r ? (t) => n(r(t)) : n];
}
function ie(e) {
  let n = false;
  const a = (t) => typeof t == "string" ? { value: t } : t, r = se(createSignal(a(e.get()), { equals: (t, i) => t.value === i.value && t.state === i.state }), void 0, (t) => (!n && e.set(t), sharedConfig.registry && !sharedConfig.done && (sharedConfig.done = true), t));
  return e.init && onCleanup(e.init((t = e.get()) => {
    n = true, r[1](a(t)), n = false;
  })), I({ signal: r, create: e.create, utils: e.utils });
}
function ce(e, n, a) {
  return e.addEventListener(n, a), () => e.removeEventListener(n, a);
}
function ue(e, n) {
  const a = e && document.getElementById(e);
  a ? a.scrollIntoView() : n && window.scrollTo(0, 0);
}
function le(e) {
  const n = new URL(e);
  return n.pathname + n.search;
}
function de(e) {
  let n;
  const a = { value: e.url || (n = getRequestEvent()) && le(n.request.url) || "" };
  return I({ signal: [() => a, (r) => Object.assign(a, r)] })(e);
}
const he = /* @__PURE__ */ new Map();
function fe(e = true, n = false, a = "/_server", r) {
  return (t) => {
    const i = t.base.path(), c = t.navigatorFactory(t.base);
    let m, f;
    function l(o) {
      return o.namespaceURI === "http://www.w3.org/2000/svg";
    }
    function w(o) {
      if (o.defaultPrevented || o.button !== 0 || o.metaKey || o.altKey || o.ctrlKey || o.shiftKey) return;
      const s = o.composedPath().find((x) => x instanceof Node && x.nodeName.toUpperCase() === "A");
      if (!s || n && !s.hasAttribute("link")) return;
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
      const [d, u] = s, E = t.parsePath(u.pathname + u.search + u.hash), v = d.getAttribute("state");
      o.preventDefault(), c(E, { resolve: false, replace: d.hasAttribute("replace"), scroll: !d.hasAttribute("noscroll"), state: v ? JSON.parse(v) : void 0 });
    }
    function g(o) {
      const s = w(o);
      if (!s) return;
      const [d, u] = s;
      r && (u.pathname = r(u.pathname)), t.preloadRoute(u, d.getAttribute("preload") !== "false");
    }
    function y(o) {
      clearTimeout(m);
      const s = w(o);
      if (!s) return f = null;
      const [d, u] = s;
      f !== d && (r && (u.pathname = r(u.pathname)), m = setTimeout(() => {
        t.preloadRoute(u, d.getAttribute("preload") !== "false"), f = d;
      }, 20));
    }
    function p(o) {
      if (o.defaultPrevented) return;
      let s = o.submitter && o.submitter.hasAttribute("formaction") ? o.submitter.getAttribute("formaction") : o.target.getAttribute("action");
      if (!s) return;
      if (!s.startsWith("https://action/")) {
        const u = new URL(s, Ce);
        if (s = t.parsePath(u.pathname + u.search), !s.startsWith(a)) return;
      }
      if (o.target.method.toUpperCase() !== "POST") throw new Error("Only POST forms are supported for Actions");
      const d = he.get(s);
      if (d) {
        o.preventDefault();
        const u = new FormData(o.target, o.submitter);
        d.call({ r: t, f: o.target }, o.target.enctype === "multipart/form-data" ? u : new URLSearchParams(u));
      }
    }
    delegateEvents(["click", "submit"]), document.addEventListener("click", b), e && (document.addEventListener("mousemove", y, { passive: true }), document.addEventListener("focusin", g, { passive: true }), document.addEventListener("touchstart", g, { passive: true })), document.addEventListener("submit", p), onCleanup(() => {
      document.removeEventListener("click", b), e && (document.removeEventListener("mousemove", y), document.removeEventListener("focusin", g), document.removeEventListener("touchstart", g)), document.removeEventListener("submit", p);
    });
  };
}
function me(e) {
  if (isServer) return de(e);
  const n = () => {
    const r = window.location.pathname.replace(/^\/+/, "/") + window.location.search, t = window.history.state && window.history.state._depth && Object.keys(window.history.state).length === 1 ? void 0 : window.history.state;
    return { value: r + window.location.hash, state: t };
  }, a = Pe();
  return ie({ get: n, set({ value: r, replace: t, scroll: i, state: c }) {
    t ? window.history.replaceState(De(c), "", r) : window.history.pushState(c, "", r), ue(decodeURIComponent(window.location.hash.slice(1)), i), Q();
  }, init: (r) => ce(window, "popstate", ke(r, (t) => {
    if (t) return !a.confirm(t);
    {
      const i = n();
      return !a.confirm(i.value, { state: i.state });
    }
  })), create: fe(e.preload, e.explicitLinks, e.actionBase, e.transformUrl), utils: { go: (r) => window.history.go(r), beforeLeave: a } })(e);
}
var ge = ["<div", ' class="mx-auto flex min-h-screen max-w-3xl flex-col px-6"><header class="flex items-center justify-between py-6"><!--$-->', '<!--/--><nav class="flex items-center gap-5 text-sm">', '</nav></header><main class="flex-1 py-8">', '</main><footer class="flex items-center justify-between border-t py-6 text-sm opacity-70"><span>classname compression, dogfooded</span><button>toggle theme</button></footer></div>'];
function we(e) {
  return ssr(ge, ssrHydrationKey(), escape(createComponent(Ne, { href: "/", class: "text-lg font-bold tracking-tight hover:border-accent", children: "minwind demo" })), escape(createComponent(Ne, { href: "/about", class: "underline-offset-4 hover:underline", children: "about" })), escape(e.children));
}
function Ae() {
  return createComponent(me, { root: (e) => createComponent(we, { get children() {
    return createComponent(Suspense, { get children() {
      return e.children;
    } });
  } }), get children() {
    return createComponent(Zo, {});
  } });
}

export { Ae as default };
//# sourceMappingURL=app-CHK3iYb9.mjs.map
