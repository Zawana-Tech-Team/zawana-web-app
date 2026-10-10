import { useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';

const partners = [
  {
    name: 'Myanmar Airways International',
    logo: '/partners/partner-1.png',
    href: 'https://www.maiair.com/',
  },
  {
    name: 'ROYAL-D',
    logo: '/partners/partner-2.PNG',
    href: 'https://sites.google.com/view/royal-d/home',
  },
  {
    name: 'LI-NING',
    logo: '/partners/partner-3.PNG',
    href: 'https://en.lining.com/',
  },
  {
    name: 'Hundred',
    logo: '/partners/partner-4.PNG',
    href: 'https://us.hndrd.co/',
  },
];

function LogoLink({ partner }: { partner: (typeof partners)[number] }) {
  return (
    <a
      href={partner.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Visit ${partner.name} website (opens in a new tab)`}
      className="group relative flex h-24 w-[190px] shrink-0 items-center justify-center rounded-2xl px-5 outline-none transition duration-200 hover:bg-zawana-800 focus-visible:ring-2 focus-visible:ring-zawana-gold sm:h-28 sm:w-[230px]"
    >
      <img
        src={partner.logo}
        alt={partner.name}
        loading="lazy"
        decoding="async"
        className="max-h-16 w-full max-w-[190px] object-contain opacity-80 transition duration-300 group-hover:scale-[1.03] group-hover:opacity-100 sm:max-h-[72px]"
      />
      <ArrowUpRight size={14} aria-hidden="true" className="absolute right-4 top-3 text-zawana-400 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
    </a>
  );
}

export default function PartnersCarousel() {
  const [touchPaused, setTouchPaused] = useState(false);
  const resumeTimer = useRef<number | undefined>(undefined);

  const pauseForTouch = () => {
    window.clearTimeout(resumeTimer.current);
    setTouchPaused(true);
  };

  const resumeAfterTouch = () => {
    window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setTouchPaused(false), 2200);
  };

  return (
    <section aria-labelledby="trusted-partners-heading" className="mt-14 border-y border-zawana-border bg-white py-10 sm:mt-16 sm:py-12">
      <div className="mx-auto max-w-[1440px] px-5 md:px-10">
        <div className="text-center">
          <p className="eyebrow text-zawana-accent">The people beside us</p>
          <h2 id="trusted-partners-heading" className="mt-3 text-2xl font-bold tracking-[-.04em] text-zawana-950 sm:text-3xl">
            Our Trusted Partners
          </h2>
          <p className="mt-2 text-sm leading-6 text-zawana-500 sm:text-base">
            Together, we elevate performance and possibility.
          </p>
        </div>

        <div
          className={`partners-marquee relative mt-7 ${touchPaused ? 'partners-marquee--touch-paused' : ''}`}
          onTouchStart={pauseForTouch}
          onTouchEnd={resumeAfterTouch}
          onTouchCancel={resumeAfterTouch}
        >
          <div className="partners-marquee__track" style={{ animationDuration: `${partners.length * 8}s` }}>
            <div className="partners-marquee__group" aria-label="Partner websites">
              {partners.map(partner => <LogoLink key={partner.name} partner={partner} />)}
            </div>
            <div className="partners-marquee__group partners-marquee__group--duplicate" aria-hidden="true">
              {partners.map(partner => (
                <div key={partner.name} className="flex h-24 w-[190px] shrink-0 items-center justify-center px-5 sm:h-28 sm:w-[230px]">
                  <img src={partner.logo} alt="" loading="lazy" decoding="async" className="max-h-16 w-full max-w-[190px] object-contain opacity-80 sm:max-h-[72px]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
