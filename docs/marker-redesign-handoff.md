# Marker-Redesign — Handoff

> **Temporäres Handoff-Doc** aus einer Claude-Code-Design-Session (Kartenmarker).
> Fokus: **Variante B (Squircle-Bubble)** als neues statisches Marker-Design **+ Living Aura** als animierte Wow-Ebene.
> Enthält bewusst die harten Constraints, damit sie nicht neu entdeckt werden müssen. Nach Übernahme löschbar.

---

## Ausgangslage (warum die Marker sind, wie sie sind)

- Aktuelle Marker (`AvatarMarker`, `ClusterMarker`, `JourneyAvatarMarker`) werden **off-screen zu PNG-Snapshots gerendert** (`react-native-view-shot`) und via `<Marker image={{ uri }}>` auf die Karte gelegt.
- Grund: react-native-maps **clippt custom Marker-Views auf Android/Fabric** (New Architecture ist SDK-54-Default). Details + Workaround in `src/features/map/components/markerCapture.tsx`.
- **Konsequenz, die alles bestimmt:** statische Marker funktionieren gut, aber **Animation *im* Marker geht nicht** — sie bräuchte pro Frame ein Re-Capture (`tracksViewChanges`), was genau der teure/kaputte Pfad ist.

Merksatz: **B lässt sich in der bestehenden PNG-Pipeline umsetzen. Living Aura NICHT — die braucht den Overlay-Layer (siehe unten).**

---

## Ziel 1 — Variante B: Squircle-Bubble (statisch)

Ersetzt das aktuelle Kreis-Design. Passt in die **bestehende PNG-Pipeline**, kein Architektur-Umbau nötig.

**Design-Intent:** Snap/Zenly-Sprache, warm übersetzt. Klare Trennung von *wer* (Avatar), *was* (Kategorie) und *Status* (Modus). Ruhiger als heute (weniger gestapeltes Chrome).

