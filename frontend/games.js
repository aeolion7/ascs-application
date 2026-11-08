"use strict";

// Pure logic for the Games tab: formatting, sorting, totals, the game shown
// in an emulator's window title, and defensive parsing of RetroAchievements
// responses (text and numbers only; no URLs or images are taken from them).
(function (global) {
    const EMULATORS = {
        retroarch: "RetroArch",
        dolphin: "Dolphin",
        pcsx2: "PCSX2",
        steam: "Steam",
        pso: "PSO"
    };

    const clean = (value, max) => (typeof value === "string" ? value : "")
        .replace(/[\u0000-\u001f\u007f-\u009f\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, " ")
        .replace(/\s{2,}/g, " ").trim().slice(0, max);
    const count = value => {
        const number = typeof value === "string" ? Number(value) : value;
        return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
    };

    function formatDuration(seconds) {
        const total = count(seconds);
        if (total < 60) return total ? "<1 m" : "0 m";
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        if (!hours) return `${minutes} m`;
        return minutes ? `${hours} h ${minutes} m` : `${hours} h`;
    }

    // "YYYY-MM-DDTHH:MM:SS" (local time) to a Date; null if malformed.
    function parseLocal(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2}))?$/.exec(typeof iso === "string" ? iso : "");
        if (!m) return null;
        const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatLastPlayed(iso, now = new Date()) {
        const date = parseLocal(iso);
        if (!date) return "";
        const day = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const days = Math.round((day(now) - day(date)) / 86400000);
        if (days <= 0) return "Today";
        if (days === 1) return "Yesterday";
        if (days < 7) return `${days} days ago`;
        return date.toLocaleDateString("en-US", {
            month: "short", day: "numeric",
            ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {})
        });
    }

    // Drops region, language, revision and dump tags for display:
    // "Super Paper Mario (Europe) (En,Fr,De,Es,It) (Rev 1)" -> "Super Paper Mario".
    function displayTitle(title) {
        const text = clean(title, 200);
        let trimmed = text.replace(/(\s*(\([^()]*\)|\[[^\]]*\]))+\s*$/, "").trim() || text;
        // Library-sorted names read naturally: "Legend of Zelda, The - Ocarina
        // of Time" -> "The Legend of Zelda - Ocarina of Time".
        trimmed = trimmed.replace(/^(.+?), (The|A|An)(?=$| - |: )/, "$2 $1");
        return trimmed;
    }

    // RetroArch's database names, shortened: "Sony - PlayStation" ->
    // "PlayStation", "Nintendo - Super Nintendo Entertainment System" -> "SNES".
    const SYSTEM_NAMES = {
        "Super Nintendo Entertainment System": "SNES",
        "Nintendo Entertainment System": "NES",
        "Mega Drive - Genesis": "Genesis",
        "Game Boy Advance": "GBA",
        "Game Boy Color": "GBC"
    };
    function systemName(system) {
        const text = clean(system, 120).replace(/^(Nintendo|Sony|Sega|SNK|NEC|Atari|Microsoft|Bandai|Coleco|Mattel|Philips|Panasonic) - /, "");
        return SYSTEM_NAMES[text] || text;
    }

    function sortGames(games, mode = "recent") {
        const list = [...games];
        const time = game => parseLocal(game.last)?.getTime() ?? 0;
        if (mode === "time") list.sort((a, b) => b.seconds - a.seconds || time(b) - time(a));
        else if (mode === "title") list.sort((a, b) => displayTitle(a.title).localeCompare(displayTitle(b.title)));
        else list.sort((a, b) => time(b) - time(a) || b.seconds - a.seconds);
        return list;
    }

    function filterGames(games, query = "", emulator = "all") {
        const needle = query.trim().toLocaleLowerCase();
        return games.filter(game =>
            (emulator === "all" || game.emulator === emulator)
            && (!needle || `${game.title} ${game.system} ${EMULATORS[game.emulator] || ""}`.toLocaleLowerCase().includes(needle)));
    }

    function totalsByEmulator(games) {
        const totals = {};
        games.forEach(game => {
            const entry = totals[game.emulator] ||= { emulator: game.emulator, seconds: 0, games: 0 };
            entry.seconds += count(game.seconds);
            if (game.seconds > 0) entry.games++;
        });
        return Object.values(totals).sort((a, b) => b.seconds - a.seconds);
    }

    // The game an emulator is running, from its main window title; "" when
    // it is sitting at its menu.
    function gameFromWindowTitle(emulator, title) {
        const text = clean(title, 200);
        if (!text) return "";
        if (emulator === "dolphin") {
            const parts = text.split(" | ");
            if (parts.length < 2) return "";
            return parts[parts.length - 1].replace(/\s*\([A-Z0-9]{6}\)\s*$/, "").trim();
        }
        if (emulator === "retroarch") {
            const parts = text.split("||").map(part => part.trim()).filter(Boolean);
            return parts.length >= 2 && !/^retroarch/i.test(parts[1]) ? parts[1] : "";
        }
        if (emulator === "pcsx2") return /^pcsx2\b/i.test(text) ? "" : text.replace(/\s+\[[^\]]*\]$/, "");
        return text;
    }

    function parseJson(raw) {
        if (typeof raw !== "string" || raw.length > 2000000) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    // RetroAchievements images are referred to by token only ("b:12345" for a
    // badge, "i:012345" for a game icon). Anything that isn't a plain badge
    // number or a "/Images/<digits>.png" path is ignored, so no address is
    // ever taken from a response; ASCS builds it from the token.
    function imageToken(kind, value) {
        const text = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
        if (kind === "b" && /^\d{1,8}$/.test(text)) return `b:${text}`;
        const match = /^\/Images\/(\d{1,8})\.png$/.exec(text);
        if (kind === "i" && match) return `i:${match[1]}`;
        return "";
    }

    // RetroAchievements: API_GetUserSummary and API_GetUserRecentlyPlayedGames.
    function parseRetroAchievements(summaryRaw, recentRaw) {
        const result = {
            user: "", points: 0, softcore: 0, truePoints: 0, rank: 0, ranked: 0, presence: "",
            lastGame: "", lastConsole: "", lastGameId: 0, games: [], achievements: []
        };
        const summary = parseJson(summaryRaw);
        if (summary && typeof summary === "object" && !Array.isArray(summary)) {
            result.user = clean(summary.User, 40);
            result.points = count(summary.TotalPoints);
            result.softcore = count(summary.TotalSoftcorePoints);
            result.truePoints = count(summary.TotalTruePoints);
            result.rank = count(summary.Rank);
            result.ranked = count(summary.TotalRanked);
            result.presence = clean(summary.RichPresenceMsg, 160);
            result.lastGameId = count(summary.LastGameID);
            if (summary.LastGame && typeof summary.LastGame === "object") {
                result.lastGame = clean(summary.LastGame.Title, 120);
                result.lastConsole = clean(summary.LastGame.ConsoleName, 60);
            }
            const recent = summary.RecentAchievements;
            if (recent && typeof recent === "object") {
                Object.values(recent).slice(0, 20).forEach(game => {
                    if (!game || typeof game !== "object") return;
                    Object.values(game).slice(0, 50).forEach(item => {
                        if (!item || typeof item !== "object") return;
                        const title = clean(item.Title, 120);
                        if (!title) return;
                        result.achievements.push({
                            title,
                            badge: imageToken("b", item.BadgeName),
                            description: clean(item.Description, 200),
                            game: clean(item.GameTitle, 120),
                            gameId: count(item.GameID),
                            points: count(item.Points),
                            date: clean(item.DateAwarded, 19),
                            hardcore: item.HardcoreAchieved === 1 || item.HardcoreAchieved === "1" || item.HardcoreAchieved === true
                        });
                    });
                });
            }
            result.achievements.sort((a, b) => b.date.localeCompare(a.date));
            result.achievements = result.achievements.slice(0, 8);
        }
        const recent = parseJson(recentRaw);
        if (Array.isArray(recent)) {
            result.games = recent.slice(0, 12).map(game => ({
                title: clean(game?.Title, 120),
                id: count(game?.GameID),
                console: clean(game?.ConsoleName, 60),
                achieved: count(game?.NumAchieved),
                icon: imageToken("i", game?.ImageIcon),
                hardcore: count(game?.NumAchievedHardcore),
                possible: count(game?.NumPossibleAchievements),
                last: clean(game?.LastPlayed, 19)
            })).filter(game => game.title).map(game => ({
                ...game,
                percent: game.possible ? Math.min(100, Math.round(game.achieved / game.possible * 100)) : 0,
                mastered: game.possible > 0 && game.hardcore >= game.possible,
                completed: game.possible > 0 && game.achieved >= game.possible
            }));
        }
        return result;
    }

    // ---- the achievement browser (1.9.0)
    const RA_TYPES = new Set(["progression", "win_condition", "missable"]);
    const raDate = value => {
        const text = clean(value, 19);
        return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(text) ? text : "";
    };

    // One game with the user's progress (API_GetGameInfoAndUserProgress).
    // Every value is checked; anything unexpected is left out.
    function parseRaGame(raw) {
        const data = parseJson(raw);
        if (!data || typeof data !== "object" || Array.isArray(data)) return null;
        const players = count(data.NumDistinctPlayers) || count(data.NumDistinctPlayersCasual) + count(data.NumDistinctPlayersHardcore);
        const source = data.Achievements && typeof data.Achievements === "object" ? Object.values(data.Achievements).slice(0, 2000) : [];
        const achievements = source.filter(item => item && typeof item === "object").map(item => {
            const awarded = count(item.NumAwarded);
            return {
                id: count(item.ID), title: clean(item.Title, 120), description: clean(item.Description, 300),
                points: count(item.Points), truePoints: count(item.TrueRatio), badge: imageToken("b", item.BadgeName),
                order: count(item.DisplayOrder), type: RA_TYPES.has(item.type) ? item.type : "",
                earned: raDate(item.DateEarned), earnedHardcore: raDate(item.DateEarnedHardcore),
                rarity: players && item.NumAwarded !== undefined && item.NumAwarded !== null && item.NumAwarded !== "" ? Math.min(100, awarded / players * 100) : null
            };
        }).filter(item => item.title && item.id)
            .sort((a, b) => a.order - b.order || a.id - b.id);
        const earned = achievements.filter(item => item.earned || item.earnedHardcore);
        return {
            id: count(data.ID), title: clean(data.Title, 120), console: clean(data.ConsoleName, 60),
            icon: imageToken("i", data.ImageIcon), award: clean(data.HighestAwardKind, 20), achievements,
            earned: earned.length, earnedHardcore: achievements.filter(item => item.earnedHardcore).length,
            points: achievements.reduce((sum, item) => sum + item.points, 0),
            pointsEarned: earned.reduce((sum, item) => sum + item.points, 0)
        };
    }

    const isEarned = item => Boolean(item.earned || item.earnedHardcore);

    // The browser's filters: all, locked, earned, missable (earned or not),
    // and progression (including the win condition); sorted in the game's
    // own order, by points, or rarest first.
    function filterRaAchievements(list, filter = "all", sort = "order") {
        const kept = list.filter(item => filter === "locked" ? !isEarned(item)
            : filter === "earned" ? isEarned(item)
            : filter === "missable" ? item.type === "missable"
            : filter === "progression" ? item.type === "progression" || item.type === "win_condition"
            : true);
        if (sort === "points") return [...kept].sort((a, b) => b.points - a.points || a.order - b.order);
        if (sort === "rarest") return [...kept].sort((a, b) => (a.rarity ?? 101) - (b.rarity ?? 101) || a.order - b.order);
        return kept;
    }

    function raCounts(list) {
        return {
            all: list.length, locked: list.filter(item => !isEarned(item)).length, earned: list.filter(isEarned).length,
            missable: list.filter(item => item.type === "missable").length,
            progression: list.filter(item => item.type === "progression" || item.type === "win_condition").length
        };
    }

    // "Next up" for a game: the first locked progression (or win) achievement
    // in the game's order, else the first locked one; with how many missable
    // ones are still locked. null when everything is unlocked.
    function nextUp(game) {
        if (!game?.achievements?.length) return null;
        const locked = game.achievements.filter(item => !isEarned(item));
        if (!locked.length) return null;
        const next = locked.find(item => item.type === "progression" || item.type === "win_condition") || locked[0];
        return { achievement: next, locked: locked.length, missableLeft: locked.filter(item => item.type === "missable").length };
    }

    // The last days' unlocks (API_GetUserRecentAchievements), newest first.
    function parseRaUnlocks(raw) {
        const data = parseJson(raw);
        if (!Array.isArray(data)) return [];
        return data.slice(0, 1000).filter(item => item && typeof item === "object").map(item => ({
            title: clean(item.Title, 120), description: clean(item.Description, 200), badge: imageToken("b", item.BadgeName),
            game: clean(item.GameTitle, 120), gameId: count(item.GameID), points: count(item.Points),
            type: RA_TYPES.has(item.Type) ? item.Type : "", date: raDate(item.Date),
            hardcore: item.HardcoreMode === 1 || item.HardcoreMode === "1" || item.HardcoreMode === true
        })).filter(item => item.title && item.date).sort((a, b) => b.date.localeCompare(a.date));
    }

    // "Top 12%" from a rank among ranked players; "" when unknown.
    function rankPercentile(rank, ranked) {
        if (!rank || !ranked || rank > ranked) return "";
        const percent = rank / ranked * 100;
        return `Top ${percent < 1 ? "1" : Math.ceil(percent)}%`;
    }

    // Matches a library game to a RetroAchievements game by display title,
    // ignoring case and punctuation.
    function titleKey(title) {
        return displayTitle(title).toLocaleLowerCase().replace(/^the\s+/, "").replace(/[^\p{L}\p{N}]+/gu, "");
    }

    // Now playing: the library game behind a running item. Steam sends its
    // id; an emulator's game is matched by title within that emulator (the
    // most recently played if several share a title); PSO is its one entry.
    function matchPlayingGame(items, playing) {
        if (!Array.isArray(items) || !playing || typeof playing !== "object") return null;
        if (typeof playing.id === "string" && playing.id) return items.find(game => game.id === playing.id) || null;
        if (playing.emulator === "pso") return items.find(game => game.emulator === "pso") || null;
        const key = titleKey(gameFromWindowTitle(playing.emulator, playing.title));
        if (!key) return null;
        return sortGames(items.filter(game => game.emulator === playing.emulator && titleKey(game.title) === key), "recent")[0] || null;
    }

    // A session timer: "4:05", "1:02:03".
    function formatClock(seconds) {
        const total = count(seconds);
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        const secs = String(total % 60).padStart(2, "0");
        return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
    }

    global.ASCSGames = {
        EMULATORS, systemName, formatDuration, formatLastPlayed, parseLocal, displayTitle, sortGames,
        filterGames, totalsByEmulator, gameFromWindowTitle, parseRetroAchievements, rankPercentile, titleKey, imageToken,
        matchPlayingGame, formatClock, parseRaGame, filterRaAchievements, raCounts, nextUp, parseRaUnlocks
    };
})(globalThis);
