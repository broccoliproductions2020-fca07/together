import { LegalDocScreen } from './LegalDocScreen';
import legal from './nutzungsbedingungen.de.json';

export function NutzungsbedingungenScreen() {
  return <LegalDocScreen doc={legal} />;
}
