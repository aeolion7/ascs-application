"use strict";
// Which Command Center modules show, in what order, and how wide (2.0.0). Pure
// rules, so they can be tested; homeview.js keeps the choice on this PC.

globalThis.MaestroHomeLayout = (() => {
    // The page is a grid three squares wide and three high. Every module is one
    // square high; its width is one to three squares.
    const COLUMNS = 3;
    const ROWS = 3;
    const MODULES = Object.freeze([
        Object.freeze({ id: "now", label: "Now Playing", width: 2 }),
        Object.freeze({ id: "today", label: "Today", width: 1 }),
        Object.freeze({ id: "next", label: "Next Up", width: 1 }),
        Object.freeze({ id: "system", label: "System", width: 1 }),
        Object.freeze({ id: "stack", label: "Quick Actions and Arrangements", width: 1 }),
        Object.freeze({ id: "continue", label: "Continue Playing", width: 2 }),
        Object.freeze({ id: "note", label: "Quick Note", width: 1 }),
        // 2.0.0: these start hidden, in Arrange's dock.
        Object.freeze({ id: "weather", label: "Weather", width: 1, hidden: true }),
        Object.freeze({ id: "processes", label: "Top Apps", width: 1, hidden: true }),
        Object.freeze({ id: "network", label: "Network", width: 1, hidden: true }),
        Object.freeze({ id: "audio", label: "Audio", width: 1, hidden: true }),
        Object.freeze({ id: "controllers", label: "Controllers", width: 1, hidden: true }),
        Object.freeze({ id: "pinned", label: "Pinned Notes", width: 1, hidden: true }),
        Object.freeze({ id: "unlocks", label: "Recent Unlocks", width: 1, hidden: true }),
        Object.freeze({ id: "timer", label: "Timer", width: 1, hidden: true })
    ]);
    const IDS = MODULES.map(module => module.id);
    const defaultWidths = () => Object.fromEntries(MODULES.map(module => [module.id, module.width]));

    const startHidden = () => MODULES.filter(module => module.hidden).map(module => module.id);
    const defaults = () => ({ order: [...IDS], hidden: startHidden(), widths: defaultWidths() });
    const known = (list, seen = new Set()) => (Array.isArray(list) ? list : []).filter(id => {
        if (!IDS.includes(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
    const isWidth = value => Number.isInteger(value) && value >= 1 && value <= COLUMNS;

    // Anything stored that's wrong or out of date is dropped, and modules added
    // since it was stored join at the end, at their own width.
    function parse(text) {
        let stored = null;
        try { stored = JSON.parse(text); } catch { return defaults(); }
        if (!stored || typeof stored !== "object" || Array.isArray(stored)) return defaults();
        const order = known(stored.order);
        const widths = defaultWidths();
        const storedWidths = stored.widths && typeof stored.widths === "object" ? stored.widths : {};
        IDS.forEach(id => { if (isWidth(storedWidths[id])) widths[id] = storedWidths[id]; });
        // A module new since then joins at the end, hidden if it starts hidden.
        const added = IDS.filter(id => !order.includes(id));
        const hidden = known([...(Array.isArray(stored.hidden) ? stored.hidden : []), ...added.filter(id => startHidden().includes(id))]);
        return { order: [...order, ...added], hidden, widths };
    }

    function move(layout, id, step) {
        const order = [...layout.order];
        const at = order.indexOf(id);
        const to = at + step;
        if (at < 0 || to < 0 || to >= order.length) return layout;
        order.splice(at, 1);
        order.splice(to, 0, id);
        return { ...layout, order };
    }

    // One step among the modules that show, so a hidden one in between is passed
    // over rather than taking a key press to move past.
    function moveShown(layout, id, step) {
        const shown = layout.order.filter(other => !layout.hidden.includes(other));
        const at = shown.indexOf(id);
        const neighbor = shown[at + step];
        if (at < 0 || !neighbor) return layout;
        const order = layout.order.filter(other => other !== id);
        order.splice(order.indexOf(neighbor) + (step > 0 ? 1 : 0), 0, id);
        return { ...layout, order };
    }

    // Before or after another module, as a drag puts it.
    function place(layout, id, target, after) {
        if (id === target || !IDS.includes(id) || !layout.order.includes(target)) return layout;
        const order = layout.order.filter(other => other !== id);
        order.splice(order.indexOf(target) + (after ? 1 : 0), 0, id);
        return order.join() === layout.order.join() ? layout : { ...layout, order };
    }

    function setShown(layout, id, shown) {
        const hidden = layout.hidden.filter(other => other !== id);
        if (!shown && IDS.includes(id)) hidden.push(id);
        return { ...layout, hidden };
    }

    function setWidth(layout, id, width) {
        if (!IDS.includes(id) || !isWidth(width)) return layout;
        return { ...layout, widths: { ...layout.widths, [id]: width } };
    }

    // The rows the shown modules fill, in order: one that doesn't fit what's
    // left of a row starts the next, as the page lays them out.
    function rows(layout) {
        const result = [];
        let used = COLUMNS;
        layout.order.filter(id => !layout.hidden.includes(id)).forEach(id => {
            const width = layout.widths[id] ?? 1;
            if (used + width > COLUMNS) {
                result.push([]);
                used = 0;
            }
            result[result.length - 1].push(id);
            used += width;
        });
        return result;
    }

    // How the layout sits in the window: the squares its modules cover, the
    // rows they need, and the squares left empty within those rows.
    function fit(layout) {
        const filled = rows(layout);
        const squares = filled.flat().reduce((sum, id) => sum + (layout.widths[id] ?? 1), 0);
        return { squares, rows: filled.length, empty: filled.length * COLUMNS - squares, fits: filled.length <= ROWS };
    }

    return Object.freeze({ COLUMNS, ROWS, MODULES, defaults, parse, move, moveShown, place, setShown, setWidth, rows, fit });
})();
