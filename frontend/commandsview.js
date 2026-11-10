// Commands (2.0.0): every way of telling Maestro what to do. The key map, with a
// panel for the key you clicked; custom commands; the palette's settings; and
// quick actions. The keyboard itself is drawn by renderKeymap in app.js.

const commandsSections = MaestroSections.create($("commandsTabs"), {
    onChange(section) {
        $("commandSearch").hidden = section !== "keymap";
        window.scrollTo(0, 0);
    }
});

function setCommandsNotice(text) {
    $("keyStatus").textContent = text;
    $("paletteStatus").textContent = text;
}

// ---- the panel beside the keyboard

function selectedKeyContext() {
    const layout = ASCSKeymap.isoFullSizeLayout();
    const id = keymapSelected ?? (currentHotkeys.notes || "q");
    const key = layout.keys.find(item => item.id === id) ?? layout.keys.find(item => item.id === "q");
    const layer = activeKeymapLayer();
    const binding = ASCSKeymap.buildBindings(currentHotkeys, customCommands)[layer][key.id];
    return { key, layer, binding, kind: ASCSKeymap.keyEditKind(key, binding, layer) };
}

function selectKey(id, layer = null) {
    keymapSelected = id;
    if (layer) keymapLayer = layer;
    $("keyStatus").textContent = "";
    renderKeymap();
}

function keyRunsOptions() {
    const placeholder = element("option", "", "Choose a command");
    placeholder.value = "";
    const options = ASCSKeymap.assignableCommands(currentHotkeys, customCommands).map(item => {
        const option = element("option", "", item.key ? `${item.title} (now ${item.key.toUpperCase()})` : item.title);
        option.value = item.ref;
        return option;
    });
    return [placeholder, ...options];
}

let keyDetailSignature = "";

// Redrawn only when what it shows changes, so the running-program check can't
// wipe a letter you're typing.
function renderKeyDetail() {
    const { key, layer, binding, kind } = selectedKeyContext();
    const signature = JSON.stringify([key.id, layer, kind, binding?.title, currentHotkeys, customCommands.map(command => [command.name, command.key])]);
    if (signature === keyDetailSignature) return;
    keyDetailSignature = signature;

    const chord = key.special ? key.label : `${layer === "shift" ? "Super + Shift + " : "Super + "}${key.label}`;
    $("keyDetailTitle").textContent = chord;
    const free = kind === "free";
    const letter = /^[a-z]$/.test(key.id);
    $("keyDetailName").textContent = binding?.passthrough ? "Free" : binding ? binding.title : key.special ? "" : "Free";
    $("keyDetailName").hidden = !$("keyDetailName").textContent;
    $("keyDetailText").textContent = binding?.desc
        || (key.note ? key.note.replace(/^[^:]+:\s*/, "") : "")
        || (free ? "Choose a command to put on this key."
            : letter && layer === "shift" ? "No Shift action. It behaves like the Super layer."
                : "Only the letter keys can hold a command.");
    if (kind === "fixed" && binding) $("keyDetailText").textContent += " This one is built in.";

    const assigned = kind === "action" || kind === "command";
    $("keyLetterField").hidden = !assigned;
    $("keyRunsField").hidden = !free;
    $("claudeField").hidden = binding?.action !== "claude";
    $("keySave").hidden = !(assigned || free);
    $("keySave").textContent = free ? "Assign" : "Save";
    if (assigned) $("keyLetter").value = key.label;
    if (free) $("keyRuns").replaceChildren(...keyRunsOptions());

    const defaultLetter = binding?.action ? ASCSKeymap.DEFAULT_HOTKEYS[binding.action] : "";
    $("keyReset").hidden = kind === "command" ? false : !(kind === "action" && defaultLetter !== key.id);
    $("keyReset").textContent = kind === "command" ? "Remove letter" : `Reset to ${defaultLetter.toUpperCase()}`;
}

