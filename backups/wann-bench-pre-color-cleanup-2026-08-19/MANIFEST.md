# Wann-Bench vor der Farb-/Schrift-Bereinigung (19. August 2026)

Stand unmittelbar vor der Entzerrung der Akzentfarbe in der Wann-Bench
(internalVersion 0.4.06, entspricht dem OTA "Neuer Zeitpicker ist Standard").

Was danach geaendert wurde:

- `ScheduleBench.tsx`
  - die beiden Angebots-Karten (`styles.offer`) verlieren ihre Akzent-Toenung
    (Rand, Fuellung, Icon-Kreis, Icon, Chevron) und werden neutral
  - `summaryValue` verliert die Akzentfarbe (wird weiss) und das
    einmalige `letterSpacing: -0.2`
  - `summaryLead` von FONT.semibold auf FONT.medium
  - `offerTitle` von FONT.bold auf FONT.semibold
- `DayStrip.tsx`
  - der gewaehlte Tag-Chip wird neutral-hell statt akzentfarben

Grund: neun Elemente auf einer Seite trugen dieselbe Modusfarbe, wodurch sie
aufhoerte "Modus" zu bedeuten. Nach der Aenderung traegt im Inhalt nur noch der
Balken den Akzent.

## Zurueckrollen

    cp backups/wann-bench-pre-color-cleanup-2026-08-19/ScheduleBench.tsx \
       src/features/activities/components/benches/ScheduleBench.tsx
    cp backups/wann-bench-pre-color-cleanup-2026-08-19/DayStrip.tsx \
       src/features/activities/components/DayStrip.tsx

Einzelne Teile lassen sich auch gezielt zurueckholen, die Aenderungen sind
voneinander unabhaengig.
