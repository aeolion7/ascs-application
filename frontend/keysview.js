"use strict";

// The Conservatory's Keys (2.4.0), beside the Progressions sketch: the circle
// of fifths with the sketch's key and chords on it, the keys its chords fit,
// and the chords the key shares with another picked on the circle, a way to
// move there. Its rules are in harmony.js.

// The circle's rings in its own units (332 across): outer edge, inner edge
// and where the names sit.
const KEYS_RINGS = Object.freeze({ major: [164, 117, 141], minor: [117, 80, 98] });
const KEYS_SIZE = 332;
const KEYS_SIGNATURES = Object.freeze({ "♯": ["sharp", "sharps"], "♭": ["flat", "flats"] });

const keysState = {
    toward: null,           // a key picked on the circle: { index, ring }
    style: null             // the chord style its names were drawn in
};

const keysAreShown = () => progIsShown() && prog.settings.side === "keys";
const keysLabel = key => `${key.root} ${MaestroMusic.SCALES[key.scale].label.replace(/ \(.*\)$/, "").toLowerCase()}`;
const keysSame = (a, b) => a.scale === b.scale && MaestroMusic.pitchClass(a.root) === MaestroMusic.pitchClass(b.root);
const keysAt = ({ index, ring }) => ({ root: MaestroHarmony.CIRCLE[index][ring], scale: ring });

function keysSignature(signature) {
    if (!signature) return "No sharps or flats";
    const count = Number(signature.slice(0, -1));
    const [one, many] = KEYS_SIGNATURES[signature.slice(-1)];
    return `${count} ${count === 1 ? one : many}`;
}


// ---- The circle, made once: a ring of major keys around their relative minors.

function keysSector(index, outer, inner) {
    const point = (radius, degrees) => {
        const angle = degrees * Math.PI / 180;
        return `${(KEYS_SIZE / 2 + radius * Math.sin(angle)).toFixed(2)} ${(KEYS_SIZE / 2 - radius * Math.cos(angle)).toFixed(2)}`;
    };
    const from = index * 30 - 15;
    const to = index * 30 + 15;
    return `M ${point(outer, from)} A ${outer} ${outer} 0 0 1 ${point(outer, to)} L ${point(inner, to)} A ${inner} ${inner} 0 0 0 ${point(inner, from)} Z`;
}

function buildKeysCircle() {
    const svg = svgNode("svg", { viewBox: `0 0 ${KEYS_SIZE} ${KEYS_SIZE}`, "aria-hidden": "true" });
    const buttons = [];
    MaestroHarmony.CIRCLE.forEach((each, index) => {
        for (const ring of ["major", "minor"]) {
            const [outer, inner, middle] = KEYS_RINGS[ring];
            svg.append(svgNode("path", { class: `prog-circle-cell is-${ring}`, "data-cell": `${index}-${ring}`, d: keysSector(index, outer, inner) }));
            const button = element("button", `prog-circle-key is-${ring}`);
            button.type = "button";
            button.dataset.cell = `${index}-${ring}`;
            const angle = index * Math.PI / 6;
            button.style.left = `${(KEYS_SIZE / 2 + middle * Math.sin(angle)).toFixed(1)}px`;
            button.style.top = `${(KEYS_SIZE / 2 - middle * Math.cos(angle)).toFixed(1)}px`;
            buttons.push(button);
        }
    });
    const center = element("div", "prog-circle-center");
    center.append(element("span", "prog-circle-root"), element("span", "prog-circle-mode"), element("span", "prog-circle-signature"));
    $("progCircle").replaceChildren(svg, ...buttons, center);
}

// Each key's name, as a chord symbol in the chosen style (Am, or A– in Signs).
function nameKeysCircle() {
    keysState.style = cons.settings.chordStyle;
    $("progCircle").querySelectorAll(".prog-circle-key").forEach(button => {
        const [index, ring] = button.dataset.cell.split("-");
        const root = MaestroHarmony.CIRCLE[Number(index)][ring];
        button.replaceChildren(chordSymbol(ring === "major" ? root : `${root}m`, "list"));
        button.setAttribute("aria-label", `${root} ${ring}`);
    });
}

// ---- Drawing

