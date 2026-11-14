; ==========================================
; CHORD LIBRARY (2.3.0)
; ==========================================
; Chords saved on the Conservatory page, in data\chords.ini. The page asks for
; them once, when its Chords tab first opens, and sends the whole list back on
; each change. Every entry is checked by ValidateChord as it's read and saved;
; a name saved before 2.4.0 that isn't a chord symbol is read as its label.

LoadChords() {
    global ASCS_ChordsFile
    global ASCS_Chords

    ASCS_Chords := []
    if !FileExist(ASCS_ChordsFile)
        return

    count := 0
    try count := Integer(IniRead(ASCS_ChordsFile, "Chords", "Count", "0"))
    Loop Min(Max(count, 0), 200) {
        section := "Chord" A_Index
        try {
            named := MigrateChordName(IniRead(ASCS_ChordsFile, section, "name", ""), IniRead(ASCS_ChordsFile, section, "label", ""))
            ASCS_Chords.Push(ValidateChord(
                named[1],
                IniRead(ASCS_ChordsFile, section, "instrument", ""),
                IniRead(ASCS_ChordsFile, section, "tuning", ""),
                IniRead(ASCS_ChordsFile, section, "shape", ""),
                named[2]
            ))
        } catch as err {
            WriteLog("Skipped saved chord " A_Index ": " err.Message)
        }
    }
}

SendChords() {
    global ASCS_Chords

    if !IsObject(ASCS_Chords)
        LoadChords()
    SendToFrontend('{"type":"chords","items":' ChordsJson(ASCS_Chords) '}')
}

SaveChords(content) {
    global ASCS_ChordsFile
    global ASCS_Chords

    try {
        chords := ParseChordsPayload(content)
        tempPath := ASCS_ChordsFile ".tmp"
        if FileExist(tempPath)
            FileDelete(tempPath)
        IniWrite(chords.Length, tempPath, "Chords", "Count")
        for index, chord in chords {
            for field in ["name", "label", "instrument", "tuning", "shape"]
                IniWrite(chord[field], tempPath, "Chord" index, field)
        }
        FileMove(tempPath, ASCS_ChordsFile, 1)
        ASCS_Chords := chords
    } catch as err {
        WriteLog("Chords save failed: " err.Message)
        SendToFrontend('{"type":"error","scope":"chords","message":' JsonQuote(err.Message) '}')
    }
    SendChords()
}
