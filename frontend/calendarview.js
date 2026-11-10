"use strict";

// ---- Calendar page (1.8.0)
// Calendars and events live in the local Radicale server; this page asks ASCS
// for fixed operations (ASCS adds the password and builds the request) and
// works out everything else itself with ASCSCalendar: repeats, time zones,
// reminders, layout. Reminders for the next three days are handed to ASCS,
// which fires them even while the window is hidden. Uses $, element, send,
// showNotice, confirmDialog and navigate from app.js.

const Cal = globalThis.ASCSCalendar;
const CAL_PREFS = "ascs.calendar";
const CAL_COLORS = ["#8B6FF5", "#E3C072", "#C2577A", "#4FD18B", "#5AA9E6", "#F08A4B", "#D16BD8", "#A4A9BB"];
// Any color as #RRGGBB (2.0.0), as AHK accepts for a calendar (ValidateCalendarColor).
const isCalColor = color => typeof color === "string" && /^#[0-9A-Fa-f]{6}$/.test(color);
const COUNTDOWN_COLOR = "#E3C072";
const HOLIDAY_COLOR = "#5AA9E6";
const CAL_DEFAULTS = [["personal", "Personal", "#8B6FF5"], ["gaming", "Gaming", "#E3C072"], ["work", "Work", "#C2577A"]];
// Day and Week fit all 24 hours in the page, down to this much for an hour;
// renderHours sets the height from the room there is.
const MIN_HOUR_HEIGHT = 36;
let hourHeight = 60;

const calState = {
    server: { state: "starting", message: "" },
    calendars: [], resources: new Map(), loaded: false, loading: false, error: "",
    mode: "month", cursor: startOfDay(Date.now()),
    requests: new Map(), nextRequest: 1,
    editing: null, editingCalendar: null, scrollToNow: false
};

function loadCalPrefs() {
    try {
        const saved = JSON.parse(localStorage.getItem(CAL_PREFS) || "{}") || {};
        return {
            hidden: new Set(Array.isArray(saved.hidden) ? saved.hidden.filter(id => typeof id === "string") : []),
            mode: ["day", "month", "week", "agenda"].includes(saved.mode) ? saved.mode : "month",
            seeded: saved.seeded === true,
            countdownColor: isCalColor(saved.countdownColor) ? saved.countdownColor.toUpperCase() : COUNTDOWN_COLOR,
            holidayColor: isCalColor(saved.holidayColor) ? saved.holidayColor.toUpperCase() : HOLIDAY_COLOR
        };
    } catch {
        return { hidden: new Set(), mode: "month", seeded: false, countdownColor: COUNTDOWN_COLOR, holidayColor: HOLIDAY_COLOR };
    }
}
const calPrefs = loadCalPrefs();
calState.mode = calPrefs.mode;
function saveCalPrefs() {
    try { localStorage.setItem(CAL_PREFS, JSON.stringify({ hidden: [...calPrefs.hidden], mode: calState.mode, seeded: calPrefs.seeded, countdownColor: calPrefs.countdownColor, holidayColor: calPrefs.holidayColor })); } catch { /* not kept */ }
}

// ---- dates

function startOfDay(ms) { const t = new Date(ms); return new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime(); }
function addDays(ms, n) { const t = new Date(ms); return new Date(t.getFullYear(), t.getMonth(), t.getDate() + n, t.getHours(), t.getMinutes()).getTime(); }
function startOfWeek(ms) { const t = new Date(ms); return new Date(t.getFullYear(), t.getMonth(), t.getDate() - t.getDay()).getTime(); }
const sameDay = (a, b) => startOfDay(a) === startOfDay(b);
const fmt = (ms, options) => new Date(ms).toLocaleString("en-US", options);
const timeText = ms => fmt(ms, { hour: "numeric", minute: "2-digit" }).replace(":00", "");
const isoDate = ms => { const t = new Date(ms); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const isoTime = ms => { const t = new Date(ms); return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`; };
function fromInputs(date, time) {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
    if (!d) return NaN;
    const t = /^(\d{2}):(\d{2})$/.exec(time || "00:00") || [null, "0", "0"];
    return new Date(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]).getTime();
}

// ---- talking to ASCS

function calRequest(op, calendar = "", uid = "", etag = "", body = "") {
    return new Promise((resolve, reject) => {
        const id = calState.nextRequest++;
        const timer = setTimeout(() => { calState.requests.delete(id); reject(new Error("Maestro didn't answer.")); }, 25000);
        calState.requests.set(id, { resolve, reject, timer });
        if (!send("CalDav", `${id}|${op}|${calendar}|${uid}|${etag}${body ? `\n${body}` : ""}`)) {
            clearTimeout(timer);
            calState.requests.delete(id);
            reject(new Error("Maestro isn't connected."));
        }
    });
}

function handleCalReply(id, status, etag, body) {
    const entry = calState.requests.get(Number(id));
    if (!entry) return;
    calState.requests.delete(Number(id));
    clearTimeout(entry.timer);
    const code = Number(status) || 0;
    if (code === 0) entry.reject(new Error(body || "The calendar server couldn't be reached."));
    else entry.resolve({ status: code, etag, body });
}

function handleCalendarState(data) {
    const was = calState.server.state;
    calState.server = { state: String(data.state || ""), message: String(data.message || "") };
    if (calState.server.state === "running" && was !== "running") refreshCalendar();
    renderCalendar();
}

// ---- loading

async function refreshCalendar() {
    if (calState.server.state !== "running") return;
    // A change made while a refresh is running needs one more pass afterwards,
    // or the page would show the state from before the change.
    if (calState.loading) {
        calState.refreshAgain = true;
        return;
    }
    calState.loading = true;
    calState.refreshAgain = false;
    try {
        let found = await listCalendars();
        if (!found.length && !calPrefs.seeded) {
            for (const [id, name, color] of CAL_DEFAULTS) await calRequest("createCalendar", id, "", "", `${name}\n${color}`);
            calPrefs.seeded = true;
            saveCalPrefs();
            found = await listCalendars();
        }
        calState.calendars = found;
        const resources = new Map();
        for (const calendar of found) {
            const reply = await calRequest("events", calendar.id);
            if (reply.status === 404) continue;      // deleted a moment ago (the next pass drops it)
            if (reply.status !== 207) throw new Error(`The ${calendar.name} calendar couldn't be read (${reply.status}).`);
            Cal.parseMultistatus(reply.body).forEach(item => {
                if (!item.data) return;
                const parsed = Cal.readResource(item.data);
                if (!parsed) return;
                const name = item.href.split("/").pop().replace(/\.ics$/i, "");
                resources.set(`${calendar.id}/${name}`, { calendar: calendar.id, name, etag: item.etag, text: item.data, parsed,
                    editable: /^[A-Za-z0-9][A-Za-z0-9._@-]{0,127}$/.test(name) && !name.includes("..") });
            });
        }
        calState.resources = resources;
        calState.loaded = true;
        calState.error = "";
    } catch (error) {
        calState.error = error.message;
    } finally {
        calState.loading = false;
    }
    renderCalendar();
    sendReminders();
    if (calState.newEventWhenReady && calState.calendars.length) {
        calState.newEventWhenReady = false;
        openEventEditor({});
    }
    if (calState.refreshAgain) refreshCalendar();
}

async function listCalendars() {
    const reply = await calRequest("calendars");
    if (reply.status !== 207) throw new Error(`The calendars couldn't be listed (${reply.status}).`);
    return Cal.parseMultistatus(reply.body).filter(item => item.isCalendar).map(item => {
        const id = item.href.replace(/\/$/, "").split("/").pop();
        const color = /^#[0-9A-Fa-f]{6}/.test(item.color) ? item.color.slice(0, 7).toUpperCase() : "#8B6FF5";
        return { id, name: item.displayName || id, color };
    }).filter(c => /^[a-z0-9][a-z0-9-]{0,47}$/.test(c.id)).sort((a, b) => {
        const order = id => { const i = CAL_DEFAULTS.findIndex(d => d[0] === id); return i < 0 ? 99 : i; };
        return order(a.id) - order(b.id) || a.name.localeCompare(b.name);
    });
}

// ---- occurrences

function calendarOf(id) { return calState.calendars.find(c => c.id === id); }

// The almanac's countdowns, shown read-only as all-day days. They're edited in
// their own dialog (nothing is written to the calendar server), so
// editing one there changes the Calendar at once. The id can't clash with a
// real calendar's (those start with a letter or digit).
// Their color is chosen like a calendar's, and kept with the view prefs.
const COUNTDOWN_CALENDAR = { id: ":countdowns", name: "Countdowns", get color() { return calPrefs.countdownColor; } };

function countdownOccurrences(from, to, events) {
    const settings = typeof almanacState === "object" ? almanacState.settings : null;
    if (!settings?.countdowns?.length) return [];
    // A countdown pinned from an event isn't shown twice: skip it when an
    // event with the same name is on that day.
    const taken = new Set(events.map(o => `${startOfDay(o.start)}|${(o.event.summary || "").trim().toLowerCase()}`));
    return Cal.countdownDays(settings.countdowns, from, to)
        .filter(day => !taken.has(`${day.start}|${day.name.toLowerCase()}`))
        .map(day => ({
            start: day.start, end: day.end, allDay: true, countdown: day.date,
            event: { summary: day.name, location: "" }, calendar: COUNTDOWN_CALENDAR, resource: null
        }));
}

// US holidays (1.8.0), worked out on this PC (ASCSAlmanac.usHolidays) and
// shown read-only as all-day days. A holiday is skipped on a day where a
// countdown or event already has its name.
const HOLIDAY_CALENDAR = { id: ":holidays", name: "US Holidays", get color() { return calPrefs.holidayColor; } };

function holidayOccurrences(from, to, shown) {
    const taken = new Set(shown.map(o => `${startOfDay(o.start)}|${(o.event.summary || "").trim().toLowerCase()}`));
    const out = [];
    for (let year = new Date(from).getFullYear(); year <= new Date(to).getFullYear(); year++) {
        globalThis.ASCSAlmanac.usHolidays(year).forEach(({ date, name }) => {
            const [y, m, d] = date.split("-").map(Number);
            const start = new Date(y, m - 1, d).getTime();
            const end = new Date(y, m - 1, d + 1).getTime();
            if (start < to && end > from && !taken.has(`${start}|${name.toLowerCase()}`)) {
                out.push({ start, end, allDay: true, holiday: true, event: { summary: name, location: "" }, calendar: HOLIDAY_CALENDAR, resource: null });
            }
        });
    }
    return out;
}

function visibleOccurrences(from, to, includeHidden = false) {
    const all = [];
    calState.resources.forEach(resource => {
        const calendar = calendarOf(resource.calendar);
        if (!calendar) return;
        Cal.occurrences(resource.parsed, from, to).forEach(occ => all.push({ ...occ, resource, calendar }));
    });
    const out = includeHidden ? all : all.filter(o => !calPrefs.hidden.has(o.calendar.id));
    if (includeHidden || !calPrefs.hidden.has(COUNTDOWN_CALENDAR.id)) out.push(...countdownOccurrences(from, to, all));
    if (includeHidden || !calPrefs.hidden.has(HOLIDAY_CALENDAR.id)) out.push(...holidayOccurrences(from, to, out));
    return out.sort((a, b) => (b.allDay - a.allDay) || a.start - b.start || a.end - b.end);
}

// Events open in the editor; countdowns open where they are kept.
function openOccurrence(occ) {
    if (occ.holiday) return;                 // read-only; nothing to edit
    if (occ.countdown) {
        navigate("calendar");
        openCountdownEditor();
        return;
    }
    openEventEditor({ occurrence: occ });
}

