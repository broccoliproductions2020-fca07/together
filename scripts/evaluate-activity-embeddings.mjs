import { env as hfEnv, pipeline as hfPipeline } from '@huggingface/transformers';
import { env as xenovaEnv, pipeline as xenovaPipeline } from '@xenova/transformers';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const cacheDir = path.resolve('.model-cache');
const knowledgePath = path.resolve('src/features/activities/data/activityCategoryKnowledge.json');
const knowledge = JSON.parse(readFileSync(knowledgePath, 'utf8'));

for (const runtimeEnv of [xenovaEnv, hfEnv]) {
  runtimeEnv.cacheDir = cacheDir;
  runtimeEnv.allowLocalModels = true;
  runtimeEnv.allowRemoteModels = true;
}

const MODEL_CONFIGS = {
  'Xenova/multilingual-e5-base': {
    examplePrefix: 'passage: ',
    queryPrefix: 'query: ',
  },
  'Xenova/multilingual-e5-small': {
    examplePrefix: 'passage: ',
    queryPrefix: 'query: ',
  },
  'onnx-community/gte-multilingual-base': {
    examplePrefix: '',
    queryPrefix: '',
  },
};

const CATEGORY_EXAMPLES = knowledge.examples;
const KEYWORD_BOOSTS = knowledge.keywordBoosts.map((boost) => ({
  ...boost,
  pattern: new RegExp(boost.pattern, 'i'),
}));
const NORMALIZED_EXAMPLES = new Set(
  Object.values(CATEGORY_EXAMPLES)
    .flat()
    .map((example) => normalizeForLeakage(example)),
);

const models = process.argv.slice(2);

if (models.length === 0) {
  console.error(
    'Usage: node scripts/evaluate-activity-embeddings.mjs <model-id> [<model-id>...]',
  );
  process.exit(1);
}

