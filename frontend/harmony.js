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
    // from E2, and the rest in close position from E3, voiced as near as can
    // be to the chord before. MIDI numbers, low to high.
    function voiceChord(name, previous = null) {
        const tones = chordTones(name);
        if (!tones.length) return [];
        const bassPc = tones[0].pc;
        const bass = 40 + modulo(bassPc - 4, 12);
        const upper = [...new Set(tones.map(tone => tone.pc))];
        const candidates = upper.map((_, turn) => {
            const order = [...upper.slice(turn), ...upper.slice(0, turn)];
            const notes = [];
            let floor = 52;
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

    const CHART_LIMITS = Object.freeze({ title: 60, section: 24, sections: 12, bars: 64, totalBars: 256, perBar: 4, repeat: 8, beats: 12 });
    const REPEAT_BAR = "%";

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
                // Chords are chord symbols (2.4.0), as a saved chord's name is.
                const chords = bar.map(each => each === REPEAT_BAR ? each : (M.isChordName(M.cleanChordName(each)) ? M.cleanChordName(each) : ""));
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
    // chords separated by spaces (chord symbols have none).
    const CHART_FORMAT = "Maestro chart 1";
    function chartText(chart) {
        const head = [chart.title, chart.root, chart.scale, chart.meter ?? `${chart.beats}/4`].join("\t");
        const lines = chart.sections.map(section => [section.name, String(section.repeat), ...section.bars.map(bar => bar.join(" "))].join("\t"));
        return [CHART_FORMAT, head, ...lines].join("\n");
    }
    function readChartText(text) {
        const lines = String(text ?? "").replace(/\r\n/g, "\n").trim().split("\n");
        if (lines.length < 3 || lines[0] !== CHART_FORMAT) return null;
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
                    for (const [slot, chord] of chords.entries()) {
                        const beats = share + (extra-- > 0 ? 1 : 0);
                        if (beats > 0) events.push({ chord, section: at, bar, written, slot, start: beat, beats });
                        beat += beats;
                    }
                    bar += 1;
                }
            }
        }
        return events;
    }

    // A chart in another key: every chord moved by the interval between roots.
    function transposeChart(chart, root) {
        if (!isKey({ root, scale: chart.scale })) return null;
        const move = name => name === REPEAT_BAR ? name : (transposeChord(name, chart.root, root) ?? name);
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

    return {
        CIRCLE, circlePlace, chordOnCircle, keyHolds, findKey, pivotChords, bassLine,
        FORMULAS, OPEN_SHAPES, CHART_LIMITS, REPEAT_BAR,
        formulaOf, parseChord, chordName, chordTones, isKey, placeInKey, isDiatonic, romanNumeral, nashville, chordFromNumeral,
        transposeChord, capoOptions, scalesForChord, guideTones, reharmonize, voiceChord, cleanChart, chartTimeline, transposeChart, chartText, readChartText, CHART_FORMAT
    };
})();
