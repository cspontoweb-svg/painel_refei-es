/* CS Gestão de Ativos 2.1.2 — cache do shell; nunca intercepta chamadas ao Apps Script. */
const CACHE_NAME = 'csga-shell-2.1.2';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('csga-shell-') && k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) {
    if (['unpkg.com','cdnjs.cloudflare.com'].includes(url.hostname) && /html5-qrcode|qrcodejs/.test(url.href)) {
      event.respondWith(caches.open('csga-cdn-2.1.2').then(cache => cache.match(event.request).then(hit => hit || fetch(event.request).then(response => { if (response && (response.ok || response.type === 'opaque')) cache.put(event.request, response.clone()); return response; }))));
    }
    return;
  }
  if (url.pathname.includes('/macros/')) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response && response.ok && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html'))) {
      const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match('./index.html'))));
});
