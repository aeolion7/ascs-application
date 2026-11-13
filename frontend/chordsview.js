// The Conservatory's Chords tab (2.3.0): a chord built on five frets of the
// neck (or on the keys), named from its notes or by you, set as a symbol and
// on a staff, and kept in a library that AHK saves in data\chords.ini.

const CHORD_FRETS = 5;
const CHORD_WHEEL_STEP = 60;     // sideways scrolling that moves the frets by one
const chords = {
    shape: [],          // a stringed chord: a fret, or null (not played), per string
    keys: [],           // a keyboard chord: its keys
    start: 1,           // the first of the five frets shown
    typed: "",          // a name typed, kept over the one found
    editing: -1,        // the saved chord open, by its place in the library
    fitted: "",         // the instrument and tuning the chord is for
    library: null,      // the saved chords, once AHK has sent them
    asked: false,
    search: "",
    root: -1,
    wheel: 0
};

const chordInstrument = () => MaestroMusic.INSTRUMENTS[cons.settings.instrument];
const chordTuning = () => MaestroMusic.currentTuning(cons.settings);

// A new instrument or tuning starts a new chord.
function fitChord() {
    const tuning = consKeyboard() ? [] : chordTuning().pitches;
    const fitted = `${cons.settings.instrument}:${tuning.join(" ")}`;
    if (chords.fitted === fitted) return;
    chords.fitted = fitted;
    clearChord();
}

function clearChord() {
    chords.shape = consKeyboard() ? [] : chordTuning().pitches.map(() => null);
    chords.keys = [];
    chords.start = 1;
    chords.typed = "";
    chords.editing = -1;
    $("consChordName").value = "";
}

// The chord's notes, low to high, each once.
function chordNotes() {
    return consKeyboard()
        ? [...chords.keys].sort((a, b) => a - b)
        : MaestroMusic.savedChordNotes({ instrument: cons.settings.instrument, tuning: chordTuning().pitches, shape: chords.shape });
}

// Every chord its notes make, the bass's first.
function chordReadings() {
    const pitches = [...new Set(chordNotes().map(midi => midi % 12))];
    return MaestroMusic.findChords(pitches);
}

// The name shown: the one typed, or the first reading.
const chordName = () => chords.typed || chordReadings()[0]?.name || "";

// Each note's name as the chord spells it: the reading named, or the first.
function chordSpelling() {
    const readings = chordReadings();
    const reading = readings.find(each => each.name === chordName()) ?? readings[0];
    const names = new Map();
    for (const tone of reading?.tones ?? []) names.set(MaestroMusic.pitchClass(tone), tone);
    return {
        nameOf: midi => names.get(midi % 12) ?? MaestroMusic.PLAIN_NAMES[midi % 12],
        root: reading ? MaestroMusic.pitchClass(reading.root) : -1
    };
}

// ---- The neck: five frets, and the nut's open or muted strings.

