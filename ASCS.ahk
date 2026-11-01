
#Requires AutoHotkey v2.0 64-bit
#SingleInstance Force
#Warn
#Warn LocalSameAsGlobal, Off

SetWorkingDir(A_ScriptDir)

; ==========================================
; AEOLIONWARE SUPER COMMAND SYSTEM
; Version 1.3.0
; ==========================================

#Include webview\WebViewToo.ahk

; ==========================================
; GLOBAL VARIABLES
; ==========================================

global ASCS_App := ""
global ASCS_WindowIcon := 0
global ASCS_IconPath := A_ScriptDir "\frontend\assets\ascs.ico"

global ASCS_DataDir := A_ScriptDir "\data"
global ASCS_NotesFile := ASCS_DataDir "\notes.json"
global ASCS_LogFile := ASCS_DataDir "\ASCS_Log.txt"
global ASCS_WebViewDataDir := ASCS_DataDir "\WebView2"
global ASCS_VirtualDesktopDllPath := A_ScriptDir "\lib\VirtualDesktopAccessor.dll"

global ASCS_EverythingPath := ""
global ASCS_PageReady := false
global ASCS_PendingView := "home"
global ASCS_DashboardErrorShown := false
global ASCS_DriveCache := Map()
global ASCS_NotesRecovered := false
global ASCS_DesktopAccessorWarningShown := false
; Edit this list manually to choose which drive letters appear in storage metrics.
global ASCS_Drives := ["C:", "J:"]

DirCreate(ASCS_DataDir)
DirCreate(ASCS_WebViewDataDir)

ASCS_EverythingPath := FindEverything()

if !FileExist(ASCS_NotesFile)
    FileAppend('{"content":""}', ASCS_NotesFile, "UTF-8")

; ==========================================
; WEBVIEW2 INITIALIZATION
; ==========================================

try {
    MonitorGetWorkArea(1, &workLeft, &workTop, &workRight, &workBottom)
    windowWidth := Min(1920, workRight - workLeft - 32)
    windowHeight := Min(1080, workBottom - workTop - 32)
    windowX := workLeft + Floor((workRight - workLeft - windowWidth) / 2)
    windowY := workTop + Floor((workBottom - workTop - windowHeight) / 2)

    ASCS_App := WebViewGui(
        "-Caption +Resize +E0x40000",
        "ASCS - Aeolionware",
        ,
        {
            DataDir: ASCS_WebViewDataDir,
            DefaultWidth: windowWidth,
            DefaultHeight: windowHeight
        }
    )

    ASCS_App.Move(windowX, windowY, windowWidth, windowHeight)
    try {
        ASCS_WindowIcon := LoadPicture(
            ASCS_IconPath,
            "Icon1",
            &iconType
        )
        TraySetIcon(ASCS_IconPath)
        ApplyWindowIcon()
    } catch as err {
        WriteLog("Window icon could not be loaded: " err.Message)
    }

    ; Enable host-to-frontend messaging.
    ASCS_App.Settings.IsWebMessageEnabled := true

    ; Register WebView2 events.
    ASCS_App.WebMessageReceived(HandleWebMessage)
    ASCS_App.NavigationStarting(HandleNavigationStarting)
    ASCS_App.NavigationCompleted(HandleNavigationCompleted)

    ; Handle window close without terminating ASCS.
    ASCS_App.OnEvent("Close", HandleClose)

    ; Map the frontend directory to a local HTTPS origin.
    ASCS_App.BrowseFolder(
        A_ScriptDir "\frontend",
        "ascs.localhost"
    )

    ; Load the frontend.
    ASCS_App.Navigate("https://ascs.localhost/index.html")

    ; Keep the application hidden at startup.
    ASCS_App.Hide()

    WriteLog("ASCS 1.3.0 initialized.")

} catch as err {
    WriteLog("WebView2 initialization failed: " err.Message)

    MsgBox(
        "ASCS could not initialize WebView2.`n`n"
        err.Message,
        "ASCS Startup Error",
        "Iconx"
    )

    ExitApp()
}

; ==========================================
; SUPER KEY / F24
; ==========================================

~F24:: {
    KeyWait("F24")

    if (A_PriorKey = "F24")
        ShowView("home")
}

