"use strict";

(function () {
    const K = globalThis.ASCSKeymap;
    const { check, equal } = globalThis.TestHarness;

    // Layout
    const layout = K.isoFullSizeLayout();
    const ids = layout.keys.map(key => key.id);
    const byId = Object.fromEntries(layout.keys.map(key => [key.id, key]));
    equal("customized Q6 Max has 108 keys", layout.keys.length, 108);
    equal("key ids are unique", new Set(ids).size, ids.length);
    check("full-width left Shift, no ISO extra key", byId.lshift.w === 2.25 && !ids.includes("iso"));
    check("Enter is a 2.25u rectangle", byId.enter.w === 2.25 && byId.enter.h === 1 && !byId.enter.shape);
    check("backslash sits above Enter", byId.backslash.y === byId.enter.y - 1 && byId.backslash.w === 1.5);
    check("no ISO # key", !ids.includes("hash"));
    check("M1-M3 replace PrtSc/ScrLk/Pause", ["m1", "m2", "m3"].every(id => byId[id].y === 0 && byId[id].x >= 15.25 && byId[id].x < 18)
        && !ids.includes("prtsc") && !ids.includes("pause"));
    check("M4-M7 sit above the numpad", ["m4", "m5", "m6", "m7"].every((id, i) => byId[id].y === 0 && byId[id].x === 18.5 + i));
    check("bottom row: Ctrl Code Alt … Alt Super Fn Ctrl",
        ["lctrl", "code", "lalt", "space", "ralt", "super", "fn", "rctrl"].every((id, i, list) => i === 0 || byId[id].x > byId[list[i - 1]].x));
    equal("Code key is a macro key", byId.code.special, "macro");
    check("macro keys M1-M7 describe their own function", ["m1", "m2", "m3", "m4", "m5", "m6", "m7"].every(id => byId[id].special === "macro" && byId[id].caption && /M\d/.test(byId[id].note)));
    check("Code key note names VS Code", /VS Code/.test(byId.code.note));
    equal("physical Super key is marked", byId.super.special, "super");
    check("no Windows or Menu keys", !ids.includes("lwin") && !ids.includes("rwin") && !ids.includes("menu"));
    check("no key overlaps another", layout.keys.every((a, i) => layout.keys.every((b, j) => i === j
        || a.x + a.w <= b.x + 1e-9 || b.x + b.w <= a.x + 1e-9 || a.y + a.h <= b.y + 1e-9 || b.y + b.h <= a.y + 1e-9)));
    check("every letter present", "abcdefghijklmnopqrstuvwxyz".split("").every(letter => ids.includes(letter)));
    check("numpad digits present", [1, 2, 3, 4, 5, 6, 7, 8, 9].every(n => ids.includes(`num${n}`)));
    check("keys fit the layout width", layout.keys.every(key => key.x + key.w <= layout.width + 1e-9));

    // Bindings with the default letters
    const defaults = { notes: "q", everything: "f", dashboard: "i", terminal: "t", explorer: "e", claude: "c", taskmanager: "h" };
    let b = K.buildBindings(defaults, [{ id: 1, name: "ASCS repo", kind: "folder", target: "C:\ASCS", key: "a" }]);
    equal("Q opens notes", b.super.q.title, "Quick Notes");
    equal("C asks Claude without Shift", b.super.c.title, "Claude");
    equal("Shift+C captures", b.shift.c.title, "Quick capture");
    equal("Shift+P pastes a snippet", b.shift.p.title, "Paste a snippet");
    equal("Shift+S saves a named workspace", b.shift.s.title, "Save workspace as…");
    check("Shift+Q no longer captures", !b.shift.q);
    equal("Super+M4 starts a PSO session", b.super.m4.title, "PSO session");
    equal("Super+M5 lists recent RetroArch games", b.super.m5.title, "Recent RetroArch games");
    check("Super+Shift+macro keys stay vacant", ["m4", "m5", "m6", "m7"].every(id => !b.shift[id]));
    equal("Shift+T opens a new Terminal", b.shift.t.short, "New");
    equal("custom command key is gold", b.super.a.cat, "custom");
    equal("digits switch desktops", b.super["3"].title, "Desktop 3");
    equal("numpad digits switch desktops", b.super.num3.title, "Desktop 3");
    equal("Shift+digits move windows", b.shift["3"].short, "→D3");
    check("unassigned D passes Win+D through", /Win\+D/.test(b.passthrough.d));
    equal("unassigned D is drawn as Show desktop", b.super.d.title, "Show desktop");
    check("passthrough keys are marked as Windows shortcuts", b.super.d.passthrough === true && b.super.d.cat === "windows");
    equal("unassigned P is drawn as Project", b.super.p.title, "Project to a display");
    check("assigned F keeps its action, not the passthrough", b.super.f.title === "Everything" && !b.super.f.passthrough);
    check("assigned C is not passthrough", !b.passthrough.c);
    check("fixed reserved keys bound", ["b", "s", "r", "l", "m", "v", "j", "y", "space"].every(key => b.super[key]));

    // A Terminal letter that collides with the Shift layer keeps the layer action.
    b = K.buildBindings({ ...defaults, terminal: "p" }, []);
    equal("Shift+P stays snippets when Terminal is P", b.shift.p.title, "Paste a snippet");
    equal("Super+P is Terminal then", b.super.p.title, "Windows Terminal");
    check("old T letter is free", !b.super.t);
    equal("P assigned to Terminal is no longer a passthrough", b.super.p.passthrough, undefined);

    // Robustness
    b = K.buildBindings(null, null);
    check("works without settings", b.super.space && b.shift.c);
    b = K.buildBindings({ notes: "12", bogus: "z" }, [{ name: "x", key: "" }, null]);
    check("invalid letters and actions ignored", !b.super["12"] && !b.super.z);
})();
