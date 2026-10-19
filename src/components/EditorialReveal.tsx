import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/** Short, one-time editorial reveals; content stays still for reduced-motion users. */
export function EditorialReveal({ children, className, as = 'div', delay = 0 }: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'article' | 'header' | 'figure' | 'aside';
  delay?: number;
}) {
  const reducedMotion = useReducedMotion();
  const Element = motion[as];
  return <Element className={className}
    initial={reducedMotion ? false : { opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 'some', margin: '0px 0px -24px 0px' }}
    transition={{ duration: reducedMotion ? 0 : .55, delay: reducedMotion ? 0 : delay, ease: [.22, 1, .36, 1] }}>
    {children}
  </Element>;
}
