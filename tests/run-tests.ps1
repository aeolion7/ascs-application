<#
    Runs Maestro's automated checks:
      * core     tests\core.tests.ahk — lib\ASCS.Core.ahk (validators, workspace matching, search, activity)
      * timers   no timer is set both repeating and one-shot
      * startup  hotkeys wait for the window, the start notices, and the daily backup waits for start-up
      * frontend tests\frontend.tests.html — the frontend modules' pure logic, in headless Edge
      * smoke    tests\smoke.js (1.9.0) — the real page, every module and stylesheet, with a stand-in
                 for WebView2: every view opens without script errors, every message it sends is
                 in ASCS.ahk's allowlist, and (2.2.0) loading shapes, motion and the seven type sizes
      * cli      tests\cli.tests.ps1 — the maestro command, against throwaway repositories
    None of them touches the running Maestro or the data folder.
    Usage:  pwsh -File tests\run-tests.ps1      Exit code 0 when everything passes.
#>
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$work = Join-Path ([IO.Path]::GetTempPath()) "ascs-tests"
New-Item -ItemType Directory -Force $work | Out-Null
$failed = $false

function Show-Result([string]$Suite, [string]$Text) {
    $first = ($Text -split "`n")[0]
    if ($first -match '^PASS (\d+) FAIL (\d+)') {
        $color = if ([int]$Matches[2] -eq 0) { "Green" } else { "Red" }
        Write-Host ("{0,-10} {1}" -f $Suite, $first) -ForegroundColor $color
        ($Text -split "`n" | Select-Object -Skip 1 | Where-Object { $_ }) | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        return [int]$Matches[2] -eq 0
    }
    Write-Host "$Suite did not report results." -ForegroundColor Red
    if ($Text) { Write-Host $Text }
    return $false
}

