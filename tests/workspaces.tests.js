(() => {
    const { equal } = TestHarness;
    const W = globalThis.ASCSWorkspaces;

    // 1.9.0: the Workspaces view's maps
    const map = W.workspaceMap([
        { app: "Code", title: "ascs", desktop: 1, monitor: 1, x: 0, y: 0, width: 0.5, height: 1 },
        { app: "msedge", title: "News", desktop: 0, monitor: 2, x: 0.5, y: 0, width: 0.5, height: 1 },
        { app: "Spotify", desktop: -1, pinned: true, monitor: 1, x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
        { app: "Old", desktop: -2, monitor: 1, maximized: true },
        { app: "Code", desktop: 1, monitor: 1, x: 0.9, y: 0.95, width: 0.5, height: 0.2 },
        "junk", null
    ], ["", "Work"]);
    equal("map: desktops in order, then older saves, then pinned", map.map(g => g.label).join(" | "), "Desktop 1 | Work | Current desktop | All desktops");
    equal("map: monitors kept apart", map[0].monitors.map(m => m.monitor).join(), "2");
    equal("map: windows grouped on their desktop", map[1].monitors[0].windows.length, 2);
    const spill = map[1].monitors[0].windows[1];
    equal("map: a window kept inside its monitor", `${spill.x},${spill.y}`, "0.5,0.8");
    equal("map: maximized fills the monitor", JSON.stringify(map[2].monitors[0].windows[0]).includes('"x":0,"y":0,"width":1,"height":1'), true);
    equal("map: an app with no name", W.workspaceMap([{ desktop: 0 }])[0].monitors[0].windows[0].app, "App");
    equal("map: a hostile title stays text", W.workspaceMap([{ app: "x", title: "<b>‮evil</b>", desktop: 0 }])[0].monitors[0].windows[0].title, "<b> evil</b>");
    equal("map: tiny windows are still visible", W.workspaceMap([{ desktop: 0, width: 0, height: 0 }])[0].monitors[0].windows[0].width, 0.04);
    equal("map: not a list", W.workspaceMap("nope").length, 0);
    equal("map: a desktop number out of range counts as current", W.workspaceMap([{ desktop: 500 }])[0].label, "Current desktop");
})();
