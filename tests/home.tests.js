"use strict";

(function () {
    const L = globalThis.MaestroHomeLayout;
    const { equal } = globalThis.TestHarness;
    const ids = () => L.MODULES.map(module => module.id).join();

    const ADDED = "weather,processes,network,audio,controllers,pinned,unlocks,timer,metronome";
    equal("the first seven show by default, the added ones start hidden", L.defaults().hidden.join(), ADDED);
    equal("in the planned order", L.defaults().order.join(), ids());

    equal("nothing stored gives the default", L.parse(null).order.join(), ids());
    equal("broken text gives the default", L.parse("{oops").order.join(), ids());
    equal("the wrong shape gives the default", L.parse("[1,2]").order.join(), ids());

    let layout = L.parse(JSON.stringify({ order: ["note", "gone", "note", "now"], hidden: ["today", "gone", "today"] }));
    equal("a stored order comes first", layout.order.slice(0, 2).join(), "note,now");
    equal("modules it doesn't name join at the end", layout.order.length, L.MODULES.length);
    equal("unknown and repeated modules go", layout.order.filter(id => id === "note" || id === "gone").join(), "note");
    equal("so do unknown and repeated hidden ones", layout.hidden.filter(id => !ADDED.split(",").includes(id)).join(), "today");
    equal("modules added since a layout was kept join it hidden", layout.hidden.filter(id => ADDED.split(",").includes(id)).join(), ADDED);

    layout = L.defaults();
    equal("moving up", L.move(layout, "today", -1).order.slice(0, 2).join(), "today,now");
    equal("moving down", L.move(layout, "now", 1).order.slice(0, 2).join(), "today,now");
    equal("the first can't move up", L.move(layout, "now", -1), layout);
    equal("the last can't move down", L.move(layout, "metronome", 1), layout);
    equal("an unknown module doesn't move", L.move(layout, "gone", 1), layout);
    equal("moving leaves the original alone", layout.order[0], "now");

    const allShown = { ...layout, hidden: [] };
    equal("hiding", L.setShown(allShown, "today", false).hidden.join(), "today");
    equal("hiding twice counts once", L.setShown(L.setShown(allShown, "today", false), "today", false).hidden.length, 1);
    equal("showing again", L.setShown(L.setShown(allShown, "today", false), "today", true).hidden.length, 0);
    equal("an unknown module can't be hidden", L.setShown(allShown, "gone", false).hidden.length, 0);
    equal("showing an added module", L.setShown(layout, "weather", true).hidden.includes("weather"), false);

    // Widths: one to three squares of a grid three wide and three high.
    equal("the default widths", L.defaults().order.map(id => L.defaults().widths[id]).join(), "2,1,1,1,1,2,1,1,1,1,1,1,1,1,1,1");
    equal("the default fills the nine squares in three rows", JSON.stringify(L.fit(L.defaults())), JSON.stringify({ squares: 9, rows: 3, empty: 0, fits: true }));
    equal("the default rows", L.rows(L.defaults()).map(row => row.join("+")).join(" / "), "now+today / next+system+stack / continue+note");
    equal("setting a width", L.setWidth(layout, "today", 3).widths.today, 3);
    equal("a width past three isn't set", L.setWidth(layout, "today", 4), layout);
    equal("nor one under one, or not whole", [L.setWidth(layout, "today", 0), L.setWidth(layout, "today", 1.5)].every(same => same === layout), true);
    equal("nor an unknown module's", L.setWidth(layout, "gone", 2), layout);
    equal("setting a width leaves the original alone", layout.widths.today, 1);
    equal("a module too wide for what's left starts the next row", L.rows(L.setWidth(layout, "today", 2)).map(row => row.join("+")).join(" / "), "now / today+next / system+stack / continue+note");
    equal("and the page then needs a fourth row", JSON.stringify(L.fit(L.setWidth(layout, "today", 2))), JSON.stringify({ squares: 10, rows: 4, empty: 2, fits: false }));
    equal("a hidden module takes no squares", L.fit(L.setShown(layout, "note", false)).squares, 8);
    equal("stored widths are kept", L.parse(JSON.stringify({ order: [], hidden: [], widths: { note: 3, today: 2 } })).widths.note, 3);
    const odd = L.parse(JSON.stringify({ order: [], hidden: [], widths: { note: 9, today: "2", now: -1, gone: 2 } }));
    equal("wrong stored widths fall back to the module's own", [odd.widths.note, odd.widths.today, odd.widths.now, "gone" in odd.widths].join(), "1,1,2,false");
    const hiddenToday = L.setShown(layout, "today", false);
    equal("moving among what shows passes a hidden module", L.moveShown(hiddenToday, "next", -1).order.slice(0, 3).join(), "next,now,today");
    equal("the first shown can't move up", L.moveShown(hiddenToday, "now", -1), hiddenToday);
    equal("the last shown can't move down", L.moveShown(layout, "note", 1), layout);
    equal("placing after another", L.place(layout, "now", "system", true).order.slice(0, 7).join(), "today,next,system,now,stack,continue,note");
    equal("placing before another", L.place(layout, "note", "today", false).order.slice(0, 3).join(), "now,note,today");
    equal("placing where it already is changes nothing", L.place(layout, "today", "now", true), layout);
    equal("placing on itself changes nothing", L.place(layout, "today", "today", true), layout);
    equal("a layout stored before widths gets the defaults", L.parse(JSON.stringify({ order: ["note"], hidden: [] })).widths.continue, 2);
})();
