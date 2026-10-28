import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import './staff-dialog.css';

type StaffDialogProps = {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  feedback?: ReactNode;
  onClose: () => void;
  busy?: boolean;
};

export function StaffDialog({ title, eyebrow = 'THE ZAWANA · RESERVATIONS', children, footer, feedback, onClose, busy = false }: StaffDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => { dialog.close(); document.body.style.overflow = previousOverflow; };
  }, []);

  return <dialog
    ref={ref}
    aria-labelledby={titleId}
    onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}
    className="z-dialog"
  >
    <header className="z-dialog__header">
      <div><p className="z-dialog__eyebrow">{eyebrow}</p><h2 id={titleId}>{title}</h2></div>
      <button type="button" aria-label="Close dialog" disabled={busy} onClick={onClose} className="z-dialog__close"><X size={19} strokeWidth={1.5} /></button>
    </header>
    <div className="z-dialog__body">{children}</div>
    {feedback && <div className="z-dialog__feedback">{feedback}</div>}
    {footer && <footer className="z-dialog__footer">{footer}</footer>}
  </dialog>;
}