// Reminders for the next three days, for ASCS to fire.
function sendReminders() {
    if (!calState.loaded) return;
    const now = Date.now(), until = now + 3 * Cal.DAY;
    const lines = [];
    calState.resources.forEach(resource => {
        Cal.reminders(resource.parsed, now - 60000, until).forEach(r => {
            const day = sameDay(r.start, now) ? "Today" : sameDay(r.start, addDays(now, 1)) ? "Tomorrow" : fmt(r.start, { weekday: "short", month: "short", day: "numeric" });
            const when = r.allDay ? `${day} (all day)` : `${day} ${timeText(r.start)}`;
            const clean = text => String(text || "").replace(/[\t\r\n]+/g, " ").slice(0, 120);
            // at, title, when, start (empty for all-day) and where.
            lines.push([Math.floor(r.at / 1000), clean(r.title), when, r.allDay ? "" : Math.floor(r.start / 1000), clean(r.location)].join("\t"));
        });
    });
    send("SetReminders", lines.slice(0, 200).join("\n"));
}
setInterval(() => { if (calState.server.state === "running") refreshCalendar(); }, 10 * 60000);

// ---- rendering

function renderCalendar() {
    const status = $("calStatus");
    const running = calState.server.state === "running";
    const message = !running
        ? (calState.server.state === "starting" ? "Starting the calendar server…" : calState.server.message || "The calendar server isn't running.")
        : calState.error;
    // In the toolbar, so it doesn't move the page when it comes and goes.
    const starting = calState.server.state === "starting";
    const loading = starting || (running && !calState.loaded && !calState.error);
    status.hidden = !message && !loading;
    status.textContent = message || (loading ? "Loading" : "");
    status.title = message || "";
    status.classList.toggle("loading-note", loading);
    status.dataset.state = running && !calState.error ? "" : starting ? "starting" : "problem";
    $("calNewEvent").disabled = !running || !calState.calendars.length;
    $("calNewCalendar").disabled = !running;
    document.querySelectorAll("[data-cal-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.calMode === calState.mode)));
    renderCalendarList();
    renderCountdownList();
    renderHomeToday();
    const main = $("calMain");
    main.dataset.mode = calState.mode;
    if (calState.mode === "week") renderWeek(main);
    else if (calState.mode === "day") renderDay(main);
    else if (calState.mode === "agenda") renderAgenda(main);
    else renderMonth(main);
}

function renderCalendarList() {
    const list = $("calCalendars");
    if (!calState.loaded && ["starting", "running"].includes(calState.server.state)) {
        const waiting = element("li");
        waiting.append(loadingNote());
        list.replaceChildren(waiting);
        return;
    }
    list.replaceChildren(...calState.calendars.map(calendar => {
        const item = element("li", "cal-calendar");
        const label = element("label");
        const box = element("input");
        box.type = "checkbox";
        box.checked = !calPrefs.hidden.has(calendar.id);
        box.style.setProperty("--cal-color", calendar.color);
        box.addEventListener("change", () => {
            if (box.checked) calPrefs.hidden.delete(calendar.id); else calPrefs.hidden.add(calendar.id);
            saveCalPrefs();
            renderCalendar();
        });
        label.append(box, element("span", "", calendar.name));
        const edit = element("button", "link-button", "Edit");
        edit.type = "button";
        edit.title = `Rename, recolor or delete ${calendar.name}`;
        edit.addEventListener("click", () => openCalendarEditor(calendar));
        item.append(label, edit);
        return item;
    }));
    if (!calState.calendars.length && calState.loaded) list.append(element("li", "settings-note", "No calendars yet."));
    list.append(overlayListItem(COUNTDOWN_CALENDAR, "Your countdowns, shown on their days", "Recolor countdowns, or edit them"),
        overlayListItem(HOLIDAY_CALENDAR, "US federal holidays and common observances, worked out on this PC", "Recolor US Holidays"));
}

// What's coming, nearest first, the holidays included unless they're turned off.
function renderCountdownList() {
    const list = $("calCountdowns");
    const settings = almanacState.settings;
    $("calEditCountdowns").disabled = !settings;
    if (!settings) {
        const waiting = element("li");
        waiting.append(loadingNote());
        list.replaceChildren(waiting);
        return;
    }
    const now = new Date();
    const items = Almanac.countdownItems(holidayCountdowns() ? Almanac.withHolidays(settings.countdowns, now) : settings.countdowns, now);
    list.replaceChildren(...items.map(item => {
        const row = element("li", "cal-countdown");
        row.append(element("span", "", item.name),
            element("strong", "", item.days === 0 ? "Today" : item.days === 1 ? "Tomorrow" : `${item.days} days`));
        return row;
    }));
    if (!items.length) list.append(element("li", "settings-note", "No countdowns yet."));
}

// Whatever wasn't saved goes back, so it can't be saved later with the almanac.
function restoreCountdownRows() {
    $("countdownRows").replaceChildren(...(almanacState.settings?.countdowns || []).map(countdownRow));
    updateCountdownsEmpty();
}

function openCountdownEditor() {
    if (!almanacState.settings) return;
    restoreCountdownRows();
    $("countdownStatus").textContent = "";
    $("calCountdownDialog").hidden = false;
    requestAnimationFrame(() => ($("countdownRows").querySelector("input") || $("addCountdownButton")).focus());
}

// Countdowns and US Holidays: read-only calendars that can be hidden and
// recolored (kept with the view prefs).
function overlayListItem(calendar, hint, editHint) {
    const item = element("li", "cal-calendar is-overlay");
    const label = element("label");
    const box = element("input");
    box.type = "checkbox";
    box.checked = !calPrefs.hidden.has(calendar.id);
    box.style.setProperty("--cal-color", calendar.color);
    box.addEventListener("change", () => {
        if (box.checked) calPrefs.hidden.delete(calendar.id); else calPrefs.hidden.add(calendar.id);
        saveCalPrefs();
        renderCalendar();
    });
    label.append(box, element("span", "", calendar.name));
    label.title = hint;
    const edit = element("button", "link-button", "Edit");
    edit.type = "button";
    edit.title = editHint;
    edit.addEventListener("click", () => openCalendarEditor(calendar));
    item.append(label, edit);
    return item;
}

function chip(occ, { showTime = true } = {}) {
    const node = element("button", `cal-chip${occ.allDay ? " is-all-day" : ""}${occ.countdown ? " is-countdown" : ""}`);
    node.type = "button";
    node.style.setProperty("--cal-color", occ.calendar.color);
    const title = occ.event.summary || "(No title)";
    if (occ.countdown) node.append(countdownMark());
    if (showTime && !occ.allDay) node.append(element("small", "", timeText(occ.start)));
    node.append(element("span", "", title));
    node.title = `${title}${occ.allDay ? " (all day)" : ` · ${timeText(occ.start)}–${timeText(occ.end)}`}${occ.event.location ? ` · ${occ.event.location}` : ""} · ${occ.calendar.name}`;
    if (occ.countdown) node.title = `${title} · countdown${occ.countdown.length === 5 ? ", every year" : ""} · click to edit`;
    node.addEventListener("click", event => { event.stopPropagation(); openOccurrence(occ); });
    return node;
}

// The hourglass on a countdown.
function countdownMark() {
    const mark = element("span", "cal-countdown-mark");
    mark.setAttribute("aria-hidden", "true");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 12 12");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M2.5 1h7M2.5 11h7M3.5 1c0 3 5 3 5 5s-5 2-5 5M8.5 1c0 3-5 3-5 5s5 2 5 5");
    svg.append(path);
    mark.append(svg);
    return mark;
}

// The six weeks share the page's height: a day holds its number, then lines.
function monthLines() {
    const height = $("calMain").clientHeight;
    if (!height) return 3;
    const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--text-scale")) || 1;
    const week = (height - 44 * scale) / 6;
    return Math.max(3, Math.min(8, Math.floor((week - 46 * scale) / (30 * scale))));
}

function renderMonth(main) {
    const cursor = new Date(calState.cursor);
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getTime();
    const gridStart = startOfWeek(first);
    const gridEnd = addDays(gridStart, 42);
    $("calTitle").textContent = fmt(first, { month: "long", year: "numeric" });
    const occs = visibleOccurrences(gridStart, gridEnd);
    // Multi-day events (all-day, or crossing midnight) are bars across the
    // days they cover, in lanes; everything else is a chip in its day.
    const spanning = occs.filter(o => Cal.spansDays(o));
    const single = occs.filter(o => !Cal.spansDays(o));
    const month = element("div", "cal-month");
    const head = element("div", "cal-month-head");
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(d => head.append(element("span", "cal-weekday", d)));
    month.append(head);
    const today = startOfDay(Date.now());
    // Where each week row and day is, for dragging between days (1.9.0).
    calState.monthRows = [];
    calState.monthDays = new Map();
    // At most two lanes of bars, and as many lines per day in all (bars, events,
    // then "+N more") as the window has room for, so every week row keeps the
    // same height and the month fits the window whatever the data.
    const MAX_LANES = 2, ROWS = monthLines();
    calState.monthLines = ROWS;
    for (let w = 0; w < 6; w++) {
        const rowStart = addDays(gridStart, 7 * w);
        const row = element("div", "cal-week-row");
        calState.monthRows.push({ row, start: rowStart });
        const bars = Cal.layoutSpans(spanning, rowStart, 7);
        const lanes = Math.min(MAX_LANES, bars.reduce((n, b) => Math.max(n, b.lane + 1), 0));
        // Set here because repeat(0, ...) isn't valid CSS, and a week without bars
        // would lose its whole template. 34-2.0.0-calendar.css explains the sizes.
        row.style.gridTemplateRows = `calc(38px * var(--text-scale)) ${lanes ? `repeat(${lanes}, calc(30px * var(--text-scale))) ` : ""}minmax(0, 1fr)`;
        for (let d = 0; d < 7; d++) {
            const day = addDays(rowStart, d), next = addDays(day, 1);
            const cell = element("div", `cal-day${new Date(day).getMonth() !== cursor.getMonth() ? " is-other" : ""}${day === today ? " is-today" : ""}`);
            cell.style.gridColumn = String(d + 1);
            if (d === 6) cell.classList.add("is-row-end");
            cell.tabIndex = 0;
            cell.setAttribute("aria-label", `${fmt(day, { weekday: "long", month: "long", day: "numeric" })}; open the day`);
            cell.title = "Open this day by the hour";
            cell.append(element("span", "cal-day-number", String(new Date(day).getDate())));
            // A day opens its hours; there, a click on a time adds an event.
            cell.addEventListener("click", () => openDay(day));
            cell.addEventListener("keydown", event => { if (event.key === "Enter" && event.target === cell) openDay(day); });
            row.append(cell);
            // The day's own events, below the bars; what doesn't fit is "+N more".
            const items = element("div", "cal-day-items");
            items.style.gridColumn = String(d + 1);
            items.style.gridRow = String(2 + lanes);
            calState.monthDays.set(day, { cell, items });
            const chips = single.filter(o => o.start < next && o.end > day);
            const hiddenBars = bars.filter(b => b.lane >= MAX_LANES && b.startCol <= d && b.endCol >= d).length;
            const room = Math.max(1, ROWS - lanes);
            const shown = chips.length + hiddenBars > room ? room - 1 : room;
            chips.slice(0, Math.max(0, shown)).forEach(o => {
                const node = chip(o);
                if (o.resource?.editable) enableMonthDrag(node, o);
                items.append(node);
            });
            const hidden = hiddenBars + Math.max(0, chips.length - Math.max(0, shown));
            if (hidden > 0) {
                const more = element("button", "cal-more", `+${hidden} more`);
                more.type = "button";
                more.addEventListener("click", event => { event.stopPropagation(); openDay(day); });
                items.append(more);
            }
            row.append(items);
        }
        bars.filter(b => b.lane < MAX_LANES).forEach(b => {
            const node = spanBar(b, 1);
            if (b.resource?.editable) enableMonthDrag(node, b);
            row.append(node);
        });
        month.append(row);
    }
    main.replaceChildren(month);
}

