"use strict";

// The Theory tab (2.8.0): a twelve-tone row and its matrix, a pitch-class set
// and what it is, and negative harmony in a key. theory.js does the working;
// the neck or the keys pick the set's notes, and every row, set and chord
// plays when clicked.

const THEORY_KEY = "maestro.theory";
const THEORY_ROW_GAP = 0.3;        // seconds between a row's notes
const THEORY_SET_GAP = 0.12;       // and a set's, upward
const THEORY_LOW = 60;             // middle C: a row and a set sound from it

const theory = {
    settings: MaestroTheory.parseSettings(localStorage.getItem(THEORY_KEY)),
    form: { kind: "P", number: 0 },     // the row's form picked in the matrix
    move: { n: 0, inverted: false }     // the set moved: Tn or TnI
};

function saveTheory() {
    try { localStorage.setItem(THEORY_KEY, JSON.stringify(theory.settings)); } catch { /* not kept */ }
}

// A pitch class as the tab writes it: its name, or its number.
const theoryNote = pc => (theory.settings.show === "numbers" ? MaestroTheory.pcDigit(pc) : MaestroMusic.PLAIN_NAMES[((pc % 12) + 12) % 12]);
const theoryRow = () => MaestroTheory.readRow(theory.settings.row);
// Upward from middle C, each note above the last: a line as it's heard.
const theoryRising = pcs => {
    let last = THEORY_LOW - 1;
    return pcs.map(pc => {
        let midi = THEORY_LOW + pc;
        while (midi <= last) midi += 12;
        last = midi;
        return midi;
    });
};
const theoryLine = pcs => pcs.map(pc => THEORY_LOW + pc);

// ---- The neck: a set's notes, everywhere they are; a click adds or takes one out.

consNeckModes.theory = {
    mark(midi) {
        const pc = ((midi % 12) + 12) % 12;
        if (!theory.settings.set.includes(pc)) return { kind: "spot", label: "" };
        return { kind: pc === theory.settings.set[0] ? "root" : "note", label: theoryNote(pc) };
    },
    key(midi) {
        const pc = ((midi % 12) + 12) % 12;
        if (!theory.settings.set.includes(pc)) return null;
        return { kind: pc === theory.settings.set[0] ? "root" : "note", label: theoryNote(pc) };
    },
    nameOf: midi => MaestroMusic.PLAIN_NAMES[((midi % 12) + 12) % 12],
    click(midi) {
        const pc = ((midi % 12) + 12) % 12;
        const set = theory.settings.set;
        if (set.includes(pc)) setTheorySet(set.filter(each => each !== pc));
        else {
            setTheorySet([...set, pc]);
            pluckConsNote(midi);
        }
    },
    render: () => renderTheory(),
    // The short neck in a wide window, as on Progressions, so the matrix fits under it.
    short: true
};

function setTheorySet(pcs) {
    theory.settings.set = [...new Set(pcs.map(pc => ((pc % 12) + 12) % 12))].sort((a, b) => a - b);
    saveTheory();
    renderTheorySet();
    renderConsNeck();
}

// ---- The row and its matrix

