import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Trophy, UserRound } from 'lucide-react';
import { PublicNavigation } from './home/PublicNavigation';
import { PublicFooter } from './home/LandingSections';
import OptimizedImage from './OptimizedImage';
import { EditorialReveal } from './EditorialReveal';
import { publicImageSrc } from '../utils/publicContent';
import './home/landing.css';
import '../styles/editorial.css';

export function PublicPage({ children, title }: { children: ReactNode; title: string }) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | ZAWANA Arena`;
    return () => { document.title = previous; };
  }, [title]);
  return <div className="zawana-public public-editorial">
    <a className="public-skip" href="#public-main">Skip to content</a>
    <PublicNavigation />
    <main id="public-main" tabIndex={-1}>{children}</main>
    <PublicFooter />
  </div>;
}

export function EditorialHero({ eyebrow, title, accent, description, label }: {
  eyebrow: string; title: string; accent: string; description: string; label: string;
}) {
  return <section className="editorial-hero">
    <div className="public-container editorial-hero__grid">
      <div className="editorial-hero__copy">
        <EditorialReveal className="editorial-breadcrumb"><Link to="/">Home</Link><span>/</span><span>{label}</span></EditorialReveal>
        <EditorialReveal delay={.06}><p className="public-eyebrow"><span />{eyebrow}</p></EditorialReveal>
        <EditorialReveal delay={.12}><h1>{title}<br /><em>{accent}</em></h1></EditorialReveal>
        <EditorialReveal delay={.2}><p className="editorial-intro">{description}</p></EditorialReveal>
      </div>
      <EditorialReveal as="figure" className="editorial-hero__visual" delay={.14}>
        <OptimizedImage src="/facilities/responsive/court-1280.webp" alt="The badminton courts at ZAWANA Arena, Yangon" width={1280} height={960} loading="eager" fetchPriority="high" />
        <figcaption><span>ZAWANA ARENA</span><span>YANGON, MYANMAR</span></figcaption>
      </EditorialReveal>
    </div>
  </section>;
}

export function EditorialImage({ src, alt, coach = false, priority = false }: { src?: string | null; alt: string; coach?: boolean; priority?: boolean }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const url = publicImageSrc(src);
  return <div className={`editorial-image ${coach ? 'editorial-image--coach' : ''}`}>
    {url && failedSrc !== url ? <OptimizedImage src={url} alt={alt} width={coach ? 600 : 1000} height={coach ? 750 : 700}
      loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'low'} onError={() => setFailedSrc(url)} /> :
      <div className="editorial-image__placeholder" aria-label={coach ? `${alt}, portrait coming soon` : 'ZAWANA achievement'} role="img">
        {coach ? <><UserRound size={44} strokeWidth={1} /><span>{alt.split(/\s+/).filter(Boolean).map(word => word[0]).slice(0, 2).join('')}</span></> : <Trophy size={58} strokeWidth={1} />}
        <span className="public-small">{coach ? 'ZAWANA COACHING' : 'THE ZAWANA JOURNAL'}</span>
      </div>}
  </div>;
}

export function ContentStatus({ loading, error, title, children, retry }: {
  loading?: boolean; error?: string; title?: string; children?: ReactNode; retry?: () => void;
}) {
  return <div className="editorial-status" role={error ? 'alert' : 'status'}>
    {loading ? <><span className="editorial-loading" /><p>Loading…</p></> : <>
      <Trophy size={30} strokeWidth={1.2} aria-hidden="true" />
      <h2>{title || 'Temporarily unavailable'}</h2>
      {children}
      {error && <p>We couldn’t load this content. Please try again.</p>}
      {retry && <button type="button" className="public-text-link" onClick={retry}>Try again <ArrowUpRight size={16} /></button>}
    </>}
  </div>;
}

export function CoachingInvitation() {
  return <section className="editorial-invitation public-container">
    <EditorialReveal><p className="public-small">YOUR NEXT CHAPTER</p><h2>Make progress.<br /><em>Make it yours.</em></h2></EditorialReveal>
    <EditorialReveal delay={.1}><p>Step onto the court with a team that shares your ambition. Discover badminton coaching at ZAWANA.</p>
      <Link className="public-button public-button--gold" to="/private-course">Explore private coaching <ArrowUpRight size={18} /></Link>
    </EditorialReveal>
  </section>;
}
