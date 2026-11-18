import type { ReactNode } from 'react';
import './member-booking.css';

/** One summary/action area, sticky on small screens and in flow on desktop. */
export function BookingActionBar({ children, action, hidden = false }: { children: ReactNode; action: ReactNode; hidden?: boolean }) {
  return <section style={hidden ? { opacity: 0, pointerEvents: 'none' } : undefined} aria-label="Booking summary" className="member-booking-action"><div className="member-booking-action__summary">{children}</div><div>{action}</div></section>;
}
