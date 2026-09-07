// Main Application Bootstrapper
import { renderMyCourses, switchView, switchNavView } from './dashboard.js';
import { runEngine } from './player.js';
import { restoreSavedFolderOnStartup } from './ui/localFileLoader.js';
import { initNativeBridge, isNativePlatform } from './nativeBridge.js';

// ══════════════════════════════════════════════════
// FULLSCREEN CONTROLLER & AUTO-TRIGGER
// ══════════════════════════════════════════════════
function enterFullscreen() {
    const docEl = document.documentElement;
    try {
        if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
            if (docEl.requestFullscreen) {
                docEl.requestFullscreen().catch(() => {});
            } else if (docEl.webkitRequestFullscreen) {
                docEl.webkitRequestFullscreen();
            } else if (docEl.msRequestFullscreen) {
                docEl.msRequestFullscreen();
            }
        }
    } catch (_) {}
}

function toggleFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
        enterFullscreen();
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
}
// Explicit user-triggered fullscreen toggles remain available via toggleFullscreen()
window.toggleFullscreen = toggleFullscreen;
window.enterFullscreen = enterFullscreen;

// ══════════════════════════════════════════════════
// DARK / LIGHT MODE TOGGLE
// ══════════════════════════════════════════════════
(function () {
    const btn = document.getElementById('mode-toggle-btn');
    if (!btn) return;
    let dark = true;
    btn.innerHTML = '&#9788; Light';
    btn.addEventListener('click', () => {
        dark = !dark;
        document.body.classList.toggle('light-mode', !dark);
        btn.innerHTML = dark ? '&#9788; Light' : '&#9790; Dark';
        window.dispatchEvent(new Event('resize'));
    });
})();

// Attach click on logo for Fullscreen toggle
document.addEventListener('DOMContentLoaded', () => {
    const dbLogo = document.getElementById('db-logo');
    if (dbLogo) {
        dbLogo.style.cursor = 'pointer';
        dbLogo.addEventListener('click', toggleFullscreen);
    }
});

// Bootstrap launch
(async () => {
    try {
        initNativeBridge();
        if (window.resizeCanvas) window.resizeCanvas();

        const params = new URLSearchParams(window.location.search);
        const hasParam = params.get("lec") || params.get("url");
        
        renderMyCourses();

        // Automatically restore course folder from IndexedDB if saved previously
        restoreSavedFolderOnStartup().then(restored => {
            if (restored) {
                console.log("[Main] Course folder automatically restored from IndexedDB memory.");
            }
        }).catch(e => {
            console.warn("[Main] Auto-restore folder check:", e);
        });

        if (hasParam) {
            switchView("player");
            const success = await runEngine();
            if (success) {
                const sp = document.getElementById("splash");
                if (sp) {
                    sp.classList.add("hidden");
                    sp.style.display = "none";
                }
            }
        } else {
            const rawHash = (window.location.hash || "").replace(/^#/, "").trim().toLowerCase();
            const validNavViews = ["my-courses", "home", "math", "mathematics", "physics", "chemistry", "mentorship", "crash-course", "modules", "phy-os", "phyos", "offline-mode"];
            if (rawHash && validNavViews.includes(rawHash)) {
                switchNavView(rawHash);
            } else {
                switchView("my-courses");
            }
            const sp = document.getElementById("splash");
            if (sp) {
                sp.classList.add("hidden");
                sp.style.display = "none";
            }
        }
    } catch (e) {
        console.error("Engine startup failed:", e);
    }
})();

// Register Service Worker for Offline PWA Support
if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then((reg) => {
            console.log('[SW] Service Worker registered with scope:', reg.scope);
        }).catch((err) => {
            console.warn('[SW] Service Worker registration failed:', err);
        });
    });
}

