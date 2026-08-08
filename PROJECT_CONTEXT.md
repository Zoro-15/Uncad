# PROJECT CONTEXT: Lennister Player (JEE Advanced Calculus Telemetric Player)

## Overview
Lennister Player is a lightweight, reverse-engineered telemetric web player running locally on modern browsers. Instead of traditional heavy desktop screen recordings, it uses a lightweight facecam video stream (`output.webm`) synchronized with an encrypted, timestamped telemetry JSON payload (`data.json` / `securejson.json`). A custom JavaScript engine decrypts, deobfuscates, and renders teacher pen strokes, highlighters, geometric shapes, and PDF slide backgrounds in real-time onto stacked HTML5 `<canvas>` elements.

---

## Technical Stack & Key Components

### 1. Catalog & Direct CDN Endpoints
- **Target Course:** Course on Calculus for JEE Advanced Part-I (48 Lectures by Sandal Agarwal).
- **Video Endpoint Format:** `https://uamedia.uacdn.net/lesson-raw/<UID>/output.webm`
- **Telemetry Endpoint Format:** `https://uamedia.uacdn.net/lesson-raw/<UID>/data.json` or `securejson.json`
- **Fallback Routing:** Directly fetches from CDN endpoints, with a `corsproxy.io` fallback (`https://corsproxy.io/?<URL>`) if needed.

### 2. Encryption & Deobfuscation
- **Cipher:** XOR byte decryption via `tryDecryptAndParse()`.
- **Master Key:** `9ffdc791579b19df35315e4d81a4aacda41d4c1ddaa318a4cba133111e20540e`
- **Key Mappings:**
  - `_k1` -> `c_id`, `_k2` -> `p_time`, `_k3` -> `plugin`, `_k4` -> `data`, `_k5` -> `id`, `_k6` -> `ct`
  - `_p1` -> `dcn`, `_p2` -> `cw`, `_p3` -> `mcn`, `_p4` -> `pl`
  - Event codes: `009A` -> `sc`, `002F` -> `as`, `005B` -> `sbc`, `004E` -> `ea`, `007B` -> `cc`, `003A` -> `mc`, `006C` -> `pstc`, `008D` -> `estc`, `001C` -> `pn`, `002E` -> `zm`, `001F` -> `d`, `002B` -> `m`, `003C` -> `u`, `004F` -> `p`, `005E` -> `dlos`

### 3. Rendering Pipeline
- **Multi-Layer Canvas Stack:**
  1. `slide-canvas` (PDF slide image backgrounds)
  2. `hl-canvas` (Highlighter / marker strokes, opacity 0.35)
  3. `draw-canvas` (Geometric vectors and shapes)
  4. `pen-canvas` (Main pen ink strokes)
  5. `eraser-canvas` (Object and path erasing)
  6. `laser-canvas` (Fading laser pointer trail)
- **Vector Engine:**
  - Dynamic DPR (Device Pixel Ratio) scaling.
  - Cubic Bezier curve fitting (`fitCurve`, `fitCubic`, Newton-Raphson root finding) for smooth pen lines.
  - Transformation matrices (`DOMMatrix`) for board panning (`curPanX`, `curPanY`) and zooming (`curZoom`).

### 4. Hardware-Accelerated SVG Chroma Keying
- **Filter ID:** `#chroma-key` applied via CSS `filter: url(#chroma-key)` directly to the educator `<video>` element.
- **Color Operations:** Multi-pass `feColorMatrix` removes green background, neutralizes green spill edge tint (`despilled`), and sharpens alpha transparency.

### 5. Execution Environment Requirement
- **Local HTTP Server:** MUST be run via an HTTP server (`http://localhost:3000`, `http://localhost:8000`, or Live Server). Running directly from `file:///` causes browser security origin blocks on cross-origin image drawing and video duration metadata reading.

---

## Core JavaScript Functions
- `loadLectureByUid(uid)`: Purges memory, updates video source, fetches corresponding telemetry, and re-initializes engine.
- `runEngine(url)`: Fetches array buffer, runs `tryDecryptAndParse()`, triggers `processData()`, and handles canvas resizing.
- `processData(raw)`: Extracts chronological slide timelines and drawing vector streams.
- `syncSlidesToVideoTime(sec)`: Matches current video playback time to telemetry timeline and updates slide canvas.
- `syncLoop()`: `requestAnimationFrame` loop that drives time displays, seek bar positioning, and slide synchronization.
- `seekTo(targetSec)`: Updates video time, resets telemetry frame pointer, and forces instant re-draw.