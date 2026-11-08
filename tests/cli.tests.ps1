<#
    Tests the ASCS command line (tools\cli) against throwaway repositories in the
    temp folder, with stand-in ASCS.ahk scripts that only answer the exit message.
    It never touches the real repo, the running ASCS, or the data folder.
    Prints "PASS n FAIL m", then each failure. Usage: pwsh -File tests\cli.tests.ps1
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$cli = Join-Path (Split-Path $PSScriptRoot -Parent) 'tools\cli\ASCS-Cli.ps1'
$ahk = Join-Path $env:ProgramFiles 'AutoHotkey\v2\AutoHotkey64.exe'
$scratch = Join-Path ([IO.Path]::GetTempPath()) "ascs-cli-tests-$PID"
[IO.Directory]::CreateDirectory($scratch) | Out-Null
$passed = 0
$failures = [Collections.Generic.List[string]]::new()
$env:ASCS_BACKUPS = Join-Path $scratch 'backups'

function Add-Check([string]$name, [bool]$ok, [string]$detail = '') {
    if ($ok) { $script:passed++ } else { $failures.Add("${name}: $detail") }
}
function Invoke-QuietGit { & git @args 2>&1 | Out-Null; if ($LASTEXITCODE -ne 0) { throw "git $args" } }
function New-TestRepo([string]$name) {
    $base = Join-Path $scratch "$name-$(Get-Random)"
    $origin = "$base\origin.git"; $work = "$base\work"
    [IO.Directory]::CreateDirectory($base) | Out-Null
    Invoke-QuietGit init --bare -b master $origin
    Invoke-QuietGit clone $origin $work
    Invoke-QuietGit -C $work config user.email test@example.invalid
    Invoke-QuietGit -C $work config user.name Test
    Invoke-QuietGit -C $work switch -c master
    Set-Content "$work\a.txt" one
    Set-Content "$work\.gitignore" '/data/*'
    Invoke-QuietGit -C $work add -A; Invoke-QuietGit -C $work commit -m first
    Invoke-QuietGit -C $work push -u origin master
    return @{ base = $base; origin = $origin; work = $work }
}
function New-TestBranch($repo, [string]$branch, [string]$file = 'b.txt') {
    Invoke-QuietGit -C $repo.work switch -c $branch
    Set-Content "$($repo.work)\$file" two; Invoke-QuietGit -C $repo.work add -A; Invoke-QuietGit -C $repo.work commit -m "on $branch"
}
function Invoke-Cli($repo, [string[]]$arguments, [string]$stdin = '', [string]$from = '') {
    if ((Resolve-Path $repo.work).Path -ieq 'C:\ASCS') { throw 'These tests must never run against the real repo.' }
    $env:ASCS_REPO = $repo.work
    $place = if ($from) { $from } else { $scratch }
    Push-Location $place
    try {
        $output = if ($stdin) { $stdin | & pwsh -NoProfile -File $cli @arguments 2>&1 } else { & pwsh -NoProfile -File $cli @arguments 2>&1 }
        $code = $LASTEXITCODE
    } finally { Pop-Location }
    return @{ code = $code; text = ($output | ForEach-Object { "$_" }) -join "`n" }
}
function Get-Rev($repo, [string]$ref) { (& git -C $repo.work rev-parse $ref).Trim() }
function Get-OriginRev($repo, [string]$ref) { $v = & git -C $repo.origin rev-parse --verify --quiet $ref; $global:LASTEXITCODE = 0; if ($v) { $v.Trim() } else { '' } }