// A multi-day event as one bar over its columns (offset = the first day
// column's grid line). A side that continues beyond the row is pointed.
function spanBar(bar, offset) {
    const node = chip(bar, { showTime: !bar.allDay && !bar.continuesBefore });
    node.classList.add("cal-bar");
    node.classList.toggle("continues-before", Boolean(bar.continuesBefore));
    node.classList.toggle("continues-after", Boolean(bar.continuesAfter));
    node.style.gridColumn = `${bar.startCol + offset} / ${bar.endCol + offset + 1}`;
    node.style.gridRow = String(2 + bar.lane);
    const range = bar.allDay
        ? `${fmt(bar.start, { month: "short", day: "numeric" })} – ${fmt(addDays(bar.end, -1), { month: "short", day: "numeric" })}`
        : `${fmt(bar.start, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} – ${fmt(bar.end, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
    if (!bar.countdown) node.title = `${bar.event.summary || "(No title)"} · ${range}${bar.event.location ? ` · ${bar.event.location}` : ""} · ${bar.calendar.name}`;
    return node;
}

// ---- dragging events (1.8.0; resizing and Month in 1.9.0)
// Press on an event and move: an outline in its color snaps to 15-minute
// steps (keeping its length, and across days in Week) with the new time.
// The grips at an event's top and bottom change when it starts or ends
// instead (1.9.0). In Month, events and multi-day bars move between days,
// keeping their times (1.9.0). Dropping saves; Esc, or dropping where it
// started, cancels. A short click still opens the editor. Repeating events
// ask: only this one, or every one.
const DRAG_STEP = 15;
let calDrag = null;

// The click that ends a drag doesn't open the editor.
function suppressClickAfterDrag(node) {
    node.addEventListener("click", event => {
        if (node.dataset.dragged !== "1") return;
        delete node.dataset.dragged;
        event.stopImmediatePropagation();
        event.preventDefault();
    }, true);
}

function enableEventDrag(block, occ, columns) {
    block.addEventListener("pointerdown", event => {
        if (event.button !== 0 || calDrag) return;
        const home = columns.find(entry => entry.column === block.parentElement);
        if (!home) return;
        const rect = home.column.getBoundingClientRect();
        calDrag = {
            kind: "move", block, occ, columns, pointerId: event.pointerId, x: event.clientX, y: event.clientY, started: false,
            grab: (event.clientY - rect.top) / hourHeight * 60 - (occ.start - home.day) / 60000,
            duration: (occ.end - occ.start) / 60000, target: null, ghost: null
        };
    });
    suppressClickAfterDrag(block);
}

// A grip at the top ("start") or bottom ("end") of an event in Day or Week.
function enableResize(grip, block, occ, columns, edge) {
    grip.addEventListener("pointerdown", event => {
        if (event.button !== 0 || calDrag) return;
        event.stopPropagation();                 // the event itself doesn't start moving
        const home = columns.find(entry => entry.column === block.parentElement);
        if (!home) return;
        calDrag = { kind: "resize", edge, block, occ, home, pointerId: event.pointerId, x: event.clientX, y: event.clientY, started: false, target: null, ghost: null };
    });
}

// Minutes into a day (0-1440) of a time on that day, or the day's edge.
function minutesInto(ms, day) {
    if (!sameDay(ms, day)) return ms > day ? 1440 : 0;
    const t = new Date(ms);
    return t.getHours() * 60 + t.getMinutes();
}
const atMinutes = (day, minutes) => { const d = new Date(day); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes).getTime(); };

function enableMonthDrag(node, occ) {
    node.addEventListener("pointerdown", event => {
        if (event.button !== 0 || calDrag) return;
        calDrag = { kind: "month", block: node, occ, from: monthDayAt(event.clientX, event.clientY), pointerId: event.pointerId, x: event.clientX, y: event.clientY, started: false, target: null, ghost: null };
    });
    node.style.touchAction = "none";
    suppressClickAfterDrag(node);
}

// The Month day under a point (the nearest week row, and the column by x).
function monthDayAt(x, y) {
    let best = null, distance = Infinity;
    for (const entry of calState.monthRows || []) {
        const rect = entry.row.getBoundingClientRect();
        const gap = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
        if (gap < distance) { distance = gap; best = { entry, rect }; }
    }
    if (!best) return null;
    const column = Math.max(0, Math.min(6, Math.floor((x - best.rect.left) / (best.rect.width / 7))));
    return addDays(best.entry.start, column);
}

function dragColumnAt(drag, x) {
    let best = drag.columns[0], distance = Infinity;
    for (const entry of drag.columns) {
        const rect = entry.column.getBoundingClientRect();
        if (x >= rect.left && x < rect.right) return entry;
        const gap = Math.min(Math.abs(x - rect.left), Math.abs(x - rect.right));
        if (gap < distance) { distance = gap; best = entry; }
    }
    return best;
}

function moveDrag(event) {
    const drag = calDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.started) {
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
        drag.started = true;
        try { drag.block.setPointerCapture(event.pointerId); } catch { /* the drag still works */ }
        drag.block.classList.add("is-drag-source");
        document.body.classList.add(drag.kind === "resize" ? "is-resizing-event" : "is-dragging-event");
        drag.ghost = element("div", `cal-drop-ghost${drag.kind === "month" ? " is-month" : ""}`);
        drag.ghost.style.setProperty("--cal-color", drag.occ.calendar.color);
        drag.ghost.append(element("strong", ""), element("span", "", drag.occ.event.summary || "(No title)"));
    }
    if (drag.kind === "month") {
        moveMonthDrag(event, drag);
        return;
    }
    // Near the top or bottom edge, the hours scroll.
    const scroller = drag.block.closest(".cal-week-scroll");
    if (scroller) {
        const box = scroller.getBoundingClientRect();
        if (event.clientY < box.top + 28) scroller.scrollTop -= 14;
        else if (event.clientY > box.bottom - 28) scroller.scrollTop += 14;
    }
    if (drag.kind === "resize") {
        moveResizeDrag(event, drag);
        return;
    }
    const hit = dragColumnAt(drag, event.clientX);
    const rect = hit.column.getBoundingClientRect();
    const minutes = Cal.snapStart((event.clientY - rect.top) / hourHeight * 60, drag.grab, drag.duration, DRAG_STEP);
    const at = new Date(hit.day);
    const start = new Date(at.getFullYear(), at.getMonth(), at.getDate(), 0, minutes).getTime();
    const end = start + (drag.occ.end - drag.occ.start);
    drag.target = { start, end };
    const ghost = drag.ghost;
    if (ghost.parentElement !== hit.column) hit.column.append(ghost);
    ghost.style.top = `${minutes / 60 * hourHeight}px`;
    ghost.style.height = `${Math.max(26, drag.duration / 60 * hourHeight - 2)}px`;
    ghost.classList.toggle("is-short", drag.duration / 60 * hourHeight < 50);
    const sameDayAsBefore = startOfDay(start) === startOfDay(drag.occ.start);
    ghost.firstChild.textContent = `${sameDayAsBefore ? "" : `${fmt(start, { weekday: "short" })} `}${timeText(start)} – ${timeText(end)}`;
}

// Resizing: the grip's edge follows the pointer within the event's day; the
// other edge stays exactly where it was.
function moveResizeDrag(event, drag) {
    const { column, day } = drag.home;
    const rect = column.getBoundingClientRect();
    const pointer = (event.clientY - rect.top) / hourHeight * 60;
    const startMinutes = minutesInto(drag.occ.start, day), endMinutes = minutesInto(drag.occ.end, day);
    const from = drag.edge === "start" ? Cal.resizeEdge(pointer, endMinutes, "start", DRAG_STEP) : startMinutes;
    const to = drag.edge === "end" ? Cal.resizeEdge(pointer, startMinutes, "end", DRAG_STEP) : endMinutes;
    const start = drag.edge === "start" ? atMinutes(day, from) : drag.occ.start;
    const end = drag.edge === "end" ? atMinutes(day, to) : drag.occ.end;
    drag.target = { start, end };
    const ghost = drag.ghost;
    if (ghost.parentElement !== column) column.append(ghost);
    const height = (to - from) / 60 * hourHeight;
    ghost.style.top = `${from / 60 * hourHeight}px`;
    ghost.style.height = `${Math.max(26, height - 2)}px`;
    ghost.classList.toggle("is-short", height < 50);
    ghost.firstChild.textContent = `${timeText(start)} – ${timeText(end)}`;
}

// Month: the event moves by whole days, at the same times; its outline sits
// at the top of the day it will start on.
function moveMonthDrag(event, drag) {
    const day = monthDayAt(event.clientX, event.clientY);
    if (day === null || drag.from === null) return;
    const days = Cal.daysBetween(drag.from, day);
    const start = Cal.shiftDays(drag.occ.start, days);
    const end = Cal.shiftDays(drag.occ.end, days);
    drag.target = { start, end };
    const firstDay = startOfDay(start);
    const place = calState.monthDays.get(firstDay) || calState.monthDays.get(day);
    if (!place) return;
    if (drag.cell !== place.cell) {
        drag.cell?.classList.remove("is-drop-target");
        place.cell.classList.add("is-drop-target");
        drag.cell = place.cell;
        place.items.prepend(drag.ghost);
    }
    const multi = Cal.spansDays(drag.occ);
    const last = drag.occ.allDay ? addDays(end, -1) : end;
    ghostLabel(drag).textContent = multi
        ? `${fmt(start, { month: "short", day: "numeric" })} – ${fmt(last, { month: "short", day: "numeric" })}`
        : drag.occ.allDay ? "All day" : timeText(start);       // the outlined day shows the date
}
const ghostLabel = drag => drag.ghost.firstChild;

function endDrag(keepGhost = false) {
    const drag = calDrag;
    calDrag = null;
    if (!drag) return;
    if (drag.started) drag.block.dataset.dragged = "1";
    try { drag.block.releasePointerCapture(drag.pointerId); } catch { /* already released */ }
    document.body.classList.remove("is-dragging-event", "is-resizing-event");
    drag.cell?.classList.remove("is-drop-target");
    if (!keepGhost) {
        drag.block.classList.remove("is-drag-source");
        drag.ghost?.remove();
    }
}

async function dropDrag(event) {
    const drag = calDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const target = drag.started ? drag.target : null;
    if (!target || (target.start === drag.occ.start && target.end === drag.occ.end)) {
        endDrag();
        return;
    }
    endDrag(true);                           // the outline stays until the calendar redraws
    const { occ } = drag;
    const when = drag.kind === "resize"
        ? `${timeText(target.start)} – ${timeText(target.end)}`
        : `${fmt(target.start, { weekday: "short", month: "short", day: "numeric" })}${occ.allDay ? "" : `, ${timeText(target.start)}`}`;
    const repeating = Boolean(occ.resource.parsed.master.rrule);
    const scope = repeating ? await askScope(occ, drag.kind === "resize" ? "Change" : "Move", `${drag.kind === "resize" ? "Change it to" : "Move it to"} ${when}`) : "all";
    if (!scope) {
        drag.block.classList.remove("is-drag-source");
        drag.ghost?.remove();
        return;
    }
    const base = repeating && scope === "all" ? Cal.fieldsOf(occ.resource.parsed.master) : Cal.fieldsOf(occ.event);
    const fields = { ...base, start: target.start, end: target.end, calendar: occ.resource.calendar, ...(scope === "one" ? { rrule: null } : {}) };
    try {
        const undo = await writeEventChange(occ, fields, scope);
        showNotice(`${drag.kind === "resize" ? "Changed" : "Moved"} “${occ.event.summary || "(No title)"}” to ${when}${scope === "one" && repeating ? " (only this one)" : ""}.`, undoAction(undo));
    } catch (error) {
        showNotice(`${drag.kind === "resize" ? "Not changed" : "Not moved"}: ${error.message}`);
    }
    refreshCalendar();
}

document.addEventListener("pointermove", moveDrag);
document.addEventListener("pointerup", dropDrag);
document.addEventListener("pointercancel", () => endDrag());
document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !calDrag?.started) return;
    event.preventDefault();
    event.stopPropagation();
    endDrag();
}, true);

// Every change to a repeating event asks (1.9.0: dragging, resizing, the
// editor's Save and Delete): "Only this one", "Every event in the series",
// or Cancel (null). The verb names it ("Move a repeating event"); the action
// reads like "Move it to Thu, Nov 12, 3:00 PM".
function askScope(occ, verb, action) {
    return new Promise(resolve => {
        const dialog = $("calMoveDialog");
        $("calMoveHeading").textContent = `${verb} a Repeating Event`;
        $("calMoveText").textContent = `“${occ.event.summary || "(No title)"}” repeats. ${action}:`;
        const finish = scope => {
            dialog.hidden = true;
            dialog.removeEventListener("keydown", onKey);
            ["calMoveOne", "calMoveAll", "calMoveCancel"].forEach(id => { $(id).onclick = null; });
            resolve(scope);
        };
        const onKey = event => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            finish(null);
        };
        $("calMoveOne").onclick = () => finish("one");
        $("calMoveAll").onclick = () => finish("all");
        $("calMoveCancel").onclick = () => finish(null);
        dialog.addEventListener("keydown", onKey);
        dialog.hidden = false;
        requestAnimationFrame(() => $("calMoveOne").focus());
    });
}

function openDay(day) {
    calState.cursor = startOfDay(day);
    setCalMode("day");
}

function renderWeek(main) {
    const start = startOfWeek(calState.cursor);
    const last = addDays(start, 6);
    $("calTitle").textContent = new Date(start).getMonth() === new Date(last).getMonth()
        ? `${fmt(start, { month: "long", day: "numeric" })} – ${new Date(last).getDate()}, ${new Date(last).getFullYear()}`
        : `${fmt(start, { month: "short", day: "numeric" })} – ${fmt(last, { month: "short", day: "numeric", year: "numeric" })}`;
    renderHours(main, start, 7);
}

function renderDay(main) {
    const day = startOfDay(calState.cursor);
    $("calTitle").textContent = fmt(day, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    renderHours(main, day, 1);
}

// Hourly columns: the week (7 days) and day (1) views. Clicking a time adds an
// event there; clicking the all-day row adds an all-day event; in the week, a
// day's heading opens that day.
function renderHours(main, start, count) {
    const end = addDays(start, count);
    const occs = visibleOccurrences(start, end);
    const today = startOfDay(Date.now());
    const wrap = element("div", `cal-week${count === 1 ? " is-day" : ""}`);
    wrap.style.setProperty("--cal-days", String(count));
    const head = element("div", "cal-week-head");
    head.append(element("span", "cal-gutter"));
    const allDay = element("div", "cal-week-allday");
    allDay.append(element("span", "cal-gutter", "All day"));
    const body = element("div", "cal-week-body");
    const columns = [];                          // {column, day}, for dragging between days
    const hours = element("div", "cal-hours");
    for (let h = 0; h < 24; h++) hours.append(element("span", "", h === 0 ? "" : timeText(new Date(2000, 0, 1, h).getTime())));
    body.append(hours);
    for (let i = 0; i < count; i++) {
        const day = addDays(start, i), next = addDays(day, 1);
        const label = element(count > 1 ? "button" : "div", `cal-week-day${day === today ? " is-today" : ""}`);
        label.append(element("small", "", fmt(day, { weekday: count > 1 ? "short" : "long" })), element("strong", "", String(new Date(day).getDate())));
        if (count > 1) {
            label.type = "button";
            label.addEventListener("click", () => openDay(day));
            label.title = "Open this day by the hour";
        }
        head.append(label);
        const allCell = element("div", "cal-allday-cell");
        allCell.style.gridColumn = String(i + 2);
        allCell.title = "Add an all-day event";
        allCell.addEventListener("click", () => openEventEditor({ date: day, allDay: true }));
        allDay.append(allCell);
        const column = element("div", `cal-column${day === today ? " is-today" : ""}`);
        column.style.height = `${24 * hourHeight}px`;
        columns.push({ column, day });
        const timed = occs.filter(o => !Cal.spansDays(o) && o.start < next && o.end > day)
            .map(o => ({ ...o, start: Math.max(o.start, day), end: Math.min(Math.max(o.end, o.start + 15 * 60000), next), originalStart: o.start, source: o }));
        Cal.layoutDay(timed).forEach(o => {
            const block = chip({ ...o, start: o.originalStart });
            block.classList.add("cal-block");
            const top = (o.start - day) / 3600000 * hourHeight;
            const height = Math.max(26, (o.end - o.start) / 3600000 * hourHeight - 2);
            block.style.top = `${top}px`;
            block.style.height = `${height}px`;
            if (height < 50) block.classList.add("is-short");   // time and title on one line
            block.style.left = `calc(${(o.lane / o.lanes) * 100}% + 2px)`;
            block.style.width = `calc(${100 / o.lanes}% - 4px)`;
            if (o.source.resource?.editable) {
                enableEventDrag(block, o.source, columns);
                // Grips at the top and bottom change when it starts or ends (1.9.0).
                [["start", "Drag to change when it starts"], ["end", "Drag to change when it ends"]].forEach(([edge, hint]) => {
                    const grip = element("span", `cal-resize is-${edge}`);
                    grip.title = hint;
                    grip.setAttribute("aria-hidden", "true");
                    enableResize(grip, block, o.source, columns, edge);
                    block.append(grip);
                });
            }
            column.append(block);
        });
        if (day === today) {
            const now = element("i", "cal-now");
            now.style.top = `${(Date.now() - day) / 3600000 * hourHeight}px`;
            column.append(now);
        }
        column.addEventListener("click", event => {
            if (event.target !== column) return;
            const minutes = Math.floor((event.offsetY / hourHeight) * 2) * 30;
            openEventEditor({ date: day, minutes });
        });
        body.append(column);
    }
    // Multi-day events across the all-day row, in lanes (rows 1, 2, …), with
    // arrows where they continue past the days shown.
    const bars = Cal.layoutSpans(occs.filter(o => Cal.spansDays(o)), start, count);
    allDay.style.setProperty("--lanes", String(Math.max(1, bars.reduce((n, b) => Math.max(n, b.lane + 1), 0))));
    bars.forEach(b => {
        const bar = spanBar(b, 2);
        bar.style.gridRow = String(1 + b.lane);
        allDay.append(bar);
    });
    const scroller = element("div", "cal-week-scroll");
    scroller.append(body);
    wrap.append(head, allDay, scroller);
    wrap.style.setProperty("--hour-height", `${hourHeight}px`);
    const previous = main.querySelector(".cal-week-scroll")?.scrollTop;
    main.replaceChildren(wrap);
    // The room is only known once it's on the page. Drawn again at most once:
    // the hours' height doesn't change the room they have.
    if (scroller.clientHeight && Math.abs(hoursFit(scroller) - hourHeight) >= .25) {
        hourHeight = hoursFit(scroller);
        renderHours(main, start, count);
        return;
    }
    // Open at 7:00 (or an hour before now when today is shown) when the hours
    // first appear; after that the hours stay where they were scrolled to,
    // whether the same days are redrawn or ‹ › steps to other days (1.9.0:
    // stepping used to jump back to 7:00 or to now).
    if (previous === undefined || calState.scrollToNow) {
        calState.scrollToNow = false;              // Today: back to the current time
        const hour = start <= Date.now() && Date.now() < end ? Math.max(0, new Date().getHours() - 1) : 7;
        scroller.scrollTop = hour * hourHeight;
    } else {
        scroller.scrollTop = previous;
    }
}

// A taller or shorter window changes how many lines fit in a day, and how tall
// an hour is.
window.addEventListener("resize", () => {
    if (!$("calendar").classList.contains("active") || calDrag) return;
    const scroller = document.querySelector(".cal-week-scroll");
    if (calState.mode === "month" ? monthLines() !== calState.monthLines : scroller && Math.abs(hoursFit(scroller) - hourHeight) >= .25) renderCalendar();
});

function hoursFit(scroller) {
    return Math.max(MIN_HOUR_HEIGHT, Math.floor(scroller.clientHeight / 24 * 4) / 4);
}

function renderAgenda(main) {
    const start = startOfDay(calState.cursor);
    const end = addDays(start, 60);
    $("calTitle").textContent = `${fmt(start, { month: "long", day: "numeric", year: "numeric" })} Onward`;
    const occs = visibleOccurrences(start, end);
    const list = element("div", "cal-agenda");
    for (let day = start; day < end; day = addDays(day, 1)) {
        const next = addDays(day, 1);
        const items = occs.filter(o => o.start < next && o.end > day);
        if (!items.length) continue;
        const group = element("section", `cal-agenda-day${sameDay(day, Date.now()) ? " is-today" : ""}`);
        group.append(element("h3", "", fmt(day, { weekday: "long", month: "long", day: "numeric" })));
        items.forEach(o => {
            const row = element("button", "cal-agenda-row");
            row.type = "button";
            row.style.setProperty("--cal-color", o.calendar.color);
            row.append(element("span", "cal-agenda-time", o.allDay ? "All day" : `${timeText(Math.max(o.start, day))} – ${timeText(o.end)}`),
                element("i"), element("strong", "", o.event.summary || "(No title)"),
                element("small", "", [o.event.location, o.calendar.name].filter(Boolean).join(" · ")));
            if (o.countdown) row.classList.add("is-countdown");
            row.addEventListener("click", () => openOccurrence(o));
            group.append(row);
        });
        list.append(group);
    }
    if (!list.children.length) list.append(calState.loaded ? element("p", "settings-note", "Nothing in the next 60 days.") : loadingNote());
    main.replaceChildren(list);
}

function setCalMode(mode) {
    calState.mode = mode;
    saveCalPrefs();
    renderCalendar();
}

function stepCalendar(direction) {
    const t = new Date(calState.cursor);
    if (calState.mode === "month") calState.cursor = new Date(t.getFullYear(), t.getMonth() + direction, 1).getTime();
    else calState.cursor = addDays(calState.cursor, direction * ({ day: 1, week: 7 }[calState.mode] || 30));
    renderCalendar();
}

// Ctrl + E from anywhere: the Calendar page with a new event (once loaded).
function newEventFromShortcut() {
    if (!$("calEventDialog").hidden || !$("calCalendarDialog").hidden) return;
    navigate("calendar");
    if (calState.server.state !== "running") {
        showNotice(calState.server.message || "The calendar server is still starting; try again in a moment.");
        return;
    }
    if (calState.loaded && calState.calendars.length) openEventEditor({});
    else calState.newEventWhenReady = true;
}

function openCalendarView() {
    send("GetCalendarState");
    if (calState.server.state === "running") refreshCalendar();
    renderCalendar();
}

// ---- the event editor

function fillMonthlyChoices(start) {
    const t = new Date(start);
    const nth = Math.ceil(t.getDate() / 7);
    const isLast = t.getDate() + 7 > new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    const weekday = fmt(start, { weekday: "long" });
    const ordinal = ["first", "second", "third", "fourth", "fifth"][nth - 1];
    const select = $("calMonthly");
    const previous = select.value;
    select.replaceChildren();
    const add = (value, text) => { const o = element("option", "", text); o.value = value; select.append(o); };
    add("day", `On day ${t.getDate()}`);
    if (nth <= 4) add(`${nth}`, `On the ${ordinal} ${weekday}`);
    if (isLast) add("-1", `On the last ${weekday}`);
    if ([...select.options].some(o => o.value === previous)) select.value = previous;
}

function updateRepeatControls() {
    const freq = $("calRepeat").value;
    $("calEvery").hidden = !freq;
    $("calIntervalUnit").textContent = { DAILY: "days", WEEKLY: "weeks", MONTHLY: "months", YEARLY: "years" }[freq] || "";
    $("calWeekdays").hidden = freq !== "WEEKLY";
    $("calMonthly").hidden = freq !== "MONTHLY";
    $("calEndsRow").hidden = !freq;
    const ends = $("calRepeatEnd").value;
    $("calUntil").hidden = !freq || ends !== "until";
    $("calCountWrap").hidden = !freq || ends !== "count";
    const allDay = $("calAllDay").checked;
    $("calStartTime").hidden = allDay;
    $("calEndTime").hidden = allDay;
    refreshPickers();
    const start = fromInputs($("calStartDate").value, "00:00");
    if (Number.isFinite(start)) fillMonthlyChoices(start);
}

// ---- the wheel pickers (1.9.0): times and dates
// Each part (hour, minute, AM/PM; month, day, year) turns with the mouse
// wheel over it or the arrow keys; digits type a value, moving on once it's
// complete; Left and Right move between parts. The field underneath still
// holds the value the editor reads; the picker shows and sets it. Dates also
// keep a button for the calendar pop-up.
const wheelPickers = [];

const TIME_PICKER = {
    kind: "time",
    hint: "Turn the wheel over the hour, minute or AM/PM, or type",
    parts: [
        { name: "hour", label: "hour", digits: 2, min: 1, max: 12 },
        { name: "minute", label: "minute", digits: 2, min: 0, max: 59, before: ":" },
        { name: "meridiem", label: "AM or PM", letters: { a: "AM", p: "PM" } }
    ],
    show: value => {
        const { hour, minute, meridiem } = Cal.timeParts(value);
        return { hour: [String(hour), hour], minute: [String(minute).padStart(2, "0"), minute], meridiem: [meridiem, null] };
    },
    step: (value, part, delta) => Cal.stepTime(value, part, delta),
    set: (value, part, typed) => Cal.setTimePart(value, part, typed)
};

const DATE_PICKER = {
    kind: "date",
    hint: "Turn the wheel over the month, day or year, or type",
    parts: [
        { name: "month", label: "month", digits: 2, min: 1, max: 12 },
        { name: "day", label: "day", digits: 2, min: 1, max: 31, before: "/" },
        { name: "year", label: "year", digits: 4, min: 1900, max: 2100, before: "/" }
    ],
    show: value => {
        const { month, day, year } = Cal.dateParts(value);
        return { month: [String(month).padStart(2, "0"), month], day: [String(day).padStart(2, "0"), day], year: [String(year), year] };
    },
    step: (value, part, delta) => Cal.stepDate(value, part, delta),
    set: (value, part, typed) => Cal.setDatePart(value, part, typed)
};

function makeWheelPicker(input, spec) {
    const box = element("div", `cal-spin is-${spec.kind}`);
    box.setAttribute("role", "group");
    const label = input.getAttribute("aria-label") || (spec.kind === "date" ? "Date" : "Time");
    box.setAttribute("aria-label", label);
    box.title = spec.hint;
    const nodes = {};
    let typed = "", typedAt = 0, wheel = 0;
    const set = value => {
        if (!value || value === input.value) return;
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        refresh();
    };
    const focusPart = (index, step) => nodes[spec.parts[Math.max(0, Math.min(spec.parts.length - 1, index + step))].name].focus();
    spec.parts.forEach((part, index) => {
        if (part.before) box.append(element("span", "cal-spin-sep", part.before));
        const node = element("span", `cal-spin-part is-${part.name}`);
        node.tabIndex = 0;
        node.setAttribute("role", "spinbutton");
        node.setAttribute("aria-label", `${label}, ${part.label}`);
        if (part.min !== undefined) {
            node.setAttribute("aria-valuemin", String(part.min));
            node.setAttribute("aria-valuemax", String(part.max));
        }
        node.addEventListener("wheel", event => {
            event.preventDefault();
            // A mouse notch is one step; a touchpad's small deltas add up.
            wheel += event.deltaMode === 0 ? event.deltaY : event.deltaY * 40;
            if (Math.abs(wheel) < 40) return;
            const step = wheel < 0 ? 1 : -1;
            wheel = 0;
            set(spec.step(input.value, part.name, step));
        }, { passive: false });
        node.addEventListener("focus", () => { typed = ""; });
        node.addEventListener("keydown", event => {
            const key = event.key;
            if (key === "ArrowUp" || key === "ArrowDown") set(spec.step(input.value, part.name, key === "ArrowUp" ? 1 : -1));
            else if (key === "ArrowLeft" || key === "ArrowRight") focusPart(index, key === "ArrowLeft" ? -1 : 1);
            else if (part.letters && part.letters[key.toLowerCase()]) set(spec.set(input.value, part.name, part.letters[key.toLowerCase()]));
            else if (part.digits && /^\d$/.test(key)) {
                // Digits typed within a second build one number (1 then 0 is 10).
                const now = Date.now();
                typed = (now - typedAt < 1000 ? typed + key : key).slice(-part.digits);
                typedAt = now;
                const number = Number(typed);
                if (part.digits === 4) {
                    if (typed.length === 4) { set(spec.set(input.value, part.name, number)); typed = ""; focusPart(index, 1); }
                } else if (number >= part.min && number <= part.max) {
                    set(spec.set(input.value, part.name, number));
                    if (typed.length === part.digits || number * 10 > part.max) { typed = ""; focusPart(index, 1); }
                } else if (typed.length === part.digits || number > part.max) {
                    typed = number > part.max ? key : "";        // a fresh start with this digit
                }
            } else return;
            event.preventDefault();
        });
        nodes[part.name] = node;
        box.append(node);
    });
    if (spec.kind === "date") {
        // The calendar pop-up: the date field, invisible over the picker, opens it.
        const open = element("button", "cal-spin-open");
        open.type = "button";
        open.title = "Choose from a calendar";
        open.setAttribute("aria-label", `${label}: choose from a calendar`);
        open.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3"/></svg>';
        open.addEventListener("click", () => {
            try { input.showPicker(); } catch { /* not available: the parts still work */ }
        });
        box.append(open);
    }
    function refresh() {
        const shown = spec.show(input.value);
        spec.parts.forEach(part => {
            const [text, value] = shown[part.name];
            nodes[part.name].textContent = text;
            if (value === null) nodes[part.name].setAttribute("aria-valuetext", text);
            else nodes[part.name].setAttribute("aria-valuenow", String(value));
        });
        box.hidden = input.hidden;
    }
    input.classList.add(`cal-${spec.kind}-native`);
    input.after(box);
    if (spec.kind === "date") box.append(input);      // under the picker, for its pop-up
    input.addEventListener("change", refresh);        // a date chosen in the pop-up
    wheelPickers.push(refresh);
    refresh();
}

function refreshPickers() {
    wheelPickers.forEach(refresh => refresh());
}

makeWheelPicker($("calStartDate"), DATE_PICKER);
makeWheelPicker($("calStartTime"), TIME_PICKER);
makeWheelPicker($("calEndDate"), DATE_PICKER);
makeWheelPicker($("calEndTime"), TIME_PICKER);
makeWheelPicker($("calUntil"), DATE_PICKER);

function buildWeekdayChips(selected) {
    const box = $("calWeekdays");
    box.replaceChildren(...["S", "M", "T", "W", "T", "F", "S"].map((letter, day) => {
        const b = element("button", "cal-weekday-chip", letter);
        b.type = "button";
        b.title = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day];
        b.dataset.day = String(day);
        b.setAttribute("aria-pressed", String(selected.includes(day)));
        b.addEventListener("click", () => b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")));
        return b;
    }));
}

function openEventEditor({ occurrence = null, date = null, minutes = null, allDay = false } = {}) {
    if (calState.server.state !== "running" || !calState.calendars.length) return;
    if (occurrence && !occurrence.resource.editable) {
        showNotice("This event was made elsewhere with a file name Maestro can't safely change, so it's read-only here.");
        return;
    }
    const master = occurrence?.resource.parsed.master;
    const fields = occurrence ? { ...Cal.fieldsOf(occurrence.event), start: occurrence.start, end: occurrence.end } : null;
    const now = Date.now();
    let start, end;
    if (fields) {
        start = fields.start; end = fields.end;
    } else {
        const day = date ?? startOfDay(now);
        const hour = minutes !== null ? minutes : sameDay(day, now) ? (new Date(now).getHours() + 1) * 60 : 9 * 60;
        start = allDay ? day : day + Math.min(hour, 23 * 60) * 60000;
        end = allDay ? addDays(day, 1) : start + 3600000;
    }
    const isAllDay = fields ? fields.allDay : allDay;
    calState.editing = { occurrence, master };
    $("calEventHeading").textContent = occurrence ? "Edit Event" : "New Event";
    $("calSummary").value = fields?.summary || "";
    const select = $("calCalendar");
    select.replaceChildren(...calState.calendars.map(c => { const o = element("option", "", c.name); o.value = c.id; return o; }));
    select.value = occurrence?.calendar.id || calState.calendars.find(c => !calPrefs.hidden.has(c.id))?.id || calState.calendars[0].id;
    $("calAllDay").checked = isAllDay;
    $("calStartDate").value = isoDate(start);
    $("calStartTime").value = isoTime(start);
    const shownEnd = isAllDay ? addDays(end, -1) : end;    // all-day ends are exclusive; show the last day
    $("calEndDate").value = isoDate(shownEnd);
    $("calEndTime").value = isoTime(end);
    rememberEventDuration();
    renderSlotPreview();
    const rule = master?.rrule || null;
    $("calRepeat").value = rule?.freq || "";
    $("calInterval").value = String(rule?.interval || 1);
    buildWeekdayChips(rule?.byday?.length ? rule.byday.map(b => b.day) : [new Date(start).getDay()]);
    fillMonthlyChoices(start);
    $("calMonthly").value = rule?.byday?.length && rule.freq === "MONTHLY" ? String(rule.byday[0].n) : "day";
    if (!$("calMonthly").value) $("calMonthly").value = "day";
    $("calRepeatEnd").value = rule?.count ? "count" : rule?.until ? "until" : "never";
    $("calUntil").value = rule?.until ? isoDate(rule.until) : isoDate(addDays(start, 90));
    $("calCount").value = String(rule?.count || 10);
    $("calReminder").value = fields && fields.reminder !== null && fields.reminder !== undefined ? String(fields.reminder) : "";
    if (![...$("calReminder").options].some(o => o.value === $("calReminder").value)) $("calReminder").value = "15";
    $("calLocation").value = fields?.location || "";
    $("calNotes").value = fields?.description || "";
    $("calDeleteEvent").hidden = !occurrence;
    $("calPinCountdown").hidden = !occurrence;
    // A changed occurrence of a series (an override) can go back to the series.
    $("calRejoinSeries").hidden = !(occurrence && master?.rrule && occurrence.event !== master);
    $("calEventError").hidden = true;
    updateRepeatControls();
    $("calEventDialog").hidden = false;
    requestAnimationFrame(() => $("calSummary").focus());
}

function closeCalDialogs() {
    if (!$("calCountdownDialog").hidden) restoreCountdownRows();
    $("calCountdownDialog").hidden = true;
    $("calEventDialog").hidden = true;
    $("calCalendarDialog").hidden = true;
    $("calImportDialog").hidden = true;
    calState.editing = null;
    calState.editingCalendar = null;
}

// The editor's start and end as instants (an all-day end is exclusive).
function editorTimes() {
    const allDay = $("calAllDay").checked;
    const start = fromInputs($("calStartDate").value, allDay ? "00:00" : $("calStartTime").value);
    const end = allDay ? addDays(fromInputs($("calEndDate").value, "00:00"), 1) : fromInputs($("calEndDate").value, $("calEndTime").value);
    return { allDay, start, end };
}

function rememberEventDuration() {
    const { start, end } = editorTimes();
    if (calState.editing && Number.isFinite(start) && end > start) calState.editing.duration = end - start;
}

function keepEventDuration() {
    const { allDay, start } = editorTimes();
    const duration = calState.editing?.duration;
    if (!Number.isFinite(start) || !(duration > 0)) return;
    // All-day: whole days, so a daylight-saving change can't shift the date.
    const end = allDay ? addDays(start, Math.max(1, Math.round(duration / 86400000))) : start + duration;
    $("calEndDate").value = isoDate(allDay ? addDays(end, -1) : end);
    if (!allDay) $("calEndTime").value = isoTime(end);
    refreshPickers();
}

// The slot being set, on a strip of its day (1.8.0): the day's other timed
// events in gray, this one in its calendar's color, and a note when they
// overlap. Redrawn as the times change, so a move is seen before saving.
// 1.9.0: when the end isn't after the start, the strip stays where it is
// (so nothing below it moves while turning the wheel) and says so.
function renderSlotPreview() {
    const box = $("calSlotPreview");
    const { allDay, start, end: chosenEnd } = editorTimes();
    if (!Number.isFinite(start)) {
        box.replaceChildren(slotProblem("Choose when it starts"), element("div", "cal-slot-track is-invalid"), element("div", "cal-slot-scale"));
        box.hidden = false;
        return;
    }
    const invalid = !(chosenEnd > start);
    if (allDay) {
        renderDaySpanPreview(box, start, invalid ? addDays(start, 1) : chosenEnd, invalid);
        return;
    }
    const end = invalid ? start + 3600000 : chosenEnd;    // the hours shown around the start
    const day = startOfDay(start);
    const dayEnd = addDays(day, 1);
    const hourMs = 3600000;
    // The hours around the event (at least 8, within its day), so a short
    // event is wide enough to see.
    const startHour = (start - day) / hourMs;
    const endHour = Math.min(24, (end - day) / hourMs);
    let fromHour = Math.max(0, Math.floor(startHour) - 3);
    let toHour = Math.min(24, Math.ceil(endHour) + 3);
    if (toHour - fromHour < 8) {
        const grow = 8 - (toHour - fromHour);
        fromHour = Math.max(0, fromHour - Math.ceil(grow / 2));
        toHour = Math.min(24, fromHour + 8);
        fromHour = Math.max(0, toHour - 8);
    }
    const windowStart = day + fromHour * hourMs;
    const windowEnd = day + toHour * hourMs;
    const editing = calState.editing?.occurrence;
    const others = visibleOccurrences(day, dayEnd)
        .filter(occ => !occ.allDay && !occ.countdown && !occ.holiday && !(editing && occ.resource === editing.resource && occ.start === editing.start));
    const span = windowEnd - windowStart;
    const place = (node, from, to) => {
        const left = Math.max(0, (from - windowStart) / span * 100);
        node.style.left = `${left}%`;
        node.style.width = `${Math.max(0.8, Math.min(100, (Math.min(to, windowEnd) - windowStart) / span * 100) - left)}%`;
    };
    const track = element("div", "cal-slot-track");
    track.style.setProperty("--hours", String(toHour - fromHour));
    const scale = element("div", "cal-slot-scale");
    for (let hour = fromHour; hour <= toHour; hour += (toHour - fromHour > 12 ? 2 : 1)) {
        const mark = element("span", "", hour % 12 === 0 ? (hour === 12 ? "12 PM" : "12 AM") : hour < 12 ? `${hour} AM` : `${hour - 12} PM`);
        mark.style.left = `${(hour - fromHour) / (toHour - fromHour) * 100}%`;
        scale.append(mark);
    }
    others.filter(occ => occ.end > windowStart && occ.start < windowEnd).forEach(occ => {
        const block = element("span", "cal-slot-other");
        block.title = `${occ.event.summary || "(No title)"} · ${timeText(occ.start)}–${timeText(occ.end)}`;
        place(block, Math.max(occ.start, day), occ.end);
        track.append(block);
    });
    const color = calState.calendars.find(c => c.id === $("calCalendar").value)?.color || CAL_COLORS[0];
    if (invalid) {
        track.classList.add("is-invalid");
        box.replaceChildren(slotProblem(`Ends before it starts (${timeText(start)})`), track, scale);
        box.hidden = false;
        return;
    }
    const slot = element("span", "cal-slot-this");
    slot.style.setProperty("--cal-color", color);
    place(slot, start, end);
    track.append(slot);
    const clash = others.filter(occ => occ.start < end && occ.end > start);
    const caption = element("div", "cal-slot-caption");
    caption.append(element("strong", "", `${fmt(start, { weekday: "short", month: "short", day: "numeric" })} · ${timeText(start)} – ${timeText(end)}${end > dayEnd ? " (next day)" : ""}`));
    if (clash.length) caption.append(element("span", "cal-slot-clash", `Overlaps ${clash.slice(0, 2).map(occ => occ.event.summary || "(No title)").join(" and ")}${clash.length > 2 ? ` and ${clash.length - 2} more` : ""}`));
    box.replaceChildren(caption, track, scale);
    box.hidden = false;
}

// All-day and multi-day events: a strip of the days around them (at least a
// week), the days they cover in their calendar's color and other all-day
// events in gray.
function slotProblem(text) {
    const caption = element("div", "cal-slot-caption is-invalid");
    caption.append(element("strong", "", text));
    return caption;
}

function renderDaySpanPreview(box, start, end, invalid = false) {
    const DAY = 86400000;
    const days = Math.max(1, Math.round((end - start) / DAY));
    const before = Math.max(2, Math.floor((7 - days) / 2));
    const from = addDays(start, -before);
    const count = Math.min(31, Math.max(7, days + before * 2));
    const to = addDays(from, count);
    const editing = calState.editing?.occurrence;
    const others = visibleOccurrences(from, to)
        .filter(occ => occ.allDay && !(editing && occ.resource === editing.resource && occ.start === editing.start));
    const place = (node, a, b) => {
        const left = Math.max(0, Math.round((a - from) / DAY)) / count * 100;
        const right = Math.min(count, Math.round((Math.min(b, to) - from) / DAY)) / count * 100;
        node.style.left = `${left}%`;
        node.style.width = `${Math.max(1, right - left)}%`;
    };
    const track = element("div", "cal-slot-track is-days");
    track.style.setProperty("--hours", String(count));
    others.forEach(occ => {
        const block = element("span", "cal-slot-other");
        block.title = occ.event.summary || "(No title)";
        place(block, Math.max(occ.start, from), occ.end);
        track.append(block);
    });
    const slot = element("span", "cal-slot-this");
    slot.style.setProperty("--cal-color", calState.calendars.find(c => c.id === $("calCalendar").value)?.color || CAL_COLORS[0]);
    place(slot, start, end);
    if (!invalid) track.append(slot);
    else track.classList.add("is-invalid");
    const scale = element("div", "cal-slot-scale is-days");
    for (let i = 0; i < count; i++) {
        const day = addDays(from, i);
        const date = String(new Date(day).getDate());
        const mark = element("span", "", count > 14 ? date : `${fmt(day, { weekday: "short" })} ${date}`);
        mark.style.left = `${(i + 0.5) / count * 100}%`;
        scale.append(mark);
    }
    if (invalid) {
        box.replaceChildren(slotProblem(`Ends before it starts (${fmt(start, { month: "short", day: "numeric" })})`), track, scale);
        box.hidden = false;
        return;
    }
    const last = addDays(end, -1);
    const caption = element("div", "cal-slot-caption");
    caption.append(element("strong", "", days === 1
        ? `${fmt(start, { weekday: "short", month: "short", day: "numeric" })} · all day`
        : `${fmt(start, { month: "short", day: "numeric" })} – ${fmt(last, { month: "short", day: "numeric" })} · ${days} days`));
    const clash = others.filter(occ => !occ.countdown && !occ.holiday && occ.start < end && occ.end > start);
    if (clash.length) caption.append(element("span", "cal-slot-clash", `Alongside ${clash.slice(0, 2).map(occ => occ.event.summary || "(No title)").join(" and ")}${clash.length > 2 ? ` and ${clash.length - 2} more` : ""}`));
    box.replaceChildren(caption, track, scale);
    box.hidden = false;
}

function readEditor() {
    const times = editorTimes();
    const { allDay } = times;
    let { start, end } = times;
    if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error("Choose a start and an end.");
    if (end <= start) {
        if (allDay) end = addDays(start, 1);
        else throw new Error("The end must be after the start.");
    }
    const freq = $("calRepeat").value;
    let rrule = null;
    if (freq) {
        rrule = { freq, interval: Math.max(1, Math.min(99, parseInt($("calInterval").value, 10) || 1)) };
        if (freq === "WEEKLY") {
            const days = [...document.querySelectorAll("#calWeekdays [aria-pressed='true']")].map(b => ({ n: 0, day: Number(b.dataset.day) }));
            rrule.byday = days.length ? days : [{ n: 0, day: new Date(start).getDay() }];
        }
        if (freq === "MONTHLY" && $("calMonthly").value !== "day") rrule.byday = [{ n: Number($("calMonthly").value), day: new Date(start).getDay() }];
        const ends = $("calRepeatEnd").value;
        if (ends === "count") rrule.count = Math.max(1, Math.min(999, parseInt($("calCount").value, 10) || 1));
        if (ends === "until") {
            const until = fromInputs($("calUntil").value, "23:59");
            if (!Number.isFinite(until) || until < start) throw new Error("The repeat must end after the event starts.");
            rrule.until = allDay ? startOfDay(until) : until;
            rrule.untilAllDay = allDay;
        }
    }
    const reminder = $("calReminder").value === "" ? null : Number($("calReminder").value);
    return {
        summary: $("calSummary").value.trim(), location: $("calLocation").value.trim(), description: $("calNotes").value.trim(),
        start, end, allDay, rrule, reminder, calendar: $("calCalendar").value
    };
}

async function saveEvent(event) {
    event.preventDefault();
    const editing = calState.editing;
    let fields;
    try {
        fields = readEditor();
    } catch (error) {
        showCalError("calEventError", error.message);
        return;
    }
    const occ = editing?.occurrence;
    let scope = "all";
    if (occ?.resource.parsed.master.rrule) {
        scope = await askScope(occ, "Change", "Save your changes to");
        if (!scope) {
            $("calSaveEvent").focus();           // back to the editor, nothing saved
            return;
        }
    }
    $("calSaveEvent").disabled = true;
    try {
        const undo = await writeEventChange(occ, fields, scope);
        closeCalDialogs();
        showNotice(`Saved “${fields.summary || "(No title)"}”${occ && scope === "one" && occ.resource.parsed.master.rrule ? " (only this one)" : ""}.`, undoAction(undo));
    } catch (error) {
        showCalError("calEventError", error.message);
    } finally {
        $("calSaveEvent").disabled = false;
    }
    refreshCalendar();
}

// Writes an event change (from the editor, or a drag) and returns its Undo
// steps. For an occurrence of a repeating event, "one" changes only that date
// (1.9.0: as an override that stays in the series, so it's asked about again
// and can go back; moved to another calendar it still becomes an event of
// its own); "all" moves the whole series by the same amount, its changed
// occurrences with it.
async function writeEventChange(occ, fields, scope) {
    const undo = [];
    if (!occ) {
        undo.push(await putNew(fields.calendar, fields));
    } else if (occ.resource.parsed.master.rrule && scope === "one" && fields.calendar === occ.resource.calendar) {
        undo.push(await putExisting(occ.resource, Cal.overrideOccurrence(occ.resource.text, occ.original, fields)));
    } else if (occ.resource.parsed.master.rrule && scope === "one") {
        // To another calendar: the series skips this date; the occurrence becomes an event there.
        undo.push(await putExisting(occ.resource, Cal.skipOccurrence(occ.resource.text, occ.original)));
        undo.push(await putNew(fields.calendar, { ...fields, rrule: null }));
    } else {
        const master = occ.resource.parsed.master;
        // Moving an occurrence moves the whole series by the same amount: the
        // same number of days and the same change of clock time (1.9.0: not
        // raw milliseconds, which slip an hour across a daylight-saving change).
        const days = Cal.daysBetween(occ.start, fields.start);
        const clock = fields.start - Cal.shiftDays(occ.start, days);
        const move = ms => Cal.shiftDays(ms, days) + clock;
        const seriesFields = master.rrule
            ? { ...fields, start: move(master.start), end: move(master.start) + (fields.end - fields.start), exdates: master.exdates.map(move) }
            : { ...fields, exdates: [] };
        let text = Cal.editResource(occ.resource.text, seriesFields);
        // The series' changed occurrences move with it; the one being edited
        // (if it is one) takes this edit.
        if (master.rrule && occ.resource.parsed.overrides.length) {
            text = Cal.moveOverrides(text, move, occ.event.recurrenceId !== null && occ.event.recurrenceId !== undefined ? occ.original : null, { ...fields, rrule: null });
        }
        if (fields.calendar !== occ.resource.calendar) {
            undo.push(await putNew(fields.calendar, null, text, occ.resource.name));
            const removed = await calRequest("deleteEvent", occ.resource.calendar, occ.resource.name, occ.resource.etag);
            if (removed.status >= 300 && removed.status !== 404) throw new Error(`The old copy couldn't be removed (${removed.status}).`);
            undo.push({ op: "recreate", calendar: occ.resource.calendar, name: occ.resource.name, text: occ.resource.text });
        } else {
            undo.push(await putExisting(occ.resource, text));
        }
    }
    return undo;
}