// The command's new place, for a built-in or a custom command. The backend
// checks everything again and answers with any clash.
function moveCommandToLetter(ref, letter) {
    const problem = letter === "" ? "" : ASCSKeymap.letterProblem(letter, ref, currentHotkeys, customCommands);
    if (problem) {
        setCommandsNotice(problem);
        return;
    }
    const normalized = letter.toLowerCase();
    if (ref.startsWith("action:")) {
        saveCommandSettings({ ...currentHotkeys, [ref.slice(7)]: normalized }, normalized);
        return;
    }
    if (commandsDirty) {
        setCommandsNotice("Custom Commands has unsaved changes. Save them there first.");
        return;
    }
    const index = Number(ref.slice(8));
    const lines = customCommands.map((command, at) => [command.name, command.kind, command.target, at === index ? normalized : command.key || ""].join("\t"));
    pendingKeySelection = normalized || null;
    setCommandsNotice("Saving…");
    if (!send("SaveCommands", lines.join("\n"))) setCommandsNotice("Unable to contact Maestro.");
}

function saveCommandSettings(hotkeys = currentHotkeys, selectAfter = null) {
    if (!settingsLoaded) {
        setCommandsNotice("Still loading. Try again in a moment.");
        return;
    }
    pendingHotkeys = hotkeys;
    pendingKeySelection = selectAfter;
    setCommandsNotice("Saving…");
    if (!send("SaveSettings", settingsPayload(hotkeys))) setCommandsNotice("Unable to contact Maestro.");
}

$("keyEditForm").addEventListener("submit", event => {
    event.preventDefault();
    const { key, binding, kind } = selectedKeyContext();
    if (kind === "free") {
        if (!$("keyRuns").value) {
            setCommandsNotice("Choose a command first.");
            return;
        }
        moveCommandToLetter($("keyRuns").value, key.id);
        return;
    }
    const ref = kind === "action" ? `action:${binding.action}` : `command:${binding.commandIndex}`;
    const letter = $("keyLetter").value.trim().toLowerCase();
    if (letter === key.id) {
        // The letter stays; Claude's shortcut beside it may still have changed.
        if (binding.action === "claude") saveCommandSettings();
        else setCommandsNotice("That's its letter already.");
        return;
    }
    moveCommandToLetter(ref, letter || "?");
});

$("keyReset").addEventListener("click", () => {
    const { binding, kind } = selectedKeyContext();
    if (kind === "command") moveCommandToLetter(`command:${binding.commandIndex}`, "");
    else if (kind === "action") moveCommandToLetter(`action:${binding.action}`, ASCSKeymap.DEFAULT_HOTKEYS[binding.action]);
});

// ---- the lists under the keyboard

const COMMAND_LISTS = { apps: "keyListApps", windows: "keyListWindows", saved: "keyListSaved" };

function commandRowKeys(keys) {
    const holder = element("span", "key-row-keys");
    keys.forEach(label => holder.append(element("kbd", "", label)));
    return holder;
}

function renderCommandLists() {
    const groups = ASCSKeymap.groupBindings(ASCSKeymap.buildBindings(currentHotkeys, customCommands), ASCSKeymap.isoFullSizeLayout());
    const selected = selectedKeyContext();
    let shown = 0;
    Object.entries(COMMAND_LISTS).forEach(([name, id]) => {
        const rows = groups[name].filter(row => !keymapQuery || `${row.keys.join(" ")} ${row.title} ${row.desc}`.toLocaleLowerCase().includes(keymapQuery));
        shown += rows.length;
        const list = $(id);
        list.closest(".module").hidden = !rows.length;
        list.replaceChildren(...rows.map(row => {
            const item = element("li");
            const content = row.key ? element("button", "key-row") : element("div", "key-row");
            if (row.key) {
                content.type = "button";
                content.dataset.key = row.key;
                content.setAttribute("aria-pressed", String(selected.key.id === row.key && selected.layer === row.layer));
                content.addEventListener("click", () => selectKey(row.key, row.layer));
            }
            content.title = row.desc;
            content.append(element("span", "key-row-name", row.title), commandRowKeys(row.keys));
            item.append(content);
            return item;
        }));
    });
    $("commandSearchEmpty").hidden = shown > 0;
}