# ---- cut-release: the whole path
$r = New-TestRepo ok; New-TestBranch $r feat/v1
$tip = Get-Rev $r feat/v1
$run = Invoke-Cli $r @('cut-release', '--yes')
Add-Check 'cut-release: exit 0' ($run.code -eq 0) $run.text
Add-Check 'cut-release: branch pushed' ((Get-OriginRev $r feat/v1) -eq $tip)
Add-Check 'cut-release: origin master moved' ((Get-OriginRev $r master) -eq $tip)
Add-Check 'cut-release: local master moved' ((Get-Rev $r master) -eq $tip)
Add-Check 'cut-release: ends on master' ((& git -C $r.work branch --show-current) -eq 'master')
Add-Check 'cut-release: no merge commit' ((& git -C $r.work rev-list --count master) -eq '2')
$again = Invoke-Cli $r @('cut-release', '--yes')
Add-Check 'run again: nothing to cut' ($again.code -ne 0 -and $again.text -match 'Nothing to cut') $again.text

# Picks the newest branch, wherever you're standing.
$r = New-TestRepo newest; New-TestBranch $r feat/old
Invoke-QuietGit -C $r.work switch master
Start-Sleep -Seconds 2
New-TestBranch $r feat/new 'c.txt'
Invoke-QuietGit -C $r.work switch master
$tip = Get-Rev $r feat/new
$run = Invoke-Cli $r @('cut-release', '--yes')
Add-Check 'newest: picked from master' ($run.code -eq 0 -and (Get-OriginRev $r master) -eq $tip) $run.text
Add-Check 'newest: older branch untouched' ((Get-OriginRev $r feat/old) -eq '')

# Naming a branch.
$r = New-TestRepo named; New-TestBranch $r feat/a; Invoke-QuietGit -C $r.work switch master
$tip = Get-Rev $r feat/a
Start-Sleep -Seconds 2
New-TestBranch $r feat/b 'c.txt'; Invoke-QuietGit -C $r.work switch master
$run = Invoke-Cli $r @('cut-release', 'feat/a', '--yes')
Add-Check 'named: that branch' ($run.code -eq 0 -and (Get-OriginRev $r master) -eq $tip) $run.text
$run = Invoke-Cli $r @('cut-release', 'feat/none', '--yes')
Add-Check 'named: missing branch refused' ($run.code -ne 0 -and $run.text -match 'no local branch') $run.text
$run = Invoke-Cli $r @('cut-release', 'master', '--yes')
Add-Check 'named: master itself refused' ($run.code -ne 0) $run.text

# Refusals change nothing.
$r = New-TestRepo dirty; New-TestBranch $r feat/x
$before = Get-OriginRev $r master
Set-Content "$($r.work)\a.txt" changed
$run = Invoke-Cli $r @('cut-release', '--yes')
Add-Check 'dirty: a changed file refused' ($run.code -ne 0 -and $run.text -match 'Uncommitted' -and (Get-OriginRev $r feat/x) -eq '') $run.text
Invoke-QuietGit -C $r.work checkout -- a.txt
Set-Content "$($r.work)\new.txt" new
$run = Invoke-Cli $r @('cut-release', '--yes')
Add-Check 'dirty: a new file refused' ($run.code -ne 0 -and $run.text -match 'new.txt' -and (Get-OriginRev $r master) -eq $before) $run.text

$r = New-TestRepo diverged; New-TestBranch $r feat/x; Invoke-QuietGit -C $r.work switch master
Set-Content "$($r.work)\m.txt" m; Invoke-QuietGit -C $r.work add -A; Invoke-QuietGit -C $r.work commit -m 'on master'
$beforeMaster = Get-Rev $r master
Invoke-QuietGit -C $r.work switch feat/x
Start-Sleep -Seconds 1
Set-Content "$($r.work)\b2.txt" newer; Invoke-QuietGit -C $r.work add -A; Invoke-QuietGit -C $r.work commit -m 'newer'
$run = Invoke-Cli $r @('cut-release', '--yes')
Add-Check 'diverged: refused' ($run.code -ne 0 -and $run.text -match "wouldn't be a fast-forward" -and (Get-Rev $r master) -eq $beforeMaster -and (Get-OriginRev $r feat/x) -eq '') $run.text
Add-Check 'diverged: stays on its branch' ((& git -C $r.work branch --show-current) -eq 'feat/x')

