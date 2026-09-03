// Multi-Format Local File & Folder Loader (Single Lecture, Course Folders, Drag & Drop, File Picker)
'use strict';

import { findLectureInCourses, COURSES } from '../courses.js';

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

function openLocalFolderPicker() {
    const folderInput = document.getElementById("local-folder-input");
    if (folderInput) {
        folderInput.click();
    }
}
window.openLocalFolderPicker = openLocalFolderPicker;

export { initLocalFileLoader, openLocalFolderPicker, processRawFiles, parseLectureFolderName, cleanCourseTitle };
