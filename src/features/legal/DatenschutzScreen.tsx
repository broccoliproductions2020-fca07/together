import legal from './datenschutz.de.json';
import { LegalDocScreen } from './LegalDocScreen';

export function DatenschutzScreen() {
  return <LegalDocScreen doc={legal} />;
}
