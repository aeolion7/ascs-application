"use strict";

// Music for the Conservatory (2.3.0).
(function () {
    const M = globalThis.MaestroMusic;
    const { check, equal } = globalThis.TestHarness;
    const SHARP = String.fromCodePoint(0x266F), FLAT = String.fromCodePoint(0x266D);
    const names = (root, scale) => M.scaleNotes(root, scale).map(note => note.name).join(" ");

    equal("names: F sharp", JSON.stringify(M.parseName(`F${SHARP}`)), JSON.stringify({ letter: 3, alter: 1 }));
    equal("names: junk isn't a note", M.parseName("H"), null);
    equal("names: nor is a sharp sign alone", M.parseName(SHARP), null);
    equal("pitch class: B flat", M.pitchClass(`B${FLAT}`), 10);
    equal("pitch class: C flat wraps", M.pitchClass(`C${FLAT}`), 11);

    equal("G major has F sharp", names("G", "major"), `G A B C D E F${SHARP}`);
    equal("F major has B flat", names("F", "major"), `F G A B${FLAT} C D E`);
    equal("E flat major is spelled with flats", names(`E${FLAT}`, "major"), `E${FLAT} F G A${FLAT} B${FLAT} C D`);
    equal("A natural minor", names("A", "minor"), "A B C D E F G");
    equal("A harmonic minor raises the seventh", names("A", "harmonic"), `A B C D E F G${SHARP}`);
    equal("D dorian", names("D", "dorian"), "D E F G A B C");
    equal("F lydian", names("F", "lydian"), "F G A B C D E");
    equal("C sharp minor", names(`C${SHARP}`, "minor"), `C${SHARP} D${SHARP} E F${SHARP} G${SHARP} A B`);
    equal("G sharp major needs a double sharp", names(`G${SHARP}`, "major").split(" ")[6], `F${String.fromCodePoint(0x1D12A)}`);
    equal("A minor pentatonic", names("A", "minorPentatonic"), "A C D E G");
    equal("E blues has its flat five", names("E", "blues"), `E G A B${FLAT} B D`);
    equal("an unknown scale has no notes", M.scaleNotes("C", "toString").length, 0);
    equal("an unknown root has no notes", M.scaleNotes("X", "major").length, 0);

    // 2.3.0: the wider library.
    const DFLAT = String.fromCodePoint(0x1D12B);
    check("every scale starts on its root, rises, and has no note twice", Object.values(M.SCALES).every(scale => scale.steps[0][1] === 0 && scale.steps.every(([, semis], at) => !at || semis > scale.steps[at - 1][1]) && scale.steps.at(-1)[1] < 12));
    check("every scale names its family", Object.values(M.SCALES).every(scale => M.FAMILIES.includes(scale.family)));
    check("every scale spells in every key without an unknown note", Object.keys(M.SCALES).every(scale => M.ROOTS.every(root => M.scaleNotes(root, scale).every(note => /^[A-G]/.test(note.name)))));
    equal("harmonic minor's modes: Locrian natural 6", names("B", "locrianNatural6"), "B C D E F G" + SHARP + " A");
    equal("Ionian sharp 5", names("C", "ionianSharp5"), `C D E F G${SHARP} A B`);
    equal("Dorian sharp 4", names("D", "dorianSharp4"), `D E F G${SHARP} A B C`);
    equal("Phrygian dominant", names("E", "phrygianDominant"), `E F G${SHARP} A B C D`);
    equal("Lydian sharp 2", names("F", "lydianSharp2"), `F G${SHARP} A B C D E`);
    equal("Ultralocrian, with its double flat", names("G" + SHARP, "ultralocrian"), `G${SHARP} A B C D E F`);
    equal("its degrees", M.scaleNotes("C", "ultralocrian").map(note => note.degree).join(" "), `1 ${FLAT}2 ${FLAT}3 ${FLAT}4 ${FLAT}5 ${FLAT}6 ${FLAT}${FLAT}7`);
    equal("and in C, the double flat", names("C", "ultralocrian").split(" ")[6], `B${DFLAT}`);
    equal("melodic minor's modes: Dorian flat 2", names("B", "dorianFlat2"), `B C D E F${SHARP} G${SHARP} A`);
    equal("Lydian augmented", names("C", "lydianAugmented"), `C D E F${SHARP} G${SHARP} A B`);
    equal("Lydian dominant", names("D", "lydianDominant"), `D E F${SHARP} G${SHARP} A B C`);
    equal("Mixolydian flat 6", names("E", "mixolydianFlat6"), `E F${SHARP} G${SHARP} A B C D`);
    equal("Locrian natural 2", names(`F${SHARP}`, "locrianNatural2"), `F${SHARP} G${SHARP} A B C D E`);
    equal("Altered", names(`G${SHARP}`, "altered"), `G${SHARP} A B C D E F${SHARP}`);
    equal("Harmonic major", names("C", "harmonicMajor"), `C D E F G A${FLAT} B`);
    equal("Double harmonic major", names("C", "doubleHarmonic"), `C D${FLAT} E F G A${FLAT} B`);
    equal("Hungarian minor", names("A", "hungarianMinor"), `A B C D${SHARP} E F G${SHARP}`);
    equal("Hirajoshi", names("A", "hirajoshi"), "A B C E F");
    equal("In", names("E", "in"), "E F A B C");
    equal("Iwato", names("B", "iwato"), "B C E F A");
    equal("Yo", names("D", "yo"), "D E G A B");
    equal("Whole tone", names("C", "wholeTone"), `C D E F${SHARP} G${SHARP} B${FLAT}`);
    equal("Diminished, half-whole", names("C", "diminishedHalfWhole"), `C D${FLAT} D${SHARP} E F${SHARP} G A B${FLAT}`);
    equal("Bebop dominant has both sevenths", names("G", "bebopDominant"), `G A B C D E F F${SHARP}`);
    const harmonicMajorChords = M.chordsInKey("C", "harmonicMajor").map(chord => chord.name).join(" ");
    equal("chords in harmonic major", harmonicMajorChords, `C D° Em Fm G A${FLAT}+ B°`);
    equal("their numerals", M.chordsInKey("C", "harmonicMajor").map(chord => chord.numeral).join(" "), "I ii° iii iv V VI+ vii°");
    equal("a major third with a flat five", M.triadName(4, 6).suffix, `(${FLAT}5)`);
    equal("a minor third with a sharp five", M.triadName(3, 8).suffix, `m(${SHARP}5)`);
    equal("a diminished third reads as sus2", M.triadName(2, 7).suffix, "sus2");
    equal("an augmented third as sus4", M.triadName(5, 7).suffix, "sus4");
    check("no chord in any seven-note scale goes unnamed", Object.keys(M.SCALES).every(scale => M.chordsInKey("C", scale).every(chord => !/\?|undefined/.test(chord.name))));
    const every = M.everyNote("F", M.scaleNotes("F", "major"));
    equal("every note: twelve", every.size, 12);
    check("every note: the scale's own keep theirs", every.get(10).name === `B${FLAT}` && !every.get(10).outside && every.get(5).degree === "1");
    check("every note: the rest lean flat in a flat key", every.get(6).name === `G${FLAT}` && every.get(6).degree === `${FLAT}2` && every.get(6).interval === "m2" && every.get(6).outside && every.get(1).name === `D${FLAT}` && every.get(1).degree === `${FLAT}6`);
    check("every note: sharp in a sharp key", M.everyNote("G", M.scaleNotes("G", "major")).get(1).name === `C${SHARP}`);
    equal("every note: an unknown root has none", M.everyNote("X", []).size, 0);
    equal("settings: Every note is kept", M.parseSettings(JSON.stringify({ show: "all" })).show, "all");
    equal("settings: a wrong show isn't", M.parseSettings(JSON.stringify({ show: "some" })).show, "scale");

    equal("degrees: the dorian", M.scaleNotes("D", "dorian").map(note => note.degree).join(" "), `1 2 ${FLAT}3 4 5 6 ${FLAT}7`);
    equal("degrees: the blues", M.scaleNotes("A", "blues").map(note => note.degree).join(" "), `1 ${FLAT}3 4 ${FLAT}5 5 ${FLAT}7`);
    equal("degrees: the lydian's raised fourth", M.scaleNotes("C", "lydian")[3].degree, `${SHARP}4`);
    equal("intervals: the major", M.scaleNotes("C", "major").map(note => note.interval).join(" "), "R M2 M3 P4 P5 M6 M7");
    equal("spelled pitch: a flat keeps its octave", M.spelledPitch(70, `B${FLAT}`), `B${FLAT}4`);
    equal("spelled pitch: C flat is in the octave of its letter", M.spelledPitch(59, `C${FLAT}`), `C${FLAT}4`);
    equal("spelled pitch: B sharp too", M.spelledPitch(60, `B${SHARP}`), `B${SHARP}3`);
    equal("spelled pitch: a double sharp", M.spelledPitch(67, `F${String.fromCodePoint(0x1D12A)}`), `F${String.fromCodePoint(0x1D12A)}4`);
    equal("spelled pitch: a name that isn't the pitch gives the plain name", M.spelledPitch(61, "D"), `C${SHARP}4`);
    equal("spelled pitch: no name gives the plain name", M.spelledPitch(61, undefined), `C${SHARP}4`);
    equal("intervals: the locrian", M.scaleNotes("B", "locrian").map(note => note.interval).join(" "), "R m2 m3 P4 d5 m6 m7");
    equal("intervals: an augmented fourth", M.intervalLabel(4, 6), "A4");

    const gMajor = M.chordsInKey("G", "major");
    equal("chords in G major", gMajor.map(chord => chord.name).join(" "), `G Am Bm C D Em F${SHARP}°`);
    equal("their numerals", gMajor.map(chord => chord.numeral).join(" "), "I ii iii IV V vi vii°");
    equal("a chord's tones", gMajor[4].tones.map(tone => tone.name).join(" "), `D F${SHARP} A`);
    equal("a minor chord's degrees", gMajor[1].tones.map(tone => tone.degree).join(" "), `1 ${FLAT}3 5`);
    equal("harmonic minor's augmented third chord", M.chordsInKey("A", "harmonic")[2].name, "C+");
    equal("a pentatonic has no chords listed", M.chordsInKey("A", "minorPentatonic").length, 0);
    // 2.3.0: seventh chords, and a capo's shapes.
    const cSevenths = M.chordsInKey("C", "major", 4);
    equal("sevenths: the major key", cSevenths.map(chord => chord.name).join(" "), `Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7${FLAT}5`);
    equal("sevenths: their numerals", cSevenths.map(chord => chord.numeral).join(" "), "Imaj7 ii7 iii7 IVmaj7 V7 vi7 vii\u00F87");
    equal("sevenths: four notes, the seventh last", cSevenths[4].tones.map(tone => `${tone.name}:${tone.degree}`).join(" "), `G:1 B:3 D:5 F:${FLAT}7`);
    equal("sevenths: harmonic minor's", M.chordsInKey("A", "harmonic", 4).map(chord => chord.name).join(" "), `Am(maj7) Bm7${FLAT}5 C+maj7 Dm7 E7 Fmaj7 G${SHARP}\u00B07`);
    check("sevenths: none in a seven-note scale goes unnamed", Object.keys(M.SCALES).every(scale => M.chordsInKey("C", scale, 4).every(chord => !/\?|undefined/.test(chord.name + chord.numeral))));
    equal("triads unless asked", M.chordsInKey("C", "major")[4].tones.length, 3);
    equal("capo: A at 2 is a G shape", M.capoShape("A", 2), "G");
    equal("capo: keeps the chord's kind", M.capoShape(`F${SHARP}m7`, 2), "Em7");
    equal("capo: B flat at 3 is a G shape", M.capoShape(`B${FLAT}`, 3), "G");
    equal("capo: shapes in flat keys are named flat", M.capoShape("C", 2), `B${FLAT}`);
    equal("capo: no capo, no change", M.capoShape("D", 0), "D");
    equal("capo: not a chord", M.capoShape("H7", 2), null);
    // 2.3.0: the finder.
    equal("finder: C E G is C", M.findChords([0, 4, 7]).map(chord => chord.name).join(" "), "C");
    equal("finder: over E, C is a slash chord", M.findChords([4, 7, 0])[0].name, "C/E");
    equal("finder: an inversion is found under each root it could have", M.findChords([9, 0, 4, 7]).map(chord => chord.name).join(" "), "Am7 C6/A");
    equal("finder: a slash chord's bass is spelled from its root", M.findChords([3, 6, 11]).find(chord => chord.root === "B")?.name, `B/D${SHARP}`);
    equal("finder: notes spelled from the root", M.findChords([3, 7, 10]).find(chord => chord.root === `E${FLAT}`)?.tones.join(" "), `E${FLAT} G B${FLAT}`);
    equal("finder: a diminished seventh, four ways", M.findChords([0, 3, 6, 9]).length, 4);
    equal("finder: one note finds nothing", M.findChords([0]).length, 0);
    // Extended and altered chords, with the notes players leave out.
    const top = picked => M.findChords(picked)[0]?.name;
    equal("finder: a ninth without its fifth", top([0, 4, 10, 2]), "C9");
    equal("finder: a major ninth, every note", top([0, 4, 7, 11, 2]), "Cmaj9");
    equal("finder: a minor ninth", top([9, 0, 7, 11]), "Am9");
    equal("finder: a thirteenth as guitarists voice it", top([0, 4, 10, 9]), "C13");
    equal("finder: a thirteenth with all seven notes", top([0, 4, 7, 10, 2, 5, 9]), "C13");
    equal("finder: a minor eleventh", top([0, 3, 7, 10, 2, 5]), "Cm11");
    equal("finder: the Hendrix chord", top([4, 8, 2, 7]), `E7${SHARP}9`);
    equal("finder: a flat nine", top([7, 11, 5, 8]), `G7${FLAT}9`);
    equal("finder: a sharp eleven", top([0, 4, 11, 6]), `Cmaj7${SHARP}11`);
    equal("finder: six-nine", top([0, 4, 9, 2]), "C6/9");
    // Altered dominants, named by rule. The user's: G B F E-flat A-flat.
    equal("altered: a sharp five and a flat nine", top([7, 5, 11, 3, 8]), `G7(${SHARP}5,${FLAT}9)`);
    equal("altered: without a fifth, the sharp five is spelled as one", M.findChords([7, 5, 11, 3, 8])[0].tones.join(" "), `G B D${SHARP} F A${FLAT}`);
    equal("altered: with a fifth, it's a flat thirteen", top([7, 5, 11, 2, 3, 8]), `G7(${FLAT}9,${FLAT}13)`);
    equal("altered: and spelled as one", M.findChords([7, 5, 11, 2, 3, 8])[0].tones.join(" "), `G B D F A${FLAT} E${FLAT}`);
    equal("altered: a sharp eleven over a fifth", top([0, 4, 7, 10, 6]), `C7${SHARP}11`);
    equal("altered: a flat five without one", top([0, 4, 10, 6]), `C7${FLAT}5`);
    equal("altered: an augmented seventh", top([0, 4, 8, 10]), `C7${SHARP}5`);
    equal("altered: named by its highest natural extension", top([0, 4, 7, 10, 2, 6, 9]), `C13${SHARP}11`);
    equal("altered: a thirteen with a flat nine", top([7, 11, 5, 8, 4]), `G13${FLAT}9`);
    equal("altered: every alteration at once", top([0, 4, 10, 1, 3, 6, 8]), `C7(${FLAT}5,${SHARP}5,${FLAT}9,${SHARP}9)`);
    equal("altered: over another bass, a slash chord", M.findChords([11, 7, 5, 3, 8]).find(chord => chord.root === "G")?.name, `G7(${SHARP}5,${FLAT}9)/B`);
    check("altered: a major seventh isn't a dominant", M.alteredDominant(0, new Set([0, 4, 10, 11, 1])) === null);
    check("altered: an unaltered dominant is left to the kinds", M.alteredDominant(7, new Set([7, 11, 2, 5, 4])) === null && top([7, 11, 2, 5, 4]) === "G13");
    equal("finder: a dominant seventh without its fifth", top([0, 4, 10]), "C7");
    equal("finder: a suspended seventh, before the eleventh it could be", M.findChords([0, 5, 10]).slice(0, 2).map(chord => chord.name).join(" "), "C7sus4 C11");
    equal("finder: an omitted note isn't listed among the chord's", M.findChords([0, 4, 10, 2])[0].tones.join(" "), `C E B${FLAT} D`);
    check("finder: a triad isn't taken for a bigger chord", M.findChords([0, 4, 7]).length === 1);
    check("finder: every kind spells its notes", M.CHORD_KINDS.every(([suffix, notes]) => notes.every(([semis, degree]) => M.pitchClass(M.spell("C", degree, semis)) === semis)));
    equal("finder: no chord has these", M.findChords([0, 1, 2]).length, 0);
    const holds = M.findScales([0, 4, 7, 11]);
    check("finder: the scales holding C E G B, the major from C first", holds[0].root === "C" && holds[0].scale === "major" && holds.every(found => M.scaleNotes(found.root, found.scale).length > 0));
    check("finder: every scale found holds every note", holds.every(found => [0, 4, 7, 11].every(pc => M.scaleNotes(found.root, found.scale).some(note => note.pc === pc))));
    check("finder: none is missed", holds.length === Object.keys(M.SCALES).reduce((sum, id) => sum + M.PLAIN_NAMES.filter(root => [0, 4, 7, 11].every(pc => M.scaleNotes(root, id).some(note => note.pc === pc))).length, 0));
    check("finder: every name it uses is a root on offer", M.PLAIN_NAMES.every(name => M.ROOTS.includes(name)));
    equal("positions: a guitar's", M.positionsFor(15).join(), "0,1,2,3,4,5,6,7,8,9,10,11");
    equal("positions: a ukulele's", M.positionsFor(12).join(), "0,1,2,3,4,5,6,7,8");
    equal("settings: a position is kept", M.parseSettings(JSON.stringify({ position: 5 })).position, 5);
    equal("settings: a wrong one isn't", M.parseSettings(JSON.stringify({ position: 40 })).position, -1);
    equal("settings: Finder can be the tab", M.parseSettings(JSON.stringify({ tab: "finder" })).tab, "finder");
    // 2.3.0: quizzes, with chosen "random" numbers.
    const fixed = (...values) => { let at = 0; return () => values[at++ % values.length]; };
    const guitar = [40, 45, 50, 55, 59, 64];
    equal("quiz: the first place", JSON.stringify(M.quizNote(guitar, { from: 0, to: 15 }, fixed(0))), JSON.stringify({ string: 0, fret: 0, midi: 40 }));
    equal("quiz: the last place", JSON.stringify(M.quizNote(guitar, { from: 0, to: 15 }, fixed(0.9999))), JSON.stringify({ string: 5, fret: 15, midi: 79 }));
    check("quiz: within the position", Array.from({ length: 50 }, (_, at) => M.quizNote(guitar, { from: 5, to: 9 }, fixed(at / 50))).every(spot => spot.fret >= 5 && spot.fret <= 9));
    check("quiz: naturals only", Array.from({ length: 50 }, (_, at) => M.quizNote(guitar, { naturals: true }, fixed(at / 50))).every(spot => M.PLAIN_NAMES[spot.midi % 12].length === 1));
    check("quiz: never the place just asked", M.quizNote([40], { from: 0, to: 1, avoid: { string: 0, fret: 0 } }, fixed(0)).fret === 1);
    equal("quiz: a keyboard is one string of keys", M.quizNote([48], { from: 0, to: 36 }, fixed(0.5)).midi, 66);
    equal("quiz: nowhere to ask", M.quizNote([], {}, fixed(0)), null);
    equal("quiz: an interval", JSON.stringify(M.quizInterval(0, fixed(0.25, 0.5))), JSON.stringify({ low: 54, high: 58, semis: 4 }));
    check("quiz: never the same interval twice running", Array.from({ length: 12 }, (_, at) => M.quizInterval(at + 1, fixed(at / 12, at / 12, 0)).semis !== at + 1).every(Boolean));
    check("quiz: every interval named, a second to an octave", M.QUIZ_INTERVALS.map(interval => interval.semis).join() === "1,2,3,4,5,6,7,8,9,10,11,12" && M.QUIZ_INTERVALS[5].short === "TT");
    const quizKept = M.parseSettings(JSON.stringify({ quizKind: "interval", quizNaturals: true, quizDirection: "down", tab: "quiz" }));
    check("settings: the quiz's choices are kept", quizKept.quizKind === "interval" && quizKept.quizNaturals === true && quizKept.quizDirection === "down" && quizKept.tab === "quiz");
    const quizBad = M.parseSettings(JSON.stringify({ quizKind: "chords", quizNaturals: "no", quizDirection: "sideways" }));
    check("settings: and refused when wrong", quizBad.quizKind === "note" && quizBad.quizNaturals === false && quizBad.quizDirection === "up");
    // 2.4.0: chords and progressions by ear.
    equal("quiz: a chord to hear", JSON.stringify(M.quizQuality("triads", "", fixed(0, 0))), JSON.stringify({ id: "major", root: "C", name: "C", midis: [48, 52, 55] }));
    equal("quiz: a chord's root from C3 to B3, spelled plainly", M.quizQuality("sevenths", "", fixed(0.2, 0.25)).name, "E♭7");
    const sets = set => [...new Set(Array.from({ length: 60 }, (_, at) => M.quizQuality(set, "", fixed(at / 60, 0.5)).id))].sort().join();
    equal("quiz: triads", sets("triads"), "augmented,diminished,major,minor,sus2,sus4");
    equal("quiz: sevenths", sets("sevenths"), "dim7,dom7,m7,m7b5,mMaj7,maj7");
    equal("quiz: both", sets("both").split(",").length, 12);
    check("quiz: never the same quality twice running", M.QUIZ_QUALITIES.filter(quality => quality.set === "triads").every((quality, at) => M.quizQuality("triads", quality.id, fixed(at / 6, at / 6, 0)).id !== quality.id));
    const unnamed = M.QUIZ_QUALITIES.filter(quality => M.findChords(quality.semis.map(semis => 48 + semis))[0]?.name !== `C${quality.suffix}`).map(quality => quality.id);
    equal("quiz: each quality is the chord Maestro names from its notes", unnamed.join(), "");
    equal("quiz: a progression to hear", JSON.stringify(M.quizProgression("triads", -1, fixed(0, 0))), JSON.stringify({ key: "C", size: 3, index: 0, degrees: [0, 3, 4, 0], chords: ["C", "F", "G", "C"], numerals: ["I", "ii", "iii", "IV", "V", "vi", "vii°"] }));
    equal("quiz: in sevenths, in G", M.quizProgression("sevenths", -1, fixed(1 / 13 + 0.001, 1 / 8 + 0.001)).chords.join(" "), "Gmaj7 D7 Em7 Cmaj7");
    check("quiz: every progression is four chords from I", M.QUIZ_PROGRESSIONS.every(degrees => degrees.length === 4 && degrees[0] === 0 && degrees.every(degree => degree >= 0 && degree < 7)));
    check("quiz: never the same progression twice running", M.QUIZ_PROGRESSIONS.every((_, at) => M.quizProgression("triads", at, fixed(at / M.QUIZ_PROGRESSIONS.length + 0.001, 0)).index !== at));
    const chordsKept = M.parseSettings(JSON.stringify({ quizKind: "progression", quizChords: "sevenths" }));
    check("settings: the new quizzes and their chords are kept", chordsKept.quizKind === "progression" && chordsKept.quizChords === "sevenths" && M.parseSettings(JSON.stringify({ quizKind: "quality", quizChords: "ninths" })).quizChords === "triads");
    const practice = M.parseSettings(JSON.stringify({ sevenths: true, capo: 3, lefty: true }));
    check("settings: sevenths, the capo and the hand are kept", practice.sevenths === true && practice.capo === 3 && practice.lefty === true);
    const badPractice = M.parseSettings(JSON.stringify({ sevenths: "yes", capo: 12, lefty: 1 }));
    check("settings: and refused when wrong", badPractice.sevenths === false && badPractice.capo === 0 && badPractice.lefty === false);

    equal("pitch names: low E", M.pitchName(40), "E2");
    equal("pitch names: middle C", M.pitchName(60), "C4");
    equal("pitch names: flats when asked", M.pitchName(70, true), `B${FLAT}4`);
    equal("A4 is 440 Hz", M.frequency(69), 440);
    equal("A4 can be 442", M.frequency(69, 442), 442);
    equal("low E", Math.round(M.frequency(40) * 100) / 100, 82.41);
    equal("tuning notes", M.tuningNotes(M.INSTRUMENTS.guitar.tunings[0]), "E A D G B E");
    equal("a flat tuning's notes", M.tuningNotes(M.INSTRUMENTS.guitar.tunings.find(tuning => tuning.id === "halfDown")), `E${FLAT} A${FLAT} D${FLAT} G${FLAT} B${FLAT} E${FLAT}`);
    check("every stringed tuning is in range", M.STRINGED.every(id => M.INSTRUMENTS[id].tunings.every(tuning => tuning.pitches.every(midi => midi >= M.LOWEST && midi <= M.HIGHEST))));

    // The plucked string's pitch is exact, to a hundredth of a cent, for every open string.
    const rate = 48000;
    const cents = (a, b) => 1200 * Math.log2(a / b);
    const worst = Math.max(...M.STRINGED.flatMap(id => M.INSTRUMENTS[id].tunings.flatMap(tuning => tuning.pitches)).map(midi => {
        const hz = M.frequency(midi);
        const { length, playbackRate } = M.pluckPeriod(hz, rate);
        return Math.abs(cents(rate / (length + 0.5) * playbackRate, hz));
    }));
    check("a plucked string's pitch is exact", worst < 0.01);
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const samples = M.pluckSamples(110, rate, 1, random);
    equal("a pluck lasts as long as asked", samples.length, rate);
    const level = (from, to) => Math.max(...[...samples.slice(from, to)].map(Math.abs));
    check("it starts loud and dies away", level(0, 2000) > 0.4 && level(30000, 40000) < level(0, 2000) && samples.at(-1) === 0);
    check("and never clips", level(0, samples.length) <= 0.6 + 1e-6);

    equal("own tuning: kept", JSON.stringify(M.cleanOwnTuning({ id: "own-abc1", name: " Open C ", instrument: "guitar", pitches: [36, 43, 48, 55, 60, 64] })), JSON.stringify({ id: "own-abc1", name: "Open C", instrument: "guitar", pitches: [36, 43, 48, 55, 60, 64], own: true }));
    equal("own tuning: no name", M.cleanOwnTuning({ id: "own-a", name: "  ", instrument: "guitar", pitches: [40, 45, 50, 55, 59, 64] }), null);
    equal("own tuning: a name too long", M.cleanOwnTuning({ id: "own-a", name: "x".repeat(41), instrument: "guitar", pitches: [40, 45, 50, 55, 59, 64] }), null);
    equal("own tuning: hidden characters go", M.cleanOwnTuning({ id: "own-a", name: `Open${String.fromCharCode(0x200B)} D${String.fromCharCode(7)}`, instrument: "guitar", pitches: [38, 45, 50, 54, 57, 62] })?.name, "Open D");
    equal("own tuning: not for the keyboard", M.cleanOwnTuning({ id: "own-a", name: "Keys", instrument: "keyboard", pitches: [40, 45, 50, 55] }), null);
    equal("own tuning: too few strings", M.cleanOwnTuning({ id: "own-a", name: "Three", instrument: "guitar", pitches: [40, 45, 50] }), null);
    equal("own tuning: a pitch out of range", M.cleanOwnTuning({ id: "own-a", name: "Low", instrument: "bass", pitches: [10, 33, 38, 43] }), null);
    equal("own tuning: a fraction isn't a pitch", M.cleanOwnTuning({ id: "own-a", name: "Odd", instrument: "bass", pitches: [28.5, 33, 38, 43] }), null);
    equal("own tuning: a made-up id", M.cleanOwnTuning({ id: "standard", name: "Fake", instrument: "guitar", pitches: [40, 45, 50, 55, 59, 64] }), null);

    const fresh = M.parseSettings(null);
    check("settings: nothing kept gives the defaults", fresh.instrument === "guitar" && fresh.root === "G" && fresh.scale === "major" && fresh.labels === "names" && fresh.tab === "scales" && fresh.tone === "pluck" && fresh.a4 === 440 && fresh.own.length === 0);
    equal("settings: the default tuning is standard", M.currentTuning(fresh).id, "standard");
    const own = { id: "own-x1", name: "Mine", instrument: "guitar", pitches: [36, 43, 48, 55, 60, 64] };
    const kept = M.parseSettings(JSON.stringify({ instrument: "guitar", tunings: { guitar: "own-x1", bass: "five", ukulele: "nope" }, own: [own, own, { junk: 1 }], root: `B${FLAT}`, scale: "dorian", labels: "degrees", degreeStyle: "interval", tab: "tuning", tone: "steady", a4: 442 }));
    check("settings: what was kept is read", kept.root === `B${FLAT}` && kept.scale === "dorian" && kept.labels === "degrees" && kept.degreeStyle === "interval" && kept.tab === "tuning" && kept.tone === "steady" && kept.a4 === 442);
    const older = M.parseSettings(JSON.stringify({ labels: "intervals" }));
    check("settings: Intervals, kept before 2.3.0's Degrees took both, reads as degrees written m7", older.labels === "degrees" && older.degreeStyle === "interval");
    equal("settings: degrees are written as flats unless chosen", M.parseSettings(null).degreeStyle, "flat");
    equal("settings: an unknown degree style falls back", M.parseSettings(JSON.stringify({ degreeStyle: "roman" })).degreeStyle, "flat");
    check("settings: own tunings once each, junk dropped", kept.own.length === 1 && kept.own[0].name === "Mine");
    check("settings: chosen tunings that exist", kept.tunings.guitar === "own-x1" && kept.tunings.bass === "five" && !("ukulele" in kept.tunings));
    equal("settings: the chosen own tuning is current", M.currentTuning(kept).name, "Mine");
    equal("settings: the chord style is kept", M.parseSettings(JSON.stringify({ chordStyle: "signs", tab: "chords" })).chordStyle, "signs");
    equal("settings: the Chords tab is kept", M.parseSettings(JSON.stringify({ tab: "chords" })).tab, "chords");
    equal("settings: an unknown chord style falls back to letters", M.parseSettings(JSON.stringify({ chordStyle: "runes" })).chordStyle, "letters");
    const wrong = M.parseSettings(JSON.stringify({ instrument: "__proto__", root: "H", scale: "constructor", labels: 5, tab: "melody", tone: "loud", a4: 1000, own: "lots" }));
    check("settings: each wrong value falls back alone", wrong.instrument === "guitar" && wrong.root === "G" && wrong.scale === "major" && wrong.labels === "names" && wrong.tab === "scales" && wrong.tone === "pluck" && wrong.a4 === 440 && wrong.own.length === 0);
    const many = Array.from({ length: 60 }, (_, index) => ({ ...own, id: `own-n${index}` }));
    equal("settings: own tunings are capped", M.parseSettings(JSON.stringify({ own: many })).own.length, M.OWN_MAX);
    equal("the keyboard has no tuning", M.currentTuning({ ...fresh, instrument: "keyboard" }), null);
})();

