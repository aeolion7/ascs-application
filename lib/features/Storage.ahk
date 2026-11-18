; Storage (2.9.0): Preferences › Storage shows what Maestro's caches hold,
; sets the RetroAchievements image cache's limit, and clears a cache. Only
; files named like Maestro's own cache files are ever deleted, as the cache
; cap already does (IsRaImageCacheFile, IsAlmanacCacheFile).

LoadStorageSettings() {
    global ASCS_SettingsFile
    mb := "500"
    try mb := IniRead(ASCS_SettingsFile, "Storage", "RaImageCacheMB", "500")
    ApplyRaImageCacheLimit(IsRaImageCacheLimit(mb) ? mb : "500")
}

ApplyRaImageCacheLimit(mb) {
    global ASCS_RaImageCacheMB, ASCS_RaImageCacheLimit, ASCS_RaImageCacheTarget
    ASCS_RaImageCacheMB := Integer(mb)
    ASCS_RaImageCacheLimit := ASCS_RaImageCacheMB * 1024 * 1024
    ASCS_RaImageCacheTarget := RaImageCacheTarget(ASCS_RaImageCacheLimit)
}

; content is one of RaImageCacheLimits(), checked by the caller.
SetRaImageCacheLimit(content) {
    global ASCS_SettingsFile
    try {
        IniWrite(content, ASCS_SettingsFile, "Storage", "RaImageCacheMB")
    } catch as err {
        WriteLog("Image cache limit not saved: " err.Message)
        SendToFrontend('{"type":"storageSaved","ok":false,"message":' JsonQuote("The limit couldn't be saved.") '}')
        return
    }
    ApplyRaImageCacheLimit(content)
    WriteLog("Image cache limit set to " content " MB.")
    PruneRaImageCache()          ; a lower limit applies at once
    SendToFrontend('{"type":"storageSaved","ok":true}')
    SendStorage()
}

; Bytes and files in a folder, counting only the names `isOwn` accepts.
StorageUsage(folder, isOwn) {
    bytes := 0, files := 0
    if !DirExist(folder)
        return Map("bytes", 0, "files", 0)
    Loop Files folder "\*.*", "F" {
        if !isOwn(A_LoopFileName)
            continue
        bytes += A_LoopFileSize
        files++
    }
    return Map("bytes", bytes, "files", files)
}

StorageCacheJson(id, usage, limit := 0) {
    return '{"id":' JsonQuote(id) ',"bytes":' usage["bytes"] ',"files":' usage["files"] (limit ? ',"limit":' limit : "") '}'
}

SendStorage() {
    global ASCS_RaImageFolder, ASCS_AlmanacDir, ASCS_RaImageCacheMB, ASCS_RaImageCacheLimit
    try {
        images := StorageUsage(ASCS_RaImageFolder, IsRaImageCacheFile)
        almanac := StorageUsage(ASCS_AlmanacDir, IsAlmanacCacheFile)
        forecastPath := WeatherCachePath()
        forecast := FileExist(forecastPath) ? Map("bytes", FileGetSize(forecastPath), "files", 1) : Map("bytes", 0, "files", 0)
    } catch as err {
        WriteLog("Storage not read: " err.Message)
        SendToFrontend('{"type":"storage","error":' JsonQuote("Maestro couldn't read its caches.") '}')
        return
    }
    limits := ""
    for value in RaImageCacheLimits()
        limits .= (limits = "" ? "" : ",") value
    SendToFrontend(
        '{"type":"storage","limitMB":' ASCS_RaImageCacheMB
        ',"limits":[' limits ']'
        ',"caches":[' StorageCacheJson("images", images, ASCS_RaImageCacheLimit)
        ',' StorageCacheJson("almanac", almanac)
        ',' StorageCacheJson("forecast", forecast) ']}'
    )
}

; id is checked by the caller (IsStorageCacheId).
ClearStorageCache(id) {
    global ASCS_RaImageFolder, ASCS_AlmanacDir
    removed := 0, failed := 0
    if (id == "forecast") {
        if FileExist(WeatherCachePath()) {
            try {
                FileDelete(WeatherCachePath())
                removed++
            } catch
                failed++
        }
    } else {
        folder := id == "images" ? ASCS_RaImageFolder : ASCS_AlmanacDir
        isOwn := id == "images" ? IsRaImageCacheFile : IsAlmanacCacheFile
        names := []
        if DirExist(folder) {
            Loop Files folder "\*.*", "F" {
                if isOwn(A_LoopFileName)
                    names.Push(A_LoopFileName)
            }
        }
        for name in names {
            try {
                FileDelete(folder "\" name)
                removed++
            } catch
                failed++
        }
    }
    WriteLog("Cleared the " id " cache: " removed " file(s) removed" (failed ? ", " failed " could not be" : "") ".")
    SendToFrontend('{"type":"storageCleared","id":' JsonQuote(id) ',"ok":' (failed ? "false" : "true") '}')
    SendStorage()
}
