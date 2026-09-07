// Native Android Capacitor Bridge for Runcadel Player
'use strict';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { parseLectureFolderName, cleanCourseTitle } from './ui/localFileLoader.js';

// Register custom native SAF Storage Plugin
export const SafStorage = registerPlugin('SafStorage');

/**
 * Returns true if running inside native Android / iOS Capacitor container
 */
export function isNativePlatform() {
    return Capacitor.isNativePlatform();
}

/**
 * Creates a File-like proxy object wrapping an Android Content/File URI
 * with .text() and .arrayBuffer() methods for seamless playback compatibility
 */
export function createSafFileProxy(name, uri, size = 0) {
    return {
        name,
        size,
        uri,
        isSafProxy: true,
        async text() {
            const res = await SafStorage.readTextFile({ uri });
            return res.content;
        },
        async arrayBuffer() {
            const res = await SafStorage.readBinaryFileBase64({ uri });
            const binaryString = atob(res.data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
        }
    };
}

/**
 * Convert raw SAF lecture metadata from native Android to Runcadel Player course format
 */
export function transformSafLectures(safLectures, folderName = "Local Storage") {
    if (!Array.isArray(safLectures) || safLectures.length === 0) return null;

    const parsedLectures = [];
    let detectedCourseTitle = cleanCourseTitle(folderName);

    for (const item of safLectures) {
        const parsedFolder = parseLectureFolderName(item.folderName || item.videoName || "Lecture");

        const videoProxy = item.videoUri ? {
            name: item.videoName || "output.webm",
            size: item.videoSize || 0,
            uri: item.videoUri,
            // Convert to webview-accessible URL for HTML5 <video>
            webviewUrl: Capacitor.convertFileSrc(item.videoUri)
        } : null;

        const jsonProxy = item.telemetryUri ? createSafFileProxy(
            item.telemetryName || "data.json",
            item.telemetryUri,
            item.telemetrySize || 0
        ) : null;

        const pdfProxy = item.pdfUri ? createSafFileProxy(
            item.pdfName || "notes.pdf",
            item.pdfUri,
            item.pdfSize || 0
        ) : null;

        if (videoProxy || jsonProxy) {
            parsedLectures.push({
                rank: parsedFolder.rank || (parsedLectures.length + 1),
                title: parsedFolder.title || item.folderName || "Offline Lecture",
                uid: parsedFolder.uid || `saf_${Date.now()}_${parsedLectures.length + 1}`,
                duration: parsedFolder.duration || "--",
                videoFile: null,
                videoUrl: videoProxy ? videoProxy.webviewUrl : "",
                jsonFile: jsonProxy,
                pdfFile: pdfProxy,
                isLocal: true,
                isSaf: true,
                matchedCourse: parsedFolder.matchedCourse || null
            });
        }
    }

    if (parsedLectures.length === 0) return null;

    parsedLectures.sort((a, b) => a.rank - b.rank);

    const courseId = `saf_course_${Date.now()}`;
    return {
        id: courseId,
        title: detectedCourseTitle || "Offline Course",
        category: "offline-mode",
        isLocal: true,
        isSaf: true,
        badge: "SAF OFFLINE",
        lectures: parsedLectures
    };
}

/**
 * Request folder picker via native Android Storage Access Framework
 */
export async function pickNativeSafCourseFolder() {
    if (!isNativePlatform()) return null;

    try {
        const result = await SafStorage.openFolderPicker();
        if (result && result.cancelled) {
            return null;
        }

        if (result && result.success && Array.isArray(result.lectures)) {
            return transformSafLectures(result.lectures, result.folderName);
        }
    } catch (e) {
        console.error("[NativeBridge] Error picking SAF folder:", e);
        throw e;
    }
    return null;
}

/**
 * Check and restore persisted SAF folder on startup
 */
export async function checkPersistedSafFolder() {
    if (!isNativePlatform()) return null;

    try {
        const result = await SafStorage.getPersistedFolder();
        if (result && result.hasPersisted && Array.isArray(result.lectures)) {
            console.log("[NativeBridge] Restored persisted SAF folder:", result.folderName);
            return transformSafLectures(result.lectures, result.folderName);
        }
    } catch (e) {
        console.warn("[NativeBridge] Could not restore persisted SAF folder:", e);
    }
    return null;
}

/**
 * Lock orientation for video playback
 */
export async function lockVideoOrientation() {
    if (!isNativePlatform()) return;
    try {
        await ScreenOrientation.lock({ orientation: 'landscape' });
    } catch (e) {
        console.warn("[NativeBridge] ScreenOrientation lock error:", e);
    }
}

/**
 * Unlock orientation for browsing
 */
export async function unlockOrientation() {
    if (!isNativePlatform()) return;
    try {
        await ScreenOrientation.unlock();
    } catch (e) {
        console.warn("[NativeBridge] ScreenOrientation unlock error:", e);
    }
}

/**
 * Initialize all native bridge capabilities: StatusBar, Hardware Back Button, and Lifecycle
 */
export function initNativeBridge() {
    if (!isNativePlatform()) {
        console.log("[NativeBridge] Running in browser environment. Native bridge inactive.");
        return;
    }

    console.log("[NativeBridge] Initializing Capacitor Native Bridge on Android...");

    // 1. Configure Status Bar
    try {
        StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
        StatusBar.setBackgroundColor({ color: '#09090b' }).catch(() => {});
        StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    } catch (err) {
        console.warn("[NativeBridge] StatusBar setup error:", err);
    }

    // 2. Register Hardware Back Button Listener
    try {
        App.addListener('backButton', ({ canGoBack }) => {
            console.log("[NativeBridge] Android Hardware Back pressed");

            // A. Check if drawer or modal dialog is open
            const drawer = document.getElementById("notes-drawer") || document.querySelector(".drawer-open");
            if (drawer && (drawer.classList.contains("open") || drawer.classList.contains("active"))) {
                drawer.classList.remove("open");
                drawer.classList.remove("active");
                return;
            }

            // B. Check if custom back navigation callback is registered
            if (typeof window.handleBackNavigation === "function" && window.handleBackNavigation()) {
                return;
            }

            // C. Check if currently in Player View -> Exit to Dashboard
            const appEl = document.getElementById("app");
            const dbContainer = document.getElementById("db-container");
            if (appEl && appEl.style.display !== "none") {
                const video = document.getElementById("main-video");
                if (video) {
                    try { video.pause(); } catch (_) {}
                }
                unlockOrientation();
                if (typeof window.switchView === "function") {
                    window.switchView("my-courses");
                    return;
                }
            }

            // D. If in sub-view inside dashboard, navigate back to 'my-courses'
            const currentHash = (window.location.hash || "").replace(/^#/, "");
            if (currentHash && currentHash !== "my-courses" && currentHash !== "") {
                if (typeof window.switchNavView === "function") {
                    window.switchNavView("my-courses");
                    return;
                }
            }

            // E. Default browser / app back navigation
            if (canGoBack) {
                window.history.back();
            } else {
                App.exitApp();
            }
        });
    } catch (err) {
        console.warn("[NativeBridge] Back button listener error:", err);
    }
}
