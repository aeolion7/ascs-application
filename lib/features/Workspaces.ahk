; ==========================================
; NAMED WORKSPACES (1.6.0)
; ==========================================

; "Default" (or "") is the original data\workspace.ini used by Super+S/R;
; named layouts live in data\workspaces\<name>.ini.
GetWorkspacePath(name) {
    global ASCS_WorkspaceFile
    global ASCS_WorkspaceDir

    if IsDefaultWorkspaceName(name)
        return ASCS_WorkspaceFile
    return ASCS_WorkspaceDir "\" ValidateWorkspaceName(name) ".ini"
}

WorkspaceInfoJson(name, path) {
    windows := 0
    saved := ""
    try windows := Integer(IniRead(path, "Workspace", "WindowCount", "0"))
    try saved := IniRead(path, "Workspace", "Saved", "")
    if (saved = "") {
        try saved := FormatTime(FileGetTime(path, "M"), "yyyy-MM-dd'T'HH:mm:ss")
    }
    ; 1.9.0, for the Workspaces view's maps: where each window sits (as
    ; fractions of its monitor's work area), its desktop, and the desktops'
    ; names. App names and titles are shown as text. 1.10.0: its place in the
    ; file (for edits), whether it's switched on, and whether its app is there.
    layout := ""
    highestMonitor := 1
    Loop Min(Max(windows, 0), 48) {
        section := "Window" A_Index
        try {
            ; Saved before 1.9.1: a suspended system window, not one of yours.
            if IsGhostWorkspaceRecord(
                WorkspaceInteger(IniRead(path, section, "desktop", "-2"), -2),
                IniRead(path, section, "pinned", "0") = "1"
            ) {
                windows--
                continue
            }
            process := IniRead(path, section, "process", "")
            app := RegExReplace(process, "i)\.exe$")
            monitor := WorkspaceInteger(IniRead(path, section, "monitor", "1"), 1)
            highestMonitor := Max(highestMonitor, Min(monitor, 16))
            layout .= (layout = "" ? "" : ",") '{"index":' A_Index ',"app":' JsonQuote(SubStr(app, 1, 60))
                . ',"title":' JsonQuote(SubStr(IniRead(path, section, "title", ""), 1, 120))
                . ',"desktop":' WorkspaceInteger(IniRead(path, section, "desktop", "-2"), -2)
                . ',"pinned":' (IniRead(path, section, "pinned", "0") = "1" ? "true" : "false")
                . ',"monitor":' monitor
                . ',"enabled":' (IniRead(path, section, "enabled", "1") = "0" ? "false" : "true")
                . ',"missing":' (IsValidWorkspaceExecutable(IniRead(path, section, "path", ""), process) ? "false" : "true")
                . ',"x":' WorkspaceFraction(IniRead(path, section, "x", "0"))
                . ',"y":' WorkspaceFraction(IniRead(path, section, "y", "0"))
                . ',"width":' WorkspaceFraction(IniRead(path, section, "width", "0.5"))
                . ',"height":' WorkspaceFraction(IniRead(path, section, "height", "0.5"))
                . ',"maximized":' (SavedWindowMaximized(path, section) ? "true" : "false") '}'
        }
    }
    names := ""
    desktops := 0
    try desktops := Integer(IniRead(path, "Workspace", "Desktops", "0"))
    Loop Min(Max(desktops, 0), 20)
        names .= (names = "" ? "" : ",") JsonQuote(SubStr(IniRead(path, "Desktops", A_Index - 1, ""), 1, 60))
    aspects := ""
    Loop Max(highestMonitor, Min(MonitorGetCount(), 16))
        aspects .= (aspects = "" ? "" : ",") '"' A_Index '":' Format("{:.4f}", WorkspaceAspect(IniRead(path, "Monitors", A_Index, ""), A_Index))
    return '{"name":' JsonQuote(name) ',"windows":' windows ',"saved":' JsonQuote(saved)
        . ',"layout":[' layout '],"desktopNames":[' names '],"aspects":{' aspects '}}'
}

; A saved window is maximized if it says so, or if it fills its monitor.
SavedWindowMaximized(path, section) {
    if (IniRead(path, section, "maximized", "0") = "1")
        return true
    try return WorkspaceFillsMonitor(
        Float(IniRead(path, section, "x", "0")), Float(IniRead(path, section, "y", "0")),
        Float(IniRead(path, section, "width", "0")), Float(IniRead(path, section, "height", "0"))
    )
    return false
}

; A monitor's width over its height: as saved, else as it is now, else 16:9.
WorkspaceAspect(saved, monitor) {
    try {
        value := Float(saved)
        if (value >= 0.5 && value <= 6)
            return value
    }
    if (monitor <= MonitorGetCount()) {
        try {
            MonitorGetWorkArea(monitor, &left, &top, &right, &bottom)
            if (right > left && bottom > top)
                return (right - left) / (bottom - top)
        }
    }
    return 16 / 9
}

; A saved fraction as a JSON number (-1 to 2; anything else is 0).
WorkspaceFraction(text) {
    try {
        value := Float(text)
        if (value >= -1 && value <= 2)
            return Format("{:.4f}", value)
    }
    return "0"
}

