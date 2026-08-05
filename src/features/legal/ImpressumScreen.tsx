import legal from './impressum.de.json';
import { LegalDocScreen } from './LegalDocScreen';

export function ImpressumScreen() {
  return <LegalDocScreen doc={legal} />;
}