// Each returns its Undo step: a new event is removed again; a changed one
// gets its previous text back (only if it's still the version saved here).
async function putNew(calendar, fields, text = null, name = null) {
    const uid = name || Cal.uidNew();
    const body = text || Cal.newResource(`${uid}@ascs`, fields);
    const reply = await calRequest("putEvent", calendar, uid, "", body);
    if (reply.status === 412) throw new Error("An event with that id already exists there.");
    if (reply.status >= 300) throw new Error(`The event wasn't saved (${reply.status}).`);
    return { op: "remove", calendar, name: uid, etag: reply.etag || "" };
}

async function putExisting(resource, text) {
    if (!text) throw new Error("The event couldn't be changed.");
    const reply = await calRequest("putEvent", resource.calendar, resource.name, resource.etag || "", text);
    if (reply.status === 412) throw new Error("This event was changed elsewhere since it was shown. It has been reloaded; try again.");
    if (reply.status >= 300) throw new Error(`The event wasn't saved (${reply.status}).`);
    return { op: "restore", calendar: resource.calendar, name: resource.name, text: resource.text, etag: reply.etag || "" };
}

// ---- Undo (1.9.0)
// Every calendar change (drag, resize, Save, Delete, Back to the series)
// offers Undo in its notice for 10 seconds. Undo puts back exactly what was
// there, step by step in reverse; it uses the version saved here, so a
// change made elsewhere in between is never overwritten (it stops and says so).
async function runUndo(steps) {
    for (const step of [...steps].reverse()) {
        let reply;
        if (step.op === "restore") reply = await calRequest("putEvent", step.calendar, step.name, step.etag, step.text);
        else if (step.op === "remove") reply = await calRequest("deleteEvent", step.calendar, step.name, step.etag);
        else reply = await calRequest("putEvent", step.calendar, step.name, "", step.text);      // recreate
        if (reply.status === 412) throw new Error("it was changed again since");
        if (reply.status >= 300 && !(step.op === "remove" && reply.status === 404)) throw new Error(`the calendar server said ${reply.status}`);
    }
}

