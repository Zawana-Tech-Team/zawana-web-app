import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { useLocation } from 'react-router-dom';

/** Shared mobile drawer behavior; keeps business navigation and route destinations intact. */
export function useWorkspaceNavigation(open: boolean, setOpen: Dispatch<SetStateAction<boolean>>) {
  const drawerRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { pathname, search } = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [pathname, search, setOpen]);
  useEffect(() => {
    if (!open || !drawerRef.current) return;
    const drawer = drawerRef.current;
    const main = drawer.closest('.zawana-workspace')?.querySelector<HTMLElement>('.workspace-main');
    const previousInert = main?.inert;
    if (main) main.inert = true;
    const scrollY = window.scrollY;
    const previous = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow
    };
    Object.assign(document.body.style, {
      position: 'fixed',
      top: `-${scrollY}px`,
      width: '100%',
      overflow: 'hidden'
    });
    drawer.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key !== 'Tab') return;
      const controls = [
        ...drawer.querySelectorAll<HTMLElement>(
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
    const desktop = window.matchMedia('(min-width: 1024px)');
    const resize = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener('change', resize);
    document.addEventListener('keydown', onKey);
    return () => {
      desktop.removeEventListener('change', resize);
      document.removeEventListener('keydown', onKey);
      if (main) main.inert = previousInert ?? false;
      Object.assign(document.body.style, previous);
      window.scrollTo({ top: scrollY, behavior: 'instant' });
      triggerRef.current?.focus({ preventScroll: true });
    };
  }, [open, setOpen]);
  return { drawerRef, triggerRef };
}
