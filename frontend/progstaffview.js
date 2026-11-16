"use strict";

// Progressions on a staff (2.7.0): the Staff view of the song, its
// sections once each with their names and repeat signs, the chords' symbols
// (or numerals) above, and each chord's voicing as it's played, written as
// the instrument is: a keyboard's a hand to a staff, a stringed instrument's
// on its own staff (MaestroMusic.staffWriting). A voicing written into the song is marked. A click picks a chord
// and its note, or writes a note where there's none; a right-click takes a
// note out; the neck or keys add or take out the pitch clicked; and keys do
// the rest. Each change writes the chord's voicing into the song, with
// Ctrl+Z and Ctrl+Y. The score is made by harmony.js's chartScore and
// engraved by notation.js.

// Drawn as large as this, or smaller, down to the least, so a line of the
// staves fits the room it's shown in.
const PROG_STAFF_SCALE = 1.1;
const PROG_STAFF_LEAST = 0.8;
const PROG_STAFF_HEADROOM = 4.6;        // spaces above each system for the words
const PROG_STAFF_REPEAT_ROOM = 1.8;     // spaces a repeat sign takes inside its bar
const PROG_STAFF_LABEL = 19;            // the words' size, in the score's units (16 to 21 px on screen)
const PROG_STAFF_REPEAT_SIGN = "";    // Bravura's bar-repeat sign

const progStaff = {
    drawn: null,            // the engraving, and what it was made from
    made: null,             // chartScore's chords, bars and sections
    cacheKey: null,
    note: null,             // the picked chord's note selected, by MIDI number
    undo: [],               // the sketch before each change made here
    redo: [],
    after: null,            // the sketch after the last, so Undo knows nothing else changed it
    ghost: { frame: 0, at: null },
    room: "",               // the room it was laid out for
    scale: PROG_STAFF_SCALE
};

const progStaffRoom = () => ({ width: $("progStaffScore").clientWidth, height: $("progStaff").clientHeight });

const progStaffNotes = entry => {
    if (entry.voicing) return entry.voicing;
    const { choices, path } = progVoicings();
    const chosen = path[entry.index] >= 0 ? choices[entry.index][path[entry.index]] : null;
    return chosen?.midis ?? MaestroHarmony.keyVoicings(entry.name)[0]?.midis ?? MaestroHarmony.voiceChord(entry.name);
};

// The chord picked as the staff has it, with its notes.
function progStaffPicked() {
    const picked = progPicked();
    if (!picked) return null;
    const index = progChords().findIndex(each => each.section === picked.section && each.bar === picked.bar && each.slot === picked.slot);
    return { ...picked, index, midis: [...progStaffNotes({ ...picked, index })] };
}

// ---- Drawing

// The staves' clefs: as the instrument is written.
const progStaffClefs = () => MaestroMusic.staffWriting(cons.settings).clefs;

function progStaffLayout() {
    const room = progStaffRoom();
    const chords = progChords().map((entry, index) => ({ ...entry, index }));
    const notes = chords.map(entry => [...progStaffNotes(entry)]);
    const show = prog.settings.show;
    const clefs = progStaffClefs();
    const key = JSON.stringify([progSketch(), metro.settings.meter, notes, room, show, clefs]);
    if (progStaff.cacheKey === key) return progStaff.drawn;
    const made = MaestroHarmony.chartScore(progSketch(), metro.settings.meter, entry => notes[entry.index], progKey(), clefs);
    if (!made) return null;
    // A % bar's rests aren't drawn; its sign is.
    const quiet = new Set();
    made.bars.forEach(bar => bar.repeat && bar.notes?.forEach(([from, to], hand) => { for (let at = from; at < to; at++) quiet.add(`${hand}:${at}`); }));
    const opens = new Set(made.sections.filter(section => section.repeat > 1).map(section => section.first));
    const closes = new Set(made.sections.filter(section => section.repeat > 1).map(section => section.last));
    const space = MaestroNotation.SPACE;
    const engraveAt = scale => MaestroNotation.engrave(made.score, {
        maxWidth: Math.max(320, Math.floor(room.width / scale) - 4 - 3 * space), justify: true, headroom: PROG_STAFF_HEADROOM * space,
        barPadding: bar => [opens.has(bar) ? PROG_STAFF_REPEAT_ROOM : 0, closes.has(bar) ? PROG_STAFF_REPEAT_ROOM : 0],
        hideRest: (voice, index) => quiet.has(`${voice}:${index}`)
    });
    // Smaller, if the tallest line wouldn't fit, then laid out again for the width that gives.
    let scale = PROG_STAFF_SCALE;
    let drawn = engraveAt(scale);
    const tallest = Math.max(...drawn.systems.map(system => system.bottom - system.top)) + 2 * space;
    const fit = room.height > 0 ? Math.max(PROG_STAFF_LEAST, Math.min(PROG_STAFF_SCALE, (room.height - 12) / tallest)) : scale;
    if (fit < scale - 0.01) {
        scale = fit;
        drawn = engraveAt(scale);
    }
    progStaff.made = made;
    progStaff.drawn = drawn;
    progStaff.cacheKey = key;
    progStaff.room = JSON.stringify(room);
    progStaff.scale = scale;
    return drawn;
}

