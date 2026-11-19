"use strict";
// maestro drive plan "idle" (2.10.0): what Maestro costs while nobody is using
// it. CPU time of AutoHotkey and its WebView2 processes, memory, frames, timers
// and messages: shown on the Podium, shown on the Conservatory, and hidden (as
// the close button leaves it, which is where it spends most of its time).
async function drivePlan(d) {
    const report = {};
    const sample = async (label, ms) => {
        const before = await d.memory();
        const start = d.counters();
        await d.wait(ms);
        const after = await d.memory();
        const seen = d.since(start);
        return {
            label,
            seconds: ms / 1000,
            cpuMsPerMin: d.round((after.cpuMs - before.cpuMs) * 60000 / ms),
            hostCpuMsPerMin: d.round((after.cpuHostMs - before.cpuHostMs) * 60000 / ms),
            workingMB: after.workingMB,
            privateMB: after.privateMB,
            frames: seen.frames,
            timeouts: seen.timeouts,
            sent: seen.sent,
            received: seen.received,
            intervals: d.intervals()
        };
    };
    // What one measurement costs, so it can be told apart from Maestro's own work.
    const first = await d.memory();
    const second = await d.memory();
    report.measureCostMs = { all: second.cpuMs - first.cpuMs, host: second.cpuHostMs - first.cpuHostMs };

    await d.wait(8000);   // The start's own work.
    report.podium = await sample("Podium, shown", 30000);
    navigate("conservatory");
    await d.wait(1500);
    report.conservatory = await sample("Conservatory, shown", 20000);
    navigate("home");
    await d.wait(1500);
    await d.hide();
    await d.wait(3000);
    report.hidden = await sample("hidden", 60000);
    await d.show();
    await d.wait(2000);
    report.shownAgain = await sample("Podium, shown again", 15000);
    return report;
}
