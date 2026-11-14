
#Requires AutoHotkey v2.0 64-bit
#SingleInstance Force
#Warn
#Warn LocalSameAsGlobal, Off

SetWorkingDir(A_ScriptDir)

; Hotkeys wait until the window exists (2.0.0): a press of Super while Maestro
; was starting reached for a window that wasn't there yet, and AutoHotkey showed
; an error. Super itself still answers, with a toast; Ctrl+Alt+Shift+A still
; reloads. Both are #SuspendExempt in SuperKey.ahk.
Suspend(true)

; ==========================================
; AEOLIONWARE SUPER COMMAND SYSTEM
; Version 2.4.0
; ==========================================

#Include webview\WebViewToo.ahk
#Include lib\ASCS.Core.ahk

; ==========================================
; GLOBAL VARIABLES
; ==========================================

global ASCS_Version := "2.4.0"
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
global ASCS_RulesFile := ASCS_DataDir "\rules.ini"       ; 1.10.0: launch rules
global ASCS_LaunchRules := Map()
global ASCS_RuleAppliedPids := Map()
global ASCS_Notices := []          ; 1.11.0: toasts at the top of the screen
global ASCS_NoticeWindow := 0
global ASCS_StartedAt := A_TickCount   ; 2.0.0: Super waits for the page until 30 s after this; 2.3.0: the daily backup, 5 min
global ASCS_CommandsFile := ASCS_DataDir "\commands.ini"
global ASCS_ChordsFile := ASCS_DataDir "\chords.ini"     ; 2.3.0: the Conservatory's saved chords
global ASCS_ChartsDir := ASCS_DataDir "\charts"          ; 2.4.0: the Conservatory's songs, a file each
global ASCS_Chords := 0                                  ; 0 = not read yet
global ASCS_ActivityFile := ASCS_DataDir "\activity.log"

