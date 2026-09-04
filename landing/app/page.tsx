import { MicaLogo } from '@/components/brand/MicaLogo';
import { Header } from '@/components/landing/Header';
import { HeroStory } from '@/components/landing/HeroStory';
import { SafetySection } from '@/components/landing/SafetySection';
import { ChapterTransitions } from '@/components/motion/ChapterTransitions';
import { RevealObserver } from '@/components/motion/RevealObserver';
import { SectionBridge } from '@/components/motion/SectionBridge';
import { DeviceFrame } from '@/components/ui/DeviceFrame';
import { faqs, features } from '@/content/site';

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main">Zum Inhalt springen</a>
      <Header />
      <main id="main">
        <HeroStory />

        <section className="mission section-pad chapter" id="gemeinsam-planen">
          <div className="mission__surface">
            <span className="chapter__word" aria-hidden="true">Vom Vielleicht zum Treffen</span>
            <div className="section-grid mission__grid">
              <div className="mission__heading">
                <p className="eyebrow">Warum Mica</p>
                <h2>Weil gemeinsame Zeit nicht im Gruppenchat versanden sollte.</h2>
                <p className="lead">Mica zeigt nicht mehr von allen. Nur den kleinen Moment, in dem jemand Zeit hat – und aus „Vielleicht“ ein „Kommst du mit?“ werden kann.</p>
                <p className="mission__statement">Kein Feed. Kein Posten. Nur eure freien Momente und alles, was ihr braucht, um wirklich zusammenzukommen.</p>
              </div>

              <div className="mission__visual" data-reveal>
                <div className="mission__visual-glow" aria-hidden="true" />
                <DeviceFrame
                  src="/screenshots/mica-time-matching.webp"
                  alt="Echte Mica App-Ansicht der gemeinsamen Terminfindung mit dem besten Zeitraum für sieben Freunde."
                  className="mission__device"
                />
              </div>

              <div className="mission__principles">
                <article><i aria-hidden="true" /><h3>Nur eure Freunde</h3><p>Ein Moment erreicht nur die Menschen, für die er gedacht ist.</p></article>
                <article><i aria-hidden="true" /><h3>Weniger Hinterherfragen</h3><p>Wer gerade offen ist oder schon etwas vorhat, wird sichtbar.</p></article>
                <article><i aria-hidden="true" /><h3>Klare Dauer</h3><p>Status, Standort und Pläne enden automatisch.</p></article>
              </div>
            </div>
          </div>
        </section>

        <section className="features section-pad chapter">
          <span className="chapter__word" aria-hidden="true">Alles bleibt zusammen</span>
          <div className="section-grid">
            <header className="wide-heading" data-reveal><p className="eyebrow">Direkt beim Plan</p><h2>Alles, was ihr zum Zusammenkommen braucht.</h2><p className="lead">Die wichtigsten Dinge bleiben direkt bei eurem gemeinsamen Plan.</p></header>
            <div className="feature-index">
              {features.map(([title, text], index) => <article key={title} data-reveal><span>0{index + 1}</span><div><h3>{title}</h3><p>{text}</p></div><svg aria-hidden="true" viewBox="0 0 24 24"><path d={index === 0 ? 'M4 6l6-3 4 2 6-3v16l-6 3-4-2-6 3zM10 3v16M14 5v16' : index === 1 ? 'M8 12a4 4 0 108 0 4 4 0 00-8 0zm-5 9c0-3 4-5 9-5s9 2 9 5' : index === 2 ? 'M5 4h14v16H5zM8 2v4M16 2v4M5 9h14' : 'M4 5h16v12H8l-4 4z'} /></svg></article>)}
            </div>
          </div>
        </section>

        <section className="privacy section-pad chapter" id="privatsphaere">
          <span className="chapter__word" aria-hidden="true">Nur für euch</span>
          <div className="section-grid privacy__grid">
            <div data-reveal><p className="eyebrow">Privatsphäre</p><h2>Du entscheidest, was du teilst.</h2><p className="lead">Mica gibt dir für jeden Moment klare Entscheidungen über Sichtbarkeit, Standort und Dauer.</p></div>
            <div className="privacy__visual" data-reveal aria-hidden="true">
              <div className="privacy-orbit"><i /><i /><i /><MicaLogo compact className="privacy-mark" /></div>
              <div className="privacy-window"><span>Nur gewählt</span><b>3 h</b><small>endet automatisch</small></div>
            </div>
            <div className="privacy__points">
              <article data-reveal><span>01</span><h3>Dein Freundeskreis</h3><p>Deine Inhalte erreichen bestätigte Freunde und die von dir gewählte Gruppe.</p></article>
              <article data-reveal><span>02</span><h3>Dein Standort</h3><p>Standortfreigaben startest du bewusst und zeitlich begrenzt.</p></article>
              <article data-reveal><span>03</span><h3>Deine Zeit</h3><p>Offen-Status, Aktivitäten und Chats haben klare Laufzeiten und enden automatisch.</p></article>
            </div>
          </div>
        </section>

        <SectionBridge tone="privacy-safety" id="privacy-safety" />

        <SafetySection />

        <section className="faq section-pad" id="fragen">
          <div className="section-grid faq__grid">
            <header data-reveal><p className="eyebrow">Gut zu wissen</p><h2>Fragen zu Mica.</h2></header>
            <div className="faq__items">
              {faqs.map(([question, answer]) => <details key={question} data-reveal><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}
            </div>
          </div>
        </section>

        <SectionBridge tone="faq-coming" id="faq-coming" />

        <section className="coming" id="coming-soon">
          <div className="aurora aurora--footer" aria-hidden="true"><i /><i /><i /></div>
          <div data-reveal><p className="eyebrow">Bald verfügbar</p><h2>Mica kommt bald.</h2><p>Mica startet für iOS und Android. Sobald der Termin feststeht, findest du alle Informationen hier auf micamapp.de.</p><span className="platform-line">Für iOS und Android</span></div>
          <MicaLogo compact className="coming__mark" />
        </section>
      </main>
      <footer><MicaLogo className="footer-logo" /><nav aria-label="Rechtliches"><a href="/impressum">Impressum</a><a href="/datenschutz">Datenschutz</a><a href="/nutzungsbedingungen">Nutzungsbedingungen</a></nav><span>© {new Date().getFullYear()} Mica</span></footer>
      <RevealObserver />
      <ChapterTransitions />
    </>
  );
}
