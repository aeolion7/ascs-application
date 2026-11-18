"use strict";
// The Podium (2.0.0): modules you can glance at or act on, each opening
// its page. It reads the state the other pages keep, and asks for nothing new
// beyond what they already ask for. RetroAchievements is never requested from
// here: progress shows once the Games page has loaded it.

let homeTimer = null;

function startHomePolling() {
    stopHomePolling();
    if (!notesLoaded) send("GetNotes");
    if (!gamesState.loaded) send("GetGames");
    send("GetWorkspaces");
    send("GetGamesLive");
    globalThis.startHomeExtras?.();
    homeTimer = setInterval(() => {
        if (!$("home").classList.contains("active")) stopHomePolling();
        else if (!windowIsHidden) send("GetGamesLive");
    }, 3000);
}

function stopHomePolling() {
    if (homeTimer !== null) clearInterval(homeTimer);
    homeTimer = null;
    globalThis.stopHomeExtras?.();
}

function homeButton(label, className, run) {
    const button = element("button", className, label);
    button.type = "button";
    button.addEventListener("click", run);
    return button;
}

// ---- Now playing

function homeGameActions(lead, game, title, progress) {
    const actions = element("div", "home-now-actions");
    const key = title ? Games.gameNoteKey(title) : "";
    if (key) {
        actions.append(homeButton("Add note", "primary", () => openCurrentGameNotes()));
        actions.append(homeButton("Add timestamp", "secondary", () => {
            addGameNoteStamp(key, title, () => showNotice("Timestamp added to this game's notes."));
        }));
    }
    if (progress?.possible) {
        actions.append(homeButton("Achievements", "secondary", () => {
            navigate("games");
            showGameAchievements(progress);
        }));
    }
    if (game && lead.emulator !== "pso") {
        const show = homeButton(lead.emulator === "steam" ? "Open folder" : "Show file", "secondary", () => send("ShowGameFile", game.id));
        show.classList.add("home-now-end");
        actions.append(show);
    }
    return actions;
}

function showGameAchievements(progress) {
    if (progress.id) openRaGame(progress.id);
    else gamesSections.show("achievements");
}

function gamesNowActions(lead, game, title, progress) {
    const actions = element("div", "home-now-actions");
    if (progress?.possible) actions.append(homeButton("Achievements", "secondary", () => showGameAchievements(progress)));
    if (game && lead.emulator !== "pso") {
        const show = homeButton(lead.emulator === "steam" ? "Open folder" : "Show file", "secondary", () => send("ShowGameFile", game.id));
        show.classList.add("home-now-end");
        actions.append(show);
    }
    return actions;
}

// The game running with its clocks, or the last game played. The same module on
// Home and Games: Games adds the sessions count and what the game itself reports.
function drawNowPlaying(panel, view, { headingId, open, actions, detailed = false }) {
    if (!panel || !Games) return;
    const playing = gamesState.playing || [];
    const lead = playing[0];
    const game = lead ? Games.matchPlayingGame(gamesState.items, lead) : null;
    const name = lead ? (lead.emulator === "steam" || lead.emulator === "pso" ? lead.title : Games.gameFromWindowTitle(lead.emulator, lead.title)) : "";
    const last = lead ? null : Games.sortGames(gamesState.items.filter(item => item.last && item.installed !== false), "recent")[0] ?? null;
    const shown = game || last;
    const progress = game ? raProgressFor(game) : null;

    const tall = view === "home" && tallness("now") > 1;
    const signature = JSON.stringify([playing, game?.id, game?.seconds, last?.id, shown ? gamesState.covers.has(shown.id) : false, progress?.achieved, progress?.possible, gamesState.loaded, detailed ? gamesState.ra.updatedAt : 0,
        tall, tall && progress?.id ? gamesState.ra.games.has(progress.id) : false]);
    if (panel.dataset.signature === signature) return;
    panel.dataset.signature = signature;
    if (shown && $(view).classList.contains("active")) requestCovers([shown]);

    const copy = element("div", "home-now-copy");
    const head = element("div", "module-head");
    const heading = element("h2", "", lead ? "Now Playing" : last ? "Last Played" : "Now Playing");
    heading.id = headingId;
    head.append(heading);
    // The heading opens its page (2.2.0), in place of an Open button.
    if (open) {
        const link = element("button", "module-link", heading.textContent);
        link.type = "button";
        link.title = "Open Games";
        link.addEventListener("click", open);
        heading.replaceChildren(link);
    }
    copy.append(head);

    panel.classList.toggle("is-playing", Boolean(lead));
    panel.replaceChildren();
    // While a game runs, its cover is a soft backdrop behind the module.
    const backdropCover = lead && shown ? gamesState.covers.get(shown.id) : "";
    if (backdropCover) {
        const backdrop = element("div", "now-backdrop");
        const image = element("img");
        image.src = backdropCover;
        image.alt = "";
        backdrop.append(image);
        panel.append(backdrop);
    }
    if (shown) panel.append(gameCover(shown, "game-cover-home"));
    panel.append(copy);

    if (!lead && !last && !gamesState.loaded) {
        panel.prepend(nowCoverPlaceholder());
        copy.append(placeholder("now"));
        return;
    }
    if (!lead && !last) {
        copy.append(element("p", "module-empty", "No game is running."));
        return;
    }

    if (!lead) {
        copy.append(element("strong", "home-now-name", Games.displayTitle(last.title)),
            element("p", "home-now-meta", [gameMeta(last, ["emulator", "last"]), last.seconds ? `${Games.formatDuration(last.seconds)} in all` : ""].filter(Boolean).join(" · ")));
        const buttons = element("div", "home-now-actions");
        if (last.launchable) buttons.append(playButton(last, "primary"));
        copy.append(buttons);
        return;
    }

    // Other games running share the meta line (2.2.0), so Now Playing keeps
    // its square in the shorter window.
    const others = playing.slice(1).map(item => Games.displayTitle(Games.playingTitle(gamesState.items, item) || Games.EMULATORS[item.emulator] || item.emulator));
    const meta = element("p", "home-now-meta", [Games.EMULATORS[lead.emulator] || lead.emulator, game ? Games.systemName(game.system) : "",
        others.length ? `Also running: ${others.join(", ")}` : ""].filter(Boolean).join(" · "));
    meta.title = meta.textContent;
    copy.append(element("strong", "home-now-name", name ? Games.displayTitle(name) : "At the menu"), meta);

    const stats = element("div", "home-now-stats");
    if (name) {
        const session = element("span");
        const clock = element("strong", "now-session is-live");
        clock.dataset.since = String(lead.since || "");
        session.append(element("small", "", "This session"), clock);
        stats.append(session);
    }
    if (game?.seconds) {
        const total = element("span");
        total.append(element("small", "", "All time"), element("strong", "", Games.formatDuration(game.seconds)));
        stats.append(total);
    }
    if (detailed && game?.plays) {
        const sessions = element("span");
        sessions.append(element("small", "", "Sessions"), element("strong", "", String(game.plays)));
        stats.append(sessions);
    }
    copy.append(stats);

    if (progress?.possible) {
        const bar = element("div", "home-now-progress");
        const track = element("span", `home-bar${progress.mastered ? " is-mastered" : ""}`);
        const fill = element("b");
        fill.style.width = `${progress.percent}%`;
        track.append(fill);
        bar.append(track, element("small", "", progress.mastered ? "Mastered" : `${progress.achieved} of ${progress.possible} achievements`));
        copy.append(bar);
    }

    if (detailed && game) {
        const data = Games.parseRetroAchievements(gamesState.ra.summary, gamesState.ra.recent);
        if (data.presence && Games.titleKey(data.lastGame) === Games.titleKey(game.title)) {
            const presence = element("p", "home-now-presence", data.presence);
            presence.title = "From the game's rich presence, as of the last RetroAchievements refresh";
            copy.append(presence);
        }
    }

    copy.append(actions(lead, game, Games.playingTitle(gamesState.items, lead) || name, progress));
    if (tall) copy.append(...nowPlayingMore(game, name, progress));
    tickNowPlaying();
}

