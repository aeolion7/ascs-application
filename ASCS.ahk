
#Requires AutoHotkey v2.0 64-bit
#SingleInstance Force
#Warn
#Warn LocalSameAsGlobal, Off

SetWorkingDir(A_ScriptDir)

; ==========================================
; AEOLIONWARE SUPER COMMAND SYSTEM
; Version 1.4.4
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
global ASCS_SettingsFile := ASCS_DataDir "\settings.ini"
global ASCS_WorkspaceFile := ASCS_DataDir "\workspace.ini"

global ASCS_EverythingPath := ""
global ASCS_PageReady := false
global ASCS_PendingView := "home"
global ASCS_DashboardErrorShown := false
global ASCS_DriveCache := Map()
global ASCS_DriveProbes := Map()
global ASCS_NotesRecovered := false
global ASCS_DesktopAccessorWarningShown := false
global ASCS_PendingWindowDirection := ""
global ASCS_PendingLauncher := false
global ASCS_SnapGap := 0
global ASCS_PreserveWindowSize := true
global ASCS_ActionHotkeys := Map()
global ASCS_WorkspaceRestorePending := []
global ASCS_HardwareJson := ""
; Defaults; user selections are persisted in settings.ini.
global ASCS_Drives := ["C:", "J:"]

DirCreate(ASCS_DataDir)
DirCreate(ASCS_WebViewDataDir)
LoadUserSettings()

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
        WriteLog("Application icon setup failed: " err.Message)
    }

    ; Enable host-to-frontend messaging.
    ASCS_App.Settings.IsWebMessageEnabled := true
    ASCS_App.Settings.AreDevToolsEnabled := false
    ASCS_App.Settings.AreDefaultContextMenusEnabled := false
    ASCS_App.Settings.AreBrowserAcceleratorKeysEnabled := false
    ASCS_App.Settings.IsZoomControlEnabled := false

    ; Register WebView2 events.
    ASCS_App.WebMessageReceived(HandleWebMessage)
    ASCS_App.NavigationStarting(HandleNavigationStarting)
    ASCS_App.NavigationCompleted(HandleNavigationCompleted)
    ASCS_App.NewWindowRequested(HandleNewWindowRequested)

    ; Handle window close without terminating ASCS.
    ASCS_App.OnEvent("Close", HandleClose)
    ASCS_App.OnEvent("Size", HandleASCSSize)

    ; Map the frontend directory to a local HTTPS origin.
    ASCS_App.BrowseFolder(
        A_ScriptDir "\frontend",
        "ascs.localhost"
    )

    ; Load the frontend.
    ASCS_App.Navigate("https://ascs.localhost/index.html")

    ; Keep the application hidden at startup.
    ASCS_App.Hide()

    WriteLog("ASCS 1.4.4 initialized.")

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

F24 & Space::ShowCommandLauncher()

F24 & l::DllCall("LockWorkStation")
F24 & m::SoundSetMute(!SoundGetMute())
F24 & v::Send("#v")
F24 & b::LaunchVivaldi()

F24 & j::SendText(FormatTime(, "yyyy-MM-dd HH:mm:ss"))
F24 & y::SendText(FormatTime(, "yyyy-MM-dd"))

F24 & s:: {
    if GetKeyState("Shift", "P")
        Send("#+s")
    else
        SaveWorkspace()
}

F24 & r::RestoreWorkspace()

F24 & Left::HandleHorizontalWindowShortcut(-1)
F24 & Right::HandleHorizontalWindowShortcut(1)
F24 & Up::HandleWindowDirection("up")
F24 & Down::HandleWindowDirection("down")

RegisterDesktopHotkeys()
RegisterConfiguredHotkeys()

RegisterDesktopHotkeys() {
    numpadOffNames := [
        "NumpadEnd", "NumpadDown", "NumpadPgDn",
        "NumpadLeft", "NumpadClear", "NumpadRight",
        "NumpadHome", "NumpadUp", "NumpadPgUp"
    ]

    Loop 9 {
        number := A_Index
        Hotkey("F24 & " number, HandleDesktopShortcut.Bind(number))
        Hotkey("F24 & Numpad" number, HandleDesktopShortcut.Bind(number))
        Hotkey(
            "F24 & " numpadOffNames[number],
            HandleDesktopShortcut.Bind(number)
        )
    }
}

RegisterConfiguredHotkeys() {
    global ASCS_ActionHotkeys

    callbacks := Map(
        "notes", ShowView.Bind("notes"),
        "everything", LaunchEverything,
        "dashboard", ShowView.Bind("dashboard"),
        "terminal", LaunchCommand.Bind("terminal"),
        "explorer", LaunchCommand.Bind("explorer"),
        "calculator", LaunchCommand.Bind("calculator"),
        "taskmanager", LaunchCommand.Bind("taskmanager")
    )

    for action, key in ASCS_ActionHotkeys
        Hotkey("F24 & " key, callbacks[action], "On")
}

LoadUserSettings() {
    global ASCS_SettingsFile
    global ASCS_Drives
    global ASCS_SnapGap
    global ASCS_PreserveWindowSize
    global ASCS_ActionHotkeys

    try {
        ASCS_Drives := ParseDriveList(
            IniRead(ASCS_SettingsFile, "General", "Drives", "C:,J:")
        )
    } catch as err {
        WriteLog("Invalid drive preferences; using C: and J:. " err.Message)
        ASCS_Drives := ["C:", "J:"]
    }

    gap := IniRead(ASCS_SettingsFile, "Window", "SnapGap", "0")
    if RegExMatch(gap, "^\d+$") && Integer(gap) <= 48
        ASCS_SnapGap := Integer(gap)
    else
        WriteLog("Invalid snap gap preference; using 0.")

    ASCS_PreserveWindowSize :=
        IniRead(ASCS_SettingsFile, "Window", "PreserveSize", "1") = "1"

    defaults := Map(
        "notes", "q",
        "everything", "f",
        "dashboard", "i",
        "terminal", "t",
        "explorer", "e",
        "calculator", "c",
        "taskmanager", "h"
    )
    keys := Map()
    used := Map()
    try {
        for action, defaultKey in defaults {
            key := StrLower(IniRead(
                ASCS_SettingsFile,
                "Hotkeys",
                action,
                defaultKey
            ))
            if !RegExMatch(key, "^[a-z]$")
                throw Error("Hotkeys must be single letters.")
            if InStr("bsrlmvjy", key)
                throw Error("Hotkey conflicts with a reserved command.")
            if used.Has(key)
                throw Error("Hotkey assignments must be unique.")
            used[key] := true
            keys[action] := key
        }
        ASCS_ActionHotkeys := keys
    } catch as err {
        WriteLog("Invalid shortcut preferences; using defaults. " err.Message)
        ASCS_ActionHotkeys := defaults
    }
}

ParseDriveList(value) {
    drives := []
    seen := Map()

    for candidate in StrSplit(value, ",") {
        drive := StrUpper(Trim(candidate))
        if !RegExMatch(drive, "^[A-Z]:$")
            throw Error("Drive entries must be letters followed by a colon.")
        if seen.Has(drive)
            throw Error("Drive entries must be unique.")
        seen[drive] := true
        drives.Push(drive)
        if (drives.Length > 12)
            throw Error("At most 12 drives can be monitored.")
    }

    if !drives.Length
        throw Error("At least one drive is required.")
    return drives
}

