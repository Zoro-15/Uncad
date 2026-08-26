// Dashboard views, routing, and user course enrollment module
import { COURSES } from './courses.js';
import { loadLectureByUid } from './player.js';
import { getAllCachedUids } from './engine/offlineStorage.js';

let currentView = "my-courses";
let activeCourseId = "LPN7OFOL";
let activeUid = "";

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
        const course = COURSES.find(c => c.id === activeCourseId);
        if (course) renderLecturesList(course.lectures);
    }
});

window.addEventListener('lennister-offline-cleared', () => {
    cachedUidsSet.clear();
    if (currentView === "course" && activeCourseId) {
        const course = COURSES.find(c => c.id === activeCourseId);
        if (course) renderLecturesList(course.lectures);
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
    renderAllCourses();
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
    if (!uid || typeof timeSec !== 'number') return;
    try {
        let map = _memoProgress || {};
        if (!_memoProgress) {
            const stored = localStorage.getItem(PROGRESS_KEY);
            if (stored) map = JSON.parse(stored);
        }
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
    const course = COURSES.find(c => c.id === courseId || c.lectures.some(l => l.uid === uid));
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
            if (window.positionCamDocked) window.positionCamDocked();
        }, 50);
        setTimeout(() => {
            if (window.positionCamDocked) window.positionCamDocked();
        }, 350);
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
        const viewAllCourses = document.getElementById("view-all-courses");
        const viewDetails = document.getElementById("view-course-details");
        const dbLogo = document.getElementById("db-logo");
        const dbHeaderBackBtn = document.getElementById("db-header-back-btn");
        const dbHeaderRight = document.getElementById("db-header-right");
        
        // Hide all sub-views first
        if (viewMyCourses) viewMyCourses.classList.remove("active");
        if (viewAllCourses) viewAllCourses.classList.remove("active");
        if (viewDetails) viewDetails.classList.remove("active");

        if (viewName === "my-courses" || viewName === "home") {
            if (viewMyCourses) viewMyCourses.classList.add("active");
            if (dbLogo) dbLogo.style.display = "flex";
            if (dbHeaderBackBtn) dbHeaderBackBtn.style.display = "none";
            if (dbHeaderRight) dbHeaderRight.style.display = "block";
            renderMyCourses();
        } else if (viewName === "all-courses") {
            if (viewAllCourses) viewAllCourses.classList.add("active");
            if (dbLogo) dbLogo.style.display = "flex";
            if (dbHeaderBackBtn) dbHeaderBackBtn.style.display = "none";
            if (dbHeaderRight) dbHeaderRight.style.display = "block";
            renderAllCourses();
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
    const navItemMy = document.getElementById("nav-item-my-courses");
    const navItemAll = document.getElementById("nav-item-all-courses");
    const navItemOffline = document.getElementById("nav-item-offline-mode");
    const navDrawer = document.getElementById("db-nav-drawer");
    if (navDrawer) navDrawer.classList.remove("show");
    
    if (target === "my-courses") {
        if (navItemMy) navItemMy.classList.add("active");
        if (navItemAll) navItemAll.classList.remove("active");
        if (navItemOffline) navItemOffline.classList.remove("active");
        switchView("my-courses");
    } else if (target === "all-courses") {
        if (navItemMy) navItemMy.classList.remove("active");
        if (navItemAll) navItemAll.classList.add("active");
        if (navItemOffline) navItemOffline.classList.remove("active");
        switchView("all-courses");
    } else if (target === "offline-mode") {
        if (window.openLocalFolderPicker) {
            window.openLocalFolderPicker();
        }
    }
}

function getCourseStatsText(course) {
    const totalLectures = course.lectures.length;
    let totalMinutes = 0;
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

    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    let durationText = "";
    if (hrs > 0) durationText += `${hrs}h`;
    if (mins > 0) {
        if (hrs > 0) durationText += " ";
        durationText += `${mins}m`;
    }
    if (!durationText) durationText = "0m";

    return `${totalLectures} Lectures • ${durationText}`;
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
    const enrolledCourses = COURSES.filter(c => enrolledIds.includes(c.id));

    if (enrolledCourses.length === 0) {
        grid.innerHTML = `
            <div class="empty-courses-state">
                <i class="fas fa-folder-open"></i>
                <p>No courses added to your list yet.</p>
                <button class="explore-nav-btn" onclick="switchNavView('all-courses')">Explore All Courses</button>
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
                <div class="course-card-icon-wrap">
                    <i class="fas ${course.icon}"></i>
                </div>
                <h3 class="course-card-title">${course.title}</h3>
                <p class="course-card-desc">${course.description}</p>
            </div>
            <div class="course-card-right-col">
                <div class="course-card-badge">${getCourseStatsText(course)}</div>
                <div class="course-btn-group">
                    <button class="course-continue-btn" title="Continue watching" onclick="event.stopPropagation(); launchCourseContinue('${course.id}')">
                        <i class="fas fa-play" style="font-size:10px;"></i> Continue
                    </button>
                    <button class="course-card-btn">Explore Course</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function launchCourseContinue(courseId) {
    const course = COURSES.find(c => c.id === courseId);
    if (!course || !course.lectures || course.lectures.length === 0) return;

    const lastWatched = getLastWatched();
    if (lastWatched && lastWatched.courseId === courseId && lastWatched.uid) {
        launchLecture(lastWatched.uid, lastWatched.timeSec || 0);
    } else {
        launchLecture(course.lectures[0].uid, 0);
    }
}

// ══════════════════════════════════════════════════
// ALL COURSES CATALOG RENDERER
// ══════════════════════════════════════════════════
function renderAllCourses() {
    const grid = document.getElementById("all-courses-grid");
    if (!grid) return;
    grid.innerHTML = "";

    COURSES.forEach(course => {
        const enrolled = isCourseEnrolled(course.id);
        const card = document.createElement("div");
        card.className = "course-card";
        card.onclick = () => switchView("course", { courseId: course.id });
        card.innerHTML = `
            <div class="course-card-left">
                <div class="course-card-icon-wrap">
                    <i class="fas ${course.icon}"></i>
                </div>
                <h3 class="course-card-title">${course.title}</h3>
                <p class="course-card-desc">${course.description}</p>
            </div>
            <div class="course-card-right-col">
                <div class="course-card-badge">${getCourseStatsText(course)}</div>
                <div class="course-btn-group">
                    <button class="course-add-btn ${enrolled ? 'added' : ''}" title="${enrolled ? 'Remove from My Courses' : 'Add to My Courses'}" onclick="toggleEnrollCourse('${course.id}', event)">
                        <i class="fas ${enrolled ? 'fa-check' : 'fa-plus'}"></i> ${enrolled ? 'Added' : 'Add'}
                    </button>
                    <button class="course-card-btn">Explore Course</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderCourseDetails(courseId) {
    const course = COURSES.find(c => c.id === courseId);
    if (!course) return;

    const header = document.getElementById("course-header-details");
    if (header) {
        header.innerHTML = `
            <h1 class="course-title-main">${course.title}</h1>
            <p class="course-desc-main">${course.description}</p>
        `;
    }

    const countChip = document.getElementById("lecture-count-chip");
    if (countChip) countChip.textContent = `${course.lectures.length} Lectures`;

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

function filterLectures() {
    const searchInput = document.getElementById("lecture-search-input");
    const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const course = COURSES.find(c => c.id === activeCourseId);
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
}

async function launchLecture(uid, startTimeSec = null) {
    const sp = document.getElementById("splash");
    if (sp) {
        sp.style.display = "flex";
        sp.classList.remove("hidden");
    }
    switchView("player");
    const course = COURSES.find(c => c.id === activeCourseId || (c.lectures && c.lectures.some(l => l.uid === uid)));
    if (course && course.isLocal) {
        const lec = course.lectures.find(l => l.uid === uid);
        if (lec && window.loadLocalLecture) {
            await window.loadLocalLecture(lec, course);
            if (sp) {
                sp.classList.add("hidden");
                sp.style.display = "none";
            }
            return;
        }
    }

    // Determine target start time:
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

// Initialize Routing History
initHistoryRouting();

// Export bindings
export { 
    switchView, 
    renderMyCourses, 
    renderAllCourses, 
    renderCourseDetails, 
    renderLecturesList, 
    filterLectures, 
    launchLecture, 
    goBackToCourse,
    toggleEnrollCourse,
    toggleNavMenu,
    switchNavView,
    saveLastWatched,
    launchCourseContinue,
    refreshCachedUidsSet
};

window.switchView = switchView;
window.renderMyCourses = renderMyCourses;
window.renderAllCourses = renderAllCourses;
window.renderCourseDetails = renderCourseDetails;
window.renderLecturesList = renderLecturesList;
window.filterLectures = filterLectures;
window.launchLecture = launchLecture;
window.goBackToCourse = goBackToCourse;
window.toggleEnrollCourse = toggleEnrollCourse;
window.toggleNavMenu = toggleNavMenu;
window.switchNavView = switchNavView;
window.launchCourseContinue = launchCourseContinue;