// ---- Chord symbols, the staff and saved chords (2.3.0)
(() => {
    const M = MaestroMusic;
    const { check, equal } = globalThis.TestHarness;
    const flat = "\u266D", sharp = "\u266F";
    const parts = (name, style) => M.chordSymbolParts(name, style);
    // Every kind the Finder names, and every chord in every key, is written as a symbol.
    const unwritten = [];
    for (const [suffix] of M.CHORD_KINDS) for (const style of ["letters", "signs"]) if (!parts(`C${suffix}`, style)) unwritten.push(`${suffix} (${style})`);
    for (const root of M.ROOTS) for (const scale of Object.keys(M.SCALES)) for (const size of [3, 4]) {
        for (const chord of M.chordsInKey(root, scale, size)) if (!parts(chord.name, "letters") || !parts(chord.name, "signs")) unwritten.push(chord.name);
    }
    const unspelled = [];
    for (const root of M.ROOTS) for (const scale of Object.keys(M.SCALES)) {
        if (M.scaleNotes(root, scale).some(note => !M.parseName(note.name))) unspelled.push(`${root} ${scale}`);
    }
    equal("spelling: every note of every key has a name, a triple sharp or flat written plainly", unspelled.join(", "), "");
    equal("symbols: every chord kind and every chord in a key can be written", [...new Set(unwritten)].join(", "), "");
    const cm7 = parts("Cm7", "letters");
    check("symbols: Cm7 in letters, m beside the root and 7 raised", cm7.letter === "C" && cm7.q === "m" && cm7.sup === "7" && !cm7.stack && !cm7.alterations);
    equal("symbols: Cm7 in signs, the minor sign", parts("Cm7", "signs").q, "\uE874");
    const half = parts(`Cm7${flat}5`, "signs");
    check("symbols: Cm7\u266D5 in signs is half-diminished, the sign level and 7 raised", half.q === "\uE871" && half.sup === "7");
    equal("symbols: Cm7\u266D5 in letters", parts(`Cm7${flat}5`, "letters").sup, `7${flat}5`);
    check("symbols: Cmaj7 in letters, maj level as m is, 7 raised", parts("Cmaj7", "letters").q === "maj" && parts("Cmaj7", "letters").sup === "7");
    check("symbols: Cmaj7 in signs, the triangle level", parts("Cmaj7", "signs").q === "\uE873" && parts("Cmaj7", "signs").sup === "7");
    check("symbols: C\u00B07, the diminished sign level", parts("C\u00B07", "letters").q === "\uE870" && parts("C\u00B07", "letters").sup === "7");
    check("symbols: C+maj7, both qualities level", parts("C+maj7", "letters").q === "\uE872maj" && parts("C+maj7", "letters").sup === "7");
    check("symbols: Cm(maj7), the bracket an addition and raised; in signs both signs level", parts("Cm(maj7)", "letters").sup === "(maj7)" && parts("Cm(maj7)", "signs").q === "\uE874\uE873");
    check("symbols: sus4 and add9 go with their numbers, raised", parts("Csus4").sup === "sus4" && parts("C7sus4").sup === "7sus4" && parts("Cadd9").sup === "add9" && !parts("Csus4").q);
    // The rule, for every kind in both styles: nothing raised outside brackets
    // is a quality, and nothing level is a number.
    const misplaced = [];
    for (const [suffix] of M.CHORD_KINDS) for (const style of ["letters", "signs"]) {
        const each = parts(`C${suffix}`, style);
        const open = (each.sup || "").replace(/\([^)]*\)/g, "");
        if (/^m|maj|\u00B0|\+|[\uE870-\uE874]/.test(open) || /[0-9]/.test(each.q)) misplaced.push(`${suffix} (${style})`);
    }
    equal("symbols: one rule, qualities level and numbers raised, for every kind", misplaced.join(", "), "");
    equal("symbols: 6/9 is a 6 over a 9", JSON.stringify(parts("C6/9").stack), JSON.stringify(["6", "9"]));
    const altered = parts(`G7(${sharp}5,${flat}9)`);
    check("symbols: two alterations, listed lowest first", altered.sup === "7" && altered.alterations.join() === `${sharp}5,${flat}9`);
    check("symbols: one alteration is raised with the 7", parts(`G7${flat}9`).sup === `7${flat}9` && !parts(`G7${flat}9`).alterations);
    const slash = parts(`B${flat}maj7/D`);
    check("symbols: an accidental on the root, and a bass after a slash", slash.letter === "B" && slash.accidental === flat && slash.q === "maj" && slash.sup === "7" && slash.bass === "D");
    const rare = parts(`Cm${sharp}5`, "signs");
    check("symbols: a rarer chord, m\u266F5, keeps its quality and raises the rest", rare.q === "\uE874" && rare.sup === `${sharp}5`);
    check("symbols: \u00B0(maj7) in signs, the sign level and the bracket raised", parts("C\u00B0(maj7)", "signs").q === "\uE870" && parts("C\u00B0(maj7)", "signs").sup === "(\uE8737)");
    equal("symbols: a bass with an accidental", parts(`C/B${flat}`).bass, `B${flat}`);
    // Every altered dominant the Finder can name is written.
    const notWritten = [];
    for (let mask = 0; mask < 64; mask++) {
        const extra = [1, 2, 3, 6, 8, 9].filter((_, bit) => mask & (1 << bit));
        for (const withFifth of [false, true]) {
            const chord = M.alteredDominant(0, new Set([0, 4, 10, ...(withFifth ? [7] : []), ...extra]));
            if (chord && !parts(`C${chord.suffix}`)) notWritten.push(chord.suffix);
        }
    }
    equal("symbols: every altered dominant is written", notWritten.join(", "), "");
    for (const name of ["Cmaj7(no3)", "H7", "C__proto__", "Cconstructor", "Cm7 ", "", "C7(#5,b9)", "Cmajor"]) equal(`symbols: "${name}" is left as typed`, parts(name), null);

    equal("names: flats and sharps typed as b and #", M.cleanChordName("Bb7"), `B${flat}7`);
    equal("names: F#m7b5", M.cleanChordName("F#m7b5"), `F${sharp}m7${flat}5`);
    equal("names: altered, in brackets", M.cleanChordName("G7(#5,b9)"), `G7(${sharp}5,${flat}9)`);
    equal("names: a flat bass", M.cleanChordName("C/Bb"), `C/B${flat}`);
    equal("names: Absus4", M.cleanChordName("Absus4"), `A${flat}sus4`);
    equal("names: add9 keeps its letters", M.cleanChordName("Cadd9"), "Cadd9");
    equal("names: spaces closed up", M.cleanChordName("  C   maj7  "), "C maj7");
    equal("names: control characters and quotes dropped", M.cleanChordName('C"7\u0007\tx'), "C7x");
    equal("names: at most 32 characters", M.cleanChordName("C".repeat(40)).length, 32);
    equal("names: nothing left", M.cleanChordName("  "), "");

    const step = (midi, name) => JSON.stringify(M.staffStep(midi, name));
    equal("staff: middle C", step(60, "C"), JSON.stringify({ step: 28, alter: 0 }));
    equal("staff: B\u266F3 is a B, sounding as C4", step(60, `B${sharp}`), JSON.stringify({ step: 27, alter: 1 }));
    equal("staff: C\u266D5 is a C, sounding as B4", step(71, `C${flat}`), JSON.stringify({ step: 35, alter: -1 }));
    equal("staff: F double sharp", step(67, "F\u{1D12A}"), JSON.stringify({ step: 31, alter: 2 }));
    const written = list => list.map(([midi, name]) => M.staffStep(midi + 12, name));
    // An open C on guitar, written an octave up: C4 to E5.
    const openC = M.staffChord(written([[48, "C"], [52, "E"], [55, "G"], [60, "C"], [64, "E"]]), M.STAFF_BOTTOM.treble);
    equal("staff: an open C's positions", openC.heads.map(head => head.position).join(), "-2,0,2,5,7");
    check("staff: middle C has its ledger line, and nothing is marked", openC.ledgers.join() === "-2" && openC.columns === 0 && openC.heads.every(head => !head.right && head.column < 0));
    const second = M.staffChord(written([[55, "G"], [57, "A"]]), M.STAFF_BOTTOM.treble);
    check("staff: the upper note of a second sits to the right", !second.heads[0].right && second.heads[1].right);
    const alteredStaff = M.staffChord(written([[43, "G"], [53, "F"], [59, "B"], [63, `D${sharp}`], [68, `A${flat}`]]), M.STAFF_BOTTOM.treble);
    equal("staff: G7(\u266F5,\u266D9)'s positions", alteredStaff.heads.map(head => head.position).join(), "-5,1,4,6,10");
    check("staff: accidentals a fourth apart take two columns, the higher nearest", alteredStaff.columns === 2 && alteredStaff.heads.find(head => head.position === 10).column === 0 && alteredStaff.heads.find(head => head.position === 6).column === 1);
    equal("staff: ledger lines below and above", alteredStaff.ledgers.join(), "-2,-4,10");
    const both = M.staffChord(written([[53, "F"], [66, `F${sharp}`]]), M.STAFF_BOTTOM.treble);
    check("staff: an F beside an F\u266F gets a natural", both.heads.every(head => head.column >= 0) && both.heads[0].alter === 0);
    equal("staff: a unison is written once", M.staffChord(written([[64, "E"], [64, "E"]]), M.STAFF_BOTTOM.treble).heads.length, 1);
    equal("staff: the bass staff's bottom line is G2", M.staffChord([M.staffStep(43, "G")], M.STAFF_BOTTOM.bass).heads[0].position, 0);

    const guitar = [40, 45, 50, 55, 59, 64];
    const good = M.cleanSavedChord({ name: " G7(#5,b9) ", instrument: "guitar", tuning: guitar, shape: [3, null, 3, 4, 4, 4] });
    check("saved: a guitar chord, its name tidied", good?.name === `G7(${sharp}5,${flat}9)` && good.shape[1] === null);
    equal("saved: its line for AHK, the label last", M.savedChordLine(good), `G7(${sharp}5,${flat}9)\u0009guitar\u000940 45 50 55 59 64\u00093 x 3 4 4 4\u0009`);
    const labeled = M.cleanSavedChord({ name: "E7#9", label: ' Hendrix "chord"\u0007 ', instrument: "guitar", tuning: guitar, shape: [0, 7, 6, 7, 8, null] });
    check("saved: a name and a label, both tidied", labeled?.name === `E7${sharp}9` && labeled.label === "Hendrix chord");
    const old = M.cleanSavedChord({ name: "G7 alt", instrument: "guitar", tuning: guitar, shape: [3, null, 3, 4, 4, 4] });
    check("saved: a name from before 2.4.0 that isn't a symbol becomes the label", old?.name === "" && old.label === "G7 alt");
    check("saved: and with a label already, it's dropped", M.cleanSavedChord({ name: "G7 alt", label: "Mine", instrument: "guitar", tuning: guitar, shape: [3, null, 3, 4, 4, 4] })?.label === "Mine");
    check("saved: a label alone is enough", M.cleanSavedChord({ name: "", label: "Drone", instrument: "keyboard", tuning: [], shape: [48] })?.label === "Drone");
    equal("labels: at most 40 units, a pair never split", M.cleanChordLabel(`${"a".repeat(39)}\u{1F3B8}`), "a".repeat(39));
    equal("labels: invisible characters dropped", M.cleanChordLabel("a\u200Bb\u202Ec"), "abc");
    check("names: chord symbols are names", M.isChordName(`E7${sharp}9`) && M.isChordName("C/E") && M.isChordName(`B${flat}maj7`) && M.isChordName("C6/9"));
    check("names: words aren't", !M.isChordName("Hendrix") && !M.isChordName("G7 alt") && !M.isChordName("E7#9") && !M.isChordName(""));
    equal("saved: its notes, low to high", M.savedChordNotes(good).join(), "43,53,59,63,68");
    check("saved: a keyboard chord", M.cleanSavedChord({ name: "C", instrument: "keyboard", tuning: [], shape: [48, 52, 55] })?.shape.join() === "48,52,55");
    const bad = [
        { name: "", instrument: "guitar", tuning: guitar, shape: [null, 3, 2, 0, 1, 0] },
        { name: "C", instrument: "__proto__", tuning: guitar, shape: [null, 3, 2, 0, 1, 0] },
        { name: "C", instrument: "guitar", tuning: guitar, shape: [null, 3, 2, 0, 1] },
        { name: "C", instrument: "guitar", tuning: guitar, shape: [null, 25, 2, 0, 1, 0] },
        { name: "C", instrument: "guitar", tuning: guitar, shape: [null, null, null, null, null, null] },
        { name: "C", instrument: "guitar", tuning: [40, 45, 50], shape: [null, 3, 2] },
        { name: "C", instrument: "guitar", tuning: [40, 45, 50, 55, 59, 200], shape: [null, 3, 2, 0, 1, 0] },
        { name: "C", instrument: "guitar", tuning: guitar, shape: [null, "3", 2, 0, 1, 0] },
        { name: "C", instrument: "keyboard", tuning: [], shape: [55, 52, 48] },
        { name: "C", instrument: "keyboard", tuning: [40], shape: [48] },
        { name: "C", instrument: "keyboard", tuning: [], shape: [10] },
        { name: "C", instrument: "keyboard", tuning: [], shape: [] },
        null, "C", []
    ];
    equal("saved: malformed chords are refused", bad.map(M.cleanSavedChord).filter(Boolean).length, 0);
    equal("shape start: an open shape at the nut", M.shapeStart([null, 3, 2, 0, 1, 0], 15), 1);
    equal("shape start: up to fret 5 starts at the nut", M.shapeStart([3, null, 3, 4, 4, 4], 15), 1);
    equal("shape start: higher, at its lowest fret", M.shapeStart([null, 7, 6, 7, 8, null], 15), 6);
    equal("shape start: kept on the neck", M.shapeStart([null, 15, 15, 14, 15, null], 15), 11);
})();
