
#Requires AutoHotkey v2.0 64-bit
#SingleInstance Force
#Warn
#Warn LocalSameAsGlobal, Off

SetWorkingDir(A_ScriptDir)

; ==========================================
; AEOLIONWARE SUPER COMMAND SYSTEM
; Version 1.7.0
; ==========================================

#Include webview\WebViewToo.ahk
#Include lib\ASCS.Core.ahk

; ==========================================
; GLOBAL VARIABLES
; ==========================================

global ASCS_Version := "1.8.0"
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

; Default window size (1.7.0): 15% larger than 1920 x 1080, so the Command
; Center and Quick Notes fit without scrolling; always capped to the screen.
global ASCS_WindowWidth := 2208
global ASCS_WindowHeight := 1242
global ASCS_AlmanacDir := ASCS_DataDir "\almanac"

; Almanac (1.7.0). The location is fixed to New York City for now.
global ASCS_AlmanacWikipedia := false
global ASCS_Countdowns := []
global ASCS_AlmanacPlace := "New York City"
global ASCS_AlmanacLatitude := 40.7128
global ASCS_AlmanacLongitude := -74.006
global ASCS_AlmanacRequests := Map()
global ASCS_AlmanacRetryAt := 0
; Logs tab (1.7.0): the last stamp sent per source, to skip unchanged refreshes.
global ASCS_LogStamps := Map()

; Games (1.7.0). Defaults match the keyboard macro script; Preferences can
; change them. secrets.ini (RetroAchievements) stays in the uncommitted data folder.
global ASCS_GamePaths := Map(
    "retroarch", "C:\Retroarch\retroarch.exe",
    "dolphin", "C:\dolphin-2512-x64\Dolphin-x64\Dolphin.exe",
    "pcsx2", "C:\PCSX2\pcsx2-qt.exe",
    "pso", EnvGet("USERPROFILE") "\EphineaPSO\online.exe",
    "discord", EnvGet("LOCALAPPDATA") "\Discord\Discord.exe"
)
global ASCS_Headphones := "Headphones (SteelSeries Arctis Nova 5)"
global ASCS_SoundSwitchKey := Map("display", "Ctrl+Alt+F11", "send", "^!{F11}")
global ASCS_ShowCovers := true
global ASCS_GameIndex := Map()
global ASCS_GameListCache := Map()
global ASCS_GameLibraryJson := "[]"
global ASCS_GameLibraryStamp := ""
global ASCS_SecretsFile := ASCS_DataDir "\secrets.ini"
global ASCS_RetroAchievementsAt := 0
global ASCS_RetroAchievementsCache := Map()
global ASCS_HttpRequests := Map()
global ASCS_PsoSession := 0
global ASCS_CoverQueue := []
; RetroAchievements images (1.7.0): queue and cache folder.
global ASCS_RaImageQueue := []
; The D-input tester's device, report description and axes while it is open.
global ASCS_HidTester := 0
global ASCS_RaImageFolder := ASCS_DataDir "\ra-images"
; 1.8.0: power actions' delay (seconds, counted down by ASCS) and ASCS's own
; sounds (off / start / show) with the two files they play.
global ASCS_PowerDelay := 5
; 1.8.0: the sound library behind the Sounds view, and its index.
global ASCS_SoundLibrary := "C:\Sounds\all-windows-sounds-main"
global ASCS_SoundIndex := Map()
; 1.8.0: the calendar server's state, its process, requests in flight, and
; reminders (pending, and fired in the last day).
global ASCS_CalendarState := Map("state", "starting", "message", "")
global ASCS_CalendarPid := 0
global ASCS_CalendarRequests := Map()
global ASCS_CalendarReminders := []
global ASCS_CalendarFired := Map()
global ASCS_ReminderBalloonAt := 0      ; when the last reminder pop-up showed (A_TickCount)
global ASCS_SoundLengthQueue := []
global ASCS_SoundLengthsFile := ASCS_DataDir "\sound-lengths.txt"
global ASCS_AscsSoundMode := "show"
global ASCS_AscsSoundFiles := Map(
    "show", "C:\Sounds\all-windows-sounds-main\Aeolionware Startup\ASCS Sound Files\Windows XP Logon.wav",
    "hide", "C:\Sounds\all-windows-sounds-main\Aeolionware Startup\ASCS Sound Files\Windows XP Logoff.wav")
; The PSO session's Discord voice channel (a validated discord:// link, or "").
global ASCS_PsoVoiceChannel := ""
; Now playing's sessions: source -> Map(owner, title, since in Unix seconds).
global ASCS_PlaySessions := Map()
; The cache cap: past 20 MB, the least recently shown images are removed down to 16 MB.
global ASCS_RaImageCacheLimit := 20 * 1024 * 1024
global ASCS_RaImageCacheTarget := 16 * 1024 * 1024
; Power actions (1.7.0): the single-use ticket and any countdown in progress.
global ASCS_PowerTicket := 0
global ASCS_PowerPending := 0

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
; Claude desktop app: its quick-entry shortcut (set in Preferences) and the
; packaged app's ID, used to start it when it isn't running.
global ASCS_ClaudeShortcut := Map("display", "Ctrl+Alt+Space", "send", "^!{Space}")
global ASCS_ClaudeAppId := "Claude_pzs8sxrjxfjjc!Claude"
global ASCS_QuickActions := 0          ; 0 = never customized (frontend defaults)
global ASCS_MetricHistory := []        ; [cpu, ram] every 10 s, newest last (15 min)
; Defaults; user selections are persisted in settings.ini.
global ASCS_Drives := ["C:", "J:"]

DirCreate(ASCS_DataDir)
DirCreate(ASCS_WebViewDataDir)
DirCreate(ASCS_WorkspaceDir)
LoadUserSettings()
LoadAlmanacSettings()
LoadGameSettings()
LoadSoundSettings()
LoadCustomCommands()
LoadActivity()

ASCS_EverythingPath := FindEverything()
SetTimer(PruneRaImageCache, -60000)             ; trim the image cache once, off the start-up path
SetTimer(TrackPlaySessions, 10000)              ; Now playing's session timer
SetTimer(AscsStartupSound, -1500)               ; "on start" sound, unless Windows just signed in
SetTimer(StartCalendarServer, -2000)            ; the calendar's Radicale server, off the start-up path
OnExit(StopCalendarServer)

if !FileExist(ASCS_NotesFile)
    FileAppend('{"version":2,"activeId":null,"notes":[]}', ASCS_NotesFile, "UTF-8")

; ==========================================
; WEBVIEW2 INITIALIZATION
; ==========================================

