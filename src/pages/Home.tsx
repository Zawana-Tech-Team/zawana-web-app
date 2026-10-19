import { MotionConfig } from 'framer-motion';
import { useEffect } from 'react';
import { PublicNavigation } from '../components/home/PublicNavigation';
import {
  ClosingSection,
  PublicFooter
} from '../components/home/LandingSections';
import { CinematicHero } from '../components/cinematic/CinematicHero';
import { ServiceDestinations } from '../components/cinematic/ServiceDestinations';
import { ArenaStory } from '../components/cinematic/ArenaStory';
import { MembershipExperience } from '../components/home/MembershipExperience';
import { CommunitySection } from '../components/home/CommunitySection';
import '../components/home/landing.css';
import '../components/cinematic/cinematic.css';

export function Home() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'ZAWANA — BEYOND THE GAME';
    return () => { document.title = previous; };
  }, []);
  useEffect(() => {
    if (!window.location.hash) return;
    const id = window.location.hash.slice(1);
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(id);
      target?.scrollIntoView({ behavior: 'instant' });
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return (
    <MotionConfig reducedMotion="user">
      <div className="zawana-public campaign-home">
        <a className="public-skip" href="#public-main">
          Skip to content
        </a>
        <PublicNavigation />
        <main id="public-main" tabIndex={-1}>
          <CinematicHero />
          <ArenaStory />
          <ServiceDestinations />
          <MembershipExperience />
          <CommunitySection />
          <ClosingSection />
        </main>
        <PublicFooter />
      </div>
    </MotionConfig>
  );
}
