"use strict";

// The icon set (2.2.0): one grid, two sizes, and nothing drawn outside it.
(function () {
    const I = MaestroIcons;   // a top-level const in icons.js, so not on globalThis
    const { check, equal } = globalThis.TestHarness;

    equal("names are unique", new Set(I.names).size, I.names.length);
    check("the set has the pages' icons", ["home", "notes", "calendar", "workspaces", "games", "system", "sounds", "commands", "settings"].every(I.has));
    check("has: an unknown name", !I.has("nothing") && !I.has("toString"));

    const small = I.markup("close");
    check("markup: 20 px by default", small.includes('class="icon"') && small.includes('viewBox="0 0 24 24"') && small.includes('aria-hidden="true"'));
    check("markup: 24 px", I.markup("close", 24).includes('class="icon icon-24"'));
    let threw = false;
    try { I.markup("nothing"); } catch { threw = true; }
    check("markup: an unknown name throws", threw);

    const made = I.create("pin");
    check("create: an svg element", made instanceof SVGSVGElement && made.classList.contains("icon"));

    // Every drawing stays inside the grid's live area, 3.5 to 20.5 (with room
    // for a round cap), measured as the browser lays it out.
    const holder = document.createElement("div");
    document.body.append(holder);
    const outside = I.names.filter(name => {
        const svg = I.create(name, 24);
        holder.append(svg);
        const box = svg.getBBox();
        return box.width === 0 || box.x < 3 || box.y < 3 || box.x + box.width > 21 || box.y + box.height > 21;
    });
    equal("every icon is drawn inside the grid", outside.join(", "), "");

    // fill: the page's own <svg data-icon> placeholders.
    holder.innerHTML = '<svg data-icon="search"></svg><svg data-icon="lock" data-size="24"></svg>';
    I.fill(holder);
    const [search, lock] = holder.querySelectorAll("svg");
    check("fill: draws the icon", search.classList.contains("icon") && search.childElementCount > 0 && search.getAttribute("viewBox") === "0 0 24 24");
    check("fill: 24 px when asked", lock.classList.contains("icon-24") && !search.classList.contains("icon-24"));
    holder.innerHTML = '<svg data-icon="nothing"></svg>';
    threw = false;
    try { I.fill(holder); } catch { threw = true; }
    check("fill: an unknown name throws", threw);
    holder.remove();
})();
