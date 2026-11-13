# The Maestro command line, run through C:\Scripts\maestro.cmd: maestro <command> [options]
# To add a command: write a function, then add it to $Commands below.
# Keep this file ASCII. Only `try` starts or closes Maestro, and nothing here commits.
# `isolate --run` starts only a copy made by `isolate`, which can't act outside itself.
# Only `restore-data` changes the data folder, and only with Maestro closed.
# `new-release` and `bump` change files in a second checkout, never the main
# folder; `clean` removes a second checkout once its branch is merged and pushed.
[CmdletBinding()]
param(
    [Parameter(Position = 0)][string]$Command = 'help',
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest = @()
)
$ErrorActionPreference = 'Stop'

function Stop-WithError([string]$message) {
    [Console]::Error.WriteLine("maestro: $message")
    exit 1
}

# The main folder is wherever git keeps this repository, so this file works from
# the main folder and from a version's checkout, whatever the folders are called.
function Get-MainFolder {
    $common = "$(& git -C $PSScriptRoot rev-parse --git-common-dir 2>$null)".Trim()
    if ($LASTEXITCODE -ne 0 -or -not $common) { $global:LASTEXITCODE = 0; return '' }
    if (-not [IO.Path]::IsPathRooted($common)) { $common = Join-Path $PSScriptRoot $common }
    return Split-Path ([IO.Path]::GetFullPath($common)) -Parent
}

$Repo = if ($env:ASCS_REPO) { $env:ASCS_REPO } else { Get-MainFolder }
if (-not $Repo) { Stop-WithError "This file isn't in a git checkout of Maestro, so it can't tell where Maestro is." }
$Repo = [IO.Path]::GetFullPath($Repo).TrimEnd('\')
$Main = 'master'
$AhkExe = Join-Path $env:ProgramFiles 'AutoHotkey\v2\AutoHotkey64.exe'
$StatusFile = 'backup-status.ini'
$TestMarker = 'test-build.txt'
# Rebuilt by WebView2, so never worth copying.
$CacheFolders = @('Cache', 'Code Cache', 'GPUCache', 'DawnWebGPUCache', 'DawnGraphiteCache', 'GrShaderCache', 'ShaderCache', 'component_crx_cache')
# Every place the version is written. Each pattern matches the number alone, so
# `status` reads these and `bump` writes them.
$VersionSpots = @(
    @{ Name = 'ASCS.ahk header'; File = 'ASCS.ahk'; Pattern = '(?m)(?<=^; Version )[\d.]+' }
    @{ Name = 'ASCS_Version'; File = 'ASCS.ahk'; Pattern = '(?<=ASCS_Version := ")[\d.]+(?=")' }
    @{ Name = 'sidebar'; File = 'frontend\index.html'; Pattern = '(?<=Maestro <span>)[\d.]+(?=</span>)' }
    @{ Name = 'README'; File = 'README.md'; Pattern = '(?<=\*\*Version:\*\* )[\d.]+' }
    @{ Name = 'calendar'; File = 'frontend\calendar.js'; Pattern = '(?<=//ASCS )[\d.]+(?=//EN)' }
)

# Runs git in the repo; stops on failure and returns its output. Not named Git:
# names ignore case, so it would call itself instead of the program.
function Invoke-Git {
    $output = & git -C $Repo @args 2>&1
    if ($LASTEXITCODE -ne 0) { Stop-WithError "git $($args -join ' ') failed:`n$($output -join "`n")" }
    return $output | ForEach-Object { "$_" }
}

function Measure-Commits([string]$range) {
    return [int](Invoke-Git rev-list --count $range)
}

function Test-SamePath([string]$a, [string]$b) {
    return [IO.Path]::GetFullPath($a).TrimEnd('\') -ieq [IO.Path]::GetFullPath($b).TrimEnd('\')
}

# Every checkout of this repo: this folder, and any second one from git worktree.
function Get-Checkouts {
    $found = @()
    $path = ''
    foreach ($line in (Invoke-Git worktree list --porcelain)) {
        if ($line -like 'worktree *') {
            $path = [IO.Path]::GetFullPath($line.Substring(9)).TrimEnd('\')
            $found += [pscustomobject]@{ Path = $path; Branch = '' }
        } elseif ($line -like 'branch refs/heads/*') {
            $found[-1].Branch = $line.Substring(18)
        }
    }
    return $found
}

# The checkout you're standing in, or the main one. The deepest match wins: a
# version's checkout sits inside the main folder.
function Get-HereCheckout {
    $here = (Get-Location).ProviderPath.TrimEnd('\')
    foreach ($checkout in (Get-Checkouts | Sort-Object { $_.Path.Length } -Descending)) {
        if ($here -ieq $checkout.Path -or $here.StartsWith("$($checkout.Path)\", [StringComparison]::OrdinalIgnoreCase)) { return $checkout.Path }
    }
    return $Repo
}

# The running copies of this repo's ASCS.ahk. Another folder's never counts.
function Get-RunningBuilds {
    $folders = @((Get-Checkouts).Path)
    $builds = @()
    foreach ($process in (Get-CimInstance Win32_Process -Filter "Name='AutoHotkey64.exe'")) {
        if ($process.CommandLine -notmatch '"([^"]*\\ASCS\.ahk)"') { continue }
        $script = $Matches[1]
        $folder = Split-Path $script -Parent
        if ($folders -inotcontains [IO.Path]::GetFullPath($folder).TrimEnd('\')) { continue }
        $builds += [pscustomobject]@{ ProcessId = $process.ProcessId; Script = $script; Folder = $folder; Started = $process.CreationDate }
    }
    return $builds
}

function Close-Build($build) {
    $helper = Start-Process $AhkExe -ArgumentList @("`"$(Join-Path $PSScriptRoot 'maestro-exit.ahk')`"", "`"$($build.Script)`"") -PassThru -WindowStyle Hidden
    $null = $helper.Handle
    if (-not $helper.WaitForExit(10000)) { $helper.Kill(); return $false }
    if ($helper.ExitCode -ne 0) { return $false }
    for ($i = 0; $i -lt 60; $i++) {
        if (-not (Get-Process -Id $build.ProcessId -ErrorAction SilentlyContinue)) { return $true }
        Start-Sleep -Milliseconds 250
    }
    return $false
}

function Start-Build([string]$folder) {
    Start-Process $AhkExe -ArgumentList "`"$(Join-Path $folder 'ASCS.ahk')`"" -WorkingDirectory $folder | Out-Null
}

# Copies a data folder without WebView2's caches, its network state (cookies it
# keeps locked while Maestro runs, and nothing of yours) or the backup status
# file. Says whether every file copied (Ok) and, from robocopy's error lines,
# which didn't and why (Problems). -Mirror also removes what the copy lacks.
function Copy-DataFolder([string]$from, [string]$to, [switch]$Mirror) {
    $mode = if ($Mirror) { '/MIR' } else { '/E' }
    $arguments = @($from, $to, $mode, '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/XF', $StatusFile, '/XD') +
        $CacheFolders + @(Join-Path $from 'WebView2\EBWebView\Default\Network')
    $output = @(& robocopy @arguments)
    $code = $LASTEXITCODE
    $global:LASTEXITCODE = 0
    return [pscustomobject]@{ Ok = $code -lt 8; Problems = @(Get-CopyProblems $output $from $to) }
}

# robocopy's errors as "<what it did> <file>: <why>", once each however often
# it retried, with the two folders left off the paths so the file shows first.
function Get-CopyProblems([string[]]$output, [string]$from, [string]$to) {
    $problems = [Collections.Generic.List[string]]::new()
    for ($i = 0; $i -lt $output.Count; $i++) {
        if ($output[$i] -notmatch 'ERROR \d+ \(0x[0-9A-Fa-f]+\) (.+?)\s*$') { continue }
        $what = $Matches[1]
        foreach ($folder in @($from, $to)) { $what = $what -replace [regex]::Escape($folder.TrimEnd('\') + '\'), '' }
        $why = if ($i + 1 -lt $output.Count) { $output[$i + 1].Trim() } else { '' }
        $problem = if ($why) { "${what}: $why" } else { $what }
        if (-not $problems.Contains($problem)) { $problems.Add($problem) }
    }
    return $problems
}

# A failed copy's message: what it means, then the first file robocopy named
# and how many more. Maestro shows 200 characters of it, so the file comes early.
function Get-CopyFailure([string]$meaning, $copy) {
    if (-not $copy.Problems.Count) { return $meaning }
    $more = if ($copy.Problems.Count -gt 1) { " And $($copy.Problems.Count - 1) more." } else { '' }
    return "$meaning $($copy.Problems[0])$more"
}

# ---- cut-release

function Invoke-CutRelease([string[]]$options) {
    $yes = $false; $dryRun = $false; $named = ''
    foreach ($option in $options) {
        switch -Regex ($option) {
            '^(--yes|-y)$' { $yes = $true; break }
            '^(--dry-run|-n)$' { $dryRun = $true; break }
            '^-' { Stop-WithError "cut-release doesn't know $option. See: maestro help" }
            default { if ($named) { Stop-WithError 'Name one branch at most.' }; $named = $option }
        }
    }

    # Anything uncommitted, new files included, means the release isn't ready.
    $dirty = @(Invoke-Git status --porcelain)
    if ($dirty.Count) {
        Stop-WithError ("Uncommitted changes in ${Repo}. Run git add -A and commit the release first:`n" + ($dirty -join "`n"))
    }
    Write-Host 'Checking the remote...'
    Invoke-Git fetch origin | Out-Null

    # The branch: the one named, else the one with the newest commit.
    $branch = $named
    if (-not $branch) {
        $branch = @(Invoke-Git for-each-ref --sort=-committerdate '--format=%(refname:short)' refs/heads/) |
            Where-Object { $_ -ne $Main } | Select-Object -First 1
        if (-not $branch) { Stop-WithError "There's no branch but $Main." }
    } elseif ($branch -eq $Main) {
        Stop-WithError "Name the branch to merge into $Main, not $Main itself."
    } else {
        & git -C $Repo show-ref --verify --quiet "refs/heads/$branch"
        if ($LASTEXITCODE -ne 0) { Stop-WithError "There's no local branch called $branch." }
    }

    # The branch can be checked out in a second folder, with its own uncommitted work.
    $holder = Get-Checkouts | Where-Object { $_.Branch -eq $branch } | Select-Object -First 1
    if ($holder -and -not (Test-SamePath $holder.Path $Repo)) {
        $dirtyThere = @(& git -C $holder.Path status --porcelain)
        if ($dirtyThere.Count) {
            Stop-WithError ("Uncommitted changes in $($holder.Path). Run git add -A and commit the release there first:`n" + ($dirtyThere -join "`n"))
        }
    }

    # A release has to be marked complete before it's cut.
    $changelog = & git -C $Repo show "${branch}:CHANGELOG.md" 2>$null
    if ($LASTEXITCODE -eq 0) {
        $heading = @($changelog | Where-Object { $_ -match '^## ' })[0]
        if ($heading -match 'in progress') { Stop-WithError "CHANGELOG on $branch still says: $heading. Mark the release complete first." }
    }
    $global:LASTEXITCODE = 0

    # Only a plain fast-forward: never a merge commit, a rewrite or a force.
    $behind = Measure-Commits "$Main..origin/$Main"
    if ($behind) { Stop-WithError "origin/$Main has $behind commit(s) that local $Main lacks. Pull first, then look at it." }
    $unpushed = Measure-Commits "origin/$Main..$Main"
    $ahead = Measure-Commits "$Main..$branch"
    if (-not $ahead) {
        $hint = if ($unpushed) { " But $Main has $unpushed unpushed commit(s): git push origin $Main" } else { '' }
        Stop-WithError "Nothing to cut: $branch has no commits that $Main lacks.$hint"
    }
    $diverged = Measure-Commits "$branch..$Main"
    if ($diverged) { Stop-WithError "$Main has $diverged commit(s) that $branch lacks, so this wouldn't be a fast-forward. Nothing was changed." }

    Write-Host ''
    Write-Host "Branch:  $branch"
    Write-Host "Merges:  $ahead commit(s) into $Main"
    Invoke-Git log --oneline "$Main..$branch" | ForEach-Object { Write-Host "  $_" }
    Write-Host 'Steps:   push the branch, switch to master, fast-forward master, push master'
    Write-Host ''
    if ($dryRun) {
        Write-Host 'Dry run: nothing was changed.'
        return
    }
    if (-not $yes) {
        Write-Host -NoNewline 'Go ahead? [y/N] '
        $answer = [Console]::ReadLine()
        if ($answer -notmatch '^(y|yes)$') {
            Write-Host 'Stopped. Nothing was changed.'
            return
        }
    }

    Write-Host "Pushing $branch..."
    Invoke-Git push -u origin $branch | Out-Null
    Write-Host "Switching to $Main..."
    Invoke-Git switch $Main | Out-Null
    Write-Host "Merging $branch..."
    Invoke-Git merge --ff-only $branch | Out-Null
    Write-Host "Pushing $Main..."
    Invoke-Git push origin $Main | Out-Null
    Write-Host ''
    Write-Host "Done: $Main is at $(Invoke-Git log --oneline -1), and is pushed. You're on $Main."
}

# ---- check

# The AHK parse check: parses without running. The copy has to sit beside
# ASCS.ahk for its #Includes, and it's always deleted.
function Test-AhkParse([string]$folder) {
    # The two workers run as their own scripts, so ASCS.ahk's parse doesn't cover them.
    foreach ($script in 'ASCS.ahk', 'ASCS.DriveProbe.ahk', 'ASCS.HardwareProbe.ahk') {
        if (-not (Test-Path -LiteralPath (Join-Path $folder $script))) { continue }
        $problem = Test-AhkScriptParse $folder $script
        if ($problem) { return "${script}: $problem" }
    }
    return ''
}

function Test-AhkScriptParse([string]$folder, [string]$script) {
    $copy = Join-Path $folder '_syntaxcheck.ahk'
    $out = Join-Path ([IO.Path]::GetTempPath()) "ascs-parse-$PID"
    $text = [IO.File]::ReadAllText((Join-Path $folder $script))
    $text = $text -replace '#SingleInstance Force', '#SingleInstance Off'
    $text = [regex]::Replace($text, '(?m)^#Warn\b.*$', '')
    $text = "#Warn All, StdOut`r`n#Warn LocalSameAsGlobal, StdOut`r`n" + $text
    [IO.File]::WriteAllText($copy, $text, [Text.UTF8Encoding]::new($false))
    try {
        $process = Start-Process $AhkExe -ArgumentList @('/ErrorStdOut=UTF-8', "/iLib `"$out.lib`"", "`"$copy`"") -PassThru -Wait -RedirectStandardOutput "$out.txt" -RedirectStandardError "$out.err"
        if ($process.ExitCode -eq 0) { return '' }
        return ((Get-Content "$out.err", "$out.txt" -ErrorAction SilentlyContinue) | Select-Object -First 6) -join "`n"
    } finally {
        [IO.File]::Delete($copy)
        foreach ($end in 'txt', 'err', 'lib') { [IO.File]::Delete("$out.$end") }
    }
}

