// Harmony (2.4.0): chords in a key, progressions and charts, with no page
// and no sound, so every part is tested on its own. Chords are names, as the
// Finder writes them (Dm7, G7(♯5,♭9), C/E); a key is a root and a seven-note
// scale. Built on MaestroMusic's spelling, so a chord moved to another key, or
// written as a numeral, is spelled from its root.
globalThis.MaestroHarmony = (() => {
    const M = MaestroMusic;
    const FLAT = "\u266D", SHARP = "\u266F", DOUBLE_FLAT = "\u{1D12B}", DOUBLE_SHARP = "\u{1D12A}";
    const LETTERS = "CDEFGAB";
    const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"];
    const modulo = (value, base) => ((value % base) + base) % base;
    const ACCIDENTAL = { "-2": DOUBLE_FLAT, "-1": FLAT, "0": "", "1": SHARP, "2": DOUBLE_SHARP };

    // ---- Chords

    // A chord's notes above its root, by suffix: [semitones, degree]. Every
    // kind the Finder names, every triad and seventh a key can hold, and any
    // altered dominant.
    // Of the notes a kind can leave out, a thirteenth leaves out its eleventh
    // and an eleventh its third, as they're usually played; the rest are kept.
    const FORMULAS = new Map();
    for (const [suffix, notes] of M.CHORD_KINDS) {
        const has = degree => notes.some(([, at]) => at === degree);
        const dropped = ([, degree, optional]) => optional && ((degree === 11 && has(13)) || (degree === 3 && has(11) && !has(13)));
        FORMULAS.set(suffix, notes.filter(note => !dropped(note)).map(([semis, degree]) => [semis, degree]));
    }
    const thirdDegree = third => third === 2 ? 2 : third === 5 ? 4 : 3;
    for (const third of [2, 3, 4, 5]) for (const fifth of [5, 6, 7, 8, 9]) {
        const triad = M.triadName(third, fifth).suffix;
        if (!FORMULAS.has(triad)) FORMULAS.set(triad, [[0, 1], [third, thirdDegree(third)], [fifth, 5]]);
        for (const seventh of [9, 10, 11]) {
            const suffix = M.seventhName(third, fifth, seventh).suffix;
            if (!FORMULAS.has(suffix)) FORMULAS.set(suffix, [[0, 1], [third, thirdDegree(third)], [fifth, 5], [seventh, 7]]);
        }
    }
    const ALTERATION = { [`${FLAT}5`]: [6, 5], [`${SHARP}5`]: [8, 5], [`${FLAT}9`]: [1, 9], [`${SHARP}9`]: [3, 9], [`${SHARP}11`]: [6, 11], [`${FLAT}13`]: [8, 13] };
    function formulaOf(suffix) {
        if (FORMULAS.has(suffix)) return FORMULAS.get(suffix);
        const altered = /^(7|9|11|13)(?:([\u266D\u266F](?:5|9|11|13))|\(((?:[\u266D\u266F](?:5|9|11|13),)+[\u266D\u266F](?:5|9|11|13))\))$/.exec(suffix);
        if (!altered) return null;
        const marks = altered[2] ? [altered[2]] : altered[3].split(",");
        if (!marks.every(mark => ALTERATION[mark])) return null;
        const notes = [[0, 1], [4, 3]];
        if (!marks.some(mark => mark.endsWith("5") && !mark.endsWith("15"))) notes.push([7, 5]);
        notes.push([10, 7]);
        // The number named is always there (a 9 beside a ♭9 in 9♭9); under an 11
        // or 13, the 9 only if it isn't altered.
        const top = Number(altered[1]);
        if (top === 9 || (top > 9 && !marks.some(mark => /9$/.test(mark)))) notes.push([2, 9]);
        if (top === 11) notes.push([5, 11]);
        if (top === 13) notes.push([9, 13]);
        for (const mark of marks) notes.push(ALTERATION[mark]);
        return notes.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    }

    // A chord name's parts, { root, suffix, bass }, or null when it isn't a
    // chord Maestro can read (one typed freely).
    function parseChord(name) {
        const match = /^([A-G](?:\u266D|\u266F|\u{1D12A}|\u{1D12B})?)(.*?)(?:\/([A-G](?:\u266D|\u266F|\u{1D12A}|\u{1D12B})?))?$/u.exec(String(name ?? ""));
        if (!match || !formulaOf(match[2])) return null;
        return { root: match[1], suffix: match[2], bass: match[3] ?? "" };
    }

    const chordName = ({ root, suffix, bass }) => root + suffix + (bass ? `/${bass}` : "");

    // A chord's notes, spelled from its root, with the bass first if it's a
    // slash chord: [{ name, pc, degree }].
    function chordTones(name) {
        const chord = parseChord(name);
        if (!chord) return [];
        const tones = formulaOf(chord.suffix).map(([semis, degree]) => {
            const spelled = M.spell(chord.root, degree, semis);
            return { name: spelled, pc: M.pitchClass(spelled), degree };
        });
        if (!chord.bass) return tones;
        const bass = M.pitchClass(chord.bass);
        const inChord = tones.find(tone => tone.pc === bass);
        return [inChord ? { ...inChord, name: chord.bass } : { name: chord.bass, pc: bass, degree: 0 }, ...tones.filter(tone => tone.pc !== bass)];
    }

    const isMinorish = formula => formula.some(([semis, degree]) => degree === 3 && semis === 3);
    const isDominant = formula => formula.some(([semis, degree]) => degree === 3 && semis === 4) && formula.some(([semis, degree]) => degree === 7 && semis === 10);

    // ---- Keys

    // A key: a root (one of the 17 names) and a scale of seven notes.
    const keyNotes = key => M.scaleNotes(key.root, key.scale);
    const isKey = key => Boolean(key) && M.ROOTS.includes(key.root) && Object.hasOwn(M.SCALES, key.scale) && keyNotes(key).length === 7;

    // Where a note stands in a key: its degree (0 to 6, by letter) and how far
    // it's raised or lowered from the key's own note there.
    function placeInKey(note, key) {
        const notes = keyNotes(key);
        const degree = modulo(LETTERS.indexOf(note[0]) - LETTERS.indexOf(key.root[0]), 7);
        const shift = modulo(M.pitchClass(note) - notes[degree].pc + 6, 12) - 6;
        return { degree, shift };
    }

    // Whether every note of a chord is in the key.
    const isDiatonic = (name, key) => {
        const pcs = new Set(keyNotes(key).map(note => note.pc));
        const tones = chordTones(name);
        return tones.length > 0 && tones.every(tone => pcs.has(tone.pc));
    };

    // The numeral's quality, after it: V7, ii7, viiø7, iii°, IV+, V7♯9.
    function numeralSuffix(suffix, lower) {
        if (suffix === `m7${FLAT}5`) return "\u00F87";
        if (lower && suffix.startsWith("m") && !suffix.startsWith("maj")) return suffix.slice(1);
        return suffix;
    }

    // A chord as a numeral in a key: V7, ii7, ♭VII, iv; a secondary dominant
    // as V7/ii; a slash chord with its bass's degree in the chord (I/3), if
    // the bass is one of its notes. "" if unreadable.
    function romanNumeral(name, key) {
        const chord = parseChord(name);
        if (!chord || !isKey(key)) return "";
        const formula = formulaOf(chord.suffix);
        const lower = isMinorish(formula);
        const { degree, shift } = placeInKey(chord.root, key);
        let numeral = (ACCIDENTAL[String(shift)] ?? "") + (lower ? NUMERALS[degree].toLowerCase() : NUMERALS[degree]) + numeralSuffix(chord.suffix, lower);
        // Outside the key, a dominant (or major triad) a fifth above one of
        // its chords is that chord's own V.
        const majorThird = formula.some(([semis, at]) => at === 3 && semis === 4);
        const plainFifth = formula.some(([semis, at]) => at === 5 && semis === 7) || !formula.some(([, at]) => at === 5);
        if (!isDiatonic(chordName({ ...chord, bass: "" }), key) && majorThird && plainFifth && (isDominant(formula) || chord.suffix === "")) {
            const target = modulo(degree + 3, 7);
            const targetChord = M.chordsInKey(key.root, key.scale, 3)[target];
            const targetNote = keyNotes(key)[target];
            if (targetChord && target !== 0 && !/\u00B0/.test(targetChord.name) && modulo(M.pitchClass(chord.root) - targetNote.pc, 12) === 7) {
                numeral = `V${chord.suffix === "" ? "" : numeralSuffix(chord.suffix, false)}/${targetChord.numeral}`;
            }
        }
        // A chord over another of its notes: the note's degree in the chord (I/3).
        const bassTone = chord.bass ? chordTones(name)[0] : null;
        if (bassTone?.degree) numeral += `/${bassTone.degree}`;
        return numeral;
    }

    // A chord in the Nashville number system: 1, 4, 5, 2m7, ♭7, 1/3.
    function nashville(name, key) {
        const chord = parseChord(name);
        if (!chord || !isKey(key)) return "";
        const { degree, shift } = placeInKey(chord.root, key);
        let number = (ACCIDENTAL[String(shift)] ?? "") + (degree + 1) + chord.suffix;
        if (chord.bass) {
            const place = placeInKey(chord.bass, key);
            number += `/${ACCIDENTAL[String(place.shift)] ?? ""}${place.degree + 1}`;
        }
        return number;
    }

    // A numeral read back as a chord in a key: V7 in G is D7, ii is Am, ♭VII is F
    // in C, V7/V is A7 in G, viiø7 is F♯m7♭5. Also takes b and # for the flat and
    // sharp. null if it isn't one.
    function chordFromNumeral(text, key) {
        if (!isKey(key)) return null;
        const tidy = String(text ?? "").trim().replace(/^b/, FLAT).replace(/^#/, SHARP);
        const [main, of] = tidy.split("/");
        let base = key;
        if (of !== undefined) {
            // V7/V: the numeral is read in the key of its target, as a major key.
            const target = chordFromNumeral(of, key);
            if (!target) return null;
            base = { root: parseChord(target).root, scale: "major" };
            if (!isKey(base)) base = { root: M.PLAIN_NAMES[M.pitchClass(parseChord(target).root)], scale: "major" };
        }
        const match = /^(\u266D|\u266F)?(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(.*)$/.exec(main);
        if (!match) return null;
        const [, accidental = "", numeral, rest] = match;
        const degree = NUMERALS.indexOf(numeral.toUpperCase());
        const lower = numeral === numeral.toLowerCase();
        const scaleNote = keyNotes(base)[degree].name;
        const shift = accidental === FLAT ? -1 : accidental === SHARP ? 1 : 0;
        const root = shift ? M.spell(scaleNote, 1, shift) : scaleNote;
        const suffix = rest === "\u00F87" ? `m7${FLAT}5`
            : rest === "\u00B0" || rest === "\u00B07" ? rest
            : lower ? (rest.startsWith("maj") ? `m(${rest})` : `m${rest}`)
            : rest;
        const name = root + suffix;
        return parseChord(name) ? name : null;
    }

    // ---- Moving and fitting

    // A chord moved from one key's root to another's, spelled by the interval:
    // from C to E♭, G7 is B♭7 and E is G.
    function transposeChord(name, fromRoot, toRoot) {
        const chord = parseChord(name);
        if (!chord || !M.parseName(fromRoot) || !M.parseName(toRoot)) return null;
        const letters = modulo(LETTERS.indexOf(toRoot[0]) - LETTERS.indexOf(fromRoot[0]), 7);
        const semis = modulo(M.pitchClass(toRoot) - M.pitchClass(fromRoot), 12);
        const move = note => M.spell(note, letters + 1, semis);
        return chordName({ root: move(chord.root), suffix: chord.suffix, bass: chord.bass ? move(chord.bass) : "" });
    }

    // Shapes a guitarist plays open; a chord whose shape is one of them is easy.
    const OPEN_SHAPES = new Set(["C", "Cmaj7", "C7", "Cadd9", "D", "Dm", "D7", "Dmaj7", "Dm7", "Dsus2", "Dsus4", "E", "Em", "E7", "Em7", "Esus4", "E5",
        "G", "G7", "G6", "A", "Am", "A7", "Am7", "Amaj7", "Asus2", "Asus4", "A5", "Fmaj7", "B7"]);

    // The capo frets that make the most chords open shapes: [{ capo, shapes,
    // open }], best first; no capo among them.
    function capoOptions(names, highest = 7) {
        const chords = names.map(parseChord).filter(Boolean);
        if (!chords.length) return [];
        return Array.from({ length: highest + 1 }, (_, capo) => {
            const shapes = chords.map(chord => M.capoShape(chord.root + chord.suffix, capo));
            return { capo, shapes, open: shapes.filter(shape => OPEN_SHAPES.has(shape)).length };
        }).sort((a, b) => b.open - a.open || a.capo - b.capo);
    }

    // The scales on a chord's root that hold all its notes, those inside the
    // key first, then by family: [{ root, scale, label, inKey }].
    function scalesForChord(name, key, most = 8) {
        const chord = parseChord(name);
        if (!chord) return [];
        const tones = new Set(chordTones(chordName({ ...chord, bass: "" })).map(tone => tone.pc));
        const keyPcs = isKey(key) ? new Set(keyNotes(key).map(note => note.pc)) : null;
        const families = M.FAMILIES;
        const root = M.ROOTS.includes(chord.root) ? chord.root : M.PLAIN_NAMES[M.pitchClass(chord.root)];
        return Object.entries(M.SCALES).map(([scale, info], order) => {
            const notes = M.scaleNotes(root, scale);
            const pcs = new Set(notes.map(note => note.pc));
            return { root, scale, label: info.label, family: families.indexOf(info.family), order, pcs, inKey: Boolean(keyPcs) && notes.every(note => keyPcs.has(note.pc)) };
        }).filter(each => [...tones].every(pc => each.pcs.has(pc)))
            .sort((a, b) => Number(b.inKey) - Number(a.inKey) || a.family - b.family || a.order - b.order)
            .slice(0, most)
            .map(({ root: on, scale, label, inKey }) => ({ root: on, scale, label, inKey }));
    }

    // Guide tones: each chord's third and seventh (its sixth, or for a triad
    // its fifth, standing in), as two lines that move as little as they can:
    // [{ chord, upper, lower }], names of notes.
    function guideTones(names) {
        const lines = [];
        let last = null;
        for (const name of names) {
            const chord = parseChord(name);
            if (!chord) continue;
            const tones = chordTones(chordName({ ...chord, bass: "" }));
            const third = tones.find(tone => tone.degree === 3) ?? tones.find(tone => tone.degree === 2 || tone.degree === 4);
            const other = tones.find(tone => tone.degree === 7) ?? tones.find(tone => tone.degree === 6) ?? tones.find(tone => tone.degree === 5);
            if (!third || !other) continue;
            let [a, b] = [third, other];
            if (last) {
                const distance = (x, y) => Math.min(modulo(x.pc - y.pc, 12), modulo(y.pc - x.pc, 12));
                if (distance(a, last.a) + distance(b, last.b) > distance(b, last.a) + distance(a, last.b)) [a, b] = [b, a];
            }
            lines.push({ chord: name, a: a.name, b: b.name });
            last = { a, b };
        }
        return lines;
    }

    // ---- Other chords to try

    // Ways to change the chord at `index`, each { kind, label, chords, why }:
    // chords replace it (two share its time).
    function reharmonize(names, index, key) {
        const name = names[index];
        const chord = parseChord(name);
        if (!chord || !isKey(key)) return [];
        const next = parseChord(names[index + 1] ?? "");
        const formula = formulaOf(chord.suffix);
        const ideas = [];
        const add = (kind, label, chords, why) => {
            if (chords.every(each => parseChord(each)) && !(chords.length === 1 && chords[0] === name)) ideas.push({ kind, label, chords, why });
        };
        const fifthAbove = root => M.spell(root, 5, 7);
        // A dominant can be replaced by the one a tritone away.
        if (isDominant(formula)) {
            const keep = ["7", "9", "13"].includes(chord.suffix) ? chord.suffix : "7";
            add("tritone", "Tritone substitute", [M.spell(chord.root, 5, 6) + keep], `Shares its third and seventh, and slides down a half step to where ${name} was going.`);
        }
        if (next) {
            const nextFormula = formulaOf(next.suffix);
            const nextDiminished = nextFormula.some(([semis, degree]) => degree === 5 && semis === 6) && isMinorish(nextFormula);
            if (!nextDiminished) {
                add("secondary", "Secondary dominant", [`${fifthAbove(next.root)}7`], `The V7 of ${chordName({ ...next, bass: "" })}, pulling into it.`);
                const minorTarget = isMinorish(nextFormula);
                add("two-five", "ii\u2013V into the next", [`${M.spell(next.root, 2, 2)}${minorTarget ? `m7${FLAT}5` : "m7"}`, `${fifthAbove(next.root)}7`], `A ii\u2013V of ${chordName({ ...next, bass: "" })}, in its time.`);
            }
            // A whole step up: a diminished seventh on the half step between.
            if (modulo(M.pitchClass(next.root) - M.pitchClass(chord.root), 12) === 2 && modulo(LETTERS.indexOf(next.root[0]) - LETTERS.indexOf(chord.root[0]), 7) === 1) {
                add("passing", "Passing diminished", [name, `${M.spell(chord.root, 1, 1)}\u00B07`], `${name}, then a diminished chord on the half step up to ${chordName({ ...next, bass: "" })}.`);
            }
        }
        const { degree, shift } = placeInKey(chord.root, key);
        if (shift === 0) {
            const size = formula.some(([, at]) => at === 7) ? 4 : 3;
            // From the parallel key: minor's in major, major's in minor.
            const parallel = keyNotes(key)[2].pc === modulo(M.pitchClass(key.root) + 4, 12) ? "minor" : "major";
            const borrowed = M.chordsInKey(key.root, parallel, size)[degree];
            if (borrowed) add("borrowed", `Borrowed from ${key.root} ${parallel}`, [borrowed.name], `The ${borrowed.numeral} of ${key.root} ${parallel}, the same degree with its own color.`);
            // A diatonic chord a third away shares two notes.
            const inKey = M.chordsInKey(key.root, key.scale, size);
            for (const step of [5, 2]) {
                const relative = inKey[modulo(degree + step, 7)];
                if (relative && !/\u00B0/.test(relative.name)) add("relative", "Shares two notes", [relative.name], `The ${relative.numeral}: two of its notes are ${name}'s.`);
            }
            // The backdoor: ♭VII7 in place of V7 going home.
            const nextIsHome = next && placeInKey(next.root, key).degree === 0 && placeInKey(next.root, key).shift === 0;
            if (degree === 4 && nextIsHome) add("backdoor", "Backdoor dominant", [`${M.spell(key.root, 7, 10)}7`], "The \u266DVII7, coming home from a whole step below.");
        }
        return ideas;
    }

    // ---- Playing

    // A chord's notes to play: its bass (the root, or a slash chord's bass)
    // from E2 (or `low`, 2.7.0: an instrument's lowest note), and the rest in
    // close position from an octave above, voiced as near as can be to the
    // chord before. MIDI numbers, low to high.
    function voiceChord(name, previous = null, low = 40) {
        const tones = chordTones(name);
        if (!tones.length) return [];
        const bassPc = tones[0].pc;
        const bass = low + modulo(bassPc - low, 12);
        const upper = [...new Set(tones.map(tone => tone.pc))];
        const candidates = upper.map((_, turn) => {
            const order = [...upper.slice(turn), ...upper.slice(0, turn)];
            const notes = [];
            let floor = low + 12;
            for (const pc of order) {
                const midi = floor + modulo(pc - floor, 12);
                notes.push(midi);
                floor = midi + 1;
            }
            return notes;
        });
        const above = previous ? previous.slice(1) : null;
        const cost = notes => above ? notes.reduce((sum, midi, at) => sum + Math.abs(midi - (above[at] ?? above.at(-1))), 0) : notes.at(-1);
        const best = candidates.sort((a, b) => cost(a) - cost(b))[0];
        return [bass, ...best].sort((a, b) => a - b);
    }

    // ---- Charts

    const CHART_LIMITS = Object.freeze({ title: 60, section: 24, sections: 12, bars: 64, totalBars: 256, perBar: 4, repeat: 8, beats: 12, bytes: 65536 });
    const REPEAT_BAR = "%";

    // A chord's voicing written into the chart (2.7.0): its notes, kept with
    // it as "Cmaj7=48.55.59.64", MIDI numbers low to high, 1 to 10 of them
    // from E0 to C8 (AHK checks the same). A chord symbol has no "=".
    const VOICING_LOW = 16, VOICING_HIGH = 108, VOICING_MAX = 10;
    const VOICING_TEXT = /^[1-9]\d{1,2}(?:\.[1-9]\d{1,2}){0,9}$/;
    const isVoicing = midis => Array.isArray(midis) && midis.length >= 1 && midis.length <= VOICING_MAX
        && midis.every((midi, at) => Number.isInteger(midi) && midi >= VOICING_LOW && midi <= VOICING_HIGH && (at === 0 || midi > midis[at - 1]));
    // A chart's chord as written: its name, and its voicing or null.
    const slotChord = slot => String(slot ?? "").split("=")[0];
    function slotVoicing(slot) {
        const text = String(slot ?? "");
        const at = text.indexOf("=");
        if (at < 0 || !VOICING_TEXT.test(text.slice(at + 1))) return null;
        const midis = text.slice(at + 1).split(".").map(Number);
        return isVoicing(midis) ? midis : null;
    }
    const voicedSlot = (name, midis) => (isVoicing(midis) ? `${name}=${midis.join(".")}` : name);
    const isVoiced = chart => chart.sections.some(section => section.bars.some(bar => bar.some(slot => slotVoicing(slot))));

    // A voicing moved as its chord is, by `semis` up (1 to 11): the nearer
    // way, up or down, and an octave the other way if it leaves the range.
    // null if it can't stay in it.
    function moveVoicing(midis, semis) {
        const by = modulo(semis, 12) > 6 ? modulo(semis, 12) - 12 : modulo(semis, 12);
        for (const shift of [by, by + (by > 0 ? -12 : 12)]) {
            const moved = midis.map(midi => midi + shift);
            if (isVoicing(moved)) return moved;
        }
        return null;
    }

    // A voicing's notes spelled (2.7.0): each as its chord spells that note,
    // else as the key does, else plainly. As staff pitches: { step, alter },
    // the step counted in letters from C0.
    function spellVoicing(name, midis, key = null) {
        const tones = chordTones(name);
        const notes = key && isKey(key) ? keyNotes(key) : [];
        return midis.map(midi => {
            const pc = modulo(midi, 12);
            const spelled = tones.find(tone => tone.pc === pc)?.name ?? notes.find(note => note.pc === pc)?.name ?? M.PLAIN_NAMES[pc];
            const letter = LETTERS.indexOf(spelled[0]);
            const natural = M.pitchClass(spelled[0]);
            const alter = modulo(pc - natural + 6, 12) - 6;
            return { step: letter + 7 * ((midi - natural - alter) / 12 - 1), alter };
        });
    }

    // A chart as the page keeps it, or null: a title, a key, beats in a bar,
    // and sections, each a name, how many times it's played, and bars of one
    // to four chords (or % for the bar before's).
    function cleanChart(raw) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        const title = String(raw.title ?? "").replace(/[\u0000-\u001F\u007F"]/g, "").trim().slice(0, CHART_LIMITS.title);
        const key = { root: raw.root, scale: raw.scale };
        if (!title || !isKey(key)) return null;
        // A time signature (2.4.0), when given, sets the beats in a bar.
        const meters = globalThis.MaestroMetronome?.METERS ?? {};
        const meter = raw.meter === undefined ? null : raw.meter;
        if (meter !== null && (typeof meter !== "string" || !Object.hasOwn(meters, meter))) return null;
        const beats = meter ? meters[meter].length : raw.beats;
        if (!Number.isInteger(beats) || beats < 1 || beats > CHART_LIMITS.beats) return null;
        if (!Array.isArray(raw.sections) || !raw.sections.length || raw.sections.length > CHART_LIMITS.sections) return null;
        let total = 0;
        const sections = [];
        for (const section of raw.sections) {
            if (!section || typeof section !== "object") return null;
            const name = String(section.name ?? "").replace(/[\u0000-\u001F\u007F"]/g, "").trim().slice(0, CHART_LIMITS.section);
            const repeat = section.repeat ?? 1;
            if (!Number.isInteger(repeat) || repeat < 1 || repeat > CHART_LIMITS.repeat) return null;
            if (!Array.isArray(section.bars) || !section.bars.length || section.bars.length > CHART_LIMITS.bars) return null;
            const bars = [];
            for (const bar of section.bars) {
                if (!Array.isArray(bar) || !bar.length || bar.length > CHART_LIMITS.perBar) return null;
                // Chords are chord symbols (2.4.0), as a saved chord's name
                // is, each with a voicing written or none (2.7.0).
                const chords = bar.map(each => {
                    if (each === REPEAT_BAR) return each;
                    const text = String(each ?? "");
                    const name = M.cleanChordName(slotChord(text));
                    if (!M.isChordName(name)) return "";
                    if (!text.includes("=")) return name;
                    const midis = slotVoicing(text);
                    return midis ? voicedSlot(name, midis) : "";
                });
                if (chords.some(each => !each || (each === REPEAT_BAR && bar.length > 1))) return null;
                if (chords[0] === REPEAT_BAR && !bars.length) return null;
                bars.push(chords);
            }
            total += bars.length;
            sections.push({ name, repeat, bars });
        }
        if (total > CHART_LIMITS.totalBars) return null;
        return { title, root: key.root, scale: key.scale, beats, ...(meter ? { meter } : {}), sections };
    }

    // A chart as text (2.4.0), as AHK checks and keeps it: the first line names
    // the format; then the title, key, scale and time signature, tab-separated;
    // then a line a section: its name, times played, and its bars, each bar's
    // chords separated by spaces (chord symbols have none). A chart with a
    // voicing written (2.7.0) is format 2, so a Maestro before it, which
    // couldn't read one, leaves the song out rather than misreading it; one
    // with none stays format 1.
    const CHART_FORMAT = "Maestro chart 1";
    const CHART_FORMAT_VOICED = "Maestro chart 2";
    function chartText(chart) {
        const head = [chart.title, chart.root, chart.scale, chart.meter ?? `${chart.beats}/4`].join("\t");
        const lines = chart.sections.map(section => [section.name, String(section.repeat), ...section.bars.map(bar => bar.join(" "))].join("\t"));
        return [isVoiced(chart) ? CHART_FORMAT_VOICED : CHART_FORMAT, head, ...lines].join("\n");
    }
    // Whether a chart's text is more than AHK keeps in a file.
    const chartTooLarge = text => new TextEncoder().encode(text).length > CHART_LIMITS.bytes;
    function readChartText(text) {
        const lines = String(text ?? "").replace(/\r\n/g, "\n").trim().split("\n");
        if (lines.length < 3 || (lines[0] !== CHART_FORMAT && lines[0] !== CHART_FORMAT_VOICED)) return null;
        // Only format 2 has voicings.
        if (lines[0] === CHART_FORMAT && lines.slice(2).some(line => line.includes("="))) return null;
        const head = lines[1].split("\t");
        if (head.length !== 4) return null;
        const [title, root, scale, meter] = head;
        const sections = lines.slice(2).map(line => {
            const [name, repeat, ...bars] = line.split("\t");
            return { name, repeat: /^[1-8]$/.test(repeat ?? "") ? Number(repeat) : NaN, bars: bars.map(bar => bar.split(" ")) };
        });
        return cleanChart({ title, root, scale, meter, sections });
    }

    // A chart as it's played: every chord in order, with its section, bar,
    // first beat and beats, sections repeated and % bars filled in.
    function chartTimeline(chart) {
        const events = [];
        let beat = 0;
        let bar = 0;
        for (const [at, section] of chart.sections.entries()) {
            for (let time = 0; time < section.repeat; time++) {
                let before = null;
                for (const [written, bars] of section.bars.entries()) {
                    const chords = bars[0] === REPEAT_BAR ? before : bars;
                    before = chords;
                    // The bar's beats shared out, the first chords taking any left over.
                    const share = Math.floor(chart.beats / chords.length);
                    let extra = chart.beats - share * chords.length;
                    for (const [slot, token] of chords.entries()) {
                        const beats = share + (extra-- > 0 ? 1 : 0);
                        // A repeated bar plays the voicings of the one it repeats (2.7.0).
                        if (beats > 0) events.push({ chord: slotChord(token), voicing: slotVoicing(token), section: at, bar, written, slot, start: beat, beats });
                        beat += beats;
                    }
                    bar += 1;
                }
            }
        }
        return events;
    }

    // A chart poured into a form (2.6.0): sections given as [name, bars,
    // times played]. Its bars, repeats written out, fill the form in order; a
    // section named as one before plays that one's bars again (AABA's last A
    // is the first A); bars still wanted take `filler`, the key's first chord.
    function chartInForm(chart, form, filler) {
        const source = [];
        for (const section of chart.sections) {
            let before = null;
            for (const bar of section.bars) {
                const chords = bar[0] === REPEAT_BAR ? before : bar;
                before = chords;
                if (chords) source.push([...chords]);
            }
        }
        const written = new Map();
        let next = 0;
        const sections = form.map(([name, bars, repeat]) => {
            const label = String(name ?? "").trim();
            if (label && written.has(label) && written.get(label).length === bars) return { name: label, repeat, bars: written.get(label).map(bar => [...bar]) };
            const filled = Array.from({ length: bars }, () => (next < source.length ? source[next++] : [filler]));
            if (label) written.set(label, filled);
            return { name: label, repeat, bars: filled.map(bar => [...bar]) };
        });
        return cleanChart({ ...chart, sections });
    }

    // ---- A chart on a grand staff (2.7.0)

    // A length in eighths as notes, longest first, to be tied: 7/8's bar is
    // a dotted half and an eighth.
    const STAFF_LENGTHS = [[12, "w", true], [8, "w", false], [6, "h", true], [4, "h", false], [3, "q", true], [2, "q", false], [1.5, "e", true], [1, "e", false], [0.75, "s", true], [0.5, "s", false], [0.25, "t", false], [0.125, "f", false]];
    function staffLengths(eighths) {
        const pieces = [];
        let left = eighths;
        while (left > 1e-9) {
            const fit = STAFF_LENGTHS.find(([length]) => length <= left + 1e-9);
            if (!fit) break;
            pieces.push({ d: fit[1], dot: fit[2] });
            left -= fit[0];
        }
        return pieces;
    }

    // A key's signature on the staff: a mode's own; a mode of the major,
    // harmonic or melodic minor scale its parent's (C Phrygian dominant, F
    // harmonic minor's: four flats), the one with fewest sharps or flats; any
    // other scale the major's or minor's on its root, by its third.
    function keySignature(key) {
        const N = globalThis.MaestroNotation;
        if (!N || !isKey(key)) return 0;
        if (Object.hasOwn(N.MODES, key.scale)) return N.keyFifths(key.root, key.scale) ?? 0;
        const pcs = pcsOf(key);
        let best = null;
        for (const root of M.ROOTS) for (const [scale, mode] of [["major", "major"], ["harmonic", "minor"], ["melodic", "minor"]]) {
            const fifths = pcsOf({ root, scale }) === pcs ? N.keyFifths(root, mode) : null;
            if (fifths !== null && (best === null || Math.abs(fifths) < Math.abs(best))) best = fifths;
        }
        return best ?? N.keyFifths(key.root, keyIsMinor(key) ? "minor" : "major") ?? 0;
    }

    // A voicing's notes for the staff, a hand each: from middle C up the
    // right, below it the left, at most eight a hand; on one staff (an
    // instrument's own, 2.7.0: `staves` 1) all on it, at most eight, the
    // lowest left out. Spelled by
    // spellVoicing, two notes on one line or space of a hand are spelled
    // apart (the upper a letter up, else the lower a letter down, else it's
    // left out); a note outside the piano's range isn't written.
    function staffHands(name, midis, key, staves = 2) {
        const N = globalThis.MaestroNotation;
        const notes = spellVoicing(name, midis, key).map((p, at) => ({ midi: midis[at], p })).filter(each => N.isPitch(each.p));
        const hands = staves === 1 ? [notes.slice(-N.CHORD_MAX)] : [notes.filter(each => each.midi >= 60), notes.filter(each => each.midi < 60)];
        while (staves !== 1 && hands[0].length > N.CHORD_MAX) hands[1].push(hands[0].shift());
        while (staves !== 1 && hands[1].length > N.CHORD_MAX) hands[0].unshift(hands[1].pop());
        const respelled = (midi, step) => {
            const alter = midi - N.midiOf(N.pitch(step, 0));
            return alter >= -2 && alter <= 2 && N.isPitch(N.pitch(step, alter)) ? N.pitch(step, alter) : null;
        };
        return hands.map(hand => {
            const kept = [];
            for (const note of hand) {
                const before = kept.at(-1);
                if (!before || note.p.step > before.p.step) {
                    kept.push(note);
                    continue;
                }
                const up = respelled(note.midi, before.p.step + 1);
                const down = respelled(before.midi, note.p.step - 1);
                if (up) kept.push({ midi: note.midi, p: up });
                else if (down && (kept.length < 2 || kept.at(-2).p.step < down.step)) kept.splice(-1, 1, { midi: before.midi, p: down }, note);
            }
            return kept;
        });
    }

    // A chart as written on a grand staff (or, 2.7.0, on the staves `clefs`
    // names: one for a stringed instrument): its sections once each, their
    // bars in order (a % bar empty, for its sign), each chord for as long as
    // it's played (tied over where one note won't do), its voicing split
    // between the hands. voicingOf(chord) gives the notes for each chord
    // written ({ name, voicing, section, bar, slot, index }, in order), the
    // voicing written or one chosen. meter: the metronome's ("7/8:3+2+2").
    // Returns { score, chords, bars, sections }, or null: chords as written,
    // each with where its notes are on each hand's staff; bars, each one's
    // section and whether it repeats the one before (and its rests, if it
    // does); sections, each one's first and last bar.
    const STAFF_NOTES_MAX = 4096;
    function chartScore(chart, meter, voicingOf, key, clefs = ["treble", "bass"]) {
        const N = globalThis.MaestroNotation;
        const match = /^(\d{1,2})\/(\d{1,2})(?::(\d(?:\+\d)+))?$/.exec(String(meter ?? ""));
        if (!N || !match) return null;
        const [beats, unit] = [Number(match[1]), Number(match[2])];
        const groups = match[3] ? match[3].split("+").map(Number) : null;
        const voices = clefs.map(() => []);
        const chords = [];
        const bars = [];
        const sections = [];
        const rests = (hand, eighths) => staffLengths(eighths).forEach(piece => voices[hand].push({ p: null, d: piece.d, dot: piece.dot, tie: false }));
        let onset = 0;
        let index = 0;
        chart.sections.forEach((section, s) => {
            const first = bars.length;
            section.bars.forEach((bar, b) => {
                const barEighths = beats * 8 / unit;
                bars.push({ section: s, bar: b, repeat: bar[0] === REPEAT_BAR, onset });
                if (bar[0] === REPEAT_BAR) {
                    // Its rests, each hand's [from, to), drawn as the sign instead.
                    bars.at(-1).notes = voices.map((_, hand) => {
                        const from = voices[hand].length;
                        rests(hand, barEighths);
                        return [from, voices[hand].length];
                    });
                    onset += barEighths;
                    return;
                }
                // The bar's beats shared out as the chart plays them (chartTimeline).
                const share = Math.floor(beats / bar.length);
                let extra = beats - share * bar.length;
                bar.forEach((token, slot) => {
                    const chordBeats = share + (extra-- > 0 ? 1 : 0);
                    const entry = { name: slotChord(token), voicing: slotVoicing(token), section: s, bar: b, slot, index: index++ };
                    if (chordBeats <= 0) return;
                    const eighths = chordBeats * 8 / unit;
                    const midis = voicingOf(entry) ?? [];
                    const hands = staffHands(entry.name, midis, key, clefs.length);
                    const pieces = staffLengths(eighths);
                    const staves = hands.map((hand, h) => {
                        const at = voices[h].length;
                        pieces.forEach((piece, n) => {
                            if (!hand.length) voices[h].push({ p: null, d: piece.d, dot: piece.dot, tie: false });
                            else voices[h].push({ p: hand[0].p, more: hand.slice(1).map(each => each.p), d: piece.d, dot: piece.dot, tie: n < pieces.length - 1 });
                        });
                        return { note: at, notes: pieces.length, midis: hand.map(each => each.midi) };
                    });
                    chords.push({ ...entry, written: Boolean(entry.voicing), midis: [...midis], onset, length: eighths, staves });
                    onset += eighths;
                });
            });
            sections.push({ name: section.name, repeat: section.repeat, first, last: bars.length - 1 });
        });
        const score = N.cleanScore({
            title: "", key: { fifths: keySignature(key), mode: "major" }, meter: { beats, unit, ...(groups ? { groups } : {}) },
            staves: clefs.map((clef, hand) => ({ clef, voices: [{ name: clefs.length === 1 ? "Chords" : hand === 0 ? "Right hand" : "Left hand", notes: voices[hand] }] }))
        }, { notesMax: STAFF_NOTES_MAX });
        return score ? { score, chords, bars, sections } : null;
    }

    // A chart in another key: every chord moved by the interval between
    // roots, and its voicing with it (2.7.0; dropped if it would leave the range).
    function transposeChart(chart, root) {
        if (!isKey({ root, scale: chart.scale })) return null;
        const semis = modulo(M.pitchClass(root) - M.pitchClass(chart.root), 12);
        const move = token => {
            if (token === REPEAT_BAR) return token;
            const name = slotChord(token);
            const midis = slotVoicing(token);
            return voicedSlot(transposeChord(name, chart.root, root) ?? name, midis ? moveVoicing(midis, semis) : null);
        };
        return { ...chart, root, sections: chart.sections.map(section => ({ ...section, bars: section.bars.map(bar => bar.map(move)) })) };
    }

    // ---- Keys (2.4.0)

    // The circle of fifths, from C clockwise: each major key with its relative
    // minor and its signature (sharps to five, then flats).
    const CIRCLE = Object.freeze([
        ["C", "A", ""], ["G", "E", "1♯"], ["D", "B", "2♯"], ["A", "F♯", "3♯"], ["E", "C♯", "4♯"], ["B", "G♯", "5♯"],
        ["G♭", "E♭", "6♭"], ["D♭", "B♭", "5♭"], ["A♭", "F", "4♭"], ["E♭", "C", "3♭"], ["B♭", "G", "2♭"], ["F", "D", "1♭"]
    ].map(([major, minor, signature]) => Object.freeze({ major, minor, signature })));
    const pcsOf = key => keyNotes(key).map(note => note.pc).sort((a, b) => a - b).join();
    const hasMajorThird = key => keyNotes(key)[2]?.pc === modulo(M.pitchClass(key.root) + 4, 12);
    const plainKey = key => isKey(key) && !keyNotes(key).some(note => /[\u{1D12A}\u{1D12B}]/u.test(note.name));

    // Where a key sits on the circle: { index, ring }. A mode of the major scale
    // sits with the major key of its notes (D dorian with C), on a ring only if
    // it's that key or its relative minor (ring null); any other scale sits by
    // its root, on the major ring if its third is major.
    function circlePlace(key) {
        if (!isKey(key)) return null;
        const ring = hasMajorThird(key) ? "major" : "minor";
        const parent = CIRCLE.findIndex(each => pcsOf({ root: each.major, scale: "major" }) === pcsOf(key));
        if (parent >= 0) return { index: parent, ring: key.scale === "major" || key.scale === "minor" ? ring : null };
        const pc = M.pitchClass(key.root);
        return { index: CIRCLE.findIndex(each => M.pitchClass(each[ring]) === pc), ring };
    }

    // A major or minor chord's place on the circle: its root's key, on the ring
    // of its third. Diminished, augmented and suspended chords have none.
    function chordOnCircle(name) {
        const chord = parseChord(name);
        if (!chord) return null;
        const formula = formulaOf(chord.suffix);
        const third = formula.find(([, degree]) => degree === 3)?.[0];
        const fifth = formula.find(([, degree]) => degree === 5)?.[0];
        if ((third !== 3 && third !== 4) || (fifth !== undefined && fifth !== 7)) return null;
        const ring = third === 4 ? "major" : "minor";
        const pc = M.pitchClass(chord.root);
        return { index: CIRCLE.findIndex(each => M.pitchClass(each[ring]) === pc), ring };
    }

    // Whether a chord belongs to a key: its notes are all in it, or, in a minor
    // key, it's the harmonic minor's V or vii (E7 or G♯°7 in A minor).
    function keyHolds(name, key) {
        if (isDiatonic(name, key)) return true;
        const chord = parseChord(name);
        if (!chord || key.scale !== "minor" || !isDiatonic(name, { root: key.root, scale: "harmonic" })) return false;
        const { degree, shift } = placeInKey(chord.root, key);
        return (degree === 4 && shift === 0) || (degree === 6 && shift === 1);
    }

    // The keys a sketch's chords fit, best first: every major and minor key, with
    // how many of its chords (each counted once) are in it (keyHolds), and those
    // that aren't.
    // Ties go to the key the sketch ends on, then begins on, then to major. A
    // key is spelled as the chords spell its root, if that needs no double
    // sharps or flats (C♯ major for C♯ F♯ G♯7). [{ root, scale, fits, total, outside }]
    function findKey(names, most = 3) {
        const chords = [...new Set(names)].filter(name => parseChord(name));
        if (!chords.length) return [];
        const roots = chords.map(name => parseChord(name).root);
        const spelled = (root, scale) => {
            const own = roots.find(each => each !== root && M.pitchClass(each) === M.pitchClass(root) && M.ROOTS.includes(each));
            return own && plainKey({ root: own, scale }) ? own : root;
        };
        const opening = chordOnCircle(names[0]);
        const closing = chordOnCircle(names.at(-1));
        const isTonic = (place, index, ring) => Boolean(place) && place.index === index && place.ring === ring;
        return CIRCLE.flatMap((each, index) => ["major", "minor"].map(ring => {
            const key = { root: spelled(each[ring], ring), scale: ring };
            const outside = chords.filter(name => !keyHolds(name, key));
            const score = (chords.length - outside.length) * 10 + (isTonic(closing, index, ring) ? 4 : 0) + (isTonic(opening, index, ring) ? 2 : 0) + (ring === "major" ? 1 : 0);
            return { ...key, fits: chords.length - outside.length, total: chords.length, outside, score };
        })).sort((a, b) => b.score - a.score).slice(0, most).map(({ score, ...each }) => each);
    }

    // Chords two keys share, a way from one to the other: [{ name, from, to }],
    // the chord as the first key spells it, and its numeral in each.
    function pivotChords(from, to, size = 3) {
        if (!isKey(from) || !isKey(to)) return [];
        const theirs = M.chordsInKey(to.root, to.scale, size);
        const notes = chord => chord.tones.map(tone => tone.pc).join();
        return M.chordsInKey(from.root, from.scale, size).flatMap(chord => {
            const match = theirs.find(other => notes(other) === notes(chord));
            return match ? [{ name: chord.name, from: chord.numeral, to: match.numeral }] : [];
        });
    }

    // ---- The bass (2.4.0)

    const BASS_LOW = 28, BASS_HIGH = 52;     // E1 to E3
    // The note of pitch class `pc` in the bass's range nearest `to`.
    function bassNear(pc, to) {
        let best = null;
        for (let midi = BASS_LOW; midi <= BASS_HIGH; midi++) {
            if (modulo(midi - pc, 12) === 0 && (best === null || Math.abs(midi - to) < Math.abs(best - to))) best = midi;
        }
        return best;
    }

    // A bass line for a chart's timeline, played around and around: { start,
    // midi } a note. "roots" plays each chord's bass (its root, or a slash
    // chord's bass) as it starts. "walking" takes a step on every beat (in 6/8
    // and the odd meters, on each group's first; `weights` is the metronome's
    // bar): the bass, then the chord's notes, upward from a low bass and
    // downward from a high one, and last a half step into the next chord's.
    function bassLine(timeline, weights, style = "roots") {
        const events = timeline.filter(event => chordTones(event.chord).length);
        if (!events.length || !weights?.length) return [];
        const grouped = weights.includes(2);
        const isStep = beat => !grouped || weights[beat % weights.length] >= 2;
        const bassPc = event => chordTones(event.chord)[0].pc;
        const home = bassNear(bassPc(events[0]), 38);
        const notes = [];
        let last = home;
        events.forEach((event, index) => {
            const root = index === 0 ? home : bassNear(bassPc(event), last);
            const beats = [event.start];
            if (style === "walking") {
                for (let beat = event.start + 1; beat < event.start + event.beats; beat++) if (isStep(beat)) beats.push(beat);
            }
            const line = [root];
            if (beats.length > 1) {
                const pcs = new Set(chordTones(event.chord).map(tone => tone.pc));
                const ladder = [];
                for (let midi = BASS_LOW; midi <= BASS_HIGH; midi++) if (pcs.has(modulo(midi, 12))) ladder.push(midi);
                let at = ladder.indexOf(root);
                let step = root < 40 ? 1 : -1;
                while (line.length < beats.length - 1) {
                    if (ladder[at + step] === undefined) step = -step;
                    at += step;
                    line.push(ladder[at]);
                }
                const after = line.at(-1);
                const next = index === events.length - 1 ? home : bassNear(bassPc(events[index + 1]), after);
                let approach = next + (next > after ? -1 : 1);
                if (approach === after || approach < BASS_LOW || approach > BASS_HIGH) approach = next + (approach > next ? -1 : 1);
                line.push(approach);
            }
            beats.forEach((beat, at) => notes.push({ start: beat, midi: line[at] }));
            last = line.at(-1);
        });
        return notes;
    }

    // ---- Voicings (2.6.0): where a chord can be played, and a way through a
    // progression that moves as little as it can.

    // The notes a voicing may leave out: an unaltered fifth, and under an
    // eleventh or thirteenth the ninth and eleventh below it. Everything else
    // (the root, the third or sus note, the sixth or seventh, and the note the
    // chord is named for) is played.
    function optionalTones(tones) {
        const top = Math.max(...tones.map(tone => tone.degree));
        return new Set(tones.filter(tone => (tone.degree === 5 && modulo(tone.pc - tones.find(each => each.degree === 1)?.pc, 12) === 7)
            || (top >= 11 && tone.degree === 9) || (top === 13 && tone.degree === 11)).map(tone => tone.pc));
    }

    // Shapes on a neck: on each string one fret or none, within `span` frets
    // (open strings too, low on the neck); every note the chord's, holding all
    // it must; the bass the named one in a slash chord, else any chord tone;
    // no more than one silent string between sounding ones; as one hand can
    // finger it (four fingers, a barre across the lowest fret counting as one).
    // `pitches` are the open strings, lowest first. Easiest first.
    const SHAPE_SPAN = 4;
    function chordShapes(name, pitches, frets, { span = SHAPE_SPAN, limit = 30 } = {}) {
        const tones = chordTones(name);
        const strings = pitches.length;
        if (!tones.length || !strings) return [];
        const chord = parseChord(name);
        const rootPc = M.pitchClass(chord.root);
        const pcs = [...new Set(tones.map(tone => tone.pc))];
        const optional = optionalTones(tones);
        const required = pcs.filter(pc => !optional.has(pc));
        const slashBass = chord.bass ? M.pitchClass(chord.bass) : null;
        const fewest = Math.min(strings, strings >= 6 ? 4 : 3);
        const found = new Map();
        for (let low = 1; low + span - 1 <= frets; low++) {
            const choices = pitches.map(open => {
                const list = [null];
                if (low <= 4 && pcs.includes(modulo(open, 12))) list.push(0);
                for (let fret = low; fret < low + span; fret++) if (pcs.includes(modulo(open + fret, 12))) list.push(fret);
                return list;
            });
            const pick = new Array(strings).fill(null);
            const walk = string => {
                if (string === strings) return consider();
                for (const fret of choices[string]) {
                    pick[string] = fret;
                    walk(string + 1);
                }
            };
            const consider = () => {
                const sounding = pick.map((fret, string) => (fret === null ? -1 : string)).filter(string => string >= 0);
                if (sounding.length < fewest) return;
                const first = sounding[0], last = sounding.at(-1);
                const gaps = last - first + 1 - sounding.length;
                if (gaps > 1) return;
                const midis = sounding.map(string => pitches[string] + pick[string]);
                const have = new Set(midis.map(midi => modulo(midi, 12)));
                if (!required.every(pc => have.has(pc))) return;
                // The lowest note, not the lowest string: a ukulele's G string is high.
                const bass = modulo(Math.min(...midis), 12);
                if (slashBass !== null && bass !== slashBass) return;
                const fretted = sounding.map(string => pick[string]).filter(fret => fret > 0);
                const lowest = fretted.length ? Math.min(...fretted) : 0;
                const highest = fretted.length ? Math.max(...fretted) : 0;
                const barre = fretted.filter(fret => fret === lowest).length >= 2;
                // A barre lies across every string from its lowest up: none of them can ring open.
                if (barre && sounding.some(string => pick[string] === 0 && string > sounding.find(each => pick[each] === lowest))) return;
                const fingers = barre ? 1 + fretted.filter(fret => fret > lowest).length : fretted.length;
                if (fingers > 4) return;
                const key = pick.map(fret => (fret === null ? "x" : fret)).join(",");
                if (found.has(key)) return;
                const opens = sounding.filter(string => pick[string] === 0).length;
                const cost = (bass === (slashBass ?? rootPc) ? 0 : 4)
                    + (strings - sounding.length) * 0.6 + gaps * 1.5
                    + [...optional].filter(pc => !have.has(pc)).length * 0.5
                    + lowest * 0.08 + fingers * 0.3 + (barre ? 0.5 : 0) + (highest - lowest) * 0.2 - opens * 0.2;
                const bassTone = tones.find(tone => tone.pc === bass);
                found.set(key, Object.freeze({
                    frets: Object.freeze([...pick]), midis: Object.freeze(midis), low: lowest, high: highest,
                    bass: bassTone?.name ?? "", bassDegree: bassTone?.degree ?? 0, open: opens > 0, barre, cost
                }));
            };
            walk(0);
        }
        return [...found.values()].sort((a, b) => a.cost - b.cost || a.low - b.low).slice(0, limit);
    }

    // Voicings on a keyboard: close position from the root and each inversion,
    // drop 2 (the second note from the top an octave lower), a shell (root,
    // third and seventh) and an open voicing (the root low, the rest above).
    // Each { midis, kind, inversion }; nothing below `low`.
    function keyVoicings(name, { low = 48 } = {}) {
        const tones = chordTones(name);
        if (!tones.length) return [];
        const pcs = [...new Set(tones.map(tone => tone.pc))];
        const close = from => {
            const notes = [];
            let floor = low + modulo(pcs[from] - low, 12);
            for (let at = 0; at < pcs.length; at++) {
                const pc = pcs[(from + at) % pcs.length];
                const midi = floor + modulo(pc - floor, 12);
                notes.push(midi);
                floor = midi + 1;
            }
            return notes;
        };
        const list = [];
        const push = (midis, kind, inversion = 0) => {
            const key = midis.join(",");
            if (midis.length && !list.some(each => each.key === key)) list.push({ key, midis: Object.freeze(midis), kind, inversion });
        };
        // A slash chord keeps its bass at the bottom.
        const turns = tones[0].degree === 1 ? pcs.map((_, at) => at) : [0];
        for (const turn of turns) push(close(turn), "close", turn);
        if (pcs.length >= 4) {
            for (const turn of turns) {
                const notes = close(turn);
                const dropped = notes.at(-2) - 12;
                if (dropped >= low - 12) push([dropped, ...notes.filter((_, at) => at !== notes.length - 2)].sort((a, b) => a - b), "drop2", turn);
            }
        }
        const third = tones.find(tone => [2, 3, 4].includes(tone.degree));
        const seventh = tones.find(tone => tone.degree === 7 || tone.degree === 6);
        const rootMidi = low + modulo(pcs[0] - low, 12);
        if (third && seventh && tones[0].degree === 1) {
            const up = pc => rootMidi + 1 + modulo(pc - rootMidi - 1, 12);
            push([rootMidi, up(third.pc), up(seventh.pc)].sort((a, b) => a - b), "shell");
        }
        if (pcs.length >= 3) {
            const rest = pcs.slice(1);
            let floor = rootMidi + 7;
            const upper = rest.map(pc => {
                const midi = floor + modulo(pc - floor, 12);
                floor = midi + 1;
                return midi;
            });
            push([rootMidi, ...upper], "open");
        }
        return list.map(({ key, ...each }) => Object.freeze(each));
    }

    // A written voicing's place on a neck (2.7.0): a fret or none (null) on
    // each string, each note on a string of its own, the hand within four
    // frets if it can be and as low and narrow as it can be. `pitches` are the open strings. null if the
    // neck can't play it.
    function fretsForVoicing(midis, pitches, frets) {
        if (!midis.length || midis.length > pitches.length) return null;
        const pick = new Array(pitches.length).fill(null);
        let best = null;
        const place = at => {
            const fretted = pick.filter(fret => fret !== null && fret > 0);
            const low = fretted.length ? Math.min(...fretted) : 0;
            const width = fretted.length ? Math.max(...fretted) - low : 0;
            // The hand's width alone, as low can only fall: four frets reach easily.
            const reach = width * 4 + Math.max(0, width - SHAPE_SPAN + 1) * 30;
            if (best && reach > best.cost) return;
            if (at === midis.length) {
                const cost = reach + low;
                if (!best || cost < best.cost) best = { cost, frets: [...pick] };
                return;
            }
            pitches.forEach((open, string) => {
                const fret = midis[at] - open;
                if (pick[string] !== null || fret < 0 || fret > frets) return;
                pick[string] = fret;
                place(at + 1);
                pick[string] = null;
            });
        };
        place(0);
        return best ? best.frets : null;
    }

    // How far a hand and its notes travel from one voicing to the next: the
    // notes paired from the top down, and on a neck the hand's move along it.
    function voicingDistance(a, b) {
        const x = [...a.midis].sort((m, n) => n - m), y = [...b.midis].sort((m, n) => n - m);
        let moved = 0;
        for (let at = 0; at < Math.max(x.length, y.length); at++) moved += Math.abs((x[at] ?? x.at(-1)) - (y[at] ?? y.at(-1)));
        if (a.frets && b.frets) {
            const middle = shape => (shape.low + shape.high) / 2;
            moved += Math.abs(middle(a) - middle(b)) * 1.5;
        }
        return moved;
    }

    // A voicing for each chord, as smooth a way through as there is: each
    // chord's choices (easiest first, each with its cost), and any pinned by
    // index. Returns each chord's choice by index, -1 for a chord with none.
    function smoothVoicings(choices, pins = []) {
        const result = choices.map(() => -1);
        const kept = choices.map((_, k) => k).filter(k => choices[k].length);
        if (!kept.length) return result;
        const allowed = (k, index) => !Number.isInteger(pins[k]) || pins[k] < 0 || pins[k] >= choices[k].length || pins[k] === index;
        const own = (voicing, index) => voicing.cost ?? index * 0.3;
        let best = choices[kept[0]].map((voicing, index) => (allowed(kept[0], index) ? { total: own(voicing, index), path: [index] } : null));
        for (let n = 1; n < kept.length; n++) {
            const before = choices[kept[n - 1]];
            best = choices[kept[n]].map((voicing, index) => {
                if (!allowed(kept[n], index)) return null;
                let choice = null;
                before.forEach((from, at) => {
                    if (!best[at]) return;
                    const total = best[at].total + voicingDistance(from, voicing) + own(voicing, index);
                    if (!choice || total < choice.total) choice = { total, path: best[at].path.concat(index) };
                });
                return choice;
            });
        }
        const winner = best.filter(Boolean).sort((a, b) => a.total - b.total)[0];
        winner?.path.forEach((index, n) => { result[kept[n]] = index; });
        return result;
    }

    // ---- Cadences and ways to another key (2.6.0)

    // Closes, as numerals in a major and a minor key (null where it has none
    // there); a numeral may be [numeral, inversion]: the Phrygian half
    // cadence's iv has its third in the bass.
    const CADENCES = Object.freeze([
        { id: "authentic", label: "Authentic", major: ["IV", "V7", "I"], minor: ["iv", "V7", "i"], text: "The dominant home to the tonic: the strongest close." },
        { id: "plagal", label: "Plagal", major: ["I", "IV", "I"], minor: ["i", "iv", "i"], text: "The subdominant to the tonic, the Amen: softer than the dominant." },
        { id: "half", label: "Half", major: ["I", "ii", "V"], minor: ["i", "iv", "V"], text: "Stops on the dominant, open: a comma rather than a full stop." },
        { id: "deceptive", label: "Deceptive", major: ["ii", "V7", "vi"], minor: ["iv", "V7", "VI"], text: "The dominant to the submediant: the close sidestepped, to go on." },
        { id: "twofive", label: "ii–V–I", major: ["ii7", "V7", "Imaj7"], minor: ["iiø7", "V7", "i7"], text: "The close of jazz and standards: a fifth, a fifth, home." },
        { id: "backdoor", label: "Backdoor", major: ["iv7", "♭VII7", "Imaj7"], minor: null, text: "Home from below, by the minor iv and ♭VII7, borrowed from the minor." },
        { id: "phrygian", label: "Phrygian half", major: null, minor: [["iv", 1], "V"], text: "The bass falls a half step onto the dominant: a Baroque pause." },
        { id: "picardy", label: "Picardy third", major: null, minor: ["iv", "V7", "I"], text: "A minor key closing on a major tonic." }
    ].map(Object.freeze));

    // Whether a key's third is minor: its cadences are the minor ones.
    const keyIsMinor = key => isKey(key) && modulo(keyNotes(key)[2].pc - keyNotes(key)[0].pc, 12) === 3;

    // A numeral's chord, or with [numeral, inversion] that chord over its third (or fifth).
    function numeralChord(item, key) {
        const [text, inversion] = Array.isArray(item) ? item : [item, 0];
        const name = chordFromNumeral(text, key);
        if (!name || !inversion) return name;
        const tones = chordTones(name);
        return tones[inversion] ? chordName({ ...parseChord(name), bass: tones[inversion].name }) : name;
    }

    // The cadences a key has: { id, label, text, numerals, chords }. A mode
    // takes those of its parallel major or minor (D dorian, D minor's).
    function cadencesIn(key) {
        if (!isKey(key)) return [];
        const side = keyIsMinor(key) ? "minor" : "major";
        const base = { root: key.root, scale: side };
        if (!isKey(base)) return [];
        return CADENCES.filter(cadence => cadence[side]).map(cadence => {
            const items = cadence[side];
            const chords = items.map(item => numeralChord(item, base));
            if (chords.some(chord => !chord)) return null;
            const numerals = items.map(item => (Array.isArray(item) ? `${item[0]}6` : item));
            return Object.freeze({ id: cadence.id, label: cadence.label, text: cadence.text, numerals: Object.freeze(numerals), chords: Object.freeze(chords) });
        }).filter(Boolean);
    }

    // Ways from one key to another, each a few chords from the old tonic to
    // the new: through a chord both keys hold, the new key's dominant, its
    // ii–V, or directly, when the two tonics share a note.
    function modulationRoutes(from, to) {
        if (!isKey(from) || !isKey(to)) return [];
        const minorTo = keyIsMinor(to);
        const home = chordFromNumeral(keyIsMinor(from) ? "i" : "I", from);
        const there = chordFromNumeral(minorTo ? "i" : "I", to);
        const dominant = chordFromNumeral("V7", to);
        const two = chordFromNumeral(minorTo ? "iiø7" : "ii7", to);
        if (!home || !there || !dominant) return [];
        const routes = [];
        // A pivot the new key hears as a chord before its dominant (ii, IV, vi) is best.
        const pivots = pivotChords(from, to, 3).filter(pivot => pivot.name !== home && pivot.name !== there);
        const leading = ["ii", "IV", "iv", "vi", "VI", "ii°"];
        const pivot = pivots.find(each => leading.includes(each.to)) ?? pivots[0];
        if (pivot) routes.push({ id: "pivot", label: "By a pivot chord", text: `${pivot.name} is ${pivot.from} here and ${pivot.to} there; then the new key's dominant.`, chords: [home, pivot.name, dominant, there] });
        routes.push({ id: "dominant", label: "By its dominant", text: `The new key's V7 (${dominant}), straight after the old tonic.`, chords: [home, dominant, there] });
        if (two) routes.push({ id: "twofive", label: "By its ii–V", text: "The new key's ii and V lead in: smooth in a song, common in jazz.", chords: [home, two, dominant, there] });
        const shared = chordTones(home).filter(tone => chordTones(there).some(other => other.pc === tone.pc));
        if (shared.length) routes.push({ id: "direct", label: "Directly", text: `The tonics share ${shared.map(tone => tone.name).join(" and ")}: the new one can simply follow, best after a cadence.`, chords: [home, there] });
        return routes.map(route => Object.freeze({ ...route, chords: Object.freeze(route.chords) }));
    }

    return {
        CIRCLE, circlePlace, chordOnCircle, keyHolds, findKey, pivotChords, bassLine, CADENCES, cadencesIn, keyIsMinor, modulationRoutes,
        FORMULAS, OPEN_SHAPES, CHART_LIMITS, REPEAT_BAR, VOICING_LOW, VOICING_HIGH, VOICING_MAX, isVoicing, staffLengths, keySignature, staffHands, chartScore, slotChord, slotVoicing, voicedSlot, isVoiced, moveVoicing, spellVoicing, fretsForVoicing, chartTooLarge, CHART_FORMAT_VOICED,
        formulaOf, parseChord, chordName, chordTones, isKey, placeInKey, isDiatonic, romanNumeral, nashville, chordFromNumeral,
        transposeChord, capoOptions, scalesForChord, guideTones, reharmonize, voiceChord, chartInForm, SHAPE_SPAN, chordShapes, keyVoicings, voicingDistance, smoothVoicings, cleanChart, chartTimeline, transposeChart, chartText, readChartText, CHART_FORMAT
    };
})();
