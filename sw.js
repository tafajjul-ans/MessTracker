const CACHE_NAME = 'mt-app-v4';

// Sirf 3 main files cache karenge taaki image path ki wajah se crash na ho
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Turant active karne ke liye
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Agar koi file missing hui toh bhi install cancel nahi hoga
        return cache.addAll(urlsToCache).catch(err => console.log("Cache error, but continuing...", err));
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
