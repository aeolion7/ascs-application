"use strict";

// Per-game notes (1.11.1). A game's notes are an ordinary Quick Note with a
// `game` link, so they're saved, backed up and searched with the others. The
// same box appears in Now playing, a library game's details and the
// achievement browser. Text goes into notesData on every keystroke, so neither
// the delayed save nor a redraw can lose it or send it to another game.

// "place:key" -> box. A redraw gets the same box back, which keeps its text,
// cursor and undo history.
const gameNoteBoxes = new Map();
let nowNotesTitle = "";
let freshPlayingWaiters = [];

function gameNoteFor(key) {
    return ASCSNotes.findGameNote(notesData.notes, key);
}

function createGameNote(key, title) {
    const note = makeNote("", ASCSNotes.gameNoteTitle(Games.displayTitle(title)));
    note.group = ASCSNotes.GAME_NOTE_GROUP;
    note.game = key;
    notesData.notes.push(note);
    if (!notesData.activeId) notesData.activeId = note.id;
    return note;
}

// Dates this note itself: scheduleNoteSave would date whichever note is open
// in Quick Notes instead.
function saveGameNote(note) {
    note.updated = new Date().toISOString();
    if (note.id === notesData.activeId) renderActiveNote();
    scheduleNoteSave(false);
    sendNotesWindowState();
}

function moveCaretToEnd(area) {
    area.setSelectionRange(area.value.length, area.value.length);
    area.scrollTop = area.scrollHeight;
}

// ---- asking what's running, once

// Runs the callback when the next gamesLive reply arrives, or says it didn't.
function withFreshPlaying(callback) {
    let done = false;
    let timer = null;
    const finish = fresh => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        callback(fresh);
    };
    timer = setTimeout(() => finish(false), 1500);
    freshPlayingWaiters.push(() => finish(true));
    if (!send("GetGamesLive")) finish(false);
}

function gameNotesLiveArrived() {
    freshPlayingWaiters.splice(0).forEach(waiter => waiter());
    sendNotesWindowState();
}

// ---- timestamps

function addGameNoteStamp(key, title, after) {
    withFreshPlaying(fresh => {
        if (!notesLoaded) return;
        const since = fresh ? Games.sessionSince(gamesState.items, gamesState.playing, key) : 0;
        const note = gameNoteFor(key) ?? createGameNote(key, title);
        note.content = ASCSNotes.appendStamp(note.content, Games.sessionStamp(new Date(), since));
        saveGameNote(note);
        after(note);
    });
}

// ---- the box

function buildGameNotesBox(key, title) {
    const root = element("div", "game-notes");
    const head = element("div", "game-notes-head");
    head.append(element("h2", "", "Notes"), element("span", "game-notes-name", Games.displayTitle(title)));
    const actions = element("div", "game-notes-actions");
    const stamp = element("button", "secondary", "Add timestamp");
    stamp.type = "button";
    stamp.title = "Adds the date and time, and how far into the session you are if this game is running";
    const open = element("button", "secondary", "Open in Quick Notes");
    open.type = "button";
    actions.append(stamp, open);
    const text = element("textarea", "game-notes-text");
    text.rows = 4;
    text.setAttribute("aria-label", `Notes for ${Games.displayTitle(title)}`);
    root.append(head, text, actions);
    const box = { key, title, root, text, stamp, open };

    text.addEventListener("input", () => {
        if (!notesLoaded) return;
        const note = gameNoteFor(key) ?? createGameNote(key, title);
        note.content = text.value;
        open.hidden = false;
        saveGameNote(note);
    });
    // A game that changed while you were typing takes over once you've finished.
    text.addEventListener("blur", () => setTimeout(() => {
        if ($("gamesNowNotes").contains(text)) syncNowPlayingNotes(nowNotesTitle);
    }));
    stamp.addEventListener("click", () => addGameNoteStamp(key, title, () => {
        syncGameNotesBox(box);
        text.focus();
        moveCaretToEnd(text);
    }));
    open.addEventListener("click", () => {
        const note = gameNoteFor(key);
        if (!note) return;
        openNote(note.id, "edit");          // written during play, so it opens to write in
        moveCaretToEnd($("noteText"));
    });
    return box;
}

function syncGameNotesBox(box) {
    const note = notesLoaded ? gameNoteFor(box.key) : null;
    const value = note?.content ?? "";
    if (box.text.value !== value) box.text.value = value;
    box.text.disabled = !notesLoaded;
    box.stamp.disabled = !notesLoaded;
    box.text.placeholder = notesLoaded ? "Notes for this game. They're also in Quick Notes." : "Loading notes…";
    box.text.spellcheck = notesSpellcheck();
    box.open.hidden = !note;
}

function gameNotesBox(place, title) {
    const key = Games.gameNoteKey(title);
    if (!key) return null;
    const id = `${place}:${key}`;
    let box = gameNoteBoxes.get(id);
    if (!box) {
        box = buildGameNotesBox(key, title);
        gameNoteBoxes.set(id, box);
    }
    syncGameNotesBox(box);
    return box.root;
}

// Every box on the page, after the notes changed from somewhere else.
function refreshGameNotes() {
    gameNoteBoxes.forEach((box, id) => {
        if (box.root.isConnected) syncGameNotesBox(box);
        else gameNoteBoxes.delete(id);
    });
    sendNotesWindowState();
}

