"use strict";

// The Conservatory's Progressions (2.4.0): a sketch of chords, bar by bar, in
// a key; the chord picked, on the neck, with the scales that fit it, its guide
// tones and other chords to try; and the progression played around and around
// with the metronome. Its rules are in harmony.js; the sketch is kept on this PC.

const PROG_KEY = "maestro.progression";
const PROG_SHOWS = Object.freeze(["symbols", "numerals", "nashville"]);
const PROG_STRUM = 0.012;       // seconds between a looped chord's notes
const PROG_SCALES_SHOWN = 4;
const PROG_IDEAS_SHOWN = 3;
const PROG_DEFAULT = Object.freeze({ title: "Sketch", root: "C", scale: "major", beats: 4, sections: [{ name: "", repeat: 1, bars: [["Cmaj7"], ["Am7"], ["Dm7"], ["G7"]] }] });
// 2.4.0, chord charts: songs kept by AHK in data\charts, a file each named by
// its id (Charts.ahk checks the same pattern and limit).
const PROG_SONG_ID = /^[a-z0-9]{8,24}$/;
const PROG_SONGS_MAX = 100;
const PROG_UNDER = Object.freeze(["numerals", "nashville", "nothing"]);
const PROG_SIDES = Object.freeze(["chord", "keys", "prompt", "songs"]);
// 2.4.0: a bass under the loop: none, each chord's root, or walking.
const PROG_BASSES = Object.freeze(["off", "roots", "walking"]);
const PROG_BASS_GAIN = 1.3;    // a single low note, against a chord's several
const PROG_PLAYED = Object.freeze(["Once", "Twice", "3 times", "4 times", "5 times", "6 times", "7 times", "8 times"]);

// The stored sketch and choices, each checked; anything wrong falls back.
function parseProgression(text) {
    let stored = null;
    try { stored = JSON.parse(text ?? "null"); } catch { stored = null; }
    const settings = { sketch: structuredClone(PROG_DEFAULT), show: "symbols", loop: true, sevenths: true, song: null, under: "numerals", side: "chord", prompt: null, locked: [], bass: "off" };
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return settings;
    const sketch = MaestroHarmony.cleanChart(stored.sketch);
    if (sketch) {
        // The time signature is the metronome's; a song's is set there when it opens.
        delete sketch.meter;
        settings.sketch = sketch;
    }
    if (PROG_SHOWS.includes(stored.show)) settings.show = stored.show;
    if (typeof stored.loop === "boolean") settings.loop = stored.loop;
    if (typeof stored.sevenths === "boolean") settings.sevenths = stored.sevenths;
    // The saved song the sketch is, if it is one.
    if (sketch && typeof stored.song === "string" && PROG_SONG_ID.test(stored.song)) settings.song = stored.song;
    if (PROG_UNDER.includes(stored.under)) settings.under = stored.under;
    if (PROG_SIDES.includes(stored.side)) settings.side = stored.side;
    if (PROG_BASSES.includes(stored.bass)) settings.bass = stored.bass;
    // The writing prompt (2.4.0) and the parts locked; one is drawn when first shown.
    settings.prompt = MaestroPrompts.cleanPrompt(stored.prompt);
    if (settings.prompt) settings.locked = MaestroPrompts.cleanLocked(stored.locked);
    return settings;
}

const prog = {
    settings: parseProgression((() => { try { return localStorage.getItem(PROG_KEY); } catch { return null; } })()),
    at: { section: 0, bar: 0, slot: 0 },  // the chord picked
    scale: null,            // a scale picked for it, shown on the neck: { root, scale }
    ideas: [],              // the other chords offered for it
    timeline: [],           // the sketch as played: harmony.js's chartTimeline
    timelineWeights: null,  // the metronome's bar it was made with
    bassNotes: new Map(),   // the bass line's notes by beat, when there is one
    bassVoice: null,        // the bass note sounding
    length: 0,              // its beats, once through
    fromBar: null,          // the metronome's bar the loop started on
    out: null,              // this loop's output: cut at Stop, so chords booked ahead go silent
    booked: [],             // chords booked but not yet lit: { at, event }
    sounding: [],           // the last looped chord's voices, damped as the next sounds
    voicing: null,          // its notes, so the next moves as little as it can
    playing: null,          // the timeline's chord sounding, while the loop plays
    songs: null,            // the saved songs, once AHK has sent them: { id, chart, text }
    asked: false,           // whether they've been asked for
    saving: new Map()       // songs sent to be saved, by id: their text
};

const progSketch = () => prog.settings.sketch;
const progKey = () => ({ root: progSketch().root, scale: progSketch().scale });
const progKeyLabel = () => `${progSketch().root} ${MaestroMusic.SCALES[progSketch().scale].label.replace(/ \(.*\)$/, "").toLowerCase()}`;
// A bar is as long as the metronome's: 4 beats in 4/4, 6 in 6/8.
const progWeights = () => MaestroMetronome.METERS[metro.settings.meter] ?? MaestroMetronome.METERS["4/4"];
const progBeats = () => progWeights().length;
const progLetter = index => String.fromCharCode(65 + index);
const progIsShown = () => $("conservatory").classList.contains("active") && consSections.current() === "progressions";

function saveProgression() {
    try { localStorage.setItem(PROG_KEY, JSON.stringify(prog.settings)); } catch { /* not kept */ }
}

// The chords as written, in order: { name, section, bar, slot }. A bar that
// repeats the one before (%) has none of its own.
function progChords() {
    const list = [];
    progSketch().sections.forEach((section, s) => section.bars.forEach((bar, b) => {
        if (bar[0] !== MaestroHarmony.REPEAT_BAR) bar.forEach((name, c) => list.push({ name, section: s, bar: b, slot: c }));
    }));
    return list;
}

const progIndex = list => list.findIndex(each => each.section === prog.at.section && each.bar === prog.at.bar && each.slot === prog.at.slot);

// Keeps the chord picked on a chord that exists: the nearest before it.
function clampProgPick() {
    const list = progChords();
    if (progIndex(list) >= 0) return;
    const before = list.filter(each => each.section < prog.at.section || (each.section === prog.at.section && (each.bar < prog.at.bar || (each.bar === prog.at.bar && each.slot < prog.at.slot))));
    const pick = before.at(-1) ?? list[0];
    prog.at = { section: pick.section, bar: pick.bar, slot: pick.slot };
}

const progChosen = () => progChords()[progIndex(progChords())]?.name ?? null;

