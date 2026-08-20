<#
.SYNOPSIS
    Stellt den Activity-Composer-Stand von vor dem Accordion-Umbau wieder her.

.DESCRIPTION
    Schreibt die drei gesicherten Dateien exakt an ihre Quellpfade zurueck und
    entfernt ausschliesslich die beim Umbau neu angelegte Datei
    ComposerAccordion.tsx, falls sie existiert.

    Bewusste Einschraenkungen:
      * Keine Git-Befehle. Das Arbeitsverzeichnis ist absichtlich nicht sauber
        und darf von diesem Skript nicht angefasst werden.
      * Keine breiten Loeschbefehle. Es wird genau EIN Pfad geloescht, und nur
        wenn er eine Datei ist.
      * Es werden keine Verzeichnisse entfernt.

    Das Repo-Wurzelverzeichnis wird aus dem Skriptort abgeleitet
    (backups\<snapshot>\ -> zwei Ebenen hoch), damit das Skript aus dem
    Backup-Ordner heraus funktioniert, unabhaengig vom aktuellen Arbeitspfad.

.PARAMETER WhatIf
    Zeigt nur an, was passieren wuerde.

.EXAMPLE
    .\restore.ps1
.EXAMPLE
    .\restore.ps1 -WhatIf
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param()

$ErrorActionPreference = 'Stop'

$backupDir = $PSScriptRoot
if (-not $backupDir) { $backupDir = (Get-Location).Path }
$repoRoot = Split-Path -Parent (Split-Path -Parent $backupDir)

Write-Host "Backup-Ordner : $backupDir"
Write-Host "Repo-Wurzel   : $repoRoot"
Write-Host ""

# Genau diese drei Dateien, nichts sonst.
$files = @(
    @{ Bak = 'ActivityComposerSheet.tsx.bak'; Rel = 'src\features\activities\components\ActivityComposerSheet.tsx' },
    @{ Bak = 'ComposerTabs.tsx.bak';          Rel = 'src\features\activities\components\ComposerTabs.tsx' },
    @{ Bak = 'semanticColors.ts.bak';         Rel = 'src\shared\utils\semanticColors.ts' }
)

# Die einzige Datei, die der Umbau neu anlegt und die beim Restore verschwinden muss.
$newFileRel = 'src\features\activities\components\ComposerAccordion.tsx'

$failed = 0

foreach ($f in $files) {
    $bakPath = Join-Path $backupDir $f.Bak
    $dstPath = Join-Path $repoRoot $f.Rel

    if (-not (Test-Path -LiteralPath $bakPath -PathType Leaf)) {
        Write-Warning "Backup fehlt, uebersprungen: $bakPath"
        $failed++
        continue
    }

    $dstDir = Split-Path -Parent $dstPath
    if (-not (Test-Path -LiteralPath $dstDir -PathType Container)) {
        Write-Warning "Zielverzeichnis fehlt, uebersprungen: $dstDir"
        $failed++
        continue
    }

    if ($PSCmdlet.ShouldProcess($dstPath, 'Aus Backup wiederherstellen')) {
        Copy-Item -LiteralPath $bakPath -Destination $dstPath -Force

        $hashBak = (Get-FileHash -LiteralPath $bakPath -Algorithm SHA256).Hash
        $hashDst = (Get-FileHash -LiteralPath $dstPath -Algorithm SHA256).Hash
        if ($hashBak -eq $hashDst) {
            Write-Host "OK        $($f.Rel)"
        }
        else {
            Write-Warning "HASH WEICHT AB nach dem Schreiben: $($f.Rel)"
            $failed++
        }
    }
}

# Nur dieser eine Pfad, und nur wenn es wirklich eine Datei ist.
$newFilePath = Join-Path $repoRoot $newFileRel
if (Test-Path -LiteralPath $newFilePath -PathType Leaf) {
    if ($PSCmdlet.ShouldProcess($newFilePath, 'Neue Datei aus dem Umbau entfernen')) {
        Remove-Item -LiteralPath $newFilePath -Force
        Write-Host "ENTFERNT  $newFileRel"
    }
}
else {
    Write-Host "uebersprungen (nicht vorhanden)  $newFileRel"
}

Write-Host ""
if ($failed -eq 0) {
    Write-Host "Restore abgeschlossen. Danach 'npm run typecheck' laufen lassen."
}
else {
    Write-Warning "Restore mit $failed Problem(en) beendet - Meldungen oben pruefen."
    exit 1
}
