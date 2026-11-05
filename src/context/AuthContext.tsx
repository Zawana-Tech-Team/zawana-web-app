import { createFirebaseSessionExchange } from '../services/firebaseSession';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile as updateFirebaseProfile,
  getMultiFactorResolver,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  type MultiFactorResolver,
  type User as FirebaseUser,
} from 'firebase/auth';
import type { User } from '../types';
import { api, get, post, patch, setToken, getToken, type AuthResponse } from '../api';
import {
  firebaseAuth,
  firebaseConfigured,
  firebaseReady,
  googleProvider
} from '../services/firebase';
import { databaseAuthMode } from '../services/authMode';

type ProfileDraft = { name: string; email: string; avatar: string | null; phone?: string };
type SignInResult = 'ready' | 'profile' | 'verify' | 'mfa';
type Ctx = {
  user: User | null;
  loading: boolean;
  firebaseConfigured: boolean;
  authMode: 'database' | 'firebase';
  pendingProfile: ProfileDraft | null;
  verificationEmail: string;
  mfaRequired: boolean;
  mfaPhone: string;
  sendMfaCode: () => Promise<void>;
  completeMfa: (code: string) => Promise<SignInResult>;
  login: (email: string, password: string) => Promise<SignInResult>;
  googleLogin: () => Promise<SignInResult>;
  signup: (name: string, email: string, phone: string, password: string) => Promise<SignInResult>;
  checkVerification: () => Promise<SignInResult>;
  resendVerification: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  completeProfile: (name: string, phone: string) => Promise<User>;
  updateProfile: (changes: { name?: string; phone?: string | null }) => Promise<User>;
  updateAvatar: (image: string) => Promise<string>;
  logout: () => Promise<void>;
  refreshUser: (options?: { cached?: boolean }) => Promise<User | null>;
  sessionError: string;
  canRetrySession: boolean;
  retrySession: () => Promise<SignInResult>;
};

