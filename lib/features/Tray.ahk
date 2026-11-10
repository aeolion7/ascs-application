; ==========================================
; TRAY MENU (1.6.0)
; ==========================================

SetupTrayMenu() {
    global ASCS_DataDir
    global ASCS_Version
    global ASCS_LogFile

    tray := A_TrayMenu
    tray.Delete()
    tray.Add("Show Maestro", (*) => ShowASCS())
    tray.Add("Command palette`tSuper+Space", (*) => ShowCommandLauncher())
    tray.Add("Quick Notes", (*) => ShowView("notes"))
    tray.Add("Preferences", (*) => ShowView("settings"))
    tray.Add()
    tray.Add("Save arrangement", (*) => SaveWorkspace())
    tray.Add("Restore arrangement", (*) => RestoreWorkspace())
    tray.Add()
    tray.Add("Open data folder", (*) => Run('explorer.exe "' ASCS_DataDir '"'))
    tray.Add("Open log file", (*) => Run('"' ASCS_LogFile '"'))
    tray.Add()
    tray.Add("Reload Maestro`tCtrl+Alt+Shift+A", (*) => ReloadASCS())
    tray.Add("Exit Maestro", ExitASCS)
    tray.Default := "Show Maestro"
    tray.ClickCount := 1
    A_IconTip := "Aeolionware Maestro " ASCS_Version
}

; Saves pending note edits, then restarts the script (picks up code and
; frontend changes). Used by Ctrl+Alt+Shift+A, the tray menu, and the palette.
ReloadASCS(*) {
    WriteLog("Reload requested.")
    ShowNotice("Reloading Maestro…")
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

