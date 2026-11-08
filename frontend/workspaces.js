// Pure Workspaces logic (1.9.0): no DOM, no messaging, so it can be tested.
(global => {
    "use strict";

    const fraction = value => (typeof value === "number" && Number.isFinite(value) ? value : 0);
    const clean = (value, max) => (typeof value === "string" ? value : "")
        .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, " ")
        .replace(/\s{2,}/g, " ").trim().slice(0, max);

    // A workspace's windows for its map: grouped by desktop (in order, then
    // windows saved before 1.9.0 or without desktops, then those pinned to
    // every desktop), each group by monitor, with every window's rectangle
    // kept inside its monitor (fractions of the work area, 0 to 1).
    function workspaceMap(layout, desktopNames = []) {
        const groups = new Map();
        (Array.isArray(layout) ? layout : []).slice(0, 48).forEach(item => {
            if (!item || typeof item !== "object") return;
            const key = item.pinned === true ? "pinned"
                : Number.isInteger(item.desktop) && item.desktop >= 0 && item.desktop < 100 ? item.desktop : "here";
            const monitor = Number.isInteger(item.monitor) && item.monitor >= 1 && item.monitor <= 16 ? item.monitor : 1;
            let x = 0, y = 0, width = 1, height = 1;
            if (item.maximized !== true) {
                width = Math.min(1, Math.max(0.04, fraction(item.width)));
                height = Math.min(1, Math.max(0.04, fraction(item.height)));
                x = Math.min(1 - width, Math.max(0, fraction(item.x)));
                y = Math.min(1 - height, Math.max(0, fraction(item.y)));
            }
            if (!groups.has(key)) groups.set(key, new Map());
            const monitors = groups.get(key);
            if (!monitors.has(monitor)) monitors.set(monitor, []);
            monitors.get(monitor).push({
                app: clean(item.app, 60) || "App", title: clean(item.title, 120),
                x, y, width, height, maximized: item.maximized === true
            });
        });
        const rank = key => (key === "pinned" ? 1e6 : key === "here" ? 1e5 : key);
        const names = Array.isArray(desktopNames) ? desktopNames : [];
        return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([key, monitors]) => ({
            key,
            label: key === "pinned" ? "All desktops" : key === "here" ? "Current desktop"
                : clean(names[key], 60) || `Desktop ${key + 1}`,
            monitors: [...monitors.entries()].sort((a, b) => a[0] - b[0]).map(([monitor, windows]) => ({ monitor, windows }))
        }));
    }

    global.ASCSWorkspaces = { workspaceMap };
})(globalThis);
