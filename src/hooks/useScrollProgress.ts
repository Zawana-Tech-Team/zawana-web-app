import { useEffect, type RefObject } from 'react';
import { useMotionValue } from 'framer-motion';

/** One passive scroll subscription, coalesced into one paint. No scroll interception. */
export function useScrollProgress(target: RefObject<HTMLElement | null>, enabled: boolean) {
  const progress = useMotionValue(0);
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const node = target.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const distance = Math.max(1, rect.height - window.innerHeight);
      progress.set(Math.max(0, Math.min(1, -rect.top / distance)));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    if (target.current) observer.observe(target.current);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [target, enabled, progress]);
  return progress;
}
