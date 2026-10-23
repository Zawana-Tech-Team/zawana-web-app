import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import OptimizedImage from '../OptimizedImage';

/** A lightweight editorial hero, shown only when the renderer cannot serve the scene. */
export function PremiumFallback({ onRetry }: { onRetry: () => void }) {
  return <section className="arena-editorial" data-experience="fallback" aria-labelledby="arena-editorial-title">
    <OptimizedImage className="arena-editorial__photo" src="/facilities/responsive/court-1280.webp" srcSet="/facilities/responsive/court-640.webp 640w, /facilities/responsive/court-1280.webp 1280w, /facilities/responsive/court-1920.webp 1920w" sizes="100vw" width={1920} height={1440} loading="eager" fetchPriority="high" alt="Indoor badminton courts at Zawana" />
    <div className="arena-editorial__shade" aria-hidden="true" />
    <div className="arena-editorial__top"><span>YANGON, MYANMAR</span><span>THE ART OF PERFORMANCE</span></div>
    <div className="arena-editorial__content">
      <p className="arena-editorial__eyebrow"><span /> YOUR SPACE TO PLAY</p>
      <h1 id="arena-editorial-title">BEYOND<br /><span>THE GAME.</span></h1>
      <p className="arena-editorial__copy">Find your rhythm. Own your next rally.<br />Make room for a little more possibility.</p>
      <div className="arena-editorial__actions"><Link className="campaign-button campaign-button--gold" to="/book/court">Book a Court <ArrowUpRight size={17} /></Link><a className="arena-editorial__explore" href="#ecosystem">Discover Zawana <ArrowDown size={15} /></a></div>
    </div>
    <div className="arena-editorial__caption"><span>01 / THE ARENA</span><p>Real courts.<br /> <em>Extraordinary moments.</em></p></div>
    <footer className="arena-editorial__footer"><div><span>PLAY</span><span>PERFORM</span><span>RECOVER</span><span>CONNECT</span></div><button type="button" onClick={onRetry}>Explore in 3D <ArrowUpRight size={14} /></button></footer>
  </section>;
}
