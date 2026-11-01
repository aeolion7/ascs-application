
#Requires AutoHotkey v2.0 64-bit
#SingleInstance Force
#Warn
#Warn LocalSameAsGlobal, Off

SetWorkingDir(A_ScriptDir)

; ==========================================
; AEOLIONWARE SUPER COMMAND SYSTEM
; Version 1.2.1
; ==========================================

#Include webview\WebViewToo.ahk

; ==========================================
; GLOBAL VARIABLES
; ==========================================

global ASCS_App := ""

global ASCS_DataDir := A_ScriptDir "\data"
global ASCS_NotesFile := ASCS_DataDir "\notes.json"
global ASCS_LogFile := ASCS_DataDir "\ASCS_Log.txt"
global ASCS_WebViewDataDir := ASCS_DataDir "\WebView2"

global ASCS_EverythingPath := ""
global ASCS_PageReady := false
global ASCS_PendingView := "home"
global ASCS_DashboardErrorShown := false

DirCreate(ASCS_DataDir)
DirCreate(ASCS_WebViewDataDir)

ASCS_EverythingPath := FindEverything()

if !FileExist(ASCS_NotesFile)
    FileAppend('{"content":""}', ASCS_NotesFile, "UTF-8")

; ==========================================
; WEBVIEW2 INITIALIZATION
; ==========================================

try {
    ASCS_App := WebViewGui(
        "+Resize",
        "ASCS - Aeolionware",
        ,
        {
            DataDir: ASCS_WebViewDataDir,
            DefaultWidth: 1100,
            DefaultHeight: 760
        }
    )

    ; Enable host-to-frontend messaging.
    ASCS_App.Settings.IsWebMessageEnabled := true

    ; Register WebView2 events.
    ASCS_App.WebMessageReceived(HandleWebMessage)
    ASCS_App.NavigationStarting(HandleNavigationStarting)
    ASCS_App.NavigationCompleted(HandleNavigationCompleted)

    ; Handle window close without terminating ASCS.
    ASCS_App.OnEvent("Close", HandleClose)

    ; Map the frontend directory to a local HTTPS origin.
    ASCS_App.BrowseFolder(
        A_ScriptDir "\frontend",
        "ascs.localhost"
    )

    ; Load the frontend.
    ASCS_App.Navigate("https://ascs.localhost/index.html")

    ; Keep the application hidden at startup.
    ASCS_App.Hide()

    WriteLog("ASCS 1.2.1 initialized.")

} catch as err {
    WriteLog("WebView2 initialization failed: " err.Message)

    MsgBox(
        "ASCS could not initialize WebView2.`n`n"
        err.Message,
        "ASCS Startup Error",
        "Iconx"
    )

    ExitApp()
}

; ==========================================
; SUPER KEY / F24
; ==========================================

~F24:: {
    KeyWait("F24")

    if (A_PriorKey = "F24")
        ShowView("home")
}

F24 & q::ShowView("notes")
F24 & f::ShowView("search")
F24 & i::ShowView("dashboard")

F24 & p::Run("powershell.exe")
F24 & t::Run("wt.exe")
F24 & e::Run("explorer.exe")
F24 & c::Run("calc.exe")
F24 & h::Run("taskmgr.exe")

F24 & l::DllCall("LockWorkStation")
F24 & m::SoundSetMute(!SoundGetMute())
F24 & v::Send("#v")

F24 & j::SendText(FormatTime(, "yyyy-MM-dd HH:mm:ss"))
F24 & y::SendText(FormatTime(, "yyyy-MM-dd"))

F24 & s:: {
    if GetKeyState("Shift", "P")
        Send("#+s")
    else
        WriteLog("Workspace save requested.")
}

F24 & r::WriteLog("Workspace restore requested.")

; ==========================================
; VIEW NAVIGATION
; ==========================================

ShowView(view) {
    global ASCS_App
    global ASCS_PageReady
    global ASCS_PendingView

    ASCS_PendingView := view

    ASCS_App.Show()
    WinActivate("ahk_id " ASCS_App.Hwnd)

    if ASCS_PageReady
        SendToFrontend(
            '{"type":"navigate","view":' JsonQuote(view) '}'
        )
}

; ==========================================
; WEBVIEW2 EVENT HANDLERS
; ==========================================

HandleNavigationStarting(sender, args) {
    global ASCS_PageReady

    ASCS_PageReady := false
}

HandleNavigationCompleted(sender, args) {
    if !args.IsSuccess
        WriteLog(
            "Frontend navigation failed. WebErrorStatus: "
            args.WebErrorStatus
        )
}

HandleClose(*) {
    global ASCS_App

    ASCS_App.Hide()
}

; ==========================================
; FRONTEND MESSAGE DISPATCH
; ==========================================

