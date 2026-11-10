"use strict";

// Page errors are written to the ASCS log (and so ASCS Logs), at most ten
// per session, so a problem in the page is never invisible.
let reportedPageErrors = 0;
function reportPageError(message, where) {
    notePageError(message);
    if (reportedPageErrors >= 10) return;
    reportedPageErrors++;
    const text = `${String(message ?? "unknown error")} ${where || ""}`.replace(/[\r\n]+/g, " ").slice(0, 300);
    try {
        window.chrome?.webview?.postMessage(`ClientError\n${text}`);
    } catch {
        // nothing more can be done
    }
}
window.addEventListener("error", event =>
    reportPageError(event.message, `(${String(event.filename || "").split("/").pop()}:${event.lineno || 0})`));
window.addEventListener("unhandledrejection", event =>
    reportPageError(event.reason?.message || event.reason, "(promise)"));

// A page error also shows in the title bar. It can happen before the rest of
// this file has run, so the chip is drawn when it's able to be.
function notePageError(message) {
    try {
        unseenPageErrors++;
        lastPageError = String(message ?? "unknown error").slice(0, 200);
        renderTopStatus();
    } catch {
        window.addEventListener("DOMContentLoaded", () => {
            try {
                unseenPageErrors = Math.max(unseenPageErrors, 1);
                lastPageError = String(message ?? "unknown error").slice(0, 200);
                renderTopStatus();
            } catch {
                // the log still has it
            }
        }, { once: true });
    }
}

const $ = id => document.getElementById(id);
const validViews = new Set(["home", "notes", "calendar", "workspaces", "games", "sounds", "dashboard", "commands", "settings"]);
const viewLabels = {
    home: "Command Center",
    notes: "Quick Notes",
    calendar: "Calendar",
    workspaces: "Workspaces",
    games: "Games",
    sounds: "Sounds",
    dashboard: "System",
    commands: "Commands",
    settings: "Preferences"
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

// A toast; with an action ({ label, run }, 1.9.0: Undo) it carries a button
// and stays 10 seconds instead of 2.8.
function showToast(message, action = null) {
    const toast = $("toast");
    if (!toast) return;

    toast.replaceChildren(document.createTextNode(message));
    toast.classList.toggle("has-action", Boolean(action));
    if (action) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "toast-action";
        button.textContent = action.label;
        button.addEventListener("click", () => {
            clearTimeout(toastTimer);
            toast.classList.remove("show");
            action.run();
        });
        toast.append(button);
    }
    toast.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), action ? 10000 : 2800);
}

