// Telemetry Deobfuscation and Chronological Vector Parsing Engine
import { tryDecryptAndParse } from './crypto.js';

/**
 * Parses raw JSON payload or buffer, decrypts XOR cipher, and organizes chronological event timelines
 * @param {ArrayBuffer | string | object} rawPayload
 * @returns {Object} { slideList, allEvents, strokesBySid, eventsBySid }
 */
function parseTelemetryData(rawPayload) {
    let data = rawPayload;
    if (typeof rawPayload === 'string' || rawPayload instanceof ArrayBuffer) {
        data = tryDecryptAndParse(rawPayload);
    }

    if (!data) {
        throw new Error("Invalid or undecryptable telemetry payload");
    }

    const slideList = [];
    const allEvents = [];
    const strokesBySid = new Map();
    const eventsBySid = new Map();

    // Standardize event structures
    const rawEvents = Array.isArray(data) ? data : (data.events || data.timeline || []);

    rawEvents.forEach(evt => {
        const timeUs = evt.p_time || evt.t || 0;
        const sid = evt.c_id || evt.sid || "init";
        const plugin = evt.plugin || evt.code || "";

        allEvents.push({ ...evt, timestampUs: timeUs, sid, plugin });

        if (!eventsBySid.has(sid)) {
            eventsBySid.set(sid, []);
        }
        eventsBySid.get(sid).push(evt);

        // Slide change tracking
        if (plugin === "sc" || plugin === "009A") {
            slideList.push({
                timestampUs: timeUs,
                sid: sid,
                title: evt.title || `Slide ${slideList.length + 1}`
            });
        }
    });

    // Ensure slides are sorted chronologically
    slideList.sort((a, b) => a.timestampUs - b.timestampUs);

    return {
        raw: data,
        slideList,
        allEvents,
        eventsBySid,
        strokesBySid
    };
}

export { parseTelemetryData };
