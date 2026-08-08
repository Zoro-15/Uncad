// XOR Decryption & Telemetry Payload Parsing Engine
'use strict';

const SECRET_KEY = '9ffdc791579b19df35315e4d81a4aacda41d4c1ddaa318a4cba133111e20540e';

function decryptBytes(bufferOrArray, secretKey = SECRET_KEY) {
    const srcBytes = bufferOrArray instanceof Uint8Array ? bufferOrArray : new Uint8Array(bufferOrArray);
    const bytes = new Uint8Array(srcBytes.length);
    bytes.set(srcBytes);
    const keyBytes = new TextEncoder().encode(secretKey);
    const keyLen = keyBytes.length;
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] ^= keyBytes[i % keyLen];
    }
    return new TextDecoder("utf-8").decode(bytes);
}

function tryDecryptAndParse(arrayBuffer, sourceName) {
    let rawData;
    try {
        const plainText = new TextDecoder("utf-8").decode(arrayBuffer);
        rawData = JSON.parse(plainText);
        console.log("[Engine] Parsed plain JSON successfully.");
        return rawData;
    } catch (plainErr) {
        console.warn("[Engine] Plain JSON failed, attempting XOR decryption...");
    }

    try {
        const decryptedText = decryptBytes(arrayBuffer, SECRET_KEY);
        rawData = JSON.parse(decryptedText);
        console.log("[Engine] Decrypted encrypted stream successfully.");
        return rawData;
    } catch (err) {
        console.warn("[Engine] Direct decryption failed. Trying robust parser...");
        try {
            const plainText = new TextDecoder("utf-8").decode(arrayBuffer);
            if (window.Parser && typeof window.Parser.parseJSON === "function") {
                return window.Parser.parseJSON(plainText, { source: sourceName });
            }
        } catch (e) { }
        throw err;
    }
}

export { SECRET_KEY, decryptBytes, tryDecryptAndParse };
