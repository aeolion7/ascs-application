"use strict";
// Arrow keys between controls (2.0.0): picks the nearest control in the arrow's
// direction by where things are on screen, so it keeps working as pages change.

globalThis.MaestroKeyNav = (() => {
    const CROSS_WEIGHT = 3;     // being off to the side counts against a control more than distance

    // How far ahead a box is, and how far off to the side, or null if it isn't ahead.
    function measure(from, to, key) {
        const fromX = (from.left + from.right) / 2;
        const fromY = (from.top + from.bottom) / 2;
        const gap = (lowA, highA, lowB, highB) => Math.max(0, lowB - highA, lowA - highB);
        switch (key) {
            case "ArrowRight":
                return to.left > fromX ? { ahead: Math.max(0, to.left - from.right), side: gap(from.top, from.bottom, to.top, to.bottom) } : null;
            case "ArrowLeft":
                return to.right < fromX ? { ahead: Math.max(0, from.left - to.right), side: gap(from.top, from.bottom, to.top, to.bottom) } : null;
            case "ArrowDown":
                return to.top > fromY ? { ahead: Math.max(0, to.top - from.bottom), side: gap(from.left, from.right, to.left, to.right) } : null;
            case "ArrowUp":
                return to.bottom < fromY ? { ahead: Math.max(0, from.top - to.bottom), side: gap(from.left, from.right, to.left, to.right) } : null;
            default:
                return null;
        }
    }

    // candidates: [{ rect, node }]. Returns the chosen node, or null.
    function pick(from, candidates, key) {
        let best = null;
        let bestScore = Infinity;
        for (const candidate of candidates) {
            const distance = measure(from, candidate.rect, key);
            if (!distance) continue;
            const score = distance.ahead + distance.side * CROSS_WEIGHT;
            if (score < bestScore) {
                bestScore = score;
                best = candidate.node;
            }
        }
        return best;
    }

    return Object.freeze({ pick });
})();
