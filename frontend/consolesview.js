"use strict";

// Games › Consoles (2.9.0): the Switch's payload, console SD cards, and a
// module for each console with the date it was last updated, its release
// pages and its notes. Maestro does the work; this page names payloads by
// their place in Maestro's list and cards by their drive letter.

let consolesState = null;
// SHA-256 of each payload, by its place, size and time; worked out here from
// the bytes Maestro sends, one payload at a time.
const payloadHashes = new Map();
let payloadHashAsked = "";

const payloadHashKey = (index, item) => `${index}|${item.size}|${item.time}`;

function renderConsoles() {
    const state = MaestroConsoles.clean(consolesState);
    const ready = consolesState !== null;
    $("consolesRcm").textContent = ready ? MaestroConsoles.rcmText(state) : "";
    $("consolesRcm").classList.toggle("is-connected", state.rcm);

    const list = $("consolesPayloads");
    if (ready) {
        list.replaceChildren(...(state.payloads.length ? state.payloads.map((item, at) => {
            const index = at + 1;
            const row = element("li");
            const button = element("button", "consoles-payload-row");
            button.type = "button";
            button.setAttribute("aria-pressed", String(index === state.selected));
            const words = element("span", "consoles-payload-words");
            words.append(element("strong", "", item.name), element("small", "", MaestroConsoles.payloadDetail(item)));
            const hash = payloadHashes.get(payloadHashKey(index, item));
            const sum = element("small", "consoles-hash", hash ? `SHA-256 ${hash.slice(0, 12)}…` : "SHA-256 …");
            sum.title = hash ? `SHA-256 ${hash}\n${item.folder}` : item.folder;
            button.append(words, sum);
            button.addEventListener("click", () => send("SetPayloadChoice", `${index}|${state.autoPush ? 1 : 0}`));
            row.append(button);
            return row;
        }) : [element("li", "module-empty", state.sender ? "No payloads yet. Add some in TegraRcmGUI's favorites, or choose a folder." : "Install TegraRcmGUI to push payloads.")]));
    }
    $("consolesPush").disabled = !ready || !state.sender || !state.selected || state.pushing;
    $("consolesAuto").disabled = !ready || !state.selected;
    $("consolesAuto").checked = state.autoPush;
    $("consolesFolder").textContent = state.folder ? `From TegraRcmGUI's favorites and ${state.folder}` : "From TegraRcmGUI's favorites";
    $("consolesChooseFolder").disabled = !ready;

    const cards = $("consolesCards");
    if (ready) {
        cards.replaceChildren(...(state.cards.length ? state.cards.map(card => {
            const item = element("li", "consoles-card");
            const head = element("span", "consoles-card-words");
            head.append(element("strong", "", `${MaestroConsoles.kindName(card.kind)} · ${card.drive}:${card.label ? ` ${card.label}` : ""}`));
            const versions = MaestroConsoles.versionsText(card.versions);
            const space = MaestroConsoles.cardSpace(card);
            head.append(element("small", "", [versions, space.text].filter(Boolean).join(" · ")));
            if (card.copied) head.append(element("small", "", `${card.copied} config file${card.copied === 1 ? "" : "s"} copied`));
            const actions = element("span", "consoles-card-actions");
            const open = element("button", "secondary", "Open");
            open.type = "button";
            open.addEventListener("click", () => send("OpenConsoleCard", card.drive));
            actions.append(open);
            if (card.kind === "switch") {
                const album = element("button", "secondary", "Import album");
                album.type = "button";
                album.disabled = state.album.running;
                album.title = `Copies new photos and clips to ${state.albumFolder || "Pictures\\Switch"}. Nothing on the card changes.`;
                album.addEventListener("click", () => send("ImportAlbum", card.drive));
                actions.append(album);
            }
            const track = element("div", "metric-track consoles-card-track");
            track.setAttribute("role", "progressbar");
            track.setAttribute("aria-label", `${card.drive}: used`);
            track.setAttribute("aria-valuemin", "0");
            track.setAttribute("aria-valuemax", "100");
            const fill = element("span");
            track.append(fill);
            item.append(head, actions, track);
            setProgressBar(fill, space.used);
            return item;
        }) : [element("li", "module-empty", "Insert a Switch, 3DS or Wii U SD card to see it here.")]));
        const progress = MaestroConsoles.albumText(state.album);
        if (progress) cards.append(element("li", "consoles-note", progress));
    }

    document.querySelectorAll("[data-console]").forEach(module => renderConsoleModule(module, state));
    askPayloadHash(state);
}

