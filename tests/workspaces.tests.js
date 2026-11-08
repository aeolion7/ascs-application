(() => {
    const { equal } = TestHarness;
    const W = globalThis.ASCSWorkspaces;

    // 1.10.0: a workspace's windows, cleaned
    const layout = [
        { index: 1, app: "Code", title: "ascs", desktop: 1, monitor: 1, x: 0, y: 0, width: 0.5, height: 1 },
        { index: 2, app: "msedge", title: "News", desktop: 0, monitor: 2, x: 0.5, y: 0, width: 0.5, height: 1 },
        { index: 3, app: "Spotify", desktop: -1, pinned: true, monitor: 1, x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
        { index: 4, app: "Old", desktop: -2, monitor: 1, maximized: true, x: 0.2, width: 0.2 },
        { index: 5, app: "Code", desktop: 1, monitor: 1, x: 0.9, y: 0.95, width: 0.5, height: 0.2, enabled: false, missing: true },
        "junk", null
    ];
    const windows = W.workspaceWindows(layout);
    equal("windows: junk is dropped", windows.length, 5);
    equal("windows: a window kept inside its monitor", `${windows[4].x},${windows[4].y}`, "0.5,0.8");
    equal("windows: maximized fills the monitor", `${windows[3].x},${windows[3].width},${windows[3].maximized}`, "0,1,true");
    equal("windows: keys", windows.map(win => win.key).join(), "1,0,pinned,here,1");
    equal("windows: raw desktops", windows.map(win => win.desktop).join(), "1,0,-1,-2,1");
    equal("windows: on unless switched off", `${windows[0].enabled},${windows[4].enabled}`, "true,false");
    equal("windows: a missing app is told", `${windows[0].missing},${windows[4].missing}`, "false,true");
    equal("windows: an app with no name", W.workspaceWindows([{ desktop: 0 }])[0].app, "App");
    equal("windows: a hostile title stays text", W.workspaceWindows([{ app: "x", title: "<b>\u202eevil</b>", desktop: 0 }])[0].title, "<b> evil</b>");
    equal("windows: tiny windows are still visible", W.workspaceWindows([{ desktop: 0, width: 0, height: 0 }])[0].width, 0.04);
    equal("windows: not a list", W.workspaceWindows("nope").length, 0);
    equal("windows: a desktop number out of range counts as current", W.workspaceWindows([{ desktop: 500 }])[0].key, "here");
    equal("windows: an index out of range falls back to its place", W.workspaceWindows([{ index: 99 }])[0].index, 1);

    // The desktop tabs
    const tabs = W.workspaceDesktops({ layout, desktopNames: ["", "Work", ""] });
    equal("tabs: every saved desktop, then older saves, then pinned", tabs.map(tab => tab.label).join(" | "), "Desktop 1 | Work | Desktop 3 | Current desktop | All desktops");
    equal("tabs: counts", tabs.map(tab => tab.count).join(), "1,2,0,1,1");
    equal("tabs: a window on a desktop the names don't cover", W.workspaceDesktops({ layout: [{ desktop: 3 }], desktopNames: [""] }).map(tab => tab.key).join(), "0,3");
    equal("tabs: nothing", W.workspaceDesktops(null).length, 0);

    // The screens
    const screens = W.workspaceScreens(windows.filter(win => win.key === 1), { 1: 2.4571, 2: "x" }, 2);
    equal("screens: one for each monitor attached", screens.map(screen => screen.monitor).join(), "1,2");
    equal("screens: their real shape", screens[0].aspect, 2.4571);
    equal("screens: 16:9 when it isn't known", screens[1].aspect, 16 / 9);
    equal("screens: windows on their monitor", screens[0].windows.length, 2);
    equal("screens: a saved monitor that's gone still shows", W.workspaceScreens([{ monitor: 3 }], {}, 1).map(screen => screen.monitor).join(), "1,3");

    // Ready-made places
    equal("place: a third", W.placeOf({ x: 0.3333, y: 0, width: 0.3334, height: 1 }), "middle-third");
    equal("place: close enough", W.placeOf({ x: 0.002, y: 0, width: 0.498, height: 1 }), "left-half");
    equal("place: full only when maximized", W.placeOf({ x: 0, y: 0, width: 1, height: 1 }), "");
    equal("fills: exactly", W.fillsMonitor({ x: 0, y: 0, width: 1, height: 1 }), true);
    equal("fills: off by a few pixels", W.fillsMonitor({ x: 0.002, y: 0, width: 0.998, height: 1 }), true);
    equal("fills: not when narrower", W.fillsMonitor({ x: 0, y: 0, width: 0.98, height: 1 }), false);
    equal("fills: a saved window that fills counts as Full", W.workspaceWindows([{ desktop: 0, x: 0, y: 0, width: 1, height: 1 }])[0].maximized, true);
    equal("fills: and its size says so", W.sizeText(W.workspaceWindows([{ desktop: 0, x: 0, y: 0, width: 1, height: 1 }])[0]), "Full");
    equal("fills: a saved window that doesn't, isn't", W.workspaceWindows([{ desktop: 0, x: 0, y: 0, width: 0.9, height: 1 }])[0].maximized, false);
    equal("place: maximized is full", W.placeOf({ x: 0, y: 0, width: 1, height: 1, maximized: true }), "full");
    equal("place: none", W.placeOf({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 }), "");
    equal("place: applying right half", JSON.stringify(W.applyPlace(windows[0], "right-half")).includes('"x":0.5,"y":0,"width":0.5,"height":1'), true);
    equal("place: applying full maximizes", W.applyPlace(windows[0], "full").maximized, true);
    equal("place: leaving full un-maximizes", W.applyPlace({ ...windows[0], maximized: true }, "left-half").maximized, false);
    equal("place: an unknown one changes nothing", W.applyPlace(windows[0], "nope").x, windows[0].x);
    W.PLACES.forEach(place => equal(`place: ${place.id} fits`, place.x + place.width <= 1.0001 && place.y + place.height <= 1, true));

    // Numbers typed as percentages
    const half = { index: 1, x: 0.5, y: 0, width: 0.5, height: 1, desktop: 0, monitor: 1, maximized: false, pinned: false, enabled: true };
    equal("percent: left", W.setPercent(half, "x", "25").x, 0.25);
    equal("percent: wider moves left instead of running off", `${W.setPercent(half, "width", "80").x},${W.setPercent(half, "width", "80").width}`, "0.2,0.8");
    equal("percent: too small becomes the smallest", W.setPercent(half, "width", "1").width, 0.04);
    equal("percent: too big is kept to the monitor", W.setPercent(half, "x", "500").x, 0.5);
    equal("percent: empty changes nothing", W.setPercent(half, "x", ""), half);
    equal("percent: not a number changes nothing", W.setPercent(half, "x", "abc"), half);
    equal("percent: an unknown field changes nothing", W.setPercent(half, "path", "5"), half);
    equal("percent: a number un-maximizes", W.setPercent({ ...half, maximized: true }, "x", "10").maximized, false);
    equal("percent: typing 100% by 100% is Full", W.setPercent({ ...half, x: 0, y: 0, width: 0.5, height: 1 }, "width", "100").maximized, true);
    equal("percent: shrinking a Full window leaves Full", W.setPercent({ ...half, x: 0, y: 0, width: 1, height: 1, maximized: true }, "width", "50").maximized, false);
    equal("size text", W.sizeText(half), "50% × 100%");
    equal("size text: maximized", W.sizeText({ ...half, maximized: true }), "Full");

    // The message to AHK: only places and switches
    equal("message", W.editMessage("Coding", half), "Coding|1|0|1|0.5000|0.0000|0.5000|1.0000|0|0|1");
    equal("message: pinned", W.editMessage("Coding", { ...half, pinned: true, desktop: 2 }), "Coding|1|-1|1|0.5000|0.0000|0.5000|1.0000|0|1|1");
    equal("message: off and maximized", W.editMessage("Coding", { ...half, enabled: false, maximized: true }), "Coding|1|0|1|0.5000|0.0000|0.5000|1.0000|1|0|0");
    equal("message: kept to the monitor", W.editMessage("Coding", { ...half, x: 0.9 }).split("|")[4], "0.5000");
    equal("message: no path or title", /path|title|exe/i.test(W.editMessage("Coding", { ...half, path: "C:\\evil.exe", title: "x" })), false);

    // Shown at once
    const applied = W.applyEdit(layout, { ...half, index: 3, x: 0.25, pinned: false, desktop: 1 });
    equal("apply: changes that window", `${applied[2].x},${applied[2].pinned},${applied[2].desktop}`, "0.25,false,1");
    equal("apply: keeps its name", applied[2].app, "Spotify");
    equal("apply: leaves the others", applied[0], layout[0]);
    equal("apply: keeps junk out of harm's way", applied[5], "junk");

    // Dragging
    const lines = W.snapLines([half, { index: 2, x: 0, y: 0, width: 0.25, height: 0.5 }], 1);
    equal("snap: includes the monitor's thirds", lines.x.includes(0.6667), true);
    equal("snap: includes another window's edge", lines.x.includes(0.25) && lines.y.includes(0.5), true);
    equal("snap: not its own edges", W.snapLines([{ index: 1, x: 0.77, y: 0.11, width: 0.1, height: 0.1 }], 1).x.includes(0.77), false);
    const start = { x: 0.3, y: 0.1, width: 0.2, height: 0.5 };
    const plain = { x: [0, 1], y: [0, 1] };
    equal("drag: a move lands on a whole percent", JSON.stringify(W.dragPlace(start, "move", 0.1, 0.1, plain)), JSON.stringify({ x: 0.4, y: 0.2, width: 0.2, height: 0.5 }));
    equal("drag: a move keeps the size", W.dragPlace(start, "move", 0.337, 0, plain).width, 0.2);
    equal("drag: stays on the monitor", W.dragPlace(start, "move", -5, 5, plain).x, 0);
    equal("drag: stays on the monitor, bottom", W.dragPlace(start, "move", -5, 5, plain).y, 0.5);
    equal("drag: the left edge sticks", W.dragPlace(start, "move", -0.295, 0, plain).x, 0);
    equal("drag: the right edge sticks", W.dragPlace(start, "move", 0.495, 0, plain).x, 0.8);
    equal("drag: sticks to another window", W.dragPlace(start, "e", 0.242, 0, { x: [0, 1, 0.75], y: [0, 1] }).width, 0.45);
    equal("drag: east changes only the width", JSON.stringify(W.dragPlace(start, "e", 0.1, 0.3, plain)), JSON.stringify({ x: 0.3, y: 0.1, width: 0.3, height: 0.5 }));
    equal("drag: west keeps the right edge", JSON.stringify(W.dragPlace(start, "w", -0.1, 0, plain)), JSON.stringify({ x: 0.2, y: 0.1, width: 0.3, height: 0.5 }));
    equal("drag: north keeps the bottom edge", JSON.stringify(W.dragPlace(start, "n", 0, -0.05, plain)), JSON.stringify({ x: 0.3, y: 0.05, width: 0.2, height: 0.55 }));
    equal("drag: a corner changes both", JSON.stringify(W.dragPlace(start, "se", 0.1, 0.1, plain)), JSON.stringify({ x: 0.3, y: 0.1, width: 0.3, height: 0.6 }));
    equal("drag: never smaller than the smallest", W.dragPlace(start, "e", -5, 0, plain).width, 0.04);
    equal("drag: west can't pass the right edge", W.dragPlace(start, "w", 5, 0, plain).x, 0.46);
    equal("drag: south stops at the monitor", W.dragPlace(start, "s", 0, 5, plain).height, 0.9);
    equal("drag: west stops at the monitor", W.dragPlace(start, "w", -5, 0, plain).width, 0.5);

    // The keyboard
    equal("nudge: left", W.nudgePlace(half, "ArrowLeft").x, 0.49);
    equal("nudge: stops at the edge", W.nudgePlace(half, "ArrowRight").x, 0.5);
    equal("nudge: shift resizes", W.nudgePlace(half, "ArrowDown", true).height, 1);
    equal("nudge: shift makes it narrower", W.nudgePlace(half, "ArrowLeft", true).width, 0.49);
    equal("nudge: un-maximizes", W.nudgePlace({ ...half, maximized: true }, "ArrowLeft").maximized, false);
    equal("nudge: growing to fill is Full", W.nudgePlace({ ...half, x: 0, y: 0, width: 0.99, height: 1 }, "ArrowRight", true).maximized, true);
    equal("nudge: shrinking from Full leaves Full", W.nudgePlace({ ...half, x: 0, y: 0, width: 1, height: 1, maximized: true }, "ArrowLeft", true).maximized, false);
    equal("nudge: another key does nothing", W.nudgePlace(half, "a"), null);

    // Launch rules in words
    equal("rule: left, on a named desktop", W.describeRule({ monitor: 1, x: 0, y: 0, width: 0.62, height: 1, desktop: 1, desktopName: "Work" }), "62% × 100% on the left of monitor 1 · Work");
    equal("rule: right, numbered desktop", W.describeRule({ monitor: 2, x: 0.5, y: 0, width: 0.5, height: 0.5, desktop: 0 }), "50% × 50% on the right of monitor 2 · desktop 1");
    equal("rule: middle, no desktop", W.describeRule({ monitor: 1, x: 0.25, width: 0.5, height: 0.8, desktop: -2 }), "50% × 80% in the middle of monitor 1 · the desktop it opens on");
    equal("rule: maximized and pinned", W.describeRule({ monitor: 1, maximized: true, pinned: true, desktop: -1 }), "Maximized on monitor 1 · every desktop");
    equal("rule: nothing", W.describeRule(null), "");
})();
