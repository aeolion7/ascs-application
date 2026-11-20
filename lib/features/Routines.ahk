; ==========================================
; ROUTINES (2.12.0)
; ==========================================

; A routine runs its steps one after another, each on a timer, so nothing
; waits on the UI thread; a wait step is the gap before the next timer.
; One routine runs at a time. A step that can't be done stops the routine
; and says why. What a step may be is fixed in Core (ValidateRoutineStep):
; Maestro's own arrangements, desktops, volume (the output's or an app's), palette apps, custom commands
; and games, a page of Maestro, media keys and waits. Routines are checked
; when saved and when read, and started only by the user.

LoadRoutines() {
    global ASCS_RoutinesFile, ASCS_Routines

    ASCS_Routines := []
    if !FileExist(ASCS_RoutinesFile)
        return
    try {
        parsed := ParseRoutines(FileRead(ASCS_RoutinesFile, "UTF-8"), true)
        ASCS_Routines := parsed["routines"]
        for problem in parsed["problems"]
            WriteLog("Routines: left out: " problem)
    } catch as err {
        WriteLog("Routines: couldn't read them: " err.Message)
    }
}

; The page sends every routine, in the text form Core reads.
SaveRoutines(content) {
    global ASCS_RoutinesFile, ASCS_Routines

    try {
        routines := ParseRoutines(content)["routines"]
        tempPath := ASCS_RoutinesFile ".tmp"
        if FileExist(tempPath)
            FileDelete(tempPath)
        FileAppend(FormatRoutines(routines), tempPath, "UTF-8-RAW")
        FileMove(tempPath, ASCS_RoutinesFile, 1)
        ASCS_Routines := routines
        SendRoutines()
        SendToFrontend('{"type":"routinesSaved"}')
    } catch as err {
        WriteLog("Routines save failed: " err.Message)
        SendToFrontend('{"type":"error","scope":"routines","message":' JsonQuote(err.Message) '}')
        SendRoutines()
    }
}

SendRoutines() {
    global ASCS_Routines

    json := "["
    for index, routine in ASCS_Routines {
        steps := ""
        for stepIndex, step in routine["steps"]
            steps .= (stepIndex > 1 ? "," : "") '{"kind":' JsonQuote(step["kind"]) ',"arg":' JsonQuote(step["arg"]) '}'
        json .= (index > 1 ? "," : "") '{"name":' JsonQuote(routine["name"]) ',"steps":[' steps ']}'
    }
    SendToFrontend('{"type":"routines","items":' json ']}')
    SendRoutineState()
}

; Which routine is running and the step it's on (counted from 1), for the
; page's Stop button; an empty name when none is.
SendRoutineState() {
    global ASCS_RoutineRun

    if IsObject(ASCS_RoutineRun)
        SendToFrontend('{"type":"routineState","name":' JsonQuote(ASCS_RoutineRun["name"])
            . ',"step":' ASCS_RoutineRun["index"] ',"count":' ASCS_RoutineRun["steps"].Length '}')
    else
        SendToFrontend('{"type":"routineState","name":"","step":0,"count":0}')
}

RunRoutine(name) {
    global ASCS_Routines, ASCS_RoutineRun

    if IsObject(ASCS_RoutineRun) {
        ShowNotice("“" ASCS_RoutineRun["name"] "” is still running. Stop it to start another.")
        return
    }
    routine := FindRoutine(ASCS_Routines, name)
    if !IsObject(routine) {
        WriteLog("Rejected unknown routine.")
        ShowNotice("That routine no longer exists.")
        return
    }
    if !routine["steps"].Length {
        ShowNotice("“" routine["name"] "” has no steps yet.")
        return
    }
    ; The steps as they are now: saving routines while one runs doesn't
    ; change the run.
    ASCS_RoutineRun := Map("name", routine["name"], "steps", routine["steps"].Clone(), "index", 0)
    RecordActivity("command", "Routine “" routine["name"] "”")
    WriteLog("Routine started: " routine["name"])
    SetTimer(RoutineNextStep, -1)
}

StopRoutine(reason := "") {
    global ASCS_RoutineRun

    SetTimer(RoutineNextStep, 0)
    if !IsObject(ASCS_RoutineRun)
        return
    name := ASCS_RoutineRun["name"]
    ASCS_RoutineRun := ""
    WriteLog("Routine “" name "” stopped" (reason = "" ? "." : ": " reason))
    if (reason != "")
        ShowNotice("“" name "” stopped: " reason)
    SendRoutineState()
}

RoutineNextStep() {
    global ASCS_RoutineRun

    if !IsObject(ASCS_RoutineRun)
        return
    current := ASCS_RoutineRun
    current["index"] += 1
    if (current["index"] > current["steps"].Length) {
        ASCS_RoutineRun := ""
        WriteLog("Routine finished: " current["name"])
        SendRoutineState()
        return
    }
    step := current["steps"][current["index"]]
    SendRoutineState()
    try
        problem := DoRoutineStep(step)
    catch as err
        problem := err.Message
    ; A step can stop the routine itself (by showing a page that sends
    ; StopRoutine, say): then there's nothing more to do here.
    if (ASCS_RoutineRun != current)
        return
    if (problem != "") {
        StopRoutine("step " current["index"] ", " problem)
        return
    }
    SetTimer(RoutineNextStep, -RoutineStepDelay(step))
}

; Does one step. Returns "" when done, else what went wrong, in words.
DoRoutineStep(step) {
    global ASCS_CustomCommands, ASCS_GameIndex

    arg := step["arg"]
    switch step["kind"] {
        case "workspace":
            if !FileExist(GetWorkspacePath(arg))
                return "the arrangement “" arg "” wasn't found."
            RestoreWorkspace(arg)
        case "desktop":
            count := DesktopCount()
            if (count < 1)
                return "virtual desktops aren't available."
            if (Integer(arg) > count)
                return "there's no desktop " arg "."
            if (CurrentDesktop() != Integer(arg) - 1 && !GoToDesktop(Integer(arg) - 1))
                return "switching to desktop " arg " failed."
        case "volume":
            SetOutputVolume(arg)
        case "appvolume":
            ; An app has sessions only once it has made a sound, so one with
            ; none yet isn't a reason to stop.
            parsed := ParseAppVolume(arg)
            if !SetAppAudio(parsed["app"], parsed["level"])
                WriteLog("Routine: " parsed["app"] " has no sound yet; its volume wasn't set.")
        case "launch":
            switch arg {
                case "everything": LaunchEverything()
                case "claude": LaunchClaude()
                default: LaunchCommand(arg)
            }
        case "command":
            for index, command in ASCS_CustomCommands {
                if (StrLower(command["name"]) = StrLower(arg)) {
                    RunCustomCommand(index, "routine")
                    return ""
                }
            }
            return "there's no custom command named “" arg "”."
        case "game":
            if !ASCS_GameIndex.Has(arg)
                BuildGameLibrary()
            if !ASCS_GameIndex.Has(arg)
                return "that game isn't in the library."
            LaunchGame(arg)
        case "page":
            ShowASCS(arg)
        case "media":
            SendMediaKey(arg)
        case "wait":
            ; The wait is the delay before the next step.
        default:
            return "a routine can't do that step."
    }
    return ""
}
