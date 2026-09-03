// Interactive seek bar chapter ticks & slide hover preview tooltips

/**
 * Render visual tick marks for slide transitions along the seek bar
 * @param {Array} slideList - Array of slide timeline objects [{ timestampUs, sid, title }]
 * @param {number} totalDurationSec - Total duration of the video in seconds
 * @param {Function} onSeekToSec - Callback function to seek video
 */
function renderChapterMarks(slideList, totalDurationSec, onSeekToSec) {
    const container = document.getElementById("chapter-marks");
    if (!container || !slideList || slideList.length === 0 || !totalDurationSec) return;

    container.innerHTML = "";
    
    slideList.forEach((slide, idx) => {
        const timeSec = (slide.timestampUs || 0) / 1e6;
        const pct = Math.min(100, Math.max(0, (timeSec / totalDurationSec) * 100));
        
        // Skip tick marks at the very start or end to prevent visual clipping
        if (pct < 1 || pct > 99) return;
        
        const tick = document.createElement("div");
        tick.className = "chapter-tick-mark";
        tick.style.left = `${pct}%`;
        tick.title = `Slide ${idx + 1} (${formatTime(timeSec)})`;
        
        tick.addEventListener("click", (e) => {
            e.stopPropagation();
            if (onSeekToSec) onSeekToSec(timeSec);
        });

        container.appendChild(tick);
    });
}

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export { renderChapterMarks, formatTime };
