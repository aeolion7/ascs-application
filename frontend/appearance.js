"use strict";
// Appearance settings (2.0.0): text size and when the logo's arm swings. Pure
// rules, so they can be tested; app.js keeps the choices on this PC and applies
// them at once.

globalThis.MaestroAppearance = (() => {
    const TEXT_SIZES = Object.freeze([100, 110, 120]);
    const SWING_MODES = Object.freeze(["first", "every", "never"]);

    const textSize = value => TEXT_SIZES.includes(Number(value)) ? Number(value) : 100;
    const swingMode = value => SWING_MODES.includes(value) ? value : "first";

    // "first" means the first time the window opens after Maestro starts.
    const shouldSwing = (mode, alreadySwung) =>
        mode === "every" || (mode === "first" && !alreadySwung);

    return Object.freeze({ TEXT_SIZES, SWING_MODES, textSize, swingMode, shouldSwing });
})();
