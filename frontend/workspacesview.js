// The Workspaces view (1.10.0; 2.0.0 layout). Two sections: Workspaces, where the
// saved workspaces are listed beside the one being edited, and Launch Rules. A
// canvas draws one desktop at its monitor's real shape; Selected Window edits
// the window chosen on it. Edits change only the saved file, never an open
// window: Restore is what moves them. The page sends places and switches, and an
// app's path only ever comes from a real window, in AHK.

const wsView = {
    page: "workspace",      // or "rules": follows the section tabs
    loaded: false,          // the first list has arrived
    selected: "",           // the workspace's name
    desktop: null,          // the desktop tab's key
    window: 0,              // the selected window's index in the file
    monitors: 1,
    saving: false,          // the save field is showing
    naming: false,          // the heading is showing a name field
    addOpen: false,
    addChoice: "",
    ruleWindow: "",
    expect: "",             // a name just saved, copied or renamed: open it when it arrives
    added: null,            // a window just added: show it when it arrives
    drag: null,
    nudge: null             // a keyboard edit waiting to be sent
};
let launchRules = [];

const currentWorkspace = () => savedWorkspaces.find(item => item.name.toLowerCase() === wsView.selected.toLowerCase()) || savedWorkspaces[0] || null;
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

// Launch Rules asks for the open windows, which its picker lists.
const workspaceSections = MaestroSections.create($("workspaceSections"), {
    onChange(section) {
        wsView.page = section === "rules" ? "rules" : "workspace";
        if (section === "rules") send("GetWindows");
        renderWorkspaceManager();
        window.scrollTo(0, 0);
    }
});

function wsButton(label, className, onClick, hint = "") {
    const node = element("button", className, label);
    node.type = "button";
    if (hint) node.title = hint;
    node.addEventListener("click", onClick);
    return node;
}

// A tiny drawing of where windows sit: for the list and the launch rules.
function wsThumb(windows) {
    const thumb = element("span", "ws-thumb");
    windows.forEach(win => {
        const box = element("i", win.pinned ? "is-pinned" : "");
        box.style.left = `${win.x * 100}%`;
        box.style.top = `${win.y * 100}%`;
        box.style.width = `${win.width * 100}%`;
        box.style.height = `${win.height * 100}%`;
        thumb.append(box);
    });
    return thumb;
}

