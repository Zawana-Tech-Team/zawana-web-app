import { Link } from 'react-router-dom';
import { lazy, Suspense, useState } from 'react';
import { ArrowDown, ArrowUpRight, MoveUpRight, Pause, Play } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { LocalizedTree, LanguageSwitcher } from '../../context/LanguageContext';
import {
  FadeUp,
  HoverImage,
  MagneticButton,
  ParallaxImage,
  RevealLines,
  RevealText,
  SectionTransition,
  StaggerContainer
} from './Motion';
import { PublicBrand } from './PublicNavigation';
import HeroSceneBoundary from './HeroSceneBoundary';
import HeroFallback from './HeroFallback';

const HeroScene = lazy(() => import('./HeroScene'));

export function SectionLabel({ number, children }: { number: string; children: string }) {
  return (
    <p className="public-eyebrow">
      <span>{number} /</span> {children}
    </p>
  );
}

export function CinematicHero() {
  const [scenePaused, setScenePaused] = useState(false);
  const reduced = useReducedMotion();
  return (
    <LocalizedTree>
      <section className="cinematic-hero cinematic-hero--three" aria-labelledby="hero-heading">
        <HeroSceneBoundary fallback={<HeroFallback />}>
          <Suspense fallback={<HeroFallback />}>
            <HeroScene paused={scenePaused} />
          </Suspense>
        </HeroSceneBoundary>
        <div className="hero-shade" />
        {!reduced && (
          <button
            type="button"
            className="hero-scene-control"
            aria-label={scenePaused ? 'Resume 3D motion' : 'Pause 3D motion'}
            aria-pressed={scenePaused}
            onClick={() => setScenePaused((value) => !value)}
          >
            {scenePaused ? (
              <Play size={12} aria-hidden="true" />
            ) : (
              <Pause size={12} aria-hidden="true" />
            )}
            {scenePaused ? 'Resume motion' : 'Pause motion'}
          </button>
        )}
        <div className="hero-scene-caption" aria-hidden="true">
          <span>PRECISION IN MOTION</span>
          <span>BADMINTON / PERFORMANCE / LIFESTYLE</span>
        </div>
        <div className="hero-content public-container">
          <FadeUp>
            <p className="public-eyebrow">
              <span className="hero-gold-line" /> Yangon, Myanmar · Sports & lifestyle
            </p>
          </FadeUp>
          <h1 id="hero-heading">
            <RevealText text="ELEVATE YOUR GAME." delay={0.3} />
            <RevealText text="REDEFINE YOUR" delay={0.5} />
            <RevealText text="LIFESTYLE." delay={0.65} className="hero-outline" />
          </h1>
          <FadeUp delay={0.65} className="hero-support">
            <p>A connected destination for badminton, performance, recovery, and lifestyle.</p>
            <div className="public-actions">
              <MagneticButton to="#ecosystem">Explore ZAWANA</MagneticButton>
              <MagneticButton to="/book/court" variant="outline">
                Book a Court
              </MagneticButton>
            </div>
          </FadeUp>
        </div>
        <Link className="hero-note" to="/book/court">
          <span className="hero-note__index">01 / THE ARENA</span>
          <span>
            Make time
            <br />
            for your game.
          </span>
          <ArrowUpRight size={25} aria-hidden="true" />
        </Link>
        <div className="hero-bottom public-container">
          <a href="#arena">
            Scroll to discover <ArrowDown size={15} aria-hidden="true" />
          </a>
          <span>PLAY. TRAIN. RECOVER. BELONG.</span>
          <span>THE ART OF PERFORMANCE</span>
        </div>
      </section>
    </LocalizedTree>
  );
}

