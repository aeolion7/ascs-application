"use strict";

// ---- Sounds view (1.8.0)
// The library comes from ASCS as an index (ids, names, versions, lengths;
// never file paths). A sound's bytes are asked for by id when first played
// and kept for the session; they are decoded and played with Web Audio, so
// several can overlap and a gain can be previewed. MIDI and WMA are played by
// Windows. Levels are measured here (ASCSSounds), and a leveled copy is made
// here and handed to ASCS to save. Uses $, element, send and showNotice from
// app.js.

const Sounds = globalThis.ASCSSounds;
const SOUND_PREFS = "ascs.sounds";
const soundState = {
    library: null, era: "", query: "", favoritesOnly: false, selected: "",
    bytes: new Map(), decoded: new Map(), waiting: new Map(), levels: new Map(),
    windowsSounds: [], ascsSounds: {}, context: null, master: null, playing: new Set(),
    measuring: false, plan: null, sideTab: "selected", editingLibrary: false, playToken: 0,
    inUse: new Map(), matchWaits: new Map(), measuringInUse: false, matching: false, playingRow: "",
    selecting: false, picked: new Set(), anchor: "", deleting: null, deleteWait: null,
    matchQueue: [], matchingKey: "",
    startup: { signin: [], shutdown: null }, oddsDraft: null, oddsTimer: 0, ownEditing: "", ownDraft: null
};
const SELECT_LIMIT = 200;       // copies in one Select › Delete
const DELETE_BATCH = 10;        // ids per request; ASCS answers each

function loadSoundPrefs() {
    try {
        const saved = JSON.parse(localStorage.getItem(SOUND_PREFS) || "{}") || {};
        return {
            favorites: new Set(Array.isArray(saved.favorites ?? saved.favourites) ? (saved.favorites ?? saved.favourites).filter(id => typeof id === "string").slice(0, 2000) : []),
            reference: Number.isFinite(saved.reference) ? Math.max(-60, Math.min(0, saved.reference)) : -26.4,
            avoidClipping: saved.avoidClipping !== false,
            volume: Number.isFinite(saved.volume) ? Math.max(0, Math.min(100, saved.volume)) : 70,
            era: typeof saved.era === "string" ? saved.era : "",
            notifyTarget: Number.isFinite(saved.notifyTarget) ? Math.max(-40, Math.min(-10, saved.notifyTarget)) : -24,
            startupTarget: Number.isFinite(saved.startupTarget) ? Math.max(-40, Math.min(-10, saved.startupTarget)) : -20,
            levels: Sounds.cleanOwnLevels(saved.levels)
        };
    } catch {
        return { favorites: new Set(), reference: -26.4, avoidClipping: true, volume: 70, era: "", notifyTarget: -24, startupTarget: -20, levels: {} };
    }
}
const soundPrefs = loadSoundPrefs();
soundState.era = soundPrefs.era;

function saveSoundPrefs() {
    try {
        localStorage.setItem(SOUND_PREFS, JSON.stringify({
            favorites: [...soundPrefs.favorites], reference: soundPrefs.reference,
            avoidClipping: soundPrefs.avoidClipping, volume: soundPrefs.volume, era: soundState.era,
            notifyTarget: soundPrefs.notifyTarget, startupTarget: soundPrefs.startupTarget, levels: soundPrefs.levels
        }));
    } catch { /* storage full or unavailable: preferences just aren't kept */ }
}

function openSoundsView() {
    if (!soundState.library) send("GetSoundLibrary");
    send("GetWindowsSounds");
    send("GetStartupSounds");
}

// ---- messages from ASCS

function handleSoundLibrary(data) {
    const eras = (Array.isArray(data.eras) ? data.eras : [])
        .filter(era => era && typeof era.folder === "string")
        .map(era => ({ folder: era.folder, year: Number.isFinite(era.year) ? era.year : 0, label: typeof era.label === "string" ? era.label : era.folder }))
        .sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.label.localeCompare(b.label));
    const labels = new Map(eras.map(era => [era.folder, era.label]));
    const sounds = (Array.isArray(data.sounds) ? data.sounds : [])
        .filter(sound => sound && typeof sound.id === "string" && typeof sound.name === "string")
        .map(sound => ({
            id: sound.id, name: sound.name, era: String(sound.era || ""), group: String(sound.group || ""),
            kind: sound.kind === "windows" ? "windows" : "web", ext: String(sound.ext || ""),
            size: Number(sound.size) || 0, seconds: Number(sound.seconds) || 0,
            eraLabel: labels.get(String(sound.era || "")) || "",
            origin: typeof sound.origin === "string" ? sound.origin : ""
        }));
    soundState.library = { root: String(data.root || ""), exists: data.exists === true, eras, sounds, byId: new Map(sounds.map(s => [s.id, s])) };
    $("soundLibraryShown").textContent = soundState.library.root;
    if (!soundState.editingLibrary) $("soundLibraryPath").value = soundState.library.root;
    if (data.ascsSounds && typeof data.ascsSounds === "object") soundState.ascsSounds = data.ascsSounds;
    if (soundState.era && !eras.some(era => era.folder === soundState.era)) soundState.era = "";
    // After a re-read, sounds may have changed on disk; when ASCS only filled
    // in lengths, what was fetched and measured stays.
    // Sounds in use ("use:" ids) aren't library files: they stay until the
    // file an event plays changes (handleWindowsSounds).
    if (data.changed !== false) {
        for (const cache of [soundState.bytes, soundState.decoded]) {
            [...cache.keys()].forEach(id => { if (!id.startsWith("use:") && !id.startsWith("origin:")) cache.delete(id); });
        }
        soundState.levels.clear();
    }
    renderSounds();
}

function handleSoundBytes(id, base64) {
    const waiting = soundState.waiting.get(id);
    soundState.waiting.delete(id);
    const bytes = base64 ? Sounds.base64ToBytes(base64) : null;
    if (bytes) soundState.bytes.set(id, bytes);
    waiting?.forEach(({ resolve, reject }) => (bytes ? resolve(bytes) : reject(new Error("ASCS couldn't send that sound."))));
}

function handleWindowsSounds(data) {
    soundState.windowsSounds = (Array.isArray(data.events) ? data.events : []).filter(event => event && typeof event.key === "string");
    if (data.ascsSounds && typeof data.ascsSounds === "object") soundState.ascsSounds = data.ascsSounds;
    inUseRows().forEach(row => { if (soundState.inUse.has(row.key) && soundState.inUse.get(row.key).file !== row.file) forgetInUse(row.key); });
    renderSoundAssignments();
    renderSoundDetail();
}

// The sign-in roll and the shutdown sound (1.8.1), from data\startup-sounds.ini.
function handleStartupSounds(data) {
    const entry = item => item && typeof item === "object" ? {
        file: String(item.file || ""), id: String(item.id || ""), origin: String(item.origin || ""),
        exists: item.exists === true, changed: item.changed === true, weight: Number.isFinite(item.weight) ? item.weight : 0
    } : null;
    soundState.startup = {
        signin: (Array.isArray(data.signin) ? data.signin : []).map(entry).filter(Boolean).slice(0, 8),
        shutdown: entry(data.shutdown),
        taskWarning: typeof data.taskWarning === "string" ? data.taskWarning.slice(0, 300) : ""
    };
    soundState.oddsDraft = null;
    startupRows().forEach(row => { if (soundState.inUse.has(row.key) && soundState.inUse.get(row.key).file !== row.file) forgetInUse(row.key); });
    renderSoundAssignments();
    renderSoundDetail();
}

function handleSoundSaved(data) {
    if (typeof data.id !== "string") return;
    soundState.selected = data.id;
    const sound = soundState.library?.byId.get(data.id);
    if (sound) soundState.era = sound.era;
    showNotice(`Saved "${sound?.name || "the leveled copy"}" in ASCS Leveled.`);
    renderSounds();
}

// ---- getting, decoding and playing sounds

function soundBytes(id) {
    if (soundState.bytes.has(id)) return Promise.resolve(soundState.bytes.get(id));
    return new Promise((resolve, reject) => {
        const list = soundState.waiting.get(id) || [];
        list.push({ resolve, reject });
        if (list.length === 1) {
            soundState.waiting.set(id, list);
            const sent = id.startsWith("use:") ? send("GetInUseSound", id.slice(4))
                : id.startsWith("origin:") ? send("GetInUseOrigin", id.slice(7)) : send("GetSound", id);
            if (!sent) handleSoundBytes(id, "");
            setTimeout(() => { if (soundState.waiting.get(id) === list) handleSoundBytes(id, ""); }, 15000);
        }
    });
}

function audioContext() {
    if (!soundState.context) {
        soundState.context = new AudioContext();
        soundState.master = soundState.context.createGain();
        soundState.master.connect(soundState.context.destination);
    }
    soundState.master.gain.value = soundPrefs.volume / 100;
    if (soundState.context.state === "suspended") soundState.context.resume();
    return soundState.context;
}

async function decodedSound(id) {
    if (soundState.decoded.has(id)) return soundState.decoded.get(id);
    const bytes = await soundBytes(id);
    const buffer = await audioContext().decodeAudioData(bytes.slice(0));
    soundState.decoded.set(id, buffer);
    // Keep the session's memory in check: the 60 most recently decoded.
    if (soundState.decoded.size > 60) soundState.decoded.delete(soundState.decoded.keys().next().value);
    return buffer;
}

