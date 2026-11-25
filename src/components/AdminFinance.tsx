import { useEffect, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Banknote, CalendarDays, CheckCircle2, Clock3, RefreshCw, RotateCcw, Search, SlidersHorizontal, Tag, Wallet, XCircle } from 'lucide-react';
import { get } from '../api';
import { useAuth } from '../context/AuthContext';
import { usePaymentRevision } from '../hooks/usePaymentRevision';
import { publicationDate } from '../utils/publicContent';
import { Button, Empty } from './UI';
import { Select } from './Select';
import { DeskDialog } from './court-desk/DeskDialog';
import { HistoryPagination } from './member-booking/HistoryPagination';
import { RefundInbox } from './RefundWorkflow';
import './management-workspace.css';

type Receipt = {
  id: string; date: string; createdAt: string; business: string; customer: string; item: string;
  amount: number; discount: number; tax: number; finalAmount: number; status: string;
  paymentMethod: string; staff: string; confirmationMode?: string; confirmedById?: string;
  resourceType?: string; resourceId?: string;
};
type Result = { data: Receipt[]; pagination: { total: number; totalPages: number }; summary: { gross: number; discounts: number; refunds: number; net: number } };
const emptyFilters = { business: '', q: '', status: '', paymentMethod: '', from: '', to: '', sort: 'newest' };
const money = (value: number) => `${value.toLocaleString('en-GB')} MMK`;
const recordedAt = (value: string) => new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Yangon' });
const recordedTime = (row: Receipt) => {
  const value = new Date(row.createdAt);
  if (new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yangon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value) !== row.date) return null;
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' }).format(value);
};
const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
function FinanceStatus({ value }: { value: string }) {
  const status = value.toLowerCase();
  const Icon = status === 'paid' ? CheckCircle2 : status === 'refunded' ? RotateCcw : ['cancelled', 'failed'].includes(status) ? XCircle : Clock3;
  return <span className="management-state" data-state={status}><Icon size={14} aria-hidden="true"/>{titleCase(value)}</span>;
}

