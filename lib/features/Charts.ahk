; ==========================================
; CHORD CHARTS (2.4.0)
; ==========================================
; Songs from the Conservatory's Progressions tab, one file each in
; data\charts, named by the page's id for it. The page asks for them when
; Progressions first opens, and saves or deletes one at a time. Each is checked
; by ValidateChartText as it's read and saved, and written to a temporary file
; that's moved into place.

; At most 100 songs, each file at most 64 KB.
ChartsMax() => 100

SendCharts() {
    global ASCS_ChartsDir

    json := ""
    count := 0
    if DirExist(ASCS_ChartsDir) {
        Loop Files ASCS_ChartsDir "\*.chart" {
            if (count >= ChartsMax())
                break
            try {
                id := ValidateChartId(SubStr(A_LoopFileName, 1, -6))
                if (A_LoopFileSize > 65536)
                    throw Error("It's too large.")
                text := ValidateChartText(FileRead(A_LoopFileFullPath, "UTF-8"))
                json .= (count ? "," : "") '{"id":' JsonQuote(id) ',"text":' JsonQuote(text) '}'
                count++
            } catch as err {
                WriteLog("Skipped chart " A_LoopFileName ": " err.Message)
            }
        }
    }
    SendToFrontend('{"type":"charts","items":[' json ']}')
}

CountCharts() {
    global ASCS_ChartsDir

    count := 0
    if DirExist(ASCS_ChartsDir) {
        Loop Files ASCS_ChartsDir "\*.chart"
            count++
    }
    return count
}

; The page sends the song's id on the first line, then its chart.
SaveChart(content) {
    global ASCS_ChartsDir

    try {
        at := InStr(content, "`n")
        if !at
            throw Error("A chart is malformed.")
        id := ValidateChartId(RTrim(SubStr(content, 1, at - 1), "`r"))
        text := ValidateChartText(SubStr(content, at + 1))
        path := ASCS_ChartsDir "\" id ".chart"
        if (!FileExist(path) && CountCharts() >= ChartsMax())
            throw Error("Maestro keeps up to " ChartsMax() " songs. Delete one to save another.")
        DirCreate(ASCS_ChartsDir)
        tempPath := path ".tmp"
        if FileExist(tempPath)
            FileDelete(tempPath)
        FileAppend(text, tempPath, "UTF-8-RAW")
        FileMove(tempPath, path, 1)
        SendToFrontend('{"type":"chartSaved","id":' JsonQuote(id) '}')
    } catch as err {
        WriteLog("Chart save failed: " err.Message)
        SendToFrontend('{"type":"error","scope":"charts","message":' JsonQuote(err.Message) '}')
    }
}

DeleteChart(content) {
    global ASCS_ChartsDir

    try {
        id := ValidateChartId(content)
        path := ASCS_ChartsDir "\" id ".chart"
        if FileExist(path)
            FileDelete(path)
        SendToFrontend('{"type":"chartDeleted","id":' JsonQuote(id) '}')
    } catch as err {
        WriteLog("Chart delete failed: " err.Message)
        SendToFrontend('{"type":"error","scope":"charts","message":' JsonQuote(err.Message) '}')
    }
}
