"use strict";

const $ = id => document.getElementById(id);
const validViews = new Set(["home", "notes", "dashboard", "commands"]);
const viewLabels = {
    home: "COMMAND CENTER",
    notes: "QUICK NOTES",
    dashboard: "SYSTEM DASHBOARD",
    commands: "F24 COMMANDS"
};

let saveTimer = null;
let pendingSaveData = [];
let toastTimer = null;
let notesData = { version: 2, activeId: null, notes: [] };
let notesLoaded = false;

function send(type, content = "") {
    const webview = window.chrome?.webview;

    if (!webview) {
        showToast("WebView2 communication unavailable.");
        return false;
    }

    webview.postMessage(`${type}\n${content}`);
    return true;
}

function showToast(message) {
    const toast = $("toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function setSaveStatus(label, state) {
    const status = $("saveStatus");
    if (!status) return;

    status.lastChild.textContent = ` ${label}`;
    status.dataset.state = state;
}

function focusPrimaryInput(view) {
    const input = document.querySelector(`#${view} [data-primary-input]`);
    if (!input) return;

    input.focus();
    if (input === $("noteText")) {
        input.setSelectionRange(input.value.length, input.value.length);
    }
}

function navigate(view) {
    if (!validViews.has(view)) return;

    document.querySelectorAll(".view").forEach(element => {
        element.classList.toggle("active", element.id === view);
        element.setAttribute("aria-hidden", String(element.id !== view));
    });

    document.querySelectorAll(".nav").forEach(button => {
        const isCurrent = button.dataset.view === view;
        button.classList.toggle("active", isCurrent);

        if (isCurrent) {
            button.setAttribute("aria-current", "page");
        } else {
            button.removeAttribute("aria-current");
        }
    });

    $("breadcrumb").textContent = viewLabels[view];

    if (view === "notes" && !notesLoaded) send("GetNotes");
    if (view === "dashboard" || view === "home") send("GetMetrics");

    requestAnimationFrame(() => {
        if ($(view)?.classList.contains("active")) {
            focusPrimaryInput(view);
        }
    });
}

document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => navigate(button.dataset.view));
});

document.querySelectorAll("[data-launch]").forEach(button => {
    button.addEventListener("click", () => send("Launch", button.dataset.launch));
});

document.querySelectorAll("[data-window-action]").forEach(button => {
    button.addEventListener("click", () => {
        send("WindowAction", button.dataset.windowAction);
    });
});

window.addEventListener("focus", () => {
    const activeView = document.querySelector(".view.active")?.id;
    if (activeView) requestAnimationFrame(() => focusPrimaryInput(activeView));
});

function serializeNotes() {
    return JSON.stringify(notesData);
}

function activeNote() {
    return notesData.notes.find(note => note.id === notesData.activeId) ?? null;
}

function noteLabel(note) {
    const title = note.title.trim();
    if (title) return title;
    const firstLine = note.content.split(/\r?\n/, 1)[0].trim();
    return firstLine || "Untitled note";
}

function renderNotesList() {
    const list = $("notesList");
    const filter = $("notesFilter").value.trim().toLocaleLowerCase();
    const notes = [...notesData.notes]
        .filter(note => `${note.title}\n${note.content}`.toLocaleLowerCase().includes(filter))
        .sort((left, right) => Number(right.pinned) - Number(left.pinned)
            || right.updated.localeCompare(left.updated));

    list.replaceChildren();
    $("notesEmpty").hidden = notes.length > 0;
    $("notesEmpty").textContent = notesData.notes.length
        ? "No notes match this filter."
        : "No notes yet. Create one to get started.";

    notes.forEach(note => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "note-list-item";
        item.setAttribute("role", "listitem");
        item.setAttribute("aria-current", String(note.id === notesData.activeId));

        const title = document.createElement("strong");
        title.textContent = `${note.pinned ? "◆ " : ""}${noteLabel(note)}`;
        const updated = document.createElement("small");
        updated.textContent = new Date(note.updated).toLocaleString([], {
            dateStyle: "medium",
            timeStyle: "short"
        });

        item.append(title, updated);
        item.addEventListener("click", () => {
            if (notesData.activeId === note.id) return;
            notesData.activeId = note.id;
            renderActiveNote();
            scheduleNoteSave(false);
        });
        list.append(item);
    });
}

