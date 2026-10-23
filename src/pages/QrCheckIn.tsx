import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type QrScanner from 'qr-scanner';
import { Camera, Check, QrCode, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { post } from '../api';
import '../components/member-premium.css';
const key = 'zawana_pending_checkin';
function parse(value: string) {
  const input = value.trim();
  if (/^[A-Za-z0-9_-]{43}$/.test(input)) return input;
  const url = new URL(input);
  if (url.origin !== location.origin || url.pathname !== '/check-in' || !/^[A-Za-z0-9_-]{43}$/.test(url.hash.slice(1))) throw new Error('Scan a Zawana front desk check-in QR code.');
  return url.hash.slice(1);
}
export default function QrCheckIn() {
  const { user, loading } = useAuth();
  const [token, setToken] = useState(() => location.hash.slice(1) || sessionStorage.getItem(key) || '');
  const [camera, setCamera] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<{ enrollment: { packageName: string; sessionsRemaining: number } } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (token) sessionStorage.setItem(key, token); if (location.hash) history.replaceState(null, '', location.pathname); }, [token]);
  const accept = useCallback((value: string) => { try { setToken(parse(value)); setCamera(false); setError(''); } catch { setError('Scan a Zawana front desk check-in QR code.'); } }, []);
  useEffect(() => {
    if (!camera || !video.current) return;
    let scanner: QrScanner | undefined, cancelled = false;
    void import('qr-scanner').then(async ({ default: Scanner }) => {
      if (cancelled || !video.current) return;
      scanner = new Scanner(video.current, value => accept(value.data), { preferredCamera: 'environment', returnDetailedScanResult: true });
      try { await scanner.start(); if (cancelled) scanner.destroy(); } catch { scanner.destroy(); if (!cancelled) { setCamera(false); setError('Camera unavailable. Allow camera access, upload a QR photo, or scan with your phone camera.'); } }
    }).catch(() => { if (!cancelled) { setCamera(false); setError('Scanner could not load. Please retry.'); } });
    return () => { cancelled = true; scanner?.destroy(); };
  }, [camera, accept]);
  const confirm = async () => {
    setBusy(true); setError('');
    try { const data = await post<{ enrollment: { packageName: string; sessionsRemaining: number } }>('/check-in/scan', { token: parse(token) }); setResult(data); sessionStorage.removeItem(key); setToken(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Check-in failed.'); }
    finally { setBusy(false); }
  };
  return <main className="qr-member"><Link to="/member" className="premium-back">← Back to your workspace</Link><section className="qr-member-card"><span className="qr-icon"><QrCode size={26} strokeWidth={1.5} /></span><p className="premium-kicker">BADMINTON · CHECK-IN</p><h1>{result ? 'You’re checked in.' : 'Your next session starts here.'}</h1>
    {loading ? <p role="status">Loading your account…</p> : !user ? <><p>Sign in to check in with the front desk QR code.</p><Link className="premium-primary" to="/login">Sign in to continue</Link></> : user.role !== 'member' ? <p>Use your member account to scan a check-in code.</p> : result ? <div role="status"><Check size={32} /><h2>{result.enrollment.packageName}</h2><p>One session used · {result.enrollment.sessionsRemaining} remaining.</p><Link className="premium-primary" to="/attendance">View attendance</Link></div> : <><p>Scan the code displayed at the front desk. We’ll use your eligible active package that expires soonest.</p>{camera && <video ref={video} className="qr-video" muted playsInline />}{token ? <div className="qr-confirm"><span className="qr-live">QR CODE CAPTURED</span><p>Confirm to deduct one session. Duplicate check-ins today will not deduct another session.</p><button className="premium-primary" disabled={busy} onClick={() => void confirm()}>{busy ? 'Checking in…' : 'Confirm check-in'}</button><button className="premium-secondary" disabled={busy} onClick={() => { setToken(''); sessionStorage.removeItem(key); }}>Scan another code</button></div> : <div className="qr-scan-actions"><button className="premium-primary" onClick={() => setCamera(v => !v)}><Camera size={17} />{camera ? 'Stop camera' : 'Scan front desk QR'}</button><label className="premium-secondary"><Upload size={16} />Upload QR photo<input aria-label="Upload QR photo" className="sr-only" type="file" accept="image/*" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { const { default: Scanner } = await import('qr-scanner'); accept((await Scanner.scanImage(file, { returnDetailedScanResult: true })).data); } catch { setError('No valid QR code found in this image.'); } e.target.value = ''; }} /></label></div>}</>}{error && <p className="premium-error" role="alert">{error}</p>}</section></main>;
}
