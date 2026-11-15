"use strict";
// The Conservatory's Counterpoint tab (2.5.0): an exercise on the staff,
// written by clicking the staff, the neck or a key, or with the keyboard;
// checked as it's written; heard voice by voice; kept in Maestro's data
// folder (data\counterpoint, through AHK), printed, and exported as MusicXML
// into data\exports.

const CP_KEY = "maestro.counterpoint";
const CP_ID = /^[a-z0-9]{8,24}$/;
const CP_MAX = 100;
const CP_HISTORY = 100;                     // changes Ctrl+Z can take back, for the exercise open
const CP_SCALE = 1.25;                      // on the page, each unit of the engraving drawn this large at most
const CP_MIN_SCALE = 0.8;                   // and at least, when the room is short
// Units under each system for what's written beneath: a line of intervals or
// numerals, or a figured bass's stacked figures with the analysis under them.
const cpRoom = exercise => (exercise.kind !== "fourpart" ? 22 : exercise.form === "figured" ? 56 : 30);
const CP_GLYPH = {
    w: String.fromCodePoint(0xE1D2), h: String.fromCodePoint(0xE1D3), q: String.fromCodePoint(0xE1D5), e: String.fromCodePoint(0xE1D7), dot: String.fromCodePoint(0xE1E7)
};
const CP_SPECIES_WORDS = ["", "First species", "Second species", "Third species", "Fourth species", "Fifth species"];
const CP_FORM_WORDS = { numerals: "From numerals", figured: "Figured bass", soprano: "Harmonizing a soprano" };

const cp = {
    exercise: null,
    id: null,
    savedText: null,
    at: { voice: 0, index: 0 },
    hear: [true, true, true, true],
    saved: null,
    asked: false,
    saving: new Map(),
    playing: null,
    drawn: null,
    drawnWidth: 0,                          // the staff's width when it was drawn
    scale: CP_SCALE,                        // and the size it was drawn at,
    scaleFor: "",                           // chosen for this room and exercise
    renaming: false,
    // Each change as it was before (the exercise and the note selected), and
    // the ones undone; opening or starting an exercise begins them again.
    history: { past: [], future: [] },
    // The first line of staves shown, and how much of the bottom is hidden
    // because a line there doesn't fit whole (in pixels).
    lines: { top: 0, clip: 0 },
    showKeys: false
};

const cpVoices = () => MaestroNotation.voicesOf(cp.exercise.score);
const cpWritable = () => cpVoices().map((_, index) => index).filter(index => index !== cp.exercise.given);
const cpIsShown = () => $("conservatory").classList.contains("active") && consSections.current() === "counterpoint";
const cpText = () => MaestroCounterpoint.exerciseText(cp.exercise);
const cpIsSaved = () => cp.id !== null && cp.savedText === cpText();
const cpKeyName = key => `${MaestroNotation.keyTonic(key.fifths, key.mode)} ${key.mode}`;

// ---- Kept on this PC: the exercise as written, which is saved, and the voices heard.

function loadCounterpoint() {
    let stored = null;
    try {
        stored = JSON.parse(localStorage.getItem(CP_KEY) ?? "null");
    } catch {
        stored = null;
    }
    const exercise = stored && typeof stored.text === "string" ? MaestroCounterpoint.readExercise(stored.text) : null;
    cp.exercise = exercise ?? cpFirstExercise();
    cp.id = exercise && typeof stored.id === "string" && CP_ID.test(stored.id) ? stored.id : null;
    cp.savedText = cp.id && typeof stored.savedText === "string" ? stored.savedText : null;
    if (Array.isArray(stored?.hear) && stored.hear.length === 4) cp.hear = stored.hear.map(Boolean);
    cp.showKeys = stored?.showKeys === true;
    cp.at = { voice: cpWritable()[0] ?? 0, index: 0 };
}

function saveCounterpoint() {
    try {
        localStorage.setItem(CP_KEY, JSON.stringify({ text: cpText(), id: cp.id, savedText: cp.savedText, hear: cp.hear, showKeys: cp.showKeys }));
    } catch {
        // Storage full or blocked: the exercise stays for this session.
    }
}

const cpFirstExercise = () => MaestroCounterpoint.speciesExercise({ species: 1, cantus: MaestroCounterpoint.fuxNotes(MaestroCounterpoint.FUX[0]), cantusBelow: true, mode: "dorian", final: "D", title: "First species, Fux's Dorian" });

// ---- Changes, each with Undo where it replaces work

function setCpExercise(exercise, { id = null, savedText = null, undo = null } = {}) {
    const before = { exercise: cp.exercise, id: cp.id, savedText: cp.savedText };
    stopCpPlaying();
    cp.exercise = exercise;
    cp.id = id;
    cp.savedText = savedText;
    cp.at = { voice: cpWritable()[0] ?? 0, index: firstOpenSlot(cpWritable()[0] ?? 0) };
    cp.history = { past: [], future: [] };
    cp.lines.top = 0;
    saveCounterpoint();
    renderCounterpoint();
    renderConsNeck();
    if (undo) showToast(undo, { label: "Undo", run: () => setCpExercise(before.exercise, { id: before.id, savedText: before.savedText }) });
}

// A change to the exercise open, which Ctrl+Z can take back. False when
// nothing changed.
function changeCp(next, at = cp.at) {
    if (!next || next === cp.exercise) return false;
    cp.history.past.push({ exercise: cp.exercise, at: cp.at });
    if (cp.history.past.length > CP_HISTORY) cp.history.past.shift();
    cp.history.future = [];
    showCpChange(next, at);
    return true;
}

function showCpChange(exercise, at) {
    cp.exercise = exercise;
    cp.at = at;
    saveCounterpoint();
    renderCounterpoint();
    renderConsNeck();
}

function undoCp() {
    const last = cp.history.past.pop();
    if (!last) return false;
    cp.history.future.push({ exercise: cp.exercise, at: cp.at });
    showCpChange(last.exercise, last.at);
    return true;
}

function redoCp() {
    const next = cp.history.future.pop();
    if (!next) return false;
    cp.history.past.push({ exercise: cp.exercise, at: cp.at });
    showCpChange(next.exercise, next.at);
    return true;
}

// Every written voice emptied, the given one kept, with Undo.
function clearCpExercise() {
    const before = { exercise: cp.exercise, at: cp.at };
    const next = MaestroCounterpoint.clearWritten(cp.exercise);
    if (next === cp.exercise) return;
    stopCpPlaying();
    const voice = cpWritable()[0] ?? 0;
    changeCp(next, { voice, index: firstOpenSlot(voice, next) });
    showToast("Cleared the exercise.", { label: "Undo", run: () => changeCp(before.exercise, before.at) });
}

function firstOpenSlot(voice, exercise = cp.exercise) {
    const notes = MaestroNotation.voicesOf(exercise.score)[voice]?.notes ?? [];
    const open = notes.findIndex((note, index) => !note.p && !(index === 0 && exercise.kind === "species" && exercise.species > 1));
    return open >= 0 ? open : 0;
}

function setCpNote(p, { hear = true } = {}) {
    const { voice, index } = cp.at;
    if (!changeCp(MaestroCounterpoint.setNote(cp.exercise, voice, index, p))) return;
    if (hear && p) pluckConsNote(MaestroNotation.midiOf(p));
}

function moveCpSelection(delta) {
    const notes = cpVoices()[cp.at.voice].notes;
    cp.at = { voice: cp.at.voice, index: Math.max(0, Math.min(notes.length - 1, cp.at.index + delta)) };
    renderCounterpoint();
    renderConsNeck();
}

// The selected note moved a step (or, chromatically, a half step), from where
// it is, or from the note before it, or from the middle of its staff.
function stepCpNote(steps, chromatic) {
    const voices = cpVoices();
    const voice = voices[cp.at.voice];
    const current = voice.notes[cp.at.index]?.p;
    const key = cp.exercise.score.key;
    if (!current) {
        const before = voice.notes.slice(0, cp.at.index).reverse().find(note => note.p)?.p;
        const start = before ?? MaestroNotation.pitch(voice.clef === "treble" ? 34 : 22, 0);
        setCpNote(MaestroNotation.pitch(start.step, MaestroNotation.keyAlter(start.step % 7, key.fifths)));
        return;
    }
    if (chromatic) {
        const alter = Math.max(-2, Math.min(2, current.alter + steps));
        setCpNote(MaestroNotation.pitch(current.step, alter));
        return;
    }
    const step = current.step + steps;
    const p = MaestroNotation.pitch(step, MaestroNotation.keyAlter(((step % 7) + 7) % 7, key.fifths));
    if (MaestroNotation.isPitch(p)) setCpNote(p);
}

