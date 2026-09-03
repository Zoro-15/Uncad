import { findCourseByLectureUid, COURSES } from './courses.js';
import { switchView, saveLastWatched, getLectureProgress, getLastWatched } from './dashboard.js';
import { tryDecryptAndParse } from './engine/crypto.js';
import { getOfflineTelemetry, saveTelemetryOffline } from './engine/offlineStorage.js';
import { requestWakeLock, releaseWakeLock } from './engine/mediaSync.js';
import { renderChapterMarks } from './ui/seekChapterBar.js';
import { initLocalFileLoader } from './ui/localFileLoader.js';

'use strict';

// ══════════════════════════════════════════════════════
// TOAST NOTIFICATION SYSTEM
// ══════════════════════════════════════════════════════
function showToast(message, type = 'info', duration = 3200) {
    let container = document.getElementById('lennister-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'lennister-toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;
    const icon = type === 'success' ? 'fa-check-circle' : (type === 'offline' ? 'fa-bolt' : (type === 'warn' ? 'fa-exclamation-triangle' : 'fa-info-circle'));
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 15);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 350);
    }, duration);
}
window.showToast = showToast;

let lastSplashUpdate = 0;
window.updateSplash = (txt, pct) => {
    const now = performance.now();
    if (pct < 100 && now - lastSplashUpdate < 32) return;
    lastSplashUpdate = now;
    const label = document.getElementById("splash-label");
    const bar = document.getElementById("splash-progress");
    if (label) label.textContent = txt;
    if (bar && pct !== undefined) bar.style.width = `${pct}%`;
};

