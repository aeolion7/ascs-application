"use strict";

// The System page (2.0.0): Live, Hardware, Startup, and Activity and Logs.

const systemSections = MaestroSections.create($("systemTabs"), {
    onChange() {
        syncSystemView();
        window.scrollTo(0, 0);
    }
});

function systemShowing(section) {
    return $("dashboard").classList.contains("active") && systemSections.current() === section;
}

// Readings come every second while Live shows, and logs are read only while they
// show. An open drive form closes with its section.
function syncSystemView() {
    const looking = !document.hidden && !windowIsHidden && !windowIsMinimized;
    $("historyScale").hidden = systemSections.current() !== "live";
    if (systemShowing("live") && looking) startLiveReadings();
    else stopLiveReadings();
    if (systemShowing("activity") && !document.hidden) startLogPolling();
    else stopLogPolling();
    if (!systemShowing("live")) closeDriveForm();
}

// From the palette or the attention list.
function showLogs() {
    navigate("dashboard");
    systemSections.show("activity");
    requestAnimationFrame(() => $("logSearch").focus());
}

// ---- Live: processor and memory over 5 minutes, an hour or a day (2.0.0)

// AHK samples every second and keeps three scales; the page shows one. A 10 s
// or minute point is [average cpu, average ram, peak cpu, peak ram].
const HISTORY_SCALES = {
    seconds: { step: 1, every: "every second" },
    tens: { step: 10, every: "every 10 seconds" },
    minutes: { step: 60, every: "every minute" }
};
const HISTORY_SCALE_KEY = "maestro.historyScale";
const LIVE_READING_MS = 1000;
const liveHistory = { cpu: [], ram: [], cpuPeak: [], ramPeak: [], times: [] };
let historyScale = (() => { try { return localStorage.getItem(HISTORY_SCALE_KEY); } catch { return null; } })();
if (!HISTORY_SCALES[historyScale]) historyScale = "tens";
let historySeries = [];
let historyTimes = [];      // each point's time, Unix seconds; empty from an older Maestro
let liveTimer = null;

function startLiveReadings() {
    if (liveTimer !== null) return;
    send("SetHistoryScale", historyScale);
    liveTimer = setInterval(() => send("GetMetrics"), LIVE_READING_MS);
}

function stopLiveReadings() {
    if (liveTimer !== null) clearInterval(liveTimer);
    liveTimer = null;
}

function setHistoryScale(scale) {
    if (!HISTORY_SCALES[scale]) return;
    historyScale = scale;
    try { localStorage.setItem(HISTORY_SCALE_KEY, scale); } catch { /* not kept */ }
    historySeries = [];
    historyTimes = [];
    document.querySelectorAll("#historyScale [data-scale]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.scale === scale)));
    renderHistory(null);
    send("SetHistoryScale", scale);
}

document.querySelectorAll("#historyScale [data-scale]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.scale === historyScale));
    button.addEventListener("click", () => setHistoryScale(button.dataset.scale));
});