function undoAction(steps) {
    if (!steps?.length) return null;
    return {
        label: "Undo",
        run: async () => {
            try {
                await runUndo(steps);
                showNotice("Undone.");
            } catch (error) {
                showNotice(`Not undone: ${error.message}.`);
            }
            refreshCalendar();
        }
    };
}

// "Back to the series" (1.9.0): a changed occurrence takes the series' time
// and details again (its override is removed); Undo brings the change back.
async function rejoinSeries() {
    const occ = calState.editing?.occurrence;
    if (!occ || occ.event === occ.resource.parsed.master) return;
    try {
        const undo = [await putExisting(occ.resource, Cal.restoreOccurrence(occ.resource.text, occ.original))];
        closeCalDialogs();
        showNotice(`“${occ.event.summary || "(No title)"}” is back in step with its series.`, undoAction(undo));
    } catch (error) {
        showCalError("calEventError", error.message);
    }
    refreshCalendar();
}

async function deleteEvent() {
    const occ = calState.editing?.occurrence;
    if (!occ) return;
    const repeating = Boolean(occ.resource.parsed.master.rrule);
    const scope = repeating ? await askScope(occ, "Delete", "Delete") : "all";
    if (!scope) return;
    const title = occ.event.summary || "this event";
    const confirmed = await confirmDialog({
        title: repeating && scope === "all" ? "Delete the whole series?" : "Delete this event?",
        message: repeating && scope === "all" ? `Every "${title}" in the series will be deleted.` : repeating ? `Only this "${title}" will be removed; the rest of the series stays.` : `"${title}" will be deleted.`,
        confirmLabel: "Delete", danger: true
    });
    if (!confirmed) return;
    try {
        let undo;
        if (repeating && scope === "one") {
            undo = [await putExisting(occ.resource, Cal.skipOccurrence(occ.resource.text, occ.original))];
        } else {
            const reply = await calRequest("deleteEvent", occ.resource.calendar, occ.resource.name, occ.resource.etag || "");
            if (reply.status === 412) throw new Error("This event was changed elsewhere; it has been reloaded.");
            if (reply.status >= 300 && reply.status !== 404) throw new Error(`The event wasn't deleted (${reply.status}).`);
            undo = [{ op: "recreate", calendar: occ.resource.calendar, name: occ.resource.name, text: occ.resource.text }];
        }
        closeCalDialogs();
        showNotice(`Deleted “${occ.event.summary || "(No title)"}”${repeating && scope === "one" ? " (only this one)" : ""}.`, undoAction(undo));
    } catch (error) {
        showCalError("calEventError", error.message);
    }
    refreshCalendar();
}

