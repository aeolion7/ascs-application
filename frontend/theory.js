"use strict";
// Theory for the Conservatory's Theory tab (2.8.0): twelve-tone rows and
// their matrix, pitch-class sets (normal and prime form, Forte's names, the
// interval vector) and negative harmony, a chord or a whole chart reflected
// across the axis between a key's tonic and its dominant. Pure, so they can
// be tested; theoryview.js shows them.

globalThis.MaestroTheory = (() => {
    const M = globalThis.MaestroMusic;
    const H = globalThis.MaestroHarmony;
    const modulo = (n, m) => ((n % m) + m) % m;
    const sortedPcs = pcs => [...new Set(pcs.map(pc => modulo(pc, 12)))].sort((a, b) => a - b);

    // ---- Pitch classes as written: 0 to 11, with t and e for 10 and 11.
    const PC_DIGITS = "0123456789te";
    const pcDigit = pc => PC_DIGITS[modulo(pc, 12)];

    // A note's pitch class from a name (C, F♯, Bb, Eb) or an integer (0 to
    // 11, t, e); null when it's neither. "b" after a letter is a flat; a
    // capital E is the note, a small e is 11.
    function readPc(token) {
        const text = String(token ?? "").trim();
        if (/^(1[01]|[0-9])$/.test(text)) return Number(text);
        if (text === "t") return 10;
        if (text === "e") return 11;
        const match = /^([A-Ga-g])(#{1,2}|b{1,2}|♯|♭|\u{1D12A}|\u{1D12B})?$/u.exec(text);
        if (!match) return null;
        const alter = { "": 0, "#": 1, "##": 2, b: -1, bb: -2, "♯": 1, "♭": -1, "\u{1D12A}": 2, "\u{1D12B}": -2 }[match[2] ?? ""];
        return modulo(M.pitchClass(match[1].toUpperCase()) + alter, 12);
    }

    // Notes as typed: separated by spaces or commas, or twelve digits run
    // together (0t3e…). Returns { pcs, bad } with the tokens not understood.
    function readPcs(text) {
        const raw = String(text ?? "").trim();
        const tokens = /^[0-9te]{2,}$/.test(raw) && !/1[01]/.test(raw) ? [...raw] : raw.split(/[\s,]+/).filter(Boolean);
        const pcs = [], bad = [];
        tokens.forEach(token => {
            const pc = readPc(token);
            if (pc === null) bad.push(token);
            else pcs.push(pc);
        });
        return { pcs, bad };
    }

    // ---- Twelve-tone rows

    // Names in a list: "D", "D and A", "D, E♭ and A".
    const listed = names => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

    // A row: each of the twelve pitch classes once. Returns { row, problem,
    // used, missing, repeated }: the row as pitch classes (null until it's
    // one), what's wrong with it in words, and, as pitch classes, the notes
    // written so far, those still missing and those written more than once.
    function readRow(input) {
        const { pcs, bad } = Array.isArray(input) ? { pcs: input.map(Number), bad: [] } : readPcs(input);
        const written = pcs.filter(Number.isInteger).map(pc => modulo(pc, 12));
        const used = Object.freeze(sortedPcs(written));
        const missing = Object.freeze([...Array(12).keys()].filter(pc => !used.includes(pc)));
        const repeated = Object.freeze(sortedPcs(written.filter((pc, index) => written.indexOf(pc) !== index)));
        const result = (row, problem) => ({ row, problem, used, missing, repeated });
        if (bad.length) return result(null, `${bad[0]} isn't a note or a number from 0 to 11.`);
        if (written.length !== pcs.length) return result(null, "A row is made of notes.");
        const names = list => listed(list.map(pc => M.PLAIN_NAMES[pc]));
        if (repeated.length) return result(null, `${names(repeated)} ${repeated.length === 1 ? "comes" : "come"} twice; a row has each note once.`);
        if (written.length !== 12) return result(null, `${written.length} of the 12 notes: ${names(missing)} still ${missing.length === 1 ? "missing" : "to come"}.`);
        return result(Object.freeze(written), "");
    }

    // A row at random: random() as Math.random, so tests can choose.
    function randomRow(random = Math.random) {
        const row = [...Array(12).keys()];
        for (let at = 11; at > 0; at--) {
            const other = Math.floor(random() * (at + 1));
            [row[at], row[other]] = [row[other], row[at]];
        }
        return Object.freeze(row);
    }

    // The matrix: the row along the top (P0), its inversion down the left
    // (I0), each line a transposition. Forms are numbered from the row's own
    // first note (P0 is the row as written), the usual teaching matrix.
    // cells[r][c]; prime[r] is line r's P number (its R reads it backward),
    // inversion[c] column c's I number (RI from the bottom up).
    function rowMatrix(row) {
        if (!readRow(row).row) return null;
        const first = row[0];
        const down = row.map(pc => modulo(2 * first - pc, 12));
        const cells = down.map(start => Object.freeze(row.map(pc => modulo(pc + start - first, 12))));
        return Object.freeze({
            row: Object.freeze([...row]),
            cells: Object.freeze(cells),
            prime: Object.freeze(down.map(start => modulo(start - first, 12))),
            inversion: Object.freeze(row.map(pc => modulo(pc - first, 12)))
        });
    }

    // One form of the row: kind P, I, R or RI, at a number from 0 to 11.
    function rowForm(row, kind, number) {
        if (!readRow(row).row || !["P", "I", "R", "RI"].includes(kind)) return null;
        const n = modulo(number, 12);
        const prime = row.map(pc => modulo(pc + n, 12));
        const inverted = row.map(pc => modulo(2 * row[0] - pc + n, 12));
        const form = kind === "P" ? prime : kind === "I" ? inverted : kind === "R" ? [...prime].reverse() : [...inverted].reverse();
        return Object.freeze(form);
    }

    // ---- Pitch-class sets

    // Rahn's comparison, used for both normal and prime form: the smaller
    // span, then the smaller distance from the first to the next-to-last, and
    // so on leftward.
    function morePacked(a, b) {
        for (let at = a.length - 1; at > 0; at--) {
            const da = modulo(a[at] - a[0], 12), db = modulo(b[at] - b[0], 12);
            if (da !== db) return da < db;
        }
        return a[0] < b[0];
    }

    // The set in normal form: its most packed rotation, as pitch classes.
    function normalForm(pcs) {
        const set = sortedPcs(pcs);
        if (set.length < 2) return Object.freeze(set);
        let best = null;
        for (let at = 0; at < set.length; at++) {
            const rotation = [...set.slice(at), ...set.slice(0, at)];
            if (!best || morePacked(rotation, best)) best = rotation;
        }
        return Object.freeze(best);
    }

    const fromZero = list => list.map(pc => modulo(pc - list[0], 12));
    const invert = pcs => pcs.map(pc => modulo(-pc, 12));

    // The prime form (Rahn): the set or its inversion, whichever is more
    // packed, in normal form moved to start on 0.
    function primeForm(pcs) {
        const set = sortedPcs(pcs);
        if (!set.length) return Object.freeze([]);
        const up = fromZero(normalForm(set));
        const down = fromZero(normalForm(invert(set)));
        return Object.freeze(morePacked(down, up) && down.join() !== up.join() ? down : up);
    }

    // How often each interval class (1 to 6) comes between the set's notes.
    function intervalVector(pcs) {
        const set = sortedPcs(pcs);
        const vector = [0, 0, 0, 0, 0, 0];
        for (let a = 0; a < set.length; a++) {
            for (let b = a + 1; b < set.length; b++) {
                const ic = Math.min(modulo(set[b] - set[a], 12), modulo(set[a] - set[b], 12));
                vector[ic - 1] += 1;
            }
        }
        return Object.freeze(vector);
    }

    const primeKey = pcs => primeForm(pcs).map(pcDigit).join("");

    // Forte's names for the set classes of three to six notes, each given by
    // its prime form as Forte wrote it (a few differ from Rahn's, as 5-20's
    // 01378 is Rahn's 01568; the key is worked out, so either reads the same). Seven to nine notes take the
    // number of their complement (7-35 is 5-35's), and two the interval class.
    const FORTE_LISTS = {
        3: "012 013 014 015 016 024 025 026 027 036 037 048",
        4: "0123 0124 0134 0125 0126 0127 0145 0156 0167 0235 0135 0236 0136 0237 Z0146 0157 0347 0147 0148 0158 0246 0247 0257 0248 0268 0358 0258 0369 Z0137",
        5: "01234 01235 01245 01236 01237 01256 01267 02346 01246 01346 02347 Z01356 01248 01257 01268 01347 Z01348 Z01457 01367 01568 01458 01478 02357 01357 02358 02458 01358 02368 01368 01468 01369 01469 02468 02469 02479 Z01247 Z03458 Z01258",
        6: "012345 012346 Z012356 Z012456 012367 Z012567 012678 023457 012357 Z013457 Z012457 Z012467 Z013467 013458 012458 014568 Z012478 012578 Z013478 014589 023468 012468 Z023568 Z013468 Z013568 Z013578 013469 Z013569 Z013689 013679 013589 024579 023579 013579 02468t Z012347 Z012348 Z012378 Z023458 Z012358 Z012368 Z012369 Z012568 Z012569 Z023469 Z012469 Z012479 Z012579 Z013479 Z014679"
    };
    const FORTE = new Map();
    const FORTE_PRIMES = [];
    const digitsOf = text => [...text].map(digit => PC_DIGITS.indexOf(digit));
    for (const [size, list] of Object.entries(FORTE_LISTS)) {
        list.split(" ").forEach((entry, index) => {
            const z = entry.startsWith("Z");
            const pcs = digitsOf(z ? entry.slice(1) : entry);
            const name = `${size}-${z ? "Z" : ""}${index + 1}`;
            FORTE.set(primeKey(pcs), name);
            FORTE_PRIMES.push({ name, pcs });
        });
    }
    // The complements: 7-, 8- and 9- note classes share their numbers.
    for (const { name, pcs } of [...FORTE_PRIMES]) {
        const size = pcs.length;
        if (size === 6) continue;
        const rest = [...Array(12).keys()].filter(pc => !pcs.includes(pc));
        FORTE.set(primeKey(rest), `${12 - size}${name.slice(1)}`);
    }
    for (let ic = 1; ic <= 6; ic++) {
        FORTE.set(primeKey([0, ic]), `2-${ic}`);
        FORTE.set(primeKey([...Array(12).keys()].filter(pc => pc !== 0 && pc !== ic)), `10-${ic}`);
    }
    FORTE.set(primeKey([0]), "1-1");
    FORTE.set(primeKey([...Array(11).keys()]), "11-1");
    FORTE.set(primeKey([...Array(12).keys()]), "12-1");

    // Common names for some set classes, as a set is heard in tonal music.
    const KNOWN = Object.freeze({
        "3-10": "diminished triad", "3-11": "major or minor triad", "3-12": "augmented triad",
        "4-19": "minor-major seventh", "4-20": "major seventh", "4-26": "minor seventh",
        "4-27": "dominant or half-diminished seventh", "4-28": "diminished seventh", "4-25": "French sixth",
        "4-Z15": "all-interval tetrachord", "4-Z29": "all-interval tetrachord",
        "5-35": "pentatonic", "6-20": "hexatonic", "6-35": "whole tone", "6-Z17": "all-trichord hexachord",
        "7-34": "acoustic (melodic minor)", "7-35": "diatonic", "8-28": "octatonic", "12-1": "the aggregate"
    });

    const transposeSet = (pcs, n) => sortedPcs(pcs.map(pc => pc + n));
    const invertSet = (pcs, n) => sortedPcs(pcs.map(pc => n - pc));

    // Everything about a set: its notes, normal and prime form, Forte's name
    // (and a common one), its interval vector, the set class sharing it (the
    // Z-related one), its complement's name, and its symmetry (how many
    // transpositions and inversions map it onto itself, the identity counted).
    function setClass(pcs) {
        const set = sortedPcs(pcs);
        if (!set.length) return null;
        const prime = primeForm(set);
        const forte = FORTE.get(prime.map(pcDigit).join("")) ?? "";
        const vector = intervalVector(set);
        let z = "";
        if (forte.includes("Z")) {
            for (const [key, name] of FORTE) {
                if (name !== forte && name.startsWith(`${set.length}-Z`) && intervalVector(digitsOf(key)).join() === vector.join()) { z = name; break; }
            }
        }
        const rest = [...Array(12).keys()].filter(pc => !set.includes(pc));
        const same = other => other.join() === set.join();
        let transpositions = 0, inversions = 0;
        for (let n = 0; n < 12; n++) {
            if (same(transposeSet(set, n))) transpositions += 1;
            if (same(invertSet(set, n))) inversions += 1;
        }
        return Object.freeze({
            pcs: Object.freeze(set),
            normal: normalForm(set),
            prime,
            forte,
            known: KNOWN[forte] ?? "",
            vector,
            z,
            complement: rest.length ? FORTE.get(primeKey(rest)) ?? "" : "",
            transpositions,
            inversions
        });
    }

    // The set moved: Tn, or TnI (inverted, then moved).
    function transformSet(pcs, n, inverted = false) {
        return Object.freeze(inverted ? invertSet(pcs, n) : transposeSet(pcs, n));
    }

    // ---- Negative harmony

    // A pitch class reflected across the axis between the tonic and its
    // dominant: the tonic becomes the dominant, the major third the minor.
    const negativePc = (pc, tonicPc) => modulo(2 * tonicPc + 7 - pc, 12);

    const scalePcs = (root, scale) => M.scaleNotes(root, scale).map(note => M.pitchClass(note.name));

    // The key a key reflects into: its notes reflected, on the same tonic.
    // Major becomes natural minor, Dorian Mixolydian; null when no scale holds
    // the notes (Locrian loses its tonic).
    function negativeKey(key) {
        if (!H.isKey(key)) return null;
        const tonic = M.pitchClass(key.root);
        const want = sortedPcs(scalePcs(key.root, key.scale).map(pc => negativePc(pc, tonic))).join();
        const scale = Object.keys(M.SCALES).find(id => sortedPcs(scalePcs(key.root, id)).join() === want);
        return scale ? Object.freeze({ root: key.root, scale }) : null;
    }

    // A chord's name for its notes reflected. The reflection turns a chord
    // upside down, so its fifth becomes the new root (G7 in C, G B D F,
    // becomes F A♭ C D, Fm6). Spelled from the reflected key where it can be;
    // a slash chord keeps its bass reflected. "" when nothing names it.
    function negativeChord(name, key) {
        const chord = H.parseChord(name);
        if (!chord || !H.isKey(key)) return "";
        const tonic = M.pitchClass(key.root);
        // A slash chord's bass that isn't a chord tone (degree 0) is put back after.
        const written = H.chordTones(name).filter(tone => tone.degree !== 0);
        const tones = written.map(tone => negativePc(tone.pc, tonic));
        // The new root is the old fifth reflected (C dim's G♭ becomes C♯);
        // without a fifth, the old root reflected.
        const fifth = written.find(tone => tone.degree === 5) ?? written[0];
        const rootPc = negativePc(fifth.pc, tonic);
        const found = M.findChords([rootPc, ...tones.filter(pc => pc !== rootPc)]).filter(each => H.parseChord(each.name));
        const pick = found.find(each => M.pitchClass(each.root) === rootPc && !each.name.includes("/")) ?? found[0];
        if (!pick) return "";
        const reflected = negativeKey(key) ?? key;
        const spelled = pc => scalePcs(reflected.root, reflected.scale).includes(pc)
            ? M.scaleNotes(reflected.root, reflected.scale).find(note => M.pitchClass(note.name) === pc).name
            : M.PLAIN_NAMES[pc];
        const parsed = H.parseChord(pick.name);
        const root = spelled(M.pitchClass(parsed.root));
        let result = root + parsed.suffix;
        const bassPc = chord.bass ? negativePc(M.pitchClass(chord.bass), tonic) : null;
        if (bassPc !== null && bassPc !== M.pitchClass(parsed.root)) result += `/${spelled(bassPc)}`;
        return H.parseChord(result) ? result : pick.name;
    }

    // A chart reflected: every chord, and the key when a scale holds its
    // reflection. Voicings written for chords are let go, as they'd no longer
    // be the chords'. Returns { chart, keyKept, dropped } or null.
    function negativeChart(chart) {
        const key = { root: chart?.root, scale: chart?.scale };
        if (!H.isKey(key)) return null;
        const reflectedKey = negativeKey(key);
        let dropped = 0;
        const move = token => {
            if (token === H.REPEAT_BAR) return token;
            if (H.slotVoicing(token)) dropped += 1;
            const name = H.slotChord(token);
            return negativeChord(name, key) || name;
        };
        const sections = chart.sections.map(section => ({ ...section, bars: section.bars.map(bar => bar.map(move)) }));
        return { chart: { ...chart, scale: reflectedKey?.scale ?? chart.scale, sections }, keyKept: !reflectedKey, dropped };
    }

    // ---- The tab's kept settings: the row as typed, how notes are written,
    // the set picked, negative harmony's key, and which of the two shows
    // where only one fits.
    const ROW_TEXT_MAX = 80;
    const SETTINGS_DEFAULTS = Object.freeze({ row: "", show: "names", set: Object.freeze([]), root: "C", scale: "major", sevenths: false, side: "set" });
    function parseSettings(text) {
        const settings = { ...SETTINGS_DEFAULTS, set: [] };
        let stored = null;
        try { stored = JSON.parse(text ?? "null"); } catch { stored = null; }
        if (!stored || typeof stored !== "object") return settings;
        if (typeof stored.row === "string") settings.row = stored.row.slice(0, ROW_TEXT_MAX);
        if (stored.show === "numbers") settings.show = "numbers";
        if (Array.isArray(stored.set)) settings.set = sortedPcs(stored.set.filter(pc => Number.isInteger(pc) && pc >= 0 && pc < 12));
        if (M.ROOTS.includes(stored.root)) settings.root = stored.root;
        if (stored.scale === "minor") settings.scale = "minor";
        if (stored.sevenths === true) settings.sevenths = true;
        if (stored.side === "negative") settings.side = "negative";
        return settings;
    }

    return Object.freeze({
        ROW_TEXT_MAX, SETTINGS_DEFAULTS, parseSettings,
        PC_DIGITS, pcDigit, readPc, readPcs,
        readRow, randomRow, rowMatrix, rowForm,
        normalForm, primeForm, intervalVector, setClass, transformSet, FORTE_PRIMES, KNOWN,
        negativePc, negativeKey, negativeChord, negativeChart
    });
})();
