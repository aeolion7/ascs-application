; ==========================================
; CALENDAR (1.8.0)
; ==========================================
; The Calendar page's data lives in Radicale, a CalDAV server installed by
; tools\Install-Radicale.ps1 into data\radicale. ASCS starts it (listening on
; 127.0.0.1 only), stops it on exit, and adopts one it left running across a
; reload. The page never talks to the server and never sees its password: it
; asks for an operation, ASCS builds exactly one request (CalDavRequest in
; Core), adds the password, and returns the status, ETag and body. Reminders
; for the next three days come from the page; ASCS fires them as Windows
; notifications with the chosen reminder sound, even while hidden.

CalendarPaths() {
    global ASCS_DataDir
    dir := ASCS_DataDir "\radicale"
    return Map("dir", dir, "pythonw", dir "\venv\Scripts\pythonw.exe", "config", dir "\config", "users", dir "\users")
}

CalendarCredentials() {
    global ASCS_SecretsFile
    user := Trim(IniRead(ASCS_SecretsFile, "Calendar", "User", ""))
    password := Trim(IniRead(ASCS_SecretsFile, "Calendar", "Password", ""))
    if !RegExMatch(user, "^[a-z][a-z0-9]{0,31}$") || StrLen(password) < 24
        return 0
    return Map("user", user, "password", password)
}

; The process (if any) listening on 127.0.0.1:5232, and its command line.
CalendarPortOwner() {
    size := 0
    DllCall("Iphlpapi\GetExtendedTcpTable", "Ptr", 0, "UInt*", &size, "Int", false, "UInt", 2, "UInt", 3, "UInt", 0)  ; TCP_TABLE_OWNER_PID_LISTENER
    table := Buffer(size + 64, 0)
    if DllCall("Iphlpapi\GetExtendedTcpTable", "Ptr", table, "UInt*", &size, "Int", false, "UInt", 2, "UInt", 3, "UInt", 0)
        return 0
    Loop NumGet(table, 0, "UInt") {
        row := 4 + (A_Index - 1) * 24             ; MIB_TCPROW_OWNER_PID: state, local addr, local port, remote addr, remote port, pid
        port := ((NumGet(table, row + 8, "UInt") & 0xFF) << 8) | ((NumGet(table, row + 8, "UInt") >> 8) & 0xFF)
        if (port = 5232)
            return NumGet(table, row + 20, "UInt")
    }
    return 0
}

ProcessCommandLine(pid) {
    try {
        for process in ComObjGet("winmgmts:").ExecQuery("SELECT CommandLine FROM Win32_Process WHERE ProcessId=" Integer(pid))
            return process.CommandLine
    }
    return ""
}

StartCalendarServer() {
    global ASCS_CalendarState, ASCS_CalendarPid
    paths := CalendarPaths()
    if !FileExist(paths["pythonw"]) || !FileExist(paths["config"]) || !FileExist(paths["users"]) || !CalendarCredentials() {
        SetCalendarState("notInstalled", "The calendar server isn't installed. Run tools\Install-Radicale.ps1, then reload Maestro.")
        return
    }
    if (owner := CalendarPortOwner()) {
        if InStr(ProcessCommandLine(owner), paths["config"]) {
            ASCS_CalendarPid := owner
            SetCalendarState("running", "")
            WriteLog("Calendar: adopted the running server (pid " owner ").")
        } else {
            SetCalendarState("failed", "Port 5232 is in use by another program, so the calendar server can't start.")
            WriteLog("Calendar: port 5232 is taken by pid " owner "; not starting.")
        }
        return
    }
    try {
        Run('"' paths["pythonw"] '" -I -m radicale --config "' paths["config"] '"', paths["dir"], "Hide", &pid)
        ASCS_CalendarPid := pid
        SetCalendarState("starting", "")
        SetTimer(CheckCalendarServer, -1500)
    } catch as err {
        SetCalendarState("failed", "The calendar server couldn't start: " err.Message)
    }
}

