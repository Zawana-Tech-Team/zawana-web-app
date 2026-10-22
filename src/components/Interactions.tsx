import { useEffect, useId, useRef, type ReactNode } from 'react';
import { LayoutGroup, motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { NavLink, type NavLinkProps } from 'react-router-dom';
import { motionTokens } from '../design/motion';
import { LocalizedTree, useLanguage } from '../context/LanguageContext';

/** A single-selection button group; arrow keys move and select without remounting its content. */
export function SegmentedControl<T extends string>({ value, onChange, options, label, className = '' }: {
  value: T; onChange: (value: T) => void;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  label: string; className?: string;
}) {
  const id = useId();
  const reduced = useReducedMotion();
  const { t } = useLanguage();
  return <LayoutGroup id={id}>
    <div className={`premium-segments ${className}`} role="group" aria-label={t(label)}>
      {options.map(option => <button
        key={option.value} type="button" disabled={option.disabled}
        aria-pressed={value === option.value}
        tabIndex={value === option.value || (!options.some(item => item.value === value) && option === options[0]) ? 0 : -1}
        onClick={() => onChange(option.value)}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const enabled = options.filter(item => !item.disabled);
          const index = enabled.findIndex(item => item.value === option.value);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 :
            (index + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length;
          onChange(enabled[next].value);
          const buttons = [...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
          buttons[next]?.focus();
        }}
      >
        {value === option.value && <motion.span className="premium-segments__active" aria-hidden="true"
          layoutId="selection" transition={reduced ? { duration: 0 } : motionTokens.spring} />}
        <span className="premium-segments__label">{typeof option.label === 'string' ? t(option.label) : <LocalizedTree>{option.label}</LocalizedTree>}</span>
      </button>)}
    </div>
  </LayoutGroup>;
}

/** Preserve router semantics; namespace each navigation so desktop and drawer indicators don't collide. */
export function WorkspaceNavLink({ children, ...props }: Omit<NavLinkProps, 'children'> & { children: ReactNode }) {
  const reduced = useReducedMotion();
  return <NavLink {...props}>{({ isActive }) => <>
    {isActive && <motion.span aria-hidden="true" className="workspace-nav-indicator"
      layoutId="workspace-active" transition={reduced ? { duration: 0 } : motionTokens.spring} />}
    <span className="workspace-nav-content">{children}</span>
  </>}</NavLink>;
}

// Dialogs can overlap briefly while one exits and the next opens. Retain each
// element's original state until every dialog that locked it has been removed.
const inertLocks = new WeakMap<HTMLElement, { count: number; original: boolean }>();
let openDialogCount = 0;
let originalBodyOverflow = '';

/** Dialog behavior reused by operational modals; restores focus and contains keyboard navigation. */
export function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const background = document.getElementById('root');
    const siblings: HTMLElement[] = [];
    let branch: HTMLElement | null = dialog;
    while (branch && branch !== background && branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          const lock = inertLocks.get(sibling) || { count: 0, original: sibling.inert };
          lock.count += 1;
          inertLocks.set(sibling, lock);
          siblings.push(sibling);
          sibling.inert = true;
        }
      }
      branch = branch.parentElement;
    }
    if (openDialogCount === 0) originalBodyOverflow = document.body.style.overflow;
    openDialogCount += 1;
    document.body.style.overflow = 'hidden';
    const controls = () => [...dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
    )].filter(element => element.getClientRects().length && element.tabIndex >= 0 && !element.closest('[inert], [aria-hidden="true"]'));
    dialog.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const items = controls(), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    background?.addEventListener('keydown', keydown);
    return () => {
      background?.removeEventListener('keydown', keydown);
      openDialogCount -= 1;
      if (openDialogCount === 0) document.body.style.overflow = originalBodyOverflow;
      siblings.forEach(element => {
        const lock = inertLocks.get(element);
        if (!lock) return;
        lock.count -= 1;
        if (lock.count === 0) {
          element.inert = lock.original;
          inertLocks.delete(element);
        }
      });
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return ref;
}

export function DialogSurface({ title, children, onClose, drawer = false, className = '', labelledBy }: {
  title: string; children: ReactNode; onClose: () => void; drawer?: boolean; className?: string; labelledBy?: string;
}) {
  const ref = useDialog(onClose);
  const reduced = useReducedMotion();
  return <motion.div className={`premium-dialog-backdrop fixed inset-0 z-[120] flex ${drawer ? 'justify-end' : 'items-center justify-center p-3 sm:p-4'}`}
    initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    transition={{ duration: reduced ? 0 : motionTokens.dialog }}
    onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.div ref={ref} role="dialog" aria-modal="true" aria-label={labelledBy ? undefined : title}
      aria-labelledby={labelledBy} tabIndex={-1} className={`${drawer ? 'premium-drawer-panel' : 'premium-dialog-panel'} ${className}`}
      initial={reduced ? false : drawer ? { x: '100%' } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={drawer ? { x: '100%' } : { opacity: 0, y: 4 }}
      transition={{ duration: reduced ? 0 : motionTokens.dialog, ease: motionTokens.ease }}>
      {children}
    </motion.div>
  </motion.div>;
}


/** Animate a view update in place; the wrapper has no key and never replaces page state. */
export function SelectionContent({ value, children }: { value: string; children: ReactNode }) {
  const controls = useAnimationControls();
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) controls.set({ opacity: 1, y: 0 });
    else void controls.start({ opacity: [.8, 1], y: [3, 0], transition: { duration: .18, ease: motionTokens.ease } });
    return () => controls.stop();
  }, [value, reduced, controls]);
  return <motion.div animate={controls}>{children}</motion.div>;
}
