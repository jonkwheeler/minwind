import { ssrElement, mergeProps as mergeProps$1, isServer, getRequestEvent } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/solid-js@1.9.14/node_modules/solid-js/web/dist/server.js';
import { mergeProps, splitProps, createMemo, createSignal, createRenderEffect, on, useContext, runWithOwner, createContext, getOwner, startTransition, resetErrorBoundaries, batch, untrack, createComponent } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/solid-js@1.9.14/node_modules/solid-js/dist/server.js';

function Pe() {
  let e = /* @__PURE__ */ new Set();
  function t(r) {
    return e.add(r), () => e.delete(r);
  }
  let n = false;
  function s(r, o) {
    if (n) return !(n = false);
    const a = { to: r, options: o, defaultPrevented: false, preventDefault: () => a.defaultPrevented = true };
    for (const c of e) c.listener({ ...a, from: c.location, retry: (u) => {
      u && (n = true), c.navigate(r, { ...o, resolve: false });
    } });
    return !a.defaultPrevented;
  }
  return { subscribe: t, confirm: s };
}
let I;
function Q() {
  (!window.history.state || window.history.state._depth == null) && window.history.replaceState({ ...window.history.state, _depth: window.history.length - 1 }, ""), I = window.history.state._depth;
}
isServer || Q();
function De(e) {
  return { ...e, _depth: window.history.state && window.history.state._depth };
}
function ke(e, t) {
  let n = false;
  return () => {
    const s = I;
    Q();
    const r = s == null ? null : I - s;
    if (n) {
      n = false;
      return;
    }
    r && t(r) ? (n = true, window.history.go(-r)) : e();
  };
}
const Re = /^(?:[a-z0-9]+:)?\/\//i, xe = /^\/+|(\/)\/+$/g, Ce = "http://sr";
function R(e, t = false) {
  const n = e.replace(xe, "$1");
  return n ? t || /^[?#]/.test(n) ? n : "/" + n : "";
}
function W(e, t, n) {
  if (Re.test(t)) return;
  const s = R(e), r = n && R(n);
  let o = "";
  return !r || t.startsWith("/") ? o = s : r.toLowerCase().indexOf(s.toLowerCase()) !== 0 ? o = s + r : o = r, (o || "/") + R(t, !o);
}
function be(e, t) {
  if (e == null) throw new Error(t);
  return e;
}
function Le(e, t) {
  return R(e).replace(/\/*(\*.*)?$/g, "") + R(t);
}
function V(e) {
  const t = {};
  return e.searchParams.forEach((n, s) => {
    s in t ? Array.isArray(t[s]) ? t[s].push(n) : t[s] = [t[s], n] : t[s] = n;
  }), t;
}
function Ae(e, t, n) {
  const [s, r] = e.split("/*", 2), o = s.split("/").filter(Boolean), a = o.length;
  return (c) => {
    const u = c.split("/").filter(Boolean), h = u.length - a;
    if (h < 0 || h > 0 && r === void 0 && !t) return null;
    const f = { path: a ? "" : "/", params: {} }, m = (p) => n === void 0 ? void 0 : n[p];
    for (let p = 0; p < a; p++) {
      const d = o[p], v = d[0] === ":", w = v ? u[p] : u[p].toLowerCase(), A = v ? d.slice(1) : d.toLowerCase();
      if (v && $(w, m(A))) f.params[A] = w;
      else if (v || !$(w, A)) return null;
      f.path += `/${w}`;
    }
    if (r) {
      const p = h ? u.slice(-h).join("/") : "";
      if ($(p, m(r))) f.params[r] = p;
      else return null;
    }
    return f;
  };
}
function $(e, t) {
  const n = (s) => s === e;
  return t === void 0 ? true : typeof t == "string" ? n(t) : typeof t == "function" ? t(e) : Array.isArray(t) ? t.some(n) : t instanceof RegExp ? t.test(e) : false;
}
function Ee(e) {
  const [t, n] = e.pattern.split("/*", 2), s = t.split("/").filter(Boolean);
  return s.reduce((r, o) => r + (o.startsWith(":") ? 2 : 3), s.length - (n === void 0 ? 0 : 1));
}
function Y(e) {
  const t = /* @__PURE__ */ new Map(), n = getOwner();
  return new Proxy({}, { get(s, r) {
    return t.has(r) || runWithOwner(n, () => t.set(r, createMemo(() => e()[r]))), t.get(r)();
  }, getOwnPropertyDescriptor() {
    return { enumerable: true, configurable: true };
  }, ownKeys() {
    return Reflect.ownKeys(e());
  }, has(s, r) {
    return r in e();
  } });
}
function Z(e) {
  let t = /(\/?\:[^\/]+)\?/.exec(e);
  if (!t) return [e];
  let n = e.slice(0, t.index), s = e.slice(t.index + t[0].length);
  const r = [n, n += t[1]];
  for (; t = /^(\/\:[^\/]+)\?/.exec(s); ) r.push(n += t[1]), s = s.slice(t[0].length);
  return Z(s).reduce((o, a) => [...o, ...r.map((c) => c + a)], []);
}
const Se = 100, Oe = createContext(), ee = createContext(), U = () => be(useContext(Oe), "<A> and 'use' router primitives can be only used inside a Route."), _e = () => useContext(ee) || U().base, Be = (e) => {
  const t = _e();
  return createMemo(() => t.resolvePath(e()));
}, Fe = (e) => {
  const t = U();
  return createMemo(() => {
    const n = e();
    return n !== void 0 ? t.renderPath(n) : n;
  });
}, je = () => U().location;
function We(e, t = "") {
  const { component: n, preload: s, load: r, children: o, info: a } = e, c = !o || Array.isArray(o) && !o.length, u = { key: e, component: n, preload: s || r, info: a };
  return te(e.path).reduce((h, f) => {
    for (const m of Z(f)) {
      const p = Le(t, m);
      let d = c ? p : p.split("/*", 1)[0];
      d = d.split("/").map((v) => v.startsWith(":") || v.startsWith("*") ? v : encodeURIComponent(v)).join("/"), h.push({ ...u, originalPath: f, pattern: d, matcher: Ae(d, !c, e.matchFilters) });
    }
    return h;
  }, []);
}
function $e(e, t = 0) {
  return { routes: e, score: Ee(e[e.length - 1]) * 1e4 - t, matcher(n) {
    const s = [];
    for (let r = e.length - 1; r >= 0; r--) {
      const o = e[r], a = o.matcher(n);
      if (!a) return null;
      s.unshift({ ...a, route: o });
    }
    return s;
  } };
}
function te(e) {
  return Array.isArray(e) ? e : [e];
}
function qe(e, t = "", n = [], s = []) {
  const r = te(e);
  for (let o = 0, a = r.length; o < a; o++) {
    const c = r[o];
    if (c && typeof c == "object") {
      c.hasOwnProperty("path") || (c.path = "");
      const u = We(c, t);
      for (const h of u) {
        n.push(h);
        const f = Array.isArray(c.children) && c.children.length === 0;
        if (c.children && !f) qe(c.children, h.pattern, n, s);
        else {
          const m = $e([...n], s.length);
          s.push(m);
        }
        n.pop();
      }
    }
  }
  return n.length ? s : s.sort((o, a) => a.score - o.score);
}
function q(e, t) {
  for (let n = 0, s = e.length; n < s; n++) {
    const r = e[n].matcher(t);
    if (r) return r;
  }
  return [];
}
function Ie(e, t, n) {
  const s = new URL(Ce), r = createMemo((f) => {
    const m = e();
    try {
      return new URL(m, s);
    } catch {
      return console.error(`Invalid path ${m}`), f;
    }
  }, s, { equals: (f, m) => f.href === m.href }), o = createMemo(() => r().pathname), a = createMemo(() => r().search, true), c = createMemo(() => r().hash), u = () => "", h = on(a, () => V(r()));
  return { get pathname() {
    return o();
  }, get search() {
    return a();
  }, get hash() {
    return c();
  }, get state() {
    return t();
  }, get key() {
    return u();
  }, query: n ? n(h) : Y(h) };
}
let P;
function ze() {
  return P;
}
function He(e, t, n, s = {}) {
  const { signal: [r, o], utils: a = {} } = e, c = a.parsePath || ((i) => i), u = a.renderPath || ((i) => i), h = a.beforeLeave || Pe(), f = W("", s.base || "");
  if (f === void 0) throw new Error(`${f} is not a valid base path`);
  f && !r().value && o({ value: f, replace: true, scroll: false });
  const [m, p] = createSignal(false);
  let d;
  const v = (i, l) => {
    l.value === w() && l.state === E() || (d === void 0 && p(true), P = i, d = l, startTransition(() => {
      d === l && (A(d.value), ne(d.state), resetErrorBoundaries(), isServer || D[1]((g) => g.filter((x) => x.pending)));
    }).finally(() => {
      d === l && batch(() => {
        P = void 0, i === "navigate" && ae(d), p(false), d = void 0;
      });
    }));
  }, [w, A] = createSignal(r().value), [E, ne] = createSignal(r().state), S = Ie(w, E, a.queryWrapper), O = [], D = createSignal(isServer ? ce() : []), k = createMemo(() => typeof s.transformUrl == "function" ? q(t(), s.transformUrl(S.pathname)) : q(t(), S.pathname)), z = () => {
    const i = k(), l = {};
    for (let g = 0; g < i.length; g++) Object.assign(l, i[g].params);
    return l;
  }, re = a.paramsWrapper ? a.paramsWrapper(z, t) : Y(z), H = { pattern: f, path: () => f, outlet: () => null, resolvePath(i) {
    return W(f, i);
  } };
  return createRenderEffect(on(r, (i) => v("native", i), { defer: true })), { base: H, location: S, params: re, isRouting: m, renderPath: u, parsePath: c, navigatorFactory: oe, matches: k, beforeLeave: h, preloadRoute: ie, singleFlight: s.singleFlight === void 0 ? true : s.singleFlight, submissions: D };
  function se(i, l, g) {
    untrack(() => {
      if (typeof l == "number") {
        l && (a.go ? a.go(l) : console.warn("Router integration does not support relative routing"));
        return;
      }
      const x = !l || l[0] === "?", { replace: _, resolve: C, scroll: B, state: b } = { replace: false, resolve: !x, scroll: true, ...g }, L = C ? i.resolvePath(l) : W(x && S.pathname || "", l);
      if (L === void 0) throw new Error(`Path '${l}' is not a routable path`);
      if (O.length >= Se) throw new Error("Too many redirects");
      const K = w();
      if (L !== K || b !== E()) if (isServer) {
        const N = getRequestEvent();
        N && (N.response = { status: 302, headers: new Headers({ Location: L }) }), o({ value: L, replace: _, scroll: B, state: b });
      } else h.confirm(L, g) && (O.push({ value: K, replace: _, scroll: B, state: E() }), v("navigate", { value: L, state: b }));
    });
  }
  function oe(i) {
    return i = i || useContext(ee) || H, (l, g) => se(i, l, g);
  }
  function ae(i) {
    const l = O[0];
    l && (o({ ...i, replace: l.replace, scroll: l.scroll }), O.length = 0);
  }
  function ie(i, l) {
    const g = q(t(), i.pathname), x = P;
    P = "preload";
    for (let _ in g) {
      const { route: C, params: B } = g[_];
      C.component && C.component.preload && C.component.preload();
      const { preload: b } = C;
      l && b && runWithOwner(n(), () => b({ params: B, location: { pathname: i.pathname, search: i.search, hash: i.hash, query: V(i), state: null, key: "" }, intent: "preload" }));
    }
    P = x;
  }
  function ce() {
    const i = getRequestEvent();
    return i && i.router && i.router.submission ? [i.router.submission] : [];
  }
}
function Ke(e, t, n, s) {
  const { base: r, location: o, params: a } = e, { pattern: c, component: u, preload: h } = s().route, f = createMemo(() => s().path);
  u && u.preload && u.preload();
  const m = h ? h({ params: a, location: o, intent: P || "initial" }) : void 0;
  return { parent: t, pattern: c, path: f, outlet: () => u ? createComponent(u, { params: a, location: o, data: m, get children() {
    return n();
  } }) : n(), resolvePath(d) {
    return W(r.path(), d, f());
  } };
}
function Ne(e) {
  e = mergeProps({ inactiveClass: "inactive", activeClass: "active" }, e);
  const [, t] = splitProps(e, ["href", "state", "class", "activeClass", "inactiveClass", "end"]), n = Be(() => e.href), s = Fe(n), r = je(), o = createMemo(() => {
    const a = n();
    if (a === void 0) return [false, false];
    const c = R(a.split(/[?#]/, 1)[0]).toLowerCase(), u = decodeURI(R(r.pathname).toLowerCase());
    return [e.end ? c === u : u.startsWith(c + "/") || u === c, c === u];
  });
  return ssrElement("a", mergeProps$1(t, { get href() {
    return s() || e.href;
  }, get state() {
    return JSON.stringify(e.state);
  }, get classList() {
    return { ...e.class && { [e.class]: true }, [e.inactiveClass]: !o()[0], [e.activeClass]: o()[0], ...t.classList };
  }, link: true, get "aria-current"() {
    return o()[1] ? "page" : void 0;
  } }), void 0, true);
}

export { Ce as C, De as D, He as H, Ke as K, Ne as N, Oe as O, Pe as P, Q, q as a, ee as e, ke as k, qe as q, ze as z };
//# sourceMappingURL=components-CWoJdK_F.mjs.map
