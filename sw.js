/* うちの子ナビ サービスワーカー
   方針：
   - HTML（ページ本体）は「ネット優先」→ 更新が必ず反映される。オフライン時だけキャッシュ。
   - 画像など他のファイルは「キャッシュ優先」＋裏で更新（表示が速い・オフラインでも開ける）。
   アプリを更新したらバージョン（CACHE）を上げると、古いキャッシュを自動で片付けます。 */
const CACHE = 'uchinoko-v1';
const PRECACHE = [
  './app.html',
  './manifest.webmanifest',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/icon-180.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== location.origin) return;

  const isHTML = req.mode === 'navigate' || req.destination === 'document' || url.pathname.endsWith('.html');

  if (isHTML) {
    // ネット優先（更新を確実に反映）
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./app.html')))
    );
  } else {
    // キャッシュ優先＋裏で更新
    e.respondWith(
      caches.match(req).then(cached => {
        const net = fetch(req).then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => cached);
        return cached || net;
      })
    );
  }
});
