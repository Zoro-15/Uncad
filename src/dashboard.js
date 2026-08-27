// Dashboard views, routing, offline manager, and predictive caching module
import { COURSES } from './courses.js';
import { loadLectureByUid } from './player.js';
import { getAllCachedUids, clearAllOfflineTelemetry, saveTelemetryOffline } from './engine/offlineStorage.js';

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

function saveLectureProgress(uid, timeSec) {
    if (!uid || timeSec <= 0) return;
    try {
        let map = {};
        const stored = localStorage.getItem(PROGRESS_KEY);
        if (stored) map = JSON.parse(stored);
        map[uid] = {
            timeSec: Math.floor(timeSec),
            updatedAt: Date.now()
        };
        _memoProgress = map;
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
    } catch (e) {}
}

function saveLastWatched(uid, courseId, timeSec = 0) {
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
        saveLectureProgress(uid, timeSec);
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
                switchView("my-courses", {}, true);
            } else {
                switchView("my-courses", {}, true);
            }
        }
    });
}

function switchView(viewName, params = {}, skipPush = false) {
    currentView = viewName;

    if (!skipPush) {
        history.pushState({ view: viewName, params }, '', '#' + viewName);
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
    const navMap = {
        "my-courses": document.getElementById("nav-item-my-courses"),
        "math": document.getElementById("nav-item-math"),
        "mathematics": document.getElementById("nav-item-math"),
        "physics": document.getElementById("nav-item-physics"),
        "chemistry": document.getElementById("nav-item-chemistry"),
        "mentorship": document.getElementById("nav-item-mentorship"),
        "crash-course": document.getElementById("nav-item-mentorship"),
        "modules": document.getElementById("nav-item-mentorship"),
        "phy-os": document.getElementById("nav-item-phy-os"),
        "phyos": document.getElementById("nav-item-phy-os"),
        "offline-mode": document.getElementById("nav-item-offline-mode")
    };
    const navDrawer = document.getElementById("db-nav-drawer");
    if (navDrawer) navDrawer.classList.remove("show");
    
    Object.keys(navMap).forEach(key => {
        if (navMap[key]) {
            if (key === target) navMap[key].classList.add("active");
            else navMap[key].classList.remove("active");
        }
    });

    switchView(target);
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
                    <button class="last-watched-btn" onclick="launchLecture('${lastWatched.uid}', ${lastWatched.timeSec || 0})">
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
        const card = document.createElement("div");
        card.className = "course-card";
        card.onclick = () => switchView("course", { courseId: course.id });

        card.innerHTML = `
            <div class="course-card-left">
                <h3 class="course-card-title">${course.title}</h3>
                <p class="course-card-desc">${course.description}</p>
            </div>
            <div class="course-card-right-col">
                <div class="course-card-badge">${getCourseStatsText(course)}</div>
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
        const card = document.createElement("div");
        card.className = "course-card";
        card.onclick = () => switchView("course", { courseId: course.id });

        card.innerHTML = `
            <div class="course-card-left">
                <h3 class="course-card-title">${course.title}</h3>
                <p class="course-card-desc">${course.description}</p>
            </div>
            <div class="course-card-right-col">
                <div class="course-card-badge">${getCourseStatsText(course)}</div>
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

    const header = document.getElementById("course-header-details");
    if (header) {
        header.innerHTML = `
            <h1 class="course-title-main">${course.title}</h1>
            <p class="course-desc-main">${course.description}</p>
        `;
    }

    const countChip = document.getElementById("lecture-count-chip");
    if (countChip) countChip.textContent = getCourseStatsText(course);

    const searchInput = document.getElementById("lecture-search-input");
    if (searchInput) searchInput.value = "";

    renderLecturesList(course.lectures);
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
        const card = document.createElement("div");
        card.className = "lecture-card";
        card.onclick = () => launchLecture(lec.uid);
        card.innerHTML = `
            <div class="lecture-card-left">
                <div class="lecture-number">${lec.rank}</div>
                <div>
                    <div class="lecture-card-title">${lec.title}</div>
                    <div class="lecture-card-duration">
                        <i class="far fa-clock"></i> ${lec.duration || '--'}
                        ${isLocal ? `<span class="offline-badge" style="background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid rgba(34,197,94,0.3);" title="Loaded from Local Folder"><i class="fas fa-folder-open"></i> Local Ready</span>` : (isOffline ? `<span class="offline-badge" title="Cached in IndexedDB for Offline Learning"><i class="fas fa-bolt"></i> Offline Ready</span>` : '')}
                        ${lec.pdfFile ? `<span class="offline-badge" style="background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid rgba(239,68,68,0.25);" title="PDF Notes Attached"><i class="fas fa-file-pdf"></i> Notes</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="lecture-card-play-btn">
                <i class="fas fa-play"></i>
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

async function launchLecture(uid, startTimeSec = null) {
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
    const success = await loadLectureByUid(uid, targetTime);
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
    switchView("course", { courseId: activeCourseId });
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
    prefetchPredictiveLectures
};

window.switchView = switchView;
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
