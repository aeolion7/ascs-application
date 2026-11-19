; maestro drive (2.10.0): the probes file for a copy made by `maestro drive`,
; included after isolate-hook.ahk. Never part of the app. Before the page loads
; it adds drive\instrument.js to it; once the page is ready it shows the window
; off-screen without taking focus, runs drive\plan.js with drive\runner.js in
; the page, and carries out what the runner asks for: resize, a screenshot,
; memory, host times, writing results inside the copy, and the end.
; Keep this file ASCII.

global Drive_Folder := A_ScriptDir "\drive"
global Drive_Start := A_TickCount
global Drive_Times := Map()
global Drive_Phase := FileExist(Drive_Folder "\phase.txt") ? Trim(FileRead(Drive_Folder "\phase.txt"), " `t`r`n") : "first"
global Drive_Busy := false
global Drive_Running := false
global Drive_Written := Map()
global Drive_Width := 2540
global Drive_Height := 1224
SetTimer(Drive_WaitForPage, 100)

; Called by the copy's ASCS.ahk just before it loads the page.
Drive_BeforeNavigate() {
    global ASCS_App
    Drive_Times["webviewMade"] := A_TickCount - Drive_Start
    ; The asynchronous form: waiting for an answer here would stall the start.
    ASCS_App.AddScriptToExecuteOnDocumentCreatedAsync(FileRead(Drive_Folder "\instrument.js", "UTF-8"))
}

Drive_WaitForPage() {
    global ASCS_App, ASCS_PageReady, ASCS_HasShown, Drive_Running
    if (Drive_Running || !IsObject(ASCS_App) || !ASCS_PageReady)
        return
    Drive_Running := true
    SetTimer(Drive_WaitForPage, 0)
    Drive_Times["pageReady"] := A_TickCount - Drive_Start
    Drive_Place(Drive_Width, Drive_Height)
    ASCS_HasShown := true
    ASCS_App.Show("NA")
    SendToFrontend(WindowShownJson())
    Drive_Times["shown"] := A_TickCount - Drive_Start
    script := FileRead(Drive_Folder "\plan.js", "UTF-8") "`n" FileRead(Drive_Folder "\runner.js", "UTF-8")
        . "`nwindow.__maestroDriveRun(" JsonQuote(Drive_Phase) ");"
    ASCS_App.ExecuteScriptAsync(script)
    Isolate_Note("drive", "plan started, phase " Drive_Phase)
    SetTimer(Drive_Poll, 100)
}

; Off-screen to the left, so it never covers anything or takes focus.
Drive_Place(width, height) {
    global ASCS_App
    ASCS_App.Move(-width - 400, 0, width, height)
}

; Script runs asynchronously: a timer can't wait for its answer (it times out),
; so each poll hands the answer to Drive_Took.
Drive_Poll() {
    global ASCS_App, Drive_Busy
    if Drive_Busy
        return
    Drive_Busy := true
    try ASCS_App.ExecuteScriptAsync("window.__maestroDrive ? window.__maestroDrive.take() : 'no recorder'").then(Drive_Took, Drive_Failed)
    catch as err {
        Drive_Busy := false
        Isolate_Note("error", "drive: " err.Message)
    }
}

Drive_Took(raw) {
    global Drive_Busy
    Drive_Busy := false
    text := StrLen(raw) > 2 ? JsonUnescape(SubStr(raw, 2, -1)) : ""
    if (text = "no recorder") {
        Isolate_Note("error", "drive: the page has no recorder")
        SetTimer(Drive_Poll, 0)
        SetTimer(() => ExitApp(1), -500)
        return
    }
    if (text != "") {
        for request in StrSplit(text, "`n")
            try Drive_Handle(request)
            catch as err
                Isolate_Note("error", "drive: " err.Message)
    }
}

Drive_Failed(err) {
    global Drive_Busy
    Drive_Busy := false
    Isolate_Note("error", "drive: " (err is Error ? err.Message : String(err)))
}

