"use strict";

// The Conservatory's Finder and Quiz (2.3.0). Each takes over the neck while
// its section shows: Finder marks the notes you pick and lists the chords and
// scales that hold them; Quiz asks you to name a note, or an interval by ear,
// and since 2.6.0 to write a melody's notes or a rhythm heard, or tap one read.
// The music is in music.js; nothing here is kept but the quiz's choices.

// ---- Finder

// The notes picked, as places: { string, fret, midi }. On a neck, one per
// string, as a chord is fingered; on a keyboard, any keys (string -1).
const finder = { picked: [] };
const FINDER_SCALES_SHOWN = 24;

const finderName = midi => MaestroMusic.PLAIN_NAMES[((midi % 12) + 12) % 12];
// Low to high; the lowest is the bass.
const finderNotes = () => [...finder.picked].sort((a, b) => a.midi - b.midi);
// Their pitch classes, each once, the bass first.
const finderPitches = () => [...new Set(finderNotes().map(note => ((note.midi % 12) + 12) % 12))];

consNeckModes.finder = {
    mark(midi, string, fret) {
        const picked = finder.picked.some(note => note.string === string && note.fret === fret);
        if (!picked) return { kind: "spot", label: "" };
        return { kind: midi === finderNotes()[0].midi ? "root" : "note", label: finderName(midi) };
    },
    key(midi) {
        if (!finder.picked.some(note => note.midi === midi)) return null;
        return { kind: midi === finderNotes()[0].midi ? "root" : "note", label: finderName(midi) };
    },
    nameOf: finderName,
    click(midi, place = {}) {
        const string = Number.isInteger(place.string) ? place.string : -1;
        const fret = Number.isInteger(place.fret) ? place.fret : midi;
        const same = finder.picked.findIndex(note => note.string === string && note.fret === fret && note.midi === midi);
        if (same >= 0) {
            finder.picked.splice(same, 1);          // again: the string (or key) is cleared
        } else {
            // A neck's string holds one fret at a time.
            if (string >= 0) finder.picked = finder.picked.filter(note => note.string !== string);
            finder.picked.push({ string, fret, midi });
            pluckConsNote(midi);
        }
        renderFinder();
        renderConsNeck();
    },
    render: () => renderFinder()
};

// The shape picked, strummed from its lowest note.
function strumFinder() {
    const midis = finderNotes().map(note => note.midi);
    if (midis.length) pluckConsNotes(midis, consChordSpread());
}

// A chord found is sounded upward from its root, near C3.
function playFoundChord(tones) {
    const pcs = tones.map(name => MaestroMusic.pitchClass(name));
    const base = 48 + pcs[0];
    pluckConsNotes(pcs.map(pc => base + (pc - pcs[0] + 12) % 12), 0.05);
}

function renderFinder() {
    const notes = finderNotes();
    const picked = finderPitches();
    $("consPicked").replaceChildren(...notes.map((note, at) => element("span", at === 0 ? "is-root" : "", finderName(note.midi))));
    if (!notes.length) $("consPicked").append(element("span", "is-none", "None yet"));
    $("consPickClear").disabled = $("consPickStrum").disabled = !notes.length;
    $("consPickStrum").textContent = consChordVerb();

    const chords = MaestroMusic.findChords(picked);
    $("consFoundChords").replaceChildren(...chords.map(chord => {
        const button = element("button", "cons-found-item");
        button.type = "button";
        button.dataset.tones = chord.tones.join(" ");
        button.title = `Hear ${chord.name}`;
        button.append(chordSymbol(chord.name, "list"), element("span", "", chord.tones.join(" ")));
        return button;
    }));
    $("consFoundChordsNote").textContent = picked.length < 2 ? "Pick two notes or more."
        : chords.length ? "Click one to hear it. A chord over another of its notes is written with its bass after a slash (C/E)."
        : "No chord here has exactly these notes.";

    const scales = MaestroMusic.findScales(picked);
    $("consFoundScales").replaceChildren(...scales.slice(0, FINDER_SCALES_SHOWN).map(found => {
        const button = element("button", "cons-found-item");
        button.type = "button";
        button.dataset.root = found.root;
        button.dataset.scale = found.scale;
        button.title = `Show ${found.root} ${found.label} in Scales`;
        button.append(element("strong", "", `${found.root} ${found.label}`));
        return button;
    }));
    $("consFoundScalesNote").textContent = picked.length < 2 ? "Pick two notes or more."
        : !scales.length ? "No scale here holds all of these notes."
        : scales.length > FINDER_SCALES_SHOWN ? `${scales.length} scales hold them; the ${FINDER_SCALES_SHOWN} most common are shown. Pick more notes to narrow them. Click one to show it in Scales.`
        : `${scales.length === 1 ? "1 scale holds" : `${scales.length} scales hold`} them. Click one to show it in Scales.`;
}

// ---- A staff to write on (2.6.0), shared by Counterpoint and the Quiz

// A score engraved by notation.js, drawn into an SVG.
function drawScoreItems(svg, drawn) {
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
}

// The step at a height on one of a drawn score's staves.
const staffStepAt = (drawn, system, staff, clef, y) => MaestroNotation.STAFF_BOTTOM[clef] + Math.round((drawn.systems[system].staffY[staff] - y) / (drawn.space / 2));

// A faint note where a click would write, with its ledger lines.
function drawStaffGhost(svg, drawn, { x, staffY, clef, step, d }) {
    const space = drawn.space;
    const position = step - MaestroNotation.STAFF_BOTTOM[clef];
    const width = MaestroNotation.HEAD_WIDTH[d] ?? MaestroNotation.HEAD_WIDTH.q;
    const ghost = svgNode("g", { class: "cp-ghost", "aria-hidden": "true" });
    const ledger = at => ghost.append(svgNode("line", { class: "staff-ledger", x1: x - 0.4 * space, x2: x + width + 0.4 * space, y1: staffY - at * space / 2, y2: staffY - at * space / 2 }));
    for (let at = -2; at >= position; at -= 2) ledger(at);
    for (let at = 10; at <= position; at += 2) ledger(at);
    const head = svgNode("text", { class: "staff-glyph", x, y: staffY - position * space / 2 + MaestroNotation.LIFT });
    const glyphs = MaestroNotation.GLYPHS;
    head.textContent = d === "w" ? glyphs.whole : d === "h" ? glyphs.half : glyphs.black;
    ghost.append(head);
    svg.append(ghost);
}

// ---- Quiz

const quiz = {
    // name the note: { string, fret, midi }; intervals: { low, high, semis };
    // chords (2.4.0): { id, root, name, midis }; progressions: music.js's quizProgression;
    // melodies (2.6.0): its quizMelody; rhythms and reading: rhythm.js's quizBar.
    // A progression also has its voicings as played (2.7.0).
    question: null,
    // the answer given, once given: a pitch class, semitones, a quality's id,
    // the degrees picked, a bar's cells, or reading's taps graded
    answered: null,
    picks: [],          // a progression's degrees picked so far
    notes: [],          // a melody as it's written (2.6.0): pitches, null for one still to write
    at: 1,              // the melody's note selected
    undo: [],           // the melody's notes before each change
    drawn: null,        // the melody's staff as engraved
    written: [],        // a progression as it's written on the staff (2.7.0): each chord's MIDI numbers, the first given
    chordAt: 1,         // its chord selected
    noteAt: null,       // and that chord's note selected, by MIDI number
    dict: null,         // its staff as engraved, and the hands' notes
    cells: [],          // a rhythm as it's written
    sound: null,        // what's sounding: { run } or { out, timers, start, end, step, tapping, count }
    right: 0,
    asked: 0,
    streak: 0
};

const quizKind = () => cons.settings.quizKind;
const QUIZ_TITLES = Object.freeze({ note: "Name the Note", interval: "Intervals by Ear", quality: "Chords by Ear", progression: "Progressions by Ear", melody: "Melodies by Ear", rhythm: "Rhythms by Ear", reading: "Reading Rhythms" });
const QUIZ_CHORD_GAP = 1.1;     // seconds between a progression's chords
// What a question's right answer is, as answers are given.
function quizTruth(question = quiz.question) {
    if (!question) return null;
    switch (quizKind()) {
        case "note": return question.midi % 12;
        case "interval": return question.semis;
        case "quality": return question.id;
        case "rhythm": return question.cells;
        case "reading": return true;
        case "melody": return question.midis.slice(1);
        default: return quizWriting() ? question.voicings.slice(1).map(midis => quizAsked(midis)) : question.degrees.slice(1).map(quizDegree);
    }
}
const quizIsRight = answer => quizKind() === "reading" ? answer?.all === true : JSON.stringify(answer) === JSON.stringify(quizTruth());
// The black keys' notes have two names; either is the note.
const quizNoteName = pc => MaestroMusic.PLAIN_NAMES[pc].length > 1 ? [MaestroMusic.PLAIN_NAMES[pc - 1] + "\u266F", MaestroMusic.PLAIN_NAMES[(pc + 1) % 12] + "\u266D"].join("/") : MaestroMusic.PLAIN_NAMES[pc];

// Where the questions come from: the instrument's strings (or keys), within
// the position chosen in Scales.
function quizSpots() {
    if (consKeyboard()) {
        const { low, high } = MaestroMusic.INSTRUMENTS.keyboard;
        return { pitches: [low], from: 0, to: high - low };
    }
    const frets = MaestroMusic.INSTRUMENTS[cons.settings.instrument].frets;
    const position = consPosition();
    return { pitches: MaestroMusic.currentTuning(cons.settings).pitches, from: position?.[0] ?? 0, to: position?.[1] ?? frets };
}

