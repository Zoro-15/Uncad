// Canvas Rendering Engine - Contexts, Transforms, Vector Ink, and Laser Trails
import { loadCachedImage } from './networkLoader.js';

let CW = 1080;
let CH = 608;
let dpr = window.devicePixelRatio || 1;

let slideCanvas, hlCanvas, penCanvas, eraserCanvas, drawCanvas, shapePreviewCanvas, laserCanvas;
let slideCtx, hlCtx, penCtx, eraserCtx, drawCtx, shapePreviewCtx, laserCtx;

function initCanvasContexts() {
    slideCanvas = document.getElementById("slide-canvas");
    hlCanvas = document.getElementById("hl-canvas");
    penCanvas = document.getElementById("pen-canvas");
    eraserCanvas = document.getElementById("eraser-canvas");
    drawCanvas = document.getElementById("draw-canvas");
    shapePreviewCanvas = document.getElementById("shape-preview-canvas");
    laserCanvas = document.getElementById("laser-canvas");

    if (!slideCanvas) return;

    slideCtx = slideCanvas.getContext("2d", { alpha: false });
    hlCtx = hlCanvas.getContext("2d", { alpha: true });
    penCtx = penCanvas.getContext("2d", { alpha: true });
    eraserCtx = eraserCanvas.getContext("2d", { alpha: true });
    drawCtx = drawCanvas.getContext("2d", { alpha: true });
    shapePreviewCtx = shapePreviewCanvas.getContext("2d", { alpha: true });
    laserCtx = laserCanvas.getContext("2d", { alpha: true });
}

function resizeCanvas(force = false, targetWidth = 1080, targetHeight = 608) {
    if (!slideCanvas) initCanvasContexts();
    if (!slideCanvas) return;

    CW = targetWidth;
    CH = targetHeight;
    dpr = window.devicePixelRatio || 1;

    const area = document.getElementById("canvas-area");
    if (!area) return;

    const rect = area.getBoundingClientRect();
    const width = rect.width || 1080;
    const height = rect.height || 608;

    const canvases = [slideCanvas, hlCanvas, penCanvas, eraserCanvas, drawCanvas, shapePreviewCanvas, laserCanvas];
    canvases.forEach(c => {
        if (!c) return;
        c.width = width * dpr;
        c.height = height * dpr;
        c.style.width = `${width}px`;
        c.style.height = `${height}px`;
        const ctx = c.getContext("2d");
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
}

function clearAllCanvases() {
    if (!slideCtx) return;
    const contexts = [slideCtx, hlCtx, penCtx, eraserCtx, drawCtx, shapePreviewCtx, laserCtx];
    contexts.forEach(ctx => {
        if (ctx) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, slideCanvas.width, slideCanvas.height);
            ctx.restore();
        }
    });
}

async function renderSlideBackground(url, color = "#000000") {
    if (!slideCtx) return;
    slideCtx.save();
    slideCtx.fillStyle = color;
    slideCtx.fillRect(0, 0, slideCanvas.width, slideCanvas.height);

    if (url) {
        const img = await loadCachedImage(url);
        if (img) {
            slideCtx.drawImage(img, 0, 0, slideCanvas.width / dpr, slideCanvas.height / dpr);
        }
    }
    slideCtx.restore();
}

export {
    initCanvasContexts,
    resizeCanvas,
    clearAllCanvases,
    renderSlideBackground,
    slideCtx,
    hlCtx,
    penCtx,
    eraserCtx,
    drawCtx,
    shapePreviewCtx,
    laserCtx
};
