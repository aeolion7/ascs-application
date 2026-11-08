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

; Macro keys (1.7.0). Without Super they belong to the keyboard macro
; script; with Super, M4 starts a PSO session and M5-M7 list recent games.
; Super + Shift + macro keys are deliberately vacant.
F24 & F13::StartPsoSession()
F24 & F14::ShowRecentGames("retroarch")
F24 & F15::ShowRecentGames("dolphin")
F24 & F16::ShowRecentGames("pcsx2")

; Super+S saves the default workspace; Super+Shift+S is "save as": the
; palette opens on name entry and saves the layout under that name.
F24 & s:: {
    if GetKeyState("Shift", "P")
        ShowCommandLauncher("save-workspace")
    else
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
;   C  capture the selection into Quick Notes     P  paste a note (palette)
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
        "claude", LaunchClaude,
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
    global ASCS_QuickActions
    global ASCS_Drives
    global ASCS_SnapGap
    global ASCS_PreserveWindowSize
    global ASCS_ActionHotkeys
    global ASCS_ClaudeShortcut          ; 1.8.0: was missing, so a saved shortcut was dropped at start-up
    global ASCS_PowerDelay, ASCS_AscsSoundMode

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
        "claude", "c",
        "taskmanager", "h"
    )
    ; 1.7.0: Calculator gave its letter to Ask Claude and is palette-only;
    ; remove its obsolete shortcut entry rather than leave it lying around.
    try {
        if (IniRead(ASCS_SettingsFile, "Hotkeys", "calculator", "") != "")
            IniDelete(ASCS_SettingsFile, "Hotkeys", "calculator")
    }
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

    try {
        ASCS_ClaudeShortcut := ParseKeyCombo(IniRead(
            ASCS_SettingsFile, "Claude", "QuickEntry", "Ctrl+Alt+Space"
        ))
    } catch as err {
        WriteLog("Invalid Claude quick-entry shortcut; using Ctrl+Alt+Space. " err.Message)
        ASCS_ClaudeShortcut := ParseKeyCombo("Ctrl+Alt+Space")
    }

    try ASCS_PowerDelay := ValidatePowerDelay(IniRead(ASCS_SettingsFile, "Power", "Delay", "5"))
    catch as err
        WriteLog("Invalid power delay; using 5 s. " err.Message)
    try ASCS_AscsSoundMode := ValidateAscsSoundMode(IniRead(ASCS_SettingsFile, "Sounds", "AscsSounds", "show"))
    catch as err
        WriteLog("Invalid ASCS sounds preference; using on show. " err.Message)

    ; Quick actions are only stored once customized; until then the frontend
    ; shows its defaults.
    try {
        count := IniRead(ASCS_SettingsFile, "QuickActions", "Count", "")
        if (count != "") {
            lines := ""
            Loop Min(Max(Integer(count), 0), 6)
                lines .= IniRead(ASCS_SettingsFile, "QuickActions", "Action" A_Index, "") "`n"
            ASCS_QuickActions := ParseQuickActionsPayload(lines)
        }
    } catch as err {
        WriteLog("Invalid quick actions; using defaults. " err.Message)
        ASCS_QuickActions := 0
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
    global ASCS_ClaudeShortcut
    global ASCS_PowerDelay, ASCS_AscsSoundMode

    try {
        ; drives|gap|preserve|hotkeys|claude|powerDelay|ascsSounds|search.
        ; The search address is last and may itself contain "|".
        fields := StrSplit(content, "|",, 8)
        if (fields.Length != 8)
            throw Error("Settings payload has an invalid shape.")
        searchTemplate := ValidateSearchTemplate(fields[8])
        claudeShortcut := ParseKeyCombo(fields[5])
        powerDelay := ValidatePowerDelay(fields[6])
        ascsSounds := ValidateAscsSoundMode(fields[7])

        drives := ParseDriveList(fields[1])
        if !RegExMatch(fields[2], "^\d+$") || Integer(fields[2]) > 48
            throw Error("Snap gap must be between 0 and 48 pixels.")
        if !(fields[3] = "0" || fields[3] = "1")
            throw Error("Preserve window size must be enabled or disabled.")

        names := ["notes", "everything", "dashboard", "terminal",
            "explorer", "claude", "taskmanager"]
        keys := StrSplit(fields[4], ",")
        if (keys.Length != names.Length)
            throw Error("Shortcut preferences are incomplete.")

        labels := ["Quick Notes", "Everything", "System Dashboard",
            "Windows Terminal", "File Explorer", "Claude", "Task Manager"]
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
        IniWrite(claudeShortcut["display"], ASCS_SettingsFile, "Claude", "QuickEntry")
        IniWrite(fields[2], ASCS_SettingsFile, "Window", "SnapGap")
        IniWrite(fields[3], ASCS_SettingsFile, "Window", "PreserveSize")
        for action, key in hotkeys
            IniWrite(key, ASCS_SettingsFile, "Hotkeys", action)
        IniWrite(powerDelay, ASCS_SettingsFile, "Power", "Delay")
        IniWrite(ascsSounds, ASCS_SettingsFile, "Sounds", "AscsSounds")

        ASCS_PowerDelay := powerDelay
        ASCS_AscsSoundMode := ascsSounds
        ASCS_SearchTemplate := searchTemplate
        ASCS_ClaudeShortcut := claudeShortcut
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
    global ASCS_ClaudeShortcut
    global ASCS_PowerDelay, ASCS_AscsSoundMode
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
        ',"claudeShortcut":' JsonQuote(ASCS_ClaudeShortcut["display"])
        ',"powerDelay":' ASCS_PowerDelay
        ',"ascsSounds":' JsonQuote(ASCS_AscsSoundMode)
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
        ; 1.9.0: with VirtualDesktopAccessor, windows on every desktop (their
        ; desktop and whether they're pinned to all), up to 48; without it,
        ; the current desktop as before. Windows on other desktops count as
        ; hidden to AutoHotkey, so hidden windows are looked at (and the
        ; filter still keeps only visible, uncloaked-or-elsewhere ones).
        desktops := DesktopsAvailable()
        if desktops
            DetectHiddenWindows(true)
        for hwnd in WinGetList() {
            if !IsWorkspaceWindow(hwnd, false, desktops)
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
                ; The visible frame, without Windows' invisible borders: what a
                ; restore places (1.9.0; before, restores landed a border's
                ; width off and a little larger).
                x += context["leftInset"], y += context["topInset"]
                width -= context["leftInset"] + context["rightInset"]
                height -= context["topInset"] + context["bottomInset"]
                workWidth := Max(1, context["workRight"] - context["workLeft"])
                workHeight := Max(1, context["workBottom"] - context["workTop"])
                record := Map(
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
                )
                if desktops {
                    pinned := WindowPinned(hwnd)
                    record["pinned"] := pinned ? 1 : 0
                    record["desktop"] := pinned ? -1 : WindowDesktop(hwnd)
                }
                windows.Push(record)
            } catch as err {
                skipped++
                WriteLog("Workspace skipped a window: " err.Message)
            }
            if (windows.Length >= 48)
                break
        }

        if !windows.Length
            throw Error("No windows could be captured.")

        IniWrite(windows.Length, tempPath, "Workspace", "WindowCount")
        IniWrite(displayName, tempPath, "Workspace", "Name")
        IniWrite(FormatTime(A_Now, "yyyy-MM-dd'T'HH:mm:ss"), tempPath, "Workspace", "Saved")
        spread := Map()
        if desktops {
            ; The desktops' names, so a restore can find a renamed or reordered one.
            names := DesktopNames()
            IniWrite(names.Length, tempPath, "Workspace", "Desktops")
            for index, nameOfDesktop in names
                IniWrite(nameOfDesktop, tempPath, "Desktops", index - 1)
            for savedWindow in windows
                if (savedWindow["desktop"] >= 0)
                    spread[savedWindow["desktop"]] := true
        }
        for index, savedWindow in windows {
            section := "Window" index
            for key, value in savedWindow
                IniWrite(value, tempPath, section, key)
        }
        FileMove(tempPath, workspacePath, 1)
        summary := "Workspace “" displayName "” saved (" windows.Length " windows"
            . (spread.Count > 1 ? " on " spread.Count " desktops" : "")
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
IsWorkspaceWindow(hwnd, allowMinimized := false, otherDesktops := false) {
    global ASCS_App

    try {
        if (hwnd = ASCS_App.Hwnd)
            return false
        windowTitle := "ahk_id " hwnd
        if (WinGetTitle(windowTitle) = ""
            || !DllCall("IsWindowVisible", "Ptr", hwnd, "Int")
            || (IsWindowCloaked(hwnd) && !(otherDesktops && IsCloakedByShell(hwnd))))
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
        if (count < 1 || count > 48)
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
                "launched", false,
                ; 1.9.0: its desktop (-1 pinned to all; -2 from before 1.9.0 or
                ; saved without desktops: the current one), and where it goes.
                "desktop", WorkspaceInteger(IniRead(workspacePath, section, "desktop", "-2"), -2),
                "pinned", IniRead(workspacePath, section, "pinned", "0") = "1",
                "target", -2
            ))
        }

        if !pending.Length {
            ShowWorkspaceMessage(
                "None of the applications in the saved workspace are available.",
                "Icon!"
            )
            return
        }

        ; Across desktops (1.9.0): each saved desktop goes to the one with its
        ; name, else its number; if some don't exist, ask first.
        if (IniRead(workspacePath, "Workspace", "Desktops", "") != "" && DesktopsAvailable()) {
            saved := Map()
            for record in pending
                if (record["desktop"] >= 0 && !saved.Has(record["desktop"]))
                    saved[record["desktop"]] := IniRead(workspacePath, "Desktops", record["desktop"], "")
            current := DesktopNames()
            targets := WorkspaceDesktopTargets(saved, current)
            missing := WorkspaceDesktopsMissing(targets, current)
            if (missing > 0) {
                SetTimer(AskWorkspaceDesktops.Bind(displayName, pending, saved, current, missing), -1)
                return
            }
            ApplyWorkspaceDesktops(pending, targets, current.Length - 1)
        }
        StartWorkspaceRestore(displayName, pending)
    } catch as err {
        WriteLog("Workspace restore failed: " err.Message)
        ShowWorkspaceMessage("Unable to restore the workspace.`n`n" err.Message, "Iconx")
    }
}

