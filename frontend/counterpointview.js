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
// Room under each line for what's written beneath it: a melody's chords take a second row (2.6.0).
const cpRoom = exercise => (exercise.kind === "melody" && cpMelody.chords !== "off" ? 41 : exercise.kind !== "fourpart" ? 22 : (exercise.form === "figured" ? 56 : 30) + cpNctRoom(exercise));

// ---- Non-chord tones (2.11.0), labeled as Kostka and Payne label them, by
// their notes: over the soprano (above the top staff), under the alto and
// over the tenor (between the staves), under the bass (below the bottom
// staff). The room is kept whether or not there are any, so nothing moves
// while writing. Switched off in Rules, none.
const CP_NCT_ROOM = Object.freeze({ headroom: 24, between: 24, room: 20 });
const cpShowsNct = (exercise = cp.exercise) => exercise?.kind === "fourpart" && cp.nctLabels;
const cpNctRoom = exercise => (cpShowsNct(exercise) ? CP_NCT_ROOM.room : 0);
const CP_GLYPH = {
    w: String.fromCodePoint(0xE1D2), h: String.fromCodePoint(0xE1D3), q: String.fromCodePoint(0xE1D5), e: String.fromCodePoint(0xE1D7),
    s: String.fromCodePoint(0xE1D9), t: String.fromCodePoint(0xE1DB), f: String.fromCodePoint(0xE1DD), dot: String.fromCodePoint(0xE1E7)
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
    // Bars selected by the strip above them (2.6.0): { from, to, anchor },
    // or null when the tools act on the selected note's bar; and the bars'
    // rhythms copied, kept while Maestro runs.
    bars: null,
    copied: null,
    // The checker's rules switched off (2.8.0; one at a time since 2.11.0),
    // kept on this PC; and each kind's style for new exercises (2.11.0).
    rulesOff: [],
    styles: { species: "fux", fourpart: "common" },
    // Four parts' non-chord tones labeled by their notes (2.11.0), kept on this PC.
    nctLabels: true
};

const cpVoices = () => MaestroNotation.voicesOf(cp.exercise.score);
const cpWritable = () => cpVoices().map((_, index) => index).filter(index => index !== cp.exercise.given);
const cpIsShown = () => $("conservatory").classList.contains("active") && consSections.current() === "counterpoint";
const cpText = () => MaestroCounterpoint.exerciseText(cp.exercise);
const cpIsSaved = () => cp.id !== null && cp.savedText === cpText();
const cpKeyName = key => `${MaestroNotation.keyTonic(key.fifths, key.mode)} ${key.mode}`;

// A melody's tools (2.6.0): the motif's size and how it's developed, the
// chords under it, and whether a transposing part is shown as it's written.
const cpMelody = { size: 1, how: "up", chords: "off", view: "concert" };
const cpIsMelody = () => cp.exercise?.kind === "melody";
// Written for a transposing instrument, the staff is to read, not to write.
const cpReadOnly = () => cpIsMelody() && cpMelody.view === "written" && MaestroMelody.transposes(cp.exercise.instrument);
const cpShownScore = () => (cpReadOnly() ? MaestroMelody.writtenScore(cp.exercise.score, cp.exercise.instrument) ?? cp.exercise.score : cp.exercise.score);

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
    // Before 2.11.0 whole groups were kept as switched off: their rules, now.
    cp.rulesOff = Array.isArray(stored?.ruleIdsOff) ? MaestroCounterpoint.cleanRulesOff(stored.ruleIdsOff) : MaestroCounterpoint.rulesOfGroups(stored?.rulesOff);
    for (const kind of Object.keys(cp.styles)) {
        if (MaestroCounterpoint.stylesOf(kind).some(style => style.id === stored?.styles?.[kind])) cp.styles[kind] = stored.styles[kind];
    }
    cp.nctLabels = stored?.nctLabels !== false;
    cp.at = { voice: cpWritable()[0] ?? 0, index: 0 };
}

function saveCounterpoint() {
    try {
        localStorage.setItem(CP_KEY, JSON.stringify({ text: cpText(), id: cp.id, savedText: cp.savedText, hear: cp.hear, ruleIdsOff: cp.rulesOff, styles: cp.styles, nctLabels: cp.nctLabels }));
    } catch {
        // Storage full or blocked: the exercise stays for this session.
    }
}

const cpFirstExercise = () => MaestroCounterpoint.speciesExercise({ species: 1, cantus: MaestroCounterpoint.fuxNotes(MaestroCounterpoint.FUX[0]), cantusBelow: true, mode: "dorian", final: "D", title: "First species, Fux's Dorian" });

// ---- Changes, each with Undo where it replaces work