// One sound at a time: a new sound stops whatever is playing, unless layer
// is set (Ctrl + click), which plays it over the others. Each play takes a
// token, so a sound still being decoded when another is chosen never starts.
async function playSound(id, gainDb = 0, layer = false) {
    const sound = soundState.library?.byId.get(id);
    if (!sound) return;
    if (!layer) soundState.playToken++;
    const token = soundState.playToken;
    if (sound.kind === "windows") {
        if (!layer) stopWebSounds();
        send("PlaySoundNative", id);         // Windows plays one at a time anyway
        return;
    }
    if (!layer) stopSounds();
    try {
        const buffer = await decodedSound(id);
        if (token !== soundState.playToken) return;     // something else was chosen meanwhile
        const context = audioContext();
        const source = context.createBufferSource();
        const gain = context.createGain();
        gain.gain.value = Sounds.fromDb(gainDb);
        source.buffer = buffer;
        source.connect(gain).connect(soundState.master);
        source.onended = () => soundState.playing.delete(source);
        soundState.playing.add(source);
        source.start();
    } catch (error) {
        showNotice(`Couldn't play ${sound.name}: ${error.message}`);
    }
}

function stopWebSounds() {
    soundState.playing.forEach(source => { try { source.stop(); } catch { /* already ended */ } });
    soundState.playing.clear();
}

function stopSounds() {
    stopWebSounds();
    send("StopSoundNative");
}

// Stop all also drops sounds that are still being decoded.
function stopAllSounds() {
    soundState.playToken++;
    stopSounds();
}

async function measureSound(id) {
    if (soundState.levels.has(id)) return soundState.levels.get(id);
    const bytes = await soundBytes(id);
    let level = Sounds.measureWav(bytes);
    const wav = level && Sounds.wavChannels(bytes);
    if (wav) {
        level.lufs = Sounds.measureLoudness(wav.channels, wav.rate);
    } else {
        const buffer = await decodedSound(id);
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
        level = { ...Sounds.measureChannels(channels), seconds: buffer.duration, lufs: Sounds.measureLoudness(channels, buffer.sampleRate) };
    }
    level.levelable = Boolean(wav);
    soundState.levels.set(id, level);
    return level;
}

// ---- rendering

function visibleSounds() {
    const library = soundState.library;
    if (!library) return [];
    const favorites = soundState.favoritesOnly ? soundPrefs.favorites : null;
    const query = soundState.query.trim();
    if (!query && !soundState.favoritesOnly && !soundState.era) return [];
    const pool = query || soundState.favoritesOnly ? library.sounds : library.sounds.filter(sound => sound.era === soundState.era);
    return Sounds.filterSounds(pool, query, favorites);
}

// The grid of versions shows when nothing is searched and no version is open.
const showingVersionGrid = () => !soundState.query.trim() && !soundState.favoritesOnly && !soundState.era;

// A version's logo, or ASCS's mark for folders of your own.
function eraLogoImage(era) {
    const image = element("img", "sound-era-logo");
    const name = Sounds.eraLogo(era.label);
    image.src = name ? `assets/windows/${name}.png` : "assets/ascs.ico";
    image.alt = "";
    image.draggable = false;
    return image;
}

function openSoundEra(folder) {
    soundState.era = folder;
    soundState.query = "";
    soundState.favoritesOnly = false;
    $("soundSearch").value = "";
    saveSoundPrefs();
    renderSounds();
    if (!folder) $("sounds").scrollIntoView({ block: "start" });
}

// Your own folders, as buttons beside Favorites; a second click returns to
// the versions.
function renderOwnFolders(folders) {
    const holder = $("soundOwnFolders");
    holder.replaceChildren(...folders.map(era => {
        const active = era.folder === soundState.era && !soundState.query.trim() && !soundState.favoritesOnly;
        const button = element("button", "secondary sound-own");
        button.type = "button";
        button.setAttribute("aria-pressed", String(active));
        button.title = active ? "Back to every version" : `Open ${era.label}`;
        button.append(eraLogoImage(era), element("span", "", era.label));
        button.addEventListener("click", () => openSoundEra(active ? "" : era.folder));
        return button;
    }));
    holder.hidden = !folders.length;
}

function versionCard(era, count) {
    const card = element("button", "sound-version");
    card.type = "button";
    card.dataset.soundEra = era.folder;
    const art = element("span", "sound-version-art");
    art.append(eraLogoImage(era));
    const copy = element("span", "sound-version-copy");
    copy.append(element("small", "", era.year ? String(era.year) : "Yours"), element("strong", "", era.label),
        element("em", "", `${count} sound${count === 1 ? "" : "s"}`));
    card.append(art, copy);
    card.title = `Open ${era.label}`;
    card.addEventListener("click", () => openSoundEra(era.folder));
    return card;
}

function renderSounds() {
    const library = soundState.library;
    const strip = $("soundEras");
    const grid = showingVersionGrid();
    // Windows versions (folders with a year) fill the grid and the strip;
    // folders of your own (Aeolionware Startup, ASCS Leveled…) are buttons
    // beside Favorites instead.
    const versions = (library?.eras || []).filter(era => era.year);
    renderOwnFolders((library?.eras || []).filter(era => !era.year));
    strip.hidden = grid || !versions.length;
    // Back to the grid, right above the sounds (also clears a search).
    $("soundBack").hidden = grid || !library;
    strip.replaceChildren(...versions.map(era => {
        const active = era.folder === soundState.era && !soundState.query && !soundState.favoritesOnly;
        const chip = element("button", `sound-era${active ? " is-active" : ""}`);
        chip.type = "button";
        chip.dataset.soundEra = era.folder;
        chip.setAttribute("aria-pressed", String(active));
        const copy = element("span", "sound-era-copy");
        copy.append(element("small", "", era.year ? String(era.year) : "Yours"), element("span", "", era.label));
        chip.append(eraLogoImage(era), copy);
        chip.title = era.label;
        chip.addEventListener("click", () => openSoundEra(era.folder));
        return chip;
    }));
    if (!strip.hidden) requestAnimationFrame(() => strip.querySelector(".sound-era.is-active")?.scrollIntoView({ block: "nearest", inline: "nearest" }));
    $("soundFavoritesOnly").setAttribute("aria-pressed", String(soundState.favoritesOnly));

    const sounds = visibleSounds();
    const groups = $("soundGroups");
    if (!library) {
        groups.replaceChildren(element("p", "settings-note", "Loading the library…"));
    } else if (!library.exists) {
        groups.replaceChildren(element("p", "settings-note", `The library folder ${library.root} wasn't found. Set it below, under Library.`));
    } else if (grid) {
        const counts = new Map();
        library.sounds.forEach(sound => counts.set(sound.era, (counts.get(sound.era) || 0) + 1));
        const cards = element("div", "sound-versions");
        cards.append(...versions.map(era => versionCard(era, counts.get(era.folder) || 0)));
        groups.replaceChildren(cards);
    } else if (!sounds.length) {
        groups.replaceChildren(element("p", "settings-note", soundState.favoritesOnly ? "No favorites yet. Click ♥ on a sound to add it." : "No sounds match."));
    } else {
        const across = Boolean(soundState.query.trim() || soundState.favoritesOnly);
        const byEra = across ? Sounds.groupSounds(sounds.map(sound => ({ ...sound, group: sound.eraLabel }))) : Sounds.groupSounds(sounds);
        groups.replaceChildren(...byEra.map(({ group, items }) => {
            const section = element("section", "sound-group");
            if (group || across) section.append(element("h3", "", group || "Loose sounds"));
            const grid = element("div", "sound-grid");
            grid.append(...items.slice(0, 400).map(soundTile));
            section.append(grid);
            return section;
        }));
    }
    const era = library?.eras.find(item => item.folder === soundState.era);
    $("soundsMeta").textContent = !library ? "" : grid
        ? `${versions.length} versions · ${library.sounds.length} sounds · choose one, or search them all`
        : soundState.query.trim() || soundState.favoritesOnly
        ? `${sounds.length} sound${sounds.length === 1 ? "" : "s"} across every version`
        : `${era ? `${era.year ? `${era.year} · ` : ""}${era.label}` : ""} · ${sounds.length} sound${sounds.length === 1 ? "" : "s"}`;
    $("soundMeasureAll").disabled = !sounds.length || soundState.measuring;
    // Select is offered wherever leveled copies are shown; picks that are no
    // longer shown, or are now in use, are dropped.
    const leveled = !grid && sounds.some(sound => Sounds.isLeveledCopy(sound.id));
    if (soundState.selecting && !leveled && !soundState.deleting) soundState.selecting = false;
    const pickable = new Set(selectableIds());
    [...soundState.picked].forEach(id => { if (!pickable.has(id)) soundState.picked.delete(id); });
    $("soundSelect").hidden = !leveled || soundState.selecting;
    renderSelectBar();
    renderSoundDetail();
    renderSoundAssignments();
    fitSoundSide();
}