WorkspaceInteger(text, fallback) {
    try return Integer(text)
    return fallback
}

StartWorkspaceRestore(displayName, pending) {
    global ASCS_WorkspaceRestorePending
    global ASCS_WorkspaceClaimed
    ASCS_WorkspaceRestorePending := pending
    ASCS_WorkspaceClaimed := Map()
    ShowDesktopTooltip("Restoring workspace “" displayName "”.")
    RecordActivity("workspace", "Restored workspace “" displayName "”")
    RestoreWorkspaceWindows()
    if ASCS_WorkspaceRestorePending.Length
        SetTimer(RestoreWorkspaceWindows, 500)
}

; The workspace uses desktops that don't exist: add them, use the last one
; for those windows, or don't restore (1.9.0). Runs on its own timer, so the
; hotkey or message that started the restore returns at once.
AskWorkspaceDesktops(displayName, pending, saved, current, missing) {
    answer := MsgBox("“" displayName "” uses " (current.Length + missing) " desktops; you have " current.Length ".`n`n"
        . "Yes: add " missing " desktop" (missing = 1 ? "" : "s") ".`n"
        . "No: put those windows on your last desktop.`n"
        . "Cancel: don't restore it.", "Aeolionware SCS: Workspace", "YesNoCancel Icon? T120")
    if (answer = "Yes") {
        added := 0
        Loop missing {
            if (AddDesktop() = -1)
                break
            added++
        }
        WriteLog("Workspace “" displayName "”: added " added " desktop" (added = 1 ? "" : "s") ".")
        names := DesktopNames()
        ApplyWorkspaceDesktops(pending, WorkspaceDesktopTargets(saved, names), names.Length - 1)
    } else if (answer = "No") {
        ApplyWorkspaceDesktops(pending, WorkspaceDesktopTargets(saved, current), current.Length - 1)
    } else {
        return
    }
    StartWorkspaceRestore(displayName, pending)
}

ApplyWorkspaceDesktops(pending, targets, last) {
    for record in pending {
        if (record["pinned"] || record["desktop"] < 0)
            continue
        target := targets.Has(record["desktop"]) ? targets[record["desktop"]] : -1
        record["target"] := target >= 0 ? target : Max(0, last)
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
    ; Across desktops (1.9.0), windows already open on other desktops are
    ; reused too (they count as hidden to AutoHotkey).
    spread := false
    for record in pending
        if (record.Has("target") && (record["target"] >= 0 || record["pinned"]))
            spread := true
    if spread
        DetectHiddenWindows(true)
    candidates := Map()
    needsFolders := false
    for record in pending {
        key := StrLower(record["process"])
        if !candidates.Has(key) {
            list := []
            try {
                for hwnd in WinGetList("ahk_exe " record["process"])
                    if IsWorkspaceWindow(hwnd, true, spread)
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
        ; Then onto its desktop, or onto every desktop (1.9.0).
        if (record.Has("pinned") && record["pinned"])
            PinWindowToAllDesktops(hwnd)
        else if (record.Has("target") && record["target"] >= 0 && WindowDesktop(hwnd) != record["target"])
            MoveWindowToDesktop(hwnd, record["target"])
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