; Rename (1.9.0): "old|new". Default keeps its name (Super + S and R use it).
RenameWorkspace(content) {
    try {
        parts := StrSplit(content, "|", , 2)
        if (parts.Length != 2)
            throw Error("Malformed request.")
        if IsDefaultWorkspaceName(parts[1]) || IsDefaultWorkspaceName(parts[2])
            throw Error("“Default” keeps its name: Super + S and Super + R use it.")
        oldName := ValidateWorkspaceName(parts[1]), newName := ValidateWorkspaceName(parts[2])
        oldPath := GetWorkspacePath(oldName), newPath := GetWorkspacePath(newName)
        if !FileExist(oldPath)
            throw Error("That arrangement isn't there any more.")
        if (oldName != newName && FileExist(newPath))
            throw Error("An arrangement called “" newName "” already exists.")
        if (oldPath != newPath)
            FileMove(oldPath, newPath)
        else
            FileMove(oldPath, newPath ".tmp"), FileMove(newPath ".tmp", newPath)    ; a change of case only
        IniWrite(newName, newPath, "Workspace", "Name")
        RecordActivity("workspace", "Renamed arrangement “" oldName "” to “" newName "”")
        NotifyFrontend("Renamed to “" newName "”.")
    } catch as err {
        NotifyFrontend("Not renamed: " err.Message)
    }
    SendWorkspaces()
}

SendWorkspaces() {
    global ASCS_WorkspaceFile
    global ASCS_WorkspaceDir

    items := []
    if FileExist(ASCS_WorkspaceFile)
        items.Push(WorkspaceInfoJson("Default", ASCS_WorkspaceFile))
    try {
        Loop Files ASCS_WorkspaceDir "\*.ini" {
            name := IniRead(A_LoopFileFullPath, "Workspace", "Name", SubStr(A_LoopFileName, 1, -4))
            try name := ValidateWorkspaceName(name)
            catch
                continue
            if IsDefaultWorkspaceName(name)
                continue
            items.Push(WorkspaceInfoJson(name, A_LoopFileFullPath))
        }
    }
    SendToFrontend('{"type":"workspaces","monitors":' MonitorGetCount() ',"items":[' JoinArray(items, ",") ']}')
}

; ---- editing a saved workspace (1.10.0)
; Only the file changes, never an open window. Each edit works on a copy and
; swaps it in, so a failure leaves the saved workspace as it was. The page
; sends places and switches; an app's path only ever comes from a real window.

EditWorkspaceFile(path, change) {
    temp := path ".tmp"
    try FileDelete(temp)
    FileCopy(path, temp, 1)
    try {
        change(temp)
        IniWrite(FormatTime(A_Now, "yyyy-MM-dd'T'HH:mm:ss"), temp, "Workspace", "Saved")
        FileMove(temp, path, 1)
    } catch as err {
        try FileDelete(temp)
        throw err
    }
}

; The file's section for a saved window; throws if it isn't there.
SavedWorkspaceWindow(path, index) {
    if !FileExist(path)
        throw Error("That arrangement isn't there any more.")
    section := "Window" index
    if (index > WorkspaceInteger(IniRead(path, "Workspace", "WindowCount", "0"), 0)
        || IniRead(path, section, "path", "") = "")
        throw Error("That window isn't in the arrangement any more.")
    return section
}

SetWorkspaceWindow(content) {
    try {
        parsed := ParseWorkspaceWindowEdit(content)
        path := GetWorkspacePath(parsed["name"])
        section := SavedWorkspaceWindow(path, parsed["index"])
        desktops := WorkspaceInteger(IniRead(path, "Workspace", "Desktops", "0"), 0)
        if (parsed["desktop"] >= desktops || (parsed["pinned"] && desktops < 1))
            throw Error("That arrangement has no such desktop.")
        EditWorkspaceFile(path, WriteWorkspaceWindowEdit.Bind(section, parsed))
    } catch as err {
        NotifyFrontend("Not saved: " err.Message)
    }
    SendWorkspaces()
}

WriteWorkspaceWindowEdit(section, parsed, temp) {
    for key in ["desktop", "monitor"]
        IniWrite(parsed[key], temp, section, key)
    for key in ["x", "y", "width", "height"]
        IniWrite(Format("{:.4f}", parsed[key]), temp, section, key)
    for key in ["maximized", "pinned", "enabled"]
        IniWrite(parsed[key] ? 1 : 0, temp, section, key)
}

; Payload: "name|index". A workspace keeps at least one window.
RemoveWorkspaceWindow(content) {
    try {
        ref := ParseWorkspaceWindowRef(content)
        path := GetWorkspacePath(ref["name"])
        SavedWorkspaceWindow(path, ref["index"])
        count := WorkspaceInteger(IniRead(path, "Workspace", "WindowCount", "0"), 0)
        if (count <= 1)
            throw Error("It's the last window; delete the arrangement instead.")
        app := RegExReplace(IniRead(path, "Window" ref["index"], "process", ""), "i)\.exe$")
        EditWorkspaceFile(path, WriteWorkspaceWindowRemoved.Bind(ref["index"], count))
        RecordActivity("workspace", "Removed " app " from arrangement “" ref["name"] "”")
    } catch as err {
        NotifyFrontend("Not removed: " err.Message)
    }
    SendWorkspaces()
}

