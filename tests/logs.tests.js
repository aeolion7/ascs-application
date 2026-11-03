"use strict";

(function () {
    const L = globalThis.ASCSLogs;
    const { check, equal } = globalThis.TestHarness;

    const ascs = L.parseLog("ascs", "\uFEFF2026-11-02 23:59:01 | ASCS 1.7.0 initialized.\r\n2026-11-03 00:09:50 | Settings save failed: bad key\n2026-11-03 00:10:02 | Almanac featured feed unavailable: timed out\n   continued detail\n\n");
    equal("ASCS log lines parsed", ascs.length, 4);
    equal("BOM stripped from first line", ascs[0].text, "ASCS 1.7.0 initialized.");
    equal("ASCS day and clock", `${ascs[1].day} ${ascs[1].clock}`, "2026-11-03 00:09:50");
    equal("failure is an error", ascs[1].level, "error");
    equal("unavailable is a warning", ascs[2].level, "warn");
    equal("ordinary line is info", ascs[0].level, "info");
    equal("unmatched line keeps the previous time", ascs[3].clock, "00:10:02");
    equal("unmatched line text", ascs[3].text, "continued detail");

    const activity = L.parseLog("activity", "2026-11-03T00:06:05\tlaunch\tClaude quick entry\n2026-11-03T00:07:00\terror\tVivaldi: did not open");
    equal("activity kind", activity[0].kind, "launch");
    equal("activity error kind is an error", activity[1].level, "error");

    const code = L.parseLog("codebutton", "2026-11-02 21:26:15.608 [27356] Completed successfully\n2026-11-02 21:26:16.001 [27356] ERROR: mutex wait failed");
    equal("code button pid as kind", code[0].kind, "#27356");
    equal("code button error", code[1].level, "error");

    equal("unknown source parses nothing", L.parseLog("../../secrets", "x").length, 0);
    equal("non-string text parses nothing", L.parseLog("ascs", null).length, 0);
    check("control characters removed", !/[\u0000-\u0008]/.test(L.parseLog("ascs", "2026-11-03 00:00:00 | a\u0007b")[0].text));
    equal("long lines capped", L.parseLog("ascs", "2026-11-03 00:00:00 | " + "x".repeat(5000))[0].text.length, 2000 - 22);

    equal("all keeps everything", L.filterEntries(ascs).length, 4);
    equal("issues keeps warnings and errors", L.filterEntries(ascs, "issues").length, 2);
    equal("errors keeps errors only", L.filterEntries(ascs, "errors").length, 1);
    equal("search matches text", L.filterEntries(ascs, "all", "ALMANAC").length, 1);
    equal("search matches kind", L.filterEntries(activity, "all", "launch").length, 1);

    const groups = L.groupByDay(ascs);
    equal("newest day first", groups[0].day, "2026-11-03");
    equal("newest entry first", groups[0].entries[0].text, "continued detail");
    equal("older day second", groups[1].entries.length, 1);

    const today = new Date(2026, 10, 3);
    equal("today label", L.dayLabel("2026-11-03", today), "Today");
    equal("yesterday label", L.dayLabel("2026-11-02", today), "Yesterday");
    equal("older label", L.dayLabel("2026-10-31", today), "Saturday, October 31");
    equal("other year label", L.dayLabel("2025-12-31", today), "Wednesday, December 31, 2025");
    equal("level counts", JSON.stringify(L.counts(ascs)), JSON.stringify({ info: 2, warn: 1, error: 1 }));
})();