function showCalError(id, message) {
    $(id).textContent = message;
    $(id).hidden = false;
}

// ---- the calendar editor

function openCalendarEditor(calendar = null) {
    if (calState.server.state !== "running") return;
    calState.editingCalendar = calendar;
    // Countdowns and US Holidays are read-only: here only their color is
    // chosen (countdowns themselves have their own dialog).
    const overlay = calendar === COUNTDOWN_CALENDAR || calendar === HOLIDAY_CALENDAR;
    $("calCalendarHeading").textContent = overlay ? calendar.name : calendar ? "Edit Calendar" : "New Calendar";
    $("calCalendarName").value = calendar?.name || "";
    $("calCalendarName").hidden = overlay;
    $("calCalendarNameLabel").hidden = overlay;
    $("calManageCountdowns").hidden = calendar !== COUNTDOWN_CALENDAR;
    const chosen = (calendar?.color || CAL_COLORS.find(c => !calState.calendars.some(k => k.color === c)) || CAL_COLORS[0]).toUpperCase();
    $("calSwatches").replaceChildren(...CAL_COLORS.map(color => {
        const swatch = element("button", "cal-swatch");
        swatch.type = "button";
        swatch.dataset.color = color;
        swatch.style.setProperty("--cal-color", color);
        swatch.setAttribute("role", "radio");
        swatch.setAttribute("aria-label", color);
        swatch.addEventListener("click", () => chooseCalColor(color));
        return swatch;
    }));
    chooseCalColor(isCalColor(chosen) ? chosen : CAL_COLORS[0]);
    $("calDeleteCalendar").hidden = !calendar || overlay;
    $("calExportCalendar").hidden = !calendar || overlay;
    $("calCalendarError").hidden = true;
    $("calCalendarDialog").hidden = false;
    requestAnimationFrame(() => (overlay ? document.querySelector(".cal-swatch[aria-checked='true']") : $("calCalendarName"))?.focus());
}