const C = createContext<Ctx | null>(null);
const firebaseMessage = (error: any) => {
  const known: Record<string, string> = {
    'auth/invalid-credential':
      'Firebase did not accept this email and password. If an Admin created this account before automatic Firebase linking was enabled, ask them to edit it in Users and save a new password. Otherwise use Forgot password and check that you are signing into the right Firebase project.',
    'auth/user-not-found':
      'No Firebase login exists for this email. For an older Admin-created account, ask an Admin to edit it in Users and save a new password to link its login.',
    'auth/wrong-password':
      'Firebase did not accept this password. Use Forgot password, or ask an Admin to edit this older account in Users and save a new password to link its login.',
    'auth/email-already-in-use':
      'An account with this email already exists. Sign in or reset your password.',
    'auth/operation-not-allowed':
      'The selected sign-in provider is disabled for this Firebase project. Enable it under Firebase Authentication → Sign-in method.',
    'auth/user-disabled':
      'This account has been disabled. Contact an administrator to restore access.',
    'auth/internal-error':
      'Firebase encountered an internal sign-in error (auth/internal-error). Try again. If it persists, share the failed Identity Toolkit request’s response error code with an administrator.',
    'auth/invalid-login-credentials':
      'The email or password was not accepted. Check your details or use Forgot password.',
    'auth/invalid-oauth-client-id':
      'Google sign-in has an invalid OAuth client configuration. Ask an administrator to check the Google provider’s Web SDK configuration in Firebase Authentication.',
    'auth/invalid-idp-response':
      'Firebase could not accept the sign-in provider’s response. Retry sign-in; if it persists, ask an administrator to check the provider’s OAuth configuration.',
    'auth/configuration-not-found':
      'Firebase Authentication is not configured for this project yet. Enable Email/Password under Firebase Console → Authentication → Sign-in method.',
    'auth/invalid-api-key':
      'The Firebase web API key is invalid. Copy the web app configuration from the same Firebase project and restart the frontend.',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      'The Firebase web API key is invalid. Copy the web app configuration from the same Firebase project and restart the frontend.',
    'auth/unauthorized-domain':
      'This site is not authorized for Firebase sign-in. Add its hostname under Firebase Authentication → Settings → Authorized domains.',
    'auth/weak-password': 'Choose a password with at least 8 characters.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
    'auth/popup-blocked':
      'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
    'auth/cancelled-popup-request':
      'A Google sign-in window is already open. Finish it or close it before retrying.',
    'auth/account-exists-with-different-credential':
      'This email already uses another sign-in method. Sign in with that method first, then link Google from account settings.',
    'auth/too-many-requests': 'Too many attempts. Wait a little and try again.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
  };
  const code = String(error?.code || '').toLowerCase();
  if (known[code]) return known[code];
  if (code === 'auth/invalid-api-key' || code.includes('api-key-not-valid'))
    return 'The Firebase web API key is invalid. Copy the web app configuration from the same Firebase project and restart the frontend.';
  const message = String(error?.message || '');
  if (code.startsWith('auth/') || message.startsWith('Firebase: Error')) {
    // Keep the diagnostic code without exposing provider responses or account data.
    const diagnosticCode = /^auth\/[a-z0-9.-]+$/.test(code) ? ` (${code})` : '';
    return `Firebase could not complete sign-in${diagnosticCode}. Try again. If it persists, share this code and the failed Identity Toolkit request’s response error code with an administrator.`;
  }
  return message || 'Authentication could not be completed. Please try again.';
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingProfile, setPendingProfile] = useState<ProfileDraft | null>(null);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [mfaVerificationId, setMfaVerificationId] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [canRetrySession, setCanRetrySession] = useState(false);
  const accountRef = useRef<User | null>(null);
  const sessionOwner = useRef<string | null>(null);
  const exchangeRef = useRef<ReturnType<typeof createFirebaseSessionExchange> | null>(null);
  if (!exchangeRef.current) exchangeRef.current = createFirebaseSessionExchange((token, signal) => api<AuthResponse>('/auth/session', {
    method: 'POST', body: '{}', signal, headers: { Authorization: `Bearer ${token}` }
  }), () => firebaseAuth?.currentUser?.uid);
  const reportSessionError = useCallback((error: any) => {
    if (error?.code === 'SESSION_EXCHANGE_SUPERSEDED') return;
    setSessionError(firebaseMessage(error));
    setCanRetrySession(!!firebaseAuth?.currentUser && (error?.retryable === true || error?.details?.retryable === true || error?.code === 'AUTH_UNAVAILABLE' || (!error?.code && [502, 503, 504].includes(error?.status)) || error instanceof TypeError || ['AbortError', 'TimeoutError'].includes(error?.name)));
  }, []);

  const syncFirebaseUser = useCallback(async (fb: FirebaseUser): Promise<SignInResult> => {
    if (!fb.emailVerified) {
      setVerificationEmail(fb.email || '');
      return 'verify';
    }
    if (sessionOwner.current === fb.uid && getToken() && accountRef.current) return 'ready';
    try {
      const result = await exchangeRef.current!.exchange(fb);
      sessionOwner.current = fb.uid; accountRef.current = result.user;
      setToken(result.accessToken || result.token); setUser(result.user);
      setPendingProfile(null); setVerificationEmail(''); setSessionError(''); setCanRetrySession(false);
      return 'ready';
    } catch (error: any) {
      if (error?.status === 428) {
        setUser(null); accountRef.current = null;
        setPendingProfile(error.details?.profile || { name: fb.displayName || '', email: fb.email || '', avatar: fb.photoURL });
        return 'profile';
      }
      reportSessionError(error); throw error;
    }
  }, [reportSessionError]);

  useEffect(() => {
    if (databaseAuthMode) {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      void get<User>('/auth/me')
        .then(result => setUser(result))
        .catch(() => {
          setToken(null);
          setUser(null)
        })
        .finally(() => setLoading(false));
      return;
    }
    if (!firebaseAuth) {
      setLoading(false);
      return;
    }
    let alive = true, version = 0;
    let unsubscribe: (() => void) | undefined;
    void firebaseReady.then(() => {
      if (!alive) return;
      unsubscribe = onAuthStateChanged(firebaseAuth!, async fb => {
        const currentVersion = ++version;
        if (!alive) return;
        if (!fb) {
          exchangeRef.current?.cancel(); sessionOwner.current = null; accountRef.current = null;
          setToken(null); setUser(null); setPendingProfile(null); setVerificationEmail(''); setSessionError(''); setCanRetrySession(false); setLoading(false);
          return;
        }
        try {
          if (!fb.emailVerified) { setVerificationEmail(fb.email || ''); return; }
          if (getToken() && sessionOwner.current !== fb.uid) {
            try {
              const restored = await api<User & { authenticatedFirebaseUids?: string[] }>('/auth/me', { signal: AbortSignal.timeout(25000) });
              if (!alive || version !== currentVersion || firebaseAuth?.currentUser?.uid !== fb.uid) return;
              if (sessionOwner.current === fb.uid && accountRef.current && getToken()) return;
              if (restored.authenticatedFirebaseUids?.includes(fb.uid)) {
                sessionOwner.current = fb.uid; accountRef.current = restored; setUser(restored); setSessionError(''); setCanRetrySession(false); return;
              }
              setToken(null);
            } catch (error: any) {
              if (sessionOwner.current === fb.uid && accountRef.current && getToken()) return;
              if (error?.status !== 401) throw error;
              setToken(null);
            }
          }
          await syncFirebaseUser(fb);
        } catch (error) {
          if (alive && version === currentVersion && !(sessionOwner.current === fb.uid && accountRef.current && getToken())) { reportSessionError(error); setUser(null); }
        } finally { if (alive && version === currentVersion) setLoading(false); }
      });
    }).catch(error => { if (alive) { reportSessionError(error); setLoading(false); } });
    return () => { alive = false; ++version; unsubscribe?.(); exchangeRef.current?.cancel(); };
  }, [syncFirebaseUser, reportSessionError]);

  const login = async (email: string, password: string): Promise<SignInResult> => {
    if (databaseAuthMode) {
      const result = await post<{ user: User; token: string }>('/auth/login', {
        username: email.trim(),
        password
      });
      accountRef.current = result.user;
      setToken(result.token);
      setUser(result.user);
      setPendingProfile(null);
      return 'ready';
    }
    if (!firebaseAuth)
      throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values and reload.');
    await firebaseReady;
    try {
      const credential = await signInWithEmailAndPassword(
        firebaseAuth,
        email.trim().toLowerCase(),
        password
      );
      return await syncFirebaseUser(credential.user);
    } catch (error: any) {
      if (error?.status === 428) return 'profile';
      if (error?.code === 'auth/multi-factor-auth-required') {
        setMfaResolver(getMultiFactorResolver(firebaseAuth!, error));
        setMfaVerificationId('');
        return 'mfa';
      }
      throw new Error(firebaseMessage(error));
    }
  };
  const googleLogin = async (): Promise<SignInResult> => {
    if (databaseAuthMode)
      throw new Error('Google sign-in is disabled while database authentication is selected.');
    if (!firebaseAuth)
      throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values and reload.');
    await firebaseReady;
    try {
      const credential = await signInWithPopup(firebaseAuth, googleProvider);
      return await syncFirebaseUser(credential.user);
    } catch (error: any) {
      if (error?.status === 428) return 'profile';
      if (error?.code === 'auth/multi-factor-auth-required') {
        setMfaResolver(getMultiFactorResolver(firebaseAuth!, error));
        setMfaVerificationId('');
        return 'mfa';
      }
      throw new Error(firebaseMessage(error));
    }
  };
  const sendMfaCode = async () => {
    if (!firebaseAuth || !mfaResolver)
      throw new Error('Restart sign-in to request a verification code.');
    const hint = mfaResolver.hints.find(
      item => item.factorId === PhoneMultiFactorGenerator.FACTOR_ID
    );
    if (!hint)
      throw new Error(
        'This account has no supported phone factor. Contact an administrator to recover access.'
      );
    const verifier = new RecaptchaVerifier(firebaseAuth, 'zawana-signin-recaptcha', {
      size: 'invisible'
    });
    const verificationId = await new PhoneAuthProvider(firebaseAuth).verifyPhoneNumber(
      { multiFactorHint: hint, session: mfaResolver.session },
      verifier
    );
    setMfaVerificationId(verificationId);
  };
  const completeMfa = async (code: string): Promise<SignInResult> => {
    if (!mfaResolver || !mfaVerificationId) throw new Error('Request a verification code first.');
    const credential = PhoneAuthProvider.credential(mfaVerificationId, code.trim());
    const result = await mfaResolver.resolveSignIn(PhoneMultiFactorGenerator.assertion(credential));
    setMfaResolver(null);
    setMfaVerificationId('');
    return syncFirebaseUser(result.user);
  };
  const signup = async (
    name: string,
    email: string,
    phone: string,
    password: string
  ): Promise<SignInResult> => {
    if (databaseAuthMode) {
      const result = await post<{ user: User; token: string }>('/auth/register', {
        name,
        email: email.trim().toLowerCase(),
        phone,
        password
      });
      accountRef.current = result.user;
      setToken(result.token);
      setUser(result.user);
      setPendingProfile(null);
      return 'ready';
    }
    if (!firebaseAuth)
      throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values and reload.');
    await firebaseReady;
    try {
      const credential = await createUserWithEmailAndPassword(
        firebaseAuth,
        email.trim().toLowerCase(),
        password
      );
      await updateFirebaseProfile(credential.user, { displayName: name.trim() });
      await sendEmailVerification(credential.user, {
        url: `${window.location.origin}/auth/action`
      });
      setVerificationEmail(credential.user.email || email);
      setPendingProfile({
        name: name.trim(),
        email: credential.user.email || email,
        phone: phone.trim(),
        avatar: credential.user.photoURL
      });
      return 'verify';
    } catch (error: any) {
      throw new Error(firebaseMessage(error));
    }
  };
  const checkVerification = async (): Promise<SignInResult> => {
    if (databaseAuthMode)
      throw new Error(
        'Database accounts do not use email verification. Sign in with your username and password.'
      );
    const fb = firebaseAuth?.currentUser;
    if (!fb) throw new Error('Sign in again after verifying your email.');
    await fb.reload();
    const fresh = firebaseAuth!.currentUser!;
    if (!fresh.emailVerified)
      throw new Error(
        'Email verification is not complete yet. Open the latest verification email and try again.'
      );
    return syncFirebaseUser(fresh);
  };
  const resendVerification = async () => {
    if (databaseAuthMode) throw new Error('Database accounts do not use email verification.');
    const fb = firebaseAuth?.currentUser;
    if (!fb) throw new Error('Sign in to resend the verification email.');
    await sendEmailVerification(fb, { url: `${window.location.origin}/auth/action` });
  };
  const sendPasswordReset = async (email: string) => {
    if (databaseAuthMode)
      throw new Error('Database password resets must be handled by an administrator.');
    if (!firebaseAuth) throw new Error('Firebase is not configured.');
    try {
      await sendPasswordResetEmail(firebaseAuth, email.trim().toLowerCase(), {
        url: `${window.location.origin}/login`
      });
    } catch (error: any) {
      if (error?.code === 'auth/user-not-found') return;
      throw new Error(firebaseMessage(error));
    }
  };
  const completeProfile = async (name: string, phone: string) => {
    if (databaseAuthMode) throw new Error('Database accounts do not use profile completion.');
    const fb = firebaseAuth?.currentUser;
    if (!fb) throw new Error('Your sign-in session expired. Sign in again.');
    if (!fb.emailVerified) throw new Error('Verify your email before completing your profile.');
    const result = await api<AuthResponse>('/auth/complete-profile', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await fb.getIdToken()}` },
      body: JSON.stringify({ name: name.trim(), phone: phone.trim() })
    });
    setToken(result.accessToken || result.token);
    setUser(result.user);
    setPendingProfile(null);
    return result.user;
  };
  const updateProfile = async (changes: { name?: string; phone?: string | null }) => {
    const result = await patch<User>('/profile', changes);
    setUser(result);
    if (changes.name && firebaseAuth?.currentUser)
      await updateFirebaseProfile(firebaseAuth.currentUser, { displayName: changes.name });
    return result;
  };
  const updateAvatar = async (image: string) => {
    const result = await post<{ avatar: string }>('/profile/avatar', { image });
    setUser(u =>u ? { ...u, avatar: result.avatar } : u);
    return result.avatar;
  };
  const logout = async () => {
    exchangeRef.current?.cancel(); sessionOwner.current = null; accountRef.current = null;
    try { await api('/auth/logout', { method: 'POST', body: '{}', signal: AbortSignal.timeout(8000) }); }
    catch { window.dispatchEvent(new CustomEvent('zawana-toast', { detail: 'Signed out locally. The server session could not be revoked while the connection is unavailable.' })); }
    finally {
      setToken(null); setUser(null); setPendingProfile(null); setSessionError(''); setCanRetrySession(false);
      if (!databaseAuthMode && firebaseAuth) await signOut(firebaseAuth);
    }
  };
  const refreshUser = async (options?: { cached?: boolean }) => {
    if (options?.cached && accountRef.current && getToken()) return accountRef.current;
    try {
      const result = await api<User>('/auth/me', { signal: AbortSignal.timeout(25000) });
      accountRef.current = result; setUser(result); return result;
    } catch (error) { reportSessionError(error); return null; }
  };
  const retrySession = async (): Promise<SignInResult> => {
    const fb = firebaseAuth?.currentUser;
    if (!fb) throw new Error('Sign in with Google again to continue.');
    setSessionError(''); setCanRetrySession(false);
    sessionOwner.current = null;
    try { return await syncFirebaseUser(fb); }
    finally { setLoading(false); }
  };

  const mfaHint = mfaResolver?.hints.find(
    item => item.factorId === PhoneMultiFactorGenerator.FACTOR_ID
  ) as any;
  return <C.Provider
    value={{
      user,
      loading,
      firebaseConfigured: databaseAuthMode || firebaseConfigured,
      authMode: databaseAuthMode ? 'database' : 'firebase',
      pendingProfile,
      verificationEmail,
      mfaRequired: !!mfaResolver,
      mfaPhone: mfaHint?.phoneNumber || '',
      sendMfaCode,
      completeMfa,
      login,
      googleLogin,
      signup,
      checkVerification,
      resendVerification,
      sendPasswordReset,
      completeProfile,
      updateProfile,
      updateAvatar,
      logout,
      refreshUser,
      sessionError,
      canRetrySession,
      retrySession
    }}
  >
    {children}
  </C.Provider>;
}

export const useAuth = () => {
  const c = useContext(C);
  if (!c) throw Error('AuthProvider missing');
  return c
};