function drawChordNeck(spelling) {
    const tuning = chordTuning();
    const strings = tuning.pitches.length;
    const frets = chordInstrument().frets;
    const lefty = cons.settings.lefty;
    const width = 1440, left = 150, right = 16, top = 30;
    const gap = strings >= 6 ? 46 : strings === 5 ? 50 : 56;
    const bottom = top + gap * (strings - 1);
    const height = bottom + 64;
    const fretWidth = (width - left - right) / CHORD_FRETS;
    const flip = x => lefty ? width - x : x;
    const middle = column => flip(left + fretWidth * (column + 0.5));
    const stringY = index => top + gap * (strings - 1 - index);
    const svg = svgNode("svg", { class: "cons-neck cons-chord-neck", viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": `${chordInstrument().label} neck, frets ${chords.start} to ${chords.start + CHORD_FRETS - 1}` });
    svg.append(svgNode("rect", { class: "cons-board", x: lefty ? right : left, y: top - 18, width: width - left - right, height: bottom - top + 36, rx: 6 }));
    for (let column = 0; column < CHORD_FRETS; column++) {
        const fret = chords.start + column;
        if ([3, 5, 7, 9, 15, 17, 19, 21].includes(fret)) svg.append(svgNode("circle", { class: "cons-inlay", cx: middle(column), cy: (top + bottom) / 2, r: 11 }));
        if (fret === 12) [-1, 1].forEach(side => svg.append(svgNode("circle", { class: "cons-inlay", cx: middle(column), cy: (top + bottom) / 2 + side * gap, r: 11 })));
        const number = svgNode("text", { class: "cons-fret-number", x: middle(column), y: height - 8 });
        number.textContent = String(fret);
        svg.append(number);
    }
    for (let line = 0; line <= CHORD_FRETS; line++) {
        const x = flip(left + fretWidth * line);
        svg.append(svgNode("line", { class: line === 0 && chords.start === 1 ? "cons-nut" : "cons-fret", x1: x, y1: top - 18, x2: x, y2: bottom + 18 }));
    }
    tuning.pitches.forEach((_, index) => {
        svg.append(svgNode("line", { class: "cons-string", x1: flip(left - 70), y1: stringY(index), x2: flip(width - right), y2: stringY(index), "stroke-width": (1.4 + (strings - 1 - index) * 0.6).toFixed(1) }));
    });
    const radius = 21;
    const dot = (kind, x, y, midi, index, fret, label, title) => {
        const group = svgNode("g", { class: `cons-dot is-${kind}`, "data-midi": midi, "data-string": index, "data-fret": fret });
        const tip = svgNode("title", {});
        tip.textContent = title;
        group.append(tip, svgNode("circle", { cx: x, cy: y, r: radius }));
        if (label) {
            const text = svgNode("text", { x, y: y + 7 });
            text.textContent = label;
            group.append(text);
        }
        svg.append(group);
    };
    tuning.pitches.forEach((open, index) => {
        const fret = chords.shape[index];
        const y = stringY(index);
        const number = strings - index;
        const kindOf = midi => midi % 12 === spelling.root ? "root" : "note";
        // At the nut: muted, or open with its name.
        if (fret === null) {
            const mute = svgNode("g", { class: "cons-dot is-muted", "data-midi": open, "data-string": index, "data-fret": 0 });
            const tip = svgNode("title", {});
            tip.textContent = `String ${number}, not played. Click to play it open.`;
            const mark = svgNode("text", { x: flip(left - 40), y: y + 11 });
            mark.textContent = "\u00D7";
            mute.append(tip, svgNode("circle", { cx: flip(left - 40), cy: y, r: radius }), mark);
            svg.append(mute);
        } else if (fret === 0) {
            dot(kindOf(open), flip(left - 40), y, open, index, 0, spelling.nameOf(open), `${MaestroMusic.spelledPitch(open, spelling.nameOf(open))}, string ${number}, open. Click to leave it out.`);
        } else {
            dot("spot", flip(left - 40), y, open, index, 0, "", `String ${number}: click to play it open.`);
        }
        for (let column = 0; column < CHORD_FRETS; column++) {
            const here = chords.start + column;
            const midi = open + here;
            const picked = fret === here;
            dot(picked ? kindOf(midi) : "spot", middle(column), y, midi, index, here,
                picked ? spelling.nameOf(midi) : "",
                `${MaestroMusic.spelledPitch(midi, spelling.nameOf(midi))}, string ${number}, fret ${here}${picked ? ". Click to leave it out." : ""}`);
        }
        // A fret out of view: a marker at the edge that brings it in.
        if (fret > 0 && (fret < chords.start || fret >= chords.start + CHORD_FRETS)) {
            const below = fret < chords.start;
            const x = flip(below ? left + 30 : width - right - 30);
            const off = svgNode("g", { class: "cons-off", "data-chord-jump": fret });
            const tip = svgNode("title", {});
            tip.textContent = `String ${number} is at fret ${fret}. Click to show it.`;
            const text = svgNode("text", { x, y: y + 6 });
            text.textContent = below === !lefty ? `\u2039 ${fret}` : `${fret} \u203A`;
            off.append(tip, svgNode("rect", { x: x - 30, y: y - 16, width: 60, height: 32, rx: 16 }), text);
            svg.append(off);
        }
    });
    return svg;
}

// The whole neck, small, with the five frets shown lit; click to move them.
function drawChordMap() {
    const frets = chordInstrument().frets;
    const width = 520, height = 34, left = 10;
    const fretWidth = (width - 20) / frets;
    const lefty = cons.settings.lefty;
    const x = fret => lefty ? width - (left + fretWidth * fret) : left + fretWidth * fret;
    const svg = svgNode("svg", { class: "cons-map", viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": `Frets ${chords.start} to ${chords.start + CHORD_FRETS - 1} of ${frets}. Click to move there.` });
    svg.append(svgNode("rect", { class: "cons-map-board", x: left, y: 8, width: width - 20, height: 18, rx: 4 }));
    const from = x(chords.start - 1), to = x(chords.start - 1 + CHORD_FRETS);
    svg.append(svgNode("rect", { class: "cons-map-window", x: Math.min(from, to), y: 3, width: Math.abs(to - from), height: 28, rx: 6 }));
    for (let fret = 1; fret < frets; fret++) svg.append(svgNode("line", { class: "cons-map-fret", x1: x(fret), x2: x(fret), y1: 10, y2: 24 }));
    [3, 5, 7, 9, 15, 17, 19, 21].filter(fret => fret <= frets).forEach(fret => svg.append(svgNode("circle", { class: "cons-map-inlay", cx: x(fret - 0.5), cy: 17, r: 2.5 })));
    if (frets >= 12) [-1, 1].forEach(side => svg.append(svgNode("circle", { class: "cons-map-inlay", cx: x(11.5), cy: 17 + side * 4, r: 2.5 })));
    // The shape's notes, as dots on the map.
    chords.shape.forEach(fret => {
        if (fret > 0) svg.append(svgNode("circle", { class: "cons-map-note", cx: x(fret - 0.5), cy: 17, r: 3.5 }));
    });
    return svg;
}

// ---- The staff

const STAFF_SIZE = 58;                       // Bravura Text's size: a staff space is a fifth of it
const STAFF_SPACE = STAFF_SIZE / 5;
const STAFF_HALF = STAFF_SPACE / 2;
const STAFF_SCALE = 1.45;                     // on the page, each unit drawn this large
const STAFF_GLYPHS = Object.freeze({
    treble: "\uE050", treble8: "\uE052", bass: "\uE062", bass8: "\uE064", brace: "\uE000",
    whole: "\uE0A2", sharp: "\uE262", flat: "\uE260", natural: "\uE261", doubleSharp: "\uE263", doubleFlat: "\uE264"
});
const ACCIDENTAL_GLYPH = { "-2": STAFF_GLYPHS.doubleFlat, "-1": STAFF_GLYPHS.flat, "0": STAFF_GLYPHS.natural, "1": STAFF_GLYPHS.sharp, "2": STAFF_GLYPHS.doubleSharp };

// How an instrument's chord is written: guitar and bass an octave above how
// they sound, with an 8 under the clef; mandolin and ukulele as they sound;
// a keyboard on two staves, split at middle C.
const STAFF_WRITING = Object.freeze({
    guitar: { clef: "treble8", staff: "treble", shift: 12 },
    bass: { clef: "bass8", staff: "bass", shift: 12 },
    mandolin: { clef: "treble", staff: "treble", shift: 0 },
    ukulele: { clef: "treble", staff: "treble", shift: 0 }
});

// One staff's chord, drawn at y (its bottom line) from x; returns its right edge.
function drawStaffChord(svg, notes, staff, y, headX) {
    const { heads, ledgers } = MaestroMusic.staffChord(notes, MaestroMusic.STAFF_BOTTOM[staff]);
    const headWidth = 0.338 * STAFF_SIZE;
    const centerY = position => y - position * STAFF_HALF;
    const glyph = (character, x, position) => {
        const text = svgNode("text", { class: "staff-glyph", x, y: centerY(position) + 0.4 * STAFF_SIZE });
        text.textContent = character;
        svg.append(text);
    };
    const wide = heads.some(head => head.right);
    for (const position of ledgers) {
        svg.append(svgNode("line", { class: "staff-ledger", x1: headX - 7, x2: headX + headWidth + 7 + (wide ? headWidth : 0), y1: centerY(position), y2: centerY(position) }));
    }
    for (const head of heads) {
        if (head.column >= 0) glyph(ACCIDENTAL_GLYPH[String(head.alter)] ?? STAFF_GLYPHS.natural, headX - 24 - head.column * 20, head.position);
        glyph(STAFF_GLYPHS.whole, headX + (head.right ? headWidth - 1.5 : 0), head.position);
    }
    return headX + headWidth * (wide ? 2 : 1);
}

function staffLines(svg, y, x1, x2) {
    for (let line = 0; line < 5; line++) svg.append(svgNode("line", { class: "staff-line", x1, x2, y1: y - line * STAFF_SPACE, y2: y - line * STAFF_SPACE }));
}

function drawChordStaff(notes, nameOf) {
    const written = (midi, shift) => MaestroMusic.staffStep(midi + shift, nameOf(midi));
    const keyboard = consKeyboard();
    const parts = keyboard
        ? [{ clef: "treble", staff: "treble", y: 0, notes: notes.filter(midi => midi >= 60).map(midi => written(midi, 0)) },
            { clef: "bass", staff: "bass", y: 11 * STAFF_SPACE, notes: notes.filter(midi => midi < 60).map(midi => written(midi, 0)) }]
        : [{ ...STAFF_WRITING[cons.settings.instrument], y: 0 }].map(part => ({ ...part, notes: notes.map(midi => written(midi, part.shift)) }));
    // Room for the accidentals' columns, before the notes.
    const columns = Math.max(0, ...parts.map(part => MaestroMusic.staffChord(part.notes, MaestroMusic.STAFF_BOTTOM[part.staff]).columns));
    const clefX = keyboard ? 34 : 14;
    const headX = clefX + 0.56 * STAFF_SIZE + 26 + columns * 20 + (columns ? 10 : 0);
    const width = Math.max(240, headX + 2 * 0.338 * STAFF_SIZE + 40);
    // Above and below: the clefs, and any notes on ledger lines.
    let top = -1.12 * STAFF_SIZE, bottom = 0.92 * STAFF_SIZE;
    for (const part of parts) {
        const { heads } = MaestroMusic.staffChord(part.notes, MaestroMusic.STAFF_BOTTOM[part.staff]);
        top = Math.min(top, part.y - 1.12 * STAFF_SIZE, ...heads.map(head => part.y - head.position * STAFF_HALF - STAFF_SPACE));
        bottom = Math.max(bottom, part.y + 0.92 * STAFF_SIZE, ...heads.map(head => part.y - head.position * STAFF_HALF + STAFF_SPACE));
    }
    const height = bottom - top;
    const svg = svgNode("svg", { class: "cons-staff", viewBox: `0 ${top} ${width} ${height}`, width: Math.round(width * STAFF_SCALE), height: Math.round(height * STAFF_SCALE), role: "img" });
    for (const part of parts) {
        staffLines(svg, part.y, keyboard ? 26 : 4, width - 6);
        const clef = svgNode("text", { class: "staff-glyph", x: clefX, y: part.y });
        clef.textContent = STAFF_GLYPHS[part.clef];
        svg.append(clef);
        drawStaffChord(svg, part.notes, part.staff, part.y, headX);
    }
    if (keyboard) {
        // The brace and the line that join the two staves.
        const from = -4 * STAFF_SPACE, to = parts[1].y;
        svg.append(svgNode("line", { class: "staff-system", x1: 26, x2: 26, y1: from, y2: to }));
        const brace = svgNode("text", { class: "staff-glyph", x: 0, y: 0, transform: `translate(4 ${to}) scale(${((to - from) / (0.8 * STAFF_SIZE)).toFixed(3)})` });
        brace.textContent = STAFF_GLYPHS.brace;
        svg.append(brace);
    }
    const names = notes.map(midi => MaestroMusic.spelledPitch(midi, nameOf(midi)));
    svg.setAttribute("aria-label", notes.length ? `On a staff: ${names.join(", ")}` : "An empty staff");
    return svg;
}

// ---- The neck module in Chords: the neck (or keys), and the chord as written.

function drawChordEditor() {
    fitChord();
    const spelling = chordSpelling();
    const notes = chordNotes();
    const editor = element("div", "cons-chord-editor");
    const side = element("div", "cons-chord-neckside");
    if (consKeyboard()) {
        const { low, high } = MaestroMusic.INSTRUMENTS.keyboard;
        side.append(drawConsKeys(low, high, midi => chords.keys.includes(midi)
            ? { kind: midi % 12 === spelling.root ? "root" : "note", label: spelling.nameOf(midi) } : null, "Keyboard", spelling.nameOf));
    } else {
        side.append(drawChordNeck(spelling));
        const move = element("div", "cons-chord-move");
        const back = element("button", "secondary cons-move-button");
        back.type = "button";
        back.dataset.chordMove = "-1";
        back.append(MaestroIcons.create(cons.settings.lefty ? "chevron-right" : "chevron-left"));
        back.setAttribute("aria-label", "Toward the nut");
        back.disabled = chords.start <= 1;
        const on = element("button", "secondary cons-move-button");
        on.type = "button";
        on.dataset.chordMove = "1";
        on.append(MaestroIcons.create(cons.settings.lefty ? "chevron-left" : "chevron-right"));
        on.setAttribute("aria-label", "Toward the body");
        on.disabled = chords.start >= chordInstrument().frets - CHORD_FRETS + 1;
        move.append(back, drawChordMap(), on, element("span", "cons-note-inline", `Frets ${chords.start}\u2013${chords.start + CHORD_FRETS - 1}. Scroll sideways to move.`));
        side.append(move);
    }
    const card = element("div", "cons-chord-card");
    const name = chordName();
    if (name) card.append(chordSymbol(name, "big"));
    else card.append(element("p", "cons-chord-empty", notes.length ? "No chord has these notes." : "Pick notes to build a chord."));
    card.append(drawChordStaff(notes, spelling.nameOf));
    editor.append(side, card);
    return editor;
}

// ---- The panel below: the name, the readings and the library.

function renderChordPanel() {
    fitChord();
    if (!chords.asked) {
        chords.asked = true;
        send("GetChords");
    }
    const notes = chordNotes();
    const spelling = chordSpelling();
    const readings = chordReadings();
    const name = chordName();
    const input = $("consChordName");
    if (document.activeElement !== input) input.value = chords.typed;
    input.placeholder = readings[0]?.name ?? "Name";
    $("consChordSave").textContent = chords.editing >= 0 ? "Save changes" : "Save chord";
    $("consChordSave").disabled = !notes.length || !name || chords.library === null;
    $("consChordSaveNew").hidden = chords.editing < 0;
    $("consChordSaveNew").disabled = $("consChordSave").disabled;
    $("consChordStrum").disabled = $("consChordClear").disabled = !notes.length && chords.editing < 0;
    document.querySelectorAll("#consChordStyle [data-chord-style]").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.chordStyle === cons.settings.chordStyle));
        button.replaceChildren(chordSymbol("Cmaj7", "list", button.dataset.chordStyle));
    });

    const facts = [];
    if (!consKeyboard()) {
        const frets = element("span", "cons-fact-value", chords.shape.map(fret => fret === null ? "\u00D7" : String(fret)).join(" "));
        frets.setAttribute("aria-label", chords.shape.map((fret, index) => `string ${chords.shape.length - index} ${fret === null ? "not played" : fret === 0 ? "open" : `fret ${fret}`}`).join(", "));
        facts.push(["Frets, low string first", frets]);
    }
    const noteList = element("span", "cons-fact-value");
    notes.forEach(midi => noteList.append(element("span", "", spelling.nameOf(midi))));
    if (!notes.length) noteList.append(element("span", "is-none", "None yet"));
    facts.push(["Notes, low to high", noteList]);
    $("consChordFacts").replaceChildren(...facts.map(([label, value]) => {
        const fact = element("p", "cons-chord-fact");
        fact.append(element("span", "cons-choice-label", label), value);
        return fact;
    }));

    $("consChordReadings").replaceChildren(...(readings.length ? [element("span", "cons-choice-label", "Readings")] : []), ...readings.slice(0, 8).map(reading => {
        const button = element("button", "cons-reading");
        button.type = "button";
        button.dataset.reading = reading.name;
        button.setAttribute("aria-pressed", String(reading.name === name));
        button.title = `Name it ${reading.name}: ${reading.tones.join(" ")}`;
        button.append(chordSymbol(reading.name, "list"));
        return button;
    }));
    $("consChordNote").textContent = !notes.length
        ? (consKeyboard() ? "Click keys to build a chord, and again to drop one." : "Click a fret on each string you'd play. Click the nut for an open string, and a note again to leave its string out.")
        : chords.typed ? "Your name is kept. Clear it to use the one found."
        : readings.length ? "Named from its notes. Type a name, or pick a reading."
        : "No chord Maestro knows has these notes. Name it to save it.";
    renderChordLibrary();
}