// Shows a toast now, or the next time ASCS gains focus when the window is
// hidden (for example, notes loaded during hidden startup). An action only
// shows with a toast shown now.
function showNotice(message, action = null) {
    if (document.hasFocus()) {
        showToast(message, action);
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
    let input = document.querySelector(`#${view} [data-primary-input]`);
    if (!input) return;
    // Quick Notes in Read (2.0.0): the formatted note, which scrolls with the keys.
    if (input === $("noteText") && input.hidden) input = $("notePreview");

    input.focus();
    if (input === $("noteText")) {
        input.setSelectionRange(input.value.length, input.value.length);
    }
}

// Back and forward through the pages, for a mouse's side buttons.
const viewHistory = MaestroViewHistory.create();

function navigate(view, fromHistory = false) {
    if (!validViews.has(view)) return;
    if (!fromHistory) viewHistory.visit(view);
    if (!$("powerTray").hidden) togglePowerTray(false);
    const previousView = document.querySelector(".view.active")?.id ?? null;

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
    if (view === "dashboard") send("GetSignInHistory");
    globalThis.syncSystemView?.();
    if (view === "settings") send("GetSettings");
    if (view === "workspaces") {
        send("GetWorkspaces");
        send("GetLaunchRules");
        send("GetWindows");
        renderWorkspaceManager();
    }
    if (view === "home" && previousView !== null && previousView !== "home") advanceAlmanac();
    if (view === "home") preloadGames();
    if (view === "sounds") openSoundsView();
    if (view === "calendar") openCalendarView();
    if (view === "games") startGamesPolling();
    else stopGamesPolling();
    if (view === "home") {
        startHomePolling();
        renderHomeNotes();
        renderHomeModules();
    } else {
        stopHomePolling();
    }
    $("arrangeButton").hidden = view !== "home";
    updateSaveStatus();
    if (view !== "home" && typeof setArranging === "function") setArranging(false);
    if (view === "commands") {
        renderKeymap();
        send("GetSettings");
        startRunningPolling();
    } else {
        stopRunningPolling();
    }

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
// notes, open windows, an inline calculator, and file/web search.
// Modes narrow the list: snippets (paste a note, Super+Shift+P), workspaces
// (Super+Shift+R), windows, and save-workspace (name entry).

const Palette = globalThis.ASCSPalette;
const Workspaces = globalThis.ASCSWorkspaces;
const USAGE_KEY = "ascs.palette.usage";

const builtInCommands = [
    { id: "view:home", label: "Command Center", description: "Open the home page", keywords: "home overview activity", view: "home" },
    { id: "view:notes", label: "Quick Notes", description: "Open your notes", keywords: "notes scratchpad snippets", view: "notes", hotkey: "notes" },
    { id: "view:calendar", label: "Calendar", description: "Your calendars: day, week, month and agenda", keywords: "calendar events schedule agenda appointments", view: "calendar" },
    { id: "calendar:new", label: "New calendar event", description: "Opens the event editor (Ctrl + E). Or type + and the event: +Dentist tue 3pm", keywords: "calendar event add appointment meeting new", shortcut: "Ctrl+E", run: () => newEventFromShortcut() },
    { id: "view:sounds", label: "Sounds", description: "Every Windows sound; levels; set Windows and Maestro sounds", keywords: "sounds audio wav windows startup chimes level", view: "sounds" },
    { id: "view:dashboard", label: "System", description: "View live system metrics and hardware", keywords: "dashboard metrics hardware", view: "dashboard", hotkey: "dashboard" },
    { id: "view:commands", label: "Shortcut Reference", description: "Browse the complete Super shortcut list", keywords: "commands shortcuts help", view: "commands" },
    { id: "view:games", label: "Games", description: "Play time, recent games, and achievements", keywords: "play emulator retroarch dolphin pcsx2 pso achievements", view: "games" },
    { id: "view:logs", label: "Logs", description: "Maestro, activity and Code key logs, newest first", keywords: "log diagnostics errors journal history", run: () => showLogs() },
    { id: "view:settings", label: "Preferences", description: "Text size, the logo's swing, window snapping and the power delay", keywords: "settings options configure appearance", view: "settings" },
    { id: "mode:snippets", label: "Paste a note…", description: "Paste a note into the window you were using", keywords: "snippet paste insert text note", mode: "snippets", shortcut: "Super+Shift+P" },
    { id: "mode:workspaces", label: "Restore an arrangement…", description: "Choose a saved window layout", keywords: "arrangement workspace layout restore", mode: "workspaces", shortcut: "Super+Shift+R" },
    { id: "mode:save-workspace", label: "Save arrangement as…", description: "Save the current window layout under a name", keywords: "arrangement workspace layout save name", mode: "save-workspace" },
    { id: "mode:windows", label: "Switch to window…", description: "Jump to an open window on this desktop", keywords: "window switch focus alt tab", mode: "windows" },
    { id: "launch:everything", label: "Everything", description: "Search files and folders as you type", keywords: "search files find", launch: "everything", hotkey: "everything" },
    { id: "launch:vivaldi", label: "Vivaldi", description: "Focus Vivaldi here, switch to its desktop, or open it", keywords: "browser web internet", launch: "vivaldi", shortcut: "Super+B" },
    { id: "launch:terminal", label: "Windows Terminal", description: "Focus or open a terminal window", keywords: "console shell powershell", launch: "terminal", hotkey: "terminal" },
    { id: "launch:explorer", label: "File Explorer", description: "Browse files and folders", keywords: "explorer folders", launch: "explorer", hotkey: "explorer" },
    { id: "launch:claude", label: "Ask Claude", description: "Open Claude's quick-entry prompt", keywords: "ai assistant chat prompt anthropic", launch: "claude", hotkey: "claude" },
    { id: "launch:calculator", label: "Calculator", description: "Open the Windows calculator (or type math here)", keywords: "math", launch: "calculator" },
    { id: "launch:taskmanager", label: "Task Manager", description: "Inspect running apps and processes", keywords: "performance processes", launch: "taskmanager", hotkey: "taskmanager" },
    { id: "launch:settings", label: "Windows Settings", description: "Open Windows system settings", keywords: "configuration control panel", launch: "settings" },
    { id: "launch:downloads", label: "Downloads", description: "Open your Downloads folder", keywords: "files", launch: "downloads" },
    { id: "launch:projects", label: "Documents", description: "Open your Documents folder", keywords: "projects files", launch: "projects" },
    { id: "launch:snipping", label: "Snipping Tool", description: "Capture a screen region", keywords: "screenshot capture snip", launch: "snipping" },
    { id: "launch:lock", label: "Lock workstation", description: "Lock your Windows session", keywords: "security", launch: "lock", shortcut: "Super+L" },
    { id: "launch:mute", label: "Toggle mute", description: "Mute or unmute system audio", keywords: "sound volume audio", launch: "mute", shortcut: "Super+M" },
    { id: "view:toggle-sidebar", label: "Toggle sidebar", description: "Collapse or expand the navigation sidebar", keywords: "sidebar navigation collapse expand rail", run: () => toggleSidebar() },
    { id: "launch:reload", label: "Reload Maestro", description: "Save notes and restart Maestro to apply changes", keywords: "restart refresh script", launch: "reload", shortcut: "Ctrl+Alt+Shift+A" }
];

const paletteModes = {
    all: { chip: "", title: "Command Palette", placeholder: "Search commands, notes, windows… (= math, ? web, + event)" },
    snippets: { chip: "Paste", title: "Paste a Note", placeholder: "Filter notes…" },
    ask: { chip: "Fill in", title: "Fill In the Blanks", placeholder: "" },
    workspaces: { chip: "Arrangements", title: "Restore an Arrangement", placeholder: "Filter saved arrangements…" },
    windows: { chip: "Windows", title: "Switch to a Window", placeholder: "Filter open windows…" },
    "save-workspace": { chip: "Save arrangement", title: "Save the Current Layout", placeholder: "Name this arrangement (letters, numbers, spaces, - _)" },
    pick: { chip: "Add quick action", title: "Pin a Quick Action", placeholder: "Search views, apps, commands, arrangements, notes…" },
    "games:retroarch": { chip: "RetroArch", title: "Recent RetroArch Games", placeholder: "Filter games…" },
    "games:dolphin": { chip: "Dolphin", title: "Recent Dolphin Games", placeholder: "Filter games…" },
    "games:pcsx2": { chip: "PCSX2", title: "Recent PCSX2 Games", placeholder: "Filter games…" }
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
    if (mode === "all" || mode === "pick") {
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
    if (mode === "all") {
        items.push({
            id: "game-notes", label: "Notes for current game", description: "Opens the running game's notes in Quick Notes",
            keywords: "game notes playing session", badge: "NOTE", run: () => openCurrentGameNotes()
        });
    }
    if (mode === "all" || mode === "workspaces" || mode === "pick") {
        savedWorkspaces.forEach(workspace => items.push({
            id: `ws:${workspace.name.toLowerCase()}`, label: `Restore arrangement “${workspace.name}”`,
            description: `${workspace.windows} window${workspace.windows === 1 ? "" : "s"} · saved ${formatSavedTime(workspace.saved)}`,
            keywords: `arrangement workspace layout ${workspace.name}`, badge: "ARRANGEMENT",
            hint: workspace.name === "Default" ? "Super+R" : "",
            run: () => send("RestoreWorkspace", workspace.name)
        }));
    }
    if (mode === "all" || mode === "snippets" || mode === "pick") {
        // Every note can be opened, pasted or copied. In the palette Enter
        // opens it (Alt + Enter pastes); Super + Shift + P lists them to paste.
        // "snippet:" ids paste (quick actions kept from when these were snippets).
        notesData.notes.forEach(note => {
            const code = note.type === "code";
            const base = {
                label: ASCSNotes.groupedLabel(note, noteLabel(note)), description: noteExcerpt(note.content),
                keywords: `${code ? "code snippet" : "note"} ${note.content.slice(0, 2000)}`,
                badge: code ? "CODE" : "NOTE",
                paste: () => useNote(note, "paste"), copy: () => useNote(note, "copy"),
                weight: (note.pinned ? 2 : 0) + (mode === "snippets" && code ? 1 : 0)
            };
            if (mode === "snippets") {
                items.push({ ...base, id: `snippet:${note.id}`, run: base.paste });
                return;
            }
            items.push({ ...base, id: `note:${note.id}`, searchOnly: mode === "all", run: () => openNote(note.id) });
            if (mode === "pick") items.push({ ...base, id: `snippet:${note.id}`, label: `Paste “${base.label}”`, run: base.paste });
        });
    }
    if (mode === "all" || mode.startsWith("games:")) {
        const emulator = mode.startsWith("games:") ? mode.slice(6) : "all";
        const games = globalThis.ASCSGames
            ? Games.sortGames(Games.filterGames(gamesState.items.filter(game => game.launchable && game.installed !== false), "", emulator), "recent")
            : [];
        games.slice(0, mode === "all" ? 300 : 60).forEach(game => items.push({
            id: `game:${game.id}`, label: Games.displayTitle(game.title),
            description: gameMeta(game, ["emulator", "system", "time", "last"]),
            keywords: `game play ${game.title} ${game.system}`, badge: "GAME", searchOnly: mode === "all",
            run: () => playGame(game), weight: -1
        }));
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

    if (launcherMode === "ask" && askState) {
        const ask = askState.asks[askState.index];
        const answers = { ...askState.answers, [ask.name]: raw };
        const preview = ASCSNotes.fillPlaceholders(askState.note.content, { answers, uuid: () => "…" })
            .replace(new RegExp(`[${ASCSNotes.MARK_CLIPBOARD}${ASCSNotes.MARK_CURSOR}]`, "g"), "")
            .replace(/\s+/g, " ").trim().slice(0, 160);
        const last = askState.index === askState.asks.length - 1;
        return [{
            id: "fill", label: `${ASCSNotes.askLabel(ask.name)}: ${raw || "(empty)"}`,
            description: `${askState.asks.length > 1 ? `${askState.index + 1} of ${askState.asks.length} · ` : ""}${preview}`,
            badge: last ? (askState.action === "copy" ? "COPY" : "PASTE") : "NEXT",
            run: () => answerAsk(raw)
        }];
    }

    const query = launcherMode === "all" ? Palette.parseQuery(raw) : { kind: "text", text: raw.trim() };
    const results = [];

    // The answer shows as you type; Enter copies it through Maestro, which
    // works whether or not this window has the focus.
    const unfinished = launcherMode === "all" && query.kind === "text" && Palette.looksLikeUnfinishedMath(query.text);
    if (query.kind === "calc" || unfinished) {
        const result = Palette.calculate(query.text);
        if ("value" in result) {
            const formatted = Palette.formatNumber(result.value);
            const copy = () => {
                send("CopyNote", formatted);
                showToast(`Copied ${formatted}.`);
            };
            results.push({ id: "calc", label: `= ${formatted}`, description: `${query.text} · Enter copies ${formatted}`, badge: "RESULT", run: copy, copy });
        } else if (raw.trim().startsWith("=") || unfinished) {
            results.push({ id: "calc", label: query.text ? result.error : "Type an expression", description: "+ − x ÷ ^, % for percent, mod, parentheses, sqrt(), round(), pi, e", badge: "RESULT", disabled: true });
        }
        if (raw.trim().startsWith("=")) return results;
    }

    if (query.kind === "event") {
        results.push(quickAddOption(query.text));
        return results;
    }

    if (query.kind === "web") {
        results.push({
            id: "web", label: query.text ? `Search the web for “${query.text}”` : "Type what to search for",
            description: "Opens your browser with the search address set in Commands › Palette", badge: "SEARCH",
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
            ? "No notes yet. Start one in Quick Notes."
            : launcherMode === "workspaces"
                ? "No saved arrangements. Use “Save arrangement as…” or Super+S."
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
        option.addEventListener("click", event => executeLauncherCommand(command, launcherAction(command, event)));
        results.append(option);
    });
    updateLauncherHint();
}

function updateLauncherHint() {
    const selected = launcherCommands[launcherSelection];
    const kind = selected?.badge;
    const parts = ["<kbd>↑</kbd><kbd>↓</kbd> navigate"];
    if ((kind === "NOTE" || kind === "CODE") && launcherMode === "snippets") parts.push("<kbd>Enter</kbd> paste", "<kbd>Shift</kbd>+<kbd>Enter</kbd> copy");
    else if (kind === "NOTE" || kind === "CODE") parts.push("<kbd>Enter</kbd> open", "<kbd>Alt</kbd>+<kbd>Enter</kbd> paste", "<kbd>Shift</kbd>+<kbd>Enter</kbd> copy");
    else if (kind === "NEXT") parts.push("<kbd>Enter</kbd> next");
    else if (kind === "PASTE") parts.push("<kbd>Enter</kbd> paste");
    else if (kind === "COPY") parts.push("<kbd>Enter</kbd> copy");
    else if (kind === "RESULT") parts.push("<kbd>Enter</kbd> copy result");
    else parts.push("<kbd>Enter</kbd> run");
    parts.push(launcherMode === "all" ? "<kbd>Esc</kbd> close" : launcherMode === "ask" ? "<kbd>Esc</kbd> cancel" : "<kbd>Backspace</kbd> all commands");
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
    if (String(mode).startsWith("games:") || !gamesState.loaded) send("GetGames");
    setLauncherMode(mode || "all");
    requestAnimationFrame(() => $("launcherSearch").focus());
}

function closeLauncher() {
    $("launcher").hidden = true;
    if (launcherMode === "ask" && askState?.index < askState?.asks.length) askState = null;
    launcherMode = "all";
    if (launcherPreviousFocus instanceof HTMLElement && launcherPreviousFocus.isConnected) {
        launcherPreviousFocus.focus();
    }
}

// Enter runs; Shift copies; Alt pastes (for notes).
function launcherAction(command, event) {
    if (event.altKey && command?.paste) return "paste";
    return event.shiftKey ? "copy" : "run";
}

function executeLauncherCommand(command, action = "run") {
    if (!command || command.disabled) return;
    if (command.id === "fill") {
        command.run();
        return;
    }
    if (launcherMode === "pick") {
        closeLauncher();
        addQuickAction(command.id);
        return;
    }
    if (command.mode) {
        rememberUsage(command.id);
        setLauncherMode(command.mode);
        return;
    }
    if (command.id && !["calc", "web", "files", "save-workspace", "event"].includes(command.id)) rememberUsage(command.id);
    closeLauncher();
    if (action === "copy" && command.copy) command.copy();
    else if (action === "paste" && command.paste) command.paste();
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

// ---- pasting and copying notes, with placeholders (1.8.0)
// A note that fills placeholders asks for each {ask:name} in the palette
// first, then is filled here; ASCS fills {clipboard} and places {cursor}.
let askState = null;

function useNote(note, action) {
    if (!ASCSNotes.fillsPlaceholders(note)) {
        finishNote(note.content.replace(new RegExp(`[${ASCSNotes.MARK_CLIPBOARD}${ASCSNotes.MARK_CURSOR}]`, "g"), ""), action);
        return;
    }
    const asks = ASCSNotes.placeholderAsks(note.content);
    if (!asks.length) {
        finishNote(ASCSNotes.fillPlaceholders(note.content), action);
        return;
    }
    askState = { note, action, asks, index: 0, answers: {} };
    showAsk();
}

function showAsk() {
    const ask = askState.asks[askState.index];
    openLauncher("ask");
    $("launcherTitle").textContent = `Fill In “${noteLabel(askState.note)}”`;
    $("launcherSearch").placeholder = ASCSNotes.askLabel(ask.name);
    $("launcherSearch").value = askState.answers[ask.name] ?? ask.fallback;
    $("launcherSearch").select();
    renderLauncherResults();
}

function answerAsk(value) {
    if (!askState) return;
    askState.answers[askState.asks[askState.index].name] = value;
    askState.index++;
    if (askState.index < askState.asks.length) {
        showAsk();
        return;
    }
    const { note, action, answers } = askState;
    askState = null;
    closeLauncher();
    finishNote(ASCSNotes.fillPlaceholders(note.content, { answers }), action);
}

function finishNote(text, action) {
    if (!text) return;
    if (action === "paste") {
        send("PasteNote", text);
    } else if (send("CopyNote", text)) {
        showToast("Copied.");
    }
}

// `mode` is "read" or "edit"; without one, the note opens as openingMode says.
function openNote(id, mode = "") {
    const note = notesData.notes.find(item => item.id === id);
    if (!note) return;
    if (noteGroupPrefs.collapsed.delete(ASCSNotes.groupKey(note.group))) saveNoteGroupPrefs();
    notesData.activeId = id;
    noteModeFor = id;
    noteMode = mode === "read" || mode === "edit" ? mode : ASCSNotes.openingMode(note);
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
        executeLauncherCommand(launcherCommands[launcherSelection], launcherAction(launcherCommands[launcherSelection], event));
    } else if (event.key === "Backspace" && launcherMode !== "all" && launcherMode !== "ask" && $("launcherSearch").value === "") {
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
// One message saves these, whichever page they're edited on: Preferences holds
// the first ones and Commands the letters, Claude's shortcut and the search address.
function settingsPayload(hotkeys = currentHotkeys) {
    return [
        $("driveLetters").value.trim(),
        $("snapGap").value,
        $("preserveWindowSize").checked ? "1" : "0",
        ASCSKeymap.HOTKEY_ACTIONS.map(action => hotkeys[action] || "").join(","),
        $("claudeShortcut").value.trim(),
        $("powerDelay").value,
        $("ascsSounds").value,
        $("searchTemplate").value.trim()
    ].join("|");
}

// Preferences save as they change (2.0.0), and so does Maestro sounds on the
// Sounds page. One message carries every setting, Commands' and System's too, so
// nothing is sent until they've all arrived: the controls stay disabled until then.
const SETTINGS_CONTROLS = ["snapGap", "preserveWindowSize", "powerDelay", "ascsSounds"];
let quietSettingsSave = "";     // "preferences" or "sounds": who's waiting for the answer

// Pages that save as you change them say so in the title bar, beside the
// page's name (2.0.0 manual pass): Preferences, and Games › Setup.
function updateSaveStatus() {
    const view = document.querySelector(".view.active")?.id;
    $("settingsStatus").hidden = view !== "settings";
    $("gamesStatus").hidden = view !== "games" || $("gamesSetupPanel").hidden;
}

function setPageSaveStatus(id, text) {
    $(id).textContent = text;
    $(id).title = text;
}

// "Saved at 2:32 PM"
function savedAtNow() {
    return `Saved at ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function saveSettingsAtOnce(source) {
    if (!settingsLoaded) return;
    quietSettingsSave = source;
    if (source === "preferences") setPageSaveStatus("settingsStatus", "Saving…");
    if (!send("SaveSettings", settingsPayload())) {
        quietSettingsSave = "";
        setPageSaveStatus("settingsStatus", "Unable to contact Maestro.");
    }
}
SETTINGS_CONTROLS.forEach(id => $(id).addEventListener("change", () => saveSettingsAtOnce(id === "ascsSounds" ? "sounds" : "preferences")));

// The other pages that keep a setting here.
document.querySelectorAll("[data-pref-go]").forEach(button => button.addEventListener("click", () => {
    const [view, part] = button.dataset.prefGo.split(":");
    navigate(view);
    if (view === "games" && part) gamesSections.show(part);
    if (view === "dashboard" && part) systemSections.show(part);
    if (part === "today") openTodaySettings();
}));

document.querySelectorAll("[data-window-action]").forEach(button => {
    button.addEventListener("click", () => {
        send("WindowAction", button.dataset.windowAction);
    });
});

window.addEventListener("focus", () => {
    flushNotices();
    if (!$("confirmDialog").hidden || !$("launcher").hidden || !$("helpDialog").hidden) return;
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
    const query = $("notesFilter").value;
    const notes = [...notesData.notes]
        .filter(note => ASCSNotes.matchesNoteQuery(note, query))
        .sort((left, right) => Number(right.pinned) - Number(left.pinned)
            || right.updated.localeCompare(left.updated));

    $("notesEmpty").hidden = notes.length > 0;
    $("notesEmpty").textContent = notesData.notes.length
        ? "No notes match this filter."
        : "Nothing captured yet. Start a note, or press Super + Shift + C in any app.";
    renderNoteTags();

    // Pinned notes first, then groups (pinned groups first), then Ungrouped.
    // While filtering, every group with a match shows open; what was left open
    // or closed is kept for later.
    const filtering = Boolean(query.trim());
    const sections = ASCSNotes.groupNotes(notes, noteGroupPrefs.pinned);
    const fragment = document.createDocumentFragment();
    if (sections.pinned.length) fragment.append(noteItems(sections.pinned, "Pinned notes"));
    sections.groups.forEach(group => fragment.append(noteGroupSection(group, filtering)));
    if (sections.ungrouped.length) {
        fragment.append(sections.groups.length
            ? noteGroupSection({ key: "", name: "Ungrouped", notes: sections.ungrouped, ungrouped: true }, filtering)
            : noteItems(sections.ungrouped, "Notes"));
    }
    list.replaceChildren(fragment);
}

function noteItems(notes, label) {
    const items = element("div", "note-items");
    items.setAttribute("role", "list");
    items.setAttribute("aria-label", label);
    items.append(...notes.map(noteListItem));
    return items;
}

function noteListItem(note) {
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
    return item;
}

// ---- Quick Notes groups (1.8.0)
// One level, from each note's optional `group`. Which groups are left closed,
// and which are pinned, is kept on this PC (not in notes.json).
const NOTE_GROUP_PREFS = "ascs.notes.groups";
const noteGroupPrefs = (() => {
    try {
        const saved = JSON.parse(localStorage.getItem(NOTE_GROUP_PREFS) || "{}") || {};
        const keys = value => new Set(Array.isArray(value) ? value.filter(key => typeof key === "string").map(ASCSNotes.groupKey) : []);
        return { collapsed: keys(saved.collapsed), pinned: keys(saved.pinned) };
    } catch {
        return { collapsed: new Set(), pinned: new Set() };
    }
})();

function saveNoteGroupPrefs() {
    try {
        localStorage.setItem(NOTE_GROUP_PREFS, JSON.stringify({ collapsed: [...noteGroupPrefs.collapsed], pinned: [...noteGroupPrefs.pinned] }));
    } catch { /* not kept */ }
}

// A group's header (open or close it, and a menu) and, when open, its notes.
// Ungrouped has no menu.
function noteGroupSection(group, filtering) {
    const key = group.ungrouped ? ":ungrouped" : group.key;
    const open = filtering || !noteGroupPrefs.collapsed.has(key);
    const section = element("section", `note-group${group.pinned ? " is-pinned" : ""}${open ? " is-open" : ""}`);
    const head = element("div", "note-group-head");
    const toggle = element("button", "note-group-toggle");
    toggle.type = "button";
    toggle.dataset.groupKey = key;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.title = open ? `Close ${group.name}` : `Open ${group.name}`;
    const chevron = svgNode("svg", { viewBox: "0 0 12 12", "aria-hidden": "true" });
    chevron.append(svgNode("path", { d: "M4.5 2.5 8 6l-3.5 3.5" }));
    const name = element("span", "note-group-name", group.name);
    if (group.pinned) name.prepend(element("span", "pin-mark", "◆ "));
    toggle.append(chevron, name, element("small", "note-group-count", String(group.notes.length)));
    toggle.addEventListener("click", () => {
        if (filtering) return;                   // a filter shows every match
        if (noteGroupPrefs.collapsed.has(key)) noteGroupPrefs.collapsed.delete(key); else noteGroupPrefs.collapsed.add(key);
        saveNoteGroupPrefs();
        renderNotesList();
        $("notesList").querySelector(`.note-group-toggle[data-group-key="${CSS.escape(key)}"]`)?.focus();
    });
    head.append(toggle);
    if (!group.ungrouped) {
        const more = element("button", "note-group-more", "⋯");
        more.type = "button";
        more.title = `${group.name}: pin, rename or delete`;
        more.setAttribute("aria-haspopup", "menu");
        more.addEventListener("click", event => {
            event.stopPropagation();
            openNoteGroupMenu(group, more);
        });
        head.append(more);
    }
    section.append(head);
    if (open) section.append(noteItems(group.notes, group.name));
    return section;
}

function openNoteGroupMenu(group, anchor) {
    const menu = $("noteGroupMenu");
    const item = (label, action, danger = false) => {
        const button = element("button", `note-group-menu-item${danger ? " is-danger" : ""}`, label);
        button.type = "button";
        button.setAttribute("role", "menuitem");
        button.addEventListener("click", () => {
            closeNoteGroupMenu();
            action();
        });
        return button;
    };
    const pinned = noteGroupPrefs.pinned.has(group.key);
    menu.replaceChildren(
        item(pinned ? "Unpin group" : "Pin group", () => {
            if (pinned) noteGroupPrefs.pinned.delete(group.key); else noteGroupPrefs.pinned.add(group.key);
            saveNoteGroupPrefs();
            renderNotesList();
        }),
        item("Rename…", () => startGroupRename(group)),
        item("Delete group…", () => deleteNoteGroup(group), true)
    );
    menu.hidden = false;                        // shown first: a hidden element has no offsetParent
    const card = menu.offsetParent || document.body;
    const box = anchor.getBoundingClientRect();
    const frame = card.getBoundingClientRect();
    menu.style.top = `${box.bottom - frame.top + 4}px`;
    menu.style.right = `${frame.right - box.right}px`;
    menu.querySelector("button")?.focus();
}

function closeNoteGroupMenu() {
    $("noteGroupMenu").hidden = true;
}

document.addEventListener("click", event => {
    if (!$("noteGroupMenu").hidden && !$("noteGroupMenu").contains(event.target)) closeNoteGroupMenu();
});
$("noteGroupMenu").addEventListener("keydown", event => {
    const items = [...$("noteGroupMenu").querySelectorAll("button")];
    const index = items.indexOf(document.activeElement);
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeNoteGroupMenu();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }
});

// Rename in place: the header's name becomes a text box. Enter keeps it, Esc
// cancels; a name another group has merges the two, after asking.
function startGroupRename(group) {
    const toggle = $("notesList").querySelector(`.note-group-toggle[data-group-key="${CSS.escape(group.key)}"]`);
    if (!toggle) return;
    const input = element("input", "note-group-rename");
    input.type = "text";
    input.maxLength = 60;
    input.value = group.name;
    input.setAttribute("aria-label", `Rename ${group.name}`);
    toggle.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = async commit => {
        if (done) return;
        done = true;
        const name = ASCSNotes.normalizeGroup(input.value);
        if (!commit || !name || name === group.name) {
            renderNotesList();
            return;
        }
        const key = ASCSNotes.groupKey(name);
        const existing = ASCSNotes.groupNames(notesData.notes).find(other => ASCSNotes.groupKey(other) === key && key !== group.key);
        if (existing && !(await confirmDialog({
            title: `Merge Into ${existing}?`,
            message: `${existing} already exists. The notes in ${group.name} join it.`,
            confirmLabel: "Merge"
        }))) {
            renderNotesList();
            return;
        }
        ASCSNotes.renameGroup(notesData.notes, group.name, existing || name);
        for (const set of [noteGroupPrefs.collapsed, noteGroupPrefs.pinned]) {
            if (set.delete(group.key)) set.add(key);
        }
        saveNoteGroupPrefs();
        renderActiveNote();
        scheduleNoteSave(false);
    };
    input.addEventListener("keydown", event => {
        if (event.key === "Enter") { event.preventDefault(); finish(true); }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
}

async function deleteNoteGroup(group) {
    const count = notesData.notes.filter(note => ASCSNotes.groupKey(note.group) === group.key).length;
    const confirmed = await confirmDialog({
        title: `Delete the ${group.name} Group?`,
        message: `Its ${count} note${count === 1 ? "" : "s"} move${count === 1 ? "s" : ""} to Ungrouped. No notes are deleted.`,
        confirmLabel: "Delete group", danger: true
    });
    if (!confirmed) return;
    ASCSNotes.deleteGroup(notesData.notes, group.name);
    noteGroupPrefs.collapsed.delete(group.key);
    noteGroupPrefs.pinned.delete(group.key);
    saveNoteGroupPrefs();
    renderActiveNote();
    scheduleNoteSave(false);
}

// The editor's Group field: suggestions from the groups in use; the change
// applies when it's committed (Enter or leaving the field), not per letter.
function commitNoteGroup() {
    const note = activeNote();
    if (!note) return;
    const name = ASCSNotes.normalizeGroup($("noteGroup").value);
    if (name === ASCSNotes.normalizeGroup(note.group)) {
        $("noteGroup").value = name;
        return;
    }
    if (name) note.group = name; else delete note.group;
    noteGroupPrefs.collapsed.delete(ASCSNotes.groupKey(name));   // show where it went
    saveNoteGroupPrefs();
    renderActiveNote();
    scheduleNoteSave(false);
}
$("noteGroup").addEventListener("change", commitNoteGroup);
$("noteGroup").addEventListener("keydown", event => {
    if (event.key === "Enter") {
        event.preventDefault();
        commitNoteGroup();
        $("noteText").focus();
    }
});

function renderActiveNote() {
    const note = activeNote();
    $("noteTitle").value = note?.title ?? "";
    $("noteType").value = note?.type === "code" ? "code" : "note";
    if (document.activeElement !== $("noteGroup")) $("noteGroup").value = ASCSNotes.normalizeGroup(note?.group);
    $("noteGroup").disabled = !note;
    $("noteGroupNames").replaceChildren(...ASCSNotes.groupNames(notesData.notes).map(name => {
        const option = document.createElement("option");
        option.value = name;
        return option;
    }));
    $("noteText").value = note?.content ?? "";
    const isCode = note?.type === "code";
    $("noteText").classList.toggle("code-editor", isCode);
    $("noteText").spellcheck = notesSpellcheck() && !isCode;
    document.querySelector(".editor-card").dataset.kind = isCode ? "code" : "note";
    const fills = ASCSNotes.fillsPlaceholders(note);
    $("noteFillButton").classList.toggle("is-on", Boolean(note) && fills);
    $("noteFillButton").disabled = !note;
    $("noteFillButton").title = fills
        ? "Insert a placeholder. They're filled in when this note is pasted or copied from the palette."
        : "Insert a placeholder. This note is pasted exactly as written until filling is turned on.";
    $("noteFillToggle").checked = Boolean(note) && fills;
    $("noteFillHint").textContent = isCode
        ? "Off by default for code notes, so braces paste exactly"
        : "From the palette: Alt + Enter, or Super + Shift + P";
    if (!note) closePlaceholderMenu();
    if ((note?.id ?? null) !== noteModeFor) {
        noteModeFor = note?.id ?? null;
        noteMode = ASCSNotes.openingMode(note);
    }
    updateNotePreview();
    updateWordCount();
    $("pinNoteButton").setAttribute("aria-pressed", String(Boolean(note?.pinned)));
    $("pinNoteButton").textContent = note?.pinned ? "Unpin" : "Pin";
    $("copySnippetButton").hidden = !note;
    $("deleteNoteButton").disabled = !note;
    $("noteTitle").disabled = !note;
    $("noteType").disabled = !note;
    $("noteText").disabled = !note;
    $("pinNoteButton").disabled = !note;
    $("noteUpdated").textContent = note
        ? `Updated ${new Date(note.updated).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
        : "Changes save automatically";
    renderNoteGameLink(note);
    renderNotesList();
}

function scheduleNoteSave(touchNote = true) {
    const note = activeNote();
    if (note && touchNote) note.updated = new Date().toISOString();
    renderNotesList();
    $("noteUpdated").textContent = "Changes save automatically";
    setSaveStatus("Saving…", "saving");
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
        setSaveStatus("Save failed", "error");
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
        && ["note", "code", "snippet"].includes(note.type)
        && (note.fill === undefined || typeof note.fill === "boolean")
        && (note.group === undefined || typeof note.group === "string")
        && typeof note.content === "string"
        && typeof note.pinned === "boolean"
        && typeof note.created === "string"
        && typeof note.updated === "string");
    if (!validNotes) {
        showNotice("Saved notes contain an invalid note entry.");
        return;
    }

    // 1.8.0: snippets became notes in the Code style.
    let migrated = false;
    parsed.notes.forEach(note => {
        if (note.type === "snippet") {
            note.type = "code";
            migrated = true;
        }
    });
    if (ASCSNotes.cleanGameLinks(parsed.notes)) migrated = true;
    notesData = {
        version: 2,
        activeId: typeof parsed.activeId === "string" ? parsed.activeId : null,
        notes: parsed.notes
    };
    if (migrated) scheduleNoteSave(false);
    if (!notesData.notes.some(note => note.id === notesData.activeId)) {
        notesData.activeId = notesData.notes[0]?.id ?? null;
    }
    if (recovered) showNotice("notes.json could not be read, so your notes were restored from notes.json.bak.");
    notesLoaded = true;
    renderActiveNote();
    applyPendingCaptures();
    if (newNoteWhenLoaded) {
        newNoteWhenLoaded = false;
        $("newNoteButton").click();
    } else if ($("notes").classList.contains("active")) {
        requestAnimationFrame(() => focusPrimaryInput("notes"));
    }
}

function handleNoteInput() {
    const note = activeNote();
    if (!note) return;
    note.title = $("noteTitle").value;
    note.content = $("noteText").value;
    updateWordCount();
    scheduleNoteSave();
}

// Set by Ctrl + N before the notes have loaded: the note is made once they arrive.
let newNoteWhenLoaded = false;

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
$("notesFilter").addEventListener("input", () => renderNoteFind());
$("notesFilter").addEventListener("keydown", event => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === "Enter") {
        event.preventDefault();
        stepNoteFind(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape" && $("notesFilter").value) {
        event.preventDefault();
        event.stopPropagation();
        $("notesFilter").value = "";
        $("notesFilter").dispatchEvent(new Event("input"));
    }
});
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
        showToast("Copied, as written.");
    } catch (error) {
        showToast(`Unable to copy: ${error.message}`);
    }
});
// ---- the placeholder menu: insert at the cursor instead of memorizing
// them, with a live example of each; filling is switched at the bottom.
function renderPlaceholderItems() {
    const container = $("placeholderItems");
    container.replaceChildren();
    let group = "";
    ASCSNotes.PLACEHOLDER_MENU.forEach(item => {
        if (item.group !== group) {
            group = item.group;
            container.append(element("p", "placeholder-group", group));
        }
        const button = element("button", "placeholder-item");
        button.type = "button";
        button.setAttribute("role", "menuitem");
        const example = /^\{(ask|clipboard|cursor)/.test(item.text) ? (item.note || "") : ASCSNotes.fillPlaceholders(item.text);
        button.append(element("span", "", item.label), element("code", "", item.text), element("small", "", example));
        if (item.note) button.title = item.note;
        button.addEventListener("click", () => insertPlaceholder(item));
        container.append(button);
    });
}

function openPlaceholderMenu() {
    if (!activeNote()) return;
    renderPlaceholderItems();
    $("placeholderMenu").hidden = false;
    $("noteFillButton").setAttribute("aria-expanded", "true");
    $("placeholderItems").querySelector(".placeholder-item")?.focus();
}

function closePlaceholderMenu(focusButton = false) {
    if ($("placeholderMenu").hidden) return;
    $("placeholderMenu").hidden = true;
    $("noteFillButton").setAttribute("aria-expanded", "false");
    if (focusButton) $("noteFillButton").focus();
}

function insertPlaceholder(item) {
    const note = activeNote();
    if (!note) return;
    closePlaceholderMenu();
    if (noteMode !== "edit") {
        noteMode = "edit";
        updateNotePreview();
    }
    const editor = $("noteText");
    const start = editor.selectionStart ?? editor.value.length;
    editor.setRangeText(item.text, start, editor.selectionEnd ?? start, "end");
    editor.focus();
    if (item.select) editor.setSelectionRange(start + item.select[0], start + item.select[1]);
    if (!ASCSNotes.fillsPlaceholders(note)) {
        note.fill = true;
        showToast("Filling placeholders is now on for this note.");
    }
    handleNoteInput();
    renderActiveNote();
    if (item.select) editor.setSelectionRange(start + item.select[0], start + item.select[1]);
    else editor.setSelectionRange(start + item.text.length, start + item.text.length);
}

$("noteFillButton").addEventListener("click", () => {
    if ($("placeholderMenu").hidden) openPlaceholderMenu();
    else closePlaceholderMenu();
});
$("noteFillToggle").addEventListener("change", () => {
    const note = activeNote();
    if (!note) return;
    note.fill = $("noteFillToggle").checked;
    renderActiveNote();
    scheduleNoteSave();
});
$("placeholderMenu").addEventListener("keydown", event => {
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closePlaceholderMenu(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const items = [...$("placeholderMenu").querySelectorAll(".placeholder-item, #noteFillToggle")];
        const index = items.indexOf(document.activeElement);
        items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }
});
document.addEventListener("pointerdown", event => {
    if (!$("placeholderMenu").hidden && !event.target.closest(".note-fill-wrap")) closePlaceholderMenu();
});

// Spell-check in Quick Notes (at the foot of a note, 2.0.0): on by default, and
// never in code notes. Kept on this PC.
const NOTES_SPELLCHECK = "ascs.notes.spellcheck";
// US holidays as countdowns (1.8.0), on unless turned off; kept on this PC.
const HOLIDAY_COUNTDOWNS = "ascs.holidayCountdowns";
function holidayCountdowns() {
    try { return localStorage.getItem(HOLIDAY_COUNTDOWNS) !== "0"; } catch { return true; }
}
$("holidayCountdowns").checked = holidayCountdowns();
$("holidayCountdowns").addEventListener("change", () => {
    try { localStorage.setItem(HOLIDAY_COUNTDOWNS, $("holidayCountdowns").checked ? "1" : "0"); } catch { /* not kept */ }
    if (almanacState.settings) renderAlmanac();
    if (typeof renderCalendar === "function") renderCalendar();
});

function notesSpellcheck() {
    try { return localStorage.getItem(NOTES_SPELLCHECK) !== "0"; } catch { return true; }
}
$("notesSpellcheck").checked = notesSpellcheck();
$("notesSpellcheck").addEventListener("change", () => {
    try { localStorage.setItem(NOTES_SPELLCHECK, $("notesSpellcheck").checked ? "1" : "0"); } catch { /* not kept */ }
    renderActiveNote();
});

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingNotes();
    globalThis.syncSystemView?.();
});
window.addEventListener("blur", flushPendingNotes);

function handleWebMessage(event) {
    let data = event.data;
    if (typeof data === "string" && data.startsWith("ALMANAC\n")) {
        const [, kind, ...rest] = data.split("\n");
        handleAlmanacFeed(kind, rest.join("\n"));
        return;
    }
    if (typeof data === "string" && data.startsWith("WEATHER\n")) {
        handleWeather(data.slice(8));
        return;
    }
    if (typeof data === "string" && data.startsWith("COVER\n")) {
        const [, id, ...rest] = data.split("\n");
        handleCoverMessage(id, rest.join("\n"));
        return;
    }
    if (typeof data === "string" && data.startsWith("ICS\n")) {
        const [, fileName, ...rest] = data.split("\n");
        handleIcsFile(fileName, rest.join("\n"));
        return;
    }
    if (typeof data === "string" && data.startsWith("CAL\n")) {
        const [, id, status, etag, ...rest] = data.split("\n");
        handleCalReply(id, status, etag, rest.join("\n"));
        return;
    }
    if (typeof data === "string" && data.startsWith("SOUND\n")) {
        const [, id, ...rest] = data.split("\n");
        handleSoundBytes(id, rest.join("\n"));
        return;
    }
    if (typeof data === "string" && data.startsWith("RAIMG\n")) {
        const [, token, ...rest] = data.split("\n");
        handleRaImage(token, rest.join("\n"));
        return;
    }
    if (typeof data === "string" && data.startsWith("RA\n")) {
        const [, kind, ...rest] = data.split("\n");
        if (kind === "summary" || kind === "recent") {
            gamesState.ra[kind] = rest.join("\n");
            gamesState.ra.state = "ok";
            setTimeout(renderHomeUnlocks);
            gamesState.ra.updatedAt = Date.now();
            renderAchievements();
        } else if (/^game:[1-9]\d{0,8}$/.test(kind)) {
            const games = gamesState.ra.games;
            games.delete(Number(kind.slice(5)));
            games.set(Number(kind.slice(5)), rest.join("\n"));
            while (games.size > 30) games.delete(games.keys().next().value);
            gamesState.ra.gameErrors.delete(Number(kind.slice(5)));
            renderAchievements();
        } else if (kind === "unlocks") {
            gamesState.ra.unlocks = rest.join("\n");
            gamesState.ra.unlocksError = "";
            renderAchievements();
        } else if (kind === "awards") {
            gamesState.ra.awards = rest.join("\n");
            gamesState.ra.awardsError = "";
            renderAchievements();
        }
        return;
    }
    if (typeof data === "string" && data.startsWith("LOG\n")) {
        const [, source, status, ...rest] = data.split("\n");
        handleLogMessage(source, status, rest.join("\n"));
        return;
    }
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
                showNotice("notes.json changed outside Maestro, but you have unsaved edits; keeping your edits.");
                break;
            }
            if (data.external === true) showNotice("Notes reloaded because notes.json changed outside Maestro.");
            loadNotes(data.data, data.recovered === true);
            refreshGameNotes();
            break;
        case "windowShown":
            windowIsHidden = false;
            swingMark();
            globalThis.syncSystemView?.();
            break;
        case "windowHidden":
            windowIsHidden = true;
            prepareMark();
            globalThis.syncSystemView?.();
            break;
        case "testBuild":
            isTestBuild = true;
            renderTopStatus();
            break;
        case "resume": {
            // ASCS was re-shown on the view that was already open.
            const view = document.querySelector(".view.active")?.id ?? "home";
            if (view === "home" || view === "dashboard") send("GetMetrics", view);
            if (view === "notes" && !notesLoaded) send("GetNotes");
            if (view === "home") {
                advanceAlmanac();
                preloadGames();
                startHomePolling();
            }
            globalThis.syncSystemView?.();
            if (!$("powerTray").hidden) refreshPowerTray();
            if (view === "sounds") openSoundsView();
            if (view === "calendar") openCalendarView();
            if (view === "games") startGamesPolling();
            if (view === "commands") startRunningPolling();
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
                setSaveStatus("All changes saved", "saved");
            } else {
                setSaveStatus("Changes pending", "saving");
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
            renderQuickActions();
            if (!$("launcher").hidden) renderLauncherResults();
            break;
        case "commandsSaved":
            commandsDirty = false;
            renderCommandEditor(true);
            $("commandsStatus").textContent = data.message || "Custom commands saved.";
            if (pendingKeySelection) keymapSelected = pendingKeySelection;
            pendingKeySelection = null;
            renderKeymap();
            setCommandsNotice(data.message || "Saved.");
            showToast(data.message || "Custom commands saved.");
            break;
        case "workspaces":
            savedWorkspaces = Array.isArray(data.items) ? data.items : [];
            renderWorkspaceManager(data.monitors);
            renderHomeWorkspaces();
            renderQuickActions();
            if (!$("launcher").hidden) renderLauncherResults();
            break;
        case "windows":
            launcherWindows = Array.isArray(data.items) ? data.items : [];
            if (!$("launcher").hidden) renderLauncherResults();
            renderWorkspaceManager();
            break;
        case "launchRules":
            launchRules = Array.isArray(data.items) ? data.items.filter(item => item && typeof item.path === "string") : [];
            renderWorkspaceManager();
            break;
        case "browseResult":
            applyBrowseResult(data.row, data.path);
            break;
        case "quickActions":
            quickActionIds = Array.isArray(data.items) ? data.items.filter(id => typeof id === "string") : null;
            renderQuickActions();
            break;
        case "notice":
            if (typeof data.message === "string") showNotice(data.message);
            break;
        case "windowMinimized":
            windowIsMinimized = data.minimized === true;
            globalThis.syncSystemView?.();
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
        case "weatherSettings":
            weatherState.enabled = data.enabled === true;
            $("weatherEnabled").checked = weatherState.enabled;
            $("weatherEnabled").disabled = false;
            if (!weatherState.enabled) weatherState.data = null;
            weatherState.error = typeof data.message === "string" ? data.message.slice(0, 200) : "";
            renderHomeWeather();
            break;
        case "homeStats":
            renderHomeStats(data);
            break;
        case "timerDone":
            renderHomeTimer();
            break;
        case "almanac":
            loadAlmanacSettings(data);
            break;
        case "signInHistory":
            renderSignInHistory(data.items);
            break;
        case "games":
            gamesState.items = Array.isArray(data.items) ? data.items.filter(game =>
                game && typeof game.id === "string" && typeof game.title === "string" && typeof game.emulator === "string"
                && Number.isFinite(game.seconds)) : [];
            gamesState.loaded = true;
            gamesState.coversEnabled = data.covers === true;
            $("showCovers").checked = gamesState.coversEnabled;
            renderGames();
            renderNowPlaying();
            if (!$("launcher").hidden && launcherMode.startsWith("games:")) renderLauncherResults();
            break;
        case "gamesLive":
            renderGamesLive(data);
            break;
        case "gameDetails":
            if (typeof data.id === "string" && Array.isArray(data.fields)) {
                gamesState.details.set(data.id, {
                    fields: data.fields.filter(pair => Array.isArray(pair) && pair.length === 2
                        && typeof pair[0] === "string" && typeof pair[1] === "string").slice(0, 12),
                    canShow: data.canShow === true,
                    showLabel: typeof data.showLabel === "string" ? data.showLabel : "Show file"
                });
                if (gamesState.openId === data.id) renderGameDetail();
            }
            break;
        case "controllerInput":
            renderControllerInput(data);
            break;
        case "powerArmed":
            handlePowerArmed(data);
            break;
        case "powerPending":
            if (typeof data.action === "string" && Number.isFinite(data.seconds)) showPowerBanner(data.action, data.seconds);
            break;
        case "powerHeld":
            if (typeof data.action === "string") showPowerHeld(data.action, data.apps);
            break;
        case "powerCanceled":
        case "powerDone":
            hidePowerBanner();
            if (typeof data.message === "string" && data.message) showNotice(data.message);
            break;
        case "recycleBin":
            renderRecycleBin(data);
            break;
        case "audioDevices":
            renderAudioDevices(data);
            break;
        case "running":
            if (data.apps && typeof data.apps === "object") setRunningApps(data.apps);
            break;
        case "gameSettings":
            loadGameSettings(data);
            break;
        case "calendarState":
            handleCalendarState(data);
            break;
        case "soundLibrary":
            handleSoundLibrary(data);
            break;
        case "windowsSounds":
            handleWindowsSounds(data);
            break;
        case "startupSounds":
            handleStartupSounds(data);
            break;
        case "soundsDeleted":
            handleSoundsDeleted(data);
            break;
        case "soundSaved":
            handleSoundSaved(data);
            break;
        case "soundMatched":
            handleSoundMatched(data);
            break;
        case "raPicture":
            if (typeof data.message === "string") setPageSaveStatus("gamesStatus", data.message);
            break;
        case "gameSettingsSaved":
            setPageSaveStatus("gamesStatus", savedAtNow());
            gamesState.covers.clear();
            gamesState.requested.clear();
            break;
        case "raExtra":
            // A game or the recent unlocks couldn't be fetched (1.9.0).
            if (typeof data.kind === "string" && typeof data.message === "string") {
                if (data.kind === "unlocks") gamesState.ra.unlocksError = data.message;
                else if (data.kind === "awards") gamesState.ra.awardsError = data.message;
                else if (/^game:\d*$/.test(data.kind)) gamesState.ra.gameErrors.set(Number(data.kind.slice(5)) || gamesState.ra.openGame, data.message);
                renderAchievements();
            }
            break;
        case "retroAchievements":
            gamesState.ra.state = typeof data.state === "string" ? data.state : "off";
            gamesState.ra.message = typeof data.message === "string" ? data.message : "";
            if (gamesState.ra.state === "loading") {
                gamesState.ra.summary = "";
                gamesState.ra.recent = "";
            }
            renderAchievements();
            break;
        case "almanacSaved":
            setAlmanacStatus(typeof data.message === "string" ? data.message : "Saved.");
            $("calCountdownDialog").hidden = true;
            break;
        case "settingsSaved":
            if (pendingKeySelection) keymapSelected = pendingKeySelection;
            pendingKeySelection = null;
            if (pendingHotkeys) updateShortcutReference(pendingHotkeys);
            pendingHotkeys = null;
            savedDriveLetters = $("driveLetters").value;
            globalThis.drivesSaved?.();
            setCommandsNotice(data.message || "Saved.");
            // Saved as it changed: a quiet word where it changed, not a toast each time.
            if (quietSettingsSave === "preferences") setPageSaveStatus("settingsStatus", savedAtNow());
            else if (quietSettingsSave === "sounds") showToast("Maestro sounds saved.");
            else showToast(data.message || "Preferences saved.");
            quietSettingsSave = "";
            break;
        case "error":
            if (data.scope === "notes") {
                pendingSaveData.shift();
                setSaveStatus("Save failed", "error");
            }
            if (data.scope === "games") {
                setPageSaveStatus("gamesStatus", typeof data.message === "string" ? data.message : "Setup could not be saved.");
            }
            if (data.scope === "almanac") {
                setAlmanacStatus(typeof data.message === "string" ? data.message : "The almanac could not be saved.");
            }
            if (data.scope === "settings") {
                globalThis.drivesSaveFailed?.(data.message);
                quietSettingsSave = "";
            }
            if (data.scope === "commands" || data.scope === "settings") {
                pendingHotkeys = null;
                pendingKeySelection = null;
                if ($("commands").classList.contains("active")) setCommandsNotice(typeof data.message === "string" ? data.message : "That couldn't be saved.");
            }
            if (data.scope === "commands") {
                $("commandsStatus").textContent = typeof data.message === "string" ? data.message : "Custom commands could not be saved.";
            } else if ($("settings")?.classList.contains("active")) {
                setPageSaveStatus("settingsStatus", typeof data.message === "string" ? data.message : "Preferences could not be saved.");
            }
            showToast(typeof data.message === "string" ? data.message : "An error occurred.");
            break;
    }
}

// AHK answers Ready at once, which can be before the page's later scripts have
// run, and handling a reply then calls functions that don't exist yet. Replies
// wait, in order, until every script has run.
let earlyMessages = [];
window.chrome?.webview?.addEventListener("message", event => {
    if (earlyMessages) earlyMessages.push(event);
    else handleWebMessage(event);
});
document.addEventListener("DOMContentLoaded", () => {
    const waiting = earlyMessages;
    earlyMessages = null;
    waiting.forEach(handleWebMessage);
}, { once: true });

function loadSettings(data) {
    $("searchTemplate").value = typeof data.searchTemplate === "string" ? data.searchTemplate : "";
    $("claudeShortcut").value = typeof data.claudeShortcut === "string" ? data.claudeShortcut : "";
    $("powerDelay").value = [0, 5, 30].includes(data.powerDelay) ? String(data.powerDelay) : "5";
    $("ascsSounds").value = ["off", "start", "show"].includes(data.ascsSounds) ? data.ascsSounds : "show";
    $("driveLetters").value = Array.isArray(data.drives) ? data.drives.join(", ") : "";
    savedDriveLetters = $("driveLetters").value;
    $("snapGap").value = String(data.snapGap ?? 0);
    $("snapGapValue").value = `${$("snapGap").value} px`;
    $("snapGapValue").textContent = `${$("snapGap").value} px`;
    $("preserveWindowSize").checked = data.preserveSize === true;
    const hotkeys = data.hotkeys && typeof data.hotkeys === "object" ? data.hotkeys : {};
    updateShortcutReference(hotkeys);
    settingsLoaded = true;
    SETTINGS_CONTROLS.forEach(id => { $(id).disabled = false; });
}

function updateShortcutReference(hotkeys) {
    currentHotkeys = { ...currentHotkeys, ...hotkeys };
    Object.keys(currentHotkeys).forEach(key => {
        if (typeof currentHotkeys[key] !== "string") delete currentHotkeys[key];
        else currentHotkeys[key] = currentHotkeys[key].toLowerCase();
    });
    renderKeymap();
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

function updateMetrics(data) {
    setHomeValue($("cpu"), data.cpu);
    setHomeValue($("ram"), data.ram);
    setHomeValue($("homeCpu"), data.cpu);
    setHomeValue($("homeRam"), data.ram);
    setProgressBar($("homeCpuBar"), data.cpu);
    setProgressBar($("homeRamBar"), data.ram);
    $("ramDetail").textContent = homeCapacity(data.ramUsed, data.ramTotal);
    $("homeRamDetail").textContent = homeCapacity(data.ramUsed, data.ramTotal);
    renderDrives(data.drives);
    updateHardware(data.hardware);
    updateSystemStatus(data);
    renderHistory(data.history, data);
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
    launch: "Opened", workspace: "Arrangement", note: "Notes", snippet: "Pasted",
    file: "Explorer", command: "Custom", search: "Search", error: "Problem", system: "Maestro"
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

// ------------------------------------------------------------ appearance

const TEXT_SIZE_KEY = "maestro.textSize";
const LOGO_SWING_KEY = "maestro.logoSwing";
function readAppearance(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}
function keepAppearance(key, value) {
    try { localStorage.setItem(key, value); } catch { /* not kept */ }
}

function applyTextSize(size) {
    document.documentElement.style.setProperty("--text-scale", String(MaestroAppearance.textSize(size) / 100));
}

// The page loads while the window is hidden, so the arm swings when it opens,
// from its rest.
let markHasSwung = false;
let windowIsHidden = true;
let windowIsMinimized = false;
const markArm = () => document.querySelector(".brand-mark .mark-arm");
const markMotionOff = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const markSwingDue = () => !markMotionOff()
    && MaestroAppearance.shouldSwing(MaestroAppearance.swingMode(readAppearance(LOGO_SWING_KEY)), markHasSwung);

// While hidden: a swing cut short goes back to rest, out of sight.
function prepareMark() {
    markArm()?.classList.remove("is-swinging", "is-previewing");
}

// Starts on the next frame, so it doesn't run before the opened window can draw.
function swingMark() {
    if (!markSwingDue()) return;
    markHasSwung = true;
    let started = false;
    const start = () => {
        if (started) return;
        started = true;
        const arm = markArm();
        if (!arm || windowIsHidden) return;
        arm.classList.remove("is-previewing");
        arm.classList.add("is-swinging");
    };
    requestAnimationFrame(() => requestAnimationFrame(start));
    setTimeout(start, 120);     // no frames come while nothing is drawing
}

function previewMarkSwing() {
    const arm = markArm();
    if (!arm || markMotionOff()) return;
    arm.classList.remove("is-swinging", "is-previewing");
    void arm.getBoundingClientRect();       // lets the animation start over
    arm.classList.add("is-previewing");
}

markArm()?.addEventListener("animationend", event => {
    event.currentTarget.classList.remove("is-swinging", "is-previewing");
});
prepareMark();

$("textSize").value = String(MaestroAppearance.textSize(readAppearance(TEXT_SIZE_KEY)));
applyTextSize($("textSize").value);
$("textSize").addEventListener("change", () => {
    keepAppearance(TEXT_SIZE_KEY, $("textSize").value);
    applyTextSize($("textSize").value);
});

$("logoSwing").value = MaestroAppearance.swingMode(readAppearance(LOGO_SWING_KEY));
$("logoSwing").addEventListener("change", () => {
    keepAppearance(LOGO_SWING_KEY, $("logoSwing").value);
    if ($("logoSwing").value !== "never") previewMarkSwing();      // so you can see what you chose
});

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
        $("commandsStatus").textContent = "Unable to contact Maestro.";
    }
});

