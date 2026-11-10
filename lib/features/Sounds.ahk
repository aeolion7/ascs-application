; ==========================================
; SOUNDS (1.8.0)
; ==========================================
; The Sounds view plays the user's sound library (C:\Sounds\all-windows-
; sounds-main by default). ASCS indexes it and the page asks for a sound by
; its index entry; nothing else in the folder is ever sent. Sounds are sent as
; base64 and decoded in the page (Web Audio), so the page's security policy
; needs no new sources. MIDI and WMA play through Windows instead. Leveled
; copies are written by ASCS into "ASCS Leveled" inside the library, never
; over an existing file. Windows sounds are set only for allowlisted events
; (WindowsSoundEvents) and only to WAV files in the library, with the
; original value kept so it can be restored.

LoadSoundSettings() {
    global ASCS_SettingsFile, ASCS_SoundLibrary, ASCS_AscsSoundFiles
    try ASCS_SoundLibrary := ValidateSoundLibrary(IniRead(ASCS_SettingsFile, "Sounds", "Library", ASCS_SoundLibrary))
    catch as err
        WriteLog("Sounds: " err.Message)
    reminder := ExpandEnvironment(ReadWindowsSound([".Default", "Notification.Reminder", ""])["value"])
    ASCS_AscsSoundFiles["reminder"] := reminder != "" ? reminder : A_WinDir "\Media\Windows Notify Calendar.wav"
    ASCS_AscsSoundFiles["timer"] := A_WinDir "\Media\Windows Notify System Generic.wav"
    for kind in AscsSoundLabels() {
        path := IniRead(ASCS_SettingsFile, "Sounds", AscsSoundKey(kind), "")
        if (path != "" && FileExist(path) && RegExMatch(path, "i)\.wav$"))
            ASCS_AscsSoundFiles[kind] := path
    }
    StartupSounds()     ; writes data\startup-sounds.ini for the sign-in scripts if it's missing
}

