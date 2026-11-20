// Routines (2.12.0): Commands › Routines. The routine being edited on the
// left, every routine on the right, as Workspaces lays out arrangements.
// Edits save themselves a moment after they stop, once nothing in them is
// wrong; AHK checks them again. MaestroRoutines (routines.js) is the model.

const Routines = globalThis.MaestroRoutines;

const rtView = {
    items: [], loaded: false, selected: 0,
    running: { name: "", step: 0, count: 0 },
    // Each edit counts up `version`; `savedVersion` is the last one AHK kept.
    // While they differ, a list from AHK waits in `held` rather than undo
    // what's being edited.
    version: 0, sentVersion: -1, savedVersion: 0, held: null, saveTimer: null, problem: "",
    nextStepId: 1, workspacesKnown: false
};

// Steps carry an id while on the page, for dragging; it's never saved.
function withStepIds(items) {
    return items.map(routine => ({
        name: routine.name,
        steps: routine.steps.map(step => ({ ...step, id: rtView.nextStepId++ }))
    }));
}

const currentRoutine = () => rtView.items[rtView.selected] ?? null;

// ---- what the steps can point at

function routineGames() {
    if (!gamesState.loaded) return [];
    return Games.sortGames(Games.filterGames(gamesState.items.filter(game => game.launchable && game.installed !== false), "", "all"), "recent")
        .map(game => ({ id: game.id, title: Games.displayTitle(game.title) }));
}

function routineKnown() {
    return {
        workspaces: rtView.workspacesKnown ? savedWorkspaces.map(workspace => workspace.name) : undefined,
        commands: customCommands.map(command => command.name),
        apps: mixerApps(),
        games: gamesState.loaded ? routineGames() : undefined
    };
}

// [value, label] pairs for a step's target, and whether the step's own
// value is among them (when it isn't, it's kept, marked as missing).
function routineTargetOptions(kind) {
    switch (kind) {
        case "workspace": {
            const names = savedWorkspaces.map(workspace => workspace.name);
            return (names.length ? names : ["Default"]).map(name => [name, name]);
        }
        case "desktop":
            return Array.from({ length: Routines.LIMITS.desktops }, (_, index) => [String(index + 1), `Desktop ${index + 1}`]);
        case "launch": return Routines.APPS;
        case "command": return customCommands.map(command => [command.name, command.name]);
        case "game": return routineGames().map(game => [game.id, game.title]);
        case "page": return Routines.PAGES;
        case "media": return Routines.MEDIA;
        default: return null;
    }
}

function defaultRoutineArg(kind) {
    if (kind === "volume") return "30";
    if (kind === "appvolume") return `${mixerApps()[0]?.id ?? "system"}|50`;
    if (kind === "wait") return "5";
    return routineTargetOptions(kind)?.[0]?.[0] ?? "";
}

// ---- saving

function routinesChanged() {
    rtView.version++;
    clearTimeout(rtView.saveTimer);
    rtView.problem = Routines.problemIn(rtView.items);
    if (rtView.problem) {
        setRoutinesStatus(rtView.problem, true);
        return;
    }
    setRoutinesStatus("Unsaved changes.");
    rtView.saveTimer = setTimeout(saveRoutinesNow, 500);
}

function saveRoutinesNow() {
    clearTimeout(rtView.saveTimer);
    rtView.saveTimer = null;
    if (rtView.problem || rtView.sentVersion === rtView.version) return true;
    rtView.sentVersion = rtView.version;
    setRoutinesStatus("Saving…");
    if (!send("SaveRoutines", Routines.toText(rtView.items))) {
        setRoutinesStatus("Unable to contact Maestro.", true);
        return false;
    }
    return true;
}

function setRoutinesStatus(text, problem = false) {
    const status = $("routinesStatus");
    status.textContent = text;
    status.classList.toggle("is-problem", problem);
}

// ---- messages from AHK

function receiveRoutines(items) {
    const cleaned = Routines.clean(items);
    if (rtView.loaded && rtView.version !== rtView.savedVersion) {
        rtView.held = cleaned;
        return;
    }
    rtView.held = null;
    const selectedName = currentRoutine()?.name.toLowerCase();
    rtView.items = withStepIds(cleaned);
    rtView.loaded = true;
    const again = rtView.items.findIndex(routine => routine.name.toLowerCase() === selectedName);
    rtView.selected = again >= 0 ? again : Math.min(rtView.selected, Math.max(0, rtView.items.length - 1));
    renderRoutines();
    renderHomeRoutines();
    if (!$("launcher").hidden) renderLauncherResults();
}