F24 & q::ShowView("notes")
F24 & f::LaunchEverything()
F24 & i::ShowView("dashboard")

F24 & t::Run("wt.exe")
F24 & e::Run("explorer.exe")
F24 & c::Run("calc.exe")
F24 & h::Run("taskmgr.exe")

F24 & l::DllCall("LockWorkStation")
F24 & m::SoundSetMute(!SoundGetMute())
F24 & v::Send("#v")

F24 & j::SendText(FormatTime(, "yyyy-MM-dd HH:mm:ss"))
F24 & y::SendText(FormatTime(, "yyyy-MM-dd"))

F24 & s:: {
    if GetKeyState("Shift", "P")
        Send("#+s")
    else
        WriteLog("Workspace save requested.")
}

F24 & r::WriteLog("Workspace restore requested.")

F24 & Left::PositionActiveWindow("left")
F24 & Right::PositionActiveWindow("right")
F24 & Up::PositionActiveWindow("up")
F24 & Down::PositionActiveWindow("down")

RegisterDesktopHotkeys()

RegisterDesktopHotkeys() {
    numpadOffNames := [
        "NumpadEnd", "NumpadDown", "NumpadPgDn",
        "NumpadLeft", "NumpadClear", "NumpadRight",
        "NumpadHome", "NumpadUp", "NumpadPgUp"
    ]

    Loop 9 {
        number := A_Index
        Hotkey("F24 & " number, SwitchVirtualDesktop.Bind(number))
        Hotkey("F24 & Numpad" number, SwitchVirtualDesktop.Bind(number))
        Hotkey(
            "F24 & " numpadOffNames[number],
            SwitchVirtualDesktop.Bind(number)
        )
    }
}

SwitchVirtualDesktop(number, thisHotkey := "") {
    global ASCS_VirtualDesktopDllPath
    global ASCS_DesktopAccessorWarningShown

    if (number < 1 || number > 9)
        return

    if !FileExist(ASCS_VirtualDesktopDllPath) {
        if !ASCS_DesktopAccessorWarningShown {
            WriteLog("Virtual desktop switching is disabled: VirtualDesktopAccessor.dll is missing.")
            ASCS_DesktopAccessorWarningShown := true
        }
        ShowDesktopTooltip("Add VirtualDesktopAccessor.dll to lib to switch desktops.")
        return
    }

    try {
        dll := ASCS_VirtualDesktopDllPath
        desktopCount := DllCall(dll "\GetDesktopCount", "Int")
        if (desktopCount < 1) {
            throw Error("VirtualDesktopAccessor returned an invalid desktop count.")
        }

        if (number > desktopCount)
            return

        DllCall(dll "\GoToDesktopNumber", "Int", number - 1)
    } catch as err {
        WriteLog("VirtualDesktopAccessor failed; desktop switch was not performed: " err.Message)
        ShowDesktopTooltip("Virtual desktop switch failed.")
    }
}

ShowDesktopTooltip(message) {
    ToolTip(message)
    SetTimer(ClearDesktopTooltip, -1500)
}

ClearDesktopTooltip(*) {
    ToolTip()
}

