import { getOfflineTelemetry, saveTelemetryOffline } from './offlineStorage.js';

const PROXY_PREFIX = "https://corsproxy.io/?";

/**
 * Fetches JSON or ArrayBuffer with retry and CORS proxy fallback
 * @param {string} url - Target URL
 * @param {string} responseType - 'json' | 'arraybuffer' | 'blob' | 'text'
 * @param {number} maxRetries - Max retry attempts
 * @returns {Promise<any>}
 */
async function fetchWithFallback(url, responseType = 'json', maxRetries = 2) {
    let lastError = null;

    // Attempt 1: Direct fetch
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const targetUrl = attempt === 0 ? url : `${PROXY_PREFIX}${encodeURIComponent(url)}`;
        try {
            console.log(`[Network] Fetching (attempt ${attempt + 1}):`, targetUrl);
            const response = await fetch(targetUrl);
            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
            }

            if (responseType === 'arraybuffer') {
                return await response.arrayBuffer();
            } else if (responseType === 'blob') {
                return await response.blob();
            } else if (responseType === 'text') {
                return await response.text();
            } else {
                return await response.json();
            }
        } catch (err) {
            console.warn(`[Network] Attempt ${attempt + 1} failed for ${url}:`, err.message);
            lastError = err;
        }
    }

    throw lastError || new Error(`Failed to fetch ${url} after ${maxRetries + 1} attempts`);
}

/**
 * Loads telemetry data with offline cache first, falling back to network and auto-saving
 * @param {string} uid - Lecture unique ID
 * @param {string} url - Remote telemetry endpoint
 * @param {object} metadata - Lecture metadata
 * @returns {Promise<{ source: 'cache'|'network', data: any }>}
 */
async function fetchTelemetryWithOfflineFallback(uid, url, metadata = {}) {
    if (uid) {
        const cached = await getOfflineTelemetry(uid);
        if (cached) {
            console.log(`[Network] Loaded telemetry from offline cache for ${uid}`);
            return { source: 'cache', data: cached };
        }
    }

    const arrayBuffer = await fetchWithFallback(url, 'arraybuffer');
    if (uid && arrayBuffer) {
        // Asynchronously save to IndexedDB cache
        saveTelemetryOffline(uid, arrayBuffer, metadata).catch(e => {
            console.warn('[Network] Offline auto-save error:', e);
        });
    }

    return { source: 'network', data: arrayBuffer };
}

/**
 * Image loader with LRU caching
 */
const imageCache = new Map();
const MAX_IMAGE_CACHE = 60;

async function loadCachedImage(url) {
    if (!url) return null;
    if (imageCache.has(url)) {
        return imageCache.get(url);
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";

    try {
        img.src = url;
        if ('decode' in img) {
            await img.decode();
        } else {
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
        }
        if (imageCache.size >= MAX_IMAGE_CACHE) {
            const firstKey = imageCache.keys().next().value;
            imageCache.delete(firstKey);
        }
        imageCache.set(url, img);
        return img;
    } catch (err) {
        console.warn("[Network] Image load/decode fallback:", url);
        // Fallback for CORS decode rejection on certain CDNs
        return new Promise((resolve) => {
            const fallbackImg = new Image();
            fallbackImg.onload = () => {
                imageCache.set(url, fallbackImg);
                resolve(fallbackImg);
            };
            fallbackImg.onerror = () => resolve(null);
            fallbackImg.src = url;
        });
    }
}

function clearImageCache() {
    imageCache.clear();
}

export { 
    fetchWithFallback, 
    fetchTelemetryWithOfflineFallback, 
    loadCachedImage, 
    clearImageCache 
};

