// Lennister Player Standalone Offline PWA Service Worker
const CACHE_NAME = 'lennister-shell-v1';

const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/favicon.svg',
    '/manifest.webmanifest'
];

// Install: Pre-cache foundational shell assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Pre-caching application shell...');
            return cache.addAll(SHELL_ASSETS).catch((err) => {
                console.warn('[SW] Pre-cache partial failure (non-fatal):', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// Activate: Purge stale caches and claim clients immediately
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[SW] Clearing old cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Smart caching strategy
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // 1. Bypass heavy video & remote CDN streams (handled via streaming or IndexedDB)
    if (
        url.pathname.endsWith('.webm') ||
        url.pathname.endsWith('.mp4') ||
        url.pathname.endsWith('.m3u8') ||
        url.hostname.includes('uamedia.uacdn.net') ||
        url.hostname.includes('player.uacdn.net') ||
        url.hostname.includes('corsproxy.io')
    ) {
        return;
    }

    // 2. Google Fonts & FontAwesome CDN assets: Stale-While-Revalidate
    if (
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com') ||
        url.hostname.includes('cdnjs.cloudflare.com')
    ) {
        event.respondWith(
            caches.open(CACHE_NAME).then(async (cache) => {
                const cached = await cache.match(req);
                const fetchPromise = fetch(req).then((networkRes) => {
                    if (networkRes && networkRes.status === 200) {
                        cache.put(req, networkRes.clone());
                    }
                    return networkRes;
                }).catch(() => null);

                return cached || fetchPromise;
            })
        );
        return;
    }

    // 3. Same-origin Shell Assets (HTML, JS, CSS, SVG): Network-first with Cache fallback
    if (url.origin === self.location.origin) {
        event.respondWith(
            fetch(req)
                .then((networkRes) => {
                    if (networkRes && networkRes.status === 200) {
                        const clone = networkRes.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
                    }
                    return networkRes;
                })
                .catch(async () => {
                    const cached = await caches.match(req);
                    if (cached) return cached;
                    if (req.mode === 'navigate') {
                        return caches.match('/index.html') || caches.match('/');
                    }
                    return new Response('Offline resource not available', { status: 503, statusText: 'Offline' });
                })
        );
    }
});
