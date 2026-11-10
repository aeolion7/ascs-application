; ==========================================
; HARDWARE INVENTORY
; ==========================================
; Run by ASCS.HardwareProbe.ahk in its own process, never by ASCS itself: the
; monitor and network queries alone take about half a second.

; Everything Windows reports about each component, without serial numbers, owner
; names or network addresses: those are never asked for.
GetHardwareDetails() {
    wmi := ComObjGet("winmgmts:\\.\root\cimv2")
    return JsonObjectOf(
        "processor", HardwareProcessorJson(wmi),
        "graphics", HardwareGraphicsJson(wmi),
        "memory", HardwareMemoryJson(wmi),
        "storage", HardwareStorageJson(wmi),
        "device", HardwareDeviceJson(wmi),
        "board", HardwareBoardJson(wmi),
        "bios", HardwareBiosJson(wmi),
        "windows", HardwareWindowsJson(wmi),
        "displays", HardwareDisplaysJson(),
        "sound", HardwareSoundJson(wmi),
        "network", HardwareNetworkJson()
    )
}

HardwareProcessorJson(wmi) {
    rows := QueryHardware(
        wmi,
        "SELECT Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, SocketDesignation, "
            . "L2CacheSize, L3CacheSize, Architecture, Version, VirtualizationFirmwareEnabled FROM Win32_Processor",
        "processor"
    )
    if !rows.Length
        return "null"
    cpu := rows[1]
    return JsonObjectOf(
        "name", JsonQuote(HardwareText(cpu, "Name")),
        "maker", JsonQuote(ProcessorMakerName(HardwareField(cpu, "Manufacturer"))),
        "cores", HardwareNumber(cpu, "NumberOfCores"),
        "threads", HardwareNumber(cpu, "NumberOfLogicalProcessors"),
        "clockMHz", HardwareNumber(cpu, "MaxClockSpeed"),   ; the rated (base) clock, not boost
        "socket", JsonQuote(HardwareText(cpu, "SocketDesignation")),
        "l2KB", HardwareNumber(cpu, "L2CacheSize"),
        "l3KB", HardwareNumber(cpu, "L3CacheSize"),
        "architecture", JsonQuote(ProcessorArchitectureName(HardwareField(cpu, "Architecture"))),
        "revision", JsonQuote(HardwareText(cpu, "Version")),
        "virtualization", HardwareBool(cpu, "VirtualizationFirmwareEnabled")
    )
}

HardwareGraphicsJson(wmi) {
    rows := QueryHardware(
        wmi,
        "SELECT Name, AdapterCompatibility, AdapterRAM, DriverVersion, DriverDate, CurrentHorizontalResolution, "
            . "CurrentVerticalResolution, CurrentRefreshRate, MinRefreshRate, MaxRefreshRate, CurrentBitsPerPixel "
            . "FROM Win32_VideoController",
        "graphics"
    )
    fromRegistry := GraphicsRegistryDetails()
    json := "["
    count := 0
    for gpu in rows {
        name := HardwareText(gpu, "Name")
        if (name = "")
            continue
        details := fromRegistry.Has(name) ? fromRegistry[name] : Map("memory", "null", "vbios", "")
        memory := details["memory"]
        ; AdapterRAM is 32 bits, so it stops at 4 GB: below that it's still true.
        adapterRam := HardwareNumber(gpu, "AdapterRAM")
        if (memory = "null" && adapterRam != "null" && Number(adapterRam) < 4293918720)
            memory := adapterRam
        count++
        json .= (count > 1 ? "," : "") JsonObjectOf(
            "name", JsonQuote(name),
            "maker", JsonQuote(HardwareText(gpu, "AdapterCompatibility")),
            "memoryBytes", memory,
            "vbios", JsonQuote(details["vbios"]),
            "driver", JsonQuote(HardwareText(gpu, "DriverVersion")),
            "driverDate", JsonQuote(CimDateIso(HardwareField(gpu, "DriverDate"))),
            "width", HardwareNumber(gpu, "CurrentHorizontalResolution"),
            "height", HardwareNumber(gpu, "CurrentVerticalResolution"),
            "refresh", HardwareNumber(gpu, "CurrentRefreshRate"),
            "minRefresh", HardwareNumber(gpu, "MinRefreshRate"),
            "maxRefresh", HardwareNumber(gpu, "MaxRefreshRate"),
            "bits", HardwareNumber(gpu, "CurrentBitsPerPixel")
        )
    }
    return json "]"
}