// A letter typed: that letter, nearest the note there (or the one before).
function letterCpNote(letter) {
    const voice = cpVoices()[cp.at.voice];
    const near = voice.notes[cp.at.index]?.p ?? voice.notes.slice(0, cp.at.index).reverse().find(note => note.p)?.p ?? MaestroNotation.pitch(voice.clef === "treble" ? 34 : 22, 0);
    const index = MaestroNotation.LETTERS.indexOf(letter);
    let best = null;
    for (const octave of [-1, 0, 1]) {
        const step = index + 7 * (Math.floor(near.step / 7) + octave);
        if (best === null || Math.abs(step - near.step) < Math.abs(best - near.step)) best = step;
    }
    const p = MaestroNotation.pitch(best, MaestroNotation.keyAlter(index, cp.exercise.score.key.fifths));
    if (MaestroNotation.isPitch(p)) setCpNote(p);
}

// ---- Drawing the staff

// The exercise laid out for the staff's width at a scale. A line's width is
// the staff's, less its padding, the brace and the margin after the last bar.
function cpEngrave(scale) {
    const width = Math.max(400, ($("cpStaff").clientWidth || 1200) - 24) / scale - 3 * MaestroNotation.SPACE;
    return MaestroNotation.engrave(cp.exercise.score, { maxWidth: width, room: cpRoom(cp.exercise), justify: true });
}

function drawCpStaff() {
    const holder = $("cpStaff");
    const exercise = cp.exercise;
    cp.drawnWidth = holder.clientWidth;
    const drawn = cpEngrave(cp.scale);
    cp.drawn = drawn;
    const svg = svgNode("svg", { class: "cp-score", viewBox: `0 0 ${drawn.width} ${drawn.height}`, width: Math.round(drawn.width * cp.scale), height: Math.round(drawn.height * cp.scale), role: "img", "aria-label": cpStaffLabel() });
    const voices = cpVoices();
    const timed = voices.map(voice => MaestroNotation.timed(voice.notes));
    const problems = MaestroCounterpoint.check(exercise);
    const marked = new Map();
    problems.forEach(each => each.at.forEach(spot => {
        const key = `${spot.voice}:${spot.index}`;
        if (!marked.has(key) || each.level === "error") marked.set(key, each.level);
    }));
    // The selected moment's column, behind the notes.
    const selected = timed[cp.at.voice]?.[cp.at.index];
    const column = selected && drawn.columns.find(each => each.time === selected.onset);
    if (column) {
        const system = drawn.systems[column.system];
        const staff = voices[cp.at.voice].staff;
        const y = system.staffY[staff];
        svg.append(svgNode("rect", { class: "cp-column", x: column.x - 0.6 * drawn.space, y: y - 6 * drawn.space, width: 3 * drawn.space, height: 8 * drawn.space, rx: 3 }));
    }
    // Rings under the heads: problems, the note selected, and what's playing.
    drawn.heads.forEach(head => {
        const level = marked.get(`${head.voice}:${head.index}`);
        const classes = ["cp-ring"];
        if (level === "error") classes.push("is-error");
        else if (level === "warning") classes.push("is-warning");
        if (head.voice === cp.at.voice && head.index === cp.at.index) classes.push("is-selected");
        if (head.voice === exercise.given) classes.push("is-given");
        svg.append(svgNode("ellipse", { class: classes.join(" "), cx: head.x + 0.75 * drawn.space, cy: head.y, rx: 1.35 * drawn.space, ry: 1.05 * drawn.space, "data-ring": `${head.voice}:${head.index}` }));
    });
    for (const item of drawn.items) {
        let node;
        if (item.kind === "line") node = svgNode("line", { x1: item.x1, y1: item.y1, x2: item.x2, y2: item.y2 });
        else if (item.kind === "glyph") {
            node = svgNode("text", { x: item.x, y: item.y });
            if (item.scaleY) node.setAttribute("transform", `translate(${item.x} ${item.y}) scale(1 ${item.scaleY.toFixed(3)}) translate(${-item.x} ${-item.y})`);
            node.textContent = item.text;
        } else if (item.kind === "path") node = svgNode("path", { d: item.d });
        else node = svgNode("polygon", { points: `${item.x1},${item.y1} ${item.x2},${item.y2} ${item.x2},${item.y2 + item.thickness} ${item.x1},${item.y1 + item.thickness}` });
        node.setAttribute("class", item.class);
        svg.append(node);
    }
    drawCpBeneath(svg, drawn, timed);
    holder.replaceChildren(svg);
    if (cpGhost.at && !cpGhost.frame) cpGhost.frame = requestAnimationFrame(drawCpGhost);
}

// Under each system: the intervals, the numerals asked for, a figured bass's
// figures, or the analysis of what's written.
function drawCpBeneath(svg, drawn, timed) {
    const exercise = cp.exercise;
    const space = drawn.space;
    const xAt = onset => drawn.columns.find(each => each.time === onset);
    const lineY = (system, row) => drawn.systems[system].bottom + space * (1.6 + row * 1.9);
    const write = (onset, text, row, cls) => {
        const column = xAt(onset);
        if (!column || !text) return;
        const node = svgNode("text", { class: cls, x: column.x + 0.8 * space, y: lineY(column.system, row) + space });
        node.textContent = text;
        svg.append(node);
    };
    const writeNumeral = (onset, parts, row, cls) => {
        const column = xAt(onset);
        if (!column || !parts) return;
        const x = column.x + 0.8 * space, y = lineY(column.system, row) + space;
        const node = svgNode("text", { class: cls, x, y });
        node.textContent = parts.numeral;
        svg.append(node);
        const after = x + parts.numeral.length * 0.62 * space + 0.6 * space;
        parts.figures.forEach((figure, at) => {
            const small = svgNode("text", { class: `${cls} cp-figure-small`, x: after, y: y - 1.1 * space + at * 1.05 * space });
            small.textContent = figure;
            svg.append(small);
        });
        if (parts.target) {
            const target = svgNode("text", { class: cls, x: after + (parts.figures.length ? 0.9 * space : 0), y });
            target.textContent = parts.target;
            svg.append(target);
        }
    };
    if (exercise.kind !== "fourpart") {
        MaestroCounterpoint.analysisLine(exercise).forEach(each => write(each.onset, each.text, 0, "cp-beneath"));
        return;
    }
    const onsets = timed[0].map(entry => entry.onset);
    if (exercise.form === "numerals") {
        exercise.numerals.forEach((text, k) => writeNumeral(onsets[k], MaestroCounterpoint.numeralParts(text), 0, "cp-beneath"));
        return;
    }
    let row = 0;
    if (exercise.form === "figured") {
        MaestroCounterpoint.figuredBass(exercise).forEach((figures, k) => figures.forEach((figure, at) => {
            const column = xAt(onsets[k]);
            if (!column) return;
            const node = svgNode("text", { class: "cp-beneath cp-figure", x: column.x + 0.8 * space, y: drawn.systems[column.system].bottom + space * (1.2 + at * 1.6) + space });
            node.textContent = figure;
            svg.append(node);
        }));
        row = 2;
    }
    MaestroCounterpoint.analysisLine(exercise).forEach(each => writeNumeral(each.onset, each.parts, row, "cp-beneath cp-analysis"));
}

function cpStaffLabel() {
    const voices = cpVoices();
    return voices.map(voice => `${voice.name}: ${voice.notes.map(note => (note.p ? MaestroNotation.pitchName(note.p) : "rest")).join(", ")}`).join(". ");
}

