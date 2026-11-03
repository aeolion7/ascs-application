; ==========================================
; ASCS CORE HELPERS
; ==========================================
; Pure helpers: no globals, no GUI, no hotkeys. Side effects are limited to
; reading the filesystem for validation. Included by ASCS.ahk and by
; tests\core.tests.ahk, so everything here must stay safe to load on its own.

; Letters bound to fixed Super commands; never assignable.
ReservedSuperKeys() {
    return "bsrlmvjy"
}

; Validates one Super-key letter. `used` maps already-claimed letters to the
; label that owns them and receives this key on success. Empty keys are only
; accepted when `optional` is true. Returns the normalized (lowercase) key.
CheckShortcutKey(key, label, used, optional := false) {
    key := StrLower(Trim(key))
    if (key = "") {
        if optional
            return ""
        throw Error(label " needs a single letter (A–Z).")
    }
    if !RegExMatch(key, "^[a-z]$")
        throw Error(label " needs a single letter (A–Z).")
    if InStr(ReservedSuperKeys(), key)
        throw Error(label ": Super+" StrUpper(key)
            " is reserved for a built-in command (B, S, R, L, M, V, J, Y).")
    if used.Has(key)
        throw Error(label ": Super+" StrUpper(key)
            " is already assigned to " used[key] ".")
    used[key] := label
    return key
}

; ------------------------------------------
; Workspaces
; ------------------------------------------

IsDefaultWorkspaceName(name) {
    name := Trim(name)
    return (name = "" || StrLower(name) = "default")
}

; Workspace names become file names, so they are restricted to a safe set.
ValidateWorkspaceName(name) {
    name := Trim(name)
    if (name = "")
        throw Error("Enter a workspace name.")
    if !RegExMatch(name, "^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$")
        throw Error("Workspace names use letters, numbers, spaces, - and _ (up to 40 characters).")
    if RegExMatch(name, "i)^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$")
        throw Error("That name is reserved by Windows.")
    if RegExMatch(name, " $")
        throw Error("Workspace names cannot end with a space.")
    return name
}

; Matches saved workspace records to open windows.
;   records    Array of Maps with "process", "title", "folder"
;   candidates Map of lowercase process name -> Array of window handles
;   claimed    Map of handles already used (updated in place)
;   titleOf    Function(hwnd) returning the window title (may throw)
;   folderOf   Map of Explorer handle -> folder path
; Pass 1 requires an exact folder (Explorer) or title match; pass 2 accepts
; any unclaimed window of the same process. Returns Map of index -> handle.
MatchWorkspaceRecords(records, candidates, claimed, titleOf, folderOf) {
    matches := Map()
    for pass in [1, 2] {
        for index, record in records {
            if matches.Has(index)
                continue
            key := StrLower(record["process"])
            if !candidates.Has(key)
                continue
            for hwnd in candidates[key] {
                if claimed.Has(hwnd)
                    continue
                if (pass = 1) {
                    if (record["folder"] != "") {
                        if !(folderOf.Has(hwnd) && folderOf[hwnd] = record["folder"])
                            continue
                    } else {
                        try title := titleOf(hwnd)
                        catch
                            continue
                        if (title != record["title"])
                            continue
                    }
                }
                claimed[hwnd] := true
                matches[index] := hwnd
                break
            }
        }
    }
    return matches
}

; ------------------------------------------
; Custom palette commands
; ------------------------------------------

CustomCommandKinds() {
    return Map("app", "Application", "folder", "Folder", "url", "Web link")
}

; Validates one user-defined command. Applications must be existing .exe or
; .lnk files (launched without arguments), folders must exist, and links must
; be http(s) URLs. Returns a normalized Map; the key is checked by the caller.
ValidateCustomCommand(name, kind, target, key := "") {
    name := Trim(name)
    target := Trim(target)
    kind := StrLower(Trim(kind))

    if (name = "" || StrLen(name) > 48)
        throw Error("Command names must be 1–48 characters.")
    if RegExMatch(name, "[\x00-\x1F|]")
        throw Error("Command names cannot contain control characters or |.")
    if !CustomCommandKinds().Has(kind)
        throw Error(name ": choose Application, Folder, or Web link.")
    if (target = "" || StrLen(target) > 2048 || RegExMatch(target, "[\x00-\x1F]"))
        throw Error(name ": enter a target.")

    switch kind {
        case "app":
            if (InStr(target, '"') || !RegExMatch(target, "i)^[A-Z]:\\.+\.(exe|lnk)$"))
                throw Error(name ": applications need a full path to an .exe or .lnk file.")
            attributes := FileExist(target)
            if (attributes = "" || InStr(attributes, "D"))
                throw Error(name ": " target " was not found.")
        case "folder":
            if (InStr(target, '"') || !RegExMatch(target, "i)^(?:[A-Z]:\\|\\\\[^\\]+\\[^\\]+)"))
                throw Error(name ": folders need a full path, such as C:\Projects.")
            if !DirExist(target)
                throw Error(name ": the folder " target " was not found.")
        case "url":
            if !IsWebUrl(target)
                throw Error(name ": links must start with http:// or https://.")
    }

    return Map("name", name, "kind", kind, "target", target, "key", StrLower(Trim(key)))
}

; Parses the frontend payload: one command per line, fields separated by tabs
; (name, kind, target, key). Returns an Array of field arrays.
ParseCustomCommandsPayload(content, maxCommands := 30) {
    rows := []
    if (Trim(content, " `t`r`n") = "")
        return rows
    for line in StrSplit(content, "`n", "`r") {
        if (Trim(line) = "")
            continue
        fields := StrSplit(line, "`t")
        if (fields.Length != 4)
            throw Error("A custom command entry is malformed.")
        rows.Push(fields)
        if (rows.Length > maxCommands)
            throw Error("At most " maxCommands " custom commands are supported.")
    }
    return rows
}

