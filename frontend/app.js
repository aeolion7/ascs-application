"use strict";

// Page errors are written to the ASCS log (and so ASCS Logs), at most ten
// per session, so a problem in the page is never invisible.
let reportedPageErrors = 0;
function reportPageError(message, where) {
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

const $ = id => document.getElementById(id);
const validViews = new Set(["home", "notes", "calendar", "workspaces", "games", "sounds", "dashboard", "commands", "settings"]);
const viewLabels = {
    home: "COMMAND CENTER",
    notes: "QUICK NOTES",
    calendar: "CALENDAR",
    workspaces: "WORKSPACES",
    games: "GAMES",
    sounds: "SOUNDS",
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
    const input = document.querySelector(`#${view} [data-primary-input]`);
    if (!input) return;

    input.focus();
    if (input === $("noteText")) {
        input.setSelectionRange(input.value.length, input.value.length);
    }
}

function navigate(view) {
    if (!validViews.has(view)) return;
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
    if (view === "settings") send("GetSettings");
    if (view === "workspaces") {
        send("GetWorkspaces");
        send("GetLaunchRules");
        send("GetWindows");
    }
    if (view === "home" && previousView !== null && previousView !== "home") advanceAlmanac();
    if (view === "home") preloadGames();
    if (view === "sounds") openSoundsView();
    if (view === "calendar") openCalendarView();
    if (view === "games") startGamesPolling();
    else stopGamesPolling();
    if (view === "commands") startRunningPolling();
    else stopRunningPolling();
    if (view === "settings") send("GetGameSettings");

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
    { id: "view:home", label: "Command Center", description: "Open the ASCS home view", keywords: "home overview activity", view: "home" },
    { id: "view:notes", label: "Quick Notes", description: "Open your notes", keywords: "notes scratchpad snippets", view: "notes", hotkey: "notes" },
    { id: "view:calendar", label: "Calendar", description: "Your calendars: day, week, month and agenda", keywords: "calendar events schedule agenda appointments", view: "calendar" },
    { id: "calendar:new", label: "New calendar event", description: "Opens the event editor (Ctrl + E). Or type + and the event: +Dentist tue 3pm", keywords: "calendar event add appointment meeting new", shortcut: "Ctrl+E", run: () => newEventFromShortcut() },
    { id: "view:sounds", label: "Sounds", description: "Every Windows sound; levels; set Windows and ASCS sounds", keywords: "sounds audio wav windows startup chimes level", view: "sounds" },
    { id: "view:dashboard", label: "System Dashboard", description: "View live system metrics and hardware", keywords: "dashboard metrics hardware", view: "dashboard", hotkey: "dashboard" },
    { id: "view:commands", label: "Shortcut Reference", description: "Browse the complete Super shortcut list", keywords: "commands shortcuts help", view: "commands" },
    { id: "view:games", label: "Games", description: "Play time, recent games, and achievements", keywords: "play emulator retroarch dolphin pcsx2 pso achievements", view: "games" },
    { id: "view:logs", label: "Logs", description: "ASCS, activity and Code key logs, newest first", keywords: "log diagnostics errors journal history", run: () => toggleLogs(true) },
    { id: "view:settings", label: "Preferences", description: "Drives, snapping, shortcuts, and custom commands", keywords: "settings options configure", view: "settings" },
    { id: "mode:snippets", label: "Paste a note…", description: "Paste a note into the window you were using", keywords: "snippet paste insert text note", mode: "snippets", shortcut: "Super+Shift+P" },
    { id: "mode:workspaces", label: "Restore a workspace…", description: "Choose a saved window layout", keywords: "workspace layout restore", mode: "workspaces", shortcut: "Super+Shift+R" },
    { id: "mode:save-workspace", label: "Save workspace as…", description: "Save the current window layout under a name", keywords: "workspace layout save name", mode: "save-workspace" },
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
    { id: "launch:reload", label: "Reload ASCS", description: "Save notes and restart ASCS to apply changes", keywords: "restart refresh script", launch: "reload", shortcut: "Ctrl+Alt+Shift+A" }
];

const paletteModes = {
    all: { chip: "", title: "Commands", placeholder: "Search commands, notes, windows… (= math, ? web, + event)" },
    snippets: { chip: "Paste", title: "Paste a note", placeholder: "Filter notes…" },
    ask: { chip: "Fill in", title: "Fill in the blanks", placeholder: "" },
    workspaces: { chip: "Workspaces", title: "Restore a workspace", placeholder: "Filter saved workspaces…" },
    windows: { chip: "Windows", title: "Switch to a window", placeholder: "Filter open windows…" },
    "save-workspace": { chip: "Save workspace", title: "Save the current layout", placeholder: "Name this workspace (letters, numbers, spaces, - _)" },
    pick: { chip: "Add quick action", title: "Pin a quick action", placeholder: "Search views, apps, commands, workspaces, notes…" },
    "games:retroarch": { chip: "RetroArch", title: "Recent RetroArch games", placeholder: "Filter games…" },
    "games:dolphin": { chip: "Dolphin", title: "Recent Dolphin games", placeholder: "Filter games…" },
    "games:pcsx2": { chip: "PCSX2", title: "Recent PCSX2 games", placeholder: "Filter games…" }
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
    if (mode === "all" || mode === "workspaces" || mode === "pick") {
        savedWorkspaces.forEach(workspace => items.push({
            id: `ws:${workspace.name.toLowerCase()}`, label: `Restore workspace “${workspace.name}”`,
            description: `${workspace.windows} window${workspace.windows === 1 ? "" : "s"} · saved ${formatSavedTime(workspace.saved)}`,
            keywords: `workspace layout ${workspace.name}`, badge: "WORKSPACE",
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

    if (query.kind === "event") {
        results.push(quickAddOption(query.text));
        return results;
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
            ? "No notes yet. Start one in Quick Notes."
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
    $("launcherTitle").textContent = `Fill in “${noteLabel(askState.note)}”`;
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

function openNote(id) {
    const note = notesData.notes.find(item => item.id === id);
    if (!note) return;
    if (noteGroupPrefs.collapsed.delete(ASCSNotes.groupKey(note.group))) saveNoteGroupPrefs();
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
$("settingsForm").addEventListener("submit", event => {
    event.preventDefault();
    const hotkeys = [...document.querySelectorAll("[data-hotkey]")]
        .map(input => input.value.trim().toLowerCase());
    const content = [
        $("driveLetters").value.trim(),
        $("snapGap").value,
        $("preserveWindowSize").checked ? "1" : "0",
        hotkeys.join(","),
        $("claudeShortcut").value.trim(),
        $("powerDelay").value,
        $("ascsSounds").value,
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
    if (!$("confirmDialog").hidden || !$("launcher").hidden || !$("helpDialog").hidden || !$("logsDialog").hidden) return;
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
            title: `Merge into ${existing}?`,
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
        title: `Delete the ${group.name} group?`,
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
    $("noteKindLabel").textContent = isCode ? "CODE" : "NOTE";
    $("noteText").classList.toggle("code-editor", isCode);
    $("noteText").spellcheck = notesSpellcheck() && !isCode;
    document.querySelector(".editor-card").dataset.kind = isCode ? "code" : "note";
    $("previewNoteButton").hidden = isCode;
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
    $("previewNoteButton").disabled = !note;
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
    if (notePreviewOn) {
        notePreviewOn = false;
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

// Spell-check in Quick Notes (Preferences › General): on by default, and
// never in code notes. Kept on this PC with the page's other preferences.
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
});
window.addEventListener("blur", flushPendingNotes);

function handleWebMessage(event) {
    let data = event.data;
    if (typeof data === "string" && data.startsWith("ALMANAC\n")) {
        const [, kind, ...rest] = data.split("\n");
        handleAlmanacFeed(kind, rest.join("\n"));
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
            if (view === "home") {
                advanceAlmanac();
                preloadGames();
            }
            if (!$("logsDialog").hidden) startLogPolling();
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
            renderQuickActions();
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
            renderWorkspaceManager(data.monitors);
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
            renderGames();
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
                if (gamesState.openId === data.id) renderGames();
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
        case "gameSettingsSaved":
            $("gamesStatus").textContent = typeof data.message === "string" ? data.message : "Saved.";
            gamesState.covers.clear();
            gamesState.requested.clear();
            break;
        case "raExtra":
            // A game or the recent unlocks couldn't be fetched (1.9.0).
            if (typeof data.kind === "string" && typeof data.message === "string") {
                if (data.kind === "unlocks") gamesState.ra.unlocksError = data.message;
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
            break;
        case "settingsSaved":
            updateShortcutReference(Object.fromEntries(
                [...document.querySelectorAll("[data-hotkey]")].map(input =>
                    [input.dataset.hotkey, input.value.trim().toUpperCase()])
            ));
            $("settingsStatus").textContent = data.message || "Preferences saved.";
            setSettingsDirty(false);
            showToast(data.message || "Preferences saved.");
            break;
        case "error":
            if (data.scope === "notes") {
                pendingSaveData.shift();
                setSaveStatus("SAVE FAILED", "error");
            }
            if (data.scope === "games") {
                $("gamesStatus").textContent = typeof data.message === "string" ? data.message : "Games & apps could not be saved.";
            }
            if (data.scope === "almanac") {
                setAlmanacStatus(typeof data.message === "string" ? data.message : "The almanac could not be saved.");
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

// System Dashboard: recent sign-ins as a graph with data points, oldest on the
// left (1.9.2). The pointer anywhere over the graph picks the nearest point and
// shows its card; on the keyboard, Tab reaches the latest and the arrows move.
const signInState = { rows: [], points: [], middle: 0 };
const signInSeconds = ms => `${(ms / 1000).toFixed(1)} s`;

function signInWhen(item) {
    const date = new Date(item.time);
    return Number.isNaN(date.getTime()) ? item.time : date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function renderSignInHistory(items) {
    const rows = (Array.isArray(items) ? items : []).filter(item => item && typeof item.time === "string" && Number.isFinite(item.retrobar) && item.retrobar >= 0).slice(0, 20).reverse();
    if (!rows.length) return;
    const graph = ASCSCharts.pointGraph(rows.map(item => item.retrobar), 300, 56);
    const plot = $("signInPlot");
    plot.querySelector(".sparkline-area").setAttribute("d", graph.area);
    plot.querySelector(".sparkline-line").setAttribute("d", graph.line);
    const sorted = rows.map(item => item.retrobar).sort((a, b) => a - b);
    signInState.rows = rows;
    signInState.points = graph.points;
    signInState.middle = sorted[Math.floor(sorted.length / 2)];
    $("signInLatest").textContent = signInSeconds(rows[rows.length - 1].retrobar);
    $("signInSummary").textContent = `Latest time until the taskbar is ready, after SignIn.ahk starts. Middle of the last ${rows.length}: ${signInSeconds(signInState.middle)}.`;
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
        point.setAttribute("aria-label", `${signInWhen(item)}: ${signInSeconds(item.retrobar)}`);
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
}

function showSignInTip(index) {
    const item = signInState.rows[index];
    if (!item) return;
    const tip = $("signInTip");
    const rule = $("signInRule");
    const { x, y } = signInState.points[index];
    const head = element("div", "signin-tip-head");
    const difference = item.retrobar - signInState.middle;
    head.append(element("strong", "", signInSeconds(item.retrobar)), element("small", "", Math.abs(difference) < 50
        ? "About the usual" : `${signInSeconds(Math.abs(difference))} ${difference > 0 ? "over" : "under"} the middle`));
    const stages = element("dl", "signin-tip-stages");
    [["Windows taskbar", item.taskbar], ["RetroBar ready", item.retrobar], ["Other apps", item.apps], ["Keychron", item.keychron]]
        .filter(([, ms]) => Number.isFinite(ms) && ms >= 0)
        .forEach(([label, ms]) => stages.append(element("dt", "", label), element("dd", "", signInSeconds(ms))));
    tip.replaceChildren(element("span", "signin-tip-when", signInWhen(item)), head, stages);
    if (typeof item.sound === "string" && item.sound) tip.append(element("span", "signin-tip-sound", `Sound: ${item.sound}`));
    tip.hidden = false;
    rule.hidden = false;
    rule.style.left = `${x}%`;
    // Beside the point, kept inside the graph; above it, unless that would go
    // under the title bar.
    const plot = $("signInPlot").getBoundingClientRect();
    const middle = plot.width * x / 100;
    tip.style.left = `${Math.max(0, Math.min(plot.width - tip.offsetWidth, middle - tip.offsetWidth / 2))}px`;
    const above = plot.top + plot.height * y / 100 - tip.offsetHeight - 14 > ($("signInPlot").closest(".main")?.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0);
    tip.classList.toggle("is-below", !above);
    tip.style.top = above ? `${plot.height * y / 100 - tip.offsetHeight - 14}px` : `${plot.height * y / 100 + 14}px`;
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

function loadSettings(data) {
    $("searchTemplate").value = typeof data.searchTemplate === "string" ? data.searchTemplate : "";
    $("claudeShortcut").value = typeof data.claudeShortcut === "string" ? data.claudeShortcut : "";
    $("powerDelay").value = [0, 5, 30].includes(data.powerDelay) ? String(data.powerDelay) : "5";
    $("ascsSounds").value = ["off", "start", "show"].includes(data.ascsSounds) ? data.ascsSounds : "show";
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
    setSettingsDirty(false);
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
    renderHistory(data.history);
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
    launch: "Opened", workspace: "Workspace", note: "Notes", snippet: "Pasted",
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
            class: "km-key",
            "data-key": key.id,
            "data-cat": category,
            tabindex: binding || key.special ? 0 : -1
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
        group.append(label);
        const specialCaption = key.special === "super" ? "Hold" : key.special === "macro" ? key.caption : "";
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
    container.dataset.layer = layer;
    container.classList.toggle("is-searching", Boolean(keymapQuery));
    document.querySelectorAll(".keymap-layer").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.layer === layer));
    });
    $("keymapDetail").dataset.summary = layer === "shift"
        ? `${used} keys have a Super + Shift action. Other letters keep their Super action; macro keys have none with Shift.`
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
        const running = KEYMAP_RUNNING_APPS[key.id] && runningApps[KEYMAP_RUNNING_APPS[key.id]] ? " Running now." : "";
        text.textContent = ` · ${binding.title}. ${binding.desc}${binding.configurable ? " (Change the letter in Preferences.)" : ""}${running}`;
    } else if (key.note) {
        keys.textContent = key.label;
        text.textContent = ` · ${key.note.replace(/^[^:]+:\s*/, "")}`;
    } else if (passthrough && layer === "super") {
        text.textContent = ` · Free in ASCS; passes ${passthrough} through to Windows.`;
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
let quickActionsEditing = false;

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
    container.classList.toggle("is-editing", quickActionsEditing);

    ids.forEach(id => {
        const item = catalog.get(id);
        if (!item && !quickActionsEditing) return;
        const wrap = document.createElement("div");
        wrap.className = "action-card-wrap";
        const card = document.createElement("button");
        card.type = "button";
        card.className = "action-card";
        if (item?.badge) card.dataset.kind = item.badge.toLowerCase();
        const icon = document.createElement("span");
        icon.className = "action-icon";
        icon.innerHTML = iconSvg(item);   // static, trusted markup only (never item text)
        const copy = document.createElement("span");
        copy.className = "action-copy";
        const title = document.createElement("strong");
        title.textContent = item ? item.label : "Unavailable";
        const detail = document.createElement("small");
        detail.textContent = item ? (item.description || "").slice(0, 60) : `${id} no longer exists`;
        copy.append(title, detail);
        const arrow = document.createElement("span");
        arrow.className = "action-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = item?.view ? "→" : "↗";
        card.append(icon, copy, arrow);
        card.disabled = !item || quickActionsEditing;
        if (item) card.addEventListener("click", () => runQuickAction(item));
        wrap.append(card);
        if (quickActionsEditing) {
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "action-remove";
            remove.setAttribute("aria-label", `Remove ${item ? item.label : id}`);
            remove.textContent = "×";
            remove.addEventListener("click", () => saveQuickActions(currentQuickActionIds().filter(other => other !== id)));
            wrap.append(remove);
        }
        container.append(wrap);
    });

    if (quickActionsEditing && ids.length < MAX_QUICK_ACTIONS) {
        const add = document.createElement("button");
        add.type = "button";
        add.className = "action-card action-add";
        add.innerHTML = '<span class="action-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></span>';
        const label = document.createElement("span");
        label.className = "action-copy";
        label.innerHTML = "<strong>Add quick action</strong><small></small>";
        label.querySelector("small").textContent = `${MAX_QUICK_ACTIONS - ids.length} of ${MAX_QUICK_ACTIONS} slots free`;
        add.append(label);
        add.addEventListener("click", () => openLauncher("pick"));
        container.append(add);
    }
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
    quickActionsEditing = !quickActionsEditing;
    $("editQuickActions").setAttribute("aria-pressed", String(quickActionsEditing));
    $("editQuickActions").textContent = quickActionsEditing ? "Done" : "Edit";
    renderQuickActions();
});

// ------------------------------------------------------------ dashboard history (1.7.0)

function renderHistory(history) {
    if (!Array.isArray(history) || !globalThis.ASCSCharts) return;
    [["cpu", 0], ["ram", 1]].forEach(([name, index]) => {
        const values = history.map(sample => (Array.isArray(sample) ? sample[index] : null));
        const graph = ASCSCharts.sparkline(values, 300, 56, 3);
        const svg = $(`${name}Spark`);
        if (!svg) return;
        svg.querySelector(".sparkline-area").setAttribute("d", graph.area);
        svg.querySelector(".sparkline-line").setAttribute("d", graph.line);
        const minutes = Math.max(1, Math.round(graph.count * 10 / 60));
        const summary = graph.count >= 2 ? `peak ${graph.peak}% · last ${minutes} min` : "";
        if (name === "cpu") {
            $("cpuHistory").textContent = summary ? `Average ${graph.average}% · ${summary}` : "History builds every 10 seconds";
        } else {
            $("ramHistory").textContent = summary ? `· ${summary}` : "";
        }
    });
}

// ------------------------------------------------------------ quick notes: tags, preview (1.7.0)

let notePreviewOn = false;

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
}

function updateWordCount() {
    const note = activeNote();
    const words = note ? ASCSNotes.wordCount(note.content) : 0;
    $("noteWords").textContent = note ? `${words} ${words === 1 ? "word" : "words"}` : "";
}

// Builds the preview with elements and textContent only; note text is never
// parsed as HTML. Links are displayed (with the address on hover), not opened.
function appendInline(parent, nodes) {
    nodes.forEach(node => {
        let element;
        switch (node.type) {
            case "strong": element = document.createElement("strong"); break;
            case "em": element = document.createElement("em"); break;
            case "code": element = document.createElement("code"); break;
            case "link":
                element = document.createElement("span");
                element.className = "md-link";
                element.title = node.url;
                break;
            case "tag":
                element = document.createElement("button");
                element.type = "button";
                element.className = "md-tag";
                element.addEventListener("click", () => toggleTagFilter(node.text));
                element.textContent = `#${node.text}`;
                parent.append(element);
                return;
            default:
                parent.append(document.createTextNode(node.text));
                return;
        }
        element.textContent = node.text;
        parent.append(element);
    });
}

function renderMarkdown(container, blocks) {
    container.replaceChildren();
    blocks.forEach(block => {
        let element;
        if (block.type === "pre") {
            element = document.createElement("pre");
            element.textContent = block.text;
        } else if (block.type === "hr") {
            element = document.createElement("hr");
        } else if (block.type === "ul" || block.type === "ol") {
            element = document.createElement(block.type);
            block.items.forEach(children => {
                const item = document.createElement("li");
                appendInline(item, children);
                element.append(item);
            });
        } else if (["h1", "h2", "h3", "p", "blockquote"].includes(block.type)) {
            element = document.createElement(block.type);
            appendInline(element, block.children);
        } else {
            return;
        }
        container.append(element);
    });
    if (!blocks.length) {
        const empty = document.createElement("p");
        empty.className = "note-preview-empty";
        empty.textContent = "Nothing to preview yet.";
        container.append(empty);
    }
}

function updateNotePreview() {
    const note = activeNote();
    const show = notePreviewOn && note && note.type !== "code";
    $("previewNoteButton").setAttribute("aria-pressed", String(Boolean(show)));
    $("previewNoteButton").textContent = show ? "Edit" : "Preview";
    $("notePreview").hidden = !show;
    $("noteText").hidden = Boolean(show);
    if (show) renderMarkdown($("notePreview"), ASCSNotes.parseMarkdown(note.content));
}

$("previewNoteButton").addEventListener("click", () => {
    notePreviewOn = !notePreviewOn;
    updateNotePreview();
    if (!notePreviewOn) focusPrimaryInput("notes");
});

// ------------------------------------------------------------ preferences: navigation, save bar (1.7.0)

function setSettingsDirty(dirty) {
    const bar = $("settingsSavebar");
    if (!bar) return;
    bar.dataset.state = dirty ? "dirty" : "clean";
    if (dirty) $("settingsStatus").textContent = "Unsaved changes";
}

$("settingsForm").addEventListener("input", () => setSettingsDirty(true));
$("settingsForm").addEventListener("change", () => setSettingsDirty(true));

// Preferences tabs: one section at a time, like the sub-pages of Windows
// Settings. The save bar belongs to the settings form, so it shows only on
// the tabs it saves; unsaved edits survive switching between those tabs.
const SETTINGS_TAB_KEY = "ascs.preferences.tab";

function settingsTabs() {
    return [...document.querySelectorAll(".settings-nav [role='tab']")]
        .map(tab => ({ tab, panel: $(tab.dataset.section) }))
        .filter(item => item.panel);
}

function selectSettingsTab(id, focus = false) {
    const items = settingsTabs();
    if (!items.length) return;
    const chosen = items.find(item => item.panel.id === id) || items[0];
    items.forEach(item => {
        const selected = item === chosen;
        item.tab.setAttribute("aria-selected", String(selected));
        item.tab.tabIndex = selected ? 0 : -1;
        item.panel.hidden = !selected;
    });
    $("settingsSavebar").hidden = !$("settingsForm").contains(chosen.panel);
    try { localStorage.setItem(SETTINGS_TAB_KEY, chosen.panel.id); } catch { /* storage unavailable */ }
    if (focus) chosen.tab.focus();
}

settingsTabs().forEach(({ tab, panel }) => {
    tab.addEventListener("click", () => selectSettingsTab(panel.id));
    tab.addEventListener("keydown", event => {
        const items = settingsTabs();
        const index = items.findIndex(item => item.tab === tab);
        const moves = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: items.length - 1 - index };
        if (!(event.key in moves)) return;
        event.preventDefault();
        const next = items[(index + moves[event.key] + items.length) % items.length];
        selectSettingsTab(next.panel.id, true);
    });
});

let savedSettingsTab = "";
try { savedSettingsTab = localStorage.getItem(SETTINGS_TAB_KEY) || ""; } catch { /* storage unavailable */ }
selectSettingsTab(savedSettingsTab);

// ------------------------------------------------------------ super commands search (1.7.0)

let keymapQuery = "";

function filterShortcutRows() {
    let anyVisible = false;
    document.querySelectorAll("#commands .command-group").forEach(group => {
        let groupVisible = false;
        group.querySelectorAll(".shortcut-row").forEach(row => {
            const match = !keymapQuery || row.textContent.toLocaleLowerCase().includes(keymapQuery);
            row.hidden = !match;
            if (match) groupVisible = true;
        });
        group.hidden = !groupVisible;
        if (groupVisible) anyVisible = true;
    });
    $("commandSearchEmpty").hidden = anyVisible;
}

$("commandSearch").addEventListener("input", () => {
    keymapQuery = $("commandSearch").value.trim().toLocaleLowerCase();
    filterShortcutRows();
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
    strip.append(almanacCell(moonIcon, [moon.name],
        `${Math.round(moon.illumination * 100)}% illuminated · ${moon.waxing ? "waxing" : "waning"}`));

    // Sun
    const sun = Almanac.sunTimes(now, settings.latitude, settings.longitude);
    if (sun) {
        const sunIcon = svgNode("svg", { class: "alm-sun", viewBox: "0 0 32 32", "aria-hidden": "true" });
        sunIcon.append(svgNode("path", { d: "M6 22h20M10 22a6 6 0 0 1 12 0" }), svgNode("path", { d: "M16 9v3M9.2 12.2l2 2M22.8 12.2l-2 2" }));
        const dash = document.createElement("i");
        dash.textContent = " — ";
        const hours = Math.floor(sun.daylightMinutes / 60);
        strip.append(almanacCell(sunIcon, [formatClockTime(sun.sunrise), dash, formatClockTime(sun.sunset)],
            `${settings.place} · ${hours} h ${sun.daylightMinutes % 60} m of daylight`));
    }

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

function almanacSources(now = new Date()) {
    return {
        history: almanacState.history,
        holidays: almanacState.holidays,
        featured: almanacState.featured,
        quote: Almanac.quoteFor(globalThis.ASCSQuotes, now)
    };
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
    label.textContent = item.label.toUpperCase();
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

// Almanac and Countdowns save together (one payload), from either tab.
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
    if (!send("SaveAlmanac", lines.join("\n"))) setAlmanacStatus("Unable to contact ASCS.");
}
$("saveAlmanacButton").addEventListener("click", saveAlmanacPreferences);
$("saveCountdownsButton").addEventListener("click", saveAlmanacPreferences);

// ------------------------------------------------------------ logs (1.7.0)
// Read-only tails of three fixed log files. ASCS sends the text as a plain
// string; ASCSLogs parses it, and lines are rendered as text. While the dialog
// is visible it asks for a refresh every 3 seconds, which ASCS answers only
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
        const heading = document.createElement("h2");
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
    else if (!logState.loaded) meta = "Loading…";
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
        button.setAttribute("aria-selected", String(button.dataset.logSource === source)));
    try { localStorage.setItem(LOG_SOURCE_KEY, source); } catch { /* storage unavailable */ }
    renderLogs();
    requestLog();
}

function startLogPolling() {
    stopLogPolling();
    requestLog();
    logState.timer = setInterval(() => {
        if (!$("logsDialog").hidden && !document.hidden) requestLog(true);
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
// ASCS Logs, a dialog opened from System Dashboard or the palette (1.9.2).
let logsPreviousFocus = null;
function toggleLogs(show = $("logsDialog").hidden) {
    const dialog = $("logsDialog");
    if (!show) {
        dialog.hidden = true;
        stopLogPolling();
        if (logsPreviousFocus instanceof HTMLElement && logsPreviousFocus.isConnected) logsPreviousFocus.focus();
        return;
    }
    logsPreviousFocus = document.activeElement;
    dialog.hidden = false;
    startLogPolling();
    requestAnimationFrame(() => $("logSearch").focus());
}
$("openLogsButton").addEventListener("click", () => toggleLogs(true));
$("logsClose").addEventListener("click", () => toggleLogs(false));
$("logsDialog").addEventListener("click", event => { if (event.target === $("logsDialog")) toggleLogs(false); });
$("logsDialog").addEventListener("keydown", event => {
    if (event.key === "Escape") {
        event.preventDefault();
        toggleLogs(false);
    } else if (event.key.toLowerCase() === "f" && event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault();
        $("logSearch").focus();
        $("logSearch").select();
    } else if (event.key === "Tab") {
        // Keep focus inside the dialog.
        const focusable = [...$("logsDialog").querySelectorAll("button:not(:disabled), input")];
        const index = focusable.indexOf(document.activeElement);
        event.preventDefault();
        focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus();
    }
});
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
    button.setAttribute("aria-selected", String(button.dataset.logSource === logState.source)));

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
        unlocks: "", unlocksError: "", unlocksOpen: false, unlockPage: 0 },
    raImages: new Map(), raRequested: new Set(),
    liveTimer: null, runningTimer: null, playing: [], nowTimer: null
};

function gameMonogram(game) {
    const words = Games.displayTitle(game.title).split(/\s+/).filter(word => /^[\p{L}\p{N}]/u.test(word));
    return (words.slice(0, 2).map(word => [...word][0]).join("") || "?").toUpperCase();
}

function gameCover(game, className) {
    const holder = document.createElement("span");
    holder.className = `game-cover ${className}`;
    holder.dataset.emulator = game.emulator;
    holder.dataset.gameId = game.id;
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

function renderGames() {
    if (!Games) return;
    const items = gamesState.items;

    // Continue playing: the twelve most recent games ASCS can start, in a
    // row that scrolls sideways (thumb wheel, trackpad, or Shift + wheel).
    const recent = Games.sortGames(items.filter(game => game.launchable && game.installed !== false && game.last), "recent").slice(0, 12);
    const shelf = $("gamesContinue");
    shelf.replaceChildren(...recent.map(game => {
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
    }));
    if (!recent.length) {
        const empty = document.createElement("p");
        empty.className = "settings-note";
        empty.textContent = gamesState.loaded ? "No recent games yet. Games you play in RetroArch, Dolphin, or PCSX2 appear here." : "Loading…";
        shelf.append(empty);
    }
    $("coversHint").hidden = gamesState.coversEnabled || !gamesState.loaded;
    requestAnimationFrame(updateShelfFade);

    // Play time by emulator.
    const totals = Games.totalsByEmulator(items);
    const max = Math.max(1, ...totals.map(total => total.seconds));
    const all = totals.reduce((sum, total) => sum + total.seconds, 0);
    const panel = $("gamesTotals");
    panel.replaceChildren();
    const heading = document.createElement("span");
    heading.className = "games-panel-label";
    heading.textContent = "PLAY TIME";
    const sum = document.createElement("strong");
    sum.className = "games-panel-value";
    sum.textContent = Games.formatDuration(all);
    const rows = document.createElement("div");
    rows.className = "games-bars";
    totals.filter(total => total.seconds > 0).forEach(total => {
        const row = document.createElement("span");
        const bar = document.createElement("b");
        bar.style.width = `${Math.max(4, Math.round(total.seconds / max * 100))}%`;
        const label = document.createElement("em");
        label.textContent = Games.EMULATORS[total.emulator];
        const value = document.createElement("small");
        value.textContent = `${Games.formatDuration(total.seconds)} · ${total.games} game${total.games === 1 ? "" : "s"}`;
        row.append(bar, label, value);
        rows.append(row);
    });
    panel.append(heading, sum, rows);

    // The library.
    const visible = Games.sortGames(Games.filterGames(items, gamesState.query, gamesState.filter), gamesState.sort);
    const shown = visible.slice(0, 300);
    $("gamesLibrary").replaceChildren(...shown.map(libraryRow));
    $("gamesMeta").textContent = !gamesState.loaded ? "Loading…"
        : !items.length ? "No play time found yet. Check the programs in Preferences › Games & apps."
            : !visible.length ? "No games match."
                : `${visible.length} game${visible.length === 1 ? "" : "s"}${visible.length > shown.length ? ` (showing ${shown.length})` : ""}`;
    if ($("games").classList.contains("active")) requestCovers([...recent, ...shown.slice(0, 40)]);
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
    updateRaTimestamp();

    if (data.apps && typeof data.apps === "object") setRunningApps(data.apps);
}

// Now playing (1.7.0): the game in front, with its cover as a soft backdrop,
// a live session timer, total play time, RetroAchievements progress, and
// Show file; any other running games below it. With nothing running, the
// last game played. Rebuilt only when something shown changes; the session
// timer ticks on its own once a second while the Games tab is open.
function renderNowPlaying() {
    const panel = $("gamesNow");
    const playing = gamesState.playing || [];
    const matched = playing.map(item => Games.matchPlayingGame(gamesState.items, item));
    const lead = playing[0];
    const leadGame = matched[0];
    const leadName = lead ? (lead.emulator === "steam" || lead.emulator === "pso" ? lead.title : Games.gameFromWindowTitle(lead.emulator, lead.title)) : "";
    const last = !lead ? Games.sortGames(gamesState.items.filter(game => game.last && game.installed !== false), "recent")[0] : null;
    const shownGame = leadGame || last;
    const progress = leadGame ? raProgressFor(leadGame) : null;
    const signature = JSON.stringify([playing, matched.map(game => game?.id || ""), leadGame?.seconds, last?.id,
        shownGame ? gamesState.covers.has(shownGame.id) : false, gamesState.ra.updatedAt, progress?.achieved]);
    if (panel.dataset.signature === signature) return;
    panel.dataset.signature = signature;
    if (shownGame) requestCovers([shownGame]);

    panel.replaceChildren();
    panel.classList.toggle("is-playing", Boolean(lead));
    const cover = shownGame && gamesState.covers.get(shownGame.id);
    if (cover && lead) {
        const backdrop = element("div", "now-backdrop");
        const image = element("img");
        image.src = cover;
        image.alt = "";
        backdrop.append(image);
        panel.append(backdrop);
    }
    panel.append(element("span", "games-panel-label", lead ? "NOW PLAYING" : "NOTHING RUNNING"));

    if (!lead) {
        if (!last) {
            panel.append(element("strong", "games-panel-value games-panel-muted", "Nothing running"),
                element("small", "games-panel-note", "Start a game from Continue playing or the library below."));
            return;
        }
        const main = element("div", "now-main");
        const copy = element("div", "now-copy");
        copy.append(element("small", "now-kicker", "LAST PLAYED"),
            element("strong", "now-title", Games.displayTitle(last.title)),
            element("small", "", [gameMeta(last, ["emulator", "last"]), last.seconds ? `${Games.formatDuration(last.seconds)} in all` : ""].filter(Boolean).join(" · ")));
        main.append(gameCover(last, "game-cover-now"), copy);
        const actions = element("div", "now-actions");
        if (last.launchable) actions.append(playButton(last, "secondary"));
        panel.append(main, actions);
        return;
    }

    const main = element("div", "now-main");
    const copy = element("div", "now-copy");
    const title = element("strong", "now-title", leadName ? Games.displayTitle(leadName) : "At the menu");
    title.title = leadName;
    copy.append(title, element("small", "", [Games.EMULATORS[lead.emulator] || lead.emulator,
        leadGame ? Games.systemName(leadGame.system) : ""].filter(Boolean).join(" · ")));
    main.append(leadGame ? gameCover(leadGame, "game-cover-now") : element("i", "now-dot"), copy);
    panel.append(main);

    const stats = element("div", "now-stats");
    if (leadName) {
        const session = element("span");
        const clock = element("strong", "now-session");
        clock.dataset.since = String(lead.since || "");
        session.append(element("small", "", "THIS SESSION"), clock);
        stats.append(session);
        if (leadGame?.seconds) {
            const total = element("span");
            total.append(element("small", "", "IN ALL"), element("strong", "", Games.formatDuration(leadGame.seconds)));
            total.title = "Play time recorded by the emulator or Steam (updated when it saves)";
            stats.append(total);
        }
        panel.append(stats);
    }

    if (progress && progress.possible) {
        const ra = element("div", "now-ra");
        const head = element("div", "now-ra-head");
        head.append(element("small", "", "ACHIEVEMENTS"),
            element("strong", "", progress.mastered ? "Mastered" : progress.completed ? "Completed" : `${progress.achieved} of ${progress.possible} · ${progress.percent}%`));
        const bar = element("span", Games.raBarClass(progress.mastered));
        const fill = element("b");
        fill.style.width = `${progress.percent}%`;
        bar.append(fill);
        ra.append(head, bar);
        const data = Games.parseRetroAchievements(gamesState.ra.summary, gamesState.ra.recent);
        const key = Games.titleKey(leadGame.title);
        const latest = data.achievements.find(item => Games.titleKey(item.game) === key);
        if (latest) {
            const line = element("small", "now-ra-latest", `Latest: ${latest.title}`);
            line.title = latest.description;
            ra.append(line);
        }
        if (data.presence && Games.titleKey(data.lastGame) === key) {
            const presence = element("p", "now-presence", data.presence);
            presence.title = "From the game's rich presence, as of the last RetroAchievements refresh";
            ra.append(presence);
        }
        panel.append(ra);
    }

    // Show file sits at the end of the timer row (or on its own at the menu).
    if (leadGame && lead.emulator !== "pso") {
        const actions = element("div", "now-actions");
        const show = element("button", "secondary", lead.emulator === "steam" ? "Open folder" : "Show file");
        show.type = "button";
        show.addEventListener("click", () => send("ShowGameFile", leadGame.id));
        actions.append(show);
        if (stats.isConnected) stats.append(actions);
        else panel.append(actions);
    }

    playing.slice(1).forEach(item => {
        const name = item.emulator === "steam" || item.emulator === "pso" ? item.title : Games.gameFromWindowTitle(item.emulator, item.title);
        const line = element("div", "games-now-line");
        const label = element("strong", "", name ? Games.displayTitle(name) : "At the menu");
        label.title = name;
        line.append(element("i"), label, element("small", "", Games.EMULATORS[item.emulator] || item.emulator));
        panel.append(line);
    });
}

function tickNowPlaying() {
    const clocks = document.querySelectorAll("#gamesNow .now-session");
    clocks.forEach(clock => {
        const since = Number(clock.dataset.since);
        clock.textContent = since ? Games.formatClock(Date.now() / 1000 - since) : "Just started";
    });
    if (clocks.length && gamesState.nowTimer === null) gamesState.nowTimer = setInterval(tickNowPlaying, 1000);
    if (!clocks.length && gamesState.nowTimer !== null) {
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

function libraryRow(game) {
    const open = gamesState.openId === game.id;
    const row = element("li", `game-row-item${open ? " is-open" : ""}`);
    const main = element("div", "game-row");
    const toggle = element("button", "game-row-toggle");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.title = open ? "Hide details" : "Show details";
    const copy = element("span", "game-row-copy");
    const name = element("strong", "", Games.displayTitle(game.title));
    copy.append(name, element("small", "", gameMeta(game, ["emulator", "system"])));
    toggle.append(gameCover(game, "game-cover-thumb"), copy, element("i", "game-row-chevron", "›"));
    toggle.addEventListener("click", () => {
        gamesState.openId = open ? "" : game.id;
        if (!open && !gamesState.details.has(game.id)) send("GetGameDetails", game.id);
        renderGames();
        requestAnimationFrame(() => document.querySelector(`.game-row-item.is-open .game-row-toggle`)?.focus());
    });
    const time = element("span", "game-row-time", game.seconds ? Games.formatDuration(game.seconds) : "—");
    const last = element("span", "game-row-last", Games.formatLastPlayed(game.last) || "—");
    main.append(toggle, time, last, playButton(game, "secondary game-play"));
    row.append(main);
    if (open) row.append(gameDetailsPanel(game));
    return row;
}

function playButton(game, className) {
    const installed = game.installed !== false;
    const play = element("button", className, installed ? "Play" : "Install");
    play.type = "button";
    play.disabled = !game.launchable;
    play.title = !game.launchable ? "ASCS doesn't know where this game is stored"
        : installed ? `Play ${game.title}` : `Opens Steam's install prompt for ${game.title}`;
    play.addEventListener("click", () => playGame(game));
    return play;
}

function gameDetailsPanel(game) {
    const panel = element("div", "game-details");
    panel.append(gameCover(game, "game-cover-detail"));
    const body = element("div", "game-details-body");
    body.append(element("h3", "", game.title));
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
    const actions = element("div", "game-details-actions");
    actions.append(playButton(game, "primary"));
    if (extra?.canShow) {
        const show = element("button", "secondary", extra.showLabel || "Show file");
        show.type = "button";
        show.addEventListener("click", () => send("ShowGameFile", game.id));
        actions.append(show);
    }
    body.append(actions);
    panel.append(body);
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
    if (card.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return; // renaming
    card.replaceChildren(element("span", "games-panel-label", pads.length > 1 ? "CONTROLLERS" : "CONTROLLER"));
    if (!pads.length) {
        card.append(element("strong", "games-panel-value games-panel-muted", "None connected"),
            element("small", "games-panel-note", "Wake the controller to see it here. X-input mode also reports its battery."));
        return;
    }
    pads.slice(0, 3).forEach(pad => {
        const item = element("div", "pad");
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
            });
            form.append(input, save, cancel);
            const hint = element("small", "pad-hint", "Renames it in ASCS and in Windows' game controller list. Leave empty to restore the default. ");
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
        const head = element("div", "pad-head");
        head.append(element("strong", "", pad.name));
        const actions = element("span", "pad-actions");
        const rename = element("button", "link-button", "Rename");
        rename.type = "button";
        rename.addEventListener("click", () => { gamesState.renaming = pad.key; renderControllers(gamesState.pads); });
        actions.append(rename);
        if (pad.rumble || pad.testable) {
            const test = element("button", "link-button", "Test");
            test.type = "button";
            test.addEventListener("click", () => openTester(pad));
            actions.append(test);
        }
        if (pad.rumble) {
            // With two identical controllers, this tells you which entry is which.
            const identify = element("button", "link-button", "Identify");
            identify.type = "button";
            identify.title = "Rumbles this controller so you can tell which one it is";
            identify.addEventListener("click", () => send("RumbleController", pad.id));
            actions.prepend(identify);
        }
        head.append(actions);
        const meta = [`${pad.mode} mode`, pad.connection, pad.slot ? `Player ${pad.slot}` : ""].filter(Boolean).join(" · ");
        item.append(head, element("small", "", meta));
        if (!pad.rumble) item.append(element("small", "pad-hint", "Rumble and battery need X-input mode."));
        const power = pad.rumble ? powerText(pad.power) : "";
        if (power) {
            const line = element("small", "pad-power", power);
            line.dataset.power = pad.power;
            item.append(line);
        }
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

$("closeTester").addEventListener("click", () => {
    $("controllerTester").hidden = true;
    gamesState.tester = null;
    stopTester();
});
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
    renderAchievements();
    $("gamesAchievements").scrollIntoView({ block: "nearest", behavior: "smooth" });
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
    const back = element("button", "link-button ra-back", "‹ Achievements");
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

// "Next up" for the last game played: its next locked progression step (or
// the next locked achievement), and missable ones still open.
function raNextUpCard(gameId) {
    const raw = gamesState.ra.games.get(gameId);
    requestRaGame(gameId);
    const game = raw ? Games.parseRaGame(raw) : null;
    if (!game || !game.achievements.length) return null;
    const next = Games.nextUp(game);
    const card = element("div", "ra-next");
    const label = element("small", "", `NEXT UP · ${Games.displayTitle(game.title)}`);
    card.append(label);
    if (!next) {
        card.append(element("p", "", "Every achievement unlocked."));
        return card;
    }
    const item = element("div", "ra-with-image");
    const body = element("div", "ra-item-body");
    const head = element("div", "ra-unlock-head");
    head.append(element("strong", "", next.achievement.title));
    const tag = raTypeTag(next.achievement.type);
    if (tag) head.append(tag);
    head.append(element("span", "ra-points", `${next.achievement.points}`));
    body.append(head);
    if (next.achievement.description) body.append(element("p", "", next.achievement.description));
    const foot = element("div", "ra-next-foot");
    foot.append(element("small", "", `${next.locked} still locked`));
    if (next.missableLeft) foot.append(element("small", "ra-missable-note", `${next.missableLeft} missable still open`));
    const all = element("button", "link-button", "All achievements");
    all.type = "button";
    all.addEventListener("click", () => openRaGame(gameId));
    foot.append(all);
    body.append(foot);
    item.append(raImage(next.achievement.badge, "ra-badge is-locked"), body);
    card.append(item);
    requestRaImages([next.achievement.badge]);
    return card;
}

function renderAchievements() {
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
        box.append(element("p", "settings-note", "Loading…"));
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
    stat("PLAYER", data.user || "—");
    stat("HARDCORE POINTS", data.points.toLocaleString(), data.truePoints ? `${data.truePoints.toLocaleString()} true points` : "");
    if (data.softcore) stat("SOFTCORE", data.softcore.toLocaleString());
    stat("RANK", data.rank ? `#${data.rank.toLocaleString()}` : "—", Games.rankPercentile(data.rank, data.ranked));
    box.append(stats);

    // What's being played (rich presence comes from the game itself).
    if (data.lastGame || data.presence) {
        const now = element("div", "ra-now");
        now.append(element("small", "", "LAST SEEN IN"));
        now.append(element("strong", "", [data.lastGame, data.lastConsole].filter(Boolean).join(" · ") || "—"));
        if (data.presence) now.append(element("p", "", data.presence));
        box.append(now);
    }
    if (ra.openGame) {
        renderRaBrowser(box);
        return;
    }
    const nextCard = data.lastGameId ? raNextUpCard(data.lastGameId) : null;
    if (nextCard) box.append(nextCard);

    const columns = element("div", "ra-columns");
    const progress = element("div", "ra-column");
    progress.append(element("h3", "", "Progress"));
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
    unlocks.append(element("h3", "", "Recent unlocks"));
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
    requestRaImages([...data.games.slice(0, 6).map(game => game.icon), ...shownUnlocks.map(item => item.badge)]);
}

// RetroAchievements badges and icons: requested by token once per session;
// ASCS downloads each image once and keeps it in data\ra-images.
const RA_IMAGE_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

function raImage(token, className) {
    const holder = element("span", `ra-image ${className}`);
    holder.dataset.token = token || "";
    const data = token ? gamesState.raImages.get(token) : "";
    if (data) {
        const image = element("img");
        image.src = data;
        image.alt = "";
        holder.append(image);
    }
    return holder;
}

function requestRaImages(tokens) {
    const wanted = [...new Set(tokens.filter(token => /^[bi]:\d{1,8}$/.test(token || "")))]
        .filter(token => !gamesState.raImages.has(token) && !gamesState.raRequested.has(token));
    if (!wanted.length) return;
    wanted.forEach(token => gamesState.raRequested.add(token));
    for (let i = 0; i < wanted.length; i += 30) send("GetRaImages", wanted.slice(i, i + 30).join(","));
}

function handleRaImage(token, data) {
    if (!/^[bi]:\d{1,8}$/.test(token) || !RA_IMAGE_PATTERN.test(data) || data.length > 400000) return;
    gamesState.raImages.set(token, data);
    document.querySelectorAll(".ra-image").forEach(holder => {
        if (holder.dataset.token !== token || holder.querySelector("img")) return;
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
    send("GetGames");
    send("GetGamesLive");
    send("GetRetroAchievements");
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
    renderGames();
}));
document.querySelectorAll("[data-game-sort]").forEach(button => button.addEventListener("click", () => {
    gamesState.sort = button.dataset.gameSort;
    document.querySelectorAll("[data-game-sort]").forEach(other => other.setAttribute("aria-pressed", String(other === button)));
    renderGames();
}));
$("gameSearch").addEventListener("input", () => {
    gamesState.query = $("gameSearch").value;
    renderGames();
});
$("refreshAchievements").addEventListener("click", () => {
    send("GetRetroAchievements", "refresh");
    if (gamesState.ra.openGame) requestRaGame(gamesState.ra.openGame, true);
    if (gamesState.ra.unlocksOpen) send("GetRaUnlocks", "refresh");
});

// ---- Preferences: Games & apps

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
    $("raStatusText").textContent = state === "ready"
        ? "Set up: credentials found in data\\secrets.ini (kept on this PC, never committed). The key is never shown here."
        : state === "invalid"
            ? "data\\secrets.ini has a user name or key that isn't valid. Open it to fix them."
            : "Not set up. Your user name and Web API key go in data\\secrets.ini, which stays on this PC and is never committed. The key is never shown in ASCS or sent anywhere except retroachievements.org.";
}

$("saveGamesButton").addEventListener("click", () => {
    const fields = ["gamePathRetroarch", "gamePathDolphin", "gamePathPcsx2", "gamePathPso", "gamePathDiscord", "headphonesDevice", "soundSwitchKey"]
        .map(id => $(id).value.trim());
    if (fields.some(value => /[|\r\n]/.test(value))) {
        $("gamesStatus").textContent = "Paths and names cannot contain | or line breaks.";
        return;
    }
    fields.push($("showCovers").checked ? "1" : "0");
    const voice = $("psoVoiceChannel").value.trim();
    if (voice && !/^(https:\/\/((ptb|canary)\.)?discord(app)?\.com\/channels\/|discord:\/\/-\/channels\/)\d{15,21}\/\d{15,21}\/?$/i.test(voice)) {
        $("gamesStatus").textContent = "The PSO voice channel must be a Discord channel link: https://discord.com/channels/<server>/<channel>.";
        return;
    }
    fields.push(voice);
    $("gamesStatus").textContent = "Saving…";
    if (!send("SaveGameSettings", fields.join("|"))) $("gamesStatus").textContent = "Unable to contact ASCS.";
});
$("setupRetroAchievements").addEventListener("click", () => send("SetupRetroAchievements"));

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

function renderAudioDevices(data) {
    const items = Array.isArray(data.items) ? data.items.filter(item => item && typeof item.name === "string").slice(0, 16) : [];
    const current = items.find(item => item.current === true);
    $("audioCurrent").textContent = current ? Games.displayTitle(current.name) : "Audio";
    $("audioButton").title = current ? `Audio output: ${current.name}` : "Choose the audio output";
    const menu = $("audioMenu");
    menu.replaceChildren(...items.map(item => {
        const option = element("button", `audio-option${item.current ? " is-current" : ""}`, item.name);
        option.type = "button";
        option.setAttribute("role", "menuitemradio");
        option.setAttribute("aria-checked", String(item.current === true));
        option.addEventListener("click", () => {
            menu.hidden = true;
            $("audioButton").setAttribute("aria-expanded", "false");
            if (!item.current) send("SelectAudioDevice", item.name);
        });
        return option;
    }));
    if (data.soundSwitch !== true) {
        menu.append(element("p", "settings-note", "SoundSwitch isn't running; ASCS switches outputs through it."));
    }
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
$("audioButton").addEventListener("click", () => {
    const menu = $("audioMenu");
    menu.hidden = !menu.hidden;
    $("audioButton").setAttribute("aria-expanded", String(!menu.hidden));
    if (!menu.hidden) send("GetAudioDevices");
});
document.addEventListener("click", event => {
    if (!$("audioMenu").hidden && !event.target.closest("#audioMenu, #audioButton")) {
        $("audioMenu").hidden = true;
        $("audioButton").setAttribute("aria-expanded", "false");
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

enableTabWheel(document.querySelector("#settings .settings-nav"), "[role='tab']");
enableTabWheel(document.querySelector("#logs .logs-sources"), "[data-log-source]");
enableTabWheel(document.querySelector("#logs .logs-levels"), "[data-log-level]");
enableTabWheel(document.querySelector(".games-toolbar .logs-sources"), "[data-game-filter]");
enableTabWheel(document.querySelector(".games-toolbar .logs-levels"), "[data-game-sort]");
// Sideways over the almanac strip steps through its items (1.9.2).
enableWheelStep($("homeAlmanac"), direction => {
    stepAlmanac(direction);
    restartAlmanacTimer();
});
// Sideways over the Calendar steps through days, weeks or months (1.9.2).
enableWheelStep($("calendar"), direction => $(direction > 0 ? "calNext" : "calPrev").click());

// The shelf fades at its right edge only while more games are off to the side.
function updateShelfFade() {
    const shelf = $("gamesContinue");
    const more = shelf.scrollWidth - shelf.clientWidth - shelf.scrollLeft > 2;
    shelf.classList.toggle("has-more", more);
}
$("gamesContinue").addEventListener("scroll", updateShelfFade, { passive: true });
window.addEventListener("resize", updateShelfFade);

// Keep the selected Preferences tab in view after any selection.
document.querySelectorAll("#settings .settings-nav [role='tab']").forEach(tab =>
    tab.addEventListener("click", () => tab.scrollIntoView({ block: "nearest", inline: "nearest" })));

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
// The shortcuts work only while ASCS has focus. Ctrl + 1-9 follow the
// sidebar's order, so new views take the next number. F1 (or the ? button in
// the title bar) toggles the help.
const HELP_INSIDE = [
    [["Ctrl", "1–9, 0"], "Go to a page"],
    [["Ctrl", "N"], "New note"],
    [["Ctrl", "E"], "New calendar event"],
    [["Ctrl", "F"], "Search this page"],
    [["F1"], "Open or close this help"],
    [["Esc"], "Close a dialog or the palette"]
];
const VIEW_SEARCH = { notes: "notesFilter", games: "gameSearch", sounds: "soundSearch", commands: "commandSearch" };

function sidebarViews() {
    return [...document.querySelectorAll(".nav[data-view]")].map(button => button.dataset.view).filter(view => validViews.has(view));
}

function helpAnywhere() {
    const letter = (action, fallback) => (currentHotkeys[action] || fallback).toUpperCase();
    return [
        [["Super"], "Show or hide ASCS"],
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
    $("helpMeta").textContent = `${$("sidebarVersion")?.textContent || "ASCS"} · F1 opens and closes this`;
    $("helpInside").replaceChildren(...HELP_INSIDE.flatMap(keyRow));
    $("helpAnywhere").replaceChildren(...helpAnywhere().flatMap(keyRow));
    const current = document.querySelector(".view.active")?.id;
    $("helpPages").replaceChildren(...sidebarViews().slice(0, 10).map((view, index) => {
        const page = element("button", `help-page${view === current ? " is-current" : ""}`);
        page.type = "button";
        page.append(element("kbd", "", String((index + 1) % 10)),
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
        // Ctrl + 1-9, then 0 for the tenth page (1.9.0).
        const view = sidebarViews()[event.key === "0" ? 9 : Number(event.key) - 1];
        if (!view) return;
        event.preventDefault();
        navigate(view);
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
    if (ctrlOnly && event.key.toLowerCase() === "f") {
        event.preventDefault();
        const view = document.querySelector(".view.active")?.id;
        const search = VIEW_SEARCH[view] ? $(VIEW_SEARCH[view]) : null;
        if (search) {           // only ever "search this page"; Super + Space is the palette
            search.focus();
            search.select();
        }
    }
});

// Each sidebar item shows its Ctrl number, worked out from the sidebar's
// order so it stays right when views are added.
function numberSidebar() {
    document.querySelectorAll(".nav[data-view]").forEach((button, index) => {
        button.querySelector(".nav-key")?.remove();
        if (index >= 10) return;
        const digit = String((index + 1) % 10);       // the tenth is Ctrl + 0
        const key = element("kbd", "nav-key", digit);
        key.setAttribute("aria-hidden", "true");
        key.title = `Ctrl + ${digit}`;
        button.append(key);
        button.setAttribute("aria-keyshortcuts", `Control+${digit}`);
    });
}
numberSidebar();
