// Service worker: deja la app y los precios disponibles sin señal (típico dentro del súper).
// - Páginas: red primero, y si no hay red, la última copia guardada.
// - Precios (zonas.json y precios/*.json): se muestra lo guardado al instante y se actualiza en segundo plano.
// - Archivos de la app (/_astro/*, íconos, logos): primero lo guardado (llevan hash en el nombre).
const VERSION = 'v1';
const APP = 'super-app-' + VERSION;
const PRECIOS = 'super-precios-' + VERSION;
const ACTUALES = [APP, PRECIOS];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(['./', 'site.webmanifest', 'icon-192.png', 'favicon.svg'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('super-') && !ACTUALES.includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const guardar = (nombre, req, res) => {
  if (res && res.ok) { const copia = res.clone(); caches.open(nombre).then((c) => c.put(req, copia)); }
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const misma = url.origin === self.location.origin;
  const fuentes = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!misma && !fuentes) return;

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => guardar(APP, req, r)).catch(() => caches.match(req).then((r) => r || caches.match('./'))));
    return;
  }
  const esPrecio = misma && /\/(zonas\.json|precios\/[^/]+\.json|prices\.json)$/.test(url.pathname);
  if (esPrecio || fuentes) {
    e.respondWith(caches.open(esPrecio ? PRECIOS : APP).then(async (c) => {
      const guardada = await c.match(req);
      const red = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => guardada);
      return guardada || red;
    }));
    return;
  }
  e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => guardar(APP, req, res))));
});
