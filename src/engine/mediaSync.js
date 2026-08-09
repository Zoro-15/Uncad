// Media Synchronization Loop & Wake Lock Management

let wakeLock = null;

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (e) {
        console.log('[MediaSync] WakeLock error:', e.message);
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
    }
}

/**
 * High precision sync loop comparing video time to telemetry timestamp
 */
function createSyncLoop(videoElement, onSyncTick) {
    let animId = null;
    let running = false;

    function loop() {
        if (!running) return;
        if (videoElement && !videoElement.paused) {
            const currentUs = videoElement.currentTime * 1e6;
            if (onSyncTick) onSyncTick(currentUs, videoElement.currentTime);
        }
        animId = requestAnimationFrame(loop);
    }

    return {
        start: () => {
            if (running) return;
            running = true;
            loop();
        },
        stop: () => {
            running = false;
            if (animId) cancelAnimationFrame(animId);
        }
    };
}

export { requestWakeLock, releaseWakeLock, createSyncLoop };
