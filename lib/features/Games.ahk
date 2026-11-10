; ==========================================
; GAMES (1.7.0)
; ==========================================
; The Games tab reads the emulators' own records (read-only): RetroArch's
; history and runtime logs, PCSX2's playtime.dat and game list, and
; Dolphin's TimePlayed.ini and game list. ASCS keeps a private index of
; game ids to paths; the page only ever sends an id back, and launches use
; the configured emulator with the indexed path, quoted. Cover art (opt-in)
; is read from the emulators' own local folders, checked to be a PNG or
; JPEG under 1.5 MB, and sent as a data URI; nothing is downloaded.

LoadGameSettings() {
    global ASCS_SettingsFile, ASCS_GamePaths, ASCS_Headphones, ASCS_SoundSwitchKey, ASCS_ShowCovers, ASCS_PsoVoiceChannel

    for name, defaultPath in ASCS_GamePaths.Clone() {
        try ASCS_GamePaths[name] := ValidateExecutablePath(
            IniRead(ASCS_SettingsFile, "Games", name, defaultPath), name)
        catch as err {
            WriteLog("Games: " err.Message)
            ASCS_GamePaths[name] := ""
        }
    }
    try ASCS_Headphones := ValidateDeviceName(IniRead(ASCS_SettingsFile, "Games", "Headphones", ASCS_Headphones))
    try ASCS_SoundSwitchKey := ParseKeyCombo(IniRead(ASCS_SettingsFile, "Games", "SoundSwitch", "Ctrl+Alt+F11"))
    catch as err
        WriteLog("Games: invalid SoundSwitch shortcut. " err.Message)
    ; Cover art reads local image folders only, so it is on unless turned off.
    ASCS_ShowCovers := IniRead(ASCS_SettingsFile, "Games", "Covers", "1") = "1"
    try ASCS_PsoVoiceChannel := DiscordChannelUri(IniRead(ASCS_SettingsFile, "Games", "VoiceChannel", ""))
    catch as err {
        WriteLog("Games: " err.Message)
        ASCS_PsoVoiceChannel := ""
    }
}

SendGameSettings() {
    global ASCS_GamePaths, ASCS_Headphones, ASCS_SoundSwitchKey, ASCS_ShowCovers, ASCS_PsoVoiceChannel

    outputs := PlaybackDevices()
    devices := "["
    for device in outputs
        devices .= (A_Index > 1 ? "," : "") JsonQuote(device.label)
    devices .= "]"
    paths := "{"
    for name, path in ASCS_GamePaths
        paths .= (A_Index > 1 ? "," : "") JsonQuote(name) ":" JsonQuote(path)
    paths .= "}"
    SendToFrontend('{"type":"gameSettings","paths":' paths
        ',"headphones":' JsonQuote(AudioLabelFromName(outputs, ASCS_Headphones))
        ',"soundSwitch":' JsonQuote(ASCS_SoundSwitchKey["display"])
        ',"covers":' (ASCS_ShowCovers ? "true" : "false")
        ',"voiceChannel":' JsonQuote(ASCS_PsoVoiceChannel = "" ? "" : StrReplace(ASCS_PsoVoiceChannel, "discord://-/", "https://discord.com/"))
        ',"devices":' devices
        ',"retroAchievements":' JsonQuote(RetroAchievementsState()) '}')
}

; Payload: retroarch|dolphin|pcsx2|pso|discord|headphones|soundswitch|covers|voicechannel
SaveGameSettings(content) {
    global ASCS_SettingsFile, ASCS_GamePaths, ASCS_Headphones, ASCS_SoundSwitchKey, ASCS_ShowCovers, ASCS_GameLibraryStamp, ASCS_PsoVoiceChannel

    try {
        fields := StrSplit(content, "|")
        if (fields.Length != 9 || !(fields[8] = "0" || fields[8] = "1"))
            throw Error("Games settings payload has an invalid shape.")
        voiceChannel := DiscordChannelUri(fields[9])
        labels := ["RetroArch", "Dolphin", "PCSX2", "The PSO launcher", "Discord"]
        names := ["retroarch", "dolphin", "pcsx2", "pso", "discord"]
        paths := Map()
        Loop 5
            paths[names[A_Index]] := ValidateExecutablePath(fields[A_Index], labels[A_Index])
        headphones := AudioNameFromLabel(PlaybackDevices(), ValidateDeviceName(fields[6]))
        soundSwitch := ParseKeyCombo(fields[7])

        for name, path in paths
            IniWrite(path, ASCS_SettingsFile, "Games", name)
        IniWrite(headphones, ASCS_SettingsFile, "Games", "Headphones")
        IniWrite(soundSwitch["display"], ASCS_SettingsFile, "Games", "SoundSwitch")
        IniWrite(fields[8], ASCS_SettingsFile, "Games", "Covers")
        IniWrite(voiceChannel, ASCS_SettingsFile, "Games", "VoiceChannel")
        ASCS_PsoVoiceChannel := voiceChannel
        for name, path in paths
            ASCS_GamePaths[name] := path
        ASCS_Headphones := headphones
        ASCS_SoundSwitchKey := soundSwitch
        ASCS_ShowCovers := fields[8] = "1"
        ASCS_GameLibraryStamp := ""
        SendToFrontend('{"type":"gameSettingsSaved","message":"Saved."}')
        SendGameSettings()
    } catch as err {
        WriteLog("Games settings save failed: " err.Message)
        SendToFrontend('{"type":"error","scope":"games","message":' JsonQuote(err.Message) '}')
        SendGameSettings()
    }
}

; Payload: 0 or 1. Answered with the library, whose cover references depend on it.
SetShowCovers(content) {
    global ASCS_SettingsFile, ASCS_ShowCovers, ASCS_GameLibraryStamp

    if !(content = "0" || content = "1") {
        WriteLog("Rejected an invalid cover art setting.")
        return
    }
    try {
        IniWrite(content, ASCS_SettingsFile, "Games", "Covers")
        ASCS_ShowCovers := content = "1"
        ASCS_GameLibraryStamp := ""
    } catch as err {
        WriteLog("Cover art setting save failed: " err.Message)
    }
    SendGames()
}

; ---- the library

GameDataDirs() {
    global ASCS_GamePaths
    dirs := Map("retroarch", "", "pcsx2", "", "dolphin", "")
    if (ASCS_GamePaths["retroarch"] != "") {
        SplitPath(ASCS_GamePaths["retroarch"], , &dir)
        dirs["retroarch"] := dir
    }
    if (ASCS_GamePaths["pcsx2"] != "") {
        SplitPath(ASCS_GamePaths["pcsx2"], , &dir)
        dirs["pcsx2"] := FileExist(dir "\portable.txt") ? dir : A_MyDocuments "\PCSX2"
    }
    if (ASCS_GamePaths["dolphin"] != "") {
        SplitPath(ASCS_GamePaths["dolphin"], , &dir)
        dirs["dolphin"] := FileExist(dir "\portable.txt") ? dir "\User" : EnvGet("APPDATA") "\Dolphin Emulator"
    }
    return dirs
}

FileStamp(path) {
    return FileExist(path) ? FileGetTime(path, "M") "/" FileGetSize(path) : "missing"
}

; Parses of the large binary game lists are kept until the file changes.
CachedGameList(kind, path) {
    global ASCS_GameListCache
    stamp := FileStamp(path)
    if (ASCS_GameListCache.Has(kind) && ASCS_GameListCache[kind]["stamp"] = stamp)
        return ASCS_GameListCache[kind]["games"]
    games := Map()
    if (stamp != "missing") {
        try {
            buffer := FileRead(path, "RAW")
            games := kind = "pcsx2" ? ParsePcsx2GameList(buffer, buffer.Size) : ParseDolphinGameList(buffer, buffer.Size)
        } catch as err {
            WriteLog("Games: " kind " game list unreadable: " err.Message)
        }
    }
    ASCS_GameListCache[kind] := Map("stamp", stamp, "games", games)
    return games
}

LocalIsoFromUnix(unix) {
    if (unix <= 0)
        return ""
    utc := DateAdd("19700101000000", unix, "Seconds")
    return FormatTime(DateAdd(utc, DateDiff(A_Now, A_NowUTC, "Seconds"), "Seconds"), "yyyy-MM-dd'T'HH:mm:ss")
}

LocalIsoFromStamp(stamp) {
    return stamp = "" ? "" : FormatTime(stamp, "yyyy-MM-dd'T'HH:mm:ss")
}

FirstExisting(paths*) {
    for path in paths
        if (path != "" && FileExist(path))
            return path
    return ""
}

