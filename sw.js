// Service worker de Carreteo.
//
// Estrategia: cache-first con versión atómica. Todos los archivos de una
// versión se guardan juntos en un cache con nombre propio, y una carga sirve
// siempre archivos de la misma versión. Nunca se revalida archivo por
// archivo: eso podía dejar un index.html nuevo pidiéndole funciones a un
// app.js viejo.
//
// Para publicar una versión nueva basta subir el número de CACHE.

const CACHE = 'carreteo-v2.1.0';
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

// Instalar: baja y guarda la versión completa.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => Promise.all(
      ASSETS.map((url) =>
        // cache:'reload' saltea el cache HTTP del navegador. Sin esto,
        // GitHub Pages sirve con max-age=600 y al subir la versión se
        // podrían precachear archivos de hasta 10 minutos atrás.
        cache.add(new Request(url, { cache: 'reload' })).catch(() => {
          console.warn('No se pudo cachear: ' + url);
        })
      )
    ))
  );
  // A propósito no se llama skipWaiting() aquí: el service worker nuevo
  // espera. La app muestra un aviso y recién al tocarlo manda SKIP_WAITING
  // y recarga, así la versión cambia entera y no en medio de una partida.
});

// Activar: borra las versiones anteriores.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(
        nombres
          .filter((n) => n.startsWith('carreteo-') && n !== CACHE)
          .map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache primero, red como respaldo.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !esMismoOrigen(event.request.url)) return;

  event.respondWith(
    caches.match(event.request).then((enCache) => {
      if (enCache) return enCache;

      return fetch(event.request).then((res) => {
        if (res && res.status === 200) {
          const copia = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copia));
        }
        return res;
      }).catch(() => {
        // Sin red: cualquier navegación cae al index cacheado.
        if (event.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});

function esMismoOrigen(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

// La app pide el cambio de versión cuando el usuario toca el aviso.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