SaveUserSettings(content) {
    global ASCS_SettingsFile
    global ASCS_Drives
    global ASCS_DriveCache
    global ASCS_SnapGap
    global ASCS_PreserveWindowSize
    global ASCS_ActionHotkeys

    try {
        fields := StrSplit(content, "|")
        if (fields.Length != 4)
            throw Error("Settings payload has an invalid shape.")

        drives := ParseDriveList(fields[1])
        if !RegExMatch(fields[2], "^\d+$") || Integer(fields[2]) > 48
            throw Error("Snap gap must be between 0 and 48 pixels.")
        if !(fields[3] = "0" || fields[3] = "1")
            throw Error("Preserve window size must be enabled or disabled.")

        names := ["notes", "everything", "dashboard", "terminal",
            "explorer", "calculator", "taskmanager"]
        keys := StrSplit(fields[4], ",")
        if (keys.Length != names.Length)
            throw Error("Shortcut preferences are incomplete.")

        hotkeys := Map()
        used := Map()
        Loop names.Length {
            key := StrLower(Trim(keys[A_Index]))
            if !RegExMatch(key, "^[a-z]$")
                throw Error("Shortcuts must be single letters.")
            if InStr("bsrlmvjy", key)
                throw Error("That letter is reserved for a built-in command.")
            if used.Has(key)
                throw Error("Each shortcut must use a unique letter.")
            used[key] := true
            hotkeys[names[A_Index]] := key
        }

        previousHotkeys := ASCS_ActionHotkeys
        IniWrite(JoinArray(drives, ","), ASCS_SettingsFile, "General", "Drives")
        IniWrite(fields[2], ASCS_SettingsFile, "Window", "SnapGap")
        IniWrite(fields[3], ASCS_SettingsFile, "Window", "PreserveSize")
        for action, key in hotkeys
            IniWrite(key, ASCS_SettingsFile, "Hotkeys", action)

        for action, key in previousHotkeys
            Hotkey("F24 & " key, "Off")

        ASCS_Drives := drives
        ASCS_DriveCache.Clear()
        ASCS_SnapGap := Integer(fields[2])
        ASCS_PreserveWindowSize := fields[3] = "1"
        ASCS_ActionHotkeys := hotkeys
        RegisterConfiguredHotkeys()

        SendToFrontend(
            '{"type":"settingsSaved","message":"Preferences saved and applied."}'
        )
    } catch as err {
        WriteLog("Settings save failed: " err.Message)
        SendToFrontend(
            '{"type":"error","message":' JsonQuote(err.Message) '}'
        )
    }
}

JoinArray(items, separator) {
    output := ""
    for index, item in items
        output .= (index > 1 ? separator : "") item
    return output
}

SendSettings() {
    global ASCS_Drives
    global ASCS_SnapGap
    global ASCS_PreserveWindowSize
    global ASCS_ActionHotkeys

    drives := "["
    for index, drive in ASCS_Drives
        drives .= (index > 1 ? "," : "") JsonQuote(drive)
    drives .= "]"

    hotkeys := "{"
    index := 0
    for action, key in ASCS_ActionHotkeys {
        index++
        hotkeys .= (index > 1 ? "," : "")
            . JsonQuote(action) ":" JsonQuote(key)
    }
    hotkeys .= "}"

    SendToFrontend(
        '{"type":"settings","drives":' drives
        ',"snapGap":' ASCS_SnapGap
        ',"preserveSize":' (ASCS_PreserveWindowSize ? "true" : "false")
        ',"hotkeys":' hotkeys '}'
    )
}

SaveWorkspace() {
    global ASCS_App
    global ASCS_WorkspaceFile

    try {
        tempPath := ASCS_WorkspaceFile ".tmp"
        if FileExist(tempPath)
            FileDelete(tempPath)

        windows := []
        for hwnd in WinGetList() {
            if (hwnd = ASCS_App.Hwnd)
                continue

            title := WinGetTitle("ahk_id " hwnd)
            if (title = "" || !DllCall("IsWindowVisible", "Ptr", hwnd, "Int"))
                continue

            if (WinGetMinMax("ahk_id " hwnd) = -1)
                continue

            exStyle := WinGetExStyle("ahk_id " hwnd)
            if (exStyle & 0x80)
                continue

            path := WinGetProcessPath("ahk_id " hwnd)
            process := WinGetProcessName("ahk_id " hwnd)
            if (path = "" || process = "")
                continue

            WinGetPos(&x, &y, &width, &height, "ahk_id " hwnd)
            context := GetWindowPlacementContext(hwnd)
            workWidth := Max(1, context["workRight"] - context["workLeft"])
            workHeight := Max(1, context["workBottom"] - context["workTop"])
            windows.Push(Map(
                "path", path,
                "process", process,
                "title", title,
                "monitor", context["monitor"],
                "x", (x - context["workLeft"]) / workWidth,
                "y", (y - context["workTop"]) / workHeight,
                "width", width / workWidth,
                "height", height / workHeight,
                "maximized", WinGetMinMax("ahk_id " hwnd) = 1
            ))
            if (windows.Length >= 24)
                break
        }

        IniWrite(windows.Length, tempPath, "Workspace", "WindowCount")
        for index, savedWindow in windows {
            section := "Window" index
            for key, value in savedWindow
                IniWrite(value, tempPath, section, key)
        }
        FileMove(tempPath, ASCS_WorkspaceFile, 1)
        ShowDesktopTooltip("Workspace saved (" windows.Length " windows).")
        WriteLog("Workspace saved with " windows.Length " windows.")
    } catch as err {
        WriteLog("Workspace save failed: " err.Message)
        ShowDesktopTooltip("Unable to save workspace.")
        try {
            if (IsSet(tempPath) && FileExist(tempPath))
                FileDelete(tempPath)
        }
    }
}

RestoreWorkspace() {
    global ASCS_WorkspaceFile
    global ASCS_WorkspaceRestorePending

    if !FileExist(ASCS_WorkspaceFile) {
        ShowDesktopTooltip("No saved workspace was found.")
        return
    }

    try {
        count := Integer(IniRead(
            ASCS_WorkspaceFile,
            "Workspace",
            "WindowCount",
            "0"
        ))
        if (count < 1 || count > 24)
            throw Error("Saved workspace has an invalid window count.")

        ASCS_WorkspaceRestorePending := []
        for index in Range(1, count) {
            section := "Window" index
            path := IniRead(ASCS_WorkspaceFile, section, "path", "")
            process := IniRead(ASCS_WorkspaceFile, section, "process", "")
            title := IniRead(ASCS_WorkspaceFile, section, "title", "")
            if (title = "" || !IsValidWorkspaceExecutable(path, process)) {
                WriteLog("Skipped an invalid or unavailable workspace executable.")
                continue
            }

            record := Map(
                "path", path,
                "process", process,
                "title", title,
                "monitor", Max(1, Integer(IniRead(ASCS_WorkspaceFile, section, "monitor", "1"))),
                "x", Float(IniRead(ASCS_WorkspaceFile, section, "x", "0")),
                "y", Float(IniRead(ASCS_WorkspaceFile, section, "y", "0")),
                "width", Float(IniRead(ASCS_WorkspaceFile, section, "width", "0.8")),
                "height", Float(IniRead(ASCS_WorkspaceFile, section, "height", "0.8")),
                "maximized", IniRead(ASCS_WorkspaceFile, section, "maximized", "0") = "1",
                "deadline", A_TickCount + 20000,
                "launched", false,
                "hwnd", 0
            )
            ASCS_WorkspaceRestorePending.Push(record)
        }

        if !ASCS_WorkspaceRestorePending.Length {
            ShowDesktopTooltip("No saved applications are available.")
            return
        }

        RestoreWorkspaceWindows()
        SetTimer(RestoreWorkspaceWindows, 500)
        ShowDesktopTooltip("Restoring saved workspace.")
    } catch as err {
        WriteLog("Workspace restore failed: " err.Message)
        ShowDesktopTooltip("Unable to restore workspace.")
    }
}