// ------------------------------------------------------------ title bar

$("titlebarCommand").addEventListener("click", () => openLauncher("all"));

// Clock and date in the title bar.
function updateClock() {
    const now = new Date();
    $("topClock").textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    $("topDate").textContent = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    $("topClock").dateTime = now.toISOString();
}
setInterval(updateClock, 15000);

// What needs attention (2.0.0): nothing shows while all is well. Anything that
// needs you becomes a button with a list, and each item offers the next step.
// MaestroAttention decides what's listed; this draws it, as text.
let attentionStreaks = {};
let attentionSignature = "[]";
let resourceAttention = [];
const dismissedAttention = new Set();
let unseenPageErrors = 0;
let lastPageError = "";
let isTestBuild = false;

function updateSystemStatus(data) {
    const reading = MaestroAttention.fromMetrics(data, attentionStreaks, formatCapacity);
    attentionStreaks = reading.streaks;
    // Readings can come every second: an open list is only redrawn if it changed.
    const signature = JSON.stringify(reading.items);
    if (signature === attentionSignature) return;
    attentionSignature = signature;
    resourceAttention = reading.items;
    renderTopStatus();
}

function attentionItems() {
    const page = unseenPageErrors ? [MaestroAttention.pageError(unseenPageErrors, lastPageError)] : [];
    return [...page, ...resourceAttention];
}

function renderTopStatus() {
    const all = attentionItems();
    MaestroAttention.forgetCleared(dismissedAttention, all);
    const shown = MaestroAttention.visible(all, dismissedAttention);
    const button = $("attentionButton");
    button.hidden = !shown.length;
    button.dataset.tone = MaestroAttention.tone(shown);
    $("attentionLabel").textContent = MaestroAttention.label(shown.length);
    $("testBuildChip").hidden = !isTestBuild;
    if (!shown.length) toggleAttention(false);
    $("attentionList").replaceChildren(...shown.map(attentionRow));
}

const ATTENTION_ACTIONS = {
    system: {
        label: "Open System",
        run: () => {
            navigate("dashboard");
            systemSections.show("live");
        }
    },
    log: {
        label: "View log",
        run: () => {
            unseenPageErrors = 0;
            renderTopStatus();
            showLogs();
        }
    }
};

function attentionRow(item) {
    const row = element("div", `attention-row is-${item.tone === "burgundy" ? "burgundy" : "gold"}`);
    const icon = $("attentionButton").querySelector("svg").cloneNode(true);
    const text = element("div", "attention-text");
    text.append(element("strong", "", item.title));
    if (item.detail) text.append(element("small", "", item.detail));
    row.append(icon, text);
    const action = ATTENTION_ACTIONS[item.action];
    if (action) {
        const go = element("button", "secondary", action.label);
        go.type = "button";
        go.addEventListener("click", () => {
            toggleAttention(false);
            action.run();
        });
        row.append(go);
    }
    return row;
}

function toggleAttention(show = $("attentionPanel").hidden) {
    const panel = $("attentionPanel");
    const button = $("attentionButton");
    if (!show) {
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
        return;
    }
    const box = button.getBoundingClientRect();
    panel.style.top = `${Math.round(box.bottom + 10)}px`;
    panel.style.right = `${Math.max(16, Math.round(innerWidth - box.right))}px`;
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => panel.focus());
}

$("attentionButton").addEventListener("click", () => toggleAttention());
$("attentionDismissAll").addEventListener("click", () => {
    attentionItems().forEach(item => dismissedAttention.add(item.key));
    if (unseenPageErrors) {
        unseenPageErrors = 0;
    }
    renderTopStatus();
    $("attentionButton").focus();
});
$("attentionPanel").addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    toggleAttention(false);
    $("attentionButton").focus();
});
document.addEventListener("pointerdown", event => {
    if (!$("attentionPanel").hidden && !event.target.closest("#attentionPanel, #attentionButton")) toggleAttention(false);
});


// ------------------------------------------------------------ keyboard map
// An ISO 100% keyboard showing which keys are taken with Super, or with
// Super + Shift. Hover or focus a key for its command; hold Shift while the
// Super Commands view is open to preview the Shift layer.

const SVG_NS = "http://www.w3.org/2000/svg";
const KEY_UNIT = 48;
const KEY_GAP = 4;
let keymapLayer = "super";
let keymapShiftHeld = false;
let keymapSelected = null;          // the key shown in the panel beside the map
let settingsLoaded = false;
let pendingHotkeys = null;          // applied once the backend has saved them
let savedDriveLetters = "";
let pendingKeySelection = null;

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

// Room for a key's text: its width, less the 8 before the text, the gap between
// keys and a little air on the right.
const keyTextRoom = key => key.w * KEY_UNIT - 12;
const keyTextMeasure = document.createElement("canvas").getContext("2d");

// Text wider than its key is drawn smaller, so any name fits: custom commands
// can be called anything. Measured from the styles, so it works on a hidden page.
function fitKeyText(svg) {
    svg.querySelectorAll(".km-label, .km-caption").forEach(text => {
        const style = getComputedStyle(text);
        keyTextMeasure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const width = keyTextMeasure.measureText(text.textContent).width;
        const room = Number(text.dataset.room);
        if (width > room) text.style.fontSize = `${parseFloat(style.fontSize) * room / width}px`;
    });
}

function activeKeymapLayer() {
    return keymapShiftHeld ? "shift" : keymapLayer;
}

// Macro keys whose app shows a running dot, and the latest running state.
const KEYMAP_RUNNING_APPS = { m4: "pso", m5: "retroarch", m6: "dolphin", m7: "pcsx2" };
let runningApps = {};

function renderKeymap() {
    const container = $("keymap");
    if (!container || !globalThis.ASCSKeymap) return;
    const layout = ASCSKeymap.isoFullSizeLayout();
    const bindings = ASCSKeymap.buildBindings(currentHotkeys, customCommands);
    const layer = activeKeymapLayer();
    const layerBindings = bindings[layer];
    const chord = layer === "shift" ? "Super + Shift + " : "Super + ";
    const selectedId = keymapSelected ?? (currentHotkeys.notes || "q");
    const focusedKey = document.activeElement?.closest?.(".km-key")?.dataset.key;

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
                : key.special === "macro" ? "planned"
                    : layer === "shift" && isModifier ? "modifier" : "free";
        const group = svgElement("g", {
            class: `km-key${key.id === selectedId ? " is-selected" : ""}`,
            "data-key": key.id,
            "data-cat": category,
            tabindex: binding || key.special || /^[a-z]$/.test(key.id) ? 0 : -1
        });
        group.addEventListener("click", () => selectKey(key.id));
        group.addEventListener("keydown", event => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            selectKey(key.id);
            $("keyDetail").querySelector("input:not([hidden]), select")?.closest("label:not([hidden])")?.querySelector("input, select")?.focus();
        });
        if (keymapQuery) {
            const haystack = binding ? `${chord}${key.label} ${binding.title} ${binding.desc}`.toLocaleLowerCase() : "";
            group.setAttribute("data-match", String(Boolean(binding) && haystack.includes(keymapQuery)));
        }
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
        label.dataset.room = keyTextRoom(key);
        group.append(label);
        const specialCaption = key.special === "super" ? "Hold" : key.special === "macro" ? key.caption : "";
        if (!binding && specialCaption) {
            const caption = svgElement("text", {
                x: key.x * KEY_UNIT + 8,
                y: (key.y + key.h) * KEY_UNIT - 10,
                class: "km-caption"
            });
            caption.textContent = specialCaption;
            caption.dataset.room = keyTextRoom(key);
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
            caption.dataset.room = keyTextRoom(key);
            group.append(caption);
            const title = svgElement("title");
            title.textContent = `${chord}${key.label}: ${binding.title}`;
            group.append(title);
            group.setAttribute("aria-label", `${chord}${key.label}: ${binding.title}`);
            group.setAttribute("role", "img");
        }
        // Running indicator: a green dot on M4-M7 while that app runs
        // (polled only while Super Commands is open).
        const runningApp = KEYMAP_RUNNING_APPS[key.id];
        if (runningApp && runningApps[runningApp]) {
            group.append(svgElement("circle", {
                cx: (key.x + key.w) * KEY_UNIT - 9, cy: key.y * KEY_UNIT + 10, r: 3.2, class: "km-running"
            }));
            group.dataset.running = "true";
        }
        const describe = () => showKeymapDetail(key, binding, chord, bindings.passthrough[key.id], layer);
        group.addEventListener("mouseenter", describe);
        group.addEventListener("focus", describe);
        svg.append(group);
    });
    container.replaceChildren(svg);
    fitKeyText(svg);
    if (focusedKey) svg.querySelector(`[data-key="${CSS.escape(focusedKey)}"]`)?.focus({ preventScroll: true });
    container.dataset.layer = layer;
    container.classList.toggle("is-searching", Boolean(keymapQuery));
    document.querySelectorAll(".keymap-layer").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.layer === layer));
    });
    $("keymapDetail").dataset.summary = layer === "shift"
        ? `${used} keys have a Super + Shift action. Other letters keep their Super action; macro keys have none with Shift.`
        : `${used} keys are in use. Click a key to see or change it; hold Shift for the second layer.`;
    $("keymapDetail").textContent = $("keymapDetail").dataset.summary;
    // commandsview.js loads after this script's first drawing.
    globalThis.renderCommandLists?.();
    globalThis.renderKeyDetail?.();
}

function showKeymapDetail(key, binding, chord, passthrough, layer) {
    const detail = $("keymapDetail");
    detail.replaceChildren();
    const keys = document.createElement("strong");
    keys.textContent = `${chord}${key.label}`;
    const text = document.createElement("span");
    if (binding) {
        const running = KEYMAP_RUNNING_APPS[key.id] && runningApps[KEYMAP_RUNNING_APPS[key.id]] ? " Running now." : "";
        text.textContent = ` · ${binding.title}. ${binding.desc}${running}`;
    } else if (key.note) {
        keys.textContent = key.label;
        text.textContent = ` · ${key.note.replace(/^[^:]+:\s*/, "")}`;
    } else if (passthrough && layer === "super") {
        text.textContent = ` · Free in Maestro; passes ${passthrough} through to Windows.`;
    } else {
        text.textContent = layer === "shift" ? " · No Shift action; behaves like the Super layer." : " · Free.";
    }
    detail.append(keys, text);
    detail.title = detail.textContent;
}

