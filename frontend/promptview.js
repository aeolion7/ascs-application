"use strict";

// The Conservatory's writing prompt (2.4.0), in the Progressions side module:
// a brief to write to, at a level of complexity, each part a chip that opens a
// small menu to lock it, draw it again or choose it, and is marked when the
// sketch meets it. Its rules are in prompts.js; the prompt is kept with the
// sketch (maestro.progression).

const PROMPT_PART_NAMES = Object.freeze({ form: "Form", key: "Key", meter: "Time signature", tempo: "Tempo", begin: "Begin on", use: "Use", use2: "Use, too", avoid: "Avoid" });

const promptState = {
    menuFor: null,      // the part whose menu is open
    values: [],         // its choices, as listed in Choose
    checks: {}          // the last checks against the sketch, by part
};

const promptIsShown = () => progIsShown() && prog.settings.side === "prompt";
const promptLocked = () => new Set(prog.settings.locked);

// The prompt, drawn the first time it's wanted.
function currentPrompt() {
    if (!prog.settings.prompt) {
        prog.settings.prompt = MaestroPrompts.drawPrompt(2);
        prog.settings.locked = [];
        saveProgression();
    }
    return prog.settings.prompt;
}

function setPrompt(prompt, locked = prog.settings.locked) {
    prog.settings.prompt = prompt;
    // A lock on a part the level doesn't have goes with it.
    prog.settings.locked = MaestroPrompts.cleanLocked(locked).filter(part => prompt[part] !== null);
    saveProgression();
    renderPrompt();
}

// ---- Drawing the pane

function promptChip(prompt, part) {
    const chip = element("button", "prompt-chip");
    chip.type = "button";
    chip.dataset.part = part;
    const locked = promptLocked().has(part);
    const check = promptState.checks[part];
    chip.classList.toggle("is-locked", locked);
    chip.classList.toggle("is-met", Boolean(check?.met));
    chip.setAttribute("aria-haspopup", "dialog");
    chip.setAttribute("aria-expanded", String(promptState.menuFor === part));
    const text = MaestroPrompts.partText(prompt, part);
    if (part === "begin") {
        chip.append(element("span", "prompt-numeral", text), " (", chordSymbol(MaestroPrompts.beginChord(prompt).chord, "list"), ")");
    } else chip.append(text);
    chip.setAttribute("aria-label", `${PROMPT_PART_NAMES[part]}: ${part === "begin" ? `${text} (${MaestroPrompts.beginChord(prompt).chord})` : text}${locked ? ", locked" : ""}${check?.met ? ", met" : ""}`);
    return chip;
}