IsValidWorkspaceExecutable(path, process) {
    if (path = "" || process = "" || InStr(path, '"')
        || RegExMatch(path, "[\x00-\x1F]")
        || !RegExMatch(path, "i)^[A-Z]:\\"))
        return false

    SplitPath(path, &fileName)
    if (StrLower(fileName) != StrLower(process)
        || !RegExMatch(fileName, "i)^[A-Z0-9_. -]+\.exe$"))
        return false

    attributes := FileExist(path)
    return (attributes != "" && !InStr(attributes, "D"))
}

RestoreWorkspaceWindows(*) {
    global ASCS_App
    global ASCS_WorkspaceRestorePending

    remaining := []
    usedWindows := Map()
    for record in ASCS_WorkspaceRestorePending {
        matchedHwnd := record["hwnd"]
        try {
            if (matchedHwnd && (!WinExist("ahk_id " matchedHwnd)
                || WinGetProcessName("ahk_id " matchedHwnd) != record["process"]
                || usedWindows.Has(matchedHwnd)))
                matchedHwnd := 0
        } catch as err {
            WriteLog("Workspace window verification failed: " err.Message)
            matchedHwnd := 0
        }
        record["hwnd"] := matchedHwnd
        try {
            if !matchedHwnd {
                for hwnd in WinGetList("ahk_exe " record["process"]) {
                    if (hwnd = ASCS_App.Hwnd || usedWindows.Has(hwnd))
                        continue
                    if (WinGetTitle("ahk_id " hwnd) = record["title"]) {
                        matchedHwnd := hwnd
                        break
                    }
                }
            }
        } catch as err {
            WriteLog("Workspace window lookup failed: " err.Message)
        }

        if matchedHwnd {
            usedWindows[matchedHwnd] := true
            record["hwnd"] := matchedHwnd
            try {
                windowTitle := "ahk_id " matchedHwnd
                WinRestore(windowTitle)
                context := GetWindowPlacementContext(matchedHwnd)
                monitor := Min(record["monitor"], MonitorGetCount())
                MonitorGetWorkArea(
                    monitor,
                    &left,
                    &top,
                    &right,
                    &bottom
                )
                workWidth := right - left
                workHeight := bottom - top
                width := Min(Round(record["width"] * workWidth), workWidth)
                height := Min(Round(record["height"] * workHeight), workHeight)
                x := left + Round(record["x"] * workWidth)
                y := top + Round(record["y"] * workHeight)
                MoveWindowIntoWorkArea(
                    matchedHwnd,
                    x,
                    y,
                    width,
                    height,
                    left,
                    top,
                    right,
                    bottom,
                    context
                )
                if record["maximized"]
                    WinMaximize(windowTitle)
            } catch as err {
                WriteLog("Workspace window placement failed: " err.Message)
            }
            continue
        }

        if !record["launched"] {
            try {
                Run('"' record["path"] '"')
                record["launched"] := true
            } catch as err {
                WriteLog("Workspace application launch failed: " err.Message)
                continue
            }
        }

        if (A_TickCount < record["deadline"])
            remaining.Push(record)
        else
            WriteLog("Workspace restore timed out for " record["path"])
    }

    ASCS_WorkspaceRestorePending := remaining
    if !remaining.Length
        SetTimer(RestoreWorkspaceWindows, 0)
}

Range(start, end) {
    result := []
    Loop end - start + 1
        result.Push(start + A_Index - 1)
    return result
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

        switched := DllCall(
            dll "\GoToDesktopNumber",
            "Int", number - 1,
            "Int"
        )
        if (switched < 0)
            throw Error("VirtualDesktopAccessor could not switch desktops.")
    } catch as err {
        WriteLog("VirtualDesktopAccessor failed; desktop switch was not performed: " err.Message)
        ShowDesktopTooltip("Virtual desktop switch failed.")
    }
}

MoveActiveWindowToDesktop(number, thisHotkey := "") {
    global ASCS_VirtualDesktopDllPath

    hwnd := GetActiveResizableWindow()
    if !hwnd
        return

    if !FileExist(ASCS_VirtualDesktopDllPath) {
        ShowDesktopTooltip("Add VirtualDesktopAccessor.dll to move windows between desktops.")
        return
    }

    try {
        dll := ASCS_VirtualDesktopDllPath
        desktopCount := DllCall(dll "\GetDesktopCount", "Int")
        if (desktopCount < 1)
            throw Error("VirtualDesktopAccessor returned an invalid desktop count.")
        if (number < 1 || number > desktopCount)
            return

        moved := DllCall(
            dll "\MoveWindowToDesktopNumber",
            "Ptr", hwnd,
            "Int", number - 1,
            "Int"
        )
        if (moved < 0)
            throw Error("VirtualDesktopAccessor rejected the window move.")

        switched := DllCall(
            dll "\GoToDesktopNumber",
            "Int", number - 1,
            "Int"
        )
        if (switched < 0)
            throw Error("VirtualDesktopAccessor could not switch desktops.")
    } catch as err {
        WriteLog("Window desktop move failed: " err.Message)
        ShowDesktopTooltip("Unable to move the window to that desktop.")
    }
}

ShowDesktopTooltip(message) {
    ToolTip(message)
    SetTimer(ClearDesktopTooltip, -1500)
}

ClearDesktopTooltip(*) {
    ToolTip()
}

HandleWindowDirection(direction) {
    global ASCS_PendingWindowDirection

    pending := ASCS_PendingWindowDirection
    if (pending != "") {
        SetTimer(ExecutePendingWindowDirection, 0)
        ASCS_PendingWindowDirection := ""

        if (IsHorizontalDirection(pending) != IsHorizontalDirection(direction)) {
            horizontal := IsHorizontalDirection(pending) ? pending : direction
            vertical := IsHorizontalDirection(pending) ? direction : pending
            quadrant := (vertical = "up" ? "top-" : "bottom-") horizontal
            PositionActiveWindow(quadrant)
            return
        }

        PositionActiveWindow(pending)
    }

    ASCS_PendingWindowDirection := direction
    SetTimer(ExecutePendingWindowDirection, -150)
}

ExecutePendingWindowDirection(*) {
    global ASCS_PendingWindowDirection

    direction := ASCS_PendingWindowDirection
    ASCS_PendingWindowDirection := ""
    if (direction != "")
        PositionActiveWindow(direction)
}

IsHorizontalDirection(direction) {
    return (direction = "left" || direction = "right")
}

HandleHorizontalWindowShortcut(direction) {
    if GetKeyState("Shift", "P")
        MoveActiveWindowToAdjacentMonitor(direction)
    else
        HandleWindowDirection(direction < 0 ? "left" : "right")
}

