import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, CreditCard, Plus, ReceiptText, RefreshCw, RotateCcw, X } from 'lucide-react';
import { get, post } from '../api';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Card, Empty, Pagination } from '../components/UI';
import { DialogSurface } from '../components/Interactions';
import { Select } from '../components/Select';
import GymReceipt from '../components/GymReceipt';
import { gymKindLabels, gymMoney, gymToday, type GymCatalogPackage, type GymCoach, type GymEnrollment, type GymPage, type GymPerson } from '../types/gym';

type Policy = { today: string; timeZone: string; paymentMethods: string[] };
type PaymentAttempt = { id: string; checkoutUrl?: string; qrCode?: string; status: string };
export default function GymEnrollments({ memberView = false, trainingOnly = false }: { memberView?: boolean; trainingOnly?: boolean }) {
  const { user } = useAuth();
  const [result, setResult] = useState<GymPage<GymEnrollment> | null>(null), [page, setPage] = useState(1);
  const [query, setQuery] = useState(''), [status, setStatus] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [sale, setSale] = useState<{ renewal?: GymEnrollment } | null>(null), [payment, setPayment] = useState<GymEnrollment | null>(null), [receipt, setReceipt] = useState<GymEnrollment | null>(null);
  const [cancel, setCancel] = useState<GymEnrollment | null>(null), [reason, setReason] = useState(''), [busy, setBusy] = useState(false);
  const loadId = useRef(0);
  const load = useCallback(async () => {
    const id = (loadId.current += 1);
    setLoading(true); setError('');
    try {
      const data = await get<GymPage<GymEnrollment>>(`/gym/enrollments?${new URLSearchParams({ page: String(page), q: query, status, ...(trainingOnly ? { category: 'training' } : {}) })}`);
      if (id === loadId.current) setResult(data);
    } catch (e) { if (id === loadId.current) setError(e instanceof Error ? e.message : 'Could not load enrollments.'); }
    finally { if (id === loadId.current) setLoading(false); }
  }, [page, query, status, trainingOnly]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 180); return () => { loadId.current += 1; window.clearTimeout(timer); }; }, [load]);
  const showReceipt = async (row: GymEnrollment) => {
    try { setReceipt((await get<{ enrollment: GymEnrollment }>(`/gym/enrollments/${row.id}/receipt`)).enrollment); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load receipt.'); }
  };
  const cancelNow = async (event: FormEvent) => {
    event.preventDefault(); if (!cancel) return;
    setBusy(true); setError('');
    try { await post(`/gym/enrollments/${cancel.id}/cancel`, { reason }); setCancel(null); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not cancel enrollment.'); }
    finally { setBusy(false); }
  };
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">{memberView ? 'My gym packages' : trainingOnly ? 'PT enrollments & renewals' : 'Enrollments & renewals'}</h2><p className="mt-1 text-sm text-zawana-500">{memberView ? 'Your access, shared training balances, and receipts.' : trainingOnly ? 'Individual, couple and group PT purchases, including packages awaiting payment.' : 'Select a package, enroll members, and activate after payment.'}</p></div><div className="flex gap-2"><Button variant="secondary" disabled={loading} onClick={() => void load()}><RefreshCw size={15} />Refresh</Button>{!memberView && <Button onClick={() => setSale({})}><Plus size={15} /> {trainingOnly ? 'New PT enrollment' : 'New enrollment'}</Button>}</div></div>
    <Card className="grid gap-3 p-4 sm:grid-cols-[1fr_220px]"><label className="text-xs font-semibold">Search<input className="mt-2 w-full" placeholder="Member, package or reference" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label><label className="text-xs font-semibold">Status<Select className="mt-2 w-full" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">All enrollments</option>{['ACTIVE', 'PENDING_PAYMENT', 'EXPIRED', 'CANCELLED'].map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</Select></label></Card>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {loading ? <Card className="p-6">Loading enrollments…</Card> : result?.data.length ? <div className="grid gap-4 lg:grid-cols-2">{result.data.map(row => <Card key={row.id} className="p-5">
      <div className="flex justify-between gap-3"><div><p className="text-xs font-bold tracking-wider text-zawana-accent">{gymKindLabels[row.kind]}</p><h3 className="mt-2 text-lg font-bold">{row.snapshot.title}</h3></div><Badge good={row.effectiveStatus === 'ACTIVE'}>{(row.effectiveStatus || row.status) === 'PENDING_PAYMENT' ? 'Awaiting payment' : (row.effectiveStatus || row.status).replaceAll('_', ' ')}</Badge></div>
      <p className="mt-3 text-sm">{row.members.map(m => m.user.name).join(', ')}</p><p className="mt-2 text-xs text-zawana-500">{row.code} · {row.startDate} – {row.expiryDate}</p>
      <div className="mt-4 flex flex-wrap justify-between gap-3 rounded-xl bg-zawana-50 p-4"><b>{gymMoney(row.totalPrice)}</b><span className="text-sm">{row.kind === 'MEMBERSHIP' ? 'Unlimited daily gym access' : `${row.sessionsRemaining} / ${row.sessionsTotal} ${row.kind === 'WALK_IN' ? 'visits' : 'shared sessions'} left`}</span></div>
      {row.coach && <p className="mt-3 text-sm text-zawana-500">Coach {row.coach.name}</p>}
      {trainingOnly && row.effectiveStatus === 'PENDING_PAYMENT' && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Complete payment to activate this package for PT scheduling.</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {!memberView && row.status === 'PENDING_PAYMENT' && row.effectiveStatus !== 'EXPIRED' && <Button onClick={() => setPayment(row)}><CreditCard size={15} /> Take payment</Button>}
        {row.transaction && <Button variant="secondary" onClick={() => void showReceipt(row)}><ReceiptText size={15} /> Receipt</Button>}
        {!memberView && row.paidAt && row.status !== 'CANCELLED' && <Button variant="secondary" onClick={() => setSale({ renewal: row })}><RotateCcw size={15} /> Renew</Button>}
        {!memberView && row.status !== 'CANCELLED' && (!row.paidAt || user?.role === 'admin') && <Button variant="ghost" onClick={() => { setReason(''); setCancel(row); }}>Cancel</Button>}
      </div>
    </Card>)}</div> : <Empty title="No enrollments found" body={memberView ? 'Activated gym packages and training enrollments will appear here.' : 'Create an enrollment to begin. Published packages come from the Admin catalog.'} />}
    {result && <Pagination page={page} total={result.pagination.total} totalPages={result.pagination.totalPages} onPage={setPage} />}
    <AnimatePresence>{sale && <EnrollmentWizard trainingOnly={trainingOnly} renewal={sale.renewal} onClose={() => setSale(null)} onSaved={row => { setSale(null); setPayment(row); void load(); }} />}</AnimatePresence>
    <AnimatePresence>{payment && <GymPayment enrollment={payment} onClose={() => { setPayment(null); void load(); }} onPaid={row => { setPayment(null); setReceipt(row); void load(); }} />}</AnimatePresence>
    <AnimatePresence>{receipt && <GymReceipt enrollment={receipt} onClose={() => setReceipt(null)} />}</AnimatePresence>
    <AnimatePresence>{cancel && <DialogSurface title="Cancel enrollment" onClose={() => { if (!busy) setCancel(null); }} className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"><form className="p-6" onSubmit={cancelNow}><h2 className="text-xl font-bold">Cancel {cancel.code}</h2><p className="mt-3 text-sm text-zawana-500">Future sessions and gym access will be cancelled. Receipts are preserved. This does not issue a refund.</p><label className="mt-4 block text-sm font-bold">Reason<textarea required minLength={3} maxLength={500} className="mt-2 w-full" value={reason} onChange={e => setReason(e.target.value)} /></label>{error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}<div className="mt-5 flex gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={() => setCancel(null)}>Keep enrollment</Button><Button variant="danger" disabled={busy}>Confirm cancellation</Button></div></form></DialogSurface>}</AnimatePresence>
  </section>;
}

