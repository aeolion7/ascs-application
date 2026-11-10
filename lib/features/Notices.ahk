; ==========================================
; TOASTS AT THE TOP OF THE SCREEN (1.11.0)
; ==========================================

; Short notices about what a hotkey just did, while ASCS isn't the window in
; front. A small native window, built when there's something to show: always on
; top, it never takes focus and clicks go through it. It shows over fullscreen
; games too, though a game in exclusive fullscreen can draw over it. While ASCS
; is in front, its own toast is used, so a notice never shows twice.

ShowNotice(message) {
    global ASCS_Notices
    if IsAscsInFront() {
        SendToFrontend('{"type":"notice","message":' JsonQuote(message) '}')
        return
    }
    NoticeAdd(ASCS_Notices, message, A_TickCount)
    DrawNotices()
}

IsAscsInFront() {
    global ASCS_App
    try return IsDashboardWindowVisible() && WinActive("ahk_id " ASCS_App.Hwnd)
    return false
}

; The new window goes up before the old one comes down, so it doesn't flicker.
DrawNotices() {
    global ASCS_Notices, ASCS_NoticeWindow
    previous := ASCS_NoticeWindow
    ASCS_NoticeWindow := 0
    try {
        if ASCS_Notices.Length
            ASCS_NoticeWindow := BuildNoticeWindow()
    } catch as err {
        WriteLog("A notice couldn't be shown: " err.Message)
    }
    if previous
        try previous.Destroy()
    wait := NoticeNextExpiry(ASCS_Notices, A_TickCount)
    SetTimer(NoticeTick, wait ? -wait : 0)
}

BuildNoticeWindow() {
    global ASCS_Notices
    ; E0x08000020: WS_EX_NOACTIVATE, and WS_EX_TRANSPARENT so clicks go through
    ; (with the layered style WinSetTransparent adds). A tool window: no taskbar
    ; button, and workspaces and the window list ignore it.
    win := Gui("+AlwaysOnTop -Caption +ToolWindow -DPIScale +E0x08000020", "Maestro notice")
    scale := A_ScreenDPI / 96
    win.BackColor := "181B27"
    win.MarginX := Round(18 * scale), win.MarginY := Round(10 * scale)
    win.SetFont("s11 cF5F6FB", "Segoe UI")
    for index, notice in ASCS_Notices {
        ; SS_NOPREFIX (0x80): an & in a title or app name stays an &.
        text := NoticeLine(notice)
        options := "+0x80" (NoticeNeedsWrap(text) ? " w" Round(640 * scale) : "") (index > 1 ? " y+" Round(4 * scale) : "")
        win.Add("Text", options, text)
    }
    win.Show("Hide AutoSize")
    WinSetTransparent(248, win)
    ; Rounded corners and a thin accent border; on Windows 10 these just fail.
    DllCall("Dwmapi\DwmSetWindowAttribute", "Ptr", win.Hwnd, "UInt", 33, "Int*", 2, "UInt", 4, "Int")
    DllCall("Dwmapi\DwmSetWindowAttribute", "Ptr", win.Hwnd, "UInt", 34, "UInt*", 0x00C56F8B, "UInt", 4, "Int")
    win.GetPos(, , &width)
    NoticeWorkArea(&left, &top, &right)
    win.Show("NoActivate x" (left + (right - left - width) // 2) " y" (top + Round(16 * scale)))
    return win
}

; The monitor with the active window, else the primary one.
NoticeWorkArea(&left, &top, &right) {
    monitor := MonitorGetPrimary()
    try {
        active := DllCall("GetForegroundWindow", "Ptr")
        if active
            monitor := GetWindowMonitorIndex(active)
    }
    MonitorGetWorkArea(monitor, &left, &top, &right)
}

NoticeTick() {
    global ASCS_Notices
    NoticeExpire(ASCS_Notices, A_TickCount)
    DrawNotices()
}