// ---- The game notes window (2.9.0): Super + G shows it over a game. Maestro
// relays between it and this page, which stays the one that changes the
// notes. It's told the running game's note when it opens, when the game
// changes and when the note changes; its edits come back here.
let notesWindowOpen = false;
let notesWindowSent = "";

function notesWindowGame() {
    const title = (gamesState.playing || []).map(item => Games.playingTitle(gamesState.items, item)).find(Boolean) || "";
    return { title, key: title ? Games.gameNoteKey(title) : "" };
}

function sendNotesWindowState(force = false) {
    if (!notesWindowOpen) return;
    const { title, key } = notesWindowGame();
    const note = key && notesLoaded ? gameNoteFor(key) : null;
    const json = JSON.stringify({ key, title: title ? Games.displayTitle(title) : "", text: note?.content ?? "", ready: notesLoaded });
    if (json === notesWindowSent && !force) return;
    notesWindowSent = json;
    send("GameNotesWindowState", json);
}

function setNotesWindowOpen(open) {
    notesWindowOpen = open === true;
    notesWindowSent = "";
    sendNotesWindowState();
}

// Only for the game that's running: an edit for one that has just closed
// waits in the window rather than going to the wrong note.
function notesWindowEdit(key, text) {
    const game = notesWindowGame();
    if (!notesLoaded || typeof text !== "string" || key !== game.key || !game.key) return;
    const note = gameNoteFor(key) ?? createGameNote(key, game.title);
    if (note.content === text) return;
    note.content = text;
    saveGameNote(note);
    gameNoteBoxes.forEach(box => { if (box.key === key && box.root.isConnected && document.activeElement !== box.text) syncGameNotesBox(box); });
}

function notesWindowStamp(key) {
    const game = notesWindowGame();
    if (key !== game.key || !game.key) return;
    addGameNoteStamp(key, game.title, () => refreshGameNotes());
}

function notesWindowOpenNote(key) {
    const note = notesLoaded ? gameNoteFor(key) : null;
    if (!note) return;
    openNote(note.id, "edit");
    moveCaretToEnd($("noteText"));
}

// The page's redraws replace the box's parents, which drops the focus. Called
// first thing in a redraw; puts the focus back when the redraw has finished.
function keepGameNoteFocus() {
    const area = document.activeElement;
    if (!area?.classList?.contains("game-notes-text")) return;
    const { selectionStart, selectionEnd, scrollTop } = area;
    queueMicrotask(() => {
        if (!area.isConnected || document.activeElement === area) return;
        area.focus({ preventScroll: true });
        area.setSelectionRange(selectionStart, selectionEnd);
        area.scrollTop = scrollTop;
    });
}

// Now playing's box, kept outside the panel that redraws itself. The title is
// the running game's, or the last played game's when nothing is running; at
// an emulator's menu there's none, so the module says so. It's always there,
// so a game starting or stopping doesn't rearrange the page.
function syncNowPlayingNotes(title) {
    nowNotesTitle = title;
    const panel = $("gamesNowNotes");
    const key = title ? Games.gameNoteKey(title) : "";
    const area = panel.querySelector(".game-notes-text");
    if (area && document.activeElement === area && panel.dataset.key !== key) return;
    const root = key ? gameNotesBox("now", title) : null;
    panel.dataset.key = key;
    if (!root) {
        const head = element("div", "game-notes-head");
        head.append(element("h2", "", "Notes"));
        panel.replaceChildren(head, gamesState.loaded ? element("p", "module-empty", "No game to take notes on.") : placeholder("field"));
    } else if (panel.firstChild !== root) panel.replaceChildren(root);
}

// ---- the palette: Notes for current game

function openCurrentGameNotes() {
    withFreshPlaying(fresh => {
        if (!notesLoaded) {
            send("GetNotes");
            showNotice("Notes are still loading. Try again in a moment.");
            return;
        }
        if (!fresh) {
            showNotice("Maestro couldn't check what's running.");
            return;
        }
        const title = gamesState.playing.map(item => Games.playingTitle(gamesState.items, item)).find(Boolean);
        const key = title ? Games.gameNoteKey(title) : "";
        if (!key) {
            showNotice("No game is running.");
            return;
        }
        const note = gameNoteFor(key) ?? createGameNote(key, title);
        openNote(note.id, "edit");
        moveCaretToEnd($("noteText"));
    });
}

// ---- Quick Notes: what a linked note belongs to

function renderNoteGameLink(note) {
    const linked = ASCSNotes.isGameKey(note?.game);
    $("noteGameLink").hidden = !linked;
    if (!linked) return;
    const game = gamesState.items.find(item => Games.gameNoteKey(item.title) === note.game);
    $("noteGameName").textContent = game ? Games.displayTitle(game.title) : note.title || "this game";
}

$("noteGameStamp").addEventListener("click", () => {
    const note = activeNote();
    if (!ASCSNotes.isGameKey(note?.game)) return;
    addGameNoteStamp(note.game, note.title, () => {
        noteMode = "edit";                  // the stamp goes into the plain text
        renderActiveNote();
        $("noteText").focus();
        moveCaretToEnd($("noteText"));
    });
});

$("noteGameUnlink").addEventListener("click", () => {
    const note = activeNote();
    if (!note) return;
    delete note.game;
    renderActiveNote();
    scheduleNoteSave(false);
    refreshGameNotes();
    showNotice("This note is no longer linked to the game. Writing in the game's notes box starts a new note.");
});
