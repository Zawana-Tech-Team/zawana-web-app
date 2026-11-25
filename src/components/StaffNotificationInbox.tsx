import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bell, Check, CircleAlert, CircleDot, RefreshCw, Search, X } from 'lucide-react';
import { get } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { INBOX_CHANGED, INBOX_REFRESH, removeViewedNotifications } from '../services/notificationInbox';
import { Button } from './UI';
import { Select } from './Select';
import { HistoryPagination } from './member-booking/HistoryPagination';
import { NotificationGraphic, notificationCategory, notificationTimestamp, type InboxNotice } from './notification/NotificationPresentation';

/** Admin and FO share presentation; audience and action links remain server controlled. */
export function StaffNotificationInbox() {
  const { user } = useAuth(), { locale } = useLanguage();
  const userId = user?.id;
  const [items, setItems] = useState<InboxNotice[]>([]), [owner, setOwner] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [type, setType] = useState(''), [unreadOnly, setUnreadOnly] = useState(false), [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string[]>([]);
  const alive = useRef(false), revision = useRef(0), removed = useRef(new Set<string>()), pending = useRef(new Set<string>());
  const load = useCallback(async () => {
    if (!userId) return;
    const request = ++revision.current; setLoading(true);
    try {
      const rows = await get<InboxNotice[]>('/notifications');
      if (alive.current && request === revision.current) {
        setOwner(userId); setItems(rows.filter(row => !removed.current.has(row.id) && row.activeInInbox !== false && (!row.expiresAt || new Date(row.expiresAt).getTime() > Date.now()))); setError('');
      }
    } catch (failure) { if (alive.current && request === revision.current) setError(failure instanceof Error ? failure.message : 'Could not load notifications.'); }
    finally { if (alive.current && request === revision.current) setLoading(false); }
  }, [userId]);
  useEffect(() => {
    const activeRequests=revision;
    alive.current = true; removed.current = new Set(); pending.current = new Set(); setItems([]); setOwner(''); setLoading(true); setError(''); setBusy([]); setQuery(''); setType(''); setUnreadOnly(false); setPage(1);
    const changed = (event: Event) => { const ids = (event as CustomEvent<{ ids: string[] }>).detail.ids; ids.forEach(id => removed.current.add(id)); setItems(rows => rows.filter(row => !removed.current.has(row.id))); };
    const refresh = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(refresh, 10000);
    window.addEventListener('online', refresh); window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh); window.addEventListener(INBOX_CHANGED, changed); window.addEventListener(INBOX_REFRESH, refresh); void load();
    return () => { alive.current = false; activeRequests.current++; clearInterval(timer); window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); window.removeEventListener(INBOX_CHANGED, changed); window.removeEventListener(INBOX_REFRESH, refresh); };
  }, [load]);
  const dismiss = async (id: string) => {
    const activePending = pending.current;
    if (activePending.has(id)) return;
    activePending.add(id); setBusy([...activePending]); setError('');
    try { await removeViewedNotifications([id]); }
    catch (failure) { if (alive.current && pending.current === activePending) setError(failure instanceof Error ? failure.message : 'Could not dismiss this notification. Please try again.'); }
    finally { activePending.delete(id); if (alive.current && pending.current === activePending) setBusy([...activePending]); }
  };
  const ownItems = owner === userId ? items : [];
  const unread = ownItems.filter(item => !item.read).length;
  const visible = ownItems.filter(item => (!unreadOnly || !item.read) && (!type || notificationCategory(item) === type) && `${item.title} ${item.body}`.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale)));
  const pages = Math.max(1, Math.ceil(visible.length / 20)), current = Math.min(page, pages);
  const filtered = !!(query || type || unreadOnly);
  const clear = () => { setQuery(''); setType(''); setUnreadOnly(false); setPage(1); };
  return <section className="staff-notification-inbox" aria-label="Notification inbox" aria-busy={loading}>
    <div className="staff-notification-toolbar">
      <label className="staff-notification-search"><Search size={17} aria-hidden="true"/><input type="search" aria-label="Search notifications" placeholder="Search notifications" maxLength={120} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }}/></label>
      <Select aria-label="Notification type" value={type} onChange={event => { setType(event.target.value); setPage(1); }}><option value="">All updates</option>{['Bookings', 'Payments', 'Packages', 'Attendance', 'Updates'].map(value => <option key={value}>{value}</option>)}</Select>
      <Button variant="secondary" aria-pressed={unreadOnly} onClick={() => { setUnreadOnly(value => !value); setPage(1); }}><CircleDot size={15} aria-hidden="true"/>Unread <span className="staff-notification-count">{unread}</span></Button>
      <Button variant="secondary" aria-label="Refresh notifications" disabled={loading} onClick={() => void load()}><RefreshCw size={16} aria-hidden="true"/></Button>
      {filtered && <Button variant="ghost" onClick={clear}><X size={14} aria-hidden="true"/>Clear filters</Button>}
    </div>
    {error && <div role="alert" className="staff-notification-error"><CircleAlert size={18} aria-hidden="true"/><p>{error}</p><Button variant="secondary" disabled={loading} onClick={() => void load()}>Retry</Button></div>}
    {loading && !ownItems.length && !error ? <p role="status" className="staff-notification-empty">Loading notifications…</p> : visible.length ? <ul className="staff-notification-list">{visible.slice((current - 1) * 20, current * 20).map(item => <li key={item.id} data-unread={!item.read || undefined}>
      <NotificationGraphic notice={item}/><div className="staff-notification-content"><div className="staff-notification-title"><h2>{item.title}{!item.read && <span className="staff-notification-dot"><span className="sr-only">Unread</span></span>}</h2><time dateTime={item.createdAt}>{notificationTimestamp(item.createdAt, locale)}</time></div><p>{item.body}</p><div className="staff-notification-row-actions">{item.link && <Link to={item.link} onClick={() => void dismiss(item.id)}>{item.actionLabel || 'View details'}<ArrowUpRight size={14} aria-hidden="true"/></Link>}<Button variant="ghost" disabled={busy.includes(item.id)} loading={busy.includes(item.id)} onClick={() => void dismiss(item.id)}><Check size={14} aria-hidden="true"/>Dismiss</Button></div></div>
    </li>)}</ul> : !loading && !error && <div className="staff-notification-empty">{filtered ? <Search size={29} strokeWidth={1.4} aria-hidden="true"/> : <Bell size={29} strokeWidth={1.4} aria-hidden="true"/>}<h2>{filtered ? 'No matching notifications' : 'You’re all caught up'}</h2><p>{filtered ? 'Try another keyword or notification type.' : user?.role === 'badminton_fo' ? 'New badminton booking, package and payment updates will appear here.' : 'New operational updates will appear here.'}</p></div>}
    {(ownItems.length > 0 || (!loading && !error)) && <HistoryPagination page={current} totalPages={pages} total={visible.length} pageSize={20} noun="updates" label="Notification pagination" disabled={loading} onPage={setPage}/>}
  </section>;
}