// Where a pointer is on the staff: the moment nearest it, on the staff
// nearest it, the step there, and the voices that can be written there.
// Null off the drawing or where nothing can be written.
function cpStaffHit(event) {
    const svg = $("cpStaff").querySelector("svg");
    if (!svg || !cp.drawn) return null;
    // Below the last whole line shown, a line is hidden: nothing there.
    const holder = $("cpStaff").getBoundingClientRect();
    if (event.clientY > holder.bottom - cp.lines.clip) return null;
    const box = svg.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width * cp.drawn.width;
    const y = (event.clientY - box.top) / box.height * cp.drawn.height;
    const space = cp.drawn.space;
    const below = cp.drawn.systems.findIndex(system => y <= system.bottom + cp.drawn.room);
    const systemIndex = below >= 0 ? below : cp.drawn.systems.length - 1;
    const system = cp.drawn.systems[systemIndex];
    const staff = system.staffY.reduce((best, staffY, index) => (Math.abs(y - (staffY - 2 * space)) < Math.abs(y - (system.staffY[best] - 2 * space)) ? index : best), 0);
    const columns = cp.drawn.columns.filter(column => column.system === systemIndex);
    if (!columns.length) return null;
    const column = columns.reduce((best, each) => (Math.abs(each.x + 0.75 * space - x) < Math.abs(best.x + 0.75 * space - x) ? each : best));
    const time = column.time;
    const voices = cpVoices();
    const candidates = cpWritable().filter(index => voices[index].staff === staff);
    if (!candidates.length) return null;
    const noteAt = index => MaestroNotation.timed(voices[index].notes).find(entry => entry.onset <= time && time < entry.onset + entry.length);
    const position = Math.round((system.staffY[staff] - y) / (space / 2));
    const step = MaestroNotation.STAFF_BOTTOM[voices[candidates[0]].clef] + position;
    // How far the pointer is from the moment's heads, in staff spaces.
    const across = Math.abs(column.x + 0.75 * space - x) / space;
    return { time, staff, step, candidates, noteAt, across };
}

// The voice a click writes: the one on the staff, or where two share it,
// the written one nearest the click (or the one being written).
function cpTargetVoice({ step, candidates, noteAt }) {
    if (candidates.length === 1) return candidates[0];
    const written = candidates.map(index => ({ index, p: noteAt(index)?.note.p }));
    if (written.every(each => each.p)) return written.reduce((best, each) => (Math.abs(each.p.step - step) < Math.abs(best.p.step - step) ? each : best)).index;
    return candidates.includes(cp.at.voice) ? cp.at.voice : candidates[0];
}

// The written note nearest the pointer at its moment, or null.
function cpNearestWritten(hit) {
    const written = hit.candidates.map(index => ({ index, entry: hit.noteAt(index) })).filter(each => each.entry?.note.p);
    if (!written.length) return null;
    return written.reduce((best, each) => (Math.abs(each.entry.note.p.step - hit.step) < Math.abs(best.entry.note.p.step - hit.step) ? each : best));
}

// A click on the staff: the moment nearest it, on the staff clicked, for
// the voice there (the one written nearest the click when two share it).
function cpStaffClick(event) {
    const hit = cpStaffHit(event);
    if (!hit) return;
    const { step, noteAt } = hit;
    const voice = cpTargetVoice(hit);
    const entry = noteAt(voice);
    if (!entry) return;
    cp.at = { voice, index: entry.index };
    const p = MaestroNotation.pitch(step, MaestroNotation.keyAlter(((step % 7) + 7) % 7, cp.exercise.score.key.fifths));
    if (MaestroNotation.isPitch(p)) setCpNote(p);
    $("cpStaff").focus({ preventScroll: true });
}

// A right-click on the staff clears the note there: the written one nearest
// it when two voices share the staff. The cantus and empty beats stay as
// they are. The menu key (no pointer to aim) does nothing here.
function cpStaffErase(event) {
    event.preventDefault();
    if (event.button !== 2) return;
    const hit = cpStaffHit(event);
    const nearest = hit && cpNearestWritten(hit);
    if (!nearest) return;
    cp.at = { voice: nearest.index, index: nearest.entry.index };
    setCpNote(null);
    $("cpStaff").focus({ preventScroll: true });
}

// ---- The pointer on the staff: a faint note where a click would write,
// drawn at most once a frame.

const cpGhost = { frame: 0, at: null };

function cpStaffHover(event) {
    cpGhost.at = { clientX: event.clientX, clientY: event.clientY };
    if (!cpGhost.frame) cpGhost.frame = requestAnimationFrame(drawCpGhost);
}

// Gone at once when the pointer leaves.
function cpStaffLeave() {
    cpGhost.at = null;
    cancelAnimationFrame(cpGhost.frame);
    drawCpGhost();
}

function drawCpGhost() {
    cpGhost.frame = 0;
    const svg = $("cpStaff").querySelector("svg");
    svg?.querySelector(".cp-ghost")?.remove();
    const hit = svg && cpGhost.at && cpStaffHit(cpGhost.at);
    if (!hit) return;
    const voice = cpTargetVoice(hit);
    const entry = hit.noteAt(voice);
    const p = MaestroNotation.pitch(hit.step, MaestroNotation.keyAlter(((hit.step % 7) + 7) % 7, cp.exercise.score.key.fifths));
    const column = entry && cp.drawn.columns.find(each => each.time === entry.onset);
    if (!column || !MaestroNotation.isPitch(p)) return;
    const space = cp.drawn.space;
    const staffY = cp.drawn.systems[column.system].staffY[hit.staff];
    const position = hit.step - MaestroNotation.STAFF_BOTTOM[cpVoices()[voice].clef];
    const centerY = staffY - position * space / 2;
    const width = MaestroNotation.HEAD_WIDTH[entry.note.d];
    const ghost = svgNode("g", { class: "cp-ghost", "aria-hidden": "true" });
    const ledger = at => ghost.append(svgNode("line", { class: "staff-ledger", x1: column.x - 0.4 * space, x2: column.x + width + 0.4 * space, y1: staffY - at * space / 2, y2: staffY - at * space / 2 }));
    for (let at = -2; at >= position; at -= 2) ledger(at);
    for (let at = 10; at <= position; at += 2) ledger(at);
    const head = svgNode("text", { class: "staff-glyph", x: column.x, y: centerY + MaestroNotation.LIFT });
    const glyphs = MaestroNotation.GLYPHS;
    head.textContent = entry.note.d === "w" ? glyphs.whole : entry.note.d === "h" ? glyphs.half : glyphs.black;
    ghost.append(head);
    svg.append(ghost);
}

// ---- The wheel on the staff: over the selected note, a step (with Shift,
// a half step); anywhere else, the next or the last line of staves. A
// trackpad's small turns add up to a notch.

const CP_NOTCH = 100;
const cpWheel = { notes: 0, lines: 0 };

function cpStaffWheel(event) {
    if (event.ctrlKey) return;
    const delta = (event.deltaY || event.deltaX) * (event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? CP_NOTCH : 1);
    if (!delta) return;
    const hit = cpStaffHit(event);
    const nearest = hit && hit.across <= 1.6 && cpNearestWritten(hit);
    const onSelected = nearest && nearest.index === cp.at.voice && nearest.entry.index === cp.at.index && Math.abs(nearest.entry.note.p.step - hit.step) <= 2;
    if (onSelected) {
        event.preventDefault();
        cpWheel.lines = 0;
        cpWheel.notes += delta;
        if (Math.abs(cpWheel.notes) < CP_NOTCH) return;
        const steps = cpWheel.notes < 0 ? 1 : -1;
        cpWheel.notes = 0;
        stepCpNote(steps, event.shiftKey);
        return;
    }
    cpWheel.notes = 0;
    const down = delta > 0;
    if (!cpCanTurnLine(down)) {
        cpWheel.lines = 0;
        return;
    }
    event.preventDefault();
    cpWheel.lines += delta;
    if (Math.abs(cpWheel.lines) < CP_NOTCH) return;
    cpWheel.lines = 0;
    showCpLine(cp.lines.top + (down ? 1 : -1));
}

// ---- Lines of staves: the staff shows the whole lines that fit, from
// cp.lines.top; the wheel, Page Up and Page Down, and the selection move it.

// Where a line begins and ends in a drawing at a scale, in pixels: its
// staves and what's written beneath them, short of the gap to the next.
const lineTopIn = (drawn, scale, index) => Math.round(drawn.systems[index].top * scale);
const lineEndIn = (drawn, scale, index) => Math.round((index + 1 < drawn.systems.length ? drawn.systems[index + 1].top - drawn.space : drawn.height) * scale);
const cpLineTop = index => lineTopIn(cp.drawn, cp.scale, index);
const cpLineEnd = index => lineEndIn(cp.drawn, cp.scale, index);

