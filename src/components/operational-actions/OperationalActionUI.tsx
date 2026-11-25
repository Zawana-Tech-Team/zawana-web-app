import { CircleAlert, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOperationalActions, type OperationalAction } from '../../context/OperationalActionsContext';
import './operational-actions.css';

export function PendingActionCounter({ count, label }: { count: number; label: string }) {
  return count > 0 ? <span className="pending-action-counter" aria-label={`${count} pending actions in ${label}`}>{count > 99 ? '99+' : `+${count}`}</span> : null;
}
function actionLink(item: OperationalAction, role?: string) {
  const root = role === 'admin' ? '/admin/court-rentals' : '/badminton-fo/courts';
  if (item.action === 'coach-proposal') return `/coach/bookings?proposal=${encodeURIComponent(item.proposalId || '')}`;
  if (item.action === 'coach-booking') return `/coach/bookings?status=PENDING_COACH_CONFIRMATION&booking=${encodeURIComponent(item.bookingId)}`;
  if (item.action === 'refund') return `${root}?activity=refunds&refundBooking=${encodeURIComponent(item.bookingId)}`;
  if (item.action === 'reschedule' && item.kind === 'court') return `${role === 'admin' ? '/admin/court-rentals' : '/badminton-fo/bookings'}/${encodeURIComponent(item.bookingId)}/reschedule`;
  return item.requestId ? `${root}?activity=requests&request=${encodeURIComponent(item.requestId)}` : null;
}
export function ActionRequiredIndicator({ bookingId, requestId, compact = false }: { bookingId: string; requestId?: string; compact?: boolean }) {
  const { user } = useAuth(), { items, error } = useOperationalActions();
  const item = items.find(value => value.bookingId === bookingId && (!requestId || value.requestId === requestId));
  if (!item) return null;
  const href = actionLink(item, user?.role);
  const content = <><span className="operational-action-dot" aria-hidden="true"/><span className={compact ? 'sr-only' : undefined}>{item.label}</span>{error && <span className="sr-only">Last known status; refresh unavailable.</span>}</>;
  const props = { className: `operational-action-indicator ${compact ? 'operational-action-indicator--compact' : ''}`, 'data-state': item.state, 'data-required': item.required || undefined, title: item.label };
  return href ? <Link key={`${item.id}:${item.state}`} {...props} to={href} aria-label={`${item.label} — open action`} onClick={event => event.stopPropagation()}>{content}</Link> : <span key={`${item.id}:${item.state}`} {...props}>{content}</span>;
}
export function OperationalActionHealth() {
  const { loading, generatedAt, error, refresh } = useOperationalActions();
  return error ? <button type="button" className="operational-action-health" aria-label="Pending actions could not refresh. Retry" title="Pending actions could not refresh. Showing last known counts. Retry" onClick={refresh}><CircleAlert size={17}/><span className="sr-only">Retry pending actions</span></button> : loading && !generatedAt ? <span className="operational-action-health" role="status"><RefreshCw size={15} aria-hidden="true"/><span className="sr-only">Checking pending actions…</span></span> : null;
}
export function NavigationActionCounter({ path, label }: { path: string; label: string }) {
  const { counts } = useOperationalActions();
  const count = ['/admin/court-rentals', '/badminton-fo/courts'].includes(path) ? counts.court : ['/admin/private-courses', '/badminton-fo/private-courses'].includes(path) ? counts.private_course : ['/coach/bookings', '/coach/schedule'].includes(path) ? counts.coachRequests : path === '/admin/badminton' ? counts.total : 0;
  return <PendingActionCounter count={count} label={label}/>;
}
