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