const regressionTests = [
  { t: 'Wegbier', ok: ['drinks'], set: 'normal' },
  { t: 'einen heben gehen', ok: ['drinks'], set: 'normal' },
  { t: 'auf einen Kaffee', ok: ['kaffee'], set: 'normal' },
  { t: 'Flat White holen', ok: ['kaffee'], set: 'normal' },
  { t: 'Feierabend-Kaeffchen', ok: ['kaffee'], set: 'normal' },
  { t: 'Mario Kart Abend', ok: ['spiele'], set: 'normal' },
  { t: 'Brettspiel-Session', ok: ['spiele'], set: 'normal' },
  { t: 'zocken zusammen', ok: ['spiele'], set: 'normal' },
  { t: 'gamen bei mir', ok: ['spiele'], set: 'normal' },
  { t: 'Dartturnier', ok: ['spiele', 'drinks'], set: 'normal' },
  { t: 'eine Runde laufen', ok: ['sport'], set: 'normal' },
  { t: 'ab ins Schwimmbad', ok: ['sport'], set: 'normal' },
  { t: 'Kraulen im See', ok: ['sport'], set: 'normal' },
  { t: 'ne Runde kicken', ok: ['sport'], set: 'normal' },
  { t: 'baden im See', ok: ['sport', 'outdoor'], set: 'normal' },
  { t: 'planschen gehen', ok: ['sport', 'outdoor'], set: 'normal' },
  { t: 'Yoga-Session', ok: ['sport', 'chillen'], set: 'normal' },
  { t: 'Berg hoch wandern', ok: ['outdoor'], set: 'normal' },
  { t: 'am See spazieren', ok: ['outdoor'], set: 'normal' },
  { t: 'ueber den Flohmarkt schlendern', ok: ['shopping', 'outdoor'], set: 'normal' },
  { t: 'chillig abhaengen', ok: ['chillen'], set: 'normal' },
  { t: 'Serienmarathon', ok: ['chillen'], set: 'normal' },
  { t: 'Netflixabend', ok: ['chillen'], set: 'normal' },
  { t: 'einfach mal abhaengen', ok: ['chillen'], set: 'normal' },
  { t: 'ins Kino gehen', ok: ['kultur'], set: 'normal' },
  { t: 'Ausstellung anschauen', ok: ['kultur'], set: 'normal' },
  { t: 'Museumsbesuch', ok: ['kultur'], set: 'normal' },
  { t: 'Konzertabend', ok: ['kultur'], set: 'normal' },
  { t: 'Party machen', ok: ['feiern'], set: 'normal' },
  { t: 'in den Club gehen', ok: ['feiern'], set: 'normal' },
  { t: 'Klamotten shoppen', ok: ['shopping'], set: 'normal' },
  { t: 'fuer die Pruefung bueffeln', ok: ['lernen'], set: 'normal' },
  { t: 'zusammen coden', ok: ['lernen'], set: 'normal' },
  { t: 'Sushi holen', ok: ['essen'], set: 'normal' },
  { t: 'was zu essen bestellen', ok: ['essen'], set: 'normal' },
  { t: 'Grillabend', ok: ['essen', 'outdoor'], set: 'normal' },
  { t: 'Cocktailbar', ok: ['drinks'], set: 'normal' },
  { t: 'Weinprobe', ok: ['drinks'], set: 'normal' },
  { t: 'nen Absacker', ok: ['drinks'], set: 'normal' },
  { t: 'Feierabendbier', ok: ['drinks'], set: 'normal' },
  { t: 'ein kuehles Blondes', ok: ['drinks'], set: 'nasty' },
  { t: 'die Sau rauslassen', ok: ['feiern'], set: 'nasty' },
  { t: 'einen draufmachen', ok: ['feiern'], set: 'nasty' },
  { t: 'die Nacht durchmachen', ok: ['feiern'], set: 'nasty' },
  { t: 'an die frische Luft', ok: ['outdoor'], set: 'nasty' },
  { t: 'die Beine vertreten', ok: ['outdoor', 'sport'], set: 'nasty' },
  { t: 'sich austoben', ok: ['sport', 'feiern'], set: 'nasty' },
  { t: 'auspowern', ok: ['sport'], set: 'nasty' },
  { t: 'sich den Bauch vollschlagen', ok: ['essen'], set: 'nasty' },
  { t: 'ordentlich reinhauen', ok: ['essen'], set: 'nasty' },
  { t: 'die Seele baumeln lassen', ok: ['chillen'], set: 'nasty' },
  { t: 'rumgammeln', ok: ['chillen'], set: 'nasty' },
  { t: 'eine ruhige Kugel schieben', ok: ['chillen'], set: 'nasty' },
  { t: 'sich die Kante geben', ok: ['drinks', 'feiern'], set: 'nasty' },
  { t: 'auf ein Getraenk', ok: ['drinks'], set: 'nasty' },
  { t: 'was auf die Ohren', ok: ['kultur'], set: 'nasty' },
  { t: 'grab a beer', ok: ['drinks'], set: 'nasty' },
  { t: 'coffee date', ok: ['kaffee'], set: 'nasty' },
  { t: 'movie night', ok: ['kultur'], set: 'nasty' },
  { t: "let's play", ok: ['spiele'], set: 'nasty' },
  { t: 'wanna grab food', ok: ['essen'], set: 'nasty' },
  { t: 'hit the trails', ok: ['outdoor', 'sport'], set: 'nasty' },
  { t: 'study sesh', ok: ['lernen'], set: 'nasty' },
  { t: 'pub crawl', ok: ['drinks'], set: 'nasty' },
  { t: 'brunch date', ok: ['kaffee', 'essen'], set: 'nasty' },
  { t: 'roadtrip', ok: ['outdoor'], set: 'nasty' },
  { t: 'window shopping', ok: ['shopping'], set: 'nasty' },
  { t: 'wine tasting', ok: ['drinks'], set: 'nasty' },
  { t: 'catch up over drinks', ok: ['drinks'], set: 'nasty' },
  { t: 'lunch break', ok: ['essen'], set: 'nasty' },
  { t: 'Bier', ok: ['drinks'], set: 'single' },
  { t: 'Kneipe', ok: ['drinks'], set: 'single' },
  { t: 'Pinte', ok: ['drinks'], set: 'single' },
  { t: 'Beisl', ok: ['drinks'], set: 'single' },
  { t: 'Pub', ok: ['drinks'], set: 'single' },
  { t: 'Cocktails', ok: ['drinks'], set: 'single' },
  { t: 'Wein', ok: ['drinks'], set: 'single' },
  { t: 'Fusspils', ok: ['drinks'], set: 'single' },
  { t: 'Faustmolle', ok: ['drinks'], set: 'single' },
  { t: 'Kaffee', ok: ['kaffee'], set: 'single' },
  { t: 'Cafe', ok: ['kaffee'], set: 'single' },
  { t: 'Cappuccino', ok: ['kaffee'], set: 'single' },
  { t: 'Espresso', ok: ['kaffee'], set: 'single' },
  { t: 'Matcha', ok: ['kaffee'], set: 'single' },
  { t: 'Pizza', ok: ['essen'], set: 'single' },
  { t: 'Sushi', ok: ['essen'], set: 'single' },
  { t: 'Burger', ok: ['essen'], set: 'single' },
  { t: 'Ramen', ok: ['essen'], set: 'single' },
  { t: 'Doener', ok: ['essen'], set: 'single' },
  { t: 'Brunch', ok: ['essen', 'kaffee'], set: 'single' },
  { t: 'Snacks', ok: ['essen'], set: 'single' },
  { t: 'Gym', ok: ['sport'], set: 'single' },
  { t: 'Joggen', ok: ['sport'], set: 'single' },
  { t: 'Laufen', ok: ['sport'], set: 'single' },
  { t: 'Bouldern', ok: ['sport'], set: 'single' },
  { t: 'Yoga', ok: ['sport', 'chillen'], set: 'single' },
  { t: 'SUP', ok: ['sport', 'outdoor'], set: 'single' },
  { t: 'Dart', ok: ['spiele', 'sport', 'drinks'], set: 'single' },
  { t: 'Wandern', ok: ['outdoor'], set: 'single' },
  { t: 'Spazieren', ok: ['outdoor'], set: 'single' },
  { t: 'Park', ok: ['outdoor'], set: 'single' },
  { t: 'Spree', ok: ['outdoor'], set: 'single' },
  { t: 'See', ok: ['outdoor'], set: 'single' },
  { t: 'Picknick', ok: ['outdoor'], set: 'single' },
  { t: 'Party', ok: ['feiern'], set: 'single' },
  { t: 'Club', ok: ['feiern'], set: 'single' },
  { t: 'Rave', ok: ['feiern'], set: 'single' },
  { t: 'Techno', ok: ['feiern'], set: 'single' },
  { t: 'Kino', ok: ['kultur'], set: 'single' },
  { t: 'Museum', ok: ['kultur'], set: 'single' },
  { t: 'Konzert', ok: ['kultur'], set: 'single' },
  { t: 'Theater', ok: ['kultur'], set: 'single' },
  { t: 'Ausstellung', ok: ['kultur'], set: 'single' },
  { t: 'Zocken', ok: ['spiele'], set: 'single' },
  { t: 'Gaming', ok: ['spiele'], set: 'single' },
  { t: 'FIFA', ok: ['spiele'], set: 'single' },
  { t: 'Brettspiele', ok: ['spiele'], set: 'single' },
  { t: 'Billard', ok: ['spiele', 'sport', 'drinks'], set: 'single' },
  { t: 'Lernen', ok: ['lernen'], set: 'single' },
  { t: 'Study', ok: ['lernen'], set: 'single' },
  { t: 'Bib', ok: ['lernen'], set: 'single' },
  { t: 'Coworking', ok: ['lernen'], set: 'single' },
  { t: 'Coden', ok: ['lernen'], set: 'single' },
  { t: 'Chillen', ok: ['chillen'], set: 'single' },
  { t: 'Relaxen', ok: ['chillen'], set: 'single' },
  { t: 'Chillaxen', ok: ['chillen'], set: 'single' },
  { t: 'Abhaengen', ok: ['chillen'], set: 'single' },
  { t: 'Netflix', ok: ['chillen'], set: 'single' },
  { t: 'Shoppen', ok: ['shopping'], set: 'single' },
  { t: 'Shopping', ok: ['shopping'], set: 'single' },
  { t: 'Flohmarkt', ok: ['shopping', 'outdoor'], set: 'single' },
  { t: 'Sneaker', ok: ['shopping'], set: 'single' },
  { t: 'Vintage', ok: ['shopping'], set: 'single' },
  { t: 'Bummeln', ok: ['shopping', 'outdoor'], set: 'single' },
  { t: 'Bar?', ok: ['drinks'], set: 'short' },
  { t: 'Kino?', ok: ['kultur'], set: 'short' },
  { t: 'Gym?', ok: ['sport'], set: 'short' },
  { t: 'Pizza?', ok: ['essen'], set: 'short' },
  { t: 'Cafe?', ok: ['kaffee'], set: 'short' },
  { t: 'Park?', ok: ['outdoor'], set: 'short' },
  { t: 'Zocken?', ok: ['spiele'], set: 'short' },
  { t: 'Bib?', ok: ['lernen'], set: 'short' },
  { t: 'Club?', ok: ['feiern'], set: 'short' },
  { t: 'Shoppen?', ok: ['shopping'], set: 'short' },
  { t: 'chill?', ok: ['chillen'], set: 'short' },
  { t: 'bierchen', ok: ['drinks'], set: 'short' },
  { t: 'kaeffchen', ok: ['kaffee'], set: 'short' },
  { t: 'hunger', ok: ['essen'], set: 'short' },
  { t: 'raus?', ok: ['outdoor', 'sonstiges'], set: 'short' },
  { t: 'laufen?', ok: ['sport'], set: 'short' },
  { t: 'film?', ok: ['kultur'], set: 'short' },
  { t: 'konsole?', ok: ['spiele'], set: 'short' },
  { t: 'lernen?', ok: ['lernen'], set: 'short' },
  { t: 'couch?', ok: ['chillen'], set: 'short' },
  { t: 'mall?', ok: ['shopping'], set: 'short' },
  { t: 'beer', ok: ['drinks'], set: 'english' },
  { t: 'craft beer', ok: ['drinks'], set: 'english' },
  { t: 'pub night', ok: ['drinks'], set: 'english' },
  { t: 'happy hour', ok: ['drinks'], set: 'english' },
  { t: 'grab drinks', ok: ['drinks'], set: 'english' },
  { t: 'nightcap', ok: ['drinks'], set: 'english' },
  { t: 'coffee', ok: ['kaffee'], set: 'english' },
  { t: 'coffee shop', ok: ['kaffee'], set: 'english' },
  { t: 'bubble tea', ok: ['kaffee'], set: 'english' },
  { t: 'boba', ok: ['kaffee'], set: 'english' },
  { t: 'grab dinner', ok: ['essen'], set: 'english' },
  { t: 'takeout', ok: ['essen'], set: 'english' },
  { t: 'street food', ok: ['essen'], set: 'english' },
  { t: 'tacos', ok: ['essen'], set: 'english' },
  { t: 'dumplings', ok: ['essen'], set: 'english' },
  { t: 'ice cream', ok: ['essen'], set: 'english' },
  { t: 'running', ok: ['sport'], set: 'english' },
  { t: 'soccer', ok: ['sport'], set: 'english' },
  { t: 'basketball', ok: ['sport'], set: 'english' },
  { t: 'pickleball', ok: ['sport'], set: 'english' },
  { t: 'rock climbing', ok: ['sport', 'outdoor'], set: 'english' },
  { t: 'martial arts', ok: ['sport'], set: 'english' },
  { t: 'kayaking', ok: ['sport', 'outdoor'], set: 'english' },
  { t: 'walk', ok: ['outdoor'], set: 'english' },
  { t: 'hike', ok: ['outdoor'], set: 'english' },
  { t: 'picnic', ok: ['outdoor'], set: 'english' },
  { t: 'beach day', ok: ['outdoor'], set: 'english' },
  { t: 'camping', ok: ['outdoor'], set: 'english' },
  { t: 'fresh air', ok: ['outdoor'], set: 'english' },
  { t: 'clubbing', ok: ['feiern'], set: 'english' },
  { t: 'night out', ok: ['feiern'], set: 'english' },
  { t: 'karaoke', ok: ['feiern', 'kultur'], set: 'english' },
  { t: 'dance floor', ok: ['feiern'], set: 'english' },
  { t: 'movie', ok: ['kultur'], set: 'english' },
  { t: 'cinema', ok: ['kultur'], set: 'english' },
  { t: 'gig', ok: ['kultur'], set: 'english' },
  { t: 'art gallery', ok: ['kultur'], set: 'english' },
  { t: 'standup', ok: ['kultur'], set: 'english' },
  { t: 'theatre', ok: ['kultur'], set: 'english' },
  { t: 'board games', ok: ['spiele'], set: 'english' },
  { t: 'card games', ok: ['spiele'], set: 'english' },
  { t: 'playstation', ok: ['spiele'], set: 'english' },
  { t: 'fps', ok: ['spiele'], set: 'english' },
  { t: 'minecraft', ok: ['spiele'], set: 'english' },
  { t: 'escape room', ok: ['spiele'], set: 'english' },
  { t: 'study', ok: ['lernen'], set: 'english' },
  { t: 'library', ok: ['lernen'], set: 'english' },
  { t: 'deep work', ok: ['lernen'], set: 'english' },
  { t: 'language exchange', ok: ['lernen'], set: 'english' },
  { t: 'homework', ok: ['lernen'], set: 'english' },
  { t: 'hang out', ok: ['chillen'], set: 'english' },
  { t: 'relax', ok: ['chillen'], set: 'english' },
  { t: 'lowkey', ok: ['chillen'], set: 'english' },
  { t: 'catch up', ok: ['chillen'], set: 'english' },
  { t: 'podcast', ok: ['chillen'], set: 'english' },
  { t: 'thrifting', ok: ['shopping'], set: 'english' },
  { t: 'flea market', ok: ['shopping', 'outdoor'], set: 'english' },
  { t: 'window shopping', ok: ['shopping'], set: 'english' },
  { t: 'bookstore', ok: ['shopping'], set: 'english' },
  { t: 'record store', ok: ['shopping'], set: 'english' },
  { t: 'gift shopping', ok: ['shopping'], set: 'english' },
];

