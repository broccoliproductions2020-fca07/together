export const story = [
  {
    key: 'open', label: 'Offen', title: 'Zeit teilen',
    text: 'Ein Tap reicht. Zeitraum und Standortfreigabe bestimmst du selbst.',
    image: '/screenshots/mica-open-status.webp',
    alt: 'Mica zeigt einen aktiven Offen-Status und Freunde in der Nähe.',
  },
  {
    key: 'now', label: 'Jetzt', title: 'Direkt losziehen',
    text: 'Zeig, was gerade passiert, und mach aus einem spontanen Impuls ein echtes Treffen.',
    image: '/screenshots/mica-now-activity.webp',
    alt: 'Mica zeigt in Berlin die laufende Aktivität Split the G mit Hannes und Sebbo.',
  },
  {
    key: 'soon', label: 'Soon', title: 'Für später planen',
    text: 'Aus einer Idee werden Zeitpunkt, Ort und ein gemeinsamer Plan – direkt mit euren Freunden.',
    image: '/screenshots/mica-padel-activity.webp',
    alt: 'Mica zeigt in Berlin die geöffnete Soon-Aktivität Runde Padel mit vier Teilnehmenden.',
  },
] as const;

export const features = [
  ['Karte', 'Geteilte Aktivitäten erscheinen dort, wo sie stattfinden.'],
  ['Circles', 'Wähle den Freundeskreis, für den dein Plan gedacht ist.'],
  ['Kalender', 'Zugesagte Aktivitäten bleiben übersichtlich an einem Ort.'],
  ['Chat', 'Kurze Absprachen bleiben direkt mit der Aktivität verbunden.'],
] as const;

export const faqs = [
  ['Was ist Mica?', 'Mica ist eine App für spontane Treffen im bestehenden Freundeskreis. Ihr teilt freie Momente, plant Aktivitäten und findet leichter zusammen.'],
  ['Wer kann sehen, was ich teile?', 'Deine Inhalte sind für bestätigte Freunde und die von dir gewählte Zielgruppe bestimmt. Bei Aktivitäten kannst du alle direkten Freunde, enge Freunde oder einen Circle auswählen.'],
  ['Muss ich meinen Standort teilen?', 'Du entscheidest selbst. Dein Offen-Status startet ohne Standort. Standortfreigaben aktivierst du bewusst und zeitlich begrenzt.'],
  ['Was kostet Mica?', 'Mica ist kostenlos.'],
  ['Ab welchem Alter kann ich Mica verwenden?', 'Mica richtet sich an Personen ab 16 Jahren.'],
  ['Wann erscheint Mica?', 'Mica startet für iOS und Android. Sobald der Termin feststeht, findest du alle Informationen hier auf micamapp.de.'],
] as const;