// Element refs
        const $ = id => document.getElementById(id);
        const video = $("main-video");
        const slideCanvas = $("slide-canvas");
        const hlCanvas = $("hl-canvas");
        const penCanvas = $("pen-canvas");
        const eraserCanvas = $("eraser-canvas");
        const drawCanvas = $("draw-canvas");
        const shapePreviewCanvas = $("shape-preview-canvas");
        const laserCanvas = $("laser-canvas");

        const slideCtx = slideCanvas.getContext("2d", { alpha: false });
        const hlCtx = hlCanvas.getContext("2d", { alpha: true });
        const penCtx = penCanvas.getContext("2d", { alpha: true });
        const eraserCtx = eraserCanvas.getContext("2d", { alpha: true });
        const drawCtx = drawCanvas.getContext("2d", { alpha: true });
        const shapePreviewCtx = shapePreviewCanvas.getContext("2d", { alpha: true });
        const laserCtx = laserCanvas.getContext("2d", { alpha: true });

        const pointerDot = $("pointer-dot");
        const seekBar = $("seek-bar");
        const playBtn = $("play-btn");
        const tCurr = $("t-curr");
        const tTotal = $("t-total");
        const engineDot = $("engine-dot");
        const engineText = $("engine-text");
        const offsetVal = $("offset-val");
        const offsetDisp = $("offset-disp");
        const fpsDisp = $("fps-disp");
        const pollPanel = $("poll-panel");
        const pollQ = $("poll-q");
        const pollOpts = $("poll-opts");
        const chapterMarks = $("chapter-marks");
        const pageIndicator = $("page-indicator");
        const bufferingOverlay = $("buffering-overlay");
        const videoSeekBar = $("video-seek-bar");
        const vCurr = $("v-curr");
        const vTotal = $("v-total");
        const istClock = $("ist-clock");
        const debugConsoleBtn = $("debug-console-btn");

        const BASE_WIDTH = 1080;
        const POINTER_HIDE_US = 2e6;
        const SHAPES_STROKE_TO_REPLACE = "#000001";
        const USLShape_DASH_SCALE_BASE_DIM = 100;

        let isLightModeCached = typeof document !== 'undefined' ? document.body.classList.contains('light-mode') : false;
        const colorLut = new Map();

        window.addEventListener('theme-changed', (e) => {
            if (e && e.detail && typeof e.detail.isLight === 'boolean') {
                isLightModeCached = e.detail.isLight;
            } else if (typeof document !== 'undefined') {
                isLightModeCached = document.body.classList.contains('light-mode');
            }
            colorLut.clear();
            if (engineLoaded) {
                paintBackground();
                replayStrokes(lastDrawUs);
            }
        });

        function getDisplayColor(c, isBg = false) {
            if (!isLightModeCached || !c) return c;
            const key = c + (isBg ? '_bg' : '_fg');
            const cached = colorLut.get(key);
            if (cached) return cached;

            const computed = computeDisplayColor(c, isBg);
            colorLut.set(key, computed);
            return computed;
        }

        function computeDisplayColor(c, isBg = false) {
            const hex = c.trim().toLowerCase();
            if (isBg) {
                if (hex.startsWith('#')) {
                    let r, g, b;
                    if (hex.length === 4) {
                        r = parseInt(hex[1] + hex[1], 16);
                        g = parseInt(hex[2] + hex[2], 16);
                        b = parseInt(hex[3] + hex[3], 16);
                    } else if (hex.length === 7) {
                        r = parseInt(hex.substring(1, 3), 16);
                        g = parseInt(hex.substring(3, 5), 16);
                        b = parseInt(hex.substring(5, 7), 16);
                    } else {
                        return '#ffffff';
                    }
                    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                    if (lum < 100) return '#ffffff';
                } else if (hex === 'black' || hex === 'dark' || hex === 'navy' || hex === 'darkblue') {
                    return '#ffffff';
                }
                return c;
            } else {
                if (hex === '#ffffff' || hex === '#fff') return '#0f172a';
                if (hex === '#ffff00' || hex === '#ff0') return '#0056b3';
                if (hex === '#00ffff' || hex === '#0ff') return '#0ea5e9';
                if (hex === '#00ff00' || hex === '#0f0') return '#16a34a';

                if (hex.startsWith('#') && (hex.length === 4 || hex.length === 7)) {
                    let r, g, b;
                    if (hex.length === 4) {
                        r = parseInt(hex[1] + hex[1], 16);
                        g = parseInt(hex[2] + hex[2], 16);
                        b = parseInt(hex[3] + hex[3], 16);
                    } else {
                        r = parseInt(hex.substring(1, 3), 16);
                        g = parseInt(hex.substring(3, 5), 16);
                        b = parseInt(hex.substring(5, 7), 16);
                    }
                    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                    if (lum > 200) return '#0f172a';
                }
                return c;
            }
        }

        // Global State
        let activeCourseId = "LPN7OFOL";
        let activeUid = "";
        let engineLoaded = false;
        let drawOffset = 0;
        let CW = 1, CH = 1;
        let recordStartMs = -1;
        let lastPaintedPanX = 0, lastPaintedPanY = 0, lastPaintedZoom = 1;

        let slideRegistry = {};
        let assetMap = {};

        // Maths and Bezier functions imported from ./engine/bezier.js

        function smoothStroke(stroke) {
            // parities matching production engine: Use raw recorded points
            return;
        }

        let finalSlideList = [];
        let slideSeqs = [];

        // Engine events & state maps
        let allEvents = [];
        let completedStrokes = [];
        let strokesBySid = new Map();
        let eventsBySid = new Map();
        let currentDeletedSet = new Set();
        let incrementalActiveTFIds = [];

        function pushCompletedStroke(s) {
            completedStrokes.push(s);
            if (!s.sid) return;
            if (!strokesBySid.has(s.sid)) strokesBySid.set(s.sid, []);
            strokesBySid.get(s.sid).push(s);
        }

        let tempHighlightStrokes = [];
        let eraseLog = [];
        let undoneOids = new Map();
        let debugConsoleMode = null;

        // Shared state
        let curSlideIdx = 0;
        let curSid = "init";
        let curSlideUrl = '';
        let curBgColor = "#111118";
        let curBgImageUrl = '';
        let curColor = "#ffff00";
        let curMode = "marker";
        let curPenSize = 2;
        let curEraserSize = 10;
        let isHybridMode = false;
        let curSlideRotation = 0;
        let curGifUrl = '';
        let curScreenShare = false;

        const activeStrokes = new Map();
        let latestTempHLcwId = null;
        let ptrX = -999, ptrY = -999;
        let lastPollUid = null;
        let evIdx = 0;
        let isSeeking = false;
        let isBuffering = false;
        let autoResumeAfterSeek = false;

        let curPanX = 0, curPanY = 0, curZoom = 1;
        const transformMap = new Map();
        let activeTFIds = [];

        let snapshots = [];
        let activePollEvent = null;
        let scaleFactor = 1;
        let lastPaintedUrl = null;
        let lastPaintedBg = null;
        let lastPaintedBgUrl = null;
        let lastPaintedRotation = 0;
        let lastPaintedGif = '';
        let lastPaintedSS = false;

        const imgCache = new Map();
        const imgLoadPromises = new Map();
        const uslCache = new Map();
        const uslLoadPromises = new Map();

        const LIVE_SHAPE_MODES = new Set(["rectangle", "rect", "square", "circle", "line", "arrow", "ellipse", "triangle", "rhombus", "convexlens", "concavelens", "concavemirror", "convexmirror", "pentagon", "hexagon", "dashedline", "shape"]);
        const isLiveShapeMode = (m) => {
            if (!m) return false;
            const n = String(m).toLowerCase().replace(/[-_]/g, '');
            return LIVE_SHAPE_MODES.has(n);
        };
        const isViewportDefault = () => (Math.abs(curZoom - 1) < 1e-6 && Math.abs(curPanX) < 1e-6 && Math.abs(curPanY) < 1e-6);

        function clearShapePreview() {
            const dpr = window.devicePixelRatio || 1;
            shapePreviewCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            shapePreviewCtx.clearRect(0, 0, CW, CH);
        }

        function renderLiveShapePreview(stroke, x2, y2) {
            if (!stroke) return;
            if (!isViewportDefault()) return;
            clearShapePreview();
            shapePreviewCtx.save();
            drawShape(shapePreviewCtx, stroke, stroke.startX, stroke.startY, x2, y2);
            shapePreviewCtx.restore();
        }

        let uslRepaintTimer = null;
        function scheduleUslRepaint() {
            if (!engineLoaded) return;
            clearTimeout(uslRepaintTimer);
            uslRepaintTimer = setTimeout(() => {
                replayStrokes(drawingUs(curVideoUs()));
            }, 0);
        }

        function fetchUsl(url) {
            if (!url) return Promise.resolve(null);
            if (uslLoadPromises.has(url)) return uslLoadPromises.get(url);
            if (uslCache.has(url) && uslCache.get(url)) return Promise.resolve(uslCache.get(url));
            uslCache.set(url, null);
            const loadPromise = fetch(url)
                .then(r => r.json())
                .then(data => {
                    const boundsObj = data.find(o => o.type === "bounds") || { w: 501, h: 501 };
                    const elements = data.filter(o => o.type !== "bounds").map(o => {
                        let path2D = null;
                        try {
                            if (o.type === "path") {
                                path2D = new Path2D(o.d);
                            } else if (o.type === "circle") {
                                path2D = new Path2D();
                                path2D.arc(o.cx, o.cy, o.r, 0, Math.PI * 2);
                            } else if (o.type === "ellipse") {
                                path2D = new Path2D();
                                path2D.ellipse(o.cx, o.cy, o.rx, o.ry, 0, 0, Math.PI * 2);
                            } else if (o.type === "rect") {
                                path2D = new Path2D();
                                path2D.rect(o.x, o.y, o.w, o.h);
                            } else if (o.type === "line") {
                                path2D = new Path2D();
                                path2D.moveTo(o.x1, o.y1);
                                path2D.lineTo(o.x2, o.y2);
                            }
                        } catch (e) { }
                        if (path2D && Array.isArray(o.transform) && o.transform.length === 6) {
                            const tPath = new Path2D();
                            tPath.addPath(path2D, new DOMMatrix(o.transform));
                            path2D = tPath;
                        }
                        return {
                            path2D,
                            stroke: o.stroke || null,
                            strokeWidth: o["stroke-width"] || 7,
                            fill: o.fill || null,
                            dash: o["stroke-dasharray"] ? o["stroke-dasharray"].split(" ").map(Number) : null
                        };
                    }).filter(e => e.path2D);
                    const parsed = { w: boundsObj.w, h: boundsObj.h, elements };
                    uslCache.set(url, parsed);
                    scheduleUslRepaint();
                    return parsed;
                })
                .catch(err => { console.error("Failed to fetch USL:", url, err); uslCache.delete(url); return null; })
                .finally(() => { uslLoadPromises.delete(url); });
            uslLoadPromises.set(url, loadPromise);
            return loadPromise;
        }

        let prevRafTs = 0;
        let fpsSamples = [];
        const activeBlobUrls = new Set();
        let lastLocalVideoBlobUrl = null;

        let pointerStream = [];
        let ptrStreamIdx = 0;

        const fmt = sec => { const s = Math.max(0, sec); return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`; };
        const curVideoUs = () => Math.round(video.currentTime * 1e6);
        const drawingUs = vUs => vUs + drawOffset;

        function setStatus(cls, msg) {
            console.log(`[Status] ${cls.toUpperCase()}: ${msg}`);
        }

        function getPdfPage(u) {
            try { const p = new URL(u).searchParams.get("page"); return p ? parseInt(p) : null; }
            catch (_) { return null; }
        }

        function getImg(url) {
            if (!url) return null;
            if (!imgCache.has(url)) {
                const img = new Image();
                img.referrerPolicy = "no-referrer";
                const loadPromise = (async () => {
                    try {
                        let finalUrl = url;
                        if (!finalUrl.startsWith("data:")) {
                            if (finalUrl.includes("?")) {
                                if (!finalUrl.includes("fm=webp")) finalUrl += "&fm=webp&fit=clip&auto=compress&w=1080";
                            } else {
                                finalUrl += "?fm=webp&fit=clip&auto=compress&w=1080";
                            }
                        }
                        img.src = finalUrl;
                        if ('decode' in img) {
                            await img.decode();
                        } else {
                            await new Promise((resolve, reject) => {
                                img.onload = resolve;
                                img.onerror = reject;
                            });
                        }
                        if (url === curSlideUrl || url === curBgImageUrl) paintBackground();
                        return true;
                    } catch (e) {
                        return false;
                    }
                })();
                imgLoadPromises.set(url, loadPromise);
                imgCache.set(url, img);
            }
            return imgCache.get(url);
        }

        async function preloadSlides() {
            const registryValues = Object.values(slideRegistry).filter(s => s && s.url);
            const total = registryValues.length;
            if (total === 0) return;

            // Fast initial batch: preload only the first 3 slides to make playback start immediately
            const initialBatch = registryValues.slice(0, 3);
            let loaded = 0;
            const updateUI = () => {
                const label = $("splash-label");
                const bar = $("splash-progress");
                if (label) label.textContent = `Preparing Slides ${loaded}/${initialBatch.length}...`;
                if (bar) bar.style.width = `${Math.min(100, 85 + (loaded / initialBatch.length) * 15)}%`;
            };

            // Non-blocking slide preload: immediately initiate background decoding
            initialBatch.forEach(s => {
                if (s.url) getImg(s.url);
                if (s.bg) getImg(s.bg);
            });

            // Lazily preload remaining slides in background without blocking UI
            const lazyPreload = () => {
                const remaining = registryValues.slice(3);
                remaining.forEach(s => {
                    if (s.url) getImg(s.url);
                    if (s.bg) getImg(s.bg);
                });
            };
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(lazyPreload, { timeout: 3000 });
            } else {
                setTimeout(lazyPreload, 400);
            }
        }

        let lastCW = 0, lastCH = 0;
        function resizeCanvas(force) {
            const area = $("canvas-area");
            const wrapper = $("canvas-wrapper");
            if (!area || !wrapper) return;

            const ww = wrapper.clientWidth || window.innerWidth;
            const wh = wrapper.clientHeight || window.innerHeight;

            let nw = ww;
            let nh = nw * 9 / 16;
            if (nh > wh) { nh = wh; nw = nh * 16 / 9; }

            nw = Math.min(nw, ww);
            nh = Math.min(nh, wh);

            area.style.width = nw + "px";
            area.style.height = nh + "px";

            const actualW = area.offsetWidth;
            const actualH = area.offsetHeight;

            if (!force && actualW === lastCW && actualH === lastCH && actualW > 0) return;

            lastCW = CW = actualW;
            lastCH = CH = actualH;
            if (CW <= 0 || CH <= 0) return;
            scaleFactor = CW / BASE_WIDTH;

            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            for (const c of [slideCanvas, hlCanvas, penCanvas, eraserCanvas, drawCanvas, shapePreviewCanvas, laserCanvas]) {
                if (c) {
                    c.width = Math.round(CW * dpr);
                    c.height = Math.round(CH * dpr);
                    const ctx = c.getContext("2d");
                    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                }
            }

            paintBackground(true);
            if (engineLoaded) {
                requestAnimationFrame(() => replayStrokes(drawingUs(curVideoUs())));
            }
        }

        let _resizeTimer = null;
        function debouncedResize(force) {
            if (_resizeTimer) cancelAnimationFrame(_resizeTimer);
            _resizeTimer = requestAnimationFrame(() => {
                _resizeTimer = null;
                resizeCanvas(force);
            });
        }
        const resizeObserver = new ResizeObserver(() => debouncedResize(false));
        if ($("canvas-area")) resizeObserver.observe($("canvas-area"));
        window.addEventListener("resize", () => debouncedResize(false));

        function projectBoardPoint(x, y) {
            return {
                x: (x * curZoom) + (curPanX * CW),
                y: (y * curZoom) + (curPanY * CH)
            };
        }

        function drawImageContain(ctx, img, cw, ch) {
            if (!img || !img.complete || img.naturalWidth === 0) return;
            const iw = img.naturalWidth;
            const ih = img.naturalHeight;
            const ratio = Math.min(cw / iw, ch / ih);
            const nw = iw * ratio;
            const nh = ih * ratio;
            const x = (cw - nw) / 2;
            const y = (ch - nh) / 2;
            ctx.drawImage(img, x, y, nw, nh);
        }

        function paintBackground(force = false) {
            if (!force && lastPaintedUrl === curSlideUrl && lastPaintedBg === curBgColor && lastPaintedBgUrl === curBgImageUrl && lastPaintedPanX === curPanX && lastPaintedPanY === curPanY && lastPaintedZoom === curZoom && lastPaintedRotation === curSlideRotation && lastPaintedGif === curGifUrl && lastPaintedSS === curScreenShare) return;
            lastPaintedUrl = curSlideUrl;
            lastPaintedBg = curBgColor;
            lastPaintedBgUrl = curBgImageUrl;
            lastPaintedPanX = curPanX;
            lastPaintedPanY = curPanY;
            lastPaintedZoom = curZoom;
            lastPaintedRotation = curSlideRotation;
            lastPaintedGif = curGifUrl;
            lastPaintedSS = curScreenShare;

            if (curSlideUrl) {
                const img = getImg(curSlideUrl);
                if (img && img.complete && img.naturalWidth > 0) {
                    if (curBgImageUrl) {
                        const bgImg = getImg(curBgImageUrl);
                        if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
                            drawImageContain(slideCtx, bgImg, CW, CH);
                        } else {
                            slideCtx.fillStyle = getDisplayColor(curBgColor, true);
                            slideCtx.fillRect(0, 0, CW, CH);
                        }
                    } else {
                        slideCtx.fillStyle = getDisplayColor(curBgColor, true);
                        slideCtx.fillRect(0, 0, CW, CH);
                    }

                    slideCtx.save();
                    slideCtx.translate(curPanX * CW, curPanY * CH);
                    slideCtx.scale(curZoom, curZoom);

                    if (curSlideRotation) {
                        slideCtx.translate(CW / 2, CH / 2);
                        slideCtx.rotate((curSlideRotation * Math.PI) / 180);
                        slideCtx.translate(-CW / 2, -CH / 2);
                    }

                    drawImageContain(slideCtx, img, CW, CH);
                    slideCtx.restore();
                } else {
                    // Offline fallback: draw clean background canvas so pen strokes are visible
                    slideCtx.fillStyle = getDisplayColor(curBgColor, true);
                    slideCtx.fillRect(0, 0, CW, CH);
                }
            } else {
                if (curBgImageUrl) {
                    const bgImg = getImg(curBgImageUrl);
                    if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
                        drawImageContain(slideCtx, bgImg, CW, CH);
                    } else {
                        slideCtx.fillStyle = getDisplayColor(curBgColor, true);
                        slideCtx.fillRect(0, 0, CW, CH);
                    }
                } else {
                    slideCtx.fillStyle = getDisplayColor(curBgColor, true);
                    slideCtx.fillRect(0, 0, CW, CH);
                }
            }

            if (curGifUrl) {
                const gifImg = getImg(curGifUrl);
                if (gifImg && gifImg.complete && gifImg.naturalWidth > 0) {
                    slideCtx.save();
                    drawImageContain(slideCtx, gifImg, CW, CH);
                    slideCtx.restore();
                }
            }

            if (curScreenShare) {
                slideCtx.save();
                slideCtx.fillStyle = "rgba(140, 93, 255, 0.1)";
                slideCtx.fillRect(0, 0, CW, CH);
                slideCtx.strokeStyle = "#8c5dff";
                slideCtx.lineWidth = 4;
                slideCtx.setLineDash([15, 10]);
                slideCtx.strokeRect(10, 10, CW - 20, CH - 20);
                slideCtx.fillStyle = "#8c5dff";
                slideCtx.font = "bold 14px Outfit";
                slideCtx.textAlign = "right";
                slideCtx.fillText("LIVE SCREEN SHARE", CW - 30, CH - 30);
                slideCtx.restore();
            }
        }

        function drawDot(dc, stroke) {
            dc.beginPath();
            dc.lineCap = "round";
            dc.lineJoin = "round";
            let lineWidth = stroke.th * scaleFactor * 3;
            if (stroke.isErase) lineWidth = (stroke.th + 10) * scaleFactor;
            else if (stroke.isHighlight) lineWidth = stroke.th * scaleFactor * 15;

            const radius = Math.max(1, lineWidth / 2);
            let op, style;
            if (stroke.isErase) {
                op = "destination-out";
                style = "rgba(0,0,0,1)";
            } else {
                op = "source-over";
                style = getDisplayColor(stroke.color, false);
            }
            if (dc.globalCompositeOperation !== op) dc.globalCompositeOperation = op;
            if (dc.fillStyle !== style) dc.fillStyle = style;

            dc.arc(stroke.lastX, stroke.lastY, radius, 0, Math.PI * 2);
            dc.fill();
        }

        function drawCurve(dc, stroke, mx, my) {
            dc.beginPath();
            dc.lineCap = "round";
            dc.lineJoin = "round";
            let op, style, width;
            if (stroke.isErase) {
                op = "destination-out";
                style = "rgba(0,0,0,1)";
                width = (stroke.th + 10) * scaleFactor;
            } else if (stroke.isHighlight) {
                op = "source-over";
                style = getDisplayColor(stroke.color, false);
                width = stroke.th * scaleFactor * 15;
            } else {
                op = "source-over";
                style = getDisplayColor(stroke.color, false);
                width = stroke.th * scaleFactor * 3;
            }

            if (dc.globalCompositeOperation !== op) dc.globalCompositeOperation = op;
            if (dc.strokeStyle !== style) dc.strokeStyle = style;
            if (dc.lineWidth !== width) dc.lineWidth = width;

            dc.moveTo(stroke.midX, stroke.midY);
            dc.quadraticCurveTo(stroke.lastX, stroke.lastY, mx, my);
            dc.stroke();
        }

        function renderContinuousStroke(dc, stroke, pts) {
            if (!pts || pts.length === 0) return;

            const isErase = stroke.isErase;
            const isHL = stroke.isHighlight;
            const lineWidth = isErase ? (stroke.th + 10) * scaleFactor 
                           : (isHL ? stroke.th * scaleFactor * 15 
                           : stroke.th * scaleFactor * 3);
            const style = isErase ? "rgba(0,0,0,1)" : getDisplayColor(stroke.color, false);
            const op = isErase ? "destination-out" : "source-over";

            if (dc.globalCompositeOperation !== op) dc.globalCompositeOperation = op;
            if (dc.strokeStyle !== style) dc.strokeStyle = style;
            if (dc.lineWidth !== lineWidth) dc.lineWidth = lineWidth;
            if (dc.lineCap !== "round") dc.lineCap = "round";
            if (dc.lineJoin !== "round") dc.lineJoin = "round";

            const p0 = pts[0];
            let lastX = p0.x * CW, lastY = p0.y * CH;

            if (pts.length === 1) {
                if (dc.fillStyle !== style) dc.fillStyle = style;
                dc.beginPath();
                dc.arc(lastX, lastY, Math.max(1, lineWidth / 2), 0, Math.PI * 2);
                dc.fill();
                return;
            }

            dc.beginPath();
            dc.moveTo(lastX, lastY);

            for (let i = 1; i < pts.length; i++) {
                const p = pts[i];
                const nx = p.x * CW, ny = p.y * CH;
                const isEnd = (i === pts.length - 1);
                const mx = isEnd ? nx : (lastX + nx) / 2;
                const my = isEnd ? ny : (lastY + ny) / 2;
                dc.quadraticCurveTo(lastX, lastY, mx, my);
                lastX = nx;
                lastY = ny;
            }
            dc.stroke();
        }

        function getStrokePath2D(stroke, curCW, curCH) {
            if (stroke._cachedPath2D && stroke._cachedCW === curCW && stroke._cachedCH === curCH) {
                return stroke._cachedPath2D;
            }
            const p = new Path2D();
            const pts = stroke.pts;
            if (!pts || pts.length === 0) return p;
            const p0 = pts[0];
            let lastX = p0.x * curCW, lastY = p0.y * curCH;

            if (pts.length === 1) {
                p.arc(lastX, lastY, 1, 0, Math.PI * 2);
            } else {
                p.moveTo(lastX, lastY);
                for (let i = 1; i < pts.length; i++) {
                    const pt = pts[i];
                    const nx = pt.x * curCW, ny = pt.y * curCH;
                    const isEnd = (i === pts.length - 1);
                    const mx = isEnd ? nx : (lastX + nx) / 2;
                    const my = isEnd ? ny : (lastY + ny) / 2;
                    p.quadraticCurveTo(lastX, lastY, mx, my);
                    lastX = nx;
                    lastY = ny;
                }
            }
            stroke._cachedPath2D = p;
            stroke._cachedCW = curCW;
            stroke._cachedCH = curCH;
            return p;
        }

        function drawShape(dc, stroke, x1, y1, x2, y2) {
            dc.save();
            dc.beginPath();
            dc.strokeStyle = getDisplayColor(stroke.color, false);
            dc.lineWidth = (stroke.th * CW / BASE_WIDTH) * 3;
            dc.lineJoin = "round";
            dc.lineCap = "round";

            if (stroke.dash && stroke.dash.length > 0) {
                dc.setLineDash(stroke.dash.map(v => v * CW / BASE_WIDTH));
            } else {
                dc.setLineDash([]);
            }

            const mode = stroke.mode.toLowerCase().replace(/[-_]/g, '');

            if (mode === "rectangle" || mode === "rect" || mode === "square") {
                dc.strokeRect(x1, y1, x2 - x1, y2 - y1);
            } else if (mode === "circle") {
                const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
                const rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
                dc.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                dc.stroke();
            } else if (mode === "line") {
                dc.moveTo(x1, y1);
                dc.lineTo(x2, y2);
                dc.stroke();
            } else if (mode === "dashedline") {
                if (!stroke.dash || stroke.dash.length === 0) {
                    dc.setLineDash([10 * CW / BASE_WIDTH, 5 * CW / BASE_WIDTH]);
                }
                dc.moveTo(x1, y1);
                dc.lineTo(x2, y2);
                dc.stroke();
            } else if (mode === "ellipse") {
                const rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
                dc.ellipse(x1 + (x2 - x1) / 2, y1 + (y2 - y1) / 2, rx, ry, 0, 0, Math.PI * 2);
                dc.stroke();
            } else if (mode === "arrow") {
                const angle = Math.atan2(y2 - y1, x2 - x1);
                const arrowHead = stroke.th * 3 * CW / BASE_WIDTH;
                dc.moveTo(x1, y1); dc.lineTo(x2, y2);
                dc.lineTo(x2 - arrowHead * Math.cos(angle - Math.PI / 4), y2 - arrowHead * Math.sin(angle - Math.PI / 4));
                dc.moveTo(x2, y2);
                dc.lineTo(x2 - arrowHead * Math.cos(angle + Math.PI / 4), y2 - arrowHead * Math.sin(angle + Math.PI / 4));
                dc.stroke();
            } else if (mode === "triangle") {
                dc.moveTo(x1 + (x2 - x1) / 2, y1);
                dc.lineTo(x2, y2);
                dc.lineTo(x1, y2);
                dc.closePath();
                dc.stroke();
            } else if (mode === "rhombus") {
                dc.moveTo(x1 + (x2 - x1) / 2, y1);
                dc.lineTo(x2, y1 + (y2 - y1) / 2);
                dc.lineTo(x1 + (x2 - x1) / 2, y2);
                dc.lineTo(x1, y1 + (y2 - y1) / 2);
                dc.closePath();
                dc.stroke();
            } else if (mode === "convexlens" || mode === "concavelens" || mode === "concavemirror" || mode === "convexmirror" || mode === "shape") {
                const usl = stroke.uslUrl ? uslCache.get(stroke.uslUrl) : null;
                if (usl && usl.elements) {
                    const targetW = Math.abs(x2 - x1);
                    const targetH = Math.abs(y2 - y1);
                    const startX = Math.min(x1, x2);
                    const startY = Math.min(y1, y2);
                    const scaleX = usl.w > 0 ? targetW / usl.w : 1;
                    const scaleY = usl.h > 0 ? targetH / usl.h : 1;

                    dc.save();
                    dc.translate(startX, startY);
                    dc.scale(scaleX, scaleY);

                    for (const p of usl.elements) {
                        if (!p.path2D) continue;
                        dc.save();

                        const isPlaceholder = (c) => !c || c === "none" || c === SHAPES_STROKE_TO_REPLACE;
                        const strokeColor = getDisplayColor(isPlaceholder(p.stroke) ? stroke.color : p.stroke, false);
                        const hasFill = p.fill && p.fill !== "none";
                        const fillColor = getDisplayColor((p.fill === SHAPES_STROKE_TO_REPLACE) ? stroke.color : (hasFill ? p.fill : null), false);

                        dc.strokeStyle = strokeColor;
                        if (fillColor) dc.fillStyle = fillColor;

                        const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
                        const baseTh = (stroke.th * CW / BASE_WIDTH) * 3;
                        dc.lineWidth = avgScale > 0 ? baseTh / avgScale : baseTh;

                        if (p.dash && p.dash.length > 0) {
                            const dashFactor = USLShape_DASH_SCALE_BASE_DIM / Math.min(usl.w, usl.h);
                            dc.setLineDash(p.dash.map(v => (v * dashFactor) / avgScale));
                        } else {
                            dc.setLineDash([]);
                        }

                        dc.lineJoin = "round";
                        dc.lineCap = "round";
                        if (strokeColor) dc.stroke(p.path2D);
                        if (fillColor) dc.fill(p.path2D);
                        dc.restore();
                    }
                    dc.restore();
                } else {
                    if (stroke.uslUrl) fetchUsl(stroke.uslUrl);
                    scheduleUslRepaint();
                    dc.restore();
                    return;
                }
            } else if (["pentagon", "hexagon"].includes(mode)) {
                const sides = mode === "pentagon" ? 5 : 6, r = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
                for (let i = 0; i < sides; i++) {
                    const angle = (i * 2 * Math.PI / sides) - Math.PI / 2, px = x1 + r * Math.cos(angle), py = y1 + r * Math.sin(angle);
                    if (i === 0) dc.moveTo(px, py); else dc.lineTo(px, py);
                }
                dc.closePath();
                dc.stroke();
            }
            dc.restore();
        }

        // Pre-allocated singletons for zero-allocation 60 FPS replay & seek
        const scratchPoint = new DOMPoint();
        const replayUndoneEvents = new Set();
        const replayDeletedOids = new Set();
        const replayHistoryStack = [];

        function replayStrokes(targetUs) {
            drawCtx.clearRect(0, 0, CW, CH);
            penCtx.clearRect(0, 0, CW, CH);
            eraserCtx.clearRect(0, 0, CW, CH);
            hlCtx.clearRect(0, 0, CW, CH);
            laserCtx.clearRect(0, 0, CW, CH);
            clearShapePreview();

            const isShape = (m) => {
                if (!m) return false;
                const nm = m.toLowerCase().replace(/[-_]/g, '');
                return LIVE_SHAPE_MODES.has(nm);
            };

            drawCtx.save(); penCtx.save(); eraserCtx.save(); hlCtx.save(); laserCtx.save();

            drawCtx.translate(curPanX * CW, curPanY * CH); drawCtx.scale(curZoom, curZoom);
            penCtx.translate(curPanX * CW, curPanY * CH); penCtx.scale(curZoom, curZoom);
            eraserCtx.translate(curPanX * CW, curPanY * CH); eraserCtx.scale(curZoom, curZoom);
            hlCtx.translate(curPanX * CW, curPanY * CH); hlCtx.scale(curZoom, curZoom);
            laserCtx.translate(curPanX * CW, curPanY * CH); laserCtx.scale(curZoom, curZoom);

            let lastEraseT = -1;
            for (let i = 0; i < eraseLog.length; i++) {
                const ea = eraseLog[i];
                if ((ea.sid === curSid || ea.sid === "init") && ea.t <= targetUs) {
                    if (ea.t > lastEraseT) lastEraseT = ea.t;
                }
            }

            let currentMode = "marker", currentColor = "#000000", currentPenSize = 2, currentEraserSize = 10;
            let fMode = false, fColor = false, fPen = false, fEr = false;

            let low = 0, high = allEvents.length - 1;
            let sIdx = allEvents.length;
            while (low <= high) {
                let mid = (low + high) >>> 1;
                if (allEvents[mid].t > targetUs) { sIdx = mid; high = mid - 1; }
                else { low = mid + 1; }
            }

            for (let i = sIdx - 1; i >= 0; i--) {
                const ev = allEvents[i];
                if (!fMode && ev.type === "mode") { currentMode = ev.mode; fMode = true; }
                else if (!fColor && ev.type === "color") { currentColor = ev.color; fColor = true; }
                else if (!fPen && ev.type === "pen_size") { currentPenSize = ev.size; fPen = true; }
                else if (!fEr && ev.type === "eraser_size") { currentEraserSize = ev.size; fEr = true; }
                if (fMode && fColor && fPen && fEr) break;
            }
            curMode = currentMode; curColor = currentColor; curPenSize = currentPenSize; curEraserSize = currentEraserSize;

            const slideEvents = eventsBySid.get(curSid) || [];
            replayUndoneEvents.clear();
            replayDeletedOids.clear();
            replayHistoryStack.length = 0;

            for (let i = 0; i < slideEvents.length; i++) {
                const ev = slideEvents[i];
                if (ev.t > targetUs) break;
                if (ev.type === "stroke_up" || ev.type === "delete_objects" || ev.type === "erase_all") {
                    replayHistoryStack.push(ev);
                } else if (ev.type === "undo") {
                    if (replayHistoryStack.length > 0) {
                        const target = replayHistoryStack.pop();
                        replayUndoneEvents.add(target.t);
                    }
                }
            }

            transformMap.clear();
            activeTFIds = [];

            for (let i = 0; i < slideEvents.length; i++) {
                const ev = slideEvents[i];
                if (ev.t > targetUs) break;
                if (!replayUndoneEvents.has(ev.t)) {
                    if (ev.type === "delete_objects") {
                        (ev.oids || []).forEach(oid => replayDeletedOids.add(oid));
                    } else if (ev.type === "erase_all") {
                        lastEraseT = Math.max(lastEraseT, ev.t);
                    }
                }

                if (ev.type === "transform") {
                    const tf = ev.payload;
                    if (!tf) continue;
                    if (tf.t === "s") {
                        activeTFIds = tf.data?.ids || tf.ids || [];
                    } else if (tf.t === "ts" || tf.t === "r" || tf.t === "sc" || tf.t === "sl") {
                        const d = tf.data || tf.path || {};
                        for (const oid of activeTFIds) {
                            let entry = transformMap.get(oid);
                            if (!entry) {
                                entry = { matrix: new DOMMatrix() };
                                transformMap.set(oid, entry);
                            }
                            let m = new DOMMatrix();
                            if (tf.t === "ts") {
                                m = m.translate((d.dx || 0) * CW, (d.dy || 0) * CH);
                            } else if (tf.t === "r") {
                                const dg = d.dg || d.angleDiff || d.angle || 0;
                                const cx = (d.cx !== undefined ? d.cx : (d.px ?? 0)) * CW;
                                const cy = (d.cy !== undefined ? d.cy : (d.py ?? 0)) * CH;
                                m = m.translate(cx, cy).rotate(dg).translate(-cx, -cy);
                            } else if (tf.t === "sc" || tf.t === "sl") {
                                if (d.m) {
                                    m = new DOMMatrix([
                                        parseFloat(d.m.sx ?? 1),
                                        parseFloat(d.m.shy ?? 0),
                                        parseFloat(d.m.shx ?? 0),
                                        parseFloat(d.m.sy ?? 1),
                                        parseFloat(d.m.dx ?? 0) * CW,
                                        parseFloat(d.m.dy ?? 0) * CH
                                    ]);
                                } else {
                                    const sx = d.sx ?? 1, sy = d.sy ?? 1;
                                    const cx = (d.cx !== undefined ? d.cx : (d.px ?? 0)) * CW;
                                    const cy = (d.cy !== undefined ? d.cy : (d.py ?? 0)) * CH;
                                    m = m.translate(cx, cy).scale(sx, sy).translate(-cx, -cy);
                                }
                            }
                            entry.matrix = m.multiply(entry.matrix);
                        }
                    } else if (tf.t === "e") {
                        activeTFIds = [];
                    }
                }
            }

            const relevantStrokes = strokesBySid.get(curSid) || [];
            for (let sIdx = 0; sIdx < relevantStrokes.length; sIdx++) {
                const stroke = relevantStrokes[sIdx];
                if (stroke.t_start > targetUs) continue;
                if (stroke.t_start <= lastEraseT) continue;
                if (replayUndoneEvents.has(stroke.t_start)) continue;
                if (stroke.oid && replayDeletedOids.has(stroke.oid)) continue;

                const tf = transformMap.get(stroke.oid) || { matrix: new DOMMatrix() };
                const hasTF = !tf.matrix.isIdentity;
                const m = tf.matrix;

                // Path2D GPU FAST PATH: Completed static stroke (95%+ of whiteboard ink)
                if (!hasTF && !isShape(stroke.mode) && stroke.pts[stroke.pts.length - 1].t <= targetUs) {
                    const isErase = stroke.isErase;
                    const isHL = stroke.isHighlight;
                    const lineWidth = isErase ? (stroke.th + 10) * scaleFactor 
                                   : (isHL ? stroke.th * scaleFactor * 15 
                                   : stroke.th * scaleFactor * 3);
                    const style = isErase ? "rgba(0,0,0,1)" : getDisplayColor(stroke.color, false);
                    const op = isErase ? "destination-out" : "source-over";
                    const p2d = getStrokePath2D(stroke, CW, CH);

                    if (isErase) {
                        const ctxList = [penCtx, hlCtx, drawCtx, eraserCtx];
                        for (let cIdx = 0; cIdx < 4; cIdx++) {
                            const dc = ctxList[cIdx];
                            if (dc.globalCompositeOperation !== op) dc.globalCompositeOperation = op;
                            if (dc.strokeStyle !== style) dc.strokeStyle = style;
                            if (dc.lineWidth !== lineWidth) dc.lineWidth = lineWidth;
                            if (dc.lineCap !== "round") dc.lineCap = "round";
                            if (dc.lineJoin !== "round") dc.lineJoin = "round";
                            dc.stroke(p2d);
                        }
                    } else if (!stroke.isTempHL) {
                        const targetCtx = isHL ? hlCtx : penCtx;
                        if (targetCtx.globalCompositeOperation !== op) targetCtx.globalCompositeOperation = op;
                        if (targetCtx.strokeStyle !== style) targetCtx.strokeStyle = style;
                        if (targetCtx.lineWidth !== lineWidth) targetCtx.lineWidth = lineWidth;
                        if (targetCtx.lineCap !== "round") targetCtx.lineCap = "round";
                        if (targetCtx.lineJoin !== "round") targetCtx.lineJoin = "round";
                        targetCtx.stroke(p2d);
                    }
                    continue;
                }

                let pts = [];
                for (let i = 0; i < stroke.pts.length; i++) {
                    const p = stroke.pts[i];
                    if (p.t <= targetUs) {
                        if (hasTF && !isShape(stroke.mode)) {
                            const rawX = p.x * CW;
                            const rawY = p.y * CH;
                            const projX = (m.a * rawX + m.c * rawY + m.e) / CW;
                            const projY = (m.b * rawX + m.d * rawY + m.f) / CH;
                            pts.push({ x: projX, y: projY, t: p.t });
                        } else {
                            pts.push({ x: p.x, y: p.y, t: p.t });
                        }
                    } else break;
                }
                if (pts.length === 0) continue;

                if (isShape(stroke.mode)) {
                    const dc = stroke.isTempHL ? laserCtx : (stroke.isHighlight ? hlCtx : drawCtx);
                    dc.save();
                    if (hasTF) { dc.transform(m.a, m.b, m.c, m.d, m.e, m.f); }
                    const sx1 = stroke.pts[0].x * CW, sy1 = stroke.pts[0].y * CH;
                    const sx2 = stroke.pts[stroke.pts.length - 1].x * CW, sy2 = stroke.pts[stroke.pts.length - 1].y * CH;
                    drawShape(dc, stroke, sx1, sy1, sx2, sy2);
                    dc.restore();
                } else if (stroke.isErase) {
                    renderContinuousStroke(penCtx, stroke, pts);
                    renderContinuousStroke(hlCtx, stroke, pts);
                    renderContinuousStroke(drawCtx, stroke, pts);
                    renderContinuousStroke(eraserCtx, stroke, pts);
                } else if (stroke.isTempHL) {
                    // Temp lasers handled in laserCtx
                } else {
                    const targetCtx = stroke.isHighlight ? hlCtx : penCtx;
                    renderContinuousStroke(targetCtx, stroke, pts);
                }
            }

            laserCtx.clearRect(0, 0, CW, CH);

            for (const [cwId, s] of activeStrokes) {
                if (s.sid && s.sid !== curSid) continue;
                if (!s.pts || s.pts.length === 0) continue;
                if (s.isTempHL && cwId !== latestTempHLcwId) continue;

                const isSh = isShape(s.mode);
                const tf = transformMap.get(s.oid) || { matrix: new DOMMatrix() };
                const hasTF = !tf.matrix.isIdentity;
                const m = tf.matrix;

                const pts = [];
                for (let i = 0; i < s.pts.length; i++) {
                    const p = s.pts[i];
                    if (hasTF && !isSh) {
                        const rawX = p.x * CW;
                        const rawY = p.y * CH;
                        const projX = (m.a * rawX + m.c * rawY + m.e) / CW;
                        const projY = (m.b * rawX + m.d * rawY + m.f) / CH;
                        pts.push({ x: projX, y: projY, t: p.t });
                    } else {
                        pts.push({ x: p.x, y: p.y, t: p.t });
                    }
                }
                if (pts.length === 0) continue;

                if (isSh) {
                    const dc = s.isTempHL ? laserCtx : (s.isHighlight ? hlCtx : drawCtx);
                    dc.save();
                    if (hasTF) { dc.transform(m.a, m.b, m.c, m.d, m.e, m.f); }
                    const sx1 = pts[0].x * CW, sy1 = pts[0].y * CH;
                    const sx2 = pts[pts.length - 1].x * CW, sy2 = pts[pts.length - 1].y * CH;
                    drawShape(dc, s, sx1, sy1, sx2, sy2);
                    dc.restore();
                } else if (s.isErase) {
                    renderContinuousStroke(penCtx, s, pts);
                    renderContinuousStroke(hlCtx, s, pts);
                    renderContinuousStroke(drawCtx, s, pts);
                    renderContinuousStroke(eraserCtx, s, pts);
                } else {
                    const dc = s.isTempHL ? laserCtx : (s.isHighlight ? hlCtx : penCtx);
                    renderContinuousStroke(dc, s, pts);
                }
            }

            let lastTempHL = null;
            for (let i = tempHighlightStrokes.length - 1; i >= 0; i--) {
                const s = tempHighlightStrokes[i];
                if (s.sid === curSid && s.t_start <= targetUs) { lastTempHL = s; break; }
            }

            if (lastTempHL && latestTempHLcwId === null) {
                const lastPt = lastTempHL.pts[lastTempHL.pts.length - 1];
                const ageUs = targetUs - lastPt.t;
                if (ageUs >= 0 && ageUs < 2500000) {
                    let pts = lastTempHL.pts.filter(p => p.t <= targetUs);
                    if (pts.length > 0) {
                        let lastX = pts[0].x * CW, lastY = pts[0].y * CH;
                        let midX = lastX, midY = lastY;
                        const dotSeg = { lastX, lastY, color: lastTempHL.color, th: lastTempHL.th, isErase: false, isHighlight: true, isTempHL: true, mode: lastTempHL.mode, dash: [] };
                        drawDot(laserCtx, dotSeg);
                        for (let i = 1; i < pts.length; i++) {
                            const nx = pts[i].x * CW, ny = pts[i].y * CH;
                            const mx = (i === pts.length - 1) ? nx : (lastX + nx) / 2;
                            const my = (i === pts.length - 1) ? ny : (lastY + ny) / 2;
                            const seg = { midX, midY, lastX, lastY, color: lastTempHL.color, th: lastTempHL.th, isErase: false, isHighlight: true, isTempHL: true, mode: lastTempHL.mode, dash: [] };
                            drawCurve(laserCtx, seg, mx, my);
                            lastX = nx; lastY = ny; midX = mx; midY = my;
                        }
                    }
                }
            }

            drawCtx.restore(); penCtx.restore(); eraserCtx.restore(); hlCtx.restore(); laserCtx.restore();
        }

        // In-memory Session LRU Cache for 0ms instantaneous lecture switching
        const TELEMETRY_SESSION_CACHE = new Map();

        async function runEngineWithUrl(url, uid = null, startSec = 0) {
            try {
                console.log(`[Engine] Smart Load: ${url} (startSec: ${startSec})`);
                const response = await fetch(url);
                if (!response.ok) return false;

                window.updateSplash("Downloading Telemetry...", 35);
                const buffer = await response.arrayBuffer();

                // Save to IndexedDB cache in background for instant future loads
                if (uid && buffer) {
                    saveTelemetryOffline(uid, buffer, {
                        courseId: activeCourseId || '',
                        downloadedAt: Date.now()
                    }).catch(() => {});
                }

                window.updateSplash("Decrypting Payload...", 65);
                const rawData = await tryDecryptAndParse(buffer, url);

                if (uid && rawData) {
                    if (TELEMETRY_SESSION_CACHE.size >= 8) {
                        const firstKey = TELEMETRY_SESSION_CACHE.keys().next().value;
                        TELEMETRY_SESSION_CACHE.delete(firstKey);
                    }
                    TELEMETRY_SESSION_CACHE.set(uid, rawData);
                }

                console.log("[Engine] JSON parsed. Processing stream frames...");
                await processData(rawData, startSec);

                window.updateSplash("Lecture Ready", 100);
                setStatus("synced", "SYNCED");
                return true;
            } catch (e) {
                console.error(`[Engine] Fetch error for ${url}:`, e);
                return false;
            }
        }

        async function loadLectureByUid(uid, startSec = 0, preferredCourseId = null) {
            if (!uid) {
                console.warn("[Player] Attempted to load lecture with empty UID.");
                return false;
            }
            if (preferredCourseId) {
                activeCourseId = preferredCourseId;
            } else {
                const currentCourse = (window.LOCAL_COURSES && window.LOCAL_COURSES.find(c => c.id === activeCourseId)) || COURSES.find(c => c.id === activeCourseId);
                const hasLec = currentCourse && currentCourse.lectures && currentCourse.lectures.some(l => l.uid === uid);
                if (!hasLec) {
                    const found = findCourseByLectureUid(uid);
                    if (found) activeCourseId = found.id;
                }
            }
            activeUid = uid;
            renderLectureDrawer();

            video.pause();

            const splash = $("splash");
            if (splash) {
                splash.style.display = "flex";
                splash.classList.remove("hidden");
                const label = $("splash-label");
                if (label) label.textContent = `Initializing Lecture...`;
                const bar = $("splash-progress");
                if (bar) bar.style.width = "10%";
            }

            destroyEngine();

            const videoUrl = `https://uamedia.uacdn.net/lesson-raw/${uid}/output.webm`;
            video.preload = "auto";
            video.playsInline = true;
            video.setAttribute("playsinline", "true");
            video.setAttribute("webkit-playsinline", "true");
            video.src = videoUrl;
            video.load();

            if (startSec > 0) {
                const applyResumePosition = () => {
                    try {
                        video.currentTime = startSec;
                        doSeek(startSec * 1e6);
                    } catch (e) {
                        console.warn("[Player] Seek on load error:", e);
                    }
                };

                if (video.readyState >= 1) {
                    applyResumePosition();
                } else {
                    video.addEventListener("loadedmetadata", applyResumePosition, { once: true });
                }
            }

            // 0. MEMORY LRU CACHE (0ms instant session resume)
            if (TELEMETRY_SESSION_CACHE.has(uid)) {
                try {
                    window.updateSplash("⚡ Instant Memory Ready", 90);
                    const memData = TELEMETRY_SESSION_CACHE.get(uid);
                    await processData(memData, startSec);
                    engineLoaded = true;
                    if (splash) {
                        splash.classList.add("hidden");
                        splash.style.display = "none";
                    }
                    showToast("⚡ Instant Session Playback", "success", 1500);
                    return true;
                } catch (memErr) {
                    console.warn("[Engine] Session memory load error:", memErr);
                }
            }

            // 1. FAST PATH: Check IndexedDB offline cache first (<30ms instant load)
            try {
                const cachedTelemetry = await getOfflineTelemetry(uid);
                if (cachedTelemetry) {
                    window.updateSplash("⚡ Instant Cache Ready", 70);
                    const rawData = await tryDecryptAndParse(cachedTelemetry);
                    if (rawData) {
                        if (TELEMETRY_SESSION_CACHE.size >= 8) {
                            const firstKey = TELEMETRY_SESSION_CACHE.keys().next().value;
                            TELEMETRY_SESSION_CACHE.delete(firstKey);
                        }
                        TELEMETRY_SESSION_CACHE.set(uid, rawData);

                        await processData(rawData, startSec);
                        engineLoaded = true;
                        if (splash) {
                            splash.classList.add("hidden");
                            splash.style.display = "none";
                        }
                        showToast("⚡ Instant Cached Playback", "success", 1800);
                        return true;
                    }
                }
            } catch (cacheErr) {
                console.warn("[Engine] Offline cache check:", cacheErr);
            }

            // 2. REMOTE FETCH PIPELINE with auto-caching
            try {
                const directTelemetryUrl = `https://uamedia.uacdn.net/lesson-raw/${uid}/data.json`;
                const proxyTelemetryUrl = `https://corsproxy.io/?${encodeURIComponent(directTelemetryUrl)}`;

                let success = await runEngineWithUrl(directTelemetryUrl, uid, startSec);
                if (!success) {
                    console.warn("[Engine] Direct telemetry fetch failed. Trying CORS proxy...");
                    success = await runEngineWithUrl(proxyTelemetryUrl, uid, startSec);
                }

                if (!success) {
                    const directSecureUrl = `https://uamedia.uacdn.net/lesson-raw/${uid}/securejson.json`;
                    const proxySecureUrl = `https://corsproxy.io/?${encodeURIComponent(directSecureUrl)}`;
                    success = await runEngineWithUrl(directSecureUrl, uid, startSec);
                    if (!success) {
                        success = await runEngineWithUrl(proxySecureUrl, uid, startSec);
                    }
                }

                if (success) {
                    engineLoaded = true;
                    if (splash) {
                        splash.classList.add("hidden");
                        splash.style.display = "none";
                    }
                    return true;
                } else {
                    throw new Error("Telemetry endpoints unreachable.");
                }
            } catch (err) {
                console.error("loadLectureByUid failed:", err);
                setStatus("error", "LOAD ERROR");
                const label = $("splash-label");
                if (label) label.textContent = "Telemetry fetch failed. Please check your network or load a downloaded local folder.";
                showToast("Failed to fetch online lecture data. Try offline / downloaded mode.", "warn");
                return false;
            }
        }

        async function runEngine() {
            if (engineLoaded) return true;
            setStatus("syncing", "LOADING DATA...");

            const params = new URLSearchParams(window.location.search);
            const lecUrl = params.get("lec") || params.get("url");
            isHybridMode = params.get("hybrid") === "true" || params.get("isHybridClass") === "true";

            if (lecUrl) {
                if (lecUrl.length === 20 && !lecUrl.includes("/")) {
                    activeUid = lecUrl;
                    return await loadLectureByUid(lecUrl);
                }
                video.src = lecUrl;
                console.log(`[Engine] Custom Lecture URL: ${lecUrl}`);

                const derivedData = lecUrl.replace(/\/[^/]+\.(webm|mp4|m3u8)$/i, "/data.json");
                let success = await runEngineWithUrl(derivedData);
                if (!success) {
                    const derivedSecure = lecUrl.replace(/\/[^/]+\.(webm|mp4|m3u8)$/i, "/securejson.json");
                    success = await runEngineWithUrl(derivedSecure);
                }
                if (success) {
                    engineLoaded = true;
                    return true;
                }
            }

            if (!activeUid) {
                console.warn("[Engine] No lecture UID available to load.");
                setStatus("standby", "STANDBY");
                return false;
            }

            return await loadLectureByUid(activeUid);
        }

        const KEY_MAP_REV = {
            ["_k1"]: "c_id", ["_k2"]: "p_time", ["_k3"]: "plugin", ["_k4"]: "data", ["_k5"]: "id", ["_k6"]: "ct"
        };
        const PLUGIN_MAP_REV = {
            ["_p1"]: "dcn", ["_p2"]: "cw", ["_p3"]: "mcn", ["_p4"]: "pl"
        };
        const EVENT_MAP_REV = {
            ["009A"]: "sc", ["002F"]: "as", ["005B"]: "sbc", ["004E"]: "ea", ["007B"]: "cc", ["003A"]: "mc",
            ["006C"]: "pstc", ["008D"]: "estc", ["001C"]: "pn", ["002E"]: "zm", ["003E"]: "rs", ["004C"]: "pg",
            ["005C"]: "ss", ["006A"]: "gsrn", ["001F"]: "d", ["002B"]: "m", ["003C"]: "u", ["004F"]: "p",
            ["005E"]: "dlos", ["007C"]: "un", ["008E"]: "cio", ["009F"]: "tf", ["001A"]: "pdo", ["002A"]: "pdo2",
            ["004D"]: "cle", ["004B"]: "cs", ["005F"]: "el", ["006F"]: "cfg"
        };

        function deobfuscateNode(node) {
            if (Array.isArray(node)) {
                return node.map(deobfuscateNode);
            } else if (node && typeof node === "object") {
                const newObj = {};
                for (const k in node) {
                    if (Object.prototype.hasOwnProperty.call(node, k)) {
                        const newKey = KEY_MAP_REV[k] || k;
                        let newVal = node[k];
                        if (newKey === "plugin" && typeof newVal === "string") {
                            newVal = PLUGIN_MAP_REV[newVal] || newVal;
                        } else if (newKey === "e" && typeof newVal === "string") {
                            newVal = EVENT_MAP_REV[newVal] || newVal;
                        } else {
                            newVal = deobfuscateNode(newVal);
                        }
                        newObj[newKey] = newVal;
                    }
                }
                return newObj;
            }
            return node;
        }

        async function processData(raw, startSec = 0) {
            ptrStreamIdx = 0;
            console.log("[Data] Deobfuscating telemetry headers...");
            raw = deobfuscateNode(raw);
            let flat = [];

            const deepExtract = (d) => {
                if (!d || typeof d !== "object") return;
                if (Array.isArray(d)) {
                    if (d.length > 0 && typeof d[0] === "object" && (d[0].p_time != null || d[0].plugin || d[0].type || d[0].t != null)) {
                        flat.push(...d); return;
                    }
                    d.forEach(deepExtract); return;
                }
                if (Array.isArray(d.data)) { deepExtract(d.data); return; }
                if (Array.isArray(d.events)) { deepExtract(d.events); return; }
                if (d.payload && Array.isArray(d.payload.data)) { deepExtract(d.payload.data); return; }
                for (const key in d) {
                    if (Object.prototype.hasOwnProperty.call(d, key)) deepExtract(d[key]);
                }
            };

            deepExtract(raw);
            if (flat.length === 0) {
                if (Array.isArray(raw)) flat = raw;
                else flat = [raw];
            }

            flat.forEach((ev, i) => ev._origIdx = i);

            let minP = Infinity, maxP = -Infinity;
            flat.forEach(e => {
                const d = e.data || {};
                let p = e.p_time ?? d.p_time ?? e.t ?? d.t ?? e.ts;
                if (p == null && e.payload) p = e.payload.p_time ?? e.payload.t;
                if (p != null) {
                    const val = Number(p); e._pVal = val;
                    if (val < minP) minP = val;
                    if (val > maxP) maxP = val;
                } else {
                    e._pVal = 0;
                }
            });

            let timeFactor = 1;
            if (maxP !== -Infinity) {
                if (maxP > 1e14) timeFactor = 1;
                else if (maxP > 1e11) timeFactor = 1000;
                else if (maxP > 1e8) timeFactor = 1;
                else if (maxP > 1e5) timeFactor = 1000;
                else timeFactor = 1000000;
            }

            const getT = (ev) => ev._pVal * timeFactor;

            flat.sort((a, b) => {
                const tA = getT(a), tB = getT(b);
                if (Math.abs(tA - tB) > 0.001) return tA - tB;
                return a._origIdx - b._origIdx;
            });

            const finalGetT = (ev) => getT(ev);

            for (const ev of flat) {
                const d = ev.data || {};
                const p = ev.p_time ?? d.p_time;
                if (ev.plugin === "mcn" && d.e === "cp" && d.ct > 0 && p != null) {
                    const pMs = (Number(p) * timeFactor) / 1000;
                    recordStartMs = d.ct - pMs;
                    break;
                }
            }

            assetMap = {};
            finalSlideList = [{ url: '', bc: "#111118", _sid: "init" }];
            const rawAs = [];
            const seenUids = new Set();
            for (const ev of flat) {
                const t = finalGetT(ev);
                const d = ev.data || {};
                const processAs = (as) => {
                    const uid = as.uid || `${as.u}_${t}`;
                    if (seenUids.has(uid)) return;
                    seenUids.add(uid);
                    const item = { url: as.u || '', bc: as.bc || as.backgroundColor || "#111118", bg: as.bg || '', i: (as.i != null) ? parseInt(as.i) : -1, t, pg: getPdfPage(as.u || ''), _sid: uid };
                    rawAs.push(item);
                    assetMap[uid] = { url: item.url, bc: item.bc, bg: item.bg };
                };
                if (ev.plugin === "dcn" && d.e === "as") processAs(d);
                if (ev.plugin === "dcn" && d.e === "sc" && d.s && typeof d.s === "object" && (d.s.e === "as" || d.s.u)) processAs(d.s);
            }
            assetMap["init"] = { url: '', bc: "#111118", bg: '' };

            const blocks = [];
            for (const cur of rawAs) {
                if (blocks.length > 0 && blocks[blocks.length - 1].i === cur.i) blocks[blocks.length - 1].items.push(cur);
                else blocks.push({ i: cur.i, items: [cur] });
            }
            for (const block of blocks) {
                block.items.sort((a, b) => (a.pg !== null && b.pg !== null) ? a.pg - b.pg : a.t - b.t);
                const spliceIdx = block.i === -1 ? finalSlideList.length : block.i;
                while (finalSlideList.length < spliceIdx) finalSlideList.push({ url: '', bc: "#111118", _sid: "placeholder" });
                finalSlideList.splice(spliceIdx, 0, ...block.items);
            }
            slideRegistry = {};
            finalSlideList.forEach((s, idx) => { slideRegistry[idx] = s; });
            slideSeqs = Object.keys(slideRegistry).map(Number).sort((a, b) => a - b);

            const liveSlideList = [{ _sid: "init" }];
            const eventSids = new Map();
            let activeLiveIdx = 0;

            for (let i = 0; i < flat.length; i++) {
                const ev = flat[i], d = ev.data || {};
                const t = finalGetT(ev);
                if (ev.plugin === "dcn" && d.e === "as") {
                    const batch = []; let j = i;
                    while (j < flat.length && flat[j].plugin === "dcn" && flat[j].data.e === "as" && finalGetT(flat[j]) === t) {
                        const batchD = flat[j].data;
                        batch.push({ _sid: batchD.uid || `${batchD.u}_${finalGetT(flat[j])}` }); j++;
                    }
                    const idx = (d.i != null) ? parseInt(d.i) : liveSlideList.length;
                    while (liveSlideList.length < idx) liveSlideList.push({ _sid: `gap_${liveSlideList.length}` });
                    liveSlideList.splice(idx, 0, ...batch);
                    if (idx <= activeLiveIdx) activeLiveIdx += batch.length;
                    i = j - 1;
                } else if (ev.plugin === "dcn" && d.e === "sc") {
                    if (d.s && typeof d.s === "object") {
                        const sid = d.s.uid || `${d.s.u}_${t}`;
                        const fIdx = liveSlideList.findIndex(x => x._sid === sid);
                        if (fIdx !== -1) activeLiveIdx = fIdx;
                        else { activeLiveIdx = liveSlideList.length; liveSlideList.push({ _sid: sid }); }
                    } else if (typeof d.s === "number") {
                        activeLiveIdx = d.s;
                        while (liveSlideList.length <= activeLiveIdx) liveSlideList.push({ _sid: `jump_${liveSlideList.length}` });
                    }
                }
                const curItem = liveSlideList[activeLiveIdx] || liveSlideList[0];
                eventSids.set(ev, curItem._sid || "init");
            }

            allEvents = [];
            completedStrokes = [];
            strokesBySid = new Map();
            eventsBySid = new Map();

            eraseLog = [];
            undoneOids = new Map();
            tempHighlightStrokes = [];
            let penColor = "#ffff00", penMode = "marker", penSize = 2, erasSize = 10;
            let currentUslUrl = null;
            const strokeMap = new Map();
            const objectPool = new Map();
            const pdoMemory = new Map();

            let loopCounter = 0;
            let lastYieldTs = performance.now();
            for (const ev of flat) {
                loopCounter++;
                if (loopCounter % 2000 === 0 && (performance.now() - lastYieldTs > 14)) {
                    window.updateSplash(`Processing Telemetry Data...`, 48 + (loopCounter / flat.length * 48));
                    await new Promise(r => requestAnimationFrame(r));
                    lastYieldTs = performance.now();
                }

                const t = finalGetT(ev);
                const sid = eventSids.get(ev) || "init";
                const d = ev.data || {};
                const inner = d.data || d;

                if (ev.plugin === "dcn") {
                    switch (d.e) {
                        case "sc": {
                            const asset = assetMap[sid] || { url: '', bc: "#111118", bg: '' };
                            allEvents.push({ t, type: "slide", sid, url: asset.url, bc: asset.bc, bg: asset.bg, raw: ev });
                            break;
                        }
                        case "sbc": allEvents.push({ t, type: "bg", color: d.c || d.bc || "#111118", bg: d.bg || '' }); break;
                        case "ea": eraseLog.push({ t, sid }); allEvents.push({ t, type: "erase_all", sid }); break;
                        case "cc": penColor = d.c || penColor; allEvents.push({ t, type: "color", color: penColor }); break;
                        case "mc":
                            let m = d.m || penMode;
                            let uslUrl = null;
                            if (m === "shape" && d.v) {
                                const url = d.v.toLowerCase();
                                if (url.includes("convex_lens")) m = "convexlens";
                                else if (url.includes("concave_lens")) m = "concavelens";
                                else if (url.includes("concave_mirror")) m = "concavemirror";
                                else if (url.includes("convex_mirror")) m = "convexmirror";
                            }
                            if (d.v2) { uslUrl = d.v2; fetchUsl(uslUrl); }
                            penMode = m; currentUslUrl = uslUrl;
                            allEvents.push({ t, type: "mode", mode: penMode, uslUrl: currentUslUrl });
                            break;
                        case "pstc": penSize = Number(d.s) || penSize; allEvents.push({ t, type: "pen_size", size: penSize }); break;
                        case "estc": erasSize = Number(d.s) || erasSize; allEvents.push({ t, type: "eraser_size", size: erasSize }); break;
                        case "pn": allEvents.push({ t, type: "pn", v: d.v || { x: 0, y: 0 } }); break;
                        case "zm": allEvents.push({ t, type: "zm", v: d.v || 1 }); break;
                        case "rs": allEvents.push({ t, type: "rotate_slide", v: d.v }); break;
                        case "pg": allEvents.push({ t, type: "play_gif", src: d.v }); break;
                        case "ss": allEvents.push({ t, type: "share_screen", value: d.v }); break;
                        case "gsrn": allEvents.push({ t, type: "green_screen", value: d.v }); break;
                    }
                } else if (ev.plugin === "cw") {
                    const cwId = d.id;
                    const isEr = (penMode === "eraser" || penMode === "object-eraser" || penMode === "object_eraser");
                    const isValidPt = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
                    const isOrigin = (p) => Math.abs(p.x) < 0.0001 && Math.abs(p.y) < 0.0001;

                    if ((inner.e === "d" || (inner.e === "p" && !strokeMap.has(cwId))) && isValidPt(inner.p)) {
                        if (strokeMap.has(cwId)) {
                            const old = strokeMap.get(cwId);
                            if (old.isTempHL) { tempHighlightStrokes.push(old); }
                            else {
                                pushCompletedStroke(old);
                                allEvents.push({ t: t - 1, type: "stroke_up", cwId, pt: old.pts[old.pts.length - 1], sid: old.sid, strokeRef: old });
                            }
                        }

                        if (isOrigin(inner.p)) {
                            strokeMap.delete(cwId);
                        } else {
                            const m = penMode ? penMode.toLowerCase() : '';
                            const isTempHL = (m === "highlighter" || m === "laser");
                            const isPermHL = (m === "marker_highlighter" || m === "markerhighlighter" || m === "permanent_highlighter" || (m.includes("high") && m !== "highlighter" && m !== "laser"));

                            let sColor = isEr ? "#000" : penColor;
                            if (isPermHL && sColor.length > 7) {
                                sColor = sColor.substring(0, 7);
                            }

                            const stroke = {
                                id: cwId, sid, oid: inner.p.oid, color: sColor,
                                mode: penMode, uslUrl: currentUslUrl, th: isEr ? erasSize : penSize,
                                isErase: isEr, isHighlight: isTempHL || isPermHL, isTempHL, isPermHL,
                                t_start: t, pts: [{ x: inner.p.x, y: inner.p.y, t }],
                                dash: inner.p.d ? inner.p.d.split(" ").map(Number) : []
                            };
                            strokeMap.set(cwId, stroke);
                            if (stroke.oid) objectPool.set(stroke.oid, stroke);
                            allEvents.push({ t, type: "stroke_down", cwId, pt: inner.p, ...stroke });
                        }
                    } else if ((inner.e === "m" || inner.e === "u") && isValidPt(inner.p)) {
                        let stroke = strokeMap.get(cwId);
                        if (stroke) {
                            const last = stroke.pts[stroke.pts.length - 1];
                            const dist = Math.sqrt(Math.pow(inner.p.x - last.x, 2) + Math.pow(inner.p.y - last.y, 2));

                            if (dist > 0.45 || isOrigin(inner.p)) {
                                if (stroke.isTempHL) { tempHighlightStrokes.push(stroke); }
                                else {
                                    pushCompletedStroke(stroke);
                                    allEvents.push({ t: t - 1, type: "stroke_up", cwId, pt: last, sid: stroke.sid, strokeRef: stroke });
                                }
                                strokeMap.delete(cwId);

                                if (inner.e === "m" && !isOrigin(inner.p)) {
                                    const newStroke = { ...stroke, t_start: t, pts: [{ x: inner.p.x, y: inner.p.y, t }] };
                                    strokeMap.set(cwId, newStroke);
                                    allEvents.push({ t, type: "stroke_down", cwId, pt: inner.p, ...newStroke });
                                }
                            } else {
                                stroke.pts.push({ x: inner.p.x, y: inner.p.y, t });
                                allEvents.push({ t, type: inner.e === "m" ? "stroke_move" : "stroke_up", cwId, pt: inner.p });
                                if (inner.e === "u") {
                                    if (stroke.isTempHL) tempHighlightStrokes.push(stroke);
                                    else pushCompletedStroke(stroke);

                                    strokeMap.delete(cwId);
                                    allEvents.push({ t, type: "stroke_up", cwId, pt: inner.p, sid, strokeRef: stroke });
                                }
                            }
                        }
                    } else if (inner.e === "dlos" && inner.ids) {
                        allEvents.push({ t, type: "delete_objects", sid, oids: inner.ids });
                    } else if (inner.e === "p" && isValidPt(inner.p)) {
                        allEvents.push({ t, type: "pointer", x: inner.p.x, y: inner.p.y });
                    } else if (inner.e === "un") {
                        allEvents.push({ t, type: "undo", sid });
                    } else if (inner.e === "cio") {
                        allEvents.push({ t, type: "create_image", sid, objectId: inner.id, imgUrl: inner.url, bounds: inner.b });
                    } else if (inner.e === "tf") {
                        allEvents.push({ t, type: "transform", sid, payload: inner });
                    } else if (inner.e === "pdo" || inner.e === "pdo2") {
                        const path = inner.path || {};
                        const objects = Array.isArray(inner.v) ? inner.v : [];
                        objects.forEach(obj => { if (obj.id) pdoMemory.set(obj.id, obj); });

                        let toPaste = [];
                        if (objects.length > 0) {
                            toPaste = objects;
                        } else {
                            const copyIds = path.copyId ? [path.copyId] : (path.copyIds || inner.ids || []);
                            copyIds.forEach(cid => {
                                const src = objectPool.get(cid) || pdoMemory.get(cid);
                                if (src) {
                                    const sx = path.sx ?? 1, sy = path.sy ?? 1;
                                    const dx = path.dx ?? 0, dy = path.dy ?? 0;
                                    const rv = path.rotationVals || {};
                                    const angle = rv.totalAngle || 0;
                                    const px = rv.x || 0, py = rv.y || 0;

                                    const newPts = src.pts.map(p => {
                                        let nx = p.x * sx + dx;
                                        let ny = p.y * sy + dy;
                                        if (angle !== 0) {
                                            const rad = (angle * Math.PI) / 180;
                                            const cos = Math.cos(rad), sin = Math.sin(rad);
                                            const rx = cos * (nx - px) - sin * (ny - py) + px;
                                            const ry = sin * (nx - px) + cos * (ny - py) + py;
                                            nx = rx; ny = ry;
                                        }
                                        return { ...p, x: nx, y: ny, t: t };
                                    });

                                    toPaste.push({
                                        ...src,
                                        pts: newPts,
                                        oid: path.pasteId || `${cid}_p_${t}`,
                                        th: path.strokeSize || src.th,
                                        is_processed: true
                                    });
                                }
                            });
                        }

                        if (Array.isArray(path.eraserPaths)) {
                            path.eraserPaths.forEach(ep => {
                                const srcEraser = objectPool.get(ep.id) || pdoMemory.get(ep.id);
                                if (srcEraser) {
                                    const clonedEraser = {
                                        ...srcEraser,
                                        oid: ep.cloneId || `${ep.id}_c_${t}`,
                                        t_start: t,
                                        pts: srcEraser.pts.map(p => ({ ...p, t: t }))
                                    };
                                    if (clonedEraser.isTempHL) tempHighlightStrokes.push(clonedEraser);
                                    else pushCompletedStroke(clonedEraser);
                                    if (clonedEraser.oid) objectPool.set(clonedEraser.oid, clonedEraser);
                                }
                            });
                        }

                        toPaste.forEach(obj => {
                            let s;
                            if (obj.is_processed) {
                                s = { ...obj, sid, t_start: t };
                                delete s.is_processed;
                            } else {
                                const isEr = (obj.m === "eraser");
                                const m = (obj.m || penMode || '').toLowerCase();
                                const isTempHL = (m === "highlighter" || m === "laser");
                                const isPermHL = (m === "marker_highlighter" || m === "markerhighlighter" || m === "permanent_highlighter" || (m.includes("high") && m !== "highlighter" && m !== "laser"));
                                let uslUrl = obj.v2 || null, mode = obj.m || penMode;
                                if (mode === "shape" && obj.v) {
                                    const url = obj.v.toLowerCase();
                                    if (url.includes("convex_lens")) mode = "convexlens";
                                    else if (url.includes("concave_lens")) mode = "concavelens";
                                    else if (url.includes("concave_mirror")) mode = "concavemirror";
                                    else if (url.includes("convex_mirror")) mode = "convexmirror";
                                }

                                let sColor = isEr ? "#000" : (obj.c || penColor);
                                if (isPermHL && sColor.length > 7) {
                                    sColor = sColor.substring(0, 7);
                                }

                                s = {
                                    id: obj.id || (Math.random() + t), sid, oid: obj.oid || obj.id,
                                    color: sColor, mode: mode,
                                    th: obj.s || (isEr ? erasSize : penSize),
                                    isErase: isEr, isHighlight: isTempHL || isPermHL, isTempHL,
                                    t_start: t, pts: (obj.p || []).map(pt => ({ x: pt.x, y: pt.y, t: t })),
                                    uslUrl, dash: obj.d ? obj.d.split(" ").map(Number) : []
                                };
                            }
                            if (s.pts.length > 0) {
                                if (s.isTempHL) { tempHighlightStrokes.push(s); }
                                else { pushCompletedStroke(s); }
                                if (s.oid) objectPool.set(s.oid, s);
                                if (s.uslUrl) fetchUsl(s.uslUrl);
                            }
                        });
                        allEvents.push({ t, type: "paste_objects", sid, data: inner });
                    }
                } else if (ev.plugin === "pl") {
                    allEvents.push({ t, type: "poll", pollEvType: d.e, data: d });
                } else if (ev.plugin === "mcn") {
                    switch (d.e || d.data?.e) {
                        case "cle": allEvents.push({ t, type: "class_end" }); break;
                        case "cs": allEvents.push({ t, type: "camera_switch", value: d.v || d.data?.v }); break;
                        case "el": allEvents.push({ t, type: "educator_align", value: d.alignment || d.data?.alignment }); break;
                        case "ss": allEvents.push({ t, type: "share_screen", value: d.v || d.data?.v }); break;
                        case "cfg": allEvents.push({ t, type: "class_config", value: d.v || d.data?.v }); break;
                    }
                }
            }

            allEvents.sort((a, b) => a.t - b.t);

            eventsBySid = new Map();
            for (let eIdx = 0; eIdx < allEvents.length; eIdx++) {
                const ev = allEvents[eIdx];
                if (ev.sid) {
                    let list = eventsBySid.get(ev.sid);
                    if (!list) { list = []; eventsBySid.set(ev.sid, list); }
                    list.push(ev);
                }
            }

            const hStack = [];
            allEvents.forEach(ev => {
                if (ev.type === "stroke_up" || ev.type === "delete_objects" || ev.type === "erase_all") {
                    hStack.push(ev);
                } else if (ev.type === "undo") {
                    if (hStack.length > 0) {
                        const target = hStack.pop();
                        target.isUndone = true;
                    }
                }
            });

            eraseLog = allEvents.filter(ev => ev.type === "erase_all").map(ev => ({ sid: ev.sid, t: ev.t }));
            pointerStream = allEvents.filter(ev => ["pointer", "stroke_down", "stroke_move", "stroke_up"].includes(ev.type))
                .map(ev => ({ t: ev.t, x: ev.type === "pointer" ? ev.x : ev.pt.x, y: ev.type === "pointer" ? ev.y : ev.pt.y }));

            snapshots = [];
            let curSnapshotState = { sid: "init", slideUrl: '', bgColor: "#111118", bgImageUrl: '', color: "#ffff00", mode: "marker", penSize: 2, eraserSize: 10, panX: 0, panY: 0, zoom: 1, rotation: 0, gifUrl: '', screenShare: false };
            let nextSnap = 0;
            const SNAP_INTERVAL = 2500000; // 2.5 seconds keyframe density for instant seek response
            const maxDuration = allEvents.length ? allEvents[allEvents.length - 1].t : 0;
            for (let i = 0; i < allEvents.length; i++) {
                const e = allEvents[i];
                while (e.t >= nextSnap && nextSnap <= maxDuration + SNAP_INTERVAL) {
                    snapshots.push({ t: nextSnap, evIdx: i, state: { ...curSnapshotState } });
                    nextSnap += SNAP_INTERVAL;
                }
                if (e.type === "slide") { curSnapshotState.sid = e.sid; curSnapshotState.slideUrl = e.url; curSnapshotState.bgColor = e.bc; curSnapshotState.bgImageUrl = e.bg; curSnapshotState.rotation = 0; curSnapshotState.gifUrl = ''; }
                else if (e.type === "bg") { curSnapshotState.bgColor = e.color; curSnapshotState.bgImageUrl = e.bg; }
                else if (e.type === "pn") { curSnapshotState.panX = e.v.x; curSnapshotState.panY = e.v.y; }
                else if (e.type === "zm") curSnapshotState.zoom = e.v;
                else if (e.type === "rotate_slide") curSnapshotState.rotation = e.v || 0;
                else if (e.type === "play_gif") curSnapshotState.gifUrl = e.src || '';
                else if (e.type === "share_screen") curSnapshotState.screenShare = !!e.value;
            }
            if (!snapshots.length) snapshots.push({ t: 0, evIdx: 0, state: { ...curSnapshotState } });
            preloadSlides();

            seekBar.max = maxDuration;
            tTotal.textContent = fmt(maxDuration / 1e6);
            buildChapterMarks();
            renderSlideNav();
            engineLoaded = true;

            const fsIdx = slideSeqs.length ? slideSeqs[0] : 0;
            const fs = slideRegistry[fsIdx] || { url: '', bc: "#111118" };
            curSlideIdx = fsIdx; curSlideUrl = fs.url; curBgColor = fs.bc;
            if (startSec > 0) {
                console.log(`[Player] processData seeking to startSec: ${startSec}s`);
                doSeek(startSec * 1e6);
            } else {
                doSeek(0);
            }
        }

        function getInterpolatedPointer(targetUs) {
            if (!pointerStream.length) return null;
            while (ptrStreamIdx < pointerStream.length - 1 && pointerStream[ptrStreamIdx + 1].t < targetUs) ptrStreamIdx++;
            while (ptrStreamIdx > 0 && pointerStream[ptrStreamIdx].t > targetUs) ptrStreamIdx--;
            const p0 = pointerStream[ptrStreamIdx];
            if (targetUs < p0.t) return null;
            if (ptrStreamIdx === pointerStream.length - 1 || targetUs > p0.t + POINTER_HIDE_US) return (targetUs - p0.t <= POINTER_HIDE_US) ? p0 : null;
            const p1 = pointerStream[ptrStreamIdx + 1];
            const ratio = (targetUs - p0.t) / (p1.t - p0.t);
            return { t: targetUs, x: p0.x + (p1.x - p0.x) * ratio, y: p0.y + (p1.y - p0.y) * ratio };
        }

        function findClosestSnapshot(targetUs) {
            if (!snapshots || snapshots.length === 0) {
                return { t: 0, evIdx: 0, state: { sid: "init", slideUrl: '', bgColor: "#111118", bgImageUrl: '', color: "#ffff00", mode: "marker", penSize: 2, eraserSize: 10, panX: 0, panY: 0, zoom: 1, rotation: 0, gifUrl: '', screenShare: false } };
            }
            let low = 0, high = snapshots.length - 1;
            let best = 0;
            while (low <= high) {
                const mid = (low + high) >>> 1;
                if (snapshots[mid].t <= targetUs) {
                    best = mid;
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }
            return snapshots[best];
        }

        function doSeek(targetVideoUs) {
            const targetUs = drawingUs(targetVideoUs);
            const snap = findClosestSnapshot(targetUs);

            curSid = snap.state.sid; curSlideUrl = snap.state.slideUrl; curBgColor = snap.state.bgColor; curBgImageUrl = snap.state.bgImageUrl || '';
            curColor = snap.state.color; curMode = snap.state.mode; curPenSize = snap.state.penSize; curEraserSize = snap.state.eraserSize;
            curPanX = snap.state.panX; curPanY = snap.state.panY; curZoom = snap.state.zoom;
            curSlideRotation = snap.state.rotation || 0;
            curGifUrl = snap.state.gifUrl || '';
            curScreenShare = snap.state.screenShare || false;
            evIdx = snap.evIdx;

            activeStrokes.clear(); latestTempHLcwId = null; lastPollUid = null; activePollEvent = null;

            while (evIdx < allEvents.length) {
                const ev = allEvents[evIdx]; if (ev.t > targetUs) break;
                evIdx++;
                switch (ev.type) {
                    case "slide": curSid = ev.sid; curSlideUrl = ev.url || ''; curBgColor = ev.bc || curBgColor; curBgImageUrl = ev.bg || ''; break;
                    case "bg": curBgColor = ev.color; curBgImageUrl = ev.bg || ''; break;
                    case "color": curColor = ev.color; break;
                    case "mode": curMode = ev.mode; break;
                    case "pen_size": curPenSize = ev.size; break;
                    case "eraser_size": curEraserSize = ev.size; break;
                    case "pn": curPanX = ev.v.x || 0; curPanY = ev.v.y || 0; break;
                    case "zm": curZoom = ev.v || 1; break;
                    case "reset": curSid = "init"; curSlideUrl = ''; curBgColor = "#111118"; curBgImageUrl = ''; break;
                    case "stroke_down":
                        activeStrokes.set(ev.cwId, { ...ev, pts: [ev.pt] });
                        if (ev.isTempHL) latestTempHLcwId = ev.cwId;
                        break;
                    case "stroke_move": if (activeStrokes.has(ev.cwId)) activeStrokes.get(ev.cwId).pts.push(ev.pt); break;
                    case "stroke_up":
                        if (activeStrokes.has(ev.cwId)) {
                            activeStrokes.get(ev.cwId).pts.push(ev.pt);
                            activeStrokes.delete(ev.cwId);
                            if (ev.cwId === latestTempHLcwId) latestTempHLcwId = null;
                        }
                        break;
                    case "erase_all": if (ev.sid === curSid) activeStrokes.clear(); break;
                    case "rotate_slide": curSlideRotation = ev.v || 0; break;
                    case "play_gif": curGifUrl = ev.src || ''; break;
                    case "share_screen": curScreenShare = !!ev.value; break;
                }
            }
            const fItem = finalSlideList.find(s => s._sid === curSid);
            if (fItem) curSlideIdx = finalSlideList.indexOf(fItem);

            const p = getInterpolatedPointer(targetUs);
            if (p) {
                const projected = projectBoardPoint(p.x * CW, p.y * CH);
                ptrX = projected.x - 3; ptrY = projected.y - 3;
                pointerDot.style.transform = `translate3d(${ptrX}px,${ptrY}px,0)`;
                pointerDot.style.opacity = "1";
            }
            else { pointerDot.style.opacity = "0"; }
            if (pageIndicator) { const pg = getPdfPage(curSlideUrl); pageIndicator.textContent = pg ? `Slide ${curSlideIdx + 1} (Page ${pg})` : `Slide ${curSlideIdx + 1}`; }
            updateSlideNavUI();

            let latestPoll = null; for (let i = evIdx - 1; i >= 0; i--) { if (allEvents[i].type === "poll") { latestPoll = allEvents[i]; break; } }
            if (latestPoll && (targetUs - latestPoll.t) <= 20000000) { renderPollEvent(latestPoll); activePollEvent = latestPoll; } else { pollPanel.classList.remove("show"); }
            paintBackground(true); replayStrokes(targetUs);
        }

        function updateSlideNavUI() {
            document.querySelectorAll(".slide-thumb").forEach(t => t.classList.remove("active"));
            const active = $(`thumb-${curSlideIdx}`);
            if (active) {
                active.classList.add("active");
                active.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        }

        function renderSlideNav() {
            const nav = $("slide-nav"); if (!nav) return; nav.innerHTML = '';
            slideSeqs.forEach(seq => {
                const s = slideRegistry[seq]; if (!s) return;
                const row = document.createElement("div"); row.className = "slide-row";

                const idxLabel = document.createElement("div");
                idxLabel.className = "slide-index";
                idxLabel.textContent = seq;

                const thumb = document.createElement("div"); thumb.className = "slide-thumb"; thumb.id = `thumb-${seq}`;
                thumb.onclick = () => {
                    let ev = null;
                    const targetSid = s._sid;
                    for (let i = 0; i < allEvents.length; i++) {
                        if (allEvents[i].type === "slide") {
                            if (allEvents[i].seq === seq || allEvents[i].sid === targetSid) {
                                ev = allEvents[i]; break;
                            }
                        }
                    }
                    if (ev) {
                        seekToSec((ev.t - drawOffset) / 1e6);
                    }
                };
                if (s.url) {
                    const img = document.createElement("img"); img.referrerPolicy = "no-referrer"; img.src = s.url; img.loading = "lazy";
                    thumb.appendChild(img);
                } else {
                    thumb.classList.add("empty-slide");
                    thumb.innerHTML = `<div class="empty-slide-inner"><i class="fas fa-edit"></i> <span>Blank</span></div>`;
                }
                row.appendChild(idxLabel); row.appendChild(thumb); nav.appendChild(row);
            });
        }

        function tickDraw(targetVideoUs) {
            const targetUs = drawingUs(targetVideoUs);
            let bgChanged = false;
            let needsRedraw = false;

            while (evIdx < allEvents.length) {
                const ev = allEvents[evIdx]; if (ev.t > targetUs) break;
                evIdx++;
                switch (ev.type) {
                    case "slide":
                        if (curSid !== ev.sid || curSlideUrl !== (ev.url || '') || curBgColor !== (ev.bc || curBgColor) || curBgImageUrl !== (ev.bg || '')) {
                            curSid = ev.sid; curSlideUrl = ev.url || ''; curBgColor = ev.bc || curBgColor; curBgImageUrl = ev.bg || '';
                            curSlideRotation = 0; curGifUrl = '';
                            bgChanged = true; needsRedraw = true;
                            drawCtx.clearRect(0, 0, CW, CH); penCtx.clearRect(0, 0, CW, CH); eraserCtx.clearRect(0, 0, CW, CH); hlCtx.clearRect(0, 0, CW, CH); activeStrokes.clear();
                            const fItem = finalSlideList.find(s => s._sid === curSid);
                            if (fItem) curSlideIdx = finalSlideList.indexOf(fItem);
                            if (pageIndicator) { const pg = getPdfPage(curSlideUrl); pageIndicator.textContent = pg ? `Slide ${curSlideIdx + 1} (Page ${pg})` : `Slide ${curSlideIdx + 1}`; }
                            updateSlideNavUI();
                        }
                        break;
                    case "bg": if (curBgColor !== ev.color || curBgImageUrl !== (ev.bg || '')) { curBgColor = ev.color; curBgImageUrl = ev.bg || ''; bgChanged = true; } break;
                    case "erase_all": if (ev.sid === curSid) { drawCtx.clearRect(0, 0, CW, CH); penCtx.clearRect(0, 0, CW, CH); eraserCtx.clearRect(0, 0, CW, CH); hlCtx.clearRect(0, 0, CW, CH); activeStrokes.clear(); needsRedraw = true; } break;
                    case "delete_objects": if (ev.sid === curSid) { needsRedraw = true; } break;
                    case "color": curColor = ev.color; break;
                    case "mode": curMode = ev.mode; break;
                    case "pen_size": curPenSize = ev.size; break;
                    case "eraser_size": curEraserSize = ev.size; break;
                    case "reset": curSid = "init"; curSlideIdx = 0; curSlideUrl = ''; curBgColor = "#111118"; curBgImageUrl = ''; bgChanged = true; needsRedraw = true; drawCtx.clearRect(0, 0, CW, CH); penCtx.clearRect(0, 0, CW, CH); eraserCtx.clearRect(0, 0, CW, CH); hlCtx.clearRect(0, 0, CW, CH); activeStrokes.clear(); break;

                    case "stroke_down": {
                        const nx = ev.pt.x * CW, ny = ev.pt.y * CH;
                        const s = {
                            sid: ev.sid, color: ev.isErase ? "#000" : ev.color, th: ev.th, isErase: ev.isErase, isHighlight: ev.isHighlight, isTempHL: ev.isTempHL,
                            lastX: nx, lastY: ny, midX: nx, midY: ny, startX: nx, startY: ny, mode: ev.mode, uslUrl: ev.uslUrl || null, pts: [{ x: ev.pt.x, y: ev.pt.y, t: ev.t }], dash: ev.dash || []
                        };

                        if (isLiveShapeMode(s.mode)) {
                            if (!isViewportDefault()) needsRedraw = true;
                            else renderLiveShapePreview(s, nx, ny);
                        } else if (!needsRedraw && isViewportDefault()) {
                            if (s.isErase) { drawDot(penCtx, s); drawDot(hlCtx, s); drawDot(drawCtx, s); drawDot(eraserCtx, s); }
                            else { if (!s.isHighlight && !s.isTempHL) drawDot(penCtx, s); }
                        }
                        activeStrokes.set(ev.cwId, s);
                        if (s.isTempHL) latestTempHLcwId = ev.cwId;
                        break;
                    }
                    case "stroke_move":
                    case "stroke_up": {
                        const s = activeStrokes.get(ev.cwId);
                        if (s) {
                            s.pts.push({ x: ev.pt.x, y: ev.pt.y, t: ev.t });
                            const nx = ev.pt.x * CW, ny = ev.pt.y * CH;
                            const isEnd = (ev.type === "stroke_up");
                            const mx = isEnd ? nx : (s.lastX + nx) / 2, my = isEnd ? ny : (s.lastY + ny) / 2;

                            const liveShape = isLiveShapeMode(s.mode);
                            if (liveShape) {
                                if (!isViewportDefault()) needsRedraw = true;
                                else renderLiveShapePreview(s, nx, ny);
                            } else if (!isViewportDefault()) {
                                needsRedraw = true;
                            } else if (!needsRedraw) {
                                if (s.isErase) { drawCurve(penCtx, s, mx, my); drawCurve(hlCtx, s, mx, my); drawCurve(drawCtx, s, mx, my); drawCurve(eraserCtx, s, mx, my); }
                                else if (s.isTempHL) needsRedraw = true;
                                else if (s.isPermHL) drawCurve(hlCtx, s, mx, my);
                                else drawCurve(penCtx, s, mx, my);
                            }
                            s.lastX = nx; s.lastY = ny; s.midX = mx; s.midY = my;
                            if (ev.type === "stroke_up") {
                                if ((s.isHighlight || s.isTempHL) && s.pts && s.pts.length === 1 && isViewportDefault()) {
                                    drawDot(s.isTempHL ? laserCtx : hlCtx, s);
                                }
                                if (liveShape && isViewportDefault()) {
                                    clearShapePreview();
                                    if (s.isTempHL) needsRedraw = true;
                                    else {
                                        const targetCtx = s.isHighlight ? hlCtx : drawCtx;
                                        targetCtx.save();
                                        drawShape(targetCtx, s, s.startX, s.startY, nx, ny);
                                        targetCtx.restore();
                                    }
                                }
                                activeStrokes.delete(ev.cwId);
                                if (ev.cwId === latestTempHLcwId) latestTempHLcwId = null;
                            }
                        }
                        break;
                    }
                    case "poll": activePollEvent = ev; renderPollEvent(ev); break;
                    case "pn": if (curPanX !== (ev.v.x || 0) || curPanY !== (ev.v.y || 0)) { curPanX = ev.v.x || 0; curPanY = ev.v.y || 0; needsRedraw = true; bgChanged = true; } break;
                    case "zm": if (curZoom !== (ev.v || 1)) { curZoom = ev.v || 1; needsRedraw = true; bgChanged = true; } break;
                    case "rotate_slide": if (curSlideRotation !== (ev.v || 0)) { curSlideRotation = ev.v || 0; bgChanged = true; } break;
                    case "play_gif": if (curGifUrl !== (ev.src || '')) { curGifUrl = ev.src || ''; bgChanged = true; } break;
                    case "share_screen": if (curScreenShare !== !!ev.value) { curScreenShare = !!ev.value; bgChanged = true; } break;
                }
            }

            const p = getInterpolatedPointer(targetUs);
            if (p) {
                const projected = projectBoardPoint(p.x * CW, p.y * CH);
                const nextPtrX = Math.round(projected.x - 3);
                const nextPtrY = Math.round(projected.y - 3);
                if (nextPtrX !== ptrX || nextPtrY !== ptrY) {
                    ptrX = nextPtrX;
                    ptrY = nextPtrY;
                    pointerDot.style.transform = `translate3d(${ptrX}px,${ptrY}px,0)`;
                }
                if (pointerDot.style.opacity !== "1") pointerDot.style.opacity = "1";
            } else if (pointerDot.style.opacity !== "0") {
                pointerDot.style.opacity = "0";
            }

            if (bgChanged) paintBackground(false);
            if (needsRedraw) replayStrokes(targetUs);
        }

        // Fast Integer IST clock (zero allocation, 0 GC churn)
        let lastIstSec = -1;
        function updateIstClockFast(wallMs) {
            if (!istClock) return;
            const totalSec = Math.floor(wallMs / 1000);
            if (totalSec === lastIstSec) return;
            lastIstSec = totalSec;
            const istSec = (totalSec + 19800) % 86400; // UTC + 5:30 = 19800 seconds
            const h = Math.floor(istSec / 3600);
            const m = Math.floor((istSec % 3600) / 60);
            const s = istSec % 60;
            const h12 = h % 12 || 12;
            const ampm = h >= 12 ? 'PM' : 'AM';
            istClock.textContent = `${h12}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s} ${ampm}`;
        }

        // Throttled time text display updater
        let lastRenderedVideoSec = -1;
        let lastRenderedAnimSec = -1;
        let lastRenderedTotalSec = -1;
        let lastRenderedPct = -1;
        let lastRenderedVpct = -1;

        function updateTimeDisplaysFast(dUs, videoCurTime, videoDuration) {
            const dSec = Math.floor(dUs / 1e6);
            if (dSec !== lastRenderedAnimSec) {
                lastRenderedAnimSec = dSec;
                const formatted = fmt(dSec);
                if (tCurr) tCurr.textContent = formatted;
                const overlayCurrentEl = $("t-curr-overlay");
                if (overlayCurrentEl) overlayCurrentEl.textContent = formatted;
            }

            if (videoCurTime !== undefined) {
                const vSec = Math.floor(videoCurTime);
                if (vSec !== lastRenderedVideoSec) {
                    lastRenderedVideoSec = vSec;
                    if (vCurr) vCurr.textContent = fmt(vSec);
                }
            }

            if (videoDuration !== undefined && videoDuration > 0) {
                const totSec = Math.floor(videoDuration);
                if (totSec !== lastRenderedTotalSec) {
                    lastRenderedTotalSec = totSec;
                    const totFormatted = fmt(totSec);
                    if (vTotal) vTotal.textContent = totFormatted;
                    if (tTotal) tTotal.textContent = totFormatted;
                    const overlayTotalEl = $("t-total-overlay");
                    if (overlayTotalEl) overlayTotalEl.textContent = totFormatted;
                }
            }
        }

        let isDraggingSeek = false;
        let throttledVideoSeekTimer = null;

        function applyDecoupledSeek(targetVideoUs, isFinalSeek = false) {
            if (!engineLoaded) return;
            const targetSec = Math.max(0, Math.min(video.duration || 1e9, targetVideoUs / 1e6));
            
            // 1. Immediately redraw whiteboard canvas with 0ms latency
            doSeek(targetVideoUs);
            
            // 2. Immediately update time display text
            updateTimeDisplaysFast(drawingUs(targetVideoUs), targetSec);

            // 3. Update seek slider progress visuals
            const masterMax = parseFloat(seekBar.max) || 1;
            const dUs = drawingUs(targetVideoUs);
            const mPct = (dUs / masterMax) * 100;
            seekBar.style.setProperty("--pct", mPct.toFixed(1) + "%");

            // 4. Decoupled video hardware decoder seeking
            if (isFinalSeek) {
                if (throttledVideoSeekTimer) {
                    clearTimeout(throttledVideoSeekTimer);
                    throttledVideoSeekTimer = null;
                }
                seekToSec(targetSec);
            } else {
                if (!throttledVideoSeekTimer) {
                    throttledVideoSeekTimer = setTimeout(() => {
                        throttledVideoSeekTimer = null;
                        if (typeof video.fastSeek === 'function') {
                            try { video.fastSeek(targetSec); } catch (e) { video.currentTime = targetSec; }
                        } else {
                            video.currentTime = targetSec;
                        }
                    }, 80);
                }
            }
        }

        // 60FPS High-Precision Sync & Render Loop
        let syncLoopRunning = false;
        function ensureSyncLoop() {
            if (!syncLoopRunning) {
                const appEl = $("app");
                if (engineLoaded && appEl && appEl.style.display !== "none") {
                    syncLoopRunning = true;
                    requestAnimationFrame(syncLoop);
                }
            }
        }
        window.startSyncLoop = ensureSyncLoop;

        function syncLoop(ts) {
            const appEl = $("app");
            if (!engineLoaded || (appEl && appEl.style.display === "none")) {
                syncLoopRunning = false;
                return;
            }
            syncLoopRunning = true;
            requestAnimationFrame(syncLoop);

            if (prevRafTs > 0) {
                fpsSamples.push(ts - prevRafTs);
                if (fpsSamples.length > 30) fpsSamples.shift();
                if (fpsSamples.length === 30) {
                    const avg = fpsSamples.reduce((a, b) => a + b, 0) / 30;
                    fpsDisp.textContent = Math.round(1000 / avg) + " fps";
                }
            }
            prevRafTs = ts;

            const vUs = curVideoUs();
            const dUs = drawingUs(vUs);
            const videoCurTime = video.currentTime;
            const videoDuration = (Number.isFinite(video.duration) && video.duration > 0) ? video.duration : (maxDuration > 0 ? maxDuration / 1e6 : 1);

            if (!isDraggingSeek) {
                const masterMax = parseFloat(seekBar.max) || 1;
                const mPct = (dUs / masterMax) * 100;
                seekBar.value = dUs;
                
                // Only update CSS property when percentage shifted significantly
                const roundedPct = Math.round(mPct * 10) / 10;
                if (roundedPct !== lastRenderedPct) {
                    lastRenderedPct = roundedPct;
                    seekBar.style.setProperty("--pct", roundedPct + "%");
                }

                const vPct = (videoCurTime / videoDuration) * 100;
                videoSeekBar.value = videoCurTime;
                videoSeekBar.max = videoDuration;
                const roundedVpct = Math.round(vPct * 10) / 10;
                if (roundedVpct !== lastRenderedVpct) {
                    lastRenderedVpct = roundedVpct;
                    videoSeekBar.style.setProperty("--vpct", roundedVpct + "%");
                }

                updateTimeDisplaysFast(dUs, videoCurTime, videoDuration);
            }

            if (!video.paused && !isSeeking && !isDraggingSeek) {
                tickDraw(vUs);
            }

            if (engineLoaded && recordStartMs > 0) {
                const wallMs = recordStartMs + (dUs / 1000);
                updateIstClockFast(wallMs);
            }
        }
        ensureSyncLoop();

        video.addEventListener("loadedmetadata", () => {
            if (Number.isFinite(video.duration) && video.duration > 0) {
                seekBar.max = Math.round(video.duration * 1e6);
                tTotal.textContent = fmt(video.duration);
                const ot = $("t-total-overlay");
                if (ot) ot.textContent = fmt(video.duration);
            } else if (maxDuration > 0) {
                seekBar.max = maxDuration;
                tTotal.textContent = fmt(maxDuration / 1e6);
                const ot = $("t-total-overlay");
                if (ot) ot.textContent = fmt(maxDuration / 1e6);
            }
            if (engineLoaded) buildChapterMarks();
        });
        video.addEventListener("play", () => {
            isSeeking = false;
            isBuffering = false;
            if (bufferingOverlay) bufferingOverlay.classList.remove("show");
            playBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg>`;
            requestWakeLock();
            showControls(true);
            updateYtCenterIcon();
            if (activeUid) saveLastWatched(activeUid, activeCourseId, video.currentTime);
        });
        video.addEventListener("pause", () => {
            playBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><polygon points="5,3 19,12 5,21"/></svg>`;
            releaseWakeLock();
            showControls(true);
            updateYtCenterIcon();
            if (activeUid) saveLastWatched(activeUid, activeCourseId, video.currentTime);
        });
        video.addEventListener("seeking", () => {
            isSeeking = true;
            if (bufferingOverlay) bufferingOverlay.classList.add("show");
        });
        video.addEventListener("seeked", () => {
            if (engineLoaded) doSeek(curVideoUs());
            if (autoResumeAfterSeek) {
                autoResumeAfterSeek = false;
                video.play().catch(() => { });
            } else {
                isSeeking = false;
                if (bufferingOverlay) bufferingOverlay.classList.remove("show");
            }
        });
        video.addEventListener("waiting", () => { 
            isBuffering = true; 
            if (bufferingOverlay) bufferingOverlay.classList.add("show"); 
        });
        video.addEventListener("playing", () => { 
            isBuffering = false; 
            isSeeking = false; 
            if (bufferingOverlay) bufferingOverlay.classList.remove("show"); 
        });
        video.addEventListener("canplay", () => {
            isBuffering = false;
            if (bufferingOverlay && !isSeeking) bufferingOverlay.classList.remove("show");
        });
        video.addEventListener("ended", () => { 
            playBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><polygon points="5,3 19,12 5,21"/></svg>`; 
            releaseWakeLock();
        });


        function renderPollEvent(latest) {
            const pd = latest.data, inner = pd.data || {};
            const uid = (pd.id || inner.id || '') + "_" + (pd.e || '');
            if (uid === lastPollUid) return;
            lastPollUid = uid; pollPanel.classList.add("show");
            const opts = Array.isArray(inner) ? inner : (inner.data || inner.options || []);
            pollQ.textContent = pd.q || inner.q || inner.question || (pd.e === "opl" ? "Poll is Live!" : "Poll Results");
            if (pd.e === "opl") {
                pollOpts.innerHTML = opts.map((o, i) => { const lbl = typeof o === "string" ? o : (o.answer || o.text || o.option || `${i + 1}`); return `<div class="poll-opt"><div class="opt-top"><span>${lbl}</span></div></div>`; }).join('');
            } else {
                pollOpts.innerHTML = opts.map((o, i) => { const lbl = typeof o === "string" ? o : (o.answer || o.text || o.option || `${i + 1}`); const pct = typeof o === "object" ? parseFloat(o.percentage || o.pct || 0) : 0; const ok = typeof o === "object" ? !!(o.isCorrect || o.correct) : false; return `<div class="poll-opt${ok ? ' correct' : ''}"><div class="opt-top"><span>${lbl}</span><strong>${Math.round(pct)}%</strong></div><div class="opt-bar"><div class="opt-fill" style="width:${Math.min(100, pct)}%"></div></div></div>`; }).join('');
            }
        }

        function buildChapterMarks() {
            if (!chapterMarks) return;
            chapterMarks.innerHTML = '';
            const totalDurationSec = (Number.isFinite(video.duration) && video.duration > 0) ? video.duration : (maxDuration > 0 ? maxDuration / 1e6 : 0);
            if (finalSlideList && finalSlideList.length > 0 && totalDurationSec > 0) {
                renderChapterMarks(finalSlideList, totalDurationSec, seekToSec);
            }
        }

        function seekToSec(sec) {
            if (!engineLoaded) return;
            if (!isSeeking) {
                autoResumeAfterSeek = !video.paused;
                if (autoResumeAfterSeek) video.pause();
            }
            isSeeking = true;
            if (bufferingOverlay) bufferingOverlay.classList.add("show");
            video.currentTime = Math.max(0, Math.min(video.duration || 1e9, sec));
        }

        // Play/Pause button controller
        let isLaunching = false;
        playBtn.addEventListener("click", async () => {
            if (isLaunching) return;
            if (!engineLoaded) {
                isLaunching = true;
                playBtn.classList.add("loading");
                try { await runEngine(); } catch (e) { console.warn("[Player] runEngine fallback triggered:", e); }
                engineLoaded = true;
                playBtn.classList.remove("loading");
                isLaunching = false;
                const sp = $("splash");
                if (sp) sp.style.display = "none";
            }
            if (video.paused) {
                video.play().catch(err => { console.error("[Player] Play error:", err); });
            } else {
                video.pause();
            }
        });

        let seekRafId = null;
        let pendingSeekAnimUs = null;

        // Fast decoupled seek bar scrubbing with RAF throttling
        seekBar.addEventListener("input", () => {
            isDraggingSeek = true;
            pendingSeekAnimUs = parseInt(seekBar.value);
            if (!seekRafId) {
                seekRafId = requestAnimationFrame(() => {
                    seekRafId = null;
                    if (pendingSeekAnimUs !== null) {
                        applyDecoupledSeek(pendingSeekAnimUs - drawOffset, false);
                    }
                });
            }
        });

        seekBar.addEventListener("change", () => {
            if (seekRafId) {
                cancelAnimationFrame(seekRafId);
                seekRafId = null;
            }
            isDraggingSeek = false;
            const targetAnimUs = parseInt(seekBar.value);
            applyDecoupledSeek(targetAnimUs - drawOffset, true);
        });

        $("rew-btn-ui").addEventListener("click", () => seekToSec(video.currentTime - 10));
        $("fwd-btn-ui").addEventListener("click", () => seekToSec(video.currentTime + 10));

        // Volume controller
        const volSlider = $("vol-slider");
        const volBtn = $("vol-btn");
        if (volSlider) {
            volSlider.addEventListener("input", () => {
                video.volume = parseFloat(volSlider.value);
                video.muted = video.volume === 0;
                updateVolIcon();
            });
        }
        if (volBtn) {
            volBtn.addEventListener("click", () => {
                video.muted = !video.muted;
                if (volSlider) volSlider.value = video.muted ? 0 : video.volume;
                updateVolIcon();
            });
        }
        function updateVolIcon() {
            if (!volBtn) return;
            const v = video.muted || video.volume === 0;
            volBtn.innerHTML = v ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><line x1="23" y1="9" x2="17" y2="15" stroke="#fff" stroke-width="2"/><line x1="17" y1="9" x2="23" y2="15" stroke="#fff" stroke-width="2"/></svg>` : (video.volume < 0.5 ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54,8.46a5,5,0,0,1,0,7.07" fill="none" stroke="#fff" stroke-width="2"/></svg>` : `<svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54,8.46a5,5,0,0,1,0,7.07" fill="none" stroke="#fff" stroke-width="2"/><path d="M19.07,4.93a10,10,0,0,1,0,14.14" fill="none" stroke="#fff" stroke-width="2"/></svg>`);
        }

        function updateSpeedUI(spd) {
            video.playbackRate = spd;
            const sel = $("speed-sel-ui");
            if (sel) sel.value = spd;
            const chips = document.querySelectorAll(".speed-chip");
            chips.forEach(c => {
                const val = parseFloat(c.getAttribute("data-speed"));
                if (val === spd) {
                    c.classList.add("active");
                } else {
                    c.classList.remove("active");
                }
            });
        }

        const speedChipsWrap = $("speed-chips-wrap");
        if (speedChipsWrap) {
            speedChipsWrap.addEventListener("click", e => {
                const chip = e.target.closest(".speed-chip");
                if (chip) {
                    const spd = parseFloat(chip.getAttribute("data-speed"));
                    if (!isNaN(spd)) updateSpeedUI(spd);
                }
            });
        }

        $("speed-sel-ui").addEventListener("change", e => {
            updateSpeedUI(parseFloat(e.target.value));
        });

        const teacherSizeWrap = $("teacher-size-wrap");
        if (teacherSizeWrap) {
            function applyTeacherSize(size) {
                const vc = $("video-circle");
                const cp = $("cam-placeholder");
                document.querySelectorAll(".teacher-size-chip").forEach(c => {
                    if (c.getAttribute("data-size") === size) c.classList.add("active");
                    else c.classList.remove("active");
                });
                if (size === "small") {
                    if (vc) vc.classList.add("small-size");
                    if (cp) cp.classList.add("small-size");
                } else {
                    if (vc) vc.classList.remove("small-size");
                    if (cp) cp.classList.remove("small-size");
                }
                if (window.repositionCam) window.repositionCam();
                if (window.resizeCanvas) window.resizeCanvas(true);
            }

            teacherSizeWrap.addEventListener("click", e => {
                const chip = e.target.closest(".teacher-size-chip");
                if (!chip) return;
                const size = chip.getAttribute("data-size");
                applyTeacherSize(size);
                try { localStorage.setItem("teacher_cam_size", size); } catch (e) {}
            });

            try {
                const savedSize = localStorage.getItem("teacher_cam_size");
                if (savedSize === "small") applyTeacherSize("small");
                else applyTeacherSize("big");
            } catch (e) {}
        }

        const settingsMenuEl = $("settings-menu");
        $("settings-btn-ui").addEventListener("click", (e) => {
            e.stopPropagation();
            settingsMenuEl.classList.toggle("show");
        });
        document.addEventListener("click", (e) => {
            if (!settingsMenuEl.contains(e.target) && e.target !== $("settings-btn-ui")) {
                settingsMenuEl.classList.remove("show");
            }
        });

        $("fs-btn-ui").addEventListener("click", () => toggleFullScreen());

        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState === 'visible' && !video.paused) {
                await requestWakeLock();
            } else if (document.visibilityState === 'hidden') {
                releaseWakeLock();
            }
        });

        const controlsOverlay = $("controls-overlay");
        let hideControlsTimer;
        let lastTouchTime = 0;

        function showControls(autohide = true) {
            if (controlsOverlay) controlsOverlay.classList.add("visible");
            const ytCenterOverlay = $("yt-center-play-overlay");
            if (ytCenterOverlay) ytCenterOverlay.classList.add("show");
            const backBtn = $("player-back-btn");
            if (backBtn) backBtn.classList.remove("fade-out");
            clearTimeout(hideControlsTimer);
            if (autohide) {
                const timeoutMs = video.paused ? 5000 : 4000;
                hideControlsTimer = setTimeout(hideControls, timeoutMs);
            }
        }

        function hideControls() {
            clearTimeout(hideControlsTimer);
            if (controlsOverlay) controlsOverlay.classList.remove("visible");
            const ytCenterOverlay = $("yt-center-play-overlay");
            if (ytCenterOverlay) ytCenterOverlay.classList.remove("show");
            const backBtn = $("player-back-btn");
            if (backBtn) backBtn.classList.add("fade-out");
        }

        // YOUTUBE PLAY/PAUSE ICON & CENTER OVERLAY SYNC
        const ytCenterOverlay = $("yt-center-play-overlay");
        const ytCenterBtn = $("yt-center-btn");
        const ytCenterIcon = $("yt-center-icon");

        function updateYtCenterIcon() {
            if (!ytCenterIcon) return;
            if (video.paused) {
                ytCenterIcon.className = "fas fa-play";
            } else {
                ytCenterIcon.className = "fas fa-pause";
            }
        }

        if (ytCenterBtn) {
            ytCenterBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (video.paused) {
                    video.play().catch(() => {});
                } else {
                    video.pause();
                }
                updateYtCenterIcon();
            });
        }

        // DOUBLE-TAP 10s REWIND / FAST-FORWARD GESTURE
        let lastTapTime = 0;
        function triggerRippleAnim(type) {
            const el = type === 'rewind' ? $("ripple-rewind") : $("ripple-forward");
            if (!el) return;
            el.classList.remove("active");
            void el.offsetWidth; // Reflow
            el.classList.add("active");
            setTimeout(() => el.classList.remove("active"), 600);
        }

        const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        let stageClickTimer = null;
        const canvasArea = $("canvas-area") || $("stage");
        if (canvasArea) {
            canvasArea.addEventListener("click", (e) => {
            const videoCircle = $("video-circle");
            const isOnControl = (controlsOverlay && controlsOverlay.contains(e.target)) || 
                                (settingsMenuEl && settingsMenuEl.contains(e.target)) || 
                                (videoCircle && videoCircle.contains(e.target)) || 
                                (ytCenterBtn && ytCenterBtn.contains(e.target));
            if (isOnControl) return;

            const now = Date.now();
            const rect = canvasArea.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const isLeftHalf = clickX < rect.width * 0.4;
            const isRightHalf = clickX > rect.width * 0.6;

            if (now - lastTapTime < 300) {
                // Double tap
                if (stageClickTimer) {
                    clearTimeout(stageClickTimer);
                    stageClickTimer = null;
                }
                if (isLeftHalf) {
                    seekToSec(Math.max(0, video.currentTime - 10));
                    triggerRippleAnim('rewind');
                } else if (isRightHalf) {
                    seekToSec(Math.min(video.duration || 0, video.currentTime + 10));
                    triggerRippleAnim('forward');
                } else {
                    toggleFullScreen();
                }
                lastTapTime = 0;
                return;
            }

            lastTapTime = now;
            stageClickTimer = setTimeout(() => {
                stageClickTimer = null;
                const controlsWereVisible = controlsOverlay.classList.contains("visible");

                if (!controlsWereVisible) {
                    // First click/tap when controls are hidden ONLY wakes up / shows controls
                    showControls(true);
                } else {
                    // Clicking on empty stage area when controls are already visible hides controls!
                    hideControls();
                }
            }, 250);
        });
        }

        let lastProgressSaveSec = 0;
        video.addEventListener("timeupdate", () => {
            const curSec = Math.floor(video.currentTime);
            if (activeUid && curSec > 0 && Math.abs(curSec - lastProgressSaveSec) >= 3) {
                lastProgressSaveSec = curSec;
                saveLastWatched(activeUid, activeCourseId, video.currentTime);
            }
        });

        window.addEventListener("beforeunload", () => {
            if (activeUid && video && video.currentTime > 0) {
                saveLastWatched(activeUid, activeCourseId, video.currentTime);
            }
        });

        showControls(true);

        // Fullscreen handles
        document.addEventListener("fullscreenchange", () => {
            const isFS = !!document.fullscreenElement;
            const fsBtnUi = $("fs-btn-ui");
            if (fsBtnUi) fsBtnUi.innerHTML = isFS ? `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#fff" stroke-width="2"><polyline points="4,14 10,14 10,20"/><polyline points="20,10 14,10 14,4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="14" y1="10" x2="21" y2="3"/></svg>` : `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#fff" stroke-width="2"><polyline points="15,3 21,3 21,9"/><polyline points="9,21 3,21 3,15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
            const vcEl = $("video-circle");
            if (!isFS) {
                try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { }
                if (vcEl) vcEl.classList.remove('fs-floating');
                if (window.positionCamDocked) window.positionCamDocked();
            } else {
                if (vcEl) vcEl.classList.add('fs-floating');
                if (window.positionCamFloating) window.positionCamFloating();
            }
            const _doResize = () => resizeCanvas(true);
            setTimeout(_doResize, 80);
            setTimeout(_doResize, 300);
        });

        async function toggleFullScreen() {
            const wasPlaying = !video.paused;
            if (wasPlaying) video.pause();
            if (bufferingOverlay) bufferingOverlay.classList.add("show");

            const snapshotTimeUs = curVideoUs();
            const vcEl = $("video-circle");
            if (vcEl) {
                vcEl.classList.add('fs-floating');
                if (window.positionCamFloating) window.positionCamFloating();
            }

            await new Promise(resolve => setTimeout(resolve, 50));

            try {
                if (!document.fullscreenElement) {
                    await document.body.requestFullscreen();
                    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock("landscape"); } catch (orientErr) { }
                } else {
                    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (orientErr) { }
                    if (document.exitFullscreen) await document.exitFullscreen();
                }
            } catch (err) {
                console.warn("Fullscreen toggle failed:", err);
            }

            setTimeout(() => {
                if (engineLoaded) doSeek(snapshotTimeUs);
                if (wasPlaying) video.play().catch(() => { });
                if (bufferingOverlay) bufferingOverlay.classList.remove("show");
            }, 650);
        }

        let mouseTimer;
        function handleActivity() {
            const appEl = $("app");
            if (!document.fullscreenElement || !appEl || appEl.style.display === "none") {
                document.body.style.cursor = "default";
                return;
            }
            document.body.style.cursor = "default";
            clearTimeout(mouseTimer);
            mouseTimer = setTimeout(() => {
                if (document.fullscreenElement && appEl && appEl.style.display !== "none") {
                    document.body.style.cursor = "none";
                }
            }, 1200);
        }
        document.addEventListener("mousemove", handleActivity);
        document.addEventListener("mousedown", handleActivity);
        document.addEventListener("keydown", handleActivity);

        // YOUTUBE KEYBOARD SHORTCUTS
        const speeds = [1, 1.25, 1.5, 1.75, 2];
        document.addEventListener("keydown", e => {
            if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
            const appEl = $("app");
            if (!appEl || appEl.style.display === "none") return;
            
            if (e.code === "Space" || e.code === "KeyK") {
                e.preventDefault();
                if (video.paused) video.play(); else video.pause();
                updateYtCenterIcon();
            } else if (e.code === "KeyJ") {
                e.preventDefault();
                seekToSec(Math.max(0, video.currentTime - 10));
                triggerRippleAnim('rewind');
            } else if (e.code === "KeyL") {
                e.preventDefault();
                seekToSec(Math.min(video.duration || 0, video.currentTime + 10));
                triggerRippleAnim('forward');
            } else if (e.code === "ArrowLeft") {
                e.preventDefault();
                if (e.shiftKey && window.prevSlide) {
                    window.prevSlide();
                } else {
                    seekToSec(Math.max(0, video.currentTime - 5));
                }
            } else if (e.code === "ArrowRight") {
                e.preventDefault();
                if (e.shiftKey && window.nextSlide) {
                    window.nextSlide();
                } else {
                    seekToSec(Math.min(video.duration || 0, video.currentTime + 5));
                }
            } else if (e.code === "ArrowUp") {
                e.preventDefault();
                video.volume = Math.min(1, video.volume + 0.1);
            } else if (e.code === "ArrowDown") {
                e.preventDefault();
                video.volume = Math.max(0, video.volume - 0.1);
            } else if (e.code === "KeyF") {
                e.preventDefault();
                toggleFullScreen();
            } else if (e.code === "KeyM") {
                e.preventDefault();
                video.muted = !video.muted;
            } else if (e.key === ">" || (e.shiftKey && e.code === "Period")) {
                e.preventDefault();
                const cur = video.playbackRate || 1;
                let idx = speeds.indexOf(cur);
                if (idx < speeds.length - 1) {
                    updateSpeedUI(speeds[idx + 1]);
                }
            } else if (e.key === "<" || (e.shiftKey && e.code === "Comma")) {
                e.preventDefault();
                const cur = video.playbackRate || 1;
                let idx = speeds.indexOf(cur);
                if (idx > 0) {
                    updateSpeedUI(speeds[idx - 1]);
                }
            }
        });

        // ══════════════════════════════════════════════════
        //  PDF NOTES CARD RENDERER
        // ══════════════════════════════════════════════════
        function renderPdfNotes(uid) {
            const pdfNav = document.getElementById('pdf-nav');
            if (!pdfNav) return;
            pdfNav.innerHTML = '';

            const localCourse = (window.LOCAL_COURSES && window.LOCAL_COURSES.find(c => c.id === activeCourseId || (c.lectures && c.lectures.some(l => l.uid === uid))));
            const activeCourse = localCourse || COURSES.find(c => c.id === activeCourseId) || COURSES.find(c => c.lectures && c.lectures.some(l => l.uid === uid)) || COURSES[0];
            const lec = (activeCourse && activeCourse.lectures) ? (activeCourse.lectures.find(l => l.uid === uid) || activeCourse.lectures[0]) : null;
            
            // 1. LOCAL DOWNLOAD MODE PDF
            if (lec && (lec.pdfFile || lec.pdfAnnoFile || lec.pdfCleanFile)) {
                let localHtml = '';
                const annoFile = lec.pdfAnnoFile || lec.pdfFile;
                const cleanFile = lec.pdfCleanFile;

                if (annoFile) {
                    const localPdfBlobUrl = URL.createObjectURL(annoFile);
                    activeBlobUrls.add(localPdfBlobUrl);
                    localHtml += `
                        <div class="pdf-card" style="border: 1px solid rgba(34,197,94,0.35); background: rgba(34,197,94,0.06);">
                            <div class="pdf-card-header">
                                <i class="fas fa-file-pdf pdf-card-icon" style="color:#22c55e;"></i>
                                <div>
                                    <div class="pdf-card-title">Annotated Notes (Local)</div>
                                    <div class="pdf-card-sub">Loaded from local disk: ${annoFile.name || 'notes_with_anno.pdf'}</div>
                                </div>
                            </div>
                            <div class="pdf-card-actions">
                                <a href="${localPdfBlobUrl}" target="_blank" class="pdf-btn anno" style="background:#22c55e;color:#09090b;font-weight:600;"><i class="fas fa-external-link-alt"></i> Open Annotated PDF</a>
                            </div>
                        </div>
                    `;
                }

                if (cleanFile && cleanFile !== annoFile) {
                    const cleanPdfBlobUrl = URL.createObjectURL(cleanFile);
                    activeBlobUrls.add(cleanPdfBlobUrl);
                    localHtml += `
                        <div class="pdf-card" style="border: 1px solid rgba(59,130,246,0.35); background: rgba(59,130,246,0.06);">
                            <div class="pdf-card-header">
                                <i class="fas fa-file-pdf pdf-card-icon" style="color:#3b82f6;"></i>
                                <div>
                                    <div class="pdf-card-title">Clean Slide Notes (Local)</div>
                                    <div class="pdf-card-sub">Loaded from local disk: ${cleanFile.name || 'notes_no_anno.pdf'}</div>
                                </div>
                            </div>
                            <div class="pdf-card-actions">
                                <a href="${cleanPdfBlobUrl}" target="_blank" class="pdf-btn clean" style="background:#3b82f6;color:#ffffff;font-weight:600;"><i class="fas fa-external-link-alt"></i> Open Clean PDF</a>
                            </div>
                        </div>
                    `;
                }

                pdfNav.innerHTML = localHtml;
                return;
            }

            // 2. REMOTE STREAMING MODE PDF
            let withAnnoUrl = (lec && lec.pdfUrl) ? lec.pdfUrl : null;
            let noAnnoUrl = (lec && lec.pdfCleanUrl) ? lec.pdfCleanUrl : null;

            if (!withAnnoUrl) {
                const titleSlug = ((lec && lec.title) || "Lecture_Notes").replace(/[\s\/:?#\-()&!,]+/g, '_').replace(/^_+|_+$/g, '');
                withAnnoUrl = `https://player.uacdn.net/slides_pdf/${uid}/${titleSlug}_with_anno.pdf`;
            }
            if (!noAnnoUrl && withAnnoUrl && withAnnoUrl.includes('_with_anno.pdf')) {
                noAnnoUrl = withAnnoUrl.replace('_with_anno.pdf', '_no_anno.pdf');
            }

            pdfNav.innerHTML = `
                <div class="pdf-card">
                    <div class="pdf-card-header">
                        <i class="fas fa-file-pdf pdf-card-icon anno"></i>
                        <div>
                            <div class="pdf-card-title">Annotated Notes PDF</div>
                            <div class="pdf-card-sub">With teacher handwritten ink & markings</div>
                        </div>
                    </div>
                    <div class="pdf-card-actions">
                        <a href="${withAnnoUrl}" target="_blank" rel="noopener" class="pdf-btn anno"><i class="fas fa-file-download"></i> Open / Download</a>
                    </div>
                </div>
                ${noAnnoUrl ? `
                <div class="pdf-card">
                    <div class="pdf-card-header">
                        <i class="fas fa-file-pdf pdf-card-icon clean"></i>
                        <div>
                            <div class="pdf-card-title">Clean Slide PDF</div>
                            <div class="pdf-card-sub">Original high-res slide deck background</div>
                        </div>
                    </div>
                    <div class="pdf-card-actions">
                        <a href="${noAnnoUrl}" target="_blank" rel="noopener" class="pdf-btn clean"><i class="fas fa-file-download"></i> Open / Download</a>
                    </div>
                </div>` : ''}
            `;
        }

        // ══════════════════════════════════════════════════
        //  PANEL CONTROLLER & TABS
        // ══════════════════════════════════════════════════
        function switchPanelTab(tab) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.panel-tab-content').forEach(c => {
                c.style.display = 'none';
                c.classList.remove('active');
            });
            if (tab === 'slides') {
                document.getElementById('tab-btn-slides').classList.add('active');
                const t = document.getElementById('doubts-panel');
                t.style.display = 'flex';
                t.classList.add('active');
            } else if (tab === 'pdf') {
                const pdfBtn = document.getElementById('tab-btn-pdf');
                if (pdfBtn) pdfBtn.classList.add('active');
                const t = document.getElementById('pdf-panel');
                if (t) {
                    t.style.display = 'flex';
                    t.classList.add('active');
                    renderPdfNotes(activeUid);
                }
            } else {
                document.getElementById('tab-btn-lectures').classList.add('active');
                const t = document.getElementById('lectures-panel');
                t.style.display = 'flex';
                t.classList.add('active');
            }
        }

        function renderLectureDrawer() {
            const nav = document.getElementById('lecture-nav');
            if (!nav) return;
            nav.innerHTML = '';
            
            const activeCourse = (window.LOCAL_COURSES && window.LOCAL_COURSES.find(c => c.id === activeCourseId)) || COURSES.find(c => c.id === activeCourseId) || COURSES[0];
            
            const titleEl = document.createElement('div');
            titleEl.className = 'drawer-course-header';
            titleEl.textContent = activeCourse.title;
            nav.appendChild(titleEl);
            
            activeCourse.lectures.forEach(lec => {
                const item = document.createElement('div');
                const isActive = (lec.uid === activeUid);
                item.className = `lec-item ${isActive ? 'active' : ''}`;
                item.innerHTML = `
                    <div class="lec-title">${lec.title}</div>
                    <div class="lec-meta">
                        <span>Lec #${lec.rank}</span>
                        <span><i class="far fa-clock"></i> ${lec.duration || '--'}</span>
                    </div>
                `;
                item.onclick = () => {
                    if (lec.uid !== activeUid) {
                        if (window.launchLecture) {
                            window.launchLecture(lec.uid);
                        } else {
                            loadLectureByUid(lec.uid);
                        }
                    }
                };
                nav.appendChild(item);
            });
        }

        // Panel Toggle Arrow & Educator Cam
        (function () {
            const panel = document.getElementById('right-panel');
            const toggleBtn = document.getElementById('panel-toggle');
            const vc = document.getElementById('video-circle');
            const camPlaceholder = document.getElementById('cam-placeholder');
            let panelOpen = window.innerWidth > 768;
            let hasCustomPos = false;

            function isSmallSize() {
                return (vc && vc.classList.contains('small-size')) || (camPlaceholder && camPlaceholder.classList.contains('small-size'));
            }

            function positionCamDocked() {
                if (!vc) return;
                if (hasCustomPos || !camPlaceholder || window.innerWidth <= 768 || !panelOpen) {
                    positionCamFloating();
                    return;
                }
                const isSmall = isSmallSize();
                const targetH = isSmall ? 125 : 158;
                camPlaceholder.style.height = targetH + 'px';
                
                const r = camPlaceholder.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) {
                    positionCamFloating();
                    return;
                }
                vc.classList.add('docked-cam');
                vc.classList.remove('floating-cam');
                vc.style.position = 'fixed';
                vc.style.left = r.left + 'px';
                vc.style.top = r.top + 'px';
                vc.style.width = r.width + 'px';
                vc.style.height = r.height + 'px';
                vc.style.right = 'auto';
                vc.style.bottom = 'auto';
                vc.style.borderRadius = '0';
                vc.style.zIndex = '9000';
                vc.style.cursor = 'grab';
                vc.style.boxShadow = 'none';
                vc.style.transform = '';
            }

            function getViewportSize() {
                return {
                    width: window.innerWidth || document.documentElement.clientWidth || screen.width,
                    height: window.innerHeight || document.documentElement.clientHeight || screen.height
                };
            }

            function getFloatingCamDimensions() {
                const isSmall = isSmallSize();
                const vp = getViewportSize();
                const minDim = Math.min(vp.width, vp.height);
                const maxDim = Math.max(vp.width, vp.height);
                const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
                
                let targetW;
                if (minDim <= 500) {
                    // Mobile Phone (e.g. 360-480px short dimension)
                    targetW = isSmall ? 105 : 118;
                } else if (minDim <= 950 || (isTouch && maxDim <= 1400)) {
                    // Tablet / iPad / Foldable (e.g. 600-900px short dimension) - ~40% bigger small mode
                    targetW = isSmall ? Math.round(minDim * 0.20) : Math.round(minDim * 0.24);
                    targetW = isSmall ? Math.max(155, Math.min(175, targetW)) : Math.max(165, Math.min(210, targetW));
                } else {
                    // Desktop / Laptop (e.g. 1080p, 1440p, 4k) - ~40% bigger small mode
                    targetW = isSmall ? 165 : 200;
                }

                const targetH = Math.round(targetW * 0.75); // 4:3 camera aspect ratio
                return {
                    w: targetW + 'px',
                    h: targetH + 'px'
                };
            }

            function positionCamFloating() {
                if (!vc) return;
                const { w, h } = getFloatingCamDimensions();
                
                vc.classList.add('floating-cam');
                vc.classList.remove('docked-cam');
                vc.style.position = 'fixed';
                vc.style.width = w;
                vc.style.height = h;
                vc.style.borderRadius = '12px';
                vc.style.zIndex = '9999';
                vc.style.cursor = 'grab';
                vc.style.boxShadow = '0 8px 24px rgba(0,0,0,0.7)';
                vc.style.transform = '';

                if (!hasCustomPos) {
                    vc.style.top = '12px';
                    vc.style.right = '12px';
                    vc.style.left = 'auto';
                    vc.style.bottom = 'auto';
                } else {
                    // Re-bound within current viewport when resized
                    const curL = parseFloat(vc.style.left) || 12;
                    const curT = parseFloat(vc.style.top) || 12;
                    const numW = parseFloat(w);
                    const numH = parseFloat(h);
                    const vp = getViewportSize();
                    const maxL = Math.max(0, vp.width - numW);
                    const maxT = Math.max(0, vp.height - numH);
                    vc.style.left = Math.max(0, Math.min(maxL, curL)) + 'px';
                    vc.style.top = Math.max(0, Math.min(maxT, curT)) + 'px';
                    vc.style.right = 'auto';
                    vc.style.bottom = 'auto';
                }
            }

            window.repositionCam = function() {
                if (panelOpen && window.innerWidth > 768 && !hasCustomPos) positionCamDocked();
                else positionCamFloating();
            };

            function applyPanelState() {
                if (panelOpen && window.innerWidth > 768) {
                    panel.classList.remove('collapsed');
                    document.body.classList.remove('panel-closed');
                    if (toggleBtn) {
                        toggleBtn.style.right = '280px';
                        toggleBtn.innerHTML = '&#10095;';
                    }
                    setTimeout(positionCamDocked, 10);
                    setTimeout(positionCamDocked, 150);
                    setTimeout(positionCamDocked, 320);
                } else {
                    panel.classList.add('collapsed');
                    document.body.classList.add('panel-closed');
                    if (toggleBtn) {
                        toggleBtn.style.right = '0px';
                        toggleBtn.innerHTML = '&#10094;';
                    }
                    positionCamFloating();
                }
                setTimeout(() => { resizeCanvas(true); }, 320);
            }

            window.positionCamDocked = positionCamDocked;
            window.positionCamFloating = positionCamFloating;
            window.applyPanelState = applyPanelState;

            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => {
                    panelOpen = !panelOpen;
                    hasCustomPos = false; // Reset custom position to dock cleanly when user toggles panel
                    applyPanelState();
                });
            }

            applyPanelState();

            window.addEventListener('resize', () => {
                if (window.innerWidth <= 768) {
                    positionCamFloating();
                } else if (panelOpen && !document.fullscreenElement && !hasCustomPos) {
                    requestAnimationFrame(positionCamDocked);
                } else if (hasCustomPos) {
                    requestAnimationFrame(positionCamFloating);
                }
            });

            // Universal Drag Engine: touch & mouse with full 2D movement for Android & desktop
            (function () {
                if (!vc) return;
                let isDragging = false;
                let startX = 0, startY = 0, startL = 0, startT = 0;
                let activeTouchId = null;

                function initDrag(clientX, clientY) {
                    isDragging = true;
                    hasCustomPos = true;

                    // Ensure floating styles are active
                    const { w, h } = getFloatingCamDimensions();
                    vc.classList.add('floating-cam');
                    vc.classList.remove('docked-cam');
                    vc.style.width = w;
                    vc.style.height = h;
                    vc.style.borderRadius = '12px';
                    vc.style.boxShadow = '0 8px 24px rgba(0,0,0,0.7)';
                    vc.style.zIndex = '9999';

                    const r = vc.getBoundingClientRect();
                    startL = r.left;
                    startT = r.top;
                    startX = clientX;
                    startY = clientY;

                    vc.style.position = 'fixed';
                    vc.style.left = startL + 'px';
                    vc.style.top = startT + 'px';
                    vc.style.right = 'auto';
                    vc.style.bottom = 'auto';
                    vc.style.cursor = 'grabbing';
                    vc.style.transition = 'none';
                    vc.style.userSelect = 'none';
                    vc.style.transform = '';
                }

                function updateDrag(clientX, clientY) {
                    if (!isDragging) return;
                    const dx = clientX - startX;
                    const dy = clientY - startY;
                    let newL = startL + dx;
                    let newT = startT + dy;

                    const vp = getViewportSize();
                    const vcW = vc.offsetWidth || 140;
                    const vcH = vc.offsetHeight || 105;
                    const maxL = Math.max(0, vp.width - vcW);
                    const maxT = Math.max(0, vp.height - vcH);

                    newL = Math.max(0, Math.min(maxL, newL));
                    newT = Math.max(0, Math.min(maxT, newT));

                    vc.style.left = newL + 'px';
                    vc.style.top = newT + 'px';
                    vc.style.right = 'auto';
                    vc.style.bottom = 'auto';
                }

                function stopDrag() {
                    if (!isDragging) return;
                    isDragging = false;
                    activeTouchId = null;
                    vc.style.cursor = 'grab';
                    vc.style.userSelect = '';
                    window.removeEventListener('touchmove', onTouchMoveHandler);
                    window.removeEventListener('touchend', stopDrag);
                    window.removeEventListener('touchcancel', stopDrag);
                }

                function onTouchMoveHandler(e) {
                    if (!isDragging) return;
                    for (let i = 0; i < e.touches.length; i++) {
                        const t = e.touches[i];
                        if (activeTouchId === null || t.identifier === activeTouchId) {
                            updateDrag(t.clientX, t.clientY);
                            if (e.cancelable) e.preventDefault();
                            break;
                        }
                    }
                }

                // TOUCH EVENTS (Primary for Android & iOS)
                vc.addEventListener('touchstart', function (e) {
                    if (e.touches.length > 0) {
                        const t = e.touches[0];
                        activeTouchId = t.identifier;
                        initDrag(t.clientX, t.clientY);
                        window.addEventListener('touchmove', onTouchMoveHandler, { passive: false });
                        window.addEventListener('touchend', stopDrag, { passive: false });
                        window.addEventListener('touchcancel', stopDrag, { passive: false });
                        if (e.cancelable) e.preventDefault();
                        e.stopPropagation();
                    }
                }, { passive: false });

                // MOUSE EVENTS (Desktop fallback)
                vc.addEventListener('mousedown', function (e) {
                    if (e.button !== 0) return;
                    initDrag(e.clientX, e.clientY);
                    e.preventDefault();
                    e.stopPropagation();

                    function onMouseMove(me) {
                        updateDrag(me.clientX, me.clientY);
                    }

                    function onMouseUp() {
                        stopDrag();
                        window.removeEventListener('mousemove', onMouseMove);
                        window.removeEventListener('mouseup', onMouseUp);
                    }

                    window.addEventListener('mousemove', onMouseMove);
                    window.addEventListener('mouseup', onMouseUp);
                });
            })();
        })();

        function destroyEngine() {
            console.log("[Engine] Destroying engine state and purging caches...");
            engineLoaded = false;
            releaseWakeLock();
            if (video) {
                try { video.pause(); } catch (e) {}
            }
            activeBlobUrls.forEach(u => {
                try { URL.revokeObjectURL(u); } catch (_) {}
            });
            activeBlobUrls.clear();
            lastLocalVideoBlobUrl = null;

            for (const c of [slideCanvas, hlCanvas, penCanvas, eraserCanvas, drawCanvas, shapePreviewCanvas, laserCanvas]) {
                if (c) {
                    const ctx = c.getContext("2d");
                    if (ctx) {
                        ctx.save();
                        ctx.setTransform(1, 0, 0, 1, 0, 0);
                        ctx.clearRect(0, 0, c.width, c.height);
                        ctx.restore();
                    }
                }
            }
            allEvents = [];
            completedStrokes = [];
            strokesBySid.clear();
            eventsBySid.clear();
            currentDeletedSet.clear();
            activeStrokes.clear();
            transformMap.clear();
            snapshots = [];
            imgCache.clear();
            uslCache.clear();
            
            curSlideIdx = 0;
            curSid = "init";
            curSlideUrl = '';
            curBgImageUrl = '';
            curGifUrl = '';
            lastPaintedUrl = null;
            lastPaintedBg = null;
        }

