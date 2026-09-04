'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { DeviceFrame } from '@/components/ui/DeviceFrame';

const modes = [
  {
    label: 'Anreise teilen',
    text: 'Auf dem Weg zu einer Aktivität können die Teilnehmenden sehen, wer unterwegs oder bereits angekommen ist. Die Freigabe endet am Ziel automatisch.',
    image: '/screenshots/mica-journey-focus.webp',
    alt: 'Mica zeigt den geteilten Anreise-Status einer Aktivität.',
  },
  {
    label: 'Sicher nach Hause',
    text: 'Für deinen Heimweg wählst du bewusst die Freunde aus, die dich begleiten sollen. Sie sehen deinen aktuellen Standort nur während der Freigabe.',
    image: '/screenshots/mica-safety-home.webp',
    alt: 'Mica zeigt einen aktiven Heimweg mit ausgewählten Begleitpersonen.',
  },
] as const;

export function SafetySection() {
  const [active, setActive] = useState(0);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = root.current;
    if (!section || window.matchMedia('(max-width: 1023px), (prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height - innerHeight)));
      setActive(progress > 0.48 ? 1 : 0);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section className="safety section-pad chapter" id="unterwegs" ref={root}>
      <span className="chapter__word" aria-hidden="true">Gemeinsam unterwegs</span>
      <div className="section-grid safety__sticky">
        <div className="safety__copy" data-reveal>
          <p className="eyebrow">Anreise und Heimweg</p>
          <h2>Gemeinsam unterwegs.</h2>
          <p className="lead">Zwei Situationen, zwei bewusste Freigaben: auf dem Weg zu einer Aktivität und auf deinem Heimweg.</p>
          <div className="safety__tabs" role="tablist" aria-label="Unterwegs-Funktionen">
            {modes.map((mode, index) => (
              <button key={mode.label} type="button" role="tab" aria-selected={active === index} onClick={() => setActive(index)}>
                <span>{mode.label}</span><small>{index === 1 ? 'Vorschau · ' : ''}{mode.text}</small>
              </button>
            ))}
          </div>
          <p className="emergency"><strong>Mica ersetzt keinen Notruf.</strong> Im Notfall wähle 112.</p>
        </div>
        <div className="safety__stage">
          {modes.map((mode, index) => <DeviceFrame key={mode.label} src={mode.image} alt={mode.alt} className={active === index ? 'is-active' : ''} />)}
        </div>
      </div>
      <div className="safety__mobile">
        {modes.map((mode, index) => <article key={mode.label}><div><span>{index === 1 ? 'Vorschau' : 'Aktivität'}</span><h3>{mode.label}</h3><p>{mode.text}</p></div><Image src={mode.image} width={1080} height={2400} sizes="100vw" alt={mode.alt} /></article>)}
        <p className="emergency"><strong>Mica ersetzt keinen Notruf.</strong> Im Notfall wähle 112.</p>
      </div>
    </section>
  );
}
