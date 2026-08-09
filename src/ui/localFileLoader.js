// Drag & Drop Local File Loader for Offline Recordings

let onLocalFileLoaded = null;

function initLocalFileLoader(callback) {
    onLocalFileLoaded = callback;
    const dropZone = document.getElementById("local-drop-zone");
    if (!dropZone) return;

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

        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;

        let videoFile = files.find(f => f.name.endsWith(".webm") || f.name.endsWith(".mp4"));
        let jsonFile = files.find(f => f.name.endsWith(".json"));

        if (!videoFile || !jsonFile) {
            alert("Please drop both a video file (.webm) and a telemetry file (.json) together.");
            return;
        }

        try {
            const videoUrl = URL.createObjectURL(videoFile);
            const jsonText = await jsonFile.text();
            const rawData = JSON.parse(jsonText);

            if (onLocalFileLoaded) {
                onLocalFileLoaded(videoUrl, rawData, videoFile.name);
            }
        } catch (err) {
            console.error("[LocalLoader] Drop processing failed:", err);
            alert("Failed to parse dropped local files. Make sure the JSON is valid telemetry data.");
        }
    });
}

export { initLocalFileLoader };
