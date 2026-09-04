import Link from 'next/link';
import { MicaLogo } from '@/components/brand/MicaLogo';

type Block = { type: 'p'; text: string } | { type: 'list'; items: string[] };
type LegalDocument = { title: string; stand: string; sections: { title: string; blocks: Block[] }[] };

export function LegalPage({ document }: { document: LegalDocument }) {
  return (
    <main className="legal-page">
      <Link className="legal-page__brand" href="/" aria-label="Zur Mica Startseite"><MicaLogo className="brand-logo" /></Link>
      <p className="eyebrow">Rechtliches</p>
      <h1>{document.title}</h1>
      <p className="legal-page__date">Stand: {document.stand}</p>
      {document.sections.map((section) => <section key={section.title}><h2>{section.title}</h2>{section.blocks.map((block, index) => block.type === 'p' ? <p key={index}>{block.text}</p> : <ul key={index}>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>)}</section>)}
      <Link className="legal-page__back" href="/">Zurück zur Startseite</Link>
    </main>
  );
}
