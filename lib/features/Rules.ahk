; ==========================================
; LAUNCH RULES (1.10.0)
; ==========================================

; "Remember where it goes": when an app opens its first main window within
; 15 seconds of starting, ASCS puts it where its rule says (monitor, position
; or maximized, and desktop). Rules only move windows; they never start
; anything. They live in data\rules.ini (at most 50), are checked when saved
; and when read, and are keyed by the app's full path. One shell hook
; (RegisterShellHookWindow) says when windows are created; nothing polls.

LoadLaunchRules() {
    global ASCS_RulesFile, ASCS_LaunchRules
    rules := Map()
    if FileExist(ASCS_RulesFile) {
        count := WorkspaceInteger(IniRead(ASCS_RulesFile, "Rules", "Count", "0"), 0)
        Loop Min(Max(count, 0), 50) {
            section := "Rule" A_Index
            try {
                path := ValidateRulePath(IniRead(ASCS_RulesFile, section, "path", ""))
                rules[StrLower(path)] := Map(
                    "path", path,
                    "process", RegExReplace(path, ".*\\"),
                    "enabled", IniRead(ASCS_RulesFile, section, "enabled", "1") = "1",
                    "monitor", Max(1, WorkspaceInteger(IniRead(ASCS_RulesFile, section, "monitor", "1"), 1)),
                    "x", Float(WorkspaceFraction(IniRead(ASCS_RulesFile, section, "x", "0"))),
                    "y", Float(WorkspaceFraction(IniRead(ASCS_RulesFile, section, "y", "0"))),
                    "width", Float(WorkspaceFraction(IniRead(ASCS_RulesFile, section, "width", "0.5"))),
                    "height", Float(WorkspaceFraction(IniRead(ASCS_RulesFile, section, "height", "0.5"))),
                    "maximized", IniRead(ASCS_RulesFile, section, "maximized", "0") = "1",
                    "desktop", WorkspaceInteger(IniRead(ASCS_RulesFile, section, "desktop", "-2"), -2),
                    "desktopName", SubStr(IniRead(ASCS_RulesFile, section, "desktopName", ""), 1, 60),
                    "pinned", IniRead(ASCS_RulesFile, section, "pinned", "0") = "1"
                )
            } catch as err {
                WriteLog("Launch rules: skipped " section ": " err.Message)
            }
        }
    }
    ASCS_LaunchRules := rules
}

SaveLaunchRules() {
    global ASCS_RulesFile, ASCS_LaunchRules
    temp := ASCS_RulesFile ".tmp"
    try FileDelete(temp)
    IniWrite(ASCS_LaunchRules.Count, temp, "Rules", "Count")
    index := 0
    for key, rule in ASCS_LaunchRules {
        index++
        for name in ["path", "monitor", "x", "y", "width", "height", "desktop", "desktopName"]
            IniWrite(rule[name], temp, "Rule" index, name)
        for name in ["enabled", "maximized", "pinned"]
            IniWrite(rule[name] ? 1 : 0, temp, "Rule" index, name)
    }
    FileMove(temp, ASCS_RulesFile, 1)
}

SendLaunchRules() {
    global ASCS_LaunchRules
    json := ""
    for key, rule in ASCS_LaunchRules {
        json .= (json = "" ? "" : ",") '{"path":' JsonQuote(rule["path"])
            . ',"app":' JsonQuote(RegExReplace(rule["process"], "i)\.exe$"))
            . ',"enabled":' (rule["enabled"] ? "true" : "false")
            . ',"monitor":' rule["monitor"]
            . ',"x":' Format("{:.4f}", rule["x"]) ',"y":' Format("{:.4f}", rule["y"])
            . ',"width":' Format("{:.4f}", rule["width"]) ',"height":' Format("{:.4f}", rule["height"])
            . ',"maximized":' (rule["maximized"] ? "true" : "false")
            . ',"desktop":' rule["desktop"] ',"desktopName":' JsonQuote(rule["desktopName"])
            . ',"pinned":' (rule["pinned"] ? "true" : "false") '}'
    }
    SendToFrontend('{"type":"launchRules","items":[' json ']}')
}

