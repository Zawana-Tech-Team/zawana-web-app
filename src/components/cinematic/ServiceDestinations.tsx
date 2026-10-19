import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import OptimizedImage from '../OptimizedImage';

export const destinations = [
  { id: 'badminton', name: 'BADMINTON', short: 'Play', line: 'Train. Play. Compete.', copy: 'For the first rally, the next challenge, and everything in between.', image: 'court', to: '/book/court', action: 'Book a court' },
  { id: 'gym', name: 'HIGH PERFORMANCE GYM', short: 'Perform', line: 'Build strength. Unlock potential.', copy: 'Strength, conditioning, and purposeful training. Make progress a practice.', image: 'gym', to: '/training', action: 'Explore training' },
  { id: 'revive', name: 'REVIVE CLINIC', short: 'Recover', line: 'Recover stronger.', copy: 'Physiotherapy, sports recovery, and injury assessment. Get back to what moves you.', image: 'revive', to: '/revive', action: 'Discover Revive' },
  { id: 'store', name: 'SPORTS STORE', short: 'Equip', line: 'Equip your performance.', copy: 'Find sporting essentials in the ZAWANA store through your member account.', image: null, to: '/store', action: 'Explore the store' },
  { id: 'cafe', name: 'ZAWANA CAFE', short: 'Recharge', line: 'Recharge your energy.', copy: 'Coffee, a moment to reset, and a place to connect between sessions.', image: 'cafe', to: '/cafe-order', action: 'Explore the cafe' },
] as const;

function EquipmentIllustration() {
  return <div className="campaign-equipment" role="img" aria-label="Illustration of badminton rackets and a shuttlecock">
    <svg viewBox="0 0 600 520" fill="none" aria-hidden="true">
      <defs><pattern id="racket-strings" width="13" height="13" patternUnits="userSpaceOnUse"><path d="M13 0H0V13" stroke="#d7ddd2" strokeOpacity=".45" strokeWidth=".8" /></pattern></defs>
      <g transform="rotate(27 300 280)"><ellipse cx="300" cy="185" rx="95" ry="125" fill="url(#racket-strings)" stroke="#c6a34a" strokeWidth="9" /><path d="M264 301L300 355L336 301M300 355V473" stroke="#879b8e" strokeWidth="6" /><path d="M300 436V505" stroke="#c6a34a" strokeWidth="22" /></g>
      <g transform="translate(70 190) rotate(-25 190 120)"><path d="M170 105L132 16L221 16L187 105" fill="#f0eee3" fillOpacity=".85" /><path d="M143 18L174 102M162 18L177 102M181 18V102M201 18L184 102" stroke="#567063" /><path d="M170 105C161 131 193 139 193 111L187 105" fill="#c9bca1" /><path d="M169 102H190" stroke="#c6a34a" strokeWidth="7" /></g>
    </svg><span>SPORTING ESSENTIALS / EQUIPMENT ILLUSTRATION</span>
  </div>;
}

export function DestinationLinks() {
  return <div className="journey-destinations" aria-label="Explore ZAWANA services">
    {destinations.map((destination, index) => <Link key={destination.id} to={destination.to}>
      <span className="journey-destination__index">0{index + 1}</span><span><b>{destination.short}</b><small>{destination.name}</small></span><ArrowUpRight size={18} aria-hidden="true" />
    </Link>)}
  </div>;
}

export function ServiceDestinations() {
  const [selected, setSelected] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(() => matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const media = matchMedia('(max-width: 767px)');
    const sync = () => setCompact(media.matches);
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu || !compact) return;
    const revealSelection = () => {
      const button = menu.querySelector<HTMLElement>('[aria-selected="true"]');
      if (button) menu.scrollTo({ left: menu.scrollLeft + button.getBoundingClientRect().left - menu.getBoundingClientRect().left, behavior: 'instant' });
    };
    const observer = new ResizeObserver(revealSelection);
    observer.observe(menu);
    revealSelection();
    return () => observer.disconnect();
  }, [compact, selected]);
  const destination = destinations[selected];
  const selectDestination = (index: number, focus = false) => {
    setSelected(index);
    const button = document.getElementById(`service-tab-${destinations[index].id}`);
    if (focus) button?.focus({ preventScroll: true });
  };
  return <section id="ecosystem" tabIndex={-1} className="campaign-services public-section" aria-labelledby="campaign-services-heading">
    <div className="public-container">
      <div className="campaign-section-top"><p className="public-eyebrow"><span>02 /</span> A WORLD OF MOVEMENT</p><span className="public-small">FIND YOUR ELEMENT</span></div>
      <div className="campaign-section-heading"><h2 id="campaign-services-heading">BUILT TO<br /><span>MOVE YOU.</span></h2><p>Beyond the court, a connected world.<br />Find the experience that moves you.</p></div>
      <div className="campaign-services__layout">
        <div ref={menuRef} className="campaign-services__menu" role="tablist" aria-label="ZAWANA experiences" aria-orientation={compact ? 'horizontal' : 'vertical'}>
          {destinations.map((item, index) => <button key={item.id} id={`service-tab-${item.id}`} role="tab" aria-selected={selected === index}
            aria-controls="service-panel" tabIndex={selected === index ? 0 : -1} onClick={() => selectDestination(index)}
            onKeyDown={event => {
              let next = selected;
              if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (selected + 1) % destinations.length;
              else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (selected - 1 + destinations.length) % destinations.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = destinations.length - 1;
              else return;
              event.preventDefault(); selectDestination(next, true);
            }}>
            <span>0{index + 1}</span><span><b>{item.name}</b><small>{item.line}</small></span><ArrowUpRight size={20} aria-hidden="true" />
          </button>)}
        </div>
        <div id="service-panel" role="tabpanel" aria-labelledby={`service-tab-${destination.id}`} tabIndex={0} className="campaign-service-panel">
          <div className="campaign-service-panel__image" key={destination.id}>
            {destination.image ? <OptimizedImage src={`/facilities/responsive/${destination.image}-1280.webp`} srcSet={`/facilities/responsive/${destination.image}-640.webp 640w, /facilities/responsive/${destination.image}-1280.webp 1280w`} sizes="(max-width: 767px) 100vw, 60vw" alt={`${destination.name} at ZAWANA`} width={1280} height={960} /> : <EquipmentIllustration />}
            <span className="campaign-service-panel__label">{destination.image ? 'INSIDE ZAWANA / ACTUAL FACILITY' : 'THE ZAWANA STORE'}</span>
          </div>
          <div className="campaign-service-panel__caption"><div><p className="public-small">{destination.short}</p><h3>{destination.line}</h3><p>{destination.copy}</p></div><Link to={destination.to} className="campaign-round-link" aria-label={destination.action}><ArrowUpRight size={25} /></Link></div>
        </div>
      </div>
      <div className="campaign-extra-services"><span>MORE WAYS TO FIND YOUR RHYTHM</span><Link to="/classes">Training studio <ArrowRight size={15} /></Link><Link to="/contact">Cut Lab <ArrowRight size={15} /></Link><Link to="/coaches">Meet our coaches <ArrowRight size={15} /></Link></div>
    </div>
  </section>;
}
