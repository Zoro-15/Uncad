// Main Application Bootstrapper
import { renderDashboardHome, switchView } from './dashboard.js';
import { runEngine } from './player.js';

// ══════════════════════════════════════════════════
        //  DARK / LIGHT MODE TOGGLE
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

        // Bootstrap launch
        (async () => {
            try {
                resizeCanvas();
                const params = new URLSearchParams(window.location.search);
                const hasParam = params.get("lec") || params.get("url");
                
                renderDashboardHome();

                if (hasParam) {
                    switchView("player");
                    const success = await runEngine();
                    if (success) {
                        const sp = $("splash");
                        if (sp) {
                            sp.classList.add("hidden");
                            setTimeout(() => { sp.style.display = "none"; }, 700);
                        }
                    }
                } else {
                    switchView("home");
                    const sp = $("splash");
                    if (sp) {
                        sp.classList.add("hidden");
                        setTimeout(() => { sp.style.display = "none"; }, 700);
                    }
                }
            } catch (e) {
                console.error("Engine startup failed:", e);
                setStatus("error", "ENGINE STARTUP ERROR");
            }
        })();
    