# --- AutoHotkey core tests
$ahk = @(
    "$env:ProgramFiles\AutoHotkey\v2\AutoHotkey64.exe",
    "$env:ProgramFiles\AutoHotkey\AutoHotkey64.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $ahk) { throw "AutoHotkey v2 (64-bit) was not found." }
$coreResults = Join-Path $work "core.txt"
$coreOutput = Join-Path $work "core.out"
Remove-Item $coreResults, $coreOutput -ErrorAction SilentlyContinue
$process = Start-Process $ahk -ArgumentList "/ErrorStdOut=UTF-8", "`"$root\tests\core.tests.ahk`"", "`"$coreResults`"" `
    -RedirectStandardOutput $coreOutput -PassThru -NoNewWindow
if (-not $process.WaitForExit(30000)) { $process.Kill(); throw "AutoHotkey tests timed out (a dialog may be open)." }
$warnings = if (Test-Path $coreOutput) { (Get-Content $coreOutput -Raw) } else { "" }
if ($warnings) { Write-Host "AutoHotkey output:`n$warnings" -ForegroundColor Yellow; $failed = $true }
$text = if (Test-Path $coreResults) { Get-Content $coreResults -Raw -Encoding utf8 } else { "" }
if (-not (Show-Result "core" $text)) { $failed = $true }

# --- A timer is either repeating or one-shot. SetTimer with a negative period
# replaces a repeating timer of the same function, which silently stopped System's
# readings for every release up to 2.0.0.
$uses = @{}
$sources = @(Join-Path $root "ASCS.ahk") + @(Get-ChildItem (Join-Path $root "lib\features") -Filter *.ahk | ForEach-Object FullName)
foreach ($source in $sources) {
    foreach ($match in [regex]::Matches((Get-Content $source -Raw -Encoding utf8), 'SetTimer\((\w+),\s*(-?)(\w+)\)')) {
        if ($match.Groups[3].Value -eq "0") { continue }
        $name = $match.Groups[1].Value
        if (-not $uses.ContainsKey($name)) { $uses[$name] = [Collections.Generic.HashSet[string]]::new() }
        [void]$uses[$name].Add($(if ($match.Groups[2].Value) { "once" } else { "repeat" }))
    }
}
$mixed = @($uses.Keys | Where-Object { $uses[$_].Count -gt 1 } | Sort-Object)
$report = @("PASS $($uses.Count - $mixed.Count) FAIL $($mixed.Count)") + @($mixed | ForEach-Object { "FAIL: $_ is set both repeating and one-shot" })
if (-not (Show-Result "timers" ($report -join "`n"))) { $failed = $true }

# --- Hotkeys wait for the window. A hotkey can run while the start-up code is
# still waiting on WebView2, and Super reached for a window that wasn't there yet.
$main = Get-Content (Join-Path $root "ASCS.ahk") -Raw -Encoding utf8
$keys = Get-Content (Join-Path $root "lib\features\SuperKey.ahk") -Raw -Encoding utf8
$checks = [ordered]@{
    "hotkeys are suspended before the window is made" = ($main.IndexOf("Suspend(true)") -ge 0 -and $main.IndexOf("Suspend(true)") -lt $main.IndexOf("ASCS_App := WebViewGui("))
    "and come back once it exists" = ($main.IndexOf("Suspend(false)") -gt $main.IndexOf("ASCS_App := WebViewGui("))
    "Super still answers while starting" = ($keys -match '(?s)#SuspendExempt\s*~F24::')
    "and doesn't reach for a missing window" = ($main -match '(?s)ToggleCommandCenter\(\) \{.*?IsObject\(ASCS_App\).*?ASCS_App\.Hwnd')
    "nor does System's visibility check, which runs while starting" = ($main -match '(?s)IsDashboardWindowVisible\(\) \{.*?IsObject\(ASCS_App\).*?ASCS_App\.Hwnd')
    "only Super and reload are exempt" = ([regex]::Matches($keys, '(?m)^#SuspendExempt\s*$').Count -eq 2 -and [regex]::Matches($main, '(?m)^#SuspendExempt').Count -eq 0)
    "or open blank while the page loads" = ($main -match '(?s)ToggleCommandCenter\(\) \{.*?!ASCS_PageReady.*?ASCS_App\.Hwnd')
    "every start says it's tuning up, before WebView2" = ($main.IndexOf('ShowNotice("Maestro is tuning up') -ge 0 -and $main.IndexOf('ShowNotice("Maestro is tuning up') -lt $main.IndexOf("ASCS_App := WebViewGui(") -and $main -notmatch 'A_Args\[1\] = "--starting"')
    "Maestro says when it's ready" = ($main -match 'ShowNotice\("Maestro is ready\."\)')
    "the daily backup waits for start-up to finish" = ((Get-Content (Join-Path $root "lib\features\Backups.ahk") -Raw -Encoding utf8) -match '(?s)CheckBackupDue\(\*\) \{.*?BackupWaitsForStart\(A_TickCount - ASCS_StartedAt\).*?RunBackup\(\)')
    "the launcher uses the toast, not a tooltip" = ((Get-Content (Join-Path $root "ASCS.Launcher.ahk") -Raw -Encoding utf8) -notmatch 'ToolTip\(')
}
$bad = @($checks.Keys | Where-Object { -not $checks[$_] })
$report = @("PASS $($checks.Count - $bad.Count) FAIL $($bad.Count)") + @($bad | ForEach-Object { "FAIL: $_" })
if (-not (Show-Result "startup" ($report -join "`n"))) { $failed = $true }

# --- Frontend tests in headless Edge
$edge = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw "Microsoft Edge was not found." }
$dom = Join-Path $work "palette.html"
$url = "file:///" + ($root.Replace('\', '/')) + "/tests/frontend.tests.html"
$process = Start-Process $edge -ArgumentList "--headless=new", "--disable-gpu", "--allow-file-access-from-files", "--user-data-dir=`"$work\edge`"",
    "--virtual-time-budget=2000", "--dump-dom", $url -RedirectStandardOutput $dom -RedirectStandardError (Join-Path $work "edge.err") -PassThru -NoNewWindow
if (-not $process.WaitForExit(40000)) { $process.Kill(); throw "Edge timed out." }
$html = Get-Content $dom -Raw -Encoding utf8
$match = [regex]::Match($html, '<pre id="results">([\s\S]*?)</pre>')
$text = if ($match.Success) { [Net.WebUtility]::HtmlDecode($match.Groups[1].Value) } else { "" }
if (-not (Show-Result "frontend" $text)) { $failed = $true }

# --- Smoke test: the real page in headless Edge
# A copy of index.html in the work folder: its base is the frontend folder, so
# every module and stylesheet loads from the repo; the stand-in for WebView2
# (tests\smoke.js) and the allowlist go in before the page's own scripts. The
# Content-Security-Policy is left out of the copy only, since it would block
# those two from outside the frontend folder.
$frontend = "file:///" + ($root.Replace('\', '/')) + "/frontend/"
$page = Get-Content (Join-Path $root "frontend\index.html") -Raw -Encoding utf8
$page = $page.Replace("<head>", "<head>`n<base href=`"$frontend`">")
$page = [regex]::Replace($page, '\s*<meta http-equiv="Content-Security-Policy"[^>]*>', '')
$dispatch = [regex]::Match((Get-Content (Join-Path $root "ASCS.ahk") -Raw -Encoding utf8), '(?ms)^HandleWebMessage\(.*?^}')
if (-not $dispatch.Success) { throw "The message dispatch wasn't found in ASCS.ahk." }
$allowed = [regex]::Matches($dispatch.Value, '(?m)^\s*case (.+):\s*$') | ForEach-Object {
    [regex]::Matches($_.Groups[1].Value, '"([A-Za-z]+)"') | ForEach-Object { $_.Groups[1].Value }
}
$allowlist = Join-Path $work "smoke-allowlist.js"
# What ASCS accepts as a quick action, so the test can hold every item the picker offers to it.
$quickPattern = [regex]::Match((Get-Content "$root\lib\ASCS.Core.ahk" -Raw), '(?s)ValidateQuickActionId\(id\).*?RegExMatch\(id, "([^"]+)"\)').Groups[1].Value
if (-not $quickPattern) { throw "The quick action rule was not found." }
Set-Content $allowlist ("window.SMOKE_ALLOWLIST = " + (ConvertTo-Json @($allowed | Sort-Object -Unique) -Compress) + ";`nwindow.SMOKE_QUICK_PATTERN = " + (ConvertTo-Json $quickPattern) + ";") -Encoding utf8
$inject = "  <script src=`"file:///$($allowlist.Replace('\', '/'))`"></script>`n  <script src=`"file:///$($root.Replace('\', '/'))/tests/smoke.js`"></script>`n"
$first = $page.IndexOf("  <script src=")
if ($first -lt 0) { throw "No scripts found in index.html." }
$page = $page.Insert($first, $inject)
$smokePage = Join-Path $work "smoke.html"
Set-Content $smokePage $page -Encoding utf8
$dom = Join-Path $work "smoke.out.html"
$url = "file:///" + $smokePage.Replace('\', '/')
# Virtual time, so the budget costs no real time. 2.2.0's checks wait for
# things that move (counting, sliding), which outran 6 s.
$process = Start-Process $edge -ArgumentList "--headless=new", "--disable-gpu", "--allow-file-access-from-files", "--user-data-dir=`"$work\edge`"", "--window-size=1600,1000",
    "--virtual-time-budget=12000", "--dump-dom", $url -RedirectStandardOutput $dom -RedirectStandardError (Join-Path $work "smoke.err") -PassThru -NoNewWindow
if (-not $process.WaitForExit(60000)) { $process.Kill(); throw "Edge timed out on the smoke test." }
$html = Get-Content $dom -Raw -Encoding utf8
$match = [regex]::Match($html, '<pre id="results">([\s\S]*?)</pre>')
$text = if ($match.Success) { [Net.WebUtility]::HtmlDecode($match.Groups[1].Value) } else { "" }
if (-not (Show-Result "smoke" $text)) { $failed = $true }

# --- The Maestro command line, against throwaway repositories
$text = (& pwsh -NoProfile -File (Join-Path $PSScriptRoot "cli.tests.ps1") 2>&1 | ForEach-Object { "$_" }) -join "`n"
if (-not (Show-Result "cli" $text)) { $failed = $true }

if ($failed) { exit 1 }
Write-Host "All tests passed." -ForegroundColor Green
