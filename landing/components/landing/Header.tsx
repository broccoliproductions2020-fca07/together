'use client';

import { useEffect, useState } from 'react';
import { MicaLogo } from '@/components/brand/MicaLogo';

const links = [
  ['So funktioniert Mica', '#so-funktionierts'],
  ['Gemeinsam planen', '#gemeinsam-planen'],
  ['Privatsphäre', '#privatsphaere'],
  ['Fragen', '#fragen'],
] as const;

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className={`site-header ${scrolled ? 'is-scrolled' : ''}`}>
      <a className="brand-link" href="#hero" aria-label="Mica – zur Startseite">
        <MicaLogo className="brand-logo" />
      </a>
      <nav className="desktop-nav" aria-label="Hauptnavigation">
        {links.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
      </nav>
      <a className="availability-link" href="#coming-soon">Bald verfügbar</a>
      <button className="menu-button" type="button" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((value) => !value)}>
        <span className="sr-only">Menü {open ? 'schließen' : 'öffnen'}</span>
        <span /><span />
      </button>
      <nav id="mobile-menu" className={`mobile-menu ${open ? 'is-open' : ''}`} aria-label="Mobile Navigation">
        {links.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>)}
      </nav>
    </header>
  );
}
