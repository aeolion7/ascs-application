; ==========================================
; PALETTE: WINDOWS AND SEARCH (1.6.0)
; ==========================================

SendWindowList() {
    json := "["
    count := 0
    for hwnd in WinGetList() {
        if !IsWorkspaceWindow(hwnd, true)
            continue
        try {
            title := WinGetTitle("ahk_id " hwnd)
            process := WinGetProcessName("ahk_id " hwnd)
            minimized := WinGetMinMax("ahk_id " hwnd) = -1
        } catch {
            continue
        }
        json .= (count ? "," : "")
            . '{"id":"' hwnd '","title":' JsonQuote(title)
            . ',"app":' JsonQuote(RegExReplace(process, "i)\.exe$"))
            . ',"minimized":' (minimized ? "true" : "false") '}'
        count++
        if (count >= 40)
            break
    }
    SendToFrontend('{"type":"windows","items":' json ']}')
}

FocusWindowFromPalette(content) {
    if !RegExMatch(content, "^\d{1,20}$") {
        WriteLog("Rejected invalid window identifier.")
        return
    }
    hwnd := Integer(content)
    if !IsWorkspaceWindow(hwnd, true) {
        NotifyFrontend("That window is no longer open.")
        return
    }
    HandleClose()
    try {
        if (WinGetMinMax("ahk_id " hwnd) = -1)
            WinRestore("ahk_id " hwnd)
        WinActivate("ahk_id " hwnd)
    } catch as err {
        WriteLog("Window focus failed: " err.Message)
    }
}

SearchWeb(query) {
    global ASCS_SearchTemplate

    query := Trim(RegExReplace(query, "[\x00-\x1F]+", " "))
    if (query = "")
        return
    try {
        Run(BuildSearchUrl(ASCS_SearchTemplate, query))
        RecordActivity("search", "Web: " query)
    } catch as err {
        WriteLog("Web search failed: " err.Message)
        NotifyFrontend("Unable to open the web search.")
    }
}

SearchFiles(query) {
    global ASCS_EverythingPath

    query := SanitizeSearchQuery(query)
    if (query = "") {
        LaunchEverything()
        return
    }
    try {
        RunAndActivate(
            '"' ASCS_EverythingPath '" -search "' query '"',
            "ahk_exe Everything.exe"
        )
        RecordActivity("search", "Files: " query)
    } catch as err {
        WriteLog("Everything search failed: " err.Message)
        NotifyFrontend("Unable to open Everything. Check its installation.")
    }
}


