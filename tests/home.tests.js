"use strict";

(function () {
    const L = globalThis.MaestroHomeLayout;
    const { equal } = globalThis.TestHarness;
    const ids = () => L.MODULES.map(module => module.id).join();

    const ADDED = "weather,processes,network,audio,controllers,pinned,unlocks,timer,metronome,routines";
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
    equal("the last can't move down", L.move(layout, "routines", 1), layout);
    equal("an unknown module doesn't move", L.move(layout, "gone", 1), layout);
    equal("moving leaves the original alone", layout.order[0], "now");

    const allShown = { ...layout, hidden: [] };
    equal("hiding", L.setShown(allShown, "today", false).hidden.join(), "today");
    equal("hiding twice counts once", L.setShown(L.setShown(allShown, "today", false), "today", false).hidden.length, 1);
    equal("showing again", L.setShown(L.setShown(allShown, "today", false), "today", true).hidden.length, 0);
    equal("an unknown module can't be hidden", L.setShown(allShown, "gone", false).hidden.length, 0);
    equal("showing an added module", L.setShown(layout, "weather", true).hidden.includes("weather"), false);

    // Widths: one to three squares of a grid three wide and three high.
    equal("the default widths", L.defaults().order.map(id => L.defaults().widths[id]).join(), "2,1,1,1,1,2,1,1,1,1,1,1,1,1,1,1,1");
    equal("the default fills the nine squares in three rows", JSON.stringify(L.fit(L.defaults())), JSON.stringify({ squares: 9, rows: 3, empty: 0, fits: true }));
    equal("the default rows", L.rows(L.defaults()).map(row => row.join("+")).join(" / "), "now+today / next+system+stack / continue+note");
    equal("setting a width", L.setWidth(layout, "today", 3).widths.today, 3);
    equal("a width past three isn't set", L.setWidth(layout, "today", 4), layout);
    equal("nor one under one, or not whole", [L.setWidth(layout, "today", 0), L.setWidth(layout, "today", 1.5)].every(same => same === layout), true);
    equal("nor an unknown module's", L.setWidth(layout, "gone", 2), layout);
    equal("setting a width leaves the original alone", layout.widths.today, 1);
    // 2.9.0: each module goes in the first space where it fits, so a later one
    // fills a gap an earlier, wider one left.
    equal("a module too wide for what's left goes below, and a later one fills the gap", L.rows(L.setWidth(layout, "today", 2)).map(row => row.join("+")).join(" / "), "now+next / today+system / stack+continue / note");
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

    // 2.9.0: heights.
    equal("every module starts one square tall", Object.values(L.defaults().heights).every(height => height === 1), true);
    equal("a list can be three tall, Now Playing and Today two, the Timer one", ["note", "now", "today", "timer"].map(L.tallest).join(), "3,2,2,1");
    equal("setting a height", L.setHeight(layout, "note", 3).heights.note, 3);
    equal("not past what the module can use", L.setHeight(layout, "now", 3), layout);
    equal("nor under one, or not whole, or an unknown module's", [L.setHeight(layout, "note", 0), L.setHeight(layout, "note", 1.5), L.setHeight(layout, "gone", 2)].every(same => same === layout), true);
    equal("a layout stored before heights gets one square each", L.parse(JSON.stringify({ order: [], hidden: [] })).heights.note, 1);
    const tallJunk = L.parse(JSON.stringify({ order: [], hidden: [], heights: { note: 3, now: 3, today: "2", timer: 2, gone: 2 } })).heights;
    equal("stored heights are kept, and junk ones dropped", [tallJunk.note, tallJunk.now, tallJunk.today, tallJunk.timer, tallJunk.gone].join(), "3,1,1,1,");
    const gaming = { order: ["now", "today", "unlocks", "continue", "note"], hidden: [], widths: { now: 2, today: 1, unlocks: 1, continue: 2, note: 1 }, heights: { now: 2 } };
    equal("a tall module takes its rows, and the next ones fill beside it",
        L.grid(gaming).map(spot => `${spot.id}@${spot.row},${spot.column}`).join(" "), "now@0,0 today@0,2 unlocks@1,2 continue@2,0 note@2,2");
    equal("and the window is just filled", JSON.stringify(L.fit(gaming)), JSON.stringify({ squares: 9, rows: 3, empty: 0, fits: true }));
    const tallToday = L.setHeight(L.defaults(), "today", 2);
    equal("in the default, a tall Today pushes the last module to a fourth row",
        L.rows(tallToday).map(row => row.join("+")).join(" / "), "now+today / next+system / stack+continue / note");
    equal("which the fit says", JSON.stringify(L.fit(tallToday)), JSON.stringify({ squares: 10, rows: 4, empty: 2, fits: false }));
    equal("a height a module can't use counts as one square", L.grid({ ...gaming, heights: { now: 9 } })[0].height, 2);
    equal("nothing showing needs no rows", JSON.stringify(L.fit({ order: [], hidden: [], widths: {} })), JSON.stringify({ squares: 0, rows: 0, empty: 0, fits: true }));

    // 2.9.0: saved layouts.
    const legacy = JSON.stringify({ ...L.defaults(), widths: { ...L.defaults().widths, today: 3 } });
    let saved = L.parseSaved(null, legacy);
    equal("the one layout from before becomes Default", `${saved.list.map(entry => entry.name).join()} ${saved.active} ${L.activeLayout(saved).widths.today}`, "Default Default 3");
    equal("nothing at all is the default Default", L.activeLayout(L.parseSaved("{oops")).widths.today, 1);
    saved = L.addSaved(saved, "  Gaming   setup ", L.defaults());
    equal("a new layout is named, tidied, and in use", `${saved.list.length} ${saved.active}`, "2 Gaming setup");
    equal("a name can't be taken twice, in any case", L.nameProblem(saved, "gaming SETUP"), "There's already a layout named Gaming setup.");
    equal("nor be empty", L.nameProblem(saved, "   "), "Give the layout a name.");
    equal("nor long", L.nameProblem(saved, "x".repeat(41)), "A name can be 40 characters at most.");
    equal("renaming to its own name in another case is fine", L.nameProblem(saved, "GAMING SETUP", "Gaming setup"), "");
    equal("a taken name adds nothing", L.addSaved(saved, "default", L.defaults()), saved);
    saved = L.renameSaved(saved, "Gaming setup", "Gaming");
    equal("renaming the one in use keeps it in use", `${saved.active} ${saved.list[1].name}`, "Gaming Gaming");
    saved = L.storeActive(saved, L.setWidth(L.defaults(), "note", 3));
    equal("Arrange changes the one in use only", `${L.activeLayout(saved).widths.note} ${saved.list[0].layout.widths.note}`, "3 1");
    saved = L.setGaming(saved, "Gaming", true);
    equal("one layout is for while a game runs", saved.list.map(entry => entry.gaming).join(), "false,true");
    equal("marking another moves it", L.setGaming(saved, "Default", true).list.map(entry => entry.gaming).join(), "true,false");
    saved = L.chooseSaved(saved, "default");
    equal("choosing by name, in any case", saved.active, "Default");

    let followed = L.followGames(saved, null, true);
    equal("a game starting switches to the gaming layout", `${followed.saved.active} ${followed.session.before}`, "Gaming Default");
    followed = L.followGames(followed.saved, followed.session, true);
    equal("while it runs nothing changes", followed.saved.active, "Gaming");
    let ended = L.followGames(followed.saved, followed.session, false);
    equal("the last game closing switches back", `${ended.saved.active} ${ended.session.playing}`, "Default false");
    const byHand = L.followGames(L.chooseSaved(followed.saved, "Default"), L.choseByHand(followed.session), false);
    equal("a layout chosen by hand meanwhile stays", byHand.saved.active, "Default");
    equal("choosing by hand with no game running changes nothing to remember", L.choseByHand(null).chosen, false);
    const alreadyGaming = L.followGames(L.chooseSaved(saved, "Gaming"), null, true);
    equal("already on the gaming layout, a game changes nothing", `${alreadyGaming.saved.active} ${alreadyGaming.session.switched}`, "Gaming false");
    equal("and nothing is put back after", L.followGames(alreadyGaming.saved, alreadyGaming.session, false).saved.active, "Gaming");
    const noGaming = L.followGames(L.setGaming(saved, "Gaming", false), null, true);
    equal("with no gaming layout, a game changes nothing", noGaming.saved.active, "Default");
    const gone = L.followGames(L.removeSaved(followed.saved, "Default"), followed.session, false);
    equal("if the one to go back to was deleted, it stays", gone.saved.active, "Gaming");

    equal("deleting the one in use passes to the first", L.removeSaved(L.chooseSaved(saved, "Gaming"), "Gaming").active, "Default");
    equal("the last can't be deleted", L.removeSaved(L.parseSaved(null), "Default").list.length, 1);
    const stored = L.parseSaved(JSON.stringify({ list: [{ name: "A", gaming: true, layout: L.defaults() }, { name: "a", layout: {} }, { name: "", layout: {} }, { name: "B", gaming: true, layout: "junk" }], active: "b" }));
    equal("stored: duplicates and blanks dropped, one gaming at most, active found in any case", `${stored.list.map(entry => entry.name).join()} ${stored.list.map(entry => entry.gaming).join()} ${stored.active}`, "A,B true,false B");
    equal("a junk stored layout is the default", L.activeLayout(stored).widths.now, 2);
    let many = L.parseSaved(null);
    for (let i = 0; i < 20; i++) many = L.addSaved(many, `L${i}`, L.defaults());
    equal("twelve at most", many.list.length, L.MAX_SAVED);
})();
