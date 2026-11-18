; ==========================================
; THE CONSOLE HUB (2.9.0): Games › Consoles
; ==========================================
; The Switch's payload, pushed with TegraRcmGUI's own sender (TegraRcmSmash),
; and a toast when a Switch in RCM mode is plugged in; payloads listed from
; TegraRcmGUI's favorites and a folder you choose; console SD cards
; recognized as they're inserted, with their free space, the versions their
; files record, a copy of their small config files in data\consoles, and the
; Switch's album copied to Pictures\Switch on request. Nothing here uses the
; network: release pages open in the browser. Settings are in data\consoles.ini.

global ASCS_ConsolesFile := ASCS_DataDir "\consoles.ini"
global ASCS_ConsolesDir := ASCS_DataDir "\consoles"
global ASCS_TegraDir := EnvGet("ProgramFiles(x86)") "\TegraRcmGUI"
global ASCS_RcmPresent := false
global ASCS_RcmNotify := 0
global ASCS_Payloads := []
global ASCS_PayloadVersions := Map()      ; path|size|time -> hekate version, read once
global ASCS_PushJob := 0
global ASCS_ConsoleCards := Map()
global ASCS_AlbumJob := 0
global ASCS_ConsoleLinks := Map(
    "hekate", "https://github.com/CTCaer/hekate/releases",
    "atmosphere", "https://github.com/Atmosphere-NX/Atmosphere/releases",
    "luma", "https://github.com/LumaTeam/Luma3DS/releases",
    "aroma", "https://aroma.foryour.cafe/")
global ASCS_ConsoleKinds := ["switch", "3ds", "wiiu"]

SetTimer(StartConsoles, -30000)             ; off the start-up path

StartConsoles() {
    global ASCS_App, ASCS_RcmNotify, ASCS_RcmPresent
    OnMessage(0x219, ConsolesDeviceChange)  ; WM_DEVICECHANGE
    ; Windows tells every window when a drive arrives or goes; a device's
    ; arrival (a Switch in RCM mode) only to a window that asks. This asks for
    ; every kind of device interface, and ConsolesDeviceChange picks the Switch out.
    try {
        filter := Buffer(32, 0)             ; DEV_BROADCAST_DEVICEINTERFACE_W without its name
        NumPut("UInt", 32, filter, 0)       ; dbcc_size
        NumPut("UInt", 5, filter, 4)        ; DBT_DEVTYP_DEVICEINTERFACE
        ; DEVICE_NOTIFY_WINDOW_HANDLE (0) | DEVICE_NOTIFY_ALL_INTERFACE_CLASSES (4)
        ASCS_RcmNotify := DllCall("User32\RegisterDeviceNotificationW", "Ptr", ASCS_App.Hwnd, "Ptr", filter, "UInt", 4, "Ptr")
        if !ASCS_RcmNotify
            WriteLog("Console hub: device notifications not registered (" A_LastError ").")
    } catch as err {
        WriteLog("Console hub: device notifications not registered: " err.Message)
    }
    OnExit(StopConsoles)
    ASCS_RcmPresent := RcmDeviceConnected()
    ScanConsoleCards()
}

StopConsoles(*) {
    global ASCS_RcmNotify
    if ASCS_RcmNotify
        try DllCall("User32\UnregisterDeviceNotification", "Ptr", ASCS_RcmNotify)
    ASCS_RcmNotify := 0
}

; Once, at start: whether a Switch in RCM mode is already plugged in.
RcmDeviceConnected() {
    try {
        for device in ComObjGet("winmgmts:").ExecQuery("Select DeviceID from Win32_PnPEntity where DeviceID like '%VID_0955&PID_7321%'")
            return true
    }
    return false
}

