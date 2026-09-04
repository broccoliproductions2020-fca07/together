/* Marker-Geometrie fuer die Design-Studie.
   "cur" ist 1:1 aus src/features/map/components/activityMarkerLayout.ts portiert,
   die anderen drei sind die Vorschlaege. Jede Form meldet ihre Leinwand und ihren
   Ankerpunkt (der Punkt, der auf der Kartenkoordinate sitzt), damit die Szene sie
   genauso platzieren kann wie react-native-maps es tut. */
(function (global) {
  const PITCH = (38 * Math.PI) / 180;
  const DOWN = Math.sin(PITCH);
  const FLAT = Math.cos(PITCH);

  const MODE = { now: '#41C08D', soon: '#E0A23E', open: '#3B82F6' };

  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function rr(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    return (
      `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h - r} ` +
      `Q ${x + w} ${y + h} ${x + w - r} ${y + h} L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} ` +
      `L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`
    );
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const m = (v) => Math.round(Math.min(255, v * f));
    return `rgb(${m((n >> 16) & 255)},${m((n >> 8) & 255)},${m(n & 255)})`;
  }

  /** Mirrors glyphWidthEm() in activityMarkerLayout.ts so widths match the app. */
  function textW(s, px) {
    return Array.from(s || '').reduce((w, c) => {
      if ((c.codePointAt(0) || 0) > 0x2e80) return w + px;
      if (/\s/u.test(c)) return w + 0.33 * px;
      if (/[ilIjtfr.,:;!'|]/u.test(c)) return w + 0.31 * px;
      if (/[MW@#%&ÄÖÜQG]/u.test(c)) return w + 0.88 * px;
      if (/[A-Z0-9]/u.test(c)) return w + 0.64 * px;
      return w + 0.54 * px;
    }, 0);
  }

  function clip(s, px, max) {
    if (textW(s, px) <= max) return s;
    let out = s;
    while (out.length > 1 && textW(out + '…', px) > max) out = out.slice(0, -1);
    return out.trimEnd() + '…';
  }

  /** `tone` picks the avatar-plate colour: 'warm' is today's #EFEAE1 sandstone,
   *  'cool' the near-neutral the redesigns use. */
  function faceGlyph(f, size, radius, fs, bw, bc, tone) {
    const bg = f.o ? '#141A1F' : tone === 'warm' ? '#EFEAE1' : '#E3E8ED';
    const fg = f.o ? '#fff' : tone === 'warm' ? '#14211C' : '#2A343D';
    return (
      `<g><rect x="${f.x - size / 2}" y="${f.y - size / 2}" width="${size}" height="${size}" rx="${radius}" ` +
      `fill="${bg}"${bw ? ` stroke="${bc}" stroke-width="${bw}"` : ''}/>` +
      `<text x="${f.x}" y="${f.y}" font-size="${fs}" font-weight="800" fill="${fg}" text-anchor="middle" ` +
      `dominant-baseline="central" font-family="ui-sans-serif,system-ui">${esc(f.label || '')}</text></g>`
    );
  }

  function quad(n, cx, cy, h) {
    if (n === 1) return [{ x: cx, y: cy }];
    if (n === 2) return [{ x: cx - h, y: cy }, { x: cx + h, y: cy }];
    if (n === 3) return [{ x: cx - h, y: cy - h }, { x: cx + h, y: cy - h }, { x: cx, y: cy + h }];
    return [
      { x: cx - h, y: cy - h }, { x: cx + h, y: cy - h },
      { x: cx - h, y: cy + h }, { x: cx + h, y: cy + h },
    ];
  }

  const uid = (() => { let i = 0; return () => `g${(i += 1)}`; })();

  /* ───────────────────────── HEUTE ───────────────────────── */
  const K = {
    W: 160, H: 150, top: 6, h: 48, r: 16, slab: 4,
    t1: 26, t2: 34, finEnd: 98, groundY: 108, gDepth: 14, fStreet: 42, step: 32,
  };
  K.off = K.slab * DOWN;
  K.join = K.top + K.h;
  K.gH = K.gDepth * FLAT;
  K.cx = K.W / 2;

  function curPath(sw, tw, rev, th) {
    const y0 = K.top, jy = K.join, by = jy + th * rev;
    const hw = sw / 2, bhw = tw / 2, tl = K.cx - hw, tr = K.cx + hw;
    const R = Math.min(K.r, hw, K.h / 2);
    if (rev <= 0.001) return rr(tl, y0, sw, K.h, R);
    const bl = K.cx - bhw, br = K.cx + bhw, bh = by - jy;
    const t = Math.min(10, bh * 0.34), bR = Math.min(13, bhw, bh * 0.42);
    return [
      `M ${K.cx} ${y0}`, `L ${tr - R} ${y0}`, `Q ${tr} ${y0} ${tr} ${y0 + R}`, `L ${tr} ${jy - t}`,
      `C ${tr} ${jy - t * 0.35} ${br} ${jy + t * 0.35} ${br} ${jy + t}`, `L ${br} ${by - bR}`,
      `Q ${br} ${by} ${br - bR} ${by}`, `L ${bl + bR} ${by}`, `Q ${bl} ${by} ${bl} ${by - bR}`,
      `L ${bl} ${jy + t}`, `C ${bl} ${jy + t * 0.35} ${tl} ${jy - t * 0.35} ${tl} ${jy - t}`,
      `L ${tl} ${y0 + R}`, `Q ${tl} ${y0} ${tl + R} ${y0}`, 'Z',
    ].join(' ');
  }

  function renderCurrent(c) {
    const n = c.faces.length, solo = c.solo, p = c.progress, g = uid();
    const sw = solo ? 48 : p < 1 ? 50 : K.fStreet + (n - 1) * K.step + 10;
    const raw = c.title ? Math.ceil(textW(c.title, 11) + 18) : 0;
    const tw = raw ? Math.max(56, Math.min(148, raw)) : 0;
    const th = raw ? (raw > 148 ? K.t2 : K.t1) : 0;
    const rev = c.title && p > 0.55 ? 1 : 0;
    const sec = sw + (tw - sw) * rev;
    const d = curPath(sw, sec, rev, th);
    const finTop = K.join + th * rev - 3;
    const fin =
      `M ${K.cx - 6.5} ${finTop} C ${K.cx - 6} ${finTop + 4}, ${K.cx - 4} ${K.finEnd - 2}, ${K.cx - 2} ${K.finEnd} ` +
      `C ${K.cx - 1} ${K.finEnd + 1}, ${K.cx + 1} ${K.finEnd + 1}, ${K.cx + 2} ${K.finEnd} ` +
      `C ${K.cx + 4} ${K.finEnd - 2}, ${K.cx + 6} ${finTop + 4}, ${K.cx + 6.5} ${finTop} Z`;
    const gW = Math.max(30, Math.max(sw, sec) * 0.62);
    const size = solo ? 43 : p < 1 ? 17 : K.fStreet;
    const cy = K.top + K.h / 2;
    let pts;
    if (p < 1 && !solo) pts = quad(n, K.cx, cy, 8.5);
    else {
      const tot = size + (n - 1) * K.step, f0 = K.cx - tot / 2 + size / 2;
      pts = c.faces.map((_, i) => ({ x: f0 + i * K.step, y: cy }));
    }
    const fs = c.faces.map((f, i) => ({ ...f, ...pts[i] }));
    return `<svg width="${K.W}" height="${K.H}" viewBox="0 0 ${K.W} ${K.H}"><defs>
      <linearGradient id="${g}f" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".72" stop-color="#FAF9F5"/><stop offset="1" stop-color="#F0ECE4"/></linearGradient>
      <radialGradient id="${g}s" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#14211C" stop-opacity=".26"/><stop offset=".52" stop-color="#14211C" stop-opacity=".12"/><stop offset="1" stop-color="#14211C" stop-opacity="0"/></radialGradient>
      <linearGradient id="${g}d" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#DED8CE"/><stop offset="1" stop-color="#BDB5A9"/></linearGradient></defs>
      <ellipse cx="${K.cx}" cy="${K.groundY}" rx="${gW / 2}" ry="${K.gH / 2}" fill="url(#${g}s)"/>
      <path d="${fin}" fill="url(#${g}d)" stroke="rgba(20,33,28,.12)" stroke-width="1"/>
      <circle cx="${K.cx}" cy="${K.groundY}" r="2.5" fill="${c.accent}" stroke="#fff" stroke-width="1"/>
      <g transform="translate(${K.off} ${-K.off})"><path d="${d}" fill="#DED8CE" stroke="rgba(20,33,28,.08)" stroke-width="1"/></g>
      <path d="${d}" fill="url(#${g}f)" stroke="${c.accent}" stroke-width="2" stroke-linejoin="round"/>
      <rect x="${K.cx - sw / 2 + 10}" y="${K.top + 3}" width="${Math.max(12, sw - 20)}" height="1.5" rx=".75" fill="rgba(255,255,255,.74)"/>
      ${rev ? `<text x="${K.cx}" y="${K.join + th / 2}" font-size="11" font-weight="700" fill="#14211C" text-anchor="middle" dominant-baseline="central" font-family="ui-sans-serif,system-ui">${esc(c.title)}</text>` : ''}
      ${fs.map((f) => faceGlyph(f, size, solo ? 13 : Math.min(13, size * 0.32), solo ? 18 : p < 1 ? 8 : 20, solo ? 0 : 1.5, '#fff', 'warm')).join('')}
    </svg>`;
  }

  /* ───────────────────────── A · CHIP ───────────────────────── */
  const A = { W: 190, H: 88, top: 8, h: 36, r: 12, edge: 2.5, stem: 62, groundY: 68, pad: 7, gap: 7, step: 22, gFace: 26, sFace: 28 };
  A.cx = A.W / 2;

  function renderChip(c) {
    const n = c.faces.length, solo = c.solo, p = c.progress, g = uid();
    const cy = A.top + A.h / 2;
    const fw = p < 1 ? (solo ? A.sFace : 26) : solo ? A.sFace : A.gFace + (n - 1) * A.step;
    const maxT = A.W - 2 * A.pad - fw - A.gap;
    const label = c.title && p > 0.42 ? clip(c.title, 11, maxT) : '';
    const tw = label ? Math.ceil(textW(label, 11)) : 0;
    const w = 2 * A.pad + fw + (tw ? A.gap + tw : 0);
    const x = A.cx - w / 2, y = A.top;
    const body = rr(x, y, w, A.h, A.r);
    let pts;
    if (p < 1 && !solo) pts = quad(n, x + A.pad + 13, cy, 6.5);
    else {
      const f0 = x + A.pad + (solo ? A.sFace : A.gFace) / 2;
      pts = c.faces.map((_, i) => ({ x: f0 + i * A.step, y: cy }));
    }
    const fs = c.faces.map((f, i) => ({ ...f, ...pts[i] }));
    const fSize = p < 1 ? (solo ? A.sFace : 15) : solo ? A.sFace : A.gFace;
    return `<svg width="${A.W}" height="${A.H}" viewBox="0 0 ${A.W} ${A.H}"><defs>
      <linearGradient id="${g}f" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F2F4F7"/></linearGradient>
      <radialGradient id="${g}s" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#0F1417" stop-opacity=".30"/><stop offset=".55" stop-color="#0F1417" stop-opacity=".11"/><stop offset="1" stop-color="#0F1417" stop-opacity="0"/></radialGradient></defs>
      <ellipse cx="${A.cx}" cy="${A.groundY}" rx="${Math.max(26, w * 0.55) / 2}" ry="${(11 * FLAT) / 2}" fill="url(#${g}s)"/>
      <path d="M ${A.cx - 2.3} ${y + A.h - 1} L ${A.cx - 1.1} ${A.stem} L ${A.cx + 1.1} ${A.stem} L ${A.cx + 2.3} ${y + A.h - 1} Z" fill="${shade(c.accent, 0.8)}"/>
      <circle cx="${A.cx}" cy="${A.groundY}" r="2.4" fill="${c.accent}" stroke="#fff" stroke-width="1"/>
      <g transform="translate(0 ${A.edge})"><path d="${body}" fill="${shade(c.accent, 0.72)}"/></g>
      <path d="${body}" fill="url(#${g}f)"/>
      <path d="${body}" fill="none" stroke="rgba(15,20,23,.05)" stroke-width="1"/>
      ${tw ? `<text x="${x + A.pad + fw + A.gap}" y="${cy + 0.5}" font-size="11" font-weight="700" fill="#151B20" dominant-baseline="central" font-family="ui-sans-serif,system-ui">${esc(label)}</text>` : ''}
      ${fs.map((f) => faceGlyph(f, fSize, Math.min(10, fSize * 0.34), fSize > 20 ? 13 : 8, solo ? 0 : 1.4, '#fff')).join('')}
    </svg>`;
  }

  /* ───────────────────────── B · COIN ───────────────────────── */
  const B = { W: 190, H: 106, top: 10, h: 40, r: 14, stem: 60, groundY: 66, step: 24, gFace: 28, sFace: 32 };
  B.cx = B.W / 2;

  function renderCoin(c) {
    const n = c.faces.length, solo = c.solo, p = c.progress, g = uid();
    const cy = B.top + B.h / 2;
    const fSize = p < 1 ? (solo ? B.sFace : 16) : solo ? B.sFace : B.gFace;
    const fw = p < 1 ? (solo ? B.sFace : 26) : solo ? B.sFace : B.gFace + (n - 1) * B.step;
    const w = fw + 16, x = B.cx - w / 2, y = B.top;
    const body = rr(x, y, w, B.h, B.r);
    let pts;
    if (p < 1 && !solo) pts = quad(n, B.cx, cy, 7);
    else {
      const f0 = B.cx - fw / 2 + fSize / 2;
      pts = c.faces.map((_, i) => ({ x: f0 + i * B.step, y: cy }));
    }
    const fs = c.faces.map((f, i) => ({ ...f, ...pts[i] }));
    const label = c.title && p > 0.42 ? clip(c.title, 11, 168) : '';
    return `<svg width="${B.W}" height="${B.H}" viewBox="0 0 ${B.W} ${B.H}"><defs>
      <linearGradient id="${g}f" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#EFF2F5"/></linearGradient>
      <radialGradient id="${g}s" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#0F1417" stop-opacity=".30"/><stop offset=".55" stop-color="#0F1417" stop-opacity=".11"/><stop offset="1" stop-color="#0F1417" stop-opacity="0"/></radialGradient></defs>
      <ellipse cx="${B.cx}" cy="${B.groundY}" rx="${Math.max(24, w * 0.6) / 2}" ry="${(11 * FLAT) / 2}" fill="url(#${g}s)"/>
      <path d="M ${B.cx - 2.3} ${y + B.h - 1} L ${B.cx - 1.1} ${B.stem} L ${B.cx + 1.1} ${B.stem} L ${B.cx + 2.3} ${y + B.h - 1} Z" fill="${shade(c.accent, 0.8)}"/>
      <circle cx="${B.cx}" cy="${B.groundY}" r="2.4" fill="${c.accent}" stroke="#fff" stroke-width="1"/>
      <g transform="translate(0 2.5)"><path d="${body}" fill="${shade(c.accent, 0.72)}"/></g>
      <path d="${body}" fill="url(#${g}f)"/>
      <path d="${body}" fill="none" stroke="rgba(15,20,23,.05)" stroke-width="1"/>
      ${fs.map((f) => faceGlyph(f, fSize, Math.min(11, fSize * 0.34), fSize > 20 ? 14 : 8, solo ? 0 : 1.4, '#fff')).join('')}
      ${label ? `<text x="${B.cx}" y="${B.groundY + 13}" font-size="11" font-weight="800" text-anchor="middle" fill="var(--hi)" stroke="var(--hb)" stroke-width="3" paint-order="stroke" font-family="ui-sans-serif,system-ui">${esc(label)}</text>` : ''}
    </svg>`;
  }
  /* ───────────────── C · SCHLANKE TAFEL (parametrisch) ─────────────────
     Eine Fabrik, drei Enge-Stufen. Die Stufen unterscheiden sich NUR in
     Zahlen, damit ein Vergleich wirklich denselben Aufbau vergleicht.
       shellPad  – Luft links/rechts um die Gesichterreihe
       bandPad   – Luft links/rechts um den Titel
       h         – Schalenhoehe (Gesicht + Luft oben/unten)
       band1/2   – Hoehe des Titelbandes, ein- bzw. zweizeilig
       tMax      – halbe Hoehe der Schraege am Uebergang. DAS ist der Regler,
                   um den es geht: 2*tMax ist der vertikale Weg, den die
                   Silhouette braucht, um von Schalen- auf Titelbreite zu
                   kommen. Bei tMax 8 und einem 20 hohen Band frisst der
                   Uebergang 68 % der Bandhoehe — das ist die Bauchung.
       tension   – 0 = gerade Fase, 0.35 = weiche S-Kurve.                  */
  function colorAlpha(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  /* ───────────── SCHLANKE TAFEL — eine Fabrik, viele Stufen ─────────────
     Alle Varianten unten unterscheiden sich NUR in Zahlen, damit ein
     Vergleich wirklich denselben Aufbau vergleicht.

       tMax      – halbe Hoehe der Schraege am Uebergang. 2*tMax ist der
                   vertikale Weg von Schalen- auf Titelbreite. Frisst der
                   mehr als ein Drittel der Bandhoehe, ist die Kante nirgends
                   parallel zum Inhalt — das ist die Bauchung.
       detached  – true trennt Titelpille von der Schale. Dann gibt es gar
                   keine Schraege mehr, und die Schalenkontur ist frei fuer
                   die Uhr.
       clock     – 'none'    keine Zeit (Terminfindung, offene Praesenz)
                   'outline' Kontur laeuft leer  → Sockel wird neutral
                   'base'    Sockel laeuft leer  → keine Kontur
                   Es traegt immer nur EIN Element die Modusfarbe.          */
  const CLOCK_NEUTRAL = '#B4BAC1';

  function makeSlab(cfg) {
    const S = Object.assign(
      {
        W: 160, H: 120, top: 6, h: 40, r: 13,
        gFace: 36, sFace: 36, step: 26, shellPad: 8, faceR: 0.32,
        band1: 20, band2: 30, bandPad: 16, fontSize: 10.5,
        titleMin: 52, titleMax: 142, tMax: 8, tension: 0.35, bottomR: 11,
        finEnd: 74, groundY: 84, edge: 2.5, quadSpread: 8, cityFace: 16,
        detached: false, gap: 4, ringWidth: 3,
      },
      cfg,
    );
    S.cx = S.W / 2;
    S.join = S.top + S.h;

    function render(c) {
      const n = c.faces.length, solo = c.solo, p = c.progress, g = uid();
      const cy = S.top + S.h / 2;
      const fSize = solo ? S.sFace : p < 1 ? S.cityFace : S.gFace;
      const facesW = solo ? S.sFace : p < 1 ? S.cityFace + S.quadSpread * 2 : S.gFace + (n - 1) * S.step;
      const sw = facesW + S.shellPad;

      const raw = c.title ? Math.ceil(textW(c.title, S.fontSize) + S.bandPad) : 0;
      const tw = raw ? Math.max(S.titleMin, Math.min(S.titleMax, raw)) : 0;
      const th = raw ? (raw > S.titleMax ? S.band2 : S.band1) : 0;
      const rev = c.title && p > 0.55 ? 1 : 0;

      const hw = sw / 2, tl = S.cx - hw, tr = S.cx + hw;
      const R = Math.min(S.r, hw, S.h / 2);
      const shellPath = rr(tl, S.top, sw, S.h, R);

      const remaining = c.remaining == null ? null : Math.max(0, Math.min(1, c.remaining));
      const hasClock = remaining != null && S.clock && S.clock !== 'none';
      const baseFill = hasClock && S.clock === 'outline' ? CLOCK_NEUTRAL : shade(c.accent, 0.72);

      let bodyPath, titlePath = null, titleY, finTop, cardW;

      if (!rev) {
        bodyPath = shellPath;
        titleY = S.join;
        finTop = S.join - 2;
        cardW = sw;
      } else if (S.detached) {
        bodyPath = shellPath;
        const bhw = tw / 2, ty = S.join + S.gap;
        titlePath = rr(S.cx - bhw, ty, tw, th, Math.min(th / 2, 9));
        titleY = ty;
        finTop = ty + th - 2;
        cardW = Math.max(sw, tw);
      } else {
        const sec = tw, bhw = sec / 2, by = S.join + th;
        const bl = S.cx - bhw, br = S.cx + bhw;
        const t = Math.min(S.tMax, th * 0.34);
        const bR = Math.min(S.bottomR, bhw, th * 0.42);
        const k = S.tension;
        bodyPath = [
          `M ${S.cx} ${S.top}`,
          `L ${tr - R} ${S.top}`, `Q ${tr} ${S.top} ${tr} ${S.top + R}`,
          `L ${tr} ${S.join - t}`,
          `C ${tr} ${S.join - t * k} ${br} ${S.join + t * k} ${br} ${S.join + t}`,
          `L ${br} ${by - bR}`, `Q ${br} ${by} ${br - bR} ${by}`,
          `L ${bl + bR} ${by}`, `Q ${bl} ${by} ${bl} ${by - bR}`,
          `L ${bl} ${S.join + t}`,
          `C ${bl} ${S.join + t * k} ${tl} ${S.join - t * k} ${tl} ${S.join - t}`,
          `L ${tl} ${S.top + R}`, `Q ${tl} ${S.top} ${tl + R} ${S.top}`,
          'Z',
        ].join(' ');
        titleY = S.join;
        finTop = by - 2;
        cardW = Math.max(sw, sec);
      }

      let pts;
      if (p < 1 && !solo) pts = quad(n, S.cx, cy, S.quadSpread);
      else {
        const tot = fSize + (n - 1) * S.step, f0 = S.cx - tot / 2 + fSize / 2;
        pts = c.faces.map((_, i) => ({ x: f0 + i * S.step, y: cy }));
      }
      const fs = c.faces.map((f, i) => ({ ...f, ...pts[i] }));

      /* Sockel — Tiefe. Bei clock 'base' zweifarbig: der verbleibende Teil
         traegt die Modusfarbe, der verbrauchte bleibt als Tiefe stehen, damit
         die 3D-Kante nicht halb verschwindet. */
      const left = S.cx - cardW / 2;
      const baseOf = (d) =>
        hasClock && S.clock === 'base'
          ? `<g transform="translate(0 ${S.edge})">
               <path d="${d}" fill="${CLOCK_NEUTRAL}"/>
               <g clip-path="url(#${g}clip)"><path d="${d}" fill="${shade(c.accent, 0.72)}"/></g>
             </g>`
          : `<g transform="translate(0 ${S.edge})"><path d="${d}" fill="${baseFill}"/></g>`;

      /* Konturuhr: die Laenge kommt aus getTotalLength(), damit Strich und
         Form dieselbe Kurve meinen. data-clock-start ist der Weg vom
         Pfadanfang bis Oben-Mitte — rr() startet hinter dem oberen linken
         Radius, die Uhr muss aber bei 12 Uhr beginnen. */
      const ring = hasClock && S.clock === 'outline'
        ? `<path d="${shellPath}" fill="none" stroke="#ffffff" stroke-width="${S.ringWidth + 2}" stroke-linejoin="round"/>
           <path d="${shellPath}" fill="none" stroke="${colorAlpha(c.accent, 0.3)}" stroke-width="${S.ringWidth}" stroke-linejoin="round"/>
           <path d="${shellPath}" fill="none" stroke="${c.accent}" stroke-width="${S.ringWidth}" stroke-linecap="round"
                 stroke-linejoin="round" data-clock="${remaining}" data-clock-start="${sw / 2 - R}"/>`
        : '';

      return `<svg width="${S.W}" height="${S.H}" viewBox="0 0 ${S.W} ${S.H}"><defs>
        <linearGradient id="${g}f" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F1F3F6"/></linearGradient>
        <radialGradient id="${g}s" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#0F1417" stop-opacity=".30"/><stop offset=".55" stop-color="#0F1417" stop-opacity=".11"/><stop offset="1" stop-color="#0F1417" stop-opacity="0"/></radialGradient>
        <clipPath id="${g}clip"><rect x="${left}" y="0" width="${cardW * (remaining == null ? 1 : remaining)}" height="${S.H}"/></clipPath></defs>
        <ellipse cx="${S.cx}" cy="${S.groundY}" rx="${Math.max(26, cardW * 0.58) / 2}" ry="${(12 * FLAT) / 2}" fill="url(#${g}s)"/>
        <path d="M ${S.cx - 2.4} ${finTop} L ${S.cx - 1.2} ${S.finEnd} L ${S.cx + 1.2} ${S.finEnd} L ${S.cx + 2.4} ${finTop} Z" fill="${shade(c.accent, 0.8)}"/>
        <circle cx="${S.cx}" cy="${S.groundY}" r="2.4" fill="${c.accent}" stroke="#fff" stroke-width="1"/>
        ${titlePath ? baseOf(titlePath) : ''}
        ${baseOf(bodyPath)}
        ${titlePath ? `<path d="${titlePath}" fill="url(#${g}f)"/><path d="${titlePath}" fill="none" stroke="rgba(15,20,23,.05)" stroke-width="1"/>` : ''}
        <path d="${bodyPath}" fill="url(#${g}f)"/>
        <path d="${bodyPath}" fill="none" stroke="rgba(15,20,23,.05)" stroke-width="1"/>
        ${ring}
        ${rev ? `<text x="${S.cx}" y="${titleY + th / 2}" font-size="${S.fontSize}" font-weight="700" fill="#151B20" text-anchor="middle" dominant-baseline="central" font-family="ui-sans-serif,system-ui">${esc(c.title)}</text>` : ''}
        ${fs.map((f) => faceGlyph(f, fSize, fSize * S.faceR, fSize > 20 ? 15 : 8, solo ? 0 : 1.4, '#fff')).join('')}
      </svg>`;
    }

    return { W: S.W, H: S.H, anchor: { x: 0.5, y: S.groundY / S.H }, render };
  }

  /* ── Enge-Stufen aus der letzten Runde ─────────────────────────────── */
  const slabWide = makeSlab({});
  const slabTight = makeSlab({
    H: 112, h: 38, r: 12, gFace: 34, sFace: 34, step: 25, shellPad: 6, quadSpread: 7.5,
    band1: 17, band2: 27, bandPad: 12, titleMin: 44, titleMax: 138,
    tMax: 3, tension: 0.3, bottomR: 9, finEnd: 70, groundY: 78,
  });
  const slabSnug = makeSlab({
    H: 108, h: 36, r: 11, gFace: 33, sFace: 33, step: 24, shellPad: 4, quadSpread: 7,
    band1: 15, band2: 25, bandPad: 10, titleMin: 40, titleMax: 136,
    tMax: 2, tension: 0.06, bottomR: 7.5, finEnd: 66, groundY: 74,
  });

  /* ── Rund: Schale und Titelband sind Stadien, Plaettchen fast Kreise ── */
  const ROUND = {
    H: 112, top: 6, h: 38, r: 19, gFace: 34, sFace: 34, step: 25, shellPad: 7,
    quadSpread: 7.5, faceR: 0.46, band1: 18, band2: 28, bandPad: 15,
    titleMin: 46, titleMax: 138, tMax: 3.5, tension: 0.5, bottomR: 9,
    finEnd: 70, groundY: 78,
  };

  const roundRing = makeSlab({ ...ROUND, clock: 'outline' });
  const roundBase = makeSlab({ ...ROUND, clock: 'base' });
  const roundSplit = makeSlab({
    ...ROUND, detached: true, gap: 4, clock: 'outline',
    H: 116, finEnd: 74, groundY: 82,
  });

  global.MarkerShapes = {
    MODE,
    esc,
    textW,
    variants: {
      cur: { key: 'cur', name: 'Heute · „Steintafel“', W: K.W, H: K.H, anchor: { x: 0.5, y: K.groundY / K.H }, render: renderCurrent },
      chip: { key: 'chip', name: 'A · Chip', W: A.W, H: A.H, anchor: { x: 0.5, y: A.groundY / A.H }, render: renderChip },
      coin: { key: 'coin', name: 'B · Coin + freier Text', W: B.W, H: B.H, anchor: { x: 0.5, y: B.groundY / B.H }, render: renderCoin },
      slab:  Object.assign({ key: 'slab',  name: 'C · schlanke Tafel (Stand 1)' }, slabWide),
      tight: Object.assign({ key: 'tight', name: 'C-eng · kurze Schräge' },       slabTight),
      snug:  Object.assign({ key: 'snug',  name: 'C-sehr-eng · Fase' },           slabSnug),
      rring: Object.assign({ key: 'rring', name: 'R1 · rund, Konturuhr' },        roundRing),
      rbase: Object.assign({ key: 'rbase', name: 'R2 · rund, Sockel-Uhr' },       roundBase),
      rsplit:Object.assign({ key: 'rsplit',name: 'R3 · getrennt, Konturuhr' },    roundSplit),
    },
  };
})(window);
