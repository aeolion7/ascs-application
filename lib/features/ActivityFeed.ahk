; ==========================================
; ACTIVITY FEED (1.6.0)
; ==========================================

; Records a user-visible event for the Command Center feed. Entries persist
; in data\activity.log (the newest 50 are kept in memory).
RecordActivity(kind, text) {
    global ASCS_Activity
    global ASCS_ActivityFile
    global ASCS_ActivityAppends

    line := FormatActivityLine(FormatTime(A_Now, "yyyy-MM-dd'T'HH:mm:ss"), kind, text)
    item := ParseActivityLine(line)
    if !IsObject(item)
        return

    ASCS_Activity.Push(item)
    while (ASCS_Activity.Length > 50)
        ASCS_Activity.RemoveAt(1)

    try {
        FileAppend(line "`n", ASCS_ActivityFile, "UTF-8")
        ASCS_ActivityAppends++
        if (ASCS_ActivityAppends >= 100)
            CompactActivityFile()
    } catch as err {
        WriteLog("Activity log write failed: " err.Message)
    }

    SendToFrontend('{"type":"activityAdded","item":' ActivityJson(item) '}')
}

LoadActivity() {
    global ASCS_Activity
    global ASCS_ActivityFile

    ASCS_Activity := []
    if !FileExist(ASCS_ActivityFile)
        return
    lineCount := 0
    try {
        for line in StrSplit(FileRead(ASCS_ActivityFile, "UTF-8"), "`n", "`r") {
            if (line = "")
                continue
            lineCount++
            item := ParseActivityLine(line)
            if IsObject(item)
                ASCS_Activity.Push(item)
        }
    } catch as err {
        WriteLog("Activity log read failed: " err.Message)
    }
    while (ASCS_Activity.Length > 50)
        ASCS_Activity.RemoveAt(1)
    if (lineCount > 100)
        CompactActivityFile()
}

CompactActivityFile() {
    global ASCS_Activity
    global ASCS_ActivityFile
    global ASCS_ActivityAppends

    text := ""
    for item in ASCS_Activity
        text .= FormatActivityLine(item["time"], item["kind"], item["text"]) "`n"
    try {
        tempPath := ASCS_ActivityFile ".tmp"
        if FileExist(tempPath)
            FileDelete(tempPath)
        FileAppend(text, tempPath, "UTF-8")
        FileMove(tempPath, ASCS_ActivityFile, 1)
        ASCS_ActivityAppends := 0
    } catch as err {
        WriteLog("Activity log compaction failed: " err.Message)
    }
}

ActivityJson(item) {
    return '{"time":' JsonQuote(item["time"])
        . ',"kind":' JsonQuote(item["kind"])
        . ',"text":' JsonQuote(item["text"]) '}'
}

SendActivity() {
    global ASCS_Activity

    json := "["
    for index, item in ASCS_Activity
        json .= (index > 1 ? "," : "") ActivityJson(item)
    SendToFrontend('{"type":"activity","items":' json ']}')
}

