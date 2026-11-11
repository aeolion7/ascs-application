"use strict";

(function () {
    const B = globalThis.MaestroBackups;
    const { check, equal } = globalThis.TestHarness;
    const now = new Date(2026, 10, 10, 20, 0, 0);     // Nov 10, 2026, 8:00 PM
    const base = { enabled: true, time: "1800", folder: "J:\\Maestro-Backups", running: false, off: false, lastTime: "20261110180004", lastResult: "ok", lastDetail: "4,190 files, 72.8 MB", goodTime: "20261110180004" };

    equal("a time is read", B.parseStamp("20261110180004")?.getTime(), new Date(2026, 10, 10, 18, 0, 4).getTime());
    equal("a short time isn't", B.parseStamp("2026111018"), null);
    equal("a 13th month isn't", B.parseStamp("20261310180004"), null);
    equal("a 25th hour isn't", B.parseStamp("20261110250004"), null);
    equal("nothing isn't", B.parseStamp(undefined), null);

    equal("today", B.when(new Date(2026, 10, 10, 16, 9), now), "today at 4:09 PM");
    equal("yesterday", B.when(new Date(2026, 10, 9, 18, 0), now), "yesterday at 6:00 PM");
    equal("yesterday, an hour before midnight, seen an hour after", B.when(new Date(2026, 10, 9, 23, 0), new Date(2026, 10, 10, 0, 30)), "yesterday at 11:00 PM");
    equal("earlier this year", B.when(new Date(2026, 10, 2, 18, 0), now), "on Nov 2 at 6:00 PM");
    equal("another year", B.when(new Date(2025, 11, 31, 18, 0), now), "on Dec 31, 2025 at 6:00 PM");

    equal("6 PM", B.timeLabel("1800"), "6:00 PM");
    equal("midnight", B.timeLabel("0000"), "12:00 AM");
    equal("every hour is offered", B.timeOptions("1800").length, 24);
    equal("in order", B.timeOptions("1800")[18].value, "1800");
    const odd = B.timeOptions("1830");
    check("a time between hours is offered too, in its place", odd.length === 25 && odd[19].value === "1830" && odd[19].label === "6:30 PM");
    equal("a junk time adds nothing", B.timeOptions("soon").length, 24);

    equal("junk state is safe", B.describe(null, now).text, "Choose a folder to turn backups on.");
    equal("junk fields are dropped", JSON.stringify(B.clean({ enabled: "yes", time: "9999", folder: 5, lastResult: "maybe", lastDetail: {}, goodTime: "x" })),
        JSON.stringify({ enabled: false, time: "1800", folder: "", running: false, off: false, last: null, lastResult: "", lastDetail: "", good: null }));
    equal("a long detail is cut", B.clean({ lastDetail: "x".repeat(500) }).lastDetail.length, 200);

    equal("a good backup", B.describe(base, now).text, "Last backup made today at 6:00 PM · 4,190 files, 72.8 MB");
    check("which isn't marked failed", !B.describe(base, now).failed);
    equal("a test build", B.describe({ ...base, off: true }, now).text, "Backups are off in a test build.");
    equal("one under way", B.describe({ ...base, running: true }, now).text, "Backing up…");
    equal("no folder", B.describe({ ...base, folder: "" }, now).text, "Choose a folder to turn backups on.");
    equal("none yet, and on", B.describe({ ...base, lastTime: "", lastResult: "", lastDetail: "", goodTime: "" }, now).text, "No backup yet. The first is made within a minute.");
    equal("none yet, and off", B.describe({ ...base, enabled: false, lastTime: "", lastResult: "", lastDetail: "", goodTime: "" }, now).text, "No backup yet.");
    const failed = { ...base, lastTime: "20261110180004", lastResult: "failed", lastDetail: "Drive J: isn't available.", goodTime: "20261109180003" };
    equal("a failure says why, and when the last good one was", B.describe(failed, now).text, "The backup today at 6:00 PM failed. Drive J: isn't available. The last good one was made yesterday at 6:00 PM.");
    check("and is marked failed", B.describe(failed, now).failed);
    equal("a first failure has no good one to name", B.describe({ ...failed, goodTime: "" }, now).text, "The backup today at 6:00 PM failed. Drive J: isn't available.");

    equal("a good backup needs no attention", B.attention(base, now).length, 0);
    equal("a failure does", JSON.stringify(B.attention(failed, now)), JSON.stringify([{ key: "backup-failed", tone: "burgundy", title: "Backup failed", detail: "Drive J: isn't available.", action: "backups" }]));
    equal("not with backups turned off", B.attention({ ...failed, enabled: false }, now).length, 0);
    equal("nor in a test build", B.attention({ ...failed, off: true }, now).length, 0);
    equal("two days without one is fine", B.attention({ ...base, goodTime: "20261108190000" }, now).length, 0);
    const overdue = B.attention({ ...base, lastTime: "20261107180000", goodTime: "20261107180000" }, now);
    equal("three days isn't", overdue[0]?.title, "No backup for 3 days");
    equal("and says when the last was", overdue[0]?.detail, "The last one was made on Nov 7 at 6:00 PM.");
    equal("in gold, with a way to Preferences", `${overdue[0]?.tone} ${overdue[0]?.action} ${overdue[0]?.key}`, "gold backups backup-overdue");
    equal("none at all yet isn't overdue", B.attention({ ...base, lastTime: "", lastResult: "", goodTime: "" }, now).length, 0);
    equal("junk needs no attention", B.attention("junk", now).length, 0);
})();
