"use strict";

// What needs attention (2.0.0): the title bar shows nothing while all is well,
// and a button with a list once something needs you. This file only decides
// what's on the list; app.js draws it. Everything here is plain data, and the
// page puts it on screen as text.
globalThis.MaestroAttention = (() => {
    const LIMIT = 90;       // percent
    const SUSTAIN = 3;      // readings in a row, so one spike doesn't raise it
    const COUNT_EVERY = 4500;   // ms between counted readings: Live reads every second

    const percent = value => Math.round(Number(value));
    const isHigh = value => Number(value) >= LIMIT;

    // A drive stays full until it's emptied, so it counts at once. The processor
    // and memory have to stay high: `streaks` carries the count between readings,
    // and a reading too soon after the last counted one adds nothing. A normal
    // reading clears the count at once.
    function fromMetrics(data, streaks = {}, formatCapacity = () => "", now = Date.now()) {
        const counted = streaks.at === undefined || now - streaks.at >= COUNT_EVERY;
        const count = (value, sofar = 0) => (isHigh(value) ? sofar + (counted ? 1 : 0) : 0);
        const next = {
            cpu: count(data?.cpu, streaks.cpu),
            ram: count(data?.ram, streaks.ram),
            at: counted ? now : streaks.at
        };
        const items = [];
        if (next.cpu >= SUSTAIN) {
            items.push({ key: "cpu", tone: "gold", title: `Processor at ${percent(data.cpu)}%`, detail: "It has stayed over 90% for the last few readings.", action: "system" });
        }
        if (next.ram >= SUSTAIN) {
            items.push({ key: "ram", tone: "gold", title: `Memory at ${percent(data.ram)}%`, detail: "It has stayed over 90% for the last few readings.", action: "system" });
        }
        (Array.isArray(data?.drives) ? data.drives : []).forEach(drive => {
            if (!drive?.online || !isHigh(drive.usage)) return;
            const letter = String(drive.letter ?? "").replace(/:$/, "");
            const capacity = String(formatCapacity(drive.used, drive.total) || "");
            items.push({ key: `drive:${letter}`, tone: "gold", title: `Drive ${letter} is ${percent(drive.usage)}% full`, detail: capacity, action: "system" });
        });
        return { items, streaks: next };
    }

    function pageError(count, message) {
        return {
            key: "page-error",
            tone: "burgundy",
            title: count > 1 ? `${count} page errors` : "Page error",
            detail: String(message ?? "").slice(0, 200),
            action: "log"
        };
    }

    // Dismissing lasts until the problem goes away; if it comes back, it shows again.
    function visible(items, dismissed) {
        return items.filter(item => !dismissed.has(item.key));
    }

    function forgetCleared(dismissed, items) {
        [...dismissed].forEach(key => {
            if (!items.some(item => item.key === key)) dismissed.delete(key);
        });
    }

    function label(count) {
        return count === 1 ? "1 needs attention" : `${count} need attention`;
    }

    function tone(items) {
        return items.some(item => item.tone === "burgundy") ? "burgundy" : "gold";
    }

    return { fromMetrics, pageError, visible, forgetCleared, label, tone };
})();
