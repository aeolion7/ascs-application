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