function setCpExercise(exercise, { id = null, savedText = null, undo = null } = {}) {
    const before = { exercise: cp.exercise, id: cp.id, savedText: cp.savedText };
    stopCpPlaying();
    closeCpClefMenu();
    cp.exercise = exercise;
    cp.id = id;
    cp.savedText = savedText;
    cp.at = { voice: cpWritable()[0] ?? 0, index: firstOpenSlot(cpWritable()[0] ?? 0) };
    cp.history = { past: [], future: [] };
    cp.lines.top = 0;
    cp.bars = null;
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

// A model answer (2.6.0) in place of what's written, with Undo: one the
// checker finds no error in, the given voice kept.
function modelCpExercise() {
    const answer = MaestroCounterpoint.modelAnswer(cp.exercise);
    if (!answer) {
        showToast("No model answer turned up for this exercise. Try another bar rhythm, or Clear exercise.");
        return;
    }
    const before = { exercise: cp.exercise, at: cp.at };
    stopCpPlaying();
    changeCp(answer, cp.at);
    showToast("Wrote a model answer.", { label: "Undo", run: () => changeCp(before.exercise, before.at) });
}

// Non-chord tones added to a finished, faultless answer (2.11.0), as model
// answers are embellished: each kept only if the checker finds nothing new.
function embellishCpExercise() {
    const problems = MaestroCounterpoint.check(cp.exercise);
    if (problems.some(each => each.rule === "unfinished")) {
        showToast("Write every note first: non-chord tones decorate a finished answer.");
        return;
    }
    if (problems.some(each => each.level === "error")) {
        showToast("Mend the errors first: a non-chord tone is added only where the checker finds nothing new.");
        return;
    }
    const before = MaestroCounterpoint.nonChordTones(cp.exercise).length;
    const next = MaestroCounterpoint.embellishFourPart(cp.exercise, { voices: cpWritable() });
    if (next === cp.exercise) {
        showToast("No non-chord tone fits here without a new problem.");
        return;
    }
    stopCpPlaying();
    changeCp(next, cp.at);
    const added = MaestroCounterpoint.nonChordTones(next).length - before;
    showToast(`Added ${added} non-chord ${added === 1 ? "tone" : "tones"}.`, { label: "Undo", run: undoCp });
}

// ---- A melody's tools (2.6.0)

const cpBarOf = (index, exercise = cp.exercise) => MaestroMelody.barsOfNotes(MaestroNotation.voicesOf(exercise.score)[0].notes, MaestroNotation.barLength(exercise.score.meter))[index] ?? 0;

function renderCpMelodyTools() {
    const melody = cpIsMelody();
    // While bars are selected, their rhythm's tools take this row's place.
    $("cpMelodyTools").hidden = !melody || Boolean(cp.bars);
    if (!melody) return;
    const from = cpBarOf(cp.at.index);
    $("cpMotifSize").replaceChildren(...[1, 2, 4].map(size => Object.assign(element("option", "", size === 1 ? `Bar ${from + 1}` : `Bars ${from + 1}\u2013${from + size}`), { value: String(size) })));
    $("cpMotifSize").value = String(cpMelody.size);
    $("cpMotifHow").value = cpMelody.how;
    $("cpMotifWrite").disabled = cpReadOnly();
    document.querySelectorAll("#cpChords [data-chords]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.chords === cpMelody.chords)));
    $("cpChordsOpen").hidden = cpMelody.chords === "off";
    const transposes = MaestroMelody.transposes(cp.exercise.instrument);
    $("cpViewField").hidden = !transposes;
    document.querySelectorAll("#cpView [data-shown]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.shown === cpMelody.view)));
    // Show (2.6.0): what's chosen, in the chip, the choices in its panel.
    const chords = cpMelody.chords === "off" ? "Melody only" : "Chords";
    $("cpShowName").textContent = transposes && cpMelody.view === "written" ? `${chords} \u00B7 Written` : chords;
}

// The motif (from the bar selected) developed and written after it, with Undo.
function developCpMotif() {
    if (!cpIsMelody() || cpReadOnly()) return;
    const exercise = cp.exercise;
    const notes = MaestroNotation.voicesOf(exercise.score)[0].notes;
    const how = MaestroMelody.DEVELOPMENTS.find(each => each.id === cpMelody.how);
    const result = MaestroMelody.developMotif(notes, { from: cpBarOf(cp.at.index), size: cpMelody.size, how: cpMelody.how, fifths: exercise.score.key.fifths, bar: MaestroNotation.barLength(exercise.score.meter), most: MaestroCounterpoint.MELODY_BARS.max });
    const next = result && MaestroCounterpoint.withMelodyNotes(exercise, result.notes);
    if (!result || next === exercise) {
        showToast(!MaestroMelody.barsOfNotes(notes).some((bar, index) => bar >= cpBarOf(cp.at.index) && bar < cpBarOf(cp.at.index) + cpMelody.size && notes[index].p)
            ? "The motif's bars hold no notes yet." : cpMelody.how === "diminish" ? "Eighths can't be halved: Maestro's shortest note is an eighth."
            : `There's no room: a melody has at most ${MaestroCounterpoint.MELODY_BARS.max} bars.`);
        return;
    }
    const before = { exercise, at: cp.at };
    const index = MaestroMelody.barsOfNotes(MaestroNotation.voicesOf(next.score)[0].notes).findIndex(bar => bar === result.from);
    changeCp(next, { voice: 0, index: Math.max(0, index) });
    showToast(`Wrote the motif's ${how.label.toLowerCase()} from bar ${result.from + 1}.`, { label: "Undo", run: () => changeCp(before.exercise, before.at) });
}

function cpMelodyChords() {
    if (!cpIsMelody() || cpMelody.chords === "off") return [];
    const exercise = cp.exercise;
    return MaestroMelody.harmonize(MaestroNotation.voicesOf(exercise.score)[0].notes, exercise.score.key, { per: Number(cpMelody.chords), bar: MaestroNotation.barLength(exercise.score.meter) });
}

// The chords made Progressions' sketch: a bar each (or two a bar), in the melody's key.
function openCpChordsInProgressions() {
    const chords = cpMelodyChords();
    if (!chords.length) return;
    const key = cp.exercise.score.key;
    const scale = { major: "major", ionian: "major", minor: "minor", aeolian: "minor" }[key.mode] ?? key.mode;
    const per = Number(cpMelody.chords);
    const bars = [];
    for (let at = 0; at < chords.length; at += per) bars.push(chords.slice(at, at + per).map(chord => chord.name));
    const sketch = MaestroHarmony.cleanChart({ title: (cp.exercise.title || "Melody").slice(0, MaestroHarmony.CHART_LIMITS.title), root: MaestroNotation.keyTonic(key.fifths, key.mode), scale, beats: 4, sections: [{ name: "", repeat: 1, bars }] });
    if (!sketch) {
        showToast("Progressions can't hold these chords.");
        return;
    }
    replaceProgSketch(sketch, null, `Opened the melody's chords as ${sketch.title}.`);
    consSections.show("progressions");
}

function firstOpenSlot(voice, exercise = cp.exercise) {
    const notes = MaestroNotation.voicesOf(exercise.score)[voice]?.notes ?? [];
    const open = notes.findIndex((note, index) => !note.p && !(index === 0 && exercise.kind === "species" && exercise.species > 1));
    return open >= 0 ? open : 0;
}

function setCpNote(p, { hear = true } = {}) {
    if (cpReadOnly()) {
        showToast("The part is shown as written. Choose Concert to write.");
        return;
    }
    const { voice, index } = cp.at;
    if (!changeCp(MaestroCounterpoint.setNote(cp.exercise, voice, index, p))) return;
    if (hear && p) organConsNotes([MaestroNotation.midiOf(p)], [cpOrganStops()[voice]], 0, [CP_ORGAN_NOTE]);
}

// The staff is heard on the organ (2.11.0), each voice in its own stop and
// place from left to right; a note written sounds briefly in its voice's.
const CP_ORGAN_NOTE = 0.7;
const cpOrganStops = () => MaestroMusic.organVoices(cpVoices().length);

// A voice's note sounding at the selected moment (2.11.0: four parts'
// voices move in rhythms of their own).
function cpIndexAt(voice) {
    const voices = cpVoices();
    const at = MaestroNotation.timed(voices[cp.at.voice]?.notes ?? [])[cp.at.index];
    const timed = MaestroNotation.timed(voices[voice].notes);
    if (!at) return Math.min(cp.at.index, timed.length - 1);
    return (timed.find(entry => entry.onset <= at.onset && at.onset < entry.onset + entry.length) ?? timed.at(-1)).index;
}

function moveCpSelection(delta) {
    const notes = cpVoices()[cp.at.voice].notes;
    cp.at = { voice: cp.at.voice, index: Math.max(0, Math.min(notes.length - 1, cp.at.index + delta)) };
    renderCounterpoint();
    renderConsNeck();
}

// ---- Rhythm, bar by bar and note by note (2.6.0): the fifth species and
// melodies. Bars are chosen by the strip above them; a note's length by
// Length or 1, 2, 4, 8 and the dot.

const CP_LENGTH_KEYS = Object.freeze({ 1: "w", 2: "h", 4: "q", 8: "e", 6: "s" });
// A melody's shorter values (2.6.0): a sixteenth on 6; the rest by button alone.
const CP_LENGTHS = Object.freeze([["w", "1"], ["h", "2"], ["q", "4"], ["e", "8"], ["s", "6"], ["t", ""], ["f", ""]]);
const CP_LENGTH_WORDS = Object.freeze({
    w: "A whole note", h: "A half note", q: "A quarter note", e: "An eighth note", s: "A sixteenth note", t: "A thirty-second note", f: "A sixty-fourth note",
    "h.": "A dotted half", "q.": "A dotted quarter", "e.": "A dotted eighth", "s.": "A dotted sixteenth", "t.": "A dotted thirty-second"
});
const CP_TAP_MOST = 4;          // bars tapped at once
const CP_TAP_EARLY = 0.12;      // s: a tap this early on the first beat counts
const cpBarSize = () => MaestroNotation.barLength(cp.exercise.score.meter);
const cpRhythmTimed = () => MaestroNotation.timed(cpVoices()[MaestroCounterpoint.rhythmVoice(cp.exercise)].notes);
// The voice whose rhythm is written now: in four parts (2.11.0), the one selected.
const cpLengthVoice = () => MaestroCounterpoint.rhythmVoice(cp.exercise, cp.at.voice);
const cpBarNumbers = (from, to) => (from === to ? `bar ${from + 1}` : `bars ${from + 1}\u2013${to + 1}`);

// The bars the rhythm tools act on: those selected, or the selected note's;
// null where the rhythm isn't written (or the bar is the species' last).
function cpRhythmSpan() {
    const count = MaestroCounterpoint.rhythmBars(cp.exercise);
    if (!count) return null;
    if (cp.bars) return { from: Math.min(cp.bars.from, count - 1), to: Math.min(cp.bars.to, count - 1) };
    if (cp.at.voice !== MaestroCounterpoint.rhythmVoice(cp.exercise)) return null;
    const bar = Math.floor((cpRhythmTimed()[cp.at.index]?.onset ?? 0) / cpBarSize());
    return bar < count ? { from: bar, to: bar } : null;
}

// A bar chosen (with Shift, the bars from the one chosen before); the note
// selected moves to the first bar's first, so writing carries on there.
function selectCpBar(bar, extend = false) {
    const count = MaestroCounterpoint.rhythmBars(cp.exercise);
    if (!Number.isInteger(bar) || bar < 0 || bar >= count) return;
    const anchor = extend && cp.bars ? cp.bars.anchor : bar;
    cp.bars = { from: Math.min(anchor, bar), to: Math.max(anchor, bar), anchor };
    const first = cpRhythmTimed().find(entry => Math.floor(entry.onset / cpBarSize()) === cp.bars.from);
    if (first) cp.at = { voice: MaestroCounterpoint.rhythmVoice(cp.exercise), index: first.index };
    renderCounterpoint();
    renderConsNeck();
}

// A change to bars' rhythm, the note selected the first of the first bar.
function changeCpRhythm(next, bar) {
    if (!next || next === cp.exercise) return false;
    const voice = MaestroCounterpoint.rhythmVoice(next);
    const index = MaestroNotation.timed(MaestroNotation.voicesOf(next.score)[voice].notes).findIndex(entry => Math.floor(entry.onset / cpBarSize()) === bar);
    return changeCp(next, { voice, index: Math.max(0, index) });
}

function copyCpBars() {
    const span = cpRhythmSpan();
    if (!span) return;
    cp.copied = [];
    for (let bar = span.from; bar <= span.to; bar++) cp.copied.push(MaestroCounterpoint.barRhythm(cp.exercise, bar));
    showToast(`Copied the rhythm of ${cpBarNumbers(span.from, span.to)}.`);
    renderCpTools();
}

function pasteCpBars() {
    const span = cpRhythmSpan();
    if (!span || !cp.copied) return;
    if (!changeCpRhythm(MaestroCounterpoint.pasteRhythms(cp.exercise, span.from, span.to, cp.copied), span.from)) showToast("The bars already have that rhythm.");
}

function clearCpBars() {
    const span = cpRhythmSpan();
    if (span) changeCpRhythm(MaestroCounterpoint.clearBars(cp.exercise, span.from, span.to), span.from);
}

// The selected note's length, within its bar; a toast says why not.
// The selected note as the staff draws it (2.11.0): in four parts, a note
// held through two chords is drawn as one, standing for both (`indices`).
function cpDrawnNote(voice = cp.at.voice, index = cp.at.index) {
    const notes = cpVoices()[voice]?.notes ?? [];
    const shown = MaestroCounterpoint.drawnFourPart(cp.exercise);
    const at = shown ? shown.indices[voice].findIndex(list => list.includes(index)) : -1;
    if (at < 0) return { note: notes[index], indices: [index] };
    return { note: MaestroNotation.voicesOf(shown.score)[voice].notes[at], indices: shown.indices[voice][at] };
}

function setCpLength(code) {
    const four = cp.exercise.kind === "fourpart";
    if (cpReadOnly() || cp.at.voice !== cpLengthVoice()) return;
    if (!MaestroCounterpoint.codesFor(cp.exercise).includes(code)) {
        showToast(four ? "Four parts are written in whole notes to eighths." : "The fifth species is written in whole notes to eighths.");
        return;
    }
    // A note drawn for two changes as one: another length lets go of the
    // second, then sets the first's.
    const drawn = cpDrawnNote();
    const index = drawn.indices[0];
    const held = drawn.indices.length > 1 && `${drawn.note.d}${drawn.note.dot ? "." : ""}` !== code;
    const from = held ? MaestroCounterpoint.toggleTie(cp.exercise, index, cp.at.voice) : cp.exercise;
    const next = from && MaestroCounterpoint.setNoteLength(from, index, code, cp.at.voice);
    if (!next) {
        showToast(`${CP_LENGTH_WORDS[code] ?? "That length"} doesn't fit there: it would ${four ? "run past the last chord" : "cross the bar line"} or start off the beat.`);
        return;
    }
    cp.bars = null;
    changeCp(next, { voice: cp.at.voice, index });
}

function toggleCpDot() {
    const note = cpDrawnNote().note;
    if (!note) return;
    if (!note.dot && !MaestroCounterpoint.codesFor(cp.exercise).includes(`${note.d}.`)) {
        showToast(note.d === "w" ? "A whole note can't be dotted in 4/4." : note.d === "f" ? "A sixty-fourth can't be dotted: there are no hundred-twenty-eighths." : "An eighth can't be dotted in the fifth species.");
        return;
    }
    setCpLength(note.dot ? note.d : `${note.d}.`);
}

function toggleCpTie() {
    const next = MaestroCounterpoint.toggleTie(cp.exercise, cp.at.index, cp.at.voice);
    if (next) changeCp(next, cp.at);
}

// Length: the selected note's, each choice off where it wouldn't fit.
function renderCpLengths() {
    const exercise = cp.exercise;
    const four = exercise.kind === "fourpart";
    const voice = MaestroCounterpoint.rhythmEditable(exercise) ? MaestroCounterpoint.rhythmVoice(exercise, cp.at.voice) : -1;
    const shown = voice >= 0 && voice === cp.at.voice && !cpReadOnly() && !cp.bars && (four || Boolean(cpRhythmSpan()));
    $("cpLengthField").hidden = !shown;
    if (!shown) return;
    const drawn = cpDrawnNote(voice);
    const note = drawn.note;
    const fits = code => MaestroCounterpoint.setNoteLength(exercise, drawn.indices[0], code, voice) !== null;
    const make = (text, label, data, pressed, enabled) => {
        const button = element("button", "cp-rhythm cp-length");
        button.type = "button";
        Object.assign(button.dataset, data);
        button.textContent = text;
        button.setAttribute("aria-label", label);
        button.title = label;
        button.setAttribute("aria-pressed", String(pressed));
        button.disabled = !enabled;
        return button;
    };
    const codes = MaestroCounterpoint.codesFor(exercise);
    const buttons = CP_LENGTHS.filter(([d]) => codes.includes(d)).map(([d, key]) => make(CP_GLYPH[d], key ? `${CP_LENGTH_WORDS[d]} (${key})` : CP_LENGTH_WORDS[d], { length: d }, note.d === d, fits(d)));
    const dotted = note.dot ? note.d : `${note.d}.`;
    // The dot and Tie are switches of their own, filled when on beside the length's marker.
    const dot = make(CP_GLYPH.dot, "Dotted (.)", { dot: "1" }, note.dot, codes.includes(dotted) && fits(dotted));
    dot.classList.add("segment-toggle");
    buttons.push(dot);
    if (exercise.kind === "melody" || four) {
        const tie = make("Tie", four ? "Tied to the next note, which takes its pitch: into the next chord, a suspension" : "Tied to the next note, which takes its pitch", { tie: "1" }, note.tie, MaestroCounterpoint.toggleTie(exercise, cp.at.index, voice) !== null);
        tie.classList.add("cp-tie", "segment-toggle");
        buttons.push(tie);
    }
    $("cpLengths").replaceChildren(...buttons);
}

// Above each bar whose rhythm is written, a strip to select it, with the
// bar's number; the bars selected shaded.
function drawCpBarStrips(svg, drawn) {
    if (cpReadOnly() || !drawn.barSpans) return;
    const count = MaestroCounterpoint.rhythmBars(cp.exercise);
    if (!count) return;
    const space = drawn.space;
    for (const span of drawn.barSpans) {
        const top = drawn.systems[span.system].top;
        if (span.bar < count) {
            const selected = cp.bars && span.bar >= cp.bars.from && span.bar <= cp.bars.to;
            const strip = svgNode("rect", { class: `cp-bar-strip${selected ? " is-selected" : ""}`, x: span.x1 + 0.2 * space, y: top + 0.1 * space, width: Math.max(space, span.x2 - span.x1 - 0.4 * space), height: 0.9 * space, rx: 3 });
            strip.dataset.bar = String(span.bar);
            const title = svgNode("title", {});
            title.textContent = `Bar ${span.bar + 1}: click to select it, with Shift the bars to it`;
            strip.append(title);
            svg.append(strip);
        }
        const number = svgNode("text", { class: "cp-bar-number", x: span.x1 + 0.6 * space, y: top + 0.8 * space });
        number.textContent = String(span.bar + 1);
        svg.append(number);
    }
}

// ---- Tap: after a bar's count at the metronome's tempo, the bars' rhythm
// tapped on Space (or the button), each tap to the nearest eighth.

const cpTap = { sound: null };

async function tapCpBars() {
    const span = cpRhythmSpan();
    if (!span || cpTap.sound) return;
    stopCpPlaying();
    if (metro.running) stopMetronome();
    const bars = Math.min(CP_TAP_MOST, span.to - span.from + 1);
    const sound = { out: null, timers: [], taps: [], from: span.from, bars, phase: "count", start: 0, beat: 0 };
    cpTap.sound = sound;
    renderCpTools();
    const context = await readyConsAudio();
    if (!context || cpTap.sound !== sound) return;
    const beats = cpBarSize() / 2;
    sound.beat = 60 / metro.settings.tempo;
    sound.out = context.createGain();
    sound.out.connect(consToneOutput(context));
    sound.start = context.currentTime + 0.1 + beats * sound.beat;
    const end = sound.start + bars * beats * sound.beat;
    for (let at = -beats; at < bars * beats; at++) playDrum(context, QUIZ_PULSE.sound, sound.start + at * sound.beat, at % beats === 0 ? QUIZ_PULSE.accent : QUIZ_PULSE.level, sound.out);
    sound.timers.push(setTimeout(() => {
        if (cpTap.sound !== sound) return;
        sound.phase = "tap";
        renderCpTools();
    }, (sound.start - CP_TAP_EARLY - context.currentTime) * 1000));
    sound.timers.push(setTimeout(() => finishCpTap(sound), (end - context.currentTime + 0.15) * 1000));
}

// A tap, timed on the audio clock from the first bar's start.
function tapCp(event) {
    const sound = cpTap.sound;
    if (!sound?.start || !metro.context) return;
    const time = rhTapTime(event) - sound.start;
    if (time >= -CP_TAP_EARLY) sound.taps.push(Math.max(0, time));
    $("cpBarTap").animate([{ transform: "scale(0.96)" }, { transform: "scale(1)" }], { duration: 140, easing: "ease-out" });
}

function stopCpTap() {
    const sound = cpTap.sound;
    cpTap.sound = null;
    if (!sound) return;
    sound.timers.forEach(clearTimeout);
    if (sound.out) {
        sound.out.gain.setTargetAtTime(0, metro.context.currentTime, 0.015);
        setTimeout(() => sound.out.disconnect(), 120);
    }
    restConsAudio();
    if (cpIsShown()) renderCpTools();
}

// The taps written as the bars' rhythm, in one change Undo takes back.
function finishCpTap(sound) {
    if (cpTap.sound !== sound) return;
    stopCpTap();
    if (!cpIsShown()) return;
    const rhythms = MaestroCounterpoint.rhythmFromTaps(sound.taps.map(time => time / (sound.beat / 2)), sound.bars);
    if (!rhythms) {
        showToast("No taps heard; the bars are as they were.");
        return;
    }
    let next = cp.exercise;
    rhythms.forEach((each, at) => { next = MaestroCounterpoint.setBarRhythm(next, sound.from + at, each.pattern, { rests: each.rests }); });
    if (changeCpRhythm(next, sound.from)) showToast(`Tapped ${cpBarNumbers(sound.from, sound.from + sound.bars - 1)}.`, { label: "Undo", run: undoCp });
    else showToast("Tapped as it was written.");
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
        const start = before ?? cpMiddleLine(voice.clef);
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
    const near = voice.notes[cp.at.index]?.p ?? voice.notes.slice(0, cp.at.index).reverse().find(note => note.p)?.p ?? cpMiddleLine(voice.clef);
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
    const labels = cpShowsNct();
    // Four parts (2.11.0): a note held through two chords drawn as one, each
    // chord's start kept as a column; the heads and rests then name the notes
    // they stand for (`indices`), `index` the first.
    const shown = MaestroCounterpoint.drawnFourPart(cp.exercise);
    const times = shown ? MaestroCounterpoint.chordSpans(cp.exercise.numerals.length).map(span => span.onset) : [];
    const drawn = MaestroNotation.engrave(shown?.score ?? cpShownScore(), { maxWidth: width, room: cpRoom(cp.exercise), justify: true, headroom: labels ? CP_NCT_ROOM.headroom : 0, between: labels ? CP_NCT_ROOM.between : 0, times });
    if (!shown) return drawn;
    const named = item => {
        const indices = shown.indices[item.voice][item.index];
        return { ...item, index: indices[0], indices };
    };
    return { ...drawn, heads: drawn.heads.map(named), rests: drawn.rests?.map(named) };
}
const cpStandsFor = head => head.indices ?? [head.index];

function drawCpStaff() {
    const holder = $("cpStaff");
    const exercise = cp.exercise;
    cp.drawnWidth = holder.clientWidth;
    const drawn = cpEngrave(cp.scale);
    cp.drawn = drawn;
    const svg = svgNode("svg", { class: "cp-score", viewBox: `0 0 ${drawn.width} ${drawn.height}`, width: Math.round(drawn.width * cp.scale), height: Math.round(drawn.height * cp.scale), role: "img", "aria-label": cpStaffLabel() });
    const voices = cpVoices();
    const timed = voices.map(voice => MaestroNotation.timed(voice.notes));
    const problems = cpProblems(exercise);
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
        const levels = cpStandsFor(head).map(index => marked.get(`${head.voice}:${index}`));
        const classes = ["cp-ring"];
        if (levels.includes("error")) classes.push("is-error");
        else if (levels.includes("warning")) classes.push("is-warning");
        if (head.voice === cp.at.voice && cpStandsFor(head).includes(cp.at.index)) classes.push("is-selected");
        if (head.voice === exercise.given) classes.push("is-given");
        svg.append(svgNode("ellipse", { class: classes.join(" "), cx: head.x + 0.75 * drawn.space, cy: head.y, rx: 1.35 * drawn.space, ry: 1.05 * drawn.space, "data-ring": `${head.voice}:${head.index}`, "data-through": cpStandsFor(head).at(-1) }));
    });
    // A note still to write has no head: its rest is ringed when selected, so
    // the voice chosen shows where two share a staff (2.6.0).
    const rest = drawn.rests?.find(each => each.voice === cp.at.voice && each.index === cp.at.index);
    if (rest) svg.append(svgNode("ellipse", { class: "cp-ring is-selected is-rest", cx: rest.x + 0.6 * drawn.space, cy: rest.y, rx: 1.25 * drawn.space, ry: 1.7 * drawn.space, "data-ring": `${rest.voice}:${rest.index}` }));
    drawScoreItems(svg, drawn);
    drawCpBeneath(svg, drawn, timed);
    drawCpNctLabels(svg, drawn);
    drawCpBarStrips(svg, drawn);
    drawCpClefSpots(svg, drawn);
    holder.replaceChildren(svg);
    placeCpClefMenu();
    if (cpGhost.at && !cpGhost.frame) cpGhost.frame = requestAnimationFrame(drawCpGhost);
}

// Under each system: the intervals, the numerals asked for, a figured bass's
// figures, or the analysis of what's written.
function drawCpBeneath(svg, drawn, timed) {
    const exercise = cp.exercise;
    const space = drawn.space;
    const xAt = onset => drawn.columns.find(each => each.time === onset);
    const below = cpShowsNct() ? CP_NCT_ROOM.room : 0;
    const lineY = (system, row) => drawn.systems[system].bottom + below + space * (1.6 + row * 1.9);
    // What each row under the staff is, named once at the first line's start.
    const name = (y, text) => {
        const node = svgNode("text", { class: "cp-beneath cp-row-label", x: drawn.systems[0].left, y });
        node.textContent = text;
        svg.append(node);
    };
    const nameRow = (row, text) => name(lineY(0, row) + space, text);
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
        nameRow(0, exercise.kind === "species" ? "Intervals" : "Degrees");
        if (exercise.kind === "melody" && cpMelody.chords !== "off") nameRow(1, "Chords");
        MaestroCounterpoint.analysisLine(exercise).forEach(each => write(each.onset, each.text, 0, "cp-beneath"));
        // A melody's chords (2.6.0), each under the note sounding where it begins.
        if (exercise.kind === "melody" && cpMelody.chords !== "off") {
            cpMelodyChords().filter(chord => !chord.silent).forEach(chord => {
                const column = drawn.columns.filter(each => each.time <= chord.at).at(-1);
                if (!column) return;
                const node = svgNode("text", { class: "cp-beneath cp-chord", x: column.x + 0.8 * space, y: lineY(column.system, 1) + space });
                node.textContent = chord.name;
                svg.append(node);
            });
        }
        return;
    }
    // Each chord's start (2.11.0: not the soprano's notes, which may be shorter).
    const onsets = MaestroCounterpoint.chordSpans(exercise.numerals.length).map(span => span.onset);
    if (exercise.form === "numerals") {
        nameRow(0, "Numerals");
        exercise.numerals.forEach((text, k) => writeNumeral(onsets[k], MaestroCounterpoint.numeralParts(text), 0, "cp-beneath"));
        return;
    }
    let row = 0;
    if (exercise.form === "figured") {
        MaestroCounterpoint.figuredBass(exercise).forEach((figures, k) => figures.forEach((figure, at) => {
            const column = xAt(onsets[k]);
            if (!column) return;
            const node = svgNode("text", { class: "cp-beneath cp-figure", x: column.x + 0.8 * space, y: drawn.systems[column.system].bottom + below + space * (1.2 + at * 1.6) + space });
            node.textContent = figure;
            svg.append(node);
        }));
        name(drawn.systems[0].bottom + below + space * 2.2, "Figures");
        row = 2;
    }
    nameRow(row, "Analysis");
    MaestroCounterpoint.analysisLine(exercise).forEach(each => writeNumeral(each.onset, each.parts, row, "cp-beneath cp-analysis"));
}