ConsolesDeviceChange(wParam, lParam, msg, hwnd) {
    global ASCS_RcmPresent
    if !(wParam = 0x8000 || wParam = 0x8004) || !lParam   ; DBT_DEVICEARRIVAL, DBT_DEVICEREMOVECOMPLETE
        return
    arrived := wParam = 0x8000
    kind := NumGet(lParam, 4, "UInt")
    if (kind = 5) {                                         ; a device interface
        name := StrGet(lParam + 28, 260, "UTF-16")
        if !InStr(name, "vid_0955&pid_7321")
            return
        if (arrived = ASCS_RcmPresent)
            return
        ASCS_RcmPresent := arrived
        SetTimer(arrived ? RcmArrived : SendConsoles, -1)
    } else if (kind = 2) {                                  ; a volume
        SetTimer(ScanConsoleCards, arrived ? -1500 : -200)
    }
}

RcmArrived() {
    global ASCS_ConsolesFile
    SendConsoles()
    auto := IniRead(ASCS_ConsolesFile, "Payloads", "AutoPush", "0") = "1"
    chosen := ChosenPayload()
    if (auto && chosen != "") {
        PushPayload(chosen, true)
        return
    }
    ShowNotice("A Switch in RCM mode is connected. Push a payload from Games › Consoles.")
}

; ---- payloads

ChosenPayload() {
    global ASCS_ConsolesFile
    path := IniRead(ASCS_ConsolesFile, "Payloads", "Selected", "")
    return IsSafePayloadPath(path) && FileExist(path) ? path : ""
}

BuildPayloads() {
    global ASCS_Payloads, ASCS_TegraDir, ASCS_ConsolesFile, ASCS_PayloadVersions
    found := [], seen := Map()
    seen.CaseSense := false
    add(path) {
        global ASCS_PayloadVersions
        if (path = "" || seen.Has(path) || found.Length >= 40 || !IsSafePayloadPath(path))
            return
        attrs := FileExist(path)
        if (attrs = "" || InStr(attrs, "D"))
            return
        seen[path] := true
        try {
            size := FileGetSize(path)
            time := FileGetTime(path, "M")
        } catch
            return
        if (size < 16 || size > 1048576)
            return
        key := path "|" size "|" time
        if !ASCS_PayloadVersions.Has(key) {
            version := ""
            try version := HekateVersion(FileRead(path, "RAW"))
            ASCS_PayloadVersions[key] := version
        }
        SplitPath(path, &name, &folder)
        found.Push(Map("path", path, "name", name, "folder", folder, "size", size, "time", time, "version", ASCS_PayloadVersions[key]))
    }
    appData := EnvGet("APPDATA") "\TegraRcmGUI"
    try add(ParseTegraPreset(FileRead(appData "\presets.conf")))
    try {
        for path in ParseTegraFavorites(FileRead(appData "\favorites.conf"), ASCS_TegraDir)
            add(path)
    }
    try {
        Loop Files ASCS_TegraDir "\favorites\*.bin", "F"
            add(A_LoopFileFullPath)
    }
    folder := IniRead(ASCS_ConsolesFile, "Payloads", "Folder", "")
    if (folder != "" && InStr(FileExist(folder), "D")) {
        try {
            Loop Files folder "\*.bin", "F"
                add(A_LoopFileFullPath)
        }
    }
    ASCS_Payloads := found
}

PushPayload(path, auto := false) {
    global ASCS_PushJob, ASCS_TegraDir, ASCS_ConsolesDir
    if IsObject(ASCS_PushJob)
        return
    exe := ASCS_TegraDir "\TegraRcmSmash.exe"
    if !FileExist(exe) {
        PushFinished(Map("ok", false, "message", "TegraRcmGUI isn't installed in " ASCS_TegraDir ", so there's no sender."), "")
        return
    }
    if !IsSafePayloadPath(path) || !FileExist(path) {
        PushFinished(Map("ok", false, "message", "That payload isn't there anymore."), "")
        return
    }
    SplitPath(path, &name)
    out := ASCS_ConsolesDir "\push-output.txt"
    code := ASCS_ConsolesDir "\push-code.txt"
    try {
        DirCreate(ASCS_ConsolesDir)
        if FileExist(out)
            FileDelete(out)
        if FileExist(code)
            FileDelete(code)
        ; Through cmd, to learn the sender's exit code: !errorlevel! is read
        ; after it ends. The path has none of cmd's characters (IsSafePayloadPath).
        Run(A_ComSpec ' /d /v:on /s /c ""' exe '" "' path '" > "' out '" 2>&1 & echo !errorlevel!> "' code '""', ASCS_TegraDir, "Hide", &pid)
    } catch as err {
        PushFinished(Map("ok", false, "message", "The sender couldn't start: " err.Message), name)
        return
    }
    ; Without a process to watch, ProcessExist would answer for Maestro itself.
    if !IsInteger(pid ?? "") || pid <= 0 {
        PushFinished(Map("ok", false, "message", "The sender didn't start."), name)
        return
    }
    ASCS_PushJob := Map("pid", pid, "started", A_TickCount, "name", name, "auto", auto, "out", out, "code", code)
    SetTimer(PollPushJob, 250)
    SendConsoles()
}

