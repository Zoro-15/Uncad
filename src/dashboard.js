// Dashboard views and routing module
import { COURSES } from './courses.js';

// Routing Views
        let currentView = "home";

        function switchView(viewName, params = {}) {
            currentView = viewName;
            const dbShell = document.getElementById("dashboard-shell");
            const appEl = document.getElementById("app");
            const backBtn = document.getElementById("player-back-btn");
            const toggleBtn = document.getElementById("panel-toggle");
            const vc = document.getElementById("video-circle");

            if (viewName === "player") {
                if (dbShell) dbShell.classList.remove("active");
                if (appEl) appEl.style.display = "flex";
                if (backBtn) backBtn.style.display = "flex";
                if (vc) vc.style.display = "block";
                if (toggleBtn) toggleBtn.style.display = "flex";
                resizeCanvas();
                
                // Force camera re-docking to upper right corner
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
                
                if (video) video.pause();

                const viewHome = document.getElementById("view-homepage");
                const viewDetails = document.getElementById("view-course-details");
                
                if (viewName === "home") {
                    if (viewHome) viewHome.classList.add("active");
                    if (viewDetails) viewDetails.classList.remove("active");
                    renderDashboardHome();
                } else if (viewName === "course") {
                    if (viewHome) viewHome.classList.remove("active");
                    if (viewDetails) viewDetails.classList.add("active");
                    if (params.courseId) {
                        activeCourseId = params.courseId;
                        renderCourseDetails(params.courseId);
                    }
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
                    if (onlyNum) {
                        minutes = parseInt(onlyNum[1], 10);
                    }
                }
                totalMinutes += hours * 60 + minutes;
            });

            const hrs = Math.floor(totalMinutes / 60);
            const mins = totalMinutes % 60;

            let durationText = "";
            if (hrs > 0) {
                durationText += `${hrs}h`;
            }
            if (mins > 0) {
                if (hrs > 0) durationText += " ";
                durationText += `${mins}m`;
            }
            if (!durationText) durationText = "0m";

            return `${totalLectures} Lectures • ${durationText}`;
        }

        function renderDashboardHome() {
            const grid = document.getElementById("course-list-grid");
            if (!grid) return;
            grid.innerHTML = "";
            COURSES.forEach(course => {
                const card = document.createElement("div");
                card.className = "course-card";
                card.onclick = () => switchView("course", { courseId: course.id });
                card.innerHTML = `
                    <div class="course-card-badge">${getCourseStatsText(course)}</div>
                    <div class="course-card-icon-wrap">
                        <i class="fas ${course.icon}"></i>
                    </div>
                    <h3 class="course-card-title">${course.title}</h3>
                    <div style="font-size: 11px; font-weight:700; color:var(--accent); text-transform:uppercase; margin-top:-10px;">${course.subtitle}</div>
                    <p class="course-card-desc">${course.description}</p>
                    <div class="course-card-btn">Explore Course</div>
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
                    <div class="course-subtitle-main">${course.subtitle}</div>
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

            if (lectures.length === 0) {
                listContainer.innerHTML = `<div style="text-align:center; padding:40px; color:#71717a; font-size:14px;"><i class="fas fa-search" style="font-size:24px; margin-bottom:10px; display:block;"></i>No matching lectures found.</div>`;
                return;
            }

            lectures.forEach(lec => {
                const card = document.createElement("div");
                card.className = "lecture-card";
                card.onclick = () => launchLecture(lec.uid);
                card.innerHTML = `
                    <div class="lecture-card-left">
                        <div class="lecture-number">${lec.rank}</div>
                        <div>
                            <div class="lecture-card-title">${lec.title}</div>
                            <div class="lecture-card-duration"><i class="far fa-clock"></i> ${lec.duration || '--'}</div>
                        </div>
                    </div>
                    <div class="lecture-card-play-btn">
                        <i class="fas fa-play"></i>
                    </div>
                `;
                listContainer.appendChild(card);
            });
        }

        function filterLectures() {
            const query = document.getElementById("lecture-search-input").value.toLowerCase().trim();
            const course = COURSES.find(c => c.id === activeCourseId);
            if (!course) return;

            const filtered = course.lectures.filter(l => 
                l.title.toLowerCase().includes(query) || 
                l.rank.toString().includes(query) ||
                l.uid.toLowerCase().includes(query)
            );
            renderLecturesList(filtered);
        }

        async function launchLecture(uid) {
            const sp = document.getElementById("splash");
            if (sp) {
                sp.style.display = "flex";
                sp.classList.remove("hidden");
            }
            switchView("player");
            activeUid = uid;
            const success = await loadLectureByUid(uid);
            if (success) {
                if (sp) {
                    sp.classList.add("hidden");
                    setTimeout(() => { sp.style.display = "none"; }, 700);
                }
            }
        }

        function goBackToCourse() {
            switchView("course", { courseId: activeCourseId });
        }

// Export bindings
export { switchView, renderDashboardHome, renderCourseDetails, renderLecturesList, filterLectures, launchLecture, goBackToCourse };
window.switchView = switchView;
window.renderDashboardHome = renderDashboardHome;
window.renderCourseDetails = renderCourseDetails;
window.renderLecturesList = renderLecturesList;
window.filterLectures = filterLectures;
window.launchLecture = launchLecture;
window.goBackToCourse = goBackToCourse;