; The library index: id (path relative to the library) -> Map of its details.
; Listing the folder is quick; reading a thousand WAV headers from a cold disk
; took 4 s, so lengths come from data\sound-lengths.txt (keyed by size and
; date) and any that are missing are read in the background (FillSoundLengths).
SoundIndex(refresh := false) {
    global ASCS_SoundLibrary, ASCS_SoundIndex, ASCS_SoundLengthQueue
    static builtFor := ""
    if (!refresh && builtFor = ASCS_SoundLibrary && ASCS_SoundIndex.Count)
        return ASCS_SoundIndex
    index := Map()
    root := ASCS_SoundLibrary
    lengths := SoundLengths()
    queue := []
    if DirExist(root) {
        Loop Files root "\*.*", "FR" {
            if (index.Count >= 5000)
                break
            kind := SoundKind(A_LoopFileExt)
            if (kind = "" || InStr(A_LoopFileAttrib, "H"))
                continue
            id := SubStr(A_LoopFileFullPath, StrLen(root) + 2)
            parts := StrSplit(id, "\")
            SplitPath(A_LoopFileName, , , , &stem)
            group := ""
            Loop parts.Length - 2
                group .= (group = "" ? "" : " › ") parts[A_Index + 1]
            stamp := A_LoopFileSize "|" A_LoopFileTimeModified
            seconds := 0
            if (StrLower(A_LoopFileExt) = "wav") {
                known := lengths.Has(A_LoopFileFullPath) ? lengths[A_LoopFileFullPath] : ""
                if (known != "" && known[1] = stamp)
                    seconds := known[2]
                else
                    queue.Push(id)
            }
            index[id] := Map("id", id, "path", A_LoopFileFullPath, "era", parts.Length > 1 ? parts[1] : "",
                "group", group, "name", stem, "ext", StrLower(A_LoopFileExt), "kind", kind,
                "size", A_LoopFileSize, "seconds", seconds, "stamp", stamp)
        }
    }
    ASCS_SoundIndex := index
    builtFor := root
    ASCS_SoundLengthQueue := queue
    if queue.Length
        SetTimer(FillSoundLengths, 10)
    return index
}

; Remembered lengths: full path -> [size|modified, seconds].
SoundLengths() {
    global ASCS_SoundLengthsFile
    static lengths := 0
    if IsObject(lengths)
        return lengths
    lengths := Map()
    try {
        Loop Parse FileRead(ASCS_SoundLengthsFile, "UTF-8"), "`n", "`r" {
            fields := StrSplit(A_LoopField, "`t")
            if (fields.Length = 3 && RegExMatch(fields[3], "^\d+(\.\d+)?$"))
                lengths[fields[1]] := [fields[2], Float(fields[3])]
        }
    }
    return lengths
}

; Reads 25 missing WAV lengths per tick; when done, saves them and sends the
; library again so the lengths appear.
FillSoundLengths() {
    global ASCS_SoundIndex, ASCS_SoundLengthQueue, ASCS_SoundLengthsFile
    static header := Buffer(4096)
    lengths := SoundLengths()
    Loop 25 {
        if !ASCS_SoundLengthQueue.Length
            break
        id := ASCS_SoundLengthQueue.RemoveAt(1)
        if !ASCS_SoundIndex.Has(id)
            continue
        sound := ASCS_SoundIndex[id]
        seconds := 0
        try {
            file := FileOpen(sound["path"], "r")
            read := file.RawRead(header, 4096)
            file.Close()
            seconds := WavSeconds(header, read)
        }
        sound["seconds"] := seconds
        lengths[sound["path"]] := [sound["stamp"], seconds]
    }
    if ASCS_SoundLengthQueue.Length
        return
    SetTimer(FillSoundLengths, 0)
    text := ""
    for path, entry in lengths
        if (StrLen(text) < 2000000)
            text .= path "`t" entry[1] "`t" entry[2] "`n"
    try {
        file := FileOpen(ASCS_SoundLengthsFile ".tmp", "w", "UTF-8")
        file.Write(text)
        file.Close()
        FileMove(ASCS_SoundLengthsFile ".tmp", ASCS_SoundLengthsFile, 1)
    }
    SendSoundLibrary(false, false)
}

; refresh re-reads the folder; changed tells the page cached sounds may be
; stale (false when only lengths were filled in).
SendSoundLibrary(refresh := false, changed := true) {
    global ASCS_SoundLibrary
    t := A_TickCount
    index := SoundIndex(refresh)
    eras := Map()
    sounds := ""
    byName := ""
    for id, sound in index {
        eras[sound["era"]] := true
        ; 1.8.1: a leveled copy names the original it was made from, so the
        ; page levels that instead of the copy.
        origin := ""
        if IsLeveledCopyId(id) {
            if (byName = "")
                byName := OriginalsByName()
            path := SoundOrigin(sound["path"], byName)
            if (path != sound["path"] && InStr(path, ASCS_SoundLibrary "\") = 1)
                origin := SubStr(path, StrLen(ASCS_SoundLibrary) + 2)
        }
        sounds .= (sounds = "" ? "" : ",") '{"id":' JsonQuote(id) ',"name":' JsonQuote(sound["name"])
            . ',"era":' JsonQuote(sound["era"]) ',"group":' JsonQuote(sound["group"])
            . ',"kind":' JsonQuote(sound["kind"]) ',"ext":' JsonQuote(sound["ext"])
            . ',"size":' sound["size"] ',"seconds":' sound["seconds"]
            . (origin != "" ? ',"origin":' JsonQuote(origin) : "") '}'
    }
    eraJson := ""
    for folder in eras {
        era := ParseSoundEra(folder = "" ? "Loose sounds" : folder)
        eraJson .= (eraJson = "" ? "" : ",") '{"folder":' JsonQuote(folder) ',"year":' era["year"] ',"label":' JsonQuote(era["label"]) '}'
    }
    SendToFrontend('{"type":"soundLibrary","root":' JsonQuote(ASCS_SoundLibrary) ',"exists":' (DirExist(ASCS_SoundLibrary) ? "true" : "false")
        . ',"changed":' (changed ? "true" : "false")
        . ',"eras":[' eraJson '],"sounds":[' sounds '],"ascsSounds":' AscsSoundsJson() '}')
    if refresh
        WriteLog("Sounds: library indexed, " index.Count " sounds in " (A_TickCount - t) " ms.")
}

; The file behind an indexed sound, or throws.
IndexedSound(id) {
    index := SoundIndex()
    if (StrLen(id) > 500 || !index.Has(id))
        throw Error("That sound isn't in the library.")
    return index[id]
}

SendSound(id) {
    global ASCS_App
    try {
        sound := IndexedSound(id)
        if (sound["kind"] != "web")
            throw Error("This one plays through Windows.")
        data := FileToBase64(sound["path"], 16 * 1024 * 1024)
        ASCS_App.PostWebMessageAsString("SOUND`n" id "`n" data)
    } catch as err {
        try ASCS_App.PostWebMessageAsString("SOUND`n" id "`n")
        WriteLog("Sounds: not sent: " err.Message)
    }
}

FileToBase64(path, maxBytes) {
    size := FileGetSize(path)
    if (size <= 0 || size > maxBytes)
        throw Error("The file is empty or too large.")
    bytes := Buffer(size)
    file := FileOpen(path, "r")
    read := file.RawRead(bytes, size)
    file.Close()
    flags := 0x40000001                         ; CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF
    DllCall("Crypt32\CryptBinaryToStringW", "Ptr", bytes, "UInt", read, "UInt", flags, "Ptr", 0, "UInt*", &chars := 0)
    text := Buffer(chars * 2)
    if !DllCall("Crypt32\CryptBinaryToStringW", "Ptr", bytes, "UInt", read, "UInt", flags, "Ptr", text, "UInt*", &chars)
        throw Error("The file could not be encoded.")
    return StrGet(text, chars, "UTF-16")
}

Base64ToBuffer(text, maxBytes) {
    if !RegExMatch(text, "^[A-Za-z0-9+/]+={0,2}$")
        throw Error("The data isn't valid.")
    DllCall("Crypt32\CryptStringToBinaryW", "Str", text, "UInt", StrLen(text), "UInt", 1, "Ptr", 0, "UInt*", &size := 0, "Ptr", 0, "Ptr", 0)
    if (size <= 0 || size > maxBytes)
        throw Error("The data is empty or too large.")
    bytes := Buffer(size)
    if !DllCall("Crypt32\CryptStringToBinaryW", "Str", text, "UInt", StrLen(text), "UInt", 1, "Ptr", bytes, "UInt*", &size, "Ptr", 0, "Ptr", 0)
        throw Error("The data could not be decoded.")
    bytes.Size := size
    return bytes
}

; MIDI and WMA: Windows plays them (one at a time).
PlaySoundNative(id) {
    try {
        sound := IndexedSound(id)
        SoundPlay(sound["path"])
    } catch as err {
        SendToFrontend('{"type":"notice","message":' JsonQuote("Windows couldn't play that sound: " err.Message) '}')
    }
}

StopSoundNative() {
    try SoundPlay(A_ScriptDir "\nothing-to-play.wav")   ; playing a missing file stops the current one
}

ShowSoundFile(id) {
    try {
        sound := IndexedSound(id)
        Run('explorer.exe /select,"' sound["path"] '"')
    }
}

; Payload: id|gain dB|base64 WAV. The page made the copy (Web Audio maths);
; ASCS checks it is a WAV and writes it next to nothing it could overwrite.
SaveLeveledSound(content) {
    global ASCS_SoundLibrary
    try {
        parts := StrSplit(content, "|", , 3)
        if (parts.Length != 3)
            throw Error("The leveled copy was malformed.")
        sound := IndexedSound(parts[1])
        path := WriteLeveledCopy(sound["name"], ValidateLeveledGain(parts[2]), parts[3])
        RecordLeveledOrigin(path, SoundOrigin(sound["path"]))
        MarkLeveledCopySaved(path)
        id := SubStr(path, StrLen(ASCS_SoundLibrary) + 2)
        SendSoundLibrary(true)
        SendToFrontend('{"type":"soundSaved","id":' JsonQuote(id) '}')
    } catch as err {
        WriteLog("Sounds: leveled copy not saved: " err.Message)
        SendToFrontend('{"type":"notice","message":' JsonQuote("The leveled copy wasn't saved: " err.Message) '}')
    }
}

; Writes a leveled copy (base64 WAV, made by the page) into the library's
; ASCS Leveled folder under a new name, never over an existing file, and
; returns its path.
WriteLeveledCopy(stem, gainDb, base64) {
    global ASCS_SoundLibrary
    bytes := Base64ToBuffer(base64, 32 * 1024 * 1024)
    if (bytes.Size < 44 || StrGet(bytes, 4, "CP0") != "RIFF" || StrGet(bytes.Ptr + 8, 4, "CP0") != "WAVE")
        throw Error("The leveled copy isn't a WAV file.")
    folder := ASCS_SoundLibrary "\ASCS Leveled"
    DirCreate(folder)
    name := LeveledSoundName(stem, gainDb)
    path := folder "\" name
    n := 1
    while FileExist(path)
        path := folder "\" SubStr(name, 1, -4) " " (++n) ".wav"
    file := FileOpen(path ".tmp", "w")
    file.RawWrite(bytes, bytes.Size)
    file.Close()
    FileMove(path ".tmp", path)
    WriteLog("Sounds: saved a leveled copy, " path ".")
    RecordActivity("system", "Leveled copy saved: " name)
    return path
}

; ---- the notification level board (1.8.0)

; The WAV a sound in use plays now, from the registry or ASCS's settings.
InUseSoundPath(key) {
    global ASCS_AscsSoundFiles
    parsed := ParseInUseKey(key)
    switch parsed[1] {
        case "windows":
            path := ResolveSoundPath(ExpandEnvironment(ReadWindowsSound(WindowsSoundEvent(parsed[2]))["value"]), A_WinDir)
        case "ascs":
            path := ASCS_AscsSoundFiles[parsed[2]]
        default:
            path := StartupSoundPath(parsed[2])
    }
    if (path = "" || !RegExMatch(path, "i)\.wav$") || !FileExist(path))
        throw Error("It has no WAV file to measure.")
    return path
}

; Sends a sound in use to the page to measure (reply id "use:<key>"), or,
; for Match (1.8.1), the original it was leveled from (reply id "origin:<key>").
SendInUseSound(key, fromOrigin := false) {
    global ASCS_App
    prefix := fromOrigin ? "origin:" : "use:"
    try {
        path := InUseSoundPath(key)
        data := FileToBase64(fromOrigin ? SoundOrigin(path) : path, 16 * 1024 * 1024)
        ASCS_App.PostWebMessageAsString("SOUND`n" prefix key "`n" data)
    } catch as err {
        try ASCS_App.PostWebMessageAsString("SOUND`n" prefix key "`n")
        WriteLog("Sounds: in-use sound not sent: " err.Message)
    }
}

; Payload: target|source|gain dB|base64 WAV. Saves the page's leveled copy
; and makes the target (a Windows event, an ASCS sound or, since 1.8.1, a
; startup sound) play it. The source is what the page leveled: "origin" (the
; original behind what the target plays now, SoundOrigin), "current" (what it
; plays now) or "lib:<id>". The copy is named after it and recorded with its
; original. Restore brings back what played before ASCS first changed it.
UseLeveledSound(content) {
    global ASCS_SoundLibrary
    target := ""
    try {
        parts := StrSplit(content, "|", , 4)
        if (parts.Length != 4)
            throw Error("The leveled copy was malformed.")
        target := parts[1]
        parsed := ParseInUseKey(target)
        gain := ValidateLeveledGain(parts[3])
        if (parts[2] = "origin") {
            origin := SoundOrigin(InUseSoundPath(target))
            SplitPath(origin, , , , &stem)
        } else if (parts[2] = "current") {
            current := InUseSoundPath(target)
            origin := SoundOrigin(current)
            SplitPath(current, , , , &stem)
        } else if (SubStr(parts[2], 1, 4) = "lib:") {
            sound := IndexedSound(SubStr(parts[2], 5))
            stem := sound["name"], origin := SoundOrigin(sound["path"])
        } else {
            throw Error("The leveled copy was malformed.")
        }
        path := WriteLeveledCopy(stem, gain, parts[4])
        RecordLeveledOrigin(path, origin)
        SplitPath(path, &file)
        switch parsed[1] {
            case "windows":
                ApplyWindowsSound(WindowsSoundEvent(parsed[2]), path, file)
            case "ascs":
                ApplyAscsSound(parsed[2], path)
            default:
                ApplyStartupSound(parsed[2], path)
        }
        SendToFrontend('{"type":"soundMatched","target":' JsonQuote(target) ',"ok":true,"file":' JsonQuote(file) '}')
    } catch as err {
        WriteLog("Sounds: leveled copy not used: " err.Message)
        SendToFrontend('{"type":"soundMatched","target":' JsonQuote(target) ',"ok":false,"message":' JsonQuote(err.Message) '}')
    }
    SendWindowsSounds()
    if (InStr(target, "startup:") = 1)
        SendStartupSounds()
}

; ---- where a leveled copy came from (1.8.1)
; Each copy ASCS writes is recorded with the original it was leveled from, so
; Match levels that original again rather than the copy (no chain of gains,
; no clipping carried over) and Restore can go back to it.

RecordLeveledOrigin(copyPath, originPath) {
    global ASCS_OriginsFile
    SplitPath(copyPath, &name)
    try IniWrite(originPath, ASCS_OriginsFile, "Origins", name)
}

; Copies saved with Selected Sound › Save leveled copy are yours: they're
; never cleared away when something stops using them (RetireReplacedCopy).
MarkLeveledCopySaved(copyPath) {
    global ASCS_OriginsFile
    SplitPath(copyPath, &name)
    try IniWrite("1", ASCS_OriginsFile, "Saved", name)
}

; 1.8.1: when Match, Use as, Restore or Remove stops a sound from playing a
; leveled copy, the copy goes to the Recycle Bin, unless something else
; still plays it, a Restore would go back to it, or it was saved by hand.
; Never throws; returns the file name, or "" if it was kept.
RetireReplacedCopy(path) {
    global ASCS_OriginsFile, ASCS_SoundLibrary
    try {
        folder := ASCS_SoundLibrary "\ASCS Leveled\"
        if (path = "" || InStr(path, folder) != 1 || !IsLeveledCopyId(SubStr(path, StrLen(ASCS_SoundLibrary) + 2)) || !FileExist(path))
            return ""
        SplitPath(path, &name)
        if (IniRead(ASCS_OriginsFile, "Saved", name, "") != "")
            return ""
        if (LeveledCopyUse(path, true) != "")
            return ""
        FileRecycle(path)
        try IniDelete(ASCS_OriginsFile, "Origins", name)
        WriteLog("Sounds: replaced copy moved to the Recycle Bin, " path ".")
        SetTimer(SendSoundLibraryRefresh, -300)      ; once, after the request that replaced it
        return name
    } catch as err {
        WriteLog("Sounds: replaced copy kept (" path "): " err.Message)
        return ""
    }
}

SendSoundLibraryRefresh() => SendSoundLibrary(true)

; The original behind a sound: itself unless it's a copy in ASCS Leveled.
; Copies made before 1.8.1 have no record; for those, a library WAV outside
; ASCS Leveled with the copy's stem (LeveledStem) is used if there is one.
SoundOrigin(path, byName := "") {
    global ASCS_OriginsFile, ASCS_SoundLibrary
    if (InStr(path, ASCS_SoundLibrary "\ASCS Leveled\") != 1)
        return path
    SplitPath(path, &name)
    origin := IniRead(ASCS_OriginsFile, "Origins", name, "")
    if (origin != "" && FileExist(origin))
        return origin
    if (byName = "")
        byName := OriginalsByName()
    stem := LeveledStem(name)
    return byName.Has(stem) && FileExist(byName[stem]) ? byName[stem] : path
}

; Library WAVs that aren't leveled copies, by name (the first of each name),
; so tracing many copies doesn't scan the library once per copy.
OriginalsByName() {
    byName := Map()
    byName.CaseSense := false
    for id, sound in SoundIndex()
        if (sound["ext"] = "wav" && !IsLeveledCopyId(id) && !byName.Has(sound["name"]))
            byName[sound["name"]] := sound["path"]
    return byName
}

; ---- startup sounds (1.8.1)
; The sign-in roll (up to 8 sounds, each with a whole-percent chance, adding
; up to 100) and the shutdown sound, kept in data\startup-sounds.ini:
;   [SignIn] Count=N, 1=weight|path, ...    [Shutdown] File=path
; C:\Scripts\SignIn.ahk and Shutdown Sound.ahk read it at sign-in and
; shutdown (falling back to Windows' own XP sounds if it's missing or wrong),
; so ASCS needn't be running then.

; The first set: the library's originals, with the chances SignIn.ahk used.
StartupDefaults() {
    global ASCS_SoundLibrary
    lib := ASCS_SoundLibrary
    roll := []
    for entry in [[88, lib "\(2001) Windows XP\Windows XP Startup.wav"], [10, lib "\(2000) Windows Me\The Microsoft Sound.wav"],
            [1, lib "\(1998) Windows 98\The Microsoft Sound.wav"], [1, lib "\(1995) Windows 95\The Microsoft Sound.wav"]]
        if FileExist(entry[2])
            roll.Push(Map("weight", entry[1], "path", entry[2]))
    if !roll.Length
        roll.Push(Map("weight", 100, "path", A_WinDir "\Media\Windows XP Startup.wav"))
    total := 0
    for item in roll
        total += item["weight"]
    roll[1]["weight"] += 100 - total
    shutdown := lib "\(2001) Windows XP\Windows XP Shutdown.wav"
    return Map("signin", roll, "shutdown", FileExist(shutdown) ? shutdown : A_WinDir "\Media\Windows XP Shutdown.wav")
}

StartupSounds() {
    global ASCS_StartupFile
    if !FileExist(ASCS_StartupFile) {
        sounds := StartupDefaults()
        try WriteStartupSounds(sounds)
        catch as err
            WriteLog("Startup sounds: couldn't write " ASCS_StartupFile ": " err.Message)
        return sounds
    }
    roll := []
    try count := Integer(IniRead(ASCS_StartupFile, "SignIn", "Count", "0"))
    catch
        count := 0
    Loop Min(Max(count, 0), 8) {
        entry := ParseStartupEntry(IniRead(ASCS_StartupFile, "SignIn", A_Index, ""))
        if (entry != "")
            roll.Push(entry)
    }
    shutdown := IniRead(ASCS_StartupFile, "Shutdown", "File", "")
    if (!roll.Length || !RegExMatch(shutdown, "i)\.wav$")) {
        defaults := StartupDefaults()
        if !roll.Length
            roll := defaults["signin"]
        if !RegExMatch(shutdown, "i)\.wav$")
            shutdown := defaults["shutdown"]
    }
    return Map("signin", roll, "shutdown", shutdown)
}

; Written whole, as UTF-16 (so IniRead reads any path), then moved into place.
WriteStartupSounds(sounds) {
    global ASCS_StartupFile
    text := "; Startup sounds, written by Maestro (Sounds > Startup). Read at sign-in by`r`n"
        . "; C:\Scripts\SignIn.ahk and at shutdown by Shutdown Sound.ahk.`r`n"
        . "; Sign-in entries are chance|path; the chances add up to 100.`r`n"
        . "[SignIn]`r`nCount=" sounds["signin"].Length "`r`n"
    for index, item in sounds["signin"]
        text .= index "=" item["weight"] "|" item["path"] "`r`n"
    text .= "[Shutdown]`r`nFile=" sounds["shutdown"] "`r`n"
    DirCreate(StrReplace(ASCS_StartupFile, "\startup-sounds.ini"))
    file := FileOpen(ASCS_StartupFile ".tmp", "w", "UTF-16")
    file.Write(text)
    file.Close()
    FileMove(ASCS_StartupFile ".tmp", ASCS_StartupFile, 1)
}

; "1".."8", "shutdown" (or "add", which has none yet).
StartupSoundPath(slot) {
    sounds := StartupSounds()
    if (slot = "shutdown")
        return sounds["shutdown"]
    if (slot = "add")
        return ""
    index := Integer(slot)
    return index <= sounds["signin"].Length ? sounds["signin"][index]["path"] : ""
}

StartupSoundJson(path) {
    global ASCS_SoundLibrary
    library := ASCS_SoundLibrary
    relative := p => InStr(p, library "\") = 1 ? SubStr(p, StrLen(library) + 2) : ""
    origin := SoundOrigin(path)
    SplitPath(path, &file)
    return '"file":' JsonQuote(file) ',"id":' JsonQuote(relative(path)) ',"origin":' JsonQuote(relative(origin))
        . ',"exists":' (FileExist(path) ? "true" : "false") ',"changed":' (origin != path ? "true" : "false")
}

; The original behind a sound in the sign-in log (1.9.2). The log has held whole
; paths since 1.9.2; older lines hold a file name, found through the record of
; leveled copies or today's sign-in sounds. "" if it can't be told; never a guess
; from the name alone, since several Windows versions share one.
SignInSoundOrigin(logged) {
    global ASCS_OriginsFile, ASCS_SoundLibrary
    leveled := ASCS_SoundLibrary "\ASCS Leveled\"
    hasPath := InStr(logged, "\") > 0
    if (hasPath && InStr(logged, leveled) != 1)
        return logged
    SplitPath(logged, &name)
    origin := IniRead(ASCS_OriginsFile, "Origins", name, "")
    if (origin != "" || hasPath)
        return origin
    for item in StartupSounds()["signin"] {
        SplitPath(item["path"], &candidate)
        if (candidate = name)
            return item["path"]
    }
    return ""
}

SendStartupSounds() {
    sounds := StartupSounds()
    roll := ""
    for item in sounds["signin"]
        roll .= (roll = "" ? "" : ",") '{"weight":' item["weight"] "," StartupSoundJson(item["path"]) '}'
    SendToFrontend('{"type":"startupSounds","signin":[' roll '],"shutdown":{' StartupSoundJson(sounds["shutdown"])
        . '},"taskWarning":' JsonQuote(StartupTaskCheck()) '}')
}

; The warning for the sign-in task (1.9.1), or "" if all is well or Task
; Scheduler can't be asked. Read-only, about 20 ms; it never changes a task.
StartupTaskCheck() {
    try {
        service := ComObject("Schedule.Service")
        service.Connect()
        root := service.GetFolder("\")
    } catch as err {
        WriteLog("Startup tasks: couldn't ask Task Scheduler: " err.Message)
        return ""
    }
    present := []
    names := RetiredStartupTasks()
    names.Push(StartupSignInTask())
    for name in names {
        ; GetTask throws for a task that isn't registered.
        try {
            root.GetTask(name)
            present.Push(name)
        }
    }
    return StartupTaskWarning(present)
}

; Once, some time after ASCS starts: says so in the log and Recent Activity.
ReportStartupTasks() {
    warning := StartupTaskCheck()
    if (warning = "")
        return
    WriteLog(warning)
    RecordActivity("error", warning)
}

; Puts a WAV in a sign-in slot ("1".."8"), adds it to the roll ("add", with a
; 0% chance until the odds are set) or makes it the shutdown sound.
ApplyStartupSound(slot, path) {
    sounds := StartupSounds()
    roll := sounds["signin"]
    replaced := ""
    if (slot = "shutdown") {
        replaced := sounds["shutdown"]
        sounds["shutdown"] := path
    } else if (slot = "add") {
        if (roll.Length >= 8)
            throw Error("The sign-in roll holds up to 8 sounds.")
        for item in roll
            if (item["path"] = path)
                throw Error("That sound is already in the sign-in roll.")
        roll.Push(Map("weight", 0, "path", path))
    } else {
        index := Integer(slot)
        if (index > roll.Length)
            throw Error("That sign-in sound isn't there any more.")
        replaced := roll[index]["path"]
        roll[index]["path"] := path
    }
    WriteStartupSounds(sounds)
    WriteLog("Startup sounds: " slot " set to " path ".")
    if (replaced != path)
        RetireReplacedCopy(replaced)
}

; Payload: add|id or shutdown|id (a WAV in the library).
SetStartupSound(content) {
    try {
        parts := StrSplit(content, "|", , 2)
        if (parts.Length != 2 || !(parts[1] = "add" || parts[1] = "shutdown"))
            throw Error("Malformed request.")
        sound := IndexedSound(parts[2])
        if (sound["ext"] != "wav")
            throw Error("Startup sounds must be WAV files.")
        ApplyStartupSound(parts[1], sound["path"])
        SendToFrontend('{"type":"notice","message":' JsonQuote(parts[1] = "add"
            ? sound["name"] " joined the sign-in sounds. Give it a chance in Sounds › Startup."
            : sound["name"] " is the shutdown sound.") '}')
    } catch as err {
        SendToFrontend('{"type":"notice","message":' JsonQuote(err.Message) '}')
    }
    SendStartupSounds()
}

; Takes a sound out of the roll; its chance goes to the first one left.
RemoveStartupSound(content) {
    try {
        sounds := StartupSounds()
        roll := sounds["signin"]
        if !RegExMatch(content, "^[1-8]$") || Integer(content) > roll.Length
            throw Error("Malformed request.")
        if (roll.Length = 1)
            throw Error("Sign-in needs at least one sound.")
        removed := roll.RemoveAt(Integer(content))
        roll[1]["weight"] += removed["weight"]
        WriteStartupSounds(sounds)
        WriteLog("Startup sounds: removed " removed["path"] ".")
        RetireReplacedCopy(removed["path"])
    } catch as err {
        SendToFrontend('{"type":"notice","message":' JsonQuote(err.Message) '}')
    }
    SendStartupSounds()
}

; Payload: the chances, comma separated, in roll order (ValidateStartupOdds).
SaveStartupOdds(content) {
    try {
        sounds := StartupSounds()
        for index, weight in ValidateStartupOdds(content, sounds["signin"].Length)
            sounds["signin"][index]["weight"] := weight
        WriteStartupSounds(sounds)
    } catch as err {
        SendToFrontend('{"type":"notice","message":' JsonQuote(err.Message) '}')
    }
    SendStartupSounds()
}

; Payload: a slot ("1".."8", "shutdown") or "all": back to the original.
RestoreStartupSound(content) {
    try {
        sounds := StartupSounds()
        restored := 0, replaced := []
        for index, item in sounds["signin"] {
            if (content = "all" || content = String(index)) {
                origin := SoundOrigin(item["path"])
                if (origin != item["path"])
                    replaced.Push(item["path"]), item["path"] := origin, restored++
            }
        }
        if (content = "all" || content = "shutdown") {
            origin := SoundOrigin(sounds["shutdown"])
            if (origin != sounds["shutdown"])
                replaced.Push(sounds["shutdown"]), sounds["shutdown"] := origin, restored++
        }
        if !restored
            throw Error("Nothing to restore: those are originals.")
        WriteStartupSounds(sounds)
        for path in replaced
            RetireReplacedCopy(path)
        SendToFrontend('{"type":"notice","message":' JsonQuote(restored = 1 ? "Back to the original." : restored " sounds are back to their originals.") '}')
    } catch as err {
        SendToFrontend('{"type":"notice","message":' JsonQuote(err.Message) '}')
    }
    SendStartupSounds()
}

; ---- Windows sounds

WindowsSoundKey(event) => "HKCU\AppEvents\Schemes\Apps\" event[1] "\" event[2] "\.Current"

; The current value of an event's .Current key: Map(kind: none/sz/expand, value).
ReadWindowsSound(event) {
    kind := "none", value := ""
    try {
        Loop Reg WindowsSoundKey(event), "V" {
            if (A_LoopRegName = "") {
                kind := A_LoopRegType = "REG_EXPAND_SZ" ? "expand" : "sz"
                value := RegRead()
                break
            }
        }
    }
    return Map("kind", kind, "value", value)
}

ExpandEnvironment(text) {
    if !InStr(text, "%")
        return text
    size := DllCall("ExpandEnvironmentStringsW", "Str", text, "Ptr", 0, "UInt", 0, "UInt")
    out := Buffer(size * 2)
    DllCall("ExpandEnvironmentStringsW", "Str", text, "Ptr", out, "UInt", size, "UInt")
    return StrGet(out, "UTF-16")
}

SendWindowsSounds() {
    global ASCS_SettingsFile, ASCS_SoundLibrary
    json := ""
    for event in WindowsSoundEvents() {
        key := event[1] "/" event[2]
        current := ReadWindowsSound(event)
        path := ExpandEnvironment(current["value"])
        SplitPath(path, &file)
        inLibrary := path != "" && InStr(path, ASCS_SoundLibrary "\") = 1
        backup := IniRead(ASCS_SettingsFile, "WindowsSoundBackup", key, "")
        json .= (json = "" ? "" : ",") '{"key":' JsonQuote(key) ',"label":' JsonQuote(event[3])
            . ',"file":' JsonQuote(file) ',"id":' JsonQuote(inLibrary ? SubStr(path, StrLen(ASCS_SoundLibrary) + 2) : "")
            . ',"exists":' (path != "" && FileExist(path) ? "true" : "false")
            . ',"changed":' (backup != "" ? "true" : "false") '}'
    }
    SendToFrontend('{"type":"windowsSounds","events":[' json '],"ascsSounds":' AscsSoundsJson() '}')
}

; Payload: app/event|sound id.
SetWindowsSound(content) {
    global ASCS_SettingsFile
    try {
        parts := StrSplit(content, "|", , 2)
        if (parts.Length != 2)
            throw Error("Malformed request.")
        event := WindowsSoundEvent(parts[1])
        sound := IndexedSound(parts[2])
        if (sound["ext"] != "wav")
            throw Error("Windows plays only WAV files for its sounds.")
        ApplyWindowsSound(event, sound["path"], sound["name"])
        SendToFrontend('{"type":"notice","message":' JsonQuote(event[3] " now plays " sound["name"] ".") '}')
    } catch as err {
        SendToFrontend('{"type":"notice","message":' JsonQuote(err.Message) '}')
    }
    SendWindowsSounds()
}

; Makes a Windows event play a file, keeping what it played before ASCS
; first changed it (for Restore).
ApplyWindowsSound(event, path, name) {
    global ASCS_SettingsFile
    key := event[1] "/" event[2]
    if (IniRead(ASCS_SettingsFile, "WindowsSoundBackup", key, "") = "") {
        current := ReadWindowsSound(event)
        IniWrite(current["kind"] "|" current["value"], ASCS_SettingsFile, "WindowsSoundBackup", key)
    }
    replaced := ResolveSoundPath(ExpandEnvironment(ReadWindowsSound(event)["value"]), A_WinDir)
    RegWrite(path, "REG_SZ", WindowsSoundKey(event), "")
    WriteLog("Sounds: Windows sound " key " set to " path ".")
    RecordActivity("system", event[3] " sound: " name)
    if (replaced != path)
        RetireReplacedCopy(replaced)
}

RestoreWindowsSound(content) {
    try {
        event := WindowsSoundEvent(content)
        if !RestoreWindowsSoundValue(event)
            throw Error("Nothing to restore for " event[3] ".")
        SendToFrontend('{"type":"notice","message":' JsonQuote(event[3] " is back to its previous sound.") '}')
    } catch as err {
        SendToFrontend('{"type":"notice","message":' JsonQuote(err.Message) '}')
    }
    SendWindowsSounds()
}

; Puts back what an event played before ASCS first changed it. Returns false
; when ASCS never changed it.
RestoreWindowsSoundValue(event) {
    global ASCS_SettingsFile
    key := event[1] "/" event[2]
    backup := IniRead(ASCS_SettingsFile, "WindowsSoundBackup", key, "")
    if (backup = "")
        return false
    parts := StrSplit(backup, "|", , 2)
    replaced := ResolveSoundPath(ExpandEnvironment(ReadWindowsSound(event)["value"]), A_WinDir)
    if (parts[1] = "none") {
        try RegDelete(WindowsSoundKey(event), "")
    } else {
        RegWrite(parts.Length > 1 ? parts[2] : "", parts[1] = "expand" ? "REG_EXPAND_SZ" : "REG_SZ", WindowsSoundKey(event), "")
    }
    IniDelete(ASCS_SettingsFile, "WindowsSoundBackup", key)
    WriteLog("Sounds: Windows sound " key " restored.")
    RetireReplacedCopy(replaced)
    return true
}

; Restore all (1.8.0): every Windows event and ASCS sound that ASCS changed
; goes back to what it played before.
RestoreAllSounds() {
    restored := 0, failed := 0
    for event in WindowsSoundEvents() {
        try restored += RestoreWindowsSoundValue(event)
        catch as err {
            failed++
            WriteLog("Sounds: couldn't restore " event[3] ": " err.Message)
        }
    }
    for kind in AscsSoundLabels() {
        try restored += RestoreAscsSoundValue(kind)
        catch as err {
            failed++
            WriteLog("Sounds: couldn't restore the Maestro " kind " sound: " err.Message)
        }
    }
    if restored
        RecordActivity("system", "Sounds restored: " restored)
    message := !restored && !failed ? "Nothing to restore: Maestro hasn't changed any sounds."
        : restored " sound" (restored = 1 ? "" : "s") " restored" (failed ? "; " failed " couldn't be (see Logs)." : ".")
    SendToFrontend('{"type":"notice","message":' JsonQuote(message) '}')
    SendWindowsSounds()
}

; Deletes a leveled copy (1.8.0): only a WAV directly in the library's ASCS
; Leveled folder (IsLeveledCopyId), never one a Windows event or ASCS sound
; plays now, and to the Recycle Bin, so it can be brought back.
DeleteLeveledSound(id) {
    try {
        file := RecycleLeveledCopy(id)
        RecordActivity("system", "Leveled copy deleted: " file)
        SendSoundLibrary(true)
        SendToFrontend('{"type":"notice","message":' JsonQuote("Moved " file " to the Recycle Bin.") '}')
    } catch as err {
        WriteLog("Sounds: leveled copy not deleted: " err.Message)
        SendToFrontend('{"type":"notice","message":' JsonQuote("Not deleted: " err.Message) '}')
    }
}

; Moves one leveled copy to the Recycle Bin and returns its file name; throws
; (with the reason) for anything that isn't a leveled copy in the index, or
; one a Windows event or ASCS sound plays now.
RecycleLeveledCopy(id) {
    if !IsLeveledCopyId(id)
        throw Error("Only leveled copies in Maestro Leveled can be deleted here.")
    path := IndexedSound(id)["path"]
    if !FileExist(path)
        throw Error("It's already gone.")
    if ((reason := LeveledCopyUse(path)) != "")
        throw Error(reason)
    FileRecycle(path)
    SplitPath(path, &file)
    WriteLog("Sounds: leveled copy moved to the Recycle Bin, " path ".")
    return file
}

; What still plays a copy, as the reason not to remove it, or "". With
; backups, also a Restore that would go back to it.
LeveledCopyUse(path, backups := false) {
    global ASCS_AscsSoundFiles, ASCS_SettingsFile
    for event in WindowsSoundEvents()
        if (ResolveSoundPath(ExpandEnvironment(ReadWindowsSound(event)["value"]), A_WinDir) = path)
            return event[3] " plays it now. Restore or change that first."
    for kind, label in AscsSoundLabels()
        if (ASCS_AscsSoundFiles[kind] = path)
            return label " plays it now. Restore or change that first."
    startup := StartupSounds()
    for item in startup["signin"]
        if (item["path"] = path)
            return "The sign-in sounds use it. Restore or change that first."
    if (startup["shutdown"] = path)
        return "It's the shutdown sound. Restore or change that first."
    if backups {
        for section in ["WindowsSoundBackup", "AscsSoundBackup"] {
            lines := ""
            try lines := IniRead(ASCS_SettingsFile, section)
            Loop Parse lines, "`n", "`r" {
                value := SubStr(A_LoopField, InStr(A_LoopField, "=") + 1)
                value := SubStr(value, InStr(value, "|") + 1)
                if (value != "" && ResolveSoundPath(ExpandEnvironment(value), A_WinDir) = path)
                    return "A Restore goes back to it."
            }
        }
    }
    return ""
}

; Select › Delete (1.8.0): a batch of up to 10 ids, one per line. The page
; sends the next batch when this one's reply arrives, so ASCS never works for
; long between messages, and asks for the library once at the end. Each copy
; gets the same checks as a single Delete; one that fails is skipped with its
; reason, and the rest go ahead.
DeleteLeveledSounds(content) {
    deleted := 0, skipped := ""
    try {
        for id in ParseDeleteList(content, 10) {
            try {
                RecycleLeveledCopy(id)
                deleted++
            } catch as err {
                skipped .= (skipped = "" ? "" : ",") '{"id":' JsonQuote(id) ',"reason":' JsonQuote(err.Message) '}'
                WriteLog("Sounds: leveled copy not deleted (" id "): " err.Message)
            }
        }
        if deleted
            RecordActivity("system", "Leveled copies deleted: " deleted)
        SendToFrontend('{"type":"soundsDeleted","ok":true,"deleted":' deleted ',"skipped":[' skipped ']}')
    } catch as err {
        WriteLog("Sounds: delete request refused: " err.Message)
        SendToFrontend('{"type":"soundsDeleted","ok":false,"deleted":' deleted ',"skipped":[],"message":' JsonQuote(err.Message) '}')
    }
}

PreviewWindowsSound(content) {
    try {
        event := WindowsSoundEvent(content)
        path := ExpandEnvironment(ReadWindowsSound(event)["value"])
        if (path != "" && FileExist(path) && RegExMatch(path, "i)\.wav$"))
            SoundPlay(path)
    }
}

; ---- ASCS's own show/hide sounds, chosen from the library

AscsSoundKey(kind) => Map("show", "ShowFile", "hide", "HideFile", "reminder", "ReminderFile", "timer", "TimerFile")[kind]

AscsSoundsJson() {
    global ASCS_AscsSoundFiles, ASCS_SoundLibrary, ASCS_SettingsFile
    json := ""
    for kind in AscsSoundLabels() {
        path := ASCS_AscsSoundFiles[kind]
        SplitPath(path, &file)
        id := InStr(path, ASCS_SoundLibrary "\") = 1 ? SubStr(path, StrLen(ASCS_SoundLibrary) + 2) : ""
        changed := IniRead(ASCS_SettingsFile, "AscsSoundBackup", kind, "") != ""
        json .= (json = "" ? "" : ",") JsonQuote(kind) ':{"file":' JsonQuote(file) ',"id":' JsonQuote(id)
            . ',"exists":' (FileExist(path) ? "true" : "false") ',"changed":' (changed ? "true" : "false") '}'
    }
    return "{" json "}"
}

; Makes one of ASCS's sounds play a file, keeping the one from before ASCS
; first changed it (1.8.0, for Restore).
ApplyAscsSound(kind, path) {
    global ASCS_SettingsFile, ASCS_AscsSoundFiles
    if (IniRead(ASCS_SettingsFile, "AscsSoundBackup", kind, "") = "")
        IniWrite("file|" ASCS_AscsSoundFiles[kind], ASCS_SettingsFile, "AscsSoundBackup", kind)
    replaced := ASCS_AscsSoundFiles[kind]
    ASCS_AscsSoundFiles[kind] := path
    IniWrite(path, ASCS_SettingsFile, "Sounds", AscsSoundKey(kind))
    WriteLog("Sounds: Maestro " kind " sound set to " path ".")
    if (replaced != path)
        RetireReplacedCopy(replaced)
}

RestoreAscsSound(kind) {
    try {
        if !AscsSoundLabels().Has(kind)
            throw Error("Malformed request.")
        if !RestoreAscsSoundValue(kind)
            throw Error("Nothing to restore.")
        SendToFrontend('{"type":"notice","message":' JsonQuote(AscsSoundLabels()[kind] " sound restored.") '}')
    } catch as err {
        SendToFrontend('{"type":"notice","message":' JsonQuote(err.Message) '}')
    }
    SendWindowsSounds()
}

; Puts back the file an ASCS sound played before ASCS first changed it.
; Returns false when it was never changed.
RestoreAscsSoundValue(kind) {
    global ASCS_SettingsFile, ASCS_AscsSoundFiles
    backup := IniRead(ASCS_SettingsFile, "AscsSoundBackup", kind, "")
    if (SubStr(backup, 1, 5) != "file|")
        return false
    path := SubStr(backup, 6)
    replaced := ASCS_AscsSoundFiles[kind]
    ASCS_AscsSoundFiles[kind] := path
    IniWrite(path, ASCS_SettingsFile, "Sounds", AscsSoundKey(kind))
    IniDelete(ASCS_SettingsFile, "AscsSoundBackup", kind)
    WriteLog("Sounds: Maestro " kind " sound restored.")
    if (replaced != path)
        RetireReplacedCopy(replaced)
    return true
}

; Payload: kind|id, the kind show, hide, reminder or timer.
SetAscsSound(content) {
    global ASCS_SettingsFile, ASCS_AscsSoundFiles
    try {
        parts := StrSplit(content, "|", , 2)
        if (parts.Length != 2 || !AscsSoundLabels().Has(parts[1]))
            throw Error("Malformed request.")
        sound := IndexedSound(parts[2])
        if (sound["ext"] != "wav")
            throw Error("Maestro's own sounds must be WAV files.")
        ApplyAscsSound(parts[1], sound["path"])
        SendToFrontend('{"type":"notice","message":' JsonQuote(AscsSoundLabels()[parts[1]] " sound: " sound["name"] ".") '}')
    } catch as err {
        SendToFrontend('{"type":"notice","message":' JsonQuote(err.Message) '}')
    }
    SendWindowsSounds()
}

SetSoundLibrary(content) {
    global ASCS_SettingsFile, ASCS_SoundLibrary
    try {
        path := ValidateSoundLibrary(content)
        if !DirExist(path)
            throw Error("That folder doesn't exist.")
        ASCS_SoundLibrary := path
        IniWrite(path, ASCS_SettingsFile, "Sounds", "Library")
        SendSoundLibrary(true)
    } catch as err {
        SendToFrontend('{"type":"notice","message":' JsonQuote(err.Message) '}')
    }
}

