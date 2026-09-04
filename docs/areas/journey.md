# Anreise (Journey)

Ausgelagert aus `AGENTS.md`. Lies diese Datei, wenn du an diesem Bereich arbeitest.

---

### Journey / Anreise Focus

**Anreise gibt es NUR für geplante Aktivitäten (August 2026).** Eine als `now` erstellte
Activity hat überhaupt keinen Anreise-Modus — keine Zeile im Sheet, kein Prompt nach dem
Erstellen oder Beitreten, keine Erinnerungs-Push, kein RTDB-Journey-Listener und damit auch
kein Hintergrund-Task. Begründung: `now` heißt „ich bin gerade hier"; es gibt keine Vorlaufzeit,
in der man anreisen könnte, und Hintergrundortung ist der teuerste und sensibelste Pfad der App
— den für den Fall mit dem geringsten Nutzen zu öffnen, ist ein schlechter Tausch.

Die Entscheidung fällt auf dem **gespeicherten** Modus (`plannedMode`, roh aus dem Dokument),
NIE auf dem aufgelösten: `resolveActivityMode` zeigt jede gestartete `soon`-Activity als `now`,
kann also „spontan hier erstellt" nicht von „geplant, läuft jetzt" unterscheiden — und die
zweite braucht ihre Anreise weiterhin, denn zu spät dran zu sein ist genau der Moment, in dem
Leute sehen wollen, dass du kommst. Eine Regel, eine Funktion: `activitySupportsJourney(plannedMode)`
in `src/features/activities/utils/activityMode.ts`, benutzt vom Sheet UND von beiden Prompts;
serverseitig spiegelt `sendJourneyReminders` sie mit `activity.mode === 'now' → continue`.
Unbekannter `plannedMode` heißt „keine Anreise" — der teure Pfad fällt zu, nicht auf.

