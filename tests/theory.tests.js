"use strict";

// Theory (2.8.0): rows and their matrix, set classes and negative harmony.
(function () {
    const T = globalThis.MaestroTheory;
    const H = globalThis.MaestroHarmony;
    const { check, equal } = globalThis.TestHarness;
    const SHARP = "♯", FLAT = "♭";
    const digits = list => list.map(T.pcDigit).join("");

    // ---- Reading notes
    equal("notes: names, flats typed as b, numbers and t/e", T.readPcs("C F# Bb 3 t e").pcs.join(), "0,6,10,3,10,11");
    equal("notes: a capital E is the note, a small e is 11", `${T.readPc("E")} ${T.readPc("e")}`, "4 11");
    equal("notes: twelve digits run together", T.readPcs("0t3e12456789").pcs.join(), "0,10,3,11,1,2,4,5,6,7,8,9");
    equal("notes: what isn't one is named", T.readPcs("C H 12").bad.join(), "H,12");
    equal("notes: signs as Maestro writes them", T.readPc(`G${SHARP}`) + T.readPc(`D${FLAT}`), 8 + 1);

    // ---- Rows
    const berg = T.readRow("G Bb D F# A C E G# B C# Eb F");         // Berg's Violin Concerto
    check("row: Berg's is a row", berg.row && berg.problem === "" ? [] : [berg.problem]);
    equal("row: a repeat is named", T.readRow("C C D E F G A B Bb Eb Ab Db").problem, "C comes twice; a row has each note once.");
    equal("row: too few names the notes still to come", T.readRow("C D E F G A B").problem, `7 of the 12 notes: C${SHARP}, E${FLAT}, F${SHARP}, A${FLAT} and B${FLAT} still to come.`);
    equal("row: one missing", T.readRow("C C# D Eb E F F# G Ab A Bb").problem, "11 of the 12 notes: B still missing.");
    equal("row: what's written, missing and repeated, as pitch classes", ((r) => `${r.used.join()} / ${r.missing.length} / ${r.repeated.join()}`)(T.readRow("C E C E G")), "0,4,7 / 9 / 0,4");
    equal("row: two repeated are both named", T.readRow("C E C E").problem, "C and E come twice; a row has each note once.");
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const made = T.randomRow(random);
    check("row: a random row is a row", T.readRow(made).row ? [] : [made.join()]);

    const matrix = T.rowMatrix(berg.row);
    equal("matrix: the row along the top", matrix.cells[0].join(), berg.row.join());
    equal("matrix: its inversion down the left", matrix.cells.map(line => line[0]).join(), berg.row.map(pc => (2 * 7 - pc + 24) % 12).join());
    check("matrix: every line and column is a row", [...matrix.cells, ...matrix.cells[0].map((_, c) => matrix.cells.map(line => line[c]))].filter(line => !T.readRow([...line]).row).map(line => line.join()));
    equal("matrix: P numbers from the row's own first note", matrix.prime.join(), "0,9,5,1,10,7,3,11,8,6,4,2");
    equal("matrix: the diagonal is the first note throughout", matrix.cells.map((line, at) => line[at]).join(), Array(12).fill(7).join());
    equal("forms: P0 is the row", T.rowForm(berg.row, "P", 0).join(), berg.row.join());
    equal("forms: R0 reads it backward", T.rowForm(berg.row, "R", 0).join(), [...berg.row].reverse().join());
    equal("forms: I0 starts where the row does", T.rowForm(berg.row, "I", 0)[0], 7);
    const p3 = T.rowForm(berg.row, "P", 3);
    equal("forms: P3 is the matrix's line labeled P3", matrix.cells[matrix.prime.indexOf(3)].join(), p3.join());
    equal("forms: RI5 is I5 backward", T.rowForm(berg.row, "RI", 5).join(), [...T.rowForm(berg.row, "I", 5)].reverse().join());

    // ---- Sets
    equal("normal form: C major triad", T.normalForm([7, 0, 4]).join(), "0,4,7");
    equal("normal form: the most packed rotation", T.normalForm([11, 0, 4, 8]).join(), "8,11,0,4");
    equal("prime form: major and minor triads share 037", `${digits(T.primeForm([0, 4, 7]))} ${digits(T.primeForm([0, 3, 7]))}`, "037 037");
    equal("prime form: Rahn's for 5-20, not Forte's 01378", digits(T.primeForm([0, 1, 3, 7, 8])), "01568");
    equal("prime form: the whole-tone scale", digits(T.primeForm([0, 2, 4, 6, 8, 10])), "02468t");
    equal("vector: the diatonic set", T.intervalVector([0, 2, 4, 5, 7, 9, 11]).join(""), "254361");
    equal("vector: the major triad", T.intervalVector([0, 4, 7]).join(""), "001110");

    const named = pcs => T.setClass(pcs).forte;
    equal("Forte: triads and sevenths", [[0, 4, 7], [0, 3, 6], [0, 4, 8], [7, 11, 2, 5], [2, 5, 9, 0], [0, 4, 7, 11], [0, 3, 6, 9]].map(named).join(" "), "3-11 3-10 3-12 4-27 4-26 4-20 4-28");
    equal("Forte: the scales", [[0, 2, 4, 7, 9], [0, 2, 4, 6, 8, 10], [0, 2, 4, 5, 7, 9, 11], [0, 1, 3, 4, 6, 7, 9, 10], [0, 2, 3, 5, 7, 9, 11], [0, 1, 4, 5, 8, 9]].map(named).join(" "), "5-35 6-35 7-35 8-28 7-34 6-20");
    equal("Forte: the all-interval tetrachords", `${named([0, 1, 4, 6])} ${named([0, 1, 3, 7])}`, "4-Z15 4-Z29");
    equal("Forte: dyads by interval class, and the aggregate", `${named([0, 5])} ${named([...Array(12).keys()])}`, "2-5 12-1");
    equal("Forte: a common name", T.setClass([0, 4, 7, 10]).known, "dominant or half-diminished seventh");

    // The table checks itself: each size has as many set classes as there are.
    const counts = { 3: 12, 4: 29, 5: 38, 6: 50 };
    for (const [size, count] of Object.entries(counts)) {
        const listed = T.FORTE_PRIMES.filter(each => each.pcs.length === Number(size));
        const keys = new Set(listed.map(each => digits(T.primeForm(each.pcs))));
        check(`Forte: ${count} classes of ${size} notes, each its own`, listed.length === count && keys.size === count ? [] : [`${listed.length} listed, ${keys.size} distinct`]);
    }
    // Z: a class is marked Z exactly when another of its size shares its vector.
    const zProblems = [];
    for (const each of T.FORTE_PRIMES) {
        const vector = T.intervalVector(each.pcs).join();
        const shares = T.FORTE_PRIMES.some(other => other !== each && other.pcs.length === each.pcs.length && T.intervalVector(other.pcs).join() === vector);
        if (shares !== each.name.includes("Z")) zProblems.push(each.name);
    }
    check("Forte: Z marks the classes that share a vector", zProblems);
    equal("Z: 4-Z15's partner", T.setClass([0, 1, 4, 6]).z, "4-Z29");
    equal("Z: 6-Z17's partner, its complement", `${T.setClass([0, 1, 2, 4, 7, 8]).z} ${T.setClass([0, 1, 2, 4, 7, 8]).complement}`, "6-Z43 6-Z43");
    equal("complement: the diatonic set's is the pentatonic", T.setClass([0, 2, 4, 5, 7, 9, 11]).complement, "5-35");
    equal("symmetry: the diminished seventh maps onto itself four ways, and inverts four", `${T.setClass([0, 3, 6, 9]).transpositions} ${T.setClass([0, 3, 6, 9]).inversions}`, "4 4");
    equal("symmetry: the major triad only by the identity, and doesn't invert", `${T.setClass([0, 4, 7]).transpositions} ${T.setClass([0, 4, 7]).inversions}`, "1 0");
    equal("transform: T2 and T0I", `${T.transformSet([0, 4, 7], 2).join()} ${T.transformSet([0, 4, 7], 0, true).join()}`, "2,6,9 0,5,8");

    // ---- Negative harmony
    const C = { root: "C", scale: "major" };
    equal("negative: the tonic and dominant swap", `${T.negativePc(0, 0)} ${T.negativePc(7, 0)}`, "7 0");
    equal("negative: C major becomes C minor", T.negativeKey(C).scale, "minor");
    equal("negative: Dorian becomes Mixolydian", T.negativeKey({ root: "D", scale: "dorian" }).scale, "mixolydian");
    equal("negative: Locrian has none", T.negativeKey({ root: "B", scale: "locrian" }), null);
    equal("negative: chords in C", ["C", "G7", "Dm", "F", "Am", "Em", "B°", "F6"].map(name => T.negativeChord(name, C)).join(" "), `Cm Fm6 B${FLAT} Gm E${FLAT} A${FLAT} D° Gm7`);
    equal("negative: in G, D7 becomes Cm6", T.negativeChord("D7", { root: "G", scale: "major" }), "Cm6");
    equal("negative: a slash chord's bass is reflected too", T.negativeChord("C/E", C), `Cm/E${FLAT}`);
    equal("negative: not a chord, nothing", T.negativeChord("Hm", C), "");

    const chart = { title: "Song", root: "C", scale: "major", beats: 4, sections: [{ name: "", repeat: 1, bars: [["C"], ["F", "G7"], [H.REPEAT_BAR], [H.voicedSlot("Am", [57, 60, 64])]] }] };
    const reflected = T.negativeChart(chart);
    equal("negative chart: the chords", reflected.chart.sections[0].bars.map(bar => bar.join(" ")).join(" | "), `Cm | Gm Fm6 | ${H.REPEAT_BAR} | E${FLAT}`);
    equal("negative chart: the key, and the voicing let go", `${reflected.chart.scale} ${reflected.keyKept} ${reflected.dropped}`, "minor false 1");
    const plain = { ...chart, sections: [{ ...chart.sections[0], bars: [["C"], ["F", "G7"]] }] };
    equal("negative chart: reflected twice is where it began", T.negativeChart(T.negativeChart(plain).chart).chart.sections[0].bars.flat().join(), "C,F,G7");
})();
