; Included at the top of each script in a copy made by `maestro isolate` (2.2.0).
; The command rewrites calls that could act outside the copy to the Isolate_
; functions below: they act only inside the copy, and write anything else to
; isolate-log.txt instead of doing it. Registry writes, mute, volume and
; Shutdown are replaced outright, by functions of the same name. Errors are
; logged, not shown, and the main script exits by itself after Isolate_Seconds.
; Keep this file ASCII. Nothing here may call a rewritten name without the
; Isolate_ prefix except to do the real thing inside the copy.

global Isolate_Seconds := 120               ; set by maestro isolate
global Isolate_Root := A_ScriptDir
global Isolate_LogFile := A_ScriptDir "\isolate-log.txt"
global Isolate_Started := Map()             ; processes this copy started, by PID

OnError(Isolate_Error)
Isolate_Note("start", A_Args.Length ? Isolate_Join(A_Args) : "")
if (A_ScriptName = "ASCS-Isolated.ahk")
    SetTimer(Isolate_End, -Isolate_Seconds * 1000)

; ---- the log

Isolate_Note(kind, detail := "") {
    line := FormatTime(, "HH:mm:ss") "." Format("{:03}", A_MSec) "  " A_ScriptName "  " kind
    if (detail != "")
        line .= "  " SubStr(RegExReplace(detail, "[\r\n]+", " "), 1, 400)
    Loop 10 {                                ; a probe may be writing at the same moment
        try {
            FileAppend(line "`r`n", Isolate_LogFile, "UTF-8-RAW")
            return true
        }
        Sleep(15)
    }
    return true
}

Isolate_Join(values) {
    text := ""
    for value in values
        text .= (A_Index = 1 ? "" : ", ") (IsObject(value) ? "<" Type(value) ">" : String(value))
    return text
}

Isolate_Error(thrown, mode) {
    if (thrown is Error)
        Isolate_Note("error", thrown.Message (thrown.Extra != "" ? " (" thrown.Extra ")" : "") " at " thrown.File ":" thrown.Line)
    else
        Isolate_Note("error", String(thrown))
    return 1                                ; no dialog to wait on
}

Isolate_End() {
    Isolate_Note("end", "after " Isolate_Seconds " s")
    ExitApp(0)
}

; Logs a call that was stopped. True, so a stopped call reads as handled.
Isolate_Stub(name, args*) {
    Isolate_Note("blocked", name (args.Length ? "(" Isolate_Join(args) ")" : ""))
    return true
}

; ---- where the copy may act