export function AdminFinance() {
  const revision = usePaymentRevision();
  const { user } = useAuth();
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Receipt | null>(null);
  const loadedQuery = useRef('');
  useEffect(() => {
    let live = true;
    const key = JSON.stringify([page, filters]);
    setLoading(loadedQuery.current !== key); setRefreshing(true); setError('');
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      for (const [field, value] of Object.entries(filters)) if (value.trim()) params.set(field, value.trim());
      get<Result>(`/transactions?${params}`)
        .then(data => {
          if (!live) return;
          const pages = Math.max(1, data.pagination.totalPages);
          if (page > pages) { setPage(pages); return; }
          loadedQuery.current = key;
          setResult(data);
          setSelected(current => current ? data.data.find(row => row.id === current.id) || null : null);
        })
        .catch((cause: unknown) => { if (live) setError(cause instanceof Error ? cause.message : 'Could not load transactions.'); })
        .finally(() => { if (live) { setLoading(false); setRefreshing(false); } });
    }, filters.q ? 250 : 0);
    return () => { live = false; window.clearTimeout(timer); };
  }, [page, filters, revision, reload]);
  const update = (key: keyof typeof filters, value: string) => { setPage(1); setSelected(null); setFilters(current => ({ ...current, [key]: value })); };
  const filtered = Object.entries(filters).some(([key, value]) => key === 'sort' ? value !== 'newest' : Boolean(value));
  return <div className="management-workspace admin-finance" aria-busy={refreshing}>
    <section className="management-tools" aria-label="Finance filters">
      <label className="management-search"><Search size={17} aria-hidden="true"/><input aria-label="Search transactions" placeholder="Find a customer, service or transaction" value={filters.q} onChange={event => update('q', event.target.value)}/></label>
      <Select aria-label="Finance business" value={filters.business} onChange={event => update('business', event.target.value)}><option value="">All businesses</option>{['Gym', 'Badminton', 'Clinic', 'Store', 'Cafe', 'Academy'].map(value => <option key={value}>{value}</option>)}</Select>
      <Select aria-label="Transaction status" value={filters.status} onChange={event => update('status', event.target.value)}><option value="">All statuses</option>{['paid', 'pending', 'refunded', 'cancelled', 'failed'].map(value => <option key={value} value={value}>{titleCase(value)}</option>)}</Select>
      <Button variant="secondary" aria-label="Refresh finance" disabled={refreshing} onClick={() => setReload(value => value + 1)}><RefreshCw size={16} aria-hidden="true"/></Button>
    </section>
    <div className="management-filter-bar"><details><summary><SlidersHorizontal size={15} aria-hidden="true"/>More filters{(filters.from || filters.to || filters.paymentMethod || filters.sort !== 'newest') && <span>Applied</span>}</summary>
      <div className="management-filter-fields">
        <label>From date<input type="date" aria-label="From date" max={filters.to || undefined} value={filters.from} onChange={event => update('from', event.target.value)}/></label>
        <label>To date<input type="date" aria-label="To date" min={filters.from || undefined} value={filters.to} onChange={event => update('to', event.target.value)}/></label>
        <label>Payment method<Select aria-label="Payment method" value={filters.paymentMethod} onChange={event => update('paymentMethod', event.target.value)}><option value="">All methods</option>{['Cash', 'Online Payment', 'Manual (simulated)', 'Pay Later', 'Temporarily disabled'].map(value => <option key={value}>{value}</option>)}</Select></label>
        <label>Sort by<Select aria-label="Sort transactions" value={filters.sort} onChange={event => update('sort', event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount_desc">Amount: highest first</option><option value="amount_asc">Amount: lowest first</option></Select></label>
      </div>
    </details>{filtered && <Button variant="ghost" onClick={() => { setPage(1); setFilters(emptyFilters); }}>Clear filters</Button>}</div>
    {error ? <div role="alert" className="management-error"><p>{error}</p><Button variant="secondary" onClick={() => setReload(value => value + 1)}>Retry finance</Button></div>
      : loading || !result ? <div role="status" className="management-loading">Loading finance…</div> : <>
        <section className="finance-summary" aria-label="Filtered transaction totals">
          <div className="finance-net"><Wallet size={22} strokeWidth={1.5} aria-hidden="true"/><span>Net total</span><strong>{money(result.summary.net)}</strong><p>Across all matching transactions</p></div>
          <dl><div><dt><Banknote size={17} aria-hidden="true"/>Gross</dt><dd>{money(result.summary.gross)}</dd></div><div><dt><Tag size={17} aria-hidden="true"/>Discounts</dt><dd>{money(result.summary.discounts)}</dd></div><div><dt><RotateCcw size={17} aria-hidden="true"/>Refunds</dt><dd>{money(result.summary.refunds || 0)}</dd></div></dl>
        </section>
        {result.data.length ? <section className="finance-records" aria-label="Finance transactions">{result.data.map(row => <article key={row.id} aria-label={`Transaction ${row.id}`}>
          <div className="finance-record-main"><h2>{row.customer}</h2><p>{row.item}</p></div>
          <div className="finance-record-date"><CalendarDays size={16} aria-hidden="true"/><div><span>{publicationDate(row.date)}</span>{recordedTime(row) && <time dateTime={row.createdAt}>{recordedTime(row)} · Yangon</time>}</div></div>
          <div className="finance-record-method"><strong>{row.business}</strong><p>{row.paymentMethod}</p></div>
          <div className="finance-record-amount"><strong>{money(row.finalAmount)}</strong><FinanceStatus value={row.status}/></div>
          <Button variant="secondary" aria-label={`View transaction ${row.id}`} onClick={() => setSelected(row)}>Details<ArrowUpRight size={15} aria-hidden="true"/></Button>
        </article>)}</section> : <Empty title={filtered ? 'No matching transactions' : 'No transactions yet'} body={filtered ? 'Try another date range or clear your filters.' : 'Recorded transactions will appear here.'}/>}
        <HistoryPagination page={page} totalPages={result.pagination.totalPages} total={result.pagination.total} pageSize={20} noun="transactions" label="Finance pagination" disabled={refreshing} onPage={setPage}/>
      </>}
    {user?.role === 'admin' && <details className="finance-refund-requests"><summary><RotateCcw size={16} aria-hidden="true"/>Refund requests</summary><div><RefundInbox embedded emptyMessage="No refund requests."/></div></details>}
    {selected && <DeskDialog title="Transaction details" heading={selected.customer} size="compact" className="management-dialog finance-dialog" onClose={() => setSelected(null)} cancelLabel="Close">
      <div className="finance-detail-balance"><span>Final amount</span><strong>{money(selected.finalAmount)}</strong><FinanceStatus value={selected.status}/></div>
      <dl className="management-facts">
        <div><dt>Service / item</dt><dd>{selected.item}</dd></div><div><dt>Business</dt><dd>{selected.business}</dd></div>
        <div><dt>Transaction date</dt><dd>{publicationDate(selected.date)}</dd></div><div><dt>Recorded at</dt><dd>{recordedAt(selected.createdAt)}<span>Yangon time</span></dd></div>
        <div><dt>Payment method</dt><dd>{selected.paymentMethod}</dd></div><div><dt>Staff</dt><dd>{selected.staff || 'Not recorded'}</dd></div>
      </dl>
      {(selected.discount !== 0 || selected.tax !== 0) && <dl className="finance-breakdown"><div><dt>Subtotal</dt><dd>{money(selected.amount)}</dd></div>{selected.discount !== 0 && <div><dt>Discount</dt><dd>{money(selected.discount)}</dd></div>}{selected.tax !== 0 && <div><dt>Tax</dt><dd>{money(selected.tax)}</dd></div>}</dl>}
      {selected.confirmationMode && selected.confirmationMode !== 'LEGACY' && <p className="management-hint">{selected.confirmationMode === 'SIMULATED' ? 'Simulated confirmation · no external charge' : 'Manually confirmed'}</p>}
      <details className="management-audit"><summary>Audit details<ArrowDownRight size={15} aria-hidden="true"/></summary><dl className="management-facts"><div><dt>Transaction ID</dt><dd>{selected.id}</dd></div>{selected.confirmedById && <div><dt>Verified staff ID</dt><dd>{selected.confirmedById}</dd></div>}{selected.resourceId && <div><dt>Linked record</dt><dd>{selected.resourceId}</dd></div>}</dl></details>
    </DeskDialog>}
  </div>;
}