// Each non-chord tone's label by its note, in its voice's band.
function drawCpNctLabels(svg, drawn) {
    if (!cpShowsNct()) return;
    const space = drawn.space;
    const heads = new Map(drawn.heads.flatMap(head => cpStandsFor(head).map(index => [`${head.voice}:${index}`, head])));
    MaestroCounterpoint.nonChordTones(cp.exercise).forEach(tone => {
        const head = heads.get(`${tone.voice}:${tone.index}`);
        const system = head && drawn.systems[head.system];
        if (!system?.inner) return;
        const y = [system.top + 0.62 * CP_NCT_ROOM.headroom, system.inner.from + 1.25 * space, system.inner.to - 0.45 * space, system.bottom + 1.45 * space][tone.voice];
        const node = svgNode("text", { class: "cp-nct-label", x: head.x + 0.75 * space, y, "text-anchor": "middle" });
        node.textContent = tone.label;
        const title = svgNode("title", {});
        title.textContent = `${CP_NCT_WORDS[tone.kind]}${tone.accented && (tone.kind === "passing" || tone.kind === "neighbor") ? ", accented" : ""}`;
        node.append(title);
        svg.append(node);
    });
}
const CP_NCT_WORDS = Object.freeze({
    passing: "Passing tone", neighbor: "Neighboring tone", suspension: "Suspension", retardation: "Retardation", appoggiatura: "Appoggiatura",
    escape: "Escape tone", neighborGroup: "Neighbor group", anticipation: "Anticipation", pedal: "Pedal point"
});

