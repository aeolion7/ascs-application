"use strict";
// Fake data and page states for headless previews (2.0.0). Never loaded by ASCS
// itself, and it holds no real data. preview.ps1 adds it to a temporary copy of
// the page; the scene comes from ?scene=name in the address.
const PreviewScenes = (() => {
    const say = data => handleWebMessage({ data });
    const stamp = "2026-11-08T20:00:00.000Z";
    const note = (id, title, content, extra = {}) => ({ id, title, type: "note", content, pinned: false, created: stamp, updated: stamp, ...extra });

    function baseData() {
        say({ type: "notes", recovered: false, data: JSON.stringify({ version: 2, activeId: "plan", notes: [
            note("plan", "Release plan", "# Release plan\n\nBump the version, then **update the changelog** before the cut. #work\n\n- Run the checks\n- Commit the release\n- Cut it\n\n> Keep the copy restrained.\n\nA longer paragraph to show how far a line of text runs across the editor when the window is wide, because line length decides how easy a paragraph is to read on a large screen.", { pinned: true }),
            note("mus", "Brave Fencer Musashi", "Boss on floor 3 needs the blue key.\n\n### Nov 8, 2026, 3:42 PM\nSaved before the ice cave.", { group: "Game notes", game: "bravefencermusashi" }),
            note("bug", "Bug", "Investigate: {ask:Bug}", { group: "Templates", fill: true }),
            note("code", "Backup script", "robocopy C:\\data D:\\backup /E", { type: "code", group: "Templates" }),
            note("shop", "Groceries", "Milk, eggs #home")
        ] }) });
        say({ type: "metrics", cpu: 23, ram: 47,
            ramUsed: 30, ramTotal: 64,
            drives: [{ letter: "C", online: true, usage: 71, used: 1370, total: 1907 }, { letter: "D", online: true, usage: 93, used: 3460, total: 3726 }, { letter: "E", online: false }],
            hardware: {
                processor: { name: "AMD Ryzen 9 7950X 16-Core Processor", maker: "AMD", cores: 16, threads: 32, clockMHz: 4501, socket: "AM5", l2KB: 16384, l3KB: 65536, architecture: "x64", revision: "Model 97, Stepping 2", virtualization: true },
                graphics: [{ name: "NVIDIA GeForce RTX 4080", maker: "NVIDIA", memoryBytes: 17171480576, vbios: "95.03.1a.00.11", driver: "32.0.15.6614", driverDate: "2026-07-22T00:00:00", width: 3440, height: 1440, refresh: 144, minRefresh: 48, maxRefresh: 144, bits: 32 }],
                memory: { totalBytes: 68719476736, slots: 4, maxBytes: 137438953472, modules: [
                    { sizeBytes: 34359738368, type: "DDR5", form: "DIMM", ratedMHz: 4800, runningMHz: 6000, voltageMV: 1350, bank: "P0 CHANNEL A", slot: "DIMM 1", maker: "G.Skill", part: "F5-6000J3040G32G", widthBits: 64 },
                    { sizeBytes: 34359738368, type: "DDR5", form: "DIMM", ratedMHz: 4800, runningMHz: 6000, voltageMV: 1350, bank: "P0 CHANNEL B", slot: "DIMM 1", maker: "G.Skill", part: "F5-6000J3040G32G", widthBits: 64 }
                ] },
                storage: [
                    { model: "Samsung SSD 990 PRO 2TB", sizeBytes: 2000398934016, bus: "NVMe", media: "Solid state", health: "Healthy", firmware: "4B2QJXD7", logicalSector: 512, physicalSector: 4096, partitions: [
                        { number: 1, sizeBytes: 104857600, kind: "EFI system", letter: "", label: "", fileSystem: "", windows: false },
                        { number: 2, sizeBytes: 16777216, kind: "Microsoft reserved", letter: "", label: "", fileSystem: "", windows: false },
                        { number: 3, sizeBytes: 1999000000000, kind: "Basic data", letter: "C:", label: "Windows", fileSystem: "NTFS", windows: true },
                        { number: 4, sizeBytes: 629145600, kind: "Recovery", letter: "", label: "", fileSystem: "", windows: false }
                    ] },
                    { model: "WD Black SN850X 4TB", sizeBytes: 4000787030016, bus: "NVMe", media: "Solid state", health: "Healthy", firmware: "620361WD", logicalSector: 512, physicalSector: 512, partitions: [
                        { number: 1, sizeBytes: 16777216, kind: "Microsoft reserved", letter: "", label: "", fileSystem: "", windows: false },
                        { number: 2, sizeBytes: 2000000000000, kind: "Basic data", letter: "D:", label: "Games", fileSystem: "NTFS", windows: false },
                        { number: 3, sizeBytes: 2000000000000, kind: "Basic data", letter: "E:", label: "Media", fileSystem: "exFAT", windows: false }
                    ] }
                ],
                device: { maker: "ASUS", model: "ProArt X670E", family: "ProArt", kind: "Desktop", systemType: "x64-based PC", name: "PREVIEW-PC" },
                board: { maker: "ASUSTeK COMPUTER INC.", product: "ProArt X670E-CREATOR WIFI", version: "Rev 1.xx" },
                bios: { maker: "American Megatrends Inc.", version: "2204", date: "2025-06-12T00:00:00", smbios: "3.5", secureBoot: true },
                windows: { edition: "Windows 11 Home", version: "26H2", build: "26300.9711", architecture: "64-bit", installed: "2025-11-11T07:35:43", started: "2026-11-09T07:46:01" },
                displays: [{ name: "Sample Ultrawide", maker: "LG", product: "1234", year: 2025, week: 8, widthCm: 80, heightCm: 34, connection: "DisplayPort" }],
                sound: [
                    { name: "USB Audio Device", maker: "Generic USB Audio", bus: "USB", status: "OK" },
                    { name: "Realtek High Definition Audio", maker: "Realtek", bus: "HD Audio", status: "OK" }
                ],
                network: [
                    { name: "Sample Wi-Fi Adapter", windowsName: "Wi-Fi", kind: "Wi-Fi", driverMaker: "Sample", driver: "3.3.0.908", driverDate: "2023-11-27T00:00:00" },
                    { name: "Realtek PCIe GbE Family Controller", windowsName: "Ethernet", kind: "Ethernet", driverMaker: "Realtek", driver: "10.53.1001.2021", driverDate: "2021-10-01T00:00:00" }
                ]
            } });
        say({ type: "activity", items: [
            { kind: "system", text: "Maestro started", time: stamp }, { kind: "workspace", text: "Saved Default", time: stamp }, { kind: "launch", text: "Windows Terminal", time: stamp }, { kind: "command", text: "Backup script", time: stamp }, { kind: "error", text: "Windows Terminal could not be opened", time: stamp }, { kind: "note", text: "Captured from Vivaldi", time: stamp }
        ] });
        say({ type: "workspaces", monitors: 1, items: [] });
    }

    function systemHistory() {
        const history = Array.from({ length: 90 }, (_, i) => [Math.round(26 + 18 * Math.sin(i / 6) + 9 * Math.sin(i / 1.7)), Math.round(46 + 4 * Math.sin(i / 14))]);
        const now = Math.round(Date.now() / 1000);
        const historyTimes = history.map((_, i) => now - (history.length - i) * 10);
        say({ type: "metrics", cpu: 23, ram: 47, ramUsed: 30, ramTotal: 64, history, historyTimes, drives: [{ letter: "C", online: true, usage: 71, used: 1370, total: 1907 }, { letter: "D", online: true, usage: 93, used: 3460, total: 3726 }, { letter: "E", online: false }] });
    }
    function signInData() {
        const times = [6210, 5300, 4400, 4950, 5188, 4720, 5012, 7450, 4890, 5120, 4630, 5240];
        say({ type: "signInHistory", items: times.map((retrobar, i) => ({ time: `2026-11-${String(times.length - i).padStart(2, "0")}T10:26:04`, retrobar, taskbar: Math.round(retrobar * .48), apps: retrobar + 220, keychron: retrobar + 580, finished: retrobar + 2340 + (i % 4) * 90, sound: i % 3 ? "The Microsoft Sound" : "Windows XP Startup" })) });
    }
    function logData() {
        const lines = ["2026-11-08 10:26:04 | Maestro started", "2026-11-08 10:26:06 | Radicale is listening on 127.0.0.1", "2026-11-08 10:41:19 | RetroAchievements request timed out", "2026-11-08 11:02:44 | Page error: example at app.js:12", "2026-11-08 11:30:02 | Saved notes", "2026-11-07 22:14:10 | Window hidden", "2026-11-07 22:10:51 | Saved a workspace named Default"];
        handleLogMessage(logState.source, "ok", lines.join("\n"));
    }

    const game = (id, title, emulator, system, hours, last, extra = {}) => ({ id, title, emulator, system, seconds: hours * 3600, last, plays: Math.round(hours), launchable: true, installed: true, cover: false, ...extra });
    function gamesData() {
        say({ type: "games", covers: false, items: [
            game("ra:1", "Brave Fencer Musashi (USA)", "retroarch", "Sony - PlayStation", 5.1, "2026-11-08T10:00:00"),
            game("ra:2", "Legend of Zelda, The - Ocarina of Time (USA)", "retroarch", "Nintendo - Nintendo 64", 41, "2026-11-02T10:00:00"),
            game("gc:GM8E01", "Metroid Prime", "dolphin", "GameCube", 63, "2026-10-28T10:00:00"),
            game("gc:R8PP01", "Super Paper Mario", "dolphin", "Wii", 12, "2026-10-12T10:00:00"),
            game("ps2:SLUS-20", "Samurai Warriors 2 - Xtreme Legends", "pcsx2", "PlayStation 2", 88, "2026-11-06T10:00:00"),
            game("ps2:SLUS-21", "Okami", "pcsx2", "PlayStation 2", 34, "2026-09-14T10:00:00"),
            game("st:220", "Half-Life 2", "steam", "", 20, "2026-10-08T10:00:00"),
            game("st:400", "Portal", "steam", "", 1234.98, "2024-12-28T10:00:00"),
            game("st:999", "A game that isn't installed", "steam", "", 0, "", { installed: false })
        ] });
        const raGame = (id, title, achieved, possible, hardcore) => ({ GameID: id, Title: title, ConsoleName: "PlayStation", ImageIcon: `/Images/${id}.png`, NumPossibleAchievements: possible, PossibleScore: possible * 10, NumAchieved: achieved, ScoreAchieved: achieved * 10, NumAchievedHardcore: hardcore, ScoreAchievedHardcore: hardcore * 10 });
        const summary = { User: "Player", TotalPoints: 18420, TotalSoftcorePoints: 310, TotalTruePoints: 52110, Rank: 4210, TotalRanked: 80000, LastGame: { Title: "Brave Fencer Musashi", ConsoleName: "PlayStation" }, LastGameID: 11, RichPresenceMsg: "Exploring the ice cave, level 12", RecentlyPlayed: [], Awarded: {}, RecentAchievements: {} };
        say("RA\nsummary\n" + JSON.stringify(summary));
        say("RA\nrecent\n" + JSON.stringify([raGame(11, "Brave Fencer Musashi", 12, 40, 12)]));
        say("RA\nprogress\n" + JSON.stringify([raGame(11, "Brave Fencer Musashi", 12, 40, 12), raGame(12, "Metroid Prime", 45, 45, 45)]));
        const award = (type, extra, id, title, when) => ({ AwardedAt: when, Title: title, ConsoleName: "PlayStation", ImageIcon: `/Images/${id}.png`, AwardType: type, AwardData: id, AwardDataExtra: extra });
        const earnedAchievement = (id, title, points, date, awarded) => ({ ID: id, Title: title, Description: "Earned along the way.", Points: points, TrueRatio: points * 2, BadgeName: String(id), DisplayOrder: id, NumAwarded: awarded, DateEarned: date, DateEarnedHardcore: date });
        const lockedAchievement = (id, title, points, type, awarded) => ({ ID: id, Title: title, Description: "Reach the next town and open the gate to the ice cave.", Points: points, TrueRatio: points * 2, BadgeName: String(id), DisplayOrder: id, NumAwarded: awarded, type });
        say("RA\ngame:11\n" + JSON.stringify({ ID: 11, Title: "Brave Fencer Musashi", ConsoleName: "PlayStation", ImageIcon: "/Images/11.png", NumDistinctPlayers: 1000, Achievements: {
            1: earnedAchievement(1, "First Steps", 5, "2026-11-08 09:20:00", 800),
            2: earnedAchievement(2, "Hidden Cellar", 25, "2026-11-01 20:15:00", 40),
            3: lockedAchievement(3, "Keeper of the Keys", 10, "progression", 620),
            4: lockedAchievement(4, "One Chance at the Bridge", 25, "missable", 90),
            5: lockedAchievement(5, "Finale", 50, "win_condition", 300)
        } }));
        say("RA\nawards\n" + JSON.stringify({ HiddenAwardsCount: 0, VisibleUserAwards: [
            award("Mastery/Completion", 1, 12, "Metroid Prime", "2026-01-01T12:00:00+00:00"),
            award("Mastery/Completion", 0, 13, "Okami", "2025-11-01T12:00:00+00:00"),
            award("Game Beaten", 1, 14, "Chrono Trigger", "2025-06-01T12:00:00+00:00")
        ] }));
    }
    // Painted stand-ins, for the cover backdrop and the user's picture.
    const painted = (colors, type = "image/png") => {
        const canvas = document.createElement("canvas");
        canvas.width = 96;
        canvas.height = 128;
        const context = canvas.getContext("2d");
        const fill = context.createLinearGradient(0, 0, 96, 128);
        colors.forEach((color, index) => fill.addColorStop(index / (colors.length - 1), color));
        context.fillStyle = fill;
        context.fillRect(0, 0, 96, 128);
        return canvas.toDataURL(type);
    };
    const live = (playing = [{ emulator: "retroarch", title: "RetroArch Beetle PSX HW 0.9.44 || Brave Fencer Musashi (USA) || FPS: 60", since: Date.now() / 1000 - 4325 }]) =>
        say({ type: "gamesLive", playing, apps: {}, controllers: [{ id: "x1", key: "x1", name: "Xbox Wireless Controller", mode: "xinput", connection: "bluetooth", slot: 1, battery: "high" }] });

    function commandsData() {
        baseData();
        navigate("commands");
        say({ type: "settings", drives: ["C:", "J:"], snapGap: 0, preserveSize: true, hotkeys: { notes: "q", everything: "f", dashboard: "i", terminal: "t", explorer: "e", claude: "c", taskmanager: "h" }, claudeShortcut: "Ctrl+Alt+Space", powerDelay: 0, ascsSounds: "show", searchTemplate: "https://duckduckgo.com/?q=%s" });
        say({ type: "commands", items: [
            { id: 1, name: "ASCS repo", kind: "folder", target: "C:\\ASCS", key: "a" },
            { id: 2, name: "Bambu Studio", kind: "app", target: "C:\\Program Files\\Bambu Studio\\bambu-studio.exe", key: "" },
            { id: 3, name: "RetroAchievements", kind: "url", target: "https://retroachievements.org", key: "" }
        ] });
    }

    function workspacesData() {
        const w = (index, app, title, desktop, x, y, width, height, extra = {}) => ({ index, app, title, desktop, monitor: 1, x, y, width, height, maximized: false, pinned: false, enabled: true, missing: false, ...extra });
        say({ type: "workspaces", monitors: 1, items: [
            { name: "Default", windows: 5, saved: "2026-11-08T14:14:00", desktopNames: ["", ""], aspects: { 1: 2.4571 }, layout: [
                w(1, "msedge", "ASCS README - GitHub", 0, 0, 0, 0.3, 1), w(2, "Code", "workspacesview.js - ASCS", 0, 0.3, 0, 0.45, 1),
                w(3, "WindowsTerminal", "pwsh: C:\\ASCS", 0, 0.75, 0, 0.25, 0.55), w(4, "explorer", "C:\\ASCS\\frontend", 0, 0.75, 0.55, 0.25, 0.45),
                w(5, "Discord", "#general", 1, 0, 0, 0.34, 1)] },
            { name: "Coding", windows: 1, saved: "2026-11-07T09:30:00", desktopNames: [""], aspects: { 1: 2.4571 }, layout: [w(1, "Code", "ascs", 0, 0, 0, 1, 1)] }
        ] });
    }

    function rulesData(count = 3) {
        const apps = ["Discord", "Spotify", "Windows Terminal", "Obsidian", "Steam", "Vivaldi", "OBS Studio", "Notepad++"];
        say({ type: "launchRules", items: Array.from({ length: count }, (_, i) => ({
            path: `C:\\Apps\\${i}.exe`, app: apps[i % apps.length], enabled: i % 4 !== 2, monitor: 1,
            x: [0, 0.66, 0.25, 0][i % 4], y: 0, width: [0.34, 0.34, 0.5, 1][i % 4], height: 1, maximized: i % 4 === 3,
            desktop: i % 2, desktopName: "", pinned: i % 5 === 4 })) });
        say({ type: "windows", items: [
            { id: "101", app: "Code", title: "workspacesview.js - ASCS", minimized: false },
            { id: "102", app: "msedge", title: "ASCS README - GitHub", minimized: false },
            { id: "103", app: "WindowsTerminal", title: "pwsh: C:\\ASCS", minimized: false },
            { id: "104", app: "explorer", title: "C:\\ASCS\\frontend", minimized: false }] });
    }

    // A workspace with many windows, and many workspaces.
    function workspacesLong() {
        const w = (index, app, title, desktop, x, y, width, height) => ({ index, app, title, desktop, monitor: 1, x, y, width, height, maximized: false, pinned: index === 14, enabled: index % 7 !== 3, missing: false });
        const layout = Array.from({ length: 14 }, (_, i) => w(i + 1, ["msedge", "Code", "WindowsTerminal", "explorer", "Discord", "Spotify", "Obsidian"][i % 7], `Window ${i + 1}`, i < 12 ? 0 : 1, (i % 4) * 0.25, Math.floor(i / 4) % 3 * 0.33, 0.25, 0.33));
        const names = ["Default", "Coding", "PSO session", "Streaming", "Writing", "Reading", "Recording", "Emulation", "Photo editing", "Taxes", "Research", "3D printing", "Music", "Planning"];
        say({ type: "workspaces", monitors: 1, items: names.map((name, i) => ({ name, windows: i ? 2 : 14, saved: "2026-11-08T14:14:00", desktopNames: ["", ""], aspects: { 1: 2.4571 },
            layout: i ? [w(1, "Code", "ascs", 0, 0, 0, 0.5, 1), w(2, "msedge", "docs", 0, 0.5, 0, 0.5, 1)] : layout })) });
    }

    function soundsData() {
        const sound = (id, name, era, group = "", seconds = 2.1) => ({ id, name, era, group, kind: "web", ext: "wav", size: 200000, seconds });
        say({ type: "soundLibrary", root: "C:\\Sounds", exists: true, changed: true,
            eras: [{ folder: "xp", year: 2001, label: "Windows XP" }, { folder: "7", year: 2009, label: "Windows 7" }, { folder: "11", year: 2021, label: "Windows 11" }],
            sounds: [sound("xp/logon.wav", "Windows XP Logon Sound", "xp", "Startup"), sound("xp/ding.wav", "Windows XP Ding", "xp", "Notifications", 0.6), sound("xp/error.wav", "Windows XP Error", "xp", "Notifications", 0.9), sound("xp/shutdown.wav", "Windows XP Shutdown", "xp", "Startup", 3.2), sound("7/notify.wav", "Windows Notify", "7"), sound("11/chimes.wav", "Chimes", "11", "", 1.4)] });
        say({ type: "windowsSounds", events: [
            { key: "SystemAsterisk", label: "Asterisk", file: "C:\\Sounds\\xp\\ding.wav", exists: true },
            { key: "SystemNotification", label: "System notification", file: "C:\\Sounds\\xp\\error.wav", exists: true },
            { key: "MailBeep", label: "New mail", file: "", exists: false },
            { key: "DeviceConnect", label: "Device connect", file: "C:\\Sounds\\11\\connect.wav", exists: true, changed: true },
            { key: "DeviceDisconnect", label: "Device disconnect", file: "C:\\Sounds\\11\\disconnect.wav", exists: true },
            { key: "EmptyRecycleBin", label: "Empty Recycle Bin", file: "C:\\Sounds\\xp\\recycle.wav", exists: true }
        ] });
        say({ type: "startupSounds", signin: [
            { weight: 89, file: "The Microsoft Sound.wav", id: "a.wav", origin: "a.wav", exists: true, changed: false },
            { weight: 11, file: "The Microsoft Sound (+2.0 dB).wav", id: "b.wav", origin: "b.wav", exists: true, changed: false }
        ], shutdown: { file: "Windows XP Shutdown.wav", id: "d.wav", origin: "d.wav", exists: true, changed: false }, taskWarning: "" });
    }

    const audioSample = { type: "audioDevices", soundSwitch: true, items: [{ name: "Headphones (2- SteelSeries Arctis Nova 5)", label: "Headphones (SteelSeries Arctis Nova 5)", current: true }, { name: "LG ULTRAGEAR (NVIDIA High Definition Audio)", label: "Monitor Speaker (LG ULTRAGEAR)", current: false }] };

    // A list's rows again and again, to see how a page holds up to real amounts.
    function longer(selector, times) {
        const list = document.querySelector(selector);
        const rows = [...(list?.children || [])];
        for (let i = 0; i < times && rows.length; i++) list.append(rows[i % rows.length].cloneNode(true));
    }

    function calendarData(mode) {
        const ics = (uid, summary, start, end, extra = "") => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//x//EN\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:20261101T000000Z\r\nDTSTART:${start}\r\nDTEND:${end}\r\nSUMMARY:${summary}\r\n${extra}END:VEVENT\r\nEND:VCALENDAR\r\n`;
        calState.server = { state: "running", message: "" };
        calState.calendars = [{ id: "personal", name: "Personal", color: "#8B6FF5" }, { id: "work", name: "Work", color: "#C4587B" }];
        calState.loaded = true;
        say({ type: "almanac", latitude: 40.7, longitude: -74, place: "New York", wikipedia: false, countdowns: [{ name: "Release day", date: "2026-11-20" }, { name: "Anniversary", date: "03-14" }] });
        const resources = new Map();
        [["personal", "dentist", "Dentist appointment", "20261109T150000", "20261109T160000"], ["work", "standup", "Weekly review", "20261110T100000", "20261110T110000"],
            ["personal", "dinner", "Dinner with friends", "20261112T190000", "20261112T210000"], ["personal", "visit", "Family visit", "20261120T180000", "20261120T200000"], ["work", "launch", "Release planning for the next version", "20261108T130000", "20261108T150000"]]
            .forEach(([calendar, name, summary, start, end]) => {
                const text = ics(name, summary, start, end);
                resources.set(`${calendar}/${name}`, { calendar, name, etag: "1", text, parsed: Cal.readResource(text), editable: true });
            });
        calState.resources = resources;
        calState.loaded = true;
        calState.mode = mode;
        calState.cursor = new Date(2026, 10, 8).getTime();
    }

    function homeData() {
        gamesData();
        workspacesData();
        calendarData("week");
        calState.server = { state: "running", message: "" };
        say({ type: "almanac", latitude: 40.7, longitude: -74, place: "New York", wikipedia: false, countdowns: [{ name: "Veterans Day", date: "2026-11-11" }] });
        renderHomeToday();
    }
    const homeLive = () => live();

    function showHomeLayout(layout) {
        homeLayout = layout;
        applyHomeLayout();
    }

    const open = (view, setup) => () => { baseData(); navigate(view); setup?.(); };
    const calendar = mode => () => { baseData(); calendarData(mode); navigate("calendar"); calState.server = { state: "running", message: "" }; renderCalendar(); };
    // Layout shift: what's on screen before its data arrives, against after. Any
    // module that moved or changed width is listed in the audit's "shift".
    function shiftBoxes() {
        const boxes = new Map();
        document.querySelectorAll(".view.active .module, .view.active .section-bar, .view.active .sound-library, .view.active .sounds-toolbar").forEach((node, index) => {
            const box = node.getBoundingClientRect();
            if (box.width) boxes.set(node, { name: node.id || `${node.className}#${index}`, left: box.left, top: box.top, width: box.width });
        });
        return boxes;
    }
    const shift = (open, arrive) => () => {
        open();
        const before = shiftBoxes();
        arrive();
        const moved = [];
        before.forEach((was, node) => {
            if (!node.isConnected) return;
            const now = node.getBoundingClientRect();
            if (!now.width) return moved.push(`${was.name}: went away`);
            const changes = [["left", now.left], ["top", now.top], ["width", now.width]]
                .filter(([key, value]) => Math.abs(was[key] - value) > 1)
                .map(([key, value]) => `${key} ${Math.round(was[key])} to ${Math.round(value)}`);
            if (changes.length) moved.push(`${was.name}: ${changes.join(", ")}`);
        });
        window.PreviewShift = moved;
    };

    return {
        "shift-home": shift(() => navigate("home"), () => { baseData(); homeData(); navigate("home"); homeLive(); }),
        "shift-games": shift(() => navigate("games"), () => { baseData(); navigate("games"); gamesData(); live(); }),
        "shift-games-library": shift(() => { navigate("games"); gamesSections.show("library"); }, () => { baseData(); gamesData(); live(); }),
        "shift-games-achievements": shift(() => { navigate("games"); gamesSections.show("achievements"); }, () => { baseData(); gamesData(); live(); }),
        "shift-commands": shift(() => navigate("commands"), () => { commandsData(); }),
        "shift-calendar": shift(() => { calState.mode = "month"; navigate("calendar"); }, () => { calendar("month")(); }),
        "shift-calendar-week": shift(() => { calState.mode = "week"; navigate("calendar"); }, () => { calendar("week")(); }),
        "shift-calendar-agenda": shift(() => { calState.mode = "agenda"; navigate("calendar"); }, () => { calendar("agenda")(); }),
        "shift-system": shift(() => navigate("dashboard"), () => { baseData(); systemHistory(); }),
        "shift-system-startup": shift(() => { navigate("dashboard"); systemSections.show("signin"); }, () => { signInData(); }),
        "shift-system-activity": shift(() => { navigate("dashboard"); systemSections.show("activity"); }, () => { baseData(); logData(); }),
        "shift-notes": shift(() => navigate("notes"), () => { baseData(); navigate("notes"); }),
        "shift-workspaces": shift(() => navigate("workspaces"), () => { baseData(); workspacesData(); }),
        "shift-workspaces-rules": shift(() => { navigate("workspaces"); workspaceSections.show("rules"); }, () => { baseData(); rulesData(); }),
        "shift-sounds": shift(() => navigate("sounds"), () => { baseData(); soundsData(); }),
        "shift-sounds-inuse": shift(() => { navigate("sounds"); soundSections.show("inuse"); }, () => { baseData(); soundsData(); }),
        "shift-sounds-startup": shift(() => { navigate("sounds"); soundSections.show("startup"); }, () => { baseData(); soundsData(); }),
        home: () => { baseData(); homeData(); navigate("home"); homeLive(); },
        "home-full": () => {
            baseData();
            homeData();
            navigate("home");
            live([
                { emulator: "retroarch", title: "RetroArch Beetle PSX HW 0.9.44 || Brave Fencer Musashi (USA) || FPS: 60", since: Date.now() / 1000 - 4325 },
                { emulator: "dolphin", title: "Dolphin 5.0 | Metroid Prime", since: Date.now() / 1000 - 600 }
            ]);
            say({ type: "workspaces", monitors: 1, items: ["Default", "Coding", "PSO session", "Streaming", "Writing", "Reading"].map(name => ({ name, windows: 1, saved: stamp, desktopNames: [""], aspects: { 1: 2.4571 }, layout: [] })) });
            say({ type: "metrics", cpu: 23, ram: 47, ramUsed: 30, ramTotal: 64, drives: ["C", "D", "E", "F"].map((letter, index) => ({ letter, online: true, usage: 40 + index * 15, used: 1000, total: 2000 })) });
        },
        // Module widths (2.0.0): every module one square; then System across the
        // page, with Quick Actions and Arrangements two squares wide. Shown, not
        // stored, so the scenes after these keep the default.
        "home-narrow": () => {
            PreviewScenes["home-full"]();
            showHomeLayout({ ...MaestroHomeLayout.defaults(), widths: Object.fromEntries(MaestroHomeLayout.MODULES.map(module => [module.id, 1])) });
        },
        "home-wide": () => {
            PreviewScenes["home-full"]();
            showHomeLayout({ order: ["now", "today", "next", "system", "stack", "note", "continue"], hidden: ["continue"], widths: { now: 1, today: 1, next: 1, system: 3, stack: 2, note: 1, continue: 2 } });
        },
        "home-arrange-widths": () => {
            PreviewScenes["home-full"]();
            showHomeLayout(MaestroHomeLayout.setWidth(MaestroHomeLayout.defaults(), "today", 2));
            $("arrangeButton").click();
        },
        // The longest a Wikipedia entry gets: it must stay inside its module.
        "home-almanac-long": () => {
            baseData(); homeData(); navigate("home"); homeLive();
            almanacState.history = [{ year: 1989, title: "Berlin_Wall", text: "The Berlin Wall falls: East German authorities announce that citizens may cross the border freely, and crowds gather at the checkpoints, where guards, overwhelmed and without orders, open the gates; over the following days and weeks people chip away at the wall itself, and the event marks the beginning of the end of the division of Germany and of the Cold War in Europe, leading within a year to German reunification and within two years to the dissolution of the Soviet Union." }];
            almanacState.step = 0;
            renderAlmanac();
        },
        "home-idle": () => { baseData(); homeData(); navigate("home"); live([]); },
        "home-empty": open("home"),
        "home-arrange": () => { baseData(); homeData(); navigate("home"); homeLive(); $("arrangeButton").click(); },
        // The added modules, each with sample data.
        "home-added": () => {
            PreviewScenes["home-full"]();
            showHomeLayout({ ...MaestroHomeLayout.defaults(), order: ["weather", "processes", "network", "audio", "controllers", "pinned", "unlocks", "timer", "now", "today", "next", "system", "stack", "continue", "note"], hidden: ["now", "today", "next", "system", "stack", "continue", "note"] });
            say({ type: "weatherSettings", enabled: true });
            handleWeather(JSON.stringify({ current: { temperature_2m: 48.3, apparent_temperature: 44.1, relative_humidity_2m: 61, weather_code: 3, wind_speed_10m: 9.4 }, daily: { time: ["2026-11-09", "2026-11-10", "2026-11-11"], temperature_2m_max: [52, 55, 49], temperature_2m_min: [40, 43, 38], weather_code: [3, 61, 0], precipitation_probability_max: [10, 80, 0] } }));
            say({ type: "homeStats", network: { name: "Wi-Fi", down: 2500000, up: 125000 }, processes: { cpu: [{ name: "vivaldi", value: 12.4 }, { name: "Code", value: 6.1 }, { name: "pcsx2-qt", value: 4.4 }, { name: "Discord", value: 1.2 }], memory: [{ name: "vivaldi", value: 3480 }, { name: "Code", value: 2048 }, { name: "Discord", value: 610 }, { name: "Maestro", value: 240 }] } });
            say(audioSample);
            gamesState.pads = [{ name: "Xbox Wireless Controller", rumble: true, power: "battery-full", connection: "Bluetooth" }, { name: "DualSense", rumble: false, connection: "USB" }];
            renderHomeModules();
        },
        // Mid-drag: Today picked up by its bar and held over System.
        "home-arrange-drag": () => {
            baseData(); homeData(); navigate("home"); homeLive(); $("arrangeButton").click();
            const today = document.querySelector('#homeFace [data-module="today"] .arrange-name').getBoundingClientRect();
            const system = document.querySelector('#homeFace [data-module="system"]').getBoundingClientRect();
            const at = (node, type, x, y) => node.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
            at(document.querySelector('#homeFace [data-module="today"] .arrange-name'), "pointerdown", today.left + 20, today.top + 10);
            at(document, "pointermove", system.left + system.width * 0.7, system.top + 60);
            at(document, "pointermove", system.left + system.width * 0.7, system.top + 60);
        },
        "home-arrange-hidden": () => {
            baseData(); homeData(); navigate("home"); homeLive();
            showHomeLayout(MaestroHomeLayout.setShown(MaestroHomeLayout.setShown(MaestroHomeLayout.defaults(), "note", false), "next", false));
            $("arrangeButton").click();
        },
        "home-today-settings": () => { baseData(); homeData(); navigate("home"); homeLive(); $("todaySettingsButton").click(); },
        "swing-start": () => { baseData(); homeData(); navigate("home"); homeLive(); markHasSwung = false; prepareMark(); },
        "swing-left": open("home", () => document.querySelector(".brand-mark .mark-arm").style.setProperty("animation", "mark-swing 3.4s linear -850ms 1 paused", "important")),
        "swing-right": open("home", () => document.querySelector(".brand-mark .mark-arm").style.setProperty("animation", "mark-swing 3.4s linear -1700ms 1 paused", "important")),
        notes: open("notes"),
        "notes-edit": open("notes", () => $("noteEditButton").click()),
        "notes-code": open("notes", () => openNote(notesData.notes.find(note => note.type === "code")?.id)),
        "notes-long": open("notes", () => { longer("#notesList .note-items", 40); }),
        "notes-markdown": open("notes", () => {
            const note = activeNote();
            note.content = ASCSNotes.MARKDOWN_REFERENCE.map(([label, source]) => `#### ${label}\n\n${source}`).join("\n\n");
            renderActiveNote();
        }),
        "notes-reference": open("notes", () => $("noteMarkdownButton").click()),
        "notes-markdown-lower": () => { PreviewScenes["notes-markdown"](); setTimeout(() => { $("notePreview").scrollTop = $("notePreview").scrollHeight * 0.45; }, 60); },
        "notes-markdown-end": () => { PreviewScenes["notes-markdown"](); setTimeout(() => { $("notePreview").scrollTop = $("notePreview").scrollHeight; }, 60); },
        "notes-empty": () => { say({ type: "notes", recovered: false, data: '{"version":2,"activeId":null,"notes":[]}' }); navigate("notes"); },
        "calendar-month": calendar("month"),
        "calendar-week": calendar("week"),
        "calendar-day": calendar("day"),
        "calendar-agenda": calendar("agenda"),
        "calendar-countdowns": () => { calendar("month")(); setTimeout(openCountdownEditor, 60); },
        "calendar-loading": () => { baseData(); navigate("calendar"); calState.server = { state: "running", message: "" }; renderCalendar(); },
        "calendar-problem": () => { calendar("month")(); calState.server = { state: "stopped", message: "The calendar server isn't running. It stopped three times in a row, so Maestro has stopped restarting it. The log has the details." }; renderCalendar(); },
        "calendar-editor": () => { calendar("week")(); setTimeout(() => openEventEditor({ date: calState.cursor }), 60); },
        workspaces: () => { baseData(); navigate("workspaces"); workspacesData(); },
        "workspaces-empty": open("workspaces"),
        "workspaces-loading": () => navigate("workspaces"),
        "workspaces-long": () => { baseData(); navigate("workspaces"); workspacesLong(); },
        "workspaces-rules": () => { baseData(); navigate("workspaces"); workspacesData(); workspaceSections.show("rules"); rulesData(); },
        "workspaces-rules-long": () => { baseData(); navigate("workspaces"); workspacesData(); workspaceSections.show("rules"); rulesData(24); longer("#ruleWindows", 20); },
        "workspaces-rules-empty": () => { baseData(); navigate("workspaces"); workspaceSections.show("rules"); say({ type: "launchRules", items: [] }); },
        "workspaces-saving": () => { baseData(); navigate("workspaces"); workspacesData(); document.querySelector(".ws-save-open").click(); },
        games: () => { baseData(); navigate("games"); gamesData(); gamesState.covers.set("ra:1", painted(["#e8c04a", "#c23b5a", "#2a7bd6"])); live(); },
        "games-idle": () => { baseData(); navigate("games"); gamesData(); live([]); },
        "games-empty": () => { baseData(); navigate("games"); say({ type: "games", covers: false, items: [] }); live([]); },
        "games-long": () => { baseData(); navigate("games"); gamesData(); live(); },
        "games-library-long": () => { baseData(); navigate("games"); gamesData(); live(); gamesSections.show("library"); setTimeout(() => longer("#gamesLibrary", 200), 60); },
        "games-achievements-long": () => { baseData(); navigate("games"); gamesData(); live(); gamesSections.show("achievements"); setTimeout(() => { longer(".ra-progress", 40); longer(".ra-award-grid", 300); }, 60); },
        "games-achievement-list-long": () => { baseData(); navigate("games"); gamesData(); live(); openRaGame(11); setTimeout(() => longer(".ra-list", 120), 60); },
        "calendar-agenda-long": () => { calendar("agenda")(); setTimeout(() => longer(".cal-agenda", 60), 60); },
        "games-library": () => { baseData(); navigate("games"); gamesData(); live(); gamesSections.show("library"); gamesState.openId = "ra:1"; say({ type: "gameDetails", id: "ra:1", fields: [["Core", "Beetle PSX"], ["File", "Musashi.chd"]], canShow: true, showLabel: "Show file" }); renderGames(); },
        "games-achievements": () => { baseData(); navigate("games"); gamesData(); live(); gamesSections.show("achievements"); handleRaImage("u:Player", painted(["#7b5cf0", "#d9b95f"])); },
        "games-achievement-list": () => { baseData(); navigate("games"); gamesData(); live(); openRaGame(11); },
        "games-controllers": () => { baseData(); navigate("games"); gamesData(); live(); gamesSections.show("controllers"); },
        "games-tester": () => { baseData(); navigate("games"); gamesData(); say({ type: "gamesLive", playing: [], apps: {}, controllers: [{ id: "x1", key: "x1", name: "Xbox Wireless Controller", mode: "xinput", connection: "bluetooth", slot: 1, rumble: true, power: "medium" }, { id: "h2", key: "h2", name: "8BitDo Pro 2", mode: "d-input", connection: "usb", slot: 0, rumble: false, testable: true }] }); gamesSections.show("controllers"); openTester(gamesState.pads[0]); renderControllerInput({ id: "x1", connected: true, kind: "xinput", lx: 12000, ly: -8000, rx: 0, ry: 0, lt: 120, rt: 40, buttons: 4096 }); },
        "sounds-version": () => {
            baseData(); navigate("sounds"); soundsData();
            soundState.levels.set("xp/ding.wav", { rmsDb: -18.2, peakDb: -3.1, lufs: -20.4, levelable: true });
            openSoundEra("xp");
            selectSound("xp/ding.wav");
        },
        "sounds-measured": () => {
            baseData(); navigate("sounds"); soundsData();
            inUseRows().forEach((row, index) => {
                if (row.measurable) soundState.inUse.set(row.key, { file: row.file, lufs: -24 + [0, 3.5, -4.2, 1, -9][index % 5], peakDb: -3, rmsDb: -22, levelable: true });
            });
            soundSections.show("inuse");
        },
        "sounds-library": () => { baseData(); navigate("sounds"); soundsData(); soundSections.show("library"); },
        "sounds-inuse": () => { baseData(); navigate("sounds"); soundsData(); soundSections.show("inuse"); },
        "sounds-startup": () => { baseData(); navigate("sounds"); soundsData(); soundSections.show("startup"); },
        dashboard: open("dashboard", systemHistory),
        "system-drives": open("dashboard", () => { systemHistory(); $("chooseDrives").click(); }),
        "system-hover": open("dashboard", () => {
            systemHistory();
            const box = $("cpuChart").getBoundingClientRect();
            $("cpuChart").dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: box.left + box.width * .6, clientY: box.top + 40 }));
        }),
        "system-hardware": open("dashboard", () => systemSections.show("hardware")),
        "system-signin": open("dashboard", () => { signInData(); systemSections.show("signin"); }),
        "system-activity": open("dashboard", () => { systemSections.show("activity"); logData(); }),
        commands: () => { commandsData(); },
        "commands-free": () => { commandsData(); selectKey("g"); },
        "commands-claude": () => { commandsData(); selectKey("c"); },
        "commands-shift": () => { commandsData(); keymapLayer = "shift"; renderKeymap(); },
        "commands-search": () => { commandsData(); $("commandSearch").value = "workspace"; $("commandSearch").dispatchEvent(new Event("input")); },
        "commands-custom": () => { commandsData(); commandsSections.show("custom"); },
        "commands-palette": () => { commandsData(); commandsSections.show("palette"); },
        "commands-quick": () => { commandsData(); commandsSections.show("quick"); },
        settings: () => { commandsData(); say({ type: "backups", enabled: true, time: "1800", folder: "J:\\Maestro-Backups", running: false, off: false, lastTime: "20261110180004", lastResult: "ok", lastDetail: "4,190 files, 72.8 MB", goodTime: "20261110180004" }); navigate("settings"); },
        "settings-backup-failed": () => { commandsData(); say({ ...{ type: "backups", enabled: true, time: "1800", folder: "J:\\Maestro-Backups", running: false, off: false, lastTime: "20261110180004", lastResult: "ok", lastDetail: "4,190 files, 72.8 MB", goodTime: "20261110180004" }, lastTime: "20261110180004", lastResult: "failed", lastDetail: "Drive J: isn't available.", goodTime: "20261109180003" }); navigate("settings"); },
        "settings-no-backups": () => { commandsData(); say({ type: "backups", enabled: false, time: "1800", folder: "", running: false, off: false, lastTime: "", lastResult: "", lastDetail: "", goodTime: "" }); navigate("settings"); },
        "settings-loading": open("settings"),
        "games-setup": () => {
            baseData(); navigate("games"); gamesData(); live();
            gamesSections.show("setup");
            say({ type: "gameSettings", paths: { retroarch: "C:\\RetroArch\\retroarch.exe", dolphin: "C:\\Dolphin\\Dolphin.exe", pcsx2: "C:\\PCSX2\\pcsx2-qt.exe", pso: "C:\\EphineaPSO\\online.exe", discord: "" },
                headphones: "Headphones (SteelSeries Arctis Nova 5)", soundSwitch: "Ctrl+Alt+F11", covers: true, voiceChannel: "",
                devices: ["Headphones (SteelSeries Arctis Nova 5)", "Monitor Speaker (LG ULTRAGEAR)"], retroAchievements: "ready" });
        },
        palette: open("home", () => openLauncher("all")),
        "calendar-edit-calendar": () => { PreviewScenes["calendar-week"](); openCalendarEditor(calState.calendars[0]); },
        "palette-math": open("home", () => { openLauncher("all"); $("launcherSearch").value = "12.5 x 1.08"; $("launcherSearch").dispatchEvent(new Event("input")); }),
        "power-tray": open("home", () => { togglePowerTray(true); say({ type: "recycleBin", items: 12, bytes: 4000000 }); say(audioSample); }),
        "power-audio": open("home", () => { togglePowerTray(true); say(audioSample); $("audioButton").click(); }),
        "sounds-output": open("sounds", () => { say(audioSample); $("soundOutputButton").click(); }),
        logs: open("dashboard", () => { showLogs(); logData(); }),
        confirm: open("notes", () => confirmDialog({ title: "Delete \"Release plan\"?", message: "This permanently removes the note and its contents.", confirmLabel: "Delete note", danger: true })),
        toast: open("home", () => showNotice("Saved Default: 5 windows across 2 desktops.")),
        help: open("home", () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "F1", bubbles: true, cancelable: true }))),
        "attention": open("home", () => { updateSystemStatus({ cpu: 12, ram: 40, drives: [{ online: true, letter: "J:", usage: 94, used: 3500, total: 3700 }] }); notePageError("Example error in app.js"); toggleAttention(true); }),
        "attention-closed": open("home", () => updateSystemStatus({ cpu: 12, ram: 40, drives: [{ online: true, letter: "J:", usage: 94, used: 3500, total: 3700 }] })),
        "test-build": open("home", () => { isTestBuild = true; renderTopStatus(); }),
        "power-blocked": open("home", () => { togglePowerTray(true); say({ type: "recycleBin", items: 12, bytes: 4000000 }); document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS", key: "s", bubbles: true })); document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyR", key: "r", bubbles: true })); }),
        "sidebar-collapsed": open("home", () => applySidebar(true)),
        // 2.0.0 manual pass.
        "home-arrange-collapsed": () => { applySidebar(true); baseData(); homeData(); navigate("home"); homeLive(); $("arrangeButton").click(); },
        "focus-calendar-edit": () => { calendar("month")(); setTimeout(() => $("calCalendars").querySelector(".link-button")?.focus(), 80); },
        "focus-quick-actions": () => { commandsData(); commandsSections.show("quick"); setTimeout(() => $("quickActionEditor").querySelector(".drag-grip")?.focus(), 60); },
        "notes-trash": open("notes", () => { const made = (id, title, days) => ({ id, title, type: "note", content: "text", pinned: false, created: "2026-11-01T00:00:00.000Z", updated: "2026-11-01T00:00:00.000Z", deletedAt: new Date(Date.now() - days * 86400000).toISOString() }); notesData.trash = [made("x1", "Shopping list", 0), made("x2", "Brave Fencer Musashi, an old walkthrough note with a long title that has to be cut short somewhere", 3), made("x3", "Meeting notes", 29.5)]; renderNotesList(); openNotesTrash(); }),
        "notes-find": open("notes", () => { $("notesFilter").value = "the"; $("notesFilter").dispatchEvent(new Event("input")); $("notesFilter").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); }),
        "notes-find-edit": open("notes", () => { $("noteEditButton").click(); $("notesFilter").value = "the"; $("notesFilter").dispatchEvent(new Event("input")); $("notesFilter").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); }),
        "settings-saved": () => { commandsData(); navigate("settings"); setPageSaveStatus("settingsStatus", savedAtNow()); },
        "system-tip": () => {
            baseData(); navigate("dashboard"); systemHistory();
            const plot = $("cpuChart").getBoundingClientRect();
            $("cpuChart").dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: plot.left + plot.width * 0.4, clientY: plot.top + 20 }));
        }
    };
})();

window.addEventListener("load", () => setTimeout(() => {
    const quiet = document.createElement("style");
    quiet.textContent = "*, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } .view { opacity: 1 !important; }";
    document.head.append(quiet);
    markHasSwung = true;
    prepareMark();
    const name = new URLSearchParams(location.search).get("scene") || "home";
    const textSize = new URLSearchParams(location.search).get("textsize");
    if (textSize) applyTextSize(textSize);
    const errors = [];
    window.addEventListener("error", event => errors.push(event.message));
    try {
        PreviewScenes[name]();
    } catch (error) {
        errors.push(`scene failed: ${error.message}`);
    }
    window.PreviewErrors = errors;
    setTimeout(() => globalThis.PreviewAudit?.(name, errors), 500);
}, 150));
