; ==========================================
; ALMANAC (1.7.0)
; ==========================================
; Moon, sunrise and sunset, the quote of the day and countdowns are worked
; out in the page with no network access. The Wikipedia almanac (on this day,
; observances, featured article) is opt-in: when enabled, ASCS fetches two
; fixed en.wikipedia.org feeds once a day over HTTPS, with redirects off,
; certificate checks on, a size cap and timeouts. The text is cached in
; data\almanac and handed to the page as a plain string, where it is parsed
; defensively and shown as text only. Links are rebuilt here from validated
; article titles; the page never supplies an address.

LoadAlmanacSettings() {
    global ASCS_SettingsFile
    global ASCS_AlmanacWikipedia
    global ASCS_Countdowns

    ASCS_AlmanacWikipedia := IniRead(ASCS_SettingsFile, "Almanac", "Wikipedia", "0") = "1"
    countdowns := []
    try {
        count := Integer(IniRead(ASCS_SettingsFile, "Countdowns", "Count", "0"))
        Loop Min(Max(count, 0), 12) {
            line := IniRead(ASCS_SettingsFile, "Countdowns", "Item" A_Index, "")
            parts := StrSplit(line, "|")
            if (parts.Length = 2)
                countdowns.Push(Map("date", ValidateCountdownDate(parts[1]), "name", ValidateCountdownName(parts[2])))
        }
    } catch as err {
        WriteLog("Invalid countdowns ignored. " err.Message)
    }
    ASCS_Countdowns := countdowns
}

SendAlmanacSettings() {
    global ASCS_AlmanacWikipedia
    global ASCS_Countdowns
    global ASCS_AlmanacPlace
    global ASCS_AlmanacLatitude
    global ASCS_AlmanacLongitude

    ; One-off countdowns go once their day has passed (1.8.0).
    kept := ActiveCountdowns(ASCS_Countdowns, FormatTime(, "yyyy-MM-dd"))
    if (kept.Length != ASCS_Countdowns.Length) {
        try {
            WriteCountdowns(kept)
            WriteLog("Countdowns: removed " (ASCS_Countdowns.Length - kept.Length) " that had passed.")
        } catch as err {
            WriteLog("Countdowns: couldn't remove passed ones. " err.Message)
        }
        ASCS_Countdowns := kept
    }
    items := "["
    for index, item in ASCS_Countdowns
        items .= (index > 1 ? "," : "") '{"date":' JsonQuote(item["date"]) ',"name":' JsonQuote(item["name"]) '}'
    items .= "]"
    SendToFrontend(
        '{"type":"almanac","wikipedia":' (ASCS_AlmanacWikipedia ? "true" : "false")
        ',"place":' JsonQuote(ASCS_AlmanacPlace)
        ',"latitude":' ASCS_AlmanacLatitude ',"longitude":' ASCS_AlmanacLongitude
        ',"countdowns":' items '}'
    )
}

; Page asked for the almanac (start-up, or the Command Center opened):
; settings, today's cached feeds, and a fetch if today's are missing.
HandleGetAlmanac() {
    global ASCS_AlmanacWikipedia

    SendAlmanacSettings()
    if !ASCS_AlmanacWikipedia
        return
    today := FormatTime(, "yyyy-MM-dd")
    for kind in ["featured", "holidays"] {
        path := AlmanacCachePath(kind, today)
        if FileExist(path) {
            try SendAlmanacFeed(kind, FileRead(path, "UTF-8"))
        }
    }
    FetchAlmanacFeeds()
}

SaveAlmanac(content) {
    global ASCS_SettingsFile
    global ASCS_AlmanacWikipedia
    global ASCS_Countdowns

    try {
        almanac := ParseAlmanacPayload(content)
        IniWrite(almanac["wikipedia"] ? "1" : "0", ASCS_SettingsFile, "Almanac", "Wikipedia")
        WriteCountdowns(almanac["countdowns"])

        wasEnabled := ASCS_AlmanacWikipedia
        ASCS_AlmanacWikipedia := almanac["wikipedia"]
        ASCS_Countdowns := almanac["countdowns"]
        if (wasEnabled && !ASCS_AlmanacWikipedia)
            ClearAlmanacCache()
        SendToFrontend('{"type":"almanacSaved","message":"Saved. Countdowns are sorted by date."}')
        RecordActivity("system", "Almanac preferences saved")
        HandleGetAlmanac()
    } catch as err {
        WriteLog("Almanac save failed: " err.Message)
        SendToFrontend('{"type":"error","scope":"almanac","message":' JsonQuote(err.Message) '}')
        SendAlmanacSettings()
    }
}

WriteCountdowns(countdowns) {
    global ASCS_SettingsFile
    try IniDelete(ASCS_SettingsFile, "Countdowns")
    IniWrite(countdowns.Length, ASCS_SettingsFile, "Countdowns", "Count")
    for index, item in countdowns
        IniWrite(item["date"] "|" item["name"], ASCS_SettingsFile, "Countdowns", "Item" index)
}

AlmanacCachePath(kind, date) {
    global ASCS_AlmanacDir
    return ASCS_AlmanacDir "\" date "-" kind ".json"
}