$r = New-TestRepo behind; New-TestBranch $r feat/x
$other = "$($r.base)\other"; Invoke-QuietGit clone $r.origin $other
Invoke-QuietGit -C $other config user.email t@example.invalid; Invoke-QuietGit -C $other config user.name T
Set-Content "$other\z.txt" z; Invoke-QuietGit -C $other add -A; Invoke-QuietGit -C $other commit -m 'elsewhere'; Invoke-QuietGit -C $other push origin master
$run = Invoke-Cli $r @('cut-release', '--yes')
Add-Check 'remote ahead: refused' ($run.code -ne 0 -and $run.text -match 'Pull first' -and (Get-OriginRev $r feat/x) -eq '') $run.text

# A release not yet marked complete.
$r = New-TestRepo inprogress
Invoke-QuietGit -C $r.work switch -c feat/x
Set-Content "$($r.work)\CHANGELOG.md" "# Log`n`n## Version 2 (in progress)`n`n## Version 1"
Invoke-QuietGit -C $r.work add -A; Invoke-QuietGit -C $r.work commit -m 'x'
$run = Invoke-Cli $r @('cut-release', '--yes')
Add-Check 'in progress: refused' ($run.code -ne 0 -and $run.text -match 'Mark the release complete' -and (Get-OriginRev $r feat/x) -eq '') $run.text
Set-Content "$($r.work)\CHANGELOG.md" "# Log`n`n## Version 2`n`n## Version 1 (in progress)"
Invoke-QuietGit -C $r.work add -A; Invoke-QuietGit -C $r.work commit -m 'y'
$run = Invoke-Cli $r @('cut-release', '--yes')
Add-Check 'marked complete: goes, and only the newest heading counts' ($run.code -eq 0) $run.text

# A branch checked out in a second folder.
$r = New-TestRepo tree
$dev = "$($r.base)\dev"
Invoke-QuietGit -C $r.work worktree add $dev -b feat/two
Set-Content "$dev\two.txt" two
$run = Invoke-Cli $r @('cut-release', 'feat/two', '--yes')
Add-Check 'second folder: nothing committed yet is nothing to cut, or refused' ($run.code -ne 0) $run.text
Invoke-QuietGit -C $dev add -A; Invoke-QuietGit -C $dev commit -m 'two'
Set-Content "$dev\more.txt" more
$before = Get-OriginRev $r master
$run = Invoke-Cli $r @('cut-release', '--yes')
Add-Check 'second folder: uncommitted work there refused' ($run.code -ne 0 -and $run.text -match 'more.txt' -and (Get-OriginRev $r master) -eq $before) $run.text
[IO.File]::Delete("$dev\more.txt")
$tip = (& git -C $dev rev-parse HEAD).Trim()
$run = Invoke-Cli $r @('cut-release', '--yes')
Add-Check 'second folder: cuts its branch' ($run.code -eq 0 -and (Get-OriginRev $r master) -eq $tip -and (Get-Rev $r master) -eq $tip) $run.text
Add-Check 'second folder: stays on its branch' ((& git -C $dev branch --show-current) -eq 'feat/two')

# Asking, and looking.
$r = New-TestRepo ask; New-TestBranch $r feat/x
$before = Get-OriginRev $r master
$run = Invoke-Cli $r @('cut-release') 'n'
Add-Check 'prompt: no stops' ($run.code -eq 0 -and $run.text -match 'Nothing was changed' -and (Get-OriginRev $r feat/x) -eq '' -and (Get-OriginRev $r master) -eq $before) $run.text
$run = Invoke-Cli $r @('cut-release') 'y'
Add-Check 'prompt: yes goes' ($run.code -eq 0 -and (Get-OriginRev $r master) -eq (Get-Rev $r feat/x)) $run.text
$r = New-TestRepo dry; New-TestBranch $r feat/x
$before = Get-OriginRev $r master
$run = Invoke-Cli $r @('cut-release', '--dry-run')
Add-Check 'dry run: shows the branch, changes nothing' ($run.code -eq 0 -and $run.text -match 'feat/x' -and (Get-OriginRev $r feat/x) -eq '' -and (Get-OriginRev $r master) -eq $before -and (& git -C $r.work branch --show-current) -eq 'feat/x') $run.text

