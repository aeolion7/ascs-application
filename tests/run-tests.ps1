<#
    Runs the ASCS unit tests:
      * tests\core.tests.ahk     — lib\ASCS.Core.ahk (validators, workspace matching, search, activity)
      * tests\frontend.tests.html — the frontend modules' pure logic, in headless Edge
      * tests\smoke.js (1.9.0)     — the real page, every module and stylesheet, with a stand-in
                                   for WebView2: every view opens without script errors, and
                                   every message it sends is in ASCS.ahk's allowlist
    None of them touches the running ASCS instance or the data folder.
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
Set-Content $allowlist ("window.SMOKE_ALLOWLIST = " + (ConvertTo-Json @($allowed | Sort-Object -Unique) -Compress) + ";") -Encoding utf8
$inject = "  <script src=`"file:///$($allowlist.Replace('\', '/'))`"></script>`n  <script src=`"file:///$($root.Replace('\', '/'))/tests/smoke.js`"></script>`n"
$first = $page.IndexOf("  <script src=")
if ($first -lt 0) { throw "No scripts found in index.html." }
$page = $page.Insert($first, $inject)
$smokePage = Join-Path $work "smoke.html"
Set-Content $smokePage $page -Encoding utf8
$dom = Join-Path $work "smoke.out.html"
$url = "file:///" + $smokePage.Replace('\', '/')
$process = Start-Process $edge -ArgumentList "--headless=new", "--disable-gpu", "--allow-file-access-from-files", "--user-data-dir=`"$work\edge`"", "--window-size=1600,1000",
    "--virtual-time-budget=6000", "--dump-dom", $url -RedirectStandardOutput $dom -RedirectStandardError (Join-Path $work "smoke.err") -PassThru -NoNewWindow
if (-not $process.WaitForExit(60000)) { $process.Kill(); throw "Edge timed out on the smoke test." }
$html = Get-Content $dom -Raw -Encoding utf8
$match = [regex]::Match($html, '<pre id="results">([\s\S]*?)</pre>')
$text = if ($match.Success) { [Net.WebUtility]::HtmlDecode($match.Groups[1].Value) } else { "" }
if (-not (Show-Result "smoke" $text)) { $failed = $true }

if ($failed) { exit 1 }
Write-Host "All tests passed." -ForegroundColor Green
