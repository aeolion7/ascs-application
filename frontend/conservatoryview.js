"use strict";

// The Conservatory (2.3.0): a page for playing music. Its metronome sits in a
// bar along the bottom of the page and in a Command Center module, and keeps
// playing on any page and while Maestro is hidden, until it's stopped. Its
// rules are in metronome.js; its settings are kept on this PC.

const METRO_KEY = "maestro.metronome";
const PRACTICE_KEY = "maestro.practice";
const PRACTICE_SAVE_EVERY = 30000;     // ms of playing between saves of the practice time
// How far ahead clicks are booked on the audio clock. Timers can run late when
// nobody is looking, so then it books further ahead.
const METRO_AHEAD = 0.12;
const METRO_AHEAD_UNSEEN = 1.5;
const METRO_LOUDNESS = [0.32, 0.62, 0.78, 1];
const METRO_PITCHES = { woodblock: [760, 1040, 1240, 1560], beep: [660, 880, 990, 1320] };

const metro = {
    restAfter: 8000,    // ms of quiet before the audio thread rests
    restTimer: null,
    run: null,          // this Start's own output: cut at Stop, so clicks booked ahead go silent
    settings: MaestroMetronome.parseSettings((() => { try { return localStorage.getItem(METRO_KEY); } catch { return null; } })()),
    running: false,
    starting: false,
    context: null,
    output: null,
    noise: null,
    position: { beat: 0, sub: 0 },
    bars: 0,            // bars finished since Start, after the count-in
    countLeft: 0,       // count-in bars still to play
    practice: MaestroMetronome.parsePractice((() => { try { return localStorage.getItem(PRACTICE_KEY); } catch { return null; } })()),
    practiceFrom: 0,    // performance.now() when practice time was last added
    nextAt: 0,          // when the next click sounds, on the audio clock
    timer: null,        // the booking timer, only while running
    frame: null,        // the beat lights, only while running and seen
    booked: [],         // clicks booked but not yet lit: { at, beat, weight }
    lit: -1,
    taps: []
};

function saveMetroSettings() {
    try { localStorage.setItem(METRO_KEY, JSON.stringify(metro.settings)); } catch { /* not kept */ }
}

const metroUnseen = () => document.hidden || windowIsHidden || windowIsMinimized;

// ---- Sound

