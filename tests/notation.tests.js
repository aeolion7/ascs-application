// Notation (2.5.0): pitches, keys, intervals, time, kept scores, accidentals,
// engraving and MusicXML.
(() => {
    const N = globalThis.MaestroNotation;
    const { check, equal } = globalThis.TestHarness;
    const sharp = String.fromCodePoint(0x266F), flat = String.fromCodePoint(0x266D);
    const P = text => N.parsePitch(text);
    const name = p => (p ? N.pitchName(p) : null);

    // ---- Pitches
    equal("pitch: C4 is MIDI 60", N.midiOf(P("C4")), 60);
    equal("pitch: A4 is MIDI 69", N.midiOf(P("A4")), 69);
    equal("pitch: Bb3 is MIDI 58", N.midiOf(P("Bb3")), 58);
    equal("pitch: Cx5 is MIDI 74", N.midiOf(P("Cx5")), 74);
    equal("pitch: Ebb2 is MIDI 38", N.midiOf(P("Ebb2")), 38);
    equal("pitch: B#3 sounds as C4", N.midiOf(P("B#3")), 60);
    equal("pitch: Cb4 sounds as B3", N.midiOf(P("Cb4")), 59);
    equal("pitch: F#4 is written F sharp 4", name(P("F#4")), `F${sharp}4`);
    equal("pitch: the sign itself is read", name(P(`B${flat}2`)), `B${flat}2`);
    equal("pitch: C4 is step 28", P("C4").step, 28);
    for (const text of ["H4", "C9", "", "C", "Cb#4", "A-1", "c##"]) equal(`pitch: "${text}" isn't one`, P(text), null);
    equal("pitch: below the piano isn't one", P("G0"), null);

    // ---- Keys
    const fifths = [["C", "major", 0], ["G", "major", 1], ["F", "major", -1], [`B${flat}`, "major", -2], ["Bb", "major", -2], [`F${sharp}`, "major", 6], [`C${flat}`, "major", -7],
        ["C#", "major", 7], ["A", "minor", 0], ["E", "minor", 1], ["C", "minor", -3], [`A${sharp}`, "minor", 7], [`A${flat}`, "minor", -7]];
    for (const [root, mode, want] of fifths) equal(`key: ${root} ${mode} has ${want}`, N.keyFifths(root, mode), want);
    equal("key: G sharp major is too many sharps", N.keyFifths("G#", "major"), null);
    equal("key: a mode that isn't one", N.keyFifths("C", "locrian"), null);
    equal("key: D dorian has no signature (2.5.0)", N.keyFifths("D", "dorian"), 0);
    equal("key: nor E phrygian, F lydian, G mixolydian or A aeolian", [N.keyFifths("E", "phrygian"), N.keyFifths("F", "lydian"), N.keyFifths("G", "mixolydian"), N.keyFifths("A", "aeolian")].join(), "0,0,0,0");
    equal("key: G dorian has a flat", N.keyFifths("G", "dorian"), -1);
    equal("key: no signature in dorian is D", N.keyTonic(0, "dorian"), "D");
    equal("spelling: the raised seventh in D dorian", name(N.pitchFromMidi(61, 0, "dorian")), `C${sharp}4`);
    equal("spelling: the raised sixth in A aeolian", name(N.pitchFromMidi(66, 0, "aeolian")), `F${sharp}4`);
    equal("key: three flats in minor is C", N.keyTonic(-3, "minor"), "C");
    equal("key: six sharps in major is F sharp", N.keyTonic(6, "major"), `F${sharp}`);
    equal("key: two sharps sharpen F and C", [0, 1, 2, 3, 4, 5, 6].map(letter => N.keyAlter(letter, 2)).join(), "1,0,0,1,0,0,0");
    equal("key: three flats flatten B, E and A", [0, 1, 2, 3, 4, 5, 6].map(letter => N.keyAlter(letter, -3)).join(), "0,0,-1,0,0,-1,-1");
    equal("signature: the treble's sharps, F on the top line", N.signature(7, "treble").map(mark => mark.position).join(), "8,5,9,6,3,7,4");
    equal("signature: the bass's a third lower", N.signature(2, "bass").map(mark => mark.position).join(), "6,3");
    equal("signature: the treble's flats from B", N.signature(-3, "treble").map(mark => mark.position).join(), "4,7,3");

    // Spelling a MIDI note for a key.
    const spellings = [[61, 0, "major", `C${sharp}4`], [61, -1, "major", `D${flat}4`], [68, 0, "minor", `G${sharp}4`], [66, -2, "minor", `F${sharp}4`],
        [71, -3, "minor", "B4"], [70, -3, "major", `B${flat}4`], [60, 7, "major", `B${sharp}3`], [64, -7, "major", `F${flat}4`], [62, 0, "major", "D4"]];
    for (const [midi, key, mode, want] of spellings) equal(`spelling: ${midi} with ${key} fifths, ${mode}`, name(N.pitchFromMidi(midi, key, mode)), want);

    // ---- Intervals
    const intervals = [["C4", "G4", "P5"], ["C4", "Eb4", "m3"], ["F4", "B4", "A4"], ["B3", "F4", "d5"], ["C4", "C5", "P8"], ["C4", "E5", "M10"],
        ["E4", "C4", "M3"], ["B#3", "C4", "d2"], ["C4", "C4", "P1"], ["C4", "C#4", "A1"], ["D4", "C5", "m7"], ["C4", "D5", "M9"], ["Bb3", "C#4", "A2"]];
    for (const [a, b, want] of intervals) equal(`interval: ${a} to ${b}`, N.interval(P(a), P(b)).name, want);
    equal("interval: a tenth's simple name is a third", N.interval(P("C4"), P("E5")).simpleName, "M3");
    equal("interval: its semitones", N.interval(P("C4"), P("E5")).semis, 16);

    // ---- Time
    const meter = { beats: 4, unit: 4 };
    const n = (p, d, extra = {}) => ({ p: p ? P(p) : null, d, dot: false, tie: false, ...extra });
    equal("time: a bar of 4/4 is eight eighths", N.barLength(meter), 8);
    equal("time: a bar of 2/2 too", N.barLength({ beats: 2, unit: 2 }), 8);
    equal("time: 6/8 is six", N.barLength({ beats: 6, unit: 8 }), 6);
    equal("time: a dotted half is six eighths", N.lengthOf(n("C4", "h", { dot: true })), 6);
    const filled = N.bars([n("C4", "w"), n("D4", "h"), n("E4", "q"), n("F4", "q"), n("G4", "h", { dot: true }), n(null, "q")], meter);
    equal("bars: whole bars", filled.bars.map(bar => bar.length).join(), "1,3,2");
    equal("bars: nothing runs over", filled.problems.length, 0);
    const over = N.bars([n("C4", "h"), n("D4", "q"), n("E4", "h")], meter);
    equal("bars: a half from beat 4 runs over the bar line", over.problems.map(problem => problem.index).join(), "2");

    // ---- Kept scores
    const raw = {
        title: ` Exercise${String.fromCharCode(7)} 1 `, key: { fifths: -3, mode: "minor" }, meter: { beats: 4, unit: 4 },
        staves: [{ clef: "treble", voices: [{ name: "Counterpoint", notes: [n("G4", "h"), n("Ab4", "h"), n(null, "q", { tie: true }), n("B4", "q"), n("C5", "h")] }] },
            { clef: "bass", voices: [{ name: "Cantus firmus", notes: [n("C3", "w"), n("F3", "w")] }] }]
    };
    const score = N.cleanScore(raw);
    check("score: a kept score is read", score !== null);
    equal("score: its title is tidied", score?.title, "Exercise 1");
    equal("score: a tie on a rest is dropped", score?.staves[0].voices[0].notes[2].tie, false);
    equal("score: frozen", Object.isFrozen(score?.staves[0].voices[0].notes[0]), true);
    const broken = changes => N.cleanScore({ ...raw, ...changes });
    equal("score: eight sharps refused", broken({ key: { fifths: 8, mode: "major" } }), null);
    equal("score: a meter of 7/4 refused", broken({ meter: { beats: 7, unit: 4 } }), null);
    equal("score: three staves refused", broken({ staves: [raw.staves[0], raw.staves[0], raw.staves[1]] }), null);
    equal("score: a note over the bar line refused", broken({ staves: [{ clef: "treble", voices: [{ name: "", notes: [n("C4", "h"), n("D4", "q"), n("E4", "h")] }] }] }), null);
    equal("score: a dotted eighth refused", broken({ staves: [{ clef: "treble", voices: [{ name: "", notes: [n("C4", "e", { dot: true })] }] }] }), null);
    equal("score: a clef that isn't one refused", broken({ staves: [{ clef: "alto", voices: [{ name: "", notes: [] }] }] }), null);
    equal("score: a pitch out of range refused", broken({ staves: [{ clef: "treble", voices: [{ name: "", notes: [{ p: { step: 80, alter: 0 }, d: "w" }] }] }] }), null);
    equal("score: too many notes refused", broken({ staves: [{ clef: "treble", voices: [{ name: "", notes: new Array(N.NOTES_MAX + 1).fill(n("C4", "e")) }] }] }), null);
    equal("score: nothing at all refused", N.cleanScore(null), null);

    // ---- Accidentals shown
    const cMajor = [n("F#4", "q"), n("F#4", "q"), n("F4", "q"), n("F#4", "q"), n("F#4", "q"), n("F#5", "q"), n("F#4", "h")];
    equal("accidentals: shown once in a bar, a natural to cancel, again in the next bar, and per line", N.shownAccidentals(cMajor, meter, 0).join(), "1,,0,1,1,1,");
    equal("accidentals: none for the key's own, a natural for its absence", N.shownAccidentals([n("F#4", "h"), n("F4", "h")], meter, 1).join(), ",0");
    equal("accidentals: a note held by a tie over the bar line shows none", N.shownAccidentals([n("C4", "h"), n("F#4", "h", { tie: true }), n("F#4", "h"), n("F#4", "h")], meter, 0).join(), ",1,,1");

    // ---- What sounds when
    const two = N.cleanScore({ title: "", key: { fifths: 0, mode: "major" }, meter, staves: [{ clef: "treble", voices: [{ name: "", notes: [n("E4", "h"), n("G4", "h", { tie: true }), n("G4", "h"), n("F4", "h")] }] }, { clef: "bass", voices: [{ name: "", notes: [n("C3", "w"), n("B2", "w")] }] }] });
    const cuts = N.slices(two);
    equal("slices: a moment for each note started", cuts.map(cut => cut.time).join(), "0,4,8,12");
    equal("slices: the held note isn't struck again", cuts[2].notes[0].struck, false);
    equal("slices: the bass struck at the bar", cuts[2].notes[1].struck && name(cuts[2].notes[1].pitch), "B2");
    equal("slices: the upper voice's note there", name(cuts[1].notes[0].pitch), "G4");
    const sounding = N.soundingEvents(two.staves[0].voices[0].notes);
    equal("sounding: a tie joins its notes", sounding.map(event => `${event.midi}@${event.start}+${event.length}`).join(), "64@0+4,67@4+8,65@12+4");

    // ---- Engraving
    const drawn = N.engrave(score);
    const count = (kind, cls) => drawn.items.filter(item => item.kind === kind && (!cls || item.class === cls)).length;
    equal("engrave: five lines a staff", count("line", "staff-line"), 10);
    equal("engrave: a head for every note", drawn.heads.length, 6);
    check("engrave: a brace joins two staves", drawn.items.some(item => item.kind === "glyph" && item.text === N.GLYPHS.brace));
    check("engrave: the last bar line is thick", drawn.items.some(item => item.class === "bar-final"));
    equal("engrave: three flats in each staff's signature", drawn.items.filter(item => item.text === N.GLYPHS["-1"]).length, 6);
    equal("engrave: the raised seventh's natural", drawn.items.filter(item => item.text === N.GLYPHS["0"]).length, 1);
    check("engrave: the time is written", drawn.items.some(item => item.text === N.GLYPHS.digits[4]));
    check("engrave: a rest", drawn.items.some(item => item.text === N.GLYPHS.restq));
    check("engrave: its notes run left to right in time", drawn.heads.filter(head => head.voice === 0).every((head, index, list) => index === 0 || head.x > list[index - 1].x));
    check("engrave: notes at one moment line up", Math.abs(drawn.heads.find(head => head.voice === 0 && head.index === 0).x - drawn.heads.find(head => head.voice === 1 && head.index === 0).x) < 1e-6);
    const middleC = N.engrave(N.cleanScore({ title: "", key: { fifths: 0, mode: "major" }, meter, staves: [{ clef: "treble", voices: [{ name: "", notes: [n("C4", "q"), n("D4", "e"), n("E4", "e"), n("G4", "h", { tie: true }), n("G4", "w")] }] }] }));
    equal("engrave: middle C in the treble has a ledger line", middleC.items.filter(item => item.class === "staff-ledger").length, 1);
    equal("engrave: two eighths are beamed", middleC.items.filter(item => item.class === "staff-beam").length, 1);
    equal("engrave: and have no flags", middleC.items.filter(item => item.text === N.GLYPHS.flagUp || item.text === N.GLYPHS.flagDown).length, 0);
    equal("engrave: a tie", middleC.items.filter(item => item.class === "staff-tie").length, 1);
    const long = N.cleanScore({ title: "", key: { fifths: 0, mode: "major" }, meter, staves: [{ clef: "treble", voices: [{ name: "", notes: new Array(16).fill(0).map((_, index) => n(index % 2 ? "E4" : "C5", "w", { tie: index === 7 })) }] }] });
    const wrapped = N.engrave(long, { maxWidth: 400 });
    check("engrave: a narrow width wraps into systems", wrapped.systems.length > 1);
    check("engrave: no system wider than asked, but for one bar", wrapped.systems.every(system => system.right - system.left <= 400 || system.bars.length === 1));
    check("engrave: systems stack downward", wrapped.systems.every((system, index) => index === 0 || system.top >= wrapped.systems[index - 1].bottom));
    equal("engrave: one long system without a width", N.engrave(long).systems.length, 1);
    const justified = N.engrave(long, { maxWidth: 400, justify: true });
    check("engrave: justified, each system but the last reaches the width", justified.systems.slice(0, -1).every(system => Math.abs(system.right - system.left - 400) < 0.01));
    check("engrave: justified, the same bars on each system", justified.systems.every((system, index) => system.bars.join() === wrapped.systems[index].bars.join()));
    check("engrave: justified, a short last system keeps its own width", justified.systems.at(-1).right - justified.systems.at(-1).left === wrapped.systems.at(-1).right - wrapped.systems.at(-1).left || justified.systems.at(-1).right - justified.systems.at(-1).left >= 320);
    // The header: the time signature clear of the clef (a treble clef is 2.7 spaces wide).
    const timeDigit = middleC.items.find(item => item.text === N.GLYPHS.digits[4]);
    check("engrave: the time signature stands clear of the clef", timeDigit && timeDigit.x - N.SPACE * (1 + 2.7) >= 0.7 * N.SPACE);

    // ---- MusicXML
    const xml = N.musicXml({ ...score, title: "A & B" });
    const parsed = new DOMParser().parseFromString(xml, "application/xml");
    check("musicxml: well formed", !parsed.querySelector("parsererror"));
    equal("musicxml: a part per staff", parsed.querySelectorAll("part").length, 2);
    equal("musicxml: the key", parsed.querySelector("key fifths")?.textContent, "-3");
    equal("musicxml: its mode", parsed.querySelector("key mode")?.textContent, "minor");
    equal("musicxml: the time", parsed.querySelector("time beats")?.textContent + "/" + parsed.querySelector("time beat-type")?.textContent, "4/4");
    equal("musicxml: the title escaped", parsed.querySelector("work-title")?.textContent, "A & B");
    equal("musicxml: the bass clef", parsed.querySelectorAll("part")[1].querySelector("clef sign")?.textContent, "F");
    const firstNote = parsed.querySelector("part note");
    equal("musicxml: a note's pitch", firstNote.querySelector("step").textContent + firstNote.querySelector("octave").textContent, "G4");
    equal("musicxml: a half is four eighths", firstNote.querySelector("duration").textContent, "4");
    equal("musicxml: an altered note", [...parsed.querySelectorAll("part note")].find(note => note.querySelector("step")?.textContent === "A")?.querySelector("alter")?.textContent, "-1");
    equal("musicxml: a measure each bar", parsed.querySelectorAll("part")[0].querySelectorAll("measure").length, 2);
    check("musicxml: a final bar line", parsed.querySelector("barline bar-style")?.textContent === "light-heavy");
    const tied = new DOMParser().parseFromString(N.musicXml(two), "application/xml");
    equal("musicxml: a tie starts and stops", [...tied.querySelectorAll("tie")].map(tie => tie.getAttribute("type")).join(), "start,stop");
    const partial = new DOMParser().parseFromString(N.musicXml(N.cleanScore({ title: "", key: { fifths: 0, mode: "major" }, meter, staves: [{ clef: "treble", voices: [{ name: "", notes: [n("C4", "h")] }] }] })), "application/xml");
    equal("musicxml: an unfinished bar is filled out", partial.querySelector("forward duration")?.textContent, "4");
    const shared = N.cleanScore({ title: "", key: { fifths: 0, mode: "major" }, meter, staves: [{ clef: "treble", voices: [{ name: "Soprano", notes: [n("E5", "w")] }, { name: "Alto", notes: [n("G4", "w")] }] }] });
    const sharedXml = new DOMParser().parseFromString(N.musicXml(shared), "application/xml");
    equal("musicxml: two voices on a staff, the second after a backup", sharedXml.querySelector("backup duration")?.textContent, "8");
    equal("musicxml: their stems", [...sharedXml.querySelectorAll("stem")].map(stem => stem.textContent).join(), "up,down");
    equal("musicxml: the part named for its voices", sharedXml.querySelector("part-name")?.textContent, "Soprano and Alto");
})();
