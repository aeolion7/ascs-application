#Requires AutoHotkey v2.0 64-bit

if (A_Args.Length != 1 || !RegExMatch(A_Args[1], "i)^[A-Z]$"))
    ExitApp(2)

letter := StrUpper(A_Args[1])
drive := letter ":"
resultPath := A_ScriptDir "\data\drive-" letter ".probe"
tempPath := resultPath ".tmp"
online := false
usage := 0
used := 0
total := 0

try {
    if (DriveGetStatus(drive) = "Ready") {
        capacity := DriveGetCapacity(drive) / 1024
        free := DriveGetSpaceFree(drive) / 1024
        if (capacity > 0) {
            total := Round(capacity, 1)
            used := Round(capacity - free, 1)
            usage := Round((capacity - free) / capacity * 100, 1)
            online := true
        }
    }
} catch as err {
    online := false
}

if FileExist(tempPath)
    FileDelete(tempPath)

FileAppend(
    (online ? "1" : "0") "`n"
    Format("{:.1f}", usage) "`n"
    Format("{:.1f}", used) "`n"
    Format("{:.1f}", total),
    tempPath,
    "UTF-8-RAW"
)
FileMove(tempPath, resultPath, 1)