// Now Playing two squares tall (2.9.0): the game's next achievement, when
// Games has already loaded the game's list (the Podium asks RetroAchievements
// for nothing), and the game's notes, to write in while playing.
function nowPlayingMore(game, name, progress) {
    const parts = [];
    const raw = progress?.id ? gamesState.ra.games.get(progress.id) : null;
    const next = raw ? Games.nextUp(Games.parseRaGame(raw)) : null;
    if (next) {
        const target = element("div", "home-now-next");
        const body = element("div", "ra-item-body");
        const line = element("div", "ra-unlock-head");
        line.append(element("small", "home-now-next-label", "Next up"), element("strong", "", next.achievement.title), element("span", "ra-points", `${next.achievement.points}`));
        body.append(line);
        if (next.achievement.description) body.append(element("p", "", next.achievement.description));
        target.append(raImage(next.achievement.badge, "ra-badge is-locked"), body);
        parts.push(target);
        requestRaImages([next.achievement.badge]);
    }
    const notes = gameNotesBox("home", game?.title || name);
    if (notes) parts.push(notes);
    return parts;
}

// The cover's place while the games are on their way: the cover's own size.
function nowCoverPlaceholder() {
    const cover = placeholder("tile");
    cover.replaceChildren();
    cover.classList.add("game-cover", "game-cover-home");
    return cover;
}

function renderHomeNow() {
    drawNowPlaying($("homeNow"), "home", {
        headingId: "homeNowTitle",
        open: () => navigate("games"),
        actions: homeGameActions
    });
}

function renderGamesNow() {
    drawNowPlaying($("gamesNow"), "games", { headingId: "gamesNowTitle", actions: gamesNowActions, detailed: true });
}

// ---- Continue playing

function renderHomeContinue() {
    const shelf = $("homeContinue");
    if (!shelf || !Games) return;
    const recent = recentGames().slice(0, 9 * tallness("continue"));
    shelf.replaceChildren(...recent.map(gameTile));
    if (!recent.length && !gamesState.loaded) shelf.append(...Array.from({ length: 9 }, () => placeholder("tile")));
    else if (!recent.length) shelf.append(element("p", "module-empty", "Games you play appear here."));
    if ($("home").classList.contains("active")) requestCovers(recent);
}

// ---- System

function homeCapacity(used, total) {
    const usedValue = Number(used);
    const totalValue = Number(total);
    if (!Number.isFinite(usedValue) || !Number.isFinite(totalValue) || totalValue <= 0) return "";
    const large = totalValue >= 1024;
    const show = value => large ? (value / 1024).toFixed(1) : String(Math.round(value));
    return `${show(usedValue)} of ${show(totalValue)} ${large ? "TB" : "GB"}`;
}

function setHomeValue(value, percent) {
    countTo(value, percent, formatMetric);
    value.classList.toggle("is-high", Number(percent) >= 90);
}

function renderHomeDrives(drives) {
    drawDriveRows($("homeDrives"), drives);
}

