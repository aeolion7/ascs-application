; ==========================================
; COMMAND CENTER EXTRAS (2.0.0)
; ==========================================
; What the added Command Center modules need from Windows or the web, asked for
; by the page only while a module shows.
;
; Weather: Open-Meteo's forecast for the almanac's location, at most every 30
; minutes, over HTTPS to one fixed address with redirects off, timeouts and a
; size cap. No account or key, and a User-Agent with no contact details; the
; location goes rounded to two decimals (about a kilometer). The reply is cached
; in data\weather.json and handed to the page as a plain string, which reads
; only the numbers it shows. Off deletes the cache.
;
; Network and Top Apps: Windows' own counters, read without waiting (the
; interface table and each process's times and working set).
;
; The timer: kept here, so its end is told with a toast even while the window is
; hidden.

LoadWeatherSettings() {
    global ASCS_SettingsFile
    global ASCS_WeatherEnabled
    ASCS_WeatherEnabled := IniRead(ASCS_SettingsFile, "Weather", "Enabled", "1") = "1"
}

SendWeatherSettings(message := "") {
    global ASCS_WeatherEnabled
    SendToFrontend('{"type":"weatherSettings","enabled":' (ASCS_WeatherEnabled ? "true" : "false")
        . (message != "" ? ',"message":' JsonQuote(message) : "") '}')
}

WeatherCachePath() {
    global ASCS_DataDir
    return ASCS_DataDir "\weather.json"
}

SetWeather(content) {
    global ASCS_SettingsFile
    global ASCS_WeatherEnabled
    if !(content == "on" || content == "off") {
        WriteLog("Rejected SetWeather payload.")
        return
    }
    ASCS_WeatherEnabled := content == "on"
    try IniWrite(ASCS_WeatherEnabled ? "1" : "0", ASCS_SettingsFile, "Weather", "Enabled")
    if !ASCS_WeatherEnabled
        try FileDelete(WeatherCachePath())
    RecordActivity("system", "Weather turned " content)
    SendWeatherSettings()
    if ASCS_WeatherEnabled
        HandleGetWeather()
}