consNeckModes.quiz = {
    mark(midi, string, fret) {
        const { question, answered } = quiz;
        if (!question) return null;
        if (quizKind() === "note") {
            if (string !== question.string || fret !== question.fret) return null;
            if (answered === null) return { kind: "quiz", label: "?" };
            return { kind: answered === midi % 12 ? "root" : "missed", label: MaestroMusic.PLAIN_NAMES[midi % 12] };
        }
        // Intervals, chords and melodies: once answered, their notes are shown wherever they are.
        if (answered === null || quizKind() === "progression") return null;
        const pc = ((midi % 12) + 12) % 12;
        if (quizKind() === "melody") return quizMelodyMark(pc);
        if (quizKind() === "quality") {
            const pcs = question.midis.map(each => each % 12);
            if (!pcs.includes(pc)) return null;
            return { kind: pc === pcs[0] ? "root" : "note", label: MaestroMusic.PLAIN_NAMES[pc] };
        }
        if (pc === question.low % 12) return { kind: "root", label: MaestroMusic.PLAIN_NAMES[pc] };
        if (pc === question.high % 12) return { kind: "note", label: MaestroMusic.PLAIN_NAMES[pc] };
        return null;
    },
    key(midi) {
        const { question, answered } = quiz;
        if (!question) return null;
        if (quizKind() === "note") {
            if (midi !== question.midi) return null;
            return answered === null ? { kind: "quiz", label: "?" } : { kind: answered === midi % 12 ? "root" : "missed", label: MaestroMusic.PLAIN_NAMES[midi % 12] };
        }
        if (quizKind() === "quality") return answered !== null && question.midis.includes(midi) ? { kind: midi === question.midis[0] ? "root" : "note", label: MaestroMusic.PLAIN_NAMES[midi % 12] } : null;
        if (quizKind() === "progression") return null;
        if (quizKind() === "melody") return answered !== null && question.midis.includes(midi) ? quizMelodyMark(midi % 12) : null;
        if (answered === null || (midi !== question.low && midi !== question.high)) return null;
        return { kind: midi === question.low ? "root" : "note", label: MaestroMusic.PLAIN_NAMES[midi % 12] };
    },
    // Nothing is given away by a tooltip before it's answered.
    nameOf: midi => quiz.answered === null ? "?" : finderName(midi),
    // A melody's next note, at the pitch clicked (2.6.0), or a note of the
    // progression's chord selected (2.7.0); otherwise it's heard.
    click: midi => {
        if (quizMelodyShown() && quiz.answered === null) writeQuizNote(quiz.at, MaestroNotation.pitchFromMidi(midi, quiz.question.fifths, "major"), { advance: true });
        else if (quizDictShown() && quiz.answered === null) toggleQuizDictPitch(midi);
        else pluckConsNote(midi);
    },
    lit: () => quizKind() === "note" && !consKeyboard() ? consPosition() : null,
    // A question from another quiz, instrument or position is replaced.
    render: () => {
        const spots = quizSpots();
        const asked = quiz.question;
        const stale = !asked || (quizKind() === "note"
            ? asked.string === undefined || asked.string >= spots.pitches.length || asked.fret < spots.from || asked.fret > spots.to || spots.pitches[asked.string] + asked.fret !== asked.midi
            : quizKind() === "interval" ? asked.semis === undefined
            : quizKind() === "quality" ? asked.id === undefined
            : quizKind() === "progression" ? asked.numerals === undefined || !asked.voicings || asked.low !== quizLowest()
            : quizKind() === "melody" ? asked.pitches === undefined
            : asked.cells === undefined);
        if (stale) newQuizQuestion({ play: false });
        else renderQuiz();
    }
};

// A melody's note, by its name in the key; the tonic as the root.
function quizMelodyMark(pc) {
    const question = quiz.question;
    if (!question.midis.some(midi => midi % 12 === pc)) return null;
    const names = MaestroMusic.scaleNotes(question.key, "major");
    return { kind: pc === question.tonic % 12 ? "root" : "note", label: names.find(note => note.pc === pc)?.name ?? MaestroMusic.PLAIN_NAMES[pc] };
}

function playQuizInterval() {
    const { low, high } = quiz.question;
    const direction = cons.settings.quizDirection;
    if (direction === "together") pluckConsNotes([low, high]);
    else pluckConsNotes(direction === "down" ? [high, low] : [low, high], 0.7);
}

// A chord, up, down or together; a progression, its chords one after another,
// each voiced to move as little as it can and damped as the next sounds.
function playQuizQuestion() {
    const kind = quizKind();
    if (!quiz.question || kind === "note") return;
    if (kind === "interval") return playQuizInterval();
    if (kind === "melody") return playQuizMelody();
    if (kind === "rhythm" || kind === "reading") return playQuizBar();
    if (kind === "quality") {
        const { midis } = quiz.question;
        const direction = cons.settings.quizDirection;
        if (direction === "together") pluckConsNotes(midis, 0.012);
        else pluckConsNotes(direction === "down" ? [...midis].reverse() : midis, 0.45);
        return;
    }
    const notes = [], starts = [], ends = [];
    (quiz.question.voicings ?? quizVoicings(quiz.question.chords)).forEach((voiced, at) => {
        voiced.forEach((midi, index) => {
            notes.push(midi);
            starts.push(at * QUIZ_CHORD_GAP + index * 0.012);
            ends.push(at < quiz.question.chords.length - 1 ? (at + 1) * QUIZ_CHORD_GAP : null);
        });
    });
    pluckConsNotes(notes, starts, ends);
}

// ---- Melodies and rhythms (2.6.0)

// Named one at a time, the first given: a progression's chords.
const QUIZ_PICKED = Object.freeze(["progression"]);
const quizPicked = () => QUIZ_PICKED.includes(quizKind()) && !quizWriting();
const quizRhythmic = () => MaestroMusic.QUIZ_NECKLESS.includes(quizKind());
// The pulse under a bar (its first beat a little louder), and the bar's notes.
const QUIZ_PULSE = Object.freeze({ sound: "hatClosed", level: 0.3, accent: 0.5 });
const QUIZ_HIT = Object.freeze({ sound: "clave", level: 0.85 });
const QUIZ_STAFF_SCALE = 1.4;
// What each step of a beat is counted as.
const QUIZ_COUNTS = Object.freeze({ 1: [""], 2: ["", "&"], 3: ["", "trip", "let"], 4: ["", "e", "&", "a"] });
const quizDegree = degree => ((degree % 7) + 7) % 7;

// A bar's timing at the metronome's tempo, in seconds.
function quizBarTiming(question = quiz.question) {
    const beat = 60 / metro.settings.tempo;
    return { beat, step: beat / question.steps, beats: question.cells.length / question.steps };
}

// What the quiz is sounding, cut short by another question, Stop or a new kind.
function stopQuizSound() {
    const sound = quiz.sound;
    quiz.sound = null;
    if (!sound) return;
    sound.run?.stop();
    sound.timers?.forEach(clearTimeout);
    if (sound.out) {
        sound.out.gain.setTargetAtTime(0, metro.context.currentTime, 0.015);
        setTimeout(() => sound.out.disconnect(), 120);
    }
    restConsAudio();
}

// A bar's count, then the bar on the clave over the pulse; to tap along,
// the pulse alone. The metronome stops, so only one pulse is heard.
async function playQuizBar({ hits = true } = {}) {
    stopQuizSound();
    if (metro.running) stopMetronome();
    const sound = { out: null, timers: [] };
    quiz.sound = sound;
    const context = await readyConsAudio();
    if (!context || quiz.sound !== sound || !quiz.question?.cells) return null;
    const { beat, step, beats } = quizBarTiming();
    sound.out = context.createGain();
    sound.out.connect(consToneOutput(context));
    sound.step = step;
    sound.start = context.currentTime + 0.1 + beats * beat;
    sound.end = sound.start + beats * beat;
    for (let at = -beats; at < beats; at++) playDrum(context, QUIZ_PULSE.sound, sound.start + at * beat, at % beats === 0 ? QUIZ_PULSE.accent : QUIZ_PULSE.level, sound.out);
    if (hits) quiz.question.cells.forEach((cell, index) => { if (cell) playDrum(context, QUIZ_HIT.sound, sound.start + index * step, QUIZ_HIT.level, sound.out); });
    sound.timers.push(setTimeout(() => {
        if (quiz.sound !== sound) return;
        quiz.sound = null;
        sound.out.disconnect();
        restConsAudio();
        renderQuiz();
    }, (sound.end - context.currentTime + 0.5) * 1000));
    return sound;
}

// The key's chord, then the melody, a note a beat at the metronome's tempo.
async function playQuizMelody() {
    stopQuizSound();
    const { tonic, midis } = quiz.question;
    const sound = { run: null };
    quiz.sound = sound;
    const events = [tonic, tonic + 4, tonic + 7].map(midi => ({ midi, at: 0, length: 1.5 }))
        .concat(midis.map((midi, index) => ({ midi, at: 2 + index, length: 1 })));
    const run = await playConsSequence(events, { onEnd: () => { if (quiz.sound === sound) quiz.sound = null; } });
    if (quiz.sound === sound) sound.run = run;
    else run?.stop();
}

// Reading: a bar's count, shown as it's heard, then the bar to tap; the taps
// are graded as the bar ends.
async function startQuizTapping() {
    if (quizKind() !== "reading" || !quiz.question || quiz.answered !== null || quiz.sound?.tapping) return;
    const sound = await playQuizBar({ hits: false });
    if (!sound) return;
    sound.tapping = { taps: [], window: Math.min(0.12, sound.step * 0.45) };
    const { beat, beats } = quizBarTiming();
    const now = metro.context.currentTime;
    for (let at = 0; at <= beats; at++) {
        sound.timers.push(setTimeout(() => {
            if (quiz.sound !== sound) return;
            sound.count = at < beats ? at + 1 : 0;
            renderQuiz();
        }, (sound.start - beats * beat + at * beat - now) * 1000));
    }
    sound.timers.push(setTimeout(() => {
        if (quiz.sound !== sound || !sound.tapping) return;
        const expected = quiz.question.cells.flatMap((cell, index) => (cell ? [index * sound.step] : []));
        const graded = MaestroRhythm.gradeTaps(expected, sound.tapping.taps, sound.tapping.window);
        sound.tapping = null;
        answerQuiz(graded);
    }, (sound.end + sound.tapping.window + 0.05 - now) * 1000));
    renderQuiz();
}

