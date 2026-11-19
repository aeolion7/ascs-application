"use strict";
// maestro drive plan "walk" (2.10.0): how Maestro starts, then every page and
// every tab inside it at 2540 x 1224 and 1600 x 1000. Per page: time to the
// first painted frame, long tasks, timers, frames and messages while it
// settles, the JS heap and DOM size, errors, and anything spilling sideways.
// Then each page again, to see what stays running once it's left.
async function drivePlan(d) {
    const report = { sizes: {} };
    const drive = window.__maestroDrive;
    report.startup = {
        created: d.round(drive.marks.created),
        domReady: d.round(performance.getEntriesByType("navigation")[0]?.domContentLoadedEventEnd ?? -1),
        loaded: d.round(performance.getEntriesByType("navigation")[0]?.loadEventEnd ?? -1),
        ready: d.round(drive.marks.ready ?? -1),
        longTasksBeforeReady: drive.longTasks.filter(task => task.start < (drive.marks.ready ?? Infinity)).map(task => task.ms),
        host: await d.hostTimes(),
        scripts: performance.getEntriesByType("resource").filter(entry => entry.initiatorType === "script").length,
        sheets: performance.getEntriesByType("resource").filter(entry => entry.initiatorType === "link").length
    };
    const views = [...validViews];   // app.js: every page, Preferences included
    await d.wait(3000);   // Let the start's own work finish first.
    report.idleAfterStart = { memory: await d.memory(), heapMB: d.heapMB(), domNodes: d.domNodes(), intervals: d.intervals() };

    for (const [width, height] of [[2540, 1224], [1600, 1000]]) {
        await d.resize(width, height);
        await d.wait(600);
        const pages = [];
        for (const view of views) {
            const page = await d.openView(view);
            page.overflow = d.overflow();
            page.tabs = [];
            for (const tab of d.tabs()) {
                const opened = await d.openTab(tab);
                opened.overflow = d.overflow();
                page.tabs.push(opened);
            }
            if (width === 2540) await d.capture(`${view}-${width}`);
            pages.push(page);
        }
        report.sizes[`${width}x${height}`] = pages;
    }

    // Each page open, then left for the Podium: what keeps running behind it.
    await d.resize(2540, 1224);
    const home = views[0];
    report.leftBehind = [];
    for (const view of views.slice(1)) {
        await d.openView(view, 800);
        const after = await d.openView(home, 2000);
        report.leftBehind.push({ view, intervals: after.intervals.length, frames: after.frames, timeouts: after.timeouts, sent: after.sent });
    }
    // Idle on the Podium, and idle with the window hidden.
    const idle = d.counters();
    await d.wait(10000);
    report.idleHome = { ...d.since(idle), intervals: d.intervals() };
    report.end = { memory: await d.memory(), heapMB: d.heapMB(), domNodes: d.domNodes() };
    return report;
}
