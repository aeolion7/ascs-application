#Requires AutoHotkey v2.0 64-bit
#SingleInstance Off
#NoTrayIcon
#Warn All, StdOut
#Warn LocalSameAsGlobal, Off   ; test-level variables are globals here

; Unit tests for lib\ASCS.Core.ahk. Run through tests\run-tests.ps1, or:
;   AutoHotkey64.exe tests\core.tests.ahk <results-file>
; Writes "PASS n FAIL m" plus one line per failure; exit code 1 on failure.

#Include %A_ScriptDir%\..\lib\ASCS.Core.ahk

global Passed := 0
global Failures := []
global ResultsPath := A_Args.Length ? A_Args[1] : A_ScriptDir "\core.results.txt"

; Report unexpected runtime errors instead of showing a blocking dialog.
OnError(ReportCrash)
ReportCrash(err, mode) {
    try FileDelete(ResultsPath)
    FileAppend("PASS 0 FAIL 1`nFAIL: crashed: " err.Message " (" err.What ", line " err.Line ")`n",
        ResultsPath, "UTF-8")
    ExitApp(2)
}

Check(name, condition) {
    global Passed, Failures
    if condition
        Passed++
    else
        Failures.Push(name)
}

Equal(name, actual, expected) {
    Check(name " (expected [" expected "], got [" actual "])", actual == expected)
}

Throws(name, callback, fragment := "") {
    try {
        callback()
    } catch as err {
        Check(name " (message: " err.Message ")", fragment = "" || InStr(err.Message, fragment))
        return
    }
    Check(name " (did not throw)", false)
}

; ------------------------------------------------------------ shortcuts
used := Map()
Equal("key normalizes to lowercase", CheckShortcutKey(" Q ", "Quick Notes", used), "q")
Throws("reserved key rejected", () => CheckShortcutKey("b", "Calc", Map()), "reserved")
Throws("duplicate key names owner", () => CheckShortcutKey("q", "Other", used), "Quick Notes")
Throws("digit rejected", () => CheckShortcutKey("1", "Calc", Map()), "single letter")
Throws("required empty rejected", () => CheckShortcutKey("", "Calc", Map()), "single letter")
Equal("optional empty allowed", CheckShortcutKey("", "Cmd", Map(), true), "")

; ------------------------------------------------------------ drives
drives := ParseDriveList("c:, j:")
Equal("drive list parsed", JoinArray(drives, ","), "C:,J:")
Throws("duplicate drives rejected", () => ParseDriveList("C:,c:"), "unique")
Throws("bad drive rejected", () => ParseDriveList("CC:"), "colon")
Throws("13 drives rejected", () => ParseDriveList("C:,D:,E:,F:,G:,H:,I:,J:,K:,L:,M:,N:,O:"), "12")
Throws("empty drive list rejected", () => ParseDriveList(""))

; ------------------------------------------------------------ Explorer names
Throws("invalid character rejected", () => ValidateExplorerItemName("a<b", "folder"), "character")
Throws("device name rejected", () => ValidateExplorerItemName("CON", "folder"), "reserved")
Throws("trailing period rejected", () => ValidateExplorerItemName("x.", "folder"), "period")
Throws("file needs extension", () => ValidateExplorerItemName("notes", "file"), "extension")
ValidateExplorerItemName("notes.txt", "file")
Check("valid file name accepted", true)

; ------------------------------------------------------------ workspaces
Equal("workspace name trimmed", ValidateWorkspaceName("  Coding "), "Coding")
Throws("workspace slash rejected", () => ValidateWorkspaceName("a/b"), "letters")
Throws("workspace device name rejected", () => ValidateWorkspaceName("CON"), "reserved")
Throws("workspace 41 chars rejected", () => ValidateWorkspaceName("a" StrRepeat("b", 40)), "40")
Throws("workspace empty rejected", () => ValidateWorkspaceName(""), "name")
Check("default name: empty", IsDefaultWorkspaceName(""))
Check("default name: case-insensitive", IsDefaultWorkspaceName(" Default "))
Check("named workspace is not default", !IsDefaultWorkspaceName("Coding"))

Check("valid executable accepted", IsValidWorkspaceExecutable(A_AhkPath, "AutoHotkey64.exe"))
Check("process mismatch rejected", !IsValidWorkspaceExecutable(A_AhkPath, "other.exe"))
Check("quoted path rejected", !IsValidWorkspaceExecutable('C:\a"b.exe', 'a"b.exe'))
Check("relative path rejected", !IsValidWorkspaceExecutable("tool.exe", "tool.exe"))
Check("Terminal accepted without readable path",
    IsValidWorkspaceExecutable("C:\Program Files\WindowsApps\X\WindowsTerminal.exe", "WindowsTerminal.exe"))

Equal("Explorer relaunch opens folder",
    GetWorkspaceLaunchCommand(Map("process", "explorer.exe", "folder", A_WinDir, "path", "C:\Windows\explorer.exe")),
    'explorer.exe "' A_WinDir '"')
Equal("Explorer missing folder falls back",
    GetWorkspaceLaunchCommand(Map("process", "explorer.exe", "folder", "C:\no\such\folder", "path", "")),
    "explorer.exe")
; 1.9.2: a new calendar event can be a quick action.
Equal("quick action: new calendar event", ValidateQuickActionId("calendar:new"), "calendar:new")
Throws("quick action: an unknown kind", () => ValidateQuickActionId("calc:1"))

; 1.9.1: Super+E and Super+Shift+E both follow "Open File Explorer to"; /n opens Documents.
launcherSource := FileRead(A_ScriptDir "\..\lib\features\Launcher.ahk", "UTF-8")
Check("Explorer is never opened with /n", !InStr(launcherSource, 'explorer.exe /n'))

; 1.9.1: which game RetroArch is running.
Equal("RetroArch: started by ASCS", RetroArchContentFromCommandLine('"C:\Retroarch\retroarch.exe" -L "C:\Retroarch\cores\gx.dll" "J:\Sega\Golden Axe (World).zip#Golden Axe (World).md"'), "Golden Axe (World)")
Equal("RetroArch: no game", RetroArchContentFromCommandLine('"C:\Retroarch\retroarch.exe"'), "")
Equal("RetroArch: only options", RetroArchContentFromCommandLine('retroarch.exe -f --verbose -c "C:\x.cfg"'), "")
Equal("RetroArch: flag then game", RetroArchContentFromCommandLine('retroarch.exe -f "J:\PS1\Musashi.cue"'), "Musashi")
raHistory := [Map("path", "J:\a\Golden Axe (World).zip#g.md", "coreName", "Sega - MS/GG/MD/CD (Genesis Plus GX)"),
    Map("path", "J:\b\Musashi.cue", "coreName", "Sony - PlayStation (Beetle PSX)")]
Equal("RetroArch history: by the core in the title", RetroArchGameFromHistory(raHistory, "RetroArch Beetle PSX 0.9.44"), "Musashi")
Equal("RetroArch history: the menu names no core", RetroArchGameFromHistory(raHistory, "RetroArch"), "")
Equal("RetroArch history: an unknown core", RetroArchGameFromHistory(raHistory, "RetroArch Snes9x 1.6"), "")
Equal("RetroArch title: adds the game", RetroArchTitleWithGame("RetroArch Beetle PSX 0.9", "Musashi"), "RetroArch || Musashi")
Equal("RetroArch title: none at the menu", RetroArchTitleWithGame("RetroArch", "Musashi"), "RetroArch")
Check("RetroArch: a core in the title", RetroArchShowsCore("RetroArch Beetle PSX 0.9 || FPS: 60"))
Check("RetroArch: the menu shows no core", !RetroArchShowsCore("RetroArch"))
Equal("RetroArch: kept while loading", RetroArchKeptGame("Musashi", false, "RetroArch"), "Musashi")
Equal("RetroArch: kept while running", RetroArchKeptGame("Musashi", true, "RetroArch Beetle PSX"), "Musashi")
Equal("RetroArch: dropped after Close Content", RetroArchKeptGame("Musashi", true, "RetroArch"), "")
Equal("RetroArch title: and reads back", EmulatorGameName("retroarch", RetroArchTitleWithGame("RetroArch Beetle PSX", "Musashi")), "Musashi")
Equal("RetroArch title: keeps a title with a game", RetroArchTitleWithGame("RetroArch X || Zelda || FPS: 60", "Other"), "RetroArch X || Zelda || FPS: 60")
Equal("RetroArch title: FPS isn't a game", EmulatorGameName("retroarch", "RetroArch X || FPS: 60"), "")