// Load local lecture recording from File/Blob objects
async function loadLocalLecture(lec, course = null, startSec = 0) {
    if (course) {
        if (!COURSES.some(c => c.id === course.id)) {
            COURSES.unshift(course);
        }
        activeCourseId = course.id;
    }
    activeUid = lec.uid;
    renderLectureDrawer();

    video.pause();
    const splash = $("splash");
    if (splash) {
        splash.style.display = "flex";
        splash.classList.remove("hidden");
        const label = $("splash-label");
        if (label) label.textContent = `Loading Local Lecture: ${lec.title}...`;
    }

    destroyEngine();

    if (lastLocalVideoBlobUrl) {
        try { URL.revokeObjectURL(lastLocalVideoBlobUrl); } catch (_) {}
        activeBlobUrls.delete(lastLocalVideoBlobUrl);
    }
    const videoUrl = lec.videoFile ? URL.createObjectURL(lec.videoFile) : (lec.videoUrl || "");
    if (lec.videoFile) {
        lastLocalVideoBlobUrl = videoUrl;
        activeBlobUrls.add(videoUrl);
    }
    video.preload = "auto";
    video.src = videoUrl;
    video.load();

    // Determine target start time
    let targetTime = startSec;
    if (targetTime <= 0) {
        const savedProg = getLectureProgress(lec.uid);
        if (savedProg && savedProg.timeSec > 0) {
            targetTime = savedProg.timeSec;
        } else {
            const last = getLastWatched();
            if (last && last.uid === lec.uid && (last.timeSec || 0) > 0) {
                targetTime = last.timeSec;
            }
        }
    }

    if (targetTime > 0) {
        const applyResume = () => {
            try {
                video.currentTime = targetTime;
                doSeek(targetTime * 1e6);
            } catch (e) {
                console.warn("[LocalLoader] Seek on load error:", e);
            }
        };
        if (video.readyState >= 1) {
            applyResume();
        } else {
            video.addEventListener("loadedmetadata", applyResume, { once: true });
        }
    }

    try {
        let rawData;
        if (lec.jsonFile) {
            const buffer = await lec.jsonFile.arrayBuffer();
            rawData = await tryDecryptAndParse(buffer, lec.title || "local_lecture");
        } else if (lec.telemetryData) {
            rawData = typeof lec.telemetryData === "string" ? JSON.parse(lec.telemetryData) : lec.telemetryData;
        }

        if (rawData) {
            await processData(rawData, targetTime);
            engineLoaded = true;
            saveLastWatched(lec.uid, activeCourseId, targetTime);
            renderPdfNotes(lec.uid);
            showToast(`📂 Opened: ${lec.title}`, "success");
            if (splash) {
                splash.classList.add("hidden");
                splash.style.display = "none";
            }
            return true;
        } else {
            throw new Error("No telemetry data found in local recording");
        }
    } catch (e) {
        console.error("[LocalLoader] Error loading local lecture:", e);
        showToast("Failed to load local telemetry data", "warn");
        if (splash) {
            splash.classList.add("hidden");
            splash.style.display = "none";
        }
        return false;
    }
}

