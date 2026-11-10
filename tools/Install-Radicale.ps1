<#
.SYNOPSIS
    Installs the calendar server behind ASCS's Calendar page (1.8.0): Radicale,
    a small open-source CalDAV server, in a private Python environment.

.DESCRIPTION
    - Creates data\radicale\venv (data\ is never committed) with your Python.
    - Installs exactly the files in tools\radicale-requirements.txt: every one
      pinned by version and SHA-256 (checked against PyPI's published digests),
      wheels only (nothing is built or run during install), and nothing that
      isn't listed (--no-deps).
    - Writes data\radicale\config: the server listens on this PC only
      (127.0.0.1:5232), signs in with a password, lets each account see only its
      own calendars, and has no web interface.
    - Creates the "ascs" account with a random 32-character password, kept in
      data\secrets.ini [Calendar] for ASCS; Radicale's user file stores only a
      SHA-512 crypt hash of it. An existing password is kept unless -NewPassword.

    ASCS starts and stops the server itself; nothing is installed system-wide,
    and nothing runs at sign-in on its own.

.PARAMETER Reinstall
    Deletes and recreates the private Python environment (calendars are kept).

.PARAMETER NewPassword
    Replaces the calendar password (calendars are kept).
#>
param([switch]$Reinstall, [switch]$NewPassword)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$Data = Join-Path $Root 'data\radicale'
$Venv = Join-Path $Data 'venv'
$Requirements = Join-Path $PSScriptRoot 'radicale-requirements.txt'
$Secrets = Join-Path $Root 'data\secrets.ini'

function Step($text) { Write-Host "  $text" }

# 1. Python: the pinned files include one built for 64-bit Python 3.14.
$python = (Get-Command python -ErrorAction SilentlyContinue)?.Source
if (-not $python) { throw 'Python was not found. Install Python 3.14 (64-bit) from python.org, then run this again.' }
$version = & $python -I -c "import sys, struct; print('%d.%d %d' % (sys.version_info[0], sys.version_info[1], struct.calcsize('P') * 8))"
if ($version -ne '3.14 64') {
    throw "Found Python $version at $python; the pinned files need 64-bit Python 3.14. (Re-pin tools\radicale-requirements.txt for another version.)"
}
Step "Python $version at $python"

# 2. The private environment.
New-Item -ItemType Directory -Force $Data | Out-Null
if ($Reinstall -and (Test-Path $Venv)) { Remove-Item -LiteralPath $Venv -Recurse -Force }
if (-not (Test-Path (Join-Path $Venv 'Scripts\python.exe'))) {
    Step 'Creating the private Python environment'
    & $python -I -m venv $Venv
    if ($LASTEXITCODE) { throw 'Creating the environment failed.' }
}
$vpython = Join-Path $Venv 'Scripts\python.exe'

# 3. The pinned files, and nothing else.
Step 'Installing Radicale 3.8.3 (pinned, checksums enforced)'
& $vpython -I -m pip install --require-hashes --only-binary=:all: --no-deps --no-cache-dir `
    --disable-pip-version-check --no-input -r $Requirements | Out-Null
if ($LASTEXITCODE) { throw 'Installing failed; nothing was started. See the messages above.' }
$installed = & $vpython -I -c "import radicale; print(radicale.VERSION)"
if ($installed -ne '3.8.3') { throw "Expected Radicale 3.8.3, found '$installed'." }
Step "Radicale $installed installed"

# 4. Configuration (rewritten each run, so it always matches this script).
$collections = Join-Path $Data 'collections'
New-Item -ItemType Directory -Force $collections | Out-Null
$config = @"
# Written by tools\Install-Radicale.ps1; changes here are replaced on reinstall.
[server]
# This PC only. (Phones come later, over the home network with HTTPS.)
hosts = 127.0.0.1:5232
max_connections = 8
max_content_length = 10000000
timeout = 30

[encoding]
request = utf-8
stock = utf-8

[auth]
type = htpasswd
htpasswd_filename = $(Join-Path $Data 'users')
htpasswd_encryption = sha512
delay = 1

[rights]
# Each account sees only its own calendars.
type = owner_only

[storage]
filesystem_folder = $collections

[web]
# No web interface: ASCS manages calendars.
type = none

[logging]
level = warning
"@
Set-Content -LiteralPath (Join-Path $Data 'config') $config -Encoding utf8
Step 'Configuration written (127.0.0.1:5232, password required, owner-only, no web interface)'

# 5. The account. The password is passed on standard input, never on a command line.
function Read-IniValue($path, $section, $key) {
    if (-not (Test-Path $path)) { return '' }
    $in = $false
    foreach ($line in Get-Content -LiteralPath $path) {
        if ($line -match '^\s*\[(.+)\]\s*$') { $in = $Matches[1] -eq $section; continue }
        if ($in -and $line -match "^\s*$([regex]::Escape($key))\s*=\s*(.*)$") { return $Matches[1].Trim() }
    }
    return ''
}
function Write-IniSection($path, $section, [System.Collections.Specialized.OrderedDictionary]$values) {
    $lines = if (Test-Path $path) { @(Get-Content -LiteralPath $path) } else { @() }
    $out = New-Object System.Collections.Generic.List[string]
    $skip = $false
    foreach ($line in $lines) {
        if ($line -match '^\s*\[(.+)\]\s*$') { $skip = $Matches[1] -eq $section }
        if (-not $skip) { $out.Add($line) }
    }
    while ($out.Count -and $out[$out.Count - 1].Trim() -eq '') { $out.RemoveAt($out.Count - 1) }
    if ($out.Count) { $out.Add('') }
    $out.Add("[$section]")
    foreach ($k in $values.Keys) { $out.Add("$k=$($values[$k])") }
    Set-Content -LiteralPath $path $out -Encoding utf8
}

$password = Read-IniValue $Secrets 'Calendar' 'Password'
if ($NewPassword -or $password.Length -lt 24) {
    $bytes = [byte[]]::new(24)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $password = [Convert]::ToBase64String($bytes).Replace('+', 'A').Replace('/', 'B').Replace('=', '')
    Write-IniSection $Secrets 'Calendar' ([ordered]@{ User = 'ascs'; Password = $password })
    Step 'New calendar password saved in data\secrets.ini [Calendar]'
} else {
    Step 'Keeping the existing calendar password'
}
$hash = $password | & $vpython -I -c "import sys; from passlib.hash import sha512_crypt; print(sha512_crypt.hash(sys.stdin.read().strip()))"
if ($LASTEXITCODE -or $hash -notmatch '^\$6\$') { throw 'Hashing the password failed.' }
Set-Content -LiteralPath (Join-Path $Data 'users') "ascs:$hash" -Encoding ascii
Step 'Account "ascs" written (only a SHA-512 crypt hash is stored)'

Write-Host ''
Write-Host 'Done. Reload Maestro (Ctrl+Alt+Shift+A); it starts the calendar server itself.'