function soundTile(sound) {
    const tile = element("div", `sound-tile${sound.id === soundState.selected ? " is-selected" : ""}`);
    tile.dataset.soundId = sound.id;
    const play = element("button", "sound-play");
    play.type = "button";
    play.title = `Play ${sound.name} (Ctrl + click to layer it over what's playing)`;
    play.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6Z"/></svg>';
    play.addEventListener("click", event => {
        event.stopPropagation();
        selectSound(sound.id);
        playSound(sound.id, 0, event.ctrlKey);
    });
    const copy = element("button", "sound-copy");
    copy.type = "button";
    copy.append(element("strong", "", sound.name));
    const meta = [Sounds.formatSeconds(sound.seconds), sound.ext !== "wav" ? sound.ext.toUpperCase() : "", sound.kind === "windows" ? "plays in Windows" : ""];
    const level = soundState.levels.get(sound.id);
    copy.append(element("small", "", meta.filter(Boolean).join(" · ") || " "));
    if (level) copy.append(element("em", "sound-level", Sounds.formatDb(level.rmsDb).replace(" dB", "")));
    copy.title = "Ctrl + click to layer it over what's playing";
    if (soundState.selecting) {
        // Select: the tile's body picks it; its play button still plays.
        const leveled = Sounds.isLeveledCopy(sound.id);
        const uses = leveled ? soundUses(sound.id) : [];
        const picked = soundState.picked.has(sound.id);
        tile.classList.add(!leveled ? "is-unpickable" : uses.length ? "is-locked" : "is-pickable");
        tile.classList.toggle("is-picked", picked);
        if (leveled) {
            const box = element("span", "sound-check");
            box.setAttribute("aria-hidden", "true");
            copy.prepend(box);
            copy.setAttribute("role", "checkbox");
            copy.setAttribute("aria-checked", String(picked));
            copy.title = uses.length ? `Used for ${uses.join(", ")}: restore or change that first` : "Click to select; Shift + click selects a range";
            copy.disabled = uses.length > 0;
        } else {
            copy.title = "Only leveled copies can be deleted";
            copy.disabled = true;
        }
        copy.addEventListener("click", event => togglePick(sound.id, event.shiftKey));
    } else {
        copy.addEventListener("click", event => {
            selectSound(sound.id);
            playSound(sound.id, 0, event.ctrlKey);
        });
    }
    const star = element("button", `sound-star${soundPrefs.favorites.has(sound.id) ? " is-on" : ""}`, soundPrefs.favorites.has(sound.id) ? "♥" : "♡");
    star.type = "button";
    star.title = soundPrefs.favorites.has(sound.id) ? "Remove from favorites" : "Add to favorites";
    star.setAttribute("aria-pressed", String(soundPrefs.favorites.has(sound.id)));
    star.addEventListener("click", event => {
        event.stopPropagation();
        toggleFavorite(sound.id);
    });
    tile.append(play, copy, star);
    return tile;
}

// ---- Select (1.8.0): several leveled copies deleted at once
// Only leveled copies that nothing plays can be picked; ASCS checks each one
// again when deleting.
function selectableIds() {
    return visibleSounds().filter(sound => Sounds.isLeveledCopy(sound.id) && !soundUses(sound.id).length).map(sound => sound.id);
}

function setSelecting(on) {
    if (soundState.deleting) return;
    soundState.selecting = on;
    soundState.picked.clear();
    soundState.anchor = "";
    renderSounds();
}

function togglePick(id, range) {
    if (soundState.deleting) return;
    const allowed = new Set(selectableIds());
    if (!allowed.has(id)) return;
    if (range && soundState.anchor) {
        // In the order shown on the page, which groups the sounds.
        const order = [...document.querySelectorAll("#soundGroups .sound-tile")].map(tile => tile.dataset.soundId);
        Sounds.rangeIds(order, soundState.anchor, id).filter(other => allowed.has(other)).forEach(other => soundState.picked.add(other));
    } else if (soundState.picked.has(id)) {
        soundState.picked.delete(id);
    } else {
        soundState.picked.add(id);
    }
    if (soundState.picked.size > SELECT_LIMIT) {
        [...soundState.picked].slice(SELECT_LIMIT).forEach(other => soundState.picked.delete(other));
        showNotice(`Up to ${SELECT_LIMIT} at a time.`);
    }
    soundState.anchor = id;
    renderPicks();
}

// Updates the tiles and the bar without rebuilding the list.
function renderPicks() {
    document.querySelectorAll("#soundGroups .sound-tile").forEach(tile => {
        const picked = soundState.picked.has(tile.dataset.soundId);
        tile.classList.toggle("is-picked", picked);
        tile.querySelector(".sound-copy[role='checkbox']")?.setAttribute("aria-checked", String(picked));
    });
    renderSelectBar();
}

function renderSelectBar() {
    const bar = $("soundSelectBar");
    bar.hidden = !soundState.selecting;
    if (!soundState.selecting) return;
    const count = soundState.picked.size;
    const all = selectableIds().slice(0, SELECT_LIMIT);
    const progress = soundState.deleting;
    const button = (label, className, onClick, disabled = false) => {
        const node = element("button", className, label);
        node.type = "button";
        node.disabled = disabled;
        node.addEventListener("click", onClick);
        return node;
    };
    const everything = all.length > 0 && all.every(id => soundState.picked.has(id));
    const status = element("span", "sound-select-status");
    status.append(element("strong", "", progress ? `Deleting ${progress.done} of ${progress.total}…` : `${count} selected`),
        element("small", "", progress ? "" : "Shift + click selects a range · Esc to finish"));
    bar.replaceChildren(
        status,
        button(everything ? "Select none" : "Select all", "secondary", () => {
            if (everything) soundState.picked.clear(); else all.forEach(id => soundState.picked.add(id));
            renderPicks();
        }, Boolean(progress) || !all.length),
        button(`Delete${count ? ` (${count})` : ""}`, "secondary danger", deletePicked, Boolean(progress) || !count),
        button("Done", "secondary", () => setSelecting(false), Boolean(progress))
    );
}

async function deletePicked() {
    const ids = [...soundState.picked];
    if (!ids.length || soundState.deleting) return;
    const names = ids.map(id => soundState.library?.byId.get(id)?.name || id);
    const ok = await confirmDialog({
        title: `Delete ${ids.length} leveled ${ids.length === 1 ? "copy" : "copies"}?`,
        message: `${names.slice(0, 5).join(", ")}${names.length > 5 ? ` and ${names.length - 5} more` : ""} go to the Recycle Bin. The sounds they were made from aren't touched.`,
        confirmLabel: `Delete ${ids.length}`, danger: true
    });
    if (!ok) return;
    soundState.deleting = { done: 0, total: ids.length };
    renderSelectBar();
    let deleted = 0, failure = "";
    const skipped = [];
    for (let start = 0; start < ids.length; start += DELETE_BATCH) {
        const batch = ids.slice(start, start + DELETE_BATCH);
        try {
            const reply = await deleteBatch(batch);
            deleted += reply.deleted;
            skipped.push(...reply.skipped);
            if (!reply.ok) {
                failure = reply.message || "ASCS refused the request";
                break;
            }
        } catch (error) {
            failure = error.message;
            break;
        }
        soundState.deleting.done = start + batch.length;
        renderSelectBar();
    }
    soundState.deleting = null;
    soundState.selecting = false;
    soundState.picked.clear();
    soundState.anchor = "";
    send("GetSoundLibrary", "refresh");          // once, after every batch
    const parts = [`Moved ${deleted} ${deleted === 1 ? "copy" : "copies"} to the Recycle Bin`];
    if (skipped.length) parts.push(`${skipped.length} skipped (${skipped.every(item => /plays it now/.test(item.reason)) ? "in use" : skipped[0].reason.replace(/\.$/, "")})`);
    if (failure) parts.push(`stopped: ${failure.replace(/\.$/, "")}`);
    showNotice(`${parts.join("; ")}.`);
    renderSounds();
}

// One batch, answered by ASCS with soundsDeleted.
function deleteBatch(batch) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { soundState.deleteWait = null; reject(new Error("ASCS didn't answer")); }, 20000);
        soundState.deleteWait = reply => { clearTimeout(timer); soundState.deleteWait = null; resolve(reply); };
        if (!send("DeleteLeveledSounds", batch.join("\n"))) {
            clearTimeout(timer);
            soundState.deleteWait = null;
            reject(new Error("ASCS isn't connected"));
        }
    });
}

function handleSoundsDeleted(data) {
    soundState.deleteWait?.({
        ok: data.ok === true,
        deleted: Number.isFinite(data.deleted) ? data.deleted : 0,
        skipped: (Array.isArray(data.skipped) ? data.skipped : []).filter(item => item && typeof item.reason === "string"),
        message: typeof data.message === "string" ? data.message : ""
    });
}

function toggleFavorite(id) {
    if (soundPrefs.favorites.has(id)) soundPrefs.favorites.delete(id);
    else soundPrefs.favorites.add(id);
    saveSoundPrefs();
    renderSounds();
}

function selectSound(id) {
    if (soundState.sideTab !== "selected") showSoundTab("selected");
    if (soundState.selected === id) return;
    soundState.selected = id;
    soundState.plan = null;
    document.querySelectorAll(".sound-tile").forEach(tile => tile.classList.toggle("is-selected", tile.dataset.soundId === id));
    renderSoundDetail();
}

// What the selected sound is used for: Windows events and ASCS's sounds.
function soundUses(id) {
    const uses = soundState.windowsSounds.filter(event => event.id === id).map(event => event.label);
    if (soundState.ascsSounds?.show?.id === id) uses.push("ASCS show");
    if (soundState.ascsSounds?.hide?.id === id) uses.push("ASCS hide");
    if (soundState.ascsSounds?.reminder?.id === id) uses.push("Calendar reminders");
    if (soundState.startup.signin.some(item => item.id === id)) uses.push("Sign-in sounds");
    if (soundState.startup.shutdown?.id === id) uses.push("Shutdown sound");
    return uses;
}