$("keymap").addEventListener("mouseleave", () => {
    $("keymapDetail").textContent = $("keymapDetail").dataset.summary || "";
    $("keymapDetail").title = "";
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

// ------------------------------------------------------------ quick actions (1.7.0)
// Up to six pinned palette items. ASCS stores only their ids; they resolve
// to palette items here, and run through the same validated messages.

const DEFAULT_QUICK_ACTIONS = ["launch:terminal", "launch:explorer", "view:notes", "launch:taskmanager", "launch:calculator"];
const MAX_QUICK_ACTIONS = 6;
const QUICK_ACTION_ICONS = {
    VIEW: '<path d="M4 5.5h16v13H4z"/><path d="M4 9.5h16"/>',
    APP: '<path d="m5 7 5 5-5 5m7 0h7"/>',
    FIND: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    CUSTOM: '<path d="M12 3.5 14.4 9l5.9.5-4.5 3.9 1.4 5.8L12 16.2 6.8 19.2l1.4-5.8L3.7 9.5 9.6 9z"/>',
    WORKSPACE: '<rect x="3.5" y="4.5" width="7" height="15" rx="1.5"/><rect x="13.5" y="4.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="6" rx="1.5"/>',
    CODE: '<path d="m9 8-4 4 4 4m6-8 4 4-4 4"/>',
    NOTE: '<path d="M6.5 3.75h7l4 4v12.5h-11a2 2 0 0 1-2-2v-12a2.5 2.5 0 0 1 2-2.5Z"/><path d="M13.5 4v4h4m-9 4.5h6m-6 3.5h6"/>'
};
// Specific icons for common items; anything else uses its kind's icon.
const ITEM_ICONS = {
    "view:home": '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
    "view:notes": QUICK_ACTION_ICONS.NOTE,
    "view:dashboard": '<path d="M4 19.5V12m5.3 7.5V5m5.4 14.5v-10m5.3 10V8"/>',
    "view:commands": '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 9h2m3 0h2m3 0h.01M7 13h.01m3 0h.01m3 0h.01m3 0h.01M8 16h8"/>',
    "view:games": '<path d="M7.5 8h9a4.5 4.5 0 0 1 4.3 5.8l-1 3.3a2.2 2.2 0 0 1-3.7.9L14 16h-4l-2.1 2a2.2 2.2 0 0 1-3.7-.9l-1-3.3A4.5 4.5 0 0 1 7.5 8Z"/><path d="M8 11v3m-1.5-1.5h3"/>',
    "view:logs": '<path d="M5 6.5h.01M5 12h.01M5 17.5h.01M9 6.5h10M9 12h10M9 17.5h6"/>',
    "view:settings": '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.5m0 13V21M3 12h2.5m13 0H21M5.6 5.6l1.8 1.8m9.2 9.2 1.8 1.8M5.6 18.4l1.8-1.8m9.2-9.2 1.8-1.8"/>',
    "launch:terminal": '<path d="m5 7 5 5-5 5m7 0h7"/>',
    "launch:explorer": '<path d="M3.5 7.5a2 2 0 0 1 2-2h5l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-10Z"/><path d="M3.75 10h16.5"/>',
    "launch:calculator": '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7h7m-7 5h.01m3.5 0h.01m3.5 0h.01m-7 4h.01m3.5 0h.01m3.5 0h.01"/>',
    "launch:claude": '<path d="M12 3.5v4m0 9v4M3.5 12h4m9 0h4M6 6l2.8 2.8m6.4 6.4L18 18M6 18l2.8-2.8m6.4-6.4L18 6"/>',
    "launch:taskmanager": '<path d="M4 19V5m0 14h16"/><path d="m7 15 3-4 3 2 5-6"/>',
    "launch:everything": QUICK_ACTION_ICONS.FIND,
    "launch:vivaldi": '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5S9.5 6.1 12 3.5Z"/>',
    "launch:settings": '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.5m0 13V21M3 12h2.5m13 0H21M5.6 5.6l1.8 1.8m9.2 9.2 1.8 1.8M5.6 18.4l1.8-1.8m9.2-9.2 1.8-1.8"/>',
    "launch:downloads": '<path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14"/>',
    "launch:projects": '<path d="M3.5 7.5a2 2 0 0 1 2-2h5l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-10Z"/>',
    "launch:snipping": '<circle cx="6.5" cy="7" r="2.5"/><circle cx="6.5" cy="17" r="2.5"/><path d="m8.6 8.4 11 8.1m0-9-11 8.1"/>',
    "launch:lock": '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    "launch:mute": '<path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z"/><path d="m16 9.5 5 5m0-5-5 5"/>',
    "launch:reload": '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.2h-4.2"/>'
};
let quickActionIds = null;      // null: never customized, so the defaults show

function currentQuickActionIds() {
    return Array.isArray(quickActionIds) ? quickActionIds : DEFAULT_QUICK_ACTIONS;
}

function quickActionCatalog() {
    return new Map(paletteSources("pick").map(item => [item.id, item]));
}

function iconSvg(item) {
    const paths = (item && ITEM_ICONS[item.id]) || QUICK_ACTION_ICONS[item?.badge] || QUICK_ACTION_ICONS.APP;
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}

function renderQuickActions() {
    const container = $("quickActions");
    if (!container) return;
    const catalog = quickActionCatalog();
    const ids = currentQuickActionIds();
    container.replaceChildren();

    ids.forEach(id => {
        const item = catalog.get(id);
        if (!item) return;
        const wrap = document.createElement("div");
        wrap.className = "action-card-wrap";
        const card = document.createElement("button");
        card.type = "button";
        card.className = "action-card";
        if (item.badge) card.dataset.kind = item.badge.toLowerCase();
        const icon = document.createElement("span");
        icon.className = "action-icon";
        icon.innerHTML = iconSvg(item);   // static, trusted markup only (never item text)
        const copy = document.createElement("span");
        copy.className = "action-copy";
        const title = document.createElement("strong");
        title.textContent = item.label;
        const detail = document.createElement("small");
        detail.textContent = (item.description || "").slice(0, 60);
        copy.append(title, detail);
        const arrow = document.createElement("span");
        arrow.className = "action-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = item.view ? "→" : "↗";
        card.append(icon, copy, arrow);
        card.addEventListener("click", () => runQuickAction(item));
        wrap.append(card);
        container.append(wrap);
    });
    globalThis.renderQuickActionEditor?.();
}

function runQuickAction(item) {
    if (item.mode) {
        openLauncher(item.mode);
        return;
    }
    rememberUsage(item.id);
    if (item.run) item.run();
    else if (item.view) navigate(item.view);
    else if (item.launch) send("Launch", item.launch);
}

function saveQuickActions(ids) {
    quickActionIds = ids;
    renderQuickActions();
    send("SaveQuickActions", ids.join("\n"));
}

function addQuickAction(id) {
    const ids = currentQuickActionIds();
    if (!id || id.startsWith("win:")) return;
    if (ids.includes(id)) {
        showToast("That is already a quick action.");
        return;
    }
    if (ids.length >= MAX_QUICK_ACTIONS) {
        showToast(`Quick actions hold up to ${MAX_QUICK_ACTIONS} items.`);
        return;
    }
    saveQuickActions([...ids, id]);
}

$("editQuickActions").addEventListener("click", () => {
    navigate("commands");
    commandsSections.show("quick");
});

// ------------------------------------------------------------ quick notes: tags, Read and Edit (1.7.0; 2.0.0)

// The Markdown viewer ("read") shows the note formatted; the text editor
// ("edit") shows its plain text, and Ctrl + M switches. Each note opens in the
// mode ASCSNotes.openingMode gives it, and the viewer is drawn again every time
// it's chosen, so it always shows the text as it is now.
let noteMode = "read";
let noteModeFor = null;     // the note the mode was chosen for
const noteFind = { index: 0, count: 0, key: "" };     // the filter's matches in the open note (see "finding text")

function renderNoteTags() {
    const container = $("notesTags");
    if (!container || !globalThis.ASCSNotes) return;
    const counts = ASCSNotes.tagCounts(notesData.notes).slice(0, 14);
    const active = new Set($("notesFilter").value.toLocaleLowerCase().split(/\s+/)
        .filter(term => term.startsWith("#")).map(term => term.slice(1)));
    container.replaceChildren();
    container.hidden = counts.length === 0;
    counts.forEach(({ tag, count }) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "note-tag";
        chip.setAttribute("aria-pressed", String(active.has(tag)));
        chip.textContent = `#${tag}`;
        const badge = document.createElement("small");
        badge.textContent = String(count);
        chip.append(badge);
        chip.addEventListener("click", () => toggleTagFilter(tag));
        container.append(chip);
    });
}

function toggleTagFilter(tag) {
    const terms = $("notesFilter").value.split(/\s+/).filter(Boolean);
    const term = `#${tag}`;
    const index = terms.findIndex(existing => existing.toLocaleLowerCase() === term);
    if (index >= 0) terms.splice(index, 1);
    else terms.push(term);
    $("notesFilter").value = terms.join(" ");
    renderNotesList();
    renderNoteFind();
}

function updateWordCount() {
    const note = activeNote();
    const words = note ? ASCSNotes.wordCount(note.content) : 0;
    $("noteWords").textContent = note ? `${words} ${words === 1 ? "word" : "words"}` : "";
}

// Builds the viewer with elements and textContent only; note text is never
// parsed as HTML. Links show their address on hover; Ctrl + click opens a web
// address in the browser, through AHK, which checks it again. Images show their
// alt text and are never loaded.
const isWebAddress = url => /^https?:\/\/[^\s"<>`]+$/i.test(url) && url.length <= 2048;
const INLINE_TAGS = { strong: "strong", em: "em", del: "del", mark: "mark" };

function appendInline(parent, nodes) {
    nodes.forEach(node => {
        if (node.type === "text") {
            parent.append(document.createTextNode(node.text));
        } else if (node.type === "br") {
            parent.append(document.createElement("br"));
        } else if (node.type === "code") {
            parent.append(element("code", "", node.text));
        } else if (node.type === "tag") {
            const tag = element("button", "md-tag", `#${node.text}`);
            tag.type = "button";
            tag.addEventListener("click", () => toggleTagFilter(node.text));
            parent.append(tag);
        } else if (node.type === "image") {
            const image = element("span", "md-image", node.alt || "Image");
            image.title = `Image: ${node.url} (not loaded)`;
            parent.append(image);
        } else if (node.type === "link") {
            const link = element("span", "md-link");
            const web = isWebAddress(node.url);
            link.title = web ? `${node.url}\nCtrl + click to open in your browser` : node.url;
            if (web) {
                link.classList.add("is-web");
                link.dataset.url = node.url;
            }
            appendInline(link, node.children || []);
            parent.append(link);
        } else if (INLINE_TAGS[node.type]) {
            const mark = document.createElement(INLINE_TAGS[node.type]);
            appendInline(mark, node.children || []);
            parent.append(mark);
        }
    });
}

function renderBlocks(container, blocks) {
    blocks.forEach(block => {
        let node;
        if (block.type === "pre") {
            node = element("div", "md-code");
            if (block.lang) node.append(element("span", "md-code-lang", block.lang));
            node.append(element("pre", "", block.text));
        } else if (block.type === "hr") {
            node = document.createElement("hr");
        } else if (block.type === "blockquote") {
            node = document.createElement("blockquote");
            renderBlocks(node, block.blocks);
        } else if (block.type === "ul" || block.type === "ol") {
            node = document.createElement(block.type);
            if (block.type === "ol" && block.start !== 1) node.start = block.start;
            block.items.forEach(item => {
                const li = document.createElement("li");
                if (item.task !== null) {
                    li.className = "md-task";
                    const box = document.createElement("input");
                    box.type = "checkbox";
                    box.checked = item.task;
                    box.dataset.line = String(item.line);
                    box.setAttribute("aria-label", item.task ? "Done: clear it" : "To do: tick it");
                    li.append(box);
                    if (block.type === "ul") node.classList.add("has-tasks");
                }
                const text = element("span", "md-item-text");
                appendInline(text, item.children);
                li.append(text);
                renderBlocks(li, item.blocks);
                node.append(li);
            });
        } else if (block.type === "table") {
            node = element("div", "md-table");
            const table = document.createElement("table");
            const head = document.createElement("thead");
            const headRow = document.createElement("tr");
            block.head.forEach((cell, column) => {
                const th = document.createElement("th");
                if (block.align[column]) th.style.textAlign = block.align[column];
                appendInline(th, cell);
                headRow.append(th);
            });
            head.append(headRow);
            const body = document.createElement("tbody");
            block.rows.forEach(row => {
                const tr = document.createElement("tr");
                row.forEach((cell, column) => {
                    const td = document.createElement("td");
                    if (block.align[column]) td.style.textAlign = block.align[column];
                    appendInline(td, cell);
                    tr.append(td);
                });
                body.append(tr);
            });
            table.append(head, body);
            node.append(table);
        } else if (/^h[1-6]$/.test(block.type) || block.type === "p") {
            node = document.createElement(block.type);
            appendInline(node, block.children);
        } else {
            return;
        }
        container.append(node);
    });
}

function renderMarkdown(container, blocks) {
    container.replaceChildren();
    renderBlocks(container, blocks);
    if (!blocks.length) container.append(element("p", "note-preview-empty", "Nothing to show yet."));
}

// A task box in the viewer ticks the line it came from, and saves.
$("notePreview").addEventListener("change", event => {
    const box = event.target.closest(".md-task > input[type='checkbox']");
    const note = activeNote();
    if (!box || !note) return;
    const next = ASCSNotes.toggleTask(note.content, Number(box.dataset.line));
    if (next === null) {
        updateNotePreview();
        return;
    }
    $("noteText").value = next;
    handleNoteInput();
    updateNotePreview();
    $("notePreview").querySelector(`.md-task > input[data-line="${box.dataset.line}"]`)?.focus();
});

// Ctrl + click on a web address opens it; a plain click does nothing.
$("notePreview").addEventListener("click", event => {
    const link = event.target.closest(".md-link.is-web");
    if (!link || !event.ctrlKey) return;
    event.preventDefault();
    if (send("OpenNoteLink", link.dataset.url)) showToast("Opening the link in your browser.");
});

// ---- The Markdown reference (2.0.0): each row drawn by the viewer itself.

function openMarkdownReference() {
    const rows = $("markdownRows");
    if (!rows.childElementCount) {
        rows.replaceChildren(...ASCSNotes.MARKDOWN_REFERENCE.map(([label, source]) => {
            const row = element("tr");
            const name = element("th", "", label);
            name.scope = "row";
            const typed = element("td");
            typed.append(element("pre", "md-ref-source", source));
            const shown = element("td");
            const result = element("div", "note-preview md-ref-result");
            renderMarkdown(result, ASCSNotes.parseMarkdown(source));
            result.querySelectorAll("input, button").forEach(control => { control.disabled = true; control.tabIndex = -1; });
            shown.append(result);
            row.append(name, typed, shown);
            return row;
        }));
    }
    markdownReturnFocus = document.activeElement;
    $("markdownDialog").hidden = false;
    requestAnimationFrame(() => $("markdownClose").focus());
}

function closeMarkdownReference() {
    if ($("markdownDialog").hidden) return;
    $("markdownDialog").hidden = true;
    if (markdownReturnFocus instanceof HTMLElement && markdownReturnFocus.isConnected) markdownReturnFocus.focus();
}

let markdownReturnFocus = null;
$("noteMarkdownButton").addEventListener("click", openMarkdownReference);
$("markdownClose").addEventListener("click", closeMarkdownReference);
$("markdownDialog").addEventListener("click", event => { if (event.target === $("markdownDialog")) closeMarkdownReference(); });
$("markdownDialog").addEventListener("keydown", event => {
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeMarkdownReference();
    } else if (event.key === "Tab") {
        // The dialog has one control; focus stays on it.
        event.preventDefault();
        $("markdownClose").focus();
    }
});

function updateNotePreview() {
    const note = activeNote();
    const canRead = Boolean(note) && note.type !== "code";
    const reading = canRead && noteMode === "read";
    $("noteModes").hidden = !canRead;
    $("noteReadButton").setAttribute("aria-pressed", String(reading));
    $("noteEditButton").setAttribute("aria-pressed", String(!reading));
    $("notePreview").hidden = !reading;
    $("noteText").hidden = reading;
    if (reading) renderMarkdown($("notePreview"), ASCSNotes.parseMarkdown(note.content));
    renderNoteFind();
}

// ------------------------------------------------------------ quick notes: finding text (2.0.0)
// The filter (Ctrl + F) already narrows the list to notes holding its words;
// it also marks them in the open note, with a count beside it, and Enter and
// Shift + Enter step through them while the focus stays in the filter. The
// viewer marks text with the CSS Custom Highlight API, which leaves the page
// as it is (task boxes and links keep working). A text box can't color its own
// text, so the editor gets a copy of its text behind it, transparent but for
// the marks, laid out and scrolled to match.
const NOTE_FIND_MIRRORED = ["box-sizing", "padding-top", "padding-left", "padding-bottom",
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width", "border-radius",
    "font-family", "font-size", "font-weight", "font-style", "font-stretch", "font-variant-ligatures", "font-feature-settings",
    "line-height", "letter-spacing", "word-spacing", "tab-size", "text-indent", "text-transform",
    "white-space", "overflow-wrap", "word-break", "direction"];

function viewerFindRanges(query) {
    const ranges = [];
    const walker = document.createTreeWalker($("notePreview"), NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node && ranges.length < 1000; node = walker.nextNode()) {
        ASCSNotes.findMatches(node.data, query, 1000 - ranges.length).forEach(({ start, end }) => {
            const range = new Range();
            range.setStart(node, start);
            range.setEnd(node, end);
            ranges.push(range);
        });
    }
    return ranges;
}

function drawViewerFind(ranges) {
    if (!globalThis.CSS?.highlights || typeof Highlight !== "function") return;
    CSS.highlights.delete("note-find");
    CSS.highlights.delete("note-find-current");
    if (!ranges.length) return;
    CSS.highlights.set("note-find", new Highlight(...ranges));
    CSS.highlights.set("note-find-current", new Highlight(ranges[noteFind.index]));
}

// Returns the current match's mark, or null with nothing to mark.
function drawEditorFind(matches) {
    const text = $("noteText");
    let mirror = $("noteFindMirror");
    if (!matches.length || text.hidden) {
        mirror?.remove();
        text.classList.remove("is-finding");
        return null;
    }
    if (!mirror) {
        mirror = element("div", "note-find-mirror");
        mirror.id = "noteFindMirror";
        mirror.setAttribute("aria-hidden", "true");
        text.before(mirror);
    }
    text.classList.remove("is-finding");
    const style = getComputedStyle(text);
    NOTE_FIND_MIRRORED.forEach(name => mirror.style.setProperty(name, style.getPropertyValue(name)));
    // The text box's scrollbar narrows its lines; the copy has none, so it pads by as much.
    const scrollbar = text.offsetWidth - text.clientWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
    Object.assign(mirror.style, {
        top: `${text.offsetTop}px`, left: `${text.offsetLeft}px`,
        width: `${text.offsetWidth}px`, height: `${text.offsetHeight}px`,
        paddingRight: `${parseFloat(style.paddingRight) + scrollbar}px`,
        backgroundColor: style.backgroundColor
    });
    const value = text.value;
    const parts = [];
    let at = 0;
    matches.forEach(({ start, end }, index) => {
        parts.push(value.slice(at, start), element("mark", index === noteFind.index ? "is-current" : "", value.slice(start, end)));
        at = end;
    });
    // A text box shows the empty line after a final line break; a div needs something on it.
    const tail = value.slice(at);
    parts.push(tail.endsWith("\n") ? `${tail} ` : tail);
    mirror.replaceChildren(...parts);
    text.classList.add("is-finding");
    mirror.scrollTop = text.scrollTop;
    return mirror.querySelector("mark.is-current");
}

// `scroll` brings the current match into view. A new note, mode or query
// starts again at the first match, and scrolls to it.
function renderNoteFind(scroll = false) {
    const note = activeNote();
    const query = $("notesFilter").value.trim();
    const reading = Boolean(note) && !$("notePreview").hidden;
    const key = `${note?.id ?? ""}|${reading}|${query}`;
    if (key !== noteFind.key) {
        noteFind.key = key;
        noteFind.index = 0;
        scroll = true;
    }
    if (reading) {
        drawEditorFind([]);
        const ranges = query ? viewerFindRanges(query) : [];
        noteFind.count = ranges.length;
        noteFind.index = Math.min(noteFind.index, Math.max(0, ranges.length - 1));
        drawViewerFind(ranges);
        const current = ranges[noteFind.index];
        if (scroll && current) {
            const preview = $("notePreview");
            const box = current.getBoundingClientRect();
            const frame = preview.getBoundingClientRect();
            if (box.top < frame.top || box.bottom > frame.bottom) preview.scrollTop += box.top - frame.top - preview.clientHeight / 3;
        }
    } else {
        drawViewerFind([]);
        const matches = note && query ? ASCSNotes.findMatches($("noteText").value, query) : [];
        noteFind.count = matches.length;
        noteFind.index = Math.min(noteFind.index, Math.max(0, matches.length - 1));
        const current = drawEditorFind(matches);
        if (scroll && current) {
            const text = $("noteText");
            if (current.offsetTop < text.scrollTop || current.offsetTop + current.offsetHeight > text.scrollTop + text.clientHeight) {
                text.scrollTop = Math.max(0, current.offsetTop - text.clientHeight / 3);
                $("noteFindMirror").scrollTop = text.scrollTop;
            }
        }
    }
    const label = $("notesFindCount");
    label.hidden = !note || !query;
    label.textContent = noteFind.count ? `${noteFind.index + 1} of ${noteFind.count}` : "Not in this note";
}

function stepNoteFind(step) {
    if (!noteFind.count) return;
    noteFind.index = (noteFind.index + step + noteFind.count) % noteFind.count;
    renderNoteFind(true);
}

// The editor's copy follows its scrolling, its typing (once a frame) and its size.
let noteFindFrame = 0;
$("noteText").addEventListener("scroll", () => {
    const mirror = $("noteFindMirror");
    if (mirror) mirror.scrollTop = $("noteText").scrollTop;
});
$("noteText").addEventListener("input", () => {
    if (!$("notesFilter").value.trim() || noteFindFrame) return;
    noteFindFrame = requestAnimationFrame(() => {
        noteFindFrame = 0;
        renderNoteFind();
    });
});
new ResizeObserver(() => { if ($("notesFilter").value.trim()) renderNoteFind(); }).observe($("noteText"));

function setNoteMode(mode) {
    if (!activeNote()) return;
    noteMode = mode;
    updateNotePreview();
    focusPrimaryInput("notes");
}

$("noteReadButton").addEventListener("click", () => setNoteMode("read"));
$("noteEditButton").addEventListener("click", () => setNoteMode("edit"));
// A tag in the note filters the list, and a task box ticks; anywhere else, a
// double-click edits.
$("notePreview").addEventListener("dblclick", event => {
    if (!event.target.closest(".md-tag, .md-task > input")) setNoteMode("edit");
});

// ------------------------------------------------------------ super commands search (1.7.0)

let keymapQuery = "";

$("commandSearch").addEventListener("input", () => {
    keymapQuery = $("commandSearch").value.trim().toLocaleLowerCase();
    renderKeymap();
});
$("commandSearch").addEventListener("keydown", event => {
    if (event.key === "Escape" && $("commandSearch").value) {
        event.preventDefault();
        $("commandSearch").value = "";
        $("commandSearch").dispatchEvent(new Event("input"));
    }
});

// ------------------------------------------------------------ collapsible sidebar (1.7.0)

const SIDEBAR_KEY = "ascs.sidebar.collapsed";

function applySidebar(collapsed) {
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
    $("sidebarToggle").setAttribute("aria-pressed", String(collapsed));
    $("sidebarToggle").setAttribute("aria-label", label);
    $("sidebarToggle").title = label;
    updateTopbar();
}

function toggleSidebar() {
    const collapsed = !document.body.classList.contains("sidebar-collapsed");
    try {
        localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
    } catch {
        // Remembering the choice is a convenience only.
    }
    applySidebar(collapsed);
}

$("sidebarToggle").addEventListener("click", toggleSidebar);

// ------------------------------------------------------------ almanac (1.7.0)
// The strip beneath the Command Center title. Moon, daylight, the quote of
// the day and countdowns are worked out here; the Wikipedia feeds arrive
// from ASCS as plain strings (only when enabled) and are parsed by
// ASCSAlmanac, which keeps text and article titles only. Everything is
// rendered with textContent. The line advances when the Command Center is
// opened or ↻ is pressed, never on a timer.

const Almanac = globalThis.ASCSAlmanac;
const almanacState = {
    settings: null,
    history: [],
    holidays: [],
    featured: null,
    step: 0,
    day: ""
};

function svgNode(tag, attributes) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
}

function almanacCell(icon, title, detail) {
    const cell = document.createElement("div");
    cell.className = "alm-cell";
    const copy = document.createElement("div");
    const strong = document.createElement("strong");
    strong.append(...title);
    const small = document.createElement("small");
    small.textContent = detail;
    copy.append(strong, small);
    cell.append(icon, copy);
    return cell;
}

