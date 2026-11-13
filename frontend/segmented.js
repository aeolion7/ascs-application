"use strict";
// The sliding marker (2.2.0). Every segmented control (section tabs, the
// calendar's views, the keymap's layers) draws one marker behind its chosen
// button, and the marker slides when the choice changes. A control is watched
// for that change and for its size (text size, window width); a hidden one
// waits until it shows. A control made later keeps its plain filled choice.

(() => {
    const GROUPS = '[role="tablist"], .cal-modes, .keymap-layers';
    const CHOSEN = '[aria-selected="true"], [aria-pressed="true"]';

    const place = group => {
        const chosen = group.querySelector(CHOSEN);
        if (!chosen || !chosen.offsetWidth || chosen.offsetParent !== group) {
            group.classList.remove("has-marker", "marker-moves");
            return;
        }
        group.style.setProperty("--marker-x", `${chosen.offsetLeft}px`);
        group.style.setProperty("--marker-y", `${chosen.offsetTop}px`);
        group.style.setProperty("--marker-w", `${chosen.offsetWidth}px`);
        group.style.setProperty("--marker-h", `${chosen.offsetHeight}px`);
        if (!group.classList.contains("has-marker")) {
            // Placed first without a slide, so it never sweeps in from the left.
            group.classList.add("has-marker");
            requestAnimationFrame(() => requestAnimationFrame(() => group.classList.add("marker-moves")));
        }
    };

    const resized = new ResizeObserver(entries => entries.forEach(entry => place(entry.target)));
    const changed = new MutationObserver(records => {
        new Set(records.map(record => record.target.closest(GROUPS))).forEach(group => group && place(group));
    });

    document.querySelectorAll(GROUPS).forEach(group => {
        resized.observe(group);
        changed.observe(group, { subtree: true, attributes: true, attributeFilter: ["aria-selected", "aria-pressed"] });
        place(group);
    });
})();