function renderTheoryRow() {
    const input = $("theoryRowInput");
    if (document.activeElement !== input) input.value = theory.settings.row;
    const { row, problem } = theoryRow();
    const typed = theory.settings.row.trim() !== "";
    $("theoryRowNote").textContent = !typed ? "Type a row, pick Random, or take the set's notes as its start." : problem;
    $("theoryRowNote").hidden = typed && !problem;
    input.setAttribute("aria-invalid", String(typed && Boolean(problem)));
    renderTheoryRowNotes();
    const matrix = row && MaestroTheory.rowMatrix(row);
    $("theoryMatrix").hidden = !matrix;
    $("theoryForm").hidden = !matrix;
    if (!matrix) {
        $("theoryMatrix").replaceChildren();
        return;
    }
    const { kind, number } = theory.form;
    const picked = (rowKind, index) => {
        if (rowKind === "line") return (kind === "P" || kind === "R") && matrix.prime[index] === number;
        return (kind === "I" || kind === "RI") && matrix.inversion[index] === number;
    };
    const label = (text, formKind, formNumber, title) => {
        const button = element("button", "theory-label", text);
        button.type = "button";
        button.dataset.kind = formKind;
        button.dataset.number = String(formNumber);
        button.title = title;
        button.setAttribute("aria-pressed", String(kind === formKind && number === formNumber));
        return button;
    };
    const cells = [element("span", "theory-corner")];
    matrix.inversion.forEach(n => cells.push(label(`I${n}`, "I", n, `Play I${n}, down this column`)));
    cells.push(element("span", "theory-corner"));
    matrix.cells.forEach((line, r) => {
        const p = matrix.prime[r];
        cells.push(label(`P${p}`, "P", p, `Play P${p}, along this line`));
        line.forEach((pc, c) => {
            const cell = element("span", "theory-cell", theoryNote(pc));
            if (picked("line", r) || picked("column", c)) cell.classList.add("is-picked");
            if (pc === matrix.row[0]) cell.classList.add("is-first");
            cells.push(cell);
        });
        cells.push(label(`R${p}`, "R", p, `Play R${p}, this line backward`));
    });
    cells.push(element("span", "theory-corner"));
    matrix.inversion.forEach(n => cells.push(label(`RI${n}`, "RI", n, `Play RI${n}, up this column`)));
    cells.push(element("span", "theory-corner"));
    $("theoryMatrix").replaceChildren(...cells);

    const form = MaestroTheory.rowForm(row, kind, number);
    $("theoryFormName").textContent = `${kind}${number}`;
    $("theoryFormPlay").title = `Play ${kind}${number}: ${form.map(theoryNote).join(" ")}`;
}

// Until the row is whole, the twelve notes in order: those written, those
// still missing (a click adds one at the end), and any written twice.
function renderTheoryRowNotes() {
    const { row, used, missing, repeated } = theoryRow();
    const strip = $("theoryRowNotes");
    strip.hidden = Boolean(row);
    if (row) {
        strip.replaceChildren();
        return;
    }
    strip.replaceChildren(...Array.from({ length: 12 }, (_, pc) => {
        const chip = element("button", "theory-row-chip", theoryNote(pc));
        chip.type = "button";
        chip.dataset.pc = String(pc);
        const state = repeated.includes(pc) ? "repeated" : used.includes(pc) ? "used" : "missing";
        chip.classList.add(`is-${state}`);
        chip.disabled = state !== "missing";
        chip.title = state === "missing" ? `Add ${theoryNote(pc)}` : state === "repeated" ? `${theoryNote(pc)} is written more than once` : `${theoryNote(pc)} is in the row`;
        return chip;
    }));
    strip.setAttribute("aria-label", missing.length ? `Still missing: ${missing.map(theoryNote).join(" ")}. Click one to add it.` : "Every note is written; one comes twice.");
}

// A missing note added at the row's end, written as the tab writes notes.
function addTheoryRowNote(pc) {
    const text = theory.settings.row.trim();
    setTheoryRow(`${text}${text ? " " : ""}${theoryNote(pc)}`);
}

function playTheoryForm() {
    const { row } = theoryRow();
    if (!row) return;
    pluckConsNotes(theoryLine(MaestroTheory.rowForm(row, theory.form.kind, theory.form.number)), THEORY_ROW_GAP);
}

function pickTheoryForm(kind, number) {
    theory.form = { kind, number };
    renderTheoryRow();
    playTheoryForm();
}

function setTheoryRow(text) {
    theory.settings.row = String(text).slice(0, MaestroTheory.ROW_TEXT_MAX);
    saveTheory();
    if (theoryRow().row) theory.form = { kind: "P", number: 0 };
    renderTheoryRow();
}

function randomTheoryRow() {
    setTheoryRow(MaestroTheory.randomRow().map(pc => theoryNote(pc)).join(" "));
}

// The form picked, as a melody to write against in Counterpoint: quarter
// notes from middle C, in C with no signature.
function writeTheoryForm() {
    const { row } = theoryRow();
    if (!row) return;
    const { kind, number } = theory.form;
    const spelled = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
    const notes = theoryLine(MaestroTheory.rowForm(row, kind, number)).map(midi => ({ p: MaestroNotation.parsePitch(`${spelled[midi % 12]}${Math.floor(midi / 12) - 1}`), d: "q", dot: false, tie: false }));
    const exercise = MaestroCounterpoint.melodyExercise({ tonic: "C", mode: "major", instrument: "concert", notes, title: `Row, ${kind}${number}` });
    if (!exercise) return;
    setCpExercise(exercise);
    consSections.show("counterpoint");
    showToast(`${kind}${number} is in Counterpoint, as a melody.`);
}

// ---- The set

