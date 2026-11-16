// Rhythm (2.6.0): the kit, patterns in every meter, Euclidean spreads, swing,
// grooves, rhythms as kept (and hostile ones), the trainer's cycles and taps,
// the Quiz's bars and grading, and rhythms written out.
(() => {
    const R = globalThis.MaestroRhythm;
    const M = globalThis.MaestroMetronome;
    const { check, equal } = globalThis.TestHarness;
    const seeded = seed => () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const cells = text => [...text].map(Number);
    const near = (a, b) => Math.abs(a - b) < 1e-9;

    // ---- The kit and meters
    equal("rhythm: twelve sounds, each named", R.SOUNDS.length, 12);
    check("rhythm: every sound has a label", R.SOUNDS.every(sound => typeof R.KIT[sound].label === "string" && R.KIT[sound].label.length > 0));
    for (const meter of Object.keys(M.METERS)) {
        const info = R.meterInfo(meter);
        equal(`rhythm: ${meter} has the metronome's beats`, info.beats, M.METERS[meter].length);
        equal(`rhythm: ${meter}'s groups add up to its beats`, info.groups.reduce((a, b) => a + b, 0), info.beats);
        equal(`rhythm: ${meter} offers ${info.unit === 8 ? "1 or 2" : "1 to 4"} steps a beat`, R.stepsFor(meter).join(), info.unit === 8 ? "1,2" : "1,2,3,4");
        const fresh = R.newRhythm({ meter, steps: 2 });
        check(`rhythm: a new rhythm in ${meter} is whole`, fresh !== null && fresh.rows.every(row => row.hits.length === R.barSteps(meter, fresh.steps)));
    }
    equal("rhythm: 7/8 (2+2+3)'s groups", R.meterInfo("7/8").groups.join("+"), "2+2+3");
    equal("rhythm: 7/8 (3+2+2)'s groups", R.meterInfo("7/8:3+2+2").groups.join("+"), "3+2+2");
    equal("rhythm: 7/8 shows 7 over 8", `${R.meterInfo("7/8:2+3+2").shownBeats}/${R.meterInfo("7/8:2+3+2").unit}`, "7/8");
    equal("rhythm: an unknown meter reads as 4/4", R.meterInfo("13/16").beats, 4);
    equal("rhythm: a new rhythm in 6/8 asked for 4 steps takes 1", R.newRhythm({ meter: "6/8", steps: 4 }).steps, 1);

    // ---- Euclidean spreads
    equal("rhythm: E(3,8) is the tresillo", R.euclid(3, 8).join(""), "10010010");
    equal("rhythm: E(5,8)", R.euclid(5, 8).join(""), "10101101");
    equal("rhythm: E(4,16) is four on the floor", R.euclid(4, 16).join(""), "1000100010001000");
    equal("rhythm: E(3,8) turned by 2", R.euclid(3, 8, 2).join(""), "10100100");
    equal("rhythm: E(3,8) turned by -1", R.euclid(3, 8, -1).join(""), "00100101");
    equal("rhythm: E(0,5) is silent", R.euclid(0, 5).join(""), "00000");
    equal("rhythm: E(9,4) fills every step", R.euclid(9, 4).join(""), "1111");
    equal("rhythm: E(3,0) is nothing", R.euclid(3, 0).length, 0);
    for (let n = 1; n <= 16; n++) for (let k = 0; k <= n; k++) {
        const spread = R.euclid(k, n);
        if (spread.reduce((a, b) => a + b, 0) !== k) check(`rhythm: E(${k},${n}) has ${k} hits`, false);
        const gaps = [];
        const at = spread.flatMap((cell, i) => (cell ? [i] : []));
        at.forEach((i, j) => gaps.push(((at[(j + 1) % at.length] - i + n) % n) || n));
        if (k > 0 && Math.max(...gaps) - Math.min(...gaps) > 1) check(`rhythm: E(${k},${n}) is spread evenly`, false);
    }
    check("rhythm: every Euclidean spread up to 16 has its hits, evenly", true);

    // ---- Swing
    equal("rhythm: straight eighths", R.stepOffsets(2, 50).join(), "0,0.5");
    check("rhythm: triplet swing puts the second eighth two thirds in", near(R.stepOffsets(2, 66.667)[1], 0.66667));
    equal("rhythm: swung sixteenths", R.stepOffsets(4, 75).join(), "0,0.375,0.5,0.875");
    equal("rhythm: triplets don't swing", R.stepOffsets(3, 70).map(x => x.toFixed(3)).join(), "0.000,0.333,0.667");
    equal("rhythm: beats don't swing", R.stepOffsets(1, 70).join(), "0");
    equal("rhythm: swing is held at 75", R.stepOffsets(2, 90)[1], 0.75);

    // ---- Patterns
    const funk = R.GROOVES.find(each => each.id === "funk").rhythm;
    equal("rhythm: the funk groove's first step", R.hitsAt(funk, 0).map(hit => `${hit.sound}${hit.accent ? "!" : ""}`).join(), "hatClosed!,kick");
    equal("rhythm: steps repeat each row's length", R.hitsAt(funk, 16 + 4).map(hit => hit.sound).join(), "hatClosed,snare");
    check("rhythm: every groove is whole", R.GROOVES.every(each => each.rhythm !== null && each.rhythm.rows.length > 0));
    check("rhythm: every groove's rows are a bar", R.GROOVES.every(each => each.rhythm.rows.every(row => row.hits.length === R.barSteps(each.rhythm.meter, each.rhythm.steps) * each.rhythm.bars)));
    equal("rhythm: grooves have their own ids", new Set(R.GROOVES.map(each => each.id)).size, R.GROOVES.length);
    const poly = R.cleanRhythm({ title: "3 over 4", meter: "4/4", steps: 1, bars: 1, swing: 50, rows: [{ sound: "clave", hits: [1, 0, 0] }, { sound: "kick", hits: [1, 0, 0, 0] }] });
    equal("rhythm: rows of 3 and 4 meet again after 12 steps", [0, 3, 4, 6, 8, 9, 12].map(step => R.hitsAt(poly, step).length).join(), "2,1,1,1,1,1,2");
    const muted = R.cleanRhythm({ ...poly, rows: [{ ...poly.rows[0], on: false }, poly.rows[1]] });
    equal("rhythm: a row turned off is silent", R.hitsAt(muted, 0).map(hit => hit.sound).join(), "kick");
    equal("rhythm: a row made longer repeats its cells", R.resizeRow({ sound: "kick", on: true, hits: [1, 0, 2] }, 7).hits.join(""), "1021021");
    equal("rhythm: a row made shorter is cut", R.resizeRow({ sound: "kick", on: true, hits: [1, 0, 2, 1] }, 2).hits.join(""), "10");

    // ---- As kept
    const text = R.rhythmText(funk);
    equal("rhythm: written as kept", text.split("\n").slice(0, 4).join("|"), "Maestro rhythm 1|Funk sixteenths|meter\t4/4|steps\t4\tbars\t1\tswing\t50");
    equal("rhythm: read back the same", R.rhythmText(R.readRhythm(text)), text);
    equal("rhythm: read with Windows line breaks", R.rhythmText(R.readRhythm(text.replace(/\n/g, "\r\n"))), text);
    const swung = R.GROOVES.find(each => each.id === "swing").rhythm;
    equal("rhythm: swing is kept", R.readRhythm(R.rhythmText(swung)).swing, 66);
    const bad = {
        "no header": text.replace("Maestro rhythm 1", "Maestro rhythm 2"),
        "an unknown meter": text.replace("meter\t4/4", "meter\t11/8"),
        "steps the meter doesn't take": R.rhythmText(R.GROOVES.find(each => each.id === "bembe").rhythm).replace("steps\t2", "steps\t4"),
        "five bars": text.replace("bars\t1", "bars\t5"),
        "swing past 75": text.replace("swing\t50", "swing\t80"),
        "swing under 50": text.replace("swing\t50", "swing\t40"),
        "an unknown sound": text.replace("row\tkick", "row\tgong"),
        "a cell of 3": text.replace("row\tkick\ton\t1", "row\tkick\ton\t3"),
        "a row too long": text.replace(/row\tkick\ton\t[012]+/, `row\tkick\ton\t${"1".repeat(65)}`),
        "an empty row": text.replace(/row\tkick\ton\t[012]+/, "row\tkick\ton\t"),
        "nine rows": [text, ...Array(6).fill("row\tkick\ton\t1")].join("\n"),
        "no rows": text.split("\n").slice(0, 4).join("\n"),
        "a title with a quote": text.replace("Funk sixteenths", 'Funk "sixteenths"'),
        "a title with a tab": text.replace("Funk sixteenths", "Funk\tsixteenths"),
        "a title too long": text.replace("Funk sixteenths", "x".repeat(61)),
        "an empty title": text.replace("Funk sixteenths", ""),
        "a row's state missing": text.replace("row\tkick\ton\t", "row\tkick\t"),
        "markup in a sound": text.replace("row\tkick", "row\t<img>"),
        "a script": "<script>alert(1)</script>"
    };
    for (const [why, each] of Object.entries(bad)) equal(`rhythm: refused, ${why}`, R.readRhythm(each), null);
    equal("rhythm: a row 4 bars of 12/8 sixteenths long is kept", R.readRhythm(["Maestro rhythm 1", "Long", "meter\t12/8", "steps\t2\tbars\t4\tswing\t50", `row\tkick\ton\t${"1".repeat(96)}`].join("\n"))?.rows[0].hits.length, 96);
    equal("rhythm: a cleaned rhythm keeps nothing it shouldn't", Object.keys(R.cleanRhythm({ ...funk, extra: "<b>" })).join(), "title,meter,steps,bars,swing,rows");

    // ---- The trainer
    const threeTwo = R.trainerCycle({ kind: "polyrhythm", a: 3, b: 2 });
    equal("rhythm: 3:2 lasts two beats", threeTwo.beats, 2);
    equal("rhythm: 3:2's events", threeTwo.events.map(event => `${event.layer}@${event.at.toFixed(2)}`).join(" "), "0@0.00 1@0.00 0@0.67 1@1.00 0@1.33");
    equal("rhythm: 3:2 on a grid", R.trainerGrid({ kind: "polyrhythm", a: 3, b: 2 }).map(step => step.join("+") || "-").join(" "), "0+1 - 0 1 0 -");
    equal("rhythm: 4:3 on a grid has twelve steps", R.trainerGrid({ kind: "polyrhythm", a: 4, b: 3 }).length, 12);
    const threeFour = R.trainerCycle({ kind: "polymeter", a: 3, b: 4 });
    equal("rhythm: 3 over 4 meets again after 12 pulses", threeFour.beats, 12);
    equal("rhythm: 3 over 4's first layer", threeFour.events.filter(event => event.layer === 0).map(event => event.at).join(), "0,3,6,9");
    equal("rhythm: 3 over 4's second layer", threeFour.events.filter(event => event.layer === 1).map(event => event.at).join(), "0,4,8");
    equal("rhythm: 3 over 4's other pulses", threeFour.events.filter(event => event.layer === -1).map(event => event.at).join(), "1,2,5,7,10,11");
    for (let a = R.TRAINER_MIN; a <= R.TRAINER_MAX; a++) for (let b = R.TRAINER_MIN; b <= R.TRAINER_MAX; b++) {
        const cycle = R.trainerCycle({ kind: "polyrhythm", a, b });
        const count = layer => cycle.events.filter(event => event.layer === layer).length;
        if (count(0) !== a || count(1) !== b || cycle.events.some(event => event.at < 0 || event.at >= b)) check(`rhythm: ${a}:${b} is whole`, false);
    }
    check("rhythm: every polyrhythm from 2:2 to 9:9 has its notes in its span", true);
    const times = [0, 0.5, 1, 1.5];
    const late = R.scoreTap(times, 1.02);
    check("rhythm: a tap 20 ms late", late.index === 2 && Math.abs(late.error - 0.02) < 1e-9);
    equal("rhythm: a tap early goes to the next note", R.scoreTap(times, 0.48).index, 1);
    equal("rhythm: a tap further than half the spacing isn't counted", R.scoreTap([0, 0.5], 0.9), null);
    equal("rhythm: a tap with nothing to hit", R.scoreTap([], 1), null);
    equal("rhythm: steady taps", R.tapSummary([0.01, -0.02, 0.015]).word, "Steady");
    equal("rhythm: taps a little off", R.tapSummary([0.05, -0.06, 0.04]).word, "Close");
    equal("rhythm: taps early", R.tapSummary([-0.12, -0.09, -0.1]).word, "Rushing");
    equal("rhythm: taps late", R.tapSummary([0.12, 0.09, 0.1]).word, "Dragging");
    equal("rhythm: a missed note is said", R.tapSummary([0.01], 1).word, "Some missed");
    check("rhythm: steady is all hit and close", R.isSteady(R.tapSummary([0.01, 0.02])) && !R.isSteady(R.tapSummary([0.01], 1)) && !R.isSteady(R.tapSummary([])));

    // ---- The Quiz
    for (const level of Object.keys(R.QUIZ_LEVELS)) {
        const random = seeded(level.length * 97);
        for (let i = 0; i < 40; i++) {
            const bar = R.quizBar(level, random);
            const info = R.meterInfo(bar.meter);
            if (bar.cells.length !== info.beats * bar.steps || bar.cells[0] !== 1 || !R.QUIZ_LEVELS[level].steps.includes(bar.steps)) check(`rhythm: a ${level} bar is whole`, false);
        }
        check(`rhythm: forty ${level} bars, each whole and starting on a note`, true);
    }
    const graded = R.gradeCells(cells("10110000"), cells("10100000"));
    equal("rhythm: a bar written with one step wrong", `${graded.right}/${graded.total} ${graded.all}`, "7/8 false");
    check("rhythm: a bar written right", R.gradeCells(cells("1011"), cells("1011")).all);
    const tapped = R.gradeTaps([0, 0.5, 1, 1.5], [0.03, 0.47, 1.2, 1.51, 1.8]);
    equal("rhythm: taps graded: notes hit", tapped.hit, 3);
    equal("rhythm: taps graded: extra taps", tapped.extra, 2);
    check("rhythm: taps graded: the third note missed", tapped.notes[2].error === null && !tapped.all);
    check("rhythm: every note hit once is all", R.gradeTaps([0, 1], [0.01, 0.99]).all);

    // ---- Written out
    const spell = (hits, meter = "4/4", steps = 4) => R.spellRow(cells(hits), meter, steps).flat().map(beat => (beat.triplet ? "3:" : "") + beat.tokens.map(token => `${token.rest ? "r" : ""}${token.d}${token.dot ? "." : ""}${token.accent ? "!" : ""}`).join(" ")).join(" | ");
    equal("rhythm: sixteenth figures", spell("1000" + "1010" + "1111" + "1001"), "q | e e | s s s s | e. s");
    equal("rhythm: rests in sixteenths", spell("0000" + "0100" + "0001" + "0010"), "rq | rs e. | re. s | re e");
    equal("rhythm: eighths", spell("10" + "11" + "01" + "00", "4/4", 2), "q | e e | re e | rq");
    equal("rhythm: triplets", spell("100" + "111" + "110" + "000", "4/4", 3), "q | 3:e e e | 3:e q | rq");
    equal("rhythm: an accent", spell("2000" + "0000" + "0000" + "0000"), "q! | rq | rq | rq");
    equal("rhythm: 6/8 in eighths", spell("101101", "6/8", 1), "e | re | e | e | re | e");
    equal("rhythm: 6/8 in sixteenths", spell("10" + "11" + "00" + "10" + "01" + "10", "6/8", 2), "e | s s | re | e | rs s | e");
    equal("rhythm: 2/2 in eighths", spell("1000" + "1001", "2/2", 4), "h | q. e");
    equal("rhythm: two bars", R.spellRow(cells("1000".repeat(8)), "4/4", 4).length, 2);
    const drawn = R.engraveRhythm(funk.rows, funk.meter, funk.steps);
    check("rhythm: written out, a staff line a row", drawn.items.filter(item => item.class === "staff-line").length === funk.rows.length);
    check("rhythm: written out, every step placed", new Set(drawn.steps.map(each => each.step)).size === 16);
    check("rhythm: written out, the hats with crosses", drawn.items.some(item => item.text === String.fromCodePoint(0xE0A9)));
    check("rhythm: written out, sixteenths beamed twice", drawn.items.filter(item => item.kind === "beam").length >= 8);
    check("rhythm: written out, each row named", ["Closed hat", "Snare", "Kick"].every(label => drawn.items.some(item => item.kind === "text" && item.text === label)));
    const narrow = R.engraveRhythm([{ sound: "kick", hits: cells("1000".repeat(16)) }], "4/4", 4, { maxWidth: 600 });
    check("rhythm: written out narrow, four bars wrap", narrow.systems.length > 1 && narrow.width <= 600 + 10);
    const triplet = R.engraveRhythm([{ sound: "snare", hits: cells("111".repeat(4)) }], "4/4", 3);
    equal("rhythm: written out, a 3 over each triplet beat", triplet.items.filter(item => item.text === String.fromCodePoint(0xE883)).length, 4);
})();