// The pitch on a staff's middle line, where a note with none before it starts.
const cpMiddleLine = clef => MaestroNotation.pitch(MaestroNotation.STAFF_BOTTOM[clef] + 4, 0);

function cpStaffLabel() {
    const voices = cpVoices();
    return voices.map(voice => `${voice.name}: ${voice.notes.map(note => (note.p ? MaestroNotation.pitchName(note.p) : "rest")).join(", ")}`).join(". ");
}

// Where a pointer is on the staff: the moment nearest it, on the staff
// nearest it, the step there, and the voices that can be written there.
// Null off the drawing or where nothing can be written.
function cpStaffHit(event) {
    if (cpReadOnly()) return null;
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
    const step = staffStepAt(cp.drawn, systemIndex, staff, voices[candidates[0]].clef, y);
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
    const clef = event.target.closest?.(".cp-clef-spot");
    if (clef) {
        openCpClefMenu(Number(clef.dataset.staff));
        return;
    }
    const strip = event.target.closest?.(".cp-bar-strip");
    if (strip) {
        selectCpBar(Number(strip.dataset.bar), event.shiftKey);
        $("cpStaff").focus({ preventScroll: true });
        return;
    }
    cp.bars = null;
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
    if (event.button !== 2 || event.target.closest?.(".cp-bar-strip, .cp-clef-spot")) return;
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
    // Over a bar's strip or a clef, no note would be written.
    cpGhost.at = event.target.closest?.(".cp-bar-strip, .cp-clef-spot") ? null : { clientX: event.clientX, clientY: event.clientY };
    if (!cpGhost.frame) cpGhost.frame = requestAnimationFrame(drawCpGhost);
}