const savedRoot = chord => {
    const match = /^([A-G](?:\u266D|\u266F)?)/.exec(chord.name);
    return match ? MaestroMusic.pitchClass(match[1]) : -1;
};

function renderChordLibrary() {
    const list = $("consSaved");
    if (chords.library === null) {
        list.replaceChildren(placeholderItem("list", 2));
        $("consSavedNote").textContent = "";
        return;
    }
    const instrument = cons.settings.instrument;
    const mine = chords.library.map((chord, index) => ({ chord, index })).filter(({ chord }) => chord.instrument === instrument);
    const query = MaestroMusic.cleanChordName(chords.search).toLowerCase();
    const shown = mine.filter(({ chord }) => (!query || chord.name.toLowerCase().includes(query)) && (chords.root < 0 || savedRoot(chord) === chords.root));
    const label = MaestroMusic.INSTRUMENTS[instrument].label.toLowerCase();
    list.replaceChildren(...shown.map(({ chord, index }) => {
        const item = element("li", `cons-saved-card${index === chords.editing ? " is-open" : ""}`);
        const open = element("button", "cons-saved-open");
        open.type = "button";
        open.dataset.savedOpen = String(index);
        open.title = `Open ${chord.name}, and hear it`;
        // The symbol (and a tuning other than the one chosen) beside the shape.
        const label = element("span", "cons-saved-label");
        label.append(chordSymbol(chord.name, "small"));
        open.append(label);
        if (instrument === "keyboard") {
            open.append(element("span", "cons-saved-keys", MaestroMusic.savedChordNotes(chord).map(midi => MaestroMusic.PLAIN_NAMES[midi % 12]).join(" ")));
        } else {
            open.append(drawMiniShape(chord));
            const tuning = MaestroMusic.tuningsFor(instrument, cons.settings.own).find(each => each.pitches.join(" ") === chord.tuning.join(" "));
            if (tuning?.id !== chordTuning().id) label.append(element("span", "cons-saved-tuning", tuning ? `In ${tuning.label}` : "In a tuning since deleted"));
        }
        const remove = element("button", "quiet cons-saved-delete");
        remove.type = "button";
        remove.dataset.savedDelete = String(index);
        remove.setAttribute("aria-label", `Delete ${chord.name}`);
        remove.title = `Delete ${chord.name}`;
        remove.append(MaestroIcons.create("close"));
        item.append(open, remove);
        return item;
    }));
    $("consSavedCount").textContent = shown.length === mine.length ? `${mine.length} for ${label}` : `${shown.length} of ${mine.length}`;
    $("consSavedNote").textContent = !mine.length ? `No chords saved for ${label} yet. Build one above and save it.`
        : !shown.length ? "None match." : "";
}