// ---- quick actions

// Dragging, or the arrow keys on a card's grip.
const quickActionSort = MaestroDragSort.attach($("quickActionEditor"), {
    item: ".quick-card",
    onDrop(order, id) {
        saveQuickActions(order);
        announceQuickAction(id, order);
    }
});

function announceQuickAction(id, order) {
    const label = quickActionCatalog().get(id)?.label ?? "It";
    $("quickActionLive").textContent = `${label} moved to place ${order.indexOf(id) + 1} of ${order.length}.`;
}

function moveQuickAction(id, step) {
    const ids = currentQuickActionIds();
    const from = ids.indexOf(id);
    const to = from + step;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const order = MaestroDragSort.reorder(ids, from, to);
    saveQuickActions(order);
    announceQuickAction(id, order);
    $("quickActionEditor").querySelector(`[data-sort-id="${CSS.escape(id)}"] .drag-grip`)?.focus();
}

function removeQuickAction(id) {
    const ids = currentQuickActionIds();
    const next = ids[ids.indexOf(id) + 1] ?? ids[ids.indexOf(id) - 1];
    saveQuickActions(ids.filter(other => other !== id));
    const grip = next && $("quickActionEditor").querySelector(`[data-sort-id="${CSS.escape(next)}"] .drag-grip`);
    (grip || $("addQuickAction")).focus();
    $("quickActionLive").textContent = `${quickActionCatalog().get(id)?.label ?? "It"} removed.`;
}

// Left and Right move one place; Up and Down move a row, as the grid is laid out.
// Delete removes it: the grips are the cards' only Tab stops.
function quickGripKey(event, id) {
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeQuickAction(id);
        return;
    }
    const columns = getComputedStyle($("quickActionEditor")).gridTemplateColumns.split(" ").length;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key];
    if (!step) return;
    event.preventDefault();
    moveQuickAction(id, step);
}

function renderQuickActionEditor() {
    const list = $("quickActionEditor");
    if (!list || quickActionSort.isDragging()) return;
    const catalog = quickActionCatalog();
    const ids = currentQuickActionIds();
    // The card holding the focus is kept, so a move by key keeps its ring.
    const focused = document.activeElement?.closest?.("#quickActionEditor > .quick-card");
    MaestroDragSort.placeChildren(list, ids.map(id => {
        if (focused?.dataset.sortId === id) return focused;
        const item = catalog.get(id);
        const label = item ? item.label : "Unavailable";
        const row = element("li", "quick-card");
        row.dataset.sortId = id;
        const grip = MaestroDragSort.gripButton(label);
        grip.setAttribute("aria-label", `Move ${label}. Use the arrow keys; Delete removes it.`);
        grip.title = "Drag to move, or use the arrow keys; Delete removes it";
        grip.addEventListener("keydown", event => quickGripKey(event, id));
        const copy = element("div", "quick-card-copy");
        copy.append(element("strong", "", label), element("small", "", item ? item.description || "" : `${id} no longer exists`));
        const remove = element("button", "secondary", "Remove");
        remove.type = "button";
        remove.setAttribute("aria-label", `Remove ${label}`);
        remove.tabIndex = -1;       // for the mouse; from the keyboard, Delete on the grip
        remove.dataset.pointerOnly = "";
        remove.addEventListener("click", () => saveQuickActions(currentQuickActionIds().filter(other => other !== id)));
        row.append(grip, copy, remove);
        return row;
    }));
    $("addQuickAction").disabled = ids.length >= MAX_QUICK_ACTIONS;
    $("quickActionCount").textContent = `${ids.length} of ${MAX_QUICK_ACTIONS}`;
}

$("addQuickAction").addEventListener("click", () => openLauncher("pick"));

// ---- the palette

$("paletteForm").addEventListener("submit", event => {
    event.preventDefault();
    saveCommandSettings();
});

enableTabWheel($("commandsTabs"), "[role='tab']");
$("commandSearch").hidden = commandsSections.current() !== "keymap";
renderCommandLists();
renderKeyDetail();
renderQuickActionEditor();
