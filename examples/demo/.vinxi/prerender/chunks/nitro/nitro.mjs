import process from 'node:process';globalThis._importMeta_=globalThis._importMeta_||{url:"file:///_entry.js",env:process.env};import destr from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/destr@2.0.5/node_modules/destr/dist/index.mjs';
import { defineEventHandler, handleCacheHeaders, splitCookiesString, createEvent, fetchWithEvent, isEvent, eventHandler, setHeaders, createError, sendRedirect, proxyRequest, getRequestURL, setResponseStatus, getResponseHeader, setResponseHeaders, send, getRequestHeader, removeResponseHeader, appendResponseHeader, setResponseHeader, H3Event, getRequestIP, parseCookies, getResponseStatus, getResponseStatusText, getCookie, setCookie, getResponseHeaders, getRequestWebStream, setHeader, createApp, createRouter as createRouter$1, toNodeListener, lazyEventHandler } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/h3@1.15.11/node_modules/h3/dist/index.mjs';
import { createHooks } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/hookable@5.5.3/node_modules/hookable/dist/index.mjs';
import { createFetch, Headers as Headers$1 } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/ofetch@1.5.1/node_modules/ofetch/dist/node.mjs';
import { fetchNodeRequestHandler, callNodeRequestHandler } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/node-mock-http@1.0.5/node_modules/node-mock-http/dist/index.mjs';
import { parseURL, withoutBase, joinURL, getQuery, withQuery, decodePath, withLeadingSlash, withoutTrailingSlash } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/ufo@1.6.4/node_modules/ufo/dist/index.mjs';
import { createStorage, prefixStorage } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/unstorage@1.17.5_db0@0.3.4_ioredis@5.11.1/node_modules/unstorage/dist/index.mjs';
import unstorage_47drivers_47fs from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/unstorage@1.17.5_db0@0.3.4_ioredis@5.11.1/node_modules/unstorage/drivers/fs.mjs';
import unstorage_47drivers_47fs_45lite from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/unstorage@1.17.5_db0@0.3.4_ioredis@5.11.1/node_modules/unstorage/drivers/fs-lite.mjs';
import { digest } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/ohash@2.0.11/node_modules/ohash/dist/index.mjs';
import { klona } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/klona@2.0.6/node_modules/klona/dist/index.mjs';
import defu, { defuFn } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/defu@6.1.7/node_modules/defu/dist/defu.mjs';
import { snakeCase } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/scule@1.3.0/node_modules/scule/dist/index.mjs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getContext } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/unctx@2.5.0/node_modules/unctx/dist/index.mjs';
import { toRouteMatcher, createRouter } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/radix3@1.1.2/node_modules/radix3/dist/index.mjs';
import _7EQHWErDIIv5Q5bMVnEuT89NB6HArHaeId1ldkK0asQ from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/vinxi@0.5.11_@parcel+watcher@2.6.0_@types+node@22.20.1_db0@0.3.4_ioredis@5.11.1_jiti@2.7.0_li_si6oooeinf43khxkjeu4hz52wu/node_modules/vinxi/lib/app-fetch.js';
import _LCu4rUohui_ufMpYZVoVqftlhGmtkiNFNfscGNvrkks from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/vinxi@0.5.11_@parcel+watcher@2.6.0_@types+node@22.20.1_db0@0.3.4_ioredis@5.11.1_jiti@2.7.0_li_si6oooeinf43khxkjeu4hz52wu/node_modules/vinxi/lib/app-manifest.js';
import { promises } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/pathe@2.0.3/node_modules/pathe/dist/index.mjs';
import { sharedConfig, lazy, createComponent, mergeProps as mergeProps$1, splitProps, createMemo, useContext, createContext, createSignal, createRenderEffect, on as on$2, runWithOwner, getOwner, startTransition, resetErrorBoundaries, batch, untrack, catchError, ErrorBoundary, Suspense, onCleanup, children, Show, createRoot } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/solid-js@1.9.14/node_modules/solid-js/dist/server.js';
import { renderToString, isServer, getRequestEvent, ssrElement, escape, mergeProps, ssr, renderToStream, createComponent as createComponent$1, ssrHydrationKey, NoHydration, useAssets, Hydration, ssrAttribute, HydrationScript, delegateEvents } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/solid-js@1.9.14/node_modules/solid-js/web/dist/server.js';
import { provideRequestEvent } from 'file:///Users/jonwheeler/jon_code/minwind/node_modules/.pnpm/solid-js@1.9.14/node_modules/solid-js/web/storage/dist/storage.js';

const serverAssets = [{"baseName":"server","dir":"/Users/jonwheeler/jon_code/minwind/examples/demo/assets"}];

const assets$1 = createStorage();

for (const asset of serverAssets) {
  assets$1.mount(asset.baseName, unstorage_47drivers_47fs({ base: asset.dir, ignore: (asset?.ignore || []) }));
}

const storage = createStorage({});

storage.mount('/assets', assets$1);

storage.mount('data', unstorage_47drivers_47fs_45lite({"driver":"fsLite","base":"./.data/kv"}));
storage.mount('root', unstorage_47drivers_47fs({"driver":"fs","readOnly":true,"base":"/Users/jonwheeler/jon_code/minwind/examples/demo"}));
storage.mount('src', unstorage_47drivers_47fs({"driver":"fs","readOnly":true,"base":"/Users/jonwheeler/jon_code/minwind/examples/demo"}));
storage.mount('build', unstorage_47drivers_47fs({"driver":"fs","readOnly":false,"base":"/Users/jonwheeler/jon_code/minwind/examples/demo/.vinxi"}));
storage.mount('cache', unstorage_47drivers_47fs({"driver":"fs","readOnly":false,"base":"/Users/jonwheeler/jon_code/minwind/examples/demo/.vinxi/cache"}));

function useStorage(base = "") {
  return base ? prefixStorage(storage, base) : storage;
}

const Hasher = /* @__PURE__ */ (() => {
  class Hasher2 {
    buff = "";
    #context = /* @__PURE__ */ new Map();
    write(str) {
      this.buff += str;
    }
    dispatch(value) {
      const type = value === null ? "null" : typeof value;
      return this[type](value);
    }
    object(object) {
      if (object && typeof object.toJSON === "function") {
        return this.object(object.toJSON());
      }
      const objString = Object.prototype.toString.call(object);
      let objType = "";
      const objectLength = objString.length;
      objType = objectLength < 10 ? "unknown:[" + objString + "]" : objString.slice(8, objectLength - 1);
      objType = objType.toLowerCase();
      let objectNumber = null;
      if ((objectNumber = this.#context.get(object)) === void 0) {
        this.#context.set(object, this.#context.size);
      } else {
        return this.dispatch("[CIRCULAR:" + objectNumber + "]");
      }
      if (typeof Buffer !== "undefined" && Buffer.isBuffer && Buffer.isBuffer(object)) {
        this.write("buffer:");
        return this.write(object.toString("utf8"));
      }
      if (objType !== "object" && objType !== "function" && objType !== "asyncfunction") {
        if (this[objType]) {
          this[objType](object);
        } else {
          this.unknown(object, objType);
        }
      } else {
        const keys = Object.keys(object).sort();
        const extraKeys = [];
        this.write("object:" + (keys.length + extraKeys.length) + ":");
        const dispatchForKey = (key) => {
          this.dispatch(key);
          this.write(":");
          this.dispatch(object[key]);
          this.write(",");
        };
        for (const key of keys) {
          dispatchForKey(key);
        }
        for (const key of extraKeys) {
          dispatchForKey(key);
        }
      }
    }
    array(arr, unordered) {
      unordered = unordered === void 0 ? false : unordered;
      this.write("array:" + arr.length + ":");
      if (!unordered || arr.length <= 1) {
        for (const entry of arr) {
          this.dispatch(entry);
        }
        return;
      }
      const contextAdditions = /* @__PURE__ */ new Map();
      const entries = arr.map((entry) => {
        const hasher = new Hasher2();
        hasher.dispatch(entry);
        for (const [key, value] of hasher.#context) {
          contextAdditions.set(key, value);
        }
        return hasher.toString();
      });
      this.#context = contextAdditions;
      entries.sort();
      return this.array(entries, false);
    }
    date(date) {
      return this.write("date:" + date.toJSON());
    }
    symbol(sym) {
      return this.write("symbol:" + sym.toString());
    }
    unknown(value, type) {
      this.write(type);
      if (!value) {
        return;
      }
      this.write(":");
      if (value && typeof value.entries === "function") {
        return this.array(
          [...value.entries()],
          true
          /* ordered */
        );
      }
    }
    error(err) {
      return this.write("error:" + err.toString());
    }
    boolean(bool) {
      return this.write("bool:" + bool);
    }
    string(string) {
      this.write("string:" + string.length + ":");
      this.write(string);
    }
    function(fn) {
      this.write("fn:");
      if (isNativeFunction(fn)) {
        this.dispatch("[native]");
      } else {
        this.dispatch(fn.toString());
      }
    }
    number(number) {
      return this.write("number:" + number);
    }
    null() {
      return this.write("Null");
    }
    undefined() {
      return this.write("Undefined");
    }
    regexp(regex) {
      return this.write("regex:" + regex.toString());
    }
    arraybuffer(arr) {
      this.write("arraybuffer:");
      return this.dispatch(new Uint8Array(arr));
    }
    url(url) {
      return this.write("url:" + url.toString());
    }
    map(map) {
      this.write("map:");
      const arr = [...map];
      return this.array(arr, false);
    }
    set(set) {
      this.write("set:");
      const arr = [...set];
      return this.array(arr, false);
    }
    bigint(number) {
      return this.write("bigint:" + number.toString());
    }
  }
  for (const type of [
    "uint8array",
    "uint8clampedarray",
    "unt8array",
    "uint16array",
    "unt16array",
    "uint32array",
    "unt32array",
    "float32array",
    "float64array"
  ]) {
    Hasher2.prototype[type] = function(arr) {
      this.write(type + ":");
      return this.array([...arr], false);
    };
  }
  function isNativeFunction(f) {
    if (typeof f !== "function") {
      return false;
    }
    return Function.prototype.toString.call(f).slice(
      -15
      /* "[native code] }".length */
    ) === "[native code] }";
  }
  return Hasher2;
})();
function serialize(object) {
  const hasher = new Hasher();
  hasher.dispatch(object);
  return hasher.buff;
}
function hash(value) {
  return digest(typeof value === "string" ? value : serialize(value)).replace(/[-_]/g, "").slice(0, 10);
}

function defaultCacheOptions() {
  return {
    name: "_",
    base: "/cache",
    swr: true,
    maxAge: 1
  };
}
function defineCachedFunction(fn, opts = {}) {
  opts = { ...defaultCacheOptions(), ...opts };
  const pending = {};
  const group = opts.group || "nitro/functions";
  const name = opts.name || fn.name || "_";
  const integrity = opts.integrity || hash([fn, opts]);
  const validate = opts.validate || ((entry) => entry.value !== void 0);
  async function get(key, resolver, shouldInvalidateCache, event) {
    const cacheKey = [opts.base, group, name, key + ".json"].filter(Boolean).join(":").replace(/:\/$/, ":index");
    let entry = await useStorage().getItem(cacheKey).catch((error) => {
      console.error(`[cache] Cache read error.`, error);
      useNitroApp().captureError(error, { event, tags: ["cache"] });
    }) || {};
    if (typeof entry !== "object") {
      entry = {};
      const error = new Error("Malformed data read from cache.");
      console.error("[cache]", error);
      useNitroApp().captureError(error, { event, tags: ["cache"] });
    }
    const ttl = (opts.maxAge ?? 0) * 1e3;
    if (ttl) {
      entry.expires = Date.now() + ttl;
    }
    const expired = shouldInvalidateCache || entry.integrity !== integrity || ttl && Date.now() - (entry.mtime || 0) > ttl || validate(entry) === false;
    const _resolve = async () => {
      const isPending = pending[key];
      if (!isPending) {
        if (entry.value !== void 0 && (opts.staleMaxAge || 0) >= 0 && opts.swr === false) {
          entry.value = void 0;
          entry.integrity = void 0;
          entry.mtime = void 0;
          entry.expires = void 0;
        }
        pending[key] = Promise.resolve(resolver());
      }
      try {
        entry.value = await pending[key];
      } catch (error) {
        if (!isPending) {
          delete pending[key];
        }
        throw error;
      }
      if (!isPending) {
        entry.mtime = Date.now();
        entry.integrity = integrity;
        delete pending[key];
        if (validate(entry) !== false) {
          let setOpts;
          if (opts.maxAge && !opts.swr) {
            setOpts = { ttl: opts.maxAge };
          }
          const promise = useStorage().setItem(cacheKey, entry, setOpts).catch((error) => {
            console.error(`[cache] Cache write error.`, error);
            useNitroApp().captureError(error, { event, tags: ["cache"] });
          });
          if (event?.waitUntil) {
            event.waitUntil(promise);
          }
        }
      }
    };
    const _resolvePromise = expired ? _resolve() : Promise.resolve();
    if (entry.value === void 0) {
      await _resolvePromise;
    } else if (expired && event && event.waitUntil) {
      event.waitUntil(_resolvePromise);
    }
    if (opts.swr && validate(entry) !== false) {
      _resolvePromise.catch((error) => {
        console.error(`[cache] SWR handler error.`, error);
        useNitroApp().captureError(error, { event, tags: ["cache"] });
      });
      return entry;
    }
    return _resolvePromise.then(() => entry);
  }
  return async (...args) => {
    const shouldBypassCache = await opts.shouldBypassCache?.(...args);
    if (shouldBypassCache) {
      return fn(...args);
    }
    const key = await (opts.getKey || getKey)(...args);
    const shouldInvalidateCache = await opts.shouldInvalidateCache?.(...args);
    const entry = await get(
      key,
      () => fn(...args),
      shouldInvalidateCache,
      args[0] && isEvent(args[0]) ? args[0] : void 0
    );
    let value = entry.value;
    if (opts.transform) {
      value = await opts.transform(entry, ...args) || value;
    }
    return value;
  };
}
function cachedFunction(fn, opts = {}) {
  return defineCachedFunction(fn, opts);
}
function getKey(...args) {
  return args.length > 0 ? hash(args) : "";
}
function escapeKey(key) {
  return String(key).replace(/\W/g, "");
}
function defineCachedEventHandler(handler, opts = defaultCacheOptions()) {
  const variableHeaderNames = (opts.varies || []).filter(Boolean).map((h) => h.toLowerCase()).sort();
  const _opts = {
    ...opts,
    getKey: async (event) => {
      const customKey = await opts.getKey?.(event);
      if (customKey) {
        return escapeKey(customKey);
      }
      const _path = event.node.req.originalUrl || event.node.req.url || event.path;
      let _pathname;
      try {
        _pathname = escapeKey(decodeURI(parseURL(_path).pathname)).slice(0, 16) || "index";
      } catch {
        _pathname = "-";
      }
      const _hashedPath = `${_pathname}.${hash(_path)}`;
      const _headers = variableHeaderNames.map((header) => [header, event.node.req.headers[header]]).map(([name, value]) => `${escapeKey(name)}.${hash(value)}`);
      return [_hashedPath, ..._headers].join(":");
    },
    validate: (entry) => {
      if (!entry.value) {
        return false;
      }
      if (entry.value.code >= 400) {
        return false;
      }
      if (entry.value.body === void 0) {
        return false;
      }
      if (entry.value.headers.etag === "undefined" || entry.value.headers["last-modified"] === "undefined") {
        return false;
      }
      return true;
    },
    group: opts.group || "nitro/handlers",
    integrity: opts.integrity || hash([handler, opts])
  };
  const _cachedHandler = cachedFunction(
    async (incomingEvent) => {
      const variableHeaders = {};
      for (const header of variableHeaderNames) {
        const value = incomingEvent.node.req.headers[header];
        if (value !== void 0) {
          variableHeaders[header] = value;
        }
      }
      const reqProxy = cloneWithProxy(incomingEvent.node.req, {
        headers: variableHeaders
      });
      const resHeaders = {};
      let _resSendBody;
      const resProxy = cloneWithProxy(incomingEvent.node.res, {
        statusCode: 200,
        writableEnded: false,
        writableFinished: false,
        headersSent: false,
        closed: false,
        getHeader(name) {
          return resHeaders[name];
        },
        setHeader(name, value) {
          resHeaders[name] = value;
          return this;
        },
        getHeaderNames() {
          return Object.keys(resHeaders);
        },
        hasHeader(name) {
          return name in resHeaders;
        },
        removeHeader(name) {
          delete resHeaders[name];
        },
        getHeaders() {
          return resHeaders;
        },
        end(chunk, arg2, arg3) {
          if (typeof chunk === "string") {
            _resSendBody = chunk;
          }
          if (typeof arg2 === "function") {
            arg2();
          }
          if (typeof arg3 === "function") {
            arg3();
          }
          return this;
        },
        write(chunk, arg2, arg3) {
          if (typeof chunk === "string") {
            _resSendBody = chunk;
          }
          if (typeof arg2 === "function") {
            arg2(void 0);
          }
          if (typeof arg3 === "function") {
            arg3();
          }
          return true;
        },
        writeHead(statusCode, headers2) {
          this.statusCode = statusCode;
          if (headers2) {
            if (Array.isArray(headers2) || typeof headers2 === "string") {
              throw new TypeError("Raw headers  is not supported.");
            }
            for (const header in headers2) {
              const value = headers2[header];
              if (value !== void 0) {
                this.setHeader(
                  header,
                  value
                );
              }
            }
          }
          return this;
        }
      });
      const event = createEvent(reqProxy, resProxy);
      event.fetch = (url, fetchOptions) => fetchWithEvent(event, url, fetchOptions, {
        fetch: useNitroApp().localFetch
      });
      event.$fetch = (url, fetchOptions) => fetchWithEvent(event, url, fetchOptions, {
        fetch: globalThis.$fetch
      });
      event.waitUntil = incomingEvent.waitUntil;
      event.context = incomingEvent.context;
      event.context.cache = {
        options: _opts
      };
      const body = await handler(event) || _resSendBody;
      const headers = event.node.res.getHeaders();
      headers.etag = String(
        headers.Etag || headers.etag || `W/"${hash(body)}"`
      );
      headers["last-modified"] = String(
        headers["Last-Modified"] || headers["last-modified"] || (/* @__PURE__ */ new Date()).toUTCString()
      );
      const cacheControl = [];
      if (opts.swr) {
        if (opts.maxAge) {
          cacheControl.push(`s-maxage=${opts.maxAge}`);
        }
        if (opts.staleMaxAge) {
          cacheControl.push(`stale-while-revalidate=${opts.staleMaxAge}`);
        } else {
          cacheControl.push("stale-while-revalidate");
        }
      } else if (opts.maxAge) {
        cacheControl.push(`max-age=${opts.maxAge}`);
      }
      if (cacheControl.length > 0) {
        headers["cache-control"] = cacheControl.join(", ");
      }
      const cacheEntry = {
        code: event.node.res.statusCode,
        headers,
        body
      };
      return cacheEntry;
    },
    _opts
  );
  return defineEventHandler(async (event) => {
    if (opts.headersOnly) {
      if (handleCacheHeaders(event, { maxAge: opts.maxAge })) {
        return;
      }
      return handler(event);
    }
    const response = await _cachedHandler(
      event
    );
    if (event.node.res.headersSent || event.node.res.writableEnded) {
      return response.body;
    }
    if (handleCacheHeaders(event, {
      modifiedTime: new Date(response.headers["last-modified"]),
      etag: response.headers.etag,
      maxAge: opts.maxAge
    })) {
      return;
    }
    event.node.res.statusCode = response.code;
    for (const name in response.headers) {
      const value = response.headers[name];
      if (name === "set-cookie") {
        event.node.res.appendHeader(
          name,
          splitCookiesString(value)
        );
      } else {
        if (value !== void 0) {
          event.node.res.setHeader(name, value);
        }
      }
    }
    return response.body;
  });
}
function cloneWithProxy(obj, overrides) {
  return new Proxy(obj, {
    get(target, property, receiver) {
      if (property in overrides) {
        return overrides[property];
      }
      return Reflect.get(target, property, receiver);
    },
    set(target, property, value, receiver) {
      if (property in overrides) {
        overrides[property] = value;
        return true;
      }
      return Reflect.set(target, property, value, receiver);
    }
  });
}
const cachedEventHandler = defineCachedEventHandler;

const inlineAppConfig = {};



const appConfig$1 = defuFn(inlineAppConfig);

function getEnv(key, opts) {
  const envKey = snakeCase(key).toUpperCase();
  return destr(
    process.env[opts.prefix + envKey] ?? process.env[opts.altPrefix + envKey]
  );
}
function _isObject(input) {
  return typeof input === "object" && !Array.isArray(input);
}
function applyEnv(obj, opts, parentKey = "") {
  for (const key in obj) {
    const subKey = parentKey ? `${parentKey}_${key}` : key;
    const envValue = getEnv(subKey, opts);
    if (_isObject(obj[key])) {
      if (_isObject(envValue)) {
        obj[key] = { ...obj[key], ...envValue };
        applyEnv(obj[key], opts, subKey);
      } else if (envValue === void 0) {
        applyEnv(obj[key], opts, subKey);
      } else {
        obj[key] = envValue ?? obj[key];
      }
    } else {
      obj[key] = envValue ?? obj[key];
    }
    if (opts.envExpansion && typeof obj[key] === "string") {
      obj[key] = _expandFromEnv(obj[key]);
    }
  }
  return obj;
}
const envExpandRx = /\{\{([^{}]*)\}\}/g;
function _expandFromEnv(value) {
  return value.replace(envExpandRx, (match, key) => {
    return process.env[key] || match;
  });
}

const _inlineRuntimeConfig = {
  "app": {
    "baseURL": "/"
  },
  "nitro": {
    "routeRules": {
      "/_build/assets/**": {
        "headers": {
          "cache-control": "public, immutable, max-age=31536000"
        }
      }
    }
  }
};
const envOptions = {
  prefix: "NITRO_",
  altPrefix: _inlineRuntimeConfig.nitro.envPrefix ?? process.env.NITRO_ENV_PREFIX ?? "_",
  envExpansion: _inlineRuntimeConfig.nitro.envExpansion ?? process.env.NITRO_ENV_EXPANSION ?? false
};
const _sharedRuntimeConfig = _deepFreeze(
  applyEnv(klona(_inlineRuntimeConfig), envOptions)
);
function useRuntimeConfig(event) {
  {
    return _sharedRuntimeConfig;
  }
}
_deepFreeze(klona(appConfig$1));
function _deepFreeze(object) {
  const propNames = Object.getOwnPropertyNames(object);
  for (const name of propNames) {
    const value = object[name];
    if (value && typeof value === "object") {
      _deepFreeze(value);
    }
  }
  return Object.freeze(object);
}
new Proxy(/* @__PURE__ */ Object.create(null), {
  get: (_, prop) => {
    console.warn(
      "Please use `useRuntimeConfig()` instead of accessing config directly."
    );
    const runtimeConfig = useRuntimeConfig();
    if (prop in runtimeConfig) {
      return runtimeConfig[prop];
    }
    return void 0;
  }
});

const nitroAsyncContext = getContext("nitro-app", {
  asyncContext: true,
  AsyncLocalStorage: AsyncLocalStorage 
});

function isPathInScope(pathname, base) {
  let canonical;
  try {
    const pre = pathname.replace(/%2f/gi, "/").replace(/%5c/gi, "\\");
    canonical = new URL(pre, "http://_").pathname;
  } catch {
    return false;
  }
  return !base || canonical === base || canonical.startsWith(base + "/");
}

const config = useRuntimeConfig();
const _routeRulesMatcher = toRouteMatcher(
  createRouter({ routes: config.nitro.routeRules })
);
function createRouteRulesHandler(ctx) {
  return eventHandler((event) => {
    const routeRules = getRouteRules(event);
    if (routeRules.headers) {
      setHeaders(event, routeRules.headers);
    }
    if (routeRules.redirect) {
      let target = routeRules.redirect.to;
      if (target.endsWith("/**")) {
        let targetPath = event.path;
        const strpBase = routeRules.redirect._redirectStripBase;
        if (strpBase) {
          if (!isPathInScope(event.path.split("?")[0], strpBase)) {
            throw createError({ statusCode: 400 });
          }
          targetPath = withoutBase(targetPath, strpBase);
        } else if (targetPath.startsWith("//")) {
          targetPath = targetPath.replace(/^\/+/, "/");
        }
        target = joinURL(target.slice(0, -3), targetPath);
      } else if (event.path.includes("?")) {
        const query = getQuery(event.path);
        target = withQuery(target, query);
      }
      return sendRedirect(event, target, routeRules.redirect.statusCode);
    }
    if (routeRules.proxy) {
      let target = routeRules.proxy.to;
      if (target.endsWith("/**")) {
        let targetPath = event.path;
        const strpBase = routeRules.proxy._proxyStripBase;
        if (strpBase) {
          if (!isPathInScope(event.path.split("?")[0], strpBase)) {
            throw createError({ statusCode: 400 });
          }
          targetPath = withoutBase(targetPath, strpBase);
        } else if (targetPath.startsWith("//")) {
          targetPath = targetPath.replace(/^\/+/, "/");
        }
        target = joinURL(target.slice(0, -3), targetPath);
      } else if (event.path.includes("?")) {
        const query = getQuery(event.path);
        target = withQuery(target, query);
      }
      return proxyRequest(event, target, {
        fetch: ctx.localFetch,
        ...routeRules.proxy
      });
    }
  });
}
function getRouteRules(event) {
  event.context._nitro = event.context._nitro || {};
  if (!event.context._nitro.routeRules) {
    event.context._nitro.routeRules = getRouteRulesForPath(
      withoutBase(event.path.split("?")[0], useRuntimeConfig().app.baseURL)
    );
  }
  return event.context._nitro.routeRules;
}
function getRouteRulesForPath(path) {
  return defu({}, ..._routeRulesMatcher.matchAll(path).reverse());
}

function _captureError(error, type) {
  console.error(`[${type}]`, error);
  useNitroApp().captureError(error, { tags: [type] });
}
function trapUnhandledNodeErrors() {
  process.on(
    "unhandledRejection",
    (error) => _captureError(error, "unhandledRejection")
  );
  process.on(
    "uncaughtException",
    (error) => _captureError(error, "uncaughtException")
  );
}
function joinHeaders(value) {
  return Array.isArray(value) ? value.join(", ") : String(value);
}
function normalizeFetchResponse(response) {
  if (!response.headers.has("set-cookie")) {
    return response;
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: normalizeCookieHeaders(response.headers)
  });
}
function normalizeCookieHeader(header = "") {
  return splitCookiesString(joinHeaders(header));
}
function normalizeCookieHeaders(headers) {
  const outgoingHeaders = new Headers();
  for (const [name, header] of headers) {
    if (name === "set-cookie") {
      for (const cookie of normalizeCookieHeader(header)) {
        outgoingHeaders.append("set-cookie", cookie);
      }
    } else {
      outgoingHeaders.set(name, joinHeaders(header));
    }
  }
  return outgoingHeaders;
}