const holdoutTests = [
  { t: 'Magen knurrt', ok: ['essen'], set: 'holdout_de' },
  { t: 'Thai um die Ecke', ok: ['essen'], set: 'holdout_de' },
  { t: 'Nudeln?', ok: ['essen'], set: 'holdout_de' },
  { t: 'Imbissbude', ok: ['essen'], set: 'holdout_de' },
  { t: 'was zwischen die Zaehne', ok: ['essen'], set: 'holdout_de' },
  { t: 'Dampfende Suppe', ok: ['essen'], set: 'holdout_de' },
  { t: 'Bowl holen', ok: ['essen'], set: 'holdout_de' },
  { t: 'Bistro testen', ok: ['essen'], set: 'holdout_de' },
  { t: 'Sundowner', ok: ['drinks'], set: 'holdout_de' },
  { t: 'Zapfhahn', ok: ['drinks'], set: 'holdout_de' },
  { t: 'Stammtisch', ok: ['drinks'], set: 'holdout_de' },
  { t: 'Limo am Kanal', ok: ['drinks', 'outdoor'], set: 'holdout_de' },
  { t: 'Runde anstossen', ok: ['drinks', 'feiern'], set: 'holdout_de' },
  { t: 'Bierbank', ok: ['drinks'], set: 'holdout_de' },
  { t: 'Korken knallen', ok: ['drinks', 'feiern'], set: 'holdout_de' },
  { t: 'Koffein', ok: ['kaffee'], set: 'holdout_de' },
  { t: 'Roesterei', ok: ['kaffee'], set: 'holdout_de' },
  { t: 'Milchschaum', ok: ['kaffee'], set: 'holdout_de' },
  { t: 'Bohnen kaufen', ok: ['kaffee', 'shopping'], set: 'holdout_de' },
  { t: 'Americano', ok: ['kaffee'], set: 'holdout_de' },
  { t: 'Schweissrunde', ok: ['sport'], set: 'holdout_de' },
  { t: 'Pumpen', ok: ['sport'], set: 'holdout_de' },
  { t: 'Matte ausrollen', ok: ['sport', 'chillen'], set: 'holdout_de' },
  { t: 'Bolzplatz', ok: ['sport'], set: 'holdout_de' },
  { t: 'Koerbe werfen', ok: ['sport'], set: 'holdout_de' },
  { t: 'Schlaeger mitnehmen', ok: ['sport'], set: 'holdout_de' },
  { t: 'Runde um den Block', ok: ['outdoor'], set: 'holdout_de' },
  { t: 'Ufer lang', ok: ['outdoor'], set: 'holdout_de' },
  { t: 'Sonne tanken', ok: ['outdoor'], set: 'holdout_de' },
  { t: 'Gruen raus', ok: ['outdoor'], set: 'holdout_de' },
  { t: 'Luft schnappen', ok: ['outdoor'], set: 'holdout_de' },
  { t: 'Abriss', ok: ['feiern'], set: 'holdout_de' },
  { t: 'Auf die Piste', ok: ['feiern'], set: 'holdout_de' },
  { t: 'Bassnacht', ok: ['feiern'], set: 'holdout_de' },
  { t: 'Tanzschuhe an', ok: ['feiern'], set: 'holdout_de' },
  { t: 'Buehne', ok: ['kultur'], set: 'holdout_de' },
  { t: 'Leinwand', ok: ['kultur'], set: 'holdout_de' },
  { t: 'Kunstraum', ok: ['kultur'], set: 'holdout_de' },
  { t: 'Premiere anschauen', ok: ['kultur'], set: 'holdout_de' },
  { t: 'Orchester', ok: ['kultur'], set: 'holdout_de' },
  { t: 'Controller einpacken', ok: ['spiele'], set: 'holdout_de' },
  { t: 'Wuerfelrunde', ok: ['spiele'], set: 'holdout_de' },
  { t: 'Tischkicker', ok: ['spiele'], set: 'holdout_de' },
  { t: 'Quest Room', ok: ['spiele'], set: 'holdout_de' },
  { t: 'Skript durchgehen', ok: ['lernen'], set: 'holdout_de' },
  { t: 'Folien bauen', ok: ['lernen'], set: 'holdout_de' },
  { t: 'Abgabe fertig machen', ok: ['lernen'], set: 'holdout_de' },
  { t: 'Lernzettel', ok: ['lernen'], set: 'holdout_de' },
  { t: 'Runterkommen', ok: ['chillen'], set: 'holdout_de' },
  { t: 'Nichts tun', ok: ['chillen'], set: 'holdout_de' },
  { t: 'Plaudern', ok: ['chillen'], set: 'holdout_de' },
  { t: 'Couchmodus', ok: ['chillen'], set: 'holdout_de' },
  { t: 'Stoebern', ok: ['shopping'], set: 'holdout_de' },
  { t: 'Anprobe', ok: ['shopping'], set: 'holdout_de' },
  { t: 'Schaufenster', ok: ['shopping'], set: 'holdout_de' },
  { t: 'Outlet', ok: ['shopping'], set: 'holdout_de' },
  { t: 'Troedel', ok: ['shopping'], set: 'holdout_de' },
  { t: 'bite to eat', ok: ['essen'], set: 'holdout_en' },
  { t: 'noodles later', ok: ['essen'], set: 'holdout_en' },
  { t: 'quick snack run', ok: ['essen'], set: 'holdout_en' },
  { t: 'soup spot', ok: ['essen'], set: 'holdout_en' },
  { t: 'sundowners', ok: ['drinks'], set: 'holdout_en' },
  { t: 'pint after work', ok: ['drinks'], set: 'holdout_en' },
  { t: 'mocktails', ok: ['drinks'], set: 'holdout_en' },
  { t: 'taproom', ok: ['drinks'], set: 'holdout_en' },
  { t: 'caffeine fix', ok: ['kaffee'], set: 'holdout_en' },
  { t: 'roastery run', ok: ['kaffee'], set: 'holdout_en' },
  { t: 'foam art', ok: ['kaffee'], set: 'holdout_en' },
  { t: 'shoot hoops', ok: ['sport'], set: 'holdout_en' },
  { t: 'sweat session', ok: ['sport'], set: 'holdout_en' },
  { t: 'lift weights', ok: ['sport'], set: 'holdout_en' },
  { t: 'mat class', ok: ['sport'], set: 'holdout_en' },
  { t: 'stroll by the river', ok: ['outdoor'], set: 'holdout_en' },
  { t: 'get some sun', ok: ['outdoor'], set: 'holdout_en' },
  { t: 'green escape', ok: ['outdoor'], set: 'holdout_en' },
  { t: 'waterfront walk', ok: ['outdoor'], set: 'holdout_en' },
  { t: 'bass night', ok: ['feiern'], set: 'holdout_en' },
  { t: 'hit the dancefloor', ok: ['feiern'], set: 'holdout_en' },
  { t: 'late-night dancing', ok: ['feiern'], set: 'holdout_en' },
  { t: 'stage show', ok: ['kultur'], set: 'holdout_en' },
  { t: 'opening night', ok: ['kultur'], set: 'holdout_en' },
  { t: 'symphony', ok: ['kultur'], set: 'holdout_en' },
  { t: 'gallery crawl', ok: ['kultur'], set: 'holdout_en' },
  { t: 'dice night', ok: ['spiele'], set: 'holdout_en' },
  { t: 'controller night', ok: ['spiele'], set: 'holdout_en' },
  { t: 'arcade run', ok: ['spiele'], set: 'holdout_en' },
  { t: 'cards at mine', ok: ['spiele'], set: 'holdout_en' },
  { t: 'flashcards', ok: ['lernen'], set: 'holdout_en' },
  { t: 'deadline grind', ok: ['lernen'], set: 'holdout_en' },
  { t: 'slides prep', ok: ['lernen'], set: 'holdout_en' },
  { t: 'reading sprint', ok: ['lernen'], set: 'holdout_en' },
  { t: 'unwind', ok: ['chillen'], set: 'holdout_en' },
  { t: 'do nothing', ok: ['chillen'], set: 'holdout_en' },
  { t: 'sofa time', ok: ['chillen'], set: 'holdout_en' },
  { t: 'just chat', ok: ['chillen'], set: 'holdout_en' },
  { t: 'try-ons', ok: ['shopping'], set: 'holdout_en' },
  { t: 'browse stores', ok: ['shopping'], set: 'holdout_en' },
  { t: 'antique market', ok: ['shopping'], set: 'holdout_en' },
  { t: 'outlet hunt', ok: ['shopping'], set: 'holdout_en' },
];

