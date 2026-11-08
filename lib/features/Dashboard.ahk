; ==========================================
; SYSTEM DASHBOARD
; ==========================================

PushDashboard(*) {
    global ASCS_DashboardErrorShown
    global ASCS_HardwareJson
    global ASCS_PendingView
    global ASCS_Wmi

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

        ; Hardware inventory (about 0.1–0.5 s of WMI) runs on its own timer
        ; after this push, so the Dashboard renders live metrics first.
        if (ASCS_PendingView = "dashboard" && ASCS_HardwareJson = "")
            SetTimer(CollectHardwareDetails, -50)
        hardwareJson := ASCS_HardwareJson != ""
            ? ASCS_HardwareJson
            : "null"

        json := '{"type":"metrics","cpu":' cpuUsage
            . ',"ram":' ramUsage
            . ',"ramUsed":' Round(totalRAM - freeRAM, 1)
            . ',"ramTotal":' Round(totalRAM, 1)
            . ',"disk":' diskUsage
            . ',"diskUsed":' Round(diskUsed, 1)
            . ',"diskTotal":' Round(diskTotal, 1)
            . ',"hardware":' hardwareJson
            . ',"history":' MetricHistoryJson()
            . ',"drives":' drives["json"] '}'

        SendToFrontend(json)

        ASCS_DashboardErrorShown := false

    } catch as err {
        ASCS_Wmi := 0
        if !ASCS_DashboardErrorShown {
            WriteLog("Dashboard metrics failed: " err.Message)

            SendToFrontend(
                '{"type":"error","message":"System metrics unavailable."}'
            )

            ASCS_DashboardErrorShown := true
        }
    }
}