**Die sofortige Nachfrage („Anreise teilen?") kommt nur beim BEITRETEN, nie beim Erstellen.**
Wer eine Activity anlegt, hat den Ort gerade selbst ausgesucht — die Frage, ob man dorthin
unterwegs ist, hat er mit dem Erstellen schon beantwortet; sie direkt nach dem Tap zu stellen
ist eine Unterbrechung ohne Informationsgewinn. `offerJourneyShareNow` hat deshalb genau EINE
Aufrufstelle: `joinSelectedActivity`. Dem Host geht nichts verloren — die `JourneyShareRow` im
Sheet und die Erinnerungs-Push bleiben. Damit entfiel auch die ganze
`journeyPromptAfterLaunchRef`-Mechanik, die den Prompt bis zum Ende der Wurf-Animation
aufhob, samt `createdDraftJourneyContext`.

**Aktualisierte Produktentscheidung (Juli 2026; ersetzt die folgenden älteren
Foreground-only-Hinweise):** Die explizite Aktion „Anreise teilen“ ist reine
Zustimmung/Registrierung — genau wie beim Antippen der Reminder-Push. Der native
Hintergrunddienst (Akku-/Foreground-Notification-Fußabdruck) startet NICHT sofort,
sondern erst bei T−30, egal ob der Tap 6 h oder 1 h vorher passiert. Ausnahme: Beitritt
zu einer bereits **gestarteten `soon`-Aktivität** — dort ist T−30 schon verstrichen, also wird
sofort scharfgeschaltet (`armBackgroundJourney`, `journeyBackground.ts`). (Früher stand hier
„laufende `now`-Aktivität"; als `now` erstellte Activities haben seit August 2026 gar keine
Anreise mehr, gemeint war immer der gestartete Plan.) Der T−30-Start
läuft zweigleisig: ein data-only lokaler Notification-Trigger (`scheduleArmTrigger`,
best-effort — vom OS im Hintergrund drosselbar) plus ein zuverlässiger Vordergrund-Poll
(`ensureBackgroundWatcherArmed`, alle 15 s + bei App-Aktivierung) als Backstop. Bis T−30
wird ohnehin kein Standort gespeichert oder versendet; erst zwei brauchbare Punkte mit
echter Bewegung erzeugen den ersten RTDB-Live-Punkt, Bewegungsrichtung ist irrelevant.
Android verarbeitet die Aktionsbenachrichtigung im Hintergrund und zeigt dabei seine
Pflichtmeldung. iOS kann diese Aktion nach einem Force-quit nicht garantieren, zeigt bei
Hintergrund-Ortung seinen Standortindikator und behält die In-App-Aktivierung als
Fallback. Der Arm-Trigger-Kanal (`JOURNEY_ARM_CHANNEL`) ist auf minimale Android-Priorität
gesetzt, aber ohne echtes Gerät nicht verifiziert, ob er auf iOS/allen OEMs wirklich
unsichtbar bleibt — vor Release prüfen (siehe Safety-Release-Gates unten). Dafür sind
`expo-task-manager`, die nativen Berechtigungsstrings und ein Development/Release-Build
zwingend. Nie ohne diese explizite Aktion starten.

Journey has a service seam in `src/features/journey/`, backed by RTDB. Do NOT add real background location or real push notifications under
the current constraints; the RTDB service stores last-point-only coordinates.

- A user can be actively **unterwegs** to exactly one activity at a time. Starting another journey must
  show a conflict/switch flow instead of silently sharing to two activities.
- "Bin unterwegs" is only available after joining an activity. The trust copy must clearly state:
  participants only, automatic stop at arrival, and latest stop after the event.
- Auto-stop rules mirror the product contract: arrival radius `100 m`, event end + `30 min`
  buffer, and a hard max of `2 h`. Manual "Teilen stoppen" remains an override.
- Default map stays calm: do NOT render all journey avatars globally. Activity markers may show a small
  `N unterwegs` badge. Actual moving/arrival avatars render only in Activity Focus Mode.
- `MarkerDetailSheet` is the control center, but the Anreise entry is a **compact `JourneyShareRow`**
  (not the old full `JourneyPanel` card). The idle "Anreise teilen" row is a single plain, tappable
  action — deliberately no accept/decline framing: it's just there while relevant, gone when not.
  **The row is not rendered at all for an activity created as `now`** (see the rule at the top of
  this section) — and that activity gets no `watchActivityJourney` listener either, because a
  feature that is absent has to be absent in the running cost too.
  For everything else it is visible from **T-6 h until the Anreise could no longer run at all** —
  `endsAt + 30 min`, or `startsAt + 2 h` without an `endsAt`, mirroring `journeyExpiry` in
  `journeyBackground.ts` so the offer and the auto-stop share one boundary. It used to close at
  `startsAt` ("Anreise stops making sense once you're there"), which was wrong twice: you are
  demonstrably still on your way to a `soon` activity that has already started, and after the focus
  X ends a journey (see below) this row is the ONLY way back in — an action you can end must stay
  one you can restart. The Heimweg has NO activity-sheet entry anymore — its home
  is the profile card + global status pill (see Safety section). An armed/underway/arrived Anreise
  status remains visible with stop/arrival controls regardless of that window. Joining a `soon`
  activity that has already started shows the same row once, only when `journeyRemindersEnabled` is on;
  it self-clears on a successful start or when the sheet closes/switches activity — no separate dismiss
  control needed. The small map icon focuses journey participants.
- Activity Focus Mode shows only the selected activity and its journey avatars. The overlay shows a
  focus pill with the activity/person state and an explicit close control. **That X ends the
  Anreise** (`stopJourney` → `stopBackgroundJourney`, then clear the focus) — it used to clear only
  the map focus, so the sharing ran on invisibly while the gesture plainly meant "Schluss damit".
  Restarting happens in the activity sheet's `JourneyShareRow`, which is why its window now stays
  open while the activity runs.
- Entering/leaving Heimweg Focus is one coordinated spatial transition, not a set of independent
  fades: the shield stays at exactly the same position as a fixed anchor, top controls retract,
  bottom controls clear toward their nearest edge, and Safety controls follow with restrained timing.
  Reduced-motion users get the same final layout without motion. Keep the map mounted throughout.
- RTDB paths are `journeys/{activityId}/members/{uid}` and
  `journeys/{activityId}/locations/{uid}`. Rules: members read, users write only their own live point,
  status is `onTheWay | arrived`, and no historical path is stored.
- **Anreise-Erinnerung (Profil-Toggle „Anreise-Erinnerungen", `users/{uid}.journeyRemindersEnabled`,
  Default an):** Bei „ein" schickt `sendJourneyReminders` ~1 h vor beigetretenen Aktivitäten EINE
  Erinnerung „… beginnt um HH:MM · Anreise teilen? Zum Aktivieren tippen." Die Erinnerung **bietet nur
  an** — das Scharfschalten passiert pro Activity durch „Aktivieren", die eigentliche Freigabe erst bei
  echter Bewegung. **Bewusst zweistufig, kein „Immer aktiviert":** eine dauerhafte Auto-Freigabe würde
  das Einwilligungsmodell brechen (jede Activity hat ein eigenes Publikum; „beigetreten, aber doch nicht
  hingegangen" würde fremde Bewegung teilen) und widerspricht der Plattform-Leitlinie, Hintergrundortung
  nur bei erkennbarer Nutzeraktion zu starten. Die Aktion öffnet die App (`opensAppToForeground: true`),
  damit die Hintergrundfreigabe bei Erst-Nutzung angefragt werden kann — headless kann nicht prompten.
  Die Einstellung reitet auf dem geteilten `users/{uid}`-Listener (`friendService.subscribeSettings`),
  kein zweiter Listener.