function metroNoise(context) {
    if (!metro.noise) {
        const length = Math.round(context.sampleRate * 0.03);
        metro.noise = context.createBuffer(1, length, context.sampleRate);
        const samples = metro.noise.getChannelData(0);
        for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    return metro.noise;
}

function playMetroClick(at, weight) {
    const context = metro.context;
    const sound = metro.settings.sound;
    const gain = context.createGain();
    const length = sound === "beep" ? 0.09 : sound === "click" ? 0.03 : 0.055;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(METRO_LOUDNESS[weight], at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    gain.connect(metro.run);
    let source;
    if (sound === "click") {
        source = context.createBufferSource();
        source.buffer = metroNoise(context);
        const filter = context.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = weight === 3 ? 3200 : 2000;
        source.connect(filter).connect(gain);
    } else {
        source = context.createOscillator();
        source.type = sound === "beep" ? "sine" : "triangle";
        source.frequency.value = METRO_PITCHES[sound][weight];
        source.connect(gain);
    }
    source.start(at);
    source.stop(at + length + 0.02);
}

// One audio context for the page: the metronome's clicks and the tones.
function consAudio() {
    clearTimeout(metro.restTimer);
    metro.restTimer = null;
    if (!metro.context) {
        metro.context = new AudioContext({ latencyHint: "interactive" });
        metro.output = metro.context.createGain();
        metro.output.connect(metro.context.destination);
        setMetroVolume();
    }
    return metro.context;
}

// Rests the audio thread after a quiet spell. Resting at once, as sounds
// ended, could land between a new sound's start and its first sample: the
// sound then waited, frozen, and every one after it piled up behind it.
function restConsAudio() {
    clearTimeout(metro.restTimer);
    metro.restTimer = setTimeout(() => {
        metro.restTimer = null;
        if (metro.running || globalThis.consTonesSounding?.()) return;
        metro.context?.suspend().catch(() => {});
    }, metro.restAfter);
}

function setMetroVolume() {
    if (!metro.output) return;
    const level = (metro.settings.volume / 100) ** 2;
    metro.output.gain.setTargetAtTime(level, metro.context.currentTime, 0.015);
}

// ---- Timing

function bookMetroClicks() {
    metro.timer = null;
    if (!metro.running) return;
    const now = metro.context.currentTime;
    const until = now + (metroUnseen() ? METRO_AHEAD_UNSEEN : METRO_AHEAD);
    while (metro.nextAt < until) {
        const { meter, count } = metro.settings;
        // A count-in plays its beats alike, with nothing between them; a
        // muted bar is lit but silent.
        const counting = metro.countLeft > 0;
        const weight = counting ? (metro.position.sub ? 0 : 2) : MaestroMetronome.pulseWeight(metro.position, meter);
        const muted = !counting && MaestroMetronome.barIsMuted(metro.bars, metro.settings.gap);
        if (!muted && !(counting && metro.position.sub)) playMetroClick(metro.nextAt, weight);
        metro.booked.push({ at: metro.nextAt, beat: metro.position.beat, weight });
        metro.nextAt += MaestroMetronome.secondsPerClick(metro.settings.tempo, count);
        const next = MaestroMetronome.advance(metro.position, meter, count);
        metro.position = next.position;
        if (next.barEnded) metroBarEnded();
    }
    // Nothing lights while unseen, so what's past is let go.
    while (metro.booked.length && metro.booked[0].at < now - 0.25) metro.booked.shift();
    if (performance.now() - metro.practiceFrom >= PRACTICE_SAVE_EVERY) addMetroPractice();
    metro.timer = setTimeout(bookMetroClicks, 25);
}

function metroBarEnded() {
    if (metro.countLeft > 0) {
        metro.countLeft -= 1;
        renderMetroTrainer();
        return;
    }
    metro.bars += 1;
    const trainer = metro.settings.trainer;
    if (trainer.on && metro.bars % trainer.every === 0 && metro.settings.tempo < trainer.to) {
        metro.settings.tempo = MaestroMetronome.trainerNext(metro.settings.tempo, trainer);
        saveMetroSettings();
        renderMetroTempo();
    }
    renderMetroTrainer();
}

async function startMetronome() {
    if (metro.running || metro.starting) return;
    metro.starting = true;
    try {
        await consAudio().resume();
    } catch (error) {
        metro.starting = false;
        showToast("The metronome couldn't start its sound.");
        notePageError(`Metronome: ${error?.message || error}`);
        return;
    }
    metro.starting = false;
    if (metro.settings.trainer.on) metro.settings.tempo = metro.settings.trainer.from;
    metro.running = true;
    metro.run = metro.context.createGain();
    metro.run.connect(metro.output);
    metro.position = { beat: 0, sub: 0 };
    metro.bars = 0;
    metro.countLeft = metro.settings.countIn;
    metro.practiceFrom = performance.now();
    metro.booked = [];
    metro.lit = -1;
    metro.nextAt = metro.context.currentTime + 0.06;
    bookMetroClicks();
    renderMetro();
    syncMetronomeView();
}

function stopMetronome() {
    if (!metro.running) return;
    addMetroPractice();
    metro.running = false;
    clearTimeout(metro.timer);
    metro.timer = null;
    metro.booked = [];
    // Clicks already booked go silent with their output; a tone playing goes on.
    metro.run?.disconnect();
    metro.run = null;
    restConsAudio();
    saveMetroSettings();
    renderMetro();
    syncMetronomeView();
}

// Practice time: the time played since it was last added, kept by day.
function addMetroPractice() {
    if (!metro.running) return;
    const now = performance.now();
    metro.practice = MaestroMetronome.addPractice(metro.practice, new Date(), (now - metro.practiceFrom) / 1000);
    metro.practiceFrom = now;
    try { localStorage.setItem(PRACTICE_KEY, JSON.stringify(metro.practice)); } catch { /* not kept */ }
    renderMetroPractice();
}

function renderMetroPractice() {
    const { today, week } = MaestroMetronome.practiceSummary(metro.practice, new Date());
    const text = MaestroMetronome.practiceText;
    $("metroPracticeTime").textContent = today || week
        ? `Played today: ${text(today)}; the last 7 days: ${text(week)}. Counted while the metronome plays.`
        : "Time is counted while the metronome plays, and shown here and on the Command Center.";
    $("homeMetroPractice").textContent = today ? `Played today: ${text(today)}` : "";
    $("homeMetroPractice").hidden = !today;
}

const toggleMetronome = () => (metro.running ? stopMetronome() : startMetronome());

// ---- The beat lights: only while running and seen.

function metroLightsShown() {
    if (metroUnseen()) return false;
    const view = document.querySelector(".view.active")?.id;
    return view === "conservatory" || !$("metroChip").hidden || (view === "home" && !document.querySelector('#homeFace [data-module="metronome"]')?.hidden);
}

function metroFrame() {
    metro.frame = null;
    if (!metro.running || !metroLightsShown()) return;
    lightDueMetroBeat();
    metro.frame = requestAnimationFrame(metroFrame);
}

// Lights the beat of the latest click that has sounded.
function lightDueMetroBeat() {
    const now = metro.context.currentTime;
    let current = null;
    while (metro.booked.length && metro.booked[0].at <= now) current = metro.booked.shift();
    if (current && current.weight > 0 && current.beat !== metro.lit) lightMetroBeat(current.beat, current.weight);
}

function lightMetroBeat(beat, weight = 1) {
    metro.lit = beat;
    document.querySelectorAll(".metro-beats").forEach(row => {
        [...row.children].forEach((dot, index) => dot.classList.toggle("is-on", index === beat));
    });
    // The title bar's dot pulses with each beat, larger on the bar's first.
    if (!$("metroChip").hidden && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        $("metroChipDot").animate([{ transform: `scale(${weight === 3 ? 1.6 : 1.3})`, opacity: 1 }, { transform: "scale(1)", opacity: 0.5 }], { duration: 240, easing: "ease-out" });
    }
}

// The title bar's chip: while the metronome plays, on every page but this one,
// where its bar shows.
function renderMetroChip() {
    $("metroChip").hidden = !metro.running || $("conservatory").classList.contains("active");
    $("metroChipText").textContent = `${metro.settings.tempo} BPM · ${MaestroMetronome.meterLabel(metro.settings.meter)}`;
}

// Called on every page change and when Maestro is shown, hidden or minimized.
function syncMetronomeView() {
    renderMetroChip();
    const shown = metro.running && metroLightsShown();
    if (shown && metro.frame === null) metro.frame = requestAnimationFrame(metroFrame);
    if (!shown && metro.frame !== null) {
        cancelAnimationFrame(metro.frame);
        metro.frame = null;
    }
    if (!metro.running) {
        metro.lit = -1;
        document.querySelectorAll(".metro-beats > span").forEach(dot => dot.classList.remove("is-on"));
    }
    if ($("metroTrainerPanel") && !$("conservatory").classList.contains("active")) toggleMetroTrainer(false);
    globalThis.syncConservatoryTones?.();
}

// ---- Settings

function setMetroTempo(value) {
    const tempo = MaestroMetronome.clampTempo(value);
    if (tempo === null) return renderMetroTempo();
    metro.settings.tempo = tempo;
    saveMetroSettings();
    renderMetroTempo();
    renderMetroTrainer();
}

function setMetroMeter(meter) {
    if (!Object.hasOwn(MaestroMetronome.METERS, meter)) return;
    metro.settings.meter = meter;
    // A count already past the new bar's end starts a new bar.
    if (metro.position.beat >= MaestroMetronome.METERS[meter].length) metro.position = { beat: 0, sub: 0 };
    saveMetroSettings();
    renderMetro();
}

function tapMetroTempo() {
    const now = performance.now();
    metro.taps = [...metro.taps.slice(-7), now];
    const tempo = MaestroMetronome.tapTempo(metro.taps);
    if (tempo !== null) setMetroTempo(tempo);
}

// ---- Drawing

function renderMetroTempo() {
    const tempo = metro.settings.tempo;
    const name = `BPM · ${MaestroMetronome.tempoName(tempo)}`;
    if (document.activeElement !== $("metroTempo")) $("metroTempo").value = String(tempo);
    $("metroTempoName").textContent = name;
    $("homeMetroTempo").textContent = String(tempo);
    $("homeMetroName").textContent = name;
    $("metroSlower").disabled = $("homeMetroSlower").disabled = tempo <= MaestroMetronome.MIN;
    $("metroFaster").disabled = $("homeMetroFaster").disabled = tempo >= MaestroMetronome.MAX;
    renderMetroChip();
}

function renderMetroBeats() {
    const weights = MaestroMetronome.METERS[metro.settings.meter];
    document.querySelectorAll(".metro-beats").forEach(row => {
        if (row.children.length === weights.length && row.dataset.meter === metro.settings.meter) return;
        row.dataset.meter = metro.settings.meter;
        row.replaceChildren(...weights.map(weight => element("span", weight === 3 ? "is-first" : weight === 2 ? "is-lesser" : "")));
    });
}

function renderMetroTrainer() {
    const { trainer, gap, countIn } = metro.settings;
    let text = "Off";
    if (trainer.on && !metro.running) text = `${trainer.from} to ${trainer.to}, +${trainer.step} every ${trainer.every === 1 ? "bar" : `${trainer.every} bars`}`;
    else if (trainer.on && metro.settings.tempo >= trainer.to) text = `At ${trainer.to}, the top`;
    else if (trainer.on) {
        const left = MaestroMetronome.barsUntilStep(metro.bars, trainer);
        text = `${metro.settings.tempo} of ${trainer.to}, next in ${left === 1 ? "1 bar" : `${left} bars`}`;
    }
    // The button says briefly what's on, and while playing, how it's going.
    const parts = [];
    if (metro.running) {
        if (metro.countLeft > 0) parts.push("Counting in");
        if (trainer.on) parts.push(text);
        if (gap.on && metro.countLeft === 0 && MaestroMetronome.barIsMuted(metro.bars, gap)) parts.push("Muted bar");
        else if (gap.on && !trainer.on && metro.countLeft === 0) parts.push("Muted bars");
    } else {
        if (countIn) parts.push("Count-in");
        if (trainer.on) parts.push(`${trainer.from}–${trainer.to}`);
        if (gap.on) parts.push("Muted bars");
    }
    $("metroTrainerStatus").textContent = parts.join(" · ") || "Off";
    $("metroTrainerButton").classList.toggle("is-on", parts.length > 0);
    $("homeMetroTrainer").textContent = trainer.on ? `Tempo trainer: ${text}` : "";
    $("homeMetroTrainer").hidden = !trainer.on;
}

function renderMetroTrainerFields() {
    const { trainer, gap } = metro.settings;
    $("metroCountIn").value = String(metro.settings.countIn);
    $("metroGapOn").checked = gap.on;
    for (const key of ["play", "mute"]) {
        const field = $(`metroGap${key[0].toUpperCase()}${key.slice(1)}`);
        if (document.activeElement !== field) field.value = String(gap[key]);
    }
    renderMetroPractice();
    $("metroTrainerOn").checked = trainer.on;
    for (const key of ["from", "to", "step", "every"]) {
        const field = $(`metroTrainer${key[0].toUpperCase()}${key.slice(1)}`);
        if (document.activeElement !== field) field.value = String(trainer[key]);
    }
    $("metroTrainerNote").textContent = `Each Start begins at ${trainer.from} BPM and raises the tempo by ${trainer.step} every ${trainer.every === 1 ? "bar" : `${trainer.every} bars`}, then holds at ${trainer.to}.`;
}

function renderMetro() {
    const { meter, count, sound, volume } = metro.settings;
    renderMetroTempo();
    renderMetroBeats();
    renderMetroTrainer();
    $("metroMeter").value = meter;
    $("metroCount").value = count;
    $("metroSound").value = sound;
    $("metroVolume").value = String(volume);
    const running = metro.running;
    const play = $("metroPlay");
    play.setAttribute("aria-pressed", String(running));
    play.title = running ? "Stop the metronome" : "Start the metronome";
    play.setAttribute("aria-label", play.title);
    play.replaceChildren(MaestroIcons.create(running ? "stop" : "play", 24));
    $("homeMetroPlay").textContent = running ? "Stop" : "Start";
    $("homeMetroPlay").setAttribute("aria-pressed", String(running));
}

// ---- The trainer's panel

function toggleMetroTrainer(open = $("metroTrainerPanel").hidden) {
    const panel = $("metroTrainerPanel");
    if (panel.hidden === !open) return;
    panel.hidden = !open;
    $("metroTrainerButton").setAttribute("aria-expanded", String(open));
    if (open) {
        renderMetroTrainerFields();
        requestAnimationFrame(() => $("metroCountIn").focus());
    }
}

function readMetroTrainer() {
    const stored = { on: $("metroTrainerOn").checked };
    for (const key of ["from", "to", "step", "every"]) stored[key] = Number($(`metroTrainer${key[0].toUpperCase()}${key.slice(1)}`).value);
    const cleaned = MaestroMetronome.cleanTrainer(stored);
    const gapStored = { on: $("metroGapOn").checked, play: Number($("metroGapPlay").value), mute: Number($("metroGapMute").value) };
    const gap = MaestroMetronome.cleanGap(gapStored);
    const countIn = Number($("metroCountIn").value);
    const refused = ["from", "to", "step", "every"].some(key => cleaned[key] !== stored[key]) || gap.play !== gapStored.play || gap.mute !== gapStored.mute;
    metro.settings.trainer = cleaned;
    metro.settings.gap = gap;
    if (Number.isInteger(countIn) && countIn >= 0 && countIn <= MaestroMetronome.COUNT_IN_MAX) metro.settings.countIn = countIn;
    saveMetroSettings();
    renderMetroTrainerFields();
    renderMetroTrainer();
    $("metroTrainerProblem").textContent = refused ? `Tempos run from ${MaestroMetronome.MIN} to ${MaestroMetronome.MAX} BPM, with From below To; a step is 1 to 40 BPM, every 1 to 64 bars; muted bars play and mute 1 to ${MaestroMetronome.GAP_MAX} bars.` : "";
    $("metroTrainerProblem").hidden = !refused;
}

// ---- Wiring

$("metroPlay").addEventListener("click", toggleMetronome);
$("homeMetroPlay").addEventListener("click", toggleMetronome);
$("metroChipOpen").addEventListener("click", () => navigate("conservatory"));
$("metroChipStop").addEventListener("click", () => {
    stopMetronome();
    $("titlebarCommand").focus();
});
$("metroSlower").addEventListener("click", () => setMetroTempo(metro.settings.tempo - 1));
$("metroFaster").addEventListener("click", () => setMetroTempo(metro.settings.tempo + 1));
$("homeMetroSlower").addEventListener("click", () => setMetroTempo(metro.settings.tempo - 1));
$("homeMetroFaster").addEventListener("click", () => setMetroTempo(metro.settings.tempo + 1));
$("metroTempo").addEventListener("change", () => setMetroTempo($("metroTempo").value));
$("metroTempo").addEventListener("keydown", event => {
    if (event.key === "Enter") $("metroTempo").blur();
    if (event.key === "Escape") {
        $("metroTempo").value = String(metro.settings.tempo);
        $("metroTempo").blur();
    }
});
$("metroTempo").addEventListener("blur", renderMetroTempo);
// The wheel over the tempo nudges it by one.
$("metroTempoBox").addEventListener("wheel", event => {
    if (!event.deltaY) return;
    event.preventDefault();
    setMetroTempo(metro.settings.tempo + (event.deltaY < 0 ? 1 : -1));
}, { passive: false });
$("metroMeter").addEventListener("change", () => setMetroMeter($("metroMeter").value));
$("metroCount").addEventListener("change", () => {
    if (!Object.hasOwn(MaestroMetronome.COUNTS, $("metroCount").value)) return;
    metro.settings.count = $("metroCount").value;
    metro.position = { beat: metro.position.beat, sub: 0 };
    saveMetroSettings();
});
$("metroSound").addEventListener("change", () => {
    if (!Object.hasOwn(MaestroMetronome.SOUNDS, $("metroSound").value)) return;
    metro.settings.sound = $("metroSound").value;
    saveMetroSettings();
});
$("metroVolume").addEventListener("input", () => {
    const volume = Number($("metroVolume").value);
    if (!Number.isInteger(volume) || volume < 0 || volume > 100) return;
    metro.settings.volume = volume;
    setMetroVolume();
});
$("metroVolume").addEventListener("change", saveMetroSettings);
$("metroTap").addEventListener("click", tapMetroTempo);
$("metroTrainerButton").addEventListener("click", () => toggleMetroTrainer());
$("metroTrainerPanel").addEventListener("change", readMetroTrainer);
$("metroTrainerPanel").addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    toggleMetroTrainer(false);
    $("metroTrainerButton").focus();
});
document.addEventListener("pointerdown", event => {
    if (!$("metroTrainerPanel").hidden && !event.target.closest("#metroTrainerPanel, #metroTrainerButton")) toggleMetroTrainer(false);
});

$("metroMeter").replaceChildren(...MaestroMetronome.METER_GROUPS.map(([family, meters]) => {
    const group = element("optgroup");
    group.label = family;
    group.append(...meters.map(meter => {
        const option = element("option", "", MaestroMetronome.meterLabel(meter));
        option.value = meter;
        return option;
    }));
    return group;
}));
$("metroCount").replaceChildren(...Object.entries(MaestroMetronome.COUNT_LABELS).map(([value, label]) => {
    const option = element("option", "", label);
    option.value = value;
    return option;
}));
$("metroSound").replaceChildren(...Object.entries(MaestroMetronome.SOUNDS).map(([value, label]) => {
    const option = element("option", "", label);
    option.value = value;
    return option;
}));
renderMetro();
renderMetroPractice();
