<#
    Makes the start screen's art (2.2.0): frontend\assets\start-screen\, which
    AutoHotkey shows on the first show after Maestro starts.
      pwsh -File tests\preview\start-screen.ps1
    Renders the preview scenes start-screen-arm-0 to -40 (the arm 0 to 40 degrees
    left of its rest), finds the box the arm moves in, and cuts the art into the
    four still pieces around that box and the box once for each degree, so
    AutoHotkey swings the arm by changing one small picture, and no two
    pictures overlap. layout.ini says where each piece goes.
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
# Grows box (left, top, right, bottom) to hold every pixel that differs between two images.
Add-Type -TypeDefinition @'
public static class StartScreenArt {
    public static void Grow(byte[] a, byte[] b, int stride, int width, int height, int[] box) {
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int at = y * stride + x * 4;
                if (a[at] == b[at] && a[at + 1] == b[at + 1] && a[at + 2] == b[at + 2]) continue;
                if (x < box[0]) box[0] = x;
                if (y < box[1]) box[1] = y;
                if (x > box[2]) box[2] = x;
                if (y > box[3]) box[3] = y;
            }
        }
    }
}
'@
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$out = Join-Path $root 'frontend\assets\start-screen'
$work = Join-Path ([IO.Path]::GetTempPath()) "ascs-start-screen-$PID"
$width, $height, $frames = 1240, 520, 41

& (Join-Path $PSScriptRoot 'preview.ps1') -OutDir $work -Scenes ((0..($frames - 1) | ForEach-Object { "start-screen-arm-$_" }) -join ',') -Sizes '1600x800' | Out-Null
$shots = 0..($frames - 1) | ForEach-Object { [Drawing.Bitmap]::new((Join-Path $work "start-screen-arm-$_-1600.png")) }

try {
    # The art fades to the page's color before its edges, so it meets the window without a seam.
    $page = [Drawing.Color]::FromArgb(255, 0x0D, 0x0E, 0x17)
    foreach ($x in 0..($width - 1)) { foreach ($y in 0, ($height - 1)) { if ($shots[0].GetPixel($x, $y) -ne $page) { throw "The art's edge isn't the page's color at $x, $y." } } }
    foreach ($y in 0..($height - 1)) { foreach ($x in 0, ($width - 1)) { if ($shots[0].GetPixel($x, $y) -ne $page) { throw "The art's edge isn't the page's color at $x, $y." } } }

    # The box the arm moves in: every pixel any angle changes, and a pixel more.
    $rest = $shots[0]

    $data = foreach ($shot in $shots) { $shot.LockBits([Drawing.Rectangle]::new(0, 0, $width, $height), 'ReadOnly', 'Format32bppArgb') }
    try {
        $stride = $data[0].Stride
        $base = [byte[]]::new($stride * $height)
        [Runtime.InteropServices.Marshal]::Copy($data[0].Scan0, $base, 0, $base.Length)
        $other = [byte[]]::new($base.Length)
        $box = [int[]]@($width, $height, -1, -1)
        foreach ($index in 1..($frames - 1)) {
            [Runtime.InteropServices.Marshal]::Copy($data[$index].Scan0, $other, 0, $other.Length)
            [StartScreenArt]::Grow($base, $other, $stride, $width, $height, $box)
        }
        $left, $top, $right, $bottom = $box
    } finally {
        for ($index = 0; $index -lt $frames; $index++) { $shots[$index].UnlockBits($data[$index]) }
    }
    if ($right -lt 0) { throw 'The arm never moved.' }
    $left--; $top--; $right++; $bottom++
    $armWidth, $armHeight = ($right - $left + 1), ($bottom - $top + 1)

    function Save-Piece($bitmap, [int]$x, [int]$y, [int]$w, [int]$h, [string]$name) {
        $piece = $bitmap.Clone([Drawing.Rectangle]::new($x, $y, $w, $h), [Drawing.Imaging.PixelFormat]::Format24bppRgb)
        $piece.Save((Join-Path $out $name), [Drawing.Imaging.ImageFormat]::Png)
        $piece.Dispose()
    }
    if (Test-Path -LiteralPath $out) { Get-ChildItem -LiteralPath $out -File | Remove-Item }
    [IO.Directory]::CreateDirectory($out) | Out-Null
    $pieces = [ordered]@{
        top = @(0, 0, $width, $top)
        left = @(0, $top, $left, $armHeight)
        right = @(($right + 1), $top, ($width - $right - 1), $armHeight)
        bottom = @(0, ($bottom + 1), $width, ($height - $bottom - 1))
        arm = @($left, $top, $armWidth, $armHeight)
    }
    foreach ($name in 'top', 'left', 'right', 'bottom') { Save-Piece $rest @($pieces[$name])[0] @($pieces[$name])[1] @($pieces[$name])[2] @($pieces[$name])[3] "$name.png" }
    for ($index = 0; $index -lt $frames; $index++) { Save-Piece $shots[$index] $left $top $armWidth $armHeight ('arm-{0:00}.png' -f $index) }

    $lines = @('; Made by tests\preview\start-screen.ps1: where each piece of the start screen goes,', '; in pixels from the art''s top left. arm-NN.png has the arm NN degrees left of its rest.', '[Art]', "Width=$width", "Height=$height", "Frames=$frames")
    foreach ($name in $pieces.Keys) { $p = $pieces[$name]; $lines += @('', "[$name]", "X=$($p[0])", "Y=$($p[1])", "W=$($p[2])", "H=$($p[3])") }
    [IO.File]::WriteAllLines((Join-Path $out 'layout.ini'), $lines, [Text.UTF8Encoding]::new($false))
    "The arm moves in $armWidth x $armHeight at $left, $top; $($frames + 4) pictures in $out"
} finally {
    $shots | ForEach-Object { $_.Dispose() }
    [IO.Directory]::Delete($work, $true)
}