Drive_Handle(request) {
    global ASCS_App
    parts := StrSplit(request, "`t", , 3)
    if (parts.Length < 3)
        return
    id := parts[1], kind := parts[2], detail := parts[3]
    answer := "ok"
    switch kind {
        case "resize":
            size := StrSplit(detail, ",")
            Drive_Place(Integer(size[1]), Integer(size[2]))
        case "capture":
            return Drive_Capture(id, detail)       ; answers when the picture is written
        case "memory":
            answer := Drive_Memory()
        case "hide":
            HandleClose()                         ; as the close button does
        case "show":
            try %"SetWebViewMemoryLow"%(false)    ; as ShowASCS does, where the version has it
            ASCS_App.Show("NA")
            SendToFrontend(WindowShownJson())
        case "times":
            answer := ""
            for key, value in Drive_Times
                answer .= (answer = "" ? "" : ",") key "=" value
        case "write":
            answer := Drive_Write(detail)
        case "log":
            Isolate_Note("drive", detail)
        case "done":
            Isolate_Note("drive", "plan " detail)
            FileAppend(detail, Drive_Folder "\done.txt", "UTF-8-RAW")
            SetTimer(() => ExitApp(0), -500)
        default:
            answer := "unknown request " kind
    }
    Drive_Reply(id, answer)
}

Drive_Reply(id, answer) {
    global ASCS_App
    if (id != "0")
        ASCS_App.ExecuteScriptAsync("window.__maestroDrive.reply(" Integer(id) ", " JsonQuote(answer) ")")
}

; Only plain names, written inside the copy's drive folder.
Drive_SafeName(name) => RegExMatch(name, "^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$") && !InStr(name, "..")

Drive_Write(detail) {
    split := InStr(detail, "|")
    name := SubStr(detail, 1, split - 1)
    if (!split || !Drive_SafeName(name))
        return "refused"
    target := Drive_Folder "\" name
    if !Drive_Written.Has(name) {
        Drive_Written[name] := true
        if FileExist(target)
            FileDelete(target)
    }
    FileAppend(SubStr(detail, split + 1), target, "UTF-8-RAW")
    return "ok"
}

; The page as WebView2 draws it, as a PNG in drive\shots.
Drive_Capture(id, name) {
    global ASCS_App
    if !Drive_SafeName(name)
        return Drive_Reply(id, "refused")
    DirCreate(Drive_Folder "\shots")
    target := Drive_Folder "\shots\" name ".png"
    stream := 0
    ; STGM_CREATE | STGM_WRITE, FILE_ATTRIBUTE_NORMAL, create
    result := DllCall("shlwapi\SHCreateStreamOnFileEx", "WStr", target, "UInt", 0x1001, "UInt", 0x80, "Int", 1, "Ptr", 0, "Ptr*", &stream, "Int")
    if (result != 0 || !stream)
        return Drive_Reply(id, "no stream: " result)
    done := (outcome) => (ObjRelease(stream), Drive_Reply(id, outcome))
    try ASCS_App.CapturePreviewAsync(0, stream).then((*) => done("ok"), (err) => done("failed"))
    catch as err
        done("failed: " err.Message)
}

; This copy's AutoHotkey and its WebView2 processes: MB working and private,
; how many processes, and CPU ms used so far by all of them and by AutoHotkey.
Drive_Memory() {
    own := ProcessExist()
    profile := A_ScriptDir "\data\WebView2"
    working := 0, privateBytes := 0, count := 0, cpu := 0, cpuOwn := 0
    for process in ComObjGet("winmgmts:").ExecQuery("SELECT ProcessId, CommandLine, WorkingSetSize, PrivatePageCount, KernelModeTime, UserModeTime FROM Win32_Process WHERE Name = 'msedgewebview2.exe' OR ProcessId = " own) {
        commandLine := ""
        try commandLine := String(process.CommandLine)
        if (process.ProcessId != own && !InStr(commandLine, profile))
            continue
        working += Number(process.WorkingSetSize)
        privateBytes += Number(process.PrivatePageCount)
        busy := (Number(process.KernelModeTime) + Number(process.UserModeTime)) / 10000   ; 100 ns units
        cpu += busy
        if (process.ProcessId = own)
            cpuOwn += busy
        count++
    }
    return Round(working / 1048576, 1) "," Round(privateBytes / 1048576, 1) "," count "," Round(cpu) "," Round(cpuOwn)
}
