import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../UI';

/** A body portal keeps the menu out of the timetable's scrolling/transform contexts. */
export function CourtActionMenu({ open, onOpenChange, disabled, label, children,menuLabel='Court actions',triggerAriaLabel,variant='primary' }: {
  open: boolean; onOpenChange: (open: boolean) => void; disabled: boolean;
  label: string; children: ReactNode;
  menuLabel?:string;triggerAriaLabel?:string;variant?:'primary'|'secondary'|'ghost';
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const change = useRef(onOpenChange);
  change.current = onOpenChange;
  useLayoutEffect(() => {
    if (!open || disabled) return;
    const trigger = anchor.current!.querySelector('button')!;
    const menu = popup.current!;
    const place = () => {
      const rect = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0, left = viewport?.offsetLeft ?? 0;
      const height = viewport?.height ?? window.innerHeight, width = viewport?.width ?? window.innerWidth;
      const gap = 6, edge = 8;
      const below = Math.max(0, top + height - rect.bottom - gap - edge);
      const above = Math.max(0, rect.top - top - gap - edge);
      const naturalHeight = menu.scrollHeight + 2;
      const flip = below < naturalHeight && above > below;
      const maxHeight = flip ? above : below;
      const next = {
        top: flip ? rect.top - gap - Math.min(naturalHeight, maxHeight) : rect.bottom + gap,
        left: Math.max(left + edge, Math.min(rect.left, left + width - menu.getBoundingClientRect().width - edge)),
        maxHeight,
      };
      setPosition(previous => previous && previous.top === next.top && previous.left === next.left && previous.maxHeight === next.maxHeight ? previous : next);
    };
    place();
    // Contact/status loading can move the trigger without resizing it or scrolling.
    // Observe its position while open, reusing the same placement calculation.
    let frame = 0, geometry = '';
    const followAnchor = () => {
      const rect = trigger.getBoundingClientRect();
      const next = `${rect.x}:${rect.y}:${rect.width}:${rect.height}`;
      if (next !== geometry) { geometry = next; place(); }
      frame = requestAnimationFrame(followAnchor);
    };
    frame = requestAnimationFrame(followAnchor);
    const outside = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node) && !menu.contains(event.target as Node)) change.current(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); change.current(false); trigger.focus(); }
    };
    const focus = (event: FocusEvent) => {
      if (!anchor.current?.contains(event.target as Node) && !menu.contains(event.target as Node)) change.current(false);
    };
    const observer = new ResizeObserver(place);
    observer.observe(trigger); observer.observe(menu);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard);
    document.addEventListener('focusin', focus);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place); window.visualViewport?.removeEventListener('scroll', place);
      document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keyboard); document.removeEventListener('focusin', focus);
    };
  }, [open, disabled]);
  const positioned = position !== null;
  useLayoutEffect(() => {
    if (open && positioned) popup.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [open, positioned]);
  return <>
    <span ref={anchor} className="inline-flex"><Button variant={variant} disabled={disabled} aria-label={triggerAriaLabel} aria-expanded={open} aria-haspopup="menu" aria-controls={open ? id : undefined}
      onClick={() => { setPosition(null); onOpenChange(!open); }}
      onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setPosition(null); onOpenChange(true); } }}>{label}</Button></span>
    {open && !disabled && createPortal(<div ref={popup} id={id} role="menu" aria-label={menuLabel} className="desk-context-menu"
      style={{ ...position, visibility: position ? 'visible' : 'hidden' }}
      onClick={event => { if ((event.target as Element).closest('button:not(:disabled)')) { onOpenChange(false); } }}
      onKeyDown={event => {
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        }
      }}>{children}</div>, document.body)}
  </>;
}
