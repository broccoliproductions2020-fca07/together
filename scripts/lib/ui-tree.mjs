/**
 * Der Viewbaum, den `uiautomator dump` liefert — als reine Funktionen, damit
 * er ohne Gerät testbar ist (scripts/test-screen-recipes.mjs).
 *
 * React Native schreibt `accessibilityLabel` nach `content-desc`, sichtbaren
 * Text nach `text`. Beides zusammen ist die Beschriftung, nach der die
 * Aufnahme-Rezepte tippen — deshalb ist hier kein XML-Parser nötig: es geht
 * ausschließlich um diese drei Attribute plus `bounds`.
 */

const NODE_RE = /<node\b[^>]*?\/?>/g;

/**
 * uiautomator kodiert jedes Zeichen ausserhalb von ASCII als numerische
 * Referenz: aus "Café" wird `Caf&#233;`. Ohne diese Zeile findet ein Rezept
 * keine einzige Beschriftung mit Umlaut - also fast keine, denn die App ist
 * deutsch. `&amp;` wird ZULETZT ersetzt, sonst wuerde ein wortwoertliches
 * `&amp;#233;` ein zweites Mal decodiert.
 */
const decodeXml = (value) =>
  value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const attr = (tag, name) => {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decodeXml(match[1]) : '';
};

export function parseUiNodes(xml) {
  return (xml.match(NODE_RE) ?? []).map((tag) => {
    const bounds = attr(tag, 'bounds').match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
    return {
      text: attr(tag, 'text'),
      desc: attr(tag, 'content-desc'),
      clickable: attr(tag, 'clickable') === 'true',
      bounds: bounds ? bounds.slice(1).map(Number) : null,
    };
  });
}

export const labelOf = (node) => node.desc || node.text;

export const visibleLabels = (nodes) =>
  [...new Set(nodes.map(labelOf).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));

/**
 * Sucht nach Teilstring und ohne Groß-/Kleinschreibung, weil eine Beschriftung
 * im Produkt fast immer mehr trägt als das, wonach man sucht („Du bist offen
 * bis 22:00. Status bearbeiten").
 *
 * Ein anklickbarer Treffer gewinnt gegen einen nicht anklickbaren: Bei einer
 * Schaltfläche liegt der Textknoten IN ihr, und dessen Mitte ist zwar meistens
 * auch innerhalb der Schaltfläche, aber eben nicht zuverlässig — bei einer
 * Zeile mit Symbol links und Text rechts trifft man sonst am Ziel vorbei.
 */
export function findNode(nodes, needle) {
  const wanted = needle.toLocaleLowerCase('de');
  const matches = nodes.filter(
    (node) => node.bounds && labelOf(node).toLocaleLowerCase('de').includes(wanted),
  );
  return matches.find((node) => node.clickable) ?? matches[0] ?? null;
}

export const centre = (node) => [
  Math.round((node.bounds[0] + node.bounds[2]) / 2),
  Math.round((node.bounds[1] + node.bounds[3]) / 2),
];
