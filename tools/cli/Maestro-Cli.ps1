# The Maestro command line, run through C:\Scripts\maestro.cmd: maestro <command> [options]
# To add a command: write a function, then add it to $Commands below.
# Keep this file ASCII. Only `try` starts or closes Maestro, and it never commits.
# Only `restore-data` changes the data folder, and only with Maestro closed.
[CmdletBinding()]
param(
    [Parameter(Position = 0)][string]$Command = 'help',
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest = @()
)
$ErrorActionPreference = 'Stop'
$Repo = if ($env:ASCS_REPO) { $env:ASCS_REPO } else { 'C:\ASCS' }
$Repo = [IO.Path]::GetFullPath($Repo).TrimEnd('\')
$Main = 'master'
$AhkExe = Join-Path $env:ProgramFiles 'AutoHotkey\v2\AutoHotkey64.exe'
$StatusFile = 'backup-status.ini'
$TestMarker = 'test-build.txt'
# Rebuilt by WebView2, so never worth copying.
$CacheFolders = @('Cache', 'Code Cache', 'GPUCache', 'DawnWebGPUCache', 'DawnGraphiteCache', 'GrShaderCache', 'ShaderCache', 'component_crx_cache')

function Stop-WithError([string]$message) {
    [Console]::Error.WriteLine("maestro: $message")
    exit 1
}

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

# The checkout you're standing in, or the main one.
function Get-HereCheckout {
    $here = (Get-Location).ProviderPath.TrimEnd('\')
    foreach ($checkout in (Get-Checkouts)) {
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
# file. True when every file copied. -Mirror also removes what the copy lacks.
function Copy-DataFolder([string]$from, [string]$to, [switch]$Mirror) {
    $mode = if ($Mirror) { '/MIR' } else { '/E' }
    $arguments = @($from, $to, $mode, '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/XF', $StatusFile, '/XD') +
        $CacheFolders + @(Join-Path $from 'WebView2\EBWebView\Default\Network')
    & robocopy @arguments | Out-Null
    $code = $LASTEXITCODE
    $global:LASTEXITCODE = 0
    return $code -lt 8
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

function Invoke-Check([string[]]$options) {
    $quick = $false
    foreach ($option in $options) {
        if ($option -in '--quick', '-q') { $quick = $true }
        else { Stop-WithError "check doesn't know $option. See: maestro help" }
    }
    $folder = Get-HereCheckout
    Write-Host "Checking $folder"
    $problems = 0

    if ($quick) {
        Write-Host 'Tests:      skipped (--quick)'
    } else {
        & pwsh -NoProfile -File (Join-Path $folder 'tests\run-tests.ps1')
        if ($LASTEXITCODE -ne 0) { $problems++; Write-Host 'Tests:      FAILED' } else { Write-Host 'Tests:      passed' }
    }

    $parse = Test-AhkParse $folder
    if ($parse) { $problems++; Write-Host "Parse:      FAILED`n$parse" } else { Write-Host 'Parse:      passed' }

    $hidden = @(Find-HiddenCharacters $folder)
    if ($hidden.Count) { $problems++; Write-Host "Hidden:     FOUND in $($hidden -join ', ')" } else { Write-Host 'Hidden:     none' }

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
    $read = { param($file) $path = Join-Path $folder $file; if (Test-Path -LiteralPath $path) { [IO.File]::ReadAllText($path) } else { '' } }
    $ahk = & $read 'ASCS.ahk'
    $spots = [ordered]@{
        'ASCS.ahk header'  = [regex]::Match($ahk, '(?m)^; Version ([\d.]+)').Groups[1].Value
        'ASCS_Version'     = [regex]::Match($ahk, 'ASCS_Version := "([\d.]+)"').Groups[1].Value
        'sidebar'          = [regex]::Match((& $read 'frontend\index.html'), 'Maestro <span>([\d.]+)</span>').Groups[1].Value
        'README'           = [regex]::Match((& $read 'README.md'), '\*\*Version:\*\* ([\d.]+)').Groups[1].Value
    }
    $prodIds = @([regex]::Matches((& $read 'frontend\calendar.js'), '//ASCS ([\d.]+)//EN') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
    $spots['calendar'] = $prodIds -join '/'
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
        if (-not (Copy-DataFolder $realData $targetData)) { throw 'Some of your data could not be copied.' }
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
    if (-not (Copy-DataFolder $source $partial)) {
        try { [IO.Directory]::Delete($partial, $true) } catch { }
        throw "Some files couldn't be copied to $backups, so no backup was made."
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
    if (-not (Copy-DataFolder $chosen.Path $data -Mirror)) {
        $where = if ($saved) { " Your data from before is in $saved." } else { '' }
        Stop-WithError "Some files couldn't be put back, so your data may be part old and part new.$where"
    }
    try { Remove-ExpiredBackups $backups | Out-Null } catch { }
    Write-Host "Restored the data from $($chosen.When). Start Maestro again to use it."
}

# ---- help

function Invoke-Help {
    Write-Host @'
maestro <command> [options]

  status
      Each checkout's branch and version, what's running and from where,
      whether that code is older than what's on disk, and any errors logged
      since it started.

  check [--quick]
      The tests, the AutoHotkey parse check and the hidden-character scan, with
      one result, for the checkout you're standing in. --quick skips the tests.

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
    'help'        = { Invoke-Help }
}

if ($Command -in '--help', '-h', '/?') { $Command = 'help' }
if (-not $Commands.ContainsKey($Command)) { Stop-WithError "Unknown command: $Command. See: maestro help" }
& $Commands[$Command]
