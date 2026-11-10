; ==========================================
; CUSTOM COMMANDS (1.6.0)
; ==========================================

ActionLabels() {
    return Map(
        "notes", "Quick Notes", "everything", "Everything",
        "dashboard", "System", "terminal", "Windows Terminal",
        "explorer", "File Explorer", "claude", "Claude",
        "taskmanager", "Task Manager"
    )
}

ActionKeysInUse() {
    global ASCS_ActionHotkeys

    labels := ActionLabels()
    used := Map()
    for action, key in ASCS_ActionHotkeys
        used[key] := labels.Has(action) ? labels[action] : action
    return used
}

LoadCustomCommands() {
    global ASCS_CommandsFile
    global ASCS_CustomCommands

    ASCS_CustomCommands := []
    if !FileExist(ASCS_CommandsFile)
        return

    count := 0
    try count := Integer(IniRead(ASCS_CommandsFile, "Commands", "Count", "0"))
    used := ActionKeysInUse()
    Loop Min(Max(count, 0), 30) {
        section := "Command" A_Index
        try {
            command := ValidateCustomCommand(
                IniRead(ASCS_CommandsFile, section, "name", ""),
                IniRead(ASCS_CommandsFile, section, "kind", ""),
                IniRead(ASCS_CommandsFile, section, "target", ""),
                IniRead(ASCS_CommandsFile, section, "key", "")
            )
            command["key"] := CheckShortcutKey(command["key"], command["name"], used, true)
            ASCS_CustomCommands.Push(command)
        } catch as err {
            WriteLog("Skipped custom command " A_Index ": " err.Message)
        }
    }
}

SaveCustomCommands(content) {
    global ASCS_CommandsFile
    global ASCS_CustomCommands

    try {
        commands := []
        used := ActionKeysInUse()
        for fields in ParseCustomCommandsPayload(content) {
            command := ValidateCustomCommand(fields[1], fields[2], fields[3], fields[4])
            command["key"] := CheckShortcutKey(command["key"], command["name"], used, true)
            commands.Push(command)
        }

        tempPath := ASCS_CommandsFile ".tmp"
        if FileExist(tempPath)
            FileDelete(tempPath)
        IniWrite(commands.Length, tempPath, "Commands", "Count")
        for index, command in commands {
            for field in ["name", "kind", "target", "key"]
                IniWrite(command[field], tempPath, "Command" index, field)
        }
        FileMove(tempPath, ASCS_CommandsFile, 1)

        ASCS_CustomCommands := commands
        RegisterConfiguredHotkeys()
        SendCustomCommands()
        SendToFrontend('{"type":"commandsSaved","message":"Custom commands saved and applied."}')
    } catch as err {
        WriteLog("Custom commands save failed: " err.Message)
        SendToFrontend('{"type":"error","scope":"commands","message":' JsonQuote(err.Message) '}')
        SendCustomCommands()
    }
}

SendCustomCommands() {
    global ASCS_CustomCommands

    json := "["
    for index, command in ASCS_CustomCommands {
        json .= (index > 1 ? "," : "")
            . '{"id":' index
            . ',"name":' JsonQuote(command["name"])
            . ',"kind":' JsonQuote(command["kind"])
            . ',"target":' JsonQuote(command["target"])
            . ',"key":' JsonQuote(command["key"]) '}'
    }
    SendToFrontend('{"type":"commands","items":' json ']}')
}

RunCustomCommand(index, source := "", *) {
    global ASCS_CustomCommands

    if (index < 1 || index > ASCS_CustomCommands.Length) {
        WriteLog("Rejected unknown custom command " index ".")
        return
    }
    command := ASCS_CustomCommands[index]
    target := command["target"]
    try {
        switch command["kind"] {
            case "app":
                if RegExMatch(target, "i)\.lnk$")
                    Run('"' target '"')
                else
                    RunAndActivate('"' target '"')
            case "folder":
                RunAndActivateExplorer('explorer.exe "' target '"', true)
            case "url":
                Run(target)
        }
        RecordActivity("command", command["name"])
    } catch as err {
        WriteLog("Custom command failed: " command["name"] " | " err.Message)
        RecordActivity("error", command["name"] ": " err.Message)
        ShowNotice("Unable to run " command["name"] ".")
    }
}

; Opens a file or folder picker for a custom command row in Preferences.
BrowseCommandTarget(content, *) {
    global ASCS_App

    parts := StrSplit(content, "|")
    row := Integer(parts[1])
    kind := parts[2]
    try ASCS_App.Opt("+OwnDialogs")
    path := kind = "folder"
        ? DirSelect(, 3, "Choose a folder for this command")
        : FileSelect(3, , "Choose an application", "Applications (*.exe; *.lnk)")
    if (path = "")
        return
    SendToFrontend('{"type":"browseResult","row":' row ',"path":' JsonQuote(path) '}')
}