// The scale to draw at, for this much room: the largest (in steps of 0.05)
// at which every line shows; failing that, the largest at which a line
// does; failing that, the smallest.
function cpFittingScale(room) {
    let oneLine = null;
    for (let scale = CP_SCALE; scale >= CP_MIN_SCALE - 0.001; scale -= 0.05) {
        const drawn = cpEngrave(scale);
        if (drawn.height * scale <= room) return scale;
        const tallest = Math.max(...drawn.systems.map((_, index) => lineEndIn(drawn, scale, index) - lineTopIn(drawn, scale, index)));
        if (oneLine === null && tallest <= room) oneLine = scale;
    }
    return oneLine ?? CP_MIN_SCALE;
}
const cpMaxScroll = () => Math.max(0, $("cpStaff").scrollHeight - $("cpStaff").clientHeight);
const cpReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function cpCanTurnLine(down) {
    if (!cp.drawn || cpMaxScroll() <= 0) return false;
    return down ? cpLineTop(cp.lines.top) < cpMaxScroll() : cp.lines.top > 0;
}

function showCpLine(index, { smooth = true } = {}) {
    if (!cp.drawn) return;
    let top = Math.max(0, Math.min(cp.drawn.systems.length - 1, index));
    // No further than the line that already shows the last.
    while (top > 0 && cpLineTop(top - 1) >= cpMaxScroll()) top--;
    cp.lines.top = top;
    fitCpLines({ smooth });
}

// After drawing, and as lines turn: at least one whole line high; the
// selected note's line in view when asked; a line cut by the bottom edge
// hidden; and which lines are shown.
function fitCpLines({ follow = false, smooth = false } = {}) {
    const staff = $("cpStaff");
    if (!cp.drawn) return;
    // The scale is chosen again only when the room or the exercise's shape
    // changes, so writing a note never resizes the staff. The room is
    // measured with no line's height held open.
    staff.style.minHeight = "";
    const room = staff.clientHeight - 4;
    const voices = cpVoices();
    const shape = `${staff.clientWidth}|${room}|${cp.exercise.kind}|${voices.length}|${voices.map(voice => voice.notes.length).join(",")}`;
    if (shape !== cp.scaleFor) {
        cp.scaleFor = shape;
        const fitting = cpFittingScale(room);
        if (fitting !== cp.scale) {
            cp.scale = fitting;
            drawCpStaff();
        }
    }
    const drawn = cp.drawn;
    const count = drawn.systems.length;
    const tallest = Math.max(...drawn.systems.map((_, index) => cpLineEnd(index) - cpLineTop(index)));
    staff.style.minHeight = `${tallest + 4}px`;
    const height = staff.clientHeight;
    const lastShown = from => {
        let last = from;
        while (last + 1 < count && cpLineEnd(last + 1) - cpLineTop(from) <= height) last++;
        return last;
    };
    let top = Math.max(0, Math.min(count - 1, cp.lines.top));
    if (follow) {
        const selected = MaestroNotation.timed(cpVoices()[cp.at.voice]?.notes ?? [])[cp.at.index];
        const column = selected && drawn.columns.find(each => each.time === selected.onset);
        if (column && (column.system < top || column.system > lastShown(top))) {
            top = column.system;
            smooth = true;
        }
    }
    while (top > 0 && cpLineTop(top - 1) >= cpMaxScroll()) top--;
    cp.lines.top = top;
    const target = Math.min(cpLineTop(top), cpMaxScroll());
    if (Math.abs(staff.scrollTop - target) > 1) staff.scrollTo({ top: target, behavior: smooth && !cpReducedMotion() ? "smooth" : "auto" });
    const last = lastShown(top);
    cp.lines.clip = last === count - 1 ? 0 : Math.max(0, height - (cpLineEnd(last) - target));
    // Inset past the edges on three sides, so the focus outline isn't cut.
    staff.style.clipPath = cp.lines.clip ? `inset(-6px -6px ${cp.lines.clip}px -6px)` : "";
    const all = top === 0 && last === count - 1;
    $("cpLines").hidden = all;
    $("cpLines").textContent = all ? "" : cp.lines.top === last ? `Line ${last + 1} of ${count}` : `Lines ${cp.lines.top + 1}\u2013${last + 1} of ${count}`;
}

// ---- Drawing the tab

function renderCounterpoint() {
    if (!cp.exercise) loadCounterpoint();
    const exercise = cp.exercise;
    $("cpTitleText").textContent = exercise.title || "Untitled";
    $("cpFacts").textContent = cpFacts(exercise);
    const saved = cpIsSaved();
    $("cpSave").textContent = saved ? "Saved" : cp.id ? "Save changes" : "Save exercise";
    $("cpSave").classList.toggle("is-saved", saved);
    $("cpSave").disabled = saved || cp.saved === null;
    renderCpVoices();
    renderCpTools();
    drawCpStaff();
    fitCpLines({ follow: true });
    renderCpProblems();
    renderCpMenu();
    renderCpNewPanel();
}

function cpFacts(exercise) {
    const key = exercise.score.key;
    if (exercise.kind === "cantus") return `Cantus firmus \u00B7 ${cpKeyName(key)} \u00B7 ${MaestroNotation.voicesOf(exercise.score)[0].notes.length} notes`;
    if (exercise.kind === "species") return `${CP_SPECIES_WORDS[exercise.species]} \u00B7 ${cpKeyName(key)} \u00B7 the cantus ${exercise.cantusBelow ? "below" : "above"}`;
    return `Four parts \u00B7 ${CP_FORM_WORDS[exercise.form]} \u00B7 ${cpKeyName(key)}`;
}

function renderCpVoices() {
    const voices = cpVoices();
    $("cpVoices").replaceChildren(...voices.map((voice, index) => {
        const button = element("button", "secondary cons-toggle cp-voice");
        button.type = "button";
        button.dataset.hear = String(index);
        button.setAttribute("aria-pressed", String(cp.hear[index]));
        button.textContent = cp.exercise.kind === "species" ? (index === cp.exercise.given ? "Cantus" : "Counterpoint") : voice.name;
        button.title = `Hear the ${voice.name.toLowerCase()} (double-click to hear it alone)`;
        return button;
    }));
    $("cpPlay").disabled = !voices.some((_, index) => cp.hear[index]);
    $("cpPlay").querySelector("span").textContent = cp.playing ? "Stop" : "Play";
    $("cpPlay").querySelector("svg")?.replaceWith(MaestroIcons.create(cp.playing ? "stop" : "play"));
    $("cpPlay").setAttribute("aria-pressed", String(Boolean(cp.playing)));
}