; 1.9.1: sign-in timings.
signInLine := "2026-11-08 10:28:15  Sign-in: Timeline (ms): taskbar created 2515, Open-Shell started -1, taskbar shown 2515, RetroBar started 2625, RetroBar bar shown 4937, apps started 5171, Keychron started 5515; startup sound The Microsoft Sound (+2.0 dB).wav"
signInTimes := ParseSignInTimeline(signInLine)
Equal("sign-in: RetroBar", signInTimes["retrobar"], 4937)
Equal("sign-in: apps", signInTimes["apps"], 5171)
Equal("sign-in: sound", signInTimes["sound"], "The Microsoft Sound (+2.0 dB).wav")
Check("sign-in: the plain history shows the file's name", InStr(SignInHistoryJson(signInLine), '"sound":"The Microsoft Sound (+2.0 dB)"'))
soundLibrary := "C:\Sounds"
Equal("sound OS: The Microsoft Sound", SoundOsFromPath("C:\Sounds\(1998) Windows 98\The Microsoft Sound.wav", soundLibrary), "Windows 98")
Equal("sound OS: a Startup file", SoundOsFromPath("C:\Sounds\(2001) Windows XP\Windows XP Startup.wav", soundLibrary), "Windows XP")
Equal("sound OS: plain Startup.wav", SoundOsFromPath("C:\Sounds\(2009) Windows 7\Startup.wav", soundLibrary), "Windows 7")
Equal("sound OS: in a theme folder", SoundOsFromPath("C:\Sounds\(2009) Windows 7\Delta\Windows Logon Sound.wav", soundLibrary), "Windows 7")
Equal("sound OS: start.wav is the Start click", SoundOsFromPath("C:\Sounds\(1998) Windows 98\START.WAV", soundLibrary), "")
Equal("sound OS: another Windows sound", SoundOsFromPath("C:\Sounds\(1998) Windows 98\Chord.wav", soundLibrary), "")
Equal("sound OS: your own folder", SoundOsFromPath("C:\Sounds\My Sounds\Startup.wav", soundLibrary), "")
Equal("sound OS: outside the library", SoundOsFromPath("D:\Music\The Microsoft Sound.wav", soundLibrary), "")
same := path => path
Equal("sound label: a Windows startup sound", SignInSoundLabel("C:\Sounds\(2000) Windows Me\The Microsoft Sound.wav", soundLibrary, same), "Windows Me")
Equal("sound label: a leveled copy by its original", SignInSoundLabel("C:\Sounds\ASCS Leveled\The Microsoft Sound (+2.0 dB).wav", soundLibrary, path => "C:\Sounds\(2000) Windows Me\The Microsoft Sound.wav"), "Windows Me")
Equal("sound label: a custom sound keeps its name", SignInSoundLabel("D:\Music\Fanfare.wav", soundLibrary, same), "Fanfare")
Equal("sound label: no original known keeps its name", SignInSoundLabel("The Microsoft Sound (+9.0 dB).wav", soundLibrary, path => ""), "The Microsoft Sound (+9.0 dB)")
Equal("sound label: Windows' own XP copy", SignInSoundLabel("C:\Windows\Media\Windows XP Startup.wav", soundLibrary, same), "Windows XP")
Check("sign-in: the history uses the label", InStr(SignInHistoryJson(signInLine, , logged => "Windows Me"), '"sound":"Windows Me"'))
Check("sign-in: a logged path isn't taken for a time", ParseSignInTimeline(StrReplace(signInLine, "The Microsoft Sound (+2.0 dB).wav", "C:\Sounds\(1998) Windows 98\The Microsoft Sound.wav"))["retrobar"] = 4937)
Equal("sign-in: time", signInTimes["time"], "2026-11-08T10:28:15")
testRunLine := "2026-11-04 17:23:29  Sign-in: Timeline (ms): taskbar created -1, Open-Shell started -1, taskbar shown -1, RetroBar started -1, RetroBar bar shown -1, apps started 63, Keychron started -1"
Check("sign-in: a test run is left out", !IsObject(ParseSignInTimeline(testRunLine)))
Check("sign-in: a test with the taskbar already up is left out", !IsObject(ParseSignInTimeline("2026-11-03 13:31:01  Sign-in: Timeline (ms): taskbar created 16, Open-Shell started 16, taskbar shown 16, RetroBar started 141, RetroBar bar shown 1250, apps started 1250, Keychron started 1594")))
Check("sign-in: other lines are left out", !IsObject(ParseSignInTimeline("2026-11-08 10:24:31  Configure: done")))
Check("sign-in: newest first", InStr(SignInHistoryJson(StrReplace(signInLine, "10:28:15", "09:00:00") "`r`n" testRunLine "`r`n" signInLine), '[{"time":"2026-11-08T10:28:15"') = 1)
Equal("sign-in: an empty log", SignInHistoryJson(""), "[]")
Check("sign-in: at most ten", StrSplit(SignInHistoryJson(signInLine "`n" signInLine "`n" signInLine, 2), '"time"').Length = 3)

; 1.9.1: suspended system windows aren't part of a workspace.
Check("ghost: cloaked, no desktop, not pinned", IsGhostDesktopWindow(true, -1, false))
Check("ghost: a real window on another desktop stays", !IsGhostDesktopWindow(true, 2, false))
Check("ghost: desktop 0 counts as a desktop", !IsGhostDesktopWindow(true, 0, false))
Check("ghost: a pinned window stays", !IsGhostDesktopWindow(true, -1, true))
Check("ghost: an uncloaked window stays", !IsGhostDesktopWindow(false, -1, false))
Check("saved ghost: -1 without the pin", IsGhostWorkspaceRecord(-1, false))
Check("saved ghost: -1 with the pin is pinned to all", !IsGhostWorkspaceRecord(-1, true))
Check("saved ghost: -2 is the current desktop", !IsGhostWorkspaceRecord(-2, false))
Check("saved ghost: a real desktop stays", !IsGhostWorkspaceRecord(1, false))
Equal("count: one window", WorkspaceCountText(1), "1 window")
Equal("count: one window, one desktop", WorkspaceCountText(1, 1), "1 window")
Equal("count: several on one desktop", WorkspaceCountText(5, 1), "5 windows")
Equal("count: no desktop information", WorkspaceCountText(2, 0), "2 windows")
Equal("count: across desktops", WorkspaceCountText(3, 2), "3 windows across 2 desktops")

; 1.9.1: the sign-in task check.
Equal("sign-in task: all well", StartupTaskWarning(["Startup - Sign-in"]), "")
Check("sign-in task: an old task is named as the cause",
    InStr(StartupTaskWarning(["Startup - Sign-in", "Startup - Play XP Startup Sound"]), "older startup task"))
Check("sign-in task: the state found on 2026-11-08 warns",
    InStr(StartupTaskWarning(["Startup - Play XP Startup Sound", "Startup - RetroBar", "Startup - Open-Shell",
        "Startup - Keychron Assistant", "Startup - Startup Items"]), "Configure-Startup.ps1"))
Check("sign-in task: missing", InStr(StartupTaskWarning([]), "sign-in task is missing"))
Check("sign-in task: names ignore case", StartupTaskWarning(["startup - sign-in"]) = "")
Equal("sign-in task: every name is listed once", RetiredStartupTasks().Length, 8)
Check("sign-in task: the warning fits the activity feed", StrLen(StartupTaskWarning([])) <= 200)

Equal("Terminal relaunch uses wt",
    GetWorkspaceLaunchCommand(Map("process", "WindowsTerminal.exe", "folder", "", "path", "x")),
    "wt.exe -w new")
Equal("other apps relaunch by path",
    GetWorkspaceLaunchCommand(Map("process", "code.exe", "folder", "", "path", "C:\Apps\code.exe")),
    '"C:\Apps\code.exe"')

; Matching: exact titles/folders first, then any window of the same process.
records := [
    Map("process", "WindowsTerminal.exe", "title", "A", "folder", ""),
    Map("process", "WindowsTerminal.exe", "title", "B", "folder", ""),
    Map("process", "explorer.exe", "title", "", "folder", "C:\X"),
    Map("process", "explorer.exe", "title", "", "folder", "C:\Y"),
    Map("process", "code.exe", "title", "Editor", "folder", "")
]
candidates := Map("windowsterminal.exe", [101, 102], "explorer.exe", [201, 202])
titles := Map(101, "B", 102, "Z")
folders := Map(201, "C:\Y", 202, "C:\X")
matches := MatchWorkspaceRecords(records, candidates, Map(), (hwnd) => titles[hwnd], folders)
Equal("exact title wins over order", matches[2], 101)
Equal("unmatched title takes leftover window", matches[1], 102)
Equal("Explorer matched by folder (X)", matches[3], 202)
Equal("Explorer matched by folder (Y)", matches[4], 201)
Check("record without windows is unmatched", !matches.Has(5))
claimed := Map(102, true)
matches := MatchWorkspaceRecords(records, candidates, claimed, (hwnd) => titles[hwnd], folders)
Check("claimed windows are not reused", !matches.Has(1) && matches[2] = 101)

; ------------------------------------------------------------ custom commands
command := ValidateCustomCommand(" Mail ", "URL", "https://mail.example.com/inbox", "M")
Equal("command name trimmed", command["name"], "Mail")
Equal("command kind normalized", command["kind"], "url")
Equal("command key lowercased", command["key"], "m")
Throws("non-http link rejected", () => ValidateCustomCommand("x", "url", "ftp://host"), "http")
Throws("missing app rejected", () => ValidateCustomCommand("x", "app", "C:\no\such\app.exe"), "not found")
Throws("non-exe app rejected", () => ValidateCustomCommand("x", "app", "C:\Windows\win.ini"), ".exe")
Equal("existing app accepted", ValidateCustomCommand("AHK", "app", A_AhkPath)["target"], A_AhkPath)
Equal("existing folder accepted", ValidateCustomCommand("Win", "folder", A_WinDir)["kind"], "folder")
Throws("relative folder rejected", () => ValidateCustomCommand("x", "folder", "Projects"), "full path")
Throws("unknown kind rejected", () => ValidateCustomCommand("x", "script", "a"), "Application")
Throws("pipe in name rejected", () => ValidateCustomCommand("a|b", "url", "https://x.y"), "|")
Throws("long name rejected", () => ValidateCustomCommand(StrRepeat("n", 49), "url", "https://x.y"), "48")

Equal("empty payload", ParseCustomCommandsPayload("").Length, 0)
Equal("one payload row", ParseCustomCommandsPayload("Mail`turl`thttps://x.y`t`n").Length, 1)
Throws("malformed payload rejected", () => ParseCustomCommandsPayload("a`tb`tc"), "malformed")
many := ""
Loop 31
    many .= "n" A_Index "`turl`thttps://x.y`t`n"
Throws("31 commands rejected", () => ParseCustomCommandsPayload(many), "30")

; ------------------------------------------------------------ quick actions
Equal("quick action id trimmed", ValidateQuickActionId(" view:notes "), "view:notes")
Equal("custom command id with spaces", ValidateQuickActionId("cmd:My tool"), "cmd:My tool")
Throws("unknown quick action kind rejected", () => ValidateQuickActionId("exec:calc.exe"), "not valid")
Throws("quick action with a pipe rejected", () => ValidateQuickActionId("cmd:a|b"), "not valid")
Throws("quick action with control characters rejected", () => ValidateQuickActionId("view:notes`tx"), "not valid")
Throws("empty quick action rejected", () => ValidateQuickActionId("view:"), "not valid")
Equal("quick actions parsed, duplicates dropped", JoinArray(ParseQuickActionsPayload("view:notes`nlaunch:terminal`r`nview:notes`n"), ","), "view:notes,launch:terminal")
Equal("empty quick actions allowed", ParseQuickActionsPayload("").Length, 0)
Throws("seven quick actions rejected", () => ParseQuickActionsPayload("view:a`nview:b`nview:c`nview:d`nview:e`nview:f`nview:g"), "6")