function formatClockTime(date) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function renderAlmanac() {
    const strip = $("homeAlmanac");
    const settings = almanacState.settings;
    if (!strip || !settings || !Almanac) return;
    const now = new Date();
    const today = now.toDateString();
    if (almanacState.day && almanacState.day !== today) {
        // A new day: yesterday's Wikipedia text no longer applies.
        almanacState.history = [];
        almanacState.holidays = [];
        almanacState.featured = null;
    }
    almanacState.day = today;
    strip.replaceChildren();

    // Moon
    const moon = Almanac.moonPhase(now);
    const moonIcon = svgNode("svg", { class: "alm-moon", viewBox: "0 0 32 32", "aria-hidden": "true" });
    moonIcon.append(svgNode("circle", { cx: 16, cy: 16, r: 12, class: "alm-moon-dark" }));
    const lit = Almanac.moonPath(moon.age);
    if (lit) moonIcon.append(svgNode("path", { d: lit, class: "alm-moon-lit" }));
    const phases = Almanac.nextMoonPhases(now);
    const comingPhase = phases.full < phases.new ? ["full", phases.full] : ["new", phases.new];
    strip.append(almanacCell(moonIcon, [moon.name], `${Math.round(moon.illumination * 100)}% lit, ${comingPhase[0]} ${inDays(daysUntil(comingPhase[1], now))}`));

    // Sun
    const sun = Almanac.sunTimes(now, settings.latitude, settings.longitude);
    if (sun) {
        const sunIcon = svgNode("svg", { class: "alm-sun", viewBox: "0 0 32 32", "aria-hidden": "true" });
        sunIcon.append(svgNode("path", { d: "M6 22h20M10 22a6 6 0 0 1 12 0" }), svgNode("path", { d: "M16 9v3M9.2 12.2l2 2M22.8 12.2l-2 2" }));
        const dash = document.createElement("i");
        dash.textContent = " — ";
        const hours = Math.floor(sun.daylightMinutes / 60);
        const yesterday = Almanac.sunTimes(new Date(now.getTime() - 86400000), settings.latitude, settings.longitude);
        const change = yesterday ? sun.daylightMinutes - yesterday.daylightMinutes : 0;
        const versus = !yesterday ? "" : change === 0 ? ", as yesterday" : `, ${change > 0 ? "+" : "−"}${Math.abs(change)} min`;
        strip.append(almanacCell(sunIcon, [formatClockTime(sun.sunrise), dash, formatClockTime(sun.sunset)],
            `${hours} h ${sun.daylightMinutes % 60} m of daylight${versus}`));
    }

    // Where the year is: day and week, and the next solstice or equinox.
    const season = Almanac.seasonNow(now);
    const yearIcon = svgNode("svg", { class: "alm-sun", viewBox: "0 0 32 32", "aria-hidden": "true" });
    yearIcon.append(svgNode("circle", { cx: 16, cy: 16, r: 10 }), svgNode("path", { d: "M16 6v10l6 4" }));
    const yearCell = almanacCell(yearIcon, [`Day ${Almanac.dayOfYear(now)} · Week ${Almanac.isoWeek(now)}`],
        `${season.season}, ${season.progress}% through; the ${season.next} ${inDays(season.days)}`);
    yearCell.title = `The ${season.next}: ${shortDate(season.nextDate)}`;
    strip.append(yearCell);

    // Countdown: the nearest one, with the rest in the tooltip.
    const countdowns = Almanac.countdownItems(holidayCountdowns() ? Almanac.withHolidays(settings.countdowns, now) : settings.countdowns, now);
    if (countdowns.length) {
        const next = countdowns[0];
        const icon = svgNode("svg", { class: "alm-sun alm-countdown", viewBox: "0 0 32 32", "aria-hidden": "true" });
        icon.append(svgNode("rect", { x: 7, y: 8, width: 18, height: 17, rx: 3 }), svgNode("path", { d: "M7 13h18M12 5.5v5M20 5.5v5" }));
        const big = next.days === 0 ? "Today" : next.days === 1 ? "Tomorrow" : `${next.days} days`;
        const cell = almanacCell(icon, [big], next.days <= 1 ? next.name : `until ${next.name}`);
        cell.classList.add("alm-countdown-cell");
        cell.title = countdowns.map(item => item.text).join("\n");
        strip.append(cell);
    }
    strip.classList.toggle("has-countdown", countdowns.length > 0);

    // The rotating line: a fixed stage (two lines of text, so the strip
    // never changes height) with ‹ › controls and position dots.
    const story = document.createElement("div");
    story.className = "alm-cell alm-story";
    const stage = document.createElement("div");
    stage.className = "alm-stage";
    stage.setAttribute("aria-live", "polite");
    const controls = document.createElement("div");
    controls.className = "alm-controls";
    const dots = document.createElement("span");
    dots.className = "alm-dots";
    dots.setAttribute("aria-hidden", "true");
    const arrow = (label, glyph, direction) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "alm-step";
        button.textContent = glyph;
        button.setAttribute("aria-label", label);
        button.addEventListener("click", () => {
            stepAlmanac(direction);
            restartAlmanacTimer();
        });
        return button;
    };
    controls.append(arrow("Previous almanac item", "‹", -1), dots, arrow("Next almanac item", "›", 1));
    story.append(stage, controls);
    strip.append(story);
    strip.hidden = false;
    renderAlmanacStory(0);
}

const shortDate = date => date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const inDays = days => days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
const daysUntil = (date, now) => Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);

// 2.0.0: golden hour, the moon and meteor showers join the rotating line, all
// worked out on this PC; composers born today come from composers.js.
function almanacSources(now = new Date()) {
    const settings = almanacState.settings;
    const sources = {
        history: almanacState.history,
        holidays: almanacState.holidays,
        featured: almanacState.featured,
        quote: Almanac.quoteFor(globalThis.ASCSQuotes, now),
        composers: Almanac.bornOn(globalThis.ASCSComposers, now)
    };
    if (!settings) return sources;
    const range = pair => `${formatClockTime(pair[0])} to ${formatClockTime(pair[1])}`;
    const hours = Almanac.goldenHours(now, settings.latitude, settings.longitude);
    const evening = hours.eveningGolden && hours.eveningGolden[1] > now;
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const next = evening ? hours : Almanac.goldenHours(tomorrow, settings.latitude, settings.longitude);
    if (evening) {
        sources.golden = `This evening from ${range(hours.eveningGolden)}${hours.eveningBlue ? `, then blue hour until ${formatClockTime(hours.eveningBlue[1])}` : ""}.`;
    } else if (next.morningGolden) {
        const morningFirst = hours.morningGolden && hours.morningGolden[1] > now;
        const morning = morningFirst ? hours : next;
        sources.golden = `${morningFirst ? "This" : "Tomorrow"} morning from ${range(morning.morningGolden)}${morning.morningBlue ? `, after blue hour from ${formatClockTime(morning.morningBlue[0])}` : ""}.`;
    }
    const moon = Almanac.moonTimes(now, settings.latitude, settings.longitude);
    const phases = Almanac.nextMoonPhases(now);
    const nextPhase = phases.full < phases.new ? ["Full moon", phases.full] : ["New moon", phases.new];
    const riseSet = [moon.rise && `rises at ${formatClockTime(moon.rise)}`, moon.set && `sets at ${formatClockTime(moon.set)}`].filter(Boolean);
    sources.moon = `${riseSet.length ? `Today it ${riseSet.join(" and ")}. ` : ""}${nextPhase[0]} on ${shortDate(nextPhase[1])}, ${inDays(daysUntil(nextPhase[1], now))}.`;
    const showers = Almanac.activeShowers(now);
    if (showers.length) {
        const shower = showers[0];
        sources.showers = showers;
        sources.showerText = shower.days > 0 ? `The ${shower.name} are active, and peak on ${shortDate(shower.peak)}, ${inDays(shower.days)}.`
            : shower.days === 0 ? `The ${shower.name} peak tonight.`
                : `The ${shower.name} are still active; they peaked on ${shortDate(shower.peak)}.`;
    }
    return sources;
}

// Draws the current item into the stage. direction 1 (next) slides the new
// item in from the right and the old one out to the left; -1 reverses that;
// 0 replaces it without animation.
function renderAlmanacStory(direction) {
    const stage = document.querySelector("#homeAlmanac .alm-stage");
    if (!stage || !almanacState.settings) return;
    const item = Almanac.rotationItem(almanacSources(), almanacState.step);
    const story = stage.closest(".alm-story");
    story.hidden = !item;
    if (!item) return;

    const copy = document.createElement(item.title && almanacState.settings.wikipedia ? "button" : "div");
    copy.className = "alm-story-copy";
    if (copy.tagName === "BUTTON") {
        copy.type = "button";
        copy.title = "Read on Wikipedia";
        const title = item.title;
        copy.addEventListener("click", () => send("OpenWikipedia", title));
    }
    const label = document.createElement("span");
    label.className = "alm-label";
    label.textContent = item.label;
    const text = document.createElement("p");
    text.textContent = item.attribution ? `${item.text} — ${item.attribution}` : item.text;
    if (copy.tagName !== "BUTTON") copy.title = text.textContent;
    else copy.title = `${text.textContent}\n\nRead on Wikipedia`;
    copy.append(label, text);

    const dots = story.querySelector(".alm-dots");
    dots.replaceChildren(...Array.from({ length: item.count }, (_, i) => {
        const dot = document.createElement("b");
        if (i === item.position) dot.className = "on";
        return dot;
    }));

    const previous = [...stage.children].filter(child => !child.classList.contains("is-leaving"));
    stage.querySelectorAll(".is-leaving").forEach(child => child.remove());
    if (!direction || !previous.length) {
        stage.replaceChildren(copy);
        return;
    }
    const side = direction > 0 ? "next" : "prev";
    previous.forEach(old => {
        old.classList.remove("enter-next", "enter-prev");
        old.classList.add("is-leaving", `leave-${side}`);
        old.setAttribute("aria-hidden", "true");
        old.tabIndex = -1;
        const done = () => old.remove();
        old.addEventListener("animationend", done, { once: true });
        setTimeout(done, 600);
    });
    copy.classList.add(`enter-${side}`);
    copy.addEventListener("animationend", () => copy.classList.remove(`enter-${side}`), { once: true });
    stage.append(copy);
}

function stepAlmanac(direction) {
    almanacState.step += direction;
    renderAlmanacStory(direction);
}

// Rotates every 20 seconds while the Command Center is showing, pausing
// while the pointer or keyboard focus is on the strip (so it never moves
// while being read). Pressing ‹ or › restarts the 20 seconds.
const ALMANAC_ROTATE_MS = 20000;
let almanacTimer = null;
let almanacHeld = false;

function restartAlmanacTimer() {
    if (almanacTimer !== null) clearInterval(almanacTimer);
    almanacTimer = setInterval(() => {
        if (almanacHeld || document.hidden || !$("home").classList.contains("active")) return;
        if (!almanacState.settings || $("homeAlmanac").hidden) return;
        stepAlmanac(1);
    }, ALMANAC_ROTATE_MS);
}

["pointerenter", "focusin"].forEach(type =>
    $("homeAlmanac").addEventListener(type, () => { almanacHeld = true; }));
$("homeAlmanac").addEventListener("pointerleave", () => {
    almanacHeld = $("homeAlmanac").contains(document.activeElement);
});
$("homeAlmanac").addEventListener("focusout", event => {
    almanacHeld = $("homeAlmanac").matches(":hover") || $("homeAlmanac").contains(event.relatedTarget);
});
restartAlmanacTimer();

// Called when the Command Center is opened again: next item, fresh feeds.
function advanceAlmanac() {
    if (!almanacState.settings) return;
    almanacState.step++;
    renderAlmanac();
    restartAlmanacTimer();
    send("GetAlmanac");
}

function handleAlmanacFeed(kind, raw) {
    if (!Almanac) return;
    if (kind === "featured") {
        const parsed = Almanac.parseFeatured(raw);
        almanacState.history = parsed.history;
        almanacState.featured = parsed.featured;
    } else if (kind === "holidays") {
        almanacState.holidays = Almanac.parseHolidays(raw);
    } else {
        return;
    }
    renderAlmanac();
}

// ---- Preferences: almanac editor

function countdownRow(item = { date: "", name: "" }) {
    const row = document.createElement("div");
    row.className = "countdown-row";
    const date = document.createElement("input");
    date.type = "text";
    date.className = "countdown-date";
    date.maxLength = 10;
    date.placeholder = "12-25";
    date.value = item.date;
    date.setAttribute("aria-label", "Countdown date");
    const name = document.createElement("input");
    name.type = "text";
    name.className = "countdown-name";
    name.maxLength = 60;
    name.placeholder = "Name, such as Christmas";
    name.value = item.name;
    name.setAttribute("aria-label", "Countdown name");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary danger";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
        row.remove();
        updateCountdownsEmpty();
    });
    row.append(date, name, remove);
    return row;
}

function updateCountdownsEmpty() {
    const count = $("countdownRows").children.length;
    $("countdownsEmpty").hidden = count > 0;
    $("addCountdownButton").disabled = count >= 12;
}

function loadAlmanacSettings(data) {
    almanacState.settings = {
        wikipedia: data.wikipedia === true,
        place: typeof data.place === "string" ? data.place : "New York City",
        latitude: Number.isFinite(data.latitude) ? data.latitude : 40.7128,
        longitude: Number.isFinite(data.longitude) ? data.longitude : -74.006,
        countdowns: Array.isArray(data.countdowns)
            ? data.countdowns.filter(item => typeof item?.date === "string" && typeof item?.name === "string")
            : []
    };
    if (!almanacState.settings.wikipedia) {
        almanacState.history = [];
        almanacState.holidays = [];
        almanacState.featured = null;
    }
    const s = almanacState.settings;
    $("almanacWikipedia").checked = s.wikipedia;
    $("almanacWikipedia").disabled = false;
    const ns = s.latitude >= 0 ? "N" : "S";
    const ew = s.longitude >= 0 ? "E" : "W";
    $("almanacPlace").textContent = `${s.place} · ${Math.abs(s.latitude).toFixed(2)}° ${ns}, ${Math.abs(s.longitude).toFixed(2)}° ${ew}`;
    $("countdownRows").replaceChildren(...s.countdowns.map(countdownRow));
    updateCountdownsEmpty();
    renderAlmanac();
    // Countdowns also show in the Calendar (calendarview.js).
    if (typeof renderCalendar === "function") renderCalendar();
}

$("addCountdownButton").addEventListener("click", () => {
    const row = countdownRow();
    $("countdownRows").append(row);
    updateCountdownsEmpty();
    row.querySelector("input").focus();
});

function setAlmanacStatus(text) {
    $("almanacStatus").textContent = text;
    $("countdownStatus").textContent = text;
}

// Almanac and Countdowns save together (one payload), from Preferences or the
// Countdowns dialog in the Calendar.
function saveAlmanacPreferences() {
    const lines = [$("almanacWikipedia").checked ? "1" : "0"];
    let problem = "";
    $("countdownRows").querySelectorAll(".countdown-row").forEach(row => {
        const date = row.querySelector(".countdown-date").value.trim();
        const name = row.querySelector(".countdown-name").value.trim();
        if (!date && !name) return;
        if (/[|\r\n]/.test(date + name)) problem = "Countdowns cannot contain | or line breaks.";
        lines.push(`${date}|${name}`);
    });
    if (problem) {
        setAlmanacStatus(problem);
        return;
    }
    setAlmanacStatus("Saving…");
    if (!send("SaveAlmanac", lines.join("\n"))) setAlmanacStatus("Unable to contact Maestro.");
}
$("almanacWikipedia").addEventListener("change", () => {
    if (almanacState.settings) saveAlmanacPreferences();
});

// ------------------------------------------------------------ games (1.7.0)
// The Games tab. ASCS sends the library (ids, titles, play time; never file
// paths), live status while the tab is open, opt-in cover art as checked
// data URIs, and RetroAchievements responses as plain strings parsed by
// ASCSGames. Playing a game sends only its id back.

const Games = globalThis.ASCSGames;
const COVER_PATTERN = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;
const gamesState = {
    items: [], loaded: false, filter: "all", sort: "recent", query: "",
    covers: new Map(), requested: new Set(), coversEnabled: false,
    openId: "", details: new Map(), pads: [], renaming: "", tester: null, testerTimer: null, testerBuilt: "",
    ra: { state: "", summary: "", recent: "", message: "", updatedAt: 0,
        // 1.9.0, the achievement browser: games by RetroAchievements ID (raw
        // replies), the open one, its filter and sort, and recent unlocks.
        games: new Map(), gameErrors: new Map(), asked: new Set(), openGame: 0, filter: "all", sort: "order",
        unlocks: "", unlocksError: "", unlocksOpen: false, unlockPage: 0,
        // 1.11.0, the site badges: the raw reply, and the tab showing.
        awards: "", awardsError: "", awardsAsked: false, awardsTab: "all" },
    raImages: new Map(), raRequested: new Set(),
    liveTimer: null, runningTimer: null, playing: [], nowTimer: null, detailsAsked: new Set()
};

// Games' four sections. Library and Achievements draw only while they show, so
// nothing is rebuilt, or fetched for them, until you open them.
const gamesSections = MaestroSections.create($("gamesTabs"), {
    onChange(section) {
        if (section !== "controllers") closeControllerTester();
        if (section === "library") renderLibrary();
        if (section === "achievements") renderAchievements();
        if (section === "setup") send("GetGameSettings");
        updateSaveStatus();
        window.scrollTo(0, 0);
    }
});

function gameMonogram(game) {
    const words = Games.displayTitle(game.title).split(/\s+/).filter(word => /^[\p{L}\p{N}]/u.test(word));
    return (words.slice(0, 2).map(word => [...word][0]).join("") || "?").toUpperCase();
}

function gameCover(game, className) {
    const holder = document.createElement("span");
    holder.className = `game-cover ${className}`;
    holder.dataset.emulator = game.emulator;
    holder.dataset.gameId = game.id;
    holder.classList.toggle("is-angled", game.coverAngled === true);
    const data = gamesState.covers.get(game.id);
    if (data) {
        const image = document.createElement("img");
        image.src = data;
        image.alt = "";
        image.decoding = "async";
        holder.append(image);
    } else {
        const initials = document.createElement("b");
        initials.textContent = gameMonogram(game);
        holder.append(initials);
    }
    return holder;
}

function requestCovers(games) {
    if (!gamesState.coversEnabled) return;
    const wanted = games.filter(game => game.cover && !gamesState.covers.has(game.id) && !gamesState.requested.has(game.id))
        .slice(0, 40).map(game => game.id);
    if (!wanted.length) return;
    wanted.forEach(id => gamesState.requested.add(id));
    send("GetCovers", wanted.join(","));
}

function handleCoverMessage(id, data) {
    if (!COVER_PATTERN.test(data) || data.length > 2200000) return;
    if (!gamesState.items.some(game => game.id === id)) return;
    gamesState.covers.set(id, data);
    document.querySelectorAll(".game-cover").forEach(holder => {
        if (holder.dataset.gameId !== id || holder.querySelector("img")) return;
        const image = document.createElement("img");
        image.src = data;
        image.alt = "";
        holder.replaceChildren(image);
    });
    // Now playing's backdrop comes from the same cover.
    if ((gamesState.playing || []).some(item => Games.matchPlayingGame(gamesState.items, item)?.id === id)) renderNowPlaying();
}

function gameMeta(game, parts) {
    return parts.map(part => ({
        emulator: Games.EMULATORS[game.emulator] || "",
        system: Games.systemName(game.system),
        time: game.seconds ? Games.formatDuration(game.seconds) : "",
        last: Games.formatLastPlayed(game.last)
    })[part]).filter(Boolean).join(" · ");
}

function playGame(game) {
    if (!game.launchable) return;
    send("LaunchGame", game.id);
    showNotice(game.installed === false
        ? `Opening Steam to install ${Games.displayTitle(game.title)}…`
        : `Starting ${Games.displayTitle(game.title)}…`);
}

function recentGames() {
    return Games.sortGames(gamesState.items.filter(game => game.launchable && game.installed !== false && game.last), "recent");
}

function gameTile(game) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "game-tile";
    tile.title = `Play ${game.title}`;
    const name = document.createElement("strong");
    name.textContent = Games.displayTitle(game.title);
    const meta = document.createElement("small");
    meta.textContent = gameMeta(game, ["emulator", "last"]);
    const time = document.createElement("small");
    time.className = "game-tile-time";
    time.textContent = game.seconds ? Games.formatDuration(game.seconds) : "Not timed";
    tile.append(gameCover(game, "game-cover-tile"), name, meta, time);
    tile.addEventListener("click", () => playGame(game));
    return tile;
}

const GAMES_CONTINUE_ROWS = 5;     // what fits its module without scrolling

function continueRow(game) {
    const row = element("li", "game-line");
    const copy = element("span", "game-line-copy");
    const name = element("strong", "", Games.displayTitle(game.title));
    name.title = game.title;
    copy.append(name, element("small", "", gameMeta(game, ["emulator", "last"])));
    row.append(gameCover(game, "game-cover-thumb"), copy, playButton(game, "secondary"));
    return row;
}

function renderPlayTime() {
    const totals = Games.totalsByEmulator(gamesState.items).filter(total => total.seconds > 0);
    const all = totals.reduce((sum, total) => sum + total.seconds, 0);
    const max = Math.max(1, ...totals.map(total => total.seconds));
    const head = element("div", "module-head");
    const heading = element("h2", "", "Play Time");
    heading.id = "gamesTotalsTitle";
    head.append(heading);
    const panel = $("gamesTotals");
    if (!totals.length) {
        panel.replaceChildren(head, (gamesState.loaded ? element("p", "module-empty", "No play time recorded yet.") : loadingNote()));
        return;
    }
    const rows = element("div", "sys-rows");
    totals.forEach(total => {
        const row = element("div", "sys-row");
        const line = element("div", "sys-line");
        line.append(element("span", "sys-name", Games.EMULATORS[total.emulator]),
            element("span", "sys-note", `${total.games} game${total.games === 1 ? "" : "s"}`),
            element("span", "sys-value", Games.formatDuration(total.seconds)));
        const bar = element("span", "home-bar");
        bar.style.display = "block";
        const fill = element("b");
        fill.style.width = `${Math.max(2, Math.round(total.seconds / max * 100))}%`;
        bar.append(fill);
        row.append(line, bar);
        rows.append(row);
    });
    panel.replaceChildren(head, element("strong", "games-total", Games.formatDuration(all)), rows);
}

function renderGames() {
    if (!Games) return;
    keepGameNoteFocus();
    const recent = recentGames().slice(0, GAMES_CONTINUE_ROWS);
    $("gamesContinue").replaceChildren(...recent.map(continueRow));
    if (!recent.length) {
        $("gamesContinue").append(element("li", "module-empty", gamesState.loaded ? "No recent games yet. Games you play in RetroArch, Dolphin, or PCSX2 appear here." : "Loading…"));
    }
    renderPlayTime();
    if (gamesSections.current() === "library") renderLibrary();
    if ($("games").classList.contains("active")) requestCovers(recent);
    renderHomeContinue();
}

function renderLibrary() {
    if (!Games) return;
    const items = gamesState.items;
    const visible = Games.sortGames(Games.filterGames(items, gamesState.query, gamesState.filter), gamesState.sort);
    const shown = visible.slice(0, 300);
    if (!items.some(game => game.id === gamesState.openId) && shown[0]) gamesState.openId = shown[0].id;
    if (gamesState.openId) askGameDetails(gamesState.openId);
    $("gamesLibrary").replaceChildren(...shown.map(libraryRow));
    $("gamesMeta").textContent = !gamesState.loaded ? "Loading…"
        : !items.length ? "No play time found yet. Check the programs in Games › Setup."
            : !visible.length ? "No games match."
                : `${visible.length} game${visible.length === 1 ? "" : "s"}${visible.length > shown.length ? ` (showing ${shown.length})` : ""}`;
    renderGameDetail();
    if ($("games").classList.contains("active")) requestCovers(shown.slice(0, 40));
}

