
#Requires AutoHotkey v2.0 64-bit
#SingleInstance Force
#Warn
#Warn LocalSameAsGlobal, Off

SetWorkingDir(A_ScriptDir)

; ==========================================
; AEOLIONWARE SUPER COMMAND SYSTEM
; Version 1.6.0
; ==========================================

#Include webview\WebViewToo.ahk
#Include lib\ASCS.Core.ahk

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
global ASCS_WorkspaceDir := ASCS_DataDir "\workspaces"
global ASCS_CommandsFile := ASCS_DataDir "\commands.ini"
global ASCS_ActivityFile := ASCS_DataDir "\activity.log"

global ASCS_EverythingPath := ""
global ASCS_PageReady := false
global ASCS_PendingView := "home"
global ASCS_DashboardErrorShown := false
global ASCS_DriveCache := Map()
global ASCS_DriveProbes := Map()
global ASCS_Wmi := 0
global ASCS_NotesRecovered := false
global ASCS_DesktopAccessorWarningShown := false
global ASCS_PendingWindowDirection := ""
global ASCS_PendingLauncher := false
global ASCS_SnapGap := 0
global ASCS_PreserveWindowSize := true
global ASCS_ActionHotkeys := Map()
global ASCS_WorkspaceRestorePending := []
global ASCS_WorkspaceClaimed := Map()
global ASCS_HardwareJson := ""
global ASCS_CpuSample := 0
global ASCS_NotesFileTime := ""
global ASCS_PendingLauncherMode := ""
global ASCS_PreviousWindow := 0
global ASCS_Activity := []
global ASCS_ActivityAppends := 0
global ASCS_CustomCommands := []
global ASCS_RegisteredKeys := []
global ASCS_SearchTemplate := "https://duckduckgo.com/?q=%s"
; Defaults; user selections are persisted in settings.ini.
global ASCS_Drives := ["C:", "J:"]

DirCreate(ASCS_DataDir)
DirCreate(ASCS_WebViewDataDir)
DirCreate(ASCS_WorkspaceDir)
LoadUserSettings()
LoadCustomCommands()
LoadActivity()

ASCS_EverythingPath := FindEverything()

if !FileExist(ASCS_NotesFile)
    FileAppend('{"version":2,"activeId":null,"notes":[]}', ASCS_NotesFile, "UTF-8")

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
        "Aeolionware SCS",
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
    ; WebViewToo injects a "global" host object into *.localhost pages that
    ; exposes every AutoHotkey function to page script. ASCS uses only the
    ; allowlisted postMessage bridge, so host objects are disabled entirely.
    ASCS_App.Settings.AreHostObjectsAllowed := false

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
    SetupTrayMenu()

    WriteLog("ASCS 1.6.0 initialized.")
    RecordActivity("system", "ASCS 1.6.0 started")

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
        ToggleCommandCenter()
}

F24 & Space::ShowCommandLauncher()

F24 & l::DllCall("LockWorkStation")
F24 & m::SoundSetMute(!SoundGetMute())
F24 & v::Send("#v")
F24 & b::LaunchVivaldi()

F24 & j::SendText(FormatTime(, "yyyy-MM-dd HH:mm:ss"))
F24 & y::SendText(FormatTime(, "yyyy-MM-dd"))

; Super+Shift+S is intentionally unassigned.
F24 & s:: {
    if !GetKeyState("Shift", "P")
        SaveWorkspace()
}

; Opens the Snipping Tool capture overlay (command palette only since 1.6.0).
; The screen-clip URI avoids synthesizing Win+Shift+S, which can open Start.
LaunchSnipping() {
    try {
        Run("ms-screenclip:")
    } catch as err {
        WriteLog("Snipping overlay launch failed: " err.Message)
        ShowDesktopTooltip("Unable to open the Snipping Tool.")
    }
}

; Ctrl+Alt+Shift+A: reload ASCS. ASCS.Launcher.ahk owns the same keys to start
; ASCS when it is not running; whichever hook sees the keys first handles them,
; and both paths end in the same notes-safe reload.
$^!+a::ReloadASCS()

; ASCS.Launcher.ahk posts this message to request the same notes-safe reload.
OnMessage(
    DllCall("RegisterWindowMessage", "Str", "Aeolionware.ASCS.Reload", "UInt"),
    HandleReloadMessage
)
HandleReloadMessage(wParam, lParam, msg, hwnd) {
    SetTimer(ReloadASCS, -1)
    return 1
}

F24 & r:: {
    if GetKeyState("Shift", "P")
        ShowCommandLauncher("workspaces")
    else
        RestoreWorkspace()
}

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

; Super + Shift layer for letters. These take precedence over whatever the
; unshifted letter does; keep in sync with frontend/keymap.js.
;   C  capture the selection into Quick Notes     P  paste a snippet (palette)
;   D  new folder in the active Explorer folder   F  new empty file there
; (R, S, digits, and arrows have their own fixed handlers; Shift with the
; Terminal or Explorer key opens a new window via LaunchCommand.)
SuperShiftLayer() {
    static layer := Map(
        "c", QuickCapture,
        "p", ShowCommandLauncher.Bind("snippets"),
        "d", CreateExplorerItem.Bind("folder"),
        "f", CreateExplorerItem.Bind("file")
    )
    return layer
}

; Registers Super+letter hotkeys for configurable actions, custom commands,
; and the Shift layer. Previously registered letters are turned off first, so
; this also rebinds after Preferences or custom commands change.
RegisterConfiguredHotkeys() {
    global ASCS_ActionHotkeys
    global ASCS_CustomCommands
    global ASCS_RegisteredKeys

    for key in ASCS_RegisteredKeys {
        try Hotkey("F24 & " key, "Off")
    }
    ASCS_RegisteredKeys := []

    callbacks := Map(
        "notes", ShowView.Bind("notes"),
        "everything", LaunchEverything,
        "dashboard", ShowView.Bind("dashboard"),
        "terminal", LaunchCommand.Bind("terminal"),
        "explorer", LaunchCommand.Bind("explorer"),
        "calculator", LaunchCommand.Bind("calculator"),
        "taskmanager", LaunchCommand.Bind("taskmanager")
    )

    keyCallbacks := Map()
    for action, key in ASCS_ActionHotkeys
        keyCallbacks[key] := callbacks[action]
    for index, command in ASCS_CustomCommands {
        if (command["key"] != "")
            keyCallbacks[command["key"]] := RunCustomCommand.Bind(index)
    }

    shiftLayer := SuperShiftLayer()
    for key, callback in keyCallbacks {
        if shiftLayer.Has(key)
            continue
        Hotkey("F24 & " key, callback, "On")
        ASCS_RegisteredKeys.Push(key)
    }

    for key, shiftAction in shiftLayer {
        Hotkey(
            "F24 & " key,
            HandleShiftLayerKey.Bind(key, shiftAction, keyCallbacks.Has(key) ? keyCallbacks[key] : 0),
            "On"
        )
        ASCS_RegisteredKeys.Push(key)
    }
}

; With Shift: the layer action. Without: the letter's own action, or, when the
; letter is unassigned, the Windows shortcut (for example, Win+D).
HandleShiftLayerKey(key, shiftAction, callback := 0, thisHotkey := "") {
    if GetKeyState("Shift", "P") {
        shiftAction.Call()
        return
    }
    if IsObject(callback)
        callback.Call()
    else
        Send("#" key)
}

