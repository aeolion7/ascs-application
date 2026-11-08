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
        try {
            CheckNoteGroups(content)            ; 1.8.0: groups are checked here too
            CheckNoteGames(content)             ; 1.11.1: and links to games
        } catch as err {
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

        if (FileExist(ASCS_NotesFile) && !ASCS_NotesRecovered) {
            KeepTodaysNotesCopy()
            FileCopy(ASCS_NotesFile, backupPath, 1)
        }

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

; 1.11.2: the first save of each day keeps the notes as they were before it.
; A failure here is logged and never stops the save.
KeepTodaysNotesCopy() {
    global ASCS_NotesFile, ASCS_DataDir

    try {
        folder := ASCS_DataDir "\notes-history"
        target := folder "\" NotesHistoryName(A_Now)
        if FileExist(target)
            return
        DirCreate(folder)
        FileCopy(ASCS_NotesFile, target, 1)
        names := []
        Loop Files folder "\*.json"
            names.Push(A_LoopFileName)
        for name in NotesHistoryToPrune(names)
            FileDelete(folder "\" name)
    } catch as err {
        WriteLog("Notes history failed: " err.Message)
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

