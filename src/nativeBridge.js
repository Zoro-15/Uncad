// Native Android Capacitor Bridge for Runcadel Player
'use strict';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { ScreenOrientation } from '@capacitor/screen-orientation';

// Register custom native SAF Storage Plugin
export const SafStorage = registerPlugin('SafStorage');

/**
 * Returns true if running inside native Android / iOS Capacitor container
 */
export function isNativePlatform() {
    try {
        if (Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform()) {
            return true;
        }
        if (Capacitor && typeof Capacitor.getPlatform === 'function') {
            const p = Capacitor.getPlatform();
            if (p === 'android' || p === 'ios') return true;
        }
        if (typeof window !== 'undefined' && window.Capacitor) {
            if (typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) {
                return true;
            }
            if (typeof window.Capacitor.getPlatform === 'function') {
                const p = window.Capacitor.getPlatform();
                if (p === 'android' || p === 'ios') return true;
            }
        }
    } catch (_) {}
    return false;
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

export async function hideStatusBar() {
    if (!isNativePlatform()) return;
    try {
        if (SafStorage && typeof SafStorage.enterImmersive === 'function') {
            await SafStorage.enterImmersive();
        }
    } catch (_) {}
    try {
        await StatusBar.hide();
    } catch (_) {}
}

export async function showStatusBar() {
    if (!isNativePlatform()) return;
    try {
        if (SafStorage && typeof SafStorage.exitImmersive === 'function') {
            await SafStorage.exitImmersive();
        }
    } catch (_) {}
    try {
        await StatusBar.show();
    } catch (_) {}
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