// Each console's module: when it was last updated (a date you keep), its
// release pages (opened in the browser; Maestro checks nothing online), and its notes.
function renderConsoleModule(module, state) {
    const id = module.dataset.console;
    const kind = MaestroConsoles.KINDS.find(each => each.id === id);
    if (!kind) return;
    let body = module.querySelector(".consoles-console-body");
    if (!body) {
        body = element("div", "consoles-console-body");
        const field = element("label", "settings-field");
        const input = element("input");
        input.type = "date";
        input.id = `consoleUpdated-${id}`;
        input.addEventListener("change", () => {
            if (/^\d{4}-\d\d-\d\d$/.test(input.value) || input.value === "") send("SetConsoleUpdated", `${id}|${input.value}`);
        });
        field.htmlFor = input.id;
        field.append(element("span", "", "Last updated"), input);
        const links = element("div", "consoles-links");
        kind.links.forEach(([link, label]) => {
            const button = element("button", "link-button has-chevron", label);
            button.type = "button";
            button.title = "Opens the release page in your browser";
            button.addEventListener("click", () => send("OpenConsoleLink", link));
            links.append(button);
        });
        body.append(field, links);
        module.append(body);
    }
    const input = body.querySelector("input[type=date]");
    if (document.activeElement !== input) input.value = state.updated[id] || "";
    input.disabled = consolesState === null;
    const notes = gameNotesBox("consoles", kind.name);
    if (notes && notes.parentElement !== body) body.append(notes);
}

// One payload at a time, while Consoles shows.
function askPayloadHash(state) {
    if (!$("gamesConsolesPanel") || $("gamesConsolesPanel").hidden) return;
    const index = state.payloads.findIndex((item, at) => !payloadHashes.has(payloadHashKey(at + 1, item))) + 1;
    if (!index) return;
    const key = payloadHashKey(index, state.payloads[index - 1]);
    if (payloadHashAsked === key) return;
    payloadHashAsked = key;
    send("GetPayloadBytes", String(index));
}

async function payloadBytesArrived(data) {
    const index = Number(data.index);
    const bytes = typeof data.data === "string" ? MaestroConsoles.bytesOf(data.data) : null;
    const key = `${index}|${data.size}|${data.time}`;
    payloadHashAsked = "";
    if (!bytes || !globalThis.crypto?.subtle) {
        payloadHashes.set(key, "");
        return;
    }
    payloadHashes.set(key, MaestroConsoles.hex(await crypto.subtle.digest("SHA-256", bytes)));
    renderConsoles();
}

$("consolesPush").addEventListener("click", () => {
    const state = MaestroConsoles.clean(consolesState);
    if (!state.selected) return;
    $("consolesPushStatus").textContent = "Sending…";
    send("PushPayload", String(state.selected));
});
$("consolesAuto").addEventListener("change", () => {
    const state = MaestroConsoles.clean(consolesState);
    send("SetPayloadChoice", `${state.selected}|${$("consolesAuto").checked ? 1 : 0}`);
});
$("consolesChooseFolder").addEventListener("click", () => send("ChoosePayloadFolder"));
$("consolesOpenCopies").addEventListener("click", () => send("OpenConsoleBackups"));
$("consolesOpenAlbum").addEventListener("click", () => send("OpenAlbumFolder"));

function handleConsolesMessage(data) {
    switch (data.type) {
        case "consoles":
            consolesState = data;
            renderConsoles();
            return true;
        case "payloadBytes":
            payloadBytesArrived(data);
            return true;
        case "payloadPushed":
            $("consolesPushStatus").textContent = typeof data.message === "string" ? data.message.slice(0, 300) : "";
            $("consolesPushStatus").classList.toggle("is-failed", data.ok !== true);
            return true;
        case "albumImported":
            if (typeof data.message === "string") showToast(data.message.slice(0, 300));
            return true;
        default:
            return false;
    }
}