PositionActiveWindow(direction) {
    hwnd := WinExist("A")
    if !hwnd
        return

    try {
        windowTitle := "ahk_id " hwnd
        windowClass := WinGetClass(windowTitle)
        if (windowClass = "Progman" || windowClass = "WorkerW"
            || windowClass = "Shell_TrayWnd")
            return

        style := WinGetStyle(windowTitle)
        if !(style & 0x40000)
            return

        if (direction = "up") {
            WinMaximize(windowTitle)
            return
        }

        if (direction = "down") {
            if (WinGetMinMax(windowTitle) = 1)
                WinRestore(windowTitle)
            else
                WinMinimize(windowTitle)
            return
        }

        WinRestore(windowTitle)
        Sleep(50)
        WinGetPos(&x, &y, &width, &height, windowTitle)
        centerX := x + width / 2
        centerY := y + height / 2
        monitorIndex := 0

        Loop MonitorGetCount() {
            MonitorGet(
                A_Index,
                &monitorLeft,
                &monitorTop,
                &monitorRight,
                &monitorBottom
            )
            if (centerX >= monitorLeft && centerX < monitorRight
                && centerY >= monitorTop && centerY < monitorBottom) {
                monitorIndex := A_Index
                break
            }
        }

        if !monitorIndex
            throw Error("Unable to identify the window's monitor.")

        MonitorGetWorkArea(
            monitorIndex,
            &workLeft,
            &workTop,
            &workRight,
            &workBottom
        )
        frameBounds := Buffer(16, 0)
        result := DllCall(
            "Dwmapi.dll\DwmGetWindowAttribute",
            "Ptr", hwnd,
            "UInt", 9,
            "Ptr", frameBounds,
            "UInt", frameBounds.Size,
            "Int"
        )
        if result
            throw Error("DwmGetWindowAttribute failed with code " result ".")

        frameLeft := NumGet(frameBounds, 0, "Int")
        frameTop := NumGet(frameBounds, 4, "Int")
        frameRight := NumGet(frameBounds, 8, "Int")
        frameBottom := NumGet(frameBounds, 12, "Int")
        leftInset := Max(0, frameLeft - x)
        topInset := Max(0, frameTop - y)
        rightInset := Max(0, x + width - frameRight)
        bottomInset := Max(0, y + height - frameBottom)

        splitX := Floor((workLeft + workRight) / 2)
        targetLeft := (direction = "left") ? workLeft : splitX
        targetRight := (direction = "left") ? splitX : workRight
        WinMove(
            targetLeft - leftInset,
            workTop - topInset,
            targetRight - targetLeft + leftInset + rightInset,
            workBottom - workTop + topInset + bottomInset,
            windowTitle
        )
    } catch as err {
        WriteLog("Window positioning failed (" direction "): " err.Message)
    }
}

; ==========================================
; VIEW NAVIGATION
; ==========================================

ShowView(view) {
    global ASCS_App
    global ASCS_PageReady
    global ASCS_PendingView

    ASCS_PendingView := view

    ASCS_App.Show()
    ApplyWindowIcon()
    WinActivate("ahk_id " ASCS_App.Hwnd)

    try {
        ASCS_App.MoveFocus(0)
    } catch as err {
        WriteLog("WebView focus failed: " err.Message)
    }

    if ASCS_PageReady
        SendToFrontend(
            '{"type":"navigate","view":' JsonQuote(view) '}'
        )
}

ApplyWindowIcon() {
    global ASCS_App
    global ASCS_WindowIcon

    if !ASCS_WindowIcon
        return

    SendMessage(0x80, 1, ASCS_WindowIcon,, "ahk_id " ASCS_App.Hwnd)
    SendMessage(0x80, 0, ASCS_WindowIcon,, "ahk_id " ASCS_App.Hwnd)
}

; ==========================================
; WEBVIEW2 EVENT HANDLERS
; ==========================================

HandleNavigationStarting(sender, args) {
    global ASCS_PageReady

    ASCS_PageReady := false
}

HandleNavigationCompleted(sender, args) {
    if !args.IsSuccess
        WriteLog(
            "Frontend navigation failed. WebErrorStatus: "
            args.WebErrorStatus
        )
}

HandleClose(*) {
    global ASCS_App

    SendToFrontend('{"type":"flushNotes"}')
    ASCS_App.Hide()
}

; ==========================================
; FRONTEND MESSAGE DISPATCH
; ==========================================

