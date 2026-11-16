"use strict";
// Rhythm (2.6.0): step patterns in any of the metronome's time signatures,
// spread evenly (Euclidean) or written step by step, with swing; the
// polyrhythm and polymeter trainer's cycles and how a tap is scored; rhythms
// as kept; questions for the Quiz; and a rhythm written out on one-line
// staves. Pure, so it can be tested; rhythmview.js does the sound and the page.

globalThis.MaestroRhythm = (() => {
    const METERS = () => globalThis.MaestroMetronome.METERS;

    // ---- The kit, made in the page (rhythmview.js); `x` sounds are written with a cross.
    const KIT = Object.freeze({
        kick: Object.freeze({ label: "Kick", x: false }),
        snare: Object.freeze({ label: "Snare", x: false }),
        rim: Object.freeze({ label: "Rim", x: true }),
        clap: Object.freeze({ label: "Clap", x: true }),
        hatClosed: Object.freeze({ label: "Closed hat", x: true }),
        hatOpen: Object.freeze({ label: "Open hat", x: true }),
        tomHigh: Object.freeze({ label: "High tom", x: false }),
        tomLow: Object.freeze({ label: "Low tom", x: false }),
        cowbell: Object.freeze({ label: "Cowbell", x: true }),
        clave: Object.freeze({ label: "Clave", x: true }),
        woodblock: Object.freeze({ label: "Woodblock", x: false }),
        shaker: Object.freeze({ label: "Shaker", x: true })
    });
    const SOUNDS = Object.freeze(Object.keys(KIT));

    // Steps in a beat: the beat itself, or 2, 3 or 4 to a beat. A meter
    // counted in eighths (6/8, 7/8) takes 1 or 2.
    const STEP_LABELS = Object.freeze({ 1: "Beats", 2: "2 per beat", 3: "3 per beat", 4: "4 per beat" });
    const ROWS_MAX = 8, BARS_MAX = 4, TITLE_MAX = 60;
    const SWING_MIN = 50, SWING_MAX = 75;

    function meterInfo(meter) {
        const weights = METERS()[meter] || METERS()["4/4"];
        const [shown] = (METERS()[meter] ? meter : "4/4").split(":");
        const [beatsShown, unit] = shown.split("/").map(Number);
        const groups = [];
        weights.forEach(weight => (weight >= 2 ? groups.push(1) : (groups[groups.length - 1] += 1)));
        return { beats: weights.length, unit, shownBeats: beatsShown, weights, groups };
    }
    const stepsFor = meter => (meterInfo(meter).unit === 8 ? [1, 2] : [1, 2, 3, 4]);
    const barSteps = (meter, steps) => meterInfo(meter).beats * steps;
    const lengthMax = (meter, steps) => barSteps(meter, steps) * BARS_MAX;

    // ---- Patterns

    // k hits spread as evenly as they can be over n steps, the first on the
    // first step, then turned by `rotate` steps to the right.
    function euclid(k, n, rotate = 0) {
        if (!Number.isInteger(n) || n < 1) return [];
        const hits = Math.max(0, Math.min(n, Math.round(k)));
        const spread = Array.from({ length: n }, (_, i) => ((i * hits) % n) < hits && hits > 0 ? 1 : 0);
        const turn = ((Math.round(rotate) % n) + n) % n;
        return spread.map((_, i) => spread[(i - turn + n) % n]);
    }

    // Where each step of a beat falls, as a fraction of the beat. Swing
    // (50 straight, 66.7 a triplet's lilt, at most 75) delays the second of
    // each pair: eighths at 2 a beat, sixteenths at 4.
    function stepOffsets(steps, swing = 50) {
        const even = Array.from({ length: steps }, (_, k) => k / steps);
        if ((steps !== 2 && steps !== 4) || swing <= 50) return even;
        const pair = 2 / steps;
        return even.map((offset, k) => (k % 2 ? offset - pair / 2 + pair * Math.min(SWING_MAX, swing) / 100 : offset));
    }

    // A row's cells: 0 rest, 1 a hit, 2 an accent.
    const blankRow = (sound, length) => ({ sound, on: true, hits: new Array(length).fill(0) });

    function newRhythm({ title = "New rhythm", meter = "4/4", steps = 4, bars = 1 } = {}) {
        const info = meterInfo(meter);
        const cleanSteps = stepsFor(meter).includes(steps) ? steps : info.unit === 8 ? 1 : 2;
        const length = info.beats * cleanSteps * bars;
        return cleanRhythm({ title, meter, steps: cleanSteps, bars, swing: 50, rows: [blankRow("hatClosed", length), blankRow("snare", length), blankRow("kick", length)] });
    }

    const cleanText = (text, max) => [...String(text ?? "").replace(/[\u0000-\u001F\u007F"]/g, "").trim()].slice(0, max).join("").trim();

    // A rhythm as the page keeps it, or null.
    function cleanRhythm(raw) {
        if (!raw || typeof raw !== "object") return null;
        if (!Object.hasOwn(METERS(), raw.meter)) return null;
        if (!stepsFor(raw.meter).includes(raw.steps)) return null;
        if (!Number.isInteger(raw.bars) || raw.bars < 1 || raw.bars > BARS_MAX) return null;
        const swing = Number.isInteger(raw.swing) && raw.swing >= SWING_MIN && raw.swing <= SWING_MAX ? raw.swing : 50;
        if (!Array.isArray(raw.rows) || raw.rows.length < 1 || raw.rows.length > ROWS_MAX) return null;
        const max = lengthMax(raw.meter, raw.steps);
        const rows = [];
        for (const row of raw.rows) {
            if (!SOUNDS.includes(row?.sound) || !Array.isArray(row.hits)) return null;
            if (row.hits.length < 1 || row.hits.length > max) return null;
            if (!row.hits.every(cell => cell === 0 || cell === 1 || cell === 2)) return null;
            rows.push(Object.freeze({ sound: row.sound, on: row.on !== false, hits: Object.freeze([...row.hits]) }));
        }
        return Object.freeze({ title: cleanText(raw.title, TITLE_MAX) || "Rhythm", meter: raw.meter, steps: raw.steps, bars: raw.bars, swing, rows: Object.freeze(rows) });
    }

    // What sounds at a step counted from the pattern's start: each row on
    // repeats its own length, so rows of different lengths are a polymeter.
    function hitsAt(rhythm, step) {
        const out = [];
        for (const row of rhythm.rows) {
            if (!row.on) continue;
            const cell = row.hits[((step % row.hits.length) + row.hits.length) % row.hits.length];
            if (cell) out.push({ sound: row.sound, accent: cell === 2 });
        }
        return out;
    }

    // A row's own length, by its hits, gives it the next bar's worth: a row made
    // longer keeps its cells and repeats them; shorter, it's cut.
    function resizeRow(row, length) {
        return { ...row, hits: Array.from({ length }, (_, i) => row.hits[i % row.hits.length] ?? 0) };
    }

    // ---- As kept: "Maestro rhythm 1", tab-separated.
    const HEADER = "Maestro rhythm 1";

    function rhythmText(rhythm) {
        return [
            HEADER,
            rhythm.title,
            `meter\t${rhythm.meter}`,
            `steps\t${rhythm.steps}\tbars\t${rhythm.bars}\tswing\t${rhythm.swing}`,
            ...rhythm.rows.map(row => `row\t${row.sound}\t${row.on ? "on" : "off"}\t${row.hits.join("")}`)
        ].join("\n");
    }

    function readRhythm(text) {
        const lines = String(text ?? "").replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
        if (lines.length < 5 || lines.length > 4 + ROWS_MAX || lines[0] !== HEADER) return null;
        const meter = /^meter\t(\S+)$/.exec(lines[2]);
        const counts = /^steps\t([1-4])\tbars\t([1-4])\tswing\t(\d{2})$/.exec(lines[3]);
        if (!meter || !counts) return null;
        const rows = [];
        for (const line of lines.slice(4)) {
            const row = /^row\t([A-Za-z]+)\t(on|off)\t([012]+)$/.exec(line);
            if (!row) return null;
            rows.push({ sound: row[1], on: row[2] === "on", hits: [...row[3]].map(Number) });
        }
        const rhythm = cleanRhythm({ title: lines[1], meter: meter[1], steps: Number(counts[1]), bars: Number(counts[2]), swing: Number(counts[3]), rows });
        return rhythm && rhythm.title === lines[1] && rhythm.swing === Number(counts[3]) ? rhythm : null;
    }

    // ---- Grooves to start from, and for the drums behind Progressions.
    const groove = (id, label, meter, steps, rows, swing = 50) => Object.freeze({ id, label, rhythm: cleanRhythm({ title: label, meter, steps, bars: Math.max(1, Math.ceil(rows[0][1].length / barSteps(meter, steps))), swing, rows: rows.map(([sound, cells]) => ({ sound, on: true, hits: [...cells].map(Number) })) }) });
    const GROOVES = Object.freeze([
        groove("rock", "Rock", "4/4", 2, [["hatClosed", "21212121"], ["snare", "00100010"], ["kick", "10001010"]]),
        groove("funk", "Funk sixteenths", "4/4", 4, [["hatClosed", "2121212121212121"], ["snare", "0000100100001000"], ["kick", "1000001000100000"]]),
        groove("shuffle", "Shuffle", "4/4", 3, [["hatClosed", "201201201201"], ["snare", "000100000100"], ["kick", "100000100000"]]),
        groove("swing", "Jazz ride", "4/4", 2, [["hatOpen", "20112011"], ["hatClosed", "00100010"], ["kick", "10001000"]], 66),
        groove("waltz", "Waltz", "3/4", 2, [["hatClosed", "201010"], ["snare", "001010"], ["kick", "100000"]]),
        groove("bossa", "Bossa nova", "4/4", 4, [["shaker", "2111211121112111"], ["rim", "1001001000100100"], ["kick", "1001100110011001"]]),
        groove("tresillo", "Tresillo", "4/4", 2, [["clave", "10010010"], ["kick", "10001000"]]),
        groove("son32", "Son clave 3–2", "2/2", 4, [["clave", "10010010" + "00101000"], ["kick", "10001000" + "10001000"]]),
        groove("bembe", "6/8 bell", "6/8", 2, [["cowbell", "101011010101"], ["shaker", "211211211211"], ["kick", "100000100000"]]),
        groove("seven", "7/8 (2+2+3)", "7/8", 1, [["hatClosed", "2121211"], ["snare", "0101010"], ["kick", "1010100"]])
    ]);

    // ---- The trainer: two layers against each other.
    //   Polyrhythm a:b: a notes and b notes spread over the same span, b beats
    //   long at the tempo, so the tempo counts the second layer.
    //   Polymeter a over b: one pulse at the tempo, the first layer grouped in
    //   a, the second in b, until they meet again.
    const TRAINER_MIN = 2, TRAINER_MAX = 9;
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);

    function trainerCycle({ kind, a, b }) {
        const events = [];
        if (kind === "polymeter") {
            const beats = (a * b) / gcd(a, b);
            for (let pulse = 0; pulse < beats; pulse++) {
                if (pulse % a === 0) events.push({ at: pulse, layer: 0, index: pulse / a, first: pulse === 0 });
                if (pulse % b === 0) events.push({ at: pulse, layer: 1, index: pulse / b, first: pulse === 0 });
                if (pulse % a && pulse % b) events.push({ at: pulse, layer: -1, index: pulse, first: false });
            }
            return { beats, events };
        }
        for (let i = 0; i < a; i++) events.push({ at: (i * b) / a, layer: 0, index: i, first: i === 0 });
        for (let j = 0; j < b; j++) events.push({ at: j, layer: 1, index: j, first: j === 0 });
        events.sort((x, y) => x.at - y.at || x.layer - y.layer);
        return { beats: b, events };
    }

    // Where the layers fall in the smallest grid both fit, each step listing
    // its layers: 3:2 is six steps (both, none, the first, the second, the
    // first, none); a polymeter is its pulses.
    function trainerGrid({ kind, a, b }) {
        const cycle = trainerCycle({ kind, a, b });
        if (kind === "polymeter") return cycle.events.filter(event => event.layer >= 0).reduce((grid, event) => { grid[event.at].push(event.layer); return grid; }, Array.from({ length: cycle.beats }, () => []));
        const size = (a * b) / gcd(a, b);
        const grid = Array.from({ length: size }, () => []);
        for (let i = 0; i < a; i++) grid[i * (size / a)].push(0);
        for (let j = 0; j < b; j++) grid[j * (size / b)].push(1);
        return grid;
    }

    // A tap at `time` (seconds) against a layer's expected times: the nearest,
    // if it's within half the layer's spacing, with how early (−) or late (+).
    function scoreTap(times, time) {
        if (!times.length) return null;
        let best = 0;
        times.forEach((each, index) => { if (Math.abs(each - time) < Math.abs(times[best] - time)) best = index; });
        const spacing = times.length > 1 ? Math.min(...times.slice(1).map((each, index) => each - times[index])) : Infinity;
        const error = time - times[best];
        return Math.abs(error) <= spacing / 2 ? { index: best, error } : null;
    }

    // A run of scored taps (error in seconds), and the expected notes missed:
    // the average distance, early or late on the whole, and a word for it.
    const STEADY = 0.035, CLOSE = 0.07;
    function tapSummary(errors, missed = 0) {
        const count = errors.length;
        if (!count) return { count, missed, average: null, bias: null, word: missed ? "Missed" : "" };
        const average = errors.reduce((sum, error) => sum + Math.abs(error), 0) / count;
        const bias = errors.reduce((sum, error) => sum + error, 0) / count;
        const word = missed ? "Some missed" : average <= STEADY ? "Steady" : average <= CLOSE ? "Close" : bias < 0 ? "Rushing" : "Dragging";
        return { count, missed, average, bias, word };
    }
    const isSteady = summary => summary.count > 0 && !summary.missed && summary.average <= STEADY;

    // ---- The Quiz: a bar to hear and write, or to read and tap.
    // Each beat is drawn from figures of its steps, simple ones more often at
    // the easier level; the bar's first beat always starts with a note.
    const FIGURES = Object.freeze({
        2: Object.freeze([["10", 4], ["11", 4], ["01", 1], ["00", 1]]),
        3: Object.freeze([["100", 2], ["111", 3], ["101", 2], ["110", 1], ["011", 1]]),
        4: Object.freeze([["1000", 2], ["1010", 3], ["1111", 3], ["1011", 2], ["1101", 2], ["1110", 2], ["1001", 1], ["0010", 1], ["0111", 1]])
    });
    const QUIZ_LEVELS = Object.freeze({
        easy: Object.freeze({ label: "Eighths", meters: ["4/4", "3/4"], steps: [2] }),
        middle: Object.freeze({ label: "Sixteenths", meters: ["4/4", "3/4", "2/4"], steps: [4] }),
        triplets: Object.freeze({ label: "Triplets", meters: ["4/4", "3/4"], steps: [3] }),
        mixed: Object.freeze({ label: "All", meters: ["4/4", "3/4", "2/4"], steps: [2, 3, 4] })
    });

    function pickWeighted(list, random) {
        const total = list.reduce((sum, [, weight]) => sum + weight, 0);
        let at = random() * total;
        for (const [value, weight] of list) {
            at -= weight;
            if (at < 0) return value;
        }
        return list.at(-1)[0];
    }

    // One bar (the steps given or drawn), as cells of 0 and 1.
    function quizBar(level, random = Math.random) {
        const set = QUIZ_LEVELS[level] || QUIZ_LEVELS.easy;
        const meter = set.meters[Math.floor(random() * set.meters.length)];
        const steps = set.steps[Math.floor(random() * set.steps.length)];
        const beats = meterInfo(meter).beats;
        let cells = [];
        for (let beat = 0; beat < beats; beat++) {
            let figure = pickWeighted(FIGURES[steps], random);
            if (beat === 0 && figure[0] !== "1") figure = "1" + figure.slice(1);
            cells = cells.concat([...figure].map(Number));
        }
        return { meter, steps, cells };
    }

    // Written against heard: each step right or wrong, and how many were right.
    function gradeCells(answer, expected) {
        const marks = expected.map((cell, i) => (answer[i] ? 1 : 0) === (cell ? 1 : 0));
        return { marks, right: marks.filter(Boolean).length, total: marks.length, all: marks.every(Boolean) };
    }

    // Taps against a bar's notes (both in seconds from the bar's start): each
    // note matched to the nearest tap not yet used, within `window`; taps left
    // over are extra.
    function gradeTaps(expected, taps, window = 0.1) {
        const used = new Set();
        const notes = expected.map(time => {
            let best = -1;
            taps.forEach((tap, index) => {
                if (used.has(index) || Math.abs(tap - time) > window) return;
                if (best < 0 || Math.abs(tap - time) < Math.abs(taps[best] - time)) best = index;
            });
            if (best < 0) return { time, error: null };
            used.add(best);
            return { time, error: taps[best] - time };
        });
        const extra = taps.length - used.size;
        const hit = notes.filter(note => note.error !== null).length;
        return { notes, extra, hit, total: expected.length, all: hit === expected.length && extra === 0 };
    }

    // ---- Written out: a row on a one-line staff.
    // Each beat is spelled alone (a note lasts to the next in its beat, rests
    // fill the gaps), so every beat reads at a glance. Durations are in
    // fractions of a whole note; three to a beat are written as a triplet.
    const NOTE_VALUES = [[1, "w", false], [0.75, "h", true], [0.5, "h", false], [0.375, "q", true], [0.25, "q", false], [0.1875, "e", true], [0.125, "e", false], [0.09375, "s", true], [0.0625, "s", false], [0.03125, "t", false]];
    function noteValue(fraction) {
        const found = NOTE_VALUES.find(([value]) => Math.abs(value - fraction) < 1e-9);
        return found ? { d: found[1], dot: found[2] } : null;
    }

    // A row's bars as beats of tokens: { rest, steps, d, dot, accent, step }.
    function spellRow(hits, meter, steps) {
        const info = meterInfo(meter);
        const triplet = steps === 3;
        const stepFraction = triplet ? 1 / (info.unit * 2) : 1 / (info.unit * steps);
        const perBar = info.beats * steps;
        const bars = [];
        for (let start = 0; start < hits.length; start += perBar) {
            const beats = [];
            for (let beat = 0; beat < info.beats; beat++) {
                const from = start + beat * steps;
                const cells = Array.from({ length: steps }, (_, k) => hits[from + k] ?? 0);
                const tokens = [];
                // A note lasts to the next hit in its beat; a rest runs to it.
                for (let k = 0; k < steps;) {
                    let end = k + 1;
                    while (end < steps && !cells[end]) end++;
                    const length = end - k;
                    // A whole beat in a triplet beat is the beat's own note, with no "3".
                    const value = noteValue(triplet && length === 3 ? 1 / info.unit : length * stepFraction);
                    tokens.push({ rest: !cells[k], steps: length, ...value, accent: cells[k] === 2, step: from + k });
                    k = end;
                }
                beats.push({ tokens, triplet: triplet && !(tokens.length === 1 && tokens[0].steps === 3) });
            }
            bars.push(beats);
        }
        return bars;
    }

    // Bravura Text: five spaces to the em, a glyph centered two spaces above its baseline.
    const SPACE = 10, LIFT = 2 * SPACE, STEM = 3.5 * SPACE;
    const G = cp => String.fromCodePoint(cp);
    const GLYPHS = Object.freeze({
        clef: G(0xE069), head: G(0xE0A4), half: G(0xE0A3), whole: G(0xE0A2),
        xhead: G(0xE0A9), xhalf: G(0xE0A8), xwhole: G(0xE0A7),
        flag8: G(0xE240), flag16: G(0xE242), flag32: G(0xE244), dot: G(0xE1E7), accent: G(0xE4A1), triplet: G(0xE883),
        restw: G(0xE4E3), resth: G(0xE4E4), restq: G(0xE4E5), reste: G(0xE4E6), rests: G(0xE4E7), restt: G(0xE4E8),
        digits: Array.from({ length: 10 }, (_, i) => G(0xE080 + i))
    });
    const FLAGS = { e: 1, s: 2, t: 3 };

    // Lays rows out in systems no wider than maxWidth: each system the same bars
    // of every row, a one-line staff each. Returns { width, height, items,
    // steps, systems }: items to draw as notation.js's are; steps says where
    // each step is ({ step, x, system }), for lighting what's playing.
    function engraveRhythm(rows, meter, steps, { maxWidth = Infinity, labels = true } = {}) {
        const info = meterInfo(meter);
        const spelled = rows.map(row => spellRow(row.hits, meter, steps));
        const barCount = Math.max(1, ...spelled.map(bars => bars.length));
        const items = [];
        const where = [];
        const line = (x1, y1, x2, y2, kind) => items.push({ kind: "line", x1, y1, x2, y2, class: kind });
        const glyph = (text, x, y, kind = "staff-glyph") => items.push({ kind: "glyph", text, x, y, class: kind });
        const labelWidth = labels ? 9 * SPACE : 0;
        const stepWidth = SPACE * (steps === 1 ? 4.2 : steps === 2 ? 3 : steps === 3 ? 2.6 : 2.3);
        const beatWidth = steps * stepWidth + SPACE * 0.8;
        const barWidth = info.beats * beatWidth + SPACE * 1.2;
        const header = SPACE * 3.8;
        const timeWidth = SPACE * 3;
        const rowGap = SPACE * 8.5;
        const systems = [];
        let current = null;
        for (let bar = 0; bar < barCount; bar++) {
            const lead = labelWidth + header + (bar === 0 ? timeWidth : 0);
            if (!current || (current.width + barWidth > maxWidth && current.bars.length)) {
                current = { bars: [], width: lead, lead };
                systems.push(current);
            }
            current.bars.push(bar);
            current.width += barWidth;
        }
        // Triplets' 3s need room above the stems (2.6.0).
        const above = SPACE * (steps === 3 ? 6.5 : 5);
        let top = above;
        systems.forEach((system, systemIndex) => {
            system.top = top - above;
            rows.forEach((row, r) => {
                const y = top + r * rowGap;
                const left = labelWidth;
                line(left, y, system.width, y, "staff-line");
                if (labels) items.push({ kind: "text", text: KIT[row.sound]?.label ?? row.sound, x: 0, y: y + SPACE * 0.5, class: "rhythm-label" });
                // The percussion clef sits on its baseline at the line, unlike a notehead.
                glyph(GLYPHS.clef, left + SPACE * 0.8, y);
                if (systemIndex === 0) {
                    const x = left + header;
                    String(info.shownBeats).split("").forEach((digit, at) => glyph(GLYPHS.digits[digit], x + at * 1.8 * SPACE, y - SPACE));
                    String(info.unit).split("").forEach((digit, at) => glyph(GLYPHS.digits[digit], x + at * 1.8 * SPACE, y + SPACE));
                }
                let x = system.lead;
                system.bars.forEach(bar => {
                    const beats = spelled[r][bar] ?? spellRow(new Array(info.beats * steps).fill(0), meter, steps)[0];
                    beats.forEach((beat, b) => {
                        const beatX = x + SPACE * 0.6 + b * beatWidth;
                        const placed = [];
                        beat.tokens.forEach(token => {
                            const k = token.step - (bar * info.beats + b) * steps;
                            const hx = beatX + k * stepWidth;
                            if (r === 0) where.push({ step: token.step, x: hx, system: systemIndex });
                            for (let extra = 1; extra < token.steps; extra++) if (r === 0) where.push({ step: token.step + extra, x: hx + extra * stepWidth, system: systemIndex });
                            if (token.rest) {
                                glyph(GLYPHS[`rest${token.d}`], hx, y + LIFT);
                                if (token.dot) glyph(GLYPHS.dot, hx + SPACE * 1.4, y - SPACE * 0.5 + LIFT);
                                return;
                            }
                            const cross = KIT[row.sound]?.x;
                            const head = token.d === "w" ? (cross ? GLYPHS.xwhole : GLYPHS.whole) : token.d === "h" ? (cross ? GLYPHS.xhalf : GLYPHS.half) : (cross ? GLYPHS.xhead : GLYPHS.head);
                            glyph(head, hx, y + LIFT);
                            const headWidth = token.d === "w" ? 1.69 * SPACE : 1.18 * SPACE;
                            if (token.dot) glyph(GLYPHS.dot, hx + headWidth + SPACE * 0.4, y - SPACE * 0.5 + LIFT);
                            if (token.accent) glyph(GLYPHS.accent, hx + headWidth * 0.05, y + SPACE * 1.7 + LIFT);
                            if (token.d !== "w") placed.push({ x: hx, stemX: hx + headWidth - 0.06 * SPACE, d: token.d });
                        });
                        // Stems up; eighths and shorter in a beat beamed together (a lone one flagged).
                        const short = placed.filter(note => FLAGS[note.d]);
                        const level = y - STEM - (short.some(note => FLAGS[note.d] >= 2) ? SPACE * 0.5 : 0);
                        placed.forEach(note => line(note.stemX, y, note.stemX, FLAGS[note.d] && short.length > 1 ? level : y - STEM, "staff-stem"));
                        if (short.length === 1) {
                            const note = short[0];
                            // A flag hangs from the stem's end: its origin there, lifted as every glyph is.
                            glyph(note.d === "e" ? GLYPHS.flag8 : note.d === "s" ? GLYPHS.flag16 : GLYPHS.flag32, note.stemX - 0.06 * SPACE, y - STEM + LIFT);
                        } else if (short.length > 1) {
                            // Beamed notes run between the first and last short note; a rest among them is under the beam.
                            const first = short[0], last = short.at(-1);
                            items.push({ kind: "beam", x1: first.stemX, x2: last.stemX, y1: level, y2: level, thickness: 0.5 * SPACE, class: "staff-beam" });
                            for (let depth = 2; depth <= 3; depth++) {
                                const yy = level + (depth - 1) * 0.75 * SPACE;
                                short.forEach((note, index) => {
                                    if (FLAGS[note.d] < depth) return;
                                    const next = short[index + 1];
                                    const before = short[index - 1];
                                    if (next && FLAGS[next.d] >= depth) items.push({ kind: "beam", x1: note.stemX, x2: next.stemX, y1: yy, y2: yy, thickness: 0.5 * SPACE, class: "staff-beam" });
                                    else if (!(before && FLAGS[before.d] >= depth)) {
                                        const toward = next ? 1 : -1;
                                        items.push({ kind: "beam", x1: toward > 0 ? note.stemX : note.stemX - 1.2 * SPACE, x2: toward > 0 ? note.stemX + 1.2 * SPACE : note.stemX, y1: yy, y2: yy, thickness: 0.5 * SPACE, class: "staff-beam" });
                                    }
                                });
                            }
                        }
                        // A triplet's 3 clears the beam and stems (2.6.0; it sat on the beam). A
                        // group not beamed whole, as a quarter and an eighth, has a bracket.
                        if (beat.triplet && placed.length) {
                            const x1 = placed[0].x, x2 = placed.at(-1).stemX;
                            const mid = (x1 + x2) / 2;
                            const beamed = short.length > 1 && short.length === placed.length;
                            const numberY = level - SPACE * 1.4;
                            if (!beamed) {
                                const hook = numberY + SPACE * 0.6;
                                line(x1, hook, x1, numberY, "staff-stem");
                                line(x1, numberY, mid - SPACE * 0.9, numberY, "staff-stem");
                                line(mid + SPACE * 0.9, numberY, x2, numberY, "staff-stem");
                                line(x2, numberY, x2, hook, "staff-stem");
                            }
                            glyph(GLYPHS.triplet, mid - SPACE * 0.5, numberY + SPACE * 0.6);
                        }
                    });
                    x += barWidth;
                    line(x, y - SPACE * 2, x, y + SPACE * 2, bar === barCount - 1 ? "bar-line is-final" : "bar-line");
                });
            });
            system.bottom = top + (rows.length - 1) * rowGap + SPACE * 4;
            top = system.bottom + SPACE * 6 + (above - SPACE * 5);
        });
        const width = Math.max(...systems.map(system => system.width)) + SPACE;
        return { width, height: top - SPACE * 4, items, steps: where, systems: systems.map(system => ({ top: system.top, bottom: system.bottom, bars: system.bars })), space: SPACE, font: 5 * SPACE };
    }

    return Object.freeze({
        KIT, SOUNDS, STEP_LABELS, ROWS_MAX, BARS_MAX, TITLE_MAX, SWING_MIN, SWING_MAX, HEADER, GROOVES,
        TRAINER_MIN, TRAINER_MAX, QUIZ_LEVELS, STEADY, CLOSE,
        meterInfo, stepsFor, barSteps, lengthMax, euclid, stepOffsets, newRhythm, cleanRhythm, hitsAt, resizeRow,
        rhythmText, readRhythm, trainerCycle, trainerGrid, scoreTap, tapSummary, isSteady,
        quizBar, gradeCells, gradeTaps, spellRow, noteValue, engraveRhythm
    });
})();
