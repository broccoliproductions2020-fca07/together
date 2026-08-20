# Backup — Activity-Composer vor dem Accordion-Umbau

**Erstellt:** 2026-08-17, 14:05 Uhr (lokale Zeit, Europe/Berlin)
**Anlass:** Umbau der horizontalen Tab-Leiste (`ComposerTabs`) auf eine vertikale
Accordion-Liste (`ComposerAccordion`). Dieser Snapshot hält den Stand
unmittelbar davor fest.

Das Arbeitsverzeichnis ist bewusst nicht sauber; dieser Snapshot ist deshalb die
einzige verlässliche Rückfallebene für diese drei Dateien. Er ist von Git
unabhängig — `restore.ps1` benutzt keinerlei Git-Befehle.

## Gesicherte Dateien

| Quelle (repo-relativ) | Backup-Datei | Bytes | SHA-256 |
| --- | --- | --- | --- |
| `src/features/activities/components/ActivityComposerSheet.tsx` | `ActivityComposerSheet.tsx.bak` | 44431 | `96BCB1E17C9FF3C1959C7520B0CB8ED6F7B7CD61502D72CBE5E93AF1E8ED1B8E` |
| `src/features/activities/components/ComposerTabs.tsx` | `ComposerTabs.tsx.bak` | 16102 | `4C16081768C43C5369239C580DD59789B90237A78CFCB7494173DBB2F51A542C` |
| `src/shared/utils/semanticColors.ts` | `semanticColors.ts.bak` | 947 | `9F2D1A8BACECADE236009ACD63D32C1E43E8F7E3C0D551764CD8D7EC100093A6` |

Absolute Quellpfade zum Zeitpunkt der Sicherung:

- `D:\Dokumente\myapp\src\features\activities\components\ActivityComposerSheet.tsx`
- `D:\Dokumente\myapp\src\features\activities\components\ComposerTabs.tsx`
- `D:\Dokumente\myapp\src\shared\utils\semanticColors.ts`

Backup-Ordner: `D:\Dokumente\myapp\backups\activity-composer-pre-accordion-2026-08-17`

**Verifikation:** Jede `.bak`-Datei wurde nach dem Kopieren gegen ihre Quelle
geprüft — SHA-256 **und** Dateigröße stimmen bei allen drei überein
(bytegleich).

## Wiederherstellung

```powershell
cd D:\Dokumente\myapp\backups\activity-composer-pre-accordion-2026-08-17
.\restore.ps1
```

`restore.ps1` schreibt die drei Dateien exakt an ihre Quellpfade zurück und
entfernt zusätzlich **ausschließlich** die beim Umbau neu angelegte Datei
`src/features/activities/components/ComposerAccordion.tsx`, falls vorhanden.
Es fasst keine anderen Dateien an, löscht keine Verzeichnisse und ruft kein Git
auf. Mit `-WhatIf` lässt sich vorab anzeigen, was passieren würde.

Nach dem Restore prüft das Skript selbst per SHA-256, ob die zurückgeschriebenen
Dateien mit dem Backup übereinstimmen, und meldet das Ergebnis pro Datei.