HandleWebMessage(sender, args) {
    global ASCS_PageReady
    global ASCS_PendingView

    try {
        message := args.TryGetWebMessageAsString()

        if (message = "")
            return

        separator := InStr(message, "`n")

        if separator {
            messageType := SubStr(message, 1, separator - 1)
            content := SubStr(message, separator + 1)
        } else {
            messageType := message
            content := ""
        }

        if (StrLen(messageType) > 32) {
            WriteLog("Rejected oversized frontend message type.")
            return
        }

        switch messageType {
            case "Ready":
                if (content != "") {
                    WriteLog("Rejected malformed Ready message.")
                    return
                }

                ASCS_PageReady := true

                WriteLog("Frontend ready.")

                SendToFrontend(
                    '{"type":"navigate","view":'
                    JsonQuote(ASCS_PendingView) '}'
                )

                GetNotes()
                PushDashboard()

                SetTimer(PushDashboard, 5000)

            case "GetNotes":
                if (content = "")
                    GetNotes()
                else
                    WriteLog("Rejected GetNotes payload.")

            case "SaveNotes":
                SaveNotes(content)

            case "WindowAction":
                HandleWindowAction(content)

            case "Launch":
                if (content = "explorer" || content = "browser"
                    || content = "terminal" || content = "calculator"
                    || content = "taskmanager"
                    || content = "settings" || content = "downloads"
                    || content = "projects" || content = "snipping")
                    LaunchCommand(content)
                else
                    WriteLog("Rejected invalid launcher identifier.")

            case "GetMetrics":
                if (content = "")
                    PushDashboard()
                else
                    WriteLog("Rejected GetMetrics payload.")

            case "Log":
                if (StrLen(content) <= 4096)
                    WriteLog(content)
                else
                    WriteLog("Rejected oversized frontend log message.")

            default:
                WriteLog("Rejected unknown frontend message type: " messageType)
        }

    } catch as err {
        WriteLog("Frontend message error: " err.Message)
    }
}

HandleWindowAction(action) {
    global ASCS_App

    switch action {
        case "minimize":
            WinMinimize("ahk_id " ASCS_App.Hwnd)

        case "maximize":
            if (WinGetMinMax("ahk_id " ASCS_App.Hwnd) = 1)
                WinRestore("ahk_id " ASCS_App.Hwnd)
            else
                WinMaximize("ahk_id " ASCS_App.Hwnd)

        case "close":
            HandleClose()

        default:
            WriteLog("Rejected invalid window action.")
    }
}

SendToFrontend(json) {
    global ASCS_App
    global ASCS_PageReady

    if !ASCS_PageReady
        return false

    try {
        ASCS_App.PostWebMessageAsJson(json)
        return true
    } catch as err {
        WriteLog("Frontend messaging error: " err.Message)
        return false
    }
}

; ==========================================
; APPLICATION LAUNCHER
; ==========================================

LaunchCommand(command) {
    userProfile := EnvGet("USERPROFILE")

    try {
        switch command {
            case "explorer":
                Run("explorer.exe")

            case "browser":
                Run("https://www.google.com")

            case "terminal":
                Run("wt.exe")

            case "calculator":
                Run("calc.exe")

            case "taskmanager":
                Run("taskmgr.exe")

            case "settings":
                Run("ms-settings:")

            case "downloads":
                Run('explorer.exe "' userProfile '\Downloads"')

            case "projects":
                Run('explorer.exe "' userProfile '\Documents"')

            case "snipping":
                Send("#+s")
        }

    } catch as err {
        WriteLog("Launch failed: " command " | " err.Message)

        SendToFrontend(
            '{"type":"error","message":"Unable to launch application."}'
        )
    }
}

; ==========================================
; QUICK NOTES
; ==========================================

GetNotes() {
    global ASCS_NotesFile
    global ASCS_NotesRecovered

    recovered := false
    hadNotesFile := false
    raw := ""

    for path in [ASCS_NotesFile, ASCS_NotesFile ".bak"] {
        if !FileExist(path)
            continue
        hadNotesFile := true

        try {
            if (FileGetSize(path) > 5 * 1024 * 1024)
                throw Error("Notes file exceeds the 5 MB limit.")

            raw := FileRead(path, "UTF-8")
            raw := LTrim(raw, Chr(0xFEFF))
            if !IsValidJsonObject(raw)
                throw Error("Notes file contains invalid JSON.")

            recovered := (path != ASCS_NotesFile)
            break
        } catch as err {
            WriteLog("Notes read failed for " path ": " err.Message)
            raw := ""
        }
    }

    if (raw = "") {
        if hadNotesFile
            SendNotesError("Saved notes could not be recovered; starting with an empty collection.")
        raw := '{"version":2,"activeId":null,"notes":[]}'
    }

    ASCS_NotesRecovered := recovered
    SendToFrontend(
        '{"type":"notes","data":'
        JsonQuote(raw) ',"recovered":' (recovered ? "true" : "false") '}'
    )
}

