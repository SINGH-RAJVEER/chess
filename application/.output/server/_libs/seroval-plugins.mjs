import { n as ni, t as te$1 } from "./seroval.mjs";
var u = (e) => {
  let r = new AbortController(), a = r.abort.bind(r);
  return e.then(a, a), r;
};
function E(e) {
  e(this.reason);
}
function D(e) {
  this.addEventListener("abort", E.bind(this, e), { once: true });
}
function c(e) {
  return new Promise(D.bind(e));
}
var i = {}, F = ni({ tag: "seroval-plugins/web/AbortControllerFactoryPlugin", test(e) {
  return e === i;
}, parse: { sync() {
  return i;
}, async async() {
  return await Promise.resolve(i);
}, stream() {
  return i;
} }, serialize() {
  return u.toString();
}, deserialize() {
  return u;
} }), A = ni({ tag: "seroval-plugins/web/AbortSignal", extends: [F], test(e) {
  return typeof AbortSignal == "undefined" ? false : e instanceof AbortSignal;
}, parse: { sync(e, r) {
  return e.aborted ? { reason: r.parse(e.reason) } : {};
}, async async(e, r) {
  if (e.aborted) return { reason: await r.parse(e.reason) };
  let a = await c(e);
  return { reason: await r.parse(a) };
}, stream(e, r) {
  if (e.aborted) return { reason: r.parse(e.reason) };
  let a = c(e);
  return { factory: r.parse(i), controller: r.parse(a) };
} }, serialize(e, r) {
  return e.reason ? "AbortSignal.abort(" + r.serialize(e.reason) + ")" : e.controller && e.factory ? "(" + r.serialize(e.factory) + ")(" + r.serialize(e.controller) + ").signal" : "(new AbortController).signal";
}, deserialize(e, r) {
  return e.reason ? AbortSignal.abort(r.deserialize(e.reason)) : e.controller ? u(r.deserialize(e.controller)).signal : new AbortController().signal;
} }), O = A;
function d(e) {
  return { detail: e.detail, bubbles: e.bubbles, cancelable: e.cancelable, composed: e.composed };
}
var U = ni({ tag: "seroval-plugins/web/CustomEvent", test(e) {
  return typeof CustomEvent == "undefined" ? false : e instanceof CustomEvent;
}, parse: { sync(e, r) {
  return { type: r.parse(e.type), options: r.parse(d(e)) };
}, async async(e, r) {
  return { type: await r.parse(e.type), options: await r.parse(d(e)) };
}, stream(e, r) {
  return { type: r.parse(e.type), options: r.parse(d(e)) };
} }, serialize(e, r) {
  return "new CustomEvent(" + r.serialize(e.type) + "," + r.serialize(e.options) + ")";
}, deserialize(e, r) {
  return new CustomEvent(r.deserialize(e.type), r.deserialize(e.options));
} }), L = U;
var _ = ni({ tag: "seroval-plugins/web/DOMException", test(e) {
  return typeof DOMException == "undefined" ? false : e instanceof DOMException;
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
} }), q = _;
function f(e) {
  return { bubbles: e.bubbles, cancelable: e.cancelable, composed: e.composed };
}
var k = ni({ tag: "seroval-plugins/web/Event", test(e) {
  return typeof Event == "undefined" ? false : e instanceof Event;
}, parse: { sync(e, r) {
  return { type: r.parse(e.type), options: r.parse(f(e)) };
}, async async(e, r) {
  return { type: await r.parse(e.type), options: await r.parse(f(e)) };
}, stream(e, r) {
  return { type: r.parse(e.type), options: r.parse(f(e)) };
} }, serialize(e, r) {
  return "new Event(" + r.serialize(e.type) + "," + r.serialize(e.options) + ")";
}, deserialize(e, r) {
  return new Event(r.deserialize(e.type), r.deserialize(e.options));
} }), Y = k;
var V = ni({ tag: "seroval-plugins/web/File", test(e) {
  return typeof File == "undefined" ? false : e instanceof File;
}, parse: { async async(e, r) {
  return { name: await r.parse(e.name), options: await r.parse({ type: e.type, lastModified: e.lastModified }), buffer: await r.parse(await e.arrayBuffer()) };
} }, serialize(e, r) {
  return "new File([" + r.serialize(e.buffer) + "]," + r.serialize(e.name) + "," + r.serialize(e.options) + ")";
}, deserialize(e, r) {
  return new File([r.deserialize(e.buffer)], r.deserialize(e.name), r.deserialize(e.options));
} }), m = V;
function y(e) {
  let r = [];
  return e.forEach((a, t) => {
    r.push([t, a]);
  }), r;
}
var o = {}, v = (e, r = new FormData(), a = 0, t = e.length, s) => {
  for (; a < t; a++) s = e[a], r.append(s[0], s[1]);
  return r;
}, G = ni({ tag: "seroval-plugins/web/FormDataFactory", test(e) {
  return e === o;
}, parse: { sync() {
  return o;
}, async async() {
  return await Promise.resolve(o);
}, stream() {
  return o;
} }, serialize() {
  return v.toString();
}, deserialize() {
  return o;
} }), J = ni({ tag: "seroval-plugins/web/FormData", extends: [m, G], test(e) {
  return typeof FormData == "undefined" ? false : e instanceof FormData;
}, parse: { sync(e, r) {
  return { factory: r.parse(o), entries: r.parse(y(e)) };
}, async async(e, r) {
  return { factory: await r.parse(o), entries: await r.parse(y(e)) };
}, stream(e, r) {
  return { factory: r.parse(o), entries: r.parse(y(e)) };
} }, serialize(e, r) {
  return "(" + r.serialize(e.factory) + ")(" + r.serialize(e.entries) + ")";
}, deserialize(e, r) {
  return v(r.deserialize(e.entries));
} }), K = J;
function g(e) {
  let r = [];
  return e.forEach((a, t) => {
    r.push([t, a]);
  }), r;
}
var W = ni({ tag: "seroval-plugins/web/Headers", test(e) {
  return typeof Headers == "undefined" ? false : e instanceof Headers;
}, parse: { sync(e, r) {
  return { value: r.parse(g(e)) };
}, async async(e, r) {
  return { value: await r.parse(g(e)) };
}, stream(e, r) {
  return { value: r.parse(g(e)) };
} }, serialize(e, r) {
  return "new Headers(" + r.serialize(e.value) + ")";
}, deserialize(e, r) {
  return new Headers(r.deserialize(e.value));
} }), l = W;
var n = {}, P = (e) => new ReadableStream({ start: (r) => {
  e.on({ next: (a) => {
    try {
      r.enqueue(a);
    } catch (t) {
    }
  }, throw: (a) => {
    r.error(a);
  }, return: () => {
    try {
      r.close();
    } catch (a) {
    }
  } });
} }), x = ni({ tag: "seroval-plugins/web/ReadableStreamFactory", test(e) {
  return e === n;
}, parse: { sync() {
  return n;
}, async async() {
  return await Promise.resolve(n);
}, stream() {
  return n;
} }, serialize() {
  return P.toString();
}, deserialize() {
  return n;
} });
function w(e) {
  let r = te$1(), a = e.getReader();
  async function t() {
    try {
      let s = await a.read();
      s.done ? r.return(s.value) : (r.next(s.value), await t());
    } catch (s) {
      r.throw(s);
    }
  }
  return t().catch(() => {
  }), r;
}
var ee = ni({ tag: "seroval/plugins/web/ReadableStream", extends: [x], test(e) {
  return typeof ReadableStream == "undefined" ? false : e instanceof ReadableStream;
}, parse: { sync(e, r) {
  return { factory: r.parse(n), stream: r.parse(te$1()) };
}, async async(e, r) {
  return { factory: await r.parse(n), stream: await r.parse(w(e)) };
}, stream(e, r) {
  return { factory: r.parse(n), stream: r.parse(w(e)) };
} }, serialize(e, r) {
  return "(" + r.serialize(e.factory) + ")(" + r.serialize(e.stream) + ")";
}, deserialize(e, r) {
  let a = r.deserialize(e.stream);
  return P(a);
} }), p = ee;
function N(e, r) {
  return { body: r, cache: e.cache, credentials: e.credentials, headers: e.headers, integrity: e.integrity, keepalive: e.keepalive, method: e.method, mode: e.mode, redirect: e.redirect, referrer: e.referrer, referrerPolicy: e.referrerPolicy };
}
var ae = ni({ tag: "seroval-plugins/web/Request", extends: [p, l], test(e) {
  return typeof Request == "undefined" ? false : e instanceof Request;
}, parse: { async async(e, r) {
  return { url: await r.parse(e.url), options: await r.parse(N(e, e.body && !e.bodyUsed ? await e.clone().arrayBuffer() : null)) };
}, stream(e, r) {
  return { url: r.parse(e.url), options: r.parse(N(e, e.body && !e.bodyUsed ? e.clone().body : null)) };
} }, serialize(e, r) {
  return "new Request(" + r.serialize(e.url) + "," + r.serialize(e.options) + ")";
}, deserialize(e, r) {
  return new Request(r.deserialize(e.url), r.deserialize(e.options));
} }), te = ae;
function h(e) {
  return { headers: e.headers, status: e.status, statusText: e.statusText };
}
var oe = ni({ tag: "seroval-plugins/web/Response", extends: [p, l], test(e) {
  return typeof Response == "undefined" ? false : e instanceof Response;
}, parse: { async async(e, r) {
  return { body: await r.parse(e.body && !e.bodyUsed ? await e.clone().arrayBuffer() : null), options: await r.parse(h(e)) };
}, stream(e, r) {
  return { body: r.parse(e.body && !e.bodyUsed ? e.clone().body : null), options: r.parse(h(e)) };
} }, serialize(e, r) {
  return "new Response(" + r.serialize(e.body) + "," + r.serialize(e.options) + ")";
}, deserialize(e, r) {
  return new Response(r.deserialize(e.body), r.deserialize(e.options));
} }), ne = oe;
var le = ni({ tag: "seroval-plugins/web/URL", test(e) {
  return typeof URL == "undefined" ? false : e instanceof URL;
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
} }), pe = le;
var de = ni({ tag: "seroval-plugins/web/URLSearchParams", test(e) {
  return typeof URLSearchParams == "undefined" ? false : e instanceof URLSearchParams;
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
} }), fe = de;
export {
  K,
  L,
  O,
  Y,
  pe as a,
  fe as f,
  l,
  ne as n,
  p,
  q,
  te as t
};
