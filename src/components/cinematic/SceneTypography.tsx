import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { chapters } from './choreography';
import { DestinationLinks } from './ServiceDestinations';

export function SceneTypography({ active, jumpTo, still = false }: { active: number; jumpTo?: (index: number) => void; still?: boolean }) {
  return <div className={`journey-narrative ${still ? 'journey-narrative--still' : ''}`}>
    {chapters.map((chapter, index) => {
      const visible = still || active === index;
      const Heading = index === 0 ? 'h1' : 'h2';
      return <section key={chapter.id} className={`journey-chapter journey-chapter--${chapter.id}`} aria-hidden={!visible} inert={!visible} aria-labelledby={`journey-heading-${chapter.id}`}>
        <motion.div className="journey-chapter__inner" initial={false}
          animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : -15, filter: visible ? 'blur(0px)' : 'blur(4px)' }}
          transition={{ duration: still ? 0 : .35, ease: [.2, .8, .2, 1] }}>
          <p className="journey-eyebrow"><span />{index === 0 ? 'YANGON, MYANMAR / BEYOND EXPECTATIONS' : `0${index + 1} / ${chapter.label.toUpperCase()}`}</p>
          <Heading id={`journey-heading-${chapter.id}`} className="journey-headline" aria-label={chapter.lines.join(' ')}>
            {chapter.lines.map((line, lineIndex) => <span className="journey-text-mask" key={line} aria-hidden="true">
              <motion.span initial={false} animate={{ y: visible ? '0%' : '105%' }} transition={{ duration: still ? 0 : .6, delay: still ? 0 : lineIndex * .07, ease: [.16, 1, .3, 1] }}>{line}</motion.span>
            </span>)}
          </Heading>
          <p className="journey-copy">{chapter.copy}</p>
          {index === 0 && <div className="journey-actions"><a className="campaign-button campaign-button--gold" href="#ecosystem" onClick={still ? undefined : event => { event.preventDefault(); jumpTo?.(3); }}>Explore ZAWANA <ArrowUpRight size={17} /></a><Link className="campaign-button campaign-button--glass" to="/book/court">Book a Court <ArrowUpRight size={17} /></Link></div>}
          {index === 1 && <p className="journey-detail">PRECISION. INTENTION. IMPACT.</p>}
          {index === 2 && <a className="campaign-inline-link" href="#arena">See the real arena <ArrowUpRight size={17} /></a>}
          {index === 3 && <DestinationLinks />}
          {index === 4 && <div className="journey-booking">
            <div><span className="journey-booking__dot" /><p>YOUR NEXT SESSION STARTS HERE<small>Select your court and time in the booking calendar.</small></p></div>
            <Link to="/book/court" className="campaign-button campaign-button--gold">Book a Court <ArrowUpRight size={18} /></Link>
            <span className="journey-booking__note">View current availability after signing in.</span>
          </div>}
          {index === 0 && still && <a href="#ecosystem" className="journey-static-scroll">Explore the experiences <ArrowDown size={15} /></a>}
        </motion.div>
      </section>;
    })}
  </div>;
}
