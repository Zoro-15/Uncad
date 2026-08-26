#!/usr/bin/env node
/**
 * Automated Course & Lecture Archival Downloader for Google Drive Packaging
 * 
 * Usage:
 *   node scripts/download_course.js --list
 *   node scripts/download_course.js --course calculus-1
 *   node scripts/download_course.js --course theory-of-numbers --limit 2
 *   node scripts/download_course.js --all
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Load courses registry
let COURSES = [];
try {
    const coursesFilePath = path.join(ROOT_DIR, 'src', 'courses.js');
    const content = fs.readFileSync(coursesFilePath, 'utf8');
    const match = content.match(/const COURSES = (\[[\s\S]*?\]);/);
    if (match) {
        COURSES = JSON.parse(match[1]);
    } else {
        console.error("Could not parse COURSES from src/courses.js");
        process.exit(1);
    }
} catch (e) {
    console.error("Failed to load courses.js:", e.message);
    process.exit(1);
}

// CLI Argument parsing
const args = process.argv.slice(2);
let targetCourseId = null;
let downloadAll = false;
let limitCount = null;
let listOnly = false;
let outputDir = path.join(ROOT_DIR, 'downloads');

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--list') listOnly = true;
    else if (args[i] === '--all') downloadAll = true;
    else if (args[i] === '--course' && args[i + 1]) targetCourseId = args[++i];
    else if (args[i] === '--limit' && args[i + 1]) limitCount = parseInt(args[++i], 10);
    else if (args[i] === '--out' && args[i + 1]) outputDir = path.resolve(args[++i]);
}

if (listOnly) {
    console.log("\n=======================================================");
    console.log("  AVAILABLE COURSES FOR ARCHIVAL");
    console.log("=======================================================\n");
    COURSES.forEach((c, idx) => {
        console.log(`[${idx + 1}] ID: \x1b[36m${c.id}\x1b[0m`);
        console.log(`    Title:    ${c.title}`);
        console.log(`    Lectures: ${c.lectures.length}`);
        console.log("-------------------------------------------------------");
    });
    console.log("\nRun with: node scripts/download_course.js --course <course_id>\n");
    process.exit(0);
}

if (!targetCourseId && !downloadAll) {
    console.log(`
\x1b[1m\x1b[34m[Lennister Archival Downloader]\x1b[0m
Automated Course & Lecture Archiver for Google Drive

Commands:
  \x1b[32mnode scripts/download_course.js --list\x1b[0m
      List all available courses and their lecture counts.

  \x1b[32mnode scripts/download_course.js --course <id>\x1b[0m
      Download all lectures for a specific course (e.g. theory-of-numbers, calculus-1).

  \x1b[32mnode scripts/download_course.js --course <id> --limit 2\x1b[0m
      Download only the first N lectures of a course for testing.

  \x1b[32mnode scripts/download_course.js --all\x1b[0m
      Download all courses into the downloads folder.
`);
    process.exit(0);
}

const downloadFile = (url, destPath) => {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(destPath)) {
            const stat = fs.statSync(destPath);
            if (stat.size > 500) {
                // Already downloaded
                return resolve({ skipped: true, size: stat.size });
            }
        }

        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': 'https://unacademy.com/'
            }
        }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                const redirectUrl = res.headers.location;
                if (redirectUrl) {
                    return resolve(downloadFile(redirectUrl, destPath));
                }
            }

            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
            }

            const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
            let downloadedBytes = 0;
            const fileStream = fs.createWriteStream(destPath);

            res.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                if (totalBytes > 0) {
                    const pct = ((downloadedBytes / totalBytes) * 100).toFixed(1);
                    const mb = (downloadedBytes / (1024 * 1024)).toFixed(1);
                    const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
                    process.stdout.write(`\r       Progress: ${pct}% (${mb}MB / ${totalMb}MB)   `);
                }
            });

            res.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close();
                process.stdout.write('\n');
                resolve({ skipped: false, size: downloadedBytes });
            });

            fileStream.on('error', (err) => {
                fs.unlink(destPath, () => {});
                reject(err);
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.setTimeout(60000, () => {
            req.destroy();
            reject(new Error("Connection timed out after 60s"));
        });
    });
};

const sanitizeName = (str) => {
    return (str || '').replace(/[\\/:*?"<>|]+/g, '_').trim();
};

async function downloadLecture(courseFolder, lec, courseTitle) {
    const rankStr = String(lec.rank).padStart(2, '0');
    const lecTitleSanitized = sanitizeName(lec.title || `Lecture_${rankStr}`);
    const lecDirName = `Lec_${rankStr}_${lecTitleSanitized}_${lec.uid}`;
    const lecDir = path.join(courseFolder, lecDirName);

    if (!fs.existsSync(lecDir)) {
        fs.mkdirSync(lecDir, { recursive: true });
    }

    console.log(`\n  \x1b[1m[Lec #${lec.rank}]\x1b[0m \x1b[36m${lec.title}\x1b[0m (\x1b[33m${lec.uid}\x1b[0m)`);

    // Metadata JSON
    const metaPath = path.join(lecDir, 'metadata.json');
    if (!fs.existsSync(metaPath)) {
        fs.writeFileSync(metaPath, JSON.stringify({
            uid: lec.uid,
            rank: lec.rank,
            title: lec.title,
            duration: lec.duration,
            courseTitle: courseTitle,
            downloadedAt: new Date().toISOString()
        }, null, 2));
    }

    // 1. Download Telemetry (data.json)
    const telemetryPath = path.join(lecDir, 'data.json');
    process.stdout.write(`    ├─ Telemetry (data.json)... `);
    let telemetryDownloaded = false;

    const telemetryUrls = [
        `https://uamedia.uacdn.net/lesson-raw/${lec.uid}/data.json`,
        `https://uamedia.uacdn.net/lesson-raw/${lec.uid}/securejson.json`,
        `https://corsproxy.io/?${encodeURIComponent(`https://uamedia.uacdn.net/lesson-raw/${lec.uid}/data.json`)}`
    ];

    for (const tUrl of telemetryUrls) {
        try {
            const res = await downloadFile(tUrl, telemetryPath);
            if (res.skipped) {
                console.log(`\x1b[32m[Already exists]\x1b[0m`);
            } else {
                console.log(`\x1b[32m[OK]\x1b[0m (${(res.size / 1024).toFixed(1)} KB)`);
            }
            telemetryDownloaded = true;
            break;
        } catch (e) {
            // Try next url
        }
    }

    if (!telemetryDownloaded) {
        console.log(`\x1b[31m[FAILED]\x1b[0m`);
    }

    // 2. Download Video (output.webm)
    const videoPath = path.join(lecDir, 'output.webm');
    process.stdout.write(`    ├─ Facecam Video (output.webm)... `);
    try {
        const videoUrl = `https://uamedia.uacdn.net/lesson-raw/${lec.uid}/output.webm`;
        const res = await downloadFile(videoUrl, videoPath);
        if (res.skipped) {
            console.log(`\x1b[32m[Already exists]\x1b[0m`);
        } else {
            console.log(`\x1b[32m[OK]\x1b[0m (${(res.size / (1024 * 1024)).toFixed(1)} MB)`);
        }
    } catch (e) {
        console.log(`\x1b[31m[FAILED: ${e.message}]\x1b[0m`);
    }

    // 3. Download PDF Notes (optional)
    const pdfPath = path.join(lecDir, 'notes.pdf');
    const titleSlug = (lec.title || "Lecture_Notes").replace(/\s+/g, '_');
    const pdfUrl = `https://player.uacdn.net/slides_pdf/${lec.uid}/${titleSlug}_with_anno.pdf`;
    process.stdout.write(`    └─ Notes PDF (notes.pdf)... `);
    try {
        const res = await downloadFile(pdfUrl, pdfPath);
        if (res.skipped) {
            console.log(`\x1b[32m[Already exists]\x1b[0m`);
        } else {
            console.log(`\x1b[32m[OK]\x1b[0m`);
        }
    } catch (e) {
        console.log(`\x1b[90m[Not available]\x1b[0m`);
    }
}

async function run() {
    const selectedCourses = downloadAll 
        ? COURSES 
        : COURSES.filter(c => c.id === targetCourseId);

    if (selectedCourses.length === 0) {
        console.error(`Course "${targetCourseId}" not found in catalog.`);
        console.log("Run with --list to see all valid course IDs.");
        process.exit(1);
    }

    console.log(`\n=======================================================`);
    console.log(`  STARTING ARCHIVAL TO: ${outputDir}`);
    console.log(`  COURSES TO PROCESS: ${selectedCourses.length}`);
    console.log(`=======================================================`);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    for (const course of selectedCourses) {
        const courseFolder = path.join(outputDir, `${sanitizeName(course.title)}_${course.id}`);
        if (!fs.existsSync(courseFolder)) {
            fs.mkdirSync(courseFolder, { recursive: true });
        }

        console.log(`\n\x1b[1m\x1b[35m=== Course: ${course.title} (${course.lectures.length} Lectures) ===\x1b[0m`);
        console.log(`Folder: ${courseFolder}`);

        let lecs = course.lectures.filter(l => l.uid);
        if (limitCount && limitCount > 0) {
            lecs = lecs.slice(0, limitCount);
        }

        for (let i = 0; i < lecs.length; i++) {
            await downloadLecture(courseFolder, lecs[i], course.title);
        }
    }

    console.log(`\n=======================================================`);
    console.log(`  \x1b[32mARCHIVAL COMPLETE!\x1b[0m`);
    console.log(`  You can now upload the folder "${outputDir}" to Google Drive.`);
    console.log(`  Users can download any lecture or course folder and open`);
    console.log(`  it directly in Lennister Player completely offline.`);
    console.log(`=======================================================\n`);
}

run().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
