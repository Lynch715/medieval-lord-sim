// 离线：代码走网络优先（上线立刻是新版），图片走缓存优先 + 后台更新。
const VER = "iron-crown-v1";
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./site.webmanifest",
  "./favicon.ico",
  "./icon/icon-192.png",
  "./icon/icon-512.png",
  "./src/01-data.js",
  "./src/02-core.js",
  "./src/03-domain.js",
  "./src/04-state.js",
  "./src/05-war.js",
  "./src/06-ui.js",
  "./src/07-exports.js",
  "./assets/aveline.webp",
  "./assets/battle-capital.webp",
  "./assets/battle-forest.webp",
  "./assets/battle-mountain.webp",
  "./assets/battle-plains.webp",
  "./assets/battle-river.webp",
  "./assets/bran.webp",
  "./assets/edmund.webp",
  "./assets/image2.webp",
  "./assets/northern-march-map.webp",
  "./assets/oswin.webp",
  "./assets/player.webp",
  "./assets/regent-duke.webp",
  "./assets/renard.webp",
  "./assets/roderic.webp",
  "./assets/ysabel.webp"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  const isImage = /\.(webp|png|ico|jpg|svg)(\?|$)/.test(req.url);
  if (isImage) {
    e.respondWith(caches.open(VER).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
      return hit || (await net) || Response.error();
    }));
    return;
  }
  e.respondWith(caches.open(VER).then(async c => {
    try {
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    } catch (_) {
      return (await c.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? c.match("./index.html") : Response.error());
    }
  }));
});
