"use strict";

// Routines (2.12.0): named lists of steps that Maestro runs one after
// another when you start one. This file is the model only: the steps a
// routine may take, how each reads in words, and the text form AHK keeps
// (routine<Tab>name, then step<Tab>kind<Tab>argument per step). AHK checks
// everything again (ValidateRoutineStep in lib\ASCS.Core.ahk); the checks
// here say what's wrong while you edit.
globalThis.MaestroRoutines = (() => {
    const LIMITS = { routines: 30, steps: 40, wait: 600, desktops: 20, name: 48 };

    // The palette's apps a routine may open (not Lock, Toggle mute or Reload).
    const APPS = [
        ["everything", "Everything"], ["claude", "Ask Claude"], ["explorer", "File Explorer"],
        ["vivaldi", "Vivaldi"], ["terminal", "Windows Terminal"], ["calculator", "Calculator"],
        ["taskmanager", "Task Manager"], ["settings", "Windows Settings"], ["downloads", "Downloads"],
        ["projects", "Documents"], ["snipping", "Snipping Tool"]
    ];
    const PAGES = [
        ["home", "Podium"], ["notes", "Quick Notes"], ["calendar", "Calendar"], ["workspaces", "Workspaces"],
        ["games", "Games"], ["dashboard", "System"], ["sounds", "Sounds"], ["commands", "Commands"],
        ["conservatory", "Conservatory"], ["settings", "Preferences"]
    ];
    const MEDIA = [["playpause", "Play or pause"], ["next", "Next track"], ["previous", "Previous track"], ["stop", "Stop"]];

    const KINDS = [
        { id: "workspace", label: "Restore an arrangement" },
        { id: "desktop", label: "Go to a desktop" },
        { id: "launch", label: "Open an app" },
        { id: "command", label: "Run a custom command" },
        { id: "game", label: "Play a game" },
        { id: "volume", label: "Set the volume" },
        { id: "appvolume", label: "Set an app's volume" },
        { id: "media", label: "Media key" },
        { id: "page", label: "Show a page of Maestro" },
        { id: "wait", label: "Wait" }
    ];

    const labelOf = (pairs, id) => pairs.find(pair => pair[0] === id)?.[1] ?? "";
    const hasControl = text => /[\x00-\x1F\x7F|]/.test(text);
    const wholeIn = (text, low, high) => /^\d{1,3}$/.test(text) && Number(text) >= low && Number(text) <= high;
    const WORKSPACE = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/;
    const GAME = /^(ra:\d{1,5}|ps2:[A-Za-z0-9-]{1,32}|gc:[A-Z0-9]{6}|st:\d{1,10})$/;
    // An app's sound: Windows' own, Maestro's, or a program by its file name.
    const APP = /^(system|maestro|[a-z0-9][a-z0-9 ._()+-]{0,59}\.exe)$/;

    // "app|level" as its parts, or null.
    function appVolumeParts(arg) {
        const [app, level, extra] = String(arg ?? "").split("|");
        const id = String(app ?? "").trim().toLowerCase();
        return extra === undefined && APP.test(id) && wholeIn(String(level ?? "").trim(), 0, 100)
            ? { app: id, level: String(Number(level)) } : null;
    }

    // What an app is called: as the mixer last named it, else its file name.
    function appLabel(id, apps) {
        const found = Array.isArray(apps) ? apps.find(app => app.id === id) : null;
        if (found) return found.label;
        if (id === "system") return "System sounds";
        if (id === "maestro") return "Maestro";
        const name = id.replace(/\.exe$/, "");
        return name.charAt(0).toUpperCase() + name.slice(1);
    }

    function checkName(name) {
        const text = String(name ?? "").trim();
        if (!text || text.length > LIMITS.name) return "Routine names must be 1–48 characters.";
        if (hasControl(text)) return "Routine names cannot contain control characters or |.";
        return "";
    }

    // A step as AHK will keep it ({ kind, arg }), or { error } in words.
    function checkStep(kind, arg) {
        const value = String(arg ?? "").trim();
        switch (kind) {
            case "workspace":
                if (!value || value.toLowerCase() === "default") return { kind, arg: "Default" };
                if (!WORKSPACE.test(value) || value.endsWith(" ")) return { error: "Choose a saved arrangement." };
                return { kind, arg: value };
            case "desktop":
                return wholeIn(value, 1, LIMITS.desktops) ? { kind, arg: String(Number(value)) }
                    : { error: `Choose a desktop from 1 to ${LIMITS.desktops}.` };
            case "volume":
                return wholeIn(value, 0, 100) ? { kind, arg: String(Number(value)) } : { error: "Choose a level from 0 to 100." };
            case "appvolume": {
                const parts = appVolumeParts(value);
                return parts ? { kind, arg: `${parts.app}|${parts.level}` } : { error: "Choose an app and a level from 0 to 100." };
            }
            case "launch":
                return labelOf(APPS, value.toLowerCase()) ? { kind, arg: value.toLowerCase() } : { error: "Choose an app." };
            case "command":
                return value && value.length <= LIMITS.name && !hasControl(value) ? { kind, arg: value } : { error: "Choose a custom command." };
            case "game":
                return GAME.test(value) ? { kind, arg: value } : { error: "Choose a game." };
            case "page":
                return labelOf(PAGES, value.toLowerCase()) ? { kind, arg: value.toLowerCase() } : { error: "Choose a page." };
            case "media":
                return labelOf(MEDIA, value.toLowerCase()) ? { kind, arg: value.toLowerCase() } : { error: "Choose a media key." };
            case "wait":
                return wholeIn(value, 1, LIMITS.wait) ? { kind, arg: String(Number(value)) }
                    : { error: `A wait is 1 to ${LIMITS.wait} seconds.` };
            default:
                return { error: "A routine can't do that step." };
        }
    }

    // What AHK sent, kept only where it's in the shape this file reads.
    function clean(items) {
        if (!Array.isArray(items)) return [];
        return items.filter(item => item && typeof item.name === "string" && !checkName(item.name))
            .slice(0, LIMITS.routines)
            .map(item => ({
                name: item.name.trim(),
                steps: (Array.isArray(item.steps) ? item.steps : [])
                    .map(step => checkStep(step?.kind, step?.arg))
                    .filter(step => !step.error)
                    .slice(0, LIMITS.steps)
            }));
    }

    // The first problem with a set of routines, in words, or "".
    function problemIn(routines) {
        if (routines.length > LIMITS.routines) return `At most ${LIMITS.routines} routines are kept.`;
        const seen = new Set();
        for (const routine of routines) {
            const nameProblem = checkName(routine.name);
            if (nameProblem) return nameProblem;
            const key = routine.name.trim().toLowerCase();
            if (seen.has(key)) return `Two routines are named “${routine.name.trim()}”.`;
            seen.add(key);
            if (routine.steps.length > LIMITS.steps) return `“${routine.name.trim()}” has more than ${LIMITS.steps} steps.`;
            for (const [index, step] of routine.steps.entries()) {
                const checked = checkStep(step.kind, step.arg);
                if (checked.error) return `“${routine.name.trim()}”, step ${index + 1}: ${checked.error}`;
            }
        }
        return "";
    }

    // The text SaveRoutines takes. Assumes problemIn found nothing.
    function toText(routines) {
        return routines.map(routine => [`routine\t${routine.name.trim()}`]
            .concat(routine.steps.map(step => {
                const checked = checkStep(step.kind, step.arg);
                return `step\t${checked.kind}\t${checked.arg}`;
            })).join("\n")).join("\n") + (routines.length ? "\n" : "");
    }

    // A step in words. `known` names what the step points at, where the page
    // knows it: { commands: [names], games: [{ id, title }], workspaces: [names] }.
    // A step whose target is gone says so, since it would stop the routine.
    function describe(step, known = {}) {
        const arg = step.arg;
        const missing = list => Array.isArray(list) && !list.some(name => String(name).toLowerCase() === arg.toLowerCase());
        switch (step.kind) {
            case "workspace":
                return { text: `Restore the arrangement “${arg}”`, missing: missing(known.workspaces) };
            case "desktop":
                return { text: `Go to desktop ${arg}`, missing: Number.isInteger(known.desktops) && Number(arg) > known.desktops };
            case "launch":
                return { text: `Open ${labelOf(APPS, arg) || arg}`, missing: false };
            case "command":
                return { text: `Run “${arg}”`, missing: missing(known.commands) };
            case "game": {
                const games = Array.isArray(known.games) ? known.games : null;
                const game = games?.find(item => item.id === arg);
                return { text: `Play ${game ? game.title : arg}`, missing: Boolean(games && !game) };
            }
            case "volume":
                return { text: `Set the volume to ${arg}%`, missing: false };
            case "appvolume": {
                const parts = appVolumeParts(arg);
                return { text: parts ? `Set ${appLabel(parts.app, known.apps)} to ${parts.level}%` : "Set an app's volume", missing: false };
            }
            case "media":
                return { text: `Media: ${(labelOf(MEDIA, arg) || arg).toLowerCase()}`, missing: false };
            case "page":
                return { text: `Show ${labelOf(PAGES, arg) || arg}`, missing: false };
            case "wait": {
                const seconds = Number(arg);
                const text = seconds % 60 === 0 && seconds >= 60
                    ? `${seconds / 60} minute${seconds === 60 ? "" : "s"}` : `${seconds} second${seconds === 1 ? "" : "s"}`;
                return { text: `Wait ${text}`, missing: false };
            }
            default:
                return { text: "Unknown step", missing: true };
        }
    }

    // A name not yet taken: "Routine", then "Routine 2", "Routine 3"…
    function uniqueName(routines, base = "Routine") {
        const taken = new Set(routines.map(routine => routine.name.trim().toLowerCase()));
        if (!taken.has(base.toLowerCase())) return base;
        for (let number = 2; ; number++) {
            const name = `${base} ${number}`;
            if (!taken.has(name.toLowerCase())) return name;
        }
    }

    // A copy of the steps with one moved from `from` to `to`.
    function moveStep(steps, from, to) {
        const result = steps.slice();
        if (from < 0 || from >= result.length || to < 0 || to >= result.length) return result;
        const [step] = result.splice(from, 1);
        result.splice(to, 0, step);
        return result;
    }

    return {
        LIMITS, KINDS, APPS, PAGES, MEDIA,
        checkName, checkStep, clean, problemIn, toText, describe, uniqueName, moveStep, appVolumeParts, appLabel
    };
})();
