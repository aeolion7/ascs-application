// Smoke test (1.9.0): the real page (frontend\index.html, every module and
// stylesheet) with a stand-in for WebView2, loaded by run-tests.ps1 before the
// page's own scripts. It opens every view and fails on any script error or
// unhandled rejection, and on any message the page sends that isn't in
// ASCS.ahk's allowlist (window.SMOKE_ALLOWLIST, written by run-tests.ps1).
(() => {
    const errors = [];
    const sent = new Set();
    const messages = [];
    window.addEventListener("error", event => {
        errors.push(`${event.message} (${String(event.filename || "").split("/").pop()}:${event.lineno})`);
    });
    window.addEventListener("unhandledrejection", event => {
        errors.push(`Unhandled rejection: ${event.reason?.message || event.reason}`);
    });
    window.chrome = window.chrome || {};
    // 2.6.0: the page starts on the Conservatory's section last open, drawn
    // once every script has run (Counterpoint's was left as bare markup).
    const startedCons = localStorage.getItem("maestro.conservatory");
    try {
        localStorage.setItem("maestro.conservatory", JSON.stringify({ ...JSON.parse(startedCons || "{}"), tab: "counterpoint" }));
    } catch {
        localStorage.setItem("maestro.conservatory", JSON.stringify({ tab: "counterpoint" }));
    }
    // As in the real app, AHK can answer Ready before the page's later scripts
    // have run. A reply handled then calls functions that don't exist yet.
    const listeners = [];
    const earlyNote = { id: "early", title: "Early note", type: "note", content: "here", pinned: false, created: "2020-01-01T00:00:00.000Z", updated: "2020-01-01T00:00:00.000Z" };
    window.chrome.webview = {
        postMessage: message => {
            sent.add(String(message).split("\n")[0]);
            messages.push(String(message));
            if (String(message).split("\n")[0] !== "Ready") return;
            [{ type: "notes", data: JSON.stringify({ version: 2, activeId: "early", notes: [earlyNote] }), recovered: false },
                { type: "workspaces", monitors: 1, items: [] }]
                .forEach(data => listeners.forEach(listener => listener({ data })));
        },
        addEventListener: (type, listener) => { if (type === "message") listeners.push(listener); },
        removeEventListener() {}
    };

    function report(checks) {
        const failed = checks.filter(([, problems]) => problems.length);
        const lines = [`PASS ${checks.length - failed.length} FAIL ${failed.length}`];
        failed.forEach(([name, problems]) => lines.push(`${name}: ${problems.join("; ")}`));
        const pre = document.createElement("pre");
        pre.id = "results";
        pre.textContent = lines.join("\n");
        document.body.append(pre);
    }

    window.addEventListener("load", () => setTimeout(() => {
        const checks = [["the page loads without errors", errors.splice(0)]];
        checks.push(["a section open at start is drawn", $("cpTitleText").textContent.trim() && $("cpFacts").textContent.trim() && $("cpStaff").querySelector("svg") && $("cpVoices").children.length ? [] : [`title "${$("cpTitleText").textContent}"`]]);
        if (startedCons === null) localStorage.removeItem("maestro.conservatory"); else localStorage.setItem("maestro.conservatory", startedCons);
        checks.push(["replies that arrive before the last script still draw the notes list", $("notesList").textContent.includes("Early note") ? [] : ["list is empty"]]);
        const views = [...new Set([...document.querySelectorAll("[data-view]")].map(node => node.dataset.view))];
        checks.push(["every view is reachable", views.length >= 9 ? [] : [`only ${views.length} views found`]]);
        views.forEach(view => {
            try {
                navigate(view);
            } catch (error) {
                errors.push(error.message);
            }
            const shown = document.getElementById(view)?.classList.contains("active");
            const titled = (document.getElementById("breadcrumb")?.textContent || "").trim() !== "";
            checks.push([`the ${view} view opens`, [...errors.splice(0), ...(shown ? [] : ["not shown"]), ...(titled ? [] : ["no breadcrumb title"])]]);
        });
        setTimeout(async () => {
            try {
            checks.push(["no errors after opening the views", errors.splice(0)]);
            const allowed = new Set(window.SMOKE_ALLOWLIST || []);
            checks.push(["the allowlist was read", allowed.size >= 50 ? [] : [`only ${allowed.size} message types`]]);
            checks.push(["every message sent is allowlisted", [...sent].filter(type => !allowed.has(type)).map(type => `${type} isn't allowlisted`)]);

            // 2.2.0: before its data arrives, a space shows the shape of what's coming:
            // no "Loading" and no spinner, and no empty message that isn't true yet.
            // Only notes and the arrangements have answered by now.
            {
                const serverWas = calState.server;
                calState.server = { state: "running", message: "" };
                renderCalendar();
                const shapes = {
                    home: ["#homeNow", "#homeAlmanac", "#todayList", "#homeDrives", "#homeContinue"],
                    games: ["#gamesNow", "#gamesNowNotes", "#gamesTotals", "#gamesContinue"],
                    calendar: ["#calCalendars", "#calCountdowns"],
                    sounds: ["#soundGroups"],
                    dashboard: ["#dashboardDrives"]
                };
                Object.entries(shapes).forEach(([view, places]) => {
                    navigate(view);
                    const page = $(view);
                    const loading = /\bLoading\b/.test(page.innerText) ? ["says Loading"] : [];
                    const spinning = [...page.querySelectorAll(".loading-note")].filter(note => note.offsetParent).map(note => `a spinner: ${note.textContent}`);
                    const missing = places.filter(place => !document.querySelector(`${place} .skel`)).map(place => `no shape in ${place}`);
                    checks.push([`${view} shows shapes while it waits`, [...loading, ...spinning, ...missing]]);
                });
                navigate("games");
                gamesSections.show("achievements");
                checks.push(["Achievements waits for RetroAchievements rather than asking to connect it",
                    $("gamesAchievements").querySelector(".skel") && !/Connect RetroAchievements/.test($("gamesAchievements").textContent) ? [] : [$("gamesAchievements").textContent.slice(0, 80)]]);
                gamesSections.show("playing");
                navigate("dashboard");
                systemSections.show("signin");
                checks.push(["Startup shows its graph's shape", $("signInNote").querySelector(".skel") ? [] : ["none"]]);
                systemSections.show("live");
                const sample = document.querySelector("#gamesNow .skel");
                const style = getComputedStyle(sample);
                checks.push(["a shape is a status that breathes", sample.getAttribute("role") === "status" && sample.getAttribute("aria-label") === "Loading" && style.animationName.includes("skel-breathe") ? [] : [style.animationName]]);
                // Every placeholder starts at the same point of one cycle, so they breathe together.
                const phases = [...document.querySelectorAll(".skel")].map(node => Number.parseFloat(node.style.getPropertyValue("--skel-phase")));
                checks.push(["placeholders carry the page's breathing phase", phases.length > 10 && phases.every(phase => phase <= 0 && phase > -PLACEHOLDER_CYCLE) ? [] : [`${phases.length} phases`]]);
                // Before the arrangements answer, Arrangements isn't empty yet; after, it may be.
                const wsLoaded = wsView.loaded;
                wsView.loaded = false;
                renderHomeWorkspaces();
                checks.push(["Arrangements waits before saying there are none", $("homeWorkspaces").querySelector(".skel") && !/No arrangements/.test($("homeWorkspaces").textContent) ? [] : ["said none"]]);
                wsView.loaded = wsLoaded;
                renderHomeWorkspaces();
                checks.push(["and says so once they've answered", /No arrangements saved yet/.test($("homeWorkspaces").textContent) ? [] : ["no message"]]);
                // When the games arrive, their shapes go.
                const gamesWas = { items: gamesState.items, loaded: gamesState.loaded };
                handleWebMessage({ data: { type: "games", covers: false, items: [{ id: "st:5", title: "Shaped", emulator: "steam", system: "", seconds: 600, last: "2026-11-08T10:00:00", plays: 1, launchable: true, installed: true }] } });
                navigate("games");
                const left = ["#gamesNow", "#gamesNowNotes", "#gamesTotals", "#gamesContinue", "#homeContinue", "#homeNow"].filter(place => document.querySelector(`${place} .skel`));
                checks.push(["the games' shapes go when the games arrive", left.map(place => `still in ${place}`)]);
                gamesState.items = gamesWas.items;
                gamesState.loaded = gamesWas.loaded;
                renderGames();
                calState.server = serverWas;
                renderCalendar();
                navigate("home");
            }

            // 2.3.0: the Conservatory and its metronome, with a stand-in for the
            // audio, so nothing sounds. Clicks are counted as they're booked.
            {
                const heard = { clicks: 0, suspended: 0, resumed: 0, sources: [] };
                class FakeParam { setValueAtTime() {} exponentialRampToValueAtTime() {} linearRampToValueAtTime() {} setTargetAtTime(value) { this.target = value; } cancelScheduledValues() {} }
                class FakeNode {
                    constructor() { this.gain = new FakeParam(); this.frequency = new FakeParam(); this.frequency.value = 0; this.Q = new FakeParam(); this.playbackRate = { value: 1 }; }
                    connect(node) { return node; }
                    disconnect() {}
                    addEventListener(type, listener) { (this.listeners ??= {})[type] = listener; }
                    setPeriodicWave() {}
                    start() { heard.clicks += 1; }
                    stop() { this.stopped = true; }
                }
                class FakeAudio {
                    constructor() { this.began = performance.now(); this.sampleRate = 48000; this.destination = new FakeNode(); }
                    get currentTime() { return (performance.now() - this.began) / 1000; }
                    createGain() { return new FakeNode(); }
                    createOscillator() { return new FakeNode(); }
                    createBufferSource() { const source = new FakeNode(); heard.sources.push(source); return source; }
                    createDynamicsCompressor() { const node = new FakeNode(); ["threshold", "knee", "ratio", "attack", "release"].forEach(name => { node[name] = new FakeParam(); }); return node; }
                    createBiquadFilter() { return new FakeNode(); }
                    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length), copyToChannel() {} }; }
                    createPeriodicWave() { return {}; }
                    resume() { heard.resumed += 1; return Promise.resolve(); }
                    suspend() { heard.suspended += 1; return Promise.resolve(); }
                }
                const realAudio = window.AudioContext;
                const savedMetro = localStorage.getItem(METRO_KEY);
                const pause = time => new Promise(resolve => setTimeout(resolve, time));
                const ctrl = key => document.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true }));
                const wasHidden = windowIsHidden;
                windowIsHidden = false;
                window.AudioContext = FakeAudio;
                try {
                    navigate("home");
                    ctrl("9");
                    checks.push(["Ctrl+9 opens the Conservatory", $("conservatory").classList.contains("active") && $("breadcrumb").textContent === "Conservatory" ? [] : [document.querySelector(".view.active")?.id]]);
                    checks.push(["it's ninth in the sidebar", sidebarViews()[8] === "conservatory" ? [] : [sidebarViews().join()]]);
                    checks.push(["nothing plays or runs before Start", metro.context === null && metro.timer === null && metro.frame === null ? [] : ["running"]]);
                    setMetroTempo(120);
                    setMetroMeter("4/4");
                    $("metroPlay").click();
                    await pause(320);
                    checks.push(["Start books clicks on the audio clock", metro.running && metro.timer !== null && heard.resumed === 1 && heard.clicks >= 1 ? [] : [metro.running, heard.clicks]]);
                    checks.push(["and books only a little ahead while seen", metro.nextAt - metro.context.currentTime < 0.7 ? [] : [metro.nextAt - metro.context.currentTime]]);
                    checks.push(["the beat lights run while the page shows", metro.frame !== null ? [] : ["no frame"]]);
                    // Headless Edge may draw no frames, so the frame's work is done here.
                    lightDueMetroBeat();
                    const litBeats = document.querySelectorAll("#metroBar .metro-beats > .is-on").length;
                    checks.push(["the beat of the click just sounded is lit", litBeats === 1 ? [] : [litBeats]]);
                    checks.push(["both buttons say it's playing", $("metroPlay").getAttribute("aria-pressed") === "true" && $("metroPlay").title === "Stop the metronome (Space)" && $("homeMetroPlay").textContent === "Stop" ? [] : [$("metroPlay").title, $("homeMetroPlay").textContent]]);
                    navigate("notes");
                    checks.push(["on another page it keeps playing, its beat in the title bar", metro.running && metro.timer !== null && !$("metroChip").hidden && metro.frame !== null ? [] : [metro.running, metro.frame]]);
                    const hiddenBefore = windowIsHidden;
                    windowIsHidden = true;
                    syncMetronomeView();
                    checks.push(["with Maestro hidden it plays on, and nothing is lit", metro.running && metro.timer !== null && metro.frame === null ? [] : [metro.running, metro.frame]]);
                    windowIsHidden = hiddenBefore;
                    syncMetronomeView();
                    const before = heard.clicks;
                    await pause(320);
                    checks.push(["and keeps booking clicks", heard.clicks > before ? [] : [heard.clicks]]);
                    handleWebMessage({ data: { type: "windowHidden" } });
                    navigate("conservatory");
                    await pause(80);
                    checks.push(["hidden, it lights nothing and books further ahead", metro.frame === null && metro.nextAt - metro.context.currentTime > 0.6 ? [] : [metro.frame, metro.nextAt - metro.context.currentTime]]);
                    handleWebMessage({ data: { type: "windowShown" } });
                    await pause(160);
                    checks.push(["shown again, the lights come back", metro.frame !== null ? [] : ["no frame"]]);
                    // The Podium's module plays the same metronome.
                    const layoutBefore = localStorage.getItem(HOME_LAYOUT_KEY);
                    const layoutsBefore = localStorage.getItem(HOME_LAYOUTS_KEY);
                    changeHomeLayout({ ...MaestroHomeLayout.defaults(), hidden: [] });
                    navigate("home");
                    checks.push(["the module shows the same tempo and its lights run", $("homeMetroTempo").textContent === "120" && $("homeMetroName").textContent === "BPM · Allegro" && metro.frame !== null ? [] : [$("homeMetroTempo").textContent, $("homeMetroName").textContent, metro.frame]]);
                    $("homeMetroFaster").click();
                    checks.push(["its + changes the bar's tempo too", metro.settings.tempo === 121 && $("metroTempo").value === "121" ? [] : [metro.settings.tempo, $("metroTempo").value]]);
                    changeHomeLayout(MaestroHomeLayout.defaults());
                    await pause(60);
                    checks.push(["hidden from the Podium, the title bar keeps the beat", !$("metroChip").hidden && metro.frame !== null ? [] : ["no chip"]]);
                    if (layoutBefore === null) localStorage.removeItem(HOME_LAYOUT_KEY); else localStorage.setItem(HOME_LAYOUT_KEY, layoutBefore);
                    if (layoutsBefore === null) localStorage.removeItem(HOME_LAYOUTS_KEY); else localStorage.setItem(HOME_LAYOUTS_KEY, layoutsBefore);
                    navigate("conservatory");
                    // The tempo box.
                    $("metroTempo").value = "500";
                    $("metroTempo").dispatchEvent(new Event("change", { bubbles: true }));
                    checks.push(["a tempo over the top is held at 300", metro.settings.tempo === 300 && $("metroFaster").disabled ? [] : [metro.settings.tempo]]);
                    $("metroTempo").value = "";
                    $("metroTempo").dispatchEvent(new Event("change", { bubbles: true }));
                    checks.push(["an emptied box changes nothing", metro.settings.tempo === 300 ? [] : [metro.settings.tempo]]);
                    $("metroTempoBox").dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }));
                    checks.push(["the wheel nudges it down by one", metro.settings.tempo === 299 ? [] : [metro.settings.tempo]]);
                    $("metroMeter").value = "6/8";
                    $("metroMeter").dispatchEvent(new Event("change", { bubbles: true }));
                    checks.push(["6/8 shows six beats, the fourth a lesser accent, in both places", [...document.querySelectorAll(".metro-beats")].every(row => row.children.length === 6 && row.children[0].classList.contains("is-first") && row.children[3].classList.contains("is-lesser")) ? [] : ["wrong beats"]]);
                    $("metroMeter").value = "7/8";
                    $("metroMeter").dispatchEvent(new Event("change", { bubbles: true }));
                    checks.push(["7/8 as 2+2+3 accents each group", $("metroMeter").selectedOptions[0]?.textContent === "7/8 (2+2+3)" && [...document.querySelector("#metroBar .metro-beats").children].map(dot => dot.className || "-").join() === "is-first,-,is-lesser,-,is-lesser,-,-" ? [] : [$("metroMeter").selectedOptions[0]?.textContent]]);
                    checks.push(["the time signatures are listed in three groups", $("metroMeter").querySelectorAll("optgroup").length === 3 && $("metroMeter").options.length === Object.keys(MaestroMetronome.METERS).length ? [] : [$("metroMeter").options.length]]);
                    $("metroMeter").value = "6/8";
                    $("metroMeter").dispatchEvent(new Event("change", { bubbles: true }));
                    // The trainer.
                    $("metroTrainerButton").click();
                    checks.push(["the trainer's panel opens", !$("metroTrainerPanel").hidden && $("metroTrainerButton").getAttribute("aria-expanded") === "true" ? [] : ["closed"]]);
                    const field = (id, value) => { $(id).value = value; };
                    $("metroTrainerOn").checked = true;
                    field("metroTrainerFrom", "60"); field("metroTrainerTo", "70"); field("metroTrainerStep", "5"); field("metroTrainerEvery", "1");
                    $("metroTrainerEvery").dispatchEvent(new Event("change", { bubbles: true }));
                    checks.push(["its fields are kept", JSON.stringify(metro.settings.trainer) === JSON.stringify({ on: true, from: 60, to: 70, step: 5, every: 1 }) && $("metroTrainerProblem").hidden ? [] : [JSON.stringify(metro.settings.trainer)]]);
                    stopMetronome();
                    $("metroPlay").click();
                    await pause(60);
                    checks.push(["Start begins at From", metro.settings.tempo === 60 && /^60 of 70, next in 1 bar$/.test($("metroTrainerStatus").textContent) ? [] : [metro.settings.tempo, $("metroTrainerStatus").textContent]]);
                    metroBarEnded();
                    checks.push(["a step after its bars", metro.settings.tempo === 65 && $("metroTempo").value === "65" ? [] : [metro.settings.tempo]]);
                    metroBarEnded();
                    metroBarEnded();
                    checks.push(["then it holds at To", metro.settings.tempo === 70 && $("metroTrainerStatus").textContent === "At 70, the top" ? [] : [metro.settings.tempo, $("metroTrainerStatus").textContent]]);
                    checks.push(["the module says so too", !$("homeMetroTrainer").hidden && $("homeMetroTrainer").textContent === "Tempo trainer: At 70, the top" ? [] : [$("homeMetroTrainer").textContent]]);
                    field("metroTrainerFrom", "200");
                    $("metroTrainerFrom").dispatchEvent(new Event("change", { bubbles: true }));
                    checks.push(["From above To is refused, saying why", !$("metroTrainerProblem").hidden && metro.settings.trainer.from === 80 && metro.settings.trainer.to === 120 ? [] : [JSON.stringify(metro.settings.trainer)]]);
                    $("metroTrainerFrom").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
                    checks.push(["Escape closes the panel, back on its button", $("metroTrainerPanel").hidden && document.activeElement === $("metroTrainerButton") ? [] : ["open"]]);
                    $("metroTrainerButton").click();
                    navigate("notes");
                    checks.push(["leaving the page closes the panel", $("metroTrainerPanel").hidden ? [] : ["open"]]);
                    // 2.3.0: the title bar shows it's playing, and Ctrl + Shift + M works anywhere.
                    checks.push(["on another page, the title bar shows it's playing", !$("metroChip").hidden && $("metroChipText").textContent === `${metro.settings.tempo} BPM · 6/8` ? [] : [$("metroChip").hidden, $("metroChipText").textContent]]);
                    checks.push(["and its dot keeps the beat", metroLightsShown() ? [] : ["no lights"]]);
                    const ctrlShiftM = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "M", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
                    ctrlShiftM();
                    checks.push(["Ctrl + Shift + M stops it from any page, and the chip goes", !metro.running && $("metroChip").hidden ? [] : [metro.running]]);
                    ctrlShiftM();
                    await pause(60);
                    checks.push(["and starts it again", metro.running && !$("metroChip").hidden ? [] : [metro.running]]);
                    $("metroChipStop").click();
                    checks.push(["the chip's Stop stops it", !metro.running && $("metroChip").hidden ? [] : [metro.running]]);
                    $("metroPlay").click();
                    await pause(60);
                    navigate("conservatory");
                    checks.push(["on its own page, the chip stays hidden", metro.running && $("metroChip").hidden ? [] : ["shown"]]);
                    // 2.4.0: Space starts and stops it on the Conservatory, but not while typing.
                    const space = (target = document) => target.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
                    document.activeElement?.blur?.();
                    space();
                    checks.push(["Space stops it on the Conservatory", !metro.running ? [] : ["still running"]]);
                    space();
                    await pause(60);
                    checks.push(["and starts it again", metro.running ? [] : ["stopped"]]);
                    const typing = document.createElement("input");
                    $("conservatory").append(typing);
                    typing.focus();
                    space(typing);
                    checks.push(["Space typed in a field leaves it alone", metro.running ? [] : ["stopped"]]);
                    typing.remove();
                    checks.push(["nor in a list", !spaceStartsMetronome($("metroMeter") ?? document.querySelector("#conservatory select")) ? [] : ["taken"]]);
                    navigate("home");
                    space();
                    checks.push(["and Space does nothing on another page", metro.running ? [] : ["stopped"]]);
                    navigate("conservatory");
                    $("metroPlay").click();
                    checks.push(["Stop ends the booking and the lights, and the audio rests after a quiet spell", !metro.running && metro.timer === null && metro.frame === null && metro.restTimer !== null ? [] : [metro.running, metro.timer, metro.frame, metro.restTimer]]);
                    checks.push(["no beat stays lit", document.querySelectorAll(".metro-beats > .is-on").length === 0 ? [] : ["lit"]]);
                    checks.push(["the settings are kept on this PC", MaestroMetronome.parseSettings(localStorage.getItem(METRO_KEY)).meter === "6/8" ? [] : [localStorage.getItem(METRO_KEY)]]);
                    // 2.3.0: Practice: a count-in, muted bars and practice time.
                    const savedPractice = localStorage.getItem(PRACTICE_KEY);
                    try {
                        $("metroTrainerButton").click();
                        checks.push(["the Practice panel opens on the count-in", !$("metroTrainerPanel").hidden && $("metroCountIn") && $("metroTrainerTitle").textContent === "Practice" ? [] : ["closed"]]);
                        $("metroCountIn").value = "1";
                        $("metroTrainerOn").checked = false;
                        $("metroGapOn").checked = true;
                        $("metroGapPlay").value = "1";
                        $("metroGapMute").value = "1";
                        $("metroGapMute").dispatchEvent(new Event("change", { bubbles: true }));
                        checks.push(["its choices are kept", metro.settings.countIn === 1 && JSON.stringify(metro.settings.gap) === JSON.stringify({ on: true, play: 1, mute: 1 }) && $("metroTrainerStatus").textContent === "Count-in · Muted bars" ? [] : [$("metroTrainerStatus").textContent]]);
                        $("metroGapMute").value = "20";
                        $("metroGapMute").dispatchEvent(new Event("change", { bubbles: true }));
                        checks.push(["too many muted bars is refused, saying why", metro.settings.gap.mute === 2 && /muted bars/.test($("metroTrainerProblem").textContent) ? [] : [metro.settings.gap.mute]]);
                        $("metroGapMute").value = "1";
                        $("metroGapMute").dispatchEvent(new Event("change", { bubbles: true }));
                        toggleMetroTrainer(false);
                        await startMetronome();
                        checks.push(["Start counts in first, its beats alike", metro.countLeft === 1 && metro.booked.length > 0 && metro.booked.every(click => click.weight === 2 || click.weight === 0) && $("metroTrainerStatus").textContent.startsWith("Counting in") ? [] : [metro.countLeft, metro.booked.map(click => click.weight).join()]]);
                        metroBarEnded();
                        checks.push(["the count-in isn't counted as a bar", metro.countLeft === 0 && metro.bars === 0 ? [] : [metro.countLeft, metro.bars]]);
                        metroBarEnded();
                        const clicksBefore = heard.clicks;
                        const bookedBefore = metro.booked.length;
                        metro.nextAt = metro.context.currentTime;
                        clearTimeout(metro.timer);
                        bookMetroClicks();
                        checks.push(["a muted bar is lit but silent", metro.bars === 1 && metro.booked.length > bookedBefore && heard.clicks === clicksBefore && $("metroTrainerStatus").textContent.includes("Muted bar") ? [] : [heard.clicks - clicksBefore, metro.booked.length - bookedBefore]]);
                        metro.practiceFrom = performance.now() - 90000;
                        stopMetronome();
                        checks.push(["the time played is kept by day", MaestroMetronome.practiceSummary(MaestroMetronome.parsePractice(localStorage.getItem(PRACTICE_KEY)), new Date()).today >= 90 ? [] : [localStorage.getItem(PRACTICE_KEY)]]);
                        checks.push(["and shown on the Podium's module", !$("homeMetroPractice").hidden && /^Played today: \d+ min$/.test($("homeMetroPractice").textContent) ? [] : [$("homeMetroPractice").textContent]]);
                    } finally {
                        if (metro.running) stopMetronome();
                        Object.assign(metro.settings, { countIn: 0, gap: { on: false, play: 2, mute: 2 } });
                        saveMetroSettings();
                        if (savedPractice === null) localStorage.removeItem(PRACTICE_KEY); else localStorage.setItem(PRACTICE_KEY, savedPractice);
                        metro.practice = MaestroMetronome.parsePractice(savedPractice);
                        renderMetroPractice();
                        renderMetroTrainer();
                    }
                    // The instruments: the neck, Scales and Tuning.
                    const savedCons = localStorage.getItem(CONS_KEY);
                    try {
                        cons.settings = MaestroMusic.parseSettings(null);
                        cons.chord = -1;
                        consSections.show("scales");
                        renderConservatory();
                        const sharp = String.fromCodePoint(0x266F), flat = String.fromCodePoint(0x266D);
                        const dots = () => [...$("consNeck").querySelectorAll(".cons-dot")];
                        const pcs = list => new Set(list.map(dot => Number(dot.dataset.midi) % 12));
                        checks.push(["the guitar's neck: six strings and 15 frets", $("consNeck").querySelectorAll(".cons-string").length === 6 && $("consNeck").querySelectorAll(".cons-fret-number").length === 15 ? [] : [$("consNeck").querySelectorAll(".cons-string").length]]);
                        checks.push(["G major is marked, G as its root", [...pcs(dots())].sort((a, b) => a - b).join() === "0,2,4,6,7,9,11" && dots().filter(dot => dot.classList.contains("is-root")).every(dot => Number(dot.dataset.midi) % 12 === 7 && dot.textContent.endsWith("G")) ? [] : [[...pcs(dots())].join()]]);
                        checks.push(["its notes are spelled for the key", $("consNotes").textContent === `GABCDEF${sharp}` ? [] : [$("consNotes").textContent]]);
                        checks.push(["and its chords listed", $("consKeyChords").children.length === 7 && $("consChordsTitle").textContent === "Diatonic Chords in G Major" ? [] : [$("consChordsTitle").textContent]]);
                        document.querySelector('#consLabels [data-labels="flat"]').click();
                        checks.push(["Degrees labels the root 1, written as flats", dots().filter(dot => dot.classList.contains("is-root")).every(dot => dot.querySelector("text").textContent === "1") && cons.settings.labels === "degrees" && cons.settings.degreeStyle === "flat" && $("consLabels").querySelector('[aria-pressed="true"]')?.dataset.labels === "flat" ? [] : ["not 1"]]);
                        document.querySelector('#consLabels [data-labels="interval"]').click();
                        checks.push(["or as intervals: the root R, the seventh M7", dots().filter(dot => dot.classList.contains("is-root")).every(dot => dot.querySelector("text").textContent === "R") && dots().some(dot => Number(dot.dataset.midi) % 12 === 6 && dot.querySelector("text").textContent === "M7") ? [] : ["not R"]]);
                        document.querySelector('#consLabels [data-labels="names"]').click();
                        checks.push(["Labels is one choice of three (2.4.1), and names keep the degree style for next time", cons.settings.labels === "names" && cons.settings.degreeStyle === "interval" && $("consLabels").querySelectorAll("[data-labels]").length === 3 && $("consLabels").querySelector('[aria-pressed="true"]')?.dataset.labels === "names" ? [] : [cons.settings.labels, cons.settings.degreeStyle]]);
                        cons.settings.degreeStyle = "flat";
                        $("consRoot").value = "F";
                        $("consRoot").dispatchEvent(new Event("change", { bubbles: true }));
                        checks.push(["F major has its B flat", $("consNotes").textContent === `FGAB${flat}CDE` ? [] : [$("consNotes").textContent]]);
                        checks.push(["the Key chip (2.4.1) names it, and opens the root and scale", $("consKeyName").textContent === "F major" && $("consRoot").closest("#consKeyPanel") && $("consScale").closest("#consKeyPanel") ? [] : [$("consKeyName").textContent]]);
                        $("consKeyButton").click();
                        checks.push(["it opens alone, closing the instrument's", !$("consKeyPanel").hidden && $("consInstPanel").hidden && $("consKeyButton").getAttribute("aria-expanded") === "true" ? [] : ["closed"]]);
                        $("consInstButton").click();
                        checks.push(["and the instrument's closes it", $("consKeyPanel").hidden && !$("consInstPanel").hidden ? [] : ["both"]]);
                        $("consInstPanel").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
                        // A note's tooltip names it as its label does, not always in sharps.
                        const tip = node => node?.querySelector("title")?.textContent || "";
                        const bFlat = dots().find(dot => Number(dot.dataset.midi) % 12 === 10);
                        checks.push(["hovering B flat on the neck says B flat", tip(bFlat).startsWith(`B${flat}`) && !tip(bFlat).includes(sharp) ? [] : [tip(bFlat)]]);
                        const blackKey = $("consKeyboard").querySelector('.cons-key[data-midi="58"]');
                        checks.push(["and on the keyboard, with its octave", tip(blackKey) === `B${flat}3` ? [] : [tip(blackKey)]]);
                        const unmarkedKey = $("consKeyboard").querySelector('.cons-key[data-midi="49"]');
                        checks.push(["a key outside the scale leans the key's way", tip(unmarkedKey) === `D${flat}3` ? [] : [tip(unmarkedKey)]]);
                        const plucksBefore = heard.clicks;
                        $("consKeyChords").children[4].click();
                        await pause(40);
                        checks.push(["a chord shows only its notes, C E G", [...pcs(dots())].sort((a, b) => a - b).join() === "0,4,7" && $("consKeyChords").children[4].getAttribute("aria-pressed") === "true" ? [] : [[...pcs(dots())].join()]]);
                        checks.push(["and sounds its three notes", heard.clicks - plucksBefore === 3 ? [] : [heard.clicks - plucksBefore]]);
                        $("consKeyChords").children[4].click();
                        checks.push(["clicked again, the scale comes back", pcs(dots()).size === 7 ? [] : [pcs(dots()).size]]);
                        // 2.3.0 fix: chords pressed while the last was dying away froze the
                        // audio, and Start then played them all at once.
                        const ended = sources => sources.forEach(source => source.listeners?.ended?.());
                        const suspendedBefore = heard.suspended;
                        $("consKeyChords").children[0].click();
                        await pause(40);
                        const firstChord = heard.sources.slice(-3);
                        ended(firstChord);
                        checks.push(["a chord's notes ending doesn't rest the audio at once", heard.suspended === suspendedBefore && metro.restTimer !== null ? [] : [heard.suspended - suspendedBefore]]);
                        const startsBefore = heard.clicks;
                        $("consKeyChords").children[1].click();
                        await pause(40);
                        checks.push(["the next chord sounds at once, all three notes", heard.clicks - startsBefore === 3 && heard.suspended === suspendedBefore && metro.restTimer === null ? [] : [heard.clicks - startsBefore, heard.suspended - suspendedBefore]]);
                        const secondChord = heard.sources.slice(-3);
                        $("consKeyChords").children[3].click();
                        await pause(40);
                        checks.push(["a new chord damps the one still ringing", secondChord.every(source => source.stopped) ? [] : ["still ringing"]]);
                        $("consKeyChords").children[3].click();
                        metro.restAfter = 30;
                        cons.starting = 1;
                        restConsAudio();
                        await pause(90);
                        checks.push(["it never rests while a sound is on its way", heard.suspended === suspendedBefore ? [] : ["rested"]]);
                        cons.starting = 0;
                        cons.voices.clear();
                        restConsAudio();
                        await pause(90);
                        checks.push(["it rests after a quiet spell", heard.suspended === suspendedBefore + 1 ? [] : [heard.suspended - suspendedBefore]]);
                        metro.restAfter = 8000;
                        await pluckConsNotes(Array.from({ length: 30 }, (_, index) => 40 + index));
                        checks.push(["no more than 24 notes ring at once", cons.voices.size === 24 ? [] : [cons.voices.size]]);
                        checks.push(["the tones go through a limiter", cons.tonesOut !== null && heard.sources.length > 0 ? [] : ["no output"]]);
                        cons.voices.clear();
                        // Chromatic.
                        document.querySelector('#consShow [data-show="all"]').click();
                        checks.push(["Chromatic marks all twelve, the scale's stronger", pcs(dots()).size === 12 && dots().filter(dot => dot.classList.contains("is-other")).every(dot => ![0, 2, 4, 5, 7, 9, 10].includes(Number(dot.dataset.midi) % 12)) ? [] : [pcs(dots()).size]]);
                        document.querySelector('#consLabels [data-labels="flat"]').click();
                        const outside = dots().find(dot => Number(dot.dataset.midi) % 12 === 6);
                        checks.push(["a note outside the key is labeled from its root", outside?.querySelector("text").textContent === `${flat}2` && outside.classList.contains("is-other") ? [] : [outside?.textContent]]);
                        document.querySelector('#consLabels [data-labels="names"]').click();
                        checks.push(["and named the way the key leans", dots().some(dot => Number(dot.dataset.midi) % 12 === 1 && dot.querySelector("text").textContent === `D${flat}`) ? [] : ["not flat"]]);
                        checks.push(["its tooltip too", dots().filter(dot => Number(dot.dataset.midi) % 12 === 1).every(dot => dot.querySelector("title").textContent.startsWith(`D${flat}`)) ? [] : ["sharp"]]);
                        document.querySelector('#consShow [data-show="scale"]').click();
                        checks.push(["Diatonic goes back to the scale", pcs(dots()).size === 7 ? [] : [pcs(dots()).size]]);
                        // The scale library.
                        checks.push(["scales are listed in their families", $("consScale").querySelectorAll("optgroup").length === MaestroMusic.FAMILIES.length && $("consScale").options.length === Object.keys(MaestroMusic.SCALES).length ? [] : [$("consScale").options.length]]);
                        $("consRoot").value = "A";
                        $("consRoot").dispatchEvent(new Event("change", { bubbles: true }));
                        $("consScale").value = "hirajoshi";
                        $("consScale").dispatchEvent(new Event("change", { bubbles: true }));
                        checks.push(["A Hirajoshi", $("consNotes").textContent === "ABCEF" && pcs(dots()).size === 5 ? [] : [$("consNotes").textContent]]);
                        $("consScale").value = "phrygianDominant";
                        $("consScale").dispatchEvent(new Event("change", { bubbles: true }));
                        checks.push(["A Phrygian dominant, with its chords", $("consNotes").textContent === `AB${flat}C${sharp}DEFG` && $("consKeyChords").children.length === 7 ? [] : [$("consNotes").textContent]]);
                        $("consRoot").value = "F";
                        $("consRoot").dispatchEvent(new Event("change", { bubbles: true }));
                        $("consScale").value = "major";
                        $("consScale").dispatchEvent(new Event("change", { bubbles: true }));
                        // 2.3.0: sevenths, the capo, left-handed, the drone and the scale played.
                        document.querySelector('#consChordSize [data-sevenths="true"]').click();
                        checks.push(["Sevenths lists four-note chords", $("consKeyChords").children[4].querySelector(".key-name .csym").getAttribute("aria-label") === "C7" && $("consKeyChords").classList.contains("is-sevenths") ? [] : [$("consKeyChords").children[4].textContent]]);
                        $("consKeyChords").children[4].click();
                        checks.push(["and shows a seventh chord's four notes", [...pcs(dots())].sort((a, b) => a - b).join() === "0,4,7,10" ? [] : [[...pcs(dots())].join()]]);
                        $("consKeyChords").children[4].click();
                        document.querySelector('#consChordSize [data-sevenths="false"]').click();
                        $("consCapo").value = "3";
                        $("consCapo").dispatchEvent(new Event("change", { bubbles: true }));
                        checks.push(["a capo draws its bar, and nothing below it is marked", $("consNeck").querySelector(".cons-capo") && dots().length > 0 && dots().every(dot => Number(dot.dataset.fret) >= 3) ? [] : ["below the capo"]]);
                        checks.push(["each chord names its shape", $("consKeyChords").children[0].querySelector(".key-shape")?.textContent === "D shape" ? [] : [$("consKeyChords").children[0].textContent]]);
                        $("consCapo").value = "0";
                        $("consCapo").dispatchEvent(new Event("change", { bubbles: true }));
                        checks.push(["no capo, no shapes", !$("consKeyChords").querySelector(".key-shape") && !$("consNeck").querySelector(".cons-capo") ? [] : ["still there"]]);
                        const nutX = () => Number($("consNeck").querySelector(".cons-nut").getAttribute("x1"));
                        const rightNut = nutX();
                        $("consLefty").click();
                        checks.push(["left-handed puts the nut on the right", nutX() > 1000 && rightNut < 1000 && $("consLefty").getAttribute("aria-pressed") === "true" ? [] : [rightNut, nutX()]]);
                        $("consLefty").click();
                        // 2.4.1: the instrument chip, at the right of the tabs, opens a popover with the instrument, tuning, capo and hand.
                        const instDetail = () => $("consInstDetail").textContent;
                        const instOpen = () => !$("consInstPanel").hidden;
                        const box = node => node.getBoundingClientRect();
                        checks.push(["the tabs come first in the top bar, the instrument chip last", $("consTabs").parentElement.firstElementChild === $("consTabs") && $("consTabs").parentElement.lastElementChild.contains($("consInstButton")) && !instOpen() ? [] : ["order"]]);
                        checks.push(["the chip names the instrument and tuning", $("consInstName").textContent === "Guitar" && instDetail() === "Standard · E A D G B E" ? [] : [$("consInstName").textContent, instDetail()]]);
                        const neckBefore = box($("consNeckModule"));
                        $("consInstButton").click();
                        const instPop = box($("consInstPanel"));
                        const instNeck = box($("consNeckModule"));
                        checks.push(["it opens its popover from the chip's right edge, moving nothing", instOpen() && $("consInstButton").getAttribute("aria-expanded") === "true" && Math.abs(instPop.right - box($("consInstButton")).right) < 1 && Math.abs(instNeck.top - neckBefore.top) < 0.5 && Math.abs(instNeck.height - neckBefore.height) < 0.5 ? [] : [Math.round(instPop.right), Math.round(box($("consInstButton")).right), neckBefore.top, instNeck.top]]);
                        checks.push(["stacked, it leaves the nut's half of the neck clear", instPop.width < instNeck.width / 2 && [...$("consInstPanel").children].every(child => box(child).left >= instPop.left) ? [] : [Math.round(instPop.width), Math.round(instNeck.width)]]);
                        $("consCapo").value = "3";
                        $("consCapo").dispatchEvent(new Event("change", { bubbles: true }));
                        $("consLefty").click();
                        checks.push(["and says the capo and the hand", instDetail().endsWith("· Capo 3 · Left-handed") && instOpen() ? [] : [instDetail()]]);
                        toggleProgPopover("key", true);
                        checks.push(["one popover at a time", !instOpen() && !$("progKeyPanel").hidden ? [] : [instOpen()]]);
                        $("consInstButton").click();
                        checks.push(["either way", instOpen() && $("progKeyPanel").hidden ? [] : [$("progKeyPanel").hidden]]);
                        $("consInstPanel").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
                        checks.push(["Escape closes it, back on the chip", !instOpen() && document.activeElement === $("consInstButton") ? [] : [document.activeElement?.id]]);
                        consSections.show("chords");
                        checks.push(["where the capo is set aside, the chip leaves it out", !instDetail().includes("Capo") && instDetail().endsWith("Left-handed") ? [] : [instDetail()]]);
                        consSections.show("scales");
                        $("consCapo").value = "0";
                        $("consCapo").dispatchEvent(new Event("change", { bubbles: true }));
                        $("consLefty").click();
                        $("consInstButton").click();
                        document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
                        checks.push(["a click outside closes it", !instOpen() && $("consInstButton").getAttribute("aria-expanded") === "false" ? [] : ["open"]]);
                        $("consInstButton").click();
                        $("consInstButton").click();
                        checks.push(["and so does the chip again", !instOpen() ? [] : ["open"]]);
                        $("consInstButton").click();
                        $("consMakeTuning").click();
                        checks.push(["Make a tuning opens the form on the Tuning tab", consSections.current() === "tuning" && !$("consTuningForm").hidden && !instOpen() ? [] : [consSections.current()]]);
                        closeConsTuningForm();
                        consSections.show("scales");
                        // 2.4.1, stage 5: each tab's controls in the module they change; no row under the neck but on Scales.
                        checks.push(["only Scales keeps a row under the neck", [...document.querySelectorAll(".cons-panel")].filter(panel => panel.querySelector(":scope > .cons-scalebar")).map(panel => panel.id).join() === "consScales" ? [] : [[...document.querySelectorAll(".cons-panel")].filter(panel => panel.querySelector(":scope > .cons-scalebar")).map(panel => panel.id).join()]]);
                        consSections.show("chords");
                        checks.push(["Chords: the name, label and actions are the Chord module's, Save its one primary", ["consChordName", "consChordLabel", "consChordSave", "consChordStrum", "consChordClear"].every(id => $(id).closest(".cons-chord-module")) && $("consChordSave").classList.contains("primary") && $("consChordClear").classList.contains("link-button") ? [] : ["elsewhere"]]);
                        checks.push(["and the way chords are written heads it", $("consChordStyle").closest(".cons-chord-module .module-head") ? [] : ["elsewhere"]]);
                        consSections.show("finder");
                        const pickedBefore5 = finder.picked;
                        finder.picked = [];
                        renderFinder();
                        checks.push(["Finder: Strum and Clear head the chords, with no how-to text", !$("consFinderHint") && $("consPickStrum").closest(".cons-finder-head") && $("consPickClear").classList.contains("link-button") ? [] : ["hidden"]]);
                        finder.picked = [{ string: 4, fret: 3, midi: 48 }];
                        renderFinder();
                        finder.picked = pickedBefore5;
                        renderFinder();
                        // 2.8.0: the Theory tab: the row and the notes it still needs, the matrix, a set, negative harmony.
                        // What these change in storage is put back as it was.
                        const stored28 = [PROG_KEY, CP_KEY, THEORY_KEY].map(key => [key, localStorage.getItem(key)]);
                        consSections.show("theory");
                        const theoryBefore = structuredClone(theory.settings);
                        checks.push(["Theory: a tab of its own, between Rhythm and Finder", !$("consTheoryPanel").hidden && MaestroMusic.TABS.indexOf("theory") === MaestroMusic.TABS.indexOf("rhythm") + 1 ? [] : ["not shown"]]);
                        setTheoryRow("C D E C");
                        const chips = [...$("theoryRowNotes").querySelectorAll("[data-pc]")];
                        checks.push(["Theory: an unfinished row shows all twelve notes, those missing to add, the one written twice marked", !$("theoryRowNotes").hidden && chips.length === 12 && chips.filter(chip => chip.classList.contains("is-missing")).length === 9 && chips[0].classList.contains("is-repeated") && $("theoryMatrix").hidden ? [] : [chips.map(chip => chip.className).join(" ")]]);
                        setTheoryRow("C D E");
                        $("theoryRowNotes").querySelector('[data-pc="1"]').click();
                        checks.push(["Theory: a missing note clicked is added at the row's end", theory.settings.row.trim().endsWith("C\u266F") && /9 to come|still to come/.test($("theoryRowNote").textContent) ? [] : [theory.settings.row, $("theoryRowNote").textContent]]);
                        setTheoryRow("G Bb D F# A C E G# B C# Eb F");
                        checks.push(["Theory: a whole row draws its matrix, labels round it, and hides the strip", $("theoryMatrix").children.length === 14 * 14 && $("theoryRowNotes").hidden && !$("theoryForm").hidden ? [] : [$("theoryMatrix").children.length]]);
                        $("theoryMatrix").querySelector('[data-kind="R"][data-number="3"]').click();
                        checks.push(["Theory: a label picks its form", $("theoryFormName").textContent === "R3" && $("theoryMatrix").querySelector('[data-kind="R"][data-number="3"]').getAttribute("aria-pressed") === "true" ? [] : [$("theoryFormName").textContent]]);
                        setTheorySet([]);
                        [60, 64, 67].forEach(midi => consNeckModes.theory.click(midi));
                        checks.push(["Theory: notes picked on the neck make the set, and it's named", theory.settings.set.join() === "0,4,7" && $("theorySetFacts").textContent.includes("3-11") && $("theorySetFacts").textContent.includes("major or minor triad") ? [] : [theory.settings.set.join(), $("theorySetFacts").textContent.slice(0, 80)]]);
                        Object.assign(theory.settings, { root: "C", scale: "major", sevenths: false });
                        renderTheory();
                        checks.push(["Theory: negative harmony lists the key's chords and their mirrors", $("theoryNegatives").children.length === 7 && $("theoryNegatives").children[0].dataset.negative === "Cm" && $("theoryNegatives").children[4].dataset.negative === "Fm" ? [] : [[...$("theoryNegatives").children].map(each => each.dataset.negative).join()]]);
                        const cpBefore28 = cp.exercise;
                        writeTheoryForm();
                        checks.push(["Theory: a form goes to Counterpoint as a melody", consSections.current() === "counterpoint" && cp.exercise.kind === "melody" && cp.exercise.score.staves[0].voices[0].notes.filter(note => note.p).length === 12 ? [] : [consSections.current(), cp.exercise.kind]]);
                        setCpExercise(cpBefore28);
                        // 2.8.0: the checker's rules.
                        const rulesBefore = [...cp.rulesOff];
                        $("cpRulesButton").click();
                        const ruleBoxes = [...$("cpRuleList").querySelectorAll("[data-rule]")];
                        checks.push(["Counterpoint: Rules lists every group, by section", !$("cpRulesPanel").hidden && ruleBoxes.length === MaestroCounterpoint.RULE_GROUPS.length && $("cpRuleList").querySelectorAll("fieldset").length === 4 ? [] : [ruleBoxes.length]]);
                        document.querySelector('#cpRulePresets [data-rules="essentials"]').click();
                        checks.push(["Counterpoint: Essentials turns the rest off, kept, and the chip says how many are on", cp.rulesOff.join() === MaestroCounterpoint.RULE_PRESETS.essentials.join() && JSON.parse(localStorage.getItem(CP_KEY)).rulesOff.length === cp.rulesOff.length && $("cpRulesName").textContent === `5 of ${MaestroCounterpoint.RULE_GROUPS.length}` ? [] : [cp.rulesOff.length, $("cpRulesName").textContent]]);
                        $("cpRuleList").querySelector('[data-rule="range"]').click();
                        checks.push(["Counterpoint: a rule switched back on", !cp.rulesOff.includes("range") ? [] : ["still off"]]);
                        setCpRulesOff(rulesBefore);
                        $("cpRulesPanel").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
                        // 2.8.0: Progressions' Tab view and negative harmony.
                        consSections.show("progressions");
                        const viewBefore28 = prog.settings.view;
                        const progStateBefore28 = { at: { ...prog.at }, barOpen: prog.barOpen, sectionOpen: prog.sectionOpen };
                        setProgView("tab");
                        const tabSvg = $("progStaffScore").querySelector("svg");
                        checks.push(["Progressions: Tab writes each chord's frets under the staff", consKeyboard() || (tabSvg && tabSvg.querySelector(".prog-tab") && tabSvg.querySelectorAll(".prog-tab-fret").length > 0) ? [] : ["no tab"]]);
                        setProgView(viewBefore28 === "tab" ? "chart" : viewBefore28);
                        const sketchBefore28 = structuredClone(progSketch());
                        prog.settings.sketch = MaestroHarmony.cleanChart({ ...sketchBefore28, root: "C", scale: "major", sections: [{ name: "", repeat: 1, bars: [["C"], ["G7"]] }] });
                        negativeProgression();
                        checks.push(["Progressions: Negative harmony mirrors the song and its key", progSketch().scale === "minor" && progSketch().sections[0].bars.flat().join() === "Cm,Fm6" ? [] : [progSketch().scale, progSketch().sections[0].bars.flat().join()]]);
                        prog.settings.sketch = sketchBefore28;
                        Object.assign(prog, progStateBefore28);
                        clampProgPick();
                        rebuildProgTimeline();
                        saveProgression();
                        renderProgressions();
                        consSections.show("theory");
                        Object.assign(theory.settings, theoryBefore);
                        saveTheory();
                        renderTheory();
                        stored28.forEach(([key, value]) => (value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value)));
                        consSections.show("quiz");
                        const quizBefore5 = { quizKind: cons.settings.quizKind, quizChords: cons.settings.quizChords, quizDirection: cons.settings.quizDirection };
                        Object.assign(cons.settings, { quizKind: "quality", quizChords: "sevenths", quizDirection: "together" });
                        renderQuiz();
                        checks.push(["Quiz: the kind heads its module, the options a chip that says them", $("consQuizKind").closest(".cons-quiz-head") && $("consQuizOptionsName").textContent === "Sevenths · Together" && $("consQuizTitle").textContent === "Chords by Ear" ? [] : [$("consQuizOptionsName").textContent]]);
                        $("consQuizOptionsButton").click();
                        checks.push(["its popover holds what this kind uses", !$("consQuizOptionsPanel").hidden && !$("consQuizChordsField").hidden && !$("consQuizDirectionField").hidden && $("consQuizNaturalsField").hidden ? [] : ["fields"]]);
                        $("consQuizOptionsPanel").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
                        // 2.7.0: each kind's options inside their popover, and the popover inside its module (Write ran past the edge).
                        const popSpill = [];
                        MaestroMusic.QUIZ_KINDS.forEach(kind => {
                            setConsQuiz({ quizKind: kind });
                            toggleConsPopover("quiz", true);
                            const panel = $("consQuizOptionsPanel");
                            const box = panel.getBoundingClientRect();
                            const module = panel.closest(".module").getBoundingClientRect();
                            const out = [...panel.querySelectorAll("button, label, .cons-choice-label")].filter(node => node.offsetParent && (node.getBoundingClientRect().right > box.right - 10 || node.getBoundingClientRect().left < box.left + 10));
                            if (out.length || box.right > module.right + 0.5 || box.left < module.left - 0.5) popSpill.push(`${kind}: ${out.map(node => node.textContent).join("|")} ${Math.round(box.left)}-${Math.round(box.right)} in ${Math.round(module.left)}-${Math.round(module.right)}`);
                            toggleConsPopover("quiz", false);
                        });
                        checks.push(["each quiz's options fit their popover, and it fits the module", popSpill]);
                        cons.settings.quizKind = "note";
                        renderQuiz();
                        checks.push(["Name the note's chip says which notes", ["All notes", "Natural notes"].includes($("consQuizOptionsName").textContent) ? [] : [$("consQuizOptionsName").textContent]]);
                        Object.assign(cons.settings, quizBefore5);
                        renderQuiz();
                        consSections.show("tuning");
                        checks.push(["Tuning: concert pitch is a chip beside the tones' sound", $("consA4Name").textContent === `${cons.settings.a4} Hz` && $("consA4").closest("#consA4Panel") && $("consToneRow").hidden ? [] : [$("consA4Name").textContent]]);
                        consSections.show("scales");
                        const droneBefore = heard.clicks;
                        $("consDrone").click();
                        await pause(40);
                        checks.push(["the drone holds the root", cons.drone?.midi === 41 && $("consDrone").getAttribute("aria-pressed") === "true" && heard.clicks > droneBefore ? [] : [cons.drone?.midi]]);
                        $("consRoot").value = "G";
                        $("consRoot").dispatchEvent(new Event("change", { bubbles: true }));
                        checks.push(["a new root moves it", cons.drone?.midi === 43 ? [] : [cons.drone?.midi]]);
                        $("consRoot").value = "F";
                        $("consRoot").dispatchEvent(new Event("change", { bubbles: true }));
                        const scaleBefore = heard.clicks;
                        $("consPlayScale").click();
                        await pause(40);
                        checks.push(["Play scale plays it up an octave and back, the first notes booked ahead (2.6.0: as it goes)", cons.scalePlay?.run?.events.length === 15 && heard.clicks > scaleBefore && $("consPlayScale").textContent === "Stop" ? [] : [cons.scalePlay?.run?.events.length, heard.clicks - scaleBefore]]);
                        const firstBooked = cons.scalePlay.run.next;
                        setMetroTempo(metro.settings.tempo * 2);
                        await pause(120);
                        checks.push(["a faster tempo takes hold as it plays (2.6.0)", cons.scalePlay.run.tempo === metro.settings.tempo && cons.scalePlay.run.next >= firstBooked ? [] : [cons.scalePlay.run.tempo]]);
                        setMetroTempo(metro.settings.tempo / 2);
                        $("consPlayScale").click();
                        checks.push(["and Stop stops it", cons.scalePlay === null && $("consPlayScale").textContent === "Play scale" ? [] : ["playing"]]);
                        navigate("notes");
                        checks.push(["leaving the page ends the drone", cons.drone === null ? [] : ["droning"]]);
                        navigate("conservatory");
                        $("consScale").value = "minorPentatonic";
                        $("consScale").dispatchEvent(new Event("change", { bubbles: true }));
                        checks.push(["a pentatonic lists no chords and says why", $("consKeyChords").hidden && /seven notes/.test($("consChordsNote").textContent) ? [] : [$("consChordsNote").textContent]]);
                        const notePluck = heard.clicks;
                        dots()[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
                        await pause(40);
                        checks.push(["a note on the neck sounds when clicked", heard.clicks === notePluck + 1 ? [] : [heard.clicks - notePluck]]);
                        document.querySelector('#consInstruments [data-instrument="bass"]').click();
                        checks.push(["the bass: four strings and its tunings", $("consNeck").querySelectorAll(".cons-string").length === 4 && [...$("consTuning").options].map(option => option.value).join() === "standard,dropD,five" ? [] : [[...$("consTuning").options].map(option => option.value).join()]]);
                        $("consTuning").value = "five";
                        $("consTuning").dispatchEvent(new Event("change", { bubbles: true }));
                        checks.push(["a five-string tuning draws five strings", $("consNeck").querySelectorAll(".cons-string").length === 5 ? [] : [$("consNeck").querySelectorAll(".cons-string").length]]);
                        document.querySelector('#consInstruments [data-instrument="keyboard"]').click();
                        checks.push(["the keyboard: a keyboard across the top, and no tuning", $("consNeck").querySelector(".cons-keys") && $("consTuningField").hidden && $("consMakeTuning").hidden && $("consInstName").textContent === "Keyboard" && $("consInstDetail").textContent === "" && $("consKeyboardModule").hidden ? [] : ["wrong"]]);
                        consSections.show("tuning");
                        checks.push(["its Tuning gives A4 alone", $("consStrings").children.length === 1 && $("consTuningsModule").hidden ? [] : [$("consStrings").children.length]]);
                        document.querySelector('#consInstruments [data-instrument="guitar"]').click();
                        checks.push(["the guitar's reference tones, low to high", [...$("consStrings").children].map(button => button.querySelector("strong").textContent).join(" ") === "E2 A2 D3 G3 B3 E4" ? [] : [$("consStrings").textContent]]);
                        checks.push(["with their frequencies", $("consStrings").children[0].textContent.endsWith("82.4 Hz") ? [] : [$("consStrings").children[0].textContent]]);
                        checks.push(["the neck names the open strings", [...$("consNeck").querySelectorAll(".cons-dot")].length === 6 ? [] : [$("consNeck").querySelectorAll(".cons-dot").length]]);
                        checks.push(["their tooltips name them as their labels do", [...$("consNeck").querySelectorAll(".cons-dot")].every(dot => dot.querySelector("title").textContent.startsWith(dot.querySelector("text").textContent)) ? [] : ["differ"]]);
                        $("consA4").value = "442";
                        $("consA4").dispatchEvent(new Event("change", { bubbles: true }));
                        checks.push(["A4 at 442 moves every tone", $("consStrings").children[1].textContent.endsWith("110.5 Hz") ? [] : [$("consStrings").children[1].textContent]]);
                        $("consA4").value = "900";
                        $("consA4").dispatchEvent(new Event("change", { bubbles: true }));
                        checks.push(["an A4 out of range is refused", cons.settings.a4 === 442 && $("consA4").value === "442" ? [] : [cons.settings.a4]]);
                        $("consTone").value = "steady";
                        $("consTone").dispatchEvent(new Event("change", { bubbles: true }));
                        $("consStrings").children[0].click();
                        await pause(40);
                        checks.push(["a steady tone holds until stopped", cons.steady?.midi === 40 && $("consStrings").children[0].getAttribute("aria-pressed") === "true" && !$("consToneRow").hidden ? [] : [cons.steady?.midi]]);
                        navigate("notes");
                        checks.push(["leaving the page stops it", cons.steady === null ? [] : ["still sounding"]]);
                        navigate("conservatory");
                        // Tunings of your own.
                        $("consNewTuning").click();
                        checks.push(["New tuning offers each string", !$("consTuningForm").hidden && $("consTuningPitches").querySelectorAll("select").length === 6 ? [] : ["no form"]]);
                        $("consTuningForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
                        checks.push(["a tuning needs a name", !$("consTuningProblem").hidden && cons.settings.own.length === 0 ? [] : ["saved"]]);
                        $("consTuningName").value = "Open C";
                        const pitches = $("consTuningPitches").querySelectorAll("select");
                        [36, 43, 48, 55, 60, 64].forEach((midi, index) => { pitches[index].value = String(midi); });
                        $("consTuningForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
                        checks.push(["it's saved and chosen", cons.settings.own.length === 1 && MaestroMusic.currentTuning(cons.settings).name === "Open C" && $("consTuningForm").hidden ? [] : [cons.settings.own.length]]);
                        checks.push(["and listed as yours", $("consTuning").querySelector('optgroup[label="Yours"]') && $("consTunings").textContent.includes("Yours") && $("consStrings").children[0].querySelector("strong").textContent === "C2" ? [] : [$("consTunings").textContent]]);
                        $("consTunings").querySelector("[data-delete-tuning]").click();
                        checks.push(["deleting it goes back to Standard, with Undo", cons.settings.own.length === 0 && MaestroMusic.currentTuning(cons.settings).id === "standard" && $("toast").querySelector(".toast-action")?.textContent === "Undo" ? [] : [cons.settings.own.length]]);
                        $("toast").querySelector(".toast-action").click();
                        checks.push(["Undo puts it back", cons.settings.own.length === 1 && MaestroMusic.currentTuning(cons.settings).name === "Open C" ? [] : [cons.settings.own.length]]);
                        checks.push(["the page's settings are kept on this PC", MaestroMusic.parseSettings(localStorage.getItem(CONS_KEY)).own[0]?.name === "Open C" ? [] : [localStorage.getItem(CONS_KEY)]]);
                        // 2.3.0: a position, and the Finder.
                        chooseConsTuning("standard");
                        consSections.show("scales");
                        setConsScale({ root: "G", scale: "major" });
                        $("consPosition").value = "5";
                        $("consPosition").dispatchEvent(new Event("change", { bubbles: true }));
                        checks.push(["a position marks its five frets and is lit", dots().length > 0 && dots().every(dot => Number(dot.dataset.fret) >= 5 && Number(dot.dataset.fret) <= 9) && $("consNeck").querySelector(".cons-window") ? [] : [dots().map(dot => dot.dataset.fret).join()]]);
                        $("consPosition").value = "-1";
                        $("consPosition").dispatchEvent(new Event("change", { bubbles: true }));
                        checks.push(["the whole neck again", dots().some(dot => Number(dot.dataset.fret) > 9) && !$("consNeck").querySelector(".cons-window") ? [] : ["still a position"]]);
                        consSections.show("finder");
                        checks.push(["Finder offers every place on the neck to pick", dots().length === 96 && dots().every(dot => dot.classList.contains("is-spot")) && /Pick two/.test($("consFoundChordsNote").textContent) ? [] : [dots().length]]);
                        // The user's report: fingering a chord string by string found nothing,
                        // because picks were by note, so a second C or E dropped the first.
                        // Clicked as a pointer would: whatever is drawn at the place's center.
                        const press = (string, fret) => {
                            const place = $("consNeck").querySelector(`.cons-dot[data-string="${string}"][data-fret="${fret}"]`);
                            place.scrollIntoView({ block: "center" });
                            const box = place.querySelector("circle").getBoundingClientRect();
                            document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
                        };
                        const marked = () => dots().filter(dot => !dot.classList.contains("is-spot"));
                        const pickedBefore = heard.clicks;
                        [[1, 3], [2, 2], [3, 0], [4, 1], [5, 0]].forEach(([string, fret]) => press(string, fret));
                        await pause(40);
                        checks.push(["an open C, fingered string by string, keeps all five notes", finder.picked.length === 5 && marked().length === 5 && heard.clicks - pickedBefore === 5 && $("consPicked").textContent === "CEGCE" ? [] : [finder.picked.length, marked().length, $("consPicked").textContent]]);
                        checks.push(["the lowest is the bass", marked().filter(dot => dot.classList.contains("is-root")).map(dot => dot.dataset.midi).join() === "48" ? [] : ["wrong bass"]]);
                        checks.push(["the Finder names the chord", $("consFoundChords").children[0]?.querySelector(".csym").getAttribute("aria-label") === "C" ? [] : [$("consFoundChords").textContent]]);
                        checks.push(["and lists the scales that hold it, C major first", $("consFoundScales").children[0]?.dataset.root === "C" && $("consFoundScales").children[0]?.dataset.scale === "major" && $("consFoundScales").children.length === 24 ? [] : [$("consFoundScales").children.length]]);
                        press(1, 0);
                        checks.push(["another fret on a string moves its pick: the open A makes it Am7, or C6 over A", finder.picked.length === 5 && [...$("consFoundChords").children].map(item => item.querySelector(".csym").getAttribute("aria-label")).join(" ") === "Am7 C6/A" ? [] : [$("consFoundChords").textContent]]);
                        press(1, 0);
                        checks.push(["the same fret again clears the string: C over E", finder.picked.length === 4 && $("consFoundChords").children[0]?.querySelector(".csym").getAttribute("aria-label") === "C/E" ? [] : [finder.picked.length, $("consFoundChords").textContent]]);
                        await pause(40);
                        const strumBefore = heard.clicks;
                        $("consPickStrum").click();
                        await pause(40);
                        checks.push(["Strum plays the shape", heard.clicks - strumBefore === 4 ? [] : [heard.clicks - strumBefore]]);
                        $("consFoundScales").querySelector('[data-root="C"][data-scale="major"]').click();
                        checks.push(["a scale found opens in Scales", consSections.current() === "scales" && cons.settings.root === "C" && cons.settings.scale === "major" ? [] : [consSections.current(), cons.settings.root]]);
                        consSections.show("finder");
                        $("consPickClear").click();
                        // 2.3.0: Chords. A shape fingered on five frets, named, written on a
                        // staff, and kept in a library that AHK saves.
                        const chordMessagesFrom = messages.length;
                        consSections.show("chords");
                        const chordDots = () => [...$("consNeck").querySelectorAll(".cons-chord-neck .cons-dot")];
                        const fretNumbers = () => [...$("consNeck").querySelectorAll(".cons-fret-number")].map(number => number.textContent).join();
                        checks.push(["Chords asks AHK for the saved chords", sent.has("GetChords") ? [] : ["not asked"]]);
                        checks.push(["Chords shows five frets, every string left out, and sets the capo aside", fretNumbers() === "1,2,3,4,5" && chordDots().filter(dot => dot.classList.contains("is-muted")).length === 6 && $("consCapo").closest("label").hidden ? [] : [fretNumbers()]]);
                        checks.push(["with nothing to save yet", $("consChordSave").disabled && /Pick notes/.test($("consNeck").querySelector(".cons-chord-card").textContent) ? [] : ["save offered"]]);
                        handleWebMessage({ data: { type: "chords", items: [
                            { name: "Am", instrument: "guitar", tuning: [40, 45, 50, 55, 59, 64], shape: [null, 0, 2, 2, 1, 0] },
                            { name: "bad", instrument: "guitar", tuning: [40], shape: [1] },
                            { name: "C", instrument: "keyboard", tuning: [], shape: [48, 52, 55] }
                        ] } });
                        checks.push(["the library shows the guitar's chords, and drops a malformed one", chords.library.length === 2 && $("consSaved").children.length === 1 && $("consSavedCount").textContent === "1 for guitar" ? [] : [$("consSavedCount").textContent]]);
                        const fingerChord = (string, fret) => {
                            const place = $("consNeck").querySelector(`.cons-chord-neck .cons-dot[data-string="${string}"][data-fret="${fret}"]`);
                            place.scrollIntoView({ block: "center" });
                            const box = place.querySelector("circle").getBoundingClientRect();
                            document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
                        };
                        $("consNeck").querySelector('[data-chord-move="1"]').click();
                        checks.push(["the arrow moves the five frets along", fretNumbers() === "2,3,4,5,6" ? [] : [fretNumbers()]]);
                        await pause(40);
                        const chordBefore = heard.clicks;
                        [[0, 3], [2, 3], [3, 4], [4, 4], [5, 4]].forEach(([string, fret]) => fingerChord(string, fret));
                        await pause(40);
                        const cardName = () => $("consNeck").querySelector(".cons-chord-card .csym")?.getAttribute("aria-label");
                        checks.push(["3 x 3 4 4 4 sounds each note, and is named G7(\u266F5,\u266D9)", heard.clicks - chordBefore === 5 && cardName() === "G7(\u266F5,\u266D9)" ? [] : [heard.clicks - chordBefore, cardName()]]);
                        checks.push(["its frets and notes, spelled as the chord spells them", $("consChordFacts").textContent.includes("3 \u00D7 3 4 4 4") && $("consChordFacts").textContent.includes("GFBD\u266FA\u266D") ? [] : [$("consChordFacts").textContent]]);
                        const staff = $("consNeck").querySelector(".cons-staff");
                        const glyphs = character => [...staff.querySelectorAll(".staff-glyph")].filter(glyph => glyph.textContent === character).length;
                        checks.push(["on a staff: five notes, a sharp and a flat, under a treble clef with its 8", glyphs("\uE0A2") === 5 && glyphs("\uE262") === 1 && glyphs("\uE260") === 1 && glyphs("\uE052") === 1 ? [] : [glyphs("\uE0A2"), glyphs("\uE262"), glyphs("\uE260")]]);
                        checks.push(["its staff says its notes", staff.getAttribute("aria-label") === "On a staff: G2, F3, B3, D\u266F4, A\u266D4" ? [] : [staff.getAttribute("aria-label")]]);
                        checks.push(["the reading found is chosen, and the note says so", $("consChordReadings").querySelector('[aria-pressed="true"]')?.dataset.reading === "G7(\u266F5,\u266D9)" && /Named from its notes/.test($("consChordNote").textContent) ? [] : [$("consChordNote").textContent]]);
                        const title = $("consNeck").querySelector('.cons-chord-neck .cons-dot[data-string="4"][data-fret="4"] title').textContent;
                        checks.push(["a note's tooltip spells it as the chord does", /^D\u266F4, string 2, fret 4/.test(title) ? [] : [title]]);
                        $("consChordName").value = "G7 alt";
                        $("consChordName").dispatchEvent(new Event("input", { bubbles: true }));
                        checks.push(["a name that isn't a chord symbol isn't saved, and the label is offered for words", $("consChordSave").disabled && /isn't a chord symbol/.test($("consChordNote").textContent) && cardName() === "G7(\u266F5,\u266D9)" ? [] : [cardName(), $("consChordNote").textContent]]);
                        $("consChordName").value = "";
                        $("consChordName").dispatchEvent(new Event("input", { bubbles: true }));
                        $("consChordLabel").value = "Altered";
                        $("consChordLabel").dispatchEvent(new Event("input", { bubbles: true }));
                        checks.push(["a label shows under the name", $("consNeck").querySelector(".cons-chord-card-label")?.textContent === "Altered" && !$("consChordSave").disabled ? [] : ["no label"]]);
                        $("consChordSave").click();
                        const savedLines = () => (messages.slice(chordMessagesFrom).filter(message => message.startsWith("SaveChords\n")).at(-1) ?? "").split("\n").slice(1);
                        checks.push(["Save sends the whole library to AHK, every instrument's, a label last", savedLines().length === 3 && savedLines()[2] === "G7(\u266F5,\u266D9)\u0009guitar\u000940 45 50 55 59 64\u00093 x 3 4 4 4\u0009Altered" && savedLines()[1] === "C\u0009keyboard\u0009\u000948 52 55\u0009" ? [] : savedLines()]);
                        checks.push(["and it's open, to save changes or as new", $("consChordSave").textContent === "Save changes" && !$("consChordSaveNew").hidden && $("consSaved").querySelector(".is-open") ? [] : [$("consChordSave").textContent]]);
                        $("consChordClear").click();
                        checks.push(["Clear starts again", chords.shape.every(fret => fret === null) && chords.editing === -1 && $("consChordName").value === "" && $("consChordSave").disabled ? [] : [chords.shape.join()]]);
                        await pause(40);
                        const openBefore = heard.clicks;
                        $("consSaved").querySelector('[data-saved-open="0"]').click();
                        await pause(40);
                        checks.push(["a saved chord opens on the neck, and is heard", chords.shape.join() === ",0,2,2,1,0" && $("consChordName").value === "Am" && heard.clicks - openBefore === 5 && fretNumbers() === "1,2,3,4,5" ? [] : [chords.shape.join(), heard.clicks - openBefore]]);
                        $("consSavedSearch").value = "g7";
                        $("consSavedSearch").dispatchEvent(new Event("input", { bubbles: true }));
                        checks.push(["search finds by name", $("consSaved").children.length === 1 && $("consSaved").textContent.includes("Altered") && $("consSavedCount").textContent === "1 of 2" ? [] : [$("consSavedCount").textContent]]);
                        $("consSavedSearch").value = "alter";
                        $("consSavedSearch").dispatchEvent(new Event("input", { bubbles: true }));
                        checks.push(["and by label", $("consSaved").children.length === 1 && $("consSaved").querySelector(".cons-saved-words")?.textContent === "Altered" ? [] : [$("consSavedCount").textContent]]);
                        $("consSavedSearch").value = "";
                        $("consSavedSearch").dispatchEvent(new Event("input", { bubbles: true }));
                        $("consSavedRoot").value = "9";
                        $("consSavedRoot").dispatchEvent(new Event("change", { bubbles: true }));
                        checks.push(["the root filter keeps A's", $("consSaved").children.length === 1 && $("consSaved").querySelector(".csym").getAttribute("aria-label") === "Am" ? [] : [$("consSaved").children.length]]);
                        $("consSavedRoot").value = "-1";
                        $("consSavedRoot").dispatchEvent(new Event("change", { bubbles: true }));
                        // Moved away, the open chord's fretted strings are marked at the edge.
                        for (let step = 0; step < 6; step++) $("consNeck").querySelector('[data-chord-move="1"]').click();
                        checks.push(["frets out of view are marked at the edge", fretNumbers() === "7,8,9,10,11" && $("consNeck").querySelectorAll("[data-chord-jump]").length === 3 ? [] : [fretNumbers()]]);
                        $("consNeck").querySelector("[data-chord-jump]").dispatchEvent(new MouseEvent("click", { bubbles: true }));
                        checks.push(["a marker brings its fret back into view", fretNumbers() === "1,2,3,4,5" ? [] : [fretNumbers()]]);
                        $("consNeck").dispatchEvent(new WheelEvent("wheel", { deltaX: 130, bubbles: true, cancelable: true }));
                        checks.push(["scrolling sideways moves the frets", fretNumbers() === "3,4,5,6,7" ? [] : [fretNumbers()]]);
                        const neckWidth = Number($("consNeck").querySelector(".cons-chord-neck").getAttribute("viewBox").split(" ")[2]);
                        setConsNeck({ lefty: true });
                        const openX = Number($("consNeck").querySelector('.cons-chord-neck .cons-dot[data-fret="0"] circle').getAttribute("cx"));
                        checks.push(["left-handed, the nut's strings are on the right", openX > neckWidth / 2 ? [] : [openX]]);
                        setConsNeck({ lefty: false });
                        document.querySelector('#consChordStyle [data-chord-style="signs"]').click();
                        checks.push(["Signs writes Am with the minor sign, here and in Scales", cons.settings.chordStyle === "signs" && $("consNeck").querySelector(".cons-chord-card .csym-sign")?.textContent === "\uE874" && $("consKeyChords").querySelector(".csym-sign") ? [] : [cons.settings.chordStyle]]);
                        document.querySelector('#consChordStyle [data-chord-style="letters"]').click();
                        $("consSaved").querySelector('[data-saved-delete="0"]').click();
                        checks.push(["Delete saves the library without it, with Undo", savedLines().length === 2 && !savedLines().some(line => line.startsWith("Am\u0009")) && chords.editing === -1 && $("toast").querySelector(".toast-action")?.textContent === "Undo" ? [] : savedLines()]);
                        $("toast").querySelector(".toast-action").click();
                        checks.push(["Undo puts it back where it was", savedLines()[0]?.startsWith("Am\u0009") && savedLines().length === 3 ? [] : savedLines()]);
                        handleWebMessage({ data: { type: "error", scope: "chords", message: "A chord needs a fret, or x, for each string." } });
                        checks.push(["a save AHK refuses says why", $("toast").textContent.includes("for each string") ? [] : [$("toast").textContent]]);
                        chooseConsInstrument("keyboard");
                        [60, 64, 67, 43].forEach(midi => $("consNeck").querySelector(`.cons-key[data-midi="${midi}"]`)?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
                        const keyStaff = $("consNeck").querySelector(".cons-staff");
                        checks.push(["on a keyboard, keys build a chord, on two staves", chords.keys.join() === "60,64,67" && cardName() === "C" && [...keyStaff.querySelectorAll(".staff-glyph")].some(glyph => glyph.textContent === "\uE062") && $("consSavedCount").textContent === "1 for keyboard" ? [] : [chords.keys.join(), cardName()]]);
                        chooseConsInstrument("guitar");
                        checks.push(["back on guitar, a new chord", chords.shape.length === 6 && chords.shape.every(fret => fret === null) ? [] : [chords.shape.join()]]);
                        // 2.3.0: the quiz.
                        consSections.show("quiz");
                        setConsQuiz({ quizKind: "note", quizNaturals: false });
                        const asked = () => dots().filter(dot => dot.classList.contains("is-quiz"));
                        checks.push(["Quiz marks one place with a question mark, and its tooltip doesn't say", asked().length === 1 && asked()[0].querySelector("text").textContent === "?" && asked()[0].querySelector("title").textContent.startsWith("?") && $("consQuizAnswers").children.length === 12 ? [] : [asked().length, $("consQuizAnswers").children.length]]);
                        let truth = quiz.question.midi % 12;
                        $("consQuizAnswers").querySelector(`[data-answer="${(truth + 1) % 12}"]`).click();
                        checks.push(["a wrong answer shows the right one, and keeps the question", $("consQuizAnswers").querySelector(".is-right")?.dataset.answer === String(truth) && $("consQuizAnswers").querySelector(".is-wrong") && dots().some(dot => dot.classList.contains("is-missed")) && $("consQuizResult").classList.contains("is-wrong") && $("consQuizScore").textContent === "0 of 1 right" ? [] : [$("consQuizScore").textContent]]);
                        $("consQuizNext").click();
                        truth = quiz.question.midi % 12;
                        $("consQuizAnswers").querySelector(`[data-answer="${truth}"]`).click();
                        await pause(1200);
                        checks.push(["2.7.0: a right answer is scored and stays until Next, the result in the prompt's place, focus on Next", $("consQuizScore").textContent === "1 of 2 right" && quiz.answered !== null && /^Right/.test($("consQuizResult").textContent) && $("consQuizPrompt").hidden && $("consQuizResult").previousElementSibling === $("consQuizPrompt") && document.activeElement === $("consQuizNext") ? [] : [$("consQuizScore").textContent, quiz.answered, document.activeElement?.id]]);
                        // Keys on the Quiz tab: N for the next, Space (nothing to hear here, and no metronome).
                        const quizPress = (key, extra = {}, target = document.body) => {
                            const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra });
                            target.dispatchEvent(event);
                            return event;
                        };
                        document.activeElement.blur();
                        const askedBeforeN = quiz.question;
                        quizPress("n");
                        checks.push(["N asks the next question, the prompt back", quiz.answered === null && quiz.question !== askedBeforeN && !$("consQuizPrompt").hidden && $("consQuizResult").textContent === "" ? [] : [quiz.answered, $("consQuizResult").textContent]]);
                        const spaceNote = quizPress(" ");
                        checks.push(["Space on Name the Note hears nothing and doesn't start the metronome", spaceNote.defaultPrevented && !metro.running ? [] : [spaceNote.defaultPrevented, metro.running]]);
                        $("consQuizNaturals").click();
                        checks.push(["natural notes only: seven answers, a natural asked, the score begun again", $("consQuizAnswers").children.length === 7 && MaestroMusic.PLAIN_NAMES[quiz.question.midi % 12].length === 1 && $("consQuizScore").textContent === "" ? [] : [$("consQuizAnswers").children.length]]);
                        $("consQuizNaturals").click();
                        document.querySelector('#consQuizKind [data-quiz="interval"]').click();
                        checks.push(["Intervals by ear offers twelve, a second to an octave, and marks nothing yet", $("consQuizAnswers").children.length === 12 && $("consQuizAnswers").children[5].textContent === "TT" && dots().length === 0 && !$("consQuizHear").hidden ? [] : [$("consQuizAnswers").children.length, dots().length]]);
                        await pause(40);
                        const hearBefore = heard.clicks;
                        $("consQuizHear").click();
                        await pause(40);
                        checks.push(["Hear it plays its two notes", heard.clicks - hearBefore === 2 ? [] : [heard.clicks - hearBefore]]);
                        // 2.7.0: Space and H hear it again, and the metronome stays off.
                        document.activeElement?.blur();
                        const spaceBefore = heard.clicks;
                        quizPress(" ");
                        await pause(40);
                        quizPress("h");
                        await pause(40);
                        checks.push(["Space and H hear it again, on the Quiz, not the metronome", heard.clicks - spaceBefore === 4 && !metro.running ? [] : [heard.clicks - spaceBefore, metro.running]]);
                        $("consQuizAnswers").querySelector(`[data-answer="${quiz.question.semis}"]`).click();
                        checks.push(["once answered, both notes are shown on the neck", pcs(dots()).size === (quiz.question.semis === 12 ? 1 : 2) && /^Right/.test($("consQuizResult").textContent) ? [] : [pcs(dots()).size]]);
                        // 2.4.0: chords and progressions by ear.
                        document.querySelector('#consQuizKind [data-quiz="quality"]').click();
                        const answerLabels = () => [...$("consQuizAnswers").children].map(button => button.textContent).join();
                        checks.push(["Chords by ear offers the six triads, Of and Played shown, the score begun again", answerLabels() === "Major,Minor,Dim,Aug,Sus2,Sus4" && !$("consQuizChordsField").hidden && !$("consQuizDirectionField").hidden && $("consQuizTitle").textContent === "Chords by Ear" && $("consQuizScore").textContent === "" ? [] : [answerLabels()]]);
                        document.querySelector('#consQuizChords [data-chords="sevenths"]').click();
                        checks.push(["or the six sevenths", answerLabels() === "Maj7,Dom7,Min7,Half-dim7,Dim7,Min(maj7)" && quiz.question.midis.length === 4 ? [] : [answerLabels()]]);
                        document.querySelector('#consQuizChords [data-chords="both"]').click();
                        checks.push(["or both, twelve", $("consQuizAnswers").children.length === 12 ? [] : [$("consQuizAnswers").children.length]]);
                        await pause(40);
                        const chordBefore2 = heard.clicks;
                        $("consQuizHear").click();
                        await pause(40);
                        checks.push(["Hear it plays the chord's notes", heard.clicks - chordBefore2 === quiz.question.midis.length ? [] : [heard.clicks - chordBefore2]]);
                        const chordAsked = quiz.question;
                        $("consQuizAnswers").querySelector(`[data-answer="${chordAsked.id}"]`).click();
                        const chordPcs = [...new Set(chordAsked.midis.map(midi => midi % 12))].sort((a, b) => a - b).join();
                        checks.push(["once answered, it's named and its notes shown on the neck", /^Right: an? .+ \(.+\)\.$/.test($("consQuizResult").textContent) && [...pcs(dots())].sort((a, b) => a - b).join() === chordPcs && quiz.right === 1 ? [] : [$("consQuizResult").textContent, [...pcs(dots())].join()]]);
                        document.querySelector('#consQuizKind [data-quiz="progression"]').click();
                        const heardAsked = quiz.question;
                        checks.push(["Progressions by ear: the key's seven numerals, I and three to name, Played hidden", $("consQuizAnswers").children.length === 7 && $("consQuizAnswers").classList.contains("is-numerals") && $("consQuizLine").textContent === `${heardAsked.numerals[0]}–?–?–?` && $("consQuizDirectionField").hidden ? [] : [$("consQuizLine").textContent, $("consQuizAnswers").children.length]]);
                        await pause(40);
                        const progBefore2 = heard.sources.length;
                        $("consQuizHear").click();
                        await pause(40);
                        const voicedNotes = heardAsked.chords.reduce((sum, name, at, all) => sum + MaestroHarmony.voiceChord(name, at ? MaestroHarmony.voiceChord(all[at - 1]) : null).length, 0);
                        checks.push(["Hear it plays its four chords, each stopping as the next sounds", heard.sources.length - progBefore2 >= 12 && heard.sources.slice(progBefore2).filter(source => source.stopped).length >= 9 ? [] : [heard.sources.length - progBefore2, voicedNotes]]);
                        // 2.7.0: 1 to 7 name a chord by its degree.
                        quizPress(String(heardAsked.degrees[1] + 1));
                        checks.push(["a number names the chord of that degree", quiz.picks.join() === String(heardAsked.degrees[1]) ? [] : [quiz.picks.join()]]);
                        $("consQuizUndo").click();
                        $("consQuizAnswers").querySelector(`[data-answer="${heardAsked.degrees[1]}"]`).click();
                        checks.push(["a chord named fills its place, and the quiz waits for the rest", $("consQuizLine").textContent === `${heardAsked.numerals[0]}–${heardAsked.numerals[heardAsked.degrees[1]]}–?–?` && quiz.answered === null ? [] : [$("consQuizLine").textContent]]);
                        const slip = $("consQuizAnswers").querySelector(`[data-answer="${(heardAsked.degrees[2] + 1) % 7}"]`);
                        slip.click();
                        const undoAfterTwo = !$("consQuizUndo").hidden && !$("consQuizUndo").disabled && quiz.picks.length === 2;
                        $("consQuizUndo").click();
                        checks.push(["Undo takes back the last chord named, and is off with none left to take", undoAfterTwo && quiz.picks.length === 1 && $("consQuizLine").textContent === `${heardAsked.numerals[0]}–${heardAsked.numerals[heardAsked.degrees[1]]}–?–?` && !$("consQuizUndo").disabled ? [] : [undoAfterTwo, $("consQuizLine").textContent]]);
                        $("consQuizAnswers").querySelector("button").focus();
                        const backspace = new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true });
                        document.activeElement.dispatchEvent(backspace);
                        checks.push(["Backspace in the quiz does the same; Undo then has nothing to take", quiz.picks.length === 0 && backspace.defaultPrevented && $("consQuizUndo").disabled && $("consQuizLine").textContent === `${heardAsked.numerals[0]}–?–?–?` ? [] : [quiz.picks.length, $("consQuizLine").textContent]]);
                        $("consQuizAnswers").querySelector(`[data-answer="${heardAsked.degrees[1]}"]`).click();
                        $("consQuizAnswers").querySelector(`[data-answer="${heardAsked.degrees[2]}"]`).click();
                        const wrongLast = (heardAsked.degrees[3] + 1) % 7;
                        $("consQuizAnswers").querySelector(`[data-answer="${wrongLast}"]`).click();
                        checks.push(["a wrong third chord: marked, the progression given, the streak broken", quiz.answered !== null && $("consQuizLine").querySelectorAll(".is-right").length === 2 && $("consQuizLine").querySelectorAll(".is-wrong").length === 1 && /^It's .+ in .+ \(.+\)\. Click Next/.test($("consQuizResult").textContent) && quiz.streak === 0 && $("consQuizUndo").disabled ? [] : [$("consQuizResult").textContent]]);
                        consSections.show("scales");
                        const nOffQuiz = quizPress("n");
                        checks.push(["leaving Quiz, the question waits, and N there isn't the quiz's", quiz.answered !== null && !nOffQuiz.defaultPrevented ? [] : ["moved on"]]);
                        // 2.7.0: Progressions by ear written on a grand staff.
                        consSections.show("quiz");
                        const writeChoices = () => [...$("consQuizWrite").children].map(button => button.textContent).join();
                        checks.push(["2.7.0: Progressions by ear's options choose what's written, Numerals first and chosen, no staff", !$("consQuizWriteField").hidden && writeChoices() === "Numerals,Bass line,Outer voices,Every note" && $("consQuizWrite").querySelector('[aria-pressed="true"]')?.dataset.write === "numerals" && $("consQuizDictBox").hidden && $("consQuizCheck").hidden ? [] : [writeChoices(), $("consQuizDictBox").hidden]]);
                        $("consQuizWrite").querySelector('[data-write="bass"]').click();
                        const dict = quiz.question;
                        const dictStaff = $("consQuizDictStaff");
                        const dictKey = { root: dict.key, scale: "major" };
                        const dictLabels = () => [...dictStaff.querySelectorAll(".prog-staff-chord")].map(node => node.textContent).join();
                        const dictWritten = () => quiz.written.map(midis => midis.join(".")).join(" ");
                        // Where a pitch at a chord's place is, on the staff as drawn.
                        const dictPoint = (at, midi, extra = {}) => {
                            const box = dictStaff.querySelector("svg").getBoundingClientRect();
                            const { drawn } = quiz.dict;
                            const column = quizDictPlace(quiz.dict, at).column;
                            const clefs = quiz.dict.score.staves.map(staff => staff.clef);
                            const hand = clefs.length > 1 && midi < 60 ? 1 : 0;
                            const p = MaestroHarmony.spellVoicing("", [midi], dictKey)[0];
                            const y = drawn.systems[0].staffY[hand] - (p.step - MaestroNotation.STAFF_BOTTOM[clefs[hand]]) * drawn.space / 2;
                            return { clientX: box.left + (column.x + 0.6 * drawn.space) / drawn.width * box.width, clientY: box.top + y / drawn.height * box.height, bubbles: true, ...extra };
                        };
                        const dictKeyDown = (key, extra = {}) => dictStaff.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));
                        checks.push(["2.7.0: a guitar's progression on one staff, a treble clef with an 8 under it", cons.settings.instrument === "guitar" && quiz.dict.score.staves.map(staff => staff.clef).join() === "treble8" ? [] : [cons.settings.instrument, quiz.dict.score.staves.map(staff => staff.clef).join()]]);
                        checks.push(["Bass line: no numerals to click, the first chord written on its staff, its numeral over it and ? over the rest, Check off", $("consQuizAnswers").hidden && $("consQuizLine").hidden && !$("consQuizDictBox").hidden && $("consQuizDictPlayed").hidden && dictStaff.querySelectorAll("svg .staff-glyph").length > dict.voicings[0].length && dictLabels() === `${dict.numerals[0]},?,?,?` && quiz.written[0].join() === dict.voicings[0].join() && quiz.written.slice(1).every(midis => !midis.length) && !$("consQuizCheck").hidden && $("consQuizCheck").disabled && $("consQuizUndo").disabled && $("consQuizOptionsName").textContent.endsWith(" · Bass line") ? [] : [dictLabels(), dictWritten(), $("consQuizOptionsName").textContent]]);
                        checks.push(["its prompt names the key and what to write", new RegExp(`^Four chords in ${dict.key} major, from I, the first written\\. Write the bass of the other three`).test($("consQuizPrompt").textContent) ? [] : [$("consQuizPrompt").textContent]]);
                        checks.push(["the chords are voiced as the numerals' quiz plays them, each near the last", dict.voicings.length === 4 && dict.voicings.every((midis, at) => midis.join() === MaestroHarmony.voiceChord(dict.chords[at], at ? dict.voicings[at - 1] : null).join()) ? [] : [JSON.stringify(dict.voicings)]]);
                        await pause(40);
                        const dictHeard = heard.sources.length;
                        $("consQuizHear").click();
                        await pause(40);
                        checks.push(["Hear it plays those voicings", heard.sources.length - dictHeard >= dict.voicings.flat().length ? [] : [heard.sources.length - dictHeard]]);
                        const bassOf = at => dict.voicings[at][0];
                        dictStaff.dispatchEvent(new PointerEvent("pointermove", dictPoint(1, bassOf(1))));
                        cancelAnimationFrame(quizDictGhost.frame);
                        drawQuizDictGhost();
                        checks.push(["the pointer's note shows where a click would write", dictStaff.querySelector(".cp-ghost") ? [] : ["no ghost"]]);
                        dictStaff.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false }));
                        checks.push(["and goes when it leaves", !dictStaff.querySelector(".cp-ghost") ? [] : ["ghost"]]);
                        dictStaff.dispatchEvent(new MouseEvent("click", dictPoint(1, bassOf(1))));
                        checks.push(["a click writes the note there, selected and ringed, Undo on", quiz.written[1].join() === String(bassOf(1)) && quiz.chordAt === 1 && quiz.noteAt === bassOf(1) && dictStaff.querySelectorAll(".cp-ring.is-selected").length === 1 && dictStaff.querySelectorAll(".prog-staff-pick").length === 1 && !$("consQuizUndo").disabled ? [] : [dictWritten()]]);
                        dictStaff.dispatchEvent(new MouseEvent("click", dictPoint(1, bassOf(1) + 12)));
                        checks.push(["the bass is one note: another takes its place", quiz.written[1].join() === String(bassOf(1) + 12) ? [] : [dictWritten()]]);
                        dictStaff.dispatchEvent(new MouseEvent("contextmenu", dictPoint(1, bassOf(1) + 12, { button: 2, cancelable: true })));
                        checks.push(["a right-click takes it out", !quiz.written[1].length ? [] : [dictWritten()]]);
                        $("consQuizUndo").click();
                        $("consQuizUndo").click();
                        checks.push(["and Undo takes back each change", quiz.written[1].join() === String(bassOf(1)) ? [] : [dictWritten()]]);
                        // Keys on the staff: another chord, a note from the neck, a letter, steps, Delete, Backspace.
                        dictStaff.focus();
                        dictKeyDown("ArrowRight");
                        consNeckModes.quiz.click(bassOf(2));
                        checks.push(["Right chooses the next chord, and a click on the neck writes into it", quiz.chordAt === 2 && quiz.written[2].join() === String(bassOf(2)) ? [] : [quiz.chordAt, dictWritten()]]);
                        consNeckModes.quiz.click(bassOf(2));
                        checks.push(["the note clicked again on the neck leaves the chord", !quiz.written[2].length ? [] : [dictWritten()]]);
                        consNeckModes.quiz.click(bassOf(2));
                        dictKeyDown("ArrowRight");
                        dictKeyDown("ArrowRight");
                        const dictThird = MaestroHarmony.spellVoicing(dict.chords[3], [bassOf(3)], dictKey)[0];
                        dictKeyDown(MaestroNotation.LETTERS[((dictThird.step % 7) + 7) % 7].toLowerCase());
                        const dictLettered = quiz.written[3][0];
                        checks.push(["Right stops at the last chord; a letter writes that letter in the key, near the bass before", quiz.chordAt === 3 && quiz.written[3].length === 1 && (dictLettered - bassOf(3)) % 12 === 0 && Math.abs(dictLettered - bassOf(2)) <= 6 ? [] : [quiz.chordAt, dictWritten()]]);
                        dictKeyDown("ArrowUp");
                        const raisedDict = quiz.written[3][0];
                        dictKeyDown("ArrowDown");
                        dictKeyDown("ArrowUp", { shiftKey: true });
                        checks.push(["Up moves it a step in the key, Down back, Shift and Up a half step", [1, 2].includes(raisedDict - dictLettered) && quiz.written[3][0] === dictLettered + 1 ? [] : [dictLettered, raisedDict, dictWritten()]]);
                        dictKeyDown("Delete");
                        checks.push(["Delete takes it out", !quiz.written[3].length ? [] : [dictWritten()]]);
                        dictStaff.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }));
                        checks.push(["Backspace undoes", quiz.written[3].length === 1 ? [] : [dictWritten()]]);
                        // The last bass an octave off: wrong at the pitch heard.
                        consNeckModes.quiz.click(bassOf(3) + 12);
                        checks.push(["each chord written, Check is on", quiz.written.slice(1).every(midis => midis.length === 1) && !$("consQuizCheck").disabled ? [] : [dictWritten()]]);
                        const dictRight = quiz.right;
                        $("consQuizCheck").click();
                        checks.push(["an octave off is wrong: ringed, its numeral marked, the chords as played shown, the score kept", quiz.answered !== null && quiz.right === dictRight && quiz.streak === 0 && dictStaff.querySelectorAll(".cp-ring.is-wrong").length === 1 && dictStaff.querySelectorAll(".cp-ring.is-right").length === 2 && dictStaff.querySelectorAll(".prog-staff-chord.is-wrong").length === 1 && dictLabels() === dict.degrees.map(degree => dict.numerals[degree]).join() && !$("consQuizDictPlayed").hidden && $("consQuizDictPlayedStaff").querySelectorAll(".prog-staff-chord").length === 4 && /^2 of 3 chords right: it's .+ in .+ \(.+\)\. Played shows its notes/.test($("consQuizResult").textContent) ? [] : [dictWritten(), $("consQuizResult").textContent]]);
                        const dictKept = dictWritten();
                        dictStaff.dispatchEvent(new MouseEvent("click", dictPoint(1, bassOf(1) + 2)));
                        checks.push(["once checked, the staff doesn't change", dictWritten() === dictKept ? [] : [dictWritten()]]);
                        // The dictOuter voices: two a chord, a third taking the selected one's place.
                        $("consQuizWrite").querySelector('[data-write="outer"]').click();
                        const dictOuter = quiz.question;
                        consNeckModes.quiz.click(dictOuter.voicings[1][0]);
                        consNeckModes.quiz.click(dictOuter.voicings[1].at(-1));
                        consNeckModes.quiz.click(dictOuter.voicings[1].at(-1) + 1);
                        checks.push(["Outer voices: a new score, two notes a chord, a third in the selected one's place", quiz.asked === 0 && quiz.written[1].join() === [dictOuter.voicings[1][0], dictOuter.voicings[1].at(-1) + 1].join() && /lowest and highest/.test($("consQuizPrompt").textContent) ? [] : [quiz.asked, dictWritten()]]);
                        // Every note, all of it right.
                        $("consQuizWrite").querySelector('[data-write="all"]').click();
                        const dictEvery = quiz.question;
                        dictEvery.voicings.slice(1).forEach((midis, at) => {
                            selectQuizDictNote(at + 1, null);
                            midis.forEach(midi => consNeckModes.quiz.click(midi));
                        });
                        dictStaff.focus();
                        checks.push(["Every note: Check on once each chord has a note", !$("consQuizCheck").disabled && quiz.written.slice(1).every((midis, at) => midis.join() === dictEvery.voicings[at + 1].join()) ? [] : [dictWritten()]]);
                        quizPress("Enter", { ctrlKey: true }, dictStaff);
                        checks.push(["Ctrl+Enter checks it, written right: named in its key, scored, it stays, focus on Next", /^Right: .+ in .+ \(.+\)\.$/.test($("consQuizResult").textContent) && quiz.right === 1 && quiz.answered !== null && document.activeElement === $("consQuizNext") && dictStaff.querySelectorAll(".cp-ring.is-wrong").length === 0 ? [] : [$("consQuizResult").textContent, document.activeElement?.id]]);
                        setConsQuiz({ quizWrite: "numerals" });
                        checks.push(["Numerals again: the staff gone, the numerals back", $("consQuizDictBox").hidden && !$("consQuizAnswers").hidden && $("consQuizCheck").hidden ? [] : ["staff"]]);
                        // 2.6.0: melodies by ear, rhythms by ear and reading.
                        consSections.show("quiz");
                        document.querySelector('#consQuizKind [data-quiz="melody"]').click();
                        const tune = quiz.question;
                        const N = MaestroNotation;
                        const written = () => quiz.notes.map(p => (p ? N.pitchName(p) : "-")).join(" ");
                        const quizStaff = $("consQuizMelodyStaff");
                        // Where a pitch at a note's place is, on the staff as drawn.
                        const quizPoint = (index, p, extra = {}) => {
                            const box = quizStaff.querySelector("svg").getBoundingClientRect();
                            const drawn = quiz.drawn;
                            const column = drawn.columns.find(each => each.time === index * 2);
                            const y = drawn.systems[column.system].staffY[0] - (p.step - N.STAFF_BOTTOM.treble) * drawn.space / 2;
                            return { clientX: box.left + (column.x + 0.75 * drawn.space) / drawn.width * box.width, clientY: box.top + y / drawn.height * box.height, bubbles: true, ...extra };
                        };
                        const quizKey = (key, extra = {}) => quizStaff.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));
                        checks.push(["2.6.0: Melodies by ear, written on a staff: the first note given, the rest to write, no names to click, Check off until all are written", $("consQuizAnswers").hidden && $("consQuizLine").hidden && !$("consQuizMelodyBox").hidden && quizStaff.querySelector("svg .staff-glyph") && $("consQuizMelodyPlayed").hidden && quiz.notes.length === tune.midis.length && N.midiOf(quiz.notes[0]) === tune.midis[0] && quiz.notes.slice(1).every(p => p === null) && !$("consQuizCheck").hidden && $("consQuizCheck").disabled && !$("consQuizUndo").hidden && $("consQuizUndo").disabled && quizStaff.querySelector(".cp-ring.is-selected.is-rest") && !$("consQuizMelodyField").hidden && $("consQuizChordsField").hidden && $("consQuizTitle").textContent === "Melodies by Ear" && $("consQuizOptionsName").textContent === `${cons.settings.quizMelody} notes` ? [] : [written(), $("consQuizCheck").disabled]]);
                        checks.push(["its notes spelled in the key, the tonic from C4 to B4", tune.tonic >= 60 && tune.tonic <= 71 && tune.pitches.every((p, at) => N.midiOf(p) === tune.midis[at] && N.pitchLetterName(p) === tune.names[at]) ? [] : [tune.pitches.map(N.pitchName).join(" "), tune.names.join(" ")]]);
                        await pause(40);
                        const tuneBefore = heard.clicks;
                        $("consQuizHear").click();
                        await pause(60);
                        checks.push(["Hear it plays the key's chord first", heard.clicks - tuneBefore >= 3 ? [] : [heard.clicks - tuneBefore]]);
                        // A click on the staff writes there, heard, and the next note is selected.
                        quizStaff.dispatchEvent(new PointerEvent("pointermove", quizPoint(1, tune.pitches[1])));
                        // The frame it waits for, drawn now (headless Edge may hold frames back).
                        cancelAnimationFrame(quizGhost.frame);
                        drawQuizGhost();
                        checks.push(["the pointer's note shows where a click would write", quizStaff.querySelector(".cp-ghost") ? [] : ["no ghost"]]);
                        quizStaff.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false }));
                        checks.push(["and goes when it leaves", !quizStaff.querySelector(".cp-ghost") ? [] : ["ghost"]]);
                        quizStaff.dispatchEvent(new MouseEvent("click", quizPoint(1, tune.pitches[1])));
                        checks.push(["a click on the staff writes the note there, in the key, the next selected, Undo on", N.midiOf(quiz.notes[1] ?? N.pitch(0)) === tune.midis[1] && quiz.at === 2 && !$("consQuizUndo").disabled && quizStaff.querySelectorAll(".cp-ring.is-selected").length === 1 ? [] : [written(), quiz.at]]);
                        quizStaff.dispatchEvent(new MouseEvent("contextmenu", quizPoint(1, tune.pitches[1], { button: 2, cancelable: true })));
                        checks.push(["a right-click clears it", quiz.notes[1] === null && quiz.at === 1 ? [] : [written()]]);
                        $("consQuizUndo").click();
                        checks.push(["and Undo brings it back", N.midiOf(quiz.notes[1] ?? N.pitch(0)) === tune.midis[1] ? [] : [written()]]);
                        // The neck (or keys) writes the next note at the pitch clicked.
                        selectQuizNote(2);
                        consNeckModes.quiz.click(tune.midis[2]);
                        checks.push(["a click on the neck writes the next note at that pitch", N.midiOf(quiz.notes[2] ?? N.pitch(0)) === tune.midis[2] && quiz.at === 3 ? [] : [written(), quiz.at]]);
                        // Keys on the staff: a letter, a step, a half step, Delete, Backspace to undo.
                        quizStaff.focus();
                        const third = tune.pitches[3];
                        quizKey(N.LETTERS[((third.step % 7) + 7) % 7].toLowerCase());
                        const lettered = quiz.notes[3];
                        checks.push(["a letter writes that letter in the key, near the note before", lettered && ((lettered.step - third.step) % 7 === 0) && lettered.alter === third.alter && Math.abs(lettered.step - quiz.notes[2].step) <= 3 ? [] : [written()]]);
                        selectQuizNote(3);
                        quizKey("ArrowUp");
                        const raised = quiz.notes[3];
                        quizKey("ArrowDown");
                        quizKey("ArrowUp", { shiftKey: true });
                        const sharpened = quiz.notes[3];
                        checks.push(["Up moves it a step, Down back, Shift and Up a half step", raised.step === lettered.step + 1 && sharpened.step === lettered.step && sharpened.alter === lettered.alter + 1 ? [] : [written()]]);
                        quizKey("Delete");
                        checks.push(["Delete clears it", quiz.notes[3] === null ? [] : [written()]]);
                        quizStaff.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }));
                        checks.push(["Backspace undoes", N.isPitch(quiz.notes[3]) ? [] : [written()]]);
                        // All of it written, the last an octave off: wrong at the pitch heard.
                        selectQuizNote(3);
                        tune.midis.slice(3).forEach((midi, at) => consNeckModes.quiz.click(at === tune.midis.length - 4 ? midi + 12 : midi));
                        checks.push(["once all are written, Check is on", quiz.notes.every(Boolean) && !$("consQuizCheck").disabled ? [] : [written()]]);
                        const octaveRight = quiz.right;
                        $("consQuizCheck").click();
                        checks.push(["an octave off is wrong: ringed, the melody as played shown, the score kept", quiz.answered !== null && quiz.right === octaveRight && quizStaff.querySelectorAll(".cp-ring.is-wrong").length === 1 && quizStaff.querySelectorAll(".cp-ring.is-right").length === tune.midis.length - 2 && !$("consQuizMelodyPlayed").hidden && $("consQuizMelodyPlayedStaff").querySelector("svg") && new RegExp(`^${tune.midis.length - 2} of ${tune.midis.length - 1} notes right: it's .+ in .+ major\\. Click Next`).test($("consQuizResult").textContent) && $("consQuizCheck").disabled && quiz.answered !== null ? [] : [$("consQuizResult").textContent, quizStaff.querySelectorAll(".cp-ring.is-wrong").length]]);
                        const kept = written();
                        quizStaff.dispatchEvent(new MouseEvent("click", quizPoint(1, tune.pitches[2])));
                        checks.push(["once checked, the staff doesn't change", written() === kept ? [] : [written()]]);
                        // Another, written right.
                        $("consQuizNext").click();
                        const tune2 = quiz.question;
                        tune2.midis.slice(1).forEach(midi => consNeckModes.quiz.click(midi));
                        $("consQuizCheck").click();
                        checks.push(["named right: the melody given in its key, its notes on the neck, and it stays", /^Right: .+ in .+ major\.$/.test($("consQuizResult").textContent) && [...pcs(dots())].sort((a, b) => a - b).join() === [...new Set(tune2.midis.map(midi => midi % 12))].sort((a, b) => a - b).join() && quiz.answered !== null ? [] : [$("consQuizResult").textContent, [...pcs(dots())].join()]]);
                        document.querySelector('#consQuizKind [data-quiz="rhythm"]').click();
                        const bar = quiz.question;
                        checks.push(["Rhythms by ear: the neck stays where it was (2.7.1), the bar's steps a beat to a group, Check, and the staff drawn", !$("consNeckModule").hidden && $("consQuizAnswers").hidden && !$("consQuizRhythm").hidden && $("consQuizGrid").querySelectorAll(".cons-quiz-cell").length === bar.cells.length && $("consQuizGrid").children.length === bar.cells.length / bar.steps && !$("consQuizCheck").hidden && $("consQuizPad").hidden && $("consQuizWrittenStaff").querySelector("svg") && $("consQuizPlayed").hidden && !$("consQuizLevelField").hidden ? [] : [$("consNeckModule").hidden, $("consQuizGrid").children.length]]);
                        await startMetronome();
                        await pause(40);
                        const barBefore = heard.clicks;
                        $("consQuizHear").click();
                        await pause(60);
                        const barBeats = bar.cells.length / bar.steps;
                        checks.push(["Hear it stops the metronome, and plays a bar's count, then the bar over the pulse", !metro.running && heard.clicks - barBefore >= barBeats * 2 + bar.cells.filter(Boolean).length ? [] : [metro.running, heard.clicks - barBefore]]);
                        const staffBefore = $("consQuizWrittenStaff").innerHTML;
                        bar.cells.forEach((cell, index) => { if (cell) $("consQuizGrid").querySelector(`[data-cell="${index}"]`).click(); });
                        checks.push(["a step clicked holds a note, drawn on the staff as it's written", quiz.cells.join("") === bar.cells.join("") && $("consQuizGrid").querySelectorAll('[aria-pressed="true"]').length === bar.cells.filter(Boolean).length && $("consQuizWrittenStaff").innerHTML !== staffBefore ? [] : [quiz.cells.join("")]]);
                        $("consQuizCheck").click();
                        checks.push(["Check: right, the bar as played beside it, and it stays to be looked at", $("consQuizResult").textContent === "Right: as played." && !$("consQuizPlayed").hidden && $("consQuizGrid").querySelectorAll(".is-wrong").length === 0 && $("consQuizCheck").disabled && quiz.answered !== null ? [] : [$("consQuizResult").textContent]]);
                        $("consQuizNext").click();
                        $("consQuizCheck").click();
                        checks.push(["nothing written: the steps missed are marked, and counted", /^\d+ of \d+ steps right; Played shows/.test($("consQuizResult").textContent) && $("consQuizGrid").querySelectorAll(".is-wrong").length === quiz.question.cells.filter(Boolean).length && quiz.streak === 0 ? [] : [$("consQuizResult").textContent]]);
                        document.querySelector('#consQuizKind [data-quiz="reading"]').click();
                        const read = quiz.question;
                        checks.push(["Reading: the bar written, Tap it, the pad waiting, Hear it kept back", $("consQuizWrittenStaff").querySelector("svg") && !$("consQuizTap").hidden && $("consQuizHear").hidden && $("consQuizCheck").hidden && $("consQuizGrid").hidden && !$("consQuizPad").hidden && $("consQuizPad").disabled && $("consQuizTitle").textContent === "Reading Rhythms" ? [] : [$("consQuizTap").hidden, $("consQuizHear").hidden]]);
                        const readTempo = metro.settings.tempo;
                        metro.settings.tempo = MaestroMetronome.MAX;
                        $("consQuizTap").click();
                        await pause(40);
                        checks.push(["Tap it counts a bar in, and the pad is ready", quiz.sound?.tapping && !$("consQuizPad").disabled && $("consQuizTap").disabled ? [] : [Boolean(quiz.sound?.tapping)]]);
                        const readTiming = quizBarTiming();
                        await pause((quiz.sound.start - metro.context.currentTime) * 1000 + 10);
                        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
                        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true, cancelable: true }));
                        checks.push(["Space and F tap it, and Space doesn't start the metronome", quiz.sound?.tapping?.taps.length === 2 && !metro.running ? [] : [quiz.sound?.tapping?.taps.length, metro.running]]);
                        await pause(readTiming.beats * readTiming.beat * 1000 + 300);
                        checks.push(["as the bar ends the taps are graded, each note marked on time or missed under the staff", quiz.answered?.total === read.cells.filter(Boolean).length && $("consQuizWrittenStaff").querySelectorAll(".cons-quiz-mark").length === quiz.answered.total && /on time/.test($("consQuizResult").textContent) && !$("consQuizHear").hidden && $("consQuizTap").hidden ? [] : [quiz.answered?.total, $("consQuizResult").textContent]]);
                        metro.settings.tempo = readTempo;
                        setConsQuiz({ quizKind: "note" });
                        resetQuizScore();
                        consSections.show("finder");
                        checks.push(["Clear empties the picks", finder.picked.length === 0 && $("consPickClear").disabled ? [] : [finder.picked.join()]]);
                        // 2.4.0: Progressions. A sketch in a key, a chord picked and changed,
                        // the key's chords, other chords to try, the views, and the loop.
                        const savedProg = localStorage.getItem(PROG_KEY);
                        try {
                            if (metro.running) stopMetronome();
                            prog.settings = parseProgression(null);
                            prog.at = { section: 0, bar: 0, slot: 0 };
                            consSections.show("progressions");
                            const sheetChords = () => [...$("progSheet").querySelectorAll(".prog-chord")].map(chord => chord.querySelector(".csym")?.getAttribute("aria-label") ?? chord.textContent).join(" ");
                            const neckPcs = () => [...new Set([...$("consNeck").querySelectorAll(".cons-dot")].map(dot => Number(dot.dataset.midi) % 12))].sort((a, b) => a - b).join();
                            const lastToastUndo = () => $("toast").querySelector(".toast-action")?.click();
                            checks.push(["Progressions starts with a sketch in C: Cmaj7 Am7 Dm7 G7", sheetChords() === "Cmaj7 Am7 Dm7 G7" && $("progKeyName").textContent === "C major" ? [] : [sheetChords()]]);
                            checks.push(["the neck is drawn shorter, the capo set aside, Loop and Bass beside Play, and the chord picked marked", $("consNeck").querySelector(".cons-neck")?.getAttribute("viewBox").startsWith($("consNeck").clientWidth >= CONS_SHORT_FROM ? "0 0 2700" : "0 0 2000") && $("consCapo").closest("label").hidden && !$("progTransport").hidden && $("progDrawer").hidden && neckPcs() === "0,4,7,11" ? [] : [neckPcs(), $("progTransport").hidden]]);
                            await pause(40);
                            const pickBefore = heard.clicks;
                            $("progSheet").querySelectorAll(".prog-chord")[2].click();
                            await pause(40);
                            checks.push(["a chord clicked is picked, heard, and shown: Dm7, ii7 in C major", prog.at.bar === 2 && heard.clicks - pickBefore === 5 && $("progChordHead").textContent === "ii7 in C major" && neckPcs() === "0,2,5,9" ? [] : [$("progChordHead").textContent, heard.clicks - pickBefore, neckPcs()]]);
                            const pickedLine = () => $("progSheet").querySelector('.prog-chord[aria-pressed="true"]')?.closest(".prog-bars");
                            checks.push(["2.4.1: its drawer opens under its line, the notch at the chord", !$("progDrawer").hidden && $("progDrawer").previousElementSibling === pickedLine() && $("progDrawer").contains($("progChordForm")) && parseFloat($("progDrawer").style.getPropertyValue("--notch")) > 0 ? [] : [$("progDrawer").hidden, $("progDrawer").style.getPropertyValue("--notch")]]);
                            // 2.6.0: one voicing on the neck, the next chord's outlined; 2.7.0: another by hand, written into the song, and Reset.
                            checks.push(["2.6.0: the drawer offers All notes or a Voicing, all notes first", document.querySelector('#progNeckShow [data-neck="notes"]').getAttribute("aria-pressed") === "true" && $("progVoicingStep").hidden ? [] : ["voicing row"]]);
                            document.querySelector('#progNeckShow [data-neck="shapes"]').click();
                            const shownShape = progVoicingNow({ picked: true });
                            const shapeDots = () => [...$("consNeck").querySelectorAll(".cons-dot")];
                            const sounding = shownShape?.voicing.frets.filter(fret => fret !== null).length;
                            checks.push(["a voicing: its notes alone on the neck, a silent string's ×, the next chord's outlined, and named", shownShape && shapeDots().filter(dot => /is-(root|note)/.test(dot.getAttribute("class"))).length === sounding && shapeDots().filter(dot => dot.classList.contains("is-muted")).length === shownShape.voicing.frets.filter(fret => fret === null).length && shapeDots().some(dot => dot.classList.contains("is-next")) && /^\d+ of \d+ · /.test($("progVoicingName").textContent) && $("progVoicingReset").hidden ? [] : [sounding, shapeDots().length, $("progVoicingName").textContent]]);
                            const firstChoice = shownShape.chosen;
                            const writtenToken = () => progSketch().sections[0].bars[2][0];
                            $("progVoicingNext").click();
                            const steppedTo = progVoicings().choices[shownShape.index][(firstChoice + 1) % shownShape.count];
                            checks.push(["2.7.0: › another voicing, written into the song as its notes, a format 2 chart, and Reset offered", progVoicingNow({ picked: true }).chosen === (firstChoice + 1) % shownShape.count && writtenToken() === `Dm7=${steppedTo.midis.join(".")}` && progSongText().startsWith("Maestro chart 2\n") && !$("progVoicingReset").hidden && $("progSheet").querySelectorAll(".prog-chord")[2].getAttribute("aria-label").endsWith("its voicing written") ? [] : [writtenToken(), progVoicingNow({ picked: true }).chosen, firstChoice]]);
                            $("progVoicingReset").click();
                            checks.push(["Reset voicing takes it out of the song, chosen again around the rest, with Undo", writtenToken() === "Dm7" && progVoicingNow({ picked: true }).chosen === firstChoice && $("progVoicingReset").hidden && progSongText().startsWith("Maestro chart 1\n") && /Reset the voicing of Dm7/.test($("toast").textContent) ? [] : [writtenToken(), $("toast").textContent]]);
                            lastToastUndo();
                            checks.push(["Undo puts the voicing back", writtenToken() === `Dm7=${steppedTo.midis.join(".")}` && !$("progVoicingReset").hidden ? [] : [writtenToken()]]);
                            setProgChord("Dm9");
                            checks.push(["another chord in its place drops the voicing", writtenToken() === "Dm9" ? [] : [writtenToken()]]);
                            setProgChord("Dm7");
                            // 2.7.0: the Staff view, the song on a grand staff, edited note by note.
                            const staffKept = { sketch: structuredClone(progSketch()), at: { ...prog.at } };
                            document.querySelector('#progView [data-prog-view="staff"]').click();
                            const staffSvg = () => $("progStaffScore").querySelector("svg");
                            const staffToken = () => progSketch().sections[prog.at.section].bars[prog.at.bar][prog.at.slot];
                            const staffKey = (key, extra = {}) => $("progStaffScore").dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));
                            checks.push(["2.7.0: Staff shows the song on a grand staff in the sheet's place, a symbol over each chord, the voicing's controls under it, and is kept", prog.settings.view === "staff" && $("progSheet").hidden && !$("progStaff").hidden && staffSvg()?.querySelectorAll(".prog-staff-chord").length === progChords().length && $("progStaffTools").contains($("progVoicingPrev")) && $("progNeckShow").hidden && $("progFoot").hidden && JSON.parse(localStorage.getItem(PROG_KEY)).view === "staff" ? [] : [prog.settings.view, staffSvg()?.querySelectorAll(".prog-staff-chord").length, progChords().length]]);
                            checks.push(["its chord picked marked, and a note of it selected", staffSvg().querySelector(".prog-staff-pick.is-picked") && staffSvg().querySelector(".cp-ring.is-selected") && progStaffPicked().midis.includes(progStaff.note) && $("progStaffWhere").textContent.endsWith("Dm7") ? [] : [progStaff.note, $("progStaffWhere").textContent]]);
                            const staffBefore = staffToken();
                            const staffFrom = progStaff.note;
                            staffKey("ArrowUp");
                            checks.push(["Up moves the note a step in the key, and writes the voicing into the song", /^Dm7=/.test(staffToken()) && progStaff.note > staffFrom && progStaff.note - staffFrom <= 2 && progStaffPicked().midis.includes(progStaff.note) && !progStaffPicked().midis.includes(staffFrom) && staffSvg().querySelector(".prog-staff-written") ? [] : [staffToken(), staffFrom, progStaff.note]]);
                            staffKey("ArrowUp", { shiftKey: true });
                            checks.push(["Shift+Up a half step", progStaffPicked().midis.includes(progStaff.note) ? [] : [staffToken()]]);
                            const staffTop = progStaff.note;
                            staffKey("ArrowDown", { altKey: true });
                            checks.push(["Alt+Down selects the note below, writing nothing", progStaff.note < staffTop && progStaffPicked().midis.includes(progStaff.note) ? [] : [progStaff.note, staffTop]]);
                            const staffCount = progStaffPicked().midis.length;
                            staffKey("Delete");
                            checks.push(["Delete takes the note out", progStaffPicked().midis.length === staffCount - 1 ? [] : [staffToken()]]);
                            staffKey("c");
                            checks.push(["a letter adds that note, the nearest not in the chord", progStaffPicked().midis.length === staffCount && progStaff.note % 12 === 0 ? [] : [staffToken(), progStaff.note]]);
                            const staffNow = staffToken();
                            const ctrlOnPanel = (key, shiftKey = false) => $("progStaffScore").dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, shiftKey, bubbles: true, cancelable: true }));
                            ctrlOnPanel("z");
                            const staffOneBack = staffToken();
                            ctrlOnPanel("y");
                            checks.push(["Ctrl+Z steps back through the changes, and Ctrl+Y forward again", staffOneBack !== staffNow && staffToken() === staffNow ? [] : [staffOneBack, staffToken()]]);
                            for (let back = 0; back < 6; back++) ctrlOnPanel("z");
                            checks.push(["back to the start, the chord as it was", staffToken() === staffBefore ? [] : [staffToken(), staffBefore]]);
                            staffKey("ArrowRight");
                            checks.push(["Right picks the next chord", progChosen() === "G7" && $("progStaffWhere").textContent.endsWith("G7") ? [] : [progChosen()]]);
                            staffKey("ArrowLeft");
                            // The pointer: a note clicked is selected; a space clicked adds one; a right-click takes one out.
                            const staffAt = (x, y) => {
                                const box = staffSvg().getBoundingClientRect();
                                return { clientX: box.left + x / progStaff.drawn.width * box.width, clientY: box.top + y / progStaff.drawn.height * box.height, button: 2, preventDefault() {} };
                            };
                            const pickedPlace = progStaffPlace(progStaff.made.chords.find(chord => chord.section === prog.at.section && chord.bar === prog.at.bar && chord.slot === prog.at.slot));
                            const lowHead = pickedPlace.heads.reduce((low, head) => (head.midi < low.midi ? head : low));
                            $("progStaffScore").scrollIntoView();
                            progStaffClick(staffAt(lowHead.x + 6, lowHead.y));
                            checks.push(["a note clicked is selected", progStaff.note === lowHead.midi && staffToken() === staffBefore ? [] : [progStaff.note, lowHead.midi]]);
                            const staffSystem = pickedPlace.system;
                            checks.push(["2.7.0: a guitar's song on one staff, a treble clef with an 8 under it", cons.settings.instrument === "guitar" && progStaff.made.score.staves.map(staff => staff.clef).join() === "treble8" && staffSystem.staffY.length === 1 && staffSvg().getAttribute("aria-label").includes(" on a staff:") ? [] : [cons.settings.instrument, progStaff.made.score.staves.map(staff => staff.clef).join()]]);
                            // Two lines over the staff: written a sixth over the top line, sounding an octave lower.
                            const aboveStep = MaestroNotation.STAFF_BOTTOM.treble8 + 12;
                            const aboveMidi = MaestroNotation.midiOf(MaestroNotation.pitch(aboveStep, MaestroNotation.keyAlter(aboveStep % 7, MaestroHarmony.keySignature(progKey()))));
                            progStaffClick(staffAt(pickedPlace.column.x + 6, staffSystem.staffY[0] - 12 * MaestroNotation.SPACE / 2));
                            checks.push(["a space clicked adds a note there, in the key, as it sounds: an octave under where it's written", progStaffPicked().midis.includes(aboveMidi) && progStaff.note === aboveMidi && aboveMidi < 76 ? [] : [staffToken(), aboveMidi]]);
                            const addedHead = progStaffPlace(progStaff.made.chords.find(chord => chord.section === prog.at.section && chord.bar === prog.at.bar && chord.slot === prog.at.slot)).heads.find(head => head.midi === aboveMidi);
                            progStaffErase(staffAt(addedHead.x + 6, addedHead.y));
                            checks.push(["a right-click takes it out", !progStaffPicked().midis.includes(aboveMidi) ? [] : [staffToken()]]);
                            // Each instrument written as it's written: the staves follow the instrument chosen.
                            const staffClefs = () => progStaff.made.score.staves.map(staff => staff.clef).join();
                            const writtenAs = {};
                            for (const instrument of ["keyboard", "bass", "mandolin", "ukulele"]) {
                                document.querySelector(`#consInstruments [data-instrument="${instrument}"]`).click();
                                writtenAs[instrument] = staffClefs();
                            }
                            $("consTuning").value = "baritone";
                            $("consTuning").dispatchEvent(new Event("change"));
                            writtenAs.baritone = staffClefs();
                            $("consTuning").value = "standard";
                            $("consTuning").dispatchEvent(new Event("change"));
                            document.querySelector('#consInstruments [data-instrument="guitar"]').click();
                            checks.push(["a keyboard's on a grand staff, a bass's with an 8 under its clef, a mandolin's and a ukulele's on a treble clef, a baritone ukulele's as a guitar's", JSON.stringify(writtenAs) === JSON.stringify({ keyboard: "treble,bass", bass: "bass8", mandolin: "treble", ukulele: "treble", baritone: "treble8" }) && staffClefs() === "treble8" ? [] : [JSON.stringify(writtenAs), staffClefs()]]);
                            consNeckModes.progressions.click(50);
                            checks.push(["the neck clicked adds its pitch; clicked again on the note selected, takes it out", progStaffPicked().midis.includes(50) ? [] : [staffToken()]]);
                            consNeckModes.progressions.click(50);
                            checks.push(["and the pitch is gone", !progStaffPicked().midis.includes(50) ? [] : [staffToken()]]);
                            // Back to the chart: the voicing's controls go back to the drawer.
                            prog.settings.sketch = staffKept.sketch;
                            prog.at = staffKept.at;
                            document.querySelector('#progView [data-prog-view="chart"]').click();
                            checks.push(["Chart puts the sheet back, and the voicing's controls in the drawer", !$("progSheet").hidden && $("progStaff").hidden && $("progDrawer").contains($("progVoicingPrev")) && !$("progNeckShow").hidden ? [] : ["chart"]]);
                            pickProgChord(staffKept.at.section, staffKept.at.bar, staffKept.at.slot);
                            document.querySelector('#progNeckShow [data-neck="notes"]').click();
                            checks.push(["All notes again: every chord tone everywhere", prog.settings.neck === "notes" && neckPcs() === "0,2,5,9" ? [] : [neckPcs()]]);
                            checks.push(["with the scales that fit it, the key's first, and its guide tones", $("progScales").children[0]?.textContent === "D Dorian" && $("progScales").children[0].classList.contains("is-in-key") && /Dm7: (F C|C F)/.test($("progGuide").textContent) ? [] : [$("progScales").textContent, $("progGuide").textContent]]);
                            $("progScales").children[0].click();
                            checks.push(["a scale clicked joins the chord on the neck, quieter", neckPcs() === "0,2,4,5,7,9,11" && $("consNeck").querySelectorAll(".cons-dot.is-other").length > 0 ? [] : [neckPcs()]]);
                            $("progChordName").value = "V7/V";
                            $("progChordForm").requestSubmit();
                            checks.push(["a numeral typed becomes its chord: V7/V is D7", sheetChords() === "Cmaj7 Am7 D7 G7" ? [] : [sheetChords()]]);
                            $("progChordName").value = "E7#9";
                            $("progChordForm").requestSubmit();
                            checks.push(["a chord typed with # is spelled: E7\u266F9", sheetChords() === "Cmaj7 Am7 E7\u266F9 G7" ? [] : [sheetChords()]]);
                            $("progChordName").value = "Hendrix";
                            $("progChordForm").requestSubmit();
                            checks.push(["a name it can't read is refused, and it says why", !$("progProblem").hidden && sheetChords() === "Cmaj7 Am7 E7\u266F9 G7" ? [] : [sheetChords()]]);
                            $("progKeyChords").querySelector('[data-name="Dm7"]').click();
                            checks.push(["a chord of the key put in its place", sheetChords() === "Cmaj7 Am7 Dm7 G7" && $("progProblem").hidden ? [] : [sheetChords()]]);
                            $("progSplit").click();
                            checks.push(["Add to bar shares the bar with a copy", sheetChords() === "Cmaj7 Am7 Dm7 Dm7 G7" && prog.at.slot === 1 ? [] : [sheetChords()]]);
                            $("progRemove").click();
                            checks.push(["Remove takes it out, with Undo", sheetChords() === "Cmaj7 Am7 Dm7 G7" && $("toast").textContent.includes("Removed Dm7") ? [] : [sheetChords()]]);
                            $("progSheet").querySelector("[data-add-bar]").click();
                            checks.push(["+ adds a bar of the key's first chord, and picks it", sheetChords() === "Cmaj7 Am7 Dm7 G7 Cmaj7" && prog.at.bar === 4 ? [] : [sheetChords()]]);
                            $("progRemove").click();
                            $("progSheet").querySelectorAll(".prog-chord")[3].click();
                            const tritone = [...$("progIdeas").querySelectorAll("[data-idea]")].find(button => /Tritone/.test(button.getAttribute("aria-label")));
                            tritone?.click();
                            checks.push(["a chord to try takes its place: the tritone substitute for G7", sheetChords() === "Cmaj7 Am7 Dm7 D\u266D7" ? [] : [sheetChords()]]);
                            lastToastUndo();
                            checks.push(["and Undo puts G7 back", sheetChords() === "Cmaj7 Am7 Dm7 G7" ? [] : [sheetChords()]]);
                            const twoFive = [...$("progIdeas").querySelectorAll("[data-idea]")].find(button => /ii.V/.test(button.getAttribute("aria-label")));
                            twoFive?.click();
                            checks.push(["two chords to try share the bar: a ii-V into Cmaj7, the last chord leading to the first", sheetChords() === "Cmaj7 Am7 Dm7 Dm7 G7" ? [] : [sheetChords()]]);
                            lastToastUndo();
                            // 2.4.1: Done, or the chord clicked again, closes the drawer; the chord stays picked.
                            const pickedChord = () => $("progSheet").querySelector('.prog-chord[aria-pressed="true"]');
                            $("progDrawerDone").click();
                            const doneClosed = $("progDrawer").hidden && pickedChord()?.getAttribute("aria-expanded") === "false";
                            pickedChord().click();
                            const reopened = !$("progDrawer").hidden;
                            pickedChord().click();
                            checks.push(["Done, or its chord clicked again, closes the drawer; the chord stays picked", doneClosed && reopened && $("progDrawer").hidden && pickedChord() ? [] : [doneClosed, reopened, $("progDrawer").hidden]]);
                            pickedChord().click();
                            $("progChordName").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
                            checks.push(["Escape in the chord's field, with nothing typed, closes the drawer too", $("progDrawer").hidden ? [] : ["open"]]);
                            document.querySelector('#progShow [data-show="numerals"]').click();
                            const texts = selector => [...$("progSheet").querySelectorAll(selector)].map(node => node.textContent).join(" ");
                            checks.push(["Numerals writes each chord's numeral under it", texts(".prog-numeral") === "Imaj7 vi7 ii7 V7" ? [] : [texts(".prog-numeral")]]);
                            document.querySelector('#progShow [data-show="nashville"]').click();
                            checks.push(["Nashville writes numbers", texts(".prog-nashville") === "1maj7 6m7 2m7 57" ? [] : [texts(".prog-nashville")]]);
                            document.querySelector('#progShow [data-show="symbols"]').click();
                            // 2.4.1: one Key, in a popover; Move the chords too takes them along.
                            $("progKeyButton").click();
                            checks.push(["Key opens its popover, alone", !$("progKeyPanel").hidden && $("progKeyButton").getAttribute("aria-expanded") === "true" ? [] : ["closed"]]);
                            $("progMove").checked = true;
                            $("progMove").dispatchEvent(new Event("change"));
                            const setRoot = root => { $("progRoot").value = root; $("progRoot").dispatchEvent(new Event("change")); };
                            setRoot("D");
                            checks.push(["with Move the chords too, a new root moves every chord: to D", sheetChords() === "Dmaj7 Bm7 Em7 A7" && progSketch().root === "D" && $("progRoot").value === "D" && $("progKeyName").textContent === "D major" && JSON.parse(localStorage.getItem(PROG_KEY) ?? "{}").move === true ? [] : [sheetChords(), $("progKeyName").textContent]]);
                            setRoot("E\u266D");
                            checks.push(["in E\u266D, a capo is suggested for open shapes", !$("progCapo").hidden && /^Capo \d+: played as /.test($("progCapo").textContent) ? [] : [$("progCapo").textContent]]);
                            setRoot("C");
                            $("progMove").checked = false;
                            $("progMove").dispatchEvent(new Event("change"));
                            $("progKeyPanel").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
                            checks.push(["Escape closes it, back on Key", $("progKeyPanel").hidden && document.activeElement === $("progKeyButton") ? [] : [$("progKeyPanel").hidden, document.activeElement?.id]]);
                            $("progKeyButton").click();
                            $("progSheet").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
                            checks.push(["a click outside a popover closes it", $("progKeyPanel").hidden && $("progKeyButton").getAttribute("aria-expanded") === "false" ? [] : ["open"]]);
                            $("progRoot").value = "A";
                            $("progRoot").dispatchEvent(new Event("change"));
                            checks.push(["Key relabels and leaves the chords", sheetChords() === "Cmaj7 Am7 Dm7 G7" && progSketch().root === "A" && $("progChordHead").textContent.endsWith("in A major") ? [] : [sheetChords(), $("progChordHead").textContent]]);
                            $("progRoot").value = "C";
                            $("progRoot").dispatchEvent(new Event("change"));
                            checks.push(["the sketch is kept on this PC", JSON.parse(localStorage.getItem(PROG_KEY) ?? "{}").sketch?.root === "C" ? [] : ["not kept"]]);
                            // The loop: the metronome books each chord on its first beat.
                            prog.settings.loop = true;
                            metro.settings.countIn = 0;
                            setMetroTempo(120);
                            setMetroMeter("4/4");
                            const loopFrom = heard.sources.length;
                            $("metroPlay").click();
                            await pause(320);
                            checks.push(["with Loop on, Start books the first chord on the first beat", prog.fromBar === 0 && prog.booked.length + (prog.playing ? 1 : 0) >= 1 && heard.sources.length - loopFrom >= 5 ? [] : [prog.fromBar, prog.booked.length, heard.sources.length - loopFrom]]);
                            lightDueProgression();
                            checks.push(["the chord sounding lights its bar, and the neck shows it", prog.playing?.chord === "Cmaj7" && $("progSheet").querySelector(".prog-bar.is-playing")?.dataset.bar === "0" && neckPcs() === "0,4,7,11" ? [] : [prog.playing?.chord]]);
                            const quietBefore = heard.clicks;
                            $("progSheet").querySelectorAll(".prog-chord")[2].click();
                            await pause(20);
                            checks.push(["a chord picked while the loop plays isn't strummed over it", heard.clicks === quietBefore || prog.booked.length > 0 ? [] : [heard.clicks - quietBefore]]);
                            $("progLoop").click();
                            checks.push(["Loop off cuts the chords booked ahead and lights nothing", prog.out === null && prog.playing === null && !$("progSheet").querySelector(".prog-bar.is-playing") && metro.running ? [] : [prog.out, prog.playing]]);
                            $("progLoop").click();
                            stopMetronome();
                            checks.push(["Stop ends the loop", prog.out === null && prog.booked.length === 0 && prog.fromBar === null ? [] : [prog.fromBar]]);
                            const timeline = MaestroHarmony.chartTimeline({ ...progSketch(), beats: 3 });
                            setMetroMeter("3/4");
                            checks.push(["a bar is as long as the metronome's: 3/4 makes bars of three beats", progSketch().beats === 3 && prog.length === timeline.at(-1).start + timeline.at(-1).beats && $("progFacts").textContent.includes("3/4") ? [] : [progSketch().beats, $("progFacts").textContent]]);
                            setMetroMeter("4/4");
                            // 2.4.0: a bass under the loop, booked beat by beat with the chords.
                            $("progBassButton").click();
                            const bassOpened = !$("progBassPanel").hidden;
                            $("progBass").querySelector('[data-bass="walking"]').click();
                            checks.push(["2.4.1: Bass beside Loop opens its choices, and a choice names itself (2.6.0: the popover stays open for the drums)", bassOpened && !$("progBassPanel").hidden && $("progBassNow").textContent === "Walking" ? [] : [bassOpened, $("progBassNow").textContent]]);
                            toggleProgPopover("bass", false);
                            const bassKept = JSON.parse(localStorage.getItem(PROG_KEY) ?? "{}").bass === "walking" && $("progBass").querySelector('[aria-pressed="true"]')?.dataset.bass === "walking";
                            const bookBar = () => {
                                cutProgLoop();
                                const from = heard.sources.length;
                                for (let beat = 0; beat < 4; beat++) bookProgressionBeat(metro.context.currentTime + 1 + beat * 0.5, 0, beat);
                                return heard.sources.slice(from);
                            };
                            const walked = bookBar();
                            checks.push(["Walking bass: a note a beat, the chord leaving its low note to it, each note damped by the next", bassKept && prog.bassNotes.size === 16 && walked.length === 3 + MaestroHarmony.voiceChord("Cmaj7").length && walked.filter(source => source.stopped).length === 3 && prog.bassVoice !== null ? [] : [bassKept, prog.bassNotes.size, walked.length, walked.filter(source => source.stopped).length]]);
                            $("progBass").querySelector('[data-bass="roots"]').click();
                            const rooted = bookBar();
                            checks.push(["Roots: a bass note as each chord starts", prog.bassNotes.size === 4 && rooted.length === MaestroHarmony.voiceChord("Cmaj7").length ? [] : [prog.bassNotes.size, rooted.length]]);
                            $("progBass").querySelector('[data-bass="off"]').click();
                            const unbassed = bookBar();
                            checks.push(["Bass off: the chords alone, with their own low note", prog.bassNotes.size === 0 && unbassed.length === MaestroHarmony.voiceChord("Cmaj7").length && prog.bassVoice === null ? [] : [prog.bassNotes.size, unbassed.length]]);
                            cutProgLoop();
                            // 2.4.0, chord charts: the title, sections, repeated bars, songs kept by AHK, and printing.
                            prog.settings = parseProgression(null);
                            prog.at = { section: 0, bar: 0, slot: 0 };
                            renderProgressions();
                            const chartMessage = (type, from) => messages.slice(from).filter(message => message.startsWith(`${type}\n`)).at(-1);
                            checks.push(["Progressions asks AHK for the songs, and Save waits for them", sent.has("GetCharts") && $("progSave").disabled ? [] : [sent.has("GetCharts"), $("progSave").disabled]]);
                            handleWebMessage({ data: { type: "charts", items: [
                                { id: "k3x9q2m7ab", text: "Maestro chart 1\nAutumn Study\tG\tmajor\t3/4\nVerse\t2\tGmaj7\tEm7\t%\n" },
                                { id: "../bad", text: "Maestro chart 1\nX\tC\tmajor\t4/4\nA\t1\tC" },
                                { id: "badtext01", text: "not a chart" }
                            ] } });
                            // 2.4.1: the songs are in the title's menu.
                            $("progSongButton").click();
                            checks.push(["the title opens its menu, with the one well-formed song, its key, time signature and bars", !$("progSongMenu").hidden && prog.songs.length === 1 && $("progSongs").children.length === 1 && /Autumn Study/.test($("progSongs").textContent) && /G major · 3\/4 · 6 bars/.test($("progSongs").textContent) && $("progSongCount").textContent === "1 of 100" ? [] : [$("progSongMenu").hidden, $("progSongs").textContent]]);
                            $("progRename").click();
                            const renaming = $("progSongMenu").hidden && $("progSongButton").hidden && !$("progTitle").hidden;
                            $("progTitle").value = "Blue Sketch";
                            $("progTitle").dispatchEvent(new Event("change"));
                            $("progTitle").value = "   ";
                            $("progTitle").dispatchEvent(new Event("change"));
                            $("progTitle").dispatchEvent(new Event("blur"));
                            checks.push(["Rename puts a field in the title's place, and an empty one is refused", renaming && progSketch().title === "Blue Sketch" && $("progTitleText").textContent === "Blue Sketch" && $("progTitle").hidden && !$("progSongButton").hidden ? [] : [renaming, progSketch().title, $("progTitle").hidden]]);
                            // 2.4.1: a section's heading opens its fields in place.
                            $("progSheet").querySelector('[data-section-head="0"]').click();
                            checks.push(["a section's heading opens its fields in place", prog.sectionOpen === 0 && !$("progSectionEdit").hidden && $("progSectionEdit").closest(".prog-section-head.is-editing") && $("progDrawer").hidden && $("progSectionEdit").getAttribute("aria-label") === "Section A" ? [] : [prog.sectionOpen, $("progSectionEdit").hidden]]);
                            $("progSectionName").value = "Verse";
                            $("progSectionName").dispatchEvent(new Event("change"));
                            $("progSectionRepeat").value = "2";
                            $("progSectionRepeat").dispatchEvent(new Event("change"));
                            $("progSectionDone").click();
                            const sectionHead = () => [...$("progSheet").querySelectorAll(".prog-section-head")].map(head => head.textContent).join("|");
                            checks.push(["a section is named and repeated, and Done shows the sheet saying so", prog.sectionOpen === null && $("progSectionEdit").hidden && sectionHead() === "AVerse×2" && /8 bars as played/.test($("progFacts").textContent) ? [] : [sectionHead(), $("progFacts").textContent]]);
                            $("progAddSection").click();
                            checks.push(["Add section adds one at the end, with the key's first chord, picked and open to name", progSketch().sections.length === 2 && sheetChords() === "Cmaj7 Am7 Dm7 G7 Cmaj7" && prog.at.section === 1 && prog.sectionOpen === 1 && $("progSectionEdit").getAttribute("aria-label") === "Section B" && $("progSectionName").value === "" ? [] : [sheetChords(), $("progSectionEdit").getAttribute("aria-label")]]);
                            $("progRepeatBar").click();
                            checks.push(["Repeat bar adds a bar that plays it again", progSketch().sections[1].bars[1][0] === MaestroHarmony.REPEAT_BAR && $("progSheet").querySelectorAll("[data-write-out]").length === 1 && /10 bars as played/.test($("progFacts").textContent) && prog.timeline.at(-1).chord === "Cmaj7" ? [] : [JSON.stringify(progSketch().sections[1].bars)]]);
                            $("progSheet").querySelector("[data-write-out]").click();
                            checks.push(["a repeated bar clicked is written out, and its chord picked", progSketch().sections[1].bars[1].join() === "Cmaj7" && prog.at.section === 1 && prog.at.bar === 1 && !$("progSheet").querySelector("[data-write-out]") ? [] : [JSON.stringify(progSketch().sections[1].bars)]]);
                            $("progRemoveSection").click();
                            const removedSections = progSketch().sections.length;
                            lastToastUndo();
                            checks.push(["Remove section takes it out, with Undo", removedSections === 1 && progSketch().sections.length === 2 && $("progRemoveSection").disabled === false ? [] : [removedSections, progSketch().sections.length]]);
                            const saveFrom = messages.length;
                            $("progSave").click();
                            const saveSent = chartMessage("SaveChart", saveFrom)?.split("\n") ?? [];
                            const songId = saveSent[1] ?? "";
                            const savedChart = MaestroHarmony.readChartText(saveSent.slice(2).join("\n"));
                            checks.push(["Save song sends a new id and the chart, with the metronome's time signature", /^[a-z0-9]{16}$/.test(songId) && savedChart?.title === "Blue Sketch" && savedChart.sections.length === 2 && savedChart.sections[0].name === "Verse" && savedChart.sections[0].repeat === 2 && savedChart.meter === "4/4" && prog.settings.song === songId ? [] : [saveSent.slice(0, 3).join(" | ")]]);
                            handleWebMessage({ data: { type: "chartSaved", id: songId } });
                            $("progSongButton").click();
                            checks.push(["once AHK has it, it's Saved, a word rather than a button, and marked in the menu", $("progSave").textContent === "Saved" && $("progSave").disabled && $("progSave").classList.contains("is-saved") && prog.songs.length === 2 && $("progSongs").querySelector('[aria-current="true"]')?.dataset.songOpen === songId ? [] : [$("progSave").textContent, prog.songs.length]]);
                            $("progSectionRepeat").value = "3";
                            $("progSectionRepeat").dispatchEvent(new Event("change"));
                            const changedText = $("progSave").textContent;
                            const resaveFrom = messages.length;
                            $("progSave").click();
                            checks.push(["a change offers Save changes, a button again, which keeps the same song", changedText === "Save changes" && chartMessage("SaveChart", resaveFrom)?.split("\n")[1] === songId && /changed/.test($("progSongs").textContent) ? [] : [changedText, chartMessage("SaveChart", resaveFrom)?.split("\n")[1]]]);
                            handleWebMessage({ data: { type: "chartSaved", id: songId } });
                            $("progSongs").querySelector('[data-song-open="k3x9q2m7ab"]').click();
                            checks.push(["opening a song puts it on the sheet and sets its time signature", sheetChords() === "Gmaj7 Em7" && progSketch().title === "Autumn Study" && metro.settings.meter === "3/4" && prog.settings.song === "k3x9q2m7ab" && $("progSave").textContent === "Saved" ? [] : [sheetChords(), metro.settings.meter, $("progSave").textContent]]);
                            lastToastUndo();
                            checks.push(["and Undo brings back the sheet before, and its time signature", progSketch().title === "Blue Sketch" && metro.settings.meter === "4/4" && prog.settings.song === songId ? [] : [progSketch().title, metro.settings.meter]]);
                            const deleteFrom = messages.length;
                            $("progSongButton").click();
                            $("progSongs").querySelector(`[data-song-delete="${songId}"]`).click();
                            checks.push(["delete asks AHK, by the song's id", chartMessage("DeleteChart", deleteFrom) === `DeleteChart\n${songId}` ? [] : [chartMessage("DeleteChart", deleteFrom)]]);
                            handleWebMessage({ data: { type: "chartDeleted", id: songId } });
                            checks.push(["once deleted, the sheet stays, no longer saved", prog.songs.length === 1 && prog.settings.song === null && progSketch().title === "Blue Sketch" && $("progSave").textContent === "Save song" ? [] : [prog.songs.length, $("progSave").textContent]]);
                            const undoFrom = messages.length;
                            lastToastUndo();
                            checks.push(["and Undo saves it again under its id", chartMessage("SaveChart", undoFrom)?.split("\n")[1] === songId ? [] : ["not sent"]]);
                            handleWebMessage({ data: { type: "error", scope: "charts", message: "Maestro keeps up to 100 songs." } });
                            checks.push(["a save AHK refuses is forgotten", prog.saving.size === 0 ? [] : [prog.saving.size]]);
                            // 2.4.1: Save as a new song keeps the sheet under a new id; the one it came from stays.
                            const copyFrom = messages.length;
                            const copiedFrom = prog.settings.song;
                            toggleProgPopover("songs", true);
                            $("progSaveCopy").click();
                            const copyId = chartMessage("SaveChart", copyFrom)?.split("\n")[1] ?? "";
                            checks.push(["Save as a new song sends a new id, and the sheet becomes that song", /^[a-z0-9]{16}$/.test(copyId) && copyId !== copiedFrom && prog.settings.song === copyId && $("progSongMenu").hidden ? [] : [copyId, copiedFrom]]);
                            handleWebMessage({ data: { type: "chartSaved", id: copyId } });
                            $("progSongButton").click();
                            $("progNewSong").click();
                            checks.push(["New song starts a sheet of one bar in the key, not yet saved", progSketch().title === "New song" && sheetChords() === "Cmaj7" && prog.settings.song === null && $("progSave").textContent === "Save song" ? [] : [sheetChords(), progSketch().title]]);
                            lastToastUndo();
                            // Printing: the chart drawn for paper, with numerals (or Nashville numbers) beneath.
                            const printed = [];
                            const realPrint = window.print;
                            window.print = () => printed.push($("printChart").cloneNode(true));
                            try {
                                checks.push(["the printed chart isn't shown on screen", getComputedStyle($("printChart")).display === "none" ? [] : ["shown"]]);
                                $("progSongButton").click();
                                $("progMenuPrint").click();
                                checks.push(["Print, from the title's menu, opens its choices in the menu's place, numerals beneath unless changed", !$("progPrintPanel").hidden && $("progSongMenu").hidden && $("progUnder").querySelector('[aria-pressed="true"]')?.dataset.under === "numerals" ? [] : ["closed"]]);
                                $("progPrint").click();
                                const page = printed[0];
                                const writtenBars = progSketch().sections.reduce((sum, section) => sum + section.bars.length, 0);
                                const firstUnder = page?.querySelector(".print-under")?.textContent;
                                checks.push(["Print chart draws the title, sections and every bar, with numerals beneath", page?.querySelector("h1")?.textContent === "Blue Sketch" && page.querySelectorAll(".print-section").length === 2 && page.querySelectorAll(".print-bar").length === writtenBars && firstUnder === MaestroHarmony.romanNumeral("Cmaj7", progKey()) && /Play 3 times/.test(page.textContent) && page.querySelectorAll(".print-bar.is-last").length === 1 && $("progPrintPanel").hidden ? [] : [page?.querySelector("h1")?.textContent, firstUnder]]);
                                $("progSongButton").click();
                                $("progMenuPrint").click();
                                $("progUnder").querySelector('[data-under="nashville"]').click();
                                $("progPrint").click();
                                checks.push(["or Nashville numbers", printed[1]?.querySelector(".print-under")?.textContent === MaestroHarmony.nashville("Cmaj7", progKey()) ? [] : [printed[1]?.querySelector(".print-under")?.textContent]]);
                                window.dispatchEvent(new Event("afterprint"));
                                checks.push(["after printing, the chart drawn for it is let go", !$("printChart").children.length ? [] : ["kept"]]);
                            } finally {
                                window.print = realPrint;
                            }
                            // The sheet scrolls inside its module: a long song leaves the panel as tall, and the chord picked in view.
                            prog.settings.sketch = MaestroHarmony.cleanChart({ title: "Short", root: "C", scale: "major", beats: 4, sections: [{ name: "", repeat: 1, bars: [["C"], ["F"], ["G"], ["C"]] }] });
                            prog.at = { section: 0, bar: 0, slot: 0 };
                            rebuildProgTimeline();
                            renderProgressions();
                            const panelShort = $("consProgPanel").scrollHeight;
                            const longBars = Array.from({ length: 16 }, (_, at) => [["C", "Am", "F", "G7"][at % 4]]);
                            prog.settings.sketch = MaestroHarmony.cleanChart({ title: "Long", root: "C", scale: "major", beats: 4, sections: ["A", "B", "C"].map(name => ({ name, repeat: 1, bars: structuredClone(longBars) })) });
                            prog.at = { section: 2, bar: 15, slot: 0 };
                            rebuildProgTimeline();
                            renderProgressions();
                            const sheetBox = $("progSheet").getBoundingClientRect();
                            const pickedBox = $("progSheet").querySelector('.prog-chord[aria-pressed="true"]').getBoundingClientRect();
                            checks.push(["a long song scrolls inside the sheet, and the panel is no taller", $("progSheet").scrollHeight > $("progSheet").clientHeight + 100 && $("consProgPanel").scrollHeight === panelShort ? [] : [$("progSheet").scrollHeight, $("progSheet").clientHeight, $("consProgPanel").scrollHeight, panelShort]]);
                            checks.push(["the chord picked at its end is scrolled into view", pickedBox.top >= sheetBox.top - 1 && pickedBox.bottom <= sheetBox.bottom + 1 && $("progSheet").scrollTop > 0 ? [] : [Math.round(pickedBox.top), Math.round(sheetBox.top), Math.round(pickedBox.bottom), Math.round(sheetBox.bottom)]]);
                            $("progSheet").scrollTop = 0;
                            prog.playing = prog.timeline.find(event => event.section === 1 && event.written === 12);
                            showProgPlaying();
                            const playingBox = $("progSheet").querySelector(".prog-bar.is-playing")?.getBoundingClientRect();
                            checks.push(["the sheet follows the bar playing", playingBox && playingBox.bottom <= $("progSheet").getBoundingClientRect().bottom + 1 && $("progSheet").scrollTop > 0 ? [] : [$("progSheet").scrollTop]]);
                            prog.playing = null;
                            // Triads or sevenths in the key: the same height, so nothing moves.
                            prog.barOpen = true;
                            renderProgressions();
                            const keyRow = () => { const box = $("progKeyChords").getBoundingClientRect(); return `${Math.round(box.top)}/${Math.round(box.height)}`; };
                            document.querySelector('#progChordSize [data-sevenths="true"]').click();
                            const withSevenths = keyRow();
                            document.querySelector('#progChordSize [data-sevenths="false"]').click();
                            const withTriads = keyRow();
                            document.querySelector('#progChordSize [data-sevenths="true"]').click();
                            checks.push(["triads or sevenths in the key: one height, in one place", withSevenths === withTriads && $("progKeyChords").children[1].querySelector(".csym").classList.contains("is-list") ? [] : [withSevenths, withTriads]]);
                            // 2.4.0, writing prompts: a sentence of chips, each with a menu; checks; Open in sketch.
                            prog.settings.prompt = null;
                            $("progSide").querySelector('[data-side="prompt"]').click();
                            const chips = () => [...$("promptBrief").querySelectorAll("[data-part]")].map(chip => chip.dataset.part).join();
                            checks.push(["Prompt draws one at Moderate, a chip for each part", !$("progPromptPane").hidden && prog.settings.prompt?.level === 2 && chips() === "form,key,meter,tempo,begin,use,avoid" && /^\d of 7 met by the sketch$/.test($("progChordHead").textContent) ? [] : [chips(), $("progChordHead").textContent]]);
                            prog.settings.prompt = { level: 3, form: "aaba32", key: { root: "D", scale: "dorian" }, meter: "3/4", tempo: 92, begin: "1", use: "secondary", use2: "borrowed", avoid: "noFive" };
                            prog.settings.locked = [];
                            renderPrompt();
                            checks.push(["the sentence reads as written", $("promptBrief").textContent === "Write a 32-bar AABA in D dorian, in 3/4 at 92 BPM. Begin on i7 (Dm7), use a secondary dominant and a borrowed chord, and avoid the v chord." && $("promptLevel").querySelector('[aria-pressed="true"]')?.textContent === "Colorful" ? [] : [$("promptBrief").textContent]]);
                            $("promptBrief").querySelector('[data-part="key"]').click();
                            checks.push(["a chip opens its menu: whether it's met, Lock, Draw again, Choose", !$("promptMenu").hidden && $("promptMenuTitle").textContent === "Key" && /^Not yet: The sketch is in C major\.$/.test($("promptMenuStatus").textContent) && $("promptChoose").selectedOptions[0]?.textContent === "D dorian" ? [] : [$("promptMenuStatus").textContent, $("promptChoose").selectedOptions[0]?.textContent]]);
                            $("promptLock").click();
                            const keyChip = () => $("promptBrief").querySelector('[data-part="key"]');
                            checks.push(["Lock marks the chip, and the menu says Unlock", keyChip().classList.contains("is-locked") && $("promptLock").textContent === "Unlock" && prog.settings.locked.includes("key") ? [] : [prog.settings.locked.join()]]);
                            const drawnKeys = [1, 2, 3, 4, 5].map(() => { $("promptDraw").click(); return `${prog.settings.prompt.key.root} ${prog.settings.prompt.key.scale}|${prog.settings.prompt.tempo}`; });
                            checks.push(["Draw again keeps the key locked and draws the rest", drawnKeys.every(each => each.startsWith("D dorian|")) && new Set(drawnKeys.map(each => each.split("|")[1])).size > 1 ? [] : drawnKeys]);
                            const beforeTempo = structuredClone(prog.settings.prompt);
                            $("promptBrief").querySelector('[data-part="tempo"]').click();
                            for (let time = 0; time < 10 && prog.settings.prompt.tempo === beforeTempo.tempo; time++) $("promptRedraw").click();
                            checks.push(["a part drawn again alone: only it changes", prog.settings.prompt.tempo !== beforeTempo.tempo && MaestroPrompts.PARTS.filter(part => part !== "tempo" && JSON.stringify(prog.settings.prompt[part]) !== JSON.stringify(beforeTempo[part])).length === 0 ? [] : [JSON.stringify(prog.settings.prompt)]]);
                            $("promptBrief").querySelector('[data-part="form"]').click();
                            const formAt = promptState.values.indexOf("abac32");
                            $("promptChoose").value = String(formAt);
                            $("promptChoose").dispatchEvent(new Event("change"));
                            checks.push(["a part chosen by hand is kept, and locked", prog.settings.prompt.form === "abac32" && prog.settings.locked.includes("form") && /32-bar ABAC/.test($("promptBrief").textContent) && !$("promptMenu").hidden ? [] : [prog.settings.prompt.form]]);
                            $("promptMenu").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
                            checks.push(["Escape closes the menu, back on its chip", $("promptMenu").hidden && document.activeElement?.dataset.part === "form" ? [] : ["open"]]);
                            const tempoBefore = metro.settings.tempo;
                            const titleBefore = progSketch().title;
                            $("promptOpen").click();
                            const wanted = prog.settings.prompt;
                            checks.push(["Open in sketch makes the form's sections, in the key, and sets the metronome", progSketch().sections.map(section => section.bars.length).join() === "8,8,8,8" && progSketch().root === "D" && progSketch().scale === "dorian" && metro.settings.meter === wanted.meter && metro.settings.tempo === wanted.tempo && prog.settings.song === null ? [] : [progSketch().sections.length, metro.settings.meter, metro.settings.tempo]]);
                            checks.push(["and the sketch then meets the form, key, time, tempo and beginning", ["form", "key", "meter", "tempo", "begin"].every(part => $("promptBrief").querySelector(`[data-part="${part}"]`).classList.contains("is-met")) ? [] : [$("progChordHead").textContent]]);
                            lastToastUndo();
                            checks.push(["Undo brings back the sketch and the tempo before", progSketch().title === titleBefore && metro.settings.tempo === tempoBefore ? [] : [progSketch().title, metro.settings.tempo]]);
                            $("promptLevel").querySelector('[data-level="1"]').click();
                            checks.push(["Simple: no second device and nothing to avoid, the locks kept", prog.settings.prompt.level === 1 && chips() === "form,key,meter,tempo,begin,use" && prog.settings.prompt.form === "abac32" && /^\d of 6 met/.test($("progChordHead").textContent) ? [] : [chips(), prog.settings.prompt.form]]);
                            checks.push(["the prompt is kept with the sketch", JSON.parse(localStorage.getItem(PROG_KEY) ?? "{}").prompt?.form === "abac32" && parseProgression('{"prompt":{"level":9}}').prompt === null ? [] : ["not kept"]]);
                            // 2.4.0: Keys: the circle of fifths, the keys the chords fit, and the chords two keys share.
                            const keysBefore = { sketch: structuredClone(progSketch()), sevenths: prog.settings.sevenths, at: { ...prog.at } };
                            prog.settings.sketch = MaestroHarmony.cleanChart({ title: "Keys", root: "C", scale: "major", beats: 4, sections: [{ name: "", repeat: 1, bars: [["Cmaj7"], ["A7"], ["Dm7"], ["G7"]] }] });
                            prog.settings.sevenths = false;
                            prog.at = { section: 0, bar: 0, slot: 0 };
                            $("progSide").querySelector('[data-side="keys"]').click();
                            const keyCell = id => $("progCircle").querySelector(`button[data-cell="${id}"]`);
                            checks.push(["Keys: the circle's 24 keys, C major lit, the sketch's chords marked on theirs", $("progCircle").querySelectorAll("button.prog-circle-key").length === 24 && keyCell("0-major").classList.contains("is-tonic") && keyCell("0-minor").classList.contains("is-key") && ["0-major", "3-major", "11-minor", "1-major"].every(id => keyCell(id).classList.contains("is-used")) && !keyCell("2-major").classList.contains("is-used") && $("progChordTitle").textContent === "Keys" ? [] : [...$("progCircle").querySelectorAll(".is-used")].map(each => each.dataset.cell)]);
                            const fitsShown = [...$("progKeyFits").children].map(button => button.textContent);
                            checks.push(["the keys the chords fit, the key first and pressed, A7 named outside it", fitsShown[0] === "C major3 of 4 chords" && $("progKeyFits").children[0].getAttribute("aria-pressed") === "true" && $("progKeyOutside").textContent === "Outside C major: A7 (V7/ii)." && $("progChordHead").textContent === "3 of 4 chords in C major" && $("progTowardKey").hidden ? [] : [fitsShown.join("|"), $("progKeyOutside").textContent, $("progChordHead").textContent]]);
                            keyCell("1-major").click();
                            checks.push(["a key picked on the circle: the chords the two share, numeral to numeral", keyCell("1-major").getAttribute("aria-pressed") === "true" && $("progPivotLabel").textContent === "Shared with G major" && [...$("progPivots").children].map(button => button.dataset.name).join(" ") === "C Em G Am" && $("progPivots").children[0].textContent.startsWith("I → IV") && !$("progTowardKey").hidden ? [] : [$("progPivotLabel").textContent, [...$("progPivots").children].map(button => button.textContent).join("|")]]);
                            // 2.6.0: cadences in the key, and ways to the key picked.
                            const moveChords = list => [...$(list).querySelectorAll(".prog-move")].map(item => [...item.querySelectorAll("[data-name]")].map(chip => chip.dataset.name).join(" "));
                            checks.push(["2.6.0: the key's cadences, and ways to the key picked", moveChords("progCadences")[0] === "F G7 C" && $("progCadences").children.length === 6 && !$("progWaysLabel").hidden && $("progWaysLabel").textContent === "Ways to G major" && moveChords("progWays").includes("C D7 G") ? [] : [moveChords("progCadences").join("|"), moveChords("progWays").join("|")]]);
                            const barsBeforeAdd = progSketch().sections[0].bars.length;
                            $("progWays").querySelector('[data-add="ways:dominant"]').click();
                            checks.push(["Add puts a way's chords in after the chord picked, a bar each, the first picked", progSketch().sections[0].bars.slice(1, 4).map(bar => bar[0]).join(" ") === "C D7 G" && progSketch().sections[0].bars.length === barsBeforeAdd + 3 && prog.at.bar === 1 ? [] : [progSketch().sections[0].bars.map(bar => bar[0]).join(" ")]]);
                            lastToastUndo();
                            checks.push(["and Undo takes them out", progSketch().sections[0].bars.length === barsBeforeAdd ? [] : [progSketch().sections[0].bars.length]]);
                            // 2.6.0: the Form panel pours the chords into a form, with Undo.
                            $("progSongButton").click();
                            $("progMenuForm").click();
                            checks.push(["2.6.0: Form… shows the song's form and the forms to pour it into", !$("progFormPanel").hidden && $("progSongMenu").hidden && $("progFormNow").querySelectorAll(".prog-form-block").length === 1 && $("progForms").querySelectorAll("[data-form]").length === MaestroPrompts.FORMS.length ? [] : [$("progFormPanel").hidden, $("progForms").children.length]]);
                            $("progForms").querySelector('[data-form="aaba32"]').click();
                            const formed = progSketch().sections.map(section => `${section.name}${section.repeat}:${section.bars.length}`).join(" ");
                            checks.push(["a form chosen: its sections and bars, the chords first, the panel closed", formed === "A2:8 B1:8 A1:8" && progSketch().sections[0].bars[0][0] === "Cmaj7" && progSketch().sections[2].bars[1][0] === "A7" && $("progFormPanel").hidden ? [] : [formed]]);
                            lastToastUndo();
                            checks.push(["and Undo puts the song back", progSketch().sections.length === 1 && progSketch().sections[0].bars.length === barsBeforeAdd ? [] : [progSketch().sections.length]]);
                            // 2.6.0: a Quick Notes link to a saved song, Ctrl + clicked in a note, opens it.
                            const songsBeforeLink = prog.songs;
                            const linkedChart = MaestroHarmony.cleanChart({ title: "Linked song", root: "G", scale: "major", beats: 4, sections: [{ name: "", repeat: 1, bars: [["G"], ["D"]] }] });
                            receiveCharts([{ id: "smokelink01", text: MaestroHarmony.chartText(linkedChart) }]);
                            const previewBefore = [...$("notePreview").childNodes];
                            renderMarkdown($("notePreview"), ASCSNotes.parseMarkdown(`See ${ASCSNotes.musicLinkText("Linked song", { kind: "song", id: "smokelink01" })}.`));
                            const musicLinkNode = $("notePreview").querySelector(".md-link.is-music");
                            checks.push(["2.6.0: a link to a song in a note is drawn as one", musicLinkNode?.textContent === "Linked song" && musicLinkNode.title.includes("Ctrl + click") ? [] : [$("notePreview").innerHTML]]);
                            musicLinkNode?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
                            checks.push(["Ctrl + click opens the Conservatory on the song", $("conservatory").classList.contains("active") && consSections.current() === "progressions" && prog.settings.song === "smokelink01" && progSketch().title === "Linked song" ? [] : [consSections.current(), prog.settings.song]]);
                            lastToastUndo();
                            $("notePreview").replaceChildren(...previewBefore);
                            openMusicLink("maestro:song/gone0000gone");
                            checks.push(["a song no longer saved is said to be gone", /isn't saved any more/.test($("toast").textContent) && musicLinks.pending === null ? [] : [$("toast").textContent]]);
                            prog.songs = songsBeforeLink;
                            $("progSide").querySelector('[data-side="keys"]').click();
                            if (!keysState.toward) keyCell("1-major").click();
                            $("progPivots").querySelector('[data-name="Em"]').click();
                            const pivotPut = progSketch().sections[0].bars[0][0] === "Em";
                            $("progTowardKey").click();
                            checks.push(["a shared chord goes in the chord's place; Make it the key changes the key, not the chords", pivotPut && progSketch().root === "G" && progSketch().scale === "major" && progSketch().sections[0].bars[1][0] === "A7" && keysState.toward === null && keyCell("1-major").classList.contains("is-tonic") ? [] : [pivotPut, progSketch().root]]);
                            lastToastUndo();
                            checks.push(["Undo puts the key back", progSketch().root === "C" ? [] : [progSketch().root]]);
                            $("progKeyFits").querySelector('[data-root="A"][data-scale="minor"]').click();
                            checks.push(["a key the chords fit is made the key with a click", progSketch().root === "A" && progSketch().scale === "minor" && keyCell("0-minor").classList.contains("is-tonic") ? [] : [progSketch().root, progSketch().scale]]);
                            prog.settings.sketch = keysBefore.sketch;
                            prog.settings.sevenths = keysBefore.sevenths;
                            prog.at = keysBefore.at;
                            renderProgressions();
                            $("progSide").querySelector('[data-side="chord"]').click();
                            checks.push(["a stored sketch that's malformed falls back to the first", parseProgression('{"sketch":{"title":"x","root":"H"}}').sketch.root === "C" && parseProgression("junk").show === "symbols" ? [] : ["kept"]]);
                            // On a keyboard, a chord is played, its notes together.
                            chooseConsInstrument("keyboard");
                            consSections.show("finder");
                            const findText = $("consPickStrum").textContent;
                            consSections.show("chords");
                            checks.push(["on a keyboard, Strum is Play", findText === "Play" && $("consChordStrum").textContent === "Play" && consChordSpread() === 0 ? [] : [findText, $("consChordStrum").textContent]]);
                            chooseConsInstrument("guitar");
                            consSections.show("finder");
                            checks.push(["and on strings, Strum", $("consPickStrum").textContent === "Strum" ? [] : [$("consPickStrum").textContent]]);
                        } finally {
                            if (metro.running) stopMetronome();
                            if (savedProg === null) localStorage.removeItem(PROG_KEY); else localStorage.setItem(PROG_KEY, savedProg);
                            prog.settings = parseProgression(savedProg);
                            prog.at = { section: 0, bar: 0, slot: 0 };
                            prog.scale = null;
                            rebuildProgTimeline();
                        }
                        // 2.5.0: Counterpoint. An exercise written on the staff, by the keys
                        // and on the neck, checked as it's written; kept, exported and
                        // printed through AHK; heard; a new one started.
                        const savedCp = localStorage.getItem(CP_KEY);
                        const realPrint = window.print;
                        try {
                            consSections.show("counterpoint");
                            checks.push(["Counterpoint asks AHK for the exercises, and Save waits for them", sent.has("GetExercises") && $("cpSave").disabled ? [] : [sent.has("GetExercises")]]);
                            receiveExercises([]);
                            setCpExercise(MaestroCounterpoint.speciesExercise({ species: 1, cantus: MaestroCounterpoint.fuxNotes(MaestroCounterpoint.FUX[0]), cantusBelow: true, mode: "dorian", final: "D", title: "Smoke species" }));
                            const cpNotes = (voice = 0) => MaestroNotation.voicesOf(cp.exercise.score)[voice].notes.map(note => (note.p ? MaestroNotation.pitchName(note.p) : "-")).join(" ");
                            checks.push(["a species exercise: two staves, the cantus given", $("cpStaff").querySelectorAll(".staff-line").length % 10 === 0 && $("cpStaff").querySelectorAll(".cp-ring.is-given").length === 11 ? [] : [$("cpStaff").querySelectorAll(".cp-ring.is-given").length]]);
                            checks.push(["the checker says what's left", $("cpProblems").textContent.includes("11 notes still to write") && $("cpCount").textContent === "Nothing wrong so far" ? [] : [$("cpProblems").textContent]]);
                            // A pointer event on the staff at a moment, a staff and a step; true
                            // unless the page cancelled it.
                            const staffEvent = (type, time, staff, step, extra = {}) => {
                                const svg = $("cpStaff").querySelector("svg");
                                const box = svg.getBoundingClientRect();
                                const column = cp.drawn.columns.find(each => each.time === time);
                                const system = cp.drawn.systems[column.system];
                                const clef = cp.exercise.score.staves[staff].clef;
                                const y = system.staffY[staff] - (step - (clef === "treble" ? 30 : 18)) * cp.drawn.space / 2;
                                const init = { bubbles: true, cancelable: true, button: type === "contextmenu" ? 2 : 0, clientX: box.left + (column.x + 0.75 * cp.drawn.space) / cp.drawn.width * box.width, clientY: box.top + y / cp.drawn.height * box.height, ...extra };
                                return $("cpStaff").dispatchEvent(type === "wheel" ? new WheelEvent(type, init) : new MouseEvent(type, init));
                            };
                            const staffClick = (time, staff, step) => staffEvent("click", time, staff, step);
                            staffClick(0, 0, 26);
                            checks.push(["a click on the staff writes the note there", cpNotes().startsWith("A3 -") && cp.at.index === 0 ? [] : [cpNotes()]]);
                            const key = (name, shift = false, ctrl = false) => $("cpStaff").dispatchEvent(new KeyboardEvent("keydown", { key: name, shiftKey: shift, ctrlKey: ctrl, bubbles: true, cancelable: true }));
                            // A right-click clears a note, with no menu; Ctrl+Z and Ctrl+Y take it back and forth.
                            const menuShown = staffEvent("contextmenu", 0, 0, 27);
                            checks.push(["a right-click on a note clears it, and no menu opens", cpNotes().startsWith("- -") && !menuShown ? [] : [cpNotes(), menuShown]]);
                            key("z", false, true);
                            checks.push(["Ctrl+Z brings it back, selected", cpNotes().startsWith("A3 -") && cp.at.voice === 0 && cp.at.index === 0 ? [] : [cpNotes()]]);
                            key("y", false, true);
                            checks.push(["Ctrl+Y clears it again", cpNotes().startsWith("- -") ? [] : [cpNotes()]]);
                            key("z", false, true);
                            key("Z", true, true);
                            checks.push(["and Ctrl+Shift+Z redoes too", cpNotes().startsWith("- -") ? [] : [cpNotes()]]);
                            key("z", false, true);
                            const cantusBefore = cpNotes(1), historyBefore = cp.history.past.length;
                            staffEvent("contextmenu", 0, 1, 15);
                            staffEvent("contextmenu", 8, 0, 26);
                            checks.push(["a right-click on the cantus or an empty beat changes nothing", cpNotes(1) === cantusBefore && cpNotes().startsWith("A3 -") && cp.history.past.length === historyBefore ? [] : [cpNotes(1), cpNotes()]]);
                            cp.at = { voice: 0, index: 0 };
                            renderCounterpoint();
                            // The pointer: a faint note where a click would write, gone when it leaves.
                            staffEvent("pointermove", 8, 0, 28);
                            const ghostPending = cpGhost.frame !== 0;
                            // The frame it waits for, drawn now (headless Edge may hold frames back).
                            cancelAnimationFrame(cpGhost.frame);
                            drawCpGhost();
                            checks.push(["the pointer's note waits for the next frame", ghostPending ? [] : ["drawn at once"]]);
                            const ghost = $("cpStaff").querySelector(".cp-ghost .staff-glyph");
                            const ghostColumn = cp.drawn.columns.find(each => each.time === 8);
                            const ghostY = cp.drawn.systems[ghostColumn.system].staffY[0] - (28 - 30) * cp.drawn.space / 2 + MaestroNotation.LIFT;
                            checks.push(["the pointer shows a faint note where a click would write", ghost && Math.abs(Number(ghost.getAttribute("y")) - ghostY) < 0.01 && Number(ghost.getAttribute("x")) === ghostColumn.x && cpNotes().startsWith("A3 -") ? [] : [ghost?.getAttribute("y"), ghostY]]);
                            $("cpStaff").dispatchEvent(new MouseEvent("pointerleave"));
                            checks.push(["and it's gone when the pointer leaves", !$("cpStaff").querySelector(".cp-ghost") ? [] : ["still there"]]);
                            // The wheel on the selected note: a step, or with Shift a half step.
                            const wheel = (time, step, deltaY, shift = false) => staffEvent("wheel", time, 0, step, shift ? { deltaX: deltaY, shiftKey: true } : { deltaY });
                            const turned = !wheel(0, 26, -100);
                            checks.push(["the wheel up on the selected note moves it a step", turned && cpNotes().startsWith("B3 -") ? [] : [turned, cpNotes()]]);
                            wheel(0, 27, 100);
                            checks.push(["and down, back", cpNotes().startsWith("A3 -") ? [] : [cpNotes()]]);
                            wheel(0, 26, -100, true);
                            checks.push(["with Shift, a half step", cpNotes().startsWith(`A${String.fromCodePoint(0x266F)}3 -`) ? [] : [cpNotes()]]);
                            wheel(0, 26, 100, true);
                            wheel(0, 26, -40);
                            checks.push(["a trackpad's small turn waits for a notch's worth", cpNotes().startsWith("A3 -") ? [] : [cpNotes()]]);
                            wheel(0, 26, 40);
                            checks.push(["the staff is at least a line high", $("cpStaff").clientHeight + 1 >= cpLineEnd(0) - cpLineTop(0) ? [] : [$("cpStaff").clientHeight, cpLineEnd(0) - cpLineTop(0)]]);
                            // Lines of staves: with room for all, the wheel scrolls the page; on a
                            // narrow, short staff, the wheel and Page Down turn to the next line.
                            const sizeStaff = style => {
                                Object.assign($("cpStaff").style, style);
                                cp.lines.top = 0;
                                drawCpStaff();
                                fitCpLines();
                            };
                            sizeStaff({ flex: "none", width: "", height: "2000px" });
                            const scrolled = wheel(8, 26, 100);
                            checks.push(["with every line shown, at full size, the wheel on an empty beat scrolls the page", scrolled && cp.scale === CP_SCALE && $("cpLines").hidden && cp.lines.clip === 0 && cpNotes().startsWith("A3 -") ? [] : [scrolled, cp.scale, $("cpLines").textContent, cpNotes()]]);
                            sizeStaff({ flex: "none", width: "560px", height: "10px" });
                            const lineCount = cp.drawn.systems.length;
                            checks.push(["a short staff draws smaller and shows one whole line, and says so", lineCount > 1 && Math.abs(cp.scale - CP_MIN_SCALE) < 0.01 && !$("cpLines").hidden && $("cpLines").textContent === `Line 1 of ${lineCount}` && cp.lines.clip > 0 ? [] : [lineCount, cp.scale, $("cpLines").textContent, cp.lines.clip]]);
                            const turnedLine = !wheel(8, 26, 100);
                            checks.push(["the wheel off the selected note turns to the next line", turnedLine && cp.lines.top === 1 && $("cpLines").textContent === `Line 2 of ${lineCount}` && cpNotes().startsWith("A3 -") ? [] : [turnedLine, cp.lines.top]]);
                            key("PageUp");
                            checks.push(["Page Up turns back", cp.lines.top === 0 ? [] : [cp.lines.top]]);
                            const firstOnLine2 = MaestroNotation.timed(cpVoices()[0].notes).findIndex(entry => cp.drawn.columns.find(each => each.time === entry.onset)?.system === 1);
                            cp.at = { voice: 0, index: firstOnLine2 - 1 };
                            key("ArrowRight");
                            checks.push(["the selection moving to the next line turns to it", cp.lines.top === 1 ? [] : [cp.lines.top, firstOnLine2]]);
                            cp.at = { voice: 0, index: 0 };
                            sizeStaff({ flex: "none", width: "", height: "2000px" });
                            renderCounterpoint();
                            checks.push(["and with room again, every line shows from the first", cp.lines.top === 0 && $("cpLines").hidden && cp.lines.clip === 0 ? [] : [cp.lines.top, $("cpLines").textContent]]);
                            sizeStaff({ flex: "", width: "", height: "" });
                            // Keys and mouse: listed under the staff on request, and remembered.
                            checks.push(["the staff's tooltip lists its keys; no list under it", $("cpStaff").title.includes("A to G: write that letter") && !$("cpKeys") && !$("cpHint") ? [] : [$("cpStaff").title]]);
                            // 2.7.1: the neck is one setting for the whole page, its switch on every tab.
                            checks.push(["the neck's switch is offered, pressed", !$("consNeckToggle").hidden && !$("consNeckToggle").disabled && $("consNeckToggle").getAttribute("aria-pressed") === "true" ? [] : ["not offered"]]);
                            $("consNeckToggle").click();
                            checks.push(["the neck hides, and that's kept", $("consNeckModule").hidden && cons.settings.neckShown === false && $("consNeckToggle").getAttribute("aria-pressed") === "false" && JSON.parse(localStorage.getItem(CONS_KEY)).neckShown === false ? [] : [cons.settings.neckShown]]);
                            const neckOn = tab => {
                                consSections.show(tab);
                                return { shown: !$("consNeckModule").hidden, still: $("consNeckToggle").disabled, pressed: $("consNeckToggle").getAttribute("aria-pressed") };
                            };
                            const neckTabs = Object.fromEntries(["progressions", "rhythm", "tuning", "scales", "chords", "finder"].map(tab => [tab, neckOn(tab)]));
                            consSections.show("counterpoint");
                            const hiddenOn = ["progressions", "tuning"].every(tab => !neckTabs[tab].shown && !neckTabs[tab].still && neckTabs[tab].pressed === "false");
                            const neededOn = ["scales", "chords", "finder"].every(tab => neckTabs[tab].shown && neckTabs[tab].still && neckTabs[tab].pressed === "true");
                            const rhythmOff = !neckTabs.rhythm.shown && neckTabs.rhythm.still;
                            checks.push(["hidden on every tab, but where the tab works on it: Scales, Chords and the Finder keep it, their switch pressed and still; Rhythm never has it", hiddenOn && neededOn && rhythmOff && $("consNeckModule").hidden ? [] : [JSON.stringify(neckTabs)]]);
                            $("consNeckToggle").click();
                            checks.push(["and it shows again, everywhere", !$("consNeckModule").hidden && cons.settings.neckShown === true && $("consNeck").children.length > 0 ? [] : [cons.settings.neckShown]]);
                            // And the Quiz's module keeps its place from kind to kind, with the neck shown.
                            consSections.show("quiz");
                            const kindBefore = cons.settings.quizKind;
                            const quizTop = kind => {
                                document.querySelector(`#consQuizKind [data-quiz="${kind}"]`).click();
                                const module = $("consQuizPanel").querySelector(".cons-quiz-module").getBoundingClientRect();
                                return Math.round(module.top);
                            };
                            const quizTops = ["note", "interval", "quality", "progression", "melody", "rhythm", "reading"].map(quizTop);
                            document.querySelector(`#consQuizKind [data-quiz="${kindBefore}"]`).click();
                            consSections.show("counterpoint");
                            checks.push(["the Quiz's module stays put from kind to kind, the neck there for each", quizTops.every(each => each === quizTops[0]) ? [] : [quizTops.join(" ")]]);
                            key("ArrowRight");
                            key("d");
                            checks.push(["Right goes to the next note, a letter writes the nearest", cpNotes().startsWith("A3 D4 -") ? [] : [cpNotes()]]);
                            key("ArrowUp");
                            key("ArrowDown", true);
                            checks.push(["Up moves it a step, Shift and Down a half step", cpNotes().startsWith(`A3 E${String.fromCodePoint(0x266D)}4`) ? [] : [cpNotes()]]);
                            key("Delete");
                            checks.push(["Delete clears it", cpNotes().startsWith("A3 - ") ? [] : [cpNotes()]]);
                            consNeckModes.counterpoint.click(62);
                            checks.push(["a note on the neck is written into the selected one, and marked there", cpNotes().startsWith("A3 D4 ") && [...$("consNeck").querySelectorAll(".cons-dot")].some(dot => Number(dot.dataset.midi) === 62) ? [] : [cpNotes()]]);
                            for (const letter of ["C", "D", "B", "A", "C", "E", "D", "C"]) {
                                key("ArrowRight");
                                key(letter.toLowerCase());
                            }
                            key("ArrowUp", true);
                            key("ArrowRight");
                            key("d");
                            checks.push(["a good first species, written by the keys, has no problems", cpNotes() === `A3 D4 C4 D4 B3 A3 C4 E4 D4 C${String.fromCodePoint(0x266F)}4 D4` && $("cpCount").textContent === "No problems" && !$("cpProblems").children.length ? [] : [cpNotes(), $("cpCount").textContent]]);
                            checks.push(["the intervals are written beneath, the row named", [...$("cpStaff").querySelectorAll(".cp-beneath:not(.cp-row-label)")].map(text => text.textContent).join(" ") === "5 6 6 8 3 3 3 6 6 6 8" && $("cpStaff").querySelector(".cp-row-label")?.textContent === "Intervals" ? [] : [[...$("cpStaff").querySelectorAll(".cp-beneath")].map(text => text.textContent).join(" ")]]);
                            // Clear exercise: the counterpoint emptied, the cantus kept, with Undo.
                            const writtenCp = cpNotes(), cantusCp = cpNotes(1);
                            toggleConsPopover("cpMenu", true);
                            $("cpClearAll").click();
                            checks.push(["Clear exercise, in the title menu, empties the counterpoint and keeps the cantus", cpNotes() === Array(11).fill("-").join(" ") && cpNotes(1) === cantusCp && $("cpClearAll").disabled && cp.at.index === 0 && $("cpMenu").hidden ? [] : [cpNotes(), $("cpClearAll").disabled, $("cpMenu").hidden]]);
                            $("toast").querySelector(".toast-action")?.click();
                            checks.push(["and its Undo brings it all back", cpNotes() === writtenCp && !$("cpClearAll").disabled ? [] : [cpNotes()]]);
                            // 2.6.0: a model answer in place of what's written, with Undo.
                            $("cpModel").click();
                            const modelErrors = MaestroCounterpoint.check(cp.exercise).filter(each => each.level === "error").length;
                            checks.push(["2.6.0: Model answer writes the counterpoint, the checker finding no error, the cantus kept", !$("cpModel").hidden && !cpNotes().includes("-") && cpNotes(1) === cantusCp && modelErrors === 0 ? [] : [cpNotes(), modelErrors, $("cpCount").textContent]]);
                            $("toast").querySelector(".toast-action")?.click();
                            checks.push(["its Undo brings back what was written", cpNotes() === writtenCp ? [] : [cpNotes()]]);
                            cp.at = { voice: 0, index: 1 };
                            key("c");
                            checks.push(["parallel fifths are named, and ringed", $("cpProblems").textContent.includes("Parallel fifths") && $("cpStaff").querySelectorAll(".cp-ring.is-error").length >= 2 ? [] : [$("cpProblems").textContent]]);
                            cp.at = { voice: 0, index: 9 };
                            renderCounterpoint();
                            $("cpProblems").querySelector("[data-voice]").click();
                            checks.push(["a problem clicked selects its note", cp.at.index === 0 && document.activeElement === $("cpStaff") ? [] : [cp.at.index]]);
                            cp.at = { voice: 0, index: 1 };
                            key("d");
                            // Saved through AHK, with its id; deleted, with Undo.
                            const cpFrom = messages.length;
                            $("cpSave").click();
                            const saveMessage = messages.slice(cpFrom).find(message => message.startsWith("SaveExercise\n"))?.split("\n") ?? [];
                            checks.push(["Save sends the exercise to AHK under a new id", /^[a-z0-9]{12}$/.test(saveMessage[1] ?? "") && saveMessage[2] === MaestroCounterpoint.HEADER && saveMessage[3] === "Smoke species" ? [] : [saveMessage.slice(0, 4).join(" | ")]]);
                            exerciseSaved(saveMessage[1]);
                            checks.push(["and once AHK has it, it reads Saved", $("cpSave").textContent === "Saved" && $("cpSave").disabled && cp.saved.length === 1 ? [] : [$("cpSave").textContent]]);
                            $("cpTitleButton").click();
                            checks.push(["the title opens the menu, the exercise listed", !$("cpMenu").hidden && $("cpExercises").querySelector("[aria-current]")?.textContent.startsWith("Smoke species") ? [] : [$("cpExercises").textContent]]);
                            const deleteFrom = messages.length;
                            $("cpExercises").querySelector("[data-exercise-delete]").click();
                            checks.push(["delete asks AHK, by its id", messages.slice(deleteFrom).includes(`DeleteExercise\n${saveMessage[1]}`) ? [] : [messages.slice(deleteFrom).join(" | ")]]);
                            exerciseDeleted(saveMessage[1]);
                            const undoFrom = messages.length;
                            $("toast").querySelector(".toast-action")?.click();
                            checks.push(["Undo saves it again", messages.slice(undoFrom).some(message => message.startsWith(`SaveExercise\n${saveMessage[1]}\n`)) ? [] : ["not saved"]]);
                            // MusicXML into data\exports, then Show in folder.
                            const exportFrom = messages.length;
                            $("cpExport").click();
                            const exportMessage = messages.slice(exportFrom).find(message => message.startsWith("ExportMusicXml\n")) ?? "";
                            const xml = exportMessage.split("\n").slice(2).join("\n");
                            checks.push(["Export MusicXML sends the title and the score, never a path", exportMessage.split("\n")[1] === "Smoke species" && xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="no"?>') && !new DOMParser().parseFromString(xml, "application/xml").querySelector("parsererror") ? [] : [exportMessage.slice(0, 80)]]);
                            exerciseExported("Smoke species.musicxml");
                            const showFrom = messages.length;
                            checks.push(["AHK's answer names the file", $("toast").textContent.includes("data\\exports\\Smoke species.musicxml") ? [] : [$("toast").textContent]]);
                            $("toast").querySelector(".toast-action")?.click();
                            checks.push(["and Show in folder asks for Explorer, sending nothing", messages.slice(showFrom).some(message => message.split("\n")[0] === "ShowExport") ? [] : [messages.slice(showFrom).join(" | ")]]);
                            // Printed alone, through the print dialog.
                            const printedCp = [];
                            window.print = () => printedCp.push($("printChart").cloneNode(true));
                            $("cpPrint").click();
                            checks.push(["Print draws the exercise for the page", printedCp[0]?.querySelector("h1")?.textContent === "Smoke species" && printedCp[0]?.querySelector(".print-exercise svg .staff-line") ? [] : ["nothing printed"]]);
                            window.dispatchEvent(new Event("afterprint"));
                            checks.push(["and the screen's staff is drawn again", $("cpStaff").querySelector("svg") !== null ? [] : ["gone"]]);
                            // Heard: Play books the notes and turns into Stop; a voice can be left out.
                            // Several voices heard: each filled, no marker; one alone: the marker.
                            checks.push(["voices heard together each show filled, with no marker", $("cpVoices").querySelectorAll('[aria-pressed="true"]').length > 1 && !$("cpVoices").classList.contains("has-marker") ? [] : [$("cpVoices").querySelectorAll('[aria-pressed="true"]').length]]);
                            $("cpVoices").querySelector('[data-hear="1"]').click();
                            checks.push(["a voice left out isn't heard", cp.hear[1] === false && $("cpVoices").querySelector('[data-hear="1"]').getAttribute("aria-pressed") === "false" ? [] : [cp.hear.join()]]);
                            $("cpVoices").querySelector('[data-hear="0"]').dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
                            checks.push(["a double-click hears one voice alone", cp.hear.join() === "true,false,false,false" ? [] : [cp.hear.join()]]);
                            await pause(0);
                            checks.push(["and one voice alone has the marker", $("cpVoices").classList.contains("has-marker") && $("cpVoices").style.getPropertyValue("--marker-x") === `${$("cpVoices").querySelector('[data-hear="0"]').offsetLeft}px` ? [] : ["no marker"]]);
                            await playCpExercise();
                            checks.push(["Play plays, and turns into Stop", cp.playing !== null && $("cpPlay").textContent.includes("Stop") ? [] : [cp.playing]]);
                            stopCpPlaying();
                            checks.push(["Stop stops", cp.playing === null && $("cpPlay").textContent.includes("Play") ? [] : ["playing"]]);
                            cp.hear = [true, true, true, true];
                            // A new exercise: four parts over a figured bass.
                            toggleConsPopover("cpMenu", true);
                            $("cpMenuNew").click();
                            checks.push(["New exercise opens in the menu's place", !$("cpNewPanel").hidden && $("cpMenu").hidden ? [] : ["closed"]]);
                            $("cpNewKind").querySelector('[data-kind="fourpart"]').click();
                            $("cpNewForm").querySelector('[data-form="figured"]').click();
                            $("cpNewStart").click();
                            checks.push(["Start makes a figured-bass exercise, the bass given", cp.exercise.kind === "fourpart" && cp.exercise.form === "figured" && $("cpNewPanel").hidden && $("cpWriting").querySelector('[data-writing="3"]').disabled && !$("cpWritingField").hidden ? [] : [cp.exercise.kind]]);
                            // Its progression is drawn at random; root-position triads have no figures, so
                            // every figure the exercise has must be drawn, however many that is.
                            const figuresWanted = MaestroCounterpoint.figuredBass(cp.exercise).flat().filter(Boolean).length;
                            checks.push(["its figures under the bass", $("cpStaff").querySelectorAll(".cp-figure").length === figuresWanted ? [] : [$("cpStaff").querySelectorAll(".cp-figure").length, figuresWanted]]);
                            key("B", true);
                            checks.push(["the given bass can't be chosen to write", cp.at.voice !== 3 ? [] : ["chosen"]]);
                            const tenorNotes = cpNotes(2);
                            key("T", true);
                            checks.push(["Shift+T chooses the tenor, and writes nothing", cp.at.voice === 2 && $("cpWriting").querySelector('[aria-pressed="true"]')?.dataset.writing === "2" && cpNotes(2) === tenorNotes ? [] : [cp.at.voice]]);
                            key("3");
                            checks.push(["3 no longer chooses a voice", cp.at.voice === 2 ? [] : [cp.at.voice]]);
                            const ringY = () => $("cpStaff").querySelector(".cp-ring.is-selected")?.getAttribute("cy");
                            key("S", true);
                            const sopranoRing = ringY();
                            key("A", true);
                            checks.push(["the ring moves to the voice chosen, around its rest when it's still to write", cp.at.voice === 1 && sopranoRing && ringY() && ringY() !== sopranoRing && $("cpWriting").querySelector('[aria-pressed="true"]')?.dataset.writing === "1" ? [] : [sopranoRing, ringY(), cp.at.voice]]);
                            // A cantus firmus of one's own: made, written, checked, kept, and then sung against.
                            toggleConsPopover("cpMenu", true);
                            $("cpMenuNew").click();
                            $("cpNewKind").querySelector('[data-kind="cantus"]').click();
                            checks.push(["Cantus firmus offers a mode, a final, a clef and a length", !$("cpNewCantusFields").hidden && $("cpNewSpeciesFields").hidden && $("cpNewMode").options.length === 8 && $("cpNewLength").options[0].value === "8" ? [] : [$("cpNewMode").options.length]]);
                            $("cpNewMode").value = "phrygian";
                            $("cpNewMode").dispatchEvent(new Event("change"));
                            $("cpNewFinal").value = "E";
                            $("cpNewFinal").dispatchEvent(new Event("change"));
                            $("cpNewClef").querySelector('[data-clef="bass"]').click();
                            $("cpNewLength").value = "9";
                            $("cpNewLength").dispatchEvent(new Event("change"));
                            $("cpNewStart").click();
                            checks.push(["Start makes a blank cantus in E phrygian, nine notes in the bass", cp.exercise.kind === "cantus" && $("cpFacts").textContent === "Cantus firmus · E phrygian · 9 notes" && cp.exercise.score.staves[0].clef === "bass" && $("cpWritingField").hidden && $("cpProblems").textContent.includes("9 notes still to write") ? [] : [$("cpFacts").textContent]]);
                            for (const [at, letter] of ["e", "g", "f", "a", "c", "b", "g", "f", "e"].entries()) {
                                if (at) key("ArrowRight");
                                key(letter);
                            }
                            checks.push(["written by the keys, a sound cantus has no problems", cpNotes() === "E3 G3 F3 A3 C4 B3 G3 F3 E3" && $("cpCount").textContent === "No problems" ? [] : [cpNotes(), $("cpCount").textContent, $("cpProblems").textContent]]);
                            checks.push(["its degrees are written beneath, the row named", [...$("cpStaff").querySelectorAll(".cp-beneath:not(.cp-row-label)")].map(text => text.textContent).join(" ") === "1 3 2 4 6 5 3 2 1" && $("cpStaff").querySelector(".cp-row-label")?.textContent === "Degrees" ? [] : [[...$("cpStaff").querySelectorAll(".cp-beneath")].map(text => text.textContent).join(" ")]]);
                            cp.at = { voice: 0, index: 7 };
                            key("d");
                            checks.push(["approached from below in phrygian, the close is named", $("cpProblems").textContent.includes("In Phrygian, reach the final from above") ? [] : [$("cpProblems").textContent]]);
                            key("z", false, true);
                            const cantusFrom = messages.length;
                            $("cpSave").click();
                            const cantusSave = messages.slice(cantusFrom).find(message => message.startsWith("SaveExercise\n"))?.split("\n") ?? [];
                            checks.push(["a cantus is saved like any exercise", cantusSave[4] === "kind\tcantus\t-\t-" && cantusSave[5] === "key\t0\tphrygian" ? [] : [cantusSave.slice(2, 6).join(" | ")]]);
                            exerciseSaved(cantusSave[1]);
                            toggleConsPopover("cpMenu", true);
                            $("cpMenuNew").click();
                            $("cpNewKind").querySelector('[data-kind="species"]').click();
                            const ownOption = $("cpNewCantus").querySelector(`option[value="own:${cantusSave[1]}"]`);
                            checks.push(["it's offered as a cantus, under Yours", ownOption && !ownOption.disabled && ownOption.parentElement.label === "Yours" ? [] : [$("cpNewCantus").textContent]]);
                            $("cpNewCantus").value = `own:${cantusSave[1]}`;
                            $("cpNewCantus").dispatchEvent(new Event("change"));
                            $("cpNewSpecies").querySelector('[data-species="1"]').click();
                            $("cpNewPlace").querySelector('[data-below="true"]').click();
                            $("cpNewStart").click();
                            checks.push(["and a species exercise is written against it", cp.exercise.kind === "species" && cp.exercise.title === "First species, A cantus in E phrygian" && cp.exercise.score.key.mode === "phrygian" && cpNotes(1).split(" ").map(text => text.replace(/\d/, "")).join(" ") === "E G F A C B G F E" ? [] : [cp.exercise.title, cpNotes(1)]]);
                            // 2.7.0: a staff's clef, clicked, chosen from a menu beside it; the notes stay; Ctrl+Z takes it back.
                            const clefSpots = () => [...$("cpStaff").querySelectorAll(".cp-clef-spot")];
                            const clefsNow = () => cp.exercise.score.staves.map(staff => staff.clef).join();
                            const notesBefore = cpNotes(0) + " / " + cpNotes(1);
                            checks.push(["2.7.0: each staff's clef a spot to click, the cantus on its own staff", clefSpots().length === cp.drawn.systems.length * 2 && clefsNow() === "treble,bass" ? [] : [clefSpots().length, clefsNow()]]);
                            clefSpots()[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
                            checks.push(["a click opens the clef menu for that staff, its clef chosen", !$("cpClefMenu").hidden && $("cpClefTitle").textContent === "Clef of the upper staff" && $("cpClefs").querySelector('[aria-pressed="true"]')?.dataset.staffClef === "treble" && [...$("cpClefs").children].map(button => button.textContent).join() === "Treble,Alto,Tenor,Bass" ? [] : [$("cpClefTitle").textContent]]);
                            $("cpClefs").querySelector('[data-staff-clef="alto"]').click();
                            checks.push(["Alto writes the upper staff on an alto clef, the notes as they were, and the menu closes", clefsNow() === "alto,bass" && cpNotes(0) + " / " + cpNotes(1) === notesBefore && $("cpClefMenu").hidden && [...$("cpStaff").querySelectorAll("svg .staff-glyph")].some(node => node.textContent === MaestroNotation.GLYPHS.alto) ? [] : [clefsNow()]]);
                            clefSpots()[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
                            $("cpClefMenu").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
                            checks.push(["Escape closes the menu, nothing changed", $("cpClefMenu").hidden && clefsNow() === "alto,bass" ? [] : [clefsNow()]]);
                            undoCp();
                            checks.push(["and Undo puts the treble clef back", clefsNow() === "treble,bass" ? [] : [clefsNow()]]);
                            // A phrase of chant as the cantus.
                            toggleConsPopover("cpMenu", true);
                            $("cpMenuNew").click();
                            const chantGroup = [...$("cpNewCantus").querySelectorAll("optgroup")].find(group => group.label === "Chant");
                            checks.push(["four phrases of chant are offered, each with its page", chantGroup?.children.length === 4 && chantGroup.textContent.includes("Liber Usualis, p. 256") ? [] : [chantGroup?.textContent]]);
                            $("cpNewCantus").value = "chant-lucis-creator";
                            $("cpNewCantus").dispatchEvent(new Event("change"));
                            const newPanel = $("cpNewPanel").getBoundingClientRect();
                            const outside = [...$("cpNewPanel").querySelectorAll("select, .cal-modes, .cons-choice-label, .metro-field > span")].filter(node => node.getClientRects().length && node.getBoundingClientRect().right > newPanel.right - 8);
                            checks.push(["New Exercise keeps every field within its panel, each label on one line", !outside.length && [...$("cpNewPanel").querySelectorAll(".metro-field > span")].filter(node => node.getClientRects().length).every(node => node.getClientRects().length === 1 && node.getBoundingClientRect().height < 40) ? [] : outside.map(node => node.id || node.textContent)]);
                            $("cpNewStart").click();
                            checks.push(["a species exercise is written against Lucis Creator", cp.exercise.title === "First species, Lucis Creator optime" && cp.exercise.score.key.mode === "mixolydian" && cpNotes(1).split(" ").length === 14 ? [] : [cp.exercise.title, cpNotes(1)]]);
                            // 2.6.0: a cantus made to the rules (Start did nothing in 2.5.0).
                            toggleConsPopover("cpMenu", true);
                            $("cpMenuNew").click();
                            $("cpNewCantus").value = "made-minor";
                            $("cpNewCantus").dispatchEvent(new Event("change"));
                            $("cpNewStart").click();
                            checks.push(["2.6.0: a new cantus in a minor key, made to the rules", cp.exercise.kind === "species" && cp.exercise.score.key.mode === "minor" && / minor$/.test(cp.exercise.title) && !cpNotes(1).includes("-") ? [] : [cp.exercise.title]]);
                            // 2.6.0: a melody for B flat trumpet: written, developed, harmonized, shown as written.
                            toggleConsPopover("cpMenu", true);
                            $("cpMenuNew").click();
                            $("cpNewKind").querySelector('[data-kind="melody"]').click();
                            checks.push(["Melody offers a mode, a key, an instrument and bars", !$("cpNewCantusFields").hidden && $("cpNewFinalLabel").textContent === "Key" && !$("cpNewInstrumentField").hidden && !$("cpNewBarsField").hidden && $("cpNewClefField").hidden && $("cpNewLengthField").hidden ? [] : ["fields"]]);
                            $("cpNewMode").value = "major";
                            $("cpNewMode").dispatchEvent(new Event("change"));
                            $("cpNewFinal").value = "C";
                            $("cpNewFinal").dispatchEvent(new Event("change"));
                            $("cpNewInstrument").value = "trumpet";
                            $("cpNewInstrument").dispatchEvent(new Event("change"));
                            $("cpNewBars").value = "4";
                            $("cpNewBars").dispatchEvent(new Event("change"));
                            $("cpNewStart").click();
                            checks.push(["Start makes four empty bars for trumpet, the melody's tools shown", cp.exercise.kind === "melody" && $("cpFacts").textContent === "Melody · C major · Trumpet in B♭ · 4 bars" && !$("cpMelodyTools").hidden && !$("cpViewField").hidden && !$("cpLengthField").hidden && $("cpRhythmField").hidden && $("cpModel").hidden && cpNotes() === Array(16).fill("-").join(" ") ? [] : [$("cpFacts").textContent, cpNotes()]]);
                            for (const [at, letter] of ["c", "d", "e", "c"].entries()) {
                                if (at) key("ArrowRight");
                                key(letter);
                            }
                            cp.at = { voice: 0, index: 0 };
                            renderCounterpoint();
                            $("cpMotifHow").value = "up";
                            $("cpMotifHow").dispatchEvent(new Event("change"));
                            $("cpMotifWrite").click();
                            checks.push(["Write it after: the motif a step higher in bar 2, with Undo", cpNotes().split(" ").slice(4, 8).join(" ") === "D5 E5 F5 D5" && $("toast").textContent.includes("from bar 2") ? [] : [cpNotes()]]);
                            $("cpChords").querySelector('[data-chords="1"]').click();
                            const chordTexts = [...$("cpStaff").querySelectorAll(".cp-chord")].map(text => text.textContent);
                            checks.push(["Chords: one a bar under the notes, C then a chord holding D, E and F's strong notes", chordTexts[0] === "C" && chordTexts.length === 2 && ["Dm", "G", "B°"].includes(chordTexts[1]) && !$("cpChordsOpen").hidden ? [] : [chordTexts.join(" ")]]);
                            $("cpView").querySelector('[data-shown="written"]').click();
                            checks.push(["Written: the part a step up, read-only", cp.exercise.score.key.fifths === 0 && cpShownScore().key.fifths === 2 && cpReadOnly() && $("cpRhythmField").hidden && $("cpMotifWrite").disabled ? [] : [cpShownScore().key.fifths]]);
                            const readOnlyNotes = cpNotes();
                            key("g");
                            checks.push(["and nothing is written there", cpNotes() === readOnlyNotes && $("toast").textContent.includes("Choose Concert") ? [] : [cpNotes()]]);
                            $("cpView").querySelector('[data-shown="concert"]').click();
                            $("cpChordsOpen").click();
                            checks.push(["Open in Progressions: the chords as the sketch, in C major", consSections.current() === "progressions" && progSketch().root === "C" && progSketch().sections[0].bars.length === 4 && progSketch().sections[0].bars[0][0] === "C" ? [] : [consSections.current(), JSON.stringify(progSketch().sections[0].bars)]]);
                            $("toast").querySelector(".toast-action")?.click();
                            consSections.show("counterpoint");
                            cpMelody.chords = "off";
                            // 2.6.0: rhythm bar by bar and note by note.
                            const rhythmLine = () => MaestroNotation.voicesOf(cp.exercise.score)[0].notes.map(note => (note.p ? MaestroNotation.pitchName(note.p) : "-") + note.d + (note.dot ? "." : "") + (note.tie ? "~" : "")).join(" ");
                            const strip = bar => $("cpStaff").querySelectorAll(".cp-bar-strip")[bar];
                            cp.at = { voice: 0, index: 0 };
                            renderCounterpoint();
                            checks.push(["a strip above each bar, numbered", $("cpStaff").querySelectorAll(".cp-bar-strip").length === 4 && [...$("cpStaff").querySelectorAll(".cp-bar-number")].map(text => text.textContent).join() === "1,2,3,4" ? [] : [$("cpStaff").querySelectorAll(".cp-bar-strip").length]]);
                            strip(1).dispatchEvent(new MouseEvent("click", { bubbles: true }));
                            strip(2).dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
                            checks.push(["a click selects bar 2, Shift + click bars 2 to 3", cp.bars?.from === 1 && cp.bars.to === 2 && $("cpRhythmLabel").textContent === "Bars 2\u20133" && $("cpStaff").querySelectorAll(".cp-bar-strip.is-selected").length === 2 && cp.at.index === 4 ? [] : [JSON.stringify(cp.bars), $("cpRhythmLabel").textContent]]);
                            $("cpRhythms").querySelector('[data-rhythm="1"]').click();
                            checks.push(["a rhythm for both bars, each pitch kept where its note began", rhythmLine() === "C5q D5q E5q C5q D5h F5h -h -h -q -q -q -q" ? [] : [rhythmLine()]]);
                            key("c", false, true);
                            checks.push(["Ctrl+C copies the bars' rhythm", cp.copied?.length === 2 && $("toast").textContent.includes("bars 2\u20133") && !$("cpBarPaste").disabled ? [] : [JSON.stringify(cp.copied)]]);
                            strip(3).dispatchEvent(new MouseEvent("click", { bubbles: true }));
                            key("v", false, true);
                            checks.push(["Ctrl+V pastes it into bar 4, what's past the end left out", rhythmLine() === "C5q D5q E5q C5q D5h F5h -h -h -h -h" && cp.bars?.from === 3 ? [] : [rhythmLine()]]);
                            strip(1).dispatchEvent(new MouseEvent("click", { bubbles: true }));
                            key("Delete");
                            checks.push(["Delete with a bar selected empties it, its rhythm kept", rhythmLine() === "C5q D5q E5q C5q -h -h -h -h -h -h" ? [] : [rhythmLine()]]);
                            key("z", false, true);
                            key("Escape");
                            checks.push(["Undo brings it back; Esc goes back to the note, Length in place of the bar's tools", rhythmLine().startsWith("C5q D5q E5q C5q D5h F5h") && cp.bars === null && $("cpRhythmField").hidden && !$("cpLengthField").hidden ? [] : [rhythmLine(), JSON.stringify(cp.bars)]]);
                            cp.at = { voice: 0, index: 0 };
                            renderCounterpoint();
                            checks.push(["Length shows the note's, a sixty-fourth to a whole", !$("cpLengthField").hidden && $("cpLengths").querySelector('[data-length="q"]')?.getAttribute("aria-pressed") === "true" && $("cpLengths").querySelectorAll("[data-length]").length === 7 && $("cpLengths").querySelector("[data-tie]") ? [] : ["field"]]);
                            key("2");
                            const afterHalf = rhythmLine();
                            key(".");
                            const afterDot = rhythmLine();
                            key("8");
                            const afterEighth = rhythmLine();
                            checks.push(["2 makes it a half, . dots it, 8 an eighth, the time after it to write", afterHalf.startsWith("C5h E5q C5q D5h") && afterDot.startsWith("C5h. C5q D5h") && afterEighth.startsWith("C5e -e -h C5q D5h") ? [] : [afterHalf, afterDot, afterEighth]]);
                            // 2.6.0: a sixteenth on 6; a thirty-second and a sixty-fourth by button alone.
                            key("6");
                            const afterSixteenth = rhythmLine();
                            $("cpLengths").querySelector('[data-length="f"]').click();
                            const afterSixtyFourth = rhythmLine();
                            const flagShown = [...$("cpStaff").querySelectorAll("text")].some(node => node.textContent === MaestroNotation.GLYPHS.flagsUp[4] || node.textContent === MaestroNotation.GLYPHS.flagsDown[4]);
                            checks.push(["6 makes it a sixteenth, the sixty-fourth's button one, each gap the fewest lengths, its flag drawn", afterSixteenth.startsWith("C5s -s -e -h C5q") && afterSixtyFourth.startsWith("C5f -f -t -s -e -h C5q") && flagShown ? [] : [afterSixteenth, afterSixtyFourth, flagShown]]);
                            checks.push(["the thirty-second and sixty-fourth have no key", $("cpLengths").querySelector('[data-length="t"]').title === "A thirty-second note" && $("cpLengths").querySelector('[data-length="f"]').title === "A sixty-fourth note" && $("cpLengths").querySelector('[data-length="s"]').title === "A sixteenth note (6)" && $("cpLengths").querySelector("[data-dot]").disabled ? [] : ["titles"]]);
                            // The marker follows the choice when the buttons are made again; the dot keeps its own fill.
                            await pause(0);
                            const markerAt = group => group.classList.contains("has-marker") ? group.style.getPropertyValue("--marker-x") : "none";
                            const atSixtyFourth = markerAt($("cpLengths")) === `${$("cpLengths").querySelector('[data-length="f"]').offsetLeft}px`;
                            $("cpLengths").querySelector('[data-length="s"]').click();
                            key(".");
                            await pause(0);
                            const dotButton = $("cpLengths").querySelector("[data-dot]");
                            const dotFilled = getComputedStyle(dotButton).backgroundColor !== "rgba(0, 0, 0, 0)";
                            checks.push(["the purple marker moves to the length chosen, and a dotted note shows its length and its dot", atSixtyFourth && rhythmLine().startsWith("C5s. ") && markerAt($("cpLengths")) === `${$("cpLengths").querySelector('[data-length="s"]').offsetLeft}px` && dotButton.getAttribute("aria-pressed") === "true" && dotFilled ? [] : [atSixtyFourth, rhythmLine(), markerAt($("cpLengths")), dotFilled]]);
                            key("1");
                            checks.push(["1 makes it a whole", rhythmLine().startsWith("C5w D5h") ? [] : [rhythmLine()]]);
                            $("cpLengths").querySelector("[data-tie]").click();
                            checks.push(["Tie holds it into the next bar", rhythmLine().startsWith("C5w~ C5h D5") || rhythmLine().startsWith("C5w~ C5h F5") ? [] : [rhythmLine()]]);
                            cp.at = { voice: 0, index: 2 };
                            renderCounterpoint();
                            key("1");
                            checks.push(["a length that would cross the bar line is refused, and says why", $("toast").textContent.includes("doesn't fit") && $("cpLengths").querySelector('[data-length="w"]').disabled ? [] : [$("toast").textContent]]);
                            // Tap: a bar's count, then the taps, each to the nearest eighth.
                            strip(3).dispatchEvent(new MouseEvent("click", { bubbles: true }));
                            await tapCpBars();
                            const counting = cpTap.sound?.phase === "count" && $("cpBarTap").getAttribute("aria-pressed") === "true";
                            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
                            checks.push(["Tap counts in, and Esc stops it", counting && cpTap.sound === null && $("cpBarTap").textContent === "Tap" ? [] : [counting, $("cpBarTap").textContent]]);
                            const tapped = { taps: [0, 2, 3, 4].map(eighth => eighth * 0.25 + 0.02), from: 3, bars: 1, beat: 0.5, phase: "tap", timers: [], out: null, start: 1 };
                            cpTap.sound = tapped;
                            finishCpTap(tapped);
                            checks.push(["the taps become bar 4's rhythm, with Undo", rhythmLine().endsWith("-q -e -e -h") && $("toast").textContent.includes("Tapped bar 4") ? [] : [rhythmLine()]]);
                        } finally {
                            window.print = realPrint;
                            stopCpPlaying();
                            closeConsPopovers();
                            if (savedCp === null) localStorage.removeItem(CP_KEY); else localStorage.setItem(CP_KEY, savedCp);
                            cp.exercise = null;
                            cp.saved = null;
                            cp.asked = false;
                            cp.saving.clear();
                        }
                        // 2.6.0: Rhythm. The sequencer written, spread evenly, kept through
                        // AHK and played with the metronome; drums behind Progressions; the trainer.
                        const savedRh = localStorage.getItem(RH_KEY);
                        try {
                            consSections.show("rhythm");
                            checks.push(["Rhythm shows no neck, its switch still (2.7.1), and asks AHK for the rhythms", $("consNeckModule").hidden && $("consNeckToggle").disabled && sent.has("GetRhythms") && $("rhSave").disabled ? [] : [$("consNeckModule").hidden, sent.has("GetRhythms")]]);
                            receiveRhythms([]);
                            setRhythm(MaestroRhythm.newRhythm({ title: "Smoke rhythm", meter: "4/4", steps: 4 }), { id: null, savedText: null });
                            const cells = row => [...$("rhRows").querySelectorAll(`[data-cell^="${row}:"]`)];
                            checks.push(["a new rhythm: three rows of a bar of sixteenths", $("rhRows").querySelectorAll(".rh-row").length === 3 && cells(0).length === 16 ? [] : [$("rhRows").querySelectorAll(".rh-row").length, cells(0).length]]);
                            cells(0)[0].click();
                            cells(0)[2].dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
                            cells(1)[4].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
                            checks.push(["a click writes a hit, Shift and a click or a right-click an accent", rh.rhythm.rows[0].hits.slice(0, 3).join("") === "102" && rh.rhythm.rows[1].hits[4] === 2 && cells(0)[2].classList.contains("is-accent") ? [] : [rh.rhythm.rows[0].hits.join(""), rh.rhythm.rows[1].hits.join("")]]);
                            cells(0)[0].click();
                            checks.push(["and a click again rests it", rh.rhythm.rows[0].hits[0] === 0 ? [] : [rh.rhythm.rows[0].hits.join("")]]);
                            checks.push(["the rhythm is written out, a staff a row", $("rhStaff").querySelectorAll(".staff-line").length === 3 && $("rhStaff").querySelectorAll(".rhythm-label").length === 3 ? [] : [$("rhStaff").querySelectorAll(".staff-line").length]]);
                            $("rhRows").querySelector('[data-row-even="2"]').click();
                            const evenOpen = !$("rhEvenPanel").hidden;
                            $("rhEvenHits").value = "3";
                            $("rhEvenLength").value = "8";
                            $("rhEvenPanel").dispatchEvent(new Event("input", { bubbles: true }));
                            const preview = $("rhEvenPreview").textContent;
                            $("rhEvenApply").click();
                            checks.push(["Spread puts 3 hits over a row of 8, a polymeter, and says its length", evenOpen && preview.startsWith("x · · x") && rh.rhythm.rows[2].hits.join("") === "10010010" && $("rhRows").textContent.includes("8 steps") && $("rhEvenPanel").hidden ? [] : [evenOpen, preview, rh.rhythm.rows[2].hits.join("")]]);
                            $("rhSteps").querySelector('[data-steps="2"]').click();
                            checks.push(["2 steps a beat keeps the hits on eighths", rh.rhythm.steps === 2 && rh.rhythm.rows[0].hits.length === 8 && rh.rhythm.rows[0].hits[1] === 2 && rh.rhythm.rows[1].hits[2] === 2 ? [] : [rh.rhythm.rows[0].hits.join(""), rh.rhythm.rows[1].hits.join("")]]);
                            $("rhMeter").value = "7/8";
                            $("rhMeter").dispatchEvent(new Event("change"));
                            checks.push(["in 7/8, a beat takes 1 or 2 steps, and its groups are set apart", [...$("rhSteps").children].map(button => button.dataset.steps).join() === "1,2" && $("rhRows").querySelectorAll(".rh-cell.is-group").length > 0 ? [] : [[...$("rhSteps").children].map(button => button.dataset.steps).join()]]);
                            $("rhMeter").value = "4/4";
                            $("rhMeter").dispatchEvent(new Event("change"));
                            $("rhAddRow").click();
                            checks.push(["Add row adds a sound not yet used", rh.rhythm.rows.length === 4 && !["hatClosed", "snare", "kick"].includes(rh.rhythm.rows[3].sound) ? [] : [rh.rhythm.rows.map(row => row.sound).join()]]);
                            $("rhRows").querySelector('[data-row-remove="3"]').click();
                            $("toast").querySelector(".toast-action")?.click();
                            checks.push(["a row removed comes back with Undo", rh.rhythm.rows.length === 4 ? [] : [rh.rhythm.rows.length]]);
                            // Kept through AHK, with its id; deleted, with Undo.
                            const rhFrom = messages.length;
                            $("rhSave").click();
                            const rhSave = messages.slice(rhFrom).find(message => message.startsWith("SaveRhythm\n"))?.split("\n") ?? [];
                            checks.push(["Save sends the rhythm to AHK under a new id", /^[a-z0-9]{12}$/.test(rhSave[1] ?? "") && rhSave[2] === MaestroRhythm.HEADER && rhSave[3] === "Smoke rhythm" ? [] : [rhSave.slice(0, 4).join(" | ")]]);
                            rhythmSaved(rhSave[1]);
                            checks.push(["and once AHK has it, it reads Saved", $("rhSave").textContent === "Saved" && rh.saved.length === 1 ? [] : [$("rhSave").textContent]]);
                            $("rhTitleButton").click();
                            checks.push(["the title opens the menu: grooves and the rhythm saved", !$("rhMenu").hidden && $("rhGrooves").children.length === MaestroRhythm.GROOVES.length && $("rhRhythms").querySelector("[aria-current]")?.textContent.startsWith("Smoke rhythm") ? [] : [$("rhRhythms").textContent]]);
                            const rhDelete = messages.length;
                            $("rhRhythms").querySelector("[data-rhythm-delete]").click();
                            checks.push(["delete asks AHK, by its id", messages.slice(rhDelete).includes(`DeleteRhythm\n${rhSave[1]}`) ? [] : [messages.slice(rhDelete).join(" | ")]]);
                            rhythmDeleted(rhSave[1]);
                            const rhUndo = messages.length;
                            $("toast").querySelector(".toast-action")?.click();
                            checks.push(["Undo saves it again", messages.slice(rhUndo).some(message => message.startsWith(`SaveRhythm\n${rhSave[1]}\n`)) ? [] : ["not saved"]]);
                            rhythmSaved(rhSave[1]);
                            $("rhTitleButton").click();
                            $("rhGrooves").querySelector('[data-groove-open="funk"]').click();
                            checks.push(["a groove opens from the menu", rh.rhythm.title === "Funk sixteenths" && rh.id === null && $("rhMenu").hidden ? [] : [rh.rhythm.title]]);
                            // Played with the metronome: each beat books its steps, without the clicks.
                            await toggleRhythmPlay();
                            const playingNow = metro.running && rh.playing && $("rhPlay").getAttribute("aria-pressed") === "true";
                            const clicksFrom = heard.clicks;
                            rh.seq.fromBar = null;
                            for (let beat = 0; beat < 4; beat++) bookRhythmBeat(metro.context.currentTime + 1 + beat * 0.5, 0, beat);
                            const funkHits = Array.from({ length: 16 }, (_, step) => MaestroRhythm.hitsAt(rh.rhythm, step)).flat();
                            checks.push(["Play starts the metronome, and a bar books every step and sounds every hit", playingNow && rh.seq.booked.length >= 16 && heard.clicks - clicksFrom >= funkHits.length && rhythmQuietsClick() ? [] : [playingNow, rh.seq.booked.length, heard.clicks - clicksFrom, funkHits.length]]);
                            $("rhClick").click();
                            checks.push(["Click lets the metronome's clicks under it", !rhythmQuietsClick() ? [] : ["quiet"]]);
                            $("rhClick").click();
                            $("rhPlay").click();
                            checks.push(["Stop stops it all", !metro.running && !rh.playing && $("rhPlay").textContent === "Play" ? [] : [metro.running, rh.playing]]);
                            // Drums behind Progressions' loop, in its time signature.
                            setMetroMeter("4/4");
                            prog.settings.loop = true;
                            setProgDrums("groove:rock");
                            // On the Rhythm tab, Play plays only the rhythm: the loop and
                            // its drums rest unless they're set to keep playing.
                            const bookedBefore = prog.booked.length;
                            bookProgressionBeat(metro.context.currentTime + 1, 0, 0);
                            checks.push(["on another tab the loop and its drums rest", progressionDrums() === null && prog.booked.length === bookedBefore && prog.fromBar === null && !prog.settings.elsewhere ? [] : [prog.booked.length - bookedBefore, prog.fromBar]]);
                            $("progElsewhere").click();
                            const behind = progressionDrums();
                            const waltz = $("progDrums").querySelector('[data-drums="groove:waltz"]');
                            checks.push(["drums behind the loop: a groove in its meter plays, one in 3/4 can't be chosen, and Backing names it", behind?.title === "Rock" && waltz?.disabled && $("progBassNow").textContent.endsWith("Rock") ? [] : [behind?.title, waltz?.disabled, $("progBassNow").textContent]]);
                            setMetroMeter("3/4");
                            checks.push(["in another meter they rest", progressionDrums() === null ? [] : ["playing"]]);
                            setMetroMeter("4/4");
                            $("progElsewhere").click();
                            checks.push(["Keep playing on other tabs is kept, and off again", !prog.settings.elsewhere && JSON.parse(localStorage.getItem(PROG_KEY)).elsewhere === false ? [] : [prog.settings.elsewhere]]);
                            setProgDrums("off");
                            // The trainer: its own transport, taps scored, faster when steady.
                            setRhTrainer({ kind: "polyrhythm", a: 3, b: 2, speed: { on: true, step: 4, every: 1, to: 200 } });
                            const trainFrom = metro.settings.tempo;
                            await startRhythmTrainer();
                            const layers = [0, 1].map(layer => rhTrainer.events.filter(event => event.layer === layer && event.cycle === 0).length);
                            checks.push(["the trainer plays 3 against 2, the pads ready", rhTrainer.running && !metro.running && layers.join() === "3,2" && !$("rhPadA").disabled ? [] : [rhTrainer.running, layers.join()]]);
                            rhTrainer.events.filter(event => event.cycle === 0).forEach((event, at) => { event.hit = at % 2 ? 0.01 : -0.012; });
                            scoreRhythmCycles(rhTrainer.cycles[0].end + 1);
                            checks.push(["a steady cycle is scored and speeds it up", $("rhResults").textContent.includes("Steady") && metro.settings.tempo === trainFrom + 4 ? [] : [$("rhResults").textContent, metro.settings.tempo]]);
                            document.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true, cancelable: true }));
                            checks.push(["F taps the first layer", errors.length === 0 ? [] : errors.slice(0, 2)]);
                            await startMetronome();
                            checks.push(["the metronome starting stops the trainer", !rhTrainer.running && metro.running ? [] : [rhTrainer.running]]);
                            stopMetronome();
                            setMetroTempo(trainFrom);
                        } finally {
                            stopRhythmTrainer();
                            if (metro.running) stopMetronome();
                            closeConsPopovers();
                            setProgDrums("off");
                            if (savedRh === null) localStorage.removeItem(RH_KEY); else localStorage.setItem(RH_KEY, savedRh);
                            loadRhythm();
                            rh.saved = null;
                            rh.asked = false;
                            rh.saving.clear();
                        }
                    } finally {
                        stopSteadyTone();
                        stopConsDrone();
                        stopConsScale();
                        finder.picked = [];
                        resetQuizScore();
                        cons.voices.clear();
                        cons.chordVoices = [];
                        cons.starting = 0;
                        metro.restAfter = 8000;
                        if (savedCons === null) localStorage.removeItem(CONS_KEY); else localStorage.setItem(CONS_KEY, savedCons);
                        cons.settings = MaestroMusic.parseSettings(savedCons);
                        cons.chord = -1;
                        cons.tonesOut = null;
                        cons.wave = null;
                        cons.plucks.clear();
                        closeConsTuningForm();
                        consSections.show(cons.settings.tab);
                        renderConservatory();
                    }
                    checks.push(["the metronome sends nothing to Maestro", messages.some(message => /metro/i.test(message)) ? ["sent"] : []]);
                    checks.push(["no errors from the metronome", errors.splice(0)]);
                } finally {
                    stopMetronome();
                    toggleMetroTrainer(false);
                    window.AudioContext = realAudio;
                    windowIsHidden = wasHidden;
                    metro.context = null;
                    metro.output = null;
                    metro.noise = null;
                    if (savedMetro === null) localStorage.removeItem(METRO_KEY); else localStorage.setItem(METRO_KEY, savedMetro);
                    metro.settings = MaestroMetronome.parseSettings(savedMetro);
                    renderMetro();
                    navigate("home");
                }
            }

            // 2.2.0: pages, sections, the sidebar's marker and numbers move.
            {
                const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
                const entrance = view => document.getElementById(view).getAnimations().at(-1);
                const firstShift = animation => String(animation?.effect.getKeyframes()[0].transform || "");
                navigate("home");
                navigate("games");
                checks.push(["a page lower in the sidebar rises in", /translateY\(12px\)/.test(firstShift(entrance("games"))) ? [] : [firstShift(entrance("games")) || "no entrance"]]);
                navigate("notes");
                checks.push(["a page higher in the sidebar settles from above", /translateY\(-12px\)/.test(firstShift(entrance("notes"))) ? [] : [firstShift(entrance("notes")) || "no entrance"]]);
                checks.push(["the 1.x entrance is off", getComputedStyle($("notes")).animationName === "none" ? [] : [getComputedStyle($("notes")).animationName]]);
                // While it moves, a page never makes the window taller: 12 px stays in its margin.
                const taller = [];
                [...document.querySelectorAll(".nav[data-view]")].map(button => button.dataset.view).forEach(view => {
                    navigate(view === "home" ? "commands" : "home");
                    navigate(view);
                    const animation = entrance(view);
                    if (!animation) return taller.push(`${view}: no entrance`);
                    animation.pause();
                    animation.currentTime = 0;
                    const moving = document.documentElement.scrollHeight;
                    animation.finish();
                    const still = document.documentElement.scrollHeight;
                    if (moving > still) taller.push(`${view}: ${moving} while moving, ${still} after`);
                });
                checks.push(["no page makes the window taller while it comes in", taller]);
                navigate("games");
                gamesSections.show("playing");
                await wait(80);
                gamesSections.show("library");
                const library = $("gamesLibraryPanel").getAnimations().at(-1);
                checks.push(["a section to the right comes from the right", /translateX\(10px\)/.test(firstShift(library)) ? [] : [firstShift(library) || "no entrance"]]);
                await wait(80);
                gamesSections.show("playing");
                const playing = $("gamesPlaying").getAnimations().at(-1);
                checks.push(["and one to the left from the left", /translateX\(-10px\)/.test(firstShift(playing)) ? [] : [firstShift(playing) || "no entrance"]]);
                navigate("dashboard");
                gamesSections.show("library");
                gamesSections.show("playing");
                checks.push(["a section on a page out of sight doesn't move", $("gamesPlaying").getAnimations().length <= 1 ? [] : ["it moved"]]);
                // The marker is sent to the current page's button (it slides there in CSS).
                await wait(50);
                const sidebar = document.querySelector(".sidebar");
                const current = document.querySelector('.nav[data-view="dashboard"]').getBoundingClientRect();
                const side = sidebar.getBoundingClientRect();
                const markerY = Number.parseFloat(sidebar.style.getPropertyValue("--nav-marker-y"));
                const markerH = Number.parseFloat(sidebar.style.getPropertyValue("--nav-marker-h"));
                checks.push(["the sidebar's marker goes to the current page", sidebar.classList.contains("has-nav-marker")
                    && Math.abs(side.top + sidebar.clientTop + markerY - current.top) < 2 && Math.abs(markerH - current.height) < 2 ? [] : [`marker to ${Math.round(markerY)}, page at ${Math.round(current.top - side.top)}`]]);
                checks.push(["the current page's own fill gives way to it", getComputedStyle(document.querySelector('.nav[data-view="dashboard"]')).backgroundImage === "none" ? [] : ["filled twice"]]);
                // A number counts to its new value, and lands on it.
                navigate("home");
                const cpu = $("homeCpu");
                countTo(cpu, 10, formatMetric);
                countTo(cpu, 60, formatMetric);
                const midway = cpu.textContent;
                await wait(500);
                checks.push(["a number counts to its new value", midway !== "60%" && cpu.textContent === "60%" ? [] : [`${midway} then ${cpu.textContent}`]]);
                countTo(cpu, undefined, formatMetric);
                checks.push(["and a missing one is written at once", cpu.textContent === "--%" ? [] : [cpu.textContent]]);
            }

            // 1.9.1: rules and rendering the unit tests can't see.
            navigate("games");
            const fillOf = className => {
                const bar = document.createElement("span");
                bar.className = className;
                const fill = bar.appendChild(document.createElement("b"));
                document.body.append(bar);
                const paint = getComputedStyle(fill).backgroundImage;
                bar.remove();
                return paint;
            };
            checks.push(["a mastered bar is painted differently", fillOf(Games.raBarClass(true)) !== fillOf(Games.raBarClass(false)) ? [] : ["same paint"]]);
            // 2.0.0: Sounds has tabs for the page.
            sent.clear();
            navigate("sounds");
            soundSections.show("library");
            checks.push(["Sounds asks for the audio output when it opens", sent.has("GetAudioDevices") ? [] : ["didn't ask"]]);
            checks.push(["the folder's line and the version strip wait for the library", soundState.library || ($("soundLibraryForm").hidden && $("soundEras").hidden) ? [] : ["showing"]]);
            checks.push(["Sounds has three sections", $("soundTabs").querySelectorAll("[role=tab]").length === 3 ? [] : ["wrong count"]]);
            checks.push(["the selected sound sits with the library", $("soundLibraryPanel").contains($("soundDetail")) ? [] : ["elsewhere"]]);
            // 2.2.0: before a sound is chosen, the panel has its heading and an empty state.
            {
                const selectedWas = soundState.selected;
                soundState.selected = null;
                renderSoundDetail();
                checks.push(["Selected Sound is headed before a sound is chosen", $("soundDetail").querySelector(".module-head h2")?.textContent === "Selected Sound" && $("soundDetail").querySelector(".empty-state p") ? [] : [$("soundDetail").textContent]]);
                soundState.selected = selectedWas;
                renderSoundDetail();
            }
            // 2.2.0: once Maestro is hidden and idle after a start, AutoHotkey has the page fill
            // Sounds, Games and RetroAchievements ahead of time; Games then asks for the covers it
            // shows while it's closed.
            {
                const was = { items: gamesState.items, loaded: gamesState.loaded, covers: gamesState.coversEnabled, library: soundState.library, updated: gamesState.ra.updatedAt };
                const ahead = { id: "st:77", title: "Ahead", emulator: "steam", system: "", seconds: 60, last: "2026-11-08T10:00:00", plays: 1, launchable: true, installed: true, cover: true };
                gamesState.requested.delete("st:77");
                let sentFrom = messages.length;
                handleWebMessage({ data: { type: "games", covers: true, items: [ahead] } });
                checks.push(["closed, Games asks for no covers", !$("games").classList.contains("active") && !messages.slice(sentFrom).some(message => message.startsWith("GetCovers")) ? [] : ["asked"]]);
                soundState.library = null;
                sentFrom = messages.length;
                handleWebMessage({ data: { type: "prepareViews" } });
                const asked = messages.slice(sentFrom);
                const names = asked.map(message => message.split("\n")[0]);
                checks.push(["prepared ahead: Sounds, Games' covers and RetroAchievements",
                    ["GetSoundLibrary", "GetWindowsSounds", "GetStartupSounds", "GetRetroAchievements", "GetRaAwards"].every(name => names.includes(name)) && asked.includes("GetCovers\nst:77") ? [] : [names.join(", ")]]);
                sentFrom = messages.length;
                handleWebMessage({ data: { type: "prepareViews" } });
                checks.push(["and only once a run", messages.length === sentFrom ? [] : [messages.slice(sentFrom).join(", ")]]);
                handleWebMessage({ data: { type: "retroAchievementsAt", at: Date.now() - 3 * 3600000 - 60000 } });
                checks.push(["kept RetroAchievements show their real age", $("raUpdated").textContent === "Updated 3 h ago" ? [] : [$("raUpdated").textContent]]);
                handleWebMessage({ data: { type: "retroAchievementsAt", at: "soon" } });
                checks.push(["and a bad age changes nothing", $("raUpdated").textContent === "Updated 3 h ago" ? [] : [$("raUpdated").textContent]]);
                gamesState.coversAhead = false;
                gamesState.requested.delete("st:77");
                gamesState.items = was.items;
                gamesState.loaded = was.loaded;
                gamesState.coversEnabled = was.covers;
                gamesState.ra.updatedAt = was.updated;
                soundState.library = was.library;
                renderGames();
                renderSounds();
                updateRaTimestamp();
            }
            // 2.2.0: Custom Sounds, a second folder, is one card after the Windows versions.
            {
                const libraryWas = soundState.library;
                const custom = (customState = "ok") => handleWebMessage({ data: { type: "soundLibrary", root: "C:\\Sounds\\lib", exists: true, changed: true,
                    customRoot: "C:\\Sounds\\!windows", customState,
                    eras: [{ folder: "*", year: 0, label: "Custom Sounds", custom: true }, { folder: "(2001) Windows XP", year: 2001, label: "Windows XP" }],
                    sounds: [{ id: "*\\PS3 Trophy.wav", name: "PS3 Trophy", era: "*", group: "", kind: "web", ext: "wav", size: 1, seconds: 1 },
                        { id: "(2001) Windows XP\\Ding.wav", name: "Ding", era: "(2001) Windows XP", group: "", kind: "web", ext: "wav", size: 1, seconds: 1 }] } });
                custom();
                const cards = [...$("soundGroups").querySelectorAll(".sound-version")];
                checks.push(["Custom Sounds is a card after the Windows versions", cards.at(-1)?.dataset.soundEra === "*" && cards.at(-1).querySelector("small")?.textContent === "Custom"
                    && cards.at(-1).querySelector("strong")?.textContent === "Custom Sounds" ? [] : [cards.map(card => card.dataset.soundEra).join(", ")]]);
                checks.push(["its folder has a line under the library's", !$("soundCustomForm").hidden && $("soundCustomShown").textContent === "C:\\Sounds\\!windows" && !$("soundCustomNote").textContent ? [] : ["missing"]]);
                custom("overlaps");
                checks.push(["and says when it can't be used", $("soundCustomNote").textContent === "Inside the library, so not used" ? [] : [$("soundCustomNote").textContent]]);
                const sentFrom = messages.length;
                $("soundCustomChange").click();
                $("soundCustomPath").value = "D:\\Effects";
                $("soundCustomForm").requestSubmit();
                checks.push(["Change sends the new folder", messages.slice(sentFrom).includes("SetCustomSounds\nD:\\Effects") && $("soundCustomEdit").hidden ? [] : [messages.slice(sentFrom).join(" | ")]]);
                soundState.library = libraryWas;
                renderSounds();
            }
            const soundBoardsHidden = $("soundAssignments").hidden && $("soundStartup").hidden && !$("soundLibraryPanel").hidden;
            checks.push(["and the boards are out of the way", soundBoardsHidden ? [] : ["showing"]]);
            handleWebMessage({ data: { type: "audioDevices", soundSwitch: true, items: [{ name: "Headphones (2- Arctis <b>)", label: "Headphones (Arctis <b>)", current: true }, { name: "LG (NVIDIA)", label: "Monitor Speaker (LG)", current: false }] } });
            checks.push(["both menus show the output", $("soundOutputCurrent").textContent === $("audioCurrent").textContent && $("soundOutputMenu").children.length === 2 && $("audioMenu").children.length === 2 ? [] : ["differ"]]);
            checks.push(["device names stay text", $("soundOutputMenu").querySelector("b") ? ["markup ran"] : []]);
            checks.push(["outputs say what they are, then which", $("soundOutputCurrent").textContent === "Headphones (Arctis <b>)" && $("soundOutputMenu").children[1].textContent === "Monitor Speaker (LG)" ? [] : ["wrong name"]]);
            $("soundOutputButton").click();
            checks.push(["the output button opens its menu", !$("soundOutputMenu").hidden && $("audioMenu").hidden ? [] : ["wrong menu"]]);
            document.body.click();
            checks.push(["a click elsewhere closes it", $("soundOutputMenu").hidden ? [] : ["still open"]]);
            // 2.2.0: as it loads, the page tells AutoHotkey whether the start screen plays.
            checks.push(["the page tells AutoHotkey the start screen plays", messages.includes("SetStartScreen\non") ? [] : [String(messages.filter(message => message.startsWith("SetStartScreen")))]]);
            sent.clear();
            messages.length = 0;
            $("soundOutputButton").click();
            $("soundOutputMenu").querySelector(".is-current").click();
            checks.push(["choosing the current output changes nothing", sent.has("SelectAudioDevice") ? ["switched"] : []]);
            handleWindowsSounds({ events: [{ key: "SystemAsterisk", label: "Asterisk", file: "C:\\x\\a.wav", exists: true }, { key: "MailBeep", label: "New mail", file: "", exists: false }] });
            soundSections.show("inuse");
            checks.push(["In Use has its own tab", !$("soundAssignments").hidden && $("soundLibraryPanel").hidden ? [] : ["hidden"]]);
            checks.push(["the timer's sound is in use, to change (2.0.0)", [...$("soundAssignments").querySelectorAll(".sound-assignment")].some(row => row.textContent.includes("Timer ends")) ? [] : ["no row"]]);
            const middleChip = [...$("soundAssignments").querySelectorAll(".sound-preset")].find(chip => chip.textContent.includes("Middle of yours"));
            checks.push(["its last preset waits for its figure, holding its place", middleChip?.disabled && middleChip.textContent.includes("--") ? [] : ["missing"]]);
            const usedRow = [...$("soundAssignments").querySelectorAll(".sound-assignment")].find(row => row.textContent.includes("Asterisk"));
            const freeRow = [...$("soundAssignments").querySelectorAll(".sound-assignment")].find(row => row.textContent.includes("New mail"));
            checks.push(["a row with no sound is as tall as one with a bar", Math.abs(usedRow.offsetHeight - freeRow.offsetHeight) <= 1 ? [] : [`${usedRow.offsetHeight} and ${freeRow.offsetHeight}`]]);
            checks.push(["a row's Play comes last", usedRow.querySelector(".sound-assignment-actions")?.lastElementChild?.textContent === "Play" ? [] : ["not last"]]);
            soundSections.show("library");
            navigate("sounds");
            handleStartupSounds({ signin: [{ weight: 100, file: "a.wav", id: "a.wav", origin: "a.wav", exists: true, changed: false }], shutdown: null, taskWarning: "Test warning" });
            checks.push(["Sounds > Startup shows the sign-in task warning",
                document.querySelector("#soundStartup .startup-task-warning")?.textContent === "Test warning" ? [] : ["not shown"]]);
            handleStartupSounds({ signin: [{ weight: 100, file: "a.wav", id: "a.wav", origin: "a.wav", exists: true, changed: false }], shutdown: null, taskWarning: "" });
            checks.push(["and shows none when all is well", document.querySelector("#soundStartup .startup-task-warning") ? ["still shown"] : []]);
            checks.push(["Startup splits sign-in and shutdown", $("soundStartup").querySelector(".is-signin h2")?.textContent === "Sign-in Sounds" && $("soundStartup").querySelector(".is-shutdown h2")?.textContent === "Shutdown Sound" ? [] : ["no modules"]]);
            checks.push(["with no shutdown sound, it says so", $("soundStartup").querySelector(".is-shutdown .sound-board-empty") ? [] : ["blank"]]);
            handleStartupSounds({ signin: [{ weight: 100, file: "a.wav", id: "a.wav", origin: "a.wav", exists: true, changed: false }], shutdown: { file: "b.wav", id: "b.wav", origin: "b.wav", exists: true, changed: false }, taskWarning: "" });
            checks.push(["a shutdown sound is in its own module", $("soundStartup").querySelectorAll(".is-shutdown .sound-assignment").length === 1 && $("soundStartup").querySelectorAll(".is-signin .sound-assignment").length === 1 ? [] : ["wrong rows"]]);

            // Games' Next Up holds its place while RetroAchievements answers.
            navigate("games");
            gamesSections.show("playing");
            handleWebMessage({ data: { type: "retroAchievements", state: "loading" } });
            const continueBefore = $("gamesContinueModule").getBoundingClientRect();
            checks.push(["Next Up shows its shape while it waits", !$("gamesNextUp").hidden && $("gamesNextUp").querySelector(".skel") ? [] : ["hidden"]]);
            checks.push(["with its heading", $("gamesNextUp").querySelector("h2")?.textContent === "Next Up" ? [] : ["no heading"]]);
            handleWebMessage({ data: { type: "retroAchievements", state: "off" } });
            checks.push(["without RetroAchievements it steps aside", $("gamesNextUp").hidden ? [] : ["showing"]]);
            handleWebMessage({ data: { type: "retroAchievements", state: "loading" } });
            const continueAfter = $("gamesContinueModule").getBoundingClientRect();
            checks.push(["Continue Playing keeps its place while it loads", continueBefore.width === continueAfter.width && continueBefore.left === continueAfter.left ? [] : ["moved"]]);
            handleWebMessage({ data: { type: "retroAchievements", state: "off" } });
            navigate("sounds");
            navigate("dashboard");
            systemSections.show("signin");
            sent.clear(); handleWebMessage({ data: { type: "signInHistory", items: [{ time: "2026-11-08T10:28:15", retrobar: 4937, taskbar: 2515, apps: 5171, keychron: 5515, finished: 7204, sound: "<b>x</b>" }, { finished: "junk" }] } });
            showSignInTip(0);
            const tipText = $("signInTip").textContent;
            checks.push(["the graph's card shows a point's times", !$("signInTip").hidden && tipText.includes("7.2 s") && tipText.includes("4.9 s") && tipText.includes("Keychron") && tipText.includes("Sound: ") ? [] : ["wrong card"]]);
            checks.push(["and keeps hostile text as text", $("signInTip").querySelector("b") ? ["markup ran"] : []]);
            checks.push(["points no longer use the plain tooltip", document.querySelector("#signInPoints [title]") ? ["title found"] : []]);
            hideSignInTip();
            checks.push(["System graphs sign-ins",
                document.querySelectorAll("#signInPoints .signin-point").length === 1 && !document.querySelector("#signInPoints b") ? [] : ["wrong points"]]);
            checks.push(["the table lists each sign-in", $("signInRows").children.length === 1 && $("signInRows").textContent.includes("4.9 s") && $("signInRows").querySelector(".is-finished").textContent === "7.2 s" ? [] : [$("signInRows").textContent]]);
            checks.push(["the summary and graph go by when startup finished", $("signInLatest").textContent === "7.2 s" && $("signInPoints").firstElementChild.getAttribute("aria-label").includes("7.2 s") ? [] : [$("signInLatest").textContent]]);
            checks.push(["with its sound as text", $("signInRows").querySelector("b") ? ["markup ran"] : []]);
            handleWebMessage({ data: { type: "signInHistory", items: [] } });
            checks.push(["no sign-ins says so", !$("signInEmpty").hidden && $("signInContent").hidden ? [] : ["wrong"]]);
            systemSections.show("live");

            // 1.9.2: the tray, the Logs dialog, and what's gone.
            const gone = [".app-footer", ".home-tagline", "#prefWorkspaces", '.nav[data-view="logs"]', "#home .system-bar", "#logsDialog", "#openLogsButton"].filter(selector => document.querySelector(selector));
            checks.push(["the tagline, footer, Logs tab, Logs dialog and old bars are gone", gone]);
            checks.push(["no CLICK label", document.body.textContent.includes("CLICK") ? ["still there"] : []]);
            const pickable = paletteSources("pick");
            const pattern = new RegExp(window.SMOKE_QUICK_PATTERN);
            checks.push(["ASCS accepts everything the quick action picker offers", pickable.filter(item => !pattern.test(item.id)).map(item => item.id)]);
            checks.push(["and each of them can run", pickable.filter(item => !item.run && !item.view && !item.launch && !item.mode).map(item => item.id)]);
            navigate("home");
            const stepBefore = almanacState.step;
            $("homeAlmanac").dispatchEvent(new WheelEvent("wheel", { deltaX: -400, deltaMode: 0, cancelable: true, bubbles: true }));
            checks.push(["a sideways wheel steps the almanac", almanacState.step === stepBefore + 1 ? [] : [`step ${almanacState.step} from ${stepBefore}`]]);
            checks.push(["the ASCS sounds aren't named in Preferences", /\bXP\b|logon/i.test(document.querySelector("label[for=ascsSounds]").textContent) ? ["still named"] : []]);
            navigate("calendar");
            checks.push(["the calendar page has one heading of its own", $("calendar").querySelector("h1")?.textContent === "Calendar" ? [] : ["wrong heading"]]);

            // 2.4.1: every one-of-many toggle steps with the sideways wheel.
            const sideways = (node, deltaX) => {
                const wheel = new WheelEvent("wheel", { deltaX, deltaMode: 0, cancelable: true, bubbles: true });
                node.dispatchEvent(wheel);
                return wheel.defaultPrevented;
            };
            const chosen = selector => [...document.querySelectorAll(selector)].find(button => button.getAttribute("aria-pressed") === "true" || button.getAttribute("aria-selected") === "true");
            const modeBefore = chosen("[data-cal-mode]");
            let paged = 0;
            const countPage = () => { paged += 1; };
            $("calNext").addEventListener("click", countPage);
            $("calPrev").addEventListener("click", countPage);
            document.querySelector('[data-cal-mode="week"]').click();
            sideways(document.querySelector('[data-cal-mode="week"]'), -130);
            checks.push(["rolling right over the Calendar's modes steps the mode, not the month", chosen("[data-cal-mode]")?.dataset.calMode === "month" && paged === 0 ? [] : [chosen("[data-cal-mode]")?.dataset.calMode, `paged ${paged}`]]);
            sideways($("calendar").querySelector("h1"), -130);
            checks.push(["elsewhere on the Calendar it still steps the month", paged === 1 ? [] : [`paged ${paged}`]]);
            $("calNext").removeEventListener("click", countPage);
            $("calPrev").removeEventListener("click", countPage);
            $("calPrev").click();
            modeBefore.click();
            const loose = Object.assign(document.createElement("div"), { className: "cal-modes" });
            loose.innerHTML = '<button type="button" aria-pressed="true">A</button><button type="button" aria-pressed="true">B</button><button type="button" aria-pressed="false">C</button>';
            document.body.append(loose);
            let looseClicks = 0;
            loose.addEventListener("click", () => { looseClicks += 1; });
            checks.push(["a set of separate switches is left alone", !sideways(loose.firstElementChild, -130) && looseClicks === 0 ? [] : [`clicks ${looseClicks}`]]);
            loose.remove();
            navigate("dashboard");
            systemSections.show("live");
            sideways($("systemTabLive"), -130);
            checks.push(["section tabs step too", systemSections.current() === "hardware" ? [] : [systemSections.current()]]);
            checks.push(["rolling vertically over them doesn't", $("systemTabs").dispatchEvent(new WheelEvent("wheel", { deltaY: 130, cancelable: true, bubbles: true })) && systemSections.current() === "hardware" ? [] : ["taken over"]]);
            systemSections.show("live");
            navigate("calendar");
            checks.push(["Countdowns have left Preferences", $("prefCountdowns") || $("tab-prefCountdowns") ? ["still there"] : []]);
            handleWebMessage({ data: { type: "almanac", latitude: 40.7, longitude: -74, place: "Test", wikipedia: false, countdowns: [{ name: "Launch <b>", date: "12-25" }] } });
            localStorage.setItem("ascs.holidayCountdowns", "0");
            renderCalendar();
            checks.push(["Countdowns lists what's coming, as text", $("calCountdowns").textContent.includes("Launch <b>") && !$("calCountdowns").querySelector("b") ? [] : [$("calCountdowns").textContent]]);
            localStorage.removeItem("ascs.holidayCountdowns");
            $("calEditCountdowns").click();
            checks.push(["Edit opens the dialog, with the saved dates", !$("calCountdownDialog").hidden && $("countdownRows").querySelector(".countdown-name")?.value === "Launch <b>" ? [] : ["not open"]]);
            $("addCountdownButton").click();
            $("calCountdownDialog").querySelector("[data-cal-close]").click();
            checks.push(["Cancel closes it and forgets what wasn't saved", $("calCountdownDialog").hidden && $("countdownRows").children.length === 1 ? [] : ["kept"]]);
            $("calEditCountdowns").click();
            sent.clear();
            $("calCountdownForm").requestSubmit();
            checks.push(["Save sends the dates", sent.has("SaveAlmanac") ? [] : ["not sent"]]);
            handleWebMessage({ data: { type: "almanacSaved", message: "Saved." } });
            checks.push(["a successful save closes the dialog", $("calCountdownDialog").hidden ? [] : ["open"]]);
            openOccurrence({ countdown: "12-25" });
            checks.push(["a countdown on the calendar opens the dialog", !$("calCountdownDialog").hidden && $("calendar").classList.contains("active") ? [] : ["didn't open"]]);
            closeCalDialogs();
            // 2.2.0: a long title in Day or Week ends on a whole line, inside its block.
            {
                const was = { resources: calState.resources, calendars: calState.calendars, loaded: calState.loaded, mode: calState.mode, cursor: calState.cursor };
                const text = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//x//EN\r\nBEGIN:VEVENT\r\nUID:long\r\nDTSTAMP:20261101T000000Z\r\nDTSTART:20261108T130000\r\nDTEND:20261108T150000\r\nSUMMARY:${"Release planning for the next version ".repeat(6)}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
                calState.calendars = [{ id: "work", name: "Work", color: "#C4587B" }];
                calState.resources = new Map([["work/long", { calendar: "work", name: "long", etag: "1", text, parsed: Cal.readResource(text), editable: true }]]);
                Object.assign(calState, { loaded: true, mode: "week", cursor: new Date(2026, 10, 8).getTime() });
                renderCalendar();
                const blocks = [...$("calendar").querySelectorAll(".cal-block:not(.is-short)")];
                checks.push(["a long title in Week ends on a whole line, inside its block", blocks.length ? blocks.filter(block => {
                    const title = block.querySelector(":scope > span:not([class])");
                    const lines = title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight);
                    return Math.abs(lines - Math.round(lines)) > .05 || title.getBoundingClientRect().bottom > block.getBoundingClientRect().bottom - parseFloat(getComputedStyle(block).paddingBottom) + .5;
                }).map(block => block.textContent.slice(0, 30)) : ["no block drawn"]]);
                Object.assign(calState, was);
                renderCalendar();
            }
            // 2.0.0: the calendar editor fits its buttons, and takes any color.
            const serverWas = calState.server;
            calState.server = { state: "running", message: "" };
            openCalendarEditor({ id: "work", name: "Work", color: "#C2577A" });
            const calForm = $("calCalendarForm");
            checks.push(["the calendar editor doesn't scroll", calForm.scrollWidth <= calForm.clientWidth + 1 && calForm.scrollHeight <= calForm.clientHeight + 1 ? [] : [`${calForm.scrollWidth}x${calForm.scrollHeight} in ${calForm.clientWidth}x${calForm.clientHeight}`]]);
            checks.push(["its color starts on the calendar's swatch", document.querySelector(".cal-swatch[aria-checked='true']")?.dataset.color === "#C2577A" && !$("calCustomHex").value ? [] : ["wrong swatch"]]);
            $("calCustomHex").value = "12ab9f";
            $("calCustomHex").dispatchEvent(new Event("input", { bubbles: true }));
            checks.push(["a typed hex color is chosen, with no swatch", calChosenColor === "#12AB9F" && !document.querySelector(".cal-swatch[aria-checked='true']") && $("calCustomColor").value === "#12ab9f" ? [] : [calChosenColor]]);
            $("calCustomHex").value = "#12ab9";
            $("calCustomHex").dispatchEvent(new Event("input", { bubbles: true }));
            checks.push(["a half-typed one is marked and changes nothing", $("calCustomHex").getAttribute("aria-invalid") === "true" && calChosenColor === "#12AB9F" ? [] : [calChosenColor]]);
            $("calCustomColor").value = "#336699";
            $("calCustomColor").dispatchEvent(new Event("input", { bubbles: true }));
            checks.push(["the picker chooses too, and shows its hex", calChosenColor === "#336699" && $("calCustomHex").value === "#336699" ? [] : [calChosenColor]]);
            openCalendarEditor({ id: "odd", name: "Odd", color: "#123456" });
            checks.push(["a calendar with its own color opens on Custom", calChosenColor === "#123456" && $("calCustomHex").value === "#123456" && $("calCustomColor").classList.contains("is-chosen") ? [] : [calChosenColor]]);
            closeCalDialogs();
            calState.server = serverWas;
            const statusBefore = $("calStatus").closest(".cal-toolbar");
            checks.push(["the calendar's messages sit in the toolbar", statusBefore ? [] : ["outside it"]]);
            for (const mode of ["month", "week", "day", "agenda"]) {
                setCalMode(mode);
                checks.push([`${mode} draws`, $("calMain").children.length ? [] : ["empty"]]);
            }
            setCalMode("week");
            const hourColumn = $("calMain").querySelector(".cal-column");
            checks.push(["a day's height follows the height of an hour", Math.abs(hourColumn.getBoundingClientRect().height - 24 * hourHeight) < 1 ? [] : [`${hourColumn.getBoundingClientRect().height} for ${hourHeight}`]]);
            setCalMode("month");
            checks.push(["scrollbars take the app's style", getComputedStyle($("calCountdowns")).scrollbarWidth === "auto" ? [] : ["overridden"]]);
            checks.push(["the output list opens right under its switch", $("audioButton").nextElementSibling === $("audioMenu") ? [] : ["elsewhere"]]);
            sent.clear();
            togglePowerTray(true);
            checks.push(["the power tray opens from any view, and only then reads", !$("powerTray").hidden && sent.has("GetRecycleBin") && sent.has("GetAudioDevices") ? [] : ["not opened or no reading"]]);
            checks.push(["its hold buttons are all there", document.querySelectorAll("#powerTray [data-power-hold]").length === 5 ? [] : ["wrong count"]]);
            togglePowerTray(false);
            navigate("dashboard");
            sent.clear();
            systemSections.show("live");
            checks.push(["System reads no log on Live", !sent.has("GetLog") && logState.timer === null ? [] : ["reading"]]);
            checks.push(["System has its four sections", $("systemTabs").querySelectorAll("[role=tab]").length === 4 ? [] : ["wrong count"]]);
            handleWebMessage({ data: { type: "windowShown" } });
            // 2.2.0: the start screen is AutoHotkey's window. The page says whether it plays, and
            // under it the logo's swing and the sheen wait until it dissolves.
            {
                const frames = () => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))); setTimeout(resolve, 1050); });
                await new Promise(resolve => setTimeout(resolve, 150));     // the show above starts its swing within 120 ms
                const arm = document.querySelector(".brand-mark .mark-arm");
                const armSwinging = () => arm.getAnimations().some(motion => motion.animationName === "mark-swing");
                const lastSay = () => messages.filter(message => message.startsWith("SetStartScreen\n")).at(-1);
                const swingWas = $("logoSwing").value;
                $("logoSwing").value = "never";
                $("logoSwing").dispatchEvent(new Event("change"));
                checks.push(["and not when the logo never swings", lastSay() === "SetStartScreen\noff" ? [] : [String(lastSay())]]);
                $("logoSwing").value = swingWas;
                $("logoSwing").dispatchEvent(new Event("change"));
                arm.getAnimations().forEach(motion => motion.cancel());
                arm.classList.remove("is-swinging", "is-previewing");
                handleWebMessage({ data: { type: "windowHidden" } });
                markHasSwung = false;
                $("logoSwing").value = "every";
                $("logoSwing").dispatchEvent(new Event("change"));
                const shownFrom = messages.length;
                handleWebMessage({ data: { type: "windowShown", startScreen: true } });
                checks.push(["under the start screen, nothing moves yet", !armSwinging() && !document.body.classList.contains("is-showing") ? [] : ["moving"]]);
                checks.push(["and Games' RetroAchievements requests go out", ["GetRetroAchievements", "GetRaAwards"].every(name => messages.slice(shownFrom).includes(name + "\n")) ? [] : [messages.slice(shownFrom).join(" | ")]]);
                const pageBefore = [document.scrollingElement.scrollHeight, document.documentElement.clientWidth];
                handleWebMessage({ data: { type: "startScreenDone" } });
                await frames();
                checks.push(["the start screen swung the logo, so the sidebar's stays still, even every time", !armSwinging() && markHasSwung ? [] : ["swinging"]]);
                $("logoSwing").value = swingWas;
                $("logoSwing").dispatchEvent(new Event("change"));
                // A show never moves or resizes the page: a rise once flashed the scrollbar.
                const pageAfter = [document.scrollingElement.scrollHeight, document.documentElement.clientWidth];
                checks.push(["a show leaves the page's height and width alone", pageAfter.join() === pageBefore.join() && document.querySelector(".main").getAnimations().length === 0 ? [] : [`${pageBefore} -> ${pageAfter}`]]);
                checks.push(["and MAESTRO catches the sheen", document.querySelector(".brand-copy strong").getAnimations().some(motion => motion.animationName === "name-sheen") ? [] : ["no sheen"]]);
                arm.getAnimations().forEach(motion => motion.cancel());
                arm.classList.remove("is-swinging", "is-previewing");
                handleWebMessage({ data: { type: "windowHidden" } });
                checks.push(["hidden, the page stays drawn, so the window keeps a real frame", getComputedStyle(document.querySelector(".app-shell")).opacity === "1" && !document.body.classList.contains("is-showing") ? [] : ["blanked"]]);
                handleWebMessage({ data: { type: "windowShown" } });
                handleWebMessage({ data: { type: "windowHidden" } });
                await frames();
                checks.push(["a show cut short by a hide starts nothing late", document.body.classList.contains("is-showing") ? ["started"] : []]);
                handleWebMessage({ data: { type: "windowShown" } });
            }
            checks.push(["Live asks for readings every second", liveTimer !== null ? [] : ["not reading"]]);
            sent.clear();
            handleWebMessage({ data: { type: "metrics", cpu: 42, ram: 50, history: [[10, 20], [12, 22]], drives: [] } });
            checks.push(["the graph ends at the current reading", liveHistory.cpu.at(-1) === 42 && liveHistory.ram.at(-1) === 50 && liveHistory.cpu.length === 3 ? [] : [String(liveHistory.cpu)]]);
            handleWebMessage({ data: { type: "windowMinimized", minimized: true } });
            checks.push(["minimizing stops the readings", liveTimer === null ? [] : ["still reading"]]);
            handleWebMessage({ data: { type: "windowMinimized", minimized: false } });
            checks.push(["restoring starts them again", liveTimer !== null ? [] : ["not reading"]]);
            handleWebMessage({ data: { type: "windowHidden" } });
            checks.push(["hiding stops them", liveTimer === null ? [] : ["still reading"]]);
            handleWebMessage({ data: { type: "windowShown" } });
            systemSections.show("activity");
            checks.push(["its log section reads and checks for changes", sent.has("GetLog") && logState.timer !== null && !$("systemActivity").hidden ? [] : ["not reading"]]);
            checks.push(["Logs are on the page", $("systemActivity").contains($("logList")) ? [] : ["list elsewhere"]]);
            checks.push(["another section stops the readings", liveTimer === null ? [] : ["still reading"]]);
            navigate("home");
            checks.push(["leaving the page stops the checks", logState.timer === null ? [] : ["polling"]]);
            sent.clear();
            navigate("dashboard");
            checks.push(["coming back starts them again", logState.timer !== null && sent.has("GetLog") ? [] : ["not polling"]]);
            systemSections.show("hardware");
            checks.push(["and another section stops them", logState.timer === null ? [] : ["polling"]]);
            checks.push(["Hardware waits for its details", $("hardwareStatus")?.textContent.includes("Detecting") ? [] : ["no status"]]);
            updateHardware({ failed: true });
            checks.push(["and says if Windows doesn't report them", $("hardwareStatus").textContent.includes("didn't report") ? [] : ["no message"]]);
            updateHardware({
                processor: { name: "<b>CPU</b>", cores: 8, threads: 16 },
                graphics: [{ name: "Card A", driver: "1" }, { name: "Card B", driver: "2" }],
                memory: { totalBytes: 34359738368, modules: [{ sizeBytes: 34359738368, bank: "A" }] },
                storage: [{ model: "Disk", sizeBytes: 1000000000000, bus: "NVMe", partitions: [
                    { number: 1, sizeBytes: 104857600, kind: "EFI system", letter: "" },
                    { number: 2, sizeBytes: 999000000000, kind: "Basic data", letter: "C:", label: "Windows", fileSystem: "NTFS", windows: true }] }],
                device: { maker: "Maker" }, board: { product: "Board" }, bios: { version: "1" }, windows: { edition: "Windows 11" },
                displays: [{ name: "Monitor" }], sound: [{ name: "Speakers" }], network: [{ name: "Adapter" }]
            });
            checks.push(["Hardware lists displays, sound and network", $("systemHardware").querySelectorAll(".hardware-device").length === 3 ? [] : ["wrong count"]]);
            checks.push(["Hardware has its modules", $("systemHardware").querySelectorAll(".hardware-tile").length === 4 && $("systemHardware").querySelectorAll(".hardware-detail").length === 4 ? [] : ["wrong count"]]);
            checks.push(["names stay text", $("systemHardware").querySelector(".hardware-name").textContent === "<b>CPU</b>" ? [] : ["became markup"]]);
            checks.push(["a second card gets a heading", [...$("systemHardware").querySelectorAll(".hardware-group")].some(heading => heading.textContent === "Card B") ? [] : ["none"]]);
            checks.push(["a drive's bar has a part per partition", $("systemHardware").querySelectorAll(".hardware-bar span").length === 2 ? [] : ["wrong count"]]);
            checks.push(["only a mounted partition is named on the bar", $("systemHardware").querySelector(".hardware-bar .is-system").textContent === "" && $("systemHardware").querySelector(".hardware-bar .is-mounted").textContent === "C: Windows" ? [] : ["wrong text"]]);
            checks.push(["the same details aren't drawn again", (() => {
                const before = $("systemHardware").firstElementChild;
                updateHardware(JSON.parse(lastHardwareSignature));
                return before === $("systemHardware").firstElementChild ? [] : ["redrew"];
            })()]);
            navigate("home");
            showLogs();
            checks.push(["the palette's Logs opens the section", $("dashboard").classList.contains("active") && systemSections.current() === "activity" ? [] : ["elsewhere"]]);
            systemSections.show("live");
            // Every heading, column head and tab: small words stay lowercase, the
            // rest are capitalized. Text the user wrote and dates are left out.
            const small = new Set(["a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet", "as", "at", "by", "in", "of", "on", "to", "via", "per"]);
            // A heading that opens its page (2.2.0) holds its words in that link.
            const ownText = node => [...node.childNodes].filter(child => child.nodeType === Node.TEXT_NODE || child.classList?.contains("module-link")).map(child => child.textContent).join(" ").trim();
            const lowered = text => text.split(/\s+/).filter((word, index, words) => /^[a-z]/.test(word) && (index === 0 || index === words.length - 1 || !small.has(word)));
            checks.push(["headings are in title case", [...document.querySelectorAll("h1, h2, h3, th, [role=tab]")]
                .filter(node => !node.closest("[data-user-text], #notePreview, .note-preview, .markdown-body"))
                .filter(node => lowered(ownText(node)).length)
                .map(node => `"${ownText(node)}"`)]);
            // 2.2.0: a heading with a chevron opens its page, in place of an Open button.
            checks.push(["no module heading has an Open or Library button", [...document.querySelectorAll(".module-head .link-button")].map(button => button.textContent.trim()).filter(text => /^(Open|Library)$/.test(text))]);
            checks.push(["each heading that opens a page is a button in its heading that says where", [...document.querySelectorAll(".module-link")].filter(link => link.tagName !== "BUTTON" || !link.closest("h2") || !/^Open /.test(link.title)).map(link => link.textContent)]);
            const nowLink = $("homeNowTitle")?.querySelector(".module-link");
            navigate("home");
            nowLink?.click();
            checks.push(["Now Playing's heading opens Games", nowLink && $("games").classList.contains("active") ? [] : [nowLink ? "Games didn't open" : "no link"]]);
            navigate("games");
            gamesSections.show("library");
            await null;
            const tabs = $("gamesTabs"), libraryTab = $("gamesTabLibrary");
            checks.push(["the section marker sits behind the chosen tab and follows it", tabs.classList.contains("has-marker") && tabs.style.getPropertyValue("--marker-x") === `${libraryTab.offsetLeft}px` && tabs.style.getPropertyValue("--marker-w") === `${libraryTab.offsetWidth}px` ? [] : [`${tabs.className} ${tabs.style.cssText}`]]);
            checks.push(["the chosen tab's own fill gives way to the marker", getComputedStyle(libraryTab).backgroundColor === "rgba(0, 0, 0, 0)" ? [] : [getComputedStyle(libraryTab).backgroundColor]]);
            gamesSections.show("playing");
            navigate("home");
            checks.push(["Ctrl numbers cover the nine pages", sidebarViews().length === 9 && sidebarViews()[7] === "commands" && sidebarViews()[8] === "conservatory" ? [] : [sidebarViews().join()]]);
            checks.push(["no errors from the 1.9.1 and 1.9.2 checks", errors.splice(0)]);

            // 1.10.0: the Workspaces page.
            navigate("workspaces");
            const place = (index, app, title, desktop, x, width, extra = {}) => ({ index, app, title, desktop, monitor: 1, x, y: 0, width, height: 1, maximized: false, pinned: false, enabled: true, missing: false, ...extra });
            handleWebMessage({ data: { type: "workspaces", monitors: 1, items: [
                { name: "Default", windows: 3, saved: "2026-11-08T10:00:00", desktopNames: ["", ""], aspects: { 1: 2.4571 }, layout: [
                    place(1, "<b>Code</b>", "<img src=x onerror=alert(1)>", 0, 0, 0.5),
                    place(2, "Edge", "News", 0, 0.5, 0.5),
                    place(3, "Dolphin", "Metroid Prime", 1, 0, 1, { maximized: true })
                ] },
                { name: "Coding", windows: 1, saved: "2026-11-08T10:00:00", desktopNames: [""], aspects: { 1: 2.4571 }, layout: [place(1, "Terminal", "pwsh", 0, 0, 1)] },
                { name: "Later", windows: 1, saved: "2026-11-08T10:00:00", desktopNames: ["", ""], aspects: { 1: 2.4571 }, layout: [place(1, "Notepad", "notes", 1, 0, 1)] }
            ] } });
            handleWebMessage({ data: { type: "launchRules", items: [{ path: "C:\\Apps\\a.exe", app: "<i>App</i>", enabled: true, monitor: 1, x: 0, y: 0, width: 0.5, height: 1, maximized: false, desktop: 0, desktopName: "", pinned: false }, { noPath: true }] } });
            const workspaceChips = document.querySelectorAll("#workspaceList .ws-item[data-ws-layout]");
            checks.push(["Saved Arrangements lists each arrangement", workspaceChips.length === 3 ? [] : [`${workspaceChips.length} rows`]]);
            checks.push(["Workspaces opens on its Arrangements tab", workspaceSections.current() === "layouts" && !$("wsLayouts").hidden && $("wsRules").hidden ? [] : [workspaceSections.current()]]);
            checks.push(["the first workspace is open", $("workspaceTitle").textContent === "Default" ? [] : [$("workspaceTitle").textContent]]);
            checks.push(["each desktop has a tab", document.querySelectorAll("#workspaceTabs .ws-tab").length === 2 ? [] : ["wrong tabs"]]);
            const screen = document.querySelector("#workspaceScreens .ws-screen").getBoundingClientRect();
            checks.push(["the canvas has the monitor's real shape", Math.abs(screen.width / screen.height - 2.4571) < 0.02 ? [] : [`${screen.width}x${screen.height}`]]);
            const tooSmall = ["#workspaces .ws-window strong", "#workspaces .ws-window > span", "#workspaces .ws-row small", "#workspaces .ws-tab em", "#workspaces .ws-item small", "#workspaces .ws-number span", "#workspaces .ws-place", "#workspaces .ws-panel-title", "#workspaces .ws-switch"]
                .filter(selector => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize) < 18);
            checks.push(["nothing on the page is smaller than 18 px", tooSmall]);
            checks.push(["Selected Window is headed by the window's app, as text", $("wsWindowTitle").textContent === "<b>Code</b>" && !$("wsWindowTitle").querySelector("b") && $("wsWindowSub").textContent.startsWith("<img") ? [] : [$("wsWindowTitle").innerHTML]]);
            checks.push(["a window's name and title stay text", document.querySelector("#workspaceScreens b, #workspaceScreens img, #workspaceInspector img") ? ["markup ran"] : []]);
            checks.push(["the first window is selected", document.querySelector(".ws-window.is-selected")?.dataset.index === "1" ? [] : ["none"]]);

            messages.length = 0;
            [...document.querySelectorAll("#workspaceInspector .ws-place")].find(node => node.textContent.includes("Right")).click();
            const editOf = () => messages.filter(message => message.startsWith("SetWorkspaceWindow")).pop() || "";
            checks.push(["a place button sends the edit", /\|1\|0\|1\|0\.6667\|0\.0000\|0\.3333\|1\.0000\|0\|0\|1$/.test(editOf()) ? [] : [editOf()]]);
            checks.push(["and shows it at once", Math.abs(parseFloat(document.querySelector('.ws-window[data-index="1"]').style.left) - 66.67) < 0.01 ? [] : ["not moved"]]);
            const numberInput = document.querySelector('#workspaceInspector [data-ws-field="width"]');
            numberInput.value = "20";
            numberInput.dispatchEvent(new Event("change", { bubbles: true }));
            checks.push(["a typed size sends the edit", /\|0\.2000\|1\.0000\|0\|0\|1$/.test(editOf()) ? [] : [editOf()]]);
            document.querySelector('#workspaceInspector [data-ws-focus="enabled"]').click();
            checks.push(["switching a window off sends the edit", /\|0$/.test(editOf()) ? [] : [editOf()]]);
            checks.push(["and shows it", document.querySelector('.ws-window[data-index="1"]').classList.contains("is-off") ? [] : ["not dimmed"]]);
            document.querySelector('#workspaceInspector [data-ws-focus="enabled"]').click();
            messages.length = 0;
            const desktopSelect = document.querySelector('#workspaceInspector [data-ws-focus="desktop"]');
            desktopSelect.value = "1";
            desktopSelect.dispatchEvent(new Event("change", { bubbles: true }));
            checks.push(["moving to another desktop follows the window", document.querySelector('#workspaceTabs [aria-pressed="true"]')?.textContent.startsWith("Desktop 2") && document.querySelector(".ws-window.is-selected")?.dataset.index === "1" ? [] : ["didn't follow"]]);
            const backSelect = document.querySelector('#workspaceInspector [data-ws-focus="desktop"]');
            backSelect.value = "0";
            backSelect.dispatchEvent(new Event("change", { bubbles: true }));

            // A drag, with the pointer events the page gets.
            messages.length = 0;
            const canvas = $("workspaceScreens");
            const target = document.querySelector('.ws-window[data-index="2"]');
            const box = target.getBoundingClientRect();
            const pointer = (node, type, x, y) => node.dispatchEvent(new PointerEvent(type, { pointerId: 7, button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
            pointer(target, "pointerdown", box.left + 40, box.top + 40);
            checks.push(["pressing a window selects it", document.querySelector(".ws-window.is-selected")?.dataset.index === "2" ? [] : ["not selected"]]);
            pointer(canvas, "pointermove", box.left + 40 - screen.width * 0.2, box.top + 40);
            const dragged = parseFloat(document.querySelector('.ws-window[data-index="2"]').style.left);
            checks.push(["a drag moves it live", dragged < 50 ? [] : [`left ${dragged}`]]);
            checks.push(["and sends nothing yet", editOf() ? ["sent early"] : []]);
            pointer(canvas, "pointerup", box.left + 40 - screen.width * 0.2, box.top + 40);
            checks.push(["letting go sends one edit", messages.filter(message => message.startsWith("SetWorkspaceWindow")).length === 1 ? [] : [messages.join(";")]]);
            const before = editOf();
            const next = document.querySelector('.ws-window[data-index="2"]');
            pointer(next, "pointerdown", box.left + 40, box.top + 40);
            pointer(canvas, "pointermove", box.left + 90, box.top + 40);
            next.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
            checks.push(["Esc cancels a drag", editOf() === before && parseFloat(document.querySelector('.ws-window[data-index="2"]').style.left) === dragged ? [] : ["kept"]]);
            pointer(canvas, "pointerup", box.left + 90, box.top + 40);
            const keyTarget = document.querySelector('.ws-window[data-index="2"]');
            keyTarget.focus();
            keyTarget.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
            checks.push(["an arrow key moves it and keeps the focus", document.activeElement?.dataset.index === "2" && parseFloat(document.querySelector('.ws-window[data-index="2"]').style.left) > dragged ? [] : ["lost"]]);

            workspaceChips[1].click();
            checks.push(["choosing another workspace opens it", $("workspaceTitle").textContent === "Coding" ? [] : [$("workspaceTitle").textContent]]);
            checks.push(["one desktop needs no tabs", $("workspaceTabs").hidden ? [] : ["tabs shown"]]);
            document.querySelectorAll("#workspaceList .ws-item[data-ws-layout]")[2].click();
            checks.push(["a workspace opens on the first desktop with windows", document.querySelector('#workspaceTabs [aria-pressed="true"]')?.textContent.startsWith("Desktop 2") ? [] : ["wrong tab"]]);
            messages.length = 0;
            $("wsTabRules").click();
            checks.push(["Launch Rules is its own section", !$("wsRules").hidden && $("wsLayouts").hidden && document.querySelectorAll("#ruleList .ws-rule").length === 1 ? [] : ["not shown"]]);
            checks.push(["and asks for the open windows", messages.some(message => message.startsWith("GetWindows")) ? [] : [messages.join(";") || "nothing sent"]]);
            checks.push(["and counts the rules", $("ruleCount").textContent === "1 rule · 1 on" ? [] : [$("ruleCount").textContent]]);
            checks.push(["and keep a rule's name as text", document.querySelector("#ruleList i:not(.is-pinned):not([style])") ? ["markup ran"] : []]);
            $("wsTabLayouts").click();
            handleWebMessage({ data: { type: "workspaces", monitors: 1, items: [] } });
            checks.push(["with nothing saved, the page says how to save", $("workspaceTitle").textContent === "No Saved Arrangements Yet" && !$("workspacesEmpty").hidden && $("workspacePage").hidden ? [] : [$("workspaceTitle").textContent]]);
            document.querySelector("#workspaceSave .ws-save-open")?.click();
            checks.push(["the save field opens", document.querySelector("#workspaceSave .ws-save input") ? [] : ["no field"]]);
            handleWebMessage({ data: { type: "windows", items: [] } });
            checks.push(["and a reply doesn't lose what's typed", document.querySelector("#workspaceSave .ws-save input") ? [] : ["field rebuilt"]]);

            // The notes from the 1.10.0 pass.
            const twoWindows = { name: "Later", windows: 2, saved: "2026-11-08T10:00:00", desktopNames: ["", ""], aspects: { 1: 2.4571 }, layout: [place(1, "Notepad", "notes", 0, 0, 0.5), place(2, "Edge", "News", 0, 0.5, 0.5)] };
            const oneWindow = { ...twoWindows, windows: 1, layout: [twoWindows.layout[0]] };
            const chipText = () => document.querySelector("#workspaceList .ws-item[data-ws-layout] small")?.textContent || "";
            document.querySelector("#workspaceSave .ws-save input").value = "typing";
            handleWebMessage({ data: { type: "workspaces", monitors: 1, items: [twoWindows] } });
            checks.push(["with the save field open, the list shows the count", chipText().startsWith("2 windows") ? [] : [chipText() || "no chip"]]);
            handleWebMessage({ data: { type: "workspaces", monitors: 1, items: [oneWindow] } });
            checks.push(["and updates it after a removal", chipText().startsWith("1 window") ? [] : [chipText() || "no chip"]]);
            checks.push(["while keeping what's typed", document.querySelector("#workspaceSave .ws-save input")?.value === "typing" ? [] : ["lost"]]);
            document.querySelector("#workspaceSave .ws-save input")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
            checks.push(["Esc closes the save field", document.querySelector("#workspaceSave .ws-save-open") ? [] : ["still open"]]);
            document.querySelector("#workspaceList .ws-item[data-ws-layout]").click();
            document.querySelector("#workspaceTabs .ws-tab").click();

            messages.length = 0;
            document.querySelector("#workspaceInspector .secondary.danger").click();
            checks.push(["the last window says so at once, without a dialog", $("confirmDialog").hidden && $("toast").textContent.includes("last window") ? [] : ["dialog or no notice"]]);
            checks.push(["and asks AHK for nothing", messages.some(message => message.startsWith("RemoveWorkspaceWindow")) ? ["sent"] : []]);
            if (!$("confirmDialog").hidden) $("confirmDialogCancel").click();
            handleWebMessage({ data: { type: "workspaces", monitors: 1, items: [twoWindows] } });
            document.querySelector("#workspaceInspector .secondary.danger").click();
            checks.push(["with more than one, Remove still confirms", !$("confirmDialog").hidden ? [] : ["no dialog"]]);
            $("confirmDialogCancel").click();

            const headAction = label => [...$("workspaceActions").children].find(node => node.textContent === label);
            const nameKey = key => document.querySelector("#workspaceTitle .ws-name")?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
            messages.length = 0;
            headAction("Duplicate").click();
            nameKey("Enter");
            checks.push(["Duplicate accepts the suggested name", messages.includes("DuplicateWorkspace\nLater|Later copy") ? [] : [messages.join(";") || "nothing sent"]]);
            handleWebMessage({ data: { type: "workspaces", monitors: 1, items: [twoWindows] } });
            messages.length = 0;
            headAction("Rename").click();
            nameKey("Enter");
            checks.push(["Rename with the same name sends nothing", messages.some(message => message.startsWith("RenameWorkspace")) ? ["sent"] : []]);

            document.querySelector("#workspaceAdd .secondary").click();
            handleWebMessage({ data: { type: "windows", items: [{ id: "101", app: "Code", title: "x", minimized: false }] } });
            const addSelect = document.querySelector("#workspaceAdd select");
            addSelect.value = "101";
            addSelect.dispatchEvent(new Event("change", { bubbles: true }));
            $("workspaceAdd").requestSubmit();
            handleWebMessage({ data: { type: "workspaces", monitors: 1, items: [{ ...twoWindows, windows: 3, layout: [...twoWindows.layout, place(3, "Code", "x", 1, 0, 1)] }] } });
            checks.push(["an added window opens on its desktop, selected", document.querySelector(".ws-window.is-selected")?.dataset.index === "3" && document.querySelector('#workspaceTabs [aria-pressed="true"]')?.textContent.startsWith("Desktop 2") ? [] : ["not shown"]]);

            document.querySelector("#workspaceTabs .ws-tab").click();
            messages.length = 0;
            const widthInput = document.querySelector('#workspaceInspector [data-ws-field="width"]');
            widthInput.value = "100";
            widthInput.dispatchEvent(new Event("change", { bubbles: true }));
            const fullWindow = document.querySelector(".ws-window.is-selected")?.dataset.index;
            checks.push(["a window sized to 100% by 100% says Full", document.querySelector(".ws-row.is-selected small")?.textContent.includes("Full") && !document.querySelector(".ws-row.is-selected small")?.textContent.includes("100%") ? [] : [document.querySelector(".ws-row.is-selected small")?.textContent || `window ${fullWindow}`]]);
            checks.push(["and is sent as maximized", /\|1\|0\|1$/.test(messages.filter(message => message.startsWith("SetWorkspaceWindow")).pop() || "") ? [] : [messages.join(";")]]);
            checks.push(["and lights the Full button", document.querySelector("#workspaceInspector .ws-place.is-on")?.textContent === "Full" ? [] : ["not lit"]]);

            // 2.0.0: Commands.
            navigate("commands");
            commandsSections.show("keymap");
            handleWebMessage({ data: { type: "commands", items: [{ id: 1, name: "Repo", kind: "folder", target: "C:\\x", key: "a" }, { id: 2, name: "Site", kind: "url", target: "https://x", key: "" }] } });
            handleWebMessage({ data: { type: "settings", drives: ["C:"], snapGap: 0, preserveSize: true, hotkeys: { notes: "q", everything: "f", dashboard: "i", terminal: "t", explorer: "e", claude: "c", taskmanager: "h" }, claudeShortcut: "Ctrl+Alt+Space", powerDelay: 0, ascsSounds: "show", searchTemplate: "https://x/?q=%s" } });
            const pressKey = id => $("keymap").querySelector(`[data-key="${id}"]`).dispatchEvent(new MouseEvent("click", { bubbles: true }));
            checks.push(["the panel opens on Quick Notes", $("keyDetailName").textContent === "Quick Notes" && $("keyLetter").value === "Q" ? [] : [$("keyDetailName").textContent]]);
            const textOutsideKeys = () => [...$("keymap").querySelectorAll(".km-key")].flatMap(group => {
                const cap = group.querySelector(".km-cap").getBBox();
                return [...group.querySelectorAll(".km-label, .km-caption")].filter(text => {
                    const box = text.getBBox();
                    return box.x < cap.x || box.x + box.width > cap.x + cap.width;
                }).map(text => `${group.dataset.key}: ${text.textContent}`);
            });
            checks.push(["every name is inside its key", textOutsideKeys().length ? textOutsideKeys() : []]);
            handleWebMessage({ data: { type: "commands", items: [{ id: 1, name: "WWWWWWWWWW", kind: "folder", target: "C:\\x", key: "a" }, { id: 2, name: "Site", kind: "url", target: "https://x", key: "" }] } });
            checks.push(["even the widest custom name", textOutsideKeys().length ? textOutsideKeys() : []]);
            keymapLayer = "shift";
            renderKeymap();
            checks.push(["and on the Shift layer", textOutsideKeys().length ? textOutsideKeys() : []]);
            keymapLayer = "super";
            handleWebMessage({ data: { type: "commands", items: [{ id: 1, name: "Repo", kind: "folder", target: "C:\\x", key: "a" }, { id: 2, name: "Site", kind: "url", target: "https://x", key: "" }] } });
            pressKey("s");
            checks.push(["a built-in key has nothing to edit", $("keySave").hidden && $("keyLetterField").hidden && $("keyDetailText").textContent.includes("built in") ? [] : ["editable"]]);
            pressKey("k");
            checks.push(["a free letter offers every command", !$("keyRunsField").hidden && $("keySave").textContent === "Assign" && $("keyRuns").options.length === 10 ? [] : [String($("keyRuns").options.length)]]);
            messages.length = 0;
            $("keyEditForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            checks.push(["with no command chosen, nothing is sent", !messages.length && $("keyStatus").textContent.includes("Choose") ? [] : [messages.join()]]);
            $("keyRuns").value = "action:everything";
            $("keyEditForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            checks.push(["assigning sends the whole settings line, with the new letter", messages.some(message => message.startsWith("SaveSettings") && message.includes("|q,k,i,t,e,c,h|")) ? [] : [messages.join()]]);
            checks.push(["and keeps the other settings", messages.some(message => message.includes("https://x/?q=%s") && message.includes("Ctrl+Alt+Space")) ? [] : [messages.join()]]);
            checks.push(["nothing moves until it's saved", currentHotkeys.everything === "f" ? [] : [currentHotkeys.everything]]);
            handleWebMessage({ data: { type: "settingsSaved", message: "Saved and applied." } });
            checks.push(["saved, the command is on its new key", currentHotkeys.everything === "k" && $("keyDetailName").textContent === "Everything" && keymapSelected === "k" ? [] : [currentHotkeys.everything]]);
            pressKey("k");
            $("keyLetter").value = "q";
            messages.length = 0;
            $("keyEditForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            checks.push(["a clash is refused without saving", !messages.length && $("keyStatus").textContent.includes("Quick Notes") ? [] : [$("keyStatus").textContent]]);
            $("keyReset").click();
            checks.push(["Reset goes back to the default letter", messages.some(message => message.includes("|q,f,i,t,e,c,h|")) ? [] : [messages.join()]]);
            handleWebMessage({ data: { type: "error", scope: "settings", message: "Nope." } });
            checks.push(["a backend refusal shows and changes nothing", $("keyStatus").textContent === "Nope." && currentHotkeys.everything === "k" ? [] : [$("keyStatus").textContent]]);
            handleWebMessage({ data: { type: "settings", drives: ["C:"], snapGap: 0, preserveSize: true, hotkeys: { notes: "q", everything: "f", dashboard: "i", terminal: "t", explorer: "e", claude: "c", taskmanager: "h" }, claudeShortcut: "Ctrl+Alt+Space", powerDelay: 0, ascsSounds: "show", searchTemplate: "https://x/?q=%s" } });
            pressKey("a");
            checks.push(["a custom command's key can lose its letter", $("keyReset").textContent === "Remove letter" ? [] : [$("keyReset").textContent]]);
            messages.length = 0;
            $("keyLetter").value = "k";
            $("keyEditForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            checks.push(["moving a custom command saves the commands", messages.some(message => message.startsWith("SaveCommands") && message.includes("Repo\tfolder\tC:\\x\tk")) ? [] : [messages.join()]]);
            pendingKeySelection = null;
            pressKey("c");
            checks.push(["Claude's key has its shortcut beside it", !$("claudeField").hidden ? [] : ["hidden"]]);
            pressKey("q");
            checks.push(["other keys don't", $("claudeField").hidden ? [] : ["showing"]]);
            $("keymap").querySelector('[data-key="q"]').focus();
            handleWebMessage({ data: { type: "gamesLive", playing: [], apps: {}, controllers: [] } });
            renderKeymap();
            checks.push(["a redraw leaves the focus on its key", document.activeElement?.dataset?.key === "q" ? [] : ["lost"]]);
            $("commandSearch").value = "clipboard history";
            $("commandSearch").dispatchEvent(new Event("input"));
            const listRows = () => [...document.querySelectorAll("#commandsKeymap .key-row")].filter(row => row.offsetParent).map(row => row.querySelector(".key-row-name").textContent);
            checks.push(["search narrows the lists", listRows().join() === "Clipboard History" ? [] : [listRows().join()]]);
            $("commandSearch").value = "zzzz";
            $("commandSearch").dispatchEvent(new Event("input"));
            checks.push(["and says when nothing matches", !$("commandSearchEmpty").hidden ? [] : ["hidden"]]);
            $("commandSearch").value = "";
            $("commandSearch").dispatchEvent(new Event("input"));
            document.querySelector('#commandsKeymap button.key-row[data-key="v"]').click();
            checks.push(["a list row selects its key", keymapSelected === "v" && $("keyDetailName").textContent === "Clipboard History" ? [] : [keymapSelected]]);
            commandsSections.show("palette");
            checks.push(["search belongs to the key map", $("commandSearch").hidden ? [] : ["showing"]]);
            messages.length = 0;
            $("searchTemplate").value = "https://y/?q=%s";
            $("paletteForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            checks.push(["the palette saves its address", messages.some(message => message.startsWith("SaveSettings") && message.includes("https://y/?q=%s")) ? [] : [messages.join()]]);
            pendingHotkeys = null;
            commandsSections.show("quick");
            saveQuickActions(["view:notes", "view:games"]);
            const quickButton = name => [...$("quickActionEditor").querySelectorAll("button")].find(button => button.getAttribute("aria-label") === name);
            checks.push(["quick actions list their cards", $("quickActionEditor").children.length === 2 && $("quickActionCount").textContent === "2 of 6" ? [] : [$("quickActionCount").textContent]]);
            const quickCard = id => $("quickActionEditor").querySelector(`[data-sort-id="${id}"]`);
            const centerOf = node => { const box = node.getBoundingClientRect(); return { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }; };
            const pointerAt = (node, type, at) => node.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, ...at }));
            messages.length = 0;
            pointerAt(quickCard("view:notes").querySelector(".quick-card-copy"), "pointerdown", centerOf(quickCard("view:notes")));
            pointerAt(document, "pointerup", centerOf(quickCard("view:notes")));
            checks.push(["a press without a drag moves nothing", !messages.some(message => message.startsWith("SaveQuickActions")) && !document.querySelector(".drag-ghost") ? [] : [messages.join()]]);
            const dragTo = centerOf(quickCard("view:games"));
            pointerAt(quickCard("view:notes").querySelector(".quick-card-copy"), "pointerdown", centerOf(quickCard("view:notes")));
            pointerAt(document, "pointermove", dragTo);
            checks.push(["dragging shows a copy under the pointer", document.querySelector(".drag-ghost") && quickCard("view:notes").classList.contains("is-dragging") ? [] : ["no copy"]]);
            pointerAt(document, "pointermove", dragTo);
            checks.push(["and opens its new place", [...$("quickActionEditor").children].map(card => card.dataset.sortId).join() === "view:games,view:notes" ? [] : ["same order"]]);
            checks.push(["nothing is saved until it's dropped", !messages.some(message => message.startsWith("SaveQuickActions")) ? [] : ["saved early"]]);
            pointerAt(document, "pointerup", dragTo);
            checks.push(["dropping saves the new order", currentQuickActionIds().join() === "view:games,view:notes" && messages.some(message => message.startsWith("SaveQuickActions")) ? [] : [currentQuickActionIds().join()]]);
            checks.push(["and clears the copy", !document.querySelector(".drag-ghost") && !$("quickActionEditor").classList.contains("is-sorting") ? [] : ["left behind"]]);
            pointerAt(quickCard("view:notes").querySelector(".drag-grip"), "pointerdown", centerOf(quickCard("view:notes")));
            const backTo = centerOf(quickCard("view:games"));
            pointerAt(document, "pointermove", backTo);
            pointerAt(document, "pointermove", backTo);
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
            checks.push(["Escape puts it back and saves nothing", [...$("quickActionEditor").children].map(card => card.dataset.sortId).join() === "view:games,view:notes" && currentQuickActionIds().join() === "view:games,view:notes" && !document.querySelector(".drag-ghost") ? [] : ["moved"]]);
            pointerAt(document, "pointerup", backTo);
            pointerAt(quickButton("Remove Quick Notes"), "pointerdown", centerOf(quickButton("Remove Quick Notes")));
            pointerAt(document, "pointermove", backTo);
            checks.push(["Remove doesn't start a drag", !document.querySelector(".drag-ghost") ? [] : ["dragging"]]);
            pointerAt(document, "pointerup", backTo);
            const gripOf = id => quickCard(id).querySelector(".drag-grip");
            gripOf("view:notes").focus();
            const movedGrip = gripOf("view:notes");
            gripOf("view:notes").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
            checks.push(["the arrow keys move a card too", currentQuickActionIds().join() === "view:notes,view:games" ? [] : [currentQuickActionIds().join()]]);
            checks.push(["keeping the focus on its grip", document.activeElement === gripOf("view:notes") ? [] : ["lost"]]);
            // 2.0.0 manual pass: a rebuilt card dropped its focus ring.
            checks.push(["the moved card is the same one, so its ring stays", gripOf("view:notes") === movedGrip && movedGrip.isConnected ? [] : ["rebuilt"]]);
            checks.push(["Remove is for the mouse: not a Tab stop", quickButton("Remove Quick Notes").tabIndex === -1 ? [] : ["tab stop"]]);
            checks.push(["nor an arrow-key stop", !arrowCandidates([$("quickActionEditor")], gripOf("view:notes")).some(({ node }) => node.matches(".quick-card .secondary")) ? [] : ["reachable"]]);
            checks.push(["and saying where it went", $("quickActionLive").textContent.includes("place 1 of 2") ? [] : [$("quickActionLive").textContent]]);
            gripOf("view:notes").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
            checks.push(["it stops at the end", currentQuickActionIds().join() === "view:notes,view:games" ? [] : [currentQuickActionIds().join()]]);
            gripOf("view:notes").focus();
            gripOf("view:notes").dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
            checks.push(["Delete on a grip removes its card", currentQuickActionIds().join() === "view:games" ? [] : [currentQuickActionIds().join()]]);
            checks.push(["and the focus moves to the next grip", document.activeElement === gripOf("view:games") ? [] : [document.activeElement?.outerHTML.slice(0, 60)]]);
            saveQuickActions(["view:notes", "view:games"]);
            quickButton("Remove Quick Notes").click();
            checks.push(["removing one saves too", currentQuickActionIds().join() === "view:games" ? [] : [currentQuickActionIds().join()]]);
            navigate("home");
            $("editQuickActions").click();
            checks.push(["Home's Edit goes to them", $("commands").classList.contains("active") && commandsSections.current() === "quick" ? [] : ["elsewhere"]]);
            commandsSections.show("keymap");
            keymapSelected = null;
            quickActionIds = null;
            renderQuickActions();
            checks.push(["no leftover Preferences tabs", !document.querySelector("#tab-prefShortcuts, #tab-prefPalette, #tab-prefCommands") ? [] : ["still there"]]);
            handleWebMessage({ data: { type: "commands", items: [] } });
            messages.length = 0;
            navigate("games");
            gamesSections.show("playing");
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true }));
            checks.push(["Ctrl + F on Games opens the section its box is in", gamesSections.current() === "library" && document.activeElement === $("gameSearch") ? [] : [gamesSections.current()]]);
            document.activeElement.blur();
            gamesSections.show("playing");

            // 2.0.0: Games' sections.
            navigate("games");
            gamesSections.show("playing");
            const sectionPanels = ["gamesPlaying", "gamesLibraryPanel", "gamesAchievementsPanel", "gamesControllersPanel"];
            const showingPanels = () => sectionPanels.filter(id => getComputedStyle($(id)).display !== "none").join();
            const sectionKey = key => $("gamesTabs").dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
            checks.push(["Games opens on one section", showingPanels() === "gamesPlaying" ? [] : [showingPanels()]]);
            $("gamesTabLibrary").click();
            checks.push(["a tab shows its section alone", showingPanels() === "gamesLibraryPanel" && $("gamesTabLibrary").getAttribute("aria-selected") === "true" && $("gamesTabPlaying").getAttribute("aria-selected") === "false" ? [] : [showingPanels()]]);
            sectionKey("ArrowRight");
            checks.push(["Right moves to the next section, with the focus", gamesSections.current() === "achievements" && document.activeElement === $("gamesTabAchievements") ? [] : [gamesSections.current()]]);
            sectionKey("End");
            sectionKey("ArrowRight");
            checks.push(["and wraps around", gamesSections.current() === "playing" ? [] : [gamesSections.current()]]);
            $("gamesTabPlaying").focus();
            gamesSections.show("controllers");
            checks.push(["a section opened from elsewhere brings a focused tab row's focus along", document.activeElement === $("gamesTabControllers") ? [] : [document.activeElement?.id]]);
            gamesSections.show("playing");
            checks.push(["the section tabs stay below the title bar", getComputedStyle(document.querySelector(".section-bar")).top === getComputedStyle(document.documentElement).getPropertyValue("--titlebar-height").trim() ? [] : [getComputedStyle(document.querySelector(".section-bar")).top]]);
            checks.push(["only the selected tab is a Tab stop", [...$("gamesTabs").querySelectorAll("[role='tab']")].filter(tab => tab.tabIndex === 0).map(tab => tab.id).join() === "gamesTabPlaying" ? [] : ["more than one"]]);

            const sectionGame = (id, title, last) => ({ id, title, emulator: "steam", system: "", seconds: 3600, last, plays: 2, launchable: true, installed: true, cover: false });
            messages.length = 0;
            gamesState.details.clear();
            gamesState.detailsAsked.clear();
            gamesState.openId = "";
            $("gamesLibrary").replaceChildren();
            handleWebMessage({ data: { type: "games", covers: true, items: [sectionGame("st:1", "Newer Game", "2026-11-08T10:00:00"), sectionGame("st:2", "Older Game", "2026-10-01T10:00:00")] } });
            checks.push(["the library waits until it's opened", $("gamesLibrary").children.length === 0 && !messages.some(message => message.startsWith("GetGameDetails")) ? [] : ["drawn"]]);
            checks.push(["Continue playing gives each game a Play button", [...$("gamesContinue").querySelectorAll("button")].map(button => button.textContent).join() === "Play,Play" ? [] : ["no button"]]);
            checks.push(["and the cover art box shows the setting", $("showCovers").checked ? [] : ["unchecked"]]);
            $("gamesOpenLibrary").click();
            checks.push(["Library opens with its first game selected", gamesState.openId === "st:1" && $("gameDetail").textContent.includes("Newer Game") && !$("gameDetail").hidden ? [] : [gamesState.openId]]);
            checks.push(["and asks for its details once", messages.filter(message => message.startsWith("GetGameDetails")).length === 1 ? [] : [messages.join(";")]]);
            renderLibrary();
            checks.push(["not again on a redraw", messages.filter(message => message.startsWith("GetGameDetails")).length === 1 ? [] : ["asked again"]]);
            const secondRow = $("gamesLibrary").querySelector('[data-game-id="st:2"] .game-row-toggle');
            secondRow.focus();
            secondRow.click();
            checks.push(["selecting a game leaves the list and the focus alone", document.activeElement === secondRow && secondRow.isConnected ? [] : ["lost"]]);
            checks.push(["and shows it beside the list", secondRow.getAttribute("aria-pressed") === "true" && $("gameDetail").textContent.includes("Older Game") && $("gamesLibrary").querySelectorAll(".is-open").length === 1 ? [] : ["not shown"]]);
            const rowLeft = (id, selector) => Math.round($("gamesLibrary").querySelector(`[data-game-id="${id}"] ${selector}`).getBoundingClientRect().left);
            handleWebMessage({ data: { type: "games", covers: true, items: [
                { ...sectionGame("st:1", "Newer Game", "2024-12-28T10:00:00"), seconds: 1234 * 3600 + 59 * 60 },
                { ...sectionGame("st:2", "Older Game", "2026-10-01T10:00:00"), installed: false }
            ] } });
            const longDate = $("gamesLibrary").querySelector('[data-game-id="st:1"] .game-row-last');
            const longTime = $("gamesLibrary").querySelector('[data-game-id="st:1"] .game-row-time');
            checks.push(["a date with its year fits its column", longDate.textContent.includes("2024") && longDate.scrollWidth <= longDate.clientWidth ? [] : [`${longDate.textContent} ${longDate.scrollWidth}/${longDate.clientWidth}`]]);
            checks.push(["and so does a long play time", longTime.scrollWidth <= longTime.clientWidth ? [] : [`${longTime.textContent} ${longTime.scrollWidth}/${longTime.clientWidth}`]]);
            checks.push(["the library's columns line up, even beside Install", rowLeft("st:1", ".game-row-time") === rowLeft("st:2", ".game-row-time") && rowLeft("st:1", ".game-row-last") === rowLeft("st:2", ".game-row-last") && rowLeft("st:1", "button.secondary") === rowLeft("st:2", "button.secondary") ? [] : ["out of line"]]);
            const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/7yMK/gAAAABJRU5ErkJggg==";
            handleWebMessage({ data: { type: "gamesLive", playing: [{ emulator: "steam", title: "Newer Game", id: "st:1", since: 5 }], apps: {}, controllers: [] } });
            handleCoverMessage("st:1", pixel);
            checks.push(["a running game's cover is Now playing's backdrop", $("gamesNow").querySelector(".now-backdrop img")?.src === pixel ? [] : ["none"]]);
            handleWebMessage({ data: { type: "gamesLive", playing: [], apps: {}, controllers: [] } });
            checks.push(["with nothing running there's no backdrop", $("gamesNow").querySelector(".now-backdrop") ? ["still there"] : []]);
            gamesState.covers.delete("st:1");
            messages.length = 0;
            $("showCovers").click();
            checks.push(["cover art has its own message, changing nothing else", messages.join() === "SetShowCovers\n0" ? [] : [messages.join()]]);
            $("showCovers").click();

            const padList = [{ id: "x1", key: "x1", name: "Pad", mode: "xinput", connection: "usb", slot: 1, rumble: true, power: "wired" }];
            const padLive = () => handleWebMessage({ data: { type: "gamesLive", playing: [], apps: {}, controllers: padList } });
            gamesSections.show("controllers");
            padLive();
            const padButton = [...$("gamesControllers").querySelectorAll("button")].find(button => button.textContent === "Rename");
            padButton.focus();
            padLive();
            checks.push(["the 3-second check leaves a controller's buttons and focus alone", padButton.isConnected && document.activeElement === padButton ? [] : ["redrawn"]]);
            [...$("gamesControllers").querySelectorAll("button")].find(button => button.textContent === "Test").click();
            checks.push(["Test opens the controller test", !$("controllerTester").hidden ? [] : ["hidden"]]);
            gamesSections.show("playing");
            checks.push(["leaving Controllers ends it", $("controllerTester").hidden && !gamesState.testerTimer ? [] : ["still running"]]);
            handleWebMessage({ data: { type: "gamesLive", playing: [], apps: {}, controllers: [] } });

            gamesState.ra.games.set(77, JSON.stringify({ ID: 77, Title: "Newer Game", ConsoleName: "PC", ImageIcon: "/Images/77.png", NumDistinctPlayers: 100, Achievements: {
                1: { ID: 1, Title: "Got It", Points: 5, BadgeName: "1", DisplayOrder: 1, NumAwarded: 10, DateEarned: "2026-11-01 10:00:00" },
                2: { ID: 2, Title: "Next Step", Description: "Do the thing", Points: 10, BadgeName: "2", DisplayOrder: 2, NumAwarded: 5, type: "progression" },
                3: { ID: 3, Title: "Early One", Points: 1, BadgeName: "3", DisplayOrder: 0, NumAwarded: 50 }
            } }));
            messages.length = 0;
            handleWebMessage({ data: "RA\nsummary\n" + JSON.stringify({ User: "Player", TotalPoints: 10, LastGameID: 77, LastGame: { Title: "Newer Game", ConsoleName: "PC" } }) });
            handleWebMessage({ data: "RA\nrecent\n[]" });
            const nextUpText = () => $("gamesNextUp").textContent;
            checks.push(["Next up names the step and the game", !$("gamesNextUp").hidden && nextUpText().includes("Next Step") && nextUpText().includes("Newer Game") ? [] : [nextUpText()]]);
            checks.push(["with the game's latest unlock", nextUpText().includes("Got It") ? [] : [nextUpText()]]);
            checks.push(["Achievements draws nothing while it's closed", !$("gamesAchievements").querySelector(".ra-stats") && !messages.some(message => message.startsWith("GetRaAwards")) ? [] : ["asked"]]);
            [...$("gamesNextUp").querySelectorAll("button")].find(button => button.textContent === "All achievements").click();
            checks.push(["All achievements opens that game there", gamesSections.current() === "achievements" && gamesState.ra.openGame === 77 && $("gamesAchievements").querySelector(".ra-browser") ? [] : [gamesSections.current()]]);
            // 2.3.0: an unlock shows its time, read as UTC, in a named time zone.
            const gotIt = [...$("gamesAchievements").querySelectorAll(".ra-achievement")].find(row => row.textContent.includes("Got It"))?.querySelector(".ra-when");
            // 2.3.0: sorted unlocked first.
            const firstRow = () => $("gamesAchievements").querySelector(".ra-achievement strong")?.textContent;
            const gameOrderFirst = firstRow();
            const raSort = $("gamesAchievements").querySelector(".ra-sort");
            raSort.value = "unlocked";
            raSort.dispatchEvent(new Event("change"));
            checks.push(["Unlocked first puts the unlocked one at the top", gameOrderFirst === "Early One" && firstRow() === "Got It" && gamesState.ra.sort === "unlocked" ? [] : [gameOrderFirst, firstRow()]]);
            gamesState.ra.sort = "order";
            checks.push(["an unlock shows its date and time, saying which zone", /^\w{3} \d{1,2}, 2026, \d{1,2}:\d{2} [AP]M$/.test(gotIt?.querySelector("small")?.textContent || "") && /Times in /.test(gotIt?.title || "") ? [] : [gotIt?.textContent, gotIt?.title]]);
            // 2.9.0: hardcore and softcore together, a trophy for each mode.
            checks.push(["and in which mode, by its trophy and in words", gotIt?.classList.contains("is-softcore") && gotIt.querySelector("svg.icon") && gotIt.querySelector(".sr-only")?.textContent === "Unlocked in softcore: " && /^Softcore unlock/.test(gotIt.title) ? [] : [gotIt?.className, gotIt?.title]]);
            const lockedMeta = [...$("gamesAchievements").querySelectorAll(".ra-achievement")].find(row => row.textContent.includes("Next Step"))?.querySelector(".ra-meta");
            checks.push(["a locked one says so, with how many players have it", lockedMeta?.querySelector(".ra-when.is-locked small")?.textContent === "Locked" && lockedMeta.querySelector(".ra-rarity small")?.textContent === "5%" ? [] : [lockedMeta?.textContent]]);
            const raHead = $("gamesAchievements").querySelector(".ra-stats");
            checks.push(["the header's points lead with trophies, named in words", raHead?.querySelector(".ra-stat-label.is-hardcore svg") && raHead.querySelector(".ra-stat-label.is-hardcore").getAttribute("aria-label") === "Hardcore points" ? [] : [raHead?.textContent]]);
            const softChip = [...$("gamesAchievements").querySelectorAll(".ra-filters button")].find(button => button.textContent.startsWith("Softcore only"));
            checks.push(["Softcore only is offered, with how many", softChip?.textContent === "Softcore only1" ? [] : [softChip?.textContent || "no chip"]]);
            const browserBar = $("gamesAchievements").querySelector(".ra-browser-head .ra-bar");
            const barParts = [...(browserBar?.children || [])].map(part => `${part.className}:${Math.round(parseFloat(part.style.width))}`).join();
            checks.push(["the game's bar shows hardcore, then softcore only", barParts === "is-hardcore:0,is-softcore:33" ? [] : [barParts || "no bar"]]);
            checks.push(["and its line counts both", /1 in softcore only/.test($("gamesAchievements").querySelector(".ra-browser-head").textContent) ? [] : [$("gamesAchievements").querySelector(".ra-browser-head").textContent]]);
            softChip?.click();
            const softRows = [...$("gamesAchievements").querySelectorAll(".ra-achievement strong")].map(node => node.textContent).join();
            checks.push(["and lists only those", softRows === "Got It" ? [] : [softRows]]);
            gamesState.ra.filter = "all";
            gamesState.ra.openGame = 0;
            gamesState.ra.games.delete(77);
            gamesState.items = [];
            gamesState.openId = "";

            // 1.11.0: the site badges.
            navigate("games");
            gamesSections.show("achievements");
            const awardEntry = (type, extra, id, title, when) => ({ AwardedAt: when, Title: title, ConsoleName: "Game Boy", ImageIcon: `/Images/${id}.png`, AwardType: type, AwardData: id, AwardDataExtra: extra });
            handleWebMessage({ data: "RA\nsummary\n" + JSON.stringify({ User: "Player", TotalPoints: 10, Rank: 5, TotalRanked: 100 }) });
            handleWebMessage({ data: "RA\nrecent\n[]" });
            checks.push(["site badges show their shape while they wait", $("gamesAchievements").querySelector(".ra-awards .skel") ? [] : ["no shape"]]);
            handleWebMessage({ data: "RA\nawards\n" + JSON.stringify({ HiddenAwardsCount: 1, VisibleUserAwards: [
                awardEntry("Mastery/Completion", 1, 100, "<img src=x onerror=alert(1)>", "2026-01-01T12:00:00+00:00"),
                awardEntry("Game Beaten", 1, 100, "Same game", "2025-01-01T12:00:00+00:00"),
                awardEntry("Game Beaten", 0, 200, "Beaten one", "2024-01-01T12:00:00+00:00"),
                awardEntry("Event", 0, 160, "An event", "2023-01-01T12:00:00+00:00")
            ] }) });
            const awardBox = $("gamesAchievements");
            handleWebMessage({ data: "RA\nsummary\n" + JSON.stringify({ User: "Player", UserPic: "/UserPic/Player.png", TotalPoints: 10, Rank: 5, TotalRanked: 100 }) });
            checks.push(["the user's picture is asked for by a checked token", messages.some(message => message.startsWith("GetRaImages") && message.includes("u:Player")) ? [] : ["not asked"]]);
            const playerPixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/7yMK/gAAAABJRU5ErkJggg==";
            handleRaImage("u:Player", playerPixel);
            checks.push(["and shows beside the name", awardBox.querySelector(".ra-player .ra-avatar img")?.src === playerPixel && awardBox.querySelector(".ra-player-name").textContent === "Player" && !awardBox.querySelector(".ra-player small") ? [] : ["not shown"]]);
            handleRaImage("u:Player", playerPixel + "AA");
            checks.push(["a newer picture replaces it", awardBox.querySelectorAll(".ra-player .ra-avatar img").length === 1 && awardBox.querySelector(".ra-player .ra-avatar img").src.endsWith("AA") ? [] : ["kept the old one"]]);
            handleRaImage("u:PLAYER", playerPixel);
            checks.push(["the same name in another case is the same picture", awardBox.querySelector(".ra-player .ra-avatar img").src === playerPixel ? [] : ["not updated"]]);
            const pictureBox = awardBox.querySelector(".ra-player").getBoundingClientRect();
            // 2.9.0: above them where the section is narrow.
            const firstNumber = awardBox.querySelector(".ra-stats > span:not(.ra-player)").getBoundingClientRect();
            checks.push(["the name and picture sit left of the numbers, or above them", pictureBox.right <= firstNumber.left || pictureBox.bottom <= firstNumber.top ? [] : ["overlapping"]]);
            handleWebMessage({ data: { type: "gameSettings", paths: {}, retroAchievements: "off" } });
            checks.push(["Check now waits for RetroAchievements to be set up", $("raPictureRefresh").disabled ? [] : ["enabled"]]);
            handleWebMessage({ data: { type: "gameSettings", paths: {}, retroAchievements: "ready" } });
            messages.length = 0;
            $("raPictureRefresh").click();
            checks.push(["Check now asks the backend, which picks the name", messages.join() === "RefreshRaPicture" || messages.join() === "RefreshRaPicture\n" ? [] : [messages.join()]]);
            handleWebMessage({ data: { type: "raPicture", message: "Profile picture is up to date." } });
            checks.push(["and shows the answer", $("gamesStatus").textContent === "Profile picture is up to date." ? [] : [$("gamesStatus").textContent]]);
            handleRaImage("u:../x", playerPixel);
            checks.push(["a token that isn't a name is refused", gamesState.raImages.has("u:../x") ? ["accepted"] : []]);
            checks.push(["All shows each game once", awardBox.querySelectorAll(".ra-award").length === 3 ? [] : [`${awardBox.querySelectorAll(".ra-award").length} tiles`]]);
            checks.push(["and the stats count mastered games", [...awardBox.querySelectorAll(".ra-stats small")].some(node => node.textContent === "Mastered") ? [] : ["not there"]]);
            const statTops = selector => new Set([...awardBox.querySelectorAll(selector)].map(node => Math.round(node.getBoundingClientRect().top))).size;
            checks.push(["the stats' labels and values line up, with a note under one", awardBox.querySelector(".ra-stats em") && statTops(".ra-stats small") === 1 && statTops(".ra-stats strong") === 1 ? [] : ["out of line"]]);
            checks.push(["and their labels are readable", parseFloat(getComputedStyle(awardBox.querySelector(".ra-stats small")).fontSize) >= 12.5 ? [] : ["too small"]]);
            checks.push(["empty tabs are hidden", [...awardBox.querySelectorAll(".ra-award-tab")].map(node => node.dataset.tab).join() === "all,mastered,beaten,event" ? [] : [[...awardBox.querySelectorAll(".ra-award-tab")].map(node => node.dataset.tab).join()]]);
            checks.push(["a mastered game has the gold frame", getComputedStyle(awardBox.querySelector(".ra-award.is-mastered")).borderTopColor !== getComputedStyle(awardBox.querySelector(".ra-award.is-beaten")).borderTopColor ? [] : ["same frame"]]);
            checks.push(["a title stays text", awardBox.querySelector(".ra-awards img") ? ["markup ran"] : []]);
            awardBox.querySelector(".ra-award.is-mastered").dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
            const awardTip = awardBox.querySelector(".ra-award-tip");
            checks.push(["hovering shows the game and date", !awardTip.hidden && awardTip.textContent.includes("Mastered on") && awardTip.textContent.includes("Game Boy") && !awardTip.querySelector("img") ? [] : [awardTip.textContent]]);
            checks.push(["the card stays inside the section", awardTip.offsetLeft >= 0 && awardTip.offsetLeft + awardTip.offsetWidth <= awardBox.querySelector(".ra-awards").offsetWidth ? [] : [`left ${awardTip.offsetLeft}`]]);
            awardBox.querySelector('.ra-award-tab[data-tab="event"]').click();
            checks.push(["a tab shows only its awards", awardBox.querySelectorAll(".ra-award").length === 1 && awardBox.querySelector(".ra-award.is-event") ? [] : ["wrong tiles"]]);
            checks.push(["an event isn't a button, because it opens nothing", awardBox.querySelector(".ra-award.is-event").tagName === "SPAN" ? [] : ["a button"]]);
            handleWebMessage({ data: "RA\nsummary\n" + JSON.stringify({ User: "Player", TotalPoints: 11 }) });
            checks.push(["the tab stays when the section is redrawn", awardBox.querySelector('.ra-award-tab[aria-pressed="true"]')?.dataset.tab === "event" ? [] : ["went back"]]);
            awardBox.querySelector('.ra-award-tab[data-tab="all"]').click();
            messages.length = 0;
            awardBox.querySelector(".ra-award.is-mastered").click();
            checks.push(["a badge opens its game", gamesState.ra.openGame === 100 ? [] : [`open ${gamesState.ra.openGame}`]]);
            checks.push(["the back control is easy to hit", (awardBox.querySelector(".ra-back")?.getBoundingClientRect().height || 0) >= 38 ? [] : ["too small"]]);
            gamesState.ra.openGame = 0;
            handleWebMessage({ data: { type: "raExtra", kind: "awards", ok: false, message: "Unavailable" } });
            gamesState.ra.awards = "";
            renderAchievements();
            checks.push(["a failure says so", awardBox.querySelector(".ra-awards .settings-note")?.textContent === "Unavailable" ? [] : ["no message"]]);
            gamesState.ra.awardsError = "";
            handleWebMessage({ data: "RA\nawards\n" + JSON.stringify({ VisibleUserAwards: [] }) });
            checks.push(["no awards says so", awardBox.querySelector(".ra-awards .settings-note")?.textContent === "No awards yet." ? [] : ["no message"]]);
            checks.push(["asking for awards is allowlisted", new Set(window.SMOKE_ALLOWLIST || []).has("GetRaAwards") ? [] : ["not allowlisted"]]);

            // 2.0.0: attention replaces the status chip.
            navigate("home");
            const attentionShown = () => !$("attentionButton").hidden;
            const attentionText = () => $("attentionLabel").textContent;
            updateSystemStatus({ cpu: 10, ram: 10, drives: [] });
            checks.push(["nothing shows while all is well", attentionShown() ? [attentionText()] : []]);
            handleWebMessage({ data: { type: "testBuild" } });
            checks.push(["a test build says so", !$("testBuildChip").hidden && $("testBuildChip").textContent.includes("Test build") ? [] : ["no chip"]]);
            attentionStreaks = { ...attentionStreaks, at: 0 };
            updateSystemStatus({ cpu: 95, ram: 10, drives: [] });
            checks.push(["one high reading doesn't raise it", attentionShown() ? [attentionText()] : []]);
            updateSystemStatus({ cpu: 95, ram: 10, drives: [] });
            updateSystemStatus({ cpu: 95, ram: 10, drives: [] });
            checks.push(["readings a moment apart don't count as staying high", attentionShown() ? [attentionText()] : []]);
            // As if 5 seconds had passed each time.
            attentionStreaks = { ...attentionStreaks, at: 0 };
            updateSystemStatus({ cpu: 95, ram: 10, drives: [] });
            attentionStreaks = { ...attentionStreaks, at: 0 };
            updateSystemStatus({ cpu: 95, ram: 10, drives: [] });
            checks.push(["staying high does", attentionText() === "1 needs attention" && attentionShown() ? [] : [attentionText()]]);
            updateSystemStatus({ cpu: 10, ram: 10, drives: [] });
            checks.push(["and it clears by itself", attentionShown() ? [attentionText()] : []]);
            window.dispatchEvent(new ErrorEvent("error", { message: "<b>boom</b>", filename: "x.js", lineno: 1 }));
            window.dispatchEvent(new ErrorEvent("error", { message: "second", filename: "x.js", lineno: 2 }));
            errors.splice(0);
            updateSystemStatus({ cpu: 10, ram: 10, drives: [{ online: true, letter: "J:", usage: 94, used: 3, total: 4 }] });
            checks.push(["a page error and a full drive are both counted", attentionText() === "2 need attention" && $("attentionButton").dataset.tone === "burgundy" ? [] : [attentionText()]]);
            $("attentionButton").click();
            checks.push(["the button opens the list", !$("attentionPanel").hidden && $("attentionList").children.length === 2 ? [] : ["not open"]]);
            checks.push(["and keeps hostile text as text", $("attentionList").querySelector("b") ? ["markup ran"] : []]);
            const logButton = [...$("attentionList").querySelectorAll("button")].find(button => button.textContent === "View log");
            logButton?.click();
            checks.push(["View log opens the logs", $("dashboard").classList.contains("active") && systemSections.current() === "activity" ? [] : ["not open"]]);
            systemSections.show("live");
            checks.push(["and clears the error", attentionText() === "1 needs attention" && unseenPageErrors === 0 ? [] : [attentionText()]]);
            $("attentionButton").click();
            $("attentionDismissAll").click();
            checks.push(["Dismiss all hides it", attentionShown() ? [attentionText()] : []]);
            updateSystemStatus({ cpu: 10, ram: 10, drives: [{ online: true, letter: "J:", usage: 94, used: 3, total: 4 }] });
            checks.push(["it stays dismissed while it's still true", attentionShown() ? [attentionText()] : []]);
            updateSystemStatus({ cpu: 10, ram: 10, drives: [] });
            updateSystemStatus({ cpu: 10, ram: 10, drives: [{ online: true, letter: "J:", usage: 94, used: 3, total: 4 }] });
            checks.push(["and comes back if it clears and returns", attentionShown() ? [] : ["hidden"]]);
            updateSystemStatus({ cpu: 10, ram: 10, drives: [] });
            isTestBuild = false;
            renderTopStatus();

            // 2.0.0: page keys, and the letters in the power tray. Nothing here can
            // finish a hold, and sent messages are checked against the allowlist.
            const key = (type, code, options = {}) => document.dispatchEvent(new KeyboardEvent(type, { code, key: code.replace(/^Key/, "").toLowerCase(), bubbles: true, cancelable: true, ...options }));
            const ctrl = keyName => document.dispatchEvent(new KeyboardEvent("keydown", { key: keyName, ctrlKey: true, bubbles: true, cancelable: true }));
            navigate("home");
            ctrl("-");
            checks.push(["Ctrl + - opens Preferences", $("settings").classList.contains("active") ? [] : ["not open"]]);
            ctrl("0");
            checks.push(["Ctrl + 0 is free", $("settings").classList.contains("active") ? [] : ["it moved"]]);
            ctrl("8");
            checks.push(["Ctrl + 8 is Commands", $("commands").classList.contains("active") ? [] : ["not open"]]);
            ctrl("=");
            checks.push(["Ctrl + = opens the tray", !$("powerTray").hidden ? [] : ["not open"]]);
            ctrl("=");
            checks.push(["and closes it", $("powerTray").hidden ? [] : ["still open"]]);
            checks.push(["each sidebar item shows its key", document.querySelector('.nav[data-view="settings"] .nav-key')?.textContent === "-" && $("powerTrayButton").querySelector(".nav-key")?.textContent === "=" ? [] : ["wrong keys"]]);
            const holdButton = action => document.querySelector(`[data-power-hold="${action}"]`);
            const holding = action => Boolean(holdButton(action).dataset.holding);
            key("keydown", "KeyS");
            checks.push(["a letter does nothing while the tray is closed", holding("shutdown") ? ["holding"] : []]);
            key("keyup", "KeyS");
            navigate("home");
            togglePowerTray(true);
            handleWebMessage({ data: { type: "recycleBin", items: 3, bytes: 4000 } });
            sent.clear();
            [["KeyS", "shutdown"], ["KeyZ", "sleep"], ["KeyO", "signout"], ["KeyB", "recycle"], ["KeyR", "restart"]].forEach(([code, action]) => {
                key("keydown", code);
                checks.push([`${code} holds ${action}`, holding(action) ? [] : ["no hold"]]);
                key("keyup", code);
                checks.push([`and letting go cancels it`, holding(action) ? ["still holding"] : []]);
            });
            checks.push(["every hold key has its cap", document.querySelectorAll("#powerTray [data-power-hold] .power-key").length === 5 ? [] : ["missing"]]);
            key("keydown", "KeyS");
            key("keydown", "KeyR");
            checks.push(["two keys stop the hold", holding("shutdown") || holding("restart") ? ["holding"] : []]);
            checks.push(["and the tray says why", $("powerHint").classList.contains("is-blocked") ? [] : ["no message"]]);
            key("keyup", "KeyR");
            key("keydown", "KeyZ");
            checks.push(["nothing is taken until every key is up", holding("sleep") ? ["holding"] : []]);
            key("keyup", "KeyZ");
            key("keyup", "KeyS");
            checks.push(["and then the message clears", $("powerHint").classList.contains("is-blocked") ? ["still blocked"] : []]);
            key("keydown", "KeyR");
            checks.push(["and a single key works again", holding("restart") ? [] : ["no hold"]]);
            window.dispatchEvent(new Event("blur"));
            checks.push(["leaving the window stops a hold", holding("restart") ? ["holding"] : []]);
            key("keyup", "KeyR");
            key("keydown", "KeyS", { repeat: true });
            checks.push(["a key already down when the tray opened doesn't count", holding("shutdown") ? ["holding"] : []]);
            key("keydown", "KeyB", { ctrlKey: true });
            checks.push(["nor a letter with a modifier", holding("recycle") ? ["holding"] : []]);
            key("keyup", "KeyB");
            handleWebMessage({ data: { type: "recycleBin", items: 0, bytes: 0 } });
            key("keydown", "KeyB");
            checks.push(["an empty Recycle Bin can't be held", holding("recycle") ? ["holding"] : []]);
            key("keyup", "KeyB");
            key("keydown", "KeyR");
            togglePowerTray(false);
            checks.push(["closing the tray stops a hold", holding("restart") ? ["holding"] : []]);
            key("keyup", "KeyR");
            checks.push(["none of this asked ASCS to do anything", sent.has("PowerArm") || sent.has("PowerRun") ? ["sent a power message"] : []]);
            checks.push(["no errors from the 2.0.0 shell checks", errors.splice(0)]);

            // 2.0.0: one heading per section.
            checks.push(["sections have one heading", document.querySelector(".section-overline + h2, .section-overline + h3") ? ["doubled"] : []]);
            checks.push(["and Games names RetroAchievements once", $("achievementsHeading").textContent === "RetroAchievements" && !document.querySelector("#games .section-overline") ? [] : [$("achievementsHeading").textContent]]);

            // 2.0.0: the arm swings when a hidden window opens.
            const swingArm = document.querySelector(".brand-mark .mark-arm");
            const swinging = () => swingArm.getAnimations().some(item => item.animationName === "mark-swing");
            const stopSwing = () => { swingArm.getAnimations().forEach(item => item.cancel()); swingArm.classList.remove("is-swinging", "is-previewing"); };
            const pause = time => new Promise(resolve => setTimeout(resolve, time));
            const opened = async () => { handleWebMessage({ data: { type: "windowShown" } }); await pause(160); };
            const hiddenAgain = () => handleWebMessage({ data: { type: "windowHidden" } });
            const angle = () => { const matrix = new DOMMatrix(getComputedStyle(swingArm).transform); return Math.round(Math.atan2(matrix.b, matrix.a) * 180 / Math.PI); };
            const savedSwing = localStorage.getItem(LOGO_SWING_KEY);
            localStorage.removeItem(LOGO_SWING_KEY);
            markHasSwung = false;
            windowIsHidden = true;
            prepareMark();
            checks.push(["the arm waits at its rest before the first opening", angle() === 0 && !swinging() ? [] : [angle()]]);
            await opened();
            checks.push(["by default, the first opening swings it", swinging() ? [] : ["no swing"]]);
            const armAt = time => {
                const motion = swingArm.getAnimations()[0];
                motion.pause();
                motion.currentTime = time;
                return angle();
            };
            checks.push(["it starts from its rest, so nothing jumps", armAt(0) === 0 ? [] : [armAt(0)]]);
            checks.push(["swings left first", armAt(850) === -40 ? [] : [armAt(850)]]);
            checks.push(["back to the right", armAt(1700) === 0 ? [] : [armAt(1700)]]);
            checks.push(["crosses center on the way", armAt(425) === -20 ? [] : [armAt(425)]]);
            checks.push(["without stopping there", armAt(325) - armAt(525) > 4 ? [] : [armAt(325), armAt(525)]]);
            checks.push(["left again, and ends on the right, at rest", armAt(2550) === -40 && armAt(3399) === 0 ? [] : [armAt(2550), armAt(3399)]]);
            stopSwing();
            checks.push(["its rest is the drawn lean", angle() === 0 ? [] : [angle()]]);
            hiddenAgain();
            checks.push(["after the first time, it stays at rest", angle() === 0 ? [] : [angle()]]);
            await opened();
            checks.push(["and the next opening doesn't swing it", swinging() ? ["swinging"] : []]);
            localStorage.setItem(LOGO_SWING_KEY, "every");
            hiddenAgain();
            checks.push(["every time: hiding leaves it at rest", angle() === 0 && !swinging() ? [] : [angle()]]);
            await opened();
            checks.push(["and opening swings it again", swinging() ? [] : ["no swing"]]);
            hiddenAgain();
            checks.push(["hiding partway puts it back at rest, out of sight", !swinging() && angle() === 0 ? [] : [angle()]]);
            stopSwing();
            localStorage.setItem(LOGO_SWING_KEY, "never");
            markHasSwung = false;
            hiddenAgain();
            checks.push(["never stays at its rest", angle() === 0 ? [] : [angle()]]);
            await opened();
            checks.push(["and doesn't swing", swinging() ? ["swinging"] : []]);
            if (savedSwing === null) localStorage.removeItem(LOGO_SWING_KEY); else localStorage.setItem(LOGO_SWING_KEY, savedSwing);
            hiddenAgain();
            stopSwing();
            // 2.0.0: text size.
            const floorSize = () => parseFloat(getComputedStyle($("breadcrumb")).fontSize);
            const titleAtDefault = floorSize();
            applyTextSize(120);
            checks.push(["text size reaches the shell", Math.abs(floorSize() - titleAtDefault * 1.2) < 0.5 ? [] : [floorSize()]]);
            applyTextSize(100);
            checks.push(["and goes back", floorSize() === titleAtDefault ? [] : [floorSize()]]);

            // 2.0.0: the mouse's side buttons.
            const side = (type, button) => document.dispatchEvent(new MouseEvent(type, { button, bubbles: true, cancelable: true }));
            const press = button => { side("mousedown", button); side("mouseup", button); };
            navigate("home");
            navigate("games");
            navigate("sounds");
            press(3);
            checks.push(["mouse back returns a page", $("games").classList.contains("active") ? [] : ["not Games"]]);
            press(4);
            checks.push(["mouse forward goes on again", $("sounds").classList.contains("active") ? [] : ["not Sounds"]]);
            press(3);
            navigate("calendar");
            press(4);
            checks.push(["a new page drops the ones ahead", $("calendar").classList.contains("active") ? [] : ["moved"]]);
            toggleHelp(true);
            press(3);
            checks.push(["an open dialog holds the page", $("calendar").classList.contains("active") ? [] : ["moved"]]);
            toggleHelp(false);
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "BrowserBack", bubbles: true, cancelable: true }));
            checks.push(["the browser back key works too", $("games").classList.contains("active") ? [] : ["not Games"]]);

            // 2.0.0: arrow keys between controls.
            navigate("home");
            const arrow = key => { const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }); document.activeElement.dispatchEvent(event); return event; };
            const navItem = view => document.querySelector(`.primary-nav .nav[data-view="${view}"]`);
            navItem("home").focus();
            arrow("ArrowDown");
            checks.push(["down moves through the sidebar", document.activeElement === navItem("notes") ? [] : [document.activeElement.id || document.activeElement.className]]);
            arrow("ArrowUp");
            checks.push(["and up moves back", document.activeElement === navItem("home") ? [] : ["elsewhere"]]);
            arrow("ArrowRight");
            checks.push(["right leaves the sidebar", document.querySelector(".sidebar").contains(document.activeElement) ? ["still there"] : []]);
            navigate("sounds");
            $("soundSearch").focus();
            const typing = arrow("ArrowDown");
            checks.push(["a text field keeps its arrows", document.activeElement === $("soundSearch") && !typing.defaultPrevented ? [] : ["moved"]]);
            navigate("home");
            navItem("home").focus();
            togglePowerTray(true);
            const inTray = $("powerTray").querySelector("button:not(:disabled)");
            inTray.focus();
            arrow("ArrowDown");
            checks.push(["an open tray keeps focus inside", $("powerTray").contains(document.activeElement) ? [] : ["left the tray"]]);
            togglePowerTray(false);
            toggleHelp(true);
            $("helpClose").focus();
            arrow("ArrowDown");
            checks.push(["an open dialog keeps focus inside", $("helpDialog").contains(document.activeElement) ? [] : ["left the dialog"]]);
            toggleHelp(false);
            navigate("home");
            // 2.0.0: F6, Alt + arrows and /.
            const press2 = (key, options = {}) => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }));
            navigate("home");
            navItem("home").focus();
            press2("F6");
            checks.push(["F6 moves to the title bar", document.querySelector(".topbar").contains(document.activeElement) ? [] : ["elsewhere"]]);
            press2("F6");
            checks.push(["then the page", $("home").contains(document.activeElement) ? [] : ["elsewhere"]]);
            press2("F6");
            checks.push(["then back to the sidebar", document.querySelector(".sidebar").contains(document.activeElement) ? [] : ["elsewhere"]]);
            press2("F6", { shiftKey: true });
            checks.push(["Shift + F6 goes the other way", $("home").contains(document.activeElement) ? [] : ["elsewhere"]]);
            navigate("games");
            navigate("sounds");
            navItem("sounds").focus();
            press2("ArrowLeft", { altKey: true });
            checks.push(["Alt + Left goes back a page", $("games").classList.contains("active") ? [] : ["not Games"]]);
            navItem("games").focus();
            press2("ArrowRight", { altKey: true });
            checks.push(["Alt + Right goes forward", $("sounds").classList.contains("active") ? [] : ["not Sounds"]]);
            navigate("home");
            navItem("home").focus();
            press2("/");
            checks.push(["/ opens search", !$("launcher").hidden ? [] : ["not open"]]);
            closeLauncher();
            $("homeNoteInput").focus();
            press2("/");
            checks.push(["but not while typing", $("launcher").hidden ? [] : ["opened"]]);

            // 2.0.0: System.
            navigate("dashboard");
            systemSections.show("live");
            updateMetrics({ cpu: 95, ram: 40, ramUsed: 25.6, ramTotal: 64, drives: [{ letter: "C:", online: true, usage: 71, used: 1370, total: 1907 }, { letter: "E:", online: false }], history: [[10, 20], [30, 40], [50, 40]] });
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true }));
            checks.push(["Ctrl + F goes to the log filter", systemSections.current() === "activity" && document.activeElement === $("logSearch") ? [] : [systemSections.current()]]);
            systemSections.show("live");
            checks.push(["System's drives are the same rows as Home", $("dashboardDrives").querySelectorAll(".sys-row").length === 2 ? [] : ["wrong count"]]);
            checks.push(["an offline drive just says so", /Offline/.test($("dashboardDrives").textContent) && !/in use/.test($("dashboardDrives").textContent) ? [] : [$("dashboardDrives").textContent]]);
            checks.push(["a busy processor shows gold", $("cpu").classList.contains("is-high") ? [] : ["no gold"]]);
            checks.push(["the graph summarizes itself", $("cpuHistory").textContent.includes("peak 95%") ? [] : [$("cpuHistory").textContent]]);
            const cpuPlot = $("cpuChart");
            pointerAt(cpuPlot, "pointermove", { clientX: cpuPlot.getBoundingClientRect().right - 1, clientY: cpuPlot.getBoundingClientRect().top + 5 });
            checks.push(["the pointer reads the graph", cpuPlot.querySelector(".chart-tip").textContent === "95%now" && !cpuPlot.querySelector(".chart-rule").hidden ? [] : [cpuPlot.querySelector(".chart-tip").textContent]]);
            pointerAt(cpuPlot, "pointermove", { clientX: cpuPlot.getBoundingClientRect().left + 1, clientY: cpuPlot.getBoundingClientRect().top + 5 });
            checks.push(["its oldest sample too", cpuPlot.querySelector(".chart-tip").textContent === "10%30 s ago" ? [] : [cpuPlot.querySelector(".chart-tip").textContent]]);
            // 2.0.0 manual pass: points carry their time, shown on the clock.
            const nowSeconds = Math.round(Date.now() / 1000);
            updateMetrics({ cpu: 95, ram: 40, drives: [], history: [[10, 20], [30, 40], [50, 40]], historyTimes: [nowSeconds - 30, nowSeconds - 20, nowSeconds - 10] });
            pointerAt(cpuPlot, "pointermove", { clientX: cpuPlot.getBoundingClientRect().left + 1, clientY: cpuPlot.getBoundingClientRect().top + 5 });
            const oldestClock = clockTime(nowSeconds - 30);
            checks.push(["a point shows its time on the clock, and how long ago", cpuPlot.querySelector(".chart-tip").textContent === `10%${oldestClock} · 30 s ago` ? [] : [cpuPlot.querySelector(".chart-tip").textContent]]);
            checks.push(["and so does the graph's start", $("cpuSince").textContent === `${oldestClock} · 30 s ago` ? [] : [$("cpuSince").textContent]]);
            pointerAt(cpuPlot, "pointermove", { clientX: cpuPlot.getBoundingClientRect().right - 1, clientY: cpuPlot.getBoundingClientRect().top + 5 });
            checks.push(["the newest is now", /^95%\d{1,2}:\d{2}:\d{2}\s?[AP]M · now$/.test(cpuPlot.querySelector(".chart-tip").textContent) ? [] : [cpuPlot.querySelector(".chart-tip").textContent]]);
            pointerAt(cpuPlot, "pointerleave", {});
            checks.push(["and lets go", cpuPlot.querySelector(".chart-tip").hidden ? [] : ["still showing"]]);
            // 2.0.0: 5 minutes, an hour or a day.
            checks.push(["the timescale shows on Live", !$("historyScale").hidden ? [] : ["hidden"]]);
            messages.length = 0;
            document.querySelector('#historyScale [data-scale="minutes"]').click();
            checks.push(["choosing 24 hours asks for it", messages.includes("SetHistoryScale\nminutes") && document.querySelector('#historyScale [data-scale="minutes"]').getAttribute("aria-pressed") === "true" ? [] : [messages.join(";")]]);
            checks.push(["and starts its graph over", /builds every minute/.test($("cpuHistory").textContent) ? [] : [$("cpuHistory").textContent]]);
            updateMetrics({ cpu: 30, ram: 40, drives: [], historyScale: "tens", history: [[1, 1, 1, 1], [2, 2, 2, 2]] });
            checks.push(["a series for another scale is set aside", /builds every minute/.test($("cpuHistory").textContent) ? [] : [$("cpuHistory").textContent]]);
            updateMetrics({ cpu: 30, ram: 40, drives: [], historyScale: "minutes", history: Array.from({ length: 120 }, (_, i) => [20, 40, i === 50 ? 88 : 25, 45]) });
            checks.push(["minutes: the summary uses the peaks and the span", /peak 88%, last 2 h/.test($("cpuHistory").textContent) ? [] : [$("cpuHistory").textContent]]);
            updateMetrics({ cpu: 31, ram: 40, drives: [], historyScale: "minutes", history: null });
            checks.push(["a reading with no new point keeps the series", /peak 88%/.test($("cpuHistory").textContent) ? [] : [$("cpuHistory").textContent]]);
            checks.push(["the scale is kept", localStorage.getItem("maestro.historyScale") === "minutes" ? [] : ["not kept"]]);
            setHistoryScale("tens");
            systemSections.show("hardware");
            checks.push(["the timescale hides on other sections", $("historyScale").hidden ? [] : ["showing"]]);
            systemSections.show("live");
            checks.push(["Monitored drives moved to System", $("dashboard").contains($("driveLetters")) && !$("settings").contains($("driveLetters")) ? [] : ["elsewhere"]]);
            handleWebMessage({ data: { type: "settings", drives: ["C:"], snapGap: 0, preserveSize: true, hotkeys: {}, claudeShortcut: "Ctrl+Alt+Space", powerDelay: 0, ascsSounds: "show", searchTemplate: "https://x/?q=%s" } });
            $("chooseDrives").click();
            checks.push(["Choose drives opens its form", !$("driveForm").hidden && document.activeElement === $("driveLetters") && $("chooseDrives").getAttribute("aria-expanded") === "true" ? [] : ["closed"]]);
            $("driveLetters").value = "Z:";
            $("driveCancel").click();
            checks.push(["Cancel puts the letters back", $("driveForm").hidden && $("driveLetters").value === "C:" ? [] : [$("driveLetters").value]]);
            $("chooseDrives").click();
            $("driveLetters").value = "C:, J:";
            messages.length = 0;
            $("driveForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            checks.push(["Save sends the letters", messages.some(message => message.startsWith("SaveSettings") && message.includes("C:, J:")) ? [] : [messages.join()]]);
            handleWebMessage({ data: { type: "error", scope: "settings", message: "Those letters won't do." } });
            checks.push(["a refused save stays open and says why", !$("driveForm").hidden && $("driveStatus").textContent === "Those letters won't do." ? [] : [$("driveStatus").textContent]]);
            $("driveForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            handleWebMessage({ data: { type: "settingsSaved", message: "Saved." } });
            checks.push(["a saved one closes and keeps them", $("driveForm").hidden && $("driveLetters").value === "C:, J:" ? [] : [$("driveLetters").value]]);
            $("chooseDrives").click();
            $("driveLetters").value = "Q:";
            navigate("home");
            checks.push(["leaving drops what wasn't saved", $("driveForm").hidden && $("driveLetters").value === "C:, J:" ? [] : [$("driveLetters").value]]);
            handleWebMessage({ data: { type: "activity", items: Array.from({ length: 12 }, (_, index) => ({ kind: "launch", text: `Item ${index}`, time: new Date().toISOString() })) } });
            checks.push(["recent activity lists more than a few, newest first", $("activityList").children.length === 12 && $("activityList").firstElementChild.textContent.includes("Item 11") ? [] : [$("activityList").children.length]]);

            // 2.0.0: the Podium.
            navigate("games");
            sent.clear();
            navigate("home");
            checks.push(["Home asks for what's running", sent.has("GetGamesLive") ? [] : ["no request"]]);
            checks.push(["Home never asks RetroAchievements", sent.has("GetRetroAchievements") ? ["asked"] : []]);
            checks.push(["a stray Arrange button stays off other pages", (navigate("games"), $("arrangeButton").hidden) ? [] : ["showing"]]);
            navigate("home");
            checks.push(["Arrange shows on Home", $("arrangeButton").hidden ? ["hidden"] : []]);
            // 2.0.0: a quick Arrange then Done maximized the window, as a double-click on the drag area.
            const dragOf = node => getComputedStyle(node).getPropertyValue("app-region") || getComputedStyle(node).getPropertyValue("-webkit-app-region");
            checks.push(["the title bar is a drag area, as the test assumes", dragOf(document.querySelector(".topbar")) === "drag" ? [] : [dragOf(document.querySelector(".topbar")) || "unreadable"]]);
            checks.push(["but none of its buttons are", [...document.querySelectorAll(".topbar button")].filter(button => dragOf(button) !== "no-drag").map(button => button.id || button.className)]);
            // 2.0.0 manual pass: the drive bars were a scrollbar's width shorter than Processor's.
            renderHomeDrives([{ letter: "C:", online: true, usage: 71, used: 1370, total: 1907 }, { letter: "D:", online: true, usage: 20, used: 200, total: 1000 }]);
            const trackWidth = node => Math.round(node.closest(".metric-track").getBoundingClientRect().width);
            const driveTracks = [...$("homeDrives").querySelectorAll(".metric-track span")].map(trackWidth);
            checks.push(["drive bars are as long as the processor's", driveTracks.length === 2 && driveTracks.every(width => width === trackWidth($("homeCpuBar"))) ? [] : [trackWidth($("homeCpuBar")), ...driveTracks]]);
            // 2.2.0: System's readings share two columns at every width, so six drives fit a
            // square in whole rows at the real window (the preview audit measures that).
            {
                const system = document.querySelector('#homeFace [data-module="system"]');
                const width = system.dataset.width;
                system.dataset.width = "1";
                const [cpu, memory] = [$("homeCpu"), $("homeRam")].map(value => value.closest(".sys-row").getBoundingClientRect());
                checks.push(["System's readings share two columns in one square", Math.abs(cpu.top - memory.top) < 1 && memory.left > cpu.right ? [] : [`${Math.round(cpu.top)} ${Math.round(memory.top)}`]]);
                system.dataset.width = width;
            }
            // 2.2.0: a badge still on its way shows a mark, not an empty box.
            {
                const badge = raImage("", "ra-badge");
                $("home").append(badge);
                checks.push(["a badge without its picture shows a mark", getComputedStyle(badge, "::after").content !== "none" ? [] : ["empty"]]);
                badge.remove();
            }
            const moduleCount = document.querySelectorAll("#homeFace > [data-module]").length;
            checks.push(["every module in the list is on the page", moduleCount === MaestroHomeLayout.MODULES.length ? [] : [moduleCount]]);
            const savedLayout = localStorage.getItem(HOME_LAYOUT_KEY);
            const savedLayouts = localStorage.getItem(HOME_LAYOUTS_KEY);
            const savedHomeState = { saved: homeSaved, session: homeGameSession };
            // 2.0.0: Arrange, on the page itself.
            const moduleOrder = id => Number(document.querySelector(`#homeFace [data-module="${id}"]`).style.order);
            const moduleWidth = id => document.querySelector(`#homeFace [data-module="${id}"]`).dataset.width;
            const arrangeGrip = id => document.querySelector(`[data-arrange="${id}-grip"]`);
            const arrangeKey = (id, key, shift = false, code = "") => arrangeGrip(id).dispatchEvent(new KeyboardEvent("keydown", { key, code, shiftKey: shift, bubbles: true, cancelable: true }));
            const moduleHeight = id => document.querySelector(`#homeFace [data-module="${id}"]`).dataset.height;
            const tile = id => document.querySelector(`#homeFace [data-module="${id}"] > .arrange-overlay`);
            const storedLayout = () => MaestroHomeLayout.parse(localStorage.getItem(HOME_LAYOUT_KEY));
            changeHomeLayout(MaestroHomeLayout.defaults());
            $("arrangeButton").click();
            checks.push(["Arrange turns the modules into tiles", $("home").classList.contains("is-arranging") && document.querySelectorAll("#homeFace > [data-module] > .arrange-overlay:not([hidden])").length === moduleCount && !$("arrangeDock").hidden ? [] : ["not arranging"]]);
            checks.push(["and its button becomes Done", $("arrangeButton").textContent === "Done" && $("arrangeButton").getAttribute("aria-pressed") === "true" ? [] : [$("arrangeButton").textContent]]);
            checks.push(["a module's own controls are out of reach", $("todayOpen").closest("[inert]") && $("homeNoteInput").closest("[inert]") ? [] : ["reachable"]]);
            checks.push(["the dock says how it fits", $("arrangeFit").textContent === "This fills the window." ? [] : [$("arrangeFit").textContent]]);
            checks.push(["and holds the modules that start hidden", ["weather", "processes", "network", "audio", "controllers", "pinned", "unlocks", "timer", "metronome"].every(id => document.querySelector(`[data-arrange="${id}-show"]`)) ? [] : [$("arrangeTray").textContent]]);
            checks.push(["focus starts on the first tile's grip", document.activeElement === arrangeGrip("now") ? [] : [document.activeElement?.dataset.arrange]]);
            // 2.0.0 manual pass: the dock takes the sidebar's place, in one shape.
            // Measured on screen, with every animation at its end: a transform the
            // page's entry animation kept once pinned the dock to the page, not the window.
            const dock = $("arrangeDock");
            const settle = () => document.getAnimations().forEach(animation => { try { animation.finish(); } catch { /* endless */ } });
            const dockShape = () => { settle(); const box = dock.getBoundingClientRect(); return `${Math.round(box.left)},${Math.round(box.top)},${Math.round(box.width)},${Math.round(box.height)}`; };
            const dockShapeAtStart = dockShape();
            const dockBox = dock.getBoundingClientRect(), sidebarBox = document.querySelector(".sidebar").getBoundingClientRect();
            checks.push(["the dock lies on the sidebar, inset within it", dockBox.left > sidebarBox.left && dockBox.right < sidebarBox.right && dockBox.top > 0 && dockBox.bottom < innerHeight ? [] : [dockShapeAtStart, Math.round(sidebarBox.right)]]);
            checks.push(["with the sidebar dimmed beneath it", Number(getComputedStyle(document.querySelector(".sidebar > *")).opacity) < 0.5 ? [] : ["not dimmed"]]);
            checks.push(["and no module", [...document.querySelectorAll("#homeFace > [data-module]:not([hidden])")].every(module => module.getBoundingClientRect().left >= dockBox.right - 1) ? [] : [dockShapeAtStart]]);
            checks.push(["no page keeps a transform, which would pin what's fixed inside it to the page", [...document.querySelectorAll(".view")].filter(view => getComputedStyle(view).transform !== "none").map(view => `${view.id} (${getComputedStyle(view).transform}; ${view.getAnimations().map(animation => `${animation.animationName || animation.constructor.name} ${animation.playState}`).join(", ") || "no animations"}; ${getComputedStyle(view).animationName})`)]);
            checks.push(["the sidebar under it is out of reach", document.querySelector(".sidebar").inert ? [] : ["reachable"]]);
            arrangeGrip("today").focus();
            arrangeKey("today", "ArrowLeft");
            checks.push(["the arrow keys move a module", moduleOrder("today") === 0 && document.activeElement === arrangeGrip("today") ? [] : [moduleOrder("today")]]);
            checks.push(["and say where it went", $("arrangeLive").textContent.includes("place 1 of") ? [] : [$("arrangeLive").textContent]]);
            arrangeKey("today", "ArrowUp");
            checks.push(["it stops at the start", moduleOrder("today") === 0 ? [] : [moduleOrder("today")]]);
            arrangeKey("today", "ArrowRight", true);
            checks.push(["Shift and Right widen it", moduleWidth("today") === "2" && /2 squares wide/.test($("arrangeLive").textContent) ? [] : [moduleWidth("today")]]);
            checks.push(["and the dock says the page will scroll", /needs 4 rows/.test($("arrangeFit").textContent) ? [] : [$("arrangeFit").textContent]]);
            tile("today").querySelector('[data-arrange="today-size-1x1"]').click();
            checks.push(["its size picker sets it too", moduleWidth("today") === "1" && tile("today").querySelector('[data-arrange="today-size-1x1"]').getAttribute("aria-pressed") === "true" ? [] : [moduleWidth("today")]]);
            // 2.9.0: heights.
            tile("note").querySelector('[data-arrange="note-size-1x3"]').click();
            checks.push(["the picker sets a height", moduleHeight("note") === "3" && storedLayout().heights.note === 3 && tile("note").querySelector(".arrange-size-label").textContent === "1 × 3" ? [] : [moduleHeight("note")]]);
            checks.push(["and shades the squares it covers", tile("note").querySelectorAll(".arrange-size .is-covered").length === 3 ? [] : [tile("note").querySelectorAll(".arrange-size .is-covered").length]]);
            checks.push(["a module that can't use more rows has them off", [...tile("system").querySelectorAll(".arrange-size button")].filter(button => button.disabled).length === 6 && tile("now").querySelectorAll(".arrange-size button:disabled").length === 3 ? [] : ["offered"]]);
            arrangeGrip("note").focus();
            arrangeKey("note", "!", true, "Digit1");
            checks.push(["Shift and a number set the height from the grip", moduleHeight("note") === "1" ? [] : [moduleHeight("note")]]);
            arrangeKey("note", "ArrowDown", true);
            checks.push(["so do Shift and Down", moduleHeight("note") === "2" && /1 square wide, 2 tall/.test($("arrangeLive").textContent) ? [] : [moduleHeight("note"), $("arrangeLive").textContent]]);
            arrangeKey("note", "ArrowUp", true);
            checks.push(["and Shift and Up", moduleHeight("note") === "1" ? [] : [moduleHeight("note")]]);
            arrangeGrip("now").focus();
            arrangeKey("now", "#", true, "Digit3");
            checks.push(["past what a module can use, it says so", moduleHeight("now") === "1" && /at most 2 tall/.test($("arrangeLive").textContent) ? [] : [moduleHeight("now"), $("arrangeLive").textContent]]);
            arrangeKey("now", "@", true, "Digit2");
            // The smoke window is 1600 wide: two columns, where heights wait for a wider window (the 2540 previews show them).
            checks.push(["in a window under 1701 wide, a tall module keeps one row", innerWidth >= 1701 || getComputedStyle(homeModule("now")).gridRowEnd === "auto" ? [] : [getComputedStyle(homeModule("now")).gridRowEnd]]);
            checks.push(["and is marked for a wider one", homeModule("now").dataset.height === "2" ? [] : [homeModule("now").dataset.height]]);
            checks.push(["and the dock counts the rows it needs", /needs 4 rows/.test($("arrangeFit").textContent) ? [] : [$("arrangeFit").textContent]]);
            arrangeKey("now", "!", true, "Digit1");
            // 2.0.0 manual pass: Tab goes grip to grip; the numbers set the width.
            arrangeGrip("today").focus();
            arrangeKey("today", "3");
            checks.push(["3 on a grip makes it 3 squares wide", moduleWidth("today") === "3" && document.activeElement === arrangeGrip("today") ? [] : [moduleWidth("today")]]);
            arrangeKey("today", "1");
            checks.push(["and 1 makes it 1", moduleWidth("today") === "1" ? [] : [moduleWidth("today")]]);
            const tileStops = [...tile("today").querySelectorAll("button")].filter(button => button.tabIndex >= 0);
            checks.push(["a tile's only Tab stop is its grip", tileStops.length === 1 && tileStops[0] === arrangeGrip("today") ? [] : [tileStops.length]]);
            arrangeGrip("next").focus();
            arrangeKey("next", "Delete");
            checks.push(["Delete hides it", document.querySelector('#homeFace [data-module="next"]').hidden ? [] : ["showing"]]);
            checks.push(["and puts it in the dock", !$("arrangeTray").hidden && document.querySelector('[data-arrange="next-show"]') ? [] : ["not in the dock"]]);
            checks.push(["the dock keeps its shape", dockShape() === dockShapeAtStart ? [] : [dockShapeAtStart, dockShape()]]);
            checks.push(["focus moves to the next tile", document.activeElement === arrangeGrip("system") ? [] : [document.activeElement?.dataset.arrange]]);
            document.querySelector('[data-arrange="next-show"]').click();
            checks.push(["the dock shows it again", !document.querySelector('#homeFace [data-module="next"]').hidden && !document.querySelector('[data-arrange="next-show"]') && document.activeElement === arrangeGrip("next") ? [] : ["still hidden"]]);
            tile("system").querySelector('[data-arrange="system-hide"]').click();
            checks.push(["so does Hide", document.querySelector('#homeFace [data-module="system"]').hidden ? [] : ["showing"]]);
            document.querySelector('[data-arrange="system-show"]').click();
            $("arrangeReset").click();
            checks.push(["Reset restores the default", moduleOrder("now") === 0 && moduleOrder("today") === 1 && moduleWidth("now") === "2" ? [] : ["same"]]);
            // Dragging a tile.
            const nameOf = id => tile(id).querySelector(".arrange-name");
            const systemBox = document.querySelector('#homeFace [data-module="system"]').getBoundingClientRect();
            const overSystem = { clientX: systemBox.right - 10, clientY: systemBox.top + systemBox.height / 2 };
            pointerAt(nameOf("today"), "pointerdown", centerOf(nameOf("today")));
            pointerAt(document, "pointermove", overSystem);
            pointerAt(document, "pointermove", overSystem);
            checks.push(["dragging a tile moves it as it goes", document.querySelector('#homeFace [data-module="today"]').classList.contains("is-dragging") && moduleOrder("today") > moduleOrder("system") ? [] : [moduleOrder("today"), moduleOrder("system")]]);
            checks.push(["the page waits for the drop to keep it", storedLayout().order[1] === "today" ? [] : ["kept early"]]);
            pointerAt(document, "pointerup", overSystem);
            checks.push(["dropping keeps it", storedLayout().order.indexOf("today") > storedLayout().order.indexOf("system") && !document.querySelector(".is-dragging") ? [] : ["not kept"]]);
            const orderBeforeDrag = homeLayout.order.join();
            pointerAt(nameOf("note"), "pointerdown", centerOf(nameOf("note")));
            pointerAt(document, "pointermove", centerOf(nameOf("now")));
            pointerAt(document, "pointermove", centerOf(nameOf("now")));
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
            checks.push(["Escape puts a drag back, and stays arranging", homeLayout.order.join() === orderBeforeDrag && $("home").classList.contains("is-arranging") && !document.querySelector(".is-dragging") ? [] : [homeLayout.order.join()]]);
            pointerAt(document, "pointerup", centerOf(nameOf("now")));
            // A pointer held still in a corner (a hand's 1-pixel tremor) moves a tile once at most:
            // a reflow under it once set modules sliding back and forth without end.
            const faceBox = $("homeFace").getBoundingClientRect();
            const orders = new Set();
            pointerAt(nameOf("today"), "pointerdown", centerOf(nameOf("today")));
            for (let tremor = 0; tremor < 12; tremor++) {
                pointerAt(document, "pointermove", { clientX: faceBox.left + 40 + tremor % 2, clientY: faceBox.bottom - 40 });
                orders.add(homeLayout.order.join());
            }
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
            pointerAt(document, "pointerup", centerOf(nameOf("now")));
            checks.push(["a still pointer doesn't keep moving tiles", orders.size <= 1 && homeLayout.order.join() === orderBeforeDrag ? [] : [...orders]]);
            const hideToday = tile("today").querySelector('[data-arrange="today-hide"]');
            pointerAt(hideToday, "pointerdown", centerOf(hideToday));
            pointerAt(document, "pointermove", centerOf(nameOf("now")));
            checks.push(["Hide doesn't start a drag", !document.querySelector(".is-dragging") ? [] : ["dragging"]]);
            pointerAt(document, "pointerup", centerOf(nameOf("now")));
            // The corner sets the width, and (2.9.0) the height.
            const handle = tile("note").querySelector(".arrange-resize");
            const noteBox = document.querySelector('#homeFace [data-module="note"]').getBoundingClientRect();
            const farRight = { clientX: noteBox.left + noteBox.width * 2.1, clientY: noteBox.top + 20 };
            pointerAt(handle, "pointerdown", centerOf(handle));
            pointerAt(document, "pointermove", farRight);
            pointerAt(document, "pointerup", farRight);
            checks.push(["dragging the corner across widens it", moduleWidth("note") !== "1" && storedLayout().widths.note > 1 ? [] : [moduleWidth("note")]]);
            const noteNow = document.querySelector('#homeFace [data-module="note"]').getBoundingClientRect();
            const farDown = { clientX: noteNow.right - 10, clientY: noteNow.top + noteNow.height * 2.2 };
            pointerAt(tile("note").querySelector(".arrange-resize"), "pointerdown", centerOf(tile("note").querySelector(".arrange-resize")));
            pointerAt(document, "pointermove", farDown);
            pointerAt(document, "pointerup", farDown);
            checks.push(["and down makes it taller", storedLayout().heights.note > 1 ? [] : [moduleHeight("note")]]);
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
            checks.push(["Escape leaves Arrange", !$("home").classList.contains("is-arranging") && $("arrangeDock").hidden && !$("todayOpen").closest("[inert]") ? [] : ["still arranging"]]);
            $("arrangeButton").click();
            navigate("games");
            checks.push(["leaving the page leaves Arrange", !$("home").classList.contains("is-arranging") ? [] : ["still arranging"]]);
            navigate("home");
            $("arrangeButton").click();
            $("arrangeReset").click();
            $("arrangeDone").click();
            checks.push(["Done leaves it", !$("home").classList.contains("is-arranging") && document.activeElement === $("arrangeButton") ? [] : ["still arranging"]]);
            checks.push(["and gives the sidebar back", !document.querySelector(".sidebar").inert ? [] : ["inert"]]);
            const sidebarChoice = localStorage.getItem(SIDEBAR_KEY);
            applySidebar(true);
            $("arrangeButton").click();
            const openedForDock = !document.body.classList.contains("sidebar-collapsed");
            changeHomeLayout({ ...MaestroHomeLayout.defaults(), hidden: [] });
            checks.push(["with nothing hidden, the dock says so", !$("arrangeTrayEmpty").hidden ? [] : ["blank"]]);
            $("arrangeReset").click();
            $("arrangeDone").click();
            checks.push(["a collapsed sidebar opens for the dock, then closes again", openedForDock && document.body.classList.contains("sidebar-collapsed") && localStorage.getItem(SIDEBAR_KEY) === sidebarChoice ? [] : [openedForDock]]);
            applySidebar(false);
            // 2.3.0: closing and opening the sidebar. The logo glides, never
            // jumps, and the name keeps its size while it fades.
            if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
                const settle = () => document.getAnimations().forEach(motion => { if (motion instanceof CSSTransition) motion.finish(); });
                const logo = document.querySelector(".brand-mark");
                const name = document.querySelector(".brand-copy strong");
                const small = document.querySelector(".brand-copy > span");
                const sidebarLeft = () => document.querySelector(".sidebar").getBoundingClientRect().left;
                const logoAt = () => Math.round((logo.getBoundingClientRect().left - sidebarLeft()) * 10) / 10;
                const look = node => ["font-size", "font-weight", "line-height", "letter-spacing", "margin-top", "text-transform", "color", "background-image"].map(prop => getComputedStyle(node).getPropertyValue(prop)).join(" | ");
                // Steps through the sidebar's own transitions, paused, every 25 ms.
                const steps = () => {
                    const moving = document.getAnimations().filter(motion => motion instanceof CSSTransition);
                    moving.forEach(motion => motion.pause());
                    const seen = [];
                    for (let at = 0; at <= 275; at += 25) {
                        moving.forEach(motion => { motion.currentTime = at; });
                        seen.push({ left: logoAt(), name: look(name), small: look(small), copy: Number(getComputedStyle(document.querySelector(".brand-copy")).opacity) });
                    }
                    moving.forEach(motion => motion.finish());
                    return seen;
                };
                settle();
                const openLeft = logoAt(), openName = look(name), openSmall = look(small);
                const copyRight = document.querySelector(".brand-copy").getBoundingClientRect().right;
                const brandBox = document.querySelector(".brand");
                const roomRight = brandBox.getBoundingClientRect().right - parseFloat(getComputedStyle(brandBox).paddingRight);
                checks.push(["open, the name fills the room beside the logo", Math.abs(copyRight - roomRight) <= .5 ? [] : [copyRight, roomRight]]);
                applySidebar(true);
                const closing = steps();
                const railLeft = logoAt();
                const glides = seen => seen.every((step, at) => at === 0 || Math.abs(step.left - seen[at - 1].left) <= 3);
                checks.push(["closing, the logo glides to the rail's middle without a jump", glides(closing) && closing[0].left === openLeft && Math.abs(railLeft - (84 - 56) / 2) <= 1 ? [] : [closing.map(step => step.left).join(), railLeft]]);
                checks.push(["closing, the name keeps its size while it fades", closing.every(step => step.name === openName && step.small === openSmall) && closing[2].copy < 1 && closing.at(-1).copy === 0 ? [] : [closing.map(step => step.copy).join()]]);
                checks.push(["closed, the words are hidden from view and screen readers", getComputedStyle(document.querySelector(".brand-copy")).visibility === "hidden" && [...document.querySelectorAll(".nav > span")].every(span => getComputedStyle(span).visibility === "hidden") ? [] : ["visible"]]);
                const icon = document.querySelector('.nav[data-view="home"] svg').getBoundingClientRect();
                const mark = logo.getBoundingClientRect();
                const railRoom = document.querySelector(".sidebar").clientWidth - 2 * 13;
                checks.push(["closed, each page's button keeps the rail's width", [...document.querySelectorAll(".sidebar .nav")].every(button => Math.round(button.getBoundingClientRect().width) <= railRoom) ? [] : [[...document.querySelectorAll(".sidebar .nav")].map(button => Math.round(button.getBoundingClientRect().width)).join(), railRoom]]);
                checks.push(["closed, the logo is centered over the icons", Math.abs((icon.left + icon.right) / 2 - (mark.left + mark.right) / 2) <= 1.5 ? [] : [(icon.left + icon.right) / 2, (mark.left + mark.right) / 2]]);
                applySidebar(false);
                const opening = steps();
                checks.push(["opening, the logo glides back", glides(opening) && opening.at(-1).left === openLeft ? [] : [opening.map(step => step.left).join()]]);
                checks.push(["opening, the words fade in once there's room, at their size", opening[0].copy === 0 && opening.at(-1).copy === 1 && opening.every(step => step.name === openName) ? [] : [opening.map(step => step.copy).join()]]);
                settle();
            }
            // 2.0.0: the added modules.
            changeHomeLayout({ ...MaestroHomeLayout.defaults(), hidden: [] });
            checks.push(["every added module can show", ["weather", "processes", "network", "audio", "controllers", "pinned", "unlocks", "timer", "metronome"].every(id => !document.querySelector(`#homeFace [data-module="${id}"]`).hidden) ? [] : ["hidden"]]);
            const wasHidden = windowIsHidden;
            windowIsHidden = false;
            messages.length = 0;
            askHomeExtras(true);
            windowIsHidden = wasHidden;
            checks.push(["they ask only for what shows", messages.includes("GetWeather\n") && messages.includes("GetHomeStats\nnetwork,processes") ? [] : [messages.join(";")]]);
            // 2.2.0: rates need a second reading; on opening it comes after a second.
            windowIsHidden = false;
            await new Promise(resolve => setTimeout(resolve, 1100));
            windowIsHidden = wasHidden;
            checks.push(["and read Network and Top Apps again a second later", messages.filter(message => message === "GetHomeStats\nnetwork,processes").length === 2 ? [] : [messages.join(";")]]);
            handleWebMessage({ data: { type: "weatherSettings", enabled: true } });
            handleWebMessage({ data: "WEATHER\n" + JSON.stringify({ current: { temperature_2m: 48.3, apparent_temperature: 44.1, relative_humidity_2m: 61, weather_code: 3, wind_speed_10m: 9.4 }, daily: { time: ["2026-11-09"], temperature_2m_max: [52], temperature_2m_min: [40], weather_code: [61], precipitation_probability_max: [80] } }) });
            checks.push(["the weather shows", /48°/.test($("homeWeather").textContent) && /Cloudy/.test($("homeWeather").textContent) && /80% rain/.test($("homeWeather").textContent) ? [] : [$("homeWeather").textContent]]);
            handleWebMessage({ data: "WEATHER\n<img src=x onerror=alert(1)>" });
            checks.push(["a broken reply keeps the last forecast, as text", /48°/.test($("homeWeather").textContent) && !$("homeWeather").querySelector("img") ? [] : [$("homeWeather").textContent]]);
            messages.length = 0;
            $("weatherEnabled").checked = false;
            $("weatherEnabled").dispatchEvent(new Event("change", { bubbles: true }));
            checks.push(["the weather switch saves", messages.includes("SetWeather\noff") ? [] : [messages.join(";")]]);
            handleWebMessage({ data: { type: "weatherSettings", enabled: false } });
            checks.push(["and off says how to turn it on", /Today's Settings/.test($("homeWeather").textContent) ? [] : [$("homeWeather").textContent]]);
            handleWebMessage({ data: { type: "homeStats", network: { name: "Wi-Fi", down: 2500000, up: 125000 }, processes: { cpu: [{ name: "<b>vivaldi</b>", value: 12.4 }], memory: [{ name: "Code", value: 2048 }] } } });
            checks.push(["network speeds show", /20\.0 Mb\/s/.test($("homeNetwork").textContent) && /1\.0 Mb\/s/.test($("homeNetwork").textContent) ? [] : [$("homeNetwork").textContent]]);
            checks.push(["top apps show, names as text", $("homeProcesses").textContent.includes("<b>vivaldi</b>") && /12%/.test($("homeProcesses").textContent) && /2\.0 GB/.test($("homeProcesses").textContent) ? [] : [$("homeProcesses").textContent]]);
            renderHomePinned();
            const pinnedNote = notesData.notes.find(note => note.pinned);
            checks.push(["pinned notes list what's pinned", (pinnedNote ? $("homePinned").textContent.includes(noteLabel(pinnedNote)) : /Pin a note/.test($("homePinned").textContent)) ? [] : [$("homePinned").textContent]]);
            messages.length = 0;
            document.querySelector('#timerPresets [data-minutes="10"]').click();
            $("timerStart").click();
            checks.push(["the timer starts, kept by Maestro", messages.includes("CountdownTimer\n600") && /^(10:00|9:5\d)$/.test($("timerDisplay").textContent) && $("timerStart").textContent === "Cancel" ? [] : [messages.join(";"), $("timerDisplay").textContent]]);
            $("timerStart").click();
            checks.push(["and cancels", messages.includes("CountdownTimer\n0") && $("timerStart").textContent === "Start" ? [] : [messages.join(";")]]);
            document.querySelector('#timerModes [data-timer-mode="watch"]').click();
            $("timerStart").click();
            checks.push(["the stopwatch runs in the page", $("timerStart").textContent === "Stop" && $("timerPresets").hidden ? [] : [$("timerStart").textContent]]);
            $("timerStart").click();
            document.querySelector('#timerModes [data-timer-mode="timer"]').click();
            changeHomeLayout(MaestroHomeLayout.defaults());
            checks.push(["no errors from the added modules", errors.splice(0)]);
            // Today's settings.
            $("todaySettingsButton").click();
            checks.push(["Today's Settings opens its dialog", !$("todaySettingsDialog").hidden && $("todaySettingsDialog").contains($("almanacWikipedia")) ? [] : ["not open"]]);
            document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
            checks.push(["Escape closes it, back on the button", $("todaySettingsDialog").hidden && document.activeElement === $("todaySettingsButton") ? [] : ["open"]]);
            // 2.9.0: saved layouts.
            {
                const tick = () => new Promise(resolve => setTimeout(resolve, 0));
                homeSaved = MaestroHomeLayout.parseSaved(null);
                homeGameSession = null;
                homeLayout = MaestroHomeLayout.activeLayout(homeSaved);
                applyHomeLayout();
                renderHomeLayoutChip();
                navigate("home");
                checks.push(["the Podium names its layout beside the title", !$("homeLayoutChip").hidden && $("homeLayoutName").textContent === "Default" && $("homeLayoutAuto").hidden ? [] : [$("homeLayoutName").textContent]]);
                navigate("games");
                checks.push(["other pages don't show it", $("homeLayoutChip").hidden ? [] : ["shown"]]);
                navigate("home");
                $("homeLayoutChip").click();
                checks.push(["it opens the Layouts menu, on the one in use", !$("homeLayoutMenu").hidden && $("homeLayoutChip").getAttribute("aria-expanded") === "true" && document.activeElement?.getAttribute("aria-pressed") === "true" ? [] : ["closed"]]);
                checks.push(["the only layout can't be deleted", $("homeLayoutDelete").disabled ? [] : ["deletable"]]);
                $("homeLayoutNew").click();
                const nameInput = $("homeLayoutNameInput");
                checks.push(["New asks for a name in the menu", !$("homeLayoutForm").hidden && $("homeLayoutActions").hidden && document.activeElement === nameInput && $("homeLayoutSave").disabled ? [] : ["no form"]]);
                nameInput.value = "default";
                nameInput.dispatchEvent(new Event("input"));
                checks.push(["a name in use is refused, saying why", $("homeLayoutSave").disabled && $("homeLayoutProblem").textContent === "There's already a layout named Default." ? [] : [$("homeLayoutProblem").textContent]]);
                nameInput.value = "Gaming";
                nameInput.dispatchEvent(new Event("input"));
                $("homeLayoutForm").requestSubmit();
                checks.push(["a new layout is in use at once", $("homeLayoutName").textContent === "Gaming" && JSON.parse(localStorage.getItem(HOME_LAYOUTS_KEY)).active === "Gaming" ? [] : [$("homeLayoutName").textContent]]);
                checks.push(["and listed, with the menu back", $("homeLayoutList").children.length === 2 && $("homeLayoutForm").hidden && !$("homeLayoutActions").hidden ? [] : [$("homeLayoutList").children.length]]);
                changeHomeLayout(MaestroHomeLayout.setHeight(MaestroHomeLayout.defaults(), "now", 2));
                checks.push(["Arrange's changes go to the one in use", JSON.parse(localStorage.getItem(HOME_LAYOUTS_KEY)).list.find(entry => entry.name === "Gaming").layout.heights.now === 2 && MaestroHomeLayout.parse(localStorage.getItem(HOME_LAYOUT_KEY)).heights.now === 2 ? [] : ["not kept"]]);
                $("homeLayoutGaming").click();
                checks.push(["one can be used while a game runs, and the chip says so", !$("homeLayoutAuto").hidden && $("homeLayoutList").textContent.includes("While a game runs") ? [] : ["not marked"]]);
                [...$("homeLayoutList").querySelectorAll(".layout-option")].find(button => button.textContent.startsWith("Default")).click();
                checks.push(["choosing one switches to it and closes the menu", $("homeLayoutName").textContent === "Default" && $("homeLayoutMenu").hidden && homeModule("now").dataset.height === "1" ? [] : [$("homeLayoutName").textContent]]);
                const gameLive = playing => handleWebMessage({ data: { type: "gamesLive", playing: playing ? [{ emulator: "retroarch", title: "RetroArch 1.0 || Brave Fencer Musashi", since: Date.now() / 1000 - 60 }] : [], apps: {}, controllers: [] } });
                gameLive(true);
                checks.push(["a game starting switches to the one for games", $("homeLayoutName").textContent === "Gaming" && homeModule("now").dataset.height === "2" ? [] : [$("homeLayoutName").textContent]]);
                gameLive(false);
                checks.push(["and its closing switches back", $("homeLayoutName").textContent === "Default" ? [] : [$("homeLayoutName").textContent]]);
                gameLive(true);
                chooseHomeLayout("Default");
                gameLive(false);
                checks.push(["one chosen by hand meanwhile stays", $("homeLayoutName").textContent === "Default" ? [] : [$("homeLayoutName").textContent]]);
                const layoutCommands = paletteSources("all").filter(item => item.badge === "LAYOUT").map(item => item.label);
                checks.push(["the palette lists them", layoutCommands.join() === "Podium layout “Default”,Podium layout “Gaming”" ? [] : layoutCommands]);
                $("homeLayoutChip").click();
                $("homeLayoutRename").click();
                nameInput.value = "Desk";
                nameInput.dispatchEvent(new Event("input"));
                $("homeLayoutForm").requestSubmit();
                checks.push(["Rename renames the one in use", $("homeLayoutName").textContent === "Desk" && homeSaved.list.map(entry => entry.name).join() === "Desk,Gaming" ? [] : [homeSaved.list.map(entry => entry.name).join()]]);
                $("homeLayoutDuplicate").click();
                checks.push(["Duplicate copies it, in use", $("homeLayoutName").textContent === "Desk copy" && homeSaved.list.length === 3 ? [] : [$("homeLayoutName").textContent]]);
                $("homeLayoutDelete").click();
                await tick();
                checks.push(["Delete asks first", !$("confirmDialog").hidden && $("confirmDialogTitle").textContent === "Delete the layout Desk copy?" ? [] : [$("confirmDialogTitle").textContent]]);
                $("confirmDialogConfirm").click();
                await tick();
                checks.push(["and goes to the first left", $("homeLayoutName").textContent === "Desk" && homeSaved.list.length === 2 ? [] : [$("homeLayoutName").textContent]]);
                $("homeLayoutChip").click();
                $("homeLayoutMenu").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
                checks.push(["Escape closes the menu, back on the chip", $("homeLayoutMenu").hidden && document.activeElement === $("homeLayoutChip") ? [] : ["open"]]);
                $("arrangeButton").click();
                checks.push(["while arranging the chip waits, and the dock names the layout", $("homeLayoutChip").disabled && $("arrangeLayout").textContent === "Layout: Desk" ? [] : [$("arrangeLayout").textContent]]);
                $("arrangeDone").click();
                homeSaved = savedHomeState.saved;
                homeGameSession = savedHomeState.session;
                homeLayout = MaestroHomeLayout.activeLayout(homeSaved);
                applyHomeLayout();
                renderHomeLayoutChip();
            }
            if (savedLayout === null) localStorage.removeItem(HOME_LAYOUT_KEY); else localStorage.setItem(HOME_LAYOUT_KEY, savedLayout);
            if (savedLayouts === null) localStorage.removeItem(HOME_LAYOUTS_KEY); else localStorage.setItem(HOME_LAYOUTS_KEY, savedLayouts);
            const notesBefore = notesData.notes.length;
            $("homeNoteInput").value = "From the Podium";
            $("homeNoteInput").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
            checks.push(["Enter saves a quick note", notesData.notes.length === notesBefore + (notesLoaded ? 1 : 0) ? [] : [notesData.notes.length]]);
            checks.push(["and the box empties", !notesLoaded || $("homeNoteInput").value === "" ? [] : ["still there"]]);
            if (notesLoaded) notesData.notes.pop();
            const whenAt = (days, allDay = false) => {
                const midnight = startOfDay(Date.now());
                return nextUpWhen({ start: addDays(midnight, days) + 15 * 3600000, end: addDays(midnight, days) + 16 * 3600000, allDay }, midnight, midnight);
            };
            const weekdayOf = days => new Date(addDays(startOfDay(Date.now()), days)).toLocaleString("en-US", { weekday: "short" });
            const dateOf = days => new Date(addDays(startOfDay(Date.now()), days)).toLocaleString("en-US", { month: "short", day: "numeric" });
            checks.push(["Next up says tomorrow", whenAt(1) === "Tomorrow, 3 PM" ? [] : [whenAt(1)]]);
            checks.push(["a weekday within the week", whenAt(6) === `${weekdayOf(6)}, 3 PM` ? [] : [whenAt(6)]]);
            checks.push(["the date from a week out", whenAt(7) === `${dateOf(7)}, 3 PM` ? [] : [whenAt(7)]]);
            checks.push(["and beyond", whenAt(12) === `${dateOf(12)}, 3 PM` ? [] : [whenAt(12)]]);
            checks.push(["an all-day event gets the date too", whenAt(9, true) === dateOf(9) ? [] : [whenAt(9, true)]]);
            checks.push(["recent activity moved to System", $("dashboard").contains($("activityList")) ? [] : ["elsewhere"]]);
            renderHomeDrives([{ letter: "J:", online: true, usage: 94, used: 3500, total: 3700 }, { letter: "K:", online: false }]);
            checks.push(["a full drive shows gold on Home", $("homeDrives").querySelector(".sys-value.is-high")?.textContent === "94%" ? [] : ["no gold"]]);
            checks.push(["sizes read as they should", $("homeDrives").querySelector(".sys-note")?.textContent === "3.4 of 3.6 TB" ? [] : [$("homeDrives").querySelector(".sys-note")?.textContent]]);
            checks.push(["an offline drive says so", $("homeDrives").querySelector(".sys-value.is-offline")?.textContent === "Offline" ? [] : ["no"]]);
            checks.push(["no errors from the 2.0.0 navigation checks", errors.splice(0)]);

            // 1.11.1: per-game notes.
            navigate("games");
            gamesSections.show("playing");
            gamesState.items = [];
            const nowBox = () => $("gamesNowNotes").querySelector(".game-notes-text");
            const live = (title, since = Date.now() / 1000 - 65) => handleWebMessage({ data: { type: "gamesLive", playing: title === null ? [] : [{ emulator: "steam", title, since }], apps: {}, controllers: [] } });
            const typeInto = (area, text) => { area.value = text; area.dispatchEvent(new Event("input", { bubbles: true })); };
            const gameTitle = "<img src=x onerror=alert(1)> Game";
            const gameKey = Games.gameNoteKey(gameTitle);
            notesLoaded = false;
            notesData = { version: 2, activeId: null, notes: [] };
            live(gameTitle);
            checks.push(["Now playing has a notes box", nowBox() && !$("gamesNowNotes").hidden ? [] : ["none"]]);
            checks.push(["it can't be typed in before the notes have loaded", nowBox()?.disabled ? [] : ["enabled"]]);
            typeInto(nowBox(), "too soon");
            checks.push(["and typing then makes no note, which a save would wipe the others with", notesData.notes.length === 0 ? [] : ["note made"]]);
            const otherNote = { id: "other", title: "Other", type: "note", content: "keep me", pinned: false, created: "2020-01-01T00:00:00.000Z", updated: "2020-01-01T00:00:00.000Z" };
            handleWebMessage({ data: { type: "notes", data: JSON.stringify({ version: 2, activeId: "other", notes: [otherNote, { ...otherNote, id: "bad", title: "Bad link", game: "not a key" }] }), recovered: false } });
            checks.push(["once they load, it can", nowBox()?.disabled === false && nowBox().value === "" ? [] : ["still disabled"]]);
            checks.push(["a bad link in the file is dropped, keeping the note", notesData.notes.find(note => note.id === "bad")?.game === undefined && notesData.notes.length === 2 ? [] : ["kept"]]);
            checks.push(["just looking makes no note", notesData.notes.length === 2 ? [] : ["note made"]]);
            typeInto(nowBox(), "first thought");
            const gameNote = ASCSNotes.findGameNote(notesData.notes, gameKey);
            checks.push(["typing makes one linked note in the group", gameNote?.content === "first thought" && gameNote.group === "Game notes" && notesData.notes.length === 3 ? [] : ["wrong note"]]);
            checks.push(["its title is the game's, as text", gameNote?.title === Games.displayTitle(gameTitle) && !$("gamesNowNotes").querySelector("img") ? [] : [gameNote?.title]]);
            checks.push(["the note open in Quick Notes keeps its date and stays open", notesData.notes[0].updated === otherNote.updated && notesData.activeId === "other" ? [] : ["touched"]]);
            checks.push(["and the game's note has its own", gameNote?.updated > otherNote.updated ? [] : [gameNote?.updated]]);
            const nowArea = nowBox();
            nowArea.focus();
            nowArea.setSelectionRange(3, 3);
            live(gameTitle, Date.now() / 1000 - 70);
            checks.push(["a Now playing redraw leaves the box, its cursor and its focus alone", nowBox() === nowArea && document.activeElement === nowArea && nowArea.selectionStart === 3 ? [] : ["lost"]]);
            live("Another Game");
            checks.push(["a new game waits while you're typing", nowBox() === nowArea && nowArea.value === "first thought" ? [] : ["switched"]]);
            typeInto(nowArea, "first thought, finished");
            checks.push(["so your words stay with their game", ASCSNotes.findGameNote(notesData.notes, gameKey)?.content === "first thought, finished" && !ASCSNotes.findGameNote(notesData.notes, Games.gameNoteKey("Another Game")) ? [] : ["wrong game"]]);
            nowArea.blur();
            await new Promise(resolve => setTimeout(resolve, 20));
            checks.push(["then the box moves to the new game", nowBox() !== nowArea && nowBox()?.value === "" ? [] : ["didn't move"]]);
            live(null);
            checks.push(["with nothing running and nothing played, there's nothing to type in", !$("gamesNowNotes").hidden && !$("gamesNowNotes").querySelector("textarea") ? [] : ["wrong"]]);
            live("RetroArch");
            handleWebMessage({ data: { type: "gamesLive", playing: [{ emulator: "retroarch", title: "RetroArch", since: 5 }], apps: {}, controllers: [] } });
            checks.push(["nor at an emulator's menu", !$("gamesNowNotes").hidden && !$("gamesNowNotes").querySelector("textarea") ? [] : ["wrong"]]);

            live(gameTitle);
            checks.push(["the same game finds its note again", nowBox()?.value === "first thought, finished" ? [] : [nowBox()?.value]]);
            const pendingBefore = gameNote.content;
            handleWebMessage({ data: { type: "notes", data: JSON.stringify({ ...notesData, notes: notesData.notes.map(note => note.game === gameKey ? { ...note, content: "changed elsewhere" } : note) }), recovered: false } });
            checks.push(["a reload shows in the box, so old text can't overwrite it", nowBox()?.value === "changed elsewhere" ? [] : [nowBox()?.value]]);
            typeInto(nowBox(), pendingBefore);

            messages.length = 0;
            $("gamesNowNotes").querySelector(".game-notes-actions button").click();
            checks.push(["Add timestamp asks once what's running", messages.some(message => message.startsWith("GetGamesLive")) ? [] : ["didn't ask"]]);
            live(gameTitle, Date.now() / 1000 - 65);
            checks.push(["and adds the time into the session", /\n\n### .+ · 1:0\d into this session\n$/.test(nowBox()?.value || "") ? [] : [nowBox()?.value]]);
            checks.push(["leaving the cursor under it, ready to type", document.activeElement === nowBox() && nowBox().selectionStart === nowBox().value.length ? [] : ["elsewhere"]]);

            // 2.9.0: Games › Consoles.
            {
                const consolesData = {
                    type: "consoles", sender: true, rcm: false, pushing: false, selected: 0, autoPush: false, folder: "",
                    payloads: [{ name: "hekate_ctcaer_6.5.1.bin", folder: "J:\\brew", size: 126207, time: "20261108093000", version: "6.5.1" }, { name: "Lockpick_RCM.bin", folder: "C:\\Downloads", size: 90000, time: "20250101120000", version: "" }],
                    cards: [{ drive: "E", kind: "switch", label: "SWITCH", free: 12595, total: 60928, copied: 1, versions: [{ name: "hekate", version: "6.5.1" }] }],
                    updated: { switch: "2026-11-08", "3ds": "", wiiu: "" }, album: { running: false }, albumFolder: "C:\\Pictures\\Switch"
                };
                consolesState = null;
                messages.length = 0;
                gamesSections.show("consoles");
                checks.push(["Consoles asks Maestro when it opens", messages.includes("GetConsoles\nrefresh") ? [] : [messages.join(";")]]);
                checks.push(["and waits for it before anything can be pushed", $("consolesPush").disabled && $("consolesAuto").disabled ? [] : ["enabled"]]);
                checks.push(["its messages are allowlisted", ["GetConsoles", "PushPayload", "GetPayloadBytes", "SetPayloadChoice", "ChoosePayloadFolder", "SetConsoleUpdated", "OpenConsoleCard", "ImportAlbum", "OpenAlbumFolder", "OpenConsoleBackups", "OpenConsoleLink"].filter(type => !new Set(window.SMOKE_ALLOWLIST || []).has(type))]);
                messages.length = 0;
                handleWebMessage({ data: consolesData });
                const payloadRows = [...$("consolesPayloads").querySelectorAll(".consoles-payload-row")];
                checks.push(["payloads are listed, with hekate's version", payloadRows.length === 2 && payloadRows[0].textContent.includes("hekate 6.5.1 · 123 KB") ? [] : [payloadRows.length]]);
                checks.push(["none chosen, so Push and pushing by itself wait", $("consolesPush").disabled && $("consolesAuto").disabled ? [] : ["enabled"]]);
                checks.push(["the first payload's bytes are asked for, to show its SHA-256", messages.includes("GetPayloadBytes\n1") ? [] : [messages.join(";")]]);
                handleWebMessage({ data: { type: "payloadBytes", index: 1, size: 126207, time: "20261108093000", data: "YWJj" } });
                await new Promise(resolve => setTimeout(resolve, 30));
                const firstHash = $("consolesPayloads").querySelector(".consoles-hash");
                checks.push(["and its SHA-256 shows, worked out here", firstHash?.textContent === "SHA-256 ba7816bf8f01…" && firstHash.title.includes("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad") ? [] : [firstHash?.textContent]]);
                messages.length = 0;
                payloadRows[0].click();
                checks.push(["choosing a payload tells Maestro its place", messages.join(";") === "SetPayloadChoice\n1|0" ? [] : [messages.join(";")]]);
                handleWebMessage({ data: { ...consolesData, selected: 1, rcm: true } });
                checks.push(["chosen, it can be pushed, and the Switch shows connected", !$("consolesPush").disabled && !$("consolesAuto").disabled && $("consolesRcm").textContent === "Switch in RCM mode: connected" ? [] : [$("consolesRcm").textContent]]);
                messages.length = 0;
                $("consolesAuto").click();
                $("consolesPush").click();
                checks.push(["push and push-when-plugged-in ask Maestro", messages.join(";") === "SetPayloadChoice\n1|1;PushPayload\n1" ? [] : [messages.join(";")]]);
                handleWebMessage({ data: { type: "payloadPushed", ok: false, message: "No Switch in RCM mode was found." } });
                checks.push(["a failed push says why", $("consolesPushStatus").textContent === "No Switch in RCM mode was found." && $("consolesPushStatus").classList.contains("is-failed") ? [] : [$("consolesPushStatus").textContent]]);
                const card = $("consolesCards").querySelector(".consoles-card");
                checks.push(["a Switch card shows its versions and space", card?.textContent.includes("Nintendo Switch · E: SWITCH") && card.textContent.includes("hekate 6.5.1 · 12.3 GB free of 59.5 GB") && card.querySelector(".metric-track > span")?.style.width ? [] : [card?.textContent]]);
                messages.length = 0;
                [...card.querySelectorAll("button")].find(button => button.textContent === "Import album").click();
                [...card.querySelectorAll("button")].find(button => button.textContent === "Open").click();
                checks.push(["its album and folder by drive letter", messages.join(";") === "ImportAlbum\nE;OpenConsoleCard\nE" ? [] : [messages.join(";")]]);
                const switchModule = document.querySelector('[data-console="switch"]');
                checks.push(["each console keeps its last update and notes", switchModule.querySelector("input[type=date]")?.value === "2026-11-08" && switchModule.querySelector(".game-notes") ? [] : ["missing"]]);
                messages.length = 0;
                const dateInput = switchModule.querySelector("input[type=date]");
                dateInput.value = "2026-11-17";
                dateInput.dispatchEvent(new Event("change"));
                [...switchModule.querySelectorAll(".consoles-links button")][0].click();
                checks.push(["a date and a release page go to Maestro by name", messages.join(";") === "SetConsoleUpdated\nswitch|2026-11-17;OpenConsoleLink\nhekate" ? [] : [messages.join(";")]]);
                consolesState = null;
                gamesSections.show("playing");
            }            // 2.9.0: the game notes window. Maestro relays; this page changes the notes.
            {
                nowBox().blur();
                const statesSent = () => messages.filter(message => message.startsWith("GameNotesWindowState\n")).map(message => JSON.parse(message.slice("GameNotesWindowState\n".length)));
                messages.length = 0;
                handleWebMessage({ data: { type: "gameNotesWindow", open: true } });
                const firstState = statesSent().at(-1);
                checks.push(["the game notes window is told the running game's note", firstState?.key === gameKey && firstState.text === nowBox().value && firstState.ready === true && firstState.title === Games.displayTitle(gameTitle) ? [] : [JSON.stringify(firstState)]]);
                checks.push(["its messages are allowlisted", ["GameNotesWindowState", "ToggleGameNotes"].filter(type => !new Set(window.SMOKE_ALLOWLIST || []).has(type))]);
                handleWebMessage({ data: { type: "gameNotesWindowEdit", key: gameKey, text: "from the window" } });
                checks.push(["its edits go to that game's note, and into the boxes", ASCSNotes.findGameNote(notesData.notes, gameKey)?.content === "from the window" && nowBox().value === "from the window" ? [] : [nowBox().value]]);
                const otherKey = Games.gameNoteKey("Another Game");
                const notesCount = notesData.notes.length;
                handleWebMessage({ data: { type: "gameNotesWindowEdit", key: otherKey, text: "wrong game" } });
                checks.push(["an edit for a game that isn't running goes nowhere", notesData.notes.length === notesCount && !ASCSNotes.findGameNote(notesData.notes, otherKey)?.content?.includes("wrong game") ? [] : ["written"]]);
                messages.length = 0;
                live("Another Game");
                checks.push(["a new game is sent as it starts", statesSent().at(-1)?.key === otherKey ? [] : [JSON.stringify(statesSent().at(-1))]]);
                live(gameTitle);
                handleWebMessage({ data: { type: "gameNotesWindow", open: false } });
                messages.length = 0;
                live("Another Game");
                checks.push(["closed, it's told nothing", statesSent().length === 0 ? [] : ["sent"]]);
                live(gameTitle);
                const windowCommand = paletteSources("all").find(item => item.id === "game-notes-window");
                messages.length = 0;
                windowCommand?.run();
                checks.push(["the palette opens and closes it, naming Super + G", windowCommand?.hint === "Super+G" && messages.join(";") === "ToggleGameNotes\n" ? [] : [windowCommand?.hint, messages.join(";")]]);
            }            const libraryGame = { id: "st:1", title: gameTitle, emulator: "steam", system: "", seconds: 0, last: "", plays: 0, launchable: false, installed: true, cover: false };
            gamesState.items = [libraryGame];
            gamesState.openId = "st:1";
            gamesSections.show("library");
            renderGames();
            const libraryArea = $("gameDetail").querySelector(".game-notes-text");
            checks.push(["a library game's details show the same notes", libraryArea?.value === nowBox()?.value ? [] : [libraryArea?.value ?? "no box"]]);
            libraryArea.focus();
            libraryArea.setSelectionRange(2, 2);
            renderGames();
            await Promise.resolve();
            const libraryAfter = $("gameDetail").querySelector(".game-notes-text");
            checks.push(["a library redraw keeps the focus and cursor", libraryAfter === libraryArea && document.activeElement === libraryAfter && libraryAfter.selectionStart === 2 ? [] : ["lost"]]);
            typeInto(libraryAfter, "from the library");
            live(gameTitle);
            checks.push(["and what's typed there shows in Now playing", nowBox()?.value === "from the library" ? [] : [nowBox()?.value]]);
            libraryAfter.blur();

            gamesState.ra.games.set(100, JSON.stringify({ ID: 100, Title: gameTitle, ConsoleName: "Game Boy", ImageIcon: "/Images/100.png", Achievements: {} }));
            gamesState.ra.openGame = 100;
            gamesSections.show("achievements");
            renderAchievements();
            const browserArea = $("gamesAchievements").querySelector(".ra-browser .game-notes-text");
            checks.push(["the achievement browser shows them too", browserArea?.value === "from the library" ? [] : [browserArea?.value ?? "no box"]]);
            gamesState.ra.openGame = 0;
            renderAchievements();

            checks.push(["the palette offers the current game's notes", paletteSources("all").some(item => item.id === "game-notes") ? [] : ["missing"]]);
            checks.push(["but not as a quick action", paletteSources("pick").some(item => item.id === "game-notes") ? ["offered"] : []]);
            const paletteEntry = paletteSources("all").find(item => item.id === "game-notes");
            live(null);
            paletteEntry.run();
            live(null);
            checks.push(["with nothing running it says so", $("toast").textContent.includes("No game is running") && $("games").classList.contains("active") ? [] : [$("toast").textContent]]);
            const noteCount = notesData.notes.length;
            paletteEntry.run();
            live("A New Game");
            const paletteNote = ASCSNotes.findGameNote(notesData.notes, Games.gameNoteKey("A New Game"));
            checks.push(["with a game running it opens its note in Quick Notes", $("notes").classList.contains("active") && notesData.activeId === paletteNote?.id && notesData.notes.length === noteCount + 1 ? [] : ["not opened"]]);
            checks.push(["and shows which game it's for", !$("noteGameLink").hidden && $("noteGameName").textContent === "A New Game" ? [] : [$("noteGameName").textContent]]);
            $("noteGameStamp").click();
            live("A New Game", Date.now() / 1000 - 65);
            checks.push(["Add timestamp works from Quick Notes too", $("noteText").value.includes("into this session") && document.activeElement === $("noteText") ? [] : [$("noteText").value]]);
            $("noteGameUnlink").click();
            checks.push(["Unlink keeps the note and drops the link", paletteNote.game === undefined && notesData.notes.includes(paletteNote) && $("noteGameLink").hidden ? [] : ["wrong"]]);
            openNote("other");
            checks.push(["an ordinary note shows no link", $("noteGameLink").hidden ? [] : ["shown"]]);

            // 2.0.0: the command palette and its calculator.
            checks.push(["the title-bar search shows the / key", document.querySelector("#titlebarCommand kbd")?.textContent === "/" ? [] : [document.querySelector("#titlebarCommand kbd")?.textContent]]);
            openLauncher("all");
            checks.push(["the palette's kinds read in sentence case, not capitals (2.2.0)", [...$("launcherResults").querySelectorAll(".launcher-option-action")].map(node => node.textContent).filter(text => !/^[A-Z][a-z]+$/.test(text))]);
            checks.push(["its groups are headed in title case", [...$("launcherResults").querySelectorAll(".launcher-group")].map(node => node.textContent).filter(text => !["Recent", "All Commands"].includes(text))]);
            checks.push(["the palette is called Command Palette", $("launcherTitle").textContent === "Command Palette" ? [] : [$("launcherTitle").textContent]]);
            checks.push(["and says Super + Space opens it from anywhere", /Super\s*\+\s*Space opens it from anywhere/.test(document.querySelector(".launcher-anywhere")?.textContent.replace(/\s+/g, " ") || "") ? [] : ["missing"]]);
            const typeInPalette = text => { $("launcherSearch").value = text; $("launcherSearch").dispatchEvent(new Event("input", { bubbles: true })); };
            const firstResult = () => $("launcherResults").querySelector(".launcher-option strong")?.textContent;
            // 2.9.0: the home page is the Podium; its old name still finds it.
            typeInPalette("command center");
            checks.push(["the old name finds the Podium", firstResult() === "Podium" ? [] : [firstResult()]]);
            checks.push(["which the sidebar and title bar call by its name", document.querySelector('.nav[data-view="home"] span')?.textContent === "Podium" && $("homeTitle").textContent === "Podium" ? [] : ["not renamed"]]);
            typeInPalette("12.5 x 1.08");
            checks.push(["the answer shows as you type, with x for times", firstResult() === "= 13.5" ? [] : [firstResult()]]);
            typeInPalette("80 * 15%");
            checks.push(["% is a percent", firstResult() === "= 12" ? [] : [firstResult()]]);
            typeInPalette("(4 x 3");
            checks.push(["unfinished math says why", firstResult() === "A parenthesis isn't closed." ? [] : [firstResult()]]);
            typeInPalette("$10 mod 3");
            messages.length = 0;
            $("launcherSearch").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
            checks.push(["Enter copies the answer through Maestro", messages.includes("CopyNote\n1") && $("launcher").hidden ? [] : [messages.join(";") || "nothing sent"]]);

            // 2.0.0: a PS2 case at an angle is centered on its art; other covers aren't marked.
            checks.push(["an angled PS2 cover is marked", gameCover({ id: "ps2:x", title: "X", emulator: "pcsx2", coverAngled: true }, "game-cover-tile").classList.contains("is-angled") && !gameCover({ id: "ps2:y", title: "Y", emulator: "pcsx2", coverAngled: false }, "game-cover-tile").classList.contains("is-angled") ? [] : ["not marked"]]);

            // 2.0.0: Read and Edit.
            checks.push(["a note with text opens in Read", !$("notePreview").hidden && $("noteText").hidden && $("noteReadButton").getAttribute("aria-pressed") === "true" ? [] : ["not in Read"]]);
            $("noteEditButton").click();
            checks.push(["Edit shows the plain text, focused", !$("noteText").hidden && $("notePreview").hidden && document.activeElement === $("noteText") ? [] : ["not in Edit"]]);
            $("noteText").value = "# Changed <img src=x onerror=alert(1)>";
            $("noteText").dispatchEvent(new Event("input", { bubbles: true }));
            $("noteReadButton").click();
            checks.push(["Read draws the text as it is now", $("notePreview").querySelector("h1")?.textContent.startsWith("Changed") ? [] : [$("notePreview").textContent]]);
            checks.push(["and keeps markup as text", $("notePreview").querySelector("img") ? ["markup ran"] : []]);
            $("notePreview").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
            checks.push(["a double-click in Read edits", !$("noteText").hidden ? [] : ["still reading"]]);
            const ctrlM = () => $("noteText").dispatchEvent(new KeyboardEvent("keydown", { key: "m", ctrlKey: true, bubbles: true, cancelable: true }));
            ctrlM();
            checks.push(["Ctrl + M from the text switches to the viewer", !$("notePreview").hidden && $("noteText").hidden ? [] : ["not switched"]]);
            ctrlM();
            checks.push(["and back to the editor", !$("noteText").hidden && document.activeElement === $("noteText") ? [] : ["not switched back"]]);
            checks.push(["the viewer and the editor differ in color", getComputedStyle($("noteText")).backgroundColor !== getComputedStyle($("notePreview")).backgroundColor ? [] : ["the same"]]);
            // The Markdown viewer's own controls (2.0.0).
            $("noteText").value = "- [ ] buy discs\n- [x] done\n\n[site](https://example.com) and [file](file:///C:/x)\n\n| A |\n| - |\n| <b>1</b> |";
            $("noteText").dispatchEvent(new Event("input", { bubbles: true }));
            setNoteMode("read");
            const firstBox = $("notePreview").querySelector(".md-task > input");
            firstBox.click();
            checks.push(["ticking a task box changes the note's text", activeNote().content.startsWith("- [x] buy discs") ? [] : [activeNote().content.split("\n")[0]]]);
            checks.push(["and keeps the viewer open", !$("notePreview").hidden ? [] : ["left the viewer"]]);
            checks.push(["a table is drawn with its markup as text", $("notePreview").querySelector("td")?.textContent === "<b>1</b>" && !$("notePreview").querySelector("td b") ? [] : ["wrong"]]);
            messages.length = 0;
            const [webLink, fileLink] = $("notePreview").querySelectorAll(".md-link");
            webLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
            checks.push(["a plain click on a link opens nothing", messages.some(message => message.startsWith("OpenNoteLink")) ? ["sent"] : []]);
            webLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
            checks.push(["Ctrl + click asks AHK to open a web link", messages.includes("OpenNoteLink\nhttps://example.com") ? [] : [messages.join(";") || "nothing sent"]]);
            messages.length = 0;
            fileLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
            checks.push(["but never a file link", messages.length ? [messages.join(";")] : []]);
            $("noteMarkdownButton").click();
            checks.push(["the Markdown reference opens", !$("markdownDialog").hidden && $("markdownRows").childElementCount === ASCSNotes.MARKDOWN_REFERENCE.length ? [] : ["not shown"]]);
            checks.push(["its examples are drawn by the viewer", $("markdownRows").querySelector(".md-ref-result table") && $("markdownRows").querySelector(".md-ref-result del") ? [] : ["missing"]]);
            $("markdownDialog").querySelector("section").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
            checks.push(["Esc closes it", $("markdownDialog").hidden ? [] : ["still open"]]);
            $("newNoteButton").click();
            checks.push(["a new note opens in Edit", !$("noteText").hidden && $("notePreview").hidden ? [] : ["not in Edit"]]);
            const codeNote = notesData.notes.find(note => note.type === "code");
            if (codeNote) {
                openNote(codeNote.id);
                checks.push(["code opens in Edit, with no Read", !$("noteText").hidden && $("noteModes").hidden ? [] : ["Read offered"]]);
            }
            checks.push(["the save status is in sentence case", /[a-z]/.test($("saveStatus").textContent) ? [] : [$("saveStatus").textContent]]);
            const saved = JSON.parse(serializeNotes());
            checks.push(["the link is saved with the note", saved.notes.some(note => note.game === gameKey) ? [] : ["not saved"]]);
            navigate("games");
            gamesState.openId = "";
            live(null);
            gamesState.items = [];
            checks.push(["no errors from game notes", errors.splice(0)]);

            // 2.0.0: Preferences holds what's the whole app's, and saves as it changes.
            navigate("settings");
            checks.push(["Preferences has no tabs and no Save buttons", $("settings").querySelector("[role='tab'], [type='submit']") || [...$("settings").querySelectorAll("button")].some(button => /^Save/.test(button.textContent)) ? ["still there"] : []]);
            checks.push(["and only what's the whole app's", ["ascsSounds", "almanacWikipedia", "gamePathRetroarch", "notesSpellcheck"].filter(id => $("settings").contains($(id)))]);
            checks.push(["Maestro sounds is on Sounds, the almanac in Today's settings, spell-check on Quick Notes, programs in Games › Setup",
                [["ascsSounds", "sounds"], ["almanacWikipedia", "todaySettingsDialog"], ["notesSpellcheck", "notes"], ["gamePathRetroarch", "gamesSetupPanel"]].filter(([id, home]) => !$(home).contains($(id))).map(([id]) => id)]);
            messages.length = 0;
            $("powerDelay").value = "30";
            $("powerDelay").dispatchEvent(new Event("change", { bubbles: true }));
            checks.push(["a change saves at once", messages.some(message => message.startsWith("SaveSettings\n") && message.split("|")[5] === "30") ? [] : [messages.join(";") || "nothing sent"]]);
            $("toast").textContent = "";
            handleWebMessage({ data: { type: "settingsSaved", message: "Settings saved." } });
            checks.push(["and says so quietly, without a toast", /^Saved at \d{1,2}:\d{2}\s?[AP]M$/.test($("settingsStatus").textContent) && !$("toast").textContent.includes("saved") ? [] : [$("settingsStatus").textContent, $("toast").textContent]]);
            // 2.0.0 manual pass: the status sits in the title bar, beside the page's name.
            checks.push(["the save status is in the title bar on Preferences", document.querySelector(".topbar").contains($("settingsStatus")) && !$("settingsStatus").hidden && $("settingsStatus").getBoundingClientRect().width > 0 ? [] : ["not showing"]]);
            checks.push(["and Games' isn't, there", $("gamesStatus").hidden ? [] : ["showing"]]);
            // 2.0.0: the title bar's status once shared a class with Quick Notes' footer, which then showed two dots.
            checks.push(["Quick Notes' save status keeps its one dot", getComputedStyle($("saveStatus"), "::before").content === "none" && $("saveStatus").querySelectorAll(".save-status-dot").length === 1 ? [] : [getComputedStyle($("saveStatus"), "::before").content]]);
            const wasLoaded = settingsLoaded;
            settingsLoaded = false;
            messages.length = 0;
            $("snapGap").dispatchEvent(new Event("change", { bubbles: true }));
            checks.push(["nothing is saved before the settings have arrived", messages.some(message => message.startsWith("SaveSettings")) ? ["saved blanks"] : []]);
            settingsLoaded = wasLoaded;
            messages.length = 0;
            $("ascsSounds").value = "off";
            $("ascsSounds").dispatchEvent(new Event("change", { bubbles: true }));
            checks.push(["Maestro sounds saves from Sounds", messages.some(message => message.startsWith("SaveSettings\n") && message.split("|")[6] === "off") ? [] : [messages.join(";") || "nothing sent"]]);
            handleWebMessage({ data: { type: "settingsSaved", message: "Settings saved." } });
            checks.push(["and confirms with a toast there", $("toast").textContent.includes("Maestro sounds saved") ? [] : [$("toast").textContent]]);

            // Games › Setup, saved as each field is left.
            document.querySelector('#settings [data-pref-go="games:setup"]').click();
            checks.push(["a link in Preferences opens Games › Setup", $("games").classList.contains("active") && gamesSections.current() === "setup" && !$("gamesSetupPanel").hidden ? [] : [gamesSections.current()]]);
            checks.push(["Setup's save status shows in the title bar, Preferences' doesn't", !$("gamesStatus").hidden && $("settingsStatus").hidden ? [] : ["wrong one"]]);
            gamesSections.show("library");
            checks.push(["and only on Setup", $("gamesStatus").hidden ? [] : ["showing on Library"]]);
            gamesSections.show("setup");
            handleWebMessage({ data: { type: "gameSettings", paths: { retroarch: "C:\\RA\\retroarch.exe", dolphin: "", pcsx2: "", pso: "", discord: "" }, headphones: "", soundSwitch: "", covers: false, voiceChannel: "", devices: [], retroAchievements: "off" } });
            checks.push(["its fields open once the saved values arrive", !$("gamePathDolphin").disabled ? [] : ["still disabled"]]);
            messages.length = 0;
            $("gamePathDolphin").value = "C:\\Dolphin\\Dolphin.exe";
            $("gamePathDolphin").dispatchEvent(new Event("change", { bubbles: true }));
            checks.push(["leaving a field saves Setup", messages.some(message => message.startsWith("SaveGameSettings\nC:\\RA\\retroarch.exe|C:\\Dolphin\\Dolphin.exe|")) ? [] : [messages.join(";") || "nothing sent"]]);
            messages.length = 0;
            $("psoVoiceChannel").value = "https://evil.example/channels/1/2";
            $("psoVoiceChannel").dispatchEvent(new Event("change", { bubbles: true }));
            checks.push(["a voice channel that isn't Discord's isn't saved", !messages.length && /Discord channel link/.test($("gamesStatus").textContent) ? [] : [messages.join(";"), $("gamesStatus").textContent]]);
            $("psoVoiceChannel").value = "";

            // The almanac, in Arrange.
            navigate("home");
            document.querySelector("#settings [data-pref-go='home:today']")?.click();
            checks.push(["a link in Preferences opens Today's settings", !$("todaySettingsDialog").hidden ? [] : ["not open"]]);
            messages.length = 0;
            $("almanacWikipedia").checked = !$("almanacWikipedia").checked;
            $("almanacWikipedia").dispatchEvent(new Event("change", { bubbles: true }));
            checks.push(["the Wikipedia almanac saves as it's switched", $("almanacWikipedia").disabled || messages.some(message => message.startsWith("SaveAlmanac")) ? [] : [messages.join(";") || "nothing sent"]]);
            $("almanacWikipedia").checked = !$("almanacWikipedia").checked;
            $("todaySettingsDone").click();
            // 2.1.0: Backups, in Preferences. The page never sends a folder.
            navigate("settings");
            const backupControls = ["backupsEnabled", "backupsTime", "backupsChoose", "backupsOpen", "backupsNow"];
            const noBackups = { type: "backups", enabled: false, time: "1800", folder: "", running: false, off: false, lastTime: "", lastResult: "", lastDetail: "", goodTime: "" };
            const withFolder = { ...noBackups, folder: "J:\\Maestro-Backups", lastTime: "20200102180000", lastResult: "ok", lastDetail: "10 files, 1.0 MB", goodTime: "20200102180000" };
            backupsState = null;
            renderBackups();
            checks.push(["Backups waits for Maestro before anything can be changed", backupControls.filter(id => !$(id).disabled)]);
            checks.push(["Backups' messages are allowlisted", ["SaveBackups", "ChooseBackupsFolder", "BackupNow", "OpenBackupsFolder"].filter(type => !new Set(window.SMOKE_ALLOWLIST || []).has(type))]);
            handleWebMessage({ data: noBackups });
            checks.push(["with no folder, only choosing one and the time are offered", backupControls.filter(id => $(id).disabled).join() === "backupsEnabled,backupsOpen,backupsNow" ? [] : [backupControls.filter(id => $(id).disabled).join()]]);
            checks.push(["and it says so", $("backupsFolder").textContent === "No folder chosen" && $("backupsStatus").textContent === "Choose a folder to turn backups on." ? [] : [$("backupsFolder").textContent, $("backupsStatus").textContent]]);
            messages.length = 0;
            $("backupsChoose").click();
            checks.push(["Choose asks Maestro for Windows' folder picker, and sends no path", messages.join(";") === "ChooseBackupsFolder\n" ? [] : [messages.join(";")]]);
            handleWebMessage({ data: withFolder });
            checks.push(["with a folder, everything is offered", backupControls.filter(id => $(id).disabled)]);
            checks.push(["the folder and the last backup are shown", $("backupsFolder").textContent === "J:\\Maestro-Backups" && $("backupsStatus").textContent === "Last backup made on Jan 2, 2020 at 6:00 PM · 10 files, 1.0 MB" ? [] : [$("backupsFolder").textContent, $("backupsStatus").textContent]]);
            checks.push(["every hour is offered, with the one that's set chosen", $("backupsTime").options.length === 24 && $("backupsTime").value === "1800" && $("backupsTime").selectedOptions[0].textContent === "6:00 PM" ? [] : [`${$("backupsTime").options.length} ${$("backupsTime").value}`]]);
            messages.length = 0;
            $("backupsEnabled").checked = true;
            $("backupsEnabled").dispatchEvent(new Event("change", { bubbles: true }));
            $("backupsTime").value = "0700";
            $("backupsTime").dispatchEvent(new Event("change", { bubbles: true }));
            checks.push(["each change saves at once, as on or off and a time", messages.join(";") === "SaveBackups\n1|1800;SaveBackups\n1|0700" ? [] : [messages.join(";")]]);
            handleWebMessage({ data: { type: "backupsSaved", ok: true, message: "Saved." } });
            checks.push(["and says so in the title bar", /^Saved at \d{1,2}:\d{2}\s?[AP]M$/.test($("settingsStatus").textContent) ? [] : [$("settingsStatus").textContent]]);
            $("toast").textContent = "";
            handleWebMessage({ data: { type: "backupsSaved", ok: false, message: "Backups must go to a drive inside this PC." } });
            checks.push(["a refusal is said, with why", $("settingsStatus").textContent === "Not saved" && $("toast").textContent.includes("inside this PC") ? [] : [$("settingsStatus").textContent, $("toast").textContent]]);
            messages.length = 0;
            $("backupsNow").click();
            $("backupsOpen").click();
            checks.push(["Back up now and Open folder ask Maestro", messages.join(";") === "BackupNow\n;OpenBackupsFolder\n" ? [] : [messages.join(";")]]);
            handleWebMessage({ data: { ...withFolder, enabled: true, running: true } });
            checks.push(["a backup under way can't be started again", $("backupsNow").disabled && $("backupsStatus").textContent === "Backing up…" ? [] : [$("backupsStatus").textContent]]);
            handleWebMessage({ data: { ...withFolder, enabled: true, lastTime: "20200103180000", lastResult: "failed", lastDetail: "Drive J: isn't available." } });
            checks.push(["a failed backup is said where it's set", $("backupsStatus").classList.contains("is-failed") && $("backupsStatus").textContent.includes("Drive J: isn't available.") ? [] : [$("backupsStatus").textContent]]);
            checks.push(["and is on the attention list", !$("attentionButton").hidden && $("attentionList").textContent.includes("Backup failed") ? [] : [$("attentionList").textContent || "nothing listed"]]);
            navigate("home");
            toggleAttention(true);
            [...$("attentionList").querySelectorAll(".attention-row")].find(row => row.textContent.includes("Backup failed"))?.querySelector("button")?.click();
            checks.push(["whose button opens Preferences", $("settings").classList.contains("active") && $("attentionPanel").hidden ? [] : ["not opened"]]);
            handleWebMessage({ data: { ...withFolder, enabled: true } });
            checks.push(["years without a backup is on the list too", /No backup for \d+ days/.test($("attentionList").textContent) ? [] : [$("attentionList").textContent || "nothing listed"]]);
            handleWebMessage({ data: { ...withFolder, enabled: true, off: true } });
            checks.push(["a test build offers nothing, and says why", backupControls.every(id => $(id).disabled) && $("backupsStatus").textContent === "Backups are off in a test build." && !/backup/i.test($("attentionList").textContent) ? [] : [$("backupsStatus").textContent]]);
            handleWebMessage({ data: noBackups });
            checks.push(["with backups off, nothing about them needs attention", /backup/i.test($("attentionList").textContent) ? [$("attentionList").textContent] : []]);
            // 2.9.0: Storage, in Preferences. Clearing asks first.
            {
                const tick = () => new Promise(resolve => setTimeout(resolve, 0));
                const MB = 1024 * 1024;
                const storage = { type: "storage", limitMB: 500, limits: [100, 250, 500, 1000], caches: [
                    { id: "images", bytes: 460 * MB, files: 1121, limit: 500 * MB },
                    { id: "almanac", bytes: 446000, files: 2 },
                    { id: "forecast", bytes: 0, files: 0 }] };
                storageState = null;
                messages.length = 0;
                navigate("settings");
                checks.push(["opening Preferences asks for the caches", messages.includes("GetStorage\n") ? [] : [messages.join(";")]]);
                checks.push(["the limit waits for Maestro", $("storageLimit").disabled ? [] : ["enabled"]]);
                checks.push(["Storage's messages are allowlisted", ["GetStorage", "SetCacheLimit", "ClearCache"].filter(type => !new Set(window.SMOKE_ALLOWLIST || []).has(type))]);
                handleWebMessage({ data: storage });
                const storageRows = [...$("storageRows").querySelectorAll(".storage-row")];
                checks.push(["a row for each cache", storageRows.map(row => row.querySelector("strong").textContent).join() === "RetroAchievements images,Wikipedia almanac,Forecast" ? [] : [storageRows.length]]);
                checks.push(["the images against their limit", storageRows[0]?.querySelector("small").textContent === "1,121 images · 460.0 MB of 500 MB" ? [] : [storageRows[0]?.querySelector("small").textContent]]);
                const storageFill = storageRows[0]?.querySelector(".metric-track > span");
                checks.push(["on a bar, gold past 90%", storageFill?.style.width === "92%" && storageFill.classList.contains("is-high") && storageRows[0].querySelector(".metric-track").getAttribute("aria-valuenow") === "92" ? [] : [storageFill?.style.width]]);
                checks.push(["only the image cache has a bar", storageRows.slice(1).every(row => !row.querySelector(".metric-track")) ? [] : ["a bar"]]);
                checks.push(["an empty cache can't be cleared", storageRows[2]?.querySelector("button").disabled && !storageRows[0]?.querySelector("button").disabled ? [] : ["clearable"]]);
                checks.push(["the limits are offered, with the one that's set chosen", [...$("storageLimit").options].map(option => option.textContent).join() === "100 MB,250 MB,500 MB,1 GB" && $("storageLimit").value === "500" && !$("storageLimit").disabled ? [] : [$("storageLimit").value]]);
                messages.length = 0;
                $("storageLimit").value = "1000";
                $("storageLimit").dispatchEvent(new Event("change", { bubbles: true }));
                checks.push(["a new limit saves at once", messages.join(";") === "SetCacheLimit\n1000" ? [] : [messages.join(";")]]);
                handleWebMessage({ data: { type: "storageSaved", ok: true } });
                checks.push(["and says so in the title bar", /^Saved at /.test($("settingsStatus").textContent) ? [] : [$("settingsStatus").textContent]]);
                messages.length = 0;
                storageRows[0].querySelector("button").click();
                await tick();
                checks.push(["Clear asks first, saying what it costs", !$("confirmDialog").hidden && $("confirmDialogTitle").textContent === "Clear the RetroAchievements image cache?" ? [] : [$("confirmDialogTitle").textContent]]);
                $("confirmDialogCancel").click();
                await tick();
                checks.push(["Cancel clears nothing", messages.length === 0 ? [] : [messages.join(";")]]);
                $("storageRows").querySelector(".storage-row button").click();
                await tick();
                $("confirmDialogConfirm").click();
                await tick();
                checks.push(["confirming asks Maestro to clear that cache", messages.join(";") === "ClearCache\nimages" ? [] : [messages.join(";")]]);
                handleWebMessage({ data: { type: "storage", error: "Maestro couldn't read its caches." } });
                checks.push(["a cache that can't be read is said", $("storageRows").textContent === "Maestro couldn't read its caches." && $("storageLimit").disabled ? [] : [$("storageRows").textContent]]);
                storageState = null;
            }
            // 2.1.0: the notes trash. Delete asks nothing and can be undone; only
            // deleting from the trash is for good, and that asks first.
            {
                const notesBefore = serializeNotes();
                const tick = () => new Promise(resolve => setTimeout(resolve, 0));
                const at = "2026-11-01T00:00:00.000Z";
                const plain = (id, title, content) => ({ id, title, type: "note", content, pinned: false, created: at, updated: at });
                navigate("notes");
                handleWebMessage({ data: { type: "notes", recovered: false, data: JSON.stringify({ version: 2, activeId: "t2", notes: [plain("t1", "Keep me", "one"), plain("t2", "Bin me", "two")],
                    trash: [{ ...plain("t0", "<b>Old</b>", "three"), deletedAt: new Date(Date.now() - 86400000).toISOString() }, { ...plain("gone", "Long gone", "four"), deletedAt: "2020-01-01T00:00:00.000Z" }] }) } });
                flushPendingNotes();
                checks.push(["a trashed note past its 30 days is gone when notes load", notesData.trash.map(entry => entry.id).join() === "t0" ? [] : [notesData.trash.map(entry => entry.id).join()]]);
                checks.push(["the Trash button shows how many it holds", !$("notesTrashButton").hidden && $("notesTrashButton").textContent === "Trash · 1" ? [] : [$("notesTrashButton").textContent]]);
                messages.length = 0;
                $("toast").textContent = "";
                $("deleteNoteButton").click();
                checks.push(["Delete asks nothing", $("confirmDialog").hidden ? [] : ["a dialog opened"]]);
                checks.push(["the note leaves the list for the trash", !$("notesList").textContent.includes("Bin me") && notesData.trash.map(entry => entry.id).join() === "t2,t0" && $("notesTrashButton").textContent === "Trash · 2" ? [] : [$("notesTrashButton").textContent]]);
                checks.push(["and the toast offers Undo", $("toast").textContent.includes('Deleted "Bin me"') && $("toast").querySelector("button")?.textContent === "Undo" ? [] : [$("toast").textContent]]);
                flushPendingNotes();
                const savedTrash = JSON.parse((messages.filter(message => message.startsWith("SaveNotes\n")).pop() || "SaveNotes\n{}").slice(10));
                checks.push(["the trash is saved with the notes, each entry with when it was deleted", savedTrash.notes?.length === 1 && savedTrash.trash?.length === 2 && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(savedTrash.trash[0].deletedAt) ? [] : [JSON.stringify(savedTrash).slice(0, 200)]]);
                $("toast").querySelector("button").click();
                checks.push(["Undo puts the note back and opens it", notesData.notes.some(note => note.id === "t2") && notesData.activeId === "t2" && notesData.trash.length === 1 && $("noteTitle").value === "Bin me" ? [] : [notesData.activeId]]);

                $("notesTrashButton").click();
                const rows = () => [...$("notesTrashList").querySelectorAll(".notes-trash-row")];
                checks.push(["the Trash button opens the trash", !$("notesTrashDialog").hidden && rows().length === 1 && $("notesTrashDialog").contains(document.activeElement) ? [] : [`${rows().length} rows`]]);
                checks.push(["a trashed note's title is shown as text, with the days it has left", rows()[0]?.querySelector("strong").textContent === "<b>Old</b>" && !$("notesTrashList").querySelector("b") && /^Deleted \w{3} \d{1,2} · 29 days left$/.test(rows()[0]?.querySelector("small").textContent) ? [] : [rows()[0]?.textContent]]);
                $("notesTrashDialog").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
                checks.push(["Esc closes it, and the focus goes back to the button", $("notesTrashDialog").hidden && document.activeElement === $("notesTrashButton") ? [] : ["still open"]]);
                $("notesTrashButton").click();
                [...rows()[0].querySelectorAll("button")].find(button => button.textContent === "Restore").click();
                checks.push(["Restore puts it among the notes and opens it", notesData.notes.some(note => note.id === "t0") && notesData.activeId === "t0" ? [] : [notesData.activeId]]);
                checks.push(["an emptied trash closes, and its button goes", $("notesTrashDialog").hidden && $("notesTrashButton").hidden ? [] : ["still showing"]]);

                $("deleteNoteButton").click();
                $("notesTrashButton").click();
                [...rows()[0].querySelectorAll("button")].find(button => button.textContent === "Delete forever").click();
                checks.push(["Delete forever asks first, over the trash", !$("confirmDialog").hidden && !$("notesTrashDialog").hidden && $("confirmDialogTitle").textContent.includes("forever") ? [] : ["no dialog"]]);
                $("confirmDialogCancel").click();
                await tick();
                checks.push(["Cancel keeps the note", notesData.trash.length === 1 && !$("notesTrashDialog").hidden ? [] : [`${notesData.trash.length} in the trash`]]);
                [...rows()[0].querySelectorAll("button")].find(button => button.textContent === "Delete forever").click();
                $("confirmDialogConfirm").click();
                await tick();
                checks.push(["confirming deletes it for good", notesData.trash.length === 0 && !notesData.notes.some(note => note.id === "t0") && $("notesTrashDialog").hidden ? [] : [`${notesData.trash.length} in the trash`]]);

                $("newNoteButton").click();
                $("toast").textContent = "";
                $("deleteNoteButton").click();
                checks.push(["an empty note is only removed, with nothing to undo", notesData.trash.length === 0 && !$("toast").textContent.includes("Deleted") ? [] : [$("toast").textContent]]);

                notesData.activeId = "t1";
                renderActiveNote();
                $("deleteNoteButton").click();
                notesData.activeId = "t2";
                renderActiveNote();
                $("deleteNoteButton").click();
                $("notesTrashButton").click();
                $("notesTrashEmpty").click();
                checks.push(["Empty trash asks first, and says how many", !$("confirmDialog").hidden && $("confirmDialogMessage").textContent === "2 notes will be deleted for good." ? [] : [$("confirmDialogMessage").textContent]]);
                $("confirmDialogConfirm").click();
                await tick();
                checks.push(["and then the trash is empty", notesData.trash.length === 0 && $("notesTrashDialog").hidden && $("notesTrashButton").hidden ? [] : [`${notesData.trash.length} left`]]);
                checks.push(["no errors from the trash", errors.splice(0)]);
                handleWebMessage({ data: { type: "notes", recovered: false, data: notesBefore } });
                flushPendingNotes();
                $("toast").textContent = "";
                navigate("settings");
            }
            checks.push(["no errors from Preferences", errors.splice(0)]);

            // 2.0.0: Ctrl + F's filter marks its words in the open note.
            const findText = `Buy **milk** today.\n\n${"A long line that wraps across the editor many times over. ".repeat(60)}\n\n- milk again\n- and MILK at the end`;
            const findNote = { id: "find", title: "Shopping", type: "note", content: findText, pinned: false, created: "2020-01-01T00:00:00.000Z", updated: "2020-01-01T00:00:00.000Z" };
            handleWebMessage({ data: { type: "notes", data: JSON.stringify({ version: 2, activeId: "find", notes: [findNote] }), recovered: false } });
            navigate("notes");
            openNote("find", "read");
            const filterKey = (key, shiftKey = false) => $("notesFilter").dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true }));
            checks.push(["Ctrl + F on Quick Notes goes to the filter", document.activeElement === $("notesFilter") ? [] : [document.activeElement?.id]]);
            typeInto($("notesFilter"), "milk");
            checks.push(["the viewer marks every match, and counts them", CSS.highlights.get("note-find")?.size === 3 && $("notesFindCount").textContent === "1 of 3" && !$("notesFindCount").hidden ? [] : [CSS.highlights.get("note-find")?.size, $("notesFindCount").textContent]]);
            const currentText = () => [...(CSS.highlights.get("note-find-current") || [])][0]?.toString();
            checks.push(["the first is the current one", currentText() === "milk" ? [] : [currentText()]]);
            filterKey("Enter");
            filterKey("Enter");
            checks.push(["Enter steps to the next, keeping the focus in the filter", $("notesFindCount").textContent === "3 of 3" && currentText() === "MILK" && document.activeElement === $("notesFilter") ? [] : [$("notesFindCount").textContent]]);
            checks.push(["and scrolls the note to it", $("notePreview").scrollTop > 0 ? [] : ["not scrolled"]]);
            filterKey("Enter");
            checks.push(["after the last, it goes round to the first", $("notesFindCount").textContent === "1 of 3" ? [] : [$("notesFindCount").textContent]]);
            filterKey("Enter", true);
            checks.push(["Shift + Enter goes back", $("notesFindCount").textContent === "3 of 3" ? [] : [$("notesFindCount").textContent]]);
            checks.push(["the note itself is unchanged", !$("notePreview").querySelector("mark") && $("notePreview").querySelector("strong")?.textContent === "milk" ? [] : ["changed"]]);
            setNoteMode("edit");
            $("notesFilter").focus();
            const mirror = $("noteFindMirror");
            checks.push(["the editor marks them too, raw text included", mirror?.querySelectorAll("mark").length === 3 && $("notesFindCount").textContent === "1 of 3" && $("noteText").classList.contains("is-finding") ? [] : [mirror?.querySelectorAll("mark").length, $("notesFindCount").textContent]]);
            const textBox = $("noteText").getBoundingClientRect(), mirrorBox = mirror.getBoundingClientRect();
            checks.push(["its copy lies exactly over the text box", ["left", "top", "width", "height"].every(side => Math.abs(textBox[side] - mirrorBox[side]) < 0.5) ? [] : [JSON.stringify(textBox), JSON.stringify(mirrorBox)]]);
            checks.push(["and wraps the text the same way", Math.abs(mirror.scrollHeight - $("noteText").scrollHeight) <= 2 ? [] : [mirror.scrollHeight, $("noteText").scrollHeight]]);
            filterKey("Enter", true);
            checks.push(["stepping scrolls the text box, and the copy with it", $("noteText").scrollTop > 0 && Math.abs(mirror.scrollTop - $("noteText").scrollTop) <= 1 ? [] : [$("noteText").scrollTop, mirror.scrollTop]]);
            const lastMark = mirror.querySelector("mark.is-current");
            checks.push(["with the current match in sight", lastMark && lastMark.offsetTop >= $("noteText").scrollTop && lastMark.offsetTop + lastMark.offsetHeight <= $("noteText").scrollTop + $("noteText").clientHeight ? [] : ["out of sight"]]);
            typeInto($("notesFilter"), "cheese");
            checks.push(["a word that isn't there says so", $("notesFindCount").textContent === "Not in this note" && !$("noteFindMirror") && !$("noteText").classList.contains("is-finding") ? [] : [$("notesFindCount").textContent]]);
            typeInto($("notesFilter"), "milk");
            filterKey("Escape");
            checks.push(["Esc clears the filter and the marks", $("notesFilter").value === "" && $("notesFindCount").hidden && !$("noteFindMirror") && !CSS.highlights.get("note-find") ? [] : ["still marked"]]);
            checks.push(["no errors from finding text", errors.splice(0)]);

            // 2.0.0 manual pass: a focus ring is never cut off. On every page and
            // section, each control that shows is focused, and no box that clips
            // its children may cut into the ring. A list scrolled part-way may
            // hide a ring at the edge it's scrolled past, so those edges count
            // only at that end of the scroll.
            const clippedRings = [];
            const ringCheck = place => {
                const view = document.querySelector(".view.active");
                view.querySelectorAll("a[href], button, input, select, textarea, [tabindex='0']").forEach(node => {
                    if (node.disabled || node.closest("[hidden], [inert]")) return;
                    const box = node.getBoundingClientRect();
                    if (!box.width || !box.height || getComputedStyle(node).visibility === "hidden") return;
                    node.focus();
                    if (document.activeElement !== node || !node.matches(":focus-visible")) return;
                    const style = getComputedStyle(node);
                    const reach = style.outlineStyle === "none" ? 0 : Math.max(0, parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth));
                    if (!reach) return;
                    for (let clip = node.parentElement; clip && clip !== document.body; clip = clip.parentElement) {
                        const css = getComputedStyle(clip);
                        if (css.overflowX === "visible" && css.overflowY === "visible") continue;
                        const outer = clip.getBoundingClientRect();
                        const left = outer.left + clip.clientLeft, top = outer.top + clip.clientTop;
                        const right = left + clip.clientWidth, bottom = top + clip.clientHeight;
                        const shows = box.left >= left - 0.5 && box.right <= right + 0.5 && box.top >= top - 0.5 && box.bottom <= bottom + 0.5;
                        if (!shows) break;      // scrolled out of sight, or cut off by design
                        const atTop = clip.scrollTop <= 0, atBottom = clip.scrollTop >= clip.scrollHeight - clip.clientHeight - 1;
                        const atLeft = clip.scrollLeft <= 0, atRight = clip.scrollLeft >= clip.scrollWidth - clip.clientWidth - 1;
                        const cut = [[atTop, "top", top - (box.top - reach)], [atBottom, "bottom", box.bottom + reach - bottom],
                            [atLeft, "left", left - (box.left - reach)], [atRight, "right", box.right + reach - right]]
                            .filter(([end, , by]) => end && by > 0.5).map(([, side, by]) => `${side} ${Math.round(by)} px`);
                        if (cut.length) {
                            const name = node.id || node.getAttribute("aria-label") || node.textContent.trim().slice(0, 24) || node.tagName;
                            clippedRings.push(`${place}: ${name.slice(0, 40)} in ${clip.id || clip.getAttribute("class")} (${cut.join(", ")})`);
                            break;
                        }
                    }
                });
                document.activeElement?.blur();
            };
            // 2.2.0: no small text on any page, tab, the sidebar or the title bar.
            // Lato is at least 18 px; the condensed display face reads smaller,
            // so it's at least 19. The keyboard map's SVG scales with the window.
            const smallText = new Set();
            // 2.2.0: seven sizes, with Lato and the display face paired at the
            // smallest. The sidebar's brand keeps its own measured sizes, and
            // text only a screen reader reads has no size to see.
            const STEPS = [18, 19, 20, 22, 26, 34, 40, 58];
            const offScale = new Set();
            const sizeCheck = place => {
                const areas = [document.querySelector(".view.active"), document.querySelector(".sidebar"), document.querySelector(".topbar")];
                areas.forEach((area, index) => {
                    const where = index ? "shell" : place;
                    const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
                    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
                        const owner = text.parentElement;
                        if (!text.textContent.trim() || !owner || owner.closest("svg, [hidden], option, script, style")) continue;
                        const box = owner.getBoundingClientRect();
                        const style = getComputedStyle(owner);
                        if (!box.width || !box.height || style.visibility === "hidden") continue;
                        const px = parseFloat(style.fontSize);
                        const display = /Maestro Display|Bahnschrift/.test(style.fontFamily.split(",")[0]);
                        if (px < (display ? 19 : 18)) smallText.add(`${where}: ${owner.id ? "#" + owner.id : owner.tagName.toLowerCase() + "." + [...owner.classList].join(".")} ${px}px "${text.textContent.trim().slice(0, 24)}"`);
                        if (!STEPS.includes(Math.round(px * 10) / 10) && !owner.closest(".brand, .sr-only")) offScale.add(`${owner.id ? "#" + owner.id : owner.tagName.toLowerCase() + "." + [...owner.classList].join(".")} ${px}px "${text.textContent.trim().slice(0, 24)}"`);
                    }
                });
            };
            // One icon set (2.2.0): every drawing that's an icon comes from icons.js,
            // isn't empty, and is drawn at 20 or 24 px. The logo, the window
            // controls (Windows' own caption glyphs), charts, the keyboard map, the
            // almanac's sun and moon, and the Conservatory's neck, keys, staves and
            // chord diagrams are drawings, not icons.
            const NOT_ICONS = ".brand-mark, .window-control, .chart-plot, .keymap, .alm-moon, .alm-sun, .cons-neck, .cons-keys, .cons-map, .cons-staff, .cons-mini, .cp-score, .rh-circle";
            const iconProblems = new Set();
            const iconCheck = place => {
                [document.querySelector(".view.active"), document.querySelector(".sidebar"), document.querySelector(".topbar")].forEach((area, index) => {
                    const where = index ? "shell" : place;
                    area.querySelectorAll("svg").forEach(svg => {
                        if (svg.parentElement?.closest("svg") || svg.closest(NOT_ICONS) || svg.closest("[hidden]")) return;
                        const holder = svg.parentElement;
                        const name = holder?.id ? "#" + holder.id : `${holder?.tagName.toLowerCase()}.${[...(holder?.classList || [])].join(".")}`;
                        const width = Math.round(svg.getBoundingClientRect().width);
                        if (!svg.classList.contains("icon")) iconProblems.add(`${where}: a drawing outside the set in ${name}`);
                        else if (!svg.childElementCount) iconProblems.add(`${where}: an empty icon in ${name}`);
                        else if (width && width !== 20 && width !== 24) iconProblems.add(`${where}: an icon ${width} px wide in ${name}`);
                    });
                    // A glyph standing in for an icon, alone or at either end of a button's words.
                    area.querySelectorAll("button, a").forEach(control => {
                        const copy = control.cloneNode(true);
                        copy.querySelectorAll("kbd").forEach(key => key.remove());     // a key's name is text, not an icon
                        const words = copy.textContent.trim();
                        if (/^[‹›⋯×✕♥♡◆→↗↻]|[‹›⋯×✕♥♡◆→↗↻]$/.test(words)) iconProblems.add(`${where}: a glyph for an icon in "${words.slice(0, 30)}"`);
                    });
                });
            };
            // 2.6.0: a control none of the house's styles reach falls back to
            // the browser's own: a gray, raised button, or a select whose text
            // touches its edge.
            const unstyled = new Set();
            const styleCheck = place => {
                document.querySelector(".view.active").querySelectorAll("button, select").forEach(control => {
                    if (!control.getClientRects().length) return;
                    const look = getComputedStyle(control);
                    const name = control.id ? "#" + control.id : `${control.tagName.toLowerCase()}.${[...control.classList].join(".")}`;
                    if (look.borderTopStyle === "outset") unstyled.add(`${place}: ${name} is the browser's own button`);
                    if (control.tagName === "SELECT" && parseFloat(look.paddingLeft) < 8) unstyled.add(`${place}: ${name} has no inner padding`);
                });
            };
            const sectioned = { games: gamesSections, dashboard: systemSections, sounds: soundSections, commands: commandsSections, workspaces: workspaceSections, conservatory: consSections };
            // The Calendars list with a calendar in it, where the cut-off Edit was found.
            const calendarsBefore = { loaded: calState.loaded, calendars: calState.calendars };
            calState.loaded = true;
            calState.calendars = [{ id: "personal", name: "Personal", color: "#b4476f" }, { id: "work", name: "Work", color: "#3a12a6" }];
            views.forEach(view => {
                navigate(view);
                if (view === "calendar") renderCalendar();
                const sections = sectioned[view];
                if (!sections) return (ringCheck(view), sizeCheck(view), iconCheck(view), styleCheck(view));
                const tabs = [...document.querySelectorAll(`#${view} [data-section-tab]`)].map(tab => tab.dataset.sectionTab);
                tabs.forEach(tab => { sections.show(tab); ringCheck(`${view} › ${tab}`); sizeCheck(`${view} › ${tab}`); iconCheck(`${view} › ${tab}`); styleCheck(`${view} › ${tab}`); });
            });
            // Each of the Quiz's kinds has controls of its own (2.6.0: Reading's pad was the browser's).
            navigate("conservatory");
            consSections.show("quiz");
            const quizKindBefore = cons.settings.quizKind;
            MaestroMusic.QUIZ_KINDS.forEach(kind => {
                cons.settings.quizKind = kind;
                newQuizQuestion({ play: false });
                renderConservatory();
                styleCheck(`conservatory › quiz › ${kind}`);
            });
            cons.settings.quizKind = quizKindBefore;
            newQuizQuestion({ play: false });
            Object.assign(calState, calendarsBefore);
            checks.push(["no control's focus ring is cut off", [...new Set(clippedRings)]]);
            checks.push(["no text under 18 px, or 19 px in the display face", [...smallText]]);
            checks.push(["every text is one of the seven sizes", [...offScale]]);
            checks.push(["every icon is from the set, drawn at 20 or 24 px", [...iconProblems]]);
            checks.push(["every button and select has the house's style", [...unstyled]]);
            checks.push(["no errors from focusing every control", errors.splice(0)]);

            const allowedNow = new Set(window.SMOKE_ALLOWLIST || []);
            checks.push(["the Workspaces page sends only allowlisted messages", [...new Set(messages.map(message => message.split("\n")[0]))].filter(type => !allowedNow.has(type))]);
            checks.push(["no errors from the Workspaces page", errors.splice(0)]);
            } catch (error) {
                // A step that throws is a failure to read, not a run with no report.
                checks.push(["the checks ran to the end", [`${error.message} ${String(error.stack).split("\n")[1] || ""}`]]);
            }
            report(checks);
        }, 800);
    }, 300));
})();