function renderPrompt() {
    if (!promptIsShown()) return;
    const prompt = currentPrompt();
    promptState.checks = MaestroPrompts.checkPrompt(prompt, progSketch(), { meter: metro.settings.meter, tempo: metro.settings.tempo });
    const parts = MaestroPrompts.partsAt(prompt.level);
    const met = parts.filter(part => promptState.checks[part]?.met).length;
    $("progChordTitle").textContent = "Prompt";
    $("progChordHead").textContent = `${met} of ${parts.length} met by the sketch`;
    document.querySelectorAll("#promptLevel [data-level]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.level) === prompt.level)));
    $("promptBrief").replaceChildren(...promptWords(prompt));
    $("promptBrief").setAttribute("aria-label", MaestroPrompts.plainSentence(prompt));
    if (promptState.menuFor) renderPromptMenu();
}

// The sentence's words and chips. A comma or full stop after a chip goes with
// it, so a line never starts with one.
function promptWords(prompt) {
    const nodes = [];
    const words = MaestroPrompts.sentence(prompt);
    for (let at = 0; at < words.length; at++) {
        const word = words[at];
        if (typeof word === "string") {
            nodes.push(word);
            continue;
        }
        const next = words[at + 1];
        const mark = typeof next === "string" ? /^[,.]/.exec(next)?.[0] : null;
        if (!mark) {
            nodes.push(promptChip(prompt, word.part));
            continue;
        }
        const tie = element("span", "prompt-tie");
        tie.append(promptChip(prompt, word.part), mark);
        nodes.push(tie);
        words[at + 1] = next.slice(mark.length);
    }
    return nodes;
}

// ---- The menu: lock, draw again, choose; and whether the sketch meets it.

function renderPromptMenu() {
    const part = promptState.menuFor;
    const chip = $("promptBrief").querySelector(`[data-part="${part}"]`);
    if (!part || !chip) return closePromptMenu();
    const prompt = currentPrompt();
    const menu = $("promptMenu");
    const locked = promptLocked().has(part);
    const check = promptState.checks[part];
    $("promptMenuTitle").textContent = PROMPT_PART_NAMES[part];
    $("promptMenuStatus").textContent = check ? `${check.met ? "Met" : "Not yet"}: ${check.why}` : "";
    $("promptMenuStatus").classList.toggle("is-met", Boolean(check?.met));
    $("promptLock").textContent = locked ? "Unlock" : "Lock";
    $("promptLock").setAttribute("aria-pressed", String(locked));
    $("promptLock").title = locked ? "Let Draw again change it" : "Keep it when you draw again";
    $("promptRedraw").title = `Draw the ${PROMPT_PART_NAMES[part].toLowerCase()} again, whether or not it's locked`;
    // The level's choices, and the one in the prompt if it isn't one of them.
    const values = MaestroPrompts.choices(part, prompt.level, prompt);
    const same = value => JSON.stringify(value) === JSON.stringify(prompt[part]);
    if (!values.some(same)) values.unshift(prompt[part]);
    const select = $("promptChoose");
    select.replaceChildren(...values.map((value, at) => {
        const option = element("option", "", MaestroPrompts.choiceText(prompt, part, value));
        option.value = String(at);
        option.selected = same(value);
        return option;
    }));
    promptState.values = values;
    menu.hidden = false;
    placePromptMenu();
    $("promptBrief").querySelectorAll("[data-part]").forEach(each => each.setAttribute("aria-expanded", String(each.dataset.part === part)));
}

// Under its chip, inside the module, or above the chip when there's no room
// below. Placed again whenever the module's size changes while it's open.
function placePromptMenu() {
    const menu = $("promptMenu");
    const chip = $("promptBrief").querySelector(`[data-part="${promptState.menuFor}"]`);
    if (menu.hidden || !chip) return;
    const module = menu.parentElement.getBoundingClientRect();
    const box = chip.getBoundingClientRect();
    const left = Math.max(16, Math.min(box.left - module.left, module.width - menu.offsetWidth - 16));
    menu.style.left = `${Math.round(left)}px`;
    const below = box.bottom - module.top + 8;
    const fits = below + menu.offsetHeight <= module.height - 16;
    menu.style.top = `${Math.round(fits ? below : Math.max(16, box.top - module.top - menu.offsetHeight - 8))}px`;
}
const promptMenuWatch = new ResizeObserver(() => placePromptMenu());

function openPromptMenu(part) {
    if (promptState.menuFor === part) return closePromptMenu(true);
    promptState.menuFor = part;
    renderPromptMenu();
    promptMenuWatch.observe($("promptMenu").parentElement);
    requestAnimationFrame(() => $("promptLock").focus());
}

function closePromptMenu(refocus = false) {
    const part = promptState.menuFor;
    promptState.menuFor = null;
    promptMenuWatch.disconnect();
    $("promptMenu").hidden = true;
    $("promptBrief").querySelectorAll("[data-part]").forEach(each => each.setAttribute("aria-expanded", "false"));
    if (refocus && part) $("promptBrief").querySelector(`[data-part="${part}"]`)?.focus();
}

// ---- Changes

function togglePromptLock(part) {
    const locked = promptLocked();
    if (locked.has(part)) locked.delete(part); else locked.add(part);
    setPrompt(currentPrompt(), [...locked]);
}

function redrawPromptPart(part) {
    setPrompt(MaestroPrompts.redrawPart(currentPrompt(), part));
}

// A part chosen by hand is locked; anything it rules out that isn't locked is drawn again.
function choosePromptPart(part, value) {
    const prompt = { ...currentPrompt(), [part]: structuredClone(value) };
    const locked = promptLocked();
    locked.add(part);
    const clashing = new Set(MaestroPrompts.clashes(prompt).flat());
    const keep = MaestroPrompts.PARTS.filter(each => !clashing.has(each) || locked.has(each));
    setPrompt(MaestroPrompts.drawPrompt(prompt.level, prompt, keep), [...locked]);
}

function drawPromptAgain() {
    setPrompt(MaestroPrompts.drawPrompt(currentPrompt().level, currentPrompt(), prog.settings.locked));
}

function setPromptLevel(level) {
    if (level === currentPrompt().level) return;
    setPrompt(MaestroPrompts.drawPrompt(level, currentPrompt(), prog.settings.locked));
}

function openPromptInSketch() {
    const prompt = currentPrompt();
    const sketch = MaestroPrompts.promptSketch(prompt);
    if (!sketch) return;
    closePromptMenu();
    replaceProgSketch(sketch, null, `Opened the prompt as ${sketch.title}.`, prompt.tempo);
}

// ---- Wiring

$("promptLevel").replaceChildren(...MaestroPrompts.LEVELS.map((name, at) => {
    const button = element("button", "", name);
    button.type = "button";
    button.dataset.level = String(at + 1);
    return button;
}));
$("promptLevel").addEventListener("click", event => {
    const button = event.target.closest("[data-level]");
    const level = Number(button?.dataset.level);
    if (Number.isInteger(level) && level >= 1 && level <= MaestroPrompts.LEVELS.length) setPromptLevel(level);
});
$("promptBrief").addEventListener("click", event => {
    const chip = event.target.closest("[data-part]");
    if (chip && MaestroPrompts.PARTS.includes(chip.dataset.part)) openPromptMenu(chip.dataset.part);
});
$("promptLock").addEventListener("click", () => promptState.menuFor && togglePromptLock(promptState.menuFor));
$("promptRedraw").addEventListener("click", () => promptState.menuFor && redrawPromptPart(promptState.menuFor));
$("promptChoose").addEventListener("change", () => {
    const value = promptState.values?.[Number($("promptChoose").value)];
    if (promptState.menuFor && value !== undefined) choosePromptPart(promptState.menuFor, value);
});
$("promptDraw").addEventListener("click", drawPromptAgain);
$("promptOpen").addEventListener("click", openPromptInSketch);
$("promptMenu").addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    closePromptMenu(true);
});
document.addEventListener("pointerdown", event => {
    if (promptState.menuFor && !event.target.closest("#promptMenu, #promptBrief [data-part]")) closePromptMenu();
});
