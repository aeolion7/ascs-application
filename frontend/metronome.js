"use strict";
// The metronome's rules (2.3.0): tempo, meters, subdivisions, tap tempo, the
// tempo trainer and the saved settings. Pure, so they can be tested;
// conservatoryview.js does the sound and the page.

globalThis.MaestroMetronome = (() => {
    const MIN = 30;
    const MAX = 300;

    // Time signatures. Each beat is the lower number's note (a quarter in 4/4,
    // an eighth in 7/8, a half in 2/2), and the tempo counts those. Its weight:
    // 3 starts the bar, 2 starts a later group (6/8's fourth beat, the 3 of
    // 7/8 as 2+2+3), 1 is a beat, 0 a subdivision between beats.
    const groups = (...sizes) => Object.freeze(sizes.flatMap((size, at) => [at === 0 ? 3 : 2, ...Array(size - 1).fill(1)]));
    const METERS = Object.freeze({
        "2/2": Object.freeze([3, 1]),
        "2/4": Object.freeze([3, 1]),
        "3/4": Object.freeze([3, 1, 1]),
        "4/4": Object.freeze([3, 1, 1, 1]),
        "5/4": Object.freeze([3, 1, 1, 1, 1]),
        "6/4": Object.freeze([3, 1, 1, 1, 1, 1]),
        "7/4": Object.freeze([3, 1, 1, 1, 1, 1, 1]),
        "3/8": Object.freeze([3, 1, 1]),
        "6/8": groups(3, 3),
        "9/8": groups(3, 3, 3),
        "12/8": groups(3, 3, 3, 3),
        "5/8": groups(3, 2),
        "5/8:2+3": groups(2, 3),
        "7/8": groups(2, 2, 3),
        "7/8:3+2+2": groups(3, 2, 2),
        "7/8:2+3+2": groups(2, 3, 2)
    });
    // How the list groups them, and their names: an odd meter names its groups.
    const METER_GROUPS = Object.freeze([
        ["Simple", Object.freeze(["2/2", "2/4", "3/4", "4/4", "5/4", "6/4", "7/4", "3/8"])],
        ["Compound", Object.freeze(["6/8", "9/8", "12/8"])],
        ["Odd", Object.freeze(["5/8", "5/8:2+3", "7/8", "7/8:3+2+2", "7/8:2+3+2"])]
    ]);
    const meterLabel = meter => {
        const weights = METERS[meter];
        if (!weights) return meter;
        const [shown] = meter.split(":");
        if (!METER_GROUPS.find(([family]) => family === "Odd")[1].includes(meter)) return shown;
        const sizes = [];
        weights.forEach(weight => (weight >= 2 ? sizes.push(1) : (sizes[sizes.length - 1] += 1)));
        return `${shown} (${sizes.join("+")})`;
    };
    // Clicks per beat.
    const COUNTS = Object.freeze({ quarter: 1, eighth: 2, triplet: 3, sixteenth: 4 });
    const COUNT_LABELS = Object.freeze({ quarter: "None", eighth: "2 per beat", triplet: "3 per beat", sixteenth: "4 per beat" });
    const SOUNDS = Object.freeze({ woodblock: "Woodblock", click: "Click", beep: "Beep" });

    // The common Italian markings, each from its lower bound.
    const NAMES = Object.freeze([[MIN, "Grave"], [40, "Largo"], [60, "Larghetto"], [66, "Adagio"], [76, "Andante"], [108, "Moderato"], [120, "Allegro"], [156, "Vivace"], [176, "Presto"], [200, "Prestissimo"]]);

    const DEFAULTS = Object.freeze({
        tempo: 96, meter: "4/4", count: "quarter", sound: "woodblock", volume: 70,
        trainer: Object.freeze({ on: false, from: 80, to: 120, step: 4, every: 8 }),
        countIn: 0,
        gap: Object.freeze({ on: false, play: 2, mute: 2 })
    });
    const COUNT_IN_MAX = 2;
    const GAP_MAX = 8;

    const wholeIn = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;

    function clampTempo(value) {
        if (value === null || value === undefined || String(value).trim() === "") return null;
        const number = Math.round(Number(value));
        if (!Number.isFinite(number)) return null;
        return Math.min(MAX, Math.max(MIN, number));
    }

    function tempoName(tempo) {
        let name = NAMES[0][1];
        for (const [from, label] of NAMES) if (tempo >= from) name = label;
        return name;
    }

    // Tap tempo from tap times in ms, oldest first: the average of the last
    // four gaps. A pause over two seconds starts a new count. null until two taps.
    function tapTempo(times) {
        const recent = [];
        for (let i = times.length - 1; i >= 0; i--) {
            if (recent.length && recent[0] - times[i] > 2000) break;
            recent.unshift(times[i]);
            if (recent.length === 5) break;
        }
        if (recent.length < 2) return null;
        const gap = (recent.at(-1) - recent[0]) / (recent.length - 1);
        return gap > 0 ? clampTempo(60000 / gap) : null;
    }

    // Where the count is: beat in the bar, and click within the beat.
    function pulseWeight(position, meter) {
        return position.sub ? 0 : (METERS[meter] || METERS["4/4"])[position.beat] ?? 1;
    }

    // The next click's position; barEnded when it starts a new bar.
    function advance(position, meter, count) {
        const beats = (METERS[meter] || METERS["4/4"]).length;
        const clicks = COUNTS[count] || 1;
        let { beat, sub } = position;
        sub += 1;
        if (sub >= clicks) { sub = 0; beat += 1; }
        // A meter changed mid-bar finishes in the new one.
        const barEnded = sub === 0 && beat >= beats;
        if (barEnded) beat = 0;
        return { position: { beat, sub }, barEnded };
    }

    const secondsPerClick = (tempo, count) => 60 / tempo / (COUNTS[count] || 1);

    // The trainer raises the tempo by its step every so many bars, up to its
    // top, and then holds it there.
    function trainerNext(tempo, trainer) {
        return Math.min(trainer.to, tempo + trainer.step);
    }

    function barsUntilStep(barsDone, trainer) {
        return trainer.every - (barsDone % trainer.every);
    }

    function cleanTrainer(stored) {
        const trainer = { ...DEFAULTS.trainer };
        if (!stored || typeof stored !== "object") return trainer;
        if (typeof stored.on === "boolean") trainer.on = stored.on;
        if (wholeIn(stored.from, MIN, MAX)) trainer.from = stored.from;
        if (wholeIn(stored.to, MIN, MAX)) trainer.to = stored.to;
        if (wholeIn(stored.step, 1, 40)) trainer.step = stored.step;
        if (wholeIn(stored.every, 1, 64)) trainer.every = stored.every;
        if (trainer.from >= trainer.to) { trainer.from = DEFAULTS.trainer.from; trainer.to = DEFAULTS.trainer.to; }
        return trainer;
    }

    // Muted bars (2.3.0): `play` bars sound, then `mute` bars are silent, and
    // again, so you keep the time yourself. `bar` counts from 0 after the count-in.
    const barIsMuted = (bar, gap) => gap.on && bar % (gap.play + gap.mute) >= gap.play;

    function cleanGap(stored) {
        const gap = { ...DEFAULTS.gap };
        if (!stored || typeof stored !== "object") return gap;
        if (typeof stored.on === "boolean") gap.on = stored.on;
        if (wholeIn(stored.play, 1, GAP_MAX)) gap.play = stored.play;
        if (wholeIn(stored.mute, 1, GAP_MAX)) gap.mute = stored.mute;
        return gap;
    }

    // Practice time (2.3.0): seconds the metronome played, by local day
    // ("2026-11-13"), the last 14 days kept.
    const PRACTICE_DAYS = 14;
    const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    function parsePractice(text) {
        let stored = null;
        try { stored = JSON.parse(text); } catch { stored = null; }
        const log = {};
        if (!stored || typeof stored !== "object" || Array.isArray(stored)) return log;
        for (const [day, seconds] of Object.entries(stored)) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(seconds) && seconds > 0 && seconds <= 86400) log[day] = Math.round(seconds);
        }
        return log;
    }

    function addPractice(log, date, seconds) {
        const next = { ...log };
        const day = dayKey(date);
        if (Number.isFinite(seconds) && seconds > 0) next[day] = Math.min(86400, (next[day] || 0) + Math.round(seconds));
        for (const old of Object.keys(next).sort().slice(0, -PRACTICE_DAYS)) delete next[old];
        return next;
    }

    // Today's seconds and the last seven days' (today among them).
    function practiceSummary(log, date) {
        let week = 0;
        for (let back = 0; back < 7; back++) {
            const day = new Date(date.getFullYear(), date.getMonth(), date.getDate() - back);
            week += log[dayKey(day)] || 0;
        }
        return { today: log[dayKey(date)] || 0, week };
    }

    // "25 min", "1 h 5 min", "under a minute".
    function practiceText(seconds) {
        const minutes = Math.floor(seconds / 60);
        if (minutes < 1) return "under a minute";
        return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
    }

    // Saved settings, with anything wrong or missing replaced by its default.
    function parseSettings(text) {
        let stored = null;
        try { stored = JSON.parse(text); } catch { stored = null; }
        const settings = { ...DEFAULTS, trainer: cleanTrainer(stored?.trainer), gap: cleanGap(stored?.gap) };
        if (!stored || typeof stored !== "object" || Array.isArray(stored)) return settings;
        if (wholeIn(stored.tempo, MIN, MAX)) settings.tempo = stored.tempo;
        if (Object.hasOwn(METERS, stored.meter)) settings.meter = stored.meter;
        if (Object.hasOwn(COUNTS, stored.count)) settings.count = stored.count;
        if (Object.hasOwn(SOUNDS, stored.sound)) settings.sound = stored.sound;
        if (wholeIn(stored.volume, 0, 100)) settings.volume = stored.volume;
        if (wholeIn(stored.countIn, 0, COUNT_IN_MAX)) settings.countIn = stored.countIn;
        return settings;
    }

    return { MIN, MAX, METERS, METER_GROUPS, meterLabel, COUNTS, COUNT_LABELS, SOUNDS, DEFAULTS, clampTempo, tempoName, tapTempo, pulseWeight, advance, secondsPerClick, trainerNext, barsUntilStep, cleanTrainer, COUNT_IN_MAX, GAP_MAX, barIsMuted, cleanGap, dayKey, parsePractice, addPractice, practiceSummary, practiceText, parseSettings };
})();
