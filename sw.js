// sw.js - A minimal service worker to make the app installable.
self.addEventListener('install', (event) => {
  console.log('Service worker installing...');
});

self.addEventListener('fetch', (event) => {
  // A simple fetch handler to satisfy the PWA criteria.
  // It doesn't provide offline functionality, but makes the app installable.
  event.respondWith(fetch(event.request));
});