function renderActiveNote() {
    const note = activeNote();
    $("noteTitle").value = note?.title ?? "";
    $("noteType").value = note?.type ?? "note";
    $("noteText").value = note?.content ?? "";
    $("noteKindLabel").textContent = note?.type === "snippet" ? "CODE SNIPPET" : "PERSONAL NOTE";
    $("noteText").classList.toggle("snippet-editor", note?.type === "snippet");
    $("pinNoteButton").setAttribute("aria-pressed", String(Boolean(note?.pinned)));
    $("pinNoteButton").textContent = note?.pinned ? "Unpin" : "Pin";
    $("copySnippetButton").hidden = note?.type !== "snippet";
    $("deleteNoteButton").disabled = !note;
    $("noteTitle").disabled = !note;
    $("noteType").disabled = !note;
    $("noteText").disabled = !note;
    $("pinNoteButton").disabled = !note;
    $("noteUpdated").textContent = note
        ? `Updated ${new Date(note.updated).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
        : "Changes save automatically";
    renderNotesList();
}

function scheduleNoteSave(touchNote = true) {
    const note = activeNote();
    if (note && touchNote) note.updated = new Date().toISOString();
    renderNotesList();
    $("noteUpdated").textContent = "Changes save automatically";
    setSaveStatus("SAVING...", "saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNotesNow, 400);
}

function saveNotesNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const data = serializeNotes();

    if (send("SaveNotes", data)) {
        pendingSaveData.push(data);
    } else {
        setSaveStatus("SAVE FAILED", "error");
    }
}

function flushPendingNotes() {
    if (saveTimer !== null) saveNotesNow();
}

function makeNote(content = "", title = "", type = "note") {
    return {
        id: `n_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`}`,
        title,
        type,
        content,
        pinned: false,
        created: new Date().toISOString(),
        updated: new Date().toISOString()
    };
}

function loadNotes(raw, recovered) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        showToast("Saved notes could not be parsed.");
        return;
    }

    if (parsed && typeof parsed.content === "string" && !Array.isArray(parsed.notes)) {
        const migrated = makeNote(parsed.content, "Scratch");
        notesData = { version: 2, activeId: migrated.id, notes: [migrated] };
        notesLoaded = true;
        renderActiveNote();
        scheduleNoteSave();
        if ($("notes").classList.contains("active")) {
            requestAnimationFrame(() => focusPrimaryInput("notes"));
        }
        showToast("Your legacy note was migrated.");
        return;
    }

    if (parsed?.version !== 2 || !Array.isArray(parsed.notes)) {
        showToast("Saved notes use an unsupported format.");
        return;
    }

    const validNotes = parsed.notes.every(note =>
        note && typeof note.id === "string"
        && typeof note.title === "string"
        && ["note", "snippet"].includes(note.type)
        && typeof note.content === "string"
        && typeof note.pinned === "boolean"
        && typeof note.created === "string"
        && typeof note.updated === "string");
    if (!validNotes) {
        showToast("Saved notes contain an invalid note entry.");
        return;
    }

    notesData = {
        version: 2,
        activeId: typeof parsed.activeId === "string" ? parsed.activeId : null,
        notes: parsed.notes
    };
    if (!notesData.notes.some(note => note.id === notesData.activeId)) {
        notesData.activeId = notesData.notes[0]?.id ?? null;
    }
    if (recovered) showToast("Notes were recovered from the backup file.");
    notesLoaded = true;
    renderActiveNote();
    if ($("notes").classList.contains("active")) {
        requestAnimationFrame(() => focusPrimaryInput("notes"));
    }
}

function handleNoteInput() {
    const note = activeNote();
    if (!note) return;
    note.title = $("noteTitle").value;
    note.content = $("noteText").value;
    scheduleNoteSave();
}

$("newNoteButton").addEventListener("click", () => {
    if (!notesLoaded) {
        send("GetNotes");
        return;
    }

    const note = makeNote();
    notesData.notes.push(note);
    notesData.activeId = note.id;
    notesLoaded = true;
    renderActiveNote();
    scheduleNoteSave();
    focusPrimaryInput("notes");
});

$("deleteNoteButton").addEventListener("click", () => {
    const note = activeNote();
    if (!note || !window.confirm(`Delete "${noteLabel(note)}"?`)) return;
    notesData.notes = notesData.notes.filter(item => item.id !== note.id);
    notesData.activeId = notesData.notes[0]?.id ?? null;
    renderActiveNote();
    scheduleNoteSave();
});

$("notesFilter").addEventListener("input", renderNotesList);
$("noteTitle").addEventListener("input", handleNoteInput);
$("noteText").addEventListener("input", handleNoteInput);
$("noteType").addEventListener("change", () => {
    const note = activeNote();
    if (!note) return;
    note.type = $("noteType").value;
    renderActiveNote();
    scheduleNoteSave();
});
$("pinNoteButton").addEventListener("click", () => {
    const note = activeNote();
    if (!note) return;
    note.pinned = !note.pinned;
    renderActiveNote();
    scheduleNoteSave();
});
$("copySnippetButton").addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText($("noteText").value);
        showToast("Snippet copied.");
    } catch (error) {
        showToast(`Unable to copy snippet: ${error.message}`);
    }
});

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingNotes();
});
window.addEventListener("blur", flushPendingNotes);

