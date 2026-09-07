// Multi-Format Local File & Folder Loader (Single Lecture, Course Folders, Drag & Drop, File Picker)
'use strict';

import { findLectureInCourses, COURSES } from '../courses.js';
import { saveSavedDirectoryHandle, getSavedDirectoryHandle, clearSavedDirectoryHandle } from '../engine/offlineStorage.js';
import { isNativePlatform, SafStorage } from '../nativeBridge.js';
import { Capacitor } from '@capacitor/core';

let onLocalCourseLoadedCallback = null;
let onSingleLectureLoadedCallback = null;

/**
 * Recursively scans FileSystemEntry from drop event
 */
async function scanDirectoryEntry(entry) {
    const files = [];
    if (entry.isFile) {
        const file = await new Promise((resolve) => entry.file(resolve));
        file.fullPath = entry.fullPath || file.name;
        files.push(file);
    } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readEntries = () => new Promise((resolve) => reader.readEntries(resolve));
        let entries = [];
        let batch;
        do {
            batch = await readEntries();
            entries = entries.concat(batch);
        } while (batch.length > 0);

        for (const child of entries) {
            const childFiles = await scanDirectoryEntry(child);
            files.push(...childFiles);
        }
    }
    return files;
}

/**
 * Helper to clean course title from folder name
 * e.g. "Conic Sections for JEE Advanced_conic-sections" -> "Conic Sections for JEE Advanced"
 * or "Calculus for JEE Advanced_calculus-1-20260826T065911Z-001" -> "Calculus for JEE Advanced"
 */
function cleanCourseTitle(rawName) {
    if (!rawName || rawName === "Local Folder" || rawName === "Dropped Folder") return rawName;
    let name = rawName.replace(/-\d{8}T\d{6}Z.*$/i, '').replace(/-\d+-\d+$/i, '').replace(/-\d+$/i, '').replace(/\s*\(\d+\)$/i, '');
    return name.replace(/_[a-zA-Z0-9-]+$/, '').replace(/_/g, ' ').trim();
}

/**
 * Helper to clean lecture title from folder name
 * e.g. "Lec_25_Test Discussion for JEE 2026_SFFZEPMT7CVERROVSRAL" -> "Test Discussion for JEE 2026"
 * or "Lec_14_Current Electricity_Current Electricity 1_4YUBA2ZET6TMRBHVK5JT"
 */
function parseLectureFolderName(folderName) {
    let cleanName = (folderName || "").replace(/-\d{8}T\d{6}Z.*$/i, '').replace(/-\d+-\d+$/i, '').replace(/-\d+$/i, '').replace(/\s*\(\d+\)$/i, '').trim();
    let rank = 1;
    let title = cleanName;
    let uid = `local_${Date.now()}`;
    let topic = "";
    let duration = "";
    let matchedCourse = null;

    // First extract 20-char UID if present anywhere in folder name
    const uidMatch = cleanName.match(/([A-Z0-9]{15,25})/);
    if (uidMatch) {
        uid = uidMatch[1];
        // Check if UID exists in catalog
        const catalogMatch = findLectureInCourses(uid);
        if (catalogMatch && catalogMatch.lecture) {
            const l = catalogMatch.lecture;
            return {
                rank: l.rank,
                title: l.title,
                uid: l.uid,
                topic: l.topic || "",
                duration: l.duration || "",
                matchedCourse: catalogMatch.course
            };
        }
    }

    // Pattern: Lec_25_Topic_Title_UID or Lec_25_Title_UID
    const match = cleanName.match(/^Lec[_\s]+(\d+)[_\s]+(.*?)(?:[_\s]+([A-Z0-9]{15,25}))?$/i);
    if (match) {
        rank = parseInt(match[1], 10);
        let middlePart = match[2].trim();
        if (match[3]) uid = match[3];

        // If folder is Lec_14_Topic_Title, split by underscore
        const underscoreParts = middlePart.split('_').map(p => p.trim()).filter(Boolean);
        if (underscoreParts.length >= 2) {
            topic = underscoreParts[0];
            title = underscoreParts.slice(1).join(' ');
        } else {
            title = middlePart.replace(/_/g, ' ').trim();
        }
    } else {
        const simpleRankMatch = cleanName.match(/Lec[_\s]+(\d+)/i);
        if (simpleRankMatch) rank = parseInt(simpleRankMatch[1], 10);
        title = cleanName.replace(/^Lec[_\s]+\d+[_\s-]*/i, '').replace(/_/g, ' ').trim();
    }

    return { rank, title, uid, topic, duration, matchedCourse };
}