function defineNitroErrorHandler(handler) {
  return handler;
}

const errorHandler$0 = defineNitroErrorHandler(
  function defaultNitroErrorHandler(error, event) {
    const res = defaultHandler(error, event);
    setResponseHeaders(event, res.headers);
    setResponseStatus(event, res.status, res.statusText);
    return send(event, JSON.stringify(res.body, null, 2));
  }
);
function defaultHandler(error, event, opts) {
  const isSensitive = error.unhandled || error.fatal;
  const statusCode = error.statusCode || 500;
  const statusMessage = error.statusMessage || "Server Error";
  const url = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true });
  if (statusCode === 404) {
    const baseURL = "/";
    if (/^\/[^/]/.test(baseURL) && !url.pathname.startsWith(baseURL)) {
      const redirectTo = `${baseURL}${url.pathname.slice(1)}${url.search}`;
      return {
        status: 302,
        statusText: "Found",
        headers: { location: redirectTo },
        body: `Redirecting...`
      };
    }
  }
  if (isSensitive && !opts?.silent) {
    const tags = [error.unhandled && "[unhandled]", error.fatal && "[fatal]"].filter(Boolean).join(" ");
    console.error(`[request error] ${tags} [${event.method}] ${url}
`, error);
  }
  const headers = {
    "content-type": "application/json",
    // Prevent browser from guessing the MIME types of resources.
    "x-content-type-options": "nosniff",
    // Prevent error page from being embedded in an iframe
    "x-frame-options": "DENY",
    // Prevent browsers from sending the Referer header
    "referrer-policy": "no-referrer",
    // Disable the execution of any js
    "content-security-policy": "script-src 'none'; frame-ancestors 'none';"
  };
  setResponseStatus(event, statusCode, statusMessage);
  if (statusCode === 404 || !getResponseHeader(event, "cache-control")) {
    headers["cache-control"] = "no-cache";
  }
  const body = {
    error: true,
    url: url.href,
    statusCode,
    statusMessage,
    message: isSensitive ? "Server Error" : error.message,
    data: isSensitive ? void 0 : error.data
  };
  return {
    status: statusCode,
    statusText: statusMessage,
    headers,
    body
  };
}

const errorHandlers = [errorHandler$0];

async function errorHandler(error, event) {
  for (const handler of errorHandlers) {
    try {
      await handler(error, event, { defaultHandler });
      if (event.handled) {
        return; // Response handled
      }
    } catch(error) {
      // Handler itself thrown, log and continue
      console.error(error);
    }
  }
  // H3 will handle fallback
}

const appConfig = {"name":"vinxi","routers":[{"name":"public","type":"static","base":"/","dir":"./public","root":"/Users/jonwheeler/jon_code/minwind/examples/demo","order":0,"outDir":"/Users/jonwheeler/jon_code/minwind/examples/demo/.vinxi/build/public"},{"name":"ssr","type":"http","link":{"client":"client"},"handler":"src/entry-server.tsx","extensions":["js","jsx","ts","tsx"],"target":"server","root":"/Users/jonwheeler/jon_code/minwind/examples/demo","base":"/","outDir":"/Users/jonwheeler/jon_code/minwind/examples/demo/.vinxi/build/ssr","order":1},{"name":"client","type":"client","base":"/_build","handler":"src/entry-client.tsx","extensions":["js","jsx","ts","tsx"],"target":"browser","root":"/Users/jonwheeler/jon_code/minwind/examples/demo","outDir":"/Users/jonwheeler/jon_code/minwind/examples/demo/.vinxi/build/client","order":2},{"name":"server-fns","type":"http","base":"/_server","handler":"../../node_modules/.pnpm/@solidjs+start@1.3.2_solid-js@1.9.14_vinxi@0.5.11_@parcel+watcher@2.6.0_@types+node@22.20.1_d_ihb7ziwmca7ibzwji4zrxvimvi/node_modules/@solidjs/start/dist/runtime/server-handler.js","target":"server","root":"/Users/jonwheeler/jon_code/minwind/examples/demo","outDir":"/Users/jonwheeler/jon_code/minwind/examples/demo/.vinxi/build/server-fns","order":3}],"server":{"compressPublicAssets":{"brotli":true},"routeRules":{"/_build/assets/**":{"headers":{"cache-control":"public, immutable, max-age=31536000"}}},"experimental":{"asyncContext":true},"prerender":{"crawlLinks":true}},"root":"/Users/jonwheeler/jon_code/minwind/examples/demo"};
					const buildManifest = {"ssr":{"_components-CWoJdK_F.js":{"file":"assets/components-CWoJdK_F.js","name":"components"},"src/routes/[...404].tsx?pick=default&pick=$css":{"file":"_...404_.js","name":"_...404_","src":"src/routes/[...404].tsx?pick=default&pick=$css","isEntry":true,"isDynamicEntry":true,"imports":["_components-CWoJdK_F.js"]},"src/routes/about.tsx?pick=default&pick=$css":{"file":"about.js","name":"about","src":"src/routes/about.tsx?pick=default&pick=$css","isEntry":true,"isDynamicEntry":true,"imports":["_components-CWoJdK_F.js"]},"src/routes/index.tsx?pick=default&pick=$css":{"file":"index.js","name":"index","src":"src/routes/index.tsx?pick=default&pick=$css","isEntry":true,"isDynamicEntry":true},"virtual:$vinxi/handler/ssr":{"file":"ssr.js","name":"ssr","src":"virtual:$vinxi/handler/ssr","isEntry":true,"imports":["_components-CWoJdK_F.js"],"dynamicImports":["src/routes/[...404].tsx?pick=default&pick=$css","src/routes/[...404].tsx?pick=default&pick=$css","src/routes/about.tsx?pick=default&pick=$css","src/routes/about.tsx?pick=default&pick=$css","src/routes/index.tsx?pick=default&pick=$css","src/routes/index.tsx?pick=default&pick=$css"],"css":["assets/ssr-CTZZ5qDH.css"]}},"client":{"_components-I1iEu2cH.js":{"file":"assets/components-I1iEu2cH.js","name":"components","imports":["_web-CL-KMgy-.js"]},"_web-CL-KMgy-.js":{"file":"assets/web-CL-KMgy-.js","name":"web"},"src/routes/[...404].tsx?pick=default&pick=$css":{"file":"assets/_...404_-e-CndLV0.js","name":"_...404_","src":"src/routes/[...404].tsx?pick=default&pick=$css","isEntry":true,"isDynamicEntry":true,"imports":["_web-CL-KMgy-.js","_components-I1iEu2cH.js"]},"src/routes/about.tsx?pick=default&pick=$css":{"file":"assets/about-BksR-rd3.js","name":"about","src":"src/routes/about.tsx?pick=default&pick=$css","isEntry":true,"isDynamicEntry":true,"imports":["_web-CL-KMgy-.js","_components-I1iEu2cH.js"]},"src/routes/index.tsx?pick=default&pick=$css":{"file":"assets/index-BZwFSJ1D.js","name":"index","src":"src/routes/index.tsx?pick=default&pick=$css","isEntry":true,"isDynamicEntry":true,"imports":["_web-CL-KMgy-.js"]},"virtual:$vinxi/handler/client":{"file":"assets/client-D_UdoWFx.js","name":"client","src":"virtual:$vinxi/handler/client","isEntry":true,"imports":["_web-CL-KMgy-.js","_components-I1iEu2cH.js"],"dynamicImports":["src/routes/[...404].tsx?pick=default&pick=$css","src/routes/about.tsx?pick=default&pick=$css","src/routes/index.tsx?pick=default&pick=$css"],"css":["assets/client-CTZZ5qDH.css"]}},"server-fns":{"_components-CWoJdK_F.js":{"file":"assets/components-CWoJdK_F.js","name":"components"},"_server-fns-C5zym07_.js":{"file":"assets/server-fns-C5zym07_.js","name":"server-fns","dynamicImports":["src/routes/[...404].tsx?pick=default&pick=$css","src/routes/[...404].tsx?pick=default&pick=$css","src/routes/about.tsx?pick=default&pick=$css","src/routes/about.tsx?pick=default&pick=$css","src/routes/index.tsx?pick=default&pick=$css","src/routes/index.tsx?pick=default&pick=$css","src/app.tsx"]},"src/app.tsx":{"file":"assets/app-CD-f1n0S.js","name":"app","src":"src/app.tsx","isDynamicEntry":true,"imports":["_server-fns-C5zym07_.js","_components-CWoJdK_F.js"],"css":["assets/app-DdRVE1IF.css"]},"src/routes/[...404].tsx?pick=default&pick=$css":{"file":"_...404_.js","name":"_...404_","src":"src/routes/[...404].tsx?pick=default&pick=$css","isEntry":true,"isDynamicEntry":true,"imports":["_components-CWoJdK_F.js"]},"src/routes/about.tsx?pick=default&pick=$css":{"file":"about.js","name":"about","src":"src/routes/about.tsx?pick=default&pick=$css","isEntry":true,"isDynamicEntry":true,"imports":["_components-CWoJdK_F.js"]},"src/routes/index.tsx?pick=default&pick=$css":{"file":"index.js","name":"index","src":"src/routes/index.tsx?pick=default&pick=$css","isEntry":true,"isDynamicEntry":true},"virtual:$vinxi/handler/server-fns":{"file":"server-fns.js","name":"server-fns","src":"virtual:$vinxi/handler/server-fns","isEntry":true,"imports":["_server-fns-C5zym07_.js"]}}};

					const routeManifest = {"ssr":{},"client":{},"server-fns":{}};

        function createProdApp(appConfig) {
          return {
            config: { ...appConfig, buildManifest, routeManifest },
            getRouter(name) {
              return appConfig.routers.find(router => router.name === name)
            }
          }
        }

        function plugin(app) {
          const prodApp = createProdApp(appConfig);
          globalThis.app = prodApp;
        }

const chunks = {};
			 



			 function app() {
				 globalThis.$$chunks = chunks;
			 }

const plugins = [
  plugin,
_7EQHWErDIIv5Q5bMVnEuT89NB6HArHaeId1ldkK0asQ,
_LCu4rUohui_ufMpYZVoVqftlhGmtkiNFNfscGNvrkks,
app
];

const assets = {
  "/assets/ssr-CTZZ5qDH.css": {
    "type": "text/css; charset=utf-8",
    "encoding": null,
    "etag": "\"2de4-x+OlzCPgZqKNpPZUKUaNdURAs4M\"",
    "mtime": "2026-08-10T15:49:15.394Z",
    "size": 11748,
    "path": "../../.output/public/assets/ssr-CTZZ5qDH.css"
  },
  "/assets/ssr-CTZZ5qDH.css.br": {
    "type": "text/css; charset=utf-8",
    "encoding": "br",
    "etag": "\"b58-XNBAgvOT62mbLht/rvJcrNC33gU\"",
    "mtime": "2026-08-10T15:49:15.418Z",
    "size": 2904,
    "path": "../../.output/public/assets/ssr-CTZZ5qDH.css.br"
  },
  "/assets/ssr-CTZZ5qDH.css.gz": {
    "type": "text/css; charset=utf-8",
    "encoding": "gzip",
    "etag": "\"cec-BXigTzFofp79PIJ+wJvwz0hGQCE\"",
    "mtime": "2026-08-10T15:49:15.418Z",
    "size": 3308,
    "path": "../../.output/public/assets/ssr-CTZZ5qDH.css.gz"
  },
  "/_build/.vite/manifest.json.br": {
    "type": "application/json",
    "encoding": "br",
    "etag": "\"152-WYmDC8HWhYfrN1ASsFs7Ws9gJXo\"",
    "mtime": "2026-08-10T15:49:15.418Z",
    "size": 338,
    "path": "../../.output/public/_build/.vite/manifest.json.br"
  },
  "/_build/.vite/manifest.json": {
    "type": "application/json",
    "encoding": null,
    "etag": "\"662-iO6jgCankRBZn3Ijz8MtVtW3mgk\"",
    "mtime": "2026-08-10T15:49:15.397Z",
    "size": 1634,
    "path": "../../.output/public/_build/.vite/manifest.json"
  },
  "/_build/.vite/manifest.json.gz": {
    "type": "application/json",
    "encoding": "gzip",
    "etag": "\"189-h1LRw32QsJAYBbiOX6dd1Cm0/U0\"",
    "mtime": "2026-08-10T15:49:15.418Z",
    "size": 393,
    "path": "../../.output/public/_build/.vite/manifest.json.gz"
  },
  "/_server/assets/app-DdRVE1IF.css": {
    "type": "text/css; charset=utf-8",
    "encoding": null,
    "etag": "\"2df9-92GkzgY/EKfoNhHKhWIwb/Az/EU\"",
    "mtime": "2026-08-10T15:49:15.398Z",
    "size": 11769,
    "path": "../../.output/public/_server/assets/app-DdRVE1IF.css"
  },
  "/_server/assets/app-DdRVE1IF.css.gz": {
    "type": "text/css; charset=utf-8",
    "encoding": "gzip",
    "etag": "\"cf2-Y9LCMTdrmPmeribf42MgHEji1S8\"",
    "mtime": "2026-08-10T15:49:15.429Z",
    "size": 3314,
    "path": "../../.output/public/_server/assets/app-DdRVE1IF.css.gz"
  },
  "/_server/assets/app-DdRVE1IF.css.br": {
    "type": "text/css; charset=utf-8",
    "encoding": "br",
    "etag": "\"b61-KIW2t8TMS5vvZwZt31C3J+9yMAo\"",
    "mtime": "2026-08-10T15:49:15.431Z",
    "size": 2913,
    "path": "../../.output/public/_server/assets/app-DdRVE1IF.css.br"
  },
  "/_build/assets/_...404_-e-CndLV0.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": "\"1ce-ewkTWbILq1QnfV4j4N5rVcUNaqI\"",
    "mtime": "2026-08-10T15:49:15.397Z",
    "size": 462,
    "path": "../../.output/public/_build/assets/_...404_-e-CndLV0.js"
  },
  "/_build/assets/about-BksR-rd3.js.br": {
    "type": "text/javascript; charset=utf-8",
    "encoding": "br",
    "etag": "\"254-hTuc/56wJfEMecmQV9Kg6moKHqc\"",
    "mtime": "2026-08-10T15:49:15.418Z",
    "size": 596,
    "path": "../../.output/public/_build/assets/about-BksR-rd3.js.br"
  },
  "/_build/assets/about-BksR-rd3.js": {
    "type": "text/javascript; charset=utf-8",
    "encoding": null,
    "etag": "\"4bd-Wd0dfnkhDfqMnX/n7GG4j74bOvc\"",
    "mtime": "2026-08-10T15:49:15.397Z",
    "size": 1213,
    "path": "../../.output/public/_build/assets/about-BksR-rd3.js"
  },
  "/_build/assets/about-BksR-rd3.js.gz": {
    "type": "text/javascript; charset=utf-8",
    "encoding": "gzip",
    "etag": "\"2d8-FGDO+ILkNMlFvic3zq3XJmpbaLs\"",
    "mtime": "2026-08-10T15:49:15.418Z",
    "size": 728,
    "path": "../../.output/public/_build/assets/about-BksR-rd3.js.gz"
  },
  "/_build/assets/client-CTZZ5qDH.css": {
    "type": "text/css; charset=utf-8",
    "encoding": null,
    "etag": "\"2de4-x+OlzCPgZqKNpPZUKUaNdURAs4M\"",
    "mtime": "2026-08-10T15:49:15.397Z",
    "size": 11748,
    "path": "../../.output/public/_build/assets/client-CTZZ5qDH.css"
  },
  "/_build/assets/client-CTZZ5qDH.css.gz": {
    "type": "text/css; charset=utf-8",
    "encoding": "gzip",
    "etag": "\"cec-BXigTzFofp79PIJ+wJvwz0hGQCE\"",
    "mtime": "2026-08-10T15:49:15.418Z",
    "size": 3308,
    "path": "../../.output/public/_build/assets/client-CTZZ5qDH.css.gz"
  },
  "/_build/assets/client-D_UdoWFx.js": {
    "type": "text/javascript; charset=utf-8",
    "encoding": null,
    "etag": "\"3e63-SuLm4keD7nPmEYkhKd6QVVDjkzE\"",
    "mtime": "2026-08-10T15:49:15.397Z",
    "size": 15971,
    "path": "../../.output/public/_build/assets/client-D_UdoWFx.js"
  },
  "/_build/assets/client-CTZZ5qDH.css.br": {
    "type": "text/css; charset=utf-8",
    "encoding": "br",
    "etag": "\"b58-XNBAgvOT62mbLht/rvJcrNC33gU\"",
    "mtime": "2026-08-10T15:49:15.418Z",
    "size": 2904,
    "path": "../../.output/public/_build/assets/client-CTZZ5qDH.css.br"
  },
  "/_build/assets/client-D_UdoWFx.js.br": {
    "type": "text/javascript; charset=utf-8",
    "encoding": "br",
    "etag": "\"16cb-b0y9mFJ3hiO3AD5qO8ZAA7WIcek\"",
    "mtime": "2026-08-10T15:49:15.429Z",
    "size": 5835,
    "path": "../../.output/public/_build/assets/client-D_UdoWFx.js.br"
  },
  "/_build/assets/client-D_UdoWFx.js.gz": {
    "type": "text/javascript; charset=utf-8",
    "encoding": "gzip",
    "etag": "\"1980-m0sbwTts2Do9NlEaQCYcdjOjsVA\"",
    "mtime": "2026-08-10T15:49:15.418Z",
    "size": 6528,
    "path": "../../.output/public/_build/assets/client-D_UdoWFx.js.gz"
  },
  "/_build/assets/components-I1iEu2cH.js.br": {
    "type": "text/javascript; charset=utf-8",
    "encoding": "br",
    "etag": "\"d9c-k09qERU3Rl/eG4IEsvmYxKSazs8\"",
    "mtime": "2026-08-10T15:49:15.418Z",
    "size": 3484,
    "path": "../../.output/public/_build/assets/components-I1iEu2cH.js.br"
  },
  "/_build/assets/components-I1iEu2cH.js.gz": {
    "type": "text/javascript; charset=utf-8",
    "encoding": "gzip",
    "etag": "\"eea-MaL11S979sfMhDLkRbo36tq7K2A\"",
    "mtime": "2026-08-10T15:49:15.418Z",
    "size": 3818,
    "path": "../../.output/public/_build/assets/components-I1iEu2cH.js.gz"
  },
  "/_build/assets/components-I1iEu2cH.js": {
    "type": "text/javascript; charset=utf-8",
    "encoding": null,
    "etag": "\"1fc9-o1wQ+qRMGwziTSbH1n7AV0rMwoA\"",
    "mtime": "2026-08-10T15:49:15.397Z",
    "size": 8137,
    "path": "../../.output/public/_build/assets/components-I1iEu2cH.js"
  },
  "/_build/assets/index-BZwFSJ1D.js": {
    "type": "text/javascript; charset=utf-8",
    "encoding": null,
    "etag": "\"7c5-XghnvdlHSA0vNG5bkL1zX5fAB9E\"",
    "mtime": "2026-08-10T15:49:15.397Z",
    "size": 1989,
    "path": "../../.output/public/_build/assets/index-BZwFSJ1D.js"
  },
  "/_build/assets/index-BZwFSJ1D.js.gz": {
    "type": "text/javascript; charset=utf-8",
    "encoding": "gzip",
    "etag": "\"423-nX1ireUXY+V+JMx37znF7LaY0LY\"",
    "mtime": "2026-08-10T15:49:15.418Z",
    "size": 1059,
    "path": "../../.output/public/_build/assets/index-BZwFSJ1D.js.gz"
  },
  "/_build/assets/index-BZwFSJ1D.js.br": {
    "type": "text/javascript; charset=utf-8",
    "encoding": "br",
    "etag": "\"367-bPTlxFRfNVTQctiuN1dqEKM79cs\"",
    "mtime": "2026-08-10T15:49:15.418Z",
    "size": 871,
    "path": "../../.output/public/_build/assets/index-BZwFSJ1D.js.br"
  },
  "/_build/assets/web-CL-KMgy-.js": {
    "type": "text/javascript; charset=utf-8",
    "encoding": null,
    "etag": "\"65f0-tIECrM9HTZRQgG+Vf5Nr0Fm9DEU\"",
    "mtime": "2026-08-10T15:49:15.397Z",
    "size": 26096,
    "path": "../../.output/public/_build/assets/web-CL-KMgy-.js"
  },
  "/_build/assets/web-CL-KMgy-.js.br": {
    "type": "text/javascript; charset=utf-8",
    "encoding": "br",
    "etag": "\"23a8-TnSjoJUkh0y+ExnAw3h9+JZvyEE\"",
    "mtime": "2026-08-10T15:49:15.440Z",
    "size": 9128,
    "path": "../../.output/public/_build/assets/web-CL-KMgy-.js.br"
  },
  "/_build/assets/web-CL-KMgy-.js.gz": {
    "type": "text/javascript; charset=utf-8",
    "encoding": "gzip",
    "etag": "\"2727-IuxVcd+XRqdxzpiK8oiE8kLzX4k\"",
    "mtime": "2026-08-10T15:49:15.418Z",
    "size": 10023,
    "path": "../../.output/public/_build/assets/web-CL-KMgy-.js.gz"
  }
};

