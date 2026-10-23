import { useEffect, useState } from 'react';
import { QrCode, RefreshCw } from 'lucide-react';
import { post, del } from '../api';
import './member-premium.css';
export function QrDesk() {
  const [qr, setQr] = useState<{ id: string; expiresAt: string; image: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const generate = async () => {
    setBusy(true); setError(''); setQr(null);
    try {
      const result = await post<{ id: string; token: string; expiresAt: string }>('/check-in/qr', {});
      const { default: QRCode } = await import('qrcode');
      const image = await QRCode.toDataURL(`${location.origin}/check-in#${result.token}`, { width: 420, margin: 3, errorCorrectionLevel: 'M', color: { dark: '#19392b', light: '#ffffff' } });
      setQr({ id: result.id, expiresAt: result.expiresAt, image });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not generate QR code.'); }
    finally { setBusy(false); }
  };
  const revoke = async () => { if (!qr) return; setBusy(true); try { await del(`/check-in/qr/${qr.id}`); setQr(null); } catch (e) { setError(e instanceof Error ? e.message : 'Could not revoke code.'); } finally { setBusy(false); } };
  const seconds = qr ? Math.max(0, Math.floor((new Date(qr.expiresAt).getTime() - now) / 1000)) : 0;
  return <section className="qr-desk">
    <div><p className="premium-kicker">MEMBER ARRIVALS</p><h2>One scan. Ready to play.</h2><p>Display this code at the front desk. Members scan it, confirm their visit, and use one session from their active package.</p><div className="qr-desk-actions"><button className="premium-primary" disabled={busy} onClick={() => void generate()}><QrCode size={16} />{busy ? 'Please wait…' : qr ? 'Generate new code' : 'Generate check-in QR'}</button>{qr && <button className="premium-secondary" disabled={busy} onClick={() => void revoke()}>Revoke code</button>}</div><small>Valid for one hour · One check-in per member per day<br />Generating a new code replaces your previous code.</small>{error && <p role="alert" className="premium-error">{error}</p>}</div>
    <div className="qr-display">{qr && seconds > 0 ? <><img src={qr.image} alt="Badminton member check-in QR code" /><span className="qr-live">LIVE · {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</span><small>Scan with your phone camera</small></> : <><RefreshCw size={28} strokeWidth={1} /><p>{qr ? 'Code expired. Generate a new one.' : 'Your check-in QR will appear here'}</p></>}</div>
  </section>;
}