// A tap, timed on the audio clock from the bar's start; taps well before
// it (along with the count) aren't counted.
function tapQuiz(event) {
    const sound = quiz.sound;
    if (!sound?.tapping) return false;
    const time = rhTapTime(event) - sound.start;
    if (time >= -sound.tapping.window) sound.tapping.taps.push(time);
    $("consQuizPad").animate([{ transform: "scale(0.96)" }, { transform: "scale(1)" }], { duration: 140, easing: "ease-out" });
    return true;
}

// A bar on a one-line staff; reading's, once tapped, marks each note on
// time or missed beneath it.
function drawQuizStaff(holder, cells, label, taps = null) {
    const question = quiz.question;
    const drawn = MaestroRhythm.engraveRhythm([{ sound: "snare", hits: cells }], question.meter, question.steps, { labels: false });
    const svg = rhythmSvg(drawn, QUIZ_STAFF_SCALE, label);
    if (taps) {
        const notes = cells.flatMap((cell, index) => (cell ? [index] : []));
        notes.forEach((step, at) => {
            const place = drawn.steps.find(each => each.step === step);
            const error = taps.notes[at]?.error ?? null;
            if (!place) return;
            const mark = svgNode("circle", { class: `cons-quiz-mark ${error === null ? "is-missed" : "is-hit"}`, cx: place.x + drawn.space * 0.59, cy: drawn.space * 8.6, r: drawn.space * 0.6 });
            const title = svgNode("title", {});
            const ms = error === null ? 0 : Math.round(error * 1000);
            title.textContent = error === null ? "Missed" : Math.abs(ms) <= 10 ? "On time" : ms < 0 ? `${-ms} ms early` : `${ms} ms late`;
            mark.append(title);
            svg.append(mark);
        });
    }
    holder.replaceChildren(svg);
}

// Rhythms by ear: the bar's steps, a beat to a group, counted as they're said.
function renderQuizGrid() {
    const question = quiz.question;
    if (!question?.cells) return $("consQuizGrid").replaceChildren();
    const marks = quiz.answered !== null ? MaestroRhythm.gradeCells(quiz.answered, question.cells).marks : null;
    const counts = QUIZ_COUNTS[question.steps] ?? QUIZ_COUNTS[1];
    const groups = [];
    for (let beat = 0; beat < question.cells.length / question.steps; beat++) {
        const group = element("div", "cons-quiz-beat");
        counts.forEach((count, step) => {
            const index = beat * question.steps + step;
            const cell = element("button", "cons-quiz-cell", step === 0 ? String(beat + 1) : count);
            cell.type = "button";
            cell.dataset.cell = String(index);
            cell.setAttribute("aria-pressed", String(Boolean(quiz.cells[index])));
            cell.setAttribute("aria-label", `Beat ${beat + 1}${step ? `, ${count}` : ""}`);
            if (marks) cell.classList.add(marks[index] ? "is-right" : "is-wrong");
            cell.disabled = quiz.answered !== null;
            group.append(cell);
        });
        groups.push(group);
    }
    $("consQuizGrid").replaceChildren(...groups);
}

// The staves: what's written so far (or the bar to read), and once checked, what was played.
function renderQuizStaves() {
    const question = quiz.question;
    const reading = quizKind() === "reading";
    if (!question?.cells || typeof rhythmSvg !== "function") return;
    $("consQuizWrittenCaption").textContent = reading ? "Tap this" : "Yours";
    drawQuizStaff($("consQuizWrittenStaff"), reading ? question.cells : quiz.cells, reading ? "The bar to tap" : "The bar as you've written it", reading && quiz.answered !== null ? quiz.answered : null);
    $("consQuizPlayed").hidden = reading || quiz.answered === null;
    if (!$("consQuizPlayed").hidden) drawQuizStaff($("consQuizPlayedStaff"), question.cells, "The bar as played");
}

// ---- A melody written on a staff (2.6.0): the first note given, the rest
// at the pitch heard, by the staff, the neck or the keys.

const QUIZ_MELODY_SCALE = 1.5;
const quizMelodyShown = () => quizKind() === "melody" && Boolean(quiz.question?.pitches);
const quizSamePitch = (a, b) => a === b || Boolean(a && b && a.step === b.step && a.alter === b.alter);

// A new melody: its notes spelled in its key, the first written.
function startQuizMelody(question) {
    question.fifths = MaestroNotation.keyFifths(question.key, "major") ?? 0;
    question.pitches = question.midis.map(midi => MaestroNotation.pitchFromMidi(midi, question.fifths, "major"));
    quiz.notes = question.pitches.map((p, index) => (index === 0 ? p : null));
    quiz.at = 1;
    quiz.undo = [];
}

// A bar of quarters in the key, its time as many beats as notes.
function quizMelodyScore(notes) {
    return MaestroNotation.cleanScore({ title: "", key: { fifths: quiz.question.fifths, mode: "major" }, meter: { beats: notes.length, unit: 4 }, staves: [{ clef: "treble", voices: [{ name: "Melody", notes: notes.map(p => ({ p, d: "q", dot: false, tie: false })) }] }] });
}

// rings: a class for each note's ring ("" for none); selected: the rest or note ringed.
function drawQuizMelody(holder, notes, { label, rings = [], selected = -1 }) {
    const drawn = MaestroNotation.engrave(quizMelodyScore(notes));
    const svg = svgNode("svg", { class: "cp-score", viewBox: `0 0 ${drawn.width} ${drawn.height}`, width: Math.round(drawn.width * QUIZ_MELODY_SCALE), height: Math.round(drawn.height * QUIZ_MELODY_SCALE), role: "img", "aria-label": label });
    const space = drawn.space;
    drawn.heads.forEach(head => {
        const kind = head.index === selected ? "is-selected" : rings[head.index];
        if (kind) svg.append(svgNode("ellipse", { class: `cp-ring ${kind}`, cx: head.x + 0.75 * space, cy: head.y, rx: 1.35 * space, ry: 1.05 * space }));
    });
    const rest = drawn.rests?.find(each => each.index === selected);
    if (rest) svg.append(svgNode("ellipse", { class: "cp-ring is-selected is-rest", cx: rest.x + 0.6 * space, cy: rest.y, rx: 1.25 * space, ry: 1.7 * space }));
    drawScoreItems(svg, drawn);
    holder.replaceChildren(svg);
    return drawn;
}

const quizMelodyWords = notes => notes.map(p => (p ? MaestroNotation.pitchName(p) : "to write")).join(", ");

function renderQuizMelody() {
    const question = quiz.question;
    if (!quizMelodyShown()) return;
    const answered = quiz.answered !== null;
    const rings = quiz.notes.map((p, index) => (!answered || index === 0 ? "" : p && MaestroNotation.midiOf(p) === question.midis[index] ? "is-right" : "is-wrong"));
    quiz.drawn = drawQuizMelody($("consQuizMelodyStaff"), quiz.notes, { label: `The melody as you've written it: ${quizMelodyWords(quiz.notes)}`, rings, selected: answered ? -1 : quiz.at });
    $("consQuizMelodyPlayed").hidden = !answered;
    if (answered) drawQuizMelody($("consQuizMelodyPlayedStaff"), question.pitches, { label: `The melody as played: ${quizMelodyWords(question.pitches)}` });
    if (quizGhost.at && !quizGhost.frame) quizGhost.frame = requestAnimationFrame(drawQuizGhost);
}

// A note written (or cleared, with null), heard as it's written. Written by
// a click, the neck or a letter, the next note still to write is selected.
function writeQuizNote(index, p, { advance = false } = {}) {
    if (!quizMelodyShown() || quiz.answered !== null || !Number.isInteger(index) || index < 1 || index >= quiz.notes.length) return;
    if (p !== null && !MaestroNotation.isPitch(p)) return;
    if (!quizSamePitch(quiz.notes[index], p)) {
        quiz.undo.push([...quiz.notes]);
        quiz.notes = quiz.notes.map((each, at) => (at === index ? p : each));
    }
    const open = quiz.notes.findIndex((each, at) => at > index && !each);
    quiz.at = advance && p && open > 0 ? open : index;
    if (p) pluckConsNote(MaestroNotation.midiOf(p));
    renderQuiz();
}

function selectQuizNote(index) {
    quiz.at = Math.max(1, Math.min(quiz.notes.length - 1, index));
    renderQuiz();
}

// The selected note a step up or down (or, chromatically, a half step); one
// still to write starts as the note before it.
function stepQuizNote(steps, chromatic) {
    const current = quiz.notes[quiz.at];
    if (!current) return writeQuizNote(quiz.at, quiz.notes.slice(0, quiz.at).reverse().find(Boolean) ?? null);
    if (chromatic) return writeQuizNote(quiz.at, MaestroNotation.pitch(current.step, Math.max(-2, Math.min(2, current.alter + steps))));
    const step = current.step + steps;
    writeQuizNote(quiz.at, MaestroNotation.pitch(step, MaestroNotation.keyAlter(((step % 7) + 7) % 7, quiz.question.fifths)));
}

// A letter typed: that letter in the key, nearest the note there or before it.
function letterQuizNote(letter) {
    const near = quiz.notes[quiz.at] ?? quiz.notes.slice(0, quiz.at).reverse().find(Boolean);
    const index = MaestroNotation.LETTERS.indexOf(letter);
    let best = null;
    for (const octave of [-1, 0, 1]) {
        const step = index + 7 * (Math.floor(near.step / 7) + octave);
        if (best === null || Math.abs(step - near.step) < Math.abs(best - near.step)) best = step;
    }
    writeQuizNote(quiz.at, MaestroNotation.pitch(best, MaestroNotation.keyAlter(index, quiz.question.fifths)), { advance: true });
}