; Returns system CPU utilization (0–100) since the previous sample. Samples
; taken less than 250 ms apart reuse the last value to avoid noisy readings.
SampleCpuUsage() {
    global ASCS_CpuSample

    idle := 0, kernel := 0, user := 0
    if !DllCall("GetSystemTimes", "Int64*", &idle, "Int64*", &kernel, "Int64*", &user, "Int")
        return IsObject(ASCS_CpuSample) ? ASCS_CpuSample["usage"] : 0

    now := A_TickCount
    total := kernel + user   ; kernel time includes idle time
    usage := 0
    if IsObject(ASCS_CpuSample) {
        if (now - ASCS_CpuSample["tick"] < 250)
            return ASCS_CpuSample["usage"]
        totalDelta := total - ASCS_CpuSample["total"]
        idleDelta := idle - ASCS_CpuSample["idle"]
        usage := totalDelta > 0
            ? Max(0, Min(100, Round((totalDelta - idleDelta) / totalDelta * 100)))
            : ASCS_CpuSample["usage"]
    }
    ASCS_CpuSample := Map("idle", idle, "total", total, "tick", now, "usage", usage)
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

; Every 10 s, even while ASCS is hidden, so the Dashboard's history graphs
; are ready when it opens. Two near-instant system calls per sample; the
; newest 90 samples (15 minutes) are kept in memory only.
SampleMetricHistory(*) {
    global ASCS_MetricHistory
    static failed := false

    try {
        cpu := SampleCpuUsage()
        ReadMemoryStatus(&totalGB, &freeGB)
        ram := totalGB ? Round((totalGB - freeGB) / totalGB * 100) : 0
        ASCS_MetricHistory.Push([cpu, ram])
        while (ASCS_MetricHistory.Length > 90)
            ASCS_MetricHistory.RemoveAt(1)
        failed := false
    } catch as err {
        if !failed
            WriteLog("Metric history sample failed: " err.Message)
        failed := true
    }
}

MetricHistoryJson() {
    global ASCS_MetricHistory

    json := "["
    for index, sample in ASCS_MetricHistory
        json .= (index > 1 ? "," : "") "[" sample[1] "," sample[2] "]"
    return json "]"
}

CollectHardwareDetails(*) {
    global ASCS_HardwareJson
    global ASCS_Wmi

    if (ASCS_HardwareJson != "")
        return
    try {
        if !IsObject(ASCS_Wmi)
            ASCS_Wmi := ComObjGet("winmgmts:\\.\root\cimv2")
        ASCS_HardwareJson := GetHardwareDetails(ASCS_Wmi)
    } catch as err {
        ASCS_Wmi := 0
        ASCS_HardwareJson := "null"   ; do not retry every refresh this session
        WriteLog("Hardware inventory failed: " err.Message)
    }
    RequestDashboardPush()
}

GetHardwareDetails(wmi) {
    processors := QueryHardware(
        wmi,
        "SELECT Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed FROM Win32_Processor",
        "processor"
    )
    systems := QueryHardware(
        wmi,
        "SELECT Manufacturer, Model FROM Win32_ComputerSystem",
        "computer"
    )
    modules := QueryHardware(
        wmi,
        "SELECT Capacity, Speed, ConfiguredClockSpeed FROM Win32_PhysicalMemory",
        "memory"
    )
    graphics := QueryHardware(
        wmi,
        "SELECT Name, AdapterRAM, DriverVersion FROM Win32_VideoController",
        "graphics"
    )
    disks := QueryHardware(
        wmi,
        "SELECT Index, Model, Size, InterfaceType, MediaType, Status FROM Win32_DiskDrive",
        "storage"
    )
    partitions := QueryHardware(
        wmi,
        "SELECT DiskIndex, Index, Size, Type, BootPartition FROM Win32_DiskPartition",
        "partitions"
    )
    volumeLinks := QueryHardware(
        wmi,
        "SELECT Antecedent, Dependent FROM Win32_LogicalDiskToPartition",
        "volume mapping"
    )
    logicalDisks := QueryHardware(
        wmi,
        "SELECT DeviceID, VolumeName, FileSystem, Size, FreeSpace, Status FROM Win32_LogicalDisk",
        "logical volumes"
    )
    baseBoards := QueryHardware(
        wmi,
        "SELECT Manufacturer, Product FROM Win32_BaseBoard",
        "motherboard"
    )
    biosRows := QueryHardware(
        wmi,
        "SELECT Manufacturer, SMBIOSBIOSVersion FROM Win32_BIOS",
        "BIOS"
    )
    operatingSystems := QueryHardware(
        wmi,
        "SELECT Caption, BuildNumber FROM Win32_OperatingSystem",
        "Windows"
    )

    cpu := "Unavailable"
    cores := ""
    if processors.Length {
        cpu := HardwareField(processors[1], "Name")
        if (cpu = "")
            cpu := "Unavailable"
        coreCount := HardwareField(processors[1], "NumberOfCores")
        threadCount := HardwareField(processors[1], "NumberOfLogicalProcessors")
        if (coreCount != "" && threadCount != "")
            cores := coreCount " cores · " threadCount " threads"
        clockSpeed := HardwareField(processors[1], "MaxClockSpeed")
        ; Win32_Processor.MaxClockSpeed reports the rated (base) clock, not
        ; boost. Keep this on one line: AutoHotkey only joins a continuation
        ; line that starts with an operator, so a call on the next line would
        ; silently run as its own discarded statement.
        if RegExMatch(clockSpeed, "^\d+$")
            cores .= (cores != "" ? " · " : "") Round(Integer(clockSpeed) / 1000, 1) " GHz base"
    }

    manufacturer := ""
    model := ""
    if systems.Length {
        manufacturer := HardwareField(systems[1], "Manufacturer")
        model := HardwareField(systems[1], "Model")
    }

    totalMemory := 0
    memorySpeed := 0
    moduleCount := 0
    for module in modules {
        try {
            totalMemory += Integer(module.Capacity)
            moduleCount++
        } catch as err {
            WriteLog("Physical memory detail could not be read: " err.Message)
        }
        speed := HardwareField(module, "ConfiguredClockSpeed")
        if (speed = "")
            speed := HardwareField(module, "Speed")
        if RegExMatch(speed, "^\d+$")
            memorySpeed := Max(memorySpeed, Integer(speed))
    }
    if !totalMemory {
        computers := QueryHardware(
            wmi,
            "SELECT TotalPhysicalMemory FROM Win32_ComputerSystem",
            "total memory"
        )
        if computers.Length {
            try totalMemory := Integer(computers[1].TotalPhysicalMemory)
            catch as err
                WriteLog("Total memory detail could not be read: " err.Message)
        }
    }
    memory := totalMemory
        ? Round(totalMemory / 1073741824, 1) " GB"
        : "Unavailable"
    if (moduleCount && memory != "Unavailable")
        memory .= " · " moduleCount " modules"
    if (memorySpeed && memory != "Unavailable")
        memory .= " · " memorySpeed " MHz"

    gpuNames := []
    gpuDetails := []
    for controller in graphics {
        name := HardwareField(controller, "Name")
        if (name != "") {
            gpuNames.Push(name)
            adapterRAM := HardwareField(controller, "AdapterRAM")
            driverVersion := HardwareField(controller, "DriverVersion")
            details := []
            if RegExMatch(adapterRAM, "^\d+$")
                details.Push(Round(Integer(adapterRAM) / 1073741824, 1) " GB reported memory")
            if (driverVersion != "")
                details.Push("Driver " driverVersion)
            if details.Length
                gpuDetails.Push(JoinArray(details, " · "))
        }
    }
    gpu := gpuNames.Length ? JoinArray(gpuNames, ", ") : "Unavailable"
    gpuDetail := gpuDetails.Length ? JoinArray(gpuDetails, " | ") : ""

    board := "Unavailable"
    if baseBoards.Length {
        boardManufacturer := HardwareField(baseBoards[1], "Manufacturer")
        boardProduct := HardwareField(baseBoards[1], "Product")
        board := Trim(boardManufacturer " " boardProduct)
        if (board = "")
            board := "Unavailable"
    }

    bios := ""
    if biosRows.Length {
        biosManufacturer := HardwareField(biosRows[1], "Manufacturer")
        biosVersion := HardwareField(biosRows[1], "SMBIOSBIOSVersion")
        bios := Trim(biosManufacturer (biosVersion != "" ? " · " biosVersion : ""))
    }

    partitionDetails := Map()
    for partition in partitions {
        diskIndex := HardwareField(partition, "DiskIndex")
        partitionIndex := HardwareField(partition, "Index")
        if (diskIndex = "" || partitionIndex = "")
            continue
        if !partitionDetails.Has(diskIndex)
            partitionDetails[diskIndex] := []
        bootStatus := HardwareField(partition, "BootPartition")
        partitionDetails[diskIndex].Push(Map(
            "size", HardwareNumber(partition, "Size"),
            "type", HardwareField(partition, "Type"),
            "boot", bootStatus = "True" || bootStatus = "1"
        ))
    }

    logicalByLetter := Map()
    for logicalDisk in logicalDisks {
        letter := StrUpper(HardwareField(logicalDisk, "DeviceID"))
        if (letter != "")
            logicalByLetter[letter] := logicalDisk
    }

    volumesByDisk := Map()
    volumeSeenByDisk := Map()
    for link in volumeLinks {
        antecedent := HardwareField(link, "Antecedent")
        dependent := HardwareField(link, "Dependent")
        if (
            !RegExMatch(antecedent, "Disk #(\d+), Partition #(\d+)", &partitionMatch)
            || !RegExMatch(dependent, 'i)DeviceID="([A-Z]:)"', &volumeMatch)
        )
            continue
        diskIndex := partitionMatch[1]
        volumeLetter := StrUpper(volumeMatch[1])
        if !volumesByDisk.Has(diskIndex) {
            volumesByDisk[diskIndex] := []
            volumeSeenByDisk[diskIndex] := Map()
        }
        if !volumeSeenByDisk[diskIndex].Has(volumeLetter) {
            volumeSeenByDisk[diskIndex][volumeLetter] := true
            volumesByDisk[diskIndex].Push(volumeLetter)
        }
    }

    storageJson := "["
    storageCount := 0
    for disk in disks {
        storageCount++
        index := HardwareField(disk, "Index")
        if (index = "" && RegExMatch(HardwareField(disk, "DeviceID"), "i)PHYSICALDRIVE(\d+)", &deviceMatch))
            index := deviceMatch[1]
        model := HardwareField(disk, "Model")
        interfaceType := HardwareField(disk, "InterfaceType")
        mediaType := HardwareField(disk, "MediaType")
        diskStatus := HardwareField(disk, "Status")

        partitionJson := "["
        partitionCount := partitionDetails.Has(index) ? partitionDetails[index].Length : 0
        if (partitionCount) {
            for partition in partitionDetails[index] {
                partitionJson .= (A_Index > 1 ? "," : "")
                    . '{"sizeBytes":' partition["size"]
                    . ',"type":' JsonQuote(partition["type"])
                    . ',"boot":' (partition["boot"] ? "true" : "false") '}'
            }
        }
        partitionJson .= "]"

        volumeJson := "["
        volumeCount := volumesByDisk.Has(index) ? volumesByDisk[index].Length : 0
        if (volumeCount) {
            for volumeLetter in volumesByDisk[index] {
                volume := logicalByLetter.Has(volumeLetter) ? logicalByLetter[volumeLetter] : ""
                volumeName := volume != "" ? HardwareField(volume, "VolumeName") : ""
                fileSystem := volume != "" ? HardwareField(volume, "FileSystem") : ""
                volumeStatus := volume != "" ? HardwareField(volume, "Status") : ""
                size := volume != "" ? HardwareNumber(volume, "Size") : "null"
                free := volume != "" ? HardwareNumber(volume, "FreeSpace") : "null"
                volumeJson .= (A_Index > 1 ? "," : "")
                    . '{"letter":' JsonQuote(volumeLetter)
                    . ',"label":' JsonQuote(volumeName)
                    . ',"fileSystem":' JsonQuote(fileSystem)
                    . ',"status":' JsonQuote(volumeStatus)
                    . ',"sizeBytes":' size
                    . ',"freeBytes":' free '}'
            }
        }
        volumeJson .= "]"

        storageJson .= (storageCount > 1 ? "," : "")
            . '{"model":' JsonQuote(model)
            . ',"sizeBytes":' HardwareNumber(disk, "Size")
            . ',"interfaceType":' JsonQuote(interfaceType)
            . ',"mediaType":' JsonQuote(mediaType)
            . ',"status":' JsonQuote(diskStatus)
            . ',"partitions":' partitionJson
            . ',"volumes":' volumeJson '}'
    }
    storageJson .= "]"

    windows := "Unavailable"
    if operatingSystems.Length {
        caption := HardwareField(operatingSystems[1], "Caption")
        build := HardwareField(operatingSystems[1], "BuildNumber")
        if (caption != "")
            windows := caption (build != "" ? " · Build " build : "")
    }

    return (
        '{"manufacturer":' JsonQuote(manufacturer)
        . ',"model":' JsonQuote(model)
        . ',"cpu":' JsonQuote(cpu)
        . ',"cores":' JsonQuote(cores)
        . ',"gpu":' JsonQuote(gpu)
        . ',"gpuDetail":' JsonQuote(gpuDetail)
        . ',"memory":' JsonQuote(memory)
        . ',"storage":' storageJson
        . ',"board":' JsonQuote(board)
        . ',"bios":' JsonQuote(bios)
        . ',"windows":' JsonQuote(windows) '}'
    )
}

HardwareNumber(item, property) {
    value := HardwareField(item, property)
    return RegExMatch(value, "^\d+$") ? value : "null"
}

QueryHardware(wmi, query, category) {
    rows := []
    try {
        for item in wmi.ExecQuery(query)
            rows.Push(item)
    } catch as err {
        WriteLog("Hardware " category " query failed: " err.Message)
    }
    return rows
}

HardwareField(item, property) {
    try {
        return Trim(String(item.%property%))
    } catch as err {
        WriteLog("Hardware property " property " could not be read: " err.Message)
        return ""
    }
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
        SetTimer(PushDashboard, -1)
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