IsWebUrl(url) {
    return (StrLen(url) <= 2048 && RegExMatch(url, "i)^https?://[^\s`"<>]+$"))
}

; ------------------------------------------
; Quick actions (1.7.0)
; ------------------------------------------

; A quick action is a palette item id such as "view:notes", "launch:terminal",
; "cmd:My tool", "ws:coding", "snippet:n_123", or "note:n_123". ASCS stores
; these strings only; the frontend resolves them to items, and running one
; goes through the same validated messages the palette uses.
ValidateQuickActionId(id) {
    id := Trim(id)
    if !RegExMatch(id, "^(view|launch|mode|cmd|ws|snippet|note):[^\x00-\x1F|]{1,80}$")
        throw Error("A quick action is not valid.")
    return id
}

; One id per line; at most `maxActions`, no duplicates. Returns an Array.
ParseQuickActionsPayload(content, maxActions := 6) {
    ids := []
    seen := Map()
    for line in StrSplit(content, "`n", "`r") {
        if (Trim(line) = "")
            continue
        id := ValidateQuickActionId(line)
        if seen.Has(id)
            continue
        seen[id] := true
        ids.Push(id)
        if (ids.Length > maxActions)
            throw Error("At most " maxActions " quick actions are supported.")
    }
    return ids
}

; ------------------------------------------
; Search helpers
; ------------------------------------------

; A search template is an https URL containing %s for the encoded query.
ValidateSearchTemplate(template) {
    template := Trim(template)
    if (!RegExMatch(template, "i)^https://[^\s`"<>]+$") || !InStr(template, "%s")
        || StrLen(template) > 512)
        throw Error("The web search address must start with https:// and contain %s.")
    return template
}

; Parses a key combination typed in Preferences, such as "Ctrl+Alt+Space",
; into a Map with "display" (canonical text) and "send" (an AutoHotkey Send
; string). Only a fixed grammar is accepted: Ctrl, Alt, Shift and Win, at
; least one of Ctrl, Alt or Win, and exactly one key from Space, A-Z, 0-9 or
; F1-F12, so the setting can never inject arbitrary keystrokes or text.
; An empty value means "no shortcut".
ParseKeyCombo(text) {
    text := Trim(text)
    if (text = "")
        return Map("display", "", "send", "")
    if (StrLen(text) > 40)
        throw Error("The key combination is too long.")
    static order := ["Ctrl", "Alt", "Shift", "Win"]
    static symbols := Map("Ctrl", "^", "Alt", "!", "Shift", "+", "Win", "#")
    static aliases := Map("ctrl", "Ctrl", "control", "Ctrl", "alt", "Alt",
        "shift", "Shift", "win", "Win", "windows", "Win")
    modifiers := Map()
    key := ""
    for part in StrSplit(text, "+") {
        part := Trim(part)
        if aliases.Has(StrLower(part)) {
            name := aliases[StrLower(part)]
            if modifiers.Has(name)
                throw Error("The key combination repeats " name ".")
            modifiers[name] := true
        } else if (key != "") {
            throw Error("Use exactly one key besides Ctrl, Alt, Shift and Win.")
        } else if (part = "Space") {
            key := "Space"
        } else if RegExMatch(part, "^[A-Za-z0-9]$") {
            key := StrUpper(part)
        } else if RegExMatch(part, "i)^F([1-9]|1[0-2])$") {
            key := StrUpper(part)
        } else {
            throw Error("Use Space, a letter, a digit, or F1 to F12 as the key.")
        }
    }
    if (key = "")
        throw Error("The key combination needs a key, such as Space.")
    if !(modifiers.Has("Ctrl") || modifiers.Has("Alt") || modifiers.Has("Win"))
        throw Error("The key combination needs Ctrl, Alt or Win.")
    display := ""
    send := ""
    for name in order {
        if modifiers.Has(name) {
            display .= name "+"
            send .= symbols[name]
        }
    }
    return Map("display", display key, "send", send "{" key "}")
}

; ------------------------------------------------------------ almanac (1.7.0)

; A countdown date is "MM-DD" (every year) or "YYYY-MM-DD" (once). Impossible
; dates are rejected; 02-29 is allowed as a yearly date.
ValidateCountdownDate(date) {
    date := Trim(date)
    if RegExMatch(date, "^(\d{4})-(\d{2})-(\d{2})$", &m) {
        year := Integer(m[1]), month := Integer(m[2]), day := Integer(m[3])
        if (year < 2000 || year > 2200)
            throw Error("Countdown years must be between 2000 and 2200.")
    } else if RegExMatch(date, "^(\d{2})-(\d{2})$", &m) {
        year := 2024, month := Integer(m[1]), day := Integer(m[2])
    } else {
        throw Error("Countdown dates use MM-DD (every year) or YYYY-MM-DD (once).")
    }
    static lengths := [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    leap := Mod(year, 4) = 0 && (Mod(year, 100) != 0 || Mod(year, 400) = 0)
    if (month < 1 || month > 12 || day < 1
        || day > (month = 2 && !leap ? 28 : lengths[month]))
        throw Error("“" date "” is not a real date.")
    return date
}

ValidateCountdownName(name) {
    name := Trim(name)
    if (name = "")
        throw Error("Each countdown needs a name.")
    if (StrLen(name) > 60)
        throw Error("Countdown names are limited to 60 characters.")
    if RegExMatch(name, "[\x00-\x1F\x7F|]")
        throw Error("Countdown names cannot contain control characters or |.")
    return name
}

; SaveAlmanac payload: the first line is "1" or "0" (Wikipedia on or off);
; each further line is "date|name". Up to 12 countdowns.
ParseAlmanacPayload(content) {
    lines := StrSplit(StrReplace(content, "`r"), "`n")
    if !(lines.Length && (lines[1] = "0" || lines[1] = "1"))
        throw Error("Almanac payload has an invalid shape.")
    countdowns := []
    Loop lines.Length - 1 {
        line := lines[A_Index + 1]
        if (Trim(line) = "")
            continue
        parts := StrSplit(line, "|")
        if (parts.Length != 2)
            throw Error("Each countdown needs a date and a name.")
        if (countdowns.Length >= 12)
            throw Error("Up to 12 countdowns are supported.")
        countdowns.Push(Map(
            "date", ValidateCountdownDate(parts[1]),
            "name", ValidateCountdownName(parts[2])
        ))
    }
    return Map("wikipedia", lines[1] = "1", "countdowns", SortCountdowns(countdowns))
}

; Annual dates (MM-DD) in calendar order first, then one-off dates in date
; order; the same date sorts by name.
SortCountdowns(countdowns) {
    key := item => (StrLen(item["date"]) = 5 ? "0 " : "1 ") item["date"] " " StrLower(item["name"])
    sorted := []
    for item in countdowns {
        index := sorted.Length + 1
        while (index > 1 && StrCompare(key(sorted[index - 1]), key(item)) > 0)
            index--
        sorted.InsertAt(index, item)
    }
    return sorted
}

; Article titles arrive from the page (originally from the Wikipedia feed),
; so they are validated before ASCS builds a link from them. The address is
; always built here, on en.wikipedia.org; the page never supplies a URL.
ValidateWikipediaTitle(title) {
    if (title = "" || StrLen(title) > 200
        || RegExMatch(title, "[\x00-\x1F\x7F#<>\[\]{}|]")
        || RegExMatch(title, "^[\s._/:]") || InStr(title, ".."))
        throw Error("Invalid Wikipedia article title.")
    return title
}

BuildWikipediaUrl(title) {
    return "https://en.wikipedia.org/wiki/" UriEncode(StrReplace(ValidateWikipediaTitle(title), " ", "_"))
}

; The two daily feeds. Only these fixed addresses are ever requested.
AlmanacFeedUrl(kind, year, month, day) {
    if !(RegExMatch(year, "^\d{4}$") && RegExMatch(month, "^\d{2}$") && RegExMatch(day, "^\d{2}$"))
        throw Error("Invalid almanac date.")
    switch kind {
        case "featured":
            return "https://en.wikipedia.org/api/rest_v1/feed/featured/" year "/" month "/" day
        case "holidays":
            return "https://en.wikipedia.org/api/rest_v1/feed/onthisday/holidays/" month "/" day
    }
    throw Error("Unknown almanac feed.")
}

BuildSearchUrl(template, query) {
    return StrReplace(template, "%s", UriEncode(query))
}

; Percent-encodes UTF-8 text, leaving RFC 3986 unreserved characters as-is.
UriEncode(text) {
    ; Note: AHK names are case-insensitive, so a local named "buffer" would
    ; shadow the Buffer class.
    bytes := Buffer(StrPut(text, "UTF-8"))
    StrPut(text, bytes, "UTF-8")
    output := ""
    Loop bytes.Size - 1 {
        byte := NumGet(bytes, A_Index - 1, "UChar")
        if ((byte >= 0x30 && byte <= 0x39) || (byte >= 0x41 && byte <= 0x5A)
            || (byte >= 0x61 && byte <= 0x7A) || byte = 0x2D || byte = 0x2E
            || byte = 0x5F || byte = 0x7E)
            output .= Chr(byte)
        else
            output .= Format("%{:02X}", byte)
    }
    return output
}

; Everything receives the query as one quoted argument; quotes and control
; characters are removed so the argument cannot be broken out of.
SanitizeSearchQuery(query, maxLength := 200) {
    query := RegExReplace(query, "[\x00-\x1F`"]", " ")
    query := Trim(RegExReplace(query, "\s{2,}", " "))
    return SubStr(query, 1, maxLength)
}

; ------------------------------------------
; Activity feed
; ------------------------------------------

ActivityKinds() {
    return "launch,workspace,note,snippet,file,command,search,error,system"
}

; One activity entry per line: ISO time, kind, and single-line text.
FormatActivityLine(timestamp, kind, text) {
    text := RegExReplace(String(text), "[\x00-\x1F]+", " ")
    return timestamp "`t" kind "`t" SubStr(Trim(text), 1, 200)
}

ParseActivityLine(line) {
    fields := StrSplit(line, "`t")
    if (fields.Length != 3
        || !RegExMatch(fields[1], "^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$")
        || !InStr("," ActivityKinds() ",", "," fields[2] ","))
        return ""
    return Map("time", fields[1], "kind", fields[2], "text", fields[3])
}

; ------------------------------------------
; Moved from ASCS.ahk in 1.6.0 (unchanged)
; ------------------------------------------

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

IsValidJsonObject(text) {
    position := 1
    SkipJsonWhitespace(text, &position)
    if (SubStr(text, position, 1) != "{")
        return false

    try {
        ParseJsonValue(text, &position)
        SkipJsonWhitespace(text, &position)
        return (position > StrLen(text))
    } catch {
        return false
    }
}

ParseJsonValue(text, &position, depth := 0) {
    if (depth > 128)
        throw Error("JSON nesting exceeds the safety limit.")

    SkipJsonWhitespace(text, &position)
    char := SubStr(text, position, 1)

    if (char = Chr(34)) {
        ParseJsonString(text, &position)
        return
    }

    if (char = "{") {
        position++
        SkipJsonWhitespace(text, &position)
        if (SubStr(text, position, 1) = "}") {
            position++
            return
        }

        loop {
            if (SubStr(text, position, 1) != Chr(34))
                throw Error("Expected a JSON object key.")
            ParseJsonString(text, &position)
            SkipJsonWhitespace(text, &position)
            if (SubStr(text, position, 1) != ":")
                throw Error("Expected a JSON object colon.")
            position++
            ParseJsonValue(text, &position, depth + 1)
            SkipJsonWhitespace(text, &position)
            char := SubStr(text, position, 1)
            if (char = "}") {
                position++
                return
            }
            if (char != ",")
                throw Error("Expected a JSON object separator.")
            position++
            SkipJsonWhitespace(text, &position)
        }
    }

    if (char = "[") {
        position++
        SkipJsonWhitespace(text, &position)
        if (SubStr(text, position, 1) = "]") {
            position++
            return
        }

        loop {
            ParseJsonValue(text, &position, depth + 1)
            SkipJsonWhitespace(text, &position)
            char := SubStr(text, position, 1)
            if (char = "]") {
                position++
                return
            }
            if (char != ",")
                throw Error("Expected a JSON array separator.")
            position++
        }
    }

    for literal in ["true", "false", "null"] {
        if (SubStr(text, position, StrLen(literal)) = literal) {
            position += StrLen(literal)
            return
        }
    }

    if RegExMatch(
        SubStr(text, position),
        "^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?",
        &number
    ) {
        position += StrLen(number[0])
        return
    }

    throw Error("Invalid JSON value.")
}

ParseJsonString(text, &position) {
    position++
    length := StrLen(text)

    while (position <= length) {
        char := SubStr(text, position, 1)
        if (char = Chr(34)) {
            position++
            return
        }

        if (char = "\") {
            position++
            escaped := SubStr(text, position, 1)
            switch escaped {
                case '"', "\", "/", "b", "f", "n", "r", "t":
                    position++
                case "u":
                    hex := SubStr(text, position + 1, 4)
                    if !RegExMatch(hex, "^[0-9A-Fa-f]{4}$")
                        throw Error("Invalid JSON unicode escape.")
                    position += 5
                default:
                    throw Error("Invalid JSON string escape.")
            }
            continue
        }

        if (Ord(char) < 32)
            throw Error("Invalid control character in JSON string.")
        position++
    }

    throw Error("Unterminated JSON string.")
}

SkipJsonWhitespace(text, &position) {
    while (position <= StrLen(text)
        && InStr(" `t`r`n", SubStr(text, position, 1)))
        position++
}

ParseDriveList(value) {
    drives := []
    seen := Map()

    for candidate in StrSplit(value, ",") {
        drive := StrUpper(Trim(candidate))
        if !RegExMatch(drive, "^[A-Z]:$")
            throw Error("Drive entries must be letters followed by a colon.")
        if seen.Has(drive)
            throw Error("Drive entries must be unique.")
        seen[drive] := true
        drives.Push(drive)
        if (drives.Length > 12)
            throw Error("At most 12 drives can be monitored.")
    }

    if !drives.Length
        throw Error("At least one drive is required.")
    return drives
}

ValidateExplorerItemName(name, kind) {
    if (name = "" || Trim(name) = "")
        throw Error("A name is required.")
    if (StrLen(name) > 255)
        throw Error("The name must be 255 characters or fewer.")
    if RegExMatch(name, "[\x00-\x1F<>:`"/\\|?*]")
        throw Error("The name contains a character that Windows does not allow.")
    if RegExMatch(name, "[ .]$")
        throw Error("Names cannot end with a space or period.")
    if (name = "." || name = "..")
        throw Error("That name is not allowed.")
    if RegExMatch(name, "i)^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)")
        throw Error("That name is reserved by Windows.")
    if (kind = "file" && !RegExMatch(name, "^.+\.[^.]+$"))
        throw Error("Enter a filename with an extension, such as notes.txt.")
}

IsValidWorkspaceExecutable(path, process) {
    if (path = "" || process = "" || InStr(path, '"')
        || RegExMatch(path, "[\x00-\x1F]")
        || !RegExMatch(path, "i)^[A-Z]:\\"))
        return false

    SplitPath(path, &fileName)
    if (StrLower(fileName) != StrLower(process)
        || !RegExMatch(fileName, "i)^[A-Z0-9_. -]+\.exe$"))
        return false

    ; Windows Terminal lives under WindowsApps, which is not always readable;
    ; it is relaunched through its wt.exe alias instead of this path.
    if (StrLower(process) = "windowsterminal.exe")
        return true

    attributes := FileExist(path)
    return (attributes != "" && !InStr(attributes, "D"))
}

; Command used to open one additional window for a saved record.
GetWorkspaceLaunchCommand(record) {
    switch StrLower(record["process"]) {
        case "explorer.exe":
            if (record["folder"] != "" && DirExist(record["folder"]))
                return 'explorer.exe "' record["folder"] '"'
            return "explorer.exe"
        case "windowsterminal.exe":
            return "wt.exe -w new"
    }
    return '"' record["path"] '"'
}

JoinArray(items, separator) {
    output := ""
    for index, item in items
        output .= (index > 1 ? separator : "") item
    return output
}

Range(start, end) {
    result := []
    Loop end - start + 1
        result.Push(start + A_Index - 1)
    return result
}

; ------------------------------------------------------------ games (1.7.0)
; Parsers for the emulators' own records. These files belong to other
; programs, so every parser reads only what it expects, skips anything else,
; and caps sizes. None of them executes or follows anything it reads.

; PCSX2 inis\playtime.dat: one fixed-width line per game:
; serial, seconds played, last played (Unix time).
ParsePcsx2Playtime(text) {
    games := []
    for line in StrSplit(StrReplace(text, "`r"), "`n") {
        if !RegExMatch(line, "^\s*(\S{1,32})\s+(\d{1,12})\s+(\d{1,12})\s*$", &m)
            continue
        games.Push(Map("serial", m[1], "seconds", Integer(m[2]), "last", Integer(m[3])))
        if (games.Length >= 2000)
            break
    }
    return games
}

; Dolphin Config\TimePlayed.ini: "GAMEID = 0x<milliseconds>". Only six-
; character disc IDs are kept (system titles such as the Wii Menu are not games).
ParseDolphinTimePlayed(text) {
    games := Map()
    for line in StrSplit(StrReplace(text, "`r"), "`n") {
        if RegExMatch(line, "^\s*([A-Z0-9]{6})\s*=\s*0x([0-9a-fA-F]{1,16})\s*$", &m)
            games[m[1]] := Integer("0x" m[2]) // 1000
    }
    return games
}

; A RetroArch runtime log (.lrtl): runtime "H:MM:SS", last_played
; "YYYY-MM-DD HH:MM:SS", play_count. Returns "" if it isn't one.
ParseRetroArchRuntime(text) {
    if (StrLen(text) > 4096
        || !RegExMatch(text, '"runtime"\s*:\s*"(\d{1,6}):(\d{2}):(\d{2})"', &run))
        return ""
    last := RegExMatch(text, '"last_played"\s*:\s*"(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})"', &played)
        ? played[1] "T" played[2] : ""
    count := RegExMatch(text, '"play_count"\s*:\s*"(\d{1,9})"', &plays) ? Integer(plays[1]) : 0
    return Map("seconds", Integer(run[1]) * 3600 + Integer(run[2]) * 60 + Integer(run[3]),
        "last", last, "count", count)
}

; RetroArch playlists\builtin\content_history.lpl (JSON written by
; RetroArch with a fixed key order). Items without a usable path or core
; are skipped.
ParseRetroArchHistory(text) {
    items := []
    if (StrLen(text) > 2000000)
        return items
    str := '"((?:[^"\\]|\\.)*+)"'
    pattern := '"path"\s*:\s*' str '\s*,\s*"label"\s*:\s*' str '\s*,\s*"core_path"\s*:\s*' str
        . '\s*,\s*"core_name"\s*:\s*' str '(?:\s*,\s*"crc32"\s*:\s*"(?:[^"\\]|\\.)*+")?\s*,\s*"db_name"\s*:\s*' str
    position := 1
    while (position := RegExMatch(text, pattern, &m, position)) {
        position += m.Len
        if (m.Len[1] > 2048 || m.Len[2] > 512 || m.Len[3] > 2048 || m.Len[4] > 256 || m.Len[5] > 256)
            continue
        path := JsonUnescape(m[1])
        core := JsonUnescape(m[3])
        if (path = "" || core = "" || core = "DETECT")
            continue
        items.Push(Map("path", path, "label", JsonUnescape(m[2]), "core", core,
            "coreName", JsonUnescape(m[4]), "db", RegExReplace(JsonUnescape(m[5]), "i)\.lpl$")))
        if (items.Length >= 500)
            break
    }
    return items
}

; The content file's name without folders, archive members or extension:
; "J:\x\Mario Paint (Japan, USA).zip#Mario Paint.sfc" -> "Mario Paint (Japan, USA)".
; RetroArch names runtime logs this way.
ContentBaseName(path) {
    path := StrSplit(path, "#")[1]
    SplitPath(path, , , , &name)
    return name
}

; The archive or file RetroArch should open (the part before any "#").
ContentFilePath(path) {
    return StrSplit(path, "#")[1]
}

; RetroArch thumbnail file names replace &*/:`<>?\| with "_".
RetroArchThumbnailName(label) {
    return RegExReplace(label, "[&*/:``<>?\\|]", "_")
}

; Reads length-prefixed strings (u32 little-endian length, then UTF-8).
ReadPrefixedString(buffer, size, &offset, maxLength := 1024) {
    if (offset + 4 > size)
        return ""
    length := NumGet(buffer, offset, "UInt")
    if (length > maxLength || offset + 4 + length > size)
        return ""
    text := length ? StrGet(buffer.Ptr + offset + 4, length, "UTF-8") : ""
    offset += 4 + length
    return text
}

; True when a length-prefixed string at offset looks like a Windows path:
; a sensible length, then a drive letter, a colon and a slash.
IsPrefixedPathAt(buffer, size, offset) {
    if (offset + 8 > size)
        return false
    length := NumGet(buffer, offset, "UInt")
    if (length < 6 || length > 1024 || offset + 4 + length > size)
        return false
    letter := NumGet(buffer, offset + 4, "UChar")
    return ((letter >= 0x41 && letter <= 0x5A) || (letter >= 0x61 && letter <= 0x7A))
        && NumGet(buffer, offset + 5, "UChar") = 0x3A
        && (NumGet(buffer, offset + 6, "UChar") = 0x5C || NumGet(buffer, offset + 6, "UChar") = 0x2F)
}

; PCSX2 cache\gamelist.cache: "GLCE", a version, then entries that start
; with path, serial and title strings. Returns serial -> Map(path, title).
ParsePcsx2GameList(buffer, size) {
    games := Map()
    if (size < 8 || size > 20000000 || StrGet(buffer.Ptr, 4, "CP0") != "GLCE")
        return games
    offset := 8
    while (offset + 8 <= size) {
        if !IsPrefixedPathAt(buffer, size, offset) {
            offset++
            continue
        }
        start := offset
        path := ReadPrefixedString(buffer, size, &offset)
        serial := ReadPrefixedString(buffer, size, &offset, 32)
        title := ReadPrefixedString(buffer, size, &offset, 512)
        if (path != "" && RegExMatch(serial, "^[A-Z]{4}-\d{5}$") && !games.Has(serial))
            games[serial] := Map("path", path, "title", title)
        if (offset <= start)
            offset := start + 1
        if (games.Count >= 5000)
            break
    }
    return games
}

; Dolphin Cache\gamelist.cache: entries start with the path and file name;
; the six-character game ID follows later in the entry as a length-prefixed
; string. Returns ID -> Map(path, file).
ParseDolphinGameList(buffer, size) {
    games := Map()
    if (size > 50000000)
        return games
    starts := []
    offset := 0
    while (offset + 8 <= size) {
        if IsPrefixedPathAt(buffer, size, offset) {
            starts.Push(offset)
            offset += 4 + NumGet(buffer, offset, "UInt")
        } else {
            offset++
        }
        if (starts.Length >= 5000)
            break
    }
    for index, start in starts {
        stop := index < starts.Length ? starts[index + 1] : size
        offset := start
        path := StrReplace(ReadPrefixedString(buffer, size, &offset), "/", "\")
        file := ReadPrefixedString(buffer, size, &offset, 512)
        id := ""
        scan := offset
        while (scan + 10 <= stop) {
            if (NumGet(buffer, scan, "UInt") = 6) {
                candidate := StrGet(buffer.Ptr + scan + 4, 6, "CP0")
                if RegExMatch(candidate, "^[A-Z0-9]{6}$") {
                    id := candidate
                    break
                }
            }
            scan++
        }
        if (id != "" && path != "" && !games.Has(id))
            games[id] := Map("path", path, "file", file)
    }
    return games
}

; A readable title from a disc image's file name:
; "Animal Crossing (USA).nkit.iso" -> "Animal Crossing (USA)".
GameTitleFromFile(file) {
    return Trim(RegExReplace(file, "i)(\.nkit)?\.(iso|gcm|gcz|rvz|wbfs|wia|ciso|tgc|dol|elf|wad)$"))
}

; Executables configured in Preferences: an existing .exe with a plain path.
ValidateExecutablePath(path, label) {
    path := Trim(path)
    if (path = "")
        return ""
    if (StrLen(path) > 260 || RegExMatch(path, '["<>|*?\x00-\x1F]')
        || !RegExMatch(path, "i)^[A-Z]:\\.+\.exe$"))
        throw Error(label " must be the full path of a program (.exe).")
    if !FileExist(path) || InStr(FileExist(path), "D")
        throw Error(label " was not found: " path)
    return path
}

; Audio device names as Windows reports them ("Headphones (2- SteelSeries
; Arctis Nova 5)") match a configured name loosely: case, spacing and
; punctuation are ignored, as is the "2-" instance number Windows adds.
NormalizeDeviceName(name) {
    name := RegExReplace(name, "\(\d+-\s*", "(")
    return RegExReplace(StrLower(name), "[^a-z0-9]")
}

DeviceNameMatches(actual, wanted) {
    wanted := NormalizeDeviceName(wanted)
    return wanted != "" && NormalizeDeviceName(actual) = wanted
}

ValidateDeviceName(name) {
    name := Trim(name)
    if (StrLen(name) > 120 || RegExMatch(name, "[\x00-\x1F|]"))
        throw Error("The headphones device name is too long or contains invalid characters.")
    return name
}

; RetroAchievements credentials from the local secrets file.
ValidateRetroAchievementsUser(user) {
    if !RegExMatch(user, "^[A-Za-z0-9_]{2,32}$")
        throw Error("The RetroAchievements user name in data\secrets.ini is not valid.")
    return user
}

ValidateRetroAchievementsKey(key) {
    if !RegExMatch(key, "^[A-Za-z0-9]{16,64}$")
        throw Error("The RetroAchievements Web API key in data\secrets.ini is not valid.")
    return key
}

; Game ids exchanged with the page: an emulator prefix and an index or ID.
ValidateGameId(id) {
    if !RegExMatch(id, "^(ra:\d{1,5}|ps2:[A-Za-z0-9-]{1,32}|gc:[A-Z0-9]{6}|st:\d{1,10})$")
        throw Error("Invalid game id.")
    return id
}

; ------------------------------------------------------------ Steam (1.7.0)
; Steam's own text files (Valve's KeyValues format), read-only.

; An app manifest (appmanifest_<id>.acf): its top-level "key" "value" pairs.
ParseSteamManifest(text) {
    fields := Map()
    if (StrLen(text) > 200000)
        return fields
    position := 1
    while (position := RegExMatch(text, '"([A-Za-z0-9_]{1,40})"[ \t]+"((?:[^"\\\r\n]|\\.)*+)"', &m, position)) {
        position += m.Len
        if !fields.Has(m[1])
            fields[m[1]] := StrReplace(m[2], "\\", "\")
    }
    return fields
}

; steamapps\libraryfolders.vdf: the library folders ("path" entries).
ParseSteamLibraryFolders(text) {
    folders := []
    position := 1
    while (position := RegExMatch(text, '"path"[ \t]+"((?:[^"\\\r\n]|\\.)*+)"', &m, position)) {
        position += m.Len
        path := StrReplace(m[1], "\\", "\")
        if RegExMatch(path, "i)^[A-Z]:\\") && folders.Length < 32
            folders.Push(path)
    }
    return folders
}

; userdata\<account>\config\localconfig.vdf: play time (minutes) and last
; played (Unix time) per app, from UserLocalConfigStore > Software > Valve >
; Steam > apps > <appid>. A small tokenizer tracks the key path, so nested
; blocks inside an app don't confuse it.
ParseSteamPlaytime(text) {
    apps := Map()
    if (StrLen(text) > 20000000)
        return apps
    stack := []
    pending := ""
    hasPending := false
    position := 1
    length := StrLen(text)
    while (position <= length) {
        if !RegExMatch(text, '\G\s*+(?:"((?:[^"\\]|\\.)*+)"|(\{)|(\}))', &m, position)
            break
        position += m.Len
        if (m[2] != "") {                       ; {
            stack.Push(hasPending ? pending : "")
            hasPending := false
            if (stack.Length > 64)
                break
        } else if (m[3] != "") {                ; }
            if stack.Length
                stack.Pop()
            hasPending := false
        } else if !hasPending {                 ; a key
            pending := m[1]
            hasPending := true
        } else {                                ; its value
            hasPending := false
            depth := stack.Length
            if (depth >= 3 && stack[depth - 1] = "apps" && stack[depth - 2] = "Steam"
                && RegExMatch(stack[depth], "^\d{1,10}$")
                && (pending = "Playtime" || pending = "LastPlayed") && RegExMatch(m[1], "^\d{1,12}$")) {
                id := stack[depth]
                if !apps.Has(id)
                    apps[id] := Map("minutes", 0, "last", 0)
                apps[id][pending = "Playtime" ? "minutes" : "last"] := Integer(m[1])
            }
        }
    }
    return apps
}

; Steam's support packages are not games.
IsSteamTool(name) {
    return RegExMatch(name, "i)^(Steamworks Common Redistributables|Steam Linux Runtime|Proton|SteamVR)")
}

; ------------------------------------------------------------ controllers (1.7.0)

; "VVVV:PPPP" (uppercase hex) identifies a controller model.
ControllerKey(vid, pid) {
    return Format("{:04X}:{:04X}", vid & 0xFFFF, pid & 0xFFFF)
}

ValidateControllerKey(key) {
    if !RegExMatch(key, "^[0-9A-F]{4}:[0-9A-F]{4}$")
        throw Error("Invalid controller.")
    return key
}

; The mode a controller presents itself in, from its vendor and product IDs.
ControllerMode(vid, pid) {
    vid &= 0xFFFF, pid &= 0xFFFF
    if (vid = 0x045E)
        return "X-input"
    if (vid = 0x057E)
        return "Switch"
    if (vid = 0x054C)
        return "PlayStation"
    if (vid = 0x2DC8)
        return "D-input"
    return "DirectInput"
}

; Wireless receivers name themselves ("8BitDo Pro 3 Receiver", "... Adapter").
IsReceiverName(name) {
    return RegExMatch(name, "i)\b(receiver|adapter|dongle)\b") > 0
}

; A readable default name when Windows has none worth showing.
ControllerMaker(vid) {
    static makers := Map(0x045E, "Xbox-compatible controller", 0x057E, "Switch-compatible controller",
        0x054C, "PlayStation-compatible controller", 0x2DC8, "8BitDo controller")
    return makers.Has(vid & 0xFFFF) ? makers[vid & 0xFFFF] : "Game controller"
}

; Names given in ASCS also go to Windows' per-user game controller name, so
; they are kept short and plain.
ValidateControllerName(name) {
    name := Trim(name)
    if (StrLen(name) > 48 || RegExMatch(name, "[\x00-\x1F\x7F|\\<>]"))
        throw Error("Controller names are limited to 48 characters, without | \ < or >.")
    return name
}

; How a device with these Windows instance IDs (under Enum\HID) is connected:
; Bluetooth HID devices carry the HID service UUID or a BLE prefix.
HidConnection(instanceKey) {
    if RegExMatch(instanceKey, "i)^\{00001124-0000-1000-8000-00805f9b34fb\}|^\{00001812-0000-1000-8000-00805f9b34fb\}")
        return "Bluetooth"
    return "USB"
}

; The vendor and product IDs in a key under Enum\HID or Enum\USB, as Map(vid, pid).
HidKeyIds(instanceKey) {
    if RegExMatch(instanceKey, "i)VID&[0-9A-F]{2,4}([0-9A-F]{4})_PID&([0-9A-F]{4})", &m)
        || RegExMatch(instanceKey, "i)VID_([0-9A-F]{4})&PID_([0-9A-F]{4})", &m)
        return Map("vid", Integer("0x" m[1]), "pid", Integer("0x" m[2]))
    return 0
}

; Steam's appcache\appinfo.vdf (binary, formats v28 and v29): the names of
; the apps in "wanted" (a Map of app id strings), read from each app's
; appinfo > common > name. Other apps are skipped by their recorded size, so
; only the wanted entries are walked. Everything is bounds-checked; a damaged
; file just yields fewer names.
ParseSteamAppNames(buffer, size, wanted) {
    names := Map()
    if (size < 16 || size > 400000000)
        return names
    magic := NumGet(buffer, 0, "UInt")
    if (magic != 0x07564429 && magic != 0x07564428)
        return names
    v29 := magic = 0x07564429
    nameKey := -1, commonKey := -1, entriesEnd := size, position := 8
    if v29 {
        tableOffset := NumGet(buffer, 8, "Int64")
        if (tableOffset < 16 || tableOffset + 4 > size)
            return names
        entriesEnd := tableOffset
        count := NumGet(buffer, tableOffset, "UInt")
        cursor := tableOffset + 4
        Loop Min(count, 1000000) {
            text := ReadCString(buffer, size, &cursor)
            if (text = "")
                break
            if (text == "name")
                nameKey := A_Index - 1
            else if (text == "common")
                commonKey := A_Index - 1
            if (nameKey >= 0 && commonKey >= 0)
                break
        }
        if (nameKey < 0 || commonKey < 0)
            return names
        position := 16
    }
    while (position + 8 <= entriesEnd) {
        appid := NumGet(buffer, position, "UInt")
        length := NumGet(buffer, position + 4, "UInt")
        if (appid = 0 || position + 8 + length > entriesEnd)
            break
        if wanted.Has(String(appid)) && length > 60 {
            name := SteamCommonName(buffer, position + 8 + 60, position + 8 + length, v29, nameKey, commonKey)
            if (name != "")
                names[String(appid)] := SubStr(name, 1, 160)
        }
        position += 8 + length
    }
    return names
}

; A null-terminated UTF-8 string at cursor (moved past it); "" if none.
ReadCString(buffer, limit, &cursor) {
    start := cursor
    while (cursor < limit && NumGet(buffer, cursor, "UChar") != 0)
        cursor++
    if (cursor >= limit)
        return ""
    text := cursor > start ? StrGet(buffer.Ptr + start, cursor - start, "UTF-8") : ""
    cursor++
    return text
}

; Walks one app's binary KeyValues for common > name.
SteamCommonName(buffer, position, limit, v29, nameKey, commonKey) {
    path := []
    Loop 100000 {
        if (position >= limit)
            return ""
        kind := NumGet(buffer, position, "UChar"), position++
        if (kind = 0x08) {
            if !path.Length
                return ""
            path.Pop()
            continue
        }
        if v29 {
            if (position + 4 > limit)
                return ""
            key := NumGet(buffer, position, "Int"), position += 4
            isName := key = nameKey, isCommon := key = commonKey
        } else {
            keyText := ReadCString(buffer, limit, &position)
            isName := keyText == "name", isCommon := keyText == "common"
        }
        switch kind {
            case 0x00:
                path.Push(isCommon)
                if (path.Length > 64)
                    return ""
            case 0x01:
                value := ReadCString(buffer, limit, &position)
                if (isName && path.Length && path[path.Length])
                    return value
            case 0x02, 0x03, 0x04, 0x06:
                position += 4
            case 0x07, 0x0A:
                position += 8
            default:
                return ""
        }
    }
    return ""
}

; RetroAchievements images by token: "b:<digits>" is a badge, "i:<digits>" a
; game icon. Returns Map(url, file); the address is always built here, on
; media.retroachievements.org, and the cache file name from the digits.
RetroAchievementsImage(token) {
    if RegExMatch(token, "^b:(\d{1,8})$", &m)
        return Map("url", "https://media.retroachievements.org/Badge/" m[1] ".png", "file", "b-" m[1] ".png")
    if RegExMatch(token, "^i:(\d{1,8})$", &m)
        return Map("url", "https://media.retroachievements.org/Images/" m[1] ".png", "file", "i-" m[1] ".png")
    throw Error("Invalid RetroAchievements image.")
}

; The PSO session's Discord voice channel. Accepts a channel link as Discord's
; Copy Link gives it (https://discord.com/channels/<server>/<channel>, also
; ptb./canary. and discordapp.com) or the app's own discord://-/channels/...
; form, and returns the app link ASCS opens, rebuilt from the two numeric ids
; only. "" clears it. Anything else (DMs, messages, other sites) is rejected.
DiscordChannelUri(link) {
    link := Trim(link)
    if (link = "")
        return ""
    if RegExMatch(link, "i)^(?:https://(?:(?:ptb|canary)\.)?discord(?:app)?\.com/channels/|discord://-/channels/)(\d{15,21})/(\d{15,21})/?$", &m)
        return "discord://-/channels/" m[1] "/" m[2]
    throw Error("Use a Discord channel link, as Copy Link gives it: https://discord.com/channels/<server>/<channel>.")
}

; The game named by an emulator window's title, or "" for its menu or any
; other window (the same rules as gameFromWindowTitle in frontend\games.js):
;   Dolphin   "Dolphin 2512 | JIT64 DC | D3D12 | HLE | Super Paper Mario (R8PP01)"
;   RetroArch "RetroArch Beetle PSX HW 0.9.44 || Brave Fencer Musashi (USA) || FPS: 60"
;   PCSX2     "Okami [SLUS-21115]" (its main window is "PCSX2 v2.4.0")
EmulatorGameName(emulator, title) {
    title := Trim(RegExReplace(RegExReplace(title, "[\x00-\x1F\x7F]", " "), "\s{2,}", " "))
    if (title = "")
        return ""
    switch emulator {
        case "dolphin":
            parts := StrSplit(title, " | ")
            if (parts.Length < 2)
                return ""
            return Trim(RegExReplace(parts[parts.Length], "\s*\([A-Z0-9]{6}\)\s*$"))
        case "retroarch":
            parts := []
            for part in StrSplit(title, "||")
                if ((part := Trim(part)) != "")
                    parts.Push(part)
            return (parts.Length >= 2 && !RegExMatch(parts[2], "i)^retroarch")) ? parts[2] : ""
        case "pcsx2":
            return RegExMatch(title, "i)^pcsx2\b") ? "" : RegExReplace(title, "\s+\[[^\]]*\]$")
    }
    return title
}

; Picks the title Now playing reads from an emulator's visible windows (Maps
; with title and area): the largest window showing a game, so a focused game
; list, settings dialog or second window never hides a running game; with no
; game showing, the first window's title (the menu); "" with no windows.
PickEmulatorWindow(emulator, windows) {
    best := "", bestArea := -1
    for window in windows {
        if (EmulatorGameName(emulator, window["title"]) != "" && window["area"] > bestArea)
            best := window["title"], bestArea := window["area"]
    }
    if (bestArea >= 0)
        return best
    return windows.Length ? windows[1]["title"] : ""
}

; Now playing's session timer: when the current session began, in Unix
; seconds. `previous` is the last observation for this source (a Map with
; owner, title and since) or 0; `owner` identifies the running instance (a
; process id, or a Steam app id). A new instance started at its process start
; time when that is known; a different game in the same instance (the window
; title changed) started now; otherwise the session carries on.
PlaySessionSince(previous, owner, title, now, started := 0) {
    if IsObject(previous) && previous["owner"] = owner {
        if (previous["title"] == title)
            return previous["since"]
        return now
    }
    return (started > 0 && started <= now) ? started : now
}

; Whether a file name in data\ra-images is one ASCS wrote (an image or a
; leftover partial write). Only these are ever deleted by the cache cap.
IsRaImageCacheFile(name) {
    return RegExMatch(name, "i)^[bi]-\d{1,8}\.png(\.tmp)?$") > 0
}

; The cache cap: given the folder's files (Maps with name, size, time as
; YYYYMMDDHH24MISS of last use), returns the names to delete. Leftover .tmp
; files always go. If the images total more than `limit` bytes, the least
; recently used are removed until the total is at most `target`.
RaImagesToPrune(files, limit, target) {
    remove := [], keep := [], total := 0
    for file in files {
        if !IsRaImageCacheFile(file["name"])
            continue
        if (SubStr(file["name"], -4) = ".tmp") {
            remove.Push(file["name"])
            continue
        }
        keep.Push(file["time"] "|" file["name"] "|" file["size"])
        total += file["size"]
    }
    if (total <= limit)
        return remove
    ; Oldest first: the times are fixed-width digits, so a text sort orders them.
    list := ""
    for line in keep
        list .= line "`n"
    for line in StrSplit(Sort(RTrim(list, "`n")), "`n") {
        if (total <= target)
            break
        parts := StrSplit(line, "|")
        remove.Push(parts[2])
        total -= parts[3]
    }
    return remove
}