function renderGamesLive(data) {
    gamesState.playing = (Array.isArray(data.playing) ? data.playing : []).slice(0, 3)
        .filter(item => item && typeof item === "object" && typeof item.emulator === "string")
        .map(item => ({
            emulator: item.emulator,
            title: typeof item.title === "string" ? item.title : "",
            id: typeof item.id === "string" && /^st:\d{1,10}$/.test(item.id) ? item.id : "",
            since: Number.isFinite(item.since) && item.since > 0 ? item.since : 0
        }));
    renderNowPlaying();
    tickNowPlaying();

    renderControllers(Array.isArray(data.controllers) ? data.controllers : []);
    renderHomeControllers();
    updateRaTimestamp();

    if (data.apps && typeof data.apps === "object") setRunningApps(data.apps);
    gameNotesLiveArrived();
}

// Now playing, drawn by drawNowPlaying (homeview.js) here and on Home. The notes
// box stays outside the panel that redraws itself.
function renderNowPlaying() {
    renderHomeNow();
    renderGamesNow();
    const lead = (gamesState.playing || [])[0];
    if (lead) {
        const game = Games.matchPlayingGame(gamesState.items, lead);
        const name = lead.emulator === "steam" || lead.emulator === "pso" ? lead.title : Games.gameFromWindowTitle(lead.emulator, lead.title);
        syncNowPlayingNotes(game?.title || name);
    } else {
        const last = Games.sortGames(gamesState.items.filter(game => game.last && game.installed !== false), "recent")[0];
        syncNowPlayingNotes(last?.title || "");
    }
}

function tickNowPlaying() {
    const clocks = document.querySelectorAll("#gamesNow .now-session, #homeNow .now-session");
    clocks.forEach(clock => {
        const since = Number(clock.dataset.since);
        clock.textContent = since ? Games.formatClock(Date.now() / 1000 - since) : "Just started";
    });
    // A clock on a page that's open, in a window that's showing.
    const running = !windowIsHidden && ($("games").classList.contains("active") || $("home").classList.contains("active"));
    if (running && clocks.length && gamesState.nowTimer === null) gamesState.nowTimer = setInterval(tickNowPlaying, 1000);
    if ((!running || !clocks.length) && gamesState.nowTimer !== null) {
        clearInterval(gamesState.nowTimer);
        gamesState.nowTimer = null;
    }
}

function setRunningApps(apps) {
    const next = {};
    ["pso", "retroarch", "dolphin", "pcsx2"].forEach(name => { next[name] = apps[name] === true; });
    const changed = JSON.stringify(next) !== JSON.stringify(runningApps);
    runningApps = next;
    if (changed && $("commands").classList.contains("active")) renderKeymap();
}

// ---- library rows and their details panels (1.7.0)
// Clicking a row opens a panel beneath it; one is open at a time. Details
// that need ASCS (core, serial, file name and size) are asked for once.

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

// What shows in a space being held for something still on its way (2.0.0).
function loadingNote(text = "Loading") {
    const note = element("p", "loading-note", text);
    note.setAttribute("role", "status");
    return note;
}

function formatExactPlayed(iso) {
    const date = Games.parseLocal(iso);
    return date
        ? date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
        : "";
}

function raProgressFor(game) {
    if (!gamesState.ra.summary && !gamesState.ra.recent) return null;
    const key = Games.titleKey(game.title);
    return Games.parseRetroAchievements(gamesState.ra.summary, gamesState.ra.recent).games
        .find(entry => Games.titleKey(entry.title) === key) || null;
}

function askGameDetails(id) {
    if (gamesState.details.has(id) || gamesState.detailsAsked.has(id)) return;
    gamesState.detailsAsked.add(id);
    send("GetGameDetails", id);
}

// The list stays put, with the focus on its row; only the panel beside it redraws.
function selectGame(id) {
    gamesState.openId = id;
    askGameDetails(id);
    document.querySelectorAll(".game-row-item").forEach(row => {
        const on = row.dataset.gameId === id;
        row.classList.toggle("is-open", on);
        row.querySelector(".game-row-toggle").setAttribute("aria-pressed", String(on));
    });
    renderGameDetail();
}

function libraryRow(game) {
    const open = gamesState.openId === game.id;
    const row = element("li", `game-row-item${open ? " is-open" : ""}`);
    row.dataset.gameId = game.id;
    const main = element("div", "game-row");
    const toggle = element("button", "game-row-toggle");
    toggle.type = "button";
    toggle.setAttribute("aria-pressed", String(open));
    toggle.title = "Show details";
    const copy = element("span", "game-row-copy");
    copy.append(element("strong", "", Games.displayTitle(game.title)), element("small", "", gameMeta(game, ["emulator", "system"])));
    toggle.append(gameCover(game, "game-cover-thumb"), copy);
    toggle.addEventListener("click", () => selectGame(game.id));
    const time = element("span", "game-row-time", game.seconds ? Games.formatDuration(game.seconds) : "—");
    const last = element("span", "game-row-last", Games.formatLastPlayed(game.last) || "—");
    main.append(toggle, time, last, playButton(game, "secondary"));
    row.append(main);
    return row;
}

function playButton(game, className) {
    const installed = game.installed !== false;
    const play = element("button", className, installed ? "Play" : "Install");
    play.type = "button";
    play.disabled = !game.launchable;
    play.title = !game.launchable ? "Maestro doesn't know where this game is stored"
        : installed ? `Play ${game.title}` : `Opens Steam's install prompt for ${game.title}`;
    play.addEventListener("click", () => playGame(game));
    return play;
}

function renderGameDetail() {
    const panel = $("gameDetail");
    const game = gamesState.items.find(item => item.id === gamesState.openId);
    panel.hidden = !game;
    keepGameNoteFocus();
    if (!game) {
        panel.replaceChildren();
        return;
    }
    if ($("games").classList.contains("active")) requestCovers([game]);
    panel.replaceChildren(gameDetailsPanel(game));
}

function gameDetailsPanel(game) {
    const panel = element("div", "game-details");
    const top = element("div", "game-details-top");
    const body = element("div", "game-details-body");
    body.append(element("h2", "", game.title));
    const facts = element("dl", "game-facts");
    const fact = (label, value) => {
        if (!value) return;
        facts.append(element("dt", "", label), element("dd", "", value));
    };
    fact("Played on", [Games.EMULATORS[game.emulator], Games.systemName(game.system)].filter(Boolean).join(" · "));
    fact("Play time", game.seconds ? Games.formatDuration(game.seconds) : "Not timed");
    if (game.plays) fact("Sessions", String(game.plays));
    fact("Last played", formatExactPlayed(game.last) || "Unknown");
    const extra = gamesState.details.get(game.id);
    if (extra) extra.fields.forEach(([label, value]) => fact(label, value));
    else fact("Details", "Loading…");
    const progress = raProgressFor(game);
    if (progress && progress.possible) {
        fact("Achievements", `${progress.achieved} of ${progress.possible} (${progress.percent}%)${progress.mastered ? " · mastered" : ""}`);
    }
    body.append(facts);
    top.append(gameCover(game, "game-cover-detail"), body);
    panel.append(top);
    const actions = element("div", "game-details-actions");
    actions.append(playButton(game, "primary"));
    if (extra?.canShow) {
        const show = element("button", "secondary", extra.showLabel || "Show file");
        show.type = "button";
        show.addEventListener("click", () => send("ShowGameFile", game.id));
        actions.append(show);
    }
    panel.append(actions);
    const notes = gameNotesBox("library", game.title);
    if (notes) panel.append(notes);
    return panel;
}

// ---- controllers: names, details, rename, and the input tester

const XINPUT_BUTTONS = [
    [0x1000, "A"], [0x2000, "B"], [0x4000, "X"], [0x8000, "Y"], [0x0100, "LB"], [0x0200, "RB"],
    [0x0020, "Back"], [0x0010, "Start"], [0x0040, "LS"], [0x0080, "RS"],
    [0x0001, "↑"], [0x0002, "↓"], [0x0004, "←"], [0x0008, "→"]
];

function powerText(power) {
    return power === "wired" ? "Wired"
        : power === "receiver" ? "Battery not reported through the receiver"
            : power === "unreported" ? "Battery not reported in this mode"
            : ["full", "medium", "low", "empty"].includes(power) ? `Battery ${power}` : "";
}

function renderControllers(pads) {
    gamesState.pads = pads;
    const card = $("gamesControllers");
    // Asked for every 3 seconds: unchanged, the page keeps its focus.
    const signature = JSON.stringify([pads, gamesState.renaming]);
    if (card.dataset.signature === signature) return;
    if (gamesState.renaming && card.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return;
    card.dataset.signature = signature;
    card.replaceChildren();
    if (!pads.length) {
        const empty = element("div", "module");
        empty.style.gridColumn = "1 / -1";
        empty.append(element("p", "module-empty", "No controller is connected. Wake one to see it here."));
        card.append(empty);
        return;
    }
    pads.slice(0, 3).forEach(pad => {
        const item = element("article", "module pad");
        if (gamesState.renaming === pad.key) {
            const form = element("form", "pad-rename");
            const input = element("input");
            input.type = "text";
            input.maxLength = 48;
            input.value = pad.name;
            input.setAttribute("aria-label", "Controller name");
            const save = element("button", "primary", "Save");
            save.type = "submit";
            const cancel = element("button", "secondary", "Cancel");
            cancel.type = "button";
            cancel.addEventListener("click", () => { gamesState.renaming = ""; renderControllers(gamesState.pads); });
            form.addEventListener("submit", event => {
                event.preventDefault();
                const value = input.value.trim();
                if (/[|\\<>]/.test(value) || value.length > 48) {
                    showNotice("Use up to 48 characters, without | \\ < or >.");
                    return;
                }
                gamesState.renaming = "";
                send("RenameController", `${pad.key}|${value}`);
                renderControllers(gamesState.pads);
            });
            form.append(input, save, cancel);
            const hint = element("small", "pad-hint", "Renames it in Maestro and in Windows' game controller list. Leave empty to restore the default. ");
            const bluetooth = element("button", "link-button", "Bluetooth name…");
            bluetooth.type = "button";
            bluetooth.title = "Opens Devices and Printers: right-click the controller › Properties › Bluetooth, then type a name. Needed once per controller.";
            bluetooth.addEventListener("click", () => send("OpenBluetoothRename"));
            hint.append(bluetooth);
            item.append(form, hint);
            card.append(item);
            requestAnimationFrame(() => { input.focus(); input.select(); });
            return;
        }
        item.append(element("h2", "", pad.name));
        const meta = [`${pad.mode} mode`, pad.connection, pad.slot ? `Player ${pad.slot}` : ""].filter(Boolean).join(" · ");
        item.append(element("small", "", meta));
        if (!pad.rumble) item.append(element("small", "pad-hint", "Rumble and battery need X-input mode."));
        const power = pad.rumble ? powerText(pad.power) : "";
        if (power) {
            const line = element("small", "pad-power", power);
            line.dataset.power = pad.power;
            item.append(line);
        }
        const actions = element("div", "pad-actions");
        const padButton = (label, title, onClick) => {
            const button = element("button", "secondary", label);
            button.type = "button";
            if (title) button.title = title;
            button.addEventListener("click", onClick);
            actions.append(button);
        };
        // With two identical controllers, this tells you which entry is which.
        if (pad.rumble) padButton("Identify", "Rumbles this controller so you can tell which one it is", () => send("RumbleController", pad.id));
        padButton("Rename", "", () => { gamesState.renaming = pad.key; renderControllers(gamesState.pads); });
        if (pad.rumble || pad.testable) padButton("Test", "", () => openTester(pad));
        item.append(actions);
        card.append(item);
    });
}

function openTester(pad) {
    gamesState.tester = pad;
    $("controllerTester").hidden = false;
    $("testerTitle").textContent = pad.name;
    $("rumbleController").hidden = !pad.rumble;
    $("testerNote").textContent = pad.rumble
        ? "Sticks, triggers and buttons light up as you use them."
        : `${pad.mode} mode: sticks, the D-pad and numbered buttons, as the controller reports them.`;
    $("testerBody").replaceChildren(element("p", "settings-note", "Move a stick or press a button…"));
    gamesState.testerBuilt = "";
    stopTester();
    if (!pad.rumble) {
        // D-input and Switch modes: ASCS pushes input as it arrives.
        gamesState.hidTester = pad.id;
        send("StartControllerTester", pad.id);
        $("controllerTester").scrollIntoView({ block: "nearest", behavior: "smooth" });
        return;
    }
    gamesState.testerTimer = setInterval(() => {
        if (!$("games").classList.contains("active") || document.hidden || $("controllerTester").hidden) return stopTester();
        send("GetControllerInput", pad.id);
    }, 60);
    $("controllerTester").scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function stopTester() {
    if (gamesState.testerTimer) clearInterval(gamesState.testerTimer);
    gamesState.testerTimer = null;
    if (gamesState.hidTester) {
        gamesState.hidTester = "";
        send("StopControllerTester");
    }
}

function stickElement(label) {
    const wrap = element("div", "tester-stick");
    const pad = element("div", "tester-stick-pad");
    pad.append(element("i", "tester-stick-dot"));
    wrap.append(pad, element("small", "", label));
    return wrap;
}

function setStick(stick, x, y) {
    const dot = stick.querySelector(".tester-stick-dot");
    dot.style.transform = `translate(${(x * 26).toFixed(1)}px, ${(y * 26).toFixed(1)}px)`;
}

function barElement(label) {
    const wrap = element("div", "tester-bar");
    const track = element("span", "tester-bar-track");
    track.append(element("b"));
    wrap.append(element("small", "", label), track);
    return wrap;
}

function setBar(bar, value) {
    bar.querySelector("b").style.width = `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function renderControllerInput(data) {
    const pad = gamesState.tester;
    if (!pad || data.id !== pad.id || $("controllerTester").hidden) return;
    const body = $("testerBody");
    if (data.connected !== true) {
        body.replaceChildren(element("p", "settings-note", "The controller is not responding. Wake it or reconnect it."));
        gamesState.testerBuilt = "";
        return;
    }
    const number = value => (Number.isFinite(value) ? value : 0);
    if (data.kind === "xinput") renderXInputTester(body, pad, data, number);
    else if (data.kind === "hid") renderHidTester(body, pad, data, number);
}

function testerFrame(body, pad, kind, barLabels, buttonLabels) {
    if (gamesState.testerBuilt === `${kind}:${pad.id}`) return;
    body.replaceChildren();
    const sticks = element("div", "tester-sticks");
    sticks.append(stickElement("Left stick"), stickElement("Right stick"));
    const bars = element("div", "tester-bars");
    barLabels.forEach(label => bars.append(barElement(label)));
    const buttons = element("div", "tester-buttons");
    buttonLabels.forEach(([mask, label]) => {
        const button = element("span", "tester-button", label);
        button.dataset.mask = String(mask);
        buttons.append(button);
    });
    body.append(sticks, bars, buttons);
    gamesState.testerBuilt = `${kind}:${pad.id}`;
}

function lightButtons(body, pressed) {
    body.querySelectorAll(".tester-button[data-mask]").forEach(button => {
        button.classList.toggle("is-on", (pressed & Number(button.dataset.mask)) !== 0);
    });
}

function renderXInputTester(body, pad, data, number) {
    testerFrame(body, pad, "xinput", ["LT", "RT"], XINPUT_BUTTONS);
    const [left, right] = body.querySelectorAll(".tester-stick");
    const bars = body.querySelectorAll(".tester-bar");
    setStick(left, number(data.lx) / 32767, -number(data.ly) / 32767);
    setStick(right, number(data.rx) / 32767, -number(data.ry) / 32767);
    setBar(bars[0], number(data.lt) / 255);
    setBar(bars[1], number(data.rt) / 255);
    lightButtons(body, number(data.buttons) >>> 0);
}

// HID usages: X 30, Y 31, Z 32, Rx 33, Ry 34, Rz 35. The right stick is Z/Rz
// on most D-input pads and Rx/Ry on others; whichever pair isn't the right
// stick shows as trigger bars.
const HAT_ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];

function renderHidTester(body, pad, data, number) {
    const axes = data.axes && typeof data.axes === "object" ? data.axes : {};
    const has = key => Number.isFinite(axes[key]);
    const rightPair = has("32") && has("35") ? ["32", "35"] : ["33", "34"];
    const barPair = rightPair[0] === "32" ? ["33", "34"] : ["32", "35"];
    const buttonLabels = Array.from({ length: 16 }, (_, i) => [2 ** i, String(i + 1)]);
    testerFrame(body, pad, "hid", ["L trigger axis", "R trigger axis", "D-pad"], buttonLabels);
    const [left, right] = body.querySelectorAll(".tester-stick");
    const bars = body.querySelectorAll(".tester-bar");
    setStick(left, number(axes["30"]), number(axes["31"]));
    setStick(right, number(axes[rightPair[0]]), number(axes[rightPair[1]]));
    setBar(bars[0], (number(axes[barPair[0]]) + 1) / 2 * (has(barPair[0]) ? 1 : 0));
    setBar(bars[1], (number(axes[barPair[1]]) + 1) / 2 * (has(barPair[1]) ? 1 : 0));
    const hat = Number.isInteger(data.hat) && data.hat >= 0 && data.hat < 8 ? data.hat : -1;
    setBar(bars[2], hat >= 0 ? 1 : 0);
    bars[2].querySelector("small").textContent = hat >= 0 ? `D-pad ${HAT_ARROWS[hat]}` : "D-pad";
    lightButtons(body, number(data.buttons) >>> 0);
}

function closeControllerTester() {
    $("controllerTester").hidden = true;
    gamesState.tester = null;
    stopTester();
}

$("closeTester").addEventListener("click", closeControllerTester);
$("rumbleController").addEventListener("click", () => {
    if (gamesState.tester?.rumble) send("RumbleController", gamesState.tester.id);
});

// ---- achievements

function updateRaTimestamp() {
    const at = gamesState.ra.updatedAt;
    if (!at) {
        $("raUpdated").textContent = "";
        return;
    }
    const minutes = Math.floor((Date.now() - at) / 60000);
    $("raUpdated").textContent = minutes < 1 ? "Updated just now" : `Updated ${minutes} m ago`;
}

// ---- the achievement browser (1.9.0)
// A game's achievements (earned and locked, with dates, points, how rare
// they are, and whether they're missable), "Next up" for the last game
// played, and recent unlocks beyond six, paged. Games are fetched by
// RetroAchievements ID when first wanted and kept for the session.
function requestRaGame(id, refresh = false) {
    if (!id || (!refresh && (gamesState.ra.games.has(id) || gamesState.ra.asked.has(id)))) return;
    gamesState.ra.asked.add(id);
    send("GetRaGame", refresh ? `refresh:${id}` : String(id));
}

function openRaGame(id) {
    if (!id) return;
    gamesState.ra.openGame = id;
    gamesState.ra.filter = "all";
    requestRaGame(id);
    gamesSections.show("achievements");
    renderAchievements();
}

const RA_TYPE_LABELS = { progression: "Progression", win_condition: "Win condition", missable: "Missable" };

function raTypeTag(type) {
    return type ? element("span", `ra-type is-${type.replace("_", "-")}`, RA_TYPE_LABELS[type]) : null;
}

const raDateText = text => {
    const date = Games.parseLocal(text.replace(" ", "T"));
    return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
};

function raAchievementItem(item) {
    const earned = Boolean(item.earned || item.earnedHardcore);
    const row = element("li", `ra-with-image ra-achievement${earned ? " is-earned" : " is-locked"}`);
    const body = element("div", "ra-item-body");
    const head = element("div", "ra-unlock-head");
    head.append(element("strong", "", item.title));
    const tag = raTypeTag(item.type);
    if (tag) head.append(tag);
    const points = element("span", `ra-points${item.earnedHardcore ? " is-hardcore" : ""}`, `${item.points}`);
    points.title = `${item.points} points${item.truePoints ? ` (${item.truePoints} true points)` : ""}`;
    head.append(points);
    body.append(head);
    if (item.description) body.append(element("p", "", item.description));
    const rarity = item.rarity === null ? "" : `${item.rarity < 1 ? "<1" : Math.round(item.rarity)}% of players`;
    body.append(element("small", "", earned
        ? [`Unlocked ${raDateText(item.earnedHardcore || item.earned)}`, item.earnedHardcore ? "hardcore" : "softcore", rarity].filter(Boolean).join(" · ")
        : ["Locked", rarity].filter(Boolean).join(" · ")));
    row.append(raImage(item.badge, `ra-badge${item.earnedHardcore ? " is-hardcore" : ""}${earned ? "" : " is-locked"}`), body);
    return row;
}

function renderRaBrowser(box) {
    const ra = gamesState.ra;
    const id = ra.openGame;
    const panel = element("div", "ra-browser");
    const back = element("button", "secondary ra-back", "‹ Achievements");
    back.type = "button";
    back.addEventListener("click", () => { ra.openGame = 0; renderAchievements(); });
    panel.append(back);
    const raw = ra.games.get(id);
    const game = raw ? Games.parseRaGame(raw) : null;
    if (!game) {
        panel.append(element("p", "settings-note", ra.gameErrors.get(id) || (raw ? "RetroAchievements sent something unexpected for this game." : "Loading…")));
        box.append(panel);
        return;
    }
    const head = element("div", "ra-browser-head");
    const titles = element("div", "ra-item-body");
    const award = { "mastered": "Mastered", "completed": "Completed", "beaten-hardcore": "Beaten (hardcore)", "beaten-softcore": "Beaten" }[game.award] || "";
    titles.append(element("strong", "ra-browser-title", Games.displayTitle(game.title)));
    titles.append(element("small", "", [game.console, award].filter(Boolean).join(" · ")));
    const percent = game.achievements.length ? Math.round(game.earned / game.achievements.length * 100) : 0;
    const bar = element("span", Games.raBarClass(game.award === "mastered"));
    const fill = element("b");
    fill.style.width = `${percent}%`;
    bar.append(fill);
    titles.append(bar, element("small", "", game.achievements.length
        ? `${game.earned} of ${game.achievements.length} unlocked · ${game.pointsEarned.toLocaleString()} of ${game.points.toLocaleString()} points${game.earnedHardcore ? ` · ${game.earnedHardcore} hardcore` : ""}`
        : "This game has no achievements yet."));
    head.append(raImage(game.icon, "ra-icon ra-browser-icon"), titles);
    panel.append(head);
    const notes = gameNotesBox("achievements", game.title);
    if (notes) panel.append(notes);

    const tools = element("div", "ra-browser-tools");
    const counts = Games.raCounts(game.achievements);
    const chips = element("div", "sound-presets ra-filters");
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", "Show");
    [["all", "All"], ["locked", "Locked"], ["earned", "Unlocked"], ["missable", "Missable"], ["progression", "Progression"]].forEach(([key, label]) => {
        if (key !== "all" && key !== "locked" && key !== "earned" && !counts[key]) return;
        const chip = element("button", `sound-preset${ra.filter === key ? " is-on" : ""}`);
        chip.type = "button";
        chip.setAttribute("aria-pressed", String(ra.filter === key));
        chip.append(element("span", "", label), element("b", "", String(counts[key])));
        chip.addEventListener("click", () => { ra.filter = key; renderAchievements(); });
        chips.append(chip);
    });
    const sort = element("select", "ra-sort");
    sort.setAttribute("aria-label", "Sort");
    [["order", "Game order"], ["points", "Most points"], ["rarest", "Rarest first"]].forEach(([value, label]) => {
        const option = element("option", "", label);
        option.value = value;
        sort.append(option);
    });
    sort.value = ra.sort;
    sort.addEventListener("change", () => { ra.sort = sort.value; renderAchievements(); });
    tools.append(chips, sort);
    panel.append(tools);

    const shown = Games.filterRaAchievements(game.achievements, ra.filter, ra.sort);
    const list = element("ol", "ra-unlocks ra-list");
    shown.forEach(item => list.append(raAchievementItem(item)));
    if (!shown.length) list.append(element("li", "settings-note", "Nothing here."));
    panel.append(list);
    box.append(panel);
    requestRaImages([game.icon, ...shown.map(item => item.badge)]);
}

// Next up, on Playing, for the last game RetroAchievements saw: its next locked
// progression step (or the next locked achievement), and where the game stands.
function renderGamesNextUp() {
    const panel = $("gamesNextUp");
    const ra = gamesState.ra;
    const data = ra.state === "ok" && (ra.summary || ra.recent) ? Games.parseRetroAchievements(ra.summary, ra.recent) : null;
    const gameId = data?.lastGameId || 0;
    if (gameId) requestRaGame(gameId);
    const raw = gameId ? ra.games.get(gameId) : "";
    const game = raw ? Games.parseRaGame(raw) : null;
    // While RetroAchievements hasn't answered, the module holds its place, so
    // Continue Playing doesn't change width when it does.
    const waiting = !game && (!ra.state || ra.state === "loading" || (ra.state === "ok" && gameId && !raw && !ra.gameErrors.has(gameId)));
    panel.hidden = !waiting && !game?.achievements.length;
    if (panel.hidden) {
        panel.replaceChildren();
        return;
    }
    const head = element("div", "module-head");
    const heading = element("h2", "", "Next Up");
    heading.id = "gamesNextUpTitle";
    if (waiting) {
        head.append(heading);
        panel.replaceChildren(head, loadingNote());
        return;
    }
    const all = element("button", "link-button", "All achievements");
    all.type = "button";
    all.addEventListener("click", () => openRaGame(gameId));
    head.append(heading, all);
    panel.replaceChildren(head, element("p", "games-next-game", Games.displayTitle(game.title)));

    const next = Games.nextUp(game);
    if (next) {
        const target = element("div", "games-next-target");
        const body = element("div", "ra-item-body");
        const line = element("div", "ra-unlock-head");
        line.append(element("strong", "", next.achievement.title));
        const tag = raTypeTag(next.achievement.type);
        if (tag) line.append(tag);
        line.append(element("span", "ra-points", `${next.achievement.points}`));
        body.append(line);
        if (next.achievement.description) body.append(element("p", "", next.achievement.description));
        target.append(raImage(next.achievement.badge, "ra-badge is-locked"), body);
        panel.append(target);
        requestRaImages([next.achievement.badge]);
    } else {
        panel.append(element("p", "module-empty", "Every achievement unlocked."));
    }

    const facts = element("dl", "game-facts-list");
    const fact = (label, value, className = "") => {
        const row = element("div", "game-fact");
        const detail = element("dd", className, value);
        detail.title = value;
        row.append(element("dt", "", label), detail);
        facts.append(row);
    };
    const { latest, rarest } = Games.raHighlights(game);
    fact("Points earned", `${game.pointsEarned.toLocaleString()} of ${game.points.toLocaleString()}`);
    if (next) fact("Still locked", String(next.locked));
    if (next?.missableLeft) fact("Missable still open", String(next.missableLeft), "is-missable");
    if (latest) fact("Latest unlock", `${latest.title}, ${raDateText(latest.earnedHardcore || latest.earned)}`);
    if (rarest) fact("Rarest unlock", `${rarest.title}, ${rarest.rarity < 1 ? "<1" : Math.round(rarest.rarity)}% of players`);
    panel.append(facts);
}

function renderAchievements() {
    renderGamesNextUp();
    if (gamesSections.current() !== "achievements") return;
    keepGameNoteFocus();
    const box = $("gamesAchievements");
    const ra = gamesState.ra;
    box.replaceChildren();
    const live = ra.state === "ok" || ra.state === "error";
    $("refreshAchievements").hidden = !live;
    $("raProfile").hidden = ra.state !== "ok";
    updateRaTimestamp();
    if (ra.state === "off" || ra.state === "invalid" || !ra.state) {
        box.append(element("p", "settings-note", ra.state === "invalid"
            ? ra.message || "The RetroAchievements details in data\\secrets.ini aren't valid."
            : "Connect RetroAchievements to see your points, rank, recent unlocks and progress here. Add your user name and Web API key to a local secrets file that is never committed."));
        const setup = element("button", "secondary", "Open secrets file");
        setup.type = "button";
        setup.addEventListener("click", () => send("SetupRetroAchievements"));
        box.append(setup);
        return;
    }
    if (ra.state === "error") {
        box.append(element("p", "settings-note", ra.message || "RetroAchievements is unavailable right now."));
        return;
    }
    if (!ra.summary && !ra.recent) {
        box.append(loadingNote());
        return;
    }
    const data = Games.parseRetroAchievements(ra.summary, ra.recent);

    // Header: player and standing.
    const stats = element("div", "ra-stats");
    const stat = (label, value, note) => {
        const item = element("span");
        item.append(element("small", "", label), element("strong", "", value));
        if (note) item.append(element("em", "", note));
        stats.append(item);
    };
    const player = element("span", "ra-player");
    player.append(raImage(data.userPicture, "ra-avatar"), element("h3", "ra-player-name", data.user || "—"));
    stats.append(player);
    stat("Hardcore points", data.points.toLocaleString(), data.truePoints ? `${data.truePoints.toLocaleString()} true points` : "");
    if (data.softcore) stat("Softcore points", data.softcore.toLocaleString());
    stat("Rank", data.rank ? `#${data.rank.toLocaleString()}` : "—", Games.rankPercentile(data.rank, data.ranked));
    if (ra.awards) {
        const { counts } = Games.parseRaAwards(ra.awards);
        stat("Mastered", String(counts.mastered));
        if (counts.completed) stat("Completed", String(counts.completed));
    }
    box.append(stats);

    // What's being played (rich presence comes from the game itself).
    if (data.lastGame || data.presence) {
        const now = element("div", "ra-now");
        now.append(element("small", "", "Last seen in"));
        now.append(element("strong", "", [data.lastGame, data.lastConsole].filter(Boolean).join(" · ") || "—"));
        if (data.presence) now.append(element("p", "", data.presence));
        box.append(now);
    }
    requestRaImages([data.userPicture]);
    if (ra.openGame) {
        renderRaBrowser(box);
        return;
    }

    const columns = element("div", "ra-columns");
    const progress = element("div", "ra-column");
    progress.append(element("h2", "", "Progress"));
    const progressList = element("ol", "ra-progress");
    data.games.slice(0, 6).forEach(game => {
        const item = element("li", `ra-with-image ${game.mastered ? "is-mastered" : game.completed ? "is-complete" : ""}`);
        const body = element("div", "ra-item-body");
        const head = element("div", "ra-progress-head");
        head.append(element("strong", "", Games.displayTitle(game.title)));
        head.append(element("span", "ra-percent", game.mastered ? "Mastered" : game.completed ? "Completed" : `${game.percent}%`));
        const meta = element("small", "", [game.console, game.possible ? `${game.achieved} of ${game.possible}` : "No achievements",
            game.hardcore && game.hardcore < game.achieved ? `${game.hardcore} hardcore` : ""].filter(Boolean).join(" · "));
        const bar = element("span", "ra-bar");
        const fill = element("b");
        fill.style.width = `${game.percent}%`;
        bar.append(fill);
        body.append(head, meta, bar);
        item.append(raImage(game.icon, "ra-icon"), body);
        if (game.id) {
            // Opens the game's achievements (1.9.0).
            item.classList.add("is-openable");
            item.tabIndex = 0;
            item.setAttribute("role", "button");
            item.title = "Show every achievement in this game";
            item.addEventListener("click", () => openRaGame(game.id));
            item.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openRaGame(game.id); } });
        }
        progressList.append(item);
    });
    if (!progressList.children.length) progressList.append(element("li", "settings-note", "No recently played games."));
    progress.append(progressList);

    const unlocks = element("div", "ra-column");
    unlocks.append(element("h2", "", "Recent Unlocks"));
    const unlockList = element("ol", "ra-unlocks");
    // Beyond six (1.9.0): the last 30 days, six to a page.
    const PAGE = 6;
    const all = ra.unlocksOpen && ra.unlocks ? Games.parseRaUnlocks(ra.unlocks) : null;
    const pages = all ? Math.max(1, Math.ceil(all.length / PAGE)) : 1;
    ra.unlockPage = Math.min(ra.unlockPage, pages - 1);
    const shownUnlocks = all ? all.slice(ra.unlockPage * PAGE, ra.unlockPage * PAGE + PAGE) : data.achievements.slice(0, 6);
    shownUnlocks.forEach(achievement => {
        const item = element("li", "ra-with-image");
        const body = element("div", "ra-item-body");
        const head = element("div", "ra-unlock-head");
        head.append(element("strong", "", achievement.title));
        const points = element("span", `ra-points${achievement.hardcore ? " is-hardcore" : ""}`, `${achievement.points}`);
        points.title = achievement.hardcore ? "Hardcore unlock" : "Softcore unlock";
        head.append(points);
        body.append(head);
        if (achievement.description) body.append(element("p", "", achievement.description));
        body.append(element("small", "", [achievement.game, Games.formatLastPlayed(achievement.date.replace(" ", "T"))].filter(Boolean).join(" · ")));
        item.append(raImage(achievement.badge, `ra-badge${achievement.hardcore ? " is-hardcore" : ""}`), body);
        if (achievement.gameId) {
            item.classList.add("is-openable");
            item.title = `Show every achievement in ${achievement.game || "this game"}`;
            item.addEventListener("click", () => openRaGame(achievement.gameId));
        }
        unlockList.append(item);
    });
    if (!unlockList.children.length) unlockList.append(element("li", "settings-note", ra.unlocksOpen ? (ra.unlocksError || (ra.unlocks ? "No unlocks in the last 30 days." : "Loading…")) : "No recent unlocks."));
    unlocks.append(unlockList);
    const pager = element("div", "ra-pager");
    const pageButton = (label, hint, disabled, onClick) => {
        const button = element("button", "link-button", label);
        button.type = "button";
        button.title = hint;
        button.disabled = disabled;
        button.addEventListener("click", onClick);
        return button;
    };
    if (!ra.unlocksOpen) {
        if (data.achievements.length) {
            pager.append(pageButton("More unlocks", "The last 30 days, six at a time", false, () => {
                ra.unlocksOpen = true;
                ra.unlockPage = 0;
                if (!ra.unlocks) send("GetRaUnlocks");
                renderAchievements();
            }));
        }
    } else if (all) {
        pager.append(pageButton("‹ Newer", "Newer unlocks", ra.unlockPage === 0, () => { ra.unlockPage--; renderAchievements(); }));
        pager.append(element("small", "", all.length ? `${ra.unlockPage * PAGE + 1}–${Math.min(all.length, ra.unlockPage * PAGE + PAGE)} of ${all.length} in the last 30 days` : ""));
        pager.append(pageButton("Older ›", "Older unlocks", ra.unlockPage >= pages - 1, () => { ra.unlockPage++; renderAchievements(); }));
    }
    if (pager.childElementCount) unlocks.append(pager);
    columns.append(progress, unlocks);
    box.append(columns);
    renderRaAwards(box);
    requestRaImages([...data.games.slice(0, 6).map(game => game.icon), ...shownUnlocks.map(item => item.badge)]);
}

