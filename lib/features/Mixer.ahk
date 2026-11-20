; ==========================================
; PER-APP MIXER AND MEDIA KEYS (2.12.0)
; ==========================================

; Each app's volume on the default output, as Windows' own volume mixer has
; it, through the audio session interfaces (IAudioSessionManager2, through
; COM). Probed in a separate process on build 26300 before it was used
; (guard bytes after every out value; 12,000 reads with no growth in memory
; or handles; sessions starting and ending during reads): a read takes about
; 5 ms. Session indexes only ever come from the enumerator's own count:
; Windows' enumerator faults on an index past its end. Nothing here picks an
; output device; SoundSwitch does that.
; An app is named by its program's file name ("vivaldi.exe"), "system" for
; Windows' sounds, or "maestro" for Maestro's own process. Setting an app
; sets every session it has. Maestro reads the sessions only when asked,
; while the power tray's mixer is open or a routine step runs.

MixerIid(text) {
    static cache := Map()
    if !cache.Has(text) {
        guid := Buffer(16, 0)
        DllCall("ole32\CLSIDFromString", "WStr", text, "Ptr", guid, "HRESULT")
        cache[text] := guid
    }
    return cache[text]
}

; Calls visit(id, label, simpleVolume) for every live session of the
; default output, releasing each when it returns. Throws if Windows can't say.
ForEachAudioSession(visit) {
    enumerator := ComObject("{BCDE0395-E52F-467C-8E3D-C4579291692E}", "{A95664D2-9614-4F35-A746-DE8DB63617E6}")
    out := Buffer(8, 0)
    ComCall(4, enumerator, "Int", 0, "Int", 1, "Ptr", out)                    ; GetDefaultAudioEndpoint(eRender, eMultimedia)
    device := NumGet(out, 0, "Ptr")
    try {
        ComCall(3, device, "Ptr", MixerIid("{77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F}"), "UInt", 0x17, "Ptr", 0, "Ptr", out)   ; Activate IAudioSessionManager2
        manager := NumGet(out, 0, "Ptr")
        try {
            ComCall(5, manager, "Ptr", out)                                   ; GetSessionEnumerator
            sessions := NumGet(out, 0, "Ptr")
            try {
                ComCall(3, sessions, "Ptr", out)                              ; GetCount
                count := NumGet(out, 0, "Int")
                own := DllCall("GetCurrentProcessId", "UInt")
                Loop count {
                    ComCall(4, sessions, "Int", A_Index - 1, "Ptr", out)      ; GetSession, only below GetCount
                    control := NumGet(out, 0, "Ptr")
                    try VisitAudioSession(control, own, visit)
                    finally ObjRelease(control)
                }
            } finally ObjRelease(sessions)
        } finally ObjRelease(manager)
    } finally ObjRelease(device)
}

VisitAudioSession(control, own, visit) {
    out := Buffer(8, 0)
    ComCall(3, control, "Ptr", out)                                           ; GetState
    if (NumGet(out, 0, "Int") = 2)                                            ; AudioSessionStateExpired
        return
    control2 := ComObjQuery(control, "{BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D}")
    ComCall(14, control2, "Ptr", out, "Int")                                  ; GetProcessId (may be S_ with no single process)
    pid := NumGet(out, 0, "UInt")
    name := ""
    if (ComCall(15, control2, "Int") = 0)                                     ; IsSystemSoundsSession: S_OK when it is
        id := name := "system"
    else if (pid = own)
        id := name := "maestro"
    else {
        try name := pid ? ProcessGetName(pid) : ""
        id := AppVolumeId(name)
        if (id = "")
            return
    }
    ComCall(4, control, "Ptr", out)                                           ; GetDisplayName
    namePtr := NumGet(out, 0, "Ptr")
    displayName := namePtr ? StrGet(namePtr, "UTF-16") : ""
    DllCall("ole32\CoTaskMemFree", "Ptr", namePtr)
    simpleVolume := ComObjQuery(control, "{87CE5498-68D6-44E5-9215-6DA47EF883D8}")
    visit(id, AppVolumeLabel(name, displayName), simpleVolume)
}

; Every app with sound, one entry an app: Map id -> Map("label", "level", "muted").
ReadAppVolumes() {
    apps := Map()
    ForEachAudioSession(Collect)
    return apps

    Collect(id, label, simpleVolume) {
        out := Buffer(8, 0)
        ComCall(4, simpleVolume, "Ptr", out)                                  ; GetMasterVolume
        level := Round(NumGet(out, 0, "Float") * 100)
        ComCall(6, simpleVolume, "Ptr", out)                                  ; GetMute
        muted := NumGet(out, 0, "Int") != 0
        if apps.Has(id) {
            ; One app, several sessions: the loudest level; muted only if all are.
            apps[id]["level"] := Max(apps[id]["level"], level)
            apps[id]["muted"] := apps[id]["muted"] && muted
        } else
            apps[id] := Map("label", label, "level", level, "muted", muted)
    }
}

SendAppVolumes() {
    try {
        apps := ReadAppVolumes()
    } catch as err {
        WriteLog("Mixer: couldn't read the apps' volumes: " err.Message)
        SendToFrontend('{"type":"appVolumes","items":[],"error":' JsonQuote("Windows couldn't say which apps have sound.") '}')
        return
    }
    json := ""
    for id, app in apps
        json .= (json = "" ? "" : ",") '{"id":' JsonQuote(id) ',"label":' JsonQuote(app["label"])
            . ',"level":' app["level"] ',"muted":' (app["muted"] ? "true" : "false") '}'
    SendToFrontend('{"type":"appVolumes","items":[' json '],"error":""}')
}

; Sets one app's level (0 to 100) or mute on every session it has. Returns
; how many sessions it set; 0 when the app has no sound now.
SetAppAudio(app, level := "", muted := "") {
    count := 0
    ForEachAudioSession(Apply)
    return count

    Apply(id, label, simpleVolume) {
        if (id != app)
            return
        if (level != "")
            ComCall(3, simpleVolume, "Float", level / 100, "Ptr", 0)          ; SetMasterVolume
        if (muted != "")
            ComCall(5, simpleVolume, "Int", muted ? 1 : 0, "Ptr", 0)          ; SetMute
        count++
    }
}

; The tray's slider: "app|level". As with the output's own slider, the
; slider is the reading, so nothing is sent back.
SetAppVolumeMessage(content) {
    parsed := ParseAppVolume(content)
    if !IsObject(parsed) {
        WriteLog("Rejected invalid app volume.")
        return
    }
    try SetAppAudio(parsed["app"], parsed["level"])
    catch as err
        WriteLog("Mixer: couldn't set " parsed["app"] ": " err.Message)
}

; "app|1" mutes, "app|0" unmutes; the list is sent again.
SetAppMuteMessage(content) {
    parts := StrSplit(content, "|")
    app := parts.Length = 2 ? AppVolumeId(parts[1]) : ""
    if (app = "" || (parts[2] != "0" && parts[2] != "1")) {
        WriteLog("Rejected invalid app mute.")
        return
    }
    try SetAppAudio(app, , parts[2] = "1")
    catch as err
        WriteLog("Mixer: couldn't " (parts[2] = "1" ? "mute " : "unmute ") app ": " err.Message)
    SendAppVolumes()
}

; ---- media keys, for whatever player Windows sends them to

SendMediaKey(action) {
    switch action {
        case "playpause": Send("{Media_Play_Pause}")
        case "next": Send("{Media_Next}")
        case "previous": Send("{Media_Prev}")
        case "stop": Send("{Media_Stop}")
        default:
            WriteLog("Rejected unknown media key.")
            return false
    }
    return true
}
