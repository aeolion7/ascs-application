"use strict";

const $ = id => document.getElementById(id);
const validViews = new Set(["home", "notes", "dashboard", "commands", "settings"]);
const viewLabels = {
    home: "COMMAND CENTER",
    notes: "QUICK NOTES",
    dashboard: "SYSTEM DASHBOARD",
    commands: "Super COMMANDS",
    settings: "PREFERENCES"
};

let saveTimer = null;
let pendingSaveData = [];
let toastTimer = null;
let launcherCommands = [];
let launcherSelection = 0;
let launcherPreviousFocus = null;
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
    if (view === "settings") send("GetSettings");

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

const commandDefinitions = [
    { label: "Command Center", description: "Open the ASCS home view", keywords: "home overview", view: "home" },
    { label: "Quick Notes", description: "Open your notes and snippets", keywords: "notes scratchpad", view: "notes" },
    { label: "System Dashboard", description: "View live system metrics and hardware", keywords: "dashboard metrics hardware", view: "dashboard" },
    { label: "Shortcut Reference", description: "Browse the complete Super shortcut list", keywords: "commands shortcuts", view: "commands" },
    { label: "Preferences", description: "Configure drives, window snapping, and shortcuts", keywords: "settings options", view: "settings" },
    { label: "Everything", description: "Search files and folders as you type", keywords: "search files find", launch: "everything" },
    { label: "Vivaldi", description: "Focus Vivaldi here, switch to its desktop, or open it", keywords: "browser web internet virtual desktop", launch: "vivaldi" },
    { label: "Windows Terminal", description: "Open a terminal window", keywords: "console shell powershell", launch: "terminal" },
    { label: "File Explorer", description: "Browse files and folders", keywords: "explorer folders", launch: "explorer" },
    { label: "Calculator", description: "Open the Windows calculator", keywords: "math", launch: "calculator" },
    { label: "Task Manager", description: "Inspect running apps and processes", keywords: "performance processes", launch: "taskmanager" },
    { label: "Windows Settings", description: "Open Windows system settings", keywords: "configuration", launch: "settings" },
    { label: "Downloads", description: "Open your Downloads folder", keywords: "files", launch: "downloads" },
    { label: "Documents", description: "Open your Documents folder", keywords: "projects files", launch: "projects" },
    { label: "Snipping Tool", description: "Capture a screen region", keywords: "screenshot capture", launch: "snipping" },
    { label: "Lock workstation", description: "Lock your Windows session", keywords: "security", launch: "lock" },
    { label: "Toggle mute", description: "Mute or unmute system audio", keywords: "sound volume", launch: "mute" }
];

function filteredLauncherCommands() {
    const query = $("launcherSearch").value.trim().toLocaleLowerCase();
    return commandDefinitions.filter(command =>
        `${command.label} ${command.description} ${command.keywords}`
            .toLocaleLowerCase()
            .includes(query));
}

function renderLauncherResults() {
    const results = $("launcherResults");
    launcherCommands = filteredLauncherCommands();
    launcherSelection = Math.min(launcherSelection, Math.max(launcherCommands.length - 1, 0));
    results.replaceChildren();

    if (!launcherCommands.length) {
        const empty = document.createElement("p");
        empty.className = "launcher-empty";
        empty.textContent = "No matching commands.";
        results.append(empty);
        return;
    }

    launcherCommands.forEach((command, index) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "launcher-option";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(index === launcherSelection));
        const copy = document.createElement("span");
        copy.className = "launcher-option-copy";
        const label = document.createElement("strong");
        label.textContent = command.label;
        const description = document.createElement("small");
        description.textContent = command.description;
        copy.append(label, description);
        const action = document.createElement("span");
        action.className = "launcher-option-action";
        action.textContent = command.view ? "OPEN VIEW" : "LAUNCH";
        option.append(copy, action);
        option.addEventListener("mouseenter", () => {
            launcherSelection = index;
            updateLauncherSelection();
        });
        option.addEventListener("click", () => executeLauncherCommand(command));
        results.append(option);
    });
}

function updateLauncherSelection() {
    $("launcherResults").querySelectorAll(".launcher-option").forEach((option, index) => {
        option.setAttribute("aria-selected", String(index === launcherSelection));
    });
    $("launcherResults").querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
}

function openLauncher() {
    if (!$("launcher").hidden) {
        $("launcherSearch").focus();
        return;
    }
    launcherPreviousFocus = document.activeElement;
    $("launcher").hidden = false;
    $("launcherSearch").value = "";
    launcherSelection = 0;
    renderLauncherResults();
    requestAnimationFrame(() => $("launcherSearch").focus());
}