function readAsset (id) {
  const serverDir = dirname(fileURLToPath(globalThis._importMeta_.url));
  return promises.readFile(resolve(serverDir, assets[id].path))
}

const publicAssetBases = {};

function isPublicAssetURL(id = '') {
  if (assets[id]) {
    return true
  }
  for (const base in publicAssetBases) {
    if (id.startsWith(base)) { return true }
  }
  return false
}

function getAsset (id) {
  return assets[id]
}

const METHODS = /* @__PURE__ */ new Set(["HEAD", "GET"]);
const EncodingMap = { gzip: ".gz", br: ".br" };
const _hzN7YT = eventHandler((event) => {
  if (event.method && !METHODS.has(event.method)) {
    return;
  }
  let id = decodePath(
    withLeadingSlash(withoutTrailingSlash(parseURL(event.path).pathname))
  );
  let asset;
  const encodingHeader = String(
    getRequestHeader(event, "accept-encoding") || ""
  );
  const encodings = [
    ...encodingHeader.split(",").map((e) => EncodingMap[e.trim()]).filter(Boolean).sort(),
    ""
  ];
  for (const encoding of encodings) {
    for (const _id of [id + encoding, joinURL(id, "index.html" + encoding)]) {
      const _asset = getAsset(_id);
      if (_asset) {
        asset = _asset;
        id = _id;
        break;
      }
    }
  }
  if (!asset) {
    if (isPublicAssetURL(id)) {
      removeResponseHeader(event, "Cache-Control");
      throw createError({ statusCode: 404 });
    }
    return;
  }
  if (asset.encoding !== void 0) {
    appendResponseHeader(event, "Vary", "Accept-Encoding");
  }
  const ifNotMatch = getRequestHeader(event, "if-none-match") === asset.etag;
  if (ifNotMatch) {
    setResponseStatus(event, 304, "Not Modified");
    return "";
  }
  const ifModifiedSinceH = getRequestHeader(event, "if-modified-since");
  const mtimeDate = new Date(asset.mtime);
  if (ifModifiedSinceH && asset.mtime && new Date(ifModifiedSinceH) >= mtimeDate) {
    setResponseStatus(event, 304, "Not Modified");
    return "";
  }
  if (asset.type && !getResponseHeader(event, "Content-Type")) {
    setResponseHeader(event, "Content-Type", asset.type);
  }
  if (asset.etag && !getResponseHeader(event, "ETag")) {
    setResponseHeader(event, "ETag", asset.etag);
  }
  if (asset.mtime && !getResponseHeader(event, "Last-Modified")) {
    setResponseHeader(event, "Last-Modified", mtimeDate.toUTCString());
  }
  if (asset.encoding && !getResponseHeader(event, "Content-Encoding")) {
    setResponseHeader(event, "Content-Encoding", asset.encoding);
  }
  if (asset.size > 0 && !getResponseHeader(event, "Content-Length")) {
    setResponseHeader(event, "Content-Length", asset.size);
  }
  return readAsset(id);
});

