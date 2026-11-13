"use strict";
// Music for the Conservatory (2.3.0): notes spelled as a key spells them,
// scales and their chords, the instruments and their tunings, pitches, the
// page's kept settings and a plucked string's sound. Pure, so they can be
// tested; neckview.js draws them.

globalThis.MaestroMusic = (() => {
    const LETTERS = "CDEFGAB";
    const NATURAL = [0, 2, 4, 5, 7, 9, 11];
    const MAJOR = NATURAL;
    const SIGNS = { "-2": "\u{1D12B}", "-1": "♭", 0: "", 1: "♯", 2: "\u{1D12A}" };

    // The roots offered, by name: a key is spelled from its name.
    const ROOTS = Object.freeze(["C", "C♯", "D♭", "D", "D♯", "E♭", "E", "F", "F♯", "G♭", "G", "G♯", "A♭", "A", "A♯", "B♭", "B"]);

    // Each scale as [degree, semitones above the root], in its family. A
    // degree's letter is counted from the root's, so G major has F sharp and
    // the blues has a flat 5. Hirajoshi and the others with several readings
    // take the one most guitar references use.
    const SCALES = Object.freeze({
        major: { family: "Major and its modes", label: "Major (Ionian)", steps: [[1, 0], [2, 2], [3, 4], [4, 5], [5, 7], [6, 9], [7, 11]] },
        dorian: { family: "Major and its modes", label: "Dorian", steps: [[1, 0], [2, 2], [3, 3], [4, 5], [5, 7], [6, 9], [7, 10]] },
        phrygian: { family: "Major and its modes", label: "Phrygian", steps: [[1, 0], [2, 1], [3, 3], [4, 5], [5, 7], [6, 8], [7, 10]] },
        lydian: { family: "Major and its modes", label: "Lydian", steps: [[1, 0], [2, 2], [3, 4], [4, 6], [5, 7], [6, 9], [7, 11]] },
        mixolydian: { family: "Major and its modes", label: "Mixolydian", steps: [[1, 0], [2, 2], [3, 4], [4, 5], [5, 7], [6, 9], [7, 10]] },
        minor: { family: "Major and its modes", label: "Natural minor (Aeolian)", steps: [[1, 0], [2, 2], [3, 3], [4, 5], [5, 7], [6, 8], [7, 10]] },
        locrian: { family: "Major and its modes", label: "Locrian", steps: [[1, 0], [2, 1], [3, 3], [4, 5], [5, 6], [6, 8], [7, 10]] },
        harmonic: { family: "Harmonic minor and its modes", label: "Harmonic minor", steps: [[1, 0], [2, 2], [3, 3], [4, 5], [5, 7], [6, 8], [7, 11]] },
        locrianNatural6: { family: "Harmonic minor and its modes", label: "Locrian \u266E6", steps: [[1, 0], [2, 1], [3, 3], [4, 5], [5, 6], [6, 9], [7, 10]] },
        ionianSharp5: { family: "Harmonic minor and its modes", label: "Ionian \u266F5", steps: [[1, 0], [2, 2], [3, 4], [4, 5], [5, 8], [6, 9], [7, 11]] },
        dorianSharp4: { family: "Harmonic minor and its modes", label: "Dorian \u266F4", steps: [[1, 0], [2, 2], [3, 3], [4, 6], [5, 7], [6, 9], [7, 10]] },
        phrygianDominant: { family: "Harmonic minor and its modes", label: "Phrygian dominant", steps: [[1, 0], [2, 1], [3, 4], [4, 5], [5, 7], [6, 8], [7, 10]] },
        lydianSharp2: { family: "Harmonic minor and its modes", label: "Lydian \u266F2", steps: [[1, 0], [2, 3], [3, 4], [4, 6], [5, 7], [6, 9], [7, 11]] },
        ultralocrian: { family: "Harmonic minor and its modes", label: "Ultralocrian (altered \u{1D12B}7)", steps: [[1, 0], [2, 1], [3, 3], [4, 4], [5, 6], [6, 8], [7, 9]] },
        melodic: { family: "Melodic minor and its modes", label: "Melodic minor", steps: [[1, 0], [2, 2], [3, 3], [4, 5], [5, 7], [6, 9], [7, 11]] },
        dorianFlat2: { family: "Melodic minor and its modes", label: "Dorian \u266D2", steps: [[1, 0], [2, 1], [3, 3], [4, 5], [5, 7], [6, 9], [7, 10]] },
        lydianAugmented: { family: "Melodic minor and its modes", label: "Lydian augmented", steps: [[1, 0], [2, 2], [3, 4], [4, 6], [5, 8], [6, 9], [7, 11]] },
        lydianDominant: { family: "Melodic minor and its modes", label: "Lydian dominant", steps: [[1, 0], [2, 2], [3, 4], [4, 6], [5, 7], [6, 9], [7, 10]] },
        mixolydianFlat6: { family: "Melodic minor and its modes", label: "Mixolydian \u266D6", steps: [[1, 0], [2, 2], [3, 4], [4, 5], [5, 7], [6, 8], [7, 10]] },
        locrianNatural2: { family: "Melodic minor and its modes", label: "Locrian \u266E2 (half-diminished)", steps: [[1, 0], [2, 2], [3, 3], [4, 5], [5, 6], [6, 8], [7, 10]] },
        altered: { family: "Melodic minor and its modes", label: "Altered (super Locrian)", steps: [[1, 0], [2, 1], [3, 3], [4, 4], [5, 6], [6, 8], [7, 10]] },
        harmonicMajor: { family: "More seven-note scales", label: "Harmonic major", steps: [[1, 0], [2, 2], [3, 4], [4, 5], [5, 7], [6, 8], [7, 11]] },
        doubleHarmonic: { family: "More seven-note scales", label: "Double harmonic major (Byzantine)", steps: [[1, 0], [2, 1], [3, 4], [4, 5], [5, 7], [6, 8], [7, 11]] },
        hungarianMinor: { family: "More seven-note scales", label: "Hungarian minor", steps: [[1, 0], [2, 2], [3, 3], [4, 6], [5, 7], [6, 8], [7, 11]] },
        hungarianMajor: { family: "More seven-note scales", label: "Hungarian major", steps: [[1, 0], [2, 3], [3, 4], [4, 6], [5, 7], [6, 9], [7, 10]] },
        neapolitanMinor: { family: "More seven-note scales", label: "Neapolitan minor", steps: [[1, 0], [2, 1], [3, 3], [4, 5], [5, 7], [6, 8], [7, 11]] },
        neapolitanMajor: { family: "More seven-note scales", label: "Neapolitan major", steps: [[1, 0], [2, 1], [3, 3], [4, 5], [5, 7], [6, 9], [7, 11]] },
        persian: { family: "More seven-note scales", label: "Persian", steps: [[1, 0], [2, 1], [3, 4], [4, 5], [5, 6], [6, 8], [7, 11]] },
        enigmatic: { family: "More seven-note scales", label: "Enigmatic", steps: [[1, 0], [2, 1], [3, 4], [4, 6], [5, 8], [6, 10], [7, 11]] },
        majorPentatonic: { family: "Pentatonic and blues", label: "Major pentatonic", steps: [[1, 0], [2, 2], [3, 4], [5, 7], [6, 9]] },
        minorPentatonic: { family: "Pentatonic and blues", label: "Minor pentatonic", steps: [[1, 0], [3, 3], [4, 5], [5, 7], [7, 10]] },
        blues: { family: "Pentatonic and blues", label: "Blues", steps: [[1, 0], [3, 3], [4, 5], [5, 6], [5, 7], [7, 10]] },
        majorBlues: { family: "Pentatonic and blues", label: "Major blues", steps: [[1, 0], [2, 2], [3, 3], [3, 4], [5, 7], [6, 9]] },
        egyptian: { family: "Pentatonic and blues", label: "Egyptian (suspended pentatonic)", steps: [[1, 0], [2, 2], [4, 5], [5, 7], [7, 10]] },
        hirajoshi: { family: "Japanese and Indonesian", label: "Hirajoshi", steps: [[1, 0], [2, 2], [3, 3], [5, 7], [6, 8]] },
        "in": { family: "Japanese and Indonesian", label: "In (Miyako-bushi)", steps: [[1, 0], [2, 1], [4, 5], [5, 7], [6, 8]] },
        insen: { family: "Japanese and Indonesian", label: "Insen", steps: [[1, 0], [2, 1], [4, 5], [5, 7], [7, 10]] },
        iwato: { family: "Japanese and Indonesian", label: "Iwato", steps: [[1, 0], [2, 1], [4, 5], [5, 6], [7, 10]] },
        yo: { family: "Japanese and Indonesian", label: "Yo", steps: [[1, 0], [2, 2], [4, 5], [5, 7], [6, 9]] },
        kumoi: { family: "Japanese and Indonesian", label: "Kumoi", steps: [[1, 0], [2, 2], [3, 3], [5, 7], [6, 9]] },
        pelog: { family: "Japanese and Indonesian", label: "Pelog (in twelve tones)", steps: [[1, 0], [2, 1], [3, 3], [5, 7], [6, 8]] },
        wholeTone: { family: "Symmetric", label: "Whole tone", steps: [[1, 0], [2, 2], [3, 4], [4, 6], [5, 8], [7, 10]] },
        diminishedWholeHalf: { family: "Symmetric", label: "Diminished (whole-half)", steps: [[1, 0], [2, 2], [3, 3], [4, 5], [5, 6], [6, 8], [6, 9], [7, 11]] },
        diminishedHalfWhole: { family: "Symmetric", label: "Diminished (half-whole)", steps: [[1, 0], [2, 1], [2, 3], [3, 4], [4, 6], [5, 7], [6, 9], [7, 10]] },
        augmented: { family: "Symmetric", label: "Augmented", steps: [[1, 0], [2, 3], [3, 4], [5, 7], [5, 8], [7, 11]] },
        tritone: { family: "Symmetric", label: "Tritone", steps: [[1, 0], [2, 1], [3, 4], [5, 6], [5, 7], [7, 10]] },
        bebopDominant: { family: "Bebop and more", label: "Bebop dominant", steps: [[1, 0], [2, 2], [3, 4], [4, 5], [5, 7], [6, 9], [7, 10], [7, 11]] },
        bebopMajor: { family: "Bebop and more", label: "Bebop major", steps: [[1, 0], [2, 2], [3, 4], [4, 5], [5, 7], [5, 8], [6, 9], [7, 11]] },
        prometheus: { family: "Bebop and more", label: "Prometheus", steps: [[1, 0], [2, 2], [3, 4], [4, 6], [6, 9], [7, 10]] }
    });

    const FAMILIES = Object.freeze([...new Set(Object.values(SCALES).map(scale => scale.family))]);
    // Diatonic: the scale's notes (or the chord's). Chromatic: all twelve.
    const SHOWS = Object.freeze({ scale: "Diatonic", all: "Chromatic" });

    // Notes are labeled by name or by degree, and a degree is written either
    // way: ♭7 (from the major scale) or m7 (the interval from the root).
    const LABELS = Object.freeze({ names: "Names", degrees: "Degrees" });
    const DEGREE_STYLES = Object.freeze({ flat: "♭7", interval: "m7" });

    // Pitches are MIDI numbers: 60 is middle C, C4. A tuning lists its strings
    // from the lowest-placed (the sixth on a guitar) to the first.
    const INSTRUMENTS = Object.freeze({
        guitar: { label: "Guitar", frets: 15, tunings: [
            { id: "standard", label: "Standard", pitches: [40, 45, 50, 55, 59, 64] },
            { id: "dropD", label: "Drop D", pitches: [38, 45, 50, 55, 59, 64] },
            { id: "dadgad", label: "DADGAD", pitches: [38, 45, 50, 55, 57, 62] },
            { id: "openG", label: "Open G", pitches: [38, 43, 50, 55, 59, 62] },
            { id: "openD", label: "Open D", pitches: [38, 45, 50, 54, 57, 62] },
            { id: "halfDown", label: "Half step down", pitches: [39, 44, 49, 54, 58, 63], flats: true },
            { id: "wholeDown", label: "Whole step down", pitches: [38, 43, 48, 53, 57, 62] }
        ] },
        bass: { label: "Bass", frets: 15, tunings: [
            { id: "standard", label: "Standard", pitches: [28, 33, 38, 43] },
            { id: "dropD", label: "Drop D", pitches: [26, 33, 38, 43] },
            { id: "five", label: "Five-string", pitches: [23, 28, 33, 38, 43] }
        ] },
        mandolin: { label: "Mandolin", frets: 15, tunings: [
            { id: "standard", label: "Standard", pitches: [55, 62, 69, 76] }
        ] },
        ukulele: { label: "Ukulele", frets: 12, tunings: [
            { id: "standard", label: "Standard (high G)", pitches: [67, 60, 64, 69] },
            { id: "lowG", label: "Low G", pitches: [55, 60, 64, 69] },
            { id: "baritone", label: "Baritone", pitches: [50, 55, 59, 64] },
            { id: "d", label: "D tuning", pitches: [69, 62, 66, 71] }
        ] },
        keyboard: { label: "Keyboard", low: 48, high: 84, tunings: [] }
    });
    const STRINGED = Object.freeze(["guitar", "bass", "mandolin", "ukulele"]);
    const LOWEST = 16;          // E0
    const HIGHEST = 96;         // C7
    const OWN_MAX = 40;
    const CAPO_MAX = 9;
    // A position is five frets from its first; -1 is the whole neck.
    const POSITION_SPAN = 5;
    const POSITION_LAST = 11;
    const TABS = Object.freeze(["scales", "chords", "finder", "quiz", "tuning"]);
    // The positions an instrument with `frets` frets offers.
    const positionsFor = frets => Array.from({ length: Math.max(0, frets - POSITION_SPAN + 2) }, (_, from) => from).filter(from => from <= POSITION_LAST);

    const modulo = (value, base) => ((value % base) + base) % base;

    // "F♯" as { letter: 3, alter: 1 }, or null.
    function parseName(name) {
        const match = /^([A-G])(\u{1D12B}|♭|♯|\u{1D12A})?$/u.exec(String(name));
        if (!match) return null;
        const alter = { "\u{1D12B}": -2, "♭": -1, "♯": 1, "\u{1D12A}": 2 }[match[2]] || 0;
        return { letter: LETTERS.indexOf(match[1]), alter };
    }

    const pitchClass = name => {
        const parsed = parseName(name);
        return parsed ? modulo(NATURAL[parsed.letter] + parsed.alter, 12) : null;
    };

    // A note by its letter and alteration. Past a double sharp or flat (a
    // theoretical key's rare note), it's written by its plain name instead.
    const spelled = (letter, alter) => Object.hasOwn(SIGNS, alter) ? LETTERS[letter] + SIGNS[alter] : PLAIN_NAMES[modulo(NATURAL[letter] + alter, 12)];

    // The degree's note in a key, spelled from the root's letter.
    function spell(root, degree, semitones) {
        const parsed = parseName(root);
        const letter = (parsed.letter + degree - 1) % 7;
        const target = modulo(NATURAL[parsed.letter] + parsed.alter + semitones, 12);
        const alter = modulo(target - NATURAL[letter] + 6, 12) - 6;
        return spelled(letter, alter);
    }

    // A degree against the major scale: 1, ♭3, ♯4.
    function degreeLabel(degree, semitones) {
        const alter = semitones - MAJOR[degree - 1];
        return (alter < 0 ? "♭".repeat(-alter) : "♯".repeat(alter)) + degree;
    }

    // An interval's short name: R, m3, P5, d5, A4.
    function intervalLabel(degree, semitones) {
        if (degree === 1 && semitones === 0) return "R";
        const alter = semitones - MAJOR[degree - 1];
        const perfect = degree === 1 || degree === 4 || degree === 5;
        if (perfect) return (alter === 0 ? "P" : alter < 0 ? "d" : "A") + degree;
        return ({ "-2": "d", "-1": "m", 0: "M", 1: "A" })[alter] + degree;
    }

    function scaleNotes(root, scale) {
        if (pitchClass(root) === null || !Object.hasOwn(SCALES, scale)) return [];
        const base = pitchClass(root);
        return SCALES[scale].steps.map(([degree, semitones]) => ({
            name: spell(root, degree, semitones),
            pc: modulo(base + semitones, 12),
            degree: degreeLabel(degree, semitones),
            interval: intervalLabel(degree, semitones)
        }));
    }

    // The triads on each degree of a seven-note scale; other scales have none.
    // The third and fifth are counted by letter, so every triad has one; its
    // name says what they are: m, \u00B0, +, (\u266D5), sus2, sus4...
    const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"];
    const FIFTHS = { 5: "(\u{1D12B}5)", 6: "(\u266D5)", 7: "", 8: "(\u266F5)", 9: "(\u{1D12A}5)" };
    function triadName(third, fifth) {
        if (third === 4 && fifth === 7) return { suffix: "", lower: false };
        if (third === 3 && fifth === 7) return { suffix: "m", lower: true };
        if (third === 3 && fifth === 6) return { suffix: "\u00B0", lower: true, mark: "\u00B0" };
        if (third === 4 && fifth === 8) return { suffix: "+", lower: false, mark: "+" };
        const base = third === 3 ? "m" : third === 2 ? "sus2" : third === 5 ? "sus4" : "";
        return { suffix: base + (FIFTHS[fifth] ?? ""), lower: third <= 3 };
    }

    // Seventh chords (2.3.0), by their third, fifth and seventh in semitones:
    // the name's suffix and the numeral's (V7, vii\u00F87).
    const SEVENTHS = {
        "4,7,11": ["maj7", "maj7"], "4,7,10": ["7", "7"], "3,7,10": ["m7", "7"],
        "3,6,10": ["m7\u266D5", "\u00F87"], "3,6,9": ["\u00B07", "\u00B07"], "3,7,11": ["m(maj7)", "(maj7)"],
        "4,8,11": ["+maj7", "+maj7"], "4,8,10": ["+7", "+7"], "4,6,10": ["7\u266D5", "7\u266D5"], "4,6,11": ["maj7\u266D5", "maj7\u266D5"]
    };
    function seventhName(third, fifth, seventh) {
        const triad = triadName(third, fifth);
        const known = SEVENTHS[[third, fifth, seventh].join()];
        if (known) return { suffix: known[0], numeral: known[1], lower: third === 3 };
        // Anything else keeps its triad's name with its seventh written after.
        const added = seventh === 11 ? "(maj7)" : seventh === 10 ? "7" : "(\u{1D12B}7)";
        return { suffix: triad.suffix + added, numeral: (triad.mark || "") + added, lower: triad.lower };
    }

    // The chords on each degree of a seven-note scale: triads, or with
    // `size` 4, seventh chords.
    function chordsInKey(root, scale, size = 3) {
        const notes = scaleNotes(root, scale);
        if (notes.length !== 7) return [];
        const steps = SCALES[scale].steps.map(([, semitones]) => semitones);
        return notes.map((note, index) => {
            const third = modulo(steps[(index + 2) % 7] - steps[index], 12);
            const fifth = modulo(steps[(index + 4) % 7] - steps[index], 12);
            const seventh = modulo(steps[(index + 6) % 7] - steps[index], 12);
            const sevenths = size === 4;
            const named = sevenths ? seventhName(third, fifth, seventh) : triadName(third, fifth);
            const numeral = (named.lower ? NUMERALS[index].toLowerCase() : NUMERALS[index]) + (sevenths ? named.numeral : named.mark || "");
            const degrees = sevenths ? [1, 3, 5, 7] : [1, 3, 5];
            const semis = [0, third, fifth, seventh];
            return {
                numeral,
                name: note.name + named.suffix,
                tones: degrees.map((degree, at) => ({
                    name: notes[(index + degree - 1) % 7].name,
                    pc: notes[(index + degree - 1) % 7].pc,
                    degree: degreeLabel(degree, semis[at]),
                    interval: intervalLabel(degree, semis[at])
                }))
            };
        });
    }

    // A chord's name as a capo's shape: what it's fingered as with a capo at
    // `fret` (A with a capo at 2 is played as a G shape). The shape's name
    // leans flat only for the flat keys' shapes players use (B\u266D, E\u266D).
    function capoShape(name, fret) {
        const match = /^([A-G](?:\u{1D12B}|\u266D|\u266F|\u{1D12A})?)(.*)$/u.exec(String(name));
        const pc = match ? pitchClass(match[1]) : null;
        if (pc === null) return null;
        const shapes = ["C", "C\u266F", "D", "E\u266D", "E", "F", "F\u266F", "G", "A\u266D", "A", "B\u266D", "B"];
        return shapes[modulo(pc - fret, 12)] + match[2];
    }

    // ---- The finder (2.3.0): which chords and scales hold the notes picked.

    // One name for each pitch class, as most music spells it out of context.
    const PLAIN_NAMES = Object.freeze(["C", "C\u266F", "D", "E\u266D", "E", "F", "F\u266F", "G", "A\u266D", "A", "B\u266D", "B"]);

    // Chord kinds by their notes above the root, each with its degree, so a
    // chord's notes are spelled from its root: [semitones, degree], and a third
    // `true` for a note players often leave out (a seventh's fifth, an
    // eleventh's third, a thirteenth's ninth and eleventh). Simplest first.
    const O = true;
    const CHORD_KINDS = Object.freeze([
        ["", [[0, 1], [4, 3], [7, 5]]],
        ["m", [[0, 1], [3, 3], [7, 5]]],
        ["\u00B0", [[0, 1], [3, 3], [6, 5]]],
        ["+", [[0, 1], [4, 3], [8, 5]]],
        ["sus2", [[0, 1], [2, 2], [7, 5]]],
        ["sus4", [[0, 1], [5, 4], [7, 5]]],
        ["5", [[0, 1], [7, 5]]],
        ["7", [[0, 1], [4, 3], [7, 5, O], [10, 7]]],
        ["maj7", [[0, 1], [4, 3], [7, 5, O], [11, 7]]],
        ["m7", [[0, 1], [3, 3], [7, 5, O], [10, 7]]],
        ["m7\u266D5", [[0, 1], [3, 3], [6, 5], [10, 7]]],
        ["\u00B07", [[0, 1], [3, 3], [6, 5], [9, 7]]],
        ["m(maj7)", [[0, 1], [3, 3], [7, 5, O], [11, 7]]],
        ["+maj7", [[0, 1], [4, 3], [8, 5], [11, 7]]],
        ["7sus4", [[0, 1], [5, 4], [7, 5, O], [10, 7]]],
        ["6", [[0, 1], [4, 3], [7, 5, O], [9, 6]]],
        ["m6", [[0, 1], [3, 3], [7, 5, O], [9, 6]]],
        ["add9", [[0, 1], [4, 3], [7, 5], [2, 9]]],
        ["m(add9)", [[0, 1], [3, 3], [7, 5], [2, 9]]],
        ["add11", [[0, 1], [4, 3], [7, 5], [5, 11]]],
        ["m(add11)", [[0, 1], [3, 3], [7, 5], [5, 11]]],
        ["6/9", [[0, 1], [4, 3], [7, 5, O], [9, 6], [2, 9]]],
        ["m6/9", [[0, 1], [3, 3], [7, 5, O], [9, 6], [2, 9]]],
        ["9", [[0, 1], [4, 3], [7, 5, O], [10, 7], [2, 9]]],
        ["maj9", [[0, 1], [4, 3], [7, 5, O], [11, 7], [2, 9]]],
        ["m9", [[0, 1], [3, 3], [7, 5, O], [10, 7], [2, 9]]],
        ["m(maj9)", [[0, 1], [3, 3], [7, 5, O], [11, 7], [2, 9]]],
        ["9sus4", [[0, 1], [5, 4], [7, 5, O], [10, 7], [2, 9]]],
        ["11", [[0, 1], [4, 3, O], [7, 5, O], [10, 7], [2, 9, O], [5, 11]]],
        ["m11", [[0, 1], [3, 3], [7, 5, O], [10, 7], [2, 9, O], [5, 11]]],
        ["maj7\u266F11", [[0, 1], [4, 3], [7, 5, O], [11, 7], [2, 9, O], [6, 11]]],
        ["13", [[0, 1], [4, 3], [7, 5, O], [10, 7], [2, 9, O], [5, 11, O], [9, 13]]],
        ["maj13", [[0, 1], [4, 3], [7, 5, O], [11, 7], [2, 9, O], [6, 11, O], [9, 13]]],
        ["m13", [[0, 1], [3, 3], [7, 5, O], [10, 7], [2, 9, O], [5, 11, O], [9, 13]]]
    ]);

    // Altered dominants: any chord with a major third and a minor seventh over
    // its root, its other notes read as a dominant's. A note between the fourth
    // and the sixth is read by whether the fifth is there: with it, a sharp
    // eleven and a flat thirteen; without it, a flat or sharp fifth. So
    // G B F E♭ A♭ is G7(♯5,♭9), its E♭ spelled D♯, and with a D it would be
    // G7(♭9,♭13). Named by its highest natural extension (7, 9, 11, 13), the
    // rest after it. Unaltered dominants are left to the kinds above.
    function alteredDominant(root, want) {
        const has = semis => want.has(modulo(root + semis, 12));
        if (!has(0) || !has(4) || !has(10)) return null;
        const fifth = has(7);
        const reading = { 0: [1, null], 4: [3, null], 10: [7, null], 7: [5, null], 1: [9, "\u266D9"], 2: [9, ""], 3: [9, "\u266F9"], 5: [11, ""],
            6: fifth ? [11, "\u266F11"] : [5, "\u266D5"], 8: fifth ? [13, "\u266D13"] : [5, "\u266F5"], 9: [13, ""] };
        const notes = [];
        for (let semis = 0; semis < 12; semis++) {
            if (!has(semis)) continue;
            if (!reading[semis]) return null;      // a major seventh: not a dominant
            notes.push([semis, ...reading[semis]]);
        }
        const altered = notes.filter(([, , mark]) => mark).sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([, , mark]) => mark);
        if (!altered.length) return null;
        const top = has(9) ? "13" : has(5) ? "11" : has(2) ? "9" : "7";
        const name = PLAIN_NAMES[root];
        // Its notes by degree, root to thirteenth.
        const spelled = [...notes].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([semis, degree]) => [semis, spell(name, degree, semis)]);
        return {
            suffix: top + (altered.length === 1 ? altered[0] : `(${altered.join(",")})`),
            notes: spelled
        };
    }

    const pcSet = list => new Set(list.map(pc => modulo(pc, 12)));

    // Chords whose notes are those picked, whatever their order or octave:
    // every note picked is the chord's, and every note it can't do without is
    // picked. The first is the bass: chords rooted on it come first, then those
    // missing the fewest notes; a chord over another of its notes is named as
    // a slash chord (C/E).
    function findChords(picked) {
        const want = pcSet(picked);
        if (want.size < 2) return [];
        const first = modulo(picked[0], 12);
        const found = [];
        for (let root = 0; root < 12; root++) {
            const altered = alteredDominant(root, want);
            if (altered) {
                const bass = altered.notes.find(([semis]) => modulo(root + semis, 12) === first)[1];
                found.push({
                    name: PLAIN_NAMES[root] + altered.suffix + (root === first ? "" : `/${bass}`),
                    root: PLAIN_NAMES[root],
                    tones: altered.notes.map(([, tone]) => tone),
                    rank: (root === first ? 0 : 10000) + CHORD_KINDS.length
                });
            }
            CHORD_KINDS.forEach(([suffix, notes], rank) => {
                const has = notes.map(([semis]) => modulo(root + semis, 12));
                if (![...want].every(pc => has.includes(pc))) return;
                if (!notes.every(([semis, , optional]) => optional || want.has(modulo(root + semis, 12)))) return;
                const name = PLAIN_NAMES[root];
                const kept = notes.filter(([semis]) => want.has(modulo(root + semis, 12)));
                const tones = kept.map(([semis, degree]) => spell(name, degree, semis));
                const bass = tones[kept.findIndex(([semis]) => modulo(root + semis, 12) === first)];
                found.push({
                    name: name + suffix + (root === first ? "" : `/${bass}`),
                    root: name,
                    tones,
                    rank: (root === first ? 0 : 10000) + (notes.length - kept.length) * 100 + rank
                });
            });
        }
        return found.sort((a, b) => a.rank - b.rank).map(({ rank, ...chord }) => chord);
    }

    // Scales that hold every note picked, the common families first, then
    // those rooted on the first (the bass).
    function findScales(picked) {
        const want = pcSet(picked);
        if (want.size < 2) return [];
        const first = modulo(picked[0], 12);
        const found = [];
        Object.entries(SCALES).forEach(([id, scale], order) => {
            for (let root = 0; root < 12; root++) {
                const has = pcSet(scale.steps.map(([, semis]) => root + semis));
                if (![...want].every(pc => has.has(pc))) continue;
                found.push({ root: PLAIN_NAMES[root], scale: id, label: scale.label, rank: order * 24 + (root === first ? 0 : 12) + modulo(root - first, 12) });
            }
        });
        return found.sort((a, b) => a.rank - b.rank).map(({ rank, ...scale }) => scale);
    }

    // ---- Quizzes (2.3.0). `random` is Math.random unless a test gives its own.

    // A place to name: any string and fret from `from` to `to`, naturals only
    // if asked, never the place just asked. A keyboard is one "string" from its
    // lowest key. null if there's nowhere.
    function quizNote(pitches, { from = 0, to = 15, naturals = false, avoid = null } = {}, random = Math.random) {
        const spots = [];
        pitches.forEach((open, string) => {
            for (let fret = from; fret <= to; fret++) {
                const midi = open + fret;
                if (naturals && PLAIN_NAMES[modulo(midi, 12)].length > 1) continue;
                if (avoid && avoid.string === string && avoid.fret === fret && pitches.length * (to - from + 1) > 1) continue;
                spots.push({ string, fret, midi });
            }
        });
        return spots.length ? spots[Math.min(spots.length - 1, Math.floor(random() * spots.length))] : null;
    }

    const QUIZ_INTERVALS = Object.freeze([
        [1, "m2", "Minor second"], [2, "M2", "Major second"], [3, "m3", "Minor third"], [4, "M3", "Major third"],
        [5, "P4", "Perfect fourth"], [6, "TT", "Tritone"], [7, "P5", "Perfect fifth"], [8, "m6", "Minor sixth"],
        [9, "M6", "Major sixth"], [10, "m7", "Minor seventh"], [11, "M7", "Major seventh"], [12, "P8", "Octave"]
    ].map(([semis, short, name]) => Object.freeze({ semis, short, name })));

    // An interval to hear: its lower note from C3 to B3, never the same size
    // twice running.
    function quizInterval(avoid = 0, random = Math.random) {
        const pick = () => 1 + Math.min(11, Math.floor(random() * 12));
        let semis = pick();
        if (semis === avoid) semis = pick();
        if (semis === avoid) semis = (semis % 12) + 1;
        const low = 48 + Math.min(11, Math.floor(random() * 12));
        return { low, high: low + semis, semis };
    }

    const QUIZ_KINDS = Object.freeze(["note", "interval"]);
    const QUIZ_DIRECTIONS = Object.freeze(["up", "down", "together"]);

    // Every note's labels, for showing all twelve: a note of the scale keeps
    // its own; the rest are named the way the key leans, flat or sharp.
    const CHROMATIC_DEGREES = ["1", "\u266D2", "2", "\u266D3", "3", "4", "\u266D5", "5", "\u266D6", "6", "\u266D7", "7"];
    const CHROMATIC_INTERVALS = ["R", "m2", "M2", "m3", "M3", "P4", "d5", "P5", "m6", "M6", "m7", "M7"];
    function everyNote(root, scaleNoteList) {
        const base = pitchClass(root);
        if (base === null) return new Map();
        const flats = /\u266D/.test(root) || scaleNoteList.some(note => note.name.includes("\u266D"));
        const own = new Map(scaleNoteList.map(note => [note.pc, note]));
        const all = new Map();
        for (let step = 0; step < 12; step++) {
            const pc = modulo(base + step, 12);
            all.set(pc, own.get(pc) || {
                name: pitchName(pc + 60, flats).replace(/-?\d+$/, ""),
                pc,
                degree: CHROMATIC_DEGREES[step],
                interval: CHROMATIC_INTERVALS[step],
                outside: true
            });
        }
        return all;
    }

    // A pitch's name with its octave, sharps unless asked for flats: "E2", "B♭3".
    function pitchName(midi, flats = false) {
        const pc = modulo(midi, 12);
        const names = flats ? ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"]
            : ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
        return names[pc] + (Math.floor(midi / 12) - 1);
    }

    // A pitch with its octave, spelled as named: the octave follows the letter,
    // so C♭ at 59 is C♭4 and B♯ at 60 is B♯3. A name that isn't this pitch
    // gives the plain name.
    function spelledPitch(midi, name) {
        const parsed = parseName(name);
        if (!parsed || modulo(NATURAL[parsed.letter] + parsed.alter, 12) !== modulo(midi, 12)) return pitchName(midi);
        return name + (Math.floor((midi - parsed.alter) / 12) - 1);
    }

    const frequency = (midi, a4 = 440) => a4 * 2 ** ((midi - 69) / 12);

    const tuningNotes = tuning => tuning.pitches.map(midi => pitchName(midi, tuning.flats).replace(/-?\d+$/, "")).join(" ");

    // ---- A plucked string, by the Karplus-Strong method: a burst of noise
    // through a delay line that averages as it goes. The line holds a whole
    // number of samples and its averaging adds half of one, so the buffer is
    // made at that pitch and played back at the rate that brings it to the
    // exact frequency.
    function pluckPeriod(hz, rate) {
        const length = Math.max(2, Math.round(rate / hz - 0.5));
        return { length, playbackRate: hz * (length + 0.5) / rate };
    }

    function pluckSamples(hz, rate, seconds = 2.5, random = Math.random) {
        const { length } = pluckPeriod(hz, rate);
        const line = new Float32Array(length);
        let last = 0;
        for (let i = 0; i < length; i++) {
            // Noise, softened a little so the attack isn't harsh.
            last = 0.6 * (random() * 2 - 1) + 0.4 * last;
            line[i] = last;
        }
        const total = Math.round(rate * seconds);
        const out = new Float32Array(total);
        // Higher strings fade faster, as real ones do.
        const decay = Math.min(0.9995, 1 - hz / 60000);
        const fade = Math.round(rate * 0.08);
        let peak = 0;
        for (let i = 0; i < total; i++) {
            const at = i % length;
            const value = line[at];
            out[i] = value;
            line[at] = decay * 0.5 * (value + line[(at + 1) % length]);
            peak = Math.max(peak, Math.abs(value));
        }
        const scale = peak ? 0.6 / peak : 0;
        for (let i = 0; i < total; i++) out[i] *= scale * (i > total - fade ? (total - 1 - i) / fade : 1);
        return out;
    }

    // ---- Your own tunings and the page's kept settings.

    function cleanName(value) {
        if (typeof value !== "string") return "";
        const name = value.replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "").trim();
        return name.length >= 1 && name.length <= 40 ? name : "";
    }

    // ---- Chord symbols (2.3.0)

    // A chord's name set as a symbol: in letters (Cm7, Cmaj7, Cm7\u266D5) or in
    // signs (C–7, C△7, Cø7). The signs are Bravura Text's chord-symbol
    // characters, and so are the accidentals in a symbol.
    const CHORD_STYLES = Object.freeze({ letters: "Letters", signs: "Signs" });
    const SIGN = Object.freeze({ major: "\uE873", minor: "\uE874", half: "\uE871", dim: "\uE870", aug: "\uE872" });
    const minorOf = style => style === "signs" ? SIGN.minor : "m";
    const majorOf = style => style === "signs" ? SIGN.major : "maj";
    // Each kind's parts after the root: q beside it, sup raised, stack two
    // raised one over the other (a 6 over a 9).
    const SYMBOL_KINDS = Object.freeze({
        "": () => ({}),
        "m": style => ({ q: minorOf(style) }),
        "\u00B0": () => ({ sup: SIGN.dim }),
        "+": () => ({ sup: SIGN.aug }),
        "sus2": () => ({ sup: "sus2" }),
        "sus4": () => ({ sup: "sus4" }),
        "5": () => ({ sup: "5" }),
        "7": () => ({ sup: "7" }),
        "maj7": style => ({ sup: majorOf(style) + "7" }),
        "m7": style => ({ q: minorOf(style), sup: "7" }),
        "m7\u266D5": style => style === "signs" ? { sup: SIGN.half + "7" } : { q: "m", sup: "7\u266D5" },
        "\u00B07": () => ({ sup: SIGN.dim + "7" }),
        "m(maj7)": style => style === "signs" ? { q: SIGN.minor, sup: SIGN.major + "7" } : { q: "m", sup: "(maj7)" },
        "+maj7": style => ({ sup: SIGN.aug + majorOf(style) + "7" }),
        "7sus4": () => ({ sup: "7sus4" }),
        "6": () => ({ sup: "6" }),
        "m6": style => ({ q: minorOf(style), sup: "6" }),
        "add9": () => ({ sup: "add9" }),
        "m(add9)": style => style === "signs" ? { q: SIGN.minor, sup: "add9" } : { q: "m", sup: "(add9)" },
        "add11": () => ({ sup: "add11" }),
        "m(add11)": style => style === "signs" ? { q: SIGN.minor, sup: "add11" } : { q: "m", sup: "(add11)" },
        "6/9": () => ({ stack: ["6", "9"] }),
        "m6/9": style => ({ q: minorOf(style), stack: ["6", "9"] }),
        "9": () => ({ sup: "9" }),
        "maj9": style => ({ sup: majorOf(style) + "9" }),
        "m9": style => ({ q: minorOf(style), sup: "9" }),
        "m(maj9)": style => style === "signs" ? { q: SIGN.minor, sup: SIGN.major + "9" } : { q: "m", sup: "(maj9)" },
        "9sus4": () => ({ sup: "9sus4" }),
        "11": () => ({ sup: "11" }),
        "m11": style => ({ q: minorOf(style), sup: "11" }),
        "maj7\u266F11": style => ({ sup: majorOf(style) + "7\u266F11" }),
        "13": () => ({ sup: "13" }),
        "maj13": style => ({ sup: majorOf(style) + "13" }),
        "m13": style => ({ q: minorOf(style), sup: "13" })
    });

    // A chord name's parts: { letter, accidental, q, sup, stack, alterations,
    // bass }, or null when it isn't a name Maestro writes (one typed freely).
    // Alterations are listed lowest first: G7(\u266F5,\u266D9) gives ["\u266F5", "\u266D9"].
    function chordSymbolParts(name, style = "letters") {
        const match = /^([A-G])(\u266D|\u266F|\u{1D12A}|\u{1D12B})?(.*?)(?:\/([A-G](?:\u266D|\u266F|\u{1D12A}|\u{1D12B})?))?$/u.exec(String(name));
        if (!match) return null;
        const [, letter, accidental = "", suffix, bass = ""] = match;
        let kind = Object.hasOwn(SYMBOL_KINDS, suffix) ? SYMBOL_KINDS[suffix](style) : null;
        if (!kind) {
            const altered = /^(7|9|11|13)(?:([\u266D\u266F](?:5|9|11|13))|\(((?:[\u266D\u266F](?:5|9|11|13),)+[\u266D\u266F](?:5|9|11|13))\))$/.exec(suffix);
            if (altered) kind = altered[2] ? { sup: altered[1] + altered[2] } : { sup: altered[1], alterations: altered[3].split(",") };
        }
        // Any other name built of a quality and numbers (a key's rarer chords:
        // m\u266F5, sus4\u266D5, \u00B0(maj7)) is written with the rest raised.
        if (!kind) {
            const general = /^(m(?!aj)|\u00B0|\+)?((?:maj|sus|add|[0-9\u266D\u266F\u{1D12A}\u{1D12B}(),])+)$/u.exec(suffix);
            if (!general) return null;
            const [, quality = "", rest] = general;
            kind = {
                q: quality === "m" ? minorOf(style) : "",
                sup: (quality === "\u00B0" ? SIGN.dim : quality === "+" ? SIGN.aug : "") + (style === "signs" ? rest.replace("maj", SIGN.major) : rest)
            };
        }
        return { letter, accidental, q: "", sup: "", stack: null, alterations: null, ...kind, bass };
    }

    // A typed chord name, tidied: # and b written as \u266F and \u266D where they're
    // accidentals (Bb7, F#m, Cm7b5, G7(#5,b9)), spaces closed up, at most 32
    // characters, no control characters or double quotes. "" if nothing's left.
    function cleanChordName(text) {
        const tidy = String(text ?? "")
            .replace(/[\u0000-\u001F\u007F"]/g, "")
            .trim()
            .replace(/\s+/g, " ")
            .replace(/#/g, "\u266F")
            .replace(/^([A-G])b/, "$1\u266D")
            .replace(/\/([A-G])b/, "/$1\u266D")
            .replace(/b(?=\d)/g, "\u266D");
        return [...tidy].slice(0, 32).join("").trim();
    }

    // ---- The staff (2.3.0)

    // A note as written: its diatonic step (C0 is 0, each letter one more) and
    // its alteration, from its MIDI number and its spelled name.
    function staffStep(midi, name) {
        const parsed = parseName(name) ?? parseName(PLAIN_NAMES[modulo(midi, 12)]);
        const octave = Math.round((midi - parsed.alter - NATURAL[parsed.letter]) / 12) - 1;
        return { step: parsed.letter + 7 * octave, alter: parsed.alter };
    }

    // A staff's bottom line, as a step: the treble's E4, the bass's G2.
    const STAFF_BOTTOM = Object.freeze({ treble: 2 + 7 * 4, bass: 4 + 7 * 2 });

    // One chord on one staff. Positions count half spaces up from the bottom
    // line. A note a second above another sits to its right; accidentals stand
    // in columns, nearest first, none closer than a sixth to another in its
    // column; a note whose letter is also sounded altered gets a natural.
    // Returns { heads: [{ position, alter, right, column }], columns, ledgers }.
    function staffChord(notes, bottom) {
        const seen = new Set();
        const heads = notes.map(note => ({ position: note.step - bottom, alter: note.alter, right: false, column: -1 }))
            .filter(head => !seen.has(`${head.position}:${head.alter}`) && seen.add(`${head.position}:${head.alter}`))
            .sort((a, b) => a.position - b.position || a.alter - b.alter);
        heads.forEach((head, index) => {
            head.right = index > 0 && head.position - heads[index - 1].position <= 1 && !heads[index - 1].right;
        });
        const altered = new Set(heads.filter(head => head.alter).map(head => modulo(head.position, 7)));
        const marked = head => head.alter !== 0 || altered.has(modulo(head.position, 7));
        const columns = [];
        [...heads].reverse().filter(marked).forEach(head => {
            let column = columns.findIndex(taken => taken.every(position => Math.abs(position - head.position) >= 6));
            if (column < 0) column = columns.push([]) - 1;
            columns[column].push(head.position);
            head.column = column;
        });
        const ledgers = [];
        const low = heads[0]?.position ?? 0;
        const high = heads.at(-1)?.position ?? 0;
        for (let position = -2; position >= low; position -= 2) ledgers.push(position);
        for (let position = 10; position <= high; position += 2) ledgers.push(position);
        return { heads, columns: columns.length, ledgers };
    }

    // ---- Saved chords (2.3.0)

    const CHORDS_MAX = 200;
    const KEY_LOW = 21, KEY_HIGH = 108, FRET_MAX = 24;

    // A saved chord as the page keeps it, or null: { name, instrument, tuning,
    // shape }. A stringed chord's tuning is its open strings (4 to 7, MIDI 16
    // to 96) and its shape a fret (0 to 24) or null (not played) per string,
    // at least one played; a keyboard chord's shape is 1 to 10 rising keys.
    // AHK checks the same on save and load.
    function cleanSavedChord(raw) {
        if (!raw || typeof raw !== "object") return null;
        const name = cleanChordName(raw.name);
        if (!name || !Object.hasOwn(INSTRUMENTS, raw.instrument) || !Array.isArray(raw.tuning) || !Array.isArray(raw.shape)) return null;
        if (raw.instrument === "keyboard") {
            const keys = raw.shape;
            if (raw.tuning.length || keys.length < 1 || keys.length > 10) return null;
            if (!keys.every((key, index) => Number.isInteger(key) && key >= KEY_LOW && key <= KEY_HIGH && (index === 0 || key > keys[index - 1]))) return null;
            return { name, instrument: "keyboard", tuning: [], shape: [...keys] };
        }
        const { tuning, shape } = raw;
        if (tuning.length < 4 || tuning.length > 7 || shape.length !== tuning.length) return null;
        if (!tuning.every(pitch => Number.isInteger(pitch) && pitch >= 16 && pitch <= 96)) return null;
        if (!shape.every(fret => fret === null || (Number.isInteger(fret) && fret >= 0 && fret <= FRET_MAX))) return null;
        if (!shape.some(fret => fret !== null)) return null;
        return { name, instrument: raw.instrument, tuning: [...tuning], shape: [...shape] };
    }

    // The line AHK reads for one chord: name, instrument, tuning, shape.
    const savedChordLine = chord => [chord.name, chord.instrument, chord.tuning.join(" "), chord.shape.map(fret => fret === null ? "x" : fret).join(" ")].join("\t");

    // A chord's notes, low to high (each once).
    function savedChordNotes(chord) {
        const notes = chord.instrument === "keyboard" ? chord.shape : chord.shape.map((fret, string) => fret === null ? null : chord.tuning[string] + fret).filter(midi => midi !== null);
        return [...new Set(notes)].sort((a, b) => a - b);
    }

    // The first of five frets that shows a shape: its lowest fretted note's,
    // or 1, kept on the neck.
    function shapeStart(shape, frets) {
        const fretted = shape.filter(fret => fret !== null && fret > 0);
        if (!fretted.length || Math.max(...fretted) <= 5) return 1;
        return Math.max(1, Math.min(Math.min(...fretted), frets - 4));
    }

    // A tuning of your own, or null: a name, a stringed instrument and
    // between four and seven whole-number pitches from E0 to C7.
    function cleanOwnTuning(stored) {
        if (!stored || typeof stored !== "object") return null;
        const name = cleanName(stored.name);
        const id = typeof stored.id === "string" && /^own-[a-z0-9]{1,16}$/.test(stored.id) ? stored.id : "";
        const pitches = Array.isArray(stored.pitches) ? stored.pitches : [];
        if (!name || !id || !STRINGED.includes(stored.instrument)) return null;
        if (pitches.length < 4 || pitches.length > 7 || !pitches.every(midi => Number.isInteger(midi) && midi >= LOWEST && midi <= HIGHEST)) return null;
        return { id, name, instrument: stored.instrument, pitches: [...pitches], own: true };
    }

    const DEFAULTS = Object.freeze({
        instrument: "guitar", tunings: {}, own: [], root: "G", scale: "major", labels: "names", degreeStyle: "flat", show: "scale", sevenths: false, capo: 0, lefty: false, position: -1, quizKind: "note", quizNaturals: false, quizDirection: "up", chordStyle: "letters", tab: "scales", tone: "pluck", a4: 440
    });

    function tuningsFor(instrument, own) {
        return [...(INSTRUMENTS[instrument]?.tunings || []), ...own.filter(tuning => tuning.instrument === instrument)];
    }

    function parseSettings(text) {
        let stored = null;
        try { stored = JSON.parse(text); } catch { stored = null; }
        const settings = { ...DEFAULTS, tunings: {}, own: [] };
        if (!stored || typeof stored !== "object" || Array.isArray(stored)) return settings;
        if (Object.hasOwn(INSTRUMENTS, stored.instrument)) settings.instrument = stored.instrument;
        const seen = new Set();
        settings.own = (Array.isArray(stored.own) ? stored.own : []).map(cleanOwnTuning)
            .filter(tuning => tuning && !seen.has(tuning.id) && seen.add(tuning.id)).slice(0, OWN_MAX);
        const chosen = stored.tunings && typeof stored.tunings === "object" ? stored.tunings : {};
        for (const instrument of STRINGED) {
            if (tuningsFor(instrument, settings.own).some(tuning => tuning.id === chosen[instrument])) settings.tunings[instrument] = chosen[instrument];
        }
        if (ROOTS.includes(stored.root)) settings.root = stored.root;
        if (Object.hasOwn(SCALES, stored.scale)) settings.scale = stored.scale;
        if (Object.hasOwn(LABELS, stored.labels)) settings.labels = stored.labels;
        if (Object.hasOwn(DEGREE_STYLES, stored.degreeStyle)) settings.degreeStyle = stored.degreeStyle;
        // Before Degrees took both styles, Intervals was a label of its own.
        if (stored.labels === "intervals") Object.assign(settings, { labels: "degrees", degreeStyle: "interval" });
        if (Object.hasOwn(SHOWS, stored.show)) settings.show = stored.show;
        if (typeof stored.sevenths === "boolean") settings.sevenths = stored.sevenths;
        if (Number.isInteger(stored.capo) && stored.capo >= 0 && stored.capo <= CAPO_MAX) settings.capo = stored.capo;
        if (typeof stored.lefty === "boolean") settings.lefty = stored.lefty;
        if (Number.isInteger(stored.position) && stored.position >= -1 && stored.position <= POSITION_LAST) settings.position = stored.position;
        if (TABS.includes(stored.tab)) settings.tab = stored.tab;
        if (QUIZ_KINDS.includes(stored.quizKind)) settings.quizKind = stored.quizKind;
        if (typeof stored.quizNaturals === "boolean") settings.quizNaturals = stored.quizNaturals;
        if (QUIZ_DIRECTIONS.includes(stored.quizDirection)) settings.quizDirection = stored.quizDirection;
        if (Object.hasOwn(CHORD_STYLES, stored.chordStyle)) settings.chordStyle = stored.chordStyle;
        if (stored.tone === "pluck" || stored.tone === "steady") settings.tone = stored.tone;
        if (Number.isInteger(stored.a4) && stored.a4 >= 415 && stored.a4 <= 466) settings.a4 = stored.a4;
        return settings;
    }

    // The instrument's chosen tuning, or its first.
    function currentTuning(settings) {
        const list = tuningsFor(settings.instrument, settings.own);
        return list.find(tuning => tuning.id === settings.tunings[settings.instrument]) || list[0] || null;
    }

    return {
        ROOTS, SCALES, FAMILIES, SHOWS, LABELS, DEGREE_STYLES, INSTRUMENTS, STRINGED, LOWEST, HIGHEST, OWN_MAX, CAPO_MAX, POSITION_SPAN, TABS, PLAIN_NAMES, CHORD_KINDS, QUIZ_INTERVALS, QUIZ_KINDS, QUIZ_DIRECTIONS, DEFAULTS, CHORD_STYLES, STAFF_BOTTOM, CHORDS_MAX, KEY_LOW, KEY_HIGH, FRET_MAX,
        parseName, pitchClass, spell, degreeLabel, intervalLabel, scaleNotes, triadName, seventhName, chordsInKey, capoShape, findChords, alteredDominant, findScales, positionsFor, quizNote, quizInterval, everyNote, pitchName, spelledPitch, frequency, tuningNotes,
        pluckPeriod, pluckSamples, cleanName, cleanOwnTuning, tuningsFor, parseSettings, currentTuning,
        chordSymbolParts, cleanChordName, staffStep, staffChord, cleanSavedChord, savedChordLine, savedChordNotes, shapeStart
    };
})();
