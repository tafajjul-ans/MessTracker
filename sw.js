const CACHE_NAME = 'mt-app-v9.0.3.4';

const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './firebase.js'
];

self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache).catch(err => console.log("Cache error ignored", err));
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});

// नए अपडेट को बिना इंतज़ार किए तुरंत एक्टिवेट करने के लिए
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
