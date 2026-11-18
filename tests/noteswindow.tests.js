"use strict";

// The game notes window's page (2.9.0).
(function () {
    const NW = globalThis.MaestroNotesWindow;
    const { check, equal } = globalThis.TestHarness;

    const state = NW.readState(JSON.stringify({ key: "bravefencermusashi", title: "Brave Fencer Musashi", text: "Boss on floor 3", ready: true }));
    equal("a state is read", `${state.key} ${state.title} ${state.text} ${state.ready}`, "bravefencermusashi Brave Fencer Musashi Boss on floor 3 true");
    equal("not JSON is nothing", NW.readState("<html>"), null);
    equal("a list is nothing", NW.readState("[1]"), null);
    const odd = NW.readState(JSON.stringify({ key: "../notes", title: 5, text: { a: 1 }, ready: "yes" }));
    equal("a bad key, title and text are blank, and not ready", JSON.stringify(odd), JSON.stringify({ key: "", title: "", text: "", ready: false }));
    equal("a key may be any letters", NW.isKey("ゼルダの伝説"), true);
    equal("long text is cut", NW.readState(JSON.stringify({ key: "a", text: "x".repeat(100010), ready: true })).text.length, 100000);

    const mine = { key: "a", title: "A", text: "typed", ready: true };
    check("another game's note always comes in", NW.takes(mine, { ...mine, key: "b", text: "" }, true));
    check("not over your typing in the same note", !NW.takes(mine, { ...mine, text: "older" }, true));
    check("but when you're not typing, it does", NW.takes(mine, { ...mine, text: "stamped" }, false));
    check("the same text changes nothing", !NW.takes(mine, { ...mine }, false));
    check("no state, nothing", !NW.takes(mine, null, false));

    equal("loading", NW.caption({ ready: false, key: "", title: "" }), "Loading notes…");
    equal("no game", NW.caption({ ready: true, key: "", title: "" }), "No game is running");
    equal("the game", NW.caption({ ready: true, key: "a", title: "Metroid Prime" }), "Metroid Prime");
})();