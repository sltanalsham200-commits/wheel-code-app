// اسم الكاش - نغيره يدوياً مع كل تحديث كبير
const CACHE_VERSION = 'wheel-v1.0';
const CACHE_NAME = `wheel-cache-${CACHE_VERSION}`;

// الملفات التي سيتم تخزينها مؤقتاً
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  './css/main.css',
  './js/db.js',
  './js/auth.js',
  './js/data.js',
  './js/analysis.js',
  './js/prediction.js',
  './js/stats.js',
  './js/backup.js',
  './js/app.js'
];

// التثبيت - تخزين الملفات
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('بعض الملفات لم يتم تخزينها (قد تكون لم تنشأ بعد):', err);
      });
    })
  );
  self.skipWaiting();
});

// التفعيل - حذف الكاش القديم
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('wheel-cache-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// الاستراتيجية: Network First (الشبكة أولاً، ثم الكاش)
self.addEventListener('fetch', (event) => {
  // تجاهل الطلبات التي ليست GET
  if (event.request.method !== 'GET') return;

  // استراتيجية خاصة لـ manifest.json
  if (event.request.url.endsWith('manifest.json')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // الاستراتيجية العامة: الشبكة أولاً
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// الاستماع لرسائل التحديث
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
