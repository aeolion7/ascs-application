"use strict";

(function () {
    const G = globalThis.ASCSGames;
    const { check, equal } = globalThis.TestHarness;

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
    equal("now playing: never across emulators", G.matchPlayingGame(library, { emulator: "pcsx2", title: "Brave Fencer Musashi" }), null);
    equal("now playing: unknown game", G.matchPlayingGame(library, { emulator: "dolphin", title: "Dolphin 2512 | JIT64 | Zelda (GZLE01)" }), null);
    equal("now playing: junk input", G.matchPlayingGame(null, null), null);
    equal("clock under an hour", G.formatClock(245), "4:05");
    equal("clock over an hour", G.formatClock(3723), "1:02:03");
    equal("clock rejects junk", G.formatClock(-5), "0:00");
})();
