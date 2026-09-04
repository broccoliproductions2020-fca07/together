'use client';

import { useEffect } from 'react';

export function ChapterTransitions() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let cleanup = () => {};

    void Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([gsapModule, triggerModule]) => {
      const gsap = gsapModule.default;
      const ScrollTrigger = triggerModule.ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);
      const context = gsap.context(() => {
        gsap.utils.toArray<HTMLElement>('.chapter__word').forEach((word) => {
          gsap.fromTo(word,
            { xPercent: -16, autoAlpha: 0, clipPath: 'inset(0 100% 0 0)' },
            {
              xPercent: 0,
              autoAlpha: 0.12,
              clipPath: 'inset(0 0% 0 0)',
              ease: 'none',
              scrollTrigger: {
                trigger: word.parentElement,
                start: 'top 92%',
                end: 'top 38%',
                scrub: 0.65,
              },
            },
          );
        });

        gsap.utils.toArray<HTMLElement>('[data-section-bridge]').forEach((bridge) => {
          const path = bridge.querySelector<SVGPathElement>('[data-bridge-path]');
          const halo = bridge.querySelector<HTMLElement>('[data-bridge-halo]');
          const nodes = bridge.querySelectorAll<HTMLElement>('[data-bridge-node]');
          if (!path || !halo) return;
          const length = path.getTotalLength();
          gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
          gsap.set(nodes, { scale: 0.35, autoAlpha: 0 });

          gsap.timeline({
            scrollTrigger: {
              trigger: bridge,
              start: 'top 94%',
              end: 'bottom 32%',
              scrub: 0.7,
            },
          })
            .to(path, { strokeDashoffset: 0, ease: 'none', duration: 1 }, 0)
            .fromTo(halo, { scale: 0.55, rotate: -14, autoAlpha: 0 }, { scale: 1.12, rotate: 8, autoAlpha: 0.6, ease: 'power1.inOut', duration: 1 }, 0)
            .to(nodes, { scale: 1, autoAlpha: 1, stagger: 0.12, ease: 'back.out(1.5)', duration: 0.45 }, 0.18);
        });

      });
      cleanup = () => context.revert();
      ScrollTrigger.refresh();
    });

    return () => cleanup();
  }, []);

  return null;
}
