"use strict";

// The Conservatory's Finder and Quiz (2.3.0). Each takes over the neck while
// its section shows: Finder marks the notes you pick and lists the chords and
// scales that hold them; Quiz asks you to name a note, or an interval by ear.
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
    $("consFinderHint").textContent = consKeyboard()
        ? "Click keys to pick them, and again to drop one. The lowest is the bass."
        : "Click a fret on each string you'd play, as you'd finger the chord; another fret moves it, the same one clears the string. The lowest note is the bass.";

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

// ---- Quiz

const quiz = {
    // name the note: { string, fret, midi }; intervals: { low, high, semis };
    // chords (2.4.0): { id, root, name, midis }; progressions: music.js's quizProgression
    question: null,
    answered: null,     // the answer given, once given: a pitch class, semitones, a quality's id, or the degrees picked
    picks: [],          // a progression's degrees picked so far
    right: 0,
    asked: 0,
    streak: 0,
    timer: null         // the next question, after a right answer
};
const QUIZ_NEXT_AFTER = 900;    // ms a right answer shows before the next question

const quizKind = () => cons.settings.quizKind;
const QUIZ_TITLES = Object.freeze({ note: "Name the Note", interval: "Intervals by Ear", quality: "Chords by Ear", progression: "Progressions by Ear" });
const QUIZ_CHORD_GAP = 1.1;     // seconds between a progression's chords
// What a question's right answer is, as answers are given.
function quizTruth(question = quiz.question) {
    if (!question) return null;
    switch (quizKind()) {
        case "note": return question.midi % 12;
        case "interval": return question.semis;
        case "quality": return question.id;
        default: return question.degrees.slice(1);
    }
}
const quizIsRight = answer => JSON.stringify(answer) === JSON.stringify(quizTruth());
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
        // Intervals and chords: once answered, their notes are shown wherever they are.
        if (answered === null || quizKind() === "progression") return null;
        const pc = ((midi % 12) + 12) % 12;
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
        if (answered === null || (midi !== question.low && midi !== question.high)) return null;
        return { kind: midi === question.low ? "root" : "note", label: MaestroMusic.PLAIN_NAMES[midi % 12] };
    },
    // Nothing is given away by a tooltip before it's answered.
    nameOf: midi => quiz.answered === null ? "?" : finderName(midi),
    click: midi => pluckConsNote(midi),
    lit: () => quizKind() === "note" && !consKeyboard() ? consPosition() : null,
    // A question from another quiz, instrument or position is replaced.
    render: () => {
        const spots = quizSpots();
        const asked = quiz.question;
        const stale = !asked || (quizKind() === "note"
            ? asked.string === undefined || asked.string >= spots.pitches.length || asked.fret < spots.from || asked.fret > spots.to || spots.pitches[asked.string] + asked.fret !== asked.midi
            : quizKind() === "interval" ? asked.semis === undefined
            : quizKind() === "quality" ? asked.id === undefined
            : asked.degrees === undefined);
        if (stale) newQuizQuestion({ play: false });
        else renderQuiz();
    }
};

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
    if (kind === "quality") {
        const { midis } = quiz.question;
        const direction = cons.settings.quizDirection;
        if (direction === "together") pluckConsNotes(midis, 0.012);
        else pluckConsNotes(direction === "down" ? [...midis].reverse() : midis, 0.45);
        return;
    }
    const notes = [], starts = [], ends = [];
    let before = null;
    quiz.question.chords.forEach((name, at) => {
        const voiced = MaestroHarmony.voiceChord(name, before);
        before = voiced;
        voiced.forEach((midi, index) => {
            notes.push(midi);
            starts.push(at * QUIZ_CHORD_GAP + index * 0.012);
            ends.push(at < quiz.question.chords.length - 1 ? (at + 1) * QUIZ_CHORD_GAP : null);
        });
    });
    pluckConsNotes(notes, starts, ends);
}

function newQuizQuestion({ play = true } = {}) {
    clearTimeout(quiz.timer);
    quiz.timer = null;
    quiz.answered = null;
    quiz.picks = [];
    const kind = quizKind();
    if (kind === "note") {
        const spots = quizSpots();
        quiz.question = MaestroMusic.quizNote(spots.pitches, { from: spots.from, to: spots.to, naturals: cons.settings.quizNaturals, avoid: quiz.question?.string !== undefined ? quiz.question : null });
    } else {
        quiz.question = kind === "interval" ? MaestroMusic.quizInterval(quiz.question?.semis ?? 0)
            : kind === "quality" ? MaestroMusic.quizQuality(cons.settings.quizChords, quiz.question?.id ?? "")
            : MaestroMusic.quizProgression(cons.settings.quizChords, quiz.question?.index ?? -1);
        if (play && consSections.current() === "quiz") playQuizQuestion();
    }
    renderQuiz();
    renderConsNeck();
}

