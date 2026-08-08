// Telemetric whiteboard rendering canvas player engine
import { findCourseByLectureUid } from './courses.js';
import { switchView } from './dashboard.js';
import { SECRET_KEY, decryptBytes, tryDecryptAndParse } from './engine/crypto.js';
import { maths, bezier } from './engine/bezier.js';

'use strict';

        // ══════════════════════════════════════════════════════
        //  48 COURSES LECTURES ARRAY
        // ══════════════════════════════════════════════════════
        


        


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

        function getDisplayColor(c, isBg = false) {
            if (!document.body.classList.contains('light-mode')) return c;
            if (!c) return c;
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
        let gsMode = false;

        let pointerStream = [];
        let ptrStreamIdx = 0;

        const fmt = sec => { const s = Math.max(0, sec); return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`; };
        const curVideoUs = () => Math.round(video.currentTime * 1e6);
        const drawingUs = vUs => vUs + drawOffset;

        function handleEducatorAlign(val) {
            if (!gsOverlay) return;
            const s = gsOverlay.style;
            s.left = s.right = s.top = s.bottom = "auto";
            const v = String(val).toLowerCase();
            if (v === "lb" || v === "left_bottom" || v === "1") { s.left = "16px"; s.bottom = "16px"; }
            else if (v === "rb" || v === "right_bottom" || v === "2") { s.right = "16px"; s.bottom = "16px"; }
            else if (v === "rt" || v === "right_top" || v === "3") { s.right = "16px"; s.top = "16px"; }
            else if (v === "lt" || v === "left_top" || v === "4") { s.left = "16px"; s.top = "16px"; }
            else { s.right = "16px"; s.bottom = "16px"; }
        }

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
                const loadPromise = new Promise(resolve => {
                    img.onload = () => { if (url === curSlideUrl || url === curBgImageUrl) paintBackground(); resolve(true); };
                    img.onerror = () => resolve(false);
                });
                imgLoadPromises.set(url, loadPromise);

                let finalUrl = url;
                if (!finalUrl.startsWith("data:")) {
                    if (finalUrl.includes("?")) {
                        if (!finalUrl.includes("fm=webp")) finalUrl += "&fm=webp&fit=clip&auto=compress&w=1080";
                    } else {
                        finalUrl += "?fm=webp&fit=clip&auto=compress&w=1080";
                    }
                }
                img.src = finalUrl;
                imgCache.set(url, img);
            }
            return imgCache.get(url);
        }

        async function preloadSlides() {
            const registryValues = Object.values(slideRegistry).filter(s => s && s.url);
            const total = registryValues.length;
            if (total === 0) return;

            let loaded = 0;
            const updateUI = () => {
                const label = $("splash-label");
                const bar = $("splash-progress");
                if (label) label.textContent = `Preloading Slide Assets ${loaded}/${total}`;
                if (bar) bar.style.width = `${(loaded / total) * 100}%`;
            };

            updateUI();

            const loads = registryValues.flatMap(s => {
                const arr = [];
                if (s.url) arr.push(getImg(s.url));
                if (s.bg) arr.push(getImg(s.bg));
                return arr.map(img => {
                    return new Promise(resolve => {
                        if (img && img.complete) {
                            loaded++; updateUI(); resolve(true);
                        } else if (img) {
                            img.addEventListener("load", () => { loaded++; updateUI(); resolve(true); }, { once: true });
                            img.addEventListener("error", () => { loaded++; updateUI(); resolve(false); }, { once: true });
                        } else {
                            resolve(false);
                        }
                    });
                });
            });

            await Promise.race([
                Promise.allSettled(loads),
                new Promise(resolve => setTimeout(resolve, 8000))
            ]);
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
            dc.save();
            dc.beginPath();
            dc.lineCap = "round"; dc.lineJoin = "round";
            let lineWidth = stroke.th * scaleFactor * 3;
            if (stroke.isErase) lineWidth = (stroke.th + 10) * scaleFactor;
            else if (stroke.isHighlight) lineWidth = stroke.th * scaleFactor * 15;

            const radius = Math.max(1, lineWidth / 2);
            if (stroke.isErase) {
                dc.globalCompositeOperation = "destination-out";
                dc.fillStyle = "rgba(0,0,0,1)";
            } else {
                dc.globalCompositeOperation = "source-over";
                dc.globalAlpha = 1.0;
                dc.fillStyle = getDisplayColor(stroke.color, false);
            }
            dc.arc(stroke.lastX, stroke.lastY, radius, 0, Math.PI * 2);
            dc.fill();
            dc.restore();
        }

        function drawCurve(dc, stroke, mx, my) {
            dc.save();
            dc.beginPath();
            dc.lineCap = "round";
            dc.lineJoin = "round";
            if (stroke.isErase) {
                dc.globalCompositeOperation = "destination-out";
                dc.strokeStyle = "rgba(0,0,0,1)";
                dc.lineWidth = (stroke.th + 10) * scaleFactor;
            } else if (stroke.isHighlight) {
                dc.globalCompositeOperation = "source-over";
                dc.globalAlpha = 1.0;
                dc.strokeStyle = getDisplayColor(stroke.color, false);
                dc.lineWidth = stroke.th * scaleFactor * 15;
            } else {
                dc.globalCompositeOperation = "source-over";
                dc.globalAlpha = 1;
                dc.strokeStyle = getDisplayColor(stroke.color, false);
                dc.lineWidth = stroke.th * scaleFactor * 3;
            }
            dc.moveTo(stroke.midX, stroke.midY);
            dc.quadraticCurveTo(stroke.lastX, stroke.lastY, mx, my);
            dc.stroke();
            dc.restore();
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
            const undoneEvents = new Set();
            const currentDeletedOids = new Set();
            const historyStack = [];

            for (let i = 0; i < slideEvents.length; i++) {
                const ev = slideEvents[i];
                if (ev.t > targetUs) break;
                if (ev.type === "stroke_up" || ev.type === "delete_objects" || ev.type === "erase_all") {
                    historyStack.push(ev);
                } else if (ev.type === "undo") {
                    if (historyStack.length > 0) {
                        const target = historyStack.pop();
                        undoneEvents.add(target.t);
                    }
                }
            }

            transformMap.clear();
            activeTFIds = [];

            for (let i = 0; i < slideEvents.length; i++) {
                const ev = slideEvents[i];
                if (ev.t > targetUs) break;
                if (!undoneEvents.has(ev.t)) {
                    if (ev.type === "delete_objects") {
                        (ev.oids || []).forEach(oid => currentDeletedOids.add(oid));
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
                if (undoneEvents.has(stroke.t_start)) continue;
                if (stroke.oid && currentDeletedOids.has(stroke.oid)) continue;

                const tf = transformMap.get(stroke.oid) || { matrix: new DOMMatrix() };
                let pts = [];
                const hasTF = !tf.matrix.isIdentity;

                for (let i = 0; i < stroke.pts.length; i++) {
                    if (stroke.pts[i].t <= targetUs) {
                        const p = stroke.pts[i];
                        if (hasTF && !isShape(stroke.mode)) {
                            const proj = new DOMPoint(p.x * CW, p.y * CH).matrixTransform(tf.matrix);
                            pts.push({ x: proj.x / CW, y: proj.y / CH, t: p.t });
                        } else {
                            pts.push({ x: p.x, y: p.y, t: p.t });
                        }
                    } else break;
                }
                if (pts.length === 0) continue;

                let lastX = pts[0].x * CW, lastY = pts[0].y * CH;
                let midX = lastX, midY = lastY;
                const dotSeg = { lastX, lastY, color: stroke.color, th: stroke.th, isErase: stroke.isErase, isHighlight: stroke.isHighlight, mode: stroke.mode, dash: stroke.dash };

                if (stroke.isErase) {
                    drawDot(penCtx, dotSeg); drawDot(hlCtx, dotSeg); drawDot(drawCtx, dotSeg); drawDot(eraserCtx, dotSeg);
                } else if (!isShape(stroke.mode)) {
                    if (!stroke.isHighlight) drawDot(penCtx, dotSeg);
                    else if (pts.length === 1) drawDot(hlCtx, dotSeg);
                }

                for (let i = 1; i < pts.length; i++) {
                    const nx = pts[i].x * CW, ny = pts[i].y * CH;
                    const mx = (i === pts.length - 1) ? nx : (lastX + nx) / 2;
                    const my = (i === pts.length - 1) ? ny : (lastY + ny) / 2;
                    const seg = { midX, midY, lastX, lastY, color: stroke.color, th: stroke.th, isErase: stroke.isErase, isHighlight: stroke.isHighlight, mode: stroke.mode, dash: stroke.dash, uslUrl: stroke.uslUrl };
                    if (isShape(stroke.mode)) {
                        if (i === pts.length - 1) {
                            const dc = stroke.isTempHL ? laserCtx : (stroke.isHighlight ? hlCtx : drawCtx);
                            dc.save();
                            if (hasTF) { dc.transform(tf.matrix.a, tf.matrix.b, tf.matrix.c, tf.matrix.d, tf.matrix.e, tf.matrix.f); }
                            const sx1 = stroke.pts[0].x * CW, sy1 = stroke.pts[0].y * CH;
                            const sx2 = stroke.pts[stroke.pts.length - 1].x * CW, sy2 = stroke.pts[stroke.pts.length - 1].y * CH;
                            drawShape(dc, seg, sx1, sy1, sx2, sy2);
                            dc.restore();
                        }
                    } else if (stroke.isErase) {
                        drawCurve(penCtx, seg, mx, my); drawCurve(hlCtx, seg, mx, my); drawCurve(drawCtx, seg, mx, my); drawCurve(eraserCtx, seg, mx, my);
                    } else if (stroke.isTempHL) {
                        // Temp lasers
                    } else {
                        drawCurve(stroke.isHighlight ? hlCtx : penCtx, seg, mx, my);
                    }
                    lastX = nx; lastY = ny; midX = mx; midY = my;
                }
            }

            laserCtx.clearRect(0, 0, CW, CH);

            for (const [cwId, s] of activeStrokes) {
                if (s.sid && s.sid !== curSid) continue;
                if (!s.pts || s.pts.length === 0) continue;
                if (s.isTempHL && cwId !== latestTempHLcwId) continue;

                const isSh = isShape(s.mode);
                const tf = transformMap.get(s.oid) || { matrix: new DOMMatrix() };

                const pts = s.pts.map(p => {
                    if (!tf.matrix.isIdentity && !isSh) {
                        const proj = new DOMPoint(p.x * CW, p.y * CH).matrixTransform(tf.matrix);
                        return { x: proj.x / CW, y: proj.y / CH, t: p.t };
                    }
                    return { x: p.x, y: p.y, t: p.t };
                });
                if (pts.length === 0) continue;

                let lastX = pts[0].x * CW, lastY = pts[0].y * CH;
                let midX = lastX, midY = lastY;
                const dotSeg = { lastX, lastY, color: s.color, th: s.th, isErase: s.isErase, isHighlight: s.isHighlight, isTempHL: s.isTempHL, mode: s.mode, dash: s.dash || [] };

                const dc = s.isErase ? penCtx : (s.isTempHL ? laserCtx : (s.isHighlight ? hlCtx : penCtx));
                if (s.isErase) {
                    drawDot(penCtx, dotSeg); drawDot(hlCtx, dotSeg); drawDot(drawCtx, dotSeg); drawDot(eraserCtx, dotSeg);
                } else if (!isSh) {
                    if (!s.isHighlight && !s.isTempHL) drawDot(dc, dotSeg);
                    else if (pts.length === 1) drawDot(dc, dotSeg);
                }

                for (let i = 1; i < pts.length; i++) {
                    const nx = pts[i].x * CW, ny = pts[i].y * CH;
                    const mx = (i === pts.length - 1) ? nx : (lastX + nx) / 2;
                    const my = (i === pts.length - 1) ? ny : (lastY + ny) / 2;
                    const seg = { midX, midY, lastX, lastY, color: s.color, th: s.th, isErase: s.isErase, isHighlight: s.isHighlight, isTempHL: s.isTempHL, mode: s.mode, dash: s.dash || [], uslUrl: s.uslUrl };

                    if (isSh) {
                        if (i === pts.length - 1) {
                            dc.save();
                            if (!tf.matrix.isIdentity) { dc.transform(tf.matrix.a, tf.matrix.b, tf.matrix.c, tf.matrix.d, tf.matrix.e, tf.matrix.f); }
                            const sx1 = s.pts[0].x * CW, sy1 = s.pts[0].y * CH;
                            const sx2 = s.pts[s.pts.length - 1].x * CW, sy2 = s.pts[s.pts.length - 1].y * CH;
                            drawShape(dc, seg, sx1, sy1, sx2, sy2);
                            dc.restore();
                        }
                    } else if (s.isErase) {
                        drawCurve(penCtx, seg, mx, my); drawCurve(hlCtx, seg, mx, my); drawCurve(drawCtx, seg, mx, my); drawCurve(eraserCtx, seg, mx, my);
                    } else {
                        drawCurve(dc, seg, mx, my);
                    }
                    lastX = nx; lastY = ny; midX = mx; midY = my;
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

        async function runEngineWithUrl(url) {
            try {
                console.log(`[Engine] Smart Load: ${url}`);
                const response = await fetch(url);
                if (!response.ok) return false;

                window.updateSplash("Downloading Telemetry...", 25);
                const buffer = await response.arrayBuffer();

                window.updateSplash("Decrypting Payload...", 45);
                const rawData = tryDecryptAndParse(buffer, url);

                console.log("[Engine] JSON parsed. Processing stream frames...");
                await processData(rawData);

                window.updateSplash("Lecture Ready", 100);
                setStatus("synced", "SYNCED");
                return true;
            } catch (e) {
                console.error(`[Engine] Fetch error for ${url}:`, e);
                return false;
            }
        }

        async function loadLectureByUid(uid) {
            const course = findCourseByLectureUid(uid);
            activeCourseId = course.id;

            activeUid = uid;
            renderLectureDrawer();

            video.pause();

            const splash = $("splash");
            if (splash) {
                splash.style.display = "flex";
                splash.classList.remove("hidden");
                const label = $("splash-label");
                if (label) label.textContent = `Initializing Lecture ${uid}...`;
                const bar = $("splash-progress");
                if (bar) bar.style.width = "0%";
            }

            engineLoaded = false;
            slideRegistry = {};
            imgCache.clear();
            imgLoadPromises.clear();
            uslCache.clear();
            uslLoadPromises.clear();
            allEvents = [];
            completedStrokes = [];
            strokesBySid.clear();
            eventsBySid.clear();
            eraseLog = [];
            snapshots = [];
            activeStrokes.clear();
            latestTempHLcwId = null;
            lastPollUid = null;
            activePollEvent = null;
            curSlideIdx = 0;
            curSid = "init";
            curSlideUrl = "";
            curBgColor = "#111118";
            curBgImageUrl = "";
            curColor = "#ffff00";
            curMode = "marker";
            curPenSize = 2;
            curEraserSize = 10;
            curSlideRotation = 0;
            curGifUrl = "";
            curScreenShare = false;

            const videoUrl = `https://uamedia.uacdn.net/lesson-raw/${uid}/output.webm`;
            video.src = videoUrl;
            if (gsMode) {
                gsVideo.src = videoUrl;
            }

            try {
                const directTelemetryUrl = `https://uamedia.uacdn.net/lesson-raw/${uid}/data.json`;
                const proxyTelemetryUrl = `https://corsproxy.io/?${encodeURIComponent(directTelemetryUrl)}`;

                let success = await runEngineWithUrl(directTelemetryUrl);
                if (!success) {
                    console.warn("[Engine] Direct telemetry fetch failed. Trying CORS proxy...");
                    success = await runEngineWithUrl(proxyTelemetryUrl);
                }

                if (!success) {
                    const directSecureUrl = `https://uamedia.uacdn.net/lesson-raw/${uid}/securejson.json`;
                    const proxySecureUrl = `https://corsproxy.io/?${encodeURIComponent(directSecureUrl)}`;
                    success = await runEngineWithUrl(directSecureUrl);
                    if (!success) {
                        success = await runEngineWithUrl(proxySecureUrl);
                    }
                }

                if (success) {
                    engineLoaded = true;
                    if (splash) {
                        splash.classList.add("hidden");
                        setTimeout(() => { splash.style.display = "none"; }, 500);
                    }
                    return true;
                } else {
                    throw new Error("Telemetry endpoints unreachable.");
                }
            } catch (err) {
                console.error("loadLectureByUid failed:", err);
                setStatus("error", "LOAD ERROR");
                const label = $("splash-label");
                if (label) label.textContent = "Telemetry fetch failed. Please check your network or try another lecture.";
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
                if (gsMode) gsVideo.src = lecUrl;
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

        async function processData(raw) {
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
            for (const ev of flat) {
                loopCounter++;
                if (loopCounter % 4000 === 0) {
                    window.updateSplash(`Processing Telemetry Data...`, 48 + (loopCounter / flat.length * 48));
                    await new Promise(r => setTimeout(r, 0));
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
            const maxDuration = allEvents.length ? allEvents[allEvents.length - 1].t : 0;
            for (let i = 0; i < allEvents.length; i++) {
                const e = allEvents[i];
                while (e.t >= nextSnap && nextSnap <= maxDuration + 10000000) {
                    snapshots.push({ t: nextSnap, evIdx: i, state: JSON.parse(JSON.stringify(curSnapshotState)) });
                    nextSnap += 10000000;
                }
                if (e.type === "slide") { curSnapshotState.sid = e.sid; curSnapshotState.slideUrl = e.url; curSnapshotState.bgColor = e.bc; curSnapshotState.bgImageUrl = e.bg; curSnapshotState.rotation = 0; curSnapshotState.gifUrl = ''; }
                else if (e.type === "bg") { curSnapshotState.bgColor = e.color; curSnapshotState.bgImageUrl = e.bg; }
                else if (e.type === "pn") { curSnapshotState.panX = e.v.x; curSnapshotState.panY = e.v.y; }
                else if (e.type === "zm") curSnapshotState.zoom = e.v;
                else if (e.type === "rotate_slide") curSnapshotState.rotation = e.v || 0;
                else if (e.type === "play_gif") curSnapshotState.gifUrl = e.src || '';
                else if (e.type === "share_screen") curSnapshotState.screenShare = !!e.value;
            }
            if (!snapshots.length) snapshots.push({ t: 0, evIdx: 0, state: JSON.parse(JSON.stringify(curSnapshotState)) });

            await preloadSlides();

            seekBar.max = maxDuration;
            tTotal.textContent = fmt(maxDuration / 1e6);
            buildChapterMarks();
            renderSlideNav();
            engineLoaded = true;

            const fsIdx = slideSeqs.length ? slideSeqs[0] : 0;
            const fs = slideRegistry[fsIdx] || { url: '', bc: "#111118" };
            curSlideIdx = fsIdx; curSlideUrl = fs.url; curBgColor = fs.bc;
            doSeek(0);
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

        function doSeek(targetVideoUs) {
            const targetUs = drawingUs(targetVideoUs);

            let snapIdx = Math.floor(Math.max(0, targetUs) / 10000000);
            if (snapIdx >= snapshots.length) snapIdx = snapshots.length - 1;
            const snap = snapshots[snapIdx] || { t: 0, evIdx: 0, state: { sid: "init", slideUrl: '', bgColor: "#111118", bgImageUrl: '', color: "#ffff00", mode: "marker", penSize: 2, eraserSize: 10, panX: 0, panY: 0, zoom: 1, rotation: 0, gifUrl: '', screenShare: false } };

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
                    case "camera_switch": if (gsMode) { ev.value ? gsVideo.play().catch(() => { }) : gsVideo.pause(); } break;
                    case "educator_align": handleEducatorAlign(ev.value); break;
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
                    case "camera_switch": if (gsMode) { ev.value ? gsVideo.play().catch(() => { }) : gsVideo.pause(); } break;
                    case "educator_align": handleEducatorAlign(ev.value); break;
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
                ptrX = projected.x - 3; ptrY = projected.y - 3;
                pointerDot.style.transform = `translate3d(${ptrX}px,${ptrY}px,0)`;
                pointerDot.style.opacity = "1";
            } else {
                pointerDot.style.opacity = "0";
            }

            if (bgChanged) paintBackground(false);
            if (needsRedraw) replayStrokes(targetUs);
        }

        // 60FPS Sync & Render Loop
        function syncLoop(ts) {
            requestAnimationFrame(syncLoop);
            if (prevRafTs > 0) {
                fpsSamples.push(ts - prevRafTs); if (fpsSamples.length > 30) fpsSamples.shift();
                if (fpsSamples.length === 30) {
                    const avg = fpsSamples.reduce((a, b) => a + b, 0) / 30;
                    fpsDisp.textContent = Math.round(1000 / avg) + " fps";
                }
            }
            prevRafTs = ts; if (!engineLoaded) return;

            isBuffering = video.readyState < 3 && !video.paused;
            if (isBuffering || isSeeking) {
                bufferingOverlay.classList.add("show");
            } else {
                bufferingOverlay.classList.remove("show");
            }

            const vUs = curVideoUs();
            const dUs = drawingUs(vUs);

            const masterMax = parseFloat(seekBar.max) || 1;
            const mPct = (dUs / masterMax) * 100;
            seekBar.value = dUs;
            seekBar.style.setProperty("--pct", mPct + "%");

            const videoMax = video.duration || 1;
            const vPct = (video.currentTime / videoMax) * 100;
            videoSeekBar.value = video.currentTime;
            videoSeekBar.max = videoMax;
            videoSeekBar.style.setProperty("--vpct", vPct + "%");
            vCurr.textContent = fmt(video.currentTime);
            vTotal.textContent = fmt(videoMax);

            if (!video.paused && !isSeeking && !isBuffering) tickDraw(vUs);

            if (engineLoaded && recordStartMs > 0) {
                const wallMs = recordStartMs + (dUs / 1000);
                istClock.textContent = new Date(wallMs).toLocaleTimeString("en-IN", {
                    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true
                });
            }

            const overlayCurrentEl = $("t-curr-overlay");
            const overlayTotalEl = $("t-total-overlay");
            if (overlayCurrentEl) overlayCurrentEl.textContent = fmt(dUs / 1e6);
            if (overlayTotalEl) overlayTotalEl.textContent = tTotal.textContent;
        }
        requestAnimationFrame(syncLoop);

        video.addEventListener("loadedmetadata", () => {
            seekBar.max = Math.round(video.duration * 1e6);
            tTotal.textContent = fmt(video.duration);
            const ot = $("t-total-overlay");
            if (ot) ot.textContent = fmt(video.duration);
            if (engineLoaded) buildChapterMarks();
        });
        video.addEventListener("play", () => {
            isSeeking = false;
            playBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg>`;
            if (gsMode) gsVideo.play().catch(() => { });
            requestWakeLock();
        });
        video.addEventListener("pause", () => {
            playBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><polygon points="5,3 19,12 5,21"/></svg>`;
            if (gsMode) gsVideo.pause();
            releaseWakeLock();
        });
        video.addEventListener("seeking", () => {
            isSeeking = true;
            if (bufferingOverlay) bufferingOverlay.classList.add("show");
            if (gsMode) { try { gsVideo.pause(); } catch (_) { } }
        });
        video.addEventListener("seeked", () => {
            if (engineLoaded) doSeek(curVideoUs());
            if (gsMode) {
                try { gsVideo.pause(); } catch (_) { }
                gsVideo.currentTime = video.currentTime;
            }
            if (autoResumeAfterSeek) {
                autoResumeAfterSeek = false;
                video.play().catch(() => { });
            } else {
                isSeeking = false;
                if (bufferingOverlay) bufferingOverlay.classList.remove("show");
                if (gsMode && !video.paused) gsVideo.play().catch(() => { });
            }
        });
        video.addEventListener("waiting", () => { isBuffering = true; if (bufferingOverlay) bufferingOverlay.classList.add("show"); });
        video.addEventListener("playing", () => { isBuffering = false; isSeeking = false; if (bufferingOverlay) bufferingOverlay.classList.remove("show"); });
        video.addEventListener("ended", () => { 
            playBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><polygon points="5,3 19,12 5,21"/></svg>`; 
            releaseWakeLock();
        });
        video.addEventListener("ratechange", () => { if (gsMode) gsVideo.playbackRate = video.playbackRate; });

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
            if (chapterMarks) chapterMarks.innerHTML = '';
        }

        function seekToSec(sec) {
            if (!engineLoaded) return;
            if (!isSeeking) {
                autoResumeAfterSeek = !video.paused;
                if (autoResumeAfterSeek) video.pause();
            }
            isSeeking = true;
            if (bufferingOverlay) bufferingOverlay.classList.add("show");
            if (gsMode) { try { gsVideo.pause(); } catch (_) { } }
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

        seekBar.addEventListener("input", () => {
            const targetAnimUs = parseInt(seekBar.value);
            seekToSec((targetAnimUs - drawOffset) / 1e6);
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

        $("speed-sel-ui").addEventListener("change", e => {
            video.playbackRate = parseFloat(e.target.value);
        });

        let videoCircleVisible = true;
        $("video-toggle-btn").addEventListener("click", () => {
            videoCircleVisible = !videoCircleVisible;
            const vc = $("video-circle");
            const btn = $("video-toggle-btn");
            if (videoCircleVisible) {
                vc.style.opacity = "1";
                vc.style.pointerEvents = "auto";
                btn.innerHTML = "<i class=\"fas fa-eye\"></i> <span>Visible</span>";
            } else {
                vc.style.opacity = "0";
                vc.style.pointerEvents = "none";
                btn.innerHTML = "<i class=\"fas fa-eye-slash\"></i> <span>Hidden</span>";
            }
        });

        let chromaKeyEnabled = true;
        $("chroma-toggle-btn").addEventListener("click", () => {
            chromaKeyEnabled = !chromaKeyEnabled;
            const videoEl = $("main-video");
            const btn = $("chroma-toggle-btn");
            if (chromaKeyEnabled) {
                videoEl.classList.add("chroma-active");
                btn.innerHTML = "<i class=\"fas fa-magic\"></i> <span>Enabled</span>";
            } else {
                videoEl.classList.remove("chroma-active");
                btn.innerHTML = "<i class=\"fas fa-magic-slash\"></i> <span>Disabled</span>";
            }
        });

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

        // Screen Wake Lock API helpers to prevent sleep during lecture playback
        let wakeLock = null;
        async function requestWakeLock() {
            try {
                if ('wakeLock' in navigator) {
                    wakeLock = await navigator.wakeLock.request('screen');
                    console.log("[Engine] Screen Wake Lock acquired.");
                }
            } catch (err) {
                console.warn("[Engine] Wake Lock acquisition failed:", err);
            }
        }

        async function releaseWakeLock() {
            try {
                if (wakeLock !== null) {
                    await wakeLock.release();
                    wakeLock = null;
                    console.log("[Engine] Screen Wake Lock released.");
                }
            } catch (err) {
                console.warn("[Engine] Wake Lock release failed:", err);
            }
        }

        document.addEventListener('visibilitychange', async () => {
            if (wakeLock !== null && document.visibilityState === 'visible' && !video.paused) {
                await requestWakeLock();
            }
        });

        const controlsOverlay = $("controls-overlay");
        let hideControlsTimer;
        let lastTouchTime = 0;

        function showControls(autohide = true) {
            controlsOverlay.classList.add("visible");
            const backBtn = $("player-back-btn");
            if (backBtn) backBtn.classList.remove("fade-out");
            clearTimeout(hideControlsTimer);
            if (autohide) {
                const timeoutMs = video.paused ? 1500 : 1000;
                hideControlsTimer = setTimeout(hideControls, timeoutMs);
            }
        }

        function hideControls() {
            clearTimeout(hideControlsTimer);
            controlsOverlay.classList.remove("visible");
            const backBtn = $("player-back-btn");
            if (backBtn) backBtn.classList.add("fade-out");
        }

        function toggleControls() {
            if (controlsOverlay.classList.contains("visible")) hideControls();
            else showControls(true);
        }

        function triggerPlayPauseRipple(isPlay) {
            let ripple = $("play-ripple-badge");
            if (!ripple) {
                ripple = document.createElement("div");
                ripple.id = "play-ripple-badge";
                ripple.className = "play-ripple-badge";
                const targetWrap = $("canvas-area") || $("stage");
                if (targetWrap) targetWrap.appendChild(ripple);
            }
            if (ripple) {
                ripple.innerHTML = isPlay 
                    ? `<svg viewBox="0 0 24 24" width="32" height="32" fill="#fff"><polygon points="5,3 19,12 5,21"/></svg>`
                    : `<svg viewBox="0 0 24 24" width="32" height="32" fill="#fff"><rect x="5" y="3" width="5" height="18"/><rect x="14" y="3" width="5" height="18"/></svg>`;
                ripple.classList.remove("animate");
                void ripple.offsetWidth; // Trigger reflow for re-animation
                ripple.classList.add("animate");
            }
        }

        const canvasArea = $("canvas-area");
        const stageArea = $("stage") || canvasArea;
        if (stageArea) {
            stageArea.addEventListener("mousemove", () => showControls(true));
        }
        canvasArea.addEventListener("touchend", (e) => {
            const gsOverlay = $("gs-overlay");
            const videoCircle = $("video-circle");
            const isOnControl = (controlsOverlay && controlsOverlay.contains(e.target)) || 
                                (settingsMenuEl && settingsMenuEl.contains(e.target)) || 
                                (videoCircle && videoCircle.contains(e.target)) || 
                                (gsOverlay && gsOverlay.contains(e.target));
            if (!isOnControl) {
                lastTouchTime = Date.now();
                toggleControls();
            }
        }, { passive: true });

        let stageClickTimer = null;
        canvasArea.addEventListener("click", (e) => {
            if (Date.now() - lastTouchTime < 500) return;
            const gsOverlay = $("gs-overlay");
            const videoCircle = $("video-circle");
            const isOnControl = (controlsOverlay && controlsOverlay.contains(e.target)) || 
                                (settingsMenuEl && settingsMenuEl.contains(e.target)) || 
                                (videoCircle && videoCircle.contains(e.target)) || 
                                (gsOverlay && gsOverlay.contains(e.target));
            if (isOnControl) return;

            if (stageClickTimer) {
                clearTimeout(stageClickTimer);
                stageClickTimer = null;
                toggleFullScreen();
                return;
            }

            stageClickTimer = setTimeout(() => {
                stageClickTimer = null;
                if (video.paused) {
                    video.play().catch(err => console.error("[Player] Play error:", err));
                    triggerPlayPauseRipple(true);
                } else {
                    video.pause();
                    triggerPlayPauseRipple(false);
                }
                showControls(true);
            }, 220);
        });

        video.addEventListener("pause", () => {
            releaseWakeLock();
            showControls(true);
        });
        video.addEventListener("play", () => {
            requestWakeLock();
            showControls(true);
        });
        showControls(true);

        // Fullscreen handles
        document.addEventListener("fullscreenchange", () => {
            const isFS = !!document.fullscreenElement;
            const fsBtnUi = $("fs-btn-ui");
            if (fsBtnUi) fsBtnUi.innerHTML = isFS ? `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#fff" stroke-width="2"><polyline points="4,14 10,14 10,20"/><polyline points="20,10 14,10 14,4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="14" y1="10" x2="21" y2="3"/></svg>` : `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#fff" stroke-width="2"><polyline points="15,3 21,3 21,9"/><polyline points="9,21 3,21 3,15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
            if (!isFS) {
                try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { }
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
            if (vcEl && !document.fullscreenElement) {
                vcEl.classList.add('fs-floating');
                vcEl.style.top = '12px';
                vcEl.style.right = '12px';
                vcEl.style.left = 'auto';
                vcEl.style.bottom = 'auto';
                vcEl.style.width = '220px';
                vcEl.style.height = '165px';
                vcEl.style.borderRadius = '8px';
                vcEl.style.zIndex = '2147483647';
                vcEl.style.cursor = 'grab';
                vcEl.style.boxShadow = '0 4px 20px rgba(0,0,0,0.7)';
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
            if (!document.fullscreenElement) {
                document.body.style.cursor = "default";
                return;
            }
            document.body.style.cursor = "default";
            clearTimeout(mouseTimer);
            mouseTimer = setTimeout(() => {
                if (document.fullscreenElement) {
                    document.body.style.cursor = "none";
                }
            }, 1200);
        }
        document.addEventListener("mousemove", handleActivity);
        document.addEventListener("mousedown", handleActivity);
        document.addEventListener("keydown", handleActivity);

        document.addEventListener("keydown", e => {
            if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
            if (e.code === "Space") {
                e.preventDefault();
                playBtn.click();
            }
            if (!engineLoaded) return;
            switch (e.code) {
                case "ArrowLeft": e.preventDefault(); seekToSec(video.currentTime - 10); break;
                case "ArrowRight": e.preventDefault(); seekToSec(video.currentTime + 10); break;
                case "KeyF": toggleFullScreen(); break;
            }
        });

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
            
            const activeCourse = COURSES.find(c => c.id === activeCourseId) || COURSES[0];
            
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
                        loadLectureByUid(lec.uid);
                    }
                };
                nav.appendChild(item);
            });
        }

        // Panel Toggle Arrow
        (function () {
            const panel = document.getElementById('right-panel');
            const toggleBtn = document.getElementById('panel-toggle');
            const vc = document.getElementById('video-circle');
            let panelOpen = true;

            const camPlaceholder = document.getElementById('cam-placeholder');

            function positionCamDocked() {
                if (!camPlaceholder) return;
                const r = camPlaceholder.getBoundingClientRect();
                if (r.width <= 0) return;
                vc.style.position = 'fixed';
                vc.style.left = r.left + 'px';
                vc.style.top = r.top + 'px';
                vc.style.width = r.width + 'px';
                vc.style.height = r.height + 'px';
                vc.style.right = 'auto';
                vc.style.bottom = 'auto';
                vc.style.borderRadius = '0';
                vc.style.zIndex = '9000';
                vc.style.cursor = 'default';
                vc.style.boxShadow = 'none';
            }

            function positionCamFloating() {
                vc.style.position = 'fixed';
                vc.style.top = '12px';
                vc.style.right = '12px';
                vc.style.left = 'auto';
                vc.style.bottom = 'auto';
                vc.style.width = '200px';
                vc.style.height = '150px';
                vc.style.borderRadius = '8px';
                vc.style.zIndex = '9999';
                vc.style.cursor = 'grab';
                vc.style.boxShadow = '0 4px 20px rgba(0,0,0,0.6)';
            }

            function applyPanelState() {
                if (panelOpen) {
                    panel.classList.remove('collapsed');
                    document.body.classList.remove('panel-closed');
                    toggleBtn.style.right = '280px';
                    toggleBtn.innerHTML = '&#10095;';
                    setTimeout(positionCamDocked, 10);
                    setTimeout(positionCamDocked, 320);
                } else {
                    panel.classList.add('collapsed');
                    document.body.classList.add('panel-closed');
                    toggleBtn.style.right = '0px';
                    toggleBtn.innerHTML = '&#10094;';
                    positionCamFloating();
                }
                setTimeout(() => { resizeCanvas(true); }, 320);
            }

            window.positionCamDocked = positionCamDocked;
            window.positionCamFloating = positionCamFloating;
            window.applyPanelState = applyPanelState;

            toggleBtn.addEventListener('click', () => {
                panelOpen = !panelOpen;
                applyPanelState();
            });

            applyPanelState();

            window.addEventListener('resize', () => {
                if (panelOpen && !document.fullscreenElement) {
                    requestAnimationFrame(positionCamDocked);
                }
            });

            // Educator circle draggable functionality when floating
            (function () {
                let isDragging = false;
                let startX, startY, startL, startT;

                function isFloating() {
                    return document.body.classList.contains('panel-closed') || vc.classList.contains('fs-floating');
                }

                vc.addEventListener('mousedown', function (e) {
                    if (!isFloating()) return;
                    if (e.button !== 0) return;
                    e.preventDefault();
                    isDragging = true;
                    var r = vc.getBoundingClientRect();
                    vc.style.left = r.left + 'px';
                    vc.style.top = r.top + 'px';
                    vc.style.right = 'auto';
                    vc.style.bottom = 'auto';
                    startX = e.clientX;
                    startY = e.clientY;
                    startL = r.left;
                    startT = r.top;
                    vc.style.cursor = 'grabbing';
                    vc.style.transition = 'none';
                    vc.style.userSelect = 'none';
                });

                document.addEventListener('mousemove', function (e) {
                    if (!isDragging) return;
                    var dx = e.clientX - startX;
                    var dy = e.clientY - startY;
                    var newL = startL + dx;
                    var newT = startT + dy;
                    newL = Math.max(0, Math.min(window.innerWidth - vc.offsetWidth, newL));
                    newT = Math.max(0, Math.min(window.innerHeight - vc.offsetHeight, newT));
                    vc.style.left = newL + 'px';
                    vc.style.top = newT + 'px';
                });

                document.addEventListener('mouseup', function () {
                    if (!isDragging) return;
                    isDragging = false;
                    vc.style.cursor = 'grab';
                    vc.style.userSelect = '';
                });

                // Touch drag support
                vc.addEventListener('touchstart', function (e) {
                    if (!isFloating()) return;
                    var t = e.touches[0];
                    var r = vc.getBoundingClientRect();
                    vc.style.left = r.left + 'px';
                    vc.style.top = r.top + 'px';
                    vc.style.right = 'auto';
                    vc.style.bottom = 'auto';
                    startX = t.clientX; startY = t.clientY;
                    startL = r.left; startT = r.top;
                    isDragging = true;
                    vc.style.transition = 'none';
                    e.preventDefault();
                }, { passive: false });

                document.addEventListener('touchmove', function (e) {
                    if (!isDragging) return;
                    var t = e.touches[0];
                    var newL = startL + (t.clientX - startX);
                    var newT = startT + (t.clientY - startY);
                    newL = Math.max(0, Math.min(window.innerWidth - vc.offsetWidth, newL));
                    newT = Math.max(0, Math.min(window.innerHeight - vc.offsetHeight, newT));
                    vc.style.left = newL + 'px';
                    vc.style.top = newT + 'px';
                    e.preventDefault();
                }, { passive: false });

                document.addEventListener('touchend', function () {
                    isDragging = false;
                    vc.style.cursor = 'grab';
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
            for (const c of [slideCanvas, hlCanvas, penCanvas, eraserCanvas, drawCanvas, shapePreviewCanvas, laserCanvas]) {
                if (c) {
                    const ctx = c.getContext("2d");
                    if (ctx) {
                        const dpr = window.devicePixelRatio || 1;
                        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                        ctx.clearRect(0, 0, CW || c.width, CH || c.height);
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

// Export bindings
export { runEngine, loadLectureByUid, processData, syncLoop, doSeek, switchPanelTab, destroyEngine };
window.runEngine = runEngine;
window.loadLectureByUid = loadLectureByUid;
window.processData = processData;
window.syncLoop = syncLoop;
window.doSeek = doSeek;
window.destroyEngine = destroyEngine;
window.$ = $;
window.video = video;
window.resizeCanvas = resizeCanvas;
window.setStatus = setStatus;
window.switchPanelTab = switchPanelTab;