HandleDesktopShortcut(number, thisHotkey := "") {
    if GetKeyState("Shift", "P")
        MoveActiveWindowToDesktop(number)
    else
        SwitchVirtualDesktop(number)
}

GetActiveResizableWindow() {
    global ASCS_App

    hwnd := WinExist("A")
    if !hwnd
        return 0
    if (hwnd = ASCS_App.Hwnd)
        return 0

    try {
        windowTitle := "ahk_id " hwnd
        windowClass := WinGetClass(windowTitle)
        if (windowClass = "Progman" || windowClass = "WorkerW"
            || windowClass = "Shell_TrayWnd")
            return 0

        style := WinGetStyle(windowTitle)
        if !(style & 0x40000)
            return 0

        return hwnd
    } catch as err {
        WriteLog("Unable to inspect active window: " err.Message)
        return 0
    }
}

GetWindowPlacementContext(hwnd) {
    windowTitle := "ahk_id " hwnd
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

    return Map(
        "title", windowTitle,
        "x", x,
        "y", y,
        "width", width,
        "height", height,
        "monitor", monitorIndex,
        "workLeft", workLeft,
        "workTop", workTop,
        "workRight", workRight,
        "workBottom", workBottom,
        "leftInset", Max(0, frameLeft - x),
        "topInset", Max(0, frameTop - y),
        "rightInset", Max(0, x + width - frameRight),
        "bottomInset", Max(0, y + height - frameBottom)
    )
}

MoveWindowIntoWorkArea(hwnd, x, y, width, height, workLeft, workTop, workRight, workBottom, context) {
    width := Min(width, workRight - workLeft)
    height := Min(height, workBottom - workTop)
    x := Max(workLeft, Min(x, workRight - width))
    y := Max(workTop, Min(y, workBottom - height))

    WinMove(
        x - context["leftInset"],
        y - context["topInset"],
        width + context["leftInset"] + context["rightInset"],
        height + context["topInset"] + context["bottomInset"],
        "ahk_id " hwnd
    )
}

PositionActiveWindow(direction) {
    global ASCS_SnapGap

    hwnd := GetActiveResizableWindow()
    if !hwnd
        return

    windowTitle := "ahk_id " hwnd

    try {
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
        Sleep(30)
        context := GetWindowPlacementContext(hwnd)
        workLeft := context["workLeft"] + ASCS_SnapGap
        workTop := context["workTop"] + ASCS_SnapGap
        workRight := context["workRight"] - ASCS_SnapGap
        workBottom := context["workBottom"] - ASCS_SnapGap
        splitX := Floor((workLeft + workRight) / 2)
        splitY := Floor((workTop + workBottom) / 2)

        switch direction {
            case "left":
                targetLeft := workLeft
                targetTop := workTop
                targetRight := splitX - Floor(ASCS_SnapGap / 2)
                targetBottom := workBottom
            case "right":
                targetLeft := splitX + Ceil(ASCS_SnapGap / 2)
                targetTop := workTop
                targetRight := workRight
                targetBottom := workBottom
            case "top":
                targetLeft := workLeft
                targetTop := workTop
                targetRight := workRight
                targetBottom := splitY - Floor(ASCS_SnapGap / 2)
            case "bottom":
                targetLeft := workLeft
                targetTop := splitY + Ceil(ASCS_SnapGap / 2)
                targetRight := workRight
                targetBottom := workBottom
            case "top-left":
                targetLeft := workLeft
                targetTop := workTop
                targetRight := splitX - Floor(ASCS_SnapGap / 2)
                targetBottom := splitY - Floor(ASCS_SnapGap / 2)
            case "top-right":
                targetLeft := splitX + Ceil(ASCS_SnapGap / 2)
                targetTop := workTop
                targetRight := workRight
                targetBottom := splitY - Floor(ASCS_SnapGap / 2)
            case "bottom-left":
                targetLeft := workLeft
                targetTop := splitY + Ceil(ASCS_SnapGap / 2)
                targetRight := splitX - Floor(ASCS_SnapGap / 2)
                targetBottom := workBottom
            case "bottom-right":
                targetLeft := splitX + Ceil(ASCS_SnapGap / 2)
                targetTop := splitY + Ceil(ASCS_SnapGap / 2)
                targetRight := workRight
                targetBottom := workBottom
            default:
                throw Error("Unsupported snap direction.")
        }

        WinMove(
            targetLeft - context["leftInset"],
            targetTop - context["topInset"],
            targetRight - targetLeft + context["leftInset"] + context["rightInset"],
            targetBottom - targetTop + context["topInset"] + context["bottomInset"],
            windowTitle
        )
    } catch as err {
        WriteLog("Window positioning failed (" direction "): " err.Message)
    }
}

MoveActiveWindowToAdjacentMonitor(direction) {
    global ASCS_PreserveWindowSize

    hwnd := GetActiveResizableWindow()
    if !hwnd
        return

    try {
        windowTitle := "ahk_id " hwnd
        if (WinGetMinMax(windowTitle) != 0)
            WinRestore(windowTitle)
        Sleep(30)
        context := GetWindowPlacementContext(hwnd)
        sourceX := (context["workLeft"] + context["workRight"]) / 2
        sourceY := (context["workTop"] + context["workBottom"]) / 2
        bestMonitor := 0
        bestDistance := 1.0e20

        Loop MonitorGetCount() {
            if (A_Index = context["monitor"])
                continue
            MonitorGetWorkArea(
                A_Index,
                &left,
                &top,
                &right,
                &bottom
            )
            targetX := (left + right) / 2
            targetY := (top + bottom) / 2
            horizontalDistance := targetX - sourceX
            if ((direction > 0 && horizontalDistance <= 0)
                || (direction < 0 && horizontalDistance >= 0))
                continue

            distance := Abs(horizontalDistance) + Abs(targetY - sourceY) * 1.5
            if (distance < bestDistance) {
                bestDistance := distance
                bestMonitor := A_Index
            }
        }

        if !bestMonitor {
            ShowDesktopTooltip("No monitor in that direction.")
            return
        }

        MonitorGetWorkArea(
            bestMonitor,
            &targetLeft,
            &targetTop,
            &targetRight,
            &targetBottom
        )

        if ASCS_PreserveWindowSize {
            relativeX := (context["x"] - context["workLeft"])
                / Max(1, context["workRight"] - context["workLeft"])
            relativeY := (context["y"] - context["workTop"])
                / Max(1, context["workBottom"] - context["workTop"])
            targetX := targetLeft + Round(relativeX
                * (targetRight - targetLeft - context["width"]))
            targetY := targetTop + Round(relativeY
                * (targetBottom - targetTop - context["height"]))
            MoveWindowIntoWorkArea(
                hwnd,
                targetX,
                targetY,
                context["width"],
                context["height"],
                targetLeft,
                targetTop,
                targetRight,
                targetBottom,
                context
            )
        } else {
            WinMove(
                targetLeft - context["leftInset"],
                targetTop - context["topInset"],
                targetRight - targetLeft + context["leftInset"] + context["rightInset"],
                targetBottom - targetTop + context["topInset"] + context["bottomInset"],
                windowTitle
            )
        }
    } catch as err {
        WriteLog("Monitor move failed: " err.Message)
    }
}

