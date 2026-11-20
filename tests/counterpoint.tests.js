// Counterpoint (2.5.0): cantus firmi, the species checker, four-part chords,
// figures, analysis and checker, and exercises as kept.
(() => {
    // 2.11.0: the checkers wrapped, so the last test can tell that every rule
    // in the catalogue was reported by some test here, and by no other name.
    const reported = new Set();
    const seen = list => {
        list.forEach(each => reported.add(each.rule));
        return list;
    };
    const M = globalThis.MaestroCounterpoint;
    const C = { ...M, check: e => seen(M.check(e)), checkSpecies: e => seen(M.checkSpecies(e)), checkCantus: e => seen(M.checkCantus(e)), checkFourPart: e => seen(M.checkFourPart(e)) };
    const N = globalThis.MaestroNotation;
    const { check, equal } = globalThis.TestHarness;
    const sharp = String.fromCodePoint(0x266F), flat = String.fromCodePoint(0x266D);
    const dim = String.fromCodePoint(0x00B0), halfDim = String.fromCodePoint(0x00F8);
    const P = text => N.parsePitch(text);
    // A seeded random, so generated exercises are the same on every run.
    const seeded = seed => () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const rules = (list, level = null) => list.filter(each => !level || each.level === level).map(each => each.rule);
    const has = (list, rule, bar = null) => list.some(each => each.rule === rule && (bar === null || each.bar === bar));

    // ---- Cantus firmi
    equal("cantus: Fux's six, one a mode", C.FUX.map(cantus => cantus.mode).join(), "dorian,phrygian,lydian,mixolydian,aeolian,ionian");
    for (const cantus of C.FUX) {
        const notes = C.fuxNotes(cantus);
        const key = { fifths: N.keyFifths(cantus.final, cantus.mode), mode: cantus.mode };
        check(`cantus: ${cantus.label} is read`, notes.every(Boolean));
        const problems = C.cantusProblems(notes, key);
        check(`cantus: ${cantus.label} begins and ends on its final, the second degree before`, !["opening", "close", "approach", "penult", "leading"].some(rule => problems.includes(rule)));
        check(`cantus: ${cantus.label} has no forbidden leap or repeat`, !["leap", "sixth", "augmented", "repeat"].some(rule => problems.includes(rule)));
        const own = C.cantusExercise({ mode: cantus.mode, final: cantus.final, pitches: notes });
        equal(`cantus: ${cantus.label}, written as one's own, has no errors`, rules(C.checkCantus(own), "error").join(), "");
    }
    equal("chant: four phrases, each with its page", C.CHANT.map(each => each.source.replace(/\D/g, "")).join(), "256,224,224,575");
    for (const chant of C.CHANT) {
        const notes = C.fuxNotes(chant);
        check(`chant: ${chant.label} is read`, notes.every(Boolean) && notes.length >= 10);
        const own = C.cantusExercise({ mode: chant.mode, final: chant.final, pitches: notes });
        equal(`chant: ${chant.label} keeps every rule of a cantus`, C.checkCantus(own).filter(each => each.level !== "info").map(each => each.text).join(" | "), "");
    }
    const dorian = { fifths: 0, mode: "dorian" };
    for (const seed of [1, 2, 3, 4, 5]) {
        const made = C.makeCantus({ fifths: -1, mode: "major" }, 10, seeded(seed));
        equal(`cantus: a made one keeps every rule (seed ${seed})`, C.cantusProblems(made, { fifths: -1, mode: "major" }).join(), "");
    }
    check("cantus: a repeated note is a problem", C.cantusProblems(["D4", "E4", "E4", "F4", "E4", "D4"].map(P), dorian).includes("repeat"));
    check("cantus: a leap of a seventh is a problem", C.cantusProblems(["D4", "C5", "B4", "A4", "E4", "D4"].map(P), dorian).includes("leap"));

    // ---- Cantus firmi of one's own
    const blankCantus = C.cantusExercise({ mode: "dorian", final: "D", clef: "treble", length: 8 });
    equal("own cantus: eight whole notes to write on one staff", N.voicesOf(blankCantus.score).map(voice => `${voice.clef}:${voice.notes.map(note => `${note.p ? "x" : "_"}${note.d}`).join("")}`).join(), `treble:${"_w".repeat(8)}`);
    check("own cantus: nothing given", blankCantus.given === -1 && blankCantus.kind === "cantus");
    equal("own cantus: a blank one only says what's left", rules(C.checkCantus(blankCantus)).join(), "unfinished");
    equal("own cantus: an unknown mode", C.cantusExercise({ mode: "locrian", final: "B" }), null);
    equal("own cantus: too short", C.cantusExercise({ mode: "dorian", final: "D", length: 3 }), null);
    equal("own cantus: an alto clef", C.cantusExercise({ mode: "dorian", final: "D", clef: "alto" }), null);
    check("own cantus: a mode's finals have five accidentals at most", C.cantusFinals("lydian").every(final => Math.abs(N.keyFifths(final, "lydian")) <= 5) && C.cantusFinals("dorian").includes("D") && C.cantusFinals("phrygian").includes(`C${sharp}`) && !C.cantusFinals("lydian").includes(`F${sharp}`));
    const writeCantus = (names, mode = "dorian", final = "D") => C.cantusExercise({ mode, final, pitches: names.map(P) });
    const cantusRules = (names, mode, final) => rules(C.checkCantus(writeCantus(names, mode, final)));
    const sound = ["D4", "F4", "E4", "G4", "A4", "C5", "B4", "A4", "F4", "E4", "D4"];
    equal("own cantus: a sound one breaks no rule", C.checkCantus(writeCantus(sound)).filter(each => each.level !== "info").map(each => each.text).join(" | "), "");
    check("own cantus: beginning off the final", has(C.checkCantus(writeCantus(["E4", ...sound.slice(1)])), "opening", 1));
    check("own cantus: ending off the final", cantusRules([...sound.slice(0, -1), "F4"]).includes("close"));
    check("own cantus: a leap into the final", cantusRules([...sound.slice(0, -2), "A4", "D4"]).includes("approach"));
    check("own cantus: the leading tone left low in dorian", cantusRules([...sound.slice(0, -2), "C4", "D4"]).includes("leading"));
    equal("own cantus: the leading tone raised in dorian", cantusRules([...sound.slice(0, -2), "C#4", "D4"]).filter(rule => ["leading", "approach", "penult", "mode", "inflection"].includes(rule)).join(), "");
    check("own cantus: phrygian reached from below", cantusRules(["E4", "G4", "F4", "A4", "G4", "C5", "B4", "A4", "G4", "D4", "E4"], "phrygian", "E").includes("penult"));
    check("own cantus: a repeated note", cantusRules(["D4", "F4", "F4", "G4", "A4", "G4", "F4", "E4", "D4"]).includes("repeat"));
    check("own cantus: a tritone outlined, F up to B", has(C.checkCantus(writeCantus(["D4", "A4", "G4", "F4", "G4", "A4", "B4", "A4", "G4", "F4", "E4", "D4"])), "tritone", 7));
    check("own cantus: a run from D to B outlines a sixth, not a tritone", !cantusRules(["D4", "F4", "G4", "A4", "B4", "A4", "G4", "F4", "E4", "D4"]).includes("tritone"));
    check("own cantus: the same figure twice", cantusRules(["D4", "F4", "E4", "G4", "F4", "A4", "G4", "F4", "E4", "D4"]).includes("sequence"));
    check("own cantus: a scale isn't a figure repeated", !cantusRules(["D4", "E4", "F4", "G4", "A4", "G4", "F4", "E4", "D4"]).includes("sequence"));
    check("own cantus: a high point twice", cantusRules(["D4", "A4", "G4", "A4", "F4", "E4", "D4"]).includes("climax"));
    check("own cantus: the high point first", cantusRules(["D5", "C5", "A4", "B4", "G4", "F4", "E4", "D4"], "dorian", "D").includes("climax"));
    check("own cantus: wider than a tenth", cantusRules(["D4", "E4", "F4", "A4", "C5", "E5", "G5", "F5", "E5", "D5", "C5", "A4", "F4", "E4", "D4"]).includes("range"));
    check("own cantus: an F sharp in the middle is a raised note out of place", cantusRules(["D4", "E4", "F#4", "G4", "A4", "G4", "F4", "E4", "D4"]).includes("inflection") || cantusRules(["D4", "E4", "F#4", "G4", "A4", "G4", "F4", "E4", "D4"]).includes("mode"));
    check("own cantus: every move a step is suggested a leap", cantusRules(["D4", "E4", "F4", "G4", "A4", "G4", "F4", "E4", "D4"]).includes("stepwise"));
    equal("own cantus: the degrees under the staff, the leading tone raised", C.analysisLine(writeCantus([...sound.slice(0, -2), "C#4", "D4"])).map(each => each.text).join(" "), `1 3 2 4 5 7 6 5 3 ${sharp}7 1`);
    // Suggestions as it's written.
    const partly = names => C.checkCantus(names.reduce((done, name, index) => C.setNote(done, 0, index, name ? P(name) : null), C.cantusExercise({ mode: "dorian", final: "D", length: 10 })));
    const suggestions = list => list.filter(each => each.rule === "suggest");
    check("own cantus: after a leap up, a step down is suggested at the next note", suggestions(partly(["D4", "A4"])).some(each => each.text === "After the leap up, step down." && each.at[0].index === 2));
    check("own cantus: with two notes left, the close is suggested", suggestions(partly(["D4", "F4", "E4", "G4", "A4", "C5", "B4", "A4"])).some(each => each.text === `To close: E4 then D4, or C${sharp}4 then D4.`.replace(/4/g, "") && each.at[0].index === 8));
    check("own cantus: past the middle and no higher than the start, a high point is suggested", suggestions(partly(["D4", "C4", "B3", "C4", "A3", null])).some(each => each.text === "Rise to a high point before the close."));
    // Kept, read back, and taken by a species exercise once whole.
    const keptCantus = C.readExercise(C.exerciseText(writeCantus(sound)));
    check("own cantus: kept and read back", keptCantus && keptCantus.kind === "cantus" && C.exerciseText(keptCantus) === C.exerciseText(writeCantus(sound)));
    check("own cantus: its kind line", C.exerciseText(blankCantus).split("\n")[2] === "kind\tcantus\t-\t-");
    equal("own cantus: a second voice isn't read", C.readExercise(`${C.exerciseText(blankCantus)}voice\t2\tbass\twritten\tMore\t22w`), null);
    equal("own cantus: half notes aren't read", C.readExercise(C.exerciseText(blankCantus).replace("rw rw", "rh rh")), null);
    equal("own cantus: a blank one isn't a cantus to use yet", C.cantusOf(blankCantus), null);
    const taken = C.cantusOf(writeCantus(sound));
    const againstIt = C.speciesExercise({ species: 2, cantus: taken.pitches, cantusBelow: false, mode: taken.mode, final: taken.final });
    equal("own cantus: a species exercise takes it whole", N.voicesOf(againstIt.score)[0].notes.map(note => N.pitchLetterName(note.p)).join(" "), sound.map(name => N.pitchLetterName(P(name))).join(" "));
    equal("own cantus: cleared, it's blank again", rules(C.checkCantus(C.clearWritten(writeCantus(sound)))).join(), "unfinished");

    // ---- Species exercises
    const fux = C.fuxNotes(C.FUX[0]);
    const first = C.speciesExercise({ species: 1, cantus: fux, cantusBelow: true, mode: "dorian", final: "D" });
    // Clefs (2.7.0): chosen a staff at a time, the notes as they were.
    const altoFirst = C.withClef(first, 0, "alto");
    equal("clef: the upper staff's changed, the lower's not", altoFirst.score.staves.map(staff => staff.clef).join(), "alto,bass");
    check("clef: the notes stay", JSON.stringify(altoFirst.score.staves.map(staff => staff.voices)) === JSON.stringify(first.score.staves.map(staff => staff.voices)));
    check("clef: kept and read back", C.exerciseText(C.readExercise(C.exerciseText(C.withClef(altoFirst, 1, "tenor")))) === C.exerciseText(C.withClef(altoFirst, 1, "tenor")));
    check("clef: one with an 8 under it, or a staff that isn't there, changes nothing", C.withClef(first, 0, "treble8") === first && C.withClef(first, 2, "alto") === first);
    equal("clef: one with an 8 under it isn't read", C.readExercise(C.exerciseText(first).replace("\ttreble\t", "\ttreble8\t")), null);
    equal("species: the cantus below sits around D3", N.pitchName(N.voicesOf(first.score)[1].notes[0].p), "D3");
    equal("species: the counterpoint is above, a whole note to write in each bar", N.voicesOf(first.score)[0].notes.map(note => `${note.p ? "x" : "_"}${note.d}`).join(""), "_w".repeat(11));
    equal("species: given is the cantus", first.given, 1);
    const blankProblems = C.checkSpecies(first);
    equal("species: a blank exercise only says what's left", rules(blankProblems).join(), "unfinished");
    check("species: eleven notes to write", blankProblems[0].text.startsWith("11 notes"));
    const fill = (exercise, names) => names.reduce((done, text, index) => C.setNote(done, 1 - done.given, index, text ? P(text) : null), exercise);
    const good = ["A3", "D4", "C4", "D4", "B3", "A3", "C4", "E4", "D4", "C#4", "D4"];
    const firstGood = fill(first, good);
    equal("species: a good first species has no problems", C.checkSpecies(firstGood).map(each => each.text).join(" | "), "");
    const variant = changes => fill(first, good.map((text, index) => changes[index] ?? text));
    check("species: parallel fifths", has(C.checkSpecies(variant({ 1: "C4" })), "parallel", 2));
    check("species: a seventh against the cantus", has(C.checkSpecies(variant({ 2: "D4" })), "consonant", 3));
    check("species: beginning on a tenth", has(C.checkSpecies(variant({ 0: "F4" })), "opening", 1));
    check("species: the leading tone left unraised", has(C.checkSpecies(variant({ 9: "C4" })), "leading", 10));
    check("species: hidden fifths, the upper voice leaping", has(C.checkSpecies(variant({ 3: "B3", 4: "D4" })), "hidden", 5));
    check("species: a leap of a major sixth", has(C.checkSpecies(variant({ 2: "B4" })), "sixth", 3));
    check("species: G sharp is outside D dorian here", has(C.checkSpecies(variant({ 4: "G#3" })), "mode", 5));
    check("species: ending on a third", has(C.checkSpecies(variant({ 10: "F4" })), "close", 11));
    const below = fill(C.speciesExercise({ species: 1, cantus: fux, cantusBelow: false, mode: "dorian", final: "D" }), ["G3"]);
    check("species: a fifth below the cantus is no opening", has(C.checkSpecies(below), "opening", 1));

    // Second species: a dissonance on the weak beat passes by step.
    const short = ["D4", "F4", "E4", "D4"].map(P);
    const second = C.speciesExercise({ species: 2, cantus: short, cantusBelow: true, mode: "dorian", final: "D" });
    equal("second species: a rest, then halves, then a whole note", N.voicesOf(second.score)[0].notes.map(note => note.d).join(""), "hhhhhhw");
    const passing = fill(second, [null, "D4", "A3", "B3", "C4", "C#4", "D4"]);
    check("second species: B against F passes from A to C", !has(C.checkSpecies(passing), "weakBeat", 2));
    const turning = fill(second, [null, "D4", "A3", "B3", "A3", "C#4", "D4"]);
    check("second species: but turning back to A is a fault", has(C.checkSpecies(turning), "weakBeat", 2));
    check("second species: a dissonance on the downbeat", has(C.checkSpecies(fill(second, [null, "D4", "B3", "A3", "C4", "C#4", "D4"])), "strongBeat", 2));

    // Fourth species: a 7-6 suspension, then one that rises.
    const fourth = C.speciesExercise({ species: 4, cantus: short, cantusBelow: true, mode: "dorian", final: "D" });
    const suspended = fill(fourth, [null, "A3", "A3", "D4", "D4", "C#4", "D4"]);
    equal("fourth species: notes carried over the bar line are tied", N.voicesOf(suspended.score)[0].notes.map(note => (note.tie ? "~" : "-")).join(""), "-~-~---");
    equal("fourth species: a resolved 7-6 has no errors", C.checkSpecies(suspended).filter(each => each.level === "error").map(each => each.text).join(" | "), "");
    check("fourth species: a suspension that rises", has(C.checkSpecies(fill(fourth, [null, "A3", "A3", "D4", "D4", "E4", "D4"])), "suspension", 3));
    // 2.11.0: a note not tied on breaks the syncopation; its bar is second species.
    const unsyncopated = C.checkSpecies(fill(fourth, [null, "A3", "A3", "B3", "C4", "C#4", "D4"]));
    check("fourth species: untied, a dissonance passing by step is no fault", !has(unsyncopated, "weakBeat", 2));
    const brokenLeap = C.checkSpecies(fill(fourth, [null, "A3", "A3", "B3", "G3", "C#4", "D4"])).filter(each => each.rule === "weakBeat" && each.bar === 2);
    check("fourth species: untied, one that leaps away is a fault, and no tie is named", brokenLeap.length === 1 && !brokenLeap[0].text.includes("tie") && brokenLeap[0].text.includes("pass by step"));

    // Fifth species: bar rhythms, and eighths in pairs by step.
    let fifth = C.speciesExercise({ species: 5, cantus: short, cantusBelow: true, mode: "dorian", final: "D" });
    fifth = C.setBarRhythm(fifth, 1, C.FIFTH_BARS[6]);
    equal("fifth species: a bar's rhythm changes", N.voicesOf(fifth.score)[0].notes.slice(3, 7).map(note => note.d).join(""), "qeeh");
    equal("fifth species: the last bar stays a whole note", C.setBarRhythm(fifth, 3, C.FIFTH_BARS[1]), fifth);
    check("fifth species: whole to eighth only, no dotted eighth (2.6.0)", ["s", "t", "f", "e."].every(code => C.setNoteLength(fifth, 0, code) === null) && !C.codesFor(fifth).includes("s") && C.codesFor(C.melodyExercise({ tonic: "C" })).includes("f"));
    check("fifth species: a file with a dotted eighth and a sixteenth isn't read", C.exerciseText(fifth).includes("re re") && C.readExercise(C.exerciseText(fifth)) !== null && C.readExercise(C.exerciseText(fifth).replace("re re", "re. rs")) === null);
    check("fifth species: a note's length changes in its bar, but not in the last", C.setNoteLength(fifth, 0, "w") !== null && C.setNoteLength(fifth, N.voicesOf(fifth.score)[0].notes.length - 1, "h") === null);
    check("other species: their rhythm is given", C.rhythmBars(C.speciesExercise({ species: 2, cantus: short, cantusBelow: true, mode: "dorian", final: "D" })) === 0 && C.setNoteLength(C.speciesExercise({ species: 2, cantus: short, cantusBelow: true, mode: "dorian", final: "D" }), 0, "w") === null);
    const notes5 = N.voicesOf(fifth.score)[0].notes.length;
    equal("fifth species: notes to write after the change", notes5, 11);
    const leaping = fill(fifth, [null, "D4", "C4", "D4", "A3", "C4", "D4", "C4", "B3", "C#4", "D4"]);
    check("fifth species: eighths that leap are a fault", has(C.checkSpecies(leaping), "eighths", 2));
    const stepping = fill(fifth, [null, "D4", "C4", "D4", "C4", "B3", "A3", "C4", "B3", "C#4", "D4"]);
    check("fifth species: eighths moving by step pass", !has(C.checkSpecies(stepping), "eighths"));

    // Clearing an exercise: the written voices emptied, the given one kept.
    const fresh5 = C.speciesExercise({ species: 5, cantus: short, cantusBelow: true, mode: "dorian", final: "D" });
    equal("clear: the fifth species' rhythm and notes begin again", C.exerciseText(C.clearWritten(stepping)), C.exerciseText(fresh5));
    equal("clear: the cantus is kept", N.voicesOf(C.clearWritten(stepping).score)[1].notes.map(note => N.pitchName(note.p)).join(" "), N.voicesOf(stepping.score)[1].notes.map(note => N.pitchName(note.p)).join(" "));
    equal("clear: nothing to clear is the same exercise", C.clearWritten(fresh5), fresh5);
    equal("clear: a rhythm alone changed is cleared", C.exerciseText(C.clearWritten(fifth)), C.exerciseText(fresh5));

    // ---- Four-part chords
    const cMajor = { fifths: 0, mode: "major" }, aMinor = { fifths: 0, mode: "minor" };
    const tones = (text, key) => C.chordFromNumeral(text, key).tones.map(tone => N.pitchLetterName(N.pitch(tone.letter, tone.alter))).join(" ");
    equal("chord: V65 in C", tones("V65", cMajor), "G B D F");
    equal("chord: its bass is B", N.pitchLetterName(N.pitch(C.chordFromNumeral("V65", cMajor).bass.letter, C.chordFromNumeral("V65", cMajor).bass.alter)), "B");
    equal("chord: V in A minor raises its third", tones("V", aMinor), `E G${sharp} B`);
    equal("chord: viio7 in A minor", tones("viio7", aMinor), `G${sharp} B D F`);
    equal("chord: III in A minor keeps G natural", tones("III", aMinor), "C E G");
    equal("chord: V/V in C", tones("V/V", cMajor), `D F${sharp} A`);
    equal("chord: V7/V in B flat", tones("V7/V", { fifths: -2, mode: "major" }), `C E G B${flat}`);
    equal("chord: not a numeral", C.chordFromNumeral("X7", cMajor), null);
    equal("figures: V in minor shows the raised third alone", C.figuresFor(C.chordFromNumeral("V", aMinor), aMinor).join(" "), sharp);
    equal("figures: V7 in minor", C.figuresFor(C.chordFromNumeral("V7", aMinor), aMinor).join(" "), `7 ${sharp}`);
    equal("figures: V65 in C", C.figuresFor(C.chordFromNumeral("V65", cMajor), cMajor).join(" "), "6 5");
    equal("figures: V6 in minor, its raised note in the bass", C.figuresFor(C.chordFromNumeral("V6", aMinor), aMinor).join(" "), "6");
    equal("figures: V42 in C", C.figuresFor(C.chordFromNumeral("V42", cMajor), cMajor).join(" "), "4 2");
    equal("numeral: shown with its signs", C.numeralText("viio65"), `vii${dim}65`);
    equal("numeral: half-diminished", C.numeralText("iih7"), `ii${halfDim}7`);
    equal("numeral: its parts", JSON.stringify(C.numeralParts("V43/V")), JSON.stringify({ numeral: "V", figures: ["4", "3"], target: "/V" }));
    const read = (names, key) => C.analyze(names.map(P), key)?.numeral ?? null;
    equal("analysis: C E G C is I", read(["C5", "G4", "E4", "C3"], cMajor), "I");
    equal("analysis: G over B is V6", read(["G4", "D4", "G3", "B2"], cMajor), "V6");
    equal("analysis: G7 over F is V42", read(["D5", "B4", "G4", "F3"], cMajor), "V42");
    equal("analysis: G7 without its fifth is V7", read(["F5", "B4", "G3", "G2"], cMajor), "V7");
    equal("analysis: E G sharp B in A minor is V", read(["B4", "G#4", "E4", "E3"], aMinor), "V");
    equal("analysis: D F sharp A in C is V/V", read(["A4", "F#4", "D4", "D3"], cMajor), "V/V");
    equal("analysis: not a chord", read(["C5", "D4", "E4", "F3"], cMajor), null);

    // ---- Four-part checking
    const satb = C.fourPartExercise({ form: "numerals", tonic: "C", mode: "major", progression: ["I", "IV", "V", "I"] });
    equal("four parts: a half note a chord, the last a whole note when it begins a bar", N.voicesOf(satb.score)[0].notes.map(note => note.d).join(""), "hhhh");
    equal("four parts: numerals give no voice", satb.given, -1);
    const write = (exercise, parts) => parts.reduce((done, line, voice) => line.reduce((each, text, index) => C.setNote(each, voice, index, text ? P(text) : null), done), exercise);
    const goodParts = [["C5", "C5", "G4", "G4"], ["E4", "F4", "D4", "E4"], ["G3", "A3", "B3", "C4"], ["C3", "F3", "G3", "C3"]];
    const written = write(satb, goodParts);
    equal("four parts: a good I IV V I has no problems", C.checkFourPart(written).map(each => each.text).join(" | "), "");
    equal("four parts: its analysis", C.analysisLine(written).map(each => each.text).join(" "), "I IV V I");
    const changed = changes => write(satb, goodParts.map((line, voice) => line.map((text, index) => changes[`${voice}:${index}`] ?? text)));
    check("four parts: parallel fifths, tenor and bass", C.checkFourPart(changed({ "2:1": "C4" })).some(each => each.rule === "parallel" && each.text.includes("tenor and bass")));
    check("four parts: a doubled leading tone", has(C.checkFourPart(changed({ "0:2": "B4" })), "doubled", 2));
    check("four parts: the leading tone in the soprano falls", has(C.checkFourPart(changed({ "0:2": "B4" })), "leadingTone", 2));
    check("four parts: not the chord asked for", has(C.checkFourPart(changed({ "1:1": "D4" })), "chord", 1));
    check("four parts: the alto above the soprano", has(C.checkFourPart(changed({ "1:0": "D5" })), "crossing", 1));
    check("four parts: the tenor out of its range", has(C.checkFourPart(changed({ "2:3": "C5" })), "voiceRange", 2));
    check("four parts: soprano and alto more than an octave apart", has(C.checkFourPart(changed({ "1:0": "B3" })), "spacing", 1));
    check("four parts: the wrong inversion", has(C.checkFourPart(changed({ "3:2": "B2" })), "inversion", 2));
    const sevenths = write(C.fourPartExercise({ form: "numerals", tonic: "C", mode: "major", progression: ["V7", "I"] }), [["F4", "E4"], ["D4", "C4"], ["B3", "C4"], ["G2", "C3"]]);
    equal("four parts: a seventh falling by step", rules(C.checkFourPart(sevenths), "error").join(), "");
    const unresolved = write(C.fourPartExercise({ form: "numerals", tonic: "C", mode: "major", progression: ["V7", "I"] }), [["F4", "G4"], ["D4", "E4"], ["B3", "C4"], ["G2", "C3"]]);
    check("four parts: a seventh rising", has(C.checkFourPart(unresolved), "seventh"));

    // The three forms.
    const figured = C.fourPartExercise({ form: "figured", tonic: "A", mode: "minor", progression: ["i", "iv", "V7", "i"], random: seeded(7) });
    const bass = N.voicesOf(figured.score)[3].notes;
    check("figured bass: the bass is given, the rest to write", figured.given === 3 && bass.every(note => note.p) && N.voicesOf(figured.score).slice(0, 3).every(voice => voice.notes.every(note => !note.p)));
    equal("figured bass: its notes", bass.map(note => N.pitchLetterName(note.p)).join(" "), "A D E A");
    check("figured bass: in its range", bass.every(note => N.midiOf(note.p) >= 40 && N.midiOf(note.p) <= 60));
    equal("figured bass: the figures", C.figuredBass(figured).map(list => list.join(".")).join(" | "), ` |  | 7.${sharp} | `);
    const soprano = C.fourPartExercise({ form: "soprano", tonic: "G", mode: "major", progression: ["I", "IV", "V7", "I"], random: seeded(3) });
    const line = N.voicesOf(soprano.score)[0].notes;
    check("soprano: given, each note in its chord", soprano.given === 0 && line.every((note, index) => C.chordFromNumeral(soprano.numerals[index], soprano.score.key).pcs.includes(N.midiOf(note.p) % 12)));
    equal("soprano: it ends on the tonic", N.pitchLetterName(line.at(-1).p), "G");
    check("soprano: it moves no more than a fourth at a time", line.every((note, index) => index === 0 || Math.abs(N.midiOf(note.p) - N.midiOf(line[index - 1].p)) <= 5));
    check("soprano: its chords are the student's, so none is asked for", !has(C.checkFourPart(soprano), "chord") || C.checkFourPart(soprano).every(each => each.rule !== "inversion"));
    equal("four parts: an unknown form", C.fourPartExercise({ form: "chorale" }), null);
    const given = C.setNote(figured, 3, 0, P("C3"));
    equal("four parts: the given voice can't be changed", given, figured);
    const upper = C.setNote(C.setNote(figured, 0, 0, P("E5")), 2, 1, P("A3"));
    equal("clear: four parts' written voices empty, the figured bass kept", C.exerciseText(C.clearWritten(upper)), C.exerciseText(figured));

    // ---- Exercises as kept
    const roundTrip = exercise => C.readExercise(C.exerciseText(exercise));
    for (const [label, exercise] of [["species", suspended], ["figured bass", figured], ["soprano", soprano], ["numerals", written], ["blank", first]]) {
        const back = roundTrip(exercise);
        check(`kept: ${label} reads back`, back !== null);
        equal(`kept: ${label} reads back the same`, back && C.exerciseText(back), C.exerciseText(exercise));
    }
    const text = C.exerciseText(suspended);
    equal("kept: begins with its header", text.split("\n")[0], C.HEADER);
    check("kept: a note's form", text.includes("31~") || /\b\d+h~/.test(text));
    const broken = (from, to) => C.readExercise(text.replace(from, to));
    equal("kept: another header is refused", broken(C.HEADER, "Maestro exercise 2"), null);
    equal("kept: a note that isn't one is refused", broken(/\t(r[whqe]) /, "\tzz "), null);
    equal("kept: a sixth species is refused", broken("kind\tspecies\t4", "kind\tspecies\t6"), null);
    equal("kept: two given voices are refused", broken("written", "given"), null);
    equal("kept: a numeral that isn't one is refused", C.readExercise(C.exerciseText(written).replace("numerals\tI IV V I", "numerals\tI IV X I")), null);
    // Two chords last a bar, the voices two: since 2.11.0 three chords would fit (the last a whole note split in two).
    equal("kept: numerals and chords must agree", C.readExercise(C.exerciseText(written).replace("numerals\tI IV V I", "numerals\tI IV")), null);
    equal("kept: nothing at all", C.readExercise(""), null);
    const titled = C.readExercise(text.replace(/^(.*)\n(.*)\n/, `$1\nA ${String.fromCharCode(1)}title\n`));
    equal("kept: a title's control characters become spaces", titled?.title, "A title");

    // ---- Model answers (2.6.0): every voice to write, written so the checker finds no error.
    const errorsIn = exercise => C.check(exercise).filter(each => each.level === "error").map(each => each.rule);
    const unwrittenIn = exercise => C.check(exercise).some(each => each.rule === "unfinished");
    let speciesModels = 0, speciesTried = 0;
    for (const cantus of [...C.FUX, ...C.CHANT]) for (let species = 1; species <= 5; species++) for (const below of [true, false]) {
        const exercise = C.speciesExercise({ species, cantus: C.fuxNotes(cantus), cantusBelow: below, mode: cantus.mode, final: cantus.final });
        const model = C.modelAnswer(exercise, { random: seeded(species * 7 + (below ? 1 : 2)) });
        speciesTried += 1;
        if (model && !errorsIn(model).length && !unwrittenIn(model)) speciesModels += 1;
        else check(`model: ${cantus.label}, species ${species}, cantus ${below ? "below" : "above"}`, false);
    }
    equal("model: every Fux and chant cantus, all five species, above and below, answered without an error", speciesModels, speciesTried);
    const modelLine = C.modelAnswer(suspended, { random: seeded(4) });
    check("model: the given cantus is kept", modelLine && JSON.stringify(N.voicesOf(modelLine.score)[suspended.given]) === JSON.stringify(N.voicesOf(suspended.score)[suspended.given]));
    let partsModels = 0, partsTried = 0;
    for (const mode of ["major", "minor"]) for (const progression of C.PROGRESSIONS[mode]) for (const form of C.FORMS) {
        const exercise = C.fourPartExercise({ form, tonic: C.FOURPART_KEYS[mode][partsTried % C.FOURPART_KEYS[mode].length], mode, progression, random: seeded(partsTried + 1) });
        const model = C.modelAnswer(exercise, { random: seeded(partsTried + 3) });
        partsTried += 1;
        if (model && !errorsIn(model).length && !unwrittenIn(model)) partsModels += 1;
        else check(`model: ${mode} ${progression.join(" ")} (${form})`, false);
    }
    equal("model: every progression in four parts, in each form, answered without an error", partsModels, partsTried);
    const givenBass = C.modelAnswer(figured, { random: seeded(2) });
    check("model: a figured bass is kept", givenBass && JSON.stringify(N.voicesOf(givenBass.score)[3]) === JSON.stringify(N.voicesOf(figured.score)[3]));
    equal("model: a cantus firmus of one's own has none", C.modelAnswer(C.cantusExercise({ mode: "dorian", final: "D" })), null);
    const deceptive = C.fourPartExercise({ form: "numerals", tonic: "C", mode: "major", progression: ["I", "V6", "vi", "IV", "V7", "I"], random: seeded(1) });
    const fromV6 = C.setNote(C.setNote(C.setNote(C.setNote(deceptive, 3, 1, P("B2")), 3, 2, P("A2")), 0, 1, P("D5")), 0, 2, P("C5"));
    check("four parts: the leading tone in the bass may fall from V6 to vi (2.6.0)", !has(C.checkFourPart(fromV6), "leadingTone", 2));
    const intoTonic = C.fourPartExercise({ form: "numerals", tonic: "C", mode: "major", progression: ["I", "V6", "I"], random: seeded(1) });
    check("four parts: but rises from V6 into I", has(C.checkFourPart(C.setNote(C.setNote(intoTonic, 3, 1, P("B2")), 3, 2, P("A2"))), "leadingTone", 2) || has(C.checkFourPart(C.setNote(C.setNote(intoTonic, 3, 1, P("B2")), 3, 2, P("G2"))), "leadingTone", 2));

    // 2.8.0: the rules as switches; since 2.11.0 one rule at a time, the fundamentals locked.
    {
        const all = C.RULES.map(rule => rule.id);
        check("rules: each rule has one id", all.filter((rule, at) => all.indexOf(rule) !== at));
        check("rules: each rule is in a group, each group has a rule", C.RULES.filter(rule => !C.RULE_GROUPS.some(group => group.id === rule.group)).map(rule => rule.id)
            .concat(C.RULE_GROUPS.filter(group => !C.RULES.some(rule => rule.group === group.id)).map(group => group.id)));
        check("rules: each judges some kind, each section is known", C.RULES.filter(rule => !rule.kinds.length || rule.kinds.some(kind => !kind)).map(rule => rule.id)
            .concat(C.RULE_GROUPS.filter(group => !C.RULE_SECTIONS[group.section]).map(group => group.id)));
        equal("rules: what's off is cleaned, in order", C.cleanRulesOff(["range", "nope", "overlap", "range"]).join(), "overlap,range");
        equal("rules: off isn't a list", C.cleanRulesOff("overlap").length, 0);
        equal("rules: a locked rule can't be switched off", C.cleanRulesOff(["parallel", "hidden", "crossing", "weakBeat", "doubled", "leadingTone", "seventh", "nonchord", "suspend", "leap"]).join(), "leap");
        equal("rules: the locked ones", C.RULES.filter(rule => rule.locked).map(rule => rule.id).join(),
            "parallel,downbeats,hidden,crossing,consonant,strongBeat,weakBeat,preparation,suspension,doubled,leadingTone,seventh,nonchord,suspend");
        const sample = [{ rule: "parallel" }, { rule: "overlap" }, { rule: "unfinished" }, { rule: "range" }];
        equal("rules: one rule off silences it alone", C.withRules(sample, ["overlap"]).map(each => each.rule).join(), "parallel,unfinished,range");
        equal("rules: a locked rule still reports, even when the list names it", C.withRules(sample, ["parallel", "range"]).map(each => each.rule).join(), "parallel,overlap,unfinished");
        equal("rules: Essentials keeps parallels and crossing voices, drops range, keeps what's still to write", C.withRules(sample, C.RULE_PRESETS.essentials).map(each => each.rule).join(), "parallel,overlap,unfinished");
        check("rules: Essentials names no locked rule", C.RULE_PRESETS.essentials.filter(id => C.ruleById(id).locked));
        check("rules: Strict is every rule on", C.RULE_PRESETS.strict.length === 0 ? [] : ["not empty"]);
        check("rules: what always shows is no rule of the catalogue", C.RULES_ALWAYS.filter(rule => all.includes(rule)));
        equal("rules: groups switched off before 2.11.0 become their rules", C.rulesOfGroups(["leap", "parallel", "nope"]).join(), "leap,sixth,augmented");
        equal("rules: stored groups that aren't a list", C.rulesOfGroups("leap").length, 0);
    }

    // ---- 2.11.0: non-chord tones in four parts.
    {
        const dash = String.fromCodePoint(0x2013);
        equal("chords: four, a half note each", C.chordSpans(4).map(span => `${span.onset}+${span.length}`).join(), "0+4,4+4,8+4,12+4");
        equal("chords: three, the last a whole note", C.chordSpans(3).map(span => `${span.onset}+${span.length}`).join(), "0+4,4+4,8+8");
        check("chords: each rhythm on offer fills its chord", C.CHORD_RHYTHMS.h.every(list => list.reduce((sum, code) => sum + N.DURATIONS[code[0]] * (code.endsWith(".") ? 1.5 : 1), 0) === 4)
            && C.CHORD_RHYTHMS.w.every(list => list.reduce((sum, code) => sum + N.DURATIONS[code[0]] * (code.endsWith(".") ? 1.5 : 1), 0) === 8));
        // Voices written as text, read back as a kept exercise: "C5q", "C5h~" (tied), "D5q.".
        const token = text => {
            const [, pitch, length, dot, tie] = /^([A-G]#?\d)([whqe])(\.?)(~?)$/.exec(text);
            const p = P(pitch);
            return `${p.step}${p.alter ? `+${p.alter}` : ""}${length}${dot}${tie}`;
        };
        const voiced = (exercise, lines, { form = null } = {}) => {
            let text = C.exerciseText(exercise).split("\n").map(row => {
                const fields = row.split("\t");
                const voice = ["Soprano", "Alto", "Tenor", "Bass"].indexOf(fields[4]);
                if (fields[0] !== "voice" || !lines[voice]) return row;
                return [...fields.slice(0, 3), form === "soprano" && voice === 0 ? "given" : fields[3], fields[4], lines[voice].split(" ").map(token).join(" ")].join("\t");
            }).join("\n");
            if (form) text = text.replace("kind\tfourpart\tnumerals", `kind\tfourpart\t${form}`);
            return C.readExercise(text);
        };
        const block = ["C5h C5h G4h G4h", "E4h F4h D4h E4h", "G3h A3h B3h C4h", "C3h F3h G3h C3h"];
        const parts = changes => voiced(satb, block.map((line, voice) => changes[voice] ?? line));
        const tones = exercise => C.nonChordTones(exercise).map(each => `${each.voice}:${each.index}:${each.kind}:${each.label}`).join(" ");
        const errors = exercise => C.checkFourPart(exercise).filter(each => each.level === "error").map(each => each.text).join(" | ");

        const passing = parts({ 0: "C5h C5q B4e A4e G4h G4h" });
        check("non-chord: a voice in quarters and eighths is read", passing !== null);
        equal("non-chord: a passing tone, no problem", errors(passing), "");
        equal("non-chord: the passing tone named", tones(passing), "0:2:passing:P");
        const neighbor = parts({ 0: "C5h C5h G4q A4q G4h" });
        equal("non-chord: a neighbor tone", `${errors(neighbor)}${tones(neighbor)}`, "0:3:neighbor:N");
        const suspensionParts = { 0: "C5h C5h~ C5q B4q C5h", 2: "G3h A3h D4h C4h" };
        const suspension = parts(suspensionParts);
        equal("non-chord: a 4-3 suspension, prepared and resolved", `${errors(suspension)}${tones(suspension)}`, `0:2:suspension:4${dash}3`);
        equal("non-chord: the analysis reads a suspension at its resolution", C.analysisLine(suspension).map(each => each.text).join(" "), "I IV V I");
        const struckAgain = parts({ ...suspensionParts, 0: "C5h C5h C5q B4q C5h" });
        equal("non-chord: a suspension struck again", tones(struckAgain), `0:2:suspension:4${dash}3`);
        const sopranoForm = voiced(satb, block.map((line, voice) => suspensionParts[voice] ?? line), { form: "soprano" });
        check("non-chord: in the soprano form the chords are analyzed through the suspension", sopranoForm && C.analysisLine(sopranoForm).map(each => each.text).join(" ") === "I IV V I" && !has(C.checkFourPart(sopranoForm), "chord"));
        check("non-chord: a suspension that doesn't resolve (held on into the tonic it would be a pedal point)", has(C.checkFourPart(parts({ ...suspensionParts, 0: "C5h C5h~ C5h G4h" })), "suspend", 2));
        check("non-chord: a suspension not prepared", has(C.checkFourPart(parts({ 0: "C5q D5q~ D5q C5q G4h G4h" })), "suspend", 1));
        check("non-chord: the note it resolves to doubled meanwhile", has(C.checkFourPart(parts({ 0: "C5h C5h~ C5q B4q C5h" })), "doubledres", 2));
        const appoggiatura = parts({ ...suspensionParts, 0: "C5h C5q A4q C5q B4q C5h" });
        equal("non-chord: an appoggiatura, leapt to and left by step", `${errors(appoggiatura)}${tones(appoggiatura)}`, "0:3:appoggiatura:App");
        const escape = parts({ 0: "C5h C5h G4q A4q E4h" });
        equal("non-chord: an escape tone, stepped to and left by leap (Kostka and Payne's names and labels)", `${errors(escape)}${tones(escape)}`, "0:3:escape:ET");
        const anticipation = parts({ 2: "G3h A3h B3q C4q C4h" });
        equal("non-chord: an anticipation", `${errors(anticipation)}${tones(anticipation)}`, "2:3:anticipation:A");
        const group = parts({ 0: "C5h C5h G4q A4e F4e G4h" });
        equal("non-chord: a neighbor group, both neighbors and back", `${errors(group)}${tones(group)}`, "0:3:neighborGroup:NG 0:4:neighborGroup:NG");
        const pedal = parts({ 0: "C5h A4h G4h E4h", 1: "E4h F4h B3h C4h", 2: "G3h~ G3h~ G3h G3h" });
        equal("non-chord: a pedal point, the IV over it complete without it", `${errors(pedal)}${tones(pedal)}`, "2:1:pedal:Ped");
        const struckPedal = parts({ 0: "C5h A4h G4h E4h", 1: "E4h F4h B3h C4h", 2: "G3h G3q G3q G3h G3h" });
        equal("non-chord: a pedal struck again, each stroke the pedal", `${errors(struckPedal)}${tones(struckPedal)}`, "2:1:pedal:Ped 2:2:pedal:Ped");
        check("non-chord: a held note that never becomes a chord tone again isn't a pedal", has(C.checkFourPart(parts({ 0: "C5h A4h G4h E4h", 1: "E4h F4h B3h C4h", 2: "G3h~ G3h A3h G3h" })), "suspend", 1));
        const ornamented = parts({ ...suspensionParts, 0: "C5h C5h~ C5q A4e B4e C5h" });
        equal("non-chord: a suspension's decorated resolution", `${errors(ornamented)}${tones(ornamented)}`, `0:2:suspension:4${dash}3 0:3:appoggiatura:App`);
        check("non-chord: a note that's none of them", has(C.checkFourPart(parts({ 1: "E4q A4q F4h D4h E4h" })), "nonchord", 1));
        const bassRun = parts({ 3: "C3q D3e E3e F3h G3h C3h" });
        equal("non-chord: a passing tone in the bass, then a note of the chord", tones(bassRun), "3:1:passing:P");
        check("non-chord: parallels a passing tone makes are found", C.checkFourPart(bassRun).some(each => each.rule === "parallel" && each.text.includes("alto and bass")));
        equal("non-chord: a note across a chord's start isn't read", parts({ 0: "C5h C5q C5h C5q G4h" }), null);
        check("non-chord: a sixteenth isn't read", C.exerciseText(passing).includes(" 34e 33e ") && C.readExercise(C.exerciseText(passing).replace(" 34e 33e ", " 34s 34s 33e ")) === null);
        equal("non-chord: kept and read back the same", C.exerciseText(C.readExercise(C.exerciseText(suspension))), C.exerciseText(suspension));
        equal("non-chord: none in a species exercise", C.nonChordTones(suspended).length, 0);
        equal("non-chord: the rules group, its fundamentals locked", C.withRules([{ rule: "nonchord" }, { rule: "suspend" }, { rule: "doubledres" }], ["nonchord", "suspend", "doubledres"]).map(each => each.rule).join(), "nonchord,suspend");
        check("non-chord: on in Essentials", !C.RULE_PRESETS.essentials.includes("doubledres"));

        // Writing the rhythm, voice by voice.
        const whole = voiced(satb, block);
        check("rhythm: four parts' is written", C.rhythmEditable(whole) && C.rhythmVoice(whole, 2) === 2 && C.rhythmVoice(figured, 3) === 0);
        const shorter = C.setNoteLength(whole, 1, "q", 0);
        equal("rhythm: a note made shorter leaves the rest of its chord to write", N.voicesOf(shorter.score)[0].notes.map(note => `${note.d}${note.p ? "" : "?"}`).join(" "), "h q q? h h");
        // A note held through the next chord: tied notes, a chord each, drawn as one within a bar.
        const lengths = (exercise, voice) => N.voicesOf(exercise.score)[voice].notes.map(note => `${N.pitchName(note.p)}${note.d}${note.dot ? "." : ""}${note.tie ? "~" : ""}`).join(" ");
        const drawnLengths = (exercise, voice) => { const shown = C.drawnFourPart(exercise); return `${lengths(shown, voice)} ${JSON.stringify(shown.indices[voice])}`; };
        const held = C.setNoteLength(whole, 0, "w", 0);
        equal("rhythm: a whole note at a bar's start, held through the next chord as tied halves", lengths(held, 0), "C5h~ C5h G4h G4h");
        equal("rhythm: and drawn as one whole note, standing for both", drawnLengths(held, 0), "C5w G4h G4h [[0,1],[2],[3]]");
        equal("rhythm: chosen again, nothing changes", C.setNoteLength(held, 0, "w", 0), held);
        const dottedHeld = C.setNoteLength(whole, 0, "h.", 0);
        equal("rhythm: a dotted half held into a quarter, the rest of the chord keeping its pitch", lengths(dottedHeld, 0), "C5h~ C5q C5q G4h G4h");
        equal("rhythm: drawn as a dotted half", drawnLengths(dottedHeld, 0), "C5h. C5q G4h G4h [[0,1],[2],[3],[4]]");
        equal("rhythm: from the third beat, held over the bar line as tied halves, drawn tied", lengths(C.setNoteLength(whole, 1, "w", 0), 0), "C5h C5h~ C5h G4h");
        equal("rhythm: not past the last chord", C.setNoteLength(whole, 3, "w", 0), null);
        check("rhythm: a tied note in the next chord that's a non-chord tone keeps its own head", ((retarded) => retarded !== null && tones(retarded).includes("2:1:retardation") && JSON.stringify(C.drawnFourPart(retarded).indices[2][0]) === "[0]")(parts({ 2: "G3h~ G3q A3q B3h C4h" })));
        equal("rhythm: drawn as written but for four parts", C.drawnFourPart(C.melodyExercise({ tonic: "C" })), null);
        const split = C.setChordRhythm(whole, 2, 1, ["q", "e", "e"]);
        equal("rhythm: a chord's rhythm chosen, the first note's pitch kept", C.chordRhythmOf(split, 2, 1).join(" ") + " " + N.pitchName(N.voicesOf(split.score)[2].notes[1].p), `q e e ${N.pitchName(P("A3"))}`);
        equal("rhythm: not for the given voice", C.setChordRhythm(figured, 3, 0, ["q", "q"]), figured);
        const tied = C.toggleTie(whole, 1, 0);
        check("rhythm: a tie across a chord's start, the next note taking its pitch", N.voicesOf(tied.score)[0].notes[1].tie && N.midiOf(N.voicesOf(tied.score)[0].notes[2].p) === N.midiOf(P("C5")));
        equal("clear: four parts back to a half note a chord", C.exerciseText(C.clearWritten(suspension)), C.exerciseText(satb));

        // Generated: embellished answers, and given lines with non-chord tones.
        let embellished = 0, decorated = 0, tried = 0, givenTones = 0, givenTried = 0, givenAnswered = 0;
        for (const mode of ["major", "minor"]) for (const progression of C.PROGRESSIONS[mode]) for (const form of C.FORMS) {
            const tonic = C.FOURPART_KEYS[mode][tried % C.FOURPART_KEYS[mode].length];
            const exercise = C.fourPartExercise({ form, tonic, mode, progression, random: seeded(tried + 11) });
            const model = C.modelAnswer(exercise, { random: seeded(tried + 5), embellish: true });
            tried += 1;
            if (model && !errorsIn(model).length && !unwrittenIn(model)) embellished += 1;
            else check(`embellished model: ${mode} ${progression.join(" ")} (${form})`, false);
            if (model && C.nonChordTones(model).length) decorated += 1;
            if (form === "numerals") continue;
            const given = C.fourPartExercise({ form, tonic, mode, progression, random: seeded(tried + 23), embellished: true });
            givenTried += 1;
            // Its chords may be the student's (the soprano form), so count the notes: more than the chords.
            if (given && N.voicesOf(given.score)[given.given].notes.length > given.numerals.length) givenTones += 1;
            const answer = given && C.modelAnswer(given, { random: seeded(tried + 7) });
            if (answer && !errorsIn(answer).length && !unwrittenIn(answer)) givenAnswered += 1;
            else check(`given line with non-chord tones answered: ${mode} ${progression.join(" ")} (${form})`, false);
        }
        equal("embellished model: every progression in each form, answered without an error", embellished, tried);
        check(`embellished model: nearly all have non-chord tones (${decorated} of ${tried})`, decorated >= tried * 0.9);
        check(`given line: nearly all have non-chord tones (${givenTones} of ${givenTried})`, givenTones >= givenTried * 0.9);
        equal("given line with non-chord tones: every one answered without an error", givenAnswered, givenTried);
    }

    // ---- 2.11.0: each rule named, the styles, and the rules they differ in.
    {
        const R = exercise => C.withStyle(exercise, "renaissance");
        const levelOf = (list, rule, bar) => list.find(each => each.rule === rule && each.bar === bar)?.level ?? null;
        // Styles: each kind's own first, kept with the exercise.
        equal("styles: species, Fux strict first", C.STYLES.species.map(style => style.id).join(), "fux,renaissance");
        equal("styles: four parts, common practice first", C.STYLES.fourpart.map(style => style.id).join(), "common,bach");
        equal("styles: an exercise without one is in its kind's first", `${C.styleOf(first)} ${C.styleOf(satb)} ${C.styleOf(C.cantusExercise({ mode: "dorian", final: "D" }))}`, "fux common null");
        check("styles: another kind's style, or none known, changes nothing", C.withStyle(first, "bach") === first && C.withStyle(first, "fux") === first && C.withStyle(C.cantusExercise({ mode: "dorian", final: "D" }), "fux").style === undefined);
        equal("styles: a new exercise takes the style asked for", C.styleOf(C.speciesExercise({ species: 2, cantus: short, cantusBelow: true, mode: "dorian", final: "D", style: "renaissance" })), "renaissance");
        const keptStyle = C.exerciseText(R(first));
        equal("styles: kept on the line after the key", keptStyle.split("\n")[4], "style\trenaissance");
        equal("styles: and read back", C.styleOf(C.readExercise(keptStyle)), "renaissance");
        check("styles: the first style isn't written, so 2.10.0 still opens it", !C.exerciseText(first).includes("style") && !C.exerciseText(C.withStyle(R(first), "fux")).includes("style"));
        equal("styles: four parts keep Bach's", C.styleOf(C.readExercise(C.exerciseText(C.withStyle(written, "bach")))), "bach");
        equal("styles: another kind's style isn't read", C.readExercise(keptStyle.replace("style\trenaissance", "style\tbach")), null);
        equal("styles: the first style written out isn't read", C.readExercise(keptStyle.replace("style\trenaissance", "style\tfux")), null);
        equal("styles: an unknown one isn't read", C.readExercise(keptStyle.replace("style\trenaissance", "style\tbaroque")), null);
        check("styles: which rules each judges", C.rulesFor(first).some(rule => rule.id === "ninthEighth") && !C.rulesFor(first).some(rule => rule.id === "run")
            && C.rulesFor(R(first)).some(rule => rule.id === "run") && !C.rulesFor(R(first)).some(rule => rule.id === "ninthEighth")
            && !C.rulesFor(written).some(rule => rule.id === "bassSpacing") && C.rulesFor(C.withStyle(written, "bach")).some(rule => rule.id === "bassSpacing")
            && C.rulesFor(C.cantusExercise({ mode: "dorian", final: "D" })).some(rule => rule.id === "climax"));

        // Hidden fifths and octaves in two voices: Fux minds any similar motion into them.
        const byStep = variant({ 3: "F4", 4: "G4" });
        check("hidden, Fux: similar motion into an octave, the upper voice by step", has(C.checkSpecies(byStep), "hidden", 5));
        check("hidden, Renaissance: by step, no fault", !has(C.checkSpecies(R(byStep)), "hidden", 5));
        check("hidden, Renaissance: the upper voice leaping still is", has(C.checkSpecies(R(variant({ 3: "B3", 4: "D4" }))), "hidden", 5));
        // Fifths on successive downbeats in third species.
        const third = C.speciesExercise({ species: 3, cantus: short, cantusBelow: true, mode: "dorian", final: "D" });
        const downbeatFifths = fill(third, ["A3", "B3", "C4", "D4", "C4", "D4", "E4", "C4", "B3", "C4", "D4", "C#4", "D4"]);
        equal("downbeats, Fux: fifths on successive downbeats in third species are an error", levelOf(C.checkSpecies(downbeatFifths), "downbeats", 2), "error");
        equal("downbeats, Renaissance: a warning", levelOf(C.checkSpecies(R(downbeatFifths)), "downbeats", 2), "warning");
        // 9-8 above the cantus.
        const ninth = fill(fourth, [null, "A3", "A3", "F4", "F4", "E4", "D4"]);
        equal("9-8, Fux: a weaker suspension, a warning", levelOf(C.checkSpecies(ninth), "ninthEighth", 3), "warning");
        check("9-8, Renaissance: no fault", !has(C.checkSpecies(R(ninth)), "ninthEighth"));
        check("9-8: a 7-6 isn't one", !has(C.checkSpecies(suspended), "ninthEighth"));
        // The line's guidelines: Renaissance only.
        const thirds = variant({ 5: "A3", 6: "C4", 7: "B3", 8: "A3" });
        check("runs: four thirds in a row, Renaissance", has(C.checkSpecies(R(thirds)), "run"));
        check("runs: not in Fux strict", !has(C.checkSpecies(thirds), "run"));
        const twice = variant({ 2: "E4" });
        check("high point: twice, Renaissance", has(C.checkSpecies(R(twice)), "climax"));
        check("high point: not in Fux strict", !has(C.checkSpecies(twice), "climax"));
        // The double neighbor, in either style.
        const doubleNeighbor = fill(third, ["D4", "E4", "C4", "D4", "F4", "E4", "D4", "C4"]);
        check("double neighbor: D E C D, then on up", !has(C.checkSpecies(doubleNeighbor), "weakBeat", 1) && !has(C.checkSpecies(R(doubleNeighbor)), "weakBeat", 1));
        check("double neighbor: before the next downbeat is written", !has(C.checkSpecies(fill(third, ["D4", "E4", "C4", "D4"])), "weakBeat", 1));
        check("double neighbor: D C E D", !has(C.checkSpecies(fill(third, ["D4", "C4", "E4", "D4", "C4"])), "weakBeat", 1));
        check("double neighbor: turning back into the downbeat is a fault", has(C.checkSpecies(fill(third, ["D4", "E4", "C4", "D4", "C4"])), "weakBeat", 1));
        check("double neighbor: the last note not the first is a fault", has(C.checkSpecies(fill(third, ["D4", "E4", "C4", "B3"])), "weakBeat", 1));
        // Leaps by the rule they break.
        check("leaps: an augmented one", has(C.checkSpecies(variant({ 1: "G#4" })), "augmented", 2) || has(C.checkSpecies(variant({ 1: "G#4" })), "mode", 2));
        check("leaps: a seventh", has(C.checkSpecies(variant({ 1: "G4", 2: "F4" })), "leap", 2) || has(C.checkSpecies(variant({ 1: "G4" })), "leap", 2));

        // Four parts: the styles, and the rules new in 2.11.0.
        const wide = changed({ "2:0": "C4", "3:0": "C2" });
        check("tenor and bass apart, common practice: no limit", !has(C.checkFourPart(wide), "bassSpacing"));
        check("tenor and bass apart, Bach's chorales: within a twelfth", has(C.checkFourPart(C.withStyle(wide, "bach")), "bassSpacing", 1));
        const progression = (numerals, lines) => write(C.fourPartExercise({ form: "numerals", tonic: "C", mode: "major", progression: numerals }), lines);
        const close = progression(["V", "I"], [["G4", "C5"], ["D4", "E4"], ["B3", "C4"], ["G3", "C3"]]);
        check("contrary octaves at the close, common practice: a warning", has(C.checkFourPart(close), "contrary", 1));
        check("contrary octaves at the close, Bach's chorales: none", !has(C.checkFourPart(C.withStyle(close, "bach")), "contrary"));
        const unequal = progression(["viio", "I"], [["D5", "C5"], ["F4", "G4"], ["D4", "E4"], ["B2", "C3"]]);
        equal("unequal fifths: a diminished fifth to a perfect one, with the bass", levelOf(C.checkFourPart(unequal), "unequal", 1), "warning");
        check("unequal fifths: a perfect fifth to a diminished one is fine", !has(C.checkFourPart(progression(["I", "viio6"], [["G4", "F4"], ["E4", "D4"], ["C4", "B3"], ["C3", "D3"]])), "unequal"));
        const hiddenAgainst = progression(["IV", "I"], [["A4", "C5"], ["F4", "E4"], ["C4", "G3"], ["F2", "C3"]]);
        equal("hidden, four parts: an inner voice moving against them makes it a warning", levelOf(C.checkFourPart(hiddenAgainst), "hidden", 1), "warning");
        const hiddenAlone = progression(["IV", "I"], [["A4", "C5"], ["F4", "G4"], ["C4", "E4"], ["F2", "C3"]]);
        equal("hidden, four parts: with none, an error", levelOf(C.checkFourPart(hiddenAlone), "hidden", 1), "error");
        const rising = progression(["V43", "I6"], [["F4", "G4"], ["B3", "C4"], ["G3", "G3"], ["D3", "E3"]]);
        check("V4/3 to I6: the seventh may rise in tenths with the bass", !has(C.checkFourPart(rising), "seventh") && !has(C.checkFourPart(C.withStyle(rising, "bach")), "seventh"));
        check("V4/3: rising into I in root position is still a fault", has(C.checkFourPart(progression(["V43", "I"], [["F4", "G4"], ["B3", "C4"], ["G3", "E3"], ["D3", "C3"]])), "seventh"));
        // Rules no other test reports.
        check("fourth species: a dissonance tied over is no preparation", has(C.checkSpecies(fill(fourth, [null, "A3", "A3", "E4", "E4", "C#4", "D4"])), "preparation", 2));
        check("own cantus: a raised note in the middle", cantusRules(["D4", "E4", "C#4", "D4", "F4", "E4", "D4"]).includes("inflection"));
        check("own cantus: a range of a third", cantusRules(["D4", "E4", "F4", "E4", "D4", "E4", "F4", "E4", "D4"]).includes("narrow"));
        const sopranoGiven = C.readExercise(C.exerciseText(written).replace("kind\tfourpart\tnumerals", "kind\tfourpart\tsoprano").replace(/(voice\t1\ttreble\t)written(\tSoprano)/, "$1given$2"));
        check("four parts: a chord of one's own with no third", sopranoGiven !== null && has(C.checkFourPart(C.setNote(sopranoGiven, 1, 0, P("G4"))), "third", 1));
    }

    // Last: every rule in the catalogue was reported by some test above, and
    // nothing was reported under a name the catalogue doesn't know.
    {
        const ids = C.RULES.map(rule => rule.id);
        equal("rules: every rule in the catalogue is reported by a test", ids.filter(id => !reported.has(id)).join(), "");
        equal("rules: nothing reported outside the catalogue", [...reported].filter(id => !ids.includes(id) && !C.RULES_ALWAYS.includes(id)).join(), "");
    }
})();