// Where a chord's notes are drawn: its column, system and heads by MIDI number.
function progStaffPlace(chord) {
    const drawn = progStaff.drawn;
    const column = drawn.columns.find(each => each.time === chord.onset);
    if (!column) return null;
    const heads = [];
    chord.staves.forEach((staff, hand) => {
        if (!staff.midis.length) return;
        drawn.heads.filter(head => head.voice === hand && head.index === staff.note).forEach(head => heads.push({ ...head, midi: staff.midis[head.at] }));
    });
    return { column, system: drawn.systems[column.system], heads };
}

const progStaffLabel = name => {
    const show = prog.settings.show;
    if (show === "numerals") return MaestroHarmony.romanNumeral(name, progKey()) || name;
    if (show === "nashville") return MaestroHarmony.nashville(name, progKey()) || name;
    return name;
};

function drawProgStaff() {
    const holder = $("progStaffScore");
    const drawn = progStaffLayout();
    if (!drawn) {
        holder.replaceChildren(element("p", "cons-note", "This song can't be written on a staff."));
        return;
    }
    const { chords, bars, sections } = progStaff.made;
    const space = drawn.space;
    const svg = svgNode("svg", {
        class: "cp-score prog-staff-svg", viewBox: `0 0 ${drawn.width} ${drawn.height}`,
        width: Math.round(drawn.width * progStaff.scale), height: Math.round(drawn.height * progStaff.scale),
        role: "img", "aria-label": `${progSketch().title} on ${progStaffClefs().length > 1 ? "a grand staff" : "a staff"}: ${chords.length} ${chords.length === 1 ? "chord" : "chords"}`
    });
    svg.append(svgNode("g", { class: "prog-staff-marks" }));
    drawScoreItems(svg, drawn);
    const text = (content, x, y, kind) => {
        const node = svgNode("text", { x, y, class: kind, "font-size": PROG_STAFF_LABEL });
        node.textContent = content;
        svg.append(node);
        return node;
    };
    const spanOf = bar => drawn.barSpans.find(each => each.bar === bar);
    const staves = system => [system.staffY[0] - 4 * space, system.staffY.at(-1)];
    // Repeat signs, and a double bar line between sections.
    const dots = (x, system) => system.staffY.forEach(y => [1.5, 2.5].forEach(at => svg.append(svgNode("circle", { class: "prog-staff-dot", cx: x, cy: y - at * space, r: 0.25 * space }))));
    const thick = (x, system) => {
        const [top, bottom] = staves(system);
        svg.append(svgNode("rect", { class: "prog-staff-thick", x, y: top, width: 0.5 * space, height: bottom - top }));
    };
    const thin = (x, system) => {
        const [top, bottom] = staves(system);
        svg.append(svgNode("line", { class: "bar-line", x1: x, x2: x, y1: top, y2: bottom }));
    };
    sections.forEach((section, at) => {
        const first = spanOf(section.first);
        const last = spanOf(section.last);
        if (section.repeat > 1 && first) {
            const system = drawn.systems[first.system];
            // At a line's start, clear of the time signature or key.
            const x = first.x1 + (system.bars[0] === section.first ? 0.5 * space : 0);
            thick(x, system);
            thin(x + 0.9 * space, system);
            dots(x + 1.35 * space, system);
        }
        const final = at === sections.length - 1;
        if (last && section.repeat > 1) {
            const system = drawn.systems[last.system];
            dots(last.x2 - (final ? 2.1 : 1.35) * space, system);
            if (!final) {
                thin(last.x2 - 0.9 * space, system);
                thick(last.x2 - 0.5 * space, system);
            }
        } else if (last && !final) thin(last.x2 - 0.6 * space, drawn.systems[last.system]);
        // Above its first bar: its letter, name and how many times it's played.
        if (first) {
            const system = drawn.systems[first.system];
            const y = system.top + 1.7 * space;
            const letter = text(progLetter(at), first.x1 + 0.6 * space, y, "prog-staff-letter");
            letter.setAttribute("text-anchor", "middle");
            svg.append(svgNode("rect", { class: "prog-staff-box", x: first.x1 - 0.5 * space, y: y - 1.7 * space, width: 2.2 * space, height: 2.3 * space, rx: 0.3 * space }));
            const words = [section.name, section.repeat > 1 ? `×${section.repeat}` : ""].filter(Boolean).join("  ");
            if (words) text(words, first.x1 + 2.3 * space, y, "prog-staff-section");
        }
    });
    // A % bar's sign, in the middle of each staff.
    bars.forEach((bar, index) => {
        if (!bar.repeat) return;
        const span = spanOf(index);
        if (!span) return;
        const system = drawn.systems[span.system];
        system.staffY.forEach(y => {
            const sign = svgNode("text", { class: "staff-glyph", x: (span.x1 + span.x2) / 2 - 1.3 * space, y: y - 2 * space + MaestroNotation.LIFT });
            sign.textContent = PROG_STAFF_REPEAT_SIGN;
            svg.append(sign);
        });
    });
    // Each chord's symbol (or numeral) over it; a voicing written into the song has a mark.
    chords.forEach(chord => {
        const place = progStaffPlace(chord);
        if (!place) return;
        const y = place.system.top + (PROG_STAFF_HEADROOM - 0.7) * space;
        const label = text(progStaffLabel(chord.name), place.column.x, y, `prog-staff-chord${chord.written ? " is-written" : ""}`);
        if (chord.written) {
            const mark = svgNode("circle", { class: "prog-staff-written", cx: place.column.x - 0.8 * space, cy: y - 0.55 * space, r: 0.35 * space });
            const title = svgNode("title", {});
            title.textContent = "Its voicing is written in the song";
            mark.append(title);
            svg.append(mark);
            label.setAttribute("aria-label", `${chord.name}, its voicing written`);
        }
    });
    holder.replaceChildren(svg);
    markProgStaff();
}