function routinesSaved() {
    rtView.savedVersion = rtView.sentVersion;
    if (rtView.savedVersion !== rtView.version) return;
    setRoutinesStatus("Saved.");
    // AHK's list, as it kept it, arrived just before this.
    if (rtView.held) receiveRoutines(rtView.held);
}

function routinesFailed(message) {
    rtView.sentVersion = -1;
    setRoutinesStatus(typeof message === "string" ? message : "The routines couldn't be saved.", true);
}

function receiveRoutineState(data) {
    const count = Number.isInteger(data.count) ? data.count : 0;
    rtView.running = { name: typeof data.name === "string" ? data.name : "", step: Number.isInteger(data.step) ? data.step : 0, count };
    renderRoutines();
    renderHomeRoutines();
    if (!$("launcher").hidden) renderLauncherResults();
}

// ---- running

function runRoutine(name) {
    if (!saveRoutinesNow()) return;
    send("RunRoutine", name);
}

// ---- drawing

function renderRoutines() {
    if (!$("commandsRoutines") || $("commandsRoutines").hidden) return;
    renderRoutineList();
    renderRoutineEditor();
}

function renderRoutineList() {
    const list = $("routineList");
    if (!rtView.loaded) {
        list.replaceChildren(placeholder("rows", 3));
        return;
    }
    list.replaceChildren(...rtView.items.map((routine, index) => {
        const item = element("li");
        const node = element("button", "ws-item rt-item");
        node.type = "button";
        node.setAttribute("aria-pressed", index === rtView.selected ? "true" : "false");
        const running = rtView.running.name && rtView.running.name.toLowerCase() === routine.name.toLowerCase();
        node.classList.toggle("is-running", Boolean(running));
        const copy = element("span", "ws-item-copy");
        copy.append(element("strong", "", routine.name),
            element("small", "", running ? `Running · step ${rtView.running.step} of ${rtView.running.count}` : routine.steps.length ? plural(routine.steps.length, "step") : "No steps yet"));
        node.append(copy);
        node.addEventListener("click", () => {
            rtView.selected = index;
            renderRoutines();
        });
        item.append(node);
        return item;
    }));
    if (!rtView.items.length) list.append(element("li", "module-empty", "None yet."));
    $("routineCount").textContent = rtView.items.length ? `${rtView.items.length} of ${Routines.LIMITS.routines}` : "";
    $("newRoutineButton").disabled = rtView.items.length >= Routines.LIMITS.routines;
}

function renderRoutineEditor() {
    const routine = currentRoutine();
    $("routineEditorBody").hidden = !routine;
    $("routinesEmpty").hidden = Boolean(routine) || !rtView.loaded;
    if (!routine) {
        $("routineActions").replaceChildren();
        $("routineName").hidden = true;
        $("routineMeta").textContent = rtView.loaded ? "" : "Loading…";
        return;
    }
    $("routineName").hidden = false;
    if (document.activeElement !== $("routineName")) $("routineName").value = routine.name;
    const running = rtView.running.name && rtView.running.name.toLowerCase() === routine.name.toLowerCase();
    const known = routineKnown();
    const gone = routine.steps.filter(step => Routines.describe(step, known).missing).length;
    const waits = routine.steps.filter(step => step.kind === "wait").reduce((sum, step) => sum + Number(step.arg), 0);
    $("routineMeta").textContent = running
        ? `Running step ${rtView.running.step} of ${rtView.running.count}`
        : [plural(routine.steps.length, "step"), waits ? `waits ${Routines.describe({ kind: "wait", arg: String(waits) }).text.slice(5)} in all` : "",
            gone ? `${gone === 1 ? "a step points" : `${gone} steps point`} at something that's gone` : ""].filter(Boolean).join(" · ");
    renderRoutineActions(routine, running);
    renderRoutineSteps(routine, running, known);
    $("addRoutineStep").disabled = routine.steps.length >= Routines.LIMITS.steps;
}