export function Philosophy() {
  return (
    <LocalizedTree>
      <section
        id="arena"
        tabIndex={-1}
        className="public-light philosophy public-section"
        aria-labelledby="philosophy-heading"
      >
        <div className="public-container">
          <SectionLabel number="01">The ZAWANA philosophy</SectionLabel>
          <div className="philosophy-heading">
            <h2 id="philosophy-heading" className="public-heading">
              <RevealLines lines={['MORE THAN', 'AN ARENA.']} />
            </h2>
            <FadeUp className="philosophy-copy">
              <p className="public-lead">
                A place to move.
                <br />A reason to stay.
              </p>
              <p>
                Passion comes first. From your first rally to your next personal best, ZAWANA brings
                sport, strength, recovery, and everyday life together.
              </p>
              <p>
                Built to nurture talent and a stronger sporting culture in Myanmar. Made for the
                people who make it happen.
              </p>
              <a className="public-text-link" href="#ecosystem">
                Discover our world <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            </FadeUp>
          </div>
          <SectionTransition>
            <figure className="philosophy-photo">
              <ParallaxImage
                name="court"
                alt="The architecture, green courts, and court markings of the ZAWANA badminton arena"
              />
              <figcaption>
                <span>A shared passion. A connected destination.</span>
                <span>THE ZAWANA / YANGON</span>
              </figcaption>
              <span className="photo-coordinate" aria-hidden="true">
                PLAY
                <br />
                WITH
                <br />
                PURPOSE.
              </span>
            </figure>
          </SectionTransition>
        </div>
      </section>
    </LocalizedTree>
  );
}

const facilities = [
  {
    name: 'Badminton Courts',
    image: 'court',
    category: 'PLAY',
    description:
      'Social games, junior classes, and competitive training. Space for every level of play.',
    to: '/book/court',
    cta: 'Book a court',
    alt: 'ZAWANA indoor badminton courts'
  },
  {
    name: 'High Performance Gym',
    image: 'gym',
    category: 'PERFORM',
    description:
      'Strength, conditioning, and purposeful training to move your performance forward.',
    to: '/training',
    cta: 'Explore training',
    alt: 'Strength and conditioning equipment at the ZAWANA gym'
  },
  {
    name: 'Training Studio',
    image: 'gx-studio',
    category: 'MOVE',
    description: 'From yoga and Zumba to kickboxing and Taekwondo. Find your kind of movement.',
    to: '/classes',
    cta: 'Explore classes',
    alt: 'ZAWANA group exercise and training studio'
  },
  {
    name: 'Revive Clinic',
    image: 'revive',
    category: 'RECOVER',
    description: 'Care for everyday aches and sports injuries. Recover well, and get moving again.',
    to: '/revive',
    cta: 'Explore Revive',
    alt: 'Treatment space at ZAWANA Revive Clinic'
  },
  {
    name: 'Zawana Cafe',
    image: 'cafe',
    category: 'REFUEL',
    description: 'Coffee, a moment to reset, and a place to connect between sessions.',
    to: '/cafe-order',
    cta: 'Explore the cafe',
    alt: 'Seating and refreshments at Zawana Cafe'
  },
  {
    name: 'Cut Lab',
    image: 'cutlab',
    category: 'RESET',
    description:
      'Professional barbering, styling, and grooming. Leave feeling as sharp as you play.',
    to: '/contact',
    cta: 'Ask about Cut Lab',
    alt: 'The Cut Lab barbering and grooming space at ZAWANA'
  }
];

export function Ecosystem() {
  const reduced = useReducedMotion();
  return (
    <LocalizedTree>
      <section
        id="ecosystem"
        tabIndex={-1}
        className="ecosystem public-section"
        aria-labelledby="ecosystem-heading"
      >
        <div className="public-container">
          <SectionLabel number="02">One destination. Every dimension.</SectionLabel>
          <div className="public-section-heading">
            <h2 id="ecosystem-heading" className="public-heading">
              <RevealLines lines={['FIND YOUR', 'ELEMENT.']} />
            </h2>
            <FadeUp>
              <p>
                Six experiences. One connected world.
                <br />
                Discover the way you want to spend your day.
              </p>
              <span className="public-small">THE ZAWANA ECOSYSTEM</span>
            </FadeUp>
          </div>
          <StaggerContainer className="ecosystem-grid">
            {facilities.map((facility, i) => (
              <motion.article
                className={`facility facility--${i + 1}`}
                key={facility.name}
                variants={{
                  hidden: { opacity: reduced ? 1 : 0, y: reduced ? 0 : 28 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.7 } }
                }}
              >
                <Link className="facility-link" to={facility.to}>
                  <div className="facility-photo">
                    <HoverImage name={facility.image} alt={facility.alt} />
                    <span className="facility-tag">
                      0{i + 1} / {facility.category}
                    </span>
                    <span className="facility-arrow">
                      <ArrowUpRight size={24} aria-hidden="true" />
                    </span>
                  </div>
                  <div className="facility-caption">
                    <h3>{facility.name}</h3>
                    <p>{facility.description}</p>
                    <span className="public-text-link">
                      {facility.cta}
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              </motion.article>
            ))}
          </StaggerContainer>
        </div>
      </section>
    </LocalizedTree>
  );
}

