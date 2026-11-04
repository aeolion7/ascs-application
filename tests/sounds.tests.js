"use strict";

(function () {
    const S = globalThis.ASCSSounds;
    const { check, equal } = globalThis.TestHarness;
    const near = (name, actual, expected, tolerance = 0.05) =>
        check(name, Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);

    // Builds a WAV from samples in -1..1 (interleaved), byte by byte.
    function makeWav(samples, { bits = 16, format = 1, channels = 1, rate = 8000, extensible = false, extraChunk = false } = {}) {
        const bytes = bits / 8;
        const fmtSize = extensible ? 40 : 16;
        const extra = extraChunk ? 8 + 4 : 0;
        const dataSize = samples.length * bytes;
        const buffer = new ArrayBuffer(12 + 8 + fmtSize + extra + 8 + dataSize);
        const view = new DataView(buffer);
        const put = (offset, text) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
        put(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); put(8, "WAVE");
        put(12, "fmt "); view.setUint32(16, fmtSize, true);
        view.setUint16(20, extensible ? 0xFFFE : format, true);
        view.setUint16(22, channels, true); view.setUint32(24, rate, true);
        view.setUint32(28, rate * channels * bytes, true); view.setUint16(32, channels * bytes, true); view.setUint16(34, bits, true);
        if (extensible) { view.setUint16(36, 22, true); view.setUint16(38, bits, true); view.setUint32(40, 0, true); view.setUint16(44, format, true); }
        let offset = 20 + fmtSize;
        if (extraChunk) { put(offset, "LIST"); view.setUint32(offset + 4, 4, true); put(offset + 8, "INFO"); offset += 12; }
        put(offset, "data"); view.setUint32(offset + 4, dataSize, true);
        offset += 8;
        samples.forEach((v, i) => {
            const o = offset + i * bytes;
            if (format === 3) view.setFloat32(o, v, true);
            else if (bits === 8) view.setUint8(o, Math.round(v * 127 + 128));
            else if (bits === 16) view.setInt16(o, Math.round(v * 32767), true);
            else if (bits === 24) { let x = Math.round(v * 8388607); if (x < 0) x += 0x1000000; view.setUint8(o, x & 255); view.setUint8(o + 1, (x >> 8) & 255); view.setUint8(o + 2, (x >> 16) & 255); }
            else view.setInt32(o, Math.round(v * 2147483647), true);
        });
        return buffer;
    }
    const square = (amplitude, count = 800) => Array.from({ length: count }, (_, i) => (i % 2 ? amplitude : -amplitude));

    // Reading
    const mono = S.parseWav(makeWav(square(0.5), { rate: 8000 }));
    equal("wav: 16-bit mono read", mono && `${mono.bits}/${mono.channels}/${mono.sampleRate}/${mono.frames}`, "16/1/8000/800");
    near("wav: duration", mono.seconds, 0.1, 0.0001);
    equal("wav: stereo frames", S.parseWav(makeWav(square(0.5), { channels: 2 })).frames, 400);
    equal("wav: a LIST chunk before data is skipped", S.parseWav(makeWav(square(0.5), { extraChunk: true })).frames, 800);
    equal("wav: extensible PCM read", S.parseWav(makeWav(square(0.5), { extensible: true, bits: 24 }))?.bits, 24);
    equal("wav: ADPCM refused", S.parseWav(makeWav(square(0.5), { format: 2 })), null);
    equal("wav: not a WAV", S.parseWav(new TextEncoder().encode("ID3 not a wave file at all, just some bytes......").buffer), null);
    equal("wav: too short", S.parseWav(new ArrayBuffer(10)), null);
    equal("wav: not a buffer", S.parseWav("RIFF"), null);

    // Measuring: a square wave's RMS equals its amplitude.
    near("measure: half-scale 16-bit RMS", S.measureWav(makeWav(square(0.5))).rmsDb, -6.02);
    near("measure: half-scale 16-bit peak", S.measureWav(makeWav(square(0.5))).peakDb, -6.02);
    near("measure: 8-bit unsigned", S.measureWav(makeWav(square(0.5), { bits: 8 })).rmsDb, -6.02, 0.1);
    near("measure: 24-bit", S.measureWav(makeWav(square(0.25), { bits: 24 })).rmsDb, -12.04);
    near("measure: 32-bit integer", S.measureWav(makeWav(square(0.25), { bits: 32 })).rmsDb, -12.04);
    near("measure: 32-bit float", S.measureWav(makeWav(square(0.1), { bits: 32, format: 3 })).rmsDb, -20);
    near("measure: stereo counts both channels", S.measureWav(makeWav([0.5, 0, 0.5, 0], { channels: 2 })).rmsDb, -9.03);
    equal("measure: silence", S.measureWav(makeWav(square(0))).rmsDb, -Infinity);
    near("measure: decoded channels", S.measureChannels([new Float32Array(square(0.5)), new Float32Array(square(0.5))]).rmsDb, -6.02);

    // Planning
    const quiet = { rmsDb: -18.8, peakDb: -5.7 };     // the original 98 startup sound
    const plan = S.planLevel(quiet, -26.4);
    near("plan: gain to the XP reference", plan.gainDb, -7.6);
    equal("plan: lowering never needs limiting", plan.limited, false);
    const loud = S.planLevel({ rmsDb: -40, peakDb: -10 }, -26.4);
    near("plan: raising is capped at the ceiling", loud.gainDb, 9.7);
    equal("plan: and says so", loud.limited, true);
    near("plan: the shortfall is reported", loud.resultRmsDb, -30.3);
    const free = S.planLevel({ rmsDb: -40, peakDb: -10 }, -26.4, { avoidClipping: false });
    near("plan: without the cap the reference is met", free.resultRmsDb, -26.4);
    equal("plan: and the clipping is flagged", free.clips, true);
    equal("plan: silence can't be leveled", S.planLevel({ rmsDb: -Infinity, peakDb: -Infinity }, -26.4), null);

    // Gain
    const halved = S.applyGain(makeWav(square(0.5)), -6.0206);
    near("gain: -6 dB halves a 16-bit sound", S.measureWav(halved).rmsDb, -12.04);
    equal("gain: same size and format", halved.byteLength === makeWav(square(0.5)).byteLength && S.parseWav(halved).bits, 16);
    near("gain: 8-bit", S.measureWav(S.applyGain(makeWav(square(0.5), { bits: 8 }), -6.0206)).rmsDb, -12.04, 0.15);
    near("gain: 24-bit", S.measureWav(S.applyGain(makeWav(square(0.25), { bits: 24 }), 6.0206)).rmsDb, -6.02);
    near("gain: float", S.measureWav(S.applyGain(makeWav(square(0.1), { bits: 32, format: 3 }), 10)).rmsDb, -10);
    near("gain: clamps at full scale", S.measureWav(S.applyGain(makeWav(square(0.5)), 20)).peakDb, 0, 0.01);
    const original = makeWav(square(0.5), { extraChunk: true });
    const keep = new Uint8Array(S.applyGain(original, -3));
    equal("gain: other chunks kept", String.fromCharCode(...keep.subarray(36, 40)), "LIST");
    near("gain: original untouched", S.measureWav(original).rmsDb, -6.02);
    equal("gain: refuses ADPCM", S.applyGain(makeWav(square(0.5), { format: 2 }), -3), null);

    // Base64
    const roundTrip = new Uint8Array(S.base64ToBytes(S.bytesToBase64(makeWav(square(0.3), { bits: 24 }))));
    equal("base64: round trip", roundTrip.length === makeWav(square(0.3), { bits: 24 }).byteLength && roundTrip[0] === 82, true);
    equal("base64: junk refused", S.base64ToBytes("not base64!"), null);

    // Formatting
    equal("format: negative dB", S.formatDb(-26.44), "−26.4 dB");
    equal("format: positive dB", S.formatDb(3.25), "+3.3 dB");
    equal("format: silence", S.formatDb(-Infinity), "silent");
    equal("format: seconds", S.formatSeconds(5.51), "5.5 s");
    equal("format: minutes", S.formatSeconds(75), "1:15");

    // Library
    const library = [
        { id: "a", name: "The Microsoft Sound", group: "", eraLabel: "Windows 95" },
        { id: "b", name: "CHIMES", group: "", eraLabel: "Windows 98" },
        { id: "c", name: "Windows Notify", group: "Garden", eraLabel: "Windows 7" },
        { id: "d", name: "Windows Ding", group: "", eraLabel: "Windows 7" }
    ];
    equal("search: every word", S.filterSounds(library, "microsoft 95").map(s => s.id).join(), "a");
    equal("search: by theme", S.filterSounds(library, "garden").map(s => s.id).join(), "c");
    equal("search: favorites only", S.filterSounds(library, "", new Set(["b", "d"])).map(s => s.id).join(), "b,d");
    equal("groups: loose sounds first", S.groupSounds(library.slice(2)).map(g => g.group).join("|"), "|Garden");

    // Logos for every version folder in the library
    const labels = ["Windows 3x", "Windows 95", "Windows NT 4.0", "Windows NT 5.0", "Windows 98", "Windows 2000 (Beta 3)", "Windows 2000 (RTM)",
        "Windows Me", "Windows XP", "Windows Vista", "Windows 7", "Windows 8", "Windows 10 (Beta) (Insider Preview builds 10074 - 10127)",
        "Windows 10 (RTM)", "Windows 10X", "Windows 11"];
    equal("logos: every version", labels.map(S.eraLogo).join(" "),
        "win31 win95 winnt win2000 win98 win2000 win2000 winme winxp vista win7 win8 win10 win10 win10x win11");
    equal("logos: a folder of your own has none", S.eraLogo("Aeolionware Startup"), "");

    // Loudness (BS.1770): reference values from the standard.
    const tone = (rate, seconds, amplitude, hz = 1000) => {
        const out = new Float32Array(Math.round(rate * seconds));
        for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin(2 * Math.PI * hz * i / rate);
        return out;
    };
    const lufs = S.measureLoudness([tone(48000, 3, 0.1)], 48000);
    near("loudness: 1 kHz at -20 dBFS in one channel is -23.0 LUFS", lufs, -23.0, 0.1);
    const stereo = S.measureLoudness([tone(48000, 3, 0.1), tone(48000, 3, 0.1)], 48000);
    near("loudness: the same in both channels is 3 LU louder", stereo, -20.0, 0.1);
    const at44 = S.measureLoudness([tone(44100, 3, 0.1)], 44100);
    near("loudness: the same at 44.1 kHz", at44, -23.0, 0.1);
    const low = S.measureLoudness([tone(48000, 3, 0.1, 40)], 48000);
    check("loudness: a 40 Hz rumble counts for less than 1 kHz", low < lufs - 0.5, `${low} vs ${lufs}`);
    const tail = new Float32Array(48000 * 4);
    tail.set(tone(48000, 1, 0.1));
    const withTail = S.measureLoudness([tail], 48000);
    near("loudness: 3 s of silence after the sound costs under 1 LU (RMS would drop 6 dB)", withTail, -23.0, 1.0);
    const short = S.measureLoudness([tone(48000, 0.2, 0.1)], 48000);
    near("loudness: shorter than one block is still measured", short, -23.0, 0.3);
    equal("loudness: silence", S.measureLoudness([new Float32Array(48000)], 48000), -Infinity);
    const compare = S.compareToTarget({ lufs: -18, peakDb: -1 }, -24);
    equal("target: 6 LU louder needs -6 dB", `${compare.difference} ${compare.matched} ${compare.gainDb} ${compare.limited}`, "6 false -6 false");
    const held = S.compareToTarget({ lufs: -30, peakDb: -2 }, -24);
    equal("target: raising is held back by the peak", `${held.gainDb.toFixed(1)} ${held.limited}`, "1.7 true");
    equal("target: within 1.5 LU is matched", S.compareToTarget({ lufs: -25.2, peakDb: -6 }, -24).matched, true);
    equal("target: nothing measured", S.compareToTarget({ lufs: -Infinity, peakDb: -6 }, -24), null);
    equal("logos: \"Me\" only as a word", S.eraLogo("Windows Memories"), "");

    // Select (1.8.0): which sounds can be deleted, and Shift + click ranges.
    check("leveled copy: in ASCS Leveled", S.isLeveledCopy("ASCS Leveled\\CHIMES (-7.6 dB).wav") && S.isLeveledCopy("ascs leveled\\x.WAV"));
    check("leveled copy: refused elsewhere", ["(1998) Windows 98\\CHIMES.wav", "ASCS Leveled\\sub\\x.wav", "ASCS Leveled\\x.mid", "My ASCS Leveled\\x.wav", "ASCS Leveled\\"].every(id => !S.isLeveledCopy(id)));
    const order = ["a", "b", "c", "d", "e"];
    equal("range: forward", S.rangeIds(order, "b", "d").join(""), "bcd");
    equal("range: backward", S.rangeIds(order, "e", "c").join(""), "cde");
    equal("range: same one", S.rangeIds(order, "c", "c").join(""), "c");
    equal("range: anchor not shown", S.rangeIds(order, "z", "c").join(""), "c");
    equal("range: target not shown", S.rangeIds(order, "a", "z").length, 0);

    // 1.8.1: own levels
    equal("own: snaps to half dB", S.snapOwnLevel(2.26), 2.5);
    equal("own: capped at +12", S.snapOwnLevel(30), 12);
    equal("own: capped at -12", S.snapOwnLevel(-30), -12);
    equal("own: not a number is the board's", S.snapOwnLevel(NaN), 0);
    equal("own: no negative zero", Object.is(S.snapOwnLevel(-0.1), 0), true);
    equal("own: middle of the bar", S.ownLevelAt(0), 0.5);
    equal("own: right end", S.ownLevelAt(12), 1);
    equal("own: from a quarter across", S.ownLevelFromFraction(0.25), -6);
    equal("own: from past the end", S.ownLevelFromFraction(1.4), 12);
    const cleaned = S.cleanOwnLevels({ "ascs:show": 3.2, "windows:x": 0, "bad": "4", "far": 40 });
    equal("own: cleaned keys", Object.keys(cleaned).join(","), "ascs:show,far");
    equal("own: cleaned value snapped", cleaned["ascs:show"], 3);
    equal("own: cleaned value capped", cleaned.far, 12);
    equal("own: an array is nothing", Object.keys(S.cleanOwnLevels([1, 2])).length, 0);
    equal("own: null is nothing", Object.keys(S.cleanOwnLevels(null)).length, 0);
    equal("reset: defaults have nothing to reset", S.levelChanges({ notifyTarget: -24, startupTarget: -20, reference: -26.4, levels: {} }).length, 0);
    const changes = S.levelChanges({ notifyTarget: -31, startupTarget: -20, reference: -22.4, levels: { a: 3, b: -1 } });
    equal("reset: what changes", changes.join("; "), "notification level -31.0 → -24.0; Target RMS -22.4 → -26.4; 2 own levels back to the board's");
    equal("reset: one own level", S.levelChanges({ notifyTarget: -24, startupTarget: -16, reference: -26.4, levels: { a: 1 } }).join("; "), "startup level -16.0 → -20.0; 1 own level back to the board's");
    equal("reset: within rounding is the default", S.levelChanges({ notifyTarget: -24.01, startupTarget: -20, reference: -26.4, levels: {} }).length, 0);
})();
