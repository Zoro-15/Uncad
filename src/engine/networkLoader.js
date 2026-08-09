// Network fetch engine with CORS proxy fallback and retry resilience

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
 * Image loader with LRU caching
 */
const imageCache = new Map();
const MAX_IMAGE_CACHE = 60;

async function loadCachedImage(url) {
    if (!url) return null;
    if (imageCache.has(url)) {
        return imageCache.get(url);
    }

    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            if (imageCache.size >= MAX_IMAGE_CACHE) {
                const firstKey = imageCache.keys().next().value;
                imageCache.delete(firstKey);
            }
            imageCache.set(url, img);
            resolve(img);
        };
        img.onerror = () => {
            console.warn("[Network] Image load failed:", url);
            resolve(null);
        };
        img.src = url;
    });
}

function clearImageCache() {
    imageCache.clear();
}

export { fetchWithFallback, loadCachedImage, clearImageCache };