; Adds or replaces an app's rule (one per app path, at most 50).
StoreLaunchRule(rule) {
    global ASCS_LaunchRules
    key := StrLower(rule["path"])
    if (!ASCS_LaunchRules.Has(key) && ASCS_LaunchRules.Count >= 50)
        throw Error("There are 50 rules already; delete one first.")
    ASCS_LaunchRules[key] := rule
    SaveLaunchRules()
    app := RegExReplace(rule["process"], "i)\.exe$")
    RecordActivity("workspace", "Launch rule for " app)
    NotifyFrontend(app " will open there from now on.")
}

; Payload: a window handle from the open-window list. Its app, monitor,
; visible frame (or maximized) and desktop become that app's rule.
RememberWindowRule(content) {
    try {
        if !RegExMatch(content, "^\d{1,20}\z")
            throw Error("That isn't a window.")
        hwnd := Integer(content)
        DetectHiddenWindows(true)                ; it may be on another desktop
        if !IsWorkspaceWindow(hwnd, true, true)
            throw Error("That window is no longer open.")
        windowTitle := "ahk_id " hwnd
        if (WinGetMinMax(windowTitle) = -1)
            throw Error("It's minimized: restore it where you want it first.")
        path := ValidateRulePath(WinGetProcessPath(windowTitle))
        WinGetPos(&x, &y, &width, &height, windowTitle)
        context := GetWindowPlacementContext(hwnd)
        x += context["leftInset"], y += context["topInset"]
        width -= context["leftInset"] + context["rightInset"]
        height -= context["topInset"] + context["bottomInset"]
        workWidth := Max(1, context["workRight"] - context["workLeft"])
        workHeight := Max(1, context["workBottom"] - context["workTop"])
        pinned := DesktopsAvailable() && WindowPinned(hwnd)
        desktop := DesktopsAvailable() ? (pinned ? -1 : WindowDesktop(hwnd)) : -2
        StoreLaunchRule(Map(
            "path", path,
            "process", RegExReplace(path, ".*\\"),
            "enabled", true,
            "monitor", context["monitor"],
            "x", Round((x - context["workLeft"]) / workWidth, 4),
            "y", Round((y - context["workTop"]) / workHeight, 4),
            "width", Round(width / workWidth, 4),
            "height", Round(height / workHeight, 4),
            "maximized", WinGetMinMax(windowTitle) = 1
                || WorkspaceFillsMonitor((x - context["workLeft"]) / workWidth, (y - context["workTop"]) / workHeight, width / workWidth, height / workHeight),
            "desktop", desktop,
            "desktopName", desktop >= 0 ? DesktopName(desktop) : "",
            "pinned", pinned
        ))
    } catch as err {
        NotifyFrontend("Not remembered: " err.Message)
    }
    SendLaunchRules()
}

; Payload: "name|index". A saved window's place becomes its app's rule. The
; app's path comes from the workspace file, never from the page.
RuleFromWorkspaceWindow(content) {
    try {
        ref := ParseWorkspaceWindowRef(content)
        source := GetWorkspacePath(ref["name"])
        section := SavedWorkspaceWindow(source, ref["index"])
        path := ValidateRulePath(IniRead(source, section, "path", ""))
        pinned := IniRead(source, section, "pinned", "0") = "1"
        desktop := WorkspaceInteger(IniRead(source, section, "desktop", "-2"), -2)
        StoreLaunchRule(Map(
            "path", path,
            "process", RegExReplace(path, ".*\\"),
            "enabled", true,
            "monitor", Max(1, WorkspaceInteger(IniRead(source, section, "monitor", "1"), 1)),
            "x", Round(Float(WorkspaceFraction(IniRead(source, section, "x", "0"))), 4),
            "y", Round(Float(WorkspaceFraction(IniRead(source, section, "y", "0"))), 4),
            "width", Round(Float(WorkspaceFraction(IniRead(source, section, "width", "0.5"))), 4),
            "height", Round(Float(WorkspaceFraction(IniRead(source, section, "height", "0.5"))), 4),
            "maximized", SavedWindowMaximized(source, section),
            "desktop", pinned ? -1 : desktop,
            "desktopName", desktop >= 0 ? SubStr(IniRead(source, "Desktops", desktop, ""), 1, 60) : "",
            "pinned", pinned
        ))
    } catch as err {
        NotifyFrontend("Not remembered: " err.Message)
    }
    SendLaunchRules()
}

