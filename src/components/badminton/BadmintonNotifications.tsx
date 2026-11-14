import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bell, CalendarDays, Check, CreditCard, Package, RefreshCw, Search } from 'lucide-react';
import { get } from '../../api';
import { useLanguage } from '../../context/LanguageContext';
import { INBOX_CHANGED, INBOX_REFRESH, removeViewedNotifications } from '../../services/notificationInbox';
import { Empty } from '../UI';
import { Select } from '../Select';

type Notice = { id: string; title: string; body: string; createdAt: string; type?: string; read: boolean; link?: string; actionLabel?: string };
const category = (notice: Notice) => notice.type === 'booking' ? 'Bookings' : notice.type === 'payment' ? 'Payments'
  : ['package', 'membership'].includes(notice.type || '') ? 'Packages' : 'Updates';
const icon = (notice: Notice) => category(notice) === 'Bookings' ? CalendarDays : category(notice) === 'Payments' ? CreditCard : category(notice) === 'Packages' ? Package : Bell;

export default function BadmintonNotifications() {
  const { locale } = useLanguage();
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [type, setType] = useState('');
  const [busy, setBusy] = useState<string[]>([]);
  const alive = useRef(false), revision = useRef(0), removed = useRef(new Set<string>()), pending = useRef(new Set<string>());
  const load = useCallback(async () => {
    const request = ++revision.current;
    setLoading(true); setError('');
    try {
      const rows = await get<Notice[]>('/notifications');
      if (alive.current && request === revision.current) setItems(rows.filter(row => !removed.current.has(row.id)));
    } catch (failure) {
      if (alive.current && request === revision.current) setError(failure instanceof Error ? failure.message : 'Could not load notifications.');
    } finally { if (alive.current && request === revision.current) setLoading(false); }
  }, []);
  useEffect(() => {
    alive.current = true;
    const changed = (event: Event) => {
      const ids = (event as CustomEvent<{ ids: string[] }>).detail.ids;
      ids.forEach(id => removed.current.add(id));
      setItems(rows => rows.filter(row => !removed.current.has(row.id)));
    };
    const refresh = () => { void load(); };
    window.addEventListener(INBOX_CHANGED, changed); window.addEventListener(INBOX_REFRESH, refresh);
    void load();
    return () => { alive.current = false; window.removeEventListener(INBOX_CHANGED, changed); window.removeEventListener(INBOX_REFRESH, refresh); };
  }, [load]);
  const markRead = async (id: string) => {
    if (pending.current.has(id)) return;
    pending.current.add(id); setBusy([...pending.current]); setError('');
    try { await removeViewedNotifications([id]); }
    catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : 'Could not mark this notification read. Please try again.'); }
    finally { pending.current.delete(id); if (alive.current) setBusy([...pending.current]); }
  };
  const visible = items.filter(item => (!type || category(item) === type) && `${item.title} ${item.body}`.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale)));
  return <div className="space-y-5">
    <p className="max-w-2xl text-sm leading-6 text-zawana-500">Court activity, course requests, packages and payment updates for the badminton desk.</p>
    <section aria-label="Notification inbox" aria-busy={loading} className="overflow-hidden rounded-xl border border-zawana-950/10 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-zawana-950/10 p-4">
        <label className="relative min-w-0 flex-1 basis-52"><span className="sr-only">Search notifications</span><Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-3.5 text-zawana-400" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search notifications" className="min-h-11 w-full rounded-lg border border-zawana-950/10 !pl-9 text-sm focus-visible:ring-2 focus-visible:ring-zawana-gold" /></label>
        <Select aria-label="Notification type" className="w-40 max-w-full" value={type} onChange={event => setType(event.target.value)}><option value="">All updates</option>{['Bookings', 'Payments', 'Packages', 'Updates'].map(value => <option key={value}>{value}</option>)}</Select>
        <button type="button" disabled={loading} onClick={() => void load()} aria-label="Refresh notifications" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-zawana-950/10 text-zawana-500 transition hover:bg-zawana-50 focus-visible:ring-2 focus-visible:ring-zawana-gold disabled:opacity-50"><RefreshCw size={16} aria-hidden /></button>
      </div>
      {error && <div role="alert" className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700"><span>{error}</span><button type="button" onClick={() => void load()} className="min-h-11 rounded-lg px-3 font-medium underline focus-visible:ring-2 focus-visible:ring-zawana-gold">Retry</button></div>}
      {loading && <p role="status" className="px-4 py-4 text-sm text-zawana-500">Loading notifications…</p>}
      {visible.length > 0 ? <>
        <p role="status" className="border-b border-zawana-950/5 px-4 py-3 text-xs text-zawana-500">{visible.length} {visible.length === 1 ? 'update' : 'updates'}{query || type ? ' found' : ' in your inbox'}</p>
        <ul className="divide-y divide-zawana-950/5">{visible.map(item => {
          const Icon = icon(item), saving = busy.includes(item.id);
          return <li key={item.id} className="p-4 sm:p-5">
            <div className="flex items-start gap-3 sm:gap-4">
              <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-zawana-950/5 text-zawana-600"><Icon size={18} strokeWidth={1.6} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <h2 className="min-w-0 break-words text-sm font-semibold leading-6">{item.title}{!item.read && <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-zawana-gold align-middle"><span className="sr-only">Unread</span></span>}</h2>
                  <time dateTime={item.createdAt} className="shrink-0 text-xs leading-6 text-zawana-500">{new Date(item.createdAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</time>
                </div>
                <p className="mt-1 break-words text-sm leading-6 text-zawana-500">{item.body}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span className="text-xs text-zawana-400">{category(item)}</span>
                  <div className="flex flex-wrap items-center gap-3">
                    {item.link && <Link to={item.link} onClick={() => void markRead(item.id)} className="inline-flex min-h-11 items-center gap-2 rounded-md text-xs font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-zawana-gold">{item.actionLabel || 'Open details'}<ArrowUpRight size={14} aria-hidden /></Link>}
                    <button type="button" disabled={saving} onClick={() => void markRead(item.id)} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs text-zawana-500 transition hover:bg-zawana-50 focus-visible:ring-2 focus-visible:ring-zawana-gold disabled:opacity-50"><Check size={14} aria-hidden />{saving ? 'Saving…' : 'Mark read'}</button>
                  </div>
                </div>
              </div>
            </div>
          </li>;
        })}</ul>
      </> : !loading && !error && <div className="p-6 sm:p-10"><Empty title={query || type ? 'No matching notifications' : 'You’re all caught up'} body={query || type ? 'Try another keyword or notification type.' : 'New badminton booking, package and payment updates will appear here.'} />{(query || type) && <button type="button" onClick={() => { setQuery(''); setType(''); }} className="mx-auto mt-3 block min-h-11 rounded-lg px-4 text-sm font-medium underline focus-visible:ring-2 focus-visible:ring-zawana-gold">Clear filters</button>}</div>}
    </section>
  </div>;
}
