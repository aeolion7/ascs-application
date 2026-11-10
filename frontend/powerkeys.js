"use strict";

// Letters for the power tray (2.0.0). While the tray is open, holding a letter
// works like holding its button: it starts the same 1.5-second hold, and letting
// go cancels. A key is only ever a way to hold; the hold, the ticket from ASCS
// and the warnings all still apply.
//
// The safety rule: one key, alone. If a second key goes down, whichever key it
// is, the hold stops and nothing is accepted until every key is up. So a hand
// resting on the keyboard, or something falling on it, can't do anything.
//
// Physical keys (event.code), so Caps Lock and the Shift state don't matter.
globalThis.MaestroPowerKeys = (() => {
    const ACTIONS = { KeyS: "shutdown", KeyZ: "sleep", KeyO: "signout", KeyB: "recycle", KeyR: "restart" };

    function create() {
        const down = new Set();
        let activeCode = "";
        let locked = false;

        function keydown({ code, repeat = false, ctrlKey = false, altKey = false, metaKey = false, shiftKey = false }) {
            const action = ACTIONS[code];
            // A key already held when the tray opened arrives as a repeat, with no
            // first press. It never counts, and neither does a real key's repeat.
            if (repeat) return { handled: Boolean(action) };

            down.add(code);
            if (down.size > 1) {
                const wasActive = Boolean(activeCode);
                activeCode = "";
                locked = true;
                return { handled: Boolean(action), blocked: true, cancel: wasActive };
            }
            if (locked || !action) return { handled: Boolean(action) };
            // With a modifier still held (Ctrl + = opening the tray, for example)
            // this isn't a plain letter.
            if (ctrlKey || altKey || metaKey || shiftKey) return { handled: false };
            activeCode = code;
            return { handled: true, start: action };
        }

        function keyup({ code }) {
            const action = ACTIONS[code];
            const wasKnown = down.delete(code);
            const result = { handled: Boolean(action) };
            if (code === activeCode) {
                activeCode = "";
                result.end = action;
            }
            if (wasKnown && !down.size && locked) {
                locked = false;
                result.unlocked = true;
            }
            return result;
        }

        function reset() {
            down.clear();
            activeCode = "";
            locked = false;
        }

        return { keydown, keyup, reset, isLocked: () => locked };
    }

    return { create, ACTIONS };
})();
