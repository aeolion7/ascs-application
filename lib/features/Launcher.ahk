; ==========================================
; APPLICATION LAUNCHER
; ==========================================

RunAndActivate(target, fallbackWindow := "") {
    foregroundAtLaunch := DllCall("GetForegroundWindow", "Ptr")
    pid := 0
    Run(target,,, &pid)

    if (!pid && fallbackWindow = "") {
        WriteLog("Launched application did not provide a process ID: " target)
        return false
    }

    deadline := A_TickCount + 8000
    SetTimer(
        WaitForApplicationWindow.Bind(
            pid,
            fallbackWindow,
            foregroundAtLaunch,
            deadline,
            target
        ),
        -100
    )
    return true
}

WaitForApplicationWindow(
    pid,
    fallbackWindow,
    foregroundAtLaunch,
    deadline,
    target,
    *
) {
    try {
        if pid {
            processWindow := "ahk_pid " pid
            if WinExist(processWindow) {
                ActivateLaunchedWindow(processWindow, foregroundAtLaunch)
                return
            }
        }

        if (fallbackWindow != "" && WinExist(fallbackWindow)) {
            ActivateLaunchedWindow(fallbackWindow, foregroundAtLaunch)
            return
        }

        if (A_TickCount >= deadline) {
            WriteLog("Launched application window did not appear: " target)
            return
        }

        SetTimer(
            WaitForApplicationWindow.Bind(
                pid,
                fallbackWindow,
                foregroundAtLaunch,
                deadline,
                target
            ),
            -100
        )
    } catch as err {
        WriteLog("Launched application activation failed: " target " | " err.Message)
    }
}

GetExplorerWindows() {
    previousDetectHidden := A_DetectHiddenWindows
    try {
        DetectHiddenWindows(true)
        windows := []
        seen := Map()
        for className in ["CabinetWClass", "ExploreWClass"] {
            for hwnd in WinGetList("ahk_class " className) {
                if !seen.Has(hwnd) && DllCall("IsWindowVisible", "Ptr", hwnd, "Int") {
                    seen[hwnd] := true
                    windows.Push(hwnd)
                }
            }
        }
    } finally {
        DetectHiddenWindows(previousDetectHidden)
    }

    return windows
}

GetTerminalWindows() {
    previousDetectHidden := A_DetectHiddenWindows
    try {
        DetectHiddenWindows(true)
        windows := []
        for hwnd in WinGetList("ahk_exe WindowsTerminal.exe") {
            if DllCall("IsWindowVisible", "Ptr", hwnd, "Int")
                windows.Push(hwnd)
        }
    } finally {
        DetectHiddenWindows(previousDetectHidden)
    }

    return windows
}

FocusExistingApplication(windows, applicationName) {
    global ASCS_VirtualDesktopDllPath

    if !FileExist(ASCS_VirtualDesktopDllPath) {
        ShowDesktopTooltip(
            "Add VirtualDesktopAccessor.dll to focus apps across desktops."
        )
        throw Error(
            applicationName " is already open, but cross-desktop focus "
            "requires VirtualDesktopAccessor.dll."
        )
    }

    dll := ASCS_VirtualDesktopDllPath
    currentDesktop := DllCall(dll "\GetCurrentDesktopNumber", "Int")
    if (currentDesktop < 0)
        throw Error("Unable to determine the current virtual desktop.")

    selectedWindow := 0
    selectedDesktop := -1
    for hwnd in windows {
        desktop := DllCall(
            dll "\GetWindowDesktopNumber",
            "Ptr", hwnd,
            "Int"
        )
        if (desktop < 0)
            throw Error("Unable to determine an " applicationName " window's desktop.")

        if (desktop = currentDesktop) {
            selectedWindow := hwnd
            selectedDesktop := desktop
            break
        }

        if !selectedWindow {
            selectedWindow := hwnd
            selectedDesktop := desktop
        }
    }

    if !selectedWindow
        return false

    if (selectedDesktop != currentDesktop) {
        switched := DllCall(
            dll "\GoToDesktopNumber",
            "Int", selectedDesktop,
            "Int"
        )
        if (switched < 0)
            throw Error("Unable to switch to the " applicationName " desktop.")
    }

    window := "ahk_id " selectedWindow
    WinActivate(window)
    if !WinWaitActive(window,, 2)
        throw Error("Unable to focus the existing " applicationName " window.")
    return true
}