CheckCalendarServer() {
    static tries := 0
    if CalendarPortOwner() {
        tries := 0
        SetCalendarState("running", "")
        WriteLog("Calendar: server started.")
        return
    }
    if (++tries < 8) {
        SetTimer(CheckCalendarServer, -1000)
        return
    }
    tries := 0
    SetCalendarState("failed", "The calendar server didn't start. Try tools\Install-Radicale.ps1 -Reinstall.")
    WriteLog("Calendar: server didn't start within 9 s.")
}

; On exit (not on reload: the new ASCS adopts it). The venv's pythonw is a
; launcher with the real server as its child, so both are stopped, and only
; processes whose command line points at ASCS's own config.
StopCalendarServer(reason, *) {
    global ASCS_CalendarPid
    if (reason = "Reload")
        return
    config := CalendarPaths()["config"]
    pids := []
    if ASCS_CalendarPid
        pids.Push(ASCS_CalendarPid)
    if (owner := CalendarPortOwner())
        pids.Push(owner)
    for pid in pids
        if ProcessExist(pid) && InStr(ProcessCommandLine(pid), config)
            try ProcessClose(pid)
}

SetCalendarState(state, message) {
    global ASCS_CalendarState
    ASCS_CalendarState := Map("state", state, "message", message)
    SendCalendarState()
}

SendCalendarState() {
    global ASCS_CalendarState
    SendToFrontend('{"type":"calendarState","state":' JsonQuote(ASCS_CalendarState["state"]) ',"message":' JsonQuote(ASCS_CalendarState["message"]) '}')
}

; Payload: "id|op|calendar|uid|etag" then a newline and the body (if any).
; The reply is a string: CAL, id, status, ETag, body, one per line.
CalendarRequest(content) {
    global ASCS_CalendarState, ASCS_CalendarRequests
    split := InStr(content, "`n")
    head := split ? SubStr(content, 1, split - 1) : content
    body := split ? SubStr(content, split + 1) : ""
    fields := StrSplit(head, "|")
    if (fields.Length != 5 || !RegExMatch(fields[1], "^\d{1,9}$"))
        return
    id := fields[1]
    try {
        if (ASCS_CalendarState["state"] != "running")
            throw Error(ASCS_CalendarState["message"] != "" ? ASCS_CalendarState["message"] : "The calendar server isn't running yet.")
        if (ASCS_CalendarRequests.Count >= 8)
            throw Error("Too many calendar requests at once.")
        credentials := CalendarCredentials()
        spec := CalDavRequest(credentials["user"], fields[2], fields[3], fields[4], fields[5], body)
        request := ComObject("WinHttp.WinHttpRequest.5.1")
        request.Option[6] := false                       ; no redirects
        request.SetTimeouts(2000, 2000, 10000, 15000)
        request.Open(spec["method"], "http://127.0.0.1:5232" spec["path"], true)
        request.SetRequestHeader("Authorization", "Basic " Base64Text(credentials["user"] ":" credentials["password"]))
        for name, value in spec["headers"]
            request.SetRequestHeader(name, value)
        request.Send(spec["body"] = "" ? "" : Utf8Bytes(spec["body"]))
        ASCS_CalendarRequests[id] := Map("request", request, "started", A_TickCount)
        SetTimer(PollCalendarRequests, 50)
    } catch as err {
        ReplyCalendar(id, 0, "", err.Message)
    }
}

PollCalendarRequests() {
    global ASCS_CalendarRequests
    for id in [ASCS_CalendarRequests*] {
        entry := ASCS_CalendarRequests[id]
        try {
            if !entry["request"].WaitForResponse(0) {
                if (A_TickCount - entry["started"] < 20000)
                    continue
                try entry["request"].Abort()
                throw Error("The calendar server didn't answer.")
            }
            ASCS_CalendarRequests.Delete(id)
            request := entry["request"]
            etag := ""
            try etag := request.GetResponseHeader("ETag")
            text := ""
            try text := HttpResponseText(request, 20000000)     ; empty replies (201, 204) have no body
            ReplyCalendar(id, request.Status, etag, text)
        } catch as err {
            if ASCS_CalendarRequests.Has(id)
                ASCS_CalendarRequests.Delete(id)
            ReplyCalendar(id, 0, "", err.Message)
        }
    }
    if !ASCS_CalendarRequests.Count
        SetTimer(PollCalendarRequests, 0)
}

