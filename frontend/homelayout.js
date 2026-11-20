"use strict";
// Which Podium modules show, in what order, how wide and (2.9.0) how tall.
// Pure rules, so they can be tested; homeview.js keeps the choice on this PC.

globalThis.MaestroHomeLayout = (() => {
    // The page is a grid three squares wide and three high. A module's width is
    // one to three squares; its height (2.9.0) one square, or up to `tall` for a
    // module with more to show when it has the room: a list shows more rows.
    const COLUMNS = 3;
    const ROWS = 3;
    const MODULES = Object.freeze([
        Object.freeze({ id: "now", label: "Now Playing", width: 2, tall: 2 }),
        Object.freeze({ id: "today", label: "Today", width: 1, tall: 2 }),
        Object.freeze({ id: "next", label: "Next Up", width: 1, tall: 3 }),
        Object.freeze({ id: "system", label: "System", width: 1, tall: 1 }),
        Object.freeze({ id: "stack", label: "Quick Actions and Arrangements", width: 1, tall: 1 }),
        Object.freeze({ id: "continue", label: "Continue Playing", width: 2, tall: 2 }),
        Object.freeze({ id: "note", label: "Quick Note", width: 1, tall: 3 }),
        // 2.0.0: these start hidden, in Arrange's dock.
        Object.freeze({ id: "weather", label: "Weather", width: 1, tall: 1, hidden: true }),
        Object.freeze({ id: "processes", label: "Top Apps", width: 1, tall: 3, hidden: true }),
        Object.freeze({ id: "network", label: "Network", width: 1, tall: 1, hidden: true }),
        Object.freeze({ id: "audio", label: "Audio", width: 1, tall: 1, hidden: true }),
        Object.freeze({ id: "controllers", label: "Controllers", width: 1, tall: 1, hidden: true }),
        Object.freeze({ id: "pinned", label: "Pinned Notes", width: 1, tall: 3, hidden: true }),
        Object.freeze({ id: "unlocks", label: "Recent Unlocks", width: 1, tall: 2, hidden: true }),
        Object.freeze({ id: "timer", label: "Timer", width: 1, tall: 1, hidden: true }),
        // 2.3.0
        Object.freeze({ id: "metronome", label: "Metronome", width: 1, tall: 1, hidden: true }),
        // 2.12.0
        Object.freeze({ id: "routines", label: "Routines", width: 1, tall: 3, hidden: true })
    ]);
    const IDS = MODULES.map(module => module.id);
    const defaultWidths = () => Object.fromEntries(MODULES.map(module => [module.id, module.width]));
    const defaultHeights = () => Object.fromEntries(MODULES.map(module => [module.id, 1]));
    // The tallest a module can be.
    const tallest = id => MODULES.find(module => module.id === id)?.tall ?? 1;

    const startHidden = () => MODULES.filter(module => module.hidden).map(module => module.id);
    const defaults = () => ({ order: [...IDS], hidden: startHidden(), widths: defaultWidths(), heights: defaultHeights() });
    const known = (list, seen = new Set()) => (Array.isArray(list) ? list : []).filter(id => {
        if (!IDS.includes(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
    const isWidth = value => Number.isInteger(value) && value >= 1 && value <= COLUMNS;
    const isHeight = (id, value) => Number.isInteger(value) && value >= 1 && value <= tallest(id);

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
        const heights = defaultHeights();
        const storedHeights = stored.heights && typeof stored.heights === "object" ? stored.heights : {};
        IDS.forEach(id => { if (isHeight(id, storedHeights[id])) heights[id] = storedHeights[id]; });
        // A module new since then joins at the end, hidden if it starts hidden.
        const added = IDS.filter(id => !order.includes(id));
        const hidden = known([...(Array.isArray(stored.hidden) ? stored.hidden : []), ...added.filter(id => startHidden().includes(id))]);
        return { order: [...order, ...added], hidden, widths, heights };
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

    function setHeight(layout, id, height) {
        if (!IDS.includes(id) || !isHeight(id, height)) return layout;
        return { ...layout, heights: { ...(layout.heights ?? defaultHeights()), [id]: height } };
    }

    const widthOf = (layout, id) => layout.widths?.[id] ?? 1;
    const heightOf = (layout, id) => Math.min(layout.heights?.[id] ?? 1, tallest(id));

    // Where each shown module lands (2.9.0), as the page's grid places them:
    // in order, each in the first space where it fits, reading across from the
    // top left (CSS's dense placement). Columns and rows count from 0.
    function grid(layout) {
        const taken = [];
        const free = (row, column, width, height) => {
            for (let r = row; r < row + height; r++) {
                for (let c = column; c < column + width; c++) if (taken[r]?.[c]) return false;
            }
            return true;
        };
        return layout.order.filter(id => !layout.hidden.includes(id)).map(id => {
            const width = widthOf(layout, id);
            const height = heightOf(layout, id);
            for (let row = 0; ; row++) {
                for (let column = 0; column + width <= COLUMNS; column++) {
                    if (!free(row, column, width, height)) continue;
                    for (let r = row; r < row + height; r++) {
                        taken[r] ??= [];
                        for (let c = column; c < column + width; c++) taken[r][c] = true;
                    }
                    return { id, column, row, width, height };
                }
            }
        });
    }

    // The modules that start in each row, left to right.
    function rows(layout) {
        const result = [];
        grid(layout).sort((a, b) => a.row - b.row || a.column - b.column).forEach(spot => {
            (result[spot.row] ??= []).push(spot.id);
        });
        return Array.from(result, row => row ?? []);
    }

    // How the layout sits in the window: the squares its modules cover, the
    // rows they need, and the squares left empty within those rows.
    function fit(layout) {
        const placed = grid(layout);
        const squares = placed.reduce((sum, spot) => sum + spot.width * spot.height, 0);
        const used = placed.reduce((most, spot) => Math.max(most, spot.row + spot.height), 0);
        return { squares, rows: used, empty: used * COLUMNS - squares, fits: used <= ROWS };
    }

    // ---- Saved layouts (2.9.0): named layouts, one in use. One of them may be
    // the layout for while a game runs; the Podium switches to it as a game
    // starts and back as the last one closes, unless another was chosen meanwhile.
    const MAX_SAVED = 12;
    const FIRST_NAME = "Default";
    const cleanName = text => (typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "");
    const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
    const findSaved = (saved, name) => saved.list.find(entry => sameName(entry.name, name));

    // What's stored, checked; with nothing stored, the one layout there was
    // before 2.9.0 (`legacyText`) becomes Default.
    function parseSaved(text, legacyText = null) {
        let stored = null;
        try { stored = JSON.parse(text); } catch { stored = null; }
        const list = [];
        (Array.isArray(stored?.list) ? stored.list : []).forEach(entry => {
            const name = cleanName(entry?.name).slice(0, 40);
            if (!name || list.length >= MAX_SAVED || list.some(other => sameName(other.name, name))) return;
            list.push({ name, gaming: entry.gaming === true, layout: parse(JSON.stringify(entry.layout ?? null)) });
        });
        if (!list.length) return { list: [{ name: FIRST_NAME, gaming: false, layout: parse(legacyText) }], active: FIRST_NAME };
        let gamingSeen = false;
        list.forEach(entry => { if (entry.gaming) { entry.gaming = !gamingSeen; gamingSeen = true; } });
        const active = findSaved({ list }, cleanName(stored.active))?.name ?? list[0].name;
        return { list, active };
    }

    // Why a name can't be used, or "" when it can. `except` is the layout being renamed.
    function nameProblem(saved, text, except = "") {
        const name = cleanName(text);
        if (!name) return "Give the layout a name.";
        if (name.length > 40) return "A name can be 40 characters at most.";
        const other = findSaved(saved, name);
        if (other && !(except && sameName(other.name, except))) return `There's already a layout named ${other.name}.`;
        return "";
    }

    const activeSaved = saved => findSaved(saved, saved.active) ?? saved.list[0];
    const activeLayout = saved => activeSaved(saved).layout;

    // A new layout, a copy of `layout`, in use from now.
    function addSaved(saved, text, layout) {
        const name = cleanName(text);
        if (nameProblem(saved, name) || saved.list.length >= MAX_SAVED) return saved;
        return { list: [...saved.list, { name, gaming: false, layout }], active: name };
    }

    function renameSaved(saved, from, text) {
        const name = cleanName(text);
        if (!findSaved(saved, from) || nameProblem(saved, name, from)) return saved;
        return {
            list: saved.list.map(entry => (sameName(entry.name, from) ? { ...entry, name } : entry)),
            active: sameName(saved.active, from) ? name : saved.active
        };
    }

    // The last one can't go; the one in use passes to the first left.
    function removeSaved(saved, name) {
        if (saved.list.length < 2 || !findSaved(saved, name)) return saved;
        const list = saved.list.filter(entry => !sameName(entry.name, name));
        return { list, active: sameName(saved.active, name) ? list[0].name : saved.active };
    }

    function chooseSaved(saved, name) {
        const entry = findSaved(saved, name);
        return entry && !sameName(entry.name, saved.active) ? { ...saved, active: entry.name } : saved;
    }

    // The layout in use, changed (by Arrange).
    function storeActive(saved, layout) {
        const active = activeSaved(saved).name;
        return { ...saved, list: saved.list.map(entry => (entry.name === active ? { ...entry, layout } : entry)) };
    }

    // At most one layout is for while a game runs.
    function setGaming(saved, name, on) {
        if (!findSaved(saved, name)) return saved;
        return { ...saved, list: saved.list.map(entry => ({ ...entry, gaming: sameName(entry.name, name) ? on : on ? false : entry.gaming })) };
    }

    // Games starting and stopping. `session` remembers whether a game is
    // running, whether its start switched the layout, from which, and whether
    // a layout was chosen by hand since. Returns both, changed or not.
    const QUIET = Object.freeze({ playing: false, switched: false, before: "", chosen: false });
    function followGames(saved, session, playing) {
        const was = session ?? QUIET;
        if (playing && !was.playing) {
            const gaming = saved.list.find(entry => entry.gaming);
            if (gaming && !sameName(gaming.name, saved.active)) {
                return { saved: chooseSaved(saved, gaming.name), session: { playing: true, switched: true, before: saved.active, chosen: false } };
            }
            return { saved, session: { ...QUIET, playing: true } };
        }
        if (!playing && was.playing) {
            const back = was.switched && !was.chosen && findSaved(saved, was.before) ? chooseSaved(saved, was.before) : saved;
            return { saved: back, session: QUIET };
        }
        return { saved, session: was };
    }

    // A layout chosen by hand while a game runs stays after it closes.
    const choseByHand = session => (session?.playing ? { ...session, chosen: true } : session ?? QUIET);

    return Object.freeze({
        COLUMNS, ROWS, MODULES, tallest, defaults, parse, move, moveShown, place, setShown, setWidth, setHeight, grid, rows, fit,
        MAX_SAVED, parseSaved, nameProblem, activeLayout, addSaved, renameSaved, removeSaved, chooseSaved, storeActive, setGaming, followGames, choseByHand
    });
})();
