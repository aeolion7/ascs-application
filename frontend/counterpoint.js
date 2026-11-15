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
    function speciesExercise({ species = 1, cantus, cantusBelow = true, mode = "dorian", final = "D", title = "" }) {
        const fifths = N.keyFifths(final, mode);
        if (!Number.isInteger(species) || species < 1 || species > 5 || fifths === null || !Array.isArray(cantus) || cantus.length < 4) return null;
        const cf = placeByOctaves(cantus, cantusBelow ? 50 : 67);
        const cfVoice = { name: "Cantus firmus", notes: cf.map(p => ({ p, d: "w", dot: false, tie: false })) };
        const cpVoice = { name: "Counterpoint", notes: speciesTemplate(species, cf.length) };
        const staves = cantusBelow
            ? [{ clef: "treble", voices: [cpVoice] }, { clef: "bass", voices: [cfVoice] }]
            : [{ clef: "treble", voices: [cfVoice] }, { clef: "bass", voices: [cpVoice] }];
        const score = N.cleanScore({ title, key: { fifths, mode }, meter: METER, staves });
        return score && Object.freeze({ kind: "species", species, cantusBelow, title: score.title, given: cantusBelow ? 1 : 0, numerals: Object.freeze([]), score });
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
                problem(list, "error", "cadence", "Reach the final by step.", last.onset, at(last));
            } else if (degree !== 1 && degree !== 6) {
                problem(list, "error", "cadence", fromBelow ? `Before the last note, the second degree, ${secondName}, or the leading tone, ${leadingName}.` : `Before the last note, the second degree, ${secondName}.`, before.onset, at({ index: before.index }));
            } else if (step === 1 && !fromBelow) {
                problem(list, "error", "cadence", `In Phrygian, reach the final from above: ${secondName} to ${finalName}.`, before.onset, at({ index: before.index }));
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
            else if (!MELODIC.has(melodic.name) && !(melodic.name === "m6" && step > 0)) {
                const odd = /^[Ad]/.test(melodic.quality);
                problem(list, "error", "leap", melodic.name === "m6" ? "A leap of a minor sixth down; a sixth leaps only up." : `A leap of ${melodic.name}${odd ? ", an augmented or diminished interval" : ""}.`, b.onset, [...at(a), ...at(b)]);
            }
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
                } else if (species === 1) {
                    problem(list, "error", "dissonance", `A dissonance: ${word}. First species uses only consonances.`, note.onset, at(note));
                } else if (strong || species === 4) {
                    problem(list, "error", "dissonance", species === 4 ? `The note before a tie must be consonant, not ${word}.` : `A dissonance on the downbeat: ${word}.`, note.onset, at(note));
                } else {
                    const cambiata = species >= 3 && stepIn && previous.p.step > note.p.step && next && next.p.step === note.p.step - 2 && notes[n + 2] && notes[n + 2].p.step === next.p.step + 1;
                    const allowed = passing || (species >= 3 && (neighbor || cambiata));
                    if (!allowed) problem(list, "error", "dissonance", species === 2 ? `A dissonance on the weak beat must pass by step: ${word}.` : `A dissonance must pass, or turn back, by step: ${word}.`, note.onset, at(note));
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
                if (Math.abs(step) !== 1) problem(list, "error", "cadence", "Reach the last note by step.", last.onset, at(last));
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
                const text = how === "downbeats" ? `Parallel ${perfectKind(b.vertical)} on successive downbeats.` : `Parallel ${perfectKind(b.vertical)}.`;
                problem(list, how === "downbeats" && species === 3 ? "warning" : "error", "parallel", text, b.onset, [...at(a), ...at(b)]);
            } else if (move === "similar" && how === "next") {
                const upperA = cpAbove ? cpA : cfA, upperB = cpAbove ? cpB : cfB;
                if (Math.abs(upperB.step - upperA.step) > 1) problem(list, "error", "hidden", `Hidden ${perfectKind(b.vertical)}: both voices move the same way into a perfect interval, the upper by leap.`, b.onset, at(b));
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
            } else if (!MELODIC.has(melodic.name) && !(melodic.name === "m6" && step > 0)) {
                const odd = /^[Ad]/.test(melodic.quality);
                problem(list, "error", "leap", melodic.name === "m6" ? "A leap of a minor sixth down; a sixth leaps only up." : `A leap of ${melodic.name}${odd ? ", an augmented or diminished interval" : ""}.`, b.onset, [...at(a), ...at(b)]);
            }
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
            if (tops.length > 1 && !unwritten) problem(list, "warning", "climax", `The highest note, ${N.pitchLetterName(tops[0].p)}, comes ${tops.length} times; one high point is stronger.`, tops[1].onset, at(tops[1]));
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
            if (run === 4) problem(list, "warning", "run", `Four ${downs[n].vertical.simple === 3 ? "thirds" : "sixths"} in a row; vary the intervals.`, downs[n].onset, at(downs[n]));
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
    function analyze(pitches, key) {
        const sounding = pitches.filter(Boolean);
        if (sounding.length < 3) return null;
        const pcs = new Set(sounding.map(p => modulo(midi(p), 12)));
        const bassPc = modulo(midi(sounding.reduce((low, p) => (midi(p) < midi(low) ? p : low))), 12);
        const fits = keyChords(key).filter(chord => [...pcs].every(pc => chord.pcs.includes(pc)) && pcs.has(chord.pcs[0]) && pcs.has(chord.pcs[1]) && (!chord.seventh || pcs.has(chord.pcs[3])) && chord.pcs.includes(bassPc));
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

    function fourPartExercise({ form = "numerals", tonic = "C", mode = "major", progression = null, random = Math.random, title = "" }) {
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
        if (form === "figured") {
            const line = smoothLine(chords.map(chord => inRange([chord.bassPc], RANGES[3])), (from, to, k) => (from === null ? Math.abs(to - 48) / 4 : Math.abs(to - from) + (Math.abs(to - from) > 7 ? 6 : 0)) + (k === chords.length - 1 && to > 52 ? 4 : 0), random);
            voices[3] = line.map((value, k) => ({ p: spellAs(value, chords[k]), d: rhythm[k], dot: false, tie: false }));
            given = 3;
        } else if (form === "soprano") {
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
        return score && Object.freeze({ kind: "fourpart", form, title: score.title, given, numerals: Object.freeze([...numerals]), score });
    }

    // What the figured bass shows under each bass note.
    const figuredBass = exercise => exercise.numerals.map(text => {
        const chord = chordFromNumeral(text, exercise.score.key);
        return chord ? figuresFor(chord, exercise.score.key) : Object.freeze([]);
    });

    function checkFourPart(exercise) {
        const { score } = exercise;
        const key = score.key;
        const list = [];
        const voices = N.voicesOf(score).map(voice => N.timed(voice.notes));
        const onsets = voices[0].map(entry => entry.onset);
        const slots = onsets.map((onset, k) => voices.map(entries => entries.find(entry => entry.onset === onset)?.note.p ?? null));
        const unwritten = slots.reduce((sum, slot) => sum + slot.filter(p => !p).length, 0);
        if (unwritten) problem(list, "info", "unfinished", `${unwritten} ${unwritten === 1 ? "note" : "notes"} still to write.`, null, []);
        const at = (voice, k) => ({ voice, index: k });
        const tonic = tonicOf(key);
        const tonicPc = modulo(N.NATURAL[tonic.step] + tonic.alter, 12);
        const leadingPc = modulo(tonicPc - 1, 12);
        // A chord on the fifth or seventh degree holding the leading tone acts
        // as a dominant; the tonic and submediant chords take its resolution.
        const rootDegree = chord => modulo(chord.tones[0].letter - tonic.step, 7);
        const dominant = chord => Boolean(chord) && [4, 6].includes(rootDegree(chord)) && chord.pcs.includes(leadingPc);
        const resolving = chord => Boolean(chord) && [0, 5].includes(rootDegree(chord));
        const asked = exercise.form === "soprano" ? [] : exercise.numerals.map(text => chordFromNumeral(text, key));
        const analysis = slots.map(slot => analyze(slot, key));

        slots.forEach((slot, k) => {
            const onset = onsets[k];
            slot.forEach((p, v) => {
                if (!p) return;
                const [low, high] = RANGES[v];
                if (midi(p) < low || midi(p) > high) problem(list, "error", "range", `The ${VOICE_WORDS[v]} is out of its range (${name(N.pitchFromMidi(low, 0))}${DASH}${name(N.pitchFromMidi(high, 0))}).`, onset, [at(v, k)]);
            });
            for (let v = 0; v < 3; v++) {
                const upper = slot[v], lower = slot[v + 1];
                if (!upper || !lower) continue;
                if (midi(upper) < midi(lower)) problem(list, "error", "crossing", `The ${VOICE_WORDS[v + 1]} is above the ${VOICE_WORDS[v]}.`, onset, [at(v, k), at(v + 1, k)]);
                const apart = midi(upper) - midi(lower);
                if (v < 2 && apart > 12) problem(list, "error", "spacing", `The ${VOICE_WORDS[v]} and ${VOICE_WORDS[v + 1]} are more than an octave apart.`, onset, [at(v, k), at(v + 1, k)]);
                if (v === 2 && apart > 19) problem(list, "warning", "spacing", "The tenor and bass are more than a twelfth apart.", onset, [at(2, k), at(3, k)]);
            }
            if (slot.every(Boolean)) {
                const pcs = slot.map(p => modulo(midi(p), 12));
                const want = asked[k];
                if (dominant(want ?? analysis[k]?.chord) && pcs.filter(pc => pc === leadingPc).length > 1) problem(list, "error", "doubled", "The leading tone is doubled.", onset, slot.map((_, v) => at(v, k)).filter((_, v) => pcs[v] === leadingPc));
                if (want) {
                    const fits = pcs.every(pc => want.pcs.includes(pc)) && pcs.includes(want.pcs[0]) && pcs.includes(want.pcs[1]) && (!want.seventh || pcs.includes(want.pcs[3]));
                    const tones = want.tones.map(tone => N.pitchLetterName(N.pitch(tone.letter, tone.alter))).join(" ");
                    if (!fits) problem(list, "error", "chord", `Asked for ${numeralText(want.numeral)} (${tones}).`, onset, slot.map((_, v) => at(v, k)));
                    else if (modulo(midi(slot[3]), 12) !== want.bassPc) problem(list, "error", "inversion", `${numeralText(want.numeral)} needs ${N.pitchLetterName(N.pitch(want.bass.letter, want.bass.alter))} in the bass.`, onset, [at(3, k)]);
                } else if (!analysis[k]) {
                    problem(list, "error", "chord", "These notes aren't a chord of the key.", onset, slot.map((_, v) => at(v, k)));
                } else if (!pcs.includes(analysis[k].chord.pcs[1])) {
                    problem(list, "error", "third", "The chord has no third.", onset, slot.map((_, v) => at(v, k)));
                }
            }
        });

        // From each chord to the next.
        for (let k = 1; k < slots.length; k++) {
            const a = slots[k - 1], b = slots[k], onset = onsets[k];
            for (let v = 0; v < 4; v++) {
                if (!a[v] || !b[v]) continue;
                const melodic = N.interval(a[v], b[v]);
                if (melodic.quality === "A" || melodic.quality === "AA") problem(list, "error", "augmented", `An augmented ${intervalWord(melodic)} in the ${VOICE_WORDS[v]}.`, onset, [at(v, k - 1), at(v, k)]);
                else if (melodic.number > 8 || melodic.simple === 7) problem(list, "error", "leap", `A leap of ${melodic.name} in the ${VOICE_WORDS[v]}.`, onset, [at(v, k - 1), at(v, k)]);
                if (v < 3 && a[v + 1] && b[v + 1]) {
                    if (midi(b[v + 1]) > midi(a[v])) problem(list, "warning", "overlap", `The ${VOICE_WORDS[v + 1]} moves above where the ${VOICE_WORDS[v]} was.`, onset, [at(v + 1, k)]);
                    if (midi(b[v]) < midi(a[v + 1])) problem(list, "warning", "overlap", `The ${VOICE_WORDS[v]} moves below where the ${VOICE_WORDS[v + 1]} was.`, onset, [at(v, k)]);
                }
            }
            for (let u = 0; u < 4; u++) for (let w = u + 1; w < 4; w++) {
                if (!a[u] || !a[w] || !b[u] || !b[w]) continue;
                const before = N.interval(a[w], a[u]), after = N.interval(b[w], b[u]);
                if (consonance(after) !== "perfect" || consonance(before) !== "perfect" || before.simple !== after.simple) continue;
                const move = motion(a[u], b[u], a[w], b[w]);
                const pair = `${VOICE_WORDS[u]} and ${VOICE_WORDS[w]}`;
                if (move === "similar") problem(list, "error", "parallel", `Parallel ${perfectKind(after)}: ${pair}.`, onset, [at(u, k - 1), at(u, k), at(w, k - 1), at(w, k)]);
                else if (move === "contrary") problem(list, "warning", "contrary", `${after.simple === 1 ? "Octaves" : "Fifths"} by contrary motion: ${pair}.`, onset, [at(u, k), at(w, k)]);
            }
            if (a[0] && a[3] && b[0] && b[3]) {
                const after = N.interval(b[3], b[0]);
                if (consonance(after) === "perfect" && motion(a[0], b[0], a[3], b[3]) === "similar" && Math.abs(b[0].step - a[0].step) > 1) {
                    const before = N.interval(a[3], a[0]);
                    if (!(consonance(before) === "perfect" && before.simple === after.simple)) problem(list, "error", "hidden", `Hidden ${perfectKind(after)} in the outer voices: the soprano leaps into them.`, onset, [at(0, k), at(3, k)]);
                }
            }
            // The leading tone in an outer voice rises to the tonic; a seventh falls by step.
            const chordA = asked[k - 1] ?? analysis[k - 1]?.chord;
            const chordB = asked[k] ?? analysis[k]?.chord;
            if (dominant(chordA) && resolving(chordB)) {
                for (const v of [0, 3]) {
                    if (a[v] && b[v] && modulo(midi(a[v]), 12) === leadingPc && midi(b[v]) - midi(a[v]) !== 1) {
                        problem(list, "error", "leading", `The leading tone in the ${VOICE_WORDS[v]} should rise to the tonic.`, onset, [at(v, k - 1), at(v, k)]);
                    }
                }
            }
            if (chordA?.seventh) {
                for (let v = 0; v < 4; v++) {
                    if (!a[v] || !b[v] || modulo(midi(a[v]), 12) !== chordA.pcs[3]) continue;
                    const fall = a[v].step - b[v].step;
                    const held = midi(a[v]) === midi(b[v]);
                    if (!(fall === 1 && midi(a[v]) - midi(b[v]) <= 2) && !held) problem(list, "error", "seventh", `The seventh (${N.pitchLetterName(a[v])}) in the ${VOICE_WORDS[v]} should fall by step.`, onset, [at(v, k - 1), at(v, k)]);
                }
            }
        }
        return sortProblems(list);
    }

    const check = exercise => (exercise.kind === "species" ? checkSpecies(exercise) : exercise.kind === "cantus" ? checkCantus(exercise) : checkFourPart(exercise));

    // Under the staff: in species, each counterpoint note's interval with the
    // cantus (8, 6, 3); in a cantus firmus, each note's degree (♯7 raised);
    // in four parts, each chord's numeral and figures.
    function analysisLine(exercise) {
        const { score } = exercise;
        if (exercise.kind === "cantus") {
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
        const voices = N.voicesOf(score).map(voice => N.timed(voice.notes));
        return voices[0].map(entry => {
            const slot = voices.map(entries => entries.find(each => each.onset === entry.onset)?.note.p ?? null);
            const found = analyze(slot, score.key);
            return { onset: entry.onset, text: found ? found.numeral : "", parts: found ? numeralParts(found.numeral) : null };
        });
    }

    // ---- Exercises as kept (data\counterpoint, a file each):
    //   Maestro exercise 1
    //   <title>
    //   kind <species|fourpart|cantus> <1-5 | numerals|figured|soprano | -> <below|above|->
    //   key <fifths> <mode>
    //   numerals <I IV V7 I>            (four-part only)
    //   voice <staff 1|2> <clef> <given|written> <name> <notes>   (one for a cantus firmus)
    // Fields are separated by tabs. A note is its step, an alteration (+1, -2),
    // its duration (w, h, q, e), "." if dotted and "~" if tied: 28h, 29+1q~, 33-1w.
    // A rest is r and its duration.

    const HEADER = "Maestro exercise 1";
    const ID = /^[a-z0-9]{1,40}$/;
    const NOTE_TOKEN = /^(r|(\d{1,2})([+-][12])?)([whqe])(\.?)(~?)$/;

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
        const kindOf = { species: String(exercise.species), fourpart: exercise.form, cantus: "-" }[exercise.kind];
        lines.push(["kind", exercise.kind, kindOf, exercise.kind === "species" ? (exercise.cantusBelow ? "below" : "above") : "-"].join("\t"));
        lines.push(["key", String(score.key.fifths), score.key.mode].join("\t"));
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
        if (lines[0] !== HEADER || lines.length < 5 || lines.length > 9) return null;
        const title = cleanTitle(lines[1]);
        const kind = lines[2].split("\t");
        const keyLine = lines[3].split("\t");
        if (kind[0] !== "kind" || keyLine[0] !== "key" || keyLine.length !== 3) return null;
        const fifths = Number(keyLine[1]);
        const key = { fifths, mode: keyLine[2] };
        let numerals = [];
        let at = 4;
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
            if (parts.length !== 6 || parts[0] !== "voice" || !["1", "2"].includes(parts[1]) || !["given", "written"].includes(parts[3])) return null;
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
        if (kind[1] === "species") {
            const species = Number(kind[2]);
            if (!Number.isInteger(species) || species < 1 || species > 5 || !["below", "above"].includes(kind[3]) || count !== 2 || given !== (kind[3] === "below" ? 1 : 0)) return null;
            return Object.freeze({ kind: "species", species, cantusBelow: kind[3] === "below", title, given, numerals: Object.freeze([]), score });
        }
        if (kind[1] === "fourpart") {
            if (!FORMS.includes(kind[2]) || count !== 4 || !["major", "minor"].includes(key.mode)) return null;
            const wantGiven = { numerals: -1, figured: 3, soprano: 0 }[kind[2]];
            if (given !== wantGiven || numerals.some(text => !chordFromNumeral(text, key))) return null;
            if (N.voicesOf(score).some(voice => voice.notes.length !== numerals.length)) return null;
            return Object.freeze({ kind: "fourpart", form: kind[2], title, given, numerals: Object.freeze(numerals), score });
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
        if (exercise.kind === "species") changed = tieSuspensions(changed, exercise.species);
        return withVoiceNotes(exercise, voice, changed);
    }

    // The fifth species' bar rhythms: a bar's notes replaced by one of these,
    // its pitches carried over where they fit.
    const FIFTH_BARS = Object.freeze(["w", "h h", "h q q", "q q h", "q q q q", "h. q", "q e e h", "q e e q q", "h q e e"].map(text => Object.freeze(text.split(" "))));
    function setBarRhythm(exercise, bar, pattern) {
        if (exercise.kind !== "species" || exercise.species !== 5) return exercise;
        const cpIndex = 1 - exercise.given;
        const voices = N.voicesOf(exercise.score);
        const timed = N.timed(voices[cpIndex].notes);
        const before = timed.filter(entry => Math.floor(entry.onset / BAR) < bar).map(entry => entry.note);
        const inBar = timed.filter(entry => Math.floor(entry.onset / BAR) === bar).map(entry => entry.note);
        const after = timed.filter(entry => Math.floor(entry.onset / BAR) > bar).map(entry => entry.note);
        if (!inBar.length || !after.length) return exercise;
        const notes = pattern.map((code, at) => ({ p: inBar[at]?.p ?? null, d: code[0], dot: code.endsWith("."), tie: false }));
        return withVoiceNotes(exercise, cpIndex, tieSuspensions([...before, ...notes, ...after], 5));
    }

    // The exercise begun again: every written voice emptied, the given one
    // kept; a species' own rhythm back (the fifth species' bars as they
    // began), four parts' chords unwritten. The same exercise when there's
    // nothing to clear.
    function clearWritten(exercise) {
        const voices = N.voicesOf(exercise.score);
        const fresh = exercise.kind === "species"
            ? withVoiceNotes(exercise, 1 - exercise.given, speciesTemplate(exercise.species, voices[exercise.given].notes.length))
            : voices.reduce((done, voice, index) => (index === exercise.given ? done : withVoiceNotes(done, index, voice.notes.map(note => ({ ...note, p: null, tie: false })))), exercise);
        return exerciseText(fresh) === exerciseText(exercise) ? exercise : fresh;
    }

    function withVoiceNotes(exercise, voice, notes) {
        let index = 0;
        const staves = exercise.score.staves.map(staff => ({ clef: staff.clef, voices: staff.voices.map(each => (index++ === voice ? { name: each.name, notes } : each)) }));
        const score = N.cleanScore({ title: exercise.title, key: exercise.score.key, meter: exercise.score.meter, staves });
        return score ? Object.freeze({ ...exercise, score }) : exercise;
    }

    return Object.freeze({
        FUX, CHANT, PROGRESSIONS, FOURPART_KEYS, FORMS, RANGES, FIFTH_BARS, HEADER, ID, METER, CANTUS_MODES, CANTUS_LENGTH,
        fuxNotes, makeCantus, cantusProblems, cantusFinals, cantusExercise, cantusOf, checkCantus, speciesTemplate, tieSuspensions, speciesExercise, consonance, checkSpecies,
        chordFromNumeral, figuresFor, numeralParts, numeralText, keyChords, analyze, chordRhythm, fourPartExercise, figuredBass, checkFourPart,
        check, analysisLine, exerciseText, readExercise, setNote, setBarRhythm, clearWritten, allowedAlter, degreePitch
    });
})();
