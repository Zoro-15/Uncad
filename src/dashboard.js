// Dashboard views, routing, offline manager, and predictive caching module
import { COURSES } from './courses.js';
import { loadLectureByUid } from './player.js';
import { getAllCachedUids, clearAllOfflineTelemetry, saveTelemetryOffline, downloadLectureBundle } from './engine/offlineStorage.js';

let currentView = "my-courses";
let activeCourseId = "LPN7OFOL";
let activeUid = "";

// ══════════════════════════════════════════════════
// LOCAL / OFFLINE IMPORTED COURSES REGISTRY
// ══════════════════════════════════════════════════
const LOCAL_COURSES = [];

function addLocalCourse(coursePkg) {
    if (!coursePkg || !coursePkg.id) return;
    const existingIdx = LOCAL_COURSES.findIndex(c => c.id === coursePkg.id || c.title === coursePkg.title);
    if (existingIdx >= 0) {
        LOCAL_COURSES[existingIdx] = coursePkg;
    } else {
        LOCAL_COURSES.unshift(coursePkg);
    }
}

function findCourseById(id) {
    return LOCAL_COURSES.find(c => c.id === id) || COURSES.find(c => c.id === id);
}

// ══════════════════════════════════════════════════
// IN-MEMORY OFFLINE UIDS CACHE (FOR ZERO-LAG SEARCH)
// ══════════════════════════════════════════════════
let cachedUidsSet = new Set();

async function refreshCachedUidsSet() {
    try {
        const uids = await getAllCachedUids();
        cachedUidsSet = new Set(uids || []);
    } catch (e) {
        cachedUidsSet = new Set();
    }
}
refreshCachedUidsSet();

window.addEventListener('lennister-offline-change', (e) => {
    if (e.detail && e.detail.uid) {
        if (e.detail.isCached) cachedUidsSet.add(e.detail.uid);
        else cachedUidsSet.delete(e.detail.uid);
    } else {
        refreshCachedUidsSet();
    }
    if (currentView === "course" && activeCourseId) {
        const course = findCourseById(activeCourseId);
        if (course) renderLecturesList(course.lectures);
    } else if (currentView === "offline-mode") {
        renderOfflineMode();
    }
});

window.addEventListener('lennister-offline-cleared', () => {
    cachedUidsSet.clear();
    if (currentView === "course" && activeCourseId) {
        const course = findCourseById(activeCourseId);
        if (course) renderLecturesList(course.lectures);
    } else if (currentView === "offline-mode") {
        renderOfflineMode();
    }
});

// ══════════════════════════════════════════════════
// LOCAL STORAGE STATE HELPERS (MEMOIZED)
// ══════════════════════════════════════════════════
const ENROLLED_KEY = "lennister_enrolled_courses";
const LAST_WATCHED_KEY = "lennister_last_watched";
const PROGRESS_KEY = "lennister_lectures_progress";

let _memoEnrolled = null;
let _memoLastWatched = null;
let _memoProgress = null;

function getEnrolledCourses() {
    if (_memoEnrolled) return _memoEnrolled;
    try {
        const stored = localStorage.getItem(ENROLLED_KEY);
        if (stored) {
            _memoEnrolled = JSON.parse(stored);
            return _memoEnrolled;
        }
    } catch (e) {
        console.error("Failed to read enrolled courses:", e);
    }
    // Default enrolled courses for new users
    const defaultEnrolled = ["theory-of-numbers", "LPN7OFOL"];
    localStorage.setItem(ENROLLED_KEY, JSON.stringify(defaultEnrolled));
    _memoEnrolled = defaultEnrolled;
    return defaultEnrolled;
}

function isCourseEnrolled(courseId) {
    const list = getEnrolledCourses();
    return list.includes(courseId);
}

function toggleEnrollCourse(courseId, event) {
    if (event) event.stopPropagation();
    let list = getEnrolledCourses();
    if (list.includes(courseId)) {
        list = list.filter(id => id !== courseId);
    } else {
        list = [...list, courseId];
    }
    _memoEnrolled = list;
    localStorage.setItem(ENROLLED_KEY, JSON.stringify(list));
    renderMyCourses();
    if (currentView === "math") renderSubjectGrid("Mathematics", "math-courses-grid");
    else if (currentView === "physics") renderSubjectGrid("Physics", "physics-courses-grid");
    else if (currentView === "chemistry") renderSubjectGrid("Chemistry", "chemistry-courses-grid");
    else if (currentView === "mentorship" || currentView === "modules" || currentView === "crash-course") renderSubjectGrid("Mentorship", "mentorship-courses-grid");
    else if (currentView === "phy-os" || currentView === "phyos") renderSubjectGrid("Phy OS", "phy-os-courses-grid");
}

function getLastWatched() {
    if (_memoLastWatched) return _memoLastWatched;
    try {
        const stored = localStorage.getItem(LAST_WATCHED_KEY);
        if (stored) {
            _memoLastWatched = JSON.parse(stored);
            return _memoLastWatched;
        }
    } catch (e) {
        console.error("Failed to read last watched:", e);
    }
    return null;
}

function getLectureProgress(uid) {
    if (!uid) return null;
    if (_memoProgress) return _memoProgress[uid] || null;
    try {
        const stored = localStorage.getItem(PROGRESS_KEY);
        if (stored) {
            _memoProgress = JSON.parse(stored);
            return _memoProgress[uid] || null;
        }
    } catch (e) {}
    return null;
}

function saveLectureProgress(uid, timeSec, durationSec = 0, forceCompleted = false) {
    if (!uid || timeSec <= 0) return;
    try {
        let map = {};
        const stored = localStorage.getItem(PROGRESS_KEY);
        if (stored) map = JSON.parse(stored);

        const prev = map[uid] || {};
        const maxWatched = Math.max(prev.maxWatchedSec || 0, prev.timeSec || 0, Math.floor(timeSec));
        
        let totalDur = 0;
        if (durationSec && durationSec > 0) {
            totalDur = Math.floor(durationSec);
        } else if (prev.durationSec && prev.durationSec > 0) {
            totalDur = prev.durationSec;
        } else {
            const match = findLectureInCourses(uid);
            if (match && match.lecture && match.lecture.duration) {
                totalDur = parseDurationToSeconds(match.lecture.duration);
            }
        }

        let pct = 0;
        if (totalDur > 0) {
            pct = Math.min(100, Math.round((maxWatched / totalDur) * 100));
        } else if (prev.percent) {
            pct = prev.percent;
        }

        const isCompleted = forceCompleted || pct >= 90 || (totalDur > 0 && maxWatched >= totalDur - 90);
        if (isCompleted && pct < 90) pct = 100;

        map[uid] = {
            timeSec: Math.floor(timeSec),
            maxWatchedSec: maxWatched,
            durationSec: totalDur,
            percent: pct,
            isCompleted: isCompleted,
            updatedAt: Date.now()
        };
        _memoProgress = map;
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
    } catch (e) {}
}

