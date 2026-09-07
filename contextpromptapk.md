# Context Prompt: Runcadel Player Android APK (Capacitor by Ionic Architecture)

> **Master Context & Architecture Blueprint for AI Assistants & Developers**  
> This file contains the complete system architecture, lessons learned from prior custom Android WebView attempts, and the step-by-step roadmap for building and deploying the native Android APK using **Capacitor by Ionic**.

---

## 1. Project Overview & Core Mission

**Runcadel Player (Lennister Player)** is an ultra-lightweight, reverse-engineered telemetric education player. Instead of streaming heavy 1080p full-desktop screen recordings, the system decouples lecture playback into two synchronized streams:
1. **Lightweight Video Stream** (`output.webm`): Low-bitrate educator camera stream (~50–150 MB for a 2-hour lecture).
2. **Encrypted Telemetry Vector Stream** (`data.json` / `securejson.json`): Chronological whiteboard telemetry (~2–8 MB) containing XOR-encrypted drawing commands, geometric shapes, highlighters, pen ink, erasers, laser trails, and PDF slide page references.

On the client side, a high-performance JavaScript engine decrypts, parses, and renders these vectors onto a multi-layered HTML5 `<canvas>` stack at 60 FPS in exact sub-second sync with the video.

### The Problem We Are Solving:
The web application running in Google Chrome (installed via Chrome's "Add to Home screen" PWA) provided an exceptional, smooth, 60fps experience with flawless touch controls. However, running purely inside a sandboxed mobile browser failed to satisfy key **offline study needs**:
- Inability to persist access to external storage / SD-card lecture folders without manual reprompting every session.
- Browser memory bottlenecks when streaming 2GB+ local video files through object URLs without byte-range seeking.
- Inability to rasterize local notes PDF slide backgrounds when in complete airplane mode without an active network connection.

---

## 2. Post-Mortem: Why the Custom Native Android WebView APK Failed

Earlier iterations attempted to build a custom Android APK from scratch (`runcadel-offline-apk`) using Android's raw `android.webkit.WebView` and Kotlin. This introduced subtle, critical touch and rendering issues:

### 1. Android WindowManager OS Gesture Swallowing
- In the custom APK, `setupImmersiveMode()` called:
  ```kotlin
  WindowCompat.setDecorFitsSystemWindows(window, false)
  controller.hide(WindowInsetsCompat.Type.systemBars())
  controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
  ```
- **Consequence**: When transient system bars are active, Android's WindowManager reserves the top 24–48dp of the display to detect pull-down system swipe gestures. When the user attempted to tap the top hamburger menu button or category navigation pills, **the Android OS swallowed the touch events at the WindowManager layer**, preventing them from ever being dispatched to the DOM.

### 2. Viewport Scaling & Coordinate Hit-Test Distortion
- Setting `settings.useWideViewPort = true` and `settings.loadWithOverviewMode = true` in Android WebView caused the engine to emulate a virtual desktop viewport (~980px width).
- **Consequence**: Touch event coordinates passed to Blink/WebKit were mathematically offset from the visual layout, causing taps on mobile buttons to miss their targets completely.

### 3. Touchscreen Synthetic Click Race Conditions
- On mobile touchscreens, a user tap triggers a sequence: `touchstart` $\rightarrow$ `touchend` $\rightarrow$ (200–300ms delay) $\rightarrow$ synthetic `click`.
- When modal drawers or backdrops were toggled on `touchend`, the subsequent synthetic `click` landed directly on the newly created backdrop, instantly closing the menu before the user could see it.

### Why Capacitor by Ionic is the Solution:
- **Native Chrome Engine**: Capacitor uses the standard Android System WebView with battle-tested viewport and touch configuration identical to Google Chrome.
- **Proper Safe-Area Inset Handling**: System bars, notches, and status bars are managed gracefully via the official `@capacitor/status-bar` and CSS `env(safe-area-inset-*)`.
- **Plugin Ecosystem**: Native Android Storage Access Framework (SAF), persistent file access, and background capabilities can be plugged in as modular Capacitor plugins without hacking raw Activity lifecycles.
- **Single Source of Truth**: The existing Vite web application (`index.html`, `src/`) remains the exact codebase, eliminating discrepancies between web and mobile builds.

---

## 3. Telemetry Engine & Web Architecture

### 1. Encryption & Decryption
- **Cipher**: XOR byte decryption via `tryDecryptAndParse()`.
- **Master Key**: `9ffdc791579b19df35315e4d81a4aacda41d4c1ddaa318a4cba133111e20540e`
- **Key Mappings**:
  - `_k1` $\rightarrow$ `c_id`, `_k2` $\rightarrow$ `p_time`, `_k3` $\rightarrow$ `plugin`, `_k4` $\rightarrow$ `data`, `_k5` $\rightarrow$ `id`, `_k6` $\rightarrow$ `ct`
  - `_p1` $\rightarrow$ `dcn`, `_p2` $\rightarrow$ `cw`, `_p3` $\rightarrow$ `mcn`, `_p4` $\rightarrow$ `pl`
  - Event codes: `009A` $\rightarrow$ `sc` (slide change), `002F` $\rightarrow$ `as`, `005B` $\rightarrow$ `sbc`, `004E` $\rightarrow$ `ea`, `007B` $\rightarrow$ `cc`, `003A` $\rightarrow$ `mc`, `006C` $\rightarrow$ `pstc`, `008D` $\rightarrow$ `estc`, `001C` $\rightarrow$ `pn`, `002E` $\rightarrow$ `zm` (zoom), `001F` $\rightarrow$ `d`, `002B` $\rightarrow$ `m`, `003C` $\rightarrow$ `u`, `004F` $\rightarrow$ `p`, `005E` $\rightarrow$ `dlos`

### 2. Multi-Layer Canvas Rendering Stack
The whiteboard display uses 6 stacked HTML5 `<canvas>` elements for smooth rendering:
1. `#slide-canvas`: High-resolution PDF background slide images.
2. `#hl-canvas`: Translucent highlighter strokes (`globalAlpha = 0.35`).
3. `#draw-canvas`: Vector geometry (rectangles, ellipses, coordinate grids).
4. `#pen-canvas`: Educator pen strokes rendered using cubic Bezier curve fitting (`fitCurve`).
5. `#eraser-canvas`: Object erasing and stroke excision.
6. `#laser-canvas`: Fading laser pointer animation trail.

### 3. Synchronization Loop
- A 60 FPS `requestAnimationFrame` loop (`syncLoop()`) polls the HTML5 `<video>` element's `currentTime`.
- Telemetry commands are indexed by timestamp. When `currentTime` updates, pen strokes and slide changes are painted deterministically.

---

## 4. Capacitor by Ionic Implementation Plan

### Step 1: Project Initialization
Run in root directory (`c:\Users\ok\Documents\unac`):
```bash
# 1. Install Capacitor core and CLI
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli

# 2. Initialize Capacitor
npx cap init "Runcadel Player" "com.runcadel.player" --web-dir "dist"

# 3. Install essential plugins
npm install @capacitor/status-bar @capacitor/keyboard @capacitor/app @capacitor/filesystem @capacitor/preferences @capacitor/screen-orientation
```

### Step 2: Capacitor Configuration (`capacitor.config.ts`)
Create `capacitor.config.ts` in the root:
```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.runcadel.player',
  appName: "Runcadel's Player",
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: '#09090b',
      style: 'DARK'
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true
    }
  }
};

export default config;
```

### Step 3: Android Platform Setup
```bash
# Add Android native platform
npx cap add android

# Build the web bundle
npm run build

# Sync assets to native project
npx cap sync android
```

### Step 4: Storage Access Framework (SAF) & Offline Storage Handling
To support opening downloaded course folders on internal storage / SD cards without manual re-picking:
1. **Option A (Capacitor File System Plugin)**:
   Use `@capacitor/filesystem` with directory scopes (`Directory.Documents` or `Directory.ExternalStorage`).
2. **Option B (Custom Capacitor Plugin for SAF `OPEN_DOCUMENT_TREE`)**:
   Create a lightweight Capacitor plugin (in `android/app/src/main/java/.../SafPlugin.kt`) registering an intent launcher for `Intent.ACTION_OPEN_DOCUMENT_TREE`:
   - Requests persistent read permissions (`takePersistableUriPermission`).
   - Persists the tree URI in Android `SharedPreferences`.
   - Iterates folder contents to return lecture metadata (`output.webm`, `data.json`, notes PDF).

### Step 5: Offline Video Streaming & PDF Extraction
- **Offline Video**: Capacitor's local HTTPS scheme (`https://localhost/` or `https://appassets.androidplatform.net/`) supports byte-range streaming (`206 Partial Content`) for HTML5 `<video>` tags directly from local storage.
- **Offline Slides**: Use `pdfjs-dist` inside the web app for vector PDF rendering in airplane mode, or call Android's native `android.graphics.pdf.PdfRenderer` via a Capacitor plugin.

---

## 5. UI/UX & Interaction Design Guidelines

1. **Theme & Typography**:
   - Dark background: `#09090b`
   - Primary surface: `#18181b`
   - Accent color: Crimson `#ef4444` / `#f87171`
   - Fonts: `Outfit` (sans-serif) and `JetBrains Mono` (monospace) from Google Fonts.
2. **Category Navigation Pill Bar**:
   - Keep the persistent sticky category bar (`.db-category-bar`) with 1-tap direct buttons for:
     - `My Courses`
     - `Mathematics`
     - `Physics`
     - `Chemistry`
     - `Crash Course`
     - `Phy OS`
     - `Offline Mode`
3. **Fullscreen Behavior (Intentional Rules)**:
   - **Dashboard Browsing**: Status bar remains visible with `#09090b` background. Top touches MUST NOT be intercepted by OS swipe gestures.
   - **Video Playback**: Automatically triggers immersive fullscreen mode when a video starts playing or when the student taps the logo / fullscreen button.
   - **Slide Review**: Pausing the video to inspect slides or study notes excludes the view from forced fullscreen so controls remain accessible.
4. **Android Back Button Integration**:
   - Register `@capacitor/app` listener:
     ```javascript
     import { App } from '@capacitor/app';
     App.addListener('backButton', ({ canGoBack }) => {
         if (window.handleBackNavigation && window.handleBackNavigation()) {
             // Handled internally (closed menu, closed drawer, or exited video)
             return;
         }
         if (canGoBack) {
             window.history.back();
         } else {
             App.exitApp();
         }
     });
     ```

---

## 6. Build & CI/CD Deployment

### Local Builds:
```bash
# 1. Build Vite web bundle
npm run build

# 2. Sync to Android project
npx cap sync android

# 3. Open in Android Studio or compile via Gradle
cd android
./gradlew assembleDebug
```

### GitHub Actions Workflow (`.github/workflows/build-apk.yml`):
```yaml
name: Build Capacitor Android APK

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Build Web App
        run: npm run build

      - name: Sync Capacitor Android
        run: npx cap sync android

      - name: Setup Java 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: 17

      - name: Build Debug APK
        run: |
          cd android
          chmod +x gradlew
          ./gradlew assembleDebug --stacktrace

      - name: Upload APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: runcadel-player-capacitor-debug
          path: android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 7. Summary of Files & Directories in this Workspace

- `c:\Users\ok\Documents\unac\index.html`: Root HTML template and player container.
- `c:\Users\ok\Documents\unac\src\main.js`: Main bootstrap script.
- `c:\Users\ok\Documents\unac\src\dashboard.js`: Dashboard views, course navigation, and study progress.
- `c:\Users\ok\Documents\unac\src\player.js`: Telemetry engine, video sync loop, and multi-canvas rendering.
- `c:\Users\ok\Documents\unac\src\courses.js`: Course catalog and lecture endpoint mappings.
- `c:\Users\ok\Documents\unac\src\style.css`: Unified CSS design system.
- `c:\Users\ok\Documents\unac\contextpromptapk.md`: This file (master context and Capacitor blueprint).


Quick Start with Capacitor
When you are ready to begin the Capacitor build, run the following commands in the root directory (c:\Users\ok\Documents\unac):

bash
# 1. Install Capacitor dependencies
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli
npm install @capacitor/status-bar @capacitor/keyboard @capacitor/app @capacitor/filesystem
# 2. Initialize Capacitor
npx cap init "Runcadel Player" "com.runcadel.player" --web-dir "dist"
# 3. Add Android platform & build
npx cap add android
npm run build
npx cap sync android
