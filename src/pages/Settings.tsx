import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Button, Card, Page } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { get, setToken } from '../api';
import { firebaseAuth } from '../services/firebase';
import { EmailAuthProvider, GoogleAuthProvider, multiFactor, reauthenticateWithCredential, reauthenticateWithPopup } from 'firebase/auth';

type MfaState={enrolled:{uid:string;displayName?:string|null;factorId:string}[];required:boolean};

export function Settings(){
 const {user,authMode,sendPasswordReset,logout}=useAuth();
 const [mfa,setMfa]=useState<MfaState>({enrolled:[],required:false});
 const [password,setPassword]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');

 const load=async()=>{if(authMode==='database'){setMfa({enrolled:[],required:false});return}try{setMfa(await get<MfaState>('/auth/mfa/status'))}catch(e:any){setError(e.message||'Could not load security status.')}};
 useEffect(()=>{void load()},[]);

 const removeFactor=async()=>{
  setBusy(true);setError('');setNotice('');
  try{
   const current=firebaseAuth?.currentUser;
   if(!current)throw new Error('Sign in again to change security settings.');
   const emailProvider=current.providerData.some(p=>p.providerId==='password');
   if(emailProvider){
    if(!password)throw new Error('Enter your current password to remove the enrolled phone factor.');
    if(!current.email)throw new Error('This Firebase account has no email address.');
    await reauthenticateWithCredential(current,EmailAuthProvider.credential(current.email,password));
   }else await reauthenticateWithPopup(current,new GoogleAuthProvider());
   for(const factor of multiFactor(current).enrolledFactors)await multiFactor(current).unenroll(factor);
   setPassword('');
   if(firebaseAuth?.currentUser)setToken(await firebaseAuth.currentUser.getIdToken(true));
   await load();
   setNotice('Two-factor verification was removed from this Firebase account.');
  }catch(e:any){setError(e.message||'Could not remove two-factor verification.')}finally{setBusy(false)}
 };

 const resetPassword=async()=>{setBusy(true);setError('');setNotice('');try{await sendPasswordReset(user?.email||'');setNotice('If the address can be recovered, Firebase will send a password reset link.')}catch(e:any){setError(e.message||'Could not send the password reset email.')}finally{setBusy(false)}};

 return <Page title="Settings" eyebrow="Account and preferences"><div className="grid max-w-4xl gap-5">
  <Card className="p-6"><div className="flex items-start gap-4"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-zawana-accent/15"><ShieldCheck/></span><div><h2 className="text-lg font-black">Account</h2><p className="mt-1 text-sm text-zawana-500">{user?.email} · {user?.role?.replaceAll('_',' ')}</p><Link className="mt-3 inline-block text-sm font-bold text-zawana-accent" to="/profile">Edit your profile</Link></div></div></Card>
  {authMode==='firebase'&&<Card className="p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-black">Two-factor authentication</h2><p className="mt-1 max-w-2xl text-sm text-zawana-500">Zawana no longer requires two-factor authentication for staff access. A factor already enrolled directly on your Firebase account can still be removed here.</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${mfa.enrolled.length?'bg-amber-50 text-amber-800':'bg-zawana-950/5 text-zawana-500'}`}>{mfa.enrolled.length?'Enrolled in Firebase':'Not enrolled'}</span></div>
   {mfa.enrolled.length>0&&<div className="mt-5 grid gap-3 rounded-xl bg-zawana-950/[.03] p-4 text-sm"><p>Your Firebase account has an enrolled second factor. Firebase may continue asking for its code at sign-in until you remove it.</p>{firebaseAuth?.currentUser?.providerData.some(p=>p.providerId==='password')&&<label className="font-bold">Current password<input type="password" autoComplete="current-password" className="mt-2 w-full" value={password} onChange={e=>setPassword(e.target.value)}/></label>}<Button variant="secondary" disabled={busy} onClick={()=>void removeFactor()}>{busy?'Please wait…':'Remove enrolled factor'}</Button></div>}
  </Card>}
  <Card className="p-6"><h2 className="text-lg font-black">Password</h2><p className="mt-1 text-sm text-zawana-500">{authMode==='database'?'Database passwords are managed by Zawana administrators.':'Password changes use Firebase’s secure recovery flow.'}</p>{authMode==='firebase'&&<Button variant="secondary" className="mt-4" disabled={busy} onClick={()=>void resetPassword()}>Send password reset link</Button>}</Card>
  <Card className="p-6"><h2 className="text-lg font-black">Notifications</h2><p className="mt-1 text-sm text-zawana-500">Zawana currently uses the notification inbox. Per-category delivery preferences are not configured.</p></Card>
  <Card className="flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center"><div><h2 className="font-black">Sign out</h2><p className="mt-1 text-sm text-zawana-500">End this {authMode==='database'?'database':'Firebase'} session on this device.</p></div><Button variant="danger" onClick={()=>void logout()}>Sign out</Button></Card>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
 </div></Page>;
}
