import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Archive, History, Pencil, Plus, RefreshCw, X } from 'lucide-react';
import { get, patch, post } from '../api';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Card, Empty, Pagination, Stat } from '../components/UI';
import { DialogSurface, SegmentedControl } from '../components/Interactions';
import { Select } from '../components/Select';
import { gymKindLabels, gymMoney, type GymCatalogPackage, type GymKind } from '../types/gym';
import GymEnrollments from './GymEnrollments';

type Draft = Omit<GymCatalogPackage, 'id' | 'version'> & { id?: string; version?: number; pricingMode: 'total' | 'rate' };
const blank = (): Draft => ({ title: '', kind: 'MEMBERSHIP', description: '', benefits: [], price: 170000, rate: 170000, months: 1, sessions: 0, duration: 90, validityDays: 90, sessionMinutes: 60, minMembers: 1, maxMembers: 1, coachRequired: false, status: 'draft', pricingMode: 'total' });
type PackageHistory = { revisions: { id: string; version: number; snapshot: GymCatalogPackage; createdAt: string }[]; statistics: { status: string; _count: { _all: number }; _sum: { totalPrice: number } }[] };
type AuditPage = { data: { id: string; action: string; actorId: string; entityType: string; entityId: string; createdAt: string; before?: unknown; after?: unknown }[]; pagination: { total: number; totalPages: number } };