/**
 * Group raw files into structured course & lecture objects
 */
async function processRawFiles(fileList, rootName = "Local Folder") {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    // Group files by directory path
    const groups = new Map();

    files.forEach(file => {
        const relPath = file.webkitRelativePath || file.fullPath || file.name;
        const parts = relPath.split(/[/\\]/);
        const folderKey = parts.length > 1 ? parts.slice(0, parts.length - 1).join('/') : "root";
        
        if (!groups.has(folderKey)) {
            groups.set(folderKey, []);
        }
        groups.get(folderKey).push(file);
    });

    const parsedLectures = [];
    let detectedCourseTitle = cleanCourseTitle(rootName);

    for (const [folderKey, groupFiles] of groups.entries()) {
        const videoFile = groupFiles.find(f => f.name.endsWith('.webm') || f.name.endsWith('.mp4'));
        const jsonFile = groupFiles.find(f => (f.name.endsWith('.json') || f.name.endsWith('.txt')) && !f.name.includes('metadata'));
        const metaFile = groupFiles.find(f => f.name === 'metadata.json');
        const pdfAnnoFile = groupFiles.find(f => f.name.endsWith('.pdf') && (f.name.includes('with_anno') || f.name === 'notes.pdf' || !f.name.includes('no_anno')));
        const pdfCleanFile = groupFiles.find(f => f.name.endsWith('.pdf') && (f.name.includes('no_anno') || f.name.includes('clean')));
        const pdfFile = pdfAnnoFile || pdfCleanFile || groupFiles.find(f => f.name.endsWith('.pdf'));

        if (videoFile && jsonFile) {
            const lastFolder = folderKey !== 'root' ? folderKey.split(/[/\\]/).pop() : videoFile.name.replace(/\.[^/.]+$/, "");
            const parsedFolder = parseLectureFolderName(lastFolder);

            let rank = parsedFolder.rank;
            let title = parsedFolder.title || videoFile.name.replace(/\.[^/.]+$/, "");
            let uid = parsedFolder.uid || `local_${Date.now()}_${parsedLectures.length + 1}`;
            let duration = parsedFolder.duration || "";
            let matchedCourse = parsedFolder.matchedCourse || null;

            // Try reading metadata.json if available
            if (metaFile) {
                try {
                    const metaText = await metaFile.text();
                    const meta = JSON.parse(metaText);
                    // Only let metadata override rank/title if catalog didn't already supply canonical values
                    if (!matchedCourse && meta.rank != null) rank = parseInt(meta.rank, 10);
                    if (!matchedCourse && meta.title) title = meta.title;
                    if (meta.uid && (uid.startsWith("local_") || !matchedCourse)) uid = meta.uid;
                    if (meta.duration && !duration) duration = meta.duration;
                    if (meta.courseTitle && detectedCourseTitle === "Local Folder") {
                        detectedCourseTitle = meta.courseTitle;
                    }
                } catch (e) {
                    console.warn("[LocalLoader] Failed to parse metadata.json:", e);
                }
            }

            parsedLectures.push({
                rank,
                title,
                uid,
                duration: duration || "--",
                videoFile,
                jsonFile,
                pdfFile: pdfFile || null,
                pdfAnnoFile: pdfAnnoFile || null,
                pdfCleanFile: pdfCleanFile || null,
                isLocal: true,
                matchedCourse
            });
        }
    }

    if (parsedLectures.length === 0) {
        // Direct root drop check (e.g. dropped output.webm and data.json directly into window)
        const videoFile = files.find(f => f.name.endsWith('.webm') || f.name.endsWith('.mp4'));
        const jsonFile = files.find(f => (f.name.endsWith('.json') || f.name.endsWith('.txt')) && !f.name.includes('metadata'));
        const pdfFile = files.find(f => f.name.endsWith('.pdf'));
        const metaFile = files.find(f => f.name === 'metadata.json');

        if (videoFile && jsonFile) {
            let title = videoFile.name.replace(/\.[^/.]+$/, "").replace(/_/g, ' ');
            let rank = 1;
            let uid = `local_${Date.now()}`;
            let duration = "";
            let matchedCourse = null;

            // Check if UID in file names matches catalog
            const uidMatch = (videoFile.name + " " + jsonFile.name).match(/([A-Z0-9]{15,25})/);
            if (uidMatch) {
                const catalogMatch = findLectureInCourses(uidMatch[1]);
                if (catalogMatch && catalogMatch.lecture) {
                    rank = catalogMatch.lecture.rank;
                    title = catalogMatch.lecture.title;
                    uid = catalogMatch.lecture.uid;
                    duration = catalogMatch.lecture.duration || "";
                    matchedCourse = catalogMatch.course;
                }
            }

            if (metaFile) {
                try {
                    const metaText = await metaFile.text();
                    const meta = JSON.parse(metaText);
                    if (!matchedCourse && meta.title) title = meta.title;
                    if (!matchedCourse && meta.rank != null) rank = parseInt(meta.rank, 10);
                    if (meta.uid && (uid.startsWith("local_") || !matchedCourse)) uid = meta.uid;
                    if (meta.duration && !duration) duration = meta.duration;
                    if (meta.courseTitle) detectedCourseTitle = meta.courseTitle;
                } catch (e) {}
            }

            parsedLectures.push({
                rank,
                title,
                uid,
                duration: duration || "--",
                videoFile,
                jsonFile,
                pdfFile: pdfFile || null,
                isLocal: true,
                matchedCourse
            });
        }
    }

    if (parsedLectures.length === 0) {
        alert("No valid lecture recordings found in the selected folder. Please make sure the folder contains output.webm and data.json.");
        return;
    }

    // Sort strictly by rank
    parsedLectures.sort((a, b) => a.rank - b.rank);

    // Check if majority of lectures belong to an existing catalog course
    let canonicalCourse = null;
    const matchedCourses = parsedLectures.map(l => l.matchedCourse).filter(Boolean);
    if (matchedCourses.length > 0) {
        const counts = {};
        matchedCourses.forEach(c => { counts[c.id] = (counts[c.id] || 0) + 1; });
        const topCourseId = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
        canonicalCourse = matchedCourses.find(c => c.id === topCourseId);
    }

    const courseTitle = canonicalCourse ? canonicalCourse.title : (detectedCourseTitle !== "Local Folder" ? detectedCourseTitle : (parsedLectures.length === 1 ? parsedLectures[0].title : "Downloaded Course"));
    const courseId = canonicalCourse ? canonicalCourse.id : `local-course-${Date.now()}`;
    const courseDesc = canonicalCourse ? canonicalCourse.description : `Imported local storage folder with ${parsedLectures.length} offline lecture(s).`;
    const courseIcon = canonicalCourse ? (canonicalCourse.icon || "fa-folder-open") : "fa-folder-open";

    const coursePackage = {
        id: courseId,
        title: courseTitle,
        description: courseDesc,
        icon: courseIcon,
        subject: canonicalCourse ? canonicalCourse.subject : "Local",
        subjectIcon: canonicalCourse ? canonicalCourse.subjectIcon : "fa-hdd",
        subjectColor: canonicalCourse ? canonicalCourse.subjectColor : "#22c55e",
        isLocal: true,
        lectures: parsedLectures
    };

    if (parsedLectures.length === 1 && onSingleLectureLoadedCallback) {
        onSingleLectureLoadedCallback(parsedLectures[0], coursePackage);
    } else if (onLocalCourseLoadedCallback) {
        onLocalCourseLoadedCallback(coursePackage);
    }
}

