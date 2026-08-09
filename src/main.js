// Main Application Bootstrapper
import { renderMyCourses, switchView } from './dashboard.js';
import { runEngine } from './player.js';

// ══════════════════════════════════════════════════
// LOGO FULLSCREEN TOGGLE
// ══════════════════════════════════════════════════
function toggleFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
            docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
            docEl.webkitRequestFullscreen();
        } else if (docEl.msRequestFullscreen) {
            docEl.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
}
window.toggleFullscreen = toggleFullscreen;

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
        if (window.resizeCanvas) window.resizeCanvas();
        const params = new URLSearchParams(window.location.search);
        const hasParam = params.get("lec") || params.get("url");
        
        renderMyCourses();

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
            switchView("my-courses");
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
