"use strict";

(function () {
    const A = globalThis.MaestroAttention;
    const { check, equal } = globalThis.TestHarness;

    equal("nothing is wrong, nothing is listed", A.fromMetrics({ cpu: 10, ram: 10, drives: [] }).items.length, 0);
    equal("no data is safe", A.fromMetrics(null).items.length, 0);
    equal("junk data is safe", A.fromMetrics({ cpu: "x", ram: {}, drives: "no" }).items.length, 0);

    // One spike doesn't raise it; staying high does.
    const none = () => "";
    let streaks = {};
    let step = A.fromMetrics({ cpu: 99, ram: 10 }, streaks, none, 0); streaks = step.streaks;
    equal("one high reading isn't listed", step.items.length, 0);
    step = A.fromMetrics({ cpu: 99, ram: 10 }, streaks, none, 5000); streaks = step.streaks;
    equal("nor two", step.items.length, 0);
    step = A.fromMetrics({ cpu: 94.6, ram: 10 }, streaks, none, 10000); streaks = step.streaks;
    equal("three in a row are", step.items[0]?.title, "Processor at 95%");
    step = A.fromMetrics({ cpu: 12, ram: 10 }, streaks, none, 15000); streaks = step.streaks;
    equal("a normal reading clears it", step.items.length, 0);
    step = A.fromMetrics({ cpu: 99, ram: 10 }, streaks, none, 20000);
    equal("and the count starts over", step.items.length, 0);

    let ram = {};
    for (let i = 0; i < 3; i++) { step = A.fromMetrics({ cpu: 1, ram: 90 }, ram, none, i * 5000); ram = step.streaks; }
    equal("memory counts at exactly 90", step.items[0]?.key, "ram");

    // Live reads every second, which mustn't turn 10 seconds into 3.
    let quick = {};
    for (let second = 0; second <= 5; second++) { step = A.fromMetrics({ cpu: 99, ram: 10 }, quick, none, second * 1000); quick = step.streaks; }
    equal("six readings in 5 seconds count as two", quick.cpu, 2);
    equal("so nothing is listed yet", step.items.length, 0);
    for (let second = 6; second <= 10; second++) { step = A.fromMetrics({ cpu: 99, ram: 10 }, quick, none, second * 1000); quick = step.streaks; }
    equal("10 seconds high is", step.items[0]?.key, "cpu");
    step = A.fromMetrics({ cpu: 10, ram: 10 }, quick, none, 10500);
    equal("a normal reading clears it between counted ones", step.streaks.cpu, 0);

    // A drive counts at once.
    const format = (used, total) => `${used} of ${total}`;
    const drive = A.fromMetrics({ drives: [{ online: true, letter: "J:", usage: 93.6, used: "3.5", total: "3.7" }, { online: false, letter: "K:", usage: 99 }, { online: true, letter: "C:", usage: 40 }, null] }, {}, format).items;
    equal("only the online, full drive is listed", drive.length, 1);
    equal("its title has no stray colon", drive[0].title, "Drive J is 94% full");
    equal("its detail is the capacity", drive[0].detail, "3.5 of 3.7");
    equal("it opens System", drive[0].action, "system");

    // Page errors.
    equal("one page error", A.pageError(1, "boom").title, "Page error");
    equal("several", A.pageError(3, "boom").title, "3 page errors");
    equal("they open the log", A.pageError(1, "boom").action, "log");
    equal("a long message is cut", A.pageError(1, "x".repeat(500)).detail.length, 200);

    // Dismissing lasts until the problem clears.
    const dismissed = new Set(["drive:J"]);
    const items = [{ key: "drive:J", tone: "gold" }, { key: "cpu", tone: "gold" }];
    equal("a dismissed item is hidden", A.visible(items, dismissed).length, 1);
    A.forgetCleared(dismissed, items);
    check("it stays dismissed while it's still true", dismissed.has("drive:J"));
    A.forgetCleared(dismissed, [{ key: "cpu", tone: "gold" }]);
    check("once it clears, it's forgotten", !dismissed.has("drive:J"));

    equal("one needs", A.label(1), "1 needs attention");
    equal("several need", A.label(3), "3 need attention");
    equal("gold by default", A.tone([{ tone: "gold" }]), "gold");
    equal("burgundy if anything is an error", A.tone([{ tone: "gold" }, { tone: "burgundy" }]), "burgundy");
})();
