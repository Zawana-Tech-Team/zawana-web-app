import { useEffect, useId, useRef, useState, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import { popoverMotion } from '../design/motion';

type Choice = { value: string; label: string; disabled: boolean; index: number };
/** Keep the native select as the form/event source and the touch-device control. */
export function Select({ children, className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const native = useRef<HTMLSelectElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const [desktop, setDesktop] = useState(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  useEffect(() => {
    const media = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => { setDesktop(media.matches); setOpen(false); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [active, setActive] = useState(0);
  const [label, setLabel] = useState('');
  const [fieldLabel, setFieldLabel] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 280 });
  const typeahead = useRef({ text: '', time: 0 });
  const useNative = props.multiple || (props.size ?? 0) > 1;
  useEffect(() => {
    const select = native.current;
    if (!select) return;
    setLabel(select.selectedOptions[0]?.textContent || 'Choose an option');
    const parentLabel = select.closest('label');
    const externalLabel = select.labels?.[0];
    const sourceLabel = parentLabel || externalLabel;
    setFieldLabel(sourceLabel ? [...sourceLabel.childNodes].filter(node => node !== select && !(node instanceof HTMLElement && node.contains(select)))
      .map(node => node.textContent).join(' ').trim() : '');
  }, [props.value, props.defaultValue, children]);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const availableBelow = window.innerHeight - rect.bottom - 12;
      const above = availableBelow < 180 && rect.top > availableBelow;
      const maxHeight = Math.min(280, Math.max(80, above ? rect.top - 12 : availableBelow));
      setPosition({ top: above ? rect.top - Math.min(maxHeight, choices.length * 38 + 10) - 6 : rect.bottom + 6,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)), width: rect.width, maxHeight });
    };
    place();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popup.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    const scroll = (event: Event) => { if (!popup.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [open, choices.length]);
  useEffect(() => {
    if (open) popup.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);
  useEffect(() => { if (props.disabled) setOpen(false); }, [props.disabled]);
  const show = () => {
    const select = native.current;
    if (!select || props.disabled) return;
    const items = [...select.options].map((option, index) => ({ value: option.value,
      label: option.textContent || '', disabled: option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled), index }));
    setChoices(items);
    setActive(Math.max(0, items.findIndex(option => option.value === select.value && !option.disabled)));
    setOpen(true);
  };
  const choose = (choice: Choice) => {
    if (choice.disabled || !native.current) return;
    native.current.selectedIndex = choice.index;
    // React's native select change listener preserves each caller's existing validation and payload.
    native.current.dispatchEvent(new Event('change', { bubbles: true }));
    setLabel(choice.label);
    setOpen(false);
    trigger.current?.focus();
  };
  return <span className={`premium-select ${className}`}>
    <select {...props} ref={native} tabIndex={desktop && !useNative ? -1 : props.tabIndex} aria-hidden={desktop && !useNative ? true : undefined} className={useNative ? '' : 'premium-select__native'}
      onChange={event => { setLabel(event.currentTarget.selectedOptions[0]?.textContent || ''); props.onChange?.(event); }}
      onFocus={event => { props.onFocus?.(event); if (desktop && !useNative) trigger.current?.focus(); }}
      onInvalid={event => { props.onInvalid?.(event); trigger.current?.focus(); }}
    >{children}</select>
    {!useNative && <button ref={trigger} type="button" className="premium-select__trigger"
      disabled={props.disabled} role="combobox" aria-haspopup="listbox" aria-expanded={open}
      aria-controls={open ? `${id}-options` : undefined}
      aria-activedescendant={open ? `${id}-option-${active}` : undefined}
      aria-label={props['aria-label'] || fieldLabel || props.title || label}
      aria-labelledby={props['aria-labelledby']} aria-required={props.required}
      onClick={() => open ? setOpen(false) : show()}
      onKeyDown={event => {
        if (event.key === 'Tab') { setOpen(false); return; }
        if (event.key === 'Escape') { if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false); } return; }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
          event.preventDefault();
          if (!open) { show(); return; }
          if (event.key === 'Enter' || event.key === ' ') { if (choices[active]) choose(choices[active]); return; }
          const enabled = choices.filter(option => !option.disabled);
          if (!enabled.length) return;
          const current = enabled.findIndex(option => option.index === active);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 :
            (current + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
          setActive(enabled[next].index);
        } else if (open && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
          const now = Date.now();
          typeahead.current.text = (now - typeahead.current.time > 600 ? '' : typeahead.current.text) + event.key.toLowerCase();
          typeahead.current.time = now;
          const match = choices.find(option => !option.disabled && option.label.toLowerCase().startsWith(typeahead.current.text));
          if (match) setActive(match.index);
        }
      }}
    ><span>{label}</span><ChevronDown size={15} aria-hidden="true" className={open ? 'is-open' : ''} /></button>}
    {createPortal(<AnimatePresence>{open && <motion.div ref={popup} id={`${id}-options`}
      role="listbox" aria-label={props['aria-label'] || fieldLabel || 'Options'}
      className="premium-select__popup" style={position}
      {...popoverMotion} initial={reduced ? false : popoverMotion.initial}
      transition={reduced ? { duration: 0 } : popoverMotion.transition}
    >{choices.map(choice => <div key={choice.index} id={`${id}-option-${choice.index}`} role="option"
      data-index={choice.index} aria-selected={String(props.value ?? native.current?.value) === choice.value}
      aria-disabled={choice.disabled || undefined} data-active={active === choice.index}
      onPointerMove={() => { if (!choice.disabled) setActive(choice.index); }}
      onMouseDown={event => event.preventDefault()} onClick={() => choose(choice)}
    ><span>{choice.label}</span>{String(props.value ?? native.current?.value) === choice.value &&
      <motion.span initial={reduced ? false : { opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}><Check size={15} aria-hidden="true" /></motion.span>}
    </div>)}</motion.div>}</AnimatePresence>, document.body)}
  </span>;
}
