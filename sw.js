// sw.js —— 改这里的版本号
const CACHE = 'toefl-cards-v3';   // ← 每次改动+1

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './words.sample.json',
  './words.sample.csv'
];

self.addEventListener('install', (e) => {
  self.skipWaiting(); // ← 新增
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()) // ← 新增
  );
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
