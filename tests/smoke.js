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
            checks.push(["Next Up shows it's loading", !$("gamesNextUp").hidden && $("gamesNextUp").querySelector(".loading-note") ? [] : ["hidden"]]);
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
            const ownText = node => [...node.childNodes].filter(child => child.nodeType === Node.TEXT_NODE).map(child => child.textContent).join(" ").trim();
            const lowered = text => text.split(/\s+/).filter((word, index, words) => /^[a-z]/.test(word) && (index === 0 || index === words.length - 1 || !small.has(word)));
            checks.push(["headings are in title case", [...document.querySelectorAll("h1, h2, h3, th, [role=tab]")]
                .filter(node => !node.closest("[data-user-text], #notePreview, .note-preview, .markdown-body"))
                .filter(node => lowered(ownText(node)).length)
                .map(node => `"${ownText(node)}"`)]);
            checks.push(["Ctrl numbers cover the eight pages", sidebarViews().length === 8 && sidebarViews()[7] === "commands" ? [] : [sidebarViews().join()]]);
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
                .filter(selector => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize) < 17);
            checks.push(["nothing on the page is smaller than 17 px", tooSmall]);
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
            pressKey("g");
            checks.push(["a free letter offers every command", !$("keyRunsField").hidden && $("keySave").textContent === "Assign" && $("keyRuns").options.length === 10 ? [] : [String($("keyRuns").options.length)]]);
            messages.length = 0;
            $("keyEditForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            checks.push(["with no command chosen, nothing is sent", !messages.length && $("keyStatus").textContent.includes("Choose") ? [] : [messages.join()]]);
            $("keyRuns").value = "action:everything";
            $("keyEditForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            checks.push(["assigning sends the whole settings line, with the new letter", messages.some(message => message.startsWith("SaveSettings") && message.includes("|q,g,i,t,e,c,h|")) ? [] : [messages.join()]]);
            checks.push(["and keeps the other settings", messages.some(message => message.includes("https://x/?q=%s") && message.includes("Ctrl+Alt+Space")) ? [] : [messages.join()]]);
            checks.push(["nothing moves until it's saved", currentHotkeys.everything === "f" ? [] : [currentHotkeys.everything]]);
            handleWebMessage({ data: { type: "settingsSaved", message: "Saved and applied." } });
            checks.push(["saved, the command is on its new key", currentHotkeys.everything === "g" && $("keyDetailName").textContent === "Everything" && keymapSelected === "g" ? [] : [currentHotkeys.everything]]);
            pressKey("g");
            $("keyLetter").value = "q";
            messages.length = 0;
            $("keyEditForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            checks.push(["a clash is refused without saving", !messages.length && $("keyStatus").textContent.includes("Quick Notes") ? [] : [$("keyStatus").textContent]]);
            $("keyReset").click();
            checks.push(["Reset goes back to the default letter", messages.some(message => message.includes("|q,f,i,t,e,c,h|")) ? [] : [messages.join()]]);
            handleWebMessage({ data: { type: "error", scope: "settings", message: "Nope." } });
            checks.push(["a backend refusal shows and changes nothing", $("keyStatus").textContent === "Nope." && currentHotkeys.everything === "g" ? [] : [$("keyStatus").textContent]]);
            handleWebMessage({ data: { type: "settings", drives: ["C:"], snapGap: 0, preserveSize: true, hotkeys: { notes: "q", everything: "f", dashboard: "i", terminal: "t", explorer: "e", claude: "c", taskmanager: "h" }, claudeShortcut: "Ctrl+Alt+Space", powerDelay: 0, ascsSounds: "show", searchTemplate: "https://x/?q=%s" } });
            pressKey("a");
            checks.push(["a custom command's key can lose its letter", $("keyReset").textContent === "Remove letter" ? [] : [$("keyReset").textContent]]);
            messages.length = 0;
            $("keyLetter").value = "g";
            $("keyEditForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            checks.push(["moving a custom command saves the commands", messages.some(message => message.startsWith("SaveCommands") && message.includes("Repo\tfolder\tC:\\x\tg")) ? [] : [messages.join()]]);
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
                2: { ID: 2, Title: "Next Step", Description: "Do the thing", Points: 10, BadgeName: "2", DisplayOrder: 2, NumAwarded: 5, type: "progression" }
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
            checks.push(["site badges wait for their reply", $("gamesAchievements").querySelector(".ra-awards .loading-note") ? [] : ["no note"]]);
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
            checks.push(["the name and picture sit left of the numbers", pictureBox.right <= awardBox.querySelector(".ra-stats > span:not(.ra-player)").getBoundingClientRect().left ? [] : ["overlapping"]]);
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
            ctrl("9");
            checks.push(["Ctrl + 9 is free", $("settings").classList.contains("active") ? [] : ["it moved"]]);
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

            // 2.0.0: the Command Center.
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
            const moduleCount = document.querySelectorAll("#homeFace > [data-module]").length;
            checks.push(["every module in the list is on the page", moduleCount === MaestroHomeLayout.MODULES.length ? [] : [moduleCount]]);
            const savedLayout = localStorage.getItem(HOME_LAYOUT_KEY);
            // 2.0.0: Arrange, on the page itself.
            const moduleOrder = id => Number(document.querySelector(`#homeFace [data-module="${id}"]`).style.order);
            const moduleWidth = id => document.querySelector(`#homeFace [data-module="${id}"]`).dataset.width;
            const arrangeGrip = id => document.querySelector(`[data-arrange="${id}-grip"]`);
            const arrangeKey = (id, key, shift = false) => arrangeGrip(id).dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey: shift, bubbles: true, cancelable: true }));
            const tile = id => document.querySelector(`#homeFace [data-module="${id}"] > .arrange-overlay`);
            const storedLayout = () => MaestroHomeLayout.parse(localStorage.getItem(HOME_LAYOUT_KEY));
            changeHomeLayout(MaestroHomeLayout.defaults());
            $("arrangeButton").click();
            checks.push(["Arrange turns the modules into tiles", $("home").classList.contains("is-arranging") && document.querySelectorAll("#homeFace > [data-module] > .arrange-overlay:not([hidden])").length === moduleCount && !$("arrangeDock").hidden ? [] : ["not arranging"]]);
            checks.push(["and its button becomes Done", $("arrangeButton").textContent === "Done" && $("arrangeButton").getAttribute("aria-pressed") === "true" ? [] : [$("arrangeButton").textContent]]);
            checks.push(["a module's own controls are out of reach", $("todayOpen").closest("[inert]") && $("homeNoteInput").closest("[inert]") ? [] : ["reachable"]]);
            checks.push(["the dock says how it fits", $("arrangeFit").textContent === "This fills the window." ? [] : [$("arrangeFit").textContent]]);
            checks.push(["and holds the modules that start hidden", ["weather", "processes", "network", "audio", "controllers", "pinned", "unlocks", "timer"].every(id => document.querySelector(`[data-arrange="${id}-show"]`)) ? [] : [$("arrangeTray").textContent]]);
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
            tile("today").querySelector('[data-arrange="today-width-1"]').click();
            checks.push(["its width buttons set it too", moduleWidth("today") === "1" && tile("today").querySelector('[data-arrange="today-width-1"]').getAttribute("aria-pressed") === "true" ? [] : [moduleWidth("today")]]);
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
            // The right edge sets the width.
            const handle = tile("note").querySelector(".arrange-resize");
            const noteBox = document.querySelector('#homeFace [data-module="note"]').getBoundingClientRect();
            const farRight = { clientX: noteBox.left + noteBox.width * 2.1, clientY: noteBox.top + 20 };
            pointerAt(handle, "pointerdown", centerOf(handle));
            pointerAt(document, "pointermove", farRight);
            pointerAt(document, "pointerup", farRight);
            checks.push(["dragging the right edge widens it", moduleWidth("note") !== "1" && storedLayout().widths.note > 1 ? [] : [moduleWidth("note")]]);
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
            // 2.0.0: the added modules.
            changeHomeLayout({ ...MaestroHomeLayout.defaults(), hidden: [] });
            checks.push(["every added module can show", ["weather", "processes", "network", "audio", "controllers", "pinned", "unlocks", "timer"].every(id => !document.querySelector(`#homeFace [data-module="${id}"]`).hidden) ? [] : ["hidden"]]);
            const wasHidden = windowIsHidden;
            windowIsHidden = false;
            messages.length = 0;
            askHomeExtras(true);
            windowIsHidden = wasHidden;
            checks.push(["they ask only for what shows", messages.includes("GetWeather\n") && messages.includes("GetHomeStats\nnetwork,processes") ? [] : [messages.join(";")]]);
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
            if (savedLayout === null) localStorage.removeItem(HOME_LAYOUT_KEY); else localStorage.setItem(HOME_LAYOUT_KEY, savedLayout);
            const notesBefore = notesData.notes.length;
            $("homeNoteInput").value = "From the Command Center";
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

            const libraryGame = { id: "st:1", title: gameTitle, emulator: "steam", system: "", seconds: 0, last: "", plays: 0, launchable: false, installed: true, cover: false };
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
            checks.push(["the palette is called Command Palette", $("launcherTitle").textContent === "Command Palette" ? [] : [$("launcherTitle").textContent]]);
            checks.push(["and says Super + Space opens it from anywhere", /Super\s*\+\s*Space opens it from anywhere/.test(document.querySelector(".launcher-anywhere")?.textContent.replace(/\s+/g, " ") || "") ? [] : ["missing"]]);
            const typeInPalette = text => { $("launcherSearch").value = text; $("launcherSearch").dispatchEvent(new Event("input", { bubbles: true })); };
            const firstResult = () => $("launcherResults").querySelector(".launcher-option strong")?.textContent;
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
            const sectioned = { games: gamesSections, dashboard: systemSections, sounds: soundSections, commands: commandsSections, workspaces: workspaceSections };
            // The Calendars list with a calendar in it, where the cut-off Edit was found.
            const calendarsBefore = { loaded: calState.loaded, calendars: calState.calendars };
            calState.loaded = true;
            calState.calendars = [{ id: "personal", name: "Personal", color: "#b4476f" }, { id: "work", name: "Work", color: "#3a12a6" }];
            views.forEach(view => {
                navigate(view);
                if (view === "calendar") renderCalendar();
                const sections = sectioned[view];
                if (!sections) return ringCheck(view);
                const tabs = [...document.querySelectorAll(`#${view} [data-section-tab]`)].map(tab => tab.dataset.sectionTab);
                tabs.forEach(tab => { sections.show(tab); ringCheck(`${view} › ${tab}`); });
            });
            Object.assign(calState, calendarsBefore);
            checks.push(["no control's focus ring is cut off", [...new Set(clippedRings)]]);
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
