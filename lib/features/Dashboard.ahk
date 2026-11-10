; ==========================================
; SYSTEM DASHBOARD
; ==========================================

PushDashboard(*) {
    global ASCS_HistoryScale
    global ASCS_DashboardErrorShown
    global ASCS_HardwareDue
    global ASCS_HardwareJson
    global ASCS_PendingView

    if !IsDashboardWindowVisible() {
        SetTimer(PushDashboard, 0)
        return
    }

    try {
        ; CPU and RAM come from fast Win32 calls. WMI's
        ; Win32_Processor.LoadPercentage blocks for about one second per query,
        ; which froze the UI and delayed hotkeys in 1.5.0.
        cpuUsage := SampleCpuUsage()

        ReadMemoryStatus(&totalRAM, &freeRAM)

        ramUsage := totalRAM
            ? Round((totalRAM - freeRAM) / totalRAM * 100)
            : 0

        drives := GetDriveMetrics()
        diskUsage := drives["cUsage"]
        diskUsed := drives["cUsed"]
        diskTotal := drives["cTotal"]

        ; The hardware inventory runs in its own process, and goes out only when
        ; due: Live pushes every second, and it hardly ever changes.
        if (ASCS_PendingView = "dashboard" && ASCS_HardwareJson = "")
            SetTimer(CollectHardwareDetails, -50)
        hardwareJson := "null"
        if (ASCS_HardwareDue && ASCS_HardwareJson != "") {
            hardwareJson := ASCS_HardwareJson
            ASCS_HardwareDue := false
        }

        historyJson := MetricHistoryUpdate(&historyTimes)
        json := '{"type":"metrics","cpu":' cpuUsage
            . ',"ram":' ramUsage
            . ',"ramUsed":' Round(totalRAM - freeRAM, 1)
            . ',"ramTotal":' Round(totalRAM, 1)
            . ',"disk":' diskUsage
            . ',"diskUsed":' Round(diskUsed, 1)
            . ',"diskTotal":' Round(diskTotal, 1)
            . ',"hardware":' hardwareJson
            . ',"historyScale":"' ASCS_HistoryScale '"'
            . ',"history":' historyJson
            . ',"historyTimes":' historyTimes
            . ',"drives":' drives["json"] '}'

        SendToFrontend(json)

        ASCS_DashboardErrorShown := false

    } catch as err {
        if !ASCS_DashboardErrorShown {
            WriteLog("Dashboard metrics failed: " err.Message)

            SendToFrontend(
                '{"type":"error","message":"System metrics unavailable."}'
            )

            ASCS_DashboardErrorShown := true
        }
    }
}

; Returns system CPU utilization (0–100) since the previous reading. Readings
; less than 250 ms apart reuse the last value to avoid noise.
SampleCpuUsage() {
    global ASCS_CpuSample
    return ReadCpuUsage(&ASCS_CpuSample)
}

; `sample` holds the last reading, so each caller measures its own stretch: the
; history's second-by-second samples stay their own however often Live reads.
ReadCpuUsage(&sample) {
    idle := 0, kernel := 0, user := 0
    if !DllCall("GetSystemTimes", "Int64*", &idle, "Int64*", &kernel, "Int64*", &user, "Int")
        return IsObject(sample) ? sample["usage"] : 0

    now := A_TickCount
    total := kernel + user   ; kernel time includes idle time
    usage := 0
    if IsObject(sample) {
        if (now - sample["tick"] < 250)
            return sample["usage"]
        totalDelta := total - sample["total"]
        idleDelta := idle - sample["idle"]
        usage := totalDelta > 0
            ? Max(0, Min(100, Round((totalDelta - idleDelta) / totalDelta * 100)))
            : sample["usage"]
    }
    sample := Map("idle", idle, "total", total, "tick", now, "usage", usage)
    return usage
}

; Physical memory in GB (total and available) from GlobalMemoryStatusEx.
ReadMemoryStatus(&totalGB, &freeGB) {
    memory := Buffer(64, 0)
    NumPut("UInt", 64, memory, 0)
    if !DllCall("GlobalMemoryStatusEx", "Ptr", memory, "Int")
        throw Error("GlobalMemoryStatusEx failed.")
    totalGB := NumGet(memory, 8, "UInt64") / 1073741824
    freeGB := NumGet(memory, 16, "UInt64") / 1073741824
}

