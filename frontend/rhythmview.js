"use strict";

// The Conservatory's Rhythm tab (2.6.0): a step sequencer that plays with the
// metronome, in any of its time signatures, with a kit made in the page; the
// rhythm written out on one-line staves and printed; rhythms kept in
// data\rhythms through AHK; and the polyrhythm and polymeter trainer, which
// has its own transport and scores taps on F and J. The rules are in
// rhythm.js. The drums behind Progressions' loop are booked here too.

const RH_KEY = "maestro.rhythm";
const RH_ID = /^[a-z0-9]{8,24}$/;
const RH_MAX = 100;
const RH_LEVEL = { accent: 1, hit: 0.62 };
const RH_AHEAD = 0.12;

const rh = {
    rhythm: null,
    id: null,
    savedText: null,
    saved: null,            // [{ id, rhythm, text }] once AHK has answered
    asked: false,
    saving: new Map(),
    playing: false,         // the sequencer, on the metronome's transport
    seq: { fromBar: null, out: null, booked: [], lit: -1 },
    behind: { fromBar: null, out: null, booked: [], lit: -1 },
    settings: { click: false, trainer: { kind: "polyrhythm", a: 3, b: 2, soundA: "clave", soundB: "kick", speed: { on: false, step: 4, every: 4, to: 160 } } },
    drawn: null,
    renaming: false,
    even: null,             // the row whose Spread evenly popover is open
    noise: null
};

const rhIsShown = () => $("conservatory").classList.contains("active") && consSections.current() === "rhythm";

function loadRhythm() {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(RH_KEY)); } catch { stored = null; }
    rh.rhythm = (stored && MaestroRhythm.readRhythm(stored.text)) || MaestroRhythm.newRhythm();
    rh.id = stored && typeof stored.id === "string" && RH_ID.test(stored.id) ? stored.id : null;
    rh.savedText = rh.id && typeof stored.savedText === "string" ? stored.savedText : null;
    if (typeof stored?.click === "boolean") rh.settings.click = stored.click;
    const trainer = stored?.trainer;
    if (trainer && typeof trainer === "object") {
        const t = rh.settings.trainer;
        const whole = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;
        if (trainer.kind === "polyrhythm" || trainer.kind === "polymeter") t.kind = trainer.kind;
        if (whole(trainer.a, MaestroRhythm.TRAINER_MIN, MaestroRhythm.TRAINER_MAX)) t.a = trainer.a;
        if (whole(trainer.b, MaestroRhythm.TRAINER_MIN, MaestroRhythm.TRAINER_MAX)) t.b = trainer.b;
        if (MaestroRhythm.SOUNDS.includes(trainer.soundA)) t.soundA = trainer.soundA;
        if (MaestroRhythm.SOUNDS.includes(trainer.soundB)) t.soundB = trainer.soundB;
        const speed = trainer.speed;
        if (speed && typeof speed === "object") {
            if (typeof speed.on === "boolean") t.speed.on = speed.on;
            if (whole(speed.step, 1, 20)) t.speed.step = speed.step;
            if (whole(speed.every, 1, 16)) t.speed.every = speed.every;
            if (whole(speed.to, MaestroMetronome.MIN, MaestroMetronome.MAX)) t.speed.to = speed.to;
        }
    }
}

function saveRhythmState() {
    try {
        localStorage.setItem(RH_KEY, JSON.stringify({ text: MaestroRhythm.rhythmText(rh.rhythm), id: rh.id, savedText: rh.savedText, click: rh.settings.click, trainer: rh.settings.trainer }));
    } catch { /* not kept */ }
}

const rhText = () => MaestroRhythm.rhythmText(rh.rhythm);
const rhIsSaved = () => rh.id !== null && rh.savedText === rhText();

function setRhythm(rhythm, { id = rh.id, savedText = rh.savedText, undo = null } = {}) {
    const before = { rhythm: rh.rhythm, id: rh.id, savedText: rh.savedText };
    rh.rhythm = rhythm;
    rh.id = id;
    rh.savedText = savedText;
    saveRhythmState();
    if (rh.playing && metro.settings.meter !== rhythm.meter) setMetroMeter(rhythm.meter);
    renderRhythm();
    if (undo) showToast(undo, { label: "Undo", run: () => setRhythm(before.rhythm, { id: before.id, savedText: before.savedText }) });
}

// Every change goes through here, the rows kept as plain arrays until cleaned.
function changeRhythm(change) {
    const raw = { ...rh.rhythm, rows: rh.rhythm.rows.map(row => ({ ...row, hits: [...row.hits] })) };
    change(raw);
    const next = MaestroRhythm.cleanRhythm(raw);
    if (next) setRhythm(next);
}

const rhFullLength = (rhythm = rh.rhythm) => MaestroRhythm.barSteps(rhythm.meter, rhythm.steps) * rhythm.bars;

// A row moved to new steps or a new meter: each hit kept where its beat and
// place in the beat still exist.
function rhMapRow(row, from, to) {
    const fromBeat = from.steps, toBeat = to.steps;
    const length = row.hits.length === MaestroRhythm.barSteps(from.meter, from.steps) * from.bars ? MaestroRhythm.barSteps(to.meter, to.steps) * to.bars : Math.min(row.hits.length, MaestroRhythm.lengthMax(to.meter, to.steps));
    const hits = new Array(length).fill(0);
    row.hits.forEach((cell, index) => {
        if (!cell) return;
        const beat = Math.floor(index / fromBeat);
        const place = ((index % fromBeat) * toBeat) / fromBeat;
        const at = beat * toBeat + place;
        if (Number.isInteger(place) && at < length) hits[at] = cell;
    });
    return { ...row, hits };
}

function setRhythmShape({ meter = rh.rhythm.meter, steps = rh.rhythm.steps, bars = rh.rhythm.bars }) {
    if (!MaestroRhythm.stepsFor(meter).includes(steps)) steps = MaestroRhythm.stepsFor(meter).includes(rh.rhythm.steps) ? rh.rhythm.steps : 1;
    const from = rh.rhythm;
    const to = { meter, steps, bars };
    changeRhythm(raw => {
        raw.meter = meter;
        raw.steps = steps;
        raw.bars = bars;
        raw.rows = from.rows.map(row => {
            if (from.steps === steps && from.meter === meter) return row.hits.length === rhFullLength(from) ? MaestroRhythm.resizeRow(row, MaestroRhythm.barSteps(meter, steps) * bars) : row;
            return rhMapRow(row, from, to);
        });
    });
}

// ---- The kit, made in the page

function rhNoise(context) {
    if (!rh.noise || rh.noise.sampleRate !== context.sampleRate) {
        const length = context.sampleRate;
        rh.noise = context.createBuffer(1, length, context.sampleRate);
        const samples = rh.noise.getChannelData(0);
        for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
    }
    return rh.noise;
}