// A progression's last chord named, taken back before the third grades it.
function undoQuizPick() {
    if (quizKind() !== "progression" || !quiz.question || quiz.answered !== null || !quiz.picks.length) return false;
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
    // A progression's chords are named one at a time; the third is the answer.
    if (quizKind() === "progression") {
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
    renderQuiz();
    renderConsNeck();
    if (right) quiz.timer = setTimeout(() => { if (consSections.current() === "quiz") newQuizQuestion(); }, QUIZ_NEXT_AFTER);
}

function resetQuizScore() {
    clearTimeout(quiz.timer);
    Object.assign(quiz, { question: null, answered: null, picks: [], right: 0, asked: 0, streak: 0, timer: null });
}

function renderQuiz() {
    const kind = quizKind();
    const note = kind === "note";
    const chords = kind === "quality" || kind === "progression";
    document.querySelectorAll("#consQuizKind [data-quiz]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.quiz === kind)));
    document.querySelectorAll("#consQuizDirection [data-direction]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.direction === cons.settings.quizDirection)));
    document.querySelectorAll("#consQuizChords [data-chords]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.chords === cons.settings.quizChords)));
    $("consQuizNaturals").checked = cons.settings.quizNaturals;
    $("consQuizNaturalsField").hidden = !note;
    $("consQuizDirectionField").hidden = note || kind === "progression";
    $("consQuizChordsField").hidden = !chords;
    $("consQuizHear").hidden = note;
    // Shown throughout a progression question, so the buttons beside it never move.
    $("consQuizUndo").hidden = kind !== "progression";
    $("consQuizUndo").disabled = !quiz.question || quiz.answered !== null || !quiz.picks.length;
    const position = consPosition();
    $("consQuizTitle").textContent = QUIZ_TITLES[kind];
    $("consQuizPrompt").textContent = note
        ? (consKeyboard() ? "Which note is this key?" : `Which note is marked?${position ? ` Frets ${position[0]}–${position[1]}` : ""}`)
        : kind === "interval" ? "Which interval was played?"
        : kind === "quality" ? "Which chord was played?"
        : "Four chords in a major key, from I. Name the other three, in order.";
    const { question, answered } = quiz;
    const truth = quizTruth();
    const options = note
        ? MaestroMusic.PLAIN_NAMES.map((name, pc) => ({ value: pc, label: quizNoteName(pc), title: "" })).filter(option => !cons.settings.quizNaturals || MaestroMusic.PLAIN_NAMES[option.value].length === 1)
        : kind === "interval" ? MaestroMusic.QUIZ_INTERVALS.map(interval => ({ value: interval.semis, label: interval.short, title: interval.name }))
        : kind === "quality" ? MaestroMusic.QUIZ_QUALITIES.filter(quality => cons.settings.quizChords === "both" || quality.set === cons.settings.quizChords).map(quality => ({ value: quality.id, label: quality.short, title: quality.name }))
        : (question?.numerals ?? []).map((numeral, degree) => ({ value: degree, label: numeral, title: "" }));
    // A progression's chords so far, as numerals: "I – vi – ? – ?".
    $("consQuizLine").hidden = kind !== "progression" || !question;
    if (kind === "progression" && question) {
        const shown = [question.numerals[0], ...[0, 1, 2].map(at => quiz.picks[at] === undefined ? "?" : question.numerals[quiz.picks[at]])];
        $("consQuizLine").replaceChildren(...shown.flatMap((text, at) => {
            const part = element("span", "cons-quiz-step", text);
            if (answered !== null && at > 0) part.classList.add(quiz.picks[at - 1] === truth[at - 1] ? "is-right" : "is-wrong");
            return at ? [element("span", "cons-quiz-dash", "\u2013"), part] : [part];
        }));
    }
    $("consQuizAnswers").classList.toggle("is-notes", note);
    $("consQuizAnswers").classList.toggle("is-numerals", kind === "progression");
    $("consQuizAnswers").replaceChildren(...options.map(option => {
        const button = element("button", "cons-quiz-answer");
        button.type = "button";
        button.dataset.answer = String(option.value);
        button.textContent = option.label;
        if (option.title) button.title = option.title;
        if (answered !== null && kind !== "progression" && option.value === truth) button.classList.add("is-right");
        if (answered !== null && kind !== "progression" && option.value === answered && answered !== truth) button.classList.add("is-wrong");
        button.disabled = answered !== null || !question;
        return button;
    }));
    let result = "";
    if (!question) result = "There's nowhere to ask about here.";
    else if (answered === null) result = note ? "Click its name." : "Click Hear it to hear it again.";
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
if (consSections.current() === "quiz") consNeckModes.quiz.render();
renderConsNeck();