; Default window size (2.0.0; 10% shorter since 2.2.0, at the user's request):
; the fullest Command Center fits without scrolling. Always capped to the screen.
global ASCS_WindowWidth := 2540
global ASCS_WindowHeight := 1224
global ASCS_AlmanacDir := ASCS_DataDir "\almanac"

; Almanac (1.7.0). The location is fixed to New York City for now.
global ASCS_AlmanacWikipedia := false
global ASCS_Countdowns := []
global ASCS_AlmanacPlace := "New York City"
global ASCS_AlmanacLatitude := 40.7128
global ASCS_AlmanacLongitude := -74.006
global ASCS_AlmanacRequests := Map()
global ASCS_AlmanacRetryAt := 0
global ASCS_WeatherEnabled := true        ; 2.0.0: the Weather module's forecast
global ASCS_WeatherRequest := 0
global ASCS_WeatherRetryAt := 0
global ASCS_NetworkSample := 0           ; the last reading, for speeds and app use
global ASCS_ProcessSample := 0
global ASCS_TimerEnds := 0
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
global ASCS_RetroAchievementsFetched := Map()  ; 2.2.0: when each reply was fetched, Unix seconds
global ASCS_RaExtraCache := Map()      ; 1.9.0: one game's achievements, recent unlocks
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
; Custom Sounds (2.2.0): a second folder, for sounds that aren't Windows'.
global ASCS_CustomSounds := "C:\Sounds\!windows"
global ASCS_StartupFile := ASCS_DataDir "\startup-sounds.ini"   ; 1.8.1; read by C:\Scripts\SignIn.ahk and Shutdown Sound.ahk
global ASCS_OriginsFile := ASCS_DataDir "\sound-origins.ini"    ; 1.8.1; which original each leveled copy was made from
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
; "start" (2.2.0) plays on the first show after Maestro starts, with the start
; screen, in place of the show sound; none until one is chosen in Sounds.
global ASCS_AscsSoundFiles := Map(
    "start", "",
    "show", "C:\Sounds\all-windows-sounds-main\(2001) Windows XP\Windows XP Logon Sound.wav",
    "hide", "C:\Sounds\all-windows-sounds-main\(2001) Windows XP\Windows XP Logoff Sound.wav")
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
global ASCS_HasShown := false           ; the window has been shown this run (2.2.0)
; The start screen (2.2.0): whether it plays (the page says, from the logo swing
; preference and reduced motion), its window while it shows, and its timing.
global ASCS_StartScreenOn := true
global ASCS_StartScreen := ""
global ASCS_StartScreenAt := 0
global ASCS_StartScreenFading := false
global ASCS_StartScreenArt := A_ScriptDir "\frontend\assets\start-screen"
global ASCS_StartScreenArm := ""
global ASCS_StartScreenFrame := 0
global ASCS_StartScreenFrames := []     ; the arm's pictures, by degree
global ASCS_StartScreenSwapped := false
global ASCS_PendingView := "home"
global ASCS_DashboardErrorShown := false
global ASCS_DriveCache := Map()
global ASCS_DriveProbes := Map()
global ASCS_HardwareProbe := 0          ; the inventory worker while it runs
global ASCS_BackupsEnabled := false     ; 2.1.0: the daily backup
global ASCS_BackupsTime := "1800"
global ASCS_BackupsFolder := ""
global ASCS_BackupRun := 0              ; the backup worker while it runs
global ASCS_BackupAttempt := ""         ; when this run of Maestro last tried one
global ASCS_BackupFailure := ""         ; why that failed, when the command left no record
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
global ASCS_HistoryCpuSample := 0       ; the history's own baseline; see ReadCpuUsage
global ASCS_HardwareDue := false        ; the page needs the hardware details sent
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
global ASCS_MetricHistory := NewMetricHistory()   ; 2.0.0: each second, 10 s and minute; see Core
global ASCS_HistoryScale := "tens"     ; the one System is showing
global ASCS_HistorySentSeq := -1       ; what the page has of it
; Defaults; user selections are persisted in settings.ini.
global ASCS_Drives := ["C:", "J:"]

DirCreate(ASCS_DataDir)
DirCreate(ASCS_WebViewDataDir)
DirCreate(ASCS_WorkspaceDir)
LoadUserSettings()
LoadAlmanacSettings()
LoadWeatherSettings()
LoadGameSettings()
LoadSoundSettings()
LoadBackupSettings()
StartLaunchRules()      ; 1.10.0: the shell hook for launch rules
StartBackupSchedule()   ; 2.1.0: the daily backup, never in a test build
LoadCustomCommands()
LoadActivity()

ASCS_EverythingPath := FindEverything()
SetTimer(PruneRaImageCache, -60000)             ; trim the image cache once, off the start-up path
SetTimer(TrackPlaySessions, 10000)              ; Now playing's session timer
SetTimer(AscsStartupSound, -1500)               ; "on start" sound, unless Windows just signed in
SetTimer(StartCalendarServer, -2000)            ; the calendar's Radicale server, off the start-up path
SetTimer(ReportStartupTasks, -20000)            ; warns if the old sign-in tasks are still in place
OnExit(StopCalendarServer)

if !FileExist(ASCS_NotesFile)
    FileAppend('{"version":2,"activeId":null,"notes":[]}', ASCS_NotesFile, "UTF-8")

; ==========================================
; WEBVIEW2 INITIALIZATION
; ==========================================

; Every start says so at once (2.0.0), and "Maestro is ready." follows when the
; page has loaded. The toast needs nothing from the window.
ShowNotice("Maestro is tuning up…")

try {
    MonitorGetWorkArea(1, &workLeft, &workTop, &workRight, &workBottom)
    windowWidth := Min(ASCS_WindowWidth, workRight - workLeft - 32)
    windowHeight := Min(ASCS_WindowHeight, workBottom - workTop - 32)
    windowX := workLeft + Floor((workRight - workLeft - windowWidth) / 2)
    windowY := workTop + Floor((workBottom - workTop - windowHeight) / 2)

    ASCS_App := WebViewGui(
        "-Caption +Resize +MinSize760x520 +E0x40000",
        "Aeolionware Maestro",
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
    ReadCpuUsage(&ASCS_HistoryCpuSample)      ; baseline for the history sampler
    SetTimer(SampleMetricHistory, 1000)

    WriteLog("Maestro " ASCS_Version " initialized.")
    RecordActivity("system", "Maestro " ASCS_Version " started")

} catch as err {
    WriteLog("WebView2 initialization failed: " err.Message)

    MsgBox(
        "Maestro could not initialize WebView2.`n`n"
        err.Message,
        "Maestro Startup Error",
        "Iconx"
    )

    ExitApp()
}
Suspend(false)

#Include lib\features\SuperKey.ahk
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
    global ASCS_PageReady
    global ASCS_StartedAt

    ; Until the page has loaded, the window would open blank. After 30 s it opens
    ; anyway, so a page that never loads can't keep it shut.
    if !IsObject(ASCS_App) || (!ASCS_PageReady && A_TickCount - ASCS_StartedAt < 30000) {
        ShowNotice("Maestro is still tuning up; it's ready in a moment.")
        return
    }
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
    global ASCS_HasShown
    global ASCS_AscsSoundFiles
    global ASCS_StartScreenOn
    global ASCS_StartScreen

    if !IsObject(ASCS_App)
        return

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
    ; The first show after a start (2.2.0): the start screen goes up first, so
    ; it's there the moment the window is, and the start sound, if one is
    ; chosen, plays in place of the show sound. Maestro sounds Off silences both.
    first := !wasVisible && !ASCS_HasShown
    if !wasVisible
        ASCS_HasShown := true
    if (first && ASCS_StartScreenOn)
        ShowStartScreen()
    if (first && !IsObject(ASCS_StartScreen))
        FreeStartScreenFrames()
    ASCS_App.Show()
    if (!wasVisible && ASCS_PageReady)
        SendToFrontend(WindowShownJson())
    if !wasVisible {
        if (first && ASCS_AscsSoundMode != "off" && ASCS_AscsSoundFiles["start"] != "" && FileExist(ASCS_AscsSoundFiles["start"]))
            PlayAscsSound("start")
        else if (ASCS_AscsSoundMode = "show")
            PlayAscsSound("show")
    }
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
        throw Error("Maestro window handle is invalid")

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
            WriteLog("Blocked navigation outside the Maestro origin.")
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

; ---- The start screen (2.2.0)
; On the first show after Maestro starts, a plain window covers Maestro's: the
; page's color with the mark and the name as the sidebar lays them out, 3.5
; times the size, from frontend\assets\start-screen\ (made by
; tests\preview\start-screen.ps1). Windows draws it at once, while WebView2 is
; still drawing the page beneath it, so all of it is seen. The mark's arm makes
; one movement, out and back on the sidebar's curve (MarkSwingAngle, two of its
; four strokes: the whole swing kept Maestro covered too long): the art is cut into pictures that
; don't overlap, and each step shows the arm's picture for that moment, one per
; degree, so a late step skips ahead rather than slowing the swing. The step
; hands the picture straight to its control (STM_SETIMAGE): AutoHotkey's own
; swap blanked it for a moment (a probe caught 19 blank frames in 700 screen
; grabs; none this way), and steps run each 10 ms, which Windows holds to one
; per 15.6 ms tick (at 16 ms, most waited two ticks). The control keeps a copy
; of each picture and hands back the one before, which is freed. Loading the
; 41 pictures takes about 300 ms, so they're loaded while Maestro is hidden,
; one each 30 ms, and freed when the start screen ends or won't play. It's owned
; by Maestro's window, so it stays above it; clicks pass through it
; (WS_EX_LAYERED | WS_EX_TRANSPARENT) and it never takes focus, so a key or
; click still reaches Maestro, and ends it early. It holds for the movement and
; a moment's rest (1.85 s; the page's redraw takes about 1), then dissolves over 280 ms (120 ms when ended early),
; and the page is told as it starts to, so the name catches its sheen in view;
; the sidebar's logo doesn't swing again. A window too small for the art opens
; without it. The page says whether it plays (SetStartScreen).
; Windows runs the dissolve (AnimateWindow): stepped from a timer, it stuttered
; whenever the script was busy (a probe under load held steps up to 47 ms;
; AnimateWindow kept one step per frame). It holds this thread for the
; dissolve, once a run, and needs the window no longer layered first.

