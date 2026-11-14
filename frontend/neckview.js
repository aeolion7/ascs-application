"use strict";

// The Conservatory's instruments (2.3.0): the neck, or a keyboard, across the
// top of the page; Scales and Tuning beneath it; and the tones that sound a
// string or a note. Its music is in music.js; its settings are kept on this PC.

const CONS_KEY = "maestro.conservatory";
const CONS_PLUCK_CACHE = 64;
const CONS_VOICES = 24;         // notes sounding at once; the oldest is damped past this
const CONS_SHORT_FROM = 1800;   // px wide a neck must be to be drawn short (2.4.0)

const cons = {
    settings: MaestroMusic.parseSettings((() => { try { return localStorage.getItem(CONS_KEY); } catch { return null; } })()),
    chord: -1,              // the chord in the key shown, or -1 for the scale
    voices: new Set(),      // plucks sounding: { source, gain }
    starting: 0,            // plucks waiting for the audio thread to wake
    chordVoices: [],        // the last chord's notes, damped when the next is played
    steady: null,           // the steady tone: { midi, oscillator, gain }
    drone: null,            // the drone on the root: { midi, oscillator, gain }
    scalePlay: null,        // the scale being played: { voices, timer }
    plucks: new Map(),      // pluck buffers by pitch and A4, newest last
    tonesOut: null,
    wave: null
};

function saveConsSettings() {
    try { localStorage.setItem(CONS_KEY, JSON.stringify(cons.settings)); } catch { /* not kept */ }
}

const consKeyboard = () => cons.settings.instrument === "keyboard";
// A chord is strummed on strings, its notes a moment apart, and played on a
// keyboard, its notes together (2.4.0).
const consChordSpread = (strummed = 0.05) => consKeyboard() ? 0 : strummed;
const consChordVerb = () => consKeyboard() ? "Play" : "Strum";

// What another section shows on the neck, by its name (practiceview.js adds
// Finder and Quiz, chordsview.js Chords, progressionview.js Progressions):
// { mark(midi, string, fret), key(midi), nameOf(midi), click(midi, { string, fret }),
// render(), lit(), short }, or draw() for a section that draws the neck module itself.
const consNeckModes = {};

// The position shown, as [first fret, last fret], or null for the whole neck.
function consPosition() {
    if (consKeyboard() || cons.settings.position < 0) return null;
    const frets = MaestroMusic.INSTRUMENTS[cons.settings.instrument].frets;
    if (!MaestroMusic.positionsFor(frets).includes(cons.settings.position)) return null;
    return [cons.settings.position, cons.settings.position + MaestroMusic.POSITION_SPAN - 1];
}

// ---- Tones

// A function declaration, so conservatoryview.js reaches it on globalThis (a const isn't there).
function consTonesSounding() {
    return cons.voices.size > 0 || cons.steady !== null || cons.drone !== null || cons.starting > 0;
}

// The tones' output, through a limiter, so notes that ring together don't clip.
function consToneOutput(context) {
    if (!cons.tonesOut) {
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -10;
        limiter.knee.value = 6;
        limiter.ratio.value = 12;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.25;
        limiter.connect(context.destination);
        cons.tonesOut = context.createGain();
        cons.tonesOut.gain.value = 0.55;
        cons.tonesOut.connect(limiter);
    }
    return cons.tonesOut;
}

async function readyConsAudio() {
    try {
        const context = consAudio();
        await context.resume();
        return context;
    } catch (error) {
        showToast("The Conservatory couldn't start its sound.");
        notePageError(`Conservatory: ${error?.message || error}`);
        return null;
    }
}

function pluckBuffer(context, midi) {
    const key = `${midi}@${cons.settings.a4}@${context.sampleRate}`;
    let buffer = cons.plucks.get(key);
    if (buffer) {
        cons.plucks.delete(key);
    } else {
        const samples = MaestroMusic.pluckSamples(MaestroMusic.frequency(midi, cons.settings.a4), context.sampleRate);
        buffer = context.createBuffer(1, samples.length, context.sampleRate);
        buffer.copyToChannel(samples, 0);
        if (cons.plucks.size >= CONS_PLUCK_CACHE) cons.plucks.delete(cons.plucks.keys().next().value);
    }
    cons.plucks.set(key, buffer);
    return buffer;
}

// A voice fades out in a few milliseconds, as a hand on the strings would.
function dampConsVoice(voice) {
    if (!cons.voices.has(voice)) return;
    const now = metro.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0, now, 0.012);
    voice.source.stop(now + 0.08);
}

// One plucked note, started at `when` into `destination`; it lets go of its
// nodes when it ends. The loop of Progressions books its chords with it too.
function startConsVoice(context, midi, when, destination) {
    const source = context.createBufferSource();
    source.buffer = pluckBuffer(context, midi);
    source.playbackRate.value = MaestroMusic.pluckPeriod(MaestroMusic.frequency(midi, cons.settings.a4), context.sampleRate).playbackRate;
    const gain = context.createGain();
    source.connect(gain).connect(destination);
    source.addEventListener("ended", () => {
        source.disconnect();
        gain.disconnect();
    });
    source.start(when);
    return { source, gain };
}

