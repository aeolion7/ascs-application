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
    // Clefs (2.7.0): alto a step lower than the treble, tenor's flats a step
    // higher and its sharps low; a clef with an 8 under it as the clef without.
    const marks = (fifths, clef) => N.signature(fifths, clef).map(mark => mark.position).join();
    equal("signature: the alto's sharps and flats a step lower", `${marks(3, "alto")} ${marks(-3, "alto")}`, "7,4,8 3,6,2");
    equal("signature: the tenor's sharps from its second line, its flats a step higher", `${marks(7, "tenor")} ${marks(-3, "tenor")}`, "2,6,3,7,4,8,5 5,8,4");
    equal("signature: an 8 under the clef moves nothing", `${marks(2, "treble8")} ${marks(-2, "bass8")}`, `${marks(2, "treble")} ${marks(-2, "bass")}`);

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
    equal("score: a meter of 13/4 refused", broken({ meter: { beats: 13, unit: 4 } }), null);
    check("score: every meter the metronome counts, 7/4 to 12/8 (2.7.0)", [[7, 4], [12, 8], [9, 8], [5, 8], [1, 4]].every(([beats, unit]) => broken({ meter: { beats, unit }, staves: [{ clef: "treble", voices: [{ name: "", notes: [] }] }] }) !== null));
    equal("score: three staves refused", broken({ staves: [raw.staves[0], raw.staves[0], raw.staves[1]] }), null);
    equal("score: a note over the bar line refused", broken({ staves: [{ clef: "treble", voices: [{ name: "", notes: [n("C4", "h"), n("D4", "q"), n("E4", "h")] }] }] }), null);
    equal("score: a dotted sixty-fourth refused", broken({ staves: [{ clef: "treble", voices: [{ name: "", notes: [n("C4", "f", { dot: true })] }] }] }), null);
    check("score: a dotted eighth and a sixteenth kept (2.6.0)", broken({ staves: [{ clef: "treble", voices: [{ name: "", notes: [n("C4", "e", { dot: true }), n("D4", "s")] }] }] }) !== null);
    equal("time: a sixteenth, a thirty-second and a sixty-fourth, in eighths", [n("C4", "s"), n("C4", "t"), n("C4", "f"), n("C4", "s", { dot: true }), n("C4", "t", { dot: true })].map(N.lengthOf).join(), "0.5,0.25,0.125,0.75,0.375");
    equal("score: a clef that isn't one refused", broken({ staves: [{ clef: "mezzo", voices: [{ name: "", notes: [] }] }] }), null);
    check("score: alto, tenor and clefs with an 8 under them kept (2.7.0)", ["alto", "tenor", "treble8", "bass8"].every(clef => broken({ staves: [{ clef, voices: [{ name: "", notes: [] }] }] }) !== null));
    equal("score: a pitch out of range refused", broken({ staves: [{ clef: "treble", voices: [{ name: "", notes: [{ p: { step: 80, alter: 0 }, d: "w" }] }] }] }), null);
    equal("score: too many notes refused", broken({ staves: [{ clef: "treble", voices: [{ name: "", notes: new Array(N.NOTES_MAX + 1).fill(n("C4", "e")) }] }] }), null);
    equal("score: nothing at all refused", N.cleanScore(null), null);

    // ---- Accidentals shown
    // Each note's own (first) pitch, as the staff shows it.
    const shown = (notes, fifths) => N.chordAccidentals(notes, meter, fifths).map(list => list[0] ?? null);
    const cMajor = [n("F#4", "q"), n("F#4", "q"), n("F4", "q"), n("F#4", "q"), n("F#4", "q"), n("F#5", "q"), n("F#4", "h")];
    equal("accidentals: shown once in a bar, a natural to cancel, again in the next bar, and per line", shown(cMajor, 0).join(), "1,,0,1,1,1,");
    equal("accidentals: none for the key's own, a natural for its absence", shown([n("F#4", "h"), n("F4", "h")], 1).join(), ",0");
    equal("accidentals: a note held by a tie over the bar line shows none", shown([n("C4", "h"), n("F#4", "h", { tie: true }), n("F#4", "h"), n("F#4", "h")], 0).join(), ",1,,1");

    // ---- What sounds when
    const two = N.cleanScore({ title: "", key: { fifths: 0, mode: "major" }, meter, staves: [{ clef: "treble", voices: [{ name: "", notes: [n("E4", "h"), n("G4", "h", { tie: true }), n("G4", "h"), n("F4", "h")] }] }, { clef: "bass", voices: [{ name: "", notes: [n("C3", "w"), n("B2", "w")] }] }] });
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
    // Sixteenths and shorter (2.6.0): beams, stubs, flags and rests.
    const shortScore = notes => N.engrave(N.cleanScore({ title: "", key: { fifths: 0, mode: "major" }, meter, staves: [{ clef: "treble", voices: [{ name: "", notes }] }] }));
    const beams = drawnShort => drawnShort.items.filter(item => item.class === "staff-beam");
    const fours = shortScore([...["C5", "D5", "E5", "F5"].map(text => n(text, "s")), n("G4", "q"), n("A4", "h")]);
    check("engrave: four sixteenths in a beat, two beams across them", beams(fours).length === 2 && beams(fours).every(beam => beam.x1 === beams(fours)[0].x1 && beam.x2 === beams(fours)[0].x2) && beams(fours)[0].x2 > beams(fours)[0].x1);
    const dotted = shortScore([n("C5", "e", { dot: true }), n("D5", "s"), n("E5", "q"), n("F5", "h")]);
    const [primary, stub] = beams(dotted);
    check("engrave: a dotted eighth and a sixteenth, the sixteenth's short beam back from it", beams(dotted).length === 2 && Math.abs(stub.x2 - primary.x2) < 1e-6 && stub.x2 - stub.x1 > 0 && stub.x2 - stub.x1 < primary.x2 - primary.x1 && dotted.items.some(item => item.text === N.GLYPHS.dot));
    const mixed = shortScore([n("C5", "s"), n("D5", "t"), n("E5", "t"), n("F5", "e"), n("G5", "q"), n("A5", "h")]);
    equal("engrave: a sixteenth and two thirty-seconds: one beam, two under the 16th and 32nds, a third under the 32nds", beams(mixed).length, 3);
    const flagged = shortScore([n("C5", "s"), n(null, "s"), n("D5", "t"), n(null, "t"), n("E5", "f"), n(null, "f"), n(null, "t"), n(null, "q"), n(null, "h")]);
    check("engrave: alone, a sixteenth, thirty-second and sixty-fourth each have their flag", [2, 3, 4].every(level => flagged.items.some(item => item.text === N.GLYPHS.flagsDown[level] || item.text === N.GLYPHS.flagsUp[level])) && !beams(flagged).length);
    check("engrave: and their rests", [N.GLYPHS.rests, N.GLYPHS.restt, N.GLYPHS.restf].every(glyph => flagged.items.some(item => item.text === glyph)));
    const stemOf = drawnShort => { const stem = drawnShort.items.find(item => item.class === "staff-stem"); return Math.abs(stem.y2 - stem.y1); };
    check("engrave: a sixty-fourth's stem is longer than a sixteenth's", stemOf(shortScore([n("E4", "f"), n(null, "f"), n(null, "t"), n(null, "s"), n(null, "e"), n(null, "q"), n(null, "h")])) > stemOf(shortScore([n("E4", "s"), n(null, "s"), n(null, "e"), n(null, "q"), n(null, "h")])));
    check("engrave: the shortest notes each have room", (() => { const heads = shortScore([...Array(16)].map((_, at) => n(at % 2 ? "C5" : "E5", "f")).concat([n(null, "q"), n(null, "h")])).heads; return heads.every((head, at) => at === 0 || head.x - heads[at - 1].x >= 2 * N.SPACE); })());
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
    equal("musicxml: sixteen divisions a quarter (2.6.0)", parsed.querySelector("divisions")?.textContent, "16");
    equal("musicxml: a half is thirty-two", firstNote.querySelector("duration").textContent, "32");
    equal("musicxml: an altered note", [...parsed.querySelectorAll("part note")].find(note => note.querySelector("step")?.textContent === "A")?.querySelector("alter")?.textContent, "-1");
    equal("musicxml: a measure each bar", parsed.querySelectorAll("part")[0].querySelectorAll("measure").length, 2);
    check("musicxml: a final bar line", parsed.querySelector("barline bar-style")?.textContent === "light-heavy");
    const tied = new DOMParser().parseFromString(N.musicXml(two), "application/xml");
    equal("musicxml: a tie starts and stops", [...tied.querySelectorAll("tie")].map(tie => tie.getAttribute("type")).join(), "start,stop");
    const partial = new DOMParser().parseFromString(N.musicXml(N.cleanScore({ title: "", key: { fifths: 0, mode: "major" }, meter, staves: [{ clef: "treble", voices: [{ name: "", notes: [n("C4", "h")] }] }] })), "application/xml");
    equal("musicxml: an unfinished bar is filled out", partial.querySelector("forward duration")?.textContent, "32");
    const fine = new DOMParser().parseFromString(N.musicXml(N.cleanScore({ title: "", key: { fifths: 0, mode: "major" }, meter, staves: [{ clef: "treble", voices: [{ name: "", notes: [n("C4", "s"), n("D4", "t"), n("E4", "f"), n("F4", "f"), n("G4", "e", { dot: true }), n("A4", "s"), n("B4", "q"), n("C5", "q", { dot: true })] }] }] })), "application/xml");
    equal("musicxml: a sixteenth, a thirty-second and sixty-fourths, whole numbers", [...fine.querySelectorAll("note")].map(note => `${note.querySelector("type").textContent}:${note.querySelector("duration").textContent}`).join(), "16th:4,32nd:2,64th:1,64th:1,eighth:12,16th:4,quarter:16,quarter:24");
    const shared = N.cleanScore({ title: "", key: { fifths: 0, mode: "major" }, meter, staves: [{ clef: "treble", voices: [{ name: "Soprano", notes: [n("E5", "w")] }, { name: "Alto", notes: [n("G4", "w")] }] }] });
    const sharedXml = new DOMParser().parseFromString(N.musicXml(shared), "application/xml");
    equal("musicxml: two voices on a staff, the second after a backup", sharedXml.querySelector("backup duration")?.textContent, "64");
    equal("musicxml: their stems", [...sharedXml.querySelectorAll("stem")].map(stem => stem.textContent).join(), "up,down");
    equal("musicxml: the part named for its voices", sharedXml.querySelector("part-name")?.textContent, "Soprano and Alto");
    // ---- Chords and meters (2.7.0)
    const chordOf = (names, d = "w", extra = {}) => ({ p: P(names[0]), more: names.slice(1).map(P), d, dot: false, tie: false, ...extra });
    const one = (notes, staffMeter = meter, clef = "treble") => N.cleanScore({ title: "", key: { fifths: 0, mode: "major" }, meter: staffMeter, staves: [{ clef, voices: [{ name: "", notes }] }] });
    // Clefs (2.7.0): notes kept as they sound, each clef its own bottom line.
    const headAt = (clef, name) => N.engrave(one([n(name, "w")], meter, clef)).heads[0]?.y;
    check("clef: E3 under a treble clef with an 8 sits where E4 does under a treble", headAt("treble8", "E3") === headAt("treble", "E4"));
    check("clef: G1 under a bass clef with an 8 sits where G2 does under a bass", headAt("bass8", "G1") === headAt("bass", "G2"));
    check("clef: middle C on the alto's middle line", headAt("alto", "C4") === headAt("treble", "B4"));
    check("clef: middle C on the tenor's fourth line", headAt("tenor", "C4") === headAt("treble", "D5"));
    const clefGlyph = clef => N.engrave(one([n("C4", "w")], meter, clef)).items.find(item => item.text === N.GLYPHS[clef]);
    check("clef: each drawn with its own sign", ["treble8", "bass8", "alto", "tenor"].every(clef => clefGlyph(clef)));
    equal("clef: a tenor's C clef a line above an alto's", clefGlyph("alto").y - clefGlyph("tenor").y, N.SPACE);
    const xmlClef = clef => new DOMParser().parseFromString(N.musicXml(one([n("C4", "w")], meter, clef)), "application/xml").querySelector("clef");
    equal("musicxml: a clef with an 8 under it, an octave down", ["treble8", "bass8"].map(clef => `${xmlClef(clef).querySelector("sign").textContent}${xmlClef(clef).querySelector("clef-octave-change")?.textContent}`).join(), "G-1,F-1");
    equal("musicxml: the alto's and tenor's C clefs", ["alto", "tenor"].map(clef => `${xmlClef(clef).querySelector("sign").textContent}${xmlClef(clef).querySelector("line").textContent}`).join(), "C3,C4");
    const shuffled = one([{ p: P("G4"), more: [P("C4"), P("E4")], d: "w", dot: false, tie: false }]);
    const kept = shuffled?.staves[0].voices[0].notes[0];
    equal("chord: kept low to high, its lowest the note's own pitch", kept && N.pitchesOf(kept).map(N.pitchName).join(" "), "C4 E4 G4");
    check("chord: frozen", kept && Object.isFrozen(kept.more));
    check("chord: a single note has no list of others", !("more" in one([n("C4", "w")]).staves[0].voices[0].notes[0]));
    equal("chord: two notes on one line refused", one([chordOf(["C4", "C#4"])]), null);
    equal("chord: more than eight refused", one([chordOf(["C3", "D3", "E3", "F3", "G3", "A3", "B3", "C4", "D4"])]), null);
    equal("chord: a rest with pitches refused", one([{ p: null, more: [P("C4")], d: "w", dot: false, tie: false }]), null);
    equal("chord: a pitch that isn't one refused", one([{ p: P("C4"), more: [{ step: 99, alter: 0 }], d: "w", dot: false, tie: false }]), null);
    const cmaj = one([chordOf(["C4", "E4", "G4"]), chordOf(["B3", "D4", "F4", "G4"], "h"), chordOf(["C4", "E4", "G4"], "h")]);
    const chordSounding = N.soundingEvents(cmaj.staves[0].voices[0].notes);
    equal("chord: each pitch sounds", chordSounding.map(event => `${event.midi}@${event.start}`).join(), "60@0,64@0,67@0,59@8,62@8,65@8,67@8,60@12,64@12,67@12");
    const held = one([chordOf(["C4", "E4", "G4"], "h", { tie: true }), chordOf(["C4", "F4", "A4"], "h")]);
    equal("chord: a tie holds the pitches the next chord has", N.soundingEvents(held.staves[0].voices[0].notes).map(event => `${event.midi}@${event.start}+${event.length}`).join(), "60@0+8,64@0+4,67@0+4,65@4+4,69@4+4");
    equal("chord: a tied chord isn't held as a whole unless the same", N.timed(held.staves[0].voices[0].notes)[1].held, false);
    const altered = one([chordOf(["C#4", "E4", "G#4"], "h"), chordOf(["C#4", "E4", "G4"], "h")]);
    equal("chord: each pitch's accidental, and one shown in the bar not again", JSON.stringify(N.chordAccidentals(altered.staves[0].voices[0].notes, meter, 0)), "[[1,null,1],[null,null,0]]");

    // Engraved.
    const engraved = N.engrave(cmaj);
    const headsOf = index => engraved.heads.filter(head => head.index === index);
    equal("chord: a head for each pitch", [0, 1, 2].map(index => headsOf(index).length).join(), "3,4,3");
    check("chord: its heads bottom to top, each named by its place", headsOf(0).map(head => head.at).join() === "0,1,2" && headsOf(0).every((head, at, list) => !at || head.y < list[at - 1].y));
    const g7 = headsOf(1);
    check("chord: the upper of a second steps to the stem's other side", Math.abs(g7[3].x - g7[2].x - N.HEAD_WIDTH.h) < 2 && g7[0].x === g7[1].x && g7[1].x === g7[2].x);
    equal("chord: one stem for the chord", engraved.items.filter(item => item.class === "staff-stem").length, 2);
    const chordStem = drawnScore => drawnScore.items.find(item => item.class === "staff-stem");
    const lowChord = N.engrave(one([chordOf(["C4", "E4", "G4"], "h"), n(null, "h")]));
    const highChord = N.engrave(one([chordOf(["D5", "F5", "A5"], "h"), n(null, "h")]));
    check("chord: stem up when it sits low, down when high", chordStem(lowChord).y2 < chordStem(lowChord).y1 && chordStem(highChord).y2 > chordStem(highChord).y1);
    check("chord: the stem runs from the far head past the near one", Math.abs(chordStem(lowChord).y1 - lowChord.heads[0].y) < 1e-6 && chordStem(lowChord).y2 < lowChord.heads[2].y);
    const stacked = N.engrave(altered);
    const accidentalXs = stacked.items.filter(item => item.text === N.GLYPHS["1"]).map(item => item.x);
    check("chord: accidentals too close to share a column stand side by side", accidentalXs.length === 2 && Math.abs(accidentalXs[0] - accidentalXs[1]) > 5);
    const spread = N.engrave(one([chordOf(["C#4", "E4", "C#5"])]));
    const spreadXs = spread.items.filter(item => item.text === N.GLYPHS["1"]).map(item => item.x);
    check("chord: an octave apart, they share one", spreadXs.length === 2 && spreadXs[0] === spreadXs[1]);
    const lowLedgers = N.engrave(one([chordOf(["A3", "C4", "E4"])], meter, "treble"));
    equal("chord: ledger lines down to its lowest note", lowLedgers.items.filter(item => item.class === "staff-ledger").length, 2);
    const dottedChord = N.engrave(one([chordOf(["F4", "A4", "C5"], "h", { dot: true }), n(null, "q")]));
    equal("chord: a dot by each head, one a space", dottedChord.items.filter(item => item.text === N.GLYPHS.dot).length, 3);
    const tiedDrawn = N.engrave(held);
    equal("chord: a tie for each pitch held", tiedDrawn.items.filter(item => item.class === "staff-tie").length, 1);
    const grand = N.cleanScore({ title: "", key: { fifths: 0, mode: "major" }, meter, staves: [{ clef: "treble", voices: [{ name: "", notes: [chordOf(["E4", "G4", "C5"])] }] }, { clef: "bass", voices: [{ name: "", notes: [chordOf(["C3", "G3"])] }] }] });
    equal("chord: a grand staff's two hands", N.engrave(grand).heads.length, 5);

    // MusicXML.
    const chordXml = new DOMParser().parseFromString(N.musicXml(held), "application/xml");
    const xmlNotes = [...chordXml.querySelectorAll("note")];
    equal("musicxml: a chord's pitches, the others marked as of the chord", xmlNotes.map(note => (note.querySelector("chord") ? "+" : "") + note.querySelector("step").textContent).join(" "), "C +E +G C +F +A");
    equal("musicxml: a tie only on the pitch held", xmlNotes.map(note => [...note.querySelectorAll("tie")].map(tie => tie.getAttribute("type")).join("/") || "-").join(" "), "start - - stop - -");

    // Meters: their groups, beams and numbers.
    equal("meter: 7/8 in twos and a three by default", N.meterGroups({ beats: 7, unit: 8 }).join(), "2,2,3");
    equal("meter: 5/8, a two and a three", N.meterGroups({ beats: 5, unit: 8 }).join(), "2,3");
    equal("meter: 12/8 in threes", N.meterGroups({ beats: 12, unit: 8 }).join(), "3,3,3,3");
    equal("meter: its own groups when given", N.meterGroups({ beats: 7, unit: 8, groups: [3, 2, 2] }).join(), "3,2,2");
    equal("meter: 4/4 a beat a group", N.meterGroups(meter).join(), "2,2,2,2");
    equal("meter: groups that don't add up refused", one([n("C4", "q")], { beats: 7, unit: 8, groups: [3, 3] }), null);
    const sevenEighths = { beats: 7, unit: 8, groups: [3, 2, 2] };
    const seven = N.engrave(one(["C5", "D5", "E5", "F5", "G5", "A5", "B5"].map(text => n(text, "e")), sevenEighths));
    equal("meter: eighths beamed in its groups, 3+2+2", seven.items.filter(item => item.class === "staff-beam").length, 3);
    const twelve = N.engrave(one([n("C5", "h", { dot: true }), n("C5", "h", { dot: true })], { beats: 12, unit: 8 }));
    const digits = twelve.items.filter(item => N.GLYPHS.digits.includes(item.text));
    check("meter: 12/8 written, its 8 centered under the 12", digits.map(item => N.GLYPHS.digits.indexOf(item.text)).join("") === "128" && Math.abs(digits[2].x - (digits[0].x + digits[1].x) / 2) < 1e-6);
})();