// ---- Clefs (2.7.0): a click on a staff's clef chooses another, treble,
// alto, tenor or bass, as the part is easiest read. The notes stay where
// they sound, and Ctrl+Z takes the change back. Not while a transposing
// part is shown as written: that clef is the instrument's.

const CP_CLEF_WORDS = Object.freeze({ treble: "Treble", alto: "Alto", tenor: "Tenor", bass: "Bass" });
const cpClef = { staff: -1 };

// Over each line's clefs, a spot to click.
function drawCpClefSpots(svg, drawn) {
    if (cpReadOnly()) return;
    const space = drawn.space;
    const staves = cp.exercise.score.staves.length;
    drawn.systems.forEach(system => system.staffY.forEach((staffY, staff) => {
        const spot = svgNode("rect", { class: "cp-clef-spot", x: system.left + 0.5 * space, y: staffY - 6 * space, width: 3.5 * space, height: 8 * space, rx: 0.6 * space, "data-staff": String(staff) });
        const title = svgNode("title", {});
        title.textContent = `${CP_CLEF_WORDS[cp.exercise.score.staves[staff].clef] ?? "The"} clef${staves > 1 ? ` of the ${staff === 0 ? "upper" : "lower"} staff` : ""}: click to choose another`;
        spot.append(title);
        svg.append(spot);
    }));
}

function openCpClefMenu(staff) {
    const menu = $("cpClefMenu");
    if (!menu.hidden && cpClef.staff === staff) return closeCpClefMenu(true);
    closeConsPopovers();
    globalThis.closeProgPopovers?.();
    cpClef.staff = staff;
    const staves = cp.exercise.score.staves.length;
    $("cpClefTitle").textContent = staves > 1 ? `Clef of the ${staff === 0 ? "upper" : "lower"} staff` : "Clef";
    renderCpClefMenu();
    menu.hidden = false;
    placeCpClefMenu();
    requestAnimationFrame(() => menu.querySelector('[aria-pressed="true"]')?.focus());
}

// Beside the staff's first clef in view, inside the window; it follows the
// staff when the window changes size.
function placeCpClefMenu() {
    const menu = $("cpClefMenu");
    if (menu.hidden) return;
    const spot = $("cpStaff").querySelector(`.cp-clef-spot[data-staff="${cpClef.staff}"]`);
    if (!spot) return closeCpClefMenu();
    const box = spot.getBoundingClientRect();
    const left = Math.max(16, Math.min(box.right + 8, innerWidth - menu.offsetWidth - 16));
    const top = Math.max(16, Math.min(box.top, innerHeight - menu.offsetHeight - 16));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
}

