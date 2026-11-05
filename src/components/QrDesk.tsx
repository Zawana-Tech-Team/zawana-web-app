import { categoryLabel, type BadmintonCategory } from './BadmintonCategoryField';
import { useCallback, useEffect, useRef, useState } from 'react';
import { QrCode, RefreshCw } from 'lucide-react';
import { post, del, get } from '../api';
import { useAuth } from '../context/AuthContext';
import './member-premium.css';
import './qr-desk.css';
type Qr = { id: string; token?: string; categoryCode: string; expiresAt: string; serverNow: string; status: string; checkInCount: number;
  recentCheckIns: { id: string; memberName: string; packageName: string; redeemedAt: string }[] };
type Slot = { slot: number; qr: Qr | null };
function QrCard({ slot, qr, options, otherCategory, loading, onUpdated }: Slot & { options: BadmintonCategory[]; otherCategory?: string; loading: boolean; onUpdated: (slot: number, qr: Qr) => void }) {
  const { user } = useAuth();
  const [categoryCode, setCategoryCode] = useState(qr?.categoryCode || '');
  const [image, setImage] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now()), [offset, setOffset] = useState(0);
  const qrId = qr?.id, qrCategory = qr?.categoryCode, qrToken = qr?.token, qrStatus = qr?.status, serverNow = qr?.serverNow;
  useEffect(() => { setCategoryCode(qrCategory || ''); setNotice(''); setError(''); }, [qrId, qrCategory]);
  useEffect(() => { if (serverNow) { const receivedAt = Date.now(); setNow(receivedAt); setOffset(new Date(serverNow).getTime() - receivedAt); } }, [serverNow]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    setImage(''); if (!qrToken || qrStatus !== 'ACTIVE') return;
    let active = true;
    import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(`${location.origin}/check-in#${qrToken}`, { width: 420, margin: 3, errorCorrectionLevel: 'M', color: { dark: '#19392b', light: '#ffffff' } })).then(value => { if (active) setImage(value); }).catch(() => { if (active) setError('Could not render QR. Refresh the desk to retry.'); });
    return () => { active = false; };
  }, [qrToken, qrStatus]);
  const generate = async (regenerate = false) => {
    setBusy(true); setError(''); setNotice('');
    try { const value = await post<Qr>('/check-in/qr', { slot, categoryCode, regenerate }); onUpdated(slot, value); setNotice(regenerate ? 'This slot’s QR was replaced.' : 'Category QR ready.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not generate QR.'); }
    finally { setBusy(false); }
  };
  const revoke = async () => {
    if (!qr) return; setBusy(true); setError('');
    try { await del(`/check-in/qr/${qr.id}`); onUpdated(slot, await get<Qr>(`/check-in/qr/${qr.id}`)); setNotice('This QR was revoked.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not revoke QR.'); }
    finally { setBusy(false); }
  };
  const seconds = qr ? Math.min(7200, Math.max(0, Math.ceil((new Date(qr.expiresAt).getTime() - now - offset) / 1000))) : 0;
  const status = qrStatus === 'ACTIVE' && !seconds ? 'EXPIRED' : qrStatus;
  const live = status === 'ACTIVE';
  return <article className="category-qr-card" aria-label={`QR slot ${slot}`}>
    <header><p className="premium-kicker">QR SLOT {slot}</p><h3>{qr ? categoryLabel(qr.categoryCode) : 'Choose a category'}</h3></header>
    <label className="category-qr-select">Attendance category<select aria-label={`QR slot ${slot} category`} disabled={busy || loading} value={categoryCode} onChange={e => setCategoryCode(e.target.value)}><option value="">Choose category</option>{options.map(c => <option key={c.id} value={c.code!} disabled={c.code === otherCategory}>{c.name}</option>)}</select></label>
    <div className="qr-desk-actions"><button className="premium-primary" disabled={busy || loading || !categoryCode || (live && categoryCode !== qrCategory)} onClick={() => void generate()}><QrCode size={15} />{busy ? 'Please wait…' : qr && !live ? 'Generate new QR' : 'Generate / restore QR'}</button>{live && <><button className="premium-secondary" disabled={busy || !categoryCode} onClick={() => void generate(true)}>Replace QR</button><button className="premium-secondary" disabled={busy} onClick={() => void revoke()}>Revoke</button></>}</div>
    <div className="qr-display">{qr ? <>{live && image ? <img src={image} alt={`${categoryLabel(qr.categoryCode)} attendance QR code`} /> : <QrCode size={30} strokeWidth={1} />}<span className="qr-live">{status}{live ? ` · ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : ''}</span><strong aria-live="polite">{qr.checkInCount} {qr.checkInCount === 1 ? 'check-in' : 'check-ins'}</strong>{live && seconds <= 300 && <small>Expiring soon. Less than five minutes remaining.</small>}{status === 'EXPIRED' && <small>QR code expired. Please request a new QR code.</small>}{status === 'REVOKED' && <small>This QR was revoked. Generate a new code to continue.</small>}{live && <button className="premium-secondary" onClick={() => { void navigator.clipboard.writeText(`${location.origin}/check-in#${qrToken}`).then(() => setNotice('Category QR link copied.')).catch(() => setError('Clipboard unavailable. Scan the QR instead.')); }}>Copy QR link</button>}</> : <><RefreshCw size={28} strokeWidth={1} /><p>{loading ? 'Restoring category QR…' : 'Generate a QR for this slot.'}</p></>}</div>
    {notice && <p role="status" className="category-qr-feedback">{notice}</p>}{error && <p role="alert" className="premium-error">{error}</p>}
    {qr && <details className="category-qr-history"><summary>Attendance history</summary>{user?.role === 'coach' && <p>Your assigned students appear below.</p>}{qr.recentCheckIns.length ? <ol>{qr.recentCheckIns.map(row => <li key={row.id}><strong>{row.memberName}</strong><span>{row.packageName} · 1 session used</span><time dateTime={row.redeemedAt}>{new Date(row.redeemedAt).toLocaleString('en-GB', { timeZone: 'Asia/Yangon', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></li>)}</ol> : <p>No permitted check-ins to display yet.</p>}</details>}
  </article>;
}
export function QrDesk() {
  const [slots, setSlots] = useState<Slot[]>([{ slot: 1, qr: null }, { slot: 2, qr: null }]), [categories, setCategories] = useState<BadmintonCategory[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const requestId = ++revision.current;
    try { const data = await get<{ slots: Slot[] }>('/check-in/qr'); if (revision.current === requestId) { setSlots(data.slots); setError(''); } }
    catch (e) { if (revision.current === requestId) setError(e instanceof Error ? e.message : 'Could not restore category QRs.'); }
    finally { if (revision.current === requestId) setLoading(false); }
  }, []);
  const invalidate = useCallback(() => { ++revision.current; }, []);
  useEffect(() => {
    let active = true;
    get<BadmintonCategory[]>('/packages/badminton/categories').then(rows => { if (active) setCategories(rows.filter(c => c.active && c.code)); }).catch(e => { if (active) setError(e.message); });
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 5000); window.addEventListener('focus', refresh);
    return () => { active = false; invalidate(); clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [refresh, invalidate]);
  const update = useCallback((slot: number, qr: Qr) => { ++revision.current; setSlots(current => current.map(row => row.slot === slot ? { slot, qr } : row)); }, []);
  return <section className="category-qr-desk" aria-label="Badminton attendance QR generation"><header><p className="premium-kicker">BADMINTON ATTENDANCE</p><h2>Category QR check-in</h2><p>Display two different categories at once. Each code lasts two hours and accepts one check-in per eligible member.</p><small>Both slots are shared by authorized badminton staff. Replacing or revoking a code affects only its own slot.</small></header>{error && <p className="premium-error" role="alert">{error}<button type="button" className="premium-secondary" onClick={() => void refresh()}>Retry</button></p>}<div className="category-qr-grid">{slots.map(row => <QrCard key={row.slot} {...row} options={categories} loading={loading} otherCategory={slots.find(s => s.slot !== row.slot && s.qr?.status === 'ACTIVE' && new Date(s.qr.expiresAt).getTime() > Date.now())?.qr?.categoryCode} onUpdated={update} />)}</div></section>;
}
