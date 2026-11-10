"use strict";

(function () {
    const A = globalThis.MaestroAppearance;
    const H = globalThis.MaestroViewHistory;
    const K = globalThis.MaestroKeyNav;
    const { equal } = globalThis.TestHarness;

    // ---- Appearance
    equal("text size keeps a known value", A.textSize("110"), 110);
    equal("an unknown text size falls back", A.textSize("500"), 100);
    equal("a missing text size falls back", A.textSize(null), 100);
    equal("swing keeps a known mode", A.swingMode("never"), "never");
    equal("an unknown swing mode falls back", A.swingMode("sometimes"), "first");
    equal("a missing swing mode falls back", A.swingMode(null), "first");
    equal("first swings the first time", A.shouldSwing("first", false), true);
    equal("first doesn't swing again", A.shouldSwing("first", true), false);
    equal("every swings every time", A.shouldSwing("every", true), true);
    equal("never doesn't swing the first time", A.shouldSwing("never", false), false);
    equal("never doesn't swing later", A.shouldSwing("never", true), false);

    // ---- Page history
    let pages = H.create();
    equal("nothing to go back to at first", pages.back(), null);
    pages.visit("home");
    equal("one page has no back", pages.back(), null);
    equal("nor a forward", pages.forward(), null);
    pages.visit("games");
    pages.visit("sounds");
    equal("back goes to the last page", pages.back(), "games");
    equal("and again", pages.back(), "home");
    equal("back stops at the start", pages.back(), null);
    equal("forward returns", pages.forward(), "games");
    pages.visit("calendar");
    equal("a new page drops the pages ahead", pages.forward(), null);
    equal("and back still works", pages.back(), "games");

    pages = H.create();
    pages.visit("home");
    pages.visit("home");
    equal("staying on a page adds nothing", pages.back(), null);

    pages = H.create(3);
    ["a", "b", "c", "d"].forEach(view => pages.visit(view));
    equal("history is limited: newest", pages.back(), "c");
    equal("history is limited: oldest kept", pages.back(), "b");
    equal("history is limited: older gone", pages.back(), null);

    // ---- Arrow keys. A grid of two columns and two rows, with a sidebar item.
    const box = (left, top, width = 100, height = 40) => ({ left, top, right: left + width, bottom: top + height });
    const grid = {
        side: box(0, 0, 80, 40),
        a: box(200, 0),
        b: box(400, 0),
        c: box(200, 100),
        d: box(400, 100)
    };
    const from = name => {
        const others = Object.entries(grid).filter(([key]) => key !== name).map(([node, rect]) => ({ node, rect }));
        return key => K.pick(grid[name], others, key);
    };
    equal("right goes to the next in the row", from("a")("ArrowRight"), "b");
    equal("left goes back", from("b")("ArrowLeft"), "a");
    equal("down goes to the one below", from("a")("ArrowDown"), "c");
    equal("up goes to the one above", from("d")("ArrowUp"), "b");
    equal("left of the page reaches the sidebar", from("a")("ArrowLeft"), "side");
    equal("right out of the sidebar enters the page", from("side")("ArrowRight"), "a");
    equal("nothing above the top row", from("b")("ArrowUp"), null);
    equal("nothing beyond the right edge", from("d")("ArrowRight"), null);
    equal("another key picks nothing", from("a")("Enter"), null);
    equal("no controls, no target", K.pick(box(0, 0), [], "ArrowDown"), null);

    const wide = box(0, 0, 600, 40);
    const below = [{ node: "left", rect: box(0, 60) }, { node: "right", rect: box(500, 60) }];
    equal("from a wide control, the nearest below", K.pick(wide, below, "ArrowDown"), "left");

    const aligned = K.pick(box(0, 0), [{ node: "far", rect: box(0, 300) }, { node: "off", rect: box(600, 60) }], "ArrowDown");
    equal("one straight ahead beats one close but far to the side", aligned, "far");
})();