// Also on the System page.
function drawDriveRows(list, drives) {
    list.replaceChildren(...drives.map(drive => {
        const row = element("div", "sys-row");
        const line = element("div", "sys-line");
        const name = `Drive ${String(drive.letter).replace(":", "")}`;
        const value = element("strong", "sys-value");
        const track = element("div", "metric-track");
        track.setAttribute("aria-hidden", "true");
        const bar = element("span");
        track.append(bar);
        if (drive.online) {
            line.append(element("span", "sys-name", name), element("small", "sys-note", homeCapacity(drive.used, drive.total)), value);
            setHomeValue(value, drive.usage);
            setProgressBar(bar, drive.usage);
        } else {
            value.textContent = "Offline";
            value.classList.add("is-offline");
            line.append(element("span", "sys-name", name), element("small", "sys-note"), value);
        }
        row.append(line, track);
        return row;
    }));
}

// ---- Workspaces

function renderHomeWorkspaces() {
    const list = $("homeWorkspaces");
    if (!list) return;
    list.replaceChildren(...savedWorkspaces.slice(0, 6).map(workspace => {
        const button = homeButton(workspace.name, "secondary", () => send("RestoreWorkspace", workspace.name));
        button.title = `Restore: ${workspace.windows} window${workspace.windows === 1 ? "" : "s"}`;
        return button;
    }));
    // Until the first list arrives, it's on its way rather than empty.
    if (savedWorkspaces.length) return;
    if (wsView.loaded) return list.append(element("p", "module-empty", "No arrangements saved yet."));
    const waiting = placeholder("pills", 2);
    waiting.classList.add("is-across");
    list.append(waiting);
}

// ---- Quick note

function renderHomeNotes() {
    const list = $("homeNotes");
    if (!list) return;
    const recent = [...notesData.notes].sort((left, right) => right.updated.localeCompare(left.updated)).slice(0, homeRoom("note", 2, 9));
    list.replaceChildren(...recent.map(note => {
        const item = element("li");
        const button = homeButton("", "module-row", () => openNote(note.id));
        button.append(element("span", "module-row-name", noteLabel(note)),
            element("small", "module-row-when", new Date(note.updated).toLocaleDateString([], { month: "short", day: "numeric" })));
        item.append(button);
        return item;
    }));
}

$("homeNoteInput").addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    const text = $("homeNoteInput").value.trim();
    if (!text) return;
    if (!notesLoaded) {
        send("GetNotes");
        showNotice("Notes are still loading. Try again in a moment.");
        return;
    }
    notesData.notes.push(makeNote(text, text.split("\n")[0].slice(0, 60), "note"));
    $("homeNoteInput").value = "";
    renderNotesList();
    saveNotesNow();
    renderHomeNotes();
    showNotice("Saved to Quick Notes.");
});

$("homeNewEvent").addEventListener("click", () => newEventFromShortcut());

// ---- Arrange (2.0.0): on the page itself
// Arrange turns the modules into tiles to drag into place, size (2.9.0: wide
// and tall, by a picker or the corner), or hide; the dock holds the hidden
// ones, Reset and Done. The keyboard does all of it from each tile's grip.

// The layout in use is also kept under its old key, which a version before
// 2.9.0 reads; the saved layouts (2.9.0) are kept beside it.
const HOME_LAYOUT_KEY = "maestro.homeLayout";
const HOME_LAYOUTS_KEY = "maestro.homeLayouts";
let homeSaved = MaestroHomeLayout.parseSaved(null);
try { homeSaved = MaestroHomeLayout.parseSaved(localStorage.getItem(HOME_LAYOUTS_KEY), localStorage.getItem(HOME_LAYOUT_KEY)); } catch { /* the default */ }
let homeLayout = MaestroHomeLayout.activeLayout(homeSaved);
let homeGameSession = null;
let arranging = false;
let arrangeDrag = null;

const homeModules = () => [...document.querySelectorAll("#homeFace > [data-module]")];
const homeModule = id => document.querySelector(`#homeFace > [data-module="${id}"]`);
const moduleLabel = id => MaestroHomeLayout.MODULES.find(module => module.id === id)?.label ?? id;
const arrangeMotion = () => !matchMedia("(prefers-reduced-motion: reduce)").matches;
// A module's height (2.9.0), never more than it can use.
const moduleHeightIn = (layout, id) => Math.min(layout.heights?.[id] ?? 1, MaestroHomeLayout.tallest(id));
const moduleHeight = id => moduleHeightIn(homeLayout, id);

// What a taller module shows (2.9.0): heights apply where the page is three
// squares by three. A list has room for `one` rows in one square and
// `perSquare` more in each square below.
const HEIGHTS_APPLY = matchMedia("(min-width: 1701px)");
const tallness = id => (HEIGHTS_APPLY.matches ? moduleHeight(id) : 1);
const homeRoom = (id, one, perSquare) => one + perSquare * (tallness(id) - 1);

// The modules whose content follows their height, redrawn when it changes.
function renderHomeRooms() {
    renderHomeNotes();
    renderHomeContinue();
    renderHomeNow();
    globalThis.renderHomePinned?.();
    globalThis.renderHomeUnlocks?.();
    globalThis.renderHomeToday?.();
    globalThis.renderHomeStats?.();
    globalThis.renderAlmanacMore?.();
}
HEIGHTS_APPLY.addEventListener("change", renderHomeRooms);
const sizeText = id => {
    const width = homeLayout.widths[id];
    const height = moduleHeight(id);
    return `${width} square${width === 1 ? "" : "s"} wide${height > 1 ? `, ${height} tall` : ""}`;
};