try {
    MonitorGetWorkArea(1, &workLeft, &workTop, &workRight, &workBottom)
    windowWidth := Min(ASCS_WindowWidth, workRight - workLeft - 32)
    windowHeight := Min(ASCS_WindowHeight, workBottom - workTop - 32)
    windowX := workLeft + Floor((workRight - workLeft - windowWidth) / 2)
    windowY := workTop + Floor((workBottom - workTop - windowHeight) / 2)

    ASCS_App := WebViewGui(
        "-Caption +Resize +MinSize760x520 +E0x40000",
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
        OnMessage(0x404, ReminderBalloonClicked)   ; AHK_NOTIFYICON: the tray icon's messages
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
    SampleCpuUsage()                          ; baseline for the history sampler
    SetTimer(SampleMetricHistory, 10000)

    WriteLog("ASCS " ASCS_Version " initialized.")
    RecordActivity("system", "ASCS " ASCS_Version " started")

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

; Opens the command palette. Modes: "" (everything), "snippets" (paste a
; note; the name is kept from when these were snippets), "workspaces".
ShowCommandLauncher(mode := "") {
    global ASCS_PendingLauncher
    global ASCS_PendingLauncherMode
    global ASCS_PageReady

    if !(mode = "" || mode = "snippets" || mode = "workspaces" || mode = "save-workspace"
        || mode = "games:retroarch" || mode = "games:dolphin" || mode = "games:pcsx2")
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
    global ASCS_AscsSoundMode
    global ASCS_PageReady
    global ASCS_PendingView
    global ASCS_PreviousWindow

    if (view != "")
        ASCS_PendingView := view

    ; Remember where the user was, so notes paste into that window and
    ; palette actions can return focus to it.
    foreground := DllCall("GetForegroundWindow", "Ptr")
    if (foreground && foreground != ASCS_App.Hwnd)
        ASCS_PreviousWindow := foreground

    ; WebViewToo's Show() re-applies the current client size, which for a
    ; minimized window is the tiny stub's (then clamped to the minimum size).
    ; So a minimized window is restored first, to its normal size.
    wasVisible := DllCall("IsWindowVisible", "Ptr", ASCS_App.Hwnd, "Int")
    if DllCall("IsIconic", "Ptr", ASCS_App.Hwnd, "Int") {
        DllCall("ShowWindow", "Ptr", ASCS_App.Hwnd, "Int", 9)      ; SW_RESTORE
        WriteLog("Window was minimized when shown; restored to its normal size.")
    }
    ASCS_App.Show()
    if (!wasVisible && ASCS_AscsSoundMode = "show")
        PlayAscsSound("show")
    EnsureWindowUsable()
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

; Showing a window that was hidden while minimized can leave it as Windows'
; tiny minimized stub, which can't be resized; a stale maximized state after
; a display change can do the same. So every show checks the window: a
; minimized one is restored, and one that is too small or off every monitor
; is put back at the default size, centered on the monitor under the pointer.
EnsureWindowUsable() {
    global ASCS_App
    hwnd := "ahk_id " ASCS_App.Hwnd
    try {
        state := WinGetMinMax(hwnd)
        if (state = -1) {
            WinRestore(hwnd)
            WriteLog("Window was minimized when shown; restored.")
        }
        WinGetPos(&x, &y, &width, &height, hwnd)
        onScreen := false
        Loop MonitorGetCount() {
            MonitorGetWorkArea(A_Index, &left, &top, &right, &bottom)
            if (x + 80 < right && x + width - 80 > left && y + 40 < bottom && y > top - 40)
                onScreen := true
        }
        if (width >= 760 && height >= 520 && onScreen)
            return
        WriteLog("Window was " width "x" height " at " x "," y " (state " state "); reset to the default size.")
        if (WinGetMinMax(hwnd) != 0)
            WinRestore(hwnd)
        CoordMode("Mouse", "Screen")
        MouseGetPos(&mouseX, &mouseY)
        monitor := 1
        Loop MonitorGetCount() {
            MonitorGet(A_Index, &left, &top, &right, &bottom)
            if (mouseX >= left && mouseX < right && mouseY >= top && mouseY < bottom)
                monitor := A_Index
        }
        MonitorGetWorkArea(monitor, &left, &top, &right, &bottom)
        width := Min(ASCS_WindowWidth, right - left - 32), height := Min(ASCS_WindowHeight, bottom - top - 32)
        WinMove(left + (right - left - width) // 2, top + (bottom - top - height) // 2, width, height, hwnd)
    } catch as err {
        WriteLog("Window check failed: " err.Message)
    }
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
        ; canceling that is expected and is not worth logging.
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

; ---- ASCS's own sounds (1.8.0)
; Off, on start (logon when ASCS starts, logoff on Exit), or on show (logon
; when the window appears, logoff when it is hidden). Never at Windows sign-in
; (ASCS starts then) or shutdown (ASCS is closed, not exited, then).

PlayAscsSound(kind, wait := false) {
    global ASCS_AscsSoundFiles
    file := ASCS_AscsSoundFiles[kind]
    if !FileExist(file)
        return
    try SoundPlay(file, wait)
    catch as err
        WriteLog("ASCS sound not played: " err.Message)
}

; Windows' shell host (sihost.exe) starts at sign-in; ASCS starting within two
; minutes of it is part of the sign-in, where the startup sound already plays.
SignedInMomentsAgo() {
    started := ProcessStartUnix(ProcessExist("sihost.exe"))
    return started && DateDiff(A_NowUTC, "19700101000000", "Seconds") - started < 120
}

AscsStartupSound() {
    global ASCS_AscsSoundMode
    if (ASCS_AscsSoundMode = "start" && !SignedInMomentsAgo())
        PlayAscsSound("show")
}

ExitASCS(*) {
    global ASCS_AscsSoundMode
    FlushNotesThen(() => (ASCS_AscsSoundMode = "start" ? PlayAscsSound("hide", true) : 0, ExitApp()))
}

HandleClose(*) {
    global ASCS_App, ASCS_AscsSoundMode

    SendToFrontend('{"type":"flushNotes"}')
    if (ASCS_AscsSoundMode = "show" && DllCall("IsWindowVisible", "Ptr", ASCS_App.Hwnd, "Int"))
        PlayAscsSound("hide")
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
            case "ClientError":
                ; Script errors in the page, for the log and the Logs tab
                ; (WriteLog strips line breaks and control characters).
                static clientErrors := 0
                if (StrLen(content) <= 400 && ++clientErrors <= 20)
                    WriteLog("Page error: " content)

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
                SendQuickActions()
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
                else if (content = "claude")
                    LaunchClaude()
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

            case "GetAlmanac":
                HandleGetAlmanac()

            case "SaveAlmanac":
                if (StrLen(content) <= 2048)
                    SaveAlmanac(content)
                else
                    WriteLog("Rejected oversized almanac payload.")

            case "OpenWikipedia":
                if (StrLen(content) <= 200)
                    OpenWikipedia(content)

            case "GetLog":
                if (StrLen(content) <= 32)
                    HandleGetLog(content)

            case "GetGames":
                SendGames()

            case "GetGamesLive":
                SendGamesLive()

            case "GetRunning":
                SendRunningApps()

            case "LaunchGame":
                if (StrLen(content) <= 48)
                    LaunchGame(content)

            case "GetControllerInput":
                if (StrLen(content) <= 4)
                    SendControllerInput(content)

            case "StartControllerTester":
                if (StrLen(content) <= 24)
                    StartHidTester(content)

            case "StopControllerTester":
                StopHidTester()

            case "RumbleController":
                if (StrLen(content) <= 4)
                    RumbleController(content)

            case "RenameController":
                if (StrLen(content) <= 64)
                    RenameController(content)

            case "OpenBluetoothRename":
                OpenBluetoothRename()

            case "PowerArm":
                if (StrLen(content) <= 16)
                    PowerArm(content)

            case "PowerRun":
                if (StrLen(content) <= 40)
                    PowerRun(content)

            case "PowerCancel":
                CancelPowerAction()

            case "PowerAnyway":
                PowerAnyway()

            case "PowerNow":
                if (content = "lock")
                    DllCall("LockWorkStation")

            case "GetRecycleBin":
                SendRecycleBin()

            case "GetAudioDevices":
                SendAudioDevices()

            case "SelectAudioDevice":
                if (StrLen(content) <= 120)
                    SelectAudioDevice(content)

            case "GetGameDetails":
                if (StrLen(content) <= 48)
                    SendGameDetails(content)

            case "ShowGameFile":
                if (StrLen(content) <= 48)
                    ShowGameFile(content)

            case "GetCovers":
                if (StrLen(content) <= 2048)
                    SendCovers(content)

            case "GetGameSettings":
                SendGameSettings()

            case "SaveGameSettings":
                if (StrLen(content) <= 4096)
                    SaveGameSettings(content)
                else
                    WriteLog("Rejected oversized games settings payload.")

            case "GetRetroAchievements":
                FetchRetroAchievements(content = "refresh")

            case "GetRaImages":
                if (StrLen(content) <= 600)
                    SendRaImages(content)

            case "GetCalendarState":
                SendCalendarState()

            case "CalDav":
                if (StrLen(content) <= 600000)
                    CalendarRequest(content)

            case "ExportCalendarFile":
                if (StrLen(content) <= 5300000)
                    ExportCalendarFile(content)

            case "ImportCalendarFile":
                ImportCalendarFile()

            case "SetReminders":
                if (StrLen(content) <= 60000)
                    SetCalendarReminders(content)

            case "GetSoundLibrary":
                SendSoundLibrary(content = "refresh")

            case "GetSound":
                SendSound(content)

            case "PlaySoundNative":
                PlaySoundNative(content)

            case "StopSoundNative":
                StopSoundNative()

            case "ShowSoundFile":
                ShowSoundFile(content)

            case "DeleteLeveledSound":
                if (StrLen(content) <= 500)
                    DeleteLeveledSound(content)

            case "DeleteLeveledSounds":
                if (StrLen(content) <= 6000)
                    DeleteLeveledSounds(content)

            case "RestoreAllSounds":
                RestoreAllSounds()

            case "SaveLeveledSound":
                if (StrLen(content) <= 48000000)
                    SaveLeveledSound(content)

            case "GetInUseSound":
                if (StrLen(content) <= 100)
                    SendInUseSound(content)

            case "UseLeveledSound":
                if (StrLen(content) <= 48000000)
                    UseLeveledSound(content)

            case "RestoreAscsSound":
                if (StrLen(content) <= 20)
                    RestoreAscsSound(content)

            case "GetWindowsSounds":
                SendWindowsSounds()

            case "SetWindowsSound":
                if (StrLen(content) <= 600)
                    SetWindowsSound(content)

            case "RestoreWindowsSound":
                if (StrLen(content) <= 64)
                    RestoreWindowsSound(content)

            case "PreviewWindowsSound":
                if (StrLen(content) <= 64)
                    PreviewWindowsSound(content)

            case "SetAscsSound":
                if (StrLen(content) <= 600)
                    SetAscsSound(content)

            case "SetSoundLibrary":
                if (StrLen(content) <= 400)
                    SetSoundLibrary(content)

            case "SetupRetroAchievements":
                SetupRetroAchievements()

            case "OpenRetroAchievementsProfile":
                OpenRetroAchievementsProfile()

            case "StartPsoSession":
                StartPsoSession()

            case "OpenLogFile":
                if (StrLen(content) <= 32)
                    OpenLogFile(content)

            case "SaveQuickActions":
                if (StrLen(content) <= 2048)
                    SaveQuickActions(content)
                else
                    WriteLog("Rejected oversized quick actions payload.")

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

            case "PasteNote":
                if (StrLen(content) <= 262144)
                    SetTimer(PasteNote.Bind(content), -1)
                else
                    SendToFrontend('{"type":"notice","message":"That note is too large to paste (256 KB limit)."}')

            case "CopyNote":
                if (StrLen(content) <= 262144)
                    CopyNote(content)
                else
                    SendToFrontend('{"type":"notice","message":"That note is too large to copy (256 KB limit)."}')

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

; Super+C (default letter): Claude's quick-entry prompt. With the Claude
; desktop app running, ASCS presses its quick-entry shortcut and checks that
; a Claude window came forward; if none did, or Claude isn't running, or no
; shortcut is set, it starts the app, which brings its window forward. The
; app is matched by its window class as well as its process name, so the
; Claude Code command-line tool (also claude.exe) is never mistaken for it.
LaunchClaude(*) {
    global ASCS_ClaudeShortcut
    global ASCS_ClaudeAppId

    DetectHiddenWindows(true)
    running := WinExist("ahk_class Chrome_WidgetWin_1 ahk_exe Claude.exe")
    DetectHiddenWindows(false)

    if (running && ASCS_ClaudeShortcut["send"] != "") {
        Send(ASCS_ClaudeShortcut["send"])
        if WinWaitActive("ahk_exe Claude.exe",, 1.5) {
            RecordActivity("launch", "Claude quick entry")
            return
        }
        WriteLog("Claude quick entry did not appear after " ASCS_ClaudeShortcut["display"] "; opening the app instead.")
    }
    try {
        Run("shell:AppsFolder\" ASCS_ClaudeAppId)
        RecordActivity("launch", "Claude")
    } catch as err {
        WriteLog("Claude launch failed: " err.Message)
        RecordActivity("error", "Claude: " err.Message)
        MsgBox("Unable to open Claude. Is the Claude desktop app installed?`n`n" err.Message, "Claude", "Iconx T15")
    }
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
        try CheckNoteGroups(content)            ; 1.8.0: groups are checked here too
        catch as err {
            WriteLog("Notes not saved: " err.Message)
            SendNotesError("Notes weren't saved: " err.Message " The previous file was kept.")
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

        ReadMemoryStatus(&totalRAM, &freeRAM)

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
            . ',"history":' MetricHistoryJson()
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

; Physical memory in GB (total and available) from GlobalMemoryStatusEx.
ReadMemoryStatus(&totalGB, &freeGB) {
    memory := Buffer(64, 0)
    NumPut("UInt", 64, memory, 0)
    if !DllCall("GlobalMemoryStatusEx", "Ptr", memory, "Int")
        throw Error("GlobalMemoryStatusEx failed.")
    totalGB := NumGet(memory, 8, "UInt64") / 1073741824
    freeGB := NumGet(memory, 16, "UInt64") / 1073741824
}

; Every 10 s, even while ASCS is hidden, so the Dashboard's history graphs
; are ready when it opens. Two near-instant system calls per sample; the
; newest 90 samples (15 minutes) are kept in memory only.
SampleMetricHistory(*) {
    global ASCS_MetricHistory
    static failed := false

    try {
        cpu := SampleCpuUsage()
        ReadMemoryStatus(&totalGB, &freeGB)
        ram := totalGB ? Round((totalGB - freeGB) / totalGB * 100) : 0
        ASCS_MetricHistory.Push([cpu, ram])
        while (ASCS_MetricHistory.Length > 90)
            ASCS_MetricHistory.RemoveAt(1)
        failed := false
    } catch as err {
        if !failed
            WriteLog("Metric history sample failed: " err.Message)
        failed := true
    }
}

MetricHistoryJson() {
    global ASCS_MetricHistory

    json := "["
    for index, sample in ASCS_MetricHistory
        json .= (index > 1 ? "," : "") "[" sample[1] "," sample[2] "]"
    return json "]"
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
        ; Win32_Processor.MaxClockSpeed reports the rated (base) clock, not
        ; boost. Keep this on one line: AutoHotkey only joins a continuation
        ; line that starts with an operator, so a call on the next line would
        ; silently run as its own discarded statement.
        if RegExMatch(clockSpeed, "^\d+$")
            cores .= (cores != "" ? " · " : "") Round(Integer(clockSpeed) / 1000, 1) " GHz base"
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
    global ASCS_Version
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
    tray.Add("Exit ASCS", ExitASCS)
    tray.Default := "Show ASCS"
    tray.ClickCount := 1
    A_IconTip := "Aeolionware SCS " ASCS_Version
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
; ALMANAC (1.7.0)
; ==========================================
; Moon, sunrise and sunset, the quote of the day and countdowns are worked
; out in the page with no network access. The Wikipedia almanac (on this day,
; observances, featured article) is opt-in: when enabled, ASCS fetches two
; fixed en.wikipedia.org feeds once a day over HTTPS, with redirects off,
; certificate checks on, a size cap and timeouts. The text is cached in
; data\almanac and handed to the page as a plain string, where it is parsed
; defensively and shown as text only. Links are rebuilt here from validated
; article titles; the page never supplies an address.

LoadAlmanacSettings() {
    global ASCS_SettingsFile
    global ASCS_AlmanacWikipedia
    global ASCS_Countdowns

    ASCS_AlmanacWikipedia := IniRead(ASCS_SettingsFile, "Almanac", "Wikipedia", "0") = "1"
    countdowns := []
    try {
        count := Integer(IniRead(ASCS_SettingsFile, "Countdowns", "Count", "0"))
        Loop Min(Max(count, 0), 12) {
            line := IniRead(ASCS_SettingsFile, "Countdowns", "Item" A_Index, "")
            parts := StrSplit(line, "|")
            if (parts.Length = 2)
                countdowns.Push(Map("date", ValidateCountdownDate(parts[1]), "name", ValidateCountdownName(parts[2])))
        }
    } catch as err {
        WriteLog("Invalid countdowns ignored. " err.Message)
    }
    ASCS_Countdowns := countdowns
}

SendAlmanacSettings() {
    global ASCS_AlmanacWikipedia
    global ASCS_Countdowns
    global ASCS_AlmanacPlace
    global ASCS_AlmanacLatitude
    global ASCS_AlmanacLongitude

    ; One-off countdowns go once their day has passed (1.8.0).
    kept := ActiveCountdowns(ASCS_Countdowns, FormatTime(, "yyyy-MM-dd"))
    if (kept.Length != ASCS_Countdowns.Length) {
        try {
            WriteCountdowns(kept)
            WriteLog("Countdowns: removed " (ASCS_Countdowns.Length - kept.Length) " that had passed.")
        } catch as err {
            WriteLog("Countdowns: couldn't remove passed ones. " err.Message)
        }
        ASCS_Countdowns := kept
    }
    items := "["
    for index, item in ASCS_Countdowns
        items .= (index > 1 ? "," : "") '{"date":' JsonQuote(item["date"]) ',"name":' JsonQuote(item["name"]) '}'
    items .= "]"
    SendToFrontend(
        '{"type":"almanac","wikipedia":' (ASCS_AlmanacWikipedia ? "true" : "false")
        ',"place":' JsonQuote(ASCS_AlmanacPlace)
        ',"latitude":' ASCS_AlmanacLatitude ',"longitude":' ASCS_AlmanacLongitude
        ',"countdowns":' items '}'
    )
}

; Page asked for the almanac (start-up, or the Command Center opened):
; settings, today's cached feeds, and a fetch if today's are missing.
HandleGetAlmanac() {
    global ASCS_AlmanacWikipedia

    SendAlmanacSettings()
    if !ASCS_AlmanacWikipedia
        return
    today := FormatTime(, "yyyy-MM-dd")
    for kind in ["featured", "holidays"] {
        path := AlmanacCachePath(kind, today)
        if FileExist(path) {
            try SendAlmanacFeed(kind, FileRead(path, "UTF-8"))
        }
    }
    FetchAlmanacFeeds()
}

SaveAlmanac(content) {
    global ASCS_SettingsFile
    global ASCS_AlmanacWikipedia
    global ASCS_Countdowns

    try {
        almanac := ParseAlmanacPayload(content)
        IniWrite(almanac["wikipedia"] ? "1" : "0", ASCS_SettingsFile, "Almanac", "Wikipedia")
        WriteCountdowns(almanac["countdowns"])

        wasEnabled := ASCS_AlmanacWikipedia
        ASCS_AlmanacWikipedia := almanac["wikipedia"]
        ASCS_Countdowns := almanac["countdowns"]
        if (wasEnabled && !ASCS_AlmanacWikipedia)
            ClearAlmanacCache()
        SendToFrontend('{"type":"almanacSaved","message":"Saved. Countdowns are sorted by date."}')
        RecordActivity("system", "Almanac preferences saved")
        HandleGetAlmanac()
    } catch as err {
        WriteLog("Almanac save failed: " err.Message)
        SendToFrontend('{"type":"error","scope":"almanac","message":' JsonQuote(err.Message) '}')
        SendAlmanacSettings()
    }
}

WriteCountdowns(countdowns) {
    global ASCS_SettingsFile
    try IniDelete(ASCS_SettingsFile, "Countdowns")
    IniWrite(countdowns.Length, ASCS_SettingsFile, "Countdowns", "Count")
    for index, item in countdowns
        IniWrite(item["date"] "|" item["name"], ASCS_SettingsFile, "Countdowns", "Item" index)
}

AlmanacCachePath(kind, date) {
    global ASCS_AlmanacDir
    return ASCS_AlmanacDir "\" date "-" kind ".json"
}

ClearAlmanacCache(keepDate := "") {
    global ASCS_AlmanacDir
    Loop Files ASCS_AlmanacDir "\*.json" {
        if (keepDate = "" || SubStr(A_LoopFileName, 1, 10) != keepDate)
            try FileDelete(A_LoopFileFullPath)
    }
}

AlmanacUserAgent() {
    global ASCS_Version
    ; Wikimedia asks API clients to identify themselves with contact details.
    return "ASCS/" ASCS_Version " (Aeolionware Super Command System; lionsamurai@gmail.com)"
}

FetchAlmanacFeeds() {
    global ASCS_AlmanacWikipedia
    global ASCS_AlmanacRequests
    global ASCS_AlmanacRetryAt
    global ASCS_AlmanacDir

    if (!ASCS_AlmanacWikipedia || A_TickCount < ASCS_AlmanacRetryAt)
        return
    today := FormatTime(, "yyyy-MM-dd")
    DirCreate(ASCS_AlmanacDir)
    for kind in ["featured", "holidays"] {
        if (FileExist(AlmanacCachePath(kind, today)) || ASCS_AlmanacRequests.Has(kind))
            continue
        try {
            request := ComObject("WinHttp.WinHttpRequest.5.1")
            request.Option[6] := false          ; WinHttpRequestOption_EnableRedirects
            request.SetTimeouts(5000, 5000, 10000, 15000)
            request.Open("GET", AlmanacFeedUrl(kind, A_YYYY, A_MM, A_DD), true)
            request.SetRequestHeader("User-Agent", AlmanacUserAgent())
            request.SetRequestHeader("Accept", "application/json")
            request.Send()
            ASCS_AlmanacRequests[kind] := Map("request", request, "date", today, "started", A_TickCount)
        } catch as err {
            AlmanacFetchFailed(kind, err.Message)
        }
    }
    if ASCS_AlmanacRequests.Count
        SetTimer(PollAlmanacRequests, 250)
}

PollAlmanacRequests() {
    global ASCS_AlmanacRequests

    for kind in ["featured", "holidays"] {
        if !ASCS_AlmanacRequests.Has(kind)
            continue
        entry := ASCS_AlmanacRequests[kind]
        try {
            if !entry["request"].WaitForResponse(0) {
                if (A_TickCount - entry["started"] > 30000) {
                    try entry["request"].Abort()
                    throw Error("timed out")
                }
                continue
            }
            ASCS_AlmanacRequests.Delete(kind)
            request := entry["request"]
            if (request.Status != 200)
                throw Error("HTTP " request.Status)
            if !InStr(request.GetResponseHeader("Content-Type"), "application/json")
                throw Error("unexpected content type")
            text := AlmanacResponseText(request)
            ; A cheap shape check; the page parses it strictly (JSON.parse) and
            ; a full parse here would stall hotkeys on a 200 KB feed.
            if !RegExMatch(text, "^\s*\{[\s\S]*\}\s*$")
                throw Error("response is not a JSON object")
            path := AlmanacCachePath(kind, entry["date"])
            try FileDelete(path ".tmp")
            FileAppend(text, path ".tmp", "UTF-8-RAW")
            FileMove(path ".tmp", path, 1)
            ClearAlmanacCache(entry["date"])
            SendAlmanacFeed(kind, text)
        } catch as err {
            if ASCS_AlmanacRequests.Has(kind)
                ASCS_AlmanacRequests.Delete(kind)
            AlmanacFetchFailed(kind, err.Message)
        }
    }
    if !ASCS_AlmanacRequests.Count
        SetTimer(PollAlmanacRequests, 0)
}

; Decodes the body as UTF-8 from its raw bytes. WinHttp's ResponseText
; can't decode Wikipedia's Content-Type (it carries a profile parameter
; after the charset), and the byte count is capped before any decoding.
AlmanacResponseText(request) {
    text := HttpResponseText(request, 3000000)
    if (StrLen(text) > 1500000)
        throw Error("response too large")
    return text
}

AlmanacFetchFailed(kind, message) {
    global ASCS_AlmanacRetryAt
    ; Back off for half an hour; the local almanac carries on meanwhile.
    ASCS_AlmanacRetryAt := A_TickCount + 1800000
    WriteLog("Almanac " kind " feed unavailable: " message)
}

; Feeds go to the page as a plain string ("ALMANAC", kind, then the text),
; never as script or markup.
SendAlmanacFeed(kind, text) {
    global ASCS_App
    global ASCS_PageReady
    if !ASCS_PageReady
        return
    try ASCS_App.PostWebMessageAsString("ALMANAC`n" kind "`n" text)
    catch as err
        WriteLog("Almanac delivery failed: " err.Message)
}

OpenWikipedia(title) {
    global ASCS_AlmanacWikipedia
    if !ASCS_AlmanacWikipedia
        return
    try {
        Run(BuildWikipediaUrl(title))
        RecordActivity("search", "Wikipedia: " SubStr(title, 1, 80))
    } catch as err {
        WriteLog("Wikipedia link rejected: " err.Message)
    }
}

; ==========================================
; LOGS (1.7.0)
; ==========================================
; Read-only views of three fixed log files. The page names a source; it
; never supplies a path. Only the tail is read (512 KB, 2,000 lines), and a
; refresh is answered only when the file has changed.

LogSources() {
    global ASCS_LogFile
    global ASCS_ActivityFile
    return Map(
        "ascs", ASCS_LogFile,
        "activity", ASCS_ActivityFile,
        "codebutton", EnvGet("LOCALAPPDATA") "\VSCodeMacro.log"
    )
}

HandleGetLog(content) {
    global ASCS_App
    global ASCS_LogStamps

    parts := StrSplit(content, "|")
    source := parts[1]
    refresh := parts.Length > 1 && parts[2] = "refresh"
    sources := LogSources()
    if !sources.Has(source) {
        WriteLog("Rejected unknown log source.")
        return
    }
    path := sources[source]
    stamp := FileExist(path) ? FileGetTime(path, "M") "/" FileGetSize(path) : "missing"
    if (refresh && ASCS_LogStamps.Has(source) && ASCS_LogStamps[source] = stamp)
        return
    ASCS_LogStamps[source] := stamp
    text := stamp = "missing" ? "" : ReadLogTail(path)
    try ASCS_App.PostWebMessageAsString("LOG`n" source "`n" (stamp = "missing" ? "missing" : "ok") "`n" text)
    catch as err
        WriteLog("Log delivery failed: " err.Message)
}

ReadLogTail(path, maxBytes := 524288, maxLines := 2000) {
    try {
        file := FileOpen(path, "r", "UTF-8")
        size := file.Length
        if (size > maxBytes) {
            file.Pos := size - maxBytes
            file.ReadLine()                  ; drop the partial first line
        }
        text := file.Read()
        file.Close()
    } catch as err {
        WriteLog("Log read failed: " err.Message)
        return ""
    }
    lines := StrSplit(RTrim(StrReplace(text, "`r"), "`n"), "`n")
    if (lines.Length <= maxLines)
        return JoinArray(lines, "`n")
    kept := []
    Loop maxLines
        kept.Push(lines[lines.Length - maxLines + A_Index])
    return JoinArray(kept, "`n")
}

OpenLogFile(source) {
    sources := LogSources()
    if !sources.Has(source)
        return
    path := sources[source]
    if FileExist(path)
        Run('notepad.exe "' path '"')
}

; ==========================================
; GAMES (1.7.0)
; ==========================================
; The Games tab reads the emulators' own records (read-only): RetroArch's
; history and runtime logs, PCSX2's playtime.dat and game list, and
; Dolphin's TimePlayed.ini and game list. ASCS keeps a private index of
; game ids to paths; the page only ever sends an id back, and launches use
; the configured emulator with the indexed path, quoted. Cover art (opt-in)
; is read from the emulators' own local folders, checked to be a PNG or
; JPEG under 1.5 MB, and sent as a data URI; nothing is downloaded.

LoadGameSettings() {
    global ASCS_SettingsFile, ASCS_GamePaths, ASCS_Headphones, ASCS_SoundSwitchKey, ASCS_ShowCovers, ASCS_PsoVoiceChannel

    for name, defaultPath in ASCS_GamePaths.Clone() {
        try ASCS_GamePaths[name] := ValidateExecutablePath(
            IniRead(ASCS_SettingsFile, "Games", name, defaultPath), name)
        catch as err {
            WriteLog("Games: " err.Message)
            ASCS_GamePaths[name] := ""
        }
    }
    try ASCS_Headphones := ValidateDeviceName(IniRead(ASCS_SettingsFile, "Games", "Headphones", ASCS_Headphones))
    try ASCS_SoundSwitchKey := ParseKeyCombo(IniRead(ASCS_SettingsFile, "Games", "SoundSwitch", "Ctrl+Alt+F11"))
    catch as err
        WriteLog("Games: invalid SoundSwitch shortcut. " err.Message)
    ; Cover art reads local image folders only, so it is on unless turned off.
    ASCS_ShowCovers := IniRead(ASCS_SettingsFile, "Games", "Covers", "1") = "1"
    try ASCS_PsoVoiceChannel := DiscordChannelUri(IniRead(ASCS_SettingsFile, "Games", "VoiceChannel", ""))
    catch as err {
        WriteLog("Games: " err.Message)
        ASCS_PsoVoiceChannel := ""
    }
}

SendGameSettings() {
    global ASCS_GamePaths, ASCS_Headphones, ASCS_SoundSwitchKey, ASCS_ShowCovers, ASCS_PsoVoiceChannel

    devices := "["
    Loop 32 {
        try name := SoundGetName(, A_Index)
        catch
            break
        devices .= (A_Index > 1 ? "," : "") JsonQuote(name)
    }
    devices .= "]"
    paths := "{"
    for name, path in ASCS_GamePaths
        paths .= (A_Index > 1 ? "," : "") JsonQuote(name) ":" JsonQuote(path)
    paths .= "}"
    SendToFrontend('{"type":"gameSettings","paths":' paths
        ',"headphones":' JsonQuote(ASCS_Headphones)
        ',"soundSwitch":' JsonQuote(ASCS_SoundSwitchKey["display"])
        ',"covers":' (ASCS_ShowCovers ? "true" : "false")
        ',"voiceChannel":' JsonQuote(ASCS_PsoVoiceChannel = "" ? "" : StrReplace(ASCS_PsoVoiceChannel, "discord://-/", "https://discord.com/"))
        ',"devices":' devices
        ',"retroAchievements":' JsonQuote(RetroAchievementsState()) '}')
}

; Payload: retroarch|dolphin|pcsx2|pso|discord|headphones|soundswitch|covers|voicechannel
SaveGameSettings(content) {
    global ASCS_SettingsFile, ASCS_GamePaths, ASCS_Headphones, ASCS_SoundSwitchKey, ASCS_ShowCovers, ASCS_GameLibraryStamp, ASCS_PsoVoiceChannel

    try {
        fields := StrSplit(content, "|")
        if (fields.Length != 9 || !(fields[8] = "0" || fields[8] = "1"))
            throw Error("Games settings payload has an invalid shape.")
        voiceChannel := DiscordChannelUri(fields[9])
        labels := ["RetroArch", "Dolphin", "PCSX2", "The PSO launcher", "Discord"]
        names := ["retroarch", "dolphin", "pcsx2", "pso", "discord"]
        paths := Map()
        Loop 5
            paths[names[A_Index]] := ValidateExecutablePath(fields[A_Index], labels[A_Index])
        headphones := ValidateDeviceName(fields[6])
        soundSwitch := ParseKeyCombo(fields[7])

        for name, path in paths
            IniWrite(path, ASCS_SettingsFile, "Games", name)
        IniWrite(headphones, ASCS_SettingsFile, "Games", "Headphones")
        IniWrite(soundSwitch["display"], ASCS_SettingsFile, "Games", "SoundSwitch")
        IniWrite(fields[8], ASCS_SettingsFile, "Games", "Covers")
        IniWrite(voiceChannel, ASCS_SettingsFile, "Games", "VoiceChannel")
        ASCS_PsoVoiceChannel := voiceChannel
        for name, path in paths
            ASCS_GamePaths[name] := path
        ASCS_Headphones := headphones
        ASCS_SoundSwitchKey := soundSwitch
        ASCS_ShowCovers := fields[8] = "1"
        ASCS_GameLibraryStamp := ""
        SendToFrontend('{"type":"gameSettingsSaved","message":"Games & apps saved."}')
        SendGameSettings()
    } catch as err {
        WriteLog("Games settings save failed: " err.Message)
        SendToFrontend('{"type":"error","scope":"games","message":' JsonQuote(err.Message) '}')
        SendGameSettings()
    }
}

; ---- the library

GameDataDirs() {
    global ASCS_GamePaths
    dirs := Map("retroarch", "", "pcsx2", "", "dolphin", "")
    if (ASCS_GamePaths["retroarch"] != "") {
        SplitPath(ASCS_GamePaths["retroarch"], , &dir)
        dirs["retroarch"] := dir
    }
    if (ASCS_GamePaths["pcsx2"] != "") {
        SplitPath(ASCS_GamePaths["pcsx2"], , &dir)
        dirs["pcsx2"] := FileExist(dir "\portable.txt") ? dir : A_MyDocuments "\PCSX2"
    }
    if (ASCS_GamePaths["dolphin"] != "") {
        SplitPath(ASCS_GamePaths["dolphin"], , &dir)
        dirs["dolphin"] := FileExist(dir "\portable.txt") ? dir "\User" : EnvGet("APPDATA") "\Dolphin Emulator"
    }
    return dirs
}

FileStamp(path) {
    return FileExist(path) ? FileGetTime(path, "M") "/" FileGetSize(path) : "missing"
}

; Parses of the large binary game lists are kept until the file changes.
CachedGameList(kind, path) {
    global ASCS_GameListCache
    stamp := FileStamp(path)
    if (ASCS_GameListCache.Has(kind) && ASCS_GameListCache[kind]["stamp"] = stamp)
        return ASCS_GameListCache[kind]["games"]
    games := Map()
    if (stamp != "missing") {
        try {
            buffer := FileRead(path, "RAW")
            games := kind = "pcsx2" ? ParsePcsx2GameList(buffer, buffer.Size) : ParseDolphinGameList(buffer, buffer.Size)
        } catch as err {
            WriteLog("Games: " kind " game list unreadable: " err.Message)
        }
    }
    ASCS_GameListCache[kind] := Map("stamp", stamp, "games", games)
    return games
}

LocalIsoFromUnix(unix) {
    if (unix <= 0)
        return ""
    utc := DateAdd("19700101000000", unix, "Seconds")
    return FormatTime(DateAdd(utc, DateDiff(A_Now, A_NowUTC, "Seconds"), "Seconds"), "yyyy-MM-dd'T'HH:mm:ss")
}

LocalIsoFromStamp(stamp) {
    return stamp = "" ? "" : FormatTime(stamp, "yyyy-MM-dd'T'HH:mm:ss")
}

FirstExisting(paths*) {
    for path in paths
        if (path != "" && FileExist(path))
            return path
    return ""
}

; Builds the game list and the private id -> launch index. Returns JSON.
BuildGameLibrary() {
    global ASCS_GameIndex, ASCS_ShowCovers

    index := Map()
    json := ""
    dirs := GameDataDirs()
    add(id, title, emulator, system, seconds, last, count, launch, cover, details := 0, showPath := "") {
        index[id] := Map("emulator", emulator, "title", title, "launch", launch, "cover", cover,
            "details", IsObject(details) ? details : Map(), "show", showPath)
        json .= (json = "" ? "" : ",") '{"id":' JsonQuote(id) ',"title":' JsonQuote(SubStr(title, 1, 160))
            . ',"emulator":' JsonQuote(emulator) ',"system":' JsonQuote(SubStr(system, 1, 80))
            . ',"seconds":' seconds ',"last":' JsonQuote(last) ',"plays":' count
            . ',"launchable":' (IsObject(launch) ? "true" : "false")
            . ',"installed":' (IsObject(launch) && launch.Has("installed") && !launch["installed"] ? "false" : "true")
            . ',"cover":' (cover != "" ? "true" : "false") '}'
    }

    ; RetroArch: runtime logs (play time), joined to history (how to launch).
    if (dirs["retroarch"] != "") {
        history := Map()
        try {
            for item in ParseRetroArchHistory(FileRead(dirs["retroarch"] "\playlists\builtin\content_history.lpl", "UTF-8")) {
                base := ContentBaseName(item["path"])
                if (base != "" && !history.Has(base))
                    history[base] := item
            }
        }
        played := Map()
        Loop Files dirs["retroarch"] "\playlists\logs\*.lrtl", "R" {
            if (A_Index > 2000)
                break
            try {
                log := ParseRetroArchRuntime(FileRead(A_LoopFileFullPath, "UTF-8"))
                if !log
                    continue
                SplitPath(A_LoopFileFullPath, , &folder, , &base)
                SplitPath(folder, &core)
                if !played.Has(base)
                    played[base] := Map("seconds", 0, "last", "", "count", 0, "core", core)
                entry := played[base]
                entry["seconds"] += log["seconds"]
                entry["count"] += log["count"]
                if (StrCompare(log["last"], entry["last"]) > 0)
                    entry["last"] := log["last"]
            }
        }
        for base, item in history
            if !played.Has(base)
                played[base] := Map("seconds", 0, "last", "", "count", 0, "core", "")
        n := 0
        for base, entry in played {
            n++
            item := history.Has(base) ? history[base] : 0
            title := item && item["label"] != "" ? item["label"] : base
            system := item && item["db"] != "" ? item["db"] : entry["core"]
            launch := item ? Map("content", ContentFilePath(item["path"]), "core", item["core"]) : 0
            cover := ""
            if (ASCS_ShowCovers && item && item["db"] != "")
                cover := FirstExisting(dirs["retroarch"] "\thumbnails\" item["db"] "\Named_Boxarts\" RetroArchThumbnailName(title) ".png")
            details := Map("Core", item && item["coreName"] != "" ? item["coreName"] : entry["core"])
            if item
                details["File"] := GameFileName(ContentFilePath(item["path"]))
            add("ra:" n, title, "retroarch", system, entry["seconds"], entry["last"], entry["count"], launch, cover,
                details, item ? ContentFilePath(item["path"]) : "")
        }
    }

    ; PCSX2: playtime.dat, named and located through its game list.
    if (dirs["pcsx2"] != "") {
        try {
            list := CachedGameList("pcsx2", dirs["pcsx2"] "\cache\gamelist.cache")
            for game in ParsePcsx2Playtime(FileRead(dirs["pcsx2"] "\inis\playtime.dat")) {
                if !RegExMatch(game["serial"], "^[A-Za-z0-9-]{1,32}$")
                    continue
                known := list.Has(game["serial"]) ? list[game["serial"]] : 0
                title := known && known["title"] != "" ? known["title"] : game["serial"]
                cover := ""
                if ASCS_ShowCovers {
                    folder := dirs["pcsx2"] "\covers\"
                    cover := FirstExisting(folder game["serial"] ".png", folder game["serial"] ".jpg",
                        folder RetroArchThumbnailName(title) ".png", folder RetroArchThumbnailName(title) ".jpg")
                }
                details := Map("Serial", game["serial"])
                if known
                    details["File"] := GameFileName(known["path"])
                add("ps2:" game["serial"], title, "pcsx2", "PlayStation 2", game["seconds"],
                    LocalIsoFromUnix(game["last"]), 0, known ? Map("content", known["path"]) : 0, cover,
                    details, known ? known["path"] : "")
            }
        } catch as err {
            WriteLog("Games: PCSX2 records unreadable: " err.Message)
        }
    }

    ; Dolphin: TimePlayed.ini, named and located through its game list.
    if (dirs["dolphin"] != "") {
        try {
            list := CachedGameList("dolphin", dirs["dolphin"] "\Cache\gamelist.cache")
            for id, seconds in ParseDolphinTimePlayed(FileRead(dirs["dolphin"] "\Config\TimePlayed.ini")) {
                known := list.Has(id) ? list[id] : 0
                if (!known && seconds < 600)
                    continue                 ; system channels and brief tests
                title := known ? GameTitleFromFile(known["file"]) : id
                system := SubStr(id, 1, 1) = "G" ? "GameCube" : "Wii"
                uid := dirs["dolphin"] "\Cache\" id ".uidcache"
                last := FileExist(uid) ? LocalIsoFromStamp(FileGetTime(uid, "M")) : ""
                cover := ASCS_ShowCovers ? FirstExisting(dirs["dolphin"] "\Cache\GameCovers\" id ".png") : ""
                details := Map("Game ID", id)
                if known
                    details["File"] := known["file"]
                add("gc:" id, title, "dolphin", system, seconds, last, 0, known ? Map("content", known["path"]) : 0, cover,
                    details, known ? known["path"] : "")
            }
        } catch as err {
            WriteLog("Games: Dolphin records unreadable: " err.Message)
        }
    }

    ; Steam: installed games from the app manifests, play time from the
    ; signed-in account's localconfig.vdf, portrait art from Steam's cache.
    steam := SteamFolder()
    if (steam != "") {
        try {
            playtime := CachedSteamPlaytime(steam)
            libraries := [steam]
            try {
                for folder in ParseSteamLibraryFolders(FileRead(steam "\steamapps\libraryfolders.vdf", "UTF-8"))
                    if !HasValue(libraries, folder)
                        libraries.Push(folder)
            }
            seen := Map()
            for library in libraries {
                Loop Files library "\steamapps\appmanifest_*.acf" {
                    if (A_Index > 2000)
                        break
                    manifest := ParseSteamManifest(FileRead(A_LoopFileFullPath, "UTF-8"))
                    appid := manifest.Has("appid") ? manifest["appid"] : ""
                    name := manifest.Has("name") ? manifest["name"] : ""
                    if (!RegExMatch(appid, "^\d{1,10}$") || name = "" || IsSteamTool(name) || seen.Has(appid))
                        continue
                    seen[appid] := true
                    played := playtime.Has(appid) ? playtime[appid] : Map("minutes", 0, "last", 0)
                    lastUnix := Max(played["last"], manifest.Has("LastPlayed") && RegExMatch(manifest["LastPlayed"], "^\d{1,12}$") ? Integer(manifest["LastPlayed"]) : 0)
                    installDir := manifest.Has("installdir") ? manifest["installdir"] : ""
                    folder := installDir != "" && !InStr(installDir, "..") ? library "\steamapps\common\" installDir : ""
                    details := Map("App ID", appid)
                    if (installDir != "")
                        details["Install folder"] := installDir
                    if (manifest.Has("SizeOnDisk") && RegExMatch(manifest["SizeOnDisk"], "^\d{1,15}$"))
                        details["Size on disk"] := FormatBytes(Integer(manifest["SizeOnDisk"]))
                    cover := ASCS_ShowCovers ? SteamCoverRef(steam, appid) : ""
                    add("st:" appid, name, "steam", "PC", played["minutes"] * 60, LocalIsoFromUnix(lastUnix), 0,
                        Map("appid", appid), cover, details, folder)
                }
            }
            ; Uninstalled games with play time, named from Steam's app cache.
            ; Play opens Steam's install prompt through the same numeric link.
            wanted := Map()
            for appid, played in playtime
                if (played["minutes"] > 0 && !seen.Has(appid))
                    wanted[appid] := true
            if wanted.Count {
                appNames := CachedSteamAppNames(steam, wanted)
                for appid in wanted {
                    if !appNames.Has(appid) || IsSteamTool(appNames[appid])
                        continue
                    played := playtime[appid]
                    cover := ASCS_ShowCovers ? SteamCoverRef(steam, appid) : ""
                    add("st:" appid, appNames[appid], "steam", "PC", played["minutes"] * 60, LocalIsoFromUnix(played["last"]), 0,
                        Map("appid", appid, "installed", false), cover, Map("App ID", appid, "Status", "Not installed"), "")
                }
            }
        } catch as err {
            WriteLog("Games: Steam records unreadable: " err.Message)
        }
    }

    ASCS_GameIndex := index
    return "[" json "]"
}

SendGames() {
    global ASCS_GameLibraryJson, ASCS_GameLibraryStamp, ASCS_ShowCovers
    ; Rebuilt at most every 30 seconds; the binary game lists are cached
    ; separately until they change.
    stamp := A_TickCount // 30000
    if (ASCS_GameLibraryStamp != stamp) {
        ASCS_GameLibraryJson := BuildGameLibrary()
        ASCS_GameLibraryStamp := stamp
    }
    SendToFrontend('{"type":"games","covers":' (ASCS_ShowCovers ? "true" : "false") ',"items":' ASCS_GameLibraryJson '}')
}

LaunchGame(id) {
    global ASCS_GameIndex, ASCS_GamePaths

    try {
        id := ValidateGameId(id)
        if !ASCS_GameIndex.Has(id)
            throw Error("That game is no longer in the library.")
        game := ASCS_GameIndex[id]
        launch := game["launch"]
        if !IsObject(launch)
            throw Error("ASCS doesn't know where “" game["title"] "” is stored.")
        if (game["emulator"] = "steam") {
            if !RegExMatch(launch["appid"], "^\d{1,10}$")
                throw Error("Invalid Steam app id.")
            Run("steam://rungameid/" launch["appid"])
            RecordActivity("launch", "Playing " SubStr(game["title"], 1, 80))
            return
        }
        exe := ASCS_GamePaths[game["emulator"]]
        if (exe = "" || !FileExist(exe))
            throw Error("Set the " game["emulator"] " program in Preferences › Games & apps.")
        content := launch["content"]
        if (InStr(content, '"') || !FileExist(content))
            throw Error("The game file was not found: " content)
        SplitPath(exe, , &dir)
        switch game["emulator"] {
            case "retroarch":
                core := launch["core"]
                if (InStr(core, '"') || !FileExist(core))
                    throw Error("The RetroArch core was not found: " core)
                Run('"' exe '" -L "' core '" "' content '"', dir)
            case "pcsx2":
                Run('"' exe '" -- "' content '"', dir)
            case "dolphin":
                Run('"' exe '" -e "' content '"', dir)
        }
        RecordActivity("launch", "Playing " SubStr(game["title"], 1, 80))
    } catch as err {
        WriteLog("Game launch failed: " err.Message)
        RecordActivity("error", "Game: " err.Message)
        SendToFrontend('{"type":"notice","message":' JsonQuote(err.Message) '}')
    }
}

; ---- Steam helpers

SteamFolder() {
    try path := RegRead("HKCU\Software\Valve\Steam", "SteamPath")
    catch
        return ""
    path := StrReplace(path, "/", "\")
    return RegExMatch(path, "i)^[A-Z]:\\") && DirExist(path) ? path : ""
}

; The play-time file of the account that used Steam most recently, parsed
; once and kept until it changes.
CachedSteamPlaytime(steam) {
    global ASCS_GameListCache
    newest := "", newestTime := ""
    Loop Files steam "\userdata\*", "D" {
        if !RegExMatch(A_LoopFileName, "^\d{1,12}$")
            continue
        file := A_LoopFileFullPath "\config\localconfig.vdf"
        if FileExist(file) && StrCompare(FileGetTime(file, "M"), newestTime) > 0
            newest := file, newestTime := FileGetTime(file, "M")
    }
    if (newest = "")
        return Map()
    stamp := FileStamp(newest)
    if (ASCS_GameListCache.Has("steam") && ASCS_GameListCache["steam"]["stamp"] = stamp)
        return ASCS_GameListCache["steam"]["games"]
    games := Map()
    try games := ParseSteamPlaytime(FileRead(newest, "UTF-8"))
    catch as err
        WriteLog("Games: Steam play time unreadable: " err.Message)
    ASCS_GameListCache["steam"] := Map("stamp", stamp, "games", games)
    return games
}

; Steam's portrait library art (appcache\librarycache\<appid>\...\library_600x900.jpg),
; else its landscape header. Found once per game per session, since
; searching Steam's cache folders on every rebuild is slow.
; Steam covers are found lazily: the library build only notes that the
; game's cache folder exists ("steam:<folder>|<appid>"); the image itself is
; looked up when its cover is first sent. Searching hundreds of cache
; folders up front made the first build three times slower.
SteamCoverRef(steam, appid) {
    if DirExist(steam "\appcache\librarycache\" appid)
        return "steam:" steam "|" appid
    return FirstExisting(steam "\appcache\librarycache\" appid "_library_600x900.jpg")
}

CoverFile(cover) {
    if (SubStr(cover, 1, 6) != "steam:")
        return cover
    parts := StrSplit(SubStr(cover, 7), "|")
    return parts.Length = 2 ? SteamCover(parts[1], parts[2]) : ""
}

SteamCover(steam, appid) {
    static found := Map()
    if found.Has(appid)
        return found[appid]
    cover := ""
    folder := steam "\appcache\librarycache\" appid
    if DirExist(folder) {
        for name in ["library_600x900.jpg", "header.jpg", "library_header.jpg"] {
            Loop Files folder "\" name, "R" {
                cover := A_LoopFileFullPath
                break
            }
            if (cover != "")
                break
        }
    } else {
        cover := FirstExisting(steam "\appcache\librarycache\" appid "_library_600x900.jpg",
            steam "\appcache\librarycache\" appid "_header.jpg")
    }
    found[appid] := cover
    return cover
}

; Names from appinfo.vdf, read once per version of that file; app ids asked
; for later are looked up again only when the file changes.
CachedSteamAppNames(steam, wanted) {
    static stamp := "", names := Map(), tried := Map()
    path := steam "\appcache\appinfo.vdf"
    current := FileStamp(path)
    if (current != stamp)
        stamp := current, names := Map(), tried := Map()
    missing := Map()
    for appid in wanted
        if !tried.Has(appid)
            missing[appid] := true
    if (missing.Count && current != "missing") {
        try {
            buffer := FileRead(path, "RAW")
            for appid, name in ParseSteamAppNames(buffer, buffer.Size, missing)
                names[appid] := name
        } catch as err {
            WriteLog("Games: Steam app names unreadable: " err.Message)
        }
        for appid in missing
            tried[appid] := true
    }
    return names
}

SteamRunningAppId() {
    try id := RegRead("HKCU\Software\Valve\Steam", "RunningAppID")
    catch
        return ""
    return id > 0 ? String(id) : ""
}

GameFileName(path) {
    SplitPath(path, &name)
    return name
}

FormatBytes(bytes) {
    for unit in ["B", "KB", "MB", "GB", "TB"] {
        if (bytes < 1024 || unit = "TB")
            return (unit = "B" ? bytes : Round(bytes, bytes < 10 ? 1 : 0)) " " unit
        bytes /= 1024
    }
}

HasValue(list, value) {
    for item in list
        if (item = value)
            return true
    return false
}

; ---- game details (on request) and Show file

SendGameDetails(id) {
    global ASCS_GameIndex
    try {
        id := ValidateGameId(id)
        if !ASCS_GameIndex.Has(id)
            return
        game := ASCS_GameIndex[id]
        fields := ""
        for label, value in game["details"]
            fields .= (fields = "" ? "" : ",") "[" JsonQuote(label) "," JsonQuote(SubStr(value, 1, 200)) "]"
        show := game["show"]
        exists := show != "" && FileExist(show)
        if (exists && !InStr(FileExist(show), "D"))
            fields .= (fields = "" ? "" : ",") '["File size",' JsonQuote(FormatBytes(FileGetSize(show))) ']'
        SendToFrontend('{"type":"gameDetails","id":' JsonQuote(id) ',"fields":[' fields ']'
            . ',"canShow":' (exists ? "true" : "false")
            . ',"showLabel":' JsonQuote(game["emulator"] = "steam" ? "Open folder" : "Show file") '}')
    } catch as err {
        WriteLog("Game details failed: " err.Message)
    }
}

ShowGameFile(id) {
    global ASCS_GameIndex
    try {
        id := ValidateGameId(id)
        if !ASCS_GameIndex.Has(id)
            return
        show := ASCS_GameIndex[id]["show"]
        if (show = "" || InStr(show, '"') || !FileExist(show))
            throw Error("The game's file was not found.")
        if InStr(FileExist(show), "D")
            Run('explorer.exe "' show '"')
        else
            Run('explorer.exe /select,"' show '"')
    } catch as err {
        SendToFrontend('{"type":"notice","message":' JsonQuote(err.Message) '}')
    }
}

; ---- cover art

; Covers are queued and sent one per timer tick (each is a file read and an
; encode of up to 1.5 MB), so hotkeys stay responsive while a shelf loads.
SendCovers(content) {
    global ASCS_GameIndex, ASCS_ShowCovers, ASCS_CoverQueue
    if !ASCS_ShowCovers
        return
    for id in StrSplit(content, ",") {
        if (A_Index > 40)
            break
        try {
            id := ValidateGameId(id)
            if (ASCS_GameIndex.Has(id) && ASCS_GameIndex[id]["cover"] != "")
                ASCS_CoverQueue.Push(id)
        }
    }
    while (ASCS_CoverQueue.Length > 80)
        ASCS_CoverQueue.RemoveAt(1)
    if ASCS_CoverQueue.Length
        SetTimer(SendNextCover, 15)
}

SendNextCover() {
    global ASCS_GameIndex, ASCS_CoverQueue, ASCS_App
    if !ASCS_CoverQueue.Length {
        SetTimer(SendNextCover, 0)
        return
    }
    id := ASCS_CoverQueue.RemoveAt(1)
    try {
        if !ASCS_GameIndex.Has(id)
            return
        file := CoverFile(ASCS_GameIndex[id]["cover"])
        data := file != "" ? ReadImageAsDataUri(file) : ""
        if (data != "")
            ASCS_App.PostWebMessageAsString("COVER`n" id "`n" data)
    }
}

; A PNG or JPEG of at most 1.5 MB, as a data: URI; "" for anything else.
ReadImageAsDataUri(path) {
    if (FileGetSize(path) > 1572864)
        return ""
    bytes := FileRead(path, "RAW")
    if (bytes.Size < 8)
        return ""
    if (NumGet(bytes, 0, "UInt") = 0x474E5089)
        mime := "image/png"
    else if (NumGet(bytes, 0, "UChar") = 0xFF && NumGet(bytes, 1, "UChar") = 0xD8 && NumGet(bytes, 2, "UChar") = 0xFF)
        mime := "image/jpeg"
    else
        return ""
    ; CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF
    flags := 0x40000001
    DllCall("Crypt32\CryptBinaryToStringW", "Ptr", bytes, "UInt", bytes.Size, "UInt", flags, "Ptr", 0, "UInt*", &chars := 0)
    text := Buffer(chars * 2)
    if !DllCall("Crypt32\CryptBinaryToStringW", "Ptr", bytes, "UInt", bytes.Size, "UInt", flags, "Ptr", text, "UInt*", &chars)
        return ""
    return "data:" mime ";base64," StrGet(text, chars, "UTF-16")
}

; ---- live status: running apps, now playing, controllers

GameProcessName(name) {
    global ASCS_GamePaths
    if (ASCS_GamePaths[name] = "")
        return ""
    SplitPath(ASCS_GamePaths[name], &file)
    return file
}

RunningGameApps() {
    running := Map()
    for name in ["retroarch", "dolphin", "pcsx2"] {
        exe := GameProcessName(name)
        running[name] := exe != "" && ProcessExist(exe)
    }
    launcher := GameProcessName("pso")
    running["pso"] := ProcessExist("PsoBB.exe") || (launcher != "" && ProcessExist(launcher))
    return running
}

SendRunningApps() {
    running := RunningGameApps()
    json := ""
    for name, state in running
        json .= (json = "" ? "" : ",") JsonQuote(name) ":" (state ? "true" : "false")
    SendToFrontend('{"type":"running","apps":{' json '}}')
}

; The title naming the game an emulator is running. PCSX2 and Dolphin show the
; game in a window of its own beside their main window, so every visible
; window is read and the game's is preferred (see PickEmulatorWindow), whichever
; has focus.
EmulatorWindowTitle(name, exe) {
    windows := []
    for hwnd in WinGetList("ahk_exe " exe) {
        try {
            if !(WinGetStyle("ahk_id " hwnd) & 0x10000000)
                continue
            title := WinGetTitle("ahk_id " hwnd)
            if (title = "")
                continue
            WinGetPos(, , &width, &height, "ahk_id " hwnd)
            windows.Push(Map("title", SubStr(RegExReplace(title, "[\x00-\x1F]"), 1, 200), "area", width * height))
        }
    }
    return PickEmulatorWindow(name, windows)
}

; ---- controllers
; Two Windows interfaces are read: XInput (X-input pads: battery, rumble and,
; through XInputGetCapabilitiesEx, vendor and product IDs) and the Raw Input
; device list (D-input and Switch-mode pads, such as an 8BitDo over
; Bluetooth; never DirectInput, which crashed ASCS). X-input connections come
; from Windows' HID device records, checked for presence with CM_Locate_DevNode. Names: an ASCS name (also written to
; Windows' per-user game controller name), else Windows' name, else the maker.

XInputCapabilitiesEx(slot) {
    static proc := 0
    if !proc {
        module := DllCall("LoadLibrary", "Str", "xinput1_4", "Ptr")
        proc := module ? DllCall("GetProcAddress", "Ptr", module, "Ptr", 108, "Ptr") : -1
    }
    if (proc = -1)
        return 0
    caps := Buffer(32, 0)
    if (DllCall(proc, "UInt", 1, "UInt", slot, "UInt", 0, "Ptr", caps, "UInt") != 0)
        return 0
    return Map("vid", NumGet(caps, 20, "UShort"), "pid", NumGet(caps, 22, "UShort"),
        "wireless", (NumGet(caps, 2, "UShort") & 0x0002) != 0)
}

; Present HID and USB game devices: "VVVV:PPPP" -> "Bluetooth" or "USB".
ControllerConnections() {
    static cache := 0, cachedAt := 0
    if (cache && A_TickCount - cachedAt < 10000)
        return cache
    found := Map()
    for root in ["HKLM\SYSTEM\CurrentControlSet\Enum\HID", "HKLM\SYSTEM\CurrentControlSet\Enum\USB"] {
        Loop Reg root, "K" {
            device := A_LoopRegName
            ids := HidKeyIds(device)
            if !ids
                continue
            key := ControllerKey(ids["vid"], ids["pid"])
            Loop Reg root "\" device, "K" {
                instance := SubStr(root, InStr(root, "Enum\") + 5) "\" device "\" A_LoopRegName
                if (DllCall("cfgmgr32\CM_Locate_DevNodeW", "UInt*", &node := 0, "Str", instance, "UInt", 0, "UInt") = 0) {
                    connection := HidConnection(device)
                    if (!found.Has(key) || connection = "Bluetooth")
                        found[key] := connection
                }
            }
        }
    }
    cache := found, cachedAt := A_TickCount
    return found
}

ControllerDisplayName(key, vid) {
    global ASCS_SettingsFile
    name := IniRead(ASCS_SettingsFile, "Controllers", StrReplace(key, ":", "_"), "")
    return name != "" ? name : ControllerWindowsName(key, vid)
}

; The device's own name in Windows (the system-wide OEM name, ignoring the
; per-user name ASCS may have set), used to recognize receivers.
ControllerWindowsName(key, vid, includeUser := true) {
    oem := "System\CurrentControlSet\Control\MediaProperties\PrivateProperties\Joystick\OEM\VID_"
        . SubStr(key, 1, 4) "&PID_" SubStr(key, 6, 4)
    for hive in (includeUser ? ["HKCU\", "HKLM\"] : ["HKLM\"]) {
        try {
            name := RegRead(hive oem, "OEMName")
            if (name != "")
                return SubStr(RegExReplace(name, "[\x00-\x1F]"), 1, 60)
        }
    }
    return ControllerMaker(vid)
}

; Whether a controller model is a wireless receiver, judged from Windows' own
; name for it ("Controller (8BitDo Pro 3 Receiver)"). Windows keeps that name
; in the per-user key that Rename also writes, so the answer is remembered
; before any rename can replace the name.
IsReceiverKey(key, vid) {
    global ASCS_SettingsFile
    remembered := IniRead(ASCS_SettingsFile, "Controllers", StrReplace(key, ":", "_") "_receiver", "")
    if (remembered != "")
        return remembered = "1"
    renamed := IniRead(ASCS_SettingsFile, "Controllers", StrReplace(key, ":", "_"), "") != ""
    receiver := IsReceiverName(ControllerWindowsName(key, vid, !renamed))
    if !renamed
        try IniWrite(receiver ? "1" : "0", ASCS_SettingsFile, "Controllers", StrReplace(key, ":", "_") "_receiver")
    return receiver
}

; Every connected controller, as a list of Maps.
ListControllers() {
    static levels := ["empty", "low", "medium", "full"]
    controllers := []
    connections := ControllerConnections()
    state := Buffer(16)
    battery := Buffer(2)
    xinputCount := 0
    xinputKeys := Map()
    Loop 4 {
        slot := A_Index - 1
        try {
            if (DllCall("xinput1_4\XInputGetState", "UInt", slot, "Ptr", state, "UInt") != 0)
                continue
        } catch {
            break
        }
        xinputCount++
        caps := XInputCapabilitiesEx(slot)
        vid := caps ? caps["vid"] : 0x045E, pid := caps ? caps["pid"] : 0x028E
        key := ControllerKey(vid, pid)
        power := "unknown"
        try {
            if (DllCall("xinput1_4\XInputGetBatteryInformation", "UInt", slot, "UChar", 0, "Ptr", battery, "UInt") = 0) {
                type := NumGet(battery, 0, "UChar"), level := NumGet(battery, 1, "UChar")
                power := type = 1 ? "wired" : (type = 2 || type = 3) && level <= 3 ? levels[level + 1] : "unknown"
            }
        }
        connection := connections.Has(key) ? connections[key] : caps && caps["wireless"] ? "Wireless" : "USB"
        ; A 2.4 GHz receiver presents its controller as a wired X-input pad,
        ; so "wired" there means only that the battery isn't passed on.
        if IsReceiverKey(key, vid) {
            connection := "2.4 GHz receiver"
            if (power = "wired")
                power := "receiver"
        }
        xinputKeys[key] := true
        controllers.Push(Map("id", "x" slot, "key", key, "name", ControllerDisplayName(key, vid),
            "mode", "X-input", "connection", connection, "power", power, "slot", slot + 1, "rumble", true))
    }
    ; Other controllers (D-input, Switch, PlayStation modes) come from the Raw
    ; Input device list. 1.7.0 first used the classic joystick API (winmm) for
    ; these, but it runs on DirectInput, whose device re-enumeration corrupted
    ; the heap when a controller connected or slept mid-scan; that crashed ASCS
    ; (four crash dumps, all inside dinput.dll's enumeration or after it).
    for pad in RawInputGamepads() {
        key := ControllerKey(pad["vid"], pad["pid"])
        if xinputKeys.Has(key) || (pad["vid"] = 0x045E && xinputCount)
            continue                    ; the same pad, already listed through XInput
        controllers.Push(Map("id", "h" pad["handle"], "key", key, "name", ControllerDisplayName(key, pad["vid"]),
            "mode", ControllerMode(pad["vid"], pad["pid"]), "connection", pad["connection"],
            "power", "unreported", "slot", 0, "rumble", false))
    }
    return controllers
}

; HID game pads and joysticks (usage page 1, usage 4 or 5) from the Raw Input
; device list: plain user32 calls, no DirectInput. Interfaces whose device
; path contains "IG_" belong to XInput devices, which are listed through
; XInput instead. Every buffer is sized from the size the call reports.
RawInputGamepads() {
    pads := []
    entrySize := 8 + A_PtrSize                  ; RAWINPUTDEVICELIST
    if (DllCall("GetRawInputDeviceList", "Ptr", 0, "UInt*", &count := 0, "UInt", entrySize, "Int") != 0
        || count = 0 || count > 512)
        return pads
    list := Buffer(count * entrySize, 0)
    got := DllCall("GetRawInputDeviceList", "Ptr", list, "UInt*", &count, "UInt", entrySize, "Int")
    if (got <= 0)
        return pads                             ; the list changed mid-call; next poll
    info := Buffer(32, 0)                       ; RID_DEVICE_INFO
    Loop Min(got, list.Size // entrySize) {
        entry := (A_Index - 1) * entrySize
        handle := NumGet(list, entry, "Ptr")
        if (NumGet(list, entry + A_PtrSize, "UInt") != 2)      ; RIM_TYPEHID
            continue
        NumPut("UInt", 32, info, 0)
        size := 32
        if (DllCall("GetRawInputDeviceInfoW", "Ptr", handle, "UInt", 0x2000000B, "Ptr", info, "UInt*", &size, "Int") <= 0)
            continue
        page := NumGet(info, 20, "UShort"), usage := NumGet(info, 22, "UShort")
        if !(page = 1 && (usage = 4 || usage = 5))
            continue
        chars := 0
        DllCall("GetRawInputDeviceInfoW", "Ptr", handle, "UInt", 0x20000007, "Ptr", 0, "UInt*", &chars, "Int")
        if (chars = 0 || chars > 1024)
            continue
        capacity := chars + 1
        name := Buffer(capacity * 2, 0)
        if (DllCall("GetRawInputDeviceInfoW", "Ptr", handle, "UInt", 0x20000007, "Ptr", name, "UInt*", &capacity, "Int") <= 0)
            continue
        path := StrGet(name, "UTF-16")
        if InStr(path, "IG_")
            continue
        pads.Push(Map("handle", handle, "vid", NumGet(info, 8, "UInt") & 0xFFFF, "pid", NumGet(info, 12, "UInt") & 0xFFFF,
            "connection", RegExMatch(path, "i)\{00001124-|\{00001812-") ? "Bluetooth" : "USB"))
        if (pads.Length >= 8)
            break
    }
    return pads
}

ControllerJson() {
    json := ""
    for pad in ListControllers() {
        json .= (json = "" ? "" : ",") '{"id":' JsonQuote(pad["id"]) ',"key":' JsonQuote(pad["key"])
            . ',"name":' JsonQuote(pad["name"]) ',"mode":' JsonQuote(pad["mode"])
            . ',"connection":' JsonQuote(pad["connection"]) ',"power":' JsonQuote(pad["power"])
            . ',"slot":' pad["slot"] ',"rumble":' (pad["rumble"] ? "true" : "false") ',"testable":true}'
        if (A_Index >= 8)
            break
    }
    return "[" json "]"
}

; ---- D-input and Switch-mode tester (Raw Input HID reports)
; While the tester is open on such a pad, ASCS registers for game pad and
; joystick input (RIDEV_INPUTSINK, so it arrives while ASCS's page has
; focus) and decodes each report with Windows' HID parser (hid.dll). No
; DirectInput. Every buffer is sized from the size Windows reports, and
; the registration is removed when the tester closes.

StartHidTester(id) {
    global ASCS_HidTester
    StopHidTester()
    if !RegExMatch(id, "^h(\d{1,20})$", &m)
        return
    handle := 0
    for pad in RawInputGamepads()
        if (String(pad["handle"]) = m[1])
            handle := pad["handle"]
    if !handle {
        SendToFrontend('{"type":"controllerInput","id":' JsonQuote(id) ',"connected":false}')
        return
    }
    try {
        size := 0
        DllCall("GetRawInputDeviceInfoW", "Ptr", handle, "UInt", 0x20000005, "Ptr", 0, "UInt*", &size, "Int")
        if (size = 0 || size > 1048576)
            throw Error("no report description")
        preparsed := Buffer(size, 0)
        if (DllCall("GetRawInputDeviceInfoW", "Ptr", handle, "UInt", 0x20000005, "Ptr", preparsed, "UInt*", &size, "Int") <= 0)
            throw Error("report description unreadable")
        caps := Buffer(64, 0)                                   ; HIDP_CAPS
        if (DllCall("hid\HidP_GetCaps", "Ptr", preparsed, "Ptr", caps, "UInt") != 0x110000)
            throw Error("report description invalid")
        axes := Map()
        valueCount := NumGet(caps, 48, "UShort")
        if (valueCount > 0 && valueCount <= 256) {
            values := Buffer(valueCount * 72, 0)                ; HIDP_VALUE_CAPS
            length := valueCount
            if (DllCall("hid\HidP_GetValueCaps", "Int", 0, "Ptr", values, "UShort*", &length, "Ptr", preparsed, "UInt") = 0x110000) {
                Loop Min(length, valueCount) {
                    v := (A_Index - 1) * 72
                    if (NumGet(values, v, "UShort") != 1)        ; generic desktop page only
                        continue
                    first := NumGet(values, v + 56, "UShort")
                    last := NumGet(values, v + 12, "UChar") ? NumGet(values, v + 58, "UShort") : first
                    low := NumGet(values, v + 40, "Int"), high := NumGet(values, v + 44, "Int")
                    bits := NumGet(values, v + 18, "UShort")
                    if (high <= low && bits >= 1 && bits <= 31)
                        low := 0, high := (1 << bits) - 1      ; unsigned fields report max as -1
                    usage := first
                    while (usage <= last && usage <= 0x39) {
                        if (usage >= 0x30 && usage <= 0x39 && !axes.Has(usage))
                            axes[usage] := Map("min", low, "max", high)
                        usage++
                    }
                }
            }
        }
        if !RegisterGamepadInput(true)
            throw Error("input registration refused")
        ASCS_HidTester := Map("id", id, "handle", handle, "preparsed", preparsed, "axes", axes, "sent", 0)
        OnMessage(0x00FF, HandleRawInput)
    } catch as err {
        WriteLog("Controller tester: " err.Message)
        SendToFrontend('{"type":"controllerInput","id":' JsonQuote(id) ',"connected":false}')
    }
}

StopHidTester() {
    global ASCS_HidTester
    if !IsObject(ASCS_HidTester)
        return
    OnMessage(0x00FF, HandleRawInput, 0)
    RegisterGamepadInput(false)
    ASCS_HidTester := 0
}

; RAWINPUTDEVICE x2 (game pads and joysticks): add with INPUTSINK, or remove.
RegisterGamepadInput(enable) {
    entry := 8 + A_PtrSize
    devices := Buffer(2 * entry, 0)
    for i, usage in [4, 5] {
        base := (i - 1) * entry
        NumPut("UShort", 1, devices, base), NumPut("UShort", usage, devices, base + 2)
        NumPut("UInt", enable ? 0x100 : 0x1, devices, base + 4)
        NumPut("Ptr", enable ? A_ScriptHwnd : 0, devices, base + 8)
    }
    return DllCall("RegisterRawInputDevices", "Ptr", devices, "UInt", 2, "UInt", entry, "Int")
}

HandleRawInput(wParam, lParam, msg, hwnd) {
    global ASCS_HidTester
    tester := ASCS_HidTester
    if !IsObject(tester)
        return
    headerSize := 8 + 2 * A_PtrSize                             ; RAWINPUTHEADER
    size := 0
    DllCall("GetRawInputData", "Ptr", lParam, "UInt", 0x10000003, "Ptr", 0, "UInt*", &size, "UInt", headerSize)
    if (size < headerSize + 8 || size > 65536)
        return
    data := Buffer(size, 0)
    if (DllCall("GetRawInputData", "Ptr", lParam, "UInt", 0x10000003, "Ptr", data, "UInt*", &size, "UInt", headerSize, "UInt") != size)
        return
    if (NumGet(data, 0, "UInt") != 2 || NumGet(data, 8, "Ptr") != tester["handle"])
        return
    if (A_TickCount - tester["sent"] < 50)
        return                                                  ; at most 20 updates a second
    reportSize := NumGet(data, headerSize, "UInt"), reports := NumGet(data, headerSize + 4, "UInt")
    if (reportSize = 0 || reports = 0 || headerSize + 8 + reportSize * reports > size)
        return
    report := data.Ptr + headerSize + 8 + reportSize * (reports - 1)
    preparsed := tester["preparsed"]
    ; Buttons (usage page 9): a list of the pressed button numbers.
    usages := Buffer(128 * 2, 0), count := 128, buttons := 0
    if (DllCall("hid\HidP_GetUsages", "Int", 0, "UShort", 9, "UShort", 0, "Ptr", usages, "UInt*", &count,
        "Ptr", preparsed, "Ptr", report, "UInt", reportSize, "UInt") = 0x110000) {
        Loop Min(count, 128) {
            number := NumGet(usages, (A_Index - 1) * 2, "UShort")
            if (number >= 1 && number <= 32)
                buttons |= 1 << (number - 1)
        }
    }
    axesJson := "", hat := -1
    for usage, range in tester["axes"] {
        value := 0
        if (DllCall("hid\HidP_GetUsageValue", "Int", 0, "UShort", 1, "UShort", 0, "UShort", usage, "UInt*", &value,
            "Ptr", preparsed, "Ptr", report, "UInt", reportSize, "UInt") != 0x110000)
            continue
        if (usage = 0x39) {                                     ; hat switch: 8 directions, else centered
            hat := value >= range["min"] && value <= range["max"] && range["max"] - range["min"] >= 7 ? value - range["min"] : -1
            continue
        }
        span := range["max"] - range["min"]
        normal := span > 0 ? Round(((value - range["min"]) / span) * 2 - 1, 3) : 0
        axesJson .= (axesJson = "" ? "" : ",") '"' Format("{:x}", usage) '":' normal
    }
    tester["sent"] := A_TickCount
    SendToFrontend('{"type":"controllerInput","id":' JsonQuote(tester["id"]) ',"connected":true,"kind":"hid"'
        . ',"buttons":' buttons ',"hat":' hat ',"axes":{' axesJson '}}')
}

; Live input for the tester ("x0".."x3"). X-input controllers only: the
; joystick API that read other modes ran on DirectInput and crashed ASCS.
SendControllerInput(id) {
    if RegExMatch(id, "^x([0-3])$", &m) {
        state := Buffer(16, 0)
        if (DllCall("xinput1_4\XInputGetState", "UInt", Integer(m[1]), "Ptr", state, "UInt") != 0)
            return SendToFrontend('{"type":"controllerInput","id":' JsonQuote(id) ',"connected":false}')
        SendToFrontend('{"type":"controllerInput","id":' JsonQuote(id) ',"connected":true,"kind":"xinput"'
            . ',"buttons":' NumGet(state, 4, "UShort") ',"lt":' NumGet(state, 6, "UChar") ',"rt":' NumGet(state, 7, "UChar")
            . ',"lx":' NumGet(state, 8, "Short") ',"ly":' NumGet(state, 10, "Short")
            . ',"rx":' NumGet(state, 12, "Short") ',"ry":' NumGet(state, 14, "Short") '}')
    }
}

; A half-second rumble on an X-input controller.
RumbleController(id) {
    if !RegExMatch(id, "^x([0-3])$", &m)
        return
    slot := Integer(m[1])
    vibration := Buffer(4, 0)
    NumPut("UShort", 40000, vibration, 0), NumPut("UShort", 40000, vibration, 2)
    try {
        DllCall("xinput1_4\XInputSetState", "UInt", slot, "Ptr", vibration, "UInt")
        SetTimer(() => DllCall("xinput1_4\XInputSetState", "UInt", slot, "Ptr", Buffer(4, 0), "UInt"), -500)
    }
}

; Rename: the ASCS name, and Windows' per-user game controller name (shown
; by the Game Controllers panel and DirectInput games). No admin rights are
; needed; an empty name restores the defaults. Payload: "VVVV:PPPP|name".
RenameController(content) {
    global ASCS_SettingsFile
    try {
        parts := StrSplit(content, "|", , 2)
        if (parts.Length != 2)
            throw Error("Invalid rename request.")
        key := ValidateControllerKey(parts[1])
        name := ValidateControllerName(parts[2])
        oem := "HKCU\System\CurrentControlSet\Control\MediaProperties\PrivateProperties\Joystick\OEM\VID_"
            . SubStr(key, 1, 4) "&PID_" SubStr(key, 6, 4)
        if (name = "") {
            try IniDelete(ASCS_SettingsFile, "Controllers", StrReplace(key, ":", "_"))
            try RegDelete(oem, "OEMName")
        } else {
            IsReceiverKey(key, Integer("0x" SubStr(key, 1, 4)))   ; remember before the name changes
            IniWrite(name, ASCS_SettingsFile, "Controllers", StrReplace(key, ":", "_"))
            RegWrite(name, "REG_SZ", oem, "OEMName")
        }
        RecordActivity("system", name = "" ? "Controller name reset" : "Controller renamed “" name "”")
        SendToFrontend('{"type":"notice","message":' JsonQuote(name = "" ? "Controller name reset." : "Renamed in ASCS and in Windows' game controller list.") '}')
        SendGamesLive()
    } catch as err {
        SendToFrontend('{"type":"notice","message":' JsonQuote(err.Message) '}')
    }
}

; The Bluetooth name needs administrator rights, so ASCS opens Windows'
; Devices and Printers, where the controller's Properties > Bluetooth tab
; renames it.
OpenBluetoothRename() {
    Run("explorer.exe shell:::{A8A91A66-3A7D-4424-8D24-04E180695C7A}")
}

; What is being played right now, as a list of Maps (emulator, title, id for
; Steam, since). Also keeps ASCS_PlaySessions current, so Now playing can
; show how long the session has run. Called by the Games tab's live poll and
; every 10 s by TrackPlaySessions (a few process checks and window titles).
CurrentlyPlaying(running := 0) {
    global ASCS_GameIndex, ASCS_PlaySessions
    if !IsObject(running)
        running := RunningGameApps()
    now := DateDiff(A_NowUTC, "19700101000000", "Seconds")
    playing := []
    seen := Map()
    Observe(source, owner, title, startedFn) {
        global ASCS_PlaySessions
        previous := ASCS_PlaySessions.Has(source) ? ASCS_PlaySessions[source] : 0
        started := (IsObject(previous) && previous["owner"] = owner) ? 0 : startedFn()
        since := PlaySessionSince(previous, owner, title, now, started)
        ASCS_PlaySessions[source] := Map("owner", owner, "title", title, "since", since)
        seen[source] := true
        return since
    }
    for name in ["retroarch", "dolphin", "pcsx2"] {
        if !running[name]
            continue
        exe := GameProcessName(name)
        pid := ProcessExist(exe)
        title := EmulatorWindowTitle(name, exe)
        ; Timed by the game's name, not the raw title, so a changing FPS
        ; counter or window title doesn't restart the session.
        since := Observe(name, pid, EmulatorGameName(name, title), () => ProcessStartUnix(pid))
        playing.Push(Map("emulator", name, "title", title, "id", "", "since", since))
    }
    if (pid := ProcessExist("PsoBB.exe")) {
        title := "Phantasy Star Online: Blue Burst"
        since := Observe("pso", pid, title, () => ProcessStartUnix(pid))
        playing.Push(Map("emulator", "pso", "title", title, "id", "", "since", since))
    }
    ; Steam reports the running game's app id; the name comes from the library.
    if (appid := SteamRunningAppId()) {
        title := ASCS_GameIndex.Has("st:" appid) ? ASCS_GameIndex["st:" appid]["title"] : "App " appid
        since := Observe("steam", appid, title, () => 0)
        playing.Push(Map("emulator", "steam", "title", title, "id", "st:" appid, "since", since))
    }
    for source in [ASCS_PlaySessions*]          ; copy of the keys: forget what stopped
        if !seen.Has(source)
            ASCS_PlaySessions.Delete(source)
    return playing
}

TrackPlaySessions() {
    try CurrentlyPlaying()
}

; A process's start time in Unix seconds; 0 if it can't be read.
ProcessStartUnix(pid) {
    if !pid
        return 0
    handle := DllCall("OpenProcess", "UInt", 0x1000, "Int", false, "UInt", pid, "Ptr")   ; PROCESS_QUERY_LIMITED_INFORMATION
    if !handle
        return 0
    created := Buffer(8, 0), exited := Buffer(8, 0), kernel := Buffer(8, 0), user := Buffer(8, 0)
    ok := DllCall("GetProcessTimes", "Ptr", handle, "Ptr", created, "Ptr", exited, "Ptr", kernel, "Ptr", user, "Int")
    DllCall("CloseHandle", "Ptr", handle)
    if !ok
        return 0
    ; FILETIME: 100 ns intervals since 1601-01-01 UTC.
    return (NumGet(created, 0, "Int64") - 116444736000000000) // 10000000
}

SendGamesLive() {
    running := RunningGameApps()
    playing := ""
    for item in CurrentlyPlaying(running)
        playing .= (playing = "" ? "" : ",") '{"emulator":' JsonQuote(item["emulator"]) ',"title":' JsonQuote(item["title"])
            . (item["id"] != "" ? ',"id":' JsonQuote(item["id"]) : "") ',"since":' item["since"] '}'
    apps := ""
    for name, state in running
        apps .= (apps = "" ? "" : ",") JsonQuote(name) ":" (state ? "true" : "false")
    SendToFrontend('{"type":"gamesLive","playing":[' playing '],"apps":{' apps '},"controllers":' ControllerJson() '}')
}

; ---- RetroAchievements (opt-in through a local secrets file)
; data\secrets.ini holds the user name and Web API key. data\ is excluded
; from git. The key is read only when a request is made, is never sent to
; the page or written to the log, and only two fixed retroachievements.org
; addresses are requested, at most every ten minutes.

RetroAchievementsCredentials() {
    global ASCS_SecretsFile
    if !FileExist(ASCS_SecretsFile)
        return 0
    user := Trim(IniRead(ASCS_SecretsFile, "RetroAchievements", "User", ""))
    key := Trim(IniRead(ASCS_SecretsFile, "RetroAchievements", "Key", ""))
    if (user = "" || key = "")
        return 0
    return Map("user", ValidateRetroAchievementsUser(user), "key", ValidateRetroAchievementsKey(key))
}

RetroAchievementsState() {
    try return RetroAchievementsCredentials() ? "ready" : "off"
    catch as err
        return "invalid"
}

SetupRetroAchievements() {
    global ASCS_SecretsFile
    if !FileExist(ASCS_SecretsFile) {
        FileAppend("; ASCS secrets. This file stays on this PC: the data folder is not committed to git.`r`n"
            . "; RetroAchievements: your user name, and the Web API key from`r`n"
            . "; https://retroachievements.org/settings (Authentication, Web API Key).`r`n"
            . "[RetroAchievements]`r`nUser=`r`nKey=`r`n", ASCS_SecretsFile, "UTF-8")
    }
    Run('notepad.exe "' ASCS_SecretsFile '"')
}

; Opens the user's public profile; the address is built here from the
; validated user name in secrets.ini (never from the page).
OpenRetroAchievementsProfile() {
    try {
        credentials := RetroAchievementsCredentials()
        if credentials
            Run("https://retroachievements.org/user/" UriEncode(credentials["user"]))
    } catch as err {
        WriteLog("RetroAchievements profile: " err.Message)
    }
}

FetchRetroAchievements(force := false) {
    global ASCS_RetroAchievementsAt, ASCS_RetroAchievementsCache

    try credentials := RetroAchievementsCredentials()
    catch as err {
        SendToFrontend('{"type":"retroAchievements","state":"invalid","message":' JsonQuote(err.Message) '}')
        return
    }
    if !credentials {
        SendToFrontend('{"type":"retroAchievements","state":"off"}')
        return
    }
    age := A_TickCount - ASCS_RetroAchievementsAt
    if (ASCS_RetroAchievementsCache.Count && (age < 600000 || (force && age < 60000))) {
        for kind, text in ASCS_RetroAchievementsCache
            SendRetroAchievementsText(kind, text)
        return
    }
    ASCS_RetroAchievementsAt := A_TickCount
    SendToFrontend('{"type":"retroAchievements","state":"loading"}')
    query := "z=" UriEncode(credentials["user"]) "&y=" UriEncode(credentials["key"]) "&u=" UriEncode(credentials["user"])
    HttpGetAsync("ra-summary", "https://retroachievements.org/API/API_GetUserSummary.php?" query "&g=5&a=8",
        RetroAchievementsDone.Bind("summary"))
    HttpGetAsync("ra-recent", "https://retroachievements.org/API/API_GetUserRecentlyPlayedGames.php?" query "&c=8",
        RetroAchievementsDone.Bind("recent"))
}

RetroAchievementsDone(kind, ok, result) {
    global ASCS_RetroAchievementsCache
    if !ok {
        WriteLog("RetroAchievements " kind " unavailable: " result)
        message := InStr(result, "HTTP 401") || InStr(result, "HTTP 403")
            ? "RetroAchievements rejected the user name or key in data\secrets.ini."
            : "RetroAchievements is unavailable right now (" result ")."
        SendToFrontend('{"type":"retroAchievements","state":"error","message":' JsonQuote(message) '}')
        return
    }
    ASCS_RetroAchievementsCache[kind] := result
    SendRetroAchievementsText(kind, result)
}

SendRetroAchievementsText(kind, text) {
    global ASCS_App
    try ASCS_App.PostWebMessageAsString("RA`n" kind "`n" text)
}

; ---- a small asynchronous HTTPS GET for fixed addresses
; Redirects off, certificate checks on, timeouts, and a byte cap. The URL
; is never logged (it may carry a key). onDone(ok, textOrMessage).

HttpGetAsync(name, url, onDone, maxBytes := 2000000, binary := false) {
    global ASCS_HttpRequests, ASCS_Version
    if ASCS_HttpRequests.Has(name)
        return
    try {
        request := ComObject("WinHttp.WinHttpRequest.5.1")
        request.Option[6] := false
        request.SetTimeouts(5000, 5000, 10000, 15000)
        request.Open("GET", url, true)
        ; A generic client name: the owner's contact address is shared with
        ; Wikimedia only (the almanac), at the owner's request.
        request.SetRequestHeader("User-Agent", "ASCS/" ASCS_Version " (Aeolionware Super Command System)")
        request.SetRequestHeader("Accept", binary ? "image/png" : "application/json")
        request.Send()
        ASCS_HttpRequests[name] := Map("request", request, "started", A_TickCount, "done", onDone, "max", maxBytes, "binary", binary)
        SetTimer(PollHttpRequests, 250)
    } catch as err {
        onDone(false, "request failed")
    }
}

PollHttpRequests() {
    global ASCS_HttpRequests
    names := []
    for name in ASCS_HttpRequests
        names.Push(name)
    for name in names {
        entry := ASCS_HttpRequests[name]
        try {
            if !entry["request"].WaitForResponse(0) {
                if (A_TickCount - entry["started"] < 30000)
                    continue
                try entry["request"].Abort()
                throw Error("timed out")
            }
            ASCS_HttpRequests.Delete(name)
            request := entry["request"]
            if (request.Status != 200)
                throw Error("HTTP " request.Status)
            if entry["binary"] {
                entry["done"](true, HttpResponseBytes(request, entry["max"]))
                continue
            }
            text := HttpResponseText(request, entry["max"])
            if !RegExMatch(text, "^\s*[\{\[][\s\S]*[\}\]]\s*$")
                throw Error("unexpected response")
            entry["done"](true, text)
        } catch as err {
            if ASCS_HttpRequests.Has(name)
                ASCS_HttpRequests.Delete(name)
            entry["done"](false, err.Message)
        }
    }
    if !ASCS_HttpRequests.Count
        SetTimer(PollHttpRequests, 0)
}

; Decodes a response body as UTF-8 from its raw bytes, after a size check.
HttpResponseText(request, maxBytes) {
    body := request.ResponseBody
    size := body.MaxIndex() + 1
    if (size > maxBytes)
        throw Error("response too large")
    ; SAFEARRAY.pvData sits after cDims, fFeatures, cbElements and cLocks.
    return StrGet(NumGet(ComObjValue(body), 8 + A_PtrSize, "Ptr"), size, "UTF-8")
}

; The response body as a Buffer of bytes, after a size check.
HttpResponseBytes(request, maxBytes) {
    body := request.ResponseBody
    size := body.MaxIndex() + 1
    if (size <= 0 || size > maxBytes)
        throw Error("response too large or empty")
    bytes := Buffer(size)
    DllCall("RtlMoveMemory", "Ptr", bytes, "Ptr", NumGet(ComObjValue(body), 8 + A_PtrSize, "Ptr"), "UPtr", size)
    return bytes
}

; ---- RetroAchievements images (badges and game icons)
; The page asks by token ("b:250336", "i:066043"); ASCS validates it, builds
; the media.retroachievements.org address itself, and keeps each image in
; data\ra-images, so it is downloaded once. Only PNGs under 256 KB are kept.
; At most four downloads run at once; cached images are sent one per tick.

SendRaImages(content) {
    global ASCS_RaImageQueue
    for token in StrSplit(content, ",") {
        if (A_Index > 30)
            break
        try {
            RetroAchievementsImage(token)       ; validates
            ASCS_RaImageQueue.Push(token)
        }
    }
    if ASCS_RaImageQueue.Length
        SetTimer(PumpRaImages, 20)
}

PumpRaImages() {
    global ASCS_RaImageQueue, ASCS_RaImageFolder, ASCS_HttpRequests
    if !ASCS_RaImageQueue.Length {
        SetTimer(PumpRaImages, 0)
        return
    }
    token := ASCS_RaImageQueue[1]
    image := RetroAchievementsImage(token)
    path := ASCS_RaImageFolder "\" image["file"]
    if FileExist(path) {
        ASCS_RaImageQueue.RemoveAt(1)
        ; Mark it as recently used (at most once a day), for the cache cap.
        try {
            if (SubStr(FileGetTime(path, "M"), 1, 8) != SubStr(A_Now, 1, 8))
                FileSetTime(A_Now, path, "M")
        }
        SendRaImage(token, path)
        return
    }
    downloads := 0
    for name in ASCS_HttpRequests
        if (SubStr(name, 1, 7) = "raimage")
            downloads++
    if (downloads >= 4)
        return                                  ; wait for a free slot
    ASCS_RaImageQueue.RemoveAt(1)
    if ASCS_HttpRequests.Has("raimage " token)
        return
    HttpGetAsync("raimage " token, image["url"], RaImageDownloaded.Bind(token, path), 262144, true)
}

RaImageDownloaded(token, path, ok, result) {
    if !ok {
        WriteLog("RetroAchievements image " token " unavailable: " result)
        return
    }
    ; Keep it only if it really is a PNG (its 8-byte signature).
    if (result.Size < 8 || NumGet(result, 0, "UInt") != 0x474E5089 || NumGet(result, 4, "UInt") != 0x0A1A0A0D) {
        WriteLog("RetroAchievements image " token " was not a PNG; discarded.")
        return
    }
    try {
        DirCreate(ASCS_RaImageFolderPath())
        file := FileOpen(path ".tmp", "w")
        file.RawWrite(result, result.Size)
        file.Close()
        FileMove(path ".tmp", path, 1)
        SendRaImage(token, path)
        SetTimer(PruneRaImageCache, -5000)      ; once the batch settles
    } catch as err {
        WriteLog("RetroAchievements image " token " not cached: " err.Message)
    }
}

; Keeps data\ra-images under its cap. Runs shortly after downloads and once
; after start-up; deletes only files named like ASCS's own images.
PruneRaImageCache() {
    global ASCS_RaImageFolder, ASCS_RaImageCacheLimit, ASCS_RaImageCacheTarget
    if !DirExist(ASCS_RaImageFolder)
        return
    files := []
    try {
        Loop Files ASCS_RaImageFolder "\*.*", "F"
            files.Push(Map("name", A_LoopFileName, "size", A_LoopFileSize, "time", A_LoopFileTimeModified))
    } catch as err {
        WriteLog("RetroAchievements image cache not read: " err.Message)
        return
    }
    removed := 0, failed := 0
    for name in RaImagesToPrune(files, ASCS_RaImageCacheLimit, ASCS_RaImageCacheTarget) {
        try {
            FileDelete(ASCS_RaImageFolder "\" name)
            removed++
        } catch
            failed++
    }
    if (removed || failed)
        WriteLog("RetroAchievements image cache trimmed: " removed " file(s) removed" (failed ? ", " failed " could not be" : "") ".")
}

ASCS_RaImageFolderPath() {
    global ASCS_RaImageFolder
    return ASCS_RaImageFolder
}

SendRaImage(token, path) {
    global ASCS_App
    data := ReadImageAsDataUri(path)
    if (data != "")
        try ASCS_App.PostWebMessageAsString("RAIMG`n" token "`n" data)
}

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
    for kind in ["show", "hide", "reminder"] {
        path := IniRead(ASCS_SettingsFile, "Sounds", AscsSoundKey(kind), "")
        if (path != "" && FileExist(path) && RegExMatch(path, "i)\.wav$"))
            ASCS_AscsSoundFiles[kind] := path
    }
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
    for id, sound in index {
        eras[sound["era"]] := true
        sounds .= (sounds = "" ? "" : ",") '{"id":' JsonQuote(id) ',"name":' JsonQuote(sound["name"])
            . ',"era":' JsonQuote(sound["era"]) ',"group":' JsonQuote(sound["group"])
            . ',"kind":' JsonQuote(sound["kind"]) ',"ext":' JsonQuote(sound["ext"])
            . ',"size":' sound["size"] ',"seconds":' sound["seconds"] '}'
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
    path := parsed[1] = "windows"
        ? ResolveSoundPath(ExpandEnvironment(ReadWindowsSound(WindowsSoundEvent(parsed[2]))["value"]), A_WinDir)
        : ASCS_AscsSoundFiles[parsed[2]]
    if (path = "" || !RegExMatch(path, "i)\.wav$") || !FileExist(path))
        throw Error("It has no WAV file to measure.")
    return path
}

; Sends a sound in use to the page to measure (reply id "use:<key>").
SendInUseSound(key) {
    global ASCS_App
    try {
        data := FileToBase64(InUseSoundPath(key), 16 * 1024 * 1024)
        ASCS_App.PostWebMessageAsString("SOUND`nuse:" key "`n" data)
    } catch as err {
        try ASCS_App.PostWebMessageAsString("SOUND`nuse:" key "`n")
        WriteLog("Sounds: in-use sound not sent: " err.Message)
    }
}

; Payload: target|source|gain dB|base64 WAV. Saves the page's leveled copy
; and makes the target (a Windows event or ASCS sound) play it. The source
; names the copy: "current" (what the target plays now) or "lib:<id>".
; Restore brings back what played before ASCS first changed the target.
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
        if (parts[2] = "current") {
            SplitPath(InUseSoundPath(target), , , , &stem)
        } else if (SubStr(parts[2], 1, 4) = "lib:") {
            stem := IndexedSound(SubStr(parts[2], 5))["name"]
        } else {
            throw Error("The leveled copy was malformed.")
        }
        path := WriteLeveledCopy(stem, gain, parts[4])
        SplitPath(path, &file)
        if (parsed[1] = "windows")
            ApplyWindowsSound(WindowsSoundEvent(parsed[2]), path, file)
        else
            ApplyAscsSound(parsed[2], path)
        SendToFrontend('{"type":"soundMatched","target":' JsonQuote(target) ',"ok":true,"file":' JsonQuote(file) '}')
    } catch as err {
        WriteLog("Sounds: leveled copy not used: " err.Message)
        SendToFrontend('{"type":"soundMatched","target":' JsonQuote(target) ',"ok":false,"message":' JsonQuote(err.Message) '}')
    }
    SendWindowsSounds()
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
    RegWrite(path, "REG_SZ", WindowsSoundKey(event), "")
    WriteLog("Sounds: Windows sound " key " set to " path ".")
    RecordActivity("system", event[3] " sound: " name)
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
    if (parts[1] = "none") {
        try RegDelete(WindowsSoundKey(event), "")
    } else {
        RegWrite(parts.Length > 1 ? parts[2] : "", parts[1] = "expand" ? "REG_EXPAND_SZ" : "REG_SZ", WindowsSoundKey(event), "")
    }
    IniDelete(ASCS_SettingsFile, "WindowsSoundBackup", key)
    WriteLog("Sounds: Windows sound " key " restored.")
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
    for kind in ["show", "hide", "reminder"] {
        try restored += RestoreAscsSoundValue(kind)
        catch as err {
            failed++
            WriteLog("Sounds: couldn't restore the ASCS " kind " sound: " err.Message)
        }
    }
    if restored
        RecordActivity("system", "Sounds restored: " restored)
    message := !restored && !failed ? "Nothing to restore: ASCS hasn't changed any sounds."
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
    global ASCS_AscsSoundFiles
    if !IsLeveledCopyId(id)
        throw Error("Only leveled copies in ASCS Leveled can be deleted here.")
    path := IndexedSound(id)["path"]
    if !FileExist(path)
        throw Error("It's already gone.")
    for event in WindowsSoundEvents()
        if (ResolveSoundPath(ExpandEnvironment(ReadWindowsSound(event)["value"]), A_WinDir) = path)
            throw Error(event[3] " plays it now. Restore or change that first.")
    for kind, label in Map("show", "ASCS show", "hide", "ASCS hide", "reminder", "Calendar reminder")
        if (ASCS_AscsSoundFiles[kind] = path)
            throw Error(label " plays it now. Restore or change that first.")
    FileRecycle(path)
    SplitPath(path, &file)
    WriteLog("Sounds: leveled copy moved to the Recycle Bin, " path ".")
    return file
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

AscsSoundKey(kind) => Map("show", "ShowFile", "hide", "HideFile", "reminder", "ReminderFile")[kind]

AscsSoundsJson() {
    global ASCS_AscsSoundFiles, ASCS_SoundLibrary, ASCS_SettingsFile
    json := ""
    for kind in ["show", "hide", "reminder"] {
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
    ASCS_AscsSoundFiles[kind] := path
    IniWrite(path, ASCS_SettingsFile, "Sounds", AscsSoundKey(kind))
    WriteLog("Sounds: ASCS " kind " sound set to " path ".")
}

RestoreAscsSound(kind) {
    try {
        if !(kind = "show" || kind = "hide" || kind = "reminder")
            throw Error("Malformed request.")
        if !RestoreAscsSoundValue(kind)
            throw Error("Nothing to restore.")
        SendToFrontend('{"type":"notice","message":' JsonQuote(Map("show", "ASCS show", "hide", "ASCS hide", "reminder", "Calendar reminder")[kind] " sound restored.") '}')
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
    ASCS_AscsSoundFiles[kind] := path
    IniWrite(path, ASCS_SettingsFile, "Sounds", AscsSoundKey(kind))
    IniDelete(ASCS_SettingsFile, "AscsSoundBackup", kind)
    WriteLog("Sounds: ASCS " kind " sound restored.")
    return true
}

; Payload: show|id or hide|id.
SetAscsSound(content) {
    global ASCS_SettingsFile, ASCS_AscsSoundFiles
    try {
        parts := StrSplit(content, "|", , 2)
        if (parts.Length != 2 || !(parts[1] = "show" || parts[1] = "hide" || parts[1] = "reminder"))
            throw Error("Malformed request.")
        sound := IndexedSound(parts[2])
        if (sound["ext"] != "wav")
            throw Error("ASCS's own sounds must be WAV files.")
        ApplyAscsSound(parts[1], sound["path"])
        SendToFrontend('{"type":"notice","message":' JsonQuote(Map("show", "ASCS show", "hide", "ASCS hide", "reminder", "Calendar reminder")[parts[1]] " sound: " sound["name"] ".") '}')
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
        SetCalendarState("notInstalled", "The calendar server isn't installed. Run tools\Install-Radicale.ps1, then reload ASCS.")
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
        MsgBox("Set the PSO launcher in Preferences › Games & apps.", "PSO session", "Icon! T15")
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

PlaybackDevices() {
    names := []
    try {
        audioEnum := ComObject("{BCDE0395-E52F-467C-8E3D-C4579291692E}", "{A95664D2-9614-4F35-A746-DE8DB63617E6}")
        ComCall(3, audioEnum, "Int", 0, "UInt", 1, "Ptr*", &collection := 0)    ; active render endpoints
        ComCall(3, collection, "UInt*", &count := 0)
        key := Buffer(20)                                                        ; PKEY_Device_FriendlyName
        DllCall("Ole32\CLSIDFromString", "Str", "{a45c254e-df1c-4efd-8020-67d146a850e0}", "Ptr", key)
        NumPut("UInt", 14, key, 16)
        value := Buffer(24, 0)                                                   ; PROPVARIANT (x64)
        Loop Min(count, 16) {
            device := 0, store := 0
            try {
                ComCall(4, collection, "UInt", A_Index - 1, "Ptr*", &device)
                ComCall(4, device, "UInt", 0, "Ptr*", &store)
                ComCall(5, store, "Ptr", key, "Ptr", value)
                if (NumGet(value, 0, "UShort") = 31)                             ; VT_LPWSTR
                    names.Push(SubStr(StrGet(NumGet(value, 8, "Ptr"), "UTF-16"), 1, 120))
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
    return names
}

SendAudioDevices() {
    current := ""
    try current := SoundGetName()
    json := ""
    for name in PlaybackDevices()
        json .= (json = "" ? "" : ",") '{"name":' JsonQuote(name) ',"current":' (name = current ? "true" : "false") '}'
    SendToFrontend('{"type":"audioDevices","items":[' json '],"soundSwitch":' (ProcessExist("SoundSwitch.exe") ? "true" : "false") '}')
}

SelectAudioDevice(name) {
    valid := false
    for device in PlaybackDevices()
        if (device = name)
            valid := true
    if !valid
        return
    if SwitchAudioTo(name) {
        RecordActivity("system", "Audio output: " SubStr(name, 1, 60))
    } else {
        SendToFrontend('{"type":"notice","message":' JsonQuote(ProcessExist("SoundSwitch.exe")
            ? "SoundSwitch didn't reach that device. Add it to SoundSwitch's playback list."
            : "SoundSwitch isn't running; ASCS switches devices through it.") '}')
    }
    SendAudioDevices()
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
        "explorer", "File Explorer", "claude", "Claude",
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

; Pastes a note into the window that was active before ASCS opened (1.8.0;
; snippets before). The page has filled its placeholders; {clipboard} and
; {cursor} arrive as marks that PrepareNoteText resolves here. The text is
; pasted through the clipboard, which is restored afterwards.
PasteNote(text, *) {
    global ASCS_PreviousWindow

    prepared := PrepareNoteText(text, A_Clipboard)
    text := prepared["text"]
    if (text = "")
        return
    HandleClose()

    target := ASCS_PreviousWindow
    if !(target && WinExist("ahk_id " target)) {
        A_Clipboard := text
        ShowDesktopTooltip("Note copied to the clipboard.")
        return
    }

    try {
        WinActivate("ahk_id " target)
        if !WinWaitActive("ahk_id " target, , 1)
            throw Error("The previous window could not be focused.")
        saved := ClipboardAll()
        A_Clipboard := text
        if !ClipWait(1)
            throw Error("The clipboard did not accept the note.")
        Send("^v")
        ; {cursor}: walk back from the end of what was pasted, once the
        ; target has taken the paste.
        if (prepared["left"] > 0) {
            Sleep(120)
            Send("{Left " prepared["left"] "}")
        }
        SetTimer(() => (A_Clipboard := saved), -500)
        title := ""
        try title := WinGetTitle("ahk_id " target)
        RecordActivity("snippet", "Pasted a note" (title != "" ? " into " SubStr(title, 1, 60) : ""))
    } catch as err {
        A_Clipboard := text
        WriteLog("Note paste failed: " err.Message)
        ShowDesktopTooltip("Note copied to the clipboard; paste it with Ctrl+V.")
    }
}

; Copies a note with its placeholders filled ({clipboard} becomes the
; clipboard's current text; {cursor} is dropped).
CopyNote(text) {
    text := PrepareNoteText(text, A_Clipboard)["text"]
    if (text = "")
        return
    A_Clipboard := text
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


; ==========================================
; QUICK ACTIONS (1.7.0)
; ==========================================

SendQuickActions() {
    global ASCS_QuickActions

    if !IsObject(ASCS_QuickActions) {
        SendToFrontend('{"type":"quickActions","items":null}')
        return
    }
    json := "["
    for index, id in ASCS_QuickActions
        json .= (index > 1 ? "," : "") JsonQuote(id)
    SendToFrontend('{"type":"quickActions","items":' json ']}')
}

SaveQuickActions(content) {
    global ASCS_SettingsFile
    global ASCS_QuickActions

    try {
        ids := ParseQuickActionsPayload(content)
        IniDelete(ASCS_SettingsFile, "QuickActions")
        IniWrite(ids.Length, ASCS_SettingsFile, "QuickActions", "Count")
        for index, id in ids
            IniWrite(id, ASCS_SettingsFile, "QuickActions", "Action" index)
        ASCS_QuickActions := ids
    } catch as err {
        WriteLog("Quick actions save failed: " err.Message)
        SendToFrontend('{"type":"error","scope":"quickActions","message":' JsonQuote(err.Message) '}')
    }
    SendQuickActions()
}
