'use strict';

/**
 * Bestätigungsmail für neue Konten.
 *
 * Bewusst handgeschriebenes HTML statt einer Template-Bibliothek: Die
 * Functions-Laufzeit übersetzt kein JSX, React Email bräuchte also erst einen
 * Build-Schritt im functions-Ordner — für eine einzige Mail mehr Apparat als
 * Inhalt.
 *
 * Die Regeln, die E-Mail-Clients erzwingen (nicht verhandelbar, sonst bricht
 * Outlook das Layout):
 *  - Tabellen statt flex/grid, feste Pixelbreiten
 *  - Alle Stile inline am Element, kein <style>-Block, keine Klassen
 *  - Keine Webfonts. Schibsted Grotesk lädt kein Mailprogramm zuverlässig, also
 *    ein System-Stack — die Marke trägt hier die Farbe und das Logo.
 *  - Das Logo ist ein gehostetes Bild: Inline-SVG entfernen Gmail und Outlook.
 *    Ein Bild kann blockiert sein, deshalb steht der Name zusätzlich als Text.
 *
 * Ton: Das hier ist die allererste Nachricht, die jemand von Mica bekommt —
 * also eine Begrüßung mit einer Bitte darin, keine Systemmeldung. Der Name
 * steht schon im Betreff, weil genau das den Unterschied zwischen "noch eine
 * Verifizierungsmail" und "die schreiben mich an" ausmacht.
 */

const COLORS = {
  ink: '#0B1017',
  text: '#F4F5F7',
  muted: '#9BA3AE',
  surface: '#151C26',
  border: '#252D39',
  green: '#35BA84',
  amber: '#E9A02B',
  blue: '#4772F8',
};

const LOGO_URL = 'https://link.micamap.de/email/mica-logo.png';
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Fallback ohne Namen — der personalisierte Betreff entsteht pro Mail. */
const SUBJECT = 'Willkommen bei Mica';

const PREHEADER = 'Nur noch ein Tippen, dann kann es losgehen.';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Der Link stammt aus `admin.auth().generateEmailVerificationLink()`, also aus
 * unserem eigenen Backend — escaped wird er trotzdem, weil er in ein
 * Attribut geht und diese Annahme sonst still zur Lücke wird, sobald jemand
 * die Aufrufstelle ändert.
 *
 * Der Name wird ZWEIMAL gebraucht und darf nur einmal escaped werden: Betreff
 * und Textfassung sind kein HTML, dort stünde sonst wörtlich "&#39;".
 */
function renderVerificationEmail({ displayName, actionLink }) {
  const rawName = String(displayName ?? '').trim();
  // Nur der erste Vorname: "Hallo Hannes," klingt wie eine Nachricht,
  // "Hallo Hannes Severin Wittwer," wie ein Serienbrief.
  const firstName = rawName.split(/\s+/)[0] || '';
  const subject = firstName ? `Willkommen bei Mica, ${firstName}` : SUBJECT;
  const greeting = firstName ? `Hallo ${escapeHtml(firstName)},` : 'Hallo,';
  const link = escapeHtml(actionLink);

  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${PREHEADER}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.ink};padding:32px 16px;">
<tr>
<td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:100%;">

<tr>
<td align="center" style="padding-bottom:32px;">
<img src="${LOGO_URL}" width="104" height="36" alt="Mica" style="display:block;border:0;outline:none;height:auto;">
</td>
</tr>

<tr>
<td style="background-color:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:20px;padding:32px 28px;">

<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:15px;line-height:1.5;color:${COLORS.muted};">${greeting}</p>

<h1 style="margin:0 0 16px;font-family:${FONT_STACK};font-size:23px;line-height:1.3;font-weight:700;color:${COLORS.text};">willkommen bei Mica.</h1>

<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:${COLORS.muted};">Schön, dass du da bist. Mica zeigt dir, wer von deinen Freunden gerade Zeit hat — ohne Feed, ohne Fremde, ohne dass du irgendwas posten musst.</p>

<p style="margin:0 0 28px;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:${COLORS.muted};">Bevor es losgeht, bestätige bitte einmal kurz, dass diese Adresse wirklich dir gehört. Das dauert einen Moment und ist danach für immer erledigt.</p>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
<td align="center" style="border-radius:16px;background-color:${COLORS.blue};">
<a href="${link}" style="display:block;padding:16px 24px;font-family:${FONT_STACK};font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:16px;">Ja, das bin ich</a>
</td>
</tr>
</table>

<p style="margin:24px 0 0;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:${COLORS.text};">Wir freuen uns auf dich. Bis gleich!</p>

<p style="margin:28px 0 8px;font-family:${FONT_STACK};font-size:13px;line-height:1.5;color:${COLORS.muted};">Der Knopf lässt sich nicht antippen? Dann kopiere diese Adresse in deinen Browser:</p>
<p style="margin:0;font-family:${FONT_STACK};font-size:12px;line-height:1.5;word-break:break-all;"><a href="${link}" style="color:${COLORS.green};text-decoration:underline;">${link}</a></p>

</td>
</tr>

<tr>
<td style="padding:24px 4px 0;">
<p style="margin:0;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:#6B7480;">Du hast dich gar nicht bei Mica angemeldet? Dann ignoriere diese Nachricht einfach — ohne deine Bestätigung wird aus dem Konto nichts.</p>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;

  // Jeder ernsthafte Client zeigt HTML, aber eine Textfassung entscheidet
  // mit über die Spam-Bewertung — und sie ist die einzige Fassung, die eine
  // Vorlesefunktion sauber wiedergibt.
  const text = [
    firstName ? `Hallo ${firstName},` : 'Hallo,',
    '',
    'willkommen bei Mica.',
    '',
    'Schön, dass du da bist. Mica zeigt dir, wer von deinen Freunden gerade Zeit hat',
    '— ohne Feed, ohne Fremde, ohne dass du irgendwas posten musst.',
    '',
    'Bevor es losgeht, bestätige bitte einmal kurz, dass diese Adresse wirklich dir',
    'gehört:',
    actionLink,
    '',
    'Wir freuen uns auf dich. Bis gleich!',
    '',
    'Du hast dich gar nicht bei Mica angemeldet? Dann ignoriere diese Nachricht einfach',
    '— ohne deine Bestätigung wird aus dem Konto nichts.',
  ].join('\n');

  return { subject, html, text };
}

module.exports = { renderVerificationEmail, VERIFICATION_SUBJECT: SUBJECT };
