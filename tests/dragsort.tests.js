"use strict";

(function () {
    const D = globalThis.MaestroDragSort;
    const { equal } = globalThis.TestHarness;

    equal("reorder: later", D.reorder(["a", "b", "c", "d"], 0, 2).join(""), "bcad");
    equal("reorder: earlier", D.reorder(["a", "b", "c", "d"], 3, 1).join(""), "adbc");
    equal("reorder: same place", D.reorder(["a", "b"], 1, 1).join(""), "ab");
    const original = ["a", "b"];
    D.reorder(original, 0, 1);
    equal("reorder leaves the original alone", original.join(""), "ab");

    const grid = [
        { left: 0, top: 0, width: 100, height: 50 }, { left: 120, top: 0, width: 100, height: 50 },
        { left: 0, top: 70, width: 100, height: 50 }, { left: 120, top: 70, width: 100, height: 50 }
    ];
    equal("nearest: inside a box", D.nearestIndex(grid, 170, 25), 1);
    equal("nearest: the row below", D.nearestIndex(grid, 30, 100), 2);
    equal("nearest: off the grid", D.nearestIndex(grid, 900, 900), 3);
    equal("nearest: nothing to choose", D.nearestIndex([], 0, 0), -1);

    // placeChildren: a new order, without taking out the focused node.
    const list = document.createElement("ol");
    document.body.append(list);
    const [a, b, c] = ["a", "b", "c"].map(name => {
        const node = document.createElement("li");
        node.textContent = name;
        node.append(document.createElement("button"));
        return node;
    });
    list.append(a, b, c);
    const order = () => [...list.children].map(node => node.textContent).join("");
    b.querySelector("button").focus();
    let removed = false;
    const watch = new MutationObserver(records => { removed ||= records.some(record => [...record.removedNodes].includes(b)); });
    watch.observe(list, { childList: true });
    D.placeChildren(list, [b, c, a]);
    watch.takeRecords().forEach(record => { removed ||= [...record.removedNodes].includes(b); });
    watch.disconnect();
    equal("placeChildren: the new order", order(), "bca");
    equal("placeChildren: the focused node never leaves", removed, false);
    equal("placeChildren: and keeps the focus", document.activeElement, b.querySelector("button"));
    const d = document.createElement("li");
    d.textContent = "d";
    D.placeChildren(list, [c, d, b]);
    equal("placeChildren: adds and drops nodes", order(), "cdb");
    b.querySelector("button").blur();
    D.placeChildren(list, [a, b]);
    equal("placeChildren: with nothing focused", order(), "ab");
    list.remove();
})();
