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
            const shelf = getComputedStyle(document.querySelector(".games-continue"));
            const px = value => parseFloat(value) || 0;
            checks.push(["Continue playing has room for a hovered, focused tile",
                px(shelf.paddingTop) >= 6 && px(shelf.paddingLeft) >= 4 && px(shelf.paddingRight) >= 4 ? [] : [`padding ${shelf.padding}`]]);
            checks.push(["its tiles stay lined up with the page",
                px(shelf.marginTop) === -px(shelf.paddingTop) && px(shelf.marginLeft) === -px(shelf.paddingLeft) ? [] : [`margin ${shelf.margin}, padding ${shelf.padding}`]]);
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
            navigate("sounds");
            handleStartupSounds({ signin: [{ weight: 100, file: "a.wav", id: "a.wav", origin: "a.wav", exists: true, changed: false }], shutdown: null, taskWarning: "Test warning" });
            checks.push(["Sounds > Startup shows the sign-in task warning",
                document.querySelector("#soundStartup .startup-task-warning")?.textContent === "Test warning" ? [] : ["not shown"]]);
            handleStartupSounds({ signin: [{ weight: 100, file: "a.wav", id: "a.wav", origin: "a.wav", exists: true, changed: false }], shutdown: null, taskWarning: "" });
            checks.push(["and shows none when all is well", document.querySelector("#soundStartup .startup-task-warning") ? ["still shown"] : []]);
            navigate("dashboard");
            sent.clear(); handleWebMessage({ data: { type: "signInHistory", items: [{ time: "2026-11-08T10:28:15", retrobar: 4937, taskbar: 2515, apps: 5171, keychron: 5515, sound: "<b>x</b>" }, { retrobar: "junk" }] } });
            showSignInTip(0);
            const tipText = $("signInTip").textContent;
            checks.push(["the graph's card shows a point's times", !$("signInTip").hidden && tipText.includes("4.9 s") && tipText.includes("Keychron") && tipText.includes("Sound: ") ? [] : ["wrong card"]]);
            checks.push(["and keeps hostile text as text", $("signInTip").querySelector("b") ? ["markup ran"] : []]);
            checks.push(["points no longer use the plain tooltip", document.querySelector("#signInPoints [title]") ? ["title found"] : []]);
            hideSignInTip();
            checks.push(["System Dashboard graphs sign-ins",
                document.querySelectorAll("#signInPoints .signin-point").length === 1 && !document.querySelector("#signInPoints b") ? [] : ["wrong points"]]);

            // 1.9.2: the tray, the Logs dialog, and what's gone.
            const gone = [".app-footer", ".home-tagline", "#prefWorkspaces", '.nav[data-view="logs"]', "#home .system-bar"].filter(selector => document.querySelector(selector));
            checks.push(["the tagline, footer, Logs tab and old bars are gone", gone]);
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
            sent.clear();
            togglePowerTray(true);
            checks.push(["the power tray opens from any view, and only then reads", !$("powerTray").hidden && sent.has("GetRecycleBin") && sent.has("GetAudioDevices") ? [] : ["not opened or no reading"]]);
            checks.push(["its hold buttons are all there", document.querySelectorAll("#powerTray [data-power-hold]").length === 5 ? [] : ["wrong count"]]);
            togglePowerTray(false);
            navigate("dashboard");
            sent.clear();
            $("openLogsButton").click();
            checks.push(["ASCS Logs opens from System Dashboard and reads", !$("logsDialog").hidden && sent.has("GetLog") ? [] : ["not opened"]]);
            checks.push(["the log list is inside it", $("logsDialog").contains($("logList")) ? [] : ["list elsewhere"]]);
            toggleLogs(false);
            checks.push(["and closes, with polling stopped", $("logsDialog").hidden && logState.timer === null ? [] : ["still open or polling"]]);
            checks.push(["Ctrl numbers end at nine pages", sidebarViews().length === 9 && sidebarViews()[8] === "settings" ? [] : [sidebarViews().join()]]);
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
            const workspaceChips = document.querySelectorAll("#workspaceStrip .ws-chip[data-ws-chip]");
            checks.push(["the strip has each workspace and the launch rules", workspaceChips.length === 4 ? [] : [`${workspaceChips.length} chips`]]);
            checks.push(["the first workspace is open", $("workspaceTitle").textContent === "Default" ? [] : [$("workspaceTitle").textContent]]);
            checks.push(["each desktop has a tab", document.querySelectorAll("#workspaceTabs .ws-tab").length === 2 ? [] : ["wrong tabs"]]);
            const screen = document.querySelector("#workspaceScreens .ws-screen").getBoundingClientRect();
            checks.push(["the canvas has the monitor's real shape", Math.abs(screen.width / screen.height - 2.4571) < 0.02 ? [] : [`${screen.width}x${screen.height}`]]);
            const tooSmall = ["#workspaces .ws-window strong", "#workspaces .ws-window > span", "#workspaces .ws-row small", "#workspaces .ws-tab em", "#workspaces .ws-chip small", "#workspaces .ws-number span", "#workspaces .ws-place"]
                .filter(selector => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize) < 12.5);
            checks.push(["nothing on the page is smaller than 12.5 px", tooSmall]);
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
            document.querySelectorAll("#workspaceStrip .ws-chip[data-ws-chip]")[2].click();
            checks.push(["a workspace opens on the first desktop with windows", document.querySelector('#workspaceTabs [aria-pressed="true"]')?.textContent.startsWith("Desktop 2") ? [] : ["wrong tab"]]);
            const stripChips = document.querySelectorAll("#workspaceStrip .ws-chip[data-ws-chip]");
            stripChips[stripChips.length - 1].click();
            checks.push(["the launch rules take the page", !$("rulesPage").hidden && $("workspacePage").hidden && document.querySelectorAll("#ruleList .ws-rule").length === 1 ? [] : ["not shown"]]);
            checks.push(["and keep a rule's name as text", document.querySelector("#ruleList i:not(.is-pinned):not([style])") ? ["markup ran"] : []]);
            handleWebMessage({ data: { type: "workspaces", monitors: 1, items: [] } });
            document.querySelector("#workspaceStrip .ws-chip-add")?.click();
            checks.push(["the save field opens", document.querySelector("#workspaceStrip .ws-save input") ? [] : ["no field"]]);
            handleWebMessage({ data: { type: "windows", items: [] } });
            checks.push(["and a reply doesn't lose what's typed", document.querySelector("#workspaceStrip .ws-save input") ? [] : ["field rebuilt"]]);

            // The notes from the 1.10.0 pass.
            const twoWindows = { name: "Later", windows: 2, saved: "2026-11-08T10:00:00", desktopNames: ["", ""], aspects: { 1: 2.4571 }, layout: [place(1, "Notepad", "notes", 0, 0, 0.5), place(2, "Edge", "News", 0, 0.5, 0.5)] };
            const oneWindow = { ...twoWindows, windows: 1, layout: [twoWindows.layout[0]] };
            const chipText = () => document.querySelector("#workspaceStrip .ws-chip[data-ws-chip] small")?.textContent || "";
            document.querySelector("#workspaceStrip .ws-save input").value = "typing";
            handleWebMessage({ data: { type: "workspaces", monitors: 1, items: [twoWindows] } });
            checks.push(["with the save field open, the strip shows the count", chipText().startsWith("2 windows") ? [] : [chipText() || "no chip"]]);
            handleWebMessage({ data: { type: "workspaces", monitors: 1, items: [oneWindow] } });
            checks.push(["and updates it after a removal", chipText().startsWith("1 window") ? [] : [chipText() || "no chip"]]);
            checks.push(["while keeping what's typed", document.querySelector("#workspaceStrip .ws-save input")?.value === "typing" ? [] : ["lost"]]);
            document.querySelector("#workspaceStrip .ws-save input")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
            document.querySelector("#workspaceStrip .ws-chip[data-ws-chip]").click();
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

            // 1.11.0: the site badges.
            navigate("games");
            const awardEntry = (type, extra, id, title, when) => ({ AwardedAt: when, Title: title, ConsoleName: "Game Boy", ImageIcon: `/Images/${id}.png`, AwardType: type, AwardData: id, AwardDataExtra: extra });
            handleWebMessage({ data: "RA\nsummary\n" + JSON.stringify({ User: "Player", TotalPoints: 10, Rank: 5, TotalRanked: 100 }) });
            handleWebMessage({ data: "RA\nrecent\n[]" });
            checks.push(["site badges wait for their reply", $("gamesAchievements").querySelector(".ra-awards .settings-note")?.textContent === "Loading…" ? [] : ["no note"]]);
            handleWebMessage({ data: "RA\nawards\n" + JSON.stringify({ HiddenAwardsCount: 1, VisibleUserAwards: [
                awardEntry("Mastery/Completion", 1, 100, "<img src=x onerror=alert(1)>", "2026-01-01T12:00:00+00:00"),
                awardEntry("Game Beaten", 1, 100, "Same game", "2025-01-01T12:00:00+00:00"),
                awardEntry("Game Beaten", 0, 200, "Beaten one", "2024-01-01T12:00:00+00:00"),
                awardEntry("Event", 0, 160, "An event", "2023-01-01T12:00:00+00:00")
            ] }) });
            const awardBox = $("gamesAchievements");
            checks.push(["All shows each game once", awardBox.querySelectorAll(".ra-award").length === 3 ? [] : [`${awardBox.querySelectorAll(".ra-award").length} tiles`]]);
            checks.push(["and the stats count mastered games", [...awardBox.querySelectorAll(".ra-stats small")].some(node => node.textContent === "MASTERED") ? [] : ["not there"]]);
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

            // 1.11.2: the title bar tells the truth.
            navigate("home");
            const chip = () => $("topStatus").dataset.state;
            updateSystemStatus({ cpu: 10, ram: 10, drives: [] });
            checks.push(["the chip starts nominal, with no log button", chip() === "nominal" && $("topStatusLog").hidden ? [] : [chip()]]);
            handleWebMessage({ data: { type: "testBuild" } });
            checks.push(["a test build says so", chip() === "test" && $("topStatusText").textContent.includes("TEST BUILD") ? [] : [chip()]]);
            updateSystemStatus({ cpu: 10, ram: 10, drives: [] });
            checks.push(["and a metrics update doesn't hide that", chip() === "test" ? [] : [chip()]]);
            window.dispatchEvent(new ErrorEvent("error", { message: "<b>boom</b>", filename: "x.js", lineno: 1 }));
            window.dispatchEvent(new ErrorEvent("error", { message: "second", filename: "x.js", lineno: 2 }));
            errors.splice(0);
            checks.push(["a page error shows in the title bar", chip() === "error" && $("topStatusText").textContent.includes("PAGE ERROR +1") ? [] : [$("topStatusText").textContent]]);
            checks.push(["with a way to see it", !$("topStatusLog").hidden && getComputedStyle($("topStatusLog")).display !== "none" ? [] : ["no button"]]);
            checks.push(["and keeps its text as text", $("topStatus").querySelector("b") ? ["markup ran"] : []]);
            updateSystemStatus({ cpu: 95, ram: 10, drives: [] });
            checks.push(["a metrics update doesn't hide it either", chip() === "error" ? [] : [chip()]]);
            $("topStatusLog").click();
            checks.push(["View log opens ASCS Logs", !$("logsDialog").hidden ? [] : ["not open"]]);
            toggleLogs(false);
            checks.push(["and clears the warning", chip() === "test" && $("topStatusLog").hidden ? [] : [chip()]]);
            isTestBuild = false;
            renderTopStatus();
            checks.push(["then the resources show again", chip() === "attention" && $("topStatusText").textContent.includes("CPU 95%") ? [] : [chip()]]);
            updateSystemStatus({ cpu: 10, ram: 10, drives: [] });

            // 1.11.1: per-game notes.
            navigate("games");
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
            checks.push(["with nothing running and nothing played, there's no box", $("gamesNowNotes").hidden ? [] : ["shown"]]);
            live("RetroArch");
            handleWebMessage({ data: { type: "gamesLive", playing: [{ emulator: "retroarch", title: "RetroArch", since: 5 }], apps: {}, controllers: [] } });
            checks.push(["nor at an emulator's menu", $("gamesNowNotes").hidden ? [] : ["shown"]]);

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
            renderGames();
            const libraryArea = $("gamesLibrary").querySelector(".game-notes-text");
            checks.push(["a library game's details show the same notes", libraryArea?.value === nowBox()?.value ? [] : [libraryArea?.value ?? "no box"]]);
            libraryArea.focus();
            libraryArea.setSelectionRange(2, 2);
            renderGames();
            await Promise.resolve();
            const libraryAfter = $("gamesLibrary").querySelector(".game-notes-text");
            checks.push(["a library redraw keeps the focus and cursor", libraryAfter === libraryArea && document.activeElement === libraryAfter && libraryAfter.selectionStart === 2 ? [] : ["lost"]]);
            typeInto(libraryAfter, "from the library");
            live(gameTitle);
            checks.push(["and what's typed there shows in Now playing", nowBox()?.value === "from the library" ? [] : [nowBox()?.value]]);
            libraryAfter.blur();

            gamesState.ra.games.set(100, JSON.stringify({ ID: 100, Title: gameTitle, ConsoleName: "Game Boy", ImageIcon: "/Images/100.png", Achievements: {} }));
            gamesState.ra.openGame = 100;
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
            const saved = JSON.parse(serializeNotes());
            checks.push(["the link is saved with the note", saved.notes.some(note => note.game === gameKey) ? [] : ["not saved"]]);
            navigate("games");
            gamesState.openId = "";
            live(null);
            gamesState.items = [];
            checks.push(["no errors from game notes", errors.splice(0)]);

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