// Plucks notes together, each `spread` seconds after the last. The audio
// thread is woken once, before any is booked.
// `spread` may instead list each note's start in seconds, and `ends` when each
// is damped (2.4.0: a progression's chords, each stopping as the next sounds).
async function pluckConsNotes(midis, spread = 0, ends = null) {
    cons.starting += 1;
    let context;
    try {
        context = await readyConsAudio();
    } finally {
        cons.starting -= 1;
    }
    if (!context) return [];
    const now = context.currentTime;
    return midis.map((midi, at) => {
        while (cons.voices.size >= CONS_VOICES) {
            const oldest = cons.voices.values().next().value;
            dampConsVoice(oldest);
            cons.voices.delete(oldest);
        }
        const voice = startConsVoice(context, midi, now + (Array.isArray(spread) ? spread[at] : at * spread), consToneOutput(context));
        if (ends?.[at] !== undefined && ends[at] !== null) {
            voice.gain.gain.setTargetAtTime(0, now + ends[at], 0.04);
            voice.source.stop(now + ends[at] + 0.3);
        }
        cons.voices.add(voice);
        voice.source.addEventListener("ended", () => {
            cons.voices.delete(voice);
            restConsAudio();
        });
        return voice;
    });
}

const pluckConsNote = midi => pluckConsNotes([midi]);

// A held tone with a few overtones, so a low string is heard on small speakers.
function holdConsTone(context, midi, level) {
    cons.wave ??= context.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.5, 0.25, 0.12]));
    const oscillator = context.createOscillator();
    oscillator.setPeriodicWave(cons.wave);
    oscillator.frequency.value = MaestroMusic.frequency(midi, cons.settings.a4);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(level, context.currentTime + 0.04);
    oscillator.connect(gain).connect(consToneOutput(context));
    oscillator.start();
    return { midi, oscillator, gain };
}

function releaseConsTone(tone) {
    const now = metro.context.currentTime;
    tone.gain.gain.setTargetAtTime(0.0001, now, 0.02);
    tone.oscillator.stop(now + 0.15);
    tone.oscillator.addEventListener("ended", restConsAudio);
}

async function startSteadyTone(midi) {
    stopSteadyTone();
    const context = await readyConsAudio();
    if (!context) return;
    cons.steady = holdConsTone(context, midi, 0.35);
    renderConsStrings();
}

function stopSteadyTone() {
    const steady = cons.steady;
    if (!steady) return;
    cons.steady = null;
    releaseConsTone(steady);
    renderConsStrings();
}

// ---- Practice: a drone on the root, and the scale played at the metronome's tempo.

// The root in the second octave (C2 to B2), under anything played.
const consDroneMidi = () => 36 + MaestroMusic.pitchClass(cons.settings.root);

async function startConsDrone() {
    stopConsDrone();
    cons.starting += 1;
    let context;
    try {
        context = await readyConsAudio();
    } finally {
        cons.starting -= 1;
    }
    if (!context) return;
    cons.drone = holdConsTone(context, consDroneMidi(), 0.22);
    renderConsHear();
}

function stopConsDrone() {
    const drone = cons.drone;
    if (!drone) return;
    cons.drone = null;
    releaseConsTone(drone);
    renderConsHear();
}

// A new root moves the drone to it, gliding.
function retuneConsDrone() {
    const drone = cons.drone;
    if (!drone || drone.midi === consDroneMidi()) return;
    drone.midi = consDroneMidi();
    drone.oscillator.frequency.setTargetAtTime(MaestroMusic.frequency(drone.midi, cons.settings.a4), metro.context.currentTime, 0.03);
}

// What's shown, up an octave from the root near C3 and back down, a note a
// beat at the metronome's tempo.
async function playConsScale() {
    stopConsScale();
    const shown = consShownNotes();
    if (!shown.length) return;
    const base = 48 + shown[0].pc;
    const up = shown.map(note => base + (note.pc - shown[0].pc + 12) % 12);
    const midis = [...up, base + 12, ...up.slice(1).reverse(), base];
    const spread = 60 / metro.settings.tempo;
    const playing = { voices: [], timer: null };
    playing.timer = setTimeout(() => {
        if (cons.scalePlay !== playing) return;
        cons.scalePlay = null;
        renderConsHear();
    }, (midis.length * spread + 0.6) * 1000);
    cons.scalePlay = playing;
    renderConsHear();
    const voices = await pluckConsNotes(midis, spread);
    if (cons.scalePlay === playing) playing.voices = voices;
    else voices.forEach(dampConsVoice);
}

function stopConsScale() {
    const playing = cons.scalePlay;
    if (!playing) return;
    cons.scalePlay = null;
    clearTimeout(playing.timer);
    playing.voices.forEach(dampConsVoice);
    renderConsHear();
}

function renderConsHear() {
    const drone = $("consDrone");
    const name = cons.settings.root;
    drone.setAttribute("aria-pressed", String(cons.drone !== null));
    drone.title = cons.drone ? `Stop the drone on ${name}` : `Hold ${name} low under everything, until clicked again`;
    const play = $("consPlayScale");
    const what = cons.chord >= 0 ? "chord" : "scale";
    play.setAttribute("aria-pressed", String(cons.scalePlay !== null));
    play.textContent = cons.scalePlay ? "Stop" : `Play ${what}`;
    play.title = cons.scalePlay ? "Stop playing" : `Play the ${what} up an octave and back, a note a beat at ${metro.settings.tempo} BPM`;
}