function renderSoundDetail() {
    const panel = $("soundDetail");
    const sound = soundState.library?.byId.get(soundState.selected);
    if (!sound) {
        panel.replaceChildren(element("p", "settings-note", "Click a sound to play it. Its level, a leveled copy, and where to use it appear here."));
        return;
    }
    const level = soundState.levels.get(sound.id);
    const wav = sound.ext === "wav";
    // 1.8.1: a leveled copy is leveled again from the original it was made
    // from, with one gain worked out from that original (never stacked).
    const original = sound.origin ? soundState.library.byId.get(sound.origin) : null;
    const source = original?.ext === "wav" ? original : sound;
    const sourceLevel = source === sound ? level : soundState.levels.get(source.id);
    if (source !== sound && !sourceLevel) {
        measureSound(source.id).then(() => { if (soundState.selected === sound.id) renderSoundDetail(); }, () => {});
    }
    panel.replaceChildren();
    const head = element("div", "sound-detail-head");
    const title = element("strong", "", sound.name);
    title.title = sound.id;
    head.append(title, element("small", "", [sound.eraLabel, sound.group, Sounds.formatSeconds(sound.seconds), sound.ext.toUpperCase()].filter(Boolean).join(" · ")));
    const uses = soundUses(sound.id);
    if (uses.length) head.append(element("small", "sound-uses", `Used for ${uses.join(", ")}`));
    panel.append(head);

    const actions = element("div", "sound-actions");
    const button = (label, onClick, className = "secondary") => {
        const node = element("button", className, label);
        node.type = "button";
        node.addEventListener("click", onClick);
        actions.append(node);
        return node;
    };
    button("Play", event => playSound(sound.id, 0, event.ctrlKey)).title = "Ctrl + click to layer it over what's playing";
    const favorite = button(soundPrefs.favorites.has(sound.id) ? "♥ Favorite" : "♡ Favorite", () => toggleFavorite(sound.id));
    favorite.classList.toggle("is-favorite", soundPrefs.favorites.has(sound.id));
    favorite.setAttribute("aria-pressed", String(soundPrefs.favorites.has(sound.id)));
    button("Show file", () => send("ShowSoundFile", sound.id));
    // A leveled copy ASCS made can be deleted here (to the Recycle Bin), once
    // nothing plays it; ASCS checks the same again.
    if (Sounds.isLeveledCopy(sound.id)) {
        const remove = button("Delete", async () => {
            const ok = await confirmDialog({
                title: "Delete this leveled copy?",
                message: `"${sound.name}" goes to the Recycle Bin. The sound it was made from isn't touched.`,
                confirmLabel: "Delete", danger: true
            });
            if (ok) send("DeleteLeveledSound", sound.id);
        }, "secondary danger");
        if (uses.length) {
            remove.disabled = true;
            remove.title = `Used for ${uses.join(", ")}: restore or change that first`;
        }
    }
    panel.append(actions);

    // Levels
    const levels = element("div", "sound-levels");
    levels.append(element("h3", "", "Level"));
    if (sound.kind === "windows") {
        levels.append(element("p", "settings-note", "MIDI and WMA sounds play through Windows and can't be measured here."));
    } else if (!level) {
        levels.append(element("p", "settings-note", "Measuring…"));
        measureSound(sound.id).then(() => {
            if (soundState.selected === sound.id) renderSoundDetail();
        }, error => {
            if (soundState.selected === sound.id) levels.replaceChildren(element("h3", "", "Level"), element("p", "settings-note", `Couldn't measure it: ${error.message}`));
        });
    } else {
        const meters = element("div", "sound-meters");
        meters.append(meterRow("RMS", level.rmsDb, soundPrefs.reference), meterRow("Peak", level.peakDb, null));
        levels.append(meters);
        const versus = Sounds.compareToTarget(level, soundPrefs.notifyTarget);
        if (versus) {
            levels.append(element("p", "sound-loudness",
                `Loudness ${level.lufs.toFixed(1)} LUFS · ${versus.matched ? "matches" : `${Math.abs(versus.difference).toFixed(1)} dB ${versus.difference > 0 ? "louder than" : "quieter than"}`} the notification level (${soundPrefs.notifyTarget.toFixed(1)})`));
        }

        const reference = element("div", "sound-reference");
        const field = element("label", "sound-reference-field");
        const input = element("input");
        input.type = "number";
        input.step = "0.1";
        input.min = "-60";
        input.max = "0";
        input.value = soundPrefs.reference.toFixed(1);
        input.addEventListener("change", () => {
            const value = Number(input.value);
            if (Number.isFinite(value)) {
                soundPrefs.reference = Math.max(-60, Math.min(0, value));
                saveSoundPrefs();
            }
            renderSoundDetail();
        });
        field.append(element("span", "", "Target RMS"), input, element("span", "", "dB"));
        reference.append(field);
        const presets = element("div", "sound-presets");
        presets.setAttribute("aria-label", "Set the target");
        const thisLevel = Math.round(level.rmsDb * 10) / 10;
        [["Your startup sounds", -26.4, "The level your startup sounds were matched to"],
            ["Your ASCS sounds", -33.7, "The level of your ASCS show and hide sounds"],
            ["This sound", thisLevel, "Make this sound's level the target, then level others to match it"]].forEach(([name, value, hint]) => {
            if (!Number.isFinite(value)) return;
            const chip = element("button", `sound-preset${Math.abs(soundPrefs.reference - value) < 0.05 ? " is-on" : ""}`);
            chip.type = "button";
            chip.title = hint;
            chip.append(element("span", "", name), element("b", "", Sounds.formatDb(value).replace(" dB", "")));
            chip.addEventListener("click", () => { soundPrefs.reference = value; saveSoundPrefs(); renderSoundDetail(); });
            presets.append(chip);
        });
        reference.append(presets);
        const clip = element("label", "sound-clip");
        const box = element("input");
        box.type = "checkbox";
        box.checked = soundPrefs.avoidClipping;
        box.addEventListener("change", () => { soundPrefs.avoidClipping = box.checked; saveSoundPrefs(); renderSoundDetail(); });
        clip.append(box, element("span", "", " Never clip (keep the peak at −0.3 dB or below)"));
        reference.append(clip);
        levels.append(reference);

        const plan = Sounds.planLevel(level, soundPrefs.reference, { avoidClipping: soundPrefs.avoidClipping });
        // What a saved copy is made from: the original, at its own total gain.
        const sourcePlan = source === sound ? plan : sourceLevel ? Sounds.planLevel(sourceLevel, soundPrefs.reference, { avoidClipping: soundPrefs.avoidClipping }) : null;
        soundState.plan = plan;
        if (plan) {
            const summary = element("p", `sound-plan${plan.limited || plan.clips ? " is-warning" : ""}`);
            summary.textContent = Math.abs(plan.gainDb) < 0.05
                ? "Already at the reference."
                : `Adjust by ${Sounds.formatDb(plan.gainDb)}: RMS becomes ${Sounds.formatDb(plan.resultRmsDb)}, peak ${Sounds.formatDb(plan.resultPeakDb)}`
                    + (plan.limited ? `. Held back to avoid clipping (${Sounds.formatDb(soundPrefs.reference - plan.resultRmsDb).replace("+", "")} short).` : "")
                    + (plan.clips ? ". This will clip." : "");
            levels.append(summary);
            if (source !== sound) {
                levels.append(element("p", "settings-note", sourcePlan
                    ? `A leveled copy of ${source.name} (${source.eraLabel || source.era}). A new copy is made from that original: ${Math.abs(sourcePlan.gainDb) < 0.05 ? "it's already at the reference" : `${Sounds.formatDb(sourcePlan.gainDb)} in all`}.`
                    : `A leveled copy of ${source.name}: measuring the original…`));
            }
            const row = element("div", "sound-actions");
            const preview = element("button", "secondary", "Preview leveled");
            preview.type = "button";
            preview.addEventListener("click", () => playSound(sound.id, plan.gainDb));
            const save = element("button", "primary", "Save leveled copy");
            save.type = "button";
            save.disabled = !wav || Math.abs(plan.gainDb) < 0.05 || !sourcePlan || Math.abs(sourcePlan.gainDb) < 0.05;
            save.title = wav ? "Saved in the library's ASCS Leveled folder; the original is never changed" : "Only WAV files can be leveled";
            save.addEventListener("click", () => saveLeveled(source, sourcePlan.gainDb, save));
            row.append(preview, save);
            levels.append(row);
            if (wav && !Sounds.parseWav(soundState.bytes.get(sound.id) || new ArrayBuffer(0)) && soundState.bytes.has(sound.id)) {
                levels.append(element("p", "settings-note", "This WAV is compressed (such as ADPCM), so a leveled copy can't be made from it."));
                save.disabled = true;
            }
        }
    }
    panel.append(levels);

    // Use as
    const use = element("div", "sound-use");
    use.append(element("h3", "", "Use as"));
    if (!wav) {
        use.append(element("p", "settings-note", "Windows and ASCS sounds must be WAV files."));
    } else {
        const select = element("select");
        select.setAttribute("aria-label", "Use this sound as");
        const placeholder = element("option", "", "Choose where to use it…");
        placeholder.value = "";
        placeholder.selected = true;
        placeholder.disabled = true;
        select.append(placeholder);
        const groupWindows = element("optgroup");
        groupWindows.label = "Windows";
        soundState.windowsSounds.forEach(event => {
            const option = element("option", "", event.label);
            option.value = `windows:${event.key}`;
            groupWindows.append(option);
        });
        const groupAscs = element("optgroup");
        groupAscs.label = "ASCS";
        [["ascs:show", "When ASCS shows"], ["ascs:hide", "When ASCS hides"], ["ascs:reminder", "Calendar reminders"]].forEach(([value, text]) => {
            const option = element("option", "", text);
            option.value = value;
            groupAscs.append(option);
        });
        const groupStartup = element("optgroup");
        groupStartup.label = "Startup";
        [["startup:add", "Sign-in sound (adds to the chance roll)"], ["startup:shutdown", "Shutdown sound"]].forEach(([value, text]) => {
            const option = element("option", "", text);
            option.value = value;
            groupStartup.append(option);
        });
        select.append(groupWindows, groupAscs, groupStartup);
        const assign = element("button", "secondary", "Use");
        assign.type = "button";
        assign.disabled = true;
        // Off the level for where it's going (startup sounds have their own):
        // use a matched copy unless unticked.
        const matchBox = element("input");
        matchBox.type = "checkbox";
        matchBox.checked = true;
        const matchLabel = element("label", "sound-clip");
        matchLabel.title = "Saves a leveled copy in ASCS Leveled and uses that; the original is never changed";
        matchLabel.hidden = true;
        let versus = null;
        const offerFor = value => {
            const startup = value.startsWith("startup:");
            const own = value === "startup:add" ? soundPrefs.levels[`startup:${sound.id}`] || 0 : ownLevel(value);
            versus = sourceLevel?.levelable ? Sounds.compareToTarget(sourceLevel, targetFor(value) + own) : null;
            const offer = Boolean(versus && !versus.matched && Math.abs(versus.gainDb) >= 0.05);
            matchLabel.hidden = !offer;
            const what = own ? `its own level, ${Sounds.formatDb(own)} from the ${startup ? "startup" : "notification"} level`
                : `the ${startup ? "startup" : "notification"} level`;
            if (offer) matchLabel.replaceChildren(matchBox, element("span", "",
                ` Match ${what} (${Sounds.formatDb(versus.gainDb)}${source !== sound ? " from the original" : ""}${versus.limited ? ", held back to avoid clipping" : ""})`));
            return offer;
        };
        select.addEventListener("change", () => {
            assign.disabled = !select.value;
            offerFor(select.value);
        });
        assign.addEventListener("click", async () => {
            const [target, key] = select.value.split(/:(.*)/s);
            if (offerFor(select.value) && matchBox.checked) {
                assign.disabled = true;
                try {
                    const gain = Math.max(-60, Math.min(60, versus.gainDb));
                    const copy = Sounds.applyGain(await soundBytes(source.id), gain);
                    if (!copy) throw new Error("only uncompressed WAV files can be leveled");
                    send("UseLeveledSound", `${target}:${key}|lib:${source.id}|${gain.toFixed(2)}|${Sounds.bytesToBase64(copy)}`);
                    send("GetSoundLibrary", "refresh");
                    showNotice(`${select.selectedOptions[0]?.textContent || "It"} now plays a matched copy of ${source.name} (${Sounds.formatDb(versus.gainDb)} from the original).`);
                } catch (error) {
                    showNotice(`Couldn't make the matched copy: ${error.message}`);
                }
                assign.disabled = false;
                return;
            }
            const plain = versus?.matched && source !== sound ? source : sound;
            if (target === "windows") send("SetWindowsSound", `${key}|${plain.id}`);
            else if (target === "ascs") send("SetAscsSound", `${key}|${plain.id}`);
            else if (target === "startup") send("SetStartupSound", `${key}|${plain.id}`);
        });
        const row = element("div", "sound-actions");
        row.append(select, assign);
        use.append(row, matchLabel);
    }
    panel.append(use);
}

