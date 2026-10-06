import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
  getMultiFactorResolver, PhoneAuthProvider, PhoneMultiFactorGenerator, RecaptchaVerifier,
  type MultiFactorResolver,
  type User as FirebaseUser,
} from 'firebase/auth';
import type { User } from '../types';
import { get, post, patch, setToken, getToken } from '../api';
import { firebaseAuth, firebaseConfigured, firebaseReady, googleProvider } from '../services/firebase';
import { databaseAuthMode } from '../services/authMode';

type ProfileDraft={name:string;email:string;avatar:string|null;phone?:string};
type SignInResult='ready'|'profile'|'verify'|'mfa';
type Ctx={
  user:User|null;loading:boolean;firebaseConfigured:boolean;authMode:'database'|'firebase';pendingProfile:ProfileDraft|null;verificationEmail:string;
  mfaRequired:boolean;mfaPhone:string;sendMfaCode:()=>Promise<void>;completeMfa:(code:string)=>Promise<SignInResult>;
  login:(email:string,password:string)=>Promise<SignInResult>;
  googleLogin:()=>Promise<SignInResult>;
  signup:(name:string,email:string,phone:string,password:string)=>Promise<SignInResult>;
  checkVerification:()=>Promise<SignInResult>;
  resendVerification:()=>Promise<void>;
  sendPasswordReset:(email:string)=>Promise<void>;
  completeProfile:(name:string,phone:string)=>Promise<User>;
  updateProfile:(changes:{name?:string;phone?:string|null})=>Promise<User>;
  updateAvatar:(image:string)=>Promise<string>;
  logout:()=>Promise<void>;
  refreshUser:()=>Promise<User|null>;
};

const C=createContext<Ctx|null>(null);
const firebaseMessage=(error:any)=>{
  const known:Record<string,string>={
    'auth/invalid-credential':'Firebase did not accept this email and password. If an Admin created this account before automatic Firebase linking was enabled, ask them to edit it in Users and save a new password. Otherwise use Forgot password and check that you are signing into the right Firebase project.',
    'auth/user-not-found':'No Firebase login exists for this email. For an older Admin-created account, ask an Admin to edit it in Users and save a new password to link its login.',
    'auth/wrong-password':'Firebase did not accept this password. Use Forgot password, or ask an Admin to edit this older account in Users and save a new password to link its login.',
    'auth/email-already-in-use':'An account with this email already exists. Sign in or reset your password.',
    'auth/operation-not-allowed':'Email and password sign-in is disabled for this Firebase project. Enable the Email/Password provider in Firebase Authentication settings.',
    'auth/configuration-not-found':'Firebase Authentication is not configured for this project yet. Enable Email/Password under Firebase Console → Authentication → Sign-in method.',
    'auth/invalid-api-key':'The Firebase web API key is invalid. Copy the web app configuration from the same Firebase project and restart the frontend.',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.':'The Firebase web API key is invalid. Copy the web app configuration from the same Firebase project and restart the frontend.',
    'auth/unauthorized-domain':'This site is not authorized for Firebase sign-in. Add its hostname under Firebase Authentication → Settings → Authorized domains.',
    'auth/weak-password':'Choose a password with at least 8 characters.',
    'auth/invalid-email':'Enter a valid email address.',
    'auth/popup-closed-by-user':'Google sign-in was closed before it finished.',
    'auth/popup-blocked':'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
    'auth/cancelled-popup-request':'A Google sign-in window is already open. Finish it or close it before retrying.',
    'auth/account-exists-with-different-credential':'This email already uses another sign-in method. Sign in with that method first, then link Google from account settings.',
    'auth/too-many-requests':'Too many attempts. Wait a little and try again.',
    'auth/network-request-failed':'Network error. Check your connection and try again.',
  };
  const code=String(error?.code||'').toLowerCase();
  if(known[code])return known[code];
  if(code==='auth/invalid-api-key'||code.includes('api-key-not-valid'))return 'The Firebase web API key is invalid. Copy the web app configuration from the same Firebase project and restart the frontend.';
  const message=String(error?.message||'');
  if(message.startsWith('Firebase: Error'))return 'Firebase Authentication could not complete the request. Check that Authentication and the selected sign-in provider are enabled for this project.';
  return message||'Authentication could not be completed. Please try again.';
};

