// Writing prompts (2.4.0): drawing at each level, locks and clashes, the
// sentence, checks against a sketch, and the sketch a prompt opens as.
(() => {
    const P = globalThis.MaestroPrompts;
    const H = globalThis.MaestroHarmony;
    const { check, equal } = globalThis.TestHarness;
    const flat = "♭";
    const seeded = start => {
        let seed = start;
        return () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    };
    const chart = (bars, root = "C", scale = "major", more = []) => H.cleanChart({ title: "T", root, scale, beats: 4, sections: [{ name: "", repeat: 1, bars: bars.map(bar => bar.split(" ")) }, ...more] });

    // Drawing at every level: well-formed, without clashes, from the level's choices.
    const problems = [];
    for (let level = 1; level <= 5; level++) {
        const random = seeded(level * 7919);
        for (let time = 0; time < 150; time++) {
            const prompt = P.drawPrompt(level, null, [], random);
            if (JSON.stringify(P.cleanPrompt(prompt)) !== JSON.stringify(prompt)) problems.push(`level ${level}: not clean ${JSON.stringify(prompt)}`);
            if (P.clashes(prompt).length) problems.push(`level ${level}: clash ${JSON.stringify(P.clashes(prompt))}`);
            for (const part of P.partsAt(level)) {
                const list = P.choices(part, level, prompt);
                const has = part === "key" ? list.some(key => key.root === prompt.key.root && key.scale === prompt.key.scale) : list.includes(prompt[part]);
                if (!has) problems.push(`level ${level}: ${part} ${JSON.stringify(prompt[part])} isn't one of the level's`);
            }
            if (!P.promptSketch(prompt)) problems.push(`level ${level}: no sketch for ${JSON.stringify(prompt)}`);
        }
    }
    equal("drawing: 150 prompts a level, each clean, without clashes, from its level, with a sketch", problems.slice(0, 5).join("; "), "");
    equal("drawing: Simple has no second device and nothing to avoid", ["use2", "avoid"].map(part => P.drawPrompt(1, null, [], seeded(3))[part]).join(), ",");
    check("drawing: Moderate avoids something, Colorful uses two devices", P.drawPrompt(2, null, [], seeded(5)).avoid && !P.drawPrompt(2, null, [], seeded(5)).use2 && P.drawPrompt(3, null, [], seeded(5)).use2);
    const levelOneKeys = P.keysAt(1);
    check("keys: Simple's are major and minor, two sharps or flats at most", levelOneKeys.every(key => ["major", "minor"].includes(key.scale) && P.keyAccidentals(key) <= 2)
        && levelOneKeys.some(key => key.root === "C" && key.scale === "major") && levelOneKeys.some(key => key.root === "A" && key.scale === "minor")
        && !levelOneKeys.some(key => key.root === `E${flat}` && key.scale === "major"));
    check("keys: none at any level needs a double sharp or flat", [1, 2, 3, 4, 5].every(level => P.keysAt(level).every(key => Number.isFinite(P.keyAccidentals(key)))));

    // Locks: a part locked is kept, the rest drawn again.
    const first = P.drawPrompt(4, null, [], seeded(11));
    const locked = ["key", "form", "use"];
    const kept = [1, 2, 3, 4, 5, 6].map(seed => P.drawPrompt(4, first, locked, seeded(seed * 31)));
    check("locks: the key, form and device locked stay through six draws", kept.every(each => JSON.stringify(each.key) === JSON.stringify(first.key) && each.form === first.form && each.use === first.use));
    check("locks: the rest change", kept.some(each => each.tempo !== first.tempo) && kept.some(each => each.meter !== first.meter || each.avoid !== first.avoid));
    const again = P.redrawPart(first, "tempo", seeded(99));
    equal("one part drawn again: the others kept", P.PARTS.filter(part => part !== "tempo" && JSON.stringify(again[part]) !== JSON.stringify(first[part])).join(), "");
    // Clashes: a deceptive cadence locked never comes with "avoid V".
    const deceptive = { ...first, level: 3, use: "deceptive", use2: "sus", avoid: "noFive", begin: "1", key: { root: "C", scale: "major" } };
    check("clashes: a device locked, what rules it out is drawn again", [1, 2, 3, 4, 5, 6, 7, 8].every(seed => P.drawPrompt(3, deceptive, ["use", "key"], seeded(seed)).avoid !== "noFive"));
    equal("clashes: locked on both sides, kept as chosen", P.drawPrompt(3, deceptive, ["use", "avoid", "key"], seeded(1)).avoid, "noFive");
    equal("clashes: the same device twice is one", JSON.stringify(P.clashes({ ...deceptive, avoid: "noRepeat", use2: "deceptive" })), JSON.stringify([["use", "use2"]]));

    // Where to begin.
    const inC = { level: 1, form: "phrase8", key: { root: "C", scale: "major" }, meter: "4/4", tempo: 96, begin: "1", use: "plagal", use2: null, avoid: null };
    equal("begin: Simple begins on a triad, I (C)", JSON.stringify(P.beginChord(inC)), JSON.stringify({ numeral: "I", chord: "C" }));
    equal("begin: Colorful on a seventh, Imaj7 (Cmaj7)", P.beginChord({ ...inC, level: 3 }).chord, "Cmaj7");
    equal("begin: in D dorian, i7 (Dm7)", P.beginChord({ ...inC, level: 3, key: { root: "D", scale: "dorian" } }).chord, "Dm7");
    equal("begin: ♭VI from outside the key, A♭ in C", P.beginChord({ ...inC, level: 4, begin: "b6" }).chord, `A${flat}`);
    equal("begin: but not in A minor, which has its own VI", P.beginChord({ ...inC, level: 4, begin: "b6", key: { root: "A", scale: "minor" } }), null);
    equal("begin: a key's choices leave out what isn't in it", P.choices("begin", 4, { ...inC, level: 4, key: { root: "A", scale: "minor" } }).includes("b6"), false);

    // The sentence.
    const waltz = { level: 3, form: "aaba32", key: { root: "D", scale: "dorian" }, meter: "3/4", tempo: 92, begin: "1", use: "secondary", use2: "borrowed", avoid: "noFive" };
    equal("sentence: as written", P.plainSentence(waltz), "Write a 32-bar AABA in D dorian, in 3/4 at 92 BPM. Begin on i7 (Dm7), use a secondary dominant and a borrowed chord, and avoid the v chord.");
    equal("sentence: without a second device or anything to avoid", P.plainSentence(inC), "Write an 8-bar phrase in C major, in 4/4 at 96 BPM. Begin on I (C) and use a plagal cadence (IV–I).");
    equal("sentence: parts where they go", P.sentence(waltz).filter(word => typeof word !== "string").map(word => word.part).join(), "form,key,meter,tempo,begin,use,use2,avoid");
    equal("articles: an 8-bar, a 12-bar, an 11-bar, a 16-bar, a song", ["8-bar", "12-bar", "11-bar", "16-bar", "song"].map(P.article).join(), "an,a,an,a,a");
    equal("choices: a tempo with its name", P.choiceText(waltz, "tempo", 92), "92 BPM · Andante");

    // Checking a sketch.
    const now = { meter: "3/4", tempo: 90 };
    const sketch = H.cleanChart({ title: "T", root: "D", scale: "dorian", beats: 3, sections: [
        { name: "A", repeat: 2, bars: [["Dm7"], ["E7"], ["Em7", "A7"], ["Dm7"], ["%"], ["Gm7"], ["Em7"], ["A7"]] },
        { name: "B", repeat: 1, bars: [["Cmaj7"], ["Cmaj7"], ["Fmaj7"], ["Fmaj7"], ["Em7"], ["Em7"], ["A7"], ["A7"]] },
        { name: "A", repeat: 1, bars: [["Dm7"], ["E7"], ["Em7", "A7"], ["Dm7"], ["Dm7"], ["Gm7"], ["Em7"], ["Dm7"]] }
    ] });
    const results = P.checkPrompt(waltz, sketch, now);
    equal("checks: key, time, tempo within 4 BPM, form and beginning met", ["key", "meter", "tempo", "form", "begin"].filter(part => !results[part].met).join(), "");
    equal("checks: a secondary dominant found, where", results.use.why, "E7 (V7/v) in A, bar 2.");
    equal("checks: a borrowed chord found, from the parallel key", results.use2.why, "A7 (from D major) in A, bar 3.");
    equal("checks: something to avoid found, where", JSON.stringify(results.avoid), JSON.stringify({ met: false, why: "A7 in A, bar 3." }));
    const off = P.checkPrompt(waltz, chart(["C", "F", "G", "C"]), { meter: "4/4", tempo: 120 });
    equal("checks: a sketch that meets none, and why", ["key", "meter", "tempo", "form", "begin", "use", "use2"].filter(part => off[part].met).join(), "");
    equal("checks: the form's why compares them", off.form.why, "The sketch has 1 section and 4 bars as played; the form has 3 and 32.");

    // Each device: found in a sketch that has it, not in one that doesn't.
    const plain = chart(["C", "C", "C", "C"]);
    const has = {
        plagal: chart(["C", "F", "C"]), twoFiveOne: chart(["Dm7", "G7", "Cmaj7"]), sus: chart(["Csus4", "C"]), inversion: chart(["C", "C/E", "F"]),
        deceptive: chart(["C", "G7", "Am"]), secondary: chart(["C", "A7", "Dm"]), borrowed: chart(["C", "Fm", "C"]), diminished: chart(["C", "C♯°7", "Dm"]),
        tritone: chart(["Dm7", `D${flat}7`, "Cmaj7"]), backdoor: chart(["Fm7", `B${flat}7`, "Cmaj7"]),
        modulation: chart(["C", "G"], "C", "major", [{ name: "B", repeat: 1, bars: [["E"], ["B7"], ["E"]] }]),
        neapolitan: chart([`D${flat}`, "G7", "C"]), mediant: chart(["C", "E", "C"]), pedal: chart(["C", "F/C", "G/C", "C"])
    };
    const devices = P.USES.map(device => device.id);
    const key = { root: "C", scale: "major" };
    equal("devices: each has a sketch here", devices.filter(id => !has[id]).join(), "");
    equal("devices: each found where it is", devices.filter(id => !P.USES.find(each => each.id === id).check(P.sequence(has[id]), key, has[id]).met).join(), "");
    equal("devices: none found in four bars of C", devices.filter(id => P.USES.find(each => each.id === id).check(P.sequence(plain), key, plain).met).join(), "");
    const avoids = {
        noFive: chart(["C", "G", "C"]), noFour: chart(["C", "F", "C"]), noSevenths: chart(["C", "G7", "C"]), noRepeat: chart(["C", "C", "G"]),
        noEarlyTonic: chart(["C", "G", "C"]), noTriads: chart(["Cmaj7", "G"]), noDominants: chart(["C", "G7"])
    };
    equal("avoids: each found where it is", P.AVOIDS.filter(avoid => avoid.check(P.sequence(avoids[avoid.id]), key, avoids[avoid.id]).met).map(avoid => avoid.id).join(), "");
    equal("avoids: the I before the last bar, but not in it", P.AVOIDS.find(avoid => avoid.id === "noEarlyTonic").check(P.sequence(chart(["F", "G", "C"])), key, chart(["F", "G", "C"])).met, true);

    // The sketch a prompt opens as.
    const opened = P.promptSketch(waltz);
    equal("sketch: the form's sections, bars and repeats", opened.sections.map(section => `${section.name}:${section.bars.length}x${section.repeat}`).join(" "), "A:8x2 B:8x1 A:8x1");
    equal("sketch: begins on its chord, then the key's first to write over", [opened.sections[0].bars[0][0], opened.sections[0].bars[1][0], opened.sections[2].bars[7][0]].join(), "Dm7,Dm7,Dm7");
    equal("sketch: titled, in the key, the time signature with it", [opened.title, opened.root, opened.scale, opened.meter, opened.beats].join("|"), "32-bar AABA in D dorian|D|dorian|3/4|3");
    equal("sketch: triads where seventh chords are to be avoided", P.promptSketch({ ...waltz, avoid: "noSevenths", use: "secondary", use2: "sus" }).sections[0].bars[1][0], "Dm");
    equal("sketch: it meets its own form, key and beginning", ["form", "key", "begin"].filter(part => !P.checkPrompt(waltz, opened, now)[part].met).join(), "");

    // Kept prompts are checked as they're read.
    const bad = [null, [], { ...waltz, level: 6 }, { ...waltz, form: "sonata" }, { ...waltz, key: { root: "H", scale: "major" } }, { ...waltz, key: { root: "C", scale: "blues" } },
        { ...waltz, tempo: 500 }, { ...waltz, tempo: "92" }, { ...waltz, use: "magic" }, { ...waltz, avoid: "everything" }, { ...waltz, meter: "5/3" }, { ...waltz, begin: "b6", key: { root: "A", scale: "minor" } }];
    equal("kept: malformed prompts are refused", bad.map(P.cleanPrompt).filter(Boolean).length, 0);
    equal("kept: a part the level doesn't have is dropped", P.cleanPrompt({ ...inC, use2: "sus", avoid: "noFive" }).use2, null);
    equal("kept: locks are known parts, once each", P.cleanLocked(["key", "key", "nope", 3, "avoid"]).join(), "key,avoid");
})();
