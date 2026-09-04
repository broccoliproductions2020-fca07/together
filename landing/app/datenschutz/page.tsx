import document from '../../../src/features/legal/datenschutz.de.json';
import { LegalPage } from '@/components/legal/LegalPage';

export default function Page() { return <LegalPage document={document as Parameters<typeof LegalPage>[0]['document']} />; }