; Payload: "1|path" or "0|path".
SetLaunchRuleEnabled(content) {
    global ASCS_LaunchRules
    try {
        parts := StrSplit(content, "|", , 2)
        if (parts.Length != 2 || !(parts[1] = "0" || parts[1] = "1"))
            throw Error("Malformed request.")
        key := StrLower(ValidateRulePath(parts[2]))
        if !ASCS_LaunchRules.Has(key)
            throw Error("That rule isn't there any more.")
        ASCS_LaunchRules[key]["enabled"] := parts[1] = "1"
        SaveLaunchRules()
    } catch as err {
        NotifyFrontend("Not changed: " err.Message)
    }
    SendLaunchRules()
}

DeleteLaunchRule(content) {
    global ASCS_LaunchRules
    try {
        key := StrLower(ValidateRulePath(content))
        if ASCS_LaunchRules.Has(key) {
            ASCS_LaunchRules.Delete(key)
            SaveLaunchRules()
        }
    } catch as err {
        NotifyFrontend("Not deleted: " err.Message)
    }
    SendLaunchRules()
}

; ---- applying rules

StartLaunchRules() {
    LoadLaunchRules()
    try {
        DllCall("RegisterShellHookWindow", "Ptr", A_ScriptHwnd)
        OnMessage(DllCall("RegisterWindowMessage", "Str", "SHELLHOOK", "UInt"), OnShellHookMessage)
    } catch as err {
        WriteLog("Launch rules: the shell hook couldn't be set up: " err.Message)
    }
}

OnShellHookMessage(wParam, lParam, msg, hwnd) {
    global ASCS_LaunchRules
    ; HSHELL_WINDOWCREATED; the window is looked at a moment later, once it
    ; has a title and a size.
    if ((wParam & 0x7FFF) = 1 && ASCS_LaunchRules.Count)
        SetTimer(ApplyLaunchRule.Bind(lParam, 0), -300)
}

ApplyLaunchRule(hwnd, attempt) {
    global ASCS_LaunchRules, ASCS_RuleAppliedPids
    try {
        windowTitle := "ahk_id " hwnd
        if !WinExist(windowTitle)
            return
        key := StrLower(WinGetProcessPath(windowTitle))
        if !ASCS_LaunchRules.Has(key) || !ASCS_LaunchRules[key]["enabled"]
            return
        pid := WinGetPID(windowTitle)
        if ASCS_RuleAppliedPids.Has(pid)
            return                              ; only the app's first window
        age := ProcessAgeMs(pid)
        if (age < 0 || age > 15000)
            return                              ; not just started: left alone
        if !IsWorkspaceWindow(hwnd) {
            ; Not a main window yet (no title, still hidden): look again shortly.
            if (attempt < 10)
                SetTimer(ApplyLaunchRule.Bind(hwnd, attempt + 1), -250)
            return
        }
        ; Remember it (pruned after a minute), so its later windows stay put.
        for oldPid, at in ASCS_RuleAppliedPids.Clone()
            if (A_TickCount - at > 60000)
                ASCS_RuleAppliedPids.Delete(oldPid)
        ASCS_RuleAppliedPids[pid] := A_TickCount
        rule := ASCS_LaunchRules[key]
        record := Map("monitor", rule["monitor"], "x", rule["x"], "y", rule["y"], "width", rule["width"],
            "height", rule["height"], "maximized", rule["maximized"], "pinned", rule["pinned"], "target", -2)
        if (rule["desktop"] >= 0 && DesktopsAvailable()) {
            target := WorkspaceDesktopTargets(Map(rule["desktop"], rule["desktopName"]), DesktopNames())[rule["desktop"]]
            record["target"] := target       ; -1 (no such desktop now): stays where it opened
        }
        PlaceWorkspaceWindow(hwnd, record)
        WriteLog("Launch rule: placed " rule["process"] ".")
    } catch as err {
        WriteLog("Launch rule not applied: " err.Message)
    }
}

; How long ago a process started, in milliseconds; -1 if it can't be told.
ProcessAgeMs(pid) {
    handle := DllCall("OpenProcess", "UInt", 0x1000, "Int", 0, "UInt", pid, "Ptr")   ; QUERY_LIMITED_INFORMATION
    if !handle
        return -1
    created := 0, exited := 0, kernel := 0, user := 0
    ok := DllCall("GetProcessTimes", "Ptr", handle, "Int64*", &created, "Int64*", &exited, "Int64*", &kernel, "Int64*", &user, "Int")
    DllCall("CloseHandle", "Ptr", handle)
    if !ok
        return -1
    now := 0
    DllCall("GetSystemTimeAsFileTime", "Int64*", &now)
    return (now - created) // 10000
}
