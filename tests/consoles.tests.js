"use strict";

// The console hub (2.9.0).
(function () {
    const C = globalThis.MaestroConsoles;
    const { check, equal } = globalThis.TestHarness;
    const state = {
        sender: true, rcm: true, pushing: false, selected: 2, autoPush: true, folder: "J:\\brew",
        payloads: [
            { name: "Lockpick_RCM.bin", folder: "C:\\Users\\me\\Downloads", size: 90000, time: "20250101120000", version: "" },
            { name: "hekate_ctcaer_6.5.1.bin", folder: "J:\\brew", size: 126207, time: "20261108093000", version: "6.5.1" }
        ],
        cards: [{ drive: "E", kind: "switch", label: "SWITCH", free: 12595, total: 60928, copied: 1, versions: [{ name: "hekate", version: "6.5.1" }, { name: "Atmosphère", version: "" }] }],
        updated: { switch: "2026-11-08", "3ds": "", wiiu: "junk" },
        album: { running: true, done: 3, total: 40, drive: "E" }, albumFolder: "C:\\Users\\me\\Pictures\\Switch"
    };
    const clean = C.clean(state);
    equal("payloads, the chosen one and pushing as it's plugged in", `${clean.payloads.length} ${clean.selected} ${clean.autoPush}`, "2 2 true");
    equal("a payload's line", C.payloadDetail(clean.payloads[1]), "hekate 6.5.1 · 123 KB · Nov 8, 2026");
    equal("without a version", C.payloadDetail(clean.payloads[0]), "88 KB · Jan 1, 2025");
    equal("a card", `${C.kindName(clean.cards[0].kind)} ${clean.cards[0].drive} ${C.versionsText(clean.cards[0].versions)}`, "Nintendo Switch E hekate 6.5.1 · Atmosphère");
    const space = C.cardSpace(clean.cards[0]);
    equal("its space", space.text, "12.3 GB free of 59.5 GB");
    check("and how full", Math.abs(space.used - 79.3) < 0.1);
    equal("dates kept, junk dropped", JSON.stringify(clean.updated), JSON.stringify({ switch: "2026-11-08", "3ds": "", wiiu: "" }));
    equal("the album's progress", C.albumText(clean.album), "Copying the album: 3 of 40");
    equal("RCM connected", C.rcmText(clean), "Switch in RCM mode: connected");
    equal("sending", C.rcmText({ ...clean, pushing: true }), "Sending…");
    equal("not connected", C.rcmText({ ...clean, rcm: false }), "No Switch in RCM mode");
    equal("no sender", C.rcmText({ ...clean, sender: false }), "TegraRcmGUI isn't installed");

    const junk = C.clean({ selected: 9, autoPush: true, payloads: [{ name: "", size: 5 }, { name: "x.bin", version: "6.5", time: "soon", size: -1 }], cards: [{ drive: "e", kind: "switch" }, { drive: "F", kind: "ps5" }], album: { running: "yes" } });
    equal("junk: no chosen payload, so nothing pushes by itself", `${junk.selected} ${junk.autoPush}`, "0 false");
    equal("junk: a nameless payload is dropped, a bad version and time are blank", JSON.stringify(junk.payloads), JSON.stringify([{ name: "x.bin", folder: "", size: 0, time: "", version: "" }]));
    equal("junk: cards need a drive letter and a known console", junk.cards.length, 0);
    equal("junk: no album running", junk.album.running, false);
    equal("nothing at all is safe", C.clean(null).payloads.length, 0);

    equal("sizes", `${C.sizeText(500)} ${C.sizeText(2 * 1024 * 1024)}`, "1 KB 2.0 MB");
    equal("bytes from base64", Array.from(C.bytesOf("AAEC")).join(), "0,1,2");
    equal("not base64", C.bytesOf("%%%"), null);
    equal("hex", C.hex(new Uint8Array([0, 15, 255]).buffer), "000fff");
    equal("three consoles, each with its release pages", C.KINDS.map(kind => `${kind.id}:${kind.links.length}`).join(), "switch:2,3ds:1,wiiu:1");
})();