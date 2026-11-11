"use strict";

// Backups (2.1.0): what Preferences says about the daily backup, and what the
// attention list says when one fails or none has been made for days. This file
// only turns Maestro's plain data into text; app.js puts it on screen as text.
globalThis.MaestroBackups = (() => {
    const OVERDUE_DAYS = 3;
    const DAY = 86400000;

    // A yyyyMMddHHmmss time as a Date, or null.
    function parseStamp(stamp) {
        const parts = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/.exec(String(stamp ?? ""));
        if (!parts) return null;
        const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
        const date = new Date(year, month - 1, day, hour, minute, second);
        return date.getMonth() === month - 1 && date.getDate() === day && hour < 24 && minute < 60 ? date : null;
    }

    // Only what's expected, in the shape the rest of this file reads.
    function clean(state) {
        const text = value => (typeof value === "string" ? value : "");
        const result = text(state?.lastResult);
        return {
            enabled: state?.enabled === true,
            time: /^([01]\d|2[0-3])[0-5]\d$/.test(text(state?.time)) ? state.time : "1800",
            folder: text(state?.folder).slice(0, 260),
            running: state?.running === true,
            off: state?.off === true,
            last: parseStamp(state?.lastTime),
            lastResult: result === "ok" || result === "failed" ? result : "",
            lastDetail: text(state?.lastDetail).slice(0, 200),
            good: parseStamp(state?.goodTime)
        };
    }

    const clock = date => date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

    // "today at 4:09 PM", "yesterday at 6:00 PM", "on Nov 8 at 6:00 PM".
    function when(date, now = new Date()) {
        const midnight = value => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
        const days = Math.round((midnight(now) - midnight(date)) / DAY);
        if (days === 0) return `today at ${clock(date)}`;
        if (days === 1) return `yesterday at ${clock(date)}`;
        const options = { month: "short", day: "numeric" };
        if (date.getFullYear() !== now.getFullYear()) options.year = "numeric";
        return `on ${date.toLocaleDateString("en-US", options)} at ${clock(date)}`;
    }

    const timeLabel = time => clock(new Date(2000, 0, 1, Number(time.slice(0, 2)), Number(time.slice(2))));

    // Every hour, and the time that's set when it isn't on the hour.
    function timeOptions(current) {
        const times = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}00`);
        if (/^([01]\d|2[0-3])[0-5]\d$/.test(String(current)) && !times.includes(current)) times.push(current);
        return times.sort().map(value => ({ value, label: timeLabel(value) }));
    }

    // The line under the controls. failed marks one that needs reading.
    function describe(state, now = new Date()) {
        const backup = clean(state);
        if (backup.off) return { text: "Backups are off in a test build.", failed: false };
        if (backup.running) return { text: "Backing up…", failed: false };
        if (!backup.folder) return { text: "Choose a folder to turn backups on.", failed: false };
        if (backup.lastResult === "failed" && backup.last) {
            const good = backup.good ? ` The last good one was made ${when(backup.good, now)}.` : "";
            const why = backup.lastDetail ? ` ${backup.lastDetail}` : "";
            return { text: `The backup ${when(backup.last, now)} failed.${why}${good}`, failed: true };
        }
        if (backup.good) {
            const size = backup.lastResult === "ok" && backup.lastDetail ? ` · ${backup.lastDetail}` : "";
            return { text: `Last backup made ${when(backup.good, now)}${size}`, failed: false };
        }
        return { text: backup.enabled ? "No backup yet. The first is made within a minute." : "No backup yet.", failed: false };
    }

    // For the attention list: a failure, or days without a backup, while the
    // daily backup is on.
    function attention(state, now = new Date()) {
        const backup = clean(state);
        if (backup.off || !backup.enabled) return [];
        if (backup.lastResult === "failed") {
            return [{ key: "backup-failed", tone: "burgundy", title: "Backup failed", detail: backup.lastDetail, action: "backups" }];
        }
        const days = backup.good ? Math.floor((now.getTime() - backup.good.getTime()) / DAY) : 0;
        if (days >= OVERDUE_DAYS) {
            return [{ key: "backup-overdue", tone: "gold", title: `No backup for ${days} days`, detail: `The last one was made ${when(backup.good, now)}.`, action: "backups" }];
        }
        return [];
    }

    return { parseStamp, clean, when, timeLabel, timeOptions, describe, attention };
})();