function meterRow(label, db, reference) {
    const row = element("div", "sound-meter");
    const bar = element("span", "sound-meter-bar");
    const fill = element("b");
    // -60 dBFS to 0 across the bar.
    fill.style.width = `${Math.max(0, Math.min(100, ((Number.isFinite(db) ? db : -60) + 60) / 60 * 100))}%`;
    bar.append(fill);
    if (reference !== null) {
        const mark = element("i");
        mark.style.left = `${Math.max(0, Math.min(100, (reference + 60) / 60 * 100))}%`;
        mark.title = `Target ${Sounds.formatDb(reference)}`;
        bar.append(mark);
    }
    row.append(element("small", "", label), bar, element("strong", "", Sounds.formatDb(db)));
    return row;
}

async function saveLeveled(sound, gainDb, button) {
    button.disabled = true;
    try {
        const bytes = await soundBytes(sound.id);
        const copy = Sounds.applyGain(bytes, gainDb);
        if (!copy) throw new Error("only uncompressed WAV files can be leveled");
        send("SaveLeveledSound", `${sound.id}|${gainDb.toFixed(2)}|${Sounds.bytesToBase64(copy)}`);
    } catch (error) {
        showNotice(`Couldn't make the leveled copy: ${error.message}`);
        button.disabled = false;
    }
}

// ---- the notification level board (In use)
// Every sound in use (ASCS's own, then Windows events) measured as the ear
// hears it (LUFS) against one notification level. ASCS sends each file by
// its event name (never a path); Match saves a leveled copy in ASCS Leveled
// and switches the event to it, and Restore brings back what played before.

const NOTIFY_PRESETS = [["Quiet", -30], ["Balanced", -24], ["Clear", -18]];

function inUseRows() {
    const ascs = soundState.ascsSounds || {};
    const rows = [["show", "ASCS shows"], ["hide", "ASCS hides"], ["reminder", "Calendar reminders"]].map(([kind, label]) => {
        const entry = ascs[kind] || {};
        return { key: `ascs:${kind}`, label, file: entry.file || "", exists: entry.exists === true, changed: entry.changed === true,
            restore: () => send("RestoreAscsSound", kind) };
    });
    soundState.windowsSounds.forEach(event => rows.push({
        key: `windows:${event.key}`, label: event.label, file: event.file || "", exists: event.exists === true, changed: event.changed === true,
        restore: () => send("RestoreWindowsSound", event.key), preview: () => { stopWebSounds(); send("PreviewWindowsSound", event.key); }
    }));
    rows.forEach(row => { row.measurable = row.exists && /\.wav$/i.test(row.file); });
    return rows;
}

// A row's measurement is kept until the file it plays changes.
function forgetInUse(key) {
    soundState.inUse.delete(key);
    for (const id of [`use:${key}`, `origin:${key}`]) {
        soundState.bytes.delete(id);
        soundState.decoded.delete(id);
    }
}

// Startup sounds (1.8.1): the sign-in roll, each with its chance, then the
// shutdown sound. Each is named after the original it was leveled from.
function startupLabel(item) {
    const sound = soundState.library?.byId.get(item.origin || item.id);
    if (!sound) return item.file.replace(/\.wav$/i, "");
    return sound.eraLabel && !sound.name.includes(sound.eraLabel) ? `${sound.eraLabel} · ${sound.name}` : sound.name;
}

function startupRows() {
    const { signin, shutdown } = soundState.startup;
    const rows = signin.map((item, index) => ({
        key: `startup:${index + 1}`, label: startupLabel(item), file: item.file, exists: item.exists, changed: item.changed,
        weight: item.weight, index,
        restore: () => send("RestoreStartupSound", String(index + 1)),
        remove: signin.length > 1 ? () => send("RemoveStartupSound", String(index + 1)) : null
    }));
    if (shutdown) rows.push({ key: "startup:shutdown", label: `Shutdown · ${startupLabel(shutdown)}`, file: shutdown.file, exists: shutdown.exists,
        changed: shutdown.changed, restore: () => send("RestoreStartupSound", "shutdown") });
    rows.forEach(row => { row.measurable = row.exists && /\.wav$/i.test(row.file); });
    return rows;
}

// Which level a row is measured against: its board's, moved by the row's
// own level if it has one (1.8.1). Own levels belong to the place a sound
// plays (an event, ASCS's show sound, the shutdown sound), except sign-in
// sounds, which keep theirs by the original they're leveled from, so
// removing one doesn't hand its level to the next.
const targetFor = key => key.startsWith("startup:") ? soundPrefs.startupTarget : soundPrefs.notifyTarget;

function ownKey(key) {
    const slot = /^startup:(\d)$/.exec(key);
    if (!slot) return key;
    const item = soundState.startup.signin[Number(slot[1]) - 1];
    return item ? `startup:${item.origin || item.id}` : key;
}

const ownLevel = key => soundPrefs.levels[ownKey(key)] || 0;
const rowTarget = key => targetFor(key) + ownLevel(key);

function setOwnLevel(key, value) {
    const level = Sounds.snapOwnLevel(value);
    if (level) soundPrefs.levels[ownKey(key)] = level;
    else delete soundPrefs.levels[ownKey(key)];
    saveSoundPrefs();
    renderSoundAssignments();
}

async function measureInUse(row) {
    const id = `use:${row.key}`;
    const bytes = await soundBytes(id);
    const wav = Sounds.wavChannels(bytes);
    if (wav) {
        return { file: row.file, lufs: Sounds.measureLoudness(wav.channels, wav.rate), peakDb: Sounds.measureWav(bytes).peakDb, levelable: true };
    }
    const buffer = await decodedSound(id);       // compressed WAV: measured, but can't be leveled here
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    return { file: row.file, lufs: Sounds.measureLoudness(channels, buffer.sampleRate), peakDb: Sounds.measureChannels(channels).peakDb, levelable: false };
}

// Measures what isn't measured yet, one at a time, redrawing as it goes.
async function measureInUseSounds() {
    if (soundState.measuringInUse) return;
    soundState.measuringInUse = true;
    try {
        for (const row of [...inUseRows(), ...startupRows()]) {
            if (!row.measurable || soundState.inUse.get(row.key)?.file === row.file) continue;
            try {
                soundState.inUse.set(row.key, await measureInUse(row));
            } catch (error) {
                soundState.inUse.set(row.key, { file: row.file, error: error.message || "couldn't be measured" });
            }
            renderSoundAssignments();
        }
    } finally {
        soundState.measuringInUse = false;
    }
}

function inUseComparison(key) {
    const entry = soundState.inUse.get(key);
    return entry && !entry.error ? Sounds.compareToTarget(entry, rowTarget(key)) : null;
}

