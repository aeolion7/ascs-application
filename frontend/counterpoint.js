"use strict";
// Counterpoint (2.5.0): species counterpoint in two voices and four-part
// writing. Exercises (Fux's cantus firmi and generated ones; progressions as
// numerals, a figured bass or a soprano), the checkers that name every
// problem with its bar, the analysis under the staff, and exercises as kept
// in Maestro's data folder. Pure: written in MaestroNotation's terms.
globalThis.MaestroCounterpoint = (() => {
    const N = globalThis.MaestroNotation;
    const SHARP = String.fromCodePoint(0x266F), FLAT = String.fromCodePoint(0x266D), NATURAL_SIGN = String.fromCodePoint(0x266E);
    const DIM = String.fromCodePoint(0x00B0), HALF_DIM = String.fromCodePoint(0x00F8), DASH = String.fromCodePoint(0x2013);
    const SIGN = { "-2": FLAT + FLAT, "-1": FLAT, "0": NATURAL_SIGN, "1": SHARP, "2": SHARP + SHARP };
    const modulo = (value, base) => ((value % base) + base) % base;
    const midi = p => N.midiOf(p);
    const name = p => N.pitchName(p);
    const METER = Object.freeze({ beats: 4, unit: 4 });
    const BAR = N.barLength(METER);

    // ---- Cantus firmi: Fux's, from Gradus ad Parnassum (1725), one in each mode.
    const FUX = Object.freeze([
        { id: "fux-dorian", label: "Fux, Dorian", mode: "dorian", final: "D", notes: "D4 F4 E4 D4 G4 F4 A4 G4 F4 E4 D4" },
        { id: "fux-phrygian", label: "Fux, Phrygian", mode: "phrygian", final: "E", notes: "E4 C4 D4 C4 A3 A4 G4 E4 F4 E4" },
        { id: "fux-lydian", label: "Fux, Lydian", mode: "lydian", final: "F", notes: "F4 G4 A4 F4 D4 E4 F4 C5 A4 F4 G4 F4" },
        { id: "fux-mixolydian", label: "Fux, Mixolydian", mode: "mixolydian", final: "G", notes: "G3 C4 B3 G3 C4 E4 D4 G4 E4 C4 D4 B3 A3 G3" },
        { id: "fux-aeolian", label: "Fux, Aeolian", mode: "aeolian", final: "A", notes: "A3 C4 B3 D4 C4 E4 F4 E4 D4 C4 B3 A3" },
        { id: "fux-ionian", label: "Fux, Ionian", mode: "ionian", final: "C", notes: "C4 E4 F4 G4 E4 A4 G4 E4 F4 E4 D4 C4" }
    ].map(Object.freeze));
    // From chant (2.5.0): phrases of hymns in the Liber Usualis (1961), one
    // note a syllable (a neume's first note, the cadence's last), repeated
    // notes merged. Read from GregoBase's transcriptions
    // (gregobase.selapa.net) and checked against the book's pages; each keeps
    // every rule of a cantus firmus.
    const CHANT = Object.freeze([
        { id: "chant-lucis-creator", label: "Lucis Creator optime", source: "Liber Usualis, p. 256", mode: "mixolydian", final: "G", notes: "G3 A3 C4 A3 C4 D4 B3 C4 E4 D4 C4 B3 A3 G3" },
        { id: "chant-jam-lucis-1", label: "Jam lucis orto sidere, line 1", source: "Liber Usualis, p. 224", mode: "dorian", final: "D", notes: "D4 C4 D4 F4 G4 F4 E4 D4 G4 F4 G4 A4 F4 E4 D4" },
        { id: "chant-jam-lucis-2", label: "Jam lucis orto sidere, line 2", source: "Liber Usualis, p. 224", mode: "dorian", final: "D", notes: "D4 E4 C4 A3 C4 D4 C4 D4 F4 G4 F4 E4 D4" },
        { id: "chant-vexilla-regis", label: "Vexilla Regis, lines 3 and 4", source: "Liber Usualis, p. 575", mode: "dorian", final: "D", notes: "D4 F4 D4 F4 G4 F4 A4 F4 E4 D4" }
    ].map(Object.freeze));
    // A cantus's notes as pitches: Fux's or a chant's.
    const fuxNotes = cantus => cantus.notes.split(" ").map(N.parsePitch);

    // A voice moved by octaves to sit around a target (MIDI): the cantus below
    // (around E3) or above (around G4) the counterpoint.
    function placeByOctaves(pitches, target) {
        const average = pitches.reduce((sum, p) => sum + midi(p), 0) / pitches.length;
        const octaves = Math.round((target - average) / 12);
        return pitches.map(p => N.pitch(p.step + 7 * octaves, p.alter));
    }

    // ---- Scale degrees in a key or mode

    const tonicOf = key => N.pitch(N.tonicLetter(key.fifths, key.mode), N.keyAlter(N.tonicLetter(key.fifths, key.mode), key.fifths));
    // A degree (0 the tonic) as a letter and its alteration in the key.
    function degreePitch(key, degree, octave = 4) {
        const tonic = tonicOf(key);
        const letter = modulo(tonic.step + degree, 7);
        return N.pitch(letter + 7 * octave, N.keyAlter(letter, key.fifths));
    }
    const degreeOf = (key, p) => modulo(p.step - tonicOf(key).step, 7);

    // The alterations the mode allows beyond its own notes: the raised leading
    // tone (and in minor the raised sixth), and Lydian's lowered fourth.
    function allowedAlter(key, p) {
        const own = N.keyAlter(modulo(p.step, 7), key.fifths);
        if (p.alter === own) return true;
        const degree = degreeOf(key, p);
        if (["minor", "aeolian"].includes(key.mode) && (degree === 5 || degree === 6) && p.alter === own + 1) return true;
        if (["dorian", "mixolydian"].includes(key.mode) && degree === 6 && p.alter === own + 1) return true;
        if (key.mode === "lydian" && degree === 3 && p.alter === own - 1) return true;
        return false;
    }

    // ---- A cantus firmus made to the rules: the rules each one breaks, by
    // name, as the cantus checker finds them (errors and warnings alone).
    function cantusProblems(pitches, key) {
        const exercise = cantusExercise({ mode: key.mode, final: N.keyTonic(key.fifths, key.mode), pitches });
        if (!exercise) return ["unreadable"];
        return checkCantus(exercise).filter(each => each.level !== "info").map(each => each.rule);
    }

    function makeCantus(key, length = 10, random = Math.random) {
        const tonic = degreePitch(key, 0, 4);
        for (let attempt = 0; attempt < 400; attempt++) {
            const line = [tonic];
            let ok = true;
            for (let index = 1; index < length - 2 && ok; index++) {
                const previous = line.at(-1);
                const lastStep = line.length > 1 ? previous.step - line.at(-2).step : 0;
                const options = Math.abs(lastStep) >= 3 ? [-Math.sign(lastStep)] : [1, -1, 1, -1, 2, -2, 3, -3, 4];
                const step = options[Math.floor(random() * options.length)];
                const target = previous.step + step;
                const letter = modulo(target, 7);
                const next = N.pitch(target, N.keyAlter(letter, key.fifths));
                if (Math.abs(target - tonic.step) > 6) { ok = false; break; }
                line.push(next);
            }
            if (!ok) continue;
            line.push(N.pitch(tonic.step + 1, N.keyAlter(modulo(tonic.step + 1, 7), key.fifths)), tonic);
            if (!cantusProblems(line, key).length) return line;
        }
        return fuxNotes(FUX[0]);
    }

    // ---- Species exercises

    // Each species' rhythm in a bar: the first bar may open with a rest, the
    // last is a whole note.
    const SPECIES_BAR = { 1: ["w"], 2: ["h", "h"], 3: ["q", "q", "q", "q"], 4: ["h", "h"], 5: ["h", "q", "q"] };
    function speciesTemplate(species, bars) {
        const notes = [];
        for (let bar = 0; bar < bars; bar++) {
            const last = bar === bars - 1;
            const rhythm = last ? ["w"] : SPECIES_BAR[species];
            rhythm.forEach((d, at) => notes.push({ p: null, d, dot: false, tie: false, opening: bar === 0 && at === 0 && species > 1 }));
        }
        return notes.map(({ opening, ...note }) => note);
    }

    // In the fourth and fifth species a note carried over the bar line to the
    // same pitch is tied, a suspension; elsewhere no note is tied.
    function tieSuspensions(notes, species) {
        let time = 0;
        return notes.map((note, index) => {
            const end = time + N.lengthOf(note);
            time = end;
            const next = notes[index + 1];
            const tie = species >= 4 && Boolean(note.p && next?.p) && end % BAR === 0 && midi(note.p) === midi(next.p);
            return { ...note, tie };
        });
    }

    // A species exercise: the cantus (pitches, one a bar) below or above, in
    // its mode; the counterpoint's bars to write.
    function speciesExercise({ species = 1, cantus, cantusBelow = true, mode = "dorian", final = "D", title = "", style = null }) {
        const fifths = N.keyFifths(final, mode);
        if (!Number.isInteger(species) || species < 1 || species > 5 || fifths === null || !Array.isArray(cantus) || cantus.length < 4) return null;
        const cf = placeByOctaves(cantus, cantusBelow ? 50 : 67);
        const cfVoice = { name: "Cantus firmus", notes: cf.map(p => ({ p, d: "w", dot: false, tie: false })) };
        const cpVoice = { name: "Counterpoint", notes: speciesTemplate(species, cf.length) };
        const staves = cantusBelow
            ? [{ clef: "treble", voices: [cpVoice] }, { clef: "bass", voices: [cfVoice] }]
            : [{ clef: "treble", voices: [cfVoice] }, { clef: "bass", voices: [cpVoice] }];
        const score = N.cleanScore({ title, key: { fifths, mode }, meter: METER, staves });
        return score && withStyle(Object.freeze({ kind: "species", species, cantusBelow, title: score.title, given: cantusBelow ? 1 : 0, numerals: Object.freeze([]), score }), style);
    }

    // ---- Cantus firmi of one's own (2.5.0): a line of whole notes in a mode,
    // written on one staff and checked as a cantus firmus; once whole, a
    // cantus to write species counterpoint against.

    const CANTUS_MODES = Object.freeze(["dorian", "phrygian", "lydian", "mixolydian", "aeolian", "ionian", "major", "minor"]);
    const CANTUS_LENGTH = Object.freeze({ min: 4, max: 32, shortest: 8, longest: 16, usual: 11 });
    // The finals a mode is offered on: those with no more than five sharps or flats.
    const CANTUS_FINALS = Object.freeze(["C", "D", "E", "F", "G", "A", "B", `B${FLAT}`, `E${FLAT}`, `A${FLAT}`, `F${SHARP}`, `C${SHARP}`]);
    const cantusFinals = mode => CANTUS_FINALS.filter(final => {
        const fifths = N.keyFifths(final, mode);
        return fifths !== null && Math.abs(fifths) <= 5;
    });

    // A cantus to write (its notes blank), or one with its pitches.
    function cantusExercise({ mode = "dorian", final = "D", clef = "treble", length = CANTUS_LENGTH.usual, pitches = null, title = "" }) {
        const fifths = N.keyFifths(final, mode);
        const count = pitches ? pitches.length : length;
        if (fifths === null || !CANTUS_MODES.includes(mode) || !["treble", "bass"].includes(clef)) return null;
        if (!Number.isInteger(count) || count < CANTUS_LENGTH.min || count > CANTUS_LENGTH.max) return null;
        const notes = Array.from({ length: count }, (_, index) => ({ p: pitches?.[index] ?? null, d: "w", dot: false, tie: false }));
        const score = N.cleanScore({ title, key: { fifths, mode }, meter: METER, staves: [{ clef, voices: [{ name: "Cantus firmus", notes }] }] });
        return score && Object.freeze({ kind: "cantus", title: score.title, given: -1, numerals: Object.freeze([]), score });
    }

    // ---- Melodies (2.6.0): one line in a key, for an instrument (melody.js
    // knows each one's range and how its part is written). Each bar begins as
    // four quarters to write; a rest is a rest, not a note still to write.
    const MELODY_BARS = Object.freeze({ min: 1, max: 32, usual: 8 });
    const melodyInstrument = id => globalThis.MaestroMelody?.INSTRUMENTS.find(each => each.id === id) ?? null;
    function melodyExercise({ tonic = "C", mode = "major", instrument = "concert", bars = MELODY_BARS.usual, notes = null, title = "" }) {
        const fifths = N.keyFifths(tonic, mode);
        const played = melodyInstrument(instrument);
        if (fifths === null || !CANTUS_MODES.includes(mode) || !played) return null;
        if (!notes && (!Number.isInteger(bars) || bars < MELODY_BARS.min || bars > MELODY_BARS.max)) return null;
        const line = notes ?? Array.from({ length: bars * 4 }, () => ({ p: null, d: "q", dot: false, tie: false }));
        const score = N.cleanScore({ title, key: { fifths, mode }, meter: METER, staves: [{ clef: played.clef, voices: [{ name: "Melody", notes: line }] }] });
        if (!score || N.bars(N.voicesOf(score)[0].notes, METER).bars.length > MELODY_BARS.max) return null;
        return Object.freeze({ kind: "melody", instrument, title: score.title, given: -1, numerals: Object.freeze([]), score });
    }

    // A melody's notes, the instrument and the key kept.
    function withMelodyNotes(exercise, notes) {
        return melodyExercise({ tonic: N.keyTonic(exercise.score.key.fifths, exercise.score.key.mode), mode: exercise.score.key.mode, instrument: exercise.instrument, notes, title: exercise.title }) ?? exercise;
    }

    // A melody's checker: its range on the instrument, wide and awkward leaps,
    // and how it ends. Warnings and suggestions only: a melody has no rules
    // to break, as counterpoint has.
    function checkMelody(exercise) {
        const list = [];
        const notes = N.voicesOf(exercise.score)[0].notes;
        const entries = N.timed(notes);
        const sounding = entries.filter(entry => entry.note.p && !entry.held);
        const played = melodyInstrument(exercise.instrument);
        const at = entry => [{ voice: 0, index: entry.index }];
        if (!sounding.length) {
            problem(list, "info", "empty", "Nothing written yet. A rest stays a rest.", null, []);
            return list;
        }
        if (played?.range) {
            const [low, high] = played.range;
            for (const entry of sounding) {
                const m = midi(entry.note.p);
                if (m < low || m > high) problem(list, "warning", "voiceRange", `${name(entry.note.p)} is ${m < low ? "below" : "above"} the range of the ${played.label[0].toLowerCase()}${played.label.slice(1)} (${name(N.pitchFromMidi(low, 0))}${DASH}${name(N.pitchFromMidi(high, 0))}, as it sounds).`, entry.onset, at(entry));
            }
        }
        for (let n = 1; n < sounding.length; n++) {
            const a = sounding[n - 1], b = sounding[n];
            const leap = N.interval(a.note.p, b.note.p);
            if (leap.number > 8) problem(list, "warning", "leap", `A leap of ${leap.name}, wider than an octave.`, b.onset, [...at(a), ...at(b)]);
            else if (/^[Ad]/.test(leap.quality) && leap.number > 1) problem(list, "info", "augmented", `A leap of ${leap.name}, an augmented or diminished interval: harder to sing or hear.`, b.onset, [...at(a), ...at(b)]);
        }
        const last = sounding.at(-1);
        const tonic = tonicOf(exercise.score.key);
        if (modulo(last.note.p.step - tonic.step, 7) !== 0 || last.note.p.alter !== tonic.alter) {
            problem(list, "info", "close", `It ends on ${N.pitchLetterName(last.note.p)}; ${N.pitchLetterName(tonic)}, the tonic, would close it.`, last.onset, at(last));
        }
        return sortProblems(list);
    }

    // A whole cantus as a species exercise takes it: its pitches, mode and
    // final. Null while a note is unwritten.
    function cantusOf(exercise) {
        if (exercise?.kind !== "cantus") return null;
        const notes = N.voicesOf(exercise.score)[0].notes;
        if (!notes.every(note => note.p)) return null;
        const { fifths, mode } = exercise.score.key;
        return { pitches: notes.map(note => note.p), mode, final: N.keyTonic(fifths, mode) };
    }

    // The cantus checker: the rules of a cantus firmus as errors and
    // warnings, and, as it's written, suggestions for what comes next.
    function checkCantus(exercise) {
        const key = exercise.score.key;
        const entries = N.timed(N.voicesOf(exercise.score)[0].notes);
        const count = entries.length;
        const list = [];
        const at = entry => [{ voice: 0, index: entry.index }];
        const written = entries.filter(entry => entry.note.p).map(entry => ({ ...entry, p: entry.note.p }));
        const unwritten = count - written.length;
        const finalName = N.pitchLetterName(degreePitch(key, 0));
        const secondName = N.pitchLetterName(degreePitch(key, 1));
        // The seventh degree as the mode has it, and raised when it's a whole step below the final.
        const seventh = degreePitch(key, 6);
        const finalAbove = N.pitch(seventh.step + 1, N.keyAlter(modulo(seventh.step + 1, 7), key.fifths));
        const leading = midi(finalAbove) - midi(seventh) === 1 ? seventh : N.pitch(seventh.step, seventh.alter + 1);
        const leadingName = N.pitchLetterName(leading);
        const fromBelow = key.mode !== "phrygian";
        if (unwritten) problem(list, "info", "unfinished", `${unwritten} ${unwritten === 1 ? "note" : "notes"} still to write.`, null, []);

        // The opening and the close: the final, reached by step from the
        // second degree or the raised leading tone.
        const first = entries[0], last = entries.at(-1), before = entries.at(-2);
        if (first.note.p && degreeOf(key, first.note.p) !== 0) problem(list, "error", "opening", `Begin on the final, ${finalName}.`, first.onset, at(first));
        if (last.note.p && degreeOf(key, last.note.p) !== 0) problem(list, "error", "close", `End on the final, ${finalName}.`, last.onset, at(last));
        if (before.note.p) {
            const degree = degreeOf(key, before.note.p);
            const lastIsFinal = last.note.p && degreeOf(key, last.note.p) === 0;
            const step = lastIsFinal ? last.note.p.step - before.note.p.step : (degree === 1 ? -1 : degree === 6 ? 1 : 0);
            if (lastIsFinal && Math.abs(step) !== 1) {
                problem(list, "error", "approach", "Reach the final by step.", last.onset, at(last));
            } else if (degree !== 1 && degree !== 6) {
                problem(list, "error", "penult", fromBelow ? `Before the last note, the second degree, ${secondName}, or the leading tone, ${leadingName}.` : `Before the last note, the second degree, ${secondName}.`, before.onset, at({ index: before.index }));
            } else if (step === 1 && !fromBelow) {
                problem(list, "error", "penult", `In Phrygian, reach the final from above: ${secondName} to ${finalName}.`, before.onset, at({ index: before.index }));
            } else if (step === 1) {
                const target = N.pitch(before.note.p.step + 1, N.keyAlter(modulo(before.note.p.step + 1, 7), key.fifths));
                if (midi(target) - midi(before.note.p) !== 1) problem(list, "error", "leading", `Raise the leading tone: ${leadingName}, a half step below the final.`, before.onset, at({ index: before.index }));
            }
        }

        // The line, note to note where both are written.
        const steps = [];
        for (let n = 1; n < written.length; n++) {
            const a = written[n - 1], b = written[n];
            if (b.index !== a.index + 1) continue;
            const step = b.p.step - a.p.step;
            steps.push({ step, at: b });
            const melodic = N.interval(a.p, b.p);
            if (midi(a.p) === midi(b.p)) problem(list, "error", "repeat", "A repeated note.", b.onset, at(b));
            else forbiddenLeap(list, melodic, step, b.onset, [...at(a), ...at(b)]);
            const c = written[n + 1];
            if (!c || c.index !== b.index + 1) continue;
            const after = c.p.step - b.p.step;
            if (Math.abs(step) >= 3 && !(Math.abs(after) === 1 && Math.sign(after) !== Math.sign(step))) {
                problem(list, "warning", "recover", `After a leap of ${melodic.name}, turn back by step.`, c.onset, at(c));
            }
            if (Math.abs(step) > 1 && Math.abs(after) > 1 && Math.sign(after) === Math.sign(step)) {
                const outline = N.interval(a.p, c.p);
                if (outline.number > 8 || !["P5", "P8", "M6", "m6", "P4", "M3", "m3"].includes(outline.simpleName === "P1" ? "P8" : outline.name)) {
                    problem(list, "warning", "leaps", `Two leaps the same way outline ${outline.name}.`, c.onset, at(c));
                }
            }
        }
        // A tritone outlined: three or more notes moving one way, from one end
        // of it to the other.
        const runs = [];
        written.forEach((note, n) => {
            const previous = written[n - 1];
            const run = runs.at(-1);
            const way = previous && note.index === previous.index + 1 ? Math.sign(note.p.step - previous.p.step) : 0;
            if (run && way !== 0 && (run.way === 0 || run.way === way)) {
                run.notes.push(note);
                run.way = way;
            } else runs.push({ notes: previous && way !== 0 ? [previous, note] : [note], way });
        });
        for (const { notes } of runs) {
            if (notes.length < 3) continue;
            const from = notes[0], to = notes.at(-1);
            if (["A4", "d5"].includes(N.interval(from.p, to.p).simpleName)) problem(list, "warning", "tritone", `The line outlines a tritone, ${N.pitchLetterName(from.p)} to ${N.pitchLetterName(to.p)}.`, to.onset, at(to));
        }
        // A figure of two moves repeated at once, unless it's a scale.
        for (let n = 3; n < steps.length; n++) {
            const [a, b, c, d] = steps.slice(n - 3, n + 1);
            const joined = [b, c, d].every((each, k) => each.at.index === [a, b, c][k].at.index + 1);
            if (joined && a.step === c.step && b.step === d.step && a.step !== b.step) problem(list, "warning", "sequence", "The same figure twice in a row; vary the line.", d.at.onset, at(d.at));
        }

        // The whole: its range, its high point, its notes and leaps.
        if (written.length > 1) {
            const pitches = written.map(note => midi(note.p));
            const low = written[pitches.indexOf(Math.min(...pitches))], high = written[pitches.indexOf(Math.max(...pitches))];
            const span = N.interval(low.p, high.p);
            if (span.number > 10) problem(list, "warning", "range", `The cantus spans ${span.name}; keep it within a tenth.`, null, []);
            const tops = written.filter(note => midi(note.p) === midi(high.p));
            if (!unwritten) {
                if (tops.length > 1) problem(list, "warning", "climax", `The highest note, ${N.pitchLetterName(high.p)}, comes ${tops.length} times; one high point is stronger.`, tops[1].onset, at(tops[1]));
                else if (high.index === 0 || high.index === count - 1) problem(list, "warning", "climax", `The high point is the ${high.index === 0 ? "first" : "last"} note; let the line rise to it in the middle.`, high.onset, at(high));
                if (span.number < 5) problem(list, "info", "narrow", `The cantus spans only ${span.name}; a sixth to a tenth gives it room.`, null, []);
                const leaps = steps.filter(each => Math.abs(each.step) > 1).length;
                if (leaps > steps.length / 2) problem(list, "info", "leapy", `${leaps} leaps in ${steps.length} moves; a cantus moves mostly by step.`, null, []);
                else if (!leaps) problem(list, "info", "stepwise", "Every move a step; a leap or two gives the line its shape.", null, []);
            }
            const counts = new Map();
            written.forEach(note => counts.set(midi(note.p), [...(counts.get(midi(note.p)) ?? []), note]));
            for (const notes of counts.values()) {
                if (notes.length > 3) problem(list, "info", "circling", `${N.pitchLetterName(notes[0].p)} comes ${notes.length} times; let the line travel.`, notes[3].onset, at(notes[3]));
            }
        }
        for (const note of written) {
            if (!allowedAlter(key, note.p)) problem(list, "error", "mode", `${N.pitchLetterName(note.p)} is outside the mode.`, note.onset, at(note));
            else if (note.p.alter !== N.keyAlter(modulo(note.p.step, 7), key.fifths) && note.index !== count - 2) {
                problem(list, "warning", "inflection", `${N.pitchLetterName(note.p)}: in a cantus, raise a note only for the leading tone at the close.`, note.onset, at(note));
            }
        }

        // Suggestions while it's written: what the next note wants.
        if (unwritten) {
            const next = entries.find(entry => !entry.note.p);
            const a = entries[next.index - 2]?.note.p, b = entries[next.index - 1]?.note.p;
            if (a && b && Math.abs(b.step - a.step) >= 3 && next.index < count - 1) {
                const up = b.step > a.step;
                problem(list, "info", "suggest", `After the leap ${up ? "up" : "down"}, step ${up ? "down" : "up"}.`, next.onset, at(next));
            }
            if (!before.note.p && !last.note.p && unwritten === 2) {
                problem(list, "info", "suggest", fromBelow ? `To close: ${secondName} then ${finalName}, or ${leadingName} then ${finalName}.` : `To close: ${secondName} then ${finalName}.`, before.onset, at({ index: before.index }));
            }
            if (written.length >= count / 2 && unwritten > 2) {
                const pitches = written.map(note => midi(note.p));
                if (Math.max(...pitches) <= midi(written[0].p)) problem(list, "info", "suggest", "Rise to a high point before the close.", next.onset, at(next));
            }
        }
        return sortProblems(list);
    }

    // ---- Checking

    // How an interval sounds against another voice.
    function consonance(i) {
        if (i.quality === "P" && (i.simple === 1 || i.simple === 5)) return "perfect";
        if ((i.quality === "M" || i.quality === "m") && (i.simple === 3 || i.simple === 6)) return "imperfect";
        return "dissonant";
    }
    const MELODIC = new Set(["m2", "M2", "m3", "M3", "P4", "P5", "P8"]);
    // A leap a cantus or a species line can't take, under the rule it breaks:
    // augmented or diminished, a sixth other than a minor sixth up, or a
    // seventh or past an octave. Hoisted: the checkers above use it.
    function forbiddenLeap(list, melodic, step, onset, at) {
        if (MELODIC.has(melodic.name) || (melodic.name === "m6" && step > 0)) return;
        if (/^[Ad]/.test(melodic.quality)) problem(list, "error", "augmented", `A leap of ${melodic.name}, an augmented or diminished interval.`, onset, at);
        else if (melodic.number === 6) problem(list, "error", "sixth", melodic.name === "m6" ? "A leap of a minor sixth down; a sixth leaps only up." : `A leap of ${melodic.name}; of the sixths, only a minor sixth up.`, onset, at);
        else problem(list, "error", "leap", `A leap of ${melodic.name}.`, onset, at);
    }
    const beatOf = onset => modulo(onset, BAR);
    const barOf = onset => Math.floor(onset / BAR) + 1;
    const motion = (a1, a2, b1, b2) => {
        const da = Math.sign(midi(a2) - midi(a1)), db = Math.sign(midi(b2) - midi(b1));
        if (da === 0 && db === 0) return "none";
        if (da === 0 || db === 0) return "oblique";
        return da === db ? "similar" : "contrary";
    };
    const intervalWord = i => ({ 1: "unison", 2: "second", 3: "third", 4: "fourth", 5: "fifth", 6: "sixth", 7: "seventh", 8: "octave" })[i.number] ?? (i.simple === 1 ? "octave" : `${i.number}th`);
    const perfectKind = i => (i.simple === 1 ? "octaves" : "fifths");
    const VOICE_WORDS = ["soprano", "alto", "tenor", "bass"];

    // ---- The checker's rules (2.11.0), each one named: the id every problem
    // carries, a name, the groups of 2.8.0 they sit in, and the kinds of
    // exercise each judges (s species, c cantus, f four parts, m melody).
    // A locked rule is a fundamental and is never switched off. A rule kept
    // to some styles is checked only in those (a kind without styles, the
    // cantus, always checks it). What's written so far, and a suggestion for
    // what comes next, are always shown.
    const RULE_SECTIONS = Object.freeze({ voices: "Between the voices", line: "Each line", ends: "Beginning and end", parts: "Four parts" });
    const RULE_GROUPS = Object.freeze([
        ["voices", "parallel", "Parallel fifths and octaves"],
        ["voices", "hidden", "Hidden fifths and octaves"],
        ["voices", "contrary", "Other fifths and octaves"],
        ["voices", "crossing", "Voices crossing and overlapping"],
        ["voices", "spacing", "Space between the voices"],
        ["voices", "unison", "Unisons inside the exercise"],
        ["voices", "dissonance", "Dissonances and suspensions"],
        ["voices", "eighths", "Eighths in fifth species"],
        ["voices", "run", "Long runs of thirds or sixths"],
        ["line", "leap", "Leaps: how wide, and which intervals"],
        ["line", "recover", "Turning back after a leap"],
        ["line", "leaps", "Two leaps the same way"],
        ["line", "repeat", "Repeated notes"],
        ["line", "tritone", "Outlined tritones"],
        ["line", "climax", "One high point"],
        ["line", "range", "Range"],
        ["line", "mode", "Notes outside the mode"],
        ["line", "shape", "Notes on the line's shape"],
        ["ends", "opening", "How it begins"],
        ["ends", "cadence", "The cadence"],
        ["parts", "chords", "Chords of the key, and their bass"],
        ["parts", "doubling", "Doubling the leading tone"],
        ["parts", "seventh", "The leading tone and sevenths"],
        ["parts", "nonchord", "Non-chord tones and suspensions"]
    ].map(([section, id, label]) => Object.freeze({ section, id, label })));
    const KIND_CODES = { s: "species", c: "cantus", f: "fourpart", m: "melody" };
    const RULES = Object.freeze([
        ["parallel", "parallel", "Parallel fifths and octaves, note to note", "sf", { locked: true }],
        ["parallel", "downbeats", "Fifths and octaves on successive downbeats", "s", { locked: true }],
        ["hidden", "hidden", "Hidden fifths and octaves", "sf", { locked: true }],
        ["contrary", "contrary", "Fifths and octaves by contrary motion", "f"],
        ["contrary", "unequal", "A diminished fifth to a perfect fifth, with the bass", "f"],
        ["crossing", "crossing", "Voices crossing", "sf", { locked: true }],
        ["crossing", "overlap", "Voices overlapping", "f"],
        ["spacing", "spacing", "Upper voices within an octave", "f"],
        ["spacing", "bassSpacing", "Tenor and bass within a twelfth", "f", { styles: ["bach"] }],
        ["spacing", "apart", "Voices within a twelfth", "s"],
        ["unison", "unison", "No unison inside the exercise", "s"],
        ["dissonance", "consonant", "Only consonances in first species", "s", { locked: true }],
        ["dissonance", "strongBeat", "A consonance on the downbeat", "s", { locked: true }],
        ["dissonance", "weakBeat", "Dissonances pass, or turn back, by step", "s", { locked: true }],
        ["dissonance", "preparation", "A suspension prepared by a consonance", "s", { locked: true }],
        ["dissonance", "suspension", "A suspension resolves down by step", "s", { locked: true }],
        ["dissonance", "ninthEighth", `The 9${DASH}8 suspension above`, "s", { styles: ["fux"] }],
        ["eighths", "eighths", "Eighths in pairs, by step", "s"],
        ["run", "run", "No more than three thirds or sixths in a row", "s", { styles: ["renaissance"] }],
        ["leap", "leap", "No leap of a seventh, or past an octave", "scfm"],
        ["leap", "sixth", "A sixth only as a minor sixth up", "sc"],
        ["leap", "augmented", "Augmented and diminished leaps", "scfm"],
        ["recover", "recover", "Back by step after a leap", "sc"],
        ["leaps", "leaps", "Two leaps the same way", "sc"],
        ["repeat", "repeat", "Repeated notes", "sc"],
        ["tritone", "tritone", "An outlined tritone", "c"],
        ["climax", "climax", "One high point", "sc", { styles: ["renaissance"] }],
        ["range", "range", "Within a tenth", "sc"],
        ["range", "voiceRange", "Each voice in its range", "fm"],
        ["mode", "mode", "Notes of the mode", "sc"],
        ["mode", "inflection", "A note raised only at the close", "c"],
        ["shape", "circling", "No note too often", "c"],
        ["shape", "leapy", "Mostly steps", "c"],
        ["shape", "narrow", "Room enough: a fifth or more", "c"],
        ["shape", "stepwise", "A leap or two", "c"],
        ["shape", "sequence", "No figure repeated at once", "c"],
        ["opening", "opening", "How it begins", "sc"],
        ["cadence", "close", "How it ends", "scm"],
        ["cadence", "approach", "The last note reached by step", "sc"],
        ["cadence", "penult", "The note before the last", "c"],
        ["cadence", "leading", "The leading tone raised at the close", "sc"],
        ["chords", "chord", "The chord asked for, or one of the key", "f"],
        ["chords", "inversion", "The bass asked for", "f"],
        ["chords", "third", "Each chord with its third", "f"],
        ["doubling", "doubled", "No doubled leading tone", "f", { locked: true }],
        ["seventh", "leadingTone", "The leading tone rises to the tonic", "f", { locked: true }],
        ["seventh", "seventh", "A seventh falls by step", "f", { locked: true }],
        ["nonchord", "nonchord", "Non-chord tones approached and left as one", "f", { locked: true }],
        ["nonchord", "suspend", "A suspension prepared and resolved", "f", { locked: true }],
        ["nonchord", "doubledres", "A suspension's resolution not doubled", "f"]
    ].map(([group, id, label, kinds, { locked = false, styles = null } = {}]) => Object.freeze({
        group, id, label, locked, styles: styles && Object.freeze(styles),
        kinds: Object.freeze([...kinds].map(code => KIND_CODES[code]))
    })));
    const ruleById = id => RULES.find(rule => rule.id === id) ?? null;
    const RULES_ALWAYS = Object.freeze(["empty", "unfinished", "suggest"]);

    // The styles (2.11.0): where the sources differ, each kind's rules as one
    // tradition has them. The first is the kind's own; an exercise keeps its
    // style, and one without a style is in the first.
    const STYLES = Object.freeze({
        species: Object.freeze([
            Object.freeze({ id: "fux", label: "Fux, strict", note: "Fux's Gradus ad Parnassum (1725): hidden fifths and octaves by any similar motion, fifths on successive downbeats an error, 9-8 above a weaker suspension" }),
            Object.freeze({ id: "renaissance", label: "Renaissance", note: "As Jeppesen and Open Music Theory teach it: hidden fifths and octaves only when the upper voice leaps, a warning for fifths on successive downbeats in third species, and their guidelines for runs of thirds and the high point" })
        ]),
        fourpart: Object.freeze([
            Object.freeze({ id: "common", label: "Common practice", note: "As Kostka and Payne's Tonal Harmony has it: tenor and bass as far apart as needed" }),
            Object.freeze({ id: "bach", label: "Bach chorales", note: "As Bach's chorales are written: tenor and bass within a twelfth, octaves by contrary motion in the outer voices at the close" })
        ])
    });
    const stylesOf = kind => STYLES[kind] ?? null;
    const styleOf = exercise => {
        const list = stylesOf(exercise?.kind);
        if (!list) return null;
        return list.some(style => style.id === exercise.style) ? exercise.style : list[0].id;
    };
    // An exercise in another style: unknown styles, and kinds without them, unchanged.
    function withStyle(exercise, style) {
        const list = stylesOf(exercise?.kind);
        if (!list?.some(each => each.id === style) || styleOf(exercise) === style) return exercise;
        return Object.freeze({ ...exercise, style });
    }
    // Whether a rule judges an exercise of this kind, in its style.
    const ruleApplies = (rule, exercise) => rule.kinds.includes(exercise.kind) && (!rule.styles || !stylesOf(exercise.kind) || rule.styles.includes(styleOf(exercise)));
    const rulesFor = exercise => RULES.filter(rule => ruleApplies(rule, exercise));

    // Essentials: only what breaks the voices' independence, the dissonance
    // treatment, and the chords themselves; Strict, every rule.
    const RULE_ESSENTIALS = Object.freeze(["parallel", "hidden", "crossing", "dissonance", "chords", "doubling", "seventh", "nonchord"]);
    const RULE_PRESETS = Object.freeze({
        strict: Object.freeze([]),
        essentials: Object.freeze(RULES.filter(rule => !rule.locked && !RULE_ESSENTIALS.includes(rule.group)).map(rule => rule.id))
    });

    // The rules switched off, as stored: known ids that may be switched off,
    // once each, in order.
    function cleanRulesOff(list) {
        if (!Array.isArray(list)) return [];
        return RULES.filter(rule => !rule.locked && list.includes(rule.id)).map(rule => rule.id);
    }
    // Before 2.11.0 whole groups were switched off: their rules, now.
    const rulesOfGroups = groups => (Array.isArray(groups) ? cleanRulesOff(RULES.filter(rule => groups.includes(rule.group)).map(rule => rule.id)) : []);

    // The problems the rules still on report. A locked rule always reports.
    function withRules(problems, off) {
        const quiet = new Set(cleanRulesOff(off));
        return problems.filter(each => !quiet.has(each.rule));
    }

    // Problems: { level: "error" | "warning" | "info", rule, text, bar, at: [{ voice, index }] }.
    function problem(list, level, rule, text, onset, at) {
        list.push(Object.freeze({ level, rule, text, bar: onset === null ? 0 : barOf(onset), at: Object.freeze(at) }));
    }

    function checkSpecies(exercise) {
        const { score, species } = exercise;
        const key = score.key;
        const voices = N.voicesOf(score);
        const cfIndex = exercise.given, cpIndex = 1 - cfIndex;
        const cpAbove = cpIndex === 0;
        const cp = N.timed(voices[cpIndex].notes);
        const cf = N.timed(voices[cfIndex].notes);
        const list = [];
        const cfAt = time => cf.find(entry => entry.onset <= time && time < entry.onset + entry.length);
        // The notes written so far, struck or held, with the cantus under each.
        const notes = cp.filter(entry => entry.note.p).map(entry => {
            const under = cfAt(entry.onset);
            const upper = cpAbove ? entry.note.p : under.note.p, lower = cpAbove ? under.note.p : entry.note.p;
            return { ...entry, p: entry.note.p, cf: under, vertical: N.interval(lower, upper), crossed: midi(upper) < midi(lower) };
        });
        const opening = cp.findIndex(entry => entry.note.p);
        const unwritten = cp.filter((entry, index) => !entry.note.p && !(index === 0 && species > 1)).length;
        if (unwritten) problem(list, "info", "unfinished", `${unwritten} ${unwritten === 1 ? "note" : "notes"} still to write.`, null, []);
        const at = entry => [{ voice: cpIndex, index: entry.index }];
        const struck = notes.filter(note => !note.held);
        const strict = styleOf(exercise) === "fux";
        // The double neighbor (2.11.0), as Open Music Theory has it: in a bar
        // of quarters the first and last notes the same, the two between a
        // step above and below it (either order), and the line going on the
        // same way into the next downbeat (once that's written).
        const doubleNeighbor = n => {
            const beat = beatOf(notes[n].onset);
            const start = beat === 2 ? n - 1 : beat === 4 ? n - 2 : -1;
            const figure = start >= 0 ? notes.slice(start, start + 4) : [];
            if (figure.length !== 4 || figure.some((note, k) => N.lengthOf(note.note) !== 2 || beatOf(note.onset) !== 2 * k || barOf(note.onset) !== barOf(figure[0].onset))) return false;
            const [first, second, third, last] = figure;
            if (midi(first.p) !== midi(last.p)) return false;
            if ([second.p.step - first.p.step, third.p.step - first.p.step].sort((a, b) => a - b).join() !== "-1,1") return false;
            const after = notes[start + 4];
            return !after || Math.sign(after.p.step - last.p.step) === Math.sign(last.p.step - third.p.step);
        };

        notes.forEach((note, n) => {
            const beat = beatOf(note.onset);
            const kind = consonance(note.vertical);
            const previous = notes[n - 1], next = notes[n + 1];
            const stepIn = previous && Math.abs(note.p.step - previous.p.step) === 1;
            const stepOut = next && Math.abs(next.p.step - note.p.step) === 1;
            const sameWay = previous && next && Math.sign(note.p.step - previous.p.step) === Math.sign(next.p.step - note.p.step);
            const passing = stepIn && stepOut && sameWay;
            const neighbor = stepIn && stepOut && !sameWay && midi(next.p) === midi(previous.p);
            const word = `a ${note.vertical.name} (${intervalWord(note.vertical)})`;
            if (note.crossed) problem(list, "error", "crossing", `The counterpoint crosses the cantus firmus.`, note.onset, at(note));
            if (kind === "dissonant") {
                const strong = beat === 0 || (beat === 4 && species === 5 && N.lengthOf(note.note) >= 4);
                if (note.held) {
                    // A suspension: resolved down by step onto a consonance.
                    const resolves = next && !next.held && next.p.step === note.p.step - 1 && consonance(next.vertical) !== "dissonant";
                    if (!resolves) problem(list, "error", "suspension", `A suspension, ${word}, should resolve down by step to a consonance.`, note.onset, at(note));
                    // 9-8 (or 2-1) above the cantus: in the strict style a weaker suspension than 7-6 and 4-3.
                    else if (strict && cpAbove && note.vertical.simple === 2) problem(list, "warning", "ninthEighth", `A 9${DASH}8 suspension: in the strict style, 7${DASH}6 and 4${DASH}3 are the suspensions above the cantus.`, note.onset, at(note));
                } else if (species === 1) {
                    problem(list, "error", "consonant", `A dissonance: ${word}. First species uses only consonances.`, note.onset, at(note));
                } else if (species === 4 && note.note.tie) {
                    // The fourth species' preparation: a note tied over the bar line.
                    problem(list, "error", "preparation", `The note before a tie must be consonant, not ${word}.`, note.onset, at(note));
                } else if (strong) {
                    problem(list, "error", "strongBeat", `A dissonance on the downbeat: ${word}.`, note.onset, at(note));
                } else {
                    // Untied in the fourth species (2.11.0), the syncopation is broken and the
                    // bar is written as in the second: a weak-beat dissonance passes by step.
                    const freer = species === 3 || species === 5;
                    const cambiata = freer && stepIn && previous.p.step > note.p.step && next && next.p.step === note.p.step - 2 && notes[n + 2] && notes[n + 2].p.step === next.p.step + 1;
                    const allowed = passing || (freer && (neighbor || cambiata || doubleNeighbor(n)));
                    if (!allowed) problem(list, "error", "weakBeat", freer ? `A dissonance must pass, or turn back, by step: ${word}.` : `A dissonance on the weak beat must pass by step: ${word}.`, note.onset, at(note));
                }
            }
            if (note.vertical.simple === 1 && note.vertical.number === 1 && n > 0 && n < notes.length - 1 && beat === 0 && !note.held) {
                problem(list, "error", "unison", "A unison in the middle of the exercise: the voices merge.", note.onset, at(note));
            }
        });

        // The opening: a perfect consonance, never a fifth below the cantus.
        const first = struck[0];
        if (first) {
            const ok = cpAbove ? ["P1", "P5", "P8"].includes(first.vertical.simpleName) : first.vertical.simpleName === "P1";
            if (!ok) problem(list, "error", "opening", cpAbove ? `Begin on a unison, fifth or octave, not ${first.vertical.name}.` : `Below the cantus, begin on a unison or octave, not ${first.vertical.name}.`, first.onset, at(first));
        }
        // The close: an octave or unison, reached by step, the leading tone raised.
        const last = notes.at(-1);
        if (!unwritten && last) {
            if (last.vertical.simpleName !== "P1") problem(list, "error", "close", `End on a unison or octave, not ${last.vertical.name}.`, last.onset, at(last));
            const before = struck.at(-2);
            if (before) {
                const step = last.p.step - before.p.step;
                if (Math.abs(step) !== 1) problem(list, "error", "approach", "Reach the last note by step.", last.onset, at(last));
                else if (step === 1 && midi(last.p) - midi(before.p) !== 1 && key.mode !== "phrygian") {
                    const raised = N.pitch(before.p.step, before.p.alter + 1);
                    problem(list, "error", "leading", `Raise the leading tone: ${N.pitchLetterName(raised)}, a half step below the final.`, before.onset, at(before));
                }
            }
        }

        // Parallels and hidden perfect intervals, note to note (and in the
        // second and third species from downbeat to downbeat).
        const pairs = [];
        for (let n = 1; n < struck.length; n++) pairs.push([struck[n - 1], struck[n], "next"]);
        if (species === 2 || species === 3) {
            const downs = struck.filter(note => beatOf(note.onset) === 0);
            for (let n = 1; n < downs.length; n++) if (barOf(downs[n].onset) === barOf(downs[n - 1].onset) + 1) pairs.push([downs[n - 1], downs[n], "downbeats"]);
        }
        for (const [a, b, how] of pairs) {
            const cpA = a.p, cpB = b.p, cfA = a.cf.note.p, cfB = b.cf.note.p;
            const move = motion(cpA, cpB, cfA, cfB);
            if (consonance(b.vertical) !== "perfect" || move === "oblique" || move === "none") continue;
            const same = consonance(a.vertical) === "perfect" && a.vertical.simple === b.vertical.simple;
            if (same && move === "similar") {
                // On successive downbeats in third species: an error in the strict style, a warning in the Renaissance style.
                if (how === "downbeats") problem(list, species === 3 && !strict ? "warning" : "error", "downbeats", `Parallel ${perfectKind(b.vertical)} on successive downbeats.`, b.onset, [...at(a), ...at(b)]);
                else problem(list, "error", "parallel", `Parallel ${perfectKind(b.vertical)}.`, b.onset, [...at(a), ...at(b)]);
            } else if (move === "similar" && how === "next") {
                // Fux reaches a perfect consonance only by contrary or oblique motion;
                // The Renaissance style minds similar motion only when the upper voice leaps.
                const upperA = cpAbove ? cpA : cfA, upperB = cpAbove ? cpB : cfB;
                if (strict) problem(list, "error", "hidden", `Hidden ${perfectKind(b.vertical)}: both voices move the same way into a perfect interval.`, b.onset, at(b));
                else if (Math.abs(upperB.step - upperA.step) > 1) problem(list, "error", "hidden", `Hidden ${perfectKind(b.vertical)}: both voices move the same way into a perfect interval, the upper by leap.`, b.onset, at(b));
            }
        }

        // The line: its leaps, repeats, range and highest note.
        for (let n = 1; n < struck.length; n++) {
            const a = struck[n - 1], b = struck[n];
            if (notes.indexOf(b) !== notes.indexOf(a) + 1 && !notes.slice(notes.indexOf(a) + 1, notes.indexOf(b)).every(note => note.held)) continue;
            const melodic = N.interval(a.p, b.p);
            const step = b.p.step - a.p.step;
            if (midi(a.p) === midi(b.p)) {
                problem(list, species === 2 || species === 3 ? "error" : "warning", "repeat", "A repeated note.", b.onset, at(b));
            } else forbiddenLeap(list, melodic, step, b.onset, [...at(a), ...at(b)]);
            const c = struck[n + 1];
            if (Math.abs(step) >= 3 && c) {
                const after = c.p.step - b.p.step;
                if (!(Math.abs(after) === 1 && Math.sign(after) !== Math.sign(step))) problem(list, "warning", "recover", `After a leap of ${N.interval(a.p, b.p).name}, turn back by step.`, c.onset, at(c));
            }
            if (c && Math.abs(step) > 1) {
                const after = c.p.step - b.p.step;
                if (Math.abs(after) > 1 && Math.sign(after) === Math.sign(step)) {
                    const outline = N.interval(a.p, c.p);
                    if (outline.number > 8 || !["P5", "P8", "M6", "m6", "P4", "M3", "m3"].includes(outline.simpleName === "P1" ? "P8" : outline.name)) {
                        problem(list, "warning", "leaps", `Two leaps the same way outline ${outline.name}.`, c.onset, at(c));
                    }
                }
            }
        }
        if (struck.length > 1) {
            const pitches = struck.map(note => midi(note.p));
            const span = N.interval(struck[pitches.indexOf(Math.min(...pitches))].p, struck[pitches.indexOf(Math.max(...pitches))].p);
            if (span.number > 10) problem(list, "warning", "range", `The counterpoint spans ${span.name}; keep it within a tenth.`, null, []);
            const top = Math.max(...pitches);
            const tops = struck.filter(note => midi(note.p) === top);
            if (!strict && tops.length > 1 && !unwritten) problem(list, "warning", "climax", `The highest note, ${N.pitchLetterName(tops[0].p)}, comes ${tops.length} times; one high point is stronger.`, tops[1].onset, at(tops[1]));
        }
        for (const note of struck) {
            if (note.vertical.number > 12) problem(list, "warning", "apart", "The voices are more than a twelfth apart.", note.onset, at(note));
            if (!allowedAlter(key, note.p)) problem(list, "error", "mode", `${N.pitchLetterName(note.p)} is outside the mode.`, note.onset, at(note));
        }
        // Too many thirds or sixths in a row, downbeat to downbeat.
        const downs = struck.filter(note => beatOf(note.onset) === 0);
        let run = 1;
        for (let n = 1; n < downs.length; n++) {
            const same = consonance(downs[n].vertical) === "imperfect" && downs[n].vertical.simple === downs[n - 1].vertical.simple;
            run = same ? run + 1 : 1;
            if (!strict && run === 4) problem(list, "warning", "run", `Four ${downs[n].vertical.simple === 3 ? "thirds" : "sixths"} in a row; vary the intervals.`, downs[n].onset, at(downs[n]));
        }
        // Fifth species: eighths come in pairs on a weak beat, by step.
        if (species === 5) {
            const eighths = notes.filter(note => note.note.d === "e");
            for (let n = 0; n < eighths.length; n += 2) {
                const a = eighths[n], b = eighths[n + 1];
                const pair = b && b.onset === a.onset + 1 && (beatOf(a.onset) === 2 || beatOf(a.onset) === 6) && Math.abs(b.p.step - a.p.step) === 1;
                if (!pair) {
                    problem(list, "error", "eighths", "Eighths come in pairs, on the second or fourth beat, moving by step.", a.onset, at(a));
                    if (b && b.onset !== a.onset + 1) n -= 1;
                }
            }
        }
        return sortProblems(list);
    }

    const LEVELS = { error: 0, warning: 1, info: 2 };
    const sortProblems = list => Object.freeze([...list].sort((a, b) => (a.level === "info") - (b.level === "info") || a.bar - b.bar || LEVELS[a.level] - LEVELS[b.level]));

    // ---- Four-part writing: chords from numerals

    // A numeral as kept: ASCII, "o" for diminished and "h" for half-
    // diminished, a figure for the inversion, and a target for a secondary:
    // I, ii6, IV64, V7, V65, viio43, iih42, V7/V, viio7/ii.
    const NUMERAL = /^(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(o|h|\+)?(7|65|43|42|64|6)?(?:\/(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i))?$/;
    const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
    const FIGURES = { "": [0, false], 6: [1, false], 64: [2, false], 7: [0, true], 65: [1, true], 43: [2, true], 42: [3, true] };

    // The scale a chord is built from: the key's (in minor, the leading tone
    // raised for V and vii), or for a secondary, the major key of its target.
    function chordFromNumeral(text, key) {
        const match = NUMERAL.exec(String(text ?? ""));
        if (!match) return null;
        const [, numeral, quality = "", figure = "", target] = match;
        const [inversion, seventh] = FIGURES[figure];
        const degree = ROMAN.indexOf(numeral.toUpperCase());
        const minor = ["minor", "aeolian"].includes(key.mode);
        let tones;
        if (target) {
            const targetDegree = ROMAN.indexOf(target.toUpperCase());
            const targetRoot = spellDegree(key, targetDegree, minor && targetDegree === 6);
            const major = { fifths: N.keyFifths(N.pitchLetterName(N.pitch(targetRoot.letter, targetRoot.alter)), "major"), mode: "major" };
            if (major.fifths === null) return null;
            tones = stack(major, degree, seventh, false);
        } else {
            tones = stack(key, degree, seventh, minor && (degree === 4 || degree === 6));
        }
        const pcs = tones.map(tone => modulo(N.NATURAL[tone.letter] + tone.alter, 12));
        return Object.freeze({ numeral: text, tones: Object.freeze(tones), pcs: Object.freeze(pcs), inversion, seventh, bass: tones[inversion], bassPc: pcs[inversion], quality, lower: numeral === numeral.toLowerCase() });
    }

    function spellDegree(key, degree, raise) {
        const tonic = tonicOf(key);
        const letter = modulo(tonic.step + degree, 7);
        return { letter, alter: N.keyAlter(letter, key.fifths) + (raise ? 1 : 0) };
    }

    // A chord's notes by thirds from a degree: root, third, fifth (seventh).
    function stack(key, degree, seventh, raiseLeading) {
        const tones = [];
        const leading = modulo(tonicOf(key).step + 6, 7);
        for (let k = 0; k < (seventh ? 4 : 3); k++) {
            const tone = spellDegree(key, degree + 2 * k, false);
            if (raiseLeading && tone.letter === leading) tone.alter += 1;
            tones.push(Object.freeze(tone));
        }
        return tones;
    }

    // The figures under a bass for a chord: its inversion's (6, 6 4, 7, 6 5,
    // 4 3, 4 2), each with the accidental its note needs against the key; a
    // third that needs one is shown by the accidental alone.
    function figuresFor(chord, key) {
        const base = chord.seventh ? [["7"], ["6", "5"], ["4", "3"], ["4", "2"]][chord.inversion] : [[], ["6"], ["6", "4"]][chord.inversion];
        const figures = [...base];
        const bass = chord.bass;
        chord.tones.forEach((tone, index) => {
            if (index === chord.inversion) return;
            if (tone.alter === N.keyAlter(tone.letter, key.fifths)) return;
            const number = String(modulo(tone.letter - bass.letter, 7) + 1);
            const sign = SIGN[String(tone.alter)];
            const at = figures.indexOf(number);
            if (at >= 0) figures[at] = sign + number;
            else if (number === "3") figures.push(sign);
            else figures.push(sign + number);
        });
        return Object.freeze(figures);
    }

    // How a numeral is shown: the numeral, its quality sign, its figures
    // stacked after it, and a target: { numeral, figures, target }.
    function numeralParts(text) {
        const match = NUMERAL.exec(String(text ?? ""));
        if (!match) return null;
        const [, numeral, quality = "", figure = "", target = ""] = match;
        const sign = quality === "o" ? DIM : quality === "h" ? HALF_DIM : quality;
        const figures = { "": [], 6: ["6"], 64: ["6", "4"], 7: ["7"], 65: ["6", "5"], 43: ["4", "3"], 42: ["4", "2"] }[figure];
        return Object.freeze({ numeral: numeral + sign, figures: Object.freeze(figures), target: target ? `/${target}` : "" });
    }
    const numeralText = text => {
        const parts = numeralParts(text);
        return parts ? parts.numeral + parts.figures.join("") + parts.target : String(text ?? "");
    };

    // The chords a key offers for analysis: each degree's triad and seventh
    // (minor with its raised leading tone in V and vii), and the dominants of V.
    function keyChords(key) {
        const minor = ["minor", "aeolian"].includes(key.mode);
        const triads = minor ? ["i", "iio", "III", "iv", "V", "VI", "viio"] : ["I", "ii", "iii", "IV", "V", "vi", "viio"];
        const sevenths = minor ? ["i7", "iih7", "III7", "iv7", "V7", "VI7", "viio7"] : ["I7", "ii7", "iii7", "IV7", "V7", "vi7", "viih7"];
        return [...triads, ...sevenths, "V/V", "V7/V"].map(text => chordFromNumeral(text, key)).filter(Boolean);
    }

    // Four notes as a numeral with its figures, or null: the key's chord whose
    // notes these are, its root and third present (its seventh, for a seventh
    // chord), the bass naming the inversion.
    function analyze(pitches, key, known = keyChords(key)) {
        const sounding = pitches.filter(Boolean);
        if (sounding.length < 3) return null;
        const pcs = new Set(sounding.map(p => modulo(midi(p), 12)));
        const bassPc = modulo(midi(sounding.reduce((low, p) => (midi(p) < midi(low) ? p : low))), 12);
        const fits = known.filter(chord => [...pcs].every(pc => chord.pcs.includes(pc)) && pcs.has(chord.pcs[0]) && pcs.has(chord.pcs[1]) && (!chord.seventh || pcs.has(chord.pcs[3])) && chord.pcs.includes(bassPc));
        if (!fits.length) return null;
        const chord = fits.sort((a, b) => Number(a.seventh) - Number(b.seventh) || a.numeral.length - b.numeral.length)[0];
        const inversion = chord.pcs.indexOf(bassPc);
        const figure = chord.seventh ? ["7", "65", "43", "42"][inversion] : ["", "6", "64"][inversion];
        const [main, target] = chord.numeral.split("/");
        const plain = main.replace(/7$/, "");
        return Object.freeze({ numeral: plain + figure + (target ? `/${target}` : ""), chord: chordFromNumeral(plain + figure + (target ? `/${target}` : ""), key) });
    }

    // ---- Four-part exercises

    const PROGRESSIONS = Object.freeze({
        major: Object.freeze([
            ["I", "IV", "V", "I"], ["I", "vi", "ii6", "V", "I"], ["I", "ii65", "V7", "I"], ["I", "IV6", "V6", "I"], ["I", "IV", "I64", "V", "I"],
            ["I", "V6", "vi", "IV", "V7", "I"], ["I", "V43", "I6", "IV", "V7", "I"], ["I", "vi", "IV", "ii6", "V7", "vi"], ["I", "ii6", "V/V", "V", "I"],
            ["I", "IV", "viio6", "I6", "ii6", "V", "I"], ["I", "V65", "I", "IV", "V42", "I6", "V", "I"]
        ].map(Object.freeze)),
        minor: Object.freeze([
            ["i", "iv", "V", "i"], ["i", "iv6", "V", "i"], ["i", "iio6", "V7", "i"], ["i", "VI", "iv", "V", "i"], ["i", "iv", "i64", "V", "i"],
            ["i", "V65", "i", "iv6", "V", "i"], ["i", "VI", "iio6", "V7", "VI"], ["i", "iv", "viio7", "i"]
        ].map(Object.freeze))
    });
    const FOURPART_KEYS = Object.freeze({ major: ["C", "G", "D", "F", `B${FLAT}`, `E${FLAT}`], minor: ["A", "E", "D", "G", "C"] });
    const RANGES = Object.freeze([[60, 79], [55, 74], [48, 67], [40, 60]]);   // soprano C4\u2013G5, alto G3\u2013D5, tenor C3\u2013G4, bass E2\u2013C4
    const FORMS = ["numerals", "figured", "soprano"];

    // The chords' rhythm: a half note each, the last a whole note when it
    // begins a bar.
    function chordRhythm(count) {
        return Array.from({ length: count }, (_, index) => (index === count - 1 && (index * 4) % BAR === 0 ? "w" : "h"));
    }

    // A line through the chords, as smooth as it can be: each chord offers
    // pitches (MIDI), and the cheapest path wins; random only breaks ties.
    function smoothLine(options, cost, random) {
        let best = options[0].map(value => ({ value, total: cost(null, value, 0) + random() * 0.01, path: [value] }));
        for (let k = 1; k < options.length; k++) {
            best = options[k].map(value => {
                const from = best.map(each => ({ each, total: each.total + cost(each.value, value, k) + random() * 0.01 })).sort((a, b) => a.total - b.total)[0];
                return { value, total: from.total, path: [...from.each.path, value] };
            });
        }
        return best.sort((a, b) => a.total - b.total)[0].path;
    }
    const inRange = (pcs, [low, high]) => {
        const values = [];
        for (let m = low; m <= high; m++) if (pcs.includes(modulo(m, 12))) values.push(m);
        return values;
    };

    // A pitch for a MIDI note sounding a chord's tone: spelled as the chord spells it.
    function spellAs(value, chord) {
        const tone = chord.tones.find(each => modulo(N.NATURAL[each.letter] + each.alter, 12) === modulo(value, 12));
        if (!tone) return null;
        const octave = Math.round((value - tone.alter - N.NATURAL[tone.letter]) / 12) - 1;
        return N.pitch(tone.letter + 7 * octave, tone.alter);
    }

    // Embellished (2.11.0), the given bass or soprano has non-chord tones: it's
    // taken from a model answer given them in that voice alone, so the other
    // voices can always be written under or over it.
    function fourPartExercise({ form = "numerals", tonic = "C", mode = "major", progression = null, random = Math.random, title = "", embellished = false, style = null }) {
        if (!FORMS.includes(form) || !["major", "minor"].includes(mode)) return null;
        const fifths = N.keyFifths(tonic, mode);
        if (fifths === null) return null;
        const key = { fifths, mode };
        const numerals = progression ?? PROGRESSIONS[mode][Math.floor(random() * PROGRESSIONS[mode].length)];
        const chords = numerals.map(text => chordFromNumeral(text, key));
        if (chords.some(chord => !chord)) return null;
        const rhythm = chordRhythm(chords.length);
        const blank = () => rhythm.map(d => ({ p: null, d, dot: false, tie: false }));
        const voices = [blank(), blank(), blank(), blank()];
        let given = -1;
        const decorated = (model, voice) => N.voicesOf(embellishFourPart(model, { voices: [voice], random }).score)[voice].notes.map(note => ({ ...note }));
        if (form === "figured" && embellished) {
            const free = fourPartExercise({ form: "numerals", tonic, mode, progression: numerals, title, style });
            const model = free && modelAnswer(free, { random });
            if (model) {
                voices[3] = decorated(model, 3);
                given = 3;
            }
        }
        if (form === "figured" && given < 0) {
            const line = smoothLine(chords.map(chord => inRange([chord.bassPc], RANGES[3])), (from, to, k) => (from === null ? Math.abs(to - 48) / 4 : Math.abs(to - from) + (Math.abs(to - from) > 7 ? 6 : 0)) + (k === chords.length - 1 && to > 52 ? 4 : 0), random);
            voices[3] = line.map((value, k) => ({ p: spellAs(value, chords[k]), d: rhythm[k], dot: false, tie: false }));
            given = 3;
        } else if (form === "soprano") {
            // A soprano from a model answer (2.6.0), so the other three voices
            // can always be written under it: of a few, best one ending on the
            // last chord's root and moving no more than a fourth at a time, else
            // the smoothest. With none, one drawn as before.
            const free = fourPartExercise({ form: "numerals", tonic, mode, progression: numerals, title, style });
            const rootPc = chords.at(-1).pcs[0];
            let smoothest = null;
            for (let tries = 0; tries < 6 && free; tries++) {
                const model = modelAnswer(free, { random });
                const line = model && N.voicesOf(model.score)[0].notes;
                if (!line) continue;
                const widest = Math.max(...line.map((note, at) => (at ? Math.abs(midi(note.p) - midi(line[at - 1].p)) : 0)));
                const cost = widest + (modulo(midi(line.at(-1).p), 12) === rootPc ? 0 : 10);
                if (!smoothest || cost < smoothest.cost) smoothest = { line, cost, model };
                if (cost <= 5) break;
            }
            if (smoothest) {
                voices[0] = embellished ? decorated(smoothest.model, 0) : smoothest.line.map(note => ({ ...note }));
                given = 0;
            }
        }
        if (form === "soprano" && given < 0) {
            const tonicPc = chords.at(-1).pcs[0];
            const line = smoothLine(chords.map((chord, k) => {
                const tones = k === chords.length - 1 ? [tonicPc] : chord.pcs.slice(0, 3);
                return inRange(tones, [62, 77]);
            }), (from, to, k) => {
                if (from === null) return Math.abs(to - 69) / 6;
                const leap = Math.abs(to - from);
                let cost = leap + (leap > 5 ? 8 : 0) + (leap === 0 ? 2 : 0);
                // A leading tone in the soprano rises to the tonic.
                const previous = chords[k - 1];
                const leading = modulo(tonicPc - 1, 12);
                if (modulo(from, 12) === leading && previous.pcs.includes(leading) && (to - from !== 1)) cost += 50;
                return cost;
            }, random);
            voices[0] = line.map((value, k) => ({ p: spellAs(value, chords[k]), d: rhythm[k], dot: false, tie: false }));
            given = 0;
        }
        const named = ["Soprano", "Alto", "Tenor", "Bass"].map((voiceName, index) => ({ name: voiceName, notes: voices[index] }));
        const score = N.cleanScore({ title, key, meter: METER, staves: [{ clef: "treble", voices: [named[0], named[1]] }, { clef: "bass", voices: [named[2], named[3]] }] });
        return score && withStyle(Object.freeze({ kind: "fourpart", form, title: score.title, given, numerals: Object.freeze([...numerals]), score }), style);
    }

    // What the figured bass shows under each bass note.
    const figuredBass = exercise => exercise.numerals.map(text => {
        const chord = chordFromNumeral(text, exercise.score.key);
        return chord ? figuresFor(chord, exercise.score.key) : Object.freeze([]);
    });

    // A key's roles for chords (2.6.0, shared with model answers): the
    // leading tone; a chord on the fifth or seventh degree holding it acts as
    // a dominant; the tonic and submediant chords take its resolution.
    function keyRoles(key) {
        const tonic = tonicOf(key);
        const tonicPc = modulo(N.NATURAL[tonic.step] + tonic.alter, 12);
        const leadingPc = modulo(tonicPc - 1, 12);
        const rootDegree = chord => modulo(chord.tones[0].letter - tonic.step, 7);
        return {
            tonicPc, leadingPc, rootDegree,
            dominant: chord => Boolean(chord) && [4, 6].includes(rootDegree(chord)) && chord.pcs.includes(leadingPc),
            resolving: chord => Boolean(chord) && [0, 5].includes(rootDegree(chord))
        };
    }

    // ---- Non-chord tones in four parts (2.11.0). A chord still lasts a half
    // note (the last a whole note when it begins a bar); inside it a voice may
    // move in shorter notes, or hold a note over from the chord before.

    // The chords' places in time, in eighths: { onset, length } each.
    function chordSpans(count) {
        let at = 0;
        return chordRhythm(count).map(code => {
            const span = Object.freeze({ onset: at, length: N.DURATIONS[code] });
            at += span.length;
            return span;
        });
    }
    const spanEnd = span => span.onset + span.length;

    // A four-part voice's rhythm: as long as its chords, each note inside one
    // chord, whole note to eighth (a note held into the next chord is tied).
    function fitsChords(notes, count) {
        if (!notes.every(note => SPECIES_CODES.includes(codeOf(note)))) return false;
        const spans = chordSpans(count);
        const timed = N.timed(notes);
        if (timed.reduce((sum, entry) => sum + entry.length, 0) !== spanEnd(spans.at(-1))) return false;
        return timed.every(entry => spans.some(span => entry.onset >= span.onset && entry.onset + entry.length <= spanEnd(span)));
    }

    // A voice's notes as heard: a note and those tied to it are one,
    // { p, onset, end, parts: [{ index, onset }] }.
    function soundedNotes(notes) {
        const sounded = [];
        for (const entry of N.timed(notes)) {
            const last = sounded.at(-1);
            if (entry.held && last) {
                last.end = entry.onset + entry.length;
                last.parts.push({ index: entry.index, onset: entry.onset });
            } else {
                sounded.push({ p: entry.note.p, onset: entry.onset, end: entry.onset + entry.length, parts: [{ index: entry.index, onset: entry.onset }] });
            }
        }
        return sounded;
    }
    // The note (by index) of a sounded note's part sounding at a moment.
    const partAt = (sounded, time) => sounded.parts.filter(part => part.onset <= time).at(-1).index;
    const pcOf = p => modulo(midi(p), 12);

    // Non-chord tones as Kostka and Payne's Tonal Harmony classifies them, by
    // how each is approached and left: passing tone (step, step on the same
    // way), neighboring tone (step, step back), suspension and retardation
    // (the same note, then a step down or up, perhaps after a note between:
    // a decorated resolution), appoggiatura (leap, step), escape tone (step,
    // leap), neighbor group (both neighbors in turn, then the note they
    // surround), anticipation (step or leap, then the same note) and pedal
    // point (the same note in and out, a chord tone where it begins and
    // ends). Labeled over their notes: P, N (AP and AN on the chord's
    // start), App, ET, NG, A, Ped; a suspension or retardation by its figures.
    const NCT_LABELS = Object.freeze({ passing: "P", neighbor: "N", suspension: "S", retardation: "R", appoggiatura: "App", escape: "ET", neighborGroup: "NG", anticipation: "A", pedal: "Ped" });
    const NCT_KINDS = Object.freeze(Object.keys(NCT_LABELS));
    // An interval over the bass as figured bass writes it: a ninth stays 9, an octave is 8.
    const figureOf = (low, high) => {
        const i = N.interval(low, high);
        if (i.simple === 1) return i.number === 1 ? "1" : "8";
        return i.simple === 2 && i.number > 2 ? "9" : String(i.simple);
    };

    // Four parts read chord by chord: which notes are each chord's and which
    // decorate it. A note at a chord's start that isn't in the chord is taken
    // at the note it resolves to by step inside the chord (a suspension, an
    // appoggiatura or an accented passing tone), or, held over, left out of
    // the chord (a pedal point). The chords are the numerals', or in the
    // soprano form (unless `asked`) the analysis's.
    // Returns { spans, chords, voices, tones, problems }: for each chord its
    // notes (`reps`, by voice; null for a pedal), where they are (`repAt`),
    // which voices hold a pedal (`pedal`), and each voice's last chord note
    // in it (`exits`); `tones` lists the non-chord tones
    // { voice, index, kind, label, accented, chord, onset }.
    function readFourPart(exercise, { asked: askAlways = false } = {}) {
        const key = exercise.score.key;
        const known = keyChords(key);
        const spans = chordSpans(exercise.numerals.length);
        const asked = exercise.form !== "soprano" || askAlways ? exercise.numerals.map(text => chordFromNumeral(text, key)) : null;
        const voices = N.voicesOf(exercise.score).map(voice => soundedNotes(voice.notes));
        const soundingAt = (v, time) => voices[v].find(each => each.onset <= time && time < each.end) ?? null;
        const around = (v, sounded) => {
            const at = voices[v].indexOf(sounded);
            const before = voices[v][at - 1], after = voices[v][at + 1];
            return [before?.p ? before : null, after?.p ? after : null];
        };
        const spanOf = time => spans.findIndex(span => span.onset <= time && time < spanEnd(span));
        // The note a voice's note resolves to by step inside its chord: the
        // next, or the one after a note between; a note of the chord when one is given.
        const resolutionOf = (v, sounded, span, chord = null) => {
            const at = voices[v].indexOf(sounded);
            for (const next of voices[v].slice(at + 1, at + 3)) {
                if (!next?.p || next.onset >= spanEnd(span)) return null;
                if (Math.abs(next.p.step - sounded.p.step) === 1 && (!chord || chord.pcs.includes(pcOf(next.p)))) return next;
            }
            return null;
        };
        // Held into a chord: tied over, or struck again at its start.
        const heldInto = (v, sounded, span) => {
            if (!sounded?.p) return false;
            const before = around(v, sounded)[0];
            return sounded.onset < span.onset || (sounded.onset === span.onset && Boolean(before) && before.end === span.onset && midi(before.p) === midi(sounded.p));
        };
        const chords = spans.map((span, k) => {
            const first = [0, 1, 2, 3].map(v => soundingAt(v, span.onset));
            const held = first.map((sounded, v) => heldInto(v, sounded, span));
            let chosen = first;
            let chord = asked ? asked[k] : null;
            if (chord) {
                chosen = first.map((sounded, v) => {
                    if (!sounded?.p || chord.pcs.includes(pcOf(sounded.p))) return sounded;
                    return resolutionOf(v, sounded, span, chord) ?? (held[v] ? null : sounded);
                });
            } else if (!asked) {
                // The fewest notes taken at their resolution, or left out as a
                // pedal, that make a chord of the key.
                const options = first.map((sounded, v) => {
                    const list = [sounded];
                    if (!sounded?.p) return list;
                    const resolved = resolutionOf(v, sounded, span);
                    if (resolved) list.push(resolved);
                    if (held[v]) list.push(null);
                    return list;
                });
                let best = null;
                const pick = (v, made, cost) => {
                    if (v === 4) {
                        const found = analyze(made.map(each => each?.p ?? null), key, known);
                        if (found && (!best || cost < best.cost)) best = { cost, made, chord: found.chord };
                        return;
                    }
                    options[v].forEach((option, at) => pick(v + 1, [...made, option], cost + (at ? 1 : 0)));
                };
                pick(0, [], 0);
                if (best) {
                    chosen = best.made;
                    chord = best.chord;
                }
            }
            const reps = chosen.map(each => each?.p ?? null);
            const pedal = chosen.map((each, v) => !each && Boolean(first[v]?.p));
            const repAt = chosen.map(each => (each ? partAt(each, Math.max(each.onset, span.onset)) : -1));
            const exits = [0, 1, 2, 3].map(v => {
                const inside = voices[v].filter(each => each.p && each.onset < spanEnd(span) && each.end > span.onset);
                const last = (chord ? inside.filter(each => chord.pcs.includes(pcOf(each.p))) : inside).at(-1) ?? chosen[v];
                return last?.p ? { p: last.p, index: partAt(last, Math.min(spanEnd(span), last.end) - 0.5) } : null;
            });
            const analysis = analyze(reps, key, known);
            return { span, chord, asked: asked?.[k] ?? null, reps, repAt, pedal, exits, analysis, numeral: analysis?.numeral ?? "" };
        });

        // A pedal point: the same note held or struck again from a chord it's
        // in, through this one, to a later chord it's in.
        const pedalPoint = (v, sounded, k) => {
            const line = voices[v];
            let from = line.indexOf(sounded), to = from;
            while (from > 0 && line[from - 1].p && midi(line[from - 1].p) === midi(sounded.p)) from -= 1;
            while (to < line.length - 1 && line[to + 1].p && midi(line[to + 1].p) === midi(sounded.p)) to += 1;
            const begins = spanOf(line[from].onset), ends = spanOf(line[to].end - 0.5);
            return begins < k && ends > k && Boolean(chords[begins].chord?.pcs.includes(pcOf(sounded.p))) && Boolean(chords[ends].chord?.pcs.includes(pcOf(sounded.p)));
        };

        const found = [], problems = [];
        voices.forEach((line, v) => line.forEach(sounded => {
            if (!sounded.p) return;
            const [before, after] = around(v, sounded);
            spans.forEach((span, k) => {
                if (sounded.end <= span.onset || sounded.onset >= spanEnd(span)) return;
                const chord = chords[k].chord;
                if (!chord || chord.pcs.includes(pcOf(sounded.p))) return;
                const onset = Math.max(sounded.onset, span.onset);
                const index = partAt(sounded, onset);
                const here = [{ voice: v, index }];
                const inside = Boolean(after && after.onset < spanEnd(span));
                const stepIn = Boolean(before && Math.abs(sounded.p.step - before.p.step) === 1);
                const stepOut = Boolean(after && Math.abs(after.p.step - sounded.p.step) === 1);
                const leapIn = Boolean(before && Math.abs(sounded.p.step - before.p.step) >= 2);
                const leapOut = Boolean(after && Math.abs(after.p.step - sounded.p.step) >= 2);
                const wayIn = before ? Math.sign(sounded.p.step - before.p.step) : 0;
                const wayOut = after ? Math.sign(after.p.step - sounded.p.step) : 0;
                const returns = Boolean(before && after && midi(after.p) === midi(before.p));
                const nextChord = chords[k + 1]?.chord;
                let kind = null, resolved = null;
                if (heldInto(v, sounded, span)) {
                    // Held over: a suspension prepared in the chord before and
                    // resolved by step to a note of this one, or a pedal point.
                    const prepared = Boolean(chords[k - 1]?.chord?.pcs.includes(pcOf(sounded.p)));
                    resolved = resolutionOf(v, sounded, span, chord);
                    if (prepared && resolved) kind = resolved.p.step < sounded.p.step ? "suspension" : "retardation";
                    else if (pedalPoint(v, sounded, k)) kind = "pedal";
                    else {
                        problems.push(prepared
                            ? { level: "error", rule: "suspend", text: `The suspension in the ${VOICE_WORDS[v]} (${name(sounded.p)}) should resolve by step to a note of its chord.`, onset, at: here }
                            : { level: "error", rule: "suspend", text: `${name(sounded.p)} in the ${VOICE_WORDS[v]} is held into a chord it isn't in; a suspension is first a note of the chord before.`, onset, at: here });
                        return;
                    }
                } else if (before && midi(before.p) === midi(sounded.p) && pedalPoint(v, sounded, k)) {
                    // Struck again inside a chord, the same note as before it: still the pedal.
                    kind = "pedal";
                } else if (sounded.onset === span.onset) {
                    // On the chord's start: resolved by step to a note of the chord, inside it.
                    if (inside && stepOut && chord.pcs.includes(pcOf(after.p))) kind = stepIn && wayIn === wayOut ? "passing" : stepIn && returns ? "neighbor" : leapIn ? "appoggiatura" : null;
                } else if (after && midi(after.p) === midi(sounded.p) && after.onset === spanEnd(span) && nextChord?.pcs.includes(pcOf(sounded.p))) {
                    kind = "anticipation";
                } else if (sounded.end > spanEnd(span) && nextChord?.pcs.includes(pcOf(sounded.p))) {
                    kind = "anticipation";
                } else if (stepIn && stepOut) {
                    kind = wayIn === wayOut ? "passing" : returns ? "neighbor" : null;
                } else if (stepIn && leapOut) {
                    kind = "escape";
                } else if (leapIn && stepOut) {
                    kind = "appoggiatura";
                }
                if (!kind) {
                    problems.push({ level: "error", rule: "nonchord", text: `${name(sounded.p)} in the ${VOICE_WORDS[v]} isn't in the chord, and isn't approached and left as a non-chord tone is.`, onset, at: here });
                    return;
                }
                const accented = sounded.onset <= span.onset;
                let label = NCT_LABELS[kind];
                if ((kind === "passing" || kind === "neighbor") && accented) label = `A${label}`;
                if (kind === "suspension" || kind === "retardation") {
                    // Its figures over the bass as it sounds at each moment (the bass may move meanwhile).
                    const bassThen = soundingAt(3, onset)?.p, bassNow = soundingAt(3, resolved.onset)?.p;
                    if (v < 3 && bassThen && bassNow) label = `${figureOf(bassThen, sounded.p)}${DASH}${figureOf(bassNow, resolved.p)}`;
                    else if (v === 3) {
                        // Against the voice it's dissonant with: a second (2-3) before a fourth or seventh.
                        const uppers = [0, 1, 2].filter(u => soundingAt(u, onset)?.p);
                        const upper = [2, 4, 7].map(simple => uppers.find(u => N.interval(sounded.p, soundingAt(u, onset).p).simple === simple)).find(u => u !== undefined);
                        const later = upper === undefined ? null : soundingAt(upper, resolved.onset)?.p;
                        if (later) label = `${N.interval(sounded.p, soundingAt(upper, onset).p).simple}${DASH}${N.interval(resolved.p, later).simple}`;
                    }
                    // The note it resolves to isn't doubled above the bass meanwhile.
                    if (kind === "suspension" && v < 3) {
                        const doubled = [0, 1, 2].find(u => u !== v && soundingAt(u, span.onset)?.p && pcOf(soundingAt(u, span.onset).p) === pcOf(resolved.p));
                        if (doubled !== undefined) {
                            problems.push({ level: "warning", rule: "doubledres", text: `${N.pitchLetterName(resolved.p)}, where the suspension in the ${VOICE_WORDS[v]} resolves, already sounds in the ${VOICE_WORDS[doubled]}.`, onset, at: [...here, { voice: doubled, index: partAt(soundingAt(doubled, span.onset), span.onset) }] });
                        }
                    }
                }
                found.push({ voice: v, index, kind, label, accented, chord: k, onset, sounded });
            });
        }));
        // A neighbor group: an escape tone and an appoggiatura in turn, a
        // third apart on either side of the note before them, which follows.
        found.forEach((each, at) => {
            const next = found[at + 1];
            if (each.kind !== "escape" || next?.kind !== "appoggiatura" || next.voice !== each.voice) return;
            const line = voices[each.voice];
            const n = line.indexOf(each.sounded);
            if (line[n + 1] !== next.sounded) return;
            const before = line[n - 1], after = line[n + 2];
            if (!before?.p || !after?.p || midi(before.p) !== midi(after.p) || Math.abs(next.sounded.p.step - each.sounded.p.step) !== 2) return;
            if (Math.sign(each.sounded.p.step - before.p.step) === Math.sign(next.sounded.p.step - before.p.step)) return;
            for (const tone of [each, next]) {
                tone.kind = "neighborGroup";
                tone.label = NCT_LABELS.neighborGroup;
            }
        });
        const tones = Object.freeze(found.map(({ sounded, ...tone }) => Object.freeze(tone)));
        return { spans, chords, voices, tones, problems };
    }

    // The non-chord tones of a four-part exercise, for labels over the staff.
    const nonChordTones = exercise => (exercise?.kind === "fourpart" ? readFourPart(exercise).tones : Object.freeze([]));

    // Four parts as drawn (2.11.0): a half note at a bar's start, tied to its
    // pitch for the next chord, is drawn as one note, a whole note (a dotted
    // half when it's held into a quarter); unless the note held into is a
    // non-chord tone, which keeps its own head for its label. `indices` lists,
    // by voice, the notes each drawn note stands for. Null but for four parts.
    function drawnFourPart(exercise) {
        if (exercise?.kind !== "fourpart") return null;
        const labeled = new Set(nonChordTones(exercise).map(tone => `${tone.voice}:${tone.index}`));
        const indices = [];
        let voice = 0;
        const staves = exercise.score.staves.map(staff => ({
            clef: staff.clef,
            voices: staff.voices.map(each => {
                const v = voice++;
                const notes = [];
                const map = [];
                const timed = N.timed(each.notes);
                for (let at = 0; at < timed.length; at++) {
                    const { note, onset } = timed[at];
                    const next = timed[at + 1]?.note;
                    const holds = note.p && note.tie && codeOf(note) === "h" && onset % BAR === 0 && next?.p && midi(next.p) === midi(note.p)
                        && (codeOf(next) === "h" || codeOf(next) === "q") && !labeled.has(`${v}:${at + 1}`);
                    if (holds) {
                        notes.push({ ...note, d: codeOf(next) === "h" ? "w" : "h", dot: codeOf(next) === "q", tie: next.tie });
                        map.push([at, at + 1]);
                        at++;
                    } else {
                        notes.push(note);
                        map.push([at]);
                    }
                }
                indices.push(map);
                return { name: each.name, notes };
            })
        }));
        return { score: { ...exercise.score, staves }, indices };
    }

    function checkFourPart(exercise) {
        const { score } = exercise;
        const key = score.key;
        const list = [];
        const reading = readFourPart(exercise);
        const timed = N.voicesOf(score).map(voice => N.timed(voice.notes));
        const unwritten = timed.reduce((sum, entries) => sum + entries.filter(entry => !entry.note.p).length, 0);
        if (unwritten) problem(list, "info", "unfinished", `${unwritten} ${unwritten === 1 ? "note" : "notes"} still to write.`, null, []);
        const at = (voice, index) => ({ voice, index });
        const { leadingPc, rootDegree, dominant, resolving } = keyRoles(key);
        const bach = styleOf(exercise) === "bach";
        const entryAt = (v, time) => timed[v].find(entry => entry.onset <= time && time < entry.onset + entry.length) ?? null;

        // Every note in its voice's range.
        timed.forEach((entries, v) => entries.forEach(entry => {
            if (!entry.note.p || entry.held) return;
            const [low, high] = RANGES[v];
            if (midi(entry.note.p) < low || midi(entry.note.p) > high) problem(list, "error", "voiceRange", `The ${VOICE_WORDS[v]} is out of its range (${name(N.pitchFromMidi(low, 0))}${DASH}${name(N.pitchFromMidi(high, 0))}).`, entry.onset, [at(v, entry.index)]);
        }));

        // No voice above the one over it, at any moment (once a chord).
        const moments = [...new Set(timed.flatMap(entries => entries.map(entry => entry.onset)))].sort((a, b) => a - b);
        const crossed = new Set();
        for (const time of moments) {
            const k = reading.spans.findIndex(span => span.onset <= time && time < spanEnd(span));
            for (let v = 0; v < 3; v++) {
                const upper = entryAt(v, time), lower = entryAt(v + 1, time);
                if (!upper?.note.p || !lower?.note.p || crossed.has(`${v}:${k}`) || midi(upper.note.p) >= midi(lower.note.p)) continue;
                crossed.add(`${v}:${k}`);
                problem(list, "error", "crossing", `The ${VOICE_WORDS[v + 1]} is above the ${VOICE_WORDS[v]}.`, time, [at(v, upper.index), at(v + 1, lower.index)]);
            }
        }

        // Each chord: its spacing, the chord asked for (or a chord of the key), its bass.
        reading.chords.forEach(({ span, asked, reps: slot, repAt, pedal, analysis }) => {
            const onset = span.onset;
            const here = v => at(v, repAt[v]);
            for (let v = 0; v < 3; v++) {
                const upper = slot[v], lower = slot[v + 1];
                if (!upper || !lower) continue;
                const apart = midi(upper) - midi(lower);
                if (v < 2 && apart > 12) problem(list, "error", "spacing", `The ${VOICE_WORDS[v]} and ${VOICE_WORDS[v + 1]} are more than an octave apart.`, onset, [here(v), here(v + 1)]);
                // Kostka and Payne set no limit between tenor and bass; Bach's chorales keep them within a twelfth.
                if (v === 2 && apart > 19 && bach) problem(list, "warning", "bassSpacing", "The tenor and bass are more than a twelfth apart.", onset, [here(2), here(3)]);
            }
            // A pedal point is left out of the chord over it (and so is the bass's figure).
            if (!slot.every((p, v) => p || pedal[v])) return;
            const pcs = slot.map(p => (p ? pcOf(p) : null));
            const present = pcs.filter(pc => pc !== null);
            const all = slot.map((_, v) => here(v)).filter((_, v) => slot[v]);
            if (dominant(asked ?? analysis?.chord) && present.filter(pc => pc === leadingPc).length > 1) problem(list, "error", "doubled", "The leading tone is doubled.", onset, slot.map((_, v) => here(v)).filter((_, v) => pcs[v] === leadingPc));
            if (asked) {
                const fits = present.every(pc => asked.pcs.includes(pc)) && present.includes(asked.pcs[0]) && present.includes(asked.pcs[1]) && (!asked.seventh || present.includes(asked.pcs[3]));
                const tones = asked.tones.map(tone => N.pitchLetterName(N.pitch(tone.letter, tone.alter))).join(" ");
                if (!fits) problem(list, "error", "chord", `Asked for ${numeralText(asked.numeral)} (${tones}).`, onset, all);
                else if (slot[3] && pcs[3] !== asked.bassPc) problem(list, "error", "inversion", `${numeralText(asked.numeral)} needs ${N.pitchLetterName(N.pitch(asked.bass.letter, asked.bass.alter))} in the bass.`, onset, [here(3)]);
            } else if (!analysis) {
                // A root and fifth alone (2.11.0): named for the missing third. The
                // analysis finds no chord without its third, so this was never reached.
                const open = slot[3] && keyChords(key).some(chord => !chord.seventh && present.every(pc => chord.pcs.includes(pc)) && present.includes(chord.pcs[0]) && !present.includes(chord.pcs[1]) && pcs[3] === chord.pcs[0]);
                if (open) problem(list, "error", "third", "The chord has no third.", onset, all);
                else problem(list, "error", "chord", "These notes aren't a chord of the key.", onset, all);
            }
        });

        // Each line, note to note: no augmented interval, nothing wider than an octave, no seventh.
        reading.voices.forEach((line, v) => line.forEach((sounded, n) => {
            const before = line[n - 1];
            if (!sounded.p || !before?.p) return;
            const melodic = N.interval(before.p, sounded.p);
            const pair = [at(v, before.parts.at(-1).index), at(v, sounded.parts[0].index)];
            if (melodic.quality === "A" || melodic.quality === "AA") problem(list, "error", "augmented", `An augmented ${intervalWord(melodic)} in the ${VOICE_WORDS[v]}.`, sounded.onset, pair);
            else if (melodic.number > 8 || melodic.simple === 7) problem(list, "error", "leap", `A leap of ${melodic.name} in the ${VOICE_WORDS[v]}.`, sounded.onset, pair);
        }));

        // From each chord to the next, chord note to chord note.
        for (let k = 1; k < reading.chords.length; k++) {
            const before = reading.chords[k - 1], after = reading.chords[k];
            const a = before.reps, b = after.reps, onset = after.span.onset;
            const from = v => at(v, before.repAt[v]), to = v => at(v, after.repAt[v]);
            for (let v = 0; v < 3; v++) {
                if (!a[v] || !b[v] || !a[v + 1] || !b[v + 1]) continue;
                if (midi(b[v + 1]) > midi(a[v])) problem(list, "warning", "overlap", `The ${VOICE_WORDS[v + 1]} moves above where the ${VOICE_WORDS[v]} was.`, onset, [to(v + 1)]);
                if (midi(b[v]) < midi(a[v + 1])) problem(list, "warning", "overlap", `The ${VOICE_WORDS[v]} moves below where the ${VOICE_WORDS[v + 1]} was.`, onset, [to(v)]);
            }
            const closing = k === reading.chords.length - 1;
            for (let u = 0; u < 4; u++) for (let w = u + 1; w < 4; w++) {
                if (!a[u] || !a[w] || !b[u] || !b[w]) continue;
                const first = N.interval(a[w], a[u]), then = N.interval(b[w], b[u]);
                const move = motion(a[u], b[u], a[w], b[w]);
                const pair = `${VOICE_WORDS[u]} and ${VOICE_WORDS[w]}`;
                // Unequal fifths (2.11.0): a diminished fifth to a perfect one, with the bass.
                if (w === 3 && first.simple === 5 && first.quality === "d" && then.simpleName === "P5" && (move === "similar" || move === "contrary")) {
                    problem(list, "warning", "unequal", `A diminished fifth to a perfect fifth: ${pair}.`, onset, [from(u), to(u), from(w), to(w)]);
                }
                if (consonance(then) !== "perfect" || consonance(first) !== "perfect" || first.simple !== then.simple) continue;
                // Bach's chorales close with octaves by contrary motion in the outer voices.
                const bachClose = bach && closing && u === 0 && w === 3 && then.simple === 1;
                if (move === "similar") problem(list, "error", "parallel", `Parallel ${perfectKind(then)}: ${pair}.`, onset, [from(u), to(u), from(w), to(w)]);
                else if (move === "contrary" && !bachClose) problem(list, "warning", "contrary", `${then.simple === 1 ? "Octaves" : "Fifths"} by contrary motion: ${pair}.`, onset, [to(u), to(w)]);
            }
            // Hidden fifths and octaves in the outer voices, the soprano leaping:
            // an error, but a warning when an inner voice moves against them.
            if (a[0] && a[3] && b[0] && b[3]) {
                const outer = N.interval(b[3], b[0]);
                if (consonance(outer) === "perfect" && motion(a[0], b[0], a[3], b[3]) === "similar" && Math.abs(b[0].step - a[0].step) > 1) {
                    const first = N.interval(a[3], a[0]);
                    const way = Math.sign(midi(b[0]) - midi(a[0]));
                    const against = [1, 2].some(v => a[v] && b[v] && Math.sign(midi(b[v]) - midi(a[v])) === -way);
                    if (!(consonance(first) === "perfect" && first.simple === outer.simple)) {
                        problem(list, against ? "warning" : "error", "hidden", against
                            ? `Hidden ${perfectKind(outer)} in the outer voices, the soprano leaping into them; an inner voice moving the other way softens them.`
                            : `Hidden ${perfectKind(outer)} in the outer voices: the soprano leaps into them.`, onset, [to(0), to(3)]);
                    }
                }
            }
            // The leading tone in an outer voice rises to the tonic; a seventh
            // falls by step. In the bass only into the tonic chord (2.6.0): a
            // bass falling from V6 to vi (C B A) is a line. Each from the
            // voice's last chord note, so a decorated one resolves too.
            const chordA = before.chord, chordB = after.chord;
            if (dominant(chordA) && resolving(chordB)) {
                for (const v of rootDegree(chordB) === 0 ? [0, 3] : [0]) {
                    const exit = before.exits[v];
                    if (exit && b[v] && pcOf(exit.p) === leadingPc && midi(b[v]) - midi(exit.p) !== 1) {
                        problem(list, "error", "leadingTone", `The leading tone in the ${VOICE_WORDS[v]} should rise to the tonic.`, onset, [at(v, exit.index), to(v)]);
                    }
                }
            }
            if (chordA?.seventh) {
                // V4/3 to I6 (2.11.0): the seventh may rise a step to the fifth of
                // I6 when it moves in parallel tenths with the bass, as both styles allow.
                const risingInV43 = (v, exit) => a[3] && b[3] && dominant(chordA) && pcOf(a[3]) === chordA.pcs[2]
                    && chordB && rootDegree(chordB) === 0 && pcOf(b[3]) === chordB.pcs[1]
                    && b[v].step - exit.p.step === 1 && b[3].step - a[3].step === 1
                    && N.interval(a[3], exit.p).simple === 3 && N.interval(b[3], b[v]).simple === 3;
                for (let v = 0; v < 4; v++) {
                    const exit = before.exits[v];
                    if (!exit || !b[v] || pcOf(exit.p) !== chordA.pcs[3]) continue;
                    const fall = exit.p.step - b[v].step;
                    const kept = midi(exit.p) === midi(b[v]);
                    if (!(fall === 1 && midi(exit.p) - midi(b[v]) <= 2) && !kept && !risingInV43(v, exit)) problem(list, "error", "seventh", `The seventh (${N.pitchLetterName(exit.p)}) in the ${VOICE_WORDS[v]} should fall by step.`, onset, [at(v, exit.index), to(v)]);
                }
            }
        }

        // Parallels as heard, moment to moment: a passing tone can make them too.
        for (let m = 1; m < moments.length; m++) {
            const a = [0, 1, 2, 3].map(v => entryAt(v, moments[m - 1])), b = [0, 1, 2, 3].map(v => entryAt(v, moments[m]));
            for (let u = 0; u < 4; u++) for (let w = u + 1; w < 4; w++) {
                if (![a[u], a[w], b[u], b[w]].every(entry => entry?.note.p)) continue;
                const first = N.interval(a[w].note.p, a[u].note.p), then = N.interval(b[w].note.p, b[u].note.p);
                if (consonance(then) !== "perfect" || consonance(first) !== "perfect" || first.simple !== then.simple) continue;
                if (motion(a[u].note.p, b[u].note.p, a[w].note.p, b[w].note.p) !== "similar") continue;
                problem(list, "error", "parallel", `Parallel ${perfectKind(then)}: ${VOICE_WORDS[u]} and ${VOICE_WORDS[w]}.`, moments[m], [at(u, a[u].index), at(u, b[u].index), at(w, a[w].index), at(w, b[w].index)]);
            }
        }

        // The non-chord tones.
        for (const each of reading.problems) problem(list, each.level, each.rule, each.text, each.onset, each.at);
        // Once each: chord to chord and moment to moment can find the same parallels.
        const seen = new Set();
        return sortProblems(list.filter(each => {
            const id = `${each.rule}|${each.text}|${each.bar}|${JSON.stringify(each.at)}`;
            return !seen.has(id) && seen.add(id);
        }));
    }

    const check = exercise => (exercise.kind === "species" ? checkSpecies(exercise) : exercise.kind === "cantus" ? checkCantus(exercise)
        : exercise.kind === "melody" ? checkMelody(exercise) : checkFourPart(exercise));

    // Under the staff: in species, each counterpoint note's interval with the
    // cantus (8, 6, 3); in a cantus firmus, each note's degree (♯7 raised);
    // in four parts, each chord's numeral and figures.
    function analysisLine(exercise) {
        const { score } = exercise;
        if (exercise.kind === "cantus" || exercise.kind === "melody") {
            return N.timed(N.voicesOf(score)[0].notes).map(entry => {
                const p = entry.note.p;
                if (!p) return { onset: entry.onset, text: "" };
                const change = p.alter - N.keyAlter(modulo(p.step, 7), score.key.fifths);
                return { onset: entry.onset, text: `${change ? SIGN[String(Math.max(-2, Math.min(2, change)))] : ""}${degreeOf(score.key, p) + 1}` };
            });
        }
        if (exercise.kind === "species") {
            const voices = N.voicesOf(score);
            const cp = N.timed(voices[1 - exercise.given].notes);
            const cf = N.timed(voices[exercise.given].notes);
            return cp.map(entry => {
                const under = cf.find(each => each.onset <= entry.onset && entry.onset < each.onset + each.length);
                if (!entry.note.p || !under || entry.held) return { onset: entry.onset, text: "" };
                const i = N.interval(under.note.p, entry.note.p);
                return { onset: entry.onset, text: String(i.number > 9 ? i.simple + (i.simple === 1 ? 7 : 0) : i.number) };
            });
        }
        // Each chord's own notes (2.11.0): a suspension read at its resolution.
        return readFourPart(exercise).chords.map(each => ({ onset: each.span.onset, text: each.numeral, parts: each.numeral ? numeralParts(each.numeral) : null }));
    }

    // ---- Exercises as kept (data\counterpoint, a file each):
    //   Maestro exercise 1
    //   <title>
    //   kind <species|fourpart|cantus> <1-5 | numerals|figured|soprano | -> <below|above|->
    //   key <fifths> <mode>
    //   style <renaissance|bach>        (2.11.0; only when not the kind's first style)
    //   numerals <I IV V7 I>            (four-part only)
    //   voice <staff 1|2> <clef> <given|written> <name> <notes>   (one for a cantus firmus)
    // Fields are separated by tabs. A note is its step, an alteration (+1, -2),
    // its duration (w, h, q, e), "." if dotted and "~" if tied: 28h, 29+1q~, 33-1w.
    // A rest is r and its duration.

    const HEADER = "Maestro exercise 1";
    const ID = /^[a-z0-9]{1,40}$/;
    const NOTE_TOKEN = /^(r|(\d{1,2})([+-][12])?)([whqestf])(\.?)(~?)$/;

    function noteToken(note) {
        const pitchPart = note.p ? `${note.p.step}${note.p.alter > 0 ? `+${note.p.alter}` : note.p.alter < 0 ? note.p.alter : ""}` : "r";
        return `${pitchPart}${note.d}${note.dot ? "." : ""}${note.tie && note.p ? "~" : ""}`;
    }

    function readNote(token) {
        const match = NOTE_TOKEN.exec(token);
        if (!match) return null;
        const p = match[1] === "r" ? null : N.pitch(Number(match[2]), Number(match[3] ?? 0));
        if (p && !N.isPitch(p)) return null;
        return { p, d: match[4], dot: match[5] === ".", tie: match[6] === "~" };
    }

    const cleanTitle = text => [...String(text ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim()].slice(0, N.TITLE_MAX).join("").trim();

    function exerciseText(exercise) {
        const { score } = exercise;
        const lines = [HEADER, cleanTitle(exercise.title) || "Untitled"];
        const kindOf = { species: String(exercise.species), fourpart: exercise.form, cantus: "-", melody: exercise.instrument }[exercise.kind];
        lines.push(["kind", exercise.kind, kindOf, exercise.kind === "species" ? (exercise.cantusBelow ? "below" : "above") : "-"].join("\t"));
        lines.push(["key", String(score.key.fifths), score.key.mode].join("\t"));
        // An exercise in its kind's first style says nothing, so 2.10.0 still opens it.
        const style = styleOf(exercise);
        if (style && style !== stylesOf(exercise.kind)[0].id) lines.push(["style", style].join("\t"));
        if (exercise.kind === "fourpart") lines.push(["numerals", exercise.numerals.join(" ")].join("\t"));
        let index = 0;
        score.staves.forEach((staff, staffIndex) => staff.voices.forEach(voice => {
            lines.push(["voice", String(staffIndex + 1), staff.clef, index === exercise.given ? "given" : "written", cleanTitle(voice.name).replace(/\t/g, " ") || "Voice", voice.notes.map(noteToken).join(" ")].join("\t"));
            index += 1;
        }));
        return `${lines.join("\n")}\n`;
    }

    // An exercise read back, or null if anything in it is out of place.
    function readExercise(text) {
        const lines = String(text ?? "").replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
        if (lines[0] !== HEADER || lines.length < 5 || lines.length > 10) return null;
        const title = cleanTitle(lines[1]);
        const kind = lines[2].split("\t");
        const keyLine = lines[3].split("\t");
        if (kind[0] !== "kind" || keyLine[0] !== "key" || keyLine.length !== 3) return null;
        const fifths = Number(keyLine[1]);
        const key = { fifths, mode: keyLine[2] };
        let numerals = [];
        let at = 4;
        let style = null;
        if (lines[at]?.startsWith("style\t")) {
            const line = lines[at++].split("\t");
            const list = stylesOf(kind[1]);
            if (line.length !== 2 || !list || !list.slice(1).some(each => each.id === line[1])) return null;
            style = line[1];
        }
        if (kind[1] === "fourpart") {
            const line = lines[at++]?.split("\t");
            if (!line || line[0] !== "numerals" || line.length !== 2) return null;
            numerals = line[1].split(" ").filter(Boolean);
            if (numerals.length < 2 || numerals.length > 32 || numerals.some(text => !NUMERAL.test(text))) return null;
        }
        const staves = [];
        let given = -1;
        let voiceIndex = 0;
        for (const line of lines.slice(at)) {
            const parts = line.split("\t");
            if (parts.length !== 6 || parts[0] !== "voice" || !["1", "2"].includes(parts[1]) || !STAFF_CLEFS.includes(parts[2]) || !["given", "written"].includes(parts[3])) return null;
            const notes = parts[5] ? parts[5].split(" ").map(readNote) : [];
            if (notes.some(note => !note)) return null;
            const staffIndex = Number(parts[1]) - 1;
            if (staffIndex > staves.length) return null;
            staves[staffIndex] ??= { clef: parts[2], voices: [] };
            if (staves[staffIndex].clef !== parts[2]) return null;
            staves[staffIndex].voices.push({ name: parts[4], notes });
            if (parts[3] === "given") {
                if (given >= 0) return null;
                given = voiceIndex;
            }
            voiceIndex += 1;
        }
        const score = N.cleanScore({ title, key, meter: METER, staves });
        if (!score) return null;
        const count = N.voicesOf(score).length;
        // Sixteenths and shorter, and a dotted eighth, are a melody's alone (2.6.0).
        if (kind[1] !== "melody" && N.voicesOf(score).some(voice => voice.notes.some(note => !SPECIES_CODES.includes(note.d + (note.dot ? "." : ""))))) return null;
        if (kind[1] === "species") {
            const species = Number(kind[2]);
            if (!Number.isInteger(species) || species < 1 || species > 5 || !["below", "above"].includes(kind[3]) || count !== 2 || given !== (kind[3] === "below" ? 1 : 0)) return null;
            return withStyle(Object.freeze({ kind: "species", species, cantusBelow: kind[3] === "below", title, given, numerals: Object.freeze([]), score }), style);
        }
        if (kind[1] === "fourpart") {
            if (!FORMS.includes(kind[2]) || count !== 4 || !["major", "minor"].includes(key.mode)) return null;
            const wantGiven = { numerals: -1, figured: 3, soprano: 0 }[kind[2]];
            if (given !== wantGiven || numerals.some(text => !chordFromNumeral(text, key))) return null;
            if (!N.voicesOf(score).every(voice => fitsChords(voice.notes, numerals.length))) return null;
            return withStyle(Object.freeze({ kind: "fourpart", form: kind[2], title, given, numerals: Object.freeze(numerals), score }), style);
        }
        if (kind[1] === "melody") {
            if (!melodyInstrument(kind[2]) || kind[3] !== "-" || count !== 1 || given !== -1 || !CANTUS_MODES.includes(key.mode)) return null;
            const notes = N.voicesOf(score)[0].notes;
            if (!notes.length || N.bars(notes, METER).bars.length > MELODY_BARS.max) return null;
            return Object.freeze({ kind: "melody", instrument: kind[2], title, given: -1, numerals: Object.freeze([]), score });
        }
        if (kind[1] === "cantus") {
            const notes = count === 1 ? N.voicesOf(score)[0].notes : [];
            if (kind[2] !== "-" || kind[3] !== "-" || count !== 1 || given !== -1 || !CANTUS_MODES.includes(key.mode)) return null;
            if (notes.length < CANTUS_LENGTH.min || notes.length > CANTUS_LENGTH.max || notes.some(note => note.d !== "w" || note.dot || note.tie)) return null;
            return Object.freeze({ kind: "cantus", title, given: -1, numerals: Object.freeze([]), score });
        }
        return null;
    }

    // A written note set: a counterpoint or four-part voice's note at an index
    // given a pitch (or cleared), its rhythm kept. Ties follow for suspensions.
    function setNote(exercise, voice, index, p) {
        if (voice === exercise.given || voice < 0) return exercise;
        const voices = N.voicesOf(exercise.score);
        const notes = voices[voice]?.notes;
        if (!notes || index < 0 || index >= notes.length) return exercise;
        let changed = notes.map((note, at) => (at === index ? { ...note, p: p ?? null, tie: false } : note));
        if (exercise.kind !== "cantus") changed = mendTies(exercise, changed);
        return withVoiceNotes(exercise, voice, changed);
    }

    // ---- Rhythm, bar by bar and note by note: the fifth species' line and
    // a melody's (2.6.0). Times are in eighths, as everywhere here.

    // The fifth species' bar rhythms, offered to choose from.
    const FIFTH_BARS = Object.freeze(["w", "h h", "h q q", "q q h", "q q q q", "h. q", "q e e h", "q e e q q", "h q e e"].map(text => Object.freeze(text.split(" "))));
    // The lengths a note may have, and where each may start in the bar: a
    // whole at its start, a half or a quarter on a beat (a half on the second
    // beat is a syncopation, q h q), an eighth anywhere, and in a melody
    // (2.6.0) a sixteenth, thirty-second or sixty-fourth on its own grid,
    // dotted or not (a sixty-fourth not). The fifth species keeps whole to
    // eighth, with no dotted eighth.
    const CODES = Object.freeze(["w", "h.", "h", "q.", "q", "e.", "e", "s.", "s", "t.", "t", "f"]);
    const SPECIES_CODES = Object.freeze(["w", "h.", "h", "q.", "q", "e"]);
    const codesFor = exercise => (exercise?.kind === "melody" ? CODES : SPECIES_CODES);
    // A gap is filled with these, longest first: no dotted value shorter than a quarter.
    const FILL_CODES = Object.freeze(["w", "h.", "h", "q.", "q", "e", "s", "t", "f"]);
    const codeLength = code => N.DURATIONS[code[0]] * (code.endsWith(".") ? 1.5 : 1);
    const ALIGN = Object.freeze({ "w": 8, "h.": 2, "h": 2, "q.": 2, "q": 2, "e.": 1, "e": 1, "s.": 0.5, "s": 0.5, "t.": 0.25, "t": 0.25, "f": 0.125 });
    const codeOf = note => note.d + (note.dot ? "." : "");

    // Whether an exercise's rhythm is written, not given, and in which voice:
    // in four parts (2.11.0), the voice being written, never the given one.
    const rhythmEditable = exercise => exercise?.kind === "melody" || exercise?.kind === "fourpart" || (exercise?.kind === "species" && exercise.species === 5);
    function rhythmVoice(exercise, voice = null) {
        if (exercise.kind === "melody") return 0;
        if (exercise.kind !== "fourpart") return 1 - exercise.given;
        if (Number.isInteger(voice) && voice >= 0 && voice < 4 && voice !== exercise.given) return voice;
        return [0, 1, 2, 3].find(each => each !== exercise.given);
    }
    // The bars whose rhythm may change: all of a melody's; the fifth
    // species' but its last, a whole note. Four parts change chord by chord.
    function rhythmBars(exercise) {
        if (!rhythmEditable(exercise) || exercise.kind === "fourpart") return 0;
        const bars = Math.ceil(N.timed(N.voicesOf(exercise.score)[rhythmVoice(exercise)].notes).reduce((sum, entry) => sum + entry.length, 0) / BAR);
        return exercise.kind === "melody" ? bars : bars - 1;
    }

    // A span of time, from a place in the bar, as the fewest lengths that each
    // start where they may.
    function fillCodes(from, length) {
        const codes = [];
        let at = from;
        const end = from + length;
        while (at < end) {
            const code = FILL_CODES.find(each => codeLength(each) <= end - at && (at % BAR) % ALIGN[each] === 0 && (at % BAR) + codeLength(each) <= BAR);
            if (!code) break;
            codes.push(code);
            at += codeLength(code);
        }
        return codes;
    }

    // A melody's ties, and four parts' (2.11.0), hold only to the same pitch;
    // the fifth species' are its suspensions.
    function mendTies(exercise, notes) {
        if (exercise.kind === "species") return tieSuspensions(notes, exercise.species);
        return notes.map((note, index) => {
            const next = notes[index + 1];
            return note.tie && !(note.p && next?.p && midi(note.p) === midi(next.p)) ? { ...note, tie: false } : note;
        });
    }

    function rhythmSplit(exercise, from, to = from) {
        const timed = N.timed(N.voicesOf(exercise.score)[rhythmVoice(exercise)].notes);
        return {
            timed,
            before: timed.filter(entry => entry.onset < from * BAR).map(entry => entry.note),
            inside: timed.filter(entry => entry.onset >= from * BAR && entry.onset < (to + 1) * BAR),
            after: timed.filter(entry => entry.onset >= (to + 1) * BAR).map(entry => entry.note)
        };
    }

    // A bar's rhythm as its lengths, to copy.
    function barRhythm(exercise, bar) {
        if (!rhythmEditable(exercise)) return null;
        const { inside } = rhythmSplit(exercise, bar);
        return inside.length ? inside.map(entry => codeOf(entry.note)) : null;
    }

    // A bar's notes given a rhythm: each new note keeps the pitch of the note
    // that began at the same moment, the rest are to write (in a melody,
    // rests). Those listed in rests are empty whatever began there.
    function setBarRhythm(exercise, bar, pattern, { rests = [] } = {}) {
        if (!rhythmEditable(exercise) || !Number.isInteger(bar) || bar < 0 || bar >= rhythmBars(exercise)) return exercise;
        if (!Array.isArray(pattern) || !pattern.length || !pattern.every(code => codesFor(exercise).includes(code))) return exercise;
        if (pattern.reduce((sum, code) => sum + codeLength(code), 0) !== BAR) return exercise;
        const { before, inside, after } = rhythmSplit(exercise, bar);
        if (!inside.length) return exercise;
        let at = bar * BAR;
        const notes = pattern.map((code, index) => {
            const began = rests.includes(index) ? null : inside.find(entry => entry.onset === at);
            at += codeLength(code);
            return { p: began?.note.p ?? null, d: code[0], dot: code.endsWith("."), tie: false };
        });
        const changed = withVoiceNotes(exercise, rhythmVoice(exercise), mendTies(exercise, [...before, ...notes, ...after]));
        return exerciseText(changed) === exerciseText(exercise) ? exercise : changed;
    }

    // Bars given rhythms copied, in turn, from the first bar named on: as
    // many bars as were copied, or every bar of a range, the copied ones
    // repeating. Bars past the end are left out.
    function pasteRhythms(exercise, from, to, rhythms) {
        if (!Array.isArray(rhythms) || !rhythms.length) return exercise;
        const last = Math.min(rhythmBars(exercise) - 1, to > from ? to : from + rhythms.length - 1);
        let result = exercise;
        for (let bar = from; bar <= last; bar++) result = setBarRhythm(result, bar, rhythms[(bar - from) % rhythms.length]);
        return result;
    }

    // Bars emptied, their rhythm kept.
    function clearBars(exercise, from, to = from) {
        if (!rhythmEditable(exercise)) return exercise;
        const voice = rhythmVoice(exercise);
        const { before, inside, after } = rhythmSplit(exercise, from, Math.min(to, rhythmBars(exercise) - 1));
        if (!inside.some(entry => entry.note.p)) return exercise;
        const emptied = inside.map(entry => ({ ...entry.note, p: null, tie: false }));
        return withVoiceNotes(exercise, voice, mendTies(exercise, [...before, ...emptied, ...after]));
    }

    // One note's length changed, within its bar (in four parts, in the voice
    // named, held as tied notes into the chords it reaches). Longer, it takes
    // the time of the notes after it (one cut short keeps its pitch for what's
    // left); shorter, it leaves the time to write. Null when it doesn't fit.
    function setNoteLength(exercise, index, code, voice = null) {
        if (!rhythmEditable(exercise) || !codesFor(exercise).includes(code)) return null;
        voice = rhythmVoice(exercise, voice);
        const timed = N.timed(N.voicesOf(exercise.score)[voice].notes);
        const entry = timed[index];
        if (!entry) return null;
        let from;
        let barEnd;
        const start = entry.onset, end = start + codeLength(code);
        // Four parts: a note longer than what's left of its chord is held
        // into the next (2.11.0), as tied notes, one a chord.
        let held = null;
        if (exercise.kind === "fourpart") {
            const spans = chordSpans(exercise.numerals.length);
            const span = spans.find(each => start >= each.onset && start < spanEnd(each));
            if (!span) return null;
            const last = spans.find(each => end > each.onset && end <= spanEnd(each));
            if (!last) return null;
            [from, barEnd] = [span.onset, spanEnd(last)];
            if (last !== span) held = spans.filter(each => each.onset < end && spanEnd(each) > start).flatMap(each => fillCodes(Math.max(start, each.onset), Math.min(end, spanEnd(each)) - Math.max(start, each.onset)));
        } else {
            const bar = Math.floor(entry.onset / BAR);
            if (bar >= rhythmBars(exercise)) return null;
            [from, barEnd] = [bar * BAR, (bar + 1) * BAR];
        }
        if (end > barEnd || (start - from) % ALIGN[code] !== 0) return null;
        if (!held && codeOf(entry.note) === code) return exercise;
        const inBar = timed.filter(each => each.onset >= start && each.onset < barEnd && each.index > index);
        const kept = inBar.filter(each => each.onset >= end);
        const cut = inBar.find(each => each.onset < end && each.onset + each.length > end);
        const nextOnset = kept[0]?.onset ?? barEnd;
        const gap = fillCodes(end, nextOnset - end).map((each, at) => ({ p: at === 0 && cut ? cut.note.p : null, d: each[0], dot: each.endsWith("."), tie: false }));
        const notes = [
            ...timed.filter(each => each.index < index).map(each => each.note),
            ...(held
                ? held.map((each, at) => ({ ...entry.note, d: each[0], dot: each.endsWith("."), tie: at < held.length - 1 ? Boolean(entry.note.p) : entry.note.tie }))
                : [{ ...entry.note, d: code[0], dot: code.endsWith(".") }]),
            ...gap,
            ...kept.map(each => each.note),
            ...timed.filter(each => each.onset >= barEnd).map(each => each.note)
        ];
        const changed = withVoiceNotes(exercise, voice, mendTies(exercise, notes));
        return exerciseText(changed) === exerciseText(exercise) ? exercise : changed;
    }

    // A melody's note tied to the next, which takes its pitch; again, untied.
    // In four parts (2.11.0), in the voice named, and across a chord's start
    // too: that's how a suspension is written.
    function toggleTie(exercise, index, voice = null) {
        if (exercise?.kind !== "melody" && exercise?.kind !== "fourpart") return null;
        voice = rhythmVoice(exercise, voice);
        const notes = N.voicesOf(exercise.score)[voice].notes;
        const note = notes[index], next = notes[index + 1];
        if (!note?.p || !next) return null;
        const changed = notes.map((each, at) => (at === index ? { ...each, tie: !each.tie } : at === index + 1 && !note.tie ? { ...each, p: note.p } : each));
        return withVoiceNotes(exercise, voice, mendTies(exercise, changed));
    }

    // Four parts' rhythms a chord (2.11.0), offered to choose from: a half
    // note's chord, then the last chord's whole note.
    const CHORD_RHYTHMS = Object.freeze({
        h: Object.freeze(["h", "q q", "q. e", "q e e", "e e q"].map(text => Object.freeze(text.split(" ")))),
        w: Object.freeze(["w", "h h", "h. q", "h q q", "q q h"].map(text => Object.freeze(text.split(" "))))
    });

    // A chord's notes in one voice given a rhythm: each new note keeps the
    // pitch of the note that began at the same moment; the rest are to write.
    function setChordRhythm(exercise, voice, chord, pattern) {
        if (exercise?.kind !== "fourpart" || voice === exercise.given || !Array.isArray(pattern)) return exercise;
        const span = chordSpans(exercise.numerals.length)[chord];
        if (!span || !Number.isInteger(voice) || voice < 0 || voice > 3) return exercise;
        if (!pattern.length || !pattern.every(code => SPECIES_CODES.includes(code)) || pattern.reduce((sum, code) => sum + codeLength(code), 0) !== span.length) return exercise;
        const timed = N.timed(N.voicesOf(exercise.score)[voice].notes);
        let at = span.onset;
        const notes = pattern.map(code => {
            const began = timed.find(entry => entry.onset === at);
            at += codeLength(code);
            return { p: began?.note.p ?? null, d: code[0], dot: code.endsWith("."), tie: false };
        });
        // A note held into the chord stays held into its first note.
        const before = timed.filter(entry => entry.onset < span.onset).map(entry => entry.note);
        const after = timed.filter(entry => entry.onset >= spanEnd(span)).map(entry => entry.note);
        const lastTie = timed.filter(entry => entry.onset >= span.onset && entry.onset < spanEnd(span)).at(-1)?.note.tie;
        if (lastTie) notes[notes.length - 1].tie = true;
        const changed = withVoiceNotes(exercise, voice, mendTies(exercise, [...before, ...notes, ...after]));
        return exerciseText(changed) === exerciseText(exercise) ? exercise : changed;
    }

    // A chord's rhythm in one voice, as its lengths.
    function chordRhythmOf(exercise, voice, chord) {
        const span = exercise?.kind === "fourpart" ? chordSpans(exercise.numerals.length)[chord] : null;
        if (!span) return null;
        return N.timed(N.voicesOf(exercise.score)[voice].notes).filter(entry => entry.onset >= span.onset && entry.onset < spanEnd(span)).map(entry => codeOf(entry.note));
    }

    // Taps, in eighths from the first bar's start, as bars' rhythms: each tap
    // to the nearest eighth begins a note that lasts to the next; time before
    // the first is a rest. Each bar: { pattern, rests } for setBarRhythm.
    function rhythmFromTaps(taps, bars = 1) {
        const span = bars * BAR;
        const onsets = [...new Set(taps.filter(Number.isFinite).map(Math.round))].filter(at => at >= 0 && at < span).sort((a, b) => a - b);
        if (!onsets.length) return null;
        const result = Array.from({ length: bars }, () => ({ pattern: [], rests: [] }));
        const put = (from, length, rest) => {
            fillCodes(from, length).forEach((code, at) => {
                const place = result[Math.floor(from / BAR)];
                if (rest || at > 0) place.rests.push(place.pattern.length);
                place.pattern.push(code);
                from += codeLength(code);
            });
        };
        // Each span is cut at the bar lines it crosses.
        const mark = (from, to, rest) => {
            while (from < to) {
                const stop = Math.min(to, (Math.floor(from / BAR) + 1) * BAR);
                put(from, stop - from, rest);
                from = stop;
                rest = true;
            }
        };
        if (onsets[0] > 0) mark(0, onsets[0], true);
        onsets.forEach((at, k) => mark(at, onsets[k + 1] ?? span, false));
        return result;
    }

    // The exercise begun again: every written voice emptied, the given one
    // kept; a species' own rhythm back (the fifth species' bars as they
    // began), four parts' chords unwritten, a half note each again. The same
    // exercise when there's nothing to clear.
    function clearWritten(exercise) {
        const voices = N.voicesOf(exercise.score);
        const blank = exercise.kind === "fourpart" ? chordRhythm(exercise.numerals.length).map(d => ({ p: null, d, dot: false, tie: false })) : null;
        const fresh = exercise.kind === "species"
            ? withVoiceNotes(exercise, 1 - exercise.given, speciesTemplate(exercise.species, voices[exercise.given].notes.length))
            : voices.reduce((done, voice, index) => (index === exercise.given ? done : withVoiceNotes(done, index, blank ?? voice.notes.map(note => ({ ...note, p: null, tie: false })))), exercise);
        return exerciseText(fresh) === exerciseText(exercise) ? exercise : fresh;
    }

    // A staff's clef (2.7.0): treble, alto, tenor or bass, chosen as it's
    // read; the notes stay where they sound.
    const STAFF_CLEFS = Object.freeze(["treble", "alto", "tenor", "bass"]);
    function withClef(exercise, staffIndex, clef) {
        const staff = exercise.score.staves[staffIndex];
        if (!staff || !STAFF_CLEFS.includes(clef) || staff.clef === clef) return exercise;
        const staves = exercise.score.staves.map((each, index) => ({ clef: index === staffIndex ? clef : each.clef, voices: each.voices }));
        const score = N.cleanScore({ title: exercise.title, key: exercise.score.key, meter: exercise.score.meter, staves });
        return score ? Object.freeze({ ...exercise, score }) : exercise;
    }

    function withVoiceNotes(exercise, voice, notes) {
        let index = 0;
        const staves = exercise.score.staves.map(staff => ({ clef: staff.clef, voices: staff.voices.map(each => (index++ === voice ? { name: each.name, notes } : each)) }));
        const score = N.cleanScore({ title: exercise.title, key: exercise.score.key, meter: exercise.score.meter, staves });
        return score ? Object.freeze({ ...exercise, score }) : exercise;
    }

    // ---- Model answers (2.6.0): what's to be written, written so the checker
    // finds no error, by a search the checker itself guides; of the answers
    // found, the one with the fewest warnings. Null when none is found within
    // `budget` checks, so it never runs long.

    // An exercise with some voices' notes replaced, unchecked: for the search alone.
    function quickVoices(exercise, replaced) {
        let index = 0;
        const staves = exercise.score.staves.map(staff => ({
            clef: staff.clef,
            voices: staff.voices.map(each => {
                const notes = replaced[index++];
                return notes ? { name: each.name, notes } : each;
            })
        }));
        return { ...exercise, score: { ...exercise.score, staves } };
    }
    const countOf = (problems, level) => problems.filter(each => each.level === level).length;
    // Problems the next note can still mend: a dissonance resolved, a pair of eighths finished.
    const MENDED_NEXT = new Set(["consonant", "strongBeat", "weakBeat", "preparation", "suspension", "eighths"]);
    // Fresh starts, each with its share of the budget: a line that's boxed
    // itself in near the cadence is begun again rather than searched to the end.
    const MODEL_RUNS = 6;

    function modelSpecies(exercise, random, budget) {
        const { species, given } = exercise;
        const key = exercise.score.key;
        const voices = N.voicesOf(exercise.score);
        const cpIndex = 1 - given, cpAbove = cpIndex === 0;
        const cf = voices[given].notes.map(note => note.p);
        if (cf.some(p => !p)) return null;
        const written = voices[cpIndex].notes;
        const timed = N.timed(written);
        const last = written.length - 1;
        // The first bar of the second species on opens with a rest.
        const first = species > 1 ? 1 : 0;
        const cfAt = index => cf[Math.min(cf.length - 1, Math.floor(timed[index].onset / BAR))];
        const steps = cf.map(p => p.step);
        const low = cpAbove ? Math.min(...steps) : Math.min(...steps) - 9;
        const high = cpAbove ? Math.max(...steps) + 9 : Math.max(...steps);
        const scale = [];
        for (let step = low; step <= high; step++) scale.push(N.pitch(step, N.keyAlter(modulo(step, 7), key.fifths)));
        const above = (p, c) => (cpAbove ? midi(p) - midi(c) : midi(c) - midi(p));
        // It ends on the final at a unison or octave; the note before it is a step away, the leading tone raised.
        const final = cf.at(-1);
        const finals = scale.filter(p => modulo(midi(p) - midi(final), 12) === 0 && above(p, final) >= 0);
        const beforeFinal = [];
        for (const f of finals) {
            for (const p of scale.filter(each => Math.abs(each.step - f.step) === 1)) {
                const raised = N.pitch(p.step, p.alter + 1);
                const lift = p.step < f.step && midi(f) - midi(p) === 2 && key.mode !== "phrygian" && allowedAlter(key, raised);
                beforeFinal.push(lift ? raised : p);
            }
        }
        // Near the close the mode's raised notes too (minor's sixth leads to its
        // leading tone: F sharp, G sharp, A).
        const raisedToo = scale.flatMap(p => {
            const raised = N.pitch(p.step, p.alter + 1);
            return allowedAlter(key, raised) ? [p, raised] : [p];
        });
        const closing = Math.max(0, cf.length - 2) * BAR;
        const options = index => {
            if (index === last) return finals;
            if (index === last - 1) return beforeFinal.filter(p => above(p, cfAt(index)) >= 0);
            return (timed[index].onset >= closing ? raisedToo : scale).filter(p => {
                const apart = above(p, cfAt(index));
                return apart >= 0 && apart <= 19;
            });
        };
        // Steps first, then small leaps; a consonance first where the beat is strong; in the
        // fourth species the downbeat held over from the beat before.
        const order = (list, index, previous) => list.map(p => {
            const beat = modulo(timed[index].onset, BAR);
            const strong = beat === 0 || species === 1;
            const c = cfAt(index);
            const vertical = cpAbove ? N.interval(c, p) : N.interval(p, c);
            let weight = random() * 1.5;
            if (strong && consonance(vertical) === "dissonant") weight += species === 4 && beat === 0 ? 0 : 6;
            if (consonance(vertical) === "perfect") weight += 0.6;
            if (previous) {
                const leap = Math.abs(p.step - previous.step);
                if (leap === 0) weight += species === 4 && beat === 0 ? -3 : 4;
                else weight += leap === 1 ? 0 : leap === 2 ? 0.9 : 1.8 + leap * 0.4;
            }
            return { p, weight };
        }).sort((a, b) => a.weight - b.weight).map(each => each.p);

        let checks = 0;
        const found = [];
        for (let run = 0; run < MODEL_RUNS && checks < budget; run++) {
            const until = Math.min(budget, checks + Math.ceil(budget / MODEL_RUNS));
            const notes = written.map(note => ({ p: null, d: note.d, dot: note.dot, tie: false }));
            let done = null;
            const look = () => {
                checks += 1;
                const tied = tieSuspensions(notes, species);
                return { tied, problems: checkSpecies(quickVoices(exercise, { [cpIndex]: tied })) };
            };
            // An error on a note already settled, or on this one when the next can't mend it, ends the branch.
            const fails = (problems, index) => problems.some(each => each.level === "error" && each.at.some(at => at.index <= index)
                && !(MENDED_NEXT.has(each.rule) && index < last && each.at.every(at => at.index >= index)));
            const search = (index, previous) => {
                for (const p of order(options(index), index, previous)) {
                    if (done || checks >= until) return;
                    notes[index].p = p;
                    const { tied, problems } = look();
                    if (fails(problems, index)) continue;
                    if (index === last) done = { notes: tied, warnings: countOf(problems, "warning") };
                    else search(index + 1, p);
                }
                if (!done) notes[index].p = null;
            };
            search(first, null);
            if (done) found.push(done);
        }
        if (!found.length) return null;
        const best = found.sort((a, b) => a.warnings - b.warnings)[0];
        return withVoiceNotes(exercise, cpIndex, best.notes);
    }

    // A move from chord to chord (soprano first): null if it breaks a rule
    // checkFourPart counts an error, else the warnings it would give.
    function fourPartMove(a, b, chordA, chordB, roles) {
        let warnings = 0;
        for (let v = 0; v < 4; v++) {
            const melodic = N.interval(a[v], b[v]);
            if (melodic.quality === "A" || melodic.quality === "AA" || melodic.number > 8 || melodic.simple === 7) return null;
            if (v < 3 && midi(b[v + 1]) > midi(a[v])) warnings += 1;
            if (v < 3 && midi(b[v]) < midi(a[v + 1])) warnings += 1;
        }
        for (let u = 0; u < 4; u++) for (let w = u + 1; w < 4; w++) {
            const before = N.interval(a[w], a[u]), after = N.interval(b[w], b[u]);
            if (consonance(after) !== "perfect" || consonance(before) !== "perfect" || before.simple !== after.simple) continue;
            const move = motion(a[u], b[u], a[w], b[w]);
            if (move === "similar") return null;
            if (move === "contrary") warnings += 1;
        }
        const outer = N.interval(b[3], b[0]);
        if (consonance(outer) === "perfect" && motion(a[0], b[0], a[3], b[3]) === "similar" && Math.abs(b[0].step - a[0].step) > 1) {
            const before = N.interval(a[3], a[0]);
            if (!(consonance(before) === "perfect" && before.simple === outer.simple)) return null;
        }
        if (roles.dominant(chordA) && roles.resolving(chordB)) {
            for (const v of roles.rootDegree(chordB) === 0 ? [0, 3] : [0]) {
                if (modulo(midi(a[v]), 12) === roles.leadingPc && midi(b[v]) - midi(a[v]) !== 1) return null;
            }
        }
        if (chordA.seventh) {
            for (let v = 0; v < 4; v++) {
                if (modulo(midi(a[v]), 12) !== chordA.pcs[3]) continue;
                const fall = a[v].step - b[v].step;
                if (!(fall === 1 && midi(a[v]) - midi(b[v]) <= 2) && midi(a[v]) !== midi(b[v])) return null;
            }
        }
        return warnings;
    }

    // Four parts' model answer: each chord's voicings, then the cheapest path
    // through them by the checker's rules for moves. A given voice may have
    // non-chord tones (2.11.0): its chord note in each chord is fixed, the
    // others keep clear of every note it sounds there, and its notes heard
    // across each chord's start make no parallels. A few tries, each with
    // other ties broken, while the budget lasts; embellished, the answer is
    // then given non-chord tones of its own.
    const MODEL_FOURPART_RUNS = 4;
    function modelFourPart(exercise, random, budget, embellish = false) {
        const key = exercise.score.key;
        const chords = exercise.numerals.map(text => chordFromNumeral(text, key));
        if (chords.some(chord => !chord)) return null;
        const spans = chordSpans(chords.length);
        const rhythm = chordRhythm(chords.length);
        const given = exercise.given;
        let fixed = null, bounds = null, heard = null;
        if (given >= 0) {
            const reading = readFourPart(exercise, { asked: true });
            const line = reading.voices[given];
            fixed = reading.chords.map(each => each.reps[given]);
            if (fixed.some(p => !p) || line.some(each => !each.p)) return null;
            const at = time => line.find(each => each.onset <= time && time < each.end).p;
            bounds = spans.map(span => {
                const inside = line.filter(each => each.onset < spanEnd(span) && each.end > span.onset).map(each => midi(each.p));
                return [Math.min(...inside), Math.max(...inside)];
            });
            heard = spans.map((span, k) => (k ? { from: at(span.onset - 0.5), to: at(span.onset) } : null));
        }
        const tonicPc = chords.at(-1).pcs[0];
        const leadingPc = modulo(tonicPc - 1, 12);
        // Each chord's voicings: complete, in range, spaced, the bass on its bass note;
        // a doubled root is best, a missing fifth or a doubled third a little worse.
        const VOICINGS_KEPT = 36;
        const voicingsOf = () => chords.map((chord, k) => {
            const pick = v => (v === given ? [midi(fixed[k])] : inRange(v === 3 ? [chord.bassPc] : chord.pcs, RANGES[v]));
            const list = [];
            for (const b of pick(3)) for (const t of pick(2)) for (const a of pick(1)) for (const s of pick(0)) {
                if (!(b <= t && t <= a && a <= s) || s - a > 12 || a - t > 12 || t - b > 19) continue;
                const values = [s, a, t, b];
                if (given > 0 && values[given - 1] < bounds[k][1]) continue;
                if (given >= 0 && given < 3 && values[given + 1] > bounds[k][0]) continue;
                const pcs = values.map(value => modulo(value, 12));
                if (!pcs.includes(chord.pcs[0]) || !pcs.includes(chord.pcs[1]) || (chord.seventh && !pcs.includes(chord.pcs[3]))) continue;
                if (pcs.filter(pc => pc === leadingPc).length > 1) continue;
                let cost = random() * 0.5;
                if (!chord.seventh && !pcs.includes(chord.pcs[2])) cost += 3;
                if (pcs.filter(pc => pc === chord.pcs[1]).length > 1) cost += 2;
                cost += Math.abs(s - 70) / 4 + Math.abs(a - 64) / 6 + Math.abs(t - 57) / 6;
                if (k === chords.length - 1 && pcs[0] !== tonicPc) cost += 8;
                list.push({ values, cost });
            }
            return list.sort((x, y) => x.cost - y.cost).slice(0, VOICINGS_KEPT).map(each => ({
                ...each,
                pitches: each.values.map((value, v) => (v === given ? fixed[k] : spellAs(value, chord)))
            }));
        });
        // The given voice's notes across a chord's start against another voice's move.
        const heardClear = (a, b, { from, to }) => [0, 1, 2, 3].every(v => {
            if (v === given) return true;
            const [upperA, lowerA, upperB, lowerB] = v < given ? [a[v], from, b[v], to] : [from, a[v], to, b[v]];
            const first = N.interval(lowerA, upperA), then = N.interval(lowerB, upperB);
            return !(consonance(then) === "perfect" && consonance(first) === "perfect" && first.simple === then.simple && motion(upperA, upperB, lowerA, lowerB) === "similar");
        });
        // From one chord to the next, by the checker's rules for moves: an error
        // rules the move out, a warning costs, and the upper voices move as
        // little as they can. The answer is checked whole at the end.
        const roles = keyRoles(key);
        let checks = 0;
        const pair = (from, to, k) => {
            checks += 1;
            const warnings = fourPartMove(from.pitches, to.pitches, chords[k - 1], chords[k], roles);
            if (warnings === null || (heard?.[k] && !heardClear(from.pitches, to.pitches, heard[k]))) return Infinity;
            const moves = [0, 1, 2].reduce((sum, v) => sum + Math.abs(to.values[v] - from.values[v]), 0);
            // A soprano that leaps past a fourth costs more: it's the line that's heard.
            const leap = Math.abs(to.values[0] - from.values[0]);
            return warnings * 8 + moves + (leap > 5 ? 6 : 0) + Math.abs(to.values[3] - from.values[3]) / 4;
        };
        for (let run = 0; run < MODEL_FOURPART_RUNS && checks <= budget; run++) {
            const voicings = voicingsOf();
            if (voicings.some(list => !list.length)) return null;
            let best = voicings[0].map(voicing => ({ total: voicing.cost, path: [voicing] }));
            for (let k = 1; k < chords.length && checks <= budget; k++) {
                best = voicings[k].map(voicing => {
                    let choice = null;
                    for (const each of best) {
                        if (each.total === Infinity) continue;
                        const total = each.total + pair(each.path.at(-1), voicing, k) + voicing.cost;
                        if (!choice || total < choice.total) choice = { total, path: [...each.path, voicing] };
                    }
                    return choice ?? { total: Infinity, path: [] };
                });
            }
            if (checks > budget) return null;
            const winner = best.filter(each => each.total < Infinity).sort((a, b) => a.total - b.total)[0];
            if (!winner) return null;
            const answer = [0, 1, 2, 3].reduce((done, v) => (v === given ? done : withVoiceNotes(done, v, winner.path.map((voicing, k) => ({ p: voicing.pitches[v], d: rhythm[k], dot: false, tie: false })))), exercise);
            if (checkFourPart(answer).some(each => each.level === "error")) continue;
            return embellish ? embellishFourPart(answer, { voices: [0, 1, 2, 3].filter(v => v !== given), random }) : answer;
        }
        return null;
    }

    // A step from a pitch, up or down: the key's note on that letter, or one
    // inflected when the key's would make an augmented or diminished second
    // with the note before or after (in minor, the raised sixth on the way
    // to the raised seventh).
    function stepPitch(key, from, way, to) {
        const step = from.step + way;
        const plain = N.keyAlter(modulo(step, 7), key.fifths);
        for (const alter of [plain, plain + 1, plain - 1]) {
            const p = N.pitch(step, alter);
            const seconds = [from, to].filter(Boolean).every(other => {
                const i = N.interval(p, other);
                return i.number === 2 && (i.quality === "M" || i.quality === "m");
            });
            if (seconds) return p;
        }
        return null;
    }

    // One non-chord tone added at a chord change (k to k + 1) in one voice,
    // or null where it can't go: a passing tone through a third and a
    // neighbor around a held note take the second half of the note before
    // the change, a run through a fourth its last two eighths; a suspension holds the note before into the next chord
    // when it falls by step to a note of that chord; an anticipation sounds
    // the last chord's note early.
    function embellishOnce(exercise, { voice, k, kind }, spans, chords) {
        const key = exercise.score.key;
        const notes = N.voicesOf(exercise.score)[voice].notes;
        const timed = N.timed(notes);
        const last = timed.find(entry => entry.onset + entry.length === spanEnd(spans[k]));
        const into = timed.find(entry => entry.onset === spans[k + 1].onset);
        if (!last || !into || !last.note.p || !into.note.p || last.held || into.held || last.note.tie || into.note.tie) return null;
        const a = last.note.p, b = into.note.p;
        const halves = { 4: ["q", "q"], 2: ["e", "e"] }[last.length];
        const note = (p, d) => ({ p, d, dot: false, tie: false });
        const replace = (list, entry, made) => [...list.slice(0, entry.index), ...made, ...list.slice(entry.index + 1)];
        let changed = null;
        if (kind === "passing" && halves && Math.abs(b.step - a.step) === 2) {
            const p = stepPitch(key, a, Math.sign(b.step - a.step), b);
            if (p) changed = replace(notes, last, [note(a, halves[0]), note(p, halves[1])]);
        } else if (kind === "run" && last.length === 4 && Math.abs(b.step - a.step) === 3) {
            // Through a fourth by step: a quarter, then two eighths.
            const way = Math.sign(b.step - a.step);
            const p = stepPitch(key, a, way, null);
            const q = p && stepPitch(key, p, way, b);
            if (q) changed = replace(notes, last, [note(a, "q"), note(p, "e"), note(q, "e")]);
        } else if (kind === "neighbor" && halves && midi(a) === midi(b)) {
            for (const way of (k + voice) % 2 ? [1, -1] : [-1, 1]) {
                const p = stepPitch(key, a, way, b);
                if (p) {
                    changed = replace(notes, last, [note(a, halves[0]), note(p, halves[1])]);
                    break;
                }
            }
        } else if (kind === "anticipation" && halves && k === spans.length - 2 && midi(a) !== midi(b) && Math.abs(b.step - a.step) <= 2) {
            changed = replace(notes, last, [note(a, halves[0]), note(b, halves[1])]);
        } else if (kind === "suspension" && a.step - b.step === 1 && !chords[k + 1].pcs.includes(pcOf(a)) && (into.length === 4 || into.length === 8)) {
            const half = into.length === 4 ? ["q", "q"] : ["h", "h"];
            const tied = notes.map((each, at) => (at === last.index ? { ...each, tie: true } : each));
            changed = replace(tied, into, [note(a, half[0]), note(b, half[1])]);
        }
        if (!changed) return null;
        const made = withVoiceNotes(exercise, voice, changed);
        return made === exercise ? null : made;
    }

    // An answer given non-chord tones (2.11.0), in the voices named, each kept
    // only if the checker then finds no error and no more warnings than
    // before: about one every two chord changes, never two at one change.
    // Passing tones are tried most often.
    const EMBELLISHMENTS = Object.freeze({ passing: 3, run: 2, neighbor: 1, suspension: 2, anticipation: 1 });
    function embellishFourPart(exercise, { voices = [0, 1, 2, 3], random = Math.random, share = 0.5 } = {}) {
        if (exercise?.kind !== "fourpart") return exercise;
        const first = checkFourPart(exercise);
        if (first.some(each => each.level === "error" || each.rule === "unfinished")) return exercise;
        const warnings = countOf(first, "warning");
        const spans = chordSpans(exercise.numerals.length);
        const chords = exercise.numerals.map(text => chordFromNumeral(text, exercise.score.key));
        if (chords.some(chord => !chord)) return exercise;
        const wanted = Math.max(1, Math.round((spans.length - 1) * share));
        const tries = [];
        for (const voice of voices) {
            if (voice === exercise.given) continue;
            for (let k = 0; k < spans.length - 1; k++) for (const [kind, weight] of Object.entries(EMBELLISHMENTS)) tries.push({ voice, k, kind, order: random() / weight });
        }
        tries.sort((a, b) => a.order - b.order);
        let current = exercise, added = 0;
        const used = new Set();
        for (const each of tries) {
            if (added >= wanted) break;
            if (used.has(each.k)) continue;
            const next = embellishOnce(current, each, spans, chords);
            if (!next) continue;
            const problems = checkFourPart(next);
            if (problems.some(found => found.level === "error") || countOf(problems, "warning") > warnings) continue;
            current = next;
            added += 1;
            used.add(each.k);
        }
        return current;
    }

    // The budget counts checks of a species line, or moves from chord to chord
    // in four parts, which cost far less: by default about 50 ms of searching at most.
    const MODEL_BUDGET = Object.freeze({ species: 6000, fourpart: 60000 });
    // Embellished (2.11.0), four parts' answer has non-chord tones too.
    function modelAnswer(exercise, { random = Math.random, budget = null, embellish = false } = {}) {
        if (exercise?.kind === "species") return modelSpecies(exercise, random, budget ?? MODEL_BUDGET.species);
        if (exercise?.kind === "fourpart") return modelFourPart(exercise, random, budget ?? MODEL_BUDGET.fourpart, embellish);
        return null;
    }

    return Object.freeze({
        RULE_GROUPS, RULE_SECTIONS, RULES_ALWAYS, RULE_PRESETS, cleanRulesOff, withRules,
        RULES, ruleById, rulesFor, rulesOfGroups, STYLES, stylesOf, styleOf, withStyle,
        FUX, CHANT, PROGRESSIONS, FOURPART_KEYS, FORMS, RANGES, FIFTH_BARS, HEADER, ID, METER, CANTUS_MODES, CANTUS_LENGTH,
        fuxNotes, makeCantus, cantusProblems, cantusFinals, cantusExercise, cantusOf, checkCantus, speciesTemplate, tieSuspensions, speciesExercise, consonance, checkSpecies,
        chordFromNumeral, figuresFor, numeralParts, numeralText, keyChords, analyze, chordRhythm, fourPartExercise, figuredBass, checkFourPart,
        NCT_KINDS, NCT_LABELS, CHORD_RHYTHMS, chordSpans, fitsChords, nonChordTones, drawnFourPart, embellishFourPart, setChordRhythm, chordRhythmOf,
        check, analysisLine, exerciseText, readExercise, setNote, setBarRhythm, clearWritten, allowedAlter, degreePitch, modelAnswer,
        CODES, codesFor, rhythmEditable, rhythmVoice, rhythmBars, fillCodes, barRhythm, pasteRhythms, clearBars, setNoteLength, toggleTie, rhythmFromTaps,
        MELODY_BARS, melodyExercise, withMelodyNotes, checkMelody, STAFF_CLEFS, withClef
    });
})();