function saveLastWatched(uid, courseId, timeSec = 0, durationSec = 0) {
    if (!uid) return;
    const course = findCourseById(courseId) || COURSES.find(c => c.lectures && c.lectures.some(l => l.uid === uid));
    if (!course) return;
    const lec = course.lectures.find(l => l.uid === uid);
    if (!lec) return;

    const record = {
        uid: uid,
        courseId: course.id,
        courseTitle: course.title,
        lectureTitle: lec.title,
        lectureRank: lec.rank,
        timeSec: Math.floor(timeSec),
        durationStr: lec.duration || "",
        updatedAt: Date.now()
    };
    _memoLastWatched = record;
    localStorage.setItem(LAST_WATCHED_KEY, JSON.stringify(record));
    if (timeSec > 0) {
        saveLectureProgress(uid, timeSec, durationSec);
    }
}

// ══════════════════════════════════════════════════
// HISTORY API & ROUTING ENGINE
// ══════════════════════════════════════════════════
function initHistoryRouting() {
    window.addEventListener("popstate", (event) => {
        const state = event.state;
        if (state && state.view) {
            switchView(state.view, state.params || {}, true);
        } else {
            // Default back fallback
            if (currentView === "player") {
                switchView("course", { courseId: activeCourseId }, true);
            } else if (currentView === "course") {
                switchView(lastCatalogView || "my-courses", {}, true);
            } else {
                switchView("my-courses", {}, true);
            }
        }
    });
}

let lastCatalogView = "my-courses";

function handleBackNavigation() {
    if (window.history.length > 1 && window.history.state) {
        window.history.back();
    } else {
        switchView(lastCatalogView || "my-courses");
    }
}

function switchView(viewName, params = {}, skipPush = false) {
    currentView = viewName;

    if (["my-courses", "home", "math", "mathematics", "physics", "chemistry", "mentorship", "modules", "crash-course", "phy-os", "phyos", "offline-mode"].includes(viewName)) {
        lastCatalogView = viewName;
    }

    if (!skipPush) {
        if (!history.state) {
            history.replaceState({ view: viewName, params }, '', '#' + viewName);
        } else if (history.state.view !== viewName || JSON.stringify(history.state.params) !== JSON.stringify(params)) {
            history.pushState({ view: viewName, params }, '', '#' + viewName);
        }
    }

    const dbShell = document.getElementById("dashboard-shell");
    const appEl = document.getElementById("app");
    const backBtn = document.getElementById("player-back-btn");
    const toggleBtn = document.getElementById("panel-toggle");
    const vc = document.getElementById("video-circle");
    const navDrawer = document.getElementById("db-nav-drawer");
    if (navDrawer) navDrawer.classList.remove("show");

    if (viewName === "player") {
        if (dbShell) dbShell.classList.remove("active");
        if (appEl) appEl.style.display = "flex";
        if (backBtn) backBtn.style.display = "flex";
        if (vc) vc.style.display = "block";
        if (toggleBtn) toggleBtn.style.display = "flex";
        if (window.resizeCanvas) window.resizeCanvas();
        if (window.startSyncLoop) window.startSyncLoop();
        
        setTimeout(() => {
            if (window.repositionCam) window.repositionCam();
            else if (window.positionCamDocked) window.positionCamDocked();
        }, 30);
        setTimeout(() => {
            if (window.repositionCam) window.repositionCam();
            else if (window.positionCamDocked) window.positionCamDocked();
        }, 300);
    } else {
        if (dbShell) dbShell.classList.add("active");
        if (appEl) appEl.style.display = "none";
        if (backBtn) backBtn.style.display = "none";
        if (backBtn) backBtn.classList.remove("fade-out");
        if (vc) vc.style.display = "none";
        if (toggleBtn) toggleBtn.style.display = "none";
        
        const sp = document.getElementById("splash");
        if (sp) sp.style.display = "none";
        
        const video = document.getElementById("main-video");
        if (video) {
            if (activeUid && video.currentTime > 0) {
                saveLastWatched(activeUid, activeCourseId, video.currentTime);
            }
            video.pause();
        }

        const viewMyCourses = document.getElementById("view-my-courses");
        const viewMath = document.getElementById("view-math");
        const viewPhysics = document.getElementById("view-physics");
        const viewChemistry = document.getElementById("view-chemistry");
        const viewMentorship = document.getElementById("view-mentorship");
        const viewPhyOs = document.getElementById("view-phy-os");
        const viewOfflineMode = document.getElementById("view-offline-mode");
        const viewDetails = document.getElementById("view-course-details");
        const dbLogo = document.getElementById("db-logo");
        const dbHeaderBackBtn = document.getElementById("db-header-back-btn");
        const dbHeaderRight = document.getElementById("db-header-right");
        
        // Hide all sub-views first
        if (viewMyCourses) viewMyCourses.classList.remove("active");
        if (viewMath) viewMath.classList.remove("active");
        if (viewPhysics) viewPhysics.classList.remove("active");
        if (viewChemistry) viewChemistry.classList.remove("active");
        if (viewMentorship) viewMentorship.classList.remove("active");
        if (viewPhyOs) viewPhyOs.classList.remove("active");
        if (viewOfflineMode) viewOfflineMode.classList.remove("active");
        if (viewDetails) viewDetails.classList.remove("active");

        if (viewName === "my-courses" || viewName === "home") {
            if (viewMyCourses) viewMyCourses.classList.add("active");
            if (dbLogo) dbLogo.style.display = "flex";
            if (dbHeaderBackBtn) dbHeaderBackBtn.style.display = "none";
            if (dbHeaderRight) dbHeaderRight.style.display = "block";
            renderMyCourses();
        } else if (viewName === "math" || viewName === "mathematics") {
            if (viewMath) viewMath.classList.add("active");
            if (dbLogo) dbLogo.style.display = "flex";
            if (dbHeaderBackBtn) dbHeaderBackBtn.style.display = "none";
            if (dbHeaderRight) dbHeaderRight.style.display = "block";
            renderSubjectGrid("Mathematics", "math-courses-grid");
        } else if (viewName === "physics") {
            if (viewPhysics) viewPhysics.classList.add("active");
            if (dbLogo) dbLogo.style.display = "flex";
            if (dbHeaderBackBtn) dbHeaderBackBtn.style.display = "none";
            if (dbHeaderRight) dbHeaderRight.style.display = "block";
            renderSubjectGrid("Physics", "physics-courses-grid");
        } else if (viewName === "chemistry") {
            if (viewChemistry) viewChemistry.classList.add("active");
            if (dbLogo) dbLogo.style.display = "flex";
            if (dbHeaderBackBtn) dbHeaderBackBtn.style.display = "none";
            if (dbHeaderRight) dbHeaderRight.style.display = "block";
            renderSubjectGrid("Chemistry", "chemistry-courses-grid");
        } else if (viewName === "mentorship" || viewName === "modules" || viewName === "crash-course") {
            if (viewMentorship) viewMentorship.classList.add("active");
            if (dbLogo) dbLogo.style.display = "flex";
            if (dbHeaderBackBtn) dbHeaderBackBtn.style.display = "none";
            if (dbHeaderRight) dbHeaderRight.style.display = "block";
            renderSubjectGrid("Mentorship", "mentorship-courses-grid");
        } else if (viewName === "phy-os" || viewName === "phyos") {
            if (viewPhyOs) viewPhyOs.classList.add("active");
            if (dbLogo) dbLogo.style.display = "flex";
            if (dbHeaderBackBtn) dbHeaderBackBtn.style.display = "none";
            if (dbHeaderRight) dbHeaderRight.style.display = "block";
            renderSubjectGrid("Phy OS", "phy-os-courses-grid");
        } else if (viewName === "offline-mode") {
            if (viewOfflineMode) viewOfflineMode.classList.add("active");
            if (dbLogo) dbLogo.style.display = "flex";
            if (dbHeaderBackBtn) dbHeaderBackBtn.style.display = "none";
            if (dbHeaderRight) dbHeaderRight.style.display = "block";
            renderOfflineMode();
        } else if (viewName === "course") {
            if (viewDetails) viewDetails.classList.add("active");
            if (dbLogo) dbLogo.style.display = "flex";
            if (dbHeaderBackBtn) dbHeaderBackBtn.style.display = "flex";
            if (dbHeaderRight) dbHeaderRight.style.display = "block";
            if (params.courseId) {
                activeCourseId = params.courseId;
                renderCourseDetails(params.courseId);
            }
        }
    }
}

