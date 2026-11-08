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
    ; names. App names and titles are shown as text.
    layout := ""
    Loop Min(Max(windows, 0), 48) {
        section := "Window" A_Index
        try {
            app := RegExReplace(IniRead(path, section, "process", ""), "i)\.exe$")
            layout .= (layout = "" ? "" : ",") '{"app":' JsonQuote(SubStr(app, 1, 60))
                . ',"title":' JsonQuote(SubStr(IniRead(path, section, "title", ""), 1, 120))
                . ',"desktop":' WorkspaceInteger(IniRead(path, section, "desktop", "-2"), -2)
                . ',"pinned":' (IniRead(path, section, "pinned", "0") = "1" ? "true" : "false")
                . ',"monitor":' WorkspaceInteger(IniRead(path, section, "monitor", "1"), 1)
                . ',"x":' WorkspaceFraction(IniRead(path, section, "x", "0"))
                . ',"y":' WorkspaceFraction(IniRead(path, section, "y", "0"))
                . ',"width":' WorkspaceFraction(IniRead(path, section, "width", "0.5"))
                . ',"height":' WorkspaceFraction(IniRead(path, section, "height", "0.5"))
                . ',"maximized":' (IniRead(path, section, "maximized", "0") = "1" ? "true" : "false") '}'
        }
    }
    names := ""
    desktops := 0
    try desktops := Integer(IniRead(path, "Workspace", "Desktops", "0"))
    Loop Min(Max(desktops, 0), 20)
        names .= (names = "" ? "" : ",") JsonQuote(SubStr(IniRead(path, "Desktops", A_Index - 1, ""), 1, 60))
    return '{"name":' JsonQuote(name) ',"windows":' windows ',"saved":' JsonQuote(saved)
        . ',"layout":[' layout '],"desktopNames":[' names ']}'
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
            throw Error("That workspace isn't there any more.")
        if (oldName != newName && FileExist(newPath))
            throw Error("A workspace called “" newName "” already exists.")
        if (oldPath != newPath)
            FileMove(oldPath, newPath)
        else
            FileMove(oldPath, newPath ".tmp"), FileMove(newPath ".tmp", newPath)    ; a change of case only
        IniWrite(newName, newPath, "Workspace", "Name")
        RecordActivity("workspace", "Renamed workspace “" oldName "” to “" newName "”")
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
    SendToFrontend('{"type":"workspaces","items":[' JoinArray(items, ",") ']}')
}

DeleteWorkspace(name) {
    try {
        displayName := IsDefaultWorkspaceName(name) ? "Default" : ValidateWorkspaceName(name)
        path := GetWorkspacePath(displayName)
        if FileExist(path)
            FileDelete(path)
        RecordActivity("workspace", "Deleted workspace “" displayName "”")
        NotifyFrontend("Workspace “" displayName "” deleted.")
    } catch as err {
        WriteLog("Workspace delete failed: " err.Message)
        NotifyFrontend("Unable to delete the workspace: " err.Message)
    }
    SendWorkspaces()
}

