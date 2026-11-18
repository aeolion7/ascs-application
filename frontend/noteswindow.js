"use strict";

// The game notes window's page (2.9.0): Super + G shows it over a game. It
// shows the running game's note, which Maestro relays from the main page, and
// sends each change back the same way; the main page saves it as it saves
// every note. This page asks for nothing else.
globalThis.MaestroNotesWindow = (() => {
    const isKey = key => typeof key === "string" && /^[\p{L}\p{N}]{1,160}$/u.test(key);

    // A state from the main page, checked; null when it isn't one.
    function readState(text) {
        let data = null;
        try { data = JSON.parse(text); } catch { return null; }
        if (!data || typeof data !== "object" || Array.isArray(data)) return null;
        return {
            key: isKey(data.key) ? data.key : "",
            title: typeof data.title === "string" ? data.title.slice(0, 120) : "",
            text: typeof data.text === "string" ? data.text.slice(0, 100000) : "",
            ready: data.ready === true
        };
    }

    // Whether the box takes a new state's text: always for another game, and
    // for the same game unless you're typing in it (your typing is newer).
    function takes(current, next, typing) {
        if (!next) return false;
        if (next.key !== current.key) return true;
        return !typing && next.text !== current.text;
    }

    // What the line under "Notes" says.
    function caption(state) {
        if (!state.ready) return "Loading notes…";
        return state.key ? state.title : "No game is running";
    }

    return { isKey, readState, takes, caption };
})();

(() => {
    const text = document.getElementById("notesWindowText");
    if (!text || !globalThis.chrome?.webview) return;
    const NW = globalThis.MaestroNotesWindow;
    const post = message => globalThis.chrome.webview.postMessage(message);
    let state = { key: "", title: "", text: "", ready: false };
    let pending = null;

    function render() {
        document.getElementById("notesWindowGame").textContent = NW.caption(state);
        const usable = state.ready && Boolean(state.key);
        text.disabled = !usable;
        text.placeholder = usable ? "Notes for this game. They're also in Quick Notes." : state.ready ? "Notes for a game show here while it runs." : "";
        document.getElementById("notesWindowStamp").disabled = !usable;
        document.getElementById("notesWindowOpen").disabled = !usable;
    }

    // Each change goes after a short pause, and at once when you leave the box.
    function sendEdit() {
        clearTimeout(pending);
        pending = null;
        if (!state.key) return;
        state.text = text.value;
        post(`Edit\n${state.key}\n${text.value}`);
    }

    globalThis.chrome.webview.addEventListener("message", event => {
        const next = typeof event.data === "string" ? NW.readState(event.data) : null;
        if (!next) return;
        if (pending && next.key !== state.key) sendEdit();         // finish the last game's note first
        const typing = document.activeElement === text;
        if (NW.takes(state, next, typing)) {
            text.value = next.text;
            if (next.key !== state.key) text.scrollTop = text.scrollHeight;
        }
        state = typing && next.key === state.key ? { ...next, text: text.value } : next;
        render();
    });

    text.addEventListener("input", () => {
        clearTimeout(pending);
        pending = setTimeout(sendEdit, 300);
    });
    text.addEventListener("blur", () => { if (pending) sendEdit(); });
    document.getElementById("notesWindowStamp").addEventListener("click", () => {
        if (pending) sendEdit();
        if (state.key) post(`Stamp\n${state.key}`);
    });
    document.getElementById("notesWindowOpen").addEventListener("click", () => {
        if (pending) sendEdit();
        if (state.key) post(`Open\n${state.key}`);
    });
    const close = () => {
        if (pending) sendEdit();
        post("Close");
    };
    document.getElementById("notesWindowClose").addEventListener("click", close);
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
        }
    });
    render();
    post("Ready");
})();
