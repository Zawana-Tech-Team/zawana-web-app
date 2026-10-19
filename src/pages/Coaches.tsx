import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Search } from 'lucide-react';
import { PublicPage, EditorialHero, EditorialImage, ContentStatus, CoachingInvitation } from '../components/PublicPage';
import { EditorialReveal } from '../components/EditorialReveal';
import { usePublicData } from '../hooks/usePublicData';
import type { PublicCoach } from '../types';

export function Coaches() {
  const { data, loading, error, retry } = usePublicData<PublicCoach[]>('/public/coaches');
  const [query, setQuery] = useState('');
  const coaches = (data || []).filter(coach => `${coach.name} ${coach.specialty}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <PublicPage title="Badminton coaches">
    <EditorialHero eyebrow="THE PEOPLE BEHIND YOUR PROGRESS" title="A better game." accent="Starts with guidance."
      description="Meet our badminton coaches. Find the guidance to build your confidence, refine your technique, and make every rally count."
      label="Coaches" />
    <section className="editorial-content public-light" aria-labelledby="coaches-heading">
      <div className="public-container">
        <EditorialReveal className="editorial-section-heading"><div><p className="public-small">YOUR GAME. OUR SHARED AMBITION.</p><h2 id="coaches-heading">Meet your coaches</h2></div><span className="editorial-section-note">Badminton at ZAWANA</span></EditorialReveal>
        <div className="editorial-toolbar"><p className="coaches-intro">Good habits start with the right people.<br />Explore the team behind your next step on court.</p>
          <label className="editorial-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="Search coaches" placeholder="Name or specialty…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        </div>
        {loading ? <ContentStatus loading /> : error ? <ContentStatus error={error} retry={retry} /> : !data?.length ?
          <ContentStatus title="Meet your next coach soon."><p>Coach profiles are being prepared. Contact our team to discuss badminton coaching and find the right place to start.</p><Link to="/contact" className="public-text-link">Talk to the team <ArrowUpRight size={17} /></Link></ContentStatus> : !coaches.length ?
          <ContentStatus title="No coaches found."><p>Try another name or specialty.</p><button type="button" className="public-text-link" onClick={() => setQuery('')}>Clear search</button></ContentStatus> : <>
            <p className="editorial-results" role="status">{coaches.length} badminton {coaches.length === 1 ? 'coach' : 'coaches'}</p>
            <div className="coaches-grid">{coaches.map((coach, index) => <EditorialReveal as="article" key={coach.id} className="coach-profile" delay={(index % 3) * .07}>
              <div className="coach-profile__portrait"><EditorialImage src={coach.imageUrl} alt={coach.name} coach /><span className="coach-profile__number">{String(index + 1).padStart(2, '0')}</span></div>
              <div className="coach-profile__copy"><p className="public-small">BADMINTON COACH</p><h3>{coach.name}</h3><p className="coach-profile__specialty">{coach.specialty || 'Badminton coaching'}</p>
                <Link to="/contact" className="public-text-link" aria-label={`Enquire about coaching with ${coach.name}`}>Enquire about coaching <ArrowUpRight size={17} aria-hidden="true" /></Link>
              </div>
            </EditorialReveal>)}</div>
          </>}
        <EditorialReveal className="coaching-note"><span className="public-small">FIND YOUR FIT</span><p>Not sure where to start? Our team can help you choose a coach and a training path that suits your game.</p><Link to="/contact" className="public-text-link">Let’s talk <ArrowUpRight size={17} /></Link></EditorialReveal>
      </div>
    </section>
    <CoachingInvitation />
  </PublicPage>;
}