function applyHomeLayout() {
    homeModules().forEach(module => {
        const id = module.dataset.module;
        module.style.order = String(homeLayout.order.indexOf(id));
        module.hidden = homeLayout.hidden.includes(id);
        module.dataset.width = String(homeLayout.widths[id]);
        module.dataset.height = String(moduleHeight(id));
    });
    const heights = homeModules().map(module => module.dataset.height).join();
    if (heights !== applyHomeLayout.heights) {
        applyHomeLayout.heights = heights;
        renderHomeRooms();
    }
    if (arranging) renderArrangeChrome();
    globalThis.askHomeExtras?.(true);
    globalThis.syncMetronomeView?.();
}

function keepHomeLayout() {
    homeSaved = MaestroHomeLayout.storeActive(homeSaved, homeLayout);
    keepHomeSaved();
}

function keepHomeSaved() {
    try {
        localStorage.setItem(HOME_LAYOUT_KEY, JSON.stringify(homeLayout));
        localStorage.setItem(HOME_LAYOUTS_KEY, JSON.stringify(homeSaved));
    } catch { /* not kept */ }
}

function changeHomeLayout(layout, refocus = "") {
    homeLayout = layout;
    keepHomeLayout();
    applyHomeLayout();
    if (refocus) document.querySelector(refocus)?.focus();
}

function arrangeFitText() {
    const fit = MaestroHomeLayout.fit(homeLayout);
    if (!fit.fits) return `This needs ${fit.rows} rows, so the page scrolls to the last.`;
    return fit.empty ? `This fits the window, with ${fit.empty} empty square${fit.empty === 1 ? "" : "s"}.` : "This fills the window.";
}

function announceArrange(id, note = "") {
    const shown = homeLayout.order.filter(other => !homeLayout.hidden.includes(other));
    $("arrangeLive").textContent = note || `${moduleLabel(id)}: place ${shown.indexOf(id) + 1} of ${shown.length}, ${sizeText(id)}. ${arrangeFitText()}`;
}

// A module's tile while arranging: its bar (grip, name, Hide), its size, and a
// handle at its corner. Built once, and put back if the module redraws.
function arrangeOverlay(module) {
    const existing = module.querySelector(":scope > .arrange-overlay");
    if (existing) return existing;
    const id = module.dataset.module;
    const label = moduleLabel(id);
    const overlay = element("div", "arrange-overlay");
    const bar = element("div", "arrange-bar");
    const grip = element("button", "arrange-grip");
    grip.type = "button";
    grip.dataset.arrange = `${id}-grip`;
    grip.append(MaestroIcons.create("grip"));
    grip.setAttribute("aria-label", `Move ${label}`);
    grip.setAttribute("aria-describedby", "arrangeKeys");
    grip.addEventListener("keydown", event => arrangeKey(event, id));
    const hide = element("button", "arrange-hide", "Hide");
    hide.type = "button";
    hide.dataset.arrange = `${id}-hide`;
    hide.setAttribute("aria-label", `Hide ${label}`);
    hide.tabIndex = -1;     // the mouse's; from the keyboard, Delete on the grip
    hide.dataset.pointerOnly = "";
    hide.addEventListener("click", () => hideModule(id));
    bar.append(grip, element("strong", "arrange-name", label), hide);
    // 2.9.0: one picker for the size, three squares by three: the square
    // clicked is the module's far corner. Rows past what it can use are off.
    const sizes = element("div", "arrange-size");
    sizes.setAttribute("role", "group");
    sizes.setAttribute("aria-label", `${label}: size in squares`);
    for (let height = 1; height <= MaestroHomeLayout.ROWS; height++) {
        for (let width = 1; width <= MaestroHomeLayout.COLUMNS; width++) {
            const button = element("button");
            button.type = "button";
            button.dataset.arrange = `${id}-size-${width}x${height}`;
            button.dataset.w = String(width);
            button.dataset.h = String(height);
            button.title = `${width} wide, ${height} tall`;
            button.disabled = height > MaestroHomeLayout.tallest(id);
            button.tabIndex = -1;       // the mouse's; from the keyboard, the numbers on the grip
            button.dataset.pointerOnly = "";
            button.addEventListener("click", () => {
                moveWithMotion(() => changeHomeLayout(MaestroHomeLayout.setHeight(MaestroHomeLayout.setWidth(homeLayout, id, width), id, height), `[data-arrange="${id}-size-${width}x${height}"]`), null);
                announceArrange(id);
            });
            sizes.append(button);
        }
    }
    sizes.append(element("b", "arrange-size-label"));
    const resize = element("span", "arrange-resize");
    resize.title = MaestroHomeLayout.tallest(id) > 1 ? "Drag to change the size" : "Drag to change the width";
    resize.setAttribute("aria-hidden", "true");
    resize.addEventListener("pointerdown", event => startResize(event, id));
    overlay.append(bar, sizes, resize);
    overlay.addEventListener("pointerdown", event => startMove(event, id));
    module.append(overlay);
    return overlay;
}

