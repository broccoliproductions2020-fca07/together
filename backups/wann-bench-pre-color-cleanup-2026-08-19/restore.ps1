# Rollt die Farb-/Schrift-Bereinigung der Wann-Bench zurueck (19. August 2026).
# Siehe MANIFEST.md fuer den Umfang.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $here '..\..')

Copy-Item (Join-Path $here 'ScheduleBench.tsx.bak') `
  (Join-Path $root 'src\features\activities\components\benches\ScheduleBench.tsx') -Force
Copy-Item (Join-Path $here 'DayStrip.tsx.bak') `
  (Join-Path $root 'src\features\activities\components\DayStrip.tsx') -Force

Write-Host 'Wann-Bench zurueckgesetzt. Danach: npm run typecheck'