# Characters that can hide in text: zero-width marks, direction overrides, a
# byte order mark, control bytes. Vendored and binary files aren't ours to scan.
function Find-HiddenCharacters([string]$folder) {
    $marks = '[' + [char]0x200B + '-' + [char]0x200F + [char]0x202A + '-' + [char]0x202E + [char]0x2066 + '-' + [char]0x2069 + [char]0xFEFF + '\x00-\x08\x0B\x0C\x0E-\x1F]'
    $decoder = [Text.UTF8Encoding]::new($false)
    $hits = @()
    foreach ($file in (& git -C $folder ls-files -co --exclude-standard)) {
        if ($file -notmatch '\.(ahk|js|css|html|md|ps1|cmd|txt|json|ini)$' -or $file -like 'webview/*') { continue }
        $path = Join-Path $folder $file
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
        if ($decoder.GetString([IO.File]::ReadAllBytes($path)) -match $marks) { $hits += $file }
    }
    return $hits
}

# The runner's "suite PASS n FAIL m" lines as the README and CHANGELOG write
# them: core 771, timers 34, ...
function Get-CheckCounts([string[]]$lines) {
    $counts = foreach ($line in $lines) {
        if ($line -match '^(\w+)\s+PASS (\d+) FAIL \d+') { "$($Matches[1]) $($Matches[2])" }
    }
    return @($counts) -join ', '
}

