"use strict";

(function () {
    const G = globalThis.ASCSGames;
    const { check, equal } = globalThis.TestHarness;

    equal("bar: mastered is gold", G.raBarClass(true), "ra-bar is-mastered");
    equal("bar: otherwise plain", G.raBarClass(false), "ra-bar");
    equal("bar: no data is plain", G.raBarClass(undefined), "ra-bar");
    equal("duration hours and minutes", G.formatDuration(41406), "11 h 30 m");
    equal("duration minutes", G.formatDuration(780), "13 m");
    equal("duration whole hours", G.formatDuration(7200), "2 h");
    equal("duration under a minute", G.formatDuration(5), "<1 m");
    equal("duration zero", G.formatDuration(0), "0 m");
    equal("duration rejects junk", G.formatDuration("lots"), "0 m");

    const now = new Date(2026, 10, 3, 12);
    equal("played today", G.formatLastPlayed("2026-11-03T00:10:00", now), "Today");
    equal("played yesterday", G.formatLastPlayed("2026-11-02T23:00:00", now), "Yesterday");
    equal("played days ago", G.formatLastPlayed("2026-10-30T10:00:00", now), "4 days ago");
    equal("played earlier this year", G.formatLastPlayed("2026-08-29T00:35:21", now), "Aug 29");
    equal("played last year", G.formatLastPlayed("2025-12-01T00:00:00", now), "Dec 1, 2025");
    equal("never played", G.formatLastPlayed("", now), "");
    equal("malformed date", G.formatLastPlayed("yesterday", now), "");

    equal("tags dropped for display", G.displayTitle("Super Paper Mario (Europe) (En,Fr,De,Es,It) (Rev 1)"), "Super Paper Mario");
    equal("dump tags dropped", G.displayTitle("Super Mario 64 (U) [!]"), "Super Mario 64");
    equal("inner parentheses kept", G.displayTitle("Ys (Book I & II) Remake (USA)"), "Ys (Book I & II) Remake");
    equal("library-sorted article moves to the front", G.displayTitle("Legend of Zelda, The - Ocarina of Time (USA)"), "The Legend of Zelda - Ocarina of Time");
    equal("trailing article moves to the front", G.displayTitle("Adventures of Lolo, The (USA)"), "The Adventures of Lolo");
    equal("a comma inside a title stays", G.displayTitle("Hello, World (USA)"), "Hello, World");
    equal("a title that is only tags is kept", G.displayTitle("(Prototype)"), "(Prototype)");

    equal("system name without maker", G.systemName("Sony - PlayStation"), "PlayStation");
    equal("system name shortened", G.systemName("Nintendo - Super Nintendo Entertainment System"), "SNES");
    equal("Genesis shortened", G.systemName("Sega - Mega Drive - Genesis"), "Genesis");
    equal("plain system unchanged", G.systemName("PlayStation 2"), "PlayStation 2");

    const games = [
        { id: "ra:1", title: "Brave Fencer Musashi (USA)", emulator: "retroarch", system: "Sony - PlayStation", seconds: 41406, last: "2026-10-07T19:44:50" },
        { id: "gc:R8PP01", title: "Super Paper Mario (Europe)", emulator: "dolphin", system: "Wii", seconds: 82409, last: "2026-06-19T17:30:00" },
        { id: "ps2:SLUS-21115", title: "Okami (USA)", emulator: "pcsx2", system: "PlayStation 2", seconds: 600, last: "2026-11-02T21:00:00" },
        { id: "ra:2", title: "Mario Paint (Japan, USA)", emulator: "retroarch", system: "SNES", seconds: 0, last: "" }
    ];
    equal("recent first", G.sortGames(games).map(g => g.id).join(), "ps2:SLUS-21115,ra:1,gc:R8PP01,ra:2");
    equal("most played first", G.sortGames(games, "time")[0].id, "gc:R8PP01");
    equal("A to Z by display title", G.sortGames(games, "title")[0].id, "ra:1");
    check("sorting does not change the input", games[0].id === "ra:1");
    equal("filter by emulator", G.filterGames(games, "", "retroarch").length, 2);
    equal("filter by text", G.filterGames(games, "paper").length, 1);
    equal("filter by system", G.filterGames(games, "playstation 2").length, 1);
    const totals = G.totalsByEmulator(games);
    equal("totals sorted by time", totals[0].emulator, "dolphin");
    equal("totals count played games", totals.find(t => t.emulator === "retroarch").games, 1);

    equal("Dolphin window title", G.gameFromWindowTitle("dolphin", "Dolphin 2512 | JIT64 DC | D3D12 | HLE | Super Paper Mario (R8PP01)"), "Super Paper Mario");
    equal("Dolphin at its menu", G.gameFromWindowTitle("dolphin", "Dolphin 2512"), "");
    equal("RetroArch window title", G.gameFromWindowTitle("retroarch", "RetroArch Beetle PSX HW 0.9.44 || Brave Fencer Musashi (USA) || FPS: 60"), "Brave Fencer Musashi (USA)");
    equal("RetroArch: a game ASCS added", G.gameFromWindowTitle("retroarch", "RetroArch || Golden Axe (World)"), "Golden Axe (World)");
    equal("RetroArch: FPS isn't a game", G.gameFromWindowTitle("retroarch", "RetroArch X || FPS: 60"), "");
    equal("RetroArch at its menu", G.gameFromWindowTitle("retroarch", "RetroArch"), "");
    equal("PCSX2 window title", G.gameFromWindowTitle("pcsx2", "Okami [SLUS-21115]"), "Okami");
    equal("PCSX2 at its menu", G.gameFromWindowTitle("pcsx2", "PCSX2 v2.4.0"), "");

    const summary = JSON.stringify({
        User: "LionSamurai", TotalPoints: "1234", Rank: 5678, TotalRanked: 90000, RichPresenceMsg: "Exploring\u0007 Hyrule",
        RecentAchievements: {
            "1": {
                "10": { ID: 10, Title: "First Steps", Description: "Start", Points: 5, GameTitle: "Zelda", DateAwarded: "2026-11-01 10:00:00", HardcoreAchieved: 1, BadgeURL: "javascript:alert(1)" },
                "11": { ID: 11, Title: "", Points: 5 }
            },
            "2": { "20": { ID: 20, Title: "Later", Points: "10", GameTitle: "Mario", DateAwarded: "2026-11-02 09:00:00", HardcoreAchieved: 0 } }
        }
    });
    const recent = JSON.stringify([
        { GameID: 1, Title: "Zelda", ConsoleName: "N64", NumAchieved: 12, NumPossibleAchievements: "40", LastPlayed: "2026-11-01 10:05:00", ImageIcon: "/x.png" },
        { Title: 42 }
    ]);
    const ra = G.parseRetroAchievements(summary, recent);
    equal("RA user", ra.user, "LionSamurai");
    equal("RA points from a string", ra.points, 1234);
    equal("RA presence cleaned", ra.presence, "Exploring Hyrule");
    equal("RA achievements without titles dropped", ra.achievements.length, 2);
    equal("RA newest achievement first", ra.achievements[0].title, "Later");
    equal("RA hardcore flag", ra.achievements[1].hardcore, true);
    check("RA never returns URLs", !JSON.stringify(ra).includes("javascript:") && !JSON.stringify(ra).includes("/x.png"));
    equal("RA games keep valid entries", ra.games.length, 1);
    equal("RA progress", `${ra.games[0].achieved}/${ra.games[0].possible}`, "12/40");
    equal("RA progress percent", ra.games[0].percent, 30);
    equal("RA not mastered", ra.games[0].mastered, false);
    const mastered = G.parseRetroAchievements("{}", JSON.stringify([{ Title: "Tetris", NumAchieved: 10, NumAchievedHardcore: 10, NumPossibleAchievements: 10 }]));
    check("RA mastered when every achievement is hardcore", mastered.games[0].mastered && mastered.games[0].completed);
    const last = G.parseRetroAchievements(JSON.stringify({ LastGame: { Title: "Zelda", ConsoleName: "N64" }, TotalSoftcorePoints: "12" }), "[]");
    equal("RA last game", `${last.lastGame} / ${last.lastConsole}`, "Zelda / N64");
    equal("RA softcore points", last.softcore, 12);
    equal("rank percentile", G.rankPercentile(5678, 90000), "Top 7%");
    equal("rank percentile floor", G.rankPercentile(10, 90000), "Top 1%");
    equal("unknown rank", G.rankPercentile(0, 90000), "");
    equal("title keys match across styles", G.titleKey("Legend of Zelda, The - Ocarina of Time (USA)"), G.titleKey("The Legend of Zelda: Ocarina of Time"));
    equal("Steam is a known source", G.EMULATORS.steam, "Steam");
    equal("badge token", G.imageToken("b", "12345"), "b:12345");
    equal("numeric badge token", G.imageToken("b", 678), "b:678");
    equal("icon token", G.imageToken("i", "/Images/012345.png"), "i:012345");
    equal("badge URL rejected", G.imageToken("b", "https://evil.example/x.png"), "");
    equal("icon traversal rejected", G.imageToken("i", "/Images/../../x.png"), "");
    equal("icon with query rejected", G.imageToken("i", "/Images/1.png?x=1"), "");
    equal("badge with suffix rejected", G.imageToken("b", "123_lock"), "");
    equal("user picture token", G.imageToken("u", "/UserPic/Some_Player1.png"), "u:Some_Player1");
    equal("user picture traversal rejected", G.imageToken("u", "/UserPic/../../x.png"), "");
    equal("user picture from elsewhere rejected", G.imageToken("u", "https://evil.example/UserPic/x.png"), "");
    equal("a badge isn't a picture", G.imageToken("u", "/Images/1.png"), "");
    equal("the summary's picture", G.parseRetroAchievements(JSON.stringify({ User: "Any", UserPic: "/UserPic/Any.png" }), "[]").userPicture, "u:Any");
    equal("no picture field: built from the name", G.parseRetroAchievements(JSON.stringify({ User: "Any" }), "[]").userPicture, "u:Any");
    equal("a name that can't be a path gets none", G.parseRetroAchievements(JSON.stringify({ User: "a/../b" }), "[]").userPicture, "");
    const withImages = G.parseRetroAchievements(JSON.stringify({ RecentAchievements: { "1": { "5": { Title: "A", BadgeName: "250336", DateAwarded: "2026-11-01 10:00:00" } } } }),
        JSON.stringify([{ Title: "Zelda", ImageIcon: "/Images/066043.png", NumAchieved: 1, NumPossibleAchievements: 2 }]));
    equal("RA achievement badge token", withImages.achievements[0].badge, "b:250336");
    equal("RA game icon token", withImages.games[0].icon, "i:066043");
    equal("RA tolerates garbage", G.parseRetroAchievements("{nope", "[").games.length, 0);
    equal("RA tolerates an error object", G.parseRetroAchievements('{"message":"Unauthenticated."}', '{"message":"x"}').user, "");

    // Now playing
    const library = [
        { id: "ra:1", emulator: "retroarch", title: "Brave Fencer Musashi (USA)", last: "2026-10-01T10:00:00", seconds: 10 },
        { id: "ra:2", emulator: "retroarch", title: "Brave Fencer Musashi (Japan)", last: "2026-11-01T10:00:00", seconds: 20 },
        { id: "do:1", emulator: "dolphin", title: "Super Paper Mario (Europe) (En,Fr,De,Es,It)", last: "", seconds: 0 },
        { id: "st:220", emulator: "steam", title: "Half-Life 2", last: "", seconds: 0 },
        { id: "pso", emulator: "pso", title: "Phantasy Star Online: Blue Burst", last: "", seconds: 0 }
    ];
    equal("now playing: RetroArch by title, most recent copy", G.matchPlayingGame(library, { emulator: "retroarch", title: "RetroArch Beetle PSX HW 0.9.44 || Brave Fencer Musashi (USA) || FPS: 60" })?.id, "ra:2");
    equal("now playing: Dolphin across region tags", G.matchPlayingGame(library, { emulator: "dolphin", title: "Dolphin 2512 | JIT64 DC | D3D12 | HLE | Super Paper Mario (R8PP01)" })?.id, "do:1");
    equal("now playing: Steam by id", G.matchPlayingGame(library, { emulator: "steam", title: "Half-Life 2", id: "st:220" })?.id, "st:220");
    equal("now playing: PSO", G.matchPlayingGame(library, { emulator: "pso", title: "x" })?.id, "pso");
    equal("now playing: an emulator at its menu matches nothing", G.matchPlayingGame(library, { emulator: "retroarch", title: "RetroArch" }), null);
    // Game notes (1.11.1). These keys are saved in notes, so they must not change.
    equal("note key: pinned", G.gameNoteKey("Legend of Zelda, The - Ocarina of Time (USA)"), "legendofzeldaocarinaoftime");
    equal("note key: pinned with digits and accents", G.gameNoteKey("Pokémon Red 2 [T+Eng]"), "pokémonred2");
    equal("note key: regions share a note", G.gameNoteKey("Super Paper Mario (USA)"), G.gameNoteKey("Super Paper Mario (Europe)"));
    equal("note key: nothing usable", G.gameNoteKey("!!!"), "");
    equal("note key: capped at 160 characters", [...G.gameNoteKey("ゼ".repeat(180))].length, 160);
    check("note key: a long title never splits a character", /^[\p{L}\p{N}]+$/u.test(G.gameNoteKey("😀a".repeat(5) + "𝒜".repeat(180))));
    equal("playing title: the library's when matched", G.playingTitle(library, { emulator: "steam", title: "Other", id: "st:220" }), library.find(game => game.id === "st:220").title);
    equal("playing title: the window's when not", G.playingTitle([], { emulator: "steam", title: "Half-Life 2" }), "Half-Life 2");
    equal("playing title: from an emulator's window", G.playingTitle([], { emulator: "dolphin", title: "Dolphin 2512 | JIT64 DC | D3D12 | HLE | Super Paper Mario (R8PP01)" }), "Super Paper Mario");
    equal("playing title: at the menu, none", G.playingTitle([], { emulator: "retroarch", title: "RetroArch" }), "");
    equal("playing title: nothing given", G.playingTitle([], null), "");
    const runningGames = [{ emulator: "steam", title: "Half-Life 2", since: 100 }, { emulator: "steam", title: "Portal", since: 200 }];
    equal("session: the matching game's start", G.sessionSince([], runningGames, G.gameNoteKey("Portal")), 200);
    equal("session: not running", G.sessionSince([], runningGames, G.gameNoteKey("Doom")), 0);
    equal("session: no key", G.sessionSince([], runningGames, ""), 0);
    const stampNow = new Date(2026, 10, 8, 15, 42);
    equal("stamp: the date alone when not running", G.sessionStamp(stampNow, 0), "Nov 8, 2026, 3:42 PM");
    equal("stamp: with the session", G.sessionStamp(stampNow, stampNow.getTime() / 1000 - 3725), "Nov 8, 2026, 3:42 PM · 1:02:05 into this session");

    equal("now playing: never across emulators", G.matchPlayingGame(library, { emulator: "pcsx2", title: "Brave Fencer Musashi" }), null);
    equal("now playing: unknown game", G.matchPlayingGame(library, { emulator: "dolphin", title: "Dolphin 2512 | JIT64 | Zelda (GZLE01)" }), null);
    equal("now playing: junk input", G.matchPlayingGame(null, null), null);
    equal("clock under an hour", G.formatClock(245), "4:05");
    equal("clock over an hour", G.formatClock(3723), "1:02:03");
    equal("clock rejects junk", G.formatClock(-5), "0:00");

    // 1.9.0: the achievement browser
    const gameJson = JSON.stringify({
        ID: 14402, Title: "Super Mario Galaxy", ConsoleName: "Wii", ImageIcon: "/Images/012345.png", HighestAwardKind: "beaten-hardcore",
        NumDistinctPlayers: 200,
        Achievements: {
            "3": { ID: 3, Title: "Boss", Description: "Beat Bowser", Points: 25, TrueRatio: 60, BadgeName: "333", DisplayOrder: 3, type: "win_condition", NumAwarded: 50 },
            "1": { ID: 1, Title: "Star", Description: "First star", Points: 5, TrueRatio: 5, BadgeName: "111", DisplayOrder: 1, type: "progression", NumAwarded: 180, DateEarned: "2026-10-01 20:15:00", DateEarnedHardcore: "2026-10-01 20:15:00" },
            "2": { ID: 2, Title: "Hidden coin", Description: "Before the door closes", Points: 10, TrueRatio: 40, BadgeName: "222", DisplayOrder: 2, type: "missable", NumAwarded: 20 },
            "4": { ID: 4, Title: "<img src=x onerror=alert(1)>", Points: "lots", BadgeName: "../../evil", DisplayOrder: 4, type: "weird", DateEarned: "yesterday" },
            "5": "not an achievement"
        }
    });
    const raGame = G.parseRaGame(gameJson);
    equal("ra game: parsed", raGame.title + " " + raGame.console + " " + raGame.icon, "Super Mario Galaxy Wii i:012345");
    equal("ra game: in the game's order", raGame.achievements.map(a => a.id).join(), "1,2,3,4");
    equal("ra game: counts", `${raGame.earned}/${raGame.achievements.length}, ${raGame.pointsEarned}/${raGame.points} points`, "1/4, 5/40 points");
    const hostile = raGame.achievements[3];
    equal("ra game: hostile title kept as text", hostile.title, "<img src=x onerror=alert(1)>");
    equal("ra game: bad points are 0", hostile.points, 0);
    equal("ra game: a badge that isn't a number is dropped", hostile.badge, "");
    equal("ra game: an unknown type is none", hostile.type, "");
    equal("ra game: a date that isn't a date is dropped", hostile.earned, "");
    equal("ra game: rarity", Math.round(raGame.achievements[1].rarity), 10);
    equal("ra game: not JSON", G.parseRaGame("<html>"), null);
    equal("ra game: an array", G.parseRaGame("[]"), null);
    equal("ra filter: locked", G.filterRaAchievements(raGame.achievements, "locked").map(a => a.id).join(), "2,3,4");
    equal("ra filter: earned", G.filterRaAchievements(raGame.achievements, "earned").map(a => a.id).join(), "1");
    equal("ra filter: missable", G.filterRaAchievements(raGame.achievements, "missable").map(a => a.id).join(), "2");
    equal("ra filter: progression includes the win", G.filterRaAchievements(raGame.achievements, "progression").map(a => a.id).join(), "1,3");
    equal("ra sort: points", G.filterRaAchievements(raGame.achievements, "all", "points").map(a => a.id).join(), "3,2,1,4");
    equal("ra sort: rarest", G.filterRaAchievements(raGame.achievements, "all", "rarest").map(a => a.id).join(), "2,3,1,4");
    {
        const list = [
            { id: 1, order: 1, earned: "", earnedHardcore: "" },
            { id: 2, order: 2, earned: "2026-03-01 10:00:00", earnedHardcore: "" },
            { id: 3, order: 3, earned: "", earnedHardcore: "" },
            { id: 4, order: 4, earned: "2026-01-01 09:00:00", earnedHardcore: "2026-05-02 08:00:00" },
            { id: 5, order: 5, earned: "2026-03-01T10:00:00", earnedHardcore: "" }
        ];
        equal("ra sort: unlocked first, newest first, then locked in game order",
            G.filterRaAchievements(list, "all", "unlocked").map(a => a.id).join(), "4,2,5,1,3");
        equal("ra sort: unlocked first keeps the filter",
            G.filterRaAchievements(list, "locked", "unlocked").map(a => a.id).join(), "1,3");
    }
    equal("ra counts", JSON.stringify(G.raCounts(raGame.achievements)), JSON.stringify({ all: 4, locked: 3, earned: 1, missable: 1, progression: 2 }));
    const next = G.nextUp(raGame);
    equal("next up: the next progression or win", next.achievement.title, "Boss");
    equal("next up: missable still locked", next.missableLeft, 1);
    equal("next up: none when all are unlocked", G.nextUp({ achievements: [{ earned: "2026-01-01 10:00" }] }), null);
    const highlights = G.raHighlights({ achievements: [
        { title: "Old", earned: "2026-01-01 10:00:00", earnedHardcore: "", rarity: 4 },
        { title: "New", earned: "2026-01-01 10:00:00", earnedHardcore: "2026-03-01 10:00:00", rarity: 40 },
        { title: "Unrated", earned: "2026-02-01 10:00:00", earnedHardcore: "", rarity: null },
        { title: "Locked", earned: "", earnedHardcore: "", rarity: 1 }
    ] });
    equal("highlights: the latest unlock", highlights.latest.title, "New");
    equal("highlights: the rarest unlock, skipping locked and unrated", highlights.rarest.title, "Old");
    equal("highlights: none earned", G.raHighlights({ achievements: [{ title: "Locked", earned: "", earnedHardcore: "", rarity: 1 }] }).latest, null);
    const unlocks = G.parseRaUnlocks(JSON.stringify([
        { Date: "2026-11-01 10:00:00", HardcoreMode: 1, Title: "Older", BadgeName: "1", Points: 5, GameTitle: "A", GameID: 7, Type: "missable" },
        { Date: "2026-11-03 09:00:00", HardcoreMode: 0, Title: "Newer", BadgeName: "2", Points: 10, GameTitle: "B", GameID: 8 },
        { Date: "soon", Title: "No date" }, 42
    ]));
    equal("unlocks: newest first, undated dropped", unlocks.map(u => u.title).join(), "Newer,Older");
    equal("unlocks: hardcore and game", `${unlocks[1].hardcore} ${unlocks[1].gameId} ${unlocks[1].type}`, "true 7 missable");
    equal("unlocks: not a list", G.parseRaUnlocks("{}").length, 0);
    // 2.3.0: RetroAchievements' times are UTC, shown in a time zone.
    equal("ra time: read as UTC", G.parseRaTime("2026-11-02 01:15:00").toISOString(), "2026-11-02T01:15:00.000Z");
    equal("ra time: malformed", G.parseRaTime("yesterday"), null);
    equal("ra time: in New York it's the evening before", G.formatRaTime("2026-11-02 01:15:00", "America/New_York"), "Nov 1, 2026, 8:15 PM");
    equal("ra time: in UTC itself", G.formatRaTime("2026-11-02 01:15:00", "UTC"), "Nov 2, 2026, 1:15 AM");
    equal("ra time: summer time is kept", G.formatRaTime("2026-07-04 16:00:00", "America/New_York"), "Jul 4, 2026, 12:00 PM");
    equal("ra time: Tokyo", G.formatRaTime("2026-11-02 01:15:00", "Asia/Tokyo"), "Nov 2, 2026, 10:15 AM");
    equal("zones: a real one", G.cleanZone("America/Argentina/Buenos_Aires"), "America/Argentina/Buenos_Aires");
    equal("zones: one Intl doesn't know", G.cleanZone("Mars/Olympus_Mons"), "");
    equal("zones: not a zone", G.cleanZone("../../etc"), "");
    equal("zones: nothing", G.cleanZone(undefined), "");
    const evening = new Date(Date.UTC(2026, 10, 13, 3, 0));     // Nov 12, 10 PM in New York
    equal("recent: today, in the zone's day", G.raWhen("2026-11-13 01:30:00", "America/New_York", evening), "Today, 8:30 PM");
    equal("recent: yesterday", G.raWhen("2026-11-11 23:00:00", "America/New_York", evening), "Yesterday, 6:00 PM");
    equal("recent: this week", G.raWhen("2026-11-09 18:00:00", "America/New_York", evening), "Mon, 1:00 PM");
    equal("recent: earlier this year", G.raWhen("2026-10-01 18:00:00", "America/New_York", evening), "Oct 1, 2:00 PM");
    equal("recent: another year", G.raWhen("2025-10-01 18:00:00", "America/New_York", evening), "Oct 1, 2025, 2:00 PM");
    const summaryIds = G.parseRetroAchievements(JSON.stringify({ User: "x", LastGameID: 14402 }), JSON.stringify([{ Title: "Galaxy", GameID: 14402 }]));
    equal("ra: the last game's ID", summaryIds.lastGameId, 14402);
    equal("ra: a recent game's ID", summaryIds.games[0].id, 14402);
    // 1.11.0: site badges, in the shape API_GetUserAwards really sends.
    const award = (type, extra, id, title, when, more = {}) => ({ AwardedAt: when, Title: title, ConsoleID: 4, ConsoleName: "Game Boy", Flags: null, ImageIcon: `/Images/${String(id).padStart(6, "0")}.png`, display_award_tier: null, AwardType: type, AwardData: id, AwardDataExtra: extra, DisplayOrder: 0, ...more });
    const awardsRaw = JSON.stringify({
        TotalAwardsCount: 7, HiddenAwardsCount: 2,
        VisibleUserAwards: [
            award("Game Beaten", 1, 10, "Both", "2020-01-01T12:00:00+00:00"),
            award("Mastery/Completion", 1, 10, "Both", "2021-06-15T16:00:00+00:00"),
            award("Mastery/Completion", 0, 20, "Done", "2022-01-01T12:00:00+00:00"),
            award("Game Beaten", 0, 30, "Soft", "2019-01-01T12:00:00+00:00"),
            award("Game Beaten", 0, 40, "Twice", "2018-01-01T12:00:00+00:00"),
            award("Game Beaten", 1, 40, "Twice", "2018-02-01T12:00:00+00:00"),
            award("Event", 0, 160, "Launch Event", "2024-11-16T02:01:32+00:00", { ConsoleName: "Events" }),
            award("Certified Legend", 0, 1, null, "2023-01-01T12:00:00+00:00", { ImageIcon: null, ConsoleName: null }),
            "junk", null, { Title: "", AwardType: "Mastery/Completion" }
        ]
    });
    const awards = G.parseRaAwards(awardsRaw);
    equal("awards: junk and untitled are dropped", awards.awards.length, 8);
    equal("awards: newest first", awards.awards[0].title, "Launch Event");
    equal("awards: hardcore mastery is mastered", awards.awards.find(a => a.time === Date.parse("2021-06-15T16:00:00+00:00")).kind, "mastered");
    equal("awards: softcore mastery is completed", awards.awards.find(a => a.title === "Done").kind, "completed");
    equal("awards: beaten keeps its mode", awards.awards.find(a => a.title === "Soft").kind, "beaten-softcore");
    equal("awards: counts", JSON.stringify(awards.counts), JSON.stringify({ all: 6, mastered: 1, completed: 1, beaten: 3, event: 1, community: 1 }));
    equal("awards: hidden are counted", awards.hidden, 2);
    equal("awards: All has each game once, at its highest", G.awardsInTab(awards, "all").filter(a => a.gameId === 10).map(a => a.kind).join(), "mastered");
    equal("awards: Beaten has a game once, its best mode", G.awardsInTab(awards, "beaten").filter(a => a.gameId === 40).map(a => a.kind).join(), "beaten-hardcore");
    equal("awards: a mastered game still counts as beaten", G.awardsInTab(awards, "beaten").some(a => a.gameId === 10), true);
    equal("awards: a game opens by its ID", awards.awards.find(a => a.title === "Done").gameId, 20);
    equal("awards: an event's number isn't a game", awards.awards.find(a => a.title === "Launch Event").gameId, 0);
    equal("awards: an event has art", awards.awards.find(a => a.title === "Launch Event").icon, "i:000160");
    equal("awards: a community award is named by its type", awards.awards.find(a => a.kind === "community").title, "Certified Legend");
    equal("awards: a community award has no art", awards.awards.find(a => a.kind === "community").icon, "");
    equal("awards: an address is never taken as art", G.parseRaAwards(JSON.stringify({ VisibleUserAwards: [award("Event", 0, 1, "x", "", { ImageIcon: "https://evil.example/a.png" })] })).awards[0].icon, "");
    equal("awards: a hostile title stays text", G.parseRaAwards(JSON.stringify({ VisibleUserAwards: [award("Event", 0, 1, "<b>x</b>", "")] })).awards[0].title, "<b>x</b>");
    equal("awards: text says when", G.awardText(awards.awards.find(a => a.title === "Done")), "Completed on Jan 1, 2022");
    equal("awards: text with no date", G.awardText({ kind: "mastered", time: 0 }), "Mastered");
    equal("awards: a bad date sorts last", G.parseRaAwards(JSON.stringify({ VisibleUserAwards: [award("Event", 0, 1, "Bad", "soon"), award("Event", 0, 2, "Good", "2020-01-01T00:00:00+00:00")] })).awards[0].title, "Good");
    equal("awards: not JSON", G.parseRaAwards("<html>").counts.all, 0);
    equal("awards: nothing", G.parseRaAwards("").awards.length, 0);
    equal("awards: not a list", G.parseRaAwards('{"VisibleUserAwards":"x"}').awards.length, 0);
    equal("awards: a tab of nothing", G.awardsInTab(null, "all").length, 0);
})();