function renderCpTools() {
    const exercise = cp.exercise;
    const fourPart = exercise.kind === "fourpart";
    $("cpWritingField").hidden = !fourPart;
    if (fourPart) {
        $("cpWriting").replaceChildren(...cpVoices().map((voice, index) => {
            const button = element("button", "", voice.name);
            button.type = "button";
            button.dataset.writing = String(index);
            button.disabled = index === exercise.given;
            button.setAttribute("aria-pressed", String(index === cp.at.voice));
            button.title = index === exercise.given ? `The ${voice.name.toLowerCase()} is given` : `Write the ${voice.name.toLowerCase()} (${index + 1})`;
            return button;
        }));
    }
    const note = cpVoices()[cp.at.voice]?.notes[cp.at.index];
    document.querySelectorAll("#cpAccidentals [data-alter]").forEach(button => {
        button.disabled = !note?.p;
        button.setAttribute("aria-pressed", String(Boolean(note?.p) && String(note.p.alter) === button.dataset.alter));
    });
    $("cpClearNote").disabled = !note?.p;
    $("cpClearAll").disabled = MaestroCounterpoint.clearWritten(exercise) === exercise;
    // The fifth species: the selected bar's rhythm.
    const fifth = exercise.kind === "species" && exercise.species === 5;
    const timed = MaestroNotation.timed(cpVoices()[cp.at.voice].notes);
    const bar = Math.floor((timed[cp.at.index]?.onset ?? 0) / MaestroNotation.barLength(exercise.score.meter));
    const bars = Math.ceil(timed.reduce((sum, entry) => sum + entry.length, 0) / MaestroNotation.barLength(exercise.score.meter));
    $("cpRhythmField").hidden = !fifth || bar >= bars - 1;
    if (fifth) {
        $("cpRhythmLabel").textContent = `Bar ${bar + 1}`;
        const current = timed.filter(entry => Math.floor(entry.onset / 8) === bar).map(entry => entry.note.d + (entry.note.dot ? "." : "")).join(" ");
        $("cpRhythms").replaceChildren(...MaestroCounterpoint.FIFTH_BARS.map((pattern, index) => {
            const button = element("button", "cp-rhythm");
            button.type = "button";
            button.dataset.rhythm = String(index);
            button.setAttribute("aria-pressed", String(pattern.join(" ") === current));
            button.setAttribute("aria-label", pattern.map(code => `${code.endsWith(".") ? "dotted " : ""}${MaestroNotation.DURATION_NAMES[code[0]]}`).join(", "));
            button.title = button.getAttribute("aria-label");
            button.textContent = pattern.map(code => CP_GLYPH[code[0]] + (code.endsWith(".") ? CP_GLYPH.dot : "")).join(" ");
            return button;
        }));
    }
    renderCpKeys();
    $("cpHint").textContent = "Click the staff, the neck or a key to write; right-click a note to clear it; Ctrl+Z undoes.";
    $("cpStaff").title = exercise.kind !== "fourpart"
        ? "Up and Down move the note a step (with Shift, a half step); Left and Right go to the next note; A to G write a letter; Delete or a right-click clears it; Enter plays the moment; Ctrl+Z undoes, Ctrl+Y redoes."
        : "Up and Down move the note a step (with Shift, a half step); Left and Right go to the next chord; 1 to 4 choose the voice; A to G write a letter; Delete or a right-click clears it; Enter plays the chord; Ctrl+Z undoes, Ctrl+Y redoes.";
}

// What the keys and the mouse do on the staff, shown under it on request.
function renderCpKeys() {
    const fourPart = cp.exercise.kind === "fourpart";
    const rows = [
        [["Click"], "Write the note there"],
        [["Right-click"], "Clear the note there"],
        [["Wheel"], "On the selected note, a step (with Shift, a half step); elsewhere, the next line"],
        [["\u2191", "\u2193"], "A step (with Shift, a half step)"],
        [["\u2190", "\u2192"], fourPart ? "The last or next chord" : "The last or next note"],
        [["A", "G"], "Write that letter, the nearest one", true],
        ...(fourPart ? [[["1", "4"], "Choose the voice to write", true]] : []),
        [["Delete"], "Clear the note"],
        [["Enter"], fourPart ? "Hear the chord" : "Hear the moment"],
        [["Page Up", "Page Down"], "The last or next line"],
        [["Ctrl+Z", "Ctrl+Y"], "Undo, redo"]
    ];
    // A range (A to G) is joined by a dash; two keys stand side by side.
    $("cpKeys").replaceChildren(...rows.map(([keys, text, range = false]) => {
        const row = element("li", "cp-key");
        const held = element("span", "cp-key-keys");
        keys.forEach((label, at) => {
            if (at && range) held.append(element("span", "", "\u2013"));
            held.append(element("kbd", "", label));
        });
        row.append(held, element("span", "", text));
        return row;
    }));
    $("cpKeys").hidden = !cp.showKeys;
    $("cpKeysButton").setAttribute("aria-expanded", String(cp.showKeys));
    $("cpKeysButton").textContent = cp.showKeys ? "Hide keys and mouse" : "Keys and mouse";
}

function renderCpProblems() {
    const problems = MaestroCounterpoint.check(cp.exercise);
    const errors = problems.filter(each => each.level === "error").length;
    const warnings = problems.filter(each => each.level === "warning").length;
    const unfinished = problems.some(each => each.rule === "unfinished");
    $("cpCount").textContent = errors || warnings
        ? [errors ? `${errors} ${errors === 1 ? "problem" : "problems"}` : "", warnings ? `${warnings} to consider` : ""].filter(Boolean).join(" \u00B7 ")
        : unfinished ? "Nothing wrong so far" : "No problems";
    $("cpCount").classList.toggle("is-clear", !errors && !warnings);
    $("cpProblems").replaceChildren(...problems.map(each => {
        const item = element("li", `cp-problem is-${each.level}`);
        const button = element("button", "cp-problem-open");
        button.type = "button";
        if (each.at.length) {
            button.dataset.voice = String(each.at[0].voice);
            button.dataset.index = String(each.at[0].index);
        } else button.disabled = each.level === "info";
        if (each.bar) button.append(element("span", "cp-problem-bar", `Bar ${each.bar}`));
        button.append(element("span", "cp-problem-text", each.text));
        item.append(button);
        return item;
    }));
    $("cpProblemsNote").hidden = problems.length > 0;
}

function renderCpMenu() {
    const items = cp.saved;
    $("cpSaveCopy").disabled = items === null;
    if (items === null) {
        $("cpExercises").replaceChildren(placeholderItem("list", 3));
        $("cpExercisesNote").textContent = "";
        return;
    }
    $("cpExercises").replaceChildren(...items.map(item => {
        const row = element("li", "prog-song");
        const open = element("button", "prog-song-open");
        open.type = "button";
        open.dataset.exerciseOpen = item.id;
        const current = item.id === cp.id;
        if (current) open.setAttribute("aria-current", "true");
        open.append(element("strong", "", item.exercise.title || "Untitled"), element("span", "", `${cpFacts(item.exercise)}${current && !cpIsSaved() ? " \u00B7 changed" : ""}`));
        const remove = element("button", "quiet prog-song-delete");
        remove.type = "button";
        remove.dataset.exerciseDelete = item.id;
        remove.setAttribute("aria-label", `Delete ${item.exercise.title || "Untitled"}`);
        remove.title = remove.getAttribute("aria-label");
        remove.append(MaestroIcons.create("close"));
        row.append(open, remove);
        return row;
    }));
    $("cpExercisesNote").textContent = items.length ? "" : "No exercises yet. Save exercise keeps one here, in Maestro's data folder.";
}

// ---- A new exercise

const cpNew = { kind: "species", species: 1, cantus: "fux-dorian", below: true, form: "figured", key: "0", mode: "dorian", final: "D", clef: "treble", length: MaestroCounterpoint.CANTUS_LENGTH.usual };
const CP_MODE_WORDS = { dorian: "Dorian", phrygian: "Phrygian", lydian: "Lydian", mixolydian: "Mixolydian", aeolian: "Aeolian", ionian: "Ionian", major: "Major", minor: "Minor" };

// A cantus firmus to write against: Fux's, a phrase of chant, the one open
// now if it's a whole cantus, your own saved ones, or a new one made to the rules.
function cpCantusChoices() {
    const option = (value, text, disabled = false) => Object.assign(element("option", "", text), { value, disabled });
    const group = (label, options) => {
        const holder = document.createElement("optgroup");
        holder.label = label;
        holder.append(...options);
        return holder;
    };
    const own = (cp.saved ?? []).filter(item => item.exercise.kind === "cantus");
    const labelOf = exercise => {
        const key = exercise.score.key;
        const flaw = MaestroCounterpoint.cantusOf(exercise) ? (MaestroCounterpoint.checkCantus(exercise).some(each => each.level !== "info") ? " \u00B7 breaks a rule" : "") : " \u00B7 unfinished";
        return `${exercise.title || "Untitled"} (on ${cpKeyName(key)})${flaw}`;
    };
    const groups = [
        group("Fux", MaestroCounterpoint.FUX.map(each => option(each.id, `${each.label} (on ${each.final})`))),
        group("Chant", MaestroCounterpoint.CHANT.map(each => option(each.id, `${each.label} (${each.final} ${each.mode}, ${each.source})`)))
    ];
    const current = cp.exercise && cp.exercise.kind === "cantus" && !cp.id ? cp.exercise : null;
    if (current) groups.push(group("Open now", [option("current", labelOf(current), !MaestroCounterpoint.cantusOf(current))]));
    if (own.length) groups.push(group("Yours", own.map(item => option(`own:${item.id}`, labelOf(item.exercise), !MaestroCounterpoint.cantusOf(item.exercise)))));
    groups.push(group("A new one", [option("made-major", "In a major key"), option("made-minor", "In a minor key")]));
    return groups;
}