function renderRoutineActions(routine, running) {
    const run = element("button", running ? "secondary" : "primary");
    run.type = "button";
    setIconWord(run, running ? "stop" : "play", running ? "Stop" : "Run");
    run.title = running ? "Stop this routine" : "Run this routine now; Maestro hides while it runs";
    run.disabled = !running && (!routine.steps.length || Boolean(rtView.running.name));
    run.addEventListener("click", () => running ? send("StopRoutine") : runRoutine(routine.name));
    const duplicate = iconButton("duplicate", `Duplicate ${routine.name}`);
    duplicate.disabled = rtView.items.length >= Routines.LIMITS.routines;
    duplicate.addEventListener("click", () => {
        const copy = { name: Routines.uniqueName(rtView.items, `${routine.name.slice(0, 40)} copy`), steps: routine.steps.map(step => ({ ...step, id: rtView.nextStepId++ })) };
        rtView.items.splice(rtView.selected + 1, 0, copy);
        rtView.selected++;
        routinesChanged();
        renderRoutines();
    });
    const remove = iconButton("trash", `Delete ${routine.name}`, "secondary danger");
    remove.addEventListener("click", async () => {
        const ok = await confirmDialog({ title: `Delete Routine “${routine.name}”?`, message: "Its steps are removed. Nothing it opened is affected.", confirmLabel: "Delete routine", danger: true });
        if (!ok) return;
        const at = rtView.items.indexOf(routine);
        if (at < 0) return;
        rtView.items.splice(at, 1);
        rtView.selected = Math.max(0, Math.min(at, rtView.items.length - 1));
        routinesChanged();
        renderRoutines();
    });
    $("routineActions").replaceChildren(run, duplicate, remove);
}

function routineKindSelect(step) {
    const select = element("select", "rt-kind");
    select.setAttribute("aria-label", "What this step does");
    Routines.KINDS.forEach(kind => {
        const option = element("option", "", kind.label);
        option.value = kind.id;
        select.append(option);
    });
    select.value = step.kind;
    select.addEventListener("change", () => {
        step.kind = select.value;
        step.arg = defaultRoutineArg(step.kind);
        routinesChanged();
        renderRoutineEditor();
        $("routineSteps").querySelector(`[data-sort-id="${step.id}"] .rt-kind`)?.focus();
    });
    return select;
}

// An app's volume: which app (those with sound now, and the step's own), and
// a level.
function routineAppVolumeControl(step) {
    const parts = Routines.appVolumeParts(step.arg) ?? { app: "system", level: "50" };
    const holder = element("span", "rt-number rt-appvolume");
    const select = element("select", "rt-target");
    select.setAttribute("aria-label", "Which app");
    const apps = mixerApps();
    const pairs = apps.map(app => [app.id, app.label]);
    if (!pairs.some(pair => pair[0] === "system")) pairs.push(["system", "System sounds"]);
    if (!pairs.some(pair => pair[0] === parts.app)) pairs.unshift([parts.app, Routines.appLabel(parts.app, apps)]);
    pairs.forEach(([value, label]) => {
        const option = element("option", "", label);
        option.value = value;
        select.append(option);
    });
    select.value = parts.app;
    const input = element("input");
    input.type = "number";
    input.min = "0";
    input.max = "100";
    input.step = "1";
    input.value = parts.level;
    input.setAttribute("aria-label", "Its volume, 0 to 100");
    const update = () => {
        step.arg = `${select.value}|${input.value.trim()}`;
        routinesChanged();
    };
    select.addEventListener("change", update);
    input.addEventListener("input", update);
    holder.append(select, input, element("span", "rt-unit", "%"));
    return holder;
}