// A saved shape, small: its frets from where it starts.
function drawMiniShape(chord) {
    const strings = chord.tuning.length;
    const frets = MaestroMusic.INSTRUMENTS[chord.instrument].frets;
    const start = MaestroMusic.shapeStart(chord.shape, frets);
    const span = Math.max(CHORD_FRETS, ...chord.shape.filter(fret => fret > 0).map(fret => fret - start + 1));
    const width = 220, left = 26, gap = 13, top = 10;
    const height = top + gap * (strings - 1) + 26;
    const fretWidth = (width - left - 6) / span;
    const lefty = cons.settings.lefty;
    const flip = x => lefty ? width - x : x;
    const svg = svgNode("svg", { class: "cons-mini", viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": chord.shape.map(fret => fret === null ? "x" : fret).join(" ") });
    for (let line = 0; line <= span; line++) svg.append(svgNode("line", { class: line === 0 && start === 1 ? "cons-mini-nut" : "cons-mini-fret", x1: flip(left + fretWidth * line), x2: flip(left + fretWidth * line), y1: top - 4, y2: top + gap * (strings - 1) + 4 }));
    for (let index = 0; index < strings; index++) svg.append(svgNode("line", { class: "cons-mini-string", x1: flip(left), x2: flip(width - 6), y1: top + gap * (strings - 1 - index), y2: top + gap * (strings - 1 - index) }));
    chord.shape.forEach((fret, index) => {
        const y = top + gap * (strings - 1 - index);
        if (fret === null) {
            // A string left out: a small cross, drawn.
            const x = flip(left - 13);
            svg.append(svgNode("path", { class: "cons-mini-mute", d: `M${x - 4} ${y - 4}l8 8m0 -8l-8 8` }));
        } else if (fret === 0) {
            svg.append(svgNode("circle", { class: "cons-mini-open", cx: flip(left - 13), cy: y, r: 4.5 }));
        } else {
            svg.append(svgNode("circle", { class: "cons-mini-dot", cx: flip(left + fretWidth * (fret - start + 0.5)), cy: y, r: 5.5 }));
        }
    });
    if (start > 1) {
        const label = svgNode("text", { class: "cons-mini-start", x: flip(left + fretWidth * 0.5), y: height - 2 });
        label.textContent = `Fret ${start}`;
        svg.append(label);
    }
    return svg;
}

// ---- Changes

function renderChords() {
    renderChordPanel();
    renderConsNeck();
}

function moveChordFrets(by) {
    const last = chordInstrument().frets - CHORD_FRETS + 1;
    const start = Math.max(1, Math.min(last, chords.start + by));
    if (start === chords.start) return;
    chords.start = start;
    renderConsNeck();
}

consNeckModes.chords = {
    draw: drawChordEditor,
    render: renderChordPanel,
    click(midi, place = {}) {
        if (consKeyboard()) {
            const at = chords.keys.indexOf(midi);
            if (at >= 0) chords.keys.splice(at, 1);
            else {
                chords.keys.push(midi);
                pluckConsNote(midi);
            }
        } else {
            const { string, fret } = place;
            if (!Number.isInteger(string) || string < 0 || string >= chords.shape.length || !Number.isInteger(fret)) return;
            if (chords.shape[string] === fret) chords.shape[string] = null;
            else {
                chords.shape[string] = fret;
                pluckConsNote(midi);
            }
        }
        renderChords();
    }
};

function useChordName(text) {
    chords.typed = MaestroMusic.cleanChordName(text);
    $("consChordName").value = chords.typed;
    renderChords();
}

function saveChordList(list) {
    chords.library = list;
    send("SaveChords", list.map(MaestroMusic.savedChordLine).join("\n"));
}

function saveChord(asNew) {
    const notes = chordNotes();
    const name = MaestroMusic.cleanChordName(chordName());
    if (!notes.length || !name || chords.library === null) return;
    const chord = MaestroMusic.cleanSavedChord({
        name,
        instrument: cons.settings.instrument,
        tuning: consKeyboard() ? [] : [...chordTuning().pitches],
        shape: consKeyboard() ? notes : [...chords.shape]
    });
    if (!chord) return;
    const list = [...chords.library];
    if (chords.editing >= 0 && !asNew) list[chords.editing] = chord;
    else {
        if (list.length >= MaestroMusic.CHORDS_MAX) {
            showToast(`The library holds ${MaestroMusic.CHORDS_MAX} chords. Delete one to save another.`);
            return;
        }
        list.push(chord);
        chords.editing = list.length - 1;
    }
    saveChordList(list);
    showToast(`Saved ${chord.name}.`);
    renderChords();
}

function openSavedChord(index) {
    const chord = chords.library?.[index];
    if (!chord || chord.instrument !== cons.settings.instrument) return;
    if (chord.instrument !== "keyboard") {
        const tuning = MaestroMusic.tuningsFor(chord.instrument, cons.settings.own).find(each => each.pitches.join(" ") === chord.tuning.join(" "));
        if (tuning && tuning.id !== chordTuning().id) chooseConsTuning(tuning.id);
        else if (!tuning && chord.tuning.length !== chordTuning().pitches.length) {
            showToast(`${chord.name} was saved in a tuning that's since been deleted.`);
            return;
        }
    }
    fitChord();
    if (consKeyboard()) chords.keys = [...chord.shape];
    else {
        chords.shape = [...chord.shape];
        chords.start = MaestroMusic.shapeStart(chord.shape, chordInstrument().frets);
    }
    chords.editing = index;
    chords.typed = chord.name;
    $("consChordName").value = chord.name;
    renderChords();
    pluckConsNotes(chordNotes(), 0.05);
}

function deleteSavedChord(index) {
    const gone = chords.library?.[index];
    if (!gone) return;
    const list = chords.library.filter((_, at) => at !== index);
    if (chords.editing === index) chords.editing = -1;
    else if (chords.editing > index) chords.editing -= 1;
    saveChordList(list);
    renderChordPanel();
    showToast(`Deleted ${gone.name}.`, { label: "Undo", run: () => {
        if (!chords.library || chords.library.length >= MaestroMusic.CHORDS_MAX) return;
        const back = [...chords.library];
        back.splice(Math.min(index, back.length), 0, gone);
        if (chords.editing >= index) chords.editing += 1;
        saveChordList(back);
        renderChordPanel();
    } });
}

// The library, as AHK sent it.
function receiveChords(items) {
    chords.library = (Array.isArray(items) ? items : []).map(MaestroMusic.cleanSavedChord).filter(Boolean).slice(0, MaestroMusic.CHORDS_MAX);
    if (chords.editing >= chords.library.length) chords.editing = -1;
    if (consSections.current() === "chords") renderChordPanel();
}

// ---- Wiring

$("consChordName").addEventListener("input", () => {
    chords.typed = $("consChordName").value.trim() ? MaestroMusic.cleanChordName($("consChordName").value) : "";
    renderChords();
});
$("consChordName").addEventListener("change", () => useChordName($("consChordName").value));
$("consChordName").addEventListener("keydown", event => {
    if (event.key === "Enter" && !$("consChordSave").disabled) saveChord(false);
});
$("consChordSave").addEventListener("click", () => saveChord(false));
$("consChordSaveNew").addEventListener("click", () => saveChord(true));
$("consChordStrum").addEventListener("click", () => pluckConsNotes(chordNotes(), 0.05));
$("consChordClear").addEventListener("click", () => {
    clearChord();
    renderChords();
});
$("consChordReadings").addEventListener("click", event => {
    const button = event.target.closest("[data-reading]");
    if (button) useChordName(button.dataset.reading);
});
document.querySelectorAll("#consChordStyle [data-chord-style]").forEach(button => button.addEventListener("click", () => {
    if (!Object.hasOwn(MaestroMusic.CHORD_STYLES, button.dataset.chordStyle)) return;
    cons.settings.chordStyle = button.dataset.chordStyle;
    saveConsSettings();
    renderConservatory();
}));
$("consSaved").addEventListener("click", event => {
    const open = event.target.closest("[data-saved-open]");
    if (open) openSavedChord(Number(open.dataset.savedOpen));
    const remove = event.target.closest("[data-saved-delete]");
    if (remove) deleteSavedChord(Number(remove.dataset.savedDelete));
});
$("consSavedSearch").addEventListener("input", () => {
    chords.search = $("consSavedSearch").value;
    renderChordLibrary();
});
$("consSavedRoot").replaceChildren(...[-1, ...MaestroMusic.PLAIN_NAMES.keys()].map(pc => {
    const option = element("option", "", pc < 0 ? "Any" : MaestroMusic.PLAIN_NAMES[pc]);
    option.value = String(pc);
    return option;
}));
$("consSavedRoot").addEventListener("change", () => {
    const root = Number($("consSavedRoot").value);
    chords.root = Number.isInteger(root) && root >= -1 && root < 12 ? root : -1;
    renderChordLibrary();
});
// The arrows, the map and the out-of-view markers move the five frets.
$("consNeck").addEventListener("click", event => {
    if (consSections.current() !== "chords") return;
    const move = event.target.closest("[data-chord-move]");
    if (move) moveChordFrets(Number(move.dataset.chordMove));
    const jump = event.target.closest("[data-chord-jump]");
    if (jump) moveChordFrets(Number(jump.dataset.chordJump) - 2 - chords.start);
    const map = event.target.closest(".cons-map");
    if (map) {
        const box = map.getBoundingClientRect();
        const share = (event.clientX - box.left) / box.width;
        const fret = Math.floor((cons.settings.lefty ? 1 - share : share) * chordInstrument().frets) + 1;
        moveChordFrets(fret - 2 - chords.start);
    }
});
// Scrolling sideways (or with Shift) over the neck moves the five frets.
$("consNeck").addEventListener("wheel", event => {
    if (consSections.current() !== "chords" || consKeyboard()) return;
    const sideways = event.deltaX || (event.shiftKey ? event.deltaY : 0);
    if (!sideways) return;
    event.preventDefault();
    chords.wheel += cons.settings.lefty ? -sideways : sideways;
    const steps = Math.trunc(chords.wheel / CHORD_WHEEL_STEP);
    if (!steps) return;
    chords.wheel -= steps * CHORD_WHEEL_STEP;
    moveChordFrets(steps);
}, { passive: false });

if (consSections.current() === "chords") renderConservatory();
