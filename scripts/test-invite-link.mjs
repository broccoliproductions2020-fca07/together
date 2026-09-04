/**
 * Invite-Link-Parser. Er entscheidet, ob ein gescannter QR-Code eine
 * Freundschaftsanfrage auslöst — also genau die Stelle, an der ein zu weiter
 * Treffer eine fremde Seite Anfragen verschicken ließe.
 *
 * Liest die Regeln aus der TS-Quelle statt sie nachzubauen: eine zweite Kopie
 * der Regex hier würde genau dann noch bestehen, wenn die echte kaputt ist.
 */
import { readFileSync } from 'node:fs';

import ts from 'typescript';

const sourcePath = new URL('../src/shared/utils/inviteLink.ts', import.meta.url);
const compiled = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath.pathname,
});
const module_ = { exports: {} };
new Function('exports', 'module', 'require', compiled.outputText)(
  module_.exports,
  module_,
  () => ({}),
);
const { buildInviteLink, parseInviteLink } = module_.exports;

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        erwartet ${JSON.stringify(expected)}, bekommen ${JSON.stringify(actual)}`}`,
  );
}

console.log('\n— akzeptiert —');
check('https-Link', parseInviteLink('https://link.micamap.de/f/hannes'), 'hannes');
check('mit Query', parseInviteLink('https://link.micamap.de/f/hannes?utm=qr'), 'hannes');
check('mit Fragment', parseInviteLink('https://link.micamap.de/f/hannes#x'), 'hannes');
check('Host in Großbuchstaben', parseInviteLink('https://LINK.MICAMAP.DE/f/hannes'), 'hannes');
check('Name in Großbuchstaben', parseInviteLink('https://link.micamap.de/f/Hannes'), 'hannes');
check('App-Schema mica', parseInviteLink('mica://f/hannes'), 'hannes');
check('App-Schema together', parseInviteLink('together://f/hannes'), 'hannes');
check('Dev-Schema', parseInviteLink('mica-dev://f/hannes'), 'hannes');
check('reiner Pfad (Router)', parseInviteLink('/f/hannes'), 'hannes');
check('mit @', parseInviteLink('https://link.micamap.de/f/@hannes'), 'hannes');
check('prozentkodiert', parseInviteLink('https://link.micamap.de/f/%68annes'), 'hannes');
check('erlaubte Sonderzeichen', parseInviteLink('https://link.micamap.de/f/a.b_c-d1'), 'a.b_c-d1');
check('Leerraum aussen', parseInviteLink('  https://link.micamap.de/f/hannes  '), 'hannes');

console.log('\n— abgewiesen —');
check('fremder Host', parseInviteLink('https://evil.example/f/hannes'), null);
check('Subdomain-Trick', parseInviteLink('https://link.micamap.de.evil.example/f/hannes'), null);
check('Prefix-Trick', parseInviteLink('https://notlink.micamap.de/f/hannes'), null);
check('anderer Pfad', parseInviteLink('https://link.micamap.de/impressum'), null);
check('kein Name', parseInviteLink('https://link.micamap.de/f/'), null);
check('zu kurz', parseInviteLink('https://link.micamap.de/f/a'), null);
check('zu lang', parseInviteLink(`https://link.micamap.de/f/${'a'.repeat(31)}`), null);
check('Punkt am Anfang', parseInviteLink('https://link.micamap.de/f/.hannes'), null);
check('unerlaubtes Zeichen', parseInviteLink('https://link.micamap.de/f/han nes'), null);
check('Umlaut', parseInviteLink('https://link.micamap.de/f/hännes'), null);
check('Pfad-Ausbruch', parseInviteLink('https://link.micamap.de/f/../admin'), null);
check('leer', parseInviteLink(''), null);
check('undefined', parseInviteLink(undefined), null);
check('reiner Text', parseInviteLink('hannes'), null);
check('anderer QR-Inhalt', parseInviteLink('WIFI:S:Netz;T:WPA;P:geheim;;'), null);

console.log('\n— Rundlauf —');
check('bauen und lesen', parseInviteLink(buildInviteLink('hannes')), 'hannes');
check('bauen normalisiert', buildInviteLink('@Hannes'), 'https://link.micamap.de/f/hannes');
check('gebauter Link ist https', buildInviteLink('x').startsWith('https://'), true);

console.log(
  failures === 0 ? '\nAlle Faelle bestanden.\n' : `\n${failures} Fall/Faelle fehlgeschlagen.\n`,
);
process.exit(failures === 0 ? 0 : 1);
