import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ArrowUpRight, X } from 'lucide-react';
import { get } from '../../api';
import { Button, Empty, Pagination } from '../UI';
import { Select } from '../Select';
import { DialogSurface } from '../Interactions';
import { usePaymentRevision } from '../../hooks/usePaymentRevision';

type Receipt = {
  id: string; customer: string; category: string | null; item: string; finalAmount: number;
  amount: number; discount: number; tax: number; paymentMethod: string; status: string;
  date: string; createdAt: string; staff: string; confirmationMode?: string; resourceType?: string; resourceId?: string;
};
type Result = { data: Receipt[]; pagination: { total: number; totalPages: number } };
const categories = ['Court Rental', 'Private Course', 'Badminton Package', 'Weekly Class'];
const money = (value: number) => `${value.toLocaleString()} MMK`;
const timestamp = (row: Receipt) => new Date(row.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const methodLabel = (value: string) => ['Cash', 'CASH'].includes(value) ? 'Cash'
  : ['Online Payment', 'Online payment', 'ONLINE', 'Online', 'Pay Online', 'KPay', 'KPAY', 'Manual (simulated)'].includes(value) ? 'Online Payment' : value;
const confirmation = (row: Receipt) => row.confirmationMode === 'SIMULATED' ? 'Simulated confirmation · no external charge'
  : row.confirmationMode === 'MANUAL' ? 'Manually confirmed · not gateway verified' : 'Historical payment · original method retained';
function Status({ value }: { value: string }) {
  const colors: Record<string, string> = { paid: 'bg-emerald-50 text-emerald-800', pending: 'bg-amber-50 text-amber-800', failed: 'bg-red-50 text-red-700', refunded: 'bg-zawana-950/5 text-zawana-600' };
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${colors[value.toLowerCase()] || 'bg-zawana-950/5 text-zawana-600'}`}>{value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()}</span>;
}

export default function BadmintonTransactions() {
  const revision = usePaymentRevision();
  const [filters, setFilters] = useState({ q: '', category: '', paymentMethod: '', status: '', from: '', to: '', sort: 'newest' });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result>({ data: [], pagination: { total: 0, totalPages: 0 } });
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<Receipt | null>(null);
  const update = (key: keyof typeof filters, value: string) => { setFilters(previous => ({ ...previous, [key]: value })); setPage(1); };
  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ business: 'Badminton', page: String(page), limit: '20' });
      for (const [key, value] of Object.entries(filters)) if (value.trim()) params.set(key, value.trim());
      void get<Result>(`/transactions?${params}`).then(data => { if (alive) setResult(data); })
        .catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : 'Could not load transactions.'); })
        .finally(() => { if (alive) setLoading(false); });
    }, filters.q ? 250 : 0);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [filters, page, revision, retry]);
  const field = 'min-h-11 w-full rounded-lg border border-zawana-950/10 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zawana-gold';
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-xl text-sm text-zawana-500">Court rentals, courses, packages and class payments in one ledger.</p>
      <Link to="/badminton-fo/course-finance" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-zawana-950/10 bg-white px-3 text-sm font-medium hover:bg-zawana-50 focus-visible:ring-2 focus-visible:ring-zawana-gold">Course operations <ArrowUpRight size={15} /></Link>
    </div>
    <section aria-label="Transaction filters" className="space-y-3 rounded-xl border border-zawana-950/10 bg-white p-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <label className="col-span-2 block xl:col-span-1"><span className="sr-only">Search transactions</span><input className={field} placeholder="Customer, transaction ID or service" value={filters.q} onChange={e => update('q', e.target.value)} /></label>
        <Select aria-label="Transaction category" className="w-full min-w-0" value={filters.category} onChange={e => update('category', e.target.value)}><option value="">All categories</option>{categories.map(value => <option key={value}>{value}</option>)}</Select>
        <Select aria-label="Payment method" className="w-full min-w-0" value={filters.paymentMethod} onChange={e => update('paymentMethod', e.target.value)}><option value="">All methods</option><option>Cash</option><option>Online Payment</option></Select>
        <Select aria-label="Payment status" className="w-full min-w-0" value={filters.status} onChange={e => update('status', e.target.value)}><option value="">All statuses</option>{['paid', 'pending', 'failed', 'refunded'].map(value => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}</Select>
      </div>
      <div className="grid grid-cols-2 items-end gap-3 xl:grid-cols-4">
        <label className="text-xs text-zawana-500">From<input aria-label="From date" type="date" className={`${field} mt-1`} value={filters.from} onChange={e => update('from', e.target.value)} /></label>
        <label className="text-xs text-zawana-500">To<input aria-label="To date" type="date" className={`${field} mt-1`} min={filters.from || undefined} value={filters.to} onChange={e => update('to', e.target.value)} /></label>
        <Select aria-label="Sort transactions" className="w-full min-w-0" value={filters.sort} onChange={e => update('sort', e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount_desc">Amount: highest first</option><option value="amount_asc">Amount: lowest first</option></Select>
        <button type="button" className="min-h-11 rounded-lg px-3 text-sm text-zawana-500 hover:bg-zawana-50 focus-visible:ring-2 focus-visible:ring-zawana-gold" onClick={() => { setFilters({ q: '', category: '', paymentMethod: '', status: '', from: '', to: '', sort: 'newest' }); setPage(1); }}>Reset filters</button>
      </div>
    </section>
    {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700"><span>{error}</span><Button variant="secondary" onClick={() => setRetry(value => value + 1)}>Retry</Button></div>
      : loading ? <div role="status" className="rounded-xl border border-zawana-950/10 bg-white p-8 text-sm text-zawana-500">Loading transactions…</div>
      : !result.data.length ? <Empty title="No matching transactions" body="Try another date range or clear your filters. Scheduled weekly blocks appear here only when a payment is recorded." />
      : <div className="overflow-hidden rounded-xl border border-zawana-950/10 bg-white">
        <div className="border-b border-zawana-950/10 px-4 py-3 text-xs text-zawana-500">{result.pagination.total.toLocaleString()} transactions</div>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[960px] text-left text-sm"><thead className="bg-zawana-50 text-xs font-medium text-zawana-500"><tr>{['Transaction / customer', 'Category / service', 'Amount', 'Payment method', 'Payment status', 'Date & staff'].map(label => <th key={label} scope="col" className={`px-4 py-3 font-medium ${label === 'Amount' ? 'text-right' : ''}`}>{label}</th>)}</tr></thead><tbody className="divide-y divide-zawana-950/5">{result.data.map(row => <tr key={row.id} className="hover:bg-zawana-50/70">
          <td className="px-4 py-4"><button onClick={() => setSelected(row)} className="min-h-11 text-left font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-zawana-gold"><span className="block">{row.customer}</span><span className="mt-1 block max-w-52 truncate font-mono text-[11px] text-zawana-500">{row.id}</span><span className="sr-only">Open transaction details</span></button></td>
          <td className="max-w-64 px-4 py-4"><span className="block text-xs text-zawana-500">{row.category || 'Historical / unclassified'}</span><span className="mt-1 block">{row.item}</span></td>
          <td className="whitespace-nowrap px-4 py-4 text-right font-medium tabular-nums">{money(row.finalAmount)}</td>
          <td className="px-4 py-4">{methodLabel(row.paymentMethod)}<p className="mt-1 max-w-44 text-[11px] text-zawana-500">{confirmation(row)}</p></td>
          <td className="px-4 py-4"><Status value={row.status} /></td><td className="whitespace-nowrap px-4 py-4 text-xs text-zawana-500">{timestamp(row)}<p className="mt-1">{row.staff || 'Not recorded'}</p></td>
        </tr>)}</tbody></table></div>
        <div className="divide-y divide-zawana-950/5 md:hidden">{result.data.map(row => <button key={row.id} onClick={() => setSelected(row)} className="block w-full p-4 text-left hover:bg-zawana-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zawana-gold">
          <span className="flex items-start justify-between gap-3"><span className="text-sm font-medium">{row.customer}</span><span className="whitespace-nowrap text-sm font-medium tabular-nums">{money(row.finalAmount)}</span></span>
          <span className="mt-2 block text-xs text-zawana-500">{row.category || 'Historical / unclassified'}</span><span className="mt-1 block text-sm">{row.item}</span>
          <span className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-zawana-500">{methodLabel(row.paymentMethod)}</span><Status value={row.status} /></span>
          <span className="mt-2 block text-[11px] text-zawana-500">{timestamp(row)} / {row.staff || 'Staff not recorded'}</span><span className="mt-1 block text-[11px] text-zawana-500">{confirmation(row)}</span><span className="sr-only">Open transaction details</span>
        </button>)}</div>
      </div>}
    {!loading && !error && <Pagination page={page} totalPages={result.pagination.totalPages} total={result.pagination.total} onPage={setPage} />}
    <AnimatePresence>{selected && <DialogSurface title="Transaction details" onClose={() => setSelected(null)} className="w-full max-w-lg p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Transaction details</h2><button aria-label="Close transaction details" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-zawana-50 focus-visible:ring-2 focus-visible:ring-zawana-gold" onClick={() => setSelected(null)}><X size={18} /></button></div>
      <div className="mb-5 flex items-center justify-between gap-3 border-b border-zawana-950/10 pb-5"><p className="text-2xl font-semibold tabular-nums">{money(selected.finalAmount)}</p><Status value={selected.status} /></div>
      <dl className="space-y-4 text-sm">{[['Transaction ID', selected.id], ['Customer', selected.customer], ['Category', selected.category || 'Historical / unclassified'], ['Service / package', selected.item], ['Payment method', methodLabel(selected.paymentMethod)], ['Original payment method', selected.paymentMethod], ['Date & time', timestamp(selected)], ['Staff responsible', selected.staff || 'Not recorded'], ['Subtotal', money(selected.amount)], ['Discount', money(selected.discount)], ['Tax', money(selected.tax)], ['Linked record', selected.resourceId || 'Historical record']].map(([label, value]) => <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-4"><dt className="text-zawana-500">{label}</dt><dd className="break-words text-right">{value}</dd></div>)}</dl>
      <p className="mt-5 rounded-lg bg-zawana-50 p-3 text-xs leading-relaxed text-zawana-500">{confirmation(selected)}. Payment status is separate from booking and coach approval status.</p>
      {selected.category === 'Private Course' && <Link onClick={() => setSelected(null)} className="mt-4 inline-flex min-h-11 items-center text-sm font-medium underline" to={`/badminton-fo/course-finance${selected.resourceId ? `?booking=${encodeURIComponent(selected.resourceId)}` : ''}`}>Open course operations</Link>}
    </DialogSurface>}</AnimatePresence>
  </div>;
}