// The module's own controls are out of reach while it's a tile.
function renderArrangeChrome() {
    homeModules().forEach(module => {
        const overlay = arrangeOverlay(module);
        overlay.hidden = !arranging;
        [...module.children].forEach(child => { if (child !== overlay) child.inert = arranging; });
        const id = module.dataset.module;
        const width = homeLayout.widths[id];
        const height = moduleHeight(id);
        overlay.querySelectorAll(".arrange-size button").forEach(button => {
            const w = Number(button.dataset.w), h = Number(button.dataset.h);
            button.setAttribute("aria-pressed", String(w === width && h === height));
            button.classList.toggle("is-covered", w <= width && h <= height);
        });
        overlay.querySelector(".arrange-size-label").textContent = `${width} × ${height}`;
    });
    $("arrangeFit").textContent = arrangeFitText();
    const hidden = homeLayout.order.filter(id => homeLayout.hidden.includes(id));
    $("arrangeTray").replaceChildren(...hidden.map(id => {
        const button = element("button", "arrange-add", `+ ${moduleLabel(id)}`);
        button.type = "button";
        button.dataset.arrange = `${id}-show`;
        button.setAttribute("aria-label", `Show ${moduleLabel(id)}`);
        button.addEventListener("click", () => {
            changeHomeLayout(MaestroHomeLayout.setShown(homeLayout, id, true), `[data-arrange="${id}-grip"]`);
            announceArrange(id);
        });
        return button;
    }));
    $("arrangeTray").hidden = !hidden.length;
    $("arrangeTrayEmpty").hidden = hidden.length > 0;
}

const arrangeObserver = new MutationObserver(() => { if (arranging) renderArrangeChrome(); });

// The dock takes the sidebar's place while arranging, so it covers no module and
// keeps one shape. A collapsed sidebar is too narrow for it: it opens for the
// while, and closes again after (the choice itself isn't changed).
let arrangeOpenedSidebar = false;

function setArranging(on) {
    if (on === arranging) return;
    if (!on && arrangeDrag) endArrangeDrag(true);
    arranging = on;
    if (on) {
        arrangeOpenedSidebar = document.body.classList.contains("sidebar-collapsed");
        if (arrangeOpenedSidebar) applySidebar(false);
    } else if (arrangeOpenedSidebar) {
        arrangeOpenedSidebar = false;
        applySidebar(true);
    }
    document.querySelector(".sidebar").inert = on;
    document.body.classList.toggle("is-arranging-home", on);
    $("home").classList.toggle("is-arranging", on);
    $("arrangeButton").textContent = on ? "Done" : "Arrange";
    $("arrangeButton").setAttribute("aria-pressed", String(on));
    $("arrangeDock").hidden = !on;
    closeHomeLayoutMenu();
    renderHomeLayoutChip();
    renderArrangeChrome();
    if (on) {
        homeModules().forEach(module => arrangeObserver.observe(module, { childList: true }));
        const first = homeLayout.order.find(id => !homeLayout.hidden.includes(id));
        document.querySelector(`[data-arrange="${first}-grip"]`)?.focus();
    } else {
        arrangeObserver.disconnect();
        if ($("home").classList.contains("active")) $("arrangeButton").focus();
    }
}

function hideModule(id) {
    const shown = homeLayout.order.filter(other => !homeLayout.hidden.includes(other));
    const next = shown[shown.indexOf(id) + 1] ?? shown[shown.indexOf(id) - 1];
    moveWithMotion(() => changeHomeLayout(MaestroHomeLayout.setShown(homeLayout, id, false)), null);
    (next ? document.querySelector(`[data-arrange="${next}-grip"]`) : $("arrangeDone"))?.focus();
    announceArrange(id, `${moduleLabel(id)} hidden; it's in the dock to show again. ${arrangeFitText()}`);
}

// The grips are the only Tab stops while arranging. The arrow keys move a
// module among those showing; 1 to 3 set its width (so do Shift with Left and
// Right) and, with Shift, its height (so do Shift with Up and Down; 2.9.0);
// Delete hides it.
function arrangeKey(event, id) {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        hideModule(id);
        return;
    }
    const width = Number(event.key);
    if (!event.shiftKey && Number.isInteger(width) && width >= 1 && width <= MaestroHomeLayout.COLUMNS) {
        event.preventDefault();
        if (width !== homeLayout.widths[id]) moveWithMotion(() => changeHomeLayout(MaestroHomeLayout.setWidth(homeLayout, id, width), `[data-arrange="${id}-grip"]`), null);
        announceArrange(id);
        return;
    }
    // Shift with a number key: read by the key's place, since Shift + 1 types "!".
    const height = /^Digit[1-3]$/.test(event.code ?? "") ? Number(event.code.slice(5)) : 0;
    if (event.shiftKey && height) {
        event.preventDefault();
        const next = MaestroHomeLayout.setHeight(homeLayout, id, height);
        if (next !== homeLayout) moveWithMotion(() => changeHomeLayout(next, `[data-arrange="${id}-grip"]`), null);
        announceArrange(id, next === homeLayout && height > MaestroHomeLayout.tallest(id) ? `${moduleLabel(id)} can be at most ${MaestroHomeLayout.tallest(id)} tall.` : "");
        return;
    }
    const step = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const sideways = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const next = event.shiftKey
        ? (sideways ? MaestroHomeLayout.setWidth(homeLayout, id, homeLayout.widths[id] + step) : MaestroHomeLayout.setHeight(homeLayout, id, moduleHeight(id) + step))
        : MaestroHomeLayout.moveShown(homeLayout, id, step);
    if (next === homeLayout) return;
    moveWithMotion(() => changeHomeLayout(next, `[data-arrange="${id}-grip"]`), null);
    announceArrange(id);
}