const describeDifference = compare => compare.matched ? "Matched"
    : `${Math.abs(compare.difference).toFixed(1)} dB ${compare.difference > 0 ? "louder" : "quieter"}`;

// Saves a leveled copy and switches the row to it; resolves once ASCS has
// answered. Since 1.8.1 the copy is made from the original behind what the
// row plays (ASCS sends it as "origin:<key>"), never from an earlier copy,
// so gains don't pile up.
async function matchInUse(row) {
    const compare = inUseComparison(row.key);
    const entry = soundState.inUse.get(row.key);
    if (!compare || !entry?.levelable || Math.abs(compare.gainDb) < 0.05) return { ok: false, skipped: true };
    let bytes, gain, limited;
    try {
        bytes = await soundBytes(`origin:${row.key}`);
        const wav = Sounds.wavChannels(bytes);
        if (!wav) throw new Error("only uncompressed WAV files can be leveled");
        const original = Sounds.compareToTarget({ lufs: Sounds.measureLoudness(wav.channels, wav.rate), peakDb: Sounds.measureWav(bytes).peakDb }, rowTarget(row.key));
        if (!original) throw new Error("the original couldn't be measured");
        gain = Math.max(-60, Math.min(60, original.gainDb));
        limited = original.limited;
    } catch (error) {
        return { ok: false, message: error.message };
    }
    // The original is already at the level: go back to it rather than copy it.
    if (Math.abs(gain) < 0.05 && row.changed) {
        row.restore();
        return { ok: true, limited: false };
    }
    const copy = Sounds.applyGain(bytes, gain);
    if (!copy) return { ok: false, message: "only uncompressed WAV files can be leveled" };
    return new Promise(resolve => {
        soundState.matchWaits.set(row.key, resolve);
        if (!send("UseLeveledSound", `${row.key}|origin|${gain.toFixed(2)}|${Sounds.bytesToBase64(copy)}`)) {
            soundState.matchWaits.delete(row.key);
            resolve({ ok: false, message: "ASCS didn't answer" });
        }
    }).then(result => ({ ...result, limited }));
}

function handleSoundMatched(data) {
    const resolve = soundState.matchWaits.get(data.target);
    soundState.matchWaits.delete(data.target);
    const message = typeof data.message === "string" ? data.message : "";
    if (resolve) resolve({ ok: data.ok === true, message });
    else if (data.ok !== true) showNotice(`The matched copy wasn't used: ${message}`);   // from Use as
}

// Rows are matched one after another; Match on another row while one is
// running queues it ("Queued"), and the notice covers them all.
async function matchRows(rows) {
    const queue = soundState.matchQueue;
    rows.forEach(row => {
        if (row.key !== soundState.matchingKey && !queue.some(queued => queued.key === row.key)) queue.push(row);
    });
    renderSoundAssignments();
    if (soundState.matching) return;
    soundState.matching = true;
    let matched = 0, held = 0;
    const failed = [];
    while (queue.length) {
        const row = queue.shift();
        soundState.matchingKey = row.key;
        renderSoundAssignments();
        const result = await matchInUse(row);
        if (result.ok) { matched++; if (result.limited) held++; }
        else if (!result.skipped) failed.push(`${row.label}: ${result.message}`);
    }
    soundState.matchingKey = "";
    soundState.matching = false;
    send("GetSoundLibrary", "refresh");          // the new copies join the library
    const parts = [];
    if (matched) parts.push(`Matched ${matched} sound${matched === 1 ? "" : "s"}`);
    if (held) parts.push(`${held} held back to avoid clipping`);
    if (failed.length) parts.push(`not matched: ${failed.join("; ")}`);
    if (parts.length) showNotice(`${parts.join("; ")}.${matched ? " Restore undoes any of them." : ""}`);
    renderSoundAssignments();
}

// Plays a sound in use; resolves when it ends (or is stopped).
async function playInUse(key, token = ++soundState.playToken) {
    stopSounds();
    const buffer = await decodedSound(`use:${key}`);
    if (token !== soundState.playToken) return;
    const context = audioContext();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(soundState.master);
    soundState.playing.add(source);
    await new Promise(resolve => {
        source.onended = () => { soundState.playing.delete(source); resolve(); };
        source.start();
    });
}

// Play all: each measured sound in turn, to hear them side by side. Stop
// all (or playing anything else) ends it.
async function playAllInUse(rowsOf = inUseRows) {
    const token = ++soundState.playToken;
    for (const row of rowsOf()) {
        if (!soundState.inUse.get(row.key) || soundState.inUse.get(row.key).error) continue;
        if (token !== soundState.playToken) return;
        soundState.playingRow = row.key;
        renderSoundAssignments();
        try { await playInUse(row.key, token); } catch { /* skipped */ }
        if (token !== soundState.playToken) break;
        await new Promise(resolve => setTimeout(resolve, 350));
    }
    soundState.playingRow = "";
    renderSoundAssignments();
}

function setNotifyTarget(value) {
    soundPrefs.notifyTarget = Math.max(-40, Math.min(-10, Math.round(value * 10) / 10));
    saveSoundPrefs();
    renderSoundAssignments();
    renderSoundDetail();
}

async function resetAllLevels() {
    const changes = Sounds.levelChanges(soundPrefs);
    if (!changes.length) return;
    const ok = await confirmDialog({
        title: "Reset all levels?",
        message: `${changes.join("; ")}. No sound changes: each keeps playing what it plays now, so rows may read louder or quieter until you Match them.`,
        confirmLabel: "Reset levels"
    });
    if (!ok) return;
    const { notifyTarget, startupTarget, reference } = Sounds.LEVEL_DEFAULTS;
    Object.assign(soundPrefs, { notifyTarget, startupTarget, reference, levels: {} });
    soundState.ownEditing = "";
    soundState.ownDraft = null;
    saveSoundPrefs();
    renderSoundAssignments();
    renderSoundDetail();
    showNotice("Levels are back to their defaults.");
}

function setStartupTarget(value) {
    soundPrefs.startupTarget = Math.max(-40, Math.min(-10, Math.round(value * 10) / 10));
    saveSoundPrefs();
    renderSoundAssignments();
}

// The two boards (1.8.1): notifications (In use) and startup sounds
// (Startup), drawn by one renderer, each with its own level.
const NOTIFY_BOARD = {
    panel: "soundAssignments", count: "soundInUseCount", title: "Notification level", rows: () => inUseRows(),
    target: () => soundPrefs.notifyTarget, setTarget: value => setNotifyTarget(value), presets: () => NOTIFY_PRESETS,
    note: "Loudness as the ear hears it (LUFS). Within ±1.5 dB of the target counts as matched; Match saves a leveled copy and switches to it, and Restore goes back. Drag a sound's gold handle to give it its own level.",
    restoreAll: changed => {
        const button = element("button", "link-button is-danger", `Restore all (${changed.length})`);
        button.type = "button";
        button.title = "Every sound ASCS changed goes back to what it played before";
        button.addEventListener("click", async () => {
            const ok = await confirmDialog({
                title: "Restore all sounds?",
                message: `${changed.map(row => row.label).join(", ")} go back to what they played before ASCS changed them. Leveled copies stay in the library.`,
                confirmLabel: "Restore all", danger: true
            });
            if (ok) send("RestoreAllSounds");
        });
        return button;
    }
};

const STARTUP_PRESETS = [["Quiet", -24], ["Balanced", -20], ["Bold", -16]];
const STARTUP_BOARD = {
    panel: "soundStartup", count: "soundStartupCount", title: "Startup level", rows: () => startupRows(),
    target: () => soundPrefs.startupTarget, setTarget: value => setStartupTarget(value),
    // "Like XP": the level of the XP startup sound's original, once measured.
    presets: () => {
        const xp = startupRows().find(row => /xp startup/i.test(row.label));
        const measured = xp && !xp.changed ? soundState.inUse.get(xp.key) : null;
        return [...STARTUP_PRESETS, ...(measured?.lufs > -70 ? [["Like XP", Math.round(measured.lufs * 10) / 10]] : [])];
    },
    note: "The sounds played at Windows sign-in (one picked by chance) and at shutdown, by the scripts in C:\\Scripts, which read them from ASCS. Add sounds with Selected sound › Use as. Match levels a copy of the original; Restore goes back to it. Drag a sound's gold handle to give it its own level.",
    restoreAll: changed => {
        const button = element("button", "link-button is-danger", `Restore all (${changed.length})`);
        button.type = "button";
        button.title = "Every startup sound goes back to its original";
        button.addEventListener("click", () => send("RestoreStartupSound", "all"));
        return button;
    },
    head: head => {
        if (soundState.startup.taskWarning) head.append(element("p", "startup-task-warning", soundState.startup.taskWarning));
        head.append(startupOddsLine());
    }
};

function renderSoundAssignments() {
    renderBoard(NOTIFY_BOARD);
    renderBoard(STARTUP_BOARD);
    if (soundState.sideTab === "inuse" || soundState.sideTab === "startup") measureInUseSounds();
}

// ---- the sign-in chances (1.8.1)
// Whole percentages beside each sign-in sound; saved once they add up to 100.
function startupOdds() {
    return soundState.oddsDraft || soundState.startup.signin.map(item => item.weight);
}

function startupOddsLine() {
    const odds = startupOdds();
    const total = odds.reduce((sum, value) => sum + value, 0);
    const line = element("p", `startup-odds-total${total === 100 ? "" : " is-off"}`);
    line.textContent = total === 100
        ? `Sign-in chances add up to 100%. ${soundState.oddsDraft ? "Saving…" : "Saved."}`
        : `Sign-in chances add up to ${total}%: make them 100% to save.`;
    return line;
}