const webStressTests = [
  { t: 'mampfen', ok: ['essen'], set: 'web_stress_de' },
  { t: 'was futtern', ok: ['essen'], set: 'web_stress_de' },
  { t: 'Futter fassen', ok: ['essen'], set: 'web_stress_de' },
  { t: 'Falafel?', ok: ['essen'], set: 'web_stress_de' },
  { t: 'Currywurst um die Ecke', ok: ['essen'], set: 'web_stress_de' },
  { t: 'Ramen Bar', ok: ['essen'], set: 'web_stress_de' },
  { t: 'Markthalle essen', ok: ['essen'], set: 'web_stress_de' },
  { t: 'Auf ein Glas', ok: ['drinks'], set: 'web_stress_de' },
  { t: 'einen trinken gehen', ok: ['drinks'], set: 'web_stress_de' },
  { t: 'Hopfentee', ok: ['drinks'], set: 'web_stress_de' },
  { t: 'Hopfenkaltschale', ok: ['drinks'], set: 'web_stress_de' },
  { t: 'Aperitivo', ok: ['drinks'], set: 'web_stress_de' },
  { t: 'Brauhaus', ok: ['drinks'], set: 'web_stress_de' },
  { t: 'Kaffeehaus', ok: ['kaffee'], set: 'web_stress_de' },
  { t: 'Espressobar', ok: ['kaffee'], set: 'web_stress_de' },
  { t: 'Koffein holen', ok: ['kaffee'], set: 'web_stress_de' },
  { t: 'Iced Latte', ok: ['kaffee'], set: 'web_stress_de' },
  { t: 'Padel', ok: ['sport'], set: 'web_stress_de' },
  { t: 'Krafttraining', ok: ['sport'], set: 'web_stress_de' },
  { t: 'Leg day', ok: ['sport'], set: 'web_stress_de' },
  { t: 'Trail running', ok: ['sport', 'outdoor'], set: 'web_stress_de' },
  { t: 'Rudern', ok: ['sport'], set: 'web_stress_de' },
  { t: 'Parkour', ok: ['sport'], set: 'web_stress_de' },
  { t: 'Touch grass', ok: ['outdoor'], set: 'web_stress_de' },
  { t: 'Golden hour walk', ok: ['outdoor'], set: 'web_stress_de' },
  { t: 'Promenade', ok: ['outdoor'], set: 'web_stress_de' },
  { t: 'Pilze sammeln', ok: ['outdoor'], set: 'web_stress_de' },
  { t: 'Geocaching', ok: ['outdoor'], set: 'web_stress_de' },
  { t: 'Vorgluehen', ok: ['feiern', 'drinks'], set: 'web_stress_de' },
  { t: 'Vortrinken', ok: ['feiern', 'drinks'], set: 'web_stress_de' },
  { t: 'Auf den Putz hauen', ok: ['feiern'], set: 'web_stress_de' },
  { t: 'Fete machen', ok: ['feiern'], set: 'web_stress_de' },
  { t: 'Tanzflaeche', ok: ['feiern'], set: 'web_stress_de' },
  { t: 'Matinee', ok: ['kultur'], set: 'web_stress_de' },
  { t: 'Programmkino', ok: ['kultur'], set: 'web_stress_de' },
  { t: 'Sneak Preview', ok: ['kultur'], set: 'web_stress_de' },
  { t: 'Zaubershow', ok: ['kultur'], set: 'web_stress_de' },
  { t: 'Literaturabend', ok: ['kultur'], set: 'web_stress_de' },
  { t: 'Improvisationstheater', ok: ['kultur'], set: 'web_stress_de' },
  { t: 'DnD', ok: ['spiele'], set: 'web_stress_de' },
  { t: 'Pen and Paper', ok: ['spiele'], set: 'web_stress_de' },
  { t: 'Skat', ok: ['spiele'], set: 'web_stress_de' },
  { t: 'Codenames', ok: ['spiele'], set: 'web_stress_de' },
  { t: 'Flipper', ok: ['spiele'], set: 'web_stress_de' },
  { t: 'Lernmarathon', ok: ['lernen'], set: 'web_stress_de' },
  { t: 'Vorlesung nacharbeiten', ok: ['lernen'], set: 'web_stress_de' },
  { t: 'Uebungsblatt', ok: ['lernen'], set: 'web_stress_de' },
  { t: 'Vokabeln lernen', ok: ['lernen'], set: 'web_stress_de' },
  { t: 'Pair programming', ok: ['lernen'], set: 'web_stress_de' },
  { t: 'Akku aufladen', ok: ['chillen'], set: 'web_stress_de' },
  { t: 'Faulenzen', ok: ['chillen'], set: 'web_stress_de' },
  { t: 'Laberabend', ok: ['chillen'], set: 'web_stress_de' },
  { t: 'Gemuetlicher Abend', ok: ['chillen'], set: 'web_stress_de' },
  { t: 'Meditieren', ok: ['chillen'], set: 'web_stress_de' },
  { t: 'Schaufensterbummel', ok: ['shopping'], set: 'web_stress_de' },
  { t: 'Stoebertour', ok: ['shopping'], set: 'web_stress_de' },
  { t: 'Buecherladen', ok: ['shopping'], set: 'web_stress_de' },
  { t: 'Pflanzen kaufen', ok: ['shopping'], set: 'web_stress_de' },
  { t: 'Antikmarkt', ok: ['shopping'], set: 'web_stress_de' },
  { t: 'late night bite', ok: ['essen'], set: 'web_stress_en' },
  { t: 'craving sushi', ok: ['essen'], set: 'web_stress_en' },
  { t: 'food hall', ok: ['essen'], set: 'web_stress_en' },
  { t: 'cold one', ok: ['drinks'], set: 'web_stress_en' },
  { t: 'brewskis', ok: ['drinks'], set: 'web_stress_en' },
  { t: 'beer tasting', ok: ['drinks'], set: 'web_stress_en' },
  { t: 'bean juice', ok: ['kaffee'], set: 'web_stress_en' },
  { t: 'pour over', ok: ['kaffee'], set: 'web_stress_en' },
  { t: 'coffee break', ok: ['kaffee'], set: 'web_stress_en' },
  { t: 'pickup game', ok: ['sport'], set: 'web_stress_en' },
  { t: 'kickabout', ok: ['sport'], set: 'web_stress_en' },
  { t: 'gravel ride', ok: ['sport', 'outdoor'], set: 'web_stress_en' },
  { t: 'ramble', ok: ['outdoor'], set: 'web_stress_en' },
  { t: 'birdwatching', ok: ['outdoor'], set: 'web_stress_en' },
  { t: 'fire pit', ok: ['outdoor'], set: 'web_stress_en' },
  { t: 'boogie', ok: ['feiern'], set: 'web_stress_en' },
  { t: 'pregame', ok: ['feiern', 'drinks'], set: 'web_stress_en' },
  { t: 'warehouse rave', ok: ['feiern'], set: 'web_stress_en' },
  { t: 'film screening', ok: ['kultur'], set: 'web_stress_en' },
  { t: 'book talk', ok: ['kultur'], set: 'web_stress_en' },
  { t: 'performance art', ok: ['kultur'], set: 'web_stress_en' },
  { t: 'tabletop night', ok: ['spiele'], set: 'web_stress_en' },
  { t: 'co-op games', ok: ['spiele'], set: 'web_stress_en' },
  { t: 'pinball', ok: ['spiele'], set: 'web_stress_en' },
  { t: 'cram session', ok: ['lernen'], set: 'web_stress_en' },
  { t: 'focus block', ok: ['lernen'], set: 'web_stress_en' },
  { t: 'debugging session', ok: ['lernen'], set: 'web_stress_en' },
  { t: 'veg out', ok: ['chillen'], set: 'web_stress_en' },
  { t: 'decompress', ok: ['chillen'], set: 'web_stress_en' },
  { t: 'cozy night', ok: ['chillen'], set: 'web_stress_en' },
  { t: 'retail therapy', ok: ['shopping'], set: 'web_stress_en' },
  { t: 'plant shopping', ok: ['shopping'], set: 'web_stress_en' },
  { t: 'souvenir shopping', ok: ['shopping'], set: 'web_stress_en' },
];