ReplyCalendar(id, status, etag, body) {
    global ASCS_App
    try ASCS_App.PostWebMessageAsString("CAL`n" id "`n" status "`n" RegExReplace(etag, "[\r\n]") "`n" body)
}

Base64Text(text) {
    size := StrPut(text, "UTF-8") - 1
    bytes := Buffer(size + 1)
    StrPut(text, bytes, "UTF-8")
    flags := 0x40000001                              ; CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF
    DllCall("Crypt32\CryptBinaryToStringW", "Ptr", bytes, "UInt", size, "UInt", flags, "Ptr", 0, "UInt*", &chars := 0)
    out := Buffer(chars * 2)
    DllCall("Crypt32\CryptBinaryToStringW", "Ptr", bytes, "UInt", size, "UInt", flags, "Ptr", out, "UInt*", &chars)
    return StrGet(out, chars, "UTF-16")
}

; UTF-8 bytes (no terminator) as a SAFEARRAY for WinHttp's Send.
Utf8Bytes(text) {
    size := StrPut(text, "UTF-8") - 1
    safeArray := ComObjArray(0x11, Max(size, 1))         ; VT_UI1
    if (size > 0) {
        temp := Buffer(size + 1)
        StrPut(text, temp, "UTF-8")
        DllCall("RtlMoveMemory", "Ptr", NumGet(ComObjValue(safeArray), 8 + A_PtrSize, "Ptr"), "Ptr", temp, "UPtr", size)
    }
    return safeArray
}

; ---- .ics import and export, through Windows' own file dialogs (the page
; never names a path)