// The chord picked, its note selected and the chord playing, drawn under
// the notes; redrawn alone as they change.
function markProgStaff() {
    const svg = $("progStaffScore").querySelector("svg");
    const marks = svg?.querySelector(".prog-staff-marks");
    if (!marks || !progStaff.made) return;
    marks.replaceChildren();
    const drawn = progStaff.drawn;
    const space = drawn.space;
    const column = (place, kind) => {
        const [top, bottom] = [place.system.top + (PROG_STAFF_HEADROOM - 2.4) * space, place.system.bottom];
        const box = svgNode("rect", { class: `prog-staff-pick ${kind}`, x: place.column.x - 1.4 * space, y: top, width: 4 * space, height: bottom - top, rx: 0.6 * space });
        marks.append(box);
        return box;
    };
    const { chords } = progStaff.made;
    const picked = progPicked();
    const pickedChord = picked && chords.find(each => each.section === picked.section && each.bar === picked.bar && each.slot === picked.slot);
    const pickedPlace = pickedChord ? progStaffPlace(pickedChord) : null;
    let shown = null;
    if (pickedPlace) {
        column(pickedPlace, "is-picked");
        shown = pickedPlace.system;
        if (!pickedPlace.heads.some(head => head.midi === progStaff.note)) progStaff.note = pickedPlace.heads.reduce((top, head) => (top === null || head.midi > top ? head.midi : top), null);
        const head = pickedPlace.heads.find(each => each.midi === progStaff.note);
        if (head) marks.append(svgNode("ellipse", { class: "cp-ring is-selected", cx: head.x + 0.6 * space, cy: head.y, rx: 1.25 * space, ry: 0.95 * space }));
    }
    // The loop's chord; a % bar plays the bar before's, so the bar itself is lit.
    const playing = metro.running && prog.settings.loop ? prog.playing : null;
    if (playing) {
        const barIndex = progStaff.made.bars.findIndex(bar => bar.section === playing.section && bar.bar === playing.written);
        const bar = progStaff.made.bars[barIndex];
        const span = drawn.barSpans.find(each => each.bar === barIndex);
        if (bar?.repeat && span) {
            const system = drawn.systems[span.system];
            const top = system.top + (PROG_STAFF_HEADROOM - 2.4) * space;
            marks.append(svgNode("rect", { class: "prog-staff-pick is-playing", x: span.x1, y: top, width: span.x2 - span.x1, height: system.bottom - top, rx: 0.6 * space }));
            shown = system;
        } else {
            const chord = chords.find(each => each.section === playing.section && each.bar === playing.written && each.slot === playing.slot);
            const place = chord ? progStaffPlace(chord) : null;
            if (place) {
                column(place, "is-playing");
                shown = place.system;
            }
        }
    }
    // The staff follows the loop, and keeps the chord picked in view.
    if (shown) revealProgStaff(svg, shown);
}

