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