# What marking a release complete asks of the docs. Returns what's still wrong.
function Test-Release([string]$folder, [string]$counts) {
    $spots = Get-VersionSpots $folder
    $values = @($spots.Values | Sort-Object -Unique)
    if ($values.Count -ne 1 -or $values[0] -notmatch '^\d+\.\d+\.\d+$') {
        return @("The version isn't the same everywhere: " + (($spots.GetEnumerator() | ForEach-Object { "$($_.Key) $($_.Value)" }) -join ', '))
    }
    $version = $values[0]
    $read = { param($file) $path = Join-Path $folder $file; if (Test-Path -LiteralPath $path) { [IO.File]::ReadAllText($path) } else { '' } }
    $readme = & $read 'README.md'
    $changelog = & $read 'CHANGELOG.md'
    $problems = @()

    $headings = [regex]::Matches($changelog, '(?m)^## .*$')
    $first = if ($headings.Count) { $headings[0].Value.Trim() } else { '(none)' }
    if ($first -ne "## Version $version") { $problems += "CHANGELOG's newest heading is `"$first`", not `"## Version $version`"." }
    $entry = ''
    if ($headings.Count) {
        $end = if ($headings.Count -gt 1) { $headings[1].Index } else { $changelog.Length }
        $entry = $changelog.Substring($headings[0].Index, $end - $headings[0].Index)
    }
    $status = [regex]::Match($readme, '(?m)^\*\*Status:\*\*.*$').Value
    if (-not $status.Contains($version)) { $problems += "The README Status line doesn't name $version." }

    if (-not $readme.Contains($counts)) { $problems += "The README doesn't have this run's counts: $counts" }
    if (-not $entry.Contains($counts)) { $problems += "The CHANGELOG's newest entry doesn't have this run's counts: $counts" }
    # The README also gives each suite's count where it describes the suite.
    foreach ($pair in ($counts -split ', ')) {
        $suite, $count = $pair -split ' '
        $line = @($readme -split "`n" | Where-Object { $_.StartsWith('- `tests\' + $suite + '.') })[0]
        if ($line -and $line -match '\((\d+) checks\)' -and $Matches[1] -ne $count) {
            $problems += "The README says $($Matches[1]) checks for $suite where it describes the tests; this run has $count."
        }
    }
    return $problems
}

function Invoke-Check([string[]]$options) {
    $quick = $false; $release = $false
    foreach ($option in $options) {
        if ($option -in '--quick', '-q') { $quick = $true }
        elseif ($option -eq '--release') { $release = $true }
        else { Stop-WithError "check doesn't know $option. See: maestro help" }
    }
    if ($quick -and $release) { Stop-WithError '--release needs the tests, for their counts. Leave out --quick.' }
    $folder = Get-HereCheckout
    Write-Host "Checking $folder"
    $problems = 0
    $counts = ''

    if ($quick) {
        Write-Host 'Tests:      skipped (--quick)'
    } else {
        # Shown as it arrives, and kept for the counts.
        $lines = @(& pwsh -NoProfile -File (Join-Path $folder 'tests\run-tests.ps1') 2>&1 | ForEach-Object {
            $line = "$_"
            if ($line -match 'PASS \d+ FAIL 0\b|^All tests passed') { Write-Host $line -ForegroundColor Green }
            elseif ($line -match 'FAIL|did not report|timed out') { Write-Host $line -ForegroundColor Red }
            else { Write-Host $line }
            $line
        })
        if ($LASTEXITCODE -ne 0) { $problems++; Write-Host 'Tests:      FAILED' } else { Write-Host 'Tests:      passed' }
        $counts = Get-CheckCounts $lines
        if ($counts) { Write-Host "Counts:     $counts" }
    }

    $parse = Test-AhkParse $folder
    if ($parse) { $problems++; Write-Host "Parse:      FAILED`n$parse" } else { Write-Host 'Parse:      passed' }

    $hidden = @(Find-HiddenCharacters $folder)
    if ($hidden.Count) { $problems++; Write-Host "Hidden:     FOUND in $($hidden -join ', ')" } else { Write-Host 'Hidden:     none' }

    if ($release) {
        $wrong = @(Test-Release $folder $counts)
        if ($wrong.Count) {
            $problems++
            Write-Host 'Release:    NOT READY'
            $wrong | ForEach-Object { Write-Host "            $_" }
        } else {
            Write-Host "Release:    the version, CHANGELOG and README agree with this run"
        }
        $new = @(& git -C $folder status --porcelain | Where-Object { $_ -like '`?`? *' })
        if ($new.Count) { Write-Host "Git:        $($new.Count) new file(s) aren't staged yet. Run git add -A before the release commit." }
    }

    Write-Host ''
    if ($problems) {
        Write-Host "Not ready: $problems check(s) failed."
        $global:LASTEXITCODE = 1
        exit 1
    }
    Write-Host 'All good.'
}

# ---- status

# Every place the version is written.
function Get-VersionSpots([string]$folder) {
    $spots = [ordered]@{}
    foreach ($spot in $VersionSpots) {
        $path = Join-Path $folder $spot.File
        $text = if (Test-Path -LiteralPath $path) { [IO.File]::ReadAllText($path) } else { '' }
        $spots[$spot.Name] = @([regex]::Matches($text, $spot.Pattern) | ForEach-Object { $_.Value } | Sort-Object -Unique) -join '/'
    }
    return $spots
}

function Invoke-Status {
    foreach ($checkout in (Get-Checkouts)) {
        $changes = @(& git -C $checkout.Path status --porcelain).Count
        $branch = if ($checkout.Branch) { $checkout.Branch } else { '(no branch)' }
        $ahead = [int](& git -C $checkout.Path rev-list --count "$Main..HEAD")
        $behind = [int](& git -C $checkout.Path rev-list --count "HEAD..$Main")
        Write-Host "Checkout:   $($checkout.Path)"
        Write-Host "  Branch:   $branch ($ahead ahead of $Main, $behind behind), $changes uncommitted"

        $spots = Get-VersionSpots $checkout.Path
        $values = @($spots.Values | Where-Object { $_ } | Sort-Object -Unique)
        if ($values.Count -eq 1) {
            Write-Host "  Version:  $($values[0]), the same everywhere"
        } else {
            Write-Host '  Version:  DISAGREES'
            $spots.GetEnumerator() | ForEach-Object { Write-Host "            $($_.Key): $($_.Value)" }
        }
        $changelog = Join-Path $checkout.Path 'CHANGELOG.md'
        if (Test-Path -LiteralPath $changelog) {
            $heading = @(Get-Content -LiteralPath $changelog | Where-Object { $_ -match '^## ' })[0]
            if ($heading) { Write-Host "  Changelog: $($heading -replace '^## ', '')" }
        }
    }

    Write-Host ''
    $builds = @(Get-RunningBuilds)
    if (-not $builds.Count) {
        Write-Host "Running:    nothing. Maestro isn't running."
        return
    }
    if ($builds.Count -gt 1) { Write-Host 'WARNING:    two builds are running, and their hotkeys will fight. Close one from its tray icon.' }
    foreach ($build in $builds) {
        $kind = if (Test-SamePath $build.Folder $Repo) { 'your real Maestro' } else { 'a test build, on a copy of your data. End it with: maestro try --end' }
        Write-Host "Running:    $($build.Folder), $kind"
        Write-Host "  Started:  $($build.Started)"

        # Code saved after the start isn't what's running.
        $sources = @(Get-ChildItem -LiteralPath $build.Folder -File -Filter '*.ahk') +
            @(Get-ChildItem -LiteralPath (Join-Path $build.Folder 'frontend'), (Join-Path $build.Folder 'lib') -Recurse -File -ErrorAction SilentlyContinue)
        $newest = $sources | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($newest -and $newest.LastWriteTime -gt $build.Started) {
            Write-Host "  Code:     OLDER than what's on disk ($($newest.Name) was saved $($newest.LastWriteTime)). Restart Maestro."
        } else {
            Write-Host '  Code:     up to date'
        }

        # What the log has said since that start.
        $log = Join-Path $build.Folder 'data\ASCS_Log.txt'
        if (Test-Path -LiteralPath $log) {
            $lines = @(Get-Content -LiteralPath $log)
            $start = -1
            for ($i = $lines.Count - 1; $i -ge 0; $i--) {
                if ($lines[$i] -match ' initialized\.$') { $start = $i; break }
            }
            $errors = @($lines | Select-Object -Skip ([Math]::Max($start, 0)) | Where-Object { $_ -match 'Page error:|Notes (not saved|saving failed|read failed)' })
            if ($errors.Count) {
                Write-Host "  Log:      $($errors.Count) problem(s) since this start"
                $errors | Select-Object -Last 3 | ForEach-Object { Write-Host "            $_" }
            } else {
                Write-Host '  Log:      no page or notes errors since this start'
            }
        }
    }
}

# ---- try

function Get-TestTarget([string]$named) {
    $others = @(Get-Checkouts | Where-Object { -not (Test-SamePath $_.Path $Repo) -and (Test-Path -LiteralPath (Join-Path $_.Path 'ASCS.ahk')) })
    if ($named) {
        $full = [IO.Path]::GetFullPath($named).TrimEnd('\')
        $match = $others | Where-Object { Test-SamePath $_.Path $full } | Select-Object -First 1
        if (-not $match) { Stop-WithError "$named isn't a second checkout of this repo. See: git worktree list" }
        return $match.Path
    }
    if (-not $others.Count) { Stop-WithError "There's no second checkout to try. Make one with: git worktree add <folder> <branch>" }
    if ($others.Count -gt 1) { Stop-WithError ("Name which one to try:`n" + (($others | ForEach-Object { "  $($_.Path)" }) -join "`n")) }
    return $others[0].Path
}

# Only ever deletes a folder that this command made and marked.
function Remove-TestData([string]$folder) {
    if (Test-SamePath $folder $Repo) { Stop-WithError 'Refusing to delete the real data folder.' }
    $data = Join-Path $folder 'data'
    if (-not (Test-Path -LiteralPath $data)) { return $true }
    if (-not (Test-Path -LiteralPath (Join-Path $data $TestMarker))) { Stop-WithError "$data wasn't made by maestro try, so it was left alone." }
    for ($i = 0; $i -lt 10; $i++) {
        try {
            [IO.Directory]::Delete($data, $true)
            return $true
        } catch {
            Start-Sleep -Seconds 1     # WebView2 can hold files briefly after Maestro closes.
        }
    }
    return $false
}

# The copy's own calendar: its config names real folders by their full paths,
# and a copy left that way would read and write the real calendar.
function Set-CalendarConfigPaths([string]$fromData, [string]$toData) {
    $config = Join-Path $toData 'radicale\config'
    if (-not (Test-Path -LiteralPath $config)) { return }
    $text = [IO.File]::ReadAllText($config)
    $text = [regex]::Replace($text, [regex]::Escape($fromData), { param($m) $toData }, [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($text.IndexOf($fromData, [StringComparison]::OrdinalIgnoreCase) -ge 0) { throw 'The calendar config still names the real data folder.' }
    [IO.File]::WriteAllText($config, $text, [Text.UTF8Encoding]::new($false))
}

function Invoke-Try([string[]]$options) {
    $end = $false; $named = ''
    foreach ($option in $options) {
        if ($option -eq '--end') { $end = $true }
        elseif ($option -like '-*') { Stop-WithError "try doesn't know $option. See: maestro help" }
        elseif ($named) { Stop-WithError 'Name one folder at most.' }
        else { $named = $option }
    }
    $running = @(Get-RunningBuilds)

    if ($end) {
        foreach ($build in ($running | Where-Object { -not (Test-SamePath $_.Folder $Repo) })) {
            Write-Host "Closing the test build in $($build.Folder)..."
            if (-not (Close-Build $build)) { Stop-WithError 'The test build did not close. Exit it from its tray icon, then run this again.' }
        }
        foreach ($checkout in (Get-Checkouts | Where-Object { -not (Test-SamePath $_.Path $Repo) })) {
            $data = Join-Path $checkout.Path 'data'
            if (Test-Path -LiteralPath (Join-Path $data $TestMarker)) {
                if (Remove-TestData $checkout.Path) { Write-Host "Removed the copy of your data from $($checkout.Path)." }
                else { Write-Host "WARNING: couldn't remove $data, which holds a copy of your secrets file. Delete it by hand." }
            }
        }
        if (-not ($running | Where-Object { Test-SamePath $_.Folder $Repo })) {
            Write-Host 'Starting your real Maestro...'
            Start-Build $Repo
        }
        Write-Host "Done. You're back on your real Maestro."
        return
    }

    $target = Get-TestTarget $named
    if ($running | Where-Object { Test-SamePath $_.Folder $target }) { Stop-WithError "You're already trying $target. End it with: maestro try --end" }
    # Checked before anything closes.
    $targetData = Join-Path $target 'data'
    if ((Test-Path -LiteralPath $targetData) -and -not (Test-Path -LiteralPath (Join-Path $targetData $TestMarker))) {
        Stop-WithError "$targetData wasn't made by maestro try, so it was left alone."
    }

    # Only one build at a time: two would fight over the hotkeys. Closing first
    # saves pending notes and stops the real calendar server.
    foreach ($build in $running) {
        Write-Host "Closing $($build.Folder)..."
        if (-not (Close-Build $build)) { Stop-WithError 'Maestro did not close, so nothing was started. Exit it from its tray icon, then run this again.' }
    }

    $realData = Join-Path $Repo 'data'
    try {
        if (-not (Remove-TestData $target)) { throw "Couldn't clear the last test's copy in $targetData." }
        Write-Host 'Copying your data...'
        $copy = Copy-DataFolder $realData $targetData
        if (-not $copy.Ok) { throw (Get-CopyFailure 'Some of your data could not be copied.' $copy) }
        Set-CalendarConfigPaths $realData $targetData
        [IO.File]::WriteAllText((Join-Path $targetData $TestMarker), "Made by maestro try. Everything in this folder is deleted by maestro try --end.`r`n")
    } catch {
        Write-Host 'That failed, so your real Maestro is being restarted.'
        Start-Build $Repo
        Stop-WithError "$_"
    }

    Write-Host "Starting the test build in $target..."
    Start-Build $target
    Write-Host ''
    Write-Host 'The title bar says TEST BUILD while this is running.'
    Write-Host 'Notes, settings and calendar changes go to the copy, and are discarded when you end.'
    Write-Host 'Still real: Windows sounds, controller names, power actions, audio switches, games and arrangements moving your windows.'
    Write-Host 'To go back: maestro try --end'
}

# ---- backup-data and restore-data

# One value from an .ini file, or ''. Maestro writes its settings as UTF-16,
# which Get-Content reads by the file's mark.
function Get-IniValue([string]$file, [string]$section, [string]$key) {
    if (-not (Test-Path -LiteralPath $file)) { return '' }
    $inside = $false
    foreach ($line in (Get-Content -LiteralPath $file)) {
        if ($line -match '^\s*\[(.*)\]\s*$') { $inside = $Matches[1] -ieq $section; continue }
        if ($inside -and $line -match '^\s*([^=;]+?)\s*=(.*)$' -and $Matches[1] -ieq $key) { return $Matches[2].Trim() }
    }
    return ''
}

# Why a folder can't hold backups, or '' when it can. A backup holds the secrets
# file, so only a drive inside this PC will do, and never a folder git watches.
function Test-BackupsFolder([string]$folder) {
    if ($folder -notmatch '^[A-Za-z]:\\') { return "$folder isn't a full path on a drive of this PC." }
    try { $full = [IO.Path]::GetFullPath($folder).TrimEnd('\') } catch { return "$folder isn't a usable path." }
    $drive = [IO.DriveInfo]::new($full.Substring(0, 2) + '\')
    if (-not $drive.IsReady) { return "Drive $($full.Substring(0, 2)) isn't available." }
    if ($drive.DriveType -ne 'Fixed') { return "$folder isn't on a drive inside this PC." }
    # Second checkouts too, when git can say where they are: a backup must be
    # made even where git can't run.
    $folders = @($Repo)
    try {
        $folders += @(& git -C $Repo worktree list --porcelain 2>$null | Where-Object { $_ -like 'worktree *' } |
            ForEach-Object { [IO.Path]::GetFullPath($_.Substring(9)).TrimEnd('\') })
    } catch { }
    $global:LASTEXITCODE = 0
    foreach ($checkout in $folders) {
        if ((Test-SamePath $full $checkout) -or $full.StartsWith("$checkout\", [StringComparison]::OrdinalIgnoreCase)) { return "$folder is inside Maestro's own folder." }
    }
    return ''
}

# Where backups go: the folder set in Maestro. Throws when none is set or it
# can't be used, so a backup never lands anywhere you didn't choose.
function Get-BackupsFolder {
    if ($env:ASCS_BACKUPS) { return $env:ASCS_BACKUPS }
    $set = Get-IniValue (Join-Path $Repo 'data\settings.ini') 'Backups' 'Folder'
    if (-not $set) { throw 'No backups folder is set. Choose one in Maestro, under Preferences > Backups.' }
    $problem = Test-BackupsFolder $set
    if ($problem) { throw "The backups folder in your settings can't be used. $problem" }
    return [IO.Path]::GetFullPath($set).TrimEnd('\')
}

# What Maestro reads to say when the last backup was, and whether it worked.
# Times are yyyyMMddHHmmss, which AutoHotkey reads as they are.
function Set-BackupStatus([string]$result, [string]$detail, [string]$folder = '') {
    try {
        $file = Join-Path $Repo "data\$StatusFile"
        $now = Get-Date -Format 'yyyyMMddHHmmss'
        $goodTime = if ($result -eq 'ok') { $now } else { Get-IniValue $file 'Backup' 'GoodTime' }
        $goodFolder = if ($result -eq 'ok') { $folder } else { Get-IniValue $file 'Backup' 'GoodFolder' }
        $lines = '[Backup]', "Time=$now", "Result=$result", "Detail=$($detail -replace '\s+', ' ')", "GoodTime=$goodTime", "GoodFolder=$goodFolder"
        [IO.File]::WriteAllLines($file, [string[]]$lines, [Text.UnicodeEncoding]::new($false, $true))
    } catch {
        Write-Host "WARNING: couldn't record the result for Maestro: $($_.Exception.Message)"
    }
}

# Copies a data folder into $backups as <prefix>-<date>-<time>. The folder only
# gets that name once every file has copied, so a partial copy is never taken
# for a backup. Returns the new folder, or throws.
function New-Backup([string]$source, [string]$backups, [string]$prefix) {
    [IO.Directory]::CreateDirectory($backups) | Out-Null
    do {
        $name = "$prefix-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
        $final = Join-Path $backups $name
        $taken = (Test-Path -LiteralPath $final) -or (Test-Path -LiteralPath "$final.partial")
        if ($taken) { Start-Sleep -Milliseconds 500 }
    } while ($taken)
    $partial = "$final.partial"
    [IO.Directory]::CreateDirectory($partial) | Out-Null
    $copy = Copy-DataFolder $source $partial
    if (-not $copy.Ok) {
        try { [IO.Directory]::Delete($partial, $true) } catch { }
        throw (Get-CopyFailure "No backup was made, because some files couldn't be copied." $copy)
    }
    [IO.Directory]::Move($partial, $final)
    return $final
}

# Which of a backups folder's own folders have had their day. Kept: every backup
# from the newest day, the newest from each of the 14 newest days, the first
# from each of the 6 newest months, and the 3 newest copies made before a
# restore. A partial copy left by an earlier day's run goes too.
function Get-ExpiredBackups([string[]]$names, [string]$today) {
    $keep = [Collections.Generic.HashSet[string]]::new()
    $all = @($names | Where-Object { $_ -match '^data-\d{8}-\d{6}$' } | Sort-Object -Descending)
    $days = [Collections.Generic.List[string]]::new()
    $months = [Collections.Generic.List[string]]::new()
    foreach ($name in $all) {
        $day = $name.Substring(5, 8)
        if ($day -eq $all[0].Substring(5, 8)) { [void]$keep.Add($name) }
        if (-not $days.Contains($day)) {
            $days.Add($day)
            if ($days.Count -le 14) { [void]$keep.Add($name) }
        }
        if (-not $months.Contains($day.Substring(0, 6))) { $months.Add($day.Substring(0, 6)) }
    }
    foreach ($month in ($months | Select-Object -First 6)) {
        [void]$keep.Add(($all | Where-Object { $_.Substring(5, 6) -eq $month } | Select-Object -Last 1))
    }
    $before = @($names | Where-Object { $_ -match '^before-restore-\d{8}-\d{6}$' } | Sort-Object -Descending)
    foreach ($name in ($before | Select-Object -First 3)) { [void]$keep.Add($name) }
    $partials = @($names | Where-Object { $_ -match '^(data|before-restore)-(\d{8})-\d{6}\.partial$' -and $Matches[2] -ne $today })
    return @($all + $before | Where-Object { -not $keep.Contains($_) }) + $partials
}

# Only ever removes folders named like this command's own.
function Remove-ExpiredBackups([string]$backups) {
    $names = @(Get-ChildItem -LiteralPath $backups -Directory | ForEach-Object { $_.Name })
    $expired = @(Get-ExpiredBackups $names (Get-Date -Format 'yyyyMMdd'))
    foreach ($name in $expired) { [IO.Directory]::Delete((Join-Path $backups $name), $true) }
    return $expired.Count
}

function Invoke-BackupData {
    $source = Join-Path $Repo 'data'
    if (-not (Test-Path -LiteralPath $source)) { Stop-WithError "There's no data folder at $source." }
    try {
        $backups = Get-BackupsFolder
        Write-Host "Copying $source to $backups"
        $made = New-Backup $source $backups 'data'
    } catch {
        Set-BackupStatus 'failed' $_.Exception.Message
        Stop-WithError $_.Exception.Message
    }
    $files = @(Get-ChildItem -LiteralPath $made -Recurse -File)
    $size = ($files | Measure-Object Length -Sum).Sum
    Write-Host ('{0}: {1:N0} files, {2:N1} MB. It includes your secrets file, so keep it on this PC.' -f (Split-Path $made -Leaf), $files.Count, ($size / 1MB))
    Set-BackupStatus 'ok' ('{0:N0} files, {1:N1} MB' -f $files.Count, ($size / 1MB)) $made
    try {
        $removed = Remove-ExpiredBackups $backups
        if ($removed) { Write-Host "Removed $removed older backup(s)." }
    } catch {
        Write-Host "WARNING: an older backup couldn't be removed: $($_.Exception.Message)"
    }
}

# Second checkouts holding a test build's copy of the data. A backup or a restore
# never touches one: both work on the real data.
function Get-TestCopies {
    return @(Get-Checkouts | Where-Object { -not (Test-SamePath $_.Path $Repo) } | ForEach-Object { Join-Path $_.Path 'data' } |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ $TestMarker) })
}

function Write-TestCopyNote {
    foreach ($copy in (Get-TestCopies)) {
        Write-Host "Note: $copy is a test build's copy of your data. It isn't touched: this is about your real data, in $(Join-Path $Repo 'data')."
    }
}

# A backups folder's backups, newest first.
function Get-Backups([string]$backups) {
    if (-not (Test-Path -LiteralPath $backups)) { return @() }
    $found = foreach ($folder in (Get-ChildItem -LiteralPath $backups -Directory)) {
        if ($folder.Name -notmatch '^(data|before-restore)-(\d{8}-\d{6})$') { continue }
        $when = [datetime]::ParseExact($Matches[2], 'yyyyMMdd-HHmmss', [cultureinfo]::InvariantCulture)
        [pscustomobject]@{
            Name = $folder.Name; Path = $folder.FullName; Stamp = $Matches[2]; BeforeRestore = $Matches[1] -ne 'data'
            When = $when.ToString('ddd, MMM d, yyyy, h:mm tt', [cultureinfo]::InvariantCulture)
        }
    }
    return @($found | Sort-Object Stamp -Descending)
}

function Invoke-RestoreData([string[]]$options) {
    $yes = $false; $named = ''
    foreach ($option in $options) {
        switch -Regex ($option) {
            '^(--yes|-y)$' { $yes = $true; break }
            '^-' { Stop-WithError "restore-data doesn't know $option. See: maestro help" }
            default { if ($named) { Stop-WithError 'Name one backup at most.' }; $named = $option }
        }
    }
    try { $backups = Get-BackupsFolder } catch { Stop-WithError $_.Exception.Message }
    $list = @(Get-Backups $backups)

    if (-not $named) {
        if (-not $list.Count) { Write-Host "There are no backups in $backups yet. Make one with: maestro backup-data"; return }
        Write-Host "Backups in ${backups}, newest first:"
        $number = 0
        foreach ($backup in $list) {
            $number++
            $note = if ($backup.BeforeRestore) { '   (your data just before a restore)' } else { '' }
            Write-Host ('  {0,2}  {1}{2}' -f $number, $backup.When, $note)
        }
        Write-Host 'To restore one, exit Maestro from its tray icon, then: maestro restore-data <number>'
        Write-TestCopyNote
        return
    }

    $chosen = if ($named -match '^\d{1,3}$') { if ([int]$named -ge 1 -and [int]$named -le $list.Count) { $list[[int]$named - 1] } }
    else { $list | Where-Object { $_.Name -ieq $named } | Select-Object -First 1 }
    if (-not $chosen) { Stop-WithError "There's no backup $named. List them with: maestro restore-data" }
    if (-not ((Test-Path -LiteralPath (Join-Path $chosen.Path 'notes.json')) -or (Test-Path -LiteralPath (Join-Path $chosen.Path 'settings.ini')))) {
        Stop-WithError "$($chosen.Path) has no notes or settings in it, so it was left alone."
    }
    $data = Join-Path $Repo 'data'
    if (Test-Path -LiteralPath (Join-Path $data $TestMarker)) { Stop-WithError "$data is a test build's copy. End the test first: maestro try --end" }
    # Maestro saves as it goes, so a restore under a running one wouldn't last.
    if (@(Get-RunningBuilds).Count) { Stop-WithError 'Maestro is running, and nothing was changed. Exit it from its tray icon, then run this again.' }

    Write-Host "This puts back your data from $($chosen.When):"
    Write-Host "  everything in $data is replaced by that copy, secrets file included."
    Write-Host "  Your data as it is now is copied to $backups first."
    Write-TestCopyNote
    if (-not $yes) {
        Write-Host -NoNewline 'Go ahead? [y/N] '
        $answer = [Console]::ReadLine()
        if ($answer -notmatch '^(y|yes)$') {
            Write-Host 'Stopped. Nothing was changed.'
            return
        }
    }

    $saved = ''
    if (Test-Path -LiteralPath $data) {
        try { $saved = New-Backup $data $backups 'before-restore' }
        catch { Stop-WithError "Your data as it is now couldn't be copied first, so nothing was restored. $($_.Exception.Message)" }
        Write-Host "Kept your data as it was in $saved"
    }
    $copy = Copy-DataFolder $chosen.Path $data -Mirror
    if (-not $copy.Ok) {
        $where = if ($saved) { " Your data from before is in $saved." } else { '' }
        Stop-WithError ((Get-CopyFailure "Some files couldn't be put back, so your data may be part old and part new." $copy) + $where)
    }
    try { Remove-ExpiredBackups $backups | Out-Null } catch { }
    Write-Host "Restored the data from $($chosen.When). Start Maestro again to use it."
}

# ---- new-release and bump

function Test-VersionText([string]$text) {
    return $text -match '^\d+\.\d+\.\d+$'
}

# Where a version's checkout goes: inside the main folder, named for the version
# without a last .0 (_2.2 for 2.2.0), where the editor's git tools find it. git
# ignores whatever starts with an underscore there.
function Get-ReleaseFolder([string]$version) {
    return Join-Path $Repo "_$($version -replace '\.0$', '')"
}

function Invoke-NewRelease([string[]]$options) {
    $version = ''; $branch = ''
    foreach ($option in $options) {
        if ($option -like '-*') { Stop-WithError "new-release doesn't know $option. See: maestro help" }
        elseif (-not $version) { $version = $option }
        elseif (-not $branch) { $branch = $option }
        else { Stop-WithError 'Give a version and, at most, a branch name.' }
    }
    if (-not (Test-VersionText $version)) { Stop-WithError 'Give the version as three numbers: maestro new-release 2.2.0' }
    if (-not $branch) { $branch = "feat/v$version" }
    if ($branch -eq $Main) { Stop-WithError "A release gets a branch of its own, not $Main." }
    & git -C $Repo check-ref-format --branch $branch *> $null
    if ($LASTEXITCODE -ne 0) { $global:LASTEXITCODE = 0; Stop-WithError "$branch isn't a name git accepts for a branch." }
    & git -C $Repo show-ref --verify --quiet "refs/heads/$branch"
    if ($LASTEXITCODE -eq 0) { Stop-WithError "There's already a branch called $branch." }
    $global:LASTEXITCODE = 0
    $folder = Get-ReleaseFolder $version
    if (Test-Path -LiteralPath $folder) { Stop-WithError "$folder already exists." }

    # Read from the main branch itself, whatever is checked out.
    $changelog = (& git -C $Repo show "${Main}:CHANGELOG.md" 2>$null) -join "`n"
    $readme = (& git -C $Repo show "${Main}:README.md" 2>$null) -join "`n"
    $global:LASTEXITCODE = 0
    if ($changelog -match "(?m)^## Version $([regex]::Escape($version))\b") { Stop-WithError "The CHANGELOG on $Main already has Version $version." }
    $current = [regex]::Match($readme, ($VersionSpots | Where-Object { $_.Name -eq 'README' }).Pattern).Value
    if ((Test-VersionText $current) -and [version]$version -le [version]$current) { Stop-WithError "$version isn't newer than $current, the version on $Main." }

    # Unless git ignores it, the main folder would list the checkout as a new file.
    $name = Split-Path $folder -Leaf
    # Asked without a last slash: with one, git 2.56 answers yes for any name.
    & git -C $Repo check-ignore -q $name
    if ($LASTEXITCODE -ne 0) { $global:LASTEXITCODE = 0; Stop-WithError "git doesn't ignore $name in $Repo. Add /_* to .gitignore on $Main first." }

    Invoke-Git worktree add $folder -b $branch $Main | Out-Null
    $path = Join-Path $folder 'CHANGELOG.md'
    $heading = "## Version $version (in progress)"
    $added = $false
    if (Test-Path -LiteralPath $path) {
        $text = [IO.File]::ReadAllText($path)
        $at = [regex]::Match($text, '(?m)^## ')
        if ($at.Success) {
            $newline = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
            [IO.File]::WriteAllText($path, $text.Insert($at.Index, "$heading$newline$newline"), [Text.UTF8Encoding]::new($false))
            $added = $true
        }
    }

    Write-Host "Made $folder on $branch, from $Main."
    if ($added) { Write-Host "CHANGELOG: added `"$heading`". Nothing was committed." }
    else { Write-Host "CHANGELOG: no place was found for `"$heading`", so add it by hand." }
    Write-Host "The version number isn't changed until the release is done: maestro bump $version"
    Write-Host "To run it on a copy of your data: maestro try $folder"
}

# The checkout you're standing in, for a command that changes files: never the
# main branch, which is the Maestro you run.
function Get-BranchCheckout([string]$command) {
    $folder = Get-HereCheckout
    $branch = (Get-Checkouts | Where-Object { Test-SamePath $_.Path $folder } | Select-Object -First 1).Branch
    if (-not $branch -or $branch -eq $Main) {
        Stop-WithError "$command changes files, so it works on a release's branch, never on $Main. Stand in that checkout and run it again (see: maestro status)."
    }
    return $folder
}

function Invoke-Bump([string[]]$options) {
    if ($options.Count -ne 1 -or -not (Test-VersionText $options[0])) { Stop-WithError 'Give the new version as three numbers: maestro bump 2.2.0' }
    $version = $options[0]
    $folder = Get-BranchCheckout 'bump'
    $before = Get-VersionSpots $folder

    # Worked out for every file before any is written, so a missing spot changes nothing.
    $texts = [ordered]@{}
    $originals = @{}
    $missing = @()
    foreach ($spot in $VersionSpots) {
        $path = Join-Path $folder $spot.File
        if (-not $texts.Contains($path)) {
            $texts[$path] = if (Test-Path -LiteralPath $path) { [IO.File]::ReadAllText($path) } else { '' }
            $originals[$path] = $texts[$path]
        }
        if (-not [regex]::IsMatch($texts[$path], $spot.Pattern)) { $missing += "$($spot.Name) ($($spot.File))"; continue }
        $texts[$path] = [regex]::Replace($texts[$path], $spot.Pattern, $version)
    }
    if ($missing.Count) { Stop-WithError "The version wasn't found in: $($missing -join ', '). Nothing was changed." }
    foreach ($path in $texts.Keys) {
        if ($texts[$path] -cne $originals[$path]) { [IO.File]::WriteAllText($path, $texts[$path], [Text.UTF8Encoding]::new($false)) }
    }

    Write-Host "The version in ${folder}:"
    foreach ($name in $before.Keys) { Write-Host ("  {0,-16} {1} -> {2}" -f $name, $before[$name], $version) }
    Write-Host ''
    Write-Host 'Still by hand: the README Status line and its status, testing and roadmap sections, and the CHANGELOG.'
    Write-Host 'Nothing was committed. Then: maestro check --release'
}

# ---- clean

function Invoke-Clean([string[]]$options) {
    $yes = $false; $dryRun = $false
    foreach ($option in $options) {
        switch -Regex ($option) {
            '^(--yes|-y)$' { $yes = $true; break }
            '^(--dry-run|-n)$' { $dryRun = $true; break }
            default { Stop-WithError "clean doesn't know $option. See: maestro help" }
        }
    }
    $others = @(Get-Checkouts | Where-Object { -not (Test-SamePath $_.Path $Repo) })
    if (-not $others.Count) { Write-Host 'Nothing to clean: there is no second checkout.'; return }
    $running = @(Get-RunningBuilds)
    $here = (Get-Location).ProviderPath.TrimEnd('\')
    $finished = @()
    foreach ($checkout in $others) {
        # A checkout goes only when nothing in it could be lost: its branch is
        # all in the main branch, and on the remote as it is here.
        $why = ''
        if (-not (Test-Path -LiteralPath $checkout.Path)) { $why = 'its folder is missing (see: git worktree prune)' }
        elseif (-not $checkout.Branch) { $why = "it isn't on a branch" }
        elseif (@(& git -C $checkout.Path status --porcelain).Count) { $why = 'it has uncommitted work' }
        elseif (Measure-Commits "$Main..$($checkout.Branch)") { $why = "its branch isn't merged into $Main" }
        else {
            $tip = "$(Invoke-Git rev-parse $checkout.Branch)".Trim()
            $pushed = "$(& git -C $Repo rev-parse --verify --quiet "refs/remotes/origin/$($checkout.Branch)")".Trim()
            $global:LASTEXITCODE = 0
            if ($pushed -ne $tip) { $why = "its branch isn't pushed as it is here" }
            elseif ($running | Where-Object { Test-SamePath $_.Folder $checkout.Path }) { $why = "it's running. End it with: maestro try --end" }
            elseif (Test-Path -LiteralPath (Join-Path $checkout.Path 'data')) { $why = 'it holds a copy of your data. End it with: maestro try --end' }
            elseif ($here -ieq $checkout.Path -or $here.StartsWith("$($checkout.Path)\", [StringComparison]::OrdinalIgnoreCase)) { $why = "you're standing in it" }
        }
        if ($why) { Write-Host "Keeping:  $($checkout.Path) [$($checkout.Branch)], because $why." }
        else { $finished += $checkout }
    }
    if (-not $finished.Count) { Write-Host 'Nothing to clean.'; return }

    Write-Host ''
    foreach ($checkout in $finished) { Write-Host "Removing: $($checkout.Path), and the local branch $($checkout.Branch) (merged into $Main; it stays on the remote)" }
    Write-Host ''
    if ($dryRun) {
        Write-Host 'Dry run: nothing was changed.'
        return
    }
    if (-not $yes) {
        Write-Host -NoNewline 'Go ahead? [y/N] '
        $answer = [Console]::ReadLine()
        if ($answer -notmatch '^(y|yes)$') {
            Write-Host 'Stopped. Nothing was changed.'
            return
        }
    }
    foreach ($checkout in $finished) {
        # Without --force: git refuses if anything there is new or changed.
        Invoke-Git worktree remove $checkout.Path | Out-Null
        Invoke-Git branch -d $checkout.Branch | Out-Null
        Write-Host "Removed $($checkout.Path) and $($checkout.Branch)."
    }
}

# ---- doctor

# The WebView2 Runtime's id with Edge Update, which records its version.
$WebView2Client = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
$SignInTask = 'Startup - Sign-in'

function Write-Finding([string]$mark, [string]$text, [string]$hint = '') {
    $color = switch ($mark) { 'OK' { 'Green' } '!!' { 'Red' } default { 'DarkGray' } }
    Write-Host ('  {0,-4}{1}' -f $mark, $text) -ForegroundColor $color
    if ($hint) { Write-Host "      $hint" }
    if ($mark -eq '!!') { $script:DoctorProblems++ }
}

function Get-WebView2Version {
    foreach ($key in "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$WebView2Client", "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$WebView2Client", "HKCU:\Software\Microsoft\EdgeUpdate\Clients\$WebView2Client") {
        $value = (Get-ItemProperty -LiteralPath $key -Name pv -ErrorAction SilentlyContinue).pv
        if ($value -and $value -ne '0.0.0.0') { return $value }
    }
    return ''
}

# A shortcut's target and the full paths quoted in its arguments. Reading a
# shortcut this way never saves it.
function Get-ShortcutPaths([string]$path) {
    $link = (New-Object -ComObject WScript.Shell).CreateShortcut($path)
    $quoted = [regex]::Matches($link.Arguments, '"([A-Za-z]:\\[^"]+)"') | ForEach-Object { $_.Groups[1].Value }
    return @(@($link.TargetPath) + @($quoted) | Where-Object { $_ })
}

# What each file in a folder holds. A shortcut by what it does: its bytes also
# carry Windows' own tracking data, which differs between two copies of one.
function Get-FileHashes([string]$folder) {
    $hashes = @{}
    $shell = New-Object -ComObject WScript.Shell
    foreach ($file in (Get-ChildItem -LiteralPath $folder -File -Force | Where-Object { $_.Name -notin 'desktop.ini', 'Thumbs.db' })) {
        $hashes[$file.Name] = if ($file.Extension -eq '.lnk') {
            $link = $shell.CreateShortcut($file.FullName)
            ($link.TargetPath, $link.Arguments, $link.WorkingDirectory, $link.IconLocation, $link.Hotkey, $link.WindowStyle) -join '|'
        } else { (Get-FileHash -LiteralPath $file.FullName).Hash }
    }
    return $hashes
}

function Invoke-Doctor([string[]]$options) {
    if ($options.Count) { Stop-WithError 'doctor takes no options. See: maestro help' }
    $script:DoctorProblems = 0
    $data = Join-Path $Repo 'data'
    Write-Host "Maestro in $Repo"

    Write-Host ''
    Write-Host 'Needed'
    if (-not (Test-Path -LiteralPath $AhkExe)) {
        Write-Finding '!!' "AutoHotkey v2 isn't at $AhkExe" 'Install AutoHotkey v2 (64-bit).'
    } else {
        $version = "$((Get-Item -LiteralPath $AhkExe).VersionInfo.FileVersion)"
        if ($version -like '2.*') { Write-Finding 'OK' "AutoHotkey $version" }
        else { Write-Finding '!!' "AutoHotkey $version at $AhkExe, not version 2" 'Install AutoHotkey v2 (64-bit).' }
    }
    $webView2 = Get-WebView2Version
    if ($webView2) { Write-Finding 'OK' "WebView2 Runtime $webView2" }
    else { Write-Finding '!!' "The WebView2 Runtime isn't installed" "Install Microsoft's Evergreen WebView2 Runtime." }
    $missing = @('WebViewToo.ahk', 'WebView2.ahk' | Where-Object { -not (Test-Path -LiteralPath (Join-Path $Repo "webview\$_")) })
    if ($missing.Count) { Write-Finding '!!' "WebViewToo is missing from webview\ ($($missing -join ', '))" 'Put WebViewToo there; see README section 10.' }
    else { Write-Finding 'OK' 'WebViewToo in webview\' }
    $git = "$(& git --version 2>$null)".Trim()
    $global:LASTEXITCODE = 0
    if ($git) { Write-Finding 'OK' $git } else { Write-Finding '!!' "git isn't on your PATH" 'Install Git for Windows; this command line needs it.' }
    if (Test-Path -LiteralPath $data -PathType Container) { Write-Finding 'OK' 'data\, your notes and settings' }
    else { Write-Finding '!!' "There's no data folder" 'Maestro makes one when it starts. If it ran here before, put yours back: maestro restore-data' }

    Write-Host ''
    Write-Host 'Optional'
    if (Test-Path -LiteralPath (Join-Path $Repo 'lib\VirtualDesktopAccessor.dll')) { Write-Finding 'OK' 'VirtualDesktopAccessor.dll, for desktop switching' }
    else { Write-Finding '--' 'No VirtualDesktopAccessor.dll: desktop actions report a failure' }
    # Where FindEverything in Notes.ahk looks.
    $everything = @("$env:ProgramFiles\Everything\Everything.exe", "${env:ProgramFiles(x86)}\Everything\Everything.exe", "$env:LOCALAPPDATA\Programs\Everything\Everything.exe") |
        Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($everything) { Write-Finding 'OK' 'Everything, for file search' } else { Write-Finding '--' 'No Everything: file search is off' }
    if (Test-Path -LiteralPath "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") { Write-Finding 'OK' 'Microsoft Edge, for the tests and previews' }
    else { Write-Finding '--' 'No Microsoft Edge: the frontend tests and previews need it' }
    $radicale = Join-Path $data 'radicale'
    $parts = @('venv\Scripts\pythonw.exe', 'config', 'users' | Where-Object { -not (Test-Path -LiteralPath (Join-Path $radicale $_)) })
    if (-not (Test-Path -LiteralPath (Join-Path $radicale 'venv'))) {
        Write-Finding '--' "The calendar server isn't installed (tools\Install-Radicale.ps1)"
    } elseif ($parts.Count) {
        Write-Finding '!!' "The calendar server is missing $($parts -join ', ')" 'Run tools\Install-Radicale.ps1 again.'
    } else {
        # Read from the package's folder name, so nothing runs Python.
        $installed = Get-ChildItem -LiteralPath (Join-Path $radicale 'venv\Lib\site-packages') -Directory -Filter 'radicale-*.dist-info' -ErrorAction SilentlyContinue |
            ForEach-Object { $_.Name -replace '^radicale-(.+)\.dist-info$', '$1' } | Select-Object -First 1
        $pins = Join-Path $Repo 'tools\radicale-requirements.txt'
        $pinned = if (Test-Path -LiteralPath $pins) { [regex]::Match([IO.File]::ReadAllText($pins), '(?im)^radicale==([\w.]+)').Groups[1].Value } else { '' }
        if (-not $installed) { Write-Finding '!!' "Can't tell which Radicale the calendar server has" 'Run tools\Install-Radicale.ps1 again.' }
        elseif ($pinned -and $installed -ne $pinned) { Write-Finding '!!' "Radicale $installed, but $pinned is pinned" 'Run tools\Install-Radicale.ps1.' }
        else { Write-Finding 'OK' ("Radicale $installed, the calendar server" + $(if ($pinned) { ', as pinned' } else { '' })) }
    }

    Write-Host ''
    Write-Host 'Sign-in and startup'
    $startup = [Environment]::GetFolderPath('Startup')
    # The sign-in scripts live beside maestro.cmd, so no folder is written in here.
    $command = Get-Command maestro.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    $scripts = if ($command) { Split-Path $command.Source -Parent } else { '' }
    if (-not $scripts) {
        Write-Finding '--' "No maestro.cmd on your PATH, so the sign-in scripts beside it weren't checked"
    } else {
        $cli = Join-Path $Repo 'tools\cli\Maestro-Cli.ps1'
        if ([IO.File]::ReadAllText($command.Source).IndexOf($cli, [StringComparison]::OrdinalIgnoreCase) -ge 0) { Write-Finding 'OK' "maestro.cmd in $scripts runs this Maestro" }
        else { Write-Finding '!!' "$($command.Source) doesn't run $cli" "Point it at $cli." }
        $readers = @(Join-Path $scripts 'SignIn.ahk')
        if (Test-Path -LiteralPath (Join-Path $startup 'Shutdown Sound.ahk')) { $readers += Join-Path $startup 'Shutdown Sound.ahk' }
        $settings = Join-Path $data 'startup-sounds.ini'
        foreach ($reader in $readers) {
            $name = Split-Path $reader -Leaf
            if (-not (Test-Path -LiteralPath $reader)) { Write-Finding '!!' "$reader is missing" 'Put it back from a backup.'; continue }
            if ([IO.File]::ReadAllText($reader).IndexOf($settings, [StringComparison]::OrdinalIgnoreCase) -ge 0) { Write-Finding 'OK' "$name reads $settings" }
            else { Write-Finding '!!' "$name doesn't read $settings, so Sounds > Startup has no effect on it" 'Correct the path in it.' }
        }
        $task = Get-ScheduledTask -TaskName $SignInTask -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $task) {
            Write-Finding '!!' "The task `"$SignInTask`" isn't registered, so SignIn.ahk doesn't run" 'Run Configure-Startup.ps1 (it asks for admin rights), then restart.'
        } else {
            $info = $task | Get-ScheduledTaskInfo
            $result = switch ($info.LastTaskResult) { 0 { 'succeeded' } 267009 { 'still running' } 267011 { 'has never run' } default { 'failed (0x{0:X})' -f $info.LastTaskResult } }
            $when = if ($info.LastRunTime -and $info.LastRunTime.Year -gt 2000) { $info.LastRunTime.ToString('yyyy-MM-dd HH:mm') } else { 'never' }
            $text = "Task `"$SignInTask`": last run $when, $result"
            if ("$($task.State)" -eq 'Disabled') { Write-Finding '!!' "$text, and it's disabled" 'Run Configure-Startup.ps1 (it asks for admin rights).' }
            elseif ($info.LastTaskResult -in 0, 267009) { Write-Finding 'OK' $text }
            else { Write-Finding '!!' $text 'See how the last sign-in went: Startup Status.cmd' }
        }
        $workingCopy = Join-Path $scripts 'Startup Folder (Working Copy)'
        if (Test-Path -LiteralPath $workingCopy) {
            $want = Get-FileHashes $workingCopy
            $have = Get-FileHashes $startup
            $differ = @(foreach ($name in (@($want.Keys) + @($have.Keys) | Sort-Object -Unique)) {
                if (-not $have.ContainsKey($name)) { "$name (missing)" }
                elseif (-not $want.ContainsKey($name)) { "$name (not in the working copy)" }
                elseif ($want[$name] -ne $have[$name]) { "$name (changed)" }
            })
            if ($differ.Count) { Write-Finding '!!' "The Startup folder differs from its working copy: $($differ -join ', ')" 'Run Sync Startup Folder.cmd; it lists the changes and asks first.' }
            else { Write-Finding 'OK' "The Startup folder matches its working copy ($($want.Count) items)" }
        }
    }
    $links = @(Get-ChildItem -LiteralPath $startup -Filter *.lnk -File -ErrorAction SilentlyContinue | ForEach-Object { @{ File = $_; Where = 'Startup folder' } }) +
        @(Get-ChildItem -LiteralPath ([Environment]::GetFolderPath('Programs')) -Filter *.lnk -File -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match 'ASCS|Maestro' } | ForEach-Object { @{ File = $_; Where = 'Start Menu' } })
    foreach ($link in $links) {
        $name = "$($link.Where): $($link.File.BaseName)"
        $paths = Get-ShortcutPaths $link.File.FullName
        $gone = @($paths | Where-Object { -not (Test-Path -LiteralPath $_) })
        $elsewhere = @($paths | Where-Object { $_ -match '\\ASCS(\.Launcher)?\.ahk$' -and -not $_.StartsWith("$Repo\", [StringComparison]::OrdinalIgnoreCase) })
        if ($gone.Count) { Write-Finding '!!' "$name points to $($gone -join ', '), which isn't there" 'Make it again: pwsh -File tools\Install-Shortcut.ps1 (Maestro and its launcher), or fix it by hand.' }
        elseif ($elsewhere.Count) { Write-Finding '!!' "$name starts $($elsewhere -join ', '), not this Maestro" 'Make it again: pwsh -File tools\Install-Shortcut.ps1' }
        else { Write-Finding 'OK' $name }
    }

    Write-Host ''
    if ($script:DoctorProblems) {
        Write-Host "$($script:DoctorProblems) problem(s) found."
        $global:LASTEXITCODE = 1
        exit 1
    }
    Write-Host 'No problems found.'
}

# ---- isolate

$IsolateMarker = 'isolate.txt'
$IsolateMain = 'ASCS-Isolated.ahk'
$IsolatePort = 5233
# What a copy holds: the scripts that run and what they include. The launcher
# stays out: it would answer Ctrl+Alt+Shift+A for the real Maestro.
$IsolateFiles = @('ASCS.ahk', 'ASCS.DriveProbe.ahk', 'ASCS.HardwareProbe.ahk')
$IsolateFolders = @('lib', 'webview', 'frontend')
# Built-ins that can act outside the copy. Calls are rewritten to the hook's
# Isolate_ versions, which act only inside it (tools\cli\isolate-hook.ahk).
$IsolateGuarded = 'Run|RunWait|ProcessClose|FileDelete|FileRecycle|FileMove|FileCopy|DirDelete|DirMove|DirCopy|FileAppend|FileOpen|IniWrite|IniDelete'
# DLL calls that lock, sleep or shut down Windows.
$IsolatePowerCalls = 'LockWorkStation|PowrProf\\SetSuspendState|ExitWindowsEx|InitiateSystemShutdown\w*|InitiateShutdown\w*'
$IsolateInclude = '#Include %A_ScriptDir%\isolate-hook.ahk'

function Get-IsolateRoot {
    if ($env:ASCS_ISOLATE_ROOT) { return $env:ASCS_ISOLATE_ROOT }
    return Join-Path ([IO.Path]::GetTempPath()) 'maestro-isolate'
}

# One script, rewritten for a copy. -Entry adds the hook (and the caller's
# probes, with -Probes) to a script that runs on its own.
function ConvertTo-IsolatedScript([string]$text, [switch]$Entry, [switch]$Probes, [switch]$Main) {
    $text = [regex]::Replace($text, "(?i)(?<![\w.#`"'])($IsolateGuarded)\(", 'Isolate_$1(')
    $text = [regex]::Replace($text, "(?i)\bDllCall\(\s*`"($IsolatePowerCalls)`"", 'Isolate_Stub("$1"')
    $text = [regex]::Replace($text, '(?i)(?<![\w.])Send\((?=\s*ASCS_SoundSwitchKey)', 'Isolate_Stub("Send", ')
    $text = [regex]::Replace($text, '(?i)(?<!\w)F24(?!\w)', 'Pause')
    $text = [regex]::Replace($text, '(?im)^(\s*)([~$*]*\^!\+a::)', '$1; (maestro isolate) $2')
    $text = [regex]::Replace($text, '(?<!\d)5232(?!\d)', "$IsolatePort")
    if ($Main) {
        # Warnings go to standard output, where --run collects them, not to a
        # message box that would wait for a click.
        $text = [regex]::Replace($text, '(?im)^#Warn\s*$', '#Warn All, StdOut')
        $text = [regex]::Replace($text, '(?im)^(#Warn\b.*?),\s*MsgBox\s*$', '$1, StdOut')
    }
    if ($Entry) {
        $include = $IsolateInclude + $(if ($Probes) { "`r`n#Include %A_ScriptDir%\isolate-probes.ahk" } else { '' })
        $requires = [regex]::Match($text, '(?im)^#Requires\b.*$')
        $text = if ($requires.Success) { $text.Insert($requires.Index + $requires.Length, "`r`n$include") } else { "$include`r`n$text" }
    }
    return $text
}

# Code alone: strings and comments become blanks, keeping the line breaks.
function Get-AhkCode([string]$text) {
    $keepLines = { param($m) -join ($m.Value.ToCharArray() | Where-Object { $_ -eq "`n" }) }
    $text = [regex]::Replace($text, '(?ms)^\s*/\*.*?^\s*\*/', $keepLines)
    $text = [regex]::Replace($text, '"(?:[^"`\r\n]|`.)*"|''(?:[^''`\r\n]|`.)*''', '""')
    return [regex]::Replace($text, '(?m)(^|\s);.*$', '$1')
}

# Everything in a copy that could still act outside it, as "file:line: what".
# The hook itself is the one file allowed the real calls.
function Find-IsolationHazards([string]$folder) {
    $hazards = @()
    $add = { param($file, $text, $index, $what) $line = ($text.Substring(0, $index) -split "`n").Count; "${file}:${line}: $what" }
    foreach ($item in (Get-ChildItem -LiteralPath $folder -Recurse -File -Filter *.ahk)) {
        if ($item.Name -eq 'isolate-hook.ahk' -and $item.DirectoryName -eq $folder) { continue }
        $file = $item.FullName.Substring($folder.Length + 1)
        $text = [IO.File]::ReadAllText($item.FullName)
        $code = Get-AhkCode $text
        $checks = @(
            @{ In = $text; Pattern = '(?i)(?<!\w)F24(?!\w)'; What = 'the Super key (F24)' }
            @{ In = $text; Pattern = '(?im)^\s*[~$*]*\^!\+a::'; What = "the reload hotkey (Ctrl+Alt+Shift+A)" }
            @{ In = $text; Pattern = '(?<!\d)5232(?!\d)'; What = "the live calendar's port" }
            @{ In = $text; Pattern = "(?i)(?<![\w.#`"'])($IsolateGuarded)\("; What = 'an unguarded call' }
            @{ In = $code; Pattern = "(?im)^\s*(?:try\s+|else\s+)?($IsolateGuarded)\s+(?![:+\-*/.|&^]?=)[^\s,)]"; What = 'an unguarded call, without brackets' }
            @{ In = $code; Pattern = "(?im)::\s*($IsolateGuarded)\s+[^\s(]"; What = 'an unguarded call, without brackets' }
            # A bare name that isn't called, indexed or assigned to: a built-in passed on.
            @{ In = $code; Pattern = "(?i)(?<![\w.#&$%])($IsolateGuarded)(?![\w(\[.]|[ \t]*[:+\-*/|&^]?=(?!=)|[ \t]+[^\s,)\]])"; What = 'a built-in passed on unguarded' }
            @{ In = $text; Pattern = "(?i)DllCall\(\s*`"($IsolatePowerCalls)`""; What = 'a power call' }
            @{ In = $text; Pattern = '(?i)(?<![\w.])Send\(\s*ASCS_SoundSwitchKey'; What = 'the audio switch' }
            @{ In = $code; Pattern = '(?i)\.(ShellExecute\w*|Exec|Run)\(|ComObject\(\s*"WScript\.Shell'; What = 'a launch through COM' }
        )
        foreach ($check in $checks) {
            foreach ($match in [regex]::Matches($check.In, $check.Pattern)) {
                $hazards += & $add $file $check.In $match.Index "$($check.What): $($match.Value.Trim())"
            }
        }
        # A script at the top runs on its own; the probes are included by the main one.
        if ($item.DirectoryName -eq $folder -and $item.Name -ne 'isolate-probes.ahk' -and -not $text.Contains($IsolateInclude)) { $hazards += "${file}: runs without the hook" }
    }
    foreach ($name in 'ASCS.ahk', 'ASCS.Launcher.ahk', 'data\secrets.ini') {
        if (Test-Path -LiteralPath (Join-Path $folder $name)) { $hazards += "${name}: shouldn't be in a copy" }
    }
    return $hazards
}

function Invoke-IsolateClean {
    $root = Get-IsolateRoot
    $running = @(Get-CimInstance Win32_Process -Filter "Name='AutoHotkey64.exe'" | ForEach-Object { "$($_.CommandLine)" })
    $removed = 0
    foreach ($copy in (Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue)) {
        if (-not (Test-Path -LiteralPath (Join-Path $copy.FullName $IsolateMarker))) { continue }
        if ($running | Where-Object { $_.IndexOf("$($copy.FullName)\", [StringComparison]::OrdinalIgnoreCase) -ge 0 }) { Write-Host "Kept $($copy.FullName): it's running."; continue }
        try { [IO.Directory]::Delete($copy.FullName, $true); $removed++ }
        catch { Write-Host "Couldn't remove $($copy.FullName): $($_.Exception.Message)" }
    }
    Write-Host "Removed $removed isolated $(if ($removed -eq 1) { 'copy' } else { 'copies' })."
}

function Invoke-Isolate([string[]]$options) {
    $run = $false; $clean = $false; $seconds = 120; $probes = ''
    for ($i = 0; $i -lt $options.Count; $i++) {
        switch ($options[$i]) {
            '--run' { $run = $true }
            '--clean' { $clean = $true }
            '--for' {
                $i++
                if ($i -ge $options.Count -or $options[$i] -notmatch '^\d{1,4}$' -or [int]$options[$i] -lt 1) { Stop-WithError '--for needs a number of seconds, 1 to 9999.' }
                $seconds = [int]$options[$i]
            }
            '--hook' {
                $i++
                if ($i -ge $options.Count) { Stop-WithError '--hook needs an .ahk file.' }
                $probes = $options[$i]
            }
            default { Stop-WithError "isolate doesn't know $($options[$i]). See: maestro help" }
        }
    }
    if ($clean) {
        if ($run -or $probes) { Stop-WithError '--clean takes no other options.' }
        Invoke-IsolateClean
        return
    }
    if ($probes) {
        if (-not (Test-Path -LiteralPath $probes -PathType Leaf) -or $probes -notmatch '\.ahk$') { Stop-WithError "$probes isn't an .ahk file." }
        $probes = (Resolve-Path -LiteralPath $probes).ProviderPath
    }
    $source = Get-HereCheckout
    if (-not (Test-Path -LiteralPath (Join-Path $source 'ASCS.ahk'))) { Stop-WithError "$source has no ASCS.ahk to copy." }
    $hook = Join-Path $PSScriptRoot 'isolate-hook.ahk'
    $version = (Get-VersionSpots $source)['ASCS_Version']
    $root = Get-IsolateRoot
    $base = Join-Path $root "$(if ($version) { $version } else { 'copy' })-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    $copy = $base
    for ($n = 2; Test-Path -LiteralPath $copy; $n++) { $copy = "$base-$n" }
    [IO.Directory]::CreateDirectory($copy) | Out-Null
    $utf8 = [Text.UTF8Encoding]::new($false)
    try {
        [IO.File]::WriteAllText((Join-Path $copy $IsolateMarker), "Made by maestro isolate from $source. maestro isolate --clean deletes it.`r`n")
        foreach ($folder in $IsolateFolders) {
            $from = Join-Path $source $folder
            if (Test-Path -LiteralPath $from) { Copy-Item -LiteralPath $from -Destination (Join-Path $copy $folder) -Recurse }
        }
        foreach ($file in $IsolateFiles) {
            $from = Join-Path $source $file
            if (-not (Test-Path -LiteralPath $from)) { continue }
            $main = $file -eq 'ASCS.ahk'
            $text = ConvertTo-IsolatedScript ([IO.File]::ReadAllText($from)) -Entry -Probes:($main -and [bool]$probes) -Main:$main
            [IO.File]::WriteAllText((Join-Path $copy $(if ($main) { $IsolateMain } else { $file })), $text, $utf8)
        }
        foreach ($item in (Get-ChildItem -LiteralPath $copy -Recurse -File -Filter *.ahk | Where-Object { $_.DirectoryName -ne $copy })) {
            [IO.File]::WriteAllText($item.FullName, (ConvertTo-IsolatedScript ([IO.File]::ReadAllText($item.FullName))), $utf8)
        }
        if ($probes) { [IO.File]::WriteAllText((Join-Path $copy 'isolate-probes.ahk'), (ConvertTo-IsolatedScript ([IO.File]::ReadAllText($probes))), $utf8) }
        $hookText = [regex]::Replace([IO.File]::ReadAllText($hook), '(?m)^(global Isolate_Seconds := )\d+', "`${1}$seconds")
        [IO.File]::WriteAllText((Join-Path $copy 'isolate-hook.ahk'), $hookText, $utf8)
        # A data folder of its own, marked so the title bar says TEST BUILD and backups stay off.
        $data = Join-Path $copy 'data'
        [IO.Directory]::CreateDirectory($data) | Out-Null
        [IO.File]::WriteAllText((Join-Path $data $TestMarker), "Made by maestro isolate.`r`n")

        $hazards = @(Find-IsolationHazards $copy)
        if ($hazards.Count) { throw "The copy could still act outside itself, so it was deleted:`n" + (($hazards | ForEach-Object { "  $_" }) -join "`n") }
        foreach ($file in @($IsolateMain, 'ASCS.DriveProbe.ahk', 'ASCS.HardwareProbe.ahk')) {
            if (-not (Test-Path -LiteralPath (Join-Path $copy $file))) { continue }
            $problem = Test-AhkScriptParse $copy $file
            if ($problem) { throw "The copy's $file doesn't parse, so it was deleted:`n$problem" }
        }
    } catch {
        try { [IO.Directory]::Delete($copy, $true) } catch { }
        Stop-WithError "$($_.Exception.Message)"
    }

    $script = Join-Path $copy $IsolateMain
    Write-Host "Isolated copy of $source"
    Write-Host "  $copy"
    Write-Host "Super is Pause there, Ctrl+Alt+Shift+A is left to your Maestro, and the calendar would use port $IsolatePort."
    Write-Host 'Launches, registry writes, power, mute and audio switches, and file changes outside the copy are written to isolate-log.txt instead.'
    Write-Host "It exits by itself $seconds s after it starts."
    if (-not $run) {
        Write-Host "To run it: `"$AhkExe`" /ErrorStdOut=UTF-8 `"$script`""
        return
    }

    Write-Host ''
    Write-Host "Running it for up to $seconds s..."
    $stdout = Join-Path $copy 'stdout.txt'
    $stderr = Join-Path $copy 'stderr.txt'
    $process = Start-Process $AhkExe -ArgumentList @('/ErrorStdOut=UTF-8', "`"$script`"") -WorkingDirectory $copy -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $null = $process.Handle
    $ended = $process.WaitForExit(($seconds + 30) * 1000)
    if (-not $ended) { $process.Kill() }
    $read = { param($path) for ($try = 0; $try -lt 20; $try++) { try { return @([IO.File]::ReadAllLines($path) | Where-Object { $_ }) } catch { Start-Sleep -Milliseconds 250 } }; @() }
    $log = @(& $read (Join-Path $copy 'isolate-log.txt'))
    $warnings = @(& $read $stdout)
    $errors = @(& $read $stderr)
    Write-Host ''
    Write-Host 'isolate-log.txt:'
    $log | ForEach-Object { Write-Host "  $_" }
    if ($warnings.Count) { Write-Host 'Warnings:'; $warnings | ForEach-Object { Write-Host "  $_" } }
    if ($errors.Count) { Write-Host 'Errors:'; $errors | ForEach-Object { Write-Host "  $_" } }
    $failed = @($log | Where-Object { $_ -match '^\S+\s+\S+\s+error\b' }).Count + $errors.Count
    if (-not $ended) { Write-Host "It didn't exit within $($seconds + 30) s, so it was closed."; $failed++ }
    elseif ($process.ExitCode -ne 0) { Write-Host "It exited with code $($process.ExitCode)."; $failed++ }
    Write-Host ''
    if ($failed) { Write-Host 'Not clean: see above.'; $global:LASTEXITCODE = 1; exit 1 }
    Write-Host 'Ran clean.'
}

# ---- preview

function Invoke-Preview([string[]]$options) {
    $scenes = @(); $sizes = @(); $audit = $false; $list = $false; $out = ''
    for ($i = 0; $i -lt $options.Count; $i++) {
        $option = $options[$i]
        if ($option -eq '--list') { $list = $true }
        elseif ($option -eq '--audit') { $audit = $true }
        elseif ($option -in '--size', '--to') {
            $i++
            if ($i -ge $options.Count) { Stop-WithError "$option needs a value." }
            if ($option -eq '--to') { $out = $options[$i] }
            else {
                foreach ($size in ($options[$i] -split ',')) {
                    if ($size -notmatch '^\d{3,5}x\d{3,5}$') { Stop-WithError "$size isn't a size like 2540x1224." }
                    $sizes += $size
                }
            }
        }
        elseif ($option -like '-*') { Stop-WithError "preview doesn't know $option. See: maestro help" }
        else { $scenes += @($option -split ',' | Where-Object { $_ }) }
    }
    $folder = Get-HereCheckout
    $script = Join-Path $folder 'tests\preview\preview.ps1'
    if (-not (Test-Path -LiteralPath $script)) { Stop-WithError "$folder has no tests\preview\preview.ps1." }
    if ($list) {
        & pwsh -NoProfile -File $script -List
        return
    }
    if (-not $scenes.Count) { Stop-WithError "Name a scene or more, or all. See them with: maestro preview --list" }
    if (-not $out) { $out = Join-Path ([IO.Path]::GetTempPath()) "maestro-preview\$(Get-Date -Format 'yyyyMMdd-HHmmss')" }
    $arguments = @('-OutDir', $out)
    if ($scenes -notcontains 'all') { $arguments += @('-Scenes', ($scenes -join ',')) }
    if ($sizes.Count) { $arguments += @('-Sizes', ($sizes -join ',')) }
    if ($audit) { $arguments += '-Audit' }
    & pwsh -NoProfile -File $script @arguments
    if ($LASTEXITCODE -ne 0) { Stop-WithError 'The preview failed.' }
    Get-ChildItem -LiteralPath $out -File | Where-Object { $_.Extension -in '.png', '.json' } | ForEach-Object { Write-Host $_.FullName }
}

# ---- help

function Invoke-Help {
    Write-Host @'
maestro <command> [options]

  status
      Each checkout's branch and version, what's running and from where,
      whether that code is older than what's on disk, and any errors logged
      since it started.

  check [--quick] [--release]
      The tests, the AutoHotkey parse check and the hidden-character scan, with
      one result, for the checkout you're standing in. It ends with the check
      counts as the README and CHANGELOG write them.
        --quick, -q     Skip the tests
        --release       Also: the version is the same everywhere, the CHANGELOG's
                        newest heading is that version and not "in progress",
                        the README Status line names it, and both files have
                        this run's counts. Says if new files aren't staged.

  new-release <version> [branch]
      Makes a second checkout for a version inside the main folder (2.2.0 goes
      in <main folder>\_2.2) on a new branch off master, feat/v<version>
      unless you name one, and adds the version's "(in progress)" heading to
      its CHANGELOG. Commits nothing.

  bump <version>
      Writes the version everywhere it's kept (the five places status reads),
      in the checkout you're standing in. Never on master. Commits nothing.

  clean [--dry-run] [--yes]
      Removes each second checkout whose branch is merged into master and
      pushed, with its local branch; the branch stays on the remote. Keeps any
      with uncommitted work, a copy of your data, or a build running, and says
      why. Asks first.
        --dry-run, -n   Show what would happen, and change nothing
        --yes, -y       Don't ask

  try [folder]
      Closes Maestro and runs a second checkout (from git worktree) on a copy of
      your data, including its own calendar.
  try --end
      Closes the test build, deletes the copy, and starts your real Maestro.

  backup-data
      Copies your data folder to the backups folder set in Maestro, under
      Preferences > Backups. Keeps every copy from the newest day, one from
      each of the 14 newest days and the first from each of the 6 newest
      months. Each includes your secrets file.

  restore-data
      Lists your backups, newest first.
  restore-data <number or name> [--yes]
      Puts one back, replacing your data folder, after copying your data as it
      is now to the backups folder. Maestro must be closed. Asks first.
        --yes, -y       Don't ask

  cut-release [branch] [--dry-run] [--yes]
      Pushes the branch with the newest commit (or the one named), switches
      to master, fast-forwards master to it, and pushes master. Shows what it
      will do and asks first. Stops with nothing changed if there's uncommitted
      work in either folder, the CHANGELOG still says "in progress", or master
      can't simply move forward.
        --dry-run, -n   Show what would happen, and change nothing
        --yes, -y       Don't ask

  doctor
      Checks what Maestro needs (AutoHotkey v2, the WebView2 Runtime,
      WebViewToo, git, the data folder), what it can use (the desktop DLL,
      Everything, Edge, the calendar server at its pinned version), and the
      sign-in side: maestro.cmd, the scripts that read the startup sounds, the
      sign-in task, the Startup folder against its working copy, and the
      shortcuts. Changes nothing. Says how to fix each problem.

  isolate [--run] [--for <seconds>] [--hook <file.ahk>]
      Makes a copy of the checkout you're standing in that can't act outside
      itself, in the temp folder: an empty data folder, Super on Pause, no
      Ctrl+Alt+Shift+A, the calendar on port 5233, and launches, registry
      writes, power, mute, audio switches and file changes outside the copy
      written to its isolate-log.txt instead. It's checked for anything left,
      and parsed, before it can run, and it exits by itself.
        --run           Run it, wait for it to exit, and show its log
        --for <seconds> How long it runs before it exits (120)
        --hook <file>   An .ahk file of probes, included after the guard; start
                        them with SetTimer, since Maestro isn't set up yet
  isolate --clean
      Deletes the copies isolate made, except any that are running.

  preview <scene,...|all> [--size WxH] [--audit] [--to <folder>]
      Screenshots of the checkout you're standing in, from the preview scenes:
      the real page with stand-in data, in headless Edge. Writes to a new
      folder in the temp folder unless you name one, and lists the files.
        --size WxH      The window size, or several, comma-separated (2540x1224)
        --audit         Also each scene's layout audit, as JSON
  preview --list
      The scenes.

  help
      This list.
'@
}

$Commands = @{
    'status'      = { Invoke-Status }
    'check'       = { Invoke-Check $Rest }
    'try'         = { Invoke-Try $Rest }
    'backup-data' = { Invoke-BackupData }
    'restore-data' = { Invoke-RestoreData $Rest }
    'cut-release' = { Invoke-CutRelease $Rest }
    'new-release' = { Invoke-NewRelease $Rest }
    'bump'        = { Invoke-Bump $Rest }
    'clean'       = { Invoke-Clean $Rest }
    'doctor'      = { Invoke-Doctor $Rest }
    'isolate'     = { Invoke-Isolate $Rest }
    'preview'     = { Invoke-Preview $Rest }
    'help'        = { Invoke-Help }
}

if ($Command -in '--help', '-h', '/?') { $Command = 'help' }
if (-not $Commands.ContainsKey($Command)) { Stop-WithError "Unknown command: $Command. See: maestro help" }
& $Commands[$Command]
