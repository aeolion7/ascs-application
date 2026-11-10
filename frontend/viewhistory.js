"use strict";
// Back and forward through the pages (2.0.0), as a browser does: going to a new
// page after going back drops the pages ahead.

globalThis.MaestroViewHistory = (() => {
    function create(limit = 50) {
        let items = [];
        let at = -1;

        return {
            visit(view) {
                if (items[at] === view) return;
                items = items.slice(0, at + 1);
                items.push(view);
                if (items.length > limit) items.shift();
                at = items.length - 1;
            },
            back() {
                if (at <= 0) return null;
                at--;
                return items[at];
            },
            forward() {
                if (at >= items.length - 1) return null;
                at++;
                return items[at];
            }
        };
    }

    return Object.freeze({ create });
})();