; ------------------------------------------------------------ search
Equal("DuckDuckGo template valid", ValidateSearchTemplate(" https://duckduckgo.com/?q=%s "), "https://duckduckgo.com/?q=%s")
Throws("http template rejected", () => ValidateSearchTemplate("http://x.y/?q=%s"), "https")
Throws("template without %s rejected", () => ValidateSearchTemplate("https://x.y/"), "%s")
Equal("URI encoding (ASCII)", UriEncode("a b&c/d"), "a%20b%26c%2Fd")
Equal("URI encoding (UTF-8)", UriEncode("é"), "%C3%A9")
Equal("search URL built", BuildSearchUrl("https://x.y/?q=%s", "two words"), "https://x.y/?q=two%20words")
Equal("search query sanitized", SanitizeSearchQuery(' a"b`tc  d '), "a b c d")
Equal("search query capped", StrLen(SanitizeSearchQuery(StrRepeat("x", 300))), 200)

; ------------------------------------------------------------ activity
line := FormatActivityLine("2026-11-02T10:00:00", "launch", "Opened`nTerminal")
item := ParseActivityLine(line)
Check("activity round trip", IsObject(item) && item["kind"] = "launch" && item["text"] = "Opened Terminal")
Check("unknown activity kind rejected", ParseActivityLine("2026-11-02T10:00:00`thack`tx") = "")
Check("bad activity time rejected", ParseActivityLine("yesterday`tlaunch`tx") = "")
Equal("activity text capped", StrLen(ParseActivityLine(FormatActivityLine("2026-11-02T10:00:00", "note", StrRepeat("x", 500)))["text"]), 200)

; ------------------------------------------------------------ JSON helpers
Equal("JSON quoting", JsonQuote('a"b\c' "`n"), '"a\"b\\c\n"')
Check("valid JSON object accepted", IsValidJsonObject('{"version":2,"notes":[{"a":true,"b":null,"c":-1.5e3}]}'))
Check("truncated JSON rejected", !IsValidJsonObject('{"version":2,"notes":['))
Check("JSON array root rejected", !IsValidJsonObject('[1,2]'))

; ------------------------------------------------------------ key combinations
combo := ParseKeyCombo(" control + alt + space ")
Equal("combo canonical display", combo["display"], "Ctrl+Alt+Space")
Equal("combo send string", combo["send"], "^!{Space}")
Equal("combo modifier order", ParseKeyCombo("Shift+Win+k")["send"], "+#{K}")
Equal("empty combo means none", ParseKeyCombo("  ")["send"], "")
Throws("bare key rejected", () => ParseKeyCombo("Space"), "needs Ctrl")
Throws("shift-only rejected", () => ParseKeyCombo("Shift+A"), "needs Ctrl")
Throws("two keys rejected", () => ParseKeyCombo("Ctrl+A+B"), "exactly one")
Throws("send syntax rejected", () => ParseKeyCombo("Ctrl+{Enter}"), "Space, a letter")
Throws("raw text rejected", () => ParseKeyCombo("Ctrl+hello"), "Space, a letter")
Throws("F24 rejected", () => ParseKeyCombo("Ctrl+F24"), "F1 to F12")
Throws("repeated modifier rejected", () => ParseKeyCombo("Ctrl+Ctrl+A"), "repeats")

; ------------------------------------------------------------ almanac
Equal("yearly countdown date", ValidateCountdownDate(" 12-25 "), "12-25")
Equal("one-off countdown date", ValidateCountdownDate("2027-03-14"), "2027-03-14")
Equal("leap day allowed yearly", ValidateCountdownDate("02-29"), "02-29")
Throws("leap day rejected in a common year", () => ValidateCountdownDate("2027-02-29"), "not a real date")
Throws("month 13 rejected", () => ValidateCountdownDate("13-01"), "not a real date")
Throws("April 31 rejected", () => ValidateCountdownDate("04-31"), "not a real date")
Throws("free text date rejected", () => ValidateCountdownDate("Christmas"), "MM-DD")
Throws("countdown name with pipe rejected", () => ValidateCountdownName("a|b"), "|")
Throws("empty countdown name rejected", () => ValidateCountdownName("  "), "needs a name")
almanac := ParseAlmanacPayload("1`n12-25|Christmas`n`n2027-01-01|Launch")
Equal("almanac payload enables Wikipedia", almanac["wikipedia"], true)
Equal("almanac payload countdowns", almanac["countdowns"].Length, 2)
Equal("almanac payload keeps names", almanac["countdowns"][2]["name"], "Launch")
sorted := ParseAlmanacPayload("0`n2027-01-01|Launch`n12-25|Christmas`n02-14|Valentine's`n2026-12-01|Trip")["countdowns"]
Equal("countdowns sorted: annual first, Jan-Dec, then one-offs by date",
    sorted[1]["name"] "," sorted[2]["name"] "," sorted[3]["name"] "," sorted[4]["name"],
    "Valentine's,Christmas,Trip,Launch")
Equal("almanac payload with no countdowns", ParseAlmanacPayload("0")["countdowns"].Length, 0)
Throws("almanac payload needs a flag", () => ParseAlmanacPayload("yes`n12-25|X"), "invalid shape")
Throws("almanac payload rejects extra fields", () => ParseAlmanacPayload("1`n12-25|X|Y"), "date and a name")
many := "1"
Loop 13
    many .= "`n12-25|Day " A_Index
Throws("almanac payload caps countdowns", () => ParseAlmanacPayload(many), "Up to 12")
Equal("Wikipedia URL is built here", BuildWikipediaUrl("Hughes H-4 Hercules"), "https://en.wikipedia.org/wiki/Hughes_H-4_Hercules")
Equal("Wikipedia URL encodes characters", BuildWikipediaUrl("AC/DC"), "https://en.wikipedia.org/wiki/AC%2FDC")
Throws("title with fragment rejected", () => BuildWikipediaUrl("Page#x"), "Invalid")
Throws("title with traversal rejected", () => BuildWikipediaUrl("../../w/api.php"), "Invalid")
Throws("title with control rejected", () => BuildWikipediaUrl("a`nb"), "Invalid")
Throws("empty title rejected", () => BuildWikipediaUrl(""), "Invalid")
Equal("featured feed URL", AlmanacFeedUrl("featured", "2026", "11", "03"), "https://en.wikipedia.org/api/rest_v1/feed/featured/2026/11/03")
Equal("holidays feed URL", AlmanacFeedUrl("holidays", "2026", "11", "03"), "https://en.wikipedia.org/api/rest_v1/feed/onthisday/holidays/11/03")
Throws("unknown feed rejected", () => AlmanacFeedUrl("news", "2026", "11", "03"), "Unknown")

; ------------------------------------------------------------ games
; Builds a buffer from parts: strings become u32 length + UTF-8; integers
; become a raw u32; "raw:XYZ" is written as plain bytes.
MakeBinary(parts*) {
    total := 0
    for part in parts {
        if IsInteger(part)
            total += 4
        else if (SubStr(part, 1, 4) = "raw:")
            total += StrPut(SubStr(part, 5), "UTF-8") - 1
        else
            total += 4 + StrPut(part, "UTF-8") - 1
    }
    buf := Buffer(total, 0)
    offset := 0
    for part in parts {
        if IsInteger(part) {
            NumPut("UInt", part, buf, offset)
            offset += 4
        } else if (SubStr(part, 1, 4) = "raw:") {
            n := StrPut(SubStr(part, 5), "UTF-8") - 1
            StrPut(SubStr(part, 5), buf.Ptr + offset, n, "UTF-8")
            offset += n
        } else {
            n := StrPut(part, "UTF-8") - 1
            NumPut("UInt", n, buf, offset)
            StrPut(part, buf.Ptr + offset + 4, n, "UTF-8")
            offset += 4 + n
        }
    }
    return buf
}

pt := ParsePcsx2Playtime("SLUS-20812                       143                  1768363854          `r`n20060905-125923                  1664                 1788720551`nnot a line`n")
Equal("PCSX2 playtime lines", pt.Length, 2)
Equal("PCSX2 serial", pt[1]["serial"], "SLUS-20812")
Equal("PCSX2 seconds", pt[1]["seconds"], 143)
Equal("PCSX2 last played", pt[2]["last"], 1788720551)

dt := ParseDolphinTimePlayed("[TimePlayed]`nR8PP01 = 0x0000000004e9788f`n0000000100000002 = 0x00000000001bde60`nBAD = 0x10`n")
Equal("Dolphin keeps disc IDs only", dt.Count, 1)
Equal("Dolphin milliseconds to seconds", dt["R8PP01"], 82409)

rt := ParseRetroArchRuntime('{"version":"1.0","runtime":"11:30:06","last_played":"2026-10-07 19:44:50","play_count":"31","state_slot":"0"}')
Equal("RetroArch runtime seconds", rt["seconds"], 41406)
Equal("RetroArch last played", rt["last"], "2026-10-07T19:44:50")
Equal("RetroArch play count", rt["count"], 31)
Equal("non-runtime text is ignored", ParseRetroArchRuntime('{"x":1}'), "")

history := ParseRetroArchHistory('{"items":[{"path": "J:\\Lib\\PS1\\Brave Fencer Musashi (USA).cue", "label": "Brave Fencer Musashi (USA)", "core_path": "C:\\Retroarch\\cores\\mednafen_psx_libretro.dll", "core_name": "Sony - PlayStation (Beetle PSX)", "crc32": "SLUS-00726|serial", "db_name": "Sony - PlayStation.lpl"},{"path": "J:\x.zip#y.sfc", "label": "Y", "core_path": "DETECT", "core_name": "DETECT", "crc32": "", "db_name": ""}]}')
Equal("history items with a core", history.Length, 1)
Equal("history path unescaped", history[1]["path"], "J:\Lib\PS1\Brave Fencer Musashi (USA).cue")
Equal("history system name", history[1]["db"], "Sony - PlayStation")
Equal("content base name", ContentBaseName("J:\x\Mario Paint (Japan, USA).zip#Mario Paint.sfc"), "Mario Paint (Japan, USA)")
Equal("content file path", ContentFilePath("J:\x\Mario.zip#Mario.sfc"), "J:\x\Mario.zip")
Equal("thumbnail name", RetroArchThumbnailName("Ratchet & Clank: Going *Commando*?"), "Ratchet _ Clank_ Going _Commando__")

