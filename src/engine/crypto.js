// XOR Decryption & Telemetry Payload Parsing Engine with GZIP / Deflate Decompression
'use strict';

const SECRET_KEY = '9ffdc791579b19df35315e4d81a4aacda41d4c1ddaa318a4cba133111e20540e';

function decryptBytesToUint8(bufferOrArray, secretKey = SECRET_KEY) {
    const srcBytes = bufferOrArray instanceof Uint8Array ? bufferOrArray : new Uint8Array(bufferOrArray);
    const bytes = new Uint8Array(srcBytes.length);
    const keyBytes = new TextEncoder().encode(secretKey);
    const keyLen = keyBytes.length;
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = srcBytes[i] ^ keyBytes[i % keyLen];
    }
    return bytes;
}

function decryptBytes(bufferOrArray, secretKey = SECRET_KEY) {
    const bytes = decryptBytesToUint8(bufferOrArray, secretKey);
    return new TextDecoder("utf-8").decode(bytes);
}

async function tryDecryptAndParse(arrayBuffer, sourceName) {
    const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
    
    // 1. Check for standard GZIP magic bytes (0x1f, 0x8b)
    if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
        try {
            console.log("[Engine] Detected GZIP compressed telemetry stream. Decompressing...");
            if (typeof DecompressionStream !== "undefined") {
                const stream = new Response(arrayBuffer).body.pipeThrough(new DecompressionStream("gzip"));
                const decompressedText = await new Response(stream).text();
                return JSON.parse(decompressedText);
            }
        } catch (gzErr) {
            console.warn("[Engine] GZIP decompression failed:", gzErr);
        }
    }

    // 2. Check for Zlib/Deflate stream (0x78)
    if (bytes.length > 2 && bytes[0] === 0x78) {
        try {
            console.log("[Engine] Detected Deflate stream. Decompressing...");
            if (typeof DecompressionStream !== "undefined") {
                const stream = new Response(arrayBuffer).body.pipeThrough(new DecompressionStream("deflate"));
                const decompressedText = await new Response(stream).text();
                return JSON.parse(decompressedText);
            }
        } catch (defErr) {
            console.warn("[Engine] Deflate decompression failed:", defErr);
        }
    }

    // 3. Try plain UTF-8 JSON text
    try {
        const plainText = new TextDecoder("utf-8").decode(arrayBuffer);
        const rawData = JSON.parse(plainText);
        console.log("[Engine] Parsed plain JSON successfully.");
        return rawData;
    } catch (plainErr) {
        console.log("[Engine] Plain JSON check passed to decryption pipeline...");
    }

    // 4. Try XOR Decryption
    try {
        const decryptedBytes = decryptBytesToUint8(arrayBuffer, SECRET_KEY);
        
        // 4a. Check if decrypted stream is GZIP
        if (decryptedBytes.length > 2 && decryptedBytes[0] === 0x1f && decryptedBytes[1] === 0x8b) {
            if (typeof DecompressionStream !== "undefined") {
                const stream = new Response(decryptedBytes).body.pipeThrough(new DecompressionStream("gzip"));
                const decompressedText = await new Response(stream).text();
                return JSON.parse(decompressedText);
            }
        }
        
        // 4b. Plain UTF-8 JSON from decrypted bytes
        const decryptedText = new TextDecoder("utf-8").decode(decryptedBytes);
        const rawData = JSON.parse(decryptedText);
        console.log("[Engine] Decrypted encrypted XOR stream successfully.");
        return rawData;
    } catch (err) {
        console.warn("[Engine] XOR decryption attempt failed:", err);
    }

    // 5. Fallback: try raw text with global parser if available
    try {
        const plainText = new TextDecoder("utf-8").decode(arrayBuffer);
        if (typeof window !== "undefined" && window.Parser && typeof window.Parser.parseJSON === "function") {
            return window.Parser.parseJSON(plainText, { source: sourceName });
        }
    } catch (e) { }

    throw new Error("Unable to parse, decompress, or decrypt telemetry payload.");
}

export { SECRET_KEY, decryptBytes, decryptBytesToUint8, tryDecryptAndParse };
