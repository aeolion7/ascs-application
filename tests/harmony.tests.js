// Harmony (2.4.0): chords in a key, numerals, moving and fitting, other
// chords to try, voicings and charts.
(() => {
    const H = globalThis.MaestroHarmony;
    const M = globalThis.MaestroMusic;
    const { check, equal } = globalThis.TestHarness;
    const flat = "\u266D", sharp = "\u266F";
    const C = { root: "C", scale: "major" }, G = { root: "G", scale: "major" }, Am = { root: "A", scale: "minor" };
    const names = list => list.map(tone => tone.name).join(" ");

    // Every chord Maestro names can be read.
    const unread = [];
    for (const [suffix] of M.CHORD_KINDS) if (!H.parseChord(`C${suffix}`)) unread.push(suffix);
    for (const root of M.ROOTS) for (const scale of Object.keys(M.SCALES)) for (const size of [3, 4]) {
        for (const chord of M.chordsInKey(root, scale, size)) if (!H.parseChord(chord.name)) unread.push(chord.name);
    }
    equal("chords: every kind, and every chord in every key, can be read", [...new Set(unread)].join(", "), "");
    // Every altered dominant the Finder names, read back to the same notes.
    const wrong = [];
    for (let mask = 0; mask < 64; mask++) {
        const extra = [1, 2, 3, 6, 8, 9].filter((_, bit) => mask & (1 << bit));
        for (const fifth of [false, true]) {
            const want = new Set([0, 4, 10, ...(fifth ? [7] : []), ...extra]);
            const found = M.alteredDominant(0, want);
            if (!found) continue;
            const pcs = new Set(H.chordTones(`C${found.suffix}`).map(tone => tone.pc));
            // A name doesn't say whether a plain fifth or ninth sounds, so either may differ.
            if (![...want].every(pc => pcs.has(pc) || pc === 2 || pc === 7) || ![...pcs].every(pc => want.has(pc) || pc === 2 || pc === 7)) wrong.push(found.suffix);
        }
    }
    equal("chords: every altered dominant reads back to its notes, and no others", wrong.join(", "), "");
    equal("tones: G7(\u266F5,\u266D9), spelled from G", names(H.chordTones(`G7(${sharp}5,${flat}9)`)), `G B D${sharp} F A${flat}`);
    equal("tones: G7(\u266D9,\u266D13) keeps its fifth", names(H.chordTones(`G7(${flat}9,${flat}13)`)), `G B D F A${flat} E${flat}`);
    equal("tones: C13 leaves out its eleventh", names(H.chordTones("C13")), `C E G B${flat} D A`);
    equal("tones: C11 leaves out its third", names(H.chordTones("C11")), `C G B${flat} D F`);
    equal("tones: a slash chord's bass first", names(H.chordTones("C/E")), "E C G");
    equal("tones: a bass outside the chord", names(H.chordTones("C/D")), "D C E G");
    equal("tones: a free name has none", H.chordTones("Cmaj7(no3)").length, 0);
    equal("parse: junk", H.parseChord("H7"), null);

    // Numerals.
    const numerals = (list, key) => list.map(name => H.romanNumeral(name, key)).join(" ");
    equal("numerals: in C major", numerals(["C", "Dm", "Em7", "F", "G7", "Am", `Bm7${flat}5`, "B\u00B0"], C), "I ii iii7 IV V7 vi vii\u00F87 vii\u00B0");
    equal("numerals: borrowed and flat-side chords", numerals([`B${flat}`, `A${flat}`, "Fm", `E${flat}`], C), `${flat}VII ${flat}VI iv ${flat}III`);
    equal("numerals: secondary dominants", numerals(["A7", "D7", "E7", "C7", "D"], C), "V7/ii V7/V V7/vi V7/IV V/V");
    equal("numerals: inversions", numerals(["C/E", "G7/B", "C/G"], C), "I/3 V7/3 I/5");
    equal("numerals: in A minor", numerals(["Am", "Dm", "E7", "G", "F", `Bm7${flat}5`], Am), "i iv V7 VII VI ii\u00F87");
    equal("numerals: a bad key", H.romanNumeral("C", { root: "H", scale: "major" }), "");
    equal("Nashville: in G", ["G", "Em7", "C", `D/F${sharp}`, "F", "Am"].map(name => H.nashville(name, G)).join(" "), `1 6m7 4 5/7 ${flat}7 2m`);
    const fromNumeral = (list, key) => list.map(text => H.chordFromNumeral(text, key)).join(" ");
    equal("numerals read back: in G", fromNumeral(["V7", "ii", "vii\u00F87", "bVII", "V7/V", "iv", "IVmaj7", "vii\u00B07", "I"], G), `D7 Am F${sharp}m7${flat}5 F A7 Cm Cmaj7 F${sharp}\u00B07 G`);
    equal("numerals read back: i(maj7) in A minor", H.chordFromNumeral("imaj7", Am), "Am(maj7)");
    equal("numerals read back: junk", H.chordFromNumeral("X7", G), null);
    const roundTrip = [];
    for (const root of ["C", "G", `E${flat}`, `F${sharp}`, "A"]) for (const scale of ["major", "minor", "harmonic", "dorian"]) for (const size of [3, 4]) {
        for (const chord of M.chordsInKey(root, scale, size)) {
            const back = H.chordFromNumeral(H.romanNumeral(chord.name, { root, scale }), { root, scale });
            if (back !== chord.name) roundTrip.push(`${root} ${scale}: ${chord.name} > ${H.romanNumeral(chord.name, { root, scale })} > ${back}`);
        }
    }
    equal("numerals: every chord in common keys reads back to itself", roundTrip.join("; "), "");

    // Moving and fitting.
    equal("transpose: G7 from C to E\u266D", H.transposeChord("G7", "C", `E${flat}`), `B${flat}7`);
    equal("transpose: a slash chord", H.transposeChord("C/E", "C", "D"), `D/F${sharp}`);
    equal("transpose: half-diminished down a step", H.transposeChord(`F${sharp}m7${flat}5`, "C", `B${flat}`), `Em7${flat}5`);
    equal("transpose: junk", H.transposeChord("H", "C", "D"), null);
    const capo = H.capoOptions([`E${flat}`, `B${flat}`, "Cm", `A${flat}`]);
    check("capo: E\u266D B\u266D Cm A\u266D is best at the 1st fret, as D A Bm G", capo[0].capo === 1 && capo[0].shapes.join(" ") === "D A Bm G" && capo[0].open === 3);
    equal("capo: nothing to fit", H.capoOptions([]).length, 0);
    const dm7 = H.scalesForChord("Dm7", C);
    check("chord scales: Dm7 in C is D Dorian first, in the key", dm7[0].scale === "dorian" && dm7[0].root === "D" && dm7[0].inKey);
    equal("chord scales: G7 in C is G Mixolydian first", H.scalesForChord("G7", C)[0].scale, "mixolydian");
    const alteredScales = H.scalesForChord(`G7(${sharp}5,${flat}9)`, C);
    check("chord scales: an altered dominant, none in the key, the altered scale among them", alteredScales.length > 0 && alteredScales.every(each => !each.inKey) && alteredScales.some(each => each.scale === "altered"));
    const guide = H.guideTones(["Dm7", "G7", "Cmaj7"]);
    equal("guide tones: ii-V-I's two lines, moving by step or not at all", guide.map(each => `${each.a}${each.b}`).join(" "), "FC FB EB");
    equal("guide tones: skip what can't be read", H.guideTones(["?", "C"]).length, 1);

    // Other chords to try.
    const kinds = ideas => ideas.map(idea => `${idea.kind}:${idea.chords.join("+")}`).join(" ");
    const onV = H.reharmonize(["Cmaj7", "G7", "Cmaj7"], 1, C);
    check("reharmonize: G7 going home offers its tritone substitute, a ii-V and the backdoor", kinds(onV).includes(`tritone:D${flat}7`) && kinds(onV).includes("two-five:Dm7+G7") && kinds(onV).includes(`backdoor:B${flat}7`));
    check("reharmonize: nothing offered is the chord itself", onV.every(idea => !(idea.chords.length === 1 && idea.chords[0] === "G7")));
    check("reharmonize: a whole step up takes a passing diminished", kinds(H.reharmonize(["C", "Dm"], 0, C)).includes(`passing:C+C${sharp}\u00B07`));
    check("reharmonize: IV borrows iv from C minor", kinds(H.reharmonize(["F", "C"], 0, C)).includes("borrowed:Fm"));
    check("reharmonize: I shares two notes with vi and iii", kinds(H.reharmonize(["C"], 0, C)).includes("relative:Am") && kinds(H.reharmonize(["C"], 0, C)).includes("relative:Em"));
    check("reharmonize: a ii-V into a minor chord is half-diminished", kinds(H.reharmonize(["C", "Am"], 0, C)).includes(`two-five:Bm7${flat}5+E7`));
    equal("reharmonize: junk", H.reharmonize(["H"], 0, C).length, 0);

    // Voicings.
    const c = H.voiceChord("C");
    equal("voicing: C, its root in the bass and the rest close above E3", c.join(), "48,52,55,60");
    equal("voicing: F moves as little as it can from C", H.voiceChord("F", c).join(), "41,53,57,60");
    equal("voicing: a slash chord's bass is lowest", H.voiceChord("C/E")[0] % 12, 4);
    equal("voicing: from an instrument's lowest note, a mandolin's G3 (2.7.0)", H.voiceChord("C", null, 55).join(), "60,67,72,76");

    // Charts.
    const chart = { title: "Tune", root: "C", scale: "major", beats: 4, sections: [{ name: "A", repeat: 2, bars: [["C"], ["F", "G"], ["%"]] }, { name: "B", bars: [["Am", "Dm", "G7"]] }] };
    const clean = H.cleanChart(chart);
    check("charts: a chart is kept, a missing repeat read as once", clean?.sections[1].repeat === 1 && clean.sections[0].bars[2][0] === "%");
    const timeline = H.chartTimeline(clean);
    equal("charts: played in order, repeated, % filled in", timeline.map(event => `${event.chord}@${event.start}`).join(" "), "C@0 F@4 G@6 F@8 G@10 C@12 F@16 G@18 F@20 G@22 Am@24 Dm@26 G7@27");
    equal("charts: three chords in four beats share them 2, 1, 1", timeline.slice(-3).map(event => event.beats).join(), "2,1,1");
    equal("charts: bars counted", timeline.at(-1).bar, 6);
    equal("charts: each event knows its written bar and place in it; % lights its own bar", timeline.slice(0, 6).map(event => `${event.section}.${event.written}.${event.slot}`).join(" "), "0.0.0 0.1.0 0.1.1 0.2.0 0.2.1 0.0.0");
    const moved = H.transposeChart(clean, "D");
    equal("charts: moved to D", moved.sections.flatMap(section => section.bars.flat()).join(" "), "D G A % Bm Em A7");
    const bad = [
        { ...chart, title: " " }, { ...chart, root: "H" }, { ...chart, scale: "blues" }, { ...chart, beats: 0 }, { ...chart, beats: 13 },
        { ...chart, sections: [] }, { ...chart, sections: Array.from({ length: 13 }, () => ({ name: "A", bars: [["C"]] })) },
        { ...chart, sections: [{ name: "A", bars: [["C", "D", "E", "F", "G"]] }] }, { ...chart, sections: [{ name: "A", bars: [["%"]] }] },
        { ...chart, sections: [{ name: "A", bars: [["C"], ["%", "D"]] }] }, { ...chart, sections: [{ name: "A", repeat: 9, bars: [["C"]] }] },
        { ...chart, sections: [{ name: "A", bars: [[""]] }] }, { ...chart, sections: Array.from({ length: 5 }, () => ({ name: "A", bars: Array.from({ length: 60 }, () => ["C"]) })) },
        null, [], "chart"
    ];
    equal("charts: malformed ones are refused", bad.map(H.cleanChart).filter(Boolean).length, 0);
    equal("charts: a title is tidied", H.cleanChart({ ...chart, title: ' My "tune"\u0007 ' }).title, "My tune");
    equal("charts: a chord that isn't a symbol is refused", H.cleanChart({ ...chart, sections: [{ name: "A", bars: [["Hendrix"]] }] }), null);
    const waltz = H.cleanChart({ ...chart, meter: "3/4" });
    check("charts: a time signature sets the beats", waltz?.meter === "3/4" && waltz.beats === 3 && H.cleanChart({ ...chart, meter: "7/8:3+2+2" })?.beats === 7);
    equal("charts: an unknown time signature is refused", H.cleanChart({ ...chart, meter: "5/3" }), null);
    const text = H.chartText(waltz);
    equal("charts: as text, the format, the heading, a line a section", text.split("\n").slice(0, 3).join("|"), `Maestro chart 1|Tune\tC\tmajor\t3/4|A\t2\tC\tF G\t%`);
    equal("charts: read back the same", JSON.stringify(H.readChartText(text)), JSON.stringify(waltz));
    equal("charts: read with Windows line breaks", JSON.stringify(H.readChartText(text.replace(/\n/g, "\r\n"))), JSON.stringify(waltz));
    const unreadable = ["", "Maestro chart 3\nT\tC\tmajor\t4/4\nA\t1\tC", "Maestro chart 1\nT\tC\tmajor\nA\t1\tC", "Maestro chart 1\nT\tC\tmajor\t4/4\nA\t9\tC",
        "Maestro chart 1\nT\tC\tmajor\t4/4\nA\t1\tC  D", "Maestro chart 1\nT\tC\tmajor\t4/4\nA\t1", "Maestro chart 1\nT\tC\tmajor\t4/4", null];
    equal("charts: malformed text is refused", unreadable.map(H.readChartText).filter(Boolean).length, 0);

    // 2.4.0: keys, the circle of fifths and pivot chords.
    equal("circle: twelve keys clockwise from C, each with its relative minor", H.CIRCLE.map(each => `${each.major}/${each.minor}m`).join(" "), "C/Am G/Em D/Bm A/F♯m E/C♯m B/G♯m G♭/E♭m D♭/B♭m A♭/Fm E♭/Cm B♭/Gm F/Dm");
    equal("circle: signatures, sharps then flats", H.CIRCLE.map(each => each.signature).join(" "), " 1♯ 2♯ 3♯ 4♯ 5♯ 6♭ 5♭ 4♭ 3♭ 2♭ 1♭");
    const place = (root, scale) => JSON.stringify(H.circlePlace({ root, scale }));
    equal("circle: C major and A minor share a place, on their rings", `${place("C", "major")} ${place("A", "minor")}`, '{"index":0,"ring":"major"} {"index":0,"ring":"minor"}');
    equal("circle: F♯ minor sits with A, E♭ major at 3 flats", `${place("F♯", "minor")} ${place("E♭", "major")}`, '{"index":3,"ring":"minor"} {"index":9,"ring":"major"}');
    equal("circle: D dorian sits with C, on neither ring", place("D", "dorian"), '{"index":0,"ring":null}');
    equal("circle: A harmonic minor sits by its root, on the minor ring", place("A", "harmonic"), '{"index":0,"ring":"minor"}');
    const onCircle = name => { const at = H.chordOnCircle(name); return at ? `${at.index}${at.ring[1]}` : "-"; };
    equal("circle: chords by root and third; diminished, suspended and altered fifths have none", ["G7", "Dm7", "E7♯9", "Cmaj7", "Bm7♭5", "Csus4", "C+", "F♯m"].map(onCircle).join(" "), "1a 11i 4a 0a - - - 3i");
    const found = names => H.findKey(names).map(each => `${each.root} ${each.scale} ${each.fits}/${each.total}${each.outside.length ? ` (${each.outside.join(" ")})` : ""}`);
    equal("find the key: ii-V-I in C", found(["Cmaj7", "Am7", "Dm7", "G7"])[0], "C major 4/4");
    equal("find the key: A minor, its V7 from the harmonic minor", found(["Am", "Dm", "E7", "Am"])[0], "A minor 3/3");
    equal("find the key: a secondary dominant outside", found(["Dm7", "G7", "Cmaj7", "A7"])[0], "C major 3/4 (A7)");
    equal("find the key: relatives tied, the first chord decides", `${found(["C", "F", "G"])[0]} | ${found(["Am", "F", "C", "G"])[0]}`, "C major 3/3 | A minor 4/4");
    equal("find the key: spelled as the chords are", `${found(["C♯", "F♯", "G♯7"])[0]} | ${found(["D♭", "G♭", "A♭7"])[0]} | ${found(["C♯m", "F♯m", "G♯7", "C♯m"])[0]}`, "C♯ major 3/3 | D♭ major 3/3 | C♯ minor 3/3");
    equal("find the key: G♯7 doesn't make a G♯ major key (it would need double sharps)", found(["G♯7", "C♯"])[0].split(" ")[0], "C♯");
    const aMinor = { root: "A", scale: "minor" };
    equal("a key holds: in A minor, E7 and G♯°7 from the harmonic minor, not Fm6 though its notes are there", ["E7", "G♯°7", "Fm6", "G7", "D7"].map(name => H.keyHolds(name, aMinor) ? "y" : "n").join(""), "yynyn");
    equal("find the key: a song in C with a borrowed iv is still in C", found(["Cmaj7", "Am7", "Dm7", "G7", "Cmaj7", "Fmaj7", "Fm6", "Em7", "A7", "Dm7", "G7"])[0], "C major 6/8 (Fm6 A7)");
    equal("find the key: three at most, none for no chords", `${H.findKey(["C", "G"]).length} ${H.findKey([]).length} ${H.findKey(["Hendrix"]).length}`, "3 0 0");
    const pivots = H.pivotChords({ root: "C", scale: "major" }, { root: "G", scale: "major" });
    equal("pivot chords: C major to G major", pivots.map(each => `${each.name} ${each.from}=${each.to}`).join(", "), "C I=IV, Em iii=vi, G V=I, Am vi=ii");
    equal("pivot chords: as sevenths, fewer", H.pivotChords({ root: "C", scale: "major" }, { root: "G", scale: "major" }, 4).map(each => each.name).join(" "), "Cmaj7 Em7 Am7");
    equal("pivot chords: C major to A minor share all seven", H.pivotChords({ root: "C", scale: "major" }, { root: "A", scale: "minor" }).length, 7);
    equal("pivot chords: none for a key that isn't one", H.pivotChords({ root: "H", scale: "major" }, { root: "C", scale: "major" }).length, 0);

    // 2.4.0: the bass under the loop.
    const four = [3, 1, 1, 1];
    const cf = H.chartTimeline({ beats: 4, sections: [{ repeat: 1, bars: [["C"], ["F"]] }] });
    const line = notes => notes.map(note => `${note.midi}@${note.start}`).join(" ");
    equal("bass: roots, each chord's as it starts, the next as near as can be", line(H.bassLine(cf, four, "roots")), "36@0 41@4");
    equal("bass: walking up from a low C, down from F, a half step into each next", line(H.bassLine(cf, four, "walking")), "36@0 40@1 43@2 42@3 41@4 36@5 33@6 35@7");
    const slash = H.chartTimeline({ beats: 4, sections: [{ repeat: 1, bars: [["C/E"]] }] });
    equal("bass: a slash chord's bass", line(H.bassLine(slash, four, "roots")), "40@0");
    const compound = H.chartTimeline({ beats: 6, sections: [{ repeat: 1, bars: [["C"]] }] });
    equal("bass: in 6/8, walking steps on each group's first beat", line(H.bassLine(compound, [3, 1, 1, 2, 1, 1], "walking")), "36@0 37@3");
    equal("bass: in 6/4, on every beat, turning at the range's edge if it must", H.bassLine(compound, [3, 1, 1, 1, 1, 1], "walking").length, 6);
    const busy = H.chartTimeline({ beats: 4, sections: [{ repeat: 2, bars: [["Dm7", "G7"], ["Cmaj7"], ["A7"], ["Dm7"], ["E♭7"], ["A♭maj7", "D♭7"], ["Cmaj7"]] }] });
    const busyLine = H.bassLine(busy, four, "walking");
    check("bass: a longer walk stays in range, a note a beat, every chord starting on its bass", busyLine.length === busy.at(-1).start + busy.at(-1).beats && busyLine.every(note => note.midi >= 28 && note.midi <= 52)
        && busy.every(event => (busyLine.find(note => note.start === event.start).midi - H.chordTones(event.chord)[0].pc) % 12 === 0));
    check("bass: no step repeats the note before", busyLine.every((note, at) => at === 0 || note.midi !== busyLine[at - 1].midi));
    equal("bass: nothing for no chords or no bar", `${H.bassLine([], four).length} ${H.bassLine(cf, []).length}`, "0 0");

    // ---- Voicings (2.6.0)
    const guitar = [40, 45, 50, 55, 59, 64];
    const shapeText = shape => shape.frets.map(fret => (fret === null ? "x" : fret)).join(" ");
    const shapesOf = (name, pitches = guitar, frets = 15) => H.chordShapes(name, pitches, frets).map(shapeText);
    check("shapes: open C first", shapesOf("C")[0] === "x 3 2 0 1 0");
    check("shapes: G, Am, E and D open as they're usually played", shapesOf("G").includes("3 2 0 0 0 3") && shapesOf("Am")[0] === "x 0 2 2 1 0" && shapesOf("E")[0] === "0 2 2 1 0 0" && shapesOf("D")[0] === "x x 0 2 3 2");
    check("shapes: F as a barre, and no string open under a barre", shapesOf("F")[0] === "1 3 3 2 1 1" && H.chordShapes("F", guitar, 15).every(shape => !shape.barre || shape.frets.every((fret, string) => fret !== 0 || string < shape.frets.findIndex(each => each === shape.low))));
    const everyShape = ["C", "Dm7", "G7", "Cmaj7", "Bm7♭5", "E7♯9", "A13", "C/E", "Fmaj9", "Gsus4"].flatMap(name => H.chordShapes(name, guitar, 15).map(shape => ({ name, shape })));
    check("shapes: every note the chord's, within four frets, four fingers at most", everyShape.length > 200 && everyShape.every(({ name, shape }) => {
        const pcs = H.chordTones(name).map(tone => tone.pc);
        const fretted = shape.frets.filter(fret => fret > 0);
        return shape.midis.every(midi => pcs.includes(midi % 12)) && (!fretted.length || Math.max(...fretted) - Math.min(...fretted) < H.SHAPE_SPAN);
    }));
    check("shapes: a seventh chord keeps its root, third and seventh; the fifth may go", H.chordShapes("G7", guitar, 15).every(shape => [7, 11, 5].every(pc => shape.midis.some(midi => midi % 12 === pc))) && H.chordShapes("G7", guitar, 15).some(shape => !shape.midis.some(midi => midi % 12 === 2)));
    check("shapes: a slash chord has its bass lowest", H.chordShapes("C/E", guitar, 15).every(shape => Math.min(...shape.midis) % 12 === 4));
    check("shapes: on a ukulele and a bass too", shapesOf("C", [67, 60, 64, 69])[0] === "0 0 0 3" && shapesOf("G", [28, 33, 38, 43], 20).length > 0);
    equal("shapes: none for what isn't a chord", H.chordShapes("Q7", guitar, 15).length, 0);
    const keys = H.keyVoicings("Dm7");
    check("keys: close in each inversion, drop 2, a shell and a spread", ["close", "drop2", "shell", "open"].every(kind => keys.some(each => each.kind === kind)) && keys.filter(each => each.kind === "close").length === 4);
    check("keys: every voicing the chord's notes, the shell root, third and seventh", keys.every(each => each.midis.every(midi => [2, 5, 9, 0].includes(midi % 12))) && keys.find(each => each.kind === "shell").midis.map(midi => midi % 12).join() === "2,5,0");
    check("keys: a slash chord keeps its bass", H.keyVoicings("C/E").every(each => each.midis[0] % 12 === 4));
    const tune = ["Cmaj7", "Am7", "Dm7", "G7", "Cmaj7"];
    const choices = tune.map(name => H.chordShapes(name, guitar, 15));
    const smooth = H.smoothVoicings(choices);
    const travel = path => path.slice(1).reduce((sum, index, k) => sum + H.voicingDistance(choices[k][path[k]], choices[k + 1][index]), 0);
    check("smooth: a voicing for each chord, moving less than the easiest of each", smooth.length === 5 && smooth.every(index => index >= 0) && travel(smooth) <= travel([0, 0, 0, 0, 0]));
    equal("smooth: a voicing pinned is kept", H.smoothVoicings(choices, [null, null, 7])[2], 7);
    equal("smooth: a chord with none is skipped", H.smoothVoicings([choices[0], [], choices[2]])[1], -1);
    equal("smooth: nothing for nothing", H.smoothVoicings([]).length, 0);

    // ---- Cadences and ways to another key (2.6.0)
    const inC = { root: "C", scale: "major" }, inAm = { root: "A", scale: "minor" };
    const cadence = (key, id) => H.cadencesIn(key).find(each => each.id === id)?.chords.join(" ");
    equal("cadences: authentic in C", cadence(inC, "authentic"), "F G7 C");
    equal("cadences: deceptive in C", cadence(inC, "deceptive"), "Dm G7 Am");
    equal("cadences: backdoor in C", cadence(inC, "backdoor"), "Fm7 B♭7 Cmaj7");
    equal("cadences: the Phrygian half cadence's iv over its third", cadence(inAm, "phrygian"), "Dm/F E");
    equal("cadences: a Picardy third in A minor", cadence(inAm, "picardy"), "Dm E7 A");
    check("cadences: major's and minor's own", !cadence(inC, "phrygian") && !cadence(inAm, "backdoor") && H.cadencesIn(inC).length === 6 && H.cadencesIn(inAm).length === 7);
    equal("cadences: a mode takes its parallel minor's", cadence({ root: "D", scale: "dorian" }, "deceptive"), "Gm A7 B♭");
    equal("cadences: in a flat key", cadence({ root: "E♭", scale: "major" }, "authentic"), "A♭ B♭7 E♭");
    equal("cadences: none outside a key", H.cadencesIn({ root: "C", scale: "chromatic" }).length, 0);
    const routes = H.modulationRoutes(inC, { root: "G", scale: "major" });
    equal("ways: C to G, each kind", routes.map(route => route.id).join(), "pivot,dominant,twofive,direct");
    check("ways: each starts on the old tonic and ends on the new, the dominant before it", routes.every(route => route.chords[0] === "C" && route.chords.at(-1) === "G") && routes.find(route => route.id === "dominant").chords.join(" ") === "C D7 G");
    check("ways: the pivot is a chord both keys hold", H.pivotChords(inC, { root: "G", scale: "major" }, 3).some(pivot => pivot.name === routes[0].chords[1]));
    check("ways: to a key that shares no chord, no pivot", !H.modulationRoutes(inC, { root: "F♯", scale: "major" }).some(route => route.id === "pivot"));
    const blues = H.cleanChart({ title: "B", root: "C", scale: "major", beats: 4, sections: [{ name: "", repeat: 1, bars: [["C7"], ["F7"], ["%"], ["G7"]] }] });
    const aaba = H.chartInForm(blues, [["A", 2, 2], ["B", 3, 1], ["A", 2, 1]], "C");
    equal("form: the chords poured in order, repeats written out, the rest the filler", aaba.sections.map(section => `${section.name}${section.repeat}:${section.bars.map(bar => bar[0]).join(" ")}`).join(" | "), "A2:C7 F7 | B1:F7 G7 C | A1:C7 F7");
    equal("form: more bars than a song holds is refused", H.chartInForm(blues, ["A", "B", "C", "D", "E"].map(name => [name, 64, 1]), "C"), null);
    equal("ways: into a minor key, its ii is half-diminished", H.modulationRoutes(inC, inAm).find(route => route.id === "twofive").chords.join(" "), "C Bm7♭5 E7 Am");
    // ---- Voicings written into a chart (2.7.0)
    const voicedChart = H.cleanChart({ title: "Tune", root: "C", scale: "major", beats: 4, sections: [{ name: "A", repeat: 2, bars: [["Cmaj7=48.55.59.64"], ["%"], ["Dm7", "G7=43.53.59.65"]] }] });
    equal("voicing: a chord's own, as written", H.slotVoicing("Cmaj7=48.55.59.64")?.join(), "48,55,59,64");
    equal("voicing: a chord's name without it", `${H.slotChord("Cmaj7=48.55.59.64")} ${H.slotChord("Cmaj7")} ${H.slotVoicing("Cmaj7")}`, "Cmaj7 Cmaj7 null");
    equal("voicing: written into a chart", voicedChart?.sections[0].bars.map(bar => bar.join(" ")).join(" | "), "Cmaj7=48.55.59.64 | % | Dm7 G7=43.53.59.65");
    check("voicing: a chord typed plainly is tidied, its voicing kept", H.cleanChart({ ...voicedChart, sections: [{ name: "", bars: [["F#m7=42.52.57.61"]] }] })?.sections[0].bars[0][0] === `F${sharp}m7=42.52.57.61`);
    const voicingRefused = ["Cmaj7=55.48", "Cmaj7=48.48", "Cmaj7=15", "Cmaj7=109", "Cmaj7=048", "Cmaj7=", "Cmaj7=48.", "Cmaj7=48=55", "=48", "%=48", "Cmaj7=40.41.42.43.44.45.46.47.48.49.50", "Hendrix=48"];
    equal("voicing: falling, doubled, out of range, malformed or on no chord refused", voicingRefused.map(token => H.cleanChart({ ...voicedChart, sections: [{ name: "", bars: [["C"], [token]] }] })).filter(Boolean).length, 0);
    check("voicing: ten notes allowed, and one", Boolean(H.cleanChart({ ...voicedChart, sections: [{ name: "", bars: [["C=36.40.43.48.52.55.60.64.67.72"], ["C=60"]] }] })));
    // As text: format 2 only with a voicing.
    const voicedText = H.chartText(voicedChart);
    equal("voicing: a chart with one is format 2", voicedText.split("\n").slice(0, 3).join("|"), "Maestro chart 2|Tune\tC\tmajor\t4/4|A\t2\tCmaj7=48.55.59.64\t%\tDm7 G7=43.53.59.65");
    equal("voicing: read back the same", JSON.stringify(H.readChartText(voicedText)), JSON.stringify(H.cleanChart({ ...voicedChart, meter: "4/4" })));
    check("voicing: a chart without one stays format 1", H.chartText(H.cleanChart({ ...voicedChart, sections: [{ name: "", bars: [["C"]] }] })).startsWith("Maestro chart 1\n"));
    equal("voicing: format 1 with one refused", H.readChartText(voicedText.replace("Maestro chart 2", "Maestro chart 1")), null);
    check("voicing: format 2 without one read", Boolean(H.readChartText("Maestro chart 2\nT\tC\tmajor\t4/4\nA\t1\tC")));
    // Played: a repeated bar and a section's repeats play the same voicing.
    const voicedTimeline = H.chartTimeline(voicedChart);
    equal("voicing: each chord played with its own, a repeated bar's the bar before's", voicedTimeline.map(event => `${event.chord}:${event.voicing?.join(".") ?? "-"}`).join(" "),
        "Cmaj7:48.55.59.64 Cmaj7:48.55.59.64 Dm7:- G7:43.53.59.65 Cmaj7:48.55.59.64 Cmaj7:48.55.59.64 Dm7:- G7:43.53.59.65");
    // Transposed, with the chord.
    const voicedUp = H.transposeChart(voicedChart, "E" + flat);
    equal("voicing: moved with its chord, the nearer way", voicedUp.sections[0].bars.map(bar => bar.join(" ")).join(" | "), `E${flat}maj7=51.58.62.67 | % | Fm7 B${flat}7=46.56.62.68`);
    equal("voicing: down when that's nearer", H.transposeChart(voicedChart, "A").sections[0].bars[0][0], "Amaj7=45.52.56.61");
    equal("voicing: an octave the other way at the top of the range", H.moveVoicing([100, 105], 5)?.join(), "93,98");
    equal("voicing: dropped where it can't fit", H.moveVoicing([16, 108], 1), null);
    equal("voicing: one that can't move is dropped, the chord moved", H.transposeChart({ ...voicedChart, sections: [{ name: "", repeat: 1, bars: [["C=16.108"]] }] }, "D").sections[0].bars[0][0], "D");
    check("voicing: moved through another key and back, the same", JSON.stringify(H.transposeChart(H.transposeChart(voicedChart, "E" + flat), "C")) === JSON.stringify(voicedChart));
    // Spelled from the chord symbol, then the key.
    const spelled = midis => (name, key) => H.spellVoicing(name, midis, key).map(p => `${"CDEFGAB"[((p.step % 7) + 7) % 7]}${{ "-2": "bb", "-1": "b", "0": "", "1": "#", "2": "x" }[p.alter]}${Math.floor(p.step / 7)}`).join(" ");
    equal("spell: from the symbol", spelled([51, 55, 58, 61])("E" + flat + "7"), "Eb3 G3 Bb3 Db4");
    equal("spell: the same notes as another chord spells them", spelled([51, 55, 58, 61])("D" + sharp + "7"), "D#3 Fx3 A#3 C#4");
    equal("spell: a B sharp in its own octave", spelled([48, 52, 56])("G" + sharp + "m/B" + sharp), "B#2 E3 G#3");
    equal("spell: C flat in its", spelled([59, 63, 66])("C" + flat), "Cb4 Eb4 Gb4");
    equal("spell: a note outside the chord as the key spells it, else plainly", `${spelled([48, 52, 55, 65])("C", { root: "C", scale: "major" })} / ${spelled([48, 51, 55])("C", { root: "B" + flat, scale: "major" })} / ${spelled([48, 54])("C")}`, `C3 E3 G3 F4 / C3 Eb3 G3 / C3 F#3`);
    // On a neck: one string a note, as narrow a hand as there is.
    const sixStrings = [40, 45, 50, 55, 59, 64];
    equal("neck: a written voicing placed", H.fretsForVoicing([48, 52, 55, 60, 64], sixStrings, 22)?.map(fret => fret ?? "x").join(" "), "x 3 2 0 1 0");
    equal("neck: high on the neck when it must be", H.fretsForVoicing([55, 59, 62, 67], sixStrings, 22)?.map(fret => fret ?? "x").join(" "), "x x 5 4 3 3");
    equal("neck: none for more notes than strings, or out of reach", `${H.fretsForVoicing([40, 41, 42, 43, 44, 45, 46], sixStrings, 22)} ${H.fretsForVoicing([30], sixStrings, 22)} ${H.fretsForVoicing([100], sixStrings, 22)}`, "null null null");
    // Too large for AHK's file.
    check("size: a chart over 64 KB is too large", H.chartTooLarge("x".repeat(65537)) && !H.chartTooLarge("x".repeat(65536)) && H.chartTooLarge("\u266F".repeat(21846)));
    // ---- A chart on a grand staff (2.7.0)
    const N = globalThis.MaestroNotation;
    equal("staff: a length as tied notes", [8, 7, 6, 5, 3, 12, 14].map(eighths => H.staffLengths(eighths).map(piece => piece.d + (piece.dot ? "." : "")).join("+")).join(" "), "w h.+e h. h+e q. w. w.+q");
    equal("staff: a key's signature, a mode's own, its parent's, else by its third", [["C", "major"], ["D", "dorian"], ["E" + flat, "major"], ["A", "minor"], ["B", "locrian"], ["A", "harmonic"], ["C", "phrygianDominant"], ["C", "lydianDominant"], ["C", "hungarianMinor"], ["C", "doubleHarmonic"]].map(([root, scale]) => H.keySignature({ root, scale })).join(), "0,0,-3,0,0,0,-4,-2,-3,0");
    const handsOf = (name, midis) => H.staffHands(name, midis, C).map(hand => hand.map(each => N.pitchName(each.p)).join(" ")).join(" | ");
    equal("staff: middle C and up in the right hand, below it the left", handsOf("C", [36, 48, 55, 60, 64]), `C4 E4 | C2 C3 G3`);
    equal("staff: a hand of more than eight gives the rest to the other", handsOf("C", [60, 62, 64, 65, 67, 69, 71, 72, 74, 76]).split(" | ").map(hand => hand.split(" ").length).join(), "8,2");
    equal("staff: two notes on one line spelled apart", handsOf("C", [60, 61]), `C4 D${flat}4 | `);
    const oneStaff = (name, midis) => H.staffHands(name, midis, C, 1).map(hand => hand.map(each => N.pitchName(each.p)).join(" ")).join(" | ");
    equal("staff: on one staff (2.7.0), every note on it", oneStaff("C", [40, 48, 55, 60, 64]), "E2 C3 G3 C4 E4");
    equal("staff: one staff holds eight, the lowest left out", oneStaff("C", [36, 40, 43, 48, 52, 55, 60, 64, 67, 72]), "G2 C3 E3 G3 C4 E4 G4 C5");
    const staffChart = H.cleanChart({ title: "Tune", root: "C", scale: "major", beats: 4, sections: [{ name: "A", repeat: 2, bars: [["C=48.55.64"], ["%"], ["Dm7", "G7"]] }, { name: "", repeat: 1, bars: [["C", "F", "G"]] }] });
    const asked = [];
    const made = H.chartScore(staffChart, "4/4", entry => (asked.push(`${entry.index}:${entry.name}`), entry.voicing ?? [60, 64, 67]), C);
    equal("staff: each chord written asked for its notes once, in order", asked.join(" "), "0:C 1:Dm7 2:G7 3:C 4:F 5:G");
    equal("staff: bars as written, a % bar marked, sections once each", made.bars.map(bar => `${bar.section}.${bar.bar}${bar.repeat ? "%" : ""}`).join(" ") + " / " + made.sections.map(section => `${section.first}-${section.last}x${section.repeat}`).join(" "), "0.0 0.1% 0.2 1.0 / 0-2x2 3-3x1");
    equal("staff: each chord as long as it's played", made.chords.map(chord => `${chord.name}@${chord.onset}+${chord.length}`).join(" "), "C@0+8 Dm7@16+4 G7@20+4 C@24+4 F@28+2 G@30+2");
    check("staff: a written voicing known as written", made.chords[0].written && !made.chords[1].written && made.chords[0].midis.join() === "48,55,64");
    const right = made.score.staves[0].voices[0].notes, left = made.score.staves[1].voices[0].notes;
    equal("staff: the right hand's notes, rests in the % bar", right.map(note => (note.p ? N.pitchesOf(note).map(N.pitchName).join("+") : "r") + note.d).join(" "), "E4w rw C4+E4+G4h C4+E4+G4h C4+E4+G4h C4+E4+G4q C4+E4+G4q");
    equal("staff: the left hand's", left.map(note => (note.p ? N.pitchesOf(note).map(N.pitchName).join("+") : "r") + note.d).join(" "), "C3+G3w rw rh rh rh rq rq");
    equal("staff: where a chord's notes are on each hand's staff", JSON.stringify(made.chords[0].staves), '[{"note":0,"notes":1,"midis":[64]},{"note":0,"notes":1,"midis":[48,55]}]');
    equal("staff: a % bar's rests, each hand's", JSON.stringify(made.bars[1].notes), "[[1,2],[1,2]]");
    const sevens = H.chartScore(H.cleanChart({ ...staffChart, beats: 7, sections: [{ name: "", repeat: 1, bars: [["C"]] }] }), "7/8:3+2+2", () => [60, 64, 67], C);
    equal("staff: 7/8, its groups, a chord over the bar tied", `${JSON.stringify(sevens.score.meter)} ${sevens.score.staves[0].voices[0].notes.map(note => note.d + (note.dot ? "." : "") + (note.tie ? "~" : "")).join(" ")}`, `{"beats":7,"unit":8,"groups":[3,2,2]} h.~ e`);
    const long = H.cleanChart({ ...staffChart, sections: Array.from({ length: 4 }, () => ({ name: "", repeat: 1, bars: Array.from({ length: 64 }, () => ["C", "F", "G", "C"]) })) });
    const longMade = H.chartScore(long, "4/4", () => [48, 60, 64, 67], C);
    check("staff: a song of 256 bars of four chords is written", longMade && longMade.chords.length === 1024 && N.engrave(longMade.score, { maxWidth: 1400, justify: true }).heads.length === 4096);
    equal("staff: a meter that isn't one refused", H.chartScore(staffChart, "four", () => [60], C), null);
    const guitarMade = H.chartScore(staffChart, "4/4", entry => entry.voicing ?? [40, 47, 52, 56, 59, 64], C, ["treble8"]);
    equal("staff: a guitar's chart on one staff, its clef with an 8 (2.7.0)", guitarMade.score.staves.map(staff => staff.clef).join(), "treble8");
    equal("staff: every note of a chord on it", guitarMade.score.staves[0].voices[0].notes[0] && N.pitchesOf(guitarMade.score.staves[0].voices[0].notes[0]).map(N.pitchName).join(" "), "C3 G3 E4");
    equal("staff: a % bar's rests, on the one staff", JSON.stringify(guitarMade.bars[1].notes), "[[1,2]]");
    equal("staff: where a chord's notes are, on the one staff", JSON.stringify(guitarMade.chords[0].staves), '[{"note":0,"notes":1,"midis":[48,55,64]}]');
})();
