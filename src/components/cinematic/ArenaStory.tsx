import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import OptimizedImage from '../OptimizedImage';
import { FadeUp } from '../home/Motion';

export function ArenaStory() {
  return <section id="arena" tabIndex={-1} className="campaign-arena public-section" aria-labelledby="campaign-arena-heading">
    <div className="public-container">
      <div className="campaign-section-top"><p className="public-eyebrow"><span>01 /</span> THIS IS THE REAL ZAWANA</p><span className="public-small">A SHARED PASSION. A CONNECTED DESTINATION.</span></div>
      <div className="campaign-arena__heading"><FadeUp><h2 id="campaign-arena-heading">YOUR ARENA.<br /><span>YOUR MOMENT.</span></h2></FadeUp>
        <FadeUp><p>From your first rally to your next personal best. A place to move, a reason to stay, and a community to make it happen.</p><Link to="/achievements" className="campaign-inline-link">Stories from our community <ArrowUpRight size={17} /></Link></FadeUp>
      </div>
      <figure className="campaign-arena__photo"><OptimizedImage src="/facilities/responsive/court-1920.webp" srcSet="/facilities/responsive/court-640.webp 640w, /facilities/responsive/court-1280.webp 1280w, /facilities/responsive/court-1920.webp 1920w" alt="The real ZAWANA badminton arena with its green court surfaces, nets, and original crowned-lion signage" width={1920} height={1440} sizes="100vw" /><figcaption><span>THE ZAWANA / YANGON, MYANMAR</span><span>PLAY WITH PURPOSE.</span></figcaption></figure>
      <div className="campaign-arena__footer"><span>THE COURT IS ONLY THE BEGINNING.</span><Link to="/book/court" className="campaign-inline-link">Make your next move <ArrowUpRight size={17} /></Link></div>
    </div>
  </section>;
}
