// network-first: 常にネットワークを優先。オフライン時のみキャッシュから返す。
// installで先読みキャッシュはしない（古いHTMLを抱え込まないため）。
const CACHE_NAME = 'lyrics-app-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 同一オリジンの静的ファイルのGETだけをキャッシュ対象にする。
  // /api/ はデータなのでキャッシュせず素通し（Google Fonts等の他オリジンも素通し）。
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
