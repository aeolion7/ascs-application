; ==========================================
; RHYTHM (2.6.0)
; ==========================================
; Rhythms from the Conservatory's Rhythm tab, one file each in data\rhythms,
; named by the page's id for it, each checked by ValidateRhythmText as it's
; read and saved and written to a temporary file that's moved into place.

; At most 100 rhythms, each file at most 16 KB.
RhythmsMax() => 100

SendRhythms() {
    global ASCS_RhythmsDir

    json := ""
    count := 0
    if DirExist(ASCS_RhythmsDir) {
        Loop Files ASCS_RhythmsDir "\*.rhythm" {
            if (count >= RhythmsMax())
                break
            try {
                id := ValidateRhythmId(SubStr(A_LoopFileName, 1, -7))
                if (A_LoopFileSize > 16384)
                    throw Error("It's too large.")
                text := ValidateRhythmText(FileRead(A_LoopFileFullPath, "UTF-8"))
                json .= (count ? "," : "") '{"id":' JsonQuote(id) ',"text":' JsonQuote(text) '}'
                count++
            } catch as err {
                WriteLog("Skipped rhythm " A_LoopFileName ": " err.Message)
            }
        }
    }
    SendToFrontend('{"type":"rhythms","items":[' json ']}')
}

CountRhythms() {
    global ASCS_RhythmsDir

    count := 0
    if DirExist(ASCS_RhythmsDir) {
        Loop Files ASCS_RhythmsDir "\*.rhythm"
            count++
    }
    return count
}

; The page sends the rhythm's id on the first line, then the rhythm.
SaveRhythm(content) {
    global ASCS_RhythmsDir

    try {
        at := InStr(content, "`n")
        if !at
            throw Error("A rhythm is malformed.")
        id := ValidateRhythmId(RTrim(SubStr(content, 1, at - 1), "`r"))
        text := ValidateRhythmText(SubStr(content, at + 1))
        path := ASCS_RhythmsDir "\" id ".rhythm"
        if (!FileExist(path) && CountRhythms() >= RhythmsMax())
            throw Error("Maestro keeps up to " RhythmsMax() " rhythms. Delete one to save another.")
        DirCreate(ASCS_RhythmsDir)
        tempPath := path ".tmp"
        if FileExist(tempPath)
            FileDelete(tempPath)
        FileAppend(text, tempPath, "UTF-8-RAW")
        FileMove(tempPath, path, 1)
        SendToFrontend('{"type":"rhythmSaved","id":' JsonQuote(id) '}')
    } catch as err {
        WriteLog("Rhythm save failed: " err.Message)
        SendToFrontend('{"type":"error","scope":"rhythm","message":' JsonQuote(err.Message) '}')
    }
}

DeleteRhythm(content) {
    global ASCS_RhythmsDir

    try {
        id := ValidateRhythmId(content)
        path := ASCS_RhythmsDir "\" id ".rhythm"
        if FileExist(path)
            FileDelete(path)
        SendToFrontend('{"type":"rhythmDeleted","id":' JsonQuote(id) '}')
    } catch as err {
        WriteLog("Rhythm delete failed: " err.Message)
        SendToFrontend('{"type":"error","scope":"rhythm","message":' JsonQuote(err.Message) '}')
    }
}