ps2 := MakeBinary("raw:GLCE", 34, "J:\Retro Library\PS2\Devil May Cry (Europe).iso", "SLES-50358", "Devil May Cry", 0, 0, "raw:junk", "J:\Retro Library\PS2\Okami (USA).iso", "SLUS-21115", "Okami")
ps2games := ParsePcsx2GameList(ps2, ps2.Size)
Equal("PCSX2 game list entries", ps2games.Count, 2)
Equal("PCSX2 game list title", ps2games["SLUS-21115"]["title"], "Okami")
Equal("PCSX2 game list path", ps2games["SLES-50358"]["path"], "J:\Retro Library\PS2\Devil May Cry (Europe).iso")
bad := MakeBinary("raw:NOPE", 1, "J:\x.iso", "SLUS-00001", "X")
Equal("PCSX2 game list needs its signature", ParsePcsx2GameList(bad, bad.Size).Count, 0)

; 1.9.2: the native byte search, with guard bytes after the range it may read.
guarded := Buffer(16, 0xCC)
Loop 8
    NumPut("UChar", A_Index, guarded, A_Index - 1)
Equal("find byte: first position", FindByte(guarded, 8, 1, 0), 0)
Equal("find byte: last position", FindByte(guarded, 8, 8, 0), 7)
Equal("find byte: not before from", FindByte(guarded, 8, 2, 2), -1)
Equal("find byte: stops at the guard", FindByte(guarded, 8, 0xCC, 0), -1)
Equal("find byte: from at the end", FindByte(guarded, 8, 1, 8), -1)
Equal("find byte: a size past the buffer", FindByte(guarded, 17, 1, 0), -1)
guardIntact := true
Loop 8
    guardIntact := guardIntact && NumGet(guarded, 7 + A_Index, "UChar") = 0xCC
Check("find byte: guard bytes unchanged", guardIntact)

gc := MakeBinary(27, 0, "J:/Retro Library/GCN/Animal Crossing (USA).nkit.iso", "Animal Crossing (USA).nkit.iso", 1, 1, 15, "raw:Animal Crossing", "AnimalCrossing", "GAFE01", "GAFE01", "J:/Retro Library/Wii/Wii Sports (USA).rvz", "Wii Sports (USA).rvz", "RSPE01")
gcgames := ParseDolphinGameList(gc, gc.Size)
Equal("Dolphin game list entries", gcgames.Count, 2)
Equal("Dolphin path uses backslashes", gcgames["GAFE01"]["path"], "J:\Retro Library\GCN\Animal Crossing (USA).nkit.iso")
Equal("Dolphin second entry", gcgames["RSPE01"]["file"], "Wii Sports (USA).rvz")
Equal("title from disc file", GameTitleFromFile("Animal Crossing (USA).nkit.iso"), "Animal Crossing (USA)")

Equal("headphones match despite Windows' instance number", DeviceNameMatches("Headphones (2- SteelSeries Arctis Nova 5)", "Headphones (Steel Series Arctis Nova 5)"), true)
Equal("other devices do not match", DeviceNameMatches("Headset Microphone (2- SteelSeries Arctis Nova 5)", "Headphones (SteelSeries Arctis Nova 5)"), false)
Equal("empty wanted name never matches", DeviceNameMatches("Speakers", ""), false)

Equal("executable path accepted", ValidateExecutablePath("C:\Windows\notepad.exe", "Test"), "C:\Windows\notepad.exe")
Equal("empty executable path allowed", ValidateExecutablePath("  ", "Test"), "")
Throws("non-exe rejected", () => ValidateExecutablePath("C:\Windows\win.ini", "Test"), "full path")
Throws("quoted path rejected", () => ValidateExecutablePath('C:\a" -x "b.exe', "Test"), "full path")
Throws("missing exe rejected", () => ValidateExecutablePath("C:\nope\nothing.exe", "Test"), "not found")

Equal("RA user accepted", ValidateRetroAchievementsUser("Lion_Samurai"), "Lion_Samurai")
Throws("RA user with symbols rejected", () => ValidateRetroAchievementsUser("a&y=b"), "not valid")
Throws("RA key with symbols rejected", () => ValidateRetroAchievementsKey("abc&u=x"), "not valid")
Equal("game ids", ValidateGameId("ps2:SLUS-21115") ValidateGameId("gc:GAFE01") ValidateGameId("ra:12"), "ps2:SLUS-21115gc:GAFE01ra:12")
Equal("Steam game id", ValidateGameId("st:1004640"), "st:1004640")
Throws("Steam id with letters rejected", () => ValidateGameId("st:12x"), "Invalid")
Throws("game id with a path rejected", () => ValidateGameId("ra:..\x"), "Invalid")

; ------------------------------------------------------------ Steam
manifest := ParseSteamManifest('"AppState"`n{`n`t"appid"`t`t"1004640"`n`t"name"`t`t"FINAL FANTASY TACTICS - The Ivalice Chronicles"`n`t"installdir"`t`t"FFT"`n`t"LastPlayed"`t`t"1767235720"`n`t"SizeOnDisk"`t`t"10559040113"`n`t"UserConfig"`n`t{`n`t`t"name"`t`t"ignored"`n`t}`n}')
Equal("manifest app id", manifest["appid"], "1004640")
Equal("manifest name (first wins)", manifest["name"], "FINAL FANTASY TACTICS - The Ivalice Chronicles")
Equal("manifest last played", manifest["LastPlayed"], "1767235720")
folders := ParseSteamLibraryFolders('"libraryfolders"`n{`n`t"0"`n`t{`n`t`t"path"`t`t"C:\\Program Files (x86)\\Steam"`n`t}`n`t"1"`n`t{`n`t`t"path"`t`t"D:\\SteamLibrary"`n`t}`n`t"2"`n`t{`n`t`t"path"`t`t"relative\\nope"`n`t}`n}')
Equal("library folders", folders.Length, 2)
Equal("library folder unescaped", folders[2], "D:\SteamLibrary")
playtime := ParseSteamPlaytime('"UserLocalConfigStore"`n{`n"Software"`n{`n"Valve"`n{`n"Steam"`n{`n"apps"`n{`n"413150"`n{`n"LastPlayed"`t"1719884998"`n"Playtime"`t"225"`n"cloud"`n{`n"Playtime"`t"999"`n}`n}`n"105600"`n{`n"Playtime"`t"49"`n}`n}`n}`n}`n}`n"friends"`n{`n"apps"`n{`n"1"`n{`n"Playtime"`t"5"`n}`n}`n}`n}')
Equal("Steam apps with play time", playtime.Count, 2)
Equal("Steam minutes", playtime["413150"]["minutes"], 225)
Equal("nested blocks inside an app are ignored", playtime["413150"]["minutes"] != 999, true)
Equal("Steam last played", playtime["413150"]["last"], 1719884998)
Equal("only Software > Valve > Steam > apps counts", playtime.Has("1"), false)
Equal("Steam tools are not games", IsSteamTool("Steamworks Common Redistributables") && !IsSteamTool("Stardew Valley"), true)

; ------------------------------------------------------------ controllers
Equal("controller key", ControllerKey(0x2DC8, 0x3109), "2DC8:3109")
Equal("controller key masks to 16 bits", ControllerKey(0x12DC8, 0x6009), "2DC8:6009")
Throws("controller key with junk rejected", () => ValidateControllerKey("2DC8:31\x"), "Invalid")
Equal("X-input mode", ControllerMode(0x045E, 0x028E), "X-input")
Equal("Switch mode", ControllerMode(0x057E, 0x2009), "Switch")
Equal("8BitDo D-input mode", ControllerMode(0x2DC8, 0x6009), "D-input")
Equal("maker name", ControllerMaker(0x2DC8), "8BitDo controller")
Equal("receiver recognized", IsReceiverName("Controller (8BitDo Pro 3 Receiver)"), true)
Equal("adapter recognized", IsReceiverName("8BitDo USB Wireless Adapter 2"), true)
Equal("a controller is not a receiver", IsReceiverName("8BitDo Pro 3"), false)
Equal("controller name trimmed", ValidateControllerName("  Lion's Pro 3  "), "Lion's Pro 3")
Equal("empty name resets", ValidateControllerName(""), "")
Throws("long controller name rejected", () => ValidateControllerName(StrRepeat("x", 49)), "48")
Throws("controller name with markup rejected", () => ValidateControllerName("<b>pad"), "48")
Equal("Bluetooth HID connection", HidConnection("{00001124-0000-1000-8000-00805f9b34fb}_VID&0002057e_PID&2009"), "Bluetooth")
Equal("USB HID connection", HidConnection("VID_2DC8&PID_3109&MI_00"), "USB")
ids := HidKeyIds("{00001124-0000-1000-8000-00805f9b34fb}_VID&0002057e_PID&2009")
Equal("Bluetooth HID ids", ControllerKey(ids["vid"], ids["pid"]), "057E:2009")
ids := HidKeyIds("VID_2DC8&PID_3109&MI_00")
Equal("USB HID ids", ControllerKey(ids["vid"], ids["pid"]), "2DC8:3109")
Equal("no ids in other keys", HidKeyIds("ACPI\PNP0303"), 0)

