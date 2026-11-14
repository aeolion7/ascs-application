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
    const unreadable = ["", "Maestro chart 2\nT\tC\tmajor\t4/4\nA\t1\tC", "Maestro chart 1\nT\tC\tmajor\nA\t1\tC", "Maestro chart 1\nT\tC\tmajor\t4/4\nA\t9\tC",
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
})();