HandleWebMessage(sender, args) {
    global ASCS_PageReady
    global ASCS_PendingView

    try {
        message := args.TryGetWebMessageAsString()

        if (message = "")
            return

        separator := InStr(message, "`n")

        if separator {
            messageType := SubStr(message, 1, separator - 1)
            content := SubStr(message, separator + 1)
        } else {
            messageType := message
            content := ""
        }

        switch messageType {
            case "Ready":
                ASCS_PageReady := true

                WriteLog("Frontend ready.")

                SendToFrontend(
                    '{"type":"navigate","view":'
                    JsonQuote(ASCS_PendingView) '}'
                )

                GetNotes()
                PushDashboard()

                SetTimer(PushDashboard, 5000)

            case "GetNotes":
                GetNotes()

            case "SaveNote":
                SaveNote(content)

            case "SearchFiles":
                SearchFiles(content)

            case "Launch":
                LaunchCommand(content)

            case "GetMetrics":
                PushDashboard()

            case "Log":
                WriteLog(content)
        }

    } catch as err {
        WriteLog("Frontend message error: " err.Message)
    }
}

SendToFrontend(json) {
    global ASCS_App
    global ASCS_PageReady

    if !ASCS_PageReady
        return false

    try {
        ASCS_App.PostWebMessageAsJson(json)
        return true
    } catch as err {
        WriteLog("Frontend messaging error: " err.Message)
        return false
    }
}

; ==========================================
; APPLICATION LAUNCHER
; ==========================================

LaunchCommand(command) {
    userProfile := EnvGet("USERPROFILE")

    try {
        switch command {
            case "explorer":
                Run("explorer.exe")

            case "browser":
                Run("https://www.google.com")

            case "powershell":
                Run("powershell.exe")

            case "terminal":
                Run("wt.exe")

            case "calculator":
                Run("calc.exe")

            case "taskmanager":
                Run("taskmgr.exe")

            case "settings":
                Run("ms-settings:")

            case "downloads":
                Run('explorer.exe "' userProfile '\Downloads"')

            case "projects":
                Run('explorer.exe "' userProfile '\Documents"')

            case "snipping":
                Send("#+s")
        }

    } catch as err {
        WriteLog("Launch failed: " command " | " err.Message)

        SendToFrontend(
            '{"type":"error","message":"Unable to launch application."}'
        )
    }
}

; ==========================================
; QUICK NOTES
; ==========================================

GetNotes() {
    global ASCS_NotesFile

    try {
        noteContent := FileRead(ASCS_NotesFile, "UTF-8")

        ; Read the JSON content field.
        if RegExMatch(
            noteContent,
            '"content"\s*:\s*"((?:\\.|[^"\\])*)"',
            &match
        ) {
            noteContent := JsonUnescape(match[1])

        } else if (Trim(noteContent) = "{}") {
            noteContent := ""
        }

        SendToFrontend(
            '{"type":"notes","content":'
            JsonQuote(noteContent) '}'
        )

    } catch as err {
        WriteLog("Notes loading failed: " err.Message)

        SendToFrontend(
            '{"type":"error","message":"Unable to load notes."}'
        )
    }
}

SaveNote(content) {
    global ASCS_NotesFile

    try {
        noteHandle := FileOpen(ASCS_NotesFile, "w", "UTF-8")

        if !noteHandle
            throw Error("Unable to open notes file.")

        try {
            noteHandle.Write(
                '{"content":' JsonQuote(content) '}'
            )
        } finally {
            noteHandle.Close()
        }

        SendToFrontend('{"type":"saved"}')

    } catch as err {
        WriteLog("Notes saving failed: " err.Message)

        SendToFrontend(
            '{"type":"error","message":"Unable to save notes."}'
        )
    }
}

; ==========================================
; EVERYTHING SEARCH
; ==========================================

FindEverything() {
    localAppData := EnvGet("LOCALAPPDATA")

    paths := [
        A_ProgramFiles "\Everything\Everything.exe",
        A_ProgramFiles " (x86)\Everything\Everything.exe",
        localAppData "\Programs\Everything\Everything.exe",
        localAppData "\Everything\Everything.exe"
    ]

    for path in paths {
        if FileExist(path)
            return path
    }

    try {
        return RegRead(
            "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Everything.exe"
        )
    }

    try {
        return RegRead(
            "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Everything.exe"
        )
    }

    return "Everything.exe"
}

SearchFiles(query) {
    global ASCS_EverythingPath

    query := Trim(query)

    if (query = "")
        return

    try {
        escaped := StrReplace(query, '"', '\"')

        Run(
            '"' ASCS_EverythingPath '" -search "' escaped '"'
        )

        WriteLog("Everything search: " query)

    } catch as err {
        WriteLog("Everything launch failed: " err.Message)

        SendToFrontend(
            '{"type":"error","message":"Unable to launch Everything. Check its installation."}'
        )
    }
}

