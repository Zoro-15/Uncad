// IndexedDB Offline Telemetry & Metadata Storage Engine
'use strict';

const DB_NAME = 'lennister_player_db';
const DB_VERSION = 2;
const STORE_TELEMETRY = 'telemetry_cache';
const STORE_METADATA = 'offline_metadata';
const STORE_HANDLES = 'folder_handles';

let dbPromise = null;

function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) {
            console.warn('[OfflineStorage] IndexedDB not supported in this browser.');
            return resolve(null);
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_TELEMETRY)) {
                db.createObjectStore(STORE_TELEMETRY, { keyPath: 'uid' });
            }
            if (!db.objectStoreNames.contains(STORE_METADATA)) {
                db.createObjectStore(STORE_METADATA, { keyPath: 'uid' });
            }
            if (!db.objectStoreNames.contains(STORE_HANDLES)) {
                db.createObjectStore(STORE_HANDLES, { keyPath: 'id' });
            }
            console.log('[OfflineStorage] IndexedDB schemas initialized (v2).');
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            console.error('[OfflineStorage] Failed to open IndexedDB:', event.target.error);
            resolve(null);
        };
    });

    return dbPromise;
}

/**
 * Save telemetry payload to IndexedDB
 * @param {string} uid - Lecture unique ID
 * @param {any} data - Parsed telemetry data object or raw string
 * @param {object} metadata - Optional metadata (courseId, title, duration)
 */
async function saveTelemetryOffline(uid, data, metadata = {}) {
    if (!uid || !data) return false;
    try {
        const db = await openDB();
        if (!db) return false;

        return new Promise((resolve) => {
            const tx = db.transaction([STORE_TELEMETRY, STORE_METADATA], 'readwrite');
            const telemetryStore = tx.objectStore(STORE_TELEMETRY);
            const metaStore = tx.objectStore(STORE_METADATA);

            const record = {
                uid,
                data,
                cachedAt: Date.now()
            };

            const metaRecord = {
                uid,
                courseId: metadata.courseId || '',
                title: metadata.title || '',
                duration: metadata.duration || '',
                cachedAt: Date.now()
            };

            telemetryStore.put(record);
            metaStore.put(metaRecord);

            tx.oncomplete = () => {
                console.log(`[OfflineStorage] Saved telemetry for ${uid} to IndexedDB.`);
                notifyOfflineUpdate(uid, true);
                resolve(true);
            };

            tx.onerror = (e) => {
                console.warn(`[OfflineStorage] Failed to save telemetry for ${uid}:`, e.target.error);
                resolve(false);
            };
        });
    } catch (e) {
        console.error('[OfflineStorage] Error in saveTelemetryOffline:', e);
        return false;
    }
}

/**
 * Retrieve cached telemetry payload by UID
 * @param {string} uid
 * @returns {Promise<any|null>}
 */
async function getOfflineTelemetry(uid) {
    if (!uid) return null;
    try {
        const db = await openDB();
        if (!db) return null;

        return new Promise((resolve) => {
            const tx = db.transaction(STORE_TELEMETRY, 'readonly');
            const store = tx.objectStore(STORE_TELEMETRY);
            const req = store.get(uid);

            req.onsuccess = () => {
                if (req.result && req.result.data) {
                    console.log(`[OfflineStorage] Cache HIT for ${uid}`);
                    resolve(req.result.data);
                } else {
                    resolve(null);
                }
            };

            req.onerror = () => resolve(null);
        });
    } catch (e) {
        console.error('[OfflineStorage] Error in getOfflineTelemetry:', e);
        return null;
    }
}

/**
 * Check if a lecture telemetry is cached offline
 * @param {string} uid
 * @returns {Promise<boolean>}
 */
async function isTelemetryCached(uid) {
    if (!uid) return false;
    try {
        const db = await openDB();
        if (!db) return false;

        return new Promise((resolve) => {
            const tx = db.transaction(STORE_METADATA, 'readonly');
            const store = tx.objectStore(STORE_METADATA);
            const req = store.get(uid);

            req.onsuccess = () => resolve(!!req.result);
            req.onerror = () => resolve(false);
        });
    } catch (e) {
        return false;
    }
}

