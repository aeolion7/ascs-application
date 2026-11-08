#Requires AutoHotkey v2.0 64-bit
#SingleInstance Off
#NoTrayIcon

; ==========================================
; ASCS LAUNCHER
; ==========================================
; A tiny resident helper, started at sign-in, that owns Ctrl+Alt+Shift+A:
;   * ASCS not running -> start it;
;   * ASCS running     -> ask it to reload (it saves pending notes first).
; Windows 11 does not reliably honor hotkeys on Start Menu shortcuts, so this
; script provides the "start" half. ASCS also handles the same keys itself, so
; reloading still works when the launcher is not running.
;
;   AutoHotkey64.exe ASCS.Launcher.ahk            resident (replaces an older copy)
;   AutoHotkey64.exe ASCS.Launcher.ahk --trigger  start or reload once, then exit

global ASCS_ScriptPath := A_ScriptDir "\ASCS.ahk"
global ASCS_ReloadMessage := DllCall("RegisterWindowMessage", "Str", "Aeolionware.ASCS.Reload", "UInt")

if (A_Args.Length && A_Args[1] = "--trigger") {
    StartOrReloadASCS()
    ExitApp()
}

; Keep a single resident launcher: close any older copy of this script.
DetectHiddenWindows(true)
for oldHwnd in WinGetList(A_ScriptFullPath " - AutoHotkey ahk_class AutoHotkey") {
    if (oldHwnd != A_ScriptHwnd)
        try WinClose("ahk_id " oldHwnd)
}
Persistent()

; The $ prefix uses the keyboard hook so the keys are not passed on.
$^!+a::StartOrReloadASCS()

FindASCSWindow() {
    DetectHiddenWindows(true)
    SetTitleMatchMode(2)
    ; Any folder: during ASCS try, the test build is the ASCS that's running, and
    ; starting this folder's copy beside it would make their hotkeys fight.
    return WinExist("\ASCS.ahk - AutoHotkey ahk_class AutoHotkey")
}

StartOrReloadASCS(*) {
    hwnd := FindASCSWindow()
    if hwnd {
        ; ASCS replies 1 and reloads itself after saving notes. Without that
        ; reply (an older or unresponsive ASCS), fall through and relaunch it;
        ; #SingleInstance Force then replaces the old instance.
        handled := 0
        try handled := SendMessage(ASCS_ReloadMessage, 0, 0, , "ahk_id " hwnd, , , , 2000)
        if (handled = 1)
            return
    }
    try {
        Run('"' A_AhkPath '" "' ASCS_ScriptPath '"', A_ScriptDir)
        ToolTip("Starting ASCS…")
        SetTimer(() => ToolTip(), -1500)
    } catch as err {
        MsgBox("ASCS could not be started.`n`n" err.Message, "ASCS Launcher", "Iconx")
    }
}
