const CACHE = 'comiapp-v2';
const ARCHIVOS = ['/', '/index.html', '/css/style.css', '/js/app.js', '/config.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)));
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});