CreateExplorerItem(kind) {
    try {
        folderPath := GetActiveExplorerFolder(kind)
        if (kind = "folder") {
            prompt := "Enter a name for the new folder:"
            title := "Create folder"
            defaultName := "New folder"
        } else {
            prompt := "Enter a filename, including its extension (for example, notes.txt):"
            title := "Create file"
            defaultName := "New file.txt"
        }

        response := InputBox(prompt, title, "w460 h150", defaultName)
        if (response.Result != "OK")
            return

        name := response.Value
        ValidateExplorerItemName(name, kind)
        itemPath := RTrim(folderPath, "\") "\" name
        if (kind = "folder")
            CreateNewExplorerDirectory(itemPath)
        else
            CreateNewExplorerFile(itemPath)
        RecordActivity("file", "Created " kind " " name)
    } catch as err {
        itemType := kind = "folder" ? "Folder" : "File"
        WriteLog(itemType " creation error: " err.Message)
        MsgBox(
            err.Message,
            "Aeolionware SCS: " itemType " Creation Error",
            "Icon!"
        )
    }
}

GetActiveExplorerFolder(kind) {
    activeHwnd := WinGetID("A")
    activeClass := WinGetClass("ahk_id " activeHwnd)
    if (activeClass != "CabinetWClass" && activeClass != "ExploreWClass")
        throw Error(
            "Focus the File Explorer window containing the directory where you want to create the new "
            (kind = "folder" ? "folder." : "file.")
        )

    shell := ComObject("Shell.Application")
    for window in shell.Windows {
        if (window.HWND != activeHwnd)
            continue

        folderPath := window.Document.Folder.Self.Path
        if !DirExist(folderPath)
            throw Error("The active Explorer location is not a filesystem folder.")
        return folderPath
    }

    throw Error("Could not identify the active File Explorer folder.")
}


CreateNewExplorerDirectory(path) {
    if !DllCall("CreateDirectoryW", "Str", path, "Ptr", 0, "Int") {
        errorCode := A_LastError
        if (errorCode = 183)
            throw Error("An item with that name already exists.")
        throw Error("Windows could not create the folder (error " errorCode ").")
    }
}

CreateNewExplorerFile(path) {
    handle := DllCall(
        "CreateFileW",
        "Str", path,
        "UInt", 0x40000000,
        "UInt", 0,
        "Ptr", 0,
        "UInt", 1,
        "UInt", 0x80,
        "Ptr", 0,
        "Ptr"
    )
    if (handle = -1) {
        errorCode := A_LastError
        if (errorCode = 80 || errorCode = 183)
            throw Error("An item with that name already exists.")
        throw Error("Windows could not create the file (error " errorCode ").")
    }
    if !DllCall("CloseHandle", "Ptr", handle, "Int") {
        errorCode := A_LastError
        throw Error("Windows could not finish creating the file (error " errorCode ").")
    }
}

LoadUserSettings() {
    global ASCS_SettingsFile
    global ASCS_SearchTemplate
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
            keys[action] := CheckShortcutKey(
                IniRead(ASCS_SettingsFile, "Hotkeys", action, defaultKey),
                action,
                used
            )
        }
        ASCS_ActionHotkeys := keys
    } catch as err {
        WriteLog("Invalid shortcut preferences; using defaults. " err.Message)
        ASCS_ActionHotkeys := defaults
    }

    try {
        ASCS_SearchTemplate := ValidateSearchTemplate(IniRead(
            ASCS_SettingsFile, "Palette", "SearchUrl", ASCS_SearchTemplate
        ))
    } catch as err {
        WriteLog("Invalid web search address; using DuckDuckGo. " err.Message)
        ASCS_SearchTemplate := "https://duckduckgo.com/?q=%s"
    }
}


SaveUserSettings(content) {
    global ASCS_SettingsFile
    global ASCS_Drives
    global ASCS_DriveCache
    global ASCS_SnapGap
    global ASCS_PreserveWindowSize
    global ASCS_ActionHotkeys
    global ASCS_CustomCommands
    global ASCS_SearchTemplate

    try {
        ; The search address is last and may itself contain "|".
        fields := StrSplit(content, "|",, 5)
        if (fields.Length != 5)
            throw Error("Settings payload has an invalid shape.")
        searchTemplate := ValidateSearchTemplate(fields[5])

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

        labels := ["Quick Notes", "Everything", "System Dashboard",
            "Windows Terminal", "File Explorer", "Calculator", "Task Manager"]
        hotkeys := Map()
        used := Map()
        for command in ASCS_CustomCommands {
            if (command["key"] != "")
                used[command["key"]] := "the custom command " command["name"]
        }
        Loop names.Length
            hotkeys[names[A_Index]] := CheckShortcutKey(keys[A_Index], labels[A_Index], used)

        IniWrite(JoinArray(drives, ","), ASCS_SettingsFile, "General", "Drives")
        IniWrite(searchTemplate, ASCS_SettingsFile, "Palette", "SearchUrl")
        IniWrite(fields[2], ASCS_SettingsFile, "Window", "SnapGap")
        IniWrite(fields[3], ASCS_SettingsFile, "Window", "PreserveSize")
        for action, key in hotkeys
            IniWrite(key, ASCS_SettingsFile, "Hotkeys", action)

        ASCS_SearchTemplate := searchTemplate
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
            '{"type":"error","scope":"settings","message":'
            JsonQuote(err.Message) '}'
        )
        ; Nothing was applied; resend the active values so the form matches them.
        SendSettings()
    }
}


SendSettings() {
    global ASCS_SearchTemplate
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
        ',"hotkeys":' hotkeys
        ',"searchTemplate":' JsonQuote(ASCS_SearchTemplate) '}'
    )
}

SaveWorkspace(name := "") {
    global ASCS_App

    try {
        displayName := IsDefaultWorkspaceName(name) ? "Default" : ValidateWorkspaceName(name)
        workspacePath := GetWorkspacePath(displayName)
        tempPath := workspacePath ".tmp"
        if FileExist(tempPath)
            FileDelete(tempPath)

        explorerFolders := GetExplorerFolderMap()
        windows := []
        skipped := 0
        for hwnd in WinGetList() {
            if !IsWorkspaceWindow(hwnd)
                continue

            ; One unusual window must not abort the whole snapshot.
            try {
                windowTitle := "ahk_id " hwnd
                path := WinGetProcessPath(windowTitle)
                process := WinGetProcessName(windowTitle)
                if (path = "" || process = "")
                    continue

                WinGetPos(&x, &y, &width, &height, windowTitle)
                context := GetWindowPlacementContext(hwnd)
                workWidth := Max(1, context["workRight"] - context["workLeft"])
                workHeight := Max(1, context["workBottom"] - context["workTop"])
                windows.Push(Map(
                    "path", path,
                    "process", process,
                    "title", WinGetTitle(windowTitle),
                    "folder", explorerFolders.Has(hwnd) ? explorerFolders[hwnd] : "",
                    "monitor", context["monitor"],
                    "x", (x - context["workLeft"]) / workWidth,
                    "y", (y - context["workTop"]) / workHeight,
                    "width", width / workWidth,
                    "height", height / workHeight,
                    "maximized", WinGetMinMax(windowTitle) = 1
                ))
            } catch as err {
                skipped++
                WriteLog("Workspace skipped a window: " err.Message)
            }
            if (windows.Length >= 24)
                break
        }

        if !windows.Length
            throw Error("No windows could be captured.")

        IniWrite(windows.Length, tempPath, "Workspace", "WindowCount")
        IniWrite(displayName, tempPath, "Workspace", "Name")
        IniWrite(FormatTime(A_Now, "yyyy-MM-dd'T'HH:mm:ss"), tempPath, "Workspace", "Saved")
        for index, savedWindow in windows {
            section := "Window" index
            for key, value in savedWindow
                IniWrite(value, tempPath, section, key)
        }
        FileMove(tempPath, workspacePath, 1)
        summary := "Workspace “" displayName "” saved (" windows.Length " windows"
            . (skipped ? ", " skipped " skipped" : "") ")."
        ShowDesktopTooltip(summary)
        NotifyFrontend(summary)
        RecordActivity("workspace", "Saved workspace “" displayName "” (" windows.Length " windows)")
        SendWorkspaces()
    } catch as err {
        WriteLog("Workspace save failed: " err.Message)
        ShowDesktopTooltip("Unable to save workspace: " err.Message)
        NotifyFrontend("Unable to save workspace: " err.Message)
        try {
            if (IsSet(tempPath) && FileExist(tempPath))
                FileDelete(tempPath)
        }
    }
}