export function BadmintonExperience() {
  const reduced = useReducedMotion();
  return (
    <LocalizedTree>
      <section className="badminton-experience" aria-labelledby="badminton-heading">
        <SectionTransition className="badminton-photo">
          <ParallaxImage name="court" alt="Court nets and playing surfaces at ZAWANA" />
          <span className="badminton-photo-label">AT THE HEART OF ZAWANA</span>
          <motion.div
            className="court-motif"
            aria-hidden="true"
            initial={reduced ? false : { opacity: 0, scaleY: 0.85 }}
            whileInView={{ opacity: 1, scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.1 }}
          >
            <span />
            <span />
            <span />
          </motion.div>
        </SectionTransition>
        <div className="badminton-copy">
          <SectionLabel number="03">The badminton experience</SectionLabel>
          <h2 id="badminton-heading" className="public-heading">
            <RevealLines lines={['EVERY RALLY.', 'A NEW LEVEL.']} />
          </h2>
          <FadeUp>
            <p>
              Some come for the game. Others come to change theirs. Whatever brings you to the
              court, make every session count.
            </p>
            <ul className="public-service-list">
              <li>
                <span>01</span>Court booking
                <ArrowUpRight size={16} aria-hidden="true" />
              </li>
              <li>
                <span>02</span>Private coaching
                <ArrowUpRight size={16} aria-hidden="true" />
              </li>
              <li>
                <span>03</span>Group training
                <ArrowUpRight size={16} aria-hidden="true" />
              </li>
              <li>
                <span>04</span>Competitive development
                <ArrowUpRight size={16} aria-hidden="true" />
              </li>
            </ul>
            <div className="public-actions">
              <MagneticButton to="/book/court">Book a Court</MagneticButton>
              <Link className="public-text-link" to="/private-course">
                Find your coaching
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </div>
          </FadeUp>
        </div>
      </section>
    </LocalizedTree>
  );
}

export function PerformanceExperience() {
  return (
    <LocalizedTree>
      <section
        id="performance"
        tabIndex={-1}
        className="performance-experience public-section"
        aria-labelledby="performance-heading"
      >
        <div className="public-container">
          <SectionLabel number="04">Performance & training</SectionLabel>
          <div className="performance-title">
            <h2 id="performance-heading" className="public-heading">
              <RevealLines lines={['BUILT FOR', 'YOUR BETTER.']} />
            </h2>
            <span className="performance-arrow" aria-hidden="true">
              <MoveUpRight strokeWidth={0.6} />
            </span>
          </div>
          <div className="performance-grid">
            <SectionTransition>
              <div className="performance-photo">
                <ParallaxImage
                  name="gym"
                  alt="The ZAWANA high performance gym and strength training equipment"
                />
                <span>STRENGTH WITH INTENTION.</span>
              </div>
            </SectionTransition>
            <FadeUp className="performance-copy">
              <p className="public-lead">
                Train with intention.
                <br />
                Perform with confidence.
              </p>
              <p>
                Connect strength and conditioning with athlete development, performance assessment,
                and coach-guided training.
              </p>
              <div className="performance-pillars">
                <span>Strength & conditioning</span>
                <span>Athlete development</span>
                <span>Performance assessment</span>
                <span>Gym memberships</span>
              </div>
              <MagneticButton to="/training" variant="ink">
                Explore training
              </MagneticButton>
            </FadeUp>
          </div>
        </div>
      </section>
    </LocalizedTree>
  );
}