WriteWorkspaceWindowRemoved(index, count, temp) {
    Loop count - index {
        IniDelete(temp, "Window" (index + A_Index - 1))
        IniWrite(IniRead(temp, "Window" (index + A_Index)), temp, "Window" (index + A_Index - 1))
    }
    IniDelete(temp, "Window" count)
    IniWrite(count - 1, temp, "Workspace", "WindowCount")
}

; Payload: "name|window handle", from the open-window list.
AddWorkspaceWindow(content) {
    try {
        parts := StrSplit(content, "|")
        if (parts.Length != 2 || !RegExMatch(parts[2], "^\d{1,20}\z"))
            throw Error("Malformed request.")
        name := WorkspaceEditName(parts[1])
        path := GetWorkspacePath(name)
        if !FileExist(path)
            throw Error("That arrangement isn't there any more.")
        count := WorkspaceInteger(IniRead(path, "Workspace", "WindowCount", "0"), 0)
        if (count >= 48)
            throw Error("An arrangement holds 48 windows.")
        hwnd := Integer(parts[2])
        available := DesktopsAvailable()
        if available
            DetectHiddenWindows(true)
        if !IsWorkspaceWindow(hwnd, false, available)
            throw Error("That window is closed or minimized.")
        folders := StrLower(WinGetProcessName("ahk_id " hwnd)) = "explorer.exe" ? GetExplorerFolderMap() : Map()
        record := CaptureWorkspaceWindow(hwnd, folders, available)
        if !record
            throw Error("That window's app can't be told.")
        EditWorkspaceFile(path, WriteWorkspaceWindowAdded.Bind(record, count))
        app := RegExReplace(record["process"], "i)\.exe$")
        RecordActivity("workspace", "Added " app " to arrangement “" name "”")
        NotifyFrontend("Added " app ".")
    } catch as err {
        NotifyFrontend("Not added: " err.Message)
    }
    SendWorkspaces()
}

WriteWorkspaceWindowAdded(record, count, temp) {
    desktops := WorkspaceInteger(IniRead(temp, "Workspace", "Desktops", "0"), 0)
    if (desktops < 1) {
        ; Saved without desktops: it stays that way, on the current desktop.
        record["pinned"] := 0, record["desktop"] := -2
    } else if (record.Has("desktop") && record["desktop"] >= 0) {
        saved := []
        Loop desktops
            saved.Push(IniRead(temp, "Desktops", A_Index - 1, ""))
        name := DesktopName(record["desktop"])
        slot := WorkspaceAddDesktopIndex(saved, record["desktop"], name)
        Loop Max(0, slot + 1 - desktops)
            IniWrite(desktops + A_Index - 1 = slot ? name : "", temp, "Desktops", desktops + A_Index - 1)
        if (slot >= desktops)
            IniWrite(slot + 1, temp, "Workspace", "Desktops")
        record["desktop"] := slot
    }
    section := "Window" (count + 1)
    for key, value in record
        IniWrite(value, temp, section, key)
    IniWrite(count + 1, temp, "Workspace", "WindowCount")
}

; Payload: "name|new name". The copy is independent; Default can be copied
; but not overwritten.
DuplicateWorkspace(content) {
    global ASCS_WorkspaceDir
    try {
        parts := StrSplit(content, "|")
        if (parts.Length != 2)
            throw Error("Malformed request.")
        name := WorkspaceEditName(parts[1])
        if IsDefaultWorkspaceName(parts[2])
            throw Error("“Default” is the one Super + S saves.")
        newName := ValidateWorkspaceName(parts[2])
        path := GetWorkspacePath(name), newPath := GetWorkspacePath(newName)
        if !FileExist(path)
            throw Error("That arrangement isn't there any more.")
        if FileExist(newPath)
            throw Error("An arrangement called “" newName "” already exists.")
        DirCreate(ASCS_WorkspaceDir)
        temp := newPath ".tmp"
        FileCopy(path, temp, 1)
        IniWrite(newName, temp, "Workspace", "Name")
        FileMove(temp, newPath)
        RecordActivity("workspace", "Copied arrangement “" name "” to “" newName "”")
        NotifyFrontend("Copied to “" newName "”.")
    } catch as err {
        NotifyFrontend("Not copied: " err.Message)
    }
    SendWorkspaces()
}

DeleteWorkspace(name) {
    try {
        displayName := IsDefaultWorkspaceName(name) ? "Default" : ValidateWorkspaceName(name)
        path := GetWorkspacePath(displayName)
        if FileExist(path)
            FileDelete(path)
        RecordActivity("workspace", "Deleted arrangement “" displayName "”")
        NotifyFrontend("Arrangement “" displayName "” deleted.")
    } catch as err {
        WriteLog("Arrangement delete failed: " err.Message)
        NotifyFrontend("Unable to delete the arrangement: " err.Message)
    }
    SendWorkspaces()
}

