// Melody (2.6.0): instruments and their written parts, motifs developed, a
// melody harmonized, and melodies as Counterpoint exercises.
(() => {
    const L = globalThis.MaestroMelody;
    const C = globalThis.MaestroCounterpoint;
    const N = globalThis.MaestroNotation;
    const { check, equal } = globalThis.TestHarness;
    const flat = String.fromCodePoint(0x266D), sharp = String.fromCodePoint(0x266F);
    const P = text => N.parsePitch(text);
    const q = text => ({ p: text === "r" ? null : P(text), d: "q", dot: false, tie: false });
    const names = notes => notes.map(note => (note.p ? N.pitchName(note.p) : "r") + note.d + (note.dot ? "." : "") + (note.tie ? "~" : "")).join(" ");

    // ---- Instruments
    check("instruments: each has an id the saved file allows, and a label", L.INSTRUMENTS.every(each => /^[a-z]{2,16}$/.test(each.id) && each.label) && new Set(L.INSTRUMENTS.map(each => each.id)).size === L.INSTRUMENTS.length);
    equal("instruments: an unknown one is concert pitch", L.instrumentOf("kazoo").id, "concert");
    check("instruments: which transpose", L.transposes("clarinet") && L.transposes("guitar") && !L.transposes("flute"));
    equal("written: a clarinet's C sounds a B flat", N.pitchName(L.writtenPitch(P(`B${flat}3`), L.instrumentOf("clarinet"))), "C4");
    equal("written: an alto sax's E flat is a C", N.pitchName(L.writtenPitch(P(`E${flat}4`), L.instrumentOf("altosax"))), "C5");
    equal("written: a horn's F is a C", N.pitchName(L.writtenPitch(P("F3"), L.instrumentOf("horn"))), "C4");
    equal("written: a guitar's part an octave up", N.pitchName(L.writtenPitch(P("E2"), L.instrumentOf("guitar"))), "E3");
    const melody = C.melodyExercise({ tonic: "F", mode: "major", instrument: "trumpet", notes: ["F4", "A4", "C5", "F4"].map(q), title: "Call" });
    const written = L.writtenScore(melody.score, "trumpet");
    equal("written score: F major for a B flat trumpet is G major", `${written.key.fifths} ${names(N.voicesOf(written)[0].notes)}`, "1 G4q B4q D5q G4q");
    equal("written score: concert pitch is the score itself", L.writtenScore(melody.score, "concert"), melody.score);
    const fiveSharps = C.melodyExercise({ tonic: "B", mode: "major", instrument: "altosax", notes: [q("B4")] });
    equal("written score: past seven sharps, spelled in flats", L.writtenScore(fiveSharps.score, "altosax").key.fifths, -4);
    equal("range: a trumpet's notes out of it", L.outOfRange(["C3", "C4", "G6"].map(q), "trumpet").join(), "0,2");
    equal("range: none for concert pitch", L.outOfRange(["C0", "C8"].map(q), "concert").length, 0);

    // ---- Notes and events
    const tied = [{ p: P("C4"), d: "h", dot: false, tie: true }, { p: P("C4"), d: "q", dot: false, tie: false }, q("r")];
    equal("events: tied notes are one", JSON.stringify(L.eventsOf(tied).map(event => [event.p && N.pitchName(event.p), event.length])), JSON.stringify([["C4", 6], [null, 2]]));
    equal("notes: a long note crossing a bar is cut and tied", names(L.notesOf([{ p: P("D4"), length: 12 }, { p: null, length: 4 }])), "D4w~ D4h rh");
    equal("notes: values the staff has, a dotted half and an eighth tied", names(L.notesOf([{ p: P("E4"), length: 7 }, { p: P("F4"), length: 1 }])), "E4h.~ E4e F4e");

    // ---- Motifs
    const motif = ["C4", "D4", "E4", "C4"].map(q);
    const blank = () => Array.from({ length: 4 }, () => q("r"));
    const line = [...motif, ...blank(), ...blank(), ...blank()];
    const developed = how => L.developMotif(line, { from: 0, size: 1, how, fifths: 0 });
    equal("motif: repeated in the next bar", names(developed("repeat").notes.slice(4, 8)), "C4q D4q E4q C4q");
    equal("motif: a sequence up a step", names(developed("up").notes.slice(4, 8)), "D4q E4q F4q D4q");
    equal("motif: a sequence down a step", names(developed("down").notes.slice(4, 8)), "B3q C4q D4q B3q");
    equal("motif: inverted on its first note", names(developed("invert").notes.slice(4, 8)), "C4q B3q A3q C4q");
    equal("motif: backward", names(developed("retrograde").notes.slice(4, 8)), "C4q E4q D4q C4q");
    equal("motif: augmented over two bars", names(developed("augment").notes.slice(4, 8)), "C4h D4h E4h C4h");
    equal("motif: diminished, the rest of the bar a rest", names(developed("diminish").notes.slice(4, 9)), "C4e D4e E4e C4e rh");
    equal("motif: written after the bars already written", developed("up").from, 1);
    const twice = L.developMotif(developed("repeat").notes, { from: 0, size: 1, how: "up", fifths: 0 });
    equal("motif: the next development goes after the last", `${twice.from} ${names(twice.notes.slice(8, 12))}`, "2 D4q E4q F4q D4q");
    equal("motif: eighths halved to sixteenths (2.6.0)", names(L.developMotif([...["C4", "D4"].map(text => ({ ...q(text), d: "e" })), ...blank()], { from: 0, size: 1, how: "diminish", fifths: 0 }).notes.slice(5, 7)), "C4s D4s");
    equal("motif: sixty-fourths can't be halved", L.developMotif([...["C4", "D4"].map(text => ({ ...q(text), d: "f" })), { p: null, d: "t", dot: false, tie: false }, { p: null, d: "s", dot: false, tie: false }, { p: null, d: "e", dot: false, tie: false }, { p: null, d: "q", dot: false, tie: false }, { p: null, d: "h", dot: false, tie: false }, ...blank()], { from: 0, size: 1, how: "diminish", fifths: 0 }), null);
    equal("motif: nothing to develop in an empty bar", L.developMotif(blank(), { from: 0, size: 1, how: "repeat", fifths: 0 }), null);
    equal("motif: in a key, moved by its own steps", names(L.develop(L.eventsOf(["E4", "F4"].map(q)), "up", -1).map(event => ({ p: event.p, d: "q", dot: false, tie: false }))), `F4q G4q`);
    equal("motif: a raised note stays raised", N.pitchName(L.moveInKey(P(`C${sharp}4`), 1, 0)), `D${sharp}4`);
    const grows = L.developMotif([...motif], { from: 0, size: 1, how: "augment", fifths: 0 });
    equal("motif: the melody grows to hold it", grows.notes.length, 8);
    equal("motif: up to the most bars", L.developMotif([...motif], { from: 0, size: 1, how: "augment", fifths: 0, most: 2 }), null);

    // ---- Harmonizing
    const tune = ["C4", "E4", "G4", "E4", "F4", "A4", "C5", "A4", "G4", "B4", "D5", "B4", "C5", "G4", "E4", "C4"].map(q);
    const chords = L.harmonize(tune, { fifths: 0, mode: "major" });
    equal("harmonize: a chord a bar, each holding the bar's notes", chords.map(chord => chord.name).join(" "), "C F G C");
    equal("harmonize: with numerals and where each begins", chords.map(chord => `${chord.numeral}@${chord.at}`).join(" "), "I@0 IV@8 V@16 I@24");
    equal("harmonize: two a bar", L.harmonize(tune, { fifths: 0, mode: "major" }, { per: 2 }).length, 8);
    const minor = L.harmonize(["A4", "C5", "E5", "C5", "G#4", "B4", "E5", "B4", "A4", "E4", "C4", "A3"].map(text => q(text.replace("#", sharp))), { fifths: 0, mode: "minor" });
    equal("harmonize: in minor, the dominant major", minor.map(chord => chord.name).join(" "), "Am E Am");
    equal("harmonize: rests keep the chord before", L.harmonize([...["C4", "E4", "G4", "C5"].map(q), ...blank()], { fifths: 0, mode: "major" }).map(chord => chord.name).join(" "), "C C");
    equal("harmonize: nothing for nothing", L.harmonize([], { fifths: 0, mode: "major" }).length, 0);

    // ---- Melodies as exercises
    const fresh = C.melodyExercise({ tonic: "D", mode: "dorian", instrument: "flute", bars: 4 });
    check("melody: four bars of quarters to write, for the flute", fresh.kind === "melody" && fresh.instrument === "flute" && N.voicesOf(fresh.score)[0].notes.length === 16 && fresh.given === -1);
    equal("melody: an unknown instrument or a key it can't be in", `${C.melodyExercise({ instrument: "kazoo" })} ${C.melodyExercise({ mode: "chromatic" })}`, "null null");
    equal("melody: more than 32 bars is refused", C.melodyExercise({ bars: 33 }), null);
    equal("melody: the empty one says so", C.check(fresh).map(each => each.rule).join(), "empty");
    const wide = C.withMelodyNotes(fresh, ["D4", "F5", "C4", `G${sharp}4`, "A3"].map(q));
    const rules = C.check(wide).map(each => `${each.rule}${each.bar}`);
    check("melody: out of the flute's range, a leap past the octave, an augmented one, and the close", ["range2", "leap1", "awkward1", "close2"].every(rule => rules.includes(rule)) && C.check(wide).every(each => each.level !== "error"));
    equal("melody: ending on the tonic, in range, nothing to say", C.check(C.withMelodyNotes(fresh, ["D5", "E5", "F5", "D5"].map(q))).length, 0);
    const kept = C.readExercise(C.exerciseText(C.withMelodyNotes(fresh, ["D5", "E5", "F5", "D5"].map(q))));
    check("melody: kept and read back, its instrument too", kept?.kind === "melody" && kept.instrument === "flute" && C.exerciseText(kept).includes("kind\tmelody\tflute\t-"));
    equal("melody: an instrument not offered is refused", C.readExercise(C.exerciseText(fresh).replace("melody\tflute", "melody\tkazoo")), null);
    const rhythm = C.setBarRhythm(C.withMelodyNotes(fresh, ["D5", "E5", "F5", "D5"].map(q)), 0, ["h", "h"]);
    equal("melody: a bar's rhythm changed, each pitch kept where its note began", names(N.voicesOf(rhythm.score)[0].notes.slice(0, 2)), "D5h F5h");

    // Rhythm bar by bar and note by note (2.6.0).
    const two = C.withMelodyNotes(fresh, ["D5", "E5", "F5", "G5", "A5", "G5", "F5", "E5"].map(q));
    const lineOf = exercise => names(N.voicesOf(exercise.score)[0].notes);
    equal("rhythm: halves back to quarters, the new notes empty", lineOf(C.setBarRhythm(C.setBarRhythm(two, 0, ["h", "h"]), 0, ["q", "q", "q", "q"])).split(" ").slice(0, 4).join(" "), "D5q rq F5q rq");
    equal("rhythm: a note named a rest stays one", lineOf(C.setBarRhythm(two, 0, ["q", "q", "h"], { rests: [1] })).split(" ").slice(0, 3).join(" "), "D5q rq F5h");
    equal("rhythm: a pattern that doesn't fill the bar changes nothing", C.setBarRhythm(two, 0, ["h"]), two);
    equal("rhythm: a bar's rhythm, to copy", C.barRhythm(two, 1).join(" "), "q q q q");
    equal("rhythm: pasted into a bar", lineOf(C.pasteRhythms(two, 1, 1, [["h", "q", "q"]])), "D5q E5q F5q G5q A5h F5q E5q");
    equal("rhythm: pasted over a range, repeating", lineOf(C.pasteRhythms(two, 0, 1, [["h", "h"]])), "D5h F5h A5h F5h");
    equal("rhythm: pasted past the end, left out", C.pasteRhythms(two, 1, 1, [["w"], ["w"]]).score.staves[0].voices[0].notes.length, 5);
    equal("rhythm: a bar cleared, its rhythm kept", lineOf(C.clearBars(two, 1)), "D5q E5q F5q G5q rq rq rq rq");
    equal("length: longer takes the next note's time", lineOf(C.setNoteLength(two, 0, "h")).split(" ").slice(0, 3).join(" "), "D5h F5q G5q");
    equal("length: dotted, past two notes", lineOf(C.setNoteLength(two, 0, "h.")).split(" ").slice(0, 2).join(" "), "D5h. G5q");
    equal("length: a note cut short keeps its pitch for what's left", lineOf(C.setNoteLength(two, 0, "q.")).split(" ").slice(0, 4).join(" "), "D5q. E5e F5q G5q");
    equal("length: shorter leaves time to write", lineOf(C.setNoteLength(two, 0, "e")).split(" ").slice(0, 5).join(" "), "D5e re E5q F5q G5q");
    equal("length: a syncopated half", lineOf(C.setNoteLength(two, 1, "h")).split(" ").slice(0, 3).join(" "), "D5q E5h G5q");
    check("length: what doesn't fit the bar, or has no length here, is refused", C.setNoteLength(two, 3, "h") === null && C.setNoteLength(two, 0, "f.") === null && C.setNoteLength(two, 3, "w") === null);
    // Sixteenths, thirty-seconds and sixty-fourths (2.6.0).
    equal("length: a sixteenth leaves the rest of the beat to write", lineOf(C.setNoteLength(two, 0, "s")).split(" ").slice(0, 4).join(" "), "D5s rs re E5q");
    equal("length: a dotted eighth, then a sixteenth to write", lineOf(C.setNoteLength(two, 0, "e.")).split(" ").slice(0, 3).join(" "), "D5e. rs E5q");
    equal("length: a sixty-fourth, the gap the fewest lengths on their grid", lineOf(C.setNoteLength(two, 0, "f")).split(" ").slice(0, 5).join(" "), "D5f rf rt rs re");
    const thirty = C.setNoteLength(two, 0, "t");
    check("length: a sixteenth can't start on a thirty-second", C.setNoteLength(thirty, 1, "s") === null && C.setNoteLength(thirty, 1, "t") !== null);
    equal("length: a dotted thirty-second", lineOf(C.setNoteLength(two, 0, "t.")).split(" ").slice(0, 3).join(" "), "D5t. rf rs");
    const shortKept = C.readExercise(C.exerciseText(C.setNoteLength(C.setNoteLength(two, 0, "e."), 2, "f")));
    check("length: kept and read back", shortKept !== null && lineOf(shortKept).startsWith("D5e. rs E5f rf rt rs re"));
    const heldOver = C.toggleTie(two, 0);
    equal("tie: the next note takes the pitch", lineOf(heldOver).split(" ").slice(0, 2).join(" "), "D5q~ D5q");
    equal("tie: untied", lineOf(C.toggleTie(heldOver, 0)).split(" ").slice(0, 2).join(" "), "D5q D5q");
    equal("tie: let go when the next note changes", lineOf(C.setNote(heldOver, 0, 1, P("E5"))).split(" ").slice(0, 2).join(" "), "D5q E5q");
    equal("taps: to the nearest eighth, each to the next", JSON.stringify(C.rhythmFromTaps([0.1, 1.9, 3, 4.2])), JSON.stringify([{ pattern: ["q", "e", "e", "h"], rests: [] }]));
    equal("taps: a rest before the first, a note cut at the bar line", JSON.stringify(C.rhythmFromTaps([2.2, 5.9, 10], 2)), JSON.stringify([{ pattern: ["q", "h", "q"], rests: [0] }, { pattern: ["q", "h."], rests: [0] }]));
    equal("taps: none, nothing", C.rhythmFromTaps([], 1), null);
    equal("fill: a span as the fewest lengths that start where they may", C.fillCodes(1, 7).join(" "), "e h.");
    equal("melody: its last bar's rhythm too", N.voicesOf(C.setBarRhythm(fresh, 3, ["w"]).score)[0].notes.length, 13);
    equal("melody: no model answer", C.modelAnswer(fresh), null);
    equal("melody: its degrees beneath", C.analysisLine(C.withMelodyNotes(fresh, ["D5", "E5", "F5", "D5"].map(q))).map(each => each.text).join(" "), "1 2 3 1");
})();