// A line of the staff scrolled into view, whole, or from its top if it's taller.
function revealProgStaff(svg, system) {
    const holder = $("progStaff");
    if (holder.hidden || holder.scrollHeight <= holder.clientHeight) return;
    const view = holder.getBoundingClientRect();
    const box = svg.getBoundingClientRect();
    const scale = box.height / progStaff.drawn.height;
    const top = box.top + system.top * scale;
    const bottom = box.top + system.bottom * scale;
    if (top < view.top || bottom - top > view.height) holder.scrollTop -= view.top - top;
    else if (bottom > view.bottom) holder.scrollTop += bottom - view.bottom + 6;
}

// The view: Chart or Staff. The voicing's ‹ › and Reset sit under the staff
// while it's shown, and back in a chord's drawer with the chart.
const progVoicingHome = { parent: $("progVoicing").parentElement, next: $("progVoicing").nextElementSibling };
function renderProgStaffView() {
    const staff = progStaffShown();
    document.querySelectorAll("#progView [data-prog-view]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.progView === prog.settings.view)));
    $("progSheet").hidden = staff;
    $("progStaff").hidden = !staff;
    $("progStaffBar").hidden = !staff;
    // Adding sections, and a capo for open shapes, belong to the chart.
    $("progFoot").hidden = staff;
    if (staff && $("progVoicing").parentElement !== $("progStaffTools")) $("progStaffTools").append($("progVoicing"));
    else if (!staff && $("progVoicing").parentElement !== progVoicingHome.parent) progVoicingHome.parent.insertBefore($("progVoicing"), progVoicingHome.next);
    if (!staff) return;
    $("progDrawer").hidden = true;
    const picked = progPicked();
    const sketch = progSketch();
    $("progStaffWhere").textContent = picked ? `${sketch.sections.length > 1 ? `${progLetter(picked.section)}, bar` : "Bar"} ${picked.bar + 1} · ${picked.name}` : "";
    drawProgStaff();
}

function setProgView(view) {
    if (!PROG_VIEWS.includes(view) || view === prog.settings.view) return;
    prog.settings.view = view;
    prog.barOpen = false;
    saveProgression();
    renderProgressions();
    renderConsNeck();
}

// ---- Editing: each change writes the chord's voicing into the song.

function writeProgStaff(entry, midis, select) {
    const clean = [...new Set(midis)].sort((a, b) => a - b);
    // One staff holds as many notes as a chord can have.
    if (!MaestroHarmony.isVoicing(clean) || clean.length > progStaffClefs().length * MaestroNotation.CHORD_MAX) return false;
    const before = { sketch: structuredClone(progSketch()), at: { ...prog.at }, note: progStaff.note };
    const was = JSON.stringify(progSketch());
    prog.at = { section: entry.section, bar: entry.bar, slot: entry.slot };
    progStaff.note = select;
    changeProgression(() => {
        const bar = progSketch().sections[entry.section]?.bars[entry.bar];
        if (!bar || MaestroHarmony.slotChord(bar[entry.slot]) !== entry.name) return false;
        bar[entry.slot] = MaestroHarmony.voicedSlot(entry.name, clean);
    });
    const now = JSON.stringify(progSketch());
    if (now !== was) {
        if (progStaff.after !== was) progStaff.undo = [];
        progStaff.undo.push(before);
        progStaff.redo = [];
        progStaff.after = now;
    } else renderProgressions();
    return now !== was;
}

function undoProgStaff(redo = false) {
    const from = redo ? progStaff.redo : progStaff.undo;
    const to = redo ? progStaff.undo : progStaff.redo;
    // A change made elsewhere since ends what Undo here can do.
    if (progStaff.after !== JSON.stringify(progSketch())) {
        progStaff.undo = [];
        progStaff.redo = [];
        return false;
    }
    const step = from.pop();
    if (!step) return false;
    to.push({ sketch: structuredClone(progSketch()), at: { ...prog.at }, note: progStaff.note });
    prog.settings.sketch = step.sketch;
    prog.at = step.at;
    progStaff.note = step.note;
    clampProgPick();
    rebuildProgTimeline();
    saveProgression();
    renderProgressions();
    renderConsNeck();
    progStaff.after = JSON.stringify(progSketch());
    return true;
}

// A note added (heard), or one there selected.
function addProgStaffNote(entry, midi) {
    const picked = entry.midis.includes(midi);
    if (picked) progStaff.note = midi;
    else if (!writeProgStaff(entry, [...entry.midis, midi], midi)) return;
    if (picked) renderProgressions();
    pluckConsNote(midi);
}

// A note taken out; the chord keeps one at least.
function removeProgStaffNote(entry, midi) {
    if (!entry.midis.includes(midi) || entry.midis.length < 2) return;
    const rest = entry.midis.filter(each => each !== midi);
    writeProgStaff(entry, rest, rest.filter(each => each < midi).at(-1) ?? rest[0]);
}

// The selected note a step up or down in the key, or a half step; past a
// note of the chord's own to the next free place.
function stepProgStaffNote(by, chromatic) {
    const entry = progStaffPicked();
    if (!entry || !entry.midis.includes(progStaff.note)) return;
    const fifths = MaestroHarmony.keySignature(progKey());
    let p = MaestroHarmony.spellVoicing(entry.name, [progStaff.note], progKey())[0];
    let midi = progStaff.note;
    for (let tries = 0; tries < 12; tries++) {
        if (chromatic) midi += by;
        else {
            const step = p.step + by;
            p = MaestroNotation.pitch(step, MaestroNotation.keyAlter(((step % 7) + 7) % 7, fifths));
            midi = MaestroNotation.midiOf(p);
        }
        if (midi < MaestroHarmony.VOICING_LOW || midi > MaestroHarmony.VOICING_HIGH) return;
        if (!entry.midis.includes(midi)) break;
    }
    if (entry.midis.includes(midi)) return;
    if (writeProgStaff(entry, [...entry.midis.filter(each => each !== progStaff.note), midi], midi)) pluckConsNote(midi);
}

// The note above or below the selected one.
function selectProgStaffNote(by) {
    const entry = progStaffPicked();
    if (!entry) return;
    const at = entry.midis.indexOf(progStaff.note);
    const next = entry.midis[Math.max(0, Math.min(entry.midis.length - 1, (at < 0 ? entry.midis.length - 1 : at) + by))];
    if (next === undefined) return;
    progStaff.note = next;
    markProgStaff();
    pluckConsNote(next);
}

// A letter typed: that letter in the key, the nearest not in the chord.
function letterProgStaffNote(letter) {
    const entry = progStaffPicked();
    if (!entry) return;
    const near = entry.midis.includes(progStaff.note) ? progStaff.note : entry.midis.at(-1) ?? 60;
    const index = MaestroNotation.LETTERS.indexOf(letter);
    const alter = MaestroNotation.keyAlter(index, MaestroHarmony.keySignature(progKey()));
    let best = null;
    for (let octave = 0; octave <= 9; octave++) {
        const midi = MaestroNotation.midiOf(MaestroNotation.pitch(index + 7 * octave, alter));
        if (midi < MaestroHarmony.VOICING_LOW || midi > MaestroHarmony.VOICING_HIGH || entry.midis.includes(midi)) continue;
        if (best === null || Math.abs(midi - near) < Math.abs(best - near) || (Math.abs(midi - near) === Math.abs(best - near) && midi > best)) best = midi;
    }
    if (best !== null) addProgStaffNote(entry, best);
}

// Another chord, in the order written.
function moveProgStaffChord(by) {
    const list = progChords();
    const at = progIndex(list);
    const next = list[Math.max(0, Math.min(list.length - 1, at + by))];
    if (!next || next === list[at]) return;
    prog.at = { section: next.section, bar: next.bar, slot: next.slot };
    progStaff.note = null;
    prog.scale = null;
    renderProgressions();
    renderConsNeck();
    strumProgChord(next.name);
}

// The neck or keys clicked in the Staff view: the pitch joins the chord
// picked, or leaves it.
function toggleProgStaffPitch(midi) {
    const entry = progStaffPicked();
    if (!entry) return pluckConsNote(midi);
    if (entry.midis.includes(midi)) {
        if (progStaff.note === midi && entry.midis.length > 1) return removeProgStaffNote(entry, midi);
        progStaff.note = midi;
        markProgStaff();
        return pluckConsNote(midi);
    }
    addProgStaffNote(entry, midi);
}

// ---- The pointer

// What's under the pointer: the chord nearest it on its line, the staff and
// step there, and a note of the chord's if one is there.
function progStaffHit(event) {
    const drawn = progStaff.drawn;
    const svg = $("progStaffScore").querySelector("svg");
    if (!drawn || !svg || !progStaff.made) return null;
    const box = svg.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const x = (event.clientX - box.left) / box.width * drawn.width;
    const y = (event.clientY - box.top) / box.height * drawn.height;
    const space = drawn.space;
    const systemIndex = drawn.systems.findIndex(system => y >= system.top && y <= system.bottom + 2 * space);
    if (systemIndex < 0) return null;
    const system = drawn.systems[systemIndex];
    const places = progStaff.made.chords.map(chord => ({ chord, place: progStaffPlace(chord) })).filter(each => each.place?.column.system === systemIndex);
    if (!places.length) return null;
    const near = places.reduce((best, each) => (Math.abs(each.place.column.x + 0.6 * space - x) < Math.abs(best.place.column.x + 0.6 * space - x) ? each : best));
    if (Math.abs(near.place.column.x + 0.6 * space - x) > 4 * space) return null;
    const hand = system.staffY.length < 2 || y < (system.staffY[0] + system.staffY[1] - 4 * space) / 2 ? 0 : 1;
    const clef = progStaff.made.score.staves[hand].clef;
    const step = staffStepAt(drawn, systemIndex, hand, clef, y);
    const p = MaestroNotation.pitch(step, MaestroNotation.keyAlter(((step % 7) + 7) % 7, MaestroHarmony.keySignature(progKey())));
    const head = near.place.heads.find(each => Math.abs(each.x + 0.6 * space - x) < 1.4 * space && Math.abs(each.y - y) < 0.6 * space);
    const entry = progChords()[near.chord.index];
    if (!entry) return null;
    return { entry: { ...entry, index: near.chord.index, midis: [...near.chord.midis] }, place: near.place, hand, clef, step, p, head: head ?? null, staffY: system.staffY[hand] };
}

function progStaffPick(entry) {
    const changed = prog.at.section !== entry.section || prog.at.bar !== entry.bar || prog.at.slot !== entry.slot;
    prog.at = { section: entry.section, bar: entry.bar, slot: entry.slot };
    prog.scale = null;
    return changed;
}

function progStaffClick(event) {
    const hit = progStaffHit(event);
    if (!hit) return;
    $("progStaffScore").focus({ preventScroll: true });
    if (hit.head) {
        progStaffPick(hit.entry);
        progStaff.note = hit.head.midi;
        renderProgressions();
        renderConsNeck();
        pluckConsNote(hit.head.midi);
        return;
    }
    if (!MaestroNotation.isPitch(hit.p)) return;
    addProgStaffNote(hit.entry, MaestroNotation.midiOf(hit.p));
}

function progStaffErase(event) {
    event.preventDefault();
    const hit = event.button === 2 ? progStaffHit(event) : null;
    if (!hit?.head) return;
    removeProgStaffNote(hit.entry, hit.head.midi);
}

function progStaffHover(event) {
    progStaff.ghost.at = { clientX: event.clientX, clientY: event.clientY };
    if (!progStaff.ghost.frame) progStaff.ghost.frame = requestAnimationFrame(drawProgStaffGhost);
}

function progStaffLeave() {
    progStaff.ghost.at = null;
    cancelAnimationFrame(progStaff.ghost.frame);
    drawProgStaffGhost();
}

function drawProgStaffGhost() {
    progStaff.ghost.frame = 0;
    const svg = $("progStaffScore").querySelector("svg");
    svg?.querySelector(".cp-ghost")?.remove();
    const hit = svg && progStaff.ghost.at && progStaffHit(progStaff.ghost.at);
    if (!hit || hit.head || !MaestroNotation.isPitch(hit.p)) return;
    const staff = hit.entry && progStaff.made.chords[hit.entry.index]?.staves[hit.hand];
    const d = staff ? progStaff.made.score.staves[hit.hand].voices[0].notes[staff.note]?.d ?? "q" : "q";
    drawStaffGhost(svg, progStaff.drawn, { x: hit.place.column.x, staffY: hit.staffY, clef: hit.clef, step: hit.step, d });
}

// ---- Wiring

$("progView").addEventListener("click", event => {
    const button = event.target.closest("[data-prog-view]");
    if (button) setProgView(button.dataset.progView);
});
$("progStaffScore").addEventListener("click", progStaffClick);
$("progStaffScore").addEventListener("contextmenu", progStaffErase);
$("progStaffScore").addEventListener("pointermove", progStaffHover);
$("progStaffScore").addEventListener("pointerleave", progStaffLeave);
$("progStaffScore").addEventListener("keydown", event => {
    const ctrl = event.ctrlKey && !event.altKey && !event.metaKey;
    const plain = !event.ctrlKey && !event.metaKey;
    const entry = progStaffPicked();
    if (ctrl || !entry) return;
    if (plain && !event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) moveProgStaffChord(event.key === "ArrowLeft" ? -1 : 1);
    else if (plain && event.altKey && !event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) selectProgStaffNote(event.key === "ArrowUp" ? 1 : -1);
    else if (plain && !event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) stepProgStaffNote(event.key === "ArrowUp" ? 1 : -1, event.shiftKey);
    else if (plain && !event.altKey && (event.key === "Delete" || event.key === "Backspace")) removeProgStaffNote(entry, progStaff.note);
    else if (plain && !event.altKey && event.key === "Enter") strumProgChord(entry.name);
    else if (plain && !event.altKey && !event.shiftKey && /^[a-gA-G]$/.test(event.key)) letterProgStaffNote(event.key.toUpperCase());
    else return;
    event.preventDefault();
});
// Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z) anywhere on the tab but in a field, while the staff is shown.
$("consProgPanel").addEventListener("keydown", event => {
    if (!progStaffShown() || !event.ctrlKey || event.altKey || event.metaKey || event.target.closest("input, select, textarea, [contenteditable]")) return;
    const key = event.key.toLowerCase();
    const done = key === "z" && !event.shiftKey ? undoProgStaff() : (key === "y" || (key === "z" && event.shiftKey)) ? undoProgStaff(true) : false;
    if (done) event.preventDefault();
});
// New room lays the staff out again, while it's shown.
new ResizeObserver(() => {
    if (!progStaffShown() || !progIsShown() || $("progStaff").hidden) return;
    if (JSON.stringify(progStaffRoom()) !== progStaff.room) drawProgStaff();
}).observe($("progStaff"));