// FRESH HOLDOUT — honest generalization probe.
// RULE: never copy these strings (or near-verbatim variants) into
// activityCategoryKnowledge.json. Their only job is to stay UNSEEN so the
// `free` score for set 'holdout_fresh' reflects real generalization, not
// memorization. If the leakage report flags one as exact/keyword, replace it
// with a genuinely novel phrase rather than promoting it into the examples.
const freshHoldoutTests = [
  { t: 'mir haengt der Magen in den Kniekehlen', ok: ['essen'], set: 'holdout_fresh' },
  { t: 'was Deftiges zwischen die Kiemen', ok: ['essen'], set: 'holdout_fresh' },
  { t: 'Teller leerputzen', ok: ['essen'], set: 'holdout_fresh' },
  { t: 'Bock auf was Warmes im Bauch', ok: ['essen'], set: 'holdout_fresh' },
  { t: 'schnell was auf die Hand holen', ok: ['essen'], set: 'holdout_fresh' },
  { t: 'die Kehle ist staubtrocken', ok: ['drinks'], set: 'holdout_fresh' },
  { t: 'ein Kaltgetraenk zischen', ok: ['drinks'], set: 'holdout_fresh' },
  { t: 'was Prickelndes aufmachen', ok: ['drinks'], set: 'holdout_fresh' },
  { t: 'auf einen Absacker treffen', ok: ['drinks'], set: 'holdout_fresh' },
  { t: 'Schorle am Kiosk holen', ok: ['drinks'], set: 'holdout_fresh' },
  { t: 'einen Braunen kippen', ok: ['kaffee'], set: 'holdout_fresh' },
  { t: 'brauche was Heisses mit Crema', ok: ['kaffee'], set: 'holdout_fresh' },
  { t: 'Milchschaum-Nachschub besorgen', ok: ['kaffee'], set: 'holdout_fresh' },
  { t: 'wach werden am Tresen', ok: ['kaffee'], set: 'holdout_fresh' },
  { t: 'die Muckis quaelen', ok: ['sport'], set: 'holdout_fresh' },
  { t: 'eine Schwitzeinheit einlegen', ok: ['sport'], set: 'holdout_fresh' },
  { t: 'Baelle flach halten auf dem Court', ok: ['sport'], set: 'holdout_fresh' },
  { t: 'im Studio richtig ackern', ok: ['sport'], set: 'holdout_fresh' },
  { t: 'auspowern beim Zirkeltraining', ok: ['sport'], set: 'holdout_fresh' },
  { t: 'die Nase in den Wind halten', ok: ['outdoor'], set: 'holdout_fresh' },
  { t: 'durch den Forst stromern', ok: ['outdoor'], set: 'holdout_fresh' },
  { t: 'ab an die frische Luft', ok: ['outdoor'], set: 'holdout_fresh' },
  { t: 'am Fluss entlang latschen', ok: ['outdoor'], set: 'holdout_fresh' },
  { t: 'den Gipfel angucken gehen', ok: ['outdoor'], set: 'holdout_fresh' },
  { t: 'die Huette zum Beben bringen', ok: ['feiern'], set: 'holdout_fresh' },
  { t: 'durchtanzen bis der Arzt kommt', ok: ['feiern'], set: 'holdout_fresh' },
  { t: 'Rambazamba machen', ok: ['feiern'], set: 'holdout_fresh' },
  { t: 'die Nacht zum Tag machen', ok: ['feiern'], set: 'holdout_fresh' },
  { t: 'sich was auf der Buehne angucken', ok: ['kultur'], set: 'holdout_fresh' },
  { t: 'ins Lichtspielhaus gehen', ok: ['kultur'], set: 'holdout_fresh' },
  { t: 'Gemaelde anschauen gehen', ok: ['kultur'], set: 'holdout_fresh' },
  { t: 'durch die Vernissage schlendern', ok: ['kultur'], set: 'holdout_fresh' },
  { t: 'die Wuerfel rollen lassen', ok: ['spiele'], set: 'holdout_fresh' },
  { t: 'Karten kloppen', ok: ['spiele'], set: 'holdout_fresh' },
  { t: 'die Konsole anschmeissen', ok: ['spiele'], set: 'holdout_fresh' },
  { t: 'eine Partie am Brett', ok: ['spiele'], set: 'holdout_fresh' },
  { t: 'Stoff bueffeln fuer die Klausur', ok: ['lernen'], set: 'holdout_fresh' },
  { t: 'Formeln reinpruegeln', ok: ['lernen'], set: 'holdout_fresh' },
  { t: 'ueber den Buechern hocken', ok: ['lernen'], set: 'holdout_fresh' },
  { t: 'Karteikarten durchackern', ok: ['lernen'], set: 'holdout_fresh' },
  { t: 'einfach auf der Couch abhaengen', ok: ['chillen'], set: 'holdout_fresh' },
  { t: 'die Fuesse hochlegen', ok: ['chillen'], set: 'holdout_fresh' },
  { t: 'nach der Woche runterkommen', ok: ['chillen'], set: 'holdout_fresh' },
  { t: 'nix tun und Serien schauen', ok: ['chillen'], set: 'holdout_fresh' },
  { t: 'die Laeden abklappern', ok: ['shopping'], set: 'holdout_fresh' },
  { t: 'neue Klamotten anprobieren', ok: ['shopping'], set: 'holdout_fresh' },
  { t: 'durch die Boutiquen ziehen', ok: ['shopping'], set: 'holdout_fresh' },
  { t: 'Schnaeppchen jagen im Center', ok: ['shopping'], set: 'holdout_fresh' },
  { t: 'grab a quick bite', ok: ['essen'], set: 'holdout_fresh' },
  { t: 'get a pint in', ok: ['drinks'], set: 'holdout_fresh' },
  { t: 'need my caffeine fix', ok: ['kaffee'], set: 'holdout_fresh' },
  { t: 'hit the weights', ok: ['sport'], set: 'holdout_fresh' },
  { t: 'get some fresh air outside', ok: ['outdoor'], set: 'holdout_fresh' },
  { t: 'dance till dawn', ok: ['feiern'], set: 'holdout_fresh' },
  { t: 'catch a show tonight', ok: ['kultur'], set: 'holdout_fresh' },
  { t: 'roll some dice', ok: ['spiele'], set: 'holdout_fresh' },
  { t: 'grind through the textbook', ok: ['lernen'], set: 'holdout_fresh' },
  { t: 'crash on the couch', ok: ['chillen'], set: 'holdout_fresh' },
  { t: 'hit the shops', ok: ['shopping'], set: 'holdout_fresh' },
];

