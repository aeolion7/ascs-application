"use strict";

(function () {
    const R = globalThis.MaestroRoutines;
    const { check, equal } = globalThis.TestHarness;

    equal("name: fine", R.checkName("Evening"), "");
    check("name: empty", R.checkName("  ") !== "");
    check("name: too long", R.checkName("r".repeat(49)) !== "");
    check("name: a pipe", R.checkName("a|b") !== "");
    check("name: a tab", R.checkName("a\tb") !== "");

    const step = (kind, arg) => { const checked = R.checkStep(kind, arg); return checked.error ? "error" : `${checked.kind}:${checked.arg}`; };
    equal("step: an arrangement", step("workspace", "Music"), "workspace:Music");
    equal("step: the default arrangement", step("workspace", "default"), "workspace:Default");
    equal("step: an arrangement name that can't be a file", step("workspace", "..\\x"), "error");
    equal("step: desktop 2", step("desktop", "02"), "desktop:2");
    equal("step: desktop 0", step("desktop", "0"), "error");
    equal("step: desktop 21", step("desktop", "21"), "error");
    equal("step: volume", step("volume", "30"), "volume:30");
    equal("step: volume past 100", step("volume", "101"), "error");
    equal("step: an app, any case", step("launch", "Terminal"), "launch:terminal");
    equal("step: not lock", step("launch", "lock"), "error");
    equal("step: not a path", step("launch", "C:\\Windows\\notepad.exe"), "error");
    equal("step: a custom command", step("command", " Mail "), "command:Mail");
    equal("step: a game", step("game", "st:620"), "game:st:620");
    equal("step: not a game path", step("game", "C:\\x.iso"), "error");
    equal("step: a page", step("page", "Conservatory"), "page:conservatory");
    equal("step: a media key", step("media", "next"), "media:next");
    equal("step: wait", step("wait", "5"), "wait:5");
    equal("step: wait 0", step("wait", "0"), "error");
    equal("step: wait past ten minutes", step("wait", "601"), "error");
    equal("step: wait a fraction", step("wait", "1.5"), "error");
    equal("step: an app's volume", step("appvolume", "Vivaldi.exe|30"), "appvolume:vivaldi.exe|30");
    equal("step: Windows' sounds", step("appvolume", "system|5"), "appvolume:system|5");
    equal("step: an app's volume past 100", step("appvolume", "vivaldi.exe|101"), "error");
    equal("step: an app by path", step("appvolume", "C:\\x\\vivaldi.exe|30"), "error");
    equal("step: an app's volume, an extra part", step("appvolume", "vivaldi.exe|30|1"), "error");
    equal("step: not power", step("power", "off"), "error");
    equal("step: not an audio device", step("device", "Speakers"), "error");
    equal("every kind can be checked", R.KINDS.filter(kind => R.checkStep(kind.id, "x").error === "A routine can't do that step.").length, 0);

    const cleaned = R.clean([
        { name: "Evening", steps: [{ kind: "workspace", arg: "Music" }, { kind: "power", arg: "off" }, { kind: "wait", arg: "3" }] },
        { name: "", steps: [] },
        { name: "Play", steps: "junk" },
        null
    ]);
    equal("clean: good routines kept", cleaned.map(routine => routine.name).join(), "Evening,Play");
    equal("clean: a bad step left out", cleaned[0].steps.map(item => item.kind).join(), "workspace,wait");
    equal("clean: steps that aren't a list are none", cleaned[1].steps.length, 0);
    equal("clean: not a list", R.clean("x").length, 0);

    equal("problems: none", R.problemIn(cleaned), "");
    check("problems: two with one name", R.problemIn([{ name: "A", steps: [] }, { name: " a ", steps: [] }]).includes("Two routines"));
    check("problems: a bad step, by number", R.problemIn([{ name: "A", steps: [{ kind: "wait", arg: "3" }, { kind: "wait", arg: "0" }] }]).includes("step 2"));
    check("problems: too many steps", R.problemIn([{ name: "A", steps: Array.from({ length: 41 }, () => ({ kind: "wait", arg: "1" })) }]).includes("40"));

    equal("text: as AHK keeps it", R.toText(cleaned), "routine\tEvening\nstep\tworkspace\tMusic\nstep\twait\t3\nroutine\tPlay\n");
    equal("text: none", R.toText([]), "");

    const known = { workspaces: ["Default", "Music"], commands: ["Mail"], games: [{ id: "st:620", title: "Portal 2" }], desktops: 3 };
    const words = (kind, arg) => R.describe({ kind, arg }, known);
    equal("words: arrangement", words("workspace", "Music").text, "Restore the arrangement “Music”");
    equal("words: a missing arrangement says so", words("workspace", "Gone").missing, true);
    equal("words: desktop", words("desktop", "2").text, "Go to desktop 2");
    equal("words: a desktop past the last", words("desktop", "4").missing, true);
    equal("words: app", words("launch", "terminal").text, "Open Windows Terminal");
    equal("words: command", words("command", "mail").text + "|" + words("command", "mail").missing, "Run “mail”|false");
    equal("words: a missing command", words("command", "Gone").missing, true);
    equal("words: game by title", words("game", "st:620").text, "Play Portal 2");
    equal("words: a game not in the library", words("game", "st:1").text + "|" + words("game", "st:1").missing, "Play st:1|true");
    equal("words: before the library is read, not missing", R.describe({ kind: "game", arg: "st:1" }).missing, false);
    equal("words: volume", words("volume", "30").text, "Set the volume to 30%");
    equal("words: an app's volume, as the mixer names it", R.describe({ kind: "appvolume", arg: "vivaldi.exe|30" }, { apps: [{ id: "vivaldi.exe", label: "Vivaldi" }] }).text, "Set Vivaldi to 30%");
    equal("words: an app with no sound now, by its file name", words("appvolume", "spotify.exe|60").text + "|" + words("appvolume", "spotify.exe|60").missing, "Set Spotify to 60%|false");
    equal("words: Windows' sounds", words("appvolume", "system|10").text, "Set System sounds to 10%");
    equal("words: media", words("media", "playpause").text, "Media: play or pause");
    equal("words: page", words("page", "dashboard").text, "Show System");
    equal("words: one second", words("wait", "1").text, "Wait 1 second");
    equal("words: seconds", words("wait", "90").text, "Wait 90 seconds");
    equal("words: whole minutes", words("wait", "120").text, "Wait 2 minutes");
    equal("words: one minute", words("wait", "60").text, "Wait 1 minute");

    equal("unique name: the first", R.uniqueName([]), "Routine");
    equal("unique name: the next free", R.uniqueName([{ name: "Routine" }, { name: "routine 2" }]), "Routine 3");
    equal("move: down", R.moveStep(["a", "b", "c"], 0, 2).join(""), "bca");
    equal("move: up", R.moveStep(["a", "b", "c"], 2, 0).join(""), "cab");
    equal("move: out of range, unchanged", R.moveStep(["a", "b"], 0, 5).join(""), "ab");
})();