// Where a pointer is on the melody's staff: the note nearest it (never the
// first, which is given) and the step there; null off the staff.
function quizMelodyHit(event) {
    const drawn = quiz.drawn;
    const svg = $("consQuizMelodyStaff").querySelector("svg");
    if (!drawn || !svg || quiz.answered !== null || !quizMelodyShown()) return null;
    const box = svg.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const x = (event.clientX - box.left) / box.width * drawn.width;
    const y = (event.clientY - box.top) / box.height * drawn.height;
    const space = drawn.space;
    const timed = MaestroNotation.timed(MaestroNotation.voicesOf(quizMelodyScore(quiz.notes))[0].notes);
    const columns = drawn.columns.filter(column => timed.some(entry => entry.onset === column.time && entry.index > 0));
    if (!columns.length) return null;
    const column = columns.reduce((best, each) => (Math.abs(each.x + 0.75 * space - x) < Math.abs(best.x + 0.75 * space - x) ? each : best));
    const index = timed.find(entry => entry.onset === column.time).index;
    const step = staffStepAt(drawn, column.system, 0, "treble", y);
    const p = MaestroNotation.pitch(step, MaestroNotation.keyAlter(((step % 7) + 7) % 7, quiz.question.fifths));
    return MaestroNotation.isPitch(p) ? { index, column, step, p } : null;
}

function quizStaffClick(event) {
    const hit = quizMelodyHit(event);
    if (!hit) return;
    writeQuizNote(hit.index, hit.p, { advance: true });
    $("consQuizMelodyStaff").focus({ preventScroll: true });
}

// A right-click clears the note there.
function quizStaffErase(event) {
    event.preventDefault();
    const hit = event.button === 2 ? quizMelodyHit(event) : null;
    if (!hit) return;
    writeQuizNote(hit.index, null);
    $("consQuizMelodyStaff").focus({ preventScroll: true });
}

// The pointer's note, drawn at most once a frame and gone when it leaves.
const quizGhost = { frame: 0, at: null };
function quizStaffHover(event) {
    quizGhost.at = { clientX: event.clientX, clientY: event.clientY };
    if (!quizGhost.frame) quizGhost.frame = requestAnimationFrame(drawQuizGhost);
}
function quizStaffLeave() {
    quizGhost.at = null;
    cancelAnimationFrame(quizGhost.frame);
    drawQuizGhost();
}
function drawQuizGhost() {
    quizGhost.frame = 0;
    const svg = $("consQuizMelodyStaff").querySelector("svg");
    svg?.querySelector(".cp-ghost")?.remove();
    const hit = svg && quizGhost.at && quizMelodyHit(quizGhost.at);
    if (!hit) return;
    drawStaffGhost(svg, quiz.drawn, { x: hit.column.x, staffY: quiz.drawn.systems[hit.column.system].staffY[0], clef: "treble", step: hit.step, d: "q" });
}

// ---- A progression written on a staff (2.7.0), as the instrument is
// written (a keyboard's on a grand staff): the first chord given, and of
// the rest the bass, the outer voices or every note, at the pitch heard, by
// the staff, the neck or the keys.

// Drawn as large as the melody's staff, or smaller, down to the least, so
// the staves fit under the question in the room the tab has.
const QUIZ_DICT_SCALE = 1.5;
const QUIZ_DICT_LEAST = 0.8;
const QUIZ_DICT_BAR_ROOM = [1, 1.5];   // spaces each bar is widened before and after its chord
const QUIZ_DICT_HEADROOM = 3.6;     // spaces above the staff for the numerals
const QUIZ_DICT_LABEL = 19;         // the numerals' size, in the score's units
const QUIZ_WRITE_WORDS = Object.freeze({ numerals: "Numerals", bass: "Bass line", outer: "Outer voices", all: "Every note" });
// The most notes a chord takes as written: the bass, the two outer voices,
// or as many as a staff holds.
const QUIZ_WRITE_MOST = Object.freeze({ bass: 1, outer: 2, all: 8 });
const quizWriting = () => quizKind() === "progression" && cons.settings.quizWrite !== "numerals";
const quizDictShown = () => quizWriting() && Boolean(quiz.question?.voicings);
const quizKeyOf = question => ({ root: question.key, scale: "major" });
const quizSameNotes = (a, b) => a.length === b.length && a.every((midi, at) => midi === b[at]);

// What's asked of a chord as played: its bass, its lowest and highest notes, or all of it.
function quizAsked(midis, write = cons.settings.quizWrite) {
    if (write === "bass") return [midis[0]];
    if (write === "outer") return [midis[0], midis.at(-1)];
    return [...midis];
}

// A progression's chords as they're played, each voiced to move as little
// as it can from the one before, from the instrument's lowest string (a
// keyboard's from E2), so a mandolin's or a ukulele's sit on its staff.
const quizLowest = () => (consKeyboard() ? 40 : Math.min(...MaestroMusic.currentTuning(cons.settings).pitches));
function quizVoicings(chords, low = quizLowest()) {
    let before = null;
    return chords.map(name => (before = MaestroHarmony.voiceChord(name, before, low)));
}

// A new progression: its voicings, and the first chord written.
function startQuizDictation(question) {
    question.low = quizLowest();
    question.voicings = quizVoicings(question.chords, question.low);
    quiz.written = question.voicings.map((midis, at) => (at === 0 ? [...midis] : []));
    quiz.chordAt = 1;
    quiz.noteAt = null;
    quiz.undo = [];
}

// The chords as whole notes, a bar each, on the instrument's staff or split
// between a keyboard's hands at middle C; a chord named is spelled as it spells its notes, the rest as the key does.
function quizDictScore(chords, names) {
    const key = quizKeyOf(quiz.question);
    const [whole] = MaestroHarmony.staffLengths(8);
    const { clefs } = MaestroMusic.staffWriting(cons.settings);
    const hands = chords.map((midis, at) => MaestroHarmony.staffHands(names[at] ?? "", [...midis].sort((a, b) => a - b), key, clefs.length));
    const voice = hand => hands.map(both => {
        const notes = both[hand];
        return notes.length
            ? { p: notes[0].p, more: notes.slice(1).map(each => each.p), d: whole.d, dot: whole.dot, tie: false }
            : { p: null, d: whole.d, dot: whole.dot, tie: false };
    });
    const score = MaestroNotation.cleanScore({
        title: "", key: { fifths: MaestroHarmony.keySignature(key), mode: "major" }, meter: { beats: 4, unit: 4 },
        staves: clefs.map((clef, hand) => ({ clef, voices: [{ name: clefs.length === 1 ? "Chords" : hand === 0 ? "Right hand" : "Left hand", notes: voice(hand) }] }))
    });
    return score ? { score, hands: hands.map(both => both.map(notes => notes.map(each => each.midi))) } : null;
}

// Where a chord's notes are drawn: its column, and its heads by MIDI number.
function quizDictPlace(made, at) {
    const timed = MaestroNotation.timed(MaestroNotation.voicesOf(made.score)[0].notes);
    const onset = timed.find(entry => entry.index === at)?.onset;
    const column = made.drawn.columns.find(each => each.time === onset);
    if (!column) return null;
    const heads = made.drawn.heads.filter(head => head.index === at && head.voice <= 1).map(head => ({ ...head, midi: made.hands[at][head.voice][head.at] }));
    return { column, heads };
}

// rings: for each chord, a class for each MIDI number ringed; labels over
// each chord, with a class; picked: the chord and note selected.
function drawQuizDict(holder, chords, { label, names, labels, rings = null, picked = null, scale = QUIZ_DICT_SCALE }) {
    const made = quizDictScore(chords, names);
    if (!made) {
        holder.replaceChildren();
        return null;
    }
    made.drawn = MaestroNotation.engrave(made.score, { headroom: QUIZ_DICT_HEADROOM * MaestroNotation.SPACE, barPadding: () => QUIZ_DICT_BAR_ROOM });
    const { drawn } = made;
    const space = drawn.space;
    made.scale = typeof scale === "function" ? scale(drawn) : scale;
    const svg = svgNode("svg", { class: "cp-score prog-staff-svg", viewBox: `0 0 ${drawn.width} ${drawn.height}`, width: Math.round(drawn.width * made.scale), height: Math.round(drawn.height * made.scale), role: "img", "aria-label": label });
    const system = drawn.systems[0];
    chords.forEach((_, at) => {
        const place = quizDictPlace(made, at);
        if (!place) return;
        if (picked?.chord === at) {
            const top = system.top + (QUIZ_DICT_HEADROOM - 2.4) * space;
            svg.append(svgNode("rect", { class: "prog-staff-pick", x: place.column.x - 1.4 * space, y: top, width: 4 * space, height: system.bottom - top, rx: 0.6 * space }));
        }
        place.heads.forEach(head => {
            const kind = picked?.chord === at && head.midi === picked.note ? "is-selected" : rings?.[at]?.get(head.midi);
            if (kind) svg.append(svgNode("ellipse", { class: `cp-ring ${kind}`, cx: head.x + 0.6 * space, cy: head.y, rx: 1.25 * space, ry: 0.95 * space }));
        });
        const words = labels[at];
        if (!words) return;
        const node = svgNode("text", { x: place.column.x, y: system.top + (QUIZ_DICT_HEADROOM - 0.7) * space, class: `prog-staff-chord${words.kind ? ` ${words.kind}` : ""}`, "font-size": QUIZ_DICT_LABEL });
        node.textContent = words.text;
        svg.append(node);
    });
    drawScoreItems(svg, drawn);
    holder.replaceChildren(svg);
    return made;
}