function oddsInput(row) {
    const input = element("input", "startup-odds");
    input.type = "number";
    input.min = "0";
    input.max = "100";
    input.step = "1";
    input.value = String(startupOdds()[row.index] ?? 0);
    input.dataset.oddsIndex = String(row.index);
    input.setAttribute("aria-label", `Chance of ${row.label} at sign-in, in percent`);
    input.title = "Chance at sign-in, in percent";
    input.addEventListener("input", () => {
        const odds = [...startupOdds()];
        odds[row.index] = Math.max(0, Math.min(100, Math.round(Number(input.value) || 0)));
        soundState.oddsDraft = odds;
        clearTimeout(soundState.oddsTimer);
        if (odds.reduce((sum, value) => sum + value, 0) === 100) {
            soundState.oddsTimer = setTimeout(() => send("SaveStartupOdds", odds.join(",")), 600);
        }
        renderBoard(STARTUP_BOARD);
    });
    return input;
}

function renderBoard(board) {
    const panel = $(board.panel);
    const rows = board.rows();
    const target = board.target();
    const measured = rows.filter(row => inUseComparison(row.key));
    const off = measured.filter(row => !inUseComparison(row.key).matched && soundState.inUse.get(row.key).levelable
        && Math.abs(inUseComparison(row.key).gainDb) >= 0.05);

    // The target, with presets, and what to do about it.
    const head = element("div", "notify-head");
    const title = element("div", "notify-title");
    title.append(element("h3", "", board.title));
    const stepper = element("div", "notify-stepper");
    const step = (label, delta, hint) => {
        const button = element("button", "secondary", label);
        button.type = "button";
        button.title = hint;
        button.addEventListener("click", () => board.setTarget(target + delta));
        return button;
    };
    stepper.append(step("−", -1, "1 dB quieter"), element("strong", "", `${target.toFixed(1)} LUFS`), step("+", 1, "1 dB louder"));
    title.append(stepper);
    head.append(title);
    const presets = element("div", "sound-presets");
    const loudness = measured.map(row => soundState.inUse.get(row.key).lufs).sort((a, b) => a - b);
    const middle = loudness.length ? Math.round(loudness[Math.floor((loudness.length - 1) / 2)] * 10) / 10 : null;
    [...board.presets(), ...(middle !== null ? [["Middle of yours", middle]] : [])].forEach(([name, value]) => {
        const chip = element("button", `sound-preset${Math.abs(target - value) < 0.05 ? " is-on" : ""}`);
        chip.type = "button";
        chip.title = name === "Middle of yours" ? "The median of the sounds below: matching to it changes the fewest" : `${value} LUFS`;
        chip.append(element("span", "", name), element("b", "", value.toFixed(1)));
        chip.addEventListener("click", () => board.setTarget(value));
        presets.append(chip);
    });
    head.append(presets);
    head.append(element("p", "settings-note", board.note));
    board.head?.(head);
    const actions = element("div", "notify-actions");
    const pending = rows.filter(row => row.measurable && soundState.inUse.get(row.key)?.file !== row.file).length;
    actions.append(element("span", "notify-summary",
        pending ? `Measuring… ${measured.length} of ${measured.length + pending}` : `${measured.length - off.length} of ${measured.length} matched`));
    const playAll = element("button", "secondary", soundState.playingRow ? "Stop" : "Play all");
    playAll.type = "button";
    playAll.disabled = !measured.length;
    playAll.addEventListener("click", () => (soundState.playingRow ? stopAllSounds() : playAllInUse(board.rows)));
    const matchAll = element("button", "primary", soundState.matching ? "Matching…" : `Match all${off.length ? ` (${off.length})` : ""}`);
    matchAll.type = "button";
    matchAll.disabled = !off.length || off.every(row => row.key === soundState.matchingKey || soundState.matchQueue.some(item => item.key === row.key));
    matchAll.addEventListener("click", () => matchRows(off));
    actions.append(playAll, matchAll);
    head.append(actions);
    // The rarer, undoing actions sit beneath as links (1.8.1): Reset levels
    // (the levels and own levels back to their defaults, on either board;
    // sound files stay as they are) and Restore all.
    const tools = element("div", "notify-tools");
    if (Sounds.levelChanges(soundPrefs).length) {
        const reset = element("button", "link-button", "Reset levels");
        reset.type = "button";
        reset.title = "The notification and startup levels, Target RMS and every own level back to their defaults; no sound changes";
        reset.addEventListener("click", resetAllLevels);
        tools.append(reset);
    }
    const changed = rows.filter(row => row.changed);
    if (changed.length) tools.append(board.restoreAll(changed));
    if (tools.childElementCount) head.append(tools);

    const list = element("div", "sound-assignments");
    rows.forEach(row => {
        const item = element("div", `sound-assignment${soundState.playingRow === row.key ? " is-playing" : ""}`);
        const copy = element("span", "sound-assignment-copy");
        copy.title = row.file ? `${row.label} · ${row.file}` : row.label;
        copy.append(element("strong", "", row.label), element("small", row.exists || !row.file ? "" : "is-missing", row.file ? (row.exists ? row.file : `${row.file} (missing)`) : "No sound"));
        const buttons = element("span", "sound-assignment-actions");
        const link = (label, onClick, hint = "") => {
            const button = element("button", "link-button", label);
            button.type = "button";
            if (hint) button.title = hint;
            button.addEventListener("click", onClick);
            buttons.append(button);
            return button;
        };
        const entry = soundState.inUse.get(row.key);
        const compare = inUseComparison(row.key);
        if (row.exists && row.file) link("Play", () => (entry && !entry.error ? playInUse(row.key) : row.preview ? row.preview() : null));
        if (compare && !compare.matched && entry.levelable && Math.abs(compare.gainDb) >= 0.05) {
            const queued = soundState.matchQueue.some(item => item.key === row.key);
            const running = soundState.matchingKey === row.key;
            const match = link(running ? "Matching…" : queued ? "Queued" : "Match", () => matchRows([row]), `Save a copy ${Sounds.formatDb(compare.gainDb)} and use it${compare.limited ? " (held back to avoid clipping)" : ""}`);
            match.disabled = running || queued;
        }
        if (row.changed) link("Restore", row.restore, "Back to the sound it had before ASCS changed it");
        if (row.remove) link("Remove", row.remove, "Take it out of the sign-in sounds; its chance goes to the first one");
        const own = ownLevel(row.key);
        item.append(copy, buttons);
        // A sign-in sound's chance, in its own column at the left.
        if (row.weight !== undefined) {
            const odds = element("label", "startup-odds-wrap");
            odds.append(oddsInput(row), element("span", "", "%"));
            item.classList.add("has-odds");
            item.prepend(odds);
        }
        // The meter: the target in the middle, ±12 dB to either side.
        const meter = element("div", "notify-meter");
        const bar = element("span", "notify-bar");
        bar.append(element("i"));
        const status = element("small", "notify-status");
        if (row.measurable || compare) bar.append(ownHandle(row, bar, own));
        if (compare) {
            const dot = element("b", compare.matched ? "is-matched" : compare.difference > 0 ? "is-loud" : "is-quiet");
            // The bar is centered on the board's level; the dot is where the sound is.
            dot.style.left = `${Math.max(0, Math.min(100, 50 + (compare.difference + own) / 12 * 50))}%`;
            bar.append(dot);
            status.textContent = describeDifference(compare);
            status.className = `notify-status${compare.matched ? " is-matched" : ""}`;
            status.title = `${entry.lufs.toFixed(1)} LUFS, peak ${Sounds.formatDb(entry.peakDb)}${entry.levelable ? "" : " · compressed WAV: can't be leveled here"}${compare.limited && !compare.matched ? " · can only be raised until the peak reaches −0.3 dB" : ""}`;
        } else {
            status.textContent = entry?.error ? "Can't measure" : !row.measurable ? (row.file ? "Not a WAV" : "") : "Measuring…";
            if (entry?.error) status.title = entry.error;
        }
        // A slot of the same width on every row, so the bars line up.
        const slot = element("span", "notify-own-slot");
        if (soundState.ownEditing === row.key) slot.append(ownInput(row));
        else if (own) {
            const label = element("button", "link-button notify-own-label", `Own ${Sounds.formatDb(own)}`);
            label.type = "button";
            label.title = "This sound's own level, from the board's. Click to type one.";
            label.addEventListener("click", () => { soundState.ownEditing = row.key; renderSoundAssignments(); });
            const reset = element("button", "notify-own-reset", "×");
            reset.type = "button";
            reset.title = "Back to the board's level";
            reset.setAttribute("aria-label", `${row.label}: back to the board's level`);
            reset.addEventListener("click", () => setOwnLevel(row.key, 0));
            slot.append(label, reset);
        }
        meter.append(bar, slot, status);
        if (row.measurable || compare) item.append(meter);
        list.append(item);
    });
    $(board.count).textContent = `${rows.length}`;
    // Typing a chance, or stepping a level, redraws the board: keep the focus
    // where it was.
    const focusData = document.activeElement?.dataset || {};
    const selector = focusData.oddsIndex !== undefined ? `input[data-odds-index="${focusData.oddsIndex}"]`
        : focusData.ownKey !== undefined ? `[data-own-key="${CSS.escape(focusData.ownKey)}"]` : "";
    const hadFocus = selector && panel.contains(document.activeElement);
    panel.replaceChildren(head, list);
    const editing = soundState.ownEditing ? panel.querySelector(`input[data-own-key="${CSS.escape(soundState.ownEditing)}"]`) : null;
    const refocus = editing || (hadFocus ? panel.querySelector(selector) : null);
    if (refocus && document.activeElement !== refocus) {
        refocus.focus();
        if (refocus.tagName === "INPUT") {
            const end = refocus.value.length;
            try { refocus.setSelectionRange(end, end); } catch { /* number inputs have no selection */ }
        }
    }
}