function handleWebMessage(event) {
    let data = event.data;
    if (typeof data === "string") {
        try {
            data = JSON.parse(data);
        } catch {
            return;
        }
    }
    if (!data || typeof data !== "object") return;

    switch (data.type) {
        case "navigate":
            navigate(data.view);
            break;
        case "notes":
            if (typeof data.data === "string") loadNotes(data.data, data.recovered === true);
            break;
        case "flushNotes":
            flushPendingNotes();
            break;
        case "saved": {
            const savedData = pendingSaveData.shift();
            if (pendingSaveData.length === 0 && savedData === serializeNotes()
                && saveTimer === null) {
                setSaveStatus("ALL CHANGES SAVED", "saved");
            } else {
                setSaveStatus("CHANGES PENDING", "saving");
            }
            break;
        }
        case "metrics":
            updateMetrics(data);
            break;
        case "error":
            if (data.scope === "notes") {
                pendingSaveData.shift();
                setSaveStatus("SAVE FAILED", "error");
            }
            showToast(typeof data.message === "string" ? data.message : "An error occurred.");
            break;
    }
}

window.chrome?.webview?.addEventListener("message", handleWebMessage);

function formatMetric(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${Math.round(number)}%` : "--%";
}

function setProgressBar(bar, value) {
    const number = Number(value);
    const amount = Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
    bar.style.width = `${amount}%`;
    const progress = bar.parentElement;
    if (progress?.getAttribute("role") === "progressbar") {
        progress.setAttribute("aria-valuenow", String(Math.round(amount)));
    }
}

function formatCapacity(used, total) {
    const usedValue = Number(used);
    const totalValue = Number(total);
    if (!Number.isFinite(usedValue) || !Number.isFinite(totalValue)) {
        return "Capacity unavailable";
    }
    return `${usedValue.toFixed(1)} / ${totalValue.toFixed(1)} GB`;
}

function createDriveCard(drive, dashboard) {
    const card = document.createElement("article");
    card.className = `metric-card${dashboard ? " dashboard-metric" : ""} drive-card`;
    const topline = document.createElement("div");
    topline.className = "metric-topline";
    const icon = document.createElement("span");
    icon.className = "metric-icon storage-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = '<svg viewBox="0 0 24 24"><rect x="4" y="4.5" width="16" height="15" rx="3"/><path d="M4.5 11h15M8 15.5h.01M11 15.5h.01"/></svg>';
    const label = document.createElement("span");
    label.className = "metric-label";
    label.textContent = "STORAGE";
    const letter = document.createElement("span");
    letter.className = "metric-state";
    letter.textContent = drive.letter;
    topline.append(icon, label, letter);

    const value = document.createElement("strong");
    value.className = "metric-value";
    const track = document.createElement("div");
    track.className = "metric-track";
    if (!dashboard) track.setAttribute("aria-hidden", "true");
    else {
        track.setAttribute("role", "progressbar");
        track.setAttribute("aria-label", `${drive.letter} drive storage utilization`);
        track.setAttribute("aria-valuemin", "0");
        track.setAttribute("aria-valuemax", "100");
        track.setAttribute("aria-valuenow", "0");
    }
    const bar = document.createElement("span");
    track.append(bar);
    const detail = document.createElement("small");
    detail.className = dashboard ? "metric-caption drive-detail" : "drive-detail";

    if (dashboard) {
        const measurement = document.createElement("div");
        measurement.className = "dashboard-value";
        const suffix = document.createElement("span");
        suffix.textContent = "in use";
        measurement.append(value, suffix);
        card.append(topline, measurement, track, detail);
    } else {
        card.append(topline, value, track, detail);
    }
    updateDriveCard(card, drive);
    return card;
}

function updateDriveCard(card, drive) {
    const online = drive.online === true;
    const value = card.querySelector(".metric-value");
    const detail = card.querySelector(".drive-detail");
    const bar = card.querySelector(".metric-track > span");
    if (!online) {
        value.textContent = "Offline";
        detail.textContent = "Drive unavailable";
        setProgressBar(bar, 0);
        return;
    }

    value.textContent = formatMetric(drive.usage);
    detail.textContent = formatCapacity(drive.used, drive.total);
    setProgressBar(bar, drive.usage);
}

function renderDrives(drives) {
    if (!Array.isArray(drives)) return;
    const home = $("homeDrives");
    const dashboard = $("dashboardDrives");
    home.replaceChildren();
    dashboard.replaceChildren();
    drives.forEach(drive => {
        home.append(createDriveCard(drive, false));
        dashboard.append(createDriveCard(drive, true));
    });
}

function updateMetrics(data) {
    [["cpu", data.cpu], ["ram", data.ram]].forEach(([name, value]) => {
        const display = $(name);
        if (display) display.textContent = formatMetric(value);
        const bar = $(`${name}Bar`);
        if (bar) setProgressBar(bar, value);
    });
    $("homeCpu").textContent = formatMetric(data.cpu);
    $("homeRam").textContent = formatMetric(data.ram);
    setProgressBar($("homeCpuBar"), data.cpu);
    setProgressBar($("homeRamBar"), data.ram);
    $("ramDetail").textContent = formatCapacity(data.ramUsed, data.ramTotal);
    $("homeRamDetail").textContent = formatCapacity(data.ramUsed, data.ramTotal);
    renderDrives(data.drives);
    $("metricsUpdated").textContent =
        `Last updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

send("Ready");
