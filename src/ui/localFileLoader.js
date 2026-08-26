// Multi-Format Local File & Folder Loader (Single Lecture, Course Folders, Drag & Drop, File Picker)
'use strict';

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
 * Group raw files into lecture objects
 */
async function processRawFiles(fileList, rootName = "Local Folder") {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    // Group files by directory path
    const groups = new Map();

    files.forEach(file => {
        const relPath = file.webkitRelativePath || file.fullPath || file.name;
        const parts = relPath.split(/[/\\]/);
        // If nested in a folder, use parent folder name, otherwise use root
        const folderKey = parts.length > 1 ? parts.slice(0, parts.length - 1).join('/') : "root";
        
        if (!groups.has(folderKey)) {
            groups.set(folderKey, []);
        }
        groups.get(folderKey).push(file);
    });

    const parsedLectures = [];

    for (const [folderKey, groupFiles] of groups.entries()) {
        const videoFile = groupFiles.find(f => f.name.endsWith('.webm') || f.name.endsWith('.mp4'));
        const jsonFile = groupFiles.find(f => f.name.endsWith('.json') && !f.name.includes('metadata'));
        const metaFile = groupFiles.find(f => f.name === 'metadata.json');
        const pdfFile = groupFiles.find(f => f.name.endsWith('.pdf'));

        if (videoFile && jsonFile) {
            let title = folderKey !== 'root' ? folderKey.split(/[/\\]/).pop() : videoFile.name.replace(/\.[^/.]+$/, "");
            let rank = parsedLectures.length + 1;
            let uid = `local_${Date.now()}_${parsedLectures.length + 1}`;

            // Try reading metadata.json if available
            if (metaFile) {
                try {
                    const metaText = await metaFile.text();
                    const meta = JSON.parse(metaText);
                    if (meta.title) title = meta.title;
                    if (meta.rank) rank = meta.rank;
                    if (meta.uid) uid = meta.uid;
                } catch (e) {
                    console.warn("[LocalLoader] Failed to read metadata.json:", e);
                }
            } else {
                // Extract rank from folder name (e.g. Lec_01_...)
                const rankMatch = folderKey.match(/Lec_?(\d+)/i);
                if (rankMatch) rank = parseInt(rankMatch[1], 10);
            }

            parsedLectures.push({
                rank,
                title: title.replace(/^Lec_\d+_/, '').replace(/_/g, ' '),
                uid,
                videoFile,
                jsonFile,
                pdfFile: pdfFile || null
            });
        }
    }

    if (parsedLectures.length === 0) {
        // Direct root drop check (e.g. dropped output.webm and data.json directly)
        const videoFile = files.find(f => f.name.endsWith('.webm') || f.name.endsWith('.mp4'));
        const jsonFile = files.find(f => f.name.endsWith('.json'));
        if (videoFile && jsonFile) {
            parsedLectures.push({
                rank: 1,
                title: videoFile.name.replace(/\.[^/.]+$/, "").replace(/_/g, ' '),
                uid: `local_${Date.now()}`,
                videoFile,
                jsonFile,
                pdfFile: files.find(f => f.name.endsWith('.pdf')) || null
            });
        }
    }

    if (parsedLectures.length === 0) {
        alert("No valid lecture recordings found in the selected folder. Please make sure the folder contains output.webm and data.json.");
        return;
    }

    // Sort by rank
    parsedLectures.sort((a, b) => a.rank - b.rank);

    const courseTitle = rootName !== "Local Folder" ? rootName.replace(/_/g, ' ') : (parsedLectures.length === 1 ? parsedLectures[0].title : "Downloaded Course");

    const coursePackage = {
        id: `local-course-${Date.now()}`,
        title: courseTitle,
        description: `Imported local folder containing ${parsedLectures.length} lecture(s).`,
        icon: "fa-folder-open",
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

export { initLocalFileLoader, openLocalFolderPicker, processRawFiles };
