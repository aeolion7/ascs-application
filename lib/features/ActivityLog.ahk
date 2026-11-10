; ==========================================
; ACTIVITY LOG
; ==========================================

WriteLog(message := "Maestro activity") {
    global ASCS_LogFile

    message := RegExReplace(String(message), "[\r\n]+", " ")
    message := RegExReplace(
        message,
        "[\x00-\x08\x0B\x0C\x0E-\x1F]",
        ""
    )
    if (StrLen(message) > 4096)
        message := SubStr(message, 1, 4096)

    try {
        if (FileExist(ASCS_LogFile)
            && FileGetSize(ASCS_LogFile) >= 1048576)
            FileMove(ASCS_LogFile, ASCS_LogFile ".1", 1)

        FileAppend(
            FormatTime(, "yyyy-MM-dd HH:mm:ss")
            " | " message "`n",
            ASCS_LogFile,
            "UTF-8"
        )
    }
}

; ==========================================
; JSON UTILITIES
; ==========================================



