"use strict";
// Motion when the window opens (2.2.0): MAESTRO in the sidebar catches one
// sheen. Nothing here may move or resize the page: a 6 px rise of the content
// was taken out, as it made the page taller than the window while it played,
// so the scrollbar flashed and every module narrowed. The start screen is
// AutoHotkey's own window (ShowStartScreen), not part of the page, because a
// shown WebView first has to redraw the whole page, and anything drawn here
// would wait for that.
//
// For the same reason nothing here starts until the page is drawing again:
// it waits for two animation frames, which only come once drawing has resumed
// (or a second at most, as no frames come while nothing is drawing). The page
// is never made invisible while hidden, so the frame the window keeps is the
// page itself. Reduced motion leaves out the sheen.
//
// Below, what moves as the page is used: pages and sections coming in, the
// sidebar's marker, and numbers counting to a new value.
globalThis.MaestroMotion = (() => {
    const body = document.body;
    let shows = 0;              // so a show cut short by a hide doesn't start late

    const afterFrames = run => {
        let done = false;
        const once = () => { if (!done) { done = true; run(); } };
        requestAnimationFrame(() => requestAnimationFrame(once));
        setTimeout(once, 1000);
    };

    function hidden() {
        shows++;
        body.classList.remove("is-showing");
    }

    function shown() {
        const show = ++shows;
        afterFrames(() => {
            if (show !== shows) return;         // hidden again before it drew
            body.classList.remove("is-showing");
            void body.offsetWidth;              // so the sheen starts over
            body.classList.add("is-showing");
        });
    }

    // ---- What changes moves to its new state (2.2.0, stage 8)
    // Only opacity and transform move, so it runs on the compositor, and only
    // what's on screen moves. Reduced motion changes everything at once.
    const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
    const token = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    const ENTRANCE_MS = Number.parseFloat(token("--dur-entrance", "320ms")) || 320;
    const EASE_OUT = token("--ease-out", "cubic-bezier(.2, .8, .2, 1)");

    // A page or a section comes in from where it sits: a page lower in the
    // sidebar rises 12 px, a higher one settles from above; a section to the
    // right comes from the right. 12 px stays inside the page's own margin, so
    // the window never gains a scrollbar while it moves.
    let pageEnteredAt = -Infinity;
    function enter(node, axis, direction, distance) {
        if (!node || reduced() || document.hidden || !node.offsetParent) return;
        const shift = `${direction * distance}px`;
        node.animate([
            { opacity: 0, transform: axis === "x" ? `translateX(${shift})` : `translateY(${shift})` },
            { opacity: 1, offset: .55 },
            { opacity: 1, transform: "none" }
        ], { duration: ENTRANCE_MS, easing: EASE_OUT });
    }

    function pageEnters(from, to) {
        if (from === to) return;
        const order = [...document.querySelectorAll(".nav[data-view]")].map(button => button.dataset.view);
        const higher = order.indexOf(to) >= 0 && order.indexOf(from) > order.indexOf(to);
        pageEnteredAt = performance.now();
        enter(document.getElementById(to), "y", higher ? -1 : 1, 12);
    }

    // A section opened with its page (from the palette, say) comes in with
    // the page rather than moving twice.
    function sectionEnters(panel, direction) {
        if (performance.now() - pageEnteredAt < 50) return;
        enter(panel, "x", direction, 10);
    }

    // Numbers count to a new value over the 350 ms the bars take to get there.
    // A number with nothing before it ("--%") or out of sight is just written.
    const COUNT_MS = 350;
    const counting = new Map();
    let frame = 0;
    const easeOut = t => 1 - (1 - t) ** 3;
    const valueAt = (run, now) => run.from + (run.to - run.from) * easeOut(Math.min(1, (now - run.start) / COUNT_MS));

    function step(now) {
        frame = 0;
        counting.forEach((run, node) => {
            node.textContent = run.format(valueAt(run, now));
            if (now - run.start >= COUNT_MS) counting.delete(node);
        });
        if (counting.size) frame = requestAnimationFrame(step);
    }

    function count(node, value, format) {
        const target = Number(value);
        const running = counting.get(node);
        const from = running ? valueAt(running, performance.now()) : Number.parseFloat(node.dataset.countValue);
        node.dataset.countValue = String(target);
        if (!Number.isFinite(target) || !Number.isFinite(from) || from === target || reduced() || document.hidden || !node.offsetParent) {
            counting.delete(node);
            node.textContent = format(value);
            return;
        }
        counting.set(node, { from, to: target, start: performance.now(), format });
        if (!frame) frame = requestAnimationFrame(step);
        // No frames come while the window is hidden: land on the value anyway.
        setTimeout(() => {
            if (counting.get(node)?.to !== target) return;
            counting.delete(node);
            node.textContent = format(value);
        }, COUNT_MS + 100);
    }

    // The current page's lift slides along the sidebar to the page chosen,
    // as the tabs' marker does; placed first without a slide, and again when
    // the sidebar folds or the text size changes.
    const sidebar = document.querySelector(".sidebar");
    const marker = document.createElement("span");
    marker.className = "nav-marker";
    marker.setAttribute("aria-hidden", "true");
    sidebar?.append(marker);
    function placeMarker() {
        const current = sidebar?.querySelector(".nav.active[data-view]");
        if (!current || !current.offsetParent) {
            sidebar?.classList.remove("has-nav-marker", "nav-marker-moves");
            return;
        }
        const box = current.getBoundingClientRect();
        const side = sidebar.getBoundingClientRect();
        sidebar.style.setProperty("--nav-marker-x", `${box.left - side.left - sidebar.clientLeft}px`);
        sidebar.style.setProperty("--nav-marker-y", `${box.top - side.top - sidebar.clientTop}px`);
        sidebar.style.setProperty("--nav-marker-w", `${box.width}px`);
        sidebar.style.setProperty("--nav-marker-h", `${box.height}px`);
        if (!sidebar.classList.contains("has-nav-marker")) {
            sidebar.classList.add("has-nav-marker");
            requestAnimationFrame(() => requestAnimationFrame(() => sidebar.classList.add("nav-marker-moves")));
        }
    }
    if (sidebar) {
        const watch = new MutationObserver(placeMarker);
        sidebar.querySelectorAll(".nav[data-view]").forEach(button => watch.observe(button, { attributes: true, attributeFilter: ["class"] }));
        new ResizeObserver(placeMarker).observe(sidebar);
        placeMarker();
    }

    return { hidden, shown, pageEnters, sectionEnters, count };
})();