function EnrollmentWizard({ renewal, onSaved, onClose, trainingOnly }: { trainingOnly: boolean; renewal?: GymEnrollment; onSaved: (row: GymEnrollment) => void; onClose: () => void }) {
  const [step, setStep] = useState(0), [packages, setPackages] = useState<GymCatalogPackage[]>([]), [coaches, setCoaches] = useState<GymCoach[]>([]);
  const [members, setMembers] = useState<GymPerson[]>([]), [selected, setSelected] = useState<GymPerson[]>(renewal?.members.map(m => m.user) || []), [query, setQuery] = useState('');
  const [packageId, setPackageId] = useState(renewal?.packageId || ''), [coachId, setCoachId] = useState(renewal?.coachId || ''), [startDate, setStartDate] = useState(() => {
    if (renewal?.kind === 'MEMBERSHIP' && renewal.expiryDate >= gymToday()) { const d = new Date(`${renewal.expiryDate}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
    return gymToday();
  });
  const [policy, setPolicy] = useState<Policy | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [requestKey] = useState(() => crypto.randomUUID()), [register, setRegister] = useState(false), [newMember, setNewMember] = useState({ name: '', email: '', phone: '' });
  useEffect(() => {
    let active = true;
    Promise.all([get<GymCatalogPackage[]>('/gym/packages?active=true'), get<GymCoach[]>('/gym/private-training/coaches'), get<Policy>('/gym/policy')]).then(([p, c, policy]) => { if (active) { setPackages(trainingOnly ? p.filter(pkg => pkg.kind.includes('PT')) : p); setCoaches(c); setPolicy(policy); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [trainingOnly]);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => { get<GymPerson[]>(`/gym/private-training/members?q=${encodeURIComponent(query)}`).then(rows => { if (active) setMembers(rows); }).catch(e => { if (active) setError(e.message); }); }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);
  const pkg = packages.find(p => p.id === packageId);
  const validMembers = !!pkg && selected.length >= pkg.minMembers && selected.length <= pkg.maxMembers;
  const registerMember = async () => {
    setBusy(true); setError('');
    try { const member = await post<GymPerson>('/gym/members', newMember); setSelected(s => [...s, member]); setMembers(s => [member, ...s]); setRegister(false); setNewMember({ name: '', email: '', phone: '' }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not register member.'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!pkg) return;
    setBusy(true); setError('');
    try { onSaved(await post<GymEnrollment>('/gym/enrollments', { packageId: pkg.id, packageVersion: pkg.version, memberIds: selected.map(m => m.id), coachId: coachId || undefined, startDate, requestKey, renewalOfId: renewal?.id })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create enrollment.'); }
    finally { setBusy(false); }
  };
  return <DialogSurface title={renewal ? 'Renew gym package' : trainingOnly ? 'New PT enrollment' : 'New gym enrollment'} onClose={() => { if (!busy) onClose(); }} className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl"><div className="max-h-[88vh] overflow-y-auto p-5 sm:p-7">
    <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold tracking-wider text-zawana-accent">GYM FRONT DESK</p><h2 className="mt-1 text-2xl font-bold">{renewal ? 'Renew package' : trainingOnly ? 'New PT enrollment' : 'New enrollment'}</h2></div><Button variant="ghost" aria-label="Close enrollment" disabled={busy} onClick={onClose}><X size={18} /></Button></div>
    <ol className="my-6 grid grid-cols-4 gap-2" aria-label="Enrollment progress">{['Package', 'Members', 'Coach & dates', 'Review'].map((label, i) => <li key={label} aria-current={i === step ? 'step' : undefined} className={`rounded-xl p-2 text-center text-xs font-bold ${i === step ? 'bg-zawana-gold text-zawana-950' : 'bg-zawana-50 text-zawana-500'}`}>{i + 1}. {label}</li>)}</ol>
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {loading ? <p>Loading published packages…</p> : step === 0 ? <div className="grid gap-3 sm:grid-cols-2">{packages.filter(p => !renewal || p.kind === renewal.kind).map(p => <button key={p.id} type="button" aria-pressed={p.id === packageId} onClick={() => setPackageId(p.id)} className={`rounded-2xl border p-4 text-left ${p.id === packageId ? 'border-zawana-gold bg-zawana-gold/10' : 'border-zawana-border'}`}><span className="text-xs text-zawana-accent">{gymKindLabels[p.kind]}</span><b className="mt-2 block">{p.title}</b><b className="mt-2 block text-lg">{gymMoney(p.price)}</b><span className="mt-2 block text-xs text-zawana-500">{p.kind === 'MEMBERSHIP' ? `${p.months} months` : `${p.sessions} sessions · ${p.validityDays} days`} · {p.minMembers}–{p.maxMembers} members</span></button>)}{!packages.length && <p className="text-sm text-zawana-500">No published packages. Ask Admin to publish a package first.</p>}</div> : step === 1 ? <div className="space-y-4">
      <p className="text-sm">Select {pkg?.minMembers === pkg?.maxMembers ? pkg?.minMembers : `${pkg?.minMembers}–${pkg?.maxMembers}`} member(s). <b>{selected.length} selected</b></p>
      <div className="flex flex-wrap gap-2">{selected.map(m => <button key={m.id} type="button" disabled={!!renewal} className="rounded-full bg-zawana-gold/15 px-3 py-2 text-sm" onClick={() => setSelected(s => s.filter(x => x.id !== m.id))}>{m.name} {!renewal && '×'}</button>)}</div>
      {!renewal && <><label className="block text-sm font-bold">Find member<input className="mt-2 w-full" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, phone or email" /></label><div className="max-h-52 divide-y overflow-y-auto rounded-xl border">{members.map(m => <label key={m.id} className="flex cursor-pointer items-center gap-3 p-3"><input type="checkbox" checked={selected.some(s => s.id === m.id)} disabled={!selected.some(s => s.id === m.id) && selected.length >= (pkg?.maxMembers || 1)} onChange={e => setSelected(s => e.target.checked ? [...s, m] : s.filter(x => x.id !== m.id))} /><span><b className="text-sm">{m.name}</b><span className="block text-xs text-zawana-500">{m.email} · {m.phone}</span></span></label>)}</div><Button variant="secondary" onClick={() => setRegister(!register)}><Plus size={15} /> Register member</Button>
        {register && <div className="space-y-3 rounded-xl bg-zawana-50 p-4">{(['name', 'email', 'phone'] as const).map(field => <label key={field} className="block text-xs font-bold capitalize">{field}<input className="mt-1 w-full" type={field === 'email' ? 'email' : 'text'} value={newMember[field]} onChange={e => setNewMember({ ...newMember, [field]: e.target.value })} /></label>)}<p className="text-xs text-zawana-500">Creates a member profile. Admin manages login setup separately.</p><Button disabled={busy || !newMember.name || !newMember.email || !newMember.phone} onClick={() => void registerMember()}>Save member</Button></div>}
      </>}
    </div> : step === 2 ? <div className="space-y-5">
      <label className="block text-sm font-bold">Start date<input type="date" className="mt-2 w-full" min={policy?.today || gymToday()} value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
      <label className="block text-sm font-bold">Gym coach{pkg?.coachRequired ? ' (required)' : ' (optional)'}<Select className="mt-2 w-full" value={coachId} onChange={e => setCoachId(e.target.value)}><option value="">Choose coach</option>{coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
      <p className="rounded-xl bg-zawana-50 p-4 text-sm text-zawana-500">After activation, schedule sessions from Private Training. Available times are checked against the coach and every participant.</p>
    </div> : <div className="space-y-4"><h3 className="text-xl font-bold">{pkg?.title}</h3><p>{selected.map(m => m.name).join(', ')}</p><p className="text-sm text-zawana-500">Starts {startDate} · {pkg?.kind === 'MEMBERSHIP' ? `${pkg.months} calendar months` : `${pkg?.validityDays} day validity`} · {coaches.find(c => c.id === coachId)?.name || 'No coach assigned'}</p><p className="text-3xl font-bold">{gymMoney(pkg?.price || 0)}</p><p className="rounded-xl bg-zawana-50 p-4 text-sm">The next step is payment. Access and session scheduling become available only after verified payment.</p></div>}
    <div className="mt-7 flex items-center justify-between gap-3"><Button variant="secondary" disabled={busy || step === 0} onClick={() => setStep(s => s - 1)}><ArrowLeft size={15} />Back</Button>{step < 3 ? <Button disabled={loading || busy || !pkg || (step === 1 && !validMembers) || (step === 2 && (!startDate || (!!pkg.coachRequired && !coachId)))} onClick={() => { setError(''); setStep(s => s + 1); }}>Continue<ArrowRight size={15} /></Button> : <Button disabled={busy || !validMembers} onClick={() => void save()}>{busy ? 'Saving…' : 'Continue to payment'}<ArrowRight size={15} /></Button>}</div>
  </div></DialogSurface>;
}

function GymPayment({ enrollment, onClose, onPaid }: { enrollment: GymEnrollment; onClose: () => void; onPaid: (row: GymEnrollment) => void }) {
  const [policy, setPolicy] = useState<Policy | null>(null), [method, setMethod] = useState('KPay'), [received, setReceived] = useState(false), [attempt, setAttempt] = useState<PaymentAttempt | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; get<Policy>('/gym/policy').then(p => { if (active) setPolicy(p); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  const checkPayment = async () => {
    setBusy(true); setError('');
    try { onPaid((await get<{ enrollment: GymEnrollment }>(`/gym/enrollments/${enrollment.id}/receipt`)).enrollment); }
    catch (e) { setError(e instanceof Error && (e as Error & { status?: number }).status === 404 ? 'Payment is not verified yet. Complete checkout, then check again.' : e instanceof Error ? e.message : 'Could not check payment.'); }
    finally { setBusy(false); }
  };
  const pay = async () => {
    setBusy(true); setError('');
    try {
      const result = await post<{ enrollment?: GymEnrollment; attempt?: PaymentAttempt }>(`/gym/enrollments/${enrollment.id}/payment`, { method, ...(method === 'Cash' ? { cashReceived: received } : {}) });
      if (result.enrollment) onPaid(result.enrollment); else if (result.attempt) setAttempt(result.attempt);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not start payment.'); }
    finally { setBusy(false); }
  };
  return <DialogSurface title="Enrollment payment" onClose={() => { if (!busy) onClose(); }} className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"><div className="max-h-[85vh] overflow-y-auto p-6"><div className="flex justify-between gap-3"><h2 className="text-xl font-bold">Payment & activation</h2><Button variant="ghost" aria-label="Close payment" disabled={busy} onClick={onClose}><X size={18} /></Button></div><p className="mt-4 font-bold">{enrollment.snapshot.title}</p><p className="mt-2 text-3xl font-bold">{gymMoney(enrollment.totalPrice)}</p><p className="mt-2 text-xs text-zawana-500">{enrollment.code}</p>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!attempt ? <><label className="mt-5 block text-sm font-bold">Payment method<Select className="mt-2 w-full" value={method} onChange={e => setMethod(e.target.value)}>{(policy?.paymentMethods || ['KPay']).map(m => <option key={m}>{m}</option>)}</Select></label>{method === 'Cash' && <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={received} onChange={e => setReceived(e.target.checked)} />I have received the full cash amount.</label>}<Button className="mt-5 w-full" disabled={busy || !policy || (method === 'Cash' && !received)} onClick={() => void pay()}><CreditCard size={15} />{busy ? 'Processing…' : method === 'Cash' ? 'Record cash & activate' : 'Start KPay checkout'}</Button></> : <div className="mt-5 space-y-4"><p className="text-sm">Complete the provider checkout. Activation follows verified payment.</p>{attempt.checkoutUrl && /^https:\/\//i.test(attempt.checkoutUrl) && <a className="inline-flex rounded-xl bg-zawana-gold px-4 py-3 text-sm font-bold" href={attempt.checkoutUrl} target="_blank" rel="noreferrer">Open KPay checkout</a>}{attempt.qrCode && (/^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(attempt.qrCode) ? <img src={attempt.qrCode} alt="KPay payment QR code" className="mx-auto max-h-64 rounded-xl border p-2" /> : <p className="break-all rounded-xl bg-zawana-50 p-3 text-xs">Payment QR reference: {attempt.qrCode}</p>)}<Button className="w-full" disabled={busy} onClick={() => void checkPayment()}><Check size={15} />Check payment status</Button></div>}
    <Button className="mt-3 w-full" variant="ghost" disabled={busy} onClick={() => void checkPayment()}>Refresh activation status</Button>
  </div></DialogSurface>;
}