; ==========================================
; VIEW NAVIGATION
; ==========================================

ShowCommandLauncher() {
    global ASCS_PendingLauncher

    ASCS_PendingLauncher := true
    ShowView("home")
    SetTimer(DispatchPendingLauncher, -100)
}

DispatchPendingLauncher(*) {
    global ASCS_PendingLauncher
    global ASCS_PageReady

    if !ASCS_PendingLauncher
        return
    if ASCS_PageReady {
        ASCS_PendingLauncher := false
        SendToFrontend('{"type":"openLauncher"}')
    } else {
        SetTimer(DispatchPendingLauncher, -100)
    }
}

ShowView(view, thisHotkey := "") {
    global ASCS_App
    global ASCS_PageReady
    global ASCS_PendingView

    ASCS_PendingView := view

    ASCS_App.Show()
    WinActivate("ahk_id " ASCS_App.Hwnd)
    StartDashboardPolling()

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

    hwnd := ASCS_App.Hwnd
    if !DllCall("IsWindow", "Ptr", hwnd, "Int")
        throw Error("ASCS window handle is invalid")

    DllCall("SendMessageW", "Ptr", hwnd, "UInt", 0x80, "Ptr", 1, "Ptr", ASCS_WindowIcon, "Ptr")
    DllCall("SendMessageW", "Ptr", hwnd, "UInt", 0x80, "Ptr", 0, "Ptr", ASCS_WindowIcon, "Ptr")
}

; ==========================================
; WEBVIEW2 EVENT HANDLERS
; ==========================================

HandleNavigationStarting(sender, args) {
    global ASCS_PageReady

    if !IsTrustedWebViewUrl(args.Uri) {
        args.Cancel := true
        WriteLog("Blocked navigation outside the ASCS origin.")
        return
    }

    ASCS_PageReady := false
}

HandleNewWindowRequested(sender, args) {
    args.Handled := true
    WriteLog("Blocked a WebView request to open a new window.")
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
    SetTimer(PushDashboard, 0)
}

HandleASCSSize(guiObj, minMax, width, height) {
    global ASCS_PageReady

    if (minMax = -1) {
        SetTimer(PushDashboard, 0)
    } else if ASCS_PageReady {
        SetTimer(PushDashboard, 5000)
    }
}

; ==========================================
; FRONTEND MESSAGE DISPATCH
; ==========================================

