// Pure Workspaces logic (1.9.0; 1.10.0 adds editing): no DOM, no messaging, so
// it can be tested.
(global => {
    "use strict";

    const MIN_SIZE = 0.04;
    const fraction = value => (typeof value === "number" && Number.isFinite(value) ? value : 0);
    const round4 = value => Math.round(value * 10000) / 10000;
    const clean = (value, max) => (typeof value === "string" ? value : "")
        .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
        .replace(/\s{2,}/g, " ").trim().slice(0, max);

    // A saved place kept inside its monitor (fractions of the work area, 0 to 1).
    function clampPlace(place) {
        const width = Math.min(1, Math.max(MIN_SIZE, fraction(place?.width)));
        const height = Math.min(1, Math.max(MIN_SIZE, fraction(place?.height)));
        return {
            x: round4(Math.min(1 - width, Math.max(0, fraction(place?.x)))),
            y: round4(Math.min(1 - height, Math.max(0, fraction(place?.y)))),
            width: round4(width), height: round4(height)
        };
    }

    // A window that fills its monitor, to within a few pixels, is Full. Keep in
    // step with WorkspaceFillsMonitor in ASCS.Core.ahk.
    function fillsMonitor(place) {
        const near = (value, target) => Math.abs(fraction(value) - target) <= 0.005;
        return near(place?.x, 0) && near(place?.y, 0) && near(place?.width, 1) && near(place?.height, 1);
    }

    // A workspace's windows, cleaned: each has its place in the file (index), its
    // desktop's key (a number, "here" for those saved without desktops, or
    // "pinned") and a place that fits on its monitor. A maximized one fills it.
    function workspaceWindows(layout) {
        return (Array.isArray(layout) ? layout : []).slice(0, 48)
            .filter(item => item && typeof item === "object")
            .map((item, position) => {
                const pinned = item.pinned === true;
                const numbered = Number.isInteger(item.desktop) && item.desktop >= 0 && item.desktop < 100;
                const maximized = item.maximized === true || fillsMonitor(item);
                return {
                    index: Number.isInteger(item.index) && item.index >= 1 && item.index <= 48 ? item.index : position + 1,
                    app: clean(item.app, 60) || "App", title: clean(item.title, 120),
                    key: pinned ? "pinned" : numbered ? item.desktop : "here",
                    desktop: pinned ? -1 : numbered ? item.desktop : -2,
                    monitor: Number.isInteger(item.monitor) && item.monitor >= 1 && item.monitor <= 16 ? item.monitor : 1,
                    ...(maximized ? { x: 0, y: 0, width: 1, height: 1 } : clampPlace(item)),
                    maximized, pinned,
                    enabled: item.enabled !== false, missing: item.missing === true
                };
            });
    }

    // The desktops to choose between: each one the workspace knows (named in Task
    // View, or numbered), even if empty, then older saves, then every desktop.
    function workspaceDesktops(workspace) {
        const windows = workspaceWindows(workspace?.layout);
        const names = (Array.isArray(workspace?.desktopNames) ? workspace.desktopNames : []).slice(0, 20);
        const count = key => windows.filter(win => win.key === key).length;
        const numbers = new Set(names.map((_, number) => number));
        windows.forEach(win => { if (typeof win.key === "number") numbers.add(win.key); });
        const tabs = [...numbers].sort((a, b) => a - b).map(number => ({
            key: number, label: clean(names[number], 60) || `Desktop ${number + 1}`, count: count(number)
        }));
        if (count("here")) tabs.push({ key: "here", label: "Current desktop", count: count("here") });
        if (count("pinned")) tabs.push({ key: "pinned", label: "All desktops", count: count("pinned") });
        return tabs;
    }

    // One screen per monitor, drawn at its real shape: those of a desktop's
    // windows and those attached now. The first window saved is the top one.
    function workspaceScreens(windows, aspects, monitorCount = 1) {
        const monitors = new Set(windows.map(win => win.monitor));
        for (let monitor = 1; monitor <= Math.min(16, Math.max(1, monitorCount)); monitor++) monitors.add(monitor);
        return [...monitors].sort((a, b) => a - b).map(monitor => {
            const aspect = aspects && typeof aspects === "object" ? aspects[monitor] : 0;
            return {
                monitor,
                aspect: typeof aspect === "number" && aspect >= 0.5 && aspect <= 6 ? aspect : 16 / 9,
                windows: windows.filter(win => win.monitor === monitor)
            };
        });
    }

    const PLACES = [
        { id: "left-third", label: "Left ⅓", x: 0, y: 0, width: 0.3333, height: 1 },
        { id: "middle-third", label: "Middle ⅓", x: 0.3333, y: 0, width: 0.3334, height: 1 },
        { id: "right-third", label: "Right ⅓", x: 0.6667, y: 0, width: 0.3333, height: 1 },
        { id: "left-half", label: "Left ½", x: 0, y: 0, width: 0.5, height: 1 },
        { id: "right-half", label: "Right ½", x: 0.5, y: 0, width: 0.5, height: 1 },
        { id: "full", label: "Full", x: 0, y: 0, width: 1, height: 1, maximized: true }
    ];

    const close = (a, b) => Math.abs(a - b) < 0.006;

    // Which ready-made place a window is in, if any.
    function placeOf(win) {
        const found = PLACES.find(place => (place.maximized === true) === (win?.maximized === true)
            && close(place.x, win?.x) && close(place.y, win?.y) && close(place.width, win?.width) && close(place.height, win?.height));
        return found ? found.id : "";
    }

    function applyPlace(win, id) {
        const place = PLACES.find(candidate => candidate.id === id);
        if (!place) return win;
        return { ...win, x: place.x, y: place.y, width: place.width, height: place.height, maximized: place.maximized === true };
    }

    // A number typed as a percentage. Left and Top give way to the size: a window
    // that's made wider moves left rather than run off the monitor.
    function setPercent(win, field, percent) {
        const value = Number(percent);
        if (!["x", "y", "width", "height"].includes(field) || percent === "" || !Number.isFinite(value)) return win;
        const place = clampPlace({ ...win, [field]: value / 100 });
        return { ...win, ...place, maximized: fillsMonitor(place) };
    }

    function percentText(value) {
        return `${Math.round(fraction(value) * 1000) / 10}%`;
    }

    // What the list says about a window's size.
    function sizeText(win) {
        return win?.maximized ? "Full" : `${Math.round(fraction(win?.width) * 100)}% × ${Math.round(fraction(win?.height) * 100)}%`;
    }

    // The message for one saved window: only places and switches. Validated again
    // in AHK (ParseWorkspaceWindowEdit).
    function editMessage(name, win) {
        const place = clampPlace(win);
        const number = value => value.toFixed(4);
        return [name, win.index, win.pinned ? -1 : win.desktop, win.monitor,
            number(place.x), number(place.y), number(place.width), number(place.height),
            win.maximized ? 1 : 0, win.pinned ? 1 : 0, win.enabled ? 1 : 0].join("|");
    }

    // A changed window back into the layout that came from AHK, so the page shows
    // it at once; AHK's reply then confirms it, or puts it back.
    function applyEdit(layout, win) {
        return (Array.isArray(layout) ? layout : []).map(item => (item && item.index === win.index ? {
            ...item, desktop: win.pinned ? -1 : win.desktop, monitor: win.monitor,
            x: win.x, y: win.y, width: win.width, height: win.height,
            maximized: win.maximized, pinned: win.pinned, enabled: win.enabled
        } : item));
    }

    // ---- dragging on the canvas

    // The lines a dragged edge sticks to: the monitor's edges, its thirds and
    // middle, and the edges of the other windows on the screen.
    function snapLines(windows, index) {
        const x = new Set([0, 1, 0.3333, 0.5, 0.6667]);
        const y = new Set([0, 1, 0.5]);
        windows.filter(win => win.index !== index).forEach(win => {
            x.add(win.x); x.add(round4(win.x + win.width));
            y.add(win.y); y.add(round4(win.y + win.height));
        });
        return { x: [...x], y: [...y] };
    }

    // An edge on a line if it's within the tolerance, else on a whole percent.
    function snapped(value, lines, tolerance) {
        let best = null;
        lines.forEach(line => {
            const distance = Math.abs(line - value);
            if (distance <= tolerance && (best === null || distance < Math.abs(best - value))) best = line;
        });
        return best !== null ? best : Math.round(value * 100) / 100;
    }

    // Moving: whichever of the two edges is nearer a line decides.
    function snappedStart(start, size, lines, tolerance) {
        const low = snapped(start, lines, tolerance);
        const high = snapped(start + size, lines, tolerance);
        const lowHit = lines.includes(low), highHit = lines.includes(high);
        if (lowHit && (!highHit || Math.abs(low - start) <= Math.abs(high - start - size))) return low;
        return highHit ? high - size : low;
    }

    // A window's place during a drag. mode: "move", or the edges being dragged
    // ("n", "se"…); dx and dy are fractions of the screen; a drag keeps it on its
    // monitor, and never smaller than the smallest size.
    function dragPlace(start, mode, dx, dy, lines, tolerance = 0.012) {
        let { x, y, width, height } = start;
        if (mode === "move") {
            x = snappedStart(Math.min(1 - width, Math.max(0, x + dx)), width, lines.x, tolerance);
            y = snappedStart(Math.min(1 - height, Math.max(0, y + dy)), height, lines.y, tolerance);
        } else {
            const right = x + width, bottom = y + height;
            if (mode.includes("w")) {
                x = Math.min(right - MIN_SIZE, Math.max(0, snapped(x + dx, lines.x, tolerance)));
                width = right - x;
            }
            if (mode.includes("e")) width = Math.max(MIN_SIZE, Math.min(1, snapped(right + dx, lines.x, tolerance)) - x);
            if (mode.includes("n")) {
                y = Math.min(bottom - MIN_SIZE, Math.max(0, snapped(y + dy, lines.y, tolerance)));
                height = bottom - y;
            }
            if (mode.includes("s")) height = Math.max(MIN_SIZE, Math.min(1, snapped(bottom + dy, lines.y, tolerance)) - y);
        }
        return clampPlace({ x, y, width, height });
    }

    // The keyboard's way: an arrow moves a window one percent; with Shift it
    // changes the size instead. Null for any other key.
    function nudgePlace(win, key, resize = false) {
        const step = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] }[key];
        if (!step) return null;
        const place = resize
            ? { x: win.x, y: win.y, width: win.width + step[0], height: win.height + step[1] }
            : { x: win.x + step[0], y: win.y + step[1], width: win.width, height: win.height };
        const next = clampPlace(place);
        return { ...win, ...next, maximized: fillsMonitor(next) };
    }

    // A launch rule in words: "62% × 100% on the left of monitor 1 · Work".
    function describeRule(rule) {
        if (!rule || typeof rule !== "object") return "";
        const percent = value => `${Math.round(Math.min(1, Math.max(0, fraction(value))) * 100)}%`;
        const monitor = Number.isInteger(rule.monitor) && rule.monitor >= 1 ? rule.monitor : 1;
        let where;
        if (rule.maximized === true) {
            where = `Maximized on monitor ${monitor}`;
        } else {
            const middle = fraction(rule.x) + fraction(rule.width) / 2;
            const side = middle < 0.4 ? "on the left of" : middle > 0.6 ? "on the right of" : "in the middle of";
            where = `${percent(rule.width)} × ${percent(rule.height)} ${side} monitor ${monitor}`;
        }
        const desktop = rule.pinned === true ? "every desktop"
            : Number.isInteger(rule.desktop) && rule.desktop >= 0 ? (clean(rule.desktopName, 60) || `desktop ${rule.desktop + 1}`)
            : "the desktop it opens on";
        return `${where} · ${desktop}`;
    }

    global.ASCSWorkspaces = {
        MIN_SIZE, PLACES, clampPlace, fillsMonitor, workspaceWindows, workspaceDesktops, workspaceScreens, placeOf, applyPlace,
        setPercent, percentText, sizeText, editMessage, applyEdit, snapLines, dragPlace, nudgePlace, describeRule
    };
})(globalThis);