; ------------------------------------------------------------ Steam app names (appinfo.vdf)
HexToBuffer(hex) {
    buf := Buffer(StrLen(hex) // 2)
    Loop buf.Size
        NumPut("UChar", Integer("0x" SubStr(hex, A_Index * 2 - 1, 2)), buf, A_Index - 1)
    return buf
}
appinfo := HexToBuffer("2944560701000000550100000000000090010000780000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020100000090010000000400000001030000006465636f7900080002000000010400000047616d65000103000000506f7274616c000808e7030000580000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000001030000004e6f742077616e7465640008086c02000059000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000103000000506f7274616c203220c3a90008080000000005000000617070696e666f00617070696400636f6d6d6f6e006e616d65007479706500")
wantedApps := Map("400", true, "620", true, "12345", true)
steamNames := ParseSteamAppNames(appinfo, appinfo.Size, wantedApps)
Equal("appinfo names found for wanted apps", steamNames.Count, 2)
Equal("appinfo common name, not a decoy outside common", steamNames["400"], "Portal")
Equal("appinfo UTF-8 name", steamNames["620"], "Portal 2 " Chr(0xE9))
Equal("appinfo skips unwanted apps", steamNames.Has("999"), false)
Equal("appinfo rejects other files", ParseSteamAppNames(HexToBuffer("00112233445566778899aabbccddeeff"), 16, wantedApps).Count, 0)
truncated := HexToBuffer(SubStr("2944560701000000550100000000000090010000780000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020100000090010000000400000001030000006465636f7900080002000000010400000047616d65000103000000506f7274616c000808e7030000580000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000001030000004e6f742077616e7465640008086c02000059000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000103000000506f7274616c203220c3a90008080000000005000000617070696e666f00617070696400636f6d6d6f6e006e616d65007479706500", 1, 200))
Equal("appinfo survives a truncated file", ParseSteamAppNames(truncated, truncated.Size, wantedApps).Count, 0)

; ------------------------------------------------------------ RetroAchievements images
badge := RetroAchievementsImage("b:250336")
Equal("badge address", badge["url"], "https://media.retroachievements.org/Badge/250336.png")
Equal("badge cache file", badge["file"], "b-250336.png")
Equal("icon address", RetroAchievementsImage("i:066043")["url"], "https://media.retroachievements.org/Images/066043.png")
Throws("image token with a path rejected", () => RetroAchievementsImage("i:../x"), "Invalid")
Throws("image token with a host rejected", () => RetroAchievementsImage("b:1@evil.example"), "Invalid")
Throws("unknown image kind rejected", () => RetroAchievementsImage("x:1"), "Invalid")
Equal("cache file names: badge", IsRaImageCacheFile("b-250336.png"), true)
Equal("cache file names: partial write", IsRaImageCacheFile("i-066043.png.tmp"), true)
Equal("cache file names: anything else is left alone", IsRaImageCacheFile("notes.txt") || IsRaImageCacheFile("b-1.png.bak") || IsRaImageCacheFile("..\b-1.png"), false)
CacheEntry(name, size, time) => Map("name", name, "size", size, "time", time)
JoinList(items) {
    text := ""
    for item in items
        text .= (A_Index > 1 ? "," : "") item
    return text
}
cacheFiles := [
    CacheEntry("b-3.png", 400, "20261103120000"),
    CacheEntry("b-1.png", 400, "20250101000000"),
    CacheEntry("i-2.png", 400, "20260601000000"),
    CacheEntry("readme.txt", 99999, "20000101000000"),
    CacheEntry("b-9.png.tmp", 10, "20261103120000")
]
Equal("cache under the cap: only the partial write goes", JoinList(RaImagesToPrune(cacheFiles, 1200, 800)), "b-9.png.tmp")
Equal("cache over the cap: least recently used go first, down to the target", JoinList(RaImagesToPrune(cacheFiles, 1000, 800)), "b-9.png.tmp,b-1.png")
Equal("cache far over the cap", JoinList(RaImagesToPrune(cacheFiles, 100, 0)), "b-9.png.tmp,b-1.png,i-2.png,b-3.png")
Equal("empty cache", RaImagesToPrune([], 100, 50).Length, 0)

; ------------------------------------------------------------ Sounds
Equal("sound kind: wav plays in the page", SoundKind("WAV"), "web")
Equal("sound kind: MIDI plays through Windows", SoundKind("mid"), "windows")
Equal("sound kind: raw data isn't listed", SoundKind("raw"), "")
era := ParseSoundEra("(1998) Windows 98")
Equal("era: year and label", era["year"] " " era["label"], "1998 Windows 98")
Equal("era: long label kept", ParseSoundEra("(2015) Windows 10 (Beta) (Insider Preview builds 10074 - 10127)")["label"], "Windows 10 (Beta) (Insider Preview builds 10074 - 10127)")
Equal("era: your own folder", ParseSoundEra("Aeolionware Startup")["year"], 0)

; 1.9.0: workspaces across desktops
targets := WorkspaceDesktopTargets(Map(0, "", 1, "", 2, ""), ["", "", ""])
Equal("desktops: same numbers when unnamed", targets[0] "," targets[1] "," targets[2], "0,1,2")
targets := WorkspaceDesktopTargets(Map(0, "", 2, "Games"), ["Games", "", ""])
Equal("desktops: a named desktop follows its name", targets[2], 0)
Equal("desktops: unnamed keeps its number", targets[0], 0)
targets := WorkspaceDesktopTargets(Map(0, "", 1, "", 3, ""), ["", ""])
Equal("desktops: a missing one has no target", targets[3], -1)
Equal("desktops: one that exists keeps it", targets[1], 1)
Equal("desktops: how many to add for the missing one", WorkspaceDesktopsMissing(targets, ["", ""]), 2)
Equal("desktops: none missing", WorkspaceDesktopsMissing(WorkspaceDesktopTargets(Map(0, ""), [""]), [""]), 0)
targets := WorkspaceDesktopTargets(Map(0, "work", 1, "WORK"), ["Work", ""])
Equal("desktops: a name is taken only once", targets[0] "," targets[1], "0,1")
Equal("desktops: names compare without case", WorkspaceDesktopTargets(Map(4, "music"), ["", "Music"])[4], 1)

; 1.10.0: launch rules' app paths
Equal("rule path: an app", ValidateRulePath("C:\Program Files\Microsoft VS Code\Code.exe"), "C:\Program Files\Microsoft VS Code\Code.exe")
Equal("rule path: trimmed", ValidateRulePath("  D:\Games\a.EXE "), "D:\Games\a.EXE")
for bad in ["", "Code.exe", "C:\Tools\script.ahk", "\\server\share\a.exe", "C:\a\..\b.exe", "C:\a<b>.exe", "C:\x.exe`n", "C:\" StrRepeat("a", 300) ".exe"]
    Throws("rule path refused: " SubStr(bad, 1, 24), ValidateRulePath.Bind(bad), "full path")

; 1.11.0: toasts at the top of the screen
NoticesText(notices) {
    out := ""
    for notice in notices
        out .= (out = "" ? "" : " / ") NoticeLine(notice)
    return out
}
stack := []
NoticeAdd(stack, "One", 1000)
Equal("notice: added", NoticesText(stack), "One")
Equal("notice: lasts three seconds", NoticeNextExpiry(stack, 1000), 3000)
NoticeAdd(stack, "Two", 1500)
NoticeAdd(stack, "One", 2000)
Equal("notice: a repeat moves down and counts", NoticesText(stack), "Two / One ×2")
Equal("notice: a repeat restarts its time", stack[2]["expires"], 5000)
Equal("notice: the next to go is the soonest", NoticeNextExpiry(stack, 2000), 2500)
NoticeAdd(stack, "Three", 2100)
NoticeAdd(stack, "Four", 2200)
Equal("notice: at most three, the oldest goes", NoticesText(stack), "One ×2 / Three / Four")
NoticeExpire(stack, 5000)
Equal("notice: gone when its time is up", NoticesText(stack), "Three / Four")
NoticeExpire(stack, 5200)
Equal("notice: all gone", stack.Length, 0)
Equal("notice: nothing left to wait for", NoticeNextExpiry(stack, 6000), 0)
Check("notice: a late timer still waits a little", (NoticeAdd(stack, "Late", 0), NoticeNextExpiry(stack, 9000) = 1))
stack := []
NoticeAdd(stack, "   ", 0)
Equal("notice: nothing to say", stack.Length, 0)
NoticeAdd(stack, "a`tb`r`nc", 0)
Equal("notice: control characters go, line breaks stay", stack[1]["text"], "a b `nc")
stack := []
NoticeAdd(stack, StrRepeat("x", 500), 0)
Equal("notice: long text is cut", StrLen(stack[1]["text"]), 240)
stack := []
NoticeAdd(stack, "Case", 0), NoticeAdd(stack, "case", 0)
Equal("notice: different case is a different message", stack.Length, 2)
Check("notice: a short line needs no wrap", !NoticeNeedsWrap("Captured selection to Quick Notes."))
Check("notice: a long line wraps", NoticeNeedsWrap(StrRepeat("x", 71)))
Check("notice: short lines together don't", !NoticeNeedsWrap(StrRepeat("x", 60) "`n" StrRepeat("y", 60)))

; 1.10.0: a window that fills the usable screen counts as maximized
Check("fills: exactly", WorkspaceFillsMonitor(0, 0, 1, 1))
Check("fills: off by a few pixels", WorkspaceFillsMonitor(0.002, -0.002, 0.998, 1.003))
Check("fills: not when narrower", !WorkspaceFillsMonitor(0, 0, 0.98, 1))
Check("fills: not when moved over", !WorkspaceFillsMonitor(0.02, 0, 1, 1))
Check("fills: not when it also covers the taskbar", !WorkspaceFillsMonitor(0, 0, 1, 1.02))

; 1.10.0: editing a saved workspace
Throws("workspace name with a trailing newline refused", () => ValidateWorkspaceName("Coding`n"), "letters")
edited := ParseWorkspaceWindowEdit("Coding|2|1|1|0.3|0|0.45|1.0000|0|0|1")
Equal("edit: name", edited["name"], "Coding")
Equal("edit: index", edited["index"], 2)
Equal("edit: desktop", edited["desktop"], 1)
Equal("edit: width", edited["width"], 0.45)
Equal("edit: height", edited["height"], 1.0)
Equal("edit: maximized off", edited["maximized"], false)
Equal("edit: enabled on", edited["enabled"], true)
Equal("edit: Default in any case", ParseWorkspaceWindowEdit("default|1|0|1|0|0|1|1|1|0|1")["name"], "Default")
Equal("edit: pinned goes to every desktop", ParseWorkspaceWindowEdit("Coding|1|2|1|0|0|0.5|0.5|0|1|1")["desktop"], -1)
Equal("edit: a window saved without desktops", ParseWorkspaceWindowEdit("Coding|1|-2|1|0|0|0.5|0.5|0|0|1")["desktop"], -2)
Equal("edit: just inside after rounding", ParseWorkspaceWindowEdit("Coding|1|0|1|0.6667|0|0.3334|1|0|0|1")["x"], 0.6667)
for bad in ["Coding|1|0|1|0|0|1|1|0|0", "Coding|1|0|1|0|0|1|1|0|0|1|1", "a/b|1|0|1|0|0|1|1|0|0|1",
    "Coding|0|0|1|0|0|1|1|0|0|1", "Coding|49|0|1|0|0|1|1|0|0|1", "Coding|x|0|1|0|0|1|1|0|0|1",
    "Coding|1|20|1|0|0|1|1|0|0|1", "Coding|1|-3|1|0|0|1|1|0|0|1", "Coding|1|-1|1|0|0|1|1|0|0|1",
    "Coding|1|0|0|0|0|1|1|0|0|1", "Coding|1|0|17|0|0|1|1|0|0|1",
    "Coding|1|0|1|-0.1|0|1|1|0|0|1", "Coding|1|0|1|1.5|0|1|1|0|0|1", "Coding|1|0|1|0.12345|0|0.5|1|0|0|1", "Coding|1|0|1|1e-1|0|0.5|1|0|0|1",
    "Coding|1|0|1|0|0|0.03|1|0|0|1", "Coding|1|0|1|0|0|1|0.03|0|0|1", "Coding|1|0|1|0.7|0|0.5|1|0|0|1", "Coding|1|0|1|0|0.7|1|0.5|0|0|1",
    "Coding|1|0|1|0|0|1|1|2|0|1", "Coding|1|0|1|0|0|1|1|0|x|1", "Coding|1|0|1|0|0|1|1|0|0|1`n", "Coding|1`n|0|1|0|0|1|1|0|0|1"]
    Throws("edit refused: " StrReplace(bad, "`n", "\n"), ParseWorkspaceWindowEdit.Bind(bad))
windowRef := ParseWorkspaceWindowRef("Coding|3")
Equal("window ref: name", windowRef["name"], "Coding")
Equal("window ref: index", windowRef["index"], 3)
Equal("window ref: Default", ParseWorkspaceWindowRef("|1")["name"], "Default")
for bad in ["Coding", "Coding|1|2", "Coding|0", "Coding|49", "Coding|one", "a/b|1", "Coding|1`n"]
    Throws("window ref refused: " StrReplace(bad, "`n", "\n"), ParseWorkspaceWindowRef.Bind(bad))
Equal("add: an unnamed desktop keeps its number", WorkspaceAddDesktopIndex(["", ""], 1, ""), 1)
Equal("add: found by name", WorkspaceAddDesktopIndex(["Work", "Games"], 0, "Games"), 1)
Equal("add: a new name doesn't take a named desktop's number", WorkspaceAddDesktopIndex(["Work", "Games"], 0, "Mail"), 2)
Equal("add: a new name on an unnamed desktop", WorkspaceAddDesktopIndex(["", "Games"], 0, "Mail"), 0)
Equal("add: past the end keeps its number", WorkspaceAddDesktopIndex(["Work"], 3, ""), 3)
Equal("add: a new name past the end", WorkspaceAddDesktopIndex(["Work"], 3, "Mail"), 3)

; 1.9.0: the achievement browser's game IDs
Equal("ra game: an ID", ValidateRaGameId("14402"), "14402")
for bad in ["", "0", "012", "1234567890", "12a", "1 2", "-5", "14402&u=x"] {
    try {
        ValidateRaGameId(bad)
        Equal("ra game: refused " bad, "accepted", "refused")
    } catch {
        Equal("ra game: refused " bad, "refused", "refused")
    }
}
WavHeader(dataSize, byteRate, withList := false) {
    hex := "52494646" "00000000" "57415645" (withList ? "4C495354" "04000000" "494E464F" : "")
        . "666D7420" "10000000" "0100" "0100" "401F0000" NumHex(byteRate) "0200" "1000"
        . "64617461" NumHex(dataSize)
    return HexToBuffer(hex)
}
NumHex(n) => Format("{:02X}{:02X}{:02X}{:02X}", n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255)
hdr := WavHeader(16000, 16000)
Equal("wav length: one second", WavSeconds(hdr, hdr.Size), 1)
hdr := WavHeader(88200, 176400, true)
Equal("wav length: after a LIST chunk", WavSeconds(hdr, hdr.Size), 0.5)
hdr := HexToBuffer("4944330300000000000000000000000000000000000000000000000000000000000000000000000000000000")
Equal("wav length: not a WAV", WavSeconds(hdr, hdr.Size), 0)
Equal("library: a normal folder", ValidateSoundLibrary("C:\Sounds\all-windows-sounds-main\"), "C:\Sounds\all-windows-sounds-main")
Throws("library: a drive root", () => ValidateSoundLibrary("C:\"), "Choose a folder")
Throws("library: the Windows folder", () => ValidateSoundLibrary("C:\Windows"), "system or profile")
Throws("library: a profile folder", () => ValidateSoundLibrary("C:\Users\lions"), "system or profile")
Throws("library: relative", () => ValidateSoundLibrary("Sounds"), "Choose a folder")
Throws("library: parent hops", () => ValidateSoundLibrary("C:\Sounds\..\Windows"), "Choose a folder")
Equal("leveled name", LeveledSoundName("CHIMES", -7.6), "CHIMES (-7.6 dB).wav")
Equal("leveled name: positive, odd characters dropped", LeveledSoundName('Ding: "loud"?', 3.04), "Ding loud (+3.0 dB).wav")
Equal("windows sound: allowlisted", WindowsSoundEvent("Explorer/EmptyRecycleBin")[3], "Empty Recycle Bin")
Throws("windows sound: anything else refused", () => WindowsSoundEvent(".Default/..\..\Run"), "can't be changed")
Throws("windows sound: case must match", () => WindowsSoundEvent(".default/windowslogon"), "can't be changed")

; ------------------------------------------------------------ Calendar
Equal("calendar id", ValidateCalendarId("personal"), "personal")
Throws("calendar id: a path", () => ValidateCalendarId("../ascs"), "calendar id")
Throws("calendar id: uppercase", () => ValidateCalendarId("Work"), "calendar id")
Throws("calendar id: empty", () => ValidateCalendarId(""), "calendar id")
Equal("event uid", ValidateEventUid("ascs-20261103-ab12@ascs"), "ascs-20261103-ab12@ascs")
Throws("event uid: slash", () => ValidateEventUid("a/b"), "event id")
Throws("event uid: parent hops", () => ValidateEventUid("a..b"), "event id")
Throws("event uid: leading dot", () => ValidateEventUid(".hidden"), "event id")
Equal("etag", ValidateEtag('"1a2b3c"'), '"1a2b3c"')
Equal("etag: none", ValidateEtag(""), "")
Throws("etag: header injection", () => ValidateEtag('"x"' "`r`nX-Evil: 1"), "event version")
Equal("color", ValidateCalendarColor("#8b6ff5"), "#8B6FF5")
Throws("color: not a color", () => ValidateCalendarColor("red"), "color")
Throws("calendar name: too long", () => ValidateCalendarName(StrRepeat("a", 61)), "1 to 60")
ics := "BEGIN:VCALENDAR`r`nVERSION:2.0`r`nBEGIN:VEVENT`r`nUID:x`r`nEND:VEVENT`r`nEND:VCALENDAR`r`n"
Equal("ics: accepted", ValidateIcs(ics), ics)
Throws("ics: not a calendar", () => ValidateIcs("<html></html>"), "iCalendar")
Throws("ics: two calendars", () => ValidateIcs(ics ics), "one calendar")
Throws("ics: control characters", () => ValidateIcs(StrReplace(ics, "UID:x", "UID:x" Chr(1))), "control")
r := CalDavRequest("ascs", "calendars")
Equal("caldav: list calendars", r["method"] " " r["path"] " depth " r["headers"]["Depth"], "PROPFIND /ascs/ depth 1")
r := CalDavRequest("ascs", "createCalendar", "gaming", , , "Gaming & <Retro>`n#E3C072")
Equal("caldav: create calendar", r["method"] " " r["path"], "MKCOL /ascs/gaming/")
Equal("caldav: names are escaped", InStr(r["body"], "Gaming &amp; &lt;Retro&gt;") > 0 && !InStr(r["body"], "<Retro>"), true)
Equal("caldav: color with alpha", InStr(r["body"], "#E3C072FF") > 0, true)
r := CalDavRequest("ascs", "putEvent", "personal", "abc@ascs", "", ics)
Equal("caldav: a new event never overwrites", r["method"] " " r["path"] " " r["headers"]["If-None-Match"], "PUT /ascs/personal/abc@ascs.ics *")
r := CalDavRequest("ascs", "putEvent", "personal", "abc@ascs", '"e1"', ics)
Equal("caldav: an edit needs the shown version", r["headers"]["If-Match"] (r["headers"].Has("If-None-Match") ? " and none-match" : ""), '"e1"')
r := CalDavRequest("ascs", "deleteEvent", "work", "abc", '"e2"')
Equal("caldav: delete an event", r["method"] " " r["path"] " " r["headers"]["If-Match"], 'DELETE /ascs/work/abc.ics "e2"')
Throws("caldav: unknown operation", () => CalDavRequest("ascs", "propfindEverything"), "Unknown")
Throws("caldav: another account", () => CalDavRequest("../root", "calendars"), "account")
Throws("caldav: a path as calendar", () => CalDavRequest("ascs", "events", "../../etc"), "calendar id")
calFile := "BEGIN:VCALENDAR`r`nVERSION:2.0`r`nBEGIN:VEVENT`r`nUID:a`r`nEND:VEVENT`r`nBEGIN:VEVENT`r`nUID:b`r`nEND:VEVENT`r`nEND:VCALENDAR`r`n"
Equal("calendar file: two events, a leading BOM dropped", SubStr(ValidateCalendarFile(Chr(0xFEFF) calFile), 1, 15), "BEGIN:VCALENDAR")
Throws("calendar file: not iCalendar", () => ValidateCalendarFile("<html>"), "iCalendar")
Throws("calendar file: control characters", () => ValidateCalendarFile(StrReplace(calFile, "UID:a", "UID:" Chr(1))), "control")
reminders := ParseReminderList("1762200000`tDentist`tTue 3:00 PM`n1762200000`tbad`r`nnot-a-time`tx`ty`n1999999999`tToo far`tx`n1762203600`t`tlater", 1762190000)
Equal("reminders: valid lines kept, others dropped", reminders.Length, 2)
Equal("reminders: empty title", reminders[2]["title"], "(No title)")
Equal("reminders: no start or location in the old form", reminders[1]["start"] reminders[1]["location"], "0")
reminders := ParseReminderList("1762200000`tDentist`tToday 3:00 PM`t1762200300`tMain St`n1762200000`tTrip`tToday (all day)`t`t", 1762190000)
Equal("reminders: start and location read", reminders[1]["start"] "|" reminders[1]["location"], "1762200300|Main St")
Equal("reminders: all-day has no start", reminders[2]["start"], 0)
Equal("reminder text: minutes and place", ReminderBalloonText(reminders[1], 1762200000), "Starts in 5 minutes · Today 3:00 PM`nMain St")
Equal("reminder text: one minute", ReminderBalloonText(Map("start", 1762200060, "when", "Today 3:00 PM", "location", ""), 1762200000), "Starts in 1 minute · Today 3:00 PM")
Equal("reminder text: now", ReminderBalloonText(Map("start", 1762200000, "when", "Today 3:00 PM", "location", ""), 1762200010), "Starting now · Today 3:00 PM")
Equal("reminder text: hours", ReminderBalloonText(Map("start", 1762207200, "when", "Today 5:00 PM", "location", ""), 1762200000), "Starts in 2 hours · Today 5:00 PM")
Equal("reminder text: days", ReminderBalloonText(Map("start", 1762200000 + 86400, "when", "Tomorrow 3:00 PM", "location", ""), 1762200000), "Starts in 1 day · Tomorrow 3:00 PM")
Equal("reminder text: all day", ReminderBalloonText(reminders[2], 1762190000), "Today (all day)")

; ------------------------------------------------------------ 1.8.0 preferences
Equal("power delay none", ValidatePowerDelay("0"), 0)
Equal("power delay 5", ValidatePowerDelay(" 5 "), 5)
Equal("power delay 30", ValidatePowerDelay(30), 30)
Throws("power delay 10 rejected", () => ValidatePowerDelay("10"), "power action delay")
Throws("power delay junk rejected", () => ValidatePowerDelay("5; shutdown"), "power action delay")
Equal("ASCS sounds on show", ValidateAscsSoundMode("Show"), "show")
Equal("ASCS sounds off", ValidateAscsSoundMode("off"), "off")
Throws("ASCS sounds junk rejected", () => ValidateAscsSoundMode("always"), "ASCS sounds")

; ------------------------------------------------------------ PSO voice channel
Equal("voice channel from Copy Link", DiscordChannelUri("https://discord.com/channels/866374224574545931/866374225501749313"), "discord://-/channels/866374224574545931/866374225501749313")
Equal("voice channel from a PTB link, trailing slash", DiscordChannelUri(" https://ptb.discord.com/channels/866374224574545931/866374225501749313/ "), "discord://-/channels/866374224574545931/866374225501749313")
Equal("voice channel from the app link", DiscordChannelUri("discord://-/channels/866374224574545931/866374225501749313"), "discord://-/channels/866374224574545931/866374225501749313")
Equal("voice channel cleared", DiscordChannelUri(""), "")
Throws("voice channel: a message link rejected", () => DiscordChannelUri("https://discord.com/channels/866374224574545931/866374225501749313/1234567890123456789"), "Discord channel link")
Throws("voice channel: direct messages rejected", () => DiscordChannelUri("https://discord.com/channels/@me/866374225501749313"), "Discord channel link")
Throws("voice channel: another site rejected", () => DiscordChannelUri("https://discord.com.evil.example/channels/866374224574545931/866374225501749313"), "Discord channel link")
Throws("voice channel: plain http rejected", () => DiscordChannelUri("http://discord.com/channels/866374224574545931/866374225501749313"), "Discord channel link")
Throws("voice channel: extra text rejected", () => DiscordChannelUri("https://discord.com/channels/866374224574545931/866374225501749313?x=1"), "Discord channel link")

; ------------------------------------------------------------ Now playing: which window
Equal("game name: Dolphin", EmulatorGameName("dolphin", "Dolphin 2512 | JIT64 DC | D3D12 | HLE | Super Paper Mario (R8PP01)"), "Super Paper Mario")
Equal("game name: Dolphin menu", EmulatorGameName("dolphin", "Dolphin 2512"), "")
Equal("game name: RetroArch ignores the FPS counter", EmulatorGameName("retroarch", "RetroArch Beetle PSX HW 0.9.44 || Brave Fencer Musashi (USA) || FPS: 59"), EmulatorGameName("retroarch", "RetroArch Beetle PSX HW 0.9.44 || Brave Fencer Musashi (USA) || FPS: 60"))
Equal("game name: RetroArch menu", EmulatorGameName("retroarch", "RetroArch"), "")
Equal("game name: PCSX2", EmulatorGameName("pcsx2", "Okami [SLUS-21115]"), "Okami")
Equal("game name: PCSX2 main window", EmulatorGameName("pcsx2", "PCSX2 v2.4.0"), "")
Win(title, area) => Map("title", title, "area", area)
Equal("window: the game window wins over a focused game list", PickEmulatorWindow("pcsx2", [Win("PCSX2 v2.4.0", 900000), Win("Okami [SLUS-21115]", 2000000)]), "Okami [SLUS-21115]")
Equal("window: a small game-looking dialog loses to the game", PickEmulatorWindow("pcsx2", [Win("Memory Card Manager", 200000), Win("Okami [SLUS-21115]", 2000000)]), "Okami [SLUS-21115]")
Equal("window: Dolphin's render window wins over its main window", PickEmulatorWindow("dolphin", [Win("Dolphin 2512", 1500000), Win("Dolphin 2512 | JIT64 DC | D3D12 | HLE | Super Paper Mario (R8PP01)", 100)]), "Dolphin 2512 | JIT64 DC | D3D12 | HLE | Super Paper Mario (R8PP01)")
Equal("window: only the menu", PickEmulatorWindow("dolphin", [Win("Dolphin 2512", 1500000)]), "Dolphin 2512")
Equal("window: none", PickEmulatorWindow("dolphin", []), "")

; ------------------------------------------------------------ Now playing sessions
seen := Map("owner", 4120, "title", "RetroArch Mupen64Plus || Paper Mario (USA)", "since", 1000)
Equal("session: new instance starts at its process start", PlaySessionSince(0, 4120, "x", 5000, 900), 900)
Equal("session: unknown process start falls back to now", PlaySessionSince(0, 4120, "x", 5000), 5000)
Equal("session: a start time in the future is ignored", PlaySessionSince(0, 4120, "x", 5000, 9000), 5000)
Equal("session: same instance and game carries on", PlaySessionSince(seen, 4120, "RetroArch Mupen64Plus || Paper Mario (USA)", 5000, 900), 1000)
Equal("session: a new game in the same instance starts now", PlaySessionSince(seen, 4120, "RetroArch Mupen64Plus || Super Mario 64 (USA)", 5000, 900), 5000)
Equal("session: a restarted emulator uses its new start time", PlaySessionSince(seen, 7777, "RetroArch Mupen64Plus || Paper Mario (USA)", 5000, 4800), 4800)

; ------------------------------------------------------------ notification level board
Equal("in use: a Windows event", JoinArray(ParseInUseKey("windows:.Default/SystemAsterisk"), "|"), "windows|.Default/SystemAsterisk")
Equal("in use: an ASCS sound", JoinArray(ParseInUseKey("ascs:reminder"), "|"), "ascs|reminder")
for bad in ["windows:Explorer/Nope", "ascs:other", "C:\Windows\Media\ding.wav", "windows:", "lib:x"] {
    threw := false
    try ParseInUseKey(bad)
    catch
        threw := true
    Check("in use: refused " bad, threw)
}
Equal("sound path: full path kept", ResolveSoundPath("C:\Windows\media\Windows Ding.wav", "C:\Windows"), "C:\Windows\media\Windows Ding.wav")
Equal("sound path: bare name is in Media", ResolveSoundPath("ding.wav", "C:\Windows"), "C:\Windows\Media\ding.wav")
Equal("sound path: a relative folder is not followed", ResolveSoundPath("..\x\ding.wav", "C:\Windows"), "")
Equal("sound path: none", ResolveSoundPath("", "C:\Windows"), "")
Equal("leveled gain", ValidateLeveledGain("-6.25"), -6.25)
for bad in ["100", "1.234", "-", "6;", ""] {
    threw := false
    try ValidateLeveledGain(bad)
    catch
        threw := true
    Check("leveled gain refused: " bad, threw)
}

; ------------------------------------------------------------ note placeholders
prepared := PrepareNoteText("Dear " Chr(0xE000) ",`r`n" Chr(0xE001) "`r`nThanks", "Sam")
Equal("note text: clipboard filled, cursor mark removed", prepared["text"], "Dear Sam,`r`n`r`nThanks")
Equal("note text: Left presses count a line break as one", prepared["left"], 7)
Equal("note text: no cursor mark, no Left presses", PrepareNoteText("plain", "x")["left"], 0)
Equal("note text: marks inside the clipboard are dropped", PrepareNoteText(Chr(0xE000), "a" Chr(0xE001) "b")["text"], "ab")
Equal("note text: a second cursor mark is removed too", PrepareNoteText("a" Chr(0xE001) "b" Chr(0xE001) "c", "")["text"], "abc")
Equal("note text: the first cursor mark counts", PrepareNoteText("a" Chr(0xE001) "b" Chr(0xE001) "c", "")["left"], 2)
Equal("note text: too far from the end to walk back", PrepareNoteText(Chr(0xE001) StrRepeat("x", 2001), "")["left"], 0)

; ------------------------------------------------------------ unsaved work before power actions
Equal("unsaved: Notepad star", UnsavedWorkApp("*notes.txt - Notepad", "notepad.exe"), "Notepad")
Equal("unsaved: VS Code dot", UnsavedWorkApp(Chr(0x25CF) " app.js - ASCS - Visual Studio Code", "Code.exe"), "Visual Studio Code")
Equal("unsaved: bullet, no dash, process name", UnsavedWorkApp(Chr(0x2022) " draft", "Typora.exe"), "Typora")
Equal("unsaved: en dash separator", UnsavedWorkApp("*Untitled " Chr(0x2013) " Paint", "mspaint.exe"), "Paint")
Equal("unsaved: saved title ignored", UnsavedWorkApp("notes.txt - Notepad", "notepad.exe"), "")
Equal("unsaved: a star later in the title ignored", UnsavedWorkApp("Search * - Explorer", "explorer.exe"), "")
Equal("unsaved: empty title", UnsavedWorkApp("", "x.exe"), "")
Equal("unsaved summary: none", UnsavedWorkSummary([]), "")
Equal("unsaved summary: one", UnsavedWorkSummary(["A"]), "A")
Equal("unsaved summary: two", UnsavedWorkSummary(["A", "B"]), "A and B")
Equal("unsaved summary: four", UnsavedWorkSummary(["A", "B", "C", "D"]), "A, B, C and D")
Equal("unsaved summary: six", UnsavedWorkSummary(["A", "B", "C", "D", "E", "F"]), "A, B, C and 3 more")

; ------------------------------------------------------------ countdowns that have passed
countdownsBefore := [Map("date", "2026-11-03", "name", "Gone"), Map("date", "2026-11-04", "name", "Today"),
    Map("date", "12-25", "name", "Yearly"), Map("date", "2027-01-01", "name", "Ahead")]
countdownsKept := ActiveCountdowns(countdownsBefore, "2026-11-04")
Equal("countdowns: a past one-off is dropped", countdownsKept.Length, 3)
Equal("countdowns: today's one-off stays", countdownsKept[1]["name"], "Today")
Equal("countdowns: yearly stays", countdownsKept[2]["name"], "Yearly")
Equal("countdowns: order kept", countdownsKept[3]["name"], "Ahead")
Equal("countdowns: none", ActiveCountdowns([], "2026-11-04").Length, 0)

; ------------------------------------------------------------ deleting leveled copies
Check("leveled id: a copy in ASCS Leveled", IsLeveledCopyId("ASCS Leveled\CHIMES (-7.6 dB).wav"))
Check("leveled id: any case", IsLeveledCopyId("ascs leveled\ding (+2.0 dB).WAV"))
for bad in ["(1998) Windows 98\CHIMES.wav", "ASCS Leveled\sub\x.wav", "ASCS Leveled\..\x.wav", "ASCS Leveled\x.mid", "ASCS Leveled\", "C:\ASCS Leveled\x.wav", "My ASCS Leveled\x.wav"]
    Check("leveled id: refused " bad, !IsLeveledCopyId(bad))

; ------------------------------------------------------------ Select › Delete lists
deleteIds := ParseDeleteList("ASCS Leveled\a (+1.0 dB).wav`r`n`nascs leveled\A (+1.0 dB).WAV`nASCS Leveled\b (-2.0 dB).wav`n", 10)
Equal("delete list: blanks and repeats (any case) dropped", deleteIds.Length, 2)
Equal("delete list: order kept", deleteIds[2], "ASCS Leveled\b (-2.0 dB).wav")
Throws("delete list: an original refuses the request", () => ParseDeleteList("ASCS Leveled\a.wav`n(1998) Windows 98\CHIMES.wav", 10), "leveled copies")
Throws("delete list: a subfolder refuses the request", () => ParseDeleteList("ASCS Leveled\..\x.wav", 10), "leveled copies")
Throws("delete list: empty", () => ParseDeleteList("`n  `n", 10), "Nothing")
deleteMany := ""
Loop 11
    deleteMany .= "ASCS Leveled\s" A_Index ".wav`n"
Throws("delete list: more than the limit", () => ParseDeleteList(deleteMany, 10), "Too many")
Equal("delete list: exactly the limit", ParseDeleteList(StrReplace(deleteMany, "ASCS Leveled\s11.wav`n"), 10).Length, 10)

; ------------------------------------------------------------ VS Code's unsaved buffers
Check("vscode backup: file", IsVSCodeBackupFolder("C:\Users\me\AppData\Roaming\Code\Backups\af46\file"))
Check("vscode backup: untitled", IsVSCodeBackupFolder("C:\Users\me\AppData\Roaming\Code\Backups\1712345678901\untitled"))
Check("vscode backup: other folders refused", !IsVSCodeBackupFolder("C:\Users\me\AppData\Roaming\Code\Backups\af46")
    && !IsVSCodeBackupFolder("C:\Users\me\AppData\Roaming\Code\Backups\af46\file\deeper")
    && !IsVSCodeBackupFolder("C:\Users\me\AppData\Roaming\Code - Insiders\Backups\af46\file\x"))
Equal("filetime: 1601 epoch", FileTimeToLocalStamp(0, 0), "16010101000000")
Equal("filetime: a known instant in UTC", FileTimeToLocalStamp(134382792210000000, 0), "20261104152021")
Equal("filetime: shifted to local", FileTimeToLocalStamp(134382792210000000, -5 * 3600), "20261104102021")

; ------------------------------------------------------------ Quick Notes groups
groupNote(group) => '{"version":2,"notes":[{"id":"a","title":"t","group":' group ',"content":"x"}]}'
CheckNoteGroups('{"version":2,"notes":[{"id":"a","title":"t","content":"x"}]}')
Check("groups: none is fine", true)
CheckNoteGroups(groupNote('"Claude"'))
Check("groups: a name is fine", true)
CheckNoteGroups(groupNote('"' StrRepeat("g", 60) '"'))
Check("groups: 60 characters is fine", true)
CheckNoteGroups(groupNote('"' StrRepeat(Chr(92) "u00e9", 60) '"'))
Check("groups: escapes count as one character each", true)
CheckNoteGroups('{"notes":[{"content":"say ' Chr(92) '"group' Chr(92) '": ' Chr(92) '"' StrRepeat("x", 80) Chr(92) '""}]}')
Check("groups: the word in a note's text isn't a group", true)
Throws("groups: 61 characters", () => CheckNoteGroups(groupNote('"' StrRepeat("g", 61) '"')), "60 characters")
Throws("groups: a control character", () => CheckNoteGroups(groupNote('"a' Chr(92) 'u0001b"')), "control")
Throws("groups: a tab", () => CheckNoteGroups(groupNote('"a' Chr(92) 'tb"')), "control")
Throws("groups: not text", () => CheckNoteGroups(groupNote("42")), "must be text")
Throws("groups: the second note checked too", () => CheckNoteGroups('{"notes":[{"group":"ok"},{"group" : "' StrRepeat("g", 61) '"}]}'), "60 characters")

; ------------------------------------------------------------ notes history (1.11.2)
Equal("notes history: the name", NotesHistoryName("20261108154233"), "notes-2026-11-08.json")
historyNames(count) {
    names := []
    Loop count
        names.Push("notes-2026-01-" Format("{:02}", A_Index) ".json")
    return names
}
Equal("notes history: under the limit, nothing goes", NotesHistoryToPrune(historyNames(13)).Length, 0)
Equal("notes history: at the limit, nothing goes", NotesHistoryToPrune(historyNames(14)).Length, 0)
Equal("notes history: past it, one goes", NotesHistoryToPrune(historyNames(15)).Length, 1)
Equal("notes history: the oldest goes", NotesHistoryToPrune(historyNames(16))[2], "notes-2026-01-02.json")
Equal("notes history: order doesn't matter", NotesHistoryToPrune(["notes-2026-03-01.json", "notes-2026-01-01.json", "notes-2026-02-01.json"], 2)[1], "notes-2026-01-01.json")
Equal("notes history: other files are never chosen", NotesHistoryToPrune(["notes.json", "notes-2026-01-01.json.bak", "secrets.json", "notes-x.json"], 0).Length, 0)
Equal("notes history: nothing there", NotesHistoryToPrune([]).Length, 0)

; ------------------------------------------------------------ Quick Notes game links (1.11.1)
gameNote(game) => '{"version":2,"notes":[{"id":"a","title":"t","game":' game ',"content":"x"}]}'
CheckNoteGames('{"version":2,"notes":[{"id":"a","title":"t","content":"x"}]}')
Check("game links: none is fine", true)
CheckNoteGames(gameNote('"zeldaocarinaoftime"'))
Check("game links: a key is fine", true)
CheckNoteGames(gameNote('"' StrRepeat("g", 320) '"'))
Check("game links: the longest is fine", true)
CheckNoteGames('{"notes":[{"content":"say ' Chr(92) '"game' Chr(92) '": 42"}]}')
Check("game links: the word in a note's text isn't a link", true)
Throws("game links: too long", () => CheckNoteGames(gameNote('"' StrRepeat("g", 321) '"')), "320 characters")
Throws("game links: a control character", () => CheckNoteGames(gameNote('"a' Chr(92) 'u0001b"')), "control")
Throws("game links: not text", () => CheckNoteGames(gameNote("42")), "must be text")
Throws("game links: the second note checked too", () => CheckNoteGames('{"notes":[{"game":"ok"},{"game" : 7}]}'), "must be text")

; ------------------------------------------------------------ 1.8.1 startup sounds
Equal("startup key: a sign-in slot", ParseInUseKey("startup:3")[2], "3")
Equal("startup key: shutdown", ParseInUseKey("startup:shutdown")[1], "startup")
Equal("startup key: add", ParseInUseKey("startup:add")[2], "add")
for bad in ["startup:0", "startup:9", "startup:12", "startup:", "startup:Shutdown "]
    Throws("startup key refused: " bad, () => ParseInUseKey(bad), "in use")
startupEntry := ParseStartupEntry("88|C:\Sounds\x\Windows XP Startup.wav")
Equal("startup entry: weight and path", startupEntry["weight"] "|" startupEntry["path"], "88|C:\Sounds\x\Windows XP Startup.wav")
Equal("startup entry: zero is allowed", ParseStartupEntry("0|C:\a.WAV")["weight"], 0)
for bad in ["101|C:\a.wav", "-1|C:\a.wav", "x|C:\a.wav", "50|C:\a.mp3", "50", "50|"]
    Check("startup entry refused: " bad, ParseStartupEntry(bad) = "")
Equal("startup odds: read", ValidateStartupOdds(" 88, 10,1 ,1", 4)[1], 88)
Throws("startup odds: must add up to 100", () => ValidateStartupOdds("88,10,1", 3), "add up to 100")
Throws("startup odds: count must match", () => ValidateStartupOdds("100", 2), "match")
Throws("startup odds: whole numbers", () => ValidateStartupOdds("50.5,49.5", 2), "whole number")
Throws("startup odds: at most 100 each", () => ValidateStartupOdds("150,-50", 2), "whole number")
Equal("leveled stem: a chain of gains", LeveledStem("Windows XP Notify (+12.6 dB) 2 (-6.0 dB) (+11.8 dB) (-5.8 dB).wav"), "Windows XP Notify")
Equal("leveled stem: one gain", LeveledStem("CHIMES (-7.6 dB).wav"), "CHIMES")
Equal("leveled stem: numbers in the name stay", LeveledStem("Windows 98 Startup (+1.0 dB).wav"), "Windows 98 Startup")
Equal("leveled stem: not a copy", LeveledStem("The Microsoft Sound.wav"), "The Microsoft Sound")
Equal("leveled name: INI-unsafe characters dropped", LeveledSoundName("a=b [c];d", 1), "ab cd (+1.0 dB).wav")

; ------------------------------------------------------------ report
StrRepeat(text, count) {
    output := ""
    Loop count
        output .= text
    return output
}

report := "PASS " Passed " FAIL " Failures.Length "`n"
for failure in Failures
    report .= "FAIL: " failure "`n"
try FileDelete(ResultsPath)
FileAppend(report, ResultsPath, "UTF-8")
ExitApp(Failures.Length ? 1 : 0)