// ---- own levels (1.8.1)
// A gold handle on each row's bar sets that sound's own level, from -12 to
// +12 dB around the board's (the middle of the bar). Dragging moves it in
// half-dB steps, drawn in place and saved on release; the arrow keys step
// 0.5 dB (Page Up and Down 3 dB), Home or a double-click goes back to the
// board's level, and Enter types one.
function ownHandle(row, bar, own) {
    const handle = element("button", `notify-own${own ? " is-set" : ""}`);
    handle.type = "button";
    handle.dataset.ownKey = row.key;
    handle.setAttribute("role", "slider");
    handle.setAttribute("aria-label", `${row.label}: own level`);
    handle.setAttribute("aria-valuemin", "-12");
    handle.setAttribute("aria-valuemax", "12");
    handle.setAttribute("aria-valuenow", String(own));
    handle.setAttribute("aria-valuetext", own ? `${Sounds.formatDb(own)} from the board's level` : "The board's level");
    handle.title = own ? `Own level ${Sounds.formatDb(own)}: drag to change, double-click for the board's level`
        : "Drag to give this sound its own level (Enter to type one)";
    const place = value => { handle.style.left = `${Sounds.ownLevelAt(value) * 100}%`; };
    place(own);
    let dragging = null;
    handle.addEventListener("pointerdown", event => {
        if (event.button !== 0) return;
        event.preventDefault();
        handle.focus();
        try { handle.setPointerCapture(event.pointerId); } catch { /* a pointer that is already gone */ }
        dragging = { value: own, moved: false };
        handle.classList.add("is-dragging");
    });
    handle.addEventListener("pointermove", event => {
        if (!dragging) return;
        const rect = bar.getBoundingClientRect();
        const value = Sounds.ownLevelFromFraction((event.clientX - rect.left) / Math.max(1, rect.width));
        if (value === dragging.value) return;
        dragging = { value, moved: true };
        place(value);
        handle.title = value ? `Own level ${Sounds.formatDb(value)}` : "The board's level";
        const label = bar.parentElement?.querySelector(".notify-own-slot");
        if (label) label.textContent = value ? `Own ${Sounds.formatDb(value)}` : "";
    });
    const finish = () => {
        if (!dragging) return;
        const { value, moved } = dragging;
        dragging = null;
        if (moved && value !== own) setOwnLevel(row.key, value);
        else handle.classList.remove("is-dragging");
    };
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
    handle.addEventListener("dblclick", () => { if (own) setOwnLevel(row.key, 0); });
    handle.addEventListener("keydown", event => {
        const steps = { ArrowRight: 0.5, ArrowUp: 0.5, ArrowLeft: -0.5, ArrowDown: -0.5, PageUp: 3, PageDown: -3 };
        if (event.key in steps) setOwnLevel(row.key, own + steps[event.key]);
        else if (event.key === "Home" || event.key === "Delete" || event.key === "Backspace") setOwnLevel(row.key, 0);
        else if (event.key === "Enter") { soundState.ownEditing = row.key; renderSoundAssignments(); }
        else return;
        event.preventDefault();
    });
    return handle;
}

function ownInput(row) {
    const input = element("input", "notify-own-input");
    input.type = "number";
    input.min = "-12";
    input.max = "12";
    input.step = "0.5";
    input.value = String(soundState.ownDraft ?? ownLevel(row.key));
    input.dataset.ownKey = row.key;
    input.setAttribute("aria-label", `${row.label}: own level in dB from the board's`);
    input.title = "dB from the board's level (−12 to +12). Enter to keep, Esc to cancel.";
    input.addEventListener("input", () => { soundState.ownDraft = input.value; });
    const done = keep => {
        if (soundState.ownEditing !== row.key) return;
        soundState.ownEditing = "";
        soundState.ownDraft = null;
        if (keep && input.value.trim() !== "") setOwnLevel(row.key, Number(input.value));
        else renderSoundAssignments();
    };
    input.addEventListener("keydown", event => {
        if (event.key === "Enter") { event.preventDefault(); done(true); }
        else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); done(false); }
    });
    input.addEventListener("blur", () => setTimeout(() => {
        // A redraw also blurs it; only a real move elsewhere ends typing.
        if (soundState.ownEditing === row.key && !document.activeElement?.matches?.(`input[data-own-key="${CSS.escape(row.key)}"]`)) done(true);
    }, 0));
    return input;
}

async function measureVisibleSounds() {
    if (soundState.measuring) return;
    soundState.measuring = true;
    const button = $("soundMeasureAll");
    button.disabled = true;
    const sounds = visibleSounds().filter(sound => sound.kind === "web").slice(0, 200);
    let done = 0;
    for (const sound of sounds) {
        try { await measureSound(sound.id); } catch { /* skipped */ }
        done++;
        button.textContent = `Measuring ${done} of ${sounds.length}…`;
    }
    soundState.measuring = false;
    button.textContent = "Measure all levels";
    renderSounds();
}

// ---- controls

$("soundSearch").addEventListener("input", () => {
    soundState.query = $("soundSearch").value;
    renderSounds();
});
$("soundFavoritesOnly").addEventListener("click", () => {
    soundState.favoritesOnly = !soundState.favoritesOnly;
    renderSounds();
});
$("soundRandom").addEventListener("click", () => {
    const pool = showingVersionGrid() ? soundState.library?.sounds || [] : visibleSounds();
    if (!pool.length) return;
    const sound = pool[Math.floor(Math.random() * pool.length)];
    selectSound(sound.id);
    playSound(sound.id);
    document.querySelector(`.sound-tile[data-sound-id="${CSS.escape(sound.id)}"]`)?.scrollIntoView({ block: "nearest" });
});
$("soundStop").addEventListener("click", stopAllSounds);
$("soundBack").addEventListener("click", () => openSoundEra(""));
$("soundMeasureAll").addEventListener("click", measureVisibleSounds);
$("soundVolume").value = String(soundPrefs.volume);
$("soundVolume").addEventListener("input", () => {
    soundPrefs.volume = Number($("soundVolume").value);
    if (soundState.master) soundState.master.gain.value = soundPrefs.volume / 100;
    saveSoundPrefs();
});
function showSoundTab(tab) {
    soundState.sideTab = tab;
    $("soundTabSelected").setAttribute("aria-selected", String(tab === "selected"));
    $("soundTabInUse").setAttribute("aria-selected", String(tab === "inuse"));
    $("soundTabStartup").setAttribute("aria-selected", String(tab === "startup"));
    $("soundDetail").hidden = tab !== "selected";
    $("soundAssignments").hidden = tab !== "inuse";
    $("soundStartup").hidden = tab !== "startup";
    if (tab === "startup") send("GetStartupSounds");
    if (tab === "inuse" || tab === "startup") renderSoundAssignments();
    fitSoundSide();
}
$("soundTabSelected").addEventListener("click", () => showSoundTab("selected"));
$("soundTabInUse").addEventListener("click", () => showSoundTab("inuse"));
$("soundTabStartup").addEventListener("click", () => showSoundTab("startup"));

function editSoundLibrary(editing) {
    soundState.editingLibrary = editing;
    $("soundLibraryEdit").hidden = !editing;
    $("soundLibraryShown").hidden = editing;
    $("soundLibraryChange").hidden = editing;
    $("soundReindex").hidden = editing;
    if (editing) {
        $("soundLibraryPath").value = soundState.library?.root || "";
        $("soundLibraryPath").focus();
        $("soundLibraryPath").select();
    }
}
$("soundLibraryChange").addEventListener("click", () => editSoundLibrary(true));
$("soundLibraryCancel").addEventListener("click", () => editSoundLibrary(false));
$("soundLibraryForm").addEventListener("submit", event => {
    event.preventDefault();
    const path = $("soundLibraryPath").value.trim();
    if (path) send("SetSoundLibrary", path);
    editSoundLibrary(false);
});
$("soundReindex").addEventListener("click", () => send("GetSoundLibrary", "refresh"));
enableTabWheel($("soundEras"), ".sound-era");
enableTabWheel(document.querySelector(".sound-side-tabs"), "[role='tab']");

// The side column fits the space left below its top edge, which moves as the
// page scrolls (it is sticky), so it never makes the page longer than the
// list beside it. Only the panel inside it scrolls, if anything.
let soundSideFrame = 0;
function fitSoundSide() {
    soundSideFrame = 0;
    const side = document.querySelector(".sounds-side");
    if (!side || !$("sounds").classList.contains("active")) return;
    if (getComputedStyle(side).position !== "sticky") {
        side.style.maxHeight = "";
        return;
    }
    const room = innerHeight - side.getBoundingClientRect().top - 24;
    side.style.maxHeight = `${Math.max(320, Math.floor(room))}px`;
}
const queueSoundSideFit = () => { cancelAnimationFrame(soundSideFrame); soundSideFrame = requestAnimationFrame(fitSoundSide); };
window.addEventListener("scroll", queueSoundSideFit, { passive: true });
window.addEventListener("resize", queueSoundSideFit);
new ResizeObserver(queueSoundSideFit).observe($("sounds"));

$("soundSelect").addEventListener("click", () => setSelecting(true));
// Esc leaves Select, unless a dialog has it or a delete is under way.
document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !soundState.selecting || soundState.deleting) return;
    if (!$("sounds").classList.contains("active") || document.querySelector(".confirm-backdrop:not([hidden])")) return;
    event.preventDefault();
    setSelecting(false);
});