// SECOND FRESH HOLDOUT — cut AFTER the keyword hardening round. Deliberately
// uses idioms whose head-words were NOT added to keywordBoosts, so its score is
// honest generalization (not coverage of the vocab we just curated). Same rule:
// never promote these strings into examples or keywords.
const freshHoldout2Tests = [
  { t: 'sich den Wanst vollschlagen', ok: ['essen'], set: 'holdout_fresh2' },
  { t: 'die Gabel schwingen', ok: ['essen'], set: 'holdout_fresh2' },
  { t: 'sich einen hinter die Binde kippen', ok: ['drinks'], set: 'holdout_fresh2' },
  { t: 'die Glaeser klingen lassen', ok: ['drinks'], set: 'holdout_fresh2' },
  { t: 'schwarzes Gold schluerfen', ok: ['kaffee'], set: 'holdout_fresh2' },
  { t: 'kurz zum Barista', ok: ['kaffee'], set: 'holdout_fresh2' },
  { t: 'eine Runde Eisen stemmen', ok: ['sport'], set: 'holdout_fresh2' },
  { t: 'den Puls hochtreiben', ok: ['sport'], set: 'holdout_fresh2' },
  { t: 'die Wanderstiefel schnueren', ok: ['outdoor'], set: 'holdout_fresh2' },
  { t: 'den Rucksack packen und los', ok: ['outdoor'], set: 'holdout_fresh2' },
  { t: 'die Tanzbeine schwingen', ok: ['feiern'], set: 'holdout_fresh2' },
  { t: 'auf die Tanze gehen', ok: ['feiern'], set: 'holdout_fresh2' },
  { t: 'sich einen Streifen reinziehen', ok: ['kultur'], set: 'holdout_fresh2' },
  { t: 'ins Schauspielhaus', ok: ['kultur'], set: 'holdout_fresh2' },
  { t: 'die Meeple aufstellen', ok: ['spiele'], set: 'holdout_fresh2' },
  { t: 'den Joystick schwingen', ok: ['spiele'], set: 'holdout_fresh2' },
  { t: 'die Nase ins Buch stecken', ok: ['lernen'], set: 'holdout_fresh2' },
  { t: 'den Lernberg abtragen', ok: ['lernen'], set: 'holdout_fresh2' },
  { t: 'die Seele streicheln lassen', ok: ['chillen'], set: 'holdout_fresh2' },
  { t: 'einen ruhigen Lenz schieben', ok: ['chillen'], set: 'holdout_fresh2' },
  { t: 'die Kreditkarte gluehen lassen', ok: ['shopping'], set: 'holdout_fresh2' },
  { t: 'neue Kicks besorgen', ok: ['shopping'], set: 'holdout_fresh2' },
];