function closeLauncher() {
    $("launcher").hidden = true;
    if (launcherPreviousFocus instanceof HTMLElement && launcherPreviousFocus.isConnected) {
        launcherPreviousFocus.focus();
    }
}

function executeLauncherCommand(command) {
    if (command.view) navigate(command.view);
    else send("Launch", command.launch);
    closeLauncher();
}

$("launcherSearch").addEventListener("input", () => {
    launcherSelection = 0;
    renderLauncherResults();
});
$("launcherSearch").addEventListener("keydown", event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        launcherSelection = launcherCommands.length
            ? (launcherSelection + direction + launcherCommands.length) % launcherCommands.length
            : 0;
        updateLauncherSelection();
    } else if (event.key === "Enter") {
        event.preventDefault();
        if (launcherCommands[launcherSelection]) {
            executeLauncherCommand(launcherCommands[launcherSelection]);
        }
    } else if (event.key === "Escape") {
        closeLauncher();
    }
});
$("closeLauncher").addEventListener("click", closeLauncher);
$("launcher").addEventListener("click", event => {
    if (event.target === $("launcher")) closeLauncher();
});
document.addEventListener("keydown", event => {
    if ($("launcher").hidden) return;
    if (event.key === "Escape") {
        closeLauncher();
        return;
    }
    if (event.key !== "Tab") return;

    const focusable = [...$("launcher").querySelectorAll("input, button:not([disabled])")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
});

$("snapGap").addEventListener("input", () => {
    $("snapGapValue").value = `${$("snapGap").value} px`;
    $("snapGapValue").textContent = `${$("snapGap").value} px`;
});
$("settingsForm").addEventListener("submit", event => {
    event.preventDefault();
    const hotkeys = [...document.querySelectorAll("[data-hotkey]")]
        .map(input => input.value.trim().toLowerCase());
    const content = [
        $("driveLetters").value.trim(),
        $("snapGap").value,
        $("preserveWindowSize").checked ? "1" : "0",
        hotkeys.join(",")
    ].join("|");
    $("settingsStatus").textContent = "Saving preferences…";
    if (!send("SaveSettings", content)) {
        $("settingsStatus").textContent = "Unable to contact ASCS.";
    }
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
        case "openLauncher":
            openLauncher();
            break;
        case "settings":
            loadSettings(data);
            break;
        case "settingsSaved":
            updateShortcutReference(Object.fromEntries(
                [...document.querySelectorAll("[data-hotkey]")].map(input =>
                    [input.dataset.hotkey, input.value.trim().toUpperCase()])
            ));
            $("settingsStatus").textContent = data.message || "Preferences saved.";
            showToast(data.message || "Preferences saved.");
            break;
        case "error":
            if (data.scope === "notes") {
                pendingSaveData.shift();
                setSaveStatus("SAVE FAILED", "error");
            }
            if ($("settings")?.classList.contains("active")) {
                $("settingsStatus").textContent = typeof data.message === "string"
                    ? data.message
                    : "Preferences could not be saved.";
            }
            showToast(typeof data.message === "string" ? data.message : "An error occurred.");
            break;
    }
}

window.chrome?.webview?.addEventListener("message", handleWebMessage);

function loadSettings(data) {
    $("driveLetters").value = Array.isArray(data.drives) ? data.drives.join(", ") : "";
    $("snapGap").value = String(data.snapGap ?? 0);
    $("snapGapValue").value = `${$("snapGap").value} px`;
    $("snapGapValue").textContent = `${$("snapGap").value} px`;
    $("preserveWindowSize").checked = data.preserveSize === true;
    const hotkeys = data.hotkeys && typeof data.hotkeys === "object" ? data.hotkeys : {};
    document.querySelectorAll("[data-hotkey]").forEach(input => {
        input.value = typeof hotkeys[input.dataset.hotkey] === "string"
            ? hotkeys[input.dataset.hotkey].toUpperCase()
            : "";
    });
    updateShortcutReference(hotkeys);
}

function updateShortcutReference(hotkeys) {
    document.querySelectorAll("[data-hotkey-display]").forEach(keycap => {
        const key = hotkeys[keycap.dataset.hotkeyDisplay];
        if (typeof key === "string" && key.length === 1) {
            keycap.textContent = key.toUpperCase();
        }
    });
}

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
    updateHardware(data.hardware);
    $("metricsUpdated").textContent =
        `Last updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function updateHardware(hardware) {
    if (!hardware || typeof hardware !== "object") return;
    $("hardwareCpu").textContent = hardware.cpu || "Unavailable";
    $("hardwareCores").textContent = hardware.cores || "";
    $("hardwareGpu").textContent = hardware.gpu || "Unavailable";
    $("hardwareGpuDetail").textContent = hardware.gpuDetail || "";
    $("hardwareMemory").textContent = hardware.memory || "Unavailable";
    const storage = Array.isArray(hardware.storage) ? hardware.storage : [];
    $("hardwareDisks").textContent = storage.length
        ? `${storage.length} physical ${storage.length === 1 ? "drive" : "drives"}`
        : "Unavailable";
    $("hardwareDevice").textContent = [hardware.manufacturer, hardware.model]
        .filter(value => typeof value === "string" && value.length)
        .join(" ") || "Unavailable";
    $("hardwareBoard").textContent = hardware.board || "Unavailable";
    $("hardwareBios").textContent = hardware.bios || "";
    $("hardwareWindows").textContent = hardware.windows || "Unavailable";
    renderPhysicalStorage(storage);
}

function formatHardwareCapacity(bytes) {
    const capacity = Number(bytes);
    if (!Number.isFinite(capacity) || capacity <= 0) return "Capacity unavailable";
    const gigabytes = capacity / (1024 ** 3);
    if (gigabytes >= 1024) return `${(gigabytes / 1024).toFixed(1)} TB`;
    return `${gigabytes.toFixed(1)} GB`;
}

function appendHardwareText(parent, tagName, className, text) {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
}

function renderPhysicalStorage(disks) {
    const container = $("physicalStorage");
    container.replaceChildren();

    if (!disks.length) {
        appendHardwareText(container, "p", "physical-storage-empty",
            "No physical drive details are available.");
        return;
    }

    disks.forEach((disk, index) => {
        const card = document.createElement("article");
        card.className = "physical-disk-card";
        const heading = document.createElement("div");
        heading.className = "physical-disk-heading";
        appendHardwareText(heading, "strong", "",
            disk.model || `Physical drive ${index + 1}`);
        appendHardwareText(heading, "span", "",
            formatHardwareCapacity(disk.sizeBytes));
        card.append(heading);

        const partitions = Array.isArray(disk.partitions) ? disk.partitions : [];
        const details = [
            disk.interfaceType,
            disk.mediaType,
            disk.status,
            partitions.length
                ? `${partitions.length} ${partitions.length === 1 ? "partition" : "partitions"}`
                : "",
            partitions.some(partition => partition.boot === true) ? "Boot partition" : ""
        ].filter(value => typeof value === "string" && value.trim());
        appendHardwareText(card, "p", "physical-disk-meta",
            details.join(" · ") || "Drive details are limited.");

        if (partitions.length) {
            const partitionList = document.createElement("div");
            partitionList.className = "physical-partition-list";
            partitions.forEach((partition, partitionIndex) => {
                const partitionLabel = [
                    `Partition ${partitionIndex + 1}`,
                    formatHardwareCapacity(partition.sizeBytes),
                    partition.type,
                    partition.boot === true ? "Boot" : ""
                ].filter(value => typeof value === "string" && value.trim());
                appendHardwareText(partitionList, "span", "",
                    partitionLabel.join(" · "));
            });
            card.append(partitionList);
        }

        const volumes = Array.isArray(disk.volumes) ? disk.volumes : [];
        if (volumes.length) {
            const volumeList = document.createElement("div");
            volumeList.className = "physical-volume-list";
            volumes.forEach(volume => {
                const row = document.createElement("div");
                row.className = "physical-volume-row";
                const copy = document.createElement("div");
                copy.className = "physical-volume-copy";
                const label = [volume.letter, volume.label]
                    .filter(value => typeof value === "string" && value.trim())
                    .join(" — ") || "Mounted volume";
                appendHardwareText(copy, "strong", "", label);
                const filesystemStatus = [volume.fileSystem, volume.status]
                    .filter(value => typeof value === "string" && value.trim())
                    .join(" · ");
                if (filesystemStatus) {
                    appendHardwareText(copy, "small", "", filesystemStatus);
                }
                row.append(copy);
                const size = formatHardwareCapacity(volume.sizeBytes);
                const free = Number(volume.freeBytes);
                const sizeText = Number.isFinite(free) && free >= 0
                    ? `${(free / (1024 ** 3)).toFixed(1)} GB free · ${size}`
                    : size;
                appendHardwareText(row, "span", "physical-volume-size", sizeText);
                volumeList.append(row);
            });
            card.append(volumeList);
        } else {
            appendHardwareText(card, "p", "physical-disk-meta",
                "No mounted drive letters were associated with this disk.");
        }

        container.append(card);
    });
}

send("Ready");