// Initialize local file & folder loader
initLocalFileLoader({
    onCourseLoaded: (coursePackage) => {
        console.log("[LocalLoader] Local course folder loaded:", coursePackage.title, coursePackage.lectures.length);
        if (window.addLocalCourse) {
            window.addLocalCourse(coursePackage);
        }
        activeCourseId = coursePackage.id;
        switchView("course", { courseId: coursePackage.id });
        showToast(`📂 Loaded course folder: ${coursePackage.title} (${coursePackage.lectures.length} lectures)`, "success");
    },
    onSingleLectureLoaded: (lecture, coursePackage) => {
        console.log("[LocalLoader] Single local lecture loaded:", lecture.title);
        if (window.addLocalCourse) {
            window.addLocalCourse(coursePackage);
        }
        switchView("player");
        loadLocalLecture(lecture, coursePackage);
    }
});

// Export bindings
export { runEngine, loadLectureByUid, loadLocalLecture, processData, syncLoop, doSeek, switchPanelTab, destroyEngine };
window.runEngine = runEngine;
window.loadLectureByUid = loadLectureByUid;
window.loadLocalLecture = loadLocalLecture;
window.processData = processData;
window.syncLoop = syncLoop;
window.doSeek = doSeek;
window.destroyEngine = destroyEngine;
window.$ = $;
window.video = video;
window.resizeCanvas = resizeCanvas;
window.setStatus = setStatus;
window.switchPanelTab = switchPanelTab;