export function RecoveryExperience() {
  return (
    <LocalizedTree>
      <section
        className="recovery-experience public-light public-section"
        aria-labelledby="recovery-heading"
      >
        <div className="public-container recovery-grid">
          <FadeUp className="recovery-copy">
            <SectionLabel number="05">Recovery & Revive Clinic</SectionLabel>
            <h2 id="recovery-heading" className="public-heading">
              <RevealLines lines={['COME BACK', 'STRONGER.']} />
            </h2>
            <p className="public-lead">
              Give recovery
              <br />
              the space it deserves.
            </p>
            <p>
              Physiotherapy, sports recovery, and injury assessment. A considered approach to
              mobility and rehabilitation, so you can get back to what moves you.
            </p>
            <MagneticButton to="/revive" variant="ink">
              Discover Revive Clinic
            </MagneticButton>
            <span className="recovery-footnote">MOVE WELL. FEEL WELL. LIVE WELL.</span>
          </FadeUp>
          <SectionTransition>
            <figure className="recovery-photo">
              <ParallaxImage
                name="revive"
                alt="A calm treatment and rehabilitation room at Revive Clinic"
              />
              <figcaption>
                <span>REVIVE CLINIC</span>
                <span>Care. Recovery. Movement.</span>
              </figcaption>
            </figure>
          </SectionTransition>
        </div>
      </section>
    </LocalizedTree>
  );
}

export function ClosingSection() {
  return (
    <LocalizedTree>
      <section className="closing-section" aria-labelledby="closing-heading">
        <ParallaxImage name="court" alt="" />
        <div className="closing-shade" />
        <div className="public-container closing-content">
          <SectionLabel number="08">Your next chapter</SectionLabel>
          <h2 id="closing-heading" className="public-heading">
            <RevealLines lines={['YOUR NEXT LEVEL', 'STARTS HERE.']} />
          </h2>
          <FadeUp>
            <p>A new game. A stronger you. A place to belong.</p>
            <MagneticButton to="/signup">Join ZAWANA</MagneticButton>
          </FadeUp>
          <span className="closing-signature">THE ART OF PERFORMANCE.</span>
        </div>
      </section>
    </LocalizedTree>
  );
}

export function PublicFooter() {
  return (
    <LocalizedTree>
      <footer className="public-footer">
        <div className="public-container">
          <div className="footer-top">
            <div>
              <PublicBrand />
              <p>
                Badminton. Performance. Recovery. Lifestyle.
                <br />
                Connected by a shared passion.
              </p>
              <address className="footer-contact">
                No. 31, corner of Zawana & Thiri Ayeyar Street,
                <br />
                Thingangyun, Yangon, Myanmar
                <a href="tel:+959447974995">+95 9 447 974 995</a>
                <a href="mailto:zawana4994@gmail.com">zawana4994@gmail.com</a>
              </address>
            </div>
            <nav aria-label="Explore ZAWANA">
              <span className="public-small">DISCOVER</span>
              <a href="#arena">The arena</a>
              <a href="#ecosystem">Our experiences</a>
              <a href="#community">Community</a>
              <Link to="/contact">Contact ZAWANA</Link>
            </nav>
            <nav aria-label="ZAWANA services">
              <span className="public-small">MAKE YOUR MOVE</span>
              <Link to="/book/court">Book a court</Link>
              <Link to="/private-course">Private coaching</Link>
              <Link to="/training">Gym & training</Link>
              <Link to="/revive">Revive Clinic</Link>
            </nav>
            <div className="footer-account">
              <span className="public-small">YOUR ZAWANA</span>
              <Link to="/signup" className="public-text-link">
                Become a member <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
              <Link to="/login">Member login</Link>
              <a
                href="https://www.facebook.com/103013559107437"
                target="_blank"
                rel="noopener noreferrer"
                className="public-text-link"
              >
                Follow on Facebook <span className="sr-only">(opens in a new tab)</span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
              <LanguageSwitcher />
            </div>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} THE ZAWANA</span>
            <span>YANGON, MYANMAR</span>
            <a href="#public-main">
              Back to top <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
        </div>
      </footer>
    </LocalizedTree>
  );
}
