; ==========================================
; VIRTUAL DESKTOPS (1.9.0)
; ==========================================

; Failure-safe wrappers over lib\VirtualDesktopAccessor.dll, for workspaces
; across desktops. Probed on Windows build 26300 in a separate test process:
; desktop names (with guard bytes after the buffer), a window's desktop,
; moving and pinning a window, and creating and removing a desktop. Each
; returns -1, "" or false when the DLL is missing or a call fails, and
; callers then keep to the current desktop, as before 1.9.0.

VdaInt(name, args*) {
    global ASCS_VirtualDesktopDllPath
    if !FileExist(ASCS_VirtualDesktopDllPath)
        return -1
    params := [args*]
    params.Push("Int")
    try return DllCall(ASCS_VirtualDesktopDllPath "\" name, params*)
    catch as err {
        WriteLog("Virtual desktops: " name " failed: " err.Message)
        return -1
    }
}

DesktopCount() => VdaInt("GetDesktopCount")
CurrentDesktop() => VdaInt("GetCurrentDesktopNumber")
DesktopsAvailable() => DesktopCount() > 0

; The desktop a window is on (0-based), or -1 (pinned to all, or unknown).
WindowDesktop(hwnd) => VdaInt("GetWindowDesktopNumber", "Ptr", hwnd)
WindowPinned(hwnd) => VdaInt("IsPinnedWindow", "Ptr", hwnd) = 1
MoveWindowToDesktop(hwnd, number) => VdaInt("MoveWindowToDesktopNumber", "Ptr", hwnd, "Int", number) != -1
PinWindowToAllDesktops(hwnd) => VdaInt("PinWindow", "Ptr", hwnd) != -1
AddDesktop() => VdaInt("CreateDesktop")

; A desktop's name as set in Task View ("" when it has none).
DesktopName(number) {
    buf := Buffer(512, 0)
    if (VdaInt("GetDesktopName", "Int", number, "Ptr", buf, "UPtr", 511) = -1)
        return ""
    return Trim(StrGet(buf, 511, "UTF-8"))
}

DesktopNames() {
    names := []
    Loop Max(0, DesktopCount())
        names.Push(DesktopName(A_Index - 1))
    return names
}

; Windows on other desktops are cloaked by the shell (DWM_CLOAKED_SHELL, 2);
; other cloaking (suspended apps) is left alone.
IsCloakedByShell(hwnd) {
    cloaked := 0
    result := DllCall("Dwmapi.dll\DwmGetWindowAttribute", "Ptr", hwnd, "UInt", 14, "UInt*", &cloaked, "UInt", 4, "Int")
    return result = 0 && cloaked = 2
}