// Modules slide from where they were to where they land (FLIP). The one being
// dragged is left to follow the pointer.
function moveWithMotion(change, held) {
    const others = homeModules().filter(module => module !== held && !module.hidden);
    const before = new Map(others.map(module => [module, module.getBoundingClientRect()]));
    change();
    if (!arrangeMotion()) return;
    others.forEach(module => {
        const was = before.get(module);
        if (!was || module.hidden) return;
        module.style.transition = "none";
        module.style.transform = "";
        const now = module.getBoundingClientRect();
        const dx = was.left - now.left;
        const dy = was.top - now.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        module.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            module.style.transition = "transform 200ms cubic-bezier(.2, .7, .2, 1)";
            module.style.transform = "";
        }));
    });
}

function startMove(event, id) {
    if (event.button !== 0 || arrangeDrag || event.target.closest(".arrange-hide, .arrange-size, .arrange-resize")) return;
    const module = homeModule(id);
    arrangeDrag = { kind: "move", id, x: event.clientX, y: event.clientY, grabX: event.clientX - module.offsetLeft, grabY: event.clientY - module.offsetTop, started: false, before: homeLayout };
    document.addEventListener("pointermove", onArrangePointer);
    document.addEventListener("pointerup", onArrangeRelease);
}

function startResize(event, id) {
    if (event.button !== 0 || arrangeDrag) return;
    event.preventDefault();
    event.stopPropagation();
    arrangeDrag = { kind: "resize", id, started: true, before: homeLayout };
    homeModule(id).classList.add("is-resizing");
    document.body.classList.add("is-arrange-resizing");
    document.addEventListener("pointermove", onArrangePointer);
    document.addEventListener("pointerup", onArrangeRelease);
}

function onArrangePointer(event) {
    const drag = arrangeDrag;
    if (!drag) return;
    const module = homeModule(drag.id);
    if (drag.kind === "resize") {
        // The corner (2.9.0) sets both: the squares the pointer reaches across
        // and down, down only as far as the module can use.
        const face = $("homeFace");
        const style = getComputedStyle(face);
        const gap = parseFloat(style.columnGap) || 20;
        const column = (face.clientWidth - 2 * gap) / MaestroHomeLayout.COLUMNS;
        const box = module.getBoundingClientRect();
        const width = Math.max(1, Math.min(MaestroHomeLayout.COLUMNS, Math.round((event.clientX - box.left + gap) / (column + gap))));
        const row = parseFloat(style.gridAutoRows) || (box.height + gap) / moduleHeight(drag.id) - gap;
        const height = Math.max(1, Math.min(MaestroHomeLayout.tallest(drag.id), Math.round((event.clientY - box.top + gap) / (row + gap))));
        const next = MaestroHomeLayout.setHeight(MaestroHomeLayout.setWidth(homeLayout, drag.id, width), drag.id, height);
        if (next.widths[drag.id] !== homeLayout.widths[drag.id] || moduleHeightIn(next, drag.id) !== moduleHeight(drag.id)) {
            moveWithMotion(() => { homeLayout = next; applyHomeLayout(); }, null);
        }
        return;
    }
    if (!drag.started) {
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
        drag.started = true;
        module.classList.add("is-dragging");
        document.body.classList.add("is-arrange-dragging");
    }
    event.preventDefault();
    const placed = arrangeTarget(drag, module, event.clientX, event.clientY);
    if (placed) {
        drag.placedX = event.clientX;
        drag.placedY = event.clientY;
        moveWithMotion(() => { homeLayout = placed; applyHomeLayout(); }, module);
    }
    module.style.transform = `translate(${event.clientX - drag.grabX - module.offsetLeft}px, ${event.clientY - drag.grabY - module.offsetTop}px)`;
}

// Where a drag lands: before or after the module under the pointer, or last
// once past the last one. Over empty space it stays put, and after a move the
// pointer must travel a little before the next, so a reflow under a still
// pointer can't move it again (and again).
function arrangeTarget(drag, module, x, y) {
    if (drag.placedX !== undefined && Math.hypot(x - drag.placedX, y - drag.placedY) < 24) return null;
    const boxes = homeModules().filter(other => other !== module && !other.hidden).map(other => {
        // Where it sits in the grid, not where it's sliding through.
        const rect = other.getBoundingClientRect();
        const slide = new DOMMatrixReadOnly(getComputedStyle(other).transform);
        return { id: other.dataset.module, left: rect.left - slide.m41, top: rect.top - slide.m42, right: rect.right - slide.m41, bottom: rect.bottom - slide.m42 };
    }).sort((a, b) => homeLayout.order.indexOf(a.id) - homeLayout.order.indexOf(b.id));
    if (!boxes.length) return null;
    const over = boxes.find(box => x >= box.left && x < box.right && y >= box.top && y < box.bottom);
    const last = boxes[boxes.length - 1];
    const placed = over ? MaestroHomeLayout.place(homeLayout, drag.id, over.id, x > (over.left + over.right) / 2)
        : y >= last.bottom || (y >= last.top && x >= last.right) ? MaestroHomeLayout.place(homeLayout, drag.id, last.id, true)
            : homeLayout;
    return placed === homeLayout ? null : placed;
}

function onArrangeRelease() {
    const drag = arrangeDrag;
    if (!drag) return;
    endArrangeDrag(false);
    if (drag.started) announceArrange(drag.id);
    else document.querySelector(`[data-arrange="${drag.id}-grip"]`)?.focus();
}

// Kept, or with Esc, put back as it was before the drag.
function endArrangeDrag(cancel) {
    const drag = arrangeDrag;
    arrangeDrag = null;
    document.removeEventListener("pointermove", onArrangePointer);
    document.removeEventListener("pointerup", onArrangeRelease);
    document.body.classList.remove("is-arrange-dragging", "is-arrange-resizing");
    const module = homeModule(drag.id);
    module.classList.remove("is-dragging", "is-resizing");
    module.style.transform = "";
    if (cancel) moveWithMotion(() => { homeLayout = drag.before; applyHomeLayout(); }, null);
    else if (drag.started) keepHomeLayout();
}

