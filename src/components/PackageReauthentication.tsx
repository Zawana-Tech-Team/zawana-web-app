import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EmailAuthProvider, GoogleAuthProvider, OAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup } from 'firebase/auth';
import { firebaseAuth } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Button } from './UI';
import { registerPackageVerifier, type PackageProof } from '../services/packageReauthentication';
type Pending = { resolve: (proof: PackageProof) => void; reject: (error: Error) => void };
export function PackageReauthentication() {
  const { authMode } = useAuth();
  const [pending, setPending] = useState<Pending | null>(null), [password, setPassword] = useState(''), [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const pendingRef = useRef<Pending | null>(null);
  useEffect(() => {
    const unregister = registerPackageVerifier(() => new Promise((resolve, reject) => {
      if (pendingRef.current) { reject(new Error('Finish the pending package verification first.')); return; }
      const request = { resolve, reject };
      pendingRef.current = request; setError(''); setPassword(''); setPending(request);
    }));
    return () => { unregister(); pendingRef.current?.reject(new Error('Package verification closed.')); pendingRef.current = null; };
  }, []);
  useEffect(() => {
    if (!pending) return;
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, [pending]);
  const provider = firebaseAuth?.currentUser?.providerData.find(p => p.providerId === 'password') ? 'password' : firebaseAuth?.currentUser?.providerData[0]?.providerId;
  const federated = authMode !== 'database' && provider !== 'password';
  const cancel = () => { if (busy) return; pending?.reject(new Error('Package save cancelled.')); setPassword(''); pendingRef.current = null; setPending(null); };
  const confirm = async () => {
    if (!pending) return;
    setBusy(true); setError('');
    try {
      let proof: PackageProof;
      if (authMode === 'database') proof = { password };
      else {
        const user = firebaseAuth?.currentUser;
        if (!user) throw new Error('Sign in again to verify this account.');
        if (provider === 'password' && user.email) await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
        else if (provider === 'google.com') await reauthenticateWithPopup(user, new GoogleAuthProvider());
        else if (provider && provider !== 'phone') await reauthenticateWithPopup(user, new OAuthProvider(provider));
        else throw new Error('Sign in again with your supported account provider before editing packages.');
        proof = { identityToken: await user.getIdToken(true) };
      }
      pending.resolve(proof); pendingRef.current = null; setPending(null); setPassword('');
    } catch { setError('Account verification failed. Please try again.'); }
    finally { setBusy(false); }
  };
  if (!pending) return null;
  return createPortal(<dialog ref={dialog} onCancel={event => { event.preventDefault(); cancel(); }} className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-zawana-border bg-white p-6 text-zawana-950 shadow-xl backdrop:bg-black/40" aria-labelledby="package-verification-title"><form onSubmit={event => { event.preventDefault(); void confirm(); }}>
    <ShieldCheck size={26} strokeWidth={1.5} /><h2 id="package-verification-title" className="mt-4 text-xl font-semibold">Confirm package changes</h2><p className="mt-2 text-sm text-zawana-500">Verify your own account to save the package configuration.</p>
    {!federated && <label className="mt-5 block text-sm">Current password<div className="mt-2 flex items-center gap-2"><input autoFocus autoComplete="current-password" required disabled={busy} type={visible ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="min-w-0 flex-1" /><button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<div className="mt-6 flex justify-end gap-3"><Button type="button" variant="secondary" disabled={busy} onClick={cancel}>Cancel</Button><Button type="submit" loading={busy}>{federated ? 'Verify with sign-in provider' : 'Verify and save'}</Button></div>
  </form></dialog>, document.body);
}