function renderTheorySet() {
    const set = theory.settings.set;
    const input = $("theorySetInput");
    if (document.activeElement !== input) input.value = set.map(theoryNote).join(" ");
    $("theorySetPlay").disabled = $("theorySetClear").disabled = $("theorySetRow").disabled = !set.length;
    const facts = $("theorySetFacts");
    const found = MaestroTheory.setClass(set);
    $("theoryMove").hidden = !found;
    if (!found) {
        facts.replaceChildren();
        $("theorySetNote").textContent = "Pick notes on the neck or keys, or type them.";
        return;
    }
    const list = pcs => pcs.map(theoryNote).join(" ");
    const fact = (term, value, detail = "") => {
        const row = element("div", "theory-fact");
        const dd = element("dd", "", value);
        if (detail) dd.append(element("span", "theory-fact-detail", detail));
        row.append(element("dt", "", term), dd);
        return row;
    };
    const symmetry = found.transpositions === 1 && found.inversions === 0 ? "None: each move makes a new set"
        : `Onto itself ${found.transpositions === 1 ? "" : `by ${found.transpositions} transpositions`}${found.transpositions > 1 && found.inversions ? " and " : ""}${found.inversions ? `by ${found.inversions} ${found.inversions === 1 ? "inversion" : "inversions"}` : ""}`;
    facts.replaceChildren(
        fact("Forte", found.forte || "–", found.known),
        fact("Prime form", `(${found.prime.map(MaestroTheory.pcDigit).join("")})`),
        fact("Normal form", `[${list(found.normal)}]`),
        fact("Interval vector", `⟨${found.vector.join("")}⟩`),
        fact("Z-related", found.z || "None"),
        fact("Complement", found.complement || "–"),
        fact("Symmetry", symmetry)
    );
    $("theorySetNote").textContent = found.pcs.length < 3 ? "Forte named the sets of three to nine notes; two notes are named by their interval class." : "";

    const { n, inverted } = theory.move;
    const moved = MaestroTheory.transformSet(set, n, inverted);
    $("theoryMoveN").value = String(n);
    $("theoryMoveInvert").checked = inverted;
    $("theoryMoveName").textContent = `T${n}${inverted ? "I" : ""}`;
    $("theoryMoved").replaceChildren(...moved.map(pc => element("span", "", theoryNote(pc))));
}

function playTheorySet(pcs) {
    if (pcs.length) pluckConsNotes(theoryRising(pcs), THEORY_SET_GAP);
}

// ---- Negative harmony

function theoryNegKey() {
    return { root: theory.settings.root, scale: theory.settings.scale };
}

