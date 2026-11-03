<#
.SYNOPSIS
    Sets up the ASCS shortcuts and the Ctrl+Alt+Shift+A start/reload hotkey.

.DESCRIPTION
    * Start Menu: an "ASCS" shortcut (pin it to Start or the taskbar).
    * Startup:    "ASCS Launcher", a tiny resident script (ASCS.Launcher.ahk)
                  that owns Ctrl+Alt+Shift+A. It starts ASCS when it is not
                  running and asks it to reload when it is. The launcher is
                  also started immediately, so the hotkey works right away.

    Windows 11 does not reliably honour hotkeys on Start Menu shortcuts, which
    is why the hotkey lives in the launcher rather than on the shortcut.

    -Startup also starts ASCS itself at sign-in.
    -Remove  deletes everything this script creates and stops the launcher.

.EXAMPLE
    pwsh -File C:\ASCS\tools\Install-Shortcut.ps1
    pwsh -File C:\ASCS\tools\Install-Shortcut.ps1 -Startup
    pwsh -File C:\ASCS\tools\Install-Shortcut.ps1 -Remove
#>
param(
    [switch]$Startup,
    [switch]$Remove,
    # Overrides the Start Menu and Startup folders (used for testing).
    [string]$ShortcutDirectory = [Environment]::GetFolderPath("Programs"),
    [string]$StartupDirectory = [Environment]::GetFolderPath("Startup"),
    # Skip starting or stopping the resident launcher (used for testing).
    [switch]$NoLaunch
)
$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent
$script = Join-Path $root "ASCS.ahk"
$launcher = Join-Path $root "ASCS.Launcher.ahk"
$icon = Join-Path $root "frontend\assets\ascs.ico"
$menuLink = Join-Path $ShortcutDirectory "ASCS.lnk"
$launcherLink = Join-Path $StartupDirectory "ASCS Launcher.lnk"
$startupLink = Join-Path $StartupDirectory "ASCS.lnk"

function Stop-Launcher {
    Get-CimInstance Win32_Process -Filter "Name LIKE 'AutoHotkey%'" |
        Where-Object { $_.CommandLine -like "*ASCS.Launcher.ahk*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host "Stopped the running launcher." }
}

if ($Remove) {
    foreach ($link in @($menuLink, $launcherLink, $startupLink)) {
        if (Test-Path $link) { Remove-Item $link; Write-Host "Removed $link" }
    }
    if (-not $NoLaunch) { Stop-Launcher }
    return
}

$ahk = @(
    "$env:ProgramFiles\AutoHotkey\v2\AutoHotkey64.exe",
    "$env:ProgramFiles\AutoHotkey\AutoHotkey64.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $ahk) { throw "AutoHotkey v2 (64-bit) was not found." }
foreach ($file in @($script, $launcher)) {
    if (-not (Test-Path $file)) { throw "$file was not found." }
}

$shell = New-Object -ComObject WScript.Shell
function New-AscsShortcut([string]$Path, [string]$Target, [string]$Description) {
    $link = $shell.CreateShortcut($Path)
    $link.TargetPath = $ahk
    $link.Arguments = "`"$Target`""
    $link.WorkingDirectory = $root
    $link.IconLocation = "$icon,0"
    $link.Description = $Description
    $link.Hotkey = ""
    $link.Save()
    Write-Host "Created $Path"
}

New-Item -ItemType Directory -Force $ShortcutDirectory, $StartupDirectory | Out-Null
New-AscsShortcut $menuLink $script "Aeolionware Super Command System"
New-AscsShortcut $launcherLink $launcher "ASCS Launcher: Ctrl+Alt+Shift+A starts or reloads ASCS"
if ($Startup) { New-AscsShortcut $startupLink $script "Start ASCS at sign-in" }

if (-not $NoLaunch) {
    # The launcher replaces any older running copy of itself.
    Start-Process $ahk -ArgumentList "`"$launcher`"" -WorkingDirectory $root
    Write-Host "Started the launcher. Ctrl+Alt+Shift+A is active now."
}
