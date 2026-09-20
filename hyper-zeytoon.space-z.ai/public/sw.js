/* Hyper Zeytoon service worker — conservative offline shell.
 * Strategy: network-first for pages & API, cache-first for static assets.
 * Never caches POST/PUT/PATCH/DELETE. Cache version bumped on deploy. */
const CACHE = 'hz-shell-v15'
const SHELL = ['/', '/favicon.svg', '/logo.svg', '/manifest.webmanifest']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => {}))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return // API always live (freshness > offline)
  if (req.headers.get('accept')?.includes('text/html')) {
    // network-first with cache fallback
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('/')))
    )
    return
  }
  // static: cache-first
  e.respondWith(
    caches.match(req).then(
      (m) =>
        m ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.startsWith('/_next/static') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.png') || url.pathname.endsWith('.woff2'))) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
          }
          return res
        })
    )
  )
})