# A failure partway: a remote that refuses master.
$r = New-TestRepo reject; New-TestBranch $r feat/x
$hook = "$($r.origin)\hooks\pre-receive"
Set-Content $hook "#!/bin/sh`nwhile read o n ref; do [ `"`$ref`" = refs/heads/master ] && exit 1; done; exit 0" -NoNewline
$run = Invoke-Cli $r @('cut-release', '--yes')
Add-Check 'failed push: reports it' ($run.code -ne 0 -and $run.text -match 'git push origin master failed') $run.text
[IO.File]::Delete($hook)
$run = Invoke-Cli $r @('cut-release', '--yes')
Add-Check 'failed push: the rerun says how to finish' ($run.code -ne 0 -and $run.text -match 'unpushed') $run.text

# The command itself.
$r = New-TestRepo misc
$run = Invoke-Cli $r @('help'); Add-Check 'help' ($run.code -eq 0 -and $run.text -match 'cut-release' -and $run.text -match 'try --end') $run.text
$run = Invoke-Cli $r @(); Add-Check 'no command shows help' ($run.code -eq 0 -and $run.text -match 'cut-release') $run.text
$run = Invoke-Cli $r @('nope'); Add-Check 'unknown command' ($run.code -ne 0 -and $run.text -match 'Unknown command') $run.text
$run = Invoke-Cli $r @('cut-release', '--force'); Add-Check 'unknown option' ($run.code -ne 0) $run.text

# ---- check --quick
$fake = '#Requires AutoHotkey v2.0 64-bit' + "`r`n" + '#SingleInstance Force' + "`r`n" + 'x := 1' + "`r`n"
$r = New-TestRepo checks
[IO.File]::WriteAllText("$($r.work)\ASCS.ahk", $fake)
$run = Invoke-Cli $r @('check', '--quick')
Add-Check 'check: a clean checkout passes' ($run.code -eq 0 -and $run.text -match 'All good') $run.text
Add-Check 'check: leaves no parse copy behind' (-not (Test-Path "$($r.work)\_syntaxcheck.ahk"))
[IO.File]::WriteAllText("$($r.work)\ASCS.ahk", $fake + 'if (' + "`r`n")
$run = Invoke-Cli $r @('check', '--quick')
Add-Check 'check: a syntax error fails' ($run.code -ne 0 -and $run.text -match 'Parse:\s+FAILED') $run.text
Add-Check 'check: and still leaves no copy' (-not (Test-Path "$($r.work)\_syntaxcheck.ahk"))
[IO.File]::WriteAllText("$($r.work)\ASCS.ahk", $fake)
[IO.File]::WriteAllText("$($r.work)\hidden.js", 'a' + [char]0x200B + 'b')
$run = Invoke-Cli $r @('check', '--quick')
Add-Check 'check: a zero-width character is found' ($run.code -ne 0 -and $run.text -match 'hidden\.js') $run.text
[IO.File]::Delete("$($r.work)\hidden.js")
[IO.File]::WriteAllBytes("$($r.work)\bom.md", [byte[]](0xEF, 0xBB, 0xBF, 0x61))
$run = Invoke-Cli $r @('check', '--quick')
Add-Check 'check: a byte order mark is found' ($run.code -ne 0 -and $run.text -match 'bom\.md') $run.text
[IO.File]::Delete("$($r.work)\bom.md")
Invoke-QuietGit -C $r.work add -A; Invoke-QuietGit -C $r.work commit -m 'ahk'
$here = "$($r.base)\dev"
Invoke-QuietGit -C $r.work worktree add $here -b feat/two
[IO.File]::WriteAllText("$here\ASCS.ahk", $fake + 'if (' + "`r`n")
$run = Invoke-Cli $r @('check', '--quick') '' $here
Add-Check 'check: uses the checkout you stand in' ($run.code -ne 0 -and $run.text -match [regex]::Escape($here)) $run.text
$run = Invoke-Cli $r @('check', '--quick')
Add-Check 'check: elsewhere it uses the main one' ($run.code -eq 0) $run.text

