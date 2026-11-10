; ==========================================
; POWER AND SYSTEM (1.7.0)
; ==========================================
; Command Center buttons. Lock acts at once. Restart, Shut
; down, Sign out, Sleep and Empty Recycle Bin are guarded:
;   1. the page sends PowerArm only after a completed press-and-hold;
;   2. ASCS answers with a single-use ticket valid for 10 seconds, plus any
;      warnings (games running), and the page must send the ticket back with
;      PowerRun; a stray, repeated or late message does nothing;
;   3. ASCS counts down (none, 5 or 30 seconds, from Preferences; Cancel on
;      the banner stops it), then runs the action. Restart and shut down use
;      shutdown /t 0 without /f, so apps with unsaved work still ask. (1.7.0
;      used Windows' own 30-second timer, but any /t above 0 implies /f.)
;      Before restart, shut down or sign out, ASCS holds while any window
;      title marks unsaved work, because Windows' own prompt comes only after
;      other apps have closed. If ASCS closes during a countdown, nothing happens;
;   4. notes are saved first, and every step is logged.
; None of these is bound to a hotkey, a quick action or the palette.

PowerGuarded() {
    static actions := Map("restart", 1, "shutdown", 1, "signout", 1, "sleep", 1, "recycle", 0)
    return actions
}

; The countdown for an action: the Preferences delay (none, 5 or 30 s) for
; everything but the Recycle Bin.
PowerDelayFor(action) {
    global ASCS_PowerDelay
    return PowerGuarded()[action] ? ASCS_PowerDelay : 0
}

PowerLabel(action) {
    static labels := Map("restart", "Restart", "shutdown", "Shut down", "signout", "Sign out",
        "sleep", "Sleep", "recycle", "Empty Recycle Bin")
    return labels.Has(action) ? labels[action] : action
}

ShutdownExe() {
    return A_WinDir "\System32\shutdown.exe"
}

; Things worth a second thought before the machine goes down.
PowerWarnings(action) {
    warnings := []
    if (action = "recycle")
        return warnings
    names := Map("retroarch", "RetroArch", "dolphin", "Dolphin", "pcsx2", "PCSX2", "pso", "Phantasy Star Online")
    for name, state in RunningGameApps()
        if (state && names.Has(name))
            warnings.Push(names[name] " is running")
    if SteamRunningAppId()
        warnings.Push("a Steam game is running")
    if (action != "sleep") {
        unsaved := UnsavedWork()
        if unsaved.Length
            warnings.InsertAt(1, "unsaved work in " UnsavedWorkSummary(unsaved))
    }
    return warnings
}

; Apps whose windows mark unsaved work in their titles (see UnsavedWorkApp),
; each named once. Visible, non-tool windows only; ASCS's own are skipped.
UnsavedWork() {
    apps := [], seen := Map()
    own := ProcessExist()
    for hwnd in WinGetList() {
        try {
            if (WinGetPID(hwnd) = own || (WinGetExStyle(hwnd) & 0x80))   ; WS_EX_TOOLWINDOW
                continue
            app := UnsavedWorkApp(WinGetTitle(hwnd), WinGetProcessName(hwnd))
            if (app != "" && !seen.Has(app)) {
                seen[app] := true
                apps.Push(app)
            }
        }
    }
    if (!seen.Has("Visual Studio Code") && VSCodeHasUnsavedWork())
        apps.Push("Visual Studio Code")
    return apps
}

; VS Code's title marks only the active tab, so its own backups of unsaved
; buffers count too (IsVSCodeBackupFolder): any written since the running VS
; Code started. Only names and dates are read, never contents. Earlier ones
; belong to buffers VS Code restores itself after a restart.
VSCodeHasUnsavedWork() {
    if !(hwnd := WinExist("ahk_exe Code.exe ahk_class Chrome_WidgetWin_1"))
        return false
    started := ProcessStartStamp(WinGetPID(hwnd))   ; the window belongs to VS Code's main process
    if (started = "")
        return false
    checked := 0
    Loop Files EnvGet("APPDATA") "\Code\Backups\*", "FR" {
        if (++checked > 2000)
            break
        if (IsVSCodeBackupFolder(A_LoopFileDir) && A_LoopFileTimeModified >= started)
            return true
    }
    return false
}

; When a process started, as local YYYYMMDDHH24MISS ("" if it can't be read).
ProcessStartStamp(pid) {
    handle := DllCall("OpenProcess", "UInt", 0x1000, "Int", 0, "UInt", pid, "Ptr")   ; PROCESS_QUERY_LIMITED_INFORMATION
    if !handle
        return ""
    times := Buffer(32, 0)                      ; creation, exit, kernel and user FILETIMEs
    ok := DllCall("GetProcessTimes", "Ptr", handle, "Ptr", times.Ptr, "Ptr", times.Ptr + 8,
        "Ptr", times.Ptr + 16, "Ptr", times.Ptr + 24, "Int")
    DllCall("CloseHandle", "Ptr", handle)
    return ok ? FileTimeToLocalStamp(NumGet(times, 0, "Int64"), DateDiff(A_Now, A_NowUTC, "Seconds")) : ""
}

PowerArm(action) {
    global ASCS_PowerTicket
    if !PowerGuarded().Has(action) {
        WriteLog("Rejected unknown power action.")
        return
    }
    ticket := Format("{:08x}{:08x}", Random(0, 0x7FFFFFFF), Random(0, 0x7FFFFFFF))
    ASCS_PowerTicket := Map("action", action, "ticket", ticket, "expires", A_TickCount + 10000)
    warnings := ""
    for text in PowerWarnings(action)
        warnings .= (warnings = "" ? "" : ",") JsonQuote(text)
    SendToFrontend('{"type":"powerArmed","action":' JsonQuote(action) ',"ticket":' JsonQuote(ticket)
        . ',"warnings":[' warnings ']}')
}

PowerRun(content) {
    global ASCS_PowerTicket, ASCS_PowerPending
    parts := StrSplit(content, "|")
    ticket := ASCS_PowerTicket
    ASCS_PowerTicket := 0                       ; single use, whatever happens
    if (parts.Length != 2 || !IsObject(ticket) || ticket["action"] != parts[1]
        || ticket["ticket"] != parts[2] || A_TickCount > ticket["expires"]) {
        WriteLog("Rejected a power request without a valid ticket.")
        SendToFrontend('{"type":"notice","message":"That took too long; hold the button again."}')
        return
    }
    action := parts[1]
    if (action = "recycle") {
        EmptyRecycleBin()
        return
    }
    if IsObject(ASCS_PowerPending) {
        SendToFrontend('{"type":"notice","message":"Another power action is already counting down."}')
        return
    }
    seconds := PowerDelayFor(action)
    ASCS_PowerPending := Map("action", action, "deadline", A_TickCount + seconds * 1000)
    RecordActivity("system", PowerLabel(action) (seconds ? " scheduled in " seconds " s" : ""))
    WriteLog("Power: " action " in " seconds " s.")
    SendToFrontend('{"type":"powerPending","action":' JsonQuote(action) ',"seconds":' seconds '}')
    ; ASCS counts down every action itself (1.8.0). Windows' own timer
    ; (shutdown /t with more than 0 s) implies /f, closing apps without letting
    ; them save, so it is never used.
    SetTimer(FinishPowerAction, -Max(1, seconds * 1000))
}

FinishPowerAction() {
    global ASCS_PowerPending
    pending := ASCS_PowerPending
    if !IsObject(pending)
        return
    ; Hold here, before Windows closes anything, while any app shows unsaved
    ; work: Windows asks apps one at a time, so by the time an app asks,
    ; others have already closed. Looks again every 2 s and goes ahead once
    ; they're saved or closed; "anyway" (PowerAnyway) skips the check.
    if (pending["action"] != "sleep" && !pending.Has("anyway")) {
        unsaved := UnsavedWork()
        if unsaved.Length {
            if !pending.Has("held") {
                pending["held"] := true
                WriteLog("Power: " pending["action"] " held for unsaved work in " UnsavedWorkSummary(unsaved) ".")
            }
            apps := ""
            for app in unsaved
                apps .= (apps = "" ? "" : ",") JsonQuote(app)
            SendToFrontend('{"type":"powerHeld","action":' JsonQuote(pending["action"]) ',"apps":[' apps ']}')
            SetTimer(FinishPowerAction, -2000)
            return
        }
    }
    ASCS_PowerPending := 0
    SendToFrontend('{"type":"powerDone"}')
    switch pending["action"] {
        case "restart", "shutdown":
            ; /t 0 and no /f: apps with unsaved work can still ask, and the
            ; user can cancel there.
            flag := pending["action"] = "restart" ? "/r" : "/s"
            FlushNotesThen(() => RunShutdown(flag " /t 0"))
        case "signout":
            FlushNotesThen(() => RunShutdown("/l"))
        case "sleep":
            ; SetSuspendState(hibernate = no, force = no, wake events allowed)
            DllCall("PowrProf\SetSuspendState", "Int", 0, "Int", 0, "Int", 0)
    }
}

RunShutdown(arguments) {
    try Run('"' ShutdownExe() '" ' arguments, , "Hide")
    catch as err {
        WriteLog("Power: shutdown.exe failed: " err.Message)
        SendToFrontend('{"type":"notice","message":' JsonQuote("Windows refused: " err.Message) '}')
    }
}

; "Restart anyway" on a held action: only valid while it is held.
PowerAnyway() {
    global ASCS_PowerPending
    pending := ASCS_PowerPending
    if !IsObject(pending) || !pending.Has("held")
        return
    pending["anyway"] := true
    WriteLog("Power: " pending["action"] " confirmed despite unsaved work.")
    SetTimer(FinishPowerAction, 0)
    FinishPowerAction()
}

CancelPowerAction() {
    global ASCS_PowerPending
    pending := ASCS_PowerPending
    if !IsObject(pending)
        return
    SetTimer(FinishPowerAction, 0)
    ClearPowerPending("")
    RecordActivity("system", PowerLabel(pending["action"]) " canceled")
    WriteLog("Power: " pending["action"] " canceled.")
}

ClearPowerPending(message) {
    global ASCS_PowerPending
    ASCS_PowerPending := 0
    SendToFrontend('{"type":"powerCanceled","message":' JsonQuote(message) '}')
}

; Recycle Bin: its size for the button, and emptying after the hold.
SendRecycleBin() {
    info := Buffer(24, 0)                       ; SHQUERYRBINFO (x64)
    NumPut("UInt", 24, info, 0)
    if (DllCall("Shell32\SHQueryRecycleBinW", "Ptr", 0, "Ptr", info, "Int") != 0)
        return
    SendToFrontend('{"type":"recycleBin","bytes":' NumGet(info, 8, "Int64") ',"items":' NumGet(info, 16, "Int64") '}')
}

EmptyRecycleBin() {
    global ASCS_App
    ; SHERB_NOCONFIRMATION: the press-and-hold was the confirmation.
    result := DllCall("Shell32\SHEmptyRecycleBinW", "Ptr", ASCS_App.Hwnd, "Ptr", 0, "UInt", 0x1, "Int")
    RecordActivity("system", "Recycle Bin emptied")
    WriteLog("Recycle Bin emptied (result " Format("{:X}", result & 0xFFFFFFFF) ").")
    SendRecycleBin()
}

; ---- audio output picker (through SoundSwitch)

; Each active output: { name: what Windows calls it, label: what Maestro shows }.
PlaybackDevices() {
    devices := []
    try {
        audioEnum := ComObject("{BCDE0395-E52F-467C-8E3D-C4579291692E}", "{A95664D2-9614-4F35-A746-DE8DB63617E6}")
        ComCall(3, audioEnum, "Int", 0, "UInt", 1, "Ptr*", &collection := 0)    ; active render endpoints
        ComCall(3, collection, "UInt*", &count := 0)
        nameKey := Buffer(20)                                                    ; PKEY_Device_FriendlyName
        DllCall("Ole32\CLSIDFromString", "Str", "{a45c254e-df1c-4efd-8020-67d146a850e0}", "Ptr", nameKey)
        NumPut("UInt", 14, nameKey, 16)
        formKey := Buffer(20)                                                    ; PKEY_AudioEndpoint_FormFactor
        DllCall("Ole32\CLSIDFromString", "Str", "{1da5d803-d492-4edd-8c23-e0c0ffee7f0e}", "Ptr", formKey)
        NumPut("UInt", 0, formKey, 16)
        value := Buffer(24, 0)                                                   ; PROPVARIANT (x64)
        Loop Min(count, 16) {
            device := 0, store := 0
            try {
                ComCall(4, collection, "UInt", A_Index - 1, "Ptr*", &device)
                ComCall(4, device, "UInt", 0, "Ptr*", &store)
                ComCall(5, store, "Ptr", nameKey, "Ptr", value)
                if (NumGet(value, 0, "UShort") = 31) {                           ; VT_LPWSTR
                    name := SubStr(StrGet(NumGet(value, 8, "Ptr"), "UTF-16"), 1, 120)
                    DllCall("Ole32\PropVariantClear", "Ptr", value)
                    formFactor := -1
                    try {
                        ComCall(5, store, "Ptr", formKey, "Ptr", value)
                        if (NumGet(value, 0, "UShort") = 19)                     ; VT_UI4
                            formFactor := NumGet(value, 8, "UInt")
                    }
                    devices.Push({ name: name, label: AudioDeviceLabel(name, formFactor) })
                }
                DllCall("Ole32\PropVariantClear", "Ptr", value)
            }
            if store
                ObjRelease(store)
            if device
                ObjRelease(device)
        }
        ObjRelease(collection)
    } catch as err {
        WriteLog("Audio devices unavailable: " err.Message)
    }
    return devices
}

SendAudioDevices() {
    current := ""
    try current := SoundGetName()
    json := ""
    for device in PlaybackDevices()
        json .= (json = "" ? "" : ",") '{"name":' JsonQuote(device.name) ',"label":' JsonQuote(device.label) ',"current":' (device.name = current ? "true" : "false") '}'
    SendToFrontend('{"type":"audioDevices","items":[' json '],"soundSwitch":' (ProcessExist("SoundSwitch.exe") ? "true" : "false") '}')
}

SelectAudioDevice(name) {
    label := ""
    for device in PlaybackDevices()
        if (device.name = name)
            label := device.label
    if (label = "")
        return
    if SwitchAudioTo(name) {
        RecordActivity("system", "Audio output: " SubStr(label, 1, 60))
    } else {
        SendToFrontend('{"type":"notice","message":' JsonQuote(ProcessExist("SoundSwitch.exe")
            ? "SoundSwitch didn't reach that device. Add it to SoundSwitch's playback list."
            : "SoundSwitch isn't running; Maestro switches devices through it.") '}')
    }
    SendAudioDevices()
}