function renderTheoryNegative() {
    const key = theoryNegKey();
    $("theoryNegRoot").value = key.root;
    document.querySelectorAll("#theoryNegScale [data-scale]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.scale === key.scale)));
    $("theoryNegSevenths").checked = theory.settings.sevenths;
    const reflected = MaestroTheory.negativeKey(key);
    const chords = MaestroMusic.chordsInKey(key.root, key.scale, theory.settings.sevenths ? 4 : 3);
    const rows = chords.map(chord => {
        const name = chord.name;
        const negative = MaestroTheory.negativeChord(name, key);
        const button = element("button", "theory-neg");
        button.type = "button";
        button.dataset.chord = name;
        button.dataset.negative = negative;
        button.title = `Hear ${name}, then ${negative}`;
        const from = element("span", "theory-neg-from");
        from.append(element("span", "theory-neg-numeral", chord.numeral), chordSymbol(name, "list"));
        const to = element("span", "theory-neg-to");
        to.append(chordSymbol(negative, "list"), element("span", "theory-neg-numeral", reflected ? MaestroHarmony.romanNumeral(negative, reflected) : ""));
        button.append(from, element("span", "theory-neg-arrow", "→"), to);
        return button;
    });
    $("theoryNegatives").replaceChildren(...rows);
    const fifth = MaestroMusic.scaleNotes(key.root, key.scale)[4]?.name ?? "";
    $("theoryNegNote").textContent = `Mirrored across the axis between ${key.root} and ${fifth}, which trade places: ${key.root} ${key.scale} becomes ${key.root} ${reflected?.scale ?? key.scale}. Click a chord to hear it, then its mirror.`;
}

function playTheoryNegative(name, negative) {
    const voiced = chordName => MaestroHarmony.voiceChord(chordName);
    const first = voiced(name), second = negative ? voiced(negative) : [];
    const spread = consChordSpread();
    const starts = [...first.map((_, at) => at * spread), ...second.map((_, at) => 1.1 + at * spread)];
    pluckConsNotes([...first, ...second], starts, [...first.map(() => 1.05), ...second.map(() => null)]);
}

function setTheoryNegKey(changes) {
    Object.assign(theory.settings, changes);
    saveTheory();
    renderTheoryNegative();
}

// ---- The tab

function renderTheory() {
    document.querySelectorAll("#theoryShow [data-theory-show]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.theoryShow === theory.settings.show)));
    // In a narrower window the set and negative harmony take turns.
    document.querySelectorAll(".theory-side-tabs [data-theory-side]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.theorySide === theory.settings.side)));
    $("consTheoryPanel").dataset.side = theory.settings.side;
    renderTheoryRow();
    renderTheorySet();
    renderTheoryNegative();
}

$("theoryNegRoot").replaceChildren(...MaestroMusic.ROOTS.map(root => {
    const option = element("option", "", root);
    option.value = root;
    return option;
}));
$("theoryMoveN").replaceChildren(...Array.from({ length: 12 }, (_, n) => {
    const option = element("option", "", String(n));
    option.value = String(n);
    return option;
}));

document.querySelectorAll("#theoryShow [data-theory-show]").forEach(button => button.addEventListener("click", () => {
    theory.settings.show = button.dataset.theoryShow;
    saveTheory();
    renderTheory();
    renderConsNeck();
}));
document.querySelectorAll(".theory-side-tabs [data-theory-side]").forEach(button => button.addEventListener("click", () => {
    theory.settings.side = button.dataset.theorySide;
    saveTheory();
    renderTheory();
}));
$("theoryRowInput").addEventListener("input", () => setTheoryRow($("theoryRowInput").value));
$("theoryRowInput").addEventListener("change", () => renderTheoryRow());
$("theoryRandom").addEventListener("click", randomTheoryRow);
$("theoryRowNotes").addEventListener("click", event => {
    const chip = event.target.closest("[data-pc]");
    if (chip && !chip.disabled) addTheoryRowNote(Number(chip.dataset.pc));
});
$("theoryMatrix").addEventListener("click", event => {
    const button = event.target.closest("[data-kind]");
    if (button) pickTheoryForm(button.dataset.kind, Number(button.dataset.number));
});
$("theoryFormPlay").addEventListener("click", playTheoryForm);
$("theoryFormWrite").addEventListener("click", writeTheoryForm);

$("theorySetInput").addEventListener("input", () => {
    const { pcs } = MaestroTheory.readPcs($("theorySetInput").value);
    setTheorySet(pcs);
});
$("theorySetInput").addEventListener("change", () => renderTheorySet());
$("theorySetPlay").addEventListener("click", () => playTheorySet(theory.settings.set));
$("theorySetClear").addEventListener("click", () => setTheorySet([]));
// The set's notes, in the order picked, start a row to finish.
$("theorySetRow").addEventListener("click", () => setTheoryRow(theory.settings.set.map(theoryNote).join(" ")));
$("theoryMoveN").addEventListener("change", () => { theory.move.n = Number($("theoryMoveN").value) || 0; renderTheorySet(); });
$("theoryMoveInvert").addEventListener("change", () => { theory.move.inverted = $("theoryMoveInvert").checked; renderTheorySet(); });
$("theoryMovePlay").addEventListener("click", () => playTheorySet(MaestroTheory.transformSet(theory.settings.set, theory.move.n, theory.move.inverted)));
$("theoryMoveTake").addEventListener("click", () => setTheorySet(MaestroTheory.transformSet(theory.settings.set, theory.move.n, theory.move.inverted)));

$("theoryNegRoot").addEventListener("change", () => { if (MaestroMusic.ROOTS.includes($("theoryNegRoot").value)) setTheoryNegKey({ root: $("theoryNegRoot").value }); });
document.querySelectorAll("#theoryNegScale [data-scale]").forEach(button => button.addEventListener("click", () => setTheoryNegKey({ scale: button.dataset.scale })));
$("theoryNegSevenths").addEventListener("change", () => setTheoryNegKey({ sevenths: $("theoryNegSevenths").checked }));
$("theoryNegatives").addEventListener("click", event => {
    const button = event.target.closest("[data-chord]");
    if (button) playTheoryNegative(button.dataset.chord, button.dataset.negative);
});
