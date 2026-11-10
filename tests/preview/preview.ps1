<#
    Headless previews of the real page with fake data (2.0.0). Nothing here talks
    to the running ASCS or reads the data folder.
      pwsh -File tests\preview\preview.ps1 -OutDir <folder> [-Scenes home,games] [-Sizes 2540x1360,3440x1395] [-TextSize 120] [-Audit]
    Writes <scene>-<width>.png, and with -Audit <scene>-<width>.json.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$OutDir,
    [string[]]$Scenes = @(),
    [string[]]$Sizes = @('2540x1360'),
    [switch]$Audit,
    [int]$TextSize = 100,
    [int]$Parallel = 6
)
$ErrorActionPreference = 'Stop'
# pwsh -File passes a list as one comma-separated string.
$Scenes = @($Scenes -split ',' | Where-Object { $_ })
$Sizes = @($Sizes -split ',' | Where-Object { $_ })
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
[IO.Directory]::CreateDirectory($OutDir) | Out-Null
$utf8 = [Text.UTF8Encoding]::new($false)

$copy = Join-Path ([IO.Path]::GetTempPath()) "ascs-preview-$PID"
Copy-Item -LiteralPath (Join-Path $root 'frontend') -Destination $copy -Recurse
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'scenes.js') -Destination $copy
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'audit.js') -Destination $copy
$page = Join-Path $copy 'index.html'
$text = [IO.File]::ReadAllText($page)
$text = $text -replace '(?is)<meta[^>]*Content-Security-Policy[^>]*>', ''
$text = $text.Replace('<head>', '<head><script>window.chrome={webview:{postMessage(){return true},addEventListener(){},removeEventListener(){}}};</script>')
$text = $text.Replace('</body>', '<script src="scenes.js"></script><script src="audit.js"></script></body>')
[IO.File]::WriteAllText($page, $text, $utf8)
if (-not $Scenes.Count) {
    $source = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'scenes.js'))
    $block = $source.Substring($source.IndexOf('return {'))
    $Scenes = [regex]::Matches($block, '(?m)^\s{8}"?([a-z][a-z-]*)"?:') | ForEach-Object { $_.Groups[1].Value }
}

$jobs = [Collections.Generic.List[object]]::new()
foreach ($size in $Sizes) {
    foreach ($scene in $Scenes) {
        $width = $size.Split('x')[0]
        $jobs.Add(@{ scene = $scene; size = $size; kind = 'shot'; out = Join-Path $OutDir "$scene-$width.png" })
        if ($Audit) { $jobs.Add(@{ scene = $scene; size = $size; kind = 'dump'; out = Join-Path $OutDir "$scene-$width.json" }) }
    }
}

$running = [Collections.Generic.List[object]]::new()
$slot = 0
function Complete-Job($job) {
    if ($job.kind -eq 'dump') {
        # Edge can still hold the file for a moment after it exits.
        $html = ''
        for ($try = 0; $try -lt 40; $try++) {
            try { $html = [IO.File]::ReadAllText($job.temp); if ($html.Contains('auditResult')) { break } } catch { }
            Start-Sleep -Milliseconds 250
        }
        $match = [regex]::Match($html, '<pre id="auditResult"[^>]*>([\s\S]*?)</pre>')
        $value = if ($match.Success) { [Net.WebUtility]::HtmlDecode($match.Groups[1].Value) } else { '{"scene":"' + $job.scene + '","failed":true}' }
        [IO.File]::WriteAllText($job.out, $value, $utf8)
        try { [IO.File]::Delete($job.temp) } catch { }
    }
}
foreach ($job in $jobs) {
    while ($running.Count -ge $Parallel) {
        foreach ($item in @($running)) {
            if ($item.process.HasExited) { Complete-Job $item.job; [void]$running.Remove($item) }
            elseif (((Get-Date) - $item.started).TotalSeconds -gt 90) { $item.process.Kill(); [void]$running.Remove($item); "timed out: $($item.job.scene)" }
        }
        Start-Sleep -Milliseconds 100
    }
    $slot = ($slot + 1) % $Parallel
    $url = 'file:///' + ($page -replace '\\', '/') + "?scene=$($job.scene)&textsize=$TextSize"
    $arguments = @('--headless=new', '--disable-gpu', '--allow-file-access-from-files', "--user-data-dir=`"$copy-edge$slot`"", "--window-size=$($job.size.Replace('x', ','))", '--force-device-scale-factor=1', '--virtual-time-budget=3500')
    if ($job.kind -eq 'shot') {
        $arguments += @("--screenshot=`"$($job.out)`"", "`"$url`"")
        $process = Start-Process $edge -ArgumentList $arguments -PassThru -WindowStyle Hidden
    } else {
        $job.temp = "$($job.out).dom"
        $arguments += @('--dump-dom', "`"$url`"")
        $process = Start-Process $edge -ArgumentList $arguments -PassThru -WindowStyle Hidden -RedirectStandardOutput $job.temp -RedirectStandardError "$($job.out).err"
    }
    $running.Add(@{ process = $process; job = $job; started = Get-Date })
}
foreach ($item in @($running)) {
    if (-not $item.process.WaitForExit(90000)) { $item.process.Kill(); "timed out: $($item.job.scene)" } else { Complete-Job $item.job }
}
Start-Sleep -Milliseconds 500
Get-ChildItem -LiteralPath $OutDir -Filter '*.err' | ForEach-Object { [IO.File]::Delete($_.FullName) }
[IO.Directory]::Delete($copy, $true)
0..($Parallel - 1) | ForEach-Object { try { [IO.Directory]::Delete("$copy-edge$_", $true) } catch { } }
"$($jobs.Count) outputs in $OutDir"
