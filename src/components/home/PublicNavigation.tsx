import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { LanguageSwitcher, LocalizedTree } from '../../context/LanguageContext';

const links = [
  ['#arena', 'The Arena'],
  ['#ecosystem', 'Experiences'],
  ['#membership', 'Membership'],
  ['#community', 'Community'],
  ['/achievements', 'Achievements'],
  ['/coaches', 'Coaches']
];

const MotionLink = motion.create(Link);

export function PublicBrand({ onClick }: { onClick?: () => void }) {
  return (
    <Link to="/" className="public-brand" aria-label="ZAWANA home" onClick={onClick}>
      <div className="public-brand__logo">
      <img
        src="/logo.png"
        alt="The Zawana crowned-lion logo and official wordmark"
        width={2000}
        height={2000}
      />
      </div>
      <span>
        THE ART OF
        <br />
        PERFORMANCE
      </span>
    </Link>
  );
}

export function PublicNavigation() {
  const [open, setOpen] = useState(false);
  const [menuPresent, setMenuPresent] = useState(false);
  const pendingAnchor = useRef<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const location = useLocation();
  const currentPath = useRef(location.pathname);
  currentPath.current = location.pathname;
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!menuPresent || !dialog.current) return;
    const element = dialog.current;
    const scrollY = window.scrollY;
    const openedOnPath = currentPath.current;
    const bodyStyle = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow
    };
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    element.showModal();
    element.querySelector<HTMLButtonElement>('button')?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const controls = [
        ...element.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]'
        )
      ];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    element.addEventListener('keydown', trapFocus);
    const breakpoint = window.matchMedia('(min-width: 1100px)');
    const closeOnDesktop = () => {
      if (breakpoint.matches) setOpen(false);
    };
    breakpoint.addEventListener('change', closeOnDesktop);
    return () => {
      breakpoint.removeEventListener('change', closeOnDesktop);
      element.removeEventListener('keydown', trapFocus);
      element.close();
      Object.assign(document.body.style, bodyStyle);
      window.scrollTo({ top: openedOnPath === currentPath.current ? scrollY : 0, behavior: 'instant' });
      trigger.current?.focus({ preventScroll: true });
    };
  }, [menuPresent]);
  const followAnchor = (event: MouseEvent<HTMLAnchorElement>, hash: string) => {
    event.preventDefault();
    pendingAnchor.current = hash;
    setOpen(false);
  };
  const finishClosing = () => {
    setMenuPresent(false);
    const hash = pendingAnchor.current;
    pendingAnchor.current = null;
    if (!hash) return;
    window.requestAnimationFrame(() => {
      window.history.replaceState(window.history.state, '', hash);
      const target = document.querySelector<HTMLElement>(hash);
      target?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth' });
      target?.focus({ preventScroll: true });
    });
  };
  return (
    <LocalizedTree>
      <header className="public-header">
        <PublicBrand />
        <nav className="public-desktop-nav" aria-label="Main navigation">
          {links.map(([href, label]) => (
            href.startsWith('#') ? (
              <a href={location.pathname === '/' ? href : `/${href}`} key={href}>{label}</a>
            ) : (
              <NavLink to={href} key={href}>{label}</NavLink>
            )
          ))}
        </nav>
        <div className="public-header__actions">
          <Link to="/login" className="public-login">
            Log in
          </Link>
          <Link to="/signup" className="public-join">
            Join ZAWANA <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
          <Link to="/book/court" className="public-header__book">
            Book a court <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
          <button
            ref={trigger}
            type="button"
            className="public-menu-toggle"
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="public-mobile-menu"
            onClick={() => {
              setMenuPresent(true);
              setOpen(true);
            }}
          >
            <Menu size={23} />
          </button>
        </div>
      </header>
      <AnimatePresence onExitComplete={finishClosing}>
        {open && (
          <motion.dialog
            ref={dialog}
            id="public-mobile-menu"
            className="public-mobile-menu"
            aria-labelledby="public-menu-title"
            onCancel={(event) => {
              event.preventDefault();
              setOpen(false);
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.25 }}
          >
            <div className="public-mobile-menu__top">
              <PublicBrand onClick={() => setOpen(false)} />
              <button
                type="button"
                className="public-menu-close"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                <X size={26} />
              </button>
            </div>
            <p id="public-menu-title" className="public-eyebrow">
              Discover ZAWANA
            </p>
            <nav aria-label="Mobile navigation">
              {links.map(([href, label], i) => (
                href.startsWith('#') ? <motion.a
                  href={location.pathname === '/' ? href : `/${href}`}
                  key={href}
                  onClick={(event) => location.pathname === '/' ? followAnchor(event, href) : setOpen(false)}
                  initial={reduced ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                >
                  <span>0{i + 1}</span>
                  {label}
                  <ArrowUpRight aria-hidden="true" />
                </motion.a> : <MotionLink
                  to={href}
                  key={href}
                  aria-current={location.pathname.startsWith(href) ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  initial={reduced ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                >
                  <span>0{i + 1}</span>{label}<ArrowUpRight aria-hidden="true" />
                </MotionLink>
              ))}
            </nav>
            <div className="public-mobile-menu__bottom">
              <Link to="/login" onClick={() => setOpen(false)}>
                Log in
              </Link>
              <Link to="/signup" onClick={() => setOpen(false)}>
                Join ZAWANA
              </Link>
              <Link to="/book/court" onClick={() => setOpen(false)}>
                Book a court
              </Link>
              <LanguageSwitcher />
            </div>
          </motion.dialog>
        )}
      </AnimatePresence>
    </LocalizedTree>
  );
}