**Spec:**
- **Form:** Squircle (abgerundetes Quadrat, ~`borderRadius: 33–36%`) statt perfektem Kreis. Größe ~60 px wie heute.
- **Tail/Anchor:** kleiner Zipfel unten (rotiertes Quadrat) → Marker zeigt auf einen *genauen* Punkt am Boden. **Das ist der wichtigste Modernitäts-Gewinn** gegenüber dem schwebenden Kreis.
- **Ring = Status:** dünner Ring (2 px) in Modus-Farbe **statt** des heutigen lauten 3-px-Rings. Bei Modus `now` wird der Ring zum **Countdown** — nutzt die bestehende Logik `countdownBucket` (`utils/countdown.ts`, quantisiert auf 8 Steps, damit nur bei Step-Wechsel neu gecaptured wird).
- **Kategorie-Coin:** kleine farbige „Münze" mit Icon oben rechts, überlappt die Bubble (zeigt das *Was*). Icon aus `activityCategories`/`categoryMeta`.
- **Gruppen:** **überlappender Avatar-Stack** (`marginLeft: -12`, weiße Ringe, „+N"-Chip) statt des heutigen 2×2-Grids (das wird bei der Größe matschig — steht so im Code-Kommentar).
- **Unread-Badge:** bleibt wie heute (rot `#FF3B30`, messenger-style, oben rechts) — gewinnt visuell gegen den Kategorie-Coin.
- **Tiefe:** ein weicher Schatten. Halo + Ground-Shadow + Ring + Glow **nicht** stapeln (heute zu viel pro Marker).

---

## Ziel 2 — Living Aura (animierte Wow-Ebene)

Der „Herzschlag": aktive Menschen und `now`-Aktivitäten **atmen** und senden einen weichen Herzschlag aus. Am stärksten on-brand (die App lebt von Präsenz + Freunden) und echoed die Lebendigkeit des Logos.

**Effekt:** atmender Radial-Glow (langsames scale/opacity-Breathing) + 1–2 expandierende Herzschlag-Ringe in Modus-Farbe hinter der Bubble.

**Wichtig — Scope/Kosten:** **nur** auf den Markern animieren, die Aufmerksamkeit verdienen: `now` / ausgewählt / on-screen. Der Rest bleibt eingefroren-still. Plus `prefers-reduced-motion` + Low-Power-Fallback. Dauer-Animation auf allen Markern = GPU/Akku.

**Erfordert den Overlay-Layer** — kann nicht als PNG-Marker laufen.

---

## Umsetzung: Overlay-Layer (für Living Aura zwingend)

**Kernidee:** Marker-Flair **nicht** als `<Marker>`-Kind rendern, sondern als absolut positionierte Ebene **ÜBER** der `<MapView>` — idealerweise **ein** Skia-`<Canvas>`, das die Effekte zeichnet. Weil der native `<Marker>`-View-Pfad nie angefasst wird, **ist der Fabric-Snapshot-Bug strukturell weg**. Skia + Reanimated sind bereits im Stack (Muster: `src/features/branding/components/TogetherSkiaAnimatedIcon.tsx` — morpht einen Skia-Path pro Frame über eine Reanimated-`progress`-Value).

**Projektion lat/lng → Screen-XY (verifiziert in react-native-maps 1.20.1):**
- `mapRef.pointForCoordinate(latLng): Promise<Point>` — existiert öffentlich (`node_modules/react-native-maps/lib/MapView.d.ts`). Für **wenige** Punkte (Hybrid, s. u.) völlig ausreichend, aktualisiert bei Region-Settle + Timer.
- Für **viele** Marker / 60 fps während des Pannens: Web-Mercator-Projektion selbst auf dem **Reanimated-UI-Thread** aus `getCamera()` (Center + Zoom + Viewport) rechnen — kein async Bridge-Call pro Frame.

**Harte Risiken (bitte einplanen, nicht überraschen lassen):**
1. **Pan/Zoom-Sync.** Die native Karte bewegt sich auf eigener Zeitachse; das Overlay muss exakt folgen, sonst „schwimmen" die Marker beim Wischen. Pragmatischer Kompromiss: **Pixel-Animation während einer aktiven Geste einfrieren**, bei Loslassen neu setzen.
2. **Touch/Hit-Testing.** Ein Canvas über der Karte fängt Berührungen ab. Pan/Zoom muss weiter zur Karte durch, Marker-Taps müssen registrieren (via `pointerEvents` / transparente Hit-Ebene / gesture-handler).

**Empfohlener Weg — HYBRID (nicht Big-Bang):**
- PNG-Marker als **Basis behalten** (funktioniert, löst den Bug).
- Dünnes Skia-Overlay **nur für die Aura hinter `selected`/`now`-Markern**. Wenige Punkte → einfacher `pointForCoordinate` reicht.
- ~80 % Wow für ~20 % Risiko, ohne die funktionierende Karte zu gefährden.
- **De-Risking-Schritt zuerst:** Aura hinter dem *einen* selektierten Marker prototypen — genau dort (Pan-Sync an einem Punkt) beißt die Realität. Klebt das sauber, trägt der Rest.

---

## Referenzdateien

| Datei | Wofür |
|---|---|
| `src/features/map/components/AvatarMarker.tsx` | aktuelles Solo/Gruppen-Design |
| `src/features/map/components/ClusterMarker.tsx` | Cluster (2×2-Grid, 68 px) |
| `src/features/map/components/JourneyAvatarMarker.tsx` | Journey/Heimweg-Marker (54 px) |
| `src/features/map/components/markerCapture.tsx` | **PNG-Snapshot-Workaround — warum Animation im Marker nicht geht** |
| `src/features/map/components/MapCanvas.tsx` | `MapView`, `mapRef`, `<Marker image>`, Region-Handling |
| `src/features/map/utils/markerStyles.ts` | Modus-Farben |
| `src/features/map/utils/countdown.ts` | `countdownBucket` (8-Step-Quantisierung) |
| `src/features/branding/components/TogetherSkiaAnimatedIcon.tsx` | Skia + Reanimated Muster (fürs Overlay) |

## Werte aus dem Code (für konsistente Umsetzung)

- Ink `#14211C`, warme Fläche `#EFEAE1`, Unread `#FF3B30`.
- Modus-Farben: `open` `rgb(110,139,247)`, `soon` `rgb(224,162,62)`, `now` `rgb(65,192,141)`.
- Größen heute: AvatarMarker-Kreis 60 px / Border 3 px, Cluster 68 px, Journey 54 px.
- `countdownBucket` quantisiert den `now`-Rest auf 8 Steps → Re-Capture nur bei Step-Wechsel (dieselbe Sparlogik in B übernehmen).

---

## Visueller Mockup (Code)

`docs/marker-board.html` — self-contained HTML/CSS, öffnet direkt im Browser (alle Varianten inkl. animiertem Wow-Tier). Relevante Anker im `<style>`:

- **Variante B (Squircle-Bubble):** `.pinB`, `.pinB__ring`, `.pinB__ring--open/--soon/--now`, `.pinB__bubble`, `.pinB__tail`, `.coin`; Gruppen-Stack: `.stack` / `.pinB--group`.
- **Living Aura:** `.aura`, `.breathe`, `.hb1` / `.hb2`, `@keyframes hb`, `@keyframes breathe` (Herzschlag + Atmen). Reduced-Motion-Guard am Ende des `<style>`.

> Hinweis: Die Datei ist der Mockup-Body (Farben/Maße/Struktur als CSS-Referenz), **nicht** der RN-Zielcode — die echten Marker sind React-Native-Komponenten (siehe Referenzdateien oben).
