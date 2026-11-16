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
GoToDesktop(number) => VdaInt("GoToDesktopNumber", "Int", number) != -1
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

; Brings a window forward wherever it is (2.7.1). AutoHotkey counts a window
; on another desktop as hidden, so a plain WinActivate can't find it ("Target
; window not found"). This goes to the window's desktop first (when the DLL
; can say which), waits up to a second for the shell to show it there, then
; activates it with hidden windows detected. True once it's active.
ActivateWindow(hwnd, seconds := 2) {
    if !DllCall("IsWindow", "Ptr", hwnd, "Int")
        return false
    if IsCloakedByShell(hwnd) {
        desktop := WindowDesktop(hwnd)
        if (desktop >= 0 && desktop != CurrentDesktop() && GoToDesktop(desktop)) {
            deadline := A_TickCount + 1000
            while (IsCloakedByShell(hwnd) && A_TickCount < deadline)
                Sleep(15)
        }
    }
    previous := A_DetectHiddenWindows
    DetectHiddenWindows(true)
    try {
        WinActivate("ahk_id " hwnd)
        return WinWaitActive("ahk_id " hwnd, , seconds) != 0
    } catch as err {
        WriteLog("Window activation failed: " err.Message)
        return false
    } finally {
        DetectHiddenWindows(previous)
    }
}

; Brings forward one of an app's windows (2.7.1): one on this desktop, else
; one on another, switching to it. A window pinned to every desktop, or one
; whose desktop can't be read, no longer stops the rest. False when there's
; none; throws when one can't be brought forward.
FocusAppWindow(windows, applicationName) {
    global ASCS_VirtualDesktopDllPath
    entries := []
    for hwnd in windows {
        here := !IsCloakedByShell(hwnd)
        entries.Push(Map("hwnd", hwnd, "here", here, "desktop", here ? -1 : WindowDesktop(hwnd)))
    }
    chosen := PickFocusWindow(entries)
    if (chosen = "")
        return false
    if ActivateWindow(chosen["hwnd"])
        return true
    if (!chosen["here"] && !FileExist(ASCS_VirtualDesktopDllPath))
        throw Error(applicationName " is open on another desktop; going there needs VirtualDesktopAccessor.dll in lib.")
    throw Error("The " applicationName " window couldn't be brought forward.")
}
