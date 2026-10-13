import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { applyActionCode, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { Button, Card } from '../components/UI';
import { AuthShell, Field } from '../components/AuthShell';
import { useAuth } from '../context/AuthContext';
import { firebaseAuth } from '../services/firebase';

const home = (role: string) =>
  ({
      member: '/member',
      coach: '/coach',
      doctor: '/doctor',
      admin: '/admin',
      owner: '/owner',
      gym_fo: '/gym-fo',
      clinic_fo: '/clinic-fo',
      badminton_fo: '/badminton-fo',
      store_fo: '/store-fo',
      cafe_fo: '/cafe'
    } as Record<string, string>
  )[role] || '/member';

export function CompleteProfile() {
  const { pendingProfile, completeProfile, user } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState(pendingProfile?.name || '');
  const [phone, setPhone] = useState(pendingProfile?.phone || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (user) nav(home(user.role), { replace: true })
  }, [user, nav]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await completeProfile(name, phone);
      nav(home(result.role), { replace: true })
    } catch (e: any) {
      setError(e.message || 'Could not save your profile.')
    } finally {
      setBusy(false)
    }
  };
  return <AuthShell title="Complete your profile.">
    <Card className="p-5">
      <p className="mb-5 text-sm leading-6 text-zawana-500">A phone number is required for bookings and account support. This account will be created as a member unless this verified email already belongs to a provisioned Zawana account.</p>
      {pendingProfile?.avatar &&
        <img
          src={pendingProfile.avatar}
          alt="Profile"
          className="mb-4 h-16 w-16 rounded-2xl object-cover"
        />}
      <form onSubmit={e => void submit(e)} className="space-y-4">
        <Field label="Name">
          <input
            required
            minLength={2}
            maxLength={100}
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </Field>
        <Field label="Email">
          <input readOnly value={pendingProfile?.email || ''} className="opacity-70" />
        </Field>
        <Field label="Phone number">
          <input
            required
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+95…"
          />
        </Field>
        {error &&
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>}
        <Button className="w-full" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile and continue'}
        </Button>
      </form>
    </Card>
  </AuthShell>;
}

export function ForgotPassword() {
  const { sendPasswordReset, authMode } = useAuth();
  const [params] = useSearchParams();
  const code = params.get('oobCode');
  const mode = params.get('mode');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ready, setReady] = useState(!code);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (mode === 'resetPassword' && code && firebaseAuth) {
      void verifyPasswordResetCode(firebaseAuth, code)
        .then(() => setReady(true))
        .catch(() => {
          setError('This password reset link is invalid or has expired. Request a new one.');
          setReady(false)
        })
    }
  }, [mode, code]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'resetPassword' && code) {
        if (password.length < 8 || password !== confirm)
          throw new Error('Enter matching passwords with at least 8 characters.');
        await confirmPasswordReset(firebaseAuth!, code, password);
        setMessage('Your password was updated. You can now sign in.')
      } else {
        await sendPasswordReset(email);
        setMessage(
          'If an account can be recovered with that email, Firebase will send a password reset link.'
        )
      }
    } catch (e: any) {
      setError(e.message || 'Could not complete the password request.')
    } finally {
      setBusy(false)
    }
  };
  if (authMode === 'database')
    return <AuthShell title="Password help.">
      <div className="space-y-4">
        <p className="rounded-xl bg-zawana-950/[.035] p-4 text-sm leading-6 text-zawana-600">This app signs in with database accounts, so Firebase reset links do not apply. Ask an administrator to reset your Zawana database password.</p>
        <Link className="block text-center text-sm font-bold text-zawana-950" to="/login">Back to sign in</Link>
      </div>
    </AuthShell>;
  return <AuthShell title={mode === 'resetPassword' ? 'Choose a new password.' : 'Reset your password.'}>
    <form onSubmit={e => void submit(e)} className="space-y-4">
      {mode === 'resetPassword' && code ?
        <>
          {ready &&
            <>
              <Field label="New password">
                <input
                  required
                  minLength={8}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </Field>
              <Field label="Confirm new password">
                <input
                  required
                  minLength={8}
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                />
              </Field>
            </>}
        </> :
        <Field label="Account email">
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </Field>}
      {error &&
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>}
      {message &&
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          {message}
        </p>}
      {(ready || mode !== 'resetPassword') &&
        <Button className="w-full" disabled={busy}>
          {busy
            ? 'Please wait…'
            : mode === 'resetPassword'
              ? 'Update password'
              : 'Send reset link'}
        </Button>}
      {mode === 'resetPassword' && code && !ready &&
        <Link
          className="block text-center text-sm font-bold text-zawana-accent"
          to="/forgot-password"
        >Request a new reset link</Link>}
      <Link className="block text-center text-sm font-bold text-zawana-950" to="/login">Back to sign in</Link>
    </form>
  </AuthShell>;
}

export function AuthAction() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { checkVerification, user } = useAuth();
  const mode = params.get('mode');
  const code = params.get('oobCode');
  const [message, setMessage] = useState('Checking the secure link…');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!code || mode !== 'verifyEmail' || !firebaseAuth) {
      setMessage('This email link is invalid or has expired.');
      return;
    }
    void applyActionCode(firebaseAuth, code)
      .then(async () => {
        setMessage('Email verified.');
        try {
          const status = await checkVerification();
          if (status === 'profile') nav('/complete-profile', { replace: true });
          else if (status === 'ready') nav(home(user?.role || 'member'), { replace: true });
        } catch {
          /* Keep the verified state and let the user continue from sign-in. */
        }
      })
      .catch(() => {
        setError('This email verification link is invalid or has expired.');
        setMessage('Email could not be verified.');
      });
  }, [code, mode, checkVerification, nav, user]);
  return <AuthShell title="Email verification.">
    <div className="space-y-4">
      <p
        role={error ? 'alert' : 'status'}
        className={`rounded-xl p-4 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}
      >
        {error || message}
      </p>
      <Link to="/login">
        <Button className="w-full">Continue to sign in</Button>
      </Link>
    </div>
  </AuthShell>;
}