; The true video memory and the card's BIOS version, kept by the display driver
; and keyed by the card's name. Display adapters' device class:
GraphicsRegistryDetails() {
    static classKey := "SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"
    details := Map()
    try {
        Loop Reg, "HKLM\" classKey, "K" {
            if !RegExMatch(A_LoopRegName, "^\d+$")
                continue
            subKey := classKey "\" A_LoopRegName
            name := ""
            try name := RegRead("HKLM\" subKey, "DriverDesc")
            if (name = "" || details.Has(name))
                continue
            vbios := ""
            try vbios := RegExReplace(String(RegRead("HKLM\" subKey, "HardwareInformation.BiosString")), "i)^Version")
            details[name] := Map("memory", ReadRegistryQword(subKey, "HardwareInformation.qwMemorySize"), "vbios", vbios)
        }
    } catch as err {
        WriteLog("Graphics details could not be read: " err.Message)
    }
    return details
}

; A 64-bit value under HKLM as text, or "null". RegRead can't read REG_QWORD.
ReadRegistryQword(subKey, valueName) {
    static HKEY_LOCAL_MACHINE := -2147483646, RRF_RT_REG_QWORD := 0x40
    value := Buffer(8, 0)
    size := 8
    status := DllCall("advapi32\RegGetValueW", "Ptr", HKEY_LOCAL_MACHINE, "Str", subKey, "Str", valueName
        , "UInt", RRF_RT_REG_QWORD, "Ptr", 0, "Ptr", value, "UInt*", &size, "Int")
    return status = 0 ? String(NumGet(value, 0, "Int64")) : "null"
}

HardwareMemoryJson(wmi) {
    modules := QueryHardware(
        wmi,
        "SELECT Capacity, Speed, ConfiguredClockSpeed, ConfiguredVoltage, SMBIOSMemoryType, FormFactor, BankLabel, "
            . "DeviceLocator, Manufacturer, PartNumber, DataWidth FROM Win32_PhysicalMemory",
        "memory"
    )
    arrays := QueryHardware(wmi, "SELECT MemoryDevices, MaxCapacityEx FROM Win32_PhysicalMemoryArray", "memory slots")

    total := 0
    json := "["
    for module in modules {
        size := HardwareNumber(module, "Capacity")
        if (size != "null")
            total += Integer(size)
        json .= (A_Index > 1 ? "," : "") JsonObjectOf(
            "sizeBytes", size,
            "type", JsonQuote(MemoryTypeName(HardwareField(module, "SMBIOSMemoryType"))),
            "form", JsonQuote(MemoryFormName(HardwareField(module, "FormFactor"))),
            "ratedMHz", HardwareNumber(module, "Speed"),
            "runningMHz", HardwareNumber(module, "ConfiguredClockSpeed"),
            "voltageMV", HardwareNumber(module, "ConfiguredVoltage"),
            "bank", JsonQuote(HardwareText(module, "BankLabel")),
            "slot", JsonQuote(HardwareText(module, "DeviceLocator")),
            "maker", JsonQuote(HardwareText(module, "Manufacturer")),
            "part", JsonQuote(HardwareText(module, "PartNumber")),
            "widthBits", HardwareNumber(module, "DataWidth")
        )
    }
    json .= "]"

    if !total {
        computers := QueryHardware(wmi, "SELECT TotalPhysicalMemory FROM Win32_ComputerSystem", "total memory")
        if computers.Length {
            size := HardwareNumber(computers[1], "TotalPhysicalMemory")
            total := size != "null" ? Integer(size) : 0
        }
    }

    slots := "null"
    maxBytes := "null"
    if arrays.Length {
        slots := HardwareNumber(arrays[1], "MemoryDevices")
        maxKB := HardwareNumber(arrays[1], "MaxCapacityEx")
        maxBytes := maxKB != "null" ? String(Integer(maxKB) * 1024) : "null"
    }
    return JsonObjectOf(
        "totalBytes", total ? total : "null",
        "slots", slots,
        "maxBytes", maxBytes,
        "modules", json
    )
}

; Win32_DiskDrive lists the drives and MSFT_PhysicalDisk says what they really
; are; MSFT_Partition also lists the partitions Win32_DiskPartition leaves out.
HardwareStorageJson(wmi) {
    disks := QueryHardware(wmi, "SELECT Index, Model, Size, InterfaceType, Status, FirmwareRevision FROM Win32_DiskDrive", "storage")
    logicalDisks := QueryHardware(wmi, "SELECT DeviceID, VolumeName, FileSystem FROM Win32_LogicalDisk", "volumes")
    volumes := Map()
    for volume in logicalDisks
        volumes[StrUpper(HardwareField(volume, "DeviceID"))] := volume

    physical := Map()
    partitionsByDisk := Map()
    try {
        storage := ComObjGet("winmgmts:\\.\root\Microsoft\Windows\Storage")
        for row in QueryHardware(storage, "SELECT DeviceId, BusType, MediaType, HealthStatus, LogicalSectorSize, PhysicalSectorSize FROM MSFT_PhysicalDisk", "physical disks")
            physical[HardwareField(row, "DeviceId")] := row
        for row in QueryHardware(storage, "SELECT DiskNumber, PartitionNumber, Size, GptType, DriveLetter, IsBoot, IsSystem FROM MSFT_Partition", "partitions") {
            disk := HardwareField(row, "DiskNumber")
            if !partitionsByDisk.Has(disk)
                partitionsByDisk[disk] := []
            partitionsByDisk[disk].Push(row)
        }
    } catch as err {
        WriteLog("Storage details could not be read: " err.Message)
    }

    json := "["
    for disk in disks {
        index := HardwareField(disk, "Index")
        details := physical.Has(index) ? physical[index] : ""
        bus := details != "" ? DiskBusName(HardwareField(details, "BusType")) : ""
        partitionJson := "["
        if partitionsByDisk.Has(index) {
            for partition in partitionsByDisk[index]
                partitionJson .= (A_Index > 1 ? "," : "") HardwarePartitionJson(partition, volumes)
        }
        json .= (A_Index > 1 ? "," : "") JsonObjectOf(
            "model", JsonQuote(HardwareText(disk, "Model")),
            "sizeBytes", HardwareNumber(disk, "Size"),
            "bus", JsonQuote(bus != "" ? bus : HardwareText(disk, "InterfaceType")),
            "media", JsonQuote(details != "" ? DiskMediaName(HardwareField(details, "MediaType")) : ""),
            "health", JsonQuote(details != "" ? DiskHealthName(HardwareField(details, "HealthStatus")) : HardwareText(disk, "Status")),
            "firmware", JsonQuote(HardwareText(disk, "FirmwareRevision")),
            "logicalSector", details != "" ? HardwareNumber(details, "LogicalSectorSize") : "null",
            "physicalSector", details != "" ? HardwareNumber(details, "PhysicalSectorSize") : "null",
            "partitions", partitionJson "]"
        )
    }
    return json "]"
}

HardwarePartitionJson(partition, volumes) {
    code := HardwareField(partition, "DriveLetter")
    letter := RegExMatch(code, "^[1-9]\d*$") ? Chr(Integer(code)) ":" : ""
    volume := volumes.Has(letter) ? volumes[letter] : ""
    return JsonObjectOf(
        "number", HardwareNumber(partition, "PartitionNumber"),
        "sizeBytes", HardwareNumber(partition, "Size"),
        "kind", JsonQuote(PartitionKindName(HardwareField(partition, "GptType"), HardwareBool(partition, "IsSystem") = "true")),
        "letter", JsonQuote(letter),
        "label", JsonQuote(volume != "" ? HardwareField(volume, "VolumeName") : ""),
        "fileSystem", JsonQuote(volume != "" ? HardwareField(volume, "FileSystem") : ""),
        "windows", HardwareBool(partition, "IsBoot")
    )
}

HardwareDeviceJson(wmi) {
    rows := QueryHardware(wmi, "SELECT Manufacturer, Model, SystemFamily, SystemType, PCSystemType, Name FROM Win32_ComputerSystem", "computer")
    if !rows.Length
        return "null"
    return JsonObjectOf(
        "maker", JsonQuote(HardwareText(rows[1], "Manufacturer")),
        "model", JsonQuote(HardwareText(rows[1], "Model")),
        "family", JsonQuote(HardwareText(rows[1], "SystemFamily")),
        "kind", JsonQuote(ComputerKindName(HardwareField(rows[1], "PCSystemType"))),
        "systemType", JsonQuote(HardwareText(rows[1], "SystemType")),
        "name", JsonQuote(HardwareField(rows[1], "Name"))
    )
}

HardwareBoardJson(wmi) {
    rows := QueryHardware(wmi, "SELECT Manufacturer, Product, Version FROM Win32_BaseBoard", "motherboard")
    if !rows.Length
        return "null"
    return JsonObjectOf(
        "maker", JsonQuote(HardwareText(rows[1], "Manufacturer")),
        "product", JsonQuote(HardwareText(rows[1], "Product")),
        "version", JsonQuote(HardwareText(rows[1], "Version"))
    )
}

HardwareBiosJson(wmi) {
    rows := QueryHardware(wmi, "SELECT Manufacturer, SMBIOSBIOSVersion, ReleaseDate, SMBIOSMajorVersion, SMBIOSMinorVersion FROM Win32_BIOS", "BIOS")
    if !rows.Length
        return "null"
    major := HardwareField(rows[1], "SMBIOSMajorVersion")
    minor := HardwareField(rows[1], "SMBIOSMinorVersion")
    secureBoot := "null"
    try secureBoot := RegRead("HKLM\SYSTEM\CurrentControlSet\Control\SecureBoot\State", "UEFISecureBootEnabled") ? "true" : "false"
    return JsonObjectOf(
        "maker", JsonQuote(HardwareText(rows[1], "Manufacturer")),
        "version", JsonQuote(HardwareText(rows[1], "SMBIOSBIOSVersion")),
        "date", JsonQuote(CimDateIso(HardwareField(rows[1], "ReleaseDate"))),
        "smbios", JsonQuote(major != "" && minor != "" ? major "." minor : ""),
        "secureBoot", secureBoot
    )
}

HardwareWindowsJson(wmi) {
    rows := QueryHardware(wmi, "SELECT Caption, BuildNumber, OSArchitecture, InstallDate, LastBootUpTime FROM Win32_OperatingSystem", "Windows")
    if !rows.Length
        return "null"
    static versionKey := "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion"
    version := ""
    update := ""
    try version := RegRead(versionKey, "DisplayVersion")
    try update := RegRead(versionKey, "UBR")
    build := HardwareField(rows[1], "BuildNumber")
    return JsonObjectOf(
        "edition", JsonQuote(RegExReplace(HardwareField(rows[1], "Caption"), "^Microsoft\s+")),
        "version", JsonQuote(version),
        "build", JsonQuote(build != "" && update != "" ? build "." update : build),
        "architecture", JsonQuote(HardwareField(rows[1], "OSArchitecture")),
        "installed", JsonQuote(CimDateIso(HardwareField(rows[1], "InstallDate"))),
        "started", JsonQuote(CimDateIso(HardwareField(rows[1], "LastBootUpTime")))
    )
}

; Monitors, from what each one reports about itself. WmiMonitorID's serial number
; isn't asked for. InstanceName only pairs up the three queries.
HardwareDisplaysJson() {
    try {
        wmi := ComObjGet("winmgmts:\\.\root\wmi")
    } catch as err {
        WriteLog("Display details could not be read: " err.Message)
        return "[]"
    }
    sizes := Map()
    for row in QueryHardware(wmi, "SELECT InstanceName, MaxHorizontalImageSize, MaxVerticalImageSize FROM WmiMonitorBasicDisplayParams", "display sizes")
        sizes[HardwareField(row, "InstanceName")] := row
    outputs := Map()
    for row in QueryHardware(wmi, "SELECT InstanceName, VideoOutputTechnology FROM WmiMonitorConnectionParams", "display connections")
        outputs[HardwareField(row, "InstanceName")] := row

    json := "["
    for monitor in QueryHardware(wmi, "SELECT InstanceName, UserFriendlyName, ManufacturerName, ProductCodeID, YearOfManufacture, WeekOfManufacture FROM WmiMonitorID", "displays") {
        instance := HardwareField(monitor, "InstanceName")
        size := sizes.Has(instance) ? sizes[instance] : ""
        output := outputs.Has(instance) ? outputs[instance] : ""
        json .= (A_Index > 1 ? "," : "") JsonObjectOf(
            "name", JsonQuote(CleanHardwareText(HardwareCodesText(monitor, "UserFriendlyName"))),
            "maker", JsonQuote(MonitorMakerName(HardwareCodesText(monitor, "ManufacturerName"))),
            "product", JsonQuote(CleanHardwareText(HardwareCodesText(monitor, "ProductCodeID"))),
            "year", HardwareNumber(monitor, "YearOfManufacture"),
            "week", HardwareNumber(monitor, "WeekOfManufacture"),
            "widthCm", size != "" ? HardwareNumber(size, "MaxHorizontalImageSize") : "null",
            "heightCm", size != "" ? HardwareNumber(size, "MaxVerticalImageSize") : "null",
            "connection", JsonQuote(output != "" ? DisplayConnectionName(HardwareField(output, "VideoOutputTechnology")) : "")
        )
    }
    return json "]"
}

; Physical sound devices. Software ones, such as a virtual audio device, are left
; out, as virtual network adapters are.
HardwareSoundJson(wmi) {
    json := "["
    count := 0
    for device in QueryHardware(wmi, "SELECT Name, Manufacturer, Status, PNPDeviceID FROM Win32_SoundDevice", "sound") {
        deviceId := HardwareField(device, "PNPDeviceID")
        if IsSoftwareDeviceId(deviceId)
            continue
        count++
        json .= (count > 1 ? "," : "") JsonObjectOf(
            "name", JsonQuote(HardwareText(device, "Name")),
            "maker", JsonQuote(RegExReplace(HardwareText(device, "Manufacturer"), "^\((.*)\)$", "$1")),
            "bus", JsonQuote(SoundBusName(deviceId)),
            "status", JsonQuote(HardwareText(device, "Status"))
        )
    }
    return json "]"
}

; Physical network adapters. Addresses, and link state and speed, aren't asked
; for: the first identify you, and the others change while this stays the same.
HardwareNetworkJson() {
    try {
        wmi := ComObjGet("winmgmts:\\.\root\StandardCimv2")
    } catch as err {
        WriteLog("Network details could not be read: " err.Message)
        return "[]"
    }
    json := "["
    count := 0
    for adapter in QueryHardware(wmi, "SELECT Name, InterfaceDescription, DriverVersionString, DriverDate, DriverProvider, NdisPhysicalMedium, Virtual, HardwareInterface FROM MSFT_NetAdapter", "network") {
        if (HardwareBool(adapter, "Virtual") = "true" || HardwareBool(adapter, "HardwareInterface") = "false")
            continue
        count++
        json .= (count > 1 ? "," : "") JsonObjectOf(
            "name", JsonQuote(HardwareText(adapter, "InterfaceDescription")),
            "windowsName", JsonQuote(HardwareText(adapter, "Name")),
            "kind", JsonQuote(NetworkKindName(HardwareField(adapter, "NdisPhysicalMedium"))),
            "driverMaker", JsonQuote(HardwareText(adapter, "DriverProvider")),
            "driver", JsonQuote(HardwareText(adapter, "DriverVersionString")),
            "driverDate", JsonQuote(CimDateIso(HardwareField(adapter, "DriverDate")))
        )
    }
    return json "]"
}

; WmiMonitorID's names are arrays of character codes, padded with zeros.
HardwareCodesText(item, property) {
    text := ""
    try {
        for code in item.%property% {
            if code
                text .= Chr(code)
        }
    } catch as err {
        WriteLog("Hardware property " property " could not be read: " err.Message)
    }
    return text
}

; A value for showing: empty if it's only a board maker's placeholder.
HardwareText(item, property) {
    return CleanHardwareText(HardwareField(item, property))
}

; "true", "false", or "null" if Windows doesn't say.
HardwareBool(item, property) {
    value := HardwareField(item, property)
    if (value = "")
        return "null"
    return (value = "True" || value = "1" || value = "-1") ? "true" : "false"
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