; Builds the game list and the private id -> launch index. Returns JSON.
BuildGameLibrary() {
    global ASCS_GameIndex, ASCS_ShowCovers

    index := Map()
    json := ""
    dirs := GameDataDirs()
    add(id, title, emulator, system, seconds, last, count, launch, cover, details := 0, showPath := "") {
        index[id] := Map("emulator", emulator, "title", title, "launch", launch, "cover", cover,
            "details", IsObject(details) ? details : Map(), "show", showPath)
        json .= (json = "" ? "" : ",") '{"id":' JsonQuote(id) ',"title":' JsonQuote(SubStr(title, 1, 160))
            . ',"emulator":' JsonQuote(emulator) ',"system":' JsonQuote(SubStr(system, 1, 80))
            . ',"seconds":' seconds ',"last":' JsonQuote(last) ',"plays":' count
            . ',"launchable":' (IsObject(launch) ? "true" : "false")
            . ',"installed":' (IsObject(launch) && launch.Has("installed") && !launch["installed"] ? "false" : "true")
            . ',"cover":' (cover != "" ? "true" : "false")
            . ',"coverAngled":' (IsAngledCover(emulator, cover) ? "true" : "false") '}'
    }

    ; RetroArch: runtime logs (play time), joined to history (how to launch).
    if (dirs["retroarch"] != "") {
        history := Map()
        try {
            for item in ParseRetroArchHistory(FileRead(dirs["retroarch"] "\playlists\builtin\content_history.lpl", "UTF-8")) {
                base := ContentBaseName(item["path"])
                if (base != "" && !history.Has(base))
                    history[base] := item
            }
        }
        played := Map()
        Loop Files dirs["retroarch"] "\playlists\logs\*.lrtl", "R" {
            if (A_Index > 2000)
                break
            try {
                log := ParseRetroArchRuntime(FileRead(A_LoopFileFullPath, "UTF-8"))
                if !log
                    continue
                SplitPath(A_LoopFileFullPath, , &folder, , &base)
                SplitPath(folder, &core)
                if !played.Has(base)
                    played[base] := Map("seconds", 0, "last", "", "count", 0, "core", core)
                entry := played[base]
                entry["seconds"] += log["seconds"]
                entry["count"] += log["count"]
                if (StrCompare(log["last"], entry["last"]) > 0)
                    entry["last"] := log["last"]
            }
        }
        for base, item in history
            if !played.Has(base)
                played[base] := Map("seconds", 0, "last", "", "count", 0, "core", "")
        n := 0
        for base, entry in played {
            n++
            item := history.Has(base) ? history[base] : 0
            title := item && item["label"] != "" ? item["label"] : base
            system := item && item["db"] != "" ? item["db"] : entry["core"]
            launch := item ? Map("content", ContentFilePath(item["path"]), "core", item["core"]) : 0
            cover := ""
            if (ASCS_ShowCovers && item && item["db"] != "")
                cover := FirstExisting(dirs["retroarch"] "\thumbnails\" item["db"] "\Named_Boxarts\" RetroArchThumbnailName(title) ".png")
            details := Map("Core", item && item["coreName"] != "" ? item["coreName"] : entry["core"])
            if item
                details["File"] := GameFileName(ContentFilePath(item["path"]))
            add("ra:" n, title, "retroarch", system, entry["seconds"], entry["last"], entry["count"], launch, cover,
                details, item ? ContentFilePath(item["path"]) : "")
        }
    }

    ; PCSX2: playtime.dat, named and located through its game list.
    if (dirs["pcsx2"] != "") {
        try {
            list := CachedGameList("pcsx2", dirs["pcsx2"] "\cache\gamelist.cache")
            for game in ParsePcsx2Playtime(FileRead(dirs["pcsx2"] "\inis\playtime.dat")) {
                if !RegExMatch(game["serial"], "^[A-Za-z0-9-]{1,32}$")
                    continue
                known := list.Has(game["serial"]) ? list[game["serial"]] : 0
                title := known && known["title"] != "" ? known["title"] : game["serial"]
                cover := ""
                if ASCS_ShowCovers {
                    folder := dirs["pcsx2"] "\covers\"
                    cover := FirstExisting(folder game["serial"] ".png", folder game["serial"] ".jpg",
                        folder RetroArchThumbnailName(title) ".png", folder RetroArchThumbnailName(title) ".jpg")
                }
                details := Map("Serial", game["serial"])
                if known
                    details["File"] := GameFileName(known["path"])
                add("ps2:" game["serial"], title, "pcsx2", "PlayStation 2", game["seconds"],
                    LocalIsoFromUnix(game["last"]), 0, known ? Map("content", known["path"]) : 0, cover,
                    details, known ? known["path"] : "")
            }
        } catch as err {
            WriteLog("Games: PCSX2 records unreadable: " err.Message)
        }
    }

    ; Dolphin: TimePlayed.ini, named and located through its game list.
    if (dirs["dolphin"] != "") {
        try {
            list := CachedGameList("dolphin", dirs["dolphin"] "\Cache\gamelist.cache")
            for id, seconds in ParseDolphinTimePlayed(FileRead(dirs["dolphin"] "\Config\TimePlayed.ini")) {
                known := list.Has(id) ? list[id] : 0
                if (!known && seconds < 600)
                    continue                 ; system channels and brief tests
                title := known ? GameTitleFromFile(known["file"]) : id
                system := SubStr(id, 1, 1) = "G" ? "GameCube" : "Wii"
                uid := dirs["dolphin"] "\Cache\" id ".uidcache"
                last := FileExist(uid) ? LocalIsoFromStamp(FileGetTime(uid, "M")) : ""
                cover := ASCS_ShowCovers ? FirstExisting(dirs["dolphin"] "\Cache\GameCovers\" id ".png") : ""
                details := Map("Game ID", id)
                if known
                    details["File"] := known["file"]
                add("gc:" id, title, "dolphin", system, seconds, last, 0, known ? Map("content", known["path"]) : 0, cover,
                    details, known ? known["path"] : "")
            }
        } catch as err {
            WriteLog("Games: Dolphin records unreadable: " err.Message)
        }
    }

    ; Steam: installed games from the app manifests, play time from the
    ; signed-in account's localconfig.vdf, portrait art from Steam's cache.
    steam := SteamFolder()
    if (steam != "") {
        try {
            playtime := CachedSteamPlaytime(steam)
            libraries := [steam]
            try {
                for folder in ParseSteamLibraryFolders(FileRead(steam "\steamapps\libraryfolders.vdf", "UTF-8"))
                    if !HasValue(libraries, folder)
                        libraries.Push(folder)
            }
            seen := Map()
            for library in libraries {
                Loop Files library "\steamapps\appmanifest_*.acf" {
                    if (A_Index > 2000)
                        break
                    manifest := ParseSteamManifest(FileRead(A_LoopFileFullPath, "UTF-8"))
                    appid := manifest.Has("appid") ? manifest["appid"] : ""
                    name := manifest.Has("name") ? manifest["name"] : ""
                    if (!RegExMatch(appid, "^\d{1,10}$") || name = "" || IsSteamTool(name) || seen.Has(appid))
                        continue
                    seen[appid] := true
                    played := playtime.Has(appid) ? playtime[appid] : Map("minutes", 0, "last", 0)
                    lastUnix := Max(played["last"], manifest.Has("LastPlayed") && RegExMatch(manifest["LastPlayed"], "^\d{1,12}$") ? Integer(manifest["LastPlayed"]) : 0)
                    installDir := manifest.Has("installdir") ? manifest["installdir"] : ""
                    folder := installDir != "" && !InStr(installDir, "..") ? library "\steamapps\common\" installDir : ""
                    details := Map("App ID", appid)
                    if (installDir != "")
                        details["Install folder"] := installDir
                    if (manifest.Has("SizeOnDisk") && RegExMatch(manifest["SizeOnDisk"], "^\d{1,15}$"))
                        details["Size on disk"] := FormatBytes(Integer(manifest["SizeOnDisk"]))
                    cover := ASCS_ShowCovers ? SteamCoverRef(steam, appid) : ""
                    add("st:" appid, name, "steam", "PC", played["minutes"] * 60, LocalIsoFromUnix(lastUnix), 0,
                        Map("appid", appid), cover, details, folder)
                }
            }
            ; Uninstalled games with play time, named from Steam's app cache.
            ; Play opens Steam's install prompt through the same numeric link.
            wanted := Map()
            for appid, played in playtime
                if (played["minutes"] > 0 && !seen.Has(appid))
                    wanted[appid] := true
            if wanted.Count {
                appNames := CachedSteamAppNames(steam, wanted)
                for appid in wanted {
                    if !appNames.Has(appid) || IsSteamTool(appNames[appid])
                        continue
                    played := playtime[appid]
                    cover := ASCS_ShowCovers ? SteamCoverRef(steam, appid) : ""
                    add("st:" appid, appNames[appid], "steam", "PC", played["minutes"] * 60, LocalIsoFromUnix(played["last"]), 0,
                        Map("appid", appid, "installed", false), cover, Map("App ID", appid, "Status", "Not installed"), "")
                }
            }
        } catch as err {
            WriteLog("Games: Steam records unreadable: " err.Message)
        }
    }

    ASCS_GameIndex := index
    return "[" json "]"
}

SendGames() {
    global ASCS_GameLibraryJson, ASCS_GameLibraryStamp, ASCS_ShowCovers
    ; Rebuilt at most every 30 seconds; the binary game lists are cached
    ; separately until they change.
    stamp := A_TickCount // 30000
    if (ASCS_GameLibraryStamp != stamp) {
        ASCS_GameLibraryJson := BuildGameLibrary()
        ASCS_GameLibraryStamp := stamp
    }
    SendToFrontend('{"type":"games","covers":' (ASCS_ShowCovers ? "true" : "false") ',"items":' ASCS_GameLibraryJson '}')
}

LaunchGame(id) {
    global ASCS_GameIndex, ASCS_GamePaths

    try {
        id := ValidateGameId(id)
        if !ASCS_GameIndex.Has(id)
            throw Error("That game is no longer in the library.")
        game := ASCS_GameIndex[id]
        launch := game["launch"]
        if !IsObject(launch)
            throw Error("Maestro doesn't know where “" game["title"] "” is stored.")
        if (game["emulator"] = "steam") {
            if !RegExMatch(launch["appid"], "^\d{1,10}$")
                throw Error("Invalid Steam app id.")
            Run("steam://rungameid/" launch["appid"])
            RecordActivity("launch", "Playing " SubStr(game["title"], 1, 80))
            return
        }
        exe := ASCS_GamePaths[game["emulator"]]
        if (exe = "" || !FileExist(exe))
            throw Error("Set the " game["emulator"] " program in Games › Setup.")
        content := launch["content"]
        if (InStr(content, '"') || !FileExist(content))
            throw Error("The game file was not found: " content)
        SplitPath(exe, , &dir)
        switch game["emulator"] {
            case "retroarch":
                core := launch["core"]
                if (InStr(core, '"') || !FileExist(core))
                    throw Error("The RetroArch core was not found: " core)
                Run('"' exe '" -L "' core '" "' content '"', dir)
            case "pcsx2":
                Run('"' exe '" -- "' content '"', dir)
            case "dolphin":
                Run('"' exe '" -e "' content '"', dir)
        }
        RecordActivity("launch", "Playing " SubStr(game["title"], 1, 80))
    } catch as err {
        WriteLog("Game launch failed: " err.Message)
        RecordActivity("error", "Game: " err.Message)
        SendToFrontend('{"type":"notice","message":' JsonQuote(err.Message) '}')
    }
}

; ---- Steam helpers

SteamFolder() {
    try path := RegRead("HKCU\Software\Valve\Steam", "SteamPath")
    catch
        return ""
    path := StrReplace(path, "/", "\")
    return RegExMatch(path, "i)^[A-Z]:\\") && DirExist(path) ? path : ""
}

; The play-time file of the account that used Steam most recently, parsed
; once and kept until it changes.
CachedSteamPlaytime(steam) {
    global ASCS_GameListCache
    newest := "", newestTime := ""
    Loop Files steam "\userdata\*", "D" {
        if !RegExMatch(A_LoopFileName, "^\d{1,12}$")
            continue
        file := A_LoopFileFullPath "\config\localconfig.vdf"
        if FileExist(file) && StrCompare(FileGetTime(file, "M"), newestTime) > 0
            newest := file, newestTime := FileGetTime(file, "M")
    }
    if (newest = "")
        return Map()
    stamp := FileStamp(newest)
    if (ASCS_GameListCache.Has("steam") && ASCS_GameListCache["steam"]["stamp"] = stamp)
        return ASCS_GameListCache["steam"]["games"]
    games := Map()
    try games := ParseSteamPlaytime(FileRead(newest, "UTF-8"))
    catch as err
        WriteLog("Games: Steam play time unreadable: " err.Message)
    ASCS_GameListCache["steam"] := Map("stamp", stamp, "games", games)
    return games
}

; Steam's portrait library art (appcache\librarycache\<appid>\...\library_600x900.jpg),
; else its landscape header. Found once per game per session, since
; searching Steam's cache folders on every rebuild is slow.
; Steam covers are found lazily: the library build only notes that the
; game's cache folder exists ("steam:<folder>|<appid>"); the image itself is
; looked up when its cover is first sent. Searching hundreds of cache
; folders up front made the first build three times slower.
SteamCoverRef(steam, appid) {
    if DirExist(steam "\appcache\librarycache\" appid)
        return "steam:" steam "|" appid
    return FirstExisting(steam "\appcache\librarycache\" appid "_library_600x900.jpg")
}

CoverFile(cover) {
    if (SubStr(cover, 1, 6) != "steam:")
        return cover
    parts := StrSplit(SubStr(cover, 7), "|")
    return parts.Length = 2 ? SteamCover(parts[1], parts[2]) : ""
}

SteamCover(steam, appid) {
    static found := Map()
    if found.Has(appid)
        return found[appid]
    cover := ""
    folder := steam "\appcache\librarycache\" appid
    if DirExist(folder) {
        for name in ["library_600x900.jpg", "header.jpg", "library_header.jpg"] {
            Loop Files folder "\" name, "R" {
                cover := A_LoopFileFullPath
                break
            }
            if (cover != "")
                break
        }
    } else {
        cover := FirstExisting(steam "\appcache\librarycache\" appid "_library_600x900.jpg",
            steam "\appcache\librarycache\" appid "_header.jpg")
    }
    found[appid] := cover
    return cover
}

; Names from appinfo.vdf, read once per version of that file; app ids asked
; for later are looked up again only when the file changes.
CachedSteamAppNames(steam, wanted) {
    static stamp := "", names := Map(), tried := Map()
    path := steam "\appcache\appinfo.vdf"
    current := FileStamp(path)
    if (current != stamp)
        stamp := current, names := Map(), tried := Map()
    missing := Map()
    for appid in wanted
        if !tried.Has(appid)
            missing[appid] := true
    if (missing.Count && current != "missing") {
        try {
            buffer := FileRead(path, "RAW")
            for appid, name in ParseSteamAppNames(buffer, buffer.Size, missing)
                names[appid] := name
        } catch as err {
            WriteLog("Games: Steam app names unreadable: " err.Message)
        }
        for appid in missing
            tried[appid] := true
    }
    return names
}

SteamRunningAppId() {
    try id := RegRead("HKCU\Software\Valve\Steam", "RunningAppID")
    catch
        return ""
    return id > 0 ? String(id) : ""
}

GameFileName(path) {
    SplitPath(path, &name)
    return name
}

FormatBytes(bytes) {
    for unit in ["B", "KB", "MB", "GB", "TB"] {
        if (bytes < 1024 || unit = "TB")
            return (unit = "B" ? bytes : Round(bytes, bytes < 10 ? 1 : 0)) " " unit
        bytes /= 1024
    }
}

HasValue(list, value) {
    for item in list
        if (item = value)
            return true
    return false
}

; ---- game details (on request) and Show file

SendGameDetails(id) {
    global ASCS_GameIndex
    try {
        id := ValidateGameId(id)
        if !ASCS_GameIndex.Has(id)
            return
        game := ASCS_GameIndex[id]
        fields := ""
        for label, value in game["details"]
            fields .= (fields = "" ? "" : ",") "[" JsonQuote(label) "," JsonQuote(SubStr(value, 1, 200)) "]"
        show := game["show"]
        exists := show != "" && FileExist(show)
        if (exists && !InStr(FileExist(show), "D"))
            fields .= (fields = "" ? "" : ",") '["File size",' JsonQuote(FormatBytes(FileGetSize(show))) ']'
        SendToFrontend('{"type":"gameDetails","id":' JsonQuote(id) ',"fields":[' fields ']'
            . ',"canShow":' (exists ? "true" : "false")
            . ',"showLabel":' JsonQuote(game["emulator"] = "steam" ? "Open folder" : "Show file") '}')
    } catch as err {
        WriteLog("Game details failed: " err.Message)
    }
}

ShowGameFile(id) {
    global ASCS_GameIndex
    try {
        id := ValidateGameId(id)
        if !ASCS_GameIndex.Has(id)
            return
        show := ASCS_GameIndex[id]["show"]
        if (show = "" || InStr(show, '"') || !FileExist(show))
            throw Error("The game's file was not found.")
        if InStr(FileExist(show), "D")
            Run('explorer.exe "' show '"')
        else
            Run('explorer.exe /select,"' show '"')
    } catch as err {
        SendToFrontend('{"type":"notice","message":' JsonQuote(err.Message) '}')
    }
}

; ---- cover art

; Covers are queued and sent one per timer tick (each is a file read and an
; encode of up to 1.5 MB), so hotkeys stay responsive while a shelf loads.
SendCovers(content) {
    global ASCS_GameIndex, ASCS_ShowCovers, ASCS_CoverQueue
    if !ASCS_ShowCovers
        return
    for id in StrSplit(content, ",") {
        if (A_Index > 40)
            break
        try {
            id := ValidateGameId(id)
            if (ASCS_GameIndex.Has(id) && ASCS_GameIndex[id]["cover"] != "")
                ASCS_CoverQueue.Push(id)
        }
    }
    while (ASCS_CoverQueue.Length > 80)
        ASCS_CoverQueue.RemoveAt(1)
    if ASCS_CoverQueue.Length
        SetTimer(SendNextCover, 15)
}

SendNextCover() {
    global ASCS_GameIndex, ASCS_CoverQueue, ASCS_App
    if !ASCS_CoverQueue.Length {
        SetTimer(SendNextCover, 0)
        return
    }
    id := ASCS_CoverQueue.RemoveAt(1)
    try {
        if !ASCS_GameIndex.Has(id)
            return
        file := CoverFile(ASCS_GameIndex[id]["cover"])
        data := file != "" ? ReadImageAsDataUri(file) : ""
        if (data != "")
            ASCS_App.PostWebMessageAsString("COVER`n" id "`n" data)
    }
}

; A PNG or JPEG of at most 1.5 MB, as a data: URI; "" for anything else.
ReadImageAsDataUri(path) {
    if (FileGetSize(path) > 1572864)
        return ""
    bytes := FileRead(path, "RAW")
    if (bytes.Size < 8)
        return ""
    if (NumGet(bytes, 0, "UInt") = 0x474E5089)
        mime := "image/png"
    else if (NumGet(bytes, 0, "UChar") = 0xFF && NumGet(bytes, 1, "UChar") = 0xD8 && NumGet(bytes, 2, "UChar") = 0xFF)
        mime := "image/jpeg"
    else
        return ""
    ; CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF
    flags := 0x40000001
    DllCall("Crypt32\CryptBinaryToStringW", "Ptr", bytes, "UInt", bytes.Size, "UInt", flags, "Ptr", 0, "UInt*", &chars := 0)
    text := Buffer(chars * 2)
    if !DllCall("Crypt32\CryptBinaryToStringW", "Ptr", bytes, "UInt", bytes.Size, "UInt", flags, "Ptr", text, "UInt*", &chars)
        return ""
    return "data:" mime ";base64," StrGet(text, chars, "UTF-16")
}

; ---- live status: running apps, now playing, controllers

GameProcessName(name) {
    global ASCS_GamePaths
    if (ASCS_GamePaths[name] = "")
        return ""
    SplitPath(ASCS_GamePaths[name], &file)
    return file
}

RunningGameApps() {
    running := Map()
    for name in ["retroarch", "dolphin", "pcsx2"] {
        exe := GameProcessName(name)
        running[name] := exe != "" && ProcessExist(exe)
    }
    launcher := GameProcessName("pso")
    running["pso"] := ProcessExist("PsoBB.exe") || (launcher != "" && ProcessExist(launcher))
    return running
}

; System's sign-in history (1.9.1): the end of the log SignIn.ahk
; writes, read only when the page opens.
SendSignInHistory() {
    global ASCS_SoundLibrary
    text := ""
    try {
        log := FileOpen(EnvGet("LOCALAPPDATA") "\StartupTasks.log", "r", "UTF-8")
        if (log.Length > 65536)
            log.Pos := log.Length - 65536
        text := log.Read()
        log.Close()
    }
    SendToFrontend('{"type":"signInHistory","items":' SignInHistoryJson(text, , logged => SignInSoundLabel(logged, ASCS_SoundLibrary, SignInSoundOrigin)) '}')
}

SendRunningApps() {
    running := RunningGameApps()
    json := ""
    for name, state in running
        json .= (json = "" ? "" : ",") JsonQuote(name) ":" (state ? "true" : "false")
    SendToFrontend('{"type":"running","apps":{' json '}}')
}

; The title naming the game an emulator is running. PCSX2 and Dolphin show the
; game in a window of its own beside their main window, so every visible
; window is read and the game's is preferred (see PickEmulatorWindow), whichever
; has focus.
EmulatorWindowTitle(name, exe) {
    windows := []
    for hwnd in WinGetList("ahk_exe " exe) {
        try {
            if !(WinGetStyle("ahk_id " hwnd) & 0x10000000)
                continue
            title := WinGetTitle("ahk_id " hwnd)
            if (title = "")
                continue
            WinGetPos(, , &width, &height, "ahk_id " hwnd)
            windows.Push(Map("title", SubStr(RegExReplace(title, "[\x00-\x1F]"), 1, 200), "area", width * height))
        }
    }
    return PickEmulatorWindow(name, windows)
}

; ---- controllers
; Two Windows interfaces are read: XInput (X-input pads: battery, rumble and,
; through XInputGetCapabilitiesEx, vendor and product IDs) and the Raw Input
; device list (D-input and Switch-mode pads, such as an 8BitDo over
; Bluetooth; never DirectInput, which crashed ASCS). X-input connections come
; from Windows' HID device records, checked for presence with CM_Locate_DevNode. Names: an ASCS name (also written to
; Windows' per-user game controller name), else Windows' name, else the maker.

XInputCapabilitiesEx(slot) {
    static proc := 0
    if !proc {
        module := DllCall("LoadLibrary", "Str", "xinput1_4", "Ptr")
        proc := module ? DllCall("GetProcAddress", "Ptr", module, "Ptr", 108, "Ptr") : -1
    }
    if (proc = -1)
        return 0
    caps := Buffer(32, 0)
    if (DllCall(proc, "UInt", 1, "UInt", slot, "UInt", 0, "Ptr", caps, "UInt") != 0)
        return 0
    return Map("vid", NumGet(caps, 20, "UShort"), "pid", NumGet(caps, 22, "UShort"),
        "wireless", (NumGet(caps, 2, "UShort") & 0x0002) != 0)
}

; Present HID and USB game devices: "VVVV:PPPP" -> "Bluetooth" or "USB".
ControllerConnections() {
    static cache := 0, cachedAt := 0
    if (cache && A_TickCount - cachedAt < 10000)
        return cache
    found := Map()
    for root in ["HKLM\SYSTEM\CurrentControlSet\Enum\HID", "HKLM\SYSTEM\CurrentControlSet\Enum\USB"] {
        Loop Reg root, "K" {
            device := A_LoopRegName
            ids := HidKeyIds(device)
            if !ids
                continue
            key := ControllerKey(ids["vid"], ids["pid"])
            Loop Reg root "\" device, "K" {
                instance := SubStr(root, InStr(root, "Enum\") + 5) "\" device "\" A_LoopRegName
                if (DllCall("cfgmgr32\CM_Locate_DevNodeW", "UInt*", &node := 0, "Str", instance, "UInt", 0, "UInt") = 0) {
                    connection := HidConnection(device)
                    if (!found.Has(key) || connection = "Bluetooth")
                        found[key] := connection
                }
            }
        }
    }
    cache := found, cachedAt := A_TickCount
    return found
}

ControllerDisplayName(key, vid) {
    global ASCS_SettingsFile
    name := IniRead(ASCS_SettingsFile, "Controllers", StrReplace(key, ":", "_"), "")
    return name != "" ? name : ControllerWindowsName(key, vid)
}

; The device's own name in Windows (the system-wide OEM name, ignoring the
; per-user name ASCS may have set), used to recognize receivers.
ControllerWindowsName(key, vid, includeUser := true) {
    oem := "System\CurrentControlSet\Control\MediaProperties\PrivateProperties\Joystick\OEM\VID_"
        . SubStr(key, 1, 4) "&PID_" SubStr(key, 6, 4)
    for hive in (includeUser ? ["HKCU\", "HKLM\"] : ["HKLM\"]) {
        try {
            name := RegRead(hive oem, "OEMName")
            if (name != "")
                return SubStr(RegExReplace(name, "[\x00-\x1F]"), 1, 60)
        }
    }
    return ControllerMaker(vid)
}

; Whether a controller model is a wireless receiver, judged from Windows' own
; name for it ("Controller (8BitDo Pro 3 Receiver)"). Windows keeps that name
; in the per-user key that Rename also writes, so the answer is remembered
; before any rename can replace the name.
IsReceiverKey(key, vid) {
    global ASCS_SettingsFile
    remembered := IniRead(ASCS_SettingsFile, "Controllers", StrReplace(key, ":", "_") "_receiver", "")
    if (remembered != "")
        return remembered = "1"
    renamed := IniRead(ASCS_SettingsFile, "Controllers", StrReplace(key, ":", "_"), "") != ""
    receiver := IsReceiverName(ControllerWindowsName(key, vid, !renamed))
    if !renamed
        try IniWrite(receiver ? "1" : "0", ASCS_SettingsFile, "Controllers", StrReplace(key, ":", "_") "_receiver")
    return receiver
}

; Every connected controller, as a list of Maps.
ListControllers() {
    static levels := ["empty", "low", "medium", "full"]
    controllers := []
    connections := ControllerConnections()
    state := Buffer(16)
    battery := Buffer(2)
    xinputCount := 0
    xinputKeys := Map()
    Loop 4 {
        slot := A_Index - 1
        try {
            if (DllCall("xinput1_4\XInputGetState", "UInt", slot, "Ptr", state, "UInt") != 0)
                continue
        } catch {
            break
        }
        xinputCount++
        caps := XInputCapabilitiesEx(slot)
        vid := caps ? caps["vid"] : 0x045E, pid := caps ? caps["pid"] : 0x028E
        key := ControllerKey(vid, pid)
        power := "unknown"
        try {
            if (DllCall("xinput1_4\XInputGetBatteryInformation", "UInt", slot, "UChar", 0, "Ptr", battery, "UInt") = 0) {
                type := NumGet(battery, 0, "UChar"), level := NumGet(battery, 1, "UChar")
                power := type = 1 ? "wired" : (type = 2 || type = 3) && level <= 3 ? levels[level + 1] : "unknown"
            }
        }
        connection := connections.Has(key) ? connections[key] : caps && caps["wireless"] ? "Wireless" : "USB"
        ; A 2.4 GHz receiver presents its controller as a wired X-input pad,
        ; so "wired" there means only that the battery isn't passed on.
        if IsReceiverKey(key, vid) {
            connection := "2.4 GHz receiver"
            if (power = "wired")
                power := "receiver"
        }
        xinputKeys[key] := true
        controllers.Push(Map("id", "x" slot, "key", key, "name", ControllerDisplayName(key, vid),
            "mode", "X-input", "connection", connection, "power", power, "slot", slot + 1, "rumble", true))
    }
    ; Other controllers (D-input, Switch, PlayStation modes) come from the Raw
    ; Input device list. 1.7.0 first used the classic joystick API (winmm) for
    ; these, but it runs on DirectInput, whose device re-enumeration corrupted
    ; the heap when a controller connected or slept mid-scan; that crashed ASCS
    ; (four crash dumps, all inside dinput.dll's enumeration or after it).
    for pad in RawInputGamepads() {
        key := ControllerKey(pad["vid"], pad["pid"])
        if xinputKeys.Has(key) || (pad["vid"] = 0x045E && xinputCount)
            continue                    ; the same pad, already listed through XInput
        controllers.Push(Map("id", "h" pad["handle"], "key", key, "name", ControllerDisplayName(key, pad["vid"]),
            "mode", ControllerMode(pad["vid"], pad["pid"]), "connection", pad["connection"],
            "power", "unreported", "slot", 0, "rumble", false))
    }
    return controllers
}

; HID game pads and joysticks (usage page 1, usage 4 or 5) from the Raw Input
; device list: plain user32 calls, no DirectInput. Interfaces whose device
; path contains "IG_" belong to XInput devices, which are listed through
; XInput instead. Every buffer is sized from the size the call reports.
RawInputGamepads() {
    pads := []
    entrySize := 8 + A_PtrSize                  ; RAWINPUTDEVICELIST
    if (DllCall("GetRawInputDeviceList", "Ptr", 0, "UInt*", &count := 0, "UInt", entrySize, "Int") != 0
        || count = 0 || count > 512)
        return pads
    list := Buffer(count * entrySize, 0)
    got := DllCall("GetRawInputDeviceList", "Ptr", list, "UInt*", &count, "UInt", entrySize, "Int")
    if (got <= 0)
        return pads                             ; the list changed mid-call; next poll
    info := Buffer(32, 0)                       ; RID_DEVICE_INFO
    Loop Min(got, list.Size // entrySize) {
        entry := (A_Index - 1) * entrySize
        handle := NumGet(list, entry, "Ptr")
        if (NumGet(list, entry + A_PtrSize, "UInt") != 2)      ; RIM_TYPEHID
            continue
        NumPut("UInt", 32, info, 0)
        size := 32
        if (DllCall("GetRawInputDeviceInfoW", "Ptr", handle, "UInt", 0x2000000B, "Ptr", info, "UInt*", &size, "Int") <= 0)
            continue
        page := NumGet(info, 20, "UShort"), usage := NumGet(info, 22, "UShort")
        if !(page = 1 && (usage = 4 || usage = 5))
            continue
        chars := 0
        DllCall("GetRawInputDeviceInfoW", "Ptr", handle, "UInt", 0x20000007, "Ptr", 0, "UInt*", &chars, "Int")
        if (chars = 0 || chars > 1024)
            continue
        capacity := chars + 1
        name := Buffer(capacity * 2, 0)
        if (DllCall("GetRawInputDeviceInfoW", "Ptr", handle, "UInt", 0x20000007, "Ptr", name, "UInt*", &capacity, "Int") <= 0)
            continue
        path := StrGet(name, "UTF-16")
        if InStr(path, "IG_")
            continue
        pads.Push(Map("handle", handle, "vid", NumGet(info, 8, "UInt") & 0xFFFF, "pid", NumGet(info, 12, "UInt") & 0xFFFF,
            "connection", RegExMatch(path, "i)\{00001124-|\{00001812-") ? "Bluetooth" : "USB"))
        if (pads.Length >= 8)
            break
    }
    return pads
}

ControllerJson() {
    json := ""
    for pad in ListControllers() {
        json .= (json = "" ? "" : ",") '{"id":' JsonQuote(pad["id"]) ',"key":' JsonQuote(pad["key"])
            . ',"name":' JsonQuote(pad["name"]) ',"mode":' JsonQuote(pad["mode"])
            . ',"connection":' JsonQuote(pad["connection"]) ',"power":' JsonQuote(pad["power"])
            . ',"slot":' pad["slot"] ',"rumble":' (pad["rumble"] ? "true" : "false") ',"testable":true}'
        if (A_Index >= 8)
            break
    }
    return "[" json "]"
}

; ---- D-input and Switch-mode tester (Raw Input HID reports)
; While the tester is open on such a pad, ASCS registers for game pad and
; joystick input (RIDEV_INPUTSINK, so it arrives while ASCS's page has
; focus) and decodes each report with Windows' HID parser (hid.dll). No
; DirectInput. Every buffer is sized from the size Windows reports, and
; the registration is removed when the tester closes.

StartHidTester(id) {
    global ASCS_HidTester
    StopHidTester()
    if !RegExMatch(id, "^h(\d{1,20})$", &m)
        return
    handle := 0
    for pad in RawInputGamepads()
        if (String(pad["handle"]) = m[1])
            handle := pad["handle"]
    if !handle {
        SendToFrontend('{"type":"controllerInput","id":' JsonQuote(id) ',"connected":false}')
        return
    }
    try {
        size := 0
        DllCall("GetRawInputDeviceInfoW", "Ptr", handle, "UInt", 0x20000005, "Ptr", 0, "UInt*", &size, "Int")
        if (size = 0 || size > 1048576)
            throw Error("no report description")
        preparsed := Buffer(size, 0)
        if (DllCall("GetRawInputDeviceInfoW", "Ptr", handle, "UInt", 0x20000005, "Ptr", preparsed, "UInt*", &size, "Int") <= 0)
            throw Error("report description unreadable")
        caps := Buffer(64, 0)                                   ; HIDP_CAPS
        if (DllCall("hid\HidP_GetCaps", "Ptr", preparsed, "Ptr", caps, "UInt") != 0x110000)
            throw Error("report description invalid")
        axes := Map()
        valueCount := NumGet(caps, 48, "UShort")
        if (valueCount > 0 && valueCount <= 256) {
            values := Buffer(valueCount * 72, 0)                ; HIDP_VALUE_CAPS
            length := valueCount
            if (DllCall("hid\HidP_GetValueCaps", "Int", 0, "Ptr", values, "UShort*", &length, "Ptr", preparsed, "UInt") = 0x110000) {
                Loop Min(length, valueCount) {
                    v := (A_Index - 1) * 72
                    if (NumGet(values, v, "UShort") != 1)        ; generic desktop page only
                        continue
                    first := NumGet(values, v + 56, "UShort")
                    last := NumGet(values, v + 12, "UChar") ? NumGet(values, v + 58, "UShort") : first
                    low := NumGet(values, v + 40, "Int"), high := NumGet(values, v + 44, "Int")
                    bits := NumGet(values, v + 18, "UShort")
                    if (high <= low && bits >= 1 && bits <= 31)
                        low := 0, high := (1 << bits) - 1      ; unsigned fields report max as -1
                    usage := first
                    while (usage <= last && usage <= 0x39) {
                        if (usage >= 0x30 && usage <= 0x39 && !axes.Has(usage))
                            axes[usage] := Map("min", low, "max", high)
                        usage++
                    }
                }
            }
        }
        if !RegisterGamepadInput(true)
            throw Error("input registration refused")
        ASCS_HidTester := Map("id", id, "handle", handle, "preparsed", preparsed, "axes", axes, "sent", 0)
        OnMessage(0x00FF, HandleRawInput)
    } catch as err {
        WriteLog("Controller tester: " err.Message)
        SendToFrontend('{"type":"controllerInput","id":' JsonQuote(id) ',"connected":false}')
    }
}

StopHidTester() {
    global ASCS_HidTester
    if !IsObject(ASCS_HidTester)
        return
    OnMessage(0x00FF, HandleRawInput, 0)
    RegisterGamepadInput(false)
    ASCS_HidTester := 0
}

; RAWINPUTDEVICE x2 (game pads and joysticks): add with INPUTSINK, or remove.
RegisterGamepadInput(enable) {
    entry := 8 + A_PtrSize
    devices := Buffer(2 * entry, 0)
    for i, usage in [4, 5] {
        base := (i - 1) * entry
        NumPut("UShort", 1, devices, base), NumPut("UShort", usage, devices, base + 2)
        NumPut("UInt", enable ? 0x100 : 0x1, devices, base + 4)
        NumPut("Ptr", enable ? A_ScriptHwnd : 0, devices, base + 8)
    }
    return DllCall("RegisterRawInputDevices", "Ptr", devices, "UInt", 2, "UInt", entry, "Int")
}

HandleRawInput(wParam, lParam, msg, hwnd) {
    global ASCS_HidTester
    tester := ASCS_HidTester
    if !IsObject(tester)
        return
    headerSize := 8 + 2 * A_PtrSize                             ; RAWINPUTHEADER
    size := 0
    DllCall("GetRawInputData", "Ptr", lParam, "UInt", 0x10000003, "Ptr", 0, "UInt*", &size, "UInt", headerSize)
    if (size < headerSize + 8 || size > 65536)
        return
    data := Buffer(size, 0)
    if (DllCall("GetRawInputData", "Ptr", lParam, "UInt", 0x10000003, "Ptr", data, "UInt*", &size, "UInt", headerSize, "UInt") != size)
        return
    if (NumGet(data, 0, "UInt") != 2 || NumGet(data, 8, "Ptr") != tester["handle"])
        return
    if (A_TickCount - tester["sent"] < 50)
        return                                                  ; at most 20 updates a second
    reportSize := NumGet(data, headerSize, "UInt"), reports := NumGet(data, headerSize + 4, "UInt")
    if (reportSize = 0 || reports = 0 || headerSize + 8 + reportSize * reports > size)
        return
    report := data.Ptr + headerSize + 8 + reportSize * (reports - 1)
    preparsed := tester["preparsed"]
    ; Buttons (usage page 9): a list of the pressed button numbers.
    usages := Buffer(128 * 2, 0), count := 128, buttons := 0
    if (DllCall("hid\HidP_GetUsages", "Int", 0, "UShort", 9, "UShort", 0, "Ptr", usages, "UInt*", &count,
        "Ptr", preparsed, "Ptr", report, "UInt", reportSize, "UInt") = 0x110000) {
        Loop Min(count, 128) {
            number := NumGet(usages, (A_Index - 1) * 2, "UShort")
            if (number >= 1 && number <= 32)
                buttons |= 1 << (number - 1)
        }
    }
    axesJson := "", hat := -1
    for usage, range in tester["axes"] {
        value := 0
        if (DllCall("hid\HidP_GetUsageValue", "Int", 0, "UShort", 1, "UShort", 0, "UShort", usage, "UInt*", &value,
            "Ptr", preparsed, "Ptr", report, "UInt", reportSize, "UInt") != 0x110000)
            continue
        if (usage = 0x39) {                                     ; hat switch: 8 directions, else centered
            hat := value >= range["min"] && value <= range["max"] && range["max"] - range["min"] >= 7 ? value - range["min"] : -1
            continue
        }
        span := range["max"] - range["min"]
        normal := span > 0 ? Round(((value - range["min"]) / span) * 2 - 1, 3) : 0
        axesJson .= (axesJson = "" ? "" : ",") '"' Format("{:x}", usage) '":' normal
    }
    tester["sent"] := A_TickCount
    SendToFrontend('{"type":"controllerInput","id":' JsonQuote(tester["id"]) ',"connected":true,"kind":"hid"'
        . ',"buttons":' buttons ',"hat":' hat ',"axes":{' axesJson '}}')
}

; Live input for the tester ("x0".."x3"). X-input controllers only: the
; joystick API that read other modes ran on DirectInput and crashed ASCS.
SendControllerInput(id) {
    if RegExMatch(id, "^x([0-3])$", &m) {
        state := Buffer(16, 0)
        if (DllCall("xinput1_4\XInputGetState", "UInt", Integer(m[1]), "Ptr", state, "UInt") != 0)
            return SendToFrontend('{"type":"controllerInput","id":' JsonQuote(id) ',"connected":false}')
        SendToFrontend('{"type":"controllerInput","id":' JsonQuote(id) ',"connected":true,"kind":"xinput"'
            . ',"buttons":' NumGet(state, 4, "UShort") ',"lt":' NumGet(state, 6, "UChar") ',"rt":' NumGet(state, 7, "UChar")
            . ',"lx":' NumGet(state, 8, "Short") ',"ly":' NumGet(state, 10, "Short")
            . ',"rx":' NumGet(state, 12, "Short") ',"ry":' NumGet(state, 14, "Short") '}')
    }
}

; A half-second rumble on an X-input controller.
RumbleController(id) {
    if !RegExMatch(id, "^x([0-3])$", &m)
        return
    slot := Integer(m[1])
    vibration := Buffer(4, 0)
    NumPut("UShort", 40000, vibration, 0), NumPut("UShort", 40000, vibration, 2)
    try {
        DllCall("xinput1_4\XInputSetState", "UInt", slot, "Ptr", vibration, "UInt")
        SetTimer(() => DllCall("xinput1_4\XInputSetState", "UInt", slot, "Ptr", Buffer(4, 0), "UInt"), -500)
    }
}

; Rename: the ASCS name, and Windows' per-user game controller name (shown
; by the Game Controllers panel and DirectInput games). No admin rights are
; needed; an empty name restores the defaults. Payload: "VVVV:PPPP|name".
RenameController(content) {
    global ASCS_SettingsFile
    try {
        parts := StrSplit(content, "|", , 2)
        if (parts.Length != 2)
            throw Error("Invalid rename request.")
        key := ValidateControllerKey(parts[1])
        name := ValidateControllerName(parts[2])
        oem := "HKCU\System\CurrentControlSet\Control\MediaProperties\PrivateProperties\Joystick\OEM\VID_"
            . SubStr(key, 1, 4) "&PID_" SubStr(key, 6, 4)
        if (name = "") {
            try IniDelete(ASCS_SettingsFile, "Controllers", StrReplace(key, ":", "_"))
            try RegDelete(oem, "OEMName")
        } else {
            IsReceiverKey(key, Integer("0x" SubStr(key, 1, 4)))   ; remember before the name changes
            IniWrite(name, ASCS_SettingsFile, "Controllers", StrReplace(key, ":", "_"))
            RegWrite(name, "REG_SZ", oem, "OEMName")
        }
        RecordActivity("system", name = "" ? "Controller name reset" : "Controller renamed “" name "”")
        SendToFrontend('{"type":"notice","message":' JsonQuote(name = "" ? "Controller name reset." : "Renamed in Maestro and in Windows' game controller list.") '}')
        SendGamesLive()
    } catch as err {
        SendToFrontend('{"type":"notice","message":' JsonQuote(err.Message) '}')
    }
}

; The Bluetooth name needs administrator rights, so ASCS opens Windows'
; Devices and Printers, where the controller's Properties > Bluetooth tab
; renames it.
OpenBluetoothRename() {
    Run("explorer.exe shell:::{A8A91A66-3A7D-4424-8D24-04E180695C7A}")
}

; What is being played right now, as a list of Maps (emulator, title, id for
; Steam, since). Also keeps ASCS_PlaySessions current, so Now playing can
; show how long the session has run. Called by the Games tab's live poll and
; every 10 s by TrackPlaySessions (a few process checks and window titles).
CurrentlyPlaying(running := 0) {
    global ASCS_GameIndex, ASCS_PlaySessions
    if !IsObject(running)
        running := RunningGameApps()
    now := DateDiff(A_NowUTC, "19700101000000", "Seconds")
    playing := []
    seen := Map()
    Observe(source, owner, title, startedFn) {
        global ASCS_PlaySessions
        previous := ASCS_PlaySessions.Has(source) ? ASCS_PlaySessions[source] : 0
        started := (IsObject(previous) && previous["owner"] = owner) ? 0 : startedFn()
        since := PlaySessionSince(previous, owner, title, now, started)
        ASCS_PlaySessions[source] := Map("owner", owner, "title", title, "since", since)
        seen[source] := true
        return since
    }
    for name in ["retroarch", "dolphin", "pcsx2"] {
        if !running[name]
            continue
        exe := GameProcessName(name)
        pid := ProcessExist(exe)
        title := EmulatorWindowTitle(name, exe)
        if (name = "retroarch")
            title := RetroArchPlayingTitle(pid, title)
        ; Timed by the game's name, not the raw title, so a changing FPS
        ; counter or window title doesn't restart the session.
        since := Observe(name, pid, EmulatorGameName(name, title), () => ProcessStartUnix(pid))
        playing.Push(Map("emulator", name, "title", title, "id", "", "since", since))
    }
    if (pid := ProcessExist("PsoBB.exe")) {
        title := "Phantasy Star Online: Blue Burst"
        since := Observe("pso", pid, title, () => ProcessStartUnix(pid))
        playing.Push(Map("emulator", "pso", "title", title, "id", "", "since", since))
    }
    ; Steam reports the running game's app id; the name comes from the library.
    if (appid := SteamRunningAppId()) {
        title := ASCS_GameIndex.Has("st:" appid) ? ASCS_GameIndex["st:" appid]["title"] : "App " appid
        since := Observe("steam", appid, title, () => 0)
        playing.Push(Map("emulator", "steam", "title", title, "id", "st:" appid, "since", since))
    }
    for source in [ASCS_PlaySessions*]          ; copy of the keys: forget what stopped
        if !seen.Has(source)
            ASCS_PlaySessions.Delete(source)
    return playing
}

; RetroArch's title with its game (1.9.1): from the command line it was started
; with (read once per process), else its history and the core in its title
; (read again only when the title or the history changes).
RetroArchPlayingTitle(pid, title) {
    static knownPid := 0, fromCommand := "", coreSeen := false, historyKey := "", fromHistory := ""
    if (pid != knownPid) {
        knownPid := pid
        fromCommand := "", coreSeen := false, historyKey := "", fromHistory := ""
        try {
            for found in ComObjGet("winmgmts:").ExecQuery("Select CommandLine from Win32_Process where ProcessId=" Integer(pid))
                fromCommand := RetroArchContentFromCommandLine(String(found.CommandLine))
        } catch as err {
            WriteLog("RetroArch command line: " err.Message)
        }
        if (fromCommand = "")
            WriteLog("RetroArch started without a game; window title: " title)
    }
    if (fromCommand != "") {
        fromCommand := RetroArchKeptGame(fromCommand, coreSeen, title)
        coreSeen := coreSeen || RetroArchShowsCore(title)
        if (fromCommand != "")
            return RetroArchTitleWithGame(title, fromCommand)
        WriteLog("RetroArch closed the game it started with; window title: " title)
    }
    try {
        SplitPath(ProcessGetPath(pid), , &folder)
        history := folder "\playlists\builtin\content_history.lpl"
        key := StrSplit(title, "||")[1] "|" FileGetTime(history, "M")
        if (key != historyKey) {
            historyKey := key
            fromHistory := RetroArchGameFromHistory(ParseRetroArchHistory(FileRead(history, "UTF-8")), title)
        }
    } catch {
        fromHistory := ""       ; no history to read: it stays "At the menu"
    }
    return RetroArchTitleWithGame(title, fromHistory)
}

TrackPlaySessions() {
    try CurrentlyPlaying()
}

; A process's start time in Unix seconds; 0 if it can't be read.
ProcessStartUnix(pid) {
    if !pid
        return 0
    handle := DllCall("OpenProcess", "UInt", 0x1000, "Int", false, "UInt", pid, "Ptr")   ; PROCESS_QUERY_LIMITED_INFORMATION
    if !handle
        return 0
    created := Buffer(8, 0), exited := Buffer(8, 0), kernel := Buffer(8, 0), user := Buffer(8, 0)
    ok := DllCall("GetProcessTimes", "Ptr", handle, "Ptr", created, "Ptr", exited, "Ptr", kernel, "Ptr", user, "Int")
    DllCall("CloseHandle", "Ptr", handle)
    if !ok
        return 0
    ; FILETIME: 100 ns intervals since 1601-01-01 UTC.
    return (NumGet(created, 0, "Int64") - 116444736000000000) // 10000000
}

SendGamesLive() {
    running := RunningGameApps()
    playing := ""
    for item in CurrentlyPlaying(running)
        playing .= (playing = "" ? "" : ",") '{"emulator":' JsonQuote(item["emulator"]) ',"title":' JsonQuote(item["title"])
            . (item["id"] != "" ? ',"id":' JsonQuote(item["id"]) : "") ',"since":' item["since"] '}'
    apps := ""
    for name, state in running
        apps .= (apps = "" ? "" : ",") JsonQuote(name) ":" (state ? "true" : "false")
    SendToFrontend('{"type":"gamesLive","playing":[' playing '],"apps":{' apps '},"controllers":' ControllerJson() '}')
}

; ---- RetroAchievements (opt-in through a local secrets file)
; data\secrets.ini holds the user name and Web API key. data\ is excluded
; from git. The key is read only when a request is made, is never sent to
; the page or written to the log, and only two fixed retroachievements.org
; addresses are requested, at most every ten minutes.

RetroAchievementsCredentials() {
    global ASCS_SecretsFile
    if !FileExist(ASCS_SecretsFile)
        return 0
    user := Trim(IniRead(ASCS_SecretsFile, "RetroAchievements", "User", ""))
    key := Trim(IniRead(ASCS_SecretsFile, "RetroAchievements", "Key", ""))
    if (user = "" || key = "")
        return 0
    return Map("user", ValidateRetroAchievementsUser(user), "key", ValidateRetroAchievementsKey(key))
}

RetroAchievementsState() {
    try return RetroAchievementsCredentials() ? "ready" : "off"
    catch as err
        return "invalid"
}

SetupRetroAchievements() {
    global ASCS_SecretsFile
    if !FileExist(ASCS_SecretsFile) {
        FileAppend("; Maestro secrets. This file stays on this PC: the data folder is not committed to git.`r`n"
            . "; RetroAchievements: your user name, and the Web API key from`r`n"
            . "; https://retroachievements.org/settings (Authentication, Web API Key).`r`n"
            . "[RetroAchievements]`r`nUser=`r`nKey=`r`n", ASCS_SecretsFile, "UTF-8")
    }
    Run('notepad.exe "' ASCS_SecretsFile '"')
}

; Opens the user's public profile; the address is built here from the
; validated user name in secrets.ini (never from the page).
OpenRetroAchievementsProfile() {
    try {
        credentials := RetroAchievementsCredentials()
        if credentials
            Run("https://retroachievements.org/user/" UriEncode(credentials["user"]))
    } catch as err {
        WriteLog("RetroAchievements profile: " err.Message)
    }
}

FetchRetroAchievements(force := false) {
    global ASCS_RetroAchievementsAt, ASCS_RetroAchievementsCache

    try credentials := RetroAchievementsCredentials()
    catch as err {
        SendToFrontend('{"type":"retroAchievements","state":"invalid","message":' JsonQuote(err.Message) '}')
        return
    }
    if !credentials {
        SendToFrontend('{"type":"retroAchievements","state":"off"}')
        return
    }
    age := A_TickCount - ASCS_RetroAchievementsAt
    if (ASCS_RetroAchievementsCache.Count && (age < 600000 || (force && age < 60000))) {
        for kind, text in ASCS_RetroAchievementsCache
            SendRetroAchievementsText(kind, text)
        return
    }
    ASCS_RetroAchievementsAt := A_TickCount
    SendToFrontend('{"type":"retroAchievements","state":"loading"}')
    query := "z=" UriEncode(credentials["user"]) "&y=" UriEncode(credentials["key"]) "&u=" UriEncode(credentials["user"])
    HttpGetAsync("ra-summary", "https://retroachievements.org/API/API_GetUserSummary.php?" query "&g=5&a=8",
        RetroAchievementsDone.Bind("summary"))
    HttpGetAsync("ra-recent", "https://retroachievements.org/API/API_GetUserRecentlyPlayedGames.php?" query "&c=8",
        RetroAchievementsDone.Bind("recent"))
}

RetroAchievementsDone(kind, ok, result) {
    global ASCS_RetroAchievementsCache
    if !ok {
        WriteLog("RetroAchievements " kind " unavailable: " result)
        message := InStr(result, "HTTP 401") || InStr(result, "HTTP 403")
            ? "RetroAchievements rejected the user name or key in data\secrets.ini."
            : "RetroAchievements is unavailable right now (" result ")."
        SendToFrontend('{"type":"retroAchievements","state":"error","message":' JsonQuote(message) '}')
        return
    }
    ASCS_RetroAchievementsCache[kind] := result
    SendRetroAchievementsText(kind, result)
}

; ---- the achievement browser (1.9.0)
; One game's achievements (API_GetGameInfoAndUserProgress, with the user's
; unlocks) and the last 30 days of unlocks (API_GetUserRecentAchievements),
; from the same site with the same key, fetched only when the page asks and
; kept for 10 minutes (a refresh can't ask again within a minute). The game
; ID is validated (ValidateRaGameId); the address is built here.
FetchRaGame(content) {
    try {
        force := SubStr(content, 1, 8) = "refresh:"
        id := ValidateRaGameId(force ? SubStr(content, 9) : content)
        credentials := RetroAchievementsCredentials()
    } catch as err {
        SendToFrontend('{"type":"raExtra","kind":"game:","ok":false,"message":' JsonQuote(err.Message) '}')
        return
    }
    if credentials
        FetchRaCached("game:" id, "API_GetGameInfoAndUserProgress.php", "&g=" id "&a=1", credentials, force)
}

FetchRaUnlocks(force := false) {
    try credentials := RetroAchievementsCredentials()
    catch
        return
    if credentials
        FetchRaCached("unlocks", "API_GetUserRecentAchievements.php", "&m=43200", credentials, force)
}

; The awards on the user's profile (1.11.0), for the site badges.
FetchRaAwards(force := false) {
    try credentials := RetroAchievementsCredentials()
    catch
        return
    if credentials
        FetchRaCached("awards", "API_GetUserAwards.php", "", credentials, force)
}

FetchRaCached(kind, endpoint, params, credentials, force := false) {
    global ASCS_RaExtraCache
    if ASCS_RaExtraCache.Has(kind) {
        age := A_TickCount - ASCS_RaExtraCache[kind]["at"]
        if (age < 600000 && !(force && age >= 60000)) {
            SendRetroAchievementsText(kind, ASCS_RaExtraCache[kind]["text"])
            return
        }
    }
    query := "z=" UriEncode(credentials["user"]) "&y=" UriEncode(credentials["key"]) "&u=" UriEncode(credentials["user"]) params
    HttpGetAsync("ra-" kind, "https://retroachievements.org/API/" endpoint "?" query, RaCachedDone.Bind(kind))
}

RaCachedDone(kind, ok, result) {
    global ASCS_RaExtraCache
    if !ok {
        WriteLog("RetroAchievements " kind " unavailable: " result)
        SendToFrontend('{"type":"raExtra","kind":' JsonQuote(kind) ',"ok":false,"message":' JsonQuote("RetroAchievements is unavailable right now (" result ").") '}')
        return
    }
    ; At most 30 kept; the oldest goes first.
    if (!ASCS_RaExtraCache.Has(kind) && ASCS_RaExtraCache.Count >= 30) {
        oldest := "", at := A_TickCount
        for name, entry in ASCS_RaExtraCache
            if (entry["at"] <= at)
                oldest := name, at := entry["at"]
        ASCS_RaExtraCache.Delete(oldest)
    }
    ASCS_RaExtraCache[kind] := Map("at", A_TickCount, "text", result)
    SendRetroAchievementsText(kind, result)
}

SendRetroAchievementsText(kind, text) {
    global ASCS_App
    try ASCS_App.PostWebMessageAsString("RA`n" kind "`n" text)
}

; ---- a small asynchronous HTTPS GET for fixed addresses
; Redirects off, certificate checks on, timeouts, and a byte cap. The URL
; is never logged (it may carry a key). onDone(ok, textOrMessage).

HttpGetAsync(name, url, onDone, maxBytes := 2000000, binary := false) {
    global ASCS_HttpRequests, ASCS_Version
    if ASCS_HttpRequests.Has(name)
        return
    try {
        request := ComObject("WinHttp.WinHttpRequest.5.1")
        request.Option[6] := false
        request.SetTimeouts(5000, 5000, 10000, 15000)
        request.Open("GET", url, true)
        ; A generic client name, as every request Maestro makes uses.
        request.SetRequestHeader("User-Agent", "Maestro/" ASCS_Version " (Aeolionware)")
        request.SetRequestHeader("Accept", binary ? "image/png" : "application/json")
        request.Send()
        ASCS_HttpRequests[name] := Map("request", request, "started", A_TickCount, "done", onDone, "max", maxBytes, "binary", binary)
        SetTimer(PollHttpRequests, 250)
    } catch as err {
        onDone(false, "request failed")
    }
}

PollHttpRequests() {
    global ASCS_HttpRequests
    names := []
    for name in ASCS_HttpRequests
        names.Push(name)
    for name in names {
        entry := ASCS_HttpRequests[name]
        try {
            if !entry["request"].WaitForResponse(0) {
                if (A_TickCount - entry["started"] < 30000)
                    continue
                try entry["request"].Abort()
                throw Error("timed out")
            }
            ASCS_HttpRequests.Delete(name)
            request := entry["request"]
            if (request.Status != 200)
                throw Error("HTTP " request.Status)
            if entry["binary"] {
                entry["done"](true, HttpResponseBytes(request, entry["max"]))
                continue
            }
            text := HttpResponseText(request, entry["max"])
            if !RegExMatch(text, "^\s*[\{\[][\s\S]*[\}\]]\s*$")
                throw Error("unexpected response")
            entry["done"](true, text)
        } catch as err {
            if ASCS_HttpRequests.Has(name)
                ASCS_HttpRequests.Delete(name)
            entry["done"](false, err.Message)
        }
    }
    if !ASCS_HttpRequests.Count
        SetTimer(PollHttpRequests, 0)
}

; Decodes a response body as UTF-8 from its raw bytes, after a size check.
HttpResponseText(request, maxBytes) {
    body := request.ResponseBody
    size := body.MaxIndex() + 1
    if (size > maxBytes)
        throw Error("response too large")
    ; SAFEARRAY.pvData sits after cDims, fFeatures, cbElements and cLocks.
    return StrGet(NumGet(ComObjValue(body), 8 + A_PtrSize, "Ptr"), size, "UTF-8")
}

; The response body as a Buffer of bytes, after a size check.
HttpResponseBytes(request, maxBytes) {
    body := request.ResponseBody
    size := body.MaxIndex() + 1
    if (size <= 0 || size > maxBytes)
        throw Error("response too large or empty")
    bytes := Buffer(size)
    DllCall("RtlMoveMemory", "Ptr", bytes, "Ptr", NumGet(ComObjValue(body), 8 + A_PtrSize, "Ptr"), "UPtr", size)
    return bytes
}

; ---- RetroAchievements images (badges, game icons and the user's picture)
; The page asks by token ("b:250336", "i:066043", "u:Name"); ASCS validates it,
; builds the media.retroachievements.org address itself, and keeps each image in
; data\ra-images. Badges and icons never change, so each is downloaded once. A
; user can change their picture, so that one is checked again after a week, with
; the cached copy shown meanwhile and kept if the check fails. Only PNGs under
; 256 KB are kept. At most four downloads run at once; cached images are sent
; one per tick.

SendRaImages(content) {
    global ASCS_RaImageQueue
    for token in StrSplit(content, ",") {
        if (A_Index > 30)
            break
        try {
            RetroAchievementsImage(token)       ; validates
            ASCS_RaImageQueue.Push(token)
        }
    }
    if ASCS_RaImageQueue.Length
        SetTimer(PumpRaImages, 20)
}

PumpRaImages() {
    global ASCS_RaImageQueue, ASCS_RaImageFolder, ASCS_HttpRequests
    if !ASCS_RaImageQueue.Length {
        SetTimer(PumpRaImages, 0)
        return
    }
    token := ASCS_RaImageQueue[1]
    image := RetroAchievementsImage(token)
    path := ASCS_RaImageFolder "\" image["file"]
    if FileExist(path) {
        ASCS_RaImageQueue.RemoveAt(1)
        isPicture := SubStr(token, 1, 2) = "u:"
        recheck := false
        try {
            if isPicture
                recheck := DateDiff(A_Now, FileGetTime(path, "M"), "Days") >= 7
            ; Mark it as recently used (at most once a day), for the cache cap.
            else if (SubStr(FileGetTime(path, "M"), 1, 8) != SubStr(A_Now, 1, 8))
                FileSetTime(A_Now, path, "M")
        }
        SendRaImage(token, path)
        if (recheck && !ASCS_HttpRequests.Has("raimage " token))
            HttpGetAsync("raimage " token, image["url"], RaImageDownloaded.Bind(token, path), 262144, true)
        return
    }
    downloads := 0
    for name in ASCS_HttpRequests
        if (SubStr(name, 1, 7) = "raimage")
            downloads++
    if (downloads >= 4)
        return                                  ; wait for a free slot
    ASCS_RaImageQueue.RemoveAt(1)
    if ASCS_HttpRequests.Has("raimage " token)
        return
    HttpGetAsync("raimage " token, image["url"], RaImageDownloaded.Bind(token, path), 262144, true)
}

; Preferences' Check now: the picture for the name in secrets.ini, fetched again
; whatever its age. A failure leaves the cached copy in place.
RefreshRaPicture() {
    global ASCS_RaImageFolder, ASCS_HttpRequests
    tell := message => SendToFrontend('{"type":"raPicture","message":' JsonQuote(message) '}')
    try {
        credentials := RetroAchievementsCredentials()
        if !credentials {
            tell("Set up RetroAchievements first.")
            return
        }
        token := "u:" credentials["user"]
        image := RetroAchievementsImage(token)
    } catch {
        tell("The RetroAchievements user name isn't valid.")
        return
    }
    if ASCS_HttpRequests.Has("raimage " token) {
        tell("Already checking for a new profile picture.")
        return
    }
    HttpGetAsync("raimage " token, image["url"], RaPictureChecked.Bind(token, ASCS_RaImageFolder "\" image["file"]), 262144, true)
}

RaPictureChecked(token, path, ok, result) {
    saved := RaImageDownloaded(token, path, ok, result)
    SendToFrontend('{"type":"raPicture","message":' JsonQuote(saved ? "Profile picture is up to date." : "Couldn't get the picture, so the one you have stays.") '}')
}

; Returns whether the image was saved.
RaImageDownloaded(token, path, ok, result) {
    if !ok {
        WriteLog("RetroAchievements image " token " unavailable: " result)
        return false
    }
    ; Keep it only if it really is a PNG (its 8-byte signature).
    if (result.Size < 8 || NumGet(result, 0, "UInt") != 0x474E5089 || NumGet(result, 4, "UInt") != 0x0A1A0A0D) {
        WriteLog("RetroAchievements image " token " was not a PNG; discarded.")
        return false
    }
    try {
        DirCreate(ASCS_RaImageFolderPath())
        file := FileOpen(path ".tmp", "w")
        file.RawWrite(result, result.Size)
        file.Close()
        FileMove(path ".tmp", path, 1)
        SendRaImage(token, path)
        SetTimer(PruneRaImageCache, -5000)      ; once the batch settles
        return true
    } catch as err {
        WriteLog("RetroAchievements image " token " not cached: " err.Message)
        return false
    }
}

; Keeps data\ra-images under its cap. Runs shortly after downloads and once
; after start-up; deletes only files named like ASCS's own images.
PruneRaImageCache() {
    global ASCS_RaImageFolder, ASCS_RaImageCacheLimit, ASCS_RaImageCacheTarget
    if !DirExist(ASCS_RaImageFolder)
        return
    files := []
    try {
        Loop Files ASCS_RaImageFolder "\*.*", "F"
            files.Push(Map("name", A_LoopFileName, "size", A_LoopFileSize, "time", A_LoopFileTimeModified))
    } catch as err {
        WriteLog("RetroAchievements image cache not read: " err.Message)
        return
    }
    removed := 0, failed := 0
    for name in RaImagesToPrune(files, ASCS_RaImageCacheLimit, ASCS_RaImageCacheTarget) {
        try {
            FileDelete(ASCS_RaImageFolder "\" name)
            removed++
        } catch
            failed++
    }
    if (removed || failed)
        WriteLog("RetroAchievements image cache trimmed: " removed " file(s) removed" (failed ? ", " failed " could not be" : "") ".")
}

ASCS_RaImageFolderPath() {
    global ASCS_RaImageFolder
    return ASCS_RaImageFolder
}

SendRaImage(token, path) {
    global ASCS_App
    data := ReadImageAsDataUri(path)
    if (data != "")
        try ASCS_App.PostWebMessageAsString("RAIMG`n" token "`n" data)
}

