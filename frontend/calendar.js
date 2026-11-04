"use strict";

// Pure logic for the Calendar page (1.8.0): iCalendar reading and writing,
// time zones, repeating events, reminders, and the week view's layout. Edits
// change only the properties ASCS manages and keep everything else in the
// event (an iPhone's own properties, attendees, other components), so events
// round-trip intact. Nothing here touches the page.
(function (global) {
    const DAY = 86400000;
    const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

    // ---- iCalendar text

    function unfold(text) {
        return String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
    }

    // "DTSTART;TZID=America/New_York:20261110T150000" -> property
    function parseLine(line) {
        let i = 0, quoted = false;
        for (; i < line.length; i++) {
            const c = line[i];
            if (c === '"') quoted = !quoted;
            else if (c === ":" && !quoted) break;
        }
        if (i >= line.length) return null;
        const head = line.slice(0, i), value = line.slice(i + 1);
        const parts = [];
        let current = "";
        quoted = false;
        for (const c of head) {
            if (c === '"') { quoted = !quoted; current += c; } else if (c === ";" && !quoted) { parts.push(current); current = ""; } else current += c;
        }
        parts.push(current);
        const params = {};
        parts.slice(1).forEach(part => {
            const eq = part.indexOf("=");
            if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, "");
        });
        return { name: parts[0].toUpperCase(), params, value };
    }

    // A component tree: { name, props: [{name, params, value}], children: [] }
    function parseComponent(text) {
        const root = { name: "ROOT", props: [], children: [] };
        const stack = [root];
        for (const line of unfold(text)) {
            if (!line.trim()) continue;
            const prop = parseLine(line);
            if (!prop) continue;
            if (prop.name === "BEGIN") {
                const child = { name: prop.value.toUpperCase(), props: [], children: [] };
                stack[stack.length - 1].children.push(child);
                if (stack.length > 20) return null;
                stack.push(child);
            } else if (prop.name === "END") {
                if (stack.length > 1) stack.pop();
            } else {
                stack[stack.length - 1].props.push(prop);
            }
        }
        return root.children.find(child => child.name === "VCALENDAR") || null;
    }

    const quoteParam = value => (/[;:,"]/.test(value) ? `"${value.replace(/"/g, "")}"` : value);

    // Lines folded at 75 octets (UTF-8), as RFC 5545 asks.
    function fold(line) {
        const encoder = new TextEncoder();
        if (encoder.encode(line).length <= 75) return line;
        const out = [];
        let current = "", size = 0, limit = 75;
        for (const ch of line) {
            const n = encoder.encode(ch).length;
            if (size + n > limit) { out.push(current); current = " "; size = 1; limit = 75; }
            current += ch;
            size += n;
        }
        out.push(current);
        return out.join("\r\n");
    }

    function serializeComponent(component) {
        const lines = [`BEGIN:${component.name}`];
        component.props.forEach(prop => {
            const params = Object.entries(prop.params || {}).map(([k, v]) => `;${k}=${quoteParam(String(v))}`).join("");
            lines.push(fold(`${prop.name}${params}:${prop.value}`));
        });
        component.children.forEach(child => lines.push(serializeComponent(child)));
        lines.push(`END:${component.name}`);
        return lines.join("\r\n");
    }

    const escapeText = text => String(text ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
    const unescapeText = text => String(text ?? "").replace(/\\(n|N|\\|;|,)/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));

    // ---- time

    function localZone() {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; }
    }

    // The offset (ms) of a time zone from UTC at an instant; null if unknown.
    function zoneOffset(zone, ms) {
        try {
            const parts = new Intl.DateTimeFormat("en-US", {
                timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
                hour: "2-digit", minute: "2-digit", second: "2-digit"
            }).formatToParts(new Date(ms));
            const get = type => Number(parts.find(p => p.type === type).value);
            return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - Math.floor(ms / 1000) * 1000;
        } catch {
            return null;
        }
    }

    // Wall-clock fields in a zone ("" = this PC's local time, "UTC") -> instant (ms).
    function wallToInstant(wall, zone) {
        const { y, mo, d, h = 0, mi = 0, s = 0 } = wall;
        if (zone === "UTC") return Date.UTC(y, mo, d, h, mi, s);
        if (!zone || zone === localZone()) return new Date(y, mo, d, h, mi, s).getTime();
        const guess = Date.UTC(y, mo, d, h, mi, s);
        const first = zoneOffset(zone, guess);
        if (first === null) return new Date(y, mo, d, h, mi, s).getTime();   // unknown zone: treat as local
        let instant = guess - first;
        const second = zoneOffset(zone, instant);
        if (second !== null && second !== first) instant = guess - second;
        return instant;
    }

    function instantToWall(ms, zone) {
        if (zone === "UTC") {
            const t = new Date(ms);
            return { y: t.getUTCFullYear(), mo: t.getUTCMonth(), d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), s: t.getUTCSeconds() };
        }
        if (zone && zone !== localZone()) {
            const offset = zoneOffset(zone, ms);
            if (offset !== null) return instantToWall(ms + offset, "UTC");
        }
        const t = new Date(ms);
        return { y: t.getFullYear(), mo: t.getMonth(), d: t.getDate(), h: t.getHours(), mi: t.getMinutes(), s: t.getSeconds() };
    }

    // A DTSTART/DTEND/EXDATE/RECURRENCE-ID value -> { ms, allDay, zone }.
    function parseDateValue(prop) {
        const value = String(prop?.value || "").trim().split(",")[0];
        const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value);
        if (!m) return null;
        const wall = { y: +m[1], mo: +m[2] - 1, d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) };
        if (!m[4] || prop.params?.VALUE === "DATE") return { ms: new Date(wall.y, wall.mo, wall.d).getTime(), allDay: true, zone: "" };
        const zone = m[7] ? "UTC" : (prop.params?.TZID || "");
        return { ms: wallToInstant(wall, zone), allDay: false, zone };
    }

    const pad = (n, w = 2) => String(n).padStart(w, "0");
    function formatDate(ms) {
        const t = new Date(ms);
        return `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}`;
    }
    function formatLocalDateTime(ms) {
        const t = new Date(ms);
        return `${formatDate(ms)}T${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}`;
    }
    function formatUtc(ms) {
        const t = new Date(ms);
        return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}${pad(t.getUTCSeconds())}Z`;
    }

    function parseDuration(text) {
        const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(text || "").trim());
        if (!m) return null;
        const ms = ((+m[2] || 0) * 7 * DAY) + ((+m[3] || 0) * DAY) + ((+m[4] || 0) * 3600000) + ((+m[5] || 0) * 60000) + ((+m[6] || 0) * 1000);
        return m[1] === "-" ? -ms : ms;
    }

    function formatTrigger(minutesBefore) {
        if (!minutesBefore) return "PT0S";
        if (minutesBefore % 1440 === 0) return `-P${minutesBefore / 1440}D`;
        if (minutesBefore % 60 === 0) return `-PT${minutesBefore / 60}H`;
        return `-PT${minutesBefore}M`;
    }

    // ---- events

    function parseRrule(value) {
        const rule = {};
        String(value || "").split(";").forEach(part => {
            const [k, v] = part.split("=");
            if (k && v !== undefined) rule[k.toUpperCase()] = v;
        });
        if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(rule.FREQ)) return null;
        const out = { freq: rule.FREQ, interval: Math.max(1, Math.min(999, parseInt(rule.INTERVAL, 10) || 1)) };
        if (rule.COUNT) out.count = Math.max(1, Math.min(5000, parseInt(rule.COUNT, 10) || 1));
        if (rule.UNTIL) out.until = parseDateValue({ value: rule.UNTIL, params: {} })?.ms ?? null;
        if (rule.BYDAY) {
            out.byday = rule.BYDAY.split(",").map(item => {
                const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(item.trim().toUpperCase());
                return m ? { n: m[1] ? parseInt(m[1], 10) : 0, day: WEEKDAYS.indexOf(m[2]) } : null;
            }).filter(Boolean);
        }
        if (rule.BYMONTHDAY) out.bymonthday = rule.BYMONTHDAY.split(",").map(n => parseInt(n, 10)).filter(n => n && Math.abs(n) <= 31);
        if (rule.BYMONTH) out.bymonth = rule.BYMONTH.split(",").map(n => parseInt(n, 10) - 1).filter(n => n >= 0 && n < 12);
        return out;
    }

    function formatRrule(rule) {
        if (!rule) return "";
        const parts = [`FREQ=${rule.freq}`];
        if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
        if (rule.byday?.length) parts.push(`BYDAY=${rule.byday.map(b => `${b.n || ""}${WEEKDAYS[b.day]}`).join(",")}`);
        if (rule.bymonthday?.length) parts.push(`BYMONTHDAY=${rule.bymonthday.join(",")}`);
        if (rule.count) parts.push(`COUNT=${rule.count}`);
        else if (rule.until) parts.push(`UNTIL=${rule.untilAllDay ? formatDate(rule.until) : formatUtc(rule.until)}`);
        return parts.join(";");
    }

    const propOf = (component, name) => component.props.find(p => p.name === name);

    function readEvent(vevent) {
        const start = parseDateValue(propOf(vevent, "DTSTART"));
        if (!start) return null;
        let end = parseDateValue(propOf(vevent, "DTEND"));
        if (!end) {
            const duration = parseDuration(propOf(vevent, "DURATION")?.value);
            end = { ms: start.ms + (duration ?? (start.allDay ? DAY : 0)), allDay: start.allDay, zone: start.zone };
        }
        if (end.ms < start.ms) end = { ...end, ms: start.ms };
        const exdates = vevent.props.filter(p => p.name === "EXDATE").flatMap(p =>
            String(p.value).split(",").map(v => parseDateValue({ value: v, params: p.params })?.ms).filter(Number.isFinite));
        const alarms = vevent.children.filter(c => c.name === "VALARM").map(alarm => {
            const trigger = propOf(alarm, "TRIGGER");
            if (!trigger) return null;
            if (trigger.params.VALUE === "DATE-TIME") {
                const at = parseDateValue(trigger)?.ms;
                return Number.isFinite(at) ? { at } : null;
            }
            const offset = parseDuration(trigger.value);
            return offset === null ? null : { offset };
        }).filter(Boolean);
        const rid = propOf(vevent, "RECURRENCE-ID");
        return {
            uid: unescapeText(propOf(vevent, "UID")?.value || ""),
            summary: unescapeText(propOf(vevent, "SUMMARY")?.value || ""),
            location: unescapeText(propOf(vevent, "LOCATION")?.value || ""),
            description: unescapeText(propOf(vevent, "DESCRIPTION")?.value || ""),
            start: start.ms, end: end.ms, allDay: start.allDay, zone: start.zone,
            rrule: parseRrule(propOf(vevent, "RRULE")?.value),
            exdates, alarms,
            recurrenceId: rid ? parseDateValue(rid)?.ms ?? null : null,
            status: (propOf(vevent, "STATUS")?.value || "").toUpperCase()
        };
    }

    // An event resource: the master event and any single-occurrence overrides.
    function readResource(text) {
        const calendar = parseComponent(text);
        if (!calendar) return null;
        const events = calendar.children.filter(c => c.name === "VEVENT").map(readEvent).filter(Boolean);
        const master = events.find(e => e.recurrenceId === null) || events[0];
        if (!master) return null;
        return { master, overrides: events.filter(e => e !== master && e.recurrenceId !== null), calendar };
    }

    // ---- repeating events

    function addDays(wall, n) {
        const t = new Date(Date.UTC(wall.y, wall.mo, wall.d + n));
        return { ...wall, y: t.getUTCFullYear(), mo: t.getUTCMonth(), d: t.getUTCDate() };
    }
    const daysInMonth = (y, mo) => new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    const weekdayOf = wall => new Date(Date.UTC(wall.y, wall.mo, wall.d)).getUTCDay();

    // The days of a month matching BYDAY entries like 2TU or -1FR (or every TU).
    function monthDaysByDay(y, mo, byday) {
        const total = daysInMonth(y, mo);
        const days = [];
        byday.forEach(({ n, day }) => {
            const matches = [];
            for (let d = 1; d <= total; d++) if (new Date(Date.UTC(y, mo, d)).getUTCDay() === day) matches.push(d);
            if (!n) days.push(...matches);
            else if (n > 0 && matches[n - 1]) days.push(matches[n - 1]);
            else if (n < 0 && matches[matches.length + n]) days.push(matches[matches.length + n]);
        });
        return [...new Set(days)].sort((a, b) => a - b);
    }

    // Start instants of a repeating event, from its start to `until` (ms), at
    // most `limit` of them. Dates are worked out on the wall clock of the
    // event's zone, so a weekly 9:00 meeting stays at 9:00 across DST.
    function expandStarts(event, until, limit = 5000) {
        const rule = event.rrule;
        const zone = event.allDay ? "" : event.zone;
        const base = instantToWall(event.start, zone);
        const toMs = wall => (event.allDay ? new Date(wall.y, wall.mo, wall.d).getTime() : wallToInstant(wall, zone));
        if (!rule) return [event.start];
        const out = [];
        const stopAt = Math.min(until, rule.until ?? Infinity);
        let produced = 0, guard = 0;
        const accept = wall => {
            const ms = toMs(wall);
            if (ms < event.start) return true;
            if (ms > stopAt) return false;
            produced++;
            out.push(ms);
            return !(rule.count && produced >= rule.count) && out.length < limit;
        };
        const step = rule.interval;
        if (rule.freq === "DAILY") {
            for (let wall = base; guard++ < 20000; wall = addDays(wall, step)) {
                if (rule.byday?.length && !rule.byday.some(b => b.day === weekdayOf(wall))) { if (toMs(wall) > stopAt) break; continue; }
                if (!accept(wall)) break;
            }
        } else if (rule.freq === "WEEKLY") {
            const days = (rule.byday?.length ? rule.byday.map(b => b.day) : [weekdayOf(base)]).sort((a, b) => a - b);
            let weekStart = addDays(base, -weekdayOf(base));         // the Sunday of the first week
            outer: for (; guard++ < 5000; weekStart = addDays(weekStart, 7 * step)) {
                for (const day of days) if (!accept(addDays(weekStart, day))) break outer;
            }
        } else if (rule.freq === "MONTHLY") {
            for (let i = 0; guard++ < 2000; i += step) {
                const y = base.y + Math.floor((base.mo + i) / 12), mo = (base.mo + i) % 12;
                const days = rule.byday?.length ? monthDaysByDay(y, mo, rule.byday)
                    : (rule.bymonthday?.length ? rule.bymonthday : [base.d]).map(d => (d < 0 ? daysInMonth(y, mo) + d + 1 : d)).filter(d => d >= 1 && d <= daysInMonth(y, mo)).sort((a, b) => a - b);
                let stop = false;
                for (const d of days) if (!accept({ ...base, y, mo, d })) { stop = true; break; }
                if (stop || toMs({ ...base, y, mo, d: 1 }) > stopAt) break;
            }
        } else if (rule.freq === "YEARLY") {
            const months = rule.bymonth?.length ? rule.bymonth : [base.mo];
            for (let i = 0; guard++ < 500; i += step) {
                const y = base.y + i;
                let stop = false;
                for (const mo of months) {
                    const days = rule.byday?.length ? monthDaysByDay(y, mo, rule.byday) : (rule.bymonthday?.length ? rule.bymonthday : [base.d]);
                    for (const d of days) {
                        if (d < 1 || d > daysInMonth(y, mo)) continue;      // Feb 29 in other years: skipped
                        if (!accept({ ...base, y, mo, d })) { stop = true; break; }
                    }
                    if (stop) break;
                }
                if (stop || toMs({ ...base, y, mo: 0, d: 1 }) > stopAt) break;
            }
        }
        return out;
    }

    // Occurrences of a resource overlapping [from, to).
    function occurrences(resource, from, to) {
        const { master, overrides } = resource;
        const length = master.end - master.start;
        const skip = new Set(master.exdates);
        const replaced = new Map(overrides.map(o => [o.recurrenceId, o]));
        const out = [];
        expandStarts(master, to).forEach(start => {
            if (skip.has(start)) return;
            const override = replaced.get(start);
            if (override) return;                    // added below in its own right
            let end = start + length;
            if (master.allDay) {                     // whole days, whatever DST does
                const days = Math.round(length / DAY);
                const t = new Date(start);
                end = new Date(t.getFullYear(), t.getMonth(), t.getDate() + days).getTime();
            }
            if (end > from && start < to) out.push({ event: master, start, end, allDay: master.allDay, original: start });
        });
        overrides.forEach(o => {
            if (o.status === "CANCELLED") return;
            if (o.end > from && o.start < to) out.push({ event: o, start: o.start, end: o.end, allDay: o.allDay, original: o.recurrenceId });
        });
        return out.sort((a, b) => a.start - b.start);
    }

    // Reminders due in [from, to): { at, title, start }.
    function reminders(resource, from, to) {
        const out = [];
        const horizon = to + 8 * DAY;                // a reminder can be days before its event
        occurrences(resource, from - 8 * DAY, horizon).forEach(occ => {
            (occ.event.alarms || []).forEach(alarm => {
                const at = alarm.at ?? occ.start + alarm.offset;
                if (at >= from && at < to) out.push({ at, title: occ.event.summary || "(No title)", start: occ.start, allDay: occ.allDay, location: occ.event.location || "" });
            });
        });
        return out;
    }

    // ---- writing

    function uidNew(now = Date.now(), random = Math.random) {
        return `ascs-${formatUtc(now).replace(/[TZ]/g, "").slice(0, 14)}-${Math.floor(random() * 0x100000000).toString(16).padStart(8, "0")}`;
    }

    function dateProps(name, ms, allDay) {
        return allDay ? { name, params: { VALUE: "DATE" }, value: formatDate(ms) } : { name, params: {}, value: formatLocalDateTime(ms) };
    }

    // Applies the fields ASCS edits to a VEVENT component, keeping all others.
    // fields: summary, location, description, start, end, allDay, rrule (or
    // null), exdates (ms list), reminder (minutes before, or null).
    const MANAGED = new Set(["DTSTART", "DTEND", "DURATION", "SUMMARY", "LOCATION", "DESCRIPTION", "RRULE", "EXDATE", "DTSTAMP", "LAST-MODIFIED", "SEQUENCE"]);
    function applyFields(vevent, fields, now = Date.now()) {
        const sequence = parseInt(propOf(vevent, "SEQUENCE")?.value, 10) || 0;
        const kept = vevent.props.filter(p => !MANAGED.has(p.name));
        const props = [];
        props.push({ name: "DTSTAMP", params: {}, value: formatUtc(now) });
        props.push(dateProps("DTSTART", fields.start, fields.allDay));
        props.push(dateProps("DTEND", fields.end, fields.allDay));
        if (fields.summary) props.push({ name: "SUMMARY", params: {}, value: escapeText(fields.summary) });
        if (fields.location) props.push({ name: "LOCATION", params: {}, value: escapeText(fields.location) });
        if (fields.description) props.push({ name: "DESCRIPTION", params: {}, value: escapeText(fields.description) });
        if (fields.rrule) props.push({ name: "RRULE", params: {}, value: formatRrule(fields.rrule) });
        (fields.exdates || []).forEach(ms => props.push(dateProps("EXDATE", ms, fields.allDay)));
        props.push({ name: "LAST-MODIFIED", params: {}, value: formatUtc(now) });
        props.push({ name: "SEQUENCE", params: {}, value: String(sequence + (vevent.props.length ? 1 : 0)) });
        vevent.props = [...kept.filter(p => p.name === "UID"), ...props, ...kept.filter(p => p.name !== "UID")];
        if (fields.reminder !== undefined) {
            vevent.children = vevent.children.filter(c => c.name !== "VALARM");
            if (fields.reminder !== null) {
                vevent.children.push({ name: "VALARM", props: [
                    { name: "ACTION", params: {}, value: "DISPLAY" },
                    { name: "DESCRIPTION", params: {}, value: "Reminder" },
                    { name: "TRIGGER", params: {}, value: formatTrigger(fields.reminder) }
                ], children: [] });
            }
        }
        return vevent;
    }

    // A whole new resource for an event.
    function newResource(uid, fields, now = Date.now()) {
        const vevent = { name: "VEVENT", props: [{ name: "UID", params: {}, value: uid }], children: [] };
        applyFields(vevent, fields, now);
        vevent.props = vevent.props.filter(p => p.name !== "SEQUENCE").concat({ name: "SEQUENCE", params: {}, value: "0" });
        const calendar = { name: "VCALENDAR", props: [
            { name: "VERSION", params: {}, value: "2.0" },
            { name: "PRODID", params: {}, value: "-//Aeolionware//ASCS 1.8.0//EN" },
            { name: "CALSCALE", params: {}, value: "GREGORIAN" }
        ], children: [vevent] };
        return serializeComponent(calendar) + "\r\n";
    }

    // The resource text with its master event's fields changed (all else kept).
    function editResource(text, fields, now = Date.now()) {
        const calendar = parseComponent(text);
        if (!calendar) return null;
        const vevent = calendar.children.find(c => c.name === "VEVENT" && !propOf(c, "RECURRENCE-ID")) || calendar.children.find(c => c.name === "VEVENT");
        if (!vevent) return null;
        applyFields(vevent, fields, now);
        return serializeComponent(calendar) + "\r\n";
    }

    // "This event only" for an occurrence: the series skips it (EXDATE), and
    // any override a phone made for it is removed; the page then saves the
    // edited occurrence as an event of its own.
    function skipOccurrence(text, original, now = Date.now()) {
        const calendar = parseComponent(text);
        if (!calendar) return null;
        calendar.children = calendar.children.filter(c =>
            !(c.name === "VEVENT" && propOf(c, "RECURRENCE-ID") && parseDateValue(propOf(c, "RECURRENCE-ID"))?.ms === original));
        const master = calendar.children.find(c => c.name === "VEVENT" && !propOf(c, "RECURRENCE-ID"));
        if (!master) return null;
        const event = readEvent(master);
        applyFields(master, { ...fieldsOf(event), exdates: [...event.exdates, original], reminder: undefined }, now);
        return serializeComponent(calendar) + "\r\n";
    }

    // The fields of a resource's master event, for the editor.
    // Dragging in Day and Week (1.8.0): where a dragged event starts, in
    // minutes after midnight, from the pointer's minute in the day and how far
    // into the event it was grabbed; in steps (15 minutes), and kept so the
    // whole event stays within the day.
    function snapStart(pointerMinutes, grabMinutes, durationMinutes, step = 15) {
        const length = Math.min(1440, Math.max(step, durationMinutes));
        const latest = Math.floor((1440 - length) / step) * step;
        const wanted = Math.round((pointerMinutes - grabMinutes) / step) * step;
        return Math.min(latest, Math.max(0, wanted));
    }

    function fieldsOf(event) {
        const alarm = (event.alarms || []).find(a => a.offset !== undefined && a.offset <= 0);
        return {
            summary: event.summary, location: event.location, description: event.description,
            start: event.start, end: event.end, allDay: event.allDay, rrule: event.rrule, exdates: event.exdates || [],
            reminder: alarm ? Math.round(-alarm.offset / 60000) : null
        };
    }

    // ---- CalDAV replies (DAV multistatus XML)

    function parseMultistatus(xml) {
        if (typeof DOMParser === "undefined" || typeof xml !== "string" || !xml.trim()) return [];
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        if (doc.getElementsByTagName("parsererror").length) return [];
        const DAV = "DAV:", CAL = "urn:ietf:params:xml:ns:caldav";
        const text = (el, ns, name) => el.getElementsByTagNameNS(ns, name)[0]?.textContent ?? "";
        return [...doc.getElementsByTagNameNS(DAV, "response")].map(response => {
            const ok = [...response.getElementsByTagNameNS(DAV, "propstat")].filter(ps => /\s200\s/.test(text(ps, DAV, "status")));
            const pick = (ns, name) => ok.map(ps => text(ps, ns, name)).find(Boolean) || "";
            const type = ok.flatMap(ps => [...ps.getElementsByTagNameNS(DAV, "resourcetype")])[0];
            return {
                href: decodeURIComponent(text(response, DAV, "href")),
                displayName: pick(DAV, "displayname"),
                color: pick("http://apple.com/ns/ical/", "calendar-color"),
                etag: pick(DAV, "getetag"),
                data: pick(CAL, "calendar-data"),
                isCalendar: Boolean(type && type.getElementsByTagNameNS(CAL, "calendar").length)
            };
        });
    }

    // ---- quick add: "Dentist tue 3pm #work", "PSO raid fri 8-11pm", "Trip nov 12"

    const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const DAYNAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

    // Hours from a 12-hour clock; a bare hour (after "at") of 1-7 means PM.
    function hour24(h, m, meridiem, bare) {
        h = Number(h);
        if (meridiem) {
            const pm = /^p/i.test(meridiem);
            if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12;
        } else if (bare && h >= 1 && h <= 7) {
            h += 12;
        }
        return h * 60 + Number(m || 0);
    }

    // Returns { summary, start, end, allDay, calendar (tag or ""), when } or
    // null for an empty title. `now` is the reference time.
    function parseQuickAdd(text, now = Date.now()) {
        let rest = ` ${String(text || "").replace(/\s+/g, " ").trim()} `;
        const take = re => {
            const m = re.exec(rest);
            if (m) rest = `${rest.slice(0, m.index)} ${rest.slice(m.index + m[0].length)}`;
            return m;
        };
        const today = localDay(now);
        let calendar = "", day = null, startMin = null, endMin = null, duration = null, allDayHint = false;
        const tag = take(/\s#([\p{L}\p{N}][\p{L}\p{N}_-]{0,47})(?=\s)/u);
        if (tag) calendar = tag[1].toLowerCase();
        const dur = take(/\sfor\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|mins?|minutes?)(?=\s)/i);
        if (dur) duration = Math.round(Number(dur[1]) * (/^h/i.test(dur[2]) ? 60 : 1));
        // Times: a range first, then a single time.
        let m = take(/\s(?:at\s+|from\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm|a|p)?\s*(?:-|–|to)\s*(\d{1,2})(?::([0-5]\d))?\s*(am|pm|a|p)?(?=\s)/i);
        if (m && (m[3] || m[6] || m[2] || m[5])) {
            const endMeridiem = m[6] || m[3];
            endMin = hour24(m[4], m[5], endMeridiem, !endMeridiem);
            startMin = hour24(m[1], m[2], m[3] || (endMeridiem && Number(m[1]) <= Number(m[4]) ? endMeridiem : ""), !m[3] && !endMeridiem);
        } else if (m) {
            rest = ` ${String(text || "").replace(/\s+/g, " ").trim()} `;           // a bare "3-5": not a time; start over
            if (tag) take(/\s#([\p{L}\p{N}][\p{L}\p{N}_-]{0,47})(?=\s)/u);
            if (dur) take(/\sfor\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|mins?|minutes?)(?=\s)/i);
        }
        if (startMin === null) {
            if ((m = take(/\s(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm|a\.m\.|p\.m\.)(?=\s)/i))) startMin = hour24(m[1], m[2], m[3], false);
            else if ((m = take(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/))) startMin = Number(m[1]) * 60 + Number(m[2]);
            else if ((m = take(/\s(?:at\s+)?(noon|midday)(?=\s)/i))) startMin = 12 * 60;
            else if ((m = take(/\s(?:at\s+)?midnight(?=\s)/i))) startMin = 0;
            else if ((m = take(/\sat\s+(\d{1,2})(?=\s)/i)) && Number(m[1]) >= 1 && Number(m[1]) <= 12) startMin = hour24(m[1], 0, "", true);
        }
        // Dates. A pattern that isn't a real date (feb 30) stays in the title.
        const year = new Date(now).getFullYear();
        const beforeDate = rest;
        const dated = (y, mo, d) => {
            const t = new Date(y, mo, d);
            return t.getMonth() === mo && t.getDate() === d ? t.getTime() : null;
        };
        if ((m = take(/\s(?:on\s+)?(\d{4})-(\d{2})-(\d{2})(?=\s)/))) day = dated(+m[1], +m[2] - 1, +m[3]);
        else if ((m = take(/\s(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?=\s)/))) {
            const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : year;
            day = dated(y, +m[1] - 1, +m[2]);
            if (day !== null && !m[3] && day < today) day = dated(y + 1, +m[1] - 1, +m[2]);
        } else if ((m = take(new RegExp(`\\s(?:on\\s+)?(${MONTHS.join("|")})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?=\\s)`, "i")))
            || (m = take(new RegExp(`\\s(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join("|")})[a-z]*\\.?(?:,?\\s+(\\d{4}))?(?=\\s)`, "i")))) {
            const monthFirst = isNaN(Number(m[1]));
            const mo = MONTHS.indexOf((monthFirst ? m[1] : m[2]).slice(0, 3).toLowerCase());
            const d = Number(monthFirst ? m[2] : m[1]);
            const y = m[3] ? +m[3] : year;
            day = dated(y, mo, d);
            if (day !== null && !m[3] && day < today) day = dated(y + 1, mo, d);
        } else if ((m = take(/\s(today|tonight)(?=\s)/i))) {
            day = today;
            if (/tonight/i.test(m[1]) && startMin === null) startMin = 19 * 60;
        } else if ((m = take(/\s(tomorrow|tmrw|tmr)(?=\s)/i))) {
            day = localDay(new Date(new Date(today).setDate(new Date(today).getDate() + 1)).getTime());
        } else if ((m = take(/\sin\s+(\d{1,3})\s+(days?|weeks?)(?=\s)/i))) {
            const n = Number(m[1]) * (/^w/i.test(m[2]) ? 7 : 1);
            const t = new Date(today); day = new Date(t.getFullYear(), t.getMonth(), t.getDate() + n).getTime();
        } else if ((m = take(/\s(?:on\s+)?(?:(next|this)\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*(?=\s)/i))) {
            const want = DAYNAMES.indexOf(m[2].toLowerCase());
            const t = new Date(today);
            let ahead = (want - t.getDay() + 7) % 7;
            if (m[1] && m[1].toLowerCase() === "next") ahead += 7;     // "next fri": the one after the coming one
            // Today's weekday with a time already gone means next week.
            else if (!m[1] && ahead === 0 && startMin !== null && today + startMin * 60000 <= now) ahead = 7;
            day = new Date(t.getFullYear(), t.getMonth(), t.getDate() + ahead).getTime();
        }
        if (m && day === null) rest = beforeDate;
        if ((m = take(/\sall[\s-]day(?=\s)/i))) allDayHint = true;
        const summary = rest.replace(/\s+/g, " ").replace(/^\s*(?:on|at|from)\s+|\s+(?:on|at|from)\s*$/gi, "").replace(/^[\s,;:-]+|[\s,;:-]+$/g, "").trim();
        if (!summary) return null;
        let allDay = startMin === null || allDayHint;
        if (day === null) {
            day = today;
            // A time that has already passed today means tomorrow.
            if (!allDay && today + startMin * 60000 <= now) { const t = new Date(today); day = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1).getTime(); }
        }
        const t = new Date(day);
        if (allDay) {
            return { summary, start: day, end: new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1).getTime(), allDay: true, calendar };
        }
        const start = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 0, startMin).getTime();
        let end;
        if (endMin !== null) end = new Date(t.getFullYear(), t.getMonth(), t.getDate() + (endMin <= startMin ? 1 : 0), 0, endMin).getTime();
        else end = start + (duration || 60) * 60000;
        return { summary, start, end, allDay: false, calendar };
    }

    // ---- .ics files: import (one resource per UID) and export (one file)

    // Splits a calendar file into one resource per event UID (overrides stay
    // with their series; time-zone definitions go with every resource).
    function splitIcs(text) {
        const calendar = parseComponent(text);
        if (!calendar) return [];
        const zones = calendar.children.filter(c => c.name === "VTIMEZONE");
        const byUid = new Map();
        calendar.children.filter(c => c.name === "VEVENT").forEach(vevent => {
            const uid = unescapeText(propOf(vevent, "UID")?.value || "").trim() || uidNew();
            if (!propOf(vevent, "UID")) vevent.props.unshift({ name: "UID", params: {}, value: uid });
            if (!byUid.has(uid)) byUid.set(uid, []);
            byUid.get(uid).push(vevent);
        });
        return [...byUid.entries()].slice(0, 5000).map(([uid, vevents]) => ({
            uid,
            text: serializeComponent({ name: "VCALENDAR", props: [
                { name: "VERSION", params: {}, value: "2.0" },
                { name: "PRODID", params: {}, value: "-//Aeolionware//ASCS 1.8.0//EN" }
            ], children: [...zones, ...vevents] }) + "\r\n"
        }));
    }

    // The server file name for an event id: the id itself when it is a safe
    // name, otherwise one derived from it (FNV-1a, 2 x 32 bits), so importing
    // the same file twice finds the same events instead of duplicating them.
    function resourceNameFor(uid) {
        const text = String(uid || "");
        if (/^[A-Za-z0-9][A-Za-z0-9._@-]{0,127}$/.test(text) && !text.includes("..")) return text;
        let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
        for (const ch of new TextEncoder().encode(text)) {
            a = Math.imul(a ^ ch, 0x01000193) >>> 0;
            b = Math.imul(b ^ ch, 0x5bd1e995) >>> 0;
        }
        return `imp-${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
    }

    // One file from many resources (time zones de-duplicated by TZID).
    function joinIcs(texts, name = "") {
        const zones = new Map(), events = [];
        texts.forEach(text => {
            const calendar = parseComponent(text);
            if (!calendar) return;
            calendar.children.forEach(c => {
                if (c.name === "VTIMEZONE") zones.set(propOf(c, "TZID")?.value || String(zones.size), c);
                else if (c.name === "VEVENT") events.push(c);
            });
        });
        const props = [{ name: "VERSION", params: {}, value: "2.0" }, { name: "PRODID", params: {}, value: "-//Aeolionware//ASCS 1.8.0//EN" }, { name: "CALSCALE", params: {}, value: "GREGORIAN" }];
        if (name) props.push({ name: "X-WR-CALNAME", params: {}, value: escapeText(name) });
        return serializeComponent({ name: "VCALENDAR", props, children: [...zones.values(), ...events] }) + "\r\n";
    }

    // ---- spanning bars: multi-day events across a row of day cells

    const localDay = ms => { const t = new Date(ms); return new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime(); };
    const dayIndex = (ms, rowStart) => Math.round((localDay(ms) - localDay(rowStart)) / DAY);

    // Whether an occurrence is drawn as a bar: all-day, or crossing midnight.
    function spansDays(occ) {
        return occ.allDay || localDay(occ.start) !== localDay(Math.max(occ.start, occ.end - 1));
    }

    // For a row of `days` columns starting at rowStart: each bar's first and
    // last column, its lane (bars that share a column never share a lane;
    // earlier and longer bars take the upper lanes), and whether it continues
    // before or after the row (drawn with an arrow).
    function layoutSpans(items, rowStart, days) {
        const placed = items.map(item => {
            const first = dayIndex(item.start, rowStart);
            const last = dayIndex(Math.max(item.start, item.end - 1), rowStart);
            return { item, first, last };
        }).filter(p => p.last >= 0 && p.first < days)
            .map(p => ({ ...p, startCol: Math.max(0, p.first), endCol: Math.min(days - 1, p.last), continuesBefore: p.first < 0, continuesAfter: p.last >= days }))
            .sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol) || a.item.start - b.item.start);
        const lanes = [];
        placed.forEach(p => {
            let lane = lanes.findIndex(lastCol => lastCol < p.startCol);
            if (lane < 0) { lane = lanes.length; lanes.push(-1); }
            lanes[lane] = p.endCol;
            p.lane = lane;
        });
        return placed.map(({ item, startCol, endCol, lane, continuesBefore, continuesAfter }) => ({ ...item, startCol, endCol, lane, continuesBefore, continuesAfter }));
    }

    // ---- the week view's layout: side-by-side lanes for overlapping events

    function layoutDay(items) {
        const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
        const placed = [];
        let cluster = [], clusterEnd = -Infinity;
        const flush = () => {
            const lanes = [];
            cluster.forEach(item => {
                let lane = lanes.findIndex(end => end <= item.start);
                if (lane < 0) { lane = lanes.length; lanes.push(0); }
                lanes[lane] = item.end;
                placed.push({ ...item, lane });
            });
            placed.slice(placed.length - cluster.length).forEach(p => { p.lanes = lanes.length; });
            cluster = [];
            clusterEnd = -Infinity;
        };
        sorted.forEach(item => {
            if (item.start >= clusterEnd && cluster.length) flush();
            cluster.push(item);
            clusterEnd = Math.max(clusterEnd, item.end);
        });
        if (cluster.length) flush();
        return placed;
    }

    // ---- the almanac's countdowns as all-day days
    // A countdown is {date, name}: "MM-DD" every year or "YYYY-MM-DD" once.
    // Returns the days that fall in [from, to) as {start, end, name, date};
    // 02-29 falls on leap years only, and impossible dates give nothing.
    function countdownDays(countdowns, from, to) {
        const out = [];
        const local = (y, m, d) => {
            const t = new Date(y, m - 1, d);
            return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d ? t.getTime() : null;
        };
        const add = (start, item) => {
            if (start === null) return;
            const t = new Date(start);
            const end = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1).getTime();
            if (start < to && end > from) out.push({ start, end, name: item.name, date: item.date });
        };
        (Array.isArray(countdowns) ? countdowns : []).forEach(item => {
            const name = String(item?.name ?? "").trim();
            const date = String(item?.date ?? "");
            if (!name) return;
            let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
            if (match) return add(local(+match[1], +match[2], +match[3]), { name, date });
            match = /^(\d{2})-(\d{2})$/.exec(date);
            if (!match || local(2024, +match[1], +match[2]) === null) return;
            for (let year = new Date(from).getFullYear(); year <= new Date(to).getFullYear(); year++) add(local(year, +match[1], +match[2]), { name, date });
        });
        return out.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
    }

    global.ASCSCalendar = {
        countdownDays,
        DAY, WEEKDAYS, unfold, parseLine, parseComponent, serializeComponent, escapeText, unescapeText, fold,
        parseDateValue, parseDuration, formatTrigger, parseRrule, formatRrule, wallToInstant, zoneOffset,
        readEvent, readResource, expandStarts, occurrences, reminders, uidNew, newResource, editResource, skipOccurrence, snapStart,
        fieldsOf, parseMultistatus, layoutDay, spansDays, layoutSpans, parseQuickAdd, splitIcs, joinIcs, resourceNameFor, formatDate, formatLocalDateTime, formatUtc
    };
})(globalThis);