/**
 * Get all cached lecture UIDs
 * @returns {Promise<string[]>}
 */
async function getAllCachedUids() {
    try {
        const db = await openDB();
        if (!db) return [];

        return new Promise((resolve) => {
            const tx = db.transaction(STORE_METADATA, 'readonly');
            const store = tx.objectStore(STORE_METADATA);
            const req = store.getAllKeys();

            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    } catch (e) {
        return [];
    }
}

/**
 * Delete a cached lecture by UID
 * @param {string} uid
 */
async function deleteOfflineTelemetry(uid) {
    if (!uid) return false;
    try {
        const db = await openDB();
        if (!db) return false;

        return new Promise((resolve) => {
            const tx = db.transaction([STORE_TELEMETRY, STORE_METADATA], 'readwrite');
            tx.objectStore(STORE_TELEMETRY).delete(uid);
            tx.objectStore(STORE_METADATA).delete(uid);

            tx.oncomplete = () => {
                console.log(`[OfflineStorage] Deleted cached telemetry for ${uid}`);
                notifyOfflineUpdate(uid, false);
                resolve(true);
            };
            tx.onerror = () => resolve(false);
        });
    } catch (e) {
        return false;
    }
}

/**
 * Clear all cached offline data
 */
async function clearAllOfflineTelemetry() {
    try {
        const db = await openDB();
        if (!db) return false;

        return new Promise((resolve) => {
            const tx = db.transaction([STORE_TELEMETRY, STORE_METADATA], 'readwrite');
            tx.objectStore(STORE_TELEMETRY).clear();
            tx.objectStore(STORE_METADATA).clear();

            tx.oncomplete = () => {
                console.log('[OfflineStorage] Cleared all offline telemetry.');
                window.dispatchEvent(new CustomEvent('lennister-offline-cleared'));
                resolve(true);
            };
            tx.onerror = () => resolve(false);
        });
    } catch (e) {
        return false;
    }
}

function notifyOfflineUpdate(uid, isCached) {
    window.dispatchEvent(new CustomEvent('lennister-offline-change', {
        detail: { uid, isCached }
    }));
}

/**
 * Save FileSystemDirectoryHandle to IndexedDB for permanent course memory
 */
async function saveSavedDirectoryHandle(handle, id = 'default_course_folder') {
    if (!handle) return false;
    try {
        const db = await openDB();
        if (!db) return false;
        return new Promise((resolve) => {
            const tx = db.transaction([STORE_HANDLES], 'readwrite');
            const store = tx.objectStore(STORE_HANDLES);
            store.put({ id, handle, savedAt: Date.now() });
            tx.oncomplete = () => {
                console.log('[OfflineStorage] Persisted directory handle to IndexedDB:', handle.name);
                resolve(true);
            };
            tx.onerror = () => resolve(false);
        });
    } catch (e) {
        console.warn('[OfflineStorage] Error saving directory handle:', e);
        return false;
    }
}

/**
 * Retrieve saved FileSystemDirectoryHandle from IndexedDB
 */
async function getSavedDirectoryHandle(id = 'default_course_folder') {
    try {
        const db = await openDB();
        if (!db) return null;
        return new Promise((resolve) => {
            const tx = db.transaction([STORE_HANDLES], 'readonly');
            const store = tx.objectStore(STORE_HANDLES);
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result ? req.result.handle : null);
            req.onerror = () => resolve(null);
        });
    } catch (e) {
        return null;
    }
}

/**
 * Clear saved directory handle from IndexedDB
 */
async function clearSavedDirectoryHandle(id = 'default_course_folder') {
    try {
        const db = await openDB();
        if (!db) return false;
        return new Promise((resolve) => {
            const tx = db.transaction([STORE_HANDLES], 'readwrite');
            const store = tx.objectStore(STORE_HANDLES);
            store.delete(id);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        });
    } catch (e) {
        return false;
    }
}

export {
    openDB,
    saveTelemetryOffline,
    getOfflineTelemetry,
    isTelemetryCached,
    getAllCachedUids,
    deleteOfflineTelemetry,
    clearAllOfflineTelemetry,
    saveSavedDirectoryHandle,
    getSavedDirectoryHandle,
    clearSavedDirectoryHandle
};