$("arrangeButton").addEventListener("click", () => setArranging(!arranging));
$("arrangeDone").addEventListener("click", () => setArranging(false));
$("arrangeReset").addEventListener("click", () => {
    moveWithMotion(() => changeHomeLayout(MaestroHomeLayout.defaults()), null);
    $("arrangeLive").textContent = `Back to the default arrangement. ${arrangeFitText()}`;
});
document.addEventListener("keydown", event => {
    if (!arranging || event.key !== "Escape" || coveringDialog()) return;
    event.preventDefault();
    if (arrangeDrag) endArrangeDrag(true);
    else setArranging(false);
});

// ---- Saved layouts (2.9.0): a chip beside the title names the one in use and
// opens the Layouts menu: choose one, mark one for while a game runs, and New,
// Rename, Duplicate and Delete. The palette lists them too.

function useHomeSaved(next, { byHand = false } = {}) {
    if (byHand) homeGameSession = MaestroHomeLayout.choseByHand(homeGameSession);
    if (next === homeSaved) return;
    const changed = next.active !== homeSaved.active;
    homeSaved = next;
    if (changed) {
        moveWithMotion(() => {
            homeLayout = MaestroHomeLayout.activeLayout(homeSaved);
            applyHomeLayout();
        }, null);
    }
    keepHomeSaved();
    renderHomeLayoutChip();
}

function chooseHomeLayout(name) {
    useHomeSaved(MaestroHomeLayout.chooseSaved(homeSaved, name), { byHand: true });
}

function homeSavedLayouts() {
    return homeSaved.list.map(entry => ({ name: entry.name, gaming: entry.gaming, active: entry.name === homeSaved.active }));
}

// Games starting and stopping, from Now Playing's live list.
function homeLayoutsFollowGames(playing) {
    const followed = MaestroHomeLayout.followGames(homeSaved, homeGameSession, playing);
    homeGameSession = followed.session;
    useHomeSaved(followed.saved);
}

function renderHomeLayoutChip() {
    const active = homeSaved.list.find(entry => entry.name === homeSaved.active) ?? homeSaved.list[0];
    $("homeLayoutName").textContent = active.name;
    $("homeLayoutAuto").hidden = !active.gaming;
    $("homeLayoutChip").title = `Layout: ${active.name}${active.gaming ? ", used while a game runs" : ""}`;
    $("homeLayoutChip").disabled = arranging;
    $("arrangeLayout").textContent = `Layout: ${active.name}`;
    if (!$("homeLayoutMenu").hidden) renderHomeLayoutMenu();
}

function renderHomeLayoutMenu() {
    const active = homeSaved.active;
    $("homeLayoutList").replaceChildren(...homeSaved.list.map(entry => {
        const item = element("li");
        const button = element("button", "layout-option");
        button.type = "button";
        button.setAttribute("aria-pressed", String(entry.name === active));
        button.append(MaestroIcons.create("layout"), element("span", "layout-option-name", entry.name));
        if (entry.gaming) {
            const tag = element("small", "layout-option-auto");
            tag.append(MaestroIcons.create("games"), document.createTextNode("While a game runs"));
            button.append(tag);
        }
        button.addEventListener("click", () => {
            chooseHomeLayout(entry.name);
            closeHomeLayoutMenu();
        });
        item.append(button);
        return item;
    }));
    const current = homeSaved.list.find(entry => entry.name === active);
    $("homeLayoutGaming").checked = Boolean(current?.gaming);
    $("homeLayoutDelete").disabled = homeSaved.list.length < 2;
    $("homeLayoutNew").disabled = homeSaved.list.length >= MaestroHomeLayout.MAX_SAVED;
    $("homeLayoutDuplicate").disabled = homeSaved.list.length >= MaestroHomeLayout.MAX_SAVED;
}

function placeHomeLayoutMenu() {
    const box = $("homeLayoutChip").getBoundingClientRect();
    const menu = $("homeLayoutMenu");
    menu.style.left = `${Math.max(12, Math.min(box.left, innerWidth - menu.offsetWidth - 12))}px`;
    menu.style.top = `${box.bottom + 8}px`;
}

function openHomeLayoutMenu() {
    if (arranging) return;
    renderHomeLayoutMenu();
    closeHomeLayoutForm();
    $("homeLayoutMenu").hidden = false;
    $("homeLayoutChip").setAttribute("aria-expanded", "true");
    placeHomeLayoutMenu();
    ($("homeLayoutList").querySelector('[aria-pressed="true"]') ?? $("homeLayoutNew")).focus();
}

function closeHomeLayoutMenu(refocus = false) {
    if ($("homeLayoutMenu").hidden) return;
    $("homeLayoutMenu").hidden = true;
    $("homeLayoutChip").setAttribute("aria-expanded", "false");
    if (refocus) $("homeLayoutChip").focus();
}

// New and Rename ask for a name in the menu itself.
let homeLayoutFormMode = "";

function openHomeLayoutForm(mode) {
    homeLayoutFormMode = mode;
    $("homeLayoutFormLabel").textContent = mode === "rename" ? `New name for ${homeSaved.active}` : "Name of the new layout";
    $("homeLayoutNameInput").value = mode === "rename" ? homeSaved.active : "";
    $("homeLayoutActions").hidden = true;
    $("homeLayoutForm").hidden = false;
    checkHomeLayoutName();
    $("homeLayoutNameInput").focus();
    $("homeLayoutNameInput").select();
}