const tests = [
  ...regressionTests,
  ...holdoutTests,
  ...webStressTests,
  ...freshHoldoutTests,
  ...freshHoldout2Tests,
];

function normalizeInput(input) {
  return input
    .toLowerCase()
    .replace(/ä|Ã¤/g, 'ae')
    .replace(/ö|Ã¶/g, 'oe')
    .replace(/ü|Ã¼/g, 'ue')
    .replace(/ß|ÃŸ/g, 'ss')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '');
}

function normalizeForLeakage(input) {
  return normalizeInput(input).replace(/[^a-z0-9]+/g, ' ').trim();
}

function leakageFor(title) {
  const normalized = normalizeForLeakage(title);
  const keywordHits = KEYWORD_BOOSTS.filter((boost) => boost.pattern.test(normalized)).map(
    (boost) => boost.category,
  );

  return {
    exactExample: NORMALIZED_EXAMPLES.has(normalized),
    keywordHit: keywordHits.length > 0,
    keywordHits,
  };
}

function tensorRows(tensor) {
  const dims = tensor.dims;
  const rows = dims.length === 1 ? 1 : dims[0];
  const cols = dims.length === 1 ? dims[0] : dims[1];
  const data = Array.from(tensor.data);
  return Array.from({ length: rows }, (_, row) => data.slice(row * cols, (row + 1) * cols));
}

function average(vectors) {
  const sum = new Array(vectors[0].length).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < vector.length; i += 1) sum[i] += vector[i];
  }
  return normalize(sum.map((value) => value / vectors.length));
}

