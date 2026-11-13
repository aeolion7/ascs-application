"use strict";

// The metronome's rules (2.3.0).
(function () {
    const M = globalThis.MaestroMetronome;
    const { check, equal } = globalThis.TestHarness;

    equal("tempo: rounded", M.clampTempo("96.4"), 96);
    equal("tempo: held at the slowest", M.clampTempo(5), M.MIN);
    equal("tempo: held at the fastest", M.clampTempo(1000), M.MAX);
    equal("tempo: words aren't one", M.clampTempo("fast"), null);
    equal("tempo: nothing isn't one", M.clampTempo(undefined), null);
    equal("tempo: an emptied box isn't 30", M.clampTempo(""), null);
    equal("tempo: nor are spaces", M.clampTempo("  "), null);

    equal("name: the slowest", M.tempoName(30), "Grave");
    equal("name: Andante from 76", M.tempoName(76), "Andante");
    equal("name: Andante to 107", M.tempoName(107), "Andante");
    equal("name: Moderato at 108", M.tempoName(108), "Moderato");
    equal("name: Allegro", M.tempoName(132), "Allegro");
    equal("name: the fastest", M.tempoName(300), "Prestissimo");

    equal("tap: one tap is no tempo", M.tapTempo([1000]), null);
    equal("tap: two taps half a second apart", M.tapTempo([1000, 1500]), 120);
    equal("tap: the average of the last four gaps", M.tapTempo([0, 10, 1000, 1600, 2200, 2800, 3400]), 100);
    equal("tap: a pause over two seconds starts again", M.tapTempo([0, 500, 1000, 4000, 4600]), 100);
    equal("tap: one tap after a pause is no tempo", M.tapTempo([0, 500, 5000]), null);
    equal("tap: held at the fastest", M.tapTempo([0, 50, 100]), M.MAX);

    // Weights: 3 starts the bar, 2 is a lesser accent, 1 a beat, 0 between beats.
    equal("4/4: the first beat", M.pulseWeight({ beat: 0, sub: 0 }, "4/4"), 3);
    equal("4/4: the second", M.pulseWeight({ beat: 1, sub: 0 }, "4/4"), 1);
    equal("6/8: the fourth is a lesser accent", M.pulseWeight({ beat: 3, sub: 0 }, "6/8"), 2);
    equal("between beats", M.pulseWeight({ beat: 0, sub: 1 }, "4/4"), 0);
    equal("an unknown meter counts as 4/4", M.pulseWeight({ beat: 0, sub: 0 }, "9/9"), 3);
    equal("12/8: four groups of three", M.METERS["12/8"].join(""), "311211211211");
    equal("7/8 (3+2+2)", M.METERS["7/8:3+2+2"].join(""), "3112121");
    equal("5/8 (2+3)", M.METERS["5/8:2+3"].join(""), "31211");
    equal("odd meters name their groups", M.meterLabel("7/8:2+3+2"), "7/8 (2+3+2)");
    equal("the default grouping is named too", M.meterLabel("7/8"), "7/8 (2+2+3)");
    equal("others are plain", M.meterLabel("12/8"), "12/8");
    check("every time signature is listed once", M.METER_GROUPS.flatMap(([, meters]) => meters).sort().join() === Object.keys(M.METERS).sort().join());
    check("each starts its bar", Object.values(M.METERS).every(weights => weights[0] === 3 && weights.slice(1).every(weight => weight === 1 || weight === 2)));
    equal("a grouping is kept", M.parseSettings(JSON.stringify({ meter: "7/8:3+2+2" })).meter, "7/8:3+2+2");
    equal("a beat past the bar's end is a plain beat", M.pulseWeight({ beat: 4, sub: 0 }, "3/4"), 1);

    // A bar of 3/4 in eighths: six clicks, then the bar ends.
    let position = { beat: 0, sub: 0 };
    const seen = [];
    let ended = 0;
    for (let i = 0; i < 6; i++) {
        seen.push(`${position.beat}.${position.sub}`);
        const next = M.advance(position, "3/4", "eighth");
        position = next.position;
        if (next.barEnded) ended += 1;
    }
    equal("advance: a bar of 3/4 in eighths", seen.join(" "), "0.0 0.1 1.0 1.1 2.0 2.1");
    check("advance: and the bar ends once, back at the start", ended === 1 && position.beat === 0 && position.sub === 0);
    const triplet = M.advance({ beat: 1, sub: 2 }, "4/4", "triplet");
    check("advance: a triplet's last click goes to the next beat", triplet.position.beat === 2 && triplet.position.sub === 0 && !triplet.barEnded);
    check("advance: a count past a shortened bar ends it", M.advance({ beat: 3, sub: 0 }, "2/4", "quarter").barEnded);

    equal("seconds: 120 BPM, each beat", M.secondsPerClick(120, "quarter"), 0.5);
    equal("seconds: 120 BPM, sixteenths", M.secondsPerClick(120, "sixteenth"), 0.125);
    equal("seconds: 90 BPM, triplets", Math.round(M.secondsPerClick(90, "triplet") * 1e6) / 1e6, 0.222222);

    const trainer = { on: true, from: 80, to: 120, step: 4, every: 8 };
    equal("trainer: a step up", M.trainerNext(96, trainer), 100);
    equal("trainer: never past the top", M.trainerNext(118, trainer), 120);
    equal("trainer: holds at the top", M.trainerNext(120, trainer), 120);
    equal("trainer: bars to the first step", M.barsUntilStep(0, trainer), 8);
    equal("trainer: bars to the next step", M.barsUntilStep(13, trainer), 3);

    const fresh = M.parseSettings(null);
    check("settings: nothing kept gives the defaults", fresh.tempo === 96 && fresh.meter === "4/4" && fresh.count === "quarter" && fresh.sound === "woodblock" && fresh.volume === 70 && fresh.trainer.on === false);
    check("settings: junk gives the defaults", M.parseSettings("{nope").tempo === 96 && M.parseSettings("[1,2]").meter === "4/4");
    const kept = M.parseSettings(JSON.stringify({ tempo: 132, meter: "6/8", count: "triplet", sound: "click", volume: 40, trainer: { on: true, from: 60, to: 90, step: 2, every: 4 }, countIn: 1, gap: { on: true, play: 3, mute: 1 } }));
    equal("settings: what was kept is read", JSON.stringify(kept), JSON.stringify({ tempo: 132, meter: "6/8", count: "triplet", sound: "click", volume: 40, trainer: { on: true, from: 60, to: 90, step: 2, every: 4 }, countIn: 1, gap: { on: true, play: 3, mute: 1 } }));
    const oldKept = M.parseSettings(JSON.stringify({ tempo: 100 }));
    check("settings: kept before 2.3.0's practice, no count-in and no muted bars", oldKept.countIn === 0 && oldKept.gap.on === false && oldKept.gap.play === 2 && oldKept.gap.mute === 2);
    const badPractice = M.parseSettings(JSON.stringify({ countIn: 3, gap: { on: "yes", play: 0, mute: 9 } }));
    check("settings: a wrong count-in or muted bars fall back", badPractice.countIn === 0 && badPractice.gap.on === false && badPractice.gap.play === 2 && badPractice.gap.mute === 2);
    // Muted bars.
    const gap = { on: true, play: 2, mute: 1 };
    equal("muted bars: play two, mute one", [0, 1, 2, 3, 4, 5].map(bar => M.barIsMuted(bar, gap) ? "x" : "o").join(""), "ooxoox");
    check("muted bars: off mutes nothing", ![0, 1, 2, 3].some(bar => M.barIsMuted(bar, { ...gap, on: false })));
    // Practice time.
    const day = new Date(2026, 10, 13, 21, 30);
    equal("practice: a day's key is local", M.dayKey(day), "2026-11-13");
    let log = M.addPractice({}, day, 600);
    log = M.addPractice(log, day, 330.4);
    equal("practice: a day's time adds up", log["2026-11-13"], 930);
    log = M.addPractice(log, new Date(2026, 10, 10), 3600);
    log = M.addPractice(log, new Date(2026, 10, 1), 60);
    const summary = M.practiceSummary(log, day);
    check("practice: today, and the last seven days", summary.today === 930 && summary.week === 4530);
    let long = {};
    for (let back = 0; back < 20; back++) long = M.addPractice(long, new Date(2026, 10, 13 - back), 60);
    check("practice: only the last 14 days are kept", Object.keys(long).length === 14 && long["2026-11-13"] === 60 && !long["2026-10-25"]);
    equal("practice: hostile kept time is dropped", JSON.stringify(M.parsePractice(JSON.stringify({ "2026-11-13": 60, "__proto__": 5, "2026-11-12": -4, "x": 3, "2026-11-11": 999999 }))), JSON.stringify({ "2026-11-13": 60 }));
    equal("practice: in words", [20, 60, 1500, 3600, 3900].map(M.practiceText).join(" | "), "under a minute | 1 min | 25 min | 1 h | 1 h 5 min");
    const wrong = M.parseSettings(JSON.stringify({ tempo: 900, meter: "<b>", count: "toString", sound: "constructor", volume: 101, trainer: { on: "yes", from: 10, to: 1000, step: 0, every: 99 } }));
    check("settings: each wrong value falls back alone", wrong.tempo === 96 && wrong.meter === "4/4" && wrong.count === "quarter" && wrong.sound === "woodblock" && wrong.volume === 70);
    check("settings: and the trainer's too", wrong.trainer.on === false && wrong.trainer.from === 80 && wrong.trainer.to === 120 && wrong.trainer.step === 4 && wrong.trainer.every === 8);
    const backwards = M.cleanTrainer({ on: true, from: 140, to: 100, step: 5, every: 2 });
    check("trainer: From above To falls back to both defaults", backwards.from === 80 && backwards.to === 120 && backwards.step === 5 && backwards.on);
    check("settings: fractions aren't tempos", M.parseSettings(JSON.stringify({ tempo: 96.5 })).tempo === 96);
})();