PollPushJob(*) {
    global ASCS_PushJob
    job := ASCS_PushJob
    if !IsObject(job) {
        SetTimer(PollPushJob, 0)
        return
    }
    if ProcessExist(job["pid"]) {
        if (A_TickCount - job["started"] < 20000)
            return
        try ProcessClose(job["pid"])
        PushFinished(Map("ok", false, "message", "The sender didn't finish within 20 seconds, so it was stopped."), job["name"])
        return
    }
    exitCode := ""
    output := ""
    try exitCode := Trim(FileRead(job["code"]), " `t`r`n")
    try output := FileRead(job["out"], "UTF-16")
    PushFinished(RcmPushResult(RegExMatch(exitCode, "^-?\d+$") ? Integer(exitCode) : "unknown", output), job["name"])
}

PushFinished(result, name) {
    global ASCS_PushJob
    SetTimer(PollPushJob, 0)
    auto := IsObject(ASCS_PushJob) && ASCS_PushJob["auto"]
    ASCS_PushJob := 0
    message := result["ok"] ? (name != "" ? name " sent to the Switch" (auto ? " as it was plugged in." : ".") : result["message"]) : result["message"]
    WriteLog("Payload push: " (result["ok"] ? "sent " name : "failed: " result["message"]))
    RecordActivity(result["ok"] ? "system" : "error", result["ok"] ? "Payload sent: " name : "Payload not sent")
    ShowNotice(message)
    SendToFrontend('{"type":"payloadPushed","ok":' (result["ok"] ? "true" : "false") ',"message":' JsonQuote(message) '}')
    SendConsoles()
}

; The page asked for a payload's bytes, to show its SHA-256 (the page hashes them).
SendPayloadBytes(index) {
    global ASCS_Payloads
    if (index < 1 || index > ASCS_Payloads.Length)
        return
    path := ASCS_Payloads[index]["path"]
    data := FileBase64(path, 1048576)
    SendToFrontend('{"type":"payloadBytes","index":' index ',"size":' ASCS_Payloads[index]["size"] ',"time":' JsonQuote(ASCS_Payloads[index]["time"]) ',"data":' JsonQuote(data) '}')
}

FileBase64(path, maxBytes) {
    try {
        if (FileGetSize(path) > maxBytes)
            return ""
        bytes := FileRead(path, "RAW")
        flags := 0x40000001                 ; CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF
        DllCall("Crypt32\CryptBinaryToStringW", "Ptr", bytes, "UInt", bytes.Size, "UInt", flags, "Ptr", 0, "UInt*", &chars := 0)
        text := Buffer(chars * 2)
        if !DllCall("Crypt32\CryptBinaryToStringW", "Ptr", bytes, "UInt", bytes.Size, "UInt", flags, "Ptr", text, "UInt*", &chars)
            return ""
        return StrGet(text, chars, "UTF-16")
    }
    return ""
}

; content: the payload's place in the list, or 0 for none; then 1 or 0 for
; pushing it as a Switch in RCM mode is plugged in.
SetPayloadChoice(content) {
    global ASCS_Payloads, ASCS_ConsolesFile
    parts := StrSplit(content, "|")
    index := Integer(parts[1])
    path := index >= 1 && index <= ASCS_Payloads.Length ? ASCS_Payloads[index]["path"] : ""
    try {
        IniWrite(path, ASCS_ConsolesFile, "Payloads", "Selected")
        IniWrite(path != "" && parts[2] = "1" ? "1" : "0", ASCS_ConsolesFile, "Payloads", "AutoPush")
    } catch as err {
        WriteLog("Console hub settings not saved: " err.Message)
    }
    SendConsoles()
}