function closeHomeLayoutForm() {
    homeLayoutFormMode = "";
    $("homeLayoutForm").hidden = true;
    $("homeLayoutActions").hidden = false;
}

function checkHomeLayoutName() {
    const problem = MaestroHomeLayout.nameProblem(homeSaved, $("homeLayoutNameInput").value, homeLayoutFormMode === "rename" ? homeSaved.active : "");
    $("homeLayoutProblem").textContent = problem;
    $("homeLayoutSave").disabled = Boolean(problem);
    return problem;
}

// The first free "name copy", "name copy 2", and so on.
function copyName(name) {
    for (let n = 1; ; n++) {
        const candidate = `${name.slice(0, 30)} copy${n > 1 ? ` ${n}` : ""}`;
        if (!MaestroHomeLayout.nameProblem(homeSaved, candidate)) return candidate;
    }
}

$("homeLayoutChip").addEventListener("click", () => ($("homeLayoutMenu").hidden ? openHomeLayoutMenu() : closeHomeLayoutMenu()));
$("homeLayoutGaming").addEventListener("change", () => useHomeSaved(MaestroHomeLayout.setGaming(homeSaved, homeSaved.active, $("homeLayoutGaming").checked)));
$("homeLayoutNew").addEventListener("click", () => openHomeLayoutForm("new"));
$("homeLayoutRename").addEventListener("click", () => openHomeLayoutForm("rename"));
$("homeLayoutDuplicate").addEventListener("click", () => {
    useHomeSaved(MaestroHomeLayout.addSaved(homeSaved, copyName(homeSaved.active), homeLayout), { byHand: true });
    renderHomeLayoutMenu();
});
$("homeLayoutDelete").addEventListener("click", async () => {
    const name = homeSaved.active;
    closeHomeLayoutMenu();
    const confirmed = await confirmDialog({ title: `Delete the layout ${name}?`, message: "Its modules and sizes are forgotten. The Podium shows the first layout left.", confirmLabel: "Delete", danger: true });
    if (confirmed) useHomeSaved(MaestroHomeLayout.removeSaved(homeSaved, name), { byHand: true });
    $("homeLayoutChip").focus();
});
$("homeLayoutNameInput").addEventListener("input", checkHomeLayoutName);
$("homeLayoutCancel").addEventListener("click", () => {
    closeHomeLayoutForm();
    $("homeLayoutNew").focus();
});
$("homeLayoutForm").addEventListener("submit", event => {
    event.preventDefault();
    if (checkHomeLayoutName()) return;
    const name = $("homeLayoutNameInput").value;
    const next = homeLayoutFormMode === "rename"
        ? MaestroHomeLayout.renameSaved(homeSaved, homeSaved.active, name)
        : MaestroHomeLayout.addSaved(homeSaved, name, MaestroHomeLayout.defaults());
    useHomeSaved(next, { byHand: homeLayoutFormMode !== "rename" });
    closeHomeLayoutForm();
    renderHomeLayoutMenu();
    $("homeLayoutList").querySelector('[aria-pressed="true"]')?.focus();
});
$("homeLayoutMenu").addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (!$("homeLayoutForm").hidden) {
        closeHomeLayoutForm();
        $("homeLayoutNew").focus();
    } else {
        closeHomeLayoutMenu(true);
    }
});
document.addEventListener("pointerdown", event => {
    if ($("homeLayoutMenu").hidden || event.target.closest("#homeLayoutMenu, #homeLayoutChip, #confirmDialog")) return;
    closeHomeLayoutMenu();
});
addEventListener("resize", () => { if (!$("homeLayoutMenu").hidden) placeHomeLayoutMenu(); });

// ---- Today's settings: the Wikipedia almanac and the location

function openTodaySettings() {
    $("todaySettingsDialog").hidden = false;
    $("todaySettingsDone").focus();
}

function closeTodaySettings() {
    $("todaySettingsDialog").hidden = true;
    if ($("home").classList.contains("active")) $("todaySettingsButton").focus();
}

$("todaySettingsButton").addEventListener("click", openTodaySettings);
$("todaySettingsClose").addEventListener("click", closeTodaySettings);
$("todaySettingsDone").addEventListener("click", closeTodaySettings);
let todayPressedBackdrop = false;
$("todaySettingsDialog").addEventListener("pointerdown", event => { todayPressedBackdrop = event.target === $("todaySettingsDialog"); });
$("todaySettingsDialog").addEventListener("click", event => {
    if (event.target === $("todaySettingsDialog") && todayPressedBackdrop) closeTodaySettings();
    todayPressedBackdrop = false;
});
$("todaySettingsDialog").addEventListener("keydown", event => {
    if (event.key === "Escape") {
        event.preventDefault();
        closeTodaySettings();
    } else if (event.key === "Tab") {
        const focusable = [...$("todaySettingsDialog").querySelectorAll("button:not(:disabled), input:not(:disabled)")];
        const step = event.shiftKey ? -1 : 1;
        const index = Math.max(focusable.indexOf(document.activeElement), event.shiftKey ? 0 : -1);
        event.preventDefault();
        focusable[(index + step + focusable.length) % focusable.length].focus();
    }
});

applyHomeLayout();
renderHomeLayoutChip();
// Before the first data arrives (2.2.0): Games draws its waiting state, and
// the spaces left empty until then hold their shape.
renderGames();
renderGamesNow();
fillPlaceholders();
renderHomeNow();
renderHomeContinue();
renderHomeWorkspaces();
renderHomeNotes();
