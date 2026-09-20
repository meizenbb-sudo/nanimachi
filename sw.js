/**
 * オフラインで動かすための Service Worker。
 *
 * 本体は1ファイル（index.html・約770KB）なので、初回に丸ごと保存して、次からはそれを出す。
 * 本体が変わるとビルドが下の VERSION を書き換えるので、新しい版が入ったら画面に「更新」の帯を出す。
 * 書体（Google Fonts）は使ったときに保存する。取れなくても端末の丸ゴシックで代替できるので必須にはしない。
 */
const VERSION = '0365c019f4db';
const CACHE = `haiyomi-${VERSION}`;
const FONTS = 'haiyomi-fonts';
const SHELL = new URL('./', self.registration.scope).href;
const CORE = ['./', './manifest.json', './icon-180.png', './icon-512.png', './icon-maskable.png'];
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

self.addEventListener('install', (e) => {
  // 1つでも取れないと全部失敗するので、1件ずつ入れて取れたものだけ残す
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(CORE.map((u) => c.add(u).catch(() => {}))),
    ),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE && k !== FONTS).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// 画面の「更新」ボタンから呼ばれる（新しい版にすぐ切り替える）
self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

async function cacheFirst(req, name) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) c.put(req, res.clone());
  return res;
}

async function shell() {
  const c = await caches.open(CACHE);
  const hit = await c.match(SHELL);
  if (hit) {
    // 裏でこっそり取り直しておく（次に開いたときに新しくなる）
    fetch(SHELL)
      .then((res) => (res && res.ok ? c.put(SHELL, res.clone()) : null))
      .catch(() => {});
    return hit;
  }
  try {
    const res = await fetch(SHELL);
    if (res && res.ok) c.put(SHELL, res.clone());
    return res;
  } catch (err) {
    return new Response('オフラインです。一度オンラインで開くと、次からは電波がなくても使えます。', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (FONT_HOSTS.has(url.hostname)) {
    e.respondWith(cacheFirst(req, FONTS).catch(() => fetch(req)));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(shell());
    return;
  }
  e.respondWith(cacheFirst(req, CACHE).catch(() => caches.match(req)));
});