# ---- backup-data
$r = New-TestRepo backup
[IO.Directory]::CreateDirectory("$($r.work)\data\WebView2\Default\Code Cache") | Out-Null
[IO.Directory]::CreateDirectory("$($r.work)\data\WebView2\Default\Local Storage") | Out-Null
Set-Content "$($r.work)\data\notes.json" '{}'
Set-Content "$($r.work)\data\WebView2\Default\Code Cache\junk" 'x'
Set-Content "$($r.work)\data\WebView2\Default\Local Storage\prefs" 'keep'
$run = Invoke-Cli $r @('backup-data')
$made = @(Get-ChildItem $env:ASCS_BACKUPS -Directory)
Add-Check 'backup: makes a dated copy' ($run.code -eq 0 -and $made.Count -eq 1 -and $made[0].Name -match '^data-\d{8}-\d{6}$' -and (Test-Path "$($made[0].FullName)\notes.json")) $run.text
Add-Check 'backup: keeps local storage and skips caches' ((Test-Path "$($made[0].FullName)\WebView2\Default\Local Storage\prefs") -and -not (Test-Path "$($made[0].FullName)\WebView2\Default\Code Cache"))
Add-Check 'backup: warns about the secrets file' ($run.text -match 'secrets') $run.text
1..11 | ForEach-Object { [IO.Directory]::CreateDirectory("$env:ASCS_BACKUPS\data-2020010$($_ % 10)-00000$($_ % 10)") | Out-Null }
[IO.Directory]::CreateDirectory("$env:ASCS_BACKUPS\keep-me") | Out-Null
$run = Invoke-Cli $r @('backup-data')
Add-Check 'backup: keeps the newest ten' (@(Get-ChildItem $env:ASCS_BACKUPS -Directory -Filter 'data-*').Count -eq 10) $run.text
Add-Check 'backup: leaves other folders alone' (Test-Path "$env:ASCS_BACKUPS\keep-me")

# ---- try and status, with stand-ins for ASCS.ahk
$standIn = @'
#Requires AutoHotkey v2.0 64-bit
#SingleInstance Force
#NoTrayIcon
Persistent()
OnError((*) => ExitApp(9))
OnMessage(DllCall("RegisterWindowMessage", "Str", "Aeolionware.ASCS.Exit", "UInt"), (*) => (SetTimer(() => ExitApp(), -1), 1))
'@
$stubborn = "#Requires AutoHotkey v2.0 64-bit`r`n#SingleInstance Force`r`n#NoTrayIcon`r`nPersistent()`r`n"