; Top-level application windows on the current desktop that a workspace
; can save or reuse. Minimized windows can be reused but are not saved.
IsWorkspaceWindow(hwnd, allowMinimized := false) {
    global ASCS_App

    try {
        if (hwnd = ASCS_App.Hwnd)
            return false
        windowTitle := "ahk_id " hwnd
        if (WinGetTitle(windowTitle) = ""
            || !DllCall("IsWindowVisible", "Ptr", hwnd, "Int")
            || IsWindowCloaked(hwnd))
            return false
        if (WinGetExStyle(windowTitle) & 0x80)   ; WS_EX_TOOLWINDOW
            return false
        if (DllCall("GetWindow", "Ptr", hwnd, "UInt", 4, "Ptr"))   ; owned popup
            return false
        windowClass := WinGetClass(windowTitle)
        if (windowClass = "Progman" || windowClass = "WorkerW"
            || windowClass = "Shell_TrayWnd"
            || windowClass = "Shell_SecondaryTrayWnd")
            return false
        if (!allowMinimized && WinGetMinMax(windowTitle) = -1)
            return false
        return true
    } catch {
        return false
    }
}

; Cloaked windows include those on other virtual desktops and suspended UWP
; frames; they report off-screen or stale positions.
IsWindowCloaked(hwnd) {
    cloaked := 0
    result := DllCall(
        "Dwmapi.dll\DwmGetWindowAttribute",
        "Ptr", hwnd,
        "UInt", 14,   ; DWMWA_CLOAKED
        "UInt*", &cloaked,
        "UInt", 4,
        "Int"
    )
    return (result = 0 && cloaked != 0)
}

; Maps File Explorer window handles to their current filesystem folder.
GetExplorerFolderMap() {
    folders := Map()
    try {
        for window in ComObject("Shell.Application").Windows {
            try {
                path := window.Document.Folder.Self.Path
                if DirExist(path)
                    folders[window.HWND] := path
            }
        }
    } catch as err {
        WriteLog("Explorer folder lookup failed: " err.Message)
    }
    return folders
}

RestoreWorkspace(name := "") {
    global ASCS_WorkspaceRestorePending
    global ASCS_WorkspaceClaimed

    try {
        displayName := IsDefaultWorkspaceName(name) ? "Default" : ValidateWorkspaceName(name)
        workspacePath := GetWorkspacePath(displayName)
    } catch as err {
        ShowWorkspaceMessage(err.Message, "Icon!")
        return
    }

    if !FileExist(workspacePath) {
        ShowWorkspaceMessage(
            displayName = "Default"
                ? "No saved workspace was found.`n`nArrange your windows, then press Super+S to save one, or use “Save workspace as…” in the command palette (Super+Space) to save a named layout."
                : "The workspace “" displayName "” was not found.",
            "Iconi"
        )
        return
    }

    try {
        count := Integer(IniRead(
            workspacePath,
            "Workspace",
            "WindowCount",
            "0"
        ))
        if (count < 1 || count > 24)
            throw Error("Saved workspace has an invalid window count.")

        pending := []
        for index in Range(1, count) {
            section := "Window" index
            path := IniRead(workspacePath, section, "path", "")
            process := IniRead(workspacePath, section, "process", "")
            if !IsValidWorkspaceExecutable(path, process) {
                WriteLog("Skipped an invalid or unavailable workspace executable: " path)
                continue
            }

            pending.Push(Map(
                "path", path,
                "process", process,
                "title", IniRead(workspacePath, section, "title", ""),
                "folder", IniRead(workspacePath, section, "folder", ""),
                "monitor", Max(1, Integer(IniRead(workspacePath, section, "monitor", "1"))),
                "x", Float(IniRead(workspacePath, section, "x", "0")),
                "y", Float(IniRead(workspacePath, section, "y", "0")),
                "width", Float(IniRead(workspacePath, section, "width", "0.8")),
                "height", Float(IniRead(workspacePath, section, "height", "0.8")),
                "maximized", IniRead(workspacePath, section, "maximized", "0") = "1",
                "deadline", A_TickCount + 20000,
                "launched", false
            ))
        }

        if !pending.Length {
            ShowWorkspaceMessage(
                "None of the applications in the saved workspace are available.",
                "Icon!"
            )
            return
        }

        ASCS_WorkspaceRestorePending := pending
        ASCS_WorkspaceClaimed := Map()
        ShowDesktopTooltip("Restoring workspace “" displayName "”.")
        RecordActivity("workspace", "Restored workspace “" displayName "”")
        RestoreWorkspaceWindows()
        if ASCS_WorkspaceRestorePending.Length
            SetTimer(RestoreWorkspaceWindows, 500)
    } catch as err {
        WriteLog("Workspace restore failed: " err.Message)
        ShowWorkspaceMessage("Unable to restore the workspace.`n`n" err.Message, "Iconx")
    }
}

ShowWorkspaceMessage(message, icon) {
    ; Runs on a short timer so the hotkey thread returns immediately.
    SetTimer(() => MsgBox(message, "Aeolionware SCS: Workspace", icon " T15"), -1)
}


