'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { DeviceFrame } from '@/components/ui/DeviceFrame';
import { story } from '@/content/site';

type Phase = 'hero' | 'open' | 'now' | 'soon';

export function HeroStory() {
  const root = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<Phase>('hero');
  const active = phase === 'hero' ? 0 : story.findIndex((item) => item.key === phase);

  useEffect(() => {
    const section = root.current;
    if (!section) return;
    let disposed = false;
    let cleanup = () => {};

    void Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([gsapModule, triggerModule]) => {
      if (disposed) return;
      const gsap = gsapModule.default;
      const ScrollTrigger = triggerModule.ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);
      const media = gsap.matchMedia();
      media.add('(min-width: 1181px) and (prefers-reduced-motion: no-preference)', () => {
        const context = gsap.context(() => {
        const phones = [...section.querySelectorAll<HTMLElement>('[data-shared-phone]')];
        const words = [...section.querySelectorAll<HTMLElement>('[data-shared-word]')];
        const badges = [...section.querySelectorAll<HTMLElement>('[data-shared-badge]')];
        const tracks = [...section.querySelectorAll<HTMLElement>('[data-shared-track]')];
        const steps = [...section.querySelectorAll<HTMLElement>('[data-story-step]')];
        const stage = section.querySelector<HTMLElement>('[data-phone-stage]');
        const screenTrack = section.querySelector<HTMLElement>('[data-screen-track]');
        const storyCopy = section.querySelector<HTMLElement>('[data-story-copy]');
        const heroOrbit = section.querySelector<HTMLElement>('[data-hero-orbit]');
        if (phones.length !== 3 || words.length !== 3 || badges.length !== 3 || tracks.length !== 3 || steps.length !== 3 || !stage || !screenTrack || !storyCopy || !heroOrbit) return;

        section.classList.add('is-motion-ready');

        const stageShift = () => {
          const sectionRect = section.getBoundingClientRect();
          const stageRect = stage.getBoundingClientRect();
          const currentCenter = stageRect.left + stageRect.width / 2;
          const targetCenter = sectionRect.left + sectionRect.width * 0.265;
          return targetCenter - currentCenter;
        };
        const phoneExit = (phone: HTMLElement) => {
          const sectionRect = section.getBoundingClientRect();
          const stageRect = stage.getBoundingClientRect();
          const currentCenter = stageRect.left + stageRect.width / 2;
          const targetCenter = sectionRect.left - phone.offsetWidth * 0.6 - 48;
          return targetCenter - currentCenter;
        };
        const viewportExit = () => -window.innerWidth * 1.08;
        const openAt = 0.98;
        const nowStart = 1.35;
        const nowAt = 2.35;
        const soonStart = 2.72;
        const soonAt = 3.72;

        gsap.set(phones[0], { x: 0, xPercent: -50, yPercent: -50, rotateZ: 2, rotateY: -7, scale: 1.06, autoAlpha: 1, zIndex: 6 });
        gsap.set(phones[1], { x: 0, xPercent: -50, yPercent: -50, rotateZ: -1, rotateY: 0, scale: 0.72, autoAlpha: 0, zIndex: 4 });
        gsap.set(phones[2], { x: 0, xPercent: -50, yPercent: -50, rotateZ: -1, rotateY: 0, scale: 0.58, autoAlpha: 0, zIndex: 3 });
        gsap.set(storyCopy, { xPercent: 115, autoAlpha: 0 });
        gsap.set(steps, { x: 0, xPercent: 125, autoAlpha: 1 });
        gsap.set(steps[0], { xPercent: 0 });
        gsap.set(words, { x: 0, xPercent: 112, autoAlpha: 0 });
        gsap.set(badges, { yPercent: 130, autoAlpha: 1 });
        gsap.set(tracks, { scaleX: 0 });
        gsap.set(screenTrack, { xPercent: 0 });

        let currentPhase: Phase = 'hero';
        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.12,
            snap: {
              snapTo: [0, openAt / soonAt, nowAt / soonAt, 1],
              delay: 0.08,
              duration: { min: 0.18, max: 0.42 },
              ease: 'power2.inOut',
              inertia: false,
            },
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              const timelineTime = self.progress * soonAt;
              const next: Phase = timelineTime < openAt * 0.5 ? 'hero' : timelineTime < (openAt + nowAt) * 0.5 ? 'open' : timelineTime < (nowAt + soonAt) * 0.5 ? 'now' : 'soon';
              if (next !== currentPhase) { currentPhase = next; setPhase(next); }
            },
          },
        });

        timeline
          // The single hero phone is physically handed over before the stack forms behind it.
          .to(section, { backgroundColor: '#09101b', duration: openAt, ease: 'none' }, 0)
          .to('[data-hero-copy]', { xPercent: -145, duration: 0.66, ease: 'power2.inOut' }, 0)
          .to(heroOrbit, { x: viewportExit, autoAlpha: 0, duration: 0.78, ease: 'power2.inOut' }, 0)
          .to('[data-hero-signal]', { x: viewportExit, autoAlpha: 0, stagger: 0.035, duration: 0.66, ease: 'power2.in' }, 0.02)
          .set(storyCopy, { autoAlpha: 1 }, 0.18)
          .to(storyCopy, { xPercent: 0, duration: 0.68, ease: 'power2.inOut' }, 0.22)
          .to(screenTrack, { xPercent: -50, duration: 0.48, ease: 'power2.inOut' }, 0.24)
          .to(phones[0], { x: stageShift, rotateZ: -1, rotateY: 0, scale: 0.92, duration: 0.82, ease: 'power2.inOut' }, 0.04)
          .set(phones[1], { x: stageShift, autoAlpha: 1 }, 0.78)
          .set(phones[2], { x: stageShift, autoAlpha: 1 }, 0.8)
          .to(phones[1], { x: stageShift, xPercent: -24, yPercent: -48, rotateZ: 7, rotateY: -10, scale: 0.78, duration: 0.2, ease: 'power2.out' }, 0.78)
          .to(phones[2], { x: stageShift, xPercent: 0, yPercent: -46, rotateZ: 11, rotateY: -15, scale: 0.66, duration: 0.18, ease: 'power2.out' }, 0.8)
          .set(words[0], { autoAlpha: 1 }, 0.08)
          .to(words[0], { xPercent: 0, duration: 0.82, ease: 'power2.inOut' }, 0.12)
          .to(badges[0], { yPercent: 0, duration: 0.3, ease: 'back.out(1.5)' }, 0.7)
          .to(tracks[0], { scaleX: 1, duration: 0.48, ease: 'none' }, 0.5)

          // A short hold gives Open its own readable scene before the next swap begins.
          .to(section, { backgroundColor: '#081611', duration: 1, ease: 'none' }, nowStart)
          .set(phones[1], { zIndex: 7 }, nowStart + 0.76)
          .to(phones[0], { x: () => phoneExit(phones[0]), xPercent: -50, yPercent: -52, rotateZ: -10, rotateY: 8, scale: 0.82, duration: 1, ease: 'power2.inOut' }, nowStart)
          .to(phones[1], { x: stageShift, xPercent: -50, yPercent: -50, rotateZ: 0, rotateY: 0, scale: 0.92, autoAlpha: 1, duration: 1, ease: 'power2.inOut' }, nowStart)
          .to(phones[2], { x: stageShift, xPercent: -24, yPercent: -47, rotateZ: 8, rotateY: -11, scale: 0.76, autoAlpha: 1, duration: 1, ease: 'power2.inOut' }, nowStart)
          .set(phones[0], { autoAlpha: 0 }, nowAt)
          .to(steps[0], { x: viewportExit, xPercent: 0, duration: 0.82, ease: 'power2.inOut' }, nowStart + 0.02)
          .to(steps[1], { xPercent: 0, duration: 0.82, ease: 'power2.inOut' }, nowStart + 0.12)
          .to(words[0], { x: viewportExit, xPercent: 0, duration: 0.9, ease: 'power2.inOut' }, nowStart)
          .set(words[0], { autoAlpha: 0 }, nowStart + 0.9)
          .set(words[1], { autoAlpha: 1 }, nowStart + 0.04)
          .to(words[1], { xPercent: 0, duration: 0.9, ease: 'power2.inOut' }, nowStart + 0.08)
          .to(badges[1], { yPercent: 0, duration: 0.42, ease: 'back.out(1.6)' }, nowStart + 0.58)
          .to(tracks[1], { scaleX: 1, duration: 0.7, ease: 'none' }, nowStart + 0.24)

          .to(section, { backgroundColor: '#181208', duration: 1, ease: 'none' }, soonStart)
          .set(phones[2], { zIndex: 8 }, soonStart + 0.76)
          .to(phones[1], { x: () => phoneExit(phones[1]), xPercent: -50, yPercent: -52, rotateZ: -10, rotateY: 8, scale: 0.82, duration: 1, ease: 'power2.inOut' }, soonStart)
          .to(phones[2], { x: stageShift, xPercent: -50, yPercent: -50, rotateZ: 1, rotateY: 0, scale: 0.92, autoAlpha: 1, duration: 1, ease: 'power2.inOut' }, soonStart)
          .set(phones[1], { autoAlpha: 0 }, soonAt)
          .to(steps[1], { x: viewportExit, xPercent: 0, duration: 0.82, ease: 'power2.inOut' }, soonStart + 0.02)
          .to(steps[2], { xPercent: 0, duration: 0.82, ease: 'power2.inOut' }, soonStart + 0.12)
          .to(words[1], { x: viewportExit, xPercent: 0, duration: 0.9, ease: 'power2.inOut' }, soonStart)
          .set(words[1], { autoAlpha: 0 }, soonStart + 0.9)
          .set(words[2], { autoAlpha: 1 }, soonStart + 0.04)
          .to(words[2], { xPercent: 0, duration: 0.9, ease: 'power2.inOut' }, soonStart + 0.08)
          .to(badges[2], { yPercent: 0, duration: 0.42, ease: 'back.out(1.6)' }, soonStart + 0.58)
          .to(tracks[2], { scaleX: 1, duration: 0.7, ease: 'none' }, soonStart + 0.24);
        }, section);
        ScrollTrigger.refresh();
        return () => {
          context.revert();
          section.classList.remove('is-motion-ready');
        };
      });
      cleanup = () => media.revert();
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <section className={`hero-story hero-story--${phase}`} id="hero" ref={root}>
      <span className="hero-story__anchor" id="so-funktionierts" />
      <div className="hero-story__desktop">
        <div className="aurora" aria-hidden="true"><i /><i /><i /></div>
        <div className="hero-story__mode-words" aria-hidden="true">
          {story.map((item) => <span key={item.key} data-shared-word>{item.label}</span>)}
        </div>

        <div className="hero-story__hero-copy" data-hero-copy>
          <p className="hero__kicker">Für eure freien Momente</p>
          <h1><span>Freie Zeit wird</span><span>gemeinsame Zeit.</span></h1>
          <p className="hero__lead">Mit Mica seht ihr, was im Freundeskreis entsteht – und macht aus einem freien Moment einen gemeinsamen Plan.</p>
          <div className="hero__actions">
            <a className="primary-link" href="#so-funktionierts">Mica entdecken <span aria-hidden="true">↘</span></a>
            <span>Bald für iOS und Android</span>
          </div>
        </div>

        <div className="hero-story__story-copy" data-story-copy>
          <p className="eyebrow">Drei Wege zusammenzufinden</p>
          <h2>Was passt gerade zu euch?</h2>
          <p>Offen, Jetzt oder Soon: Jeder freie Moment bekommt genau den Anfang, den er braucht.</p>
          <div className="hero-story__steps" aria-live="polite">
            {story.map((item, index) => (
              <article className={active === index ? 'is-active' : ''} data-story-step key={item.key}>
                <span style={{ '--mode': `var(--${item.key})` } as React.CSSProperties}><i data-shared-track />{item.label}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="hero-story__stage" data-phone-stage aria-label="Echte App-Ansichten für Gemeinsam unterwegs, Offen, Jetzt und Soon">
          <div className="hero-story__orbit" data-hero-orbit aria-hidden="true"><i /><i /><i /></div>
          <p className="hero-signal hero-signal--open" data-hero-signal><span />Offen</p>
          <p className="hero-signal hero-signal--now" data-hero-signal><span />Jetzt</p>
          <p className="hero-signal hero-signal--soon" data-hero-signal><span />Soon</p>

          <div className="hero-story-phone hero-story-phone--shared" data-shared-phone>
            <figure className="device hero-story-phone__device">
              <div className="device__speaker" aria-hidden="true" />
              <div className="hero-story-phone__screen-window">
                <div className="hero-story-phone__screen-track" data-screen-track>
                  <Image src="/screenshots/mica-journey-focus.webp" alt="Mica Karte mit gemeinsamen Aktivitäten und Freunden, die unterwegs sind." width={1080} height={2400} priority sizes="28vw" />
                  <Image src={story[0].image} alt={story[0].alt} width={1080} height={2400} priority sizes="28vw" />
                </div>
              </div>
            </figure>
            <span className="story-phone__badge story-phone__badge--open" data-shared-badge>Offen</span>
          </div>
          {story.slice(1).map((item) => (
            <div className="hero-story-phone" data-shared-phone key={item.key}>
              <DeviceFrame src={item.image} alt={item.alt} className="hero-story-phone__device" />
              <span className={`story-phone__badge story-phone__badge--${item.key}`} data-shared-badge>{item.label}</span>
            </div>
          ))}
        </div>
        <a className="hero__next" href="#so-funktionierts">Scrollen, um zusammenzufinden <span aria-hidden="true">↓</span></a>
      </div>

      <div className="hero-story__mobile">
        <div className="hero-story__mobile-copy">
          <p className="hero__kicker">Für eure freien Momente</p>
          <h1>Freie Zeit wird <span>gemeinsame Zeit.</span></h1>
          <p>Mit Mica seht ihr, was im Freundeskreis entsteht – und macht aus einem freien Moment einen gemeinsamen Plan.</p>
        </div>
        <DeviceFrame src="/screenshots/mica-journey-focus.webp" alt="Mica Karte mit gemeinsamen Aktivitäten." className="hero-story__mobile-hero" eager />
        <header><p className="eyebrow">Drei Wege zusammenzufinden</p><h2>Was passt gerade zu euch?</h2></header>
        {story.map((item) => (
          <article key={item.key} data-reveal>
            <div><span className={`mode-tag mode-tag--${item.key}`}>{item.label}</span><h3>{item.title}</h3><p>{item.text}</p></div>
            <DeviceFrame src={item.image} alt={item.alt} />
          </article>
        ))}
      </div>
    </section>
  );
}
