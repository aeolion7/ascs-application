; ==========================================
; COUNTERPOINT (2.5.0)
; ==========================================
; Exercises from the Conservatory's Counterpoint tab, one file each in
; data\counterpoint, named by the page's id for it, each checked by
; ValidateExerciseText as it's read and saved and written to a temporary file
; that's moved into place. An export is MusicXML the page made, checked by
; ValidateMusicXml and written into data\exports under a name made from the
; exercise's title by ExportFileName; the page never names a path. Show in
; folder opens Explorer on the last one written.

; At most 100 exercises, each file at most 64 KB.
ExercisesMax() => 100

global ASCS_LastExport := ""

SendExercises() {
    global ASCS_ExercisesDir

    json := ""
    count := 0
    if DirExist(ASCS_ExercisesDir) {
        Loop Files ASCS_ExercisesDir "\*.exercise" {
            if (count >= ExercisesMax())
                break
            try {
                id := ValidateExerciseId(SubStr(A_LoopFileName, 1, -9))
                if (A_LoopFileSize > 65536)
                    throw Error("It's too large.")
                text := ValidateExerciseText(FileRead(A_LoopFileFullPath, "UTF-8"))
                json .= (count ? "," : "") '{"id":' JsonQuote(id) ',"text":' JsonQuote(text) '}'
                count++
            } catch as err {
                WriteLog("Skipped exercise " A_LoopFileName ": " err.Message)
            }
        }
    }
    SendToFrontend('{"type":"exercises","items":[' json ']}')
}

CountExercises() {
    global ASCS_ExercisesDir

    count := 0
    if DirExist(ASCS_ExercisesDir) {
        Loop Files ASCS_ExercisesDir "\*.exercise"
            count++
    }
    return count
}

; The page sends the exercise's id on the first line, then the exercise.
SaveExercise(content) {
    global ASCS_ExercisesDir

    try {
        at := InStr(content, "`n")
        if !at
            throw Error("An exercise is malformed.")
        id := ValidateExerciseId(RTrim(SubStr(content, 1, at - 1), "`r"))
        text := ValidateExerciseText(SubStr(content, at + 1))
        path := ASCS_ExercisesDir "\" id ".exercise"
        if (!FileExist(path) && CountExercises() >= ExercisesMax())
            throw Error("Maestro keeps up to " ExercisesMax() " exercises. Delete one to save another.")
        DirCreate(ASCS_ExercisesDir)
        tempPath := path ".tmp"
        if FileExist(tempPath)
            FileDelete(tempPath)
        FileAppend(text, tempPath, "UTF-8-RAW")
        FileMove(tempPath, path, 1)
        SendToFrontend('{"type":"exerciseSaved","id":' JsonQuote(id) '}')
    } catch as err {
        WriteLog("Exercise save failed: " err.Message)
        SendToFrontend('{"type":"error","scope":"counterpoint","message":' JsonQuote(err.Message) '}')
    }
}

DeleteExercise(content) {
    global ASCS_ExercisesDir

    try {
        id := ValidateExerciseId(content)
        path := ASCS_ExercisesDir "\" id ".exercise"
        if FileExist(path)
            FileDelete(path)
        SendToFrontend('{"type":"exerciseDeleted","id":' JsonQuote(id) '}')
    } catch as err {
        WriteLog("Exercise delete failed: " err.Message)
        SendToFrontend('{"type":"error","scope":"counterpoint","message":' JsonQuote(err.Message) '}')
    }
}

; The page sends the exercise's title on the first line, then its MusicXML.
; A name already taken gets " (2)" and so on; nothing is written over.
ExportMusicXml(content) {
    global ASCS_ExportsDir, ASCS_LastExport

    try {
        at := InStr(content, "`n")
        if !at
            throw Error("An export is malformed.")
        name := ExportFileName(RTrim(SubStr(content, 1, at - 1), "`r"))
        xml := ValidateMusicXml(SubStr(content, at + 1))
        DirCreate(ASCS_ExportsDir)
        file := name ".musicxml"
        copy := 1
        while FileExist(ASCS_ExportsDir "\" file) {
            copy++
            if (copy > 99)
                throw Error("Too many exports share that name.")
            file := name " (" copy ").musicxml"
        }
        path := ASCS_ExportsDir "\" file
        tempPath := path ".tmp"
        if FileExist(tempPath)
            FileDelete(tempPath)
        FileAppend(xml, tempPath, "UTF-8-RAW")
        FileMove(tempPath, path)
        ASCS_LastExport := path
        SendToFrontend('{"type":"exported","file":' JsonQuote(file) '}')
    } catch as err {
        WriteLog("Export failed: " err.Message)
        SendToFrontend('{"type":"error","scope":"export","message":' JsonQuote(err.Message) '}')
    }
}

; Explorer on the last export, selected, or on the exports folder.
ShowExport() {
    global ASCS_ExportsDir, ASCS_LastExport

    if (ASCS_LastExport != "" && FileExist(ASCS_LastExport))
        Run('explorer.exe /select,"' ASCS_LastExport '"')
    else if DirExist(ASCS_ExportsDir)
        Run('explorer.exe "' ASCS_ExportsDir '"')
}
