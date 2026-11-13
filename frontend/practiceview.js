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
    if (midis.length) pluckConsNotes(midis, 0.05);
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
    question: null,     // name the note: { string, fret, midi }; intervals: { low, high, semis }
    answered: null,     // the answer given, once given: a pitch class or semitones
    right: 0,
    asked: 0,
    streak: 0,
    timer: null         // the next question, after a right answer
};
const QUIZ_NEXT_AFTER = 900;    // ms a right answer shows before the next question

const quizKind = () => cons.settings.quizKind;
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
        // Intervals: once answered, both notes are shown wherever they are.
        if (answered === null) return null;
        const pc = ((midi % 12) + 12) % 12;
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
            : asked.semis === undefined);
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

function newQuizQuestion({ play = true } = {}) {
    clearTimeout(quiz.timer);
    quiz.timer = null;
    quiz.answered = null;
    if (quizKind() === "note") {
        const spots = quizSpots();
        quiz.question = MaestroMusic.quizNote(spots.pitches, { from: spots.from, to: spots.to, naturals: cons.settings.quizNaturals, avoid: quiz.question?.string !== undefined ? quiz.question : null });
    } else {
        quiz.question = MaestroMusic.quizInterval(quiz.question?.semis ?? 0);
        if (play && consSections.current() === "quiz") playQuizInterval();
    }
    renderQuiz();
    renderConsNeck();
}

function answerQuiz(answer) {
    if (!quiz.question || quiz.answered !== null) return;
    quiz.answered = answer;
    const note = quizKind() === "note";
    const truth = note ? quiz.question.midi % 12 : quiz.question.semis;
    const right = answer === truth;
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
    Object.assign(quiz, { question: null, answered: null, right: 0, asked: 0, streak: 0, timer: null });
}

function renderQuiz() {
    const note = quizKind() === "note";
    document.querySelectorAll("#consQuizKind [data-quiz]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.quiz === quizKind())));
    document.querySelectorAll("#consQuizDirection [data-direction]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.direction === cons.settings.quizDirection)));
    $("consQuizNaturals").checked = cons.settings.quizNaturals;
    $("consQuizNaturalsField").hidden = !note;
    $("consQuizDirectionField").hidden = note;
    $("consQuizHear").hidden = note;
    const position = consPosition();
    $("consQuizTitle").textContent = note ? "Name the Note" : "Intervals by Ear";
    $("consQuizPrompt").textContent = note
        ? (consKeyboard() ? "Which note is this key?" : `Which note is marked?${position ? ` Frets ${position[0]}–${position[1]}` : ""}`)
        : "Which interval was played?";
    const { question, answered } = quiz;
    const truth = !question ? null : note ? question.midi % 12 : question.semis;
    const options = note
        ? MaestroMusic.PLAIN_NAMES.map((name, pc) => ({ value: pc, label: quizNoteName(pc), title: "" })).filter(option => !cons.settings.quizNaturals || MaestroMusic.PLAIN_NAMES[option.value].length === 1)
        : MaestroMusic.QUIZ_INTERVALS.map(interval => ({ value: interval.semis, label: interval.short, title: interval.name }));
    $("consQuizAnswers").classList.toggle("is-notes", note);
    $("consQuizAnswers").replaceChildren(...options.map(option => {
        const button = element("button", "cons-quiz-answer");
        button.type = "button";
        button.dataset.answer = String(option.value);
        button.textContent = option.label;
        if (option.title) button.title = option.title;
        if (answered !== null && option.value === truth) button.classList.add("is-right");
        if (answered !== null && option.value === answered && answered !== truth) button.classList.add("is-wrong");
        button.disabled = answered !== null || !question;
        return button;
    }));
    let result = "";
    if (!question) result = "There's nowhere to ask about here.";
    else if (answered === null) result = note ? "Click its name." : "Click Hear it to hear it again.";
    else {
        const what = note ? quizNoteName(truth) : MaestroMusic.QUIZ_INTERVALS.find(interval => interval.semis === truth).name.toLowerCase();
        result = answered === truth ? `Right: ${what}.` : `It's ${note ? "" : "a "}${what}. Click Next for another.`;
    }
    $("consQuizResult").textContent = result;
    $("consQuizResult").classList.toggle("is-wrong", answered !== null && answered !== truth);
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
    if (button) answerQuiz(Number(button.dataset.answer));
});
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
$("consQuizHear").addEventListener("click", () => { if (quiz.question && quizKind() === "interval") playQuizInterval(); });
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