// The cantus chosen, as a species exercise takes it, with a name for the title.
function cpChosenCantus() {
    const fux = MaestroCounterpoint.FUX.find(each => each.id === cpNew.cantus);
    if (fux) return { pitches: MaestroCounterpoint.fuxNotes(fux), mode: fux.mode, final: fux.final, name: fux.label.replace("Fux, ", "Fux's ") };
    const chant = MaestroCounterpoint.CHANT.find(each => each.id === cpNew.cantus);
    if (chant) return { pitches: MaestroCounterpoint.fuxNotes(chant), mode: chant.mode, final: chant.final, name: chant.label };
    const exercise = cpNew.cantus === "current" ? (cp.exercise?.kind === "cantus" ? cp.exercise : null)
        : cpNew.cantus.startsWith("own:") ? cp.saved?.find(item => `own:${item.id}` === cpNew.cantus)?.exercise : null;
    const whole = exercise && MaestroCounterpoint.cantusOf(exercise);
    return whole ? { ...whole, name: exercise.title || "your cantus" } : null;
}

function renderCpNewPanel() {
    document.querySelectorAll("#cpNewKind [data-kind]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.kind === cpNew.kind)));
    document.querySelectorAll("#cpNewSpecies [data-species]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.species) === cpNew.species)));
    document.querySelectorAll("#cpNewPlace [data-below]").forEach(button => button.setAttribute("aria-pressed", String((button.dataset.below === "true") === cpNew.below)));
    document.querySelectorAll("#cpNewForm [data-form]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.form === cpNew.form)));
    document.querySelectorAll("#cpNewClef [data-clef]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.clef === cpNew.clef)));
    $("cpNewSpeciesFields").hidden = cpNew.kind !== "species";
    $("cpNewFourFields").hidden = cpNew.kind !== "fourpart";
    $("cpNewCantusFields").hidden = cpNew.kind !== "cantus";
    $("cpNewCantus").replaceChildren(...cpCantusChoices());
    const choosable = [...$("cpNewCantus").options].some(option => option.value === cpNew.cantus && !option.disabled);
    if (!choosable) cpNew.cantus = "fux-dorian";
    $("cpNewCantus").value = cpNew.cantus;
    $("cpNewKey").value = cpNew.key;
    const finals = MaestroCounterpoint.cantusFinals(cpNew.mode);
    if (!finals.includes(cpNew.final)) cpNew.final = finals.includes("D") ? "D" : finals[0];
    $("cpNewFinal").replaceChildren(...finals.map(final => Object.assign(element("option", "", final), { value: final })));
    $("cpNewMode").value = cpNew.mode;
    $("cpNewFinal").value = cpNew.final;
    $("cpNewLength").value = String(cpNew.length);
}

function startCpExercise() {
    let exercise;
    if (cpNew.kind === "cantus") {
        exercise = MaestroCounterpoint.cantusExercise({ mode: cpNew.mode, final: cpNew.final, clef: cpNew.clef, length: cpNew.length, title: `A cantus in ${cpNew.final} ${CP_MODE_WORDS[cpNew.mode].toLowerCase()}` });
    } else if (cpNew.kind === "species") {
        const chosen = cpChosenCantus();
        if (chosen) {
            exercise = MaestroCounterpoint.speciesExercise({ species: cpNew.species, cantus: chosen.pitches, cantusBelow: cpNew.below, mode: chosen.mode, final: chosen.final, title: `${CP_SPECIES_WORDS[cpNew.species]}, ${chosen.name}`.slice(0, MaestroNotation.TITLE_MAX) });
        } else if (cpNew.cantus.startsWith("made-")) {
            exercise = MaestroCounterpoint.speciesExercise({ species: cpNew.species, cantus: MaestroCounterpoint.fuxNotes(fux), cantusBelow: cpNew.below, mode: fux.mode, final: fux.final, title: `${CP_SPECIES_WORDS[cpNew.species]}, ${fux.label.replace("Fux, ", "Fux's ")}` });
        } else {
            const mode = cpNew.cantus === "made-minor" ? "minor" : "major";
            const tonics = MaestroCounterpoint.FOURPART_KEYS[mode];
            const tonic = tonics[Math.floor(Math.random() * tonics.length)];
            const key = { fifths: MaestroNotation.keyFifths(tonic, mode), mode };
            const cantus = MaestroCounterpoint.makeCantus(key, 8 + Math.floor(Math.random() * 5));
            exercise = MaestroCounterpoint.speciesExercise({ species: cpNew.species, cantus, cantusBelow: cpNew.below, mode, final: tonic, title: `${CP_SPECIES_WORDS[cpNew.species]}, a cantus in ${tonic} ${mode}` });
        }
    } else if (cpNew.kind === "fourpart") {
        const [tonic, mode] = cpNewKeys()[Number(cpNew.key)] ?? cpNewKeys()[0];
        exercise = MaestroCounterpoint.fourPartExercise({ form: cpNew.form, tonic, mode, title: `${CP_FORM_WORDS[cpNew.form]} in ${tonic} ${mode}` });
    }
    if (!exercise) return;
    toggleConsPopover("cpNew", false);
    const replaced = cp.exercise && cpVoices().some((voice, index) => index !== cp.exercise.given && voice.notes.some(note => note.p)) && !cpIsSaved();
    setCpExercise(exercise, { undo: replaced ? "A new exercise." : null });
    $("cpStaff").focus({ preventScroll: true });
}

function cpNewKeys() {
    const major = MaestroCounterpoint.FOURPART_KEYS.major.map(tonic => [tonic, "major"]);
    const minor = MaestroCounterpoint.FOURPART_KEYS.minor.map(tonic => [tonic, "minor"]);
    return [...major, ...minor];
}

// ---- Saving, through AHK (data\counterpoint, a file each)

function askForCpExercises() {
    if (cp.asked) return;
    cp.asked = true;
    send("GetExercises");
}

function receiveExercises(items) {
    cp.saved = (Array.isArray(items) ? items : []).flatMap(item => {
        if (!item || typeof item.id !== "string" || !CP_ID.test(item.id)) return [];
        const exercise = MaestroCounterpoint.readExercise(item.text);
        return exercise ? [{ id: item.id, exercise, text: MaestroCounterpoint.exerciseText(exercise) }] : [];
    }).slice(0, CP_MAX).sort((a, b) => (a.exercise.title || "").localeCompare(b.exercise.title || "", undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id));
    if (cpIsShown()) renderCounterpoint();
}

const newCpId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => "abcdefghijklmnopqrstuvwxyz0123456789"[byte % 36]).join("");

function saveCpExercise(asNew = false) {
    if (cp.saved === null) return;
    let id = cp.id;
    if (asNew || !id || !cp.saved.some(item => item.id === id)) {
        if (cp.saved.length >= CP_MAX) {
            showToast(`Maestro keeps up to ${CP_MAX} exercises. Delete one to save another.`);
            return;
        }
        id = newCpId();
    }
    const text = cpText();
    cp.saving.set(id, text);
    cp.id = id;
    send("SaveExercise", `${id}\n${text}`);
    toggleConsPopover("cpMenu", false);
}

function exerciseSaved(id) {
    const text = cp.saving.get(id);
    if (text === undefined) return;
    cp.saving.delete(id);
    const exercise = MaestroCounterpoint.readExercise(text);
    if (!exercise || cp.saved === null) return;
    cp.saved = [...cp.saved.filter(item => item.id !== id), { id, exercise, text }].sort((a, b) => (a.exercise.title || "").localeCompare(b.exercise.title || "", undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id));
    if (cp.id === id) cp.savedText = text;
    saveCounterpoint();
    if (cpIsShown()) renderCounterpoint();
}

function exerciseDeleted(id) {
    if (cp.saved === null) return;
    const gone = cp.saved.find(item => item.id === id);
    cp.saved = cp.saved.filter(item => item.id !== id);
    if (cp.id === id) {
        cp.id = null;
        cp.savedText = null;
        saveCounterpoint();
    }
    if (cpIsShown()) renderCounterpoint();
    if (gone) showToast(`Deleted ${gone.exercise.title || "Untitled"}.`, { label: "Undo", run: () => {
        cp.saving.set(gone.id, gone.text);
        send("SaveExercise", `${gone.id}\n${gone.text}`);
    } });
}

function exercisesFailed() {
    cp.saving.clear();
    if (cp.saved === null) cp.saved = [];
    if (cpIsShown()) renderCounterpoint();
}

function openCpExercise(id) {
    const item = cp.saved?.find(each => each.id === id);
    if (!item) return;
    toggleConsPopover("cpMenu", false);
    const unsaved = !cpIsSaved() && cpVoices().some((voice, index) => index !== cp.exercise.given && voice.notes.some(note => note.p));
    setCpExercise(item.exercise, { id: item.id, savedText: item.text, undo: unsaved ? `Opened ${item.exercise.title || "Untitled"}.` : null });
}

// ---- Rename

function startCpRename() {
    toggleConsPopover("cpMenu", false);
    cp.renaming = true;
    $("cpTitleButton").hidden = true;
    $("cpTitleInput").hidden = false;
    $("cpTitleInput").value = cp.exercise.title;
    requestAnimationFrame(() => {
        $("cpTitleInput").focus();
        $("cpTitleInput").select();
    });
}

function endCpRename(keep) {
    if (!cp.renaming) return;
    cp.renaming = false;
    const title = $("cpTitleInput").value.replace(/[\u0000-\u001F\u007F"]/g, " ").replace(/\s+/g, " ").trim().slice(0, MaestroNotation.TITLE_MAX);
    $("cpTitleInput").hidden = true;
    $("cpTitleButton").hidden = false;
    const score = keep && title && title !== cp.exercise.title ? MaestroNotation.cleanScore({ ...cp.exercise.score, title }) : null;
    if (!score || !changeCp(Object.freeze({ ...cp.exercise, title: score.title, score }))) renderCounterpoint();
    $("cpTitleButton").focus();
}

// ---- Printing and MusicXML

function printCpExercise() {
    toggleConsPopover("cpMenu", false);
    const page = $("printChart");
    if (!page) return;
    const head = element("header", "print-head");
    head.append(element("h1", "", cp.exercise.title || "Untitled"), element("p", "", cpFacts(cp.exercise)));
    const holder = element("div", "print-exercise");
    const saved = cp.drawn;
    const staff = $("cpStaff");
    // Drawn for the page's width at full size, then the screen's drawing is put back.
    const width = staff.style.width;
    const scale = cp.scale;
    staff.style.width = "1100px";
    cp.scale = CP_SCALE;
    drawCpStaff();
    holder.append(staff.firstElementChild);
    staff.style.width = width;
    cp.scale = scale;
    cp.drawn = saved;
    drawCpStaff();
    fitCpLines();
    page.replaceChildren(head, holder);
    window.print();
}

function exportCpExercise() {
    toggleConsPopover("cpMenu", false);
    const xml = MaestroNotation.musicXml({ ...cp.exercise.score, title: cp.exercise.title });
    send("ExportMusicXml", `${(cp.exercise.title || "Exercise").replace(/[\r\n]/g, " ")}\n${xml}`);
}

function exerciseExported(file) {
    showToast(`Exported to data\\exports\\${file}.`, { label: "Show in folder", run: () => send("ShowExport") });
}

// ---- Hearing it: each voice's notes booked a little ahead on the audio clock.

async function playCpExercise() {
    if (cp.playing) {
        stopCpPlaying();
        return;
    }
    const context = await readyConsAudio();
    if (!context) return;
    const eighth = 30 / metro.settings.tempo;
    const events = cpVoices().flatMap((voice, index) => (cp.hear[index] ? MaestroNotation.soundingEvents(voice.notes).map(event => ({ ...event, voice: index })) : []))
        .sort((a, b) => a.start - b.start);
    if (!events.length) return;
    const end = Math.max(...events.map(event => event.start + event.length));
    cp.playing = { start: context.currentTime + 0.12, next: 0, events, eighth, end, voices: [], timer: null, context };
    const tick = () => {
        const playing = cp.playing;
        if (!playing) return;
        if (!cpIsShown()) {
            stopCpPlaying();
            return;
        }
        const elapsed = playing.context.currentTime - playing.start;
        const due = [];
        while (playing.next < playing.events.length && playing.events[playing.next].start * playing.eighth < elapsed + 0.8) due.push(playing.events[playing.next++]);
        if (due.length) {
            const offsets = due.map(event => Math.max(0, event.start * playing.eighth - elapsed));
            const ends = due.map((event, at) => offsets[at] + event.length * playing.eighth - 0.03);
            pluckConsNotes(due.map(event => event.midi), offsets, ends).then(voices => playing.voices.push(...voices));
        }
        lightCpPlaying(elapsed / playing.eighth);
        if (elapsed > playing.end * playing.eighth + 0.3) {
            stopCpPlaying();
            return;
        }
        playing.timer = setTimeout(tick, 120);
    };
    tick();
    renderCpVoices();
}

function stopCpPlaying() {
    const playing = cp.playing;
    if (!playing) return;
    cp.playing = null;
    clearTimeout(playing.timer);
    playing.voices.forEach(dampConsVoice);
    lightCpPlaying(-1);
    if ($("cpPlay")) renderCpVoices();
}

// The notes sounding now, lit on the staff.
function lightCpPlaying(time) {
    const voices = cpVoices();
    $("cpStaff").querySelectorAll(".cp-ring").forEach(ring => {
        const [voice, index] = ring.dataset.ring.split(":").map(Number);
        const entry = MaestroNotation.timed(voices[voice].notes)[index];
        ring.classList.toggle("is-playing", time >= 0 && entry && entry.onset <= time && time < entry.onset + entry.length);
    });
}

// ---- The neck: the selected moment's notes, the selected note as the root;
// a note clicked there is written into the selected note.

function cpNeckMarks() {
    const marks = new Map();
    if (!cp.exercise) return marks;
    const voices = cpVoices();
    const at = MaestroNotation.timed(voices[cp.at.voice].notes)[cp.at.index];
    if (!at) return marks;
    voices.forEach((voice, index) => {
        const entry = MaestroNotation.timed(voice.notes).find(each => each.onset <= at.onset && at.onset < each.onset + each.length);
        if (!entry?.note.p) return;
        const midi = MaestroNotation.midiOf(entry.note.p);
        const selected = index === cp.at.voice;
        if (!marks.has(midi) || selected) marks.set(midi, { kind: selected ? "root" : "note", label: MaestroNotation.pitchLetterName(entry.note.p) });
    });
    return marks;
}

consNeckModes.counterpoint = {
    short: true,
    mark: midi => cpNeckMarks().get(midi) ?? null,
    key: midi => cpNeckMarks().get(midi) ?? null,
    nameOf: midi => cpNeckMarks().get(midi)?.label ?? MaestroMusic.PLAIN_NAMES[((midi % 12) + 12) % 12],
    click: midi => {
        const key = cp.exercise.score.key;
        setCpNote(MaestroNotation.pitchFromMidi(midi, key.fifths, key.mode));
    },
    render: () => {
        askForCpExercises();
        renderCounterpoint();
    }
};

// ---- Wiring

wireConsPopover("cpMenu", $("cpTitleButton"), $("cpMenu"));
wireConsPopover("cpNew", $("cpMenuNew"), $("cpNewPanel"), { onOpen: () => $("cpNewKind").querySelector('[aria-pressed="true"]') });
$("cpStaff").addEventListener("click", cpStaffClick);
$("cpStaff").addEventListener("contextmenu", cpStaffErase);
$("cpStaff").addEventListener("pointermove", cpStaffHover);
$("cpStaff").addEventListener("pointerleave", cpStaffLeave);
$("cpStaff").addEventListener("wheel", cpStaffWheel, { passive: false });
$("cpKeysButton").addEventListener("click", () => {
    cp.showKeys = !cp.showKeys;
    saveCounterpoint();
    renderCpKeys();
});
// Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z) anywhere on the tab but in a field.
$("consCounterPanel").addEventListener("keydown", event => {
    if (!event.ctrlKey || event.altKey || event.metaKey || event.target.closest("input, select, textarea, [contenteditable]")) return;
    const key = event.key.toLowerCase();
    const done = key === "z" && !event.shiftKey ? undoCp() : (key === "y" || (key === "z" && event.shiftKey)) ? redoCp() : false;
    if (done) event.preventDefault();
});
$("cpStaff").addEventListener("keydown", event => {
    const voices = cpVoices();
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") moveCpSelection(event.key === "ArrowLeft" ? -1 : 1);
    else if (event.key === "ArrowUp" || event.key === "ArrowDown") stepCpNote(event.key === "ArrowUp" ? 1 : -1, event.shiftKey);
    else if (event.key === "Delete" || event.key === "Backspace") setCpNote(null);
    else if (event.key === "PageDown" || event.key === "PageUp") {
        if (cpCanTurnLine(event.key === "PageDown")) showCpLine(cp.lines.top + (event.key === "PageDown" ? 1 : -1));
    }
    else if (/^[a-gA-G]$/.test(event.key) && !event.ctrlKey && !event.altKey && !event.metaKey) letterCpNote(event.key.toUpperCase());
    else if (/^[1-4]$/.test(event.key) && cp.exercise.kind === "fourpart" && Number(event.key) - 1 !== cp.exercise.given) {
        cp.at = { voice: Number(event.key) - 1, index: Math.min(cp.at.index, voices[Number(event.key) - 1].notes.length - 1) };
        renderCounterpoint();
        renderConsNeck();
    } else if (event.key === "Enter") {
        const at = MaestroNotation.timed(voices[cp.at.voice].notes)[cp.at.index];
        const midis = voices.flatMap(voice => {
            const entry = MaestroNotation.timed(voice.notes).find(each => each.onset <= at.onset && at.onset < each.onset + each.length);
            return entry?.note.p ? [MaestroNotation.midiOf(entry.note.p)] : [];
        }).sort((a, b) => a - b);
        if (midis.length) pluckConsNotes(midis, consChordSpread(0.03));
    } else return;
    event.preventDefault();
});
$("cpVoices").addEventListener("click", event => {
    const button = event.target.closest("[data-hear]");
    if (!button) return;
    const index = Number(button.dataset.hear);
    cp.hear[index] = !cp.hear[index];
    saveCounterpoint();
    renderCpVoices();
});
$("cpVoices").addEventListener("dblclick", event => {
    const button = event.target.closest("[data-hear]");
    if (!button) return;
    const index = Number(button.dataset.hear);
    cp.hear = cp.hear.map((_, at) => at === index);
    saveCounterpoint();
    renderCpVoices();
});
$("cpPlay").addEventListener("click", playCpExercise);
$("cpWriting").addEventListener("click", event => {
    const button = event.target.closest("[data-writing]");
    if (!button || button.disabled) return;
    const voice = Number(button.dataset.writing);
    cp.at = { voice, index: Math.min(cp.at.index, cpVoices()[voice].notes.length - 1) };
    renderCounterpoint();
    renderConsNeck();
});
$("cpAccidentals").addEventListener("click", event => {
    const button = event.target.closest("[data-alter]");
    const note = cpVoices()[cp.at.voice]?.notes[cp.at.index];
    if (!button || !note?.p) return;
    setCpNote(MaestroNotation.pitch(note.p.step, Number(button.dataset.alter)));
});
$("cpClearNote").addEventListener("click", () => setCpNote(null));
$("cpClearAll").addEventListener("click", clearCpExercise);
$("cpRhythms").addEventListener("click", event => {
    const button = event.target.closest("[data-rhythm]");
    if (!button) return;
    const timed = MaestroNotation.timed(cpVoices()[cp.at.voice].notes);
    const bar = Math.floor((timed[cp.at.index]?.onset ?? 0) / MaestroNotation.barLength(cp.exercise.score.meter));
    const next = MaestroCounterpoint.setBarRhythm(cp.exercise, bar, MaestroCounterpoint.FIFTH_BARS[Number(button.dataset.rhythm)]);
    if (next === cp.exercise) return;
    const after = MaestroNotation.timed(MaestroNotation.voicesOf(next.score)[cp.at.voice].notes);
    changeCp(next, { voice: cp.at.voice, index: Math.max(0, after.findIndex(entry => Math.floor(entry.onset / 8) === bar)) });
});
$("cpProblems").addEventListener("click", event => {
    const button = event.target.closest("[data-voice]");
    if (!button) return;
    cp.at = { voice: Number(button.dataset.voice), index: Number(button.dataset.index) };
    if (cp.at.voice === cp.exercise.given) cp.at.voice = cpWritable()[0];
    renderCounterpoint();
    renderConsNeck();
    $("cpStaff").focus({ preventScroll: true });
});
$("cpSave").addEventListener("click", () => saveCpExercise(false));
$("cpSaveCopy").addEventListener("click", () => saveCpExercise(true));
$("cpRename").addEventListener("click", startCpRename);
$("cpTitleInput").addEventListener("keydown", event => {
    if (event.key === "Enter") endCpRename(true);
    else if (event.key === "Escape") {
        event.stopPropagation();
        endCpRename(false);
    }
});
$("cpTitleInput").addEventListener("blur", () => endCpRename(true));
$("cpPrint").addEventListener("click", printCpExercise);
$("cpExport").addEventListener("click", exportCpExercise);
$("cpExercises").addEventListener("click", event => {
    const open = event.target.closest("[data-exercise-open]");
    if (open) return openCpExercise(open.dataset.exerciseOpen);
    const remove = event.target.closest("[data-exercise-delete]");
    if (remove && cp.saved?.some(item => item.id === remove.dataset.exerciseDelete)) send("DeleteExercise", remove.dataset.exerciseDelete);
});
$("cpNewKind").addEventListener("click", event => {
    const button = event.target.closest("[data-kind]");
    if (!button) return;
    cpNew.kind = button.dataset.kind;
    renderCpNewPanel();
});
$("cpNewSpecies").addEventListener("click", event => {
    const button = event.target.closest("[data-species]");
    if (!button) return;
    cpNew.species = Number(button.dataset.species);
    renderCpNewPanel();
});
$("cpNewPlace").addEventListener("click", event => {
    const button = event.target.closest("[data-below]");
    if (!button) return;
    cpNew.below = button.dataset.below === "true";
    renderCpNewPanel();
});
$("cpNewForm").addEventListener("click", event => {
    const button = event.target.closest("[data-form]");
    if (!button) return;
    cpNew.form = button.dataset.form;
    renderCpNewPanel();
});
$("cpNewCantus").addEventListener("change", () => { cpNew.cantus = $("cpNewCantus").value; });
$("cpNewKey").addEventListener("change", () => { cpNew.key = $("cpNewKey").value; });
$("cpNewStart").addEventListener("click", startCpExercise);

$("cpNewMode").addEventListener("change", () => {
    if (!MaestroCounterpoint.CANTUS_MODES.includes($("cpNewMode").value)) return;
    cpNew.mode = $("cpNewMode").value;
    renderCpNewPanel();
});
$("cpNewFinal").addEventListener("change", () => {
    if (MaestroCounterpoint.cantusFinals(cpNew.mode).includes($("cpNewFinal").value)) cpNew.final = $("cpNewFinal").value;
});
$("cpNewClef").addEventListener("click", event => {
    const button = event.target.closest("[data-clef]");
    if (!button) return;
    cpNew.clef = button.dataset.clef;
    renderCpNewPanel();
});
$("cpNewLength").addEventListener("change", () => {
    const length = Number($("cpNewLength").value);
    if (Number.isInteger(length)) cpNew.length = length;
});

$("cpNewMode").replaceChildren(...MaestroCounterpoint.CANTUS_MODES.map(mode => Object.assign(element("option", "", CP_MODE_WORDS[mode]), { value: mode })));
const { shortest, longest } = MaestroCounterpoint.CANTUS_LENGTH;
$("cpNewLength").replaceChildren(...Array.from({ length: longest - shortest + 1 }, (_, at) => Object.assign(element("option", "", String(shortest + at)), { value: String(shortest + at) })));
$("cpNewKey").replaceChildren(...cpNewKeys().map(([tonic, mode], index) => {
    const option = element("option", "", `${tonic} ${mode}`);
    option.value = String(index);
    return option;
}));
// The staff's own size: wider or narrower, the lines are laid out again;
// taller or shorter (the window, or the neck hidden), the lines shown are
// fitted again. Nothing is done while the tab isn't shown.
new ResizeObserver(() => {
    if (!cpIsShown() || !cp.drawn) return;
    if ($("cpStaff").clientWidth !== cp.drawnWidth) drawCpStaff();
    fitCpLines();
}).observe($("cpStaff"));