// The scale that fits the staff in the tab's room under the question, with
// a line left for the result.
function quizDictFit(drawn) {
    const panel = $("consQuizPanel");
    const holder = $("consQuizDictStaff");
    if (!panel.clientHeight || !drawn.height) return QUIZ_DICT_SCALE;
    const top = holder.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
    const result = $("consQuizResult");
    const below = (parseFloat(getComputedStyle(result).lineHeight) || 28) + 24;
    const room = panel.clientHeight - top - below;
    return Math.max(QUIZ_DICT_LEAST, Math.min(QUIZ_DICT_SCALE, room / drawn.height));
}

const quizChordWords = midis => (midis.length ? midis.map(midi => MaestroMusic.PLAIN_NAMES[midi % 12] + (Math.floor(midi / 12) - 1)).join(" ") : "nothing written");

function renderQuizDictation() {
    const question = quiz.question;
    if (!quizDictShown()) return;
    const answered = quiz.answered !== null;
    const numerals = question.degrees.map(degree => question.numerals[quizDegree(degree)]);
    const truth = question.voicings.map(midis => quizAsked(midis));
    const right = at => quizSameNotes(quiz.written[at], truth[at]);
    const labels = numerals.map((text, at) => (at === 0 ? { text } : !answered ? { text: "?" } : { text, kind: right(at) ? "is-right" : "is-wrong" }));
    const rings = answered ? quiz.written.map((midis, at) => new Map(at === 0 ? [] : midis.map(midi => [midi, truth[at].includes(midi) ? "is-right" : "is-wrong"]))) : null;
    const yours = quiz.written.map((midis, at) => `${at === 0 ? numerals[0] : `chord ${at + 1}`}: ${quizChordWords(midis)}`).join("; ");
    quiz.dict = drawQuizDict($("consQuizDictStaff"), quiz.written, {
        label: `The progression as you've written it: ${yours}`, names: [question.chords[0]], labels, rings,
        picked: answered ? null : { chord: quiz.chordAt, note: quiz.noteAt }, scale: quizDictFit
    });
    $("consQuizDictPlayed").hidden = !answered;
    if (answered) {
        const played = question.voicings.map((midis, at) => `${numerals[at]}: ${quizChordWords(midis)}`).join("; ");
        drawQuizDict($("consQuizDictPlayedStaff"), question.voicings, { label: `The progression as played: ${played}`, names: question.chords, labels: numerals.map(text => ({ text })), scale: quiz.dict?.scale ?? QUIZ_DICT_SCALE });
    }
    if (quizDictGhost.at && !quizDictGhost.frame) quizDictGhost.frame = requestAnimationFrame(drawQuizDictGhost);
}

// Every chord has the notes asked for: one for the bass, two for the outer
// voices, any for every note (how many is part of what's heard).
function quizDictReady() {
    if (!quizDictShown()) return false;
    const most = QUIZ_WRITE_MOST[cons.settings.quizWrite];
    return quiz.written.slice(1).every(midis => (most < QUIZ_WRITE_MOST.all ? midis.length === most : midis.length > 0));
}

// A chord's notes written (from E0 to C8, each once), the chord and its note selected.
function setQuizChord(at, midis, note) {
    if (!quizDictShown() || quiz.answered !== null || !Number.isInteger(at) || at < 1 || at >= quiz.written.length) return false;
    const next = [...new Set(midis)].filter(midi => Number.isInteger(midi) && midi >= MaestroHarmony.VOICING_LOW && midi <= MaestroHarmony.VOICING_HIGH).sort((a, b) => a - b);
    const changed = !quizSameNotes(next, quiz.written[at]);
    if (changed) {
        quiz.undo.push(quiz.written.map(each => [...each]));
        quiz.written = quiz.written.map((each, index) => (index === at ? next : each));
    }
    quiz.chordAt = at;
    quiz.noteAt = next.includes(note) ? note : null;
    renderQuiz();
    return changed;
}

// A note written into a chord, heard, or one there selected. With as many as
// the level takes, it takes the selected note's place (or the nearest).
function addQuizDictNote(at, midi) {
    const notes = quiz.written[at];
    if (!notes) return;
    if (notes.includes(midi)) return selectQuizDictNote(at, midi);
    let kept = notes;
    if (notes.length >= QUIZ_WRITE_MOST[cons.settings.quizWrite]) {
        const out = quiz.chordAt === at && notes.includes(quiz.noteAt) ? quiz.noteAt : notes.reduce((best, each) => (Math.abs(each - midi) < Math.abs(best - midi) ? each : best));
        kept = notes.filter(each => each !== out);
    }
    if (setQuizChord(at, [...kept, midi], midi)) pluckConsNote(midi);
}

function removeQuizDictNote(at, midi) {
    const notes = quiz.written[at];
    if (!notes?.includes(midi)) return;
    const rest = notes.filter(each => each !== midi);
    setQuizChord(at, rest, rest.filter(each => each < midi).at(-1) ?? rest[0] ?? null);
}

function selectQuizDictNote(at, midi) {
    if (!quizDictShown() || quiz.answered !== null || at < 1 || at >= quiz.written.length) return;
    quiz.chordAt = at;
    quiz.noteAt = quiz.written[at].includes(midi) ? midi : null;
    renderQuiz();
    if (quiz.noteAt !== null) pluckConsNote(midi);
}

// Another chord: its highest note selected.
function moveQuizDictChord(by) {
    const at = Math.max(1, Math.min(quiz.written.length - 1, quiz.chordAt + by));
    selectQuizDictNote(at, quiz.written[at].at(-1) ?? null);
}

// The note above or below the selected one in its chord.
function stepQuizDictSelection(by) {
    const notes = quiz.written[quiz.chordAt] ?? [];
    if (!notes.length) return;
    const from = notes.indexOf(quiz.noteAt);
    const next = notes[Math.max(0, Math.min(notes.length - 1, (from < 0 ? notes.length - 1 : from) + by))];
    selectQuizDictNote(quiz.chordAt, next);
}

// The selected note a step up or down in the key, or a half step; past a
// note of the chord's own to the next free place.
function stepQuizDictNote(by, chromatic) {
    const notes = quiz.written[quiz.chordAt] ?? [];
    if (!notes.includes(quiz.noteAt)) return;
    const fifths = MaestroHarmony.keySignature(quizKeyOf(quiz.question));
    let p = MaestroHarmony.spellVoicing("", [quiz.noteAt], quizKeyOf(quiz.question))[0];
    let midi = quiz.noteAt;
    for (let tries = 0; tries < 12; tries++) {
        if (chromatic) midi += by;
        else {
            const step = p.step + by;
            p = MaestroNotation.pitch(step, MaestroNotation.keyAlter(((step % 7) + 7) % 7, fifths));
            midi = MaestroNotation.midiOf(p);
        }
        if (midi < MaestroHarmony.VOICING_LOW || midi > MaestroHarmony.VOICING_HIGH) return;
        if (!notes.includes(midi)) break;
    }
    if (notes.includes(midi)) return;
    if (setQuizChord(quiz.chordAt, [...notes.filter(each => each !== quiz.noteAt), midi], midi)) pluckConsNote(midi);
}

// A letter typed: that letter in the key, nearest the note selected (or the
// chord's highest, or the last chord written's), and not in the chord.
function letterQuizDictNote(letter) {
    const at = quiz.chordAt;
    const notes = quiz.written[at] ?? [];
    const before = quiz.written.slice(0, at).reverse().find(each => each.length) ?? [60];
    const near = notes.includes(quiz.noteAt) ? quiz.noteAt : notes.at(-1) ?? (cons.settings.quizWrite === "bass" ? before[0] : before.at(-1));
    const index = MaestroNotation.LETTERS.indexOf(letter);
    const alter = MaestroNotation.keyAlter(index, MaestroHarmony.keySignature(quizKeyOf(quiz.question)));
    let best = null;
    for (let octave = 0; octave <= 9; octave++) {
        const midi = MaestroNotation.midiOf(MaestroNotation.pitch(index + 7 * octave, alter));
        if (midi < MaestroHarmony.VOICING_LOW || midi > MaestroHarmony.VOICING_HIGH || notes.includes(midi)) continue;
        if (best === null || Math.abs(midi - near) < Math.abs(best - near) || (Math.abs(midi - near) === Math.abs(best - near) && midi > best)) best = midi;
    }
    if (best !== null) addQuizDictNote(at, best);
}

// The neck or keys clicked: the pitch joins the chord selected, or is
// selected there, or, selected already, leaves it.
function toggleQuizDictPitch(midi) {
    const notes = quiz.written[quiz.chordAt] ?? [];
    if (!notes.includes(midi)) return addQuizDictNote(quiz.chordAt, midi);
    if (quiz.noteAt === midi) return removeQuizDictNote(quiz.chordAt, midi);
    selectQuizDictNote(quiz.chordAt, midi);
}

