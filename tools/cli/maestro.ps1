# The launcher behind maestro.cmd (2.7.1), installed beside it in C:\Scripts:
# maestro <command> [options]. Keep this file ASCII and small; it changes
# rarely, and `maestro doctor` says when the installed copy differs from this.
#
# It runs the newest copy of the command line (tools\cli\Maestro-Cli.ps1): a
# version's checkout newer than the main folder's version, by its folder name
# (_2.7.1 is 2.7.1, _2.8 is 2.8.0), else the main folder's. While a release is
# being made the main folder is a release behind, and its command line would
# judge the new release by old rules. A copy that doesn't parse is passed over,
# with a warning. The command line itself hands check, bump and commit-release
# to an older checkout's own copy when one is named.
$ErrorActionPreference = 'Stop'
$main = if ($env:MAESTRO_MAIN) { $env:MAESTRO_MAIN } else { 'C:\Maestro' }
$cliPath = 'tools\cli\Maestro-Cli.ps1'

function Get-MainVersion {
    $script = Join-Path $main 'ASCS.ahk'
    if (Test-Path -LiteralPath $script) {
        $found = [regex]::Match([IO.File]::ReadAllText($script), 'ASCS_Version := "(\d+\.\d+\.\d+)"')
        if ($found.Success) { return [version]$found.Groups[1].Value }
    }
    return [version]'0.0.0'
}

function Test-Parses([string]$path) {
    $tokens = $null; $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors) | Out-Null
    return -not $errors.Count
}

$newest = Get-MainVersion
$chosen = Join-Path $main $cliPath
# A version's checkout: a git worktree (it has a .git file) named _X.Y or _X.Y.Z.
$checkouts = @(Get-ChildItem -LiteralPath $main -Directory -Filter '_*' -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^_(\d+\.\d+)(\.\d+)?$' -and (Test-Path -LiteralPath (Join-Path $_.FullName '.git')) } |
    ForEach-Object {
        $name = $_.Name.Substring(1)
        [pscustomobject]@{ Version = [version]$(if ($name.Split('.').Count -eq 2) { "$name.0" } else { $name }); Cli = Join-Path $_.FullName $cliPath }
    } | Sort-Object Version -Descending)
foreach ($checkout in $checkouts) {
    if ($checkout.Version -le $newest) { break }
    if (-not (Test-Path -LiteralPath $checkout.Cli)) { continue }
    if (Test-Parses $checkout.Cli) { $chosen = $checkout.Cli; break }
    [Console]::Error.WriteLine("maestro: the command line in $(Split-Path (Split-Path (Split-Path $checkout.Cli))) has errors, so an older copy runs.")
}

& pwsh -NoLogo -NoProfile -File $chosen @args
exit $LASTEXITCODE