function rebuildProgTimeline() {
    const weights = progWeights();
    progSketch().beats = weights.length;
    prog.timeline = MaestroHarmony.chartTimeline(progSketch());
    prog.timelineWeights = weights;
    const last = prog.timeline.at(-1);
    prog.length = last ? last.start + last.beats : 0;
    rebuildProgBass();
}

// The bass line, made again with the sketch, the time signature or the choice.
function rebuildProgBass() {
    const style = prog.settings.bass;
    prog.bassNotes = new Map(style === "off" ? [] : MaestroHarmony.bassLine(prog.timeline, prog.timelineWeights, style).map(note => [note.start, note.midi]));
}

// ---- Changes, each undoable once

function changeProgression(change, said = "") {
    const before = structuredClone(progSketch());
    const beforeAt = { ...prog.at };
    if (change() === false) return;
    // Whatever the change, the sketch stays one a chart can be.
    const clean = MaestroHarmony.cleanChart(progSketch());
    if (!clean) {
        prog.settings.sketch = before;
        prog.at = beforeAt;
        return;
    }
    prog.settings.sketch = clean;
    prog.scale = null;
    clampProgPick();
    rebuildProgTimeline();
    saveProgression();
    renderProgressions();
    renderConsNeck();
    if (said) showToast(said, { label: "Undo", run: () => {
        prog.settings.sketch = before;
        prog.at = beforeAt;
        clampProgPick();
        rebuildProgTimeline();
        saveProgression();
        renderProgressions();
        renderConsNeck();
    } });
}

// A typed chord or numeral, as a chord the sketch can play, or null.
function readProgChord(text) {
    const typed = MaestroMusic.cleanChordName(String(text ?? "").replace(/dim/, "\u00B0"));
    if (typed && MaestroHarmony.parseChord(typed)) return typed;
    return MaestroHarmony.chordFromNumeral(String(text ?? "").trim(), progKey());
}

function setProgChord(name) {
    changeProgression(() => {
        const bar = progSketch().sections[prog.at.section].bars[prog.at.bar];
        if (bar[prog.at.slot] === name) return false;
        bar[prog.at.slot] = name;
    });
    strumProgChord(name);
}

// The key's first chord, as a new bar's.
const progHome = () => MaestroMusic.chordsInKey(progSketch().root, progSketch().scale, prog.settings.sevenths ? 4 : 3)[0]?.name ?? progSketch().root;
const progTotalBars = () => progSketch().sections.reduce((sum, each) => sum + each.bars.length, 0);

function addProgBar(section) {
    const sketch = progSketch();
    const bars = sketch.sections[section]?.bars;
    if (!bars || bars.length >= MaestroHarmony.CHART_LIMITS.bars || progTotalBars() >= MaestroHarmony.CHART_LIMITS.totalBars) return;
    const home = progHome();
    changeProgression(() => {
        bars.push([home]);
        prog.at = { section, bar: bars.length - 1, slot: 0 };
    });
    strumProgChord(home);
}

// The bar shared with a second chord, a copy of the one picked.
function splitProgBar() {
    const bar = progSketch().sections[prog.at.section].bars[prog.at.bar];
    if (bar.length >= MaestroHarmony.CHART_LIMITS.perBar) return;
    changeProgression(() => {
        bar.splice(prog.at.slot + 1, 0, bar[prog.at.slot]);
        prog.at = { ...prog.at, slot: prog.at.slot + 1 };
    });
}

// The chord picked comes out; a bar left empty goes, and a section left empty.
function removeProgChord() {
    const sketch = progSketch();
    const { section, bar, slot } = prog.at;
    const bars = sketch.sections[section].bars;
    if (bars[bar].length === 1 && bars.length === 1 && sketch.sections.length === 1) return;
    const name = bars[bar][slot];
    changeProgression(() => {
        if (bars[bar].length > 1) bars[bar].splice(slot, 1);
        else if (bars.length > 1) {
            const [gone] = bars.splice(bar, 1);
            // A bar that repeated the one removed now holds its chords.
            if (bar === 0 && bars[0][0] === MaestroHarmony.REPEAT_BAR) bars[0] = [...gone];
        } else sketch.sections.splice(section, 1);
    }, `Removed ${name}.`);
}

function applyProgIdea(index) {
    const idea = prog.ideas[index];
    const bar = progSketch().sections[prog.at.section]?.bars[prog.at.bar];
    if (!idea || !bar || bar.length - 1 + idea.chords.length > MaestroHarmony.CHART_LIMITS.perBar) return;
    const was = bar[prog.at.slot];
    changeProgression(() => bar.splice(prog.at.slot, 1, ...idea.chords), `${idea.label}: ${idea.chords.join(" ")} for ${was}.`);
    strumProgChord(idea.chords[0]);
}

function transposeProgression(root) {
    const moved = MaestroHarmony.transposeChart(progSketch(), root);
    if (!moved || root === progSketch().root) return;
    const from = progSketch().root;
    changeProgression(() => { prog.settings.sketch = moved; }, `Moved from ${from} to ${root}.`);
}

function setProgKey(changes) {
    const key = { ...progKey(), ...changes };
    if (!MaestroHarmony.isKey(key)) return;
    changeProgression(() => Object.assign(progSketch(), key));
}

// ---- Sections, repeated bars and the title (2.4.0, chord charts)

// A bar after the one picked that plays it again (%).
function repeatProgBar() {
    const bars = progSketch().sections[prog.at.section].bars;
    if (bars.length >= MaestroHarmony.CHART_LIMITS.bars || progTotalBars() >= MaestroHarmony.CHART_LIMITS.totalBars) return;
    changeProgression(() => bars.splice(prog.at.bar + 1, 0, [MaestroHarmony.REPEAT_BAR]));
}

// A repeated bar written out as the chords it plays, so they can be changed.
function writeOutProgBar(section, bar) {
    const bars = progSketch().sections[section]?.bars;
    if (!bars || bars[bar]?.[0] !== MaestroHarmony.REPEAT_BAR) return;
    let from = bar - 1;
    while (from > 0 && bars[from][0] === MaestroHarmony.REPEAT_BAR) from -= 1;
    changeProgression(() => {
        bars[bar] = [...bars[from]];
        prog.at = { section, bar, slot: 0 };
    });
    strumProgChord(progChosen());
}