/**
 * Initialize drag-and-drop & hidden file input listeners
 */
function initLocalFileLoader({ onCourseLoaded, onSingleLectureLoaded }) {
    onLocalCourseLoadedCallback = onCourseLoaded;
    onSingleLectureLoadedCallback = onSingleLectureLoaded;

    const dropZone = document.getElementById("local-drop-zone");
    const folderInput = document.getElementById("local-folder-input");

    if (folderInput) {
        folderInput.addEventListener("change", async (e) => {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;
            const rootDirName = files[0].webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : "Local Folder";
            await processRawFiles(files, rootDirName);
            folderInput.value = ""; // Reset for next selection
        });
    }

    if (dropZone) {
        window.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropZone.classList.add("active");
        });

        window.addEventListener("dragleave", (e) => {
            if (e.clientX <= 0 || e.clientY <= 0) {
                dropZone.classList.remove("active");
            }
        });

        window.addEventListener("drop", async (e) => {
            e.preventDefault();
            dropZone.classList.remove("active");

            const items = e.dataTransfer.items;
            let files = [];
            let rootName = "Dropped Folder";

            if (items && items.length > 0 && items[0].webkitGetAsEntry) {
                for (let i = 0; i < items.length; i++) {
                    const entry = items[i].webkitGetAsEntry();
                    if (entry) {
                        if (i === 0 && entry.isDirectory) rootName = entry.name;
                        const scanned = await scanDirectoryEntry(entry);
                        files.push(...scanned);
                    }
                }
            } else {
                files = Array.from(e.dataTransfer.files);
            }

            if (files.length > 0) {
                await processRawFiles(files, rootName);
            }
        });
    }
}