function routineTargetControl(step, missing) {
    if (step.kind === "appvolume") return routineAppVolumeControl(step);
    const options = routineTargetOptions(step.kind);
    if (!options) {
        // Volume and wait: a number, with its unit beside it.
        const holder = element("span", "rt-number");
        const input = element("input");
        input.type = "number";
        input.min = step.kind === "volume" ? "0" : "1";
        input.max = step.kind === "volume" ? "100" : String(Routines.LIMITS.wait);
        input.step = "1";
        input.value = step.arg;
        input.setAttribute("aria-label", step.kind === "volume" ? "Volume, 0 to 100" : "Seconds to wait");
        input.addEventListener("input", () => {
            step.arg = input.value.trim();
            routinesChanged();
        });
        holder.append(input, element("span", "rt-unit", step.kind === "volume" ? "%" : "seconds"));
        return holder;
    }
    const select = element("select", "rt-target");
    select.setAttribute("aria-label", Routines.KINDS.find(kind => kind.id === step.kind)?.label ?? "Target");
    const pairs = options.slice();
    if (step.arg && !pairs.some(pair => pair[0] === step.arg)) {
        pairs.unshift([step.arg, missing ? `${step.arg} (not found)` : step.arg]);
    }
    if (!pairs.length) pairs.push(["", step.kind === "command" ? "No custom commands yet" : step.kind === "game" ? "No games yet" : "Nothing to choose"]);
    pairs.forEach(([value, label]) => {
        const option = element("option", "", label);
        option.value = value;
        select.append(option);
    });
    select.value = step.arg;
    select.addEventListener("change", () => {
        step.arg = select.value;
        routinesChanged();
        renderRoutineEditor();
    });
    return select;
}

function renderRoutineSteps(routine, running, known) {
    const list = $("routineSteps");
    if (routineSort.isDragging()) return;
    // Drawn again after a change: the control that had the focus gets it back.
    const active = document.activeElement;
    const focused = active?.closest?.("#routineSteps > .rt-step");
    const focusPart = focused && [".rt-kind", ".rt-target", ".rt-number input", ".drag-grip"].find(part => active.matches(part));
    list.replaceChildren(...routine.steps.map((step, index) => {
        const words = Routines.describe(step, known);
        const row = element("li", "rt-step");
        row.dataset.sortId = String(step.id);
        row.classList.toggle("is-running", Boolean(running && rtView.running.step === index + 1));
        row.classList.toggle("is-missing", words.missing);
        const grip = MaestroDragSort.gripButton(words.text);
        grip.setAttribute("aria-label", `Move step ${index + 1}, ${words.text}. Use the arrow keys; Delete removes it.`);
        grip.title = "Drag to move, or use the arrow keys; Delete removes it";
        grip.addEventListener("keydown", event => routineGripKey(event, routine, step));
        const number = element("span", "rt-number-label", String(index + 1));
        const note = element("span", "rt-note", words.missing ? "Not found, so the routine would stop here." : routineAppNote(step));
        const remove = iconButton("trash", `Remove step ${index + 1}`);
        remove.tabIndex = -1;       // for the mouse; from the keyboard, Delete on the grip
        remove.dataset.pointerOnly = "";
        remove.addEventListener("click", () => removeRoutineStep(routine, step));
        row.append(grip, number, routineKindSelect(step), routineTargetControl(step, words.missing), remove, note);
        return row;
    }));
    if (!routine.steps.length) list.append(element("li", "module-empty", "No steps yet. Add one, such as restoring an arrangement or opening an app."));
    if (focused) {
        const again = list.querySelector(`[data-sort-id="${focused.dataset.sortId}"]`);
        ((focusPart && again?.querySelector(focusPart)) || again?.querySelector(".drag-grip"))?.focus();
    }
}

// An app with no sound now isn't an error: its volume is set once it has
// played. Said only when the mixer has been read.
function routineAppNote(step) {
    if (step.kind !== "appvolume" || !mixer.known) return "";
    const parts = Routines.appVolumeParts(step.arg);
    if (!parts || mixerApps().some(app => app.id === parts.app)) return "";
    return `${Routines.appLabel(parts.app, mixerApps())} has no sound now; the step sets it if it has by then.`;
}

function removeRoutineStep(routine, step) {
    const at = routine.steps.indexOf(step);
    if (at < 0) return;
    routine.steps.splice(at, 1);
    routinesChanged();
    renderRoutineEditor();
    const next = routine.steps[at] ?? routine.steps[at - 1];
    ($("routineSteps").querySelector(`[data-sort-id="${next?.id}"] .drag-grip`) || $("addRoutineStep")).focus();
}

function routineGripKey(event, routine, step) {
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeRoutineStep(routine, step);
        return;
    }
    const move = { ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (!move) return;
    event.preventDefault();
    const from = routine.steps.indexOf(step);
    if (from + move < 0 || from + move >= routine.steps.length) return;
    routine.steps = Routines.moveStep(routine.steps, from, from + move);
    routinesChanged();
    renderRoutineEditor();
    $("routineSteps").querySelector(`[data-sort-id="${step.id}"] .drag-grip`)?.focus();
}

