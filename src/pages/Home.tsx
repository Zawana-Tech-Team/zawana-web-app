import { MotionConfig } from 'framer-motion';
import { PublicNavigation } from '../components/home/PublicNavigation';
import {
  CinematicHero,
  Philosophy,
  Ecosystem,
  BadmintonExperience,
  PerformanceExperience,
  RecoveryExperience,
  ClosingSection,
  PublicFooter
} from '../components/home/LandingSections';
import { MembershipExperience } from '../components/home/MembershipExperience';
import { CommunitySection } from '../components/home/CommunitySection';
import { PageLoader } from '../components/home/Motion';
import '../components/home/landing.css';

export function Home() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="zawana-public">
        <a className="public-skip" href="#public-main">
          Skip to content
        </a>
        <PageLoader />
        <PublicNavigation />
        <main id="public-main" tabIndex={-1}>
          <CinematicHero />
          <Philosophy />
          <Ecosystem />
          <BadmintonExperience />
          <PerformanceExperience />
          <RecoveryExperience />
          <MembershipExperience />
          <CommunitySection />
          <ClosingSection />
        </main>
        <PublicFooter />
      </div>
    </MotionConfig>
  );
}
