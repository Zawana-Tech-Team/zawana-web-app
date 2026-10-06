import { useState, type FormEvent } from 'react';
import { AlertCircle, Eye, EyeOff, UserRoundPlus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card } from '../components/UI';
import { Field, AuthShell } from '../components/AuthShell';
import { useAuth } from '../context/AuthContext';

const home = (role: string) => ({ member: '/member', coach: '/coach', doctor: '/doctor', admin: '/admin', owner: '/owner', gym_fo: '/gym-fo', clinic_fo: '/clinic-fo', badminton_fo: '/badminton-fo', store_fo: '/store-fo', cafe_fo: '/cafe' } as Record<string, string>)[role] || '/member';

export function Signup() {
  const { signup, googleLogin, checkVerification, resendVerification, refreshUser, firebaseConfigured, authMode, pendingProfile, user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const routeAfterSignIn = async (result: 'ready' | 'profile' | 'verify' | 'mfa') => {
    if (result === 'profile') navigate('/complete-profile', { replace: true });
    else if (result === 'ready') {
      const account = await refreshUser();
      navigate(home(account?.role || user?.role || 'member'), { replace: true });
    } else if (result === 'mfa') navigate('/login', { replace: true });
    else { setNotice('Verify your email using the link we sent, then sign in.'); setSent(true); }
  };

  const google = async () => {
    setBusy(true); setError(''); setNotice('');
    try { await routeAfterSignIn(await googleLogin()); }
    catch (reason: any) { setError(reason.message || 'Google sign-up failed. Please try again.'); }
    finally { setBusy(false); }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setNotice('');
    if (password.length < 8) { setError('Use at least 8 characters for your password.'); return; }
    if (password !== confirm) { setError('The passwords do not match.'); return; }
    const phoneDigits = phone.replace(/[\s().-]/g, '');
    if (!/^\+?\d{7,15}$/.test(phoneDigits)) { setError('Enter a valid phone number, including the country code where needed.'); return; }
    setBusy(true);
    try { const result=await signup(name.trim(), email.trim().toLowerCase(), phone.trim(), password); if(authMode==='database')await routeAfterSignIn(result); else setSent(true); }
    catch (reason: any) { setError(reason.message || 'Could not create your account. Please try again.'); }
    finally { setBusy(false); }
  };

  const verified = async () => {
    setBusy(true); setError(''); setNotice('');
    try { await routeAfterSignIn(await checkVerification()); }
    catch (reason: any) { setError(reason.message || 'Email verification is not complete yet.'); }
    finally { setBusy(false); }
  };

  const resend = async () => {
    setResending(true); setError(''); setNotice('');
    try { await resendVerification(); setNotice('A fresh verification link has been sent.'); }
    catch (reason: any) { setError(reason.message || 'Could not resend the verification email.'); }
    finally { setResending(false); }
  };

  return <AuthShell title={sent ? 'Check your inbox.' : 'Join Zawana.'}>
    <Card className="overflow-hidden shadow-[0_24px_70px_rgba(29,27,71,.08)]">
      <div className="flex items-center gap-3 border-b border-zawana-950/8 p-5 sm:p-7"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-zawana-gold/20"><UserRoundPlus size={20} /></span><div><h2 className="font-black">{sent ? 'Verify your email' : 'Create your account'}</h2><p className="mt-1 text-sm text-zawana-500">{sent ? 'One quick step before you can get started.' : 'Book courts, find a coach, and manage your sessions.'}</p></div></div>
      <div className="space-y-5 p-5 sm:p-7">
        {!firebaseConfigured && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Firebase sign-up is not configured. Add the frontend `VITE_FIREBASE_*` settings, then restart the frontend.</p>}
        {error && <div role="alert" aria-live="assertive" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-800"><AlertCircle size={17} className="mt-0.5 shrink-0" /><p>{error}</p></div>}
        {notice && <p role="status" aria-live="polite" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

        {sent ? <div className="space-y-4">
          <div className="rounded-2xl bg-zawana-950/[.035] p-4"><p className="text-sm leading-6 text-zawana-600">We sent a verification link to <b className="break-all text-zawana-950">{pendingProfile?.email || email}</b>. Open that link, return here, then select “I’ve verified my email.”</p></div>
          <Button className="w-full" disabled={busy} onClick={() => void verified()}>{busy ? 'Checking verification…' : 'I’ve verified my email'}</Button>
          <Button type="button" variant="secondary" className="w-full" disabled={busy || resending} onClick={() => void resend()}>{resending ? 'Sending…' : 'Resend verification link'}</Button>
          <p className="text-center text-xs text-zawana-500">Check your spam folder if the email does not arrive.</p>
        </div> : <>
          {authMode==='firebase'&&<><Button type="button" variant="secondary" className="w-full gap-3" disabled={busy || !firebaseConfigured} onClick={() => void google()}><span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full bg-white text-sm font-black text-[#4285f4]">G</span>Continue with Google</Button>
          <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-widest text-zawana-400"><span className="h-px flex-1 bg-zawana-950/10" />Or with email<span className="h-px flex-1 bg-zawana-950/10" /></div></>}
          <form onSubmit={submit} className="space-y-4">
            <Field label="Full name"><input autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="Your name" /></Field>
            <Field label="Email address"><input autoComplete="email" autoCapitalize="none" spellCheck={false} required type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></Field>
            <Field label="Phone number"><input autoComplete="tel" required type="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+95…" /></Field>
            <Field label="Password"><span className="relative block"><input className="w-full pr-12" autoComplete="new-password" required minLength={8} type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 8 characters" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="absolute inset-y-0 right-2 grid w-10 place-items-center rounded-full text-zawana-500 hover:bg-zawana-950/5" onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span><span className="mt-1 block text-xs font-normal text-zawana-500">Use 8 or more characters.</span></Field>
            <Field label="Confirm password"><span className="relative block"><input className="w-full pr-12" autoComplete="new-password" required minLength={8} type={showConfirm ? 'text' : 'password'} value={confirm} onChange={event => setConfirm(event.target.value)} placeholder="Enter it again" /><button type="button" aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'} aria-pressed={showConfirm} className="absolute inset-y-0 right-2 grid w-10 place-items-center rounded-full text-zawana-500 hover:bg-zawana-950/5" onClick={() => setShowConfirm(value => !value)}>{showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></Field>
            <Button className="w-full" disabled={busy || (authMode==='firebase'&&!firebaseConfigured)}>{busy ? 'Creating account…' : 'Create account'}</Button>
          </form>
          <p className="text-center text-sm text-zawana-500">Already have an account? <Link className="font-bold text-zawana-950" to="/login">Sign in</Link></p>
        </>}
      </div>
    </Card>
  </AuthShell>;
}
