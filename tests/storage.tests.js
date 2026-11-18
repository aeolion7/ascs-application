"use strict";

(function () {
    const S = globalThis.MaestroStorage;
    const { check, equal } = globalThis.TestHarness;
    const MB = 1024 * 1024;
    const state = { limitMB: 500, limits: [100, 250, 500, 1000], caches: [
        { id: "images", bytes: Math.round(10.4 * MB), files: 1121, limit: 500 * MB },
        { id: "almanac", bytes: 446000, files: 2 },
        { id: "forecast", bytes: 0, files: 0 }
    ] };

    equal("bytes", S.formatBytes(812), "812 bytes");
    equal("kilobytes, whole", S.formatBytes(446000), "436 KB");
    equal("megabytes, one place", S.formatBytes(Math.round(10.4 * MB)), "10.4 MB");
    equal("gigabytes", S.formatBytes(1.25 * 1024 * MB), "1.3 GB");
    equal("junk is nothing", S.formatBytes(-5), "0 bytes");
    equal("a limit in MB", S.limitLabel(250), "250 MB");
    equal("a limit in GB", S.limitLabel(1000), "1 GB");

    const rows = S.rows(state);
    equal("three rows, in order", rows.map(row => row.id).join(), "images,almanac,forecast");
    equal("the image cache, against its limit", rows[0].detail, "1,121 images · 10.4 MB of 500 MB");
    check("and how full", Math.abs(rows[0].percent - 2.08) < 0.01);
    equal("a cache with no limit has no bar", rows[1].percent, null);
    equal("its size", rows[1].detail, "2 feeds · 436 KB");
    equal("an empty cache says so", rows[2].detail, "Empty");
    check("and can't be cleared", rows[2].empty && !rows[0].empty);
    equal("one file is one", S.rows({ caches: [{ id: "forecast", bytes: 2048, files: 1 }] })[2].detail, "1 file · 2 KB");
    equal("past the limit, the bar stays full", S.rows({ caches: [{ id: "images", bytes: 600 * MB, files: 9, limit: 500 * MB }] })[0].percent, 100);

    const junk = S.clean({ limitMB: 300, limits: [5, "500"], caches: [{ id: "data", bytes: 9 }, { id: "images", bytes: -1, files: 1.5 }], error: 5 });
    equal("an unoffered limit is the default", junk.limitMB, 500);
    equal("unoffered limits are the usual ones", junk.limits.join(), "100,250,500,1000");
    equal("unknown caches are dropped and bad counts are zero", JSON.stringify(junk.caches.map(cache => [cache.id, cache.bytes, cache.files])), '[["images",0,0],["almanac",0,0],["forecast",0,0]]');
    equal("a junk error is none", junk.error, "");
    equal("nothing at all is safe", S.rows(null).length, 3);
    check("each cache has words for clearing it", S.CACHES.every(cache => S.clearMessage(cache.id).length > 20));
    equal("and a name for the question", S.rows(state)[0].name, "RetroAchievements image cache");
})();