// One drum at `at` into `out`; its nodes let go when its sounds end.
function playDrum(context, sound, at, level, out) {
    const gain = context.createGain();
    gain.connect(out);
    const parts = [gain];
    let pending = 0;
    const done = () => { if (--pending === 0) parts.forEach(node => node.disconnect()); };
    const envelope = (peak, attack, decay) => {
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(peak * level, at + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    };
    const tone = (type, from, to = 0, glide = 0) => {
        const node = context.createOscillator();
        node.type = type;
        node.frequency.setValueAtTime(from, at);
        if (to) node.frequency.exponentialRampToValueAtTime(to, at + glide);
        return node;
    };
    const noise = () => {
        const node = context.createBufferSource();
        node.buffer = rhNoise(context);
        return node;
    };
    const filter = (type, frequency, q = 0.8) => {
        const node = context.createBiquadFilter();
        node.type = type;
        node.frequency.value = frequency;
        node.Q.value = q;
        node.connect(gain);
        parts.push(node);
        return node;
    };
    const play = (source, length, into = gain) => {
        source.connect(into);
        pending += 1;
        source.addEventListener("ended", () => { source.disconnect(); done(); });
        source.start(at);
        source.stop(at + length + 0.03);
    };
    switch (sound) {
        case "kick": envelope(1, 0.002, 0.4); play(tone("sine", 150, 42, 0.12), 0.45); break;
        case "snare": {
            envelope(0.7, 0.001, 0.18);
            play(noise(), 0.2, filter("highpass", 1400));
            play(tone("triangle", 220, 160, 0.08), 0.1);
            break;
        }
        case "rim": envelope(0.5, 0.001, 0.035); play(tone("square", 1750), 0.05, filter("bandpass", 1750, 6)); break;
        case "clap": {
            gain.gain.setValueAtTime(0.0001, at);
            for (let burst = 0; burst < 3; burst++) {
                gain.gain.setValueAtTime(0.7 * level, at + burst * 0.011);
                gain.gain.exponentialRampToValueAtTime(0.05, at + burst * 0.011 + 0.009);
            }
            gain.gain.setValueAtTime(0.6 * level, at + 0.033);
            gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
            play(noise(), 0.22, filter("bandpass", 1100, 1.4));
            break;
        }
        case "hatClosed": envelope(0.35, 0.001, 0.045); play(noise(), 0.06, filter("highpass", 7000)); break;
        case "hatOpen": envelope(0.3, 0.002, 0.32); play(noise(), 0.35, filter("highpass", 7000)); break;
        case "tomHigh": envelope(0.8, 0.002, 0.28); play(tone("sine", 240, 170, 0.2), 0.3); break;
        case "tomLow": envelope(0.85, 0.002, 0.34); play(tone("sine", 150, 105, 0.25), 0.36); break;
        case "cowbell": {
            envelope(0.35, 0.001, 0.25);
            const band = filter("bandpass", 800, 2);
            play(tone("square", 545), 0.27, band);
            play(tone("square", 815), 0.27, band);
            break;
        }
        case "clave": envelope(0.55, 0.001, 0.05); play(tone("sine", 2500), 0.07); break;
        case "woodblock": envelope(0.7, 0.002, 0.06); play(tone("triangle", 1040), 0.08); break;
        case "shaker": {
            gain.gain.setValueAtTime(0.0001, at);
            gain.gain.linearRampToValueAtTime(0.3 * level, at + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
            play(noise(), 0.1, filter("bandpass", 6200, 1.2));
            break;
        }
        default: gain.disconnect();
    }
}

// A drum heard now: a sound chosen, or a step written while nothing plays.
async function hearDrum(sound, accent = false) {
    if (metro.running || rhTrainer.running) return;
    const context = await readyConsAudio();
    if (!context) return;
    playDrum(context, sound, context.currentTime + 0.01, accent ? RH_LEVEL.accent : RH_LEVEL.hit, consToneOutput(context));
    restConsAudio();
}

// ---- Booked with the metronome's beats

function rhOutput(player) {
    if (!player.out) {
        player.out = metro.context.createGain();
        player.out.connect(consToneOutput(metro.context));
    }
    return player.out;
}

function cutRhythmPlayer(player) {
    const out = player.out;
    if (out) {
        out.gain.setTargetAtTime(0, metro.context.currentTime, 0.015);
        setTimeout(() => out.disconnect(), 120);
    }
    player.out = null;
    player.fromBar = null;
    player.booked = [];
    player.lit = -1;
}

function bookRhythmPlayer(player, rhythm, at, bars, beat) {
    if (player.fromBar === null) {
        if (beat !== 0) return;
        player.fromBar = bars;
    }
    const now = metro.context.currentTime;
    while (player.booked.length && player.booked[0].at < now - 0.25) player.booked.shift();
    const beats = (MaestroMetronome.METERS[metro.settings.meter] || MaestroMetronome.METERS["4/4"]).length;
    const seconds = 60 / metro.settings.tempo;
    const offsets = MaestroRhythm.stepOffsets(rhythm.steps, rhythm.swing);
    const base = ((bars - player.fromBar) * beats + beat) * rhythm.steps;
    const out = rhOutput(player);
    offsets.forEach((offset, k) => {
        const step = base + k;
        const time = at + offset * seconds;
        MaestroRhythm.hitsAt(rhythm, step).forEach(hit => playDrum(metro.context, hit.sound, time, hit.accent ? RH_LEVEL.accent : RH_LEVEL.hit, out));
        player.booked.push({ at: time, step });
    });
}

// Called by the metronome as it books each beat, after any count-in. A
// function declaration, so it's on globalThis.
function bookRhythmBeat(at, bars, beat) {
    if (rh.playing && rh.rhythm) bookRhythmPlayer(rh.seq, rh.rhythm, at, bars, beat);
    const behind = globalThis.progressionDrums?.();
    if (behind) bookRhythmPlayer(rh.behind, behind, at, bars, beat);
    else if (rh.behind.out) cutRhythmPlayer(rh.behind);
}

// The sequencer can play without the metronome's clicks.
function rhythmQuietsClick() {
    return rh.playing && !rh.settings.click;
}

// Called by the metronome at Stop.
function rhythmStopped() {
    cutRhythmPlayer(rh.seq);
    cutRhythmPlayer(rh.behind);
    if (rh.playing) {
        rh.playing = false;
        if ($("rhPlay")) renderRhythmPlay();
        lightRhythmStep(-1);
    }
}

// The drums behind Progressions stop with its loop.
function cutRhythmBehind() {
    if (metro.context) cutRhythmPlayer(rh.behind);
}

// Called with each frame the metronome lights: the step that has sounded.
function lightDueRhythm() {
    if (!metro.context || !rh.playing || !rhIsShown()) return;
    const now = metro.context.currentTime;
    let current = null;
    while (rh.seq.booked.length && rh.seq.booked[0].at <= now) current = rh.seq.booked.shift();
    if (current && current.step !== rh.seq.lit) {
        rh.seq.lit = current.step;
        lightRhythmStep(current.step);
    }
}

function lightRhythmStep(step) {
    const full = rhFullLength();
    $("rhRows")?.querySelectorAll(".rh-cell.is-playing").forEach(cell => cell.classList.remove("is-playing"));
    const marker = $("rhStaff")?.querySelector(".rh-now");
    if (step < 0) {
        if (marker) marker.setAttribute("visibility", "hidden");
        return;
    }
    rh.rhythm.rows.forEach((row, r) => {
        $("rhRows").querySelector(`[data-cell="${r}:${step % row.hits.length}"]`)?.classList.add("is-playing");
    });
    const spot = rh.drawn?.steps.find(each => each.step === step % full);
    if (marker && spot) {
        const system = rh.drawn.systems[spot.system];
        marker.setAttribute("x", String(spot.x - 4));
        marker.setAttribute("y", String(system.top + 8));
        marker.setAttribute("height", String(system.bottom - system.top));
        marker.setAttribute("visibility", "visible");
    }
}

async function toggleRhythmPlay() {
    if (metro.running && rh.playing) {
        stopMetronome();
        return;
    }
    if (metro.settings.meter !== rh.rhythm.meter) setMetroMeter(rh.rhythm.meter);
    rh.playing = true;
    rh.seq.fromBar = null;
    renderRhythmPlay();
    if (!metro.running) await startMetronome();
    if (!metro.running) rh.playing = false;
    renderRhythmPlay();
}

// ---- Saving, through AHK (data\rhythms, a file each)

function askForRhythms() {
    if (rh.asked) return;
    rh.asked = true;
    send("GetRhythms");
}

const rhSort = list => list.sort((a, b) => a.rhythm.title.localeCompare(b.rhythm.title, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id));

function receiveRhythms(items) {
    rh.saved = rhSort((Array.isArray(items) ? items : []).flatMap(item => {
        if (!item || typeof item.id !== "string" || !RH_ID.test(item.id)) return [];
        const rhythm = MaestroRhythm.readRhythm(item.text);
        return rhythm ? [{ id: item.id, rhythm, text: MaestroRhythm.rhythmText(rhythm) }] : [];
    }).slice(0, RH_MAX));
    if (rhIsShown()) renderRhythm();
    globalThis.renderProgDrums?.();
    globalThis.resolveMusicLink?.();
}

const newRhId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => "abcdefghijklmnopqrstuvwxyz0123456789"[byte % 36]).join("");

function saveRhythmFile(asNew = false) {
    if (rh.saved === null) return;
    let id = rh.id;
    if (asNew || !id || !rh.saved.some(item => item.id === id)) {
        if (rh.saved.length >= RH_MAX) {
            showToast(`Maestro keeps up to ${RH_MAX} rhythms. Delete one to save another.`);
            return;
        }
        id = newRhId();
    }
    const text = rhText();
    rh.saving.set(id, text);
    rh.id = id;
    send("SaveRhythm", `${id}\n${text}`);
    toggleConsPopover("rhMenu", false);
}

function rhythmSaved(id) {
    const text = rh.saving.get(id);
    if (text === undefined) return;
    rh.saving.delete(id);
    const rhythm = MaestroRhythm.readRhythm(text);
    if (!rhythm || rh.saved === null) return;
    rh.saved = rhSort([...rh.saved.filter(item => item.id !== id), { id, rhythm, text }]);
    if (rh.id === id) rh.savedText = text;
    saveRhythmState();
    if (rhIsShown()) renderRhythm();
    globalThis.renderProgDrums?.();
}

function rhythmDeleted(id) {
    if (rh.saved === null) return;
    const gone = rh.saved.find(item => item.id === id);
    rh.saved = rh.saved.filter(item => item.id !== id);
    if (rh.id === id) {
        rh.id = null;
        rh.savedText = null;
        saveRhythmState();
    }
    if (rhIsShown()) renderRhythm();
    globalThis.renderProgDrums?.();
    if (gone) showToast(`Deleted ${gone.rhythm.title}.`, { label: "Undo", run: () => {
        rh.saving.set(gone.id, gone.text);
        send("SaveRhythm", `${gone.id}\n${gone.text}`);
    } });
}

function rhythmsFailed() {
    rh.saving.clear();
    if (rh.saved === null) rh.saved = [];
    if (rhIsShown()) renderRhythm();
}

function openRhythm(id) {
    const item = rh.saved?.find(each => each.id === id);
    if (!item) return;
    toggleConsPopover("rhMenu", false);
    setRhythm(item.rhythm, { id: item.id, savedText: item.text, undo: rhIsSaved() ? null : `Opened ${item.rhythm.title}.` });
}

function openGroove(id) {
    const groove = MaestroRhythm.GROOVES.find(each => each.id === id);
    if (!groove) return;
    toggleConsPopover("rhMenu", false);
    setRhythm(groove.rhythm, { id: null, savedText: null, undo: rhIsSaved() ? null : `Opened ${groove.label}.` });
}

// What Progressions can put behind its loop: grooves, then saved rhythms,
// by a key ("groove:rock", "rhythm:<id>").
function rhythmChoices() {
    return [
        ...MaestroRhythm.GROOVES.map(groove => ({ key: `groove:${groove.id}`, label: groove.label, rhythm: groove.rhythm, group: "Grooves" })),
        ...(rh.saved ?? []).map(item => ({ key: `rhythm:${item.id}`, label: item.rhythm.title, rhythm: item.rhythm, group: "Yours" }))
    ];
}

// A function declaration, so progressionview.js reaches it on globalThis.
function rhythmByKey(key) {
    return rhythmChoices().find(choice => choice.key === key)?.rhythm ?? null;
}

// ---- Rename

function startRhythmRename() {
    toggleConsPopover("rhMenu", false);
    rh.renaming = true;
    $("rhTitleButton").hidden = true;
    const input = $("rhTitleInput");
    input.hidden = false;
    input.value = rh.rhythm.title;
    input.focus();
    input.select();
}

function endRhythmRename(keep) {
    if (!rh.renaming) return;
    rh.renaming = false;
    const title = $("rhTitleInput").value;
    $("rhTitleInput").hidden = true;
    $("rhTitleButton").hidden = false;
    if (keep) changeRhythm(raw => { raw.title = title; });
    $("rhTitleButton").focus();
}

// ---- Print

function printRhythm() {
    toggleConsPopover("rhMenu", false);
    const page = $("printChart");
    if (!page) return;
    const head = element("header", "print-head");
    head.append(element("h1", "", rh.rhythm.title), element("p", "", rhFacts(rh.rhythm)));
    const holder = element("div", "print-exercise print-rhythm");
    holder.append(rhStaffSvg(1100, 1).svg);
    page.replaceChildren(head, holder);
    window.print();
}

// ---- Drawing

function rhFacts(rhythm) {
    const parts = [MaestroMetronome.meterLabel(rhythm.meter), MaestroRhythm.STEP_LABELS[rhythm.steps], rhythm.bars === 1 ? "1 bar" : `${rhythm.bars} bars`];
    if (rhythm.swing > 50) parts.push(`swing ${rhythm.swing}%`);
    return parts.join(" · ");
}

// Rows repeated to the rhythm's length, so a shorter row shows how it falls.
function rhShownRows(rhythm = rh.rhythm) {
    const full = rhFullLength(rhythm);
    return rhythm.rows.map(row => ({ sound: row.sound, hits: Array.from({ length: full }, (_, i) => row.hits[i % row.hits.length]) }));
}

// Drawn larger than the units it's laid out in, as Counterpoint's staff is.
const RH_SCALE = 1.4;

function rhStaffSvg(width, scale = RH_SCALE) {
    const drawn = MaestroRhythm.engraveRhythm(rhShownRows(), rh.rhythm.meter, rh.rhythm.steps, { maxWidth: Math.max(360, width - 24) / scale });
    const svg = rhythmSvg(drawn, scale, `${rh.rhythm.title}, written out: ${rhFacts(rh.rhythm)}`);
    svg.prepend(svgNode("rect", { class: "rh-now", x: 0, y: 0, width: 26, height: 10, rx: 4, visibility: "hidden" }));
    return { svg, drawn };
}

// A rhythm engraved by rhythm.js, as SVG; the Quiz draws its bars with it too.
function rhythmSvg(drawn, scale, label) {
    const svg = svgNode("svg", { class: "cp-score rh-score", viewBox: `0 0 ${drawn.width} ${drawn.height}`, width: Math.round(drawn.width * scale), height: Math.round(drawn.height * scale), role: "img", "aria-label": label });
    for (const item of drawn.items) {
        let node;
        if (item.kind === "line") node = svgNode("line", { x1: item.x1, y1: item.y1, x2: item.x2, y2: item.y2 });
        else if (item.kind === "glyph" || item.kind === "text") {
            node = svgNode("text", { x: item.x, y: item.y });
            node.textContent = item.text;
        } else node = svgNode("polygon", { points: `${item.x1},${item.y1} ${item.x2},${item.y2} ${item.x2},${item.y2 + item.thickness} ${item.x1},${item.y1 + item.thickness}` });
        node.setAttribute("class", item.class);
        svg.append(node);
    }
    return svg;
}

function drawRhythmStaff() {
    const holder = $("rhStaff");
    const { svg, drawn } = rhStaffSvg(holder.clientWidth || 1000);
    rh.drawn = drawn;
    holder.replaceChildren(svg);
}

function renderRhythmPlay() {
    const playing = rh.playing && metro.running;
    const button = $("rhPlay");
    button.setAttribute("aria-pressed", String(playing));
    button.replaceChildren(MaestroIcons.create(playing ? "stop" : "play"), element("span", "", playing ? "Stop" : "Play"));
    button.title = playing ? "Stop the rhythm and the metronome" : "Play the rhythm with the metronome, at its tempo";
}

function renderRhythmMenu() {
    $("rhCopyLink").disabled = !rh.id;
    $("rhGrooves").replaceChildren(...MaestroRhythm.GROOVES.map(groove => {
        const row = element("li", "prog-song");
        const open = element("button", "prog-song-open");
        open.type = "button";
        open.dataset.grooveOpen = groove.id;
        open.append(element("strong", "", groove.label), element("span", "", rhFacts(groove.rhythm)));
        row.append(open);
        return row;
    }));
    const items = rh.saved;
    $("rhSaveCopy").disabled = items === null;
    if (items === null) {
        $("rhRhythms").replaceChildren(placeholderItem("list", 2));
        $("rhRhythmsNote").textContent = "";
        return;
    }
    $("rhRhythms").replaceChildren(...items.map(item => {
        const row = element("li", "prog-song");
        const open = element("button", "prog-song-open");
        open.type = "button";
        open.dataset.rhythmOpen = item.id;
        const current = item.id === rh.id;
        if (current) open.setAttribute("aria-current", "true");
        open.append(element("strong", "", item.rhythm.title), element("span", "", `${rhFacts(item.rhythm)}${current && !rhIsSaved() ? " · changed" : ""}`));
        const remove = element("button", "prog-song-delete");
        remove.type = "button";
        remove.dataset.rhythmDelete = item.id;
        remove.setAttribute("aria-label", `Delete ${item.rhythm.title}`);
        remove.title = remove.getAttribute("aria-label");
        remove.append(MaestroIcons.create("close"));
        row.append(open, remove);
        return row;
    }));
    $("rhRhythmsNote").textContent = items.length ? "" : "No rhythms yet. Save rhythm keeps one here, in Maestro's data folder.";
}

function renderRhythmTools() {
    const rhythm = rh.rhythm;
    $("rhMeter").value = rhythm.meter;
    $("rhSteps").replaceChildren(...MaestroRhythm.stepsFor(rhythm.meter).map(steps => {
        const button = element("button", "", steps === 1 ? "Beats" : String(steps));
        button.type = "button";
        button.dataset.steps = String(steps);
        button.title = MaestroRhythm.STEP_LABELS[steps];
        button.setAttribute("aria-pressed", String(steps === rhythm.steps));
        return button;
    }));
    $("rhBars").value = String(rhythm.bars);
    $("rhSwing").value = String(MaestroMetronome.SWINGS.some(([value]) => value === rhythm.swing) ? rhythm.swing : 50);
    $("rhSwing").disabled = rhythm.steps !== 2 && rhythm.steps !== 4;
    $("rhSwing").closest("label").title = $("rhSwing").disabled ? "Swing needs 2 or 4 steps a beat" : "The second of each pair of steps comes late";
    $("rhAddRow").disabled = rhythm.rows.length >= MaestroRhythm.ROWS_MAX;
    $("rhClick").checked = rh.settings.click;
}

function renderRhythmRows() {
    const rhythm = rh.rhythm;
    const perBar = MaestroRhythm.barSteps(rhythm.meter, rhythm.steps);
    const info = MaestroRhythm.meterInfo(rhythm.meter);
    // A group's first beat starts with a wider gap (7/8's 2+2+3).
    const groupStarts = new Set();
    info.weights.forEach((weight, beat) => { if (weight >= 2) groupStarts.add(beat); });
    $("rhRows").style.setProperty("--rh-steps", String(perBar));
    $("rhRows").replaceChildren(...rhythm.rows.map((row, r) => {
        const line = element("div", `rh-row${row.on ? "" : " is-off"}`);
        line.setAttribute("role", "row");
        const controls = element("div", "rh-row-controls");
        const sound = element("select", "rh-sound");
        sound.dataset.rowSound = String(r);
        sound.setAttribute("aria-label", `Row ${r + 1}'s sound`);
        sound.append(...MaestroRhythm.SOUNDS.map(each => {
            const option = element("option", "", MaestroRhythm.KIT[each].label);
            option.value = each;
            return option;
        }));
        sound.value = row.sound;
        const on = element("button", "secondary rh-on", row.on ? "On" : "Off");
        on.type = "button";
        on.dataset.rowOn = String(r);
        on.setAttribute("aria-pressed", String(row.on));
        on.title = row.on ? "Silence this row" : "Hear this row";
        const even = element("button", "secondary rh-even", "Spread…");
        even.type = "button";
        even.dataset.rowEven = String(r);
        even.setAttribute("aria-haspopup", "dialog");
        even.title = "Spread hits evenly over the row (a Euclidean rhythm), or give the row its own length";
        const remove = element("button", "secondary rh-remove");
        remove.type = "button";
        remove.dataset.rowRemove = String(r);
        remove.setAttribute("aria-label", `Remove row ${r + 1}`);
        remove.title = "Remove this row";
        remove.disabled = rhythm.rows.length <= 1;
        remove.append(MaestroIcons.create("close"));
        controls.append(sound, on, even, remove);
        const cells = element("div", "rh-cells");
        row.hits.forEach((cell, k) => {
            const button = element("button", "rh-cell");
            button.type = "button";
            button.dataset.cell = `${r}:${k}`;
            const beat = Math.floor(k / rhythm.steps) % info.beats;
            if (k % rhythm.steps === 0) button.classList.add(groupStarts.has(beat) ? "is-group" : "is-beat");
            if (k % perBar === 0) button.classList.add("is-bar");
            if (cell === 2) button.classList.add("is-accent");
            button.setAttribute("aria-pressed", String(cell > 0));
            button.setAttribute("aria-label", `${MaestroRhythm.KIT[row.sound].label}, bar ${Math.floor(k / perBar) + 1}, beat ${beat + 1}${rhythm.steps > 1 ? `, step ${(k % rhythm.steps) + 1}` : ""}: ${cell === 2 ? "accent" : cell ? "hit" : "rest"}`);
            cells.append(button);
        });
        const length = row.hits.length !== rhFullLength() ? element("span", "rh-length", `${row.hits.length} steps`) : null;
        line.append(controls, cells);
        if (length) controls.append(length);
        return line;
    }));
}

function renderRhythm() {
    if (!rh.rhythm) return;
    askForRhythms();
    if (!rh.renaming) $("rhTitle").textContent = rh.rhythm.title;
    $("rhFacts").textContent = rhFacts(rh.rhythm);
    $("rhFacts").title = $("rhFacts").textContent;
    const saved = rhIsSaved();
    $("rhSave").textContent = saved ? "Saved" : rh.id ? "Save changes" : "Save rhythm";
    $("rhSave").disabled = saved || rh.saved === null;
    renderRhythmTools();
    renderRhythmRows();
    renderRhythmMenu();
    renderRhythmPlay();
    drawRhythmStaff();
    renderRhTrainer();
}

// ---- Spread evenly

function openRhythmEven(r) {
    rh.even = r;
    const row = rh.rhythm.rows[r];
    $("rhEvenHits").value = String(row.hits.filter(Boolean).length || Math.max(1, Math.round(row.hits.length / 3)));
    $("rhEvenLength").max = String(MaestroRhythm.lengthMax(rh.rhythm.meter, rh.rhythm.steps));
    $("rhEvenLength").value = String(row.hits.length);
    $("rhEvenTurn").value = "0";
    renderRhythmEvenPreview();
    const button = $("rhRows").querySelector(`[data-row-even="${r}"]`);
    consPopovers.rhEven.button = button;
    toggleConsPopover("rhEven", true);
    // Under the row's button, inside the module.
    const module = $("rhEvenPanel").offsetParent;
    if (module && button) {
        const box = button.getBoundingClientRect(), frame = module.getBoundingClientRect();
        $("rhEvenPanel").style.left = `${Math.round(box.left - frame.left)}px`;
        $("rhEvenPanel").style.top = `${Math.round(box.bottom - frame.top + 6)}px`;
    }
}

function readRhythmEven() {
    const length = Math.round(Number($("rhEvenLength").value));
    const hits = Math.round(Number($("rhEvenHits").value));
    const turn = Math.round(Number($("rhEvenTurn").value));
    const max = MaestroRhythm.lengthMax(rh.rhythm.meter, rh.rhythm.steps);
    if (!Number.isInteger(length) || length < 1 || length > max || !Number.isInteger(hits) || hits < 0 || hits > length || !Number.isInteger(turn)) return null;
    return MaestroRhythm.euclid(hits, length, turn);
}

function renderRhythmEvenPreview() {
    const cells = readRhythmEven();
    $("rhEvenPreview").textContent = cells ? cells.map(cell => (cell ? "x" : "·")).join(" ") : "Hits run from 0 to the length; a row is 1 to " + MaestroRhythm.lengthMax(rh.rhythm.meter, rh.rhythm.steps) + " steps.";
    $("rhEvenApply").disabled = !cells;
}

function applyRhythmEven() {
    const cells = readRhythmEven();
    const r = rh.even;
    if (!cells || r === null) return;
    changeRhythm(raw => { raw.rows[r] = { ...raw.rows[r], hits: cells }; });
    toggleConsPopover("rhEven", false);
}

// ---- The trainer: its own transport, at the metronome's tempo.

const rhTrainer = {
    running: false,
    out: null,
    timer: null,
    frame: null,
    nextAt: 0,
    cycleStart: 0,
    cycleBeats: 0,
    cycleNumber: 0,
    events: [],         // booked: { at, layer, cycle, hit: null | error }
    cycles: [],         // [{ number, start, end }] not yet scored
    steady: 0,          // steady cycles in a row
    last: [null, null], // the last scored cycle's summary per layer
    tapped: false
};

async function startRhythmTrainer() {
    if (rhTrainer.running) return;
    if (metro.running) stopMetronome();
    const context = await readyConsAudio();
    if (!context) return;
    rhTrainer.running = true;
    rhTrainer.out = context.createGain();
    rhTrainer.out.connect(consToneOutput(context));
    rhTrainer.nextAt = context.currentTime + 0.1;
    rhTrainer.cycleNumber = 0;
    rhTrainer.events = [];
    rhTrainer.cycles = [];
    rhTrainer.steady = 0;
    rhTrainer.last = [null, null];
    rhTrainer.tapped = false;
    bookRhythmTrainer();
    renderRhTrainer();
    syncRhythmTrainerFrame();
}

// A function declaration: the metronome stops the trainer as it starts.
function stopRhythmTrainer() {
    if (!rhTrainer.running) return;
    rhTrainer.running = false;
    clearTimeout(rhTrainer.timer);
    rhTrainer.timer = null;
    const out = rhTrainer.out;
    if (out) {
        out.gain.setTargetAtTime(0, metro.context.currentTime, 0.015);
        setTimeout(() => out.disconnect(), 120);
    }
    rhTrainer.out = null;
    rhTrainer.events = [];
    rhTrainer.cycles = [];
    restConsAudio();
    syncRhythmTrainerFrame();
    if ($("rhTrainPlay")) renderRhTrainer();
}

function bookRhythmTrainer() {
    rhTrainer.timer = null;
    if (!rhTrainer.running) return;
    if (!rhIsShown()) {
        stopRhythmTrainer();
        return;
    }
    const context = metro.context;
    const now = context.currentTime;
    const t = rh.settings.trainer;
    while (rhTrainer.nextAt < now + RH_AHEAD) {
        const cycle = MaestroRhythm.trainerCycle(t);
        const seconds = 60 / metro.settings.tempo;
        const start = rhTrainer.nextAt;
        const number = rhTrainer.cycleNumber++;
        for (const event of cycle.events) {
            const at = start + event.at * seconds;
            if (event.layer < 0) {
                playDrum(context, "hatClosed", at, 0.35, rhTrainer.out);
                continue;
            }
            const sound = event.layer === 0 ? t.soundA : t.soundB;
            playDrum(context, sound, at, event.first ? RH_LEVEL.accent : RH_LEVEL.hit, rhTrainer.out);
            rhTrainer.events.push({ at, layer: event.layer, index: event.index, cycle: number, hit: null });
        }
        rhTrainer.cycles.push({ number, start, end: start + cycle.beats * seconds });
        rhTrainer.cycleStart = start;
        rhTrainer.cycleBeats = cycle.beats;
        rhTrainer.nextAt = start + cycle.beats * seconds;
    }
    scoreRhythmCycles(now);
    rhTrainer.timer = setTimeout(bookRhythmTrainer, 25);
}

// A cycle is scored once it's well past: per layer, how close the taps were.
// Cycles with no tap at all aren't scored, so listening first costs nothing.
function scoreRhythmCycles(now) {
    while (rhTrainer.cycles.length && rhTrainer.cycles[0].end + 0.25 < now) {
        const cycle = rhTrainer.cycles.shift();
        const events = rhTrainer.events.filter(event => event.cycle === cycle.number);
        rhTrainer.events = rhTrainer.events.filter(event => event.cycle > cycle.number);
        if (!events.some(event => event.hit !== null)) continue;
        const summaries = [0, 1].map(layer => {
            const mine = events.filter(event => event.layer === layer);
            return MaestroRhythm.tapSummary(mine.filter(event => event.hit !== null).map(event => event.hit), mine.filter(event => event.hit === null).length);
        });
        rhTrainer.last = summaries;
        const speed = rh.settings.trainer.speed;
        if (summaries.every(MaestroRhythm.isSteady)) {
            rhTrainer.steady += 1;
            if (speed.on && rhTrainer.steady >= speed.every && metro.settings.tempo < speed.to) {
                setMetroTempo(Math.min(speed.to, metro.settings.tempo + speed.step));
                rhTrainer.steady = 0;
            }
        } else rhTrainer.steady = 0;
        renderRhTrainerResults();
    }
}

// A tap's moment on the audio clock, from the event's own time stamp.
function rhTapTime(event) {
    const context = metro.context;
    const stamp = context.getOutputTimestamp?.();
    if (!stamp || !stamp.performanceTime) return context.currentTime;
    return stamp.contextTime + (event.timeStamp - stamp.performanceTime) / 1000;
}

function tapRhythmTrainer(layer, event) {
    if (!rhTrainer.running) return;
    const time = rhTapTime(event);
    const mine = rhTrainer.events.filter(each => each.layer === layer && each.hit === null);
    const scored = MaestroRhythm.scoreTap(mine.map(each => each.at), time);
    const pad = $(layer === 0 ? "rhPadA" : "rhPadB");
    pad.animate([{ transform: "scale(0.96)" }, { transform: "scale(1)" }], { duration: 140, easing: "ease-out" });
    if (!scored) return;
    mine[scored.index].hit = scored.error;
    const ms = Math.round(scored.error * 1000);
    $(layer === 0 ? "rhPadALast" : "rhPadBLast").textContent = Math.abs(ms) <= 10 ? "On time" : ms < 0 ? `${-ms} ms early` : `${ms} ms late`;
}

function syncRhythmTrainerFrame() {
    const shown = rhTrainer.running && rhIsShown() && !metroUnseen();
    if (shown && rhTrainer.frame === null) rhTrainer.frame = requestAnimationFrame(rhythmTrainerFrame);
    if (!shown && rhTrainer.frame !== null) {
        cancelAnimationFrame(rhTrainer.frame);
        rhTrainer.frame = null;
    }
    if (!rhTrainer.running) drawRhythmTrainerHand(-1);
}

function rhythmTrainerFrame() {
    rhTrainer.frame = null;
    if (!rhTrainer.running) return;
    const seconds = 60 / metro.settings.tempo;
    const now = metro.context.currentTime;
    const cycle = rhTrainer.cycles.find(each => each.start <= now && now < each.end);
    drawRhythmTrainerHand(cycle ? (now - cycle.start) / (cycle.end - cycle.start) : -1);
    if (seconds > 0) rhTrainer.frame = requestAnimationFrame(rhythmTrainerFrame);
}

// The circle: the first layer outside, the second inside, a hand sweeping round.
function drawRhythmCircle() {
    const t = rh.settings.trainer;
    const cycle = MaestroRhythm.trainerCycle(t);
    const size = 220, middle = size / 2;
    const svg = svgNode("svg", { class: "rh-circle", viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: "img", "aria-label": `${t.a} against ${t.b}, on a circle` });
    svg.append(svgNode("circle", { class: "rh-ring", cx: middle, cy: middle, r: 92 }), svgNode("circle", { class: "rh-ring", cx: middle, cy: middle, r: 62 }));
    cycle.events.forEach(event => {
        if (event.layer < 0) return;
        const angle = (event.at / cycle.beats) * 2 * Math.PI - Math.PI / 2;
        const radius = event.layer === 0 ? 92 : 62;
        svg.append(svgNode("circle", { class: `rh-dot is-layer-${event.layer}${event.first ? " is-first" : ""}`, cx: middle + radius * Math.cos(angle), cy: middle + radius * Math.sin(angle), r: event.first ? 9 : 7 }));
    });
    svg.append(svgNode("line", { class: "rh-hand", x1: middle, y1: middle, x2: middle, y2: middle - 104, visibility: "hidden" }));
    $("rhCircle").replaceChildren(svg);
}

function drawRhythmTrainerHand(fraction) {
    const hand = $("rhCircle")?.querySelector(".rh-hand");
    if (!hand) return;
    if (fraction < 0) {
        hand.setAttribute("visibility", "hidden");
        return;
    }
    hand.setAttribute("visibility", "visible");
    hand.setAttribute("transform", `rotate(${(fraction * 360).toFixed(1)} 110 110)`);
}

// The two layers on the grid they share, as rows of steps.
function renderRhythmTrainerGrid() {
    const t = rh.settings.trainer;
    const grid = MaestroRhythm.trainerGrid(t);
    $("rhTrainGrid").style.setProperty("--rh-grid", String(grid.length));
    $("rhTrainGrid").replaceChildren(...[0, 1].map(layer => {
        const row = element("div", "rh-grid-row");
        row.append(element("span", "rh-grid-label", layer === 0 ? `${t.a}` : `${t.b}`));
        const cells = element("div", "rh-grid-cells");
        grid.forEach(step => cells.append(element("span", `rh-grid-cell${step.includes(layer) ? ` is-layer-${layer}` : ""}`)));
        row.append(cells);
        return row;
    }));
}

function renderRhTrainerResults() {
    const t = rh.settings.trainer;
    const names = [`First (${t.a})`, `Second (${t.b})`];
    $("rhResults").replaceChildren(...[0, 1].map(layer => {
        const summary = rhTrainer.last[layer];
        const item = element("li", "rh-result");
        item.append(element("strong", "", names[layer]));
        if (!summary || !summary.count && !summary.missed) item.append(element("span", "", "Not tapped yet"));
        else {
            const ms = summary.average === null ? null : Math.round(summary.average * 1000);
            const bias = summary.bias === null ? "" : summary.bias < -0.005 ? ", early on the whole" : summary.bias > 0.005 ? ", late on the whole" : "";
            item.append(element("span", `rh-word is-${summary.word.toLowerCase().replace(/\s+/g, "-")}`, summary.word), element("span", "", ms === null ? `${summary.missed} missed` : `${ms} ms off on average${bias}${summary.missed ? `; ${summary.missed} missed` : ""}`));
        }
        return item;
    }));
    // Nothing to say until something's tapped (2.6.0).
    $("rhResults").hidden = rhTrainer.last.every(summary => !summary || (!summary.count && !summary.missed));
    const speed = t.speed;
    $("rhSteady").textContent = speed.on && rhTrainer.running ? `${rhTrainer.steady} of ${speed.every} steady cycles toward +${speed.step} BPM` : "";
}

function renderRhTrainer() {
    const t = rh.settings.trainer;
    document.querySelectorAll("#rhTrainKind [data-kind]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.kind === t.kind)));
    $("rhTrainA").value = String(t.a);
    $("rhTrainB").value = String(t.b);
    $("rhTrainSoundA").value = t.soundA;
    $("rhTrainSoundB").value = t.soundB;
    $("rhTrainAgainst").textContent = t.kind === "polymeter" ? "over" : "against";
    $("rhSpeedOn").checked = t.speed.on;
    // Speed Up's settings show while it's on (2.6.0).
    $("rhSpeedFields").hidden = !t.speed.on;
    for (const key of ["step", "every", "to"]) {
        const field = $(`rhSpeed${key[0].toUpperCase()}${key.slice(1)}`);
        if (document.activeElement !== field) field.value = String(t.speed[key]);
    }
    const button = $("rhTrainPlay");
    button.setAttribute("aria-pressed", String(rhTrainer.running));
    button.replaceChildren(MaestroIcons.create(rhTrainer.running ? "stop" : "play"), element("span", "", rhTrainer.running ? "Stop" : "Play"));
    $("rhPadA").disabled = $("rhPadB").disabled = !rhTrainer.running;
    drawRhythmCircle();
    renderRhythmTrainerGrid();
    renderRhTrainerResults();
}

function setRhTrainer(change) {
    Object.assign(rh.settings.trainer, change);
    saveRhythmState();
    // A new pair starts its cycle again.
    if (rhTrainer.running && ("kind" in change || "a" in change || "b" in change)) {
        rhTrainer.events = [];
        rhTrainer.cycles = [];
        rhTrainer.last = [null, null];
        rhTrainer.steady = 0;
    }
    renderRhTrainer();
}

// ---- Wiring

loadRhythm();
$("rhMeter").replaceChildren(...MaestroMetronome.METER_GROUPS.map(([family, meters]) => {
    const group = element("optgroup");
    group.label = family;
    group.append(...meters.map(meter => {
        const option = element("option", "", MaestroMetronome.meterLabel(meter));
        option.value = meter;
        return option;
    }));
    return group;
}));
$("rhBars").replaceChildren(...Array.from({ length: MaestroRhythm.BARS_MAX }, (_, i) => {
    const option = element("option", "", String(i + 1));
    option.value = String(i + 1);
    return option;
}));
$("rhSwing").replaceChildren(...MaestroMetronome.SWINGS.map(([value, label]) => {
    const option = element("option", "", value === 50 ? label : `${label} (${value}%)`);
    option.value = String(value);
    return option;
}));
for (const id of ["rhTrainA", "rhTrainB"]) {
    $(id).replaceChildren(...Array.from({ length: MaestroRhythm.TRAINER_MAX - MaestroRhythm.TRAINER_MIN + 1 }, (_, i) => {
        const option = element("option", "", String(i + MaestroRhythm.TRAINER_MIN));
        option.value = String(i + MaestroRhythm.TRAINER_MIN);
        return option;
    }));
}
for (const id of ["rhTrainSoundA", "rhTrainSoundB"]) {
    $(id).replaceChildren(...MaestroRhythm.SOUNDS.map(sound => {
        const option = element("option", "", MaestroRhythm.KIT[sound].label);
        option.value = sound;
        return option;
    }));
}

wireConsPopover("rhMenu", $("rhTitleButton"), $("rhMenu"));
// Spread evenly opens from whichever row's button was clicked, so it's
// registered with the popovers without a button of its own to wire.
consPopovers.rhEven = { button: $("rhRows"), panel: $("rhEvenPanel"), onOpen: () => $("rhEvenHits") };
$("rhEvenPanel").addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    toggleConsPopover("rhEven", false);
    consPopovers.rhEven.button.focus();
});
$("rhSave").addEventListener("click", () => saveRhythmFile());
$("rhSaveCopy").addEventListener("click", () => saveRhythmFile(true));
$("rhRename").addEventListener("click", startRhythmRename);
$("rhPrint").addEventListener("click", printRhythm);
$("rhCopyLink").addEventListener("click", () => {
    if (!rh.id) return;
    toggleConsPopover("rhMenu", false);
    copyMusicLink(rh.rhythm.title, { kind: "rhythm", id: rh.id });
});
$("rhNew").addEventListener("click", () => {
    toggleConsPopover("rhMenu", false);
    setRhythm(MaestroRhythm.newRhythm({ meter: rh.rhythm.meter, steps: rh.rhythm.steps }), { id: null, savedText: null, undo: rhIsSaved() ? null : "A new rhythm." });
});
$("rhTitleInput").addEventListener("keydown", event => {
    if (event.key === "Enter") endRhythmRename(true);
    if (event.key === "Escape") {
        event.stopPropagation();
        endRhythmRename(false);
    }
});
$("rhTitleInput").addEventListener("blur", () => endRhythmRename(true));
$("rhMenu").addEventListener("click", event => {
    const groove = event.target.closest("[data-groove-open]");
    if (groove) return openGroove(groove.dataset.grooveOpen);
    const open = event.target.closest("[data-rhythm-open]");
    if (open) return openRhythm(open.dataset.rhythmOpen);
    const remove = event.target.closest("[data-rhythm-delete]");
    if (remove && RH_ID.test(remove.dataset.rhythmDelete)) send("DeleteRhythm", remove.dataset.rhythmDelete);
});
$("rhPlay").addEventListener("click", toggleRhythmPlay);
$("rhClick").addEventListener("change", () => {
    rh.settings.click = $("rhClick").checked;
    saveRhythmState();
});
$("rhMeter").addEventListener("change", () => {
    if (Object.hasOwn(MaestroMetronome.METERS, $("rhMeter").value)) setRhythmShape({ meter: $("rhMeter").value });
});
$("rhSteps").addEventListener("click", event => {
    const button = event.target.closest("[data-steps]");
    if (button) setRhythmShape({ steps: Number(button.dataset.steps) });
});
$("rhBars").addEventListener("change", () => {
    const bars = Number($("rhBars").value);
    if (Number.isInteger(bars) && bars >= 1 && bars <= MaestroRhythm.BARS_MAX) setRhythmShape({ bars });
});
$("rhSwing").addEventListener("change", () => {
    const swing = Number($("rhSwing").value);
    if (MaestroMetronome.SWINGS.some(([value]) => value === swing)) changeRhythm(raw => { raw.swing = swing; });
});
$("rhAddRow").addEventListener("click", () => {
    const used = new Set(rh.rhythm.rows.map(row => row.sound));
    const sound = MaestroRhythm.SOUNDS.find(each => !used.has(each)) ?? "kick";
    changeRhythm(raw => { raw.rows.push({ sound, on: true, hits: new Array(rhFullLength()).fill(0) }); });
});
$("rhClear").addEventListener("click", () => {
    const before = rh.rhythm;
    if (!before.rows.some(row => row.hits.some(Boolean))) return;
    changeRhythm(raw => { raw.rows = raw.rows.map(row => ({ ...row, hits: row.hits.map(() => 0) })); });
    showToast("Cleared the rhythm.", { label: "Undo", run: () => setRhythm(before) });
});
// A step: a click for a hit and again for none; a right-click or Shift and a
// click for an accent.
function rhythmCell(event, accent) {
    const cell = event.target.closest("[data-cell]");
    if (!cell) return false;
    const [r, k] = cell.dataset.cell.split(":").map(Number);
    const row = rh.rhythm.rows[r];
    if (!row || !Number.isInteger(k) || k < 0 || k >= row.hits.length) return false;
    const now = row.hits[k];
    const next = accent ? (now === 2 ? 1 : 2) : now ? 0 : 1;
    changeRhythm(raw => { raw.rows[r].hits[k] = next; });
    if (next) hearDrum(row.sound, next === 2);
    $("rhRows").querySelector(`[data-cell="${r}:${k}"]`)?.focus();
    return true;
}
$("rhRows").addEventListener("click", event => {
    if (rhythmCell(event, event.shiftKey)) return;
    const on = event.target.closest("[data-row-on]");
    if (on) return changeRhythm(raw => { const r = Number(on.dataset.rowOn); raw.rows[r].on = !raw.rows[r].on; });
    const even = event.target.closest("[data-row-even]");
    if (even) return openRhythmEven(Number(even.dataset.rowEven));
    const remove = event.target.closest("[data-row-remove]");
    if (remove && rh.rhythm.rows.length > 1) {
        const before = rh.rhythm;
        const r = Number(remove.dataset.rowRemove);
        changeRhythm(raw => { raw.rows.splice(r, 1); });
        showToast(`Removed ${MaestroRhythm.KIT[before.rows[r].sound].label}.`, { label: "Undo", run: () => setRhythm(before) });
    }
});
$("rhRows").addEventListener("contextmenu", event => {
    if (!event.target.closest("[data-cell]")) return;
    event.preventDefault();
    rhythmCell(event, true);
});
$("rhRows").addEventListener("change", event => {
    const select = event.target.closest("[data-row-sound]");
    if (!select || !MaestroRhythm.SOUNDS.includes(select.value)) return;
    changeRhythm(raw => { raw.rows[Number(select.dataset.rowSound)].sound = select.value; });
    hearDrum(select.value);
});
$("rhEvenPanel").addEventListener("input", renderRhythmEvenPreview);
$("rhEvenApply").addEventListener("click", applyRhythmEven);
$("rhEvenPanel").addEventListener("keydown", event => {
    if (event.key === "Enter" && event.target.matches("input")) applyRhythmEven();
});