SaveNotes(content) {
    global ASCS_NotesFile
    global ASCS_NotesRecovered

    try {
        byteCount := StrPut(content, "UTF-8") - 1
        if (byteCount > 5 * 1024 * 1024 || Trim(content) = ""
            || SubStr(LTrim(content), 1, 1) != "{") {
            SendNotesError("Notes payload is invalid or exceeds 5 MB.")
            return
        }

        tempPath := ASCS_NotesFile ".tmp"
        backupPath := ASCS_NotesFile ".bak"
        noteHandle := FileOpen(tempPath, "w", "UTF-8-RAW")

        if !noteHandle
            throw Error("Unable to open temporary notes file.")

        try {
            noteHandle.Write(content)
        } finally {
            noteHandle.Close()
        }

        if (FileExist(ASCS_NotesFile) && !ASCS_NotesRecovered)
            FileCopy(ASCS_NotesFile, backupPath, 1)

        FileMove(tempPath, ASCS_NotesFile, 1)
        ASCS_NotesRecovered := false
        SendToFrontend('{"type":"saved"}')

    } catch as err {
        WriteLog("Notes saving failed: " err.Message)
        try {
            if (IsSet(tempPath) && FileExist(tempPath))
                FileDelete(tempPath)
        }
        SendNotesError("Unable to save notes. The previous file was kept.")
    }
}

FindEverything() {
    localAppData := EnvGet("LOCALAPPDATA")

    paths := [
        A_ProgramFiles "\Everything\Everything.exe",
        A_ProgramFiles " (x86)\Everything\Everything.exe",
        localAppData "\Programs\Everything\Everything.exe",
        localAppData "\Everything\Everything.exe"
    ]

    for path in paths {
        if FileExist(path)
            return path
    }

    try {
        return RegRead(
            "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Everything.exe"
        )
    }

    try {
        return RegRead(
            "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Everything.exe"
        )
    }

    return "Everything.exe"
}

LaunchEverything() {
    global ASCS_EverythingPath

    try {
        Run('"' ASCS_EverythingPath '"')
    } catch as err {
        WriteLog("Everything launch failed: " err.Message)
        MsgBox(
            "Unable to launch Everything. Check its installation.`n`n"
            err.Message,
            "Everything",
            "Iconx"
        )
    }
}

SendNotesError(message) {
    SendToFrontend(
        '{"type":"error","scope":"notes","message":'
        JsonQuote(message) '}'
    )
}

; ==========================================
; SYSTEM DASHBOARD
; ==========================================

PushDashboard(*) {
    global ASCS_DashboardErrorShown

    try {
        wmi := ComObjGet("winmgmts:\\.\root\cimv2")

        cpuTotal := 0
        cpuCount := 0

        totalRAM := 0
        freeRAM := 0

        for cpu in wmi.ExecQuery(
            "SELECT LoadPercentage FROM Win32_Processor"
        ) {
            cpuTotal += cpu.LoadPercentage
            cpuCount++
        }

        cpuUsage := cpuCount
            ? Round(cpuTotal / cpuCount)
            : 0

        for os in wmi.ExecQuery(
            "SELECT TotalVisibleMemorySize, FreePhysicalMemory FROM Win32_OperatingSystem"
        ) {
            totalRAM := os.TotalVisibleMemorySize / 1048576
            freeRAM := os.FreePhysicalMemory / 1048576
        }

        ramUsage := totalRAM
            ? Round((totalRAM - freeRAM) / totalRAM * 100)
            : 0

        drives := GetDriveMetrics()
        diskUsage := drives["cUsage"]
        diskUsed := drives["cUsed"]
        diskTotal := drives["cTotal"]

        json := '{"type":"metrics","cpu":' cpuUsage
            . ',"ram":' ramUsage
            . ',"ramUsed":' Round(totalRAM - freeRAM, 1)
            . ',"ramTotal":' Round(totalRAM, 1)
            . ',"disk":' diskUsage
            . ',"diskUsed":' Round(diskUsed, 1)
            . ',"diskTotal":' Round(diskTotal, 1)
            . ',"drives":' drives["json"] '}'

        SendToFrontend(json)

        ASCS_DashboardErrorShown := false

    } catch as err {
        if !ASCS_DashboardErrorShown {
            WriteLog("Dashboard metrics failed: " err.Message)

            SendToFrontend(
                '{"type":"error","message":"System metrics unavailable."}'
            )

            ASCS_DashboardErrorShown := true
        }
    }
}