function renderProgKeys() {
    if (!keysAreShown()) return;
    if (keysState.style !== cons.settings.chordStyle) nameKeysCircle();
    const key = progKey();
    const names = progChords().map(each => each.name);
    const place = MaestroHarmony.circlePlace(key);
    const used = new Set(names.map(MaestroHarmony.chordOnCircle).filter(Boolean).map(at => `${at.index}-${at.ring}`));
    // Picking the key itself on the circle picks nothing.
    if (keysState.toward && keysSame(keysAt(keysState.toward), key)) keysState.toward = null;
    const toward = keysState.toward ? `${keysState.toward.index}-${keysState.toward.ring}` : null;
    const tonic = place?.ring ? `${place.index}-${place.ring}` : null;
    $("progCircle").querySelectorAll("[data-cell]").forEach(cell => {
        const id = cell.dataset.cell;
        cell.classList.toggle("is-key", Boolean(place) && id.startsWith(`${place.index}-`));
        cell.classList.toggle("is-tonic", id === tonic);
        cell.classList.toggle("is-used", used.has(id));
        cell.classList.toggle("is-toward", id === toward);
        if (cell.tagName === "BUTTON") {
            cell.setAttribute("aria-pressed", String(id === toward));
            const [index, ring] = id.split("-");
            const label = keysLabel(keysAt({ index: Number(index), ring }));
            cell.title = id === tonic ? `${label}: the key` : `${label}: the chords it shares with ${keysLabel(key)}${used.has(id) ? " (the sketch has its chord)" : ""}`;
        }
    });
    const center = $("progCircle").querySelector(".prog-circle-center");
    center.children[0].replaceChildren(chordSymbol(key.root, "small"));
    center.children[1].textContent = keysLabel(key).slice(key.root.length + 1);
    center.children[2].textContent = place ? keysSignature(MaestroHarmony.CIRCLE[place.index].signature) : "";
    // The keys the chords fit, best first; one click makes one the key.
    const chords = [...new Set(names)];
    const outside = chords.filter(name => !MaestroHarmony.keyHolds(name, key));
    $("progChordTitle").textContent = "Keys";
    $("progChordHead").textContent = `${chords.length - outside.length} of ${chords.length} ${chords.length === 1 ? "chord" : "chords"} in ${keysLabel(key)}`;
    $("progKeyFits").replaceChildren(...MaestroHarmony.findKey(names).map(each => {
        const button = element("button", "prog-key-fit");
        button.type = "button";
        button.dataset.root = each.root;
        button.dataset.scale = each.scale;
        const current = keysSame(each, key);
        button.setAttribute("aria-pressed", String(current));
        button.title = current ? "The sketch's key" : `Make ${keysLabel(each)} the key`;
        // Found keys are major or minor: "A minor", where the scale's own name is "natural minor".
        button.append(element("strong", "", `${each.root} ${each.scale}`), element("span", "", `${each.fits} of ${each.total} chords`));
        return button;
    }));
    $("progKeyOutside").textContent = outside.length
        ? `Outside ${keysLabel(key)}: ${outside.map(name => `${name} (${MaestroHarmony.romanNumeral(name, key) || "?"})`).join(", ")}.`
        : `Every chord is in ${keysLabel(key)}.`;
    renderKeysToward(key);
}

// The chords the key shares with the one picked on the circle.
function renderKeysToward(key) {
    const picked = keysState.toward ? keysAt(keysState.toward) : null;
    $("progPivotLabel").textContent = picked ? `Shared with ${keysLabel(picked)}` : "Shared with another key";
    $("progTowardKey").hidden = !picked;
    if (!picked) {
        $("progPivots").replaceChildren();
        $("progPivotNote").textContent = `Pick a key on the circle to see the chords ${keysLabel(key)} shares with it: a way to move there.`;
        return;
    }
    const pivots = MaestroHarmony.pivotChords(key, picked, prog.settings.sevenths ? 4 : 3);
    const chosen = progChosen();
    $("progPivots").replaceChildren(...pivots.map(each => {
        const button = element("button", "key-chord");
        button.type = "button";
        button.dataset.name = each.name;
        button.setAttribute("aria-pressed", String(each.name === chosen));
        button.title = `${each.name}: ${each.from} in ${keysLabel(key)}, ${each.to} in ${keysLabel(picked)}. Put it in the chord's place`;
        const name = element("span", "key-name");
        name.append(chordSymbol(each.name, "list"));
        button.append(element("span", "key-numeral", `${each.from} → ${each.to}`), name);
        return button;
    }));
    $("progPivotNote").textContent = pivots.length ? "" : "None: they share no chords. A key nearer on the circle shares more.";
    $("progTowardKey").title = `Make ${keysLabel(picked)} the sketch's key; the chords stay as they are`;
}

// ---- Changes

// A key made the sketch's, with Undo; the chords stay as they are.
function makeProgKey(key) {
    if (!MaestroHarmony.isKey(key) || keysSame(key, progKey())) return;
    keysState.toward = null;
    changeProgression(() => Object.assign(progSketch(), { root: key.root, scale: key.scale }), `The key is ${keysLabel(key)}.`);
}

function pickKeysToward(id) {
    const [index, ring] = id.split("-");
    const at = { index: Number(index), ring };
    if (!MaestroHarmony.CIRCLE[at.index] || !["major", "minor"].includes(ring)) return;
    const same = keysState.toward && keysState.toward.index === at.index && keysState.toward.ring === ring;
    keysState.toward = same ? null : at;
    renderProgKeys();
}

// ---- Wiring

buildKeysCircle();
$("progCircle").addEventListener("click", event => {
    const button = event.target.closest(".prog-circle-key");
    if (button) pickKeysToward(button.dataset.cell);
});
$("progKeyFits").addEventListener("click", event => {
    const button = event.target.closest("[data-root]");
    if (button) makeProgKey({ root: button.dataset.root, scale: button.dataset.scale });
});
$("progPivots").addEventListener("click", event => {
    const button = event.target.closest("[data-name]");
    if (button && MaestroHarmony.parseChord(button.dataset.name)) setProgChord(button.dataset.name);
});
$("progTowardKey").addEventListener("click", () => {
    if (keysState.toward) makeProgKey(keysAt(keysState.toward));
});
