/**
 * オフラインで動かすための Service Worker。
 *
 * 本体は1ファイル（index.html・v0.38 で約2.3MB。読み取りの重みを含む）なので、初回に丸ごと保存して、次からはそれを出す。
 * 本体が変わるとビルドが下の VERSION を書き換えるので、新しい版が入ったら画面に「更新」の帯を出す。
 * VERSION は「版-中身の指紋」（例: v0.23-5c2262cea9ea）。指紋は公開用の一式（sw.js 以外）から作る。
 * 書体（Google Fonts）は使ったときに保存する。取れなくても端末の丸ゴシックで代替できるので必須にはしない。
 */
const VERSION = 'v0.51-d433227e7965';
const CACHE = `haiyomi-${VERSION}`;
const FONTS = 'haiyomi-fonts';
const SHELL = new URL('./', self.registration.scope).href;
// 解説ページ（build.mjs の PAGES から入れる。v0.38 で6ページ増えたので、手で並べるのをやめた）
const PAGES = ["./features.html","./help.html","./tips.html","./learn.html","./waits.html","./quiz-basic.html","./quiz-chinitsu.html","./shanten.html","./yaku.html","./fu.html","./score.html","./sanma.html","./faq.html","./about.html","./changelog.html","./privacy.html","./terms.html"];
// 姉妹アプリ（麻雀記録帳）のアイコンも、オフラインでカードの絵が欠けないよう最初に保存する（v0.39）
const ICONS = ['./favicon.ico', './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable.png', './kiroku-icon-192.png'];
const CORE = ['./', './manifest.json', ...ICONS, ...PAGES];
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

self.addEventListener('install', (e) => {
  // 1つでも取れないと全部失敗するので、1件ずつ入れて取れたものだけ残す。
  // ブラウザの HTTP キャッシュ（GitHub Pages は10分）を通さずにサーバーから取る。通すと、更新の直前に見た
  // 前の版の本体を「新しい版」として保存してしまい、「更新」を押しても前の版のまま、ということが起きる
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(CORE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))),
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
    // 裏でこっそり取り直しておく（次に開いたときに新しくなる）。HTTP キャッシュは使わずサーバーに確かめる
    fetch(SHELL, { cache: 'no-cache' })
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
    // アプリ本体（/ か /index.html）だけシェルを返す。使い方などのページはそのページを返す
    const root = new URL(SHELL).pathname;
    const isApp = url.pathname === root || url.pathname === `${root}index.html`;
    e.respondWith(isApp ? shell() : cacheFirst(req, CACHE).catch(() => caches.match(req).then((r) => r || shell())));
    return;
  }
  e.respondWith(cacheFirst(req, CACHE).catch(() => caches.match(req)));
});