// What's under the pointer: the chord nearest it (never the first, which is
// given), the staff and step there, and a note of the chord's if one is there.
function quizDictHit(event) {
    const made = quiz.dict;
    const svg = $("consQuizDictStaff").querySelector("svg");
    if (!made || !svg || quiz.answered !== null || !quizDictShown()) return null;
    const box = svg.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const { drawn } = made;
    const x = (event.clientX - box.left) / box.width * drawn.width;
    const y = (event.clientY - box.top) / box.height * drawn.height;
    const space = drawn.space;
    const system = drawn.systems[0];
    const places = quiz.written.map((_, at) => ({ at, place: at > 0 ? quizDictPlace(made, at) : null })).filter(each => each.place);
    if (!places.length || y < system.top || y > system.bottom + 2 * space) return null;
    const near = places.reduce((best, each) => (Math.abs(each.place.column.x + 0.6 * space - x) < Math.abs(best.place.column.x + 0.6 * space - x) ? each : best));
    if (Math.abs(near.place.column.x + 0.6 * space - x) > 4 * space) return null;
    const hand = system.staffY.length < 2 || y < (system.staffY[0] + system.staffY[1] - 4 * space) / 2 ? 0 : 1;
    const clef = made.score.staves[hand].clef;
    const step = staffStepAt(drawn, 0, hand, clef, y);
    const p = MaestroNotation.pitch(step, MaestroNotation.keyAlter(((step % 7) + 7) % 7, MaestroHarmony.keySignature(quizKeyOf(quiz.question))));
    const head = near.place.heads.find(each => Math.abs(each.x + 0.6 * space - x) < 1.4 * space && Math.abs(each.y - y) < 0.6 * space);
    return { at: near.at, place: near.place, hand, clef, step, p, head: head ?? null, staffY: system.staffY[hand] };
}

function quizDictClick(event) {
    const hit = quizDictHit(event);
    if (!hit) return;
    $("consQuizDictStaff").focus({ preventScroll: true });
    if (hit.head) return selectQuizDictNote(hit.at, hit.head.midi);
    if (MaestroNotation.isPitch(hit.p)) addQuizDictNote(hit.at, MaestroNotation.midiOf(hit.p));
}

// A right-click takes out the note there.
function quizDictErase(event) {
    event.preventDefault();
    const hit = event.button === 2 ? quizDictHit(event) : null;
    if (!hit?.head) return;
    removeQuizDictNote(hit.at, hit.head.midi);
    $("consQuizDictStaff").focus({ preventScroll: true });
}

// The pointer's note, drawn at most once a frame and gone when it leaves.
const quizDictGhost = { frame: 0, at: null };
function quizDictHover(event) {
    quizDictGhost.at = { clientX: event.clientX, clientY: event.clientY };
    if (!quizDictGhost.frame) quizDictGhost.frame = requestAnimationFrame(drawQuizDictGhost);
}
function quizDictLeave() {
    quizDictGhost.at = null;
    cancelAnimationFrame(quizDictGhost.frame);
    drawQuizDictGhost();
}
function drawQuizDictGhost() {
    quizDictGhost.frame = 0;
    const svg = $("consQuizDictStaff").querySelector("svg");
    svg?.querySelector(".cp-ghost")?.remove();
    const hit = svg && quizDictGhost.at && quizDictHit(quizDictGhost.at);
    if (!hit || hit.head || !MaestroNotation.isPitch(hit.p)) return;
    drawStaffGhost(svg, quiz.dict.drawn, { x: hit.place.column.x, staffY: hit.staffY, clef: hit.clef, step: hit.step, d: "w" });
}

// Graded chord by chord, at the pitch heard.
function quizDictGrade(answer = quiz.answered) {
    const truth = quizTruth();
    return { right: truth.filter((midis, at) => quizSameNotes(answer[at] ?? [], midis)).length, total: truth.length };
}

// Graded note by note, at the pitch heard.
function quizMelodyGrade(answer = quiz.answered) {
    const truth = quizTruth();
    return { right: truth.filter((midi, at) => answer[at] === midi).length, total: truth.length };
}

// Taps graded, in words.
function quizTapWords(graded) {
    const errors = graded.notes.filter(note => note.error !== null).map(note => note.error);
    const parts = [`${graded.hit} of ${graded.total} on time`];
    if (graded.extra) parts.push(graded.extra === 1 ? "1 extra tap" : `${graded.extra} extra taps`);
    if (errors.length) {
        const ms = Math.round((errors.reduce((sum, error) => sum + error, 0) / errors.length) * 1000);
        parts.push(Math.abs(ms) <= 10 ? "on the beat on average" : `${Math.abs(ms)} ms ${ms < 0 ? "early" : "late"} on average`);
    }
    return parts.join(", ");
}

function newQuizQuestion({ play = true } = {}) {
    stopQuizSound();
    quiz.answered = null;
    quiz.picks = [];
    const kind = quizKind();
    if (kind === "note") {
        const spots = quizSpots();
        quiz.question = MaestroMusic.quizNote(spots.pitches, { from: spots.from, to: spots.to, naturals: cons.settings.quizNaturals, avoid: quiz.question?.string !== undefined ? quiz.question : null });
    } else if (kind === "rhythm" || kind === "reading") {
        // A bar not the same as the last.
        const before = quiz.question?.cells?.join("") ?? "";
        let bar = MaestroRhythm.quizBar(cons.settings.quizRhythm);
        for (let tries = 0; tries < 8 && bar.cells.join("") === before; tries++) bar = MaestroRhythm.quizBar(cons.settings.quizRhythm);
        quiz.question = bar;
        quiz.cells = bar.cells.map(() => 0);
        if (play && kind === "rhythm" && consSections.current() === "quiz") playQuizQuestion();
    } else {
        quiz.question = kind === "interval" ? MaestroMusic.quizInterval(quiz.question?.semis ?? 0)
            : kind === "quality" ? MaestroMusic.quizQuality(cons.settings.quizChords, quiz.question?.id ?? "")
            : kind === "melody" ? MaestroMusic.quizMelody(cons.settings.quizMelody, quiz.question?.degrees?.join() ?? "")
            : MaestroMusic.quizProgression(cons.settings.quizChords, quiz.question?.index ?? -1);
        if (kind === "melody") startQuizMelody(quiz.question);
        if (kind === "progression") startQuizDictation(quiz.question);
        if (play && consSections.current() === "quiz") playQuizQuestion();
    }
    renderQuiz();
    renderConsNeck();
}

// A progression's last chord named, taken back before the last grades it;
// a melody's or a written progression's last change, before it's checked.
function undoQuizPick() {
    if (quizDictShown() && quiz.answered === null && quiz.undo.length) {
        const before = quiz.undo.pop();
        const changed = before.findIndex((midis, at) => !quizSameNotes(midis, quiz.written[at]));
        quiz.written = before;
        if (changed > 0) quiz.chordAt = changed;
        if (!quiz.written[quiz.chordAt].includes(quiz.noteAt)) quiz.noteAt = quiz.written[quiz.chordAt].at(-1) ?? null;
        renderQuiz();
        return true;
    }
    if (quizMelodyShown() && quiz.answered === null && quiz.undo.length) {
        const before = quiz.undo.pop();
        const changed = before.findIndex((p, at) => !quizSamePitch(p, quiz.notes[at]));
        quiz.notes = before;
        if (changed > 0) quiz.at = changed;
        renderQuiz();
        return true;
    }
    if (!quizPicked() || !quiz.question || quiz.answered !== null || !quiz.picks.length) return false;
    quiz.picks.pop();
    // The answers are drawn again, so focus goes back to the same numeral, or to the first when Undo turns off.
    const focused = document.activeElement;
    const numeral = focused?.closest?.("#consQuizAnswers [data-answer]")?.dataset.answer;
    renderQuiz();
    if (numeral !== undefined) $("consQuizAnswers").querySelector(`[data-answer="${numeral}"]`)?.focus();
    else if (focused === $("consQuizUndo") && $("consQuizUndo").disabled) $("consQuizAnswers").querySelector("button")?.focus();
    return true;
}

function answerQuiz(answer) {
    if (!quiz.question || quiz.answered !== null) return;
    // A progression's chords are named one at a time; the last is the answer.
    if (quizPicked()) {
        quiz.picks.push(answer);
        if (quiz.picks.length < quiz.question.degrees.length - 1) return renderQuiz();
        answer = [...quiz.picks];
    }
    quiz.answered = answer;
    const note = quizKind() === "note";
    const right = quizIsRight(answer);
    quiz.asked += 1;
    quiz.right += right ? 1 : 0;
    quiz.streak = right ? quiz.streak + 1 : 0;
    if (note) pluckConsNote(quiz.question.midi);
    // Focus in the quiz (on an answer, now off) goes to Next (2.7.0); the
    // answer stays to be looked at until then.
    const focused = document.activeElement;
    renderQuiz();
    renderConsNeck();
    if (!focused || focused === document.body || focused.closest(".cons-quiz-module")) $("consQuizNext").focus({ preventScroll: true });
}

function resetQuizScore() {
    stopQuizSound();
    Object.assign(quiz, { question: null, answered: null, picks: [], cells: [], notes: [], at: 1, undo: [], drawn: null, written: [], chordAt: 1, noteAt: null, dict: null, right: 0, asked: 0, streak: 0 });
}

