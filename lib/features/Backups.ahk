; ==========================================
; BACKUPS (2.1.0)
; ==========================================
; Once a day Maestro runs the command line's own backup (tools\cli, backup-data)
; as a hidden process of its own, so nothing here waits on a drive. The command
; makes the copy, decides what's kept and writes data\backup-status.ini, which
; is all this reads back. The folder is only ever set through Windows' folder
; picker, so the page never sends a path. A test build never backs up: its data
; is a copy, and the folder set in it is the real one.

LoadBackupSettings() {
    global ASCS_SettingsFile
    global ASCS_BackupsEnabled, ASCS_BackupsTime, ASCS_BackupsFolder

    try ASCS_BackupsTime := ValidateBackupTime(IniRead(ASCS_SettingsFile, "Backups", "Time", "1800"))
    catch as err
        WriteLog("Invalid backup time; using 6:00 PM. " err.Message)
    folder := IniRead(ASCS_SettingsFile, "Backups", "Folder", "")
    if (folder != "") {
        try ASCS_BackupsFolder := CheckBackupsFolder(folder)
        catch as err
            WriteLog("The backups folder in settings can't be used. " err.Message)
    }
    ASCS_BackupsEnabled := ASCS_BackupsFolder != "" && IniRead(ASCS_SettingsFile, "Backups", "Enabled", "0") = "1"
}

; A folder that can hold backups, or an error saying why not. A backup holds
; the secrets file, so only a drive inside this PC will do.
CheckBackupsFolder(folder) {
    folder := ValidateBackupsFolder(folder, A_ScriptDir)
    kind := ""
    try kind := DriveGetType(SubStr(folder, 1, 3))
    if (kind != "Fixed")
        throw Error("Backups must go to a drive inside this PC.")
    return folder
}

BackupsOff() {
    global ASCS_DataDir
    return FileExist(ASCS_DataDir "\test-build.txt") != ""
}

StartBackupSchedule() {
    if BackupsOff()
        return
    SetTimer(CheckBackupDue, 60000)
}

CheckBackupDue(*) {
    global ASCS_BackupsEnabled, ASCS_BackupsTime, ASCS_BackupRun, ASCS_BackupAttempt

    if (!ASCS_BackupsEnabled || IsObject(ASCS_BackupRun))
        return
    status := ReadBackupStatus()
    last := status["time"]
    result := status["result"]
    ; An attempt that left no record (the command never started) still counts.
    if (ASCS_BackupAttempt != "" && (last = "" || ASCS_BackupAttempt > last)) {
        last := ASCS_BackupAttempt
        result := "failed"
    }
    if BackupDue(A_Now, ASCS_BackupsTime, last, result)
        RunBackup()
}

; data\backup-status.ini as the command line wrote it, with anything unexpected
; left out. Read again only when the file has changed.
ReadBackupStatus() {
    global ASCS_DataDir
    static stamp := "", cached := 0

    path := ASCS_DataDir "\backup-status.ini"
    modified := ""
    try modified := FileGetTime(path, "M")
    if (IsObject(cached) && modified = stamp)
        return cached
    status := Map("time", "", "result", "", "detail", "", "goodTime", "")
    if (modified != "") {
        try {
            time := IniRead(path, "Backup", "Time", "")
            good := IniRead(path, "Backup", "GoodTime", "")
            result := IniRead(path, "Backup", "Result", "")
            if RegExMatch(time, "^\d{14}$") && (result = "ok" || result = "failed") {
                status["time"] := time
                status["result"] := result
                status["detail"] := TidyBackupDetail(IniRead(path, "Backup", "Detail", ""))
            }
            if RegExMatch(good, "^\d{14}$")
                status["goodTime"] := good
        } catch as err {
            WriteLog("The backup status could not be read: " err.Message)
        }
    }
    stamp := modified
    cached := status
    return status
}

RunBackup() {
    global ASCS_BackupsFolder, ASCS_BackupRun, ASCS_BackupAttempt, ASCS_BackupFailure

    if (BackupsOff() || IsObject(ASCS_BackupRun) || ASCS_BackupsFolder = "")
        return false
    ASCS_BackupAttempt := A_Now
    ASCS_BackupFailure := ""
    try {
        ; The command works on C:\ASCS unless told where it is; only this child
        ; process is told.
        Critical("On")
        EnvSet("ASCS_REPO", A_ScriptDir)
        try {
            Run('pwsh.exe -NoLogo -NoProfile -NonInteractive -File "' A_ScriptDir '\tools\cli\Maestro-Cli.ps1" backup-data', A_ScriptDir, "Hide", &pid)
        } finally {
            EnvSet("ASCS_REPO")
            Critical("Off")
        }
        ASCS_BackupRun := Map("pid", pid, "started", A_TickCount, "at", ASCS_BackupAttempt)
        SetTimer(PollBackupRun, 1000)
    } catch as err {
        FinishBackupRun("The backup couldn't start: " err.Message)
        return false
    }
    SendBackups()
    return true
}

