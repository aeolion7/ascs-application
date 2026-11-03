"use strict";

// Keyboard map data: an ISO 100% layout and the Super / Super+Shift bindings.
// No DOM access, so tests can exercise it. The fixed bindings mirror the
// hotkeys defined in ASCS.ahk (F24 & ...) and SuperShiftLayer(); keep in sync.
(function (global) {
    // ---------------------------------------------------------------- layout
    // Units are key widths (u). Each key: id, label, x, y, w (1), h (1), and
    // optionally special ("super", "planned") and note (shown on hover).
    // This is the user's customized Keychron Q6 Max: a 100% board with a
    // full-width left Shift, a rectangular Enter with \| above it, seven macro keys
    // (M1-M3 in place of PrtSc/ScrLk/Pause, M4-M7 above the numpad), a Code
    // key left of Alt, and Alt | Super | Fn | Ctrl right of Space.
    function isoFullSizeLayout() {
        const keys = [];
        const add = (id, label, x, y, w = 1, h = 1, extra = {}) => keys.push({ id, label, x, y, w, h, ...extra });
        const row = (y, x, items) => {
            let cursor = x;
            items.forEach(([id, label, w = 1]) => {
                add(id, label, cursor, y, w);
                cursor += w;
            });
        };

        // Function row
        add("esc", "Esc", 0, 0);
        ["f1", "f2", "f3", "f4"].forEach((id, i) => add(id, id.toUpperCase(), 2 + i, 0));
        ["f5", "f6", "f7", "f8"].forEach((id, i) => add(id, id.toUpperCase(), 6.5 + i, 0));
        ["f9", "f10", "f11", "f12"].forEach((id, i) => add(id, id.toUpperCase(), 11 + i, 0));
        // Macro keys share the Code key's status: reserved for planned ASCS
        // functionality, with no current compatibility.
        const macro = { special: "planned", note: "Macro key: reserved for planned ASCS functionality; no current compatibility." };
        ["m1", "m2", "m3"].forEach((id, i) => add(id, id.toUpperCase(), 15.25 + i, 0, 1, 1, macro));
        ["m4", "m5", "m6", "m7"].forEach((id, i) => add(id, id.toUpperCase(), 18.5 + i, 0, 1, 1, macro));

        // Main block
        row(1.25, 0, [["grave", "`"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"], ["6", "6"],
            ["7", "7"], ["8", "8"], ["9", "9"], ["0", "0"], ["minus", "-"], ["equal", "="], ["backspace", "Backspace", 2]]);
        row(2.25, 0, [["tab", "Tab", 1.5], ["q", "Q"], ["w", "W"], ["e", "E"], ["r", "R"], ["t", "T"], ["y", "Y"],
            ["u", "U"], ["i", "I"], ["o", "O"], ["p", "P"], ["lbracket", "["], ["rbracket", "]"], ["backslash", "\\ |", 1.5]]);
        row(3.25, 0, [["caps", "Caps", 1.75], ["a", "A"], ["s", "S"], ["d", "D"], ["f", "F"], ["g", "G"], ["h", "H"],
            ["j", "J"], ["k", "K"], ["l", "L"], ["semicolon", ";"], ["quote", "'"], ["enter", "Enter", 2.25]]);
        row(4.25, 0, [["lshift", "Shift", 2.25], ["z", "Z"], ["x", "X"], ["c", "C"], ["v", "V"],
            ["b", "B"], ["n", "N"], ["m", "M"], ["comma", ","], ["period", "."], ["slash", "/"], ["rshift", "Shift", 2.75]]);
        row(5.25, 0, [["lctrl", "Ctrl", 1.25], ["code", "Code", 1.25], ["lalt", "Alt", 1.25], ["space", "Space", 6.25],
            ["ralt", "Alt", 1.25], ["super", "Super", 1.25], ["fn", "Fn", 1.25], ["rctrl", "Ctrl", 1.25]]);
        const special = {
            code: { special: "planned", note: "Code: a custom key. Reserved for planned ASCS functionality; no current compatibility." },
            super: { special: "super", note: "Super (sends F24): the command key. Tap it to show or hide ASCS; hold it with another key to run a command." },
            fn: { note: "Fn: the keyboard's function layer, handled by the keyboard itself. Not used by ASCS." }
        };
        keys.forEach(key => Object.assign(key, special[key.id] || {}));

        // Navigation cluster and arrows
        add("ins", "Ins", 15.25, 1.25); add("home", "Home", 16.25, 1.25); add("pgup", "PgUp", 17.25, 1.25);
        add("del", "Del", 15.25, 2.25); add("end", "End", 16.25, 2.25); add("pgdn", "PgDn", 17.25, 2.25);
        add("up", "↑", 16.25, 4.25);
        add("left", "←", 15.25, 5.25); add("down", "↓", 16.25, 5.25); add("right", "→", 17.25, 5.25);

        // Numpad
        add("numlock", "Num", 18.5, 1.25); add("numdiv", "/", 19.5, 1.25); add("nummul", "*", 20.5, 1.25); add("numsub", "-", 21.5, 1.25);
        add("num7", "7", 18.5, 2.25); add("num8", "8", 19.5, 2.25); add("num9", "9", 20.5, 2.25); add("numadd", "+", 21.5, 2.25, 1, 2);
        add("num4", "4", 18.5, 3.25); add("num5", "5", 19.5, 3.25); add("num6", "6", 20.5, 3.25);
        add("num1", "1", 18.5, 4.25); add("num2", "2", 19.5, 4.25); add("num3", "3", 20.5, 4.25); add("numenter", "Enter", 21.5, 4.25, 1, 2);
        add("num0", "0", 18.5, 5.25, 2); add("numdec", ".", 20.5, 5.25);

        return { name: "Keychron Q6 Max (customized)", width: 22.5, height: 6.25, keys };
    }

    // -------------------------------------------------------------- bindings
    // Categories map to the theme: apps (violet), windows (steel),
    // saved (burgundy: workspaces, snippets, notes, files, text), custom (gold).
    const ACTIONS = {
        notes: { title: "Quick Notes", short: "Notes", cat: "apps", desc: "Opens the notes editor." },
        everything: { title: "Everything", short: "Find", cat: "apps", desc: "Opens Everything to search files." },
        dashboard: { title: "System Dashboard", short: "Dash", cat: "apps", desc: "Live metrics and hardware inventory." },
        terminal: { title: "Windows Terminal", short: "Term", cat: "apps", desc: "Focuses an open Terminal (switching desktops if needed) or opens one." },
        explorer: { title: "File Explorer", short: "Files", cat: "apps", desc: "Focuses an open Explorer window or opens one." },
        calculator: { title: "Calculator", short: "Calc", cat: "apps", desc: "Opens Calculator." },
        taskmanager: { title: "Task Manager", short: "Tasks", cat: "apps", desc: "Opens Task Manager." }
    };

    const FIXED_SUPER = {
        space: { title: "Command palette", short: "Cmd", cat: "apps", desc: "Search commands, notes, snippets, workspaces, and windows. = calculates, ? searches the web." },
        b: { title: "Vivaldi", short: "Web", cat: "apps", desc: "Focuses Vivaldi on this desktop, switches to its desktop, or opens it." },
        l: { title: "Lock workstation", short: "Lock", cat: "windows", desc: "Locks the Windows session." },
        m: { title: "Toggle mute", short: "Mute", cat: "windows", desc: "Mutes or unmutes system audio." },
        v: { title: "Clipboard History", short: "Clip", cat: "windows", desc: "Opens Windows clipboard history." },
        j: { title: "Insert timestamp", short: "Time", cat: "saved", desc: "Types yyyy-MM-dd HH:mm:ss at the cursor." },
        y: { title: "Insert date", short: "Date", cat: "saved", desc: "Types yyyy-MM-dd at the cursor." },
        s: { title: "Save workspace", short: "Save", cat: "saved", desc: "Saves the visible window layout as the Default workspace." },
        r: { title: "Restore workspace", short: "Load", cat: "saved", desc: "Restores the Default workspace, reusing open windows first." },
        left: { title: "Snap left", short: "Snap", cat: "windows", desc: "Left half of the monitor; then ↑ or ↓ for a quadrant." },
        right: { title: "Snap right", short: "Snap", cat: "windows", desc: "Right half of the monitor; then ↑ or ↓ for a quadrant." },
        up: { title: "Maximize", short: "Max", cat: "windows", desc: "Maximizes the active window." },
        down: { title: "Restore / minimize", short: "Min", cat: "windows", desc: "Restores a maximized window, otherwise minimizes it." }
    };

    const FIXED_SHIFT = {
        c: { title: "Quick capture", short: "Grab", cat: "saved", desc: "Saves the selected text (or the clipboard) as a new note without opening ASCS." },
        p: { title: "Paste a snippet", short: "Paste", cat: "saved", desc: "Opens the palette on your snippets; Enter pastes into the window you were using." },
        d: { title: "New folder", short: "+Dir", cat: "saved", desc: "Creates a folder in the active File Explorer location." },
        f: { title: "New file", short: "+File", cat: "saved", desc: "Creates an empty file in the active File Explorer location." },
        r: { title: "Choose a workspace", short: "Pick", cat: "saved", desc: "Opens the palette on your saved workspaces." },
        left: { title: "Move to monitor (left)", short: "Mon", cat: "windows", desc: "Moves the active window to the monitor on the left." },
        right: { title: "Move to monitor (right)", short: "Mon", cat: "windows", desc: "Moves the active window to the monitor on the right." }
    };

    // Unassigned letters handled by ASCS pass the Windows shortcut through.
    const WINDOWS_PASSTHROUGH = {
        c: "Win+C", d: "Win+D (Show desktop)", f: "Win+F", p: "Win+P (Project)"
    };

    const clone = binding => ({ ...binding });

    // Returns { super: {keyId: binding}, shift: {keyId: binding}, passthrough }.
    // hotkeys: {action: letter}; commands: [{id, name, kind, target, key}].
    function buildBindings(hotkeys = {}, commands = []) {
        const base = {};
        const shift = {};
        Object.entries(FIXED_SUPER).forEach(([key, binding]) => { base[key] = clone(binding); });
        for (let n = 1; n <= 9; n++) {
            const desktop = { title: `Desktop ${n}`, short: `D${n}`, cat: "windows", desc: `Switches to virtual desktop ${n} (top row or numpad).` };
            base[String(n)] = clone(desktop);
            base[`num${n}`] = clone(desktop);
            const move = { title: `Move window to desktop ${n}`, short: `→D${n}`, cat: "windows", desc: `Moves the active window to desktop ${n} and follows it.` };
            shift[String(n)] = clone(move);
            shift[`num${n}`] = clone(move);
        }
        Object.entries(hotkeys || {}).forEach(([action, key]) => {
            if (typeof key !== "string" || !/^[a-z]$/i.test(key) || !ACTIONS[action]) return;
            base[key.toLowerCase()] = { ...ACTIONS[action], configurable: true };
        });
        (Array.isArray(commands) ? commands : []).forEach(command => {
            if (!command || typeof command.key !== "string" || !/^[a-z]$/i.test(command.key)) return;
            base[command.key.toLowerCase()] = {
                title: command.name, short: String(command.name).slice(0, 5), cat: "custom",
                desc: `Custom command: ${command.target}`
            };
        });
        Object.entries(FIXED_SHIFT).forEach(([key, binding]) => { shift[key] = clone(binding); });
        ["terminal", "explorer"].forEach(action => {
            const key = typeof hotkeys?.[action] === "string" ? hotkeys[action].toLowerCase() : "";
            if (key && !shift[key]) {
                shift[key] = { title: `New ${ACTIONS[action].title} window`, short: "New", cat: "apps", desc: `Always opens a new ${ACTIONS[action].title} window.` };
            }
        });
        const passthrough = {};
        Object.entries(WINDOWS_PASSTHROUGH).forEach(([key, text]) => {
            if (!base[key]) passthrough[key] = text;
        });
        return { super: base, shift, passthrough };
    }

    global.ASCSKeymap = { isoFullSizeLayout, buildBindings };
})(globalThis);
