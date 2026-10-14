import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { get } from '../../api';
import type { ContentItem } from '../../types';
import { LocalizedTree } from '../../context/LanguageContext';
import OptimizedImage from '../OptimizedImage';
import PartnersCarousel from './PartnersCarousel';
import { FadeUp, RevealLines } from './Motion';
import { SectionLabel } from './LandingSections';

function safeExternalLink(value: string) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function CommunitySection() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let active = true;
    let loading = false;
    const load = () => {
      if (loading) return;
      loading = true;
      get<ContentItem[]>('/content')
        .then((content) => {
          if (active) {
            setItems(content.filter((item) => item.status === 'published').slice(0, 3));
            setStatus('ready');
          }
        })
        .catch(() => {
          if (active) setStatus('error');
        })
        .finally(() => {
          loading = false;
        });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') load();
    };
    load();
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      window.removeEventListener('focus', load);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return (
    <LocalizedTree>
      <section
        id="community"
        tabIndex={-1}
        className="community-section public-light public-section"
        aria-labelledby="community-heading"
      >
        <div className="public-container">
          <SectionLabel number="07">Partners & community</SectionLabel>
          <div className="public-section-heading">
            <h2 id="community-heading" className="public-heading">
              <RevealLines lines={['BETTER.', 'TOGETHER.']} />
            </h2>
            <FadeUp>
              <p>
                Connected through sport.
                <br />
                Growing through community.
              </p>
              <Link className="public-text-link" to="/community">
                Explore our community <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </FadeUp>
          </div>
          {items.length > 0 && (
            <div className="community-grid">
              {items.map((item) => (
                <FadeUp key={item.id}>
                  <article className="community-story">
                    {item.image && (
                      <OptimizedImage
                        src={item.image}
                        alt={item.title}
                        width={800}
                        height={600}
                        sizes="(min-width: 768px) 33vw, 100vw"
                      />
                    )}
                    <p className="public-small">ZAWANA JOURNAL</p>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                    {safeExternalLink(item.googleFormLink) ? (
                      <a
                        href={safeExternalLink(item.googleFormLink)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="public-text-link"
                      >
                        Register now <span className="sr-only">(opens in a new tab)</span>
                        <ArrowUpRight size={17} aria-hidden="true" />
                      </a>
                    ) : (
                      <Link to="/community" className="public-text-link">
                        Learn more
                        <ArrowUpRight size={17} aria-hidden="true" />
                      </Link>
                    )}
                  </article>
                </FadeUp>
              ))}
            </div>
          )}
          {status === 'loading' && (
            <p className="community-status" role="status">
              Loading community updates…
            </p>
          )}
          {status === 'error' && (
            <p className="community-status" role="status">
              Community updates are temporarily unavailable.
            </p>
          )}
          {status === 'ready' && items.length === 0 && (
            <p className="community-status">
              Discover programs, events, and workshops through the ZAWANA community.
            </p>
          )}
          <PartnersCarousel />
        </div>
      </section>
    </LocalizedTree>
  );
}
