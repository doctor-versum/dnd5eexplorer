// sw.js
self.addEventListener('install', event => {
    console.log('Service Worker installiert.');
  });
  
  self.addEventListener('fetch', event => {
    // Optional: Offline-Cache-Logik
  });
  