// "40 s", "12 min", "3 h 5 min".
function historySpan(seconds) {
    if (seconds < 60) return `${seconds} s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

// A new series arrives only when it has a new point (null otherwise), so the one
// on screen is kept between. The newest point is the current reading, so the
// line's end moves every second.
function renderHistory(history, current = {}) {
    if (!globalThis.ASCSCharts) return;
    if (Array.isArray(history) && (current.historyScale === undefined || current.historyScale === historyScale)) {
        historySeries = history;
        historyTimes = Array.isArray(current.historyTimes) && current.historyTimes.length === history.length ? current.historyTimes.map(Number) : [];
    }
    const { step, every } = HISTORY_SCALES[historyScale];
    const nowSeconds = Date.now() / 1000;
    const times = historyTimes.length === historySeries.length ? [...historyTimes] : [];
    if (times.length && Number.isFinite(current.cpu)) times.push(nowSeconds);
    liveHistory.times = times;
    [["cpu", 0], ["ram", 1]].forEach(([name, index]) => {
        const values = historySeries.map(point => (Array.isArray(point) ? point[index] : null));
        const peaks = historySeries.map(point => (Array.isArray(point) ? point[point.length >= 4 ? index + 2 : index] : null));
        if (Number.isFinite(current[name])) {
            values.push(current[name]);
            peaks.push(current[name]);
        }
        const graph = ASCSCharts.sparkline(values, 300, 100, 0);
        const plot = $(`${name}Chart`);
        plot.querySelector(".chart-area").setAttribute("d", graph.area);
        plot.querySelector(".chart-line").setAttribute("d", graph.line);
        liveHistory[name] = graph.values;
        liveHistory[`${name}Peak`] = peaks;
        const peak = Math.max(...peaks.filter(Number.isFinite), 0);
        const span = historySpan(Math.max(1, graph.count - 1) * step);
        $(`${name}History`).textContent = graph.count >= 2
            ? `Average ${graph.average}%, peak ${Math.round(peak)}%, last ${span}`
            : `History builds ${every}`;
        $(`${name}Since`).textContent = graph.count < 2 ? ""
            : times.length === graph.count ? `${clockTime(times[0])} · ${secondsAgoLabel(Math.round(nowSeconds - times[0]))}`
            : `${span} ago`;
    });
}

function secondsAgoLabel(seconds) {
    return seconds <= 0 ? "now" : `${historySpan(seconds)} ago`;
}

// "2:32:05 PM", from Unix seconds.
function clockTime(seconds) {
    return new Date(seconds * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

// A point's time on the clock and how long ago, or only how long ago when the
// points came without times.
function pointTimeLabel(index, count) {
    const time = liveHistory.times[index];
    if (liveHistory.times.length !== count || !Number.isFinite(time)) return secondsAgoLabel((count - 1 - index) * HISTORY_SCALES[historyScale].step);
    const ago = Math.round(Date.now() / 1000 - time);
    return index === count - 1 ? `${clockTime(time)} · now` : `${clockTime(time)} · ${secondsAgoLabel(ago)}`;
}

// Places a card inside a plot, centered on a point across it where there's room.
function placeChartTip(plot, tip, x) {
    const width = plot.getBoundingClientRect().width;
    const middle = width * x / 100;
    tip.style.left = `${Math.max(0, Math.min(width - tip.offsetWidth, middle - tip.offsetWidth / 2))}px`;
}

["cpu", "ram"].forEach(name => {
    const plot = $(`${name}Chart`);
    const tip = plot.querySelector(".chart-tip");
    const rule = plot.querySelector(".chart-rule");
    plot.addEventListener("pointermove", event => {
        const values = liveHistory[name];
        if (values.length < 2) return;
        const box = plot.getBoundingClientRect();
        const share = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
        const index = Math.round(share * (values.length - 1));
        const x = index / (values.length - 1) * 100;
        const peak = liveHistory[`${name}Peak`][index];
        const average = Math.round(values[index]);
        tip.replaceChildren(element("strong", "", `${average}%`),
            ...(Number.isFinite(peak) && Math.round(peak) > average ? [element("span", "chart-tip-peak", `peak ${Math.round(peak)}%`)] : []),
            element("span", "", pointTimeLabel(index, values.length)));
        tip.hidden = false;
        rule.hidden = false;
        rule.style.left = `${x}%`;
        placeChartTip(plot, tip, x);
    });
    plot.addEventListener("pointerleave", () => {
        tip.hidden = true;
        rule.hidden = true;
    });
});

// ---- Drives

let lastDriveSignature = null;

// Drives are checked every 30 seconds, so most readings have nothing new for them.
function renderDrives(drives) {
    if (!Array.isArray(drives)) return;
    const signature = JSON.stringify(drives);
    if (signature === lastDriveSignature) return;
    lastDriveSignature = signature;
    renderHomeDrives(drives);
    drawDriveRows($("dashboardDrives"), drives);
}

let drivesSaving = false;

function setDriveStatus(text) {
    $("driveStatus").textContent = text;
}

function openDriveForm() {
    if (!settingsLoaded) send("GetSettings");
    setDriveStatus("");
    $("driveForm").hidden = false;
    $("chooseDrives").setAttribute("aria-expanded", "true");
    $("driveLetters").focus();
    $("driveLetters").select();
}

// Whatever wasn't saved goes back, so it can't be saved later from Preferences.
function closeDriveForm({ refocus = false } = {}) {
    if ($("driveForm").hidden) return;
    $("driveForm").hidden = true;
    $("driveLetters").value = savedDriveLetters;
    $("chooseDrives").setAttribute("aria-expanded", "false");
    if (refocus) $("chooseDrives").focus();
}

function drivesSaved() {
    if (!drivesSaving) return;
    drivesSaving = false;
    closeDriveForm({ refocus: systemShowing("live") });
    send("GetMetrics", "dashboard");
}

function drivesSaveFailed(message) {
    if (!drivesSaving) return;
    drivesSaving = false;
    setDriveStatus(typeof message === "string" && message ? message : "The drives couldn't be saved.");
}

$("chooseDrives").addEventListener("click", () => {
    if ($("driveForm").hidden) openDriveForm();
    else closeDriveForm({ refocus: true });
});
$("driveCancel").addEventListener("click", () => closeDriveForm({ refocus: true }));
$("driveForm").addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    closeDriveForm({ refocus: true });
});
$("driveForm").addEventListener("submit", event => {
    event.preventDefault();
    if (!settingsLoaded) {
        setDriveStatus("Still loading. Try again in a moment.");
        return;
    }
    drivesSaving = true;
    setDriveStatus("Saving…");
    if (!send("SaveSettings", settingsPayload())) {
        drivesSaving = false;
        setDriveStatus("Unable to contact Maestro.");
    }
});

// ---- Hardware

function updateHardware(hardware) {
    if (!hardware || typeof hardware !== "object") return;
    const signature = JSON.stringify(hardware);
    if (signature === lastHardwareSignature) return;
    lastHardwareSignature = signature;

    const seen = MaestroHardware.describe(hardware);
    if (!seen) {
        $("hardwareStatus").className = "system-note";
        $("hardwareStatus").textContent = "Windows didn't report the hardware details. The log may say why.";
        return;
    }
    $("systemHardware").replaceChildren(
        ...seen.tiles.map(hardwareTile),
        hardwareDrives(seen.drives),
        ...seen.devices.map(hardwareDevice),
        ...seen.details.map(hardwareDetail)
    );
}

function hardwareFacts(facts) {
    const list = element("dl", "hardware-facts");
    facts.forEach(([label, value]) => {
        const row = element("div", "hardware-fact");
        row.append(element("dt", "", label), element("dd", "", value));
        list.append(row);
    });
    return list;
}

function hardwareModule(title, className) {
    const section = element("section", `module ${className}`);
    const head = element("div", "module-head");
    head.append(element("h2", "", title));
    section.append(head);
    return section;
}

function hardwareTile(tile) {
    const section = hardwareModule(tile.title, "hardware-tile");
    section.append(element("strong", "hardware-lead", tile.lead));
    if (tile.name) section.append(element("p", "hardware-name", tile.name));
    tile.groups.forEach(group => {
        if (group.title) section.append(element("h3", "hardware-group", group.title));
        section.append(hardwareFacts(group.facts));
    });
    return section;
}

function hardwareDevice(device) {
    const section = hardwareModule(device.title, "hardware-device");
    device.groups.forEach(group => {
        section.append(element("h3", "hardware-group", group.title), hardwareFacts(group.facts));
    });
    return section;
}

function hardwareDetail(detail) {
    const section = hardwareModule(detail.title, "hardware-detail");
    section.append(hardwareFacts(detail.facts));
    return section;
}

function hardwareDrives(drives) {
    const section = hardwareModule("Drives", "hardware-drives");
    if (!drives.length) {
        section.append(element("p", "system-note", "Windows didn't report any drives."));
        return section;
    }
    const list = element("div", "hardware-drive-list");
    drives.forEach(drive => list.append(hardwareDrive(drive)));
    section.append(list);
    return section;
}

function hardwareDrive(drive) {
    const card = element("article", "hardware-drive");
    const head = element("div", "hardware-drive-head");
    head.append(element("h3", "", drive.model), element("span", "", drive.capacity));
    card.append(head);
    if (!drive.partitions.length) {
        card.append(hardwareFacts(drive.facts));
        return card;
    }

    // The bar is a picture of the list below it, which carries the same details.
    const bar = element("div", "hardware-bar");
    bar.setAttribute("aria-hidden", "true");
    const legend = element("ul", "hardware-legend");
    drive.partitions.forEach(partition => {
        const tone = partition.mounted ? "is-mounted" : "is-system";
        const segment = element("span", tone, partition.mounted ? partition.name : "");
        segment.style.flexGrow = String(partition.share);
        bar.append(segment);
        const row = element("li", "");
        row.append(element("span", `hardware-swatch ${tone}`), element("strong", "", partition.name), element("small", "", partition.detail));
        legend.append(row);
    });
    card.append(bar, legend, hardwareFacts(drive.facts));
    return card;
}

// ---- Startup: the last 20 sign-ins, oldest on the left. The pointer anywhere over the
// graph picks the nearest point and shows its card; on the keyboard, Tab reaches
// the latest and the arrows move. The table says the same without either.

const signInState = { rows: [], points: [], middle: 0 };
const signInSeconds = ms => `${(ms / 1000).toFixed(1)} s`;

function signInWhen(item) {
    const date = new Date(item.time);
    return Number.isNaN(date.getTime()) ? item.time : date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const SIGN_IN_STAGES = [["Windows taskbar", "taskbar"], ["RetroBar ready", "retrobar"], ["Apps started", "apps"], ["Keychron started", "keychron"], ["Finished", "finished"]];
const stageTime = ms => (Number.isFinite(ms) && ms >= 0 ? signInSeconds(ms) : "–");

function renderSignInHistory(items) {
    const rows = (Array.isArray(items) ? items : []).filter(item => item && typeof item.time === "string" && Number.isFinite(item.finished) && item.finished >= 0).slice(0, 20).reverse();
    $("signInContent").hidden = !rows.length;
    $("signInEmpty").hidden = rows.length > 0;
    $("signInNote").className = "system-note";
    $("signInNote").textContent = "No startups recorded yet.";
    if (!rows.length) return;
    const graph = ASCSCharts.pointGraph(rows.map(item => item.finished), 300, 100);
    const plot = $("signInPlot");
    plot.querySelector(".chart-area").setAttribute("d", graph.area);
    plot.querySelector(".chart-line").setAttribute("d", graph.line);
    plot.querySelector(".chart-grid span:nth-child(1)").dataset.label = signInSeconds(graph.top);
    plot.querySelector(".chart-grid span:nth-child(2)").dataset.label = signInSeconds(graph.top / 2);
    const sorted = rows.map(item => item.finished).sort((a, b) => a - b);
    signInState.rows = rows;
    signInState.points = graph.points;
    signInState.middle = sorted[Math.floor(sorted.length / 2)];
    $("signInLatest").textContent = signInSeconds(rows[rows.length - 1].finished);
    $("signInMiddleName").textContent = `Middle of the last ${rows.length}`;
    $("signInMiddle").textContent = signInSeconds(signInState.middle);
    $("signInFastest").textContent = signInSeconds(sorted[0]);
    $("signInSlowest").textContent = signInSeconds(sorted[sorted.length - 1]);
    $("signInFirst").textContent = signInWhen(rows[0]);
    $("signInLast").textContent = rows.length > 1 ? signInWhen(rows[rows.length - 1]) : "";
    hideSignInTip();
    $("signInPoints").replaceChildren(...rows.map((item, index) => {
        const last = index === rows.length - 1;
        const point = element("span", `signin-point${last ? " is-latest" : ""}`);
        point.style.left = `${graph.points[index].x}%`;
        point.style.top = `${graph.points[index].y}%`;
        point.tabIndex = last ? 0 : -1;
        point.setAttribute("role", "img");
        point.setAttribute("aria-label", `${signInWhen(item)}: ${signInSeconds(item.finished)}`);
        point.addEventListener("focus", () => showSignInTip(index));
        point.addEventListener("blur", hideSignInTip);
        point.addEventListener("keydown", event => {
            if (event.key === "Escape") return hideSignInTip();
            const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
            const next = point.parentElement.children[index + step];
            if (!step || !next) return;
            event.preventDefault();
            point.tabIndex = -1;
            next.tabIndex = 0;
            next.focus();
        });
        return point;
    }));
    $("signInRows").replaceChildren(...[...rows].reverse().map(item => {
        const row = element("tr");
        row.append(element("td", "", signInWhen(item)));
        SIGN_IN_STAGES.forEach(([, key]) => row.append(element("td", key === "finished" ? "is-number is-finished" : "is-number", stageTime(item[key]))));
        row.append(element("td", "is-sound", typeof item.sound === "string" ? item.sound : ""));
        return row;
    }));
}

function showSignInTip(index) {
    const item = signInState.rows[index];
    if (!item) return;
    const tip = $("signInTip");
    const rule = $("signInRule");
    const { x, y } = signInState.points[index];
    const head = element("div", "signin-tip-head");
    const difference = item.finished - signInState.middle;
    head.append(element("strong", "", signInSeconds(item.finished)), element("small", "", Math.abs(difference) < 50
        ? "About the usual" : `${signInSeconds(Math.abs(difference))} ${difference > 0 ? "over" : "under"} the middle`));
    const stages = element("dl", "signin-tip-stages");
    SIGN_IN_STAGES
        .filter(([, key]) => key !== "finished" && Number.isFinite(item[key]) && item[key] >= 0)
        .forEach(([label, key]) => stages.append(element("dt", "", label), element("dd", "", signInSeconds(item[key]))));
    tip.replaceChildren(element("span", "signin-tip-when", signInWhen(item)), head, stages);
    if (typeof item.sound === "string" && item.sound) tip.append(element("span", "signin-tip-sound", `Sound: ${item.sound}`));
    tip.hidden = false;
    rule.hidden = false;
    rule.style.left = `${x}%`;
    // Beside the point, kept inside the graph; above it, unless there's no room.
    const plot = $("signInPlot");
    placeChartTip(plot, tip, x);
    const height = plot.getBoundingClientRect().height;
    const above = height * y / 100 - tip.offsetHeight - 14 >= 0;
    tip.style.top = above ? `${height * y / 100 - tip.offsetHeight - 14}px` : `${height * y / 100 + 14}px`;
    document.querySelectorAll("#signInPoints .signin-point").forEach((point, i) => point.classList.toggle("is-active", i === index));
}

function hideSignInTip() {
    $("signInTip").hidden = true;
    $("signInRule").hidden = true;
    document.querySelectorAll("#signInPoints .is-active").forEach(point => point.classList.remove("is-active"));
}

$("signInPlot").addEventListener("pointermove", event => {
    if (!signInState.points.length) return;
    const box = event.currentTarget.getBoundingClientRect();
    showSignInTip(ASCSCharts.nearestPoint(signInState.points, (event.clientX - box.left) / box.width * 100));
});
$("signInPlot").addEventListener("pointerleave", hideSignInTip);

// ---- Recent activity

function renderActivity() {
    const list = $("activityList");
    if (!list) return;
    list.replaceChildren();
    const items = activityItems.slice().reverse();
    $("activityEmpty").hidden = items.length > 0;
    items.forEach(item => {
        const entry = document.createElement("li");
        entry.className = "activity-item";
        entry.dataset.kind = item.kind;
        const dot = document.createElement("span");
        dot.className = "activity-dot";
        dot.setAttribute("aria-hidden", "true");
        const copy = document.createElement("span");
        copy.className = "activity-copy";
        const kind = document.createElement("small");
        kind.textContent = activityLabels[item.kind] || item.kind;
        const text = document.createElement("span");
        text.textContent = item.text;
        copy.append(kind, text);
        const time = document.createElement("time");
        time.dateTime = item.time;
        time.textContent = relativeTime(item.time);
        time.title = new Date(item.time).toLocaleString();
        entry.append(dot, copy, time);
        list.append(entry);
    });
}

// ---- Logs: read-only tails of three fixed files
// Read-only tails of three fixed log files. ASCS sends the text as a plain
// string; ASCSLogs parses it, and lines are rendered as text. While the section
// shows it asks for a refresh every 3 seconds, which ASCS answers only
// when the file has changed.

const Logs = globalThis.ASCSLogs;
const LOG_SOURCE_KEY = "ascs.logs.source";
const LOG_RENDER_LIMIT = 600;
const logState = { source: "ascs", level: "all", query: "", entries: [], missing: false, timer: null, loaded: false };

function requestLog(refresh = false) {
    send("GetLog", refresh ? `${logState.source}|refresh` : logState.source);
}

function renderLogs() {
    const list = $("logList");
    const all = logState.entries;
    const total = Logs.counts(all);
    document.querySelector('[data-count="all"]').textContent = all.length;
    document.querySelector('[data-count="issues"]').textContent = total.warn + total.error;
    document.querySelector('[data-count="errors"]').textContent = total.error;

    const visible = Logs.filterEntries(all, logState.level, logState.query);
    const shown = visible.slice(-LOG_RENDER_LIMIT);
    list.dataset.kinds = String(all.some(entry => entry.kind));
    list.replaceChildren();
    Logs.groupByDay(shown).forEach(group => {
        const day = document.createElement("section");
        day.className = "log-day";
        const heading = document.createElement("h3");
        heading.textContent = Logs.dayLabel(group.day);
        const lines = document.createElement("ol");
        group.entries.forEach(entry => {
            const line = document.createElement("li");
            line.className = "log-line";
            line.dataset.level = entry.level;
            const time = document.createElement("time");
            time.textContent = entry.clock;
            const kind = document.createElement("span");
            kind.className = "log-kind";
            kind.textContent = entry.kind;
            const text = document.createElement("span");
            text.className = "log-text";
            text.textContent = entry.text;
            line.append(time, kind, text);
            lines.append(line);
        });
        day.append(heading, lines);
        list.append(day);
    });

    let meta;
    if (logState.missing) meta = "This log doesn't exist yet; it appears after its first entry.";
    else if (!logState.loaded) meta = "";
    else if (!all.length) meta = "This log is empty.";
    else if (!visible.length) meta = "No lines match.";
    else meta = `Showing ${shown.length.toLocaleString()} of ${all.length.toLocaleString()} lines${visible.length > shown.length ? ` (the newest ${LOG_RENDER_LIMIT})` : ""} · refreshes while open`;
    $("logMeta").textContent = meta;
}

function handleLogMessage(source, status, text) {
    if (source !== logState.source || !Logs) return;
    logState.loaded = true;
    logState.missing = status === "missing";
    logState.entries = Logs.parseLog(source, text);
    renderLogs();
}

function selectLogSource(source) {
    if (!["ascs", "activity", "codebutton"].includes(source)) source = "ascs";
    logState.source = source;
    logState.entries = [];
    logState.loaded = false;
    logState.missing = false;
    document.querySelectorAll("[data-log-source]").forEach(button =>
        button.setAttribute("aria-pressed", String(button.dataset.logSource === source)));
    try { localStorage.setItem(LOG_SOURCE_KEY, source); } catch { /* storage unavailable */ }
    renderLogs();
    requestLog();
}

function startLogPolling() {
    stopLogPolling();
    requestLog();
    logState.timer = setInterval(() => {
        if (systemShowing("activity") && !document.hidden) requestLog(true);
        else stopLogPolling();
    }, 3000);
}

function stopLogPolling() {
    if (logState.timer !== null) clearInterval(logState.timer);
    logState.timer = null;
}

document.querySelectorAll("[data-log-source]").forEach(button =>
    button.addEventListener("click", () => selectLogSource(button.dataset.logSource)));
document.querySelectorAll("[data-log-level]").forEach(button =>
    button.addEventListener("click", () => {
        logState.level = button.dataset.logLevel;
        document.querySelectorAll("[data-log-level]").forEach(other =>
            other.setAttribute("aria-pressed", String(other === button)));
        renderLogs();
    }));
$("logSearch").addEventListener("input", () => {
    logState.query = $("logSearch").value;
    renderLogs();
});
$("logSearch").addEventListener("keydown", event => {
    if (event.key === "Escape" && $("logSearch").value) {
        event.stopPropagation();
        $("logSearch").value = "";
        logState.query = "";
        renderLogs();
    }
});
$("copyLogButton").addEventListener("click", async () => {
    const visible = Logs.filterEntries(logState.entries, logState.level, logState.query);
    const text = visible.map(entry => [entry.day, entry.clock, entry.kind, entry.text].filter(Boolean).join(" ")).join("\n");
    try {
        await navigator.clipboard.writeText(text);
        showNotice(`Copied ${visible.length.toLocaleString()} lines.`);
    } catch {
        showNotice("The lines could not be copied.");
    }
});
$("openLogButton").addEventListener("click", () => send("OpenLogFile", logState.source));

try { logState.source = localStorage.getItem(LOG_SOURCE_KEY) || "ascs"; } catch { /* storage unavailable */ }
document.querySelectorAll("[data-log-source]").forEach(button =>
    button.setAttribute("aria-pressed", String(button.dataset.logSource === logState.source)));