function toggleNavMenu() {
    const navDrawer = document.getElementById("db-nav-drawer");
    if (navDrawer) {
        navDrawer.classList.toggle("show");
    }
}

function switchNavView(target) {
    const targetToNavId = {
        "my-courses": "nav-item-my-courses",
        "home": "nav-item-my-courses",
        "math": "nav-item-math",
        "mathematics": "nav-item-math",
        "physics": "nav-item-physics",
        "chemistry": "nav-item-chemistry",
        "mentorship": "nav-item-mentorship",
        "crash-course": "nav-item-mentorship",
        "modules": "nav-item-mentorship",
        "phy-os": "nav-item-phy-os",
        "phyos": "nav-item-phy-os",
        "offline-mode": "nav-item-offline-mode"
    };
    const navDrawer = document.getElementById("db-nav-drawer");
    if (navDrawer) navDrawer.classList.remove("show");
    
    const activeNavId = targetToNavId[target] || "nav-item-my-courses";
    const allNavItems = document.querySelectorAll(".db-nav-item");
    allNavItems.forEach(item => {
        if (item.id === activeNavId) item.classList.add("active");
        else item.classList.remove("active");
    });

    switchView(target);
}


function parseDurationToSeconds(durationStr) {
    if (!durationStr || typeof durationStr !== 'string') return 0;
    let totalSec = 0;
    const hMatch = durationStr.match(/(\d+)\s*h/i);
    const mMatch = durationStr.match(/(\d+)\s*m/i);
    const sMatch = durationStr.match(/(\d+)\s*s/i);
    if (hMatch) totalSec += parseInt(hMatch[1], 10) * 3600;
    if (mMatch) totalSec += parseInt(mMatch[1], 10) * 60;
    if (sMatch) totalSec += parseInt(sMatch[1], 10);
    if (!hMatch && !mMatch && !sMatch) {
        const onlyNum = durationStr.match(/(\d+)/);
        if (onlyNum) totalSec += parseInt(onlyNum[1], 10) * 60;
    }
    return totalSec;
}

function getCourseCompletionStats(course) {
    if (!course || !course.lectures || course.lectures.length === 0) {
        return { completed: 0, total: 0, pct: 0, inProgress: 0 };
    }
    const total = course.lectures.length;
    let completed = 0;
    let inProgress = 0;
    course.lectures.forEach(lec => {
        const prog = getLectureProgress(lec.uid);
        if (prog && prog.timeSec > 60) {
            const dur = parseDurationToSeconds(lec.duration);
            const pct = dur > 0 ? Math.min(100, Math.round((prog.timeSec / dur) * 100)) : 0;
            if (pct >= 90) {
                completed++;
            } else {
                inProgress++;
            }
        }
    });
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, pct, inProgress };
}

function getCourseStatsText(course) {
    if (course._statsText) return course._statsText;
    const totalLectures = course.lectures ? course.lectures.length : 0;
    let totalMinutes = 0;
    if (course.lectures) {
        course.lectures.forEach(lec => {
            const durationStr = lec.duration || "";
            let hours = 0;
            let minutes = 0;
            const hMatch = durationStr.match(/(\d+)\s*h/);
            const mMatch = durationStr.match(/(\d+)\s*m/);
            if (hMatch) hours = parseInt(hMatch[1], 10);
            if (mMatch) minutes = parseInt(mMatch[1], 10);
            if (!hMatch && !mMatch) {
                const onlyNum = durationStr.match(/(\d+)/);
                if (onlyNum) minutes = parseInt(onlyNum[1], 10);
            }
            totalMinutes += hours * 60 + minutes;
        });
    }

    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    let durationText = "";
    if (hrs > 0) durationText += `${hrs}h`;
    if (mins > 0) {
        if (hrs > 0) durationText += " ";
        durationText += `${mins}m`;
    }
    if (!durationText) durationText = "0m";

    course._statsText = `${totalLectures} Lectures • ${durationText}`;
    return course._statsText;
}