ClearAlmanacCache(keepDate := "") {
    global ASCS_AlmanacDir
    Loop Files ASCS_AlmanacDir "\*.json" {
        if (keepDate = "" || SubStr(A_LoopFileName, 1, 10) != keepDate)
            try FileDelete(A_LoopFileFullPath)
    }
}

AlmanacUserAgent() {
    global ASCS_Version
    ; Names the client, as Wikimedia's API policy asks, without the owner's
    ; email address: the owner's choice in 2.0.0 (one request a day per feed).
    return "Maestro/" ASCS_Version " (Aeolionware)"
}

FetchAlmanacFeeds() {
    global ASCS_AlmanacWikipedia
    global ASCS_AlmanacRequests
    global ASCS_AlmanacRetryAt
    global ASCS_AlmanacDir

    if (!ASCS_AlmanacWikipedia || A_TickCount < ASCS_AlmanacRetryAt)
        return
    today := FormatTime(, "yyyy-MM-dd")
    DirCreate(ASCS_AlmanacDir)
    for kind in ["featured", "holidays"] {
        if (FileExist(AlmanacCachePath(kind, today)) || ASCS_AlmanacRequests.Has(kind))
            continue
        try {
            request := ComObject("WinHttp.WinHttpRequest.5.1")
            request.Option[6] := false          ; WinHttpRequestOption_EnableRedirects
            request.SetTimeouts(5000, 5000, 10000, 15000)
            request.Open("GET", AlmanacFeedUrl(kind, A_YYYY, A_MM, A_DD), true)
            request.SetRequestHeader("User-Agent", AlmanacUserAgent())
            request.SetRequestHeader("Accept", "application/json")
            request.Send()
            ASCS_AlmanacRequests[kind] := Map("request", request, "date", today, "started", A_TickCount)
        } catch as err {
            AlmanacFetchFailed(kind, err.Message)
        }
    }
    if ASCS_AlmanacRequests.Count
        SetTimer(PollAlmanacRequests, 250)
}

PollAlmanacRequests() {
    global ASCS_AlmanacRequests

    for kind in ["featured", "holidays"] {
        if !ASCS_AlmanacRequests.Has(kind)
            continue
        entry := ASCS_AlmanacRequests[kind]
        try {
            if !entry["request"].WaitForResponse(0) {
                if (A_TickCount - entry["started"] > 30000) {
                    try entry["request"].Abort()
                    throw Error("timed out")
                }
                continue
            }
            ASCS_AlmanacRequests.Delete(kind)
            request := entry["request"]
            if (request.Status != 200)
                throw Error("HTTP " request.Status)
            if !InStr(request.GetResponseHeader("Content-Type"), "application/json")
                throw Error("unexpected content type")
            text := AlmanacResponseText(request)
            ; A cheap shape check; the page parses it strictly (JSON.parse) and
            ; a full parse here would stall hotkeys on a 200 KB feed.
            if !RegExMatch(text, "^\s*\{[\s\S]*\}\s*$")
                throw Error("response is not a JSON object")
            path := AlmanacCachePath(kind, entry["date"])
            try FileDelete(path ".tmp")
            FileAppend(text, path ".tmp", "UTF-8-RAW")
            FileMove(path ".tmp", path, 1)
            ClearAlmanacCache(entry["date"])
            SendAlmanacFeed(kind, text)
        } catch as err {
            if ASCS_AlmanacRequests.Has(kind)
                ASCS_AlmanacRequests.Delete(kind)
            AlmanacFetchFailed(kind, err.Message)
        }
    }
    if !ASCS_AlmanacRequests.Count
        SetTimer(PollAlmanacRequests, 0)
}

; Decodes the body as UTF-8 from its raw bytes. WinHttp's ResponseText
; can't decode Wikipedia's Content-Type (it carries a profile parameter
; after the charset), and the byte count is capped before any decoding.
AlmanacResponseText(request) {
    text := HttpResponseText(request, 3000000)
    if (StrLen(text) > 1500000)
        throw Error("response too large")
    return text
}

AlmanacFetchFailed(kind, message) {
    global ASCS_AlmanacRetryAt
    ; Back off for half an hour; the local almanac carries on meanwhile.
    ASCS_AlmanacRetryAt := A_TickCount + 1800000
    WriteLog("Almanac " kind " feed unavailable: " message)
}

; Feeds go to the page as a plain string ("ALMANAC", kind, then the text),
; never as script or markup.
SendAlmanacFeed(kind, text) {
    global ASCS_App
    global ASCS_PageReady
    if !ASCS_PageReady
        return
    try ASCS_App.PostWebMessageAsString("ALMANAC`n" kind "`n" text)
    catch as err
        WriteLog("Almanac delivery failed: " err.Message)
}

OpenWikipedia(title) {
    global ASCS_AlmanacWikipedia
    if !ASCS_AlmanacWikipedia
        return
    try {
        Run(BuildWikipediaUrl(title))
        RecordActivity("search", "Wikipedia: " SubStr(title, 1, 80))
    } catch as err {
        WriteLog("Wikipedia link rejected: " err.Message)
    }
}

