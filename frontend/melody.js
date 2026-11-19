"use strict";
// Melody (2.6.0): instruments as written and as heard, with their ranges; a
// motif developed (repeated, moved up or down the key, turned upside down or
// backward, in longer or shorter notes); and a melody harmonized with the
// chords of its key. Pure: in MaestroNotation's terms, durations in eighths.
globalThis.MaestroMelody = (() => {
    const N = globalThis.MaestroNotation;
    const M = globalThis.MaestroMusic;
    const H = globalThis.MaestroHarmony;
    const modulo = (value, base) => ((value % base) + base) % base;
    const midi = p => N.midiOf(p);

    // ---- Instruments. A transposing one's part is written `semis` above
    // where it sounds (`steps` letters, the key `fifths` around the circle);
    // `range` is where it sounds, in MIDI, and `clef` where it's written.
    const INSTRUMENTS = Object.freeze([
        { id: "concert", label: "None (concert pitch)", semis: 0, steps: 0, fifths: 0, range: null, clef: "treble" },
        { id: "soprano", label: "Soprano voice", semis: 0, steps: 0, fifths: 0, range: [60, 81], clef: "treble" },
        { id: "alto", label: "Alto voice", semis: 0, steps: 0, fifths: 0, range: [53, 74], clef: "treble" },
        { id: "tenor", label: "Tenor voice", semis: 0, steps: 0, fifths: 0, range: [48, 69], clef: "bass" },
        { id: "bass", label: "Bass voice", semis: 0, steps: 0, fifths: 0, range: [40, 64], clef: "bass" },
        { id: "flute", label: "Flute", semis: 0, steps: 0, fifths: 0, range: [60, 96], clef: "treble" },
        { id: "oboe", label: "Oboe", semis: 0, steps: 0, fifths: 0, range: [58, 91], clef: "treble" },
        { id: "violin", label: "Violin", semis: 0, steps: 0, fifths: 0, range: [55, 100], clef: "treble" },
        { id: "cello", label: "Cello", semis: 0, steps: 0, fifths: 0, range: [36, 76], clef: "bass" },
        { id: "clarinet", label: "Clarinet in B\u266D", semis: 2, steps: 1, fifths: 2, range: [50, 91], clef: "treble" },
        { id: "trumpet", label: "Trumpet in B\u266D", semis: 2, steps: 1, fifths: 2, range: [54, 82], clef: "treble" },
        { id: "altosax", label: "Alto saxophone in E\u266D", semis: 9, steps: 5, fifths: 3, range: [49, 80], clef: "treble" },
        { id: "tenorsax", label: "Tenor saxophone in B\u266D", semis: 14, steps: 8, fifths: 2, range: [44, 75], clef: "treble" },
        { id: "horn", label: "Horn in F", semis: 7, steps: 4, fifths: 1, range: [34, 77], clef: "treble" },
        { id: "guitar", label: "Guitar (an octave down)", semis: 12, steps: 7, fifths: 0, range: [40, 88], clef: "treble" },
        { id: "bassguitar", label: "Bass guitar (an octave down)", semis: 12, steps: 7, fifths: 0, range: [28, 67], clef: "bass" }
    ].map(Object.freeze));
    const instrumentOf = id => INSTRUMENTS.find(each => each.id === id) ?? INSTRUMENTS[0];
    const transposes = id => instrumentOf(id).semis !== 0;

    // A sounding pitch as the part writes it.
    function writtenPitch(p, instrument, steps = instrument.steps) {
        if (!p || !instrument.semis) return p;
        const step = p.step + steps;
        const alter = midi(p) + instrument.semis - midi(N.pitch(step, 0));
        return Math.abs(alter) <= 2 ? N.pitch(step, alter) : N.pitchFromMidi(midi(p) + instrument.semis);
    }

    // A score as the part is written: its notes and key moved by the
    // instrument's interval, the clef the instrument's. A key past seven
    // sharps or flats is spelled the other way (D sharp major as E flat).
    function writtenScore(score, id) {
        const instrument = instrumentOf(id);
        if (!instrument.semis) return score;
        let fifths = score.key.fifths + instrument.fifths;
        let steps = instrument.steps;
        if (fifths > 7) { fifths -= 12; steps += 1; }
        if (fifths < -7) { fifths += 12; steps -= 1; }
        const staves = score.staves.map(staff => ({
            clef: instrument.clef,
            voices: staff.voices.map(voice => ({ name: voice.name, notes: voice.notes.map(note => ({ ...note, p: writtenPitch(note.p, instrument, steps) })) }))
        }));
        return N.cleanScore({ ...score, key: { fifths, mode: score.key.mode }, staves });
    }

    // ---- A line as events: notes tied together are one, each { p, length }.
    const lengthOf = note => N.lengthOf(note);
    function eventsOf(notes) {
        const events = [];
        let held = false;
        for (const note of notes) {
            if (held && events.length && note.p && events.at(-1).p && midi(events.at(-1).p) === midi(note.p)) events.at(-1).length += lengthOf(note);
            else events.push({ p: note.p, length: lengthOf(note) });
            held = Boolean(note.tie && note.p);
        }
        return events;
    }

    // Events written in bars: each note within its bar, cut where it crosses
    // one and tied over, and spelled in values the staff has.
    const VALUES = Object.freeze([[8, "w", false], [6, "h", true], [4, "h", false], [3, "q", true], [2, "q", false], [1, "e", false], [0.5, "s", false], [0.25, "t", false], [0.125, "f", false]]);
    function notesOf(events, bar = 8, start = 0) {
        const notes = [];
        let at = start;
        for (const event of events) {
            let left = event.length;
            while (left > 0) {
                const room = bar - modulo(at, bar);
                const take = Math.min(left, room);
                let rest = take;
                while (rest > 0) {
                    const [size, d, dot] = VALUES.find(([value]) => value <= rest);
                    notes.push({ p: event.p, d, dot, tie: false });
                    rest -= size;
                    at += size;
                    left -= size;
                    if (left > 0 && event.p) notes.at(-1).tie = true;
                }
            }
        }
        return notes;
    }

    // ---- A motif developed. Moved by letter in the key, each note keeps
    // how far it's raised or lowered from the key's own note.
    function moveInKey(p, by, fifths) {
        if (!p) return p;
        const step = p.step + by;
        const offset = p.alter - N.keyAlter(modulo(p.step, 7), fifths);
        return N.pitch(step, Math.max(-2, Math.min(2, N.keyAlter(modulo(step, 7), fifths) + offset)));
    }

    const DEVELOPMENTS = Object.freeze([
        { id: "repeat", label: "Repeat", title: "The motif again" },
        { id: "up", label: "Sequence up", title: "The motif a step higher in the key" },
        { id: "down", label: "Sequence down", title: "The motif a step lower in the key" },
        { id: "invert", label: "Inversion", title: "Upside down: each step up goes down, mirrored on its first note" },
        { id: "retrograde", label: "Retrograde", title: "Backward: its last note first" },
        { id: "augment", label: "Augmentation", title: "Each note twice as long" },
        { id: "diminish", label: "Diminution", title: "Each note half as long" }
    ].map(Object.freeze));

    // The motif's events developed one way; null if it can't be (a
    // sixty-fourth halved; an eighth before 2.6.0).
    function develop(events, how, fifths) {
        const first = events.find(event => event.p)?.p ?? null;
        switch (how) {
            case "repeat": return events.map(event => ({ ...event }));
            case "up": return events.map(event => ({ ...event, p: moveInKey(event.p, 1, fifths) }));
            case "down": return events.map(event => ({ ...event, p: moveInKey(event.p, -1, fifths) }));
            case "invert": return events.map(event => ({ ...event, p: event.p && first ? moveInKey(event.p, 2 * (first.step - event.p.step), fifths) : event.p }));
            case "retrograde": return [...events].reverse().map(event => ({ ...event }));
            case "augment": return events.map(event => ({ ...event, length: event.length * 2 }));
            case "diminish": return events.every(event => (event.length / 2) % N.DURATIONS.f === 0) ? events.map(event => ({ ...event, length: event.length / 2 })) : null;
            default: return null;
        }
    }

    // The bar each note starts in, and the notes from a bar for so many bars.
    function barsOfNotes(notes, bar = 8) {
        let at = 0;
        return notes.map(note => {
            const which = Math.floor(at / bar);
            at += lengthOf(note);
            return which;
        });
    }

    // A melody's notes with a motif developed after it: the motif, `size`
    // bars from bar `from`, developed `how`, written from the first bar after
    // it that holds no note (rests stand for nothing written), the melody
    // growing as it needs to, up to `most` bars. Null when it can't be
    // developed so or there's no room.
    function developMotif(notes, { from, size, how, fifths, bar = 8, most = 32 }) {
        const bars = barsOfNotes(notes, bar);
        const total = Math.ceil(notes.reduce((sum, note) => sum + lengthOf(note), 0) / bar);
        const motif = notes.filter((_, index) => bars[index] >= from && bars[index] < from + size);
        if (!motif.some(note => note.p)) return null;
        const developed = develop(eventsOf(motif), how, fifths);
        if (!developed) return null;
        const length = developed.reduce((sum, event) => sum + event.length, 0);
        const needs = Math.ceil(length / bar);
        let target = from + size;
        while (target < total && notes.some((note, index) => bars[index] === target && note.p)) target += 1;
        if (target + needs > most) return null;
        const before = notes.filter((_, index) => bars[index] < target);
        const after = notes.filter((_, index) => bars[index] >= target + needs);
        // A developed line ending inside a bar is filled with rest to the bar's end.
        const filled = [...developed];
        if (length % bar) filled.push({ p: null, length: bar - (length % bar) });
        return { notes: [...before, ...notesOf(filled, bar, target * bar), ...after], from: target, bars: needs };
    }

    // ---- Harmonizing: a chord of the key for each bar (or half bar), as
    // the notes there want and the chords before and after lead.
    const SCALE_OF = Object.freeze({ major: "major", ionian: "major", minor: "minor", aeolian: "minor", dorian: "dorian", phrygian: "phrygian", lydian: "lydian", mixolydian: "mixolydian" });
    // How well one degree moves to another (0 the tonic): the common moves cost nothing.
    const GOOD_MOVES = Object.freeze({ 0: [1, 2, 3, 4, 5, 6], 1: [4, 6], 2: [5, 3], 3: [4, 0, 1, 6], 4: [0, 5], 5: [1, 3], 6: [0] });
    const moveCost = (from, to) => (from === to ? 0.6 : GOOD_MOVES[from]?.includes(to) ? 0 : from === 4 && (to === 3 || to === 1) ? 2.5 : 1.2);

    function keyChords(key) {
        const root = N.keyTonic(key.fifths, key.mode);
        const scale = SCALE_OF[key.mode];
        if (!scale) return [];
        const chords = M.chordsInKey(root, scale, 3).map((chord, degree) => ({ name: chord.name, numeral: chord.numeral, degree, pcs: chord.tones.map(tone => tone.pc) }));
        // In minor the dominant is major, its third the raised leading tone.
        if (scale === "minor") {
            const dominant = H.chordFromNumeral("V", { root, scale: "minor" });
            if (dominant) chords.push({ name: dominant, numeral: "V", degree: 4, pcs: H.chordTones(dominant).map(tone => tone.pc) });
        }
        return chords;
    }

    // Chords for a melody: { name, numeral, at, silent } for each slot, `per`
    // a bar (1 or 2), `at` the slot's start in eighths. A slot of rests
    // (silent) keeps the chord before.
    function harmonize(notes, key, { per = 1, bar = 8 } = {}) {
        const chords = keyChords(key);
        if (!chords.length) return [];
        const slot = bar / per;
        const total = notes.reduce((sum, note) => sum + lengthOf(note), 0);
        const count = Math.ceil(total / slot);
        if (!count) return [];
        const weights = Array.from({ length: count }, () => new Map());
        let at = 0;
        for (const note of notes) {
            const length = lengthOf(note);
            if (note.p) {
                const which = Math.floor(at / slot);
                const strong = at % bar === 0 ? 2 : at % (bar / 2) === 0 ? 1.5 : 1;
                const pc = modulo(midi(note.p), 12);
                weights[which].set(pc, (weights[which].get(pc) ?? 0) + Math.min(length, slot) * strong);
            }
            at += length;
        }
        const fit = (chord, k) => {
            let score = 0, heaviest = null;
            for (const [pc, weight] of weights[k]) {
                score += chord.pcs.includes(pc) ? weight : -0.6 * weight;
                if (!heaviest || weight > heaviest.weight) heaviest = { pc, weight };
            }
            if (heaviest && !chord.pcs.includes(heaviest.pc)) score -= 2;
            // A diminished triad on its root is a weak choice where another fits.
            if (chord.numeral.includes(String.fromCodePoint(0x00B0))) score -= 1.5;
            return score;
        };
        const place = (chord, k) => (k === 0 && chord.degree === 0 ? -1 : 0) + (k === count - 1 ? (chord.degree === 0 ? -3 : 1.5) : 0) + (k === count - 2 && chord.degree === 4 ? -1.5 : 0);
        let best = chords.map((chord, index) => ({ total: -fit(chord, 0) + place(chord, 0), path: [index] }));
        for (let k = 1; k < count; k++) {
            const silent = weights[k].size === 0;
            best = chords.map((chord, index) => {
                let choice = null;
                best.forEach((from, at) => {
                    // A slot of rests keeps the chord before.
                    if (silent && at !== index) return;
                    const total = from.total + (silent ? 0 : moveCost(chords[at].degree, chord.degree) - fit(chord, k) + place(chord, k));
                    if (!choice || total < choice.total) choice = { total, path: from.path.concat(index) };
                });
                return choice ?? { total: Infinity, path: [] };
            });
        }
        const winner = best.filter(each => each.total < Infinity).sort((a, b) => a.total - b.total)[0];
        return winner ? winner.path.map((index, k) => Object.freeze({ name: chords[index].name, numeral: chords[index].numeral, at: k * slot, silent: weights[k].size === 0 })) : [];
    }

    return Object.freeze({
        INSTRUMENTS, DEVELOPMENTS, instrumentOf, transposes, writtenPitch, writtenScore,
        eventsOf, notesOf, moveInKey, develop, barsOfNotes, developMotif, keyChords, harmonize
    });
})();