PollBackupRun(*) {
    global ASCS_BackupRun

    job := ASCS_BackupRun
    if !IsObject(job) {
        SetTimer(PollBackupRun, 0)
        return
    }
    if ProcessExist(job["pid"]) {
        if (A_TickCount - job["started"] < 600000)
            return
        try ProcessClose(job["pid"])
        FinishBackupRun("The backup didn't finish within 10 minutes, so it was stopped.")
        return
    }
    status := ReadBackupStatus()
    if (status["time"] = "" || status["time"] < job["at"])
        FinishBackupRun("The backup ended without saying how it went.")
    else
        FinishBackupRun(status["result"] = "ok" ? "" : status["detail"])
}

; failure is "" when the backup was made.
FinishBackupRun(failure) {
    global ASCS_BackupRun, ASCS_BackupFailure

    SetTimer(PollBackupRun, 0)
    ASCS_BackupRun := 0
    ASCS_BackupFailure := TidyBackupDetail(failure)
    if (failure = "") {
        RecordActivity("system", "Backup made")
        WriteLog("Backup made.")
    } else {
        RecordActivity("error", "Backup failed: " ASCS_BackupFailure)
        WriteLog("Backup failed: " ASCS_BackupFailure)
    }
    SendBackups()
}

SendBackups() {
    global ASCS_BackupsEnabled, ASCS_BackupsTime, ASCS_BackupsFolder
    global ASCS_BackupRun, ASCS_BackupAttempt, ASCS_BackupFailure

    status := ReadBackupStatus()
    time := status["time"]
    result := status["result"]
    detail := status["detail"]
    ; A failure the command line couldn't record itself is this run's to report.
    if (ASCS_BackupFailure != "" && (time = "" || ASCS_BackupAttempt >= time)) {
        time := ASCS_BackupAttempt
        result := "failed"
        detail := ASCS_BackupFailure
    }
    SendToFrontend(
        '{"type":"backups"'
        ',"enabled":' (ASCS_BackupsEnabled ? "true" : "false")
        ',"time":' JsonQuote(ASCS_BackupsTime)
        ',"folder":' JsonQuote(ASCS_BackupsFolder)
        ',"running":' (IsObject(ASCS_BackupRun) ? "true" : "false")
        ',"off":' (BackupsOff() ? "true" : "false")
        ',"lastTime":' JsonQuote(time)
        ',"lastResult":' JsonQuote(result)
        ',"lastDetail":' JsonQuote(detail)
        ',"goodTime":' JsonQuote(status["goodTime"])
        '}'
    )
}

BackupsAnswer(ok, message) {
    SendToFrontend('{"type":"backupsSaved","ok":' (ok ? "true" : "false") ',"message":' JsonQuote(message) '}')
    SendBackups()
}

; content is enabled|HHmm, checked by the caller's pattern and again here.
SaveBackupSettings(content) {
    global ASCS_SettingsFile
    global ASCS_BackupsEnabled, ASCS_BackupsTime, ASCS_BackupsFolder

    try {
        if BackupsOff()
            throw Error("Backups are off in a test build.")
        parts := StrSplit(content, "|")
        if (parts.Length != 2 || (parts[1] != "0" && parts[1] != "1"))
            throw Error("That backup setting wasn't understood.")
        time := ValidateBackupTime(parts[2])
        enabled := parts[1] = "1"
        if (enabled && ASCS_BackupsFolder = "")
            throw Error("Choose a folder for backups first.")
        IniWrite(enabled ? "1" : "0", ASCS_SettingsFile, "Backups", "Enabled")
        IniWrite(time, ASCS_SettingsFile, "Backups", "Time")
        ASCS_BackupsEnabled := enabled
        ASCS_BackupsTime := time
        BackupsAnswer(true, "Saved.")
    } catch as err {
        WriteLog("Backup settings not saved: " err.Message)
        BackupsAnswer(false, err.Message)
    }
}

; The folder comes from Windows' own picker, and is checked before it's kept.
ChooseBackupsFolder(*) {
    global ASCS_App, ASCS_SettingsFile, ASCS_BackupsFolder

    if BackupsOff() {
        BackupsAnswer(false, "Backups are off in a test build.")
        return
    }
    try ASCS_App.Opt("+OwnDialogs")
    picked := DirSelect(ASCS_BackupsFolder != "" ? "*" ASCS_BackupsFolder : "", 3, "Choose a folder for backups, on a drive inside this PC")
    if (picked = "")
        return
    try {
        folder := CheckBackupsFolder(picked)
        IniWrite(folder, ASCS_SettingsFile, "Backups", "Folder")
        ASCS_BackupsFolder := folder
        BackupsAnswer(true, "Saved.")
    } catch as err {
        BackupsAnswer(false, err.Message)
    }
}

BackupNow() {
    global ASCS_BackupsFolder, ASCS_BackupRun

    if BackupsOff()
        BackupsAnswer(false, "Backups are off in a test build.")
    else if (ASCS_BackupsFolder = "")
        BackupsAnswer(false, "Choose a folder for backups first.")
    else if !IsObject(ASCS_BackupRun)
        RunBackup()
}

OpenBackupsFolder() {
    global ASCS_BackupsFolder

    if (ASCS_BackupsFolder != "" && InStr(FileExist(ASCS_BackupsFolder), "D")) {
        try Run('explorer.exe "' ASCS_BackupsFolder '"')
    } else
        ShowNotice(ASCS_BackupsFolder = "" ? "No backups folder is chosen yet." : "The backups folder isn't there yet. It's made by the first backup.")
}
