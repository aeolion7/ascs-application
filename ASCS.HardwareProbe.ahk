#Requires AutoHotkey v2.0 64-bit
#SingleInstance Off
#NoTrayIcon

; Reads the hardware details in its own process, so ASCS never waits on Windows
; for them (about 0.7 s, once per session). The first line of the result is the
; details as JSON, and any further lines are for ASCS's log.

if (A_Args.Length != 1 || !RegExMatch(A_Args[1], "^\d+-\d+$"))
    ExitApp(2)

OnError((*) => ExitApp(1))

#Include %A_ScriptDir%\lib\ASCS.Core.ahk
#Include %A_ScriptDir%\lib\features\HardwareInventory.ahk

global ProbeLog := ""

WriteLog(text) {
    global ProbeLog
    ProbeLog .= "`n" StrReplace(StrReplace(text, "`r", " "), "`n", " ")
}

resultPath := A_ScriptDir "\data\hardware-" A_Args[1] ".probe"
tempPath := resultPath ".tmp"
json := GetHardwareDetails()
if FileExist(tempPath)
    FileDelete(tempPath)
FileAppend(json ProbeLog, tempPath, "UTF-8-RAW")
FileMove(tempPath, resultPath, 1)
ExitApp(0)
