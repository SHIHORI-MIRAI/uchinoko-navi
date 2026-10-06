/* うちの子ナビ サービスワーカー
   方針：
   - HTML（ページ本体）は「ネット優先・HTTPキャッシュも迂回」→ 更新が必ず最新で反映。オフライン時だけキャッシュ。
   - 画像など他のファイルは「キャッシュ優先」＋裏で更新（表示が速い・オフラインでも開ける）。
   アプリを更新したら CACHE のバージョンを上げる。古いキャッシュは activate で自動削除し、
   skipWaiting + clients.claim ですぐ新バージョンに切り替わる（ページ側は controllerchange で自動リロード）。 */
const CACHE = 'uchinoko-v2';
const PRECACHE = [
  './app.html',
  './manifest.webmanifest',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/icon-180.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  // 最新を取りに行く（HTTPキャッシュを迂回）
  e.waitUntil(
    caches.open(CACHE).then(c =>
      c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' }))).catch(() => {})
    )
  );
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
    // ネット優先＋HTTPキャッシュ迂回（常に最新のページ本体を取得）
    e.respondWith(
      fetch(new Request(url.pathname + url.search, { cache: 'reload' })).then(res => {
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