var __defProp$1 = Object.defineProperty;
var __defNormalProp$1 = (obj, key, value) => key in obj ? __defProp$1(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$1 = (obj, key, value) => __defNormalProp$1(obj, typeof key !== "symbol" ? key + "" : key, value);
function Yt$1(e, r) {
  const t = (e || "").split(";").filter((u) => typeof u == "string" && !!u.trim()), n = t.shift() || "", s = Gt$1(n), i = s.name;
  let a = s.value;
  try {
    a = (r == null ? void 0 : r.decode) === false ? a : ((r == null ? void 0 : r.decode) || decodeURIComponent)(a);
  } catch {
  }
  const o = { name: i, value: a };
  for (const u of t) {
    const c = u.split("="), f = (c.shift() || "").trimStart().toLowerCase(), g = c.join("=");
    switch (f) {
      case "expires": {
        o.expires = new Date(g);
        break;
      }
      case "max-age": {
        o.maxAge = Number.parseInt(g, 10);
        break;
      }
      case "secure": {
        o.secure = true;
        break;
      }
      case "httponly": {
        o.httpOnly = true;
        break;
      }
      case "samesite": {
        o.sameSite = g;
        break;
      }
      default:
        o[f] = g;
    }
  }
  return o;
}
function Gt$1(e) {
  let r = "", t = "";
  const n = e.split("=");
  return n.length > 1 ? (r = n.shift(), t = n.join("=")) : t = e, { name: r, value: t };
}
function Wt$1(e = {}) {
  let r, t = false;
  const n = (a) => {
    if (r && r !== a) throw new Error("Context conflict");
  };
  let s;
  if (e.asyncContext) {
    const a = e.AsyncLocalStorage || globalThis.AsyncLocalStorage;
    a ? s = new a() : console.warn("[unctx] `AsyncLocalStorage` is not provided.");
  }
  const i = () => {
    if (s) {
      const a = s.getStore();
      if (a !== void 0) return a;
    }
    return r;
  };
  return { use: () => {
    const a = i();
    if (a === void 0) throw new Error("Context is not available");
    return a;
  }, tryUse: () => i(), set: (a, o) => {
    o || n(a), r = a, t = true;
  }, unset: () => {
    r = void 0, t = false;
  }, call: (a, o) => {
    n(a), r = a;
    try {
      return s ? s.run(a, o) : o();
    } finally {
      t || (r = void 0);
    }
  }, async callAsync(a, o) {
    r = a;
    const u = () => {
      r = a;
    }, c = () => r === a ? u : void 0;
    Be$1.add(c);
    try {
      const f = s ? s.run(a, o) : o();
      return t || (r = void 0), await f;
    } finally {
      Be$1.delete(c);
    }
  } };
}
function Zt$1(e = {}) {
  const r = {};
  return { get(t, n = {}) {
    return r[t] || (r[t] = Wt$1({ ...e, ...n })), r[t];
  } };
}
const se$1 = typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof global < "u" ? global : {}, je$1 = "__unctx__", Xt$1 = se$1[je$1] || (se$1[je$1] = Zt$1()), Jt$1 = (e, r = {}) => Xt$1.get(e, r), qe$1 = "__unctx_async_handlers__", Be$1 = se$1[qe$1] || (se$1[qe$1] = /* @__PURE__ */ new Set());
function Kt$1(e) {
  let r;
  const t = yr(e), n = { duplex: "half", method: e.method, headers: e.headers };
  return e.node.req.body instanceof ArrayBuffer ? new Request(t, { ...n, body: e.node.req.body }) : new Request(t, { ...n, get body() {
    return r || (r = un$1(e), r);
  } });
}
function Qt$1(e) {
  var _a2;
  return (_a2 = e.web) != null ? _a2 : e.web = { request: Kt$1(e), url: yr(e) }, e.web.request;
}
function xt$1() {
  return dn$1();
}
const hr = /* @__PURE__ */ Symbol("$HTTPEvent");
function en$1(e) {
  return typeof e == "object" && (e instanceof H3Event || (e == null ? void 0 : e[hr]) instanceof H3Event || (e == null ? void 0 : e.__is_event__) === true);
}
function S(e) {
  return function(...r) {
    var _a2;
    let t = r[0];
    if (en$1(t)) r[0] = t instanceof H3Event || t.__is_event__ ? t : t[hr];
    else {
      if (!((_a2 = globalThis.app.config.server.experimental) == null ? void 0 : _a2.asyncContext)) throw new Error("AsyncLocalStorage was not enabled. Use the `server.experimental.asyncContext: true` option in your app configuration to enable it. Or, pass the instance of HTTPEvent that you have as the first argument to the function.");
      if (t = xt$1(), !t) throw new Error("No HTTPEvent found in AsyncLocalStorage. Make sure you are using the function within the server runtime.");
      r.unshift(t);
    }
    return e(...r);
  };
}
const yr = S(getRequestURL), rn$1 = S(getRequestIP), ie$1 = S(setResponseStatus), Ve = S(getResponseStatus), tn$1 = S(getResponseStatusText), re = S(getResponseHeaders), Ye = S(getResponseHeader), nn$1 = S(setResponseHeader), br = S(appendResponseHeader), sn$1 = S(parseCookies), an$1 = S(getCookie), on$1 = S(setCookie), H$1 = S(setHeader), un$1 = S(getRequestWebStream), ln$1 = S(removeResponseHeader), cn$1 = S(Qt$1);
function fn$1() {
  var _a2;
  return Jt$1("nitro-app", { asyncContext: !!((_a2 = globalThis.app.config.server.experimental) == null ? void 0 : _a2.asyncContext), AsyncLocalStorage: AsyncLocalStorage });
}
function dn$1() {
  return fn$1().use().event;
}
const de$1 = "Invariant Violation", { setPrototypeOf: pn$1 = function(e, r) {
  return e.__proto__ = r, e;
} } = Object;
let _e$1 = class _e extends Error {
  constructor(r = de$1) {
    super(typeof r == "number" ? `${de$1}: ${r} (see https://github.com/apollographql/invariant-packages)` : r);
    __publicField$1(this, "framesToPop", 1);
    __publicField$1(this, "name", de$1);
    pn$1(this, _e.prototype);
  }
};
function vn(e, r) {
  if (!e) throw new _e$1(r);
}
const pe = "solidFetchEvent";
function gn$1(e) {
  return { request: cn$1(e), response: bn$1(e), clientAddress: rn$1(e), locals: {}, nativeEvent: e };
}
function mn$1(e) {
  return { ...e };
}
function hn$1(e) {
  if (!e.context[pe]) {
    const r = gn$1(e);
    e.context[pe] = r;
  }
  return e.context[pe];
}
function Ge(e, r) {
  for (const [t, n] of r.entries()) br(e, t, n);
}
let yn$1 = class yn {
  constructor(r) {
    __publicField$1(this, "event");
    this.event = r;
  }
  get(r) {
    const t = Ye(this.event, r);
    return Array.isArray(t) ? t.join(", ") : t || null;
  }
  has(r) {
    return this.get(r) !== null;
  }
  set(r, t) {
    return nn$1(this.event, r, t);
  }
  delete(r) {
    return ln$1(this.event, r);
  }
  append(r, t) {
    br(this.event, r, t);
  }
  getSetCookie() {
    const r = Ye(this.event, "Set-Cookie");
    return Array.isArray(r) ? r : [r];
  }
  forEach(r) {
    return Object.entries(re(this.event)).forEach(([t, n]) => r(Array.isArray(n) ? n.join(", ") : n, t, this));
  }
  entries() {
    return Object.entries(re(this.event)).map(([r, t]) => [r, Array.isArray(t) ? t.join(", ") : t])[Symbol.iterator]();
  }
  keys() {
    return Object.keys(re(this.event))[Symbol.iterator]();
  }
  values() {
    return Object.values(re(this.event)).map((r) => Array.isArray(r) ? r.join(", ") : r)[Symbol.iterator]();
  }
  [Symbol.iterator]() {
    return this.entries()[Symbol.iterator]();
  }
};
function bn$1(e) {
  return { get status() {
    return Ve(e);
  }, set status(r) {
    ie$1(e, r);
  }, get statusText() {
    return tn$1(e);
  }, set statusText(r) {
    ie$1(e, Ve(e), r);
  }, headers: new yn$1(e) };
}
const q$1 = { NORMAL: 0, WILDCARD: 1, PLACEHOLDER: 2 };
function Sn(e = {}) {
  const r = { options: e, rootNode: Sr(), staticRoutesMap: {} }, t = (n) => e.strictTrailingSlash ? n : n.replace(/\/$/, "") || "/";
  if (e.routes) for (const n in e.routes) We$1(r, t(n), e.routes[n]);
  return { ctx: r, lookup: (n) => Rn$1(r, t(n)), insert: (n, s) => We$1(r, t(n), s), remove: (n) => wn$1(r, t(n)) };
}
function Rn$1(e, r) {
  const t = e.staticRoutesMap[r];
  if (t) return t.data;
  const n = r.split("/"), s = {};
  let i = false, a = null, o = e.rootNode, u = null;
  for (let c = 0; c < n.length; c++) {
    const f = n[c];
    o.wildcardChildNode !== null && (a = o.wildcardChildNode, u = n.slice(c).join("/"));
    const g = o.children.get(f);
    if (g === void 0) {
      if (o && o.placeholderChildren.length > 1) {
        const y = n.length - c;
        o = o.placeholderChildren.find((l) => l.maxDepth === y) || null;
      } else o = o.placeholderChildren[0] || null;
      if (!o) break;
      o.paramName && (s[o.paramName] = f), i = true;
    } else o = g;
  }
  return (o === null || o.data === null) && a !== null && (o = a, s[o.paramName || "_"] = u, i = true), o ? i ? { ...o.data, params: i ? s : void 0 } : o.data : null;
}
function We$1(e, r, t) {
  let n = true;
  const s = r.split("/");
  let i = e.rootNode, a = 0;
  const o = [i];
  for (const u of s) {
    let c;
    if (c = i.children.get(u)) i = c;
    else {
      const f = En(u);
      c = Sr({ type: f, parent: i }), i.children.set(u, c), f === q$1.PLACEHOLDER ? (c.paramName = u === "*" ? `_${a++}` : u.slice(1), i.placeholderChildren.push(c), n = false) : f === q$1.WILDCARD && (i.wildcardChildNode = c, c.paramName = u.slice(3) || "_", n = false), o.push(c), i = c;
    }
  }
  for (const [u, c] of o.entries()) c.maxDepth = Math.max(o.length - u, c.maxDepth || 0);
  return i.data = t, n === true && (e.staticRoutesMap[r] = i), i;
}
function wn$1(e, r) {
  let t = false;
  const n = r.split("/");
  let s = e.rootNode;
  for (const i of n) if (s = s.children.get(i), !s) return t;
  if (s.data) {
    const i = n.at(-1) || "";
    s.data = null, Object.keys(s.children).length === 0 && s.parent && (s.parent.children.delete(i), s.parent.wildcardChildNode = null, s.parent.placeholderChildren = []), t = true;
  }
  return t;
}
function Sr(e = {}) {
  return { type: e.type || q$1.NORMAL, maxDepth: 0, parent: e.parent || null, children: /* @__PURE__ */ new Map(), data: e.data || null, paramName: e.paramName || null, wildcardChildNode: null, placeholderChildren: [] };
}
function En(e) {
  return e.startsWith("**") ? q$1.WILDCARD : e[0] === ":" || e === "*" ? q$1.PLACEHOLDER : q$1.NORMAL;
}
const Rr = [{ page: true, $component: { src: "src/routes/[...404].tsx?pick=default&pick=$css", build: () => import('../build/_...404_.mjs'), import: () => import('../build/_...404_.mjs') }, path: "/*404", filePath: "/Users/jonwheeler/jon_code/minwind/examples/demo/src/routes/[...404].tsx" }, { page: true, $component: { src: "src/routes/about.tsx?pick=default&pick=$css", build: () => import('../build/about.mjs'), import: () => import('../build/about.mjs') }, path: "/about", filePath: "/Users/jonwheeler/jon_code/minwind/examples/demo/src/routes/about.tsx" }, { page: true, $component: { src: "src/routes/index.tsx?pick=default&pick=$css", build: () => import('../build/index.mjs'), import: () => import('../build/index.mjs') }, path: "/", filePath: "/Users/jonwheeler/jon_code/minwind/examples/demo/src/routes/index.tsx" }], An = _n(Rr.filter((e) => e.page));
function _n(e) {
  function r(t, n, s, i) {
    const a = Object.values(t).find((o) => s.startsWith(o.id + "/"));
    return a ? (r(a.children || (a.children = []), n, s.slice(a.id.length)), t) : (t.push({ ...n, id: s, path: s.replace(/\([^)/]+\)/g, "").replace(/\/+/g, "/") }), t);
  }
  return e.sort((t, n) => t.path.length - n.path.length).reduce((t, n) => r(t, n, n.path, n.path), []);
}
function Tn$1(e) {
  return e.$HEAD || e.$GET || e.$POST || e.$PUT || e.$PATCH || e.$DELETE;
}
Sn({ routes: Rr.reduce((e, r) => {
  if (!Tn$1(r)) return e;
  let t = r.path.replace(/\([^)/]+\)/g, "").replace(/\/+/g, "/").replace(/\*([^/]*)/g, (n, s) => `**:${s}`).split("/").map((n) => n.startsWith(":") || n.startsWith("*") ? n : encodeURIComponent(n)).join("/");
  if (/:[^/]*\?/g.test(t)) throw new Error(`Optional parameters are not supported in API routes: ${t}`);
  if (e[t]) throw new Error(`Duplicate API routes for "${t}" found at "${e[t].route.path}" and "${r.path}"`);
  return e[t] = { route: r }, e;
}, {}) });
var On = " ";
const zn = { style: (e) => ssrElement("style", e.attrs, () => e.children, true), link: (e) => ssrElement("link", e.attrs, void 0, true), script: (e) => e.attrs.src ? ssrElement("script", mergeProps(() => e.attrs, { get id() {
  return e.key;
} }), () => ssr(On), true) : null, noscript: (e) => ssrElement("noscript", e.attrs, () => escape(e.children), true) };
function Cn(e, r) {
  let { tag: t, attrs: { key: n, ...s } = { key: void 0 }, children: i } = e;
  return zn[t]({ attrs: { ...s, nonce: r }, key: n, children: i });
}
function Nn(e, r, t, n = "default") {
  return lazy(async () => {
    var _a2;
    {
      const i = (await e.import())[n], o = (await ((_a2 = r.inputs) == null ? void 0 : _a2[e.src].assets())).filter((c) => c.tag === "style" || c.attrs.rel === "stylesheet");
      return { default: (c) => [...o.map((f) => Cn(f)), createComponent(i, c)] };
    }
  });
}
function wr() {
  function e(t) {
    return { ...t, ...t.$$route ? t.$$route.require().route : void 0, info: { ...t.$$route ? t.$$route.require().route.info : {}, filesystem: true }, component: t.$component && Nn(t.$component, globalThis.MANIFEST.client, globalThis.MANIFEST.ssr), children: t.children ? t.children.map(e) : void 0 };
  }
  return An.map(e);
}
let Ze;
const Zo = isServer ? () => getRequestEvent().routes : () => Ze || (Ze = wr());
function Pn(e) {
  const r = an$1(e.nativeEvent, "flash");
  if (r) try {
    let t = JSON.parse(r);
    if (!t || !t.result) return;
    const n = [...t.input.slice(0, -1), new Map(t.input[t.input.length - 1])], s = t.error ? new Error(t.result) : t.result;
    return { input: n, url: t.url, pending: false, result: t.thrown ? void 0 : s, error: t.thrown ? s : void 0 };
  } catch (t) {
    console.error(t);
  } finally {
    on$1(e.nativeEvent, "flash", "", { maxAge: 0 });
  }
}
async function Ln(e) {
  const r = globalThis.MANIFEST.client;
  return globalThis.MANIFEST.ssr, e.response.headers.set("Content-Type", "text/html"), Object.assign(e, { manifest: await r.json(), assets: [...await r.inputs[r.handler].assets()], router: { submission: Pn(e) }, routes: wr(), complete: false, $islands: /* @__PURE__ */ new Set() });
}
const Dn = /* @__PURE__ */ new Set([301, 302, 303, 307, 308]);
function Fn(e) {
  return e.status && Dn.has(e.status) ? e.status : 302;
}
const kn = {};
let Un = (function(e) {
  return e[e.AggregateError = 1] = "AggregateError", e[e.ArrowFunction = 2] = "ArrowFunction", e[e.ErrorPrototypeStack = 4] = "ErrorPrototypeStack", e[e.ObjectAssign = 8] = "ObjectAssign", e[e.BigIntTypedArray = 16] = "BigIntTypedArray", e[e.RegExp = 32] = "RegExp", e[e.Temporal = 64] = "Temporal", e;
})({});
const I$2 = Symbol.asyncIterator, Er = Symbol.hasInstance, B = Symbol.isConcatSpreadable, O$1 = Symbol.iterator, Ar = Symbol.match, _r = Symbol.matchAll, Tr = Symbol.replace, Ir = Symbol.search, Or = Symbol.species, zr = Symbol.split, Cr = Symbol.toPrimitive, V$2 = Symbol.toStringTag, Nr = Symbol.unscopables, Mn = { 0: "Symbol.asyncIterator", 1: "Symbol.hasInstance", 2: "Symbol.isConcatSpreadable", 3: "Symbol.iterator", 4: "Symbol.match", 5: "Symbol.matchAll", 6: "Symbol.replace", 7: "Symbol.search", 8: "Symbol.species", 9: "Symbol.split", 10: "Symbol.toPrimitive", 11: "Symbol.toStringTag", 12: "Symbol.unscopables" }, Pr = { [I$2]: 0, [Er]: 1, [B]: 2, [O$1]: 3, [Ar]: 4, [_r]: 5, [Tr]: 6, [Ir]: 7, [Or]: 8, [zr]: 9, [Cr]: 10, [V$2]: 11, [Nr]: 12 }, $n = { 0: I$2, 1: Er, 2: B, 3: O$1, 4: Ar, 5: _r, 6: Tr, 7: Ir, 8: Or, 9: zr, 10: Cr, 11: V$2, 12: Nr }, Hn = { 2: "!0", 3: "!1", 1: "void 0", 0: "null", 4: "-0", 5: "1/0", 6: "-1/0", 7: "0/0" }, jn = { 2: true, 3: false, 1: void 0, 0: null, 4: -0, 5: Number.POSITIVE_INFINITY, 6: Number.NEGATIVE_INFINITY, 7: NaN }, Lr = { 0: "Error", 1: "EvalError", 2: "RangeError", 3: "ReferenceError", 4: "SyntaxError", 5: "TypeError", 6: "URIError" }, qn = { 0: Error, 1: EvalError, 2: RangeError, 3: ReferenceError, 4: SyntaxError, 5: TypeError, 6: URIError };
function p(e, r, t, n, s, i, a, o, u, c, f, g) {
  return { t: e, i: r, s: t, c: n, m: s, p: i, e: a, a: o, f: u, b: c, o: f, l: g };
}
function F(e) {
  return p(2, void 0, e, void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0);
}
const Dr = F(2), Fr = F(3), Bn = F(1), Vn = F(0), Yn = F(4), Gn = F(5), Wn = F(6), Zn = F(7);
function Xn(e) {
  switch (e) {
    case '"':
      return '\\"';
    case "\\":
      return "\\\\";
    case `
`:
      return "\\n";
    case "\r":
      return "\\r";
    case "\b":
      return "\\b";
    case "	":
      return "\\t";
    case "\f":
      return "\\f";
    case "<":
      return "\\x3C";
    case "\u2028":
      return "\\u2028";
    case "\u2029":
      return "\\u2029";
    default:
      return;
  }
}
function A(e) {
  let r = "", t = 0, n;
  for (let s = 0, i = e.length; s < i; s++) n = Xn(e[s]), n && (r += e.slice(t, s) + n, t = s + 1);
  return t === 0 ? r = e : r += e.slice(t), r;
}
function Jn(e) {
  switch (e) {
    case "\\\\":
      return "\\";
    case '\\"':
      return '"';
    case "\\n":
      return `
`;
    case "\\r":
      return "\r";
    case "\\b":
      return "\b";
    case "\\t":
      return "	";
    case "\\f":
      return "\f";
    case "\\x3C":
      return "<";
    case "\\u2028":
      return "\u2028";
    case "\\u2029":
      return "\u2029";
    default:
      return e;
  }
}
function z$1(e) {
  return e.replace(/(\\\\|\\"|\\n|\\r|\\b|\\t|\\f|\\u2028|\\u2029|\\x3C)/g, Jn);
}
const te$2 = "__SEROVAL_REFS__", ne$1 = "self.$R";
function Kn(e) {
  return e == null ? `${ne$1}=${ne$1}||[]` : `(${ne$1}=${ne$1}||{})["${A(e)}"]=[]`;
}
const kr = /* @__PURE__ */ new Map(), j = /* @__PURE__ */ new Map();
function Ur(e) {
  return kr.has(e);
}
function Qn(e) {
  return j.has(e);
}
function xn(e) {
  if (Ur(e)) return kr.get(e);
  throw new Os(e);
}
function es(e) {
  if (Qn(e)) return j.get(e);
  throw new zs(e);
}
typeof globalThis < "u" ? Object.defineProperty(globalThis, te$2, { value: j, configurable: true, writable: false, enumerable: false }) : typeof self < "u" ? Object.defineProperty(self, te$2, { value: j, configurable: true, writable: false, enumerable: false }) : typeof global < "u" && Object.defineProperty(global, te$2, { value: j, configurable: true, writable: false, enumerable: false });
function Te(e) {
  return e instanceof EvalError ? 1 : e instanceof RangeError ? 2 : e instanceof ReferenceError ? 3 : e instanceof SyntaxError ? 4 : e instanceof TypeError ? 5 : e instanceof URIError ? 6 : 0;
}
function rs(e) {
  const r = Lr[Te(e)];
  return e.name !== r ? { name: e.name } : e.constructor.name !== r ? { name: e.constructor.name } : {};
}
function Mr(e, r) {
  let t = rs(e);
  const n = Object.getOwnPropertyNames(e);
  for (let s = 0, i = n.length, a; s < i; s++) a = n[s], a !== "name" && a !== "message" && (a === "stack" ? r & 4 && (t = t || {}, t[a] = e[a]) : (t = t || {}, t[a] = e[a]));
  return t;
}
function $r(e) {
  return Object.isFrozen(e) ? 3 : Object.isSealed(e) ? 2 : Object.isExtensible(e) ? 0 : 1;
}
function ts(e) {
  switch (e) {
    case Number.POSITIVE_INFINITY:
      return Gn;
    case Number.NEGATIVE_INFINITY:
      return Wn;
  }
  return e !== e ? Zn : Object.is(e, -0) ? Yn : p(0, void 0, e, void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0);
}
function Hr(e) {
  return p(1, void 0, A(e), void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0);
}
function ns(e) {
  return p(3, void 0, "" + e, void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0);
}
function ss(e) {
  return p(4, e, void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0);
}
function is(e, r) {
  const t = r.valueOf();
  return p(5, e, t !== t ? "" : r.toISOString(), void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0);
}
function P$1(e, r, t) {
  return p(36, e, t.toString(), r, void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0);
}
function as(e, r) {
  return p(6, e, void 0, A(r.source), r.flags, void 0, void 0, void 0, void 0, void 0, void 0, void 0);
}
function os(e, r) {
  return p(17, e, Pr[r], void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0);
}
function us(e, r) {
  return p(18, e, A(xn(r)), void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0);
}
function jr(e, r, t) {
  return p(25, e, t, A(r), void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0);
}
function ls(e, r, t) {
  return p(9, e, void 0, void 0, void 0, void 0, void 0, t, void 0, void 0, $r(r), void 0);
}
function cs(e, r) {
  return p(21, e, void 0, void 0, void 0, void 0, void 0, void 0, r, void 0, void 0, void 0);
}
function fs(e, r, t) {
  return p(15, e, void 0, r.constructor.name, void 0, void 0, void 0, void 0, t, r.byteOffset, void 0, r.length);
}
function ds(e, r, t) {
  return p(16, e, void 0, r.constructor.name, void 0, void 0, void 0, void 0, t, r.byteOffset, void 0, r.length);
}
function ps(e, r, t) {
  return p(20, e, void 0, void 0, void 0, void 0, void 0, void 0, t, r.byteOffset, void 0, r.byteLength);
}
function vs(e, r, t) {
  return p(13, e, Te(r), void 0, A(r.message), t, void 0, void 0, void 0, void 0, void 0, void 0);
}
function gs(e, r, t) {
  return p(14, e, Te(r), void 0, A(r.message), t, void 0, void 0, void 0, void 0, void 0, void 0);
}
function ms(e, r) {
  return p(7, e, void 0, void 0, void 0, void 0, void 0, r, void 0, void 0, void 0, void 0);
}
function hs(e, r) {
  return p(28, void 0, void 0, void 0, void 0, void 0, void 0, [e, r], void 0, void 0, void 0, void 0);
}
function ys(e, r) {
  return p(30, void 0, void 0, void 0, void 0, void 0, void 0, [e, r], void 0, void 0, void 0, void 0);
}
function bs(e, r, t) {
  return p(31, e, void 0, void 0, void 0, void 0, void 0, t, r, void 0, void 0, void 0);
}
function Ss(e, r) {
  return p(32, e, void 0, void 0, void 0, void 0, void 0, void 0, r, void 0, void 0, void 0);
}
function Rs(e, r) {
  return p(33, e, void 0, void 0, void 0, void 0, void 0, void 0, r, void 0, void 0, void 0);
}
function ws(e, r) {
  return p(34, e, void 0, void 0, void 0, void 0, void 0, void 0, r, void 0, void 0, void 0);
}
function Es(e, r, t, n) {
  return p(35, e, t, void 0, void 0, void 0, void 0, r, void 0, void 0, void 0, n);
}
const As = { parsing: 1, serialization: 2, deserialization: 3 };
function _s(e) {
  return `Seroval Error (step: ${As[e]})`;
}
const Ts = (e, r) => _s(e);
var qr = class extends Error {
  constructor(e, r) {
    super(Ts(e)), this.cause = r;
  }
}, Xe = class extends qr {
  constructor(e) {
    super("parsing", e);
  }
}, Is = class extends qr {
  constructor(e) {
    super("deserialization", e);
  }
};
function C$1(e) {
  return `Seroval Error (specific: ${e})`;
}
var ae$1 = class ae extends Error {
  constructor(e) {
    super(C$1(1)), this.value = e;
  }
}, N$1 = class N extends Error {
  constructor(e) {
    super(C$1(2));
  }
}, Br = class extends Error {
  constructor(e) {
    super(C$1(3));
  }
}, oe = class extends Error {
  constructor(e) {
    super(C$1(4));
  }
}, Os = class extends Error {
  constructor(e) {
    super(C$1(5)), this.value = e;
  }
}, zs = class extends Error {
  constructor(e) {
    super(C$1(6));
  }
}, Cs = class extends Error {
  constructor(e) {
    super(C$1(7));
  }
}, w$1 = class w extends Error {
  constructor(e) {
    super(C$1(8));
  }
}, Vr = class extends Error {
  constructor(e) {
    super(C$1(9));
  }
}, Ns = class {
  constructor(e, r) {
    this.value = e, this.replacement = r;
  }
};
const ue$1 = () => {
  const e = { p: 0, s: 0, f: 0 };
  return e.p = new Promise((r, t) => {
    e.s = r, e.f = t;
  }), e;
}, Ps = (e, r) => {
  e.s(r), e.p.s = 1, e.p.v = r;
}, Ls = (e, r) => {
  e.f(r), e.p.s = 2, e.p.v = r;
}, Ds = ue$1.toString(), Fs = Ps.toString(), ks = Ls.toString(), Yr = () => {
  const e = [], r = [];
  let t = true, n = false, s = 0;
  const i = { flush(a, o, u) {
    for (u = 0; u < s; u++) r[u] && r[u][o](a);
  }, up(a, o, u, c) {
    for (o = 0, u = e.length; o < u; o++) c = e[o], !t && o === u - 1 ? a[n ? "return" : "throw"](c) : a.next(c);
  }, on(a, o) {
    return t && (o = s++, r[o] = a), i.up(a), () => {
      t && (r[o] = r[s], r[s--] = void 0);
    };
  } };
  return { __SEROVAL_STREAM__: true, on(a) {
    return i.on(a);
  }, next(a) {
    t && (e.push(a), i.flush(a, "next"));
  }, throw(a) {
    t && (e.push(a), i.flush(a, "throw"), t = false, n = false, r.length = 0);
  }, return(a) {
    t && (e.push(a), i.flush(a, "return"), t = false, n = true, r.length = 0);
  } };
}, Us = Yr.toString(), Gr = (e) => (r) => () => {
  let t = 0;
  const n = { [e]() {
    return n;
  }, next() {
    if (t > r.d) return { done: true, value: void 0 };
    const s = t++, i = r.v[s];
    if (s === r.t) throw i;
    return { done: s === r.d, value: i };
  } };
  return n;
}, Ms = Gr.toString(), Wr = (e, r) => (t) => () => {
  let n = 0, s = -1, i = false;
  const a = [], o = [], u = { finalize(f = 0, g = o.length) {
    for (; f < g; f++) o[f].s({ done: true, value: void 0 });
  } };
  t.on({ next(f) {
    const g = o.shift();
    g && g.s({ done: false, value: f }), a.push(f);
  }, throw(f) {
    const g = o.shift();
    g && g.f(f), u.finalize(), s = a.length, i = true, a.push(f);
  }, return(f) {
    const g = o.shift();
    g && g.s({ done: true, value: f }), u.finalize(), s = a.length, a.push(f);
  } });
  const c = { [e]() {
    return c;
  }, next() {
    if (s === -1) {
      const y = n++;
      if (y >= a.length) {
        const l = r();
        return o.push(l), l.p;
      }
      return { done: false, value: a[y] };
    }
    if (n > s) return { done: true, value: void 0 };
    const f = n++, g = a[f];
    if (f !== s) return { done: false, value: g };
    if (i) throw g;
    return { done: true, value: g };
  } };
  return c;
}, $s = Wr.toString(), Zr = (e) => {
  const r = atob(e), t = r.length, n = new Uint8Array(t);
  for (let s = 0; s < t; s++) n[s] = r.charCodeAt(s);
  return n.buffer;
}, Hs = Zr.toString();
function js(e) {
  return "__SEROVAL_SEQUENCE__" in e;
}
function Xr(e, r, t) {
  return { __SEROVAL_SEQUENCE__: true, v: e, t: r, d: t };
}
function qs(e) {
  const r = [];
  let t = -1, n = -1;
  const s = e[O$1]();
  for (; ; ) try {
    const i = s.next();
    if (r.push(i.value), i.done) {
      n = r.length - 1;
      break;
    }
  } catch (i) {
    t = r.length, r.push(i);
  }
  return Xr(r, t, n);
}
const Bs = Gr(O$1);
function Vs(e) {
  return Bs(e);
}
const Ys = {}, Gs = {}, Ws = { 0: {}, 1: {}, 2: {}, 3: {}, 4: {}, 5: {} }, Zs = { 0: "[]", 1: Ds, 2: Fs, 3: ks, 4: Us, 5: Hs };
function Xs(e) {
  return "__SEROVAL_STREAM__" in e;
}
function Q$2() {
  return Yr();
}
function Js(e) {
  const r = Q$2(), t = e[I$2]();
  async function n() {
    try {
      const s = await t.next();
      s.done ? r.return(s.value) : (r.next(s.value), await n());
    } catch (s) {
      r.throw(s);
    }
  }
  return n().catch(() => {
  }), r;
}
const Ks = Wr(I$2, ue$1);
function Qs(e) {
  return Ks(e);
}
function xs(e, r) {
  return { plugins: r.plugins, mode: e, marked: /* @__PURE__ */ new Set(), features: 127 ^ (r.disabledFeatures || 0), refs: r.refs || /* @__PURE__ */ new Map(), depthLimit: r.depthLimit || 1e3 };
}
function ei(e, r) {
  e.marked.add(r);
}
function Jr(e, r) {
  const t = e.refs.size;
  return e.refs.set(r, t), t;
}
function le$1(e, r) {
  const t = e.refs.get(r);
  return t != null ? (ei(e, t), { type: 1, value: ss(t) }) : { type: 0, value: Jr(e, r) };
}
function Ie$1(e, r) {
  const t = le$1(e, r);
  return t.type === 1 ? t : Ur(r) ? { type: 2, value: us(t.value, r) } : t;
}
function k(e, r) {
  const t = Ie$1(e, r);
  if (t.type !== 0) return t.value;
  if (r in Pr) return os(t.value, r);
  throw new ae$1(r);
}
function M(e, r) {
  const t = le$1(e, Ws[r]);
  return t.type === 1 ? t.value : p(26, t.value, r, void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0);
}
function ri(e) {
  const r = le$1(e, Ys);
  return r.type === 1 ? r.value : p(27, r.value, void 0, void 0, void 0, void 0, void 0, void 0, k(e, O$1), void 0, void 0, void 0);
}
function ti(e) {
  const r = le$1(e, Gs);
  return r.type === 1 ? r.value : p(29, r.value, void 0, void 0, void 0, void 0, void 0, [M(e, 1), k(e, I$2)], void 0, void 0, void 0, void 0);
}
function ni(e, r, t, n) {
  return p(t ? 11 : 10, e, void 0, void 0, void 0, n, void 0, void 0, void 0, void 0, $r(r), void 0);
}
function si(e, r, t, n) {
  return p(8, r, void 0, void 0, void 0, void 0, { k: t, v: n }, void 0, M(e, 0), void 0, void 0, void 0);
}
function ii(e, r, t) {
  return p(22, r, t, void 0, void 0, void 0, void 0, void 0, M(e, 1), void 0, void 0, void 0);
}
function ai(e, r, t) {
  const n = new Uint8Array(t);
  let s = "";
  for (let i = 0, a = n.length; i < a; i++) s += String.fromCharCode(n[i]);
  return p(19, r, A(btoa(s)), void 0, void 0, void 0, void 0, void 0, M(e, 5), void 0, void 0, void 0);
}
function Kr(e, r) {
  for (let t = 0, n = r.length; t < n; t++) {
    const s = r[t];
    e.has(s) || (e.add(s), s.extends && Kr(e, s.extends));
  }
}
function Oe$1(e) {
  if (e) {
    const r = /* @__PURE__ */ new Set();
    return Kr(r, e), [...r];
  }
}
function oi(e) {
  switch (e) {
    case "Int8Array":
      return Int8Array;
    case "Int16Array":
      return Int16Array;
    case "Int32Array":
      return Int32Array;
    case "Uint8Array":
      return Uint8Array;
    case "Uint16Array":
      return Uint16Array;
    case "Uint32Array":
      return Uint32Array;
    case "Uint8ClampedArray":
      return Uint8ClampedArray;
    case "Float32Array":
      return Float32Array;
    case "Float64Array":
      return Float64Array;
    case "BigInt64Array":
      return BigInt64Array;
    case "BigUint64Array":
      return BigUint64Array;
    default:
      throw new Cs(e);
  }
}
function ze$1(e) {
  switch (e) {
    case "constructor":
    case "__proto__":
    case "prototype":
    case "__defineGetter__":
    case "__defineSetter__":
    case "__lookupGetter__":
    case "__lookupSetter__":
      return false;
    default:
      return true;
  }
}
function ui(e) {
  switch (e) {
    case I$2:
    case B:
    case V$2:
    case O$1:
      return true;
    default:
      return false;
  }
}
const li = 1e6, ci = 1e4, fi = 2e4;
function Qr(e, r) {
  switch (r) {
    case 3:
      return Object.freeze(e);
    case 1:
      return Object.preventExtensions(e);
    case 2:
      return Object.seal(e);
    default:
      return e;
  }
}
const di = 1e3;
function pi(e, r) {
  var t;
  const n = r.refs || /* @__PURE__ */ new Map();
  return "types" in n || Object.assign(n, { types: /* @__PURE__ */ new Map() }), { mode: e, plugins: r.plugins, refs: n, features: (t = r.features) !== null && t !== void 0 ? t : 127 ^ (r.disabledFeatures || 0), depthLimit: r.depthLimit || di };
}
function vi(e) {
  return { mode: 1, base: pi(1, e), child: void 0, state: { marked: new Set(e.markedRefs) } };
}
var gi = class {
  constructor(e, r) {
    this._p = e, this.depth = r;
  }
  deserialize(e) {
    return m(this._p, this.depth, e);
  }
};
function xr(e, r) {
  if (r < 0 || !Number.isFinite(r) || !Number.isInteger(r)) throw new w$1({ t: 4, i: r });
  if (e.refs.has(r)) throw new Error("Conflicted ref id: " + r);
}
function et(e) {
  return !!e && typeof e == "object" && "then" in e && typeof e.then == "function";
}
function mi(e, r, t) {
  return xr(e.base, r), e.state.marked.has(r) && e.base.refs.set(r, t), t;
}
function hi(e, r, t) {
  return xr(e.base, r), e.base.refs.set(r, t), t;
}
function h(e, r, t) {
  return e.mode === 1 ? mi(e, r, t) : hi(e, r, t);
}
function we(e, r, t) {
  if (Object.hasOwn(r, t)) return r[t];
  throw new w$1(e);
}
function yi(e, r) {
  return h(e, r.i, es(z$1(r.s)));
}
function bi(e, r, t) {
  const n = t.a, s = n.length, i = h(e, t.i, new Array(s));
  for (let a = 0, o; a < s; a++) o = n[a], o && (i[a] = m(e, r, o));
  return Qr(i, t.o), i;
}
function Je(e, r, t) {
  ze$1(r) ? e[r] = t : Object.defineProperty(e, r, { value: t, configurable: true, enumerable: true, writable: true });
}
function Si(e, r, t, n, s) {
  if (typeof n == "string") Je(t, z$1(n), m(e, r, s));
  else {
    const i = m(e, r, n);
    switch (typeof i) {
      case "string":
        Je(t, i, m(e, r, s));
        break;
      case "symbol":
        ui(i) && (t[i] = m(e, r, s));
        break;
      default:
        throw new w$1(n);
    }
  }
}
function rt(e, r, t) {
  e.base.refs.types.set(r, t);
}
function ce$1(e, r, t, n) {
  if (e.base.refs.types.get(t) !== n) throw new w$1(r);
}
function tt(e, r, t, n) {
  const s = t.k;
  if (s.length > 0) for (let i = 0, a = t.v, o = s.length; i < o; i++) Si(e, r, n, s[i], a[i]);
  return n;
}
function Ri(e, r, t) {
  const n = h(e, t.i, t.t === 10 ? {} : /* @__PURE__ */ Object.create(null));
  return tt(e, r, t.p, n), Qr(n, t.o), n;
}
function wi(e, r) {
  return h(e, r.i, new Date(r.s));
}
function Ei(e, r) {
  if (!(e.base.features & 64)) throw new N$1(r);
  let t;
  switch (r.c) {
    case 0:
      t = Temporal.Instant.from(r.s);
      break;
    case 1:
      t = Temporal.Duration.from(r.s);
      break;
    case 2:
      t = Temporal.PlainDate.from(r.s);
      break;
    case 3:
      t = Temporal.PlainDateTime.from(r.s);
      break;
    case 4:
      t = Temporal.PlainMonthDay.from(r.s);
      break;
    case 5:
      t = Temporal.PlainTime.from(r.s);
      break;
    case 6:
      t = Temporal.PlainYearMonth.from(r.s);
      break;
    case 7:
      t = Temporal.ZonedDateTime.from(r.s);
      break;
    default:
      throw new w$1(r);
  }
  return h(e, r.i, t);
}
function Ai(e, r) {
  if (e.base.features & 32) {
    const t = z$1(r.c);
    if (t.length > fi) throw new w$1(r);
    return h(e, r.i, new RegExp(t, r.m));
  }
  throw new N$1(r);
}
function _i(e, r, t) {
  const n = h(e, t.i, /* @__PURE__ */ new Set());
  for (let s = 0, i = t.a, a = i.length; s < a; s++) n.add(m(e, r, i[s]));
  return n;
}
function Ti(e, r, t) {
  const n = h(e, t.i, /* @__PURE__ */ new Map());
  for (let s = 0, i = t.e.k, a = t.e.v, o = i.length; s < o; s++) n.set(m(e, r, i[s]), m(e, r, a[s]));
  return n;
}
function Ii(e, r) {
  if (r.s.length > li) throw new w$1(r);
  return h(e, r.i, Zr(z$1(r.s)));
}
function Oi(e, r, t) {
  var n;
  const s = oi(t.c), i = m(e, r, t.f), a = (n = t.b) !== null && n !== void 0 ? n : 0;
  if (a < 0 || a > i.byteLength) throw new w$1(t);
  return h(e, t.i, new s(i, a, t.l));
}
function zi(e, r, t) {
  var n;
  const s = m(e, r, t.f), i = (n = t.b) !== null && n !== void 0 ? n : 0;
  if (i < 0 || i > s.byteLength) throw new w$1(t);
  return h(e, t.i, new DataView(s, i, t.l));
}
function nt(e, r, t, n) {
  if (t.p) {
    const s = tt(e, r, t.p, {});
    Object.defineProperties(n, Object.getOwnPropertyDescriptors(s));
  }
  return n;
}
function Ci(e, r, t) {
  return nt(e, r, t, h(e, t.i, new AggregateError([], z$1(t.m))));
}
function Ni(e, r, t) {
  const n = we(t, qn, t.s);
  return nt(e, r, t, h(e, t.i, new n(z$1(t.m))));
}
function Pi(e, r, t) {
  const n = ue$1(), s = h(e, t.i, n.p), i = m(e, r, t.f);
  if (et(i)) throw new w$1(t.f);
  return t.s ? n.s(i) : n.f(i), s;
}
function Li(e, r, t) {
  return h(e, t.i, Object(m(e, r, t.f)));
}
function Di(e, r, t) {
  const n = e.base.plugins;
  if (n) {
    const s = z$1(t.c);
    for (let i = 0, a = n.length; i < a; i++) {
      const o = n[i];
      if (o.tag === s) return h(e, t.i, o.deserialize(t.s, new gi(e, r), { id: t.i }));
    }
  }
  throw new Br(t.c);
}
function Fi(e, r) {
  const t = h(e, r.i, h(e, r.s, ue$1()).p);
  return rt(e, r.s, 22), t;
}
function ki(e, r, t) {
  const n = e.base.refs.get(t.i);
  if (n) {
    ce$1(e, t, t.i, 22);
    const s = m(e, r, t.a[1]);
    if (et(s)) throw new w$1(t.a[1]);
    t.t === 23 ? n.s(s) : n.f(s);
    return;
  }
  throw new oe("Promise");
}
function Ui(e, r, t) {
  return m(e, r, t.a[0]), Vs(m(e, r, t.a[1]));
}
function Mi(e, r, t) {
  return m(e, r, t.a[0]), Qs(m(e, r, t.a[1]));
}
function $i(e, r, t) {
  const n = h(e, t.i, Q$2());
  rt(e, t.i, 31);
  const s = t.a, i = s.length;
  if (i) for (let a = 0; a < i; a++) m(e, r, s[a]);
  return n;
}
function Hi(e, r, t) {
  const n = e.base.refs.get(t.i);
  if (n) {
    ce$1(e, t, t.i, 31), n.next(m(e, r, t.f));
    return;
  }
  throw new oe("Stream");
}
function ji(e, r, t) {
  const n = e.base.refs.get(t.i);
  if (n) {
    ce$1(e, t, t.i, 31), n.throw(m(e, r, t.f));
    return;
  }
  throw new oe("Stream");
}
function qi(e, r, t) {
  const n = e.base.refs.get(t.i);
  if (n) {
    ce$1(e, t, t.i, 31), n.return(m(e, r, t.f));
    return;
  }
  throw new oe("Stream");
}
function Bi(e, r, t) {
  m(e, r, t.f);
}
function Vi(e, r, t) {
  m(e, r, t.a[1]);
}
function Yi(e, r, t) {
  const n = h(e, t.i, Xr([], t.s, t.l));
  for (let s = 0, i = t.a.length; s < i; s++) n.v[s] = m(e, r, t.a[s]);
  return n;
}
function m(e, r, t) {
  if (r > e.base.depthLimit) throw new Vr(e.base.depthLimit);
  switch (r += 1, t.t) {
    case 2:
      return we(t, jn, t.s);
    case 0:
      return Number(t.s);
    case 1:
      return z$1(String(t.s));
    case 3:
      if (String(t.s).length > ci) throw new w$1(t);
      return BigInt(t.s);
    case 4:
      return e.base.refs.get(t.i);
    case 18:
      return yi(e, t);
    case 9:
      return bi(e, r, t);
    case 10:
    case 11:
      return Ri(e, r, t);
    case 5:
      return wi(e, t);
    case 6:
      return Ai(e, t);
    case 7:
      return _i(e, r, t);
    case 8:
      return Ti(e, r, t);
    case 19:
      return Ii(e, t);
    case 16:
    case 15:
      return Oi(e, r, t);
    case 20:
      return zi(e, r, t);
    case 14:
      return Ci(e, r, t);
    case 13:
      return Ni(e, r, t);
    case 12:
      return Pi(e, r, t);
    case 17:
      return we(t, $n, t.s);
    case 21:
      return Li(e, r, t);
    case 25:
      return Di(e, r, t);
    case 22:
      return Fi(e, t);
    case 23:
    case 24:
      return ki(e, r, t);
    case 28:
      return Ui(e, r, t);
    case 30:
      return Mi(e, r, t);
    case 31:
      return $i(e, r, t);
    case 32:
      return Hi(e, r, t);
    case 33:
      return ji(e, r, t);
    case 34:
      return qi(e, r, t);
    case 27:
      return Bi(e, r, t);
    case 29:
      return Vi(e, r, t);
    case 35:
      return Yi(e, r, t);
    case 36:
      return Ei(e, t);
    default:
      throw new N$1(t);
  }
}
function Gi(e, r) {
  try {
    return m(e, 0, r);
  } catch (t) {
    throw new Is(t);
  }
}
const Wi = () => T, Zi = Wi.toString(), st = /=>/.test(Zi);
function it$1(e, r) {
  return st ? (e.length === 1 ? e[0] : "(" + e.join(",") + ")") + "=>" + (r.startsWith("{") ? "(" + r + ")" : r) : "function(" + e.join(",") + "){return " + r + "}";
}
function Xi(e, r) {
  return st ? (e.length === 1 ? e[0] : "(" + e.join(",") + ")") + "=>{" + r + "}" : "function(" + e.join(",") + "){" + r + "}";
}
const Ji = "hjkmoquxzABCDEFGHIJKLNPQRTUVWXYZ$_", Ke$1 = 34, Ki = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$_", Qe = 64;
function Qi(e) {
  let r = e % Ke$1, t = Ji[r];
  for (e = (e - r) / Ke$1; e > 0; ) r = e % Qe, t += Ki[r], e = (e - r) / Qe;
  return t;
}
const xi = /^[$A-Z_][0-9A-Z_$]*$/i;
function at$1(e) {
  const r = e[0];
  return (r === "$" || r === "_" || r >= "A" && r <= "Z" || r >= "a" && r <= "z") && xi.test(e);
}
function X$1(e) {
  switch (e.t) {
    case 0:
      return e.s + "=" + e.v;
    case 2:
      return e.s + ".set(" + e.k + "," + e.v + ")";
    case 1:
      return e.s + ".add(" + e.v + ")";
    case 3:
      return e.s + ".delete(" + e.k + ")";
    case 4:
      return "Object.defineProperty(" + e.s + ',"__proto__",{value:' + e.k + ",configurable:!0,enumerable:!0,writable:!0})";
  }
}
function ea(e) {
  const r = [];
  let t = e[0];
  for (let n = 1, s = e.length, i, a = t; n < s; n++) i = e[n], i.t === 0 && i.v === a.v ? t = { t: 0, s: i.s, k: void 0, v: X$1(t) } : i.t === 2 && i.s === a.s ? t = { t: 2, s: X$1(t), k: i.k, v: i.v } : i.t === 1 && i.s === a.s ? t = { t: 1, s: X$1(t), k: void 0, v: i.v } : i.t === 3 && i.s === a.s ? t = { t: 3, s: X$1(t), k: i.k, v: void 0 } : (r.push(t), t = i), a = i;
  return r.push(t), r;
}
function ot(e) {
  if (e.length) {
    let r = "";
    const t = ea(e);
    for (let n = 0, s = t.length; n < s; n++) r += X$1(t[n]) + ",";
    return r;
  }
}
const ra = "Object.create(null)", ta = "new Set", na = "new Map", sa = "Promise.resolve", ia = "Promise.reject", aa = { 3: "Object.freeze", 2: "Object.seal", 1: "Object.preventExtensions", 0: void 0 };
function oa(e, r) {
  return { mode: e, plugins: r.plugins, features: r.features, marked: new Set(r.markedRefs), stack: [], flags: [], assignments: [] };
}
function ua(e) {
  return { mode: 2, base: oa(2, e), state: e, child: void 0 };
}
var la = class {
  constructor(e) {
    this._p = e;
  }
  serialize(e) {
    return d(this._p, e);
  }
};
function ca(e, r) {
  let t = e.valid.get(r);
  t == null && (t = e.valid.size, e.valid.set(r, t));
  let n = e.vars[t];
  return n == null && (n = Qi(t), e.vars[t] = n), n;
}
function fa(e) {
  return "$R[" + e + "]";
}
function v(e, r) {
  return e.mode === 1 ? ca(e.state, r) : fa(r);
}
function R$1(e, r) {
  e.marked.add(r);
}
function Ee$1(e, r) {
  return e.marked.has(r);
}
function Ce$1(e, r, t) {
  r !== 0 && (R$1(e.base, t), e.base.flags.push({ type: r, value: v(e, t) }));
}
function da(e) {
  let r = "";
  for (let t = 0, n = e.flags, s = n.length; t < s; t++) {
    const i = n[t];
    r += aa[i.type] + "(" + i.value + "),";
  }
  return r;
}
function pa(e) {
  const r = ot(e.assignments), t = da(e);
  return r ? t ? r + t : r : t;
}
function Ne$1(e, r, t) {
  e.assignments.push({ t: 0, s: r, k: void 0, v: t });
}
function va(e, r, t) {
  e.base.assignments.push({ t: 1, s: v(e, r), k: void 0, v: t });
}
function W$1(e, r, t, n) {
  e.base.assignments.push({ t: 2, s: v(e, r), k: t, v: n });
}
function xe$1(e, r, t) {
  e.base.assignments.push({ t: 3, s: v(e, r), k: t, v: void 0 });
}
function J$1(e, r, t, n) {
  Ne$1(e.base, v(e, r) + "[" + t + "]", n);
}
function Ae$1(e, r, t, n) {
  if (!ze$1(t)) {
    e.base.assignments.push({ t: 4, s: v(e, r), k: n, v: void 0 });
    return;
  }
  Ne$1(e.base, v(e, r) + "." + t, n);
}
function ga(e, r, t, n) {
  Ne$1(e.base, v(e, r) + ".v[" + t + "]", n);
}
function _$1(e, r) {
  return r.t === 4 && e.stack.includes(r.i);
}
function G$1(e, r, t) {
  return e.mode === 1 && !Ee$1(e.base, r) ? t : v(e, r) + "=" + t;
}
function ma(e) {
  return '__SEROVAL_REFS__.get("' + e.s + '")';
}
function er(e, r, t, n) {
  return t ? _$1(e.base, t) ? (R$1(e.base, r), J$1(e, r, n, v(e, t.i)), "") : d(e, t) : "";
}
function ha(e, r) {
  const t = r.i, n = r.a, s = n.length;
  if (s > 0) {
    e.base.stack.push(t);
    let i = er(e, t, n[0], 0), a = i === "";
    for (let o = 1, u; o < s; o++) u = er(e, t, n[o], o), i += "," + u, a = u === "";
    return e.base.stack.pop(), Ce$1(e, r.o, r.i), "[" + i + (a ? ",]" : "]");
  }
  return "[]";
}
function rr(e, r, t, n) {
  if (typeof t == "string") {
    const s = Number(t), i = s >= 0 && s.toString() === t || at$1(t);
    if (_$1(e.base, n)) {
      const a = v(e, n.i);
      return R$1(e.base, r.i), i && s !== s ? Ae$1(e, r.i, t, a) : J$1(e, r.i, i ? t : '"' + t + '"', a), "";
    }
    return ze$1(t) ? (i ? t : '"' + t + '"') + ":" + d(e, n) : '["' + t + '"]:' + d(e, n);
  }
  return "[" + d(e, t) + "]:" + d(e, n);
}
function ut$1(e, r, t) {
  const n = t.k, s = n.length;
  if (s > 0) {
    const i = t.v;
    e.base.stack.push(r.i);
    let a = rr(e, r, n[0], i[0]);
    for (let o = 1, u = a; o < s; o++) u = rr(e, r, n[o], i[o]), a += (u && a && ",") + u;
    return e.base.stack.pop(), "{" + a + "}";
  }
  return "{}";
}
function ya(e, r) {
  return Ce$1(e, r.o, r.i), ut$1(e, r, r.p);
}
function ba(e, r, t, n) {
  const s = ut$1(e, r, t);
  return s !== "{}" ? "Object.assign(" + n + "," + s + ")" : n;
}
function Sa(e, r, t, n, s) {
  const i = e.base, a = d(e, s), o = Number(n), u = o >= 0 && o.toString() === n || at$1(n);
  if (_$1(i, s)) u && o !== o ? Ae$1(e, r.i, n, a) : J$1(e, r.i, u ? n : '"' + n + '"', a);
  else {
    const c = i.assignments;
    i.assignments = t, u && o !== o ? Ae$1(e, r.i, n, a) : J$1(e, r.i, u ? n : '"' + n + '"', a), i.assignments = c;
  }
}
function Ra(e, r, t, n, s) {
  if (typeof n == "string") Sa(e, r, t, n, s);
  else {
    const i = e.base, a = i.stack;
    i.stack = [];
    const o = d(e, s);
    i.stack = a;
    const u = i.assignments;
    i.assignments = t, J$1(e, r.i, d(e, n), o), i.assignments = u;
  }
}
function wa(e, r, t) {
  const n = t.k, s = n.length;
  if (s > 0) {
    const i = [], a = t.v;
    e.base.stack.push(r.i);
    for (let o = 0; o < s; o++) Ra(e, r, i, n[o], a[o]);
    return e.base.stack.pop(), ot(i);
  }
}
function Pe$1(e, r, t) {
  if (r.p) {
    const n = e.base;
    if (n.features & 8) t = ba(e, r, r.p, t);
    else {
      R$1(n, r.i);
      const s = wa(e, r, r.p);
      if (s) return "(" + G$1(e, r.i, t) + "," + s + v(e, r.i) + ")";
    }
  }
  return t;
}
function Ea(e, r) {
  return Ce$1(e, r.o, r.i), Pe$1(e, r, ra);
}
function Aa(e) {
  return 'new Date("' + e.s + '")';
}
const _a = { 0: "Temporal.Instant", 1: "Temporal.Duration", 2: "Temporal.PlainDate", 3: "Temporal.PlainDateTime", 4: "Temporal.PlainMonthDay", 5: "Temporal.PlainTime", 6: "Temporal.PlainYearMonth", 7: "Temporal.ZonedDateTime" };
function Ta(e, r) {
  if (e.base.features & 64) return _a[r.c] + '.from("' + r.s + '")';
  throw new N$1(r);
}
function Ia(e, r) {
  if (e.base.features & 32) return "/" + z$1(r.c) + "/" + r.m;
  throw new N$1(r);
}
function tr(e, r, t) {
  const n = e.base;
  return _$1(n, t) ? (R$1(n, r), va(e, r, v(e, t.i)), "") : d(e, t);
}
function Oa(e, r) {
  let t = ta;
  const n = r.a, s = n.length, i = r.i;
  if (s > 0) {
    e.base.stack.push(i);
    let a = tr(e, i, n[0]);
    for (let o = 1, u = a; o < s; o++) u = tr(e, i, n[o]), a += (u && a && ",") + u;
    e.base.stack.pop(), a && (t += "([" + a + "])");
  }
  return t;
}
function nr(e, r, t, n, s) {
  const i = e.base;
  if (_$1(i, t)) {
    const a = v(e, t.i);
    if (R$1(i, r), _$1(i, n)) return W$1(e, r, a, v(e, n.i)), "";
    if (n.t !== 4 && n.i != null && Ee$1(i, n.i)) {
      const u = "(" + d(e, n) + ",[" + s + "," + s + "])";
      return W$1(e, r, a, v(e, n.i)), xe$1(e, r, s), u;
    }
    const o = i.stack;
    return i.stack = [], W$1(e, r, a, d(e, n)), i.stack = o, "";
  }
  if (_$1(i, n)) {
    const a = v(e, n.i);
    if (R$1(i, r), t.t !== 4 && t.i != null && Ee$1(i, t.i)) {
      const u = "(" + d(e, t) + ",[" + s + "," + s + "])";
      return W$1(e, r, v(e, t.i), a), xe$1(e, r, s), u;
    }
    const o = i.stack;
    return i.stack = [], W$1(e, r, d(e, t), a), i.stack = o, "";
  }
  return "[" + d(e, t) + "," + d(e, n) + "]";
}
function za(e, r) {
  let t = na;
  const n = r.e.k, s = n.length, i = r.i, a = r.f, o = v(e, a.i), u = e.base;
  if (s > 0) {
    const c = r.e.v;
    u.stack.push(i);
    let f = nr(e, i, n[0], c[0], o);
    for (let g = 1, y = f; g < s; g++) y = nr(e, i, n[g], c[g], o), f += (y && f && ",") + y;
    u.stack.pop(), f && (t += "([" + f + "])");
  }
  return a.t === 26 && (R$1(u, a.i), t = "(" + d(e, a) + "," + t + ")"), t;
}
function Ca(e, r) {
  return $$1(e, r.f) + '("' + r.s + '")';
}
function Na(e, r) {
  return "new " + r.c + "(" + d(e, r.f) + "," + r.b + "," + r.l + ")";
}
function Pa(e, r) {
  return "new DataView(" + d(e, r.f) + "," + r.b + "," + r.l + ")";
}
function La(e, r) {
  const t = r.i;
  e.base.stack.push(t);
  const n = Pe$1(e, r, 'new AggregateError([],"' + r.m + '")');
  return e.base.stack.pop(), n;
}
function Da(e, r) {
  return Pe$1(e, r, "new " + Lr[r.s] + '("' + r.m + '")');
}
function Fa(e, r) {
  let t;
  const n = r.f, s = r.i, i = r.s ? sa : ia, a = e.base;
  if (_$1(a, n)) {
    const o = v(e, n.i);
    t = i + (r.s ? "().then(" + it$1([], o) + ")" : "().catch(" + Xi([], "throw " + o) + ")");
  } else {
    a.stack.push(s);
    const o = d(e, n);
    a.stack.pop(), t = i + "(" + o + ")";
  }
  return t;
}
function ka(e, r) {
  return "Object(" + d(e, r.f) + ")";
}
function $$1(e, r) {
  const t = d(e, r);
  return r.t === 4 ? t : "(" + t + ")";
}
function Ua(e, r) {
  if (e.mode === 1) throw new N$1(r);
  return "(" + G$1(e, r.s, $$1(e, r.f) + "()") + ").p";
}
function Ma(e, r) {
  if (e.mode === 1) throw new N$1(r);
  return $$1(e, r.a[0]) + "(" + v(e, r.i) + "," + d(e, r.a[1]) + ")";
}
function $a(e, r) {
  if (e.mode === 1) throw new N$1(r);
  return $$1(e, r.a[0]) + "(" + v(e, r.i) + "," + d(e, r.a[1]) + ")";
}
function Ha(e, r) {
  const t = e.base.plugins;
  if (t) for (let n = 0, s = t.length; n < s; n++) {
    const i = t[n];
    if (i.tag === r.c) return e.child == null && (e.child = new la(e)), i.serialize(r.s, e.child, { id: r.i });
  }
  throw new Br(r.c);
}
function ja(e, r) {
  let t = "", n = false;
  return r.f.t !== 4 && (R$1(e.base, r.f.i), t = "(" + d(e, r.f) + ",", n = true), t += G$1(e, r.i, "(" + Ms + ")(" + v(e, r.f.i) + ")"), n && (t += ")"), t;
}
function qa(e, r) {
  return $$1(e, r.a[0]) + "(" + d(e, r.a[1]) + ")";
}
function Ba(e, r) {
  const t = r.a[0], n = r.a[1], s = e.base;
  let i = "";
  t.t !== 4 && (R$1(s, t.i), i += "(" + d(e, t)), n.t !== 4 && (R$1(s, n.i), i += (i ? "," : "(") + d(e, n)), i && (i += ",");
  const a = G$1(e, r.i, "(" + $s + ")(" + v(e, n.i) + "," + v(e, t.i) + ")");
  return i ? i + a + ")" : a;
}
function Va(e, r) {
  return $$1(e, r.a[0]) + "(" + d(e, r.a[1]) + ")";
}
function Ya(e, r) {
  const t = G$1(e, r.i, $$1(e, r.f) + "()"), n = r.a.length;
  if (n) {
    let s = d(e, r.a[0]);
    for (let i = 1; i < n; i++) s += "," + d(e, r.a[i]);
    return "(" + t + "," + s + "," + v(e, r.i) + ")";
  }
  return t;
}
function Ga(e, r) {
  return v(e, r.i) + ".next(" + d(e, r.f) + ")";
}
function Wa(e, r) {
  return v(e, r.i) + ".throw(" + d(e, r.f) + ")";
}
function Za(e, r) {
  return v(e, r.i) + ".return(" + d(e, r.f) + ")";
}
function sr(e, r, t, n) {
  const s = e.base;
  return _$1(s, n) ? (R$1(s, r), ga(e, r, t, v(e, n.i)), "") : d(e, n);
}
function Xa(e, r) {
  const t = r.a, n = t.length, s = r.i;
  if (n > 0) {
    e.base.stack.push(s);
    let i = sr(e, s, 0, t[0]);
    for (let a = 1, o = i; a < n; a++) o = sr(e, s, a, t[a]), i += (o && i && ",") + o;
    if (e.base.stack.pop(), i) return "{__SEROVAL_SEQUENCE__:!0,v:[" + i + "],t:" + r.s + ",d:" + r.l + "}";
  }
  return "{__SEROVAL_SEQUENCE__:!0,v:[],t:-1,d:0}";
}
function Ja(e, r) {
  switch (r.t) {
    case 17:
      return Mn[r.s];
    case 18:
      return ma(r);
    case 9:
      return ha(e, r);
    case 10:
      return ya(e, r);
    case 11:
      return Ea(e, r);
    case 5:
      return Aa(r);
    case 6:
      return Ia(e, r);
    case 7:
      return Oa(e, r);
    case 8:
      return za(e, r);
    case 19:
      return Ca(e, r);
    case 16:
    case 15:
      return Na(e, r);
    case 20:
      return Pa(e, r);
    case 14:
      return La(e, r);
    case 13:
      return Da(e, r);
    case 12:
      return Fa(e, r);
    case 21:
      return ka(e, r);
    case 22:
      return Ua(e, r);
    case 25:
      return Ha(e, r);
    case 26:
      return Zs[r.s];
    case 35:
      return Xa(e, r);
    case 36:
      return Ta(e, r);
    default:
      throw new N$1(r);
  }
}
function d(e, r) {
  switch (r.t) {
    case 2:
      return Hn[r.s];
    case 0:
      return "" + r.s;
    case 1:
      return '"' + r.s + '"';
    case 3:
      return r.s + "n";
    case 4:
      return v(e, r.i);
    case 23:
      return Ma(e, r);
    case 24:
      return $a(e, r);
    case 27:
      return ja(e, r);
    case 28:
      return qa(e, r);
    case 29:
      return Ba(e, r);
    case 30:
      return Va(e, r);
    case 31:
      return Ya(e, r);
    case 32:
      return Ga(e, r);
    case 33:
      return Wa(e, r);
    case 34:
      return Za(e, r);
    default:
      return G$1(e, r.i, Ja(e, r));
  }
}
function Ka(e, r) {
  const t = d(e, r), n = r.i;
  if (n == null) return t;
  const s = pa(e.base), i = v(e, n), a = e.state.scopeId, o = a == null ? "" : "$R", u = s ? "(" + t + "," + s + i + ")" : t;
  if (o === "") return r.t === 10 && !s ? "(" + u + ")" : u;
  const c = a == null ? "()" : '($R["' + A(a) + '"])';
  return "(" + it$1([o], u) + ")" + c;
}
var Qa = class {
  constructor(e, r) {
    this._p = e, this.depth = r;
  }
  parse(e) {
    return b(this._p, this.depth, e);
  }
}, xa = class {
  constructor(e, r) {
    this._p = e, this.depth = r;
  }
  parse(e) {
    return b(this._p, this.depth, e);
  }
  parseWithError(e) {
    return U$1(this._p, this.depth, e);
  }
  isAlive() {
    return this._p.state.alive;
  }
  pushPendingState() {
    ke$1(this._p);
  }
  popPendingState() {
    K$1(this._p);
  }
  onParse(e) {
    Y$2(this._p, e);
  }
  onError(e) {
    De$1(this._p, e);
  }
  addCleanup(e) {
    this._p.state.cleanups.push(e);
  }
};
function eo(e) {
  return { alive: true, pending: 0, initial: true, buffer: [], onParse: e.onParse, onError: e.onError, onDone: e.onDone, cleanups: [] };
}
function lt$1(e) {
  return { type: 2, base: xs(2, e), state: eo(e) };
}
function ro(e, r, t) {
  const n = [];
  for (let s = 0, i = t.length; s < i; s++) s in t ? n[s] = b(e, r, t[s]) : n[s] = 0;
  return n;
}
function to(e, r, t, n) {
  return ls(t, n, ro(e, r, n));
}
function Le$1(e, r, t) {
  const n = Object.entries(t), s = [], i = [];
  for (let a = 0, o = n.length; a < o; a++) s.push(A(n[a][0])), i.push(b(e, r, n[a][1]));
  return O$1 in t && (s.push(k(e.base, O$1)), i.push(hs(ri(e.base), b(e, r, qs(t))))), I$2 in t && (s.push(k(e.base, I$2)), i.push(ys(ti(e.base), b(e, r, e.type === 1 ? Q$2() : Js(t))))), V$2 in t && (s.push(k(e.base, V$2)), i.push(Hr(t[V$2]))), B in t && (s.push(k(e.base, B)), i.push(t[B] ? Dr : Fr)), { k: s, v: i };
}
function ve(e, r, t, n, s) {
  return ni(t, n, s, Le$1(e, r, n));
}
function no(e, r, t, n) {
  return cs(t, b(e, r, n.valueOf()));
}
function so(e, r, t, n) {
  return fs(t, n, b(e, r, n.buffer));
}
function io(e, r, t, n) {
  return ds(t, n, b(e, r, n.buffer));
}
function ao(e, r, t, n) {
  return ps(t, n, b(e, r, n.buffer));
}
function ir(e, r, t, n) {
  const s = Mr(n, e.base.features);
  return vs(t, n, s ? Le$1(e, r, s) : void 0);
}
function oo(e, r, t, n) {
  const s = Mr(n, e.base.features);
  return gs(t, n, s ? Le$1(e, r, s) : void 0);
}
function uo(e, r, t, n) {
  const s = [], i = [];
  for (const [a, o] of n.entries()) s.push(b(e, r, a)), i.push(b(e, r, o));
  return si(e.base, t, s, i);
}
function lo(e, r, t, n) {
  const s = [];
  for (const i of n.keys()) s.push(b(e, r, i));
  return ms(t, s);
}
function co(e, r, t, n) {
  const s = bs(t, M(e.base, 4), []);
  return e.type === 1 || (ke$1(e), n.on({ next: (i) => {
    if (e.state.alive) {
      const a = U$1(e, r, i);
      a && Y$2(e, Ss(t, a));
    }
  }, throw: (i) => {
    if (e.state.alive) {
      const a = U$1(e, r, i);
      a && Y$2(e, Rs(t, a));
    }
    K$1(e);
  }, return: (i) => {
    if (e.state.alive) {
      const a = U$1(e, r, i);
      a && Y$2(e, ws(t, a));
    }
    K$1(e);
  } })), s;
}
function fo(e, r, t) {
  if (this.state.alive) {
    const n = U$1(this, r, t);
    n && Y$2(this, p(23, e, void 0, void 0, void 0, void 0, void 0, [M(this.base, 2), n], void 0, void 0, void 0, void 0)), K$1(this);
  }
}
function po(e, r, t) {
  if (this.state.alive) {
    const n = U$1(this, r, t);
    n && Y$2(this, p(24, e, void 0, void 0, void 0, void 0, void 0, [M(this.base, 3), n], void 0, void 0, void 0, void 0));
  }
  K$1(this);
}
function vo(e, r, t, n) {
  const s = Jr(e.base, {});
  return e.type === 2 && (ke$1(e), n.then(fo.bind(e, s, r), po.bind(e, s, r))), ii(e.base, t, s);
}
function go(e, r, t, n, s) {
  for (let i = 0, a = s.length; i < a; i++) {
    const o = s[i];
    if (o.parse.sync && o.test(n)) return jr(t, o.tag, o.parse.sync(n, new Qa(e, r), { id: t }));
  }
}
function mo(e, r, t, n, s) {
  for (let i = 0, a = s.length; i < a; i++) {
    const o = s[i];
    if (o.parse.stream && o.test(n)) return jr(t, o.tag, o.parse.stream(n, new xa(e, r), { id: t }));
  }
}
function ct$1(e, r, t, n) {
  const s = e.base.plugins;
  if (s) return e.type === 1 ? go(e, r, t, n, s) : mo(e, r, t, n, s);
}
function ho(e, r, t, n) {
  const s = [];
  for (let i = 0, a = n.v.length; i < a; i++) s[i] = b(e, r, n.v[i]);
  return Es(t, s, n.t, n.d);
}
function yo(e, r, t, n, s) {
  switch (s) {
    case Object:
      return ve(e, r, t, n, false);
    case void 0:
      return ve(e, r, t, n, true);
    case Date:
      return is(t, n);
    case Error:
    case EvalError:
    case RangeError:
    case ReferenceError:
    case SyntaxError:
    case TypeError:
    case URIError:
      return ir(e, r, t, n);
    case Number:
    case Boolean:
    case String:
    case BigInt:
      return no(e, r, t, n);
    case ArrayBuffer:
      return ai(e.base, t, n);
    case Int8Array:
    case Int16Array:
    case Int32Array:
    case Uint8Array:
    case Uint16Array:
    case Uint32Array:
    case Uint8ClampedArray:
    case Float32Array:
    case Float64Array:
      return so(e, r, t, n);
    case DataView:
      return ao(e, r, t, n);
    case Map:
      return uo(e, r, t, n);
    case Set:
      return lo(e, r, t, n);
  }
  if (s === Promise || n instanceof Promise) return vo(e, r, t, n);
  const i = e.base.features;
  if (i & 32 && s === RegExp) return as(t, n);
  if (i & 16) switch (s) {
    case BigInt64Array:
    case BigUint64Array:
      return io(e, r, t, n);
  }
  if (i & 1 && typeof AggregateError < "u" && (s === AggregateError || n instanceof AggregateError)) return oo(e, r, t, n);
  if (i & 64 && typeof Temporal < "u") switch (s) {
    case Temporal.Instant:
      return P$1(t, 0, n);
    case Temporal.Duration:
      return P$1(t, 1, n);
    case Temporal.PlainDate:
      return P$1(t, 2, n);
    case Temporal.PlainDateTime:
      return P$1(t, 3, n);
    case Temporal.PlainMonthDay:
      return P$1(t, 4, n);
    case Temporal.PlainTime:
      return P$1(t, 5, n);
    case Temporal.PlainYearMonth:
      return P$1(t, 6, n);
    case Temporal.ZonedDateTime:
      return P$1(t, 7, n);
  }
  if (n instanceof Error) return ir(e, r, t, n);
  if (O$1 in n || I$2 in n) return ve(e, r, t, n, !!s);
  throw new ae$1(n);
}
function bo(e, r, t, n) {
  if (Array.isArray(n)) return to(e, r, t, n);
  if (Xs(n)) return co(e, r, t, n);
  if (js(n)) return ho(e, r, t, n);
  let s = n.constructor;
  if (s !== void 0 && typeof s != "function") {
    const a = Object.getPrototypeOf(n);
    s = a === null ? void 0 : a.constructor;
  }
  if (s === Ns) return b(e, r, n.replacement);
  const i = ct$1(e, r, t, n);
  return i || yo(e, r, t, n, s);
}
function So(e, r, t) {
  const n = Ie$1(e.base, t);
  if (n.type !== 0) return n.value;
  const s = ct$1(e, r, n.value, t);
  if (s) return s;
  throw new ae$1(t);
}
function b(e, r, t) {
  if (r >= e.base.depthLimit) throw new Vr(e.base.depthLimit);
  switch (typeof t) {
    case "boolean":
      return t ? Dr : Fr;
    case "undefined":
      return Bn;
    case "string":
      return Hr(t);
    case "number":
      return ts(t);
    case "bigint":
      return ns(t);
    case "object":
      if (t) {
        const n = Ie$1(e.base, t);
        return n.type === 0 ? bo(e, r + 1, n.value, t) : n.value;
      }
      return Vn;
    case "symbol":
      return k(e.base, t);
    case "function":
      return So(e, r, t);
    default:
      throw new ae$1(t);
  }
}
function Y$2(e, r) {
  e.state.initial ? e.state.buffer.push(r) : Fe$1(e, r, false);
}
function De$1(e, r) {
  if (e.state.onError) e.state.onError(r);
  else throw r instanceof Xe ? r : new Xe(r);
}
function ft$1(e) {
  e.state.onDone && e.state.onDone();
  for (let r = 0, t = e.state.cleanups.length; r < t; r++) e.state.cleanups[r]();
}
function Fe$1(e, r, t) {
  try {
    e.state.onParse(r, t);
  } catch (n) {
    De$1(e, n);
  }
}
function ke$1(e) {
  e.state.pending++;
}
function K$1(e) {
  --e.state.pending <= 0 && ft$1(e);
}
function U$1(e, r, t) {
  try {
    return b(e, r, t);
  } catch (n) {
    De$1(e, n);
    return;
  }
}
function dt$1(e, r) {
  const t = U$1(e, 0, r);
  t && (Fe$1(e, t, true), e.state.initial = false, Ro(e, e.state), e.state.pending <= 0 && Ue(e));
}
function Ro(e, r) {
  for (let t = 0, n = r.buffer.length; t < n; t++) Fe$1(e, r.buffer[t], false);
}
function Ue(e) {
  e.state.alive && (ft$1(e), e.state.alive = false);
}
function wo(e, r) {
  const t = Oe$1(r.plugins), n = lt$1({ plugins: t, refs: r.refs, disabledFeatures: r.disabledFeatures, onParse(s, i) {
    const a = ua({ plugins: t, features: n.base.features, scopeId: r.scopeId, markedRefs: n.base.marked });
    let o;
    try {
      o = Ka(a, s);
    } catch (u) {
      r.onError && r.onError(u);
      return;
    }
    r.onSerialize(o, i);
  }, onError: r.onError, onDone: r.onDone });
  return dt$1(n, e), Ue.bind(null, n);
}
function Eo(e, r) {
  const t = lt$1({ plugins: Oe$1(r.plugins), refs: r.refs, disabledFeatures: r.disabledFeatures, depthLimit: r.depthLimit, onParse: r.onParse, onError: r.onError, onDone: r.onDone });
  return dt$1(t, e), Ue.bind(null, t);
}
function Ao(e, r = {}) {
  var t;
  const n = Oe$1(r.plugins), s = r.disabledFeatures || 0, i = (t = e.f) !== null && t !== void 0 ? t : 127;
  return Gi(vi({ plugins: n, markedRefs: e.m, features: i & ~s, disabledFeatures: s }), e.t);
}
const ge = (e) => {
  const r = new AbortController(), t = r.abort.bind(r);
  return e.then(t, t), r;
};
function _o(e) {
  e(this.reason);
}
function To(e) {
  this.addEventListener("abort", _o.bind(this, e), { once: true });
}
function ar(e) {
  return new Promise(To.bind(e));
}
const Z$2 = {}, Io = { tag: "seroval-plugins/web/AbortSignal", extends: [{ tag: "seroval-plugins/web/AbortControllerFactoryPlugin", test(e) {
  return e === Z$2;
}, parse: { sync() {
  return Z$2;
}, async async() {
  return await Promise.resolve(Z$2);
}, stream() {
  return Z$2;
} }, serialize() {
  return ge.toString();
}, deserialize() {
  return ge;
} }], test(e) {
  return typeof AbortSignal > "u" ? false : e instanceof AbortSignal;
}, parse: { sync(e, r) {
  return e.aborted ? { reason: r.parse(e.reason) } : {};
}, async async(e, r) {
  if (e.aborted) return { reason: await r.parse(e.reason) };
  const t = await ar(e);
  return { reason: await r.parse(t) };
}, stream(e, r) {
  if (e.aborted) return { reason: r.parse(e.reason) };
  const t = ar(e);
  return { factory: r.parse(Z$2), controller: r.parse(t) };
} }, serialize(e, r) {
  return e.reason ? "AbortSignal.abort(" + r.serialize(e.reason) + ")" : e.controller && e.factory ? "(" + r.serialize(e.factory) + ")(" + r.serialize(e.controller) + ").signal" : "(new AbortController).signal";
}, deserialize(e, r) {
  return e.reason ? AbortSignal.abort(r.deserialize(e.reason)) : e.controller ? ge(r.deserialize(e.controller)).signal : new AbortController().signal;
} };
function me(e) {
  return { detail: e.detail, bubbles: e.bubbles, cancelable: e.cancelable, composed: e.composed };
}
const Oo = { tag: "seroval-plugins/web/CustomEvent", test(e) {
  return typeof CustomEvent > "u" ? false : e instanceof CustomEvent;
}, parse: { sync(e, r) {
  return { type: r.parse(e.type), options: r.parse(me(e)) };
}, async async(e, r) {
  return { type: await r.parse(e.type), options: await r.parse(me(e)) };
}, stream(e, r) {
  return { type: r.parse(e.type), options: r.parse(me(e)) };
} }, serialize(e, r) {
  return "new CustomEvent(" + r.serialize(e.type) + "," + r.serialize(e.options) + ")";
}, deserialize(e, r) {
  return new CustomEvent(r.deserialize(e.type), r.deserialize(e.options));
} }, zo = { tag: "seroval-plugins/web/DOMException", test(e) {
  return typeof DOMException > "u" ? false : e instanceof DOMException;
}, parse: { sync(e, r) {
  return { name: r.parse(e.name), message: r.parse(e.message) };
}, async async(e, r) {
  return { name: await r.parse(e.name), message: await r.parse(e.message) };
}, stream(e, r) {
  return { name: r.parse(e.name), message: r.parse(e.message) };
} }, serialize(e, r) {
  return "new DOMException(" + r.serialize(e.message) + "," + r.serialize(e.name) + ")";
}, deserialize(e, r) {
  return new DOMException(r.deserialize(e.message), r.deserialize(e.name));
} };
function he$1(e) {
  return { bubbles: e.bubbles, cancelable: e.cancelable, composed: e.composed };
}
const Co = { tag: "seroval-plugins/web/Event", test(e) {
  return typeof Event > "u" ? false : e instanceof Event;
}, parse: { sync(e, r) {
  return { type: r.parse(e.type), options: r.parse(he$1(e)) };
}, async async(e, r) {
  return { type: await r.parse(e.type), options: await r.parse(he$1(e)) };
}, stream(e, r) {
  return { type: r.parse(e.type), options: r.parse(he$1(e)) };
} }, serialize(e, r) {
  return "new Event(" + r.serialize(e.type) + "," + r.serialize(e.options) + ")";
}, deserialize(e, r) {
  return new Event(r.deserialize(e.type), r.deserialize(e.options));
} }, No = { tag: "seroval-plugins/web/File", test(e) {
  return typeof File > "u" ? false : e instanceof File;
}, parse: { async async(e, r) {
  return { name: await r.parse(e.name), options: await r.parse({ type: e.type, lastModified: e.lastModified }), buffer: await r.parse(await e.arrayBuffer()) };
} }, serialize(e, r) {
  return "new File([" + r.serialize(e.buffer) + "]," + r.serialize(e.name) + "," + r.serialize(e.options) + ")";
}, deserialize(e, r) {
  return new File([r.deserialize(e.buffer)], r.deserialize(e.name), r.deserialize(e.options));
} };
function ye(e) {
  const r = [];
  return e.forEach((t, n) => {
    r.push([n, t]);
  }), r;
}
const L = {}, or = (e, r = new FormData(), t = 0, n = e.length, s) => {
  for (; t < n; t++) s = e[t], r.append(s[0], s[1]);
  return r;
}, Po = { tag: "seroval-plugins/web/FormData", extends: [No, { tag: "seroval-plugins/web/FormDataFactory", test(e) {
  return e === L;
}, parse: { sync() {
  return L;
}, async async() {
  return await Promise.resolve(L);
}, stream() {
  return L;
} }, serialize() {
  return or.toString();
}, deserialize() {
  return L;
} }], test(e) {
  return typeof FormData > "u" ? false : e instanceof FormData;
}, parse: { sync(e, r) {
  return { factory: r.parse(L), entries: r.parse(ye(e)) };
}, async async(e, r) {
  return { factory: await r.parse(L), entries: await r.parse(ye(e)) };
}, stream(e, r) {
  return { factory: r.parse(L), entries: r.parse(ye(e)) };
} }, serialize(e, r) {
  return "(" + r.serialize(e.factory) + ")(" + r.serialize(e.entries) + ")";
}, deserialize(e, r) {
  return or(r.deserialize(e.entries));
} };
function be$1(e) {
  const r = [];
  return e.forEach((t, n) => {
    r.push([n, t]);
  }), r;
}
const Me = { tag: "seroval-plugins/web/Headers", test(e) {
  return typeof Headers > "u" ? false : e instanceof Headers;
}, parse: { sync(e, r) {
  return { value: r.parse(be$1(e)) };
}, async async(e, r) {
  return { value: await r.parse(be$1(e)) };
}, stream(e, r) {
  return { value: r.parse(be$1(e)) };
} }, serialize(e, r) {
  return "new Headers(" + r.serialize(e.value) + ")";
}, deserialize(e, r) {
  return new Headers(r.deserialize(e.value));
} }, D$1 = {}, pt$1 = (e) => new ReadableStream({ start(r) {
  e.on({ next(t) {
    try {
      r.enqueue(t);
    } catch {
    }
  }, throw(t) {
    r.error(t);
  }, return() {
    try {
      r.close();
    } catch {
    }
  } });
} }), Lo = { tag: "seroval-plugins/web/ReadableStreamFactory", test(e) {
  return e === D$1;
}, parse: { sync() {
  return D$1;
}, async async() {
  return await Promise.resolve(D$1);
}, stream() {
  return D$1;
} }, serialize() {
  return pt$1.toString();
}, deserialize() {
  return D$1;
} };
async function vt$1(e, r) {
  try {
    const t = await r.read();
    t.done ? (e.return(t.value), r.releaseLock()) : (e.next(t.value), await vt$1(e, r));
  } catch (t) {
    e.throw(t);
  }
}
function Do(e) {
  e.cancel().catch(() => {
  }), e.releaseLock();
}
function ur(e) {
  const r = Q$2(), t = e.getReader(), n = Do.bind(null, t);
  return vt$1(r, t).catch(n), [r, n];
}
const $e$1 = { tag: "seroval/plugins/web/ReadableStream", extends: [Lo], test(e) {
  return typeof ReadableStream > "u" ? false : e instanceof ReadableStream;
}, parse: { sync(e, r) {
  return { factory: r.parse(D$1), stream: r.parse(Q$2()) };
}, async async(e, r) {
  return { factory: await r.parse(D$1), stream: await r.parse(ur(e)[0]) };
}, stream(e, r) {
  const [t, n] = ur(e);
  return r.addCleanup(n), { factory: r.parse(D$1), stream: r.parse(t) };
} }, serialize(e, r) {
  return "(" + r.serialize(e.factory) + ")(" + r.serialize(e.stream) + ")";
}, deserialize(e, r) {
  const t = r.deserialize(e.stream);
  return pt$1(t);
} };
function lr(e, r) {
  return { body: r, cache: e.cache, credentials: e.credentials, headers: e.headers, integrity: e.integrity, keepalive: e.keepalive, method: e.method, mode: e.mode, redirect: e.redirect, referrer: e.referrer, referrerPolicy: e.referrerPolicy };
}
const Fo = { tag: "seroval-plugins/web/Request", extends: [$e$1, Me], test(e) {
  return typeof Request > "u" ? false : e instanceof Request;
}, parse: { async async(e, r) {
  return { url: await r.parse(e.url), options: await r.parse(lr(e, e.body && !e.bodyUsed ? await e.clone().arrayBuffer() : null)) };
}, stream(e, r) {
  return { url: r.parse(e.url), options: r.parse(lr(e, e.body && !e.bodyUsed ? e.clone().body : null)) };
} }, serialize(e, r) {
  return "new Request(" + r.serialize(e.url) + "," + r.serialize(e.options) + ")";
}, deserialize(e, r) {
  return new Request(r.deserialize(e.url), r.deserialize(e.options));
} };
function cr(e) {
  return { headers: e.headers, status: e.status, statusText: e.statusText };
}
const ko = { tag: "seroval-plugins/web/Response", extends: [$e$1, Me], test(e) {
  return typeof Response > "u" ? false : e instanceof Response;
}, parse: { async async(e, r) {
  return { body: await r.parse(e.body && !e.bodyUsed ? await e.clone().arrayBuffer() : null), options: await r.parse(cr(e)) };
}, stream(e, r) {
  return { body: r.parse(e.body && !e.bodyUsed ? e.clone().body : null), options: r.parse(cr(e)) };
} }, serialize(e, r) {
  return "new Response(" + r.serialize(e.body) + "," + r.serialize(e.options) + ")";
}, deserialize(e, r) {
  return new Response(r.deserialize(e.body), r.deserialize(e.options));
} }, Uo = { tag: "seroval-plugins/web/URL", test(e) {
  return typeof URL > "u" ? false : e instanceof URL;
}, parse: { sync(e, r) {
  return { value: r.parse(e.href) };
}, async async(e, r) {
  return { value: await r.parse(e.href) };
}, stream(e, r) {
  return { value: r.parse(e.href) };
} }, serialize(e, r) {
  return "new URL(" + r.serialize(e.value) + ")";
}, deserialize(e, r) {
  return new URL(r.deserialize(e.value));
} }, Mo = { tag: "seroval-plugins/web/URLSearchParams", test(e) {
  return typeof URLSearchParams > "u" ? false : e instanceof URLSearchParams;
}, parse: { sync(e, r) {
  return { value: r.parse(e.toString()) };
}, async async(e, r) {
  return { value: await r.parse(e.toString()) };
}, stream(e, r) {
  return { value: r.parse(e.toString()) };
} }, serialize(e, r) {
  return "new URLSearchParams(" + r.serialize(e.value) + ")";
}, deserialize(e, r) {
  return new URLSearchParams(r.deserialize(e.value));
} }, He$1 = [Io, Oo, zo, Co, Po, Me, $e$1, Fo, ko, Mo, Uo], $o = 64, gt$1 = Un.RegExp;
function mt$1(e) {
  const r = new TextEncoder().encode(e), t = r.length, n = t.toString(16), s = "00000000".substring(0, 8 - n.length) + n, i = new TextEncoder().encode(`;0x${s};`), a = new Uint8Array(12 + t);
  return a.set(i), a.set(r, 12), a;
}
function fr(e, r) {
  return new ReadableStream({ start(t) {
    wo(r, { scopeId: e, plugins: He$1, onSerialize(n, s) {
      t.enqueue(mt$1(s ? `(${Kn(e)},${n})` : n));
    }, onDone() {
      t.close();
    }, onError(n) {
      t.error(n);
    } });
  } });
}
function Ho(e) {
  return new ReadableStream({ start(r) {
    Eo(e, { disabledFeatures: gt$1, depthLimit: $o, plugins: He$1, onParse(t) {
      r.enqueue(mt$1(JSON.stringify(t)));
    }, onDone() {
      r.close();
    }, onError(t) {
      r.error(t);
    } });
  } });
}
async function dr(e) {
  return Ao(JSON.parse(e), { plugins: He$1, disabledFeatures: gt$1 });
}
async function jo(e) {
  const r = hn$1(e), t = r.request, n = t.headers.get("X-Server-Id"), s = t.headers.get("X-Server-Instance"), i = t.headers.has("X-Single-Flight"), a = new URL(t.url);
  let o, u;
  if (n) vn(typeof n == "string", "Invalid server function"), [o, u] = decodeURIComponent(n).split("#");
  else if (o = a.searchParams.get("id"), u = a.searchParams.get("name"), !o || !u) return new Response(null, { status: 404 });
  const c = kn[o];
  let f;
  if (!c) return new Response(null, { status: 404 });
  f = await c.importer();
  const g = f[c.functionName];
  let y = [];
  if (!s || e.method === "GET") {
    const l = a.searchParams.get("args");
    if (l) {
      const E = await dr(l);
      for (const x of E) y.push(x);
    }
  }
  if (e.method === "POST") {
    const l = t.headers.get("content-type"), E = e.node.req, x = E instanceof ReadableStream, ht = E.body instanceof ReadableStream, yt = x && E.locked || ht && E.body.locked, bt = x ? E : E.body, fe = yt ? t : new Request(t, { ...t, body: bt });
    t.headers.get("x-serialized") ? y = await dr(await fe.text()) : (l == null ? void 0 : l.startsWith("multipart/form-data")) || (l == null ? void 0 : l.startsWith("application/x-www-form-urlencoded")) ? y.push(await fe.formData()) : (l == null ? void 0 : l.startsWith("application/json")) && (y = await fe.json());
  }
  try {
    let l = await provideRequestEvent(r, async () => (sharedConfig.context = { event: r }, r.locals.serverFunctionMeta = { id: o + "#" + u }, g(...y)));
    if (i && s && (l = await vr(r, l)), l instanceof Response) {
      if (l.headers && l.headers.has("X-Content-Raw")) return l;
      s && (l.headers && Ge(e, l.headers), l.status && (l.status < 300 || l.status >= 400) && ie$1(e, l.status), l.customBody ? l = await l.customBody() : l.body == null && (l = null));
    }
    if (!s) return pr(l, t, y);
    return H$1(e, "x-serialized", "true"), H$1(e, "content-type", "text/javascript"), fr(s, l);
    return Ho(l);
  } catch (l) {
    if (l instanceof Response) i && s && (l = await vr(r, l)), l.headers && Ge(e, l.headers), l.status && (!s || l.status < 300 || l.status >= 400) && ie$1(e, l.status), l.customBody ? l = l.customBody() : l.body == null && (l = null), H$1(e, "X-Error", "true");
    else if (s) {
      const E = l instanceof Error ? l.message : typeof l == "string" ? l : "true";
      H$1(e, "X-Error", E.replace(/[\r\n]+/g, ""));
    } else l = pr(l, t, y, true);
    return s ? (H$1(e, "x-serialized", "true"), H$1(e, "content-type", "text/javascript"), fr(s, l)) : l;
  }
}
function pr(e, r, t, n) {
  const s = new URL(r.url), i = e instanceof Error;
  let a = 302, o;
  return e instanceof Response ? (o = new Headers(e.headers), e.headers.has("Location") && (o.set("Location", new URL(e.headers.get("Location"), s.origin + "").toString()), a = Fn(e))) : o = new Headers({ Location: new URL(r.headers.get("referer")).toString() }), e && o.append("Set-Cookie", `flash=${encodeURIComponent(JSON.stringify({ url: s.pathname + s.search, result: i ? e.message : e, thrown: n, error: i, input: [...t.slice(0, -1), [...t[t.length - 1].entries()]] }))}; Secure; HttpOnly;`), new Response(null, { status: a, headers: o });
}
let Se$1;
function qo(e) {
  var _a2;
  const r = new Headers(e.request.headers), t = sn$1(e.nativeEvent), n = e.response.headers.getSetCookie();
  r.delete("cookie");
  let s = false;
  return ((_a2 = e.nativeEvent.node) == null ? void 0 : _a2.req) && (s = true, e.nativeEvent.node.req.headers.cookie = ""), n.forEach((i) => {
    if (!i) return;
    const { maxAge: a, expires: o, name: u, value: c } = Yt$1(i);
    if (a != null && a <= 0) {
      delete t[u];
      return;
    }
    if (o != null && o.getTime() <= Date.now()) {
      delete t[u];
      return;
    }
    t[u] = c;
  }), Object.entries(t).forEach(([i, a]) => {
    r.append("cookie", `${i}=${a}`), s && (e.nativeEvent.node.req.headers.cookie += `${i}=${a};`);
  }), r;
}
async function vr(e, r) {
  let t, n = new URL(e.request.headers.get("referer")).toString();
  r instanceof Response && (r.headers.has("X-Revalidate") && (t = r.headers.get("X-Revalidate").split(",")), r.headers.has("Location") && (n = new URL(r.headers.get("Location"), new URL(e.request.url).origin + "").toString()));
  const s = mn$1(e);
  return s.request = new Request(n, { headers: qo(e) }), await provideRequestEvent(s, async () => {
    await Ln(s), Se$1 || (Se$1 = (await import('../build/app-CD-f1n0S.mjs')).default), s.router.dataOnly = t || true, s.router.previousUrl = e.request.headers.get("referer");
    try {
      renderToString(() => {
        sharedConfig.context.event = s, Se$1();
      });
    } catch (o) {
      console.log(o);
    }
    const i = s.router.data;
    if (!i) return r;
    let a = false;
    for (const o in i) i[o] === void 0 ? delete i[o] : a = true;
    return a && (r instanceof Response ? r.customBody && (i._$value = r.customBody()) : (i._$value = r, r = new Response(null, { status: 200 })), r.customBody = () => i, r.headers.set("X-Single-Flight", "true")), r;
  });
}
const Xo = eventHandler(jo);

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
let I$1;
function Q$1() {
  (!window.history.state || window.history.state._depth == null) && window.history.replaceState({ ...window.history.state, _depth: window.history.length - 1 }, ""), I$1 = window.history.state._depth;
}
isServer || Q$1();
function De(e) {
  return { ...e, _depth: window.history.state && window.history.state._depth };
}
function ke(e, t) {
  let n = false;
  return () => {
    const s = I$1;
    Q$1();
    const r = s == null ? null : I$1 - s;
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
function V$1(e) {
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
function Y$1(e) {
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
function Z$1(e) {
  let t = /(\/?\:[^\/]+)\?/.exec(e);
  if (!t) return [e];
  let n = e.slice(0, t.index), s = e.slice(t.index + t[0].length);
  const r = [n, n += t[1]];
  for (; t = /^(\/\:[^\/]+)\?/.exec(s); ) r.push(n += t[1]), s = s.slice(t[0].length);
  return Z$1(s).reduce((o, a) => [...o, ...r.map((c) => c + a)], []);
}
const Se = 100, Oe = createContext(), ee$1 = createContext(), U = () => be(useContext(Oe), "<A> and 'use' router primitives can be only used inside a Route."), _e = () => useContext(ee$1) || U().base, Be = (e) => {
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
  return te$1(e.path).reduce((h, f) => {
    for (const m of Z$1(f)) {
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
function te$1(e) {
  return Array.isArray(e) ? e : [e];
}
function qe(e, t = "", n = [], s = []) {
  const r = te$1(e);
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
  }, s, { equals: (f, m) => f.href === m.href }), o = createMemo(() => r().pathname), a = createMemo(() => r().search, true), c = createMemo(() => r().hash), u = () => "", h = on$2(a, () => V$1(r()));
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
  }, query: n ? n(h) : Y$1(h) };
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
  }, re = a.paramsWrapper ? a.paramsWrapper(z, t) : Y$1(z), H = { pattern: f, path: () => f, outlet: () => null, resolvePath(i) {
    return W(f, i);
  } };
  return createRenderEffect(on$2(r, (i) => v("native", i), { defer: true })), { base: H, location: S, params: re, isRouting: m, renderPath: u, parsePath: c, navigatorFactory: oe, matches: k, beforeLeave: h, preloadRoute: ie, singleFlight: s.singleFlight === void 0 ? true : s.singleFlight, submissions: D };
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
    return i = i || useContext(ee$1) || H, (l, g) => se(i, l, g);
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
      l && b && runWithOwner(n(), () => b({ params: B, location: { pathname: i.pathname, search: i.search, hash: i.hash, query: V$1(i), state: null, key: "" }, intent: "preload" }));
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
  e = mergeProps$1({ inactiveClass: "inactive", activeClass: "active" }, e);
  const [, t] = splitProps(e, ["href", "state", "class", "activeClass", "inactiveClass", "end"]), n = Be(() => e.href), s = Fe(n), r = je(), o = createMemo(() => {
    const a = n();
    if (a === void 0) return [false, false];
    const c = R(a.split(/[?#]/, 1)[0]).toLowerCase(), u = decodeURI(R(r.pathname).toLowerCase());
    return [e.end ? c === u : u.startsWith(c + "/") || u === c, c === u];
  });
  return ssrElement("a", mergeProps(t, { get href() {
    return s() || e.href;
  }, get state() {
    return JSON.stringify(e.state);
  }, get classList() {
    return { ...e.class && { [e.class]: true }, [e.inactiveClass]: !o()[0], [e.activeClass]: o()[0], ...t.classList };
  }, link: true, get "aria-current"() {
    return o()[1] ? "page" : void 0;
  } }), void 0, true);
}

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, key + "" , value);
function at(e = {}) {
  let t, n = false;
  const o = (a) => {
    if (t && t !== a) throw new Error("Context conflict");
  };
  let r;
  if (e.asyncContext) {
    const a = e.AsyncLocalStorage || globalThis.AsyncLocalStorage;
    a ? r = new a() : console.warn("[unctx] `AsyncLocalStorage` is not provided.");
  }
  const s = () => {
    if (r) {
      const a = r.getStore();
      if (a !== void 0) return a;
    }
    return t;
  };
  return { use: () => {
    const a = s();
    if (a === void 0) throw new Error("Context is not available");
    return a;
  }, tryUse: () => s(), set: (a, i) => {
    i || o(a), t = a, n = true;
  }, unset: () => {
    t = void 0, n = false;
  }, call: (a, i) => {
    o(a), t = a;
    try {
      return r ? r.run(a, i) : i();
    } finally {
      n || (t = void 0);
    }
  }, async callAsync(a, i) {
    t = a;
    const l = () => {
      t = a;
    }, c = () => t === a ? l : void 0;
    G.add(c);
    try {
      const f = r ? r.run(a, i) : i();
      return n || (t = void 0), await f;
    } finally {
      G.delete(c);
    }
  } };
}
function it(e = {}) {
  const t = {};
  return { get(n, o = {}) {
    return t[n] || (t[n] = at({ ...e, ...o })), t[n];
  } };
}
const H = typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof global < "u" ? global : {}, K = "__unctx__", ct = H[K] || (H[K] = it()), lt = (e, t = {}) => ct.get(e, t), z = "__unctx_async_handlers__", G = H[z] || (H[z] = /* @__PURE__ */ new Set());
function ut(e) {
  let t;
  const n = ae(e), o = { duplex: "half", method: e.method, headers: e.headers };
  return e.node.req.body instanceof ArrayBuffer ? new Request(n, { ...o, body: e.node.req.body }) : new Request(n, { ...o, get body() {
    return t || (t = vt(e), t);
  } });
}
function dt(e) {
  var _a;
  return (_a = e.web) != null ? _a : e.web = { request: ut(e), url: ae(e) }, e.web.request;
}
function ht() {
  return Ct();
}
const se = /* @__PURE__ */ Symbol("$HTTPEvent");
function ft(e) {
  return typeof e == "object" && (e instanceof H3Event || (e == null ? void 0 : e[se]) instanceof H3Event || (e == null ? void 0 : e.__is_event__) === true);
}
function w(e) {
  return function(...t) {
    var _a;
    let n = t[0];
    if (ft(n)) t[0] = n instanceof H3Event || n.__is_event__ ? n : n[se];
    else {
      if (!((_a = globalThis.app.config.server.experimental) == null ? void 0 : _a.asyncContext)) throw new Error("AsyncLocalStorage was not enabled. Use the `server.experimental.asyncContext: true` option in your app configuration to enable it. Or, pass the instance of HTTPEvent that you have as the first argument to the function.");
      if (n = ht(), !n) throw new Error("No HTTPEvent found in AsyncLocalStorage. Make sure you are using the function within the server runtime.");
      t.unshift(n);
    }
    return e(...t);
  };
}
const ae = w(getRequestURL), pt = w(getRequestIP), O = w(setResponseStatus), J = w(getResponseStatus), mt = w(getResponseStatusText), N = w(getResponseHeaders), V = w(getResponseHeader), gt = w(setResponseHeader), wt = w(appendResponseHeader), Y = w(sendRedirect), yt = w(getCookie), bt = w(setCookie), Rt = w(setHeader), vt = w(getRequestWebStream), St = w(removeResponseHeader), Et = w(dt);
function At() {
  var _a;
  return lt("nitro-app", { asyncContext: !!((_a = globalThis.app.config.server.experimental) == null ? void 0 : _a.asyncContext), AsyncLocalStorage: AsyncLocalStorage });
}
function Ct() {
  return At().use().event;
}
const C = { NORMAL: 0, WILDCARD: 1, PLACEHOLDER: 2 };
function $t(e = {}) {
  const t = { options: e, rootNode: ie(), staticRoutesMap: {} }, n = (o) => e.strictTrailingSlash ? o : o.replace(/\/$/, "") || "/";
  if (e.routes) for (const o in e.routes) Q(t, n(o), e.routes[o]);
  return { ctx: t, lookup: (o) => Tt(t, n(o)), insert: (o, r) => Q(t, n(o), r), remove: (o) => xt(t, n(o)) };
}
function Tt(e, t) {
  const n = e.staticRoutesMap[t];
  if (n) return n.data;
  const o = t.split("/"), r = {};
  let s = false, a = null, i = e.rootNode, l = null;
  for (let c = 0; c < o.length; c++) {
    const f = o[c];
    i.wildcardChildNode !== null && (a = i.wildcardChildNode, l = o.slice(c).join("/"));
    const v = i.children.get(f);
    if (v === void 0) {
      if (i && i.placeholderChildren.length > 1) {
        const S = o.length - c;
        i = i.placeholderChildren.find((m) => m.maxDepth === S) || null;
      } else i = i.placeholderChildren[0] || null;
      if (!i) break;
      i.paramName && (r[i.paramName] = f), s = true;
    } else i = v;
  }
  return (i === null || i.data === null) && a !== null && (i = a, r[i.paramName || "_"] = l, s = true), i ? s ? { ...i.data, params: s ? r : void 0 } : i.data : null;
}
function Q(e, t, n) {
  let o = true;
  const r = t.split("/");
  let s = e.rootNode, a = 0;
  const i = [s];
  for (const l of r) {
    let c;
    if (c = s.children.get(l)) s = c;
    else {
      const f = Lt(l);
      c = ie({ type: f, parent: s }), s.children.set(l, c), f === C.PLACEHOLDER ? (c.paramName = l === "*" ? `_${a++}` : l.slice(1), s.placeholderChildren.push(c), o = false) : f === C.WILDCARD && (s.wildcardChildNode = c, c.paramName = l.slice(3) || "_", o = false), i.push(c), s = c;
    }
  }
  for (const [l, c] of i.entries()) c.maxDepth = Math.max(i.length - l, c.maxDepth || 0);
  return s.data = n, o === true && (e.staticRoutesMap[t] = s), s;
}
function xt(e, t) {
  let n = false;
  const o = t.split("/");
  let r = e.rootNode;
  for (const s of o) if (r = r.children.get(s), !r) return n;
  if (r.data) {
    const s = o.at(-1) || "";
    r.data = null, Object.keys(r.children).length === 0 && r.parent && (r.parent.children.delete(s), r.parent.wildcardChildNode = null, r.parent.placeholderChildren = []), n = true;
  }
  return n;
}
function ie(e = {}) {
  return { type: e.type || C.NORMAL, maxDepth: 0, parent: e.parent || null, children: /* @__PURE__ */ new Map(), data: e.data || null, paramName: e.paramName || null, wildcardChildNode: null, placeholderChildren: [] };
}
function Lt(e) {
  return e.startsWith("**") ? C.WILDCARD : e[0] === ":" || e === "*" ? C.PLACEHOLDER : C.NORMAL;
}
const ce = [{ page: true, $component: { src: "src/routes/[...404].tsx?pick=default&pick=$css", build: () => import('../build/_2...404_.mjs'), import: () => import('../build/_2...404_.mjs') }, path: "/*404", filePath: "/Users/jonwheeler/jon_code/minwind/examples/demo/src/routes/[...404].tsx" }, { page: true, $component: { src: "src/routes/about.tsx?pick=default&pick=$css", build: () => import('../build/about2.mjs'), import: () => import('../build/about2.mjs') }, path: "/about", filePath: "/Users/jonwheeler/jon_code/minwind/examples/demo/src/routes/about.tsx" }, { page: true, $component: { src: "src/routes/index.tsx?pick=default&pick=$css", build: () => import('../build/index2.mjs'), import: () => import('../build/index2.mjs') }, path: "/", filePath: "/Users/jonwheeler/jon_code/minwind/examples/demo/src/routes/index.tsx" }], kt = Pt(ce.filter((e) => e.page));
function Pt(e) {
  function t(n, o, r, s) {
    const a = Object.values(n).find((i) => r.startsWith(i.id + "/"));
    return a ? (t(a.children || (a.children = []), o, r.slice(a.id.length)), n) : (n.push({ ...o, id: r, path: r.replace(/\([^)/]+\)/g, "").replace(/\/+/g, "/") }), n);
  }
  return e.sort((n, o) => n.path.length - o.path.length).reduce((n, o) => t(n, o, o.path, o.path), []);
}
function Nt(e, t) {
  const n = _t.lookup(e);
  if (n && n.route) {
    const o = n.route, r = t === "HEAD" ? o.$HEAD || o.$GET : o[`$${t}`];
    if (r === void 0) return;
    const s = o.page === true && o.$component !== void 0;
    return { handler: r, params: n.params, isPage: s };
  }
}
function Ht(e) {
  return e.$HEAD || e.$GET || e.$POST || e.$PUT || e.$PATCH || e.$DELETE;
}
const _t = $t({ routes: ce.reduce((e, t) => {
  if (!Ht(t)) return e;
  let n = t.path.replace(/\([^)/]+\)/g, "").replace(/\/+/g, "/").replace(/\*([^/]*)/g, (o, r) => `**:${r}`).split("/").map((o) => o.startsWith(":") || o.startsWith("*") ? o : encodeURIComponent(o)).join("/");
  if (/:[^/]*\?/g.test(n)) throw new Error(`Optional parameters are not supported in API routes: ${n}`);
  if (e[n]) throw new Error(`Duplicate API routes for "${n}" found at "${e[n].route.path}" and "${t.path}"`);
  return e[n] = { route: t }, e;
}, {}) }), _ = "solidFetchEvent";
function qt(e) {
  return { request: Et(e), response: Dt(e), clientAddress: pt(e), locals: {}, nativeEvent: e };
}
function Ot(e) {
  if (!e.context[_]) {
    const t = qt(e);
    e.context[_] = t;
  }
  return e.context[_];
}
class It {
  constructor(t) {
    __publicField(this, "event");
    this.event = t;
  }
  get(t) {
    const n = V(this.event, t);
    return Array.isArray(n) ? n.join(", ") : n || null;
  }
  has(t) {
    return this.get(t) !== null;
  }
  set(t, n) {
    return gt(this.event, t, n);
  }
  delete(t) {
    return St(this.event, t);
  }
  append(t, n) {
    wt(this.event, t, n);
  }
  getSetCookie() {
    const t = V(this.event, "Set-Cookie");
    return Array.isArray(t) ? t : [t];
  }
  forEach(t) {
    return Object.entries(N(this.event)).forEach(([n, o]) => t(Array.isArray(o) ? o.join(", ") : o, n, this));
  }
  entries() {
    return Object.entries(N(this.event)).map(([t, n]) => [t, Array.isArray(n) ? n.join(", ") : n])[Symbol.iterator]();
  }
  keys() {
    return Object.keys(N(this.event))[Symbol.iterator]();
  }
  values() {
    return Object.values(N(this.event)).map((t) => Array.isArray(t) ? t.join(", ") : t)[Symbol.iterator]();
  }
  [Symbol.iterator]() {
    return this.entries()[Symbol.iterator]();
  }
}
function Dt(e) {
  return { get status() {
    return J(e);
  }, set status(t) {
    O(e, t);
  }, get statusText() {
    return mt(e);
  }, set statusText(t) {
    O(e, J(e), t);
  }, headers: new It(e) };
}
var Ut = " ";
const jt = { style: (e) => ssrElement("style", e.attrs, () => e.children, true), link: (e) => ssrElement("link", e.attrs, void 0, true), script: (e) => e.attrs.src ? ssrElement("script", mergeProps(() => e.attrs, { get id() {
  return e.key;
} }), () => ssr(Ut), true) : null, noscript: (e) => ssrElement("noscript", e.attrs, () => escape(e.children), true) };
function I(e, t) {
  let { tag: n, attrs: { key: o, ...r } = { key: void 0 }, children: s } = e;
  return jt[n]({ attrs: { ...r, nonce: t }, key: o, children: s });
}
function Ft(e, t, n, o = "default") {
  return lazy(async () => {
    var _a;
    {
      const s = (await e.import())[o], i = (await ((_a = t.inputs) == null ? void 0 : _a[e.src].assets())).filter((c) => c.tag === "style" || c.attrs.rel === "stylesheet");
      return { default: (c) => [...i.map((f) => I(f)), createComponent(s, c)] };
    }
  });
}
function le() {
  function e(n) {
    return { ...n, ...n.$$route ? n.$$route.require().route : void 0, info: { ...n.$$route ? n.$$route.require().route.info : {}, filesystem: true }, component: n.$component && Ft(n.$component, globalThis.MANIFEST.client, globalThis.MANIFEST.ssr), children: n.children ? n.children.map(e) : void 0 };
  }
  return kt.map(e);
}
let X;
const Wt = isServer ? () => getRequestEvent().routes : () => X || (X = le());
function Bt(e) {
  const t = yt(e.nativeEvent, "flash");
  if (t) try {
    let n = JSON.parse(t);
    if (!n || !n.result) return;
    const o = [...n.input.slice(0, -1), new Map(n.input[n.input.length - 1])], r = n.error ? new Error(n.result) : n.result;
    return { input: o, url: n.url, pending: false, result: n.thrown ? void 0 : r, error: n.thrown ? r : void 0 };
  } catch (n) {
    console.error(n);
  } finally {
    bt(e.nativeEvent, "flash", "", { maxAge: 0 });
  }
}
async function Kt(e) {
  const t = globalThis.MANIFEST.client;
  return globalThis.MANIFEST.ssr, e.response.headers.set("Content-Type", "text/html"), Object.assign(e, { manifest: await t.json(), assets: [...await t.inputs[t.handler].assets()], router: { submission: Bt(e) }, routes: le(), complete: false, $islands: /* @__PURE__ */ new Set() });
}
const zt = /* @__PURE__ */ new Set([301, 302, 303, 307, 308]);
function D(e) {
  return e.status && zt.has(e.status) ? e.status : 302;
}
function Gt(e, t, n = {}, o) {
  return eventHandler({ handler: (r) => {
    const s = Ot(r);
    return provideRequestEvent(s, async () => {
      const a = Nt(new URL(s.request.url).pathname, s.request.method);
      if (a) {
        const m = await a.handler.import(), y = s.request.method === "HEAD" ? m.HEAD || m.GET : m[s.request.method];
        s.params = a.params || {}, sharedConfig.context = { event: s };
        const u = await y(s);
        if (u !== void 0) return u;
        if (s.request.method !== "GET") throw new Error(`API handler for ${s.request.method} "${s.request.url}" did not return a response.`);
        if (!a.isPage) return;
      }
      const i = await t(s), l = typeof n == "function" ? await n(i) : { ...n }, c = l.mode || "stream";
      if (l.nonce && (i.nonce = l.nonce), c === "sync") {
        const m = renderToString(() => (sharedConfig.context.event = i, e(i)), l);
        if (i.complete = true, i.response && i.response.headers.get("Location")) {
          const y = D(i.response);
          return Y(r, i.response.headers.get("Location"), y);
        }
        return m;
      }
      if (l.onCompleteAll) {
        const m = l.onCompleteAll;
        l.onCompleteAll = (y) => {
          ee(i)(y), m(y);
        };
      } else l.onCompleteAll = ee(i);
      if (l.onCompleteShell) {
        const m = l.onCompleteShell;
        l.onCompleteShell = (y) => {
          Z(i, r)(), m(y);
        };
      } else l.onCompleteShell = Z(i, r);
      const f = renderToStream(() => (sharedConfig.context.event = i, e(i)), l);
      if (i.response && i.response.headers.get("Location")) {
        const m = D(i.response);
        return Y(r, i.response.headers.get("Location"), m);
      }
      if (c === "async") return f;
      const { writable: v, readable: S } = new TransformStream();
      return f.pipeTo(v), S;
    });
  } });
}
function Z(e, t) {
  return () => {
    if (e.response && e.response.headers.get("Location")) {
      const n = D(e.response);
      O(t, n), Rt(t, "Location", e.response.headers.get("Location"));
    }
  };
}
function ee(e) {
  return ({ write: t }) => {
    e.complete = true;
    const n = e.response && e.response.headers.get("Location");
    n && t(`<script>window.location="${n}"<\/script>`);
  };
}
function Jt(e, t, n) {
  return Gt(e, Kt, t);
}
const ue = (e) => (t) => {
  const { base: n } = t, o = children(() => t.children), r = createMemo(() => qe(o(), t.base || ""));
  let s;
  const a = He(e, r, () => s, { base: n, singleFlight: t.singleFlight, transformUrl: t.transformUrl });
  return e.create && e.create(a), createComponent$1(Oe.Provider, { value: a, get children() {
    return createComponent$1(Vt, { routerState: a, get root() {
      return t.root;
    }, get preload() {
      return t.rootPreload || t.rootLoad;
    }, get children() {
      return [(s = getOwner()) && null, createComponent$1(Yt, { routerState: a, get branches() {
        return r();
      } })];
    } });
  } });
};
function Vt(e) {
  const t = e.routerState.location, n = e.routerState.params, o = createMemo(() => e.preload && untrack(() => {
    e.preload({ params: n, location: t, intent: ze() || "initial" });
  }));
  return createComponent$1(Show, { get when() {
    return e.root;
  }, keyed: true, get fallback() {
    return e.children;
  }, children: (r) => createComponent$1(r, { params: n, location: t, get data() {
    return o();
  }, get children() {
    return e.children;
  } }) });
}
function Yt(e) {
  if (isServer) {
    const r = getRequestEvent();
    if (r && r.router && r.router.dataOnly) {
      Qt(r, e.routerState, e.branches);
      return;
    }
    r && ((r.router || (r.router = {})).matches || (r.router.matches = e.routerState.matches().map(({ route: s, path: a, params: i }) => ({ path: s.originalPath, pattern: s.pattern, match: a, params: i, info: s.info }))));
  }
  const t = [];
  let n;
  const o = createMemo(on$2(e.routerState.matches, (r, s, a) => {
    let i = s && r.length === s.length;
    const l = [];
    for (let c = 0, f = r.length; c < f; c++) {
      const v = s && s[c], S = r[c];
      a && v && S.route.key === v.route.key ? l[c] = a[c] : (i = false, t[c] && t[c](), createRoot((m) => {
        t[c] = m, l[c] = Ke(e.routerState, l[c - 1] || e.routerState.base, te(() => o()[c + 1]), () => {
          var _a;
          const y = e.routerState.matches();
          return (_a = y[c]) != null ? _a : y[0];
        });
      }));
    }
    return t.splice(r.length).forEach((c) => c()), a && i ? a : (n = l[0], l);
  }));
  return te(() => o() && n)();
}
const te = (e) => () => createComponent$1(Show, { get when() {
  return e();
}, keyed: true, children: (t) => createComponent$1(ee$1.Provider, { value: t, get children() {
  return t.outlet();
} }) });
function Qt(e, t, n) {
  const o = new URL(e.request.url), r = q(n, new URL(e.router.previousUrl || e.request.url).pathname), s = q(n, o.pathname);
  for (let a = 0; a < s.length; a++) {
    (!r[a] || s[a].route !== r[a].route) && (e.router.dataOnly = true);
    const { route: i, params: l } = s[a];
    i.preload && i.preload({ params: l, location: t.location, intent: "preload" });
  }
}
function Xt([e, t], n, o) {
  return [e, o ? (r) => t(o(r)) : t];
}
function Zt(e) {
  let t = false;
  const n = (r) => typeof r == "string" ? { value: r } : r, o = Xt(createSignal(n(e.get()), { equals: (r, s) => r.value === s.value && r.state === s.state }), void 0, (r) => (!t && e.set(r), sharedConfig.registry && !sharedConfig.done && (sharedConfig.done = true), r));
  return e.init && onCleanup(e.init((r = e.get()) => {
    t = true, o[1](n(r)), t = false;
  })), ue({ signal: o, create: e.create, utils: e.utils });
}
function en(e, t, n) {
  return e.addEventListener(t, n), () => e.removeEventListener(t, n);
}
function tn(e, t) {
  const n = e && document.getElementById(e);
  n ? n.scrollIntoView() : t && window.scrollTo(0, 0);
}
function nn(e) {
  const t = new URL(e);
  return t.pathname + t.search;
}
function rn(e) {
  let t;
  const n = { value: e.url || (t = getRequestEvent()) && nn(t.request.url) || "" };
  return ue({ signal: [() => n, (o) => Object.assign(n, o)] })(e);
}
const on = /* @__PURE__ */ new Map();
function sn(e = true, t = false, n = "/_server", o) {
  return (r) => {
    const s = r.base.path(), a = r.navigatorFactory(r.base);
    let i, l;
    function c(u) {
      return u.namespaceURI === "http://www.w3.org/2000/svg";
    }
    function f(u) {
      if (u.defaultPrevented || u.button !== 0 || u.metaKey || u.altKey || u.ctrlKey || u.shiftKey) return;
      const d = u.composedPath().find((F) => F instanceof Node && F.nodeName.toUpperCase() === "A");
      if (!d || t && !d.hasAttribute("link")) return;
      const g = c(d), p = g ? d.href.baseVal : d.href;
      if ((g ? d.target.baseVal : d.target) || !p && !d.hasAttribute("state")) return;
      const $ = (d.getAttribute("rel") || "").split(/\s+/);
      if (d.hasAttribute("download") || $ && $.includes("external")) return;
      const L = g ? new URL(p, document.baseURI) : new URL(p);
      if (!(L.origin !== window.location.origin || s && L.pathname && !L.pathname.toLowerCase().startsWith(s.toLowerCase()))) return [d, L];
    }
    function v(u) {
      const d = f(u);
      if (!d) return;
      const [g, p] = d, j = r.parsePath(p.pathname + p.search + p.hash), $ = g.getAttribute("state");
      u.preventDefault(), a(j, { resolve: false, replace: g.hasAttribute("replace"), scroll: !g.hasAttribute("noscroll"), state: $ ? JSON.parse($) : void 0 });
    }
    function S(u) {
      const d = f(u);
      if (!d) return;
      const [g, p] = d;
      o && (p.pathname = o(p.pathname)), r.preloadRoute(p, g.getAttribute("preload") !== "false");
    }
    function m(u) {
      clearTimeout(i);
      const d = f(u);
      if (!d) return l = null;
      const [g, p] = d;
      l !== g && (o && (p.pathname = o(p.pathname)), i = setTimeout(() => {
        r.preloadRoute(p, g.getAttribute("preload") !== "false"), l = g;
      }, 20));
    }
    function y(u) {
      if (u.defaultPrevented) return;
      let d = u.submitter && u.submitter.hasAttribute("formaction") ? u.submitter.getAttribute("formaction") : u.target.getAttribute("action");
      if (!d) return;
      if (!d.startsWith("https://action/")) {
        const p = new URL(d, Ce);
        if (d = r.parsePath(p.pathname + p.search), !d.startsWith(n)) return;
      }
      if (u.target.method.toUpperCase() !== "POST") throw new Error("Only POST forms are supported for Actions");
      const g = on.get(d);
      if (g) {
        u.preventDefault();
        const p = new FormData(u.target, u.submitter);
        g.call({ r, f: u.target }, u.target.enctype === "multipart/form-data" ? p : new URLSearchParams(p));
      }
    }
    delegateEvents(["click", "submit"]), document.addEventListener("click", v), e && (document.addEventListener("mousemove", m, { passive: true }), document.addEventListener("focusin", S, { passive: true }), document.addEventListener("touchstart", S, { passive: true })), document.addEventListener("submit", y), onCleanup(() => {
      document.removeEventListener("click", v), e && (document.removeEventListener("mousemove", m), document.removeEventListener("focusin", S), document.removeEventListener("touchstart", S)), document.removeEventListener("submit", y);
    });
  };
}
function an(e) {
  if (isServer) return rn(e);
  const t = () => {
    const o = window.location.pathname.replace(/^\/+/, "/") + window.location.search, r = window.history.state && window.history.state._depth && Object.keys(window.history.state).length === 1 ? void 0 : window.history.state;
    return { value: o + window.location.hash, state: r };
  }, n = Pe();
  return Zt({ get: t, set({ value: o, replace: r, scroll: s, state: a }) {
    r ? window.history.replaceState(De(a), "", o) : window.history.pushState(a, "", o), tn(decodeURIComponent(window.location.hash.slice(1)), s), Q$1();
  }, init: (o) => en(window, "popstate", ke(o, (r) => {
    if (r) return !n.confirm(r);
    {
      const s = t();
      return !n.confirm(s.value, { state: s.state });
    }
  })), create: sn(e.preload, e.explicitLinks, e.actionBase, e.transformUrl), utils: { go: (o) => window.history.go(o), beforeLeave: n } })(e);
}
var cn = ["<div", ' class="quill willow north lark ember ljaa"><header class="willow glen harbor breeze brown g2hk"><!--$-->', '<!--/--><nav class="willow glen brook dog drift">', '</nav></header><main class="wind in">', '</main><footer class="pine willow glen harbor gale brown g2hk dog shore"><span class="far">classname compression, dogfooded</span><button class="a whisper moves through the leaves">toggle theme</button></footer></div>'];
function ln(e) {
  return ssr(cn, ssrHydrationKey(), escape(createComponent$1(Ne, { href: "/", class: "dt47 small far flag leaves a fox", children: "minwind demo" })), escape(createComponent$1(Ne, { href: "/about", class: "flag leaves a dune", children: "about" })), escape(e.children));
}
function un() {
  return createComponent$1(an, { root: (e) => createComponent$1(ln, { get children() {
    return createComponent$1(Suspense, { get children() {
      return e.children;
    } });
  } }), get children() {
    return createComponent$1(Wt, {});
  } });
}
const de = isServer ? (e) => {
  const t = getRequestEvent();
  return t.response.status = e.code, t.response.statusText = e.text, onCleanup(() => !t.nativeEvent.handled && !t.complete && (t.response.status = 200)), null;
} : (e) => null;
var dn = ["<span", ' style="font-size:1.5em;text-align:center;position:fixed;left:0px;bottom:55%;width:100%;">', "</span>"], hn = ["<span", ' style="font-size:1.5em;text-align:center;position:fixed;left:0px;bottom:55%;width:100%;">500 | Internal Server Error</span>'];
const fn = (e) => {
  const t = isServer ? "500 | Internal Server Error" : "Error | Uncaught Client Exception";
  return createComponent$1(ErrorBoundary, { fallback: (n) => (console.error(n), [ssr(dn, ssrHydrationKey(), escape(t)), createComponent$1(de, { code: 500 })]), get children() {
    return e.children;
  } });
}, pn = (e) => {
  let t = false;
  const n = catchError(() => e.children, (o) => {
    console.error(o), t = !!o;
  });
  return t ? [ssr(hn, ssrHydrationKey()), createComponent$1(de, { code: 500 })] : n;
};
var ne = ["<script", ">", "<\/script>"], mn = ["<script", ' type="module"', " async", "><\/script>"], gn = ["<script", ' type="module" async', "><\/script>"];
const wn = ssr("<!DOCTYPE html>");
function he(e, t, n = []) {
  for (let o = 0; o < t.length; o++) {
    const r = t[o];
    if (r.path !== e[0].path) continue;
    let s = [...n, r];
    if (r.children) {
      const a = e.slice(1);
      if (a.length === 0 || (s = he(a, r.children, s), !s)) continue;
    }
    return s;
  }
}
function yn(e) {
  const t = getRequestEvent(), n = t.nonce;
  let o = [];
  return Promise.resolve().then(async () => {
    let r = [];
    if (t.router && t.router.matches) {
      const s = [...t.router.matches];
      for (; s.length && (!s[0].info || !s[0].info.filesystem); ) s.shift();
      const a = s.length && he(s, t.routes);
      if (a) {
        const i = globalThis.MANIFEST.client.inputs;
        for (let l = 0; l < a.length; l++) {
          const c = a[l], f = i[c.$component.src];
          r.push(f.assets());
        }
      }
    }
    o = await Promise.all(r).then((s) => [...new Map(s.flat().map((a) => [a.attrs.key, a])).values()].filter((a) => a.attrs.rel === "modulepreload" && !t.assets.find((i) => i.attrs.key === a.attrs.key)));
  }), useAssets(() => o.length ? o.map((r) => I(r)) : void 0), createComponent$1(NoHydration, { get children() {
    return [wn, createComponent$1(pn, { get children() {
      return createComponent$1(e.document, { get assets() {
        return [createComponent$1(HydrationScript, {}), t.assets.map((r) => I(r, n))];
      }, get scripts() {
        return n ? [ssr(ne, ssrHydrationKey() + ssrAttribute("nonce", escape(n, true), false), `window.manifest = ${JSON.stringify(t.manifest)}`), ssr(mn, ssrHydrationKey(), ssrAttribute("nonce", escape(n, true), false), ssrAttribute("src", escape(globalThis.MANIFEST.client.inputs[globalThis.MANIFEST.client.handler].output.path, true), false))] : [ssr(ne, ssrHydrationKey(), `window.manifest = ${JSON.stringify(t.manifest)}`), ssr(gn, ssrHydrationKey(), ssrAttribute("src", escape(globalThis.MANIFEST.client.inputs[globalThis.MANIFEST.client.handler].output.path, true), false))];
      }, get children() {
        return createComponent$1(Hydration, { get children() {
          return createComponent$1(fn, { get children() {
            return createComponent$1(un, {});
          } });
        } });
      } });
    } })];
  } });
}
var bn = ['<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">', "</head>"], Rn = ["<html", ' lang="en">', '<body><div id="app">', "</div><!--$-->", "<!--/--></body></html>"];
const Tn = Jt(() => createComponent$1(yn, { document: ({ assets: e, children: t, scripts: n }) => ssr(Rn, ssrHydrationKey(), createComponent$1(NoHydration, { get children() {
  return ssr(bn, escape(e));
} }), escape(t), escape(n)) }));

const handlers = [
  { route: '', handler: _hzN7YT, lazy: false, middleware: true, method: undefined },
  { route: '/_server', handler: Xo, lazy: false, middleware: true, method: undefined },
  { route: '/', handler: Tn, lazy: false, middleware: true, method: undefined }
];

function createNitroApp() {
  const config = useRuntimeConfig();
  const hooks = createHooks();
  const captureError = (error, context = {}) => {
    const promise = hooks.callHookParallel("error", error, context).catch((error_) => {
      console.error("Error while capturing another error", error_);
    });
    if (context.event && isEvent(context.event)) {
      const errors = context.event.context.nitro?.errors;
      if (errors) {
        errors.push({ error, context });
      }
      if (context.event.waitUntil) {
        context.event.waitUntil(promise);
      }
    }
  };
  const h3App = createApp({
    debug: destr(false),
    onError: (error, event) => {
      captureError(error, { event, tags: ["request"] });
      return errorHandler(error, event);
    },
    onRequest: async (event) => {
      event.context.nitro = event.context.nitro || { errors: [] };
      const fetchContext = event.node.req?.__unenv__;
      if (fetchContext?._platform) {
        event.context = {
          _platform: fetchContext?._platform,
          // #3335
          ...fetchContext._platform,
          ...event.context
        };
      }
      if (!event.context.waitUntil && fetchContext?.waitUntil) {
        event.context.waitUntil = fetchContext.waitUntil;
      }
      event.fetch = (req, init) => fetchWithEvent(event, req, init, { fetch: localFetch });
      event.$fetch = (req, init) => fetchWithEvent(event, req, init, {
        fetch: $fetch
      });
      event.waitUntil = (promise) => {
        if (!event.context.nitro._waitUntilPromises) {
          event.context.nitro._waitUntilPromises = [];
        }
        event.context.nitro._waitUntilPromises.push(promise);
        if (event.context.waitUntil) {
          event.context.waitUntil(promise);
        }
      };
      event.captureError = (error, context) => {
        captureError(error, { event, ...context });
      };
      await nitroApp$1.hooks.callHook("request", event).catch((error) => {
        captureError(error, { event, tags: ["request"] });
      });
    },
    onBeforeResponse: async (event, response) => {
      await nitroApp$1.hooks.callHook("beforeResponse", event, response).catch((error) => {
        captureError(error, { event, tags: ["request", "response"] });
      });
    },
    onAfterResponse: async (event, response) => {
      await nitroApp$1.hooks.callHook("afterResponse", event, response).catch((error) => {
        captureError(error, { event, tags: ["request", "response"] });
      });
    }
  });
  const router = createRouter$1({
    preemptive: true
  });
  const nodeHandler = toNodeListener(h3App);
  const localCall = (aRequest) => callNodeRequestHandler(
    nodeHandler,
    aRequest
  );
  const localFetch = (input, init) => {
    if (!input.toString().startsWith("/")) {
      return globalThis.fetch(input, init);
    }
    return fetchNodeRequestHandler(
      nodeHandler,
      input,
      init
    ).then((response) => normalizeFetchResponse(response));
  };
  const $fetch = createFetch({
    fetch: localFetch,
    Headers: Headers$1,
    defaults: { baseURL: config.app.baseURL }
  });
  globalThis.$fetch = $fetch;
  h3App.use(createRouteRulesHandler({ localFetch }));
  for (const h of handlers) {
    let handler = h.lazy ? lazyEventHandler(h.handler) : h.handler;
    if (h.middleware || !h.route) {
      const middlewareBase = (config.app.baseURL + (h.route || "/")).replace(
        /\/+/g,
        "/"
      );
      h3App.use(middlewareBase, handler);
    } else {
      const routeRules = getRouteRulesForPath(
        h.route.replace(/:\w+|\*\*/g, "_")
      );
      if (routeRules.cache) {
        handler = cachedEventHandler(handler, {
          group: "nitro/routes",
          ...routeRules.cache
        });
      }
      router.use(h.route, handler, h.method);
    }
  }
  h3App.use(config.app.baseURL, router.handler);
  {
    const _handler = h3App.handler;
    h3App.handler = (event) => {
      const ctx = { event };
      return nitroAsyncContext.callAsync(ctx, () => _handler(event));
    };
  }
  const app = {
    hooks,
    h3App,
    router,
    localCall,
    localFetch,
    captureError
  };
  return app;
}
function runNitroPlugins(nitroApp2) {
  for (const plugin of plugins) {
    try {
      plugin(nitroApp2);
    } catch (error) {
      nitroApp2.captureError(error, { tags: ["plugin"] });
      throw error;
    }
  }
}
const nitroApp$1 = createNitroApp();
function useNitroApp() {
  return nitroApp$1;
}
runNitroPlugins(nitroApp$1);

const nitroApp = useNitroApp();
const localFetch = nitroApp.localFetch;
const closePrerenderer = () => nitroApp.hooks.callHook("close");
trapUnhandledNodeErrors();

export { Ne as N, Zo as Z, closePrerenderer as c, localFetch as l };
//# sourceMappingURL=nitro.mjs.map
