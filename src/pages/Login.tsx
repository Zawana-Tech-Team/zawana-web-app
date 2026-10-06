import { useState, type FormEvent } from 'react';
import { AlertCircle, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card } from '../components/UI';
import { Field, AuthShell } from '../components/AuthShell';
import { useAuth } from '../context/AuthContext';

const home = (role: string) => ({ member: '/member', coach: '/coach', doctor: '/doctor', admin: '/admin', owner: '/owner', gym_fo: '/gym-fo', clinic_fo: '/clinic-fo', badminton_fo: '/badminton-fo', store_fo: '/store-fo', cafe_fo: '/cafe' } as Record<string, string>)[role] || '/member';

function GoogleMark() {
  return <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full bg-white text-sm font-black text-[#4285f4]">G</span>;
}

export function Login() {
  const { login, googleLogin, firebaseConfigured, authMode, user, refreshUser, mfaRequired, mfaPhone, sendMfaCode, completeMfa } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const finish = async (result: 'ready' | 'profile' | 'verify' | 'mfa') => {
    setError('');
    if (result === 'profile') navigate('/complete-profile', { replace: true });
    else if (result === 'ready') {
      const account = await refreshUser();
      navigate(home(account?.role || user?.role || 'member'), { replace: true });
    } else if (result === 'mfa') setNotice('Enter the verification code sent to your enrolled phone.');
    else setNotice('Verify your email using the link we sent, then return here to sign in.');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try { await finish(await login(email.trim(), password)); }
    catch (reason: any) { setError(reason.message || 'Sign-in failed. Please try again.'); }
    finally { setBusy(false); }
  };

  const google = async () => {
    setError(''); setNotice(''); setBusy(true);
    try { await finish(await googleLogin()); }
    catch (reason: any) { setError(reason.message || 'Google sign-in failed. Please try again.'); }
    finally { setBusy(false); }
  };

  const verifyMfa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { await finish(await completeMfa(code)); }
    catch (reason: any) { setError(reason.message || 'The verification code could not be verified.'); }
    finally { setBusy(false); }
  };

  return <AuthShell title="Welcome back.">
    <Card className="overflow-hidden shadow-[0_24px_70px_rgba(29,27,71,.08)]">
      <div className="border-b border-zawana-950/8 p-5 sm:p-7">
        <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-zawana-gold/20 text-zawana-950"><LockKeyhole size={20} /></span><div><h2 className="font-black">Sign in to Zawana</h2><p className="mt-1 text-sm text-zawana-500">Access your bookings, coaching, and membership.</p></div></div>
      </div>
      <div className="space-y-5 p-5 sm:p-7">
        {!firebaseConfigured && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Authentication is not configured. Check the frontend authentication settings, then restart the frontend.</p>}
        {error && <div role="alert" aria-live="assertive" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-800"><AlertCircle size={17} className="mt-0.5 shrink-0" /><p>{error}</p></div>}
        {notice && <p role="status" aria-live="polite" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

        {!mfaRequired && <>
          {authMode==='firebase'&&<><Button type="button" variant="secondary" className="w-full gap-3" disabled={busy || !firebaseConfigured} onClick={() => void google()}><GoogleMark />Continue with Google</Button>
          <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-widest text-zawana-400"><span className="h-px flex-1 bg-zawana-950/10" />Or with email<span className="h-px flex-1 bg-zawana-950/10" /></div></>}
          <form onSubmit={submit} className="space-y-4">
            <Field label={authMode==='database'?'Username':'Email address'}><input autoComplete={authMode==='database'?'username':'email'} autoCapitalize="none" spellCheck={false} required type={authMode==='database'?'text':'email'} value={email} onChange={event => setEmail(event.target.value)} placeholder={authMode==='database'?'e.g. admin':'you@example.com'} /></Field>
            <Field label="Password"><span className="relative block"><input className="w-full pr-12" autoComplete="current-password" required type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="Your password" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="absolute inset-y-0 right-2 grid w-10 place-items-center rounded-full text-zawana-500 hover:bg-zawana-950/5" onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></Field>
            <div className="flex justify-end">{authMode==='firebase'?<Link className="min-h-8 inline-flex items-center text-sm font-bold text-zawana-accent" to="/forgot-password">Forgot password?</Link>:<span className="text-xs text-zawana-500">Ask an administrator to reset a database password.</span>}</div>
            <Button className="w-full" disabled={busy || !firebaseConfigured}>{busy ? 'Signing in…' : 'Sign in'}</Button>
          </form>
        </>}

        {mfaRequired && <form onSubmit={verifyMfa} className="space-y-4" aria-label="Two-factor challenge">
          <div className="flex gap-3 rounded-2xl bg-zawana-950/[.035] p-4"><ShieldCheck size={20} className="shrink-0" /><div><h2 className="font-black">Verify it’s you</h2><p className="mt-1 text-sm leading-5 text-zawana-500">A second step is required for this staff account. Send a code to {mfaPhone || 'your enrolled phone'}.</p></div></div>
          <Button type="button" variant="secondary" className="w-full" disabled={busy} onClick={() => void sendMfaCode().then(() => setNotice('A sign-in code was sent.')).catch((reason: any) => setError(reason.message || 'Could not send the verification code.'))}>Send verification code</Button>
          <Field label="Verification code"><input inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={10} value={code} onChange={event => setCode(event.target.value)} placeholder="Enter your code" /></Field>
          <Button type="submit" className="w-full" disabled={busy || !code.trim()}>{busy ? 'Verifying…' : 'Verify and sign in'}</Button>
          <div id="zawana-signin-recaptcha" className="absolute h-0 overflow-hidden" aria-hidden="true" />
        </form>}

        <details className="rounded-xl border border-zawana-950/8 bg-zawana-950/[.02] p-3 text-xs leading-5 text-zawana-500">
          <summary className="cursor-pointer font-bold text-zawana-700">Using a local demo account?</summary>
          <p className="mt-2">{authMode==='database'?'Sign in with the username (the part before @ in the database email) and password saved in the Zawana database.':'Seeded Zawana profiles are database records; their password is not automatically a Firebase password.'}</p>
        </details>
        <p className="text-center text-sm text-zawana-500">New to Zawana? <Link className="font-bold text-zawana-950" to="/signup">Create an account</Link></p>
        <p className="flex items-center justify-center gap-2 text-[11px] text-zawana-400"><Badge><ShieldCheck size={12} /> Secure sign-in</Badge>Your account details stay protected.</p>
      </div>
    </Card>
  </AuthShell>;
}
