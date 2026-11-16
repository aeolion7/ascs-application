"use strict";
// Notation (2.5.0): the small core the Conservatory's counterpoint is written
// in. Pitches as written (a diatonic step and an alteration), keys, meters,
// bars, what sounds at each moment, which accidentals show, engraving as a
// list of lines and glyphs in Bravura Text, and MusicXML. Pure: no page, no
// sound; the views draw what this lays out.
globalThis.MaestroNotation = (() => {
    const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
    const NATURAL = [0, 2, 4, 5, 7, 9, 11];
    const SIGN = { "-2": "\uD834\uDD2B", "-1": "\u266D", "0": "", "1": "\u266F", "2": "\uD834\uDD2A" };
    const modulo = (value, base) => ((value % base) + base) % base;

    // ---- Pitches

    // A pitch as written: its step (C0 is 0, each letter one more, so C4 is
    // 28) and its alteration (-2 to 2).
    const LOWEST_STEP = 5, HIGHEST_STEP = 56;   // A0 to C8, the piano's range
    const pitch = (step, alter = 0) => Object.freeze({ step, alter });
    const letterOf = step => modulo(step, 7);
    const octaveOf = step => Math.floor(step / 7);
    const isPitch = value => value !== null && typeof value === "object" && Number.isInteger(value.step) && Number.isInteger(value.alter)
        && value.step >= LOWEST_STEP && value.step <= HIGHEST_STEP && value.alter >= -2 && value.alter <= 2;

    function midiOf(p) {
        return 12 * (octaveOf(p.step) + 1) + NATURAL[letterOf(p.step)] + p.alter;
    }

    // "F#4", "Bb3", "F\u266F4", "Ebb2", "Cx5" or "D\u266E4"; null if it isn't one.
    function parsePitch(text) {
        const match = /^([A-Ga-g])(\u{1D12A}|\u{1D12B}|##|bb|x|#|b|\u266F|\u266D|\u266E|n)?(-?\d)$/u.exec(String(text ?? "").trim());
        if (!match) return null;
        const alter = { "\u{1D12A}": 2, "##": 2, x: 2, "\u{1D12B}": -2, bb: -2, "#": 1, "\u266F": 1, b: -1, "\u266D": -1, "\u266E": 0, n: 0 }[match[2] ?? "n"];
        const p = pitch(LETTERS.indexOf(match[1].toUpperCase()) + 7 * Number(match[3]), alter);
        return isPitch(p) ? p : null;
    }

    const pitchName = p => `${LETTERS[letterOf(p.step)]}${SIGN[String(p.alter)]}${octaveOf(p.step)}`;
    const pitchLetterName = p => `${LETTERS[letterOf(p.step)]}${SIGN[String(p.alter)]}`;

    // ---- Keys

    // A key as the number of fifths in its signature: sharps above 0, flats
    // below. A major key's tonic letter moves four letters a fifth; each mode
    // stands some fifths from its major (minor three down) and its tonic some
    // letters up (2.5.0: the church modes, for the cantus firmi).
    const FIFTHS_OF_LETTER = [0, 2, 4, -1, 1, 3, 5];
    const MODES = Object.freeze({
        major: { fifths: 0, degree: 0 }, minor: { fifths: -3, degree: 5 },
        ionian: { fifths: 0, degree: 0 }, dorian: { fifths: -2, degree: 1 }, phrygian: { fifths: -4, degree: 2 },
        lydian: { fifths: 1, degree: 3 }, mixolydian: { fifths: -1, degree: 4 }, aeolian: { fifths: -3, degree: 5 }
    });
    function keyFifths(root, mode = "major") {
        const parsed = /^([A-G])(\u266F|\u266D|#|b)?$/.exec(String(root ?? ""));
        if (!parsed || !Object.hasOwn(MODES, mode)) return null;
        const alter = { "\u266F": 1, "#": 1, "\u266D": -1, b: -1 }[parsed[2]] ?? 0;
        const fifths = FIFTHS_OF_LETTER[LETTERS.indexOf(parsed[1])] + 7 * alter + MODES[mode].fifths;
        return fifths >= -7 && fifths <= 7 ? fifths : null;
    }

    const tonicLetter = (fifths, mode = "major") => modulo(modulo(4 * fifths, 7) + (MODES[mode] ?? MODES.major).degree, 7);
    function keyTonic(fifths, mode = "major") {
        const letter = tonicLetter(fifths, mode);
        return pitchLetterName(pitch(letter, keyAlter(letter, fifths)));
    }

    // The signature's alteration of a letter (0 to 6, C to B).
    const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];   // F C G D A E B
    const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];    // B E A D G C F
    function keyAlter(letter, fifths) {
        if (fifths > 0) return SHARP_ORDER.indexOf(letter) < fifths ? 1 : 0;
        if (fifths < 0) return FLAT_ORDER.indexOf(letter) < -fifths ? -1 : 0;
        return 0;
    }

    // Where a signature's sharps or flats sit, in half spaces up from the
    // bottom line: the treble's as printed, the bass's a third lower, the
    // alto's a step lower; the tenor's flats a step higher, its sharps in
    // their own order, low, so the first stays on the staff (2.7.0). A clef
    // with an 8 under it places them as the clef without.
    const SHARP_POSITIONS = [8, 5, 9, 6, 3, 7, 4];
    const FLAT_POSITIONS = [4, 7, 3, 6, 2, 5, 1];
    const TENOR_SHARPS = [2, 6, 3, 7, 4, 8, 5];
    const SIGNATURE_SHIFT = Object.freeze({ treble: 0, treble8: 0, bass: -2, bass8: -2, alto: -1, tenor: 1 });
    function signature(fifths, clef = "treble") {
        const shift = SIGNATURE_SHIFT[clef] ?? 0;
        const count = Math.abs(fifths);
        const order = fifths > 0 ? SHARP_ORDER : FLAT_ORDER;
        const positions = fifths > 0 && clef === "tenor" ? TENOR_SHARPS : (fifths > 0 ? SHARP_POSITIONS : FLAT_POSITIONS).map(at => at + shift);
        return Array.from({ length: count }, (_, index) => ({ letter: order[index], alter: fifths > 0 ? 1 : -1, position: positions[index] }));
    }

    // A MIDI note spelled for a key: as the key has it, then (in minor) as a
    // raised sixth or seventh, then natural, then a sharp in sharp keys and C,
    // a flat in flat keys.
    function pitchFromMidi(midi, fifths = 0, mode = "major") {
        const pc = modulo(midi, 12);
        const tonic = tonicLetter(fifths, mode);
        const raised = ["minor", "aeolian"].includes(mode) ? [modulo(tonic + 5, 7), modulo(tonic + 6, 7)]
            : ["dorian", "mixolydian"].includes(mode) ? [modulo(tonic + 6, 7)] : [];
        const candidates = [];
        for (let letter = 0; letter < 7; letter++) {
            let alter = modulo(pc - NATURAL[letter] + 6, 12) - 6;
            if (alter < -2 || alter > 2) continue;
            const key = keyAlter(letter, fifths);
            const rank = alter === key ? 0
                : raised.includes(letter) && alter === key + 1 ? 1
                : alter === 0 ? 2
                : Math.abs(alter) === 1 && (fifths >= 0 ? alter > 0 : alter < 0) ? 3
                : Math.abs(alter) === 1 ? 4 : 5;
            candidates.push({ letter, alter, rank });
        }
        candidates.sort((a, b) => a.rank - b.rank);
        const { letter, alter } = candidates[0];
        const octave = Math.round((midi - alter - NATURAL[letter]) / 12) - 1;
        return pitch(letter + 7 * octave, alter);
    }

    // The interval from one pitch to another, lower first: its number (1 a
    // unison, 8 an octave, 10 a tenth), its simple number, its semitones and
    // its quality (P, M, m, A, d; AA and dd beyond). Written order decides
    // which is lower when the sound doesn't (B\u266F3 and C4).
    const MAJOR_SEMIS = [0, 2, 4, 5, 7, 9, 11];
    const PERFECT = new Set([0, 3, 4]);
    function interval(a, b) {
        let [low, high] = midiOf(a) < midiOf(b) || (midiOf(a) === midiOf(b) && a.step <= b.step) ? [a, b] : [b, a];
        if (high.step < low.step) [low, high] = [high, low];
        const generic = high.step - low.step;
        const semis = midiOf(high) - midiOf(low);
        const simpleSteps = generic % 7;
        const offset = semis - (MAJOR_SEMIS[simpleSteps] + 12 * Math.floor(generic / 7));
        let quality;
        if (PERFECT.has(simpleSteps)) quality = offset === 0 ? "P" : offset > 0 ? "A".repeat(offset) : "d".repeat(-offset);
        else quality = offset === 0 ? "M" : offset === -1 ? "m" : offset > 0 ? "A".repeat(offset) : "d".repeat(-offset - 1);
        return Object.freeze({ number: generic + 1, simple: simpleSteps + 1, semis, quality, name: `${quality}${generic + 1}`, simpleName: `${quality}${simpleSteps + 1}` });
    }

    // ---- Time

    // Durations in eighth notes: whole, half, quarter, eighth, and since 2.6.0
    // sixteenth, thirty-second and sixty-fourth (s, t, f), as halves, quarters
    // and eighths of an eighth, which are exact as numbers. Dotted is half as
    // long again; a sixty-fourth isn't dotted.
    const DURATIONS = Object.freeze({ w: 8, h: 4, q: 2, e: 1, s: 0.5, t: 0.25, f: 0.125 });
    const DURATION_NAMES = Object.freeze({ w: "whole", h: "half", q: "quarter", e: "eighth", s: "sixteenth", t: "thirty-second", f: "sixty-fourth" });
    // The beams (or flags) each value has.
    const BEAMS = Object.freeze({ e: 1, s: 2, t: 3, f: 4 });
    const lengthOf = note => DURATIONS[note.d] * (note.dot ? 1.5 : 1);
    const barLength = meter => meter.beats * 8 / meter.unit;

    // A note's pitches, low to high: its own, then a chord's others above it
    // (2.7.0: `more`, absent on a single note). None for a rest.
    const CHORD_MAX = 8;
    const pitchesOf = note => (note.p ? [note.p, ...(note.more ?? [])] : []);
    const midisOf = note => pitchesOf(note).map(midiOf);
    // Held by a tie: the note before is tied and sounds the same pitches.
    const heldBy = (previous, note) => Boolean(previous?.tie && previous.p && note.p && midisOf(previous).join() === midisOf(note).join());

    // The notes of a voice in bars: each bar's notes with their onsets, and
    // any that run over a bar line (written as two tied notes instead).
    function bars(notes, meter) {
        const size = barLength(meter);
        const result = [];
        const problems = [];
        let time = 0;
        notes.forEach((note, index) => {
            const bar = Math.floor(time / size);
            while (result.length <= bar) result.push([]);
            result[bar].push({ note, index, onset: time });
            const end = time + lengthOf(note);
            if (Math.floor((end - 1e-9) / size) !== bar) problems.push({ index, bar, kind: "crosses" });
            time = end;
        });
        return { bars: result, problems, length: time };
    }

    // Every voice, in score order (staves top down, each staff's voices in turn).
    const voicesOf = score => score.staves.flatMap((staff, staffIndex) => staff.voices.map((voice, voiceIndex) => ({ ...voice, staff: staffIndex, voiceIndex, clef: staff.clef })));

    // A voice's notes with their onsets, and whether each is struck or held
    // over from the note before by a tie.
    function timed(notes) {
        let time = 0;
        return notes.map((note, index) => {
            const held = heldBy(notes[index - 1], note);
            const entry = { note, index, onset: time, length: lengthOf(note), held };
            time += entry.length;
            return entry;
        });
    }

    // What sounds at each moment a note starts in any voice: every voice's
    // note then (or null), and whether it was struck there.
    function slices(score) {
        const voices = voicesOf(score).map(voice => timed(voice.notes));
        const times = [...new Set(voices.flatMap(entries => entries.map(entry => entry.onset)))].sort((a, b) => a - b);
        return times.map(time => ({
            time,
            notes: voices.map((entries, voice) => {
                const entry = entries.find(each => each.onset <= time && time < each.onset + each.length);
                return entry ? { voice, index: entry.index, pitch: entry.note.p ?? null, struck: entry.onset === time && !entry.held } : { voice, index: -1, pitch: null, struck: false };
            })
        }));
    }

    // The voice as it sounds: a note per struck pitch, ties joined, in eighths.
    // A chord's pitches each sound (2.7.0); a tie holds each that the next has.
    function soundingEvents(notes) {
        const events = [];
        let before = new Map();     // the last entry's events, by MIDI number, when it's tied
        for (const entry of timed(notes)) {
            const now = new Map();
            for (const midi of midisOf(entry.note)) {
                const held = before.get(midi);
                if (held) {
                    held.length += entry.length;
                    now.set(midi, held);
                } else {
                    const event = { start: entry.onset, length: entry.length, midi, index: entry.index };
                    events.push(event);
                    now.set(midi, event);
                }
            }
            before = entry.note.tie ? now : new Map();
        }
        return events;
    }

    // Which accidental each pitch of each note shows (its alteration, 0 for a
    // natural), or null: the key's, or one already shown on that line or
    // space in the bar, isn't shown again; a note held over by a tie shows
    // none. A list a note, a pitch at a time (2.7.0: a chord's every pitch).
    function chordAccidentals(notes, meter, fifths) {
        const size = barLength(meter);
        const shown = notes.map(note => pitchesOf(note).map(() => null));
        let current = new Map();
        let bar = -1;
        for (const entry of timed(notes)) {
            const thisBar = Math.floor(entry.onset / size);
            if (thisBar !== bar) {
                bar = thisBar;
                current = new Map();
            }
            if (entry.held) continue;
            pitchesOf(entry.note).forEach((p, at) => {
                const before = current.has(p.step) ? current.get(p.step) : keyAlter(letterOf(p.step), fifths);
                if (p.alter !== before) {
                    shown[entry.index][at] = p.alter;
                    current.set(p.step, p.alter);
                }
            });
        }
        return shown;
    }

    // The accidental each note's own pitch shows, as before chords.
    const shownAccidentals = (notes, meter, fifths) => chordAccidentals(notes, meter, fifths).map(list => list[0] ?? null);

    // ---- A score as kept

    // A staff's clef (2.7.0: alto and tenor, and treble and bass with an 8
    // under them, which sound an octave below where they're written). Notes
    // are kept as they sound, whatever the clef.
    const CLEFS = Object.freeze(["treble", "treble8", "alto", "tenor", "bass", "bass8"]);
    const METER_UNITS = [2, 4, 8];
    const BEATS_MAX = 12;

    // How a bar's eighths are beamed: in groups of the meter's own (2.7.0: as
    // the metronome counts 7/8, 2+2+3 or another), else a beat each in
    // quarters and halves, and threes in eighths (twos and a three when they
    // don't divide).
    function meterGroups(meter) {
        if (meter.groups) return meter.groups.map(group => group * 8 / meter.unit);
        if (meter.unit !== 8) return Array(meter.beats * (meter.unit === 2 ? 2 : 1)).fill(2);
        if (meter.beats % 3 === 0) return Array(meter.beats / 3).fill(3);
        if (meter.beats < 3) return [meter.beats];
        return meter.beats % 2 ? [...Array((meter.beats - 3) / 2).fill(2), 3] : Array(meter.beats / 2).fill(2);
    }
    const NOTES_MAX = 512, TITLE_MAX = 60, NAME_MAX = 24;
    const cleanText = (text, max) => [...String(text ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim()].slice(0, max).join("").trim();

    // A score as the page keeps it, or null: a title; a key (fifths, major or
    // minor); a meter; one or two staves, each a clef and one or two voices of
    // notes. Every voice's bars are whole except perhaps its last. A score
    // made from a song's chart (2.7.0) may hold more notes than one kept.
    function cleanScore(raw, { notesMax = NOTES_MAX } = {}) {
        if (!raw || typeof raw !== "object") return null;
        const fifths = raw.key?.fifths;
        const mode = raw.key?.mode;
        const beats = raw.meter?.beats;
        const unit = raw.meter?.unit;
        if (!Number.isInteger(fifths) || fifths < -7 || fifths > 7 || !Object.hasOwn(MODES, mode)) return null;
        if (!Number.isInteger(beats) || beats < 1 || beats > BEATS_MAX || !METER_UNITS.includes(unit)) return null;
        // A meter's own groups (2.7.0), when given, add up to its beats.
        const groups = raw.meter.groups;
        if (groups !== undefined && (!Array.isArray(groups) || !groups.length || groups.some(group => !Number.isInteger(group) || group < 1) || groups.reduce((sum, group) => sum + group, 0) !== beats)) return null;
        if (!Array.isArray(raw.staves) || raw.staves.length < 1 || raw.staves.length > 2) return null;
        const meter = Object.freeze({ beats, unit, ...(groups ? { groups: Object.freeze([...groups]) } : {}) });
        const staves = [];
        for (const staff of raw.staves) {
            if (!CLEFS.includes(staff?.clef) || !Array.isArray(staff.voices) || staff.voices.length < 1 || staff.voices.length > 2) return null;
            const voices = [];
            for (const voice of staff.voices) {
                if (!Array.isArray(voice?.notes) || voice.notes.length > notesMax) return null;
                const notes = [];
                for (const note of voice.notes) {
                    if (!note || !Object.hasOwn(DURATIONS, note.d)) return null;
                    if (note.dot && note.d === "f") return null;
                    if (note.p !== null && note.p !== undefined && !isPitch(note.p)) return null;
                    const p = note.p ? pitch(note.p.step, note.p.alter) : null;
                    // A chord (2.7.0): its other pitches, each on a line or space of its own.
                    let more = null;
                    if (note.more !== undefined && note.more !== null) {
                        if (!p || !Array.isArray(note.more) || note.more.length + 1 > CHORD_MAX || !note.more.every(isPitch)) return null;
                        const all = [p, ...note.more.map(each => pitch(each.step, each.alter))].sort((a, b) => a.step - b.step);
                        if (new Set(all.map(each => each.step)).size !== all.length) return null;
                        if (all.length > 1) more = all;
                    }
                    const clean = more
                        ? { p: more[0], more: Object.freeze(more.slice(1)), d: note.d, dot: Boolean(note.dot), tie: Boolean(note.tie) }
                        : { p, d: note.d, dot: Boolean(note.dot), tie: Boolean(note.tie && p) };
                    notes.push(Object.freeze(clean));
                }
                if (bars(notes, meter).problems.length) return null;
                voices.push(Object.freeze({ name: cleanText(voice.name, NAME_MAX), notes: Object.freeze(notes) }));
            }
            staves.push(Object.freeze({ clef: staff.clef, voices: Object.freeze(voices) }));
        }
        return Object.freeze({ title: cleanText(raw.title, TITLE_MAX), key: Object.freeze({ fifths, mode }), meter, staves: Object.freeze(staves) });
    }

    // ---- Engraving

    // Lengths in staff spaces times SPACE; Bravura Text is set at five spaces
    // to the em, and draws a glyph centered two spaces above its baseline.
    const SPACE = 10;
    const FONT = 5 * SPACE;
    const LIFT = 2 * SPACE;
    const STAFF_GAP = 11 * SPACE;            // bottom line to bottom line, in a grand staff
    const GLYPHS = Object.freeze({
        treble: "\uE050", treble8: "\uE052", alto: "\uE05C", tenor: "\uE05C", bass: "\uE062", bass8: "\uE064", brace: "\uE000",
        whole: "\uE0A2", half: "\uE0A3", black: "\uE0A4",
        flagUp: "\uE240", flagDown: "\uE241", dot: "\uE1E7",
        // Flags by beams: an eighth's, a sixteenth's, a thirty-second's, a sixty-fourth's.
        flagsUp: ["", "\uE240", "\uE242", "\uE244", "\uE246"], flagsDown: ["", "\uE241", "\uE243", "\uE245", "\uE247"],
        restw: "\uE4E3", resth: "\uE4E4", restq: "\uE4E5", reste: "\uE4E6", rests: "\uE4E7", restt: "\uE4E8", restf: "\uE4E9",
        "-2": "\uE264", "-1": "\uE260", "0": "\uE261", "1": "\uE262", "2": "\uE263",
        digits: ["\uE080", "\uE081", "\uE082", "\uE083", "\uE084", "\uE085", "\uE086", "\uE087", "\uE088", "\uE089"]
    });
    const HEAD_WIDTH = Object.freeze({ w: 1.69 * SPACE, h: 1.18 * SPACE, q: 1.18 * SPACE, e: 1.18 * SPACE, s: 1.18 * SPACE, t: 1.18 * SPACE, f: 1.18 * SPACE });
    // Each beam (or flag) past the second lengthens a stem by this much.
    const BEAM_STEP = 0.75 * SPACE;
    const stemExtra = d => Math.max(0, (BEAMS[d] ?? 0) - 2) * BEAM_STEP;
    const STEM = 3.5 * SPACE;
    // The bottom line, as steps: E4 and G2, an octave lower with an 8 under
    // the clef, F3 under an alto clef, D3 under a tenor.
    const STAFF_BOTTOM = Object.freeze({ treble: 30, treble8: 23, alto: 24, tenor: 22, bass: 18, bass8: 11 });
    // A C clef sits on the line it names: an alto's the middle, a tenor's a line up.
    const CLEF_RAISE = Object.freeze({ tenor: 1 });
    const HEADER_CLEF = 4.5;                         // spaces from the system's left to what follows the clef

    // How much room a note's column takes, by the shortest note starting there
    // (anything shorter than an eighth, room enough for a head and its flag).
    const columnWidth = eighths => SPACE * (eighths >= 1 ? 2.4 + 1.5 * Math.log2(eighths) : 2.3);

    // Lays a score out in systems no wider than maxWidth (one long system if
    // none), with room (in units) left under each for what's written beneath. Returns { width, height, items, heads, columns, systems }: items
    // are { kind: "line" | "glyph" | "path" | "beam", ... } to draw; heads say
    // where each note is ({ voice, index, x, y }); columns where each moment is.
    // Justified, each system but the last is spread to maxWidth (the last
    // too when it's nearly full), its bars widened alike. headroom (2.7.0)
    // is room in units above each system's top staff, for words over it;
    // barPadding(bar), [before, after] in spaces, widens a bar at its edges,
    // for repeat signs; hideRest(voice, index) leaves a rest undrawn, for a
    // bar drawn with another sign.
    function engrave(score, { maxWidth = Infinity, room = 0, justify = false, headroom = 0, barPadding = null, hideRest = null } = {}) {
        const voices = voicesOf(score);
        const size = barLength(score.meter);
        const entries = voices.map(voice => timed(voice.notes));
        const shown = voices.map(voice => chordAccidentals(voice.notes, score.meter, score.key.fifths));
        const end = Math.max(size, ...entries.map(list => list.length ? list.at(-1).onset + list.at(-1).length : 0));
        const barCount = Math.ceil(end / size);
        const staffCount = score.staves.length;
        const voicesOnStaff = staff => voices.filter(voice => voice.staff === staff).length;

        // Each note as a chord (a single note a chord of one, 2.7.0): its
        // pitches' places on the staff, low to high; the stem's way (from the
        // note farthest from the middle line); which heads sit on the stem's
        // other side, a second against the head beside them; and each
        // accidental's column, the nearest first, top down, as close as they
        // clear each other.
        const layouts = voices.map((voice, v) => entries[v].map(entry => {
            const pitches = pitchesOf(entry.note);
            if (!pitches.length) return null;
            const positions = pitches.map(p => p.step - STAFF_BOTTOM[voice.clef]);
            const count = positions.length;
            const up = voicesOnStaff(voice.staff) > 1 ? voice.voiceIndex === 0 : positions[count - 1] - 4 < 4 - positions[0];
            const flipped = new Array(count).fill(false);
            if (up) for (let at = 1; at < count; at++) flipped[at] = positions[at] - positions[at - 1] === 1 && !flipped[at - 1];
            else for (let at = count - 2; at >= 0; at--) flipped[at] = positions[at + 1] - positions[at] === 1 && !flipped[at + 1];
            const alters = shown[v][entry.index];
            const column = new Array(count).fill(-1);
            const used = [];
            for (let at = count - 1; at >= 0; at--) {
                if (alters[at] === null) continue;
                let c = 0;
                while ((used[c] ?? []).some(other => Math.abs(other - positions[at]) < 6)) c++;
                (used[c] ??= []).push(positions[at]);
                column[at] = c;
            }
            return { positions, up, flipped, alters, column, columns: used.length, left: !up && flipped.some(Boolean), right: up && flipped.some(Boolean) };
        }));

        // Each moment's room: the shortest note there, room before it for
        // accidentals (and heads on a stem's left), and after for heads on its right.
        const moments = new Map();
        entries.forEach((list, voice) => list.forEach(entry => {
            const moment = moments.get(entry.onset) ?? { time: entry.onset, shortest: Infinity, lead: 0, trail: 0 };
            moment.shortest = Math.min(moment.shortest, entry.length);
            const layout = layouts[voice][entry.index];
            if (layout) {
                const headWidth = HEAD_WIDTH[entry.note.d];
                moment.lead = Math.max(moment.lead, (layout.columns ? 1.6 * SPACE + (layout.columns - 1) * 1.2 * SPACE : 0) + (layout.left ? headWidth : 0));
                if (layout.right) moment.trail = Math.max(moment.trail, headWidth);
            }
            moments.set(entry.onset, moment);
        }));
        for (let bar = 0; bar < barCount; bar++) if (!moments.has(bar * size)) moments.set(bar * size, { time: bar * size, shortest: size, lead: 0, trail: 0 });
        const ordered = [...moments.values()].sort((a, b) => a.time - b.time);

        // Bars as widths, then systems.
        // The clef from one space in (a treble clef is 2.7 spaces wide), then
        // the key and the time each 0.8 of a space clear of what's before.
        const header = signatureWidth => SPACE * HEADER_CLEF + signatureWidth;
        const keyWidth = Math.abs(score.key.fifths) * SPACE + (score.key.fifths ? SPACE : 0);
        // The time's widest number (12/8's 12) sets its room.
        const timeDigits = Math.max(String(score.meter.beats).length, String(score.meter.unit).length);
        const timeWidth = timeDigits * 1.8 * SPACE + 1.2 * SPACE;
        const barWidths = [];
        for (let bar = 0; bar < barCount; bar++) {
            const inBar = ordered.filter(moment => moment.time >= bar * size && moment.time < (bar + 1) * size);
            const [before, after] = barPadding?.(bar) ?? [0, 0];
            let width = SPACE * (1.2 + before);
            inBar.forEach((moment, index) => {
                const next = inBar[index + 1]?.time ?? (bar + 1) * size;
                moment.span = next - moment.time;
                moment.offset = width + moment.lead;
                width = moment.offset + columnWidth(Math.min(moment.span, moment.shortest)) + (moment.span > moment.shortest ? SPACE * 0.6 * Math.log2(moment.span / moment.shortest) : 0) + moment.trail;
            });
            width += SPACE * after;
            barWidths.push(width);
        }
        const systems = [];
        let current = null;
        for (let bar = 0; bar < barCount; bar++) {
            const lead = header(keyWidth) + (systems.length === 0 && !current ? timeWidth : 0);
            if (!current || (current.width + barWidths[bar] > maxWidth && current.bars.length)) {
                current = { bars: [], width: lead, lead, first: systems.length === 0 };
                systems.push(current);
            }
            current.bars.push(bar);
            current.width += barWidths[bar];
        }
        systems.forEach((system, index) => {
            const last = index === systems.length - 1;
            const spread = justify && Number.isFinite(maxWidth) && system.width < maxWidth && (!last || system.width >= 0.8 * maxWidth);
            system.stretch = spread ? (maxWidth - system.lead) / (system.width - system.lead) : 1;
            if (spread) system.width = maxWidth;
        });

        const items = [];
        const heads = [];
        const columns = [];
        const barSpans = [];     // each bar's left and right edge on its line (2.6.0)
        const rests = [];        // each unwritten note's rest, where it's drawn (2.6.0)
        const line = (x1, y1, x2, y2, kind) => items.push({ kind: "line", x1, y1, x2, y2, class: kind });
        const glyph = (character, x, y, kind = "glyph", extra = {}) => items.push({ kind: "glyph", text: character, x, y, class: kind, ...extra });
        const braceRoom = staffCount > 1 ? 2 * SPACE : 0;
        const width = braceRoom + Math.max(...systems.map(system => system.width)) + SPACE;
        let top = 0;
        const placed = [];   // per voice: entry index -> { x, y, up, system, headWidth }

        systems.forEach((system, systemIndex) => {
            // Height: the staves, with room above and below for notes on ledger
            // lines and their stems, and between two staves for both.
            const reach = staff => {
                const ends = voices.flatMap((voice, v) => voice.staff !== staff ? [] : entries[v]
                    .filter(entry => entry.note.p && system.bars.includes(Math.floor(entry.onset / size)))
                    .map(entry => {
                        const { positions, up } = layouts[v][entry.index];
                        const stem = entry.note.d === "w" ? 0 : 7;
                        return { high: positions.at(-1) + (up ? stem : 0) + 2, low: positions[0] - (up ? 0 : stem) - 2 };
                    }));
                return { high: Math.max(8, ...ends.map(end => end.high)), low: Math.min(0, ...ends.map(end => end.low)) };
            };
            const above = Math.max(11, reach(0).high + 2);
            const below = Math.min(-5, reach(staffCount - 1).low - 2);
            const gap = staffCount > 1 ? Math.max(STAFF_GAP, (reach(1).high - reach(0).low + 3) * SPACE / 2) : 0;
            const firstBottom = top + headroom + above * SPACE / 2;
            const bottoms = score.staves.map((_, staff) => firstBottom + staff * gap);
            system.staffY = bottoms;
            system.top = top;
            const left = braceRoom;
            system.left = left;
            for (const y of bottoms) for (let l = 0; l < 5; l++) line(left, y - l * SPACE, left + system.width, y - l * SPACE, "staff-line");
            if (staffCount > 1) {
                line(left, bottoms[0] - 4 * SPACE, left, bottoms.at(-1), "bar-line");
                const from = bottoms[0] - 4 * SPACE, to = bottoms.at(-1);
                glyph(GLYPHS.brace, 0, to, "staff-glyph", { scaleY: (to - from) / (4 * SPACE) });
            }
            // Clefs, signatures and, on the first system, the time.
            score.staves.forEach((staff, index) => {
                const y = bottoms[index];
                // Bravura Text sets a clef on its line when its baseline is the bottom line.
                glyph(GLYPHS[staff.clef], left + SPACE, y - (CLEF_RAISE[staff.clef] ?? 0) * SPACE, "staff-glyph");
                signature(score.key.fifths, staff.clef).forEach((mark, at) => glyph(GLYPHS[String(mark.alter)], left + HEADER_CLEF * SPACE + at * SPACE, y - mark.position * SPACE / 2 + LIFT, "staff-glyph"));
                if (system.first) {
                    // The digits are centered on their baseline: the beats in the upper half, the unit below.
                    // A number narrower than the other is centered over or under it.
                    const x = left + header(keyWidth);
                    const row = (text, rowY) => {
                        const start = x + (timeDigits - text.length) * 0.9 * SPACE;
                        text.split("").forEach((digit, at) => glyph(GLYPHS.digits[digit], start + at * 1.8 * SPACE, rowY, "staff-glyph"));
                    };
                    row(String(score.meter.beats), y - 3 * SPACE);
                    row(String(score.meter.unit), y - SPACE);
                }
            });
            // Bars: their moments' x, then bar lines.
            let x = left + system.lead;
            system.bars.forEach(bar => {
                ordered.filter(moment => moment.time >= bar * size && moment.time < (bar + 1) * size).forEach(moment => {
                    moment.x = x + moment.offset * system.stretch;
                    moment.system = systemIndex;
                    columns.push({ time: moment.time, x: moment.x, system: systemIndex });
                });
                const barStart = x;
                x += barWidths[bar] * system.stretch;
                barSpans.push({ bar, system: systemIndex, x1: barStart, x2: x });
                const last = bar === barCount - 1;
                if (last) {
                    line(x - 0.75 * SPACE, bottoms[0] - 4 * SPACE, x - 0.75 * SPACE, bottoms.at(-1), "bar-line");
                    items.push({ kind: "beam", x1: x - 0.5 * SPACE, x2: x, y1: bottoms[0] - 4 * SPACE, y2: bottoms[0] - 4 * SPACE, thickness: bottoms.at(-1) - bottoms[0] + 4 * SPACE, class: "bar-final" });
                } else {
                    for (let staff = 0; staff < staffCount; staff++) line(x, bottoms[staff] - 4 * SPACE, x, bottoms[staff], "bar-line");
                    if (staffCount > 1) line(x, bottoms[0], x, bottoms.at(-1) - 4 * SPACE, "bar-line");
                }
            });
            system.right = x;
            system.bottom = bottoms.at(-1) - below * SPACE / 2;
            top = system.bottom + room + 2 * SPACE;
        });

        // Notes, rests, stems, flags, beams, dots and ledger lines.
        voices.forEach((voice, v) => {
            const shared = voicesOnStaff(voice.staff) > 1;
            placed[v] = [];
            // Eighths and shorter in the same beat are beamed: a beat is a
            // group of the meter's (2.7.0: 7/8's 2+2+3; threes in 6/8 before).
            const starts = [];
            meterGroups(score.meter).reduce((at, group) => (starts.push(at), at + group), 0);
            const groupOf = onset => {
                const bar = Math.floor(onset / size);
                const local = onset - bar * size;
                let at = 0;
                while (at + 1 < starts.length && starts[at + 1] <= local) at++;
                return `${bar}.${at}`;
            };
            const groups = [];
            entries[v].forEach(entry => {
                if (!BEAMS[entry.note.d] || !entry.note.p) return;
                const group = groups.at(-1);
                const sameBeat = group && groupOf(group.at(-1).onset) === groupOf(entry.onset) && group.at(-1).onset + group.at(-1).length === entry.onset;
                if (sameBeat) group.push(entry);
                else groups.push([entry]);
            });
            const beamed = new Map();
            groups.filter(group => group.length > 1).forEach(group => group.forEach(entry => beamed.set(entry.index, group)));

            entries[v].forEach(entry => {
                const moment = moments.get(entry.onset);
                const system = systems[moment.system];
                const y = system.staffY[voice.staff];
                const note = entry.note;
                const headWidth = HEAD_WIDTH[note.d];
                if (!note.p && hideRest?.(v, entry.index)) {
                    placed[v][entry.index] = { x: moment.x, y: y - 2 * SPACE, up: true, system: moment.system, headWidth, rest: true };
                    return;
                }
                if (!note.p) {
                    const lift = shared ? (voice.voiceIndex === 0 ? 2 : -2) * SPACE : 0;
                    glyph(GLYPHS[`rest${note.d}`], moment.x, y - 2 * SPACE - lift + LIFT, "staff-glyph");
                    if (note.dot) glyph(GLYPHS.dot, moment.x + headWidth + 0.6 * SPACE, y - 2.5 * SPACE - lift + LIFT, "staff-glyph");
                    placed[v][entry.index] = { x: moment.x, y: y - 2 * SPACE - lift, up: true, system: moment.system, headWidth, rest: true };
                    rests.push({ voice: v, index: entry.index, x: moment.x, y: y - 2 * SPACE - lift, system: moment.system });
                    return;
                }
                const { positions, up, flipped } = layouts[v][entry.index];
                // A second against the other voice on the staff: the stem-up head steps right.
                let headX = moment.x;
                if (shared && voice.voiceIndex === 0) {
                    const other = voices.findIndex((each, index) => index !== v && each.staff === voice.staff);
                    const against = entries[other]?.find(each => each.onset === entry.onset && each.note.p);
                    if (against && Math.abs(against.note.p.step - note.p.step) === 1) headX += HEAD_WIDTH[against.note.d];
                }
                // A chord's heads: on the stem's other side when flipped, touching it.
                const xOf = at => (!flipped[at] ? headX : up ? headX + headWidth - 0.12 * SPACE : headX - headWidth + 0.12 * SPACE);
                const yOf = at => y - positions[at] * SPACE / 2;
                const xs = positions.map((_, at) => xOf(at));
                // Ledger lines, each as wide as the heads on or past it.
                const ledger = place => {
                    const reaching = xs.filter((_, at) => (place < 0 ? positions[at] <= place : positions[at] >= place));
                    line(Math.min(...reaching) - 0.4 * SPACE, y - place * SPACE / 2, Math.max(...reaching) + headWidth + 0.4 * SPACE, y - place * SPACE / 2, "staff-ledger");
                };
                for (let place = -2; place >= positions[0]; place -= 2) ledger(place);
                for (let place = 10; place <= positions.at(-1); place += 2) ledger(place);
                const leftmost = Math.min(...xs);
                const { alters, column } = layouts[v][entry.index];
                alters.forEach((alter, at) => {
                    if (alter !== null) glyph(GLYPHS[String(alter)], leftmost - 1.5 * SPACE - column[at] * 1.2 * SPACE, yOf(at) + LIFT, "staff-glyph");
                });
                const headGlyph = note.d === "w" ? GLYPHS.whole : note.d === "h" ? GLYPHS.half : GLYPHS.black;
                positions.forEach((_, at) => glyph(headGlyph, xs[at], yOf(at) + LIFT, "staff-glyph"));
                // A dot for each head, in the space it's on or the one above its line, once a space.
                if (note.dot) {
                    const dotX = Math.max(...xs) + headWidth + 0.5 * SPACE;
                    new Set(positions.map((position, at) => yOf(at) - (position % 2 === 0 ? SPACE / 2 : 0))).forEach(dotY => glyph(GLYPHS.dot, dotX, dotY + LIFT, "staff-glyph"));
                }
                const middle = y - 2 * SPACE;
                const stemX = up ? headX + headWidth - 0.06 * SPACE : headX + 0.06 * SPACE;
                const stem = STEM + stemExtra(note.d);
                // The stem runs from the far head past the near one.
                const top = yOf(positions.length - 1), bottom = yOf(0);
                const near = up ? top : bottom, far = up ? bottom : top;
                let stemEnd = up ? Math.min(near - stem, shared ? near - stem : middle) : Math.max(near + stem, shared ? near + stem : middle);
                placed[v][entry.index] = { x: headX, y: bottom, top, bottom, up, system: moment.system, headWidth, stemX, stemEnd, heads: xs.map((x, at) => ({ x, y: yOf(at) })) };
                if (note.d !== "w" && !beamed.has(entry.index)) {
                    line(stemX, far, stemX, stemEnd, "staff-stem");
                    // A flag hangs from the stem's end: its origin there, lifted as every glyph is (2.6.0; it sat two spaces off).
                    if (BEAMS[note.d]) glyph((up ? GLYPHS.flagsUp : GLYPHS.flagsDown)[BEAMS[note.d]], stemX - 0.06 * SPACE, stemEnd + LIFT, "staff-glyph");
                }
                xs.forEach((x, at) => heads.push({ voice: v, index: entry.index, at, x, y: yOf(at), system: moment.system }));
            });

            // Beams: one stem direction for the group, the beam level at its
            // outermost end. A sixteenth's second beam (a thirty-second's third,
            // a sixty-fourth's fourth) joins the notes beside it that have one
            // too; a note alone at its level has a short beam toward its
            // neighbor: back from the group's last, forward from the rest.
            groups.filter(group => group.length > 1).forEach(group => {
                const spots = group.map(entry => placed[v][entry.index]);
                if (new Set(spots.map(spot => spot.system)).size > 1) return;
                const levels = group.map(entry => BEAMS[entry.note.d]);
                const extra = Math.max(...group.map(entry => stemExtra(entry.note.d)));
                // A chord counts by its middle. (Its heads stay on the side its own stem put them.)
                const up = shared ? voice.voiceIndex === 0 : spots.reduce((sum, spot) => sum + ((spot.top + spot.bottom) / 2 - systems[spot.system].staffY[voice.staff] + 2 * SPACE), 0) > 0;
                const ends = spots.map(spot => up ? spot.top - STEM - extra : spot.bottom + STEM + extra);
                const level = up ? Math.min(...ends) : Math.max(...ends);
                spots.forEach(spot => {
                    const stemX = up ? spot.x + spot.headWidth - 0.06 * SPACE : spot.x + 0.06 * SPACE;
                    spot.up = up;
                    spot.stemX = stemX;
                    spot.stemEnd = level;
                    line(stemX, up ? spot.bottom : spot.top, stemX, level, "staff-stem");
                });
                const beam = (x1, x2, depth) => {
                    const y = up ? level + depth * BEAM_STEP : level - 0.5 * SPACE - depth * BEAM_STEP;
                    items.push({ kind: "beam", x1, x2, y1: y, y2: y, thickness: 0.5 * SPACE, class: "staff-beam" });
                };
                beam(spots[0].stemX, spots.at(-1).stemX, 0);
                const stub = 1.1 * SPACE;
                for (let depth = 1; depth < Math.max(...levels); depth++) {
                    let start = -1;
                    for (let at = 0; at <= group.length; at++) {
                        const has = at < group.length && levels[at] > depth;
                        if (has && start < 0) start = at;
                        if (has || start < 0) continue;
                        const last = at - 1;
                        if (last > start) beam(spots[start].stemX, spots[last].stemX, depth);
                        else if (start === group.length - 1) beam(spots[start].stemX - stub, spots[start].stemX, depth);
                        else beam(spots[start].stemX, spots[start].stemX + stub, depth);
                        start = -1;
                    }
                }
            });

            // Ties, curved away from the stems (a chord's lower half down, its
            // upper half up); one crossing a system's end is drawn in two
            // halves. A chord's tie holds each pitch the next chord has.
            entries[v].forEach(entry => {
                if (!entry.note.tie || !entry.note.p) return;
                const next = entries[v][entry.index + 1];
                if (!next?.note.p) return;
                const from = placed[v][entry.index], to = placed[v][next.index];
                const mine = midisOf(entry.note), theirs = midisOf(next.note);
                mine.forEach((midi, at) => {
                    const there = theirs.indexOf(midi);
                    if (there < 0) return;
                    const below = mine.length === 1 ? from.up : at < mine.length / 2;
                    const lift = below ? 0.7 * SPACE : -0.7 * SPACE;
                    const bow = below ? 1.1 * SPACE : -1.1 * SPACE;
                    const tie = (x1, x2, y) => items.push({ kind: "path", class: "staff-tie", d: tiePath(x1, x2, y, bow) });
                    const start = from.heads[at], end = to.heads[there];
                    if (from.system === to.system) tie(start.x + from.headWidth + 0.2 * SPACE, end.x - 0.2 * SPACE, start.y + lift);
                    else {
                        tie(start.x + from.headWidth + 0.2 * SPACE, systems[from.system].right, start.y + lift);
                        tie(systems[to.system].left + systems[to.system].lead - SPACE, end.x - 0.2 * SPACE, end.y + lift);
                    }
                });
            });
        });

        return { width, height: top - 2 * SPACE + SPACE, room, items, heads, rests, columns, barSpans, systems: systems.map(system => ({ top: system.top, bottom: system.bottom, staffY: system.staffY, left: system.left, right: system.right, bars: system.bars })), space: SPACE, font: FONT };
    }

    // A tie as a filled crescent from x1 to x2 at y, bowing by bow.
    function tiePath(x1, x2, y, bow) {
        const middle = (x1 + x2) / 2;
        const thick = bow > 0 ? 0.25 * SPACE : -0.25 * SPACE;
        const r = value => Math.round(value * 10) / 10;
        return `M${r(x1)} ${r(y)}Q${r(middle)} ${r(y + bow + thick)} ${r(x2)} ${r(y)}Q${r(middle)} ${r(y + bow)} ${r(x1)} ${r(y)}Z`;
    }

    // MusicXML's divisions a quarter (2.6.0: 16, so a sixty-fourth is one; 2
    // before), and its names for the values.
    const XML_DIVISIONS = 16;
    const XML_PER_EIGHTH = XML_DIVISIONS / 2;
    const XML_TYPES = Object.freeze({ w: "whole", h: "half", q: "quarter", e: "eighth", s: "16th", t: "32nd", f: "64th" });

    // ---- MusicXML (4.0, partwise): a part per staff, its voices one after
    // another in each measure, a chord's pitches as notes marked <chord/>
    // (2.7.0). Durations count XML_DIVISIONS a quarter.

    const escapeXml = text => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    // Each clef as MusicXML writes it; an 8 under the clef is an octave change.
    const XML_CLEFS = Object.freeze({
        treble: "<clef><sign>G</sign><line>2</line></clef>",
        treble8: "<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>",
        alto: "<clef><sign>C</sign><line>3</line></clef>",
        tenor: "<clef><sign>C</sign><line>4</line></clef>",
        bass: "<clef><sign>F</sign><line>4</line></clef>",
        bass8: "<clef><sign>F</sign><line>4</line><clef-octave-change>-1</clef-octave-change></clef>"
    });
    function musicXml(score) {
        const size = barLength(score.meter);
        const end = Math.max(size, ...score.staves.flatMap(staff => staff.voices.map(voice => voice.notes.reduce((sum, note) => sum + lengthOf(note), 0))));
        const barCount = Math.ceil(end / size);
        const out = [];
        out.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
        out.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
        out.push('<score-partwise version="4.0">');
        if (score.title) out.push(`  <work><work-title>${escapeXml(score.title)}</work-title></work>`);
        out.push("  <identification><encoding><software>Aeolionware Maestro</software></encoding></identification>");
        out.push("  <part-list>");
        score.staves.forEach((staff, index) => {
            const name = staff.voices.map(voice => voice.name).filter(Boolean).join(" and ") || (score.staves.length > 1 && index > 0 ? "Lower" : "Upper");
            out.push(`    <score-part id="P${index + 1}"><part-name>${escapeXml(name)}</part-name></score-part>`);
        });
        out.push("  </part-list>");
        score.staves.forEach((staff, staffIndex) => {
            out.push(`  <part id="P${staffIndex + 1}">`);
            const voiceBars = staff.voices.map(voice => bars(voice.notes, score.meter).bars);
            const voiceTimed = staff.voices.map(voice => timed(voice.notes));
            for (let bar = 0; bar < barCount; bar++) {
                out.push(`    <measure number="${bar + 1}">`);
                if (bar === 0) {
                    out.push("      <attributes>");
                    out.push(`        <divisions>${XML_DIVISIONS}</divisions>`);
                    out.push(`        <key><fifths>${score.key.fifths}</fifths><mode>${score.key.mode}</mode></key>`);
                    out.push(`        <time><beats>${score.meter.beats}</beats><beat-type>${score.meter.unit}</beat-type></time>`);
                    out.push(`        ${XML_CLEFS[staff.clef]}`);
                    out.push("      </attributes>");
                }
                staff.voices.forEach((voice, voiceIndex) => {
                    if (voiceIndex > 0) out.push(`      <backup><duration>${size * XML_PER_EIGHTH}</duration></backup>`);
                    const inBar = voiceBars[voiceIndex][bar] ?? [];
                    let filled = 0;
                    for (const { note, index } of inBar) {
                        const notes = voice.notes;
                        // A chord's tie holds each pitch the next has; a single note's, as written.
                        const before = notes[index - 1], after = notes[index + 1];
                        const held = midi => Boolean(before?.tie && midisOf(before).includes(midi));
                        const tied = midi => Boolean(note.tie && note.p && (!note.more || (after && midisOf(after).includes(midi))));
                        const pitches = pitchesOf(note);
                        (pitches.length ? pitches : [null]).forEach((p, at) => {
                            const parts = at ? ["<chord/>"] : [];
                            const midi = p ? midiOf(p) : null;
                            const stop = p && (note.more ? held(midi) : voiceTimed[voiceIndex][index].held);
                            if (p) {
                                const letter = LETTERS[letterOf(p.step)];
                                parts.push(`<pitch><step>${letter}</step>${p.alter ? `<alter>${p.alter}</alter>` : ""}<octave>${octaveOf(p.step)}</octave></pitch>`);
                            } else parts.push("<rest/>");
                            parts.push(`<duration>${lengthOf(note) * XML_PER_EIGHTH}</duration>`);
                            if (stop) parts.push('<tie type="stop"/>');
                            if (p && tied(midi)) parts.push('<tie type="start"/>');
                            parts.push(`<voice>${voiceIndex + 1}</voice>`, `<type>${XML_TYPES[note.d]}</type>`);
                            if (note.dot) parts.push("<dot/>");
                            if (p && staff.voices.length > 1) parts.push(`<stem>${voiceIndex === 0 ? "up" : "down"}</stem>`);
                            const ties = [stop ? '<tied type="stop"/>' : "", p && tied(midi) ? '<tied type="start"/>' : ""].join("");
                            if (ties) parts.push(`<notations>${ties}</notations>`);
                            out.push(`      <note>${parts.join("")}</note>`);
                        });
                        filled += lengthOf(note);
                    }
                    // A bar the voice hasn't reached yet is a rest; a short last bar is filled out with one.
                    if (filled < size) out.push(`      <forward><duration>${(size - filled) * XML_PER_EIGHTH}</duration><voice>${voiceIndex + 1}</voice></forward>`);
                });
                if (bar === barCount - 1) out.push('      <barline location="right"><bar-style>light-heavy</bar-style></barline>');
                out.push("    </measure>");
            }
            out.push("  </part>");
        });
        out.push("</score-partwise>");
        return `${out.join("\n")}\n`;
    }

    return Object.freeze({
        CLEFS, LETTERS, NATURAL, MODES, DURATIONS, DURATION_NAMES, BEAMS, CHORD_MAX, GLYPHS, SPACE, FONT, LIFT, HEAD_WIDTH, STAFF_BOTTOM, LOWEST_STEP, HIGHEST_STEP, NOTES_MAX, TITLE_MAX,
        pitch, isPitch, midiOf, parsePitch, pitchName, pitchLetterName, keyFifths, keyTonic, tonicLetter, keyAlter, signature, pitchFromMidi, interval,
        lengthOf, barLength, meterGroups, pitchesOf, midisOf, bars, voicesOf, timed, slices, soundingEvents, shownAccidentals, chordAccidentals, cleanScore, engrave, musicXml
    });
})();