; Every second, even while Maestro is hidden, so System's graphs are ready when
; it opens: two near-instant system calls a second, and the history is kept in
; memory only (see NewMetricHistory in Core).
SampleMetricHistory(*) {
    global ASCS_HistoryCpuSample
    global ASCS_MetricHistory
    static failed := false

    try {
        cpu := ReadCpuUsage(&ASCS_HistoryCpuSample)
        ReadMemoryStatus(&totalGB, &freeGB)
        ram := totalGB ? (totalGB - freeGB) / totalGB * 100 : 0
        AddMetricSample(ASCS_MetricHistory, cpu, ram)
        failed := false
    } catch as err {
        if !failed
            WriteLog("Metric history sample failed: " err.Message)
        failed := true
    }
}

; The scale on screen goes out only when it has a new point, or when asked for
; again (a page opened, or the scale changed); otherwise null, and the page keeps
; what it has. A day of minutes would otherwise go out every second.
; `times` gets the points' times (Unix seconds) to go with them.
MetricHistoryUpdate(&times) {
    global ASCS_MetricHistory
    global ASCS_HistoryScale
    global ASCS_HistorySentSeq

    times := "null"
    seq := ASCS_MetricHistory["seq"][ASCS_HistoryScale]
    if (seq = ASCS_HistorySentSeq)
        return "null"
    ASCS_HistorySentSeq := seq
    times := MetricHistoryTimesJson(ASCS_MetricHistory, ASCS_HistoryScale)
    return MetricHistoryJson(ASCS_MetricHistory, ASCS_HistoryScale)
}

; The inventory runs in ASCS.HardwareProbe.ahk, so nothing here waits on Windows.
CollectHardwareDetails(*) {
    global ASCS_HardwareJson
    global ASCS_HardwareProbe

    if (ASCS_HardwareJson != "" || IsObject(ASCS_HardwareProbe))
        return
    try {
        probeId := DllCall("GetCurrentProcessId", "UInt") "-" A_TickCount
        Run('"' A_AhkPath '" "' A_ScriptDir '\ASCS.HardwareProbe.ahk" ' probeId,, "Hide", &pid)
        ASCS_HardwareProbe := Map(
            "pid", pid,
            "started", A_TickCount,
            "result", A_ScriptDir "\data\hardware-" probeId ".probe"
        )
        SetTimer(PollHardwareProbe, 250)
    } catch as err {
        WriteLog("Hardware inventory worker could not start: " err.Message)
        FinishHardwareProbe('{"failed":true}')
    }
}

PollHardwareProbe(*) {
    global ASCS_HardwareProbe

    probe := ASCS_HardwareProbe
    if FileExist(probe["result"]) {
        try {
            lines := StrSplit(FileRead(probe["result"], "UTF-8"), "`n")
            if !RegExMatch(lines[1], "^\{.*\}$")
                throw Error("Its result wasn't JSON.")
            for line in lines {
                if (A_Index > 1)
                    WriteLog(line)
            }
            FinishHardwareProbe(lines[1])
        } catch as err {
            WriteLog("Hardware inventory result could not be read: " err.Message)
            FinishHardwareProbe('{"failed":true}')
        }
        try FileDelete(probe["result"])
        return
    }
    if ProcessExist(probe["pid"]) {
        if (A_TickCount - probe["started"] < 20000)
            return
        try ProcessClose(probe["pid"])
    }
    WriteLog("Hardware inventory worker stopped without a result.")
    FinishHardwareProbe('{"failed":true}')
}

; A failure isn't retried this session.
FinishHardwareProbe(json) {
    global ASCS_HardwareDue
    global ASCS_HardwareJson
    global ASCS_HardwareProbe

    SetTimer(PollHardwareProbe, 0)
    ASCS_HardwareProbe := 0
    ASCS_HardwareJson := json
    ASCS_HardwareDue := true
    RequestDashboardPush()
}

GetDriveMetrics() {
    global ASCS_Drives
    global ASCS_DriveCache
    global ASCS_DriveProbes

    drivesJson := "["
    cUsage := 0
    cUsed := 0
    cTotal := 0
    metricIndex := 0

    for drive in ASCS_Drives {
        metricIndex++
        now := A_TickCount

        if !ASCS_DriveCache.Has(drive) {
            ASCS_DriveCache[drive] := Map(
                "checked", now - 30000,
                "metric", OfflineDriveMetric(drive)
            )
        }

        if (!ASCS_DriveProbes.Has(drive)
            && now - ASCS_DriveCache[drive]["checked"] >= 30000)
            StartDriveProbe(drive, now)

        if ASCS_DriveCache.Has(drive) {
            driveMetric := ASCS_DriveCache[drive]["metric"]
        } else {
            driveMetric := OfflineDriveMetric(drive)
        }

        drivesJson .= (metricIndex > 1 ? "," : "")
            . '{"letter":' JsonQuote(driveMetric["letter"])
            . ',"usage":' driveMetric["usage"]
            . ',"used":' driveMetric["used"]
            . ',"total":' driveMetric["total"]
            . ',"online":' (driveMetric["online"] ? "true" : "false") '}'

        if (drive = "C:" && driveMetric["online"]) {
            cUsage := driveMetric["usage"]
            cUsed := driveMetric["used"]
            cTotal := driveMetric["total"]
        }
    }

    drivesJson .= "]"
    return Map(
        "json", drivesJson,
        "cUsage", cUsage,
        "cUsed", cUsed,
        "cTotal", cTotal
    )
}

