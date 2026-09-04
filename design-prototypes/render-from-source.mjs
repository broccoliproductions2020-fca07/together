/**
 * Renders the activity marker from the REAL geometry in
 * src/features/map/components/activityMarkerLayout.ts — no reimplementation.
 * Every path, width and clock length below comes out of the shipped module, so
 * this preview cannot drift from the app the way a hand-built lookalike does.
 *
 *   node design-prototypes/render-from-source.mjs
 *
 * Writes design-prototypes/map-marker-shipped.html.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

function load(relativePath, dependencies = {}) {
  const url = new URL(relativePath, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: url.pathname,
  });
  const module = { exports: {} };
  new Function('exports', 'module', 'require', compiled.outputText)(
    module.exports,
    module,
    (id) => dependencies[id] ?? {},
  );
  return module.exports;
}

const SRC = '../src/features/map/';
const perspective = load(`${SRC}utils/mapPerspective.ts`);
const L = load(`${SRC}components/activityMarkerLayout.ts`, {
  '../utils/mapPerspective': perspective,
});
const detail = load(`${SRC}utils/markerDetailLevel.ts`);
const styles = load(`${SRC}utils/markerStyles.ts`);

const W = L.ACTIVITY_MARKER_CAPTURE_WIDTH;
const H = L.ACTIVITY_MARKER_CAPTURE_HEIGHT;
const CX = W / 2;
const CY = L.ACTIVITY_MARKER_SHELL_TOP + L.ACTIVITY_MARKER_SHELL_HEIGHT / 2;
const MODE = { now: 'rgb(65,192,141)', soon: 'rgb(224,162,62)', open: 'rgb(59,130,246)' };
const PLATE = '#E3E8ED';
const CATEGORY_COIN = 14;
const UNREAD_BADGE = 16;
const BADGE_TOP_OVERHANG = 5;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
let seq = 0;

/** Mirrors the face sizing in ActivityMarkerChrome. */
function faceSizes(solo) {
  return solo
    ? [L.ACTIVITY_MARKER_SOLO_FACE, L.ACTIVITY_MARKER_SOLO_FACE, L.ACTIVITY_MARKER_SOLO_FACE]
    : [L.ACTIVITY_MARKER_CITY_FACE, 18, L.ACTIVITY_MARKER_GROUP_FACE_STREET];
}

