import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUpRight, Image } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMotionValueEvent } from 'framer-motion';
import { useScrollProgress } from '../../hooks/useScrollProgress';
import { useDevicePerformance } from '../../hooks/useDevicePerformance';
import { chapters, chapterAt } from './choreography';
import { SceneTypography } from './SceneTypography';
import { PerformanceBackdrop, PerformanceFallback } from './PerformanceFallback';

const SceneCanvas = lazy(() => import('./SceneCanvas'));
class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function CinematicHero() {
  const track = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const meter = useRef<HTMLDivElement>(null);
  const device = useDevicePerformance();
  const [still, setStill] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [activeChapter, setActiveChapter] = useState(0);
  const chapterRef = useRef(0);
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(true);
  const cinematic = device.assessed && device.webgl && !still && !failed;
  const progress = useScrollProgress(track, cinematic);
  const onReady = useCallback(() => setReady(true), []);
  const onFailure = useCallback(() => { setFailed(true); setReady(false); }, []);
  useMotionValueEvent(progress, 'change', value => {
    const next = chapterAt(value);
    if (chapterRef.current !== next) { chapterRef.current = next; setActiveChapter(next); }
    if (readout.current) readout.current.textContent = String(Math.round(value * 100)).padStart(3, '0');
    if (meter.current) meter.current.style.transform = `scaleX(${value})`;
    if (stage.current) stage.current.dataset.progress = value.toFixed(4);
  });
  useEffect(() => {
    if (!cinematic || !stage.current) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: .01 });
    observer.observe(stage.current);
    const visibility = () => setVisible(document.visibilityState === 'visible');
    visibility(); document.addEventListener('visibilitychange', visibility);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', visibility); };
  }, [cinematic]);
  const jumpTo = (index: number) => {
    const element = track.current;
    if (!element) return;
    const start = element.getBoundingClientRect().top + window.scrollY;
    const amount = chapters[index].at + (index === 0 ? 0 : .012);
    window.scrollTo({ top: start + (element.offsetHeight - window.innerHeight) * amount, behavior: device.reducedMotion ? 'instant' : 'smooth' });
  };
  const switchMode = (value: boolean) => {
    setStill(value); setReady(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  if (!cinematic) {
    const reason = failed ? 'renderer-unavailable' : device.reducedMotion ? 'reduced-motion' : device.shortViewport ? 'compact-viewport' : device.lowPower ? 'data-or-power-saving' : still ? 'user-preference' : 'webgl-unavailable';
    return <PerformanceFallback reason={reason} onEnable={still && device.webgl && !failed ? () => switchMode(false) : undefined} />;
  }
  return <section ref={track} className="cinematic-journey" aria-label="ZAWANA — Beyond the game, a five chapter experience" data-experience="cinematic">
    <div ref={stage} className="journey-pin" data-renderer={ready ? 'webgl' : 'loading'} data-chapter={chapters[activeChapter].id} data-active={visible && inView}>
      <PerformanceBackdrop />
      <div className={`journey-world ${ready ? 'journey-world--ready' : ''}`} aria-hidden="true">
        <SceneBoundary onFailure={onFailure}><Suspense fallback={null}><SceneCanvas progress={progress} compact={device.compact} active={visible && inView} stage={stage} onReady={onReady} onFailure={onFailure} /></Suspense></SceneBoundary>
      </div>
      <div className={`journey-atmosphere journey-atmosphere--${chapters[activeChapter].id}`} aria-hidden="true" />
      <div className="journey-scene-meta" aria-hidden="true"><span>EST. 2022 / YANGON</span><span>{activeChapter === 0 ? 'A NEW PERSPECTIVE ON PLAY' : `CHAPTER 0${activeChapter + 1} / ${chapters[activeChapter].label.toUpperCase()}`}</span></div>
      <SceneTypography active={activeChapter} jumpTo={jumpTo} />
      <div className="journey-side-label" aria-hidden="true">THE ART OF PERFORMANCE — THE ZAWANA</div>
      <div className="journey-controls">
        <button type="button" className="journey-scroll-cue" onClick={() => {
          if (activeChapter === 4) document.getElementById('arena')?.scrollIntoView({ behavior: 'smooth' });
          else jumpTo(activeChapter + 1);
        }} aria-label={activeChapter === 4 ? 'Continue to the real arena' : 'Scroll to explore the next chapter'}>
          <span>{activeChapter === 4 ? 'DISCOVER THE REAL ZAWANA' : 'SCROLL TO EXPLORE'}</span><ArrowDown size={15} />
        </button>
        <nav aria-label="Cinematic chapters" className="journey-chapters-nav">
          {chapters.map((chapter, index) => <button type="button" key={chapter.id} aria-current={activeChapter === index ? 'step' : undefined} aria-label={`Chapter ${index + 1}: ${chapter.label}`} onClick={() => jumpTo(index)}><span>0{index + 1}</span><span>{chapter.label}</span></button>)}
        </nav>
        <div className="journey-progress" aria-hidden="true"><span ref={readout}>000</span><span>/ 100</span></div>
      </div>
      <div className="journey-concept-note"><span>ARENA VISUAL CONCEPT</span><button type="button" onClick={() => switchMode(true)}><Image size={12} /> Use still experience</button><Link to="/book/court">Book a court <ArrowUpRight size={13} /></Link></div>
      <div className="journey-meter" aria-hidden="true"><div ref={meter} /></div>
    </div>
  </section>;
}