function normalize(vector) {
  const magnitude = Math.hypot(...vector) || 1;
  return vector.map((value) => value / magnitude);
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

function applyBoosts(title, scores) {
  const normalized = normalizeInput(title);
  const boosted = { ...scores };
  for (const boost of KEYWORD_BOOSTS) {
    if (boost.pattern.test(normalized)) {
      boosted[boost.category] = (boosted[boost.category] ?? 0) + boost.boost;
    }
  }
  return boosted;
}

// Prototype scoring strategy. 'centroid' = one averaged vector per category
// (blurry for broad categories, collapses ties onto "central" categories like
// chillen/outdoor). 'max' = nearest single example (breaks the centroid tie
// pathology, mirrors the lexical runtime's Math.max over examples). 'top3' =
// mean of the 3 nearest examples (nearest-neighbour, less sensitive to one
// stray example). Set PROTO_STRATEGY=compare to print all three side by side.
//
// Default is 'top3': measured on the fresh holdout it lifts honest free-case
// accuracy from 36% (centroid) to 56% with no new examples — the centroid
// blurred broad categories and collapsed ties onto chillen/outdoor. This is
// the target scoring for an eventual on-device embedding runtime.
const PROTO_STRATEGY = process.env.PROTO_STRATEGY || 'top3';

function rawScoresFor(strategy, queryVector, centroids, exampleVectors) {
  const out = {};
  for (const category of Object.keys(centroids)) {
    if (strategy === 'centroid') {
      out[category] = dot(queryVector, centroids[category]);
      continue;
    }
    const sims = exampleVectors[category].map((vector) => dot(queryVector, vector));
    if (strategy === 'max') {
      out[category] = Math.max(...sims);
    } else {
      sims.sort((a, b) => b - a);
      const k = Math.min(3, sims.length);
      out[category] = sims.slice(0, k).reduce((sum, value) => sum + value, 0) / k;
    }
  }
  return out;
}

function classify(title, rawScores) {
  const boostedScores = applyBoosts(title, rawScores);
  const sorted = Object.entries(boostedScores).sort((a, b) => b[1] - a[1]);
  const [primary, primaryScore] = sorted[0];
  const [secondary, secondaryScore] = sorted[1] ?? ['sonstiges', 0];
  const margin = primaryScore - secondaryScore;

  return {
    primary,
    secondary,
    confidence: Number(primaryScore.toFixed(3)),
    margin: Number(margin.toFixed(3)),
    // Threshold is centroid-calibrated; `accepted` is only comparable within a
    // strategy, not across them. Accuracy (ok / free) is the cross-strategy signal.
    ambiguous: primaryScore < 0.58 || margin < 0.07,
    rawPrimary: Object.entries(rawScores).sort((a, b) => b[1] - a[1])[0][0],
  };
}

// ---- 'lexical' strategy: an exact mirror of the SHIPPING runtime ----
// src/features/activities/utils/activityUnderstanding.ts uses token overlap, not
// embeddings. This lets us measure what actually ships (no model, instant).
// KEEP IN SYNC with activityUnderstanding.ts (lexicalSimilarity + normalize).
function normalizeForRuntime(input) {
  return input
    .toLowerCase()
    .replace(/ä|Ã¤/g, 'ae')
    .replace(/ö|Ã¶/g, 'oe')
    .replace(/ü|Ã¼/g, 'ue')
    .replace(/ß|ÃŸ/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenizeRuntime(input) {
  return new Set(input.split(/\s+/).filter(Boolean));
}

function isSubsetRuntime(needles, haystack) {
  for (const needle of needles) if (!haystack.has(needle)) return false;
  return true;
}

function lexicalSimilarity(titleTokens, example) {
  const exampleTokens = tokenizeRuntime(normalizeForRuntime(example));
  const overlap = [...titleTokens].filter((token) => exampleTokens.has(token)).length;
  const phraseBonus = exampleTokens.size > 0 && isSubsetRuntime(exampleTokens, titleTokens) ? 0.18 : 0;
  const compactTitle = [...titleTokens].join('');
  const compactExample = [...exampleTokens].join('');
  const compoundBonus =
    compactExample.length >= 4 &&
    compactTitle.length >= 4 &&
    (compactTitle.includes(compactExample) || compactExample.includes(compactTitle))
      ? 0.12
      : 0;
  const denominator = Math.max(titleTokens.size, exampleTokens.size, 1);
  return overlap / denominator + phraseBonus + compoundBonus;
}

function lexicalRawScores(title) {
  const titleTokens = tokenizeRuntime(normalizeForRuntime(title));
  const out = {};
  for (const [category, examples] of Object.entries(CATEGORY_EXAMPLES)) {
    out[category] = Math.max(...examples.map((example) => lexicalSimilarity(titleTokens, example)));
  }
  return out;
}

function summarize(name, rows) {
  const ok = rows.filter((row) => row.ok.includes(row.primary)).length;
  const accepted = rows.filter((row) => !row.ambiguous).length;
  const avgMs = rows.reduce((sum, row) => sum + row.elapsedMs, 0) / rows.length;
  const exact = rows.filter((row) => row.leakage.exactExample).length;
  const keyword = rows.filter((row) => !row.leakage.exactExample && row.leakage.keywordHit).length;
  const freeRows = rows.filter((row) => !row.leakage.exactExample && !row.leakage.keywordHit);
  const freeOk = freeRows.filter((row) => row.ok.includes(row.primary)).length;
  console.log(
    `${name}: ${ok}/${rows.length} = ${Math.round((ok / rows.length) * 100)}% | accepted ${accepted}/${rows.length} | avg ${Math.round(avgMs)}ms | exact ${exact}, keyword ${keyword}, free ${freeOk}/${freeRows.length}`,
  );

  for (const row of rows.filter((x) => !x.ok.includes(x.primary)).slice(0, 30)) {
    console.log(
      `  MISS "${row.t}" -> ${row.primary} (${row.confidence}, margin ${row.margin}, secondary ${row.secondary}, raw ${row.rawPrimary}), erwartet ${row.ok.join('/')}`,
    );
  }
}

async function embedMany(extractor, texts, prefix) {
  const output = await extractor(
    texts.map((text) => `${prefix}${text}`),
    { pooling: 'mean', normalize: true },
  );
  return tensorRows(output);
}

async function evaluateModel(model) {
  const strategies = PROTO_STRATEGY === 'compare' ? ['centroid', 'max', 'top3'] : [PROTO_STRATEGY];
  const needsEmbeddings = strategies.some((strategy) => strategy !== 'lexical');

  const config = MODEL_CONFIGS[model] ?? { examplePrefix: '', queryPrefix: '' };
  const categoryCentroids = {};
  const categoryExampleVectors = {};
  const queryVectors = [];
  const queryMs = tests.map(() => 0);
  let loadMs = 0;
  let buildMs = 0;
  let runtimeName = 'lexical-only (no model)';

  if (needsEmbeddings) {
    const runtime = model.startsWith('onnx-community/')
      ? { name: '@huggingface/transformers', pipeline: hfPipeline }
      : { name: '@xenova/transformers', pipeline: xenovaPipeline };
    runtimeName = runtime.name;
    const loadStarted = performance.now();
    const extractor = await runtime.pipeline('feature-extraction', model, { quantized: true });
    loadMs = performance.now() - loadStarted;

    const buildStarted = performance.now();
    for (const [category, examples] of Object.entries(CATEGORY_EXAMPLES)) {
      const vectors = await embedMany(extractor, examples, config.examplePrefix);
      categoryExampleVectors[category] = vectors;
      categoryCentroids[category] = average(vectors);
    }
    buildMs = performance.now() - buildStarted;

    // EXPORT_VECTORS=1 writes the per-example embeddings as a bundled artifact
    // for the on-device Tier-2 provider (top3 over these vectors at runtime).
    // Same model + prefixes the provider must use so the vectors match.
    if (process.env.EXPORT_VECTORS) {
      const dim = categoryExampleVectors[Object.keys(categoryExampleVectors)[0]][0].length;
      const categories = {};
      for (const [category, vectors] of Object.entries(categoryExampleVectors)) {
        const flat = new Float32Array(vectors.length * dim);
        vectors.forEach((vector, index) => flat.set(vector, index * dim));
        categories[category] = {
          count: vectors.length,
          data: Buffer.from(flat.buffer).toString('base64'),
        };
      }
      const artifact = {
        model,
        dim,
        examplePrefix: config.examplePrefix,
        queryPrefix: config.queryPrefix,
        categories,
      };
      const outPath = path.resolve('src/features/activities/data/activityCategoryVectors.json');
      writeFileSync(outPath, JSON.stringify(artifact));
      const totalVectors = Object.values(categories).reduce((sum, c) => sum + c.count, 0);
      console.log(`EXPORTED ${outPath}`);
      console.log(`  dim=${dim} categories=${Object.keys(categories).length} vectors=${totalVectors}`);
      return;
    }

    // Embed every query once, then score each strategy off the same vectors so
    // the comparison is apples-to-apples (and cheap — only dot products differ).
    for (let index = 0; index < tests.length; index += 1) {
      const started = performance.now();
      const [queryVector] = await embedMany(extractor, [tests[index].t], config.queryPrefix);
      queryMs[index] = performance.now() - started;
      queryVectors.push(queryVector);
    }
  }

  console.log('');
  console.log(`MODEL=${needsEmbeddings ? model : '(none)'}`);
  console.log(`RUNTIME=${runtimeName}`);
  console.log(`KNOWLEDGE=${knowledgePath}`);
  console.log(`CACHE_DIR=${cacheDir}`);
  console.log(`LOAD_MS=${Math.round(loadMs)} PROTOTYPE_BUILD_MS=${Math.round(buildMs)}`);

  for (const strategy of strategies) {
    const rows = tests.map((test, index) => {
      const rawScores =
        strategy === 'lexical'
          ? lexicalRawScores(test.t)
          : rawScoresFor(strategy, queryVectors[index], categoryCentroids, categoryExampleVectors);
      return {
        ...test,
        ...classify(test.t, rawScores),
        elapsedMs: queryMs[index],
        leakage: leakageFor(test.t),
      };
    });
    console.log(`\n=== PROTO_STRATEGY=${strategy} ===`);
    for (const setName of [...new Set(rows.map((row) => row.set))]) {
      summarize(setName, rows.filter((row) => row.set === setName));
    }
    summarize('all', rows);
  }
}

for (const model of models) {
  await evaluateModel(model);
}