RunAndActivateExplorer(
    target,
    openRequestedFolder := false,
    forceNew := false
) {
    foregroundAtLaunch := DllCall("GetForegroundWindow", "Ptr")
    existingWindows := Map()
    existingExplorerWindows := GetExplorerWindows()
    for hwnd in existingExplorerWindows
        existingWindows[hwnd] := true

    if (existingExplorerWindows.Length && !openRequestedFolder && !forceNew) {
        FocusExistingApplication(existingExplorerWindows, "File Explorer")
        return true
    }

    Run(target)
    deadline := A_TickCount + 8000
    SetTimer(
        WaitForExplorerWindow.Bind(
            existingWindows,
            foregroundAtLaunch,
            deadline,
            target,
            forceNew
        ),
        -100
    )
    return true
}

WaitForExplorerWindow(
    existingWindows,
    foregroundAtLaunch,
    deadline,
    target,
    forceNew,
    *
) {
    try {
        windows := GetExplorerWindows()
        for hwnd in windows {
            if !existingWindows.Has(hwnd) {
                ActivateExplorerWindow(hwnd, foregroundAtLaunch)
                return
            }
        }

        if (A_TickCount >= deadline) {
            if (windows.Length && !forceNew) {
                ActivateExplorerWindow(windows[1], foregroundAtLaunch)
            } else {
                WriteLog("File Explorer window did not appear: " target)
            }
            return
        }

        SetTimer(
            WaitForExplorerWindow.Bind(
                existingWindows,
                foregroundAtLaunch,
                deadline,
                target,
                forceNew
            ),
            -100
        )
    } catch as err {
        WriteLog("File Explorer activation failed: " target " | " err.Message)
    }
}

WaitForNewTerminalWindow(
    existingWindows,
    foregroundAtLaunch,
    deadline,
    *
) {
    try {
        for hwnd in GetTerminalWindows() {
            if !existingWindows.Has(hwnd) {
                ActivateLaunchedWindow(
                    "ahk_id " hwnd,
                    foregroundAtLaunch
                )
                return
            }
        }

        if (A_TickCount >= deadline) {
            WriteLog("New Windows Terminal window did not appear.")
            return
        }

        SetTimer(
            WaitForNewTerminalWindow.Bind(
                existingWindows,
                foregroundAtLaunch,
                deadline
            ),
            -100
        )
    } catch as err {
        WriteLog("New Windows Terminal activation failed: " err.Message)
    }
}

ActivateExplorerWindow(hwnd, foregroundAtLaunch) {
    window := "ahk_id " hwnd
    ActivateLaunchedWindow(window, foregroundAtLaunch)
}

ActivateLaunchedWindow(window, foregroundAtLaunch) {
    if WinActive(window)
        return true

    if (DllCall("GetForegroundWindow", "Ptr") != foregroundAtLaunch)
        return false

    WinActivate(window)
    if WinWaitActive(window,, 1)
        return true

    if (DllCall("GetForegroundWindow", "Ptr") != foregroundAtLaunch)
        return false

    throw Error("Window could not be activated: " window)
}