ChoosePayloadFolder(*) {
    global ASCS_App, ASCS_ConsolesFile
    try ASCS_App.Opt("+OwnDialogs")
    current := IniRead(ASCS_ConsolesFile, "Payloads", "Folder", "")
    picked := DirSelect(current != "" ? "*" current : "", 0, "Choose the folder that holds your Switch payloads (.bin)")
    if (picked = "" || !InStr(FileExist(picked), "D"))
        return
    try IniWrite(picked, ASCS_ConsolesFile, "Payloads", "Folder")
    SendConsoles(true)
}

; ---- SD cards

ScanConsoleCards(*) {
    global ASCS_ConsoleCards
    cards := Map()
    drives := ""
    try drives := DriveGetList("REMOVABLE")
    loop parse drives {
        letter := A_LoopField
        root := letter ":\"
        try {
            if (DriveGetStatus(root) != "Ready")
                continue
        } catch
            continue
        kind := ConsoleOfCard((name) => InStr(FileExist(root name), "D") > 0)
        if (kind = "")
            continue
        card := Map("drive", letter, "kind", kind, "label", "", "free", 0, "total", 0, "versions", ConsoleCardVersions(root, kind), "copied", 0)
        try card["label"] := DriveGetLabel(root)
        try card["free"] := DriveGetSpaceFree(root)
        try card["total"] := DriveGetCapacity(root)
        ; Its config files are copied once each time it's inserted.
        card["copied"] := ASCS_ConsoleCards.Has(letter) && ASCS_ConsoleCards[letter]["kind"] = kind ? ASCS_ConsoleCards[letter]["copied"] : BackupConsoleConfigs(root, kind)
        cards[letter] := card
    }
    ASCS_ConsoleCards := cards
    SendConsoles()
}

; What the card's own files say: hekate's version from bootloader\update.bin,
; Luma3DS's from boot.firm, and whether Aroma is there.
ConsoleCardVersions(root, kind) {
    found := []
    try {
        if (kind = "switch") {
            if FileExist(root "bootloader\update.bin") && FileGetSize(root "bootloader\update.bin") <= 4194304
                found.Push(["hekate", HekateVersion(FileRead(root "bootloader\update.bin", "RAW"))])
            if InStr(FileExist(root "atmosphere"), "D")
                found.Push(["Atmosphère", ""])
        } else if (kind = "3ds") {
            if FileExist(root "boot.firm") && FileGetSize(root "boot.firm") <= 4194304
                found.Push(["Luma3DS", LumaVersion(FileRead(root "boot.firm", "RAW"))])
        } else if (kind = "wiiu") {
            if InStr(FileExist(root "wiiu\environments\aroma"), "D")
                found.Push(["Aroma", ""])
        }
    }
    return found
}