// RetroAchievements badges and icons: requested by token once per session;
// ASCS downloads each image once and keeps it in data\ra-images.
const RA_IMAGE_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const RA_TOKEN_PATTERN = /^([bi]:\d{1,8}|u:[A-Za-z0-9_]{1,32})$/;
// A user's name in any case is the same picture.
const raImageKey = token => (token.startsWith("u:") ? token.toLowerCase() : token);

function raImage(token, className) {
    const holder = element("span", `ra-image ${className}`);
    holder.dataset.token = token ? raImageKey(token) : "";
    const data = token ? gamesState.raImages.get(raImageKey(token)) : "";
    if (data) {
        const image = element("img");
        image.src = data;
        image.alt = "";
        holder.append(image);
    }
    return holder;
}

function requestRaImages(tokens) {
    const wanted = [...new Set(tokens.filter(token => RA_TOKEN_PATTERN.test(token || "")))]
        .filter(token => !gamesState.raImages.has(raImageKey(token)) && !gamesState.raRequested.has(token));
    if (!wanted.length) return;
    wanted.forEach(token => gamesState.raRequested.add(token));
    for (let i = 0; i < wanted.length; i += 30) send("GetRaImages", wanted.slice(i, i + 30).join(","));
}

function handleRaImage(token, data) {
    if (!RA_TOKEN_PATTERN.test(token) || !RA_IMAGE_PATTERN.test(data) || data.length > 400000) return;
    const key = raImageKey(token);
    gamesState.raImages.set(key, data);
    document.querySelectorAll(".ra-image").forEach(holder => {
        if (holder.dataset.token !== key) return;
        // A user's picture can arrive twice: the cached copy, then a newer one.
        const shown = holder.querySelector("img");
        if (shown) {
            shown.src = data;
            return;
        }
        const image = element("img");
        image.src = data;
        image.alt = "";
        holder.append(image);
    });
}

$("raProfile").addEventListener("click", () => send("OpenRetroAchievementsProfile"));

// The library loads once, in the background, after the Command Center first
// opens, so Games opens with it in place (1.9.2). It sends only the local
// library: nothing from RetroAchievements, and covers wait until Games is open.
let gamesPreloadStarted = false;
function preloadGames() {
    if (gamesPreloadStarted) return;
    gamesPreloadStarted = true;
    setTimeout(() => { if (!gamesState.loaded) send("GetGames"); }, 2000);
}

function startGamesPolling() {
    stopGamesPolling();
    if (!notesLoaded) send("GetNotes");
    refreshGameNotes();
    syncNowPlayingNotes(nowNotesTitle);
    renderGamesNextUp();
    send("GetGames");
    send("GetGamesLive");
    send("GetRetroAchievements");
    askForRaAwards();
    gamesState.liveTimer = setInterval(() => {
        if ($("games").classList.contains("active") && !document.hidden) send("GetGamesLive");
        else stopGamesPolling();
    }, 3000);
}

function stopGamesPolling() {
    if (gamesState.liveTimer !== null) clearInterval(gamesState.liveTimer);
    gamesState.liveTimer = null;
    if (gamesState.nowTimer !== null) clearInterval(gamesState.nowTimer);
    gamesState.nowTimer = null;
    stopTester();
}

// Super Commands: running dots on M4-M7, polled only while it is open.
function startRunningPolling() {
    stopRunningPolling();
    send("GetRunning");
    gamesState.runningTimer = setInterval(() => {
        if ($("commands").classList.contains("active") && !document.hidden) send("GetRunning");
        else stopRunningPolling();
    }, 3000);
}

function stopRunningPolling() {
    if (gamesState.runningTimer !== null) clearInterval(gamesState.runningTimer);
    gamesState.runningTimer = null;
}

document.querySelectorAll("[data-game-filter]").forEach(button => button.addEventListener("click", () => {
    gamesState.filter = button.dataset.gameFilter;
    document.querySelectorAll("[data-game-filter]").forEach(other => other.setAttribute("aria-pressed", String(other === button)));
    renderLibrary();
}));
document.querySelectorAll("[data-game-sort]").forEach(button => button.addEventListener("click", () => {
    gamesState.sort = button.dataset.gameSort;
    document.querySelectorAll("[data-game-sort]").forEach(other => other.setAttribute("aria-pressed", String(other === button)));
    renderLibrary();
}));
$("gameSearch").addEventListener("input", () => {
    gamesState.query = $("gameSearch").value;
    renderLibrary();
});
$("gamesOpenLibrary").addEventListener("click", () => gamesSections.show("library"));
// On its own message, so turning covers on or off can't touch the other settings.
$("showCovers").addEventListener("change", () => {
    gamesState.covers.clear();
    gamesState.requested.clear();
    send("SetShowCovers", $("showCovers").checked ? "1" : "0");
});
$("refreshAchievements").addEventListener("click", () => {
    send("GetRetroAchievements", "refresh");
    if (gamesState.ra.openGame) requestRaGame(gamesState.ra.openGame, true);
    if (gamesState.ra.unlocksOpen) send("GetRaUnlocks", "refresh");
    if (gamesState.ra.awardsAsked) send("GetRaAwards", "refresh");
});

// ---- Games › Setup (2.0.0; was Preferences › Games & Apps)

let gameSettingsLoaded = false;

function loadGameSettings(data) {
    const paths = data.paths && typeof data.paths === "object" ? data.paths : {};
    document.querySelectorAll("[data-game-path]").forEach(input => {
        const value = paths[input.dataset.gamePath];
        input.value = typeof value === "string" ? value : "";
    });
    $("headphonesDevice").value = typeof data.headphones === "string" ? data.headphones : "";
    $("soundSwitchKey").value = typeof data.soundSwitch === "string" ? data.soundSwitch : "";
    $("showCovers").checked = data.covers === true;
    $("psoVoiceChannel").value = typeof data.voiceChannel === "string" ? data.voiceChannel : "";
    gamesState.coversEnabled = data.covers === true;
    const devices = Array.isArray(data.devices) ? data.devices.filter(name => typeof name === "string").slice(0, 32) : [];
    $("audioDevices").replaceChildren(...devices.map(name => {
        const option = document.createElement("option");
        option.value = name;
        return option;
    }));
    const state = typeof data.retroAchievements === "string" ? data.retroAchievements : "off";
    $("raPictureRefresh").disabled = state !== "ready";
    $("raStatusText").textContent = state === "ready"
        ? "Set up: credentials found in data\\secrets.ini (kept on this PC, never committed). The key is never shown here."
        : state === "invalid"
            ? "data\\secrets.ini has a user name or key that isn't valid. Open it to fix them."
            : "Not set up. Your user name and Web API key go in data\\secrets.ini, which stays on this PC and is never committed. The key is never shown in Maestro or sent anywhere except retroachievements.org.";
    gameSettingsLoaded = true;
    document.querySelectorAll("[data-game-setting]").forEach(input => { input.disabled = false; });
}

function saveGameSettings() {
    if (!gameSettingsLoaded) return;
    const fields = ["gamePathRetroarch", "gamePathDolphin", "gamePathPcsx2", "gamePathPso", "gamePathDiscord", "headphonesDevice", "soundSwitchKey"]
        .map(id => $(id).value.trim());
    if (fields.some(value => /[|\r\n]/.test(value))) {
        setPageSaveStatus("gamesStatus", "Paths and names cannot contain | or line breaks.");
        return;
    }
    fields.push($("showCovers").checked ? "1" : "0");
    const voice = $("psoVoiceChannel").value.trim();
    if (voice && !/^(https:\/\/((ptb|canary)\.)?discord(app)?\.com\/channels\/|discord:\/\/-\/channels\/)\d{15,21}\/\d{15,21}\/?$/i.test(voice)) {
        setPageSaveStatus("gamesStatus", "The PSO voice channel must be a Discord channel link: https://discord.com/channels/<server>/<channel>.");
        return;
    }
    fields.push(voice);
    setPageSaveStatus("gamesStatus", "Saving…");
    if (!send("SaveGameSettings", fields.join("|"))) setPageSaveStatus("gamesStatus", "Unable to contact Maestro.");
}
// "change" comes when a field is left, or Enter pressed: not on every letter.
document.querySelectorAll("[data-game-setting]").forEach(input => input.addEventListener("change", saveGameSettings));
$("setupRetroAchievements").addEventListener("click", () => send("SetupRetroAchievements"));
$("raPictureRefresh").addEventListener("click", () => {
    setPageSaveStatus("gamesStatus", "Checking for a new profile picture…");
    if (!send("RefreshRaPicture")) setPageSaveStatus("gamesStatus", "Unable to contact Maestro.");
});

// ------------------------------------------------------------ power and system (1.7.0)
// Guarded buttons need a 1.5-second press-and-hold (pointer, Space or
// Enter); letting go early cancels. A completed hold asks ASCS to arm the
// action, ASCS returns a single-use ticket (and any warnings, such as a game
// running), and only then is the action sent, with that ticket. Restart and
// shut down run on Windows' own 30-second timer; every countdown can be
// canceled from the banner on any tab.

const POWER_HOLD_MS = 1500;
const POWER_LABELS = {
    restart: "Restart", shutdown: "Shut down", signout: "Sign out", sleep: "Sleep", recycle: "Empty the Recycle Bin"
};
const POWER_PROGRESS = {
    restart: "Restarting", shutdown: "Shutting down", signout: "Signing out", sleep: "Sleeping"
};
const powerState = { armed: "", confirm: null, pending: null, bannerTimer: null };

function startHold(button) {
    if (button.dataset.holding) return;
    button.dataset.holding = "1";
    const started = performance.now();
    const tick = now => {
        if (!button.dataset.holding) return;
        const progress = Math.min(1, (now - started) / POWER_HOLD_MS);
        button.style.setProperty("--hold", progress.toFixed(3));
        if (progress >= 1) {
            endHold(button);
            armPower(button.dataset.powerHold);
            return;
        }
        button.holdFrame = requestAnimationFrame(tick);
    };
    button.holdFrame = requestAnimationFrame(tick);
}

function endHold(button) {
    delete button.dataset.holding;
    if (button.holdFrame) cancelAnimationFrame(button.holdFrame);
    button.style.setProperty("--hold", "0");
}

function armPower(action) {
    if (!POWER_LABELS[action]) return;
    // A second hold after a warning confirms with the ticket already issued.
    const confirm = powerState.confirm;
    if (confirm && confirm.action === action && Date.now() - confirm.at < 9000) {
        powerState.confirm = null;
        $("powerConfirm").hidden = true;
        send("PowerRun", `${action}|${confirm.ticket}`);
        return;
    }
    powerState.confirm = null;
    $("powerConfirm").hidden = true;
    powerState.armed = action;
    send("PowerArm", action);
}

function handlePowerArmed(data) {
    if (typeof data.action !== "string" || data.action !== powerState.armed || typeof data.ticket !== "string") return;
    powerState.armed = "";
    const warnings = Array.isArray(data.warnings) ? data.warnings.filter(text => typeof text === "string").slice(0, 4) : [];
    if (!warnings.length) {
        send("PowerRun", `${data.action}|${data.ticket}`);
        return;
    }
    powerState.confirm = { action: data.action, ticket: data.ticket, at: Date.now() };
    const box = $("powerConfirm");
    // Each warning as its own sentence, then what to do.
    box.replaceChildren(
        element("strong", "", warnings.map(text => `${text[0].toUpperCase()}${text.slice(1)}.`).join(" ")),
        element("span", "", `Hold ${POWER_LABELS[data.action]} again within 9 seconds to continue anyway.`)
    );
    box.hidden = false;
    setTimeout(() => {
        if (powerState.confirm && Date.now() - powerState.confirm.at >= 9000) {
            powerState.confirm = null;
            box.hidden = true;
        }
    }, 9200);
}

function showPowerBanner(action, seconds) {
    powerState.pending = { action, deadline: Date.now() + seconds * 1000 };
    $("powerBanner").hidden = false;
    const update = () => {
        if (!powerState.pending) return;
        const left = Math.max(0, Math.ceil((powerState.pending.deadline - Date.now()) / 1000));
        $("powerBannerText").textContent = `${POWER_PROGRESS[action] || "Working"} ${left ? `in ${left} s` : "now"}`;
    };
    update();
    clearInterval(powerState.bannerTimer);
    powerState.bannerTimer = setInterval(update, 250);
}

// The countdown ended but apps still show unsaved work: ASCS holds until
// they're saved or closed, or "Restart anyway" is pressed.
const POWER_HELD_NOUN = { restart: "the restart", shutdown: "the shutdown", signout: "signing out" };

function showPowerHeld(action, apps) {
    if (!POWER_PROGRESS[action] || !POWER_HELD_NOUN[action]) return;
    const names = (Array.isArray(apps) ? apps : []).filter(name => typeof name === "string").slice(0, 6);
    powerState.pending = null;
    clearInterval(powerState.bannerTimer);
    $("powerBanner").hidden = false;
    $("powerBanner").classList.add("is-held");
    $("powerBannerText").replaceChildren(
        element("span", "power-held-title", `${POWER_LABELS[action]} on hold`),
        element("span", "power-held-text", `Unsaved work in ${listNames(names)}. Once it's saved or closed, ${POWER_HELD_NOUN[action]} continues on its own.`)
    );
    const anyway = $("powerAnyway");
    anyway.textContent = `${POWER_LABELS[action]} anyway`;
    anyway.hidden = false;
}