function marker({ faces, count, title, accent, progress = 1, remaining = null, category = false, unread = 0 }) {
  const g = `m${(seq += 1)}`;
  const solo = count <= 1;
  const slots = detail.buildMarkerFaces(faces, count);
  const faceCount = Math.max(1, slots.length);

  const shellW = L.activityMarkerShellWidth(faceCount, solo, progress);
  const titleW = L.activityMarkerTitleWidth(title);
  const titleH = L.activityMarkerTitleHeight(title);
  const reveal = L.activityMarkerTitleReveal(progress, false, Boolean(title));
  const sectionW = L.activityMarkerTitleSectionWidth(shellW, titleW, reveal);
  const cardW = L.activityMarkerCardWidthForShell(shellW, titleW, reveal);
  const board = L.activityMarkerBoardPath(shellW, sectionW, reveal, titleH);
  const shellPath = L.activityMarkerShellPath(shellW);
  const shellX = CX - shellW / 2;

  const [city, nb, street] = faceSizes(solo);
  const size = progress <= 0.5 ? city + (nb - city) * (progress / 0.5) : nb + (street - nb) * ((progress - 0.5) / 0.5);
  const grid = detail.quadCenters(faceCount, CX, CY, L.ACTIVITY_MARKER_QUAD_SPREAD);
  const row = detail.rowCenters(faceCount, CX, CY, street, L.ACTIVITY_MARKER_ROW_STEP);
  const mix = Math.max(0, Math.min(1, (progress - 0.5) / 0.5));
  const pts = grid.map((gp, i) => {
    const rp = row[i] ?? row[row.length - 1];
    return { x: gp.x + (rp.x - gp.x) * mix, y: gp.y + (rp.y - gp.y) * mix };
  });

  const hasClock = remaining != null;
  const finTop = L.activityMarkerFinTopY(titleH * reveal);
  const groundW = L.activityMarkerGroundWidthForCard(cardW);
  const stage = (1 - reveal) * titleH;

  let ring = '';
  if (hasClock) {
    const per = L.activityMarkerShellPerimeter(shellW);
    const dash = per * Math.max(0, Math.min(1, remaining));
    const off = dash + per - L.activityMarkerShellClockStart(shellW);
    ring = `<path d="${shellPath}" fill="none" stroke="rgba(255,255,255,.94)" stroke-width="5"/>
      <path d="${shellPath}" fill="none" stroke="${styles.colorWithAlpha(accent, 0.3)}" stroke-width="3"/>
      <path d="${shellPath}" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round"
            stroke-dasharray="${dash} ${per}" stroke-dashoffset="${off}"/>`;
  }

  const plate = (f, i) => {
    const s = size, r = s * L.ACTIVITY_MARKER_FACE_RADIUS_RATIO, p = pts[i];
    const over = Boolean(f.overflowLabel);
    return `<g><rect x="${p.x - s / 2}" y="${p.y - s / 2}" width="${s}" height="${s}" rx="${r}"
      fill="${over ? '#101619' : PLATE}"${solo ? '' : ' stroke="#fff" stroke-width="1.4"'}/>
      <text x="${p.x}" y="${p.y}" font-size="${s > 24 ? 15 : 8}" font-weight="800"
        fill="${over ? '#fff' : '#28323B'}" text-anchor="middle" dominant-baseline="central"
        font-family="ui-sans-serif,system-ui">${esc(f.overflowLabel ?? f.initials ?? '')}</text></g>`;
  };

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>
    <linearGradient id="${g}f" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F1F3F6"/></linearGradient>
    <radialGradient id="${g}s" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#101619" stop-opacity=".30"/><stop offset=".55" stop-color="#101619" stop-opacity=".11"/><stop offset="1" stop-color="#101619" stop-opacity="0"/></radialGradient>
    <radialGradient id="${g}a" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#101619" stop-opacity=".30"/><stop offset="1" stop-color="#101619" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="${CX}" cy="${L.ACTIVITY_MARKER_GROUND_Y}" rx="${groundW / 2}" ry="${L.ACTIVITY_MARKER_GROUND_HEIGHT / 2}" fill="url(#${g}s)"/>
    <ellipse cx="${CX}" cy="${L.ACTIVITY_MARKER_GROUND_Y}" rx="9" ry="2.5" fill="url(#${g}a)"/>
    <path d="M ${CX - 2.4} ${finTop} L ${CX - 1.2} ${L.ACTIVITY_MARKER_FIN_END_Y} L ${CX + 1.2} ${L.ACTIVITY_MARKER_FIN_END_Y} L ${CX + 2.4} ${finTop} Z" fill="${styles.darkenColor(accent, 0.8)}"/>
    <circle cx="${CX}" cy="${L.ACTIVITY_MARKER_GROUND_Y}" r="2.4" fill="${accent}" stroke="#fff" stroke-width="1"/>
    <g transform="translate(0 ${stage})">
      <path d="${board}" fill="url(#${g}f)" stroke="rgba(15,20,23,.05)" stroke-width="1"/>
      ${ring}
      ${reveal > 0.001 && title ? `<text opacity="${reveal}" x="${CX}" y="${L.ACTIVITY_MARKER_TITLE_TOP + titleH / 2}" font-size="${L.ACTIVITY_MARKER_TITLE_FONT_SIZE}" font-weight="700" fill="#151B20" text-anchor="middle" dominant-baseline="central" font-family="ui-sans-serif,system-ui">${esc(title)}</text>` : ''}
      ${slots.map(plate).join('')}
      ${category ? `<circle cx="${shellX}" cy="${L.ACTIVITY_MARKER_SHELL_TOP - BADGE_TOP_OVERHANG + CATEGORY_COIN / 2}" r="${CATEGORY_COIN / 2}" fill="#101619" stroke="#fff" stroke-width="1.5"/>` : ''}
      ${unread > 0 ? (() => {
        const label = unread > 99 ? '99+' : String(unread);
        const badgeWidth = label.length === 1 ? UNREAD_BADGE : label.length === 2 ? 20 : 27;
        const x = shellX + shellW + UNREAD_BADGE / 2 - badgeWidth;
        const y = L.ACTIVITY_MARKER_SHELL_TOP - BADGE_TOP_OVERHANG;
        return `<g><rect x="${x}" y="${y}" width="${badgeWidth}" height="${UNREAD_BADGE}" rx="${UNREAD_BADGE / 2}" fill="#FF3B30" stroke="#fff" stroke-width="1.5"/>
        <text x="${x + badgeWidth / 2}" y="${y + UNREAD_BADGE / 2}" font-size="8.5" font-weight="800" fill="#fff" text-anchor="middle" dominant-baseline="central" font-family="ui-sans-serif,system-ui">${label}</text></g>`;
      })() : ''}
    </g>
  </svg>`;
}

/* ── scene ───────────────────────────────────────────────────────────── */
const av = (...xs) => xs.map((i, n) => ({ userId: `u${n}`, displayName: i, initials: i }));
const SCENE = [
  { x: 78, y: 104, faces: av('LM'), count: 1, title: 'Grillen im Park', accent: MODE.now, remaining: 0.38 },
  { x: 236, y: 214, faces: av('JK', 'AS', 'MR'), count: 6, title: 'Feierabendbier', accent: MODE.soon, remaining: 0.72, unread: 3 },
  { x: 118, y: 322, faces: av('TN', 'BW'), count: 2, title: 'Kaffee', accent: MODE.open, remaining: null },
  { x: 308, y: 300, faces: av('SD'), count: 1, title: 'Bouldern', accent: MODE.now, remaining: 0.9, category: true },
  { x: 96, y: 452, faces: av('PL', 'KH', 'RS'), count: 3, title: 'Kino heute Abend', accent: MODE.soon, remaining: 0.2 },
  { x: 286, y: 536, faces: av('EV'), count: 1, title: 'Laufrunde', accent: MODE.now, remaining: 0.55 },
];

function mapBg(night) {
  const g = night
    ? { ground: '#212121', block: '#2B2B2B', edge: '#3A3A3A', road: '#E8D6AE', minor: '#6E6353', park: '#1E2A20', water: '#17242E' }
    : { ground: '#F1F1F1', block: '#E6E6E6', edge: '#DBDBDB', road: '#FFFFFF', minor: '#F7F7F7', park: '#DCE8D5', water: '#C9DDE8' };
  const blocks = [[14,40,96,74],[126,26,104,88],[246,52,118,62],[18,140,88,96],[122,146,58,60],[196,138,74,84],
    [286,150,86,70],[24,268,110,66],[150,258,92,88],[262,272,104,58],[16,388,80,74],[112,396,120,52],
    [248,378,116,90],[28,494,104,72],[152,500,86,64],[258,486,108,80]];
  return `<svg width="390" height="600" viewBox="0 0 390 600" style="position:absolute;inset:0">
    <rect width="390" height="600" fill="${g.ground}"/><rect x="0" y="330" width="390" height="44" fill="${g.water}"/>
    <rect x="180" y="0" width="26" height="600" fill="${g.minor}"/><rect x="0" y="238" width="390" height="22" fill="${g.minor}"/>
    <rect x="0" y="120" width="390" height="14" fill="${g.road}"/><rect x="106" y="0" width="12" height="600" fill="${g.road}"/>
    <rect x="0" y="466" width="390" height="14" fill="${g.road}"/><rect x="272" y="0" width="10" height="600" fill="${g.road}"/>
    <rect x="288" y="404" width="94" height="54" rx="6" fill="${g.park}"/>
    ${blocks.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${g.block}" stroke="${g.edge}" stroke-width="1"/>`).join('')}
  </svg>`;
}

const anchorY = L.ACTIVITY_MARKER_ANCHOR.y;
const panel = (night) => `<div><div class="ph">${night ? 'Nacht' : 'Tag'}</div><div class="panel">${mapBg(night)}
  ${SCENE.map((s) => `<div class="mk" style="left:${s.x - W / 2}px;top:${s.y - anchorY * H}px">${marker(s)}</div>`).join('')}
</div></div>`;

const clockRow = [1, 0.75, 0.5, 0.25, 0.05, null]
  .map((r) => `<div class="c"><div class="bed">${marker({ faces: av('JK', 'AS', 'MR'), count: 6, title: 'Feierabendbier', accent: MODE.soon, remaining: r })}</div>
    <div class="l">${r == null ? 'keine feste Zeit' : Math.round(r * 100) + ' %'}</div></div>`).join('');

const soloRow = [1, 0.6, 0.25, null]
  .map((r) => `<div class="c"><div class="bed n">${marker({ faces: av('LM'), count: 1, title: 'Grillen im Park', accent: MODE.now, remaining: r })}</div>
    <div class="l">${r == null ? 'keine feste Zeit' : Math.round(r * 100) + ' %'}</div></div>`).join('');

const zoomRow = [0, 0.35, 0.7, 1]
  .map((p) => `<div class="c"><div class="bed">${marker({ faces: av('JK', 'AS', 'MR'), count: 6, title: 'Feierabendbier', accent: MODE.soon, progress: p, remaining: 0.62 })}</div>
    <div class="l">Zoom ${p}</div></div>`).join('');

writeFileSync(new URL('map-marker-shipped.html', import.meta.url), `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Marker — so wie er ausgeliefert wird</title><style>
*{box-sizing:border-box}body{margin:0;background:#EDEFF2;font:13px/1.55 ui-sans-serif,system-ui,"Segoe UI",Roboto,sans-serif;color:#0F1417}
.wrap{padding:26px 24px 40px}h1{font-size:21px;margin:0 0 4px;letter-spacing:-.02em}
.lede{color:#5A6570;margin:0 0 8px;max-width:104ch}
.src{display:inline-block;font-size:11.5px;background:#E4F7EF;color:#177453;border-radius:99px;padding:3px 10px;font-weight:600;margin-bottom:18px}
h2{font-size:15px;margin:26px 0 10px}
.card{background:#fff;border:1px solid rgba(15,20,23,.09);border-radius:16px;padding:14px 16px 10px;margin-bottom:14px}
.row{display:flex;gap:8px;flex-wrap:wrap}.c{text-align:center}
.bed{background:#F1F1F1;border-radius:11px;display:inline-block;width:${W * 2}px;height:${H * 2}px}
.bed.n{background:#212121}.bed svg{display:block;transform:scale(2);transform-origin:top left}
.l{font-size:10.5px;color:#8A939B;padding-top:3px;font-variant-numeric:tabular-nums}
.panels{display:flex;gap:16px}.ph{font-size:13px;font-weight:700;padding:0 4px 7px}
.panel{position:relative;width:390px;height:600px;border-radius:26px;overflow:hidden;box-shadow:0 1px 2px rgba(15,20,23,.10),0 10px 26px rgba(15,20,23,.13)}
.mk{position:absolute}.mk svg{display:block}
table{border-collapse:collapse;font-size:12.5px;margin-top:4px}td{padding:5px 14px 5px 0}td.n{font-variant-numeric:tabular-nums;font-weight:600}
</style></head><body><div class="wrap">
<h1>Marker — so wie er ausgeliefert wird</h1>
<p class="lede">Jeder Pfad, jede Breite und jede Ringlänge hier stammt aus <code>activityMarkerLayout.ts</code>. Diese Seite kann nicht vom Code abweichen — sie führt ihn aus.</p>
<div class="src">aus dem Quelltext gerendert · <code>node design-prototypes/render-from-source.mjs</code></div>

<h2>Die Uhr läuft leer · 12 Uhr, im Uhrzeigersinn</h2>
<div class="card"><div class="row">${clockRow}</div></div>

<h2>Solo bei Nacht</h2>
<div class="card"><div class="row">${soloRow}</div></div>

<h2>Beim Zoomen: Quadrat wird Reihe, Titel klappt auf</h2>
<div class="card"><div class="row">${zoomRow}</div></div>

<h2>Auf der Karte, echte Größe</h2>
<div class="panels">${panel(false)}${panel(true)}</div>

<h2>Maße</h2>
<div class="card"><table>
<tr><td>Leinwand</td><td class="n">${W} × ${H}</td><td>vorher 160 × 150</td></tr>
<tr><td>Schale</td><td class="n">${L.ACTIVITY_MARKER_SHELL_HEIGHT} hoch, Radius ${L.ACTIVITY_MARKER_SHELL_RADIUS}</td><td>Squircle, keine Pille</td></tr>
<tr><td>Titelband</td><td class="n">${L.ACTIVITY_MARKER_TITLE_ONE_LINE_HEIGHT} / ${L.ACTIVITY_MARKER_TITLE_TWO_LINE_HEIGHT}</td><td>unten weich gerundet</td></tr>
<tr><td>Übergang</td><td class="n">horizontal</td><td>keine Schräge zwischen Profilen und Titel</td></tr>
<tr><td>Sockel</td><td class="n">entfernt</td><td>keine farbige Unterkante</td></tr>
<tr><td>Oberkante bis Boden</td><td class="n">${L.ACTIVITY_MARKER_GROUND_Y - L.ACTIVITY_MARKER_SHELL_TOP} px</td><td>vorher 102</td></tr>
</table></div>
</div></body></html>`);

console.log('geschrieben: design-prototypes/map-marker-shipped.html');
console.log(`  Leinwand ${W}×${H}, Anker y=${anchorY.toFixed(4)}`);
console.log(`  Schale Radius ${L.activityMarkerShellRadius(116)} bei 116 breit`);
console.log(`  Ring-Umfang ${L.activityMarkerShellPerimeter(116).toFixed(1)}, 12-Uhr bei ${L.activityMarkerShellClockStart(116).toFixed(1)}`);
