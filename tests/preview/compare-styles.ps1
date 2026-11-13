<#
    Compares two preview.ps1 -Styles runs (2.2.0) and lists every element whose
    computed style differs, by scene. Nothing listed means the change was
    invisible in every scene.
      pwsh -File tests\preview\compare-styles.ps1 -Before <folder> -After <folder>
    styledump.js settles what moves on its own before reading (fonts, the
    keymap's fitted labels, the clock, focus, the tab marker); the calendar's
    line for now still moves with the clock, so it is left out. A tab strip whose
    marker was placed a moment later in one run can still differ: run that scene
    again, or compare the same stylesheets twice to see it.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Before,
    [Parameter(Mandatory)][string]$After,
    [int]$Show = 12
)
$ErrorActionPreference = 'Stop'
function Read-Styles([string]$file) {
    $map = @{}
    foreach ($line in [IO.File]::ReadAllLines($file)) {
        $space = $line.IndexOf(' ')
        if ($space -gt 0) { $map[$line.Substring($space + 1)] = $line.Substring(0, $space) }
    }
    $map
}
$scenes = 0
$failed = 0
foreach ($file in Get-ChildItem -LiteralPath $Before -Filter '*.styles.txt' | Sort-Object Name) {
    $other = Join-Path $After $file.Name
    if (-not (Test-Path -LiteralPath $other)) { "$($file.Name): missing after"; $failed++; continue }
    $a = Read-Styles $file.FullName
    $b = Read-Styles $other
    if (-not $a.Count -or -not $b.Count) { "$($file.Name): empty dump"; $failed++; continue }
    $scenes++
    $changed = @($a.Keys | Where-Object { $b.ContainsKey($_) -and $a[$_] -ne $b[$_] -and $_ -notmatch '>i\[\d+\]$' })
    $gone = @($a.Keys | Where-Object { -not $b.ContainsKey($_) })
    $new = @($b.Keys | Where-Object { -not $a.ContainsKey($_) })
    if ($changed.Count -or $gone.Count -or $new.Count) {
        $failed++
        "$($file.Name): $($changed.Count) changed, $($gone.Count) gone, $($new.Count) new"
        $changed + ($gone | ForEach-Object { "gone: $_" }) + ($new | ForEach-Object { "new: $_" }) | Select-Object -First $Show | ForEach-Object { "    $_" }
    }
}
"$scenes scenes compared, $failed differ"