document.querySelectorAll("#rhTrainKind [data-kind]").forEach(button => button.addEventListener("click", () => setRhTrainer({ kind: button.dataset.kind })));
$("rhTrainA").addEventListener("change", () => setRhTrainer({ a: Number($("rhTrainA").value) }));
$("rhTrainB").addEventListener("change", () => setRhTrainer({ b: Number($("rhTrainB").value) }));
$("rhTrainSoundA").addEventListener("change", () => {
    if (MaestroRhythm.SOUNDS.includes($("rhTrainSoundA").value)) setRhTrainer({ soundA: $("rhTrainSoundA").value });
    hearDrum(rh.settings.trainer.soundA);
});
$("rhTrainSoundB").addEventListener("change", () => {
    if (MaestroRhythm.SOUNDS.includes($("rhTrainSoundB").value)) setRhTrainer({ soundB: $("rhTrainSoundB").value });
    hearDrum(rh.settings.trainer.soundB);
});
$("rhTrainPlay").addEventListener("click", () => (rhTrainer.running ? stopRhythmTrainer() : startRhythmTrainer()));
$("rhSpeedPanel").addEventListener("change", () => {
    const speed = { on: $("rhSpeedOn").checked };
    const limits = { step: [1, 20], every: [1, 16], to: [MaestroMetronome.MIN, MaestroMetronome.MAX] };
    for (const [key, [low, high]] of Object.entries(limits)) {
        const value = Number($(`rhSpeed${key[0].toUpperCase()}${key.slice(1)}`).value);
        speed[key] = Number.isInteger(value) && value >= low && value <= high ? value : rh.settings.trainer.speed[key];
    }
    setRhTrainer({ speed });
});
for (const [id, layer] of [["rhPadA", 0], ["rhPadB", 1]]) {
    $(id).addEventListener("pointerdown", event => tapRhythmTrainer(layer, event));
}
// F and J tap along, one hand a layer, while the trainer plays on this tab.
document.addEventListener("keydown", event => {
    if (!rhTrainer.running || !rhIsShown() || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.target instanceof Element && event.target.closest("input, select, textarea, [contenteditable]")) return;
    const layer = event.key === "f" || event.key === "F" ? 0 : event.key === "j" || event.key === "J" ? 1 : -1;
    if (layer < 0) return;
    event.preventDefault();
    tapRhythmTrainer(layer, event);
});

consNeckModes.rhythm = {
    render() {
        renderRhythm();
        syncRhythmTrainerFrame();
    }
};