; Matches saved records to existing windows before launching anything:
;   1. exact match (same Explorer folder, or same title for other apps);
;   2. any other unclaimed window of the same process (titles change).
; An application is launched only when no unclaimed window of its process
; remains, so already-open Terminal/Explorer/browser windows are reused.
RestoreWorkspaceWindows(*) {
    global ASCS_WorkspaceRestorePending
    global ASCS_WorkspaceClaimed

    pending := ASCS_WorkspaceRestorePending
    ; Windows placed on earlier ticks stay claimed for the whole restore.
    claimed := ASCS_WorkspaceClaimed
    candidates := Map()
    needsFolders := false
    for record in pending {
        key := StrLower(record["process"])
        if !candidates.Has(key) {
            list := []
            try {
                for hwnd in WinGetList("ahk_exe " record["process"])
                    if IsWorkspaceWindow(hwnd, true)
                        list.Push(hwnd)
            } catch as err {
                WriteLog("Workspace window lookup failed: " err.Message)
            }
            candidates[key] := list
        }
        if (record["folder"] != "")
            needsFolders := true
    }
    folders := needsFolders ? GetExplorerFolderMap() : Map()

    matches := MatchWorkspaceRecords(
        pending,
        candidates,
        claimed,
        (hwnd) => WinGetTitle("ahk_id " hwnd),
        folders
    )

    remaining := []
    for index, record in pending {
        if matches.Has(index) {
            PlaceWorkspaceWindow(matches[index], record)
            continue
        }

        if !record["launched"] {
            try {
                Run(GetWorkspaceLaunchCommand(record))
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

PlaceWorkspaceWindow(hwnd, record) {
    try {
        windowTitle := "ahk_id " hwnd
        WinRestore(windowTitle)
        context := GetWindowPlacementContext(hwnd)
        monitor := Min(record["monitor"], MonitorGetCount())
        MonitorGetWorkArea(monitor, &left, &top, &right, &bottom)
        workWidth := right - left
        workHeight := bottom - top
        width := Min(Round(record["width"] * workWidth), workWidth)
        height := Min(Round(record["height"] * workHeight), workHeight)
        x := left + Round(record["x"] * workWidth)
        y := top + Round(record["y"] * workHeight)
        MoveWindowIntoWorkArea(
            hwnd, x, y, width, height, left, top, right, bottom, context
        )
        if record["maximized"]
            WinMaximize(windowTitle)
    } catch as err {
        WriteLog("Workspace window placement failed: " err.Message)
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

        if (number > desktopCount) {
            ShowMissingDesktopTooltip(number, desktopCount)
            return
        }

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
        if (number < 1 || number > desktopCount) {
            ShowMissingDesktopTooltip(number, desktopCount)
            return
        }

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

ShowMissingDesktopTooltip(number, desktopCount) {
    ShowDesktopTooltip(
        "Desktop " number " does not exist ("
        desktopCount (desktopCount = 1 ? " desktop is" : " desktops are")
        " open)."
    )
}

ShowDesktopTooltip(message) {
    ToolTip(message)
    SetTimer(ClearDesktopTooltip, -2000)
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
    monitorIndex := GetWindowMonitorIndex(hwnd)

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

; Returns the AutoHotkey monitor index for the display Windows considers the
; window to be on (nearest display when it is partly or fully off-screen).
GetWindowMonitorIndex(hwnd) {
    hMonitor := DllCall("MonitorFromWindow", "Ptr", hwnd, "UInt", 2, "Ptr")   ; NEAREST
    info := Buffer(40, 0)
    NumPut("UInt", 40, info, 0)
    if (hMonitor && DllCall("GetMonitorInfoW", "Ptr", hMonitor, "Ptr", info, "Int")) {
        left := NumGet(info, 4, "Int")
        top := NumGet(info, 8, "Int")
        right := NumGet(info, 12, "Int")
        bottom := NumGet(info, 16, "Int")
        Loop MonitorGetCount() {
            MonitorGet(A_Index, &monitorLeft, &monitorTop, &monitorRight, &monitorBottom)
            if (monitorLeft = left && monitorTop = top
                && monitorRight = right && monitorBottom = bottom)
                return A_Index
        }
    }
    return MonitorGetPrimary()
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

; Opens the command palette. Modes: "" (everything), "snippets", "workspaces".
ShowCommandLauncher(mode := "") {
    global ASCS_PendingLauncher
    global ASCS_PendingLauncherMode
    global ASCS_PageReady

    if !(mode = "" || mode = "snippets" || mode = "workspaces")
        mode := ""
    ShowASCS()
    if ASCS_PageReady {
        SendToFrontend('{"type":"openLauncher","mode":' JsonQuote(mode) '}')
    } else {
        ASCS_PendingLauncher := true
        ASCS_PendingLauncherMode := mode
        SetTimer(DispatchPendingLauncher, -100)
    }
}

; Super tap: hide when ASCS is active; otherwise show it on the view that was
; last open this session (the Command Center after a fresh start).
ToggleCommandCenter() {
    global ASCS_App

    if WinActive("ahk_id " ASCS_App.Hwnd)
        HandleClose()
    else
        ShowASCS()
}

DispatchPendingLauncher(*) {
    global ASCS_PendingLauncher
    global ASCS_PendingLauncherMode
    global ASCS_PageReady

    if !ASCS_PendingLauncher
        return
    if ASCS_PageReady {
        ASCS_PendingLauncher := false
        SendToFrontend('{"type":"openLauncher","mode":' JsonQuote(ASCS_PendingLauncherMode) '}')
    } else {
        SetTimer(DispatchPendingLauncher, -100)
    }
}

ShowView(view, thisHotkey := "") {
    ShowASCS(view)
}

; Shows and focuses ASCS. With a view, navigates to it; without one, the
; frontend keeps its current view and refreshes it. Nothing slow runs here:
; metrics are scheduled on timers so the window responds immediately.
ShowASCS(view := "") {
    global ASCS_App
    global ASCS_PageReady
    global ASCS_PendingView
    global ASCS_PreviousWindow

    if (view != "")
        ASCS_PendingView := view

    ; Remember where the user was, so snippets paste into that window and
    ; palette actions can return focus to it.
    foreground := DllCall("GetForegroundWindow", "Ptr")
    if (foreground && foreground != ASCS_App.Hwnd)
        ASCS_PreviousWindow := foreground

    ASCS_App.Show()
    WinActivate("ahk_id " ASCS_App.Hwnd)

    try {
        ASCS_App.MoveFocus(0)
    } catch as err {
        WriteLog("WebView focus failed: " err.Message)
    }

    if ASCS_PageReady {
        if (view != "")
            SendToFrontend(
                '{"type":"navigate","view":' JsonQuote(view) '}'
            )
        else
            SendToFrontend('{"type":"resume"}')
        ReloadNotesIfChangedExternally()
    }

    StartDashboardPolling()
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

    uri := args.Uri
    if !IsTrustedWebViewUrl(uri) {
        args.Cancel := true
        ; WebViewToo loads its own data: template before ASCS navigates;
        ; cancelling that is expected and is not worth logging.
        if !RegExMatch(uri, "i)^data:")
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
    ; Status 14 (OperationCanceled) is the expected result of a blocked navigation.
    if (!args.IsSuccess && args.WebErrorStatus != 14)
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

    ; Lets the title bar show the maximize or restore glyph.
    if (minMax != -1)
        SendToFrontend('{"type":"windowState","maximized":' (minMax = 1 ? "true" : "false") '}')

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
    global ASCS_PendingLauncherMode

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
                SendCustomCommands()
                SendWorkspaces()
                SendActivity()
                if ASCS_PendingLauncher {
                    ASCS_PendingLauncher := false
                    SendToFrontend('{"type":"openLauncher","mode":' JsonQuote(ASCS_PendingLauncherMode) '}')
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
                else if (content = "explorer"
                    || content = "vivaldi"
                    || content = "terminal" || content = "calculator"
                    || content = "taskmanager"
                    || content = "settings" || content = "downloads"
                    || content = "projects" || content = "snipping"
                    || content = "lock" || content = "mute")
                    LaunchCommand(content)
                else if (content = "reload")
                    ReloadASCS()
                else
                    WriteLog("Rejected invalid launcher identifier.")

            case "GetMetrics":
                if (content = "home" || content = "dashboard") {
                    ASCS_PendingView := content
                    RequestDashboardPush()
                } else if (content = "") {
                    RequestDashboardPush()
                } else {
                    WriteLog("Rejected GetMetrics payload.")
                }

            case "Log":
                if (StrLen(content) <= 4096)
                    WriteLog(content)
                else
                    WriteLog("Rejected oversized frontend log message.")

            case "GetActivity":
                SendActivity()

            case "GetCommands":
                SendCustomCommands()

            case "SaveCommands":
                if (StrLen(content) <= 65536)
                    SaveCustomCommands(content)
                else
                    WriteLog("Rejected oversized custom command payload.")

            case "RunCommand":
                if RegExMatch(content, "^\d{1,3}$")
                    SetTimer(RunCustomCommand.Bind(Integer(content), "palette"), -1)
                else
                    WriteLog("Rejected invalid custom command index.")

            case "BrowseCommandTarget":
                if RegExMatch(content, "^\d{1,3}\|(app|folder)$")
                    SetTimer(BrowseCommandTarget.Bind(content), -1)
                else
                    WriteLog("Rejected invalid browse request.")

            case "GetWorkspaces":
                SendWorkspaces()

            case "SaveWorkspace":
                if (StrLen(content) <= 64)
                    SetTimer(SaveWorkspace.Bind(content), -1)

            case "RestoreWorkspace":
                if (StrLen(content) <= 64) {
                    HandleClose()
                    SetTimer(RestoreWorkspace.Bind(content), -150)
                }

            case "DeleteWorkspace":
                if (StrLen(content) <= 64)
                    DeleteWorkspace(content)

            case "GetWindows":
                SendWindowList()

            case "FocusWindow":
                FocusWindowFromPalette(content)

            case "PasteSnippet":
                if (StrLen(content) <= 262144)
                    SetTimer(PasteSnippet.Bind(content), -1)
                else
                    SendToFrontend('{"type":"notice","message":"That snippet is too large to paste (256 KB limit)."}')

            case "SearchWeb":
                if (StrLen(content) <= 1000)
                    SearchWeb(content)

            case "SearchFiles":
                if (StrLen(content) <= 1000)
                    SearchFiles(content)

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

    SampleCpuUsage()   ; baseline for the first reading
    SetTimer(PushDashboard, 5000)
    RequestDashboardPush(300)
}

; Coalesces metric requests into one push on a timer, so that message
; handlers and hotkeys never wait on metric collection.
RequestDashboardPush(delay := 1) {
    SetTimer(PushDashboardOnce, -delay)
}

PushDashboardOnce(*) {
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
    foregroundAtLaunch := DllCall("GetForegroundWindow", "Ptr")
    pid := 0
    Run(target,,, &pid)

    if (!pid && fallbackWindow = "") {
        WriteLog("Launched application did not provide a process ID: " target)
        return false
    }

    deadline := A_TickCount + 8000
    SetTimer(
        WaitForApplicationWindow.Bind(
            pid,
            fallbackWindow,
            foregroundAtLaunch,
            deadline,
            target
        ),
        -100
    )
    return true
}

WaitForApplicationWindow(
    pid,
    fallbackWindow,
    foregroundAtLaunch,
    deadline,
    target,
    *
) {
    try {
        if pid {
            processWindow := "ahk_pid " pid
            if WinExist(processWindow) {
                ActivateLaunchedWindow(processWindow, foregroundAtLaunch)
                return
            }
        }

        if (fallbackWindow != "" && WinExist(fallbackWindow)) {
            ActivateLaunchedWindow(fallbackWindow, foregroundAtLaunch)
            return
        }

        if (A_TickCount >= deadline) {
            WriteLog("Launched application window did not appear: " target)
            return
        }

        SetTimer(
            WaitForApplicationWindow.Bind(
                pid,
                fallbackWindow,
                foregroundAtLaunch,
                deadline,
                target
            ),
            -100
        )
    } catch as err {
        WriteLog("Launched application activation failed: " target " | " err.Message)
    }
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

GetTerminalWindows() {
    previousDetectHidden := A_DetectHiddenWindows
    try {
        DetectHiddenWindows(true)
        windows := []
        for hwnd in WinGetList("ahk_exe WindowsTerminal.exe") {
            if DllCall("IsWindowVisible", "Ptr", hwnd, "Int")
                windows.Push(hwnd)
        }
    } finally {
        DetectHiddenWindows(previousDetectHidden)
    }

    return windows
}

FocusExistingApplication(windows, applicationName) {
    global ASCS_VirtualDesktopDllPath

    if !FileExist(ASCS_VirtualDesktopDllPath) {
        ShowDesktopTooltip(
            "Add VirtualDesktopAccessor.dll to focus apps across desktops."
        )
        throw Error(
            applicationName " is already open, but cross-desktop focus "
            "requires VirtualDesktopAccessor.dll."
        )
    }

    dll := ASCS_VirtualDesktopDllPath
    currentDesktop := DllCall(dll "\GetCurrentDesktopNumber", "Int")
    if (currentDesktop < 0)
        throw Error("Unable to determine the current virtual desktop.")

    selectedWindow := 0
    selectedDesktop := -1
    for hwnd in windows {
        desktop := DllCall(
            dll "\GetWindowDesktopNumber",
            "Ptr", hwnd,
            "Int"
        )
        if (desktop < 0)
            throw Error("Unable to determine an " applicationName " window's desktop.")

        if (desktop = currentDesktop) {
            selectedWindow := hwnd
            selectedDesktop := desktop
            break
        }

        if !selectedWindow {
            selectedWindow := hwnd
            selectedDesktop := desktop
        }
    }

    if !selectedWindow
        return false

    if (selectedDesktop != currentDesktop) {
        switched := DllCall(
            dll "\GoToDesktopNumber",
            "Int", selectedDesktop,
            "Int"
        )
        if (switched < 0)
            throw Error("Unable to switch to the " applicationName " desktop.")
    }

    window := "ahk_id " selectedWindow
    WinActivate(window)
    if !WinWaitActive(window,, 2)
        throw Error("Unable to focus the existing " applicationName " window.")
    return true
}

RunAndActivateExplorer(
    target,
    openRequestedFolder := false,
    forceNew := false
) {
    foregroundAtLaunch := DllCall("GetForegroundWindow", "Ptr")
    existingWindows := Map()
    existingExplorerWindows := GetExplorerWindows()
    for hwnd in existingExplorerWindows
        existingWindows[hwnd] := true

    if (existingExplorerWindows.Length && !openRequestedFolder && !forceNew) {
        FocusExistingApplication(existingExplorerWindows, "File Explorer")
        return true
    }

    Run(target)
    deadline := A_TickCount + 8000
    SetTimer(
        WaitForExplorerWindow.Bind(
            existingWindows,
            foregroundAtLaunch,
            deadline,
            target,
            forceNew
        ),
        -100
    )
    return true
}

WaitForExplorerWindow(
    existingWindows,
    foregroundAtLaunch,
    deadline,
    target,
    forceNew,
    *
) {
    try {
        windows := GetExplorerWindows()
        for hwnd in windows {
            if !existingWindows.Has(hwnd) {
                ActivateExplorerWindow(hwnd, foregroundAtLaunch)
                return
            }
        }

        if (A_TickCount >= deadline) {
            if (windows.Length && !forceNew) {
                ActivateExplorerWindow(windows[1], foregroundAtLaunch)
            } else {
                WriteLog("File Explorer window did not appear: " target)
            }
            return
        }

        SetTimer(
            WaitForExplorerWindow.Bind(
                existingWindows,
                foregroundAtLaunch,
                deadline,
                target,
                forceNew
            ),
            -100
        )
    } catch as err {
        WriteLog("File Explorer activation failed: " target " | " err.Message)
    }
}

WaitForNewTerminalWindow(
    existingWindows,
    foregroundAtLaunch,
    deadline,
    *
) {
    try {
        for hwnd in GetTerminalWindows() {
            if !existingWindows.Has(hwnd) {
                ActivateLaunchedWindow(
                    "ahk_id " hwnd,
                    foregroundAtLaunch
                )
                return
            }
        }

        if (A_TickCount >= deadline) {
            WriteLog("New Windows Terminal window did not appear.")
            return
        }

        SetTimer(
            WaitForNewTerminalWindow.Bind(
                existingWindows,
                foregroundAtLaunch,
                deadline
            ),
            -100
        )
    } catch as err {
        WriteLog("New Windows Terminal activation failed: " err.Message)
    }
}

ActivateExplorerWindow(hwnd, foregroundAtLaunch) {
    window := "ahk_id " hwnd
    ActivateLaunchedWindow(window, foregroundAtLaunch)
}

ActivateLaunchedWindow(window, foregroundAtLaunch) {
    if WinActive(window)
        return true

    if (DllCall("GetForegroundWindow", "Ptr") != foregroundAtLaunch)
        return false

    WinActivate(window)
    if WinWaitActive(window,, 1)
        return true

    if (DllCall("GetForegroundWindow", "Ptr") != foregroundAtLaunch)
        return false

    throw Error("Window could not be activated: " window)
}

LaunchCommand(command, thisHotkey := "", forceNew := false, *) {
    static labels := Map(
        "explorer", "File Explorer", "vivaldi", "Vivaldi",
        "terminal", "Windows Terminal", "calculator", "Calculator",
        "taskmanager", "Task Manager", "settings", "Windows Settings",
        "downloads", "Downloads", "projects", "Documents",
        "snipping", "Snipping Tool", "lock", "Lock workstation",
        "mute", "Toggle mute"
    )
    userProfile := EnvGet("USERPROFILE")
    if (
        !forceNew
        && (command = "terminal" || command = "explorer")
        && (thisHotkey != "")
        && GetKeyState("Shift", "P")
    )
        forceNew := true

    try {
        switch command {
            case "explorer":
                RunAndActivateExplorer(
                    forceNew ? "explorer.exe /n" : "explorer.exe",
                    false,
                    forceNew
                )

            case "vivaldi":
                LaunchVivaldi()

            case "terminal":
                if forceNew {
                    existingWindows := Map()
                    for hwnd in GetTerminalWindows()
                        existingWindows[hwnd] := true
                    foregroundAtLaunch := DllCall("GetForegroundWindow", "Ptr")
                    Run("wt.exe -w new")
                    SetTimer(
                        WaitForNewTerminalWindow.Bind(
                            existingWindows,
                            foregroundAtLaunch,
                            A_TickCount + 8000
                        ),
                        -100
                    )
                } else {
                    windows := GetTerminalWindows()
                    if windows.Length
                        FocusExistingApplication(windows, "Windows Terminal")
                    else
                        RunAndActivate(
                            "wt.exe",
                            "ahk_exe WindowsTerminal.exe"
                        )
                }

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
                LaunchSnipping()

            case "lock":
                DllCall("LockWorkStation")

            case "mute":
                SoundSetMute(!SoundGetMute())
        }
        if (command != "vivaldi" && labels.Has(command))
            RecordActivity("launch", (forceNew ? "New window: " : "") labels[command])

    } catch as err {
        WriteLog("Launch failed: " command " | " err.Message)
        RecordActivity("error", (labels.Has(command) ? labels[command] : command) ": " err.Message)

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
            RecordActivity("launch", "Vivaldi")
            return true
        }

        launched := RunAndActivate(
            '"' FindVivaldi() '"',
            "ahk_exe vivaldi.exe"
        )
        if !launched
            throw Error("Vivaldi did not open or could not be activated.")
        RecordActivity("launch", "Vivaldi")
        return true
    } catch as err {
        WriteLog("Vivaldi focus or launch failed: " err.Message)
        RecordActivity("error", "Vivaldi: " err.Message)
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

GetNotes(external := false) {
    global ASCS_NotesFile
    global ASCS_NotesRecovered
    global ASCS_NotesFileTime

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
    ASCS_NotesFileTime := GetNotesFileStamp()
    SendToFrontend(
        '{"type":"notes","data":'
        JsonQuote(raw) ',"recovered":' (recovered ? "true" : "false")
        ',"external":' (external ? "true" : "false") '}'
    )
}

; Modification time and size of notes.json, used to notice outside edits.
GetNotesFileStamp() {
    global ASCS_NotesFile

    try {
        if FileExist(ASCS_NotesFile)
            return FileGetTime(ASCS_NotesFile, "M") "|" FileGetSize(ASCS_NotesFile)
    }
    return ""
}

; Called when ASCS is shown: if notes.json was edited, replaced, or restored
; outside ASCS since it was last read or written, send the new contents.
; The frontend keeps its own copy instead when it has unsaved edits.
ReloadNotesIfChangedExternally() {
    global ASCS_NotesFileTime

    if (ASCS_NotesFileTime = "")
        return
    stamp := GetNotesFileStamp()
    if (stamp = ASCS_NotesFileTime)
        return
    WriteLog("notes.json changed outside ASCS; reloading notes.")
    GetNotes(true)
}

SaveNotes(content) {
    global ASCS_NotesFile
    global ASCS_NotesRecovered
    global ASCS_NotesFileTime

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
        ASCS_NotesFileTime := GetNotesFileStamp()
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
        RecordActivity("launch", "Everything")
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
    global ASCS_PendingView
    global ASCS_Wmi

    if !IsDashboardWindowVisible() {
        SetTimer(PushDashboard, 0)
        return
    }

    try {
        ; CPU and RAM come from fast Win32 calls. WMI's
        ; Win32_Processor.LoadPercentage blocks for about one second per query,
        ; which froze the UI and delayed hotkeys in 1.5.0.
        cpuUsage := SampleCpuUsage()

        memory := Buffer(64, 0)
        NumPut("UInt", 64, memory, 0)
        if !DllCall("GlobalMemoryStatusEx", "Ptr", memory, "Int")
            throw Error("GlobalMemoryStatusEx failed.")
        totalRAM := NumGet(memory, 8, "UInt64") / 1073741824
        freeRAM := NumGet(memory, 16, "UInt64") / 1073741824

        ramUsage := totalRAM
            ? Round((totalRAM - freeRAM) / totalRAM * 100)
            : 0

        drives := GetDriveMetrics()
        diskUsage := drives["cUsage"]
        diskUsed := drives["cUsed"]
        diskTotal := drives["cTotal"]

        ; Hardware inventory (about 0.1–0.5 s of WMI) runs on its own timer
        ; after this push, so the Dashboard renders live metrics first.
        if (ASCS_PendingView = "dashboard" && ASCS_HardwareJson = "")
            SetTimer(CollectHardwareDetails, -50)
        hardwareJson := ASCS_HardwareJson != ""
            ? ASCS_HardwareJson
            : "null"

        json := '{"type":"metrics","cpu":' cpuUsage
            . ',"ram":' ramUsage
            . ',"ramUsed":' Round(totalRAM - freeRAM, 1)
            . ',"ramTotal":' Round(totalRAM, 1)
            . ',"disk":' diskUsage
            . ',"diskUsed":' Round(diskUsed, 1)
            . ',"diskTotal":' Round(diskTotal, 1)
            . ',"hardware":' hardwareJson
            . ',"drives":' drives["json"] '}'

        SendToFrontend(json)

        ASCS_DashboardErrorShown := false

    } catch as err {
        ASCS_Wmi := 0
        if !ASCS_DashboardErrorShown {
            WriteLog("Dashboard metrics failed: " err.Message)

            SendToFrontend(
                '{"type":"error","message":"System metrics unavailable."}'
            )

            ASCS_DashboardErrorShown := true
        }
    }
}

; Returns system CPU utilization (0–100) since the previous sample. Samples
; taken less than 250 ms apart reuse the last value to avoid noisy readings.
SampleCpuUsage() {
    global ASCS_CpuSample

    idle := 0, kernel := 0, user := 0
    if !DllCall("GetSystemTimes", "Int64*", &idle, "Int64*", &kernel, "Int64*", &user, "Int")
        return IsObject(ASCS_CpuSample) ? ASCS_CpuSample["usage"] : 0

    now := A_TickCount
    total := kernel + user   ; kernel time includes idle time
    usage := 0
    if IsObject(ASCS_CpuSample) {
        if (now - ASCS_CpuSample["tick"] < 250)
            return ASCS_CpuSample["usage"]
        totalDelta := total - ASCS_CpuSample["total"]
        idleDelta := idle - ASCS_CpuSample["idle"]
        usage := totalDelta > 0
            ? Max(0, Min(100, Round((totalDelta - idleDelta) / totalDelta * 100)))
            : ASCS_CpuSample["usage"]
    }
    ASCS_CpuSample := Map("idle", idle, "total", total, "tick", now, "usage", usage)
    return usage
}

CollectHardwareDetails(*) {
    global ASCS_HardwareJson
    global ASCS_Wmi

    if (ASCS_HardwareJson != "")
        return
    try {
        if !IsObject(ASCS_Wmi)
            ASCS_Wmi := ComObjGet("winmgmts:\\.\root\cimv2")
        ASCS_HardwareJson := GetHardwareDetails(ASCS_Wmi)
    } catch as err {
        ASCS_Wmi := 0
        ASCS_HardwareJson := "null"   ; do not retry every refresh this session
        WriteLog("Hardware inventory failed: " err.Message)
    }
    RequestDashboardPush()
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

    probeId := DllCall("GetCurrentProcessId", "UInt") "-" now
    resultPath := A_ScriptDir "\data\drive-" StrUpper(letter)
        . "-" probeId ".probe"
    try {
        if FileExist(resultPath)
            FileDelete(resultPath)

        command := '"' A_AhkPath '" "' A_ScriptDir
            . '\ASCS.DriveProbe.ahk" ' StrUpper(letter) " " probeId
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
    metricsChanged := false
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
            metricsChanged := true
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
            metricsChanged := true
        } else {
            ASCS_DriveCache[drive] := Map(
                "checked", now,
                "metric", OfflineDriveMetric(drive)
            )
            WriteLog("Drive metrics worker exited without a result for " drive ".")
            metricsChanged := true
        }
        ASCS_DriveProbes.Delete(drive)
    }

    if !ASCS_DriveProbes.Count
        SetTimer(PollDriveProbes, 0)

    if metricsChanged
        SetTimer(PushDashboard, -1)
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



; ==========================================
; TRAY MENU (1.6.0)
; ==========================================

SetupTrayMenu() {
    global ASCS_DataDir
    global ASCS_LogFile

    tray := A_TrayMenu
    tray.Delete()
    tray.Add("Show ASCS", (*) => ShowASCS())
    tray.Add("Command palette`tSuper+Space", (*) => ShowCommandLauncher())
    tray.Add("Quick Notes", (*) => ShowView("notes"))
    tray.Add("Preferences", (*) => ShowView("settings"))
    tray.Add()
    tray.Add("Save workspace", (*) => SaveWorkspace())
    tray.Add("Restore workspace", (*) => RestoreWorkspace())
    tray.Add()
    tray.Add("Open data folder", (*) => Run('explorer.exe "' ASCS_DataDir '"'))
    tray.Add("Open log file", (*) => Run('"' ASCS_LogFile '"'))
    tray.Add()
    tray.Add("Reload ASCS`tCtrl+Alt+Shift+A", (*) => ReloadASCS())
    tray.Add("Exit ASCS", (*) => FlushNotesThen(() => ExitApp()))
    tray.Default := "Show ASCS"
    tray.ClickCount := 1
    A_IconTip := "Aeolionware SCS 1.6.0"
}

; Saves pending note edits, then restarts the script (picks up code and
; frontend changes). Used by Ctrl+Alt+Shift+A, the tray menu, and the palette.
ReloadASCS(*) {
    WriteLog("Reload requested.")
    ShowDesktopTooltip("Reloading ASCS…")
    FlushNotesThen(() => Reload())
}

; Asks the frontend to save pending note edits, then runs `action` once the
; save round trip has had time to finish.
FlushNotesThen(action) {
    if SendToFrontend('{"type":"flushNotes"}')
        SetTimer(action, -400)
    else
        action()
}

; Shows a toast in ASCS only while it is visible; hidden ASCS would show a
; stale message later.
NotifyFrontend(message) {
    if IsDashboardWindowVisible()
        SendToFrontend('{"type":"notice","message":' JsonQuote(message) '}')
}

; ==========================================
; ACTIVITY FEED (1.6.0)
; ==========================================

; Records a user-visible event for the Command Center feed. Entries persist
; in data\activity.log (the newest 50 are kept in memory).
RecordActivity(kind, text) {
    global ASCS_Activity
    global ASCS_ActivityFile
    global ASCS_ActivityAppends

    line := FormatActivityLine(FormatTime(A_Now, "yyyy-MM-dd'T'HH:mm:ss"), kind, text)
    item := ParseActivityLine(line)
    if !IsObject(item)
        return

    ASCS_Activity.Push(item)
    while (ASCS_Activity.Length > 50)
        ASCS_Activity.RemoveAt(1)

    try {
        FileAppend(line "`n", ASCS_ActivityFile, "UTF-8")
        ASCS_ActivityAppends++
        if (ASCS_ActivityAppends >= 100)
            CompactActivityFile()
    } catch as err {
        WriteLog("Activity log write failed: " err.Message)
    }

    SendToFrontend('{"type":"activityAdded","item":' ActivityJson(item) '}')
}

LoadActivity() {
    global ASCS_Activity
    global ASCS_ActivityFile

    ASCS_Activity := []
    if !FileExist(ASCS_ActivityFile)
        return
    lineCount := 0
    try {
        for line in StrSplit(FileRead(ASCS_ActivityFile, "UTF-8"), "`n", "`r") {
            if (line = "")
                continue
            lineCount++
            item := ParseActivityLine(line)
            if IsObject(item)
                ASCS_Activity.Push(item)
        }
    } catch as err {
        WriteLog("Activity log read failed: " err.Message)
    }
    while (ASCS_Activity.Length > 50)
        ASCS_Activity.RemoveAt(1)
    if (lineCount > 100)
        CompactActivityFile()
}

CompactActivityFile() {
    global ASCS_Activity
    global ASCS_ActivityFile
    global ASCS_ActivityAppends

    text := ""
    for item in ASCS_Activity
        text .= FormatActivityLine(item["time"], item["kind"], item["text"]) "`n"
    try {
        tempPath := ASCS_ActivityFile ".tmp"
        if FileExist(tempPath)
            FileDelete(tempPath)
        FileAppend(text, tempPath, "UTF-8")
        FileMove(tempPath, ASCS_ActivityFile, 1)
        ASCS_ActivityAppends := 0
    } catch as err {
        WriteLog("Activity log compaction failed: " err.Message)
    }
}

ActivityJson(item) {
    return '{"time":' JsonQuote(item["time"])
        . ',"kind":' JsonQuote(item["kind"])
        . ',"text":' JsonQuote(item["text"]) '}'
}

SendActivity() {
    global ASCS_Activity

    json := "["
    for index, item in ASCS_Activity
        json .= (index > 1 ? "," : "") ActivityJson(item)
    SendToFrontend('{"type":"activity","items":' json ']}')
}

; ==========================================
; NAMED WORKSPACES (1.6.0)
; ==========================================

; "Default" (or "") is the original data\workspace.ini used by Super+S/R;
; named layouts live in data\workspaces\<name>.ini.
GetWorkspacePath(name) {
    global ASCS_WorkspaceFile
    global ASCS_WorkspaceDir

    if IsDefaultWorkspaceName(name)
        return ASCS_WorkspaceFile
    return ASCS_WorkspaceDir "\" ValidateWorkspaceName(name) ".ini"
}

WorkspaceInfoJson(name, path) {
    windows := 0
    saved := ""
    try windows := Integer(IniRead(path, "Workspace", "WindowCount", "0"))
    try saved := IniRead(path, "Workspace", "Saved", "")
    if (saved = "") {
        try saved := FormatTime(FileGetTime(path, "M"), "yyyy-MM-dd'T'HH:mm:ss")
    }
    return '{"name":' JsonQuote(name) ',"windows":' windows ',"saved":' JsonQuote(saved) '}'
}

SendWorkspaces() {
    global ASCS_WorkspaceFile
    global ASCS_WorkspaceDir

    items := []
    if FileExist(ASCS_WorkspaceFile)
        items.Push(WorkspaceInfoJson("Default", ASCS_WorkspaceFile))
    try {
        Loop Files ASCS_WorkspaceDir "\*.ini" {
            name := IniRead(A_LoopFileFullPath, "Workspace", "Name", SubStr(A_LoopFileName, 1, -4))
            try name := ValidateWorkspaceName(name)
            catch
                continue
            if IsDefaultWorkspaceName(name)
                continue
            items.Push(WorkspaceInfoJson(name, A_LoopFileFullPath))
        }
    }
    SendToFrontend('{"type":"workspaces","items":[' JoinArray(items, ",") ']}')
}

DeleteWorkspace(name) {
    try {
        displayName := IsDefaultWorkspaceName(name) ? "Default" : ValidateWorkspaceName(name)
        path := GetWorkspacePath(displayName)
        if FileExist(path)
            FileDelete(path)
        RecordActivity("workspace", "Deleted workspace “" displayName "”")
        NotifyFrontend("Workspace “" displayName "” deleted.")
    } catch as err {
        WriteLog("Workspace delete failed: " err.Message)
        NotifyFrontend("Unable to delete the workspace: " err.Message)
    }
    SendWorkspaces()
}

; ==========================================
; CUSTOM COMMANDS (1.6.0)
; ==========================================

ActionLabels() {
    return Map(
        "notes", "Quick Notes", "everything", "Everything",
        "dashboard", "System Dashboard", "terminal", "Windows Terminal",
        "explorer", "File Explorer", "calculator", "Calculator",
        "taskmanager", "Task Manager"
    )
}

ActionKeysInUse() {
    global ASCS_ActionHotkeys

    labels := ActionLabels()
    used := Map()
    for action, key in ASCS_ActionHotkeys
        used[key] := labels.Has(action) ? labels[action] : action
    return used
}

LoadCustomCommands() {
    global ASCS_CommandsFile
    global ASCS_CustomCommands

    ASCS_CustomCommands := []
    if !FileExist(ASCS_CommandsFile)
        return

    count := 0
    try count := Integer(IniRead(ASCS_CommandsFile, "Commands", "Count", "0"))
    used := ActionKeysInUse()
    Loop Min(Max(count, 0), 30) {
        section := "Command" A_Index
        try {
            command := ValidateCustomCommand(
                IniRead(ASCS_CommandsFile, section, "name", ""),
                IniRead(ASCS_CommandsFile, section, "kind", ""),
                IniRead(ASCS_CommandsFile, section, "target", ""),
                IniRead(ASCS_CommandsFile, section, "key", "")
            )
            command["key"] := CheckShortcutKey(command["key"], command["name"], used, true)
            ASCS_CustomCommands.Push(command)
        } catch as err {
            WriteLog("Skipped custom command " A_Index ": " err.Message)
        }
    }
}

SaveCustomCommands(content) {
    global ASCS_CommandsFile
    global ASCS_CustomCommands

    try {
        commands := []
        used := ActionKeysInUse()
        for fields in ParseCustomCommandsPayload(content) {
            command := ValidateCustomCommand(fields[1], fields[2], fields[3], fields[4])
            command["key"] := CheckShortcutKey(command["key"], command["name"], used, true)
            commands.Push(command)
        }

        tempPath := ASCS_CommandsFile ".tmp"
        if FileExist(tempPath)
            FileDelete(tempPath)
        IniWrite(commands.Length, tempPath, "Commands", "Count")
        for index, command in commands {
            for field in ["name", "kind", "target", "key"]
                IniWrite(command[field], tempPath, "Command" index, field)
        }
        FileMove(tempPath, ASCS_CommandsFile, 1)

        ASCS_CustomCommands := commands
        RegisterConfiguredHotkeys()
        SendCustomCommands()
        SendToFrontend('{"type":"commandsSaved","message":"Custom commands saved and applied."}')
    } catch as err {
        WriteLog("Custom commands save failed: " err.Message)
        SendToFrontend('{"type":"error","scope":"commands","message":' JsonQuote(err.Message) '}')
        SendCustomCommands()
    }
}

SendCustomCommands() {
    global ASCS_CustomCommands

    json := "["
    for index, command in ASCS_CustomCommands {
        json .= (index > 1 ? "," : "")
            . '{"id":' index
            . ',"name":' JsonQuote(command["name"])
            . ',"kind":' JsonQuote(command["kind"])
            . ',"target":' JsonQuote(command["target"])
            . ',"key":' JsonQuote(command["key"]) '}'
    }
    SendToFrontend('{"type":"commands","items":' json ']}')
}

RunCustomCommand(index, source := "", *) {
    global ASCS_CustomCommands

    if (index < 1 || index > ASCS_CustomCommands.Length) {
        WriteLog("Rejected unknown custom command " index ".")
        return
    }
    command := ASCS_CustomCommands[index]
    target := command["target"]
    try {
        switch command["kind"] {
            case "app":
                if RegExMatch(target, "i)\.lnk$")
                    Run('"' target '"')
                else
                    RunAndActivate('"' target '"')
            case "folder":
                RunAndActivateExplorer('explorer.exe "' target '"', true)
            case "url":
                Run(target)
        }
        RecordActivity("command", command["name"])
    } catch as err {
        WriteLog("Custom command failed: " command["name"] " | " err.Message)
        RecordActivity("error", command["name"] ": " err.Message)
        ShowDesktopTooltip("Unable to run " command["name"] ".")
    }
}

; Opens a file or folder picker for a custom command row in Preferences.
BrowseCommandTarget(content, *) {
    global ASCS_App

    parts := StrSplit(content, "|")
    row := Integer(parts[1])
    kind := parts[2]
    try ASCS_App.Opt("+OwnDialogs")
    path := kind = "folder"
        ? DirSelect(, 3, "Choose a folder for this command")
        : FileSelect(3, , "Choose an application", "Applications (*.exe; *.lnk)")
    if (path = "")
        return
    SendToFrontend('{"type":"browseResult","row":' row ',"path":' JsonQuote(path) '}')
}

; ==========================================
; QUICK CAPTURE AND SNIPPETS (1.6.0)
; ==========================================

; Super + Shift + C: copies the selection in the active window (or
; uses the current clipboard text when nothing is selected) into a new note
; without showing ASCS. The clipboard is restored afterwards.
QuickCapture() {
    global ASCS_PageReady

    if !ASCS_PageReady {
        ShowDesktopTooltip("ASCS is still starting; try again in a moment.")
        return
    }

    source := ""
    try source := WinGetTitle("A")
    previousText := A_Clipboard
    saved := ClipboardAll()
    A_Clipboard := ""
    Send("^c")
    captured := ClipWait(0.5) ? A_Clipboard : ""
    A_Clipboard := saved

    fromClipboard := false
    if (Trim(captured, " `t`r`n") = "") {
        captured := previousText
        fromClipboard := true
    }
    if (Trim(captured, " `t`r`n") = "") {
        ShowDesktopTooltip(
            "Nothing to capture. Select or copy text, then press Super+Shift+C."
        )
        return
    }
    if (StrLen(captured) > 200000)
        captured := SubStr(captured, 1, 200000)

    SendToFrontend(
        '{"type":"captureNote","text":' JsonQuote(captured)
        ',"source":' JsonQuote(SubStr(source, 1, 120)) '}'
    )
    what := fromClipboard ? "clipboard" : "selection"
    ShowDesktopTooltip("Captured " what " to Quick Notes.")
    RecordActivity("note", "Captured " what (source != "" ? " from " SubStr(source, 1, 60) : ""))
}

; Pastes snippet text into the window that was active before ASCS opened.
; The text is pasted through the clipboard, which is restored afterwards.
PasteSnippet(text, *) {
    global ASCS_PreviousWindow

    if (text = "")
        return
    HandleClose()

    target := ASCS_PreviousWindow
    if !(target && WinExist("ahk_id " target)) {
        A_Clipboard := text
        ShowDesktopTooltip("Snippet copied to the clipboard.")
        return
    }

    try {
        WinActivate("ahk_id " target)
        if !WinWaitActive("ahk_id " target, , 1)
            throw Error("The previous window could not be focused.")
        saved := ClipboardAll()
        A_Clipboard := text
        if !ClipWait(1)
            throw Error("The clipboard did not accept the snippet.")
        Send("^v")
        SetTimer(() => (A_Clipboard := saved), -500)
        title := ""
        try title := WinGetTitle("ahk_id " target)
        RecordActivity("snippet", "Pasted snippet" (title != "" ? " into " SubStr(title, 1, 60) : ""))
    } catch as err {
        A_Clipboard := text
        WriteLog("Snippet paste failed: " err.Message)
        ShowDesktopTooltip("Snippet copied to the clipboard; paste it with Ctrl+V.")
    }
}

; ==========================================
; PALETTE: WINDOWS AND SEARCH (1.6.0)
; ==========================================

SendWindowList() {
    json := "["
    count := 0
    for hwnd in WinGetList() {
        if !IsWorkspaceWindow(hwnd, true)
            continue
        try {
            title := WinGetTitle("ahk_id " hwnd)
            process := WinGetProcessName("ahk_id " hwnd)
            minimized := WinGetMinMax("ahk_id " hwnd) = -1
        } catch {
            continue
        }
        json .= (count ? "," : "")
            . '{"id":"' hwnd '","title":' JsonQuote(title)
            . ',"app":' JsonQuote(RegExReplace(process, "i)\.exe$"))
            . ',"minimized":' (minimized ? "true" : "false") '}'
        count++
        if (count >= 40)
            break
    }
    SendToFrontend('{"type":"windows","items":' json ']}')
}

FocusWindowFromPalette(content) {
    if !RegExMatch(content, "^\d{1,20}$") {
        WriteLog("Rejected invalid window identifier.")
        return
    }
    hwnd := Integer(content)
    if !IsWorkspaceWindow(hwnd, true) {
        NotifyFrontend("That window is no longer open.")
        return
    }
    HandleClose()
    try {
        if (WinGetMinMax("ahk_id " hwnd) = -1)
            WinRestore("ahk_id " hwnd)
        WinActivate("ahk_id " hwnd)
    } catch as err {
        WriteLog("Window focus failed: " err.Message)
    }
}

SearchWeb(query) {
    global ASCS_SearchTemplate

    query := Trim(RegExReplace(query, "[\x00-\x1F]+", " "))
    if (query = "")
        return
    try {
        Run(BuildSearchUrl(ASCS_SearchTemplate, query))
        RecordActivity("search", "Web: " query)
    } catch as err {
        WriteLog("Web search failed: " err.Message)
        NotifyFrontend("Unable to open the web search.")
    }
}

SearchFiles(query) {
    global ASCS_EverythingPath

    query := SanitizeSearchQuery(query)
    if (query = "") {
        LaunchEverything()
        return
    }
    try {
        RunAndActivate(
            '"' ASCS_EverythingPath '" -search "' query '"',
            "ahk_exe Everything.exe"
        )
        RecordActivity("search", "Files: " query)
    } catch as err {
        WriteLog("Everything search failed: " err.Message)
        NotifyFrontend("Unable to open Everything. Check its installation.")
    }
}