WindowShownJson() {
    global ASCS_StartScreen
    return IsObject(ASCS_StartScreen) ? '{"type":"windowShown","startScreen":true}' : '{"type":"windowShown"}'
}

ShowStartScreen() {
    global ASCS_App, ASCS_StartScreen, ASCS_StartScreenAt, ASCS_StartScreenFading, ASCS_StartScreenArt, ASCS_StartScreenArm, ASCS_StartScreenFrame
    layout := ASCS_StartScreenArt "\layout.ini"
    if (IsObject(ASCS_StartScreen) || !FileExist(layout))
        return
    try {
        WinGetPos(&coverX, &coverY, &coverW, &coverH, ASCS_App.Hwnd)
        artW := Integer(IniRead(layout, "Art", "Width")), artH := Integer(IniRead(layout, "Art", "Height"))
        if (coverW < artW || coverH < artH)
            return
        cover := Gui("-Caption +ToolWindow -DPIScale +Owner" ASCS_App.Hwnd " +E0x80020", "Maestro")
        cover.BackColor := "0D0E17"
        cover.MarginX := 0, cover.MarginY := 0
        artX := (coverW - artW) // 2, artY := (coverH - artH) // 2
        for piece in ["top", "left", "right", "bottom", "arm"] {
            x := Integer(IniRead(layout, piece, "X")), y := Integer(IniRead(layout, piece, "Y"))
            w := Integer(IniRead(layout, piece, "W")), h := Integer(IniRead(layout, piece, "H"))
            if (w > 0 && h > 0)
                picture := cover.AddPicture("x" artX + x " y" artY + y " w" w " h" h, ASCS_StartScreenArt "\" (piece = "arm" ? "arm-00" : piece) ".png")
        }
        WinSetTransparent(255, cover)
        cover.Show("NA x" coverX " y" coverY " w" coverW " h" coverH)
        ASCS_StartScreen := cover
        ASCS_StartScreenArm := picture
        ASCS_StartScreenFrame := 0
        ASCS_StartScreenSwapped := false
        OnMessage(0x0138, StartScreenArmColor)      ; WM_CTLCOLORSTATIC
        ASCS_StartScreenAt := A_TickCount
        ASCS_StartScreenFading := false
        SetTimer(StartScreenStep, 10)
    } catch as err {
        WriteLog("Start screen not shown: " err.Message)
        EndStartScreen()
    }
}

StartScreenStep() {
    global ASCS_StartScreen, ASCS_StartScreenAt, ASCS_StartScreenArm, ASCS_StartScreenFrame, ASCS_StartScreenSwapped
    if !IsObject(ASCS_StartScreen) {
        SetTimer(StartScreenStep, 0)
        return
    }
    elapsed := A_TickCount - ASCS_StartScreenAt
    frame := Round(MarkSwingAngle(elapsed, 2))
    if (frame != ASCS_StartScreenFrame) {
        ASCS_StartScreenFrame := frame
        try {
            previous := SendMessage(0x172, 0, StartScreenFrame(frame), ASCS_StartScreenArm)      ; STM_SETIMAGE, IMAGE_BITMAP
            ; The first handed back is AutoHotkey's own picture, which it frees.
            if (ASCS_StartScreenSwapped && previous)
                DllCall("DeleteObject", "Ptr", previous)
            ASCS_StartScreenSwapped := true
        } catch as err
            WriteLog("Start screen arm not drawn: " err.Message)
    }
    ; A key or click ends it early; not in the first 400 ms, when the key that
    ; showed Maestro is still being let go.
    early := elapsed > 400 && (A_TimeIdleKeyboard < elapsed - 400 || GetKeyState("LButton") || GetKeyState("RButton"))
    if (elapsed >= 1850 || early)
        DissolveStartScreen(early ? 120 : 280)
}

DissolveStartScreen(length) {
    global ASCS_StartScreen, ASCS_StartScreenFading
    SetTimer(StartScreenStep, 0)
    ASCS_StartScreenFading := true
    SendToFrontend('{"type":"startScreenDone"}')
    try {
        WinSetTransparent("Off", ASCS_StartScreen)
        WinSetExStyle("-0x20", ASCS_StartScreen)
        if !DllCall("AnimateWindow", "Ptr", ASCS_StartScreen.Hwnd, "UInt", length, "UInt", 0x90000, "Int")     ; AW_HIDE | AW_BLEND
            WriteLog("Start screen dissolve skipped: AnimateWindow failed.")
    } catch as err
        WriteLog("Start screen dissolve skipped: " err.Message)
    EndStartScreen()
}

; Takes it down at once: when it has dissolved, or when Maestro hides first
; (the page is told then too, so it never waits for it).
EndStartScreen() {
    global ASCS_StartScreen, ASCS_StartScreenFading, ASCS_StartScreenArm, ASCS_StartScreenSwapped
    SetTimer(StartScreenStep, 0)
    if !IsObject(ASCS_StartScreen)
        return
    if !ASCS_StartScreenFading
        SendToFrontend('{"type":"startScreenDone"}')
    if ASCS_StartScreenSwapped {
        try {
            last := SendMessage(0x172, 0, 0, ASCS_StartScreenArm)
            if last
                DllCall("DeleteObject", "Ptr", last)
        }
        ASCS_StartScreenSwapped := false
    }
    try ASCS_StartScreen.Destroy()
    OnMessage(0x0138, StartScreenArmColor, 0)
    ASCS_StartScreen := ""
    ASCS_StartScreenArm := ""
    ASCS_StartScreenFading := false
    FreeStartScreenFrames()
}

; The arm's control fills its background before it draws each picture, and a
; screen grab caught that fill now and then (about once a swing). With no brush
; for it, the fill draws nothing and the last picture stays until the next.
StartScreenArmColor(wParam, lParam, *) {
    global ASCS_StartScreenArm
    if (IsObject(ASCS_StartScreenArm) && lParam = ASCS_StartScreenArm.Hwnd)
        return DllCall("GetStockObject", "Int", 5, "Ptr")      ; NULL_BRUSH, never freed
}

; The arm's picture at a degree, loaded now if it isn't yet.
StartScreenFrame(degree) {
    global ASCS_StartScreenFrames, ASCS_StartScreenArt
    while (ASCS_StartScreenFrames.Length <= degree)
        ASCS_StartScreenFrames.Push(0)
    if !ASCS_StartScreenFrames[degree + 1]
        ASCS_StartScreenFrames[degree + 1] := LoadPicture(ASCS_StartScreenArt "\arm-" Format("{:02}", degree) ".png")
    return ASCS_StartScreenFrames[degree + 1]
}

; Loads the next of the arm's 41 pictures (0 to 40 degrees) while Maestro
; waits for its first show; stops when they're in, or when it won't play.
LoadStartScreenFrame() {
    global ASCS_StartScreenFrames, ASCS_StartScreenOn, ASCS_HasShown
    if (!ASCS_StartScreenOn || ASCS_HasShown) {
        SetTimer(LoadStartScreenFrame, 0)
        return
    }
    loop 41 {
        if (ASCS_StartScreenFrames.Length < A_Index || !ASCS_StartScreenFrames[A_Index]) {
            try StartScreenFrame(A_Index - 1)
            catch as err {
                WriteLog("Start screen arm not loaded: " err.Message)
                SetTimer(LoadStartScreenFrame, 0)
            }
            return
        }
    }
    SetTimer(LoadStartScreenFrame, 0)
}

; ---- Getting ready while hidden (2.2.0)
; Once a run, the pages that take a moment to fill are filled before they're
; first opened: the page asks for the sound library (indexing it holds this
; thread about half a second), Windows' and the startup sounds, the game
; library with its covers, and RetroAchievements (from the site, or from disk
; first). It waits 15 s after the page is ready, out of the sign-in rush, and
; then for 2 s without a key or the mouse, so that half second is unlikely to
; meet a key; never while the start screen is up, where the swing needs this
; thread.
PrepareViews() {
    global ASCS_StartScreen, ASCS_PageReady
    static done := false
    if (done || !ASCS_PageReady)
        return
    if (IsObject(ASCS_StartScreen) || A_TimeIdlePhysical < 2000) {
        SetTimer(PrepareViews, -2000)
        return
    }
    done := true
    SendToFrontend('{"type":"prepareViews"}')
}

FreeStartScreenFrames() {
    global ASCS_StartScreenFrames
    SetTimer(LoadStartScreenFrame, 0)
    for handle in ASCS_StartScreenFrames
        if handle
            DllCall("DeleteObject", "Ptr", handle)
    ASCS_StartScreenFrames := []
}

; The page's say on it: "on" or "off", kept for the next start.
SetStartScreen(value) {
    global ASCS_StartScreenOn, ASCS_SettingsFile, ASCS_HasShown, ASCS_PageReady
    on := value == "on"
    if (on = ASCS_StartScreenOn)
        return
    ASCS_StartScreenOn := on
    if !on
        FreeStartScreenFrames()
    else if (!ASCS_HasShown && ASCS_PageReady)
        SetTimer(LoadStartScreenFrame, 30)
    try IniWrite(value, ASCS_SettingsFile, "Appearance", "StartScreen")
    catch as err
        WriteLog("Start screen preference not saved: " err.Message)
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
        WriteLog("Maestro sound not played: " err.Message)
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
    EndStartScreen()
    SetTimer(PushDashboard, 0)
    ; After Windows has finished closing the window, so the logo resetting for
    ; its next swing can't be seen.
    SetTimer(TellPageWindowHidden, -400)
}

TellPageWindowHidden() {
    global ASCS_App
    if !DllCall("IsWindowVisible", "Ptr", ASCS_App.Hwnd, "Int")
        SendToFrontend('{"type":"windowHidden"}')
}

HandleASCSSize(guiObj, minMax, width, height) {
    global ASCS_PageReady

    ; Lets the title bar show the maximize or restore glyph, and the page stop
    ; asking for readings while it's minimized.
    if (minMax = -1)
        SendToFrontend('{"type":"windowMinimized","minimized":true}')
    else {
        SendToFrontend('{"type":"windowMinimized","minimized":false}')
        SendToFrontend('{"type":"windowState","maximized":' (minMax = 1 ? "true" : "false") '}')
    }

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
    global ASCS_HardwareDue
    global ASCS_HistoryScale
    global ASCS_HistorySentSeq
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
                ; Once a run: the page can load again (after a failed load) without
                ; Maestro having restarted.
                static announced := false
                if !announced {
                    announced := true
                    ShowNotice("Maestro is ready.")
                }
                if (ASCS_StartScreenOn && !ASCS_HasShown)
                    SetTimer(LoadStartScreenFrame, 30)
                SetTimer(PrepareViews, -15000)

                SendToFrontend(
                    '{"type":"navigate","view":'
                    JsonQuote(ASCS_PendingView) '}'
                )
                if DllCall("IsWindowVisible", "Ptr", ASCS_App.Hwnd, "Int")
                    SendToFrontend(WindowShownJson())

                GetNotes()
                SendSettings()
                SendCustomCommands()
                SendWorkspaces()
                SendActivity()
                SendQuickActions()
                SendBackups()
                if FileExist(ASCS_DataDir "\test-build.txt")   ; made by the Maestro command's `try`
                    SendToFrontend('{"type":"testBuild"}')
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
                    ASCS_HardwareDue := content = "dashboard"
                    ASCS_HistorySentSeq := -1      ; a page opened: send it the history
                    RequestDashboardPush()
                } else if (content = "") {
                    RequestDashboardPush()
                } else {
                    WriteLog("Rejected GetMetrics payload.")
                }

            case "SetHistoryScale":
                ; 2.0.0: which history System's graphs show.
                if IsMetricHistoryScale(content) {
                    ASCS_HistoryScale := content
                    ASCS_HistorySentSeq := -1
                    RequestDashboardPush()
                } else {
                    WriteLog("Rejected SetHistoryScale payload.")
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
                SendWeatherSettings()

            case "GetWeather":
                HandleGetWeather()

            case "SetWeather":
                SetWeather(content)

            case "GetHomeStats":
                if (StrLen(content) <= 32)
                    HandleGetHomeStats(content)

            case "CountdownTimer":
                CountdownTimer(content)

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

            case "GetSignInHistory":
                SendSignInHistory()

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

            case "SetShowCovers":
                SetShowCovers(content)

            case "SaveGameSettings":
                if (StrLen(content) <= 4096)
                    SaveGameSettings(content)
                else
                    WriteLog("Rejected oversized games settings payload.")

            case "GetRetroAchievements":
                FetchRetroAchievements(content = "refresh")

            case "GetRaGame":
                ; One game's achievements for the achievement browser (1.9.0).
                FetchRaGame(content)

            case "GetRaAwards":
                ; The profile's awards (1.11.0); "refresh" to ask again.
                FetchRaAwards(content = "refresh")

            case "GetRaUnlocks":
                ; The last 30 days of unlocks (1.9.0); "refresh" to ask again.
                FetchRaUnlocks(content = "refresh")

            case "RefreshRaPicture":
                RefreshRaPicture()

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

            case "GetInUseOrigin":
                if (StrLen(content) <= 100)
                    SendInUseSound(content, true)

            case "GetStartupSounds":
                SendStartupSounds()

            case "SetStartupSound":
                if (StrLen(content) <= 600)
                    SetStartupSound(content)

            case "RemoveStartupSound":
                if (StrLen(content) <= 4)
                    RemoveStartupSound(content)

            case "SaveStartupOdds":
                if (StrLen(content) <= 60)
                    SaveStartupOdds(content)

            case "RestoreStartupSound":
                if (StrLen(content) <= 10)
                    RestoreStartupSound(content)

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

            case "SetCustomSounds":
                if (StrLen(content) <= 400)
                    SetCustomSounds(content)

            case "SetStartScreen":
                if (content == "on" || content == "off")
                    SetStartScreen(content)

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

            case "GetChords":
                if (content = "")
                    SendChords()
                else
                    WriteLog("Rejected GetChords payload.")

            case "SaveChords":
                if (StrLen(content) <= 32768)
                    SaveChords(content)
                else
                    WriteLog("Rejected oversized chords payload.")

            case "GetCharts":
                if (content = "")
                    SendCharts()
                else
                    WriteLog("Rejected GetCharts payload.")

            case "SaveChart":
                if (StrLen(content) <= 65536)
                    SaveChart(content)
                else
                    WriteLog("Rejected oversized chart payload.")

            case "DeleteChart":
                if (StrLen(content) <= 24)
                    DeleteChart(content)
                else
                    WriteLog("Rejected DeleteChart payload.")

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

            ; Backups (2.1.0). The folder is never sent by the page: it comes
            ; from Windows' folder picker.
            case "SaveBackups":
                if RegExMatch(content, "^[01]\|\d{4}$")
                    SaveBackupSettings(content)
                else
                    WriteLog("Rejected invalid backup settings.")

            case "ChooseBackupsFolder":
                if (content = "")
                    SetTimer(ChooseBackupsFolder, -1)
                else
                    WriteLog("Rejected ChooseBackupsFolder payload.")

            case "BackupNow":
                if (content = "")
                    BackupNow()
                else
                    WriteLog("Rejected BackupNow payload.")

            case "OpenBackupsFolder":
                if (content = "")
                    OpenBackupsFolder()
                else
                    WriteLog("Rejected OpenBackupsFolder payload.")

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

            case "RenameWorkspace":
                ; "old|new" (1.9.0); both names are validated.
                if (StrLen(content) <= 130)
                    RenameWorkspace(content)

            case "SetWorkspaceWindow":
                ; One saved window's place and switches (1.10.0); all validated.
                if (StrLen(content) <= 120)
                    SetWorkspaceWindow(content)

            case "RemoveWorkspaceWindow":
                if (StrLen(content) <= 50)
                    RemoveWorkspaceWindow(content)

            case "AddWorkspaceWindow":
                ; "name|window handle"; AHK reads the app from the window itself.
                if (StrLen(content) <= 70)
                    SetTimer(AddWorkspaceWindow.Bind(content), -1)

            case "DuplicateWorkspace":
                if (StrLen(content) <= 130)
                    DuplicateWorkspace(content)

            case "GetLaunchRules":
                SendLaunchRules()

            case "RememberWindowRule":
                ; A window handle from the open-window list (1.10.0).
                if (StrLen(content) <= 20)
                    RememberWindowRule(content)

            case "RuleFromWorkspaceWindow":
                if (StrLen(content) <= 50)
                    RuleFromWorkspaceWindow(content)

            case "SetLaunchRuleEnabled":
                if (StrLen(content) <= 270)
                    SetLaunchRuleEnabled(content)

            case "DeleteLaunchRule":
                if (StrLen(content) <= 270)
                    DeleteLaunchRule(content)

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

            case "OpenNoteLink":
                if (StrLen(content) <= 2048)
                    OpenNoteLink(content)

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

    ; Asked before the window exists while starting (2.0.0): no window, nothing to show.
    if !IsObject(ASCS_App)
        return false
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

#Include lib\features\Launcher.ahk
#Include lib\features\Notes.ahk
#Include lib\features\Dashboard.ahk
#Include lib\features\ActivityLog.ahk
#Include lib\features\Tray.ahk
#Include lib\features\ActivityFeed.ahk
#Include lib\features\Almanac.ahk
#Include lib\features\HomeExtras.ahk
#Include lib\features\Logs.ahk
#Include lib\features\Games.ahk
#Include lib\features\Sounds.ahk
#Include lib\features\Calendar.ahk
#Include lib\features\Power.ahk
#Include lib\features\Workspaces.ahk
#Include lib\features\Desktops.ahk
#Include lib\features\Rules.ahk
#Include lib\features\Notices.ahk
#Include lib\features\Commands.ahk
#Include lib\features\QuickCapture.ahk
#Include lib\features\PaletteWindows.ahk
#Include lib\features\QuickActions.ahk
#Include lib\features\Chords.ahk
#Include lib\features\Charts.ahk
#Include lib\features\Backups.ahk
