"use strict";

// Pure log parsing for the Logs tab: one entry per line with a date, time,
// level and text. No DOM access. Lines that don't match a source's format
// are kept (attached to the previous entry's time) rather than dropped.
(function (global) {
    const MAX_LINE = 2000;

    const FORMATS = {
        // 2026-11-03 00:09:50 | ASCS 1.7.0 initialized.
        ascs: line => {
            const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) \| (.*)$/.exec(line);
            return m && { day: m[1], clock: m[2], kind: "", text: m[3] };
        },
        // 2026-11-03T00:09:50<TAB>system<TAB>ASCS 1.7.0 started
        activity: line => {
            const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})\t([a-z]{1,16})\t(.*)$/.exec(line);
            return m && { day: m[1], clock: m[2], kind: m[3], text: m[4] };
        },
        // 2026-11-02 21:26:15.608 [27356] Completed successfully
        codebutton: line => {
            const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.\d+)? \[(\d{1,10})\] (.*)$/.exec(line);
            return m && { day: m[1], clock: m[2], kind: `#${m[3]}`, text: m[4] };
        }
    };

    const ERROR = /\b(error|errors|fail|failed|failure|fatal|exception|unable|rejected|invalid|crash(?:ed)?)\b/i;
    const WARN = /\b(warn|warning|retry|retrying|fallback|instead|timed out|skipped|abandoned|unavailable|ignored|recovered)\b/i;

    function levelOf(text, kind) {
        if (kind === "error" || ERROR.test(text)) return "error";
        if (WARN.test(text)) return "warn";
        return "info";
    }

    const clean = line => line
        .replace(/^\uFEFF/, "")
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
        .slice(0, MAX_LINE);

    function parseLog(source, text) {
        const format = FORMATS[source];
        if (!format || typeof text !== "string") return [];
        const entries = [];
        let previous = null;
        text.split(/\r?\n/).forEach((raw, index) => {
            const line = clean(raw);
            if (!line.trim()) return;
            const parsed = format(line);
            const entry = parsed
                ? { ...parsed }
                : { day: previous?.day || "", clock: previous?.clock || "", kind: "", text: line.trim() };
            entry.level = levelOf(entry.text, entry.kind);
            entry.index = index;
            entries.push(entry);
            if (parsed) previous = entry;
        });
        return entries;
    }

    // level: "all", "issues" (warnings and errors) or "errors".
    function filterEntries(entries, level = "all", query = "") {
        const needle = query.trim().toLocaleLowerCase();
        return entries.filter(entry =>
            (level === "all" || entry.level === "error" || (level === "issues" && entry.level === "warn"))
            && (!needle || `${entry.kind} ${entry.text}`.toLocaleLowerCase().includes(needle)));
    }

    // Newest day first, newest entry first within a day.
    function groupByDay(entries) {
        const groups = new Map();
        for (let i = entries.length - 1; i >= 0; i--) {
            const day = entries[i].day || "Undated";
            if (!groups.has(day)) groups.set(day, []);
            groups.get(day).push(entries[i]);
        }
        return [...groups].map(([day, items]) => ({ day, entries: items }));
    }

    function dayLabel(day, today = new Date()) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
        if (!m) return day;
        const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const diff = Math.round((base - date) / 86400000);
        if (diff === 0) return "Today";
        if (diff === 1) return "Yesterday";
        return date.toLocaleDateString("en-US", {
            weekday: "long", month: "long", day: "numeric",
            ...(date.getFullYear() !== base.getFullYear() ? { year: "numeric" } : {})
        });
    }

    function counts(entries) {
        return entries.reduce((total, entry) => {
            total[entry.level]++;
            return total;
        }, { info: 0, warn: 0, error: 0 });
    }

    global.ASCSLogs = { parseLog, filterEntries, groupByDay, dayLabel, counts, levelOf };
})(globalThis);
