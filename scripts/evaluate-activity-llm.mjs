const model = process.argv[2];

if (!model) {
  console.error('Usage: node scripts/evaluate-activity-llm.mjs <ollama-model>');
  process.exit(1);
}

const categories = [
  'essen',
  'drinks',
  'kaffee',
  'sport',
  'outdoor',
  'feiern',
  'kultur',
  'spiele',
  'lernen',
  'chillen',
  'shopping',
  'sonstiges',
];

const normal = [
  { t: 'Wegbier', ok: ['drinks'] },
  { t: 'einen heben gehen', ok: ['drinks'] },
  { t: 'auf einen Kaffee', ok: ['kaffee'] },
  { t: 'Flat White holen', ok: ['kaffee'] },
  { t: 'Feierabend-Kaeffchen', ok: ['kaffee'] },
  { t: 'Mario Kart Abend', ok: ['spiele'] },
  { t: 'Brettspiel-Session', ok: ['spiele'] },
  { t: 'zocken zusammen', ok: ['spiele'] },
  { t: 'gamen bei mir', ok: ['spiele'] },
  { t: 'Dartturnier', ok: ['spiele', 'drinks'] },
  { t: 'eine Runde laufen', ok: ['sport'] },
  { t: 'ab ins Schwimmbad', ok: ['sport'] },
  { t: 'Kraulen im See', ok: ['sport'] },
  { t: 'ne Runde kicken', ok: ['sport'] },
  { t: 'baden im See', ok: ['sport', 'outdoor'] },
  { t: 'planschen gehen', ok: ['sport', 'outdoor'] },
  { t: 'Yoga-Session', ok: ['sport', 'chillen'] },
  { t: 'Berg hoch wandern', ok: ['outdoor'] },
  { t: 'am See spazieren', ok: ['outdoor'] },
  { t: 'ueber den Flohmarkt schlendern', ok: ['shopping', 'outdoor'] },
  { t: 'chillig abhaengen', ok: ['chillen'] },
  { t: 'Serienmarathon', ok: ['chillen'] },
  { t: 'Netflixabend', ok: ['chillen'] },
  { t: 'einfach mal abhaengen', ok: ['chillen'] },
  { t: 'ins Kino gehen', ok: ['kultur'] },
  { t: 'Ausstellung anschauen', ok: ['kultur'] },
  { t: 'Museumsbesuch', ok: ['kultur'] },
  { t: 'Konzertabend', ok: ['kultur'] },
  { t: 'Party machen', ok: ['feiern'] },
  { t: 'in den Club gehen', ok: ['feiern'] },
  { t: 'Klamotten shoppen', ok: ['shopping'] },
  { t: 'fuer die Pruefung bueffeln', ok: ['lernen'] },
  { t: 'zusammen coden', ok: ['lernen'] },
  { t: 'Sushi holen', ok: ['essen'] },
  { t: 'was zu essen bestellen', ok: ['essen'] },
  { t: 'Grillabend', ok: ['essen', 'outdoor'] },
  { t: 'Cocktailbar', ok: ['drinks'] },
  { t: 'Weinprobe', ok: ['drinks'] },
  { t: 'nen Absacker', ok: ['drinks'] },
  { t: 'Feierabendbier', ok: ['drinks'] },
];

const nasty = [
  { t: 'ein kuehles Blondes', ok: ['drinks'] },
  { t: 'die Sau rauslassen', ok: ['feiern'] },
  { t: 'einen draufmachen', ok: ['feiern'] },
  { t: 'die Nacht durchmachen', ok: ['feiern'] },
  { t: 'an die frische Luft', ok: ['outdoor'] },
  { t: 'die Beine vertreten', ok: ['outdoor', 'sport'] },
  { t: 'sich austoben', ok: ['sport', 'feiern'] },
  { t: 'auspowern', ok: ['sport'] },
  { t: 'sich den Bauch vollschlagen', ok: ['essen'] },
  { t: 'ordentlich reinhauen', ok: ['essen'] },
  { t: 'die Seele baumeln lassen', ok: ['chillen'] },
  { t: 'rumgammeln', ok: ['chillen'] },
  { t: 'eine ruhige Kugel schieben', ok: ['chillen'] },
  { t: 'sich die Kante geben', ok: ['drinks', 'feiern'] },
  { t: 'auf ein Getraenk', ok: ['drinks'] },
  { t: 'was auf die Ohren', ok: ['kultur'] },
  { t: 'grab a beer', ok: ['drinks'] },
  { t: 'coffee date', ok: ['kaffee'] },
  { t: 'movie night', ok: ['kultur'] },
  { t: "let's play", ok: ['spiele'] },
  { t: 'wanna grab food', ok: ['essen'] },
  { t: 'hit the trails', ok: ['outdoor', 'sport'] },
  { t: 'study sesh', ok: ['lernen'] },
  { t: 'pub crawl', ok: ['drinks'] },
  { t: 'brunch date', ok: ['kaffee', 'essen'] },
  { t: 'roadtrip', ok: ['outdoor'] },
  { t: 'window shopping', ok: ['shopping'] },
  { t: 'wine tasting', ok: ['drinks'] },
  { t: 'catch up over drinks', ok: ['drinks'] },
  { t: 'lunch break', ok: ['essen'] },
];

