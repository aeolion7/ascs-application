// Counterpoint (2.5.0): cantus firmi, the species checker, four-part chords,
// figures, analysis and checker, and exercises as kept.
(() => {
    const C = globalThis.MaestroCounterpoint;
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
        check(`cantus: ${cantus.label} begins and ends on its final, the second degree before`, !["opening", "close", "cadence", "leading"].some(rule => problems.includes(rule)));
        check(`cantus: ${cantus.label} has no forbidden leap or repeat`, !problems.includes("leap") && !problems.includes("repeat"));
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
    check("own cantus: a leap into the final", cantusRules([...sound.slice(0, -2), "A4", "D4"]).includes("cadence"));
    check("own cantus: the leading tone left low in dorian", cantusRules([...sound.slice(0, -2), "C4", "D4"]).includes("leading"));
    equal("own cantus: the leading tone raised in dorian", cantusRules([...sound.slice(0, -2), "C#4", "D4"]).filter(rule => ["leading", "cadence", "mode", "inflection"].includes(rule)).join(), "");
    check("own cantus: phrygian reached from below", cantusRules(["E4", "G4", "F4", "A4", "G4", "C5", "B4", "A4", "G4", "D4", "E4"], "phrygian", "E").includes("cadence"));
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
    check("species: a seventh against the cantus", has(C.checkSpecies(variant({ 2: "D4" })), "dissonance", 3));
    check("species: beginning on a tenth", has(C.checkSpecies(variant({ 0: "F4" })), "opening", 1));
    check("species: the leading tone left unraised", has(C.checkSpecies(variant({ 9: "C4" })), "leading", 10));
    check("species: hidden fifths, the upper voice leaping", has(C.checkSpecies(variant({ 3: "B3", 4: "D4" })), "hidden", 5));
    check("species: a leap of a major sixth", has(C.checkSpecies(variant({ 2: "B4" })), "leap", 3));
    check("species: G sharp is outside D dorian here", has(C.checkSpecies(variant({ 4: "G#3" })), "mode", 5));
    check("species: ending on a third", has(C.checkSpecies(variant({ 10: "F4" })), "close", 11));
    const below = fill(C.speciesExercise({ species: 1, cantus: fux, cantusBelow: false, mode: "dorian", final: "D" }), ["G3"]);
    check("species: a fifth below the cantus is no opening", has(C.checkSpecies(below), "opening", 1));

    // Second species: a dissonance on the weak beat passes by step.
    const short = ["D4", "F4", "E4", "D4"].map(P);
    const second = C.speciesExercise({ species: 2, cantus: short, cantusBelow: true, mode: "dorian", final: "D" });
    equal("second species: a rest, then halves, then a whole note", N.voicesOf(second.score)[0].notes.map(note => note.d).join(""), "hhhhhhw");
    const passing = fill(second, [null, "D4", "A3", "B3", "C4", "C#4", "D4"]);
    check("second species: B against F passes from A to C", !has(C.checkSpecies(passing), "dissonance", 2));
    const turning = fill(second, [null, "D4", "A3", "B3", "A3", "C#4", "D4"]);
    check("second species: but turning back to A is a fault", has(C.checkSpecies(turning), "dissonance", 2));
    check("second species: a dissonance on the downbeat", has(C.checkSpecies(fill(second, [null, "D4", "B3", "A3", "C4", "C#4", "D4"])), "dissonance", 2));

    // Fourth species: a 7-6 suspension, then one that rises.
    const fourth = C.speciesExercise({ species: 4, cantus: short, cantusBelow: true, mode: "dorian", final: "D" });
    const suspended = fill(fourth, [null, "A3", "A3", "D4", "D4", "C#4", "D4"]);
    equal("fourth species: notes carried over the bar line are tied", N.voicesOf(suspended.score)[0].notes.map(note => (note.tie ? "~" : "-")).join(""), "-~-~---");
    equal("fourth species: a resolved 7-6 has no errors", C.checkSpecies(suspended).filter(each => each.level === "error").map(each => each.text).join(" | "), "");
    check("fourth species: a suspension that rises", has(C.checkSpecies(fill(fourth, [null, "A3", "A3", "D4", "D4", "E4", "D4"])), "suspension", 3));

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
    check("four parts: the leading tone in the soprano falls", has(C.checkFourPart(changed({ "0:2": "B4" })), "leading", 2));
    check("four parts: not the chord asked for", has(C.checkFourPart(changed({ "1:1": "D4" })), "chord", 1));
    check("four parts: the alto above the soprano", has(C.checkFourPart(changed({ "1:0": "D5" })), "crossing", 1));
    check("four parts: the tenor out of its range", has(C.checkFourPart(changed({ "2:3": "C5" })), "range", 2));
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
    equal("kept: numerals and chords must agree", C.readExercise(C.exerciseText(written).replace("numerals\tI IV V I", "numerals\tI IV V")), null);
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
    check("four parts: the leading tone in the bass may fall from V6 to vi (2.6.0)", !has(C.checkFourPart(fromV6), "leading", 2));
    const intoTonic = C.fourPartExercise({ form: "numerals", tonic: "C", mode: "major", progression: ["I", "V6", "I"], random: seeded(1) });
    check("four parts: but rises from V6 into I", has(C.checkFourPart(C.setNote(C.setNote(intoTonic, 3, 1, P("B2")), 3, 2, P("A2"))), "leading", 2) || has(C.checkFourPart(C.setNote(C.setNote(intoTonic, 3, 1, P("B2")), 3, 2, P("G2"))), "leading", 2));
})();
