/* ============================================================
   FORMA — Service Worker
   ------------------------------------------------------------
   Objetivo: que la app abra sin conexion y que los datos de las
   sesiones (data.json) esten siempre disponibles, SIN precachear
   los ~139 videos/imagenes del directorio assets/ (varios GB).

   Estrategias:
   - Shell (HTML, CSS, JS, manifest, iconos, data.json): precache
     en la instalacion + navegacion "red primero, cache despues".
   - assets/: "cache primero". Solo se guarda lo que el usuario va
     viendo. Se limita el numero de entradas (MAX_MEDIA_ENTRIES).
   - Fuentes de Google: "cache primero" (se piden una sola vez).
   - Peticiones Range (los <video> las usan): no se interceptan.
   ============================================================ */

// Sube este numero cuando publiques cambios para forzar la actualizacion.
const VERSION = "forma-v1";

const SHELL_CACHE = `${VERSION}-shell`;
const MEDIA_CACHE = `${VERSION}-media`;
const FONT_CACHE = `${VERSION}-fonts`;

// Numero maximo de archivos multimedia guardados (cada webp pesa entre 1 y 9 MB).
const MAX_MEDIA_ENTRIES = 50;

// Rutas relativas: funciona igual en la raiz que en una subruta de GitHub Pages.
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./data.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];

// ---------------- Ciclo de vida ----------------

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // add() individual: si un archivo falta no se cae toda la instalacion.
      await Promise.all(
        SHELL_ASSETS.map(async (asset) => {
          try {
            await cache.add(new Request(asset, { cache: "reload" }));
          } catch (error) {
            console.warn("[SW] No se pudo precachear:", asset, error);
          }
        })
      );
      // Activa la version nueva sin esperar a que se cierren las pestanas.
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.startsWith(VERSION))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// ---------------- Estrategias ----------------

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok && !new URL(request.url).search) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const shell = await caches.match("./index.html");
    if (shell) return shell;
    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response && (response.ok || response.type === "opaque")) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const response = await network;
  if (response) return response;
  throw new Error("[SW] Sin red y sin copia en cache: " + request.url);
}

async function cacheFirst(request, cacheName, trimTo) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) {
    cache
      .put(request, response.clone())
      .then(() => (trimTo ? trimCache(cacheName, trimTo) : undefined))
      .catch(() => {});
  }
  return response;
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  // Borra las entradas mas antiguas (el orden de keys es el de insercion).
  for (const key of keys.slice(0, keys.length - maxEntries)) {
    await cache.delete(key);
  }
}

// ---------------- Router ----------------

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Solo lecturas same-origin (excepto fuentes de Google).
  if (request.method !== "GET") return;

  // Los <video> piden por rangos: dejar que el navegador los gestione.
  if (request.headers.has("range")) return;

  const url = new URL(request.url);

  // Fuentes de Google (CSS + woff2): una vez y listo.
  if (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Navegacion: red primero para recibir actualizaciones; cache si no hay red.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Datos de las sesiones: cache inmediata + revalidacion en segundo plano.
  if (url.pathname.endsWith("/data.json") || url.pathname.endsWith("data.json")) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }

  // Demostraciones: cache primero, con limite de entradas.
  if (url.pathname.includes("/assets/")) {
    event.respondWith(cacheFirst(request, MEDIA_CACHE, MAX_MEDIA_ENTRIES));
    return;
  }

  // Resto de estaticos del shell (css, js, iconos...).
  event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
});
