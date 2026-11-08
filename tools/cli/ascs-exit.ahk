#Requires AutoHotkey v2.0 64-bit
#SingleInstance Off
#NoTrayIcon

; Asks a running ASCS to save its notes and exit, for the ASCS command's `try`.
;   AutoHotkey64.exe ascs-exit.ahk "<full path of the ASCS.ahk that's running>"
; Exit code: 0 it agreed, 1 it didn't answer (an older ASCS), 2 it isn't running.

OnError((*) => ExitApp(1))

script := A_Args.Length ? A_Args[1] : ""
DetectHiddenWindows(true)
SetTitleMatchMode(2)
hwnd := script != "" ? WinExist(script " - AutoHotkey ahk_class AutoHotkey") : 0
if !hwnd
    ExitApp(2)

message := DllCall("RegisterWindowMessage", "Str", "Aeolionware.ASCS.Exit", "UInt")
answer := 0
try answer := SendMessage(message, 0, 0, , "ahk_id " hwnd, , , , 5000)
ExitApp(answer = 1 ? 0 : 1)