; The full path, worked out as text, or "" for any path that can't be read
; plainly: network and device paths, another drive's current folder, streams,
; and names Windows would trim (a trailing dot or space).
Isolate_FullPath(path) {
    path := StrReplace(path, "/", "\")
    if (SubStr(path, 1, 2) = "\\" || InStr(path, ":", , 3))
        return ""
    if !RegExMatch(path, "^[A-Za-z]:\\") {
        if RegExMatch(path, "^[A-Za-z]:")
            return ""
        path := (SubStr(path, 1, 1) = "\" ? SubStr(A_WorkingDir, 1, 2) : A_WorkingDir "\") path
    }
    parts := []
    for part in StrSplit(path, "\") {
        if (part = "." || (part = "" && A_Index > 1))
            continue
        if (part = "..") {
            if (parts.Length > 1)
                parts.Pop()
            continue
        }
        if RegExMatch(part, "[ .]$")
            return ""
        parts.Push(part)
    }
    full := ""
    for part in parts
        full .= (A_Index = 1 ? "" : "\") part
    return full
}

Isolate_Inside(path) {
    full := Isolate_FullPath(path)
    return full != "" && SubStr(full, 1, StrLen(Isolate_Root) + 1) = Isolate_Root "\"
}

; Only AutoHotkey running one of the copy's own scripts, or a pythonw inside
; the copy (its calendar server).
Isolate_MayRun(target) {
    if !RegExMatch(target, '^"([^"]+)"(?:\s+"([^"]+)")?', &found)
        return false
    if (found[1] = A_AhkPath)
        return found[2] != "" && RegExMatch(found[2], "i)\.ahk$") && Isolate_Inside(found[2])
    return RegExMatch(found[1], "i)\\pythonw\.exe$") && Isolate_Inside(found[1])
}

; ---- rewritten calls: the real thing inside the copy, a log line otherwise

Isolate_Run(target, workingDir := "", options := "", &pid := 0) {
    if !Isolate_MayRun(target) {
        Isolate_Note("blocked", "Run " target)
        pid := 0
        return
    }
    Run(target, workingDir, options, &pid)
    Isolate_Started[pid] := true
    Isolate_Note("ran", target)
}

Isolate_RunWait(target, workingDir := "", options := "", &pid := 0) {
    if !Isolate_MayRun(target) {
        Isolate_Note("blocked", "RunWait " target)
        pid := 0
        return ""
    }
    Isolate_Note("ran", target)
    return RunWait(target, workingDir, options, &pid)
}

Isolate_ProcessClose(pidOrName) {
    if (IsInteger(pidOrName) && Isolate_Started.Has(Integer(pidOrName)))
        return ProcessClose(pidOrName)
    Isolate_Note("blocked", "ProcessClose " pidOrName)
    return 0
}

Isolate_FileDelete(pattern) {
    if Isolate_Inside(pattern)
        return FileDelete(pattern)
    Isolate_Note("blocked", "FileDelete " pattern)
}

Isolate_FileRecycle(pattern) {
    if Isolate_Inside(pattern)
        return FileRecycle(pattern)
    Isolate_Note("blocked", "FileRecycle " pattern)
}

Isolate_FileMove(source, dest, overwrite := 0) {
    if (Isolate_Inside(source) && Isolate_Inside(dest))
        return FileMove(source, dest, overwrite)
    Isolate_Note("blocked", "FileMove " source " > " dest)
}

Isolate_FileCopy(source, dest, overwrite := 0) {
    if Isolate_Inside(dest)
        return FileCopy(source, dest, overwrite)
    Isolate_Note("blocked", "FileCopy " source " > " dest)
}

Isolate_DirDelete(dir, recurse := 0) {
    if Isolate_Inside(dir)
        return DirDelete(dir, recurse)
    Isolate_Note("blocked", "DirDelete " dir)
}

Isolate_DirMove(source, dest, flag := 0) {
    if (Isolate_Inside(source) && Isolate_Inside(dest))
        return DirMove(source, dest, flag)
    Isolate_Note("blocked", "DirMove " source " > " dest)
}

Isolate_DirCopy(source, dest, overwrite := 0) {
    if Isolate_Inside(dest)
        return DirCopy(source, dest, overwrite)
    Isolate_Note("blocked", "DirCopy " source " > " dest)
}

Isolate_FileAppend(text, fileName, options := "") {
    if (fileName = "*" || fileName = "**" || Isolate_Inside(fileName))
        return FileAppend(text, fileName, options)
    Isolate_Note("blocked", "FileAppend " fileName)
}

Isolate_IniWrite(value, fileName, section, key?) {
    if !Isolate_Inside(fileName)
        return Isolate_Note("blocked", "IniWrite " fileName " [" section "]")
    if IsSet(key)
        return IniWrite(value, fileName, section, key)
    return IniWrite(value, fileName, section)
}

Isolate_IniDelete(fileName, section, key?) {
    if !Isolate_Inside(fileName)
        return Isolate_Note("blocked", "IniDelete " fileName " [" section "]")
    if IsSet(key)
        return IniDelete(fileName, section, key)
    return IniDelete(fileName, section)
}

; Reading is allowed anywhere; writing or appending only inside the copy.
Isolate_FileOpen(fileName, flags, encoding?) {
    access := IsNumber(flags) ? flags & 0x3 : StrSplit(flags, "-")[1]
    writes := IsNumber(access) ? access != 0 : (InStr(access, "w") || InStr(access, "a"))
    if (writes && fileName != "*" && fileName != "**" && !Isolate_Inside(fileName)) {
        Isolate_Note("blocked", "FileOpen " fileName " " flags)
        throw Error("maestro isolate: no writing outside the copy.", -1, fileName)
    }
    return IsSet(encoding) ? FileOpen(fileName, flags, encoding) : FileOpen(fileName, flags)
}

; ---- replaced outright: nothing in the copy may do these

RegWrite(args*) => Isolate_Stub("RegWrite", args*)
RegDelete(args*) => Isolate_Stub("RegDelete", args*)
RegDeleteKey(args*) => Isolate_Stub("RegDeleteKey", args*)
SoundSetMute(args*) => Isolate_Stub("SoundSetMute", args*)
SoundSetVolume(args*) => Isolate_Stub("SoundSetVolume", args*)
Shutdown(args*) => Isolate_Stub("Shutdown", args*)