function renderCpClefMenu() {
    const clef = cp.exercise.score.staves[cpClef.staff]?.clef;
    document.querySelectorAll("#cpClefs [data-staff-clef]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.staffClef === clef)));
}

function closeCpClefMenu(focus = false) {
    if ($("cpClefMenu").hidden) return;
    $("cpClefMenu").hidden = true;
    cpClef.staff = -1;
    if (focus) $("cpStaff").focus({ preventScroll: true });
}

function chooseCpClef(clef) {
    const next = MaestroCounterpoint.withClef(cp.exercise, cpClef.staff, clef);
    closeCpClefMenu(true);
    changeCp(next);
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
    drawStaffGhost(svg, cp.drawn, { x: column.x, staffY: cp.drawn.systems[column.system].staffY[hit.staff], clef: cpVoices()[voice].clef, step: hit.step, d: entry.note.d });
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
    staff.classList.toggle("is-whole", all);
    $("cpLines").hidden = all;
    $("cpLines").textContent = all ? "" : cp.lines.top === last ? `Line ${last + 1} of ${count}` : `Lines ${cp.lines.top + 1}\u2013${last + 1} of ${count}`;
}

// ---- Drawing the tab

function renderCounterpoint() {
    if (!cp.exercise) loadCounterpoint();
    const exercise = cp.exercise;
    if (cp.bars && !MaestroCounterpoint.rhythmBars(exercise)) cp.bars = null;
    $("cpTitleText").textContent = exercise.title || "Untitled";
    $("cpFacts").textContent = cpFacts(exercise);
    $("cpFacts").title = $("cpFacts").textContent;
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
    if (exercise.kind === "melody") {
        const bars = MaestroNotation.bars(MaestroNotation.voicesOf(exercise.score)[0].notes, exercise.score.meter).bars.length;
        const instrument = MaestroMelody.instrumentOf(exercise.instrument);
        return `Melody \u00B7 ${cpKeyName(key)}${instrument.id === "concert" ? "" : ` \u00B7 ${instrument.label}`} \u00B7 ${bars === 1 ? "1 bar" : `${bars} bars`}`;
    }
    if (exercise.kind === "species") return `${CP_SPECIES_WORDS[exercise.species]} \u00B7 ${cpKeyName(key)} \u00B7 the cantus ${exercise.cantusBelow ? "below" : "above"}`;
    return `Four parts \u00B7 ${CP_FORM_WORDS[exercise.form]} \u00B7 ${cpKeyName(key)}`;
}

function renderCpVoices() {
    const voices = cpVoices();
    $("cpVoices").replaceChildren(...voices.map((voice, index) => {
        const button = element("button", "cp-voice");
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
    $("cpModel").hidden = exercise.kind === "cantus" || exercise.kind === "melody";
    $("cpEmbellish").hidden = exercise.kind !== "fourpart";
    renderCpMelodyTools();
    renderCpLengths();
    // With bars selected, the note's own tools step aside for theirs.
    $("cpAccidentalField").hidden = Boolean(cp.bars);
    $("cpClearNote").hidden = Boolean(cp.bars);
    // The fifth species (and since 2.6.0 a melody): the rhythm of the bars
    // selected by the strip above them; with none, the note's Length shows.
    const span = cpReadOnly() || !cp.bars ? null : cpRhythmSpan();
    $("cpRhythmField").hidden = !span;
    if (span) {
        $("cpRhythmLabel").textContent = span.from === span.to ? `Bar ${span.from + 1}` : `Bars ${span.from + 1}\u2013${span.to + 1}`;
        const current = span.from === span.to ? MaestroCounterpoint.barRhythm(exercise, span.from)?.join(" ") : null;
        $("cpBarPaste").disabled = !cp.copied;
        $("cpBarClear").disabled = MaestroCounterpoint.clearBars(exercise, span.from, span.to) === exercise;
        $("cpBarClear").textContent = span.from === span.to ? "Clear bar" : "Clear bars";
        const tapping = cpTap.sound;
        $("cpBarTap").textContent = !tapping ? "Tap" : tapping.phase === "tap" ? "Tap with Space" : "Count in\u2026";
        $("cpBarTap").setAttribute("aria-pressed", String(Boolean(tapping)));
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
    // The staff's keys and mouse, listed here alone (2.6.0: the list under the staff is gone).
    $("cpStaff").title = [
        "Click to write a note; right-click to clear it; the wheel moves the selected note a step (with Shift, a half step)",
        "Up and Down: a step (with Shift, a half step)",
        exercise.kind === "fourpart" ? "Left and Right: the next chord" : "Left and Right: the next note",
        "A to G: write that letter",
        ...(exercise.kind === "fourpart" ? ["Shift with S, A, T or B: the voice to write"] : []),
        ...(MaestroCounterpoint.rhythmEditable(exercise) ? ["1, 2, 4, 8: a whole, half, quarter or eighth; . dots it", "Click above a bar to select it (with Shift, bars); Ctrl+C and Ctrl+V copy and paste their rhythm; Esc goes back to the note"] : []),
        "Delete: clear the note",
        exercise.kind === "fourpart" ? "Enter: hear the chord" : "Enter: hear the moment",
        "Ctrl+Z undoes, Ctrl+Y redoes"
    ].join("\n");
}

// What the checker reports, with the rules switched off left out (2.8.0).
const cpProblems = (exercise = cp.exercise) => MaestroCounterpoint.withRules(MaestroCounterpoint.check(exercise), cp.rulesOff);

function renderCpProblems() {
    const problems = cpProblems();
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
        // The rule behind it (2.11.0): its name, which opens it in Rules.
        const rule = MaestroCounterpoint.ruleById(each.rule);
        if (rule) {
            item.classList.toggle("has-bar", Boolean(each.bar));
            const chip = element("button", "cp-problem-rule", rule.label);
            chip.type = "button";
            chip.dataset.rule = rule.id;
            chip.title = rule.locked ? `${rule.label}: a fundamental, always checked. Show it in Rules` : `${rule.label}: show it in Rules, where it can be switched off`;
            item.append(chip);
        }
        return item;
    }));
    renderCpRules();
}

// Rules opened at one rule (2.11.0), from a problem's chip: scrolled to it and marked a moment.
// After the frame in which an opening popover draws its list, so the row found is the one shown.
function showCpRule(id) {
    toggleConsPopover("cpRules", true);
    requestAnimationFrame(() => {
        const row = $("cpRuleList").querySelector(`[data-rule-row="${CSS.escape(id)}"]`);
        if (!row) return;
        row.scrollIntoView({ block: "nearest" });
        row.classList.remove("is-found");
        void row.offsetWidth;
        row.classList.add("is-found");
        row.querySelector("input")?.focus({ preventScroll: true });
    });
}

// ---- The checker's rules (2.8.0; each rule its own switch since 2.11.0),
// those that judge the exercise open, by section and group: a group of
// several has a switch for all of them. A locked rule is a fundamental and
// can't be switched off. Strict (every rule) and Essentials; the style the
// exercise is checked in; the chip names the style and how many are off.

const CP_DOT = String.fromCodePoint(0xB7);

function cpRuleField(rule, off) {
    const field = element("label", "metro-check cp-rule");
    field.dataset.ruleRow = rule.id;
    const box = element("input");
    box.type = "checkbox";
    box.checked = rule.locked || !off.includes(rule.id);
    box.disabled = rule.locked;
    box.dataset.rule = rule.id;
    field.append(box, element("span", "", rule.label));
    if (rule.locked) {
        field.classList.add("is-locked");
        field.title = "A fundamental: always checked";
        field.append(MaestroIcons.create("lock"));
    }
    return field;
}

function renderCpRules() {
    const exercise = cp.exercise;
    const off = cp.rulesOff;
    const shown = MaestroCounterpoint.rulesFor(exercise);
    const quiet = shown.filter(rule => !rule.locked && off.includes(rule.id)).length;
    const styles = MaestroCounterpoint.stylesOf(exercise.kind);
    const style = styles?.find(each => each.id === MaestroCounterpoint.styleOf(exercise)) ?? null;
    $("cpRulesName").textContent = [style?.label ?? (quiet ? "" : "All"), quiet ? `${quiet} off` : ""].filter(Boolean).join(` ${CP_DOT} `);
    $("cpRulesButton").title = [style ? `Checked as in ${style.label}` : "", quiet ? `${quiet} of the rules for this exercise ${quiet === 1 ? "is" : "are"} off` : "Every rule for this exercise is on"].filter(Boolean).join("; ");
    const preset = Object.entries(MaestroCounterpoint.RULE_PRESETS).find(([, list]) => list.join() === off.join())?.[0] ?? "";
    document.querySelectorAll("#cpRulePresets [data-rules]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.rules === preset)));
    // The styles of this kind of exercise, if it has them.
    $("cpRuleStyleRow").hidden = !styles;
    $("cpRuleStyles").replaceChildren(...(styles ?? []).map(each => {
        const button = element("button", "", each.label);
        button.type = "button";
        button.dataset.style = each.id;
        button.setAttribute("aria-pressed", String(each === style));
        return button;
    }));
    // What the chosen style checks, under its buttons rather than in a tooltip.
    $("cpRuleStyleNote").textContent = style?.note ?? "";
    const sections = Object.entries(MaestroCounterpoint.RULE_SECTIONS).map(([section, label]) => {
        const groups = MaestroCounterpoint.RULE_GROUPS.filter(group => group.section === section)
            .map(group => ({ group, rules: shown.filter(rule => rule.group === group.id) }))
            .filter(each => each.rules.length);
        if (!groups.length) return null;
        const fieldset = element("fieldset", "cp-rule-section");
        fieldset.append(element("legend", "cons-choice-label", label));
        for (const { group, rules } of groups) {
            if (rules.length === 1) {
                fieldset.append(cpRuleField(rules[0], off));
                continue;
            }
            // A group of several: its own switch for all those that may be switched.
            // Its box shows all of them, a locked rule always on: some on, a dash.
            const free = rules.filter(rule => !rule.locked);
            const on = rules.filter(rule => rule.locked || !off.includes(rule.id)).length;
            const head = element("label", "metro-check cp-rule cp-rule-group");
            const box = element("input");
            box.type = "checkbox";
            box.dataset.group = group.id;
            box.checked = on === rules.length;
            box.indeterminate = on > 0 && on < rules.length;
            box.disabled = !free.length;
            head.append(box, element("span", "", group.label));
            if (!free.length) {
                head.classList.add("is-locked");
                head.title = "Fundamentals: always checked";
                head.append(MaestroIcons.create("lock"));
            }
            const children = element("div", "cp-rule-children");
            children.append(...rules.map(rule => cpRuleField(rule, off)));
            const wrap = element("div", "cp-rule-groupbox");
            wrap.append(head, children);
            fieldset.append(wrap);
        }
        return fieldset;
    }).filter(Boolean);
    // In three columns: between the voices, each line, and the rest together.
    const columns = [[sections[0]], [sections[1]], sections.slice(2)].filter(list => list.some(Boolean)).map(list => {
        const column = element("div", "cp-rule-column");
        column.append(...list.filter(Boolean));
        return column;
    });
    $("cpRuleList").replaceChildren(...columns);
    $("cpNctField").hidden = exercise.kind !== "fourpart";
    $("cpNctLabels").checked = cp.nctLabels;
}

// A style chosen for the exercise open: a change Ctrl+Z takes back, and the
// style new exercises of its kind take.
function chooseCpStyle(style) {
    const next = MaestroCounterpoint.withStyle(cp.exercise, style);
    if (MaestroCounterpoint.styleOf(next) !== style) return;
    cp.styles[next.kind] = style;
    if (!changeCp(next)) saveCounterpoint();
    renderCpRules();
}

// The rules open over the page, not inside the Checker, which is too short
// for them: under the chip, ending at its right edge, kept on screen.
function placeCpRules() {
    placeCpOverPage($("cpRulesPanel"), $("cpRulesButton"), "end");
}

// New Exercise likewise (2.11.0): under the title, from its left edge; it
// was cut off by its module when the module was short (1600 wide, the neck shown).
function placeCpNew() {
    placeCpOverPage($("cpNewPanel"), $("cpTitleButton"), "start");
}

function placeCpOverPage(panel, anchor, align) {
    if (panel.hidden) return;
    const chip = anchor.getBoundingClientRect();
    const from = align === "end" ? chip.right - panel.offsetWidth : chip.left;
    const left = Math.max(16, Math.min(from, innerWidth - panel.offsetWidth - 16));
    const below = chip.bottom + 10;
    const top = below + panel.offsetHeight <= innerHeight - 16 ? below : Math.max(16, innerHeight - 16 - panel.offsetHeight);
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
}

function setCpRulesOff(list) {
    cp.rulesOff = MaestroCounterpoint.cleanRulesOff(list);
    saveCounterpoint();
    renderCpProblems();
    drawCpStaff();
}

function renderCpMenu() {
    const items = cp.saved;
    $("cpSaveCopy").disabled = items === null;
    $("cpCopyLink").disabled = !cp.id;
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
        const remove = element("button", "prog-song-delete");
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

const cpNew = { kind: "species", species: 1, cantus: "fux-dorian", below: true, form: "figured", key: "0", mode: "dorian", final: "D", clef: "treble", length: MaestroCounterpoint.CANTUS_LENGTH.usual, instrument: "concert", bars: MaestroCounterpoint.MELODY_BARS.usual, embellished: false };
const CP_MELODY_BARS = Object.freeze([2, 4, 8, 12, 16]);
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
    document.querySelectorAll("#cpNewTones [data-tones]").forEach(button => button.setAttribute("aria-pressed", String((button.dataset.tones === "given") === cpNew.embellished)));
    $("cpNewTonesField").hidden = cpNew.form === "numerals";
    document.querySelectorAll("#cpNewClef [data-clef]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.clef === cpNew.clef)));
    $("cpNewSpeciesFields").hidden = cpNew.kind !== "species";
    $("cpNewFourFields").hidden = cpNew.kind !== "fourpart";
    // A cantus and a melody share the mode and its final (a melody's key) (2.6.0).
    const melody = cpNew.kind === "melody";
    $("cpNewCantusFields").hidden = cpNew.kind !== "cantus" && !melody;
    $("cpNewFinalLabel").textContent = melody ? "Key" : "Final";
    $("cpNewClefField").hidden = $("cpNewLengthField").hidden = melody;
    $("cpNewInstrumentField").hidden = $("cpNewBarsField").hidden = !melody;
    $("cpNewInstrument").value = cpNew.instrument;
    $("cpNewBars").value = String(cpNew.bars);
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
    placeCpNew();
}

function startCpExercise() {
    let exercise;
    if (cpNew.kind === "melody") {
        exercise = MaestroCounterpoint.melodyExercise({ tonic: cpNew.final, mode: cpNew.mode, instrument: cpNew.instrument, bars: cpNew.bars, title: `A melody in ${cpNew.final} ${CP_MODE_WORDS[cpNew.mode].toLowerCase()}` });
    } else if (cpNew.kind === "cantus") {
        exercise = MaestroCounterpoint.cantusExercise({ mode: cpNew.mode, final: cpNew.final, clef: cpNew.clef, length: cpNew.length, title: `A cantus in ${cpNew.final} ${CP_MODE_WORDS[cpNew.mode].toLowerCase()}` });
    } else if (cpNew.kind === "species") {
        const chosen = cpChosenCantus();
        if (chosen) {
            exercise = MaestroCounterpoint.speciesExercise({ species: cpNew.species, cantus: chosen.pitches, cantusBelow: cpNew.below, mode: chosen.mode, final: chosen.final, title: `${CP_SPECIES_WORDS[cpNew.species]}, ${chosen.name}`.slice(0, MaestroNotation.TITLE_MAX), style: cp.styles.species });
        } else if (cpNew.cantus.startsWith("made-")) {
            // A cantus made to the rules (fixed in 2.6.0: this read a Fux cantus that wasn't there).
            const mode = cpNew.cantus === "made-minor" ? "minor" : "major";
            const tonics = MaestroCounterpoint.FOURPART_KEYS[mode];
            const tonic = tonics[Math.floor(Math.random() * tonics.length)];
            const key = { fifths: MaestroNotation.keyFifths(tonic, mode), mode };
            const cantus = MaestroCounterpoint.makeCantus(key, 8 + Math.floor(Math.random() * 5));
            exercise = MaestroCounterpoint.speciesExercise({ species: cpNew.species, cantus, cantusBelow: cpNew.below, mode, final: tonic, title: `${CP_SPECIES_WORDS[cpNew.species]}, a cantus in ${tonic} ${mode}`, style: cp.styles.species });
        }
    } else if (cpNew.kind === "fourpart") {
        const [tonic, mode] = cpNewKeys()[Number(cpNew.key)] ?? cpNewKeys()[0];
        exercise = MaestroCounterpoint.fourPartExercise({ form: cpNew.form, tonic, mode, embellished: cpNew.embellished, title: `${CP_FORM_WORDS[cpNew.form]} in ${tonic} ${mode}`, style: cp.styles.fourpart });
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
    globalThis.resolveMusicLink?.();
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
    // In beats: the score counts eighths, the tempo quarters.
    const events = cpVoices().flatMap((voice, index) => (cp.hear[index] ? MaestroNotation.soundingEvents(voice.notes).map(event => ({ midi: event.midi, at: event.start / 2, length: event.length / 2, voice: index })) : []))
        .sort((a, b) => a.at - b.at);
    if (!events.length) return;
    const playing = { run: null };
    cp.playing = playing;
    renderCpVoices();
    // At the metronome's tempo as it is now (2.6.0), so a change takes hold as it plays.
    const run = await playConsSequence(events, {
        stops: cpOrganStops(),
        onBeat: beat => {
            if (!cpIsShown()) stopCpPlaying();
            else lightCpPlaying(beat * 2);
        },
        onEnd: () => { if (cp.playing === playing) stopCpPlaying(); }
    });
    if (cp.playing === playing) playing.run = run;
    else run?.stop();
}

function stopCpPlaying() {
    const playing = cp.playing;
    if (!playing) return;
    cp.playing = null;
    playing.run?.stop();
    lightCpPlaying(-1);
    if ($("cpPlay")) renderCpVoices();
}

// The notes sounding now, lit on the staff.
function lightCpPlaying(time) {
    const voices = cpVoices();
    $("cpStaff").querySelectorAll(".cp-ring").forEach(ring => {
        const [voice, index] = ring.dataset.ring.split(":").map(Number);
        const timed = MaestroNotation.timed(voices[voice].notes);
        const entry = timed[index];
        // A note drawn for two (2.11.0) is lit through the last.
        const last = timed[Number(ring.dataset.through ?? index)] ?? entry;
        ring.classList.toggle("is-playing", time >= 0 && entry && entry.onset <= time && time < last.onset + last.length);
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
wireConsPopover("cpNew", $("cpMenuNew"), $("cpNewPanel"), { onOpen: () => {
    placeCpNew();
    return $("cpNewKind").querySelector('[aria-pressed="true"]');
} });
addEventListener("resize", placeCpNew);
wireConsPopover("cpShow", $("cpShowButton"), $("cpShowPanel"));
wireConsPopover("cpRules", $("cpRulesButton"), $("cpRulesPanel"), { onOpen: () => { renderCpRules(); placeCpRules(); } });
addEventListener("resize", placeCpRules);
$("cpRuleList").addEventListener("change", event => {
    const box = event.target.closest("[data-rule], [data-group]");
    if (!box) return;
    // A group's switch acts on its rules shown for this exercise.
    const ids = box.dataset.group
        ? MaestroCounterpoint.rulesFor(cp.exercise).filter(rule => rule.group === box.dataset.group && !rule.locked).map(rule => rule.id)
        : [box.dataset.rule];
    const others = cp.rulesOff.filter(id => !ids.includes(id));
    setCpRulesOff(box.checked ? others : [...others, ...ids]);
    renderCpRules();
});
$("cpRuleStyles").addEventListener("click", event => {
    const button = event.target.closest("[data-style]");
    if (button) chooseCpStyle(button.dataset.style);
});
$("cpProblems").addEventListener("click", event => {
    const chip = event.target.closest(".cp-problem-rule");
    if (chip) showCpRule(chip.dataset.rule);
});
document.querySelectorAll("#cpRulePresets [data-rules]").forEach(button => button.addEventListener("click", () => {
    setCpRulesOff(MaestroCounterpoint.RULE_PRESETS[button.dataset.rules]);
    renderCpRules();
}));
$("cpStaff").addEventListener("click", cpStaffClick);
$("cpClefs").addEventListener("click", event => {
    const button = event.target.closest("[data-staff-clef]");
    if (button && MaestroCounterpoint.STAFF_CLEFS.includes(button.dataset.staffClef)) chooseCpClef(button.dataset.staffClef);
});
$("cpClefMenu").addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    closeCpClefMenu(true);
});
document.addEventListener("pointerdown", event => {
    if (!$("cpClefMenu").hidden && !$("cpClefMenu").contains(event.target) && !event.target.closest?.(".cp-clef-spot")) closeCpClefMenu();
});
addEventListener("resize", () => requestAnimationFrame(placeCpClefMenu));
$("cpStaff").addEventListener("contextmenu", cpStaffErase);
$("cpStaff").addEventListener("pointermove", cpStaffHover);
$("cpStaff").addEventListener("pointerleave", cpStaffLeave);
$("cpStaff").addEventListener("wheel", cpStaffWheel, { passive: false });
// Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z) anywhere on the tab but in a field.
$("consCounterPanel").addEventListener("keydown", event => {
    if (!event.ctrlKey || event.altKey || event.metaKey || event.target.closest("input, select, textarea, [contenteditable]")) return;
    const key = event.key.toLowerCase();
    const done = key === "z" && !event.shiftKey ? undoCp() : (key === "y" || (key === "z" && event.shiftKey)) ? redoCp() : false;
    if (done) event.preventDefault();
});
$("cpStaff").addEventListener("keydown", event => {
    const voices = cpVoices();
    const rhythm = MaestroCounterpoint.rhythmEditable(cp.exercise) && !cpReadOnly();
    const plain = !event.ctrlKey && !event.altKey && !event.metaKey;
    const ctrl = event.ctrlKey && !event.altKey && !event.metaKey;
    if (rhythm && ctrl && event.key.toLowerCase() === "c") copyCpBars();
    else if (rhythm && ctrl && event.key.toLowerCase() === "v") pasteCpBars();
    else if (rhythm && plain && Object.hasOwn(CP_LENGTH_KEYS, event.key)) setCpLength(CP_LENGTH_KEYS[event.key]);
    else if (rhythm && plain && event.key === ".") toggleCpDot();
    else if (event.key === "Escape" && cp.bars) {
        cp.bars = null;
        renderCounterpoint();
    } else if (cp.bars && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        const moving = cp.bars.anchor === cp.bars.from ? cp.bars.to : cp.bars.from;
        const last = MaestroCounterpoint.rhythmBars(cp.exercise) - 1;
        selectCpBar(Math.max(0, Math.min(last, moving + (event.key === "ArrowLeft" ? -1 : 1))), event.shiftKey);
    } else if (cp.bars && (event.key === "Delete" || event.key === "Backspace")) clearCpBars();
    else if (event.key === "ArrowLeft" || event.key === "ArrowRight") moveCpSelection(event.key === "ArrowLeft" ? -1 : 1);
    else if (event.key === "ArrowUp" || event.key === "ArrowDown") stepCpNote(event.key === "ArrowUp" ? 1 : -1, event.shiftKey);
    else if (event.key === "Delete" || event.key === "Backspace") setCpNote(null);
    else if (event.key === "PageDown" || event.key === "PageUp") {
        if (cpCanTurnLine(event.key === "PageDown")) showCpLine(cp.lines.top + (event.key === "PageDown" ? 1 : -1));
    }
    else if (cp.exercise.kind === "fourpart" && event.shiftKey && plain && /^[satb]$/i.test(event.key)) {
        // Shift and a voice's letter (2.6.0; 1 to 4 before): the given voice can't be chosen.
        const voice = voices.findIndex(each => each.name[0].toUpperCase() === event.key.toUpperCase());
        if (voice >= 0 && voice !== cp.exercise.given) {
            cp.at = { voice, index: cpIndexAt(voice) };
            renderCounterpoint();
            renderConsNeck();
        }
    } else if (/^[a-gA-G]$/.test(event.key) && plain) letterCpNote(event.key.toUpperCase());
    else if (event.key === "Enter") {
        const at = MaestroNotation.timed(voices[cp.at.voice].notes)[cp.at.index];
        const sounding = voices.flatMap((voice, index) => {
            const entry = MaestroNotation.timed(voice.notes).find(each => each.onset <= at.onset && at.onset < each.onset + each.length);
            return entry?.note.p ? [{ midi: MaestroNotation.midiOf(entry.note.p), voice: index }] : [];
        });
        if (sounding.length) organConsNotes(sounding.map(each => each.midi), sounding.map(each => cpOrganStops()[each.voice]));
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
    cp.at = { voice, index: cpIndexAt(voice) };
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
$("cpClearAll").addEventListener("click", () => {
    toggleConsPopover("cpMenu", false);
    clearCpExercise();
});
$("cpModel").addEventListener("click", modelCpExercise);
$("cpEmbellish").addEventListener("click", embellishCpExercise);
$("cpNewTones").addEventListener("click", event => {
    const button = event.target.closest("[data-tones]");
    if (!button) return;
    cpNew.embellished = button.dataset.tones === "given";
    renderCpNewPanel();
});
$("cpNctLabels").addEventListener("change", event => {
    cp.nctLabels = event.target.checked;
    saveCounterpoint();
    drawCpStaff();
});
$("cpRhythms").addEventListener("click", event => {
    const button = event.target.closest("[data-rhythm]");
    const span = cpRhythmSpan();
    if (!button || !span) return;
    changeCpRhythm(MaestroCounterpoint.pasteRhythms(cp.exercise, span.from, span.to, [MaestroCounterpoint.FIFTH_BARS[Number(button.dataset.rhythm)]]), span.from);
});
$("cpLengths").addEventListener("click", event => {
    const button = event.target.closest("[data-length], [data-dot], [data-tie]");
    if (!button || button.disabled) return;
    if (button.dataset.length) setCpLength(button.dataset.length);
    else if (button.dataset.dot) toggleCpDot();
    else toggleCpTie();
});
$("cpBarCopy").addEventListener("click", copyCpBars);
$("cpBarPaste").addEventListener("click", pasteCpBars);
$("cpBarClear").addEventListener("click", clearCpBars);
$("cpBarTap").addEventListener("pointerdown", event => {
    // While the bars play, the button is a pad to tap on.
    if (cpTap.sound?.phase === "tap" && event.button === 0) {
        tapCp(event);
        event.preventDefault();
    }
});
$("cpBarTap").addEventListener("click", () => {
    if (cpTap.sound?.phase === "tap") return;
    if (cpTap.sound) stopCpTap();
    else tapCpBars();
});
// While the bars are tapped: Space taps and Esc stops, wherever the focus is.
document.addEventListener("keydown", event => {
    if (!cpTap.sound) return;
    if (event.key === "Escape") stopCpTap();
    else if (event.code === "Space" && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey) tapCp(event);
    else return;
    event.preventDefault();
    event.stopPropagation();
}, true);
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
$("cpCopyLink").addEventListener("click", () => {
    if (!cp.id) return;
    toggleConsPopover("cpMenu", false);
    copyMusicLink(cp.exercise.title, { kind: "exercise", id: cp.id });
});
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
$("cpNewInstrument").addEventListener("change", () => {
    if (MaestroMelody.INSTRUMENTS.some(each => each.id === $("cpNewInstrument").value)) cpNew.instrument = $("cpNewInstrument").value;
});
$("cpNewBars").addEventListener("change", () => {
    const bars = Number($("cpNewBars").value);
    if (CP_MELODY_BARS.includes(bars)) cpNew.bars = bars;
});
$("cpNewLength").addEventListener("change", () => {
    const length = Number($("cpNewLength").value);
    if (Number.isInteger(length)) cpNew.length = length;
});

$("cpNewMode").replaceChildren(...MaestroCounterpoint.CANTUS_MODES.map(mode => Object.assign(element("option", "", CP_MODE_WORDS[mode]), { value: mode })));
$("cpNewInstrument").replaceChildren(...MaestroMelody.INSTRUMENTS.map(each => Object.assign(element("option", "", each.label), { value: each.id })));
$("cpNewBars").replaceChildren(...CP_MELODY_BARS.map(bars => Object.assign(element("option", "", String(bars)), { value: String(bars) })));
$("cpMotifHow").replaceChildren(...MaestroMelody.DEVELOPMENTS.map(each => Object.assign(element("option", "", each.label), { value: each.id, title: each.title })));
$("cpMotifSize").addEventListener("change", () => {
    const size = Number($("cpMotifSize").value);
    if ([1, 2, 4].includes(size)) cpMelody.size = size;
});
$("cpMotifHow").addEventListener("change", () => {
    if (MaestroMelody.DEVELOPMENTS.some(each => each.id === $("cpMotifHow").value)) cpMelody.how = $("cpMotifHow").value;
});
$("cpMotifWrite").addEventListener("click", developCpMotif);
$("cpChords").addEventListener("click", event => {
    const button = event.target.closest("[data-chords]");
    if (!button || !["off", "1", "2"].includes(button.dataset.chords)) return;
    cpMelody.chords = button.dataset.chords;
    renderCounterpoint();
});
$("cpChordsOpen").addEventListener("click", openCpChordsInProgressions);
$("cpView").addEventListener("click", event => {
    const button = event.target.closest("[data-shown]");
    if (!button || !["concert", "written"].includes(button.dataset.shown)) return;
    cpMelody.view = button.dataset.shown;
    renderCounterpoint();
});
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