; ==========================================
; SYSTEM DASHBOARD
; ==========================================

PushDashboard(*) {
    global ASCS_App
    global ASCS_DashboardErrorShown

    try {
        wmi := ComObjGet("winmgmts:\\.\root\cimv2")

        cpuTotal := 0
        cpuCount := 0

        totalRAM := 0
        freeRAM := 0

        for cpu in wmi.ExecQuery(
            "SELECT LoadPercentage FROM Win32_Processor"
        ) {
            cpuTotal += cpu.LoadPercentage
            cpuCount++
        }

        cpuUsage := cpuCount
            ? Round(cpuTotal / cpuCount)
            : 0

        for os in wmi.ExecQuery(
            "SELECT TotalVisibleMemorySize, FreePhysicalMemory FROM Win32_OperatingSystem"
        ) {
            totalRAM := os.TotalVisibleMemorySize / 1048576
            freeRAM := os.FreePhysicalMemory / 1048576
        }

        ramUsage := totalRAM
            ? Round((totalRAM - freeRAM) / totalRAM * 100)
            : 0

        diskTotal := DriveGetCapacity("C:") / 1024
        diskFree := DriveGetSpaceFree("C:") / 1024

        diskUsage := diskTotal
            ? Round((diskTotal - diskFree) / diskTotal * 100)
            : 0

        json := '{"type":"metrics","cpu":' cpuUsage
            . ',"ram":' ramUsage
            . ',"ramUsed":' Round(totalRAM - freeRAM, 1)
            . ',"ramTotal":' Round(totalRAM, 1)
            . ',"disk":' diskUsage
            . ',"diskUsed":' Round(diskTotal - diskFree, 1)
            . ',"diskTotal":' Round(diskTotal, 1) '}'

        SendToFrontend(json)

        ASCS_DashboardErrorShown := false

    } catch as err {
        if !ASCS_DashboardErrorShown {
            WriteLog("Dashboard metrics failed: " err.Message)

            SendToFrontend(
                '{"type":"error","message":"System metrics unavailable."}'
            )

            ASCS_DashboardErrorShown := true
        }
    }
}

; ==========================================
; ACTIVITY LOG
; ==========================================

WriteLog(message := "ASCS activity") {
    global ASCS_LogFile

    try {
        FileAppend(
            FormatTime(, "yyyy-MM-dd HH:mm:ss")
            " | " message "`n",
            ASCS_LogFile,
            "UTF-8"
        )
    }
}

; ==========================================
; JSON UTILITIES
; ==========================================

JsonQuote(value) {
    output := '"'

    for char in StrSplit(value) {
        code := Ord(char)

        switch code {
            case 34:
                output .= '\"'

            case 92:
                output .= "\\"

            case 8:
                output .= "\b"

            case 9:
                output .= "\t"

            case 10:
                output .= "\n"

            case 12:
                output .= "\f"

            case 13:
                output .= "\r"

            default:
                if (code < 32)
                    output .= Format("\u{:04X}", code)
                else
                    output .= char
        }
    }

    return output '"'
}

JsonUnescape(value) {
    output := ""
    index := 1
    length := StrLen(value)

    while (index <= length) {
        char := SubStr(value, index, 1)

        if (char != "\") {
            output .= char
            index++
            continue
        }

        index++

        escaped := SubStr(value, index, 1)

        switch escaped {
            case '"':
                output .= '"'

            case "\":
                output .= "\"

            case "/":
                output .= "/"

            case "b":
                output .= Chr(8)

            case "f":
                output .= Chr(12)

            case "n":
                output .= "`n"

            case "r":
                output .= "`r"

            case "t":
                output .= "`t"

            case "u":
                hex := SubStr(value, index + 1, 4)

                if RegExMatch(hex, "^[0-9A-Fa-f]{4}$") {
                    code := Integer("0x" hex)
                    index += 4

                    ; Handle UTF-16 surrogate pairs.
                    if (
                        code >= 0xD800
                        && code <= 0xDBFF
                        && SubStr(value, index + 1, 2) = "\u"
                    ) {
                        lowHex := SubStr(value, index + 3, 4)

                        if RegExMatch(lowHex, "^[0-9A-Fa-f]{4}$") {
                            lowCode := Integer("0x" lowHex)

                            if (lowCode >= 0xDC00 && lowCode <= 0xDFFF) {
                                code := 0x10000
                                    + ((code - 0xD800) << 10)
                                    + (lowCode - 0xDC00)

                                index += 6
                            }
                        }
                    }

                    output .= Chr(code)
                }

            default:
                output .= escaped
        }

        index++
    }

    return output
}
