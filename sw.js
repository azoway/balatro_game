/* 小丑牌 · JOKER — Service Worker
   网络优先、缓存兜底：在线时始终拿最新版本，离线时用缓存照常游玩。 */
const CACHE = "joker-v6";
const ASSETS = [
  "./", "./index.html", "./style.css",
  "./i18n.js", "./defs.js", "./engine.js", "./ui.js",
  "./manifest.json", "./icon.svg", "./apple-touch-icon.png",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
