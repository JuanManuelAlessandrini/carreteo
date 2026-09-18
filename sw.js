// Service Worker para Carreteo
// Estrategia cache-first: busca en cache primero, luego en red

const CACHE = 'carreteo-v2.0.0';
const ASSETS = [
  './',
  './index.html',
  './cards.js',
  './engine.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
];

// Instalar: precachea los archivos esenciales
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      // Intenta agregar todos los assets, pero no falla si alguno no existe
      return Promise.all(
        ASSETS.map((url) =>
          cache.add(url).catch(() => {
            console.warn(`No se pudo cachear: ${url}`);
          })
        )
      );
    }).then(() => {
      // Activa este SW inmediatamente sin esperar a cerrar tabs
      self.skipWaiting();
    })
  );
});

// Activar: limpia caches viejos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      // Borra todo cache que empiece con 'carreteo-' pero no sea el actual
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.startsWith('carreteo-') && cacheName !== CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Toma control de todos los clientes sin esperar
      self.clients.claim();
    })
  );
});

// Fetch: estrategia cache-first con revalidación en bg
self.addEventListener('fetch', (event) => {
  // Solo intercepta GET del mismo origen
  if (event.request.method !== 'GET' || !isSameOrigin(event.request.url)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Si está en cache, devuelve y revalida en segundo plano
      if (cachedResponse) {
        revalidateInBackground(event.request);
        return cachedResponse;
      }

      // Si no está en cache, va a la red
      return fetch(event.request).then((response) => {
        // Guarda una copia si la respuesta es válida
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      }).catch(() => {
        // Si la red falla y es una navegación, devuelve el índice en cache
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// Revalida en bg: actualiza el cache si hay respuesta nueva
function revalidateInBackground(request) {
  fetch(request).then((response) => {
    if (response && response.status === 200) {
      const responseToCache = response.clone();
      caches.open(CACHE).then((cache) => {
        cache.put(request, responseToCache);
      });
    }
  }).catch(() => {
    // Silenciosamente falla si la red no responde
  });
}

// Verifica que la URL sea del mismo origen
function isSameOrigin(url) {
  const requestUrl = new URL(url);
  return requestUrl.origin === self.location.origin;
}

// Escucha mensajes desde la app para saltar a nueva versión
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