// One of the swatches, or any other color, from the picker or typed as hex.
let calChosenColor = CAL_COLORS[0];
function chooseCalColor(color, from = "") {
    calChosenColor = color.toUpperCase();
    document.querySelectorAll(".cal-swatch").forEach(swatch => swatch.setAttribute("aria-checked", String(swatch.dataset.color === calChosenColor)));
    const custom = !CAL_COLORS.includes(calChosenColor);
    $("calCustomColor").classList.toggle("is-chosen", custom);
    if (from !== "picker") $("calCustomColor").value = calChosenColor.toLowerCase();
    if (from !== "hex") $("calCustomHex").value = custom ? calChosenColor : "";
    $("calCustomHex").removeAttribute("aria-invalid");
}

$("calCustomColor").addEventListener("input", () => chooseCalColor($("calCustomColor").value, "picker"));
$("calCustomHex").addEventListener("input", () => {
    const typed = $("calCustomHex").value.trim();
    const hex = typed.startsWith("#") ? typed : `#${typed}`;
    if (isCalColor(hex)) chooseCalColor(hex, "hex");
    else $("calCustomHex").setAttribute("aria-invalid", String(typed.length > 0));
});

function calendarIdFor(name) {
    const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "calendar";
    let id = /^[a-z0-9]/.test(base) ? base : `c-${base}`;
    for (let n = 2; calState.calendars.some(c => c.id === id); n++) id = `${base}-${n}`;
    return id;
}

async function saveCalendar(event) {
    event.preventDefault();
    const name = $("calCalendarName").value.trim();
    const color = isCalColor(calChosenColor) ? calChosenColor : CAL_COLORS[0];
    if (calState.editingCalendar === COUNTDOWN_CALENDAR || calState.editingCalendar === HOLIDAY_CALENDAR) {
        if (isCalColor(color)) calPrefs[calState.editingCalendar === HOLIDAY_CALENDAR ? "holidayColor" : "countdownColor"] = color;
        saveCalPrefs();
        closeCalDialogs();
        renderCalendar();
        return;
    }
    if (!name || name.length > 60) {
        showCalError("calCalendarError", "Give the calendar a name (up to 60 characters).");
        return;
    }
    const editing = calState.editingCalendar;
    try {
        const reply = editing
            ? await calRequest("updateCalendar", editing.id, "", "", `${name}\n${color}`)
            : await calRequest("createCalendar", calendarIdFor(name), "", "", `${name}\n${color}`);
        if (reply.status >= 300) throw new Error(`The calendar wasn't saved (${reply.status}).`);
        closeCalDialogs();
    } catch (error) {
        showCalError("calCalendarError", error.message);
        return;
    }
    refreshCalendar();
}