export function AuthProvider({children}:{children:ReactNode}) {
  const [user,setUser]=useState<User|null>(null);
  const [loading,setLoading]=useState(true);
  const [pendingProfile,setPendingProfile]=useState<ProfileDraft|null>(null);
  const [verificationEmail,setVerificationEmail]=useState('');
  const [mfaResolver,setMfaResolver]=useState<MultiFactorResolver|null>(null);
  const [mfaVerificationId,setMfaVerificationId]=useState('');
  const syncFlight=useRef<Promise<SignInResult>|null>(null);

  const syncFirebaseUser=useCallback(async(fb:FirebaseUser):Promise<SignInResult>=>{
    if(!fb.emailVerified){setVerificationEmail(fb.email||'');return 'verify';}
    if(syncFlight.current)return syncFlight.current;
    syncFlight.current=(async()=>{
      setToken(await fb.getIdToken());
      try{
        const result=await post<any>('/auth/session',{});
        setUser(result.user);setPendingProfile(null);setVerificationEmail('');return 'ready';
      }catch(error:any){
        if(error?.status===428){setUser(null);setPendingProfile(error.details?.profile||{name:fb.displayName||'',email:fb.email||'',avatar:fb.photoURL});return 'profile';}
        throw error;
      }
    })();
    try{return await syncFlight.current;}finally{syncFlight.current=null;}
  },[]);

  useEffect(()=>{
    if(databaseAuthMode){
      const token=getToken();
      if(!token){setLoading(false);return;}
      void get<User>('/auth/me').then(result=>setUser(result)).catch(()=>{setToken(null);setUser(null)}).finally(()=>setLoading(false));
      return;
    }
    if(!firebaseAuth){setLoading(false);return;}
    let alive=true;
    void firebaseReady.then(()=>onAuthStateChanged(firebaseAuth!,async fb=>{
      if(!alive)return;
      if(!fb){setToken(null);setUser(null);setPendingProfile(null);setVerificationEmail('');setLoading(false);return;}
      try{setToken(await fb.getIdToken());if(fb.emailVerified)await syncFirebaseUser(fb);else setVerificationEmail(fb.email||'');}
      catch{setUser(null);}
      finally{if(alive)setLoading(false);}
    }));
    return()=>{alive=false;};
  },[syncFirebaseUser]);

  const login=async(email:string,password:string):Promise<SignInResult>=>{
    if(databaseAuthMode){
      const result=await post<{user:User;token:string}>('/auth/login',{username:email.trim(),password});
      setToken(result.token);setUser(result.user);setPendingProfile(null);return 'ready';
    }
    if(!firebaseAuth)throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values and reload.');
    await firebaseReady;
    try{const credential=await signInWithEmailAndPassword(firebaseAuth,email.trim().toLowerCase(),password);return await syncFirebaseUser(credential.user);}
    catch(error:any){if(error?.status===428)return 'profile';if(error?.code==='auth/multi-factor-auth-required'){setMfaResolver(getMultiFactorResolver(firebaseAuth!,error));setMfaVerificationId('');return 'mfa';}throw new Error(firebaseMessage(error));}
  };
  const googleLogin=async():Promise<SignInResult>=>{
    if(databaseAuthMode)throw new Error('Google sign-in is disabled while database authentication is selected.');
    if(!firebaseAuth)throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values and reload.');
    await firebaseReady;
    try{const credential=await signInWithPopup(firebaseAuth,googleProvider);return await syncFirebaseUser(credential.user);}
    catch(error:any){if(error?.status===428)return 'profile';if(error?.code==='auth/multi-factor-auth-required'){setMfaResolver(getMultiFactorResolver(firebaseAuth!,error));setMfaVerificationId('');return 'mfa';}throw new Error(firebaseMessage(error));}
  };
  const sendMfaCode=async()=>{
    if(!firebaseAuth||!mfaResolver)throw new Error('Restart sign-in to request a verification code.');
    const hint=mfaResolver.hints.find(item=>item.factorId===PhoneMultiFactorGenerator.FACTOR_ID);
    if(!hint)throw new Error('This account has no supported phone factor. Contact an administrator to recover access.');
    const verifier=new RecaptchaVerifier(firebaseAuth,'zawana-signin-recaptcha',{size:'invisible'});
    const verificationId=await new PhoneAuthProvider(firebaseAuth).verifyPhoneNumber({multiFactorHint:hint,session:mfaResolver.session},verifier);
    setMfaVerificationId(verificationId);
  };
  const completeMfa=async(code:string):Promise<SignInResult>=>{
    if(!mfaResolver||!mfaVerificationId)throw new Error('Request a verification code first.');
    const credential=PhoneAuthProvider.credential(mfaVerificationId,code.trim());
    const result=await mfaResolver.resolveSignIn(PhoneMultiFactorGenerator.assertion(credential));
    setMfaResolver(null);setMfaVerificationId('');
    return syncFirebaseUser(result.user);
  };
  const signup=async(name:string,email:string,phone:string,password:string):Promise<SignInResult>=>{
    if(databaseAuthMode){
      const result=await post<{user:User;token:string}>('/auth/register',{name,email:email.trim().toLowerCase(),phone,password});
      setToken(result.token);setUser(result.user);setPendingProfile(null);return 'ready';
    }
    if(!firebaseAuth)throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values and reload.');
    await firebaseReady;
    try{
      const credential=await createUserWithEmailAndPassword(firebaseAuth,email.trim().toLowerCase(),password);
      await updateFirebaseProfile(credential.user,{displayName:name.trim()});
      await sendEmailVerification(credential.user,{url:`${window.location.origin}/auth/action`});
      setVerificationEmail(credential.user.email||email);
      setPendingProfile({name:name.trim(),email:credential.user.email||email,phone:phone.trim(),avatar:credential.user.photoURL});
      return 'verify';
    }catch(error:any){throw new Error(firebaseMessage(error));}
  };
  const checkVerification=async():Promise<SignInResult>=>{
    if(databaseAuthMode)throw new Error('Database accounts do not use email verification. Sign in with your username and password.');
    const fb=firebaseAuth?.currentUser;if(!fb)throw new Error('Sign in again after verifying your email.');
    await fb.reload();const fresh=firebaseAuth!.currentUser!;
    if(!fresh.emailVerified)throw new Error('Email verification is not complete yet. Open the latest verification email and try again.');
    return syncFirebaseUser(fresh);
  };
  const resendVerification=async()=>{if(databaseAuthMode)throw new Error('Database accounts do not use email verification.');const fb=firebaseAuth?.currentUser;if(!fb)throw new Error('Sign in to resend the verification email.');await sendEmailVerification(fb,{url:`${window.location.origin}/auth/action`});};
  const sendPasswordReset=async(email:string)=>{if(databaseAuthMode)throw new Error('Database password resets must be handled by an administrator.');if(!firebaseAuth)throw new Error('Firebase is not configured.');try{await sendPasswordResetEmail(firebaseAuth,email.trim().toLowerCase(),{url:`${window.location.origin}/login`});}catch(error:any){if(error?.code==='auth/user-not-found')return;throw new Error(firebaseMessage(error));}};
  const completeProfile=async(name:string,phone:string)=>{
    if(databaseAuthMode)throw new Error('Database accounts do not use profile completion.');
    const fb=firebaseAuth?.currentUser;if(!fb)throw new Error('Your sign-in session expired. Sign in again.');
    if(!fb.emailVerified)throw new Error('Verify your email before completing your profile.');
    setToken(await fb.getIdToken());
    const result=await post<any>('/auth/complete-profile',{name:name.trim(),phone:phone.trim()});
    setUser(result.user);setPendingProfile(null);return result.user;
  };
  const updateProfile=async(changes:{name?:string;phone?:string|null})=>{const result=await patch<User>('/profile',changes);setUser(result);if(changes.name&&firebaseAuth?.currentUser)await updateFirebaseProfile(firebaseAuth.currentUser,{displayName:changes.name});return result;};
  const updateAvatar=async(image:string)=>{const result=await post<{avatar:string}>('/profile/avatar',{image});setUser(u=>u?{...u,avatar:result.avatar}:u);return result.avatar;};
  const logout=async()=>{setToken(null);setUser(null);setPendingProfile(null);if(!databaseAuthMode&&firebaseAuth)await signOut(firebaseAuth);};
  const refreshUser=async()=>{if(databaseAuthMode){try{const result=await get<User>('/auth/me');setUser(result);return result}catch{return null}}if(!firebaseAuth?.currentUser)return null;await firebaseAuth.currentUser.reload();const fb=firebaseAuth.currentUser;setToken(await fb.getIdToken(true));try{const result=await post<any>('/auth/session',{});setUser(result.user);return result.user as User;}catch{return null;}};

  const mfaHint=mfaResolver?.hints.find(item=>item.factorId===PhoneMultiFactorGenerator.FACTOR_ID) as any;
  return <C.Provider value={{user,loading,firebaseConfigured:databaseAuthMode||firebaseConfigured,authMode:databaseAuthMode?'database':'firebase',pendingProfile,verificationEmail,mfaRequired:!!mfaResolver,mfaPhone:mfaHint?.phoneNumber||'',sendMfaCode,completeMfa,login,googleLogin,signup,checkVerification,resendVerification,sendPasswordReset,completeProfile,updateProfile,updateAvatar,logout,refreshUser}}>{children}</C.Provider>;
}
export const useAuth=()=>{const c=useContext(C);if(!c)throw Error('AuthProvider missing');return c};