function Get-StandIns([string]$folder) {
    @(Get-CimInstance Win32_Process -Filter "Name='AutoHotkey64.exe'" | Where-Object { $_.CommandLine -like "*`"$folder\ASCS.ahk`"*" })
}
function Start-StandIn([string]$folder) {
    Start-Process $ahk -ArgumentList "`"$folder\ASCS.ahk`"" -WorkingDirectory $folder | Out-Null
    Wait-Until { (Get-StandIns $folder).Count -eq 1 } | Out-Null
}
function Wait-Until([scriptblock]$condition) {
    for ($i = 0; $i -lt 40; $i++) { if (& $condition) { return $true }; Start-Sleep -Milliseconds 250 }
    return $false
}

try {
    $r = New-TestRepo trying
    $main = $r.work
    $dev = "$($r.base)\dev"
    [IO.File]::WriteAllText("$main\ASCS.ahk", $standIn)
    [IO.File]::WriteAllText("$main\CHANGELOG.md", "# Log`r`n`r`n## Version 1`r`n")
    Invoke-QuietGit -C $main add -A; Invoke-QuietGit -C $main commit -m 'stand-in'
    $run = Invoke-Cli $r @('try')
    Add-Check 'try: no second checkout says how to make one' ($run.code -ne 0 -and $run.text -match 'git worktree add') $run.text

    Invoke-QuietGit -C $main worktree add $dev -b feat/two
    [IO.Directory]::CreateDirectory("$main\data\radicale\collections") | Out-Null
    [IO.Directory]::CreateDirectory("$main\data\WebView2\Default\Code Cache") | Out-Null
    $notes = '{"notes":["real"]}'
    [IO.File]::WriteAllText("$main\data\notes.json", $notes)
    [IO.File]::WriteAllText("$main\data\secrets.ini", 'secret')
    [IO.File]::WriteAllText("$main\data\WebView2\Default\Code Cache\junk", 'x')
    $config = "[auth]`r`nhtpasswd_filename = $main\data\radicale\users`r`n[storage]`r`nfilesystem_folder = $($main.ToLower())\data\radicale\collections`r`n"
    [IO.File]::WriteAllText("$main\data\radicale\config", $config)

    # Refusals, before anything closes.
    [IO.Directory]::CreateDirectory("$dev\data") | Out-Null
    [IO.File]::WriteAllText("$dev\data\mine.txt", 'not made by try')
    Start-StandIn $main
    $run = Invoke-Cli $r @('try')
    Add-Check "try: won't touch a data folder it didn't make" ($run.code -ne 0 -and $run.text -match 'left alone' -and (Test-Path "$dev\data\mine.txt")) $run.text
    Add-Check 'try: and the real ASCS keeps running' ((Get-StandIns $main).Count -eq 1)
    [IO.Directory]::Delete("$dev\data", $true)

    # The way in.
    $run = Invoke-Cli $r @('try')
    Add-Check 'try: runs' ($run.code -eq 0) $run.text
    Add-Check 'try: says what stays real' ($run.text -match 'Still real') $run.text
    Add-Check 'try: the real ASCS closed' (Wait-Until { (Get-StandIns $main).Count -eq 0 })
    Add-Check 'try: the test build started' (Wait-Until { (Get-StandIns $dev).Count -eq 1 })
    Add-Check 'try: the data was copied' ((Test-Path "$dev\data\notes.json") -and [IO.File]::ReadAllText("$dev\data\notes.json") -eq $notes)
    Add-Check 'try: the copy is marked' (Test-Path "$dev\data\test-build.txt")
    Add-Check 'try: the real data is not marked' (-not (Test-Path "$main\data\test-build.txt"))
    Add-Check 'try: caches are skipped' (-not (Test-Path "$dev\data\WebView2\Default\Code Cache"))
    $copied = [IO.File]::ReadAllText("$dev\data\radicale\config")
    Add-Check "try: the copy's calendar points at the copy" ($copied.IndexOf("$main\data", [StringComparison]::OrdinalIgnoreCase) -lt 0 -and $copied -match [regex]::Escape("$dev\data\radicale\users") -and $copied -match [regex]::Escape("$dev\data\radicale\collections")) $copied
    Add-Check "try: the real calendar config is untouched" ([IO.File]::ReadAllText("$main\data\radicale\config") -ceq $config)
    $run = Invoke-Cli $r @('try')
    Add-Check 'try: refuses to start twice' ($run.code -ne 0 -and $run.text -match 'already trying') $run.text
    $run = Invoke-Cli $r @('status')
    Add-Check 'status: names the test build' ($run.code -eq 0 -and $run.text -match 'test build' -and $run.text -match [regex]::Escape($dev)) $run.text

    # The way back, with changes made in the copy.
    [IO.File]::WriteAllText("$dev\data\notes.json", '{"notes":["test"]}')
    $run = Invoke-Cli $r @('try', '--end')
    Add-Check 'end: runs' ($run.code -eq 0) $run.text
    Add-Check 'end: the test build closed' (Wait-Until { (Get-StandIns $dev).Count -eq 0 })
    Add-Check 'end: the real ASCS started' (Wait-Until { (Get-StandIns $main).Count -eq 1 })
    Add-Check 'end: the copy and its secrets are gone' (-not (Test-Path "$dev\data"))
    Add-Check "end: the real notes didn't change" ([IO.File]::ReadAllText("$main\data\notes.json") -eq $notes)
    Add-Check 'end: the real secrets are still there' (Test-Path "$main\data\secrets.ini")

    # Status on the real one.
    $run = Invoke-Cli $r @('status')
    Add-Check 'status: names the real ASCS' ($run.text -match 'your real ASCS') $run.text
    Add-Check 'status: up to date' ($run.text -match 'up to date') $run.text
    Add-Check 'status: the changelog' ($run.text -match 'Changelog: Version 1') $run.text
    Start-Sleep -Seconds 2
    [IO.File]::WriteAllText("$main\ASCS.ahk", $standIn + "`r`n")
    $run = Invoke-Cli $r @('status')
    Add-Check 'status: older code is flagged' ($run.text -match 'OLDER') $run.text
    [IO.File]::WriteAllText("$main\data\ASCS_Log.txt", "2020-01-01 10:00:00 | Page error: old`r`n2020-01-01 10:00:01 | ASCS 1 initialized.`r`n2020-01-01 10:00:02 | Page error: new one`r`n")
    $run = Invoke-Cli $r @('status')
    Add-Check 'status: counts only errors since the last start' ($run.text -match '1 problem' -and $run.text -match 'new one' -and $run.text -notmatch 'error: old') $run.text
    Invoke-QuietGit -C $main checkout -- ASCS.ahk
    [IO.File]::WriteAllText("$main\README.md", "**Version:** 1.0.0`r`n")
    [IO.File]::WriteAllText("$main\ASCS.ahk", $standIn + "`r`n; Version 1.0.1`r`n")
    $run = Invoke-Cli $r @('status')
    Add-Check 'status: a version that disagrees is flagged' ($run.text -match 'DISAGREES') $run.text
    Invoke-QuietGit -C $main checkout -- ASCS.ahk
    [IO.File]::Delete("$main\README.md")

    # An ASCS that won't close: nothing else happens.
    (Get-StandIns $main) | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    Wait-Until { (Get-StandIns $main).Count -eq 0 } | Out-Null
    [IO.File]::WriteAllText("$main\ASCS.ahk", $stubborn)
    Start-StandIn $main
    $run = Invoke-Cli $r @('try')
    Add-Check "try: an ASCS that won't close stops it" ($run.code -ne 0 -and $run.text -match 'did not close') $run.text
    Add-Check 'try: and nothing was copied or started' (-not (Test-Path "$dev\data") -and (Get-StandIns $dev).Count -eq 0)
} finally {
    Remove-Item Env:\ASCS_REPO -ErrorAction SilentlyContinue
    # Only stand-ins under this run's temp folder.
    Get-CimInstance Win32_Process -Filter "Name='AutoHotkey64.exe'" | Where-Object { $_.CommandLine -like "*$scratch*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 300
    try { [IO.Directory]::Delete($scratch, $true) } catch { }
    Remove-Item Env:\ASCS_BACKUPS -ErrorAction SilentlyContinue
}

"PASS $passed FAIL $($failures.Count)"
$failures
