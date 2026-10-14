import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform
} from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import OptimizedImage from '../OptimizedImage';
import { useLanguage } from '../../context/LanguageContext';

const ease = [0.22, 1, 0.36, 1] as const;
export const entrance = { duration: 0.55, ease };

export function FadeUp({
  children,
  className = '',
  delay = 0
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ ...entrance, delay }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerContainer({
  children,
  className = ''
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.12 }}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: reduced ? 0 : 0.1 } } }}
    >
      {children}
    </motion.div>
  );
}

export function RevealText({
  text,
  delay = 0,
  className = '',
  onScroll = false
}: {
  text: string;
  delay?: number;
  className?: string;
  onScroll?: boolean;
}) {
  const reduced = useReducedMotion();
  const { t } = useLanguage();
  const translated = t(text);
  return (
    <motion.span
      className={`reveal-text ${className}`}
      initial={reduced ? false : 'hidden'}
      animate={onScroll ? undefined : 'visible'}
      whileInView={onScroll ? 'visible' : undefined}
      viewport={{ once: true, amount: 0.3 }}
      variants={{
        hidden: {},
        visible: { transition: { delayChildren: delay, staggerChildren: reduced ? 0 : 0.09 } }
      }}
    >
      <span className="sr-only">{translated}</span>
      {translated.split(' ').map((word, i) => (
        <span className="reveal-mask" key={`${word}-${i}`} aria-hidden="true">
          <motion.span
            variants={{
              hidden: { y: '110%', opacity: 0 },
              visible: { y: 0, opacity: 1, transition: entrance }
            }}
          >
            {word}
          </motion.span>{' '}
        </span>
      ))}
    </motion.span>
  );
}

export function RevealLines({ lines, className = '' }: { lines: string[]; className?: string }) {
  return (
    <span className={className}>
      {lines.map((line, i) => (
        <RevealText key={line} text={line} delay={i * 0.12} onScroll />
      ))}
    </span>
  );
}

export function facilitySources(name: string) {
  return `/facilities/responsive/${name}-640.webp 640w, /facilities/responsive/${name}-1280.webp 1280w, ${name === 'gym' ? '/facilities/gym.webp 1478w' : `/facilities/responsive/${name}-1920.webp 1920w`}`;
}

export function ParallaxImage({
  name,
  alt,
  className = '',
  priority = false
}: {
  name: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['-3%', '3%']);
  return (
    <div ref={ref} className={`parallax-image ${className}`}>
      <motion.div className="parallax-image__inner" style={{ y: reduced ? 0 : y }}>
        <OptimizedImage
          src={`/facilities/${name}.webp`}
          srcSet={facilitySources(name)}
          alt={alt}
          sizes={priority ? '(max-width: 767px) 1280px, 100vw' : '(min-width: 1024px) 60vw, 100vw'}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'low'}
          width={name === 'gym' ? 1478 : 1920}
          height={name === 'gym' ? 1056 : 1440}
        />
      </motion.div>
    </div>
  );
}

export function HoverImage({
  name,
  alt,
  sizes = '(min-width: 768px) 50vw, 100vw'
}: {
  name: string;
  alt: string;
  sizes?: string;
}) {
  return (
    <OptimizedImage
      className="hover-image"
      src={`/facilities/${name}.webp`}
      srcSet={facilitySources(name)}
      sizes={sizes}
      alt={alt}
      width={1280}
      height={960}
    />
  );
}

export function MagneticButton({
  to,
  children,
  variant = 'gold',
  className = ''
}: {
  to: string;
  children: ReactNode;
  variant?: 'gold' | 'outline' | 'ink';
  className?: string;
}) {
  const reduced = useReducedMotion();
  const x = useSpring(0, { stiffness: 240, damping: 28 });
  const y = useSpring(0, { stiffness: 240, damping: 28 });
  return (
    <motion.span
      className={`magnetic-wrap ${className}`}
      style={{ x, y }}
      onPointerMove={(event) => {
        if (reduced || event.pointerType !== 'mouse') return;
        const rect = event.currentTarget.getBoundingClientRect();
        x.set((event.clientX - rect.left - rect.width / 2) * 0.08);
        y.set((event.clientY - rect.top - rect.height / 2) * 0.12);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {to.startsWith('#') ? (
        <a className={`public-button public-button--${variant}`} href={to}>
          {children}
          <ArrowUpRight size={18} aria-hidden="true" />
        </a>
      ) : (
        <Link className={`public-button public-button--${variant}`} to={to}>
          {children}
          <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      )}
    </motion.span>
  );
}

export function SectionTransition({
  children,
  className = ''
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={`section-transition ${className}`}
      initial={reduced ? false : { clipPath: 'inset(8% 0 8% 0)' }}
      whileInView={{ clipPath: 'inset(0% 0 0% 0)' }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 1.1, ease }}
    >
      {children}
    </motion.div>
  );
}

export function PageLoader() {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(() => {
    try {
      return !sessionStorage.getItem('zawana-intro-seen');
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (reduced) {
      setVisible(false);
      return;
    }
    if (!visible) return;
    const timer = window.setTimeout(() => {
      setVisible(false);
      try {
        sessionStorage.setItem('zawana-intro-seen', '1');
      } catch {
        /* Private browsing still gets a deterministic intro. */
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [reduced, visible]);
  return (
    <AnimatePresence>
      {visible && !reduced && (
        <motion.div
          className="public-loader"
          aria-hidden="true"
          initial={{ y: 0 }}
          exit={{ y: '-100%' }}
          transition={{ duration: 0.35, ease }}
        >
          <motion.img
            src="/brand/zawana-logo-transparent.png"
            width={108}
            height={108}
            alt=""
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          />
          <span className="public-loader__track">
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.8, ease }}
            />
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