function setProgSection(changes) {
    const section = progSketch().sections[prog.at.section];
    if (Object.entries(changes).every(([field, value]) => section[field] === value)) return;
    changeProgression(() => Object.assign(section, changes));
}

// A section after the one picked, with a bar of the key's first chord.
function addProgSection() {
    const sketch = progSketch();
    if (sketch.sections.length >= MaestroHarmony.CHART_LIMITS.sections || progTotalBars() >= MaestroHarmony.CHART_LIMITS.totalBars) return;
    const home = progHome();
    changeProgression(() => {
        sketch.sections.splice(prog.at.section + 1, 0, { name: "", repeat: 1, bars: [[home]] });
        prog.at = { section: prog.at.section + 1, bar: 0, slot: 0 };
    });
    strumProgChord(home);
}

function removeProgSection() {
    const sketch = progSketch();
    if (sketch.sections.length < 2) return;
    const at = prog.at.section;
    const name = sketch.sections[at].name || progLetter(at);
    changeProgression(() => {
        sketch.sections.splice(at, 1);
        prog.at = { section: Math.min(at, sketch.sections.length - 1), bar: 0, slot: 0 };
    }, `Removed section ${name}.`);
}

function setProgTitle(text) {
    const title = String(text ?? "").replace(/[\u0000-\u001F\u007F"]/g, "").trim().slice(0, MaestroHarmony.CHART_LIMITS.title);
    if (!title || title === progSketch().title) return;
    changeProgression(() => { progSketch().title = title; });
}

// ---- Songs (2.4.0): the sketch kept as a chord chart, through AHK

// The sketch as a song: a chart with the metronome's time signature.
function progSongText() {
    const chart = MaestroHarmony.cleanChart({ ...progSketch(), meter: metro.settings.meter });
    return chart ? MaestroHarmony.chartText(chart) : "";
}

const progSavedSong = () => prog.songs?.find(song => song.id === prog.settings.song) ?? null;
const progIsSaved = () => progSavedSong()?.text === progSongText();

function newProgSongId() {
    const letters = "abcdefghijklmnopqrstuvwxyz0123456789";
    for (;;) {
        const id = [...crypto.getRandomValues(new Uint8Array(16))].map(byte => letters[byte % letters.length]).join("");
        if (!prog.songs?.some(song => song.id === id)) return id;
    }
}

function askForProgSongs() {
    if (prog.asked) return;
    prog.asked = true;
    send("GetCharts");
}

// The songs, as AHK sent them; any that don't read as a chart are left out.
function receiveCharts(items) {
    prog.songs = (Array.isArray(items) ? items : []).flatMap(item => {
        if (!item || typeof item.id !== "string" || !PROG_SONG_ID.test(item.id)) return [];
        const chart = MaestroHarmony.readChartText(item.text);
        return chart ? [{ id: item.id, chart, text: MaestroHarmony.chartText(chart) }] : [];
    }).slice(0, PROG_SONGS_MAX).sort(byProgTitle);
    if (progIsShown()) renderProgressions();
}

const byProgTitle = (a, b) => a.chart.title.localeCompare(b.chart.title, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);

function sendProgSong(id, text) {
    prog.saving.set(id, text);
    send("SaveChart", `${id}\n${text}`);
}

function saveProgSong() {
    const text = progSongText();
    if (prog.songs === null || !text || progIsSaved()) return;
    let id = prog.settings.song;
    if (!id || !prog.songs.some(song => song.id === id)) {
        if (prog.songs.length >= PROG_SONGS_MAX) {
            showToast(`Maestro keeps up to ${PROG_SONGS_MAX} songs. Delete one to save another.`);
            return;
        }
        // Kept at once, so a second Save before AHK answers doesn't make a copy.
        id = id ?? newProgSongId();
        prog.settings.song = id;
        saveProgression();
    }
    sendProgSong(id, text);
}

// AHK has written a song: it joins the list (the sketch's own, or one put back).
function chartSaved(id) {
    const text = prog.saving.get(id);
    prog.saving.delete(id);
    const chart = text ? MaestroHarmony.readChartText(text) : null;
    if (!chart || prog.songs === null) return;
    prog.songs = [...prog.songs.filter(song => song.id !== id), { id, chart, text }].sort(byProgTitle);
    if (prog.settings.song === id) showToast(`Saved ${chart.title}.`);
    if (progIsShown()) renderProgressions();
}

function chartDeleted(id) {
    const song = prog.songs?.find(each => each.id === id);
    if (!song) return;
    prog.songs = prog.songs.filter(each => each.id !== id);
    // The sketch stays as it was, no longer a saved song.
    if (prog.settings.song === id) {
        prog.settings.song = null;
        saveProgression();
    }
    showToast(`Deleted ${song.chart.title}.`, { label: "Undo", run: () => {
        if (prog.songs === null || prog.songs.length >= PROG_SONGS_MAX) return;
        sendProgSong(id, song.text);
    } });
    if (progIsShown()) renderProgressions();
}

// A save or delete AHK refused: it's said in a notice (app.js), and forgotten here.
function chartsFailed() {
    prog.saving.clear();
}

function deleteProgSong(id) {
    if (prog.songs?.some(song => song.id === id)) send("DeleteChart", id);
}

// The sketch becomes another song (or a new one, or a prompt's, with its
// tempo), with Undo.
function replaceProgSketch(sketch, song, said, tempo = null) {
    const before = { sketch: structuredClone(progSketch()), song: prog.settings.song, at: { ...prog.at }, meter: metro.settings.meter, tempo: metro.settings.tempo };
    const { meter, ...chart } = structuredClone(sketch);
    prog.settings.sketch = chart;
    prog.settings.song = song;
    prog.at = { section: 0, bar: 0, slot: 0 };
    prog.scale = null;
    prog.voicing = null;
    if (meter && meter !== metro.settings.meter) setMetroMeter(meter);
    if (tempo !== null && tempo !== metro.settings.tempo) setMetroTempo(tempo);
    clampProgPick();
    rebuildProgTimeline();
    saveProgression();
    renderProgressions();
    renderConsNeck();
    showToast(said, { label: "Undo", run: () => {
        prog.settings.sketch = before.sketch;
        prog.settings.song = before.song;
        prog.at = before.at;
        if (before.meter !== metro.settings.meter) setMetroMeter(before.meter);
        if (before.tempo !== metro.settings.tempo) setMetroTempo(before.tempo);
        clampProgPick();
        rebuildProgTimeline();
        saveProgression();
        renderProgressions();
        renderConsNeck();
    } });
}

function openProgSong(id) {
    const song = prog.songs?.find(each => each.id === id);
    if (!song || (id === prog.settings.song && progIsSaved())) return;
    replaceProgSketch(song.chart, id, `Opened ${song.chart.title}.`);
}

function newProgSong() {
    const sketch = progSketch();
    replaceProgSketch({ title: "New song", root: sketch.root, scale: sketch.scale, beats: progBeats(), sections: [{ name: "", repeat: 1, bars: [[progHome()]] }] }, null, "Started a new song.");
}

// ---- Printing (2.4.0): the chart on paper, through the print dialog

function drawPrintChart() {
    const chart = MaestroHarmony.cleanChart({ ...progSketch(), meter: metro.settings.meter });
    const page = $("printChart");
    if (!chart || !page) return false;
    const key = { root: chart.root, scale: chart.scale };
    const under = prog.settings.under;
    const played = chart.sections.reduce((sum, section) => sum + section.bars.length * section.repeat, 0);
    const head = element("header", "print-head");
    head.append(element("h1", "", chart.title), element("p", "", `${progKeyLabel()} · ${MaestroMetronome.meterLabel(metro.settings.meter)} · ${played} ${played === 1 ? "bar" : "bars"} as played`));
    const sections = chart.sections.map((section, s) => {
        const block = element("section", "print-section");
        if (chart.sections.length > 1 || section.name || section.repeat > 1) {
            const title = element("div", "print-section-head");
            title.append(element("span", "print-letter", progLetter(s)));
            if (section.name) title.append(element("span", "print-name", section.name));
            if (section.repeat > 1) title.append(element("span", "print-repeat", `Play ${section.repeat} times`));
            block.append(title);
        }
        for (let at = 0; at < section.bars.length; at += 4) {
            const line = element("div", "print-bars");
            section.bars.slice(at, at + 4).forEach((bar, index) => {
                const cell = element("div", "print-bar");
                if (s === chart.sections.length - 1 && at + index === section.bars.length - 1) cell.classList.add("is-last");
                if (bar[0] === MaestroHarmony.REPEAT_BAR) {
                    cell.append(element("span", "print-same", ""));
                } else bar.forEach(name => {
                    const chord = element("div", "print-chord");
                    chord.append(chordSymbol(name, "list"));
                    const below = under === "numerals" ? MaestroHarmony.romanNumeral(name, key) : under === "nashville" ? MaestroHarmony.nashville(name, key) : "";
                    if (under !== "nothing") chord.append(element("span", "print-under", below || "–"));
                    cell.append(chord);
                });
                line.append(cell);
            });
            block.append(line);
        }
        return block;
    });
    page.replaceChildren(head, ...sections);
    return true;
}

function printProgChart() {
    togglePrintPanel(false);
    if (!drawPrintChart()) return;
    window.print();
}

function togglePrintPanel(open = $("progPrintPanel").hidden) {
    const panel = $("progPrintPanel");
    if (panel.hidden === !open) return;
    panel.hidden = !open;
    $("progPrintButton").setAttribute("aria-expanded", String(open));
    if (open) {
        renderPrintPanel();
        requestAnimationFrame(() => $("progPrint").focus());
    }
}

function renderPrintPanel() {
    document.querySelectorAll("#progUnder [data-under]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.under === prog.settings.under)));
}

function pickProgChord(section, bar, slot) {
    prog.at = { section, bar, slot };
    clampProgPick();
    prog.scale = null;
    renderProgressions();
    renderConsNeck();
    strumProgChord(progChosen());
}

// ---- Sound: a chord picked is strummed, unless the loop is playing it.

function strumProgChord(name) {
    if (!name || (metro.running && prog.settings.loop)) return;
    cons.chordVoices.forEach(dampConsVoice);
    cons.chordVoices = [];
    pluckConsNotes(MaestroHarmony.voiceChord(name), consChordSpread(0.03)).then(voices => { cons.chordVoices = voices; });
}

// Called by the metronome as it books each beat, after any count-in, with
// the bars it has finished and the beat in this one. The loop starts on a
// bar's first beat. A function declaration, so it's on globalThis.
function bookProgressionBeat(at, bars, beat) {
    if (!prog.settings.loop) return;
    if (prog.timelineWeights !== progWeights()) rebuildProgTimeline();
    if (!prog.length) return;
    if (prog.fromBar === null) {
        if (beat !== 0) return;
        prog.fromBar = bars;
    }
    const now = metro.context.currentTime;
    // Nothing lights while unseen, so what's past is let go.
    while (prog.booked.length && prog.booked[0].at < now - 0.25) prog.booked.shift();
    const position = ((bars - prog.fromBar) * progBeats() + beat) % prog.length;
    const bass = prog.bassNotes.get(position);
    if (bass !== undefined) soundProgBass(at, bass);
    const event = prog.timeline.find(each => each.start === position);
    if (!event) return;
    soundProgChord(at, event.chord);
    prog.booked.push({ at, event });
}

// The loop's own output, cut at Stop.
function progLoopOutput(context) {
    if (!prog.out) {
        prog.out = context.createGain();
        prog.out.connect(consToneOutput(context));
    }
    return prog.out;
}

function soundProgChord(at, name) {
    const context = metro.context;
    progLoopOutput(context);
    // The chord before is damped as this one sounds, as a strum stops the last.
    for (const voice of prog.sounding) {
        voice.gain.gain.setTargetAtTime(0, at, 0.03);
        try { voice.source.stop(at + 0.3); } catch { /* already stopped */ }
    }
    const midis = MaestroHarmony.voiceChord(name, prog.voicing);
    prog.voicing = midis.length ? midis : prog.voicing;
    // With a bass playing, the chord leaves its own low note to it.
    const played = prog.settings.bass === "off" ? midis : midis.slice(1);
    prog.sounding = played.map((midi, index) => startConsVoice(context, midi, at + index * consChordSpread(PROG_STRUM), prog.out));
}

// A bass note, the one before damped as it sounds.
function soundProgBass(at, midi) {
    const context = metro.context;
    const out = progLoopOutput(context);
    stopProgBass(at);
    const voice = startConsVoice(context, midi, at, out);
    voice.gain.gain.value = PROG_BASS_GAIN;
    prog.bassVoice = voice;
}

function stopProgBass(at) {
    const voice = prog.bassVoice;
    if (!voice) return;
    voice.gain.gain.setTargetAtTime(0, at, 0.02);
    try { voice.source.stop(at + 0.2); } catch { /* already stopped */ }
    prog.bassVoice = null;
}

function setProgBass(style) {
    if (!PROG_BASSES.includes(style)) return;
    prog.settings.bass = style;
    saveProgression();
    rebuildProgBass();
    if (style === "off" && metro.context) stopProgBass(metro.context.currentTime);
    renderProgBar();
}

// The loop's chords fade out, those booked ahead with them.
function cutProgLoop() {
    const out = prog.out;
    if (out) {
        out.gain.setTargetAtTime(0, metro.context.currentTime, 0.015);
        setTimeout(() => out.disconnect(), 120);
    }
    prog.out = null;
    prog.booked = [];
    prog.sounding = [];
    prog.bassVoice = null;
    prog.voicing = null;
    prog.fromBar = null;
    if (prog.playing) {
        prog.playing = null;
        showProgPlaying();
    }
}

// Called by the metronome at Stop.
function progressionStopped() {
    cutProgLoop();
}

// Called with each frame the metronome lights: the chord that has sounded.
function lightDueProgression() {
    if (!metro.context) return;
    const now = metro.context.currentTime;
    let current = null;
    while (prog.booked.length && prog.booked[0].at <= now) current = prog.booked.shift();
    if (current && current.event !== prog.playing) {
        prog.playing = current.event;
        showProgPlaying();
    }
}

// The sheet scrolls inside its module (2.4.0): a bar is brought into view by
// scrolling the sheet alone, as little as it takes.
function revealProgBar(cell) {
    const sheet = $("progSheet");
    if (!cell || sheet.scrollHeight <= sheet.clientHeight) return;
    const view = sheet.getBoundingClientRect();
    const box = cell.getBoundingClientRect();
    if (box.top < view.top) sheet.scrollTop -= view.top - box.top + 6;
    else if (box.bottom > view.bottom) sheet.scrollTop += box.bottom - view.bottom + 6;
}

function showProgPlaying() {
    if (!progIsShown()) return;
    const playing = prog.playing;
    document.querySelectorAll("#progSheet .prog-bar[data-bar]").forEach(cell => {
        const lit = Boolean(playing) && Number(cell.dataset.section) === playing.section && Number(cell.dataset.bar) === playing.written;
        // The sheet follows the loop.
        if (lit && !cell.classList.contains("is-playing")) revealProgBar(cell);
        cell.classList.toggle("is-playing", lit);
    });
    if (progNeckFor() !== progMarkCache.key) renderConsNeck();
}

// ---- The neck: the chord playing, or the one picked, with a scale picked for it.

const progNeckFor = () => `${prog.playing?.chord ?? progChosen() ?? ""}|${prog.scale ? `${prog.scale.root} ${prog.scale.scale}` : ""}`;

let progMarkCache = { key: null, marks: new Map(), names: new Map() };
function progMarks() {
    const key = progNeckFor();
    if (progMarkCache.key === key) return progMarkCache;
    const name = prog.playing?.chord ?? progChosen();
    const tones = name ? MaestroHarmony.chordTones(name) : [];
    const marks = new Map();
    const names = new Map();
    // The bass is the chord's root only when there's no other bass.
    const root = MaestroHarmony.parseChord(name ?? "")?.root;
    tones.forEach(tone => {
        if (marks.has(tone.pc)) return;
        marks.set(tone.pc, { kind: tone.name === root ? "root" : "note", label: tone.name });
        names.set(tone.pc, tone.name);
    });
    if (prog.scale && !prog.playing) {
        for (const note of MaestroMusic.scaleNotes(prog.scale.root, prog.scale.scale)) {
            if (!marks.has(note.pc)) marks.set(note.pc, { kind: "other", label: note.name });
            if (!names.has(note.pc)) names.set(note.pc, note.name);
        }
    }
    progMarkCache = { key, marks, names };
    return progMarkCache;
}

consNeckModes.progressions = {
    short: true,
    mark: midi => progMarks().marks.get(((midi % 12) + 12) % 12) ?? null,
    key: midi => progMarks().marks.get(((midi % 12) + 12) % 12) ?? null,
    nameOf: midi => progMarks().names.get(((midi % 12) + 12) % 12) ?? MaestroMusic.PLAIN_NAMES[((midi % 12) + 12) % 12],
    render: () => renderProgressions()
};

// ---- Drawing the tab

function progChordLabel(name) {
    const show = prog.settings.show;
    const box = element("span", "prog-chord-label");
    if (show === "nashville") {
        box.append(element("span", "prog-nashville", MaestroHarmony.nashville(name, progKey()) || name));
        return box;
    }
    box.append(chordSymbol(name, "list"));
    if (show === "numerals") box.append(element("span", "prog-numeral", MaestroHarmony.romanNumeral(name, progKey()) || "\u2013"));
    return box;
}

function renderProgBar() {
    const sketch = progSketch();
    $("progRoot").value = sketch.root;
    $("progScale").value = sketch.scale;
    $("progTranspose").value = sketch.root;
    document.querySelectorAll("#progShow [data-show]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.show === prog.settings.show)));
    $("progLoop").setAttribute("aria-pressed", String(prog.settings.loop));
    document.querySelectorAll("#progBass [data-bass]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.bass === prog.settings.bass)));
    // A capo, when it lets more of the chords be played as open shapes.
    let capoText = "";
    if (cons.settings.instrument === "guitar") {
        const options = MaestroHarmony.capoOptions(progChords().map(each => each.name));
        const best = options[0];
        const open = options.find(each => each.capo === 0);
        if (best && open && best.capo > 0 && best.open > open.open) capoText = `Capo ${best.capo}: played as ${[...new Set(best.shapes)].join(", ")}`;
    }
    $("progCapo").textContent = capoText;
    $("progCapo").hidden = !capoText;
}

function renderProgSheet() {
    const sketch = progSketch();
    const playing = metro.running && prog.settings.loop ? prog.playing : null;
    if (document.activeElement !== $("progTitle")) $("progTitle").value = sketch.title;
    const played = sketch.sections.reduce((sum, section) => sum + section.bars.length * section.repeat, 0);
    $("progFacts").textContent = `${progKeyLabel()} \u00B7 ${MaestroMetronome.meterLabel(metro.settings.meter)} \u00B7 ${played} ${played === 1 ? "bar" : "bars"} as played`;
    const saved = progIsSaved();
    $("progSave").textContent = saved ? "Saved" : progSavedSong() ? "Save changes" : "Save song";
    $("progSave").disabled = saved || prog.songs === null;
    const total = progTotalBars();
    $("progSheet").replaceChildren(...sketch.sections.flatMap((section, s) => {
        const head = element("div", "prog-section-head");
        head.append(element("span", "prog-letter", progLetter(s)));
        if (section.name) head.append(element("span", "prog-section-name", section.name));
        if (section.repeat > 1) head.append(element("span", "prog-repeat", `\u00D7${section.repeat}`));
        const cells = [];
        section.bars.forEach((bar, b) => {
            const cell = element("div", "prog-bar");
            cell.dataset.section = String(s);
            cell.dataset.bar = String(b);
            if (playing && playing.section === s && playing.written === b) cell.classList.add("is-playing");
            if (bar[0] === MaestroHarmony.REPEAT_BAR) {
                // Clicked, it's written out as the chords it plays (2.4.0).
                const same = element("button", "prog-same");
                same.type = "button";
                same.dataset.writeOut = String(b);
                same.title = "Plays the bar before again: click to write its chords out";
                same.setAttribute("aria-label", `Bar ${b + 1}, the bar before again: write it out`);
                same.append(element("span", "prog-same-sign", "\uE500"));
                cell.append(same);
            } else bar.forEach((name, c) => {
                const chord = element("button", "prog-chord");
                chord.type = "button";
                chord.dataset.slot = String(c);
                const picked = prog.at.section === s && prog.at.bar === b && prog.at.slot === c;
                chord.setAttribute("aria-pressed", String(picked));
                chord.setAttribute("aria-label", `${name}, bar ${b + 1}${bar.length > 1 ? `, chord ${c + 1}` : ""}`);
                chord.append(progChordLabel(name));
                cell.append(chord);
            });
            cells.push(cell);
        });
        // Four bars to a line; the bar to add sits at the end of the last.
        const lines = [];
        for (let at = 0; at < cells.length; at += 4) {
            const line = element("div", "prog-bars");
            line.append(...cells.slice(at, at + 4));
            lines.push(line);
        }
        if (section.bars.length < MaestroHarmony.CHART_LIMITS.bars && total < MaestroHarmony.CHART_LIMITS.totalBars) {
            const add = element("button", "prog-add");
            add.type = "button";
            add.dataset.addBar = String(s);
            add.setAttribute("aria-label", `Add a bar to ${progLetter(s)}`);
            add.title = "Add a bar";
            add.append(MaestroIcons.create("plus"));
            lines.at(-1).append(add);
        }
        return sketch.sections.length > 1 || section.name || section.repeat > 1 ? [head, ...lines] : lines;
    }));
    // The bar playing, or else the chord picked (a new bar or section, say), stays in view.
    if (progIsShown()) revealProgBar($("progSheet").querySelector(".prog-bar.is-playing") ?? $("progSheet").querySelector('.prog-chord[aria-pressed="true"]')?.closest(".prog-bar"));
}

function renderProgEdit() {
    const sketch = progSketch();
    const { section, bar, slot } = prog.at;
    const bars = sketch.sections[section].bars;
    const where = `${sketch.sections.length > 1 ? `${progLetter(section)}, bar` : "Bar"} ${bar + 1}${bars[bar].length > 1 ? `, chord ${slot + 1}` : ""}`;
    $("progWhere").textContent = where;
    if (document.activeElement !== $("progChordName")) $("progChordName").value = progChosen() ?? "";
    $("progSplit").disabled = bars[bar].length >= MaestroHarmony.CHART_LIMITS.perBar;
    $("progRemove").disabled = bars[bar].length === 1 && bars.length === 1 && sketch.sections.length === 1;
    const full = progTotalBars() >= MaestroHarmony.CHART_LIMITS.totalBars;
    $("progRepeatBar").disabled = full || bars.length >= MaestroHarmony.CHART_LIMITS.bars;
    // The section of the chord picked.
    const part = sketch.sections[section];
    $("progSectionLabel").textContent = `Section ${progLetter(section)}`;
    if (document.activeElement !== $("progSectionName")) $("progSectionName").value = part.name;
    $("progSectionRepeat").value = String(part.repeat);
    $("progAddSection").disabled = full || sketch.sections.length >= MaestroHarmony.CHART_LIMITS.sections;
    $("progRemoveSection").disabled = sketch.sections.length < 2;
    const chords = MaestroMusic.chordsInKey(sketch.root, sketch.scale, prog.settings.sevenths ? 4 : 3);
    const chosen = progChosen();
    $("progKeyChords").replaceChildren(...chords.map(each => {
        const button = element("button", "key-chord");
        button.type = "button";
        button.dataset.name = each.name;
        button.setAttribute("aria-pressed", String(each.name === chosen));
        button.title = `Put ${each.name} in its place`;
        const name = element("span", "key-name");
        // One size for triads and sevenths, so switching moves nothing.
        name.append(chordSymbol(each.name, "list"));
        button.append(element("span", "key-numeral", each.numeral), name);
        return button;
    }));
    $("progKeyChords").classList.toggle("is-sevenths", prog.settings.sevenths);
    document.querySelectorAll("#progChordSize [data-sevenths]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.sevenths === String(prog.settings.sevenths))));
}

// The side module: the chord picked, the keys, a prompt or the songs (2.4.0).
function renderProgSide() {
    const side = prog.settings.side;
    document.querySelectorAll("#progSide [data-side]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.side === side)));
    $("progChordPane").hidden = side !== "chord";
    $("progSongsPane").hidden = side !== "songs";
    $("progKeysPane").hidden = side !== "keys";
    $("progPromptPane").hidden = side !== "prompt";
    if (side !== "prompt") globalThis.closePromptMenu?.();
    if (side === "songs") renderProgSongs();
    else if (side === "prompt") globalThis.renderPrompt?.();
    else if (side === "keys") globalThis.renderProgKeys?.();
    else renderProgDetail();
}

function renderProgSongs() {
    $("progChordTitle").textContent = "Songs";
    const songs = prog.songs;
    $("progChordHead").textContent = songs?.length ? `${songs.length} of ${PROG_SONGS_MAX}` : "";
    $("progNewSong").disabled = songs === null;
    if (songs === null) {
        $("progSongs").replaceChildren(placeholderItem("list", 3));
        $("progSongsNote").textContent = "";
        return;
    }
    $("progSongs").replaceChildren(...songs.map(song => {
        const item = element("li", "prog-song");
        const open = element("button", "prog-song-open");
        open.type = "button";
        open.dataset.songOpen = song.id;
        const current = song.id === prog.settings.song;
        if (current) open.setAttribute("aria-current", "true");
        open.title = current ? (progIsSaved() ? "The song on the sheet" : "The song on the sheet, with changes: click to go back to the saved one") : `Open ${song.chart.title}`;
        const bars = song.chart.sections.reduce((sum, section) => sum + section.bars.length * section.repeat, 0);
        const meter = song.chart.meter ? MaestroMetronome.meterLabel(song.chart.meter) : `${song.chart.beats}/4`;
        const key = `${song.chart.root} ${MaestroMusic.SCALES[song.chart.scale].label.replace(/ \(.*\)$/, "").toLowerCase()}`;
        open.append(element("strong", "", song.chart.title), element("span", "", `${key} · ${meter} · ${bars} ${bars === 1 ? "bar" : "bars"}${current && !progIsSaved() ? " · changed" : ""}`));
        const remove = element("button", "quiet prog-song-delete");
        remove.type = "button";
        remove.dataset.songDelete = song.id;
        remove.setAttribute("aria-label", `Delete ${song.chart.title}`);
        remove.title = `Delete ${song.chart.title}`;
        remove.append(MaestroIcons.create("close"));
        item.append(open, remove);
        return item;
    }));
    $("progSongsNote").textContent = songs.length ? "" : "No songs yet. Save song keeps the sheet here, in Maestro's data folder.";
}

function renderProgDetail() {
    const list = progChords();
    const index = progIndex(list);
    const name = list[index]?.name;
    const key = progKey();
    $("progChordTitle").replaceChildren(name ? chordSymbol(name, "small") : "");
    const numeral = name ? MaestroHarmony.romanNumeral(name, key) : "";
    $("progChordHead").textContent = numeral ? `${numeral} in ${progKeyLabel()}` : `Outside ${progKeyLabel()}`;
    $("progScales").replaceChildren(...MaestroHarmony.scalesForChord(name, key, PROG_SCALES_SHOWN).map(each => {
        const button = element("button", `cons-found-item${each.inKey ? " is-in-key" : ""}`);
        button.type = "button";
        button.dataset.scaleRoot = each.root;
        button.dataset.scale = each.scale;
        button.setAttribute("aria-pressed", String(prog.scale?.root === each.root && prog.scale?.scale === each.scale));
        button.title = each.inKey ? "In the key: show it on the neck" : "Show it on the neck";
        button.append(element("strong", "", `${each.root} ${each.label.replace(/ \(.*\)$/, "")}`));
        return button;
    }));
    // Guide tones: each chord's third and seventh, the next moving as little as it can.
    const lines = MaestroHarmony.guideTones(list.map(each => each.name));
    let next = 0;
    const byIndex = list.map(each => (lines[next]?.chord === each.name ? lines[next++] : null));
    const near = [index - 1, index, index + 1].filter(at => at >= 0 && at < list.length && byIndex[at]);
    $("progGuide").replaceChildren(...near.flatMap((at, order) => {
        const line = byIndex[at];
        const part = element("span", at === index ? "is-here" : "", `${line.chord}: ${line.a} ${line.b}`);
        return order ? [element("span", "prog-guide-arrow", "\u2192"), part] : [part];
    }));
    if (!near.length) $("progGuide").append(element("span", "", "None: it has no third and seventh."));
    // Other chords to try, read as the loop plays: the last chord leads to the first.
    const names = list.map(each => each.name);
    const around = names.length > 1 ? [...names, names[0]] : names;
    prog.ideas = index >= 0 ? MaestroHarmony.reharmonize(around, index, key).slice(0, PROG_IDEAS_SHOWN) : [];
    const room = MaestroHarmony.CHART_LIMITS.perBar - (progSketch().sections[prog.at.section].bars[prog.at.bar].length - 1);
    $("progIdeas").replaceChildren(...prog.ideas.map((idea, at) => {
        const item = element("li", "prog-idea");
        const button = element("button", "prog-idea-chords");
        button.type = "button";
        button.dataset.idea = String(at);
        button.disabled = idea.chords.length > room;
        button.title = button.disabled ? "The bar has no room for two more chords" : "Put these in its place";
        button.setAttribute("aria-label", `${idea.label}: ${idea.chords.join(" then ")}`);
        idea.chords.forEach(chord => button.append(chordSymbol(chord, "list")));
        const words = element("span", "prog-idea-words");
        words.append(element("strong", "", idea.label), element("span", "", idea.why));
        item.append(button, words);
        return item;
    }));
    $("progIdeasNote").textContent = prog.ideas.length ? "" : "Nothing to suggest for this one.";
    $("progIdeasNote").hidden = Boolean(prog.ideas.length);
}

function renderProgressions() {
    if (prog.timelineWeights !== progWeights()) rebuildProgTimeline();
    clampProgPick();
    askForProgSongs();
    renderProgBar();
    renderProgSheet();
    renderProgEdit();
    renderProgSide();
    $("progProblem").hidden = true;
}

// ---- Wiring

$("progRoot").replaceChildren(...MaestroMusic.ROOTS.map(root => {
    const option = element("option", "", root);
    option.value = root;
    return option;
}));
$("progTranspose").replaceChildren(...MaestroMusic.ROOTS.map(root => {
    const option = element("option", "", root);
    option.value = root;
    return option;
}));
// Keys of seven notes, so every chord has a numeral.
$("progScale").replaceChildren(...MaestroMusic.FAMILIES.map(family => {
    const group = element("optgroup");
    group.label = family;
    group.append(...Object.entries(MaestroMusic.SCALES)
        .filter(([id, scale]) => scale.family === family && MaestroMusic.scaleNotes("C", id).length === 7)
        .map(([id, scale]) => {
            const option = element("option", "", scale.label);
            option.value = id;
            return option;
        }));
    return group;
}).filter(group => group.children.length));

$("progRoot").addEventListener("change", () => setProgKey({ root: $("progRoot").value }));
$("progScale").addEventListener("change", () => setProgKey({ scale: $("progScale").value }));
$("progTranspose").addEventListener("change", () => {
    if (MaestroMusic.ROOTS.includes($("progTranspose").value)) transposeProgression($("progTranspose").value);
    $("progTranspose").value = progSketch().root;
});
document.querySelectorAll("#progShow [data-show]").forEach(button => button.addEventListener("click", () => {
    if (!PROG_SHOWS.includes(button.dataset.show)) return;
    prog.settings.show = button.dataset.show;
    saveProgression();
    renderProgressions();
}));
$("progLoop").addEventListener("click", () => {
    prog.settings.loop = !prog.settings.loop;
    saveProgression();
    // Turned on while the metronome plays, it starts at the next bar.
    if (!prog.settings.loop) cutProgLoop();
    renderProgressions();
});
document.querySelectorAll("#progBass [data-bass]").forEach(button => button.addEventListener("click", () => setProgBass(button.dataset.bass)));
document.querySelectorAll("#progChordSize [data-sevenths]").forEach(button => button.addEventListener("click", () => {
    prog.settings.sevenths = button.dataset.sevenths === "true";
    saveProgression();
    renderProgEdit();
}));
$("progSheet").addEventListener("click", event => {
    const add = event.target.closest("[data-add-bar]");
    if (add) return addProgBar(Number(add.dataset.addBar));
    const same = event.target.closest("[data-write-out]");
    if (same) return writeOutProgBar(Number(same.closest("[data-bar]").dataset.section), Number(same.dataset.writeOut));
    const chord = event.target.closest("[data-slot]");
    const cell = chord?.closest("[data-bar]");
    if (chord && cell) pickProgChord(Number(cell.dataset.section), Number(cell.dataset.bar), Number(chord.dataset.slot));
});
$("progChordForm").addEventListener("submit", event => {
    event.preventDefault();
    const name = readProgChord($("progChordName").value);
    if (!name) {
        $("progProblem").textContent = "Type a chord, like Dm7 or G7/B, or a numeral, like ii7 or V7/V.";
        $("progProblem").hidden = false;
        return;
    }
    $("progChordName").blur();
    setProgChord(name);
});
$("progChordName").addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    $("progChordName").value = progChosen() ?? "";
    $("progProblem").hidden = true;
});
$("progSplit").addEventListener("click", splitProgBar);
$("progRemove").addEventListener("click", removeProgChord);

// 2.4.0, chord charts: the title, sections, repeated bars, songs and printing.
// A text field takes its change on Enter or leaving it; Escape puts it back.
function wireProgText(field, apply, current) {
    field.addEventListener("change", () => apply(field.value));
    field.addEventListener("keydown", event => {
        if (event.key === "Enter") field.blur();
        if (event.key !== "Escape") return;
        event.stopPropagation();
        field.value = current();
        field.blur();
    });
}
wireProgText($("progTitle"), text => {
    setProgTitle(text);
    $("progTitle").value = progSketch().title;
}, () => progSketch().title);
wireProgText($("progSectionName"), text => setProgSection({ name: text.replace(/[\u0000-\u001F\u007F"]/g, "").trim().slice(0, MaestroHarmony.CHART_LIMITS.section) }), () => progSketch().sections[prog.at.section].name);
$("progSectionRepeat").replaceChildren(...PROG_PLAYED.map((label, index) => {
    const option = element("option", "", label);
    option.value = String(index + 1);
    return option;
}));
$("progSectionRepeat").addEventListener("change", () => {
    const repeat = Number($("progSectionRepeat").value);
    if (Number.isInteger(repeat) && repeat >= 1 && repeat <= MaestroHarmony.CHART_LIMITS.repeat) setProgSection({ repeat });
});
$("progAddSection").addEventListener("click", addProgSection);
$("progRemoveSection").addEventListener("click", removeProgSection);
$("progRepeatBar").addEventListener("click", repeatProgBar);
$("progSave").addEventListener("click", saveProgSong);
document.querySelectorAll("#progSide [data-side]").forEach(button => button.addEventListener("click", () => {
    if (!PROG_SIDES.includes(button.dataset.side)) return;
    prog.settings.side = button.dataset.side;
    saveProgression();
    renderProgSide();
}));
$("progSongs").addEventListener("click", event => {
    const remove = event.target.closest("[data-song-delete]");
    if (remove) return deleteProgSong(remove.dataset.songDelete);
    const open = event.target.closest("[data-song-open]");
    if (open) openProgSong(open.dataset.songOpen);
});
$("progNewSong").addEventListener("click", newProgSong);
$("progPrintButton").addEventListener("click", () => togglePrintPanel());
$("progPrint").addEventListener("click", printProgChart);
document.querySelectorAll("#progUnder [data-under]").forEach(button => button.addEventListener("click", () => {
    if (!PROG_UNDER.includes(button.dataset.under)) return;
    prog.settings.under = button.dataset.under;
    saveProgression();
    renderPrintPanel();
}));
$("progPrintPanel").addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    togglePrintPanel(false);
    $("progPrintButton").focus();
});
document.addEventListener("pointerdown", event => {
    if (!$("progPrintPanel").hidden && !event.target.closest("#progPrintPanel, #progPrintButton")) togglePrintPanel(false);
});
// The printed chart is drawn only for printing.
window.addEventListener("afterprint", () => $("printChart")?.replaceChildren());
$("progKeyChords").addEventListener("click", event => {
    const button = event.target.closest("[data-name]");
    if (button) setProgChord(button.dataset.name);
});
$("progScales").addEventListener("click", event => {
    const button = event.target.closest("[data-scale]");
    if (!button) return;
    const same = prog.scale?.root === button.dataset.scaleRoot && prog.scale?.scale === button.dataset.scale;
    prog.scale = same ? null : { root: button.dataset.scaleRoot, scale: button.dataset.scale };
    renderProgDetail();
    renderConsNeck();
});
$("progIdeas").addEventListener("click", event => {
    const button = event.target.closest("[data-idea]");
    if (button && !button.disabled) applyProgIdea(Number(button.dataset.idea));
});

// The neck is drawn short only when wide enough; a resize across that redraws it.
let progResizeTimer = null;
window.addEventListener("resize", () => {
    clearTimeout(progResizeTimer);
    progResizeTimer = setTimeout(() => {
        const drawnShort = $("consNeck").querySelector(".cons-neck")?.getAttribute("viewBox").startsWith("0 0 2700") ?? false;
        if (progIsShown() && !consKeyboard() && drawnShort !== ($("consNeck").clientWidth >= CONS_SHORT_FROM)) renderConsNeck();
    }, 150);
});

rebuildProgTimeline();
if (consSections.current() === "progressions") renderConservatory();