// ══════════════════════════════════════════════════
// MY COURSES VIEW RENDERER (DEFAULT HOME)
// ══════════════════════════════════════════════════
function renderMyCourses() {
    // 1. Last Watched Card
    const lastWatchedWrap = document.getElementById("last-watched-container");
    const lastWatched = getLastWatched();
    if (lastWatchedWrap) {
        if (lastWatched && lastWatched.uid) {
            const mins = Math.floor((lastWatched.timeSec || 0) / 60);
            const secs = Math.floor((lastWatched.timeSec || 0) % 60);
            const formattedTime = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

            lastWatchedWrap.innerHTML = `
                <div class="last-watched-card">
                    <div class="last-watched-info">
                        <div class="last-watched-badge"><i class="fas fa-play-circle"></i> LAST WATCHED</div>
                        <div class="last-watched-title">${lastWatched.lectureTitle}</div>
                        <div class="last-watched-sub">${lastWatched.courseTitle} • Stopped at ${formattedTime}</div>
                    </div>
                    <button class="last-watched-btn" onclick="launchLecture('${lastWatched.uid}', ${lastWatched.timeSec || 0}, '${lastWatched.courseId}')">
                        <i class="fas fa-play"></i> Continue
                    </button>
                </div>
            `;
            lastWatchedWrap.style.display = "block";
        } else {
            lastWatchedWrap.style.display = "none";
            lastWatchedWrap.innerHTML = "";
        }
    }

    // 2. Enrolled Courses Grid
    const grid = document.getElementById("my-courses-grid");
    if (!grid) return;
    grid.innerHTML = "";
    
    const enrolledIds = getEnrolledCourses();
    const enrolledCourses = COURSES.filter(c => !c.isLocal && enrolledIds.includes(c.id));

    if (enrolledCourses.length === 0) {
        grid.innerHTML = `
            <div class="empty-courses-state" style="grid-column: 1 / -1; padding: 40px 20px; text-align: center; color: #71717a;">
                <i class="fas fa-bookmark" style="font-size: 32px; margin-bottom: 12px; display: block; opacity: 0.4;"></i>
                <p style="font-size: 15px; color: #f4f4f5; font-weight: 600; margin-bottom: 14px;">No courses enrolled yet.</p>
                <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center;">
                    <button class="explore-nav-btn" onclick="switchNavView('math')"><i class="fas fa-square-root-variable"></i> Mathematics</button>
                    <button class="explore-nav-btn" onclick="switchNavView('physics')"><i class="fas fa-atom"></i> Physics</button>
                    <button class="explore-nav-btn" onclick="switchNavView('chemistry')"><i class="fas fa-flask-vial"></i> Chemistry</button>
                    <button class="explore-nav-btn" onclick="switchNavView('mentorship')"><i class="fas fa-bolt"></i> Crash Course</button>
                    <button class="explore-nav-btn" onclick="switchNavView('phy-os')"><i class="fas fa-microchip"></i> Phy OS</button>
                </div>
            </div>
        `;
        return;
    }

    enrolledCourses.forEach(course => {
        const comp = getCourseCompletionStats(course);
        const card = document.createElement("div");
        card.className = "course-card";
        card.onclick = () => switchView("course", { courseId: course.id });

        const progressHtml = (comp.completed > 0 || comp.inProgress > 0) ? `
            <div class="course-progress-wrap">
                <div class="course-progress-bar">
                    <div class="course-progress-fill ${comp.pct >= 100 ? 'all-done' : ''}" style="width: ${comp.pct}%;"></div>
                </div>
                <div class="course-progress-text">
                    <span>${comp.completed}/${comp.total} Completed</span>
                    <span>${comp.pct}%</span>
                </div>
            </div>
        ` : '';

        card.innerHTML = `
            <div class="course-card-left">
                <h3 class="course-card-title">${course.title}</h3>
                <p class="course-card-desc">${course.description}</p>
                ${progressHtml}
            </div>
            <div class="course-card-right-col">
                <div class="course-card-badge ${comp.pct >= 100 ? 'completed' : ''}">${comp.pct >= 100 ? '<i class="fas fa-check-circle"></i> Completed' : getCourseStatsText(course)}</div>
                <div class="course-btn-group">
                    <button class="course-continue-btn" title="Continue watching" onclick="event.stopPropagation(); launchCourseContinue('${course.id}')">
                        <i class="fas fa-play" style="font-size:10px;"></i> Continue
                    </button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function launchCourseContinue(courseId) {
    const course = findCourseById(courseId);
    if (!course || !course.lectures || course.lectures.length === 0) return;

    const lastWatched = getLastWatched();
    if (lastWatched && lastWatched.courseId === courseId && lastWatched.uid) {
        launchLecture(lastWatched.uid, lastWatched.timeSec || 0);
    } else {
        launchLecture(course.lectures[0].uid, 0);
    }
}

// ══════════════════════════════════════════════════
// SUBJECT CATALOGS RENDERER (MATH, PHYSICS, CHEMISTRY)
// ══════════════════════════════════════════════════
function renderSubjectGrid(subject, gridId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = "";

    const subjectCourses = COURSES.filter(c => {
        if (c.isLocal) return false;
        if (subject === "Mentorship") return c.subject === "Mentorship" || c.subject === "Crash Course";
        return c.subject === subject;
    });

    if (subjectCourses.length === 0) {
        grid.innerHTML = `
            <div class="empty-courses-state" style="grid-column: 1 / -1; padding: 40px 20px; text-align: center; color: #71717a;">
                <p style="font-size: 15px; color: #f4f4f5; font-weight: 600;">No ${subject} courses found.</p>
            </div>
        `;
        return;
    }

    subjectCourses.forEach(course => {
        const enrolled = isCourseEnrolled(course.id);
        const comp = getCourseCompletionStats(course);
        const card = document.createElement("div");
        card.className = "course-card";
        card.onclick = () => switchView("course", { courseId: course.id });

        const progressHtml = (comp.completed > 0 || comp.inProgress > 0) ? `
            <div class="course-progress-wrap">
                <div class="course-progress-bar">
                    <div class="course-progress-fill ${comp.pct >= 100 ? 'all-done' : ''}" style="width: ${comp.pct}%;"></div>
                </div>
                <div class="course-progress-text">
                    <span>${comp.completed}/${comp.total} Completed</span>
                    <span>${comp.pct}%</span>
                </div>
            </div>
        ` : '';

        card.innerHTML = `
            <div class="course-card-left">
                <h3 class="course-card-title">${course.title}</h3>
                <p class="course-card-desc">${course.description}</p>
                ${progressHtml}
            </div>
            <div class="course-card-right-col">
                <div class="course-card-badge ${comp.pct >= 100 ? 'completed' : ''}">${comp.pct >= 100 ? '<i class="fas fa-check-circle"></i> Completed' : getCourseStatsText(course)}</div>
                <div class="course-btn-group">
                    <button class="course-add-btn ${enrolled ? 'added' : ''}" title="${enrolled ? 'Remove from My Courses' : 'Add to My Courses'}" onclick="toggleEnrollCourse('${course.id}', event)">
                        <i class="fas ${enrolled ? 'fa-check' : 'fa-plus'}"></i> ${enrolled ? 'Added' : 'Add'}
                    </button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// ══════════════════════════════════════════════════
// OFFLINE MODE VIEW RENDERER
// ══════════════════════════════════════════════════
function renderOfflineMode() {
    // 1. Local Imported Folders & Courses
    const localGrid = document.getElementById("local-courses-grid");
    if (localGrid) {
        localGrid.innerHTML = "";
        if (LOCAL_COURSES.length === 0) {
            localGrid.innerHTML = `
                <div class="empty-courses-state" style="padding: 36px 20px; text-align: center; color: #71717a; border: 1px dashed rgba(255,255,255,0.08); border-radius: 16px;">
                    <i class="fas fa-folder-open" style="font-size: 36px; margin-bottom: 12px; display: block; opacity: 0.5; color: #22c55e;"></i>
                    <p style="font-size: 14px; margin-bottom: 6px; color: #f4f4f5; font-weight: 600;">No local folders imported yet.</p>
                    <span style="font-size: 13px; color: #71717a;">Click "Browse Folder" above to add your downloaded lecture folders.</span>
                </div>
            `;
        } else {
            LOCAL_COURSES.forEach(course => {
                const card = document.createElement("div");
                card.className = "course-card";
                card.onclick = () => switchView("course", { courseId: course.id });
                card.innerHTML = `
                    <div class="course-card-left">
                        <div class="course-card-icon-wrap" style="background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.3); color: #22c55e;">
                            <i class="fas fa-folder-open"></i>
                        </div>
                        <h3 class="course-card-title">${course.title}</h3>
                        <p class="course-card-desc">${course.description}</p>
                    </div>
                    <div class="course-card-right-col">
                        <div class="course-card-badge" style="background: rgba(34,197,94,0.12); color: #22c55e; border-color: rgba(34,197,94,0.25);">
                            <i class="fas fa-hdd"></i> ${getCourseStatsText(course)}
                        </div>
                        <div class="course-btn-group">
                            <button class="course-card-btn" style="background: #22c55e; border-color: #22c55e; color: #09090b; font-weight: 700;">Explore Local Folder</button>
                        </div>
                    </div>
                `;
                localGrid.appendChild(card);
            });
        }
    }

    // 2. Pre-cached / IndexedDB Online Lectures
    const cachedList = document.getElementById("offline-cached-list");
    const clearBtn = document.getElementById("clear-cache-btn");
    if (cachedList) {
        cachedList.innerHTML = "";
        const uids = Array.from(cachedUidsSet);
        if (uids.length === 0) {
            if (clearBtn) clearBtn.style.display = "none";
            cachedList.innerHTML = `
                <div style="text-align:center; padding:30px; color:#71717a; font-size:13px; border: 1px dashed rgba(255,255,255,0.06); border-radius: 12px;">
                    <i class="fas fa-bolt" style="font-size:24px; margin-bottom:8px; display:block; opacity:0.4;"></i>
                    No fast-cached online lectures yet. Telemetry data is automatically pre-cached silently on startup.
                </div>
            `;
        } else {
            if (clearBtn) clearBtn.style.display = "block";
            const fragment = document.createDocumentFragment();
            
            uids.forEach(uid => {
                let foundLec = null;
                let foundCourse = null;
                for (const c of COURSES) {
                    if (c.lectures) {
                        const l = c.lectures.find(lec => lec.uid === uid);
                        if (l) {
                            foundLec = l;
                            foundCourse = c;
                            break;
                        }
                    }
                }

                const title = foundLec ? foundLec.title : `Lecture ${uid}`;
                const rank = foundLec ? foundLec.rank : "--";
                const courseName = foundCourse ? foundCourse.title : "Online Catalog";
                const duration = foundLec ? foundLec.duration : "";

                const card = document.createElement("div");
                card.className = "lecture-card";
                card.onclick = () => launchLecture(uid);
                card.innerHTML = `
                    <div class="lecture-card-left">
                        <div class="lecture-number"><i class="fas fa-bolt" style="color:var(--accent);"></i></div>
                        <div>
                            <div class="lecture-card-title">${title}</div>
                            <div class="lecture-card-duration">
                                <span>${courseName}</span> • <i class="far fa-clock"></i> ${duration || '--'}
                                <span class="offline-badge" style="background:rgba(239,68,68,0.15);color:var(--accent);border-color:rgba(239,68,68,0.3);"><i class="fas fa-bolt"></i> Instant Ready</span>
                            </div>
                        </div>
                    </div>
                    <div class="lecture-card-play-btn">
                        <i class="fas fa-play"></i>
                    </div>
                `;
                fragment.appendChild(card);
            });
            cachedList.appendChild(fragment);
        }
    }
}

async function clearOfflineStorage() {
    if (!confirm("Are you sure you want to clear all offline pre-cached lecture data?")) return;
    try {
        await clearAllOfflineTelemetry();
        cachedUidsSet.clear();
        window.dispatchEvent(new CustomEvent('lennister-offline-cleared'));
        renderOfflineMode();
        if (window.showToast) window.showToast("🧹 Cleared offline pre-cached telemetry", "info");
    } catch (e) {
        console.error("Failed to clear offline storage:", e);
    }
}

function renderCourseDetails(courseId) {
    const course = findCourseById(courseId);
    if (!course) return;

    selectedLectureUids.clear();
    updateResetProgressButtonUI();

    const stats = getCourseCompletionStats(course);
    const header = document.getElementById("course-header-details");
    if (header) {
        header.innerHTML = `
            <h1 class="course-title-main">${course.title}</h1>
            <p class="course-desc-main">${course.description}</p>
            <div class="course-summary-progress">
                <span><i class="fas fa-tasks" style="color:var(--accent);"></i> Progress: <strong>${stats.completed}/${stats.total} Completed</strong> (${stats.pct}%)</span>
                <div class="course-summary-progress-bar">
                    <div class="course-summary-progress-fill" style="width: ${stats.pct}%;"></div>
                </div>
            </div>
        `;
    }

    const countChip = document.getElementById("lecture-count-chip");
    if (countChip) countChip.textContent = getCourseStatsText(course);

    const searchInput = document.getElementById("lecture-search-input");
    if (searchInput) searchInput.value = "";

    renderLecturesList(course.lectures);
}

let selectedLectureUids = new Set();
let _isDownloadingLectures = false;

function updateResetProgressButtonUI() {
    const btn = document.getElementById("reset-course-progress-btn");
    const countChip = document.getElementById("lecture-count-chip");
    const count = selectedLectureUids.size;

    if (btn) {
        if (count > 0) {
            btn.innerHTML = `<i class="fas fa-undo-alt"></i> <span>Reset Selected (${count})</span>`;
            btn.classList.add("has-selected");
            btn.title = `Reset watch progress for ${count} selected lecture(s)`;
        } else {
            btn.innerHTML = `<i class="fas fa-undo-alt"></i> <span>Reset Progress</span>`;
            btn.classList.remove("has-selected");
            btn.title = "Reset watch progress for this course";
        }
    }

    if (countChip && !_isDownloadingLectures) {
        if (count > 0) {
            countChip.className = "lecture-count-chip download-selected-chip";
            countChip.innerHTML = `<i class="fas fa-cloud-arrow-down"></i> <span>Download [${count}]</span>`;
            countChip.title = `Click to download ${count} selected lecture(s) (telemetry, video & PDFs) for offline viewing`;
            countChip.onclick = (e) => {
                e.stopPropagation();
                downloadSelectedLectures();
            };
        } else {
            countChip.className = "lecture-count-chip";
            const course = findCourseById(activeCourseId);
            countChip.textContent = course ? getCourseStatsText(course) : "Lectures";
            countChip.title = "";
            countChip.onclick = null;
        }
    }
}

async function downloadSelectedLectures() {
    if (_isDownloadingLectures) return;
    const count = selectedLectureUids.size;
    if (count === 0) {
        if (window.showToast) window.showToast("Select one or more lectures to download", "info");
        return;
    }

    const course = findCourseById(activeCourseId);
    if (!course || !course.lectures) return;

    const countChip = document.getElementById("lecture-count-chip");
    const targetUids = Array.from(selectedLectureUids);
    const targetLectures = course.lectures.filter(l => targetUids.includes(l.uid));

    if (targetLectures.length === 0) return;

    _isDownloadingLectures = true;
    if (countChip) {
        countChip.classList.add("downloading");
        countChip.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>Downloading [1/${targetLectures.length}]...</span>`;
    }
    if (window.showToast) {
        window.showToast(`Starting offline download for ${targetLectures.length} lecture(s)...`, "info", 2500);
    }

    let successCount = 0;
    for (let i = 0; i < targetLectures.length; i++) {
        const lec = targetLectures[i];
        if (countChip) {
            countChip.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>Downloading [${i + 1}/${targetLectures.length}]...</span>`;
        }
        try {
            const ok = await downloadLectureBundle(lec, course);
            if (ok) {
                successCount++;
                cachedUidsSet.add(lec.uid);
            }
        } catch (err) {
            console.error(`[OfflineDownload] Error downloading ${lec.uid}:`, err);
        }
    }

    _isDownloadingLectures = false;
    await refreshCachedUidsSet();

    selectedLectureUids.clear();
    updateResetProgressButtonUI();

    const searchInput = document.getElementById("lecture-search-input");
    if (searchInput && searchInput.value.trim()) {
        filterLectures();
    } else {
        renderLecturesList(course.lectures);
    }

    if (window.showToast) {
        if (successCount > 0) {
            window.showToast(`🎉 Downloaded ${successCount} lecture(s) for offline viewing!`, "success", 4000);
        } else {
            window.showToast(`Download failed or partially failed. Please check network connection.`, "warn", 3500);
        }
    }
}
window.downloadSelectedLectures = downloadSelectedLectures;

function toggleLectureSelection(uid) {
    if (!uid) return;
    if (selectedLectureUids.has(uid)) {
        selectedLectureUids.delete(uid);
    } else {
        selectedLectureUids.add(uid);
    }
    updateResetProgressButtonUI();

    const card = document.querySelector(`.lecture-card[data-uid="${uid}"]`);
    if (card) {
        const isSel = selectedLectureUids.has(uid);
        card.classList.toggle("selected", isSel);
        const numEl = card.querySelector(".lecture-number");
        if (numEl) {
            numEl.classList.toggle("selected", isSel);
            const isCompleted = card.classList.contains("completed");
            numEl.title = isSel 
                ? "Selected (Click to unselect)" 
                : (isCompleted ? "Completed (Click to select)" : "Click to select for download / reset");
            if (isSel) {
                numEl.innerHTML = `<i class="fas fa-check"></i>`;
            } else {
                const rankVal = numEl.getAttribute("data-rank") || "";
                numEl.innerHTML = isCompleted ? `<i class="fas fa-check"></i>` : rankVal;
            }
        }
    }
}

function renderLecturesList(lectures) {
    const listContainer = document.getElementById("course-lectures-list");
    if (!listContainer) return;
    listContainer.innerHTML = "";

    if (!lectures || lectures.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center; padding:40px; color:#71717a; font-size:14px;"><i class="fas fa-search" style="font-size:24px; margin-bottom:10px; display:block;"></i>No matching lectures found.</div>`;
        return;
    }

    const fragment = document.createDocumentFragment();

    lectures.forEach(lec => {
        const isOffline = cachedUidsSet.has(lec.uid);
        const isLocal = !!(lec.videoFile || lec.jsonFile || lec.isLocal);
        const prog = getLectureProgress(lec.uid);
        const watchedSec = prog ? (prog.maxWatchedSec || prog.timeSec || 0) : 0;
        let totalDurSec = parseDurationToSeconds(lec.duration);
        if (totalDurSec <= 0 && prog && prog.durationSec > 0) {
            totalDurSec = prog.durationSec;
        }
        let pct = (totalDurSec > 0 && watchedSec > 0) 
            ? Math.min(100, Math.round((watchedSec / totalDurSec) * 100)) 
            : (prog ? (prog.percent || 0) : 0);
        const isCompleted = pct >= 90 || (prog && prog.isCompleted);
        if (isCompleted) pct = 100;

        let pctBadge = "";
        let progBadge = "";
        let progressBarHtml = "";

        if (isCompleted) {
            pctBadge = `<span class="lecture-percent-chip completed" title="100% Completed"><i class="fas fa-check-circle"></i> 100%</span>`;
            progressBarHtml = `<div class="lecture-progress-track"><div class="lecture-progress-fill completed" style="width: 100%;"></div></div>`;
        } else if (watchedSec > 10 || pct > 0) {
            pctBadge = `<span class="lecture-percent-chip" title="${pct}% Completed"><i class="fas fa-play-circle"></i> ${pct}%</span>`;
            const wM = Math.floor(watchedSec / 60);
            const wH = Math.floor(wM / 60);
            const remM = wM % 60;
            const timeStr = wH > 0 ? `${wH}h ${remM}m` : `${remM}m`;
            progBadge = `<span class="offline-badge" style="background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);" title="Resume at ${timeStr}"><i class="fas fa-history"></i> At ${timeStr}</span>`;
            progressBarHtml = `<div class="lecture-progress-track"><div class="lecture-progress-fill" style="width: ${Math.max(4, pct)}%;"></div></div>`;
        }

        const isSelected = selectedLectureUids.has(lec.uid);
        const card = document.createElement("div");
        card.className = `lecture-card ${isCompleted ? 'completed' : ''} ${isSelected ? 'selected' : ''}`;
        card.setAttribute("data-uid", lec.uid);
        card.onclick = () => launchLecture(lec.uid, null, activeCourseId);

        const circleContent = isSelected 
            ? '<i class="fas fa-check"></i>' 
            : (isCompleted ? '<i class="fas fa-check"></i>' : lec.rank);
        const circleTitle = isSelected 
            ? 'Selected for reset (Click to unselect)' 
            : (isCompleted ? 'Completed (Click to select for reset)' : `Lecture #${lec.rank} (Click to select for reset)`);

        card.innerHTML = `
            <div class="lecture-card-left">
                <div class="lecture-number ${isCompleted ? 'completed' : ''} ${isSelected ? 'selected' : ''}" 
                     data-rank="${lec.rank}"
                     title="${circleTitle}"
                     onclick="event.stopPropagation(); toggleLectureSelection('${lec.uid}')">
                    ${circleContent}
                </div>
                <div style="flex:1; min-width:0;">
                    <div class="lecture-card-title">${lec.title}</div>
                    <div class="lecture-card-duration">
                        <i class="far fa-clock"></i> ${lec.duration || '--'}
                        ${pctBadge}
                        ${progBadge}
                        ${isLocal ? `<span class="offline-badge" style="background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid rgba(34,197,94,0.3);" title="Loaded from Local Folder"><i class="fas fa-folder-open"></i> Local Ready</span>` : (isOffline ? `<span class="offline-badge" title="Cached in IndexedDB for Offline Learning"><i class="fas fa-bolt"></i> Offline Ready</span>` : '')}
                        ${lec.pdfFile ? `<span class="offline-badge" style="background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid rgba(239,68,68,0.25);" title="PDF Notes Attached"><i class="fas fa-file-pdf"></i> Notes</span>` : ''}
                    </div>
                    ${progressBarHtml}
                </div>
            </div>
            <div class="lecture-card-play-btn">
                <i class="fas ${isCompleted ? 'fa-redo' : 'fa-play'}"></i>
            </div>
        `;
        fragment.appendChild(card);
    });

    listContainer.appendChild(fragment);
}

let _searchDebounceTimer = null;
function filterLectures() {
    if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
    _searchDebounceTimer = setTimeout(() => {
        const searchInput = document.getElementById("lecture-search-input");
        const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
        const course = findCourseById(activeCourseId);
        if (!course) return;

        if (!query) {
            renderLecturesList(course.lectures);
            return;
        }

        const filtered = course.lectures.filter(l => 
            (l.title && l.title.toLowerCase().includes(query)) || 
            (l.rank && l.rank.toString().includes(query)) ||
            (l.uid && l.uid.toLowerCase().includes(query))
        );
        renderLecturesList(filtered);
    }, 60);
}

function resetCurrentCourseProgress(courseId = null) {
    const targetCourseId = courseId || activeCourseId;
    const course = findCourseById(targetCourseId);
    if (!course || !course.lectures || course.lectures.length === 0) return;

    const count = selectedLectureUids.size;
    let targetUids = [];
    let confirmMsg = "";

    if (count > 0) {
        targetUids = Array.from(selectedLectureUids);
        confirmMsg = `Are you sure you want to reset watch progress for ${count} selected lecture(s) in "${course.title}"?`;
    } else {
        targetUids = course.lectures.map(l => l.uid).filter(Boolean);
        confirmMsg = `Are you sure you want to reset all watch progress for "${course.title}"?\n\nThis will clear all completion checkmarks and saved resume positions for this course.`;
    }

    const confirmed = confirm(confirmMsg);
    if (!confirmed) return;

    try {
        let progMap = {};
        const stored = localStorage.getItem(PROGRESS_KEY);
        if (stored) progMap = JSON.parse(stored);

        targetUids.forEach(uid => {
            if (progMap[uid]) {
                delete progMap[uid];
            }
        });

        _memoProgress = progMap;
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(progMap));

        // Clear last watched if it belonged to one of the reset lectures
        const lastWatched = getLastWatched();
        if (lastWatched && targetUids.includes(lastWatched.uid)) {
            localStorage.removeItem(LAST_WATCHED_KEY);
            _memoLastWatched = null;
        }

        selectedLectureUids.clear();
        updateResetProgressButtonUI();

        // Re-render course details and dashboard progress bars
        const searchInput = document.getElementById("lecture-search-input");
        if (searchInput && searchInput.value.trim()) {
            filterLectures();
        } else {
            renderLecturesList(course.lectures);
        }
        renderMyCourses();

        if (window.showToast) {
            const toastMsg = count > 0 
                ? `Reset progress for ${count} selected lecture(s)` 
                : `Reset progress for "${course.title}"`;
            window.showToast(toastMsg, "info");
        }
    } catch (e) {
        console.error("Failed to reset course progress:", e);
    }
}

async function launchLecture(uid, startTimeSec = null, courseId = null) {
    if (window.enterFullscreen) window.enterFullscreen();
    activeUid = uid;
    if (courseId) {
        activeCourseId = courseId;
    } else {
        const foundLocal = LOCAL_COURSES.find(c => c.lectures && c.lectures.some(l => l.uid === uid));
        if (foundLocal) {
            activeCourseId = foundLocal.id;
        } else {
            const foundCourse = findCourseById(activeCourseId);
            const hasLec = foundCourse && foundCourse.lectures && foundCourse.lectures.some(l => l.uid === uid);
            if (!hasLec) {
                const canonical = COURSES.find(c => c.lectures && c.lectures.some(l => l.uid === uid));
                if (canonical) activeCourseId = canonical.id;
            }
        }
    }
    const sp = document.getElementById("splash");
    if (sp) {
        sp.style.display = "flex";
        sp.classList.remove("hidden");
    }
    switchView("player");
    
    // 1. Check if lecture belongs to an imported local folder package
    let localLec = null;
    let localCourse = null;
    for (const c of LOCAL_COURSES) {
        if (c.lectures) {
            const found = c.lectures.find(l => l.uid === uid);
            if (found) {
                localLec = found;
                localCourse = c;
                break;
            }
        }
    }

    if (localLec && window.loadLocalLecture) {
        await window.loadLocalLecture(localLec, localCourse, startTimeSec || 0);
        if (sp) {
            sp.classList.add("hidden");
            sp.style.display = "none";
        }
        return;
    }

    // 2. Standard online lecture playback (uses local IndexedDB cache if available)
    let targetTime = 0;
    if (typeof startTimeSec === 'number' && startTimeSec > 0) {
        targetTime = startTimeSec;
    } else {
        const savedProg = getLectureProgress(uid);
        if (savedProg && savedProg.timeSec > 0) {
            targetTime = savedProg.timeSec;
        } else {
            const lastWatched = getLastWatched();
            if (lastWatched && lastWatched.uid === uid && (lastWatched.timeSec || 0) > 0) {
                targetTime = lastWatched.timeSec;
            }
        }
    }

    saveLastWatched(uid, activeCourseId, targetTime);
    const success = await loadLectureByUid(uid, targetTime, activeCourseId);
    if (success) {
        if (sp) {
            sp.classList.add("hidden");
            sp.style.display = "none";
        }
    }
}

function goBackToCourse() {
    const video = document.getElementById("main-video");
    if (video && activeUid && video.currentTime > 0) {
        saveLastWatched(activeUid, activeCourseId, video.currentTime);
    }
    if (window.history.length > 1 && window.history.state && window.history.state.view === "player") {
        window.history.back();
    } else {
        switchView("course", { courseId: activeCourseId });
    }
}

// ══════════════════════════════════════════════════
// SILENT PREDICTIVE TELEMETRY PRE-CACHING (2 LECTURES)
// ══════════════════════════════════════════════════
async function prefetchPredictiveLectures() {
    try {
        const lastWatched = getLastWatched();
        let course = null;
        let currentLecIndex = 0;
        
        if (lastWatched && lastWatched.courseId) {
            course = COURSES.find(c => c.id === lastWatched.courseId);
            if (course && course.lectures) {
                currentLecIndex = course.lectures.findIndex(l => l.uid === lastWatched.uid);
                if (currentLecIndex === -1) currentLecIndex = 0;
            }
        }
        
        if (!course) {
            course = COURSES.find(c => !c.isLocal);
            currentLecIndex = 0;
        }
        
        if (!course || !course.lectures || course.lectures.length === 0) return;
        
        const targets = [];
        // Target 1: The lecture to resume
        if (currentLecIndex >= 0 && currentLecIndex < course.lectures.length) {
            targets.push(course.lectures[currentLecIndex]);
        }
        // Target 2: The next lecture in sequence
        if (currentLecIndex + 1 < course.lectures.length) {
            targets.push(course.lectures[currentLecIndex + 1]);
        } else if (course.lectures.length > 1 && targets.length === 1) {
            targets.push(course.lectures[0]);
        }
        
        // Silently prefetch telemetry in background into IndexedDB
        for (const targetLec of targets) {
            const uid = targetLec.uid;
            if (!uid || cachedUidsSet.has(uid)) continue;
            
            const directUrl = `https://uamedia.uacdn.net/lesson-raw/${uid}/data.json`;
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(directUrl)}`;
            
            try {
                let res = await fetch(directUrl).catch(() => null);
                if (!res || !res.ok) {
                    res = await fetch(proxyUrl).catch(() => null);
                }
                if (res && res.ok) {
                    const buffer = await res.arrayBuffer();
                    await saveTelemetryOffline(uid, buffer, {
                        courseId: course.id,
                        courseTitle: course.title,
                        lectureTitle: targetLec.title,
                        downloadedAt: Date.now()
                    });
                    cachedUidsSet.add(uid);
                    window.dispatchEvent(new CustomEvent('lennister-offline-change', { detail: { uid, isCached: true } }));
                    console.log(`[Prefetch] Silently pre-cached telemetry for: ${targetLec.title} (${uid})`);
                }
            } catch (fetchErr) {
                console.warn(`[Prefetch] Failed for ${uid}:`, fetchErr.message);
            }
        }
    } catch (e) {
        console.warn("[Prefetch] Error running predictive cache:", e);
    }
}

// ══════════════════════════════════════════════════
// STUDY PROGRESS BACKUP / EXPORT / IMPORT
// ══════════════════════════════════════════════════
function triggerBlobDownload(text, fileName) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportStudyProgress() {
    try {
        let lectureProgress = {};
        try {
            const rawProg = localStorage.getItem(PROGRESS_KEY);
            if (rawProg) lectureProgress = JSON.parse(rawProg);
        } catch (_) {}

        // Collect all timestamped study notes and bookmarks across all lectures
        const notesMap = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith("runcadel_notes_")) {
                const uid = key.replace("runcadel_notes_", "");
                try {
                    const parsed = JSON.parse(localStorage.getItem(key));
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        notesMap[uid] = parsed;
                    }
                } catch (_) {}
            }
        }

        const backupData = {
            app: "lennister-player",
            version: "2.0",
            exportedAt: new Date().toISOString(),
            enrolledCourses: getEnrolledCourses(),
            lastWatched: getLastWatched(),
            lectureProgress: lectureProgress,
            notes: notesMap,
            teacherCamSize: localStorage.getItem("teacher_cam_size") || "big"
        };

        const jsonStr = JSON.stringify(backupData, null, 2);
        const dateStr = new Date().toISOString().slice(0, 10);
        const fileName = `lennister_progress_backup_${dateStr}.json`;

        // If mobile share is available and can share files, offer native share
        try {
            const file = new File([jsonStr], fileName, { type: "application/json" });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({
                    title: "Runcadel Player Backup",
                    text: "Progress, Bookmarks & Notes Backup",
                    files: [file]
                }).then(() => {
                    if (window.showToast) window.showToast("Backup shared successfully!", "success");
                }).catch((err) => {
                    if (err.name !== "AbortError") {
                        triggerBlobDownload(jsonStr, fileName);
                    }
                });
                return;
            }
        } catch (_) {}

        triggerBlobDownload(jsonStr, fileName);
        if (window.showToast) {
            window.showToast("Exported study progress & notes backup!", "success");
        }
    } catch (e) {
        console.error("Export progress failed:", e);
        if (window.showToast) window.showToast("Failed to export progress backup", "warn");
    }
}

function openProgressImportDialog() {
    const input = document.getElementById("progress-import-input");
    if (input) input.click();
}

async function handleProgressImportFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data || typeof data !== "object") {
            throw new Error("Invalid backup file format");
        }

        let importedCount = 0;

        if (Array.isArray(data.enrolledCourses)) {
            localStorage.setItem(ENROLLED_KEY, JSON.stringify(data.enrolledCourses));
            _memoEnrolled = data.enrolledCourses;
            importedCount++;
        }

        if (data.lectureProgress && typeof data.lectureProgress === "object") {
            localStorage.setItem(PROGRESS_KEY, JSON.stringify(data.lectureProgress));
            _memoProgress = data.lectureProgress;
            importedCount++;
        }

        if (data.lastWatched && typeof data.lastWatched === "object" && data.lastWatched.uid) {
            localStorage.setItem(LAST_WATCHED_KEY, JSON.stringify(data.lastWatched));
            _memoLastWatched = data.lastWatched;
            importedCount++;
        }

        if (data.teacherCamSize && typeof data.teacherCamSize === "string") {
            localStorage.setItem("teacher_cam_size", data.teacherCamSize);
        }

        // Restore study notes and bookmarks across all lectures
        if (data.notes && typeof data.notes === "object") {
            let noteCount = 0;
            for (const [uid, notesArr] of Object.entries(data.notes)) {
                if (Array.isArray(notesArr) && notesArr.length > 0) {
                    localStorage.setItem(`runcadel_notes_${uid}`, JSON.stringify(notesArr));
                    noteCount += notesArr.length;
                }
            }
            if (noteCount > 0) {
                importedCount++;
                console.log(`[BackupImport] Restored ${noteCount} bookmarks/notes.`);
                window.dispatchEvent(new CustomEvent('runcadel-notes-updated'));
            }
        }

        if (importedCount === 0) {
            throw new Error("Backup file contains no recognizable study progress, bookmarks, or course data.");
        }

        renderMyCourses();
        if (currentView === "course" && activeCourseId) {
            const course = findCourseById(activeCourseId);
            if (course) renderLecturesList(course.lectures);
        }

        if (window.showToast) {
            window.showToast("Study progress & notes restored successfully!", "success");
        }
    } catch (err) {
        console.error("Import progress failed:", err);
        alert("Failed to restore backup: " + (err.message || "Invalid JSON file"));
    } finally {
        event.target.value = "";
    }
}

// Trigger silent predictive caching after dashboard initial mount
setTimeout(prefetchPredictiveLectures, 1200);

// Initialize Routing History
initHistoryRouting();

// Export bindings
export { 
    switchView, 
    renderMyCourses, 
    renderSubjectGrid, 
    renderOfflineMode, 
    clearOfflineStorage, 
    renderCourseDetails, 
    renderLecturesList, 
    filterLectures, 
    launchLecture, 
    goBackToCourse,
    handleBackNavigation,
    toggleEnrollCourse, 
    toggleNavMenu, 
    switchNavView, 
    saveLastWatched, 
    getLastWatched, 
    getLectureProgress, 
    saveLectureProgress, 
    launchCourseContinue, 
    refreshCachedUidsSet, 
    addLocalCourse, 
    findCourseById, 
    LOCAL_COURSES, 
    prefetchPredictiveLectures, 
    parseDurationToSeconds, 
    getCourseCompletionStats,
    exportStudyProgress,
    openProgressImportDialog,
    handleProgressImportFile,
    resetCurrentCourseProgress,
    toggleLectureSelection,
    selectedLectureUids,
    downloadSelectedLectures
};

window.switchView = switchView;
window.handleBackNavigation = handleBackNavigation;
window.renderMyCourses = renderMyCourses;
window.renderSubjectGrid = renderSubjectGrid;
window.renderOfflineMode = renderOfflineMode;
window.clearOfflineStorage = clearOfflineStorage;
window.renderCourseDetails = renderCourseDetails;
window.renderLecturesList = renderLecturesList;
window.filterLectures = filterLectures;
window.launchLecture = launchLecture;
window.goBackToCourse = goBackToCourse;
window.toggleEnrollCourse = toggleEnrollCourse;
window.toggleNavMenu = toggleNavMenu;
window.switchNavView = switchNavView;
window.launchCourseContinue = launchCourseContinue;
window.getLastWatched = getLastWatched;
window.getLectureProgress = getLectureProgress;
window.saveLectureProgress = saveLectureProgress;
window.addLocalCourse = addLocalCourse;
window.findCourseById = findCourseById;
window.LOCAL_COURSES = LOCAL_COURSES;
window.openLocalFolderPicker = () => {
    const input = document.getElementById("local-folder-input");
    if (input) input.click();
};
window.exportStudyProgress = exportStudyProgress;
window.openProgressImportDialog = openProgressImportDialog;
window.handleProgressImportFile = handleProgressImportFile;
window.resetCurrentCourseProgress = resetCurrentCourseProgress;
window.toggleLectureSelection = toggleLectureSelection;
window.selectedLectureUids = selectedLectureUids;
window.downloadSelectedLectures = downloadSelectedLectures;