GetDriveMetrics() {
    global ASCS_Drives
    global ASCS_DriveCache

    drivesJson := "["
    cUsage := 0
    cUsed := 0
    cTotal := 0
    metricIndex := 0

    for drive in ASCS_Drives {
        metricIndex++
        try {
            driveType := DllCall("GetDriveTypeW", "Str", drive "\", "UInt")
        } catch as err {
            WriteLog("Drive type check failed for " drive ": " err.Message)
            driveType := 0
        }
        isSlowDrive := (driveType != 3)
        now := A_TickCount

        ; Non-fixed drives are polled at most once per 30 seconds; even status checks
        ; can wait on a disconnected share, so avoid repeating them on each five-second update.
        if (isSlowDrive && ASCS_DriveCache.Has(drive)
            && now - ASCS_DriveCache[drive]["checked"] < 30000) {
            driveMetric := ASCS_DriveCache[drive]["metric"]
        } else {
            try {
                status := DriveGetStatus(drive)
                if (status != "Ready")
                    throw Error("Drive status: " status)

                total := DriveGetCapacity(drive) / 1024
                free := DriveGetSpaceFree(drive) / 1024
                if (total <= 0)
                    throw Error("Drive capacity is unavailable.")

                used := Round(total - free, 1)
                usage := Round((total - free) / total * 100)
                driveMetric := Map(
                    "letter", drive,
                    "usage", usage,
                    "used", used,
                    "total", Round(total, 1),
                    "online", true
                )
            } catch as err {
                WriteLog("Drive metrics failed for " drive ": " err.Message)
                driveMetric := Map(
                    "letter", drive,
                    "usage", 0,
                    "used", 0,
                    "total", 0,
                    "online", false
                )
            }

            if isSlowDrive
                ASCS_DriveCache[drive] := Map(
                    "checked", now,
                    "metric", driveMetric
                )
        }

        drivesJson .= (metricIndex > 1 ? "," : "")
            . '{"letter":' JsonQuote(driveMetric["letter"])
            . ',"usage":' driveMetric["usage"]
            . ',"used":' driveMetric["used"]
            . ',"total":' driveMetric["total"]
            . ',"online":' (driveMetric["online"] ? "true" : "false") '}'

        if (drive = "C:" && driveMetric["online"]) {
            cUsage := driveMetric["usage"]
            cUsed := driveMetric["used"]
            cTotal := driveMetric["total"]
        }
    }

    drivesJson .= "]"
    return Map(
        "json", drivesJson,
        "cUsage", cUsage,
        "cUsed", cUsed,
        "cTotal", cTotal
    )
}

; ==========================================
; ACTIVITY LOG
; ==========================================

WriteLog(message := "ASCS activity") {
    global ASCS_LogFile

    try {
        FileAppend(
            FormatTime(, "yyyy-MM-dd HH:mm:ss")
            " | " message "`n",
            ASCS_LogFile,
            "UTF-8"
        )
    }
}

; ==========================================
; JSON UTILITIES
; ==========================================

JsonQuote(value) {
    output := '"'

    for char in StrSplit(value) {
        code := Ord(char)

        switch code {
            case 34:
                output .= '\"'

            case 92:
                output .= "\\"

            case 8:
                output .= "\b"

            case 9:
                output .= "\t"

            case 10:
                output .= "\n"

            case 12:
                output .= "\f"

            case 13:
                output .= "\r"

            default:
                if (code < 32)
                    output .= Format("\u{:04X}", code)
                else
                    output .= char
        }
    }

    return output '"'
}

JsonUnescape(value) {
    output := ""
    index := 1
    length := StrLen(value)

    while (index <= length) {
        char := SubStr(value, index, 1)

        if (char != "\") {
            output .= char
            index++
            continue
        }

        index++

        escaped := SubStr(value, index, 1)

        switch escaped {
            case '"':
                output .= '"'

            case "\":
                output .= "\"

            case "/":
                output .= "/"

            case "b":
                output .= Chr(8)

            case "f":
                output .= Chr(12)

            case "n":
                output .= "`n"

            case "r":
                output .= "`r"

            case "t":
                output .= "`t"

            case "u":
                hex := SubStr(value, index + 1, 4)

                if RegExMatch(hex, "^[0-9A-Fa-f]{4}$") {
                    code := Integer("0x" hex)
                    index += 4

                    ; Handle UTF-16 surrogate pairs.
                    if (
                        code >= 0xD800
                        && code <= 0xDBFF
                        && SubStr(value, index + 1, 2) = "\u"
                    ) {
                        lowHex := SubStr(value, index + 3, 4)

                        if RegExMatch(lowHex, "^[0-9A-Fa-f]{4}$") {
                            lowCode := Integer("0x" lowHex)

                            if (lowCode >= 0xDC00 && lowCode <= 0xDFFF) {
                                code := 0x10000
                                    + ((code - 0xD800) << 10)
                                    + (lowCode - 0xDC00)

                                index += 6
                            }
                        }
                    }

                    output .= Chr(code)
                }

            default:
                output .= escaped
        }

        index++
    }

    return output
}

IsValidJsonObject(text) {
    position := 1
    SkipJsonWhitespace(text, &position)
    if (SubStr(text, position, 1) != "{")
        return false

    try {
        ParseJsonValue(text, &position)
        SkipJsonWhitespace(text, &position)
        return (position > StrLen(text))
    } catch {
        return false
    }
}

ParseJsonValue(text, &position, depth := 0) {
    if (depth > 128)
        throw Error("JSON nesting exceeds the safety limit.")

    SkipJsonWhitespace(text, &position)
    char := SubStr(text, position, 1)

    if (char = Chr(34)) {
        ParseJsonString(text, &position)
        return
    }

    if (char = "{") {
        position++
        SkipJsonWhitespace(text, &position)
        if (SubStr(text, position, 1) = "}") {
            position++
            return
        }

        loop {
            if (SubStr(text, position, 1) != Chr(34))
                throw Error("Expected a JSON object key.")
            ParseJsonString(text, &position)
            SkipJsonWhitespace(text, &position)
            if (SubStr(text, position, 1) != ":")
                throw Error("Expected a JSON object colon.")
            position++
            ParseJsonValue(text, &position, depth + 1)
            SkipJsonWhitespace(text, &position)
            char := SubStr(text, position, 1)
            if (char = "}") {
                position++
                return
            }
            if (char != ",")
                throw Error("Expected a JSON object separator.")
            position++
            SkipJsonWhitespace(text, &position)
        }
    }

    if (char = "[") {
        position++
        SkipJsonWhitespace(text, &position)
        if (SubStr(text, position, 1) = "]") {
            position++
            return
        }

        loop {
            ParseJsonValue(text, &position, depth + 1)
            SkipJsonWhitespace(text, &position)
            char := SubStr(text, position, 1)
            if (char = "]") {
                position++
                return
            }
            if (char != ",")
                throw Error("Expected a JSON array separator.")
            position++
        }
    }

    for literal in ["true", "false", "null"] {
        if (SubStr(text, position, StrLen(literal)) = literal) {
            position += StrLen(literal)
            return
        }
    }

    if RegExMatch(
        SubStr(text, position),
        "^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?",
        &number
    ) {
        position += StrLen(number[0])
        return
    }

    throw Error("Invalid JSON value.")
}

ParseJsonString(text, &position) {
    position++
    length := StrLen(text)

    while (position <= length) {
        char := SubStr(text, position, 1)
        if (char = Chr(34)) {
            position++
            return
        }

        if (char = "\") {
            position++
            escaped := SubStr(text, position, 1)
            switch escaped {
                case '"', "\", "/", "b", "f", "n", "r", "t":
                    position++
                case "u":
                    hex := SubStr(text, position + 1, 4)
                    if !RegExMatch(hex, "^[0-9A-Fa-f]{4}$")
                        throw Error("Invalid JSON unicode escape.")
                    position += 5
                default:
                    throw Error("Invalid JSON string escape.")
            }
            continue
        }

        if (Ord(char) < 32)
            throw Error("Invalid control character in JSON string.")
        position++
    }

    throw Error("Unterminated JSON string.")
}

SkipJsonWhitespace(text, &position) {
    while (position <= StrLen(text)
        && InStr(" `t`r`n", SubStr(text, position, 1)))
        position++
}
