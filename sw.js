/* =========================================================================
 * BAR & — Service Worker（PWA用・最小構成）
 * -------------------------------------------------------------------------
 * 方針:
 *   - 同一オリジンのGETだけ扱う（Supabase等のAPIは素通し＝常に最新）
 *   - コア資産はインストール時にキャッシュ（オフラインでも骨組みが開く）
 *   - その他は network-first（成功したらキャッシュ更新、失敗時キャッシュ）
 *   - バージョンを上げると古いキャッシュは自動削除
 * ========================================================================= */
const VERSION = "and-card-v1";
const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data/config.js",
  "./data/cards.js",
  "./manifest.webmanifest",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // 同一オリジンのGET以外（Supabase・Googleフォント等）は触らない
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
  );
});
