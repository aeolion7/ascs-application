"use strict";

(function () {
    const P = globalThis.MaestroPowerKeys;
    const { check, equal } = globalThis.TestHarness;

    const fresh = () => P.create();
    const press = (keys, code, extra = {}) => keys.keydown({ code, ...extra });
    const lift = (keys, code) => keys.keyup({ code });

    equal("S is shut down", press(fresh(), "KeyS").start, "shutdown");
    equal("Z is sleep", press(fresh(), "KeyZ").start, "sleep");
    equal("O is sign out", press(fresh(), "KeyO").start, "signout");
    equal("B is recycle bin", press(fresh(), "KeyB").start, "recycle");
    equal("R is restart", press(fresh(), "KeyR").start, "restart");
    equal("there are exactly five", Object.keys(P.ACTIONS).length, 5);
    equal("another letter starts nothing", press(fresh(), "KeyL").start, undefined);

    // Letting go ends the hold.
    let keys = fresh();
    press(keys, "KeyS");
    equal("letting go ends the hold", lift(keys, "KeyS").end, "shutdown");
    equal("and a new press works after it", press(keys, "KeyR").start, "restart");

    // Two of the keys: no input.
    keys = fresh();
    press(keys, "KeyS");
    let second = press(keys, "KeyR");
    check("a second key stops the hold", second.cancel === true && second.blocked === true);
    equal("and starts nothing", second.start, undefined);
    check("and locks", keys.isLocked());
    lift(keys, "KeyR");
    equal("one key up isn't enough", press(keys, "KeyZ").start, undefined);
    lift(keys, "KeyZ");
    check("still locked while the first is down", keys.isLocked());
    equal("the first key's release ends nothing more", lift(keys, "KeyS").end, undefined);
    check("all keys up unlocks", !keys.isLocked());
    equal("and the next press works", press(keys, "KeyO").start, "signout");

    // Both at once, in either order.
    keys = fresh();
    press(keys, "KeyB");
    check("B then Z stops", press(keys, "KeyZ").blocked === true);

    // Any second key counts, not only the five.
    keys = fresh();
    press(keys, "KeyS");
    check("an unrelated key stops the hold", press(keys, "KeyJ").cancel === true);
    keys = fresh();
    press(keys, "KeyJ");
    equal("a key already down blocks a letter", press(keys, "KeyS").start, undefined);
    check("and locks", keys.isLocked());

    // Repeats never count, so a key held before the tray opened can't act.
    keys = fresh();
    equal("a repeat with no first press does nothing", press(keys, "KeyS", { repeat: true }).start, undefined);
    check("and isn't tracked as down", !keys.isLocked());
    equal("nor does its release", lift(keys, "KeyS").end, undefined);
    keys = fresh();
    press(keys, "KeyS");
    equal("a real key's repeat doesn't restart it", press(keys, "KeyS", { repeat: true }).start, undefined);
    check("and doesn't count as a second key", !keys.isLocked());

    // Modifiers.
    ["ctrlKey", "altKey", "metaKey", "shiftKey"].forEach(modifier => {
        equal(`${modifier} with a letter does nothing`, press(fresh(), "KeyS", { [modifier]: true }).start, undefined);
    });
    keys = fresh();
    press(keys, "KeyS");
    check("pressing Shift during a hold stops it", press(keys, "ShiftLeft").cancel === true);

    // Closing the tray or leaving the window clears everything.
    keys = fresh();
    press(keys, "KeyS");
    press(keys, "KeyR");
    keys.reset();
    check("reset unlocks", !keys.isLocked());
    equal("a press works after reset", press(keys, "KeyR").start, "restart");
    keys.reset();
    equal("a hold doesn't survive a reset", lift(keys, "KeyR").end, undefined);
})();