StartDriveProbe(drive, now) {
    global ASCS_DriveCache
    global ASCS_DriveProbes

    letter := SubStr(drive, 1, 1)
    if !RegExMatch(letter, "i)^[A-Z]$")
        throw Error("Invalid drive letter for metrics probe.")

    probeId := DllCall("GetCurrentProcessId", "UInt") "-" now
    resultPath := A_ScriptDir "\data\drive-" StrUpper(letter)
        . "-" probeId ".probe"
    try {
        if FileExist(resultPath)
            FileDelete(resultPath)

        command := '"' A_AhkPath '" "' A_ScriptDir
            . '\ASCS.DriveProbe.ahk" ' StrUpper(letter) " " probeId
        Run(command,, "Hide", &pid)
        ASCS_DriveCache[drive]["checked"] := now
        ASCS_DriveProbes[drive] := Map(
            "pid", pid,
            "started", now,
            "result", resultPath
        )
        SetTimer(PollDriveProbes, 250)
    } catch as err {
        ASCS_DriveCache[drive] := Map(
            "checked", now,
            "metric", OfflineDriveMetric(drive)
        )
        WriteLog("Drive metrics worker could not start for " drive ": " err.Message)
    }
}

PollDriveProbes(*) {
    global ASCS_DriveCache
    global ASCS_DriveProbes

    now := A_TickCount
    metricsChanged := false
    for drive, probe in ASCS_DriveProbes.Clone() {
        if (now - probe["started"] >= 8000) {
            try {
                if ProcessExist(probe["pid"])
                    ProcessClose(probe["pid"])
            } catch as err {
                WriteLog("Drive metrics worker could not be stopped: " err.Message)
            }
            ASCS_DriveCache[drive] := Map(
                "checked", now,
                "metric", OfflineDriveMetric(drive)
            )
            ASCS_DriveProbes.Delete(drive)
            metricsChanged := true
            WriteLog("Drive metrics probe timed out for " drive ".")
            continue
        }

        if ProcessExist(probe["pid"])
            continue

        resultPath := probe["result"]
        if FileExist(resultPath) {
            try {
                fields := StrSplit(Trim(FileRead(resultPath)), "`n")
                if (fields.Length != 4
                    || !RegExMatch(Trim(fields[1]), "^[01]$")
                    || !RegExMatch(Trim(fields[2]), "^\d+(?:\.\d+)?$")
                    || !RegExMatch(Trim(fields[3]), "^\d+(?:\.\d+)?$")
                    || !RegExMatch(Trim(fields[4]), "^\d+(?:\.\d+)?$"))
                    throw Error("Invalid drive probe response.")

                online := Trim(fields[1]) = "1"
                usage := Min(100, Max(0, Float(Trim(fields[2]))))
                used := Max(0, Float(Trim(fields[3])))
                total := Max(0, Float(Trim(fields[4])))
                metric := online
                    ? Map("letter", drive, "usage", usage, "used", used,
                        "total", total, "online", true)
                    : OfflineDriveMetric(drive)
                ASCS_DriveCache[drive] := Map(
                    "checked", now,
                    "metric", metric
                )
            } catch as err {
                ASCS_DriveCache[drive] := Map(
                    "checked", now,
                    "metric", OfflineDriveMetric(drive)
                )
                WriteLog("Drive metrics probe response failed for " drive ": " err.Message)
            }
            try FileDelete(resultPath)
            metricsChanged := true
        } else {
            ASCS_DriveCache[drive] := Map(
                "checked", now,
                "metric", OfflineDriveMetric(drive)
            )
            WriteLog("Drive metrics worker exited without a result for " drive ".")
            metricsChanged := true
        }
        ASCS_DriveProbes.Delete(drive)
    }

    if !ASCS_DriveProbes.Count
        SetTimer(PollDriveProbes, 0)

    if metricsChanged
        RequestDashboardPush()
}

OfflineDriveMetric(drive) {
    return Map(
        "letter", drive,
        "usage", 0,
        "used", 0,
        "total", 0,
        "online", false
    )
}