function soundConsString(midi) {
    if (cons.settings.tone === "steady") {
        if (cons.steady?.midi === midi) stopSteadyTone();
        else startSteadyTone(midi);
    } else {
        pluckConsNote(midi);
    }
}

// Called when the page changes: a held tone, the drone and a scale playing
// end when you leave it.
function syncConservatoryTones() {
    if ($("conservatory").classList.contains("active")) return;
    stopSteadyTone();
    stopConsDrone();
    stopConsScale();
}

// ---- What the neck and keyboard show

// The key's chords, triads or sevenths as chosen, and what's shown: the
// chosen chord's notes, or the scale's.
const consChords = () => MaestroMusic.chordsInKey(cons.settings.root, cons.settings.scale, cons.settings.sevenths ? 4 : 3);
const consShownNotes = () => consChords()[cons.chord]?.tones ?? MaestroMusic.scaleNotes(cons.settings.root, cons.settings.scale);

// The notes to mark, by pitch class: the scale, or a chord in its key. With
// Every note, the other notes join them, quieter, labeled from the same root.
function consMarked() {
    const { root, scale, labels, degreeStyle, show } = cons.settings;
    const label = note => labels !== "degrees" ? note.name : degreeStyle === "interval" ? note.interval : note.degree;
    const chord = consChords()[cons.chord];
    const notes = consShownNotes();
    const marked = new Map(notes.map((note, index) => [note.pc, { kind: index === 0 ? "root" : "note", label: label(note) }]));
    if (show !== "all") return marked;
    for (const [pc, note] of MaestroMusic.everyNote(chord ? chord.tones[0].name : root, notes)) {
        if (!marked.has(pc)) marked.set(pc, { kind: "other", label: label(note) });
    }
    return marked;
}

// Every pitch class's name as the key spells it: the scale's (or the chord's)
// notes as spelled, the others the way the key leans (D♭ in F, C♯ in G). A
// note's tooltip uses it, so it says what its label says.
function consNoteNames() {
    const chord = consChords()[cons.chord];
    const notes = consShownNotes();
    const names = new Map();
    const root = cons.settings.root;
    for (const [pc, note] of MaestroMusic.everyNote(chord ? chord.tones[0].name : root, notes)) names.set(pc, note.name);
    return midi => names.get(((midi % 12) + 12) % 12);
}

// ---- Chord symbols (2.3.0): Libre Bodoni, with Bravura Text's accidentals and signs.

const SYMBOL_ACCIDENTALS = Object.freeze({ "\u266D": "\uED60", "\u266F": "\uED62", "\u{1D12A}": "\uED63", "\u{1D12B}": "\uED64" });

// Text in the symbol's face, its accidentals and signs in Bravura Text.
function symbolRuns(text, className = "") {
    const span = element("span", className);
    let plain = "";
    const flush = () => {
        if (plain) span.append(document.createTextNode(plain));
        plain = "";
    };
    for (const character of text) {
        const code = character.codePointAt(0);
        if (Object.hasOwn(SYMBOL_ACCIDENTALS, character)) {
            flush();
            span.append(element("span", "csym-acc", SYMBOL_ACCIDENTALS[character]));
        } else if (code >= 0xE000 && code <= 0xF8FF) {
            flush();
            span.append(element("span", "csym-sign", character));
        } else plain += character;
    }
    flush();
    return span;
}

// A chord's name as a symbol, in the style chosen: big (the Chords tab's
// card), small (saved chords) or list (chord buttons). Big stacks several
// alterations in brackets; the others write them on one line. A name Maestro
// doesn't write stays as it was typed.
function chordSymbol(name, size = "small", style = cons.settings.chordStyle) {
    const parts = MaestroMusic.chordSymbolParts(name, style);
    const box = element("span", `csym is-${size}`);
    box.setAttribute("role", "img");
    box.setAttribute("aria-label", name);
    if (!parts) {
        box.classList.add("is-free");
        box.append(symbolRuns(name));
        return box;
    }
    box.append(element("span", "csym-root", parts.letter));
    if (parts.accidental) box.append(symbolRuns(parts.accidental, "csym-root-acc"));
    if (parts.q) box.append(symbolRuns(parts.q, "csym-q"));
    const stacked = parts.alterations && size === "big";
    const raised = parts.sup + (parts.alterations && !stacked ? parts.alterations.join("") : "");
    if (raised) box.append(symbolRuns(raised, "csym-sup"));
    if (parts.stack) {
        const stack = element("span", "csym-stack");
        parts.stack.forEach(line => stack.append(symbolRuns(line)));
        box.append(stack);
    }
    if (stacked) {
        const column = element("span", "csym-stack");
        [...parts.alterations].reverse().forEach(line => column.append(symbolRuns(line)));
        const brackets = element("span", "csym-alts");
        brackets.append(element("span", "csym-paren", "("), column, element("span", "csym-paren", ")"));
        box.append(brackets);
    }
    if (parts.bass) {
        box.append(element("span", "csym-slash", "/"), element("span", "csym-bass", parts.bass[0]));
        if (parts.bass.length > 1) box.append(symbolRuns(parts.bass.slice(1), "csym-bass-acc"));
    }
    return box;
}