function renderQuiz() {
    const kind = quizKind();
    const note = kind === "note";
    const chords = kind === "quality" || kind === "progression";
    const rhythmic = quizRhythmic();
    const picked = quizPicked();
    const melody = kind === "melody";
    const writing = quizWriting();
    document.querySelectorAll("#consQuizKind [data-quiz]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.quiz === kind)));
    document.querySelectorAll("#consQuizDirection [data-direction]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.direction === cons.settings.quizDirection)));
    document.querySelectorAll("#consQuizChords [data-chords]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.chords === cons.settings.quizChords)));
    document.querySelectorAll("#consQuizLevel [data-rhythm]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.rhythm === cons.settings.quizRhythm)));
    document.querySelectorAll("#consQuizMelody [data-melody]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.melody) === cons.settings.quizMelody)));
    document.querySelectorAll("#consQuizWrite [data-write]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.write === cons.settings.quizWrite)));
    $("consQuizNaturals").checked = cons.settings.quizNaturals;
    $("consQuizNaturalsField").hidden = !note;
    $("consQuizDirectionField").hidden = kind !== "interval" && kind !== "quality";
    $("consQuizChordsField").hidden = !chords;
    $("consQuizLevelField").hidden = !rhythmic;
    $("consQuizMelodyField").hidden = kind !== "melody";
    $("consQuizWriteField").hidden = kind !== "progression";
    // The options chip (2.4.1) says what this kind of quiz is set to.
    const word = { triads: "Triads", sevenths: "Sevenths", both: "Triads and sevenths", up: "Up", down: "Down", together: "Together" };
    const { quizChords, quizDirection } = cons.settings;
    $("consQuizOptionsName").textContent = note ? (cons.settings.quizNaturals ? "Natural notes" : "All notes")
        : kind === "interval" ? word[quizDirection]
        : kind === "quality" ? `${word[quizChords]} · ${word[quizDirection]}`
        : kind === "melody" ? `${cons.settings.quizMelody} notes`
        : rhythmic ? MaestroRhythm.QUIZ_LEVELS[cons.settings.quizRhythm].label
        : writing ? `${word[quizChords]} · ${QUIZ_WRITE_WORDS[cons.settings.quizWrite]}`
        : word[quizChords];
    const tapping = Boolean(quiz.sound?.tapping);
    // Reading's bar is heard once it's tapped, so hearing it gives nothing away.
    $("consQuizHear").hidden = note || (kind === "reading" && quiz.answered === null);
    $("consQuizHear").disabled = tapping;
    // Shown throughout a question, so the buttons beside them never move.
    $("consQuizUndo").hidden = !picked && !melody && !writing;
    $("consQuizUndo").disabled = !quiz.question || quiz.answered !== null || !(melody || writing ? quiz.undo.length : quiz.picks.length);
    $("consQuizUndo").title = melody || writing ? "Take back the last change (Backspace)" : "Take back the last one named (Backspace)";
    // A melody is checked once every note is written (2.6.0), a progression
    // once each chord has the notes asked for (2.7.0).
    $("consQuizCheck").hidden = kind !== "rhythm" && !melody && !writing;
    $("consQuizCheck").disabled = !quiz.question || quiz.answered !== null || (melody && quiz.notes.some(p => !p)) || (writing && !quizDictReady());
    $("consQuizCheck").title = `${melody ? "Check the melody as written" : writing ? "Check the chords as written" : "Check the bar as written"} (Ctrl+Enter)`;
    $("consQuizTap").hidden = kind !== "reading" || quiz.answered !== null;
    $("consQuizTap").disabled = !quiz.question || tapping;
    const position = consPosition();
    $("consQuizTitle").textContent = QUIZ_TITLES[kind];
    $("consQuizPrompt").textContent = note
        ? (consKeyboard() ? "Which note is this key?" : `Which note is marked?${position ? ` Frets ${position[0]}–${position[1]}` : ""}`)
        : kind === "interval" ? "Which interval was played?"
        : kind === "quality" ? "Which chord was played?"
        : kind === "melody" ? (quiz.question?.key ? `A melody in ${quiz.question.key} major, after its chord, a note a beat. Write the notes after the first, at the pitch heard, then Check.` : "")
        : kind === "rhythm" ? (quiz.question?.meter ? `A bar of ${quiz.question.meter}, after a bar's count. Click the steps it plays, then Check.` : "")
        : kind === "reading" ? (quiz.question?.meter ? "Tap this bar in time after a bar's count: on the pad, or with F, J or Space." : "")
        : writing ? `Four chords in ${quiz.question?.key ?? "a"} major, from I, the first written. ${{ bass: "Write the bass of the other three", outer: "Write the lowest and highest notes of the other three", all: "Write every note of the other three" }[cons.settings.quizWrite]}, at the pitch heard, then Check.`
        : "Four chords in a major key, from I. Name the other three, in order.";
    const { question, answered } = quiz;
    const truth = quizTruth();
    const options = note
        ? MaestroMusic.PLAIN_NAMES.map((name, pc) => ({ value: pc, label: quizNoteName(pc), title: "" })).filter(option => !cons.settings.quizNaturals || MaestroMusic.PLAIN_NAMES[option.value].length === 1)
        : kind === "interval" ? MaestroMusic.QUIZ_INTERVALS.map(interval => ({ value: interval.semis, label: interval.short, title: interval.name }))
        : kind === "quality" ? MaestroMusic.QUIZ_QUALITIES.filter(quality => cons.settings.quizChords === "both" || quality.set === cons.settings.quizChords).map(quality => ({ value: quality.id, label: quality.short, title: quality.name }))
        : rhythmic || melody || writing ? []
        : (question?.numerals ?? []).map((numeral, degree) => ({ value: degree, label: numeral, title: `${numeral} (${degree + 1})` }));
    // A progression's chords so far: "I – vi – ? – ?".
    $("consQuizLine").hidden = !picked || !question;
    if (picked && question) {
        const names = question.numerals;
        const shown = [names[quizDegree(question.degrees[0])], ...truth.map((_, at) => quiz.picks[at] === undefined ? "?" : names[quiz.picks[at]])];
        $("consQuizLine").replaceChildren(...shown.flatMap((text, at) => {
            const part = element("span", "cons-quiz-step", text);
            if (answered !== null && at > 0) part.classList.add(quiz.picks[at - 1] === truth[at - 1] ? "is-right" : "is-wrong");
            return at ? [element("span", "cons-quiz-dash", "\u2013"), part] : [part];
        }));
    }
    $("consQuizAnswers").classList.toggle("is-notes", note);
    $("consQuizAnswers").classList.toggle("is-numerals", picked);
    $("consQuizAnswers").hidden = rhythmic || melody || writing;
    $("consQuizMelodyBox").hidden = !melody;
    if (melody) renderQuizMelody();
    $("consQuizDictBox").hidden = !writing;
    if (writing) renderQuizDictation();
    $("consQuizRhythm").hidden = !rhythmic;
    $("consQuizGrid").hidden = kind !== "rhythm";
    $("consQuizPad").hidden = kind !== "reading";
    $("consQuizPad").disabled = !tapping;
    if (rhythmic) {
        renderQuizGrid();
        renderQuizStaves();
    }
    $("consQuizAnswers").replaceChildren(...options.map(option => {
        const button = element("button", "cons-quiz-answer");
        button.type = "button";
        button.dataset.answer = String(option.value);
        button.textContent = option.label;
        if (option.title) button.title = option.title;
        if (answered !== null && !picked && option.value === truth) button.classList.add("is-right");
        if (answered !== null && !picked && option.value === answered && answered !== truth) button.classList.add("is-wrong");
        button.disabled = answered !== null || !question;
        return button;
    }));
    let result = "";
    if (!question) result = "There's nowhere to ask about here.";
    else if (tapping) result = quiz.sound.count ? `Count: ${Array.from({ length: quiz.sound.count }, (_, at) => at + 1).join(" ")}` : "Tap it now.";
    else if (answered === null) result = "";
    else if (kind === "rhythm") {
        const graded = MaestroRhythm.gradeCells(answered, question.cells);
        result = graded.all ? "Right: as played." : `${graded.right} of ${graded.total} steps right; Played shows the bar as it was. Click Next for another.`;
    } else if (kind === "melody") {
        const graded = quizMelodyGrade(answered);
        const what = `${question.pitches.map(MaestroNotation.pitchName).join("\u2013")} in ${question.key} major`;
        result = graded.right === graded.total ? `Right: ${what}.` : `${graded.right} of ${graded.total} notes right: it's ${what}. Click Next for another.`;
    } else if (writing) {
        const graded = quizDictGrade(answered);
        const what = `${question.degrees.map(degree => question.numerals[degree]).join("\u2013")} in ${question.key} (${question.chords.join(" ")})`;
        result = graded.right === graded.total ? `Right: ${what}.` : `${graded.right} of ${graded.total} chords right: it's ${what}. Played shows its notes. Click Next for another.`;
    } else if (kind === "reading") result = answered.all ? `Right: ${quizTapWords(answered)}.` : `${quizTapWords(answered)}. Click Hear it to hear it, or Next for another.`;
    else {
        const right = quizIsRight(answered);
        let what;
        if (note) what = quizNoteName(truth);
        else if (kind === "interval") what = `a ${MaestroMusic.QUIZ_INTERVALS.find(interval => interval.semis === truth).name.toLowerCase()}`;
        else if (kind === "quality") {
            const quality = MaestroMusic.QUIZ_QUALITIES.find(each => each.id === truth);
            what = `${/^[AEIOU]/.test(quality.name) ? "an" : "a"} ${quality.name.toLowerCase()} (${question.name})`;
        } else what = `${question.degrees.map(degree => question.numerals[degree]).join("\u2013")} in ${question.key} (${question.chords.join(" ")})`;
        result = right ? `Right: ${what}.` : `It's ${what}. Click Next for another.`;
    }
    $("consQuizResult").textContent = result;
    // Answered, the result takes the prompt's place (2.7.0).
    $("consQuizPrompt").hidden = answered !== null && Boolean(result);
    $("consQuizResult").classList.toggle("is-wrong", answered !== null && !quizIsRight(answered));
    $("consQuizScore").textContent = quiz.asked ? `${quiz.right} of ${quiz.asked} right${quiz.streak > 1 ? ` · ${quiz.streak} in a row` : ""}` : "";
}

// A change of quiz, or of what it asks from, starts a new score.
function setConsQuiz(changes) {
    Object.assign(cons.settings, changes);
    saveConsSettings();
    resetQuizScore();
    newQuizQuestion({ play: false });
}

$("consQuizAnswers").addEventListener("click", event => {
    const button = event.target.closest("[data-answer]");
    if (button) answerQuiz(quizKind() === "quality" ? button.dataset.answer : Number(button.dataset.answer));
});
document.querySelectorAll("#consQuizChords [data-chords]").forEach(button => button.addEventListener("click", () => {
    if (MaestroMusic.QUIZ_CHORD_SETS.includes(button.dataset.chords)) setConsQuiz({ quizChords: button.dataset.chords });
}));
document.querySelectorAll("#consQuizKind [data-quiz]").forEach(button => button.addEventListener("click", () => {
    if (MaestroMusic.QUIZ_KINDS.includes(button.dataset.quiz)) setConsQuiz({ quizKind: button.dataset.quiz });
}));
document.querySelectorAll("#consQuizDirection [data-direction]").forEach(button => button.addEventListener("click", () => {
    if (!MaestroMusic.QUIZ_DIRECTIONS.includes(button.dataset.direction)) return;
    cons.settings.quizDirection = button.dataset.direction;
    saveConsSettings();
    renderQuiz();
}));
// The rhythm quizzes' levels and the melody's lengths (2.6.0).
$("consQuizLevel").replaceChildren(...MaestroMusic.QUIZ_RHYTHMS.map(level => {
    const button = element("button", "", MaestroRhythm.QUIZ_LEVELS[level].label);
    button.type = "button";
    button.dataset.rhythm = level;
    return button;
}));
$("consQuizMelody").replaceChildren(...MaestroMusic.QUIZ_MELODY_LENGTHS.map(length => {
    const button = element("button", "", String(length));
    button.type = "button";
    button.dataset.melody = String(length);
    return button;
}));
// What's written for a progression (2.7.0).
$("consQuizWrite").replaceChildren(...MaestroMusic.QUIZ_WRITES.map(write => {
    const button = element("button", "", QUIZ_WRITE_WORDS[write]);
    button.type = "button";
    button.dataset.write = write;
    return button;
}));
$("consQuizWrite").addEventListener("click", event => {
    const write = event.target.closest("[data-write]")?.dataset.write;
    if (MaestroMusic.QUIZ_WRITES.includes(write)) setConsQuiz({ quizWrite: write });
});
$("consQuizLevel").addEventListener("click", event => {
    const level = event.target.closest("[data-rhythm]")?.dataset.rhythm;
    if (MaestroMusic.QUIZ_RHYTHMS.includes(level)) setConsQuiz({ quizRhythm: level });
});
$("consQuizMelody").addEventListener("click", event => {
    const length = Number(event.target.closest("[data-melody]")?.dataset.melody);
    if (MaestroMusic.QUIZ_MELODY_LENGTHS.includes(length)) setConsQuiz({ quizMelody: length });
});
// A step clicked holds a note or doesn't; it's drawn on the staff as it's written.
$("consQuizGrid").addEventListener("click", event => {
    const cell = event.target.closest("[data-cell]");
    const index = Number(cell?.dataset.cell);
    if (!cell || quiz.answered !== null || !Number.isInteger(index) || index < 0 || index >= quiz.cells.length) return;
    quiz.cells[index] = quiz.cells[index] ? 0 : 1;
    cell.setAttribute("aria-pressed", String(Boolean(quiz.cells[index])));
    if (quiz.cells[index]) hearDrum(QUIZ_HIT.sound);
    renderQuizStaves();
});
$("consQuizCheck").addEventListener("click", () => {
    if (quizKind() === "rhythm") answerQuiz([...quiz.cells]);
    else if (quizMelodyShown() && quiz.notes.every(Boolean)) answerQuiz(quiz.notes.slice(1).map(MaestroNotation.midiOf));
    else if (quizDictReady()) answerQuiz(quiz.written.slice(1).map(midis => [...midis]));
});
// The melody's staff (2.6.0): a click writes, a right-click clears; with
// focus, Left and Right choose a note, Up and Down move it a step (with
// Shift, a half step), A to G write a letter, Delete clears.
$("consQuizMelodyStaff").addEventListener("click", quizStaffClick);
$("consQuizMelodyStaff").addEventListener("contextmenu", quizStaffErase);
$("consQuizMelodyStaff").addEventListener("pointermove", quizStaffHover);
$("consQuizMelodyStaff").addEventListener("pointerleave", quizStaffLeave);
$("consQuizMelodyStaff").addEventListener("keydown", event => {
    if (!quizMelodyShown() || quiz.answered !== null || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") selectQuizNote(quiz.at + (event.key === "ArrowLeft" ? -1 : 1));
    else if (event.key === "ArrowUp" || event.key === "ArrowDown") stepQuizNote(event.key === "ArrowUp" ? 1 : -1, event.shiftKey);
    else if (event.key === "Delete") writeQuizNote(quiz.at, null);
    else if (/^[a-gA-G]$/.test(event.key) && !event.shiftKey) letterQuizNote(event.key.toUpperCase());
    else return;
    event.preventDefault();
});
// The progression's staff (2.7.0): a click writes a note or selects one, a
// right-click takes one out; with focus, Left and Right choose a chord, Up
// and Down move the note (with Shift, a half step), Alt with Up and Down
// selects another, A to G write a letter, Delete takes it out, and Enter
// plays the chord as written.
$("consQuizDictStaff").addEventListener("click", quizDictClick);
$("consQuizDictStaff").addEventListener("contextmenu", quizDictErase);
$("consQuizDictStaff").addEventListener("pointermove", quizDictHover);
$("consQuizDictStaff").addEventListener("pointerleave", quizDictLeave);
$("consQuizDictStaff").addEventListener("keydown", event => {
    if (!quizDictShown() || quiz.answered !== null || event.ctrlKey || event.metaKey) return;
    const arrow = event.key === "ArrowUp" || event.key === "ArrowDown";
    if (event.altKey) {
        if (!arrow || event.shiftKey) return;
        stepQuizDictSelection(event.key === "ArrowUp" ? 1 : -1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") moveQuizDictChord(event.key === "ArrowLeft" ? -1 : 1);
    else if (arrow) stepQuizDictNote(event.key === "ArrowUp" ? 1 : -1, event.shiftKey);
    else if (event.key === "Delete") removeQuizDictNote(quiz.chordAt, quiz.noteAt);
    else if (event.key === "Enter") {
        const notes = quiz.written[quiz.chordAt] ?? [];
        if (notes.length) pluckConsNotes(notes, 0.012);
    } else if (/^[a-gA-G]$/.test(event.key) && !event.shiftKey) letterQuizDictNote(event.key.toUpperCase());
    else return;
    event.preventDefault();
});
// New room fits the progression's staff again, while it's shown.
new ResizeObserver(() => {
    if (!quizDictShown() || $("consQuizPanel").hidden || !quiz.dict) return;
    if (Math.abs(quizDictFit(quiz.dict.drawn) - quiz.dict.scale) > 0.01) renderQuizDictation();
}).observe($("consQuizPanel"));
// Keys on the Quiz tab (2.7.0), outside a field: Space or H hears the
// question again, N asks the next, Ctrl+Enter checks, and 1 to 7 name a
// progression's chord by its degree. Space works where it would otherwise
// start the metronome; a control reached with the keyboard still takes it.
const QUIZ_KEY_BUTTONS = Object.freeze({ h: "consQuizHear", " ": "consQuizHear", n: "consQuizNext" });
document.addEventListener("keydown", event => {
    if (event.defaultPrevented || event.altKey || event.metaKey || !$("conservatory").classList.contains("active") || consSections.current() !== "quiz") return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, select, textarea, [contenteditable]") || coveringDialog() || !$("launcher").hidden) return;
    let button = null;
    if (event.ctrlKey) {
        if (event.key === "Enter" && !event.shiftKey) button = $("consQuizCheck");
    } else if (!event.shiftKey) {
        const key = event.key.toLowerCase();
        if (key === " " && !spaceStartsMetronome(document.activeElement)) return;
        if (Object.hasOwn(QUIZ_KEY_BUTTONS, key)) button = $(QUIZ_KEY_BUTTONS[key]);
        else if (/^[1-7]$/.test(key) && quizPicked()) button = $("consQuizAnswers").querySelector(`[data-answer="${Number(key) - 1}"]`);
    }
    if (!button) return;
    // Space on the Quiz is the question's, even with nothing to hear.
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat && !button.hidden && !button.disabled) button.click();
}, true);
$("consQuizTap").addEventListener("click", startQuizTapping);
$("consQuizPad").addEventListener("pointerdown", tapQuiz);
// While a bar's being tapped, F, J and Space tap it (Space doesn't start the metronome).
document.addEventListener("keydown", event => {
    if (!quiz.sound?.tapping || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.target instanceof Element && event.target.closest("input, select, textarea, [contenteditable]")) return;
    if (![" ", "f", "F", "j", "J"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    tapQuiz(event);
}, true);
wireConsPopover("quiz", $("consQuizOptionsButton"), $("consQuizOptionsPanel"));
$("consQuizNaturals").addEventListener("change", () => setConsQuiz({ quizNaturals: $("consQuizNaturals").checked }));
$("consQuizHear").addEventListener("click", () => playQuizQuestion());
$("consQuizUndo").addEventListener("click", undoQuizPick);
// Backspace takes back a chord while focus is in the quiz (on the numeral just clicked, say).
$("consQuizUndo").closest(".cons-quiz-module").addEventListener("keydown", event => {
    if (event.key !== "Backspace" || event.target.closest("input, select, textarea")) return;
    if (undoQuizPick()) event.preventDefault();
});
$("consQuizNext").addEventListener("click", () => newQuizQuestion());

$("consPickStrum").addEventListener("click", strumFinder);
$("consPickClear").addEventListener("click", () => {
    finder.picked = [];
    renderFinder();
    renderConsNeck();
});
$("consFoundChords").addEventListener("click", event => {
    const button = event.target.closest("[data-tones]");
    if (button) playFoundChord(button.dataset.tones.split(" "));
});
$("consFoundScales").addEventListener("click", event => {
    const button = event.target.closest("[data-scale]");
    if (!button || !MaestroMusic.ROOTS.includes(button.dataset.root) || !Object.hasOwn(MaestroMusic.SCALES, button.dataset.scale)) return;
    setConsScale({ root: button.dataset.root, scale: button.dataset.scale });
    consSections.show("scales");
});

renderFinder();
renderConsNeck();