const tests = [...normal.map((x) => ({ ...x, set: 'normal' })), ...nasty.map((x) => ({ ...x, set: 'nasty' }))];

function promptFor(title) {
  return [
    'Du klassifizierst kurze Activity-Titel fuer eine Social-App.',
    'Waehle exakt eine dieser Kategorien:',
    '- essen: Restaurant, Food, Sushi, Pizza, Burger, Lunch, Dinner, Brunch wenn Essen im Fokus ist',
    '- drinks: alkoholische oder allgemeine Getraenke, Bier, Wein, Bar, Pub, Absacker; NICHT Kaffee',
    '- kaffee: Kaffee, Cafe, Flat White, Espresso, Cappuccino, coffee date',
    '- sport: Sport, Gym, Laufen, Schwimmen, Fussball, Yoga, Workout, Kicken, Auspowern',
    '- outdoor: Spaziergang, Wandern, Park, See, Natur, frische Luft, Roadtrip, Beine vertreten',
    '- feiern: Party, Club, Tanzen, Rave, Nacht durchmachen, Sau rauslassen',
    '- kultur: Kino, Film, Movie Night, Konzert, Museum, Ausstellung, Theater, Musik hoeren',
    '- spiele: Spieleabend, Brettspiele, Gaming, Zocken, Mario Kart, Dart, Karten',
    '- lernen: Lernen, Pruefung, Bueffeln, Bibliothek, Study, Coden, Coworking',
    '- chillen: Netflix, Serien, Abhaengen, Entspannen, Rumgammeln, Seele baumeln lassen',
    '- shopping: Shoppen, Klamotten, Flohmarkt, Window Shopping',
    '- sonstiges: nur wenn wirklich nichts passt',
    'Antworte ausschliesslich als JSON ohne Markdown.',
    'Schema: {"category":"<eine erlaubte Kategorie>","confidence":0.0}',
    'Wenn mehrere Kategorien passen, waehle die naheliegendste Hauptintention.',
    `Erlaubte category-Werte: ${categories.join(', ')}.`,
    `Titel: ${JSON.stringify(title)}`,
  ].join('\n');
}

async function generate(title) {
  const started = performance.now();
  const response = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: promptFor(title),
      stream: false,
      format: 'json',
      keep_alive: '10m',
      options: {
        temperature: 0,
        num_predict: 80,
        num_ctx: 2048,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const elapsedMs = performance.now() - started;
  let parsed;
  try {
    parsed = JSON.parse(data.response);
  } catch {
    parsed = { category: 'parse_error', confidence: 0, raw: data.response };
  }
  return {
    category: String(parsed.category ?? 'parse_error').toLowerCase(),
    confidence: Number(parsed.confidence ?? 0),
    elapsedMs,
    raw: data.response,
  };
}

function summarize(name, rows) {
  const ok = rows.filter((row) => row.ok.includes(row.pred)).length;
  const avgMs = rows.reduce((sum, row) => sum + row.elapsedMs, 0) / rows.length;
  console.log(`${name}: ${ok}/${rows.length} = ${Math.round((ok / rows.length) * 100)}% | avg ${Math.round(avgMs)}ms`);
  for (const row of rows.filter((x) => !x.ok.includes(x.pred)).slice(0, 30)) {
    console.log(`  MISS "${row.t}" -> ${row.pred} (${row.confidence}), erwartet ${row.ok.join('/')}`);
  }
}

const runStarted = performance.now();
const warmStarted = performance.now();
const warmup = await generate('Wegbier');
const warmupMs = performance.now() - warmStarted;

const rows = [];
for (const test of tests) {
  const result = await generate(test.t);
  rows.push({
    ...test,
    pred: categories.includes(result.category) ? result.category : 'invalid',
    confidence: result.confidence,
    elapsedMs: result.elapsedMs,
  });
}

const totalMs = performance.now() - runStarted;
console.log(`MODEL=${model}`);
console.log(`WARMUP_MS=${Math.round(warmupMs)} WARMUP_PRED=${warmup.category} WARMUP_CONF=${warmup.confidence}`);
console.log(`EVAL_TOTAL_MS=${Math.round(totalMs)}`);
summarize('normal', rows.filter((x) => x.set === 'normal'));
summarize('nasty', rows.filter((x) => x.set === 'nasty'));
summarize('all', rows);