function renderWorkspaceManager(monitors) {
    if (Number.isInteger(monitors) && monitors >= 1) wsView.monitors = monitors;
    if (monitors !== undefined) wsView.loaded = true;
    if (monitors !== undefined && wsView.expect) {
        if (savedWorkspaces.some(item => item.name.toLowerCase() === wsView.expect.toLowerCase())) {
            wsView.selected = wsView.expect;
            wsView.desktop = null;
            wsView.window = 0;
        }
        wsView.expect = "";
    }
    if (monitors !== undefined && wsView.added) {
        const workspace = savedWorkspaces.find(item => item.name === wsView.added.name);
        const windows = workspace ? Workspaces.workspaceWindows(workspace.layout) : [];
        if (windows.length > wsView.added.count) {
            const newest = windows.reduce((last, win) => (win.index > last.index ? win : last));
            wsView.desktop = newest.key;
            wsView.window = newest.index;
        }
        wsView.added = null;
    }
    // Opening the view asks for all of this again; a drag draws when it ends.
    const view = $("workspaces");
    if (wsView.drag || !view.classList.contains("active")) return;
    const focusKey = view.contains(document.activeElement) ? document.activeElement.dataset.wsFocus : "";
    if (wsView.page === "rules") {
        renderRulesPage();
    } else {
        renderWorkspaceList();
        const workspace = currentWorkspace();
        $("workspacePage").hidden = !workspace;
        $("workspacesEmpty").hidden = Boolean(workspace);
        if (workspace) renderWorkspacePage(workspace);
        else renderWorkspaceWaiting();
    }
    if (focusKey) view.querySelector(`[data-ws-focus="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

// Before the first list arrives, and when there's nothing saved: the editor and
// the panel keep their space, so nothing moves when one arrives.
function renderWorkspaceWaiting() {
    $("workspaceTitle").removeAttribute("data-user-text");
    if (!wsView.naming) $("workspaceTitle").textContent = wsView.loaded ? "No Saved Arrangements Yet" : "Workspaces";
    $("workspaceMeta").textContent = "";
    $("workspaceActions").replaceChildren();
    $("workspacesEmpty").replaceChildren(wsView.loaded
        ? element("p", "module-empty", "Arrange your windows on your desktops, then save them with Save open windows. Super + S saves them as Default.")
        : placeholder("board"));
    $("wsWindowTitle").textContent = "Selected Window";
    $("wsWindowTitle").removeAttribute("data-user-text");
    $("wsWindowSub").hidden = true;
    $("workspaceInspector").replaceChildren(element("p", "module-empty", wsView.loaded ? "A saved window's place shows here." : ""));
}

// ---- the list

function renderWorkspaceList() {
    const list = $("workspaceList");
    if (!wsView.loaded) {
        list.replaceChildren(placeholder("rows", 3));
        renderWorkspaceSave();
        return;
    }
    list.replaceChildren(...savedWorkspaces.map(workspace => {
        const windows = Workspaces.workspaceWindows(workspace.layout);
        const desktops = Workspaces.workspaceDesktops(workspace).filter(tab => typeof tab.key === "number" && tab.count);
        const first = desktops[0] ? windows.filter(win => win.key === desktops[0].key) : windows;
        const on = workspace === currentWorkspace();
        const item = element("li");
        const node = element("button", "ws-item");
        node.type = "button";
        node.dataset.wsLayout = "";
        node.dataset.wsFocus = `layout:${workspace.name}`;
        node.setAttribute("aria-pressed", on ? "true" : "false");
        const copy = element("span", "ws-item-copy");
        copy.append(element("strong", "", workspace.name),
            element("small", "", `${plural(windows.length, "window")}${desktops.length > 1 ? ` · ${desktops.length} desktops` : ""}`));
        node.append(wsThumb(first), copy);
        node.addEventListener("click", () => selectWorkspace(workspace.name));
        item.append(node);
        return item;
    }));
    if (!savedWorkspaces.length) list.append(element("li", "module-empty", "None yet."));
    renderWorkspaceSave();
}

function selectWorkspace(name) {
    if (name.toLowerCase() !== currentWorkspace()?.name.toLowerCase()) {
        wsView.desktop = null;
        wsView.window = 0;
        wsView.addOpen = false;
    }
    wsView.selected = name;
    renderWorkspaceManager();
}

// The save field stays as it is while it's open, so what's being typed isn't
// lost when a reply redraws the list.
function renderWorkspaceSave() {
    const holder = $("workspaceSave");
    const openForm = holder.querySelector(".ws-save");
    if (wsView.saving && openForm) return;
    holder.replaceChildren(wsView.saving ? workspaceSaveForm() : wsButton("Save open windows…", "secondary ws-save-open", () => {
        wsView.saving = true;
        renderWorkspaceManager();
    }, "Save the windows open now, on every desktop, as a new arrangement"));
}

function workspaceSaveForm() {
    const form = element("form", "ws-save");
    const input = element("input");
    input.type = "text";
    input.maxLength = 40;
    input.placeholder = "Name, such as Coding";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Arrangement name");
    const finish = () => {
        wsView.saving = false;
        renderWorkspaceManager();
    };
    form.addEventListener("submit", async event => {
        event.preventDefault();
        const name = input.value.trim();
        if (!Palette.isValidWorkspaceName(name)) {
            showToast("Arrangement names use letters, numbers, spaces, - and _ (up to 40 characters).");
            input.focus();
            return;
        }
        if (savedWorkspaces.some(item => item.name.toLowerCase() === name.toLowerCase())) {
            const ok = await confirmDialog({ title: `Save Over “${name}”?`, message: "It's replaced by the windows open now, on every desktop.", confirmLabel: "Save over" });
            if (!ok) { input.focus(); return; }
        }
        wsView.expect = name;
        send("SaveWorkspace", name);
        finish();
    });
    input.addEventListener("keydown", event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(); }
    });
    form.append(input, wsSubmit("Save"), wsButton("Cancel", "secondary", finish));
    requestAnimationFrame(() => input.focus());
    return form;
}

function wsSubmit(label) {
    const button = element("button", "primary", label);
    button.type = "submit";
    return button;
}

// ---- one workspace

function renderWorkspacePage(workspace) {
    if (!wsView.naming) {
        $("workspaceTitle").replaceChildren(document.createTextNode(workspace.name));
        $("workspaceTitle").setAttribute("data-user-text", "");
        renderWorkspaceHead(workspace);
    }
    const tabs = Workspaces.workspaceDesktops(workspace);
    const windows = Workspaces.workspaceWindows(workspace.layout);
    if (!tabs.some(tab => tab.key === wsView.desktop)) {
        // Open on the selected window's desktop, or the first with windows.
        const holding = windows.find(win => win.index === wsView.window);
        wsView.desktop = holding ? holding.key : (tabs.find(tab => tab.count) || tabs[0])?.key ?? null;
    }
    const shown = windows.filter(win => win.key === wsView.desktop);
    if (!shown.some(win => win.index === wsView.window)) wsView.window = shown[0]?.index || 0;
    renderWorkspaceTabs(tabs);
    renderWorkspaceScreens(workspace, shown);
    renderWorkspaceRows(shown);
    renderWorkspaceAdd(workspace, windows.length);
    renderWorkspaceInspector(workspace, shown.find(win => win.index === wsView.window), tabs);
}

function renderWorkspaceHead(workspace) {
    const desktops = Workspaces.workspaceDesktops(workspace).filter(tab => typeof tab.key === "number" && tab.count).length;
    $("workspaceMeta").textContent = [
        `${plural(Workspaces.workspaceWindows(workspace.layout).length, "window")}${desktops > 1 ? ` on ${desktops} desktops` : ""}`,
        `saved ${formatSavedTime(workspace.saved)}`,
        ...(workspace.name === "Default" ? ["Super + S and Super + R"] : [])
    ].join(" · ");
    const actions = $("workspaceActions");
    actions.replaceChildren(
        wsButton("Restore", "primary", () => send("RestoreWorkspace", workspace.name), "Put these windows back, each on its desktop"),
        wsButton("Save over", "secondary", async () => {
            const ok = await confirmDialog({ title: `Save Over “${workspace.name}”?`, message: "It's replaced by the windows open now, on every desktop.", confirmLabel: "Save over" });
            if (ok) send("SaveWorkspace", workspace.name);
        }, "Replace it with the windows open now"),
        ...(workspace.name === "Default" ? [] : [wsButton("Rename", "secondary", () => askWorkspaceName(workspace.name, `New name for ${workspace.name}`, name => {
            wsView.expect = name;
            send("RenameWorkspace", `${workspace.name}|${name}`);
        }))]),
        wsButton("Duplicate", "secondary", () => askWorkspaceName(`${workspace.name.slice(0, 35)} copy`, `Name for the copy of ${workspace.name}`, name => {
            wsView.expect = name;
            send("DuplicateWorkspace", `${workspace.name}|${name}`);
        }, true)),
        wsButton("Delete", "secondary danger", async () => {
            const ok = await confirmDialog({ title: `Delete Arrangement “${workspace.name}”?`, message: "The saved layout is removed. Open windows are not affected.", confirmLabel: "Delete arrangement", danger: true });
            if (ok) send("DeleteWorkspace", workspace.name);
        })
    );
}

// The heading becomes a name field, for Rename and Duplicate.
function askWorkspaceName(initial, label, onName, acceptInitial = false) {
    const input = element("input", "ws-name");
    input.type = "text";
    input.maxLength = 40;
    input.value = initial;
    input.setAttribute("aria-label", label);
    let done = false;
    const finish = keep => {
        if (done) return;
        const name = input.value.trim();
        const valid = name && Palette.isValidWorkspaceName(name);
        if (keep && name && !valid) {
            showToast("Arrangement names use letters, numbers, spaces, - and _ (up to 40 characters).");
            input.focus();
            return;
        }
        done = true;
        wsView.naming = false;
        if (keep && valid && (acceptInitial || name !== initial)) onName(name);
        renderWorkspaceManager();
    };
    input.addEventListener("keydown", event => {
        if (event.key === "Enter") { event.preventDefault(); finish(true); }
        else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(false); }
    });
    input.addEventListener("blur", () => finish(false));
    wsView.naming = true;
    $("workspaceTitle").replaceChildren(input);
    input.focus();
    input.select();
}

function renderWorkspaceTabs(tabs) {
    const strip = $("workspaceTabs");
    strip.hidden = tabs.length < 2;
    strip.replaceChildren(...tabs.map(tab => {
        const node = element("button", `ws-tab${tab.key === "pinned" ? " is-pinned" : ""}`, tab.label);
        node.type = "button";
        node.dataset.wsFocus = `tab:${tab.key}`;
        node.setAttribute("aria-pressed", tab.key === wsView.desktop ? "true" : "false");
        node.append(element("em", "", String(tab.count)));
        node.addEventListener("click", () => {
            wsView.desktop = tab.key;
            wsView.window = 0;
            renderWorkspaceManager();
        });
        return node;
    }));
}

function renderWorkspaceScreens(workspace, shown) {
    const screens = $("workspaceScreens");
    const list = Workspaces.workspaceScreens(shown, workspace.aspects, wsView.monitors);
    screens.replaceChildren(...list.map(({ monitor, aspect, windows }) => {
        const holder = element("div", "ws-monitor");
        holder.style.flex = `${aspect} ${aspect} 0`;
        if (list.length > 1) holder.append(element("span", "ws-monitor-label", `Monitor ${monitor}`));
        const screen = element("div", "ws-screen");
        screen.style.aspectRatio = String(aspect);
        screen.style.setProperty("--aspect", String(aspect));
        screen.dataset.monitor = String(monitor);
        windows.forEach((win, position) => screen.append(workspaceWindowNode(win, windows.length - position)));
        holder.append(screen);
        return holder;
    }));
}

function workspaceWindowNode(win, layer) {
    const selected = win.index === wsView.window;
    const node = element("button", `ws-window${selected ? " is-selected" : ""}${win.pinned ? " is-pinned" : ""}${win.enabled ? "" : " is-off"}`);
    node.type = "button";
    node.dataset.index = String(win.index);
    node.dataset.wsFocus = `window:${win.index}`;
    node.style.left = `${win.x * 100}%`;
    node.style.top = `${win.y * 100}%`;
    node.style.width = `${win.width * 100}%`;
    node.style.height = `${win.height * 100}%`;
    node.style.zIndex = selected ? String(layer + 100) : String(layer);
    node.setAttribute("aria-pressed", selected ? "true" : "false");
    node.setAttribute("aria-label", `${win.app}, ${win.title}. Arrow keys move it; Shift and an arrow key resizes it.`);
    node.append(element("strong", "", win.app));
    if (win.title) node.append(element("span", "", win.title));
    if (selected) {
        ["n", "e", "s", "w", "nw", "ne", "se", "sw"].forEach(edge => {
            const handle = element("i", `ws-handle ws-handle-${edge}`);
            handle.dataset.mode = edge;
            node.append(handle);
        });
    }
    return node;
}

function renderWorkspaceRows(shown) {
    $("workspaceRows").replaceChildren(...shown.map(win => {
        const row = element("button", `ws-row${win.index === wsView.window ? " is-selected" : ""}${win.enabled ? "" : " is-off"}`);
        row.type = "button";
        row.dataset.wsFocus = `row:${win.index}`;
        row.setAttribute("aria-pressed", win.index === wsView.window ? "true" : "false");
        row.append(element("strong", "", win.app), element("span", "", win.title));
        const notes = [...(win.missing ? ["App not found"] : []), ...(win.enabled ? [] : ["Off"]), Workspaces.sizeText(win)];
        row.append(element("small", "", notes.join(" · ")));
        row.addEventListener("click", () => selectWorkspaceWindow(win.index));
        return row;
    }));
    if (!shown.length) $("workspaceRows").append(element("p", "ws-empty", "No windows on this desktop."));
}

function selectWorkspaceWindow(index) {
    if (wsView.window === index) return;
    wsView.window = index;
    renderWorkspaceManager();
}

function renderWorkspaceAdd(workspace, count) {
    const form = $("workspaceAdd");
    form.replaceChildren();
    form.hidden = count >= 48;
    if (!wsView.addOpen) {
        form.append(wsButton("Add an open window…", "secondary", () => {
            wsView.addOpen = true;
            send("GetWindows");
            renderWorkspaceManager();
        }));
        return;
    }
    const windows = launcherWindows.filter(win => !win.minimized);
    const select = element("select");
    select.setAttribute("aria-label", "An open window on this desktop");
    select.append(element("option", "", windows.length ? "Choose a window on this desktop…" : "No open windows on this desktop"));
    select.firstChild.value = "";
    windows.forEach(win => {
        const option = element("option", "", `${win.app}: ${win.title}`.slice(0, 90));
        option.value = String(win.id);
        select.append(option);
    });
    select.value = windows.some(win => String(win.id) === wsView.addChoice) ? wsView.addChoice : "";
    select.addEventListener("change", () => { wsView.addChoice = select.value; });
    form.append(select, wsSubmit("Add"), wsButton("Cancel", "secondary", () => {
        wsView.addOpen = false;
        renderWorkspaceManager();
    }));
    form.onsubmit = event => {
        event.preventDefault();
        if (!/^\d{1,20}$/.test(select.value)) return;
        wsView.addOpen = false;
        wsView.addChoice = "";
        wsView.added = { name: workspace.name, count };
        send("AddWorkspaceWindow", `${workspace.name}|${select.value}`);
    };
}

function renderWorkspaceInspector(workspace, win, tabs) {
    const panel = $("workspaceInspector");
    panel.replaceChildren();
    // One heading: the window's app, with its title beneath.
    $("wsWindowTitle").textContent = win ? win.app : "Selected Window";
    $("wsWindowTitle").toggleAttribute("data-user-text", Boolean(win));
    $("wsWindowSub").textContent = win?.title || "";
    $("wsWindowSub").hidden = !win?.title;
    if (!win) {
        panel.append(element("p", "module-empty", "No windows on this desktop."));
        return;
    }
    const change = next => editWorkspaceWindow(workspace, next);

    if (win.missing) panel.append(element("p", "ws-warning", "This app isn't on this PC now, so Restore skips this window."));

    const desktops = tabs.filter(tab => typeof tab.key === "number");
    if (desktops.length && !win.pinned) {
        const field = element("label", "ws-field");
        field.append(element("span", "", "Desktop"));
        const select = element("select");
        select.dataset.wsFocus = "desktop";
        desktops.forEach(tab => {
            const option = element("option", "", tab.label);
            option.value = String(tab.key);
            select.append(option);
        });
        select.value = String(win.desktop);
        select.addEventListener("change", () => {
            wsView.desktop = Number(select.value);
            change({ ...win, desktop: Number(select.value) });
        });
        field.append(select);
        panel.append(field);
    }
    if (wsView.monitors > 1 || win.monitor > 1) {
        const field = element("label", "ws-field");
        field.append(element("span", "", "Monitor"));
        const select = element("select");
        select.dataset.wsFocus = "monitor";
        for (let monitor = 1; monitor <= Math.max(wsView.monitors, win.monitor); monitor++) {
            const option = element("option", "", `Monitor ${monitor}`);
            option.value = String(monitor);
            select.append(option);
        }
        select.value = String(win.monitor);
        select.addEventListener("change", () => change({ ...win, monitor: Number(select.value) }));
        field.append(select);
        panel.append(field);
    }

    const places = element("div", "ws-field");
    places.append(element("span", "", "Place"));
    const grid = element("div", "ws-places");
    const currentPlace = Workspaces.placeOf(win);
    Workspaces.PLACES.forEach(place => {
        const button = wsButton(place.label, `ws-place${place.id === currentPlace ? " is-on" : ""}`, () => change(Workspaces.applyPlace(win, place.id)));
        button.dataset.wsFocus = `place:${place.id}`;
        button.setAttribute("aria-pressed", place.id === currentPlace ? "true" : "false");
        grid.append(button);
    });
    places.append(grid);
    panel.append(places);

    const numbers = element("div", "ws-numbers");
    [["x", "Left %"], ["y", "Top %"], ["width", "Width %"], ["height", "Height %"]].forEach(([field, label]) => {
        const holder = element("label", "ws-number");
        holder.append(element("span", "", label));
        const input = element("input");
        input.type = "number";
        input.min = "0";
        input.max = "100";
        input.step = "1";
        input.dataset.wsFocus = `number:${field}`;
        input.dataset.wsField = field;
        input.value = String(Math.round(win[field] * 1000) / 10);
        input.setAttribute("aria-label", `${label} of the monitor`);
        input.addEventListener("change", () => change(Workspaces.setPercent(win, field, input.value)));
        holder.append(input);
        numbers.append(holder);
    });
    panel.append(numbers);

    const toggle = (label, checked, focusKey, onChange, hint) => {
        const row = element("label", "ws-switch");
        row.title = hint;
        const box = element("input");
        box.type = "checkbox";
        box.checked = checked;
        box.dataset.wsFocus = focusKey;
        box.addEventListener("change", () => onChange(box.checked));
        row.append(element("span", "", label), box);
        panel.append(row);
    };
    if (desktops.length) {
        toggle("On every desktop", win.pinned, "pin", on => {
            const desktop = on ? -1 : (typeof wsView.desktop === "number" ? wsView.desktop : desktops[0].key);
            wsView.desktop = on ? "pinned" : desktop;
            change({ ...win, pinned: on, desktop });
        }, "Pin this window to every desktop when it's restored");
    }
    toggle("Restore this window", win.enabled, "enabled", on => change({ ...win, enabled: on }),
        "Off keeps it in the arrangement, but Restore leaves it alone");

    const links = element("div", "ws-panel-links");
    links.append(
        wsButton("Always open here", "secondary", () => send("RuleFromWorkspaceWindow", `${workspace.name}|${win.index}`),
            `Make a launch rule: when ${win.app} starts, its first window goes to this place`),
        wsButton("Remove", "secondary danger", async () => {
            if (Workspaces.workspaceWindows(workspace.layout).length <= 1) {
                showToast("It's the last window; delete the arrangement instead.");
                return;
            }
            const ok = await confirmDialog({ title: `Remove ${win.app} From “${workspace.name}”?`, message: "Only the saved entry goes. The window itself isn't affected.", confirmLabel: "Remove", danger: true });
            if (ok) send("RemoveWorkspaceWindow", `${workspace.name}|${win.index}`);
        })
    );
    panel.append(links);
}

// Shown at once, then sent; AHK's reply confirms it, or puts it back.
function editWorkspaceWindow(workspace, win) {
    workspace.layout = Workspaces.applyEdit(workspace.layout, win);
    send("SetWorkspaceWindow", Workspaces.editMessage(workspace.name, win));
    renderWorkspaceManager();
}

// ---- dragging on the canvas, and the keyboard's way

function workspaceWindowAt(index) {
    const workspace = currentWorkspace();
    return workspace ? Workspaces.workspaceWindows(workspace.layout).find(win => win.index === index) : null;
}

$("workspaceScreens").addEventListener("pointerdown", event => {
    const node = event.target.closest(".ws-window");
    if (!node || event.button !== 0 || wsView.drag) return;
    const index = Number(node.dataset.index);
    const win = workspaceWindowAt(index);
    if (!win) return;
    const mode = event.target.dataset.mode || "move";
    const screen = node.closest(".ws-screen");
    const bounds = screen.getBoundingClientRect();
    const others = Workspaces.workspaceWindows(currentWorkspace().layout)
        .filter(other => other.key === win.key && other.monitor === win.monitor);
    wsView.drag = {
        index, mode, id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, place: null,
        start: win, width: bounds.width, height: bounds.height, lines: Workspaces.snapLines(others, index)
    };
    event.preventDefault();
    if (wsView.window !== index) {
        wsView.window = index;
        const drag = wsView.drag;
        wsView.drag = null;
        renderWorkspaceManager();
        wsView.drag = drag;
    }
    $("workspaceScreens").querySelector(`.ws-window[data-index="${index}"]`)?.focus({ preventScroll: true });
    try { $("workspaceScreens").setPointerCapture(event.pointerId); } catch { /* not capturable */ }
});

$("workspaceScreens").addEventListener("pointermove", event => {
    const drag = wsView.drag;
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    drag.place = Workspaces.dragPlace(drag.start, drag.mode, dx / drag.width, dy / drag.height, drag.lines);
    showWorkspaceDrag(drag.index, drag.place);
});

// During a drag only the window and the numbers change; nothing is re-drawn.
function showWorkspaceDrag(index, place) {
    const node = $("workspaceScreens").querySelector(`.ws-window[data-index="${index}"]`);
    if (node) {
        node.style.left = `${place.x * 100}%`;
        node.style.top = `${place.y * 100}%`;
        node.style.width = `${place.width * 100}%`;
        node.style.height = `${place.height * 100}%`;
    }
    $("workspaceInspector").querySelectorAll("[data-ws-field]").forEach(input => {
        input.value = String(Math.round(place[input.dataset.wsField] * 1000) / 10);
    });
}

function endWorkspaceDrag(event, keep) {
    const drag = wsView.drag;
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.id)) return;
    wsView.drag = null;
    try { $("workspaceScreens").releasePointerCapture(drag.id); } catch { /* already released */ }
    const workspace = currentWorkspace();
    if (keep && drag.moved && drag.place && workspace) {
        editWorkspaceWindow(workspace, { ...drag.start, ...drag.place, maximized: Workspaces.fillsMonitor(drag.place) });
    } else {
        renderWorkspaceManager();
    }
}

$("workspaceScreens").addEventListener("pointerup", event => endWorkspaceDrag(event, true));
$("workspaceScreens").addEventListener("pointercancel", event => endWorkspaceDrag(event, false));
$("workspaceScreens").addEventListener("lostpointercapture", event => endWorkspaceDrag(event, false));

// Enter or Space selects; arrows move and resize. Sent once the keys stop.
$("workspaceScreens").addEventListener("click", event => {
    const node = event.target.closest(".ws-window");
    if (node && event.detail === 0) selectWorkspaceWindow(Number(node.dataset.index));
});

$("workspaceScreens").addEventListener("keydown", event => {
    const node = event.target.closest(".ws-window");
    if (event.key === "Escape" && wsView.drag) {
        event.preventDefault();
        event.stopPropagation();
        endWorkspaceDrag(event, false);
        return;
    }
    if (!node || wsView.drag) return;
    const workspace = currentWorkspace();
    const win = workspaceWindowAt(Number(node.dataset.index));
    const next = win && Workspaces.nudgePlace(win, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    wsView.window = next.index;
    workspace.layout = Workspaces.applyEdit(workspace.layout, next);
    renderWorkspaceManager();
    clearTimeout(wsView.nudge?.timer);
    const message = Workspaces.editMessage(workspace.name, next);
    wsView.nudge = { timer: setTimeout(() => {
        wsView.nudge = null;
        send("SetWorkspaceWindow", message);
    }, 300) };
});

// ---- launch rules

function renderRulesPage() {
    const list = $("ruleList");
    list.replaceChildren();
    $("rulesEmpty").hidden = launchRules.length > 0;
    const active = launchRules.filter(rule => rule.enabled).length;
    $("ruleCount").textContent = launchRules.length ? `${plural(launchRules.length, "rule")} · ${active} on` : "";
    launchRules.forEach(rule => {
        const item = element("li", `ws-rule${rule.enabled ? "" : " is-off"}`);
        const [drawn] = Workspaces.workspaceWindows([{ ...rule, index: 1 }]);
        const copy = element("span", "ws-rule-copy");
        copy.append(element("strong", "", rule.app), element("small", "", Workspaces.describeRule(rule)));
        copy.title = rule.path;
        const label = element("label", "ws-switch");
        label.title = rule.enabled ? "Turn this rule off" : "Turn this rule on";
        const box = element("input");
        box.type = "checkbox";
        box.checked = rule.enabled === true;
        box.dataset.wsFocus = `rule:${rule.path}`;
        box.setAttribute("aria-label", `${rule.app}: rule on`);
        box.addEventListener("change", () => send("SetLaunchRuleEnabled", `${box.checked ? 1 : 0}|${rule.path}`));
        label.append(box);
        const remove = wsButton("Delete", "secondary danger", async () => {
            const ok = await confirmDialog({ title: `Delete the Rule for ${rule.app}?`, message: "Its windows will open wherever the app puts them.", confirmLabel: "Delete rule", danger: true });
            if (ok) send("DeleteLaunchRule", rule.path);
        });
        item.append(wsThumb([drawn]), copy, label, remove);
        list.append(item);
    });
    const windows = launcherWindows.filter(win => !win.minimized);
    if (!windows.some(win => String(win.id) === wsView.ruleWindow)) wsView.ruleWindow = "";
    const picker = $("ruleWindows");
    picker.replaceChildren(...windows.map(win => {
        const on = String(win.id) === wsView.ruleWindow;
        const node = element("button", `ws-rule-window${on ? " is-on" : ""}`);
        node.type = "button";
        node.dataset.wsFocus = `pick:${win.id}`;
        node.setAttribute("aria-pressed", on ? "true" : "false");
        node.append(element("strong", "", win.app), element("small", "", win.title));
        node.addEventListener("click", () => {
            wsView.ruleWindow = String(win.id);
            renderWorkspaceManager();
        });
        return node;
    }));
    if (!windows.length) picker.append(element("p", "ws-empty", "No open windows on this desktop."));
    $("ruleRemember").disabled = !wsView.ruleWindow;
}

$("ruleRemember").addEventListener("click", () => {
    if (/^\d{1,20}$/.test(wsView.ruleWindow)) send("RememberWindowRule", wsView.ruleWindow);
});

enableTabWheel($("workspaceTabs"), ".ws-tab");
