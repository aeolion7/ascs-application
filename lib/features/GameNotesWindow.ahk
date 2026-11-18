; ==========================================
; THE GAME-NOTES WINDOW (2.9.0)
; ==========================================
; A small window that stays over a game, for its notes: Super + G opens and
; closes it. It's a second WebView on the same origin and data folder (so it
; shares the browser process), made when opened and closed when hidden, so it
; costs memory only while it shows. It shows without taking the focus from the
; game; clicking it lets you type.
;
; The main page stays the only one that changes the notes, so they're saved,
; backed up and searched as every other note is. This file relays: the main
; page sends the running game's note (GameNotesWindowState), and the window's
; edits, timestamps and requests go back to the main page. The window has its
; own short allowlist (HandleNotesWindowMessage).

global ASCS_NotesWin := ""
global ASCS_NotesWinReady := false
global ASCS_NotesWinState := ""          ; the last state the main page sent, for a window that's just loaded

ToggleGameNotesWindow(*) {
    global ASCS_NotesWin
    if IsObject(ASCS_NotesWin)
        CloseGameNotesWindow()
    else
        OpenGameNotesWindow()
}

OpenGameNotesWindow() {
    global ASCS_NotesWin, ASCS_NotesWinReady, ASCS_WebViewDataDir
    if IsObject(ASCS_NotesWin)
        return
    place := GameNotesWindowPlace()
    try {
        win := WebViewGui(
            "-Caption +Resize +AlwaysOnTop +ToolWindow +MinSize320x240",
            "Maestro Game Notes",
            ,
            { DataDir: ASCS_WebViewDataDir, DefaultWidth: place["w"], DefaultHeight: place["h"] }
        )
        win.Settings.IsWebMessageEnabled := true
        win.Settings.AreDevToolsEnabled := false
        win.Settings.AreDefaultContextMenusEnabled := false
        win.Settings.AreBrowserAcceleratorKeysEnabled := false
        win.Settings.IsZoomControlEnabled := false
        win.Settings.AreHostObjectsAllowed := false     ; as the main window: postMessage only
        win.WebMessageReceived(HandleNotesWindowMessage)
        win.NavigationStarting(HandleNavigationStarting)
        win.NewWindowRequested(HandleNewWindowRequested)
        win.OnEvent("Close", (*) => (CloseGameNotesWindow(), true))
        win.BrowseFolder(A_ScriptDir "\frontend", "ascs.localhost")
        win.Navigate("https://ascs.localhost/notes-window.html")
        ASCS_NotesWinReady := false
        ASCS_NotesWin := win
        win.Move(place["x"], place["y"], place["w"], place["h"])
        win.Show("NA x" place["x"] " y" place["y"] " w" place["w"] " h" place["h"])
    } catch as err {
        WriteLog("Game notes window not opened: " err.Message)
        ASCS_NotesWin := ""
        ShowNotice("The game notes window couldn't open.")
        return
    }
    SendToFrontend('{"type":"gameNotesWindow","open":true}')
}

CloseGameNotesWindow() {
    global ASCS_NotesWin, ASCS_NotesWinReady
    if !IsObject(ASCS_NotesWin)
        return
    win := ASCS_NotesWin
    ASCS_NotesWin := ""
    ASCS_NotesWinReady := false
    KeepGameNotesWindowPlace(win)
    try win.Hide()
    try win.Control.wvc.Close()             ; the WebView2 controller's own close, before the window goes
    try win.Destroy()
    SendToFrontend('{"type":"gameNotesWindow","open":false}')
}

; Where it opens: where it was last, if that's still on a monitor; else at the
; primary monitor's right edge.
GameNotesWindowPlace() {
    global ASCS_SettingsFile
    MonitorGetWorkArea(MonitorGetPrimary(), &left, &top, &right, &bottom)
    place := Map("w", 440, "h", 560, "x", right - 440 - 24, "y", top + 96)
    try {
        stored := IniRead(ASCS_SettingsFile, "GameNotesWindow", "Place", "")
        if RegExMatch(stored, "^(-?\d{1,5}),(-?\d{1,5}),(\d{3,4}),(\d{3,4})$", &m) {
            w := Max(320, Min(Integer(m[3]), 1600)), h := Max(240, Min(Integer(m[4]), 1600))
            if PointOnAMonitor(Integer(m[1]) + w // 2, Integer(m[2]) + 20)
                place := Map("x", Integer(m[1]), "y", Integer(m[2]), "w", w, "h", h)
        }
    }
    return place
}

KeepGameNotesWindowPlace(win) {
    global ASCS_SettingsFile
    try {
        WinGetPos(&x, &y, &w, &h, "ahk_id " win.Hwnd)
        IniWrite(x "," y "," w "," h, ASCS_SettingsFile, "GameNotesWindow", "Place")
    } catch as err {
        WriteLog("Game notes window place not kept: " err.Message)
    }
}

PointOnAMonitor(x, y) {
    loop MonitorGetCount() {
        MonitorGetWorkArea(A_Index, &left, &top, &right, &bottom)
        if (x >= left && x < right && y >= top && y < bottom)
            return true
    }
    return false
}

; From the main page: the running game's note, as JSON the window reads.
RelayGameNotesState(content) {
    global ASCS_NotesWin, ASCS_NotesWinReady, ASCS_NotesWinState
    ASCS_NotesWinState := content
    if !IsObject(ASCS_NotesWin) || !ASCS_NotesWinReady
        return
    try ASCS_NotesWin.PostWebMessageAsString(content)
    catch as err
        WriteLog("Game notes window messaging error: " err.Message)
}

; The window's own allowlist. A note's key is checked as the page's
; ASCSNotes.isGameKey does (letters and digits only, up to 160).
HandleNotesWindowMessage(sender, args) {
    global ASCS_NotesWin, ASCS_NotesWinReady, ASCS_NotesWinState
    try {
        if !RegExMatch(args.Source, "i)^https://ascs\.localhost(?::443)?/notes-window\.html(?:[?#]|$)") {
            WriteLog("Rejected a game notes window message from an untrusted origin.")
            return
        }
        message := args.TryGetWebMessageAsString()
        separator := InStr(message, "`n")
        kind := separator ? SubStr(message, 1, separator - 1) : message
        content := separator ? SubStr(message, separator + 1) : ""
        switch kind {
            case "Ready":
                ASCS_NotesWinReady := true
                if (ASCS_NotesWinState != "")
                    RelayGameNotesState(ASCS_NotesWinState)
                SendToFrontend('{"type":"gameNotesWindow","open":true}')
            case "Edit":
                ; key, a line break, then the note's whole text.
                cut := InStr(content, "`n")
                key := cut ? SubStr(content, 1, cut - 1) : ""
                text := cut ? SubStr(content, cut + 1) : ""
                if IsGameNoteKey(key) && StrLen(text) <= 100000
                    SendToFrontend('{"type":"gameNotesWindowEdit","key":' JsonQuote(key) ',"text":' JsonQuote(text) '}')
                else
                    WriteLog("Rejected a game notes window edit.")
            case "Stamp", "Open":
                if IsGameNoteKey(content) {
                    SendToFrontend('{"type":"gameNotesWindow' kind '","key":' JsonQuote(content) '}')
                    if (kind = "Open")
                        ShowASCS("notes")
                } else {
                    WriteLog("Rejected a game notes window " kind " request.")
                }
            case "Close":
                if (content = "")
                    SetTimer(CloseGameNotesWindow, -1)      ; not from inside the window's own message
            default:
                WriteLog("Rejected an unknown game notes window message.")
        }
    } catch as err {
        WriteLog("Game notes window message error: " err.Message)
    }
}