ConsoleConfigFiles(root, kind) {
    files := []
    if (kind = "switch") {
        for name in ["bootloader\hekate_ipl.ini", "atmosphere\config\override_config.ini", "atmosphere\config\system_settings.ini"]
            files.Push(name)
    } else if (kind = "3ds") {
        files.Push("luma\config.ini")
    } else if (kind = "wiiu") {
        try {
            Loop Files root "wiiu\environments\aroma\plugins\config\*.json", "F"
                files.Push("wiiu\environments\aroma\plugins\config\" A_LoopFileName)
        }
    }
    return files
}

; Copies each config file that changed since its last copy; keeps five of
; each. Returns how many were copied.
BackupConsoleConfigs(root, kind) {
    global ASCS_ConsolesDir
    copied := 0
    folder := ASCS_ConsolesDir "\" kind
    for name in ConsoleConfigFiles(root, kind) {
        source := root name
        try {
            if !FileExist(source) || FileGetSize(source) > 262144
                continue
            SplitPath(source, , , &ext, &base)
            DirCreate(folder)
            latest := "", others := []
            Loop Files folder "\" base "-*." ext, "F" {
                others.Push(A_LoopFileName)
                if (A_LoopFileName > latest)
                    latest := A_LoopFileName
            }
            if (latest != "" && FileRead(folder "\" latest, "RAW").Size = FileGetSize(source) && FileRead(folder "\" latest) == FileRead(source))
                continue
            copyName := base "-" FormatTime(, "yyyyMMdd-HHmmss") "." ext
            FileCopy(source, folder "\" copyName, 1)
            others.Push(copyName)
            copied++
            for old in BackupsToPrune(others, 5)
                FileDelete(folder "\" old)
        } catch as err {
            WriteLog("Console hub: " name " not copied: " err.Message)
        }
    }
    if copied
        WriteLog("Console hub: " copied " config file(s) copied from " SubStr(root, 1, 2) ".")
    return copied
}

OpenConsoleCard(letter) {
    global ASCS_ConsoleCards
    if ASCS_ConsoleCards.Has(letter)
        try Run('explorer.exe "' letter ':\"')
}

OpenConsoleBackups() {
    global ASCS_ConsolesDir
    DirCreate(ASCS_ConsolesDir)
    try Run('explorer.exe "' ASCS_ConsolesDir '"')
}

OpenConsoleLink(id) {
    global ASCS_ConsoleLinks
    if ASCS_ConsoleLinks.Has(id)
        try Run(ASCS_ConsoleLinks[id])
}

; ---- the Switch's album

ConsoleAlbumFolder() {
    pictures := ""
    try pictures := RegRead("HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders", "My Pictures")
    pictures := ExpandEnvironmentText(pictures)
    if (pictures = "" || !InStr(FileExist(pictures), "D"))
        pictures := EnvGet("USERPROFILE") "\Pictures"
    return pictures "\Switch"
}

ExpandEnvironmentText(text) {
    while RegExMatch(text, "%([A-Za-z0-9_()]+)%", &m)
        text := StrReplace(text, m[0], EnvGet(m[1]))
    return text
}

ImportConsoleAlbum(letter) {
    global ASCS_ConsoleCards, ASCS_AlbumJob
    if IsObject(ASCS_AlbumJob) || !ASCS_ConsoleCards.Has(letter) || ASCS_ConsoleCards[letter]["kind"] != "switch"
        return
    root := letter ":\Nintendo\Album"
    if !InStr(FileExist(root), "D") {
        ShowNotice("This card has no album.")
        return
    }
    target := ConsoleAlbumFolder()
    files := []
    try {
        Loop Files root "\*.*", "FR" {
            place := AlbumTarget(SubStr(A_LoopFileFullPath, 4))
            if (place != "")
                files.Push([A_LoopFileFullPath, target "\" place, A_LoopFileSize])
        }
    }
    ASCS_AlbumJob := Map("files", files, "next", 1, "copied", 0, "skipped", 0, "failed", 0, "target", target, "drive", letter, "sent", 0)
    SetTimer(StepAlbumJob, 30)
    SendConsoles()
}

; A few files a turn, so Maestro stays free. Copies only: a file already
; there is skipped, and nothing on the card is changed.
StepAlbumJob(*) {
    global ASCS_AlbumJob
    job := ASCS_AlbumJob
    if !IsObject(job) {
        SetTimer(StepAlbumJob, 0)
        return
    }
    loop 6 {
        if (job["next"] > job["files"].Length)
            break
        file := job["files"][job["next"]++]
        try {
            if FileExist(file[2]) {
                job["skipped"]++
                continue
            }
            SplitPath(file[2], , &dir)
            DirCreate(dir)
            FileCopy(file[1], file[2], 0)
            job["copied"]++
        } catch {
            job["failed"]++
        }
    }
    if (job["next"] > job["files"].Length) {
        SetTimer(StepAlbumJob, 0)
        ASCS_AlbumJob := 0
        message := job["copied"] " new photo" (job["copied"] = 1 ? "" : "s") " and clip" (job["copied"] = 1 ? "" : "s") " copied to " job["target"]
            . (job["skipped"] ? ", " job["skipped"] " already there" : "") (job["failed"] ? "; " job["failed"] " couldn't be copied" : "") "."
        WriteLog("Album import: " message)
        RecordActivity(job["failed"] ? "error" : "system", "Switch album imported")
        ShowNotice(message)
        SendToFrontend('{"type":"albumImported","message":' JsonQuote(message) '}')
        SendConsoles()
        return
    }
    if (A_TickCount - job["sent"] > 1000) {
        job["sent"] := A_TickCount
        SendConsoles()
    }
}

OpenAlbumFolder() {
    folder := ConsoleAlbumFolder()
    if InStr(FileExist(folder), "D") {
        try Run('explorer.exe "' folder '"')
    } else {
        ShowNotice("Nothing has been imported yet.")
    }
}

; ---- dates you keep: when each console was last updated

SetConsoleUpdated(content) {
    global ASCS_ConsolesFile
    parts := StrSplit(content, "|")
    try IniWrite(parts[2], ASCS_ConsolesFile, "Updated", parts[1])
    SendConsoles()
}

; ---- to the page

SendConsoles(rebuild := false) {
    global ASCS_Payloads, ASCS_ConsolesFile, ASCS_TegraDir, ASCS_RcmPresent, ASCS_PushJob, ASCS_ConsoleCards, ASCS_AlbumJob, ASCS_ConsoleKinds
    if (rebuild || !ASCS_Payloads.Length)
        BuildPayloads()
    chosen := ChosenPayload()
    selected := 0
    payloads := ""
    for item in ASCS_Payloads {
        if (chosen != "" && item["path"] = chosen)
            selected := A_Index
        payloads .= (A_Index = 1 ? "" : ",") '{"name":' JsonQuote(item["name"]) ',"folder":' JsonQuote(item["folder"]) ',"size":' item["size"]
            . ',"time":' JsonQuote(item["time"]) ',"version":' JsonQuote(item["version"]) '}'
    }
    cards := ""
    for letter, card in ASCS_ConsoleCards {
        versions := ""
        for pair in card["versions"]
            versions .= (A_Index = 1 ? "" : ",") '{"name":' JsonQuote(pair[1]) ',"version":' JsonQuote(pair[2]) '}'
        cards .= (cards = "" ? "" : ",") '{"drive":' JsonQuote(letter) ',"kind":' JsonQuote(card["kind"]) ',"label":' JsonQuote(card["label"])
            . ',"free":' card["free"] ',"total":' card["total"] ',"copied":' card["copied"] ',"versions":[' versions ']}'
    }
    updated := ""
    for kind in ASCS_ConsoleKinds {
        date := IniRead(ASCS_ConsolesFile, "Updated", kind, "")
        updated .= (A_Index = 1 ? "" : ",") JsonQuote(kind) ':' JsonQuote(RegExMatch(date, "^\d{4}-\d\d-\d\d$") ? date : "")
    }
    album := IsObject(ASCS_AlbumJob)
        ? '{"running":true,"done":' (ASCS_AlbumJob["next"] - 1) ',"total":' ASCS_AlbumJob["files"].Length ',"drive":' JsonQuote(ASCS_AlbumJob["drive"]) '}'
        : '{"running":false}'
    SendToFrontend(
        '{"type":"consoles"'
        ',"sender":' (FileExist(ASCS_TegraDir "\TegraRcmSmash.exe") ? "true" : "false")
        ',"rcm":' (ASCS_RcmPresent ? "true" : "false")
        ',"pushing":' (IsObject(ASCS_PushJob) ? "true" : "false")
        ',"payloads":[' payloads ']'
        ',"selected":' selected
        ',"autoPush":' (selected && IniRead(ASCS_ConsolesFile, "Payloads", "AutoPush", "0") = "1" ? "true" : "false")
        ',"folder":' JsonQuote(IniRead(ASCS_ConsolesFile, "Payloads", "Folder", ""))
        ',"cards":[' cards ']'
        ',"updated":{' updated '}'
        ',"album":' album
        ',"albumFolder":' JsonQuote(ConsoleAlbumFolder())
        '}'
    )
}