async function deleteCalendar() {
    const calendar = calState.editingCalendar;
    if (!calendar) return;
    const count = [...calState.resources.values()].filter(r => r.calendar === calendar.id).length;
    const confirmed = await confirmDialog({
        title: `Delete ${calendar.name}?`,
        message: count ? `The calendar and its ${count} event${count === 1 ? "" : "s"} will be deleted. This can't be undone.` : "The calendar will be deleted.",
        confirmLabel: "Delete calendar", danger: true
    });
    if (!confirmed) return;
    try {
        const reply = await calRequest("deleteCalendar", calendar.id);
        if (reply.status >= 300 && reply.status !== 404) throw new Error(`The calendar wasn't deleted (${reply.status}).`);
        calPrefs.hidden.delete(calendar.id);
        saveCalPrefs();
        closeCalDialogs();
    } catch (error) {
        showCalError("calCalendarError", error.message);
        return;
    }
    refreshCalendar();
}

// ---- controls

$("calToday").addEventListener("click", () => { calState.cursor = startOfDay(Date.now()); calState.scrollToNow = true; renderCalendar(); });
$("calPrev").addEventListener("click", () => stepCalendar(-1));
$("calNext").addEventListener("click", () => stepCalendar(1));
document.querySelectorAll("[data-cal-mode]").forEach(b => b.addEventListener("click", () => setCalMode(b.dataset.calMode)));
$("calNewEvent").addEventListener("click", () => openEventEditor({ date: sameDay(calState.cursor, Date.now()) ? null : calState.cursor }));
$("calNewCalendar").addEventListener("click", () => openCalendarEditor(null));
$("calEventForm").addEventListener("submit", saveEvent);
$("calCalendarForm").addEventListener("submit", saveCalendar);
$("calDeleteEvent").addEventListener("click", deleteEvent);
$("calRejoinSeries").addEventListener("click", rejoinSeries);
$("calDeleteCalendar").addEventListener("click", deleteCalendar);
$("calManageCountdowns").addEventListener("click", () => { closeCalDialogs(); openCountdownEditor(); });
$("calEditCountdowns").addEventListener("click", openCountdownEditor);
$("calCountdownForm").addEventListener("submit", event => { event.preventDefault(); saveAlmanacPreferences(); });
["calRepeat", "calRepeatEnd", "calAllDay", "calStartDate"].forEach(id => $(id).addEventListener("change", updateRepeatControls));
// Moving the start (date or time) moves the end with it, keeping the
// duration, so a start set past the old end can't leave the event inverted.
// Changing the end sets a new duration.
["calStartDate", "calStartTime"].forEach(id => $(id).addEventListener("change", () => { keepEventDuration(); renderSlotPreview(); }));
["calEndDate", "calEndTime", "calAllDay"].forEach(id => $(id).addEventListener("change", () => { rememberEventDuration(); renderSlotPreview(); }));
["calStartDate", "calStartTime", "calEndDate", "calEndTime"].forEach(id => $(id).addEventListener("input", renderSlotPreview));
document.querySelectorAll("[data-cal-close]").forEach(b => b.addEventListener("click", closeCalDialogs));
["calEventDialog", "calCalendarDialog", "calCountdownDialog", "calImportDialog"].forEach(id => {
    $(id).addEventListener("click", event => { if (event.target === $(id)) closeCalDialogs(); });
    $(id).addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeCalDialogs(); } });
});
// The page's own clock: keep "today" and the now line current while open.
setInterval(() => { if ($("calendar").classList.contains("active") && $("calEventDialog").hidden) renderCalendar(); }, 5 * 60000);
// ---- the Command Center's Next up (2.0.0)
// What's left today and coming in the next two weeks, up to five.
function nextUpWhen(occ, now, today) {
    const tomorrow = addDays(today, 1);
    // From a week out, a weekday alone could mean either week.
    const day = sameDay(occ.start, today) ? "Today"
        : sameDay(occ.start, tomorrow) ? "Tomorrow"
        : occ.start >= addDays(today, 7) ? fmt(occ.start, { month: "short", day: "numeric" })
        : fmt(occ.start, { weekday: "short" });
    if (occ.allDay) return day;
    if (occ.start <= now) return `Now, until ${timeText(occ.end)}`;
    return `${day}, ${timeText(occ.start)}`;
}

function renderHomeToday() {
    const list = $("todayList");
    if (!list) return;
    if (calState.server.state !== "running" || !calState.loaded || !calState.calendars.length) {
        list.replaceChildren(element("li", "module-empty", "Waiting for the calendar."));
        return;
    }
    const now = Date.now();
    const today = startOfDay(now);
    const coming = visibleOccurrences(today, addDays(today, 15)).filter(o => o.end > now).slice(0, 5);
    if (!coming.length) {
        list.replaceChildren(element("li", "module-empty", "Nothing in the next two weeks."));
        return;
    }
    list.replaceChildren(...coming.map(occ => {
        const item = element("li");
        const button = element("button", "module-row");
        button.type = "button";
        button.style.setProperty("--cal-color", occ.calendar.color);
        button.title = "Open in Calendar";
        button.append(element("i", "module-row-dot"),
            element("span", "module-row-name", occ.event.summary || "(No title)"),
            element("small", "module-row-when", nextUpWhen(occ, now, today)));
        button.addEventListener("click", () => {
            if (occ.countdown) return openOccurrence(occ);
            calState.cursor = startOfDay(occ.start);
            setCalMode(calState.mode === "agenda" ? "agenda" : "day");
            navigate("calendar");
            openEventEditor({ occurrence: occ });
        });
        item.append(button);
        return item;
    }));
}
$("todayOpen").addEventListener("click", () => { calState.cursor = startOfDay(Date.now()); navigate("calendar"); });
setInterval(renderHomeToday, 60000);

// ---- quick add from the palette: "+Dentist tue 3pm #work"

function quickAddCalendar(tag) {
    if (!tag) return { calendar: calState.calendars.find(c => !calPrefs.hidden.has(c.id)) || calState.calendars[0], unknown: false };
    const match = calState.calendars.find(c => c.id === tag || c.name.toLowerCase() === tag)
        || calState.calendars.find(c => c.id.startsWith(tag) || c.name.toLowerCase().startsWith(tag));
    return match ? { calendar: match, unknown: false } : { calendar: calState.calendars[0], unknown: true };
}

function quickAddOption(text) {
    const base = { id: "event", badge: "EVENT" };
    if (calState.server.state !== "running" || !calState.calendars.length) {
        return { ...base, label: "The calendar isn't ready", description: calState.server.message || "The calendar server is starting or isn't installed.", disabled: true };
    }
    const parsed = Cal.parseQuickAdd(text);
    if (!parsed) {
        return { ...base, label: "Type the event: what, then when", description: "Like: Dentist tue 3pm · PSO raid fri 8-11pm #gaming · Trip nov 12 · Call Sam tomorrow at 3 for 30m", disabled: true };
    }
    const { calendar, unknown } = quickAddCalendar(parsed.calendar);
    const when = parsed.allDay
        ? `${fmt(parsed.start, { weekday: "short", month: "short", day: "numeric" })}, all day`
        : `${fmt(parsed.start, { weekday: "short", month: "short", day: "numeric" })}, ${timeText(parsed.start)} – ${timeText(parsed.end)}${sameDay(parsed.start, parsed.end) ? "" : " (next day)"}`;
    return {
        ...base,
        label: `Add “${parsed.summary}”`,
        description: `${when} · ${calendar.name}${unknown ? ` (no calendar called #${parsed.calendar})` : ""} · Enter adds it`,
        run: async () => {
            try {
                await putNew(calendar.id, { summary: parsed.summary, location: "", description: "", start: parsed.start, end: parsed.end, allDay: parsed.allDay, rrule: null, exdates: [], reminder: parsed.allDay ? null : 15 });
                showNotice(`Added “${parsed.summary}” to ${calendar.name}: ${when}.`);
                refreshCalendar();
            } catch (error) {
                showNotice(`The event wasn't added: ${error.message}`);
            }
        }
    };
}

// ---- pin an event as a countdown (the almanac's countdowns)

function pinAsCountdown() {
    const occ = calState.editing?.occurrence;
    if (!occ) return;
    const settings = typeof almanacState === "object" ? almanacState.settings : null;
    if (!settings) {
        send("GetAlmanac");
        showNotice("The countdowns are still loading; try again in a moment.");
        return;
    }
    const yearly = occ.resource.parsed.master.rrule?.freq === "YEARLY";
    const t = new Date(occ.start);
    const pad2 = n => String(n).padStart(2, "0");
    const date = yearly ? `${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}` : `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
    const name = (occ.event.summary || "Event").replace(/[|\r\n\t]+/g, " ").trim().slice(0, 60);
    const existing = settings.countdowns || [];
    if (existing.some(c => c.date === date && c.name === name)) {
        showNotice(`“${name}” is already a countdown.`);
        return;
    }
    if (existing.length >= 12) {
        showNotice("There are already 12 countdowns; remove one under Countdowns first.");
        return;
    }
    const lines = [settings.wikipedia ? "1" : "0", ...existing.map(c => `${c.date}|${c.name}`), `${date}|${name}`];
    if (send("SaveAlmanac", lines.join("\n"))) showNotice(`“${name}” pinned as a countdown${yearly ? ", every year" : ""}.`);
}

// ---- .ics import and export (ASCS shows Windows' file dialogs)

function exportCalendar() {
    const calendar = calState.editingCalendar;
    if (!calendar) return;
    const texts = [...calState.resources.values()].filter(r => r.calendar === calendar.id).map(r => r.text);
    send("ExportCalendarFile", `${calendar.name}\n${Cal.joinIcs(texts, calendar.name)}`);
}

let pendingImport = null;

function handleIcsFile(fileName, text) {
    const parts = Cal.splitIcs(text);
    if (!parts.length) {
        showNotice(`${fileName} has no events to import.`);
        return;
    }
    pendingImport = { fileName, parts };
    $("calImportSummary").textContent = `${parts.length} event${parts.length === 1 ? "" : "s"} in ${fileName}.`;
    const select = $("calImportTarget");
    select.replaceChildren(...calState.calendars.map(c => { const o = element("option", "", c.name); o.value = c.id; return o; }));
    select.value = calState.calendars.find(c => !calPrefs.hidden.has(c.id))?.id || calState.calendars[0]?.id || "";
    $("calImportError").hidden = true;
    $("calImportGo").disabled = false;
    $("calImportGo").textContent = "Import";
    $("calImportDialog").hidden = false;
    requestAnimationFrame(() => select.focus());
}

async function runImport(event) {
    event.preventDefault();
    if (!pendingImport) return;
    const calendar = calendarOf($("calImportTarget").value);
    if (!calendar) return;
    const button = $("calImportGo");
    button.disabled = true;
    let added = 0, already = 0, failed = 0;
    for (const [index, part] of pendingImport.parts.entries()) {
        button.textContent = `Importing ${index + 1} of ${pendingImport.parts.length}…`;
        const name = Cal.resourceNameFor(part.uid);      // the same event always gets the same name
        try {
            const reply = await calRequest("putEvent", calendar.id, name, "", part.text);
            if (reply.status === 412) already++;
            else if (reply.status >= 300) failed++;
            else added++;
        } catch {
            failed++;
        }
    }
    const summary = `Imported ${added} event${added === 1 ? "" : "s"} into ${calendar.name}` + (already ? `; ${already} already there` : "") + (failed ? `; ${failed} couldn't be added` : "") + ".";
    pendingImport = null;
    closeCalDialogs();
    showNotice(summary);
    refreshCalendar();
}

$("calPinCountdown").addEventListener("click", pinAsCountdown);
$("calExportCalendar").addEventListener("click", exportCalendar);
$("calImport").addEventListener("click", () => send("ImportCalendarFile"));
$("calImportForm").addEventListener("submit", runImport);

send("GetCalendarState");
$("calCalendar").addEventListener("change", renderSlotPreview);
