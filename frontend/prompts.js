"use strict";

// Writing prompts (2.4.0): a short brief to write a progression to, drawn at
// one of five levels of complexity, any part locked or chosen by hand. Each
// part is checked against the sketch on the Progressions tab. No page and no
// sound, so every part is tested on its own; `random` is Math.random unless a
// test gives its own.
globalThis.MaestroPrompts = (() => {
    const M = MaestroMusic;
    const H = MaestroHarmony;
    const T = MaestroMetronome;
    const FLAT = "♭", SHARP = "♯";
    const modulo = (value, base) => ((value % base) + base) % base;

    const LEVELS = Object.freeze(["Simple", "Moderate", "Colorful", "Advanced", "Experimental"]);
    // The parts of a prompt, in the sentence's order. A second device to use
    // comes from Colorful up, and something to avoid from Moderate up.
    const PARTS = Object.freeze(["form", "key", "meter", "tempo", "begin", "use", "use2", "avoid"]);
    const partsAt = level => PARTS.filter(part => (part !== "use2" || level >= 3) && (part !== "avoid" || level >= 2));
    const inLevel = (item, level) => level >= item.levels[0] && level <= item.levels[1];

    // ---- Keys: scales by level, and keys with at most so many sharps or
    // flats among their notes. No key needing a double sharp or flat.
    const KEY_SCALES = [
        ["major", "minor"],
        ["major", "minor"],
        ["major", "minor", "dorian", "mixolydian"],
        ["major", "minor", "dorian", "mixolydian", "phrygian", "lydian", "harmonic", "melodic"],
        ["dorian", "phrygian", "lydian", "mixolydian", "harmonic", "melodic", "phrygianDominant", "lydianDominant", "harmonicMajor", "doubleHarmonic", "hungarianMinor"]
    ];
    const KEY_ACCIDENTALS = [2, 4, 5, 7, 7];
    function keyAccidentals(key) {
        const names = M.scaleNotes(key.root, key.scale).map(note => note.name);
        if (names.some(name => /\u{1D12A}|\u{1D12B}/u.test(name))) return Infinity;
        return names.filter(name => name.includes(FLAT) || name.includes(SHARP)).length;
    }
    const keysAt = level => M.ROOTS.flatMap(root => KEY_SCALES[level - 1].map(scale => ({ root, scale })))
        .filter(key => H.isKey(key) && keyAccidentals(key) <= KEY_ACCIDENTALS[level - 1]);
    const keyLabel = key => `${key.root} ${M.SCALES[key.scale].label.replace(/ \(.*\)$/, "").toLowerCase()}`;

    // ---- Time
    const METERS_AT = [
        ["4/4", "3/4"],
        ["4/4", "3/4", "2/4", "6/8"],
        ["4/4", "3/4", "6/8", "12/8", "2/2"],
        ["3/4", "6/8", "9/8", "12/8", "5/4"],
        ["5/4", "7/4", "5/8", "5/8:2+3", "7/8", "7/8:3+2+2", "7/8:2+3+2", "9/8"]
    ];
    const TEMPI_AT = [[72, 120], [66, 132], [60, 152], [52, 176], [40, 208]];
    const TEMPO_STEP = 4;

    // ---- Forms: sections of so many bars, played so many times.
    const FORMS = [
        { id: "phrase8", label: "8-bar phrase", sections: [["", 8, 1]], levels: [1, 2] },
        { id: "period16", label: "16-bar period", sections: [["Antecedent", 8, 1], ["Consequent", 8, 1]], levels: [1, 3] },
        { id: "ab16", label: "16-bar AB", sections: [["A", 8, 1], ["B", 8, 1]], levels: [1, 3] },
        { id: "blues12", label: "12-bar blues", sections: [["", 12, 1]], levels: [2, 4] },
        { id: "verseChorus", label: "song of verse and chorus", sections: [["Verse", 8, 1], ["Chorus", 8, 1]], levels: [2, 4] },
        { id: "aaba32", label: "32-bar AABA", sections: [["A", 8, 2], ["B", 8, 1], ["A", 8, 1]], levels: [3, 5] },
        { id: "abac32", label: "32-bar ABAC", sections: [["A", 8, 1], ["B", 8, 1], ["A", 8, 1], ["C", 8, 1]], levels: [3, 5] },
        { id: "verseChorusBridge", label: "song with verse, chorus and bridge", sections: [["Verse", 8, 1], ["Chorus", 8, 1], ["Bridge", 8, 1], ["Chorus", 8, 1]], levels: [3, 5] },
        { id: "rondo", label: "rondo (ABACA)", sections: [["A", 8, 1], ["B", 8, 1], ["A", 8, 1], ["C", 8, 1], ["A", 8, 1]], levels: [4, 5] },
        { id: "aabaTag", label: "32-bar AABA with a 4-bar tag", sections: [["A", 8, 2], ["B", 8, 1], ["A", 8, 1], ["Tag", 4, 1]], levels: [4, 5] },
        { id: "through24", label: "24-bar through-composed ABC", sections: [["A", 8, 1], ["B", 8, 1], ["C", 8, 1]], levels: [4, 5] },
        { id: "phrases5", label: "20-bar AABA of 5-bar phrases", sections: [["A", 5, 2], ["B", 5, 1], ["A", 5, 1]], levels: [5, 5] },
        { id: "phrases7", label: "21-bar AAB of 7-bar phrases", sections: [["A", 7, 2], ["B", 7, 1]], levels: [5, 5] }
    ];
    const formBars = form => form.sections.reduce((sum, [, bars, repeat]) => sum + bars * repeat, 0);
    // "an 8-bar", "a 12-bar", "a song".
    const article = text => /^(8|11|18)(?!\d)|^[aeiou]/i.test(text) ? "an" : "a";

    // ---- Analysis of a sketch, shared by the checks.

    // A chord's root as a degree of the key (0 to 6) and how far it's moved.
    const degreeOf = (name, key) => {
        const chord = H.parseChord(name);
        return chord ? H.placeInKey(chord.root, key) : null;
    };
    const formula = name => {
        const chord = H.parseChord(name);
        return chord ? H.formulaOf(chord.suffix) : null;
    };
    const hasNote = (notes, degree, semis) => Boolean(notes?.some(([at, deg]) => deg === degree && at === semis));
    const isMajorish = name => hasNote(formula(name), 3, 4);
    const isMinorish = name => hasNote(formula(name), 3, 3);
    const isDominant = name => isMajorish(name) && hasNote(formula(name), 7, 10);
    const hasSeventh = name => Boolean(formula(name)?.some(([, degree]) => degree === 7));
    const isOn = (name, key, degree, shift = 0) => {
        const place = degreeOf(name, key);
        return Boolean(place) && place.degree === degree && place.shift === shift;
    };
    const rootPc = name => M.pitchClass(H.parseChord(name).root);
    const bassPc = name => {
        const chord = H.parseChord(name);
        return M.pitchClass(chord.bass || chord.root);
    };
    // The key a third major or minor away: the parallel key's chords are borrowed.
    const parallelOf = key => ({ root: key.root, scale: M.scaleNotes(key.root, key.scale)[2].pc === modulo(M.pitchClass(key.root) + 4, 12) ? "minor" : "major" });

    // The sketch's chords once through, a repeated bar's written out:
    // { name, section, bar, slot, where }.
    function sequence(sketch) {
        const list = [];
        const several = sketch.sections.length > 1;
        sketch.sections.forEach((section, s) => {
            let before = null;
            section.bars.forEach((bar, b) => {
                const chords = bar[0] === H.REPEAT_BAR ? before : bar;
                before = chords;
                (chords ?? []).forEach((name, slot) => {
                    if (H.parseChord(name)) list.push({ name, section: s, bar: b, slot, where: several ? `${String.fromCharCode(65 + s)}, bar ${b + 1}` : `bar ${b + 1}` });
                });
            });
        });
        return list;
    }
    const pairs = list => list.slice(0, -1).map((each, at) => [each, list[at + 1]]);
    const found = (each, numeral) => ({ met: true, why: `${each.name}${numeral ? ` (${numeral})` : ""} in ${each.where}.` });

    // ---- Devices to use: each with how it's found in a sketch.
    const USES = [
        { id: "plagal", text: "a plagal cadence (IV–I)", levels: [1, 3], check: (list, key) => {
            const pair = pairs(list).find(([a, b]) => isOn(a.name, key, 3) && isOn(b.name, key, 0));
            return pair ? found(pair[0]) : { met: false, why: "No chord on the fourth degree going to the first yet." };
        } },
        { id: "twoFiveOne", text: "a ii–V–I", levels: [1, 4], check: (list, key) => {
            const at = list.findIndex((each, index) => index + 2 < list.length && isOn(each.name, key, 1) && isOn(list[index + 1].name, key, 4) && isOn(list[index + 2].name, key, 0));
            return at >= 0 ? found(list[at]) : { met: false, why: "No chords on the second, fifth and first degrees in a row yet." };
        } },
        { id: "sus", text: "a suspended chord", levels: [2, 3], check: list => {
            const each = list.find(chord => /sus/.test(chord.name));
            return each ? found(each) : { met: false, why: "No sus chord yet." };
        } },
        { id: "inversion", text: "a chord in inversion", levels: [2, 4], check: list => {
            const each = list.find(chord => H.parseChord(chord.name).bass && bassPc(chord.name) !== rootPc(chord.name));
            return each ? found(each) : { met: false, why: "No slash chord over one of its own notes yet, like C/E." };
        } },
        { id: "deceptive", text: "a deceptive cadence", levels: [2, 4], check: (list, key) => {
            const pair = pairs(list).find(([a, b]) => isOn(a.name, key, 4) && isMajorish(a.name) && isOn(b.name, key, 5));
            return pair ? found(pair[0]) : { met: false, why: "No V going to the sixth degree yet." };
        } },
        { id: "secondary", text: "a secondary dominant", levels: [2, 5], check: (list, key) => {
            const each = list.find(chord => /^V[^/]*\/[^/]/.test(H.romanNumeral(chord.name, key)));
            return each ? found(each, H.romanNumeral(each.name, key)) : { met: false, why: "No secondary dominant yet." };
        } },
        { id: "borrowed", text: "a borrowed chord", levels: [3, 5], check: (list, key) => {
            const other = parallelOf(key);
            const each = list.find(chord => !H.isDiatonic(chord.name, key) && H.isDiatonic(chord.name, other));
            return each ? found(each, `from ${keyLabel(other)}`) : { met: false, why: `No chord from ${keyLabel(other)} yet.` };
        } },
        { id: "diminished", text: "a passing diminished chord", levels: [3, 5], check: (list, key) => {
            const each = list.find(chord => /°/.test(chord.name) && !H.isDiatonic(chord.name, key));
            return each ? found(each) : { met: false, why: "No diminished chord outside the key yet." };
        } },
        { id: "tritone", text: "a tritone substitute", levels: [4, 5], check: (list, key) => {
            const pair = pairs(list).find(([a, b]) => isDominant(a.name) && !H.isDiatonic(a.name, key) && modulo(rootPc(a.name) - rootPc(b.name), 12) === 1);
            return pair ? found(pair[0]) : { met: false, why: "No dominant seventh sliding down a half step yet." };
        } },
        { id: "backdoor", text: "a backdoor dominant (♭VII7–I)", levels: [4, 5], check: (list, key) => {
            const pair = pairs(list).find(([a, b]) => isDominant(a.name) && modulo(rootPc(a.name) - M.pitchClass(key.root), 12) === 10 && isOn(b.name, key, 0));
            return pair ? found(pair[0]) : { met: false, why: "No ♭VII7 going home yet." };
        } },
        { id: "modulation", text: "a section in another key", levels: [4, 5], check: (list, key, sketch) => {
            for (let s = 0; s < sketch.sections.length; s++) {
                const names = [...new Set(list.filter(each => each.section === s).map(each => each.name))];
                if (names.filter(name => !H.isDiatonic(name, key)).length < 2) continue;
                for (const root of M.ROOTS) for (const scale of ["major", "minor"]) {
                    const other = { root, scale };
                    if ((root === key.root && scale === key.scale) || !H.isKey(other)) continue;
                    if (names.every(name => H.isDiatonic(name, other))) return { met: true, why: `Section ${String.fromCharCode(65 + s)} is in ${keyLabel(other)}.` };
                }
            }
            return { met: false, why: "No section whose chords all belong to another key yet." };
        } },
        { id: "neapolitan", text: "a Neapolitan chord (♭II)", levels: [5, 5], check: (list, key) => {
            const each = list.find(chord => modulo(rootPc(chord.name) - M.pitchClass(key.root), 12) === 1 && isMajorish(chord.name));
            return each ? found(each) : { met: false, why: "No major chord a half step above the root yet." };
        } },
        { id: "mediant", text: "a chromatic mediant", levels: [5, 5], check: (list, key) => {
            const pair = pairs(list).find(([a, b]) => isMajorish(a.name) && isMajorish(b.name) && [3, 4, 8, 9].includes(modulo(rootPc(b.name) - rootPc(a.name), 12))
                && (!H.isDiatonic(a.name, key) || !H.isDiatonic(b.name, key)));
            return pair ? found(pair[1]) : { met: false, why: "No two major chords a third apart, one outside the key, yet." };
        } },
        { id: "pedal", text: "a pedal: three chords over one bass note", levels: [5, 5], check: list => {
            const at = list.findIndex((each, index) => index + 2 < list.length && bassPc(each.name) === bassPc(list[index + 1].name) && bassPc(each.name) === bassPc(list[index + 2].name)
                && new Set([each.name, list[index + 1].name, list[index + 2].name]).size > 1);
            return at >= 0 ? found(list[at]) : { met: false, why: "No three chords in a row over the same bass yet." };
        } }
    ];

    // ---- Things to avoid: met while none is in the sketch. Each names the
    // devices and beginnings it can't be drawn with.
    const numeralOn = (key, degree, size = 3) => M.chordsInKey(key.root, key.scale, size)[degree]?.numeral ?? "";
    const firstOffender = (list, test) => list.find(each => test(each.name));
    const absent = (each, numeral) => each ? { met: false, why: `${each.name}${numeral ? ` (${numeral})` : ""} in ${each.where}.` } : { met: true, why: "None in the sketch." };
    const AVOIDS = [
        { id: "noFive", text: key => `the ${numeralOn(key, 4)} chord`, levels: [2, 5], conflicts: ["deceptive", "twoFiveOne", "begin:5"],
            check: (list, key) => absent(firstOffender(list, name => isOn(name, key, 4)), "") },
        { id: "noFour", text: key => `the ${numeralOn(key, 3)} chord`, levels: [2, 4], conflicts: ["plagal", "begin:4"],
            check: (list, key) => absent(firstOffender(list, name => isOn(name, key, 3)), "") },
        { id: "noSevenths", text: () => "seventh chords", levels: [2, 4], conflicts: ["tritone", "backdoor"],
            check: list => absent(firstOffender(list, hasSeventh)) },
        { id: "noRepeat", text: () => "the same chord twice in a row", levels: [3, 5], conflicts: ["pedal"],
            check: list => {
                const pair = pairs(list).find(([a, b]) => a.name === b.name);
                return pair ? { met: false, why: `${pair[1].name} twice, in ${pair[1].where}.` } : { met: true, why: "None in the sketch." };
            } },
        { id: "noEarlyTonic", text: key => `the ${numeralOn(key, 0)} chord before the last bar`, levels: [3, 5], conflicts: ["begin:1", "plagal", "twoFiveOne", "backdoor"],
            check: (list, key, sketch) => {
                const lastSection = sketch.sections.length - 1;
                const lastBar = sketch.sections[lastSection].bars.length - 1;
                return absent(list.find(each => isOn(each.name, key, 0) && !(each.section === lastSection && each.bar === lastBar)));
            } },
        { id: "noTriads", text: () => "plain triads", levels: [4, 5], conflicts: ["mediant", "neapolitan", "begin:b6", "begin:b7", "begin:iv", "begin:b2"],
            check: list => absent(firstOffender(list, name => !hasSeventh(name) && (formula(name)?.length ?? 0) <= 3)) },
        { id: "noDominants", text: () => "dominant seventh chords", levels: [4, 5], conflicts: ["tritone", "backdoor", "begin:V7/V"],
            check: list => absent(firstOffender(list, isDominant)) }
    ];

    // ---- Where to begin: a degree of the key, or a chord from outside it.
    const BEGINS = [
        { id: "1", degree: 0, levels: [1, 5] },
        { id: "6", degree: 5, levels: [2, 5] },
        { id: "4", degree: 3, levels: [2, 5] },
        { id: "2", degree: 1, levels: [3, 5] },
        { id: "3", degree: 2, levels: [3, 5] },
        { id: "5", degree: 4, levels: [3, 5] },
        // Borrowed from the parallel minor: only in a key with a major third.
        { id: "iv", numeral: "iv", major: true, levels: [4, 5] },
        { id: "b6", numeral: `${FLAT}VI`, major: true, levels: [4, 5] },
        { id: "b7", numeral: `${FLAT}VII`, major: true, levels: [4, 5] },
        { id: "b2", numeral: `${FLAT}II`, levels: [5, 5] },
        { id: "V7/V", numeral: "V7/V", levels: [5, 5] }
    ];
    // Triads below Colorful, and where something rules out seventh chords;
    // sevenths otherwise.
    const chordSize = prompt => (prompt.level >= 3 && prompt.avoid !== "noSevenths") ? 4 : 3;
    // The chord to begin on in the prompt's key: { numeral, chord }, or null
    // when it isn't one there (a ♭VI in a key that has it already).
    function beginChord(prompt) {
        const begin = BEGINS.find(each => each.id === prompt.begin);
        if (!begin || !H.isKey(prompt.key)) return null;
        if (begin.numeral === undefined) {
            const chord = M.chordsInKey(prompt.key.root, prompt.key.scale, chordSize(prompt))[begin.degree];
            return chord ? { numeral: chord.numeral, chord: chord.name } : null;
        }
        if (begin.major && parallelOf(prompt.key).scale !== "minor") return null;
        const chord = H.chordFromNumeral(begin.numeral, prompt.key);
        if (!chord || H.isDiatonic(chord, prompt.key) || /[\u{1D12A}\u{1D12B}]/u.test(chord)) return null;
        return { numeral: begin.numeral, chord };
    }

    const findIn = (list, id) => list.find(each => each.id === id) ?? null;

    // ---- Drawing

    function pick(list, random) {
        return list.length ? list[Math.min(list.length - 1, Math.floor(random() * list.length))] : null;
    }

    // A part's choices at a level, for drawing and for choosing by hand.
    function choices(part, level, prompt = null) {
        switch (part) {
            case "form": return FORMS.filter(each => inLevel(each, level)).map(each => each.id);
            case "key": return keysAt(level);
            case "meter": return [...METERS_AT[level - 1]];
            case "tempo": {
                const [low, high] = TEMPI_AT[level - 1];
                const list = [];
                for (let tempo = low; tempo <= high; tempo += TEMPO_STEP) list.push(tempo);
                return list;
            }
            case "begin": return BEGINS.filter(each => inLevel(each, level) && (!prompt || beginChord({ ...prompt, begin: each.id }))).map(each => each.id);
            case "use":
            case "use2": return USES.filter(each => inLevel(each, level)).map(each => each.id);
            case "avoid": return AVOIDS.filter(each => inLevel(each, level)).map(each => each.id);
            default: return [];
        }
    }

    // Whether two parts can't stand together: a device and what rules it out,
    // the same device twice.
    function clashes(prompt) {
        const problems = [];
        if (prompt.use2 && prompt.use2 === prompt.use) problems.push(["use", "use2"]);
        const avoid = findIn(AVOIDS, prompt.avoid);
        if (avoid) {
            for (const part of ["use", "use2"]) if (prompt[part] && avoid.conflicts.includes(prompt[part])) problems.push([part, "avoid"]);
            if (avoid.conflicts.includes(`begin:${prompt.begin}`)) problems.push(["begin", "avoid"]);
        }
        if (!beginChord(prompt)) problems.push(["begin"]);
        return problems;
    }

    // A prompt at a level: the parts locked kept from `previous`, the rest drawn.
    // A clash is settled by drawing again whichever of its parts isn't locked.
    function drawPrompt(level, previous = null, locked = [], random = Math.random) {
        const at = Math.min(5, Math.max(1, Math.round(Number(level) || 1)));
        const keep = new Set(previous ? locked.filter(part => PARTS.includes(part)) : []);
        const prompt = { level: at };
        const parts = partsAt(at);
        const drawPart = part => {
            const list = choices(part, at, prompt);
            const value = pick(list, random);
            prompt[part] = value;
        };
        for (const part of PARTS) {
            if (!parts.includes(part)) { prompt[part] = null; continue; }
            if (keep.has(part) && previous[part] !== null && previous[part] !== undefined) prompt[part] = structuredClone(previous[part]);
            else if (part === "begin") prompt.begin = null;
            else drawPart(part);
        }
        // Where to begin depends on the key, so it's drawn after it.
        if (!(keep.has("begin") && previous?.begin)) drawPart("begin");
        for (let tries = 0; tries < 40; tries++) {
            const problems = clashes(prompt);
            if (!problems.length) break;
            const free = problems.flat().filter(part => !keep.has(part));
            // Locked on both sides: kept as the user chose.
            if (!free.length) break;
            drawPart(free[free.length - 1]);
        }
        return prompt;
    }

    // One part drawn again, the rest kept.
    function redrawPart(prompt, part, random = Math.random) {
        const others = PARTS.filter(each => each !== part);
        return drawPrompt(prompt.level, prompt, others, random);
    }

    // A prompt as kept, or null: every part known (any level's choices can be
    // chosen by hand, so none is held to its level's).
    function cleanPrompt(raw) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        const level = raw.level;
        if (!Number.isInteger(level) || level < 1 || level > 5) return null;
        const parts = partsAt(level);
        const prompt = { level };
        for (const part of PARTS) {
            const value = raw[part];
            if (!parts.includes(part)) { prompt[part] = null; continue; }
            const ok = part === "form" ? Boolean(findIn(FORMS, value))
                : part === "key" ? H.isKey(value) && Object.keys(value).length === 2
                : part === "meter" ? typeof value === "string" && Object.hasOwn(T.METERS, value)
                : part === "tempo" ? T.clampTempo(value) === value
                : part === "begin" ? Boolean(findIn(BEGINS, value))
                : part === "avoid" ? Boolean(findIn(AVOIDS, value))
                : Boolean(findIn(USES, value));
            if (!ok) return null;
            prompt[part] = part === "key" ? { root: value.root, scale: value.scale } : value;
        }
        if (!beginChord(prompt)) return null;
        return prompt;
    }

    const cleanLocked = raw => Array.isArray(raw) ? [...new Set(raw.filter(part => PARTS.includes(part)))] : [];

    // ---- Words

    // A part's words in the sentence (the begin part also has its chord).
    function partText(prompt, part) {
        switch (part) {
            case "form": return findIn(FORMS, prompt.form)?.label ?? "";
            case "key": return keyLabel(prompt.key);
            case "meter": return T.meterLabel(prompt.meter);
            case "tempo": return `${prompt.tempo} BPM`;
            case "begin": return beginChord(prompt)?.numeral ?? "";
            case "use":
            case "use2": return findIn(USES, prompt[part])?.text ?? "";
            case "avoid": return findIn(AVOIDS, prompt.avoid)?.text(prompt.key) ?? "";
            default: return "";
        }
    }

    // A choice's words in a list to choose from.
    function choiceText(prompt, part, value) {
        if (part === "key") return keyLabel(value);
        if (part === "tempo") return `${value} BPM · ${T.tempoName(value)}`;
        if (part === "begin") {
            const begin = beginChord({ ...prompt, begin: value });
            return begin ? `${begin.numeral} (${begin.chord})` : value;
        }
        return partText({ ...prompt, [part]: value }, part);
    }

    // The sentence, as words and parts: strings, and { part } where a part goes.
    // "Write a 32-bar AABA in D dorian, in 3/4 at 92 BPM. Begin on i (Dm7), use a
    // secondary dominant and a borrowed chord, and avoid the V chord."
    function sentence(prompt) {
        const words = [`Write ${article(partText(prompt, "form"))} `, { part: "form" }, " in ", { part: "key" }, ", in ", { part: "meter" }, " at ", { part: "tempo" }, ". Begin on ", { part: "begin" }];
        words.push(prompt.avoid ? ", use " : " and use ", { part: "use" });
        if (prompt.use2) words.push(" and ", { part: "use2" });
        if (prompt.avoid) words.push(", and avoid ", { part: "avoid" });
        words.push(".");
        return words;
    }

    // As plain text, for a title or a screen reader.
    const plainSentence = prompt => sentence(prompt).map(word => typeof word === "string" ? word
        : word.part === "begin" ? `${partText(prompt, "begin")} (${beginChord(prompt)?.chord ?? ""})` : partText(prompt, word.part)).join("");

    // ---- Checking a sketch: { part: { met, why } } for each part of the prompt.
    // `now` is the metronome's { meter, tempo }.
    function checkPrompt(prompt, sketch, now) {
        const results = {};
        const list = sequence(sketch);
        const key = prompt.key;
        const sketchKey = { root: sketch.root, scale: sketch.scale };
        for (const part of partsAt(prompt.level)) {
            if (part === "key") {
                const met = sketch.root === key.root && sketch.scale === key.scale;
                results.key = { met, why: met ? `The sketch is in ${keyLabel(key)}.` : `The sketch is in ${keyLabel(sketchKey)}.` };
            } else if (part === "meter") {
                const met = now.meter === prompt.meter;
                results.meter = { met, why: met ? `The metronome is in ${T.meterLabel(now.meter)}.` : `The metronome is in ${T.meterLabel(now.meter)}.` };
            } else if (part === "tempo") {
                const met = Math.abs(now.tempo - prompt.tempo) <= TEMPO_STEP;
                results.tempo = { met, why: `The metronome is at ${now.tempo} BPM.` };
            } else if (part === "form") {
                const form = findIn(FORMS, prompt.form);
                const want = form.sections.map(([, bars, repeat]) => `${bars}x${repeat}`).join(" ");
                const have = sketch.sections.map(section => `${section.bars.length}x${section.repeat}`).join(" ");
                const played = sketch.sections.reduce((sum, section) => sum + section.bars.length * section.repeat, 0);
                const count = sketch.sections.length;
                results.form = { met: want === have, why: want === have ? `${form.sections.length} ${form.sections.length === 1 ? "section" : "sections"}, ${formBars(form)} bars as played.`
                    : `The sketch has ${count} ${count === 1 ? "section" : "sections"} and ${played} bars as played; the form has ${form.sections.length} and ${formBars(form)}.` };
            } else if (part === "begin") {
                const begin = beginChord(prompt);
                const first = list[0];
                const met = Boolean(first && begin) && rootPc(first.name) === rootPc(begin.chord) && isMinorish(first.name) === isMinorish(begin.chord) && isMajorish(first.name) === isMajorish(begin.chord);
                results.begin = { met, why: first ? `It begins on ${first.name}.` : "The sketch has no chords." };
            } else if (part === "use" || part === "use2") {
                results[part] = findIn(USES, prompt[part]).check(list, key, sketch);
            } else if (part === "avoid") {
                results.avoid = findIn(AVOIDS, prompt.avoid).check(list, key, sketch);
            }
        }
        return results;
    }

    // ---- The sketch a prompt opens as: the form's sections, each bar the
    // key's first chord to write over, and the first the chord to begin on.
    function promptSketch(prompt) {
        const form = findIn(FORMS, prompt.form);
        const begin = beginChord(prompt);
        if (!form || !begin) return null;
        const home = M.chordsInKey(prompt.key.root, prompt.key.scale, chordSize(prompt))[0].name;
        const label = `${form.label} in ${keyLabel(prompt.key)}`;
        const sections = form.sections.map(([name, bars, repeat], at) => ({
            name, repeat, bars: Array.from({ length: bars }, (_, bar) => [at === 0 && bar === 0 ? begin.chord : home])
        }));
        return H.cleanChart({ title: label[0].toUpperCase() + label.slice(1), root: prompt.key.root, scale: prompt.key.scale, meter: prompt.meter, sections });
    }

    return {
        LEVELS, PARTS, FORMS, USES, AVOIDS, BEGINS, TEMPO_STEP,
        partsAt, keysAt, keyAccidentals, choices, clashes, drawPrompt, redrawPart, cleanPrompt, cleanLocked, beginChord,
        partText, choiceText, sentence, plainSentence, article, sequence, checkPrompt, promptSketch
    };
})();
