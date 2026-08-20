param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$sourcePath = (Resolve-Path (Join-Path $repositoryRoot $Path)).Path
$relativePath = [System.IO.Path]::GetRelativePath($repositoryRoot, $sourcePath)

if ($relativePath.StartsWith('..')) {
  throw "Backup source must be inside the repository: $sourcePath"
}

$backupRoot = Join-Path $PSScriptRoot 'files'
$backupPath = Join-Path $backupRoot $relativePath
if (Test-Path -LiteralPath $backupPath) {
  throw "An audit backup already exists for $relativePath"
}

$backupDirectory = Split-Path -Parent $backupPath
New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
Copy-Item -LiteralPath $sourcePath -Destination $backupPath

$sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourcePath).Hash.ToLowerInvariant()
$backupHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $backupPath).Hash.ToLowerInvariant()
if ($sourceHash -ne $backupHash) {
  throw "Backup checksum mismatch for $relativePath"
}

$timestamp = [DateTime]::UtcNow.ToString('o')
$manifest = Join-Path $PSScriptRoot 'manifest.tsv'
Add-Content -LiteralPath $manifest -Encoding utf8 -Value "$relativePath`t$timestamp`t$sourceHash`t$backupHash"
Write-Output "$relativePath`t$sourceHash"