; Super+C (default letter): Claude's quick-entry prompt. With the Claude
; desktop app running, ASCS presses its quick-entry shortcut and checks that
; a Claude window came forward; if none did, or Claude isn't running, or no
; shortcut is set, it starts the app, which brings its window forward. The
; app is matched by its window class as well as its process name, so the
; Claude Code command-line tool (also claude.exe) is never mistaken for it.
LaunchClaude(*) {
    global ASCS_ClaudeShortcut
    global ASCS_ClaudeAppId

    DetectHiddenWindows(true)
    running := WinExist("ahk_class Chrome_WidgetWin_1 ahk_exe Claude.exe")
    DetectHiddenWindows(false)

    if (running && ASCS_ClaudeShortcut["send"] != "") {
        Send(ASCS_ClaudeShortcut["send"])
        if WinWaitActive("ahk_exe Claude.exe",, 1.5) {
            RecordActivity("launch", "Claude quick entry")
            return
        }
        WriteLog("Claude quick entry did not appear after " ASCS_ClaudeShortcut["display"] "; opening the app instead.")
    }
    try {
        Run("shell:AppsFolder\" ASCS_ClaudeAppId)
        RecordActivity("launch", "Claude")
    } catch as err {
        WriteLog("Claude launch failed: " err.Message)
        RecordActivity("error", "Claude: " err.Message)
        MsgBox("Unable to open Claude. Is the Claude desktop app installed?`n`n" err.Message, "Claude", "Iconx T15")
    }
}

LaunchCommand(command, thisHotkey := "", forceNew := false, *) {
    static labels := Map(
        "explorer", "File Explorer", "vivaldi", "Vivaldi",
        "terminal", "Windows Terminal", "calculator", "Calculator",
        "taskmanager", "Task Manager", "settings", "Windows Settings",
        "downloads", "Downloads", "projects", "Documents",
        "snipping", "Snipping Tool", "lock", "Lock workstation",
        "mute", "Toggle mute"
    )
    userProfile := EnvGet("USERPROFILE")
    if (
        !forceNew
        && (command = "terminal" || command = "explorer")
        && (thisHotkey != "")
        && GetKeyState("Shift", "P")
    )
        forceNew := true

    try {
        switch command {
            case "explorer":
                RunAndActivateExplorer(
                    forceNew ? "explorer.exe /n" : "explorer.exe",
                    false,
                    forceNew
                )

            case "vivaldi":
                LaunchVivaldi()

            case "terminal":
                if forceNew {
                    existingWindows := Map()
                    for hwnd in GetTerminalWindows()
                        existingWindows[hwnd] := true
                    foregroundAtLaunch := DllCall("GetForegroundWindow", "Ptr")
                    Run("wt.exe -w new")
                    SetTimer(
                        WaitForNewTerminalWindow.Bind(
                            existingWindows,
                            foregroundAtLaunch,
                            A_TickCount + 8000
                        ),
                        -100
                    )
                } else {
                    windows := GetTerminalWindows()
                    if windows.Length
                        FocusExistingApplication(windows, "Windows Terminal")
                    else
                        RunAndActivate(
                            "wt.exe",
                            "ahk_exe WindowsTerminal.exe"
                        )
                }

            case "calculator":
                RunAndActivate("calc.exe", "Calculator")

            case "taskmanager":
                RunAndActivate("taskmgr.exe", "ahk_exe Taskmgr.exe")

            case "settings":
                RunAndActivate("ms-settings:", "ahk_exe SystemSettings.exe")

            case "downloads":
                RunAndActivateExplorer(
                    'explorer.exe "' userProfile '\Downloads"',
                    true
                )

            case "projects":
                RunAndActivateExplorer(
                    'explorer.exe "' userProfile '\Documents"',
                    true
                )

            case "snipping":
                LaunchSnipping()

            case "lock":
                DllCall("LockWorkStation")

            case "mute":
                SoundSetMute(!SoundGetMute())
        }
        if (command != "vivaldi" && labels.Has(command))
            RecordActivity("launch", (forceNew ? "New window: " : "") labels[command])

    } catch as err {
        WriteLog("Launch failed: " command " | " err.Message)
        RecordActivity("error", (labels.Has(command) ? labels[command] : command) ": " err.Message)

        SendToFrontend(
            '{"type":"error","message":"Unable to launch application."}'
        )
    }
}

LaunchVivaldi() {
    try {
        windows := GetVivaldiWindows()
        if windows.Length {
            FocusVivaldiWindow(windows)
            RecordActivity("launch", "Vivaldi")
            return true
        }

        launched := RunAndActivate(
            '"' FindVivaldi() '"',
            "ahk_exe vivaldi.exe"
        )
        if !launched
            throw Error("Vivaldi did not open or could not be activated.")
        RecordActivity("launch", "Vivaldi")
        return true
    } catch as err {
        WriteLog("Vivaldi focus or launch failed: " err.Message)
        RecordActivity("error", "Vivaldi: " err.Message)
        MsgBox(
            "Unable to focus or open Vivaldi.`n`n" err.Message,
            "Vivaldi",
            "Iconx"
        )
        return false
    }
}

GetVivaldiWindows() {
    previousDetectHidden := A_DetectHiddenWindows
    try {
        DetectHiddenWindows(true)
        windows := WinGetList("ahk_exe vivaldi.exe")
    } finally {
        DetectHiddenWindows(previousDetectHidden)
    }

    visibleWindows := []
    for hwnd in windows {
        if DllCall("IsWindowVisible", "Ptr", hwnd, "Int")
            visibleWindows.Push(hwnd)
    }
    return visibleWindows
}

FocusVivaldiWindow(windows) {
    global ASCS_VirtualDesktopDllPath

    if !FileExist(ASCS_VirtualDesktopDllPath)
        throw Error(
            "Vivaldi is open, but its virtual desktop cannot be detected. "
            "Install VirtualDesktopAccessor.dll with GetCurrentDesktopNumber "
            "and GetWindowDesktopNumber exports."
        )

    dll := ASCS_VirtualDesktopDllPath
    currentDesktop := DllCall(dll "\GetCurrentDesktopNumber", "Int")
    if (currentDesktop < 0)
        throw Error("Unable to determine the current virtual desktop.")

    currentDesktopWindow := 0
    firstWindow := windows[1]
    firstWindowDesktop := -1
    for hwnd in windows {
        desktop := DllCall(
            dll "\GetWindowDesktopNumber",
            "Ptr", hwnd,
            "Int"
        )
        if (desktop < 0)
            throw Error("Unable to determine a Vivaldi window's virtual desktop.")

        if (hwnd = firstWindow)
            firstWindowDesktop := desktop
        if (desktop = currentDesktop) {
            currentDesktopWindow := hwnd
            break
        }
    }

    hwnd := currentDesktopWindow ? currentDesktopWindow : firstWindow

    if (!currentDesktopWindow && firstWindowDesktop != currentDesktop) {
        switched := DllCall(
            dll "\GoToDesktopNumber",
            "Int", firstWindowDesktop,
            "Int"
        )
        if (switched < 0)
            throw Error("Unable to switch to Vivaldi's virtual desktop.")
    }

    window := "ahk_id " hwnd
    WinActivate(window)
    if !WinWaitActive(window,, 2)
        throw Error("An existing Vivaldi window could not be activated.")
}

FindVivaldi() {
    localAppData := EnvGet("LOCALAPPDATA")
    paths := [
        A_ProgramFiles "\Vivaldi\Application\vivaldi.exe",
        A_ProgramFiles " (x86)\Vivaldi\Application\vivaldi.exe",
        localAppData "\Vivaldi\Application\vivaldi.exe"
    ]

    for path in paths {
        if FileExist(path)
            return path
    }

    for root in ["HKCU", "HKLM"] {
        try {
            path := RegRead(
                root "\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\vivaldi.exe"
            )
            path := Trim(path, '"')
            if FileExist(path)
                return path
        }
    }

    return "vivaldi.exe"
}