const routineSort = MaestroDragSort.attach($("routineSteps"), {
    item: ".rt-step",
    onDrop(order) {
        const routine = currentRoutine();
        if (!routine) return;
        routine.steps = order.map(id => routine.steps.find(step => String(step.id) === id)).filter(Boolean);
        routinesChanged();
        renderRoutineEditor();
    }
});

// ---- controls

$("routineName").addEventListener("input", () => {
    const routine = currentRoutine();
    if (!routine) return;
    routine.name = $("routineName").value;
    routinesChanged();
    renderRoutineList();
});

$("addRoutineStep").addEventListener("click", () => {
    const routine = currentRoutine();
    if (!routine || routine.steps.length >= Routines.LIMITS.steps) return;
    const kind = routine.steps.length ? "wait" : "workspace";
    const step = { kind, arg: defaultRoutineArg(kind), id: rtView.nextStepId++ };
    routine.steps.push(step);
    routinesChanged();
    renderRoutineEditor();
    $("routineSteps").querySelector(`[data-sort-id="${step.id}"] .rt-kind`)?.focus();
});

$("newRoutineButton").addEventListener("click", () => {
    if (rtView.items.length >= Routines.LIMITS.routines) return;
    rtView.items.push({ name: Routines.uniqueName(rtView.items), steps: [] });
    rtView.selected = rtView.items.length - 1;
    routinesChanged();
    renderRoutines();
    $("routineName").focus();
    $("routineName").select();
});

// The tab opened: draw it, and ask for what its menus list.
function routinesShown() {
    if (!rtView.loaded) send("GetRoutines");
    if (!gamesState.loaded) send("GetGames");
    if (!rtView.workspacesKnown) send("GetWorkspaces");
    if (!mixer.known) send("GetAppVolumes");
    renderRoutines();
}

// The Podium's Routines module: each routine with steps, which runs it (or
// stops it, while it runs). It shows what AHK last sent; it asks for nothing.
function renderHomeRoutines() {
    const list = $("homeRoutines");
    if (!list) return;
    if (!rtView.loaded) {
        list.replaceChildren(placeholderItem("lines", 3));
        return;
    }
    const routines = rtView.items.filter(routine => routine.steps.length).slice(0, homeRoom("routines", 4, 9));
    if (!routines.length) {
        list.replaceChildren(element("li", "module-empty", "No routines yet. Make one in Commands › Routines."));
        return;
    }
    list.replaceChildren(...routines.map(routine => {
        const running = rtView.running.name.toLowerCase() === routine.name.toLowerCase();
        const item = element("li");
        const button = element("button", `module-row${running ? " is-running" : ""}`);
        button.type = "button";
        button.title = running ? `Stop ${routine.name}` : `Run ${routine.name}; Maestro hides while it runs`;
        button.append(element("span", "module-row-name", routine.name),
            element("small", "module-row-when", running ? `Step ${rtView.running.step} of ${rtView.running.count} · Stop` : plural(routine.steps.length, "step")));
        button.addEventListener("click", () => running ? send("StopRoutine") : runRoutine(routine.name));
        item.append(button);
        return item;
    }));
}

// A routine's entry in the palette: run it, or stop the one running.
function routinePaletteItems() {
    const known = routineKnown();
    return rtView.items.filter(routine => routine.steps.length).map(routine => {
        const running = rtView.running.name.toLowerCase() === routine.name.toLowerCase();
        const words = routine.steps.slice(0, 2).map((step, index) => {
            const text = Routines.describe(step, known).text;
            return index ? text[0].toLowerCase() + text.slice(1) : text;
        });
        return {
            id: `routine:${routine.name.toLowerCase()}`,
            label: running ? `Stop routine “${routine.name}”` : `Run routine “${routine.name}”`,
            description: running ? `Running step ${rtView.running.step} of ${rtView.running.count}`
                : words.join(", then ") + (routine.steps.length > 2 ? `, and ${plural(routine.steps.length - 2, "more step")}` : ""),
            keywords: `routine sequence ${routine.name}`, badge: "ROUTINE",
            run: () => running ? send("StopRoutine") : runRoutine(routine.name)
        };
    });
}
