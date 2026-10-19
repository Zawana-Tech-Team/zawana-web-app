import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Search } from 'lucide-react';
import { PublicPage, EditorialHero, EditorialImage, ContentStatus, CoachingInvitation } from '../components/PublicPage';
import { EditorialReveal } from '../components/EditorialReveal';
import { usePublicData } from '../hooks/usePublicData';
import { publicationDate, safeHttpUrl } from '../utils/publicContent';
import type { AchievementSummary, ContentItem } from '../types';

const categories = ['All stories', 'Milestones', 'Tournaments', 'Academy', 'Community'];

function StoryCard({ story, featured = false, index = 0 }: { story: AchievementSummary; featured?: boolean; index?: number }) {
  return <EditorialReveal as="article" delay={(index % 3) * .07} className={`achievement-card ${featured ? 'achievement-card--featured' : ''}`}>
    <Link to={`/achievements/${story.id}`} className="achievement-card__image" tabIndex={-1} aria-hidden="true">
      <EditorialImage src={story.image} alt={story.title} />
      {featured && <span className="achievement-featured-label">LATEST STORY</span>}
    </Link>
    <div className="achievement-card__copy">
      <div className="story-meta"><span>{story.category}</span><time dateTime={story.publishDate}>{publicationDate(story.publishDate)}</time></div>
      <h2><Link to={`/achievements/${story.id}`}>{story.title}</Link></h2>
      <p>{story.description}</p>
      <Link className="public-text-link" to={`/achievements/${story.id}`} aria-label={`Read story: ${story.title}`}>Read the story <ArrowUpRight size={18} aria-hidden="true" /></Link>
    </div>
  </EditorialReveal>;
}

export function Achievements() {
  const { data, loading, error, retry } = usePublicData<AchievementSummary[]>('/achievements');
  const [category, setCategory] = useState('All stories');
  const [query, setQuery] = useState('');
  const stories = (data || []).filter(story =>
    (category === 'All stories' || story.category === category) &&
    `${story.title} ${story.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );
  const filtered = category !== 'All stories' || Boolean(query.trim());
  return <PublicPage title="Achievements">
    <EditorialHero eyebrow="THE ZAWANA JOURNAL" title="Every effort." accent="A story worth sharing."
      description="Celebrating the players, the milestones, and the moments that move our community forward."
      label="Achievements" />
    <section className="editorial-content public-light" aria-labelledby="achievement-heading">
      <div className="public-container">
        <EditorialReveal className="editorial-section-heading"><div><p className="public-small">ON COURT. BEYOND EXPECTATIONS.</p><h2 id="achievement-heading">Our achievements</h2></div><span className="editorial-section-note">Progress, in good company.</span></EditorialReveal>
        <div className="editorial-toolbar">
          <div className="editorial-filters" role="group" aria-label="Filter achievement stories">
            {categories.map(label => <button key={label} type="button" aria-pressed={category === label} onClick={() => setCategory(label)}>{label}</button>)}
          </div>
          <label className="editorial-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="Search achievements" placeholder="Find a story…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        </div>
        {loading ? <ContentStatus loading /> : error ? <ContentStatus error={error} retry={retry} /> : !data?.length ?
          <ContentStatus title="Great stories are on their way."><p>Our next chapter is being written on the court. Check back for achievements and highlights from the ZAWANA community.</p><Link to="/coaches" className="public-text-link">Meet our coaches <ArrowUpRight size={17} /></Link></ContentStatus> : !stories.length ?
          <ContentStatus title="No stories found."><p>Try a different keyword or category.</p><button className="public-text-link" type="button" onClick={() => { setQuery(''); setCategory('All stories'); }}>Clear filters</button></ContentStatus> : <>
            <p className="editorial-results" role="status">{stories.length} {stories.length === 1 ? 'story' : 'stories'}{filtered ? ' found' : ' from our community'}</p>
            {!filtered && <StoryCard story={stories[0]} featured />}
            <div className="achievement-grid">{(filtered ? stories : stories.slice(1)).map((story, index) => <StoryCard key={story.id} story={story} index={index} />)}</div>
          </>}
      </div>
    </section>
    <CoachingInvitation />
  </PublicPage>;
}

export function AchievementArticle() {
  const { id } = useParams();
  const { data: story, loading, error, status, retry } = usePublicData<ContentItem>(`/achievements/${encodeURIComponent(id || '')}`);
  const registration = story ? safeHttpUrl(story.googleFormLink) : undefined;
  const readMinutes = story ? Math.max(1, Math.ceil(story.body.split(/\s+/).length / 200)) : 1;
  return <PublicPage title={story?.title || 'Achievement story'}>
    <section className="editorial-content public-light article-section">
      <div className="public-container">
        <Link to="/achievements" className="public-text-link article-back"><ArrowLeft size={17} />All achievements</Link>
        {loading ? <ContentStatus loading /> : status === 404 ? <ContentStatus title="This story is not available."><p>It may have been moved or is no longer published. Explore our latest achievements instead.</p></ContentStatus> : error ? <ContentStatus error={error} retry={retry} /> : story && <article>
          <EditorialReveal as="header" className="article-heading"><p className="public-small">THE ZAWANA JOURNAL / {story.category}</p><h1>{story.title}</h1><p className="article-summary">{story.description}</p>
            <div className="story-meta"><span>ZAWANA Arena</span><time dateTime={story.publishDate}>{publicationDate(story.publishDate)}</time><span>{readMinutes} min read</span></div>
          </EditorialReveal>
          <EditorialReveal className="article-cover" delay={.1}><EditorialImage src={story.image} alt={story.title} priority /></EditorialReveal>
          <div className="article-layout"><EditorialReveal className="article-body">
            {story.body.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            {registration && <a href={registration} target="_blank" rel="noopener noreferrer" className="public-text-link">Find out more <ArrowUpRight size={17} /><span className="sr-only">(opens in a new tab)</span></a>}
          </EditorialReveal><EditorialReveal as="aside" className="article-aside" delay={.1}><p className="public-small">KEEP THE MOMENTUM</p><h2>Inspired to step onto the court?</h2><p>Meet the people helping our badminton community move forward.</p><Link to="/coaches" className="public-text-link">Meet our coaches <ArrowUpRight size={17} /></Link><Link to="/achievements" className="public-text-link">More achievements <ArrowUpRight size={17} /></Link></EditorialReveal></div>
        </article>}
      </div>
    </section>
  </PublicPage>;
}