// Short (Progressions, 2.4.0) draws it wider for its height, so it stands
// about two-thirds as tall across the same width.
function drawConsNeck(tuning, frets, mark, nameOf, { capo = 0, lefty = false, lit = null, short = false } = {}) {
    const strings = tuning.pitches.length;
    const width = short ? 2700 : 2000, left = 76, right = 26, top = 30;
    const gap = Math.round((strings >= 6 ? 46 : strings === 5 ? 50 : 56) * (short ? 0.87 : 1));
    const bottom = top + gap * (strings - 1);
    const height = bottom + top + 36;
    const span = width - left - right;
    const reach = span / (1 - 2 ** (-frets / 12));
    // Left-handed, the drawing is mirrored: the nut on the right.
    const flip = x => lefty ? width - x : x;
    const fretX = fret => flip(left + reach * (1 - 2 ** (-fret / 12)));
    const middle = fret => fret === 0 ? flip(left - 38) : (fretX(fret - 1) + fretX(fret)) / 2;
    const stringY = index => top + gap * (strings - 1 - index);
    const svg = svgNode("svg", { class: "cons-neck", viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": `${MaestroMusic.INSTRUMENTS[cons.settings.instrument].label} neck, ${tuning.label}` });
    svg.append(svgNode("rect", { class: "cons-board", x: lefty ? right : left, y: top - 18, width: span, height: bottom - top + 36, rx: 6 }));
    for (const fret of [3, 5, 7, 9, 15, 17, 19, 21]) {
        if (fret <= frets) svg.append(svgNode("circle", { class: "cons-inlay", cx: middle(fret), cy: (top + bottom) / 2, r: 9 }));
    }
    if (frets >= 12) {
        svg.append(svgNode("circle", { class: "cons-inlay", cx: middle(12), cy: (top + bottom) / 2 - gap, r: 9 }),
            svgNode("circle", { class: "cons-inlay", cx: middle(12), cy: (top + bottom) / 2 + gap, r: 9 }));
    }
    for (let fret = 0; fret <= frets; fret++) {
        svg.append(svgNode("line", { class: fret === 0 ? "cons-nut" : "cons-fret", x1: fretX(fret), y1: top - 18, x2: fretX(fret), y2: bottom + 18 }));
        if (fret > 0) {
            const number = svgNode("text", { class: "cons-fret-number", x: middle(fret), y: height - 6 });
            number.textContent = String(fret);
            svg.append(number);
        }
    }
    tuning.pitches.forEach((_, index) => {
        svg.append(svgNode("line", { class: "cons-string", x1: flip(left - 64), y1: stringY(index), x2: flip(width - right), y2: stringY(index), "stroke-width": (1.4 + (strings - 1 - index) * 0.6).toFixed(1) }));
    });
    const radius = Math.min(gap * 0.42, 22);
    // A position is lit behind its frets.
    if (lit) {
        const from = lit[0] === 0 ? flip(left - 64) : fretX(lit[0] - 1);
        const to = fretX(lit[1]);
        svg.insertBefore(svgNode("rect", { class: "cons-window", x: Math.min(from, to), y: top - 22, width: Math.abs(to - from), height: bottom - top + 44, rx: 8 }), svg.querySelector(".cons-inlay, .cons-fret, .cons-nut"));
    }
    // A capo just behind its fret; nothing below it is marked.
    if (capo > 0) {
        const at = fretX(capo) + (fretX(capo - 1) - fretX(capo)) * 0.22;
        svg.append(svgNode("rect", { class: "cons-capo", x: at - 7, y: top - 24, width: 14, height: bottom - top + 48, rx: 7 }));
    }
    tuning.pitches.forEach((open, index) => {
        for (let fret = capo; fret <= frets; fret++) {
            const shown = mark(open + fret, index, fret);
            if (!shown) continue;
            const dot = svgNode("g", { class: `cons-dot is-${shown.kind}`, "data-midi": open + fret, "data-string": index, "data-fret": fret });
            const title = svgNode("title", {});
            // A name of "?" (a quiz's question) stays a question.
            const named = nameOf(open + fret);
            title.textContent = `${named === "?" ? "?" : MaestroMusic.spelledPitch(open + fret, named)}, string ${strings - index}, ${fret ? `fret ${fret}` : "open"}`;
            dot.append(title, svgNode("circle", { cx: middle(fret), cy: stringY(index), r: radius }));
            const text = svgNode("text", { x: middle(fret), y: stringY(index) + 7 });
            text.textContent = shown.label;
            dot.append(text);
            svg.append(dot);
        }
    });
    return svg;
}

function drawConsKeys(low, high, mark, label, nameOf) {
    const whiteWidth = 64, height = 230, blackWidth = 40, blackHeight = 138;
    const whites = [], blacks = [];
    let at = 0;
    for (let midi = low; midi <= high; midi++) {
        if ([1, 3, 6, 8, 10].includes(midi % 12)) blacks.push({ midi, x: at * whiteWidth - blackWidth / 2 });
        else whites.push({ midi, x: at++ * whiteWidth });
    }
    const svg = svgNode("svg", { class: "cons-keys", viewBox: `0 0 ${at * whiteWidth} ${height}`, role: "img", "aria-label": label });
    const key = (spot, black) => {
        const group = svgNode("g", { class: `cons-key${black ? " is-black" : ""}`, "data-midi": spot.midi });
        const title = svgNode("title", {});
        const named = nameOf(spot.midi);
        title.textContent = named === "?" ? "?" : MaestroMusic.spelledPitch(spot.midi, named);
        group.append(title, svgNode("rect", black
            ? { x: spot.x, y: 0, width: blackWidth, height: blackHeight, rx: 5 }
            : { x: spot.x + 1, y: 0, width: whiteWidth - 2, height, rx: 6 }));
        const shown = mark(spot.midi);
        if (shown) {
            const cx = spot.x + (black ? blackWidth / 2 : whiteWidth / 2);
            const cy = black ? blackHeight - 26 : height - 34;
            group.append(svgNode("circle", { class: `cons-key-dot is-${shown.kind}`, cx, cy, r: black ? 17 : 21 }));
            const text = svgNode("text", { class: `cons-key-label is-${shown.kind}`, x: cx, y: cy + 6 });
            text.textContent = shown.label;
            group.append(text);
        }
        return group;
    };
    svg.append(...whites.map(spot => key(spot, false)), ...blacks.map(spot => key(spot, true)));
    return svg;
}

// ---- Drawing the page

function renderConsNeck() {
    // Chords draws its own: five frets (or the keys) and the chord as written.
    const draw = consNeckModes[consSections.current()]?.draw;
    if (draw) {
        $("consNeck").replaceChildren(draw());
        $("consNeckModule").classList.toggle("is-keyboard", consKeyboard());
        return;
    }
    const marked = consMarked();
    const keyNames = consNoteNames();
    const tuning = MaestroMusic.currentTuning(cons.settings);
    const tuningShown = consSections.current() === "tuning";
    const mode = consNeckModes[consSections.current()];
    // Tuning names the open strings as the tuning does (E♭ standard in flats).
    const tuningNames = midi => MaestroMusic.pitchName(midi, tuning.flats).replace(/-?\d+$/, "");
    let drawing;
    if (consKeyboard()) {
        const { low, high } = MaestroMusic.INSTRUMENTS.keyboard;
        const key = mode ? mode.key : midi => tuningShown ? (midi === 69 ? { kind: "root", label: "A" } : null) : marked.get(midi % 12);
        drawing = drawConsKeys(low, high, key, "Keyboard", mode?.nameOf ?? keyNames);
    } else {
        const frets = MaestroMusic.INSTRUMENTS[cons.settings.instrument].frets;
        const open = (midi, index, fret) => fret === 0
            ? { kind: cons.steady?.midi === midi ? "root" : "note", label: tuningNames(midi) }
            : null;
        const position = consPosition();
        const scales = (midi, index, fret) => !position || (fret >= position[0] && fret <= position[1]) ? marked.get(midi % 12) : null;
        // Shorter only where it's wide enough that its labels stay readable.
        const short = Boolean(mode?.short) && $("consNeck").clientWidth >= CONS_SHORT_FROM;
        if (mode) drawing = drawConsNeck(tuning, frets, mode.mark, mode.nameOf, { lefty: cons.settings.lefty, lit: mode.lit?.() ?? null, short });
        else if (tuningShown) drawing = drawConsNeck(tuning, frets, open, tuningNames, { lefty: cons.settings.lefty });
        else drawing = drawConsNeck(tuning, frets, scales, keyNames, { capo: cons.settings.capo, lefty: cons.settings.lefty, lit: position });
    }
    $("consNeck").replaceChildren(drawing);
    $("consNeckModule").classList.toggle("is-keyboard", consKeyboard());
}

function renderConsToolbar() {
    const { instrument } = cons.settings;
    document.querySelectorAll("#consInstruments [data-instrument]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.instrument === instrument)));
    const select = $("consTuning");
    $("consTuningField").hidden = consKeyboard();
    $("consNeckOptions").hidden = consKeyboard();
    // Chords are built at their real frets, and Progressions marks a chord's
    // notes everywhere, so the capo isn't offered there.
    $("consCapo").closest("label").hidden = ["chords", "progressions"].includes(consSections.current());
    $("consCapo").value = String(cons.settings.capo);
    $("consLefty").setAttribute("aria-pressed", String(cons.settings.lefty));
    if (consKeyboard()) return;
    const current = MaestroMusic.currentTuning(cons.settings);
    const option = tuning => {
        const node = element("option", "", `${tuning.label ?? tuning.name} · ${MaestroMusic.tuningNotes(tuning)}`);
        node.value = tuning.id;
        return node;
    };
    const list = MaestroMusic.tuningsFor(instrument, cons.settings.own);
    const builtIn = list.filter(tuning => !tuning.own).map(option);
    const own = list.filter(tuning => tuning.own);
    if (own.length) {
        const group = element("optgroup");
        group.label = "Yours";
        group.append(...own.map(option));
        select.replaceChildren(...builtIn, group);
    } else {
        select.replaceChildren(...builtIn);
    }
    select.value = current.id;
}

function renderConsScales() {
    const { root, scale, labels } = cons.settings;
    $("consRoot").value = root;
    $("consScale").value = scale;
    document.querySelectorAll("#consLabels [data-labels]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.labels === labels)));
    document.querySelectorAll("#consShow [data-show]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.show === cons.settings.show)));
    document.querySelectorAll("#consDegreeStyle [data-degree-style]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.degreeStyle === cons.settings.degreeStyle)));
    $("consDegreeStyle").hidden = labels !== "degrees";
    $("consPositionField").hidden = consKeyboard();
    if (!consKeyboard()) {
        const starts = MaestroMusic.positionsFor(MaestroMusic.INSTRUMENTS[cons.settings.instrument].frets);
        const whole = element("option", "", "Whole neck");
        whole.value = "-1";
        $("consPosition").replaceChildren(whole, ...starts.map(from => {
            const option = element("option", "", `Frets ${from}–${from + MaestroMusic.POSITION_SPAN - 1}`);
            option.value = String(from);
            return option;
        }));
        $("consPosition").value = String(consPosition()?.[0] ?? -1);
    }
    const notes = MaestroMusic.scaleNotes(root, scale);
    const chords = consChords();
    const capo = consKeyboard() ? 0 : cons.settings.capo;
    if (cons.chord >= chords.length) cons.chord = -1;
    const chord = chords[cons.chord];
    const shownNotes = chord ? chord.tones : notes;
    $("consNotes").replaceChildren(...shownNotes.map((note, index) => element("span", index === 0 ? "is-root" : "", note.name)));
    $("consNotesWhat").textContent = chord ? `${chord.name}, the ${chord.numeral} chord` : `${root} ${MaestroMusic.SCALES[scale].label.replace(/ \(.*\)$/, "").toLowerCase()}`;
    const title = MaestroMusic.SCALES[scale].label.replace(/ \(.*\)$/, "").replace(/\b\w/g, letter => letter.toUpperCase());
    $("consChordsTitle").textContent = `Diatonic Chords in ${root} ${title}`;
    $("consKeyChords").replaceChildren(...chords.map((each, index) => {
        const button = element("button", "key-chord");
        button.type = "button";
        button.dataset.chord = String(index);
        button.setAttribute("aria-pressed", String(index === cons.chord));
        button.title = `Show ${each.name} on the neck, and hear it`;
        const name = element("span", "key-name");
        name.append(chordSymbol(each.name, cons.settings.sevenths ? "list" : "small"));
        button.append(element("span", "key-numeral", each.numeral), name);
        // With a capo, the shape it's fingered as.
        if (capo) button.append(element("span", "key-shape", `${MaestroMusic.capoShape(each.name, capo)} shape`));
        return button;
    }));
    document.querySelectorAll("#consChordSize [data-sevenths]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.sevenths === String(cons.settings.sevenths))));
    $("consChordSize").hidden = !chords.length;
    $("consKeyChords").hidden = !chords.length;
    $("consKeyChords").classList.toggle("is-sevenths", cons.settings.sevenths);
    $("consChordsNote").textContent = chords.length
        ? (chord ? "Click it again to show the whole scale." : "Click a chord to see its notes on the neck, and hear it.")
        : "Chords are listed for scales of seven notes.";
    $("consKeyboardModule").hidden = consKeyboard();
    $("consScaleGrid").classList.toggle("is-single", consKeyboard());
    if (!consKeyboard()) {
        const marked = consMarked();
        $("consKeyboard").replaceChildren(drawConsKeys(48, 71, midi => marked.get(midi % 12), "Two octaves of a keyboard, from C3", consNoteNames()));
    }
    renderConsHear();
}

function renderConsStrings() {
    const strings = $("consStrings");
    const tuning = consKeyboard() ? { pitches: [69], flats: false } : MaestroMusic.currentTuning(cons.settings);
    strings.replaceChildren(...tuning.pitches.map(midi => {
        const button = element("button", "tuning-string");
        button.type = "button";
        button.dataset.midi = String(midi);
        const name = MaestroMusic.pitchName(midi, tuning.flats);
        const [, letter, octave] = /^(.*?)(-?\d+)$/.exec(name);
        const label = element("strong", "", letter);
        label.append(element("sub", "", octave));
        button.append(label, element("span", "", `${MaestroMusic.frequency(midi, cons.settings.a4).toFixed(1)} Hz`));
        const on = cons.steady?.midi === midi;
        button.classList.toggle("is-playing", on);
        button.setAttribute("aria-pressed", String(on));
        button.title = cons.settings.tone === "steady" ? (on ? `Stop ${name}` : `Hold ${name} until stopped`) : `Pluck ${name}`;
        return button;
    }));
    strings.dataset.count = String(tuning.pitches.length);
    $("consTone").value = cons.settings.tone;
    if (document.activeElement !== $("consA4")) $("consA4").value = String(cons.settings.a4);
    $("consToneStop").hidden = !cons.steady;
    if ($("conservatory").classList.contains("active") && consSections.current() === "tuning") renderConsNeck();
}

function renderConsTunings() {
    const list = $("consTunings");
    $("consTuningsModule").hidden = consKeyboard();
    if (consKeyboard()) return;
    const current = MaestroMusic.currentTuning(cons.settings);
    list.replaceChildren(...MaestroMusic.tuningsFor(cons.settings.instrument, cons.settings.own).map(tuning => {
        const row = element("li", tuning.id === current.id ? "is-current" : "");
        const choose = element("button", "cons-tuning-choose");
        choose.type = "button";
        choose.dataset.tuning = tuning.id;
        choose.setAttribute("aria-pressed", String(tuning.id === current.id));
        choose.append(element("strong", "", tuning.label ?? tuning.name), element("span", "", MaestroMusic.tuningNotes(tuning)));
        row.append(choose);
        if (tuning.own) {
            row.append(element("em", "", "Yours"));
            const remove = element("button", "cons-tuning-delete");
            remove.type = "button";
            remove.dataset.deleteTuning = tuning.id;
            remove.title = `Delete ${tuning.name}`;
            remove.setAttribute("aria-label", `Delete ${tuning.name}`);
            remove.append(MaestroIcons.create("trash"));
            row.append(remove);
        }
        return row;
    }));
    $("consNewTuning").disabled = cons.settings.own.length >= MaestroMusic.OWN_MAX;
}

function renderConservatory() {
    renderConsToolbar();
    renderConsScales();
    renderConsStrings();
    renderConsTunings();
    consNeckModes[consSections.current()]?.render?.();
    renderConsNeck();
}

// ---- Changes

// The neck's capo and hand, kept for every stringed instrument.
function setConsNeck(changes) {
    Object.assign(cons.settings, changes);
    saveConsSettings();
    renderConsToolbar();
    renderConsScales();
    renderConsNeck();
}

function chooseConsInstrument(instrument) {
    if (!Object.hasOwn(MaestroMusic.INSTRUMENTS, instrument)) return;
    stopSteadyTone();
    closeConsTuningForm();
    cons.settings.instrument = instrument;
    saveConsSettings();
    renderConservatory();
}

function chooseConsTuning(id) {
    if (!MaestroMusic.tuningsFor(cons.settings.instrument, cons.settings.own).some(tuning => tuning.id === id)) return;
    stopSteadyTone();
    cons.settings.tunings[cons.settings.instrument] = id;
    saveConsSettings();
    renderConservatory();
}

function setConsScale(changes) {
    Object.assign(cons.settings, changes);
    if ("root" in changes || "scale" in changes) {
        cons.chord = -1;
        stopConsScale();
    }
    retuneConsDrone();
    saveConsSettings();
    renderConsScales();
    renderConsNeck();
}

function chooseConsChord(index) {
    cons.chord = cons.chord === index ? -1 : index;
    stopConsScale();
    renderConsScales();
    renderConsNeck();
    // The chord before stops ringing, as a new strum stops the last.
    cons.chordVoices.forEach(dampConsVoice);
    cons.chordVoices = [];
    const chord = consChords()[cons.chord];
    if (!chord) return;
    // Sounded upward from the root, near middle C.
    const rootMidi = 48 + chord.tones[0].pc;
    const midis = chord.tones.map(tone => rootMidi + (tone.pc - chord.tones[0].pc + 12) % 12);
    pluckConsNotes(midis, 0.05).then(voices => { cons.chordVoices = voices; });
}

// ---- Tunings of your own

function openConsTuningForm() {
    const current = MaestroMusic.currentTuning(cons.settings);
    $("consTuningName").value = "";
    $("consTuningPitches").replaceChildren(...current.pitches.map((midi, index) => {
        const field = element("label", "cons-pitch");
        const number = current.pitches.length - index;
        field.htmlFor = `consPitch${index}`;
        field.append(element("span", "", `String ${number}`));
        const select = element("select");
        select.id = `consPitch${index}`;
        for (let pitch = Math.max(MaestroMusic.LOWEST, midi - 12); pitch <= Math.min(MaestroMusic.HIGHEST, midi + 12); pitch++) {
            const option = element("option", "", MaestroMusic.pitchName(pitch, current.flats));
            option.value = String(pitch);
            select.append(option);
        }
        select.value = String(midi);
        field.append(select);
        return field;
    }));
    $("consTuningProblem").hidden = true;
    $("consTuningForm").hidden = false;
    $("consNewTuning").hidden = true;
    requestAnimationFrame(() => $("consTuningName").focus());
}

function closeConsTuningForm() {
    $("consTuningForm").hidden = true;
    $("consNewTuning").hidden = false;
}

function saveConsTuning(event) {
    event.preventDefault();
    const pitches = [...$("consTuningPitches").querySelectorAll("select")].map(select => Number(select.value));
    const tuning = MaestroMusic.cleanOwnTuning({
        id: `own-${Date.now().toString(36)}`,
        name: $("consTuningName").value,
        instrument: cons.settings.instrument,
        pitches
    });
    if (!tuning || cons.settings.own.length >= MaestroMusic.OWN_MAX) {
        $("consTuningProblem").textContent = "Give it a name of 1 to 40 characters.";
        $("consTuningProblem").hidden = false;
        return;
    }
    cons.settings.own.push(tuning);
    cons.settings.tunings[cons.settings.instrument] = tuning.id;
    saveConsSettings();
    closeConsTuningForm();
    renderConservatory();
}

function deleteConsTuning(id) {
    const at = cons.settings.own.findIndex(tuning => tuning.id === id);
    if (at < 0) return;
    const [gone] = cons.settings.own.splice(at, 1);
    const wasChosen = cons.settings.tunings[gone.instrument] === id;
    if (wasChosen) delete cons.settings.tunings[gone.instrument];
    saveConsSettings();
    renderConservatory();
    showToast(`Deleted "${gone.name}".`, { label: "Undo", run: () => {
        if (cons.settings.own.length >= MaestroMusic.OWN_MAX) return;
        cons.settings.own.splice(Math.min(at, cons.settings.own.length), 0, gone);
        if (wasChosen) cons.settings.tunings[gone.instrument] = gone.id;
        saveConsSettings();
        renderConservatory();
    } });
}

// ---- Wiring

const consSections = MaestroSections.create($("consTabs"), {
    initial: cons.settings.tab,
    onChange(name) {
        cons.settings.tab = name;
        saveConsSettings();
        stopSteadyTone();
        renderConsToolbar();
        consNeckModes[name]?.render?.();
        renderConsNeck();
    }
});

document.querySelectorAll("#consInstruments [data-instrument]").forEach(button => button.addEventListener("click", () => chooseConsInstrument(button.dataset.instrument)));
$("consTuning").addEventListener("change", () => chooseConsTuning($("consTuning").value));
$("consRoot").addEventListener("change", () => { if (MaestroMusic.ROOTS.includes($("consRoot").value)) setConsScale({ root: $("consRoot").value }); });
$("consScale").addEventListener("change", () => { if (Object.hasOwn(MaestroMusic.SCALES, $("consScale").value)) setConsScale({ scale: $("consScale").value }); });
document.querySelectorAll("#consLabels [data-labels]").forEach(button => button.addEventListener("click", () => setConsScale({ labels: button.dataset.labels })));
document.querySelectorAll("#consShow [data-show]").forEach(button => button.addEventListener("click", () => setConsScale({ show: button.dataset.show })));
document.querySelectorAll("#consDegreeStyle [data-degree-style]").forEach(button => button.addEventListener("click", () => setConsScale({ degreeStyle: button.dataset.degreeStyle })));
$("consCapo").addEventListener("change", () => {
    const capo = Number($("consCapo").value);
    if (Number.isInteger(capo) && capo >= 0 && capo <= MaestroMusic.CAPO_MAX) setConsNeck({ capo });
});
$("consLefty").addEventListener("click", () => setConsNeck({ lefty: !cons.settings.lefty }));
document.querySelectorAll("#consChordSize [data-sevenths]").forEach(button => button.addEventListener("click", () => {
    cons.chord = -1;
    setConsScale({ sevenths: button.dataset.sevenths === "true" });
}));
$("consDrone").addEventListener("click", () => (cons.drone ? stopConsDrone() : startConsDrone()));
$("consPlayScale").addEventListener("click", () => (cons.scalePlay ? stopConsScale() : playConsScale()));
$("consKeyChords").addEventListener("click", event => {
    const button = event.target.closest("[data-chord]");
    if (button) chooseConsChord(Number(button.dataset.chord));
});
// A note on the neck or a key sounds when clicked; Finder and Quiz take the
// neck's clicks as their own.
for (const id of ["consNeck", "consKeyboard"]) {
    $(id).addEventListener("click", event => {
        const note = event.target.closest("[data-midi]");
        if (!note) return;
        const midi = Number(note.dataset.midi);
        if (!Number.isInteger(midi) || midi < 0 || midi > 127) return;
        const mode = id === "consNeck" ? consNeckModes[consSections.current()] : null;
        if (mode?.click) mode.click(midi, { string: Number(note.dataset.string), fret: Number(note.dataset.fret) });
        else pluckConsNote(midi);
    });
}
$("consPosition").addEventListener("change", () => {
    const position = Number($("consPosition").value);
    if (Number.isInteger(position) && position >= -1) setConsScale({ position });
});
$("consStrings").addEventListener("click", event => {
    const button = event.target.closest("[data-midi]");
    if (button) soundConsString(Number(button.dataset.midi));
});
$("consTone").addEventListener("change", () => {
    if ($("consTone").value !== "pluck" && $("consTone").value !== "steady") return;
    cons.settings.tone = $("consTone").value;
    stopSteadyTone();
    saveConsSettings();
    renderConsStrings();
});
$("consA4").addEventListener("change", () => {
    const value = Number($("consA4").value);
    if (Number.isInteger(value) && value >= 415 && value <= 466) {
        cons.settings.a4 = value;
        saveConsSettings();
        const playing = cons.steady?.midi;
        if (playing !== undefined) cons.steady.oscillator.frequency.setTargetAtTime(MaestroMusic.frequency(playing, value), metro.context.currentTime, 0.02);
    }
    renderConsStrings();
});
$("consToneStop").addEventListener("click", stopSteadyTone);
$("consTunings").addEventListener("click", event => {
    const remove = event.target.closest("[data-delete-tuning]");
    if (remove) return deleteConsTuning(remove.dataset.deleteTuning);
    const choose = event.target.closest("[data-tuning]");
    if (choose) chooseConsTuning(choose.dataset.tuning);
});
$("consNewTuning").addEventListener("click", openConsTuningForm);
$("consTuningForm").addEventListener("submit", saveConsTuning);
$("consTuningCancel").addEventListener("click", closeConsTuningForm);
$("consTuningForm").addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    closeConsTuningForm();
    $("consNewTuning").focus();
});

$("consCapo").replaceChildren(...Array.from({ length: MaestroMusic.CAPO_MAX + 1 }, (_, fret) => {
    const option = element("option", "", fret ? `Fret ${fret}` : "None");
    option.value = String(fret);
    return option;
}));
$("consRoot").replaceChildren(...MaestroMusic.ROOTS.map(root => {
    const option = element("option", "", root);
    option.value = root;
    return option;
}));
$("consScale").replaceChildren(...MaestroMusic.FAMILIES.map(family => {
    const group = element("optgroup");
    group.label = family;
    group.append(...Object.entries(MaestroMusic.SCALES).filter(([, scale]) => scale.family === family).map(([id, scale]) => {
        const option = element("option", "", scale.label);
        option.value = id;
        return option;
    }));
    return group;
}));
renderConservatory();