; The cached forecast if it's fresh, and a fetch if it isn't (sending the old one
; meanwhile, so the module isn't left empty).
HandleGetWeather() {
    global ASCS_WeatherEnabled
    global ASCS_WeatherRequest
    global ASCS_WeatherRetryAt
    global ASCS_AlmanacLatitude
    global ASCS_AlmanacLongitude
    global ASCS_Version

    if !ASCS_WeatherEnabled {
        SendWeatherSettings()
        return
    }
    cache := WeatherCachePath()
    if FileExist(cache) {
        try {
            SendWeather(FileRead(cache, "UTF-8"))
            if (DateDiff(A_Now, FileGetTime(cache, "M"), "Minutes") < 30)
                return
        }
    }
    if (IsObject(ASCS_WeatherRequest) || A_TickCount < ASCS_WeatherRetryAt)
        return
    try {
        request := ComObject("WinHttp.WinHttpRequest.5.1")
        request.Option[6] := false          ; WinHttpRequestOption_EnableRedirects
        request.SetTimeouts(5000, 5000, 10000, 15000)
        request.Open("GET", WeatherUrl(ASCS_AlmanacLatitude, ASCS_AlmanacLongitude), true)
        request.SetRequestHeader("User-Agent", "Maestro/" ASCS_Version " (Aeolionware)")
        request.SetRequestHeader("Accept", "application/json")
        request.Send()
        ASCS_WeatherRequest := Map("request", request, "started", A_TickCount)
        SetTimer(PollWeatherRequest, 250)
    } catch as err {
        WeatherFailed(err.Message)
    }
}

PollWeatherRequest() {
    global ASCS_WeatherRequest
    entry := ASCS_WeatherRequest
    if !IsObject(entry) {
        SetTimer(PollWeatherRequest, 0)
        return
    }
    try {
        request := entry["request"]
        if !request.WaitForResponse(0) {
            if (A_TickCount - entry["started"] > 30000) {
                try request.Abort()
                throw Error("timed out")
            }
            return
        }
        ASCS_WeatherRequest := 0
        SetTimer(PollWeatherRequest, 0)
        if (request.Status != 200)
            throw Error("HTTP " request.Status)
        if !InStr(request.GetResponseHeader("Content-Type"), "application/json")
            throw Error("unexpected content type")
        text := HttpResponseText(request, 200000)
        ; A shape check only; the page parses it strictly.
        if !RegExMatch(text, '^\s*\{[\s\S]*"current"[\s\S]*\}\s*$')
            throw Error("response is not a forecast")
        path := WeatherCachePath()
        try FileDelete(path ".tmp")
        FileAppend(text, path ".tmp", "UTF-8-RAW")
        FileMove(path ".tmp", path, 1)
        SendWeather(text)
    } catch as err {
        ASCS_WeatherRequest := 0
        SetTimer(PollWeatherRequest, 0)
        WeatherFailed(err.Message)
    }
}

WeatherFailed(message) {
    global ASCS_WeatherRetryAt
    ASCS_WeatherRetryAt := A_TickCount + 900000      ; tries again in 15 minutes
    WriteLog("Weather unavailable: " message)
    if !FileExist(WeatherCachePath())
        SendWeatherSettings("The weather service couldn't be reached. Maestro tries again in 15 minutes.")
}

; As a plain string ("WEATHER", then the text), never as script or markup.
SendWeather(text) {
    global ASCS_App
    global ASCS_PageReady
    if !ASCS_PageReady
        return
    try ASCS_App.PostWebMessageAsString("WEATHER`n" text)
    catch as err
        WriteLog("Weather delivery failed: " err.Message)
}

; ---- Network and Top Apps

; content: "network", "processes" or both, comma-separated.
HandleGetHomeStats(content) {
    global ASCS_NetworkSample
    global ASCS_ProcessSample

    parts := StrSplit(content, ",")
    if (!parts.Length || parts.Length > 2) {
        WriteLog("Rejected GetHomeStats payload.")
        return
    }
    json := '{"type":"homeStats"'
    for part in parts {
        if (part == "network") {
            json .= ',"network":' NetworkSpeedJson(&ASCS_NetworkSample)
        } else if (part == "processes") {
            json .= ',"processes":' ProcessUsageJson(&ASCS_ProcessSample)
        } else {
            WriteLog("Rejected GetHomeStats payload.")
            return
        }
    }
    SendToFrontend(json "}")
}

; Bytes a second since the last reading, on the network adapters that are up.
NetworkSpeedJson(&previous) {
    try {
        totals := ReadNetworkTotals()
    } catch as err {
        WriteLog("Network reading failed: " err.Message)
        return "null"
    }
    if (totals["name"] = "")
        return "null"
    sample := Map("time", A_TickCount, "in", totals["in"], "out", totals["out"])
    last := previous
    previous := sample
    if (!IsObject(last) || sample["time"] - last["time"] < 500 || sample["in"] < last["in"] || sample["out"] < last["out"])
        return '{"name":' JsonQuote(totals["name"]) '}'
    seconds := (sample["time"] - last["time"]) / 1000
    return '{"name":' JsonQuote(totals["name"])
        . ',"down":' Round((sample["in"] - last["in"]) / seconds)
        . ',"up":' Round((sample["out"] - last["out"]) / seconds) '}'
}

; The four busiest apps by processor (since the last reading) and by memory,
; each app's processes counted together.
ProcessUsageJson(&previous) {
    try {
        readings := ReadProcessUsage()
    } catch as err {
        WriteLog("App reading failed: " err.Message)
        return "null"
    }
    cores := Max(1, Integer(EnvGet("NUMBER_OF_PROCESSORS") || 1))
    last := previous
    previous := readings
    cpu := Map(), memory := Map()
    for key, reading in readings["processes"] {
        name := reading["name"]
        if (name = "")
            continue
        memory[name] := (memory.Has(name) ? memory[name] : 0) + reading["memory"]
        if (IsObject(last) && last["processes"].Has(key)) {
            used := reading["cpu"] - last["processes"][key]["cpu"]
            if (used > 0)
                cpu[name] := (cpu.Has(name) ? cpu[name] : 0) + used
        }
    }
    elapsed := IsObject(last) ? (readings["time"] - last["time"]) * 10000 * cores : 0     ; ms to 100 ns, on every core
    top(values, scale) {
        list := []
        for name, value in values
            list.Push([name, value * scale])
        sorted := TopEntries(list, 4)
        json := "["
        for index, entry in sorted
            json .= (index > 1 ? "," : "") '{"name":' JsonQuote(SubStr(entry[1], 1, 60)) ',"value":' Round(entry[2], 1) '}'
        return json "]"
    }
    return '{"cpu":' (elapsed > 0 ? top(cpu, 100 / elapsed) : "[]") ',"memory":' top(memory, 1 / 1048576) '}'
}

; ---- The timer

; content: seconds, 1 to a day; 0 cancels.
CountdownTimer(content) {
    global ASCS_TimerEnds
    if !RegExMatch(content, "^\d{1,5}$") || Integer(content) > 86400 {
        WriteLog("Rejected CountdownTimer payload.")
        return
    }
    seconds := Integer(content)
    SetTimer(CountdownTimerDone, 0)
    ASCS_TimerEnds := 0
    if (seconds > 0) {
        ASCS_TimerEnds := A_TickCount + seconds * 1000
        SetTimer(CountdownTimerDone, -seconds * 1000)
    }
}

CountdownTimerDone() {
    global ASCS_TimerEnds
    ASCS_TimerEnds := 0
    ShowNotice("Your timer is done.")
    PlayAscsSound("timer")       ; chosen in Sounds; Windows' notification sound until then
    RecordActivity("system", "Timer finished")
    SendToFrontend('{"type":"timerDone"}')
}
