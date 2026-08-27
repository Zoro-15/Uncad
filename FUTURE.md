# 🚀 Unacademy Course Extraction & Offline Engine Blueprint (`FUTURE.md`)

> **For Future LLMs & Developers:** Read this document carefully. This details the exact methodology for reverse-engineering, extracting, and integrating complete Unacademy courses (videos, telemetry whiteboard data, annotated notes, clean slides, and durations) from **just a single course link**, with zero paid subscription required.

---

## 📑 Table of Contents
1. [🧭 Step-by-Step Protocol for Future Conversations](#-step-by-step-protocol-for-future-conversations)
2. [Core Architecture & Why Naive Scraping Fails](#1-core-architecture--why-naive-scraping-fails)
3. [The Single-Link Extraction Methodology (Next.js SSR Hydration)](#2-the-single-link-extraction-methodology-nextjs-ssr-hydration)
4. [Unacademy CDN Endpoint Architecture](#3-unacademy-cdn-endpoint-architecture)
5. [Slide Notes & PDF Resolution Rules](#4-slide-notes--pdf-resolution-rules)
6. [Web App Integration Workflow](#5-web-app-integration-workflow)
7. [Offline Mode & Local Folder Engine](#6-offline-mode--local-folder-engine)
8. [Google Colab Automation Blueprints](#7-google-colab-automation-blueprints)
9. [Gotchas, Pitfalls & Known Edge Cases](#8-gotchas-pitfalls--known-edge-cases)

---

## 🧭 Step-by-Step Protocol for Future Conversations

> **INSTRUCTION FOR NEXT LLM:** When the user gives you an Unacademy course link in a new chat (e.g. `https://unacademy.com/course/.../{COURSE_UID}`), **DO NOT attempt external scraping or tell the user they need a subscription.** Follow these exact 5 steps:

```
Step 1: Guide User with 1-Line Console Extractor
   └── Ask user to open the URL in Chrome/Edge and paste the snippet in F12 Console.

Step 2: User Pastes the JSON Payload
   └── Parse courseFallbackData (title, educator) and lessonListFallbackData (lectures).

Step 3: Extract Stream UIDs, Durations & Slide PDFs
   └── Map 20-char UID from videoUrl / slidesPdf, convert videoDuration to "Xh Ym".

Step 4: Integrate into Web App Catalog
   └── Append course object to src/courses.js and update scripts/pdf_links_cache.json.

Step 5: Deliver Tailored Google Drive Downloader & Space Analyzer
   └── Provide Google Colab script targeting https://uamedia.uacdn.net/lesson-raw/{UID}/output.webm.
```

### 🔹 Step 1: The Initial Instruction to Give to User
When user provides a link:
```text
To extract this course immediately without requiring login or subscription:
1. Open the course link in your browser: <COURSE_URL>
2. Press F12 (Developer Tools) -> click the 'Console' tab.
3. Paste and run this 1-line extractor:
   copy(JSON.stringify(window.__NEXT_DATA__?.props?.pageProps || "NOT_FOUND")); alert("Copied to clipboard!");
4. Press Ctrl + V to paste the output here!
```

### 🔹 Step 2: Parse the Extracted Payload
When user pastes the JSON, extract:
* `courseFallbackData.name` $\rightarrow$ Course Title
* `courseFallbackData.author.name` $\rightarrow$ Educator Name
* `lessonListFallbackData.results` $\rightarrow$ Array of lectures:
  * `rank`: `item.rank`
  * `title`: `item.value.title`
  * `uid`: Extracted 20-character alphanumerical ID from `item.value.liveClass.slidesPdf.withAnnotation` or `item.value.liveClass.videoUrl` (e.g. `EDXNDNFRLD5BYZLYI12I`)
  * `duration`: Formatted from `item.value.liveClass.videoDuration` (seconds $\rightarrow$ `"1h 38m"`)
  * `pdfUrl`: `item.value.liveClass.slidesPdf.withAnnotation`
  * `pdfCleanUrl`: `item.value.liveClass.slidesPdf.noAnnotation`

### 🔹 Step 3: Insert into `src/courses.js`
Format the course object and append to `COURSES` in `src/courses.js`:
```javascript
{
    id: "<slug-id>",
    title: "<Course Title>",
    subtitle: "<Educator> • Comprehensive Problem Solving & Revision",
    description: "...",
    badge: "<Count> Lessons • Crash Course",
    educator: "<Educator Name>",
    educatorRole: "JEE Specialist",
    rating: "4.95",
    reviewsCount: "1.5k",
    lessonsCount: <Lectures Length>,
    totalDuration: "<Calculated Total Time>",
    subject: "Chemistry", // or "Mathematics", "Physics", "Crash Course", "Phy OS"
    subjectIcon: "fa-flask-vial",
    subjectColor: "#ec4899",
    lectures: [...]
}
```

### 🔹 Step 4: Deliver Google Colab Downloader
Provide the user with a Colab script downloading:
1. **Video Stream:** `https://uamedia.uacdn.net/lesson-raw/{UID}/output.webm` (Save as `output.webm`)
2. **Telemetry Events:** `https://uamedia.uacdn.net/lesson-raw/{UID}/data.json` (Save as `data.json`)
3. **Annotated PDF:** `notes_with_anno.pdf`
4. **Clean PDF:** `notes_no_anno.pdf`
5. **Metadata:** `metadata.json`

*(Do NOT create redundant duplicate files like `replay_high.webm` or `events.json` to save 50% Drive storage).*

---

## 1. Core Architecture & Why Naive Scraping Fails

### ❌ The Common Traps
* **No Public REST Endpoints:** Calling `https://unacademy.com/api/v3/course_schedules/?course_uid=...` returns **`HTTP 404 Not Found`**. Unacademy replaced open REST schedules with internal GraphQL RPCs.
* **No Paid Subscription Needed:** Many assume you need an active Plus/Iconic subscription to get stream data. **You do NOT.** Course preview catalogs are pre-rendered server-side for SEO and marketing.
* **Unguessable 20-Character Stream UIDs:** Unacademy secures streams via cryptographic 20-character alphanumerical identifiers (e.g. `EDXNDNFRLD5BYZLYI12I`), not cookies. Once you have the UID, all media is freely accessible on their public Akamai/AWS edge CDNs.

---

## 2. The Single-Link Extraction Methodology (Next.js SSR Hydration)

Unacademy is a **Next.js Server-Side Rendered (SSR) React Application**. When any course link is opened in a web browser (even logged out / incognito):

```
https://unacademy.com/course/{slug}/{COURSE_UID}
```

The server fetches the full course tree and serializes it into `window.__NEXT_DATA__.props.pageProps`.

### ⚡ The 1-Line Browser Console Extractor
Open the course page in Chrome/Edge, press **F12** (Developer Tools) $\rightarrow$ **Console**, and run:

```javascript
copy(JSON.stringify(window.__NEXT_DATA__?.props?.pageProps || "NOT_FOUND")); alert("Extracted full course data to clipboard!");
```

### 📦 Key Fields Inside the Extracted JSON Payload
```json
{
  "key": "ZU29ZHB4",
  "courseFallbackData": {
    "name": "Antim Prahaar: Crash Course on Chemistry for JEE Main 2025",
    "author": { "name": "Vishal Singh" },
    "itemCount": 24,
    "description": "..."
  },
  "lessonListFallbackData": {
    "count": 24,
    "results": [
      {
        "rank": 1,
        "value": {
          "uid": "F00USSME",
          "title": "L-01:Chemical Bonding and Periodic properties 1",
          "liveClass": {
            "videoDuration": 5938,
            "videoUrl": "https://player.uacdn.net/liveweb/v4032/index.html?replay=true&uid=EDXNDNFRLD5BYZLYI12I&chat_id=F00USSME",
            "slidesPdf": {
              "withAnnotation": "https://player.uacdn.net/slides_pdf/EDXNDNFRLD5BYZLYI12I/L01Chemical_Bonding_and_Periodic_properties_1_with_anno.pdf",
              "noAnnotation": "https://player.uacdn.net/slides_pdf/EDXNDNFRLD5BYZLYI12I/L01Chemical_Bonding_and_Periodic_properties_1_no_anno.pdf"
            }
          }
        }
      }
    ]
  }
}
```

---

## 3. Unacademy CDN Endpoint Architecture

Every live lecture consists of 4 distinct files hosted across two primary CDN subdomains:

### 1. High-Resolution Video Stream (`output.webm`)
* **Live CDN Endpoint:** `https://uamedia.uacdn.net/lesson-raw/{UID}/output.webm`
* **Status:** `HTTP 200 OK` (Direct download, ~100MB - ~200MB per lecture)
* **Format:** WebM container with VP8/VP9 video & Opus audio.

### 2. Telemetry & Whiteboard Events (`data.json`)
* **Live CDN Endpoint:** `https://uamedia.uacdn.net/lesson-raw/{UID}/data.json`
* **Status:** `HTTP 200 OK` (Raw vector strokes, teacher slide changes, pointer events)
* **Decryption/Parsing:** Handled by our engine in `src/player.js` (`processData`, XOR deobfuscation).

### 3. Teacher Annotated Slide Notes (`notes_with_anno.pdf`)
* **Endpoint:** `https://player.uacdn.net/slides_pdf/{UID}/{Clean_Title_Slug}_with_anno.pdf`
* **Status:** `HTTP 200 OK`

### 4. Clean Student Slide Deck (`notes_no_anno.pdf`)
* **Endpoint:** `https://player.uacdn.net/slides_pdf/{UID}/{Clean_Title_Slug}_no_anno.pdf`
* **Status:** `HTTP 200 OK`

---

## 4. Slide Notes & PDF Resolution Rules

### ⚠️ Slug Sanitization Gotcha
Naive replacements (e.g. `.replace(" ", "_")`) produce filenames like `Properties_of_Triangle_(SOT)_Lec-1_with_anno.pdf`. The CDN **rejects** symbols like `(`, `)`, `-`, `:`, `&`, `!`, `,`, and `?` with `HTTP 404/403`.

**Correct Slug Regex:**
```javascript
function sanitizeSlug(title) {
    return title.replace(/[\s\/:?#\-()&!,]+/g, '_').replace(/^_+|_+$/g, '');
}
```

### PDF Link Cache
All verified PDF links are stored in `scripts/pdf_links_cache.json` keyed by UID:
```json
{
  "EDXNDNFRLD5BYZLYI12I": {
    "annotated": "https://player.uacdn.net/slides_pdf/EDXNDNFRLD5BYZLYI12I/L01Chemical_Bonding_and_Periodic_properties_1_with_anno.pdf",
    "clean": "https://player.uacdn.net/slides_pdf/EDXNDNFRLD5BYZLYI12I/L01Chemical_Bonding_and_Periodic_properties_1_no_anno.pdf"
  }
}
```

---

## 5. Web App Integration Workflow

When adding a new course into this repository:

1. **Update `src/courses.js`:**
   Add the course metadata object into the `COURSES` array:
   ```javascript
   {
       id: "antim-prahaar-chemistry-2025",
       title: "Antim Prahaar: Crash Course on Chemistry for JEE Main 2025",
       subtitle: "Vishal Singh • Comprehensive Problem Solving & Fast-Track Revision",
       description: "...",
       badge: "24 Lessons • Crash Course",
       educator: "Vishal Singh",
       educatorRole: "JEE Advanced Chemistry Specialist",
       rating: "4.95",
       reviewsCount: "1.8k",
       lessonsCount: 24,
       totalDuration: "37h 50m",
       subject: "Crash Course", // or Mathematics, Physics, Chemistry, Phy OS
       subjectIcon: "fa-flask-vial",
       subjectColor: "#ec4899",
       lectures: [
           {
               rank: 1,
               title: "L-01:Chemical Bonding and Periodic properties 1",
               uid: "EDXNDNFRLD5BYZLYI12I",
               duration: "1h 38m",
               pdfUrl: "https://player.uacdn.net/slides_pdf/...",
               pdfCleanUrl: "https://player.uacdn.net/slides_pdf/..."
           }
       ]
   }
   ```

2. **Category Routing (`src/dashboard.js` & `index.html`):**
   * Drawer categories: `Mathematics`, `Physics`, `Chemistry`, `Crash Course` (`Mentorship`), and `Phy OS`.
   * Ensure `renderSubjectGrid` matches your subject tag.

---

## 6. Offline Mode & Local Folder Engine

Our offline playback engine (`src/ui/localFileLoader.js` & `src/player.js`) enables 100% offline playback from downloaded Google Drive folders:

### Expected Folder Hierarchy
```
chemistry crash course/
└── Lec_01_Chemical Bonding 1_EDXNDNFRLD5BYZLYI12I/
    ├── output.webm          (Video)
    ├── data.json            (Telemetry events)
    ├── notes_with_anno.pdf  (Teacher annotated notes)
    ├── notes_no_anno.pdf    (Clean slides)
    └── metadata.json        (Metadata & title)
```

### Smart File Matching Engine
* **Video:** Matches `output.webm`, `replay_high.webm`, `output.mp4`, or any `*.webm`/`*.mp4`.
* **Telemetry:** Matches `data.json`, `events.json`, or any `*.json` (excluding `metadata.json`).
* **Dual PDFs:** Automatically attaches `notes_with_anno.pdf` as Annotated Notes and `notes_no_anno.pdf` as Clean Slides with green and blue action cards in the UI.

---

## 7. Google Colab Automation Blueprints

### Standard Downloader Blueprint
```python
from google.colab import drive
drive.mount('/content/drive')

import os, re, json, urllib.request
from tqdm import tqdm

DEST_DIR = "/content/drive/MyDrive/chemistry crash course"
os.makedirs(DEST_DIR, exist_ok=True)

# Use target course's lectures array
for l in LECTURES:
    rank, uid, title = l["rank"], l["uid"], l["title"]
    clean_title = re.sub(r'[\\/*?:"<>|]', "", title).strip()
    lec_dir = os.path.join(DEST_DIR, f"Lec_{rank:02d}_{clean_title}_{uid}")
    os.makedirs(lec_dir, exist_ok=True)

    # 1. Video
    download_file(f"https://uamedia.uacdn.net/lesson-raw/{uid}/output.webm", os.path.join(lec_dir, "output.webm"), "  ├─ Video")
    # 2. Telemetry
    download_file(f"https://uamedia.uacdn.net/lesson-raw/{uid}/data.json", os.path.join(lec_dir, "data.json"), "  ├─ Telemetry")
    # 3. Annotated PDF
    if l.get("pdfAnno"): download_file(l["pdfAnno"], os.path.join(lec_dir, "notes_with_anno.pdf"), "  ├─ Anno PDF")
    # 4. Clean PDF
    if l.get("pdfClean"): download_file(l["pdfClean"], os.path.join(lec_dir, "notes_no_anno.pdf"), "  └─ Clean PDF")
```

---

## 8. Gotchas, Pitfalls & Known Edge Cases

| Issue / Trap | Root Cause | Solution |
|:---|:---|:---|
| **Videos failing with 403** | Requesting legacy `player.uacdn.net/liveweb/...` | Switch to `uamedia.uacdn.net/lesson-raw/{UID}/output.webm`. |
| **Telemetry failing with 403** | Requesting `securejson.json` | Use `uamedia.uacdn.net/lesson-raw/{UID}/data.json`. |
| **PDF failing with 404** | Title has special characters (`()`, `-`, `&`) | Strip characters via `sanitizeSlug(title)`. |
| **Double Drive storage usage** | Downloading both `output.webm` and `replay_high.webm` | Keep only `output.webm` and `data.json`. |
| **Powershell chain error** | Using `&&` in Windows PowerShell | Use semicolon `;` instead of `&&`. |

---
*Created and maintained by the Uncad Core Engineering Team.*