ExportCalendarFile(content) {
    global ASCS_App
    try {
        split := InStr(content, "`n")
        name := Trim(RegExReplace(SubStr(content, 1, split - 1), '[<>:"/\\|?*\x00-\x1F]', ""))
        ics := ValidateCalendarFile(SubStr(content, split + 1))
        ASCS_App.Opt("+OwnDialogs")
        path := FileSelect("S16", A_MyDocuments "\" (name = "" ? "Calendar" : SubStr(name, 1, 60)) ".ics", "Export calendar", "iCalendar (*.ics)")
        if (path = "")
            return
        if !RegExMatch(path, "i)\.ics$")
            path .= ".ics"
        file := FileOpen(path, "w", "UTF-8-RAW")
        file.Write(ics)
        file.Close()
        SplitPath(path, &fileName)
        RecordActivity("system", "Calendar exported: " fileName)
        SendToFrontend('{"type":"notice","message":' JsonQuote("Saved " fileName ".") '}')
    } catch as err {
        SendToFrontend('{"type":"notice","message":' JsonQuote("The calendar wasn't exported: " err.Message) '}')
    }
}

ImportCalendarFile() {
    global ASCS_App
    try {
        ASCS_App.Opt("+OwnDialogs")
        path := FileSelect(1, A_MyDocuments, "Import a calendar file", "iCalendar (*.ics)")
        if (path = "")
            return
        if (FileGetSize(path) > 5 * 1024 * 1024)
            throw Error("The file is larger than 5 MB.")
        text := ValidateCalendarFile(FileRead(path, "UTF-8"))
        SplitPath(path, &fileName)
        ASCS_App.PostWebMessageAsString("ICS`n" fileName "`n" text)
    } catch as err {
        SendToFrontend('{"type":"notice","message":' JsonQuote("That file couldn't be imported: " err.Message) '}')
    }
}

; ---- reminders

SetCalendarReminders(content) {
    global ASCS_CalendarReminders
    now := DateDiff(A_NowUTC, "19700101000000", "Seconds")
    ASCS_CalendarReminders := ParseReminderList(content, now)
    SetTimer(FireCalendarReminders, ASCS_CalendarReminders.Length ? 15000 : 0)
}

; Every 15 s while any are pending: reminders that are due fire once; any
; more than 15 minutes late (the PC was asleep) are dropped quietly.
FireCalendarReminders() {
    global ASCS_CalendarReminders, ASCS_CalendarFired, ASCS_ReminderBalloonAt
    now := DateDiff(A_NowUTC, "19700101000000", "Seconds")
    keep := []
    for reminder in ASCS_CalendarReminders {
        key := reminder["at"] "|" reminder["title"]
        if (reminder["at"] > now) {
            keep.Push(reminder)
            continue
        }
        if ASCS_CalendarFired.Has(key) || now - reminder["at"] > 900
            continue
        ASCS_CalendarFired[key] := now
        PlayAscsSound("reminder")
        ; ASCS's own icon, large (0x4 | 0x20), muted (0x10): ASCS plays its
        ; reminder sound itself. Clicking the pop-up opens the Calendar.
        ASCS_ReminderBalloonAt := A_TickCount
        TrayTip(ReminderBalloonText(reminder, now), reminder["title"], 0x34)
        NotifyFrontend(reminder["title"] " · " reminder["when"])
        RecordActivity("system", "Reminder: " reminder["title"])
    }
    ASCS_CalendarReminders := keep
    for key, at in ASCS_CalendarFired.Clone()
        if (now - at > 86400)
            ASCS_CalendarFired.Delete(key)
    if !keep.Length
        SetTimer(FireCalendarReminders, 0)
}

; A click on a reminder pop-up (NIN_BALLOONUSERCLICK) within a minute of it
; showing opens the Calendar. Returns nothing, so the tray icon's own
; handling of every message carries on as before.
ReminderBalloonClicked(wParam, lParam, *) {
    global ASCS_ReminderBalloonAt
    if ((lParam & 0xFFFF) = 0x405 && ASCS_ReminderBalloonAt && A_TickCount - ASCS_ReminderBalloonAt < 60000) {
        ASCS_ReminderBalloonAt := 0
        SetTimer(() => ShowASCS("calendar"), -1)
    }
}

; ---- audio: headphones through SoundSwitch
; SoundSwitch cycles the default device on its hotkey. ASCS presses it until
; the wanted device is the default (read back from Windows after each press),
; stopping after a full cycle or if nothing changes.

SwitchAudioTo(wanted) {
    global ASCS_SoundSwitchKey
    if (wanted = "")
        return false
    try current := SoundGetName()
    catch
        return false
    if DeviceNameMatches(current, wanted)
        return true
    if (ASCS_SoundSwitchKey["send"] = "")
        return false
    first := current
    Loop 8 {
        Send(ASCS_SoundSwitchKey["send"])
        Sleep(450)
        try current := SoundGetName()
        if DeviceNameMatches(current, wanted)
            return true
        if (A_Index >= 2 && current = first)
            break
    }
    WriteLog("Audio: could not switch to " wanted " (default is " current ").")
    return false
}

; ---- Super + M4: the PSO session
; Headphones, then Discord, then the Ephinea launcher. When the game
; (PsoBB.exe) closes, the previous audio device comes back and ASCS offers to
; close Discord. While the session runs, ASCS checks every 10 seconds, on a
; held process handle (no polling of the process list once the game is up).

StartPsoSession(*) {
    global ASCS_PsoSession, ASCS_GamePaths, ASCS_Headphones
    if GetKeyState("Shift", "P")
        return                          ; Super + Shift + M4 is vacant
    if (pid := ProcessExist("PsoBB.exe")) {
        try WinActivate("ahk_pid " pid)
        return
    }
    launcher := ASCS_GamePaths["pso"]
    if (launcher = "" || !FileExist(launcher)) {
        MsgBox("Set the PSO launcher in Games › Setup.", "PSO session", "Icon! T15")
        return
    }
    if IsObject(ASCS_PsoSession) {
        try WinActivate("ahk_exe " GameProcessName("pso"))
        return
    }
    previous := ""
    try previous := SoundGetName()
    switched := !DeviceNameMatches(previous, ASCS_Headphones) && SwitchAudioTo(ASCS_Headphones)
    discord := ASCS_GamePaths["discord"]
    discordWasRunning := ProcessExist("Discord.exe")
    if (discord != "" && !discordWasRunning) {
        try {
            SplitPath(discord, , &discordDir)
            Run('"' discord '"', discordDir)
        }
    }
    OpenPsoVoiceChannel(discordWasRunning ? 0 : A_TickCount)
    SplitPath(launcher, , &dir)
    try Run('"' launcher '"', dir)
    catch as err {
        MsgBox("The PSO launcher could not be started.`n`n" err.Message, "PSO session", "Iconx T15")
        if switched
            SwitchAudioTo(previous)
        return
    }
    ASCS_PsoSession := Map("previous", previous, "switched", switched, "handle", 0, "started", A_TickCount)
    RecordActivity("launch", "PSO session" (switched ? " · headphones on" : ""))
    SetTimer(PollPsoSession, 10000)
}

; Opens the PSO voice channel in Discord through its own discord:// link
; (rebuilt from two validated numbers; see DiscordChannelUri). If Discord was
; just started, waits for its main window (updates can take a while), up to
; 90 s, then gives it a few seconds to settle so the link isn't dropped.
OpenPsoVoiceChannel(startedAt := 0) {
    global ASCS_PsoVoiceChannel
    static waitingSince := 0
    if (ASCS_PsoVoiceChannel = "")
        return
    if (startedAt)
        waitingSince := startedAt
    if (waitingSince) {
        if (A_TickCount - waitingSince > 90000) {
            waitingSince := 0
            if !ProcessExist("Discord.exe") {
                WriteLog("PSO session: Discord isn't running; voice channel not opened.")
                return
            }
            ; Running but no window (it may start minimized to the tray): open
            ; the link anyway, which brings Discord forward.
        } else if !DiscordMainWindowReady() {
            SetTimer(OpenPsoVoiceChannel, -1000)
            return
        }
        waitingSince := 0
        SetTimer(() => OpenPsoVoiceChannel(), -4000)
        return
    }
    try {
        Run(ASCS_PsoVoiceChannel)
        WriteLog("PSO session: opened the Discord voice channel.")
    } catch as err {
        WriteLog("PSO session: the Discord voice channel could not be opened: " err.Message)
    }
}

; Discord's main window (not its small updater splash) is showing.
DiscordMainWindowReady() {
    for hwnd in WinGetList("ahk_exe Discord.exe") {
        try {
            if !(WinGetStyle("ahk_id " hwnd) & 0x10000000)
                continue
            WinGetPos(, , &width, &height, "ahk_id " hwnd)
            if (width >= 600 && height >= 400)
                return true
        }
    }
    return false
}

PollPsoSession() {
    global ASCS_PsoSession
    session := ASCS_PsoSession
    if !IsObject(session) {
        SetTimer(PollPsoSession, 0)
        return
    }
    if !session["handle"] {
        if (pid := ProcessExist("PsoBB.exe")) {
            ; SYNCHRONIZE access is enough to wait on the process.
            session["handle"] := DllCall("OpenProcess", "UInt", 0x00100000, "Int", 0, "UInt", pid, "Ptr")
            return
        }
        launcher := GameProcessName("pso")
        if (A_TickCount - session["started"] > 30000 && (launcher = "" || !ProcessExist(launcher)))
            EndPsoSession(false)        ; the launcher closed without starting the game
        return
    }
    if (DllCall("WaitForSingleObject", "Ptr", session["handle"], "UInt", 0, "UInt") = 0)
        EndPsoSession(true)
}

EndPsoSession(played) {
    global ASCS_PsoSession
    session := ASCS_PsoSession
    SetTimer(PollPsoSession, 0)
    ASCS_PsoSession := 0
    if session["handle"]
        DllCall("CloseHandle", "Ptr", session["handle"])
    if (session["switched"] && session["previous"] != "")
        SwitchAudioTo(session["previous"])
    RecordActivity("system", "PSO session ended" (session["switched"] ? " · audio restored" : ""))
    if (played && ProcessExist("Discord.exe"))
        SetTimer(OfferCloseDiscord, -1)
}

OfferCloseDiscord() {
    answer := MsgBox("Phantasy Star Online has closed. Close Discord too?", "PSO session", "YesNo Iconi Default2 T30")
    if (answer != "Yes")
        return
    Loop 12 {
        if !ProcessExist("Discord.exe")
            break
        ProcessClose("Discord.exe")
        Sleep(100)
    }
}

; ---- Super + M5 / M6 / M7: recent games for RetroArch, Dolphin, PCSX2

ShowRecentGames(emulator, *) {
    if GetKeyState("Shift", "P")
        return                          ; Super + Shift + macro keys are vacant
    ShowCommandLauncher("games:" emulator)
}