HandleWebMessage(sender, args) {
    global ASCS_PageReady
    global ASCS_PendingView
    global ASCS_PendingLauncher

    try {
        if !IsTrustedWebViewUrl(args.Source) {
            WriteLog("Rejected a WebView message from an untrusted origin.")
            return
        }

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
                SendSettings()
                if ASCS_PendingLauncher {
                    ASCS_PendingLauncher := false
                    SendToFrontend('{"type":"openLauncher"}')
                }

                StartDashboardPolling()

            case "GetNotes":
                if (content = "")
                    GetNotes()
                else
                    WriteLog("Rejected GetNotes payload.")

            case "SaveNotes":
                SaveNotes(content)

            case "GetSettings":
                if (content = "")
                    SendSettings()
                else
                    WriteLog("Rejected GetSettings payload.")

            case "SaveSettings":
                SaveUserSettings(content)

            case "WindowAction":
                HandleWindowAction(content)

            case "Launch":
                if (content = "everything")
                    LaunchEverything()
                else if (content = "explorer" || content = "browser"
                    || content = "vivaldi"
                    || content = "terminal" || content = "calculator"
                    || content = "taskmanager"
                    || content = "settings" || content = "downloads"
                    || content = "projects" || content = "snipping"
                    || content = "lock" || content = "mute")
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

IsTrustedWebViewUrl(url) {
    return RegExMatch(
        url,
        "i)^https://ascs\.localhost(?::443)?(?:[/?#]|$)"
    )
}

StartDashboardPolling() {
    global ASCS_PageReady

    if !ASCS_PageReady
        return

    SetTimer(PushDashboard, 5000)
    PushDashboard()
}

IsDashboardWindowVisible() {
    global ASCS_App

    try {
        return (DllCall("IsWindowVisible", "Ptr", ASCS_App.Hwnd, "Int")
            && WinGetMinMax("ahk_id " ASCS_App.Hwnd) != -1)
    } catch as err {
        WriteLog("Dashboard visibility check failed: " err.Message)
        return false
    }
}

HandleWindowAction(action) {
    global ASCS_App

    switch action {
        case "minimize":
            WinMinimize("ahk_id " ASCS_App.Hwnd)
            SetTimer(PushDashboard, 0)

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

RunAndActivate(target, fallbackWindow := "") {
    pid := 0
    Run(target,,, &pid)

    if pid {
        processWindow := "ahk_pid " pid
        if WinWait(processWindow,, 8) {
            WinActivate(processWindow)
            if WinWaitActive(processWindow,, 2)
                return true
        }
    }

    if (fallbackWindow != "" && WinWait(fallbackWindow,, 2)) {
        WinActivate(fallbackWindow)
        if WinWaitActive(fallbackWindow,, 2)
            return true
    }

    WriteLog("Launched application window could not be activated: " target)
    return false
}

GetExplorerWindows() {
    previousDetectHidden := A_DetectHiddenWindows
    try {
        DetectHiddenWindows(true)
        windows := []
        seen := Map()
        for className in ["CabinetWClass", "ExploreWClass"] {
            for hwnd in WinGetList("ahk_class " className) {
                if !seen.Has(hwnd) && DllCall("IsWindowVisible", "Ptr", hwnd, "Int") {
                    seen[hwnd] := true
                    windows.Push(hwnd)
                }
            }
        }
    } finally {
        DetectHiddenWindows(previousDetectHidden)
    }

    return windows
}

RunAndActivateExplorer(target, openRequestedFolder := false) {
    existingWindows := Map()
    existingExplorerWindows := GetExplorerWindows()
    for hwnd in existingExplorerWindows
        existingWindows[hwnd] := true

    if (existingExplorerWindows.Length && !openRequestedFolder) {
        ActivateExplorerWindow(existingExplorerWindows[1])
        return true
    }

    Run(target)
    deadline := A_TickCount + 8000
    selectedWindow := 0

    while (A_TickCount < deadline) {
        windows := GetExplorerWindows()
        for hwnd in windows {
            if !existingWindows.Has(hwnd) {
                selectedWindow := hwnd
                break
            }
        }
        if selectedWindow
            break
        Sleep(100)
    }

    if !selectedWindow {
        windows := GetExplorerWindows()
        if windows.Length
            selectedWindow := windows[1]
    }

    if !selectedWindow {
        throw Error("File Explorer window did not appear: " target)
    }

    ActivateExplorerWindow(selectedWindow)
    return true
}

ActivateExplorerWindow(hwnd) {
    window := "ahk_id " hwnd
    WinActivate(window)
    if !WinWaitActive(window,, 2)
        throw Error("File Explorer window could not be activated: " hwnd)
}

LaunchCommand(command, thisHotkey := "") {
    userProfile := EnvGet("USERPROFILE")

    try {
        switch command {
            case "explorer":
                RunAndActivateExplorer("explorer.exe")

            case "browser":
                RunAndActivate("https://www.google.com")

            case "vivaldi":
                LaunchVivaldi()

            case "terminal":
                RunAndActivate("wt.exe", "ahk_exe WindowsTerminal.exe")

            case "calculator":
                RunAndActivate("calc.exe", "Calculator")

            case "taskmanager":
                RunAndActivate("taskmgr.exe", "ahk_exe Taskmgr.exe")

            case "settings":
                RunAndActivate("ms-settings:", "ahk_exe SystemSettings.exe")

            case "downloads":
                RunAndActivateExplorer(
                    'explorer.exe "' userProfile '\Downloads"',
                    true
                )

            case "projects":
                RunAndActivateExplorer(
                    'explorer.exe "' userProfile '\Documents"',
                    true
                )

            case "snipping":
                Send("#+s")

            case "lock":
                DllCall("LockWorkStation")

            case "mute":
                SoundSetMute(!SoundGetMute())
        }

    } catch as err {
        WriteLog("Launch failed: " command " | " err.Message)

        SendToFrontend(
            '{"type":"error","message":"Unable to launch application."}'
        )
    }
}

LaunchVivaldi() {
    try {
        windows := GetVivaldiWindows()
        if windows.Length {
            FocusVivaldiWindow(windows)
            return true
        }

        launched := RunAndActivate(
            '"' FindVivaldi() '"',
            "ahk_exe vivaldi.exe"
        )
        if !launched
            throw Error("Vivaldi did not open or could not be activated.")
        return true
    } catch as err {
        WriteLog("Vivaldi focus or launch failed: " err.Message)
        MsgBox(
            "Unable to focus or open Vivaldi.`n`n" err.Message,
            "Vivaldi",
            "Iconx"
        )
        return false
    }
}

GetVivaldiWindows() {
    previousDetectHidden := A_DetectHiddenWindows
    try {
        DetectHiddenWindows(true)
        windows := WinGetList("ahk_exe vivaldi.exe")
    } finally {
        DetectHiddenWindows(previousDetectHidden)
    }

    visibleWindows := []
    for hwnd in windows {
        if DllCall("IsWindowVisible", "Ptr", hwnd, "Int")
            visibleWindows.Push(hwnd)
    }
    return visibleWindows
}

FocusVivaldiWindow(windows) {
    global ASCS_VirtualDesktopDllPath

    if !FileExist(ASCS_VirtualDesktopDllPath)
        throw Error(
            "Vivaldi is open, but its virtual desktop cannot be detected. "
            "Install VirtualDesktopAccessor.dll with GetCurrentDesktopNumber "
            "and GetWindowDesktopNumber exports."
        )

    dll := ASCS_VirtualDesktopDllPath
    currentDesktop := DllCall(dll "\GetCurrentDesktopNumber", "Int")
    if (currentDesktop < 0)
        throw Error("Unable to determine the current virtual desktop.")

    currentDesktopWindow := 0
    firstWindow := windows[1]
    firstWindowDesktop := -1
    for hwnd in windows {
        desktop := DllCall(
            dll "\GetWindowDesktopNumber",
            "Ptr", hwnd,
            "Int"
        )
        if (desktop < 0)
            throw Error("Unable to determine a Vivaldi window's virtual desktop.")

        if (hwnd = firstWindow)
            firstWindowDesktop := desktop
        if (desktop = currentDesktop) {
            currentDesktopWindow := hwnd
            break
        }
    }

    hwnd := currentDesktopWindow ? currentDesktopWindow : firstWindow

    if (!currentDesktopWindow && firstWindowDesktop != currentDesktop) {
        switched := DllCall(
            dll "\GoToDesktopNumber",
            "Int", firstWindowDesktop,
            "Int"
        )
        if (switched < 0)
            throw Error("Unable to switch to Vivaldi's virtual desktop.")
    }

    window := "ahk_id " hwnd
    WinActivate(window)
    if !WinWaitActive(window,, 2)
        throw Error("An existing Vivaldi window could not be activated.")
}

FindVivaldi() {
    localAppData := EnvGet("LOCALAPPDATA")
    paths := [
        A_ProgramFiles "\Vivaldi\Application\vivaldi.exe",
        A_ProgramFiles " (x86)\Vivaldi\Application\vivaldi.exe",
        localAppData "\Vivaldi\Application\vivaldi.exe"
    ]

    for path in paths {
        if FileExist(path)
            return path
    }

    for root in ["HKCU", "HKLM"] {
        try {
            path := RegRead(
                root "\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\vivaldi.exe"
            )
            path := Trim(path, '"')
            if FileExist(path)
                return path
        }
    }

    return "vivaldi.exe"
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

LaunchEverything(thisHotkey := "") {
    global ASCS_EverythingPath

    try {
        RunAndActivate(
            '"' ASCS_EverythingPath '"',
            "ahk_exe Everything.exe"
        )
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
    global ASCS_HardwareJson

    if !IsDashboardWindowVisible() {
        SetTimer(PushDashboard, 0)
        return
    }

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

        if (ASCS_HardwareJson = "")
            ASCS_HardwareJson := GetHardwareDetails(wmi)

        json := '{"type":"metrics","cpu":' cpuUsage
            . ',"ram":' ramUsage
            . ',"ramUsed":' Round(totalRAM - freeRAM, 1)
            . ',"ramTotal":' Round(totalRAM, 1)
            . ',"disk":' diskUsage
            . ',"diskUsed":' Round(diskUsed, 1)
            . ',"diskTotal":' Round(diskTotal, 1)
            . ',"hardware":' ASCS_HardwareJson
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

GetHardwareDetails(wmi) {
    processors := QueryHardware(
        wmi,
        "SELECT Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed FROM Win32_Processor",
        "processor"
    )
    systems := QueryHardware(
        wmi,
        "SELECT Manufacturer, Model FROM Win32_ComputerSystem",
        "computer"
    )
    modules := QueryHardware(
        wmi,
        "SELECT Capacity, Speed, ConfiguredClockSpeed FROM Win32_PhysicalMemory",
        "memory"
    )
    graphics := QueryHardware(
        wmi,
        "SELECT Name, AdapterRAM, DriverVersion FROM Win32_VideoController",
        "graphics"
    )
    disks := QueryHardware(
        wmi,
        "SELECT Index, Model, Size, InterfaceType, MediaType, Status FROM Win32_DiskDrive",
        "storage"
    )
    partitions := QueryHardware(
        wmi,
        "SELECT DiskIndex, Index, Size, Type, BootPartition FROM Win32_DiskPartition",
        "partitions"
    )
    volumeLinks := QueryHardware(
        wmi,
        "SELECT Antecedent, Dependent FROM Win32_LogicalDiskToPartition",
        "volume mapping"
    )
    logicalDisks := QueryHardware(
        wmi,
        "SELECT DeviceID, VolumeName, FileSystem, Size, FreeSpace, Status FROM Win32_LogicalDisk",
        "logical volumes"
    )
    baseBoards := QueryHardware(
        wmi,
        "SELECT Manufacturer, Product FROM Win32_BaseBoard",
        "motherboard"
    )
    biosRows := QueryHardware(
        wmi,
        "SELECT Manufacturer, SMBIOSBIOSVersion FROM Win32_BIOS",
        "BIOS"
    )
    operatingSystems := QueryHardware(
        wmi,
        "SELECT Caption, BuildNumber FROM Win32_OperatingSystem",
        "Windows"
    )

    cpu := "Unavailable"
    cores := ""
    if processors.Length {
        cpu := HardwareField(processors[1], "Name")
        if (cpu = "")
            cpu := "Unavailable"
        coreCount := HardwareField(processors[1], "NumberOfCores")
        threadCount := HardwareField(processors[1], "NumberOfLogicalProcessors")
        if (coreCount != "" && threadCount != "")
            cores := coreCount " cores · " threadCount " threads"
        clockSpeed := HardwareField(processors[1], "MaxClockSpeed")
        if RegExMatch(clockSpeed, "^\d+$")
            cores .= (cores != "" ? " · " : "") "Up to "
                Round(Integer(clockSpeed) / 1000, 1) " GHz"
    }

    manufacturer := ""
    model := ""
    if systems.Length {
        manufacturer := HardwareField(systems[1], "Manufacturer")
        model := HardwareField(systems[1], "Model")
    }

    totalMemory := 0
    memorySpeed := 0
    moduleCount := 0
    for module in modules {
        try {
            totalMemory += Integer(module.Capacity)
            moduleCount++
        } catch as err {
            WriteLog("Physical memory detail could not be read: " err.Message)
        }
        speed := HardwareField(module, "ConfiguredClockSpeed")
        if (speed = "")
            speed := HardwareField(module, "Speed")
        if RegExMatch(speed, "^\d+$")
            memorySpeed := Max(memorySpeed, Integer(speed))
    }
    if !totalMemory {
        computers := QueryHardware(
            wmi,
            "SELECT TotalPhysicalMemory FROM Win32_ComputerSystem",
            "total memory"
        )
        if computers.Length {
            try totalMemory := Integer(computers[1].TotalPhysicalMemory)
            catch as err
                WriteLog("Total memory detail could not be read: " err.Message)
        }
    }
    memory := totalMemory
        ? Round(totalMemory / 1073741824, 1) " GB"
        : "Unavailable"
    if (moduleCount && memory != "Unavailable")
        memory .= " · " moduleCount " modules"
    if (memorySpeed && memory != "Unavailable")
        memory .= " · " memorySpeed " MHz"

    gpuNames := []
    gpuDetails := []
    for controller in graphics {
        name := HardwareField(controller, "Name")
        if (name != "") {
            gpuNames.Push(name)
            adapterRAM := HardwareField(controller, "AdapterRAM")
            driverVersion := HardwareField(controller, "DriverVersion")
            details := []
            if RegExMatch(adapterRAM, "^\d+$")
                details.Push(Round(Integer(adapterRAM) / 1073741824, 1) " GB reported memory")
            if (driverVersion != "")
                details.Push("Driver " driverVersion)
            if details.Length
                gpuDetails.Push(JoinArray(details, " · "))
        }
    }
    gpu := gpuNames.Length ? JoinArray(gpuNames, ", ") : "Unavailable"
    gpuDetail := gpuDetails.Length ? JoinArray(gpuDetails, " | ") : ""

    board := "Unavailable"
    if baseBoards.Length {
        boardManufacturer := HardwareField(baseBoards[1], "Manufacturer")
        boardProduct := HardwareField(baseBoards[1], "Product")
        board := Trim(boardManufacturer " " boardProduct)
        if (board = "")
            board := "Unavailable"
    }

    bios := ""
    if biosRows.Length {
        biosManufacturer := HardwareField(biosRows[1], "Manufacturer")
        biosVersion := HardwareField(biosRows[1], "SMBIOSBIOSVersion")
        bios := Trim(biosManufacturer (biosVersion != "" ? " · " biosVersion : ""))
    }

    partitionDetails := Map()
    for partition in partitions {
        diskIndex := HardwareField(partition, "DiskIndex")
        partitionIndex := HardwareField(partition, "Index")
        if (diskIndex = "" || partitionIndex = "")
            continue
        if !partitionDetails.Has(diskIndex)
            partitionDetails[diskIndex] := []
        bootStatus := HardwareField(partition, "BootPartition")
        partitionDetails[diskIndex].Push(Map(
            "size", HardwareNumber(partition, "Size"),
            "type", HardwareField(partition, "Type"),
            "boot", bootStatus = "True" || bootStatus = "1"
        ))
    }

    logicalByLetter := Map()
    for logicalDisk in logicalDisks {
        letter := StrUpper(HardwareField(logicalDisk, "DeviceID"))
        if (letter != "")
            logicalByLetter[letter] := logicalDisk
    }

    volumesByDisk := Map()
    volumeSeenByDisk := Map()
    for link in volumeLinks {
        antecedent := HardwareField(link, "Antecedent")
        dependent := HardwareField(link, "Dependent")
        if (
            !RegExMatch(antecedent, "Disk #(\d+), Partition #(\d+)", &partitionMatch)
            || !RegExMatch(dependent, 'i)DeviceID="([A-Z]:)"', &volumeMatch)
        )
            continue
        diskIndex := partitionMatch[1]
        volumeLetter := StrUpper(volumeMatch[1])
        if !volumesByDisk.Has(diskIndex) {
            volumesByDisk[diskIndex] := []
            volumeSeenByDisk[diskIndex] := Map()
        }
        if !volumeSeenByDisk[diskIndex].Has(volumeLetter) {
            volumeSeenByDisk[diskIndex][volumeLetter] := true
            volumesByDisk[diskIndex].Push(volumeLetter)
        }
    }

    storageJson := "["
    storageCount := 0
    for disk in disks {
        storageCount++
        index := HardwareField(disk, "Index")
        if (index = "" && RegExMatch(HardwareField(disk, "DeviceID"), "i)PHYSICALDRIVE(\d+)", &deviceMatch))
            index := deviceMatch[1]
        model := HardwareField(disk, "Model")
        interfaceType := HardwareField(disk, "InterfaceType")
        mediaType := HardwareField(disk, "MediaType")
        diskStatus := HardwareField(disk, "Status")

        partitionJson := "["
        partitionCount := partitionDetails.Has(index) ? partitionDetails[index].Length : 0
        if (partitionCount) {
            for partition in partitionDetails[index] {
                partitionJson .= (A_Index > 1 ? "," : "")
                    . '{"sizeBytes":' partition["size"]
                    . ',"type":' JsonQuote(partition["type"])
                    . ',"boot":' (partition["boot"] ? "true" : "false") '}'
            }
        }
        partitionJson .= "]"

        volumeJson := "["
        volumeCount := volumesByDisk.Has(index) ? volumesByDisk[index].Length : 0
        if (volumeCount) {
            for volumeLetter in volumesByDisk[index] {
                volume := logicalByLetter.Has(volumeLetter) ? logicalByLetter[volumeLetter] : ""
                volumeName := volume != "" ? HardwareField(volume, "VolumeName") : ""
                fileSystem := volume != "" ? HardwareField(volume, "FileSystem") : ""
                volumeStatus := volume != "" ? HardwareField(volume, "Status") : ""
                size := volume != "" ? HardwareNumber(volume, "Size") : "null"
                free := volume != "" ? HardwareNumber(volume, "FreeSpace") : "null"
                volumeJson .= (A_Index > 1 ? "," : "")
                    . '{"letter":' JsonQuote(volumeLetter)
                    . ',"label":' JsonQuote(volumeName)
                    . ',"fileSystem":' JsonQuote(fileSystem)
                    . ',"status":' JsonQuote(volumeStatus)
                    . ',"sizeBytes":' size
                    . ',"freeBytes":' free '}'
            }
        }
        volumeJson .= "]"

        storageJson .= (storageCount > 1 ? "," : "")
            . '{"model":' JsonQuote(model)
            . ',"sizeBytes":' HardwareNumber(disk, "Size")
            . ',"interfaceType":' JsonQuote(interfaceType)
            . ',"mediaType":' JsonQuote(mediaType)
            . ',"status":' JsonQuote(diskStatus)
            . ',"partitions":' partitionJson
            . ',"volumes":' volumeJson '}'
    }
    storageJson .= "]"

    windows := "Unavailable"
    if operatingSystems.Length {
        caption := HardwareField(operatingSystems[1], "Caption")
        build := HardwareField(operatingSystems[1], "BuildNumber")
        if (caption != "")
            windows := caption (build != "" ? " · Build " build : "")
    }

    return (
        '{"manufacturer":' JsonQuote(manufacturer)
        . ',"model":' JsonQuote(model)
        . ',"cpu":' JsonQuote(cpu)
        . ',"cores":' JsonQuote(cores)
        . ',"gpu":' JsonQuote(gpu)
        . ',"gpuDetail":' JsonQuote(gpuDetail)
        . ',"memory":' JsonQuote(memory)
        . ',"storage":' storageJson
        . ',"board":' JsonQuote(board)
        . ',"bios":' JsonQuote(bios)
        . ',"windows":' JsonQuote(windows) '}'
    )
}

HardwareNumber(item, property) {
    value := HardwareField(item, property)
    return RegExMatch(value, "^\d+$") ? value : "null"
}

QueryHardware(wmi, query, category) {
    rows := []
    try {
        for item in wmi.ExecQuery(query)
            rows.Push(item)
    } catch as err {
        WriteLog("Hardware " category " query failed: " err.Message)
    }
    return rows
}

HardwareField(item, property) {
    try {
        return Trim(String(item.%property%))
    } catch as err {
        WriteLog("Hardware property " property " could not be read: " err.Message)
        return ""
    }
}

GetDriveMetrics() {
    global ASCS_Drives
    global ASCS_DriveCache
    global ASCS_DriveProbes

    drivesJson := "["
    cUsage := 0
    cUsed := 0
    cTotal := 0
    metricIndex := 0

    for drive in ASCS_Drives {
        metricIndex++
        now := A_TickCount

        if !ASCS_DriveCache.Has(drive) {
            ASCS_DriveCache[drive] := Map(
                "checked", now - 30000,
                "metric", OfflineDriveMetric(drive)
            )
        }

        if (!ASCS_DriveProbes.Has(drive)
            && now - ASCS_DriveCache[drive]["checked"] >= 30000)
            StartDriveProbe(drive, now)

        if ASCS_DriveCache.Has(drive) {
            driveMetric := ASCS_DriveCache[drive]["metric"]
        } else {
            driveMetric := OfflineDriveMetric(drive)
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

StartDriveProbe(drive, now) {
    global ASCS_DriveCache
    global ASCS_DriveProbes

    letter := SubStr(drive, 1, 1)
    if !RegExMatch(letter, "i)^[A-Z]$")
        throw Error("Invalid drive letter for metrics probe.")

    resultPath := A_ScriptDir "\data\drive-" StrUpper(letter) ".probe"
    try {
        if FileExist(resultPath)
            FileDelete(resultPath)

        command := '"' A_AhkPath '" "' A_ScriptDir
            . '\ASCS.DriveProbe.ahk" ' StrUpper(letter)
        Run(command,, "Hide", &pid)
        ASCS_DriveCache[drive]["checked"] := now
        ASCS_DriveProbes[drive] := Map(
            "pid", pid,
            "started", now,
            "result", resultPath
        )
        SetTimer(PollDriveProbes, 250)
    } catch as err {
        ASCS_DriveCache[drive] := Map(
            "checked", now,
            "metric", OfflineDriveMetric(drive)
        )
        WriteLog("Drive metrics worker could not start for " drive ": " err.Message)
    }
}

PollDriveProbes(*) {
    global ASCS_DriveCache
    global ASCS_DriveProbes

    now := A_TickCount
    for drive, probe in ASCS_DriveProbes.Clone() {
        if (now - probe["started"] >= 8000) {
            try {
                if ProcessExist(probe["pid"])
                    ProcessClose(probe["pid"])
            } catch as err {
                WriteLog("Drive metrics worker could not be stopped: " err.Message)
            }
            ASCS_DriveCache[drive] := Map(
                "checked", now,
                "metric", OfflineDriveMetric(drive)
            )
            ASCS_DriveProbes.Delete(drive)
            WriteLog("Drive metrics probe timed out for " drive ".")
            continue
        }

        if ProcessExist(probe["pid"])
            continue

        resultPath := probe["result"]
        if FileExist(resultPath) {
            try {
                fields := StrSplit(Trim(FileRead(resultPath)), "`n")
                if (fields.Length != 4
                    || !RegExMatch(Trim(fields[1]), "^[01]$")
                    || !RegExMatch(Trim(fields[2]), "^\d+(?:\.\d+)?$")
                    || !RegExMatch(Trim(fields[3]), "^\d+(?:\.\d+)?$")
                    || !RegExMatch(Trim(fields[4]), "^\d+(?:\.\d+)?$"))
                    throw Error("Invalid drive probe response.")

                online := Trim(fields[1]) = "1"
                usage := Min(100, Max(0, Float(Trim(fields[2]))))
                used := Max(0, Float(Trim(fields[3])))
                total := Max(0, Float(Trim(fields[4])))
                metric := online
                    ? Map("letter", drive, "usage", usage, "used", used,
                        "total", total, "online", true)
                    : OfflineDriveMetric(drive)
                ASCS_DriveCache[drive] := Map(
                    "checked", now,
                    "metric", metric
                )
            } catch as err {
                ASCS_DriveCache[drive] := Map(
                    "checked", now,
                    "metric", OfflineDriveMetric(drive)
                )
                WriteLog("Drive metrics probe response failed for " drive ": " err.Message)
            }
            try FileDelete(resultPath)
        } else {
            ASCS_DriveCache[drive] := Map(
                "checked", now,
                "metric", OfflineDriveMetric(drive)
            )
            WriteLog("Drive metrics worker exited without a result for " drive ".")
        }
        ASCS_DriveProbes.Delete(drive)
    }

    if !ASCS_DriveProbes.Count
        SetTimer(PollDriveProbes, 0)
}

OfflineDriveMetric(drive) {
    return Map(
        "letter", drive,
        "usage", 0,
        "used", 0,
        "total", 0,
        "online", false
    )
}

; ==========================================
; ACTIVITY LOG
; ==========================================

WriteLog(message := "ASCS activity") {
    global ASCS_LogFile

    message := RegExReplace(String(message), "[\r\n]+", " ")
    message := RegExReplace(
        message,
        "[\x00-\x08\x0B\x0C\x0E-\x1F]",
        ""
    )
    if (StrLen(message) > 4096)
        message := SubStr(message, 1, 4096)

    try {
        if (FileExist(ASCS_LogFile)
            && FileGetSize(ASCS_LogFile) >= 1048576)
            FileMove(ASCS_LogFile, ASCS_LogFile ".1", 1)

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
