/**
 * scripts/calculate_all_durations.cjs
 * Ultra-fast lecture duration calculator for all 901 lectures across Math, Physics, and Chemistry.
 * Uses 32KB HTTP Range headers on WebM containers with telemetry fallback.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const ROOT_DIR = path.resolve(__dirname, '..');
const COURSES_JS_PATH = path.join(ROOT_DIR, 'src', 'courses.js');
const CACHE_FILE = path.join(ROOT_DIR, 'scripts', 'durations_cache.json');

const SECRET_KEY = '9ffdc791579b19df35315e4d81a4aacda41d4c1ddaa318a4cba133111e20540e';
const keyBuf = Buffer.from(SECRET_KEY);

let durationCache = {};
if (fs.existsSync(CACHE_FILE)) {
    try {
        durationCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        console.log(`Loaded ${Object.keys(durationCache).length} cached durations.`);
    } catch (e) {
        durationCache = {};
    }
}

function parseEbmlVarInt(buf, offset) {
    const b = buf[offset];
    let mask = 0x80, len = 1;
    while (len <= 8 && (b & mask) === 0) {
        mask >>= 1;
        len++;
    }
    if (len > 8) return { val: 0, len: 1 };
    let val = b & (mask - 1);
    for (let i = 1; i < len; i++) {
        val = (val << 8) | buf[offset + i];
    }
    return { val, len };
}

function parseWebmDuration(buf) {
    let timecodeScale = 1000000; // default 1ms
    let duration = null;
    
    for (let i = 0; i < buf.length - 10; i++) {
        // TimecodeScale: 0x2A 0xD7 0xB1
        if (buf[i] === 0x2a && buf[i+1] === 0xd7 && buf[i+2] === 0xb1) {
            const vint = parseEbmlVarInt(buf, i + 3);
            let offset = i + 3 + vint.len;
            let val = 0;
            for (let j = 0; j < vint.val; j++) val = (val * 256) + buf[offset + j];
            if (val > 0) timecodeScale = val;
        }
        // Duration: 0x44 0x89
        if (buf[i] === 0x44 && buf[i+1] === 0x89) {
            const vint = parseEbmlVarInt(buf, i + 2);
            let offset = i + 2 + vint.len;
            let durFloat = null;
            if (vint.val === 4) {
                durFloat = buf.readFloatBE(offset);
            } else if (vint.val === 8) {
                durFloat = buf.readDoubleBE(offset);
            }
            if (durFloat !== null) {
                duration = durFloat;
                break;
            }
        }
    }
    
    if (duration !== null && duration > 0) {
        const totalSec = (duration * timecodeScale) / 1e9;
        const hrs = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const durationStr = (hrs > 0 ? `${hrs}h ` : '') + (mins < 10 && hrs > 0 ? '0' : '') + `${mins}m`;
        return { totalSec: Math.round(totalSec), durationStr };
    }
    return null;
}

function fetchRangeHeader(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'Range': 'bytes=0-49152',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                const redUrl = res.headers.location;
                if (redUrl) return resolve(fetchRangeHeader(redUrl));
            }
            if (res.statusCode !== 200 && res.statusCode !== 206) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let chunks = [];
            res.on('data', d => chunks.push(d));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

function fetchTelemetry(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return resolve(fetchTelemetry(res.headers.location));
            }
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            let chunks = [];
            res.on('data', d => chunks.push(d));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

function extractFromTelemetryBuf(buf) {
    let dec = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) dec[i] = buf[i] ^ keyBuf[i % keyBuf.length];
    
    let decomp;
    if (dec[0] === 0x1f && dec[1] === 0x8b) decomp = zlib.gunzipSync(dec);
    else if (buf[0] === 0x1f && buf[1] === 0x8b) decomp = zlib.gunzipSync(buf);
    else decomp = dec;

    const raw = JSON.parse(decomp.toString('utf8'));
    let flat = [];
    const deepExtract = (d) => {
        if (!d || typeof d !== 'object') return;
        if (Array.isArray(d)) {
            if (d.length > 0 && typeof d[0] === 'object' && (d[0].p_time != null || d[0].plugin || d[0].type || d[0].t != null)) {
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

    let minP = Infinity, maxP = -Infinity;
    flat.forEach(e => {
        const d = e.data || {};
        let p = e.p_time ?? d.p_time ?? e.t ?? d.t ?? e.ts;
        if (p == null && e.payload) p = e.payload.p_time ?? e.payload.t;
        if (p != null) {
            const val = Number(p);
            if (val < minP) minP = val;
            if (val > maxP) maxP = val;
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
    const maxMicroseconds = maxP * timeFactor;
    const totalSec = Math.round(maxMicroseconds / 1e6);
    if (totalSec <= 0) return null;

    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const durationStr = (hrs > 0 ? `${hrs}h ` : '') + `${mins}m`;
    return { durationStr, totalSec };
}

async function fetchDurationForUid(uid) {
    if (durationCache[uid] && durationCache[uid] !== "2h 00m") return durationCache[uid];

    // 1. Try ultra-fast WebM header (32KB range request)
    const webmUrls = [
        `https://player.uacdn.net/lesson-raw/${uid}/output.webm`,
        `https://uamedia.uacdn.net/lesson-raw/${uid}/output.webm`
    ];

    for (const url of webmUrls) {
        try {
            const buf = await fetchRangeHeader(url);
            const res = parseWebmDuration(buf);
            if (res && res.durationStr) {
                durationCache[uid] = res.durationStr;
                return res.durationStr;
            }
        } catch (e) {}
    }

    // 2. Telemetry fallback
    const telemUrls = [
        `https://uamedia.uacdn.net/lesson-raw/${uid}/data.json`,
        `https://player.uacdn.net/lesson-raw/${uid}/data.json`
    ];

    for (const url of telemUrls) {
        try {
            const buf = await fetchTelemetry(url);
            const res = extractFromTelemetryBuf(buf);
            if (res && res.durationStr) {
                durationCache[uid] = res.durationStr;
                return res.durationStr;
            }
        } catch (e) {}
    }

    return null;
}

// Concurrent worker pool
async function mapConcurrent(items, concurrency, fn) {
    let index = 0;
    const workers = new Array(concurrency).fill(null).map(async () => {
        while (index < items.length) {
            const curIdx = index++;
            const item = items[curIdx];
            try {
                await fn(item, curIdx);
            } catch (e) {}
        }
    });
    await Promise.all(workers);
}

async function main() {
    console.log("Loading courses from src/courses.js...");
    const coursesJs = fs.readFileSync(COURSES_JS_PATH, 'utf8');
    
    const startIdx = coursesJs.indexOf('const COURSES = [');
    const endIdx = coursesJs.indexOf('function findCourseByLectureUid');
    if (startIdx === -1 || endIdx === -1) {
        console.error("Could not find COURSES boundary in courses.js");
        return;
    }

    const arrayStr = coursesJs.slice(startIdx + 'const COURSES = '.length, endIdx).trim().replace(/;$/, '');
    const courses = JSON.parse(arrayStr);

    const allLectures = [];
    courses.forEach(c => {
        if (c.lectures) {
            c.lectures.forEach(l => {
                if (l.uid) allLectures.push(l);
            });
        }
    });

    console.log(`Found ${allLectures.length} total lectures across ${courses.length} courses.`);
    
    const uidsToFetch = allLectures.filter(l => !durationCache[l.uid] || durationCache[l.uid] === "2h 00m");
    console.log(`Fetching exact durations for ${uidsToFetch.length} lectures (${allLectures.length - uidsToFetch.length} already resolved)...`);

    let done = 0;
    const total = uidsToFetch.length;

    await mapConcurrent(uidsToFetch, 35, async (lec) => {
        const dur = await fetchDurationForUid(lec.uid);
        done++;
        if (done % 25 === 0 || done === total) {
            process.stdout.write(`\rProgress: ${done}/${total} (${Math.round((done/total)*100)}%) - Last: ${dur || 'default'}`);
            fs.writeFileSync(CACHE_FILE, JSON.stringify(durationCache, null, 2));
        }
    });

    console.log("\n\nAll durations fetched! Updating courses array...");

    let updatedCount = 0;
    courses.forEach(c => {
        if (c.lectures) {
            c.lectures.forEach(l => {
                if (durationCache[l.uid]) {
                    l.duration = durationCache[l.uid];
                    updatedCount++;
                } else if (!l.duration || l.duration === "2h 00m") {
                    l.duration = "1h 45m";
                }
            });
        }
    });

    fs.writeFileSync(CACHE_FILE, JSON.stringify(durationCache, null, 2));

    const newCoursesJs = `// Course catalogs registry module (Dynamically Generated Multi-Subject Library)

const COURSES = ${JSON.stringify(courses, null, 4)};

function findCourseByLectureUid(uid) {
    if (!uid) return null;
    return COURSES.find(c => c.lectures && c.lectures.some(l => l.uid === uid));
}

function findLectureInCourses(uid) {
    if (!uid) return null;
    for (const c of COURSES) {
        const lec = c.lectures.find(l => l.uid === uid);
        if (lec) return { course: c, lecture: lec };
    }
    return null;
}

export { COURSES, findCourseByLectureUid, findLectureInCourses };
`;

    fs.writeFileSync(COURSES_JS_PATH, newCoursesJs, 'utf8');
    console.log(`\nSuccessfully updated ${updatedCount} lecture durations in src/courses.js!`);
}

main().catch(err => console.error("Error in duration calculator:", err));