async function scanDirectoryHandle(dirHandle, pathPrefix = "") {
    const files = [];
    for await (const entry of dirHandle.values()) {
        const fullPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
        if (entry.kind === "file") {
            try {
                const file = await entry.getFile();
                file.fullPath = fullPath;
                files.push(file);
            } catch (fe) {
                console.warn("[LocalLoader] Failed to read file from handle:", entry.name, fe);
            }
        } else if (entry.kind === "directory") {
            const subFiles = await scanDirectoryHandle(entry, fullPath);
            files.push(...subFiles);
        }
    }
    return files;
}

/**
 * Creates a File-like proxy object wrapping an Android Content/File URI
 * with .text() and .arrayBuffer() methods for seamless playback compatibility
 */
export function createSafFileProxy(name, uri, size = 0) {
    return {
        name,
        size,
        uri,
        isSafProxy: true,
        async text() {
            const res = await SafStorage.readTextFile({ uri });
            return res.content;
        },
        async arrayBuffer() {
            const res = await SafStorage.readBinaryFileBase64({ uri });
            const binaryString = atob(res.data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
        }
    };
}

/**
 * Convert raw SAF lecture metadata from native Android to Runcadel Player course format
 */
export function transformSafLectures(safLectures, folderName = "Local Storage") {
    if (!Array.isArray(safLectures) || safLectures.length === 0) return null;

    const parsedLectures = [];
    let detectedCourseTitle = cleanCourseTitle(folderName);

    for (const item of safLectures) {
        const parsedFolder = parseLectureFolderName(item.folderName || item.videoName || "Lecture");

        const videoProxy = item.videoUri ? {
            name: item.videoName || "output.webm",
            size: item.videoSize || 0,
            uri: item.videoUri,
            webviewUrl: Capacitor.convertFileSrc(item.videoUri)
        } : null;

        const jsonProxy = item.telemetryUri ? createSafFileProxy(
            item.telemetryName || "data.json",
            item.telemetryUri,
            item.telemetrySize || 0
        ) : null;

        const pdfProxy = item.pdfUri ? createSafFileProxy(
            item.pdfName || "notes.pdf",
            item.pdfUri,
            item.pdfSize || 0
        ) : null;

        if (videoProxy || jsonProxy) {
            parsedLectures.push({
                rank: parsedFolder.rank || (parsedLectures.length + 1),
                title: parsedFolder.title || item.folderName || "Offline Lecture",
                uid: parsedFolder.uid || `saf_${Date.now()}_${parsedLectures.length + 1}`,
                duration: parsedFolder.duration || "--",
                videoFile: null,
                videoUrl: videoProxy ? videoProxy.webviewUrl : "",
                jsonFile: jsonProxy,
                pdfFile: pdfProxy,
                isLocal: true,
                isSaf: true,
                matchedCourse: parsedFolder.matchedCourse || null
            });
        }
    }

    if (parsedLectures.length === 0) return null;

    parsedLectures.sort((a, b) => a.rank - b.rank);

    const courseId = `saf_course_${Date.now()}`;
    return {
        id: courseId,
        title: detectedCourseTitle || "Offline Course",
        category: "offline-mode",
        isLocal: true,
        isSaf: true,
        badge: "SAF OFFLINE",
        lectures: parsedLectures
    };
}

/**
 * Request folder picker via native Android Storage Access Framework
 */
export async function pickNativeSafCourseFolder() {
    if (!isNativePlatform()) return null;

    try {
        console.log("[LocalLoader] Invoking SafStorage.openFolderPicker()...");
        const result = await SafStorage.openFolderPicker();
        console.log("[LocalLoader] SafStorage.openFolderPicker result:", result);
        if (result && result.cancelled) {
            return null;
        }

        if (result && result.success && Array.isArray(result.lectures)) {
            return transformSafLectures(result.lectures, result.folderName);
        }
    } catch (e) {
        console.error("[LocalLoader] Error picking SAF folder:", e);
        throw e;
    }
    return null;
}

/**
 * Check and restore persisted SAF folder on startup
 */
export async function checkPersistedSafFolder() {
    if (!isNativePlatform()) return null;

    try {
        const result = await SafStorage.getPersistedFolder();
        if (result && result.hasPersisted && Array.isArray(result.lectures)) {
            console.log("[LocalLoader] Restored persisted SAF folder:", result.folderName);
            return transformSafLectures(result.lectures, result.folderName);
        }
    } catch (e) {
        console.warn("[LocalLoader] Could not restore persisted SAF folder:", e);
    }
    return null;
}

async function openLocalFolderPicker() {
    console.log("[LocalLoader] openLocalFolderPicker called, isNativePlatform:", isNativePlatform());
    // 0. Native Android Capacitor SAF folder picker
    if (isNativePlatform()) {
        try {
            const course = await pickNativeSafCourseFolder();
            if (course) {
                if (onLocalCourseLoadedCallback) {
                    onLocalCourseLoadedCallback(course);
                } else if (window.addLocalCourse) {
                    window.addLocalCourse(course);
                    if (window.switchView) window.switchView("course", { courseId: course.id });
                }
                return;
            }
        } catch (err) {
            console.error("[LocalLoader] Native SAF folder picker error:", err);
            if (window.showToast) window.showToast("Failed to pick folder: " + (err.message || err), "warn");
        }
        return; // NEVER fall back to folderInput on native Android!
    }

    // 1. Try modern File System Access API (supports permanent IndexedDB handles)
    if (typeof window.showDirectoryPicker === "function") {
        try {
            const dirHandle = await window.showDirectoryPicker({ mode: "read" });
            if (dirHandle) {
                await saveSavedDirectoryHandle(dirHandle);
                const files = await scanDirectoryHandle(dirHandle, dirHandle.name);
                if (files.length > 0) {
                    await processRawFiles(files, dirHandle.name);
                    return;
                }
            }
        } catch (err) {
            if (err.name === "AbortError") return; // User cancelled dialog
            console.warn("[LocalLoader] showDirectoryPicker failed, falling back to file input:", err);
        }
    }

    // 2. Fallback to standard input element (desktop browser fallback only)
    const folderInput = document.getElementById("local-folder-input");
    if (folderInput) {
        folderInput.click();
    }
}
window.openLocalFolderPicker = openLocalFolderPicker;

/**
 * Automatically restore saved course folder from IndexedDB or native SAF on startup
 */
async function restoreSavedFolderOnStartup() {
    // 0. Native Android Capacitor SAF auto-restore
    if (isNativePlatform()) {
        try {
            const course = await checkPersistedSafFolder();
            if (course) {
                if (onLocalCourseLoadedCallback) {
                    onLocalCourseLoadedCallback(course);
                } else if (window.addLocalCourse) {
                    window.addLocalCourse(course);
                }
                console.log("[LocalLoader] Auto-restored persisted SAF course on Android:", course.title);
                return true;
            }
        } catch (err) {
            console.warn("[LocalLoader] Native SAF auto-restore error:", err);
        }
        return false;
    }

    // 1. Browser IndexedDB directory handle
    try {
        const dirHandle = await getSavedDirectoryHandle();
        if (!dirHandle) return false;

        // Query permission without showing prompt (avoids browser SecurityError on startup)
        const perm = await dirHandle.queryPermission({ mode: "read" });
        if (perm === "granted") {
            console.log("[LocalLoader] Auto-restoring saved course folder from IndexedDB:", dirHandle.name);
            const files = await scanDirectoryHandle(dirHandle, dirHandle.name);
            if (files.length > 0) {
                await processRawFiles(files, dirHandle.name);
                return true;
            }
        }
    } catch (err) {
        console.warn("[LocalLoader] Could not auto-restore directory handle:", err);
    }
    return false;
}
window.restoreSavedFolderOnStartup = restoreSavedFolderOnStartup;

export { 
    initLocalFileLoader, 
    openLocalFolderPicker, 
    restoreSavedFolderOnStartup, 
    processRawFiles, 
    parseLectureFolderName, 
    cleanCourseTitle 
};