function listNames(names) {
    if (names.length < 2) return names[0] || "an open app";
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function hidePowerBanner() {
    powerState.pending = null;
    clearInterval(powerState.bannerTimer);
    $("powerBanner").hidden = true;
    $("powerBanner").classList.remove("is-held");
    $("powerAnyway").hidden = true;
}

function formatBinSize(bytes) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = Math.max(0, Number(bytes) || 0);
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${unit ? value.toFixed(value < 10 ? 1 : 0) : value} ${units[unit]}`;
}

function renderRecycleBin(data) {
    const items = Number(data.items) || 0;
    $("recycleSize").textContent = items ? `${items.toLocaleString()} · ${formatBinSize(data.bytes)}` : "Empty";
    const button = document.querySelector('[data-power-hold="recycle"]');
    button.disabled = items === 0;
}

// The output is chosen from the power tray and from Sounds, with one list.
const AUDIO_MENUS = [
    { button: "audioButton", menu: "audioMenu", current: "audioCurrent", empty: "Audio" },
    { button: "homeAudioButton", menu: "homeAudioMenu", current: "homeAudioCurrent", empty: "Audio output" },
    { button: "soundOutputButton", menu: "soundOutputMenu", current: "soundOutputCurrent", empty: "Audio output" }
];

function closeAudioMenu({ button, menu }) {
    $(menu).hidden = true;
    $(button).setAttribute("aria-expanded", "false");
}

function renderAudioDevices(data) {
    const items = Array.isArray(data.items) ? data.items.filter(item => item && typeof item.name === "string") : [];
    // "Monitor Speaker (LG ULTRAGEAR)"; the name is Windows' own, for switching.
    const labelOf = item => typeof item.label === "string" && item.label ? item.label : item.name;
    const current = items.find(item => item.current === true);
    AUDIO_MENUS.forEach(place => {
        $(place.current).textContent = current ? labelOf(current) : place.empty;
        $(place.button).title = current ? `Audio output: ${labelOf(current)}` : "Choose the audio output";
        const menu = $(place.menu);
        menu.replaceChildren(...items.map(item => {
            const option = element("button", `audio-option${item.current ? " is-current" : ""}`, labelOf(item));
            option.type = "button";
            option.setAttribute("role", "menuitemradio");
            option.setAttribute("aria-checked", String(item.current === true));
            option.addEventListener("click", () => {
                closeAudioMenu(place);
                if (!item.current) send("SelectAudioDevice", item.name);
            });
            return option;
        }));
        if (data.soundSwitch !== true) {
            menu.append(element("p", "settings-note", "SoundSwitch isn't running; Maestro switches outputs through it."));
        }
    });
}

document.querySelectorAll("[data-power-now]").forEach(button => {
    button.addEventListener("click", () => send("PowerNow", button.dataset.powerNow));
});
document.querySelectorAll("[data-power-hold]").forEach(button => {
    button.addEventListener("pointerdown", event => {
        if (event.button !== 0 || button.disabled) return;
        button.setPointerCapture?.(event.pointerId);
        startHold(button);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(type =>
        button.addEventListener(type, () => endHold(button)));
    button.addEventListener("keydown", event => {
        if ((event.key === " " || event.key === "Enter") && !event.repeat) {
            event.preventDefault();
            startHold(button);
        }
    });
    button.addEventListener("keyup", event => {
        if (event.key === " " || event.key === "Enter") endHold(button);
    });
    button.addEventListener("blur", () => endHold(button));
    // A plain click does nothing but remind how these work.
    button.addEventListener("click", event => {
        event.preventDefault();
        if (!powerState.confirm) {
            const hint = $("powerHint");
            hint.classList.remove("is-flashing");
            void hint.offsetWidth;
            hint.classList.add("is-flashing");
        }
    });
});
$("powerCancel").addEventListener("click", () => send("PowerCancel"));
$("powerAnyway").addEventListener("click", () => send("PowerAnyway"));
// The power tray, from the sidebar on every view (1.9.2). Its readings are
// asked for only while it's open.
function refreshPowerTray() {
    send("GetRecycleBin");
    send("GetAudioDevices");
}
function togglePowerTray(show = $("powerTray").hidden) {
    const tray = $("powerTray");
    const button = $("powerTrayButton");
    clearPowerKeys();
    if (!show) {
        tray.hidden = true;
        button.setAttribute("aria-expanded", "false");
        $("audioMenu").hidden = true;
        return;
    }
    const box = button.getBoundingClientRect();
    tray.style.left = `${Math.round(box.right + 12)}px`;
    tray.style.bottom = `${Math.max(12, Math.round(innerHeight - box.bottom))}px`;
    tray.hidden = false;
    button.setAttribute("aria-expanded", "true");
    refreshPowerTray();
    // Focus goes to the tray, not a button, so a second Enter can't lock the PC.
    requestAnimationFrame(() => tray.focus());
}
// Letters in the tray (2.0.0): holding one is holding its button, and the rule
// about a second key lives in powerkeys.js. They act only while the tray is open.
const powerKeys = MaestroPowerKeys.create();

function cancelPowerHolds() {
    document.querySelectorAll("[data-power-hold]").forEach(endHold);
}

function clearPowerKeys() {
    powerKeys.reset();
    cancelPowerHolds();
    showPowerKeysBlocked(false);
}

function showPowerKeysBlocked(blocked) {
    $("powerHintText").textContent = blocked ? "More than one key: nothing happens" : "Hold to confirm";
    $("powerHint").classList.toggle("is-blocked", blocked);
}

document.addEventListener("keydown", event => {
    if ($("powerTray").hidden || !$("audioMenu").hidden) return;
    const result = powerKeys.keydown(event);
    if (result.handled) event.preventDefault();
    if (result.blocked) {
        cancelPowerHolds();
        showPowerKeysBlocked(true);
    }
    if (result.start) {
        const button = document.querySelector(`[data-power-hold="${result.start}"]`);
        if (button && !button.disabled) startHold(button);
    }
}, true);
document.addEventListener("keyup", event => {
    if ($("powerTray").hidden) return;
    const result = powerKeys.keyup(event);
    if (result.handled) event.preventDefault();
    if (result.end) {
        const button = document.querySelector(`[data-power-hold="${result.end}"]`);
        if (button) endHold(button);
    }
    if (result.unlocked) showPowerKeysBlocked(false);
}, true);
window.addEventListener("blur", clearPowerKeys);

$("powerTrayButton").addEventListener("click", () => togglePowerTray());
$("powerTray").addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    togglePowerTray(false);
    $("powerTrayButton").focus();
});
document.addEventListener("pointerdown", event => {
    if (!$("powerTray").hidden && !event.target.closest("#powerTray, #powerTrayButton")) togglePowerTray(false);
});
AUDIO_MENUS.forEach(place => {
    $(place.button).addEventListener("click", () => {
        const menu = $(place.menu);
        menu.hidden = !menu.hidden;
        $(place.button).setAttribute("aria-expanded", String(!menu.hidden));
        if (!menu.hidden) send("GetAudioDevices");
    });
});
document.addEventListener("click", event => {
    AUDIO_MENUS.forEach(place => {
        if (!$(place.menu).hidden && !event.target.closest(`#${place.menu}, #${place.button}`)) closeAudioMenu(place);
    });
});
document.addEventListener("keydown", event => {
    const open = AUDIO_MENUS[1];
    if (event.key === "Escape" && !$(open.menu).hidden) {
        event.stopPropagation();
        closeAudioMenu(open);
        $(open.button).focus();
    }
});

// ------------------------------------------------------------ horizontal wheel (1.7.0)
// A thumb wheel (such as the MX Master's) or a sideways trackpad swipe steps
// through tab strips: one tab per notch, with a short cooldown so a fast
// spin doesn't skip past. Only gestures that are mostly sideways count, so
// ordinary vertical scrolling is never taken over. The selected tab is kept
// in view when a strip is narrower than its tabs.

const WHEEL_STEP = 40;          // pixels of sideways movement per step
const WHEEL_COOLDOWN = 160;     // ms between steps

function selectedIndex(buttons) {
    return buttons.findIndex(button =>
        button.getAttribute("aria-selected") === "true" || button.getAttribute("aria-pressed") === "true");
}

function enableTabWheel(strip, selector) {
    enableWheelStep(strip, direction => {
        const buttons = [...strip.querySelectorAll(selector)].filter(button => !button.disabled && !button.hidden);
        const current = selectedIndex(buttons);
        const next = buttons[Math.max(0, Math.min(buttons.length - 1, (current < 0 ? 0 : current) + direction))];
        if (next && buttons.indexOf(next) !== current) {
            next.click();
            next.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
        }
    });
    enableDragScroll(strip);
}

// One step per notch of a sideways gesture over an element; onStep gets -1 or 1.
function enableWheelStep(strip, onStep) {
    let travel = 0;
    let lastStep = 0;
    strip.addEventListener("wheel", event => {
        // The thumb wheel's sign is flipped to match how it feels on the MX
        // Master (rolling right steps right); Shift + wheel: down steps right.
        const sideways = event.deltaX !== 0 && Math.abs(event.deltaX) > Math.abs(event.deltaY)
            ? -event.deltaX
            : (event.shiftKey ? event.deltaY : 0);
        if (!sideways) return;
        event.preventDefault();
        const scale = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 400 : 1;
        travel += sideways * scale;
        const now = performance.now();
        if (Math.abs(travel) < WHEEL_STEP || now - lastStep < WHEEL_COOLDOWN) return;
        const direction = Math.sign(travel);
        travel = 0;
        lastStep = now;
        onStep(direction);
    }, { passive: false });
}

// Click and drag moves a horizontal strip that overflows. A press only
// becomes a drag after 6 px of movement, so ordinary clicks still work; the
// click that ends a drag is swallowed so it doesn't choose what it landed on.
function enableDragScroll(strip) {
    let drag = null;
    strip.addEventListener("pointerdown", event => {
        if (event.pointerType !== "mouse" || event.button !== 0 || strip.scrollWidth <= strip.clientWidth) return;
        drag = { id: event.pointerId, x: event.clientX, scroll: strip.scrollLeft, moved: false };
    });
    strip.addEventListener("pointermove", event => {
        if (!drag || event.pointerId !== drag.id) return;
        const dx = event.clientX - drag.x;
        if (!drag.moved) {
            if (Math.abs(dx) < 6) return;
            drag.moved = true;
            // Keeps the drag going when the pointer leaves the strip; a pointer
            // that is no longer active can't be captured, and dragging still works.
            try { strip.setPointerCapture(drag.id); } catch { /* not capturable */ }
            strip.classList.add("is-dragging");
        }
        strip.scrollLeft = drag.scroll - dx;
    });
    const end = event => {
        if (!drag || event.pointerId !== drag.id) return;
        if (drag.moved) {
            strip.classList.remove("is-dragging");
            // Swallow only the click this drag produces (if any arrives).
            const swallow = click => { click.stopPropagation(); click.preventDefault(); };
            strip.addEventListener("click", swallow, { capture: true, once: true });
            setTimeout(() => strip.removeEventListener("click", swallow, { capture: true }), 0);
        }
        drag = null;
    };
    strip.addEventListener("pointerup", end);
    strip.addEventListener("pointercancel", end);
}

enableTabWheel(document.querySelector("#logs .logs-sources"), "[data-log-source]");
enableTabWheel(document.querySelector("#logs .logs-levels"), "[data-log-level]");
enableTabWheel($("gamesTabs"), "[role='tab']");
enableTabWheel(document.querySelector(".games-toolbar .logs-sources"), "[data-game-filter]");
enableTabWheel(document.querySelector(".games-toolbar .logs-levels"), "[data-game-sort]");
// Sideways over the almanac strip steps through its items (1.9.2).
enableWheelStep($("homeAlmanac"), direction => {
    stepAlmanac(direction);
    restartAlmanacTimer();
});
// Sideways over the Calendar steps through days, weeks or months (1.9.2).
enableWheelStep($("calendar"), direction => $(direction > 0 ? "calNext" : "calPrev").click());

// ------------------------------------------------------------ start-up rendering
// Runs last, after every declaration above, so nothing is used before it is
// initialized.

try {
    applySidebar(localStorage.getItem(SIDEBAR_KEY) === "1");
} catch {
    applySidebar(false);
}
renderQuickActions();
renderKeymap();
updateClock();
send("GetAlmanac");
send("GetRecycleBin");
send("GetAudioDevices");

// ---- help and shortcuts inside ASCS (1.8.0)
// The shortcuts work only while Maestro has focus. Ctrl + 1, 2... follow the
// sidebar's order, so new pages take the next number; 9 and 0 are free for them.
// Ctrl + - is Preferences and Ctrl + = is Power, the last keys on the number row
// for the last items in the sidebar. F1 (or the ? button in the title bar)
// toggles the help.
const HELP_INSIDE = [
    [["Ctrl", "1–8"], "Go to a page"],
    [["Ctrl", "-"], "Preferences"],
    [["Ctrl", "="], "Power"],
    [["/"], "Search or run a command"],
    [["Arrow keys"], "Move between controls"],
    [["F6"], "Next area: sidebar, title bar, page"],
    [["Alt", "←"], "Previous page (or mouse back)"],
    [["Alt", "→"], "Next page (or mouse forward)"],
    [["Ctrl", "N"], "New note"],
    [["Ctrl", "M"], "Quick Notes: Markdown viewer or text editor"],
    [["Ctrl", "E"], "New calendar event"],
    [["Ctrl", "F"], "Search this page"],
    [["Enter"], "In Quick Notes' filter: the next match in the open note (Shift + Enter, the one before)"],
    [["F1"], "Open or close this help"],
    [["Esc"], "Close a dialog or the palette"]
];
const VIEW_SEARCH = { notes: "notesFilter", games: "gameSearch", sounds: "soundSearch", commands: "commandSearch", dashboard: "logSearch" };

function sidebarViews() {
    return [...document.querySelectorAll(".primary-nav .nav[data-view]")].map(button => button.dataset.view).filter(view => validViews.has(view));
}

function helpAnywhere() {
    const letter = (action, fallback) => (currentHotkeys[action] || fallback).toUpperCase();
    return [
        [["Super"], "Show or hide Maestro"],
        [["Super", "Space"], "Command palette"],
        [["Super", letter("notes", "q")], "Quick Notes"],
        [["Super", "Shift", "C"], "Capture the selection as a note"],
        [["Super", "Shift", "P"], "Paste a note"],
        [["Super", letter("claude", "c")], "Ask Claude"]
    ];
}

function keyRow([keys, action]) {
    const term = element("dt");
    keys.forEach((key, index) => {
        if (index) term.append(element("span", "help-plus", "+"));
        term.append(element("kbd", "", key));
    });
    return [term, element("dd", "", action)];
}

function toggleHelp(show = $("helpDialog").hidden) {
    const dialog = $("helpDialog");
    if (!show) {
        dialog.hidden = true;
        if (helpPreviousFocus instanceof HTMLElement && helpPreviousFocus.isConnected) helpPreviousFocus.focus();
        return;
    }
    helpPreviousFocus = document.activeElement;
    $("helpMeta").textContent = `${$("sidebarVersion")?.textContent || "Maestro"} · F1 opens and closes this`;
    $("helpInside").replaceChildren(...HELP_INSIDE.flatMap(keyRow));
    $("helpAnywhere").replaceChildren(...helpAnywhere().flatMap(keyRow));
    const current = document.querySelector(".view.active")?.id;
    $("helpPages").replaceChildren(...[...sidebarViews().slice(0, 10), "settings"].map((view, index) => {
        const page = element("button", `help-page${view === current ? " is-current" : ""}`);
        page.type = "button";
        page.append(element("kbd", "", view === "settings" ? "-" : String((index + 1) % 10)),
            element("span", "", document.querySelector(`.nav[data-view="${view}"]`)?.title || view));
        if (view === current) page.setAttribute("aria-current", "page");
        page.addEventListener("click", () => { toggleHelp(false); navigate(view); });
        return page;
    }));
    dialog.hidden = false;
    requestAnimationFrame(() => $("helpClose").focus());
}
let helpPreviousFocus = null;
$("helpClose").addEventListener("click", () => toggleHelp(false));
$("helpAllShortcuts").addEventListener("click", () => { toggleHelp(false); navigate("commands"); });
$("helpDialog").addEventListener("click", event => { if (event.target === $("helpDialog")) toggleHelp(false); });
$("titlebarHelp").addEventListener("click", () => toggleHelp());

document.addEventListener("keydown", event => {
    const plainF1 = event.key === "F1" && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
    if (!$("helpDialog").hidden) {
        if (event.key === "Escape" || plainF1) {
            event.preventDefault();
            toggleHelp(false);
        } else if (event.key === "Tab") {
            // Keep focus inside the help.
            const focusable = [...$("helpDialog").querySelectorAll("button")];
            const index = focusable.indexOf(document.activeElement);
            event.preventDefault();
            focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus();
        }
        return;
    }
    if (plainF1) {                          // works even while typing
        event.preventDefault();
        if ($("launcher").hidden && ![...document.querySelectorAll(".confirm-backdrop")].some(dialog => !dialog.hidden)) toggleHelp(true);
        return;
    }
    // The palette and any dialog (confirm, event, calendar) handle their own keys.
    if (!$("launcher").hidden || [...document.querySelectorAll(".confirm-backdrop")].some(dialog => !dialog.hidden)) return;
    const ctrlOnly = event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;

    if (ctrlOnly && /^[0-9]$/.test(event.key)) {
        // In the sidebar's order; a number with no page does nothing.
        const view = sidebarViews()[event.key === "0" ? 9 : Number(event.key) - 1];
        if (!view) return;
        event.preventDefault();
        navigate(view);
        return;
    }
    if (ctrlOnly && event.key === "-") {
        event.preventDefault();
        navigate("settings");
        return;
    }
    if (ctrlOnly && event.key === "=") {
        // Only opens the tray: its actions still need the hold.
        event.preventDefault();
        togglePowerTray();
        if ($("powerTray").hidden) $("powerTrayButton").focus();
        return;
    }
    if (ctrlOnly && event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (!$("notes").classList.contains("active")) navigate("notes");
        if (notesLoaded) $("newNoteButton").click();
        else newNoteWhenLoaded = true;      // navigate() has asked for them
        return;
    }
    if (ctrlOnly && event.key.toLowerCase() === "e") {
        event.preventDefault();
        newEventFromShortcut();
        return;
    }
    // Quick Notes only, and from inside the text too: the viewer or the editor.
    if (ctrlOnly && event.key.toLowerCase() === "m" && $("notes").classList.contains("active") && !$("noteModes").hidden) {
        event.preventDefault();
        setNoteMode(noteMode === "read" ? "edit" : "read");
        return;
    }
    if (ctrlOnly && event.key.toLowerCase() === "f") {
        event.preventDefault();
        const view = document.querySelector(".view.active")?.id;
        const search = VIEW_SEARCH[view] ? $(VIEW_SEARCH[view]) : null;
        if (search) {           // only ever "search this page"; Super + Space is the palette
            // The box may be on a section that isn't showing.
            if (view === "games") gamesSections.show("library");
            if (view === "commands") commandsSections.show("keymap");
            if (view === "dashboard") systemSections.show("activity");
            search.focus();
            search.select();
        }
    }
});

// ------------------------------------------------------------ pointer and keyboard travel

// A dialog or the palette has its own keys, and the page behind it stays put.
function coveringDialog() {
    if (!$("launcher").hidden) return $("launcher");
    return [...document.querySelectorAll(".confirm-backdrop")].find(dialog => !dialog.hidden) ?? null;
}

function moveThroughPages(direction) {
    if (coveringDialog()) return;
    const view = direction === "back" ? viewHistory.back() : viewHistory.forward();
    if (view) navigate(view, true);
}

// Mouse side buttons report as buttons 3 and 4. Only while the pointer is over
// the page: nothing here hooks the mouse system-wide.
const SIDE_BUTTONS = { 3: "back", 4: "forward" };
document.addEventListener("mousedown", event => {
    if (SIDE_BUTTONS[event.button]) event.preventDefault();
}, true);
document.addEventListener("mouseup", event => {
    const direction = SIDE_BUTTONS[event.button];
    if (!direction) return;
    event.preventDefault();
    moveThroughPages(direction);
}, true);

// F6 and Shift + F6 move between the page's areas.
function moveToArea(step) {
    const areas = [".sidebar", ".topbar", ".view.active"].map(selector => document.querySelector(selector)).filter(Boolean);
    const at = areas.findIndex(area => area.contains(document.activeElement));
    const area = areas[(at + step + areas.length) % areas.length];
    const target = area.querySelector(".nav.active") ?? arrowCandidates([area], null)[0]?.node;
    target?.focus();
    target?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

document.addEventListener("keydown", event => {
    if (event.defaultPrevented) return;
    const plain = !event.ctrlKey && !event.altKey && !event.metaKey;
    // Some mouse software sends the browser keys instead of the buttons.
    if (event.key === "BrowserBack" || event.key === "BrowserForward") {
        event.preventDefault();
        moveThroughPages(event.key === "BrowserBack" ? "back" : "forward");
    } else if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        moveThroughPages(event.key === "ArrowLeft" ? "back" : "forward");
    } else if (event.key === "F6" && plain && !coveringDialog() && $("powerTray").hidden) {
        event.preventDefault();
        moveToArea(event.shiftKey ? -1 : 1);
    } else if (event.key === "/" && plain && !event.shiftKey && !coveringDialog() && $("powerTray").hidden && !document.activeElement?.matches(KEEPS_ARROWS)) {
        event.preventDefault();
        $("titlebarCommand").click();
    }
});

const ARROW_TARGETS = "a[href], button, input, select, textarea, [role='button'], [tabindex='0']";
const KEEPS_ARROWS = "textarea, select, [contenteditable='true'], [role='slider'], [role='listbox'], input:not([type='button'], [type='checkbox'], [type='submit'])";

function arrowCandidates(scopes, from) {
    return scopes.flatMap(scope => [...scope.querySelectorAll(ARROW_TARGETS)]).filter(node => {
        if (node === from || node.disabled || node.closest("[hidden], [aria-hidden='true']")) return false;
        if (node.matches("[role='tab'][tabindex='-1']")) return false;      // a tab row is one stop; its own keys move along it
        if (node.id === "sidebarToggle") return false;      // on the sidebar's edge, and in the way: Tab reaches it
        if (node.matches("[data-pointer-only]")) return false;      // a grip's keys do its job
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== "hidden";
    }).map(node => ({ node, rect: node.getBoundingClientRect() }));
}

// Runs after each control's own keys: one that uses the arrows has already
// claimed them. With nowhere to go, the arrow scrolls the page as usual.
document.addEventListener("keydown", event => {
    if (!event.key.startsWith("Arrow") || event.defaultPrevented) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const from = document.activeElement;
    if (!from || from === document.body || from.matches(KEEPS_ARROWS)) return;
    if (!$("launcher").hidden) return;
    const panel = !$("powerTray").hidden ? $("powerTray") : !$("attentionPanel").hidden ? $("attentionPanel") : coveringDialog();
    const scopes = panel ? [panel] : [document.querySelector(".sidebar"), document.querySelector(".topbar"), document.querySelector(".view.active")].filter(Boolean);
    const next = MaestroKeyNav.pick(from.getBoundingClientRect(), arrowCandidates(scopes, from), event.key);
    if (!next) return;
    event.preventDefault();
    next.focus();
    next.scrollIntoView({ block: "nearest", inline: "nearest" });
});

// Each sidebar item shows its Ctrl number, worked out from the sidebar's
// order so it stays right when views are added.
function numberSidebar() {
    const addKey = (button, digit) => {
        button.querySelector(".nav-key")?.remove();
        const key = element("kbd", "nav-key", digit);
        key.setAttribute("aria-hidden", "true");
        key.title = `Ctrl + ${digit}`;
        button.append(key);
        button.setAttribute("aria-keyshortcuts", `Control+${digit}`);
    };
    document.querySelectorAll(".primary-nav .nav[data-view]").forEach((button, index) => {
        if (index < 10) addKey(button, String((index + 1) % 10));       // the tenth is Ctrl + 0
    });
    addKey(document.querySelector('.nav[data-view="settings"]'), "-");
    addKey($("powerTrayButton"), "=");
}
numberSidebar();
