"use strict";

// Pure logic for the Sounds view (1.8.0): reading and writing WAV files,
// measuring loudness the way the startup sounds were leveled (RMS and peak
// over every sample, in dBFS), planning a gain to reach a reference level
// without clipping, and searching the library. Nothing here touches the page.
(function (global) {
    const FORMAT_PCM = 1;
    const FORMAT_FLOAT = 3;
    const FORMAT_EXTENSIBLE = 0xFFFE;

    const text4 = (view, offset) => String.fromCharCode(
        view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));

    // RIFF/WAVE: the fmt and data chunks. Returns null for anything else, or
    // for encodings other than integer PCM (8/16/24/32-bit) and 32-bit float.
    function parseWav(buffer) {
        if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 44) return null;
        const view = new DataView(buffer);
        if (text4(view, 0) !== "RIFF" || text4(view, 8) !== "WAVE") return null;
        let offset = 12, fmt = null, data = null;
        while (offset + 8 <= buffer.byteLength) {
            const id = text4(view, offset);
            const size = view.getUint32(offset + 4, true);
            const body = offset + 8;
            if (id === "fmt " && size >= 16 && body + 16 <= buffer.byteLength) {
                let format = view.getUint16(body, true);
                const bits = view.getUint16(body + 14, true);
                if (format === FORMAT_EXTENSIBLE && size >= 40 && body + 26 <= buffer.byteLength) format = view.getUint16(body + 24, true);
                fmt = { format, channels: view.getUint16(body + 2, true), sampleRate: view.getUint32(body + 4, true),
                    blockAlign: view.getUint16(body + 12, true), bits };
            } else if (id === "data") {
                data = { offset: body, length: Math.min(size, buffer.byteLength - body) };
            }
            if (fmt && data) break;
            offset = body + size + (size % 2);
        }
        if (!fmt || !data || !fmt.channels || !fmt.sampleRate) return null;
        const supported = (fmt.format === FORMAT_PCM && [8, 16, 24, 32].includes(fmt.bits))
            || (fmt.format === FORMAT_FLOAT && fmt.bits === 32);
        if (!supported) return null;
        const bytes = fmt.bits / 8;
        const frames = Math.floor(data.length / (bytes * fmt.channels));
        return { ...fmt, dataOffset: data.offset, dataLength: frames * bytes * fmt.channels,
            frames, seconds: frames / fmt.sampleRate };
    }

    // Reads or writes sample i of the data chunk as a number from -1 to 1.
    function sampleIO(view, info) {
        const bytes = info.bits / 8;
        const at = i => info.dataOffset + i * bytes;
        if (info.format === FORMAT_FLOAT) {
            return { read: i => view.getFloat32(at(i), true), write: (i, v) => view.setFloat32(at(i), Math.max(-1, Math.min(1, v)), true) };
        }
        switch (info.bits) {
            case 8:   // unsigned
                return { read: i => (view.getUint8(at(i)) - 128) / 128,
                    write: (i, v) => view.setUint8(at(i), Math.max(0, Math.min(255, Math.round(v * 128 + 128)))) };
            case 16:
                return { read: i => view.getInt16(at(i), true) / 32768,
                    write: (i, v) => view.setInt16(at(i), Math.max(-32768, Math.min(32767, Math.round(v * 32768))), true) };
            case 24:
                return {
                    read: i => {
                        const o = at(i);
                        let value = view.getUint8(o) | (view.getUint8(o + 1) << 8) | (view.getUint8(o + 2) << 16);
                        if (value & 0x800000) value -= 0x1000000;
                        return value / 8388608;
                    },
                    write: (i, v) => {
                        let value = Math.max(-8388608, Math.min(8388607, Math.round(v * 8388608)));
                        if (value < 0) value += 0x1000000;
                        const o = at(i);
                        view.setUint8(o, value & 0xFF);
                        view.setUint8(o + 1, (value >> 8) & 0xFF);
                        view.setUint8(o + 2, (value >> 16) & 0xFF);
                    }
                };
            default:  // 32-bit integer
                return { read: i => view.getInt32(at(i), true) / 2147483648,
                    write: (i, v) => view.setInt32(at(i), Math.max(-2147483648, Math.min(2147483647, Math.round(v * 2147483648))), true) };
        }
    }

    const toDb = linear => linear > 0 ? 20 * Math.log10(linear) : -Infinity;
    const fromDb = db => Math.pow(10, db / 20);

    // RMS and peak over every sample of every channel, in dBFS.
    function measureSamples(count, read) {
        let sum = 0, peak = 0;
        for (let i = 0; i < count; i++) {
            const value = read(i);
            sum += value * value;
            const magnitude = Math.abs(value);
            if (magnitude > peak) peak = magnitude;
        }
        return { rmsDb: count ? toDb(Math.sqrt(sum / count)) : -Infinity, peakDb: toDb(peak) };
    }

    function measureWav(buffer) {
        const info = parseWav(buffer);
        if (!info) return null;
        const io = sampleIO(new DataView(buffer), info);
        return { ...measureSamples(info.frames * info.channels, io.read), seconds: info.seconds };
    }

    // For formats the WAV reader doesn't handle, measure a decoded AudioBuffer.
    function measureChannels(channels) {
        const count = channels.reduce((sum, channel) => sum + channel.length, 0);
        let sum = 0, peak = 0;
        channels.forEach(channel => {
            for (let i = 0; i < channel.length; i++) {
                sum += channel[i] * channel[i];
                const magnitude = Math.abs(channel[i]);
                if (magnitude > peak) peak = magnitude;
            }
        });
        return { rmsDb: count ? toDb(Math.sqrt(sum / count)) : -Infinity, peakDb: toDb(peak) };
    }

    // ---- loudness as the ear hears it (ITU-R BS.1770, in LUFS)
    // RMS treats every frequency and every moment alike, so a short chime
    // with a silent tail measures quieter than it sounds. BS.1770 instead
    // weights the frequencies the ear is most sensitive to (the "K" filter:
    // a high shelf, then a high-pass), measures 400 ms blocks every 100 ms,
    // and leaves out silence (blocks below -70 LUFS, then blocks more than
    // 10 LU below the rest). Filter coefficients follow libebur128, so any
    // sample rate works. A sound shorter than one block is one block.
    function kWeighting(rate) {
        let K = Math.tan(Math.PI * 1681.974450955533 / rate);
        const Q1 = 0.7071752369554196;
        const Vh = Math.pow(10, 3.999843853973347 / 20);
        const Vb = Math.pow(Vh, 0.4996667741545416);
        let a0 = 1 + K / Q1 + K * K;
        const shelf = { b0: (Vh + Vb * K / Q1 + K * K) / a0, b1: 2 * (K * K - Vh) / a0, b2: (Vh - Vb * K / Q1 + K * K) / a0,
            a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q1 + K * K) / a0 };
        K = Math.tan(Math.PI * 38.13547087602444 / rate);
        const Q2 = 0.5003270373238773;
        a0 = 1 + K / Q2 + K * K;
        const highPass = { b0: 1, b1: -2, b2: 1, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q2 + K * K) / a0 };
        return [shelf, highPass];
    }

    function measureLoudness(channels, rate) {
        if (!channels.length || !rate) return -Infinity;
        const length = Math.min(...channels.map(c => c.length));
        if (!length) return -Infinity;
        const stages = kWeighting(rate);
        // Squared, K-weighted samples summed over channels (all weighted 1).
        const power = new Float64Array(length);
        channels.forEach(channel => {
            const state = stages.map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));
            for (let i = 0; i < length; i++) {
                let x = channel[i];
                for (let s = 0; s < stages.length; s++) {
                    const f = stages[s], z = state[s];
                    const y = f.b0 * x + f.b1 * z.x1 + f.b2 * z.x2 - f.a1 * z.y1 - f.a2 * z.y2;
                    z.x2 = z.x1; z.x1 = x; z.y2 = z.y1; z.y1 = y;
                    x = y;
                }
                power[i] += x * x;
            }
        });
        const block = Math.round(rate * 0.4), step = Math.round(rate * 0.1);
        const prefix = new Float64Array(length + 1);
        for (let i = 0; i < length; i++) prefix[i + 1] = prefix[i] + power[i];
        const blocks = [];
        if (length <= block) blocks.push(prefix[length] / length);
        else for (let start = 0; start + block <= length; start += step) blocks.push((prefix[start + block] - prefix[start]) / block);
        const lufs = z => -0.691 + 10 * Math.log10(z);
        const absolute = blocks.filter(z => z > 0 && lufs(z) > -70);
        if (!absolute.length) return -Infinity;
        const mean = list => list.reduce((sum, z) => sum + z, 0) / list.length;
        const threshold = lufs(mean(absolute)) - 10;
        const gated = absolute.filter(z => lufs(z) > threshold);
        return lufs(mean(gated.length ? gated : absolute));
    }

    // A WAV's channels as numbers from -1 to 1, for measureLoudness.
    function wavChannels(buffer) {
        const info = parseWav(buffer);
        if (!info) return null;
        const io = sampleIO(new DataView(buffer), info);
        const channels = Array.from({ length: info.channels }, () => new Float32Array(info.frames));
        for (let f = 0, i = 0; f < info.frames; f++) for (let c = 0; c < info.channels; c++, i++) channels[c][f] = io.read(i);
        return { channels, rate: info.sampleRate };
    }

    // Where a sound stands against the notification level: matched within
    // ±1.5 LU, or louder or quieter by how much, and the gain that would
    // match it, held back so the peak stays at or below the ceiling.
    function compareToTarget(measured, targetLufs, { tolerance = 1.5, ceilingDb = -0.3 } = {}) {
        if (!measured || !Number.isFinite(measured.lufs) || !Number.isFinite(targetLufs)) return null;
        const difference = measured.lufs - targetLufs;
        let gainDb = -difference, limited = false;
        if (Number.isFinite(measured.peakDb) && measured.peakDb + gainDb > ceilingDb) {
            gainDb = ceilingDb - measured.peakDb;
            limited = true;
        }
        return { difference, matched: Math.abs(difference) <= tolerance, gainDb, limited };
    }

    // Own levels (1.8.1): a sound in use can sit above or below its board's
    // level, by up to 12 dB in half-dB steps (the board's bar spans +-12 dB).
    const OWN_LEVEL_LIMIT = 12;
    function snapOwnLevel(value) {
        if (!Number.isFinite(value)) return 0;
        const snapped = Math.round(Math.max(-OWN_LEVEL_LIMIT, Math.min(OWN_LEVEL_LIMIT, value)) * 2) / 2;
        return snapped === 0 ? 0 : snapped;      // never -0
    }

    // Where on the bar (0 to 1 across it) an own level is, and back.
    const ownLevelAt = value => (snapOwnLevel(value) + OWN_LEVEL_LIMIT) / (2 * OWN_LEVEL_LIMIT);
    const ownLevelFromFraction = fraction => snapOwnLevel(fraction * 2 * OWN_LEVEL_LIMIT - OWN_LEVEL_LIMIT);

    // Reset levels (1.8.1): what differs from the defaults, as short phrases
    // for the confirmation. Sound files are never part of it.
    const LEVEL_DEFAULTS = Object.freeze({ notifyTarget: -24, startupTarget: -20, reference: -26.4 });
    function levelChanges(prefs) {
        const changes = [];
        const differs = (value, standard) => Number.isFinite(value) && Math.abs(value - standard) >= 0.05;
        if (differs(prefs?.notifyTarget, LEVEL_DEFAULTS.notifyTarget)) changes.push(`notification level ${prefs.notifyTarget.toFixed(1)} → ${LEVEL_DEFAULTS.notifyTarget.toFixed(1)}`);
        if (differs(prefs?.startupTarget, LEVEL_DEFAULTS.startupTarget)) changes.push(`startup level ${prefs.startupTarget.toFixed(1)} → ${LEVEL_DEFAULTS.startupTarget.toFixed(1)}`);
        if (differs(prefs?.reference, LEVEL_DEFAULTS.reference)) changes.push(`Target RMS ${prefs.reference.toFixed(1)} → ${LEVEL_DEFAULTS.reference.toFixed(1)}`);
        const own = Object.keys(prefs?.levels || {}).length;
        if (own) changes.push(`${own} own level${own === 1 ? "" : "s"} back to the board's`);
        return changes;
    }

    // Saved own levels, cleaned: up to 200 entries, short string keys, and
    // only non-zero levels (zero means the board's level).
    function cleanOwnLevels(saved) {
        const levels = {};
        if (!saved || typeof saved !== "object" || Array.isArray(saved)) return levels;
        Object.entries(saved).slice(0, 200).forEach(([key, value]) => {
            const level = snapOwnLevel(Number(value));
            if (typeof value === "number" && key.length <= 400 && level !== 0) levels[key] = level;
        });
        return levels;
    }

    // The gain to bring a sound's RMS to the reference. With avoidClipping,
    // the gain is capped so the peak stays at or below the ceiling (dBFS);
    // the result then falls short of the reference, and says so.
    function planLevel(measured, targetRmsDb, { avoidClipping = true, ceilingDb = -0.3 } = {}) {
        if (!measured || !Number.isFinite(measured.rmsDb) || !Number.isFinite(targetRmsDb)) return null;
        let gainDb = targetRmsDb - measured.rmsDb;
        let limited = false;
        if (avoidClipping && Number.isFinite(measured.peakDb) && measured.peakDb + gainDb > ceilingDb) {
            gainDb = ceilingDb - measured.peakDb;
            limited = true;
        }
        const resultPeakDb = measured.peakDb + gainDb;
        return { gainDb, limited, resultRmsDb: measured.rmsDb + gainDb, resultPeakDb,
            clips: resultPeakDb > 0 };
    }

    // A copy of the WAV with every sample scaled by gainDb (clamped at full
    // scale), in the same format; every other chunk is kept as it was.
    function applyGain(buffer, gainDb) {
        const info = parseWav(buffer);
        if (!info || !Number.isFinite(gainDb)) return null;
        const copy = buffer.slice(0);
        const io = sampleIO(new DataView(copy), info);
        const factor = fromDb(gainDb);
        const count = info.frames * info.channels;
        for (let i = 0; i < count; i++) io.write(i, io.read(i) * factor);
        return copy;
    }

    // Base64 for passing bytes to and from ASCS.
    function bytesToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(binary);
    }

    function base64ToBytes(text) {
        if (typeof text !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return null;
        const binary = atob(text);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
    }

    const formatDb = db => Number.isFinite(db) ? `${db > 0 ? "+" : db < 0 ? "−" : ""}${Math.abs(db).toFixed(1)} dB` : "silent";

    function formatSeconds(seconds) {
        if (!Number.isFinite(seconds) || seconds <= 0) return "";
        return seconds < 60 ? `${seconds.toFixed(seconds < 10 ? 1 : 0)} s` : `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
    }

    // Library search: every word must appear in the name, group or version.
    function filterSounds(sounds, query = "", favorites = null) {
        const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
        return sounds.filter(sound =>
            (!favorites || favorites.has(sound.id))
            && words.every(word => `${sound.name} ${sound.group} ${sound.eraLabel}`.toLocaleLowerCase().includes(word)));
    }

    // Groups a version's sounds by folder (sounds directly in it come first).
    function groupSounds(sounds) {
        const groups = new Map();
        sounds.forEach(sound => {
            if (!groups.has(sound.group)) groups.set(sound.group, []);
            groups.get(sound.group).push(sound);
        });
        return [...groups.entries()]
            .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
            .map(([group, items]) => ({ group, items: items.sort((x, y) => x.name.localeCompare(y.name)) }));
    }

    // The logo for a version, from its label ("Windows 98", "Windows 2000
    // (RTM)"): a file name in assets/windows, or "" for folders of your own.
    // NT 5.0 was Windows 2000 in beta, so it shares that logo. Order matters:
    // 10X before 10.
    const ERA_LOGOS = [
        [/\b3\.?x\b|\b3\.1\b/i, "win31"], [/\b95\b/, "win95"], [/\bNT 4/i, "winnt"], [/\bNT 5|\b2000\b/i, "win2000"],
        [/\b98\b/, "win98"], [/\bMe\b/, "winme"], [/\bXP\b/i, "winxp"], [/\bVista\b/i, "vista"], [/\bWindows 7\b/i, "win7"],
        [/\bWindows 8/i, "win8"], [/\b10X\b/i, "win10x"], [/\bWindows 10\b/i, "win10"], [/\bWindows 11\b/i, "win11"]
    ];
    function eraLogo(label) {
        const text = String(label || "");
        if (!/\bWindows\b/i.test(text)) return "";
        return ERA_LOGOS.find(([pattern]) => pattern.test(text))?.[1] || "";
    }

    // A leveled copy ASCS made: a WAV directly in the library's ASCS Leveled
    // folder (ids are relative to the library). Only these can be deleted;
    // ASCS checks the same again (IsLeveledCopyId).
    function isLeveledCopy(id) {
        return /^ASCS Leveled\\[^\\/:*?"<>|]+\.wav$/i.test(String(id));
    }

    // Shift + click in Select: the ids from one to the other, inclusive, in
    // the order shown. Just the clicked one when the first isn't shown.
    function rangeIds(order, fromId, toId) {
        const from = order.indexOf(fromId), to = order.indexOf(toId);
        if (to < 0) return [];
        if (from < 0) return [toId];
        return order.slice(Math.min(from, to), Math.max(from, to) + 1);
    }

    global.ASCSSounds = {
        parseWav, measureWav, measureChannels, planLevel, applyGain, toDb, fromDb,
        bytesToBase64, base64ToBytes, formatDb, formatSeconds, filterSounds, groupSounds, eraLogo,
        measureLoudness, wavChannels, compareToTarget, isLeveledCopy, rangeIds,
        snapOwnLevel, ownLevelAt, ownLevelFromFraction, cleanOwnLevels, levelChanges, LEVEL_DEFAULTS
    };
})(globalThis);