export default function GymPackageManager() {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin';
  const [tab, setTab] = useState('catalog'), [packages, setPackages] = useState<GymCatalogPackage[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(''), [kind, setKind] = useState(''), [status, setStatus] = useState('');
  const [history, setHistory] = useState<PackageHistory | null>(null), [audit, setAudit] = useState<AuditPage | null>(null), [auditPage, setAuditPage] = useState(1);
  const load = useCallback(async () => {
    setLoading(true);
    try { setPackages(await get<GymCatalogPackage[]>('/gym/packages')); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load packages.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (tab !== 'audit') return;
    let active = true;
    get<AuditPage>(`/gym/audit?page=${auditPage}`).then(data => { if (active) setAudit(data); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [tab, auditPage]);
  const filtered = packages.filter(p => (!kind || p.kind === kind) && (!status || p.status === status) && `${p.title} ${p.description}`.toLowerCase().includes(search.toLowerCase()));
  const updatePrice = (field: 'price' | 'rate' | 'months' | 'sessions', value: number) => setDraft(current => {
    if (!current) return current;
    const d = { ...current, [field]: value }, units = d.kind === 'MEMBERSHIP' ? d.months : d.kind === 'WALK_IN' ? 1 : d.sessions;
    if (field === 'price') { d.rate = units ? Math.round(value / units) : 0; d.pricingMode = 'total'; }
    else { d.price = d.rate * units; d.pricingMode = 'rate'; }
    return d;
  });
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!draft) return;
    setBusy(true); setError('');
    try {
      if (draft.id) await patch(`/gym/packages/${draft.id}`, draft); else await post('/gym/packages', draft);
      setDraft(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Package could not be saved.'); }
    finally { setBusy(false); }
  };
  const changeStatus = async (p: GymCatalogPackage, next: string) => {
    setBusy(true); setError('');
    try { await patch(`/gym/packages/${p.id}`, { status: next, version: p.version }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update package.'); }
    finally { setBusy(false); }
  };
  const showHistory = async (p: GymCatalogPackage) => {
    setError('');
    try { setHistory(await get<PackageHistory>(`/gym/packages/${p.id}/history`)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load history.'); }
  };
  return <div className="space-y-5">
    <SegmentedControl label="Gym administration" value={tab} onChange={setTab} options={[{ value: 'catalog', label: 'Package catalog' }, { value: 'enrollments', label: 'Enrollments' }, { value: 'audit', label: 'Activity log' }]} />
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {tab === 'enrollments' ? <GymEnrollments /> : tab === 'audit' ? <Card className="p-5">
      <h2 className="text-lg font-bold">Gym activity log</h2>
      <p className="mt-1 text-sm text-zawana-500">Package edits, verified payments, attendance, and access changes.</p>
      {!audit ? <p className="mt-5">Loading activity…</p> : <>
        <div className="mt-5 divide-y">{audit.data.map(a => <div key={a.id} className="py-3">
          <p className="text-sm font-bold">{a.action.replaceAll('_', ' ')}</p>
          <p className="mt-1 break-all text-xs text-zawana-500">{new Date(a.createdAt).toLocaleString()} · {a.entityType}: {a.entityId} · Staff: {a.actorId}</p><details className="mt-2 text-xs"><summary className="cursor-pointer font-semibold">Change details</summary><pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-zawana-50 p-3">{JSON.stringify({ before: a.before, after: a.after }, null, 2)}</pre></details>
        </div>)}</div>
        <Pagination page={auditPage} total={audit.pagination.total} totalPages={audit.pagination.totalPages} onPage={setAuditPage} />
      </>}
    </Card> : <>
      <div className="grid gap-4 sm:grid-cols-3"><Stat label="Published packages" value={packages.filter(p => p.status === 'active').length} /><Stat label="Training options" value={packages.filter(p => p.kind.includes('PT')).length} /><Stat label="Archived packages" value={packages.filter(p => p.status === 'archived').length} /></div>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-48 flex-1 text-xs font-bold">Search packages<input className="mt-2 w-full" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or description" /></label>
        <label className="text-xs font-bold">Category<Select className="mt-2 w-full" value={kind} onChange={e => setKind(e.target.value)}><option value="">All categories</option>{Object.entries(gymKindLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></label>
        <label className="text-xs font-bold">Status<Select className="mt-2 w-full" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{['active', 'draft', 'archived', 'inactive'].map(s => <option key={s}>{s}</option>)}</Select></label>
        <Button variant="secondary" disabled={loading} onClick={() => void load()}><RefreshCw size={16} /> Refresh</Button>
        {canEdit && <Button onClick={() => { setError(''); setDraft(blank()); }}><Plus size={16} /> New package</Button>}
      </Card>
      {loading ? <Card className="p-6">Loading packages…</Card> : filtered.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map(p => <Card key={p.id} className="flex flex-col p-5">
        <div className="flex justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wider text-zawana-accent">{gymKindLabels[p.kind]}</span><Badge good={p.status === 'active'}>{p.status}</Badge></div>
        <h2 className="mt-3 text-xl font-bold">{p.title}</h2><p className="mt-2 text-2xl font-bold">{gymMoney(p.price)}</p>
        <p className="mt-1 text-xs text-zawana-500">{gymMoney(p.rate)} / {p.kind === 'MEMBERSHIP' ? 'month' : 'session'} · effective rounded rate</p>
        <p className="mt-4 text-sm">{p.kind === 'MEMBERSHIP' ? `${p.months} calendar months · unlimited daily access` : `${p.sessions} session(s) · ${p.validityDays} day validity`}</p>
        <p className="mt-2 text-sm text-zawana-500">{p.minMembers === p.maxMembers ? p.minMembers : `${p.minMembers}–${p.maxMembers}`} member(s){p.coachRequired ? ' · Coach required' : ''}</p>
        <p className="mt-3 flex-1 text-sm text-zawana-500">{p.description}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {canEdit && <><Button variant="secondary" disabled={busy} onClick={() => { setError(''); setDraft({ ...p, pricingMode: 'total' }); }}><Pencil size={14} /> Edit</Button><Button variant="secondary" disabled={busy} onClick={() => void changeStatus(p, p.status === 'active' ? 'archived' : 'active')}><Archive size={14} />{p.status === 'active' ? 'Archive' : 'Publish'}</Button></>}
          <Button variant="ghost" onClick={() => void showHistory(p)}><History size={14} /> History</Button>
        </div>
      </Card>)}</div> : <Empty title="No packages found" body="Create a package or adjust the filters. Walk-in pricing must be configured by Admin." />}
    </>}
    <AnimatePresence>{draft && <DialogSurface title={draft.id ? 'Edit gym package' : 'Create gym package'} onClose={() => { if (!busy) setDraft(null); }} className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
      <form onSubmit={save} className="max-h-[85vh] overflow-y-auto p-5 sm:p-7">
        <div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-xl font-bold">{draft.id ? 'Edit gym package' : 'Create gym package'}</h2><Button type="button" variant="ghost" aria-label="Close package editor" disabled={busy} onClick={() => setDraft(null)}><X size={18} /></Button></div>
        {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold sm:col-span-2">Package name<input required maxLength={120} className="mt-2 w-full" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
          <label className="text-sm font-semibold">Category<Select className="mt-2 w-full" value={draft.kind} onChange={e => { const kind = e.target.value as GymKind, training = kind.includes('PT'); setDraft({ ...draft, kind, months: kind === 'MEMBERSHIP' ? 1 : 0, sessions: training || kind === 'WALK_IN' ? 1 : 0, minMembers: kind === 'COUPLE_PT' ? 2 : kind === 'GROUP_PT' ? 5 : 1, maxMembers: kind === 'COUPLE_PT' ? 2 : kind === 'GROUP_PT' ? 20 : 1, coachRequired: training, rate: draft.price, pricingMode: 'total' }); }}>{Object.entries(gymKindLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></label>
          <label className="text-sm font-semibold">Publication<Select className="mt-2 w-full" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}>{['draft', 'active', 'archived', 'inactive'].map(s => <option key={s}>{s}</option>)}</Select></label>
          {draft.kind === 'MEMBERSHIP' ? <label className="text-sm font-semibold">Calendar months<input required type="number" min={1} max={60} className="mt-2 w-full" value={draft.months} onChange={e => updatePrice('months', Number(e.target.value))} /></label> : <label className="text-sm font-semibold">Sessions<input required type="number" min={1} max={1000} disabled={draft.kind === 'WALK_IN'} className="mt-2 w-full" value={draft.sessions} onChange={e => updatePrice('sessions', Number(e.target.value))} /></label>}
          <label className="text-sm font-semibold">Rate (MMK)<input required type="number" min={0} max={2000000000} step={1} className="mt-2 w-full" value={draft.rate} onChange={e => updatePrice('rate', Number(e.target.value))} /></label>
          <label className="text-sm font-semibold">Total price (MMK)<input required type="number" min={1} max={2000000000} step={1} className="mt-2 w-full" value={draft.price} onChange={e => updatePrice('price', Number(e.target.value))} /></label>
          {draft.kind !== 'MEMBERSHIP' && draft.kind !== 'WALK_IN' && <><label className="text-sm font-semibold">Validity (days)<input required type="number" min={1} max={3650} className="mt-2 w-full" value={draft.validityDays} onChange={e => setDraft({ ...draft, validityDays: Number(e.target.value) })} /></label><label className="text-sm font-semibold">Session length (minutes)<input required type="number" min={15} max={180} className="mt-2 w-full" value={draft.sessionMinutes} onChange={e => setDraft({ ...draft, sessionMinutes: Number(e.target.value) })} /></label></>}
          {draft.kind === 'GROUP_PT' && <>{(['minMembers', 'maxMembers'] as const).map(field => <label key={field} className="text-sm font-semibold">{field === 'minMembers' ? 'Minimum members' : 'Maximum members'}<input required type="number" min={5} max={100} className="mt-2 w-full" value={draft[field]} onChange={e => setDraft({ ...draft, [field]: Number(e.target.value) })} /></label>)}</>}
          <label className="text-sm font-semibold sm:col-span-2">Description<textarea maxLength={2000} className="mt-2 w-full" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
          <label className="text-sm font-semibold sm:col-span-2">Benefits (one per line)<textarea className="mt-2 w-full" value={draft.benefits.join('\n')} onChange={e => setDraft({ ...draft, benefits: e.target.value.split('\n') })} /></label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={draft.coachRequired} disabled={draft.kind.includes('PT')} onChange={e => setDraft({ ...draft, coachRequired: e.target.checked })} />Coach required</label>
        </div>
        <p className="mt-5 rounded-xl bg-zawana-50 p-3 text-xs text-zawana-500">Editing a total recalculates the rounded rate. Editing a rate or quantity recalculates the total. Existing enrollments keep their original pricing and rules.</p>
        <Button className="mt-5 w-full" disabled={busy}>{busy ? 'Saving…' : 'Save package'}</Button>
      </form>
    </DialogSurface>}</AnimatePresence>
    <AnimatePresence>{history && <DialogSurface title="Package history" onClose={() => setHistory(null)} className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl"><div className="max-h-[80vh] overflow-y-auto p-6"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Package history</h2><Button variant="ghost" aria-label="Close history" onClick={() => setHistory(null)}><X size={18} /></Button></div><div className="mt-5 flex flex-wrap gap-3">{history.statistics.map(s => <Badge key={s.status}>{s.status}: {s._count._all} · {gymMoney(s._sum.totalPrice || 0)}</Badge>)}</div><div className="mt-5 divide-y">{history.revisions.map(r => <div key={r.id} className="py-4"><b>Version {r.version} · {gymMoney(r.snapshot.price)}</b><p className="mt-1 text-sm text-zawana-500">{r.snapshot.title} · {r.snapshot.status} · {new Date(r.createdAt).toLocaleString()}</p></div>)}</div></div></DialogSurface>}</AnimatePresence>
  </div>;
}
