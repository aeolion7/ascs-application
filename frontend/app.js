"use strict";

const $ = id => document.getElementById(id);
const validViews = new Set(["home", "notes", "dashboard", "commands", "settings"]);
const viewLabels = {
    home: "COMMAND CENTER",
    notes: "QUICK NOTES",
    dashboard: "SYSTEM DASHBOARD",
    commands: "SUPER COMMANDS",
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
let lastHardwareSignature = null;
let pendingNotices = [];
let pendingCaptures = [];
let activityItems = [];

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

// Shows a toast now, or the next time ASCS gains focus when the window is
// hidden (for example, notes loaded during hidden startup).
function showNotice(message) {
    if (document.hasFocus()) {
        showToast(message);
    } else if (!pendingNotices.includes(message)) {
        pendingNotices.push(message);
    }
}

function flushNotices() {
    if (!pendingNotices.length) return;
    const message = pendingNotices.join(" ");
    pendingNotices = [];
    showToast(message);
}

// Styled replacement for window.confirm(). Resolves true when confirmed.
function confirmDialog({ title, message, confirmLabel = "Confirm", danger = false }) {
    return new Promise(resolve => {
        const backdrop = $("confirmDialog");
        const confirmButton = $("confirmDialogConfirm");
        const cancelButton = $("confirmDialogCancel");
        const previousFocus = document.activeElement;

        $("confirmDialogTitle").textContent = title;
        $("confirmDialogMessage").textContent = message;
        confirmButton.textContent = confirmLabel;
        confirmButton.classList.toggle("danger-solid", danger);
        backdrop.hidden = false;
        requestAnimationFrame(() => cancelButton.focus());

        function finish(result) {
            backdrop.hidden = true;
            backdrop.removeEventListener("keydown", onKey);
            backdrop.removeEventListener("click", onBackdrop);
            confirmButton.removeEventListener("click", onConfirm);
            cancelButton.removeEventListener("click", onCancel);
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
            resolve(result);
        }
        function onConfirm() { finish(true); }
        function onCancel() { finish(false); }
        function onBackdrop(event) { if (event.target === backdrop) finish(false); }
        function onKey(event) {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                finish(false);
            } else if (event.key === "Tab") {
                event.preventDefault();
                (document.activeElement === cancelButton ? confirmButton : cancelButton).focus();
            }
        }

        backdrop.addEventListener("keydown", onKey);
        backdrop.addEventListener("click", onBackdrop);
        confirmButton.addEventListener("click", onConfirm);
        cancelButton.addEventListener("click", onCancel);
    });
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
    if (view === "dashboard" || view === "home") send("GetMetrics", view);
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

// ------------------------------------------------------------------ palette
// Super+Space. Sources: built-in commands, custom commands, workspaces,
// notes, snippets, open windows, an inline calculator, and file/web search.
// Modes narrow the list: snippets (Super+Shift+P), workspaces
// (Super+Shift+R), windows, and save-workspace (name entry).

const Palette = globalThis.ASCSPalette;
const USAGE_KEY = "ascs.palette.usage";

const builtInCommands = [
    { id: "view:home", label: "Command Center", description: "Open the ASCS home view", keywords: "home overview activity", view: "home" },
    { id: "view:notes", label: "Quick Notes", description: "Open your notes and snippets", keywords: "notes scratchpad", view: "notes", hotkey: "notes" },
    { id: "view:dashboard", label: "System Dashboard", description: "View live system metrics and hardware", keywords: "dashboard metrics hardware", view: "dashboard", hotkey: "dashboard" },
    { id: "view:commands", label: "Shortcut Reference", description: "Browse the complete Super shortcut list", keywords: "commands shortcuts help", view: "commands" },
    { id: "view:settings", label: "Preferences", description: "Drives, snapping, shortcuts, custom commands, and workspaces", keywords: "settings options configure", view: "settings" },
    { id: "mode:snippets", label: "Paste a snippet…", description: "Type a saved snippet into the window you were using", keywords: "snippet paste insert text", mode: "snippets", shortcut: "Super+Shift+P" },
    { id: "mode:workspaces", label: "Restore a workspace…", description: "Choose a saved window layout", keywords: "workspace layout restore", mode: "workspaces", shortcut: "Super+Shift+R" },
    { id: "mode:save-workspace", label: "Save workspace as…", description: "Save the current window layout under a name", keywords: "workspace layout save name", mode: "save-workspace" },
    { id: "mode:windows", label: "Switch to window…", description: "Jump to an open window on this desktop", keywords: "window switch focus alt tab", mode: "windows" },
    { id: "launch:everything", label: "Everything", description: "Search files and folders as you type", keywords: "search files find", launch: "everything", hotkey: "everything" },
    { id: "launch:vivaldi", label: "Vivaldi", description: "Focus Vivaldi here, switch to its desktop, or open it", keywords: "browser web internet", launch: "vivaldi", shortcut: "Super+B" },
    { id: "launch:terminal", label: "Windows Terminal", description: "Focus or open a terminal window", keywords: "console shell powershell", launch: "terminal", hotkey: "terminal" },
    { id: "launch:explorer", label: "File Explorer", description: "Browse files and folders", keywords: "explorer folders", launch: "explorer", hotkey: "explorer" },
    { id: "launch:calculator", label: "Calculator", description: "Open the Windows calculator (or type math here)", keywords: "math", launch: "calculator", hotkey: "calculator" },
    { id: "launch:taskmanager", label: "Task Manager", description: "Inspect running apps and processes", keywords: "performance processes", launch: "taskmanager", hotkey: "taskmanager" },
    { id: "launch:settings", label: "Windows Settings", description: "Open Windows system settings", keywords: "configuration control panel", launch: "settings" },
    { id: "launch:downloads", label: "Downloads", description: "Open your Downloads folder", keywords: "files", launch: "downloads" },
    { id: "launch:projects", label: "Documents", description: "Open your Documents folder", keywords: "projects files", launch: "projects" },
    { id: "launch:snipping", label: "Snipping Tool", description: "Capture a screen region", keywords: "screenshot capture snip", launch: "snipping" },
    { id: "launch:lock", label: "Lock workstation", description: "Lock your Windows session", keywords: "security", launch: "lock", shortcut: "Super+L" },
    { id: "launch:mute", label: "Toggle mute", description: "Mute or unmute system audio", keywords: "sound volume audio", launch: "mute", shortcut: "Super+M" },
    { id: "launch:reload", label: "Reload ASCS", description: "Save notes and restart ASCS to apply changes", keywords: "restart refresh script", launch: "reload", shortcut: "Ctrl+Alt+Shift+A" }
];

const paletteModes = {
    all: { chip: "", title: "What would you like to do?", placeholder: "Search commands, notes, snippets, windows… (= math, ? web)" },
    snippets: { chip: "Snippets", title: "Paste a snippet", placeholder: "Filter snippets…" },
    workspaces: { chip: "Workspaces", title: "Restore a workspace", placeholder: "Filter saved workspaces…" },
    windows: { chip: "Windows", title: "Switch to a window", placeholder: "Filter open windows…" },
    "save-workspace": { chip: "Save workspace", title: "Save the current layout", placeholder: "Name this workspace (letters, numbers, spaces, - _)" }
};

let launcherMode = "all";
let launcherWindows = [];
let customCommands = [];
let savedWorkspaces = [];
let currentHotkeys = {};

function loadUsage() {
    try {
        return JSON.parse(localStorage.getItem(USAGE_KEY) || "{}") || {};
    } catch {
        return {};
    }
}

function rememberUsage(id) {
    try {
        localStorage.setItem(USAGE_KEY, JSON.stringify(Palette.recordUsage(loadUsage(), id)));
    } catch {
        // Ranking is a convenience; ignore storage failures.
    }
}

function shortcutFor(command) {
    if (command.shortcut) return command.shortcut;
    if (command.hotkey && currentHotkeys[command.hotkey]) return `Super+${currentHotkeys[command.hotkey].toUpperCase()}`;
    return "";
}

function formatSavedTime(iso) {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function noteExcerpt(text) {
    return text.replace(/\s+/g, " ").trim().slice(0, 90) || "Empty";
}

// Items for the current mode and query, before ranking.
function paletteSources(mode) {
    const items = [];
    if (mode === "all") {
        builtInCommands.forEach(command => items.push({
            ...command, badge: command.view ? "VIEW" : command.mode ? "FIND" : "APP", hint: shortcutFor(command)
        }));
        customCommands.forEach(command => items.push({
            id: `cmd:${command.name}`, label: command.name,
            description: command.target, keywords: `custom ${command.kind}`,
            badge: "CUSTOM", hint: command.key ? `Super+${command.key.toUpperCase()}` : "",
            run: () => send("RunCommand", String(command.id)), weight: 4
        }));
    }
    if (mode === "all" || mode === "workspaces") {
        savedWorkspaces.forEach(workspace => items.push({
            id: `ws:${workspace.name.toLowerCase()}`, label: `Restore workspace “${workspace.name}”`,
            description: `${workspace.windows} window${workspace.windows === 1 ? "" : "s"} · saved ${formatSavedTime(workspace.saved)}`,
            keywords: `workspace layout ${workspace.name}`, badge: "WORKSPACE",
            hint: workspace.name === "Default" ? "Super+R" : "",
            run: () => send("RestoreWorkspace", workspace.name)
        }));
    }
    if (mode === "all" || mode === "snippets") {
        notesData.notes.forEach(note => {
            const isSnippet = note.type === "snippet";
            if (!isSnippet && mode === "snippets") return;
            items.push({
                id: `${isSnippet ? "snippet" : "note"}:${note.id}`, label: noteLabel(note),
                description: noteExcerpt(note.content), keywords: `${isSnippet ? "snippet" : "note"} ${note.content.slice(0, 2000)}`,
                badge: isSnippet ? "SNIPPET" : "NOTE", searchOnly: mode === "all",
                run: isSnippet ? () => send("PasteSnippet", note.content) : () => openNote(note.id),
                copy: () => copyText(note.content, isSnippet ? "Snippet copied." : "Note copied."),
                weight: isSnippet ? 2 : 0
            });
        });
    }
    if (mode === "all" || mode === "windows") {
        launcherWindows.forEach(win => items.push({
            id: `win:${win.app.toLowerCase()}`, label: win.title, description: `${win.app}${win.minimized ? " · minimized" : ""}`,
            keywords: `window ${win.app}`, badge: "WINDOW", searchOnly: mode === "all",
            run: () => send("FocusWindow", win.id), weight: -2
        }));
    }
    return items;
}

function buildLauncherResults() {
    const raw = $("launcherSearch").value;
    const usage = loadUsage();

    if (launcherMode === "save-workspace") {
        const name = raw.trim();
        const valid = Palette.isValidWorkspaceName(name);
        return [{
            id: "save-workspace", label: name ? `Save current layout as “${name}”` : "Type a name for this layout",
            description: name && !valid ? "Use letters, numbers, spaces, - and _ (up to 40 characters)." : "Visible windows on this desktop are saved; Super+Shift+R restores them.",
            badge: "SAVE", disabled: !valid,
            run: () => send("SaveWorkspace", name)
        }];
    }

    const query = launcherMode === "all" ? Palette.parseQuery(raw) : { kind: "text", text: raw.trim() };
    const results = [];

    if (query.kind === "calc") {
        const value = Palette.evaluateExpression(query.text);
        if (value !== null) {
            const formatted = Palette.formatNumber(value);
            results.push({
                id: "calc", label: `= ${formatted}`, description: `${query.text} · Enter copies the result`, badge: "RESULT",
                run: () => copyText(formatted, `Copied ${formatted}.`), copy: () => copyText(formatted, `Copied ${formatted}.`)
            });
        } else if (raw.trim().startsWith("=")) {
            results.push({ id: "calc", label: "Keep typing an expression", description: "Supports + − × ÷ % ^, parentheses, sqrt(), round(), pi, e", badge: "RESULT", disabled: true });
        }
        if (raw.trim().startsWith("=")) return results;
    }

    if (query.kind === "web") {
        results.push({
            id: "web", label: query.text ? `Search the web for “${query.text}”` : "Type what to search for",
            description: "Opens your browser with the search address from Preferences", badge: "SEARCH",
            disabled: !query.text, run: () => send("SearchWeb", query.text)
        });
        return results;
    }

    const sources = paletteSources(launcherMode);
    if (!query.text) {
        const visible = sources.filter(item => !item.searchOnly);
        if (launcherMode === "all") {
            const byId = new Map(visible.map(item => [item.id, item]));
            const recent = Palette.recentIds(usage, 5).map(id => byId.get(id)).filter(Boolean)
                .map(item => ({ ...item, group: "Recent" }));
            const recentIds = new Set(recent.map(item => item.id));
            return [...recent, ...visible.filter(item => !recentIds.has(item.id)).map(item => ({ ...item, group: "All commands" }))];
        }
        return visible;
    }

    results.push(...Palette.rankItems(sources, query.text, usage).slice(0, 40));
    if (launcherMode === "all") {
        results.push(
            { id: "files", label: `Search files for “${query.text}”`, description: "Opens Everything with this search", badge: "SEARCH", run: () => send("SearchFiles", query.text) },
            { id: "web", label: `Search the web for “${query.text}”`, description: "Tip: start with ? to search the web directly", badge: "SEARCH", run: () => send("SearchWeb", query.text) }
        );
    }
    return results;
}

function renderLauncherResults() {
    const results = $("launcherResults");
    launcherCommands = buildLauncherResults();
    launcherSelection = Math.min(launcherSelection, Math.max(launcherCommands.length - 1, 0));
    results.replaceChildren();

    if (!launcherCommands.length) {
        const empty = document.createElement("p");
        empty.className = "launcher-empty";
        empty.textContent = launcherMode === "snippets"
            ? "No snippets yet. In Quick Notes, set a note's type to Snippet."
            : launcherMode === "workspaces"
                ? "No saved workspaces. Use “Save workspace as…” or Super+S."
                : "No matches.";
        results.append(empty);
        updateLauncherHint();
        return;
    }

    let lastGroup = null;
    launcherCommands.forEach((command, index) => {
        if (command.group && command.group !== lastGroup) {
            const header = document.createElement("p");
            header.className = "launcher-group";
            header.dataset.group = command.group;
            header.textContent = command.group;
            results.append(header);
            lastGroup = command.group;
        }
        const option = document.createElement("button");
        option.type = "button";
        option.className = "launcher-option";
        option.dataset.kind = (command.badge || "").toLowerCase();
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(index === launcherSelection));
        if (command.disabled) option.setAttribute("aria-disabled", "true");
        const copy = document.createElement("span");
        copy.className = "launcher-option-copy";
        const label = document.createElement("strong");
        label.textContent = command.label;
        const description = document.createElement("small");
        description.textContent = command.description || "";
        copy.append(label, description);
        const meta = document.createElement("span");
        meta.className = "launcher-option-meta";
        if (command.hint) {
            const hint = document.createElement("kbd");
            hint.textContent = command.hint;
            meta.append(hint);
        }
        const badge = document.createElement("span");
        badge.className = "launcher-option-action";
        badge.textContent = command.badge || "RUN";
        meta.append(badge);
        option.append(copy, meta);
        option.addEventListener("mouseenter", () => {
            launcherSelection = index;
            updateLauncherSelection();
        });
        option.addEventListener("click", event => executeLauncherCommand(command, event.shiftKey));
        results.append(option);
    });
    updateLauncherHint();
}

function updateLauncherHint() {
    const selected = launcherCommands[launcherSelection];
    const kind = selected?.badge;
    const parts = ["<kbd>↑</kbd><kbd>↓</kbd> navigate"];
    if (kind === "SNIPPET") parts.push("<kbd>Enter</kbd> paste", "<kbd>Shift</kbd>+<kbd>Enter</kbd> copy");
    else if (kind === "NOTE") parts.push("<kbd>Enter</kbd> open", "<kbd>Shift</kbd>+<kbd>Enter</kbd> copy");
    else if (kind === "RESULT") parts.push("<kbd>Enter</kbd> copy result");
    else parts.push("<kbd>Enter</kbd> run");
    parts.push(launcherMode === "all" ? "<kbd>Esc</kbd> close" : "<kbd>Backspace</kbd> all commands");
    $("launcherHint").innerHTML = parts.join(" <i>·</i> ");
}

function updateLauncherSelection() {
    $("launcherResults").querySelectorAll(".launcher-option").forEach((option, index) => {
        option.setAttribute("aria-selected", String(index === launcherSelection));
    });
    $("launcherResults").querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
    updateLauncherHint();
}

function setLauncherMode(mode) {
    launcherMode = paletteModes[mode] ? mode : "all";
    const config = paletteModes[launcherMode];
    $("launcherMode").textContent = config.chip;
    $("launcherMode").hidden = !config.chip;
    $("launcherSearch").style.paddingLeft = "";
    if (config.chip) {
        requestAnimationFrame(() => {
            $("launcherSearch").style.paddingLeft = `${$("launcherMode").offsetWidth + 20}px`;
        });
    }
    $("launcherTitle").textContent = config.title;
    $("launcherSearch").placeholder = config.placeholder;
    $("launcherSearch").value = "";
    launcherSelection = 0;
    if (launcherMode === "windows" || launcherMode === "all") send("GetWindows");
    renderLauncherResults();
    $("launcherSearch").focus();
}

function openLauncher(mode = "all") {
    if ($("launcher").hidden) {
        launcherPreviousFocus = document.activeElement;
        $("launcher").hidden = false;
    }
    if (!notesLoaded) send("GetNotes");
    setLauncherMode(mode || "all");
    requestAnimationFrame(() => $("launcherSearch").focus());
}

function closeLauncher() {
    $("launcher").hidden = true;
    launcherMode = "all";
    if (launcherPreviousFocus instanceof HTMLElement && launcherPreviousFocus.isConnected) {
        launcherPreviousFocus.focus();
    }
}

function executeLauncherCommand(command, alternate = false) {
    if (!command || command.disabled) return;
    if (command.mode) {
        rememberUsage(command.id);
        setLauncherMode(command.mode);
        return;
    }
    if (command.id && !["calc", "web", "files", "save-workspace"].includes(command.id)) rememberUsage(command.id);
    closeLauncher();
    if (alternate && command.copy) command.copy();
    else if (command.run) command.run();
    else if (command.view) navigate(command.view);
    else if (command.launch) send("Launch", command.launch);
}

async function copyText(text, message) {
    try {
        await navigator.clipboard.writeText(text);
        showToast(message);
    } catch (error) {
        showToast(`Unable to copy: ${error.message}`);
    }
}

function openNote(id) {
    if (!notesData.notes.some(note => note.id === id)) return;
    notesData.activeId = id;
    navigate("notes");
    renderActiveNote();
    scheduleNoteSave(false);
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
        executeLauncherCommand(launcherCommands[launcherSelection], event.shiftKey);
    } else if (event.key === "Backspace" && launcherMode !== "all" && $("launcherSearch").value === "") {
        event.preventDefault();
        setLauncherMode("all");
    } else if (event.key === "Escape") {
        event.preventDefault();
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
        hotkeys.join(","),
        $("searchTemplate").value.trim()
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
    flushNotices();
    if (!$("confirmDialog").hidden || !$("launcher").hidden) return;
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
        title.textContent = noteLabel(note);
        if (note.pinned) {
            const mark = document.createElement("span");
            mark.className = "pin-mark";
            mark.setAttribute("aria-label", "Pinned");
            mark.textContent = "◆ ";
            title.prepend(mark);
        }
        item.classList.toggle("is-pinned", Boolean(note.pinned));
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
        showNotice("Saved notes could not be parsed.");
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
        showNotice("Your notes were upgraded from the pre-1.4 format into a note named \"Scratch\".");
        return;
    }

    if (parsed?.version !== 2 || !Array.isArray(parsed.notes)) {
        showNotice("Saved notes use an unsupported format.");
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
        showNotice("Saved notes contain an invalid note entry.");
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
    if (recovered) showNotice("notes.json could not be read, so your notes were restored from notes.json.bak.");
    notesLoaded = true;
    renderActiveNote();
    applyPendingCaptures();
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

$("deleteNoteButton").addEventListener("click", async () => {
    const note = activeNote();
    if (!note) return;
    const confirmed = await confirmDialog({
        title: `Delete "${noteLabel(note)}"?`,
        message: "This permanently removes the note and its contents.",
        confirmLabel: "Delete note",
        danger: true
    });
    if (!confirmed || activeNote() !== note) return;
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
            if (typeof data.data !== "string") break;
            if (data.external === true && (saveTimer !== null || pendingSaveData.length)) {
                // Unsaved edits win; the next save overwrites the outside change.
                showNotice("notes.json changed outside ASCS, but you have unsaved edits; keeping your edits.");
                break;
            }
            if (data.external === true) showNotice("Notes reloaded because notes.json changed outside ASCS.");
            loadNotes(data.data, data.recovered === true);
            break;
        case "resume": {
            // ASCS was re-shown on the view that was already open.
            const view = document.querySelector(".view.active")?.id ?? "home";
            if (view === "home" || view === "dashboard") send("GetMetrics", view);
            if (view === "notes" && !notesLoaded) send("GetNotes");
            requestAnimationFrame(() => focusPrimaryInput(view));
            break;
        }
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
            openLauncher(typeof data.mode === "string" && data.mode ? data.mode : "all");
            break;
        case "captureNote":
            if (typeof data.text === "string") captureNote(data.text, typeof data.source === "string" ? data.source : "");
            break;
        case "activity":
            activityItems = Array.isArray(data.items) ? data.items : [];
            renderActivity();
            break;
        case "activityAdded":
            if (data.item && typeof data.item === "object") {
                activityItems.push(data.item);
                if (activityItems.length > 50) activityItems.shift();
                renderActivity();
            }
            break;
        case "commands":
            customCommands = Array.isArray(data.items) ? data.items : [];
            renderCommandEditor();
            renderKeymap();
            if (!$("launcher").hidden) renderLauncherResults();
            break;
        case "commandsSaved":
            commandsDirty = false;
            renderCommandEditor(true);
            $("commandsStatus").textContent = data.message || "Custom commands saved.";
            showToast(data.message || "Custom commands saved.");
            break;
        case "workspaces":
            savedWorkspaces = Array.isArray(data.items) ? data.items : [];
            renderWorkspaceManager();
            if (!$("launcher").hidden) renderLauncherResults();
            break;
        case "windows":
            launcherWindows = Array.isArray(data.items) ? data.items : [];
            if (!$("launcher").hidden) renderLauncherResults();
            break;
        case "browseResult":
            applyBrowseResult(data.row, data.path);
            break;
        case "notice":
            if (typeof data.message === "string") showNotice(data.message);
            break;
        case "windowState": {
            const maximized = data.maximized === true;
            $("maximizeControl").classList.toggle("is-maximized", maximized);
            $("maximizeControl").setAttribute("aria-label", maximized ? "Restore window" : "Maximize window");
            $("maximizeControl").title = maximized ? "Restore" : "Maximize";
            break;
        }
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
            if (data.scope === "commands") {
                $("commandsStatus").textContent = typeof data.message === "string" ? data.message : "Custom commands could not be saved.";
            } else if ($("settings")?.classList.contains("active")) {
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
    $("searchTemplate").value = typeof data.searchTemplate === "string" ? data.searchTemplate : "";
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
    currentHotkeys = { ...currentHotkeys, ...hotkeys };
    Object.keys(currentHotkeys).forEach(key => {
        if (typeof currentHotkeys[key] !== "string") delete currentHotkeys[key];
        else currentHotkeys[key] = currentHotkeys[key].toLowerCase();
    });
    renderKeymap();
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
    // Gold marks resources at 90% or more.
    bar.classList.toggle("is-high", amount >= 90);
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
    card.dataset.drive = drive.letter;
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

    function updateCards(container, dashboard) {
        const existing = new Map(
            [...container.children].map(card => [card.dataset.drive, card])
        );

        drives.forEach((drive, index) => {
            let card = existing.get(drive.letter);
            if (card) {
                existing.delete(drive.letter);
            } else {
                card = createDriveCard(drive, dashboard);
            }
            updateDriveCard(card, drive);

            const current = container.children[index];
            if (current !== card) container.insertBefore(card, current || null);
        });

        existing.forEach(card => card.remove());
    }

    updateCards($("homeDrives"), false);
    updateCards($("dashboardDrives"), true);
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
    updateSystemStatus(data);
    $("metricsUpdated").textContent =
        `Last updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function updateHardware(hardware) {
    if (!hardware || typeof hardware !== "object") return;
    const signature = JSON.stringify(hardware);
    if (signature === lastHardwareSignature) return;

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
    lastHardwareSignature = signature;
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
                const total = Number(volume.sizeBytes);
                const hasUsage = Number.isFinite(free) && free >= 0 && Number.isFinite(total) && total > 0;
                const usedPercent = hasUsage ? Math.max(0, Math.min(100, (1 - free / total) * 100)) : null;
                const sizeText = hasUsage
                    ? `${Math.round(usedPercent)}% full · ${(free / (1024 ** 3)).toFixed(1)} GB free · ${size}`
                    : size;
                appendHardwareText(row, "span", "physical-volume-size", sizeText);
                if (hasUsage) {
                    // Fullness bar, using the same burgundy/gold scale as the metric cards.
                    const meter = document.createElement("div");
                    meter.className = "metric-track volume-meter";
                    meter.setAttribute("role", "progressbar");
                    meter.setAttribute("aria-label", `${label} fullness`);
                    meter.setAttribute("aria-valuemin", "0");
                    meter.setAttribute("aria-valuemax", "100");
                    const fill = document.createElement("span");
                    meter.append(fill);
                    row.append(meter);
                    setProgressBar(fill, usedPercent);
                }
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

// ------------------------------------------------------------ quick capture
// Super+Shift+<notes key> sends the captured text here; it becomes a new
// note immediately, even while ASCS is hidden.

function captureNote(text, source) {
    if (!notesLoaded) {
        pendingCaptures.push({ text, source });
        send("GetNotes");
        return;
    }
    const stamp = new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    const title = source ? `Captured · ${source.slice(0, 60)}` : `Captured · ${stamp}`;
    const note = makeNote(text, title, "note");
    notesData.notes.push(note);
    notesData.activeId = note.id;
    renderActiveNote();
    scheduleNoteSave(false);
    saveNotesNow();
}

function applyPendingCaptures() {
    const queued = pendingCaptures;
    pendingCaptures = [];
    queued.forEach(capture => captureNote(capture.text, capture.source));
}

// ------------------------------------------------------------ activity feed

const activityLabels = {
    launch: "Opened", workspace: "Workspace", note: "Notes", snippet: "Snippet",
    file: "Explorer", command: "Custom", search: "Search", error: "Problem", system: "ASCS"
};

function relativeTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const seconds = Math.round((Date.now() - date.getTime()) / 1000);
    if (seconds < 45) return "just now";
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
    if (seconds < 172800) return "yesterday";
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function renderActivity() {
    const list = $("activityList");
    if (!list) return;
    list.replaceChildren();
    const items = activityItems.slice(-5).reverse();
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

setInterval(() => {
    if (document.visibilityState === "visible") {
        document.querySelectorAll("#activityList time").forEach(time => {
            time.textContent = relativeTime(time.dateTime);
        });
    }
}, 60000);

// ------------------------------------------------------------ custom commands editor

let commandsDirty = false;

function commandRowTemplate(command = { name: "", kind: "app", target: "", key: "" }) {
    const row = document.createElement("div");
    row.className = "command-row";
    row.innerHTML = `
        <input data-field="name" type="text" maxlength="48" placeholder="Name" aria-label="Command name" autocomplete="off">
        <select data-field="kind" aria-label="Command type">
          <option value="app">Application</option>
          <option value="folder">Folder</option>
          <option value="url">Web link</option>
        </select>
        <span class="command-target">
          <input data-field="target" type="text" maxlength="2048" aria-label="Command target" autocomplete="off">
          <button class="secondary" type="button" data-action="browse">Browse…</button>
        </span>
        <span class="hotkey-input"><kbd>Super</kbd> + <input data-field="key" type="text" maxlength="1" aria-label="Optional Super-key letter" autocomplete="off" placeholder="–"></span>
        <button class="secondary danger" type="button" data-action="remove" aria-label="Remove command">Remove</button>`;
    row.querySelector('[data-field="name"]').value = command.name;
    row.querySelector('[data-field="kind"]').value = command.kind;
    row.querySelector('[data-field="target"]').value = command.target;
    row.querySelector('[data-field="key"]').value = (command.key || "").toUpperCase();
    updateCommandRowKind(row);
    row.querySelector('[data-field="kind"]').addEventListener("change", () => updateCommandRowKind(row));
    row.querySelector('[data-action="remove"]').addEventListener("click", () => {
        row.remove();
        markCommandsDirty();
        updateCommandsEmpty();
    });
    row.querySelector('[data-action="browse"]').addEventListener("click", () => {
        const rows = [...$("commandRows").children];
        send("BrowseCommandTarget", `${rows.indexOf(row)}|${row.querySelector('[data-field="kind"]').value}`);
    });
    row.addEventListener("input", markCommandsDirty);
    return row;
}

function updateCommandRowKind(row) {
    const kind = row.querySelector('[data-field="kind"]').value;
    const target = row.querySelector('[data-field="target"]');
    target.placeholder = kind === "url" ? "https://example.com" : kind === "folder" ? "C:\\Projects" : "C:\\Program Files\\App\\app.exe";
    row.querySelector('[data-action="browse"]').hidden = kind === "url";
}

function markCommandsDirty() {
    commandsDirty = true;
    $("commandsStatus").textContent = "Unsaved changes.";
}

function updateCommandsEmpty() {
    $("commandsEmpty").hidden = $("commandRows").children.length > 0;
}

function renderCommandEditor(force = false) {
    if (commandsDirty && !force) return;
    const rows = $("commandRows");
    rows.replaceChildren(...customCommands.map(command => commandRowTemplate(command)));
    updateCommandsEmpty();
}

function applyBrowseResult(row, path) {
    const target = $("commandRows").children[Number(row)];
    if (!target || typeof path !== "string") return;
    target.querySelector('[data-field="target"]').value = path;
    const name = target.querySelector('[data-field="name"]');
    if (!name.value.trim()) {
        name.value = path.split("\\").pop().replace(/\.(exe|lnk)$/i, "");
    }
    markCommandsDirty();
}

$("addCommandButton").addEventListener("click", () => {
    const row = commandRowTemplate();
    $("commandRows").append(row);
    updateCommandsEmpty();
    markCommandsDirty();
    row.querySelector('[data-field="name"]').focus();
});

$("saveCommandsButton").addEventListener("click", () => {
    const clean = value => value.replace(/[\t\r\n]+/g, " ").trim();
    const lines = [...$("commandRows").children].map(row => {
        const field = name => clean(row.querySelector(`[data-field="${name}"]`).value);
        return [field("name"), field("kind"), field("target"), field("key").toLowerCase()];
    }).filter(fields => fields[0] || fields[2]);
    $("commandsStatus").textContent = "Saving…";
    if (!send("SaveCommands", lines.map(fields => fields.join("\t")).join("\n"))) {
        $("commandsStatus").textContent = "Unable to contact ASCS.";
    }
});

// ------------------------------------------------------------ workspace manager

function renderWorkspaceManager() {
    const list = $("workspaceList");
    list.replaceChildren();
    $("workspacesEmpty").hidden = savedWorkspaces.length > 0;
    savedWorkspaces.forEach(workspace => {
        const item = document.createElement("li");
        item.className = "workspace-item";
        const copy = document.createElement("span");
        copy.className = "workspace-copy";
        const name = document.createElement("strong");
        name.textContent = workspace.name;
        const meta = document.createElement("small");
        meta.textContent = `${workspace.windows} window${workspace.windows === 1 ? "" : "s"} · saved ${formatSavedTime(workspace.saved)}${workspace.name === "Default" ? " · Super+S / Super+R" : ""}`;
        copy.append(name, meta);
        const restore = document.createElement("button");
        restore.type = "button";
        restore.className = "secondary";
        restore.textContent = "Restore";
        restore.addEventListener("click", () => send("RestoreWorkspace", workspace.name));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "secondary danger";
        remove.textContent = "Delete";
        remove.addEventListener("click", async () => {
            const confirmed = await confirmDialog({
                title: `Delete workspace “${workspace.name}”?`,
                message: "The saved layout is removed. Open windows are not affected.",
                confirmLabel: "Delete workspace",
                danger: true
            });
            if (confirmed) send("DeleteWorkspace", workspace.name);
        });
        item.append(copy, restore, remove);
        list.append(item);
    });
}

$("saveWorkspaceForm").addEventListener("submit", event => {
    event.preventDefault();
    const name = $("workspaceName").value.trim();
    if (!Palette.isValidWorkspaceName(name)) {
        showToast("Workspace names use letters, numbers, spaces, - and _ (up to 40 characters).");
        return;
    }
    send("SaveWorkspace", name);
    $("workspaceName").value = "";
});

// ------------------------------------------------------------ title bar

$("titlebarCommand").addEventListener("click", () => openLauncher("all"));

// Clock in the title bar and the date line on the Command Center.
function updateClock() {
    const now = new Date();
    $("topClock").textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    $("topClock").dateTime = now.toISOString();
    $("homeDate").textContent = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }).toUpperCase();
}
setInterval(updateClock, 15000);

// Title bar status: nominal, or the first resource at 90% or more (gold).
function updateSystemStatus(data) {
    const alerts = [];
    if (Number(data.cpu) >= 90) alerts.push(`CPU ${Math.round(data.cpu)}%`);
    if (Number(data.ram) >= 90) alerts.push(`MEMORY ${Math.round(data.ram)}%`);
    (Array.isArray(data.drives) ? data.drives : []).forEach(drive => {
        if (drive?.online && Number(drive.usage) >= 90) alerts.push(`${drive.letter} ${Math.round(drive.usage)}% FULL`);
    });
    const status = $("topStatus");
    status.dataset.state = alerts.length ? "attention" : "nominal";
    $("topStatusText").textContent = alerts.length
        ? `ATTENTION · ${alerts[0]}${alerts.length > 1 ? ` +${alerts.length - 1}` : ""}`
        : "ALL SYSTEMS NOMINAL";
    status.title = alerts.length ? alerts.join(", ") : "Every monitored resource is below 90%.";
}

// ------------------------------------------------------------ keyboard map
// An ISO 100% keyboard showing which keys are taken with Super, or with
// Super + Shift. Hover or focus a key for its command; hold Shift while the
// Super Commands view is open to preview the Shift layer.

const SVG_NS = "http://www.w3.org/2000/svg";
const KEY_UNIT = 48;
const KEY_GAP = 4;
let keymapLayer = "super";
let keymapShiftHeld = false;

function svgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
}

function keyShape(key) {
    const x = key.x * KEY_UNIT + KEY_GAP / 2;
    const y = key.y * KEY_UNIT + KEY_GAP / 2;
    const w = key.w * KEY_UNIT - KEY_GAP;
    const h = key.h * KEY_UNIT - KEY_GAP;
    return svgElement("rect", { x, y, width: w, height: h, rx: 6, class: "km-cap" });
}

function activeKeymapLayer() {
    return keymapShiftHeld ? "shift" : keymapLayer;
}

function renderKeymap() {
    const container = $("keymap");
    if (!container || !globalThis.ASCSKeymap) return;
    const layout = ASCSKeymap.isoFullSizeLayout();
    const bindings = ASCSKeymap.buildBindings(currentHotkeys, customCommands);
    const layer = activeKeymapLayer();
    const layerBindings = bindings[layer];
    const chord = layer === "shift" ? "Super + Shift + " : "Super + ";

    const svg = svgElement("svg", {
        viewBox: `0 0 ${layout.width * KEY_UNIT} ${layout.height * KEY_UNIT}`,
        role: "group",
        "aria-label": `${layout.name} keyboard, ${layer === "shift" ? "Super + Shift" : "Super"} layer`
    });
    // Metallic gold for the physical Super key: a diagonal body gradient with
    // a bright highlight band, plus a soft sheen across the top of the cap.
    const defs = svgElement("defs");
    const gold = svgElement("linearGradient", { id: "km-super-gradient", x1: 0, y1: 0, x2: 1, y2: 1 });
    [["0%", "#7a5418"], ["22%", "#c99a3e"], ["45%", "#f6dc93"], ["55%", "#fff2c6"], ["68%", "#d8aa4c"], ["100%", "#8c6420"]]
        .forEach(([offset, color]) => gold.append(svgElement("stop", { offset, "stop-color": color })));
    const sheen = svgElement("linearGradient", { id: "km-super-sheen", x1: 0, y1: 0, x2: 0, y2: 1 });
    sheen.append(
        svgElement("stop", { offset: "0%", "stop-color": "#fff", "stop-opacity": ".55" }),
        svgElement("stop", { offset: "45%", "stop-color": "#fff", "stop-opacity": "0" })
    );
    defs.append(gold, sheen);
    svg.append(defs);
    let used = 0;
    layout.keys.forEach(key => {
        const binding = layerBindings[key.id];
        const isModifier = key.id === "lshift" || key.id === "rshift";
        const category = binding ? binding.cat
            : key.special === "super" ? "super"
                : key.special === "planned" ? "planned"
                    : layer === "shift" && isModifier ? "modifier" : "free";
        const group = svgElement("g", {
            class: "km-key",
            "data-key": key.id,
            "data-cat": category,
            tabindex: binding || key.special ? 0 : -1
        });
        if (binding) used++;
        group.append(keyShape(key));
        if (key.special === "super") {
            const sheenCap = keyShape(key);
            sheenCap.setAttribute("class", "km-sheen");
            group.append(sheenCap);
        }
        const label = svgElement("text", {
            x: key.x * KEY_UNIT + 8,
            y: key.y * KEY_UNIT + 18,
            class: "km-label"
        });
        label.textContent = key.label;
        group.append(label);
        const specialCaption = key.special === "super" ? "Hold" : key.special === "planned" ? "Planned" : "";
        if (!binding && specialCaption) {
            const caption = svgElement("text", {
                x: key.x * KEY_UNIT + 8,
                y: (key.y + key.h) * KEY_UNIT - 10,
                class: "km-caption"
            });
            caption.textContent = specialCaption;
            group.append(caption);
            group.setAttribute("role", "img");
            group.setAttribute("aria-label", key.note);
        }
        if (binding) {
            const caption = svgElement("text", {
                x: key.x * KEY_UNIT + 8,
                y: (key.y + key.h) * KEY_UNIT - 10,
                class: "km-caption"
            });
            caption.textContent = binding.short;
            group.append(caption);
            const title = svgElement("title");
            title.textContent = `${chord}${key.label}: ${binding.title}`;
            group.append(title);
            group.setAttribute("aria-label", `${chord}${key.label}: ${binding.title}`);
            group.setAttribute("role", "img");
        }
        const describe = () => showKeymapDetail(key, binding, chord, bindings.passthrough[key.id], layer);
        group.addEventListener("mouseenter", describe);
        group.addEventListener("focus", describe);
        svg.append(group);
    });
    container.replaceChildren(svg);
    container.dataset.layer = layer;
    document.querySelectorAll(".keymap-layer").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.layer === layer));
    });
    $("keymapDetail").dataset.summary = layer === "shift"
        ? `${used} keys have a Super + Shift action. Others keep their Super action, except S, which is deliberately unassigned.`
        : `${used} keys are assigned with Super. Hover or focus a key for its command; hold Shift to preview the second layer.`;
    $("keymapDetail").textContent = $("keymapDetail").dataset.summary;
}

function showKeymapDetail(key, binding, chord, passthrough, layer) {
    const detail = $("keymapDetail");
    detail.replaceChildren();
    const keys = document.createElement("strong");
    keys.textContent = `${chord}${key.label}`;
    const text = document.createElement("span");
    if (binding) {
        text.textContent = ` · ${binding.title}. ${binding.desc}${binding.configurable ? " (Change the letter in Preferences.)" : ""}`;
    } else if (key.note) {
        keys.textContent = key.label;
        text.textContent = ` · ${key.note.replace(/^[^:]+:\s*/, "")}`;
    } else if (passthrough && layer === "super") {
        text.textContent = ` · Free in ASCS; passes ${passthrough} through to Windows.`;
    } else {
        text.textContent = layer === "shift" ? " · No Shift action; behaves like the Super layer." : " · Free.";
    }
    detail.append(keys, text);
}

$("keymap").addEventListener("mouseleave", () => {
    $("keymapDetail").textContent = $("keymapDetail").dataset.summary || "";
});
document.querySelectorAll(".keymap-layer").forEach(button => {
    button.addEventListener("click", () => {
        keymapLayer = button.dataset.layer;
        renderKeymap();
    });
});
// Holding Shift on the Super Commands view previews the Shift layer.
document.addEventListener("keydown", event => {
    if (event.key !== "Shift" || keymapShiftHeld || !$("commands").classList.contains("active")) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    keymapShiftHeld = true;
    renderKeymap();
});
document.addEventListener("keyup", event => {
    if (event.key !== "Shift" || !keymapShiftHeld) return;
    keymapShiftHeld = false;
    renderKeymap();
});
window.addEventListener("blur", () => {
    if (!keymapShiftHeld) return;
    keymapShiftHeld = false;
    renderKeymap();
});

renderKeymap();
updateClock();

// Title bar: frosted band once the page scrolls, and room on the right for
// the caption buttons, which are pinned to the window corner.
const topbar = document.querySelector(".topbar");
function updateTopbar() {
    topbar.classList.toggle("is-scrolled", window.scrollY > 2);
    const gutter = parseFloat(getComputedStyle(document.querySelector(".main")).paddingRight) || 0;
    const captionWidth = document.querySelector(".window-controls").offsetWidth || 144;
    topbar.style.setProperty("--caption-reserve", `${Math.max(12, captionWidth + 18 - gutter)}px`);
}
window.addEventListener("scroll", updateTopbar, { passive: true });
window.addEventListener("resize", updateTopbar);
updateTopbar